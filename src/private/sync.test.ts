import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedConversation } from '../domain/models';
import { privateNamespace, PrivateTransportError } from './models';
import type { PrivateCheckpoint, PrivateConversationRecord, PrivateIdentity, PrivateTransport } from './models';
import type { PrivateStore } from './store';
import { PrivateSyncController } from './sync';

const identity: PrivateIdentity = { accountId: 'account-one', workspaceId: 'personal-one',
  email: 'fixture@example.invalid', plan: 'pro', personal: true };
const detail = (id: string, body = '研究 データ'): unknown => ({
  id, title: 'Synthetic private fixture', create_time: 1000,
  messages: [
    { id: `${id}-u`, role: 'user', content: body, create_time: 1000 },
    { id: `${id}-a`, role: 'assistant', content: 'データ 検証', create_time: 1001 },
  ],
});
const listItem = (id: string, updatedAt = 1000) => ({ id, updatedAt, createdAt: 1000 });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
class MemoryStore implements PrivateStore {
  checkpoints = new Map<string, PrivateCheckpoint>();
  records = new Map<string, PrivateConversationRecord>();
  loadCheckpoint = async (namespace: string) => structuredClone(this.checkpoints.get(namespace) ?? null);
  loadLastCheckpoint = async () => structuredClone([...this.checkpoints.values()].at(-1) ?? null);
  async saveCheckpoint(checkpoint: PrivateCheckpoint, current = () => true): Promise<boolean> {
    if (!current()) return false;
    this.checkpoints.set(checkpoint.namespace, structuredClone(checkpoint));
    return true;
  }
  async saveConversation(namespace: string, record: PrivateConversationRecord, checkpoint: PrivateCheckpoint,
    current = () => true): Promise<boolean> {
    if (!current()) return false;
    this.records.set(JSON.stringify([namespace, record.id]), structuredClone(record));
    return this.saveCheckpoint(checkpoint, current);
  }
  async listConversations(namespace: string): Promise<NormalizedConversation[]> {
    return (this.checkpoints.get(namespace)?.items ?? []).slice(0, this.checkpoints.get(namespace)?.target)
      .flatMap(({ id, state }) => state === 'done'
        ? [this.records.get(JSON.stringify([namespace, id]))!.conversation] : []);
  }
  async clearAll(): Promise<void> { this.checkpoints.clear(); this.records.clear(); }
}
class TestLocks {
  held = false;
  pending: (() => void)[] = [];
  request<T>(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<T>): Promise<T> {
    if (options.ifAvailable && this.held) return callback(null);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.pending = this.pending.filter((item) => item !== execute);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const execute = () => {
        if (options.signal?.aborted) { onAbort(); return; }
        options.signal?.removeEventListener('abort', onAbort);
        this.held = true;
        void callback({ name, mode: 'exclusive' }).then(resolve, reject).finally(() => {
          this.held = false;
          this.pending.shift()?.();
        });
      };
      if (this.held) {
        this.pending.push(execute);
        options.signal?.addEventListener('abort', onAbort, { once: true });
      } else execute();
    });
  }
}
class TestBroadcastChannel {
  static channels = new Set<TestBroadcastChannel>();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor() { TestBroadcastChannel.channels.add(this); }
  postMessage(data: unknown): void {
    queueMicrotask(() => {
      for (const channel of TestBroadcastChannel.channels) if (channel !== this) {
        channel.onmessage?.(new MessageEvent('message', { data }));
      }
    });
  }
  close(): void { TestBroadcastChannel.channels.delete(this); }
}
const initialLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
afterEach(() => {
  if (initialLocks) Object.defineProperty(navigator, 'locks', initialLocks);
  else Reflect.deleteProperty(navigator, 'locks');
  TestBroadcastChannel.channels.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const installCoordination = () => {
  const locks = new TestLocks();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
  return locks;
};
const createTransport = (ids = ['one', 'two', 'three']): PrivateTransport => ({
  identity: vi.fn(async () => identity),
  list: vi.fn<PrivateTransport['list']>(async () => ({ items: ids.map((id) => listItem(id)), nextCursor: null, total: ids.length, order: 'updated' })),
  detail: vi.fn(async (id) => detail(id)),
});
const createController = (transport: PrivateTransport, store = new MemoryStore(), extras = {}) =>
  new PrivateSyncController({ transport, store, expectedEmail: identity.email,
    requestIntervalMs: 0, sleep: async () => {}, ...extras });

describe('private sync coordinator (synthetic fixtures only)', () => {
  it('pages bodies, deduplicates IDs across pages and counts actual messages, not titles', async () => {
    const transport = createTransport();
    transport.list = vi.fn<PrivateTransport['list']>(async (cursor) => cursor === null
      ? { items: ['one', 'two'].map((id) => listItem(id)), nextCursor: 'page2', total: 3, order: 'updated' }
      : { items: ['two', 'three'].map((id) => listItem(id)), nextCursor: null, total: 3, order: 'updated' });
    const controller = createController(transport);
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'complete', fetchedCount: 3,
      listedCount: 3, messageCount: 6, failedCount: 0, pendingCount: 0, listExhausted: true, order: 'updated' });
    expect(transport.detail).toHaveBeenCalledTimes(3);
    expect(await controller.loadConversations()).toHaveLength(3);
  });

  it('probes one list page and three real bodies, then resumes to the selected target', async () => {
    const transport = createTransport(Array.from({ length: 8 }, (_, index) => `conversation-${index}`));
    const controller = createController(transport);
    await controller.probe();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'paused', fetchedCount: 3, messageCount: 6 });
    expect(transport.list).toHaveBeenCalledTimes(1);
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'complete', fetchedCount: 8 });
    expect(transport.detail).toHaveBeenCalledTimes(8);
  });

  it('restores offline, rechecks identity on resume and never adds an already stored body twice', async () => {
    const store = new MemoryStore();
    const transport = createTransport(['one', 'two', 'three', 'four']);
    const first = createController(transport, store);
    await first.probe();
    const second = createController(transport, store);
    await second.restore();
    expect(await second.loadConversations()).toHaveLength(3);
    expect(transport.identity).toHaveBeenCalledTimes(1);
    await second.resume();
    expect(transport.identity).toHaveBeenCalledTimes(2);
    expect(transport.detail).toHaveBeenCalledTimes(4);
    expect(second.getSnapshot()).toMatchObject({ fetchedCount: 4, messageCount: 8 });
    expect(store.records.size).toBe(4);
  });

  it('upserts changed conversations without accumulating messages and skips unchanged bodies', async () => {
    const transport = createTransport(['one', 'two']);
    const store = new MemoryStore();
    const controller = createController(transport, store);
    await controller.start(100);
    transport.list = vi.fn<PrivateTransport['list']>(async () => ({ items: [listItem('one', 2000), listItem('two')], nextCursor: null, total: 2, order: 'updated' }));
    transport.detail = vi.fn(async (id) => detail(id, '更新済み データ'));
    await controller.start(100);
    expect(transport.detail).toHaveBeenCalledExactlyOnceWith('one', expect.any(AbortSignal));
    expect(store.records.size).toBe(2);
    expect(controller.getSnapshot()).toMatchObject({ fetchedCount: 2, messageCount: 4 });
    expect((await controller.loadConversations())[0]!.messages[0]!.originalText).toBe('更新済み データ');
  });

  it('invalidates the corpus revision when a smaller target reuses cached bodies without another detail request', async () => {
    const transport = createTransport(Array.from({ length: 150 }, (_, index) => `thread-${index}`));
    const controller = createController(transport);
    await controller.start(500);
    expect(controller.getSnapshot().fetchedCount).toBe(150);
    const initialRevision = controller.getSnapshot().revision;
    expect(await controller.loadConversations()).toHaveLength(150);
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'complete', fetchedCount: 100, messageCount: 200, target: 100 });
    expect(controller.getSnapshot().revision).toBeGreaterThan(initialRevision);
    expect(await controller.loadConversations()).toHaveLength(100);
    expect(transport.detail).toHaveBeenCalledTimes(150);
  });

  it('invalidates revision when an incomplete saved selection changes target without fetching another body', async () => {
    const transport = createTransport(Array.from({ length: 150 }, (_, index) => `thread-${index}`));
    const controller = createController(transport);
    await controller.probe();
    const initialRevision = controller.getSnapshot().revision;
    transport.identity = vi.fn(async () => identity);
    // A target reduction is persisted before a delayed next body resolves.
    const slow = deferred<unknown>();
    transport.detail = vi.fn(() => slow.promise);
    const started = controller.start(100);
    await vi.waitFor(() => expect(transport.detail).toHaveBeenCalledOnce());
    expect(controller.getSnapshot().revision).toBeGreaterThan(initialRevision);
    expect(controller.getSnapshot()).toMatchObject({ target: 100, fetchedCount: 3 });
    await controller.pause();
    slow.resolve(detail('thread-3'));
    await started;
  });

  it.each([
    { ...identity, accountId: 'different' },
    { ...identity, workspaceId: 'organization', personal: false },
    { ...identity, email: 'other@example.invalid' },
  ])('rejects switching away from the pinned personal account', async (switched) => {
    const store = new MemoryStore();
    const transport = createTransport(['one', 'two', 'three', 'four']);
    const controller = createController(transport, store);
    await controller.probe();
    transport.identity = vi.fn(async () => switched);
    await controller.resume();
    expect(controller.getSnapshot().phase).toBe('blocked');
    expect(transport.detail).toHaveBeenCalledTimes(3);
    expect(store.records.size).toBe(3);
  });

  it('revalidates identity periodically during a long acquisition', async () => {
    const transport = createTransport(Array.from({ length: 30 }, (_, index) => `thread-${index}`));
    let calls = 0;
    transport.identity = vi.fn(async () => ++calls === 1 ? identity : { ...identity, workspaceId: 'other' });
    const controller = createController(transport);
    await controller.start(100);
    expect(controller.getSnapshot().phase).toBe('blocked');
    expect(controller.getSnapshot().fetchedCount).toBe(9);
  });

  it.each([[401, 'auth-required'], [403, 'blocked']] as const)('stops on HTTP %i without retrying or counting titles as success', async (status, phase) => {
    const transport = createTransport();
    transport.detail = vi.fn(async () => { throw new PrivateTransportError('HTTP', status); });
    const controller = createController(transport);
    await controller.start(100);
    expect(transport.detail).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ phase, fetchedCount: 0, messageCount: 0, pendingCount: 3 });
  });

  it('honors Retry-After and uses finite retries for 429, retaining pending work', async () => {
    const transport = createTransport(['one']);
    const sleep = vi.fn(async () => {});
    transport.detail = vi.fn(async () => { throw new PrivateTransportError('RATE_LIMIT', 429, 12_000); });
    const controller = createController(transport, new MemoryStore(), { sleep });
    await controller.start(100);
    expect(transport.detail).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toHaveLength(4);
    expect(sleep).toHaveBeenNthCalledWith(1, 0, expect.any(AbortSignal));
    expect(sleep).toHaveBeenNthCalledWith(2, 12_000, expect.any(AbortSignal));
    expect(sleep).toHaveBeenNthCalledWith(3, 12_000, expect.any(AbortSignal));
    expect(sleep).toHaveBeenNthCalledWith(4, 12_000, expect.any(AbortSignal));
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', fetchedCount: 0, pendingCount: 1 });
  });

  it('backs off on transient faults but counts a permanently missing body as failed', async () => {
    const transport = createTransport(['one', 'two']);
    let attempts = 0;
    transport.detail = vi.fn(async (id) => {
      if (id === 'two') throw new PrivateTransportError('NOT_FOUND', 404);
      if (++attempts < 3) throw new TypeError('DO NOT STORE THIS PRIVATE ERROR');
      return detail(id);
    });
    const sleep = vi.fn(async () => {});
    const controller = createController(transport, new MemoryStore(), { sleep });
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'complete', fetchedCount: 1, failedCount: 1, messageCount: 2 });
    expect(sleep).toHaveBeenNthCalledWith(2, 1000, expect.any(AbortSignal));
    expect(sleep).toHaveBeenNthCalledWith(3, 2000, expect.any(AbortSignal));
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('PRIVATE ERROR');
  });

  it('does not count empty or unsupported body schemas as fetched', async () => {
    const transport = createTransport(['one']);
    transport.detail = vi.fn(async () => ({ id: 'one', title: 'title only' }));
    const controller = createController(transport);
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ fetchedCount: 0, failedCount: 1, messageCount: 0 });
  });

  it('rejects a pagination cursor loop instead of claiming history completeness', async () => {
    const transport = createTransport();
    transport.list = vi.fn<PrivateTransport['list']>(async () => ({ items: [listItem('one')], nextCursor: 'same', total: null, order: 'unknown' }));
    const controller = createController(transport);
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', fetchedCount: 1, listExhausted: false });
    expect(transport.list).toHaveBeenCalledTimes(2);
  });

  it('validates order across page boundaries and never restores a contradicted ordering claim', async () => {
    const transport = createTransport();
    const pages = [
      { items: [listItem('one', 10), listItem('two', 9)], nextCursor: '2', total: null, order: 'updated' as const },
      { items: [listItem('three', 11)], nextCursor: '3', total: null, order: 'updated' as const },
      { items: [listItem('four', 1)], nextCursor: '4', total: null, order: 'updated' as const },
      { items: [], nextCursor: null, total: 4, order: 'unknown' as const },
    ];
    transport.list = vi.fn<PrivateTransport['list']>(async () => pages.shift()!);
    const controller = createController(transport);
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'complete', fetchedCount: 4, order: 'unknown' });
  });

  it('preserves verified descending order when the terminating page is empty', async () => {
    const transport = createTransport();
    const pages = [
      { items: [listItem('one', 10), listItem('two', 9)], nextCursor: '2', total: null, order: 'updated' as const },
      { items: [listItem('three', 8)], nextCursor: '3', total: null, order: 'updated' as const },
      { items: [], nextCursor: null, total: 3, order: 'unknown' as const },
    ];
    transport.list = vi.fn<PrivateTransport['list']>(async () => pages.shift()!);
    const controller = createController(transport);
    await controller.start(100);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'complete', fetchedCount: 3, order: 'updated', listExhausted: true });
  });

  it('ignores a late response after pause and resumes without duplication', async () => {
    const transport = createTransport(['one']);
    const slow = deferred<unknown>();
    transport.detail = vi.fn(() => slow.promise);
    const controller = createController(transport);
    const running = controller.start(100);
    await vi.waitFor(() => expect(transport.detail).toHaveBeenCalledTimes(1));
    await controller.pause();
    slow.resolve(detail('one'));
    await running;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'paused', fetchedCount: 0 });
    transport.detail = vi.fn(async (id) => detail(id));
    await controller.resume();
    expect(controller.getSnapshot()).toMatchObject({ fetchedCount: 1, messageCount: 2 });
  });

  it('clear prevents late normalization from resurrecting saved bodies or checkpoint', async () => {
    const transport = createTransport(['one']);
    const store = new MemoryStore();
    const normalized = deferred<PrivateConversationRecord>();
    const normalize = vi.fn(() => normalized.promise);
    const controller = createController(transport, store, { normalize });
    const running = controller.start(100);
    await vi.waitFor(() => expect(normalize).toHaveBeenCalledOnce());
    await controller.clear();
    normalized.resolve({ ...listItem('one'), fetchedAt: 10,
      conversation: { id: 'one', provider: 'chatgpt', title: '', createdAt: null, updatedAt: null,
        messages: [{ id: 'one-m', conversationId: 'one', provider: 'chatgpt', role: 'user',
          originalText: 'synthetic', analysisText: '', createdAt: null, order: 0 }] },
      diagnostics: { skippedMessages: 0, truncatedConversations: 0 } });
    await running;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', fetchedCount: 0, namespace: null });
    expect(store.records.size).toBe(0);
    expect(store.checkpoints.size).toBe(0);
  });

  it('clear ignores late identity and leaves no checkpoint', async () => {
    const transport = createTransport();
    const slow = deferred<PrivateIdentity>();
    transport.identity = vi.fn(() => slow.promise);
    const store = new MemoryStore();
    const controller = createController(transport, store);
    const running = controller.start(100);
    await controller.clear();
    await running;
    slow.resolve(identity);
    await Promise.resolve();
    expect(store.checkpoints.size).toBe(0);
    expect(transport.list).not.toHaveBeenCalled();
  });

  it('releases the cross-tab lock immediately when cleared during pending identity verification', async () => {
    const locks = installCoordination();
    const transport = createTransport();
    const slow = deferred<PrivateIdentity>();
    transport.identity = vi.fn(() => slow.promise);
    const store = new MemoryStore();
    const controller = createController(transport, store);
    const running = controller.start(100);
    await vi.waitFor(() => expect(transport.identity).toHaveBeenCalledOnce());
    await controller.clear();
    await running;
    expect(locks.held).toBe(false);
    expect(store.checkpoints.size).toBe(0);
    expect(controller.getSnapshot().notice).toContain('全消去しました');
    slow.resolve(identity);
    await Promise.resolve(); await Promise.resolve();
    expect(transport.list).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('rejects failed clearing so callers cannot claim success and allows a subsequent successful clear', async () => {
    const store = new MemoryStore();
    const controller = createController(createTransport(), store);
    await controller.start(100);
    store.clearAll = vi.fn(async () => { throw new Error('PRIVATE_STORAGE_ERROR_SENTINEL'); });
    await expect(controller.clear()).rejects.toThrow('端末内データの全消去を確認できませんでした。');
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', namespace: null, fetchedCount: 0 });
    expect(controller.getSnapshot().notice).not.toContain('全消去しました');
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('SENTINEL');
    expect(store.records.size).toBe(3);
    store.clearAll = async () => { store.records.clear(); store.checkpoints.clear(); };
    await controller.clear();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', fetchedCount: 0 });
    expect(store.records.size).toBe(0);
  });

  it('distinguishes local account validation from HTTP rejection before a checkpoint exists', async () => {
    const wrong = createTransport();
    wrong.identity = vi.fn(async () => ({ ...identity, email: 'other@example.invalid' }));
    const localController = createController(wrong);
    await localController.start(100);
    expect(localController.getSnapshot().notice).toContain('LOCAL_ACCOUNT_VALIDATION');
    expect(localController.getSnapshot().notice).not.toContain('other@example.invalid');
    expect(localController.getSnapshot().namespace).toBeNull();
    const rejected = createTransport();
    rejected.identity = vi.fn(async () => { throw new PrivateTransportError('PRIVATE_CODE_SENTINEL', 403); });
    const httpController = createController(rejected);
    await httpController.start(100);
    expect(httpController.getSnapshot().notice).toContain('HTTP_403');
    expect(httpController.getSnapshot().notice).not.toContain('SENTINEL');
    expect(httpController.getSnapshot().namespace).toBeNull();
  });

  it('permits only one acquiring tab and clears after the other tab drops its late response', async () => {
    installCoordination();
    const store = new MemoryStore();
    const transport = createTransport(['one']);
    const slow = deferred<unknown>();
    transport.detail = vi.fn(() => slow.promise);
    const first = createController(transport, store);
    const firstRun = first.start(100);
    await vi.waitFor(() => expect(transport.detail).toHaveBeenCalledOnce());
    const otherTransport = createTransport(['one']);
    const second = createController(otherTransport, store);
    await second.start(100);
    expect(second.getSnapshot().notice).toContain('OTHER_PRIVATE_TAB');
    expect(otherTransport.identity).not.toHaveBeenCalled();
    const clear = second.clear();
    await vi.waitFor(() => expect(first.getSnapshot().notice).toContain('OTHER_TAB_CLEARED'));
    slow.resolve(detail('one'));
    await Promise.all([firstRun, clear]);
    expect(store.records.size).toBe(0);
    expect(store.checkpoints.size).toBe(0);
    expect(first.getSnapshot()).toMatchObject({ phase: 'idle', namespace: null, fetchedCount: 0 });
    expect(second.getSnapshot().notice).toContain('全消去しました');
    first.dispose(); second.dispose();
    expect(TestBroadcastChannel.channels.size).toBe(0);
  });

  it('rereads saved checkpoints even if an idle tab missed the clear broadcast', async () => {
    installCoordination();
    vi.stubGlobal('BroadcastChannel', undefined);
    const store = new MemoryStore();
    const transport = createTransport(['one', 'two', 'three', 'four']);
    const first = createController(transport, store);
    await first.probe();
    expect(first.getSnapshot().fetchedCount).toBe(3);
    const second = createController(createTransport(), store);
    await second.clear();
    await first.resume();
    expect(transport.detail).toHaveBeenCalledTimes(7);
    expect(transport.list).toHaveBeenCalledTimes(2);
    expect(first.getSnapshot()).toMatchObject({ fetchedCount: 4, messageCount: 8 });
    first.dispose(); second.dispose();
  });

  it('fails clearing honestly after 15 seconds if another tab never releases the data lock', async () => {
    const locks = installCoordination();
    locks.held = true;
    vi.useFakeTimers();
    const store = new MemoryStore();
    store.clearAll = vi.fn(async () => {});
    const controller = createController(createTransport(), store);
    const rejected = expect(controller.clear()).rejects.toThrow('端末内データの全消去を確認できませんでした。');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(controller.getSnapshot().phase).toBe('error');
    expect(store.clearAll).not.toHaveBeenCalled();
    expect(locks.pending).toHaveLength(0);
    controller.dispose();
  });

  it('frames namespaces and will not restore another authorized identity accidentally', async () => {
    expect(privateNamespace({ ...identity, accountId: 'ab', workspaceId: 'c' }))
      .not.toBe(privateNamespace({ ...identity, accountId: 'a', workspaceId: 'bc' }));
    const store = new MemoryStore();
    await createController(createTransport(), store).start(100);
    const controller = new PrivateSyncController({ transport: createTransport(), store, expectedEmail: 'other@example.invalid' });
    await controller.restore();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'blocked', namespace: null, fetchedCount: 0 });
    expect(await controller.loadConversations()).toEqual([]);
  });

  it('acquires 3,000 synthetic threads sequentially through 60 pages without duplicate accumulation', async () => {
    const store = new MemoryStore();
    const transport = createTransport();
    transport.list = vi.fn<PrivateTransport['list']>(async (cursor) => {
      const offset = cursor === null ? 0 : Number(cursor);
      return {
        items: Array.from({ length: 50 }, (_, index) => listItem(`synthetic-${offset + index}`)),
        nextCursor: offset + 50 < 3000 ? String(offset + 50) : null,
        total: 3000, order: 'updated',
      };
    });
    let inFlight = 0;
    let peak = 0;
    transport.detail = vi.fn(async (id) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return detail(id);
    });
    const controller = createController(transport, store);
    await controller.start(3000);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'complete', fetchedCount: 3000,
      listedCount: 3000, messageCount: 6000, failedCount: 0, pendingCount: 0 });
    expect(transport.list).toHaveBeenCalledTimes(60);
    expect(transport.detail).toHaveBeenCalledTimes(3000);
    expect(peak).toBe(1);
    expect(store.records.size).toBe(3000);
    const conversations = await controller.loadConversations();
    expect(new Set(conversations.map(({ id }) => id)).size).toBe(3000);
    await controller.clear();
    expect(store.records.size).toBe(0);
  }, 30_000);
});
