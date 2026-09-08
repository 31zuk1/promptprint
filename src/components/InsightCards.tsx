import type { Insights, TermStats } from '../domain/models';

interface InsightCardsProps {
  insights: Insights;
  onSelectTerm: (term: TermStats, target: HTMLButtonElement) => void;
}

function TermChips({ terms, onSelect }: { terms: TermStats[]; onSelect: (term: TermStats, target: HTMLButtonElement) => void }) {
  return (
    <div className="term-chips">
      {terms.slice(0, 5).map((term, index) => (
        <button type="button" key={term.term} onClick={(event) => onSelect(term, event.currentTarget)}>
          <span>{index + 1}</span>{term.display}
        </button>
      ))}
    </div>
  );
}

export function InsightCards({ insights, onSelectTerm }: InsightCardsProps) {
  const confidenceLabel = ({
    insufficient: '算出不可',
    low: '参考値',
    medium: '中',
    high: '高',
  } as const)[insights.echo.confidence];
  return (
    <section className="insights-section" aria-labelledby="insights-heading">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">詳しく見る</p>
          <h2 id="insights-heading">偏りと重なりの内訳</h2>
        </div>
        <p>頻度だけでなく、役割ごとの偏りと広がりから読み取ります。</p>
      </div>
      <div className="insight-grid">
        <article className="insight-card insight-card--user">
          <div className="insight-card__icon" aria-hidden="true" />
          <p className="insight-card__kicker">あなた側</p>
          <h3>あなたが持ち込む言葉</h3>
          <p>複数の会話に現れ、あなた側の比率が高い語です。</p>
          <TermChips terms={insights.userIntroduced} onSelect={onSelectTerm} />
        </article>
        <article className="insight-card insight-card--ai">
          <div className="insight-card__icon" aria-hidden="true" />
          <p className="insight-card__kicker">AI側</p>
          <h3>AIが返す言葉</h3>
          <p>このデータのAI回答で、相対的によく現れる語です。</p>
          <TermChips terms={insights.assistantReturned} onSelect={onSelectTerm} />
        </article>
        <article className="insight-card insight-card--shared">
          <div className="insight-card__icon" aria-hidden="true" />
          <p className="insight-card__kicker">中央</p>
          <h3>共有語彙</h3>
          <p>あなたとAIの両側で、近い比率で使われる語です。</p>
          <TermChips terms={insights.shared} onSelect={onSelectTerm} />
        </article>
        <article className="insight-card insight-card--echo">
          <div className="echo-meter" aria-hidden="true">
            <svg viewBox="0 0 120 70"><path d="M12 62a48 48 0 0 1 96 0" /><path d="M12 62a48 48 0 0 1 96 0" style={{ strokeDasharray: `${Math.round((insights.echo.rate ?? 0) * 151)} 151` }} /></svg>
            <strong>{insights.echo.rate === null ? '—' : `${Math.round(insights.echo.rate * 100)}%`}</strong>
          </div>
          <p className="insight-card__kicker">応答間の再利用</p>
          <h3>語彙エコー率</h3>
          <p>あなたの語を、直後のAI回答が再利用した割合。対象 {insights.echo.eligiblePairs} 往復・信頼度 {confidenceLabel}。</p>
          <small>高いほど良い／悪いという指標ではありません。語彙の再利用度です。</small>
        </article>
      </div>

      {insights.adoption.length > 0 && (
        <article className="adoption-card">
          <div>
            <p className="section-kicker">時系列上の候補 · 実験的</p>
            <h3>AI側で先に観測された言葉</h3>
            <p>AIで先に現れ、その後あなたが複数の会話で使った候補です。</p>
          </div>
          <div className="adoption-terms">
            {insights.adoption.slice(0, 6).map((candidate) => (
              <span key={candidate.term}>{candidate.display}<small>後の発言 {candidate.laterUserMessages}件</small></span>
            ))}
          </div>
          <p className="caveat">AIが教えたことを証明するものではありません。時系列上、AI側で先に観測された候補です。</p>
        </article>
      )}

      {insights.providerComparison && (
        <article className="provider-comparison">
          <div>
            <p className="section-kicker">プロバイダー別</p>
            <h3>あなたのChatGPT利用とClaude利用の比較</h3>
          </div>
          {insights.providerComparison.map((item) => (
            <div key={item.provider}>
              <strong>{item.provider === 'chatgpt' ? 'ChatGPT' : 'Claude'}</strong>
              <span>{item.messageCount}発言</span>
              <p>{item.topTerms.join(' · ')}</p>
            </div>
          ))}
        </article>
      )}
    </section>
  );
}
