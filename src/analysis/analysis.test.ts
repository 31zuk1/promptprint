import { describe, expect, it } from 'vitest';
import { createDemoConversations } from '../demo/demoConversations';
import {
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
  type MessageRole,
  type NormalizedConversation,
  type TermStats,
} from '../domain/models';
import { findAdoptionCandidates } from './adoption';
import { cleanText } from './cleanText';
import { buildContextIndex } from './contextIndex';
import { calculateEchoRate } from './echo';
import {
  CLOUD_HEIGHT,
  CLOUD_WIDTH,
  isTermWithinBounds,
  laidOutTermsOverlap,
  layoutTerms,
  layoutTermsDetailed,
  MAX_X_DRIFT_RATIO,
  semanticTargetX,
} from './layout';
import { createMobileOverviewLayoutDetailed } from './overview';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';
import { extractPhrases } from './phrases';
import { computeTermStatistics, findContainmentRepresentatives, selectTopTermsDetailed, type AnalysisDocument } from './statistics';
import { tokenize } from './tokenize';

const settings = (overrides: Partial<AnalysisSettings> = {}): AnalysisSettings => ({
  ...DEFAULT_ANALYSIS_SETTINGS,
  ...overrides,
});

const conversation = (
  id: string,
  messages: Array<{ role: MessageRole; text: string; at?: number }>,
  provider: NormalizedConversation['provider'] = 'demo',
): NormalizedConversation => ({
  id,
  provider,
  title: `会話 ${id}`,
  createdAt: messages[0]?.at ?? null,
  updatedAt: messages.at(-1)?.at ?? null,
  messages: messages.map((message, index) => ({
    id: `${id}-m${index}`,
    conversationId: id,
    provider,
    role: message.role,
    createdAt: message.at ?? null,
    order: index,
    originalText: message.text,
    analysisText: message.text,
  })),
});

const documentsFor = (
  conversations: NormalizedConversation[],
  overrides: Partial<AnalysisSettings> = {},
): AnalysisDocument[] => prepareAnalysisDocuments(conversations, settings(overrides)).documents;

describe('cleanText', () => {
  it('cleans untrusted markup and identifiers according to settings', () => {
    const source = [
      '残す [資料](https://example.com/private?q=1)',
      '> 引用にある秘密',
      '```ts',
      'const secret = "漏洩";',
      '```',
      '連絡 foo@example.com URL https://example.org/x',
      'path /Users/person/private/file.txt',
      'hash 0123456789abcdef0123456789abcdef',
      '安全\u200B な  文',
    ].join('\r\n');

    const cleaned = cleanText(source, { excludeCode: true, excludeQuotes: true });
    expect(cleaned).toContain('残す\n資料');
    expect(cleaned).toContain('安全 な 文');
    expect(cleaned).not.toMatch(/秘密|secret|example|Users|0123456789abcdef/u);

    const retained = cleanText(source, { excludeCode: false, excludeQuotes: false });
    expect(retained).toContain('引用にある秘密');
    expect(retained).toContain('const secret');
  });
});

