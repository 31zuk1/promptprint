import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { biasName, messageRateLabel, QUOTA_READING, selectedPeriodLabel, tokenRateLabel, vocabularySelectionLabel } from '../analysis/presentation';
import { clampCamera, createSpatialPoints, DEFAULT_CAMERA, type Camera } from '../analysis/spatial';
import { createSpatialScene, SPATIAL_FONT_SIZE, SPATIAL_POINT_RADIUS, SPATIAL_RATE_READING, SPATIAL_READING, SPATIAL_VIEW_READING } from '../analysis/spatialScene';
import type { AnalysisResult, LaidOutTerm } from '../domain/models';
import { TermMetrics } from './TermMetrics';

interface Props {
  result: AnalysisResult; camera: Camera; onCameraChange: (camera: Camera) => void;
  onSelect: (term: LaidOutTerm, target: HTMLElement | SVGElement) => void;
  scopeLabel: string; disabled?: boolean;
}
const percent = (value: number) => `${(value * 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%`;

export function SpatialCloud({ result, camera, onCameraChange, onSelect, scopeLabel, disabled }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointer: number; x: number; y: number; camera: Camera } | null>(null);
  const [size, setSize] = useState({ width: 1100, height: 540 });
  const [chosen, setChosen] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const points = useMemo(() => createSpatialPoints(result.layout, result.summary), [result]);
  const selected = points.find((point) => point.term.term === chosen) ?? points[0];
  const active = points.find((point) => point.term.term === hovered) ?? selected;
  const scene = useMemo(() => createSpatialScene(points, camera, size.width, size.height, active?.term.term), [points, camera, size, active?.term.term]);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setSize({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
    update(); const observer = new ResizeObserver(update); observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const change = (next: Partial<Camera>) => { if (!disabled) onCameraChange(clampCamera({ ...camera, ...next })); };
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointer !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const comparisonMissing = !result.summary.userMessageCount || !result.summary.assistantMessageCount;
  return <section className="spatial-view" aria-label="語彙の3D分布">
    <div className="spatial-heading"><div><span className="section-kicker">3つの指標で見る</span><h2>語の広がりを、立体で。</h2></div><span>正射影 · 固定スケール</span></div>
    <div className="spatial-legend" aria-label="3Dの軸の意味">
      <p><b>X</b><span>使用傾向<small>あなた −1 ↔ AI +1</small></span></p>
      <p><b>Y</b><span>発言出現率<small>役割均等 · 0–100%</small></span></p>
      <p><b>Z</b><span>会話カバー率<small>対象会話に占める割合 · 0–100%</small></span></p>
    </div>
    <div className="spatial-canvas" ref={hostRef}>
      <svg data-testid="spatial-cloud" viewBox={`0 0 ${size.width} ${size.height}`} role="group" aria-label="使用傾向・発言出現率・会話カバー率の3次元分布" tabIndex={0}
        data-yaw={camera.yaw} data-pitch={camera.pitch} data-zoom={camera.zoom}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const directions: Record<string, Partial<Camera>> = { ArrowLeft: { yaw: camera.yaw - 8 }, ArrowRight: { yaw: camera.yaw + 8 }, ArrowUp: { pitch: camera.pitch + 8 }, ArrowDown: { pitch: camera.pitch - 8 }, Home: DEFAULT_CAMERA };
          const direction = directions[event.key];
          if (direction) { event.preventDefault(); change(direction); }
        }}
        onPointerDown={(event) => {
          // Touch remains native page scrolling; use the explicit camera buttons.
          if (disabled || event.pointerType === 'touch' || event.button !== 0 || (event.target as Element).closest('[data-spatial-term]')) return;
          dragRef.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, camera };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || disabled || drag.pointer !== event.pointerId) return;
          change({ yaw: drag.camera.yaw + (event.clientX - drag.x) * .3, pitch: drag.camera.pitch - (event.clientY - drag.y) * .3 });
        }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { dragRef.current = null; }} onPointerLeave={() => setHovered(null)}>
        <title>{SPATIAL_READING}</title>
        <g aria-hidden="true" className="spatial-grid">{scene.edges.map((edge, index) => <line key={index} x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} data-axis={edge.axis} />)}
          {scene.ticks.map((tick, index) => <g key={index}>
            <line x1={tick.anchorX} y1={tick.anchorY} x2={tick.x} y2={tick.y - Math.sign(tick.y - tick.anchorY) * 10} />
            <text x={tick.x} y={tick.y} textAnchor="middle" dominantBaseline="middle">{tick.text}</text>
          </g>)}
        </g>
        {scene.points.map((point) => {
          const term = point.term;
          const label = `${term.display} · ${biasName(term)} · X ${point.x.toFixed(3)} · 発言出現率 ${percent(point.y)} · 会話カバー率 ${percent(point.z)} · あなた ${messageRateLabel(term.rateUser, term.userMessageCount)}、AI ${messageRateLabel(term.rateAssistant, term.assistantMessageCount)} · 1,000トークンあたり あなた ${tokenRateLabel(term.per1000TokensUser)}、AI ${tokenRateLabel(term.per1000TokensAssistant)} · 会話 ${term.conversationCoverage}件`;
          return <g key={`${term.kind}-${term.term}`} data-spatial-term={term.term} data-world-x={point.x} data-world-y={point.y} data-world-z={point.z} data-projected-x={point.screen.x} data-projected-y={point.screen.y}
            role="button" tabIndex={0} aria-label={label} className={`spatial-point${active?.term.term === term.term ? ' is-selected' : ''}`}
            onPointerEnter={() => setHovered(term.term)} onFocus={() => { setHovered(null); setChosen(term.term); }}
            onClick={(event) => { setChosen(term.term); onSelect(term, event.currentTarget); }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(term, event.currentTarget); } }}>
            <title>{label}</title>
            <circle cx={point.screen.x} cy={point.screen.y} r={14} className="spatial-hit" />
            {point.comparisonAvailable ? <circle cx={point.screen.x} cy={point.screen.y} r={SPATIAL_POINT_RADIUS} fill={term.color} className="spatial-dot" /> : <rect x={point.screen.x - 5} y={point.screen.y - 5} width={10} height={10} fill="#77747b" className="spatial-dot" />}
          </g>;
        })}
        <g className="spatial-labels" aria-hidden="true">{scene.labels.map((label) => {
          const term = points.find((point) => point.term.term === label.term)?.term;
          return <g key={label.term} data-spatial-label={label.term}>
            <line x1={label.anchorX} y1={label.anchorY} x2={Math.max(label.x, Math.min(label.x + label.width, label.anchorX))} y2={label.y + label.height / 2} />
            <rect x={label.x} y={label.y} width={label.width} height={label.height} rx={4} />
            <text x={label.x + label.width / 2} y={label.y + label.height / 2} dominantBaseline="middle" textAnchor="middle" fontSize={SPATIAL_FONT_SIZE} fill={term?.color}>{label.text}</text>
          </g>;
        })}</g>
      </svg>
      {!points.length && <div className="spatial-empty"><strong>この条件では表示できる語がありません</strong><p>期間や対象を広げてください。</p></div>}
    </div>
    <div className="spatial-controls">
      <details className="spatial-camera"><summary>視点を操作</summary><div>
        <button type="button" disabled={disabled || camera.yaw <= -65} onClick={() => change({ yaw: camera.yaw - 12 })}>左へ回転</button>
        <button type="button" disabled={disabled || camera.yaw >= 65} onClick={() => change({ yaw: camera.yaw + 12 })}>右へ回転</button>
        <button type="button" disabled={disabled || camera.pitch >= 60} onClick={() => change({ pitch: camera.pitch + 10 })}>上から見る</button>
        <button type="button" disabled={disabled || camera.pitch <= 0} onClick={() => change({ pitch: camera.pitch - 10 })}>水平に近づける</button>
        <button type="button" disabled={disabled || camera.zoom >= 1.2} onClick={() => change({ zoom: camera.zoom + .1 })}>拡大</button>
        <button type="button" disabled={disabled || camera.zoom <= .8} onClick={() => change({ zoom: camera.zoom - .1 })}>縮小</button>
      </div><p>余白のドラッグ、または図にフォーカスして矢印キーで回転。タッチではボタンを使います。</p></details>
      <button type="button" disabled={disabled} onClick={() => change(DEFAULT_CAMERA)}>視点をリセット</button>
    </div>
    <div className="spatial-selection">
      <label>3Dで選ぶ語<select value={selected?.term.term ?? ''} disabled={!points.length} onChange={(event) => { setChosen(event.target.value); setHovered(null); }}>
        {!points.length && <option value="">表示できる語なし</option>}
        {points.map((point) => <option key={`${point.term.kind}-${point.term.term}`} value={point.term.term}>{point.term.display} · {biasName(point.term)}</option>)}
      </select></label>
      <button type="button" disabled={!selected} onClick={(event) => { if (selected) onSelect(selected.term, event.currentTarget); }}>選択した語の文脈を見る</button>
      {active && <p className="spatial-selection__metrics"><strong>{active.term.display}</strong><span>X {active.comparisonAvailable ? active.x.toFixed(3) : '—（比較材料不足）'}</span><span>Y {percent(active.y)}</span><span>Z {percent(active.z)}（{active.term.conversationCoverage} / {result.summary.conversationCount}会話）</span></p>}
      {active && <details className="spatial-metrics"><summary>役割別の集計を見る</summary><TermMetrics term={active.term} /></details>}
    </div>
    <div className="spatial-caption">
      <p className="cloud-caption__scope">{scopeLabel} · 表示期間 {selectedPeriodLabel(result)}（日本時間）</p>
      <p>{SPATIAL_RATE_READING}</p><p>{SPATIAL_VIEW_READING}</p>
      <p>点は重なって見えることがあります。全語は選択欄から確認できます。表示 {points.length}点 · 文字ラベル省略 {points.length - scene.labels.length}語 · 2Dと共通の配置省略 {result.display.layoutOmittedCount}語</p>
      {comparisonMissing && <p>灰色の四角＝比較材料不足。X=0は共有語彙という意味ではありません。</p>}
      {points.length > 0 && points.length < 8 && <p>表示語が少ないため、分布の読み取りは限定的です。2D ミラーでも確認できます。</p>}
      <p>{vocabularySelectionLabel(result.display)}。{QUOTA_READING} 同じ対象語で2Dと切り替えます。軸の尺度は期間を変えても固定です。</p>
    </div>
  </section>;
}
