import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ANALYSIS_SETTINGS, type NormalizedConversation } from '../domain/models';
import { extractPhrases } from './phrases';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';
import { isDescriptiveForm, tokenize, type SurfaceToken } from './tokenize';

const terms = (text: string): string[] => tokenize(text).map((token) => token.term);
const noise = 'はい！いいえ。OK!? ＯＫ yes no okay うん、ううん、ええ。なるほど。ありがとうございます。研究してください。';
const settings = { ...DEFAULT_ANALYSIS_SETTINGS, minDocumentFrequency: 1 };
const corpusOf = (texts: string[]): NormalizedConversation[] => [{
  id: 'noise-fixture', provider: 'demo', title: '合成ノイズ回帰', createdAt: null, updatedAt: null,
  messages: texts.map((text, index) => ({
    id: `m${index}`, conversationId: 'noise-fixture', provider: 'demo',
    role: index % 2 === 0 ? 'user' : 'assistant', createdAt: null, order: index,
    originalText: text, analysisText: text,
  })),
}];

describe('bounded lexical boundary restoration', () => {
  it.each([
    ['すごく面白そう。サブエージェントを動かしたい。', ['すごく', '面白そう', 'サブエージェント']],
    ['美しく静かな展示で、面白そうな仕掛けを見た。', ['美しく', '静か', '展示', '面白そう', '仕掛け']],
    ['新しくて使いやすいキーボード、強い照明と短かったケーブル。', ['新しく', '使い', 'やすい', 'キーボード', '強い', '照明', '短かった', 'ケーブル']],
    ['優しい照明で、冷たくないスープを味わう。', ['優しい', '照明', '冷たくない', 'スープ', '味わう']],
    ['すごかった、すごさ、面白くなかった、明るそう。', ['すごかった', 'すごさ', '面白くなかった', '明るそう']],
  ])('retains complete observed spellings in natural sentences: %s', (source, expected) => {
    expect(terms(source)).toEqual(expected);
    expect(terms(source)).not.toContain('ごく');
    expect(terms(source)).not.toContain('面白');
    for (const token of tokenize(source)) expect(source.slice(token.index, token.end)).toBe(token.surface);
  });

  it('joins contiguous katakana compounds without guessing spaced or interrupted compounds', () => {
    expect(terms('サブエージェントとマイクロサービス、クラウドネイティブを比較する。'))
      .toEqual(['サブエージェント', 'マイクロサービス', 'クラウドネイティブ', '比較']);
    for (const separator of [' ', '\n', '・', '。', '!', 'と', 'ください', 'ユーザー', 'OK']) {
      const source = `サブ${separator}エージェント`;
      const tokens = tokenize(source);
      expect(tokens.map((token) => token.term)).toEqual(['サブ', 'エージェント']);
      expect(tokens[0]?.end).toBe(2);
      expect(tokens[1]?.index).toBe(2 + separator.length);
      if (!/^\s+$/u.test(separator)) {
        expect(extractPhrases(['a', 'b', 'c'].map((id) => ({
          messageId: id, conversationId: id, text: source, tokens,
        }))).documentFrequency.size).toBe(0);
      }
    }
    expect(terms('オッケーサブエージェント。サブ AI エージェント。'))
      .toEqual(['サブエージェント', 'サブ', 'ai', 'エージェント']);
  });

  it('retains kana nouns and does not globally suppress their ambiguous fragments', () => {
    expect(terms('こころを読む。さいころを振る。じゃばらを折る。'))
      .toEqual(['こころ', '読む', 'さいころ', '振る', 'じゃばら', '折る']);
    expect(terms('すごろく こころざし せんい こうじ たんぱく質 あじさい ひまわり かたつむり'))
      .toEqual(['すごろく', 'こころざし', 'せんい', 'こうじ', 'たんぱく質', 'あじさい', 'ひまわり', 'かたつむり']);
    expect(terms('ごく ころ 面白 さい じゃ かな せん こう'))
      .toEqual(['ごく', 'ころ', '面白', 'さい', 'じゃ', 'かな', 'せん', 'こう']);
    expect(terms('研究してください')).toEqual(['研究']);
  });

  it('retains only the explicitly supported adjacent language suffix, not arbitrary Han suffixes', () => {
    expect(terms('バスク語とアイスランド語の翻訳。'))
      .toEqual(['バスク語', 'アイスランド語', '翻訳']);
    expect(terms('バスク語翻訳 サブ語彙 サブ研究')).toEqual(['バスク語', '翻訳', 'サブ', '語彙', 'サブ', '研究']);
    expect(terms('バスク 語 バスク!語 バスクの語')).toEqual(['バスク', 'バスク', 'バスク']);
  });

  it('preserves exact NFKC UTF-16 offsets after astral symbols and half-width katakana', () => {
    const source = '😀 ＡＩとｻﾌﾞｴｰｼﾞｪﾝﾄ。面白そう！すごく良い。';
    const normalized = source.normalize('NFKC');
    expect(tokenize(source)).toEqual([
      { term: 'ai', surface: 'AI', index: 3, end: 5 },
      { term: 'サブエージェント', surface: 'サブエージェント', index: 6, end: 14 },
      { term: '面白そう', surface: '面白そう', index: 15, end: 19 },
      { term: 'すごく', surface: 'すごく', index: 20, end: 23 },
      { term: '良い', surface: '良い', index: 23, end: 25 },
    ]);
    for (const token of tokenize(source)) expect(normalized.slice(token.index, token.end)).toBe(token.surface);
    expect(terms('Node.js TypeScript WebGPU foo_bar O’Reilly NoSQL OKR'))
      .toEqual(['node.js', 'typescript', 'webgpu', 'foo_bar', 'o’reilly', 'nosql', 'okr']);
  });

  it('never restores spelling across removed words, punctuation or whitespace', () => {
    for (const separator of [' ', '\n', '。', '!', 'と', 'ください', 'ＯＫ']) {
      expect(terms(`す${separator}ごく`)).not.toContain('すごく');
      expect(terms(`面白${separator}そう`)).not.toContain('面白そう');
      expect(terms(`さい${separator}ころ`)).not.toContain('さいころ');
    }
    expect(terms('さいくださいころ')).toEqual(['さい', 'ころ']);
    expect(terms('面白そうだ')).toEqual(['面白そうだ']);
  });

  it('exposes exact descriptive forms for display selection without banning kana or substrings', () => {
    for (const word of ['すごく', '面白そう', '素晴らしい', '難しさ', '高かった', '冷たくない']) {
      expect(isDescriptiveForm(word)).toBe(true);
      expect(terms(word)).toContain(word);
    }
    for (const word of ['こころ', 'さいころ', 'じゃばら', 'AI', 'すごろく', '面白', 'ごく', '高さ制限', '面白そうめん']) {
      expect(isDescriptiveForm(word)).toBe(false);
    }
  });

  it('caps a merged katakana run at 32 UTF-16 units and leaves longer runs unchunked', () => {
    const small = 'サブエージェント'.repeat(4);
    expect(small.length).toBe(32);
    expect(terms(small)).toEqual([small]);
    const large = 'サブエージェント'.repeat(2_000);
    const tokens = tokenize(large);
    // Each ICU segment remains; no invented prefix/chunk at the 32-unit limit.
    expect(tokens).toHaveLength(4_000);
    expect(tokens.every((token) => ['サブ', 'エージェント'].includes(token.surface))).toBe(true);
    expect(tokens[0]?.index).toBe(0);
    expect(tokens.at(-1)?.end).toBe(large.length);
    expect(tokenize(large)).toEqual(tokens);
    const fragmented = 'すごかった。'.repeat(2_000);
    expect(terms(fragmented)).toEqual(Array<string>(2_000).fill('すごかった'));
  });

  it('applies hidden original components before merging and keeps the unhidden counterpart with its gap', () => {
    const source = 'ロボットデザイン。サブエージェント。サブエージェント語。NoSQL。';
    const hidden = new Set(['ロボット', 'サブエージェント', 'no']);
    const before = [...hidden];
    const tokens = tokenize(source, 'ja', hidden);
    expect(tokens.map((token) => token.term)).toEqual(['デザイン', 'nosql']);
    expect(tokens[0]).toEqual({ term: 'デザイン', surface: 'デザイン', index: 4, end: 8 });
    for (const token of tokens) expect(source.slice(token.index, token.end)).toBe(token.surface);
    expect([...hidden]).toEqual(before);
    expect(tokenize(source, 'ja', hidden)).toEqual(tokens);
    expect(tokenize('サブエージェント', 'ja', new Set(['サブ'])).map((token) => token.term))
      .toEqual(['エージェント']);
    expect(tokenize('サブエージェント', 'ja', new Set(['エージェント'])).map((token) => token.term))
      .toEqual(['サブ']);
    expect(tokenize('面白そう', 'ja', new Set(['面白そう']))).toEqual([]);
    expect(tokenize('研究してください。さいころ。', 'ja', new Set(['さい'])).map((token) => token.term))
      .toEqual(['研究', 'ころ']);
  });

  it('keeps hidden boundaries intact during subsequent phrase extraction', () => {
    const text = '研究ロボットデザイン';
    const hidden = new Set(['ロボット']);
    const tokens = tokenize(text, 'ja', hidden);
    expect(tokens.map((token) => token.term)).toEqual(['研究', 'デザイン']);
    expect(extractPhrases(['a', 'b', 'c'].map((id) => ({
      messageId: id, conversationId: id, text, tokens,
    }))).documentFrequency.size).toBe(0);
    const longTerm = 'technical'.repeat(20);
    expect(tokenize(longTerm, 'ja', new Set([longTerm]))).toEqual([]);
  });

  it.each([false, true])('uses the same morphological atoms for occurrence numerator and token denominator (phrases=%s)', (includePhrases) => {
    const corpus = corpusOf(['サブエージェント。サブエージェント。面白そう。', 'サブエージェント！', 'はい。', 'ＯＫ']);
    const before = structuredClone(corpus);
    const configured = { ...settings, includePhrases };
    // IPADIC atomizes サブ + エージェント and 面白 + そう; source-grounded
    // noun phrases are an additional occurrence type, not denominator tokens.
    const documents = prepareAnalysisDocuments(corpus, configured).documents;
    expect(documents.map((doc) => doc.words.map((token) => token.term))).toEqual([
      ['サブ', 'エージェント', 'サブ', 'エージェント', '面白', 'そう'],
      ['サブ', 'エージェント'], [], [],
    ]);
    const result = analyzeConversations(corpus, configured);
    expect(result.summary).toMatchObject({ conversationCount: 1, userMessageCount: 2,
      assistantMessageCount: 2, analyzedTermCount: includePhrases ? 5 : 4 });
    const displayed = includePhrases ? ['サブエージェント'] : ['エージェント', 'サブ'];
    expect(result.terms.map((term) => term.term).sort()).toEqual([...displayed].sort());
    for (const label of displayed) {
      expect(result.terms.find((term) => term.term === label)).toMatchObject({
        kind: includePhrases ? 'phrase' : 'word',
        dfUser: 1, dfAssistant: 1, rateUser: 0.5, rateAssistant: 0.5, biasLabel: 'shared',
        tokenFrequencyUser: 2, tokenFrequencyAssistant: 1, tokenTotalUser: 6, tokenTotalAssistant: 2,
        per1000TokensAssistant: 500,
      });
      expect(result.terms.find((term) => term.term === label)?.per1000TokensUser).toBeCloseTo(2_000 / 6);
    }
    const broad = analyzeConversations(corpus, { ...configured, vocabularyFocus: 'all' });
    expect(broad.terms.filter((term) => ['そう', 'はい', 'ok'].includes(term.term))).toEqual([]);
    expect(broad.summary).toEqual(result.summary);
    for (const label of displayed) {
      expect(broad.terms.find((term) => term.term === label)).toEqual(result.terms.find((term) => term.term === label));
    }
    expect(corpus).toEqual(before);
    expect(analyzeConversations(corpus, configured)).toEqual(result);
  });
});

