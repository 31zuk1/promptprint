import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisSettings, type NormalizedConversation } from '../domain/models';
import {
  expectedSubjectFamilies,
  grammaticalDebris,
  naturalMixedTopicCorpus,
  qualityCorpus,
} from '../test/fixtures/topic-quality';
import { initializeMorphology } from './morphology';
import { analyzeConversations, prepareAnalysisDocuments } from './pipeline';
import { computeTermStatistics, occurrencesForDocument, selectTopTermsDetailed } from './statistics';

beforeAll(async () => {
  await initializeMorphology(async (name) => new Uint8Array(
    await readFile(resolve('node_modules/kuromoji/dict', name)),
  ));
}, 30_000);

const settings = (overrides: Partial<AnalysisSettings> = {}): AnalysisSettings => ({
  ...DEFAULT_ANALYSIS_SETTINGS,
  termLimit: 120,
  ...overrides,
});
const analyze = (source: NormalizedConversation[], overrides: Partial<AnalysisSettings> = {}) =>
  analyzeConversations(source, settings(overrides));
const observedForm = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();

describe('independent topic quality: natural conversation rather than demo seed words', () => {
  it('recovers diverse actual subjects near the top despite ubiquitous conversational scaffolding', () => {
    const source = naturalMixedTopicCorpus();
    const result = analyze(source, { termLimit: 40 });
    const labels = result.terms.map((term) => term.term);
    const recalledFamilies = (limit: number) => expectedSubjectFamilies.filter((family) =>
      family.some((label) => labels.slice(0, limit).includes(label)));

    expect(result.summary).toMatchObject({ conversationCount: 30, userMessageCount: 60, assistantMessageCount: 60 });
    expect(recalledFamilies(20).length, `top 20: ${labels.slice(0, 20).join(' / ')}`).toBeGreaterThanOrEqual(8);
    expect(recalledFamilies(40).length, `top 40: ${labels.join(' / ')}`).toBeGreaterThanOrEqual(9);
    expect(labels.filter((term) => grammaticalDebris.has(term))).toEqual([]);
    const proceduralOnly = new Set(['説明', '質問', '確認', '具体的', '方法', '内容', '必要', 'ところ', 'こと', '感じ', '気', '順番', '以上']);
    expect(labels.slice(0, 20).filter((term) => proceduralOnly.has(term))).toEqual([]);
    expect(labels.some((term) => /^(?:によって|したがって|わかり)|(?:なん|てる|かな)$/u.test(term))).toBe(false);
  });

  it('keeps exact observed noun compounds longer than the old three-token ceiling', () => {
    const subjects = ['再生可能エネルギー発電設備', '高分子電解質燃料電池', '地域公共交通計画'];
    const source = qualityCorpus(subjects.map((subject) => [
      `🔬${subject}について詳しく勉強したいです。${subject}のしくみを教えてください。`,
      `${subject}の構成を順に見ます。まず${subject}をひとつの対象として扱います。`,
      `${subject}を調べました。${subject}の資料を読みたいです。`,
      `${subject}の資料を比べましょう。${subject}の前提も確認します。`,
    ]));
    const result = analyze(source);
    for (const subject of subjects) {
      expect(result.terms.map((term) => term.term), subject).toContain(subject);
      expect(result.contexts[subject]?.some((context) =>
        context.excerpt.slice(context.matchStart, context.matchEnd) === subject), subject).toBe(true);
    }
    const documents = prepareAnalysisDocuments(source, settings()).documents;
    for (const document of documents) {
      for (const occurrence of occurrencesForDocument(document, true)) {
        expect(observedForm(document.cleanedText.slice(occurrence.index, occurrence.end)))
          .toBe(observedForm(occurrence.surface));
      }
    }
  });

  it('preserves kana nouns and unfamiliar identifiers instead of using a topic dictionary whitelist', () => {
    const source = qualityCorpus([
      [
        'そばを打ってみたい。うどんとは粉の配合が違いますか。くるみを添えたいです。',
        'そばとうどんでは使う粉が違います。くるみの風味も麺に合います。',
        'そばとうどんを食べ比べました。くるみをすったつゆを作りたいです。',
        'そばとうどんを同じ量で比べましょう。くるみは少しずつ混ぜます。',
      ],
      [
        'きのこを育てたい。みかんの皮を材料に使えますか。',
        'きのこの栽培には適した培地が要ります。みかんの皮の成分には注意します。',
        'きのことみかんの保存方法も知りたいです。',
        'きのことみかんはそれぞれ適した湿度で保存してください。',
      ],
      [
        'AsterQuartz の性能を調べたい。AsterQuartz は SQL を扱う試作エンジンです。',
        'AsterQuartz の評価では SQL の負荷条件をそろえます。',
        'AsterQuartz で SQL の実行計画を表示できました。',
        'AsterQuartz と SQL の記録を保存して比較しましょう。',
      ],
    ]);
    const labels = analyze(source).terms.map((term) => term.term);
    for (const subject of ['そば', 'うどん', 'くるみ', 'きのこ', 'みかん', 'asterquartz', 'sql']) {
      expect(labels, subject).toContain(subject);
    }
  });

  it('extracts observed English technical noun phrases without creating connective fragments', () => {
    const source = qualityCorpus([
      [
        'How does the finite element method approximate a bending beam?\nI want to study the finite element method with a small mesh.',
        'The finite element method approximates a field on a mesh.\nUse the finite element method to compare displacement estimates.',
        'I tried the finite element method with quadratic elements.\nDoes the finite element method converge under mesh refinement?',
        'The finite element method can be checked with a known solution.\nThe finite element method still needs appropriate boundary conditions.',
      ],
      [
        'Can you explain Gaussian process regression?\nI want uncertainty estimates from Gaussian process regression.',
        'Gaussian process regression defines a distribution over functions.\nGaussian process regression uses a covariance kernel.',
        'I am fitting Gaussian process regression to noisy measurements.\nHow does Gaussian process regression treat observation noise?',
        'Gaussian process regression distinguishes observation noise from predictive uncertainty.\nInspect the kernel assumptions in Gaussian process regression.',
      ],
      [
        'What does differential privacy protect?\nI am studying differential privacy for aggregate statistics.',
        'Differential privacy bounds changes in output distributions.\nDifferential privacy does not mean every released statistic is accurate.',
        'How does differential privacy compose across several queries?\nI need the privacy budget in differential privacy.',
        'Differential privacy requires accounting across queries.\nThe budget controls a tradeoff in differential privacy.',
      ],
    ]);
    const result = analyze(source, { termLimit: 40 });
    const labels = result.terms.map((term) => term.term);
    for (const subject of ['finite element method', 'gaussian process regression', 'differential privacy']) {
      expect(labels, subject).toContain(subject);
    }
    expect(labels.some((term) => /^(?:how|does|can|you|want|the|with|from|of|in|is|are|to)\s|\s(?:the|with|from|of|in|is|are|to)$/u.test(term))).toBe(false);
  });

  it('does not fill a subjectless conversation with acknowledgments, grammar or procedural nouns', () => {
    const source = qualityCorpus(Array.from({ length: 8 }, () => [
      'はい！ いいえ？ OK。そうなんですね。なるほど、じゃあお願いします。',
      'もちろんです。わかりました。ありがとうございます。',
      'えっと、どうしたらいいのかな。なんとなくわかってきてる。もう少し詳しくお願いします。',
      'したがって、必要な内容を確認して、具体的な方法を説明します。',
    ]));
    const result = analyze(source);
    expect(result.terms).toEqual([]);
    expect(result.layout).toEqual([]);
    expect(result.summary).toMatchObject({ conversationCount: 8, userMessageCount: 16, assistantMessageCount: 16 });
    expect(result.diagnostics.some((diagnostic) =>
      diagnostic.code === 'NO_TOPIC_TERMS' || diagnostic.code === 'NO_ANALYZABLE_TERMS')).toBe(true);
  });

  it('does not bridge punctuation, particles, hidden nouns, quote boundaries or excluded code', () => {
    const source = qualityCorpus(Array.from({ length: 3 }, () => [
      '燃料！電池。燃料と電池。燃料 温度 電池。\n> 星間航行装置を設計する\n```ts\nconst forbiddenSourceArtifact = "空間跳躍機関";\n```',
      '燃料！電池。燃料と電池。燃料 温度 電池。\n> 星間航行装置を設計する\n```ts\nconst forbiddenSourceArtifact = "空間跳躍機関";\n```',
    ]));
    const result = analyze(source, { hiddenTerms: ['温度'] });
    const labels = result.terms.map((term) => term.term);
    expect(labels).toContain('燃料');
    expect(labels).toContain('電池');
    expect(labels.some((term) => /燃料\s*電池|温度|星間|航行|空間|跳躍|forbiddensourceartifact/u.test(term))).toBe(false);
    expect(result.terms.filter((term) => term.kind === 'phrase')).toEqual([]);
  });

  it('retains independent component usage instead of blindly replacing every substring with a compound', () => {
    const source = qualityCorpus(Array.from({ length: 3 }, () => [
      '燃料電池のしくみを知りたい。乾電池とは違いますか。',
      '燃料電池は供給される燃料から電気を作ります。',
      '電池を交換しました。電池の寿命を延ばしたい。',
      '電池を長く使うための保存状態を確認します。',
    ]));
    const result = analyze(source);
    expect(result.terms.map((term) => term.term)).toContain('燃料電池');
    expect(result.terms.map((term) => term.term)).toContain('電池');
    const documents = prepareAnalysisDocuments(source, settings()).documents;
    const statistics = computeTermStatistics(documents);
    const battery = statistics.find((term) => term.term === '電池')!;
    expect(battery).toMatchObject({ dfUser: 6, dfAssistant: 6, conversationCoverage: 3 });
    expect(result.terms.find((term) => term.term === '電池')).toEqual(battery);
  });

  it('never invents a topic label: every displayed candidate has an exact occurrence and source context', () => {
    const source = naturalMixedTopicCorpus();
    const result = analyze(source);
    const documents = prepareAnalysisDocuments(source, settings()).documents;
    for (const term of result.terms) {
      const occurrences = documents.flatMap((document) => occurrencesForDocument(document, true)
        .filter((occurrence) => occurrence.term === term.term && occurrence.kind === term.kind)
        .map((occurrence) => ({ document, occurrence })));
      expect(occurrences.length, term.term).toBeGreaterThan(0);
      for (const { document, occurrence } of occurrences) {
        expect(observedForm(document.cleanedText.slice(occurrence.index, occurrence.end)), term.term)
          .toBe(observedForm(occurrence.surface));
      }
      const contexts = result.contexts[term.term] ?? [];
      expect(contexts.length, term.term).toBeGreaterThan(0);
      for (const context of contexts) {
        const highlighted = context.excerpt.slice(context.matchStart, context.matchEnd);
        expect(observedForm(highlighted), term.term).toBe(observedForm(term.term));
        expect(source.find((thread) => thread.id === context.conversationId)?.messages
          .some((message) => observedForm(message.originalText).includes(observedForm(highlighted))), term.term).toBe(true);
      }
    }
  });

  it('keeps the same measurement ledger and exact term metrics in topic and broad modes', () => {
    const source = naturalMixedTopicCorpus();
    const snapshot = structuredClone(source);
    const topicSettings = settings();
    const broadSettings = settings({ vocabularyFocus: 'all' });
    const topicDocuments = prepareAnalysisDocuments(source, topicSettings).documents;
    const broadDocuments = prepareAnalysisDocuments(source, broadSettings).documents;
    expect(topicDocuments).toEqual(broadDocuments);
    const statistics = computeTermStatistics(topicDocuments);
    const topic = analyzeConversations(source, topicSettings);
    const broad = analyzeConversations(source, broadSettings);
    expect(topic.summary).toEqual(broad.summary);
    expect(topic.insights.echo).toEqual(broad.insights.echo);
    for (const term of topic.terms) {
      expect(statistics.find((candidate) => candidate.term === term.term && candidate.kind === term.kind)).toEqual(term);
      const broadTerm = broad.terms.find((candidate) => candidate.term === term.term && candidate.kind === term.kind);
      if (broadTerm) expect(broadTerm).toEqual(term);
      const comparedAlone = selectTopTermsDetailed([term], 1, broadDocuments, 'all').terms[0];
      expect(comparedAlone).toEqual(term);
    }
    expect(source).toEqual(snapshot);
    expect(analyzeConversations(source, topicSettings)).toEqual(topic);
  });

  it('does not erase a genuine subject merely because every selected conversation discusses it', () => {
    const source = qualityCorpus(Array.from({ length: 6 }, () => [
      '乳酸発酵の温度を比べています。乳酸発酵を長く続けたいです。',
      '乳酸発酵の記録を毎日取ります。乳酸発酵の変化を記述します。',
      '乳酸発酵の温度を一定にしました。乳酸発酵の記録を見てください。',
      '乳酸発酵の記録を比較します。乳酸発酵の温度も併記してください。',
    ]));
    const term = analyze(source).terms.find((candidate) => candidate.term === '乳酸発酵');
    expect(term).toMatchObject({ conversationCoverage: 6, dfUser: 12, dfAssistant: 12, rateUser: 1, rateAssistant: 1, biasLabel: 'shared' });
  });

  it('does not mistake a hundred repeats inside one pasted message for broad conversational support', () => {
    const source = qualityCorpus([
      ['乳酸発酵の温度を調べたいです。', '乳酸発酵の温度を一定にします。'],
      ['乳酸発酵の記録を取りました。', '乳酸発酵の記録を比較します。'],
      ['量子航法装置について。'.repeat(100), 'はい、わかりました。'],
    ]);
    const result = analyze(source);
    expect(result.terms.some((term) => /量子|航法|装置/u.test(term.term))).toBe(false);
    expect(result.terms.find((term) => term.term === '乳酸発酵'))
      .toMatchObject({ dfUser: 2, dfAssistant: 2, conversationCoverage: 2 });
    const documents = prepareAnalysisDocuments(source, settings()).documents;
    const allObserved = computeTermStatistics(documents, { minimumDocumentFrequency: 1 });
    for (const term of allObserved.filter((term) => /量子|航法|装置/u.test(term.term))) {
      expect(term.dfUser).toBe(1);
      expect(term.dfAssistant).toBe(0);
      expect(term.conversationCoverage).toBe(1);
    }
  });
});
