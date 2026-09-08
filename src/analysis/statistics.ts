import type {
  BiasLabel,
  NormalizedConversation,
  NormalizedMessage,
  Provider,
  TermKind,
  TermStats,
} from '../domain/models';
import type { PhraseOccurrence } from './phrases';
import { canonicalizeTerm, type SurfaceToken } from './tokenize';

export interface AnalysisDocument {
  conversation: NormalizedConversation;
  message: NormalizedMessage;
  cleanedText: string;
  words: SurfaceToken[];
  phrases: PhraseOccurrence[];
}

export interface TermOccurrence {
  term: string;
  surface: string;
  index: number;
  end: number;
  kind: TermKind;
}

export interface StatisticsOptions {
  minimumDocumentFrequency?: number;
  hiddenTerms?: string[];
  includePhrases?: boolean;
}

interface MutableTermAggregate {
  term: string;
  kind: TermKind;
  userMessages: Set<string>;
  assistantMessages: Set<string>;
  conversations: Set<string>;
  providers: Set<Provider>;
  surfaces: Map<string, number>;
  rawFrequency: number;
}

const PROVIDER_ORDER: Provider[] = ['chatgpt', 'claude', 'demo'];
export const BIAS_THRESHOLD = 0.18;
export const RATE_SMOOTHING_ALPHA = 0.5;

export const classifyBias = (bias: number): BiasLabel => {
  if (bias >= BIAS_THRESHOLD) return 'user';
  if (bias <= -BIAS_THRESHOLD) return 'assistant';
  return 'shared';
};

export const occurrencesForDocument = (
  document: AnalysisDocument,
  includePhrases = true,
): TermOccurrence[] => [
  ...document.words.map((word) => ({ ...word, kind: 'word' as const })),
  ...(includePhrases ? document.phrases.map((phrase) => ({ ...phrase, kind: 'phrase' as const })) : []),
];

const aggregateKey = (kind: TermKind, term: string): string => `${kind}\u0000${term}`;

const preferredDisplay = (surfaces: Map<string, number>, fallback: string): string =>
  [...surfaces.entries()]
    .sort(([leftSurface, leftCount], [rightSurface, rightCount]) =>
      rightCount - leftCount || leftSurface.localeCompare(rightSurface, 'ja'))[0]?.[0] ?? fallback;

export const computeTermStatistics = (
  documents: AnalysisDocument[],
  options: StatisticsOptions = {},
): TermStats[] => {
  const minimumDocumentFrequency = Math.max(1, Math.floor(options.minimumDocumentFrequency ?? 2));
  const includePhrases = options.includePhrases ?? true;
  const hiddenTerms = new Set((options.hiddenTerms ?? []).map(canonicalizeTerm).filter(Boolean));
  const userMessageCount = documents.filter((document) => document.message.role === 'user').length;
  const assistantMessageCount = documents.filter((document) => document.message.role === 'assistant').length;
  const aggregates = new Map<string, MutableTermAggregate>();

  for (const document of documents) {
    const occurrences = occurrencesForDocument(document, includePhrases);
    const seen = new Set<string>();
    for (const occurrence of occurrences) {
      const term = canonicalizeTerm(occurrence.term);
      if (!term || hiddenTerms.has(term) || hiddenTerms.has(canonicalizeTerm(occurrence.surface))) continue;
      const key = aggregateKey(occurrence.kind, term);
      let aggregate = aggregates.get(key);
      if (!aggregate) {
        aggregate = {
          term,
          kind: occurrence.kind,
          userMessages: new Set(),
          assistantMessages: new Set(),
          conversations: new Set(),
          providers: new Set(),
          surfaces: new Map(),
          rawFrequency: 0,
        };
        aggregates.set(key, aggregate);
      }

      aggregate.rawFrequency += 1;
      aggregate.surfaces.set(occurrence.surface, (aggregate.surfaces.get(occurrence.surface) ?? 0) + 1);
      aggregate.conversations.add(document.conversation.id);
      aggregate.providers.add(document.message.provider);
      if (!seen.has(key)) {
        const roleSet = document.message.role === 'user'
          ? aggregate.userMessages
          : aggregate.assistantMessages;
        roleSet.add(document.message.id);
        seen.add(key);
      }
    }
  }

  const statistics: TermStats[] = [];
  for (const aggregate of aggregates.values()) {
    const dfUser = aggregate.userMessages.size;
    const dfAssistant = aggregate.assistantMessages.size;
    const messageDf = dfUser + dfAssistant;
    if (messageDf < minimumDocumentFrequency) continue;

    const rateUser = (dfUser + RATE_SMOOTHING_ALPHA) /
      (userMessageCount + 2 * RATE_SMOOTHING_ALPHA);
    const rateAssistant = (dfAssistant + RATE_SMOOTHING_ALPHA) /
      (assistantMessageCount + 2 * RATE_SMOOTHING_ALPHA);
    const rawBias = Math.log(rateUser / rateAssistant);
    const bias = Math.tanh(rawBias / 2);
    const conversationDf = aggregate.conversations.size;
    const importance = Math.log1p(messageDf) * (1 + 0.35 * Math.log1p(conversationDf));

    statistics.push({
      term: aggregate.term,
      display: preferredDisplay(aggregate.surfaces, aggregate.term),
      kind: aggregate.kind,
      dfUser,
      dfAssistant,
      rateUser,
      rateAssistant,
      bias,
      biasLabel: classifyBias(bias),
      importance,
      // Kept as an absolute conversation count so the UI can state "N件" honestly.
      conversationCoverage: conversationDf,
      providerCoverage: PROVIDER_ORDER.filter((provider) => aggregate.providers.has(provider)),
      rawFrequency: aggregate.rawFrequency,
    });
  }

  return statistics.sort(compareTermImportance);
};

