import { describe, expect, it } from 'vitest';
import { extractNounPhrases } from './nounPhrases';
import type { PhraseDocument } from './phrases';
import type { SurfaceToken } from './tokenize';

const doc = (messageId: string, atoms: Array<string | [string, Partial<SurfaceToken>]>, separator = ''): PhraseDocument => {
  let text = '';
  const tokens = atoms.map((atom, index) => {
    const [surface, flags] = typeof atom === 'string' ? [atom, {}] : atom;
    if (index) text += separator;
    const start = text.length;
    text += surface;
    return { term: surface.toLowerCase(), surface, index: start, end: text.length,
      noun: true, topicEligible: true, ...flags };
  });
  return { messageId, conversationId: 'focused-thread', text, tokens };
};
const labels = (documents: PhraseDocument[]) => [...extractNounPhrases(documents).documentFrequency.keys()];

describe('bounded discovery and exact replay of morphological noun phrases', () => {
  it('recognizes productive nominal derivatives without promoting generic noun sequences', () => {
    const atoms: Array<string | [string, Partial<SurfaceToken>]> = [
      ['回答', { topicEligible: false }], ['率', { suffix: true, topicEligible: false }],
    ];
    expect(labels([doc('a', atoms), doc('b', atoms)])).toEqual(['回答率']);
    const generic = [['内容', { topicEligible: false }], ['確認', { topicEligible: false }]] as Array<[string, Partial<SurfaceToken>]>;
    expect(labels([doc('a', generic), doc('b', generic)])).toEqual([]);
    const discourse = [['内容', { topicEligible: false }], ['等', { suffix: true, topicEligible: false }]] as Array<[string, Partial<SurfaceToken>]>;
    expect(labels([doc('a', discourse), doc('b', discourse)])).toEqual([]);
    const users = [['利用', { topicEligible: false }], ['者', { suffix: true, topicEligible: false }],
      ['数', { suffix: true, topicEligible: false }]] as Array<[string, Partial<SurfaceToken>]>;
    expect(labels([doc('a', users), doc('b', users)])).toContain('利用者数');
  });

  it('allows nominal prefixes, never suffix starts or dangling prefix/adjective heads', () => {
    const atoms: Array<string | [string, Partial<SurfaceToken>]> = [
      ['非', { prefix: true, topicEligible: false }], '営利', '法人',
    ];
    expect(labels([doc('a', atoms), doc('b', atoms)])).toContain('非営利法人');
    const suffix = [['率', { suffix: true, topicEligible: false }], '制度'] as Array<string | [string, Partial<SurfaceToken>]>;
    expect(labels([doc('a', suffix), doc('b', suffix)])).toEqual([]);
    const english = [['finite', { adjective: true, topicEligible: false }], 'element', 'method'] as Array<string | [string, Partial<SurfaceToken>]>;
    expect(labels([doc('a', english, ' '), doc('b', english, ' ')])).toContain('finite element method');
    const dangling = ['surface', ['finite', { adjective: true, topicEligible: false }]] as Array<string | [string, Partial<SurfaceToken>]>;
    expect(labels([doc('a', dangling, ' '), doc('b', dangling, ' ')])).toEqual([]);
  });

  it('requires two distinct messages, not repeated text or duplicate pieces of one message', () => {
    const repeated = doc('a', ['有限', '要素', '有限', '要素']);
    expect(labels([repeated, repeated])).toEqual([]);
    const another = doc('b', ['有限', '要素']);
    const result = extractNounPhrases([repeated, another]);
    expect(result.documentFrequency.get('有限要素')).toBe(2);
    expect([...result.byMessage.values()].flat().filter((phrase) => phrase.term === '有限要素')).toHaveLength(3);
  });

  it('does not spend the retained-position budget on a large set of singletons', () => {
    const singletons = Array.from({ length: 4_000 }, (_, index) => doc(`single-${index}`, [`Topic${index}`, 'evidence'], ' '));
    const retained = [doc('a', ['境界', '条件']), doc('b', ['境界', '条件'])];
    const result = extractNounPhrases([...singletons, ...retained], { maximumOccurrences: 2 });
    expect(result.limited).toBe(false);
    expect([...result.documentFrequency]).toEqual([['境界条件', 2]]);
    expect([...result.byMessage.values()].flat()).toHaveLength(2);
    const reversed = extractNounPhrases([...singletons, ...retained].reverse(), { maximumOccurrences: 2 });
    expect([...reversed.documentFrequency]).toEqual([...result.documentFrequency]);
  });

  it('omits a whole family when even that family cannot fit, never returning partial counts', () => {
    const documents = [doc('a', ['境界', '条件']), doc('b', ['境界', '条件'])];
    for (const options of [{ maximumOccurrences: 1 }, { maximumCandidates: 0 }]) {
      const result = extractNounPhrases(documents, options);
      expect(result.limited).toBe(true);
      expect(result.byMessage.size).toBe(0);
      expect(result.documentFrequency.size).toBe(0);
    }
  });

  it('retains the strongest complete families after candidate or position limits', () => {
    const common = Array.from({ length: 8 }, (_, index) => doc(`common-${index}`, ['量子', '場', '理論']));
    const other = Array.from({ length: 4 }, (_, index) => doc(`other-${index}`, ['境界', '条件']));
    const documents = [...other, ...common];
    const candidateLimited = extractNounPhrases(documents, { maximumCandidates: 1 });
    expect(candidateLimited.limited).toBe(true);
    expect([...candidateLimited.documentFrequency]).toEqual([['量子場理論', 8]]);
    expect(candidateLimited.selection).toMatchObject({ candidateCapacityReached: true, retainedFamilies: 1, retainedOccurrences: 8 });
    const reverse = extractNounPhrases([...documents].reverse(), { maximumCandidates: 1 });
    expect([...reverse.documentFrequency]).toEqual([...candidateLimited.documentFrequency]);
    const bounded = extractNounPhrases(documents, { maximumOccurrences: 12 });
    expect(bounded.limited).toBe(true);
    expect([...bounded.documentFrequency]).toEqual([['量子場理論', 8], ['境界条件', 4]]);
    expect(bounded.selection).toMatchObject({ retainedFamilies: 2, omittedSupportedFamilies: 2, retainedOccurrences: 12 });
    const full = extractNounPhrases(documents);
    for (const term of bounded.documentFrequency.keys()) {
      expect([...bounded.byMessage.values()].flat().filter((phrase) => phrase.term === term))
        .toEqual([...full.byMessage.values()].flat().filter((phrase) => phrase.term === term));
    }
  });

  it('preserves repeated compounds in a multi-thousand-message corpus with over 100,000 singleton families', () => {
    const topics = [
      ['量子', '場', '理論'], ['有限', '要素', '解析'], ['乳酸', '発酵', '管理'],
      ['分散', '通信', '制御'], ['都市', '交通', '計画'], ['国際', '租税', '制度'],
      ['文化', '遺産', '保存'], ['海洋', '環境', '調査'], ['細胞', '膜', '構造'],
      ['地熱', '発電', '設備'], ['古典', '文学', '研究'], ['音響', '信号', '処理'],
    ];
    const documents = Array.from({ length: 4_800 }, (_, index): PhraseDocument => {
      let text = '';
      const tokens: SurfaceToken[] = [];
      const segments = [
        ...Array.from({ length: 25 }, (_, singleton) => [`Observation${index}_${singleton}`, 'sample']),
        topics[index % topics.length]!,
      ];
      for (const segment of segments) {
        if (text) text += '。';
        for (const [partIndex, surface] of segment.entries()) {
          if (partIndex && /^[A-Za-z]/u.test(surface)) text += ' ';
          const start = text.length;
          text += surface;
          tokens.push({ term: surface.toLowerCase(), surface, index: start, end: text.length, noun: true, topicEligible: true });
        }
      }
      return { messageId: `large-${index}`, conversationId: `conversation-${Math.floor(index / 8)}`, text, tokens };
    });
    const result = extractNounPhrases(documents);
    expect(result.limited).toBe(false);
    for (const parts of topics) {
      const term = parts.join('');
      expect(result.documentFrequency.get(term)).toBe(400);
      expect([...result.byMessage.values()].flat().filter((phrase) => phrase.term === term)).toHaveLength(400);
    }
    expect([...result.documentFrequency.keys()].some((term) => term.startsWith('observation'))).toBe(false);
    expect(result.selection?.retainedOccurrences).toBeGreaterThan(4_800);
    expect(result.selection?.retainedOccurrences).toBeLessThanOrEqual(500_000);
  }, 60_000);

  it('never bridges whitespace Japanese lists, punctuation, line breaks, or removed words', () => {
    for (const separator of [' ', '。', '\n', ' OK ']) {
      expect(labels([doc('a', ['研究', '設計'], separator), doc('b', ['研究', '設計'], separator)])).toEqual([]);
    }
    expect(labels([doc('a', ['finite', 'element'], '\n'), doc('b', ['finite', 'element'], '\n')])).toEqual([]);
    const source = doc('a', ['finite', 'element', 'method'], '  ');
    const result = extractNounPhrases([source, { ...source, messageId: 'b' }]);
    for (const phrase of result.byMessage.get('a')!) expect(source.text.slice(phrase.index, phrase.end)).toBe(phrase.surface);
  });

  it('bounds Japanese to six atoms and English to four without arbitrary long sentences', () => {
    const japanese = ['生命', '科学', '研究', '開発', '推進', '機構'];
    expect(labels([doc('a', japanese), doc('b', japanese)])).toContain(japanese.join(''));
    const english = ['local', 'finite', 'element', 'matrix', 'method'];
    const result = extractNounPhrases([doc('a', english, ' '), doc('b', english, ' ')]);
    expect([...result.byMessage.values()].flat().every((phrase) => phrase.tokenCount <= 4)).toBe(true);
    expect([...result.documentFrequency.keys()]).not.toContain(english.join(' '));
  });
});
