import { useCallback, useEffect, useRef, useState } from 'react';
import { Brand } from './components/Brand';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { FilterBar } from './components/FilterBar';
import { ImportProgress } from './components/ImportProgress';
import { InsightCards } from './components/InsightCards';
import { InsightSummary } from './components/InsightSummary';
import { Landing } from './components/Landing';
import { MirrorCloud } from './components/MirrorCloud';
import { SpatialCloud } from './components/SpatialCloud';
import { VisualizationSwitch, type VisualizationMode } from './components/VisualizationSwitch';
import { DEFAULT_CAMERA, type Camera } from './analysis/spatial';
import { StatsCards } from './components/StatsCards';
import { TermContextDrawer, type TermSelection } from './components/TermContextDrawer';
import { TimelineControls } from './components/TimelineControls';
import { datasetScopeLabel, selectedPeriodLabel } from './analysis/presentation';
import { createDemoConversations } from './demo/demoConversations';
import { emptyImportDiagnostics } from './domain/diagnostics';
import {
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisResult,
  type AnalysisSettings,
  type ImportDiagnostics,
  type LaidOutTerm,
  type NormalizedConversation,
  type SerializableFile,
  type TermStats,
} from './domain/models';
import { downloadPromptprintPng, revokePromptprintObjectUrls } from './utils/exportPng';
import type { AnalysisStage, WorkerRequest, WorkerResponse } from './workers/protocol';

type AppStatus = 'landing' | 'processing' | 'dashboard';

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const MAX_FILE_COUNT = 32;

