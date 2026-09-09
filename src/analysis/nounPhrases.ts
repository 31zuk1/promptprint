import { canonicalizeTerm, type SurfaceToken } from './tokenize';
import type { PhraseDocument, PhraseExtractionResult, PhraseOccurrence } from './phrases';

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
// Productive nominal endings, not a topic dictionary. A complete 回答+率 or
// 利用+者+数 can be a subject even when no atom qualifies on its own. Discourse
// endings such as 等 / など / 的 / さ deliberately cannot create eligibility.
const NOMINAL_DERIVATIONS = new Set(['率', '性', '者', '書', '数', '量', '度', '法', '論',
  '学', '権', '税', '費', '額', '価', '値', '型', '系', '器', '計', '機', '症', '病', '制']);

export const NOUN_PHRASE_LIMITS = {
  japaneseAtoms: 6,
  englishAtoms: 4,
  codeUnits: 40,
  candidates: 100_000,
  occurrences: 500_000,
  sketchWidth: 524_288,
} as const;

export interface NounPhraseOptions {
  maximumCandidates?: number;
  maximumOccurrences?: number;
}

const derivedNominal = (parts: SurfaceToken[]): boolean => {
  const stem = parts.filter((part) => !part.prefix && !part.suffix);
  const suffixes = parts.filter((part) => part.suffix);
  return stem.length === 1 && suffixes.length > 0 && Boolean(parts.at(-1)?.suffix) &&
    suffixes.every((part) => NOMINAL_DERIVATIONS.has(part.term));
};

const makeNounPhrase = (document: PhraseDocument, start: number, size: number): PhraseOccurrence | null => {
  const parts = document.tokens.slice(start, start + size);
  if (parts.length !== size || parts.some((part) => !part.noun)) return null;
  const first = parts[0]!;
  const last = parts.at(-1)!;
  if (first.suffix || last.prefix || last.adjective) return null;
  if (last.end - first.index > NOUN_PHRASE_LIMITS.codeUnits) return null;
  const japanese = parts.some((part) => JAPANESE.test(part.surface));
  if (!japanese && size > NOUN_PHRASE_LIMITS.englishAtoms) return null;
  if (!parts.some((part) => part.topicEligible) && !(japanese && derivedNominal(parts))) return null;
  for (let index = 1; index < parts.length; index += 1) {
    const left = parts[index - 1]!;
    const right = parts[index]!;
    const separator = document.text.slice(left.end, right.index);
    // Script-adjacent Japanese compounds are allowed, whitespace lists are not.
    // English modifiers/heads may have horizontal whitespace but never cross a
    // newline, punctuation, removed grammar, code, or a hidden source span.
    if (separator !== '' && (!/^[ \t]+$/u.test(separator) || japanese)) return null;
  }
  if (new Set(parts.map((part) => part.term)).size === 1) return null;
  const surface = document.text.slice(first.index, last.end);
  return { term: canonicalizeTerm(surface), surface, index: first.index, end: last.end,
    tokenCount: size, kind: 'phrase', association: 1, topicEligible: true, noun: true };
};

function* candidatesForDocument(document: PhraseDocument): Generator<PhraseOccurrence> {
  for (let start = 0; start < document.tokens.length; start += 1) {
    if (!document.tokens[start]?.noun || document.tokens[start]?.suffix) continue;
    for (let size = 2; size <= NOUN_PHRASE_LIMITS.japaneseAtoms; size += 1) {
      const phrase = makeNounPhrase(document, start, size);
      if (phrase) yield phrase;
    }
  }
}

const limit = (requested: number | undefined, fallback: number): number =>
  requested === undefined || !Number.isFinite(requested) ? fallback : Math.max(0, Math.floor(requested));

/** Fixed 6 MiB Count-Min sketch. Hash collisions can affect candidate admission
 * only, never published counts. Per-message sets keep repeated boilerplate in
 * one answer from acquiring artificial cross-message support. */
class CandidateSupportSketch {
  private readonly width = NOUN_PHRASE_LIMITS.sketchWidth;
  private readonly counters = new Uint32Array(this.width * 3);

  private indexes(term: string): [number, number, number] {
    let hash = 2166136261;
    for (let index = 0; index < term.length; index += 1) hash = Math.imul(hash ^ term.charCodeAt(index), 16777619);
    const mix = (value: number): number => {
      let mixed = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
      mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
      return mixed ^ (mixed >>> 16);
    };
    const mask = this.width - 1;
    return [hash & mask, this.width + (mix(hash ^ 0x9e3779b9) & mask),
      2 * this.width + (mix(hash ^ 0x27d4eb2d) & mask)];
  }

  add(term: string): void {
    for (const index of this.indexes(term)) this.counters[index] = Math.min(0xffffffff, this.counters[index]! + 1);
  }

  estimate(term: string): number {
    return Math.min(...this.indexes(term).map((index) => this.counters[index]!));
  }
}

interface CandidateKey { term: string; support: number }
// Negative means left is better. The worst retained entry sits at heap[0].
const candidatePriority = (left: CandidateKey, right: CandidateKey): number =>
  right.support - left.support || right.term.length - left.term.length ||
  (left.term < right.term ? -1 : left.term > right.term ? 1 : 0);

class BoundedCandidates {
  readonly keys = new Set<string>();
  readonly heap: CandidateKey[] = [];
  capacityReached = false;
  constructor(private readonly capacity: number) {}

