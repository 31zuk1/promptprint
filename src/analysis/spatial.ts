import type { DatasetSummary, LaidOutTerm } from '../domain/models';

export interface SpatialPoint {
  term: LaidOutTerm;
  /** -1 = user, +1 = assistant. Insufficient comparisons stay at 0. */
  x: number;
  /** Role-balanced message incidence, on the fixed 0..1 scale. */
  y: number;
  /** Fraction of selected conversations containing the term, on the fixed 0..1 scale. */
  z: number;
  incidence: number;
  coverage: number;
  comparisonAvailable: boolean;
}

export interface Camera {
  yaw: number;
  pitch: number;
  zoom: number;
}

export const DEFAULT_CAMERA: Readonly<Camera> = Object.freeze({ yaw: -28, pitch: 20, zoom: 1 });
const MAX_ZOOM = 1.2;
const DEGREES = Math.PI / 180;

const bounded = (value: number, minimum: number, maximum: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
const fraction = (value: number): number => bounded(value, 0, 1, 0);
const positive = (value: number): boolean => Number.isFinite(value) && value > 0;

export const clampCamera = (camera: Camera): Camera => ({
  yaw: bounded(camera.yaw, -65, 65, DEFAULT_CAMERA.yaw),
  pitch: bounded(camera.pitch, 0, 60, DEFAULT_CAMERA.pitch),
  zoom: bounded(camera.zoom, 0.8, MAX_ZOOM, DEFAULT_CAMERA.zoom),
});

/** One point per already-selected term. No re-ranking, jitter, data-dependent
 * normalization, or collision displacement changes the underlying statistics. */
export const createSpatialPoints = (terms: LaidOutTerm[], summary: DatasetSummary): SpatialPoint[] =>
  terms.map((term): SpatialPoint => {
    const userAvailable = positive(term.userMessageCount);
    const assistantAvailable = positive(term.assistantMessageCount);
    const comparisonAvailable = userAvailable && assistantAvailable && term.biasLabel !== 'insufficient';
    const userRate = userAvailable ? fraction(term.rateUser) : 0;
    const assistantRate = assistantAvailable ? fraction(term.rateAssistant) : 0;
    const incidence = userAvailable && assistantAvailable
      ? (userRate + assistantRate) / 2 : userRate + assistantRate;
    const coverage = positive(summary.conversationCount)
      ? fraction(term.conversationCoverage / summary.conversationCount) : 0;
    const bias = bounded(term.bias, -1, 1, 0);
    return { term, x: comparisonAvailable && bias !== 0 ? -bias : 0,
      y: incidence, z: coverage, incidence, coverage, comparisonAvailable };
  }).sort((left, right) => {
    const leftKey = `${left.term.kind}\u0000${left.term.term}`;
    const rightKey = `${right.term.kind}\u0000${right.term.term}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

export interface WorldPoint { x: number; y: number; z: number }
export interface ProjectedPoint { x: number; y: number; depth: number }

const rotate = (point: WorldPoint, camera: Camera): ProjectedPoint => {
  const yaw = camera.yaw * DEGREES;
  const pitch = camera.pitch * DEGREES;
  const worldX = bounded(point.x, -1, 1, 0);
  const worldY = 2 * (fraction(point.y) - 0.5);
  const worldZ = 2 * (fraction(point.z) - 0.5);
  const x = worldX * Math.cos(yaw) + worldZ * Math.sin(yaw);
  const yawDepth = -worldX * Math.sin(yaw) + worldZ * Math.cos(yaw);
  return { x, y: worldY * Math.cos(pitch) - yawDepth * Math.sin(pitch),
    depth: worldY * Math.sin(pitch) + yawDepth * Math.cos(pitch) };
};

/** Orthographic projection: positive depth is nearer the viewer. All eight fixed
 * metric-cube corners determine fit, never the current terms or their extrema.
 * Maximum zoom still fits the cube; lower zoom only increases whitespace. */
export const projectPoint = (
  point: WorldPoint,
  camera: Camera,
  width: number,
  height: number,
): ProjectedPoint => {
  const safeCamera = clampCamera(camera);
  const safeWidth = positive(width) ? width : 1100;
  const safeHeight = positive(height) ? height : 620;
  // Normal viewports retain 80/40 px label clearance. Tiny hosts reduce clearance
  // rather than creating a negative scale; the UI can enforce its own minimum size.
  const padding = Math.min(safeWidth <= 620 ? 40 : 80, safeWidth / 4, safeHeight / 4);
  let maximumX = 0;
  let maximumY = 0;
  for (const x of [-1, 1]) {
    for (const y of [0, 1]) {
      for (const z of [0, 1]) {
        const corner = rotate({ x, y, z }, safeCamera);
        maximumX = Math.max(maximumX, Math.abs(corner.x));
        maximumY = Math.max(maximumY, Math.abs(corner.y));
      }
    }
  }
  const fit = Math.min((safeWidth - 2 * padding) / (2 * maximumX),
    (safeHeight - 2 * padding) / (2 * maximumY));
  const scale = fit * safeCamera.zoom / MAX_ZOOM;
  const rotated = rotate(point, safeCamera);
  return { x: safeWidth / 2 + rotated.x * scale, y: safeHeight / 2 - rotated.y * scale,
    depth: rotated.depth };
};
