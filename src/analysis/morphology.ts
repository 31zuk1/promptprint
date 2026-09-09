import { gunzipSync } from 'fflate';
import DynamicDictionaries from 'kuromoji/src/dict/DynamicDictionaries.js';
import Tokenizer from 'kuromoji/src/Tokenizer.js';

/** Fixed package assets only. No user text is part of an asset request. */
const ASSET_SIZES = {
  'base.dat.gz': 8_388_608,
  'check.dat.gz': 8_388_608,
  'tid.dat.gz': 10_485_760,
  'tid_pos.dat.gz': 41_943_040,
  'tid_map.dat.gz': 4_194_304,
  'cc.dat.gz': 3_463_716,
  'unk.dat.gz': 10_485_760,
  'unk_pos.dat.gz': 10_485_760,
  'unk_map.dat.gz': 1_048_576,
  'unk_char.dat.gz': 65_536,
  'unk_compat.dat.gz': 262_144,
  'unk_invoke.dat.gz': 1_048_576,
} as const;

export type MorphologyAssetName = keyof typeof ASSET_SIZES;
export type MorphologyAssetLoader = (name: MorphologyAssetName) => Promise<Uint8Array>;
export interface MorphToken {
  surface: string;
  /** Exact, zero-based UTF-16 offsets into the supplied (already cleaned) string. */
  index: number;
  end: number;
  pos: string;
  detail1: string;
  detail2: string;
  detail3: string;
  basicForm: string;
  known: boolean;
  /** An indivisible pathological span is a boundary, never a fabricated lexical fragment. */
  limited?: true;
}

export const MORPHOLOGY_LIMITS = {
  messageCodeUnits: 100_000,
  chunkCodeUnits: 256,
  lookAheadCodeUnits: 64,
  compressedAssetBytes: 6_000_000,
} as const;

let tokenizer: Tokenizer | undefined;
let initialization: Promise<void> | undefined;

