import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANALYSIS_SETTINGS,
  type DatasetSummary,
  type LaidOutTerm,
  type NormalizedConversation,
} from '../domain/models';
import { analyzeConversations } from './pipeline';
import {
  clampCamera,
  createSpatialPoints,
  DEFAULT_CAMERA,
  projectPoint,
  type Camera,
  type WorldPoint,
} from './spatial';

const summary = (overrides: Partial<DatasetSummary> = {}): DatasetSummary => ({
  conversationCount: 8, userMessageCount: 100, assistantMessageCount: 10,
  providers: ['demo'], dateStart: null, dateEnd: null, analyzedTermCount: 1, skippedCount: 0,
  ...overrides,
});
const term = (overrides: Partial<LaidOutTerm> = {}): LaidOutTerm => ({
  term: 'signal', display: 'signal', kind: 'word',
  dfUser: 20, dfAssistant: 8, rateUser: 0.2, rateAssistant: 0.8,
  userMessageCount: 100, assistantMessageCount: 10,
  tokenFrequencyUser: 20, tokenFrequencyAssistant: 8,
  tokenTotalUser: 200, tokenTotalAssistant: 80,
  per1000TokensUser: 100, per1000TokensAssistant: 100,
  bias: -0.6, biasLabel: 'assistant', importance: 6,
  conversationCoverage: 2, providerCoverage: ['demo'], rawFrequency: 28,
  x: 800, y: 200, fontSize: 42, width: 180, height: 60, color: '#C2410C',
  ...overrides,
});
const coordinates = (point: WorldPoint): WorldPoint => ({ x: point.x, y: point.y, z: point.z });
const corners: WorldPoint[] = [-1, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => ({ x, y, z }))));