export default function App() {
  const [status, setStatus] = useState<AppStatus>('landing');
  const [stage, setStage] = useState<AnalysisStage>('ファイルを確認中');
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<NormalizedConversation[]>([]);
  const [diagnostics, setDiagnostics] = useState<ImportDiagnostics>(() => emptyImportDiagnostics());
  const [settings, setSettings] = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selection, setSelection] = useState<TermSelection | null>(null);
  const selectedTerm = selection?.term ?? null;
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | SVGElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [timelinePauseKey, setTimelinePauseKey] = useState(0);
  const [visualization, setVisualization] = useState<VisualizationMode>('mirror');
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const workerRef = useRef<Worker | null>(null);
  const operationRef = useRef(0);
  const analysisRequestRef = useRef(0);
  const exportRef = useRef<AbortController | null>(null);
  const exportGenerationRef = useRef(0);
  const noticeTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  const destroyWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const createWorker = useCallback(() => {
    destroyWorker();
    const nextWorker = new Worker(new URL('./workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    const operation = operationRef.current;
    nextWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (workerRef.current !== nextWorker || operationRef.current !== operation) return;
      const message = event.data;
      // A single worker processes messages in order, but an older completion can
      // arrive while a newer filter request is queued. Only the newest request
      // may replace the visible cloud or release the busy/export guard.
      if (message.requestId !== analysisRequestRef.current) return;
      if (message.type === 'PROGRESS') {
        setStage(message.stage);
        return;
      }
      if (message.type === 'ERROR') {
        operationRef.current += 1;
        analysisRequestRef.current += 1;
        nextWorker.terminate();
        workerRef.current = null;
        exportRef.current?.abort();
        exportRef.current = null;
        exportGenerationRef.current += 1;
        revokePromptprintObjectUrls();
        setBusy(false);
        setExporting(false);
        setStatus('landing');
        setError(message.message);
        setConversations([]);
        setResult(null);
        setSelection(null);
        setReturnFocusTo(null);
        setNotice(null);
        setSettings(DEFAULT_ANALYSIS_SETTINGS);
        setDiagnostics(message.diagnostics ?? emptyImportDiagnostics());
        return;
      }
      setConversations(message.conversations);
      setDiagnostics(message.diagnostics);
      setResult(message.result);
      setStatus('dashboard');
      setBusy(false);
      setError(null);
    };
    nextWorker.onerror = () => {
      if (workerRef.current !== nextWorker || operationRef.current !== operation) return;
      operationRef.current += 1;
      analysisRequestRef.current += 1;
      exportRef.current?.abort();
      exportRef.current = null;
      exportGenerationRef.current += 1;
      revokePromptprintObjectUrls();
      setBusy(false);
      setExporting(false);
      setStatus('landing');
      setError('解析処理を開始できませんでした。ページを再読み込みして、もう一度お試しください。');
      setConversations([]);
      setResult(null);
      setSelection(null);
      setReturnFocusTo(null);
      setNotice(null);
      setSettings(DEFAULT_ANALYSIS_SETTINGS);
      nextWorker.terminate();
      workerRef.current = null;
    };
    workerRef.current = nextWorker;
    return nextWorker;
  }, [destroyWorker]);

  useEffect(() => () => {
    destroyWorker();
    exportRef.current?.abort();
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    revokePromptprintObjectUrls();
  }, [destroyWorker]);

  const postRequest = useCallback((request: WorkerRequest, transfer: Transferable[] = []) => {
    const worker = workerRef.current ?? createWorker();
    worker.postMessage(request, transfer);
  }, [createWorker]);

  const startDemo = () => {
    operationRef.current += 1;
    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    const demo = createDemoConversations();
    const demoDiagnostics: ImportDiagnostics = {
      ...emptyImportDiagnostics(['合成デモ']),
      conversationsParsed: demo.length,
      messagesParsed: demo.reduce((sum, conversation) => sum + conversation.messages.length, 0),
    };
    setError(null);
    setBusy(true);
    setStage('テキストを正規化中');
    setStatus('processing');
    createWorker().postMessage({
      type: 'ANALYZE_NORMALIZED',
      requestId,
      conversations: demo,
      settings,
      diagnostics: demoDiagnostics,
    } satisfies WorkerRequest);
  };

  const startFiles = async (files: File[]) => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    setDiagnostics(emptyImportDiagnostics(files.map((file) => file.name)));
    if (files.length === 0) {
      setError('読み込むファイルを選んでください。');
      return;
    }
    if (files.length > MAX_FILE_COUNT) {
      setError(`一度に読み込めるファイルは${MAX_FILE_COUNT}件までです。分けてお試しください。`);
      return;
    }
    const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setError(`${oversized.name} は500MBの上限を超えています。小さく分けてからお試しください。`);
      return;
    }
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (!Number.isFinite(totalSize) || totalSize > MAX_FILE_BYTES) {
      setError('選択したファイルの合計が500MBの上限を超えています。分けてお試しください。');
      return;
    }

    setError(null);
    setBusy(true);
    setStage('ファイルを確認中');
    setStatus('processing');
    try {
      const payload: SerializableFile[] = await Promise.all(files.map(async (file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        bytes: await file.arrayBuffer(),
      })));
      if (operationRef.current !== operation) return;
      const buffers = payload.map((file) => file.bytes);
      postRequest({ type: 'IMPORT_AND_ANALYZE', requestId, files: payload, settings }, buffers);
    } catch {
      if (operationRef.current !== operation) return;
      setBusy(false);
      setStatus('landing');
      setError('ファイルを読み取れませんでした。アクセス権とファイルの状態を確認してください。');
    }
  };

  const cancel = () => {
    operationRef.current += 1;
    analysisRequestRef.current += 1;
    destroyWorker();
    setBusy(false);
    setStatus('landing');
    setError(null);
  };

  const updateSettings = (next: AnalysisSettings) => {
    exportRef.current?.abort();
    setSelection(null);
    setSettings(next);
    if (conversations.length === 0) return;
    setBusy(true);
    setStage('単語とフレーズを集計中');
    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    postRequest({
      type: 'ANALYZE_NORMALIZED',
      requestId,
      conversations,
      settings: next,
      diagnostics,
    });
  };

  const closeDrawer = useCallback(() => setSelection(null), []);

  const selectTerm = (term: LaidOutTerm, target: HTMLElement | SVGElement | null = null) => {
    setTimelinePauseKey((value) => value + 1);
    if (!result) return;
    setReturnFocusTo(target instanceof HTMLElement || target instanceof SVGElement ? target : null);
    setSelection({ term, contexts: result.contexts[term.term] ?? [], period: selectedPeriodLabel(result) });
  };

  const selectInsightTerm = (term: TermStats, target: HTMLButtonElement) => {
    if (!result) return;
    const laidOut = result.layout.find((candidate) => candidate.term === term.term);
    if (laidOut) selectTerm(laidOut, target);
  };

  const hideTerm = (term: string) => {
    closeDrawer();
    updateSettings({ ...settings, hiddenTerms: [...new Set([...settings.hiddenTerms, term])] });
    setNotice(`「${term}」を表示と書き出しから隠しました。`);
    window.setTimeout(() => setNotice(null), 3_000);
  };

  const clearData = () => {
    operationRef.current += 1;
    analysisRequestRef.current += 1;
    exportGenerationRef.current += 1;
    exportRef.current?.abort();
    exportRef.current = null;
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    destroyWorker();
    revokePromptprintObjectUrls();
    setConversations([]);
    setResult(null);
    setDiagnostics(emptyImportDiagnostics());
    setSelection(null);
    setReturnFocusTo(null);
    setBusy(false);
    setExporting(false);
    setError(null);
    setNotice(null);
    setConfirmClear(false);
    setSettings(DEFAULT_ANALYSIS_SETTINGS);
    setVisualization('mirror');
    setCamera(DEFAULT_CAMERA);
    setStatus('landing');
  };

  const requestClear = () => {
    if (confirmClear) {
      clearData();
      return;
    }
    setConfirmClear(true);
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => {
      setConfirmClear(false);
      clearTimerRef.current = null;
    }, 4_000);
  };

  const exportPng = async () => {
    setTimelinePauseKey((value) => value + 1);
    if (!result || busy || exporting) return;
    const operation = operationRef.current;
    const generation = exportGenerationRef.current + 1;
    exportGenerationRef.current = generation;
    const controller = new AbortController();
    exportRef.current?.abort();
    exportRef.current = controller;
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setExporting(true);
    try {
      setNotice('PNGを準備しています…');
      await downloadPromptprintPng(result, controller.signal, { view: visualization, camera });
      if (operationRef.current !== operation || exportGenerationRef.current !== generation) return;
      setNotice('PNGを書き出しました。');
    } catch (exportError: unknown) {
      if (controller.signal.aborted || operationRef.current !== operation || exportGenerationRef.current !== generation) return;
      setNotice(exportError instanceof Error ? exportError.message : 'PNGを書き出せませんでした。');
    } finally {
      if (operationRef.current === operation && exportGenerationRef.current === generation) {
        setExporting(false);
        exportRef.current = null;
        noticeTimerRef.current = window.setTimeout(() => {
          setNotice(null);
          noticeTimerRef.current = null;
        }, 3_000);
      }
    }
  };

  if (status === 'landing') return <Landing onDemo={startDemo} onFiles={startFiles} error={error} diagnostics={diagnostics} />;
  if (status === 'processing') return <ImportProgress stage={stage} onCancel={cancel} />;
  if (!result) return null;

  return (
    <main className="dashboard">
      <section className="dashboard__opening" aria-label="言葉の指紋の全体像">
        <TimelineControls result={result} settings={settings} busy={busy} blocked={exporting || !!selectedTerm || !!error} pauseKey={timelinePauseKey} onChange={updateSettings}>
          <VisualizationSwitch mode={visualization} disabled={exporting} onChange={(mode) => { setTimelinePauseKey((value) => value + 1); setVisualization(mode); }} />
        </TimelineControls>
        {visualization === 'spatial' ? <SpatialCloud result={result} camera={camera} disabled={exporting}
          onCameraChange={(next) => { setTimelinePauseKey((value) => value + 1); setCamera(next); }}
          onSelect={selectTerm} scopeLabel={datasetScopeLabel(result.summary, result.timeline?.sourceProviders)} /> : <MirrorCloud
          terms={result.layout}
          summary={result.summary}
          display={result.display}
          periodLabel={selectedPeriodLabel(result)}
          scopeLabel={datasetScopeLabel(result.summary, result.timeline?.sourceProviders)}
          showProviderCoverage={result.summary.providers.filter((provider) => provider !== 'demo').length > 1}
          onSelect={selectTerm}
          testId="mirror-cloud"
        />}
      </section>

      <section className="analysis-shell" id="analysis" aria-labelledby="analysis-title">
        <header className="analysis-toolbar">
          <div className="analysis-toolbar__identity">
            <span className="analysis-toolbar__label">分析</span>
          </div>
          <div className="dashboard__actions">
            <button
              className="button button--quiet button--small"
              type="button"
              aria-label="クラウド全体を見る"
              onClick={() => window.scrollTo({
                top: 0,
                left: 0,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
              })}
            >
              <span className="label--desktop">クラウド全体を見る</span><span className="label--mobile">全体</span>
            </button>
            <button className="button button--secondary button--small" type="button" disabled={busy || exporting} aria-busy={busy || exporting} aria-label={exporting ? '書き出し中…' : 'PNGを書き出す'} onClick={() => void exportPng()}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m0 0 4-4m-4 4L6 8M4 15v2h12v-2" /></svg>
              {exporting ? '書き出し中…' : <><span className="label--desktop">PNGを書き出す</span><span className="label--mobile">PNG</span></>}
            </button>
          </div>
        </header>

        <div className="dashboard__scroll">
          <div className="dashboard__intro">
            <div>
              <p className="section-kicker">言葉の指紋</p>
              <h1 id="analysis-title">あなたとAIの、<em>語彙の重なり。</em></h1>
              <p>{visualization === 'mirror' ? '左ほどあなた、右ほどAIの発言に現れる割合が高い語です。' : 'X軸の−1側ほどあなた、+1側ほどAIの発言に現れる割合が高い語です。回転後の画面の左右とは異なります。'}共有語彙は、双方で実際に観測され、出現率が近い語に限ります。</p>
            </div>
          </div>

          <StatsCards summary={result.summary} />
          <InsightSummary insights={result.insights} onSelectTerm={selectInsightTerm} />

          <details className="dash-fold">
            <summary><span>表示条件を変える</span><svg className="dash-fold__chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg></summary>
            <FilterBar
              settings={settings}
              providers={[...new Set(conversations.map((conversation) => conversation.provider))]}
              busy={busy}
              onChange={(next) => { setTimelinePauseKey((value) => value + 1); updateSettings(next); }}
            />
          </details>

          <details className="dash-fold">
            <summary><span>インサイトの詳細</span><svg className="dash-fold__chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg></summary>
            <InsightCards insights={result.insights} onSelectTerm={selectInsightTerm} />
          </details>

          <DiagnosticsPanel diagnostics={diagnostics} analysisDiagnostics={result.diagnostics} />

          <section className="method-note">
            <span aria-hidden="true">i</span>
            <div><strong>言葉の指紋の読み方</strong><p>{visualization === 'mirror' ? '2Dの左右は「その語を含む発言の割合」の役割間比較、上下に意味はありません。大きさは出現発言数と会話カバー件数の対数スコアです。' : '3DはX＝役割間の使用傾向、Y＝役割別発言出現率の均等平均、Z＝対象会話のカバー率です。点・文字の大きさに意味はありません。'}文章の長さを補正する指標ではなく、重要性や正しさも示しません。分かち書きと複合語の抽出はヒューリスティックです。</p></div>
          </section>

          <footer className="dashboard__footer">
            <div className="dashboard__footer-copy">
              <Brand compact />
              <p>解析はすべてこのブラウザ内で完結します。原文を保存・送信することはありません。</p>
            </div>
            <button
              className={`button button--quiet button--small dashboard__clear${confirmClear ? ' button--danger-confirm' : ''}`}
              type="button"
              aria-label={confirmClear ? '消去を実行' : '解析データを消去'}
              onClick={requestClear}
            >
              {confirmClear ? 'もう一度押して消去' : '解析データを消去'}
            </button>
          </footer>
        </div>
      </section>

      {notice && <div className="toast" role="status">{notice}</div>}
      <TermContextDrawer
        key={selectedTerm?.term ?? 'closed'}
        term={selectedTerm}
        contexts={selection?.contexts ?? []}
        periodLabel={selection?.period}
        returnFocusTo={returnFocusTo}
        onClose={closeDrawer}
        onHide={hideTerm}
      />
    </main>
  );
}