describe('conservative conversational-noise filtering', () => {
  it('excludes punctuation, exclamations and standalone orthographic signs', () => {
    expect(terms('！？!?。、，,.;:…⋯「」（）【】— -- ー ーー ｰ ゝ ゞ ヽ ヾ 々 〻 〆 😀 👍')).toEqual([]);
    expect(terms('データ コーヒー スーパー オーケストラ 時々 人々 様々'))
      .toEqual(['データ', 'コーヒー', 'スーパー', 'オーケストラ', '時々', '人々', '様々']);
  });

  it('normalizes acknowledgments and removes known split forms without fragments', () => {
    expect(terms(noise)).toEqual(['研究']);
    expect(terms('はいはい！おっけー。オーケー！オッケー！オッケイ。いいですよ。わかりました。了解です。承知しました。えー。あー。あっ。おっ。')).toEqual([]);
    expect(terms('って とか など しか さえ けど けれど でも ながら ません ている ています よね なんか だから なので')).toEqual([]);
    expect(terms('だけど じゃない じゃなく じゃありません そんな こんな あんな そういう そうだ それで ないし')).toEqual([]);
    expect(terms('だって ていた ていて ていない ていません あります ありました ありません ありませんでした')).toEqual([]);
  });

  it('retains meaningful kana, short technical terms and words containing stopword strings', () => {
    const content = ['りんご', 'ねこ', 'さくら', 'うどん', 'ピアノ', 'ペン', 'あいまい', 'こころ',
      'きっかけ', 'たんぱく質', 'AI', 'UI', 'UX', 'OKR', 'yesman', 'notebook', 'token', 'okapi', 'NoSQL'];
    const result = terms(content.join(' '));
    for (const word of content) expect(result.join('')).toContain(word.toLowerCase());
    expect(terms('研究してください')).toEqual(['研究']);
    // Restore known full spellings instead of globally banning their fragments.
    expect(terms('さいころ')).toEqual(['さいころ']);
    // Ambiguous ICU fragments are not stopwords on their own: deleting them
    // would destroy kana input, fibre or koji vocabulary too.
    expect(terms('かな入力')).toContain('かな');
    expect(terms('せんい')).toEqual(['せんい']);
    expect(terms('こうじ')).toEqual(['こうじ']);
    expect(terms('じゃばら')).toEqual(['じゃばら']);
    expect(terms('Node.js foo_bar O’Reilly')).toEqual(['node.js', 'foo_bar', 'o’reilly']);
  });

  it('preserves normalized offsets and punctuation/removed-word phrase barriers', () => {
    const text = 'はい！研究 と 設計。検証 OK 実装。機械!学習。ＡＩ データ';
    const tokens = tokenize(text);
    for (const token of tokens) expect(text.normalize('NFKC').slice(token.index, token.end)).toBe(token.surface);
    expect(tokenize(text)).toEqual(tokens);
    for (const separator of ['!', '。', '？', ' と ', ' はい ', ' OK ', 'ください']) {
      const source = `研究${separator}設計`;
      const documents = ['a', 'b'].map((id) => ({ messageId: id, conversationId: id, text: source, tokens: tokenize(source) }));
      expect(extractPhrases(documents).documentFrequency.size).toBe(0);
    }
    const source = '機械 学習';
    const documents = ['a', 'b'].map((id) => ({ messageId: id, conversationId: id, text: source, tokens: tokenize(source) }));
    expect(extractPhrases(documents).documentFrequency.get('機械 学習')).toBe(2);
  });

  it('does not reconstruct split stopwords or accept stopword components from alternate tokenizers', () => {
    const source = 'ください';
    const tokens: SurfaceToken[] = [
      { term: 'くだ', surface: 'くだ', index: 0, end: 2 },
      { term: 'さい', surface: 'さい', index: 2, end: 4 },
    ];
    expect(extractPhrases(['a', 'b'].map((id) => ({ messageId: id, conversationId: id, text: source, tokens })))
      .documentFrequency.size).toBe(0);
    const responseTokens: SurfaceToken[] = [
      { term: 'ok', surface: 'OK', index: 0, end: 2 },
      { term: '研究', surface: '研究', index: 3, end: 5 },
    ];
    expect(extractPhrases(['a', 'b'].map((id) => ({ messageId: id, conversationId: id, text: 'OK 研究', tokens: responseTokens })))
      .documentFrequency.size).toBe(0);
  });

  it('filters exact forms in the local fallback without stripping content substrings', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    try {
      expect(terms('はい！いいえ？ＯＫ yes no okay ください ありがとうございます って とか ー ーー')).toEqual([]);
      expect(terms('こころ りんご データ OKR notebook')).toEqual(['こころ', 'りんご', 'データ', 'okr', 'notebook']);
      // Fallback has no Japanese morphology: do not pretend to safely split this.
      expect(terms('研究してください')).toEqual(['研究してください']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([false, true])('keeps original messages/DF denominators but uses only content token totals (phrases=%s)', (includePhrases) => {
    const source = corpusOf(['研究！研究。データ！OK', 'データ！検証。はい', 'はい！いいえ。ＯＫ', '!?。ー']);
    const before = structuredClone(source);
    const configured = { ...settings, includePhrases };
    expect(prepareAnalysisDocuments(source, configured).documents.map((doc) => doc.words.length)).toEqual([3, 2, 0, 0]);
    const result = analyzeConversations(source, configured);
    expect(result.summary).toMatchObject({ conversationCount: 1, userMessageCount: 2, assistantMessageCount: 2, analyzedTermCount: 3 });
    expect(result.terms.find((term) => term.term === 'データ')).toMatchObject({
      dfUser: 1, dfAssistant: 1, rateUser: 0.5, rateAssistant: 0.5, biasLabel: 'shared',
      tokenFrequencyUser: 1, tokenFrequencyAssistant: 1, tokenTotalUser: 3, tokenTotalAssistant: 2,
      per1000TokensAssistant: 500,
    });
    expect(result.terms.find((term) => term.term === 'データ')?.per1000TokensUser).toBeCloseTo(1000 / 3);
    expect(result.terms.map((term) => term.term).sort()).toEqual(['データ', '検証', '研究']);
    expect(source).toEqual(before);
    expect(analyzeConversations(source, configured)).toEqual(result);
  });

  it('returns an honest empty analysis when every message is punctuation or a response', () => {
    const result = analyzeConversations(corpusOf(['はい！いいえ。OK', 'うん。なるほど。', 'ー!?', 'ありがとうございます。']), settings);
    expect(result.summary).toMatchObject({ userMessageCount: 2, assistantMessageCount: 2, analyzedTermCount: 0 });
    expect(result.terms).toEqual([]);
    expect(result.layout).toEqual([]);
    expect(result.insights.shared).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NO_ANALYZABLE_TERMS' })]));
  });
});
