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
import { createAuthClient } from './auth/createAuthClient';
import type { AuthPort, AuthSession } from './auth/AuthPort';
import { runSilentFirstLaunchAuth } from './auth/silentFirstLaunchAuth';
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
import { withUpdatedPaint, withUpdatedWeapon } from './loadout/proofCatalogue';

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
  retryHydration: () => Promise<void>;
  selectPaint: (paintId: string) => void;
  selectWeapon: (weaponId: string) => void;
  discard: () => void;
  save: () => Promise<boolean>;
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
  const [loadout, setLoadout] = useState<LoadoutPreviewState>(() =>
    createUnavailableLoadoutState(),
  );

  const hydrate = useCallback(async () => {
    const current = await auth.getSession();
    setSession(current);
    if (!current) {
      setLoadout(createUnavailableLoadoutState());
      setBooting(false);
      return;
    }

    const owned = await loadouts.resolveOwnedCharacter(current.accessToken);
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
          displayName: owned.character.displayName,
          confirmedLoadout: fetched.snapshot.loadout,
          confirmedVersionId: fetched.snapshot.loadoutVersionId,
          atlasVersion: fetched.snapshot.atlasVersion,
        }),
      );
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
          displayName: owned.character.displayName,
          message: fetched.message,
          code: fetched.code,
        }),
      );
    }
    setBooting(false);
  }, [auth, loadouts]);

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
    if (session || authBootError) return;
    if (booting) return;
    if (silentAuthStarted.current) return;
    silentAuthStarted.current = true;
    void runSilentFirstLaunch();
  }, [authBootError, booting, coldStartHoldTitle, runSilentFirstLaunch, session]);

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
        setAuthBootError(null);
        silentAuthStarted.current = false;
        // Re-enter silent first-launch on the first-run path (never AuthEntry).
        if (!isDesignCaptureEnabled()) {
          setBooting(false);
        }
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
      discard: () => setLoadout((s) => discardPending(s)),
      save: async () => {
        const current = await auth.getSession();
        if (!current) {
          setSession(null);
          // F8: keep last confirmed; surface auth-expired so Customise is not silent.
          setLoadout((s) =>
            failSave(s, 'Session expired. Sign in again to continue.', 'unauthenticated'),
          );
          return false;
        }
        if (
          loadout.hydration !== 'ready' ||
          !loadout.characterId ||
          !loadout.pendingLoadout ||
          !loadout.dirty ||
          loadout.saving
        ) {
          return false;
        }
        const pending = loadout.pendingLoadout;
        const characterId = loadout.characterId;
        const atlasVersion = loadout.atlasVersion;
        setLoadout((s) => beginSave(s));
        const result = await loadouts.save({
          characterId,
          loadout: pending,
          atlasVersion,
          accessToken: current.accessToken,
        });
        if (!result.ok) {
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
    }),
    [
      auth,
      session,
      booting,
      authBootError,
      coldStartHoldTitle,
      coldStartIntentReady,
      loadout,
      hydrate,
      loadouts,
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
