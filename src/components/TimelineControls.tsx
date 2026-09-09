import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildTimelineFrames, MAX_TIMELINE_FRAMES, validateDateRange, type TimelineMode, type TimelineStep } from '../analysis/timeline';
import { selectedPeriodLabel } from '../analysis/presentation';
import type { AnalysisResult, AnalysisSettings } from '../domain/models';

interface Props {
  result: AnalysisResult;
  settings: AnalysisSettings;
  busy: boolean;
  blocked: boolean;
  pauseKey: number;
  onChange: (settings: AnalysisSettings) => void;
  children?: ReactNode;
}

/** One completed analysis at a time. No queued timers, frame interpolation or persistence. */
export function TimelineControls({ result, settings, busy, blocked, pauseKey, onChange, children }: Props) {
  const metadata = result.timeline;
  const [start, setStart] = useState(() => metadata?.appliedRange?.startDate || metadata?.startDate || '');
  const [end, setEnd] = useState(() => metadata?.appliedRange?.endDate || metadata?.endDate || '');
  const [step, setStep] = useState<TimelineStep>('month');
  const [mode, setMode] = useState<TimelineMode>('window');
  const [delay, setDelay] = useState(2000);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [previousResult, setPreviousResult] = useState(result);
  if (previousResult !== result) {
    setPreviousResult(result);
    // Completed external presets refresh the editing/replay window. A custom
    // frame must never shrink the full chosen playback window to that frame.
    if (settings.timeRange !== 'custom') {
      setStart(metadata?.appliedRange?.startDate || metadata?.startDate || '');
      setEnd(metadata?.appliedRange?.endDate || metadata?.endDate || '');
    }
  }
  const [pending, setPending] = useState<{ previous: AnalysisResult; startDate: string; endDate: string } | null>(null);
  const latest = useRef({ settings, onChange, result });
  useEffect(() => { latest.current = { settings, onChange, result }; }, [settings, onChange, result]);
  const frames = useMemo(() => buildTimelineFrames(start, end, step, mode), [start, end, step, mode]);
  const rangeError = validateDateRange(start, end);
  const playbackError = rangeError || (!start || !end ? '再生するには開始日と終了日を指定してください。' :
    !frames.length ? `${MAX_TIMELINE_FRAMES}時点を超えます。月単位にするか期間を短くしてください。` : null);
  // Manual analysis filters invalidate the playback cursor, but automatic date changes do not.
  const filtersKey = JSON.stringify({ ...settings, timeRange: undefined, startDate: undefined, endDate: undefined });
  const guardKey = `${filtersKey}:${pauseKey}:${blocked}`;
  const [previousGuard, setPreviousGuard] = useState({ key: guardKey, filtersKey, timeRange: settings.timeRange });
  if (guardKey !== previousGuard.key || settings.timeRange !== previousGuard.timeRange) {
    setPreviousGuard({ key: guardKey, filtersKey, timeRange: settings.timeRange });
    // Changing only the date preset is our own first-frame request, including
    // replay started from a relative-date filter rather than all-time.
    const ownDateChange = !blocked && settings.timeRange === 'custom' && pending &&
      settings.startDate === pending.startDate && settings.endDate === pending.endDate &&
      previousGuard.key === guardKey;
    if (!ownDateChange) setPlaying(false);
    if (settings.timeRange !== 'custom' || filtersKey !== previousGuard.filtersKey) { setCursor(null); setPending(null); }
  }
  const applied = result.timeline?.appliedRange;
  const completed = pending !== null && result !== pending.previous;
  const matches = applied?.startDate === pending?.startDate && applied?.endDate === pending?.endDate;
  if (playing && !busy && completed && (!matches || cursor === frames.length - 1)) setPlaying(false);
  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => document.removeEventListener('visibilitychange', stopWhenHidden);
  }, []);

  const showFrame = useCallback((index: number) => {
    const frame = frames[index];
    if (!frame) return;
    const current = latest.current;
    setPending({ previous: current.result, startDate: frame.startDate, endDate: frame.endDate });
    setCursor(index);
    current.onChange({ ...current.settings, timeRange: 'custom', startDate: frame.startDate, endDate: frame.endDate });
  }, [frames]);

  useEffect(() => {
    if (!playing || busy || blocked || cursor === null) return;
    if (!completed || !matches || cursor >= frames.length - 1) return;
    const timer = window.setTimeout(() => showFrame(cursor + 1), delay);
    return () => window.clearTimeout(timer);
  }, [playing, busy, blocked, cursor, completed, matches, result, frames.length, delay, showFrame]);

  const edit = () => { setPlaying(false); setCursor(null); setPending(null); };
  const canRequest = !busy && !blocked;
  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (!canRequest || playbackError || document.hidden) return;
    setPlaying(true);
    const next = cursor === null || cursor >= frames.length - 1 ? 0 : cursor;
    showFrame(next);
  };
  const apply = () => {
    if (!canRequest || rangeError) return;
    edit();
    onChange({ ...settings, timeRange: 'custom', startDate: start, endDate: end });
  };

  return <section className="timeline" aria-label="期間と時系列プレビュー">
    <div className="timeline__bar">
      <div className="timeline__period">
        <span>表示中の期間 <small>日本時間</small></span>
        <strong data-testid="timeline-current-period">{selectedPeriodLabel(result)}</strong>
      </div>
      {children}
      <button type="button" className="timeline__play" disabled={!playing && (!canRequest || !!playbackError)} onClick={play}>
        {playing ? '再生を停止' : '時系列を再生'}
      </button>
      <span className="timeline__status" role="status">{busy ? '集計中… 表示は直前の結果です' : playing ? '再生中' : cursor !== null ? `${cursor + 1} / ${frames.length} 時点` : `${frames.length || '—'} 時点`}</span>
    </div>
    <details className="timeline__details" onToggle={(event) => { if (!event.currentTarget.open) setPlaying(false); }}>
      <summary>期間・時系列</summary>
      <div className="timeline__options">
        <p>絞り込み・再生に使う期間。日付の編集後は「期間を適用」、変化を見るときは「時系列を再生」を押してください。</p>
        <div className="timeline__dates">
          <label>開始日<input type="date" value={start} onChange={(event) => { edit(); setStart(event.target.value); }} /></label>
          <span aria-hidden="true">–</span>
          <label>終了日<input type="date" value={end} onChange={(event) => { edit(); setEnd(event.target.value); }} /></label>
          <button type="button" disabled={!canRequest || !!rangeError} onClick={apply}>期間を適用</button>
          <button type="button" disabled={!canRequest} onClick={() => {
            edit(); setStart(metadata?.startDate || ''); setEnd(metadata?.endDate || '');
            onChange({ ...settings, timeRange: 'all', startDate: '', endDate: '' });
          }}>全期間に戻す</button>
        </div>
        <div className="timeline__transport">
          <label>再生単位<select value={step} onChange={(event) => { edit(); setStep(event.target.value as TimelineStep); }}><option value="day">日ごと</option><option value="month">月ごと</option></select></label>
          <label>再生方法<select value={mode} onChange={(event) => { edit(); setMode(event.target.value as TimelineMode); }}><option value="window">その期間だけ</option><option value="cumulative">開始日から累積</option></select></label>
          <label>表示間隔<select value={delay} onChange={(event) => setDelay(Number(event.target.value))}><option value={1000}>1秒</option><option value={2000}>2秒</option><option value={4000}>4秒</option></select></label>
          <button type="button" aria-label="前の期間" disabled={!canRequest || cursor === null || cursor <= 0} onClick={() => { setPlaying(false); showFrame((cursor ?? 0) - 1); }}>←</button>
          <input type="range" aria-label="表示する時点" min={0} max={Math.max(0, frames.length - 1)} value={cursor ?? 0} disabled={!canRequest || !!playbackError} onChange={(event) => { setPlaying(false); showFrame(Number(event.target.value)); }} />
          <button type="button" aria-label="次の期間" disabled={!canRequest || !!playbackError || (cursor !== null && cursor >= frames.length - 1)} onClick={() => { setPlaying(false); showFrame(cursor === null ? 0 : cursor + 1); }}>→</button>
        </div>
        {rangeError ? <p role="alert">{rangeError}</p> : playbackError && <p>{playbackError}</p>}
        <p>発言日時で絞り込み、なければ会話の作成・更新日時を使います。日時不明 {metadata?.undatedMessageCount ?? 0}発言は全期間のみ（会話日時で補完 {metadata?.fallbackMessageCount ?? 0}発言）。</p>
        <p>空の期間も表示します。集計完了後に指定秒数待って進みます。停止時は処理中の1時点を表示して止まります。</p>
      </div>
    </details>
  </section>;
}
