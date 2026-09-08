export interface SurfaceToken {
  /** Canonical, comparison-safe form. */
  term: string;
  /** Surface form retained for display selection. */
  surface: string;
  /** UTF-16 offset in the cleaned text. */
  index: number;
  end: number;
}

export interface Tokenizer {
  tokenize(text: string, localeHint?: string): SurfaceToken[];
}

const LATIN_SHORT_WHITELIST = new Set(['ai', 'vr', 'ar', 'oz', 'ui', 'ux', '3d']);

// Intentionally compact: these are grammatical/scaffolding words rather than topics.
export const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'may', 'might', 'more', 'most', 'not', 'of', 'on', 'or', 'our', 'please',
  'should', 'so', 'some', 'than', 'that', 'the', 'their', 'then', 'there', 'these', 'they',
  'this', 'those', 'to', 'use', 'using', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'who', 'why', 'will', 'with', 'would', 'you', 'your',
  'これ', 'それ', 'あれ', 'ここ', 'そこ', 'ため', 'よう', 'もの', 'こと', 'ところ', 'とき',
  'こちら', 'どの', 'この', 'その', 'です', 'ます', 'でした', 'ました', 'する', 'した',
  'して', 'します', 'しま', 'しょう', 'しましょう', 'しよう', 'でき', 'できる', 'できます',
  'たい', 'ほしい', 'ください', 'なる', 'なり', 'ない', 'なく', 'ある', 'いる', 'れる', 'られる', 'だけ',
  'すると', 'にし', '作り', '付け', '決め', 'すく', 'ごと',
  'また', 'さらに', 'まず', '次に', 'なお', 'ただし', '例えば', 'について', 'として',
  'という', 'より', 'から', 'まで', 'ので', 'のに', 'なら', 'では', 'には', 'へと',
  'の', 'に', 'は', 'を', 'が', 'と', 'で', 'も', 'へ', 'や', 'か', 'な', 'ね', 'よ',
  'はい', 'いいえ', 'もちろん', '以下', '上記', '回答', '質問', '提案', '説明', 'ユーザー',
  'assistant', 'user', 'chatgpt', 'claude',
]);

const WORD_PATTERN = /[\p{L}\p{M}\p{N}]/u;
const ONLY_NUMBER_OR_DATE_PATTERN = /^[\p{N}\s./:_-]+$/u;
const LATIN_PATTERN = /^[A-Za-z][A-Za-z\d]*(?:['’-][A-Za-z\d]+)*$/u;
const ONE_KANA_PATTERN = /^[\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const CJK_PATTERN = /\p{Script=Han}/u;
const ONLY_CJK_PATTERN = /^\p{Script=Han}+$/u;

export const canonicalizeTerm = (surface: string): string =>
  surface.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/gu, ' ');

export const isStopword = (term: string): boolean => STOPWORDS.has(canonicalizeTerm(term));

const isAcceptedToken = (surface: string): boolean => {
  const term = canonicalizeTerm(surface);
  if (!term || isStopword(term) || !WORD_PATTERN.test(term)) return false;
  if (ONLY_NUMBER_OR_DATE_PATTERN.test(term)) return false;
  if (ONE_KANA_PATTERN.test(term)) return false;
  if (ONLY_CJK_PATTERN.test(term) && [...term].length === 1) return false;
  if (LATIN_PATTERN.test(term) && term.length < 2 && !LATIN_SHORT_WHITELIST.has(term)) return false;

  const lettersAndNumbers = [...term].filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
  if (lettersAndNumbers / [...term].length < 0.7) return false;
  return true;
};

interface RawSegment {
  surface: string;
  index: number;
  end: number;
}

const mergeFragmentedCjk = (segments: RawSegment[]): RawSegment[] => {
  const merged: RawSegment[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index];
    if (!current) continue;

    if (!ONLY_CJK_PATTERN.test(current.surface)) {
      merged.push(current);
      continue;
    }

    const group = [current];
    let nextIndex = index + 1;
    while (nextIndex < segments.length) {
      const previous = group.at(-1);
      const next = segments[nextIndex];
      if (!previous || !next || previous.end !== next.index || !ONLY_CJK_PATTERN.test(next.surface)) break;
      const combinedLength = group.reduce((sum, item) => sum + item.surface.length, 0) + next.surface.length;
      if (combinedLength > 10) break;
      group.push(next);
      nextIndex += 1;
    }

    const hasSingleCharacterFragment = group.some((item) => [...item.surface].length === 1);
    if (group.length > 1 && hasSingleCharacterFragment) {
      merged.push({
        surface: group.map((item) => item.surface).join(''),
        index: current.index,
        end: group.at(-1)?.end ?? current.end,
      });
      index = nextIndex - 1;
    } else {
      merged.push(...group);
      index = nextIndex - 1;
    }
  }

  return merged;
};

const segmentWithIntl = (text: string, localeHint: string): RawSegment[] => {
  const segmenter = new Intl.Segmenter(localeHint, { granularity: 'word' });
  const segments: RawSegment[] = [];
  for (const part of segmenter.segment(text)) {
    if (!part.isWordLike) continue;
    segments.push({ surface: part.segment, index: part.index, end: part.index + part.segment.length });
  }
  return segments;
};

const segmentWithFallback = (text: string): RawSegment[] => {
  const segments: RawSegment[] = [];
  const matcher = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+|[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*/gu;
  for (const match of text.matchAll(matcher)) {
    if (match.index === undefined) continue;
    segments.push({ surface: match[0], index: match.index, end: match.index + match[0].length });
  }
  return segments;
};

export class LocalTokenizer implements Tokenizer {
  tokenize(text: string, localeHint = 'ja'): SurfaceToken[] {
    const normalized = text.normalize('NFKC');
    const hasSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
    const raw = hasSegmenter
      ? segmentWithIntl(normalized, localeHint)
      : segmentWithFallback(normalized);

    return mergeFragmentedCjk(raw)
      .filter((token) => isAcceptedToken(token.surface))
      .map((token) => ({
        term: canonicalizeTerm(token.surface),
        surface: token.surface,
        index: token.index,
        end: token.end,
      }));
  }
}

export const defaultTokenizer = new LocalTokenizer();

export const tokenize = (text: string, localeHint = 'ja'): SurfaceToken[] =>
  defaultTokenizer.tokenize(text, localeHint);

export const containsCjk = (value: string): boolean => CJK_PATTERN.test(value);
