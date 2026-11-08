import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createAuthClient } from './auth/createAuthClient';
import type { AuthPort, AuthSession } from './auth/AuthPort';
import { createLoadoutSaveClient } from './loadout/createLoadoutSaveClient';
import type { LoadoutSavePort } from './loadout/LoadoutSavePort';
import {
  beginSave,
  confirmSave,
  createLoadoutPreviewState,
  discardPending,
  failSave,
  setPendingLoadout,
  type LoadoutPreviewState,
} from './loadout/loadoutState';
import {
  DEFAULT_CONFIRMED_LOADOUT,
  PROOF_ATLAS_VERSION,
  PROOF_CHARACTER_ID,
  withUpdatedPaint,
  withUpdatedWeapon,
} from './loadout/proofCatalogue';

export type GarageSessionContextValue = {
  readonly authKind: AuthPort['kind'];
  readonly session: AuthSession | null;
  readonly booting: boolean;
  readonly loadout: LoadoutPreviewState;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => Promise<void>;
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
    createLoadoutPreviewState({
      confirmedLoadout: DEFAULT_CONFIRMED_LOADOUT,
      atlasVersion: PROOF_ATLAS_VERSION,
    }),
  );

  const hydrate = useCallback(async () => {
    const current = await auth.getSession();
    setSession(current);
    if (!current) {
      setBooting(false);
      return;
    }
    const fetched = await loadouts.fetchCurrent({
      characterId: PROOF_CHARACTER_ID,
      accessToken: current.accessToken,
    });
    if (fetched.ok) {
      setLoadout(
        createLoadoutPreviewState({
          confirmedLoadout: fetched.snapshot.loadout,
          confirmedVersionId: fetched.snapshot.loadoutVersionId,
          atlasVersion: fetched.snapshot.atlasVersion,
        }),
      );
    } else {
      setLoadout(
        createLoadoutPreviewState({
          confirmedLoadout: DEFAULT_CONFIRMED_LOADOUT,
          atlasVersion: PROOF_ATLAS_VERSION,
        }),
      );
    }
    setBooting(false);
  }, [auth, loadouts]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const value = useMemo<GarageSessionContextValue>(
    () => ({
      authKind: auth.kind,
      session,
      booting,
      loadout,
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
        setLoadout(
          createLoadoutPreviewState({
            confirmedLoadout: DEFAULT_CONFIRMED_LOADOUT,
            atlasVersion: PROOF_ATLAS_VERSION,
          }),
        );
      },
      selectPaint: (paintId) => {
        setLoadout((s) => setPendingLoadout(s, withUpdatedPaint(s.pendingLoadout, paintId)));
      },
      selectWeapon: (weaponId) => {
        setLoadout((s) => setPendingLoadout(s, withUpdatedWeapon(s.pendingLoadout, weaponId)));
      },
      discard: () => setLoadout((s) => discardPending(s)),
      save: async () => {
        const current = await auth.getSession();
        if (!current) {
          setSession(null);
          return false;
        }
        const pending = loadout.pendingLoadout;
        const atlasVersion = loadout.atlasVersion;
        setLoadout((s) => beginSave(s));
        const result = await loadouts.save({
          characterId: PROOF_CHARACTER_ID,
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
