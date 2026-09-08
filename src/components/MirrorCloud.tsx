import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createMobileOverviewLayout, createOverviewLayout } from '../analysis/overview';
import type { LaidOutTerm } from '../domain/models';

interface MirrorCloudProps {
  terms: LaidOutTerm[];
  showProviderCoverage?: boolean;
  onSelect?: (term: LaidOutTerm, target: HTMLElement | SVGElement) => void;
  variant?: 'hero' | 'preview';
  testId?: string;
}

type TooltipPosition = {
  x: number;
  y: number;
  side: 'left' | 'right';
};

const providerLabel = (provider: LaidOutTerm['providerCoverage'][number]) =>
  provider === 'chatgpt' ? 'ChatGPT' : provider === 'claude' ? 'Claude' : '合成デモ';

const biasLabel = (term: LaidOutTerm) =>
  term.biasLabel === 'user' ? 'あなた寄り' : term.biasLabel === 'assistant' ? 'AI寄り' : '共有語彙';

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
  showProviderCoverage = false,
  onSelect,
  variant = 'hero',
  testId,
}: MirrorCloudProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobileViewport();
  const [mobileView, setMobileView] = useState<'overview' | 'detail'>('overview');
  const [detailPosition, setDetailPosition] = useState<'left' | 'center' | 'right'>('center');
  const [hovered, setHovered] = useState<LaidOutTerm | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const isPreview = variant === 'preview';

  const overviewTerms = useMemo(
    () => createMobileOverviewLayout(terms, Math.min(24, terms.length)),
    [terms],
  );
  const previewTerms = useMemo(
    () => createOverviewLayout(terms, Math.min(12, terms.length), 'analysis-preview'),
    [terms],
  );
  const isDetail = !isPreview && isMobile && mobileView === 'detail';
  const isMobileOverview = !isPreview && isMobile && !isDetail;
  const displayedTerms = isPreview ? previewTerms : isMobile && !isDetail ? overviewTerms : terms;

  useEffect(() => {
    if (!isDetail) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.scrollLeft = Math.max(0, (canvas.scrollWidth - canvas.clientWidth) / 2);
  }, [isDetail, displayedTerms.length]);

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
    const side = spaceRight >= 278 || spaceRight >= spaceLeft ? 'right' : 'left';
    setHovered(term);
    setTooltipPos({
      x: side === 'right' ? targetRect.right - canvasRect.left : targetRect.left - canvasRect.left,
      y: Math.max(80, Math.min(canvasRect.height - 80, centerY)),
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
        <span>共有語彙</span>
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
            <p>期間や対象を広げるか、最小出現数を見直してください。</p>
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
            viewBox={isMobileOverview ? '0 0 390 620' : isPreview ? '0 0 1100 400' : '0 0 1100 620'}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label="左右の位置であなたとAIの語彙傾向を示すミラークラウド"
            aria-hidden={isPreview ? true : undefined}
          >
            <line
              x1={isMobileOverview ? '195' : '550'}
              y1="52"
              x2={isMobileOverview ? '195' : '550'}
              y2={isPreview ? '360' : '574'}
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
                  aria-label={
                    isPreview
                      ? undefined
                      : `${term.display}、${biasLabel(term)}、あなた${term.dfUser}件・${(term.rateUser * 100).toFixed(1)}%、AI${term.dfAssistant}件・${(term.rateAssistant * 100).toFixed(1)}%、会話カバー${term.conversationCoverage}件${showProviderCoverage ? `、${term.providerCoverage.map(providerLabel).join('と')}` : ''}`
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
                  <text
                    x={term.x}
                    y={term.y}
                    fill={term.color}
                    fontSize={term.fontSize}
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    aria-hidden="true"
                  >
                    {term.display}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {hovered && tooltipPos && (
          <div
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
            <span>{biasLabel(hovered)}</span>
            <dl>
              <div><dt>あなた</dt><dd>{hovered.dfUser}件 · {(hovered.rateUser * 100).toFixed(1)}%</dd></div>
              <div><dt>AI</dt><dd>{hovered.dfAssistant}件 · {(hovered.rateAssistant * 100).toFixed(1)}%</dd></div>
              <div><dt>会話カバー</dt><dd>{hovered.conversationCoverage}件</dd></div>
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
        <p className="cloud-hint">
          <span className="cloud-hint__desktop">端末外へ送信しません · 言葉に触れて比較 · 下へスクロールで分析 ↓</span>
          <span className="cloud-hint__mobile">
            {isDetail ? '端末内だけで解析 · 横に動かして詳しく見る · 下へ分析 ↓' : '端末内だけで解析 · 左右を比較 · 下へ分析 ↓'}
          </span>
        </p>
      )}
    </section>
  );
}
