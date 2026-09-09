import { afterEach, describe, expect, it, vi } from 'vitest';
import { readChatGpt } from './chromeTransport';

afterEach(() => vi.unstubAllGlobals());
const account = (id: string) => ({ account: { account_id: id, structure: 'personal', is_deactivated: false, plan_type: 'pro' } });
const readIdentity = async (accounts: unknown) => {
  vi.stubGlobal('location', { origin: 'https://chatgpt.com' });
  const fetch = vi.fn(async (path: string) => Response.json(path === '/api/auth/session'
    ? { user: { id: 'fixture-user', email: 'fixture@example.invalid' }, accessToken: 'SYNTHETIC_TOKEN' }
    : { accounts }));
  vi.stubGlobal('fetch', fetch);
  const result = await readChatGpt({ kind: 'identity', identity: null, offset: 0, conversationId: '' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_TOKEN');
  return result;
};

describe('personal workspace identity aliases', () => {
  it('accepts a default alias only when it has the exact same verified personal account ID', async () => {
    const result = await readIdentity({ default: account('fixture-personal'), named: account('fixture-personal') });
    expect(result).toMatchObject({ ok: true, data: { workspaceId: 'fixture-personal', personal: true } });
  });

  it('still refuses two distinct active personal workspace IDs', async () => {
    expect(await readIdentity({ default: account('fixture-one'), named: account('fixture-two') }))
      .toMatchObject({ ok: false, status: 403, code: 'personal-workspace-ambiguous' });
  });

  it('refuses an unverified empty personal ID instead of discarding it as an alias', async () => {
    expect(await readIdentity({ default: account('fixture-one'), named: account('') }))
      .toMatchObject({ ok: false, status: 403, code: 'personal-workspace-unverified' });
  });
});
