import type { LaidOutTerm, TermStats } from '../domain/models';
import { colorForBias } from './colors';
import { containsCjk } from './tokenize';

export const CLOUD_WIDTH = 1100;
export const CLOUD_HEIGHT = 620;
export const CLOUD_PADDING = 18;

export interface LayoutResult {
  layout: LaidOutTerm[];
  omitted: TermStats[];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const stableHash = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const characterWidth = (character: string): number => {
  if (/\s/u.test(character)) return 0.32;
  if (containsCjk(character) || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character)) return 1;
  if (/[A-Z0-9]/u.test(character)) return 0.64;
  return 0.56;
};

const measureTerm = (display: string, fontSize: number): Pick<Box, 'width' | 'height'> => {
  const emWidth = [...display].reduce((sum, character) => sum + characterWidth(character), 0);
  return {
    // Includes collision breathing room. Actual rendered glyphs sit inside this box.
    width: Math.min(CLOUD_WIDTH - CLOUD_PADDING * 2, emWidth * fontSize + 14),
    height: fontSize * 1.18 + 10,
  };
};

const boxesCollide = (left: Box, right: Box): boolean =>
  Math.abs(left.x - right.x) < (left.width + right.width) / 2 &&
  Math.abs(left.y - right.y) < (left.height + right.height) / 2;

export const laidOutTermsOverlap = (left: LaidOutTerm, right: LaidOutTerm): boolean =>
  boxesCollide(left, right);

export const isTermWithinBounds = (term: LaidOutTerm): boolean =>
  term.x - term.width / 2 >= CLOUD_PADDING - 0.01 &&
  term.x + term.width / 2 <= CLOUD_WIDTH - CLOUD_PADDING + 0.01 &&
  term.y - term.height / 2 >= CLOUD_PADDING - 0.01 &&
  term.y + term.height / 2 <= CLOUD_HEIGHT - CLOUD_PADDING + 0.01;

const quantile = (orderedValues: number[], fraction: number): number => {
  if (orderedValues.length === 0) return 0;
  const position = (orderedValues.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = orderedValues[lowerIndex] ?? 0;
  const upper = orderedValues[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
};

const createFontSizeMapper = (terms: TermStats[]): ((term: TermStats) => number) => {
  const values = terms.map((term) => Math.log1p(Math.max(0, term.importance))).sort((a, b) => a - b);
  const low = quantile(values, 0.08);
  const high = quantile(values, 0.92);
  const minimum = terms.length > 95 ? 13 : terms.length > 70 ? 14 : terms.length > 45 ? 15 : 16;
  const maximum = terms.length > 95 ? 38 : terms.length > 70 ? 46 : terms.length > 45 ? 54 : 62;
  const exponent = terms.length > 95 ? 2 : terms.length > 70 ? 1.55 : terms.length > 45 ? 1.3 : 1.1;

  return (term: TermStats): number => {
    if (Math.abs(high - low) < 1e-9) return (minimum + maximum) / 2;
    const normalized = Math.max(0, Math.min(1, (Math.log1p(Math.max(0, term.importance)) - low) / (high - low)));
    return Math.round((minimum + (maximum - minimum) * normalized ** exponent) * 10) / 10;
  };
};

const round = (value: number): number => Math.round(value * 100) / 100;

const tryPlace = (
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  phase: number,
  placed: LaidOutTerm[],
): Pick<Box, 'x' | 'y'> | null => {
  const minX = CLOUD_PADDING + width / 2;
  const maxX = CLOUD_WIDTH - CLOUD_PADDING - width / 2;
  const minY = CLOUD_PADDING + height / 2;
  const maxY = CLOUD_HEIGHT - CLOUD_PADDING - height / 2;
  if (minX > maxX || minY > maxY) return null;

  for (let attempt = 0; attempt < 7_000; attempt += 1) {
    const radius = attempt === 0 ? 0 : 5.8 * Math.sqrt(attempt);
    const angle = phase + attempt * 2.399963229728653;
    const x = targetX + Math.cos(angle) * radius * 1.25;
    const y = targetY + Math.sin(angle) * radius * 0.82;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    const box = { x, y, width, height };
    if (placed.every((term) => !boxesCollide(box, term))) return { x, y };
  }

  // Dense 80/120-term views can leave small rectangular gaps that a spiral
  // skips. An exhaustive deterministic lattice finds the nearest usable gap.
  let best: { x: number; y: number; score: number } | null = null;
  const gridStep = 6;
  const xPhase = (Math.floor(phase * 1_000) % gridStep + gridStep) % gridStep;
  const yPhase = (Math.floor(phase * 10_000) % gridStep + gridStep) % gridStep;
  for (let y = minY + yPhase; y <= maxY; y += gridStep) {
    for (let x = minX + xPhase; x <= maxX; x += gridStep) {
      const box = { x, y, width, height };
      if (!placed.every((term) => !boxesCollide(box, term))) continue;
      const score = (x - targetX) ** 2 * 1.35 + (y - targetY) ** 2;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
};

/**
 * Coordinates are SVG text centers: render with textAnchor="middle" and
 * dominantBaseline="middle". Width/height are padded collision boxes around x/y.
 */
export const layoutTermsDetailed = (terms: TermStats[], signature = ''): LayoutResult => {
  const fontSizeFor = createFontSizeMapper(terms);
  const ordered = [...terms].sort((left, right) =>
    fontSizeFor(right) - fontSizeFor(left) ||
    right.importance - left.importance ||
    right.rawFrequency - left.rawFrequency ||
    left.term.localeCompare(right.term, 'ja'));
  const placed: LaidOutTerm[] = [];
  const omitted: TermStats[] = [];

  for (const term of ordered) {
    const preferredFontSize = fontSizeFor(term);
    let completed: LaidOutTerm | null = null;
    for (let fontSize = preferredFontSize; fontSize >= 13; fontSize -= 2) {
      const measured = measureTerm(term.display, fontSize);
      const minimumX = CLOUD_PADDING + measured.width / 2;
      const maximumX = CLOUD_WIDTH - CLOUD_PADDING - measured.width / 2;
      const semanticTargetX = CLOUD_WIDTH / 2 - term.bias * (CLOUD_WIDTH / 2 - 90);
      const targetX = Math.max(minimumX, Math.min(maximumX, semanticTargetX));
      const hash = stableHash(`${term.term}\u0000${signature}`);
      const targetY = CLOUD_PADDING + measured.height / 2 +
        ((hash & 0xffff) / 0xffff) *
          (CLOUD_HEIGHT - CLOUD_PADDING * 2 - measured.height);
      const phase = ((hash >>> 16) / 0xffff) * Math.PI * 2;
      const position = tryPlace(targetX, targetY, measured.width, measured.height, phase, placed);
      if (!position) continue;
      completed = {
        ...term,
        x: round(position.x),
        y: round(position.y),
        fontSize: round(fontSize),
        width: round(measured.width),
        height: round(measured.height),
        color: colorForBias(term.bias),
      };
      break;
    }

    if (completed) placed.push(completed);
    else omitted.push(term);
  }

  return { layout: placed, omitted };
};

export const layoutTerms = (terms: TermStats[], signature = ''): LaidOutTerm[] =>
  layoutTermsDetailed(terms, signature).layout;
