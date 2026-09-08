import type { BiasLabel, LaidOutTerm, TermStats } from '../domain/models';
import { colorForBias } from './colors';
import { layoutTerms } from './layout';

const SIDES: BiasLabel[] = ['user', 'shared', 'assistant'];

const byImportance = (left: TermStats, right: TermStats): number =>
  right.importance - left.importance ||
  right.conversationCoverage - left.conversationCoverage ||
  right.rawFrequency - left.rawFrequency ||
  left.term.localeCompare(right.term, 'ja');

const selectBalancedTerms = (terms: TermStats[], limit: number): TermStats[] => {
  const cappedLimit = Math.min(Math.max(0, Math.floor(limit)), terms.length);
  const quota = Math.floor(cappedLimit / SIDES.length);
  const selected: TermStats[] = [];
  const selectedTerms = new Set<string>();

  for (const side of SIDES) {
    const candidates = terms.filter((term) => term.biasLabel === side).sort(byImportance);
    for (const term of candidates.slice(0, quota)) {
      selected.push(term);
      selectedTerms.add(term.term);
    }
  }

  for (const term of [...terms].sort(byImportance)) {
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
 * unused slots are filled by global importance. The existing deterministic
 * layout engine then places the selected terms with a dedicated signature.
 */
export const createOverviewLayout = (
  terms: TermStats[],
  limit = 24,
  signature = 'overview',
): LaidOutTerm[] => {
  if (limit <= 0 || terms.length === 0) return [];
  const selected = selectBalancedTerms(terms, limit);
  return layoutTerms(selected, `${signature}:${selected.length}`);
};

const MOBILE_BANDS: Record<BiasLabel, { min: number; max: number }> = {
  user: { min: 8, max: 128 },
  shared: { min: 132, max: 258 },
  assistant: { min: 262, max: 382 },
};
const MOBILE_Y_SLOTS: Record<BiasLabel, number[]> = {
  user: [125, 240, 180, 355, 295, 470, 410, 530],
  shared: [105, 215, 160, 330, 270, 445, 385, 510],
  assistant: [135, 250, 190, 365, 305, 480, 420, 540],
};
const MOBILE_X_OFFSETS = [-6, 7, 1, 9, -8, 5, -3, 7];

const mobileMeasure = (display: string, fontSize: number) => {
  const units = [...display].reduce((sum, character) => sum + ((character.codePointAt(0) ?? 128) <= 127 ? 0.58 : 1), 0);
  return {
    width: Math.min(108, units * fontSize + 8),
    height: Math.max(44, fontSize * 1.2 + 8),
  };
};

/**
 * A compact 390 × 620 layout for the first mobile view. It preserves three
 * semantic x bands, varies type by importance, and uses staggered slots rather
 * than shrinking the desktop canvas into unreadable microtext.
 */
export const createMobileOverviewLayout = (terms: TermStats[], limit = 24): LaidOutTerm[] => {
  const selected = selectBalancedTerms(terms, limit);
  const groups = new Map(SIDES.map((side) => [side, selected.filter((term) => term.biasLabel === side).sort(byImportance)]));

  return SIDES.flatMap((side) => {
    const group = groups.get(side) ?? [];
    return group.map((term, index) => {
      const lengthUnits = Math.max(1, [...term.display].length);
      const rankSize = Math.max(13, 22 - index * 1.25);
      const fontSize = Math.min(rankSize, Math.max(13, 102 / (lengthUnits * 0.9)));
      const measured = mobileMeasure(term.display, fontSize);
      const band = MOBILE_BANDS[side];
      const semanticX = 195 - term.bias * 145 + (MOBILE_X_OFFSETS[index] ?? 0);
      const x = Math.max(band.min + measured.width / 2, Math.min(band.max - measured.width / 2, semanticX));
      return {
        ...term,
        x,
        y: MOBILE_Y_SLOTS[side][index] ?? 526,
        fontSize,
        width: measured.width,
        height: measured.height,
        color: colorForBias(term.bias),
      };
    });
  });
};