describe('fixed three-axis lexical metrics', () => {
  it('uses negative bias, the equal-role mean incidence, and selected-conversation coverage', () => {
    const point = createSpatialPoints([term()], summary())[0]!;
    expect(point).toMatchObject({ x: 0.6, y: 0.5, z: 0.25,
      incidence: 0.5, coverage: 0.25, comparisonAvailable: true });
    // This is not pooled message incidence: long role imbalance must not weight the axis.
    expect(point.incidence).not.toBe((20 + 8) / (100 + 10));
  });

  it('keeps the 10/100 versus 0/4 regression entirely user-biased at 5% mean incidence', () => {
    const point = createSpatialPoints([term({ dfUser: 10, dfAssistant: 0, rateUser: 0.1, rateAssistant: 0,
      assistantMessageCount: 4, bias: 1, biasLabel: 'user' })], summary({ assistantMessageCount: 4 }))[0]!;
    expect(point).toMatchObject({ x: -1, y: 0.05, comparisonAvailable: true });
  });

  it('places equally observed 10% rates at the exact neutral X and 10% Y', () => {
    const point = createSpatialPoints([term({ dfUser: 10, dfAssistant: 1, rateUser: 0.1,
      rateAssistant: 0.1, bias: 0, biasLabel: 'shared' })], summary())[0]!;
    expect(point.x).toBe(0);
    expect(point.y).toBe(0.1);
    expect(point.comparisonAvailable).toBe(true);
  });

  it.each(['user', 'assistant'] as const)('uses only the observed %s rate when comparison is unavailable', (role) => {
    const user = role === 'user';
    const point = createSpatialPoints([term({
      userMessageCount: user ? 10 : 0, assistantMessageCount: user ? 0 : 10,
      rateUser: user ? 0.3 : 0.99, rateAssistant: user ? 0.99 : 0.3,
      bias: user ? 1 : -1, biasLabel: 'insufficient',
    })], summary())[0]!;
    expect(point).toMatchObject({ x: 0, y: 0.3, incidence: 0.3, comparisonAvailable: false });
  });

  it('handles empty and zero-denominator inputs without invented rates or nonfinite coordinates', () => {
    expect(createSpatialPoints([], summary({ conversationCount: 0 }))).toEqual([]);
    const point = createSpatialPoints([term({ userMessageCount: 0, assistantMessageCount: 0,
      rateUser: 0.8, rateAssistant: 0.9, conversationCoverage: 2 })], summary({ conversationCount: 0 }))[0]!;
    expect(point).toMatchObject({ x: 0, y: 0, z: 0, incidence: 0, coverage: 0, comparisonAvailable: false });
  });

  it('bounds invalid finite/nonfinite values without changing the retained original statistics', () => {
    const source = term({ bias: 9, rateUser: 5, rateAssistant: -2, conversationCoverage: 100 });
    const before = structuredClone(source);
    const point = createSpatialPoints([source], summary())[0]!;
    expect(point).toMatchObject({ x: -1, y: 0.5, z: 1 });
    expect(source).toEqual(before);
    expect(createSpatialPoints([term({ bias: NaN, rateUser: Infinity, rateAssistant: NaN,
      conversationCoverage: Infinity })], summary())[0]).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(createSpatialPoints([term()], summary({ conversationCount: NaN }))[0]?.coverage).toBe(0);
  });

  it('does not use 2D packing coordinates, text width, importance, or font size as any spatial metric', () => {
    const first = term();
    const second = term({ term: 'different-label', display: '別のラベル', x: 0, y: 600,
      fontSize: 13, width: 999, height: 99, importance: 9000 });
    const points = createSpatialPoints([first, second], summary());
    expect(coordinates(points[0]!)).toEqual(coordinates(points[1]!));
    expect(projectPoint(points[0]!, DEFAULT_CAMERA, 1100, 620))
      .toEqual(projectPoint(points[1]!, DEFAULT_CAMERA, 1100, 620));
  });

  it('sorts by stable term-kind/key without mutating the source terms, arrays, or summary', () => {
    const sources = [term({ term: 'zulu' }), term({ term: 'alpha' }), term({ term: 'alpha', kind: 'phrase' })];
    const aggregate = summary();
    const before = structuredClone({ sources, aggregate });
    for (const source of sources) Object.freeze(source);
    Object.freeze(sources);
    Object.freeze(aggregate);
    const points = createSpatialPoints(sources, aggregate);
    expect(points.map((point) => `${point.term.kind}:${point.term.term}`))
      .toEqual(['phrase:alpha', 'word:alpha', 'word:zulu']);
    expect(createSpatialPoints([...sources].reverse(), aggregate)).toEqual(points);
    expect({ sources, aggregate }).toEqual(before);
    expect(points.find((point) => point.term.term === 'zulu')?.term).toBe(sources[0]);
  });

  it('leaves 120 identical metric vectors exactly coincident instead of fabricating separation', () => {
    const sources = Array.from({ length: 120 }, (_, index) => term({ term: `term-${index}` }));
    const points = createSpatialPoints(sources, summary());
    expect(points).toHaveLength(120);
    expect(new Set(points.map((point) => JSON.stringify(coordinates(point)))).size).toBe(1);
    expect(new Set(points.map((point) => JSON.stringify(projectPoint(point, DEFAULT_CAMERA, 390, 500)))).size).toBe(1);
    expect(createSpatialPoints([...sources].reverse(), summary())).toEqual(points);
  });

  it('uses identical fixed coordinates across frames with the same rates and coverage fractions', () => {
    const first = createSpatialPoints([term()], summary())[0]!;
    const second = createSpatialPoints([term({ dfUser: 40, dfAssistant: 16, userMessageCount: 200,
      assistantMessageCount: 20, conversationCoverage: 4, importance: 60 })], summary({ conversationCount: 16 }))[0]!;
    expect(coordinates(second)).toEqual(coordinates(first));
    expect(projectPoint(second, DEFAULT_CAMERA, 1100, 620)).toEqual(projectPoint(first, DEFAULT_CAMERA, 1100, 620));
    const reducedCoverage = createSpatialPoints([term()], summary({ conversationCount: 16 }))[0]!;
    expect(reducedCoverage.z).toBe(0.125);
    expect(reducedCoverage.x).toBe(first.x);
    expect(reducedCoverage.y).toBe(first.y);
  });

  it('includes noise-only selected conversations in the coverage denominator', () => {
    const corpus: NormalizedConversation[] = ['signal', '。', '。'].map((text, index) => ({
      id: `synthetic-${index}`, title: '合成', provider: 'demo', createdAt: null, updatedAt: null,
      messages: [
        { id: `user-${index}`, conversationId: `synthetic-${index}`, provider: 'demo', role: 'user',
          createdAt: null, order: 0, originalText: text, analysisText: text },
        { id: `assistant-${index}`, conversationId: `synthetic-${index}`, provider: 'demo', role: 'assistant',
          createdAt: null, order: 1, originalText: '。', analysisText: '。' },
      ],
    }));
    const result = analyzeConversations(corpus, { ...DEFAULT_ANALYSIS_SETTINGS,
      includePhrases: false, minDocumentFrequency: 1 });
    expect(result.summary.conversationCount).toBe(3);
    const point = createSpatialPoints(result.layout, result.summary)[0]!;
    expect(point).toMatchObject({ x: -1, incidence: 1 / 6, coverage: 1 / 3, z: 1 / 3 });
  });
});

