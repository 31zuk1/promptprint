import { useEffect, useRef, useState } from 'react';
import type { LaidOutTerm, MessageRole, TermContext } from '../domain/models';
import { biasName } from '../analysis/presentation';
import { TermMetrics } from './TermMetrics';

interface TermContextDrawerProps {
  term: LaidOutTerm | null;
  contexts: TermContext[];
  returnFocusTo: HTMLElement | SVGElement | null;
  onClose: () => void;
  onHide: (term: string) => void;
  periodLabel?: string | undefined;
}

export interface TermSelection {
  term: LaidOutTerm;
  contexts: TermContext[];
  period: string;
}

const providerLabel = (provider: TermContext['provider']) =>
  provider === 'chatgpt' ? 'ChatGPT' : provider === 'claude' ? 'Claude（実験的）' : '合成デモ';

function HighlightedExcerpt({ context }: { context: TermContext }) {
  const { excerpt, matchStart, matchEnd } = context;
  if (matchStart < 0 || matchEnd <= matchStart) return <>{excerpt}</>;
  return (
    <>
      {excerpt.slice(0, matchStart)}
      <mark>{excerpt.slice(matchStart, matchEnd)}</mark>
      {excerpt.slice(matchEnd)}
    </>
  );
}

export function TermContextDrawer({ term, contexts, returnFocusTo, onClose, onHide, periodLabel }: TermContextDrawerProps) {
  const [role, setRole] = useState<'both' | MessageRole>('both');
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!term) return undefined;
    closeRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hidden && element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusTo?.focus();
    };
  }, [term, onClose, returnFocusTo]);

  if (!term) return null;
  const filtered = contexts.filter((context) => role === 'both' || context.role === role).slice(0, 20);

  return (
    <div className="drawer-layer" role="presentation">
      <div className="drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <aside ref={dialogRef} className="context-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header>
          <div>
            <p className="section-kicker">言葉の文脈</p>
            {periodLabel && <p className="section-kicker">選択時の期間 {periodLabel}（日本時間）</p>}
            <h2 id="drawer-title">{term.display}</h2>
            <span className={`bias-pill bias-pill--${term.biasLabel}`}>
              {biasName(term)}
            </span>
          </div>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="閉じる" type="button">×</button>
        </header>
        <dl className="drawer-stats">
          <div><dt>あなた</dt><dd>{term.dfUser}<small>発言</small></dd></div>
          <div><dt>AI</dt><dd>{term.dfAssistant}<small>発言</small></dd></div>
          <div><dt>会話</dt><dd>{term.conversationCoverage}<small>件</small></dd></div>
        </dl>
        <TermMetrics term={term} />
        <div className="drawer-controls">
          <div className="segmented-control" aria-label="発言者で絞り込む">
            <button type="button" aria-pressed={role === 'both'} className={role === 'both' ? 'is-active' : ''} onClick={() => setRole('both')}>両方</button>
            <button type="button" aria-pressed={role === 'user'} className={role === 'user' ? 'is-active' : ''} onClick={() => setRole('user')}>あなた</button>
            <button type="button" aria-pressed={role === 'assistant'} className={role === 'assistant' ? 'is-active' : ''} onClick={() => setRole('assistant')}>AI</button>
          </div>
          <span>{filtered.length}件</span>
        </div>
        <div className="context-list">
          {filtered.length === 0 ? <p className="empty-context">この条件に一致する文脈はありません。</p> : filtered.map((context) => (
            <article key={context.id}>
              <div className="context-meta">
                <span className={`role-dot role-dot--${context.role}`}>{context.role === 'user' ? 'あなた' : 'AI'}</span>
                <span>{providerLabel(context.provider)}</span>
                {context.createdAt !== null ? <time>{new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(context.createdAt)}</time> : <span>発言日時不明</span>}
              </div>
              <h3>{context.conversationTitle}</h3>
              <p><HighlightedExcerpt context={context} /></p>
            </article>
          ))}
        </div>
        <footer>
          <p>原文はこのブラウザ内だけで表示されています。</p>
          <p>日時は日本時間です。発言日時が不明な場合、期間の判定には会話日時を使うことがあります。</p>
          <button className="button button--danger-ghost" type="button" aria-label="この語を表示から隠す" onClick={() => onHide(term.term)}>この語を隠す</button>
        </footer>
      </aside>
    </div>
  );
}
