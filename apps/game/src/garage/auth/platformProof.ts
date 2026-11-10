/**
 * Collect GC / PGS identity proofs for Edge `platform-auth`.
 *
 * Prefers `@tubinex/expo-game-services` when that package is an installed
 * dependency of `@botore/game` **and** {@link EXPO_GAME_SERVICES_LINKED} is
 * flipped to true. Until then this module returns null so the caller falls
 * back to device UUID → platform-auth.
 *
 * IMPORTANT — do not Metro-require EXPO_GAME_SERVICES_PACKAGE (or
 * resolve it) while the package is absent from package.json. Metro leaves
 * the module id as `undefined`, and Hermes fatals on launch with:
 *   Error: Requiring unknown module "undefined"
 * even when the call sits inside try/catch on an async path (C12 silent
 * first-launch → collectPlatformProof). Observed on release APKs after the
 * platform sign-in stack landed.
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

export type ExpoGameServicesModule = {
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

/**
 * Package name for the optional GC/PGS Expo module.
 * Kept as a string constant so tests can assert the wiring checklist.
 */
export const EXPO_GAME_SERVICES_PACKAGE = '@tubinex/expo-game-services';

/**
 * Compile-time gate for the optional native module.
 *
 * Keep `false` until EXPO_GAME_SERVICES_PACKAGE is added to
 * `apps/game/package.json` dependencies (unit test enforces the match).
 * Then set to `true` and restore a Metro require of that package name
 * inside {@link tryLoadExpoGameServices}.
 */
export const EXPO_GAME_SERVICES_LINKED = false;

/**
 * Load the optional Expo game-services module when linked.
 * Returns null when the package is not wired — never metroRequires a missing
 * module id (Hermes fatal on Android release).
 */
export function tryLoadExpoGameServices(opts?: {
  /** Test seam — inject a module without touching Metro. */
  readonly loadImpl?: () => ExpoGameServicesModule;
  /** Test seam — override the linked gate. */
  readonly linked?: boolean;
}): ExpoGameServicesModule | null {
  const linked = opts?.linked ?? EXPO_GAME_SERVICES_LINKED;
  if (!linked) return null;
  try {
    if (opts?.loadImpl) return opts.loadImpl();
    // Intentionally no Metro require of EXPO_GAME_SERVICES_PACKAGE here while
    // the package is absent — a static require of a missing dep becomes
    // metroRequire(undefined) and fatals Hermes on the C12 boot path.
    // When wiring the real module: add it to apps/game/package.json, set
    // EXPO_GAME_SERVICES_LINKED=true, and restore a real require() of that
    // package name (see EXPO_GAME_SERVICES_PACKAGE).
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt silent platform proof collection.
 * Returns null when the Expo module is missing or proof collection fails.
 */
export async function collectPlatformProof(opts?: {
  readonly loadImpl?: () => ExpoGameServicesModule;
  readonly linked?: boolean;
}): Promise<PlatformProofPayload | null> {
  const mod = tryLoadExpoGameServices(opts);
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