describe('bounded orthographic camera', () => {
  it('clamps each degree/zoom component independently with finite defaults', () => {
    expect(DEFAULT_CAMERA).toEqual({ yaw: -28, pitch: 20, zoom: 1 });
    expect(clampCamera({ yaw: -1000, pitch: 1000, zoom: 1000 })).toEqual({ yaw: -65, pitch: 60, zoom: 1.2 });
    expect(clampCamera({ yaw: 1000, pitch: -1000, zoom: -1000 })).toEqual({ yaw: 65, pitch: 0, zoom: 0.8 });
    expect(clampCamera({ yaw: NaN, pitch: Infinity, zoom: -Infinity })).toEqual(DEFAULT_CAMERA);
    expect(clampCamera(DEFAULT_CAMERA)).toEqual(DEFAULT_CAMERA);
    expect(clampCamera(DEFAULT_CAMERA)).not.toBe(DEFAULT_CAMERA);
  });

  it('centers fixed Y/Z scales and preserves X and upward Y directions without perspective', () => {
    const camera = { yaw: 0, pitch: 0, zoom: 1 };
    const center = projectPoint({ x: 0, y: 0.5, z: 0.5 }, camera, 1100, 620);
    expect(center).toEqual({ x: 550, y: 310, depth: 0 });
    const left = projectPoint({ x: -1, y: 0.5, z: 0.5 }, camera, 1100, 620);
    const right = projectPoint({ x: 1, y: 0.5, z: 0.5 }, camera, 1100, 620);
    expect(left.x).toBeLessThan(center.x);
    expect(right.x).toBeGreaterThan(center.x);
    expect(right.x - center.x).toBeCloseTo((620 - 160) / 2 / 1.2);
    expect(projectPoint({ x: 0, y: 1, z: 0.5 }, camera, 1100, 620).y).toBeLessThan(center.y);
    const front = projectPoint({ x: 0.25, y: 0.7, z: 1 }, camera, 1100, 620);
    const back = projectPoint({ x: 0.25, y: 0.7, z: 0 }, camera, 1100, 620);
    expect(front.x).toBe(back.x);
    expect(front.y).toBe(back.y);
    expect(front.depth).toBe(1);
    expect(back.depth).toBe(-1);
  });

  it.each([[1100, 620], [390, 500], [320, 220], [1440, 1000], [1710, 400], [2200, 900]])(
    'fits all cube corners with label padding at every camera boundary in %d × %d', (width, height) => {
      const padding = width <= 620 ? 40 : 80;
      for (const yaw of [-65, -28, 0, 65]) {
        for (const pitch of [0, 20, 60]) {
          for (const zoom of [0.8, 1, 1.2]) {
            const camera: Camera = { yaw, pitch, zoom };
            for (const point of corners) {
              const projected = projectPoint(point, camera, width, height);
              expect(projected.x).toBeGreaterThanOrEqual(padding - 1e-8);
              expect(projected.x).toBeLessThanOrEqual(width - padding + 1e-8);
              expect(projected.y).toBeGreaterThanOrEqual(padding - 1e-8);
              expect(projected.y).toBeLessThanOrEqual(height - padding + 1e-8);
              expect(Number.isFinite(projected.depth)).toBe(true);
              expect(projectPoint(point, camera, width, height)).toEqual(projected);
            }
          }
        }
      }
    });

  it('uses zoom only as a proportional whitespace adjustment and keeps relative depths unchanged', () => {
    const point = { x: 0.3, y: 0.7, z: 0.2 };
    const low = projectPoint(point, { ...DEFAULT_CAMERA, zoom: 0.8 }, 1100, 620);
    const high = projectPoint(point, { ...DEFAULT_CAMERA, zoom: 1.2 }, 1100, 620);
    expect(high.x - 550).toBeCloseTo((low.x - 550) * 1.5);
    expect(high.y - 310).toBeCloseTo((low.y - 310) * 1.5);
    expect(high.depth).toBe(low.depth);
  });

  it('handles tiny/invalid hosts and nonfinite arguments without mutating the point or camera', () => {
    const point = Object.freeze({ x: 0.25, y: 0.5, z: 0.75 });
    const camera = Object.freeze({ ...DEFAULT_CAMERA });
    const before = { point: { ...point }, camera: { ...camera } };
    for (const corner of corners) {
      const tiny = projectPoint(corner, camera, 20, 10);
      expect(tiny.x).toBeGreaterThanOrEqual(0);
      expect(tiny.x).toBeLessThanOrEqual(20);
      expect(tiny.y).toBeGreaterThanOrEqual(0);
      expect(tiny.y).toBeLessThanOrEqual(10);
    }
    expect(projectPoint(point, camera, NaN, 0)).toEqual(projectPoint(point, camera, 1100, 620));
    const invalid = projectPoint({ x: Infinity, y: NaN, z: -Infinity },
      { yaw: Infinity, pitch: NaN, zoom: NaN }, -1, NaN);
    expect(Object.values(invalid).every(Number.isFinite)).toBe(true);
    expect({ point, camera }).toEqual(before);
  });
});
