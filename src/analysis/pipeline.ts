import { diagnostic } from '../domain/diagnostics';
import type {
  AnalysisResult,
  AnalysisSettings,
  DatasetSummary,
  Insights,
  NormalizedConversation,
  NormalizedMessage,
  Provider,
  ProviderComparison,
  TermStats,
  TimelineMetadata,
} from '../domain/models';
import { findAdoptionCandidates } from './adoption';
import { cleanTextDetailed } from './cleanText';
import { buildContextIndex } from './contextIndex';
import { calculateEchoRate } from './echo';
import { layoutTermsDetailed } from './layout';
import { type PhraseDocument, type PhraseExtractionResult } from './phrases';
import { extractLexicalTokensDetailed } from './lexical';
import { extractNounPhrases } from './nounPhrases';
import {
  computeTermStatistics,
  findContainmentRepresentatives,
  selectTopTermsDetailed,
  type AnalysisDocument,
} from './statistics';
import { canonicalizeTerm } from './tokenize';
import { selectVocabularyCandidates, vocabularySelectionScore } from './vocabulary';
import { CALENDAR_DAY_MS, dateKey, parseDateKey, resolveMessageDate, validateDateRange } from './timeline';

// Worker-lifetime cache by actual message object, not IDs or corpus counts.
// Date/display changes reuse linguistic work; hidden/cleaning changes do not.
// It is never durable, and terminating the worker releases dictionary + cache.
const lexicalCache = new WeakMap<NormalizedMessage, {
  input: string; signature: string; cleaned: ReturnType<typeof cleanTextDetailed>;
  words: AnalysisDocument['words'];
  limitedSpanCount: number;
}>();
let cachedCharacters = 0;
const MAX_CACHED_CHARACTERS = 8_000_000;

const PROVIDER_ORDER: Provider[] = ['chatgpt', 'claude', 'demo'];

interface TimeBounds {
  start: number | null;
  endExclusive: number | null;
  includeUndated: boolean;
  error: string | null;
  appliedRange?: { startDate: string; endDate: string };
}

const timeBounds = (settings: AnalysisSettings): TimeBounds => {
  if (settings.timeRange === 'all') {
    return { start: null, endExclusive: null, includeUndated: true, error: null };
  }
  if (settings.timeRange === 'custom') {
    const end = parseDateKey(settings.endDate);
    const error = validateDateRange(settings.startDate, settings.endDate);
    return { start: parseDateKey(settings.startDate),
      endExclusive: end === null ? null : end + CALENDAR_DAY_MS, includeUndated: false,
      error, ...(error === null ? {
        appliedRange: { startDate: settings.startDate, endDate: settings.endDate },
      } : {}) };
  }
  // Read the clock once for the whole analysis. These are 30/90/365 JST calendar days,
  // including today, not rolling millisecond windows or a UTC-based extra day.
  const today = parseDateKey(dateKey(Date.now()))!;
  const days = settings.timeRange === '30d' ? 30 : settings.timeRange === '90d' ? 90 : 365;
  return { start: today - (days - 1) * CALENDAR_DAY_MS,
    endExclusive: today + CALENDAR_DAY_MS, includeUndated: false, error: null,
    appliedRange: { startDate: dateKey(today - (days - 1) * CALENDAR_DAY_MS), endDate: dateKey(today) } };
};

const documentKey = (conversationId: string, messageId: string): string =>
  `${conversationId}\u0000${messageId}`;

export interface PreparedAnalysis {
  conversations: NormalizedConversation[];
  documents: AnalysisDocument[];
  truncatedMessageCount: number;
  phrasesLimited: boolean;
  phraseSelection?: PhraseExtractionResult['selection'];
  timeline: TimelineMetadata;
  dateRangeError: string | null;
  morphologyLimitedCount: number;
}

