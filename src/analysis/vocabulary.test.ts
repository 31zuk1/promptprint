import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_SETTINGS, type NormalizedConversation } from '../domain/models';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';
import { computeTermStatistics } from './statistics';
import { isTopicCandidate, vocabularySelectionScore } from './vocabulary';
import { vocabularySelectionLabel } from './presentation';

const corpus = (threads: string[][]): NormalizedConversation[] => threads.map((texts, index) => ({
  id: `topic-${index}`, title: 'Synthetic topic fixture', provider: 'demo', createdAt: 1767312000000, updatedAt: 1767312000000,
  messages: texts.map((text, i) => ({ id: `m${i}`, conversationId: `topic-${index}`, provider: 'demo',
    role: i % 2 ? 'assistant' : 'user', createdAt: 1767312000000, order: i, originalText: text, analysisText: text })),
}));
const procedural = '今回の内容を確認して、必要な対応と具体的な方法を整理する。';
const topics = ['ロボット', '留学', '相続税', '半導体', '研究計画書'];
// The shared morphology ledger contains 相続 + 税 and 研究 + 計画 + 書.
// Words-only topic mode selects standalone noun atoms, not suffix fragments.
const topicAtoms = ['ロボット', '留学', '相続', '半導体', '研究', '計画'];
const proceduralAtoms = ['今回', '内容', '確認', '必要', '対応', '具体', '的', '方法', '整理'];
const broadProcedural = proceduralAtoms.filter((term) => term !== '的');
const mixed = () => corpus(Array.from({ length: 20 }, (_, i) =>
  Array.from({ length: 4 }, () => `${topics[i % topics.length]}。${procedural}`)));
const analyze = (data: NormalizedConversation[], focus: 'topics' | 'all' = 'topics', includePhrases = false) =>
  analyzeConversations(data, { ...DEFAULT_ANALYSIS_SETTINGS, vocabularyFocus: focus, includePhrases });

