import {
  mergeCaptureFileIntent,
  type CaptureIntent,
  peekCaptureIntent,
} from './pendingCaptureIntent';
import { isDesignCaptureEnabled } from './captureEnv';

/** Written by `scripts/native-capture/ios-screencap.sh` into the app Documents dir. */
export const CAPTURE_INTENT_FILENAME = 'botore-design-capture-intent.json';

/**
 * Best-effort read of the CI intent file. Uses classic expo-file-system (SDK 52).
 * Never throws — missing file / web / unavailable module is a no-op.
 */
export async function loadCaptureIntentFile(): Promise<CaptureIntent> {
  if (!isDesignCaptureEnabled()) return peekCaptureIntent();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as {
      documentDirectory: string | null;
      getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
      readAsStringAsync: (uri: string) => Promise<string>;
    };
    const root = FileSystem.documentDirectory;
    if (!root) return peekCaptureIntent();
    const uri = `${root}${CAPTURE_INTENT_FILENAME}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return peekCaptureIntent();
    const raw = JSON.parse(await FileSystem.readAsStringAsync(uri)) as {
      route?: string | null;
      paintId?: string | null;
      weaponId?: string | null;
      mute?: boolean | null;
      rankingScenario?: string | null;
      ranking?: string | null;
    };
    mergeCaptureFileIntent(raw);
  } catch {
    // Ignore — deep link / env initial route remain the fallback.
  }
  return peekCaptureIntent();
}