export const prepareAnalysisDocuments = (
  conversations: NormalizedConversation[],
  settings: AnalysisSettings,
): PreparedAnalysis => {
  const filteredConversations: NormalizedConversation[] = [];
  const provisional: Array<Omit<AnalysisDocument, 'phrases'>> = [];
  const hiddenTerms = new Set(settings.hiddenTerms.map(canonicalizeTerm).filter(Boolean));
  const lexicalSignature = JSON.stringify([settings.excludeCode, settings.excludeQuotes, [...hiddenTerms].sort()]);
  const bounds = timeBounds(settings);
  const timeline: TimelineMetadata = { startDate: null, endDate: null,
    datedMessageCount: 0, undatedMessageCount: 0, fallbackMessageCount: 0 };
  const sourceProviders = new Set<Provider>();
  if (bounds.appliedRange) timeline.appliedRange = bounds.appliedRange;
  let truncatedMessageCount = 0;
  let morphologyLimitedCount = 0;

  for (const conversation of conversations) {
    if (settings.provider !== 'all' && conversation.provider !== settings.provider) continue;
    sourceProviders.add(conversation.provider);
    const includedMessages = conversation.messages
      .filter((message) => {
        const resolved = resolveMessageDate(conversation, message);
        const date = resolved.timestamp;
        // Coverage precedes the date filter and content cleanup, so even a noise-only
        // message contributes its date and remains in the selected role denominator.
        if (date === null) timeline.undatedMessageCount += 1;
        else {
          timeline.datedMessageCount += 1;
          if (resolved.fallback) timeline.fallbackMessageCount += 1;
          const key = dateKey(date);
          if (timeline.startDate === null || key < timeline.startDate) timeline.startDate = key;
          if (timeline.endDate === null || key > timeline.endDate) timeline.endDate = key;
        }
        if (bounds.error !== null) return false;
        if (date === null) return bounds.includeUndated;
        return (bounds.start === null || date >= bounds.start) &&
          (bounds.endExclusive === null || date < bounds.endExclusive);
      })
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, 'ja'));
    if (includedMessages.length === 0) continue;
    const filteredConversation: NormalizedConversation = {
      ...conversation,
      messages: includedMessages,
    };
    filteredConversations.push(filteredConversation);

    for (const message of includedMessages) {
      const input = message.originalText || message.analysisText;
      const cached = lexicalCache.get(message);
      const reusable = cached?.input === input && cached.signature === lexicalSignature;
      const cleaned = reusable ? cached.cleaned : cleanTextDetailed(input, {
        excludeCode: settings.excludeCode,
        excludeQuotes: settings.excludeQuotes,
      });
      const extracted = reusable ? cached : extractLexicalTokensDetailed(cleaned.text, hiddenTerms, cleaned.identifierSpans);
      const { words, limitedSpanCount } = extracted;
      morphologyLimitedCount += limitedSpanCount;
      if (!reusable && cachedCharacters + cleaned.text.length <= MAX_CACHED_CHARACTERS) {
        lexicalCache.set(message, { input, signature: lexicalSignature, cleaned, words, limitedSpanCount });
        cachedCharacters += cleaned.text.length - (cached?.cleaned.text.length ?? 0);
      }
      if (cleaned.truncated) truncatedMessageCount += 1;
      provisional.push({
        conversation: filteredConversation,
        message,
        cleanedText: cleaned.text,
        // Remove hidden words before phrase, Echo, adoption, context, and layout
        // derivation so they cannot survive inside an n-gram or side metric.
        words,
      });
    }
  }
  timeline.sourceProviders = PROVIDER_ORDER.filter((provider) => sourceProviders.has(provider));

  const phraseDocuments: PhraseDocument[] = provisional.map((document) => ({
    messageId: documentKey(document.conversation.id, document.message.id),
    conversationId: document.conversation.id,
    text: document.cleanedText,
    tokens: document.words,
  }));
  const phraseResult: PhraseExtractionResult = settings.includePhrases
    ? extractNounPhrases(phraseDocuments)
    : { byMessage: new Map(), documentFrequency: new Map(), limited: false };
  const documents: AnalysisDocument[] = provisional.map((document) => ({
    ...document,
    phrases: phraseResult.byMessage.get(documentKey(document.conversation.id, document.message.id)) ?? [],
  }));

  return { conversations: filteredConversations, documents, truncatedMessageCount,
    phrasesLimited: phraseResult.limited, phraseSelection: phraseResult.selection,
    timeline, dateRangeError: bounds.error, morphologyLimitedCount };
};

