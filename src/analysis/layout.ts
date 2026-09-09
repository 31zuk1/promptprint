import type { LaidOutTerm, TermStats } from '../domain/models';
import { colorForBias } from './colors';
import { containsCjk } from './tokenize';

export const CLOUD_WIDTH = 1100;
export const CLOUD_HEIGHT = 620;
export const CLOUD_PADDING = 18;

export interface LayoutOptions {
  width?: number;
  height?: number;
  padding?: number;
  semanticInset?: number;
  maximumFontSize?: number;
  minimumBoxHeight?: number;
}

// Maximum displacement is 5.5% of the canvas, never an unrestricted fallback.
export const MAX_X_DRIFT_RATIO = 0.055;
export const semanticTargetX = (bias: number, width = CLOUD_WIDTH, inset = 90): number =>
  width / 2 - bias * (width / 2 - inset);

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
  if (/[MWmw@%]/u.test(character)) return 1;
  if (/[A-Z0-9]/u.test(character)) return 0.72;
  return 0.56;
};

const measureTerm = (display: string, fontSize: number): Pick<Box, 'width' | 'height'> => {
  const emWidth = [...display].reduce((sum, character) => sum + characterWidth(character), 0);
  return {
    // Includes collision breathing room. Actual rendered glyphs sit inside this box.
    width: emWidth * fontSize + 14,
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
  term: TermStats,
  targetY: number,
  width: number,
  height: number,
  placed: LaidOutTerm[],
  options: Required<LayoutOptions>,
  packingOffset: number,
): Pick<Box, 'x' | 'y'> | null => {
  const center = options.width / 2;
  const targetX = semanticTargetX(term.bias, options.width, options.semanticInset);
  const drift = options.width * MAX_X_DRIFT_RATIO;
  const preferredX = targetX + packingOffset * drift;
  // The entire padded word, not just its center, must stay on its own side.
  const minX = Math.max(options.padding + width / 2, targetX - drift,
    term.biasLabel === 'assistant' ? center + 4 + width / 2 : -Infinity);
  const maxX = Math.min(options.width - options.padding - width / 2, targetX + drift,
    term.biasLabel === 'user' ? center - 4 - width / 2 : Infinity);
  const minY = options.padding + height / 2;
  const maxY = options.height - options.padding - height / 2;
  if (minX > maxX || minY > maxY) return null;
  const xs = [minX, maxX, Math.max(minX, Math.min(maxX, preferredX))];
  for (let offset = 6; offset <= drift; offset += 6) xs.push(targetX - offset, targetX + offset);
  // Contact edges are useful in dense layouts and avoid grid-dependent gaps.
  for (const other of placed) {
    xs.push(other.x - (width + other.width) / 2 - 0.05,
      other.x + (width + other.width) / 2 + 0.05);
  }
  xs.sort((a, b) => Math.abs(a - preferredX) - Math.abs(b - preferredX) || a - b);
  for (const x of new Set(xs)) {
    if (x < minX || x > maxX) continue;
    const intervals = placed
      .filter((other) => Math.abs(x - other.x) < (width + other.width) / 2 + 0.02)
      .map((other) => [other.y - (height + other.height) / 2 - 0.05,
        other.y + (height + other.height) / 2 + 0.05] as const)
      .sort((a, b) => a[0] - b[0]);
    let cursor = minY;
    let bestY: number | null = null;
    const consider = (low: number, high: number) => {
      if (low > high) return;
      const y = Math.max(low, Math.min(high, targetY));
      if (bestY === null || Math.abs(y - targetY) < Math.abs(bestY - targetY)) bestY = y;
    };
    for (const [low, high] of intervals) {
      if (high < cursor) continue;
      consider(cursor, Math.min(low, maxY));
      cursor = Math.max(cursor, high);
      if (cursor > maxY) break;
    }
    consider(cursor, maxY);
    // Every free Y interval is exhausted before any horizontal displacement.
    if (bestY !== null) return { x, y: bestY };
  }
  return null;
};

/**
 * Coordinates are SVG text centers: render with textAnchor="middle" and
 * dominantBaseline="middle". Width/height are padded collision boxes around x/y.
 */
export const layoutTermsDetailed = (
  terms: TermStats[], signature = '', configuration: LayoutOptions = {},
): LayoutResult => {
  const options: Required<LayoutOptions> = {
    width: CLOUD_WIDTH, height: CLOUD_HEIGHT, padding: CLOUD_PADDING,
    semanticInset: 90, maximumFontSize: 62, minimumBoxHeight: 0, ...configuration,
  };
  const mapFontSize = createFontSizeMapper(terms);
  const fontSizeFor = (term: TermStats) => Math.min(options.maximumFontSize, mapFontSize(term));
  const ordered = [...terms].sort((left, right) =>
    fontSizeFor(right) - fontSizeFor(left) ||
    right.importance - left.importance ||
    right.rawFrequency - left.rawFrequency ||
    left.term.localeCompare(right.term, 'ja'));
  let best: LayoutResult = { layout: [], omitted: ordered };
  for (const scale of [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]) {
    for (const packingOffset of [0, -0.9, 0.9]) {
      const placed: LaidOutTerm[] = [];
      const omitted: TermStats[] = [];
      for (const term of ordered) {
        // One scale for the whole cloud, with a common legibility floor.
        const fontSize = Math.max(13, fontSizeFor(term) * scale);
        const measured = measureTerm(term.display, fontSize);
        measured.height = Math.max(options.minimumBoxHeight, measured.height);
        const hash = stableHash(`${term.term}\u0000${signature}`);
        const targetY = options.padding + measured.height / 2 +
          ((hash & 0xffff) / 0xffff) *
            (options.height - options.padding * 2 - measured.height);
        // A crowded center column can prevent two narrower columns fitting.
        // Deterministic whole-cloud edge-anchor retries remain INSIDE the same
        // strict semantic interval; each still exhausts Y before moving X.
        const position = tryPlace(term, targetY, measured.width, measured.height, placed, options, packingOffset);
        if (!position) { omitted.push(term); continue; }
        placed.push({
          ...term,
          x: round(position.x),
          y: round(position.y),
          fontSize: round(fontSize),
          width: round(measured.width),
          height: round(measured.height),
          color: term.biasLabel === 'insufficient' ? '#69656B' : colorForBias(term.bias),
        });
      }
      if (placed.length > best.layout.length) best = { layout: placed, omitted };
      if (omitted.length === 0) return best;
    }
  }
  return best;
};

export const layoutTerms = (terms: TermStats[], signature = ''): LaidOutTerm[] =>
  layoutTermsDetailed(terms, signature).layout;
