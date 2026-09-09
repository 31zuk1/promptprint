declare module 'kuromoji/src/dict/DynamicDictionaries.js' {
  export default class DynamicDictionaries {
    loadTrie(base: Int32Array, check: Int32Array): this;
    loadTokenInfoDictionaries(tokens: Uint8Array, positions: Uint8Array, mapping: Uint8Array): this;
    loadConnectionCosts(costs: Int16Array): this;
    loadUnknownDictionaries(tokens: Uint8Array, positions: Uint8Array, mapping: Uint8Array,
      characters: Uint8Array, compatible: Uint32Array, invoke: Uint8Array): this;
  }
}

declare module 'kuromoji/src/Tokenizer.js' {
  import DynamicDictionaries from 'kuromoji/src/dict/DynamicDictionaries.js';
  export interface IpadicToken {
    surface_form: string;
    word_type: string;
    word_position: number;
    pos: string;
    pos_detail_1: string;
    pos_detail_2: string;
    pos_detail_3: string;
    basic_form: string;
  }
  export default class Tokenizer {
    constructor(dictionary: DynamicDictionaries);
    tokenizeForSentence(text: string): IpadicToken[];
  }
}