describe('tokenize and phrases', () => {
  it('deterministically tokenizes mixed Japanese and English text', () => {
    const source = '北朝鮮とAIでReactを実装し、交絡要因を検証する。1234 x';
    const first = tokenize(source);
    const second = tokenize(source);
    const terms = first.map((token) => token.term);

    expect(second).toEqual(first);
    expect(terms).toEqual(expect.arrayContaining([
      '北朝鮮', 'ai', 'react', '実装', '交絡要因', '検証',
    ]));
    expect(terms).not.toEqual(expect.arrayContaining(['と', '1234', 'x']));
  });

  it('removes common Japanese inflection fragments without losing compounds', () => {
    const terms = tokenize('作りたい。見てしましょう。できるだけ交絡要因を検証したい。すると分かりやすくなり、先に仕様を決めて優先順位を付ける。合')
      .map((token) => token.term);
    expect(terms).toContain('交絡要因');
    expect(terms).toContain('検証');
    expect(terms).not.toEqual(expect.arrayContaining([
      '作り', 'たい', '見', 'しましょう', 'でき', 'だけ', 'すると', 'すく', 'なり', 'にし', '決め', '付け', '合',
    ]));
  });

  it('selects repeated associated phrases and lets words-only bypass them', () => {
    const phraseDocuments = [
      { messageId: 'm1', conversationId: 'c1', text: '機械 学習 設計', tokens: tokenize('機械 学習 設計') },
      { messageId: 'm2', conversationId: 'c2', text: '機械 学習 実装', tokens: tokenize('機械 学習 実装') },
    ];
    const extracted = extractPhrases(phraseDocuments);
    expect(extracted.byMessage.get('m1')?.map((phrase) => phrase.term)).toContain('機械 学習');

    // The production noun-phrase path requires literal Japanese adjacency;
    // the legacy helper above still tests its old whitespace/NPMI contract.
    const corpus = [
      conversation('p1', [{ role: 'user', text: '機械学習を設計する' }]),
      conversation('p2', [{ role: 'assistant', text: '機械学習を実装する' }]),
    ];
    const withPhrases = analyzeConversations(corpus, settings({ minDocumentFrequency: 2 }));
    const wordsOnly = analyzeConversations(corpus, settings({ includePhrases: false, minDocumentFrequency: 2 }));
    expect(withPhrases.terms.some((term) => term.kind === 'phrase')).toBe(true);
    expect(wordsOnly.terms.every((term) => term.kind === 'word')).toBe(true);
  });
});

describe('role-normalized statistics', () => {
  it('never labels an unobserved assistant term shared (10/100 versus 0/4)', () => {
    const corpus = [conversation('regression', [
      ...Array.from({ length: 100 }, (_, index) => ({ role: 'user' as const, text: index < 10 ? 'signal' : 'filler' })),
      ...Array.from({ length: 4 }, () => ({ role: 'assistant' as const, text: 'response' })),
    ])];
    const result = analyzeConversations(corpus, settings({ includePhrases: false }));
    expect(result.terms.find((term) => term.term === 'signal')).toMatchObject({
      dfUser: 10, dfAssistant: 0, rateUser: 0.1, rateAssistant: 0, bias: 1, biasLabel: 'user',
    });
    expect(result.insights.shared).toEqual([]);
  });

  it('requires both observations and close empirical rates; absent roles are insufficient', () => {
    const corpus = [conversation('rates', [
      { role: 'user', text: 'shared frequent' }, { role: 'user', text: 'frequent' },
      { role: 'assistant', text: 'shared frequent' }, { role: 'assistant', text: 'other' },
    ])];
    // This fixture measures role rates, including adjectives/verbs; the noun
    // topic policy must not be mistaken for deletion from the shared ledger.
    const result = analyzeConversations(corpus, settings({ includePhrases: false, vocabularyFocus: 'all' }));
    expect(result.terms.find((term) => term.term === 'shared')?.biasLabel).toBe('shared');
    expect(result.terms.find((term) => term.term === 'frequent')?.biasLabel).toBe('user');
    expect(result.insights.shared.map((term) => term.term)).toEqual(['shared']);
    const insufficient = analyzeConversations([conversation('single-role', [
      { role: 'user', text: 'signal' }, { role: 'user', text: 'signal' },
    ])], settings());
    expect(insufficient.terms[0]).toMatchObject({ biasLabel: 'insufficient', bias: 0,
      assistantMessageCount: 0, per1000TokensAssistant: null });
    expect(insufficient.insights.shared).toEqual([]);
  });

  it('uses the identical cleaned content-token stream for numerator and denominator', () => {
    const corpus = [conversation('tokens', [
      { role: 'user', text: 'Signal signal DATA and https://example.test/private foo@example.test\n> quote\n```js\nsecret\n```' },
      { role: 'assistant', text: 'signal data data data' },
    ])];
    const result = analyzeConversations(corpus, settings({ minDocumentFrequency: 1, hiddenTerms: ['data'], includePhrases: false }));
    expect(result.terms.find((term) => term.term === 'signal')).toMatchObject({
      dfUser: 1, dfAssistant: 1, rateUser: 1, rateAssistant: 1,
      tokenFrequencyUser: 2, tokenFrequencyAssistant: 1, tokenTotalUser: 2, tokenTotalAssistant: 1,
      per1000TokensUser: 1000, per1000TokensAssistant: 1000, conversationCoverage: 1,
    });
    expect(result.terms.map((term) => term.term)).toEqual(['signal']);
  });

  it('does not conflate message IDs reused by different conversations', () => {
    const corpus = ['c1', 'c2'].map((id) => conversation(id, [{ role: 'user', text: 'signal' }]));
    for (const item of corpus) item.messages[0]!.id = 'same-id';
    expect(computeTermStatistics(documentsFor(corpus))[0]).toMatchObject({ dfUser: 2, conversationCoverage: 2 });
  });
  it('uses message DF and role denominators when assigning bias', () => {
    const corpus = [
      conversation('u', [
        { role: 'user', text: 'signal' },
        { role: 'user', text: 'other' },
      ]),
      conversation('a', Array.from({ length: 8 }, (_, index) => ({
        role: 'assistant' as const,
        text: index < 2 ? 'signal response' : `filler response${index}`,
      }))),
    ];
    const terms = computeTermStatistics(documentsFor(corpus), { minimumDocumentFrequency: 1 });
    const signal = terms.find((term) => term.term === 'signal');

    expect(signal).toMatchObject({ dfUser: 1, dfAssistant: 2, biasLabel: 'user' });
    expect(signal?.rateUser).toBeGreaterThan(signal?.rateAssistant ?? 1);
    expect(signal?.conversationCoverage).toBe(2);
  });
});

