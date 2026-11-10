import { describe, expect, it, vi } from 'vitest';
import {
  deleteAccountWithCode,
  deleteAccountWithSession,
  formatDeletionCode,
  mintDeletionCode,
  PUBLIC_ACCOUNT_DELETE_PATH,
} from '../src/garage/auth/accountDeleteClient';
import { isPublicAccountDeletePath } from '../src/account/isPublicAccountDeletePath';

const config = {
  url: 'https://example.supabase.co',
  anonKey: 'anon-test-key',
};

describe('R5 account deletion client', () => {
  it('formats deletion codes into dashed hex groups', () => {
    expect(formatDeletionCode('aabbccddeeff00112233445566778899')).toBe(
      'aabb-ccdd-eeff-0011-2233-4455-6677-8899',
    );
  });

  it('exposes the public deletion path for store / privacy materials', () => {
    expect(PUBLIC_ACCOUNT_DELETE_PATH).toBe('/account/delete');
    expect(isPublicAccountDeletePath('/account/delete')).toBe(true);
    expect(isPublicAccountDeletePath('/account/delete/')).toBe(true);
    expect(isPublicAccountDeletePath('/stable')).toBe(false);
  });

  it('mints a deletion code via authenticated RPC', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, deletionCode: 'a'.repeat(32) }),
    });
    const result = await mintDeletionCode(config, 'user-jwt', fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.deletionCode).toHaveLength(32);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/mint_my_deletion_code',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer user-jwt',
          apikey: 'anon-test-key',
        }),
      }),
    );
  });

  it('deletes with session JWT through account-delete Edge', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, accountId: 'acct-1', repeated: false }),
    });
    const result = await deleteAccountWithSession(
      config,
      'user-jwt',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: true, accountId: 'acct-1', repeated: false });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/account-delete',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer user-jwt' }),
        body: JSON.stringify({ confirm: true }),
      }),
    );
  });

  it('deletes with a public web code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, accountId: 'acct-2', repeated: false }),
    });
    const result = await deleteAccountWithCode(
      config,
      'aabbccddeeff00112233445566778899',
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/account-delete',
      expect.objectContaining({
        body: JSON.stringify({
          confirm: true,
          deletionCode: 'aabbccddeeff00112233445566778899',
        }),
      }),
    );
  });

  it('maps Edge failures without inventing success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ ok: false, code: 'invalid_code', message: 'nope' }),
    });
    const result = await deleteAccountWithCode(
      config,
      'a'.repeat(32),
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, code: 'invalid_code', message: 'nope' });
  });
});