const rankInsightTerms = (
  terms: TermStats[],
  predicate: (term: TermStats) => boolean,
  score: (term: TermStats) => number,
): TermStats[] => terms
  .filter(predicate)
  .sort((left, right) =>
    score(right) * (0.7 + Math.abs(right.bias)) -
      score(left) * (0.7 + Math.abs(left.bias)) ||
    right.rawFrequency - left.rawFrequency ||
    left.term.localeCompare(right.term, 'ja'))
  .slice(0, 6);

const createProviderComparison = (
  documents: AnalysisDocument[],
  settings: AnalysisSettings,
): ProviderComparison[] | null => {
  const available = new Set(documents.map((document) => document.message.provider));
  if (!available.has('chatgpt') || !available.has('claude')) return null;

  return (['chatgpt', 'claude'] as const).map((provider) => {
    const providerDocuments = documents.filter((document) => document.message.provider === provider);
    const statistics = computeTermStatistics(providerDocuments, {
      minimumDocumentFrequency: Math.min(2, settings.minDocumentFrequency),
      hiddenTerms: settings.hiddenTerms,
      includePhrases: settings.includePhrases,
    });
    return {
      provider,
      topTerms: selectTopTermsDetailed(statistics, 5, providerDocuments, settings.vocabularyFocus ?? 'topics').terms.map((term) => term.display),
      messageCount: providerDocuments.length,
    };
  });
};

const createSummary = (
  conversations: NormalizedConversation[],
  documents: AnalysisDocument[],
  analyzedTermCount: number,
  skippedCount: number,
): DatasetSummary => {
  let dateStart: number | null = null;
  let dateEnd: number | null = null;
  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      const date = resolveMessageDate(conversation, message).timestamp;
      if (date === null || !Number.isFinite(date)) continue;
      dateStart = dateStart === null ? date : Math.min(dateStart, date);
      dateEnd = dateEnd === null ? date : Math.max(dateEnd, date);
    }
  }
  return {
    conversationCount: conversations.length,
    userMessageCount: documents.filter((document) => document.message.role === 'user').length,
    assistantMessageCount: documents.filter((document) => document.message.role === 'assistant').length,
    providers: PROVIDER_ORDER.filter((provider) =>
      conversations.some((conversation) => conversation.provider === provider)),
    dateStart,
    dateEnd,
    analyzedTermCount,
    skippedCount: Math.max(0, Math.floor(skippedCount)),
  };
};

