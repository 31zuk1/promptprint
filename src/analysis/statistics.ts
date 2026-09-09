import type {
  BiasLabel,
  NormalizedConversation,
  NormalizedMessage,
  Provider,
  TermKind,
  TermStats,
  VocabularyFocus,
} from '../domain/models';
import type { PhraseOccurrence } from './phrases';
import { canonicalizeTerm, type SurfaceToken } from './tokenize';
import { selectVocabularyCandidates, vocabularySelectionScore } from './vocabulary';

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
  topicEligible?: boolean;
  displayEligible?: boolean;
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
  frequencyUser: number;
  frequencyAssistant: number;
  nounMessages: Set<string>;
  linguisticEvidence: boolean;
  displayEvidence: boolean;
  displayEligible: boolean;
}

const PROVIDER_ORDER: Provider[] = ['chatgpt', 'claude', 'demo'];
export const BIAS_THRESHOLD = 0.18;
export const classifyBias = (
  bias: number, dfUser: number, dfAssistant: number,
  userMessageCount: number, assistantMessageCount: number,
): BiasLabel => {
  if (!userMessageCount || !assistantMessageCount) return 'insufficient';
  if (!dfAssistant) return 'user';
  if (!dfUser) return 'assistant';
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
  const tokenTotals = { user: 0, assistant: 0 };
  const aggregates = new Map<string, MutableTermAggregate>();

  for (const document of documents) {
    tokenTotals[document.message.role] += document.words.filter((word) =>
      !hiddenTerms.has(canonicalizeTerm(word.term)) &&
      !hiddenTerms.has(canonicalizeTerm(word.surface))).length;
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
          frequencyUser: 0,
          frequencyAssistant: 0,
          nounMessages: new Set(),
          linguisticEvidence: false,
          displayEvidence: false,
          displayEligible: false,
        };
        aggregates.set(key, aggregate);
      }

      aggregate.rawFrequency += 1;
      if (occurrence.displayEligible !== undefined) aggregate.displayEvidence = true;
      if (occurrence.displayEligible) aggregate.displayEligible = true;
      if (occurrence.topicEligible !== undefined) aggregate.linguisticEvidence = true;
      if (occurrence.topicEligible) aggregate.nounMessages.add(`${document.conversation.id}\u0000${document.message.id}`);
      if (document.message.role === 'user') aggregate.frequencyUser += 1;
      else aggregate.frequencyAssistant += 1;
      aggregate.surfaces.set(occurrence.surface, (aggregate.surfaces.get(occurrence.surface) ?? 0) + 1);
      aggregate.conversations.add(document.conversation.id);
      aggregate.providers.add(document.message.provider);
      if (!seen.has(key)) {
        const roleSet = document.message.role === 'user'
          ? aggregate.userMessages
          : aggregate.assistantMessages;
        roleSet.add(`${document.conversation.id}\u0000${document.message.id}`);
        seen.add(key);
      }
    }
  }

  const statistics: TermStats[] = [];
  const conversationCount = new Set(documents.map((document) => document.conversation.id)).size;
  for (const aggregate of aggregates.values()) {
    const dfUser = aggregate.userMessages.size;
    const dfAssistant = aggregate.assistantMessages.size;
    const messageDf = dfUser + dfAssistant;
    if (messageDf < minimumDocumentFrequency) continue;

    const rateUser = userMessageCount ? dfUser / userMessageCount : 0;
    const rateAssistant = assistantMessageCount ? dfAssistant / assistantMessageCount : 0;
    // Algebraically equivalent to tanh(log(rateUser/rateAssistant)/2),
    // but defined at observed zeros without fabricating pseudo-occurrences.
    const bias = userMessageCount && assistantMessageCount
      ? (rateUser - rateAssistant) / (rateUser + rateAssistant) : 0;
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
      userMessageCount,
      assistantMessageCount,
      tokenFrequencyUser: aggregate.frequencyUser,
      tokenFrequencyAssistant: aggregate.frequencyAssistant,
      tokenTotalUser: tokenTotals.user,
      tokenTotalAssistant: tokenTotals.assistant,
      per1000TokensUser: tokenTotals.user ? aggregate.frequencyUser / tokenTotals.user * 1000 : null,
      per1000TokensAssistant: tokenTotals.assistant ? aggregate.frequencyAssistant / tokenTotals.assistant * 1000 : null,
      bias,
      biasLabel: classifyBias(bias, dfUser, dfAssistant, userMessageCount, assistantMessageCount),
      importance,
      // Kept as an absolute conversation count so the UI can state "N件" honestly.
      conversationCoverage: conversationDf,
      providerCoverage: PROVIDER_ORDER.filter((provider) => aggregate.providers.has(provider)),
      rawFrequency: aggregate.rawFrequency,
      ...(aggregate.displayEvidence ? { lexicalEligible: aggregate.displayEligible } : {}),
      ...(aggregate.linguisticEvidence ? { topicEvidence: {
        eligible: aggregate.nounMessages.size / messageDf >= 0.5,
        nounMessageCount: aggregate.nounMessages.size,
        // Message support saturates; inverse conversation frequency separates
        // specific subjects from words appearing across unrelated conversations.
        // A +1 floor preserves themes present throughout the entire corpus.
        score: Math.log1p(messageDf) * (1 + Math.log((conversationCount + 1) / (conversationDf + 1))) *
          messageDf / (messageDf + 2),
      } } : {}),
    });
  }

  return statistics.sort(compareTermImportance);
};

