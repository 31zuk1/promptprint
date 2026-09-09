import { describe, expect, it } from 'vitest';
import { tagEnglishSpans } from './englishMorphology';

describe('local English contextual morphology', () => {
  it('separates grammatical clauses from noun heads and adjective modifiers', () => {
    const tokens = tagEnglishSpans('Recent studies suggest that immune cells regulate inflammatory pathways.');
    const pos = new Map(tokens.map((token) => [token.surface, token.pos]));
    expect(pos.get('studies')).toBe('NNS');
    expect(pos.get('suggest')).toBe('VBP');
    expect(pos.get('that')).toBe('IN');
    expect(pos.get('immune')).toBe('JJ');
    expect(pos.get('cells')).toBe('NNS');
    expect(pos.get('regulate')).toBe('VBP');
    expect(pos.get('inflammatory')).toBe('JJ');
    expect(pos.get('pathways')).toBe('NNS');
  });

  it('preserves technical noun phrases without treating requests as nouns', () => {
    const tokens = tagEnglishSpans('Please explain general relativity and information theory.');
    expect(tokens.map((token) => [token.surface, token.pos])).toEqual([
      ['Please', 'VB'], ['explain', 'VB'], ['general', 'JJ'], ['relativity', 'NN'],
      ['and', 'CC'], ['information', 'NN'], ['theory', 'NN'], ['.', '.'],
    ]);
  });

  it('keeps exact UTF-16 offsets, repeated surfaces, apostrophes and non-English context boundaries', () => {
    const text = "😀研究 I don’t think they're ready. 調査 immune cells と immune cells\nAI";
    const tokens = tagEnglishSpans(text);
    for (const token of tokens) expect(text.slice(token.index, token.end)).toBe(token.surface);
    expect(tokens.filter((token) => token.surface === 'immune').map((token) => token.index))
      .toEqual([text.indexOf('immune'), text.lastIndexOf('immune')]);
    expect(tokens.some((token) => /研究|調査|😀/u.test(token.surface))).toBe(false);
    expect(tokens.filter((token) => token.surface === 'n’t')).toHaveLength(1);
    expect(tokens.filter((token) => token.surface === "'re")).toHaveLength(1);
    expect(tokens.some((token) => token.surface === 'not' || token.surface === 'are')).toBe(false);
  });

  it('retains observed inflections instead of replacing the frequency ledger with lemmas', () => {
    const text = 'The researchers studied cellular membranes.';
    const tokens = tagEnglishSpans(text);
    expect(tokens.map((token) => token.surface)).toContain('studied');
    expect(tokens.map((token) => token.surface)).not.toContain('study');
    // The bundled model calls this VBN rather than VBD; both are verb tags.
    // This contract concerns source forms, not a claim of perfect tense tagging.
    expect(tokens.find((token) => token.surface === 'studied')?.pos).toBe('VBN');
  });

  it('bounds long contexts deterministically and excludes pathological chopped tokens', () => {
    const text = `${'immune cells regulate pathways. '.repeat(200)}${'x'.repeat(20_000)} research`;
    const first = tagEnglishSpans(text);
    expect(tagEnglishSpans(text)).toEqual(first);
    expect(first.filter((token) => token.surface === 'immune')).toHaveLength(200);
    expect(first.filter((token) => token.limited)).toHaveLength(1);
    expect(first.find((token) => token.limited)).toMatchObject({ surface: 'x'.repeat(20_000), pos: 'XX' });
  });
});