describe('insights', () => {
  it('computes weighted lexical echo for adjacent user-assistant pairs', () => {
    const corpus = [conversation('echo', [
      { role: 'user', text: 'robot data analysis' },
      { role: 'assistant', text: 'robot data plan' },
      { role: 'user', text: 'thanks' },
      { role: 'assistant', text: 'welcome' },
    ])];
    const echo = calculateEchoRate(documentsFor(corpus));

    expect(echo.eligiblePairs).toBe(1);
    expect(echo.confidence).toBe('low');
    expect(echo.rate).not.toBeNull();
    expect(echo.rate ?? 0).toBeGreaterThan(0.5);
    expect(echo.rate ?? 1).toBeLessThan(0.7);
  });

  it('requires assistant-first use followed by repeated user use across conversations', () => {
    const corpus = [
      conversation('first', [{ role: 'assistant', text: 'confounder baseline', at: 10 }]),
      conversation('later-a', [{ role: 'user', text: 'confounder research', at: 20 }]),
      conversation('later-b', [{ role: 'user', text: 'confounder analysis', at: 30 }]),
      conversation('user-first', [
        { role: 'user', text: 'causal metric', at: 5 },
        { role: 'assistant', text: 'causal metric', at: 40 },
      ]),
    ];
    const documents = documentsFor(corpus);
    const terms = computeTermStatistics(documents, { minimumDocumentFrequency: 2 });
    const candidates = findAdoptionCandidates(documents, terms);

    expect(candidates).toContainEqual(expect.objectContaining({
      term: 'confounder',
      laterUserMessages: 2,
      laterConversations: 2,
      assistantFirstAt: 10,
      userFirstAt: 20,
    }));
    expect(candidates.some((candidate) => candidate.term === 'causal')).toBe(false);
  });
});

const fakeTerm = (index: number, bias: number): TermStats => ({
  term: `term-${String(index).padStart(2, '0')}`,
  display: index % 4 === 0 ? `日本語${index}` : `term ${index}`,
  kind: 'word',
  dfUser: 4,
  dfAssistant: 4,
  rateUser: 0.2,
  rateAssistant: 0.2,
  userMessageCount: 20, assistantMessageCount: 20,
  tokenFrequencyUser: 4, tokenFrequencyAssistant: 4,
  tokenTotalUser: 40, tokenTotalAssistant: 40,
  per1000TokensUser: 100, per1000TokensAssistant: 100,
  bias,
  biasLabel: bias > 0.18 ? 'user' : bias < -0.18 ? 'assistant' : 'shared',
  importance: 5 - index * 0.04,
  conversationCoverage: 0.5,
  providerCoverage: ['demo'],
  rawFrequency: 10 - Math.floor(index / 10),
});

