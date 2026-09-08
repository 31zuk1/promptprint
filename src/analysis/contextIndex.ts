import type { TermContext, TermStats } from '../domain/models';
import type { AnalysisDocument, TermOccurrence } from './statistics';
import { occurrencesForDocument } from './statistics';

export interface ContextIndexOptions {
  maximumPerTerm?: number;
  excerptLength?: number;
}

interface Match {
  index: number;
  end: number;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const findMatches = (source: string, surfaces: string[]): Match[] => {
  const matches: Match[] = [];
  const seen = new Set<string>();
  for (const surface of surfaces) {
    if (!surface) continue;
    const parts = surface.trim().split(/\s+/u).filter(Boolean);
    if (parts.length === 0) continue;
    const pattern = parts.map(escapeRegExp).join('\\s+');
    let matcher: RegExp;
    try {
      matcher = new RegExp(pattern, 'giu');
    } catch {
      continue;
    }
    for (const match of source.matchAll(matcher)) {
      if (match.index === undefined) continue;
      const key = `${match.index}:${match[0].length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ index: match.index, end: match.index + match[0].length });
    }
  }
  return matches.sort((left, right) => left.index - right.index || left.end - right.end);
};

const excerptAround = (
  source: string,
  match: Match,
  maximumLength: number,
): Pick<TermContext, 'excerpt' | 'matchStart' | 'matchEnd'> => {
  const matchLength = match.end - match.index;
  const remaining = Math.max(0, maximumLength - matchLength);
  let start = Math.max(0, match.index - Math.floor(remaining * 0.45));
  let end = Math.min(source.length, match.end + Math.ceil(remaining * 0.55));
  if (end - start < maximumLength) {
    start = Math.max(0, end - maximumLength);
    end = Math.min(source.length, start + maximumLength);
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < source.length ? '…' : '';
  return {
    excerpt: `${prefix}${source.slice(start, end)}${suffix}`,
    matchStart: prefix.length + match.index - start,
    matchEnd: prefix.length + match.end - start,
  };
};

const matchingOccurrences = (
  document: AnalysisDocument,
  statistic: TermStats,
): TermOccurrence[] => occurrencesForDocument(document, true).filter((occurrence) =>
  occurrence.term === statistic.term && occurrence.kind === statistic.kind);

export const buildContextIndex = (
  terms: TermStats[],
  documents: AnalysisDocument[],
  options: ContextIndexOptions = {},
): Record<string, TermContext[]> => {
  const maximumPerTerm = Math.max(1, Math.floor(options.maximumPerTerm ?? 20));
  const excerptLength = Math.max(80, Math.floor(options.excerptLength ?? 190));
  const contexts: Record<string, TermContext[]> = {};

  for (const term of terms) {
    const termContexts: TermContext[] = [];
    for (const document of documents) {
      if (termContexts.length >= maximumPerTerm) break;
      const occurrences = matchingOccurrences(document, term);
      if (occurrences.length === 0) continue;
      // NFKC preserves the source wording while making full-width variants searchable.
      const source = document.message.originalText.normalize('NFKC').slice(0, 200_000);
      const surfaces = [
        ...new Set([
          ...occurrences.map((occurrence) => occurrence.surface),
          term.display,
          term.term,
        ]),
      ];
      const matches = findMatches(source, surfaces).slice(0, 2);
      for (const [occurrenceIndex, match] of matches.entries()) {
        if (termContexts.length >= maximumPerTerm) break;
        const excerpt = excerptAround(source, match, excerptLength);
        termContexts.push({
          id: `${term.kind}:${term.term}:${document.message.id}:${occurrenceIndex}`,
          term: term.term,
          conversationId: document.conversation.id,
          conversationTitle: document.conversation.title,
          provider: document.message.provider,
          role: document.message.role,
          createdAt: document.message.createdAt,
          ...excerpt,
        });
      }
    }
    contexts[term.term] = termContexts;
  }

  return contexts;
};

export const createContextIndex = buildContextIndex;