describe('topic-readable display selection without changing measurement', () => {
  it.each([false, true])('selects actual subjects over repeated procedural prose, with no filler (phrases=%s)', (phrases) => {
    const source = mixed();
    const before = structuredClone(source);
    const result = analyze(source, 'topics', phrases);
    expect(result.terms.map((term) => term.term).sort()).toEqual([...(phrases ? topics : topicAtoms)].sort());
    expect(result.layout).toHaveLength(phrases ? 5 : 6);
    expect(result.display).toMatchObject({ vocabularyFocus: 'topics', topicFilteredCount: 11,
      compoundSuppressedCount: phrases ? 5 : 0 });
    // Eight subject atoms + nine procedural atoms, plus four observed noun phrases.
    expect(result.summary).toMatchObject({ conversationCount: 20, userMessageCount: 40,
      assistantMessageCount: 40, analyzedTermCount: phrases ? 21 : 17 });
    const documents = prepareAnalysisDocuments(source, { ...DEFAULT_ANALYSIS_SETTINGS, includePhrases: phrases }).documents;
    expect(documents[0]?.words.map((token) => token.term)).toEqual(['ロボット', ...proceduralAtoms]);
    const broad = analyze(source, 'all', phrases);
    expect(broad.terms.map((term) => term.term).sort())
      .toEqual([...broadProcedural, ...(phrases ? topics : [...topicAtoms, '税'])].sort());
    // Broad mode restores procedural WORDS, never standalone suffix/response
    // fragments; these remain available to compound statistics in the ledger.
    expect(broad.terms.filter((term) => ['し', '的', '書'].includes(term.term))).toEqual([]);
    expect(broad.terms[0]?.importance).toBeGreaterThan(result.terms[0]!.importance);
    for (const term of result.terms) expect(broad.terms.find((other) => other.term === term.term)).toEqual(term);
    expect(result.insights.echo).toEqual(broad.insights.echo);
    expect(result.insights.adoption).toEqual(broad.insights.adoption);
    expect(source).toEqual(before);
    expect(analyze(source, 'topics', phrases)).toEqual(result);
  });

  it.each([false, true])('returns an explained empty topic result for generic-only prose, not a failed import (phrases=%s)', (phrases) => {
    const source = corpus([[procedural, procedural], [procedural, procedural]]);
    const result = analyze(source, 'topics', phrases);
    expect(result.terms).toEqual([]);
    expect(result.layout).toEqual([]);
    expect(result.summary.userMessageCount).toBe(2);
    expect(result.summary.assistantMessageCount).toBe(2);
    expect(result.summary.analyzedTermCount).toBe(9);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'NO_TOPIC_TERMS' }));
    expect(analyze(source, 'all', phrases).terms.map((term) => term.term).sort()).toEqual([...broadProcedural].sort());
    expect(result.insights.userIntroduced).toEqual([]);
    expect(result.insights.assistantReturned).toEqual([]);
    expect(result.insights.shared).toEqual([]);
  });

  it('does not let generic-only n-grams or procedural wrappers bypass eligibility', () => {
    for (const term of ['今回 内容', '具体的 方法', '今回 内容 確認', '必要内容', '今回 地熱発電']) {
      expect(isTopicCandidate({ term, kind: 'phrase' }), term).toBe(false);
    }
    for (const term of ['必要条件', '内容証明', '確認申請', '地熱発電', '量子誤り訂正', 'machine learning',
      'general relativity', 'information theory', 'specific heat', 'step function', 'check valve']) {
      expect(isTopicCandidate({ term, kind: 'phrase' }), term).toBe(true);
    }
  });

  it('rejects nonspecific evaluative inflections, not descriptive vocabulary wholesale', () => {
    for (const term of ['すごかった', '面白かった', '面白く', 'すばらしい', '素晴らしかった', '面白そうだ']) {
      expect(isTopicCandidate({ term, kind: 'word' }), term).toBe(false);
    }
    for (const term of ['美しさ', '難しさ', '高さ', '高い', '赤い', '高さ制限', '難しさの比較']) {
      expect(isTopicCandidate({ term, kind: 'word' }), term).toBe(true);
    }
  });

  it('preserves hidden segment barriers through restored compound boundaries in both modes', () => {
    const source = corpus([['ロボットデザイン。サブエージェント。NoSQL。', 'ロボットデザイン。サブエージェント。NoSQL。']]);
    for (const vocabularyFocus of ['topics', 'all'] as const) {
      const result = analyzeConversations(source, { ...DEFAULT_ANALYSIS_SETTINGS, vocabularyFocus,
        hiddenTerms: ['ロボット', 'エージェント', 'no'] });
      expect(result.terms.map((term) => term.term).join(' ')).not.toMatch(/ロボット|エージェント/u);
      expect(result.terms.map((term) => term.term)).toContain('デザイン');
      expect(result.terms.map((term) => term.term)).toContain('nosql');
      expect(result.contexts['ロボットデザイン']).toBeUndefined();
      expect(result.insights.providerComparison).toBeNull();
    }
  });

  it('uses corpus-observed compounds even when their components include procedural words', () => {
    const source = corpus([
      Array.from({ length: 4 }, () => '必要条件。内容証明。確認申請。地熱発電。量子誤り訂正。'),
      ['茶道具。茶道具。', '茶道具。'], ['半導体。', '半導体。'], ['ロボット。', 'ロボット。'],
    ]);
    const result = analyze(source, 'topics', true);
    for (const term of ['必要条件', '内容証明', '確認申請', '地熱発電', '量子誤り訂正', '茶道具']) {
      expect(result.terms.map((item) => item.term)).toContain(term);
      expect(result.contexts[term]?.[0]?.excerpt).toContain(term);
    }
    expect(result.terms.map((item) => item.term)).not.toContain('必要');
    const docs = prepareAnalysisDocuments(source, { ...DEFAULT_ANALYSIS_SETTINGS }).documents;
    expect(computeTermStatistics(docs).find((term) => term.term === '必要')).toMatchObject({ dfUser: 2, dfAssistant: 2 });
  });

  it('requires two source messages for a single-thread noun compound and never crosses punctuation', () => {
    const source = corpus([
      ['地熱発電。', '地熱発電。'], ['茶道具。', '茶道具。'], ['半導体。', '半導体。'], ['ロボット。', 'ロボット。'],
    ]);
    // Morphologically valid noun spans now need two messages, not old NPMI and
    // multi-conversation support. Repeating a phrase in ONE message is insufficient.
    expect(analyze(source, 'topics', true).terms.map((term) => term.term)).toContain('地熱発電');
    const oneMessage = corpus([['地熱発電。'.repeat(10), 'はい。'], ['茶道具。', '茶道具。']]);
    expect(analyze(oneMessage, 'topics', true).terms.map((term) => term.term)).not.toContain('地熱発電');
    const spaced = corpus([['地熱 発電。', '地熱 発電。', '地熱 発電。'], ['茶道具。'], ['半導体。'], ['ロボット。']]);
    expect(analyze(spaced, 'topics', true).terms.map((term) => term.term)).not.toContain('地熱 発電');
    const split = corpus([['地熱！発電。', '地熱！発電。', '地熱！発電。']]);
    expect(analyze(split, 'topics', true).terms.some((term) => term.kind === 'phrase')).toBe(false);
  });

  it('keeps long-running core topics and meaningful short words without a topic whitelist', () => {
    const source = corpus(Array.from({ length: 10 }, (_, i) => [
      `ロボット。茶道具。りんご。AI。UI。${i < 2 ? '半導体。' : ''}${procedural}`,
      'ロボット。茶道具。りんご。AI。UI。',
    ]));
    const result = analyze(source);
    for (const term of ['ロボット', '茶道具', 'りんご', 'ai', 'ui', '半導体']) {
      expect(result.terms.map((item) => item.term)).toContain(term);
    }
    expect(result.terms[0]?.conversationCoverage).toBe(10);
    const core = result.terms.find((term) => term.term === 'ロボット')!;
    // Corpus specificity is now an independently measured selection score;
    // importance remains the unchanged message/conversation-coverage size metric.
    expect(vocabularySelectionScore(core, 10)).toBeCloseTo(Math.log1p(20) * 20 / 22);
    expect(core.importance).toBeCloseTo(Math.log1p(20) * (1 + 0.35 * Math.log1p(10)));
    const rare = result.terms.find((term) => term.term === '半導体')!;
    expect(vocabularySelectionScore(rare, 10)).toBeCloseTo(Math.log1p(2) * (1 + Math.log(11 / 3)) * 2 / 4);
    expect(core.topicEvidence?.eligible).toBe(true);
  });

  it('applies topic eligibility to provider summaries and does not promote unobserved shared words', () => {
    const source = mixed().map((thread, i) => ({ ...thread, provider: i % 2 ? 'chatgpt' as const : 'claude' as const,
      messages: thread.messages.map((message) => ({ ...message, provider: i % 2 ? 'chatgpt' as const : 'claude' as const })) }));
    const result = analyze(source, 'topics', true);
    for (const provider of result.insights.providerComparison ?? []) {
      expect(provider.topTerms.every((term) => topics.includes(term))).toBe(true);
    }
    const single = corpus([['相続税。', 'はい。', '相続税。', 'OK。']]);
    expect(analyze(single).terms[0]).toMatchObject({ bias: 1, biasLabel: 'user', dfAssistant: 0 });
    expect(analyze(single).insights.shared).toEqual([]);
  });

  it('discloses the committed display mode separately from physical omissions', () => {
    const result = analyze(mixed());
    expect(vocabularySelectionLabel(result.display)).toBe('話題優先 · 定型語等を対象外 11語');
    expect(vocabularySelectionLabel(analyze(mixed(), 'all').display)).toBe('使用語を広く');
    expect(result.display.layoutOmittedCount).toBe(0);
  });

  it('filters adoption eligibility before its display limit without changing per-term evidence', () => {
    const noise = '今回。内容。確認。必要。方法。対応。整理。具体的。';
    const source = corpus(Array.from({ length: 5 }, (_, i) => [
      `${noise}${i <= 2 ? '相続税。' : ''}`, noise,
    ]));
    source[0]!.messages[0]!.role = 'assistant';
    const broad = analyze(source, 'all', true);
    const result = analyze(source, 'topics', true);
    expect(broad.insights.adoption).toHaveLength(8);
    expect(broad.insights.adoption.map((term) => term.term)).not.toContain('相続税');
    expect(result.insights.adoption).toEqual([expect.objectContaining({
      term: '相続税', laterUserMessages: 2, laterConversations: 2,
    })]);
    expect(result.insights.echo).toEqual(broad.insights.echo);
  });
});
