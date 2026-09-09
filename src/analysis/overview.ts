import type { BiasLabel, LaidOutTerm, TermStats, VocabularyFocus } from '../domain/models';
import { layoutTerms, layoutTermsDetailed, type LayoutResult } from './layout';

const SIDES: BiasLabel[] = ['user', 'shared', 'assistant'];

const byImportance = (left: TermStats, right: TermStats): number =>
  right.importance - left.importance ||
  right.conversationCoverage - left.conversationCoverage ||
  right.rawFrequency - left.rawFrequency ||
  left.term.localeCompare(right.term, 'ja');

const selectBalancedTerms = (terms: TermStats[], limit: number, focus: VocabularyFocus): TermStats[] => {
  const cappedLimit = Math.min(Math.max(0, Math.floor(limit)), terms.length);
  const quota = Math.floor(cappedLimit / SIDES.length);
  const selected: TermStats[] = [];
  const selectedTerms = new Set<string>();
  // The overview is a subset of the completed selection, not a new importance-
  // only analysis. Topic salience chooses WHICH words; original importance
  // remains untouched and continues to determine their rendered font sizes.
  const compare = focus === 'topics' ? (left: TermStats, right: TermStats): number =>
    (right.topicEvidence?.score ?? right.importance) - (left.topicEvidence?.score ?? left.importance) ||
    byImportance(left, right) : byImportance;

  for (const side of SIDES) {
    const candidates = terms.filter((term) => term.biasLabel === side).sort(compare);
    for (const term of candidates.slice(0, quota)) {
      selected.push(term);
      selectedTerms.add(term.term);
    }
  }

  for (const term of [...terms].sort(compare)) {
    if (selected.length >= cappedLimit) break;
    if (selectedTerms.has(term.term)) continue;
    selected.push(term);
    selectedTerms.add(term.term);
  }

  return selected;
};

/**
 * Builds a compact but honest overview from the already-filtered term set.
 * A role quota keeps all three semantic regions present where data permits;
 * unused slots follow the completed topic/lexical selection policy. The existing deterministic
 * layout engine then places the selected terms with a dedicated signature.
 */
export const createOverviewLayout = (
  terms: TermStats[],
  limit = 24,
  signature = 'overview',
  focus: VocabularyFocus = 'all',
): LaidOutTerm[] => {
  if (limit <= 0 || terms.length === 0) return [];
  const selected = selectBalancedTerms(terms, limit, focus);
  return layoutTerms(selected, `${signature}:${selected.length}`);
};

/** The overview obeys the very same semantic/collision contract as desktop. */
export const createMobileOverviewLayoutDetailed = (
  terms: TermStats[], limit = 24, height = 620, focus: VocabularyFocus = 'all',
): LayoutResult => {
  const selected = selectBalancedTerms(terms, limit, focus);
  return layoutTermsDetailed(selected, 'mobile-overview', {
    width: 390, height, padding: 8, semanticInset: 50,
    maximumFontSize: 22, minimumBoxHeight: 44,
  });
};

export const createMobileOverviewLayout = (terms: TermStats[], limit = 24, focus: VocabularyFocus = 'all'): LaidOutTerm[] =>
  createMobileOverviewLayoutDetailed(terms, limit, 620, focus).layout;
