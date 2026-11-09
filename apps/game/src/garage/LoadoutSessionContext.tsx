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

export type GarageSessionContextValue = {
  readonly authKind: AuthPort['kind'];
  readonly session: AuthSession | null;
  readonly booting: boolean;
  readonly loadout: LoadoutPreviewState;
  readonly canProgress: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
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
        }),
      );
    }
    setBooting(false);
  }, [auth, loadouts]);

  const captureAutoSignInStarted = useRef(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /**
   * C7 design-capture builds auto-enter the DEV garage so capture scripts can
   * deep-link into first-run routes without tapping the auth form.
   * Opt-in only (`EXPO_PUBLIC_DESIGN_CAPTURE=1`); never for store builds.
   * Cold-start hold-title intent skips auto sign-in so splash→AuthEntry title
   * is visible (C7c).
   */
  useEffect(() => {
    if (!isDesignCaptureEnabled()) return;
    if (captureAutoSignInStarted.current) return;
    if (booting || session) return;
    captureAutoSignInStarted.current = true;
    void (async () => {
      if (await isColdStartHoldTitle()) {
        console.log('BOTORE_CAPTURE_COLD_START_HOLD_TITLE:1');
        return;
      }
      const creds = designCaptureCredentials();
      const result = await auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (!result.ok) {
        captureAutoSignInStarted.current = false;
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
  }, [auth, booting, hydrate, session]);

  const value = useMemo<GarageSessionContextValue>(
    () => ({
      authKind: auth.kind,
      session,
      booting,
      loadout,
      canProgress: loadout.hydration === 'ready' && loadout.confirmedLoadout !== null,
      signIn: async (email, password) => {
        const result = await auth.signInWithPassword({ email, password });
        if (!result.ok) return { ok: false, message: result.message };
        setBooting(true);
        setSession(result.session);
        await hydrate();
        return { ok: true };
      },
      signOut: async () => {
        await auth.signOut();
        setSession(null);
        setLoadout(createUnavailableLoadoutState());
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
          setLoadout((s) => failSave(s, result.message));
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
    [auth, session, booting, loadout, hydrate, loadouts],
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
