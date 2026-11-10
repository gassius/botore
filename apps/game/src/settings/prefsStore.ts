/**
 * Persist player settings via classic expo-file-system (SDK 52).
 * Same Documents pattern as design-capture intent files.
 * Never throws — missing module / web / IO errors fall back to defaults.
 */
import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_FILENAME,
  normalizePlayerSettings,
  type PlayerSettingsPrefs,
} from './prefs';

type ExpoFs = {
  documentDirectory: string | null;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
};

function tryFs(): ExpoFs | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system') as ExpoFs;
  } catch {
    return null;
  }
}

function settingsUri(FileSystem: ExpoFs): string | null {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return `${root}${PLAYER_SETTINGS_FILENAME}`;
}

export async function loadPlayerSettings(): Promise<PlayerSettingsPrefs> {
  try {
    const FileSystem = tryFs();
    if (!FileSystem) return { ...DEFAULT_PLAYER_SETTINGS };
    const uri = settingsUri(FileSystem);
    if (!uri) return { ...DEFAULT_PLAYER_SETTINGS };
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return { ...DEFAULT_PLAYER_SETTINGS };
    const raw = JSON.parse(await FileSystem.readAsStringAsync(uri)) as unknown;
    return normalizePlayerSettings(raw);
  } catch {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }
}

export async function savePlayerSettings(prefs: PlayerSettingsPrefs): Promise<void> {
  try {
    const FileSystem = tryFs();
    if (!FileSystem) return;
    const uri = settingsUri(FileSystem);
    if (!uri) return;
    const normalized = normalizePlayerSettings(prefs);
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(normalized));
  } catch {
    // Ignore — in-memory prefs still apply for the session.
  }
}
