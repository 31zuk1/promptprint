import createTagger from 'wink-pos-tagger';

export interface EnglishMorphToken {
  surface: string;
  index: number;
  end: number;
  /** Penn Treebank tag; NN/NNS/NNP/NNPS are nouns, JJ* are modifiers. */
  pos: string;
  limited?: true;
}

const tagger = createTagger();
const MAX_CONTEXT_TOKENS = 128;
const MAX_TOKEN_CODE_UNITS = 256;
const WORD_OR_PUNCTUATION = /[\p{Script=Latin}][\p{Script=Latin}\p{N}_]*(?:['’][\p{Script=Latin}]+)?|\p{N}+(?:[.,]\p{N}+)*|[.,!?;:()[\]{}"'’\-–—]/gu;

/**
 * Bundled English contextual POS model. Only English runs are tagged; Japanese,
 * emoji, newlines and other removed text delimit context. Source words are never
 * lemmatized or rewritten. Even contractions retain exact source substrings.
 * No filesystem, fetch, model download or durable text cache is used.
 */
export function tagEnglishSpans(text: string): EnglishMorphToken[] {
  if (text.length > 100_000) throw new Error('形態素解析テキストが1発言の上限を超えています。');
  const result: EnglishMorphToken[] = [];
  let context: Omit<EnglishMorphToken, 'pos'>[] = [];
  let previousEnd = 0;
  const flush = (): void => {
    if (!context.length) return;
    const tagged = tagger.tagRawTokens(context.map((token) => token.surface.replaceAll('’', "'")));
    if (tagged.length !== context.length) throw new Error('形態素解析で英語の出現位置を確認できませんでした。');
    for (let i = 0; i < context.length; i += 1) {
      const original = context[i]!;
      const observed = tagged[i]!;
      if (observed.value !== original.surface.replaceAll('’', "'")) {
        throw new Error('形態素解析で英語の出現位置を確認できませんでした。');
      }
      result.push({ ...original, pos: observed.pos });
    }
    context = [];
  };
  for (const match of text.matchAll(WORD_OR_PUNCTUATION)) {
    const index = match.index;
    const surface = match[0];
    if (!/^[ \t]*$/u.test(text.slice(previousEnd, index))) flush();
    previousEnd = index + surface.length;
    if (surface.length > MAX_TOKEN_CODE_UNITS) {
      flush();
      result.push({ surface, index, end: previousEnd, pos: 'XX', limited: true });
      continue;
    }
    // This is source splitting, not expansion: don't -> do + n't, never do not.
    const contraction = surface.replaceAll('’', "'").match(/^(.+)(n't|'(?:s|d|m|ll|re|ve))$/iu);
    if (contraction) {
      const split = contraction[1]!.length;
      context.push({ surface: surface.slice(0, split), index, end: index + split });
      context.push({ surface: surface.slice(split), index: index + split, end: previousEnd });
    } else context.push({ surface, index, end: previousEnd });
    if (/[.!?]/u.test(surface) || context.length >= MAX_CONTEXT_TOKENS) flush();
  }
  flush();
  return result;
}
