/**
 * Client → Edge `account-delete` (R5).
 * Uses public anon key + user JWT (in-app) or deletion code (public web).
 */

import type { SupabasePublicConfig } from './supabasePublicConfig';

export type AccountDeleteResult =
  | { readonly ok: true; readonly repeated: boolean; readonly accountId: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type MintDeletionCodeResult =
  | { readonly ok: true; readonly deletionCode: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export const ACCOUNT_DELETE_FETCH_TIMEOUT_MS = 15_000;

/** Public path on the game web export (document for store / privacy materials). */
export const PUBLIC_ACCOUNT_DELETE_PATH = '/account/delete';

function abortSignalForTimeout(ms: number): AbortSignal {
  const timeoutFn = (AbortSignal as unknown as { timeout?: (n: number) => AbortSignal }).timeout;
  if (typeof timeoutFn === 'function') return timeoutFn.call(AbortSignal, ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

type EdgeBody = {
  ok?: boolean;
  repeated?: boolean;
  accountId?: string;
  code?: string;
  message?: string;
};

type MintRpcBody = {
  ok?: boolean;
  deletionCode?: string;
  code?: string;
  message?: string;
};

/** Format 32-hex code for display (groups of 4). */
export function formatDeletionCode(raw: string): string {
  const compact = raw
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (compact.length !== 32) return raw.trim();
  return compact.match(/.{1,4}/g)?.join('-') ?? compact;
}

export async function mintDeletionCode(
  config: SupabasePublicConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MintDeletionCodeResult> {
  try {
    const res = await fetchImpl(`${config.url}/rest/v1/rpc/mint_my_deletion_code`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: '{}',
      signal: abortSignalForTimeout(ACCOUNT_DELETE_FETCH_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as MintRpcBody;
    if (!res.ok || !json.ok || typeof json.deletionCode !== 'string') {
      return {
        ok: false,
        code: json.code ?? `http_${res.status}`,
        message: json.message ?? `mint_my_deletion_code failed (${res.status})`,
      };
    }
    return { ok: true, deletionCode: json.deletionCode };
  } catch (err) {
    return {
      ok: false,
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function deleteAccountWithSession(
  config: SupabasePublicConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountDeleteResult> {
  return postAccountDelete(
    config,
    { confirm: true },
    {
      Authorization: `Bearer ${accessToken}`,
    },
    fetchImpl,
  );
}

export async function deleteAccountWithCode(
  config: SupabasePublicConfig,
  deletionCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountDeleteResult> {
  return postAccountDelete(
    config,
    { confirm: true, deletionCode },
    {
      // Public web: anon key as Bearer (handler ignores non-user JWTs).
      Authorization: `Bearer ${config.anonKey}`,
    },
    fetchImpl,
  );
}

async function postAccountDelete(
  config: SupabasePublicConfig,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<AccountDeleteResult> {
  try {
    const res = await fetchImpl(`${config.url}/functions/v1/account-delete`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: abortSignalForTimeout(ACCOUNT_DELETE_FETCH_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as EdgeBody;
    if (!res.ok || !json.ok || typeof json.accountId !== 'string') {
      return {
        ok: false,
        code: json.code ?? `http_${res.status}`,
        message: json.message ?? `account-delete failed (${res.status})`,
      };
    }
    return {
      ok: true,
      repeated: json.repeated === true,
      accountId: json.accountId,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
