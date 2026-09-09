import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_SETTINGS, type NormalizedConversation } from '../domain/models';
import { cleanText, cleanTextDetailed } from './cleanText';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';

const citation = (payload: string, kind = 'cite'): string => `\uE200${kind}\uE202${payload}\uE201`;

describe('provider citation controls are analysis-only noise', () => {
  it('excludes complete math, inline source and shell prompts without bridging words or removing prose', () => {
    const text = String.raw`前 \[\mathbb{R} \bigl(x\bigr)\] 後
数式 \(\ell_w = 1\) 説明
理論 $\alpha + x$ の研究。価格は $25 と $30。
sample@localMachine project % npm install`;
    expect(cleanText(text)).toBe('前\n後\n数式\n説明\n理論\nの研究。価格は $25 と $30。');
    expect(cleanText('量子`internal_symbol = 1`回路')).toBe('量子\n回路');
    expect(cleanText(text, { excludeCode: false })).toContain('mathbb');
    expect(cleanText('LaTeXと線形代数について。未完 $x の説明')).toBe('LaTeXと線形代数について。未完 $x の説明');
  });

  it('retains bounded inline identifiers, not executable expressions or removed-span phrase joins', () => {
    expect(cleanText('`React` と `useEffect`、`Node.js`、`C++` と `C#`。'))
      .toBe('React\nと\nuseEffect\n、\nNode.js\n、\nC++\nと\nC#\n。');
    expect(cleanText('differential `privacy` analysis')).toBe('differential\nprivacy\nanalysis');
    for (const expression of ['const secret = 1', 'foo(bar)', 'foo + bar', 'counter++', '/Users/private/token',
      'https://example.invalid/key', 'name@example.invalid', `X${'abc'.repeat(30)}`]) {
      expect(cleanText(`前\`${expression}\`後`), expression).toBe('前\n後');
    }
    expect(cleanText('前`safe_name_64`後')).toBe('前\nsafe_name_64\n後');
    expect(cleanText('前`unclosed')).toBe('前`unclosed');
  });

  it('preserves Markdown anchor wording with boundaries rather than inventing an enclosing phrase', () => {
    expect(cleanText('finite [element](https://example.invalid/private) method'))
      .toBe('finite\nelement\nmethod');
    expect(cleanText('[finite element method](https://example.invalid/private)'))
      .toBe('finite element method');
  });

  it('tracks only observed inline identifiers at final UTF-16 offsets after normalization and redaction', () => {
    const source = '  🧭 ＡＩ https://example.invalid/private `React` と `useEffect`  ';
    const cleaned = cleanTextDetailed(source);
    expect(cleaned.text).toBe('🧭 AI\nReact\nと\nuseEffect');
    expect(cleaned.identifierSpans).toEqual([{ index: 6, end: 11 }, { index: 14, end: 23 }]);
    expect(cleaned.identifierSpans?.map(({ index, end }) => cleaned.text.slice(index, end)))
      .toEqual(['React', 'useEffect']);
    expect(cleaned.text).not.toMatch(/[\uFDD0\uFDD1]/u);
    expect(source).toContain('`React`');
    expect(cleanTextDetailed('`React`', { excludeCode: false }).identifierSpans).toBeUndefined();
  });

  it('does not accept forged provenance, redactable hashes or identifiers cut by the text cap', () => {
    expect(cleanTextDetailed('\uFDD0React\uFDD1')).toEqual({ text: 'React', truncated: false });
    expect(cleanTextDetailed('before `abcdef0123456789abcdef0123456789` after'))
      .toEqual({ text: 'before\nafter', truncated: false });
    expect(cleanTextDetailed('`React` `useEffect`', { maxLength: 10 }))
      .toEqual({ text: 'React\nuseE', truncated: true, identifierSpans: [{ index: 0, end: 5 }] });
    expect(cleanTextDetailed('`React`', { maxLength: 3 }))
      .toEqual({ text: 'Rea', truncated: true });
  });
  it('removes complete cite/filecite controls and separates adjacent prose', () => {
    const source = `研究${citation('turn0search0\uE202turn1view2')}検証 ${citation('turn0file0', 'filecite')} 参考`;
    expect(cleanText(source)).toBe('研究\n検証\n参考');
    expect(cleanText(source, { excludeCode: false, excludeQuotes: false })).toBe('研究\n検証\n参考');
    expect(cleanText(source)).toBe(cleanText(source));
  });

  it('preserves ordinary cite/filecite words and unrelated private-use symbols', () => {
    expect(cleanText('cite filecite citation 引用 \uE200unknown\uE202reference\uE201 \uE000'))
      .toBe('cite filecite citation 引用 \uE200unknown\uE202reference\uE201 \uE000');
  });

  it('does not consume following prose through malformed or multiline controls', () => {
    for (const source of [
      '\uE200cite\uE202turn0search0 本文',
      '\uE200cite\uE202\uE201 本文',
      '\uE200cite\uE202turn0search0\n本文\uE201',
      '\uE200cite\uE202turn0search0\uE200unknown\uE201 本文',
    ]) {
      expect(cleanText(source)).toContain('cite');
      expect(cleanText(source)).toContain('本文');
    }
  });

  it('bounds each recognized payload to 4096 UTF-16 code units', () => {
    const payload = 'reference '.repeat(410);
    expect(cleanText(`前 ${citation(payload.slice(0, 4096))} 後`)).toBe('前\n後');
    expect(cleanText(`前 ${citation(payload.slice(0, 4097))} 後`)).toContain('cite');
  });

  it('excludes controls from frequency numerators and the same cleaned token denominators without mutating context', () => {
    const sourceTexts = [
      `Signal signal DATA ${citation('turn0search0')}`,
      `signal data data ${citation('turn1file0', 'filecite')}`,
    ];
    const corpus: NormalizedConversation[] = [{
      id: 'synthetic-citations', provider: 'chatgpt', title: 'Synthetic citation fixture', createdAt: null, updatedAt: null,
      messages: sourceTexts.map((text, index) => ({
        id: `synthetic-message-${index}`, conversationId: 'synthetic-citations', provider: 'chatgpt',
        role: index === 0 ? 'user' : 'assistant', createdAt: null, order: index,
        originalText: text, analysisText: text,
      })),
    }];
    const before = structuredClone(corpus);
    const settings = { ...DEFAULT_ANALYSIS_SETTINGS, minDocumentFrequency: 1, includePhrases: false, hiddenTerms: ['data'] };
    const prepared = prepareAnalysisDocuments(corpus, settings);
    expect(prepared.documents.map((document) => document.cleanedText)).toEqual(['Signal signal DATA', 'signal data data']);
    expect(prepared.documents.map((document) => document.words.length)).toEqual([2, 1]);
    expect(prepared.documents.map((document) => document.message.originalText)).toEqual(sourceTexts);

    const result = analyzeConversations(corpus, settings);
    expect(result.terms.map((term) => term.term)).toEqual(['signal']);
    expect(result.terms[0]).toMatchObject({
      dfUser: 1, dfAssistant: 1, rateUser: 1, rateAssistant: 1, biasLabel: 'shared',
      tokenFrequencyUser: 2, tokenFrequencyAssistant: 1, tokenTotalUser: 2, tokenTotalAssistant: 1,
      per1000TokensUser: 1000, per1000TokensAssistant: 1000,
    });
    expect(corpus).toEqual(before);
  });
});