async function loadBundledAsset(name: MorphologyAssetName): Promise<Uint8Array> {
  // Dev modules live under /src; production worker modules live under /assets.
  // The latter relative URL also supports file-free chrome-extension:// origins
  // and static deployments under a subdirectory (no origin/path guessing).
  const base = import.meta.env.DEV
    ? new URL(`${import.meta.env.BASE_URL}morphology/ipadic-0.1.2/`, globalThis.location.href)
    : new URL(/* @vite-ignore */ '../morphology/ipadic-0.1.2/', import.meta.url);
  const response = await fetch(new URL(name, base), { credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error('辞書ファイルを読み込めませんでした。画面を再読み込みしてください。');
  const body = response.body;
  if (!body) throw new Error('辞書ファイルを読み込めませんでした。');
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MORPHOLOGY_LIMITS.compressedAssetBytes) throw new Error('辞書ファイルのサイズが不正です。');
      parts.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new Error('辞書ファイルを読み込めませんでした。');
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

/**
 * Call once in each analysis worker before synchronous analysis. Concurrent calls
 * share initialization. Failed loads reject explicitly and may be retried.
 * Node tests pass a local byte loader, e.g. async name =>
 * new Uint8Array(await readFile(resolve('node_modules/kuromoji/dict', name))).
 * Node filesystem APIs are deliberately absent from the browser module graph.
 */
export function initializeMorphology(loadAsset: MorphologyAssetLoader = loadBundledAsset): Promise<void> {
  if (tokenizer) return Promise.resolve();
  if (initialization) return initialization;
  initialization = buildTokenizer(loadAsset).then((value) => { tokenizer = value; }).catch(() => {
    initialization = undefined;
    throw new Error('形態素解析の日本語辞書を準備できませんでした。画面を再読み込みして再解析してください。');
  });
  return initialization;
}

async function buildTokenizer(loadAsset: MorphologyAssetLoader): Promise<Tokenizer> {
  // Load/decompress sequentially to avoid retaining all compressed bytes at once.
  // fflate receives an exact-size output; corrupt gzip size headers cannot request
  // an arbitrary allocation. The dictionary is static, pinned package data.
  const inflate = async (name: MorphologyAssetName): Promise<Uint8Array<ArrayBuffer>> => {
    const compressed = await loadAsset(name);
    if (compressed.length < 18 || compressed.length > MORPHOLOGY_LIMITS.compressedAssetBytes
      || compressed[0] !== 0x1f || compressed[1] !== 0x8b) throw new Error('Invalid dictionary');
    const expected = ASSET_SIZES[name];
    const trailer = new DataView(compressed.buffer, compressed.byteOffset, compressed.byteLength)
      .getUint32(compressed.length - 4, true);
    if (trailer !== expected) throw new Error('Invalid dictionary');
    const output = new Uint8Array(expected);
    if (gunzipSync(compressed, { out: output }).length !== expected) throw new Error('Invalid dictionary');
    return output;
  };
  const dictionary = new DynamicDictionaries();
  dictionary.loadTrie(new Int32Array((await inflate('base.dat.gz')).buffer),
    new Int32Array((await inflate('check.dat.gz')).buffer));
  dictionary.loadTokenInfoDictionaries(await inflate('tid.dat.gz'), await inflate('tid_pos.dat.gz'), await inflate('tid_map.dat.gz'));
  dictionary.loadConnectionCosts(new Int16Array((await inflate('cc.dat.gz')).buffer));
  dictionary.loadUnknownDictionaries(await inflate('unk.dat.gz'), await inflate('unk_pos.dat.gz'), await inflate('unk_map.dat.gz'),
    await inflate('unk_char.dat.gz'), new Uint32Array((await inflate('unk_compat.dat.gz')).buffer), await inflate('unk_invoke.dat.gz'));
  return new Tokenizer(dictionary);
}

function boundary(surface: string, index: number, limited = false): MorphToken {
  return { surface, index, end: index + surface.length, pos: '記号', detail1: limited ? '解析上限' : '一般',
    detail2: '*', detail3: '*', basicForm: surface, known: false, ...(limited ? { limited: true as const } : {}) };
}

/** All POS, including particles and punctuation. Selection belongs to lexical.ts. */
export function segmentMorphology(text: string): MorphToken[] {
  if (!tokenizer) throw new Error('形態素解析の日本語辞書の準備が完了していません。');
  if (text.length > MORPHOLOGY_LIMITS.messageCodeUnits) throw new Error('形態素解析テキストが1発言の上限を超えています。');
  const result: MorphToken[] = [];
  // IPADIC only covers BMP. Keep surrogate characters as explicit boundaries so
  // kuromoji's code-point/UTF-16 lattice mismatch cannot lose following words.
  // Sentence boundaries also bound its quadratic unknown-word lattice work.
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const surrogate = code >= 0xd800 && code <= 0xdfff;
    if (!surrogate && !/[。！？!?\n\r]/u.test(text[i]!)) continue;
    appendBounded(text.slice(start, i), start, result);
    const length = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length
      && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff ? 2 : 1;
    result.push(boundary(text.slice(i, i + length), i));
    i += length - 1;
    start = i + 1;
  }
  appendBounded(text.slice(start), start, result);
  return result;
}

function appendBounded(text: string, base: number, result: MorphToken[]): void {
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + MORPHOLOGY_LIMITS.chunkCodeUnits);
    const part = text.slice(start, end);
    const raw = tokenizer!.tokenizeForSentence(part);
    const tokens: MorphToken[] = [];
    let offset = 0;
    for (const token of raw) {
      // Never trust word_position: upstream measures code points, not UTF-16,
      // and its punctuation splitter has cumulative-position edge cases.
      const surface = token.surface_form;
      if (!surface || part.slice(offset, offset + surface.length) !== surface) {
        throw new Error('形態素解析で単語の出現位置を確認できませんでした。解析を停止しました。');
      }
      tokens.push({ surface, index: base + start + offset, end: base + start + offset + surface.length,
        pos: token.pos, detail1: token.pos_detail_1, detail2: token.pos_detail_2, detail3: token.pos_detail_3,
        basicForm: token.basic_form, known: token.word_type === 'KNOWN' });
      offset += surface.length;
    }
    if (offset !== part.length) throw new Error('形態素解析で単語の出現位置を確認できませんでした。解析を停止しました。');
    if (end === text.length) { result.push(...tokens); break; }
    const safeEnd = base + end - MORPHOLOGY_LIMITS.lookAheadCodeUnits;
    const committed = tokens.filter((token) => token.end <= safeEnd);
    if (committed.length) {
      result.push(...committed);
      start = committed[committed.length - 1]!.end - base;
    } else {
      // A single >192-unit unknown run has no trustworthy internal boundary.
      // Keep it as one reported non-lexical span through its script run, rather
      // than allowing the final chopped tail to become a false topic.
      let stop = end;
      const latin = /^[\p{Script=Latin}\p{N}_]+$/u.test(part);
      const kana = /^[\p{Script=Hiragana}ー]+$/u.test(part);
      while (stop < text.length && (latin ? /[\p{Script=Latin}\p{N}_]/u : kana ? /[\p{Script=Hiragana}ー]/u : /[^\s、,。.!?！？]/u).test(text[stop]!)) stop += 1;
      result.push(boundary(text.slice(start, stop), base + start, true));
      start = stop;
    }
  }
}