describe('deterministic layout', () => {
  for (const count of [40, 80, 120]) {
    for (const bias of [1, 0.8, 0.2, -0.2, -0.8, -1]) {
      it(`preserves semantic X, bounds, collision freedom and omissions for ${count} terms at bias ${bias}`, () => {
        const input = Array.from({ length: count }, (_, index) => fakeTerm(index, bias));
        const result = layoutTermsDetailed(input, 'one-sided');
        expect(result).toEqual(layoutTermsDetailed(input, 'one-sided'));
        expect(result.layout.length).toBeGreaterThanOrEqual(10);
        expect(result.layout.length + result.omitted.length).toBe(count);
        expect(new Set([...result.layout, ...result.omitted].map((term) => term.term)).size).toBe(count);
        for (const [index, term] of result.layout.entries()) {
          expect(isTermWithinBounds(term)).toBe(true);
          expect(Math.abs(term.x - semanticTargetX(bias))).toBeLessThanOrEqual(CLOUD_WIDTH * MAX_X_DRIFT_RATIO + 0.01);
          if (bias > 0) expect(term.x + term.width / 2).toBeLessThanOrEqual(546.01);
          else expect(term.x - term.width / 2).toBeGreaterThanOrEqual(553.99);
          for (const other of result.layout.slice(index + 1)) expect(laidOutTermsOverlap(term, other)).toBe(false);
        }
        const mobile = createMobileOverviewLayoutDetailed(input);
        expect(mobile).toEqual(createMobileOverviewLayoutDetailed(input));
        expect(mobile.layout.length).toBeGreaterThan(0);
        expect(mobile.layout.length + mobile.omitted.length).toBe(24);
        for (const [index, term] of mobile.layout.entries()) {
          expect(term.x - term.width / 2).toBeGreaterThanOrEqual(7.99);
          expect(term.x + term.width / 2).toBeLessThanOrEqual(382.01);
          expect(term.y - term.height / 2).toBeGreaterThanOrEqual(7.99);
          expect(term.y + term.height / 2).toBeLessThanOrEqual(612.01);
          expect(Math.abs(term.x - semanticTargetX(bias, 390, 50))).toBeLessThanOrEqual(390 * MAX_X_DRIFT_RATIO + 0.01);
          if (bias > 0) expect(term.x + term.width / 2).toBeLessThanOrEqual(191.01);
          else expect(term.x - term.width / 2).toBeGreaterThanOrEqual(198.99);
          for (const other of mobile.layout.slice(index + 1)) expect(laidOutTermsOverlap(term, other)).toBe(false);
        }
      });
    }
  }

  it('omits an overlong word instead of clamping its measured width or moving it across the chart', () => {
    const long = { ...fakeTerm(1, 1), display: '極端に長い複合語'.repeat(30) };
    expect(layoutTermsDetailed([long])).toEqual({ layout: [], omitted: [long] });
  });
  it('keeps center-based boxes deterministic, bounded, and collision-free', () => {
    const terms = Array.from({ length: 120 }, (_, index) =>
      fakeTerm(index, index % 3 === 0 ? 0.75 : index % 3 === 1 ? 0 : -0.75));
    const first = layoutTerms(terms, 'same-settings');
    const second = layoutTerms(terms, 'same-settings');

    expect(first).toEqual(second);
    // A dense 120-term request may deliberately omit the smallest terms rather
    // than overlap them; this fixture should still retain most of the cloud.
    expect(first.length).toBeGreaterThanOrEqual(90);
    expect(first.every(isTermWithinBounds)).toBe(true);
    expect(first.every((term) => term.x >= 0 && term.x <= CLOUD_WIDTH)).toBe(true);
    expect(first.every((term) => term.y >= 0 && term.y <= CLOUD_HEIGHT)).toBe(true);
    for (let left = 0; left < first.length; left += 1) {
      for (let right = left + 1; right < first.length; right += 1) {
        expect(laidOutTermsOverlap(first[left]!, first[right]!)).toBe(false);
      }
    }
  });

  it('maps user terms left and assistant terms right', () => {
    const [user, shared, assistant] = layoutTerms([
      fakeTerm(1, 0.9),
      fakeTerm(2, 0),
      fakeTerm(3, -0.9),
    ], 'sides').sort((left, right) => right.bias - left.bias);
    expect(user?.x).toBeLessThan(shared?.x ?? 0);
    expect(shared?.x).toBeLessThan(assistant?.x ?? 0);
  });
});

