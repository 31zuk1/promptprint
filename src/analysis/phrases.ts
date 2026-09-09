import { canonicalizeTerm, containsCjk, isStopword, type SurfaceToken } from './tokenize';

export interface PhraseDocument {
  messageId: string;
  conversationId: string;
  text: string;
  tokens: SurfaceToken[];
}

export interface PhraseOccurrence extends SurfaceToken {
  kind: 'phrase';
  tokenCount: number;
  association: number;
}

export interface PhraseExtractionResult {
  byMessage: Map<string, PhraseOccurrence[]>;
  documentFrequency: Map<string, number>;
  limited: boolean;
  /** Bounded candidate discovery may omit whole families. Every returned
   * family still has complete frequencies and occurrence spans. */
  selection?: {
    candidateCapacityReached: boolean;
    examinedFamilies: number;
    supportedFamilies: number;
    retainedFamilies: number;
    omittedSupportedFamilies: number;
    retainedOccurrences: number;
  };
}

export interface PhraseExtractionOptions {
  minimumDocumentFrequency?: number;
  minimumAssociation?: number;
  maximumCandidates?: number;
  maximumOccurrences?: number;
}

interface CandidateOccurrence {
  term: string;
  surface: string;
  index: number;
  end: number;
  tokenCount: 2 | 3;
}

interface CandidateAggregate {
  messages: Set<string>;
  conversations: Set<string>;
  componentTerms: string[];
  /** All occurrences are unspaced compounds, not accidental word lists. */
  contiguous: boolean;
}

const phraseSeparatorIsValid = (separator: string): boolean =>
  separator === '' || /^\s+$/u.test(separator);

const joinPhrasePart = (left: string, right: string, separator: string): string => {
  if (separator === '' && (containsCjk(left) || containsCjk(right))) return `${left}${right}`;
  return `${left} ${right}`;
};

const createCandidate = (
  document: PhraseDocument,
  start: number,
  size: 2 | 3,
): CandidateOccurrence | null => {
  const parts = document.tokens.slice(start, start + size);
  if (parts.length !== size) return null;
  if (parts.some((part) => isStopword(part.term))) return null;

  let term = parts[0]?.term ?? '';
  let surface = parts[0]?.surface ?? '';
  for (let index = 1; index < parts.length; index += 1) {
    const previous = parts[index - 1];
    const current = parts[index];
    if (!previous || !current) return null;
    const separator = document.text.slice(previous.end, current.index);
    if (!phraseSeparatorIsValid(separator)) return null;
    term = joinPhrasePart(term, current.term, separator);
    surface = joinPhrasePart(surface, current.surface, separator);
  }

  if (new Set(parts.map((part) => part.term)).size === 1) return null;
  const first = parts[0];
  const last = parts.at(-1);
  if (!first || !last) return null;
  // Defensive contract for alternate tokenizers: a split stopword must not be
  // reconstructed as a phrase, even when its individual fragments look valid.
  if (isStopword(document.text.slice(first.index, last.end))) return null;

  return {
    term: canonicalizeTerm(term),
    surface,
    index: first.index,
    end: last.end,
    tokenCount: size,
  };
};

const normalizedPmi = (
  phraseDf: number,
  componentDfs: number[],
  documentCount: number,
): number => {
  const phraseProbability = phraseDf / documentCount;
  if (phraseProbability >= 1) return 1;
  const independentProbability = componentDfs
    .map((frequency) => Math.max(frequency / documentCount, Number.EPSILON))
    .reduce((product, probability) => product * probability, 1);
  const pmi = Math.log(phraseProbability / independentProbability);
  const denominator = -Math.log(phraseProbability);
  return Math.max(-1, Math.min(1, pmi / denominator));
};

