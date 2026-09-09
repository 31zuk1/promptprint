import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeConversations } from '../analysis/pipeline';
import { createDemoConversations } from '../demo/demoConversations';
import { DEFAULT_ANALYSIS_SETTINGS } from '../domain/models';
import { emptyPrivateSnapshot, type PrivateSyncSnapshot } from './models';
import type { PrivateAnalysisRequest, PrivateAnalysisResponse } from './analysisProtocol';
import { PrivateApp } from './PrivateApp';

const mock = vi.hoisted(() => ({
  controller: null as null | {
    emit: (snapshot: PrivateSyncSnapshot) => void;
    clear: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    probe: ReturnType<typeof vi.fn>;
  },
}));
vi.mock('./chromeTransport', () => ({ createChromeTransport: () => ({}) }));
vi.mock('./sync', async () => {
  const { emptyPrivateSnapshot: initial } = await import('./models');
  return { PrivateSyncController: class {
    snapshot = initial();
    listeners = new Set<(snapshot: PrivateSyncSnapshot) => void>();
    constructor() { mock.controller = this; }
    getSnapshot = () => this.snapshot;
    subscribe = (listener: (snapshot: PrivateSyncSnapshot) => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    emit = (snapshot: PrivateSyncSnapshot) => { this.snapshot = snapshot; for (const listener of this.listeners) listener(snapshot); };
    restore = vi.fn(async () => undefined);
    start = vi.fn(async () => undefined);
    probe = vi.fn(async () => undefined);
    resume = vi.fn(async () => undefined);
    pause = vi.fn(async () => undefined);
    dispose = vi.fn(() => undefined);
    clear = vi.fn(async () => { this.emit(initial()); });
  } };
});
vi.mock('../components/MirrorCloud', () => ({ MirrorCloud: ({ scopeLabel }: { scopeLabel: string }) => <div data-testid="mirror-cloud">{scopeLabel}</div> }));

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent<PrivateAnalysisResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  messages: PrivateAnalysisRequest[] = [];
  terminated = false;
  constructor() { TestWorker.instances.push(this); }
  postMessage(message: PrivateAnalysisRequest) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  complete() {
    const request = this.messages.at(-1)!;
    const result = analyzeConversations(createDemoConversations(), DEFAULT_ANALYSIS_SETTINGS);
    this.onmessage?.({ data: { type: 'COMPLETE', requestId: request.requestId, revision: request.revision, result, loadedThreads: 25, loadedMessages: 50 } } as MessageEvent<PrivateAnalysisResponse>);
  }
}

const checkpoint = (count: number, phase: PrivateSyncSnapshot['phase'] = 'fetching'): PrivateSyncSnapshot => ({
  ...emptyPrivateSnapshot(), phase, namespace: '["chatgpt","synthetic","personal"]',
  identity: { accountId: 'synthetic', workspaceId: 'personal', email: 'synthetic@example.test', plan: 'pro', personal: true },
  fetchedCount: count, listedCount: 100, messageCount: count * 2, pendingCount: 100 - count,
  revision: count, startedAt: Date.now(), updatedAt: Date.now(),
});