describe('positional compound representation', () => {
  const phraseCorpus = (compoundCount: number, standaloneCount: number) =>
    ['p1', 'p2'].map((id) => conversation(id, [{ role: id === 'p1' ? 'user' : 'assistant',
      text: '優先順位。'.repeat(compoundCount) + '優先。順位。'.repeat(standaloneCount) }]));

  it.each([[8, 2, true], [7, 3, false], [1, 8, false]] as const)(
    'uses occurrence coverage, not message co-occurrence (%i compound / %i independent)',
    (compound, independent, suppress) => {
      const documents = documentsFor(phraseCorpus(compound, independent));
      const allTerms = computeTermStatistics(documents);
      const before = structuredClone(allTerms);
      expect(allTerms.find((term) => term.term === '優先順位')).toMatchObject({
        dfUser: 1, dfAssistant: 1, tokenFrequencyUser: compound, tokenFrequencyAssistant: compound,
        tokenTotalUser: 2 * (compound + independent), tokenTotalAssistant: 2 * (compound + independent),
        per1000TokensUser: compound / (2 * (compound + independent)) * 1000,
      });
      const selected = selectTopTermsDetailed(allTerms, 40, documents);
      expect(selected.terms.some((term) => term.term === '優先順位')).toBe(true);
      expect(selected.terms.some((term) => term.term === '優先')).toBe(!suppress);
      expect(selected.terms.some((term) => term.term === '順位')).toBe(!suppress);
      expect(selected.suppressedCount).toBe(suppress ? 2 : 0);
      expect(allTerms).toEqual(before);
    });

  it('does not treat text containment at unrelated positions as occurrence containment', () => {
    const documents = documentsFor(phraseCorpus(2, 0));
    const allTerms = computeTermStatistics(documents);
    // Retain the very same labels/counts but move the short occurrences outside
    // the actual compound spans. A substring/co-document heuristic fails here.
    for (const document of documents) {
      document.words = document.words.map((word) => ({ ...word, index: word.index + 1000, end: word.end + 1000 }));
    }
    expect(findContainmentRepresentatives(allTerms, documents).size).toBe(0);
    expect(selectTopTermsDetailed(allTerms, 40, documents).terms).toHaveLength(3);
  });

  it('counts repeated accepted phrases beyond the candidate-discovery prefix', () => {
    const text = '機械 学習。'.repeat(2600);
    const extracted = extractPhrases(['a', 'b'].map((id) => ({
      messageId: id, conversationId: id, text, tokens: tokenize(text),
    })));
    expect(extracted.byMessage.get('a')?.filter((term) => term.term === '機械 学習')).toHaveLength(2600);
    expect(extracted.documentFrequency.get('機械 学習')).toBe(2);
    expect(extracted.limited).toBe(false);
  });

  it('falls back to words only instead of publishing partial phrase counts at the work cap', () => {
    const documents = ['a', 'b'].map((id) => ({ messageId: id, conversationId: id,
      text: '機械 学習。'.repeat(10), tokens: tokenize('機械 学習。'.repeat(10)) }));
    const extracted = extractPhrases(documents, { maximumOccurrences: 5 });
    expect(extracted).toEqual({ byMessage: new Map(), documentFrequency: new Map(), limited: true });
  });
});

