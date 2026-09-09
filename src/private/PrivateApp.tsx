import { useCallback, useEffect, useRef, useState } from 'react';
import { privateDatasetScopeLabel, selectedPeriodLabel } from '../analysis/presentation';
import { Brand } from '../components/Brand';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { FilterBar } from '../components/FilterBar';
import { InsightCards } from '../components/InsightCards';
import { InsightSummary } from '../components/InsightSummary';
import { MirrorCloud } from '../components/MirrorCloud';
import { SpatialCloud } from '../components/SpatialCloud';
import { VisualizationSwitch, type VisualizationMode } from '../components/VisualizationSwitch';
import { DEFAULT_CAMERA, type Camera } from '../analysis/spatial';
import { StatsCards } from '../components/StatsCards';
import { TermContextDrawer, type TermSelection } from '../components/TermContextDrawer';
import { TimelineControls } from '../components/TimelineControls';
import { emptyImportDiagnostics } from '../domain/diagnostics';
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisResult, type AnalysisSettings, type LaidOutTerm, type TermStats } from '../domain/models';
import { downloadPromptprintPng, revokePromptprintObjectUrls } from '../utils/exportPng';
import type { PrivateAnalysisRequest, PrivateAnalysisResponse } from './analysisProtocol';
import { createChromeTransport } from './chromeTransport';
import type { PrivateSyncSnapshot } from './models';
import { PrivateSyncController } from './sync';
import { PrivateNormalizer } from './normalizer';

type Target = 100 | 500 | 1000 | 3000;
const EMAIL_KEY = 'promptprint-private:expected-email';
const ACTIVE_PHASES = new Set(['connecting', 'listing', 'fetching', 'waiting']);
const PHASE_LABELS: Record<PrivateSyncSnapshot['phase'], string> = {
  idle: '接続待ち', connecting: '本人の接続を確認中', listing: '会話一覧を取得中',
  fetching: '会話本文を取得中', waiting: '再試行まで待機中', paused: '停止中・再開できます',
  'auth-required': '認証接続待ち', blocked: 'アクセス制限で停止', complete: '今回の取得を終了', error: '取得を停止しました',
};

const storedEmail = () => {
  try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; }
};

