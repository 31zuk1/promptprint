import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initializeMorphology, MORPHOLOGY_LIMITS, segmentMorphology, type MorphologyAssetLoader } from './morphology';

const localAssets: MorphologyAssetLoader = async (name) => new Uint8Array(await readFile(resolve('node_modules/kuromoji/dict', name)));
beforeAll(() => initializeMorphology(localAssets), 20_000);

describe('bundled IPADIC morphology', () => {
  it('provides actual POS, not wordlike guesses, for particles, inflections and acknowledgments', () => {
    const tokens = segmentMorphology('量子場理論について考えている。はい、よいですね。');
    expect(tokens.find((token) => token.surface === '量子')).toMatchObject({ pos: '名詞', known: true });
    expect(tokens.find((token) => token.surface === 'について')).toMatchObject({ pos: '助詞' });
    expect(tokens.find((token) => token.surface === '考え')).toMatchObject({ pos: '動詞' });
    expect(tokens.find((token) => token.surface === 'はい')).toMatchObject({ pos: '感動詞' });
    expect(tokens.find((token) => token.surface === '。')).toMatchObject({ pos: '記号' });
  });

  it('retains surface forms and real constituent/suffix spans instead of inventing lemmas or compounds', () => {
    const text = '重力波干渉計と基本的人権を調べた。';
    const tokens = segmentMorphology(text);
    expect(tokens.map((token) => token.surface)).toContain('波');
    expect(tokens.find((token) => token.surface === '計')).toMatchObject({ detail1: '接尾' });
    expect(tokens.find((token) => token.surface === '調べ')).toMatchObject({ basicForm: '調べる' });
    expect(tokens.map((token) => token.surface).join('')).toBe(text);
    expect(tokens.some((token) => token.surface === '調べる')).toBe(false);
  });

  it('keeps exact UTF-16 offsets through repeated words, punctuation, emoji, surrogate pairs and newlines', () => {
    const text = '😀量子場理論、量子場理論！👨‍👩‍👧‍👦研究\n𠮷野家と研究。\ud800設計';
    const tokens = segmentMorphology(text);
    expect(tokens.map((token) => token.surface).join('')).toBe(text);
    expect(tokens.filter((token) => token.surface === '研究').map((token) => token.index))
      .toEqual([text.indexOf('研究'), text.lastIndexOf('研究')]);
    let previous = 0;
    for (const token of tokens) {
      expect(token.index).toBe(previous);
      expect(text.slice(token.index, token.end)).toBe(token.surface);
      previous = token.end;
    }
    expect(previous).toBe(text.length);
  });

  it('marks unknown vocabulary and retains legitimate hiragana nouns for downstream policy', () => {
    const tokens = segmentMorphology('こころ。きゅうり。まちづくり。Promptprint。');
    expect(tokens.find((token) => token.surface === 'こころ')).toMatchObject({ pos: '名詞', known: true });
    expect(tokens.find((token) => token.surface === 'きゅうり')).toMatchObject({ pos: '名詞', known: true });
    expect(tokens.find((token) => token.surface === 'Promptprint')).toMatchObject({ known: false });
  });

  it('processes long unpunctuated Japanese in bounded, overlapping chunks without losing or fabricating spans', () => {
    const text = '量子場理論の研究を続けるために重力波干渉計の設計を考えている'.repeat(100);
    const tokens = segmentMorphology(text);
    expect(tokens.map((token) => token.surface).join('')).toBe(text);
    expect(tokens.filter((token) => token.surface === '量子')).toHaveLength(100);
    expect(tokens.some((token) => token.limited)).toBe(false);
    expect(segmentMorphology(text)).toEqual(tokens);
  });

  it('makes pathological indivisible runs an explicit boundary rather than fake chopped nouns', () => {
    const text = `${'q'.repeat(20_000)} 研究。`;
    const tokens = segmentMorphology(text);
    expect(tokens.map((token) => token.surface).join('')).toBe(text);
    expect(tokens[0]).toMatchObject({ limited: true, pos: '記号', index: 0, end: 20_000 });
    expect(tokens.find((token) => token.surface === '研究')).toMatchObject({ pos: '名詞' });
    expect(tokens.filter((token) => token.surface.startsWith('q'))).toHaveLength(1);
  });

  it('rejects oversized messages explicitly without including source values', () => {
    expect(() => segmentMorphology('PRIVATE_SENTINEL'.repeat(MORPHOLOGY_LIMITS.messageCodeUnits)))
      .toThrow('解析テキストが1発言の上限を超えています。');
  });

  it('deduplicates concurrent initialization and never silently falls back after missing/corrupt dictionaries', async () => {
    vi.resetModules();
    const isolated = await import('./morphology');
    expect(() => isolated.segmentMorphology('研究')).toThrow('日本語辞書の準備が完了していません。');
    const broken = vi.fn(async () => { throw new Error('PRIVATE_PATH_SHOULD_NOT_LEAK'); });
    const first = isolated.initializeMorphology(broken);
    const second = isolated.initializeMorphology(broken);
    expect(first).toBe(second);
    await expect(first).rejects.toThrow('日本語辞書を準備できませんでした。');
    expect(broken).toHaveBeenCalledTimes(1);
    await expect(isolated.initializeMorphology(async () => new Uint8Array(30))).rejects.toThrow('日本語辞書を準備できませんでした。');
    await isolated.initializeMorphology(localAssets);
    expect(isolated.segmentMorphology('研究')[0]).toMatchObject({ surface: '研究', pos: '名詞' });
  }, 20_000);
});
