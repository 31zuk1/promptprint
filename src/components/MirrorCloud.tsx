import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createMobileOverviewLayoutDetailed, createOverviewLayout } from '../analysis/overview';
import { biasName, CLOUD_READING, datasetScopeLabel, messageRateLabel, MESSAGE_RATE_READING, QUOTA_READING, TIMELINE_READING, vocabularySelectionLabel } from '../analysis/presentation';
import type { AnalysisResult, LaidOutTerm } from '../domain/models';
import { TermMetrics } from './TermMetrics';

interface MirrorCloudProps {
  terms: LaidOutTerm[];
  summary: AnalysisResult['summary'];
  display: AnalysisResult['display'];
  showProviderCoverage?: boolean;
  onSelect?: (term: LaidOutTerm, target: HTMLElement | SVGElement) => void;
  variant?: 'hero' | 'preview';
  testId?: string;
  /** Private-only acquisition copy; omitted in the ephemeral Web build. */
  scopeLabel?: string;
  privacyHint?: string;
  periodLabel?: string;
}

type TooltipPosition = {
  x: number;
  y: number;
  side: 'left' | 'right';
};

const providerLabel = (provider: LaidOutTerm['providerCoverage'][number]) =>
  provider === 'chatgpt' ? 'ChatGPT' : provider === 'claude' ? 'Claude' : '合成デモ';