describe('pipeline and contexts', () => {
  it('produces the expected demo vocabulary and conservative adoption evidence', () => {
    const result = analyzeConversations(createDemoConversations(), settings());
    const displays = new Set(result.terms.map((term) => term.display));

    for (const expected of ['ロボット', '研究', '要件', 'リスク']) {
      expect(displays.has(expected)).toBe(true);
    }
    expect(result.insights.adoption.map((candidate) => candidate.display)).toContain('交絡要因');
    expect(result.layout.length).toBeGreaterThan(20);
    // The shared morphology ledger includes noun atoms and supported compounds;
    // topic presentation is accounted independently from that measurement set.
    expect(result.summary.analyzedTermCount).toBe(64);
    expect(result.terms).toHaveLength(39);
    expect(result.display).toEqual({ layoutOmittedCount: 0, compoundSuppressedCount: 7,
      vocabularyFocus: 'topics', topicFilteredCount: 18 });
    // Both modes retain this SAME new ledger; no old ICU count is preserved by
    // silently changing the role rates or token denominator in either mode.
    const broad = analyzeConversations(createDemoConversations(), settings({ vocabularyFocus: 'all' }));
    expect(broad.terms).toHaveLength(52);
    expect(broad.terms.filter((term) => ['し', 'せ', 'そう', '的', 'はい', 'ok'].includes(term.term))).toEqual([]);
    expect(broad.summary).toEqual(result.summary);
    for (const term of result.terms) expect(broad.terms.find((other) => other.term === term.term)).toEqual(term);
  });

  it('honors hidden terms in terms, layout, contexts, and insights', () => {
    const result = analyzeConversations(
      createDemoConversations(),
      settings({ hiddenTerms: ['ロボット'] }),
    );
    expect(result.terms.some((term) => term.term === 'ロボット')).toBe(false);
    expect(result.layout.some((term) => term.term === 'ロボット')).toBe(false);
    expect(result.contexts['ロボット']).toBeUndefined();
    expect(result.insights.userIntroduced.some((term) => term.term === 'ロボット')).toBe(false);
  });

  it('removes a hidden word before phrases and side metrics are derived', () => {
    const corpus = Array.from({ length: 4 }, (_, index) => conversation(`hidden-${index}`, [
      { role: 'user', text: 'private project orbital' },
      { role: 'assistant', text: 'private project response' },
    ]));
    const visible = analyzeConversations(corpus, settings({ minDocumentFrequency: 2 }));
    const result = analyzeConversations(corpus, settings({
      hiddenTerms: ['private'],
      minDocumentFrequency: 2,
    }));
    const renderedTerms = [...result.terms, ...result.layout]
      .map((term) => `${term.term} ${term.display}`)
      .join(' ');

    expect(renderedTerms).not.toContain('private');
    expect(Object.keys(result.contexts).join(' ')).not.toContain('private');
    expect(result.insights.echo.rate ?? 1).toBeLessThan(visible.insights.echo.rate ?? 0);
  });

  it('indexes clipped source excerpts with valid highlight offsets', () => {
    const corpus = [conversation('ctx', [
      { role: 'user', text: `${'前置き'.repeat(50)} React を実装する ${'後続'.repeat(50)}` },
      { role: 'assistant', text: 'React 実装を確認する' },
    ])];
    const documents = documentsFor(corpus);
    const terms = computeTermStatistics(documents, { minimumDocumentFrequency: 1 });
    const react = terms.find((term) => term.term === 'react');
    expect(react).toBeDefined();
    const index = buildContextIndex([react!], documents, { excerptLength: 100 });
    const context = index.react?.[0];

    expect(context).toBeDefined();
    if (!context) throw new Error('context fixture did not produce a match');
    expect(context?.excerpt.length).toBeLessThanOrEqual(102);
    expect(context.excerpt.slice(context.matchStart, context.matchEnd).toLocaleLowerCase('en-US')).toBe('react');
  });
});
