import {
  mergeCaptureFileIntent,
  type CaptureIntent,
  peekCaptureIntent,
} from './captureIntentState';
import { isDesignCaptureEnabled } from './captureEnv';

/** Written by `scripts/native-capture/ios-screencap.sh` into the app Documents dir. */
export const CAPTURE_INTENT_FILENAME = 'botore-design-capture-intent.json';

/** Cold-start hold-title marker — skips design-capture auto sign-in. */
export const COLD_START_INTENT_FILENAME = 'botore-cold-start-intent.json';

/** Live-fight proof written for CI (iOS has no reliable logcat). */
export const FIGHT_PROOF_FILENAME = 'botore-capture-fight-proof.json';

/** Full FightSuccess for FightResult restore after iOS process relaunch. */
export const LAST_FIGHT_FILENAME = 'botore-capture-last-fight.json';

type ExpoFs = {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  deleteAsync: (uri: string, opts?: { idempotent?: boolean }) => Promise<void>;
};

function tryFs(): ExpoFs | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system') as ExpoFs;
  } catch {
    return null;
  }
}

/**
 * Best-effort read of the CI intent file. Uses classic expo-file-system (SDK 52).
 * Never throws — missing file / web / unavailable module is a no-op.
 */
export async function loadCaptureIntentFile(): Promise<CaptureIntent> {
  if (!isDesignCaptureEnabled()) return peekCaptureIntent();
  try {
    const FileSystem = tryFs();
    const root = FileSystem?.documentDirectory;
    if (!FileSystem || !root) return peekCaptureIntent();
    const uri = `${root}${CAPTURE_INTENT_FILENAME}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return peekCaptureIntent();
    const raw = JSON.parse(await FileSystem.readAsStringAsync(uri)) as {
      route?: string | null;
      paintId?: string | null;
      weaponId?: string | null;
      mute?: boolean | null;
      battleId?: string | null;
      rankingScenario?: string | null;
      ranking?: string | null;
      failClosed?: boolean | null;
    };
    mergeCaptureFileIntent(raw);
  } catch {
    // Ignore — deep link / env initial route remain the fallback.
  }
  return peekCaptureIntent();
}

/** Delete the Documents intent after the shell has applied it (C7b PRR P3). */
export async function consumeCaptureIntentFile(): Promise<void> {
  if (!isDesignCaptureEnabled()) return;
  try {
    const FileSystem = tryFs();
    const root = FileSystem?.documentDirectory;
    if (!FileSystem || !root) return;
    await FileSystem.deleteAsync(`${root}${CAPTURE_INTENT_FILENAME}`, { idempotent: true });
  } catch {
    // Ignore.
  }
}

/** True when CI planted a cold-start hold-title marker (skip auto sign-in). */
export async function isColdStartHoldTitle(): Promise<boolean> {
  if (!isDesignCaptureEnabled()) return false;
  try {
    const FileSystem = tryFs();
    const root = FileSystem?.documentDirectory;
    if (!FileSystem || !root) return false;
    const info = await FileSystem.getInfoAsync(`${root}${COLD_START_INTENT_FILENAME}`);
    return info.exists;
  } catch {
    return false;
  }
}

/** Persist fight proof for CI to read from the app Documents container. */
export async function writeFightProofFile(proof: unknown): Promise<void> {
  if (!isDesignCaptureEnabled()) return;
  try {
    const FileSystem = tryFs();
    const root = FileSystem?.documentDirectory;
    if (!FileSystem || !root) return;
    await FileSystem.writeAsStringAsync(`${root}${FIGHT_PROOF_FILENAME}`, JSON.stringify(proof));
  } catch {
    // Ignore — logcat / OSLog remain the Android primary path.
  }
}

/** Persist the sealed FightSuccess so FightResult survives iOS capture relaunches. */
export async function writeLastFightFile(fight: unknown): Promise<void> {
  if (!isDesignCaptureEnabled()) return;
  try {
    const FileSystem = tryFs();
    const root = FileSystem?.documentDirectory;
    if (!FileSystem || !root) return;
    await FileSystem.writeAsStringAsync(`${root}${LAST_FIGHT_FILENAME}`, JSON.stringify(fight));
  } catch {
    // Ignore.
  }
}

/** Read a previously persisted FightSuccess (design-capture only). */
export async function readLastFightFile(): Promise<unknown | null> {
  if (!isDesignCaptureEnabled()) return null;
  try {
    const FileSystem = tryFs();
    const root = FileSystem?.documentDirectory;
    if (!FileSystem || !root) return null;
    const uri = `${root}${LAST_FIGHT_FILENAME}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(uri)) as unknown;
  } catch {
    return null;
  }
}