/** Main synchronous worker entry point. No source text leaves the browser process. */
export const analyzeConversations = (
  conversations: NormalizedConversation[],
  settings: AnalysisSettings,
  importedSkippedCount = 0,
): AnalysisResult => {
  const prepared = prepareAnalysisDocuments(conversations, settings);
  const allTerms = computeTermStatistics(prepared.documents, {
    minimumDocumentFrequency: settings.minDocumentFrequency,
    hiddenTerms: settings.hiddenTerms,
    includePhrases: settings.includePhrases,
  });
  const vocabularyFocus = settings.vocabularyFocus ?? 'topics';
  const selected = selectTopTermsDetailed(allTerms, settings.termLimit, prepared.documents, vocabularyFocus);
  const terms = selected.terms;
  const signature = JSON.stringify({
    provider: settings.provider,
    timeRange: settings.timeRange,
    startDate: settings.timeRange === 'custom' ? settings.startDate : undefined,
    endDate: settings.timeRange === 'custom' ? settings.endDate : undefined,
    includePhrases: settings.includePhrases,
    minimumDocumentFrequency: settings.minDocumentFrequency,
    hiddenTerms: [...settings.hiddenTerms].sort((left, right) => left.localeCompare(right, 'ja')),
    terms: terms.map((term) => `${term.kind}:${term.term}`),
  });
  const laidOut = layoutTermsDetailed(terms, signature);
  const diagnostics: AnalysisResult['diagnostics'] = [];
  if (prepared.morphologyLimitedCount) diagnostics.push(diagnostic('MORPHOLOGY_SPAN_LIMIT', 'warning',
    `語の境界を確認できない長大な文字列${prepared.morphologyLimitedCount}箇所を集計対象外にしました。短く切った断片で表示を埋めることはしません。`));

  if (prepared.dateRangeError !== null) {
    diagnostics.push(diagnostic('INVALID_DATE_RANGE', 'warning', prepared.dateRangeError));
  }

  if (prepared.phrasesLimited) {
    const selection = prepared.phraseSelection;
    const omitted = selection?.omittedSupportedFamilies ?? 0;
    const reason = selection?.candidateCapacityReached ? '候補探索の上限に達しました。' : '';
    diagnostics.push(diagnostic('PHRASE_OCCURRENCE_LIMIT', 'warning',
      `${reason}集計した複合語候補のうち${omitted.toLocaleString('ja-JP')}語を位置保存の上限により省略しました。採用した語は対象期間の全出現を集計しています。期間やプロバイダーを絞ると候補を再抽出できます。`));
  }

  if (prepared.truncatedMessageCount > 0) {
    diagnostics.push(diagnostic(
      'ANALYSIS_TEXT_TRUNCATED',
      'warning',
      `${prepared.truncatedMessageCount.toLocaleString('ja-JP')}件の長いメッセージを解析上限で切り詰めました。`,
    ));
  }
  if (laidOut.omitted.length > 0) {
    diagnostics.push(diagnostic(
      'LAYOUT_TERMS_OMITTED',
      'warning',
      `重なりを避けるため${laidOut.omitted.length.toLocaleString('ja-JP')}語を表示から省略しました。`,
    ));
  }
  if (allTerms.length === 0 && prepared.documents.length > 0) {
    diagnostics.push(diagnostic(
      'NO_ANALYZABLE_TERMS',
      'info',
      '現在の条件で表示できる語がありません。句読点・助詞・短い応答語は除外しています。内容のある会話を追加するか、最小出現数や期間を調整してください。',
    ));
  }
  if (allTerms.length > 0 && terms.length === 0 && vocabularyFocus === 'topics') {
    diagnostics.push(diagnostic('NO_TOPIC_TERMS', 'info',
      '話題の手がかりになる語が見つかりませんでした。定型的な進行語で表示枠は埋めません。「表示条件を変える」の「語の選び方」を「使用語を広く」にすると元の候補を確認できます。'));
  }

  const score = (term: TermStats) => vocabularyFocus === 'topics'
    ? vocabularySelectionScore(term, prepared.conversations.length) : term.importance;
  const eligibleVocabulary = selectVocabularyCandidates(allTerms, vocabularyFocus).candidates;
  const adoptionRepresentatives = findContainmentRepresentatives(eligibleVocabulary, prepared.documents);
  const adoptionVocabulary = eligibleVocabulary.filter((term) => !adoptionRepresentatives.has(`${term.kind}\u0000${term.term}`));
  const insights: Insights = {
    userIntroduced: rankInsightTerms(terms, (term) => term.bias >= 0.24, score),
    assistantReturned: rankInsightTerms(terms, (term) => term.bias <= -0.24, score),
    shared: [...terms]
      .filter((term) => term.biasLabel === 'shared')
      .sort((left, right) => score(right) - score(left) || left.term.localeCompare(right.term, 'ja'))
      .slice(0, 6),
    echo: calculateEchoRate(prepared.documents),
    adoption: findAdoptionCandidates(prepared.documents, adoptionVocabulary, {
      includePhrases: settings.includePhrases,
    }),
    providerComparison: createProviderComparison(prepared.documents, settings),
  };

  return {
    timeline: prepared.timeline,
    summary: createSummary(
      prepared.conversations,
      prepared.documents,
      allTerms.length,
      importedSkippedCount,
    ),
    terms,
    display: { layoutOmittedCount: laidOut.omitted.length,
      compoundSuppressedCount: selected.suppressedCount,
      vocabularyFocus, topicFilteredCount: selected.filteredCount },
    layout: laidOut.layout,
    contexts: buildContextIndex(terms, prepared.documents),
    insights,
    diagnostics,
  };
};