export const compareTermImportance = (left: TermStats, right: TermStats): number =>
  right.importance - left.importance ||
  right.rawFrequency - left.rawFrequency ||
  (left.kind === right.kind ? 0 : left.kind === 'phrase' ? -1 : 1) ||
  left.term.localeCompare(right.term, 'ja');

export const CONTAINMENT_THRESHOLD = 0.8;

/** Count positional containment, once per short occurrence and longer term.
 * The active sweep is bounded by the overlapping 2/3-gram windows, not all
 * vocabulary pairs. Equal spans are not containment; substring matches alone
 * are never evidence. Aggregate frequencies remain untouched.
 */
export const findContainmentRepresentatives = (
  allTerms: TermStats[], documents: AnalysisDocument[],
): Map<string, Set<string>> => {
  if (!allTerms.some((term) => term.kind === 'phrase')) return new Map();
  const eligible = new Set(allTerms.map((term) => aggregateKey(term.kind, term.term)));
  const totals = new Map<string, number>();
  const covered = new Map<string, Map<string, number>>();
  for (const document of documents) {
    const occurrences = occurrencesForDocument(document)
      .filter((item) => eligible.has(aggregateKey(item.kind, item.term)))
      .sort((a, b) => a.index - b.index || b.end - a.end);
    let active: TermOccurrence[] = [];
    for (const short of occurrences) {
      const key = aggregateKey(short.kind, short.term);
      totals.set(key, (totals.get(key) ?? 0) + 1);
      active = active.filter((long) => long.end > short.index);
      const parents = new Set(active.filter((long) => long.kind === 'phrase' &&
        long.index <= short.index && long.end >= short.end &&
        long.end - long.index > short.end - short.index)
        .map((long) => aggregateKey(long.kind, long.term)));
      const counts = covered.get(key) ?? new Map<string, number>();
      for (const parent of parents) counts.set(parent, (counts.get(parent) ?? 0) + 1);
      if (parents.size) covered.set(key, counts);
      if (short.kind === 'phrase') active.push(short);
    }
  }
  return new Map([...covered].map(([key, counts]) => [key, new Set([...counts]
    .filter(([, count]) => count >= 2 && count / (totals.get(key) ?? Infinity) >= CONTAINMENT_THRESHOLD)
    .map(([parent]) => parent))] as const).filter(([, parents]) => parents.size > 0));
};

export const selectTopTermsDetailed = (
  allTerms: TermStats[], requestedLimit: number, documents: AnalysisDocument[] = [],
  focus: VocabularyFocus = 'all',
): { terms: TermStats[]; suppressedCount: number; filteredCount: number } => {
  const limit = Math.max(0, Math.floor(requestedLimit));
  const { candidates, filteredCount } = selectVocabularyCandidates(allTerms, focus);
  if (limit === 0) return { terms: [], suppressedCount: 0, filteredCount };
  const conversationCount = new Set(documents.map((document) => document.conversation.id)).size;
  const compare = focus === 'topics' ? (left: TermStats, right: TermStats) =>
    vocabularySelectionScore(right, conversationCount) - vocabularySelectionScore(left, conversationCount) ||
    compareTermImportance(left, right) : compareTermImportance;
  const sorted = [...candidates].sort(compare);
  // Only eligible representatives can suppress a content-bearing component.
  const representatives = findContainmentRepresentatives(candidates, documents);
  const primary = sorted.filter((term) => !representatives.has(aggregateKey(term.kind, term.term)));
  const chosen: TermStats[] = [];
  const chosenKeys = new Set<string>();

  const isRepresented = (key: string) => [...(representatives.get(key) ?? [])]
    .some((parent) => chosenKeys.has(parent));

  const tryAdd = (candidate: TermStats): boolean => {
    const key = aggregateKey(candidate.kind, candidate.term);
    if (chosenKeys.has(key) || chosen.length >= limit) return false;
    if (isRepresented(key)) return false;
    if (chosen.some((term) => representatives.get(aggregateKey(term.kind, term.term))?.has(key))) return false;
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
    for (const candidate of primary) {
      if (candidate.biasLabel !== label) continue;
      if (tryAdd(candidate)) added += 1;
      if (added >= quota) break;
    }
  }

  // If a candidate's representative was not selected, it can still fill a
  // vacant slot. Suppression is reported only against a displayed candidate.
  for (const candidate of [...primary, ...sorted]) {
    if (chosen.length >= limit) break;
    tryAdd(candidate);
  }

  return { terms: chosen.sort(compare), filteredCount,
    suppressedCount: sorted.filter((term) => isRepresented(aggregateKey(term.kind, term.term))).length };
};

export const selectTopTerms = (
  allTerms: TermStats[], requestedLimit: number, documents: AnalysisDocument[] = [],
): TermStats[] => selectTopTermsDetailed(allTerms, requestedLimit, documents).terms;
