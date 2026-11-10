/**
 * account-delete Edge Function request handler (R5).
 *
 * Two modes:
 * 1) Authenticated in-app: Bearer user JWT → soft-delete by auth.uid()
 * 2) Public web: JSON `{ deletionCode }` → soft-delete by code hash
 *
 * After DB anonymize, Auth Admin rewrites email + bans so platform-auth can
 * mint a fresh user for the same Game Center / Play Games id.
 */
import type { AccountDeleteDeps } from './deps.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type RequestBody = {
  deletionCode?: string;
  confirm?: boolean;
};

/** Normalize display codes: strip dashes/spaces, lowercase hex. */
export function normalizeDeletionCode(raw: string): string | null {
  const compact = raw
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  if (compact.length !== 32) return null;
  return compact;
}

export async function handleAccountDeleteRequest(
  req: Request,
  deps: AccountDeleteDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', message: 'POST only' }, 405);
  }

  let body: RequestBody = {};
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json({ ok: false, code: 'bad_json', message: 'Invalid JSON body' }, 400);
    }
  }

  if (body.confirm !== true) {
    return json(
      {
        ok: false,
        code: 'confirmation_required',
        message: 'Pass confirm: true to permanently delete the account',
      },
      400,
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const userId = await deps.getUserId(authHeader);
  const rawCode = typeof body.deletionCode === 'string' ? body.deletionCode : '';

  let deleted: Awaited<ReturnType<AccountDeleteDeps['deleteByAccountId']>>;

  if (userId) {
    deleted = await deps.deleteByAccountId(userId);
  } else if (rawCode.trim().length > 0) {
    const normalized = normalizeDeletionCode(rawCode);
    if (!normalized) {
      return json(
        {
          ok: false,
          code: 'bad_code',
          message: 'deletionCode must be 32 hex characters (dashes optional)',
        },
        400,
      );
    }
    const codeHash = await deps.sha256Hex(normalized);
    deleted = await deps.deleteByCodeHash(codeHash);
  } else {
    return json(
      {
        ok: false,
        code: 'unauthorized',
        message: 'Bearer user JWT or deletionCode required',
      },
      401,
    );
  }

  if (!deleted.ok) {
    const status = deleted.code === 'invalid_code' || deleted.code === 'not_found' ? 404 : 400;
    return json(
      {
        ok: false,
        code: deleted.code ?? 'delete_failed',
        message: deleted.message ?? 'delete failed',
      },
      status,
    );
  }

  const retired = await deps.retireAuthUser(deleted.accountId);
  if (!retired.ok) {
    // DB side already soft-deleted; surface Auth retire failure so ops can repair.
    return json(
      {
        ok: false,
        code: 'auth_retire_failed',
        message: retired.message,
        accountId: deleted.accountId,
      },
      500,
    );
  }

  return json(
    {
      ok: true,
      repeated: deleted.repeated === true,
      accountId: deleted.accountId,
    },
    200,
  );
}
