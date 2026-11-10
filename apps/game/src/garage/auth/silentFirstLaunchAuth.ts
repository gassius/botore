import type { AuthPort, AuthResult } from './AuthPort';
import { signInWithNativePlatformIdentity } from './nativePlatformIdentity';
import { isWebPreviewAuthEnabled, readWebPreviewDevCredentials } from './previewAuth';

/**
 * C12 shared silent first-launch entry point.
 *
 * 1. Restore persisted session when present.
 * 2. Web preview (flagged): password grant for `dev@botore.local` from env.
 * 3. Otherwise: GC/PGS proof (or device-fallback UUID) → Edge `platform-auth`
 *    → applySession (generateLink + verifyOtp). Never anonymous / IdToken.
 *
 * Never mounts AuthEntry on this path.
 */
export async function runSilentFirstLaunchAuth(auth: AuthPort): Promise<AuthResult> {
  const existing = await auth.getSession();
  if (existing) return { ok: true, session: existing };

  if (isWebPreviewAuthEnabled()) {
    const creds = readWebPreviewDevCredentials();
    if (!creds.ok) {
      return { ok: false, code: creds.code, message: creds.message };
    }
    return auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });
  }

  return signInWithNativePlatformIdentity(auth);
}