export const compareTermImportance = (left: TermStats, right: TermStats): number =>
  right.importance - left.importance ||
  right.rawFrequency - left.rawFrequency ||
  (left.kind === right.kind ? 0 : left.kind === 'phrase' ? -1 : 1) ||
  left.term.localeCompare(right.term, 'ja');

const phrasesAreNearDuplicates = (left: string, right: string): boolean => {
  const compactLeft = left.replace(/\s+/gu, '');
  const compactRight = right.replace(/\s+/gu, '');
  const shorter = compactLeft.length <= compactRight.length ? compactLeft : compactRight;
  const longer = compactLeft.length > compactRight.length ? compactLeft : compactRight;
  return shorter.length / Math.max(1, longer.length) >= 0.68 && longer.includes(shorter);
};

export const selectTopTerms = (allTerms: TermStats[], requestedLimit: number): TermStats[] => {
  const limit = Math.max(0, Math.floor(requestedLimit));
  if (limit === 0) return [];
  const sorted = [...allTerms].sort(compareTermImportance);
  const phraseLimit = Math.max(1, Math.ceil(limit * 0.35));
  const chosen: TermStats[] = [];
  const chosenKeys = new Set<string>();
  let phraseCount = 0;

  const tryAdd = (candidate: TermStats): boolean => {
    const key = aggregateKey(candidate.kind, candidate.term);
    if (chosenKeys.has(key) || chosen.length >= limit) return false;
    if (candidate.kind === 'phrase') {
      if (phraseCount >= phraseLimit) return false;
      if (chosen.some((term) => term.kind === 'phrase' && phrasesAreNearDuplicates(term.term, candidate.term))) {
        return false;
      }
      phraseCount += 1;
    }
    chosenKeys.add(key);
    chosen.push(candidate);
    return true;
  };

  const userQuota = Math.ceil(limit * 0.375);
  const sharedQuota = Math.ceil(limit * 0.25);
  const assistantQuota = Math.max(0, limit - userQuota - sharedQuota);
  const quotas: Array<[BiasLabel, number]> = [
    ['user', userQuota],
    ['shared', sharedQuota],
    ['assistant', assistantQuota],
  ];

  for (const [label, quota] of quotas) {
    let added = 0;
    for (const candidate of sorted) {
      if (candidate.biasLabel !== label) continue;
      if (tryAdd(candidate)) added += 1;
      if (added >= quota) break;
    }
  }

  for (const candidate of sorted) {
    if (chosen.length >= limit) break;
    tryAdd(candidate);
  }

  return chosen.sort(compareTermImportance);
};
