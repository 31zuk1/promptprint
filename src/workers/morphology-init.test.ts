import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyImportDiagnostics } from '../domain/diagnostics';
import { DEFAULT_ANALYSIS_SETTINGS, type ImportResult, type NormalizedConversation } from '../domain/models';
import type { PrivateAnalysisRequest } from '../private/analysisProtocol';
import type { WorkerRequest } from './protocol';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  analyze: vi.fn(),
  importFiles: vi.fn(),
  listConversations: vi.fn(),
}));
vi.mock('../analysis/morphology', () => ({ initializeMorphology: mocks.initialize }));
vi.mock('../analysis/pipeline', () => ({ analyzeConversations: mocks.analyze }));
vi.mock('../importers', () => ({ importSerializableFiles: mocks.importFiles }));
vi.mock('../private/store', () => ({
  IndexedDbPrivateStore: class {
    listConversations = mocks.listConversations;
  },
}));

type Request = WorkerRequest | PrivateAnalysisRequest;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const normalized = (requestId: number): WorkerRequest => ({
  type: 'ANALYZE_NORMALIZED', requestId, conversations: [],
  settings: DEFAULT_ANALYSIS_SETTINGS, diagnostics: emptyImportDiagnostics(),
});
const stored = (requestId: number, namespace = 'synthetic-new'): PrivateAnalysisRequest => ({
  type: 'ANALYZE_STORED', requestId, namespace, revision: 1,
  settings: DEFAULT_ANALYSIS_SETTINGS, skippedCount: 0,
});
const conversation = (id: string): NormalizedConversation => ({
  id, provider: 'chatgpt', title: 'Synthetic test only', createdAt: null, updatedAt: null, messages: [],
});
const scope = {
  postMessage: vi.fn(),
  onmessage: null as ((event: { data: Request }) => void) | null,
};
const dispatch = (data: Request) => {
  expect(scope.onmessage).not.toBeNull();
  scope.onmessage!({ data });
};
const terminalMessages = () => scope.postMessage.mock.calls.map(([value]) => value as {
  type: string; requestId: number; message?: string;
}).filter((message) => message.type !== 'PROGRESS');

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.initialize.mockResolvedValue(undefined);
  mocks.analyze.mockReturnValue({ syntheticResult: true });
  mocks.listConversations.mockResolvedValue([]);
  scope.onmessage = null;
  vi.stubGlobal('self', scope);
});
afterEach(() => vi.unstubAllGlobals());

describe('worker morphology initialization and request ownership', () => {
  it('fails closed before web import or analysis and never leaks a dictionary error payload', async () => {
    mocks.initialize.mockRejectedValue(new Error('形態素 SYNTHETIC_PRIVATE_SENTINEL'));
    await import('./analysis.worker');
    dispatch({ type: 'IMPORT_AND_ANALYZE', requestId: 1, files: [], settings: DEFAULT_ANALYSIS_SETTINGS });
    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(1));
    expect(terminalMessages()).toEqual([{
      type: 'ERROR', requestId: 1,
      message: '端末内の品詞辞書を読み込めませんでした。ページを再読み込みしてください。会話は送信されません。',
    }]);
    expect(mocks.importFiles).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(JSON.stringify(scope.postMessage.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_SENTINEL');
  });

  it('only analyzes the latest web request after shared initialization finishes', async () => {
    const ready = deferred<void>();
    mocks.initialize.mockReturnValue(ready.promise);
    await import('./analysis.worker');
    dispatch(normalized(1));
    dispatch(normalized(2));
    ready.resolve();
    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(1));
    expect(terminalMessages()[0]).toMatchObject({ type: 'COMPLETE', requestId: 2 });
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });

  it('does not publish an old import which finishes after a newer web request', async () => {
    const loaded = deferred<ImportResult>();
    mocks.importFiles.mockReturnValue(loaded.promise);
    await import('./analysis.worker');
    dispatch({ type: 'IMPORT_AND_ANALYZE', requestId: 1, files: [], settings: DEFAULT_ANALYSIS_SETTINGS });
    await vi.waitFor(() => expect(mocks.importFiles).toHaveBeenCalledTimes(1));
    dispatch(normalized(2));
    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(1));
    loaded.resolve({ conversations: [conversation('synthetic-old')], diagnostics: emptyImportDiagnostics() });
    await loaded.promise;
    await Promise.resolve();
    expect(terminalMessages()[0]).toMatchObject({ type: 'COMPLETE', requestId: 2 });
    expect(terminalMessages()).toHaveLength(1);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });

  it('fails closed before private storage reads and leaves stored data untouched', async () => {
    mocks.initialize.mockRejectedValue(new Error('形態素 SYNTHETIC_PRIVATE_SENTINEL'));
    await import('../private/private-analysis.worker');
    dispatch(stored(1));
    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(1));
    expect(terminalMessages()).toEqual([{
      type: 'ERROR', requestId: 1,
      message: '端末内の品詞辞書を読み込めませんでした。個人用ページを再読み込みしてください。保存済み会話は消去されず、追加取得も行いません。',
    }]);
    expect(mocks.listConversations).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(JSON.stringify(scope.postMessage.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_SENTINEL');
  });

  it('does not replace the newest private corpus cache with a stale storage read', async () => {
    const older = deferred<NormalizedConversation[]>();
    const fresh = [conversation('synthetic-new')];
    mocks.listConversations.mockImplementation((namespace: string) =>
      namespace === 'synthetic-old' ? older.promise : Promise.resolve(fresh));
    await import('../private/private-analysis.worker');
    dispatch(stored(1, 'synthetic-old'));
    await vi.waitFor(() => expect(mocks.listConversations).toHaveBeenCalledTimes(1));
    dispatch(stored(2));
    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(1));
    older.resolve([conversation('synthetic-old')]);
    await older.promise;
    await Promise.resolve();
    dispatch(stored(3));
    await vi.waitFor(() => expect(terminalMessages()).toHaveLength(2));
    expect(terminalMessages().map(({ type, requestId }) => ({ type, requestId }))).toEqual([
      { type: 'COMPLETE', requestId: 2 }, { type: 'COMPLETE', requestId: 3 },
    ]);
    expect(mocks.listConversations).toHaveBeenCalledTimes(2);
    expect(mocks.analyze).toHaveBeenCalledTimes(2);
    for (const [corpus] of mocks.analyze.mock.calls) expect(corpus).toBe(fresh);
  });
});
