/**
 * Collect GC / PGS identity proofs for Edge `platform-auth`.
 *
 * Prefers `@tubinex/expo-game-services` when present (dev builds). Returns
 * null when the native module is unavailable (Expo Go / web) so the caller
 * can fall back to device UUID → platform-auth.
 */

export type GameCenterProofPayload = {
  readonly provider: 'game_center';
  readonly teamPlayerID: string;
  readonly bundleId: string;
  readonly publicKeyURL: string;
  readonly signature: string;
  readonly salt: string;
  readonly timestamp: number;
};

export type PlayGamesProofPayload = {
  readonly provider: 'play_games';
  readonly serverAuthCode: string;
};

export type PlatformProofPayload = GameCenterProofPayload | PlayGamesProofPayload;

type ExpoGameServicesModule = {
  requestServerIdentityProof?: () => Promise<{
    provider?: string;
    teamPlayerID?: string;
    bundleId?: string;
    publicKeyURL?: string;
    signature?: string;
    salt?: string;
    timestamp?: number;
    serverAuthCode?: string;
  }>;
};

async function tryLoadExpoGameServices(): Promise<ExpoGameServicesModule | null> {
  try {
    // Optional dependency — may be absent until Carlos wires the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@tubinex/expo-game-services') as ExpoGameServicesModule;
  } catch {
    return null;
  }
}

/**
 * Attempt silent platform proof collection.
 * Returns null when the Expo module is missing or proof collection fails.
 */
export async function collectPlatformProof(): Promise<PlatformProofPayload | null> {
  const mod = await tryLoadExpoGameServices();
  if (!mod?.requestServerIdentityProof) return null;
  try {
    const proof = await mod.requestServerIdentityProof();
    if (
      proof.provider === 'game_center' &&
      proof.teamPlayerID &&
      proof.bundleId &&
      proof.publicKeyURL &&
      proof.signature &&
      proof.salt &&
      typeof proof.timestamp === 'number'
    ) {
      return {
        provider: 'game_center',
        teamPlayerID: proof.teamPlayerID,
        bundleId: proof.bundleId,
        publicKeyURL: proof.publicKeyURL,
        signature: proof.signature,
        salt: proof.salt,
        timestamp: proof.timestamp,
      };
    }
    if (proof.provider === 'play_games' && proof.serverAuthCode) {
      return { provider: 'play_games', serverAuthCode: proof.serverAuthCode };
    }
    return null;
  } catch {
    return null;
  }
}