export function PrivateApp() {
  const [email, setEmail] = useState(storedEmail);
  const [target, setTarget] = useState<Target>(1000);
  const [snapshot, setSnapshot] = useState<PrivateSyncSnapshot | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [settings, setSettings] = useState<AnalysisSettings>(DEFAULT_ANALYSIS_SETTINGS);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisStage, setAnalysisStage] = useState('');
  const [analysisLoaded, setAnalysisLoaded] = useState({ threads: 0, messages: 0 });
  const [selection, setSelection] = useState<TermSelection | null>(null);
  const selectedTerm = selection?.term ?? null;
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | SVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [timelinePauseKey, setTimelinePauseKey] = useState(0);
  const [visualization, setVisualization] = useState<VisualizationMode>('mirror');
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [clock, setClock] = useState(Date.now);
  const controllerRef = useRef<PrivateSyncController | null>(null);
  const normalizerRef = useRef<PrivateNormalizer | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const snapshotRef = useRef<PrivateSyncSnapshot | null>(null);
  const settingsRef = useRef(settings);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const actionGenerationRef = useRef(0);
  const busyRef = useRef(false);
  const clearingRef = useRef(false);
  const lastAnalysisRef = useRef({ revision: -1, fetched: 0, at: 0, namespace: '' });
  const exportRef = useRef<AbortController | null>(null);
  const closeDrawer = useCallback(() => setSelection(null), []);

  const installController = useCallback((expectedEmail: string) => {
    unsubscribeRef.current?.();
    if (controllerRef.current) {
      // A controller belongs to one explicitly confirmed identity. Never keep
      // its old chart under a new email, even if the new connection is refused.
      requestRef.current += 1;
      workerRef.current?.terminate();
      workerRef.current = null;
      exportRef.current?.abort();
      exportRef.current = null;
      revokePromptprintObjectUrls();
      busyRef.current = false;
      lastAnalysisRef.current = { revision: -1, fetched: 0, at: 0, namespace: '' };
      settingsRef.current = DEFAULT_ANALYSIS_SETTINGS;
      setSettings(DEFAULT_ANALYSIS_SETTINGS);
      setResult(null);
      setAnalysisError(null);
      setSelection(null);
      setReturnFocusTo(null);
      setAnalysisLoaded({ threads: 0, messages: 0 });
      setAnalysisStage('');
      setAnalysisBusy(false);
      setExporting(false);
    }
    controllerRef.current?.dispose();
    normalizerRef.current?.dispose();
    const normalizer = new PrivateNormalizer();
    normalizerRef.current = normalizer;
    const controller = new PrivateSyncController({ transport: createChromeTransport(), expectedEmail, normalize: normalizer.normalize });
    controllerRef.current = controller;
    const update = (next: PrivateSyncSnapshot) => {
      if (clearingRef.current) return;
      snapshotRef.current = next;
      setSnapshot(next);
      if (next.namespace === null && next.notice.includes('OTHER_TAB_CLEARED')) {
        // Another extension page owns the clear operation. Drop local mirrors
        // immediately, but never rebroadcast or call clear recursively.
        actionGenerationRef.current += 1;
        requestRef.current += 1;
        workerRef.current?.terminate();
        workerRef.current = null;
        normalizerRef.current?.dispose();
        exportRef.current?.abort();
        exportRef.current = null;
        revokePromptprintObjectUrls();
        busyRef.current = false;
        lastAnalysisRef.current = { revision: -1, fetched: 0, at: 0, namespace: '' };
        settingsRef.current = DEFAULT_ANALYSIS_SETTINGS;
        setSettings(DEFAULT_ANALYSIS_SETTINGS);
        setResult(null);
        setSelection(null);
        setReturnFocusTo(null);
        setAnalysisLoaded({ threads: 0, messages: 0 });
        setAnalysisStage('');
        setAnalysisBusy(false);
        setActionBusy(false);
        setExporting(false);
        setConfirmClear(false);
        setNotice('別の個人用タブで全消去が開始されたため、この画面の解析結果も消去しました。');
        try { localStorage.removeItem(EMAIL_KEY); } catch { /* Clearing the view must not depend on preferences. */ }
      }
      if (next.identity) {
        try { localStorage.setItem(EMAIL_KEY, next.identity.email); } catch { /* IndexedDB remains the authoritative store. */ }
      }
    };
    unsubscribeRef.current = controller.subscribe(update);
    update(controller.getSnapshot());
    return controller;
  }, []);

  const stopAnalysis = useCallback(() => {
    requestRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
    setAnalysisBusy(false);
  }, []);

  const analyze = useCallback((force = false) => {
    const current = snapshotRef.current;
    if (clearingRef.current || !current?.namespace || !current.fetchedCount || busyRef.current) return;
    const previous = lastAnalysisRef.current;
    const sameNamespace = previous.namespace === current.namespace;
    const terminal = !ACTIVE_PHASES.has(current.phase);
    if (!force && sameNamespace) {
      if (previous.revision === current.revision) return;
      if (!terminal && (current.fetchedCount - previous.fetched < 25 || Date.now() - previous.at < 30_000)) return;
      // Revision, not body count, identifies the selected corpus: updates and
      // a changed target can replace stored bodies without changing this count.
    }
    if (!force && !terminal && !previous.fetched && current.fetchedCount < 25) return;
    const worker = workerRef.current ?? new Worker(new URL('./private-analysis.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const requestId = ++requestRef.current;
    busyRef.current = true;
    setAnalysisBusy(true);
    setAnalysisError(null);
    setAnalysisStage('保存済みの本文を読み込み中');
    lastAnalysisRef.current = { revision: current.revision, fetched: current.fetchedCount, at: Date.now(), namespace: current.namespace };
    worker.onmessage = (event: MessageEvent<PrivateAnalysisResponse>) => {
      if (workerRef.current !== worker || event.data.requestId !== requestRef.current) return;
      const message = event.data;
      if (message.type === 'PROGRESS') { setAnalysisStage(message.stage); return; }
      busyRef.current = false;
      setAnalysisBusy(false);
      if (message.type === 'ERROR') { setAnalysisError(message.message); return; }
      setResult(message.result);
      setAnalysisLoaded({ threads: message.loadedThreads, messages: message.loadedMessages });
      setAnalysisStage('保存済み本文の解析を完了');
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      worker.terminate();
      workerRef.current = null;
      busyRef.current = false;
      setAnalysisBusy(false);
      setAnalysisError('解析処理を開始できませんでした。取得済み本文は端末内に残っています。「再解析」で再試行できます。');
    };
    worker.postMessage({
      type: 'ANALYZE_STORED', requestId, namespace: current.namespace, revision: current.revision,
      settings: settingsRef.current, skippedCount: current.diagnostics.skippedMessages,
    } satisfies PrivateAnalysisRequest);
  }, []);

  useEffect(() => {
    let active = true;
    try {
      const controller = installController(storedEmail());
      void controller.restore().then(() => {
        if (!active) return;
        const restored = controller.getSnapshot();
        if (restored.identity) setEmail(restored.identity.email);
        setTarget(restored.target);
        analyze(true);
      }).catch(() => { if (active) setError('端末内の取得記録を復元できませんでした。接続確認を再試行してください。'); });
    } catch {
      setError('この画面は未公開のローカルChrome拡張で開いてください。通常のWeb版から履歴を取得することはありません。');
    }
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
      unsubscribeRef.current?.();
      const controller = controllerRef.current;
      if (controller) void controller.pause().then(() => controller.dispose(), () => controller.dispose());
      normalizerRef.current?.dispose();
      workerRef.current?.terminate();
      workerRef.current = null;
      exportRef.current?.abort();
      revokePromptprintObjectUrls();
    };
  }, [installController, analyze]);

  useEffect(() => { analyze(); }, [snapshot, analysisBusy, clock, analyze]);

  const run = async (mode: 'probe' | 'start' | 'resume') => {
    if (!email.trim()) { setError('取得する個人アカウントのメールアドレスを入力してください。パスワードやトークンは不要です。'); return; }
    setError(null);
    setNotice(null);
    setActionBusy(true);
    const generation = ++actionGenerationRef.current;
    try {
      let controller = controllerRef.current;
      if (!controller || snapshotRef.current?.identity?.email.toLowerCase() !== email.trim().toLowerCase()) {
        if (controller) await controller.pause();
        controller = installController(email.trim());
        await controller.restore();
      }
      if (mode === 'probe') await controller.probe();
      else if (mode === 'resume' && snapshotRef.current?.target === target) await controller.resume();
      else await controller.start(target);
      if (actionGenerationRef.current === generation) analyze();
    } catch {
      if (actionGenerationRef.current === generation) setError('取得処理を開始できませんでした。ChatGPTで本人の個人ワークスペースにログインし、この画面で再開してください。');
    } finally {
      if (actionGenerationRef.current === generation) setActionBusy(false);
    }
  };

  const pause = async () => {
    actionGenerationRef.current += 1;
    setActionBusy(false);
    const paused = controllerRef.current?.pause();
    normalizerRef.current?.dispose();
    await paused;
    analyze();
  };

  const clear = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearingRef.current = true;
    snapshotRef.current = null;
    setSnapshot(null);
    actionGenerationRef.current += 1;
    stopAnalysis();
    exportRef.current?.abort();
    exportRef.current = null;
    revokePromptprintObjectUrls();
    setExporting(false);
    setResult(null);
    setAnalysisError(null);
    setSelection(null);
    setReturnFocusTo(null);
    setAnalysisLoaded({ threads: 0, messages: 0 });
    setAnalysisStage('');
    lastAnalysisRef.current = { revision: -1, fetched: 0, at: 0, namespace: '' };
    settingsRef.current = DEFAULT_ANALYSIS_SETTINGS;
    setSettings(DEFAULT_ANALYSIS_SETTINGS);
    setActionBusy(false);
    try {
      const cleared = controllerRef.current?.clear();
      normalizerRef.current?.dispose();
      await cleared;
      localStorage.removeItem(EMAIL_KEY);
      setNotice('この個人用拡張が保存した会話・進捗を消去しました。ChatGPT側の履歴は変更していません。');
      setConfirmClear(false);
    } catch { setError('端末内データの全消去を確認できませんでした。取得を再開せず、拡張機能の保存データを確認してください。'); }
    finally { clearingRef.current = false; }
  };

  const updateSettings = (next: AnalysisSettings) => {
    settingsRef.current = next;
    setSettings(next);
    // Only terminate an in-flight job. An idle worker can reuse its resident
    // corpus for filters without reading/cloning every stored body again.
    if (busyRef.current) stopAnalysis();
    exportRef.current?.abort();
    setSelection(null);
    analyze(true);
  };
  const selectTerm = (term: LaidOutTerm, element: HTMLElement | SVGElement) => {
    setTimelinePauseKey((value) => value + 1);
    if (!result) return;
    setReturnFocusTo(element);
    setSelection({ term, contexts: result.contexts[term.term] ?? [], period: selectedPeriodLabel(result) });
  };
  const selectInsight = (term: TermStats, element: HTMLButtonElement) => {
    const placed = result?.layout.find((candidate) => candidate.term === term.term);
    if (placed) selectTerm(placed, element);
  };
  const partial = snapshot?.phase !== 'complete' || snapshot.failedCount > 0;
  const sourceLabel = result ? privateDatasetScopeLabel(result.summary, partial) : '';

  const exportPng = async () => {
    setTimelinePauseKey((value) => value + 1);
    if (!result || analysisBusy || exporting) return;
    const controller = new AbortController();
    exportRef.current?.abort();
    exportRef.current = controller;
    setExporting(true);
    try {
      await downloadPromptprintPng(result, controller.signal, { privateSource: { partial }, view: visualization, camera });
      if (!controller.signal.aborted) setNotice('実データのPNGを端末へ保存しました。非公開の画像として扱ってください。');
    } catch {
      if (!controller.signal.aborted) setError('PNGを書き出せませんでした。再試行してください。');
    } finally {
      if (exportRef.current === controller) { setExporting(false); exportRef.current = null; }
    }
  };

  const active = snapshot ? ACTIVE_PHASES.has(snapshot.phase) : false;
  const elapsed = snapshot?.startedAt ? Math.max(0, Math.floor(((active ? clock : snapshot.updatedAt ?? clock) - snapshot.startedAt) / 1000)) : 0;
  const stats = [
    ['一覧取得', snapshot?.listedCount ?? 0, 'スレッド'],
    ['本文取得済み', snapshot?.fetchedCount ?? 0, 'スレッド'],
    ['取得済み発言', snapshot?.messageCount ?? 0, '発言'],
    ['解析済み', result?.summary.conversationCount ?? 0, 'スレッド'],
    ['取得失敗', snapshot?.failedCount ?? 0, 'スレッド'],
    ['目標内の未取得', snapshot?.pendingCount ?? 0, 'スレッド'],
  ] as const;

  return (
    <div className="private-app">
      <header className="private-header"><Brand compact /><span>個人用 · 非公開 · 端末内保存あり</span></header>
      <main>
        <section className="private-control" aria-labelledby="private-title">
          <p className="section-kicker">エクスポートを待たずに、本人の履歴から。</p>
          <h1 id="private-title">あなたの会話を、<br className="private-break" />ひとつの指紋に。</h1>
          <p className="private-description">ログイン中のChatGPTから本文を読み取り、このChrome拡張の中だけで保存・解析します。取得中も途中結果を見られます。</p>
          <form className="private-form" onSubmit={(event) => { event.preventDefault(); void run('start'); }}>
            <label>本人の個人アカウント<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={active || actionBusy} placeholder="ChatGPTで使っているメールアドレス" required /></label>
            <label>取得する直近のスレッド数<select value={target} disabled={active || actionBusy} onChange={(event) => setTarget(Number(event.target.value) as Target)}>{([100, 500, 1000, 3000] as const).map((count) => <option key={count} value={count}>{count.toLocaleString('ja-JP')}スレッド</option>)}</select></label>
            <div className="private-actions">
              <button className="button button--primary" type="submit" disabled={active || actionBusy}>{snapshot?.fetchedCount ? '選択件数まで取得する' : '接続して取得を開始'}</button>
              {active || actionBusy
                ? <button className="button button--secondary" type="button" onClick={() => void pause()}>取得を停止</button>
                : <button className="button button--secondary" type="button" onClick={() => void run(snapshot?.fetchedCount ? 'resume' : 'probe')}>{snapshot?.fetchedCount ? '取得を再開' : '接続確認（本文3件）'}</button>}
            </div>
          </form>
          <p className="private-boundary">通信先はChatGPTのみ。運営サーバー・外部AIには本文を送りません。公式連携ではなく、非公開仕様の変更やアカウント制限のリスクがある個人用検証です。</p>
          {error && <p className="private-alert" role="alert">{error}</p>}
          {analysisError && <p className="private-alert" role="alert">{analysisError}</p>}
          {notice && <p className="private-notice" role="status">{notice}</p>}
        </section>

        <section className="private-progress" aria-label="取得と解析の進捗" data-testid="private-status" data-phase={snapshot?.phase ?? 'idle'} data-fetched={snapshot?.fetchedCount ?? 0} data-messages={snapshot?.messageCount ?? 0} data-analyzed={result?.summary.conversationCount ?? 0} data-failed={snapshot?.failedCount ?? 0}>
          <div className="private-progress__heading"><strong role="status">{snapshot ? PHASE_LABELS[snapshot.phase] : '認証接続待ち'}</strong><span>経過 {Math.floor(elapsed / 60)}分 {elapsed % 60}秒</span></div>
          <dl className="private-stats">{stats.map(([label, value, suffix]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString('ja-JP')}<small>{suffix}</small></dd></div>)}</dl>
          <p>{snapshot?.notice || 'ChatGPTを同じChromeで開き、個人ワークスペースに切り替えてから接続してください。'}</p>
          <p>{snapshot?.order === 'updated' ? '直近＝更新日時順' : snapshot?.order === 'created' ? '直近＝作成日時順' : '一覧の日時順は未確認'} · 対象一覧の総数 {snapshot?.totalAvailable?.toLocaleString('ja-JP') ?? '不明'} · 未取得は今回の目標内で、取得失敗分を除いた件数です。アーカイブ・プロジェクト等の網羅性は保証しません。</p>
          {snapshot?.identity && <p>保存済み対象：{snapshot.identity.email} · 個人ワークスペース · 再開時に現在のログイン先を照合します。</p>}
          <p>{analysisBusy ? analysisStage : `解析へ読み込んだ本文 ${analysisLoaded.threads.toLocaleString('ja-JP')}スレッド / ${analysisLoaded.messages.toLocaleString('ja-JP')}発言`} · 現在の表示 {result?.summary.conversationCount.toLocaleString('ja-JP') ?? 0}スレッド / {((result?.summary.userMessageCount ?? 0) + (result?.summary.assistantMessageCount ?? 0)).toLocaleString('ja-JP')}発言</p>
          {snapshot && (snapshot.diagnostics.skippedMessages > 0 || snapshot.diagnostics.truncatedConversations > 0) && <p className="private-alert">正規化で除外 {snapshot.diagnostics.skippedMessages}発言 · 上限等の診断 {snapshot.diagnostics.truncatedConversations}スレッド。本文取得数と解析対象数は一致しない場合があります。</p>}
          {snapshot?.retryAt && active && <p>次の再試行まで {Math.max(0, Math.ceil((snapshot.retryAt - clock) / 1000))}秒。制限待機は迂回しません。</p>}
        </section>

        {result && <div className="dashboard private-dashboard">
          <section className="dashboard__opening" aria-label="実データの言葉の指紋">
            <TimelineControls result={result} settings={settings} busy={analysisBusy} blocked={exporting || !!selectedTerm || !!analysisError || active || actionBusy} pauseKey={timelinePauseKey} onChange={updateSettings}>
              <VisualizationSwitch mode={visualization} disabled={exporting} onChange={(mode) => { setTimelinePauseKey((value) => value + 1); setVisualization(mode); }} />
            </TimelineControls>
            {visualization === 'spatial' ? <SpatialCloud result={result} camera={camera} disabled={exporting} onCameraChange={(next) => { setTimelinePauseKey((value) => value + 1); setCamera(next); }} onSelect={selectTerm} scopeLabel={sourceLabel} /> : <MirrorCloud terms={result.layout} summary={result.summary} display={result.display} periodLabel={selectedPeriodLabel(result)} onSelect={selectTerm} testId="mirror-cloud" scopeLabel={sourceLabel} privacyHint="本人の端末内で保存・解析" />}
          </section>
          <section className="analysis-shell" aria-labelledby="analysis-title">
            <header className="analysis-toolbar"><span>実データの分析</span><div className="dashboard__actions"><button className="button button--quiet button--small" type="button" disabled={analysisBusy} onClick={() => analyze(true)}>再解析</button><button className="button button--secondary button--small" type="button" disabled={analysisBusy || exporting} onClick={() => void exportPng()}>{exporting ? '書き出し中…' : 'PNGを書き出す'}</button></div></header>
            <div className="dashboard__scroll">
              <div className="dashboard__intro"><div><p className="section-kicker">言葉の指紋</p><h2 id="analysis-title">あなたとAIの、語彙の重なり。</h2><p>取得・解析できた本文だけの傾向です。未取得の会話を含む全履歴の分析ではありません。</p></div></div>
              <StatsCards summary={result.summary} />
              <InsightSummary insights={result.insights} onSelectTerm={selectInsight} />
              <details className="dash-fold"><summary>表示条件を変える</summary><FilterBar settings={settings} providers={['chatgpt']} busy={analysisBusy} onChange={(next) => { setTimelinePauseKey((value) => value + 1); updateSettings(next); }} /></details>
              <details className="dash-fold"><summary>インサイトの詳細</summary><InsightCards insights={result.insights} onSelectTerm={selectInsight} /></details>
              <DiagnosticsPanel diagnostics={emptyImportDiagnostics()} analysisDiagnostics={result.diagnostics} />
              <section className="method-note"><span aria-hidden="true">i</span><div><strong>位置と大きさの読み方</strong><p>{visualization === 'mirror' ? '2Dの左右は「その語を含む発言の割合」の役割間比較、上下に意味はありません。大きさは出現発言数と会話カバー件数の対数スコアです。' : '3DはX＝使用傾向、Y＝役割別発言出現率の均等平均、Z＝対象会話のカバー率です。点・文字の大きさに意味はありません。'}文章の長さを補正する指標ではありません。共有語彙は双方で実際に観測され、出現率が近い語に限ります。</p></div></section>
            </div>
          </section>
        </div>}
        {!result && <section className="private-empty" aria-live="polite"><h2>{analysisBusy ? '最初の言葉の指紋を集計しています' : '本文が届くと、ここに図が現れます'}</h2><p>最初の25スレッドで可視化し、その後は取得を続けながら一定間隔で更新します。停止しても保存済み本文と進捗は残ります。</p></section>}
        <footer className="private-footer"><div><strong>保存場所と消去</strong><p>このChromeプロファイル内・この拡張専用のIndexedDBに、正規化した会話本文と進捗を保存します。タブを閉じると取得は停止します。次にこの画面を開けば復元され、「取得を再開」で続けられます。認証トークン・Cookieは解析DBに保存しません。</p><p>既存Web版は引き続き無送信・無保存です。PNGには原文やタイトルを含めませんが、実データ由来の語があるため私的に保管してください。</p></div><div className="private-clear"><button className={`button button--quiet button--small${confirmClear ? ' button--danger-confirm' : ''}`} type="button" onClick={() => void clear()}>{confirmClear ? '全消去を実行する' : '端末内の会話・進捗を全消去'}</button>{confirmClear && <button className="button button--quiet button--small" type="button" onClick={() => setConfirmClear(false)}>取り消す</button>}</div></footer>
      </main>
      <TermContextDrawer key={selectedTerm?.term ?? 'closed'} term={selectedTerm} contexts={selection?.contexts ?? []} periodLabel={selection?.period} returnFocusTo={returnFocusTo} onClose={closeDrawer} onHide={(term) => updateSettings({ ...settings, hiddenTerms: [...new Set([...settings.hiddenTerms, term])] })} />
    </div>
  );
}
