import { segmentMorphology, type MorphToken } from './morphology';
import { tagEnglishSpans } from './englishMorphology';
import { canonicalizeTerm, isStopword, type SurfaceToken } from './tokenize';
import { isProceduralTerm } from './vocabulary';
import type { CleanTextResult } from './cleanText';

// English is not covered by IPADIC: its UNKNOWN noun tag is not POS evidence.
// These grammatical boundaries prevent complete clauses becoming noun phrases.
const ENGLISH_FUNCTIONS = new Set(`am been being become becomes became becomes
  does doing done get gets getting got give gives given take takes taken taking
  make makes made making see sees seen think thinks know knows known say says said
  tell tells told ask asks asked asking want wants wanted help helps helped
  show shows shown showing explain explains explained explain compare compares compared
  discuss discusses discussed describe describes described describe suggest suggests suggested
  consider considers considered considering provide provides provided include includes included
  contain contains contained support supports supported use uses used using
  need needs needed require requires required return returns returned work works worked
  please thanks thank yes no okay ok hello hi well just also really very much
  still already instead however therefore otherwise although because unless whether
  each every any another other others both either neither such own same different
  here there now today tomorrow yesterday next first second last finally
  could would should must can cannot will shall may might not never always
  let's lets don't doesn't didn't isn't aren't wasn't weren't won't can't`.split(/\s+/u));
