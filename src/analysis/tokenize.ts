export interface SurfaceToken {
  displayEligible?: boolean;
  /** Canonical, comparison-safe form. */
  term: string;
  /** Surface form retained for display selection. */
  surface: string;
  /** UTF-16 offset in the cleaned text. */
  index: number;
  end: number;
  /** Occurrence-level linguistic evidence, separate from measurement. */
  topicEligible?: boolean;
  noun?: boolean;
  suffix?: boolean;
  prefix?: boolean;
  adjective?: boolean;
}

export interface Tokenizer {
  tokenize(text: string, localeHint?: string, hiddenTerms?: ReadonlySet<string>): SurfaceToken[];
}

const LATIN_SHORT_WHITELIST = new Set(['ai', 'vr', 'ar', 'oz', 'ui', 'ux', '3d']);

// Exact forms only: never exclude all kana, short words, or substring matches.
// Some multi-segment forms are recognized before filtering (e.g. くだ + さい).
export const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'may', 'might', 'more', 'most', 'not', 'of', 'on', 'or', 'our', 'please',
  'should', 'so', 'some', 'than', 'that', 'the', 'their', 'then', 'there', 'these', 'they',
  'this', 'those', 'to', 'use', 'using', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'who', 'why', 'will', 'with', 'would', 'you', 'your',
  'ok', 'okay', 'yes', 'no', 'yep', 'nope', 'yeah', 'thanks', 'thank',
  'これ', 'それ', 'あれ', 'ここ', 'そこ', 'ため', 'よう', 'もの', 'こと', 'ところ', 'とき',
  'こちら', 'どの', 'この', 'その', 'です', 'ます', 'でした', 'ました', 'する', 'した',
  'して', 'します', 'しま', 'しょう', 'しましょう', 'しよう', 'でき', 'できる', 'できます',
  'たい', 'ほしい', 'ください', 'なる', 'なり', 'ない', 'なく', 'ある', 'いる', 'れる', 'られる', 'だけ',
  'すると', 'にし', '作り', '付け', '決め', 'すく', 'ごと',
  'また', 'さらに', 'まず', '次に', 'なお', 'ただし', '例えば', 'について', 'として',
  'という', 'より', 'から', 'まで', 'ので', 'のに', 'なら', 'では', 'には', 'へと',
  'の', 'に', 'は', 'を', 'が', 'と', 'で', 'も', 'へ', 'や', 'か', 'な', 'ね', 'よ',
  'って', 'とか', 'など', 'しか', 'さえ', 'けど', 'けれど', 'けれども', 'でも', 'だけど',
  'じゃない', 'じゃなく', 'じゃありません',
  'ながら', 'よね', 'んじゃ', 'ちゃ', 'だって', 'だろう', 'でしょう', 'ません',
  'ている', 'ています', 'ていた', 'ていて', 'ていない', 'ていません',
  'あります', 'ありました', 'ありません', 'ありませんでした',
  'なんか', 'どんな', 'どういう', 'どれ', 'くらい', 'どれくらい', 'なんで', 'なぜ',
  'どうして', 'それとも', 'において', 'そのもの', 'そして', 'つまり', 'だから', 'なので',
  'そんな', 'こんな', 'あんな', 'そういう', 'そうだ', 'それで', 'ないし',
  'または', 'あるいは', 'および', '及び', 'そう', 'どう', 'あの', 'えっと', 'えーと',
  'うん', 'ううん', 'ええ', 'ああ', 'おお', 'えー', 'あー', 'あっ', 'おっ',
  'なるほど', 'オーケー', 'おっけー', 'オッケー', 'オッケイ',
  'ありがとう', 'ありがとうございます', 'どうも',
  '了解', '了解です', '了解しました', '承知', '承知しました', '承知いたしました',
  'いいです', 'いいですよ', 'いいよ', 'わかりました', '分かりました', 'わかった', '分かった',
  'はい', 'いいえ', 'もちろん', '以下', '上記', '回答', '質問', '提案', '説明', 'ユーザー',
  'assistant', 'user', 'chatgpt', 'claude',
]);

