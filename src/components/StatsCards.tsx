import type { DatasetSummary, Provider } from '../domain/models';

interface StatsCardsProps {
  summary: DatasetSummary;
}

const providerName = (provider: Provider) => ({
  chatgpt: 'ChatGPT',
  claude: 'Claude（実験的）',
  demo: '合成デモ',
})[provider];

const dateLabel = (start: number | null, end: number | null) => {
  if (start === null || end === null) return '日時情報なし';
  const format = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  return `${format.format(start)} – ${format.format(end)}`;
};

export function StatsCards({ summary }: StatsCardsProps) {
  const items = [
    { label: '会話', value: summary.conversationCount.toLocaleString('ja-JP'), suffix: '件', tone: 'blue' },
    { label: 'あなたの発言', value: summary.userMessageCount.toLocaleString('ja-JP'), suffix: '件', tone: 'cyan' },
    { label: 'AIの発言', value: summary.assistantMessageCount.toLocaleString('ja-JP'), suffix: '件', tone: 'orange' },
    { label: '分析した語', value: summary.analyzedTermCount.toLocaleString('ja-JP'), suffix: '語', tone: 'violet' },
  ];

  return (
    <section className="stats-area" aria-label="データセット概要">
      <div className="stats-grid">
        {items.map((item) => (
          <article className={`stat-card stat-card--${item.tone}`} key={item.label}>
            <p>{item.label}</p>
            <strong>{item.value}<small>{item.suffix}</small></strong>
          </article>
        ))}
      </div>
      <div className="dataset-meta">
        <span>{summary.providers.map(providerName).join(' + ')}</span>
        <span>{dateLabel(summary.dateStart, summary.dateEnd)}</span>
        {summary.skippedCount > 0 && <span className="dataset-meta__warning">{summary.skippedCount}件をスキップ</span>}
      </div>
    </section>
  );
}
