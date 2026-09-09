import type { AnalysisResult, DatasetSummary, Provider, TermStats } from '../domain/models';

export const providerName = (provider: Provider): string => ({
  chatgpt: 'ChatGPT', claude: 'Claude（実験的）', demo: '合成デモ',
})[provider];

export const biasName = (term: Pick<TermStats, 'biasLabel'>): string => ({
  user: 'あなた寄り', assistant: 'AI寄り', shared: '共有語彙', insufficient: '比較材料不足',
})[term.biasLabel];

export const dateRangeLabel = (summary: DatasetSummary): string => {
  if (summary.dateStart === null || summary.dateEnd === null) return '日時情報なし';
  const formatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' });
  return `${formatter.format(summary.dateStart)} – ${formatter.format(summary.dateEnd)}`;
};

export const datasetScopeLabel = (summary: DatasetSummary, sourceProviders = summary.providers): string => {
  const source = sourceProviders.every((provider) => provider === 'demo') && sourceProviders.length
    ? '合成デモ' : `読み込みデータ · ${sourceProviders.map(providerName).join(' + ') || '対象なし'}`;
  return `${source} · ${dateRangeLabel(summary)} · ${summary.conversationCount}会話`;
};

/** Only aggregate fields enter the private PNG source line, never identity/title/text. */
export const privateDatasetScopeLabel = (summary: DatasetSummary, partial: boolean): string =>
  `実データ · ChatGPT Web読取 · ${dateRangeLabel(summary)} · ${summary.conversationCount}会話 · ${partial ? '部分取得' : '今回の取得範囲'}`;

export const CLOUD_READING = '左右＝相対的な使用傾向 · 大きさ＝出現発言数と会話カバーに基づくスコア · 上下＝意味なし';
export const MESSAGE_RATE_READING = '発言出現率＝その語を含む発言の割合。共有は双方で観測され、出現率が近い語。';
export const QUOTA_READING = '表示語数には左右の割当があり、その比率は元データの比率ではありません。';
export const vocabularySelectionLabel = (display: AnalysisResult['display']): string =>
  display.vocabularyFocus === 'topics'
    ? `話題優先 · 定型語等を対象外 ${display.topicFilteredCount ?? 0}語`
    : '使用語を広く';

export const TIMELINE_READING = '大きさは各期間内の相対表示です。期間をまたぐ絶対量の比較には使えません。';
export const selectedPeriodLabel = (result: AnalysisResult): string => {
  if (result.diagnostics.some((item) => item.code === 'INVALID_DATE_RANGE')) return '日付の指定エラー';
  const range = result.timeline?.appliedRange;
  return range ? `${range.startDate || '指定なし'} – ${range.endDate || '指定なし'}` : '全期間';
};

export const messageRateLabel = (rate: number, total: number): string =>
  total ? `${(rate * 100).toFixed(1)}%` : '—（発言なし）';
export const tokenRateLabel = (rate: number | null): string => rate === null ? '—' : rate.toFixed(1);