const WORD_PATTERN = /[\p{L}\p{M}\p{N}]/u;
const ONLY_NUMBER_OR_DATE_PATTERN = /^[\p{N}\s./:_-]+$/u;
const LATIN_PATTERN = /^[A-Za-z][A-Za-z\d]*(?:['’-][A-Za-z\d]+)*$/u;
const ONE_KANA_PATTERN = /^[\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const CJK_PATTERN = /\p{Script=Han}/u;
const ONLY_CJK_PATTERN = /^\p{Script=Han}+$/u;
const ONLY_KATAKANA_PATTERN = /^[\p{Script=Katakana}ー]+$/u;
// Prolongation/iteration signs can be Unicode letters and ICU word-like tokens.
// Reject them only when alone, preserving データ / コーヒー / 人々 unchanged.
const ONLY_ORTHOGRAPHIC_MARKS_PATTERN = /^[ーゝゞヽヾ々〻〆]+$/u;

export const canonicalizeTerm = (surface: string): string =>
  surface.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/gu, ' ');

export const isStopword = (term: string): boolean => STOPWORDS.has(canonicalizeTerm(term));

const isAcceptedToken = (surface: string): boolean => {
  const term = canonicalizeTerm(surface);
  if (!term || isStopword(term) || !WORD_PATTERN.test(term)) return false;
  if (ONLY_ORTHOGRAPHIC_MARKS_PATTERN.test(term)) return false;
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

const MAX_STOPWORD_LENGTH = Math.max(...[...STOPWORDS].map((word) => word.length));

// Small spelling-repair lexicon, not a morphological dictionary or a noun
// classifier. Keep the *observed inflected form*, never invent a lemma. ICU
// splits e.g. す + ごく and 面白 + そう; filtering first would leave a false
// standalone ごく / 面白. Only join complete adjacent segment boundaries.
const ADJECTIVE_STEMS = [
  'すご', 'おもしろ', '面白', '美し', '楽し', '難し', '新し', '嬉し', '悲し', '寂し',
  '厳し', '優し', '詳し', '正し', '忙し', 'おいし', '美味し', 'すばらし', '素晴らし',
  '大き', '小さ', '長', '短', '高', '低', '強', '弱', '早', '速', '遅', '広', '狭',
  '深', '浅', '軽', '重', '明る', '暗', '暑', '寒', '熱', '冷た', '赤', '青', '白', '黒',
];
const ADJECTIVE_ENDINGS = ['い', 'く', 'かった', 'くない', 'くなかった', 'そう', 'そうだ', 'そうです', 'そうだった', 'さ'];
const DESCRIPTIVE_FORMS = new Set(ADJECTIVE_STEMS.flatMap((stem) => ADJECTIVE_ENDINGS.map((ending) => stem + ending)));
/** Exact observed spelling policy hook; does not change tokenization or counts. */
export const isDescriptiveForm = (value: string): boolean => DESCRIPTIVE_FORMS.has(canonicalizeTerm(value));
const RESTORED_FORMS = new Set([
  ...DESCRIPTIVE_FORMS,
  'こころ', 'こころざし', 'さいころ', 'すごろく', 'じゃばら', 'せんい', 'こうじ', 'たんぱく質',
  'ひまわり', 'ものづくり', 'まちづくり', 'あじさい', 'にわとり', 'きゅうり', 'かたつむり', 'たまねぎ',
]);
const MAX_RESTORED_LENGTH = Math.max(...[...RESTORED_FORMS].map((word) => word.length));
const MAX_KATAKANA_LENGTH = 32;

const stopwordEndAt = (segments: RawSegment[], start: number): number => {
  let surface = '';
  let matchEnd = start - 1;
  for (let end = start; end < segments.length; end += 1) {
    const part = segments[end]!;
    if (end > start && segments[end - 1]!.end !== part.index) break;
    surface += part.surface;
    if (surface.length > MAX_STOPWORD_LENGTH) break;
    if (isStopword(surface)) matchEnd = end;
  }
  return matchEnd;
};

/** Apply canonical hidden keys before creating new compounds. Only complete
 * raw-segment spans can match (NoSQL never matches hidden "no"). Multi-segment
 * search shares the longest generated-compound bound; a longer single original
 * segment is still checked exactly. Original offsets preserve every removed gap.
 */
const removeHiddenSegments = (segments: RawSegment[], hiddenTerms?: ReadonlySet<string>): RawSegment[] => {
  if (!hiddenTerms?.size) return segments;
  const omitted = new Set<number>();
  for (let start = 0; start < segments.length; start += 1) {
    let surface = '';
    for (let end = start; end < segments.length; end += 1) {
      const part = segments[end]!;
      if (end > start && (segments[end - 1]!.end !== part.index || surface.length + part.surface.length > MAX_KATAKANA_LENGTH)) break;
      surface += part.surface;
      if (hiddenTerms.has(canonicalizeTerm(surface))) {
        for (let index = start; index <= end; index += 1) omitted.add(index);
      }
    }
  }
  // Hiding さい inside くだ + さい must not expose the previously removed くだ.
  // Apply the original complete response boundary before discarding segments.
  for (let start = 0; start < segments.length; start += 1) {
    const end = stopwordEndAt(segments, start);
    let intersects = false;
    for (let index = start; index <= end; index += 1) {
      if (omitted.has(index)) intersects = true;
    }
    if (intersects) for (let index = start; index <= end; index += 1) omitted.add(index);
  }
  return segments.filter((_segment, index) => !omitted.has(index));
};

const restoreLexicalBoundaries = (segments: RawSegment[]): RawSegment[] => {
  const protectedStarts = new Set<number>();
  for (let start = 0; start < segments.length; start += 1) {
    const end = stopwordEndAt(segments, start);
    // Do not steal the tail of くだ + さい to create さい + ころ. A form
    // may still end in そう / ない: preserving 面白そう must precede removal.
    for (let index = start + 1; index <= end; index += 1) protectedStarts.add(index);
  }
  const restored: RawSegment[] = [];
  for (let start = 0; start < segments.length; start += 1) {
    const first = segments[start]!;
    if (protectedStarts.has(start)) {
      restored.push(first);
      continue;
    }
    let surface = '';
    let matchEnd = start;
    let matchedSurface = first.surface;
    for (let end = start; end < segments.length; end += 1) {
      const part = segments[end]!;
      if (end > start && segments[end - 1]!.end !== part.index) break;
      surface += part.surface;
      if (surface.length > MAX_RESTORED_LENGTH) break;
      if (RESTORED_FORMS.has(surface)) {
        matchEnd = end;
        matchedSurface = surface;
      }
    }
    restored.push({ surface: matchedSurface, index: first.index, end: segments[matchEnd]!.end });
    start = matchEnd;
  }
  return restored;
};

/** Reconstitute one adjacent katakana run, not an inferred multiword phrase.
 * Run discovery is linear; oversized runs retain their original segments
 * instead of manufacturing arbitrary 32-character chunk boundaries. Removed
 * responses still leave an offset gap, and therefore cannot become a bridge.
 */
const mergeKatakanaRuns = (segments: RawSegment[]): RawSegment[] => {
  const merged: RawSegment[] = [];
  for (let start = 0; start < segments.length; start += 1) {
    const first = segments[start]!;
    if (!ONLY_KATAKANA_PATTERN.test(first.surface)) {
      merged.push(first);
      continue;
    }
    let end = start;
    while (end + 1 < segments.length) {
      const current = segments[end]!;
      const next = segments[end + 1]!;
      if (current.end !== next.index || !ONLY_KATAKANA_PATTERN.test(next.surface)) break;
      end += 1;
    }
    // A script boundary alone is not a lexical boundary in バスク語 etc.
    // Keep only this explicit language suffix; do not join arbitrary Han text.
    const suffix = segments[end + 1];
    if (suffix?.surface === '語' && segments[end]!.end === suffix.index &&
      suffix.end - first.index <= MAX_KATAKANA_LENGTH) end += 1;
    const last = segments[end]!;
    if (end > start && last.end - first.index <= MAX_KATAKANA_LENGTH) {
      merged.push({
        surface: segments.slice(start, end + 1).map((part) => part.surface).join(''),
        index: first.index,
        end: last.end,
      });
    } else {
      for (let index = start; index <= end; index += 1) merged.push(segments[index]!);
    }
    start = end;
  }
  return merged;
};

/** ICU may split a known function/response word differently by context/version.
 * Match only complete, contiguous raw segments, never through whitespace or
 * punctuation or inside a content token. Keep offsets in the unchanged text so
 * phrases cannot bridge the removed words. The look-ahead is lexicon-bounded.
 */
const removeStopwordSegments = (segments: RawSegment[]): RawSegment[] => {
  const retained: RawSegment[] = [];
  for (let start = 0; start < segments.length; start += 1) {
    const matchEnd = stopwordEndAt(segments, start);
    if (matchEnd >= start) start = matchEnd;
    else retained.push(segments[start]!);
  }
  return retained;
};

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
  tokenize(text: string, localeHint = 'ja', hiddenTerms?: ReadonlySet<string>): SurfaceToken[] {
    const normalized = text.normalize('NFKC');
    const hasSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
    const raw = hasSegmenter
      ? segmentWithIntl(normalized, localeHint)
      : segmentWithFallback(normalized);

    const restored = restoreLexicalBoundaries(removeHiddenSegments(raw, hiddenTerms));
    return mergeFragmentedCjk(mergeKatakanaRuns(removeStopwordSegments(restored)))
      .filter((token) => isAcceptedToken(token.surface) && !hiddenTerms?.has(canonicalizeTerm(token.surface)))
      .map((token) => ({
        term: canonicalizeTerm(token.surface),
        surface: token.surface,
        index: token.index,
        end: token.end,
      }));
  }
}

export const defaultTokenizer = new LocalTokenizer();

export const tokenize = (text: string, localeHint = 'ja', hiddenTerms?: ReadonlySet<string>): SurfaceToken[] =>
  defaultTokenizer.tokenize(text, localeHint, hiddenTerms);

export const containsCjk = (value: string): boolean => CJK_PATTERN.test(value);
