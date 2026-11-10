/**
 * C12 — web-preview silent Development sign-in.
 *
 * Opt-in only via `EXPO_PUBLIC_WEB_PREVIEW_AUTH`. Native iOS/Android builds
 * must never take this path (and must never bake the password into EAS).
 * Password comes from build-time / Vercel public env — never commit it.
 *
 * Expo inlines only static `process.env.EXPO_PUBLIC_*` member expressions.
 */

export const WEB_PREVIEW_DEV_EMAIL = 'dev@botore.local';

export const WEB_PREVIEW_AUTH_MISSING_PASSWORD_CODE = 'web_preview_password_missing' as const;
export const WEB_PREVIEW_AUTH_NATIVE_BLOCKED_CODE = 'web_preview_native_blocked' as const;

function trimPublic(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function truthyFlag(raw: string | undefined): boolean {
  const v = trimPublic(raw)?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * True when running on a native mobile runtime. Preview credentials must not
 * apply here even if the env flag was mistakenly baked into an EAS profile.
 */
export function isNativeMobileRuntime(opts?: {
  expoOs?: string | undefined;
  navigatorProduct?: string | undefined;
}): boolean {
  const expoOs = opts?.expoOs ?? (typeof process !== 'undefined' ? process.env.EXPO_OS : undefined);
  if (expoOs === 'ios' || expoOs === 'android') return true;

  const product =
    opts?.navigatorProduct ??
    (typeof navigator !== 'undefined' ? (navigator as { product?: string }).product : undefined);
  return product === 'ReactNative';
}

/** Preview silent-auth flag — ignored on native mobile runtimes. */
export function isWebPreviewAuthEnabled(opts?: {
  flag?: string | undefined;
  expoOs?: string | undefined;
  navigatorProduct?: string | undefined;
}): boolean {
  if (
    isNativeMobileRuntime({
      expoOs: opts?.expoOs,
      navigatorProduct: opts?.navigatorProduct,
    })
  ) {
    return false;
  }
  return truthyFlag(opts?.flag ?? process.env.EXPO_PUBLIC_WEB_PREVIEW_AUTH);
}

export type WebPreviewCredentialsResult =
  | { readonly ok: true; readonly email: string; readonly password: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Read Development preview credentials. Email is fixed; password is env-only.
 * Refuses on native so store / EAS builds never consume the preview password.
 */
export function readWebPreviewDevCredentials(opts?: {
  flag?: string | undefined;
  password?: string | undefined;
  expoOs?: string | undefined;
  navigatorProduct?: string | undefined;
}): WebPreviewCredentialsResult {
  if (
    isNativeMobileRuntime({
      expoOs: opts?.expoOs,
      navigatorProduct: opts?.navigatorProduct,
    })
  ) {
    return {
      ok: false,
      code: WEB_PREVIEW_AUTH_NATIVE_BLOCKED_CODE,
      message:
        'Web-preview Development sign-in is blocked on native builds. Native identity is a separate plug-in seam.',
    };
  }

  if (
    !isWebPreviewAuthEnabled({
      flag: opts?.flag,
      expoOs: opts?.expoOs,
      navigatorProduct: opts?.navigatorProduct,
    })
  ) {
    return {
      ok: false,
      code: 'web_preview_auth_disabled',
      message: 'EXPO_PUBLIC_WEB_PREVIEW_AUTH is not enabled for this build.',
    };
  }

  // Static member access — required for Expo Metro / Vercel inlining.
  const password = trimPublic(opts?.password ?? process.env.EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD);
  if (!password) {
    return {
      ok: false,
      code: WEB_PREVIEW_AUTH_MISSING_PASSWORD_CODE,
      message:
        'EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD must be set in Vercel / build env for web preview. Never commit the password.',
    };
  }

  return {
    ok: true,
    email: WEB_PREVIEW_DEV_EMAIL,
    password,
  };
}
