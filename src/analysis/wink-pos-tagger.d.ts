declare module 'wink-pos-tagger' {
  interface TaggedToken { value: string; pos: string; tag: string; normal: string; lemma?: string }
  interface Tagger { tagRawTokens(tokens: string[]): TaggedToken[] }
  export default function createTagger(): Tagger;
}
