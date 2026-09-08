import type { Insights, TermStats } from '../domain/models';

interface InsightSummaryProps {
  insights: Insights;
  onSelectTerm: (term: TermStats, target: HTMLButtonElement) => void;
}

interface TermSummaryItem {
  label: string;
  tone: 'user' | 'shared' | 'assistant';
  term: TermStats | undefined;
}

export function InsightSummary({ insights, onSelectTerm }: InsightSummaryProps) {
  const termItems: TermSummaryItem[] = [
    { label: 'あなた側で多い語', tone: 'user', term: insights.userIntroduced[0] },
    { label: '双方で使う語', tone: 'shared', term: insights.shared[0] },
    { label: 'このAI回答で多い語', tone: 'assistant', term: insights.assistantReturned[0] },
  ];

  return (
    <section className="insight-summary" aria-label="言葉の指紋の要点">
      <div className="insight-summary__heading">
        <p>言葉の指紋</p>
        <strong>まず見る4つの要点</strong>
      </div>
      <div className="insight-summary__items">
        {termItems.map((item) => (
          <button
            type="button"
            className={`insight-summary__item insight-summary__item--${item.tone}`}
            key={item.label}
            disabled={!item.term}
            onClick={(event) => item.term && onSelectTerm(item.term, event.currentTarget)}
            aria-label={item.term ? `${item.label}「${item.term.display}」の文脈を見る` : `${item.label}はありません`}
          >
            <span>{item.label}</span>
            <strong>{item.term?.display ?? '—'}</strong>
            <small>文脈を見る</small>
          </button>
        ))}
        <div className="insight-summary__item insight-summary__item--echo">
          <span>語彙エコー率</span>
          <strong>{insights.echo.rate === null ? '—' : `${Math.round(insights.echo.rate * 100)}%`}</strong>
          <small>語彙の再利用度</small>
        </div>
      </div>
    </section>
  );
}