  offer(candidate: CandidateKey): void {
    if (this.keys.has(candidate.term)) return;
    if (this.heap.length < this.capacity) {
      this.heap.push(candidate);
      this.keys.add(candidate.term);
      let child = this.heap.length - 1;
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2);
        if (candidatePriority(this.heap[child]!, this.heap[parent]!) <= 0) break;
        [this.heap[child], this.heap[parent]] = [this.heap[parent]!, this.heap[child]!];
        child = parent;
      }
      return;
    }
    this.capacityReached = true;
    if (!this.capacity || candidatePriority(candidate, this.heap[0]!) >= 0) return;
    this.keys.delete(this.heap[0]!.term);
    this.heap[0] = candidate;
    this.keys.add(candidate.term);
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      if (left >= this.heap.length) break;
      const right = left + 1;
      const child = right < this.heap.length && candidatePriority(this.heap[right]!, this.heap[left]!) > 0 ? right : left;
      if (candidatePriority(this.heap[child]!, this.heap[parent]!) <= 0) break;
      [this.heap[child], this.heap[parent]] = [this.heap[parent]!, this.heap[child]!];
      parent = child;
    }
  }
}

interface ExactFamily { term: string; messageDf: number; occurrences: number; atoms: number }

/** Bounded discovery followed by exact replay, never all-or-nothing fallback:
 * 1. Sketch cross-message support without retaining singleton strings.
 * 2. Deterministically admit the strongest bounded set of candidate keys.
 * 3. Recount their FULL message DF and occurrence totals; discard actual DF<2.
 * 4. Select whole families that fit the position budget, then replay every
 *    position of those families. Longer complete compounds win equal-DF ties.
 * Approximation is confined to candidate selection. Returned statistics are
 * exact over the complete prepared corpus, including repeated message uses.
 */
export const extractNounPhrases = (
  documents: PhraseDocument[], options: NounPhraseOptions = {},
): PhraseExtractionResult => {
  const maximumCandidates = limit(options.maximumCandidates, NOUN_PHRASE_LIMITS.candidates);
  const maximumOccurrences = limit(options.maximumOccurrences, NOUN_PHRASE_LIMITS.occurrences);
  // Group alternate callers' message pieces too, so document frequency is
  // independent of duplicate IDs and piece ordering. Production IDs are unique.
  const groups = new Map<string, PhraseDocument[]>();
  for (const document of documents) {
    const group = groups.get(document.messageId);
    if (group) group.push(document);
    else groups.set(document.messageId, [document]);
  }
  const sketch = new CandidateSupportSketch();
  for (const group of groups.values()) {
    const seen = new Set<string>();
    for (const document of group) for (const phrase of candidatesForDocument(document)) seen.add(phrase.term);
    for (const term of seen) sketch.add(term);
  }
  const candidates = new BoundedCandidates(maximumCandidates);
  for (const document of documents) {
    for (const phrase of candidatesForDocument(document)) {
      if (candidates.keys.has(phrase.term)) continue;
      const support = sketch.estimate(phrase.term);
      if (support >= 2) candidates.offer({ term: phrase.term, support });
    }
  }
  const exact = new Map<string, ExactFamily>();
  for (const group of groups.values()) {
    const seen = new Set<string>();
    for (const document of group) {
      for (const phrase of candidatesForDocument(document)) {
        if (!candidates.keys.has(phrase.term)) continue;
        let family = exact.get(phrase.term);
        if (!family) {
          family = { term: phrase.term, messageDf: 0, occurrences: 0, atoms: 0 };
          exact.set(phrase.term, family);
        }
        family.occurrences += 1;
        family.atoms = Math.max(family.atoms, phrase.tokenCount);
        if (!seen.has(phrase.term)) family.messageDf += 1;
        seen.add(phrase.term);
      }
    }
  }
  const supported = [...exact.values()].filter((family) => family.messageDf >= 2)
    .sort((left, right) => right.messageDf - left.messageDf || right.atoms - left.atoms ||
      right.term.length - left.term.length || left.occurrences - right.occurrences ||
      (left.term < right.term ? -1 : left.term > right.term ? 1 : 0));
  const retained = new Set<string>();
  let positions = 0;
  for (const family of supported) {
    if (positions + family.occurrences > maximumOccurrences) continue;
    retained.add(family.term);
    positions += family.occurrences;
  }
  const byMessage = new Map<string, PhraseOccurrence[]>();
  const documentFrequency = new Map<string, number>();
  for (const family of supported) if (retained.has(family.term)) documentFrequency.set(family.term, family.messageDf);
  for (const document of documents) {
    if (!retained.size) break;
    const list: PhraseOccurrence[] = [];
    for (const phrase of candidatesForDocument(document)) {
      if (retained.has(phrase.term)) list.push(phrase);
    }
    if (list.length) {
      // Prepared message identities are unique. Merging also keeps DF correct
      // for alternate callers that supply several pieces of the same message.
      const existing = byMessage.get(document.messageId);
      if (existing) existing.push(...list);
      else byMessage.set(document.messageId, list);
    }
  }
  for (const list of byMessage.values()) {
    list.sort((left, right) => left.index - right.index || right.tokenCount - left.tokenCount ||
      left.term.localeCompare(right.term, 'ja'));
  }
  const selection = { candidateCapacityReached: candidates.capacityReached,
    examinedFamilies: candidates.keys.size, supportedFamilies: supported.length,
    retainedFamilies: retained.size, omittedSupportedFamilies: supported.length - retained.size,
    retainedOccurrences: positions };
  return { byMessage, documentFrequency,
    limited: selection.candidateCapacityReached || selection.omittedSupportedFamilies > 0, selection };
};