const LETTER = /[\p{L}\p{N}]/u;
const LATIN = /^[A-Za-z][A-Za-z\d'’-]*$/u;
const UNKNOWN_KANA = /^[\p{Script=Hiragana}ー]+$/u;
const NOUN_DETAIL = new Set(['非自立', '代名詞', '副詞可能', '数', '特殊']);

const isEnglishFunction = (surface: string) => ENGLISH_FUNCTIONS.has(canonicalizeTerm(surface));
const isNoun = (part: MorphToken): boolean => part.pos === '名詞' && !NOUN_DETAIL.has(part.detail1) &&
  !(part.detail1 === '接尾' && ['助数詞', '副詞可能'].includes(part.detail2));

type LinguisticPart = MorphToken & { englishPos?: string; identifier?: boolean };
const adjectivalPredicate = (parts: LinguisticPart[], index: number): boolean => {
  if (parts[index]?.detail1 !== '形容動詞語幹') return false;
  const following = parts.slice(index + 1, index + 4).filter((part) => !/^\s+$/u.test(part.surface));
  const next = following[0];
  if (!next) return false;
  return (next.pos === '助動詞' && ['だ', 'です'].includes(next.basicForm)) ||
    (next.pos === '助詞' && ['に', 'な', 'という'].includes(next.surface)) ||
    (next.surface === 'と' && ['いう', '言う'].includes(following[1]?.basicForm ?? ''));
};
const linguisticParts = (text: string, identifierSpans: CleanTextResult['identifierSpans'] = []): LinguisticPart[] => {
  const japanese = segmentMorphology(text);
  const english = tagEnglishSpans(text);
  // Each English run is tagged in sentence context, not as Japanese UNKNOWN
  // proper nouns. Preserve contraction and punctuation offsets from the tagger.
  let cursor = 0;
  const combined: LinguisticPart[] = japanese.filter((part) => {
    while (cursor < english.length && english[cursor]!.end <= part.index) cursor += 1;
    return !english[cursor] || english[cursor]!.index >= part.end;
  });
  for (const part of english) {
    const nominal = /^NN/u.test(part.pos);
    const adjective = /^JJ/u.test(part.pos);
    combined.push({ ...part, pos: nominal ? '名詞' : adjective ? '形容詞' : /^VB/u.test(part.pos) ? '動詞' : '記号',
      detail1: '一般', detail2: '*', detail3: '*', basicForm: part.surface, known: false,
      englishPos: part.pos });
  }
  combined.sort((a, b) => a.index - b.index);
  // Programming identifiers are lexical units even when a general dictionary
  // splits punctuation/digits. Only these bounded orthographic forms are joined.
  const identifiers = [
    ...[...text.matchAll(/\b(?:[A-Za-z][A-Za-z\d]*(?:\+\+|#|\.[A-Za-z][A-Za-z\d]*)|[23][dD])(?=$|[^\w])/gu)]
      .map((match) => ({ index: match.index, end: match.index + match[0].length })),
    // The same spelling elsewhere is NOT promoted. Only these exact spans have
    // source-format evidence, e.g. inline `React` rather than the verb react.
    ...identifierSpans,
  ].sort((left, right) => left.index - right.index || right.end - left.end);
  const repaired: LinguisticPart[] = [];
  let at = 0;
  for (let i = 0; i < combined.length; i += 1) {
    const part = combined[i]!;
    while (identifiers[at] && identifiers[at]!.index < part.index) at += 1;
    const match = identifiers[at];
    if (match && match.index === part.index) {
      const end = match.end;
      let last = i;
      while (combined[last] && combined[last]!.end < end) last += 1;
      if (combined[last]?.end === end) {
        repaired.push({ ...part, surface: text.slice(part.index, end), end, pos: '名詞', detail1: '固有名詞', englishPos: 'NNP', identifier: true });
        i = last;
        at += 1;
        continue;
      }
    }
    repaired.push(part);
  }
  return repaired;
};

const hiddenPositions = (parts: MorphToken[], text: string, hidden: ReadonlySet<string>): Set<number> => {
  const removed = new Set<number>();
  if (!hidden.size) return removed;
  for (let start = 0; start < parts.length; start += 1) {
    const first = parts[start]!;
    for (let end = start; end < parts.length; end += 1) {
      const last = parts[end]!;
      if (end > start && last.end - first.index > 64) break;
      if (hidden.has(canonicalizeTerm(text.slice(first.index, last.end)))) {
        for (let index = start; index <= end; index += 1) removed.add(index);
      }
    }
  }
  return removed;
};

/** One source-grounded lexical ledger for BOTH display modes. We keep observed
 * forms, never generate lemmas. All parts retain offsets; rejected morphology
 * leaves a gap and can never be bridged by a phrase. */
export const extractLexicalTokensDetailed = (text: string, hidden: ReadonlySet<string> = new Set(), identifierSpans: CleanTextResult['identifierSpans'] = []): { words: SurfaceToken[]; limitedSpanCount: number } => {
  const parts = linguisticParts(text, identifierSpans);
  const removed = hiddenPositions(parts, text, hidden);
  const words: SurfaceToken[] = [];
  for (const [index, part] of parts.entries()) {
    if (removed.has(index)) continue;
    const term = canonicalizeTerm(part.surface);
    if (!LETTER.test(term) || /^[\p{N}\s./:_-]+$/u.test(term) || /^[ーゝゞヽヾ々〻〆]+$/u.test(term)) continue;
    // Procedural nouns are measurement atoms and can carry real compounds
    // (説明変数 / 質問応答). Only their standalone presentation is excluded.
    if ((isStopword(term) && (part.pos !== '名詞' || LATIN.test(term))) || isEnglishFunction(term) || hidden.has(term)) continue;
    const acronym = /^[A-Z][A-Z\d]{1,7}$/u.test(part.surface) && !isStopword(term);
    if (!acronym && !['名詞', '動詞', '形容詞', '接頭詞'].includes(part.pos)) continue;
    if (['非自立', '代名詞', '数', '特殊'].includes(part.detail1)) continue;
    // IPADIC labels arbitrary unseen kana strings as nouns. Do not promote
    // unknown kana blobs, inflection fragments or single-letter Latin noise.
    if ((!part.known && UNKNOWN_KANA.test(term)) || (LATIN.test(term) && term.length < 2)) continue;
    const prefix = part.pos === '接頭詞' && part.detail1 === '名詞接続';
    if (part.pos !== '名詞' && !prefix && part.surface.length === 1 && UNKNOWN_KANA.test(part.surface)) continue;
    const adjective = (part.englishPos?.startsWith('JJ') ?? false) || adjectivalPredicate(parts, index);
    const noun = isNoun(part) || prefix || adjective || acronym || part.identifier === true;
    const suffix = part.detail1 === '接尾';
    words.push({ term, surface: part.surface, index: part.index, end: part.end,
      noun, suffix, prefix, adjective,
      displayEligible: !suffix && !prefix && !isStopword(term),
      topicEligible: noun && !adjective && !suffix && !prefix && !isProceduralTerm(term) && !isStopword(term) &&
        !(part.surface.length === 1 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(part.surface)),
    });
  }
  return { words, limitedSpanCount: parts.filter((part) => part.limited).length };
};

export const extractLexicalTokens = (text: string, hidden?: ReadonlySet<string>): SurfaceToken[] =>
  extractLexicalTokensDetailed(text, hidden).words;