beforeEach(() => { localStorage.clear(); TestWorker.instances = []; vi.stubGlobal('Worker', TestWorker); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

describe('private acquisition UI', () => {
  it('offers explicit account confirmation and thread targets without tokens or manual imports', async () => {
    render(<PrivateApp />);
    await waitFor(() => expect(mock.controller).not.toBeNull());
    expect(screen.getByRole('combobox', { name: '取得する直近のスレッド数' })).toHaveValue('1000');
    expect(screen.getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['100', '500', '1000', '3000']);
    expect(screen.queryByText('ファイルを選ぶ')).toBeNull();
    expect(screen.getByRole('textbox', { name: '本人の個人アカウント' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: '本人の個人アカウント' }), { target: { value: 'synthetic@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '接続確認（本文3件）' }));
    await waitFor(() => expect(mock.controller?.probe).toHaveBeenCalledTimes(1));
  });

  it('does not clone source conversations into analysis messages or reanalyze every body', async () => {
    render(<PrivateApp />);
    await act(async () => undefined);
    act(() => mock.controller!.emit(checkpoint(24)));
    expect(TestWorker.instances).toHaveLength(0);
    act(() => mock.controller!.emit(checkpoint(25)));
    expect(TestWorker.instances).toHaveLength(1);
    const worker = TestWorker.instances[0]!;
    expect(worker.messages[0]).toMatchObject({ type: 'ANALYZE_STORED', namespace: checkpoint(25).namespace });
    expect(worker.messages[0]).not.toHaveProperty('conversations');
    act(() => worker.complete());
    act(() => mock.controller!.emit(checkpoint(26)));
    expect(worker.messages).toHaveLength(1);
    expect(screen.getByTestId('mirror-cloud')).toHaveTextContent('実データ · ChatGPT Web読取');
  });

  it('clear cancels analysis and prevents old progress or late results from restoring private data', async () => {
    render(<PrivateApp />);
    await act(async () => undefined);
    act(() => mock.controller!.emit(checkpoint(25)));
    const worker = TestWorker.instances[0]!;
    act(() => worker.complete());
    let finishClear: (() => void) | undefined;
    mock.controller!.clear.mockImplementation(() => new Promise<void>((resolve) => { finishClear = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: '端末内の会話・進捗を全消去' }));
    fireEvent.click(screen.getByRole('button', { name: '全消去を実行する' }));
    expect(worker.terminated).toBe(true);
    act(() => {
      mock.controller!.emit(checkpoint(26));
      worker.complete();
    });
    expect(TestWorker.instances).toHaveLength(1);
    expect(screen.queryByTestId('mirror-cloud')).toBeNull();
    await act(async () => { finishClear?.(); });
    expect(screen.getByTestId('private-status')).toHaveAttribute('data-fetched', '0');
    expect(localStorage.length).toBe(0);
  });

  it('forgets its private chart when another tab clears without recursively clearing again', async () => {
    render(<PrivateApp />);
    await act(async () => undefined);
    act(() => mock.controller!.emit(checkpoint(25)));
    const worker = TestWorker.instances[0]!;
    act(() => worker.complete());
    expect(screen.getByTestId('mirror-cloud')).toBeInTheDocument();
    act(() => mock.controller!.emit({ ...emptyPrivateSnapshot(), notice: '別タブの全消去（OTHER_TAB_CLEARED）' }));
    expect(worker.terminated).toBe(true);
    expect(screen.queryByTestId('mirror-cloud')).toBeNull();
    expect(mock.controller!.clear).not.toHaveBeenCalled();
    act(() => worker.complete());
    expect(screen.queryByTestId('mirror-cloud')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('reanalyzes a changed corpus revision even when the number of fetched bodies is unchanged', async () => {
    render(<PrivateApp />);
    await act(async () => undefined);
    act(() => mock.controller!.emit(checkpoint(25, 'paused')));
    const worker = TestWorker.instances[0]!;
    act(() => worker.complete());
    act(() => mock.controller!.emit({ ...checkpoint(25, 'paused'), revision: 26 }));
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]!.revision).toBe(26);
  });

  it('drops the old account chart and late worker results before connecting a different expected identity', async () => {
    render(<PrivateApp />);
    await act(async () => undefined);
    act(() => mock.controller!.emit(checkpoint(25, 'paused')));
    const oldWorker = TestWorker.instances[0]!;
    act(() => oldWorker.complete());
    expect(screen.getByTestId('mirror-cloud')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '本人の個人アカウント' }), { target: { value: 'another-synthetic@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '取得を再開' }));
    await waitFor(() => expect(oldWorker.terminated).toBe(true));
    expect(screen.queryByTestId('mirror-cloud')).toBeNull();
    act(() => {
      mock.controller!.emit({ ...emptyPrivateSnapshot(), phase: 'blocked' });
      oldWorker.complete();
    });
    expect(screen.queryByTestId('mirror-cloud')).toBeNull();
    expect(screen.getByTestId('private-status')).toHaveAttribute('data-analyzed', '0');
  });

  it('reuses the idle worker corpus when only display settings change', async () => {
    render(<PrivateApp />);
    await act(async () => undefined);
    act(() => mock.controller!.emit(checkpoint(25, 'paused')));
    const worker = TestWorker.instances[0]!;
    act(() => worker.complete());
    fireEvent.change(screen.getByLabelText('表示する語'), { target: { value: '40' } });
    expect(worker.terminated).toBe(false);
    expect(TestWorker.instances).toHaveLength(1);
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]!.settings.termLimit).toBe(40);
    expect(worker.messages[1]!.revision).toBe(worker.messages[0]!.revision);
  });
});