/** Extracts only repeated, associated bigrams/trigrams; it never mutates word tokens. */
export const extractPhrases = (
  documents: PhraseDocument[],
  options: PhraseExtractionOptions = {},
): PhraseExtractionResult => {
  const documentCount = Math.max(1, documents.length);
  const minimumDocumentFrequency = Math.max(
    2,
    options.minimumDocumentFrequency ?? (documents.length >= 500 ? 3 : 2),
  );
  const minimumAssociation = options.minimumAssociation ?? 0.12;
  const maximumCandidates = Math.max(100, options.maximumCandidates ?? 20_000);
  const wordDocumentFrequency = new Map<string, number>();

  for (const document of documents) {
    for (const term of new Set(document.tokens.map((token) => token.term))) {
      wordDocumentFrequency.set(term, (wordDocumentFrequency.get(term) ?? 0) + 1);
    }
  }

  const candidates = new Map<string, CandidateAggregate>();
  let candidateDocumentCount = 0;
  const maximumStoredOccurrences = Math.max(1, options.maximumOccurrences ?? 500_000);
  const limitedResult = (): PhraseExtractionResult => ({
    byMessage: new Map(), documentFrequency: new Map(), limited: true,
  });

  for (const document of documents) {
    const seenInMessage = new Set<string>();
    const tokenLimit = Math.min(document.tokens.length, 5_000);
    for (let start = 0; start < tokenLimit; start += 1) {
      for (const size of [2, 3] as const) {
        const occurrence = createCandidate(document, start, size);
        if (!occurrence) continue;
        const key = `${size}\u0000${occurrence.term}`;
        let aggregate = candidates.get(key);
        if (!aggregate) {
          if (candidates.size >= maximumCandidates) continue;
          aggregate = {
            messages: new Set(),
            conversations: new Set(),
            componentTerms: document.tokens
              .slice(start, start + size)
              .map((token) => token.term),
            contiguous: !/\s/u.test(document.text.slice(occurrence.index, occurrence.end)),
          };
          candidates.set(key, aggregate);
        }
        aggregate.contiguous &&= !/\s/u.test(document.text.slice(occurrence.index, occurrence.end));
        if (!seenInMessage.has(key)) {
          candidateDocumentCount += 1;
          if (candidateDocumentCount > maximumStoredOccurrences) return limitedResult();
          aggregate.messages.add(document.messageId);
          aggregate.conversations.add(document.conversationId);
        }
        seenInMessage.add(key);
      }
    }
  }

  const requireMultipleConversations = new Set(documents.map((document) => document.conversationId)).size >= 4;
  const byMessage = new Map<string, PhraseOccurrence[]>();
  const documentFrequency = new Map<string, number>();
  const accepted = new Map<string, number>();

  const orderedCandidates = [...candidates.entries()].sort(([left], [right]) => left.localeCompare(right, 'ja'));
  for (const [key, aggregate] of orderedCandidates) {
    const messageDf = aggregate.messages.size;
    if (messageDf < minimumDocumentFrequency) continue;
    // A focused thread may be the only place a real compound appears. Require
    // three distinct messages and literal adjacency for this exception; spaced
    // word lists still need support from multiple conversations.
    if (requireMultipleConversations && aggregate.conversations.size < 2 &&
      !(aggregate.contiguous && messageDf >= 3)) continue;
    const componentDfs = aggregate.componentTerms.map((term) => wordDocumentFrequency.get(term) ?? 0);
    const association = normalizedPmi(messageDf, componentDfs, documentCount);
    if (association < minimumAssociation) continue;

    accepted.set(key, association);
  }

  // Candidate discovery is bounded, but frequencies for retained candidates
  // cover the COMPLETE prepared token stream, including repeats in a message.
  // Never return partial phrase counts if the occurrence budget is exceeded.
  let storedOccurrenceCount = 0;
  for (const document of documents) {
    const seen = new Set<string>();
    const list: PhraseOccurrence[] = [];
    for (let start = 0; start < document.tokens.length && accepted.size; start += 1) {
      for (const size of [2, 3] as const) {
        const occurrence = createCandidate(document, start, size);
        if (!occurrence) continue;
        const association = accepted.get(`${size}\u0000${occurrence.term}`);
        if (association === undefined) continue;
        storedOccurrenceCount += 1;
        if (storedOccurrenceCount > maximumStoredOccurrences) return limitedResult();
        list.push({ ...occurrence, kind: 'phrase', association });
        seen.add(occurrence.term);
      }
    }
    if (list.length) byMessage.set(document.messageId, list);
    for (const term of seen) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  for (const occurrences of byMessage.values()) {
    occurrences.sort((left, right) =>
      left.index - right.index || right.tokenCount - left.tokenCount || left.term.localeCompare(right.term, 'ja'));
  }

  return { byMessage, documentFrequency, limited: false };
};