function CloudText({ term, renderSize }: { term: LaidOutTerm; renderSize: string }) {
  const ref = useRef<SVGTextElement>(null);
  useLayoutEffect(() => {
    const text = ref.current;
    if (!text) return;
    text.removeAttribute('textLength');
    text.removeAttribute('dx');
    text.removeAttribute('dy');
    // Local fonts differ between operating systems. Contract to the measured
    // collision box if necessary, never stretch a naturally narrower label.
    if (text.getComputedTextLength() > term.width - 14) {
      text.setAttribute('textLength', String(term.width - 14));
    }
    // SVG's "middle" baseline is based on x-height, not the font's actual
    // bounds (notably different for Japanese fallback fonts). Center the
    // measured glyph box inside the collision box, including after resize.
    const glyph = text.getBBox();
    text.setAttribute('dx', String(term.x - glyph.x - glyph.width / 2));
    text.setAttribute('dy', String(term.y - glyph.y - glyph.height / 2));
  }, [term, renderSize]);
  return <text ref={ref} x={term.x} y={term.y} fill={term.color} fontSize={term.fontSize}
    fontWeight="700" textAnchor="middle" dominantBaseline="middle"
    lengthAdjust="spacingAndGlyphs" aria-hidden="true">{term.display}</text>;
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 620px)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 620px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export function MirrorCloud({
  terms,
  summary,
  display,
  showProviderCoverage = false,
  onSelect,
  variant = 'hero',
  testId,
  scopeLabel,
  privacyHint,
  periodLabel,
}: MirrorCloudProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mobileHeight, setMobileHeight] = useState(620);
  const [renderSize, setRenderSize] = useState('');
  const isMobile = useMobileViewport();
  const [mobileView, setMobileView] = useState<'overview' | 'detail'>('overview');
  const [detailPosition, setDetailPosition] = useState<'left' | 'center' | 'right'>('center');
  const [hoveredTerm, setHovered] = useState<LaidOutTerm | null>(null);
  const hovered = hoveredTerm && terms.includes(hoveredTerm) ? hoveredTerm : null;
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const isPreview = variant === 'preview';

  const overview = useMemo(
    () => createMobileOverviewLayoutDetailed(terms, Math.min(24, terms.length), mobileHeight, display.vocabularyFocus),
    [terms, mobileHeight, display.vocabularyFocus],
  );
  const overviewTerms = overview.layout;
  const previewTerms = useMemo(
    () => createOverviewLayout(terms, Math.min(12, terms.length), 'analysis-preview', display.vocabularyFocus),
    [terms, display.vocabularyFocus],
  );
  const isDetail = !isPreview && isMobile && mobileView === 'detail';
  const isMobileOverview = !isPreview && isMobile && !isDetail;
  const displayedTerms = isPreview ? previewTerms : isMobile && !isDetail ? overviewTerms : terms;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => {
      setRenderSize(`${canvas.clientWidth}:${canvas.clientHeight}:${isDetail}`);
      // Detail mode has a different caption/scroll indicator footprint. Keep
      // the last real overview measurement; otherwise opening detail changes
      // the hidden overview and even renames its return button (24 → 23).
      if (isMobileOverview && canvas.clientWidth) setMobileHeight(Math.max(80, Math.floor(canvas.clientHeight * 390 / canvas.clientWidth)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isMobileOverview, isDetail]);

  useEffect(() => {
    if (!isDetail) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.scrollLeft = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2);
  }, [isDetail, displayedTerms.length]);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    const canvas = canvasRef.current;
    if (!tooltip || !canvas || !tooltipPos) return;
    tooltip.style.left = '';
    tooltip.style.top = '';
    const bounds = canvas.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(bounds.left + 8, Math.min(bounds.right - box.width - 8, box.left));
    const top = Math.max(bounds.top + 8, Math.min(bounds.bottom - box.height - 8, box.top));
    tooltip.style.left = `${tooltipPos.x + left - box.left}px`;
    tooltip.style.top = `${tooltipPos.y + top - box.top}px`;
  }, [hovered, tooltipPos, renderSize]);

  const updateHover = (term: LaidOutTerm, target: Element) => {
    if (isPreview || isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    const centerY = targetRect.top + targetRect.height / 2 - canvasRect.top;
    const spaceRight = canvasRect.right - targetRect.right;
    const spaceLeft = targetRect.left - canvasRect.left;
    const side = spaceRight >= 356 || spaceRight >= spaceLeft ? 'right' : 'left';
    setHovered(term);
    setTooltipPos({
      x: side === 'right' ? targetRect.right - canvasRect.left : targetRect.left - canvasRect.left,
      y: Math.max(155, Math.min(canvasRect.height - 155, centerY)),
      side,
    });
  };

  const clearHover = () => {
    setHovered(null);
    setTooltipPos(null);
  };

  const trackDetailPosition = () => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.scrollWidth <= canvas.clientWidth) return;
    const ratio = canvas.scrollLeft / (canvas.scrollWidth - canvas.clientWidth);
    setDetailPosition(ratio < 0.34 ? 'left' : ratio > 0.66 ? 'right' : 'center');
  };

  const select = (term: LaidOutTerm, target: HTMLElement | SVGElement) => {
    if (!isPreview) onSelect?.(term, target);
  };

  const keySelect = (event: KeyboardEvent<SVGGElement>, term: LaidOutTerm) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(term, event.currentTarget);
    }
  };

  return (
    <section
      className={`cloud-hero cloud-hero--${variant}`}
      aria-label={isPreview ? '現在の条件で絞り込んだ言葉の分布' : '言葉の重心 — あなたとAIの語彙分布'}
    >
      {!isPreview && isMobile && terms.length > overviewTerms.length && (
        <div className="cloud-view-switch" aria-label="表示する言葉の量">
          <button
            type="button"
            className={mobileView === 'overview' ? 'is-active' : ''}
            aria-pressed={mobileView === 'overview'}
            onClick={() => setMobileView('overview')}
          >
            要点 {overviewTerms.length}語
          </button>
          <button
            type="button"
            className={mobileView === 'detail' ? 'is-active' : ''}
            aria-pressed={mobileView === 'detail'}
            onClick={() => {
              setDetailPosition('center');
              setMobileView('detail');
            }}
          >
            詳しく見る {terms.length}語
          </button>
        </div>
      )}
      <div className="cloud-axis" aria-hidden="true">
        <span>あなた ←</span>
        <span>{summary.userMessageCount && summary.assistantMessageCount ? '共有語彙' : '比較材料不足'}</span>
        <span>→ AI</span>
      </div>
      <div
        className={`cloud-canvas${isDetail ? ' cloud-canvas--detail' : ''}`}
        ref={canvasRef}
        data-testid={testId}
        onScroll={isDetail ? trackDetailPosition : undefined}
      >
        {displayedTerms.length === 0 ? (
          <div className="cloud-empty">
            <strong>この条件では表示できる語がありません</strong>
            <p>句読点・助詞・短い応答語は除外しています。</p>
            <p>期間や対象を広げるか、最小出現数を見直してください。</p>
            {(display.topicFilteredCount ?? 0) > 0 && <p>「表示条件を変える」→「使用語を広く」で定型語も確認できます。</p>}
          </div>
        ) : isPreview ? (
          <div className="cloud-preview-grid" aria-hidden="true">
            {(['user', 'shared', 'assistant'] as const).map((side) => (
              <div key={side}>
                {previewTerms.filter((term) => term.biasLabel === side).map((term) => (
                  <span
                    key={`${term.kind}-${term.term}`}
                    style={{ color: term.color, fontSize: `${Math.max(16, Math.min(30, term.fontSize * 0.6))}px` }}
                  >
                    {term.display}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <svg
            className={`mirror-cloud${isMobileOverview ? ' mirror-cloud--overview' : ''}`}
            viewBox={isMobileOverview ? `0 0 390 ${mobileHeight}` : isPreview ? '0 0 1100 400' : '0 0 1100 620'}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label="左右の位置であなたとAIの語彙傾向を示すミラークラウド"
            aria-hidden={isPreview ? true : undefined}
          >
            <line
              x1={isMobileOverview ? '195' : '550'}
              y1={isMobileOverview ? '8' : '52'}
              x2={isMobileOverview ? '195' : '550'}
              y2={isMobileOverview ? mobileHeight - 8 : isPreview ? '360' : '574'}
              className="cloud-center-line"
            />
            {displayedTerms.map((term) => {
              const isMuted = hovered !== null && hovered.term !== term.term;
              return (
                <g
                  key={`${term.kind}-${term.term}`}
                  className={`cloud-term${isMuted ? ' cloud-term--muted' : ''}`}
                  role={isPreview ? undefined : 'button'}
                  tabIndex={isPreview ? undefined : 0}
                  data-term={isPreview ? undefined : term.term}
                  data-bias={term.bias}
                  data-bias-label={term.biasLabel}
                  data-box={JSON.stringify({ x: term.x, y: term.y, width: term.width, height: term.height })}
                  aria-label={
                    isPreview
                      ? undefined
                      : `${term.display}、${biasName(term)}、発言出現率：あなた${messageRateLabel(term.rateUser, term.userMessageCount)}・${term.dfUser}件、AI${messageRateLabel(term.rateAssistant, term.assistantMessageCount)}・${term.dfAssistant}件、会話カバー${term.conversationCoverage}件${showProviderCoverage ? `、${term.providerCoverage.map(providerLabel).join('と')}` : ''}`
                  }
                  onMouseEnter={isPreview ? undefined : (event) => updateHover(term, event.currentTarget)}
                  onMouseLeave={isPreview ? undefined : clearHover}
                  onFocus={isPreview ? undefined : (event) => updateHover(term, event.currentTarget)}
                  onBlur={isPreview ? undefined : clearHover}
                  onClick={isPreview ? undefined : (event) => select(term, event.currentTarget)}
                  onKeyDown={isPreview ? undefined : (event) => keySelect(event, term)}
                >
                  <rect
                    className="cloud-term__hit"
                    x={term.x - Math.max(isDetail ? 72 : 44, term.width) / 2}
                    y={term.y - Math.max(isDetail ? 72 : 44, term.height) / 2}
                    width={Math.max(isDetail ? 72 : 44, term.width)}
                    height={Math.max(isDetail ? 72 : 44, term.height)}
                    rx="7"
                  />
                  <CloudText term={term} renderSize={renderSize} />
                </g>
              );
            })}
          </svg>
        )}
        {hovered && tooltipPos && (
          <div
            ref={tooltipRef}
            className={`term-tooltip term-tooltip--${tooltipPos.side}`}
            style={
              {
                '--tooltip-x': `${tooltipPos.x}px`,
                '--tooltip-y': `${tooltipPos.y}px`,
              } as CSSProperties
            }
            role="tooltip"
          >
            <strong>{hovered.display}</strong>
            <span>{biasName(hovered)}</span>
            <TermMetrics term={hovered} />
            <dl>
              {showProviderCoverage && (
                <div><dt>プロバイダー</dt><dd>{hovered.providerCoverage.map(providerLabel).join(' + ')}</dd></div>
              )}
            </dl>
          </div>
        )}
      </div>
      {isDetail && (
        <div className="cloud-position" aria-hidden="true">
          <span className={detailPosition === 'left' ? 'is-active' : ''} />
          <span className={detailPosition === 'center' ? 'is-active' : ''} />
          <span className={detailPosition === 'right' ? 'is-active' : ''} />
        </div>
      )}
      {!isPreview && (
        <div className="cloud-caption" data-testid="cloud-caption">
          <p className="cloud-caption__scope">{scopeLabel ?? datasetScopeLabel(summary)}</p>
          {periodLabel && periodLabel !== '全期間' && <p>表示期間 {periodLabel}（日本時間）</p>}
          <p>{CLOUD_READING}</p>
          {periodLabel && periodLabel !== '全期間' && <p>{TIMELINE_READING}</p>}
          <p>{MESSAGE_RATE_READING}</p>
          <p>{QUOTA_READING}</p>
          <p>
            {vocabularySelectionLabel(display)} · 表示 {displayedTerms.length}語 · 配置のため省略 {display.layoutOmittedCount + (isMobileOverview ? overview.omitted.length : 0)}語
            {isMobileOverview && terms.length > 24 ? ` · 要点表示の対象外 ${terms.length - 24}語` : ''}
            {display.compoundSuppressedCount > 0 ? ` · 候補を複合語に代表化 ${display.compoundSuppressedCount}語` : ''}
          </p>
          {(!summary.userMessageCount || !summary.assistantMessageCount) && (
            <p>片方の発言がないため左右比較は保留です。灰色の語は共有を意味しません。</p>
          )}
        </div>
      )}
      {!isPreview && (
        <p className="cloud-hint">
          <span className="cloud-hint__desktop">{privacyHint ?? '端末外へ送信しません'} · 言葉に触れて比較 · 下へスクロールで分析 ↓</span>
          <span className="cloud-hint__mobile">
            {isDetail ? '端末内だけで解析 · 横に動かして詳しく見る · 下へ分析 ↓' : '端末内だけで解析 · 左右を比較 · 下へ分析 ↓'}
          </span>
        </p>
      )}
    </section>
  );
}
