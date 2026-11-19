import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { designCaptureCredentials, isDesignCaptureEnabled } from '../design-capture';
import { isColdStartHoldTitle } from '../design-capture/readCaptureIntentFile';
import { playerFacingDisplayName } from '../identity/platformPlayerId';
import { deleteAccountWithSession } from './auth/accountDeleteClient';
import { createAuthClient } from './auth/createAuthClient';
import type { AuthPort, AuthSession } from './auth/AuthPort';
import { clearDeviceFallbackId } from './auth/deviceFallbackStore';
import { runSilentFirstLaunchAuth } from './auth/silentFirstLaunchAuth';
import { readSupabasePublicConfig } from './auth/supabasePublicConfig';
import { createLoadoutSaveClient } from './loadout/createLoadoutSaveClient';
import type { LoadoutSavePort } from './loadout/LoadoutSavePort';
import {
  beginSave,
  confirmSave,
  createLoadoutPreviewState,
  createUnavailableLoadoutState,
  discardPending,
  failSave,
  markHydrationUnavailable,
  setPendingLoadout,
  type LoadoutPreviewState,
} from './loadout/loadoutState';
import { loadoutSavePlayerMessage } from './loadout/loadoutSaveErrors';
import type { OwnedBotSummary } from './loadout/loadoutTypes';
import { withUpdatedPaint, withUpdatedShape, withUpdatedWeapon } from './loadout/proofCatalogue';
import type { ShapeSlot } from '../assembler/shapes';
import { ensureRuntimePacksBestEffort } from '../atlas/atlasPackRuntime';
import { DEFAULT_PLAYER_BOT_CAP } from '../supabase/multiBotRpcs';

export type AuthBootError = {
  readonly code: string;
  readonly message: string;
};

export type GarageSessionContextValue = {
  readonly authKind: AuthPort['kind'];
  readonly session: AuthSession | null;
  readonly booting: boolean;
  /** Silent first-launch / restore failure — offline/session UX (never DEV AuthEntry). */
  readonly authBootError: AuthBootError | null;
  /** Design-capture cold-start: hold launch-title silhouette (skip auto sign-in). */
  readonly coldStartHoldTitle: boolean;
  /**
   * True once the cold-start Documents probe finished (or design-capture is off).
   * GarageRoot must not hide the native splash until this is true — otherwise the
   * boot title path can release splash before hold-title engages (iOS title-only strip).
   */
  readonly coldStartIntentReady: boolean;
  readonly loadout: LoadoutPreviewState;
  readonly canProgress: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Retry silent first-launch auth after a boot error. */
  retrySilentAuth: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * R5: permanently delete the signed-in account (Edge soft-delete + Auth ban).
   * Clears session + device-fallback. Holds silent re-auth until
   * `acknowledgeAccountDeleted` so the success notice can show.
   */
  deleteAccount: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** True after a successful delete until the player taps Continue. */
  readonly accountDeletedNotice: boolean;
  /** Clear the deleted notice and allow silent first-launch auth. */
  acknowledgeAccountDeleted: () => void;
  retryHydration: () => Promise<void>;
  selectPaint: (paintId: string) => void;
  selectWeapon: (weaponId: string) => void;
  /** A4 head / body / arms / legs — catalogue id or UI alias. */
  selectShape: (slot: ShapeSlot, shapeId: string) => void;
  discard: () => void;
  save: () => Promise<boolean>;
  /** D7 nameplate — persist via rename_owned_character; survives remount. */
  renameDisplayName: (displayName: string) => Promise<boolean>;
  /** E4 — owned bots for Ludus carousel (cap from server). */
  readonly ownedBots: readonly OwnedBotSummary[];
  readonly botCap: number;
  refreshOwnedBots: () => Promise<void>;
  selectActiveBot: (characterId: string) => Promise<boolean>;
  suggestBotName: () => Promise<string | null>;
  createOwnedBot: (input: {
    displayName: string;
    paint: string;
    weapon: string;
  }) => Promise<{ ok: true; characterId: string } | { ok: false; message: string }>;
};

const GarageSessionContext = createContext<GarageSessionContextValue | null>(null);

