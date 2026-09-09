import type { TermStats, VocabularyFocus } from '../domain/models';
import { canonicalizeTerm, isDescriptiveForm, tokenize } from './tokenize';

/** Display policy, NOT tokenizer stopwords: these words still count in the
 * corpus, token denominators, Echo and adoption evidence. Exact lexical forms
 * only; 必要条件 / 内容証明 / 確認申請 must not be rejected by substring. */
export const PROCEDURAL_VOCABULARY = new Set([
  '今回', '前回', '次回', '現在', '最初', '最後', '最終', '途中', '今後', '現状',
  '内容', '確認', '必要', '不要', '具体的', '具体', '方法', '対応', '整理',
  '場合', '部分', '全体', '一部', '基本', '基本的', '一般', '一般的', '通常',
  '詳細', '簡単', '簡潔', '重要', '大事', '適切', '可能', '不可能', '十分',
  '以上', '以降', '以前', '以外', '以下', '前提', '結論', '理由', '目的',
  '手順', '手段', '項目', '事項', '状況', '状態', '情報', '結果', '対象',
  '一方', '同様', '同じ', '別々', '各種', '複数', '単純', '実際', '最適',
  '追加', '変更', '修正', '作成', '作業', '実行', '提示', '参照', '記載',
  '理解', '把握', '説明', '回答', '質問', '検討', '利用', '使用', '提供',
  '以下の通り', '上の通り', 'おっしゃる通り', 'とりあえず', 'なんとなく',
  '本当に', 'もちろん', 'たとえば', '例えば', 'かなり', '非常', 'とても',
  'すごく', 'すごい', '面白そう', '面白い', '素晴らしい', 'すばらしい',
  '明記', '絞り', '中心',
  'お願い', '順番', '参考', 'お知らせ', '知らせ', '解説', '申し訳', 'お話',
  '見る', '見える', '思う', '思い', '考える', '考え', '言う', '言える',
  '行う', '行い', '進める', '進め', 'まとめる', 'まとめ', '分かる', 'わかる',
  '決める', '使える', '使う', '使い', 'やる', 'やり', '良い', 'いい',
  'いく', 'いける', 'いけ', 'いただく', 'いただき', 'いただけ', 'ください',
  'here', 'also', 'just', 'very', 'really', 'need', 'needs', 'needed', 'want',
  'help', 'make', 'get', 'let', 'lets', 'sure', 'check', 'explain', 'example',
  'examples', 'step', 'steps', 'thing', 'things', 'following', 'above', 'below',
  'specific', 'general', 'important', 'information', 'details', 'detail',
]);

export const isProceduralTerm = (value: string): boolean =>
  PROCEDURAL_VOCABULARY.has(canonicalizeTerm(value)) ||
  (isDescriptiveForm(value) && /^(?:すご|おもしろ|面白|すばらし|素晴らし)/u.test(canonicalizeTerm(value)));
const DISCOURSE_WRAPPERS = new Set(['今回', '前回', '次回', 'とりあえず', 'なんとなく']);

/** Never infer topic names: eligibility refers to the actually observed term.
 * Complete compounds with a content-bearing component survive. A generated
 * phrase consisting entirely of procedural tokens cannot evade the policy. */
export const isTopicCandidate = (term: Pick<TermStats, 'term' | 'kind' | 'topicEvidence'>): boolean => {
  if (term.topicEvidence) return term.topicEvidence.eligible;
  if (isProceduralTerm(term.term)) return false;
  if (term.kind === 'word') return true;
  const parts = tokenize(term.term);
  // Narrow discourse markers only: a generic component is not grounds to
  // reject real phrases such as general relativity / information theory.
  if (/\s/u.test(term.term) && parts.some((part) => DISCOURSE_WRAPPERS.has(part.term))) return false;
  return parts.length > 0 && parts.some((part) => !isProceduralTerm(part.term));
};

/** Selection-only, bounded specificity boost: never replace importance (size),
 * role bias, or rates. Repeated themes in every conversation keep full base
 * weight; local concentration can add at most 35%, so a rare curiosity does
 * not get an unbounded IDF advantage. No external reference population. */
export const vocabularySelectionScore = (term: TermStats, conversationCount: number): number => {
  if (term.topicEvidence) return term.topicEvidence.score;
  const count = Math.max(1, conversationCount);
  const coverage = Math.min(count, Math.max(1, term.conversationCoverage));
  const specificity = Math.log(count / coverage) / Math.log(Math.max(2, count));
  return term.importance * (1 + 0.35 * specificity);
};

export const selectVocabularyCandidates = (
  terms: TermStats[], focus: VocabularyFocus,
): { candidates: TermStats[]; filteredCount: number } => {
  const candidates = terms.filter((term) => term.lexicalEligible !== false &&
    (focus !== 'topics' || isTopicCandidate(term)));
  return { candidates, filteredCount: terms.length - candidates.length };
};
