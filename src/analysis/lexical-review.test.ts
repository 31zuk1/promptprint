import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_SETTINGS, type NormalizedConversation } from '../domain/models';
import { extractLexicalTokens } from './lexical';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';

// Independent, synthetic-only adversarial review cases. These are not drawn
// from the owner's history and do not encode a list of preferred topic names.
const corpus = (text: string): NormalizedConversation[] => [0, 1].map((index) => ({
  id: `review-${index}`, title: 'Synthetic review', provider: 'demo',
  createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
  messages: [0, 1].map((order) => ({
    id: `m-${order}`, conversationId: `review-${index}`, provider: 'demo',
    role: order === 0 ? 'user' : 'assistant', order, createdAt: 1_700_000_000_000,
    originalText: text, analysisText: text,
  })),
}));
const settings = { ...DEFAULT_ANALYSIS_SETTINGS, termLimit: 120 as const, minDocumentFrequency: 2 };
const selected = (text: string) => analyzeConversations(corpus(text), settings).terms.map((term) => term.term);

describe('independent morphology architecture regressions', () => {
  it('retains content-bearing procedural noun atoms inside complete compounds', () => {
    const terms = selected('説明変数。質問応答。回答率。');
    expect(terms).toEqual(expect.arrayContaining(['説明変数', '質問応答', '回答率']));
    expect(terms).not.toContain('説明');
    expect(terms).not.toContain('質問');
    expect(terms).not.toContain('回答');
  });

  it('does not reverse a subject by dropping nominal negation or technical prefixes', () => {
    const terms = selected('非営利法人。超伝導。再分配。');
    expect(terms).toEqual(expect.arrayContaining(['非営利法人', '超伝導', '再分配']));
    expect(terms).not.toContain('営利法人');
    expect(terms).not.toContain('伝導');
    expect(terms).not.toContain('非');
  });

  it('retains meaningful observed Latin technical identifiers without symbol-only filler', () => {
    const terms = selected('C++。C#。3D。Node.js。');
    expect(terms).toEqual(expect.arrayContaining(['c++', 'c#', '3d', 'node.js']));
    expect(terms.some((term) => /^[+#.]+$/u.test(term))).toBe(false);
  });

  it('preserves exact spans across astral characters and never bridges removed syntax', () => {
    const text = '😀有限要素法。量子場理論！研究 OK 設計。';
    const words = extractLexicalTokens(text);
    for (const word of words) expect(text.slice(word.index, word.end)).toBe(word.surface);
    const prepared = prepareAnalysisDocuments(corpus(text), settings);
    for (const document of prepared.documents) {
      for (const phrase of document.phrases) {
        expect(document.cleanedText.slice(phrase.index, phrase.end)).toBe(phrase.surface);
        expect(phrase.surface).not.toMatch(/[😀。！]|OK/u);
      }
    }
  });

  it('keeps quantitative evidence identical between the two selection modes', () => {
    const data = corpus('有限要素法。境界条件。条件を確認する。');
    const topic = analyzeConversations(data, settings);
    const broad = analyzeConversations(data, { ...settings, vocabularyFocus: 'all' });
    for (const term of topic.terms) {
      expect(broad.terms.find((candidate) => candidate.term === term.term && candidate.kind === term.kind)).toEqual(term);
    }
    expect(topic.summary).toEqual(broad.summary);
  });
});
