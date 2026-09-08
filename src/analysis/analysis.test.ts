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
} from './layout';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';
import { extractPhrases } from './phrases';
import { computeTermStatistics, type AnalysisDocument } from './statistics';
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
    expect(cleaned).toContain('残す 資料');
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

    const corpus = [
      conversation('p1', [{ role: 'user', text: '機械 学習 設計' }]),
      conversation('p2', [{ role: 'assistant', text: '機械 学習 実装' }]),
    ];
    const withPhrases = analyzeConversations(corpus, settings({ minDocumentFrequency: 2 }));
    const wordsOnly = analyzeConversations(corpus, settings({ includePhrases: false, minDocumentFrequency: 2 }));
    expect(withPhrases.terms.some((term) => term.kind === 'phrase')).toBe(true);
    expect(wordsOnly.terms.every((term) => term.kind === 'word')).toBe(true);
  });
});

describe('role-normalized statistics', () => {
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
  bias,
  biasLabel: bias > 0.18 ? 'user' : bias < -0.18 ? 'assistant' : 'shared',
  importance: 5 - index * 0.04,
  conversationCoverage: 0.5,
  providerCoverage: ['demo'],
  rawFrequency: 10 - Math.floor(index / 10),
});

describe('deterministic layout', () => {
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

describe('pipeline and contexts', () => {
  it('produces the expected demo vocabulary and conservative adoption evidence', () => {
    const result = analyzeConversations(createDemoConversations(), settings());
    const displays = new Set(result.terms.map((term) => term.display));

    for (const expected of ['ロボット', '研究', '要件', 'リスク']) {
      expect(displays.has(expected)).toBe(true);
    }
    expect(result.insights.adoption.map((candidate) => candidate.display)).toContain('交絡要因');
    expect(result.layout.length).toBeGreaterThan(20);
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
