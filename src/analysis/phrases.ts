import { canonicalizeTerm, containsCjk, type SurfaceToken } from './tokenize';

export interface PhraseDocument {
  messageId: string;
  conversationId: string;
  text: string;
  tokens: SurfaceToken[];
}

export interface PhraseOccurrence extends SurfaceToken {
  kind: 'phrase';
  tokenCount: 2 | 3;
  association: number;
}

export interface PhraseExtractionResult {
  byMessage: Map<string, PhraseOccurrence[]>;
  documentFrequency: Map<string, number>;
}

export interface PhraseExtractionOptions {
  minimumDocumentFrequency?: number;
  minimumAssociation?: number;
  maximumCandidates?: number;
}

interface CandidateOccurrence {
  messageId: string;
  conversationId: string;
  term: string;
  surface: string;
  index: number;
  end: number;
  tokenCount: 2 | 3;
}

interface CandidateAggregate {
  occurrences: CandidateOccurrence[];
  messages: Set<string>;
  conversations: Set<string>;
  componentTerms: string[];
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

  return {
    messageId: document.messageId,
    conversationId: document.conversationId,
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
  let storedOccurrenceCount = 0;
  const maximumStoredOccurrences = Math.max(10_000, maximumCandidates * 25);

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
            occurrences: [],
            messages: new Set(),
            conversations: new Set(),
            componentTerms: document.tokens
              .slice(start, start + size)
              .map((token) => token.term),
          };
          candidates.set(key, aggregate);
        }
        if (!seenInMessage.has(key)) {
          if (storedOccurrenceCount < maximumStoredOccurrences) {
            aggregate.occurrences.push(occurrence);
            storedOccurrenceCount += 1;
          }
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

  const orderedCandidates = [...candidates.entries()].sort(([left], [right]) => left.localeCompare(right, 'ja'));
  for (const [, aggregate] of orderedCandidates) {
    const messageDf = aggregate.messages.size;
    if (messageDf < minimumDocumentFrequency) continue;
    if (requireMultipleConversations && aggregate.conversations.size < 2) continue;
    const componentDfs = aggregate.componentTerms.map((term) => wordDocumentFrequency.get(term) ?? 0);
    const association = normalizedPmi(messageDf, componentDfs, documentCount);
    if (association < minimumAssociation) continue;

    const phraseTerm = aggregate.occurrences[0]?.term;
    if (!phraseTerm) continue;
    documentFrequency.set(phraseTerm, messageDf);
    for (const occurrence of aggregate.occurrences) {
      const list = byMessage.get(occurrence.messageId) ?? [];
      list.push({
        term: occurrence.term,
        surface: occurrence.surface,
        index: occurrence.index,
        end: occurrence.end,
        kind: 'phrase',
        tokenCount: occurrence.tokenCount,
        association,
      });
      byMessage.set(occurrence.messageId, list);
    }
  }

  for (const occurrences of byMessage.values()) {
    occurrences.sort((left, right) =>
      left.index - right.index || right.tokenCount - left.tokenCount || left.term.localeCompare(right.term, 'ja'));
  }

  return { byMessage, documentFrequency };
};
