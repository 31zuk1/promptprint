import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_SETTINGS } from '../domain/models';
import { qualityCorpus } from '../test/fixtures/topic-quality';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';

describe('source-grounded topics across removed notation and private spans', () => {
  it.each([
    ['inline code', '`noiseBudget = 3`'],
    ['inline math', '\\(x_i = 0\\)'],
    ['display math', '\\[x_i = 0\\]'],
    ['dollar math', '$x_i$'],
    ['double dollar math', '$$x_i = 0$$'],
    ['URL', 'https://example.invalid/private-note'],
    ['email', 'reader@example.invalid'],
    ['hash', '0123456789abcdef0123456789abcdef'],
    ['path', '/Users/synthetic/private/notes.txt'],
    ['provider citation', '\uE200cite\uE202turn0search0\uE201'],
  ])('does not manufacture an English noun phrase across removed %s', (_kind, removed) => {
    const broken = `I compared differential ${removed} privacy in the notes.`;
    const source = qualityCorpus([
      [broken, broken],
      ['The finite element method approximates displacement.', 'The finite element method uses a mesh.'],
    ]);
    const settings = { ...DEFAULT_ANALYSIS_SETTINGS, termLimit: 40 as const };
    const documents = prepareAnalysisDocuments(source, settings).documents;
    // Whitespace is a valid English phrase separator, so sanitization must
    // retain a different boundary for removed material. The complete phrase
    // never occurs in either original source message and cannot be inferred.
    expect(documents.flatMap((document) => document.phrases.map((phrase) => phrase.term)))
      .not.toContain('differential privacy');
    const result = analyzeConversations(source, settings);
    expect(result.terms.map((term) => term.term)).not.toContain('differential privacy');
    expect(result.terms.map((term) => term.term)).toContain('finite element method');
    for (const term of result.terms) {
      expect(result.contexts[term.term]?.length, term.term).toBeGreaterThan(0);
    }
  });

  it('retains a real English noun phrase, but never joins nouns across a line or block quote', () => {
    const source = qualityCorpus([
      ['differential\nprivacy', 'differential\nprivacy'],
      ['differential\n> confidential annotation\nprivacy', 'differential\n> confidential annotation\nprivacy'],
      ['differential privacy provides a formal guarantee.', 'differential privacy adds carefully calibrated noise.'],
    ]);
    const result = analyzeConversations(source, DEFAULT_ANALYSIS_SETTINGS);
    const term = result.terms.find((candidate) => candidate.term === 'differential privacy');
    expect(term).toMatchObject({ dfUser: 1, dfAssistant: 1, conversationCoverage: 1 });
    const contexts = result.contexts['differential privacy'] ?? [];
    expect(contexts).toHaveLength(2);
    expect(contexts.every((context) => context.conversationId === 'quality-thread-2')).toBe(true);
  });

  it('does not mistake Japanese adjectival predicates for repeated conversation subjects', () => {
    const source = qualityCorpus(Array.from({ length: 4 }, () => [
      'うーん、かなり複雑ですね。これは確実でしょうか。無理ではないでしょうか。',
      '大丈夫です。丁寧に見ていきましょう。複雑でも、無理というわけではありません。',
      'もっと丁寧にお願いします。確実なら大丈夫です。',
      'はい、複雑ですね。丁寧に進めると大丈夫です。',
    ]));
    const result = analyzeConversations(source, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.terms.map((term) => term.term)).toEqual([]);
    // This is a display decision, not evidence that the original wording vanished.
    const broad = analyzeConversations(source, { ...DEFAULT_ANALYSIS_SETTINGS, vocabularyFocus: 'all' });
    expect(broad.summary).toEqual(result.summary);
    expect(broad.insights.echo).toEqual(result.insights.echo);
  });

  it('preserves nominal and compound uses of adjective-like Japanese stems', () => {
    const source = qualityCorpus([
      ['自由が保障される制度を調べたい。自由の定義は何ですか。',
        '自由が認められる範囲を比較します。自由の定義には歴史があります。',
        '不安を言葉で記録したい。不安の原因を決めつけたくありません。',
        '不安を記録することと診断は別です。不安の変化を記述できます。'],
      ['複雑系の研究を読みたい。自由エネルギーについても知りたいです。',
        '複雑系の相互作用を考えます。自由エネルギーの定義を確認しましょう。',
        '複雑系のモデルで自由エネルギーを計算しました。',
        '複雑系のモデルと自由エネルギーの関係を調べましょう。'],
    ]);
    const result = analyzeConversations(source, DEFAULT_ANALYSIS_SETTINGS);
    for (const subject of ['自由', '不安', '複雑系', '自由エネルギー']) {
      expect(result.terms.map((term) => term.term), subject).toContain(subject);
      expect(result.contexts[subject]?.length, subject).toBeGreaterThan(0);
    }
  });

  it('does not join across Markdown label boundaries, while phrases within a label have source contexts', () => {
    const source = qualityCorpus([
      ['finite [element](https://example.invalid/private) method', 'finite [element](https://example.invalid/private) method'],
      ['[finite element method](https://example.invalid/private) is a numerical technique.',
        '[finite element method](https://example.invalid/private) uses a mesh.'],
    ]);
    const result = analyzeConversations(source, DEFAULT_ANALYSIS_SETTINGS);
    expect(result.terms.find((term) => term.term === 'finite element method'))
      .toMatchObject({ dfUser: 1, dfAssistant: 1, conversationCoverage: 1 });
    expect(result.contexts['finite element method']).toHaveLength(2);
    expect(result.contexts['finite element method']?.every((context) => context.conversationId === 'quality-thread-1')).toBe(true);
  });

  it('recovers actual inline topic names with source evidence but never turns adjacent markup into a phrase', () => {
    const source = qualityCorpus([
      ['`React` の画面を作りたい。`useEffect` の動きと `Node.js` の接続を調べています。',
        '`React` の更新を見ます。`useEffect` と `Node.js` の役割を分けます。'],
      ['differential `privacy` needs a careful definition.', 'differential `privacy` must not be joined across markup.'],
    ]);
    const result = analyzeConversations(source, DEFAULT_ANALYSIS_SETTINGS);
    for (const subject of ['react', 'useeffect', 'node.js']) {
      expect(result.terms.map((term) => term.term), subject).toContain(subject);
      expect(result.contexts[subject]?.length, subject).toBeGreaterThan(0);
    }
    expect(result.terms.map((term) => term.term)).not.toContain('differential privacy');
  });

  it('uses inline source evidence per occurrence, not a global proper-name whitelist', () => {
    const line = 'People react quickly. The package is `React`.';
    const source = qualityCorpus([[line, line]]);
    const before = structuredClone(source);
    const settings = { ...DEFAULT_ANALYSIS_SETTINGS, includePhrases: false };
    const prepared = prepareAnalysisDocuments(source, settings);
    for (const document of prepared.documents) {
      const occurrences = document.words.filter((word) => word.term === 'react');
      expect(occurrences).toHaveLength(2);
      expect(occurrences.map((word) => word.topicEligible)).toEqual([false, true]);
      expect(occurrences.map((word) => document.cleanedText.slice(word.index, word.end)))
        .toEqual(['react', 'React']);
      expect(document.message.originalText).toBe(line);
    }
    expect(source).toEqual(before);
    const topic = analyzeConversations(source, settings);
    const broad = analyzeConversations(source, { ...settings, vocabularyFocus: 'all' });
    expect(topic.terms.find((term) => term.term === 'react')).toMatchObject({
      dfUser: 1, dfAssistant: 1, tokenFrequencyUser: 2, tokenFrequencyAssistant: 2,
    });
    expect(topic.summary).toEqual(broad.summary);
    expect(topic.insights.echo).toEqual(broad.insights.echo);
    const prose = qualityCorpus([['People react quickly.', 'People react quickly.']]);
    expect(analyzeConversations(prose, settings).terms.map((term) => term.term)).not.toContain('react');
  });
});
