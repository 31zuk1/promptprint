import { diagnostic } from '../domain/diagnostics';
import type {
  AnalysisResult,
  AnalysisSettings,
  DatasetSummary,
  Insights,
  NormalizedConversation,
  Provider,
  ProviderComparison,
  TermStats,
} from '../domain/models';
import { findAdoptionCandidates } from './adoption';
import { cleanTextDetailed } from './cleanText';
import { buildContextIndex } from './contextIndex';
import { calculateEchoRate } from './echo';
import { layoutTermsDetailed } from './layout';
import { extractPhrases, type PhraseDocument } from './phrases';
import {
  computeTermStatistics,
  selectTopTerms,
  type AnalysisDocument,
} from './statistics';
import { canonicalizeTerm, tokenize } from './tokenize';

const DAY = 86_400_000;
const PROVIDER_ORDER: Provider[] = ['chatgpt', 'claude', 'demo'];

const timeRangeDuration = (timeRange: AnalysisSettings['timeRange']): number | null => {
  switch (timeRange) {
    case '30d': return 30 * DAY;
    case '90d': return 90 * DAY;
    case '1y': return 365 * DAY;
    case 'all': return null;
  }
};

const effectiveMessageDate = (
  conversation: NormalizedConversation,
  message: NormalizedConversation['messages'][number],
): number | null => message.createdAt ?? conversation.updatedAt ?? conversation.createdAt;

const includedByTime = (
  conversation: NormalizedConversation,
  message: NormalizedConversation['messages'][number],
  settings: AnalysisSettings,
): boolean => {
  const duration = timeRangeDuration(settings.timeRange);
  if (duration === null) return true;
  const date = effectiveMessageDate(conversation, message);
  if (date === null) return false;
  // Day precision avoids tiny changes during a long worker run.
  const today = Math.floor(Date.now() / DAY) * DAY;
  return date >= today - duration && date <= today + DAY;
};

const documentKey = (conversationId: string, messageId: string): string =>
  `${conversationId}\u0000${messageId}`;

export interface PreparedAnalysis {
  conversations: NormalizedConversation[];
  documents: AnalysisDocument[];
  truncatedMessageCount: number;
}

export const prepareAnalysisDocuments = (
  conversations: NormalizedConversation[],
  settings: AnalysisSettings,
): PreparedAnalysis => {
  const filteredConversations: NormalizedConversation[] = [];
  const provisional: Array<Omit<AnalysisDocument, 'phrases'>> = [];
  const hiddenTerms = new Set(settings.hiddenTerms.map(canonicalizeTerm).filter(Boolean));
  let truncatedMessageCount = 0;

  for (const conversation of conversations) {
    if (settings.provider !== 'all' && conversation.provider !== settings.provider) continue;
    const includedMessages = conversation.messages
      .filter((message) => includedByTime(conversation, message, settings))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, 'ja'));
    if (includedMessages.length === 0) continue;
    const filteredConversation: NormalizedConversation = {
      ...conversation,
      messages: includedMessages,
    };
    filteredConversations.push(filteredConversation);

    for (const message of includedMessages) {
      const cleaned = cleanTextDetailed(message.originalText || message.analysisText, {
        excludeCode: settings.excludeCode,
        excludeQuotes: settings.excludeQuotes,
      });
      if (cleaned.truncated) truncatedMessageCount += 1;
      provisional.push({
        conversation: filteredConversation,
        message,
        cleanedText: cleaned.text,
        // Remove hidden words before phrase, Echo, adoption, context, and layout
        // derivation so they cannot survive inside an n-gram or side metric.
        words: tokenize(cleaned.text).filter((token) => !hiddenTerms.has(token.term)),
      });
    }
  }

  const phraseDocuments: PhraseDocument[] = provisional.map((document) => ({
    messageId: documentKey(document.conversation.id, document.message.id),
    conversationId: document.conversation.id,
    text: document.cleanedText,
    tokens: document.words,
  }));
  const phraseResult = settings.includePhrases
    ? extractPhrases(phraseDocuments)
    : { byMessage: new Map(), documentFrequency: new Map() };
  const documents: AnalysisDocument[] = provisional.map((document) => ({
    ...document,
    phrases: phraseResult.byMessage.get(documentKey(document.conversation.id, document.message.id)) ?? [],
  }));

  return { conversations: filteredConversations, documents, truncatedMessageCount };
};

const rankInsightTerms = (
  terms: TermStats[],
  predicate: (term: TermStats) => boolean,
): TermStats[] => terms
  .filter(predicate)
  .sort((left, right) =>
    right.importance * (0.7 + Math.abs(right.bias)) -
      left.importance * (0.7 + Math.abs(left.bias)) ||
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
      topTerms: selectTopTerms(statistics, 5).map((term) => term.display),
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
      const date = effectiveMessageDate(conversation, message);
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
  const terms = selectTopTerms(allTerms, settings.termLimit);
  const signature = JSON.stringify({
    provider: settings.provider,
    timeRange: settings.timeRange,
    includePhrases: settings.includePhrases,
    minimumDocumentFrequency: settings.minDocumentFrequency,
    hiddenTerms: [...settings.hiddenTerms].sort((left, right) => left.localeCompare(right, 'ja')),
    terms: terms.map((term) => `${term.kind}:${term.term}`),
  });
  const laidOut = layoutTermsDetailed(terms, signature);
  const diagnostics: AnalysisResult['diagnostics'] = [];

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
      '現在の条件で表示できる語がありません。最小出現数や期間を調整してください。',
    ));
  }

  const insights: Insights = {
    userIntroduced: rankInsightTerms(terms, (term) => term.bias >= 0.24),
    assistantReturned: rankInsightTerms(terms, (term) => term.bias <= -0.24),
    shared: [...terms]
      .filter((term) => Math.abs(term.bias) < 0.24)
      .sort((left, right) => right.importance - left.importance || left.term.localeCompare(right.term, 'ja'))
      .slice(0, 6),
    echo: calculateEchoRate(prepared.documents),
    adoption: findAdoptionCandidates(prepared.documents, allTerms, {
      includePhrases: settings.includePhrases,
    }),
    providerComparison: createProviderComparison(prepared.documents, settings),
  };

  return {
    summary: createSummary(
      prepared.conversations,
      prepared.documents,
      allTerms.length,
      importedSkippedCount,
    ),
    terms,
    layout: laidOut.layout,
    contexts: buildContextIndex(terms, prepared.documents),
    insights,
    diagnostics,
  };
};
