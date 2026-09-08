import type { AdoptionCandidate, TermStats } from '../domain/models';
import { occurrencesForDocument, type AnalysisDocument } from './statistics';

interface OrderedDocument {
  document: AnalysisDocument;
  sequence: number;
  timestamp: number | null;
}

export interface AdoptionOptions {
  limit?: number;
  includePhrases?: boolean;
}

const documentTimestamp = (document: AnalysisDocument): number | null =>
  document.message.createdAt ?? document.conversation.createdAt ?? document.conversation.updatedAt;

const orderDocuments = (documents: AnalysisDocument[]): OrderedDocument[] => {
  const items = documents.map((document, sequence) => ({
    document,
    sequence,
    timestamp: documentTimestamp(document),
  }));
  const allHaveTimestamps = items.every((item) => item.timestamp !== null);
  if (!allHaveTimestamps) return items;
  return items.sort((left, right) =>
    (left.timestamp ?? 0) - (right.timestamp ?? 0) || left.sequence - right.sequence);
};

/** Returns conservative temporal candidates; this function makes no causal claim. */
export const findAdoptionCandidates = (
  documents: AnalysisDocument[],
  eligibleTerms: TermStats[],
  options: AdoptionOptions = {},
): AdoptionCandidate[] => {
  const limit = Math.max(0, Math.floor(options.limit ?? 8));
  const includePhrases = options.includePhrases ?? true;
  if (limit === 0 || documents.length === 0) return [];

  const statsByTerm = new Map<string, TermStats>();
  for (const statistic of eligibleTerms) {
    const previous = statsByTerm.get(statistic.term);
    if (!previous || statistic.importance > previous.importance) statsByTerm.set(statistic.term, statistic);
  }
  const eligible = new Set(statsByTerm.keys());
  const ordered = orderDocuments(documents);
  const occurrences = new Map<string, OrderedDocument[]>();

  for (const item of ordered) {
    const termsInDocument = new Set(
      occurrencesForDocument(item.document, includePhrases)
        .map((occurrence) => occurrence.term)
        .filter((term) => eligible.has(term)),
    );
    for (const term of termsInDocument) {
      const termOccurrences = occurrences.get(term) ?? [];
      termOccurrences.push(item);
      occurrences.set(term, termOccurrences);
    }
  }

  const corpusConversationCount = new Set(documents.map((document) => document.conversation.id)).size;
  const requiredLaterConversations = corpusConversationCount >= 2 ? 2 : 1;
  const ranked: Array<AdoptionCandidate & { importance: number }> = [];

  for (const [term, termOccurrences] of occurrences) {
    const first = termOccurrences[0];
    if (!first || first.document.message.role !== 'assistant') continue;
    const laterUserOccurrences = termOccurrences
      .slice(1)
      .filter((item) => item.document.message.role === 'user');
    if (laterUserOccurrences.length < 2) continue;

    const laterConversations = new Set(
      laterUserOccurrences.map((item) => item.document.conversation.id),
    ).size;
    if (laterConversations < requiredLaterConversations) continue;

    const firstUser = laterUserOccurrences[0];
    const statistic = statsByTerm.get(term);
    if (!firstUser || !statistic) continue;
    ranked.push({
      term,
      display: statistic.display,
      assistantFirstAt: first.timestamp,
      userFirstAt: firstUser.timestamp,
      laterUserMessages: laterUserOccurrences.length,
      laterConversations,
      importance: statistic.importance,
    });
  }

  return ranked
    .sort((left, right) =>
      right.laterConversations - left.laterConversations ||
      right.laterUserMessages - left.laterUserMessages ||
      right.importance - left.importance ||
      left.term.localeCompare(right.term, 'ja'))
    .slice(0, limit)
    .map((candidate) => ({
      term: candidate.term,
      display: candidate.display,
      assistantFirstAt: candidate.assistantFirstAt,
      userFirstAt: candidate.userFirstAt,
      laterUserMessages: candidate.laterUserMessages,
      laterConversations: candidate.laterConversations,
    }));
};

export const calculateAdoptionCandidates = findAdoptionCandidates;
