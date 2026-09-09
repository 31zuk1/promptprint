import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChromeTransport, PRIVATE_SOURCE_READ_LOCK } from './chromeTransport';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const initialLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
afterEach(() => {
  vi.unstubAllGlobals();
  if (initialLocks) Object.defineProperty(navigator, 'locks', initialLocks);
  else Reflect.deleteProperty(navigator, 'locks');
});

describe('Chrome transport cancellation (synthetic browser API)', () => {
  it('rejects promptly while executeScript is still pending, discards late data and cleans the listener', async () => {
    const pending = deferred<unknown[]>();
    const executeScript = vi.fn(() => pending.promise);
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 4 }]) }, scripting: { executeScript } });
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener');
    const delivered = vi.fn();
    const request = createChromeTransport().detail('synthetic-conversation', abort.signal);
    void request.then(delivered, () => {});
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledOnce());
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await rejected;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(delivered).not.toHaveBeenCalled();
    pending.resolve([{ result: { ok: true, status: 200, code: 'ok', retryAfterMs: null,
      data: { id: 'synthetic-conversation', privateSentinel: 'LATE_DATA_MUST_NOT_DELIVER' } } }]);
    await Promise.resolve(); await Promise.resolve();
    expect(delivered).not.toHaveBeenCalled();
  });

  it('observes a late executeScript rejection after cancellation without unhandled rejection', async () => {
    const pending = deferred<unknown[]>();
    const executeScript = vi.fn(() => pending.promise);
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 4 }]) }, scripting: { executeScript } });
    const abort = new AbortController();
    const request = createChromeTransport().detail('synthetic-conversation', abort.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledOnce());
    abort.abort();
    await rejected;
    pending.reject(new Error('LATE_PRIVATE_ERROR'));
    await Promise.resolve(); await Promise.resolve();
  });

  it('does not inject a script when already aborted or aborted while discovering the tab', async () => {
    const pending = deferred<{ id: number }[]>();
    const query = vi.fn(() => pending.promise);
    const executeScript = vi.fn();
    vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });
    const already = new AbortController(); already.abort();
    await expect(createChromeTransport().detail('synthetic', already.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(query).not.toHaveBeenCalled();
    const abort = new AbortController();
    const request = createChromeTransport().detail('synthetic', abort.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await rejected;
    pending.resolve([{ id: 4 }]);
    await Promise.resolve(); await Promise.resolve();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves successful data and removes cancellation listeners after completion', async () => {
    const data = { id: 'synthetic-conversation', messages: [] };
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 4 }]) }, scripting: {
      executeScript: vi.fn(async () => [{ result: { ok: true, status: 200, code: 'ok', retryAfterMs: null, data } }]),
    } });
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, 'removeEventListener');
    await expect(createChromeTransport().detail('synthetic-conversation', abort.signal)).resolves.toEqual(data);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    abort.abort();
  });

  it('holds the source lock through a physically pending read and never injects cancelled queued identities', async () => {
    let tail: Promise<void> = Promise.resolve();
    const requestLock = vi.fn(async (name: string, options: LockOptions, callback: () => Promise<unknown>) => {
      expect(name).toBe(PRIVATE_SOURCE_READ_LOCK);
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return await callback();
      } finally { release(); }
    });
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: requestLock } });
    const firstRead = deferred<unknown[]>();
    const identity = { accountId: 'synthetic-account', workspaceId: 'synthetic-personal',
      email: 'synthetic@example.invalid', plan: 'pro', personal: true };
    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    const executeScript = vi.fn(async () => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      calls += 1;
      try {
        if (calls === 1) return await firstRead.promise;
        return [{ result: { ok: true, status: 200, code: 'ok', retryAfterMs: null, data: identity } }];
      } finally { inFlight -= 1; }
    });
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 4 }]) }, scripting: { executeScript } });
    const firstAbort = new AbortController();
    const first = createChromeTransport().detail('synthetic', firstAbort.signal);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledOnce());
    const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    firstAbort.abort();
    await firstRejected;
    expect(inFlight).toBe(1);
    // These are distinct controller/transport instances, as after repeated stop/resume or across tabs.
    for (let index = 0; index < 3; index += 1) {
      const abort = new AbortController();
      const queued = createChromeTransport().identity(abort.signal);
      const rejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
      await vi.waitFor(() => expect(requestLock).toHaveBeenCalledTimes(index + 2));
      abort.abort();
      await rejected;
      expect(executeScript).toHaveBeenCalledOnce();
    }
    const resumed = createChromeTransport().identity(new AbortController().signal);
    firstRead.resolve([{ result: { ok: true, status: 200, code: 'ok', retryAfterMs: null, data: {} } }]);
    await expect(resumed).resolves.toEqual(identity);
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(peak).toBe(1);
    expect(inFlight).toBe(0);
  });
});

describe('Chrome list totals (synthetic look-ahead responses)', () => {
  const response = (data: unknown) => [{ result: { ok: true, status: 200, code: 'ok', retryAfterMs: null, data } }];
  const items = (offset: number, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${offset + index}`, create_time: 1000 + index, update_time: 10_000 - offset - index,
  }));

  it('never treats full-page total=N+1 look-ahead values as the history count or termination condition', async () => {
    const executeScript = vi.fn()
      .mockResolvedValueOnce(response({ items: items(0, 50), total: 51, limit: 50, offset: 0 }))
      .mockResolvedValueOnce(response({ items: items(50, 50), total: 101, limit: 50, offset: 50 }));
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 4 }]) }, scripting: { executeScript } });
    const transport = createChromeTransport();
    const signal = new AbortController().signal;
    const first = await transport.list(null, signal);
    expect(first).toMatchObject({ total: null, nextCursor: '50', order: 'updated' });
    expect(first.items).toHaveLength(50);
    const second = await transport.list(first.nextCursor, signal);
    expect(second).toMatchObject({ total: null, nextCursor: '100' });
    expect(second.items).toHaveLength(50);
    expect(executeScript).toHaveBeenNthCalledWith(2, expect.objectContaining({
      args: [expect.objectContaining({ kind: 'list', offset: 50 })],
    }));
  });

  it('continues after a short page and reports only observed listing rows after an empty terminal page', async () => {
    const executeScript = vi.fn()
      .mockResolvedValueOnce(response({ items: items(0, 2), total: 2 }))
      .mockResolvedValueOnce(response({ items: items(2, 1), total: 3 }))
      .mockResolvedValueOnce(response({ items: [], total: 999999 }));
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 4 }]) }, scripting: { executeScript } });
    const transport = createChromeTransport();
    const signal = new AbortController().signal;
    const first = await transport.list(null, signal);
    expect(first).toMatchObject({ total: null, nextCursor: '2' });
    const second = await transport.list(first.nextCursor, signal);
    expect(second).toMatchObject({ total: null, nextCursor: '3' });
    const terminal = await transport.list(second.nextCursor, signal);
    expect(terminal).toEqual({ items: [], total: 3, nextCursor: null, order: 'unknown' });
    expect(executeScript).toHaveBeenCalledTimes(3);
  });

  it('retains the list response size cap instead of accepting an unbounded page', async () => {
    vi.stubGlobal('chrome', { tabs: { query: vi.fn(async () => [{ id: 4 }]) }, scripting: {
      executeScript: vi.fn(async () => response({ items: items(0, 101), total: 101 })),
    } });
    await expect(createChromeTransport().list(null, new AbortController().signal))
      .rejects.toMatchObject({ code: 'list-schema' });
  });
});