export function GarageSessionProvider(props: {
  children: React.ReactNode;
  auth?: AuthPort;
  loadouts?: LoadoutSavePort;
}): React.ReactElement {
  const auth = useMemo(() => props.auth ?? createAuthClient(), [props.auth]);
  const loadouts = useMemo(() => props.loadouts ?? createLoadoutSaveClient(), [props.loadouts]);

  const [session, setSession] = useState<AuthSession | null>(null);
  const [booting, setBooting] = useState(true);
  const [coldStartHoldTitle, setColdStartHoldTitle] = useState(false);
  const [coldStartIntentReady, setColdStartIntentReady] = useState(() => !isDesignCaptureEnabled());
  const [authBootError, setAuthBootError] = useState<AuthBootError | null>(null);
  const [accountDeletedNotice, setAccountDeletedNotice] = useState(false);
  const [loadout, setLoadout] = useState<LoadoutPreviewState>(() =>
    createUnavailableLoadoutState(),
  );
  const [ownedBots, setOwnedBots] = useState<readonly OwnedBotSummary[]>([]);
  const [botCap, setBotCap] = useState(DEFAULT_PLAYER_BOT_CAP);
  /** Latest-wins token for in-place Ludus select (D5 carousel snaps). */
  const selectEpochRef = useRef(0);
  // Equip may await rename then save in one press; read latest snapshot so
  // save/rename guards are not stuck on a stale useMemo closure.
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;

  const refreshOwnedBots = useCallback(async () => {
    const current = await auth.getSession();
    if (!current) {
      setOwnedBots([]);
      setBotCap(DEFAULT_PLAYER_BOT_CAP);
      return;
    }
    const listed = await loadouts.listOwnedBots(current.accessToken);
    if (!listed.ok) {
      return;
    }
    setOwnedBots(listed.bots);
    setBotCap(listed.cap);
  }, [auth, loadouts]);

  const hydrate = useCallback(
    async (opts?: { selectEpoch?: number }) => {
      const stillCurrent = () =>
        opts?.selectEpoch === undefined || opts.selectEpoch === selectEpochRef.current;

      const current = await auth.getSession();
      if (!stillCurrent()) return;
      setSession(current);
      if (!current) {
        setLoadout(createUnavailableLoadoutState());
        setOwnedBots([]);
        setBotCap(DEFAULT_PLAYER_BOT_CAP);
        setBooting(false);
        return;
      }

      const listed = await loadouts.listOwnedBots(current.accessToken);
      if (!stillCurrent()) return;
      if (listed.ok) {
        setOwnedBots(listed.bots);
        setBotCap(listed.cap);
      }

      const owned = await loadouts.resolveOwnedCharacter(current.accessToken);
      if (!stillCurrent()) return;
      if (!owned.ok) {
        if (isDesignCaptureEnabled()) {
          console.warn(
            `BOTORE_CAPTURE_HYDRATE_ERROR:owned code=${owned.code} message=${owned.message}`,
          );
        }
        setLoadout((prev) =>
          markHydrationUnavailable(prev, {
            accountId: current.userId,
            characterId: null,
            message: owned.message,
            code: owned.code,
          }),
        );
        setBooting(false);
        return;
      }

      const fetched = await loadouts.fetchCurrent({
        characterId: owned.character.characterId,
        accessToken: current.accessToken,
      });
      if (!stillCurrent()) return;
      if (fetched.ok) {
        if (isDesignCaptureEnabled()) {
          console.log(
            `BOTORE_CAPTURE_HYDRATE_OK:characterId=${owned.character.characterId} version=${fetched.snapshot.loadoutVersionId}`,
          );
        }
        setLoadout(
          createLoadoutPreviewState({
            accountId: current.userId,
            characterId: owned.character.characterId,
            // C16: never hold platform player ids in garage UI state.
            // C17: never fall back to character UUID / player-hero as a label.
            displayName: playerFacingDisplayName(owned.character.displayName),
            confirmedLoadout: fetched.snapshot.loadout,
            confirmedVersionId: fetched.snapshot.loadoutVersionId,
            atlasVersion: fetched.snapshot.atlasVersion,
          }),
        );
        // C13: teach ensurePacks for stable bots (download/cache; never blocks hydrate).
        void ensureRuntimePacksBestEffort({
          config: readSupabasePublicConfig(),
          accessToken: current.accessToken,
          atlasVersion: fetched.snapshot.atlasVersion,
          loadouts: [fetched.snapshot.loadout],
          includeArena: false,
          includeFx: false,
        });
      } else {
        if (isDesignCaptureEnabled()) {
          console.warn(
            `BOTORE_CAPTURE_HYDRATE_ERROR:loadout characterId=${owned.character.characterId} code=${fetched.code} message=${fetched.message}`,
          );
        }
        setLoadout((prev) =>
          markHydrationUnavailable(prev, {
            accountId: current.userId,
            characterId: owned.character.characterId,
            displayName: playerFacingDisplayName(owned.character.displayName),
            message: fetched.message,
            code: fetched.code,
          }),
        );
      }
      setBooting(false);
    },
    [auth, loadouts],
  );

  const captureAutoSignInStarted = useRef(false);
  const silentAuthStarted = useRef(false);

  const runSilentFirstLaunch = useCallback(async () => {
    if (auth.kind === 'unavailable') {
      // GarageRoot shows PlayableMisconfiguredScreen for unavailable adapters.
      setAuthBootError(null);
      setBooting(false);
      return;
    }
    setBooting(true);
    setAuthBootError(null);
    try {
      const result = await runSilentFirstLaunchAuth(auth);
      if (!result.ok) {
        setAuthBootError({ code: result.code, message: result.message });
        setBooting(false);
        return;
      }
      setSession(result.session);
      await hydrate();
    } catch (err) {
      // Defense in depth: never let an unexpected throw on the C12 silent-auth
      // path become an unhandled Hermes fatal (release splash→close).
      setAuthBootError({
        code: 'silent_auth_exception',
        message: err instanceof Error ? err.message : String(err),
      });
      setBooting(false);
    }
  }, [auth, hydrate]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Detect cold-start hold-title ASAP so we never flash AuthEntry / error chrome.
  // Always mark intentReady when the probe settles — including hold=false — so splash
  // release is not gated forever when the marker file is absent.
  useEffect(() => {
    if (!isDesignCaptureEnabled()) {
      setColdStartIntentReady(true);
      return;
    }
    let mounted = true;
    void isColdStartHoldTitle()
      .then((hold) => {
        if (!mounted) return;
        if (hold) {
          setColdStartHoldTitle(true);
          setBooting(false);
          console.log('BOTORE_CAPTURE_COLD_START_HOLD_TITLE:1');
        }
        setColdStartIntentReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setColdStartIntentReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * C7 design-capture builds auto-enter with seed credentials so capture scripts
   * can deep-link without AuthEntry. Opt-in only; never for store builds.
   * Cold-start hold-title skips auto sign-in (C7c).
   */
  useEffect(() => {
    if (!isDesignCaptureEnabled()) return;
    if (auth.kind === 'unavailable') return;
    if (captureAutoSignInStarted.current) return;
    if (coldStartHoldTitle) return;
    if (booting || session) return;
    captureAutoSignInStarted.current = true;
    void (async () => {
      if (await isColdStartHoldTitle()) {
        setColdStartHoldTitle(true);
        setColdStartIntentReady(true);
        console.log('BOTORE_CAPTURE_COLD_START_HOLD_TITLE:1');
        return;
      }
      setColdStartHoldTitle(false);
      setColdStartIntentReady(true);
      setAuthBootError(null);
      const creds = designCaptureCredentials();
      const result = await auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (!result.ok) {
        captureAutoSignInStarted.current = false;
        setAuthBootError({ code: result.code, message: result.message });
        console.warn(
          `BOTORE_CAPTURE_AUTH_ERROR:sign_in_failed email=${creds.email} message=${result.message}`,
        );
        return;
      }
      console.log(`BOTORE_CAPTURE_AUTH_OK:email=${creds.email}`);
      setBooting(true);
      setSession(result.session);
      await hydrate();
    })();
  }, [auth, booting, coldStartHoldTitle, hydrate, session]);

  /**
   * C12 first-run: restore session, or silent web-preview Development sign-in /
   * native identity plug-in seam. AuthEntry is never on this path.
   * Design-capture keeps the seed password path above.
   */
  useEffect(() => {
    if (isDesignCaptureEnabled()) return;
    if (coldStartHoldTitle) return;
    // M4: hold silent re-auth until the player acknowledges the deleted notice.
    if (accountDeletedNotice) return;
    if (session || authBootError) return;
    if (booting) return;
    if (silentAuthStarted.current) return;
    silentAuthStarted.current = true;
    void runSilentFirstLaunch();
  }, [
    accountDeletedNotice,
    authBootError,
    booting,
    coldStartHoldTitle,
    runSilentFirstLaunch,
    session,
  ]);

  const value = useMemo<GarageSessionContextValue>(
    () => ({
      authKind: auth.kind,
      session,
      booting,
      authBootError,
      coldStartHoldTitle,
      coldStartIntentReady,
      loadout,
      canProgress: loadout.hydration === 'ready' && loadout.confirmedLoadout !== null,
      signIn: async (email, password) => {
        const result = await auth.signInWithPassword({ email, password });
        if (!result.ok) return { ok: false, message: result.message };
        setAuthBootError(null);
        setBooting(true);
        setSession(result.session);
        await hydrate();
        return { ok: true };
      },
      retrySilentAuth: async () => {
        silentAuthStarted.current = true;
        captureAutoSignInStarted.current = false;
        await runSilentFirstLaunch();
      },
      signOut: async () => {
        await auth.signOut();
        setSession(null);
        setLoadout(createUnavailableLoadoutState());
        setOwnedBots([]);
        setBotCap(DEFAULT_PLAYER_BOT_CAP);
        setAuthBootError(null);
        setAccountDeletedNotice(false);
        silentAuthStarted.current = false;
        // Re-enter silent first-launch on the first-run path (never AuthEntry).
        if (!isDesignCaptureEnabled()) {
          setBooting(false);
        }
      },
      accountDeletedNotice,
      acknowledgeAccountDeleted: () => {
        setAccountDeletedNotice(false);
        silentAuthStarted.current = false;
        if (!isDesignCaptureEnabled()) {
          setBooting(false);
        }
      },
      deleteAccount: async () => {
        const current = session ?? (await auth.getSession());
        if (!current) {
          return { ok: false as const, message: 'Not signed in' };
        }
        const config = readSupabasePublicConfig();
        if (!config) {
          // Dev / unavailable adapters: local sign-out stands in for delete.
          if (auth.kind !== 'supabase') {
            await clearDeviceFallbackId();
            await auth.signOut();
            setSession(null);
            setLoadout(createUnavailableLoadoutState());
            setOwnedBots([]);
            setBotCap(DEFAULT_PLAYER_BOT_CAP);
            setAuthBootError(null);
            // Hold silent re-auth until Continue (same as real delete).
            setAccountDeletedNotice(true);
            silentAuthStarted.current = true;
            return { ok: true as const };
          }
          return { ok: false as const, message: 'Account deletion is unavailable in this build' };
        }
        const result = await deleteAccountWithSession(config, current.accessToken);
        if (!result.ok) {
          return { ok: false as const, message: result.message };
        }
        await clearDeviceFallbackId();
        await auth.signOut();
        setSession(null);
        setLoadout(createUnavailableLoadoutState());
        setOwnedBots([]);
        setBotCap(DEFAULT_PLAYER_BOT_CAP);
        setAuthBootError(null);
        // M4: show success until Continue before silent auth mints a fresh account.
        setAccountDeletedNotice(true);
        silentAuthStarted.current = true;
        return { ok: true as const };
      },
      retryHydration: async () => {
        setBooting(true);
        await hydrate();
      },
      selectPaint: (paintId) => {
        setLoadout((s) => {
          if (!s.pendingLoadout) return s;
          return setPendingLoadout(s, withUpdatedPaint(s.pendingLoadout, paintId));
        });
      },
      selectWeapon: (weaponId) => {
        setLoadout((s) => {
          if (!s.pendingLoadout) return s;
          return setPendingLoadout(s, withUpdatedWeapon(s.pendingLoadout, weaponId));
        });
      },
      selectShape: (slot, shapeId) => {
        setLoadout((s) => {
          if (!s.pendingLoadout) return s;
          return setPendingLoadout(s, withUpdatedShape(s.pendingLoadout, slot, shapeId));
        });
      },
      discard: () => setLoadout((s) => discardPending(s)),
      save: async () => {
        const current = await auth.getSession();
        if (!current) {
          setSession(null);
          // F8: keep last confirmed; surface auth-expired so Customise is not silent.
          setLoadout((s) =>
            failSave(
              s,
              loadoutSavePlayerMessage({
                code: 'unauthenticated',
                message: 'Session expired. Sign in again to save.',
              }),
              'unauthenticated',
            ),
          );
          return false;
        }
        const snap = loadoutRef.current;
        if (snap.saving) {
          return false;
        }
        if (
          snap.hydration !== 'ready' ||
          !snap.characterId ||
          !snap.pendingLoadout ||
          !snap.dirty
        ) {
          // Never silent when the player asked to save but state is blocked.
          if (snap.dirty) {
            setLoadout((s) =>
              failSave(
                s,
                loadoutSavePlayerMessage({
                  code: 'save_blocked',
                  message: 'Could not save changes. Server-confirmed loadout is unavailable.',
                }),
                'save_blocked',
              ),
            );
          }
          return false;
        }
        const pending = snap.pendingLoadout;
        const characterId = snap.characterId;
        const atlasVersion = snap.atlasVersion;
        setLoadout((s) => beginSave(s));
        const result = await loadouts.save({
          characterId,
          loadout: pending,
          atlasVersion,
          accessToken: current.accessToken,
        });
        if (!result.ok) {
          // Adapter already mapped to player-facing copy — pass through once.
          setLoadout((s) => failSave(s, result.message, result.code));
          return false;
        }
        setLoadout((s) =>
          confirmSave(s, {
            loadout: result.loadout,
            loadoutVersionId: result.loadoutVersionId,
            atlasVersion: result.atlasVersion,
          }),
        );
        return true;
      },
      renameDisplayName: async (displayName) => {
        const current = await auth.getSession();
        if (!current) {
          setSession(null);
          setLoadout((s) =>
            failSave(
              s,
              loadoutSavePlayerMessage({
                code: 'unauthenticated',
                message: 'Session expired. Sign in again to save.',
              }),
              'unauthenticated',
            ),
          );
          return false;
        }
        const snap = loadoutRef.current;
        if (snap.hydration !== 'ready' || !snap.characterId) {
          setLoadout((s) =>
            failSave(
              s,
              loadoutSavePlayerMessage({
                code: 'save_blocked',
                message: 'Could not rename. Server-confirmed loadout is unavailable.',
              }),
              'save_blocked',
            ),
          );
          return false;
        }
        const result = await loadouts.renameCharacter({
          displayName,
          accessToken: current.accessToken,
        });
        if (!result.ok) {
          setLoadout((s) => failSave(s, result.message, result.code));
          return false;
        }
        const next = playerFacingDisplayName(result.displayName);
        setLoadout((s) => ({
          ...s,
          displayName: next,
          lastError: null,
          lastErrorCode: null,
        }));
        await refreshOwnedBots();
        return true;
      },
      ownedBots,
      botCap,
      refreshOwnedBots,
      selectActiveBot: async (characterId) => {
        const current = await auth.getSession();
        if (!current) return false;
        const epoch = ++selectEpochRef.current;
        const selected = await loadouts.selectActiveBot({
          characterId,
          accessToken: current.accessToken,
        });
        if (!selected.ok) return false;
        if (epoch !== selectEpochRef.current) return false;
        // In-place Ludus select: refresh loadout/owned list without the boot
        // splash gate (D5 carousel snap must keep Stable mounted).
        await hydrate({ selectEpoch: epoch });
        return epoch === selectEpochRef.current;
      },
      suggestBotName: async () => {
        const current = await auth.getSession();
        if (!current) return null;
        const suggested = await loadouts.suggestBotName(current.accessToken);
        if (!suggested.ok) return null;
        return suggested.displayName;
      },
      createOwnedBot: async (input) => {
        const current = await auth.getSession();
        if (!current) {
          return { ok: false as const, message: 'Session expired. Sign in again.' };
        }
        const created = await loadouts.createOwnedBot({
          ...input,
          accessToken: current.accessToken,
        });
        if (!created.ok) {
          return { ok: false as const, message: created.message };
        }
        setBooting(true);
        await hydrate();
        return { ok: true as const, characterId: created.characterId };
      },
    }),
    [
      auth,
      session,
      booting,
      authBootError,
      accountDeletedNotice,
      coldStartHoldTitle,
      coldStartIntentReady,
      loadout,
      ownedBots,
      botCap,
      hydrate,
      loadouts,
      refreshOwnedBots,
      runSilentFirstLaunch,
    ],
  );

  return (
    <GarageSessionContext.Provider value={value}>{props.children}</GarageSessionContext.Provider>
  );
}

export function useGarageSession(): GarageSessionContextValue {
  const ctx = useContext(GarageSessionContext);
  if (!ctx) throw new Error('useGarageSession must be used within GarageSessionProvider');
  return ctx;
}
