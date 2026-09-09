import { describe, expect, it } from 'vitest';
import { normalizePrivateDetail } from './normalize';

const item = { id: 'synthetic-thread', createdAt: null, updatedAt: null };
const message = (id: string, role: string, content: string, extra = {}) => ({ id, author: { role }, content, ...extra });
describe('private detail normalization', () => {
  it('retains only selected-branch visible messages and never stores the raw graph', () => {
    const graph = { id: item.id, title: 'Synthetic title', current_node: 'final',
      mapping: {
        root: { parent: null, message: message('system', 'system', 'CONTROL_SENTINEL') },
        user: { parent: 'root', message: message('u', 'user', '研究 データ') },
        discarded: { parent: 'user', message: message('a', 'assistant', 'DISCARDED_SENTINEL') },
        reasoning: { parent: 'user', message: message('r', 'assistant', 'REASONING_SENTINEL', { channel: 'analysis' }) },
        tool: { parent: 'reasoning', message: message('t', 'tool', 'TOOL_SENTINEL') },
        final: { parent: 'tool', message: message('a', 'assistant', 'データ 検証', { channel: 'final' }) },
      }, cookie: 'NEVER_PERSIST_COOKIE', accessToken: 'NEVER_PERSIST_TOKEN' };
    const record = normalizePrivateDetail(graph, item, 'synthetic-namespace', 9999);
    expect(record.conversation.messages.map(({ role, originalText }) => [role, originalText]))
      .toEqual([['user', '研究 データ'], ['assistant', 'データ 検証']]);
    expect(record.conversation.createdAt).toBeNull();
    expect(record.conversation.messages[0]!.createdAt).toBeNull();
    expect(record.fetchedAt).toBe(9999);
    expect(JSON.stringify(record)).not.toMatch(/SENTINEL|COOKIE|TOKEN|mapping/);
  });

  it('retains distinct IDs even when their visible text is identical, and deduplicates repeated IDs', () => {
    const record = normalizePrivateDetail({ id: item.id, messages: [
      message('one', 'user', '研究'), message('one', 'user', '研究'), message('two', 'user', '研究'),
    ] }, item, 'namespace', 1);
    expect(record.conversation.messages).toHaveLength(2);
    expect(record.diagnostics.skippedMessages).toBeGreaterThanOrEqual(1);
  });

  it('fails closed on unknown channels and body pagination rather than silently mixing/truncating', () => {
    expect(() => normalizePrivateDetail({ id: item.id, messages: [
      message('one', 'assistant', 'NONVISIBLE', { channel: 'new_internal_channel' }),
    ] }, item, 'namespace', 1)).toThrow();
    expect(() => normalizePrivateDetail({ id: item.id, has_more: true, messages: [message('one', 'user', '研究')] },
      item, 'namespace', 1)).toThrow();
  });

  it('rejects a mismatching body ID and salts normalized identity by account/workspace', () => {
    const raw = { id: item.id, messages: [message('one', 'user', '研究')] };
    const first = normalizePrivateDetail(raw, item, 'namespace-one', 1);
    const second = normalizePrivateDetail(raw, item, 'namespace-two', 2);
    expect(first.conversation.id).not.toBe(second.conversation.id);
    expect(normalizePrivateDetail(raw, item, 'namespace-one', 9999).conversation.id).toBe(first.conversation.id);
    expect(() => normalizePrivateDetail({ ...raw, id: 'other' }, item, 'namespace', 1)).toThrow();
  });
});
