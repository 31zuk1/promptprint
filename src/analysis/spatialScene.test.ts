import { describe, expect, it } from 'vitest';
import type { LaidOutTerm } from '../domain/models';
import { DEFAULT_CAMERA, projectPoint, type Camera, type SpatialPoint } from './spatial';
import { createSpatialScene, SPATIAL_FONT_SIZE, SPATIAL_POINT_RADIUS } from './spatialScene';

const point = (key: string, x = 0, y = 0.5, z = 0.5, importance = 1, display = key): SpatialPoint => {
  const term: LaidOutTerm = {
    term: key, display, kind: 'word', dfUser: 1, dfAssistant: 1, rateUser: y, rateAssistant: y,
    userMessageCount: 10, assistantMessageCount: 10, tokenFrequencyUser: 1, tokenFrequencyAssistant: 1,
    tokenTotalUser: 10, tokenTotalAssistant: 10, per1000TokensUser: 100, per1000TokensAssistant: 100,
    bias: -x, biasLabel: x < 0 ? 'user' : x > 0 ? 'assistant' : 'shared', importance,
    conversationCoverage: 1, providerCoverage: ['demo'], rawFrequency: 2,
    x: 550, y: 300, fontSize: 42, width: 100, height: 60, color: '#7C3AED',
  };
  return { term, x, y, z, incidence: y, coverage: z, comparisonAvailable: true };
};
interface Box { x: number; y: number; width: number; height: number }
const separated = (a: Box, b: Box, gap = 4): boolean =>
  a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x ||
  a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;

describe('shared screen/PNG spatial scene', () => {
  it('is deterministic, keeps original metrics and objects unchanged, and projects each point exactly', () => {
    const points = [point('alpha', -1, 0.1, 0.2), point('bravo', 1, 0.4, 0.8), point('shared', 0, 1, 1)];
    const camera = { ...DEFAULT_CAMERA };
    const before = structuredClone({ points, camera });
    for (const source of points) { Object.freeze(source.term); Object.freeze(source); }
    Object.freeze(points);
    Object.freeze(camera);
    const scene = createSpatialScene(points, camera, 1100, 540, 'bravo');
    expect(createSpatialScene(points, camera, 1100, 540, 'bravo')).toEqual(scene);
    expect({ points, camera }).toEqual(before);
    expect(scene.points.map((item) => item.screen.depth))
      .toEqual(scene.points.map((item) => item.screen.depth).sort((a, b) => a - b));
    for (const projected of scene.points) {
      const original = points.find((source) => source.term.term === projected.term.term)!;
      expect(projected.term).toBe(original.term);
      expect(projected.screen).toEqual(projectPoint(original, camera, 1100, 540));
      expect({ x: projected.x, y: projected.y, z: projected.z })
        .toEqual({ x: original.x, y: original.y, z: original.z });
    }
    expect(SPATIAL_POINT_RADIUS).toBe(5);
    expect(SPATIAL_FONT_SIZE).toBe(14);
  });

  it.each([[320, 420], [390, 500], [1100, 540]])(
    'retains all 120 coincident points at %d × %d and gives the selected low-importance term first label priority',
    (width, height) => {
      const points = Array.from({ length: 120 }, (_, index) => point(`word${index}`, 0, .5, .5, 120 - index));
      const scene = createSpatialScene(points, DEFAULT_CAMERA, width, height, 'word119');
      expect(scene.points).toHaveLength(120);
      expect(new Set(scene.points.map((item) => item.term.term)).size).toBe(120);
      expect(new Set(scene.points.map((item) => JSON.stringify(item.screen))).size).toBe(1);
      expect(scene.labels[0]?.term).toBe('word119');
      expect(scene.labels.length).toBeGreaterThan(0);
      expect(scene.labels.length).toBeLessThan(120);
      expect(scene.labels.length).toBeLessThanOrEqual(width <= 620 ? 10 : 28);
      expect(scene.points.every((item) => item.screen.x === scene.points[0]!.screen.x &&
        item.screen.y === scene.points[0]!.screen.y)).toBe(true);
    });

  it.each([0, 1, 7, 8])('renders %d sparse points without inventing marks or removing the reference cube', (count) => {
    const points = Array.from({ length: count }, (_, index) => point(`sparse${index}`, index % 2 ? 1 : -1,
      Math.floor(index / 2) % 2, Math.floor(index / 4) % 2));
    const scene = createSpatialScene(points, DEFAULT_CAMERA, 1100, 540);
    expect(scene.points).toHaveLength(count);
    expect(scene.labels.length).toBeLessThanOrEqual(count);
    expect(scene.edges).toHaveLength(12);
    expect(scene.edges.filter((edge) => edge.axis).map((edge) => edge.axis).sort()).toEqual(['x', 'y', 'z']);
    expect(scene.ticks.length).toBeGreaterThan(0);
    if (!count) expect(scene.labels).toEqual([]);
  });

  it('truncates only long Japanese presentation labels and retains full source identity/display', () => {
    const long = '会話の文脈に含まれる非常に長い日本語の複合表現';
    const source = point('long-japanese', 0, .5, .5, 0, long);
    const scene = createSpatialScene([source], DEFAULT_CAMERA, 1100, 540, source.term.term);
    expect(scene.labels).toHaveLength(1);
    expect(scene.labels[0]).toMatchObject({ term: 'long-japanese', text: `${Array.from(long).slice(0, 13).join('')}…` });
    expect(Array.from(scene.labels[0]!.text)).toHaveLength(14);
    expect(scene.points[0]?.term.display).toBe(long);
    expect(source.term.display).toBe(long);
  });

  it('does not split surrogate pairs when shortening a presentation label', () => {
    const long = '𠮷'.repeat(20);
    const source = point('unicode-label', 0, .5, .5, 1, long);
    const scene = createSpatialScene([source], DEFAULT_CAMERA, 1100, 540);
    expect(scene.labels[0]?.text).toBe(`${'𠮷'.repeat(13)}…`);
    expect(scene.points[0]?.term.display).toBe(long);
  });

  it.each([[320, 320], [390, 320], [390, 500], [1100, 540]])(
    'retains all three named axes at every extreme camera in %d × %d', (width, height) => {
      for (const yaw of [-65, 0, 65]) for (const pitch of [0, 60]) for (const zoom of [0.8, 1.2]) {
        const camera = { yaw, pitch, zoom };
        const scene = createSpatialScene([], camera, width, height);
        expect(scene.ticks.map((tick) => tick.text)).toEqual(expect.arrayContaining(['X +1', 'Y 100%', 'Z 100%']));
        for (const [name, source] of [
          ['X +1', { x: 1, y: 0, z: 0 }],
          ['Y 100%', { x: -1, y: 1, z: 0 }],
          ['Z 100%', { x: -1, y: 0, z: 1 }],
        ] as const) {
          const tick = scene.ticks.find((item) => item.text === name)!;
          const expected = projectPoint(source, camera, width, height);
          expect(tick.anchorX).toBe(expected.x);
          expect(tick.anchorY).toBe(expected.y);
          expect(tick.x).toBeGreaterThan(0);
          expect(tick.x).toBeLessThan(width);
          expect(tick.y).toBeGreaterThan(0);
          expect(tick.y).toBeLessThan(height);
        }
      }
    });

  it.each([[320, 420], [390, 500], [1100, 540]])(
    'keeps visible labels bounded, mutually separated, and clear of every point at camera extremes in %d × %d',
    (width, height) => {
      const points = Array.from({ length: 120 }, (_, index) => point(`語彙${index}`,
        ((index * 31) % 121) / 60 - 1, ((index * 17) % 121) / 120, ((index * 13) % 121) / 120, index));
      const cameras: Camera[] = [-65, -28, 65].flatMap((yaw) => [0, 20, 60]
        .flatMap((pitch) => [0.8, 1.2].map((zoom) => ({ yaw, pitch, zoom }))));
      for (const camera of cameras) {
        const scene = createSpatialScene(points, camera, width, height, '語彙0');
        expect(scene.points).toHaveLength(points.length);
        for (const [index, label] of scene.labels.entries()) {
          expect(label.x).toBeGreaterThanOrEqual(8);
          expect(label.y).toBeGreaterThanOrEqual(8);
          expect(label.x + label.width).toBeLessThanOrEqual(width - 8);
          expect(label.y + label.height).toBeLessThanOrEqual(height - 8);
          expect(label.height).toBe(24);
          for (const other of scene.labels.slice(index + 1)) expect(separated(label, other)).toBe(true);
          for (const other of scene.points) {
            expect(separated(label, { x: other.screen.x - 6, y: other.screen.y - 6, width: 12, height: 12 })).toBe(true);
          }
          const source = scene.points.find((item) => item.term.term === label.term)!;
          expect(label.anchorX).toBe(source.screen.x);
          expect(label.anchorY).toBe(source.screen.y);
        }
        expect(createSpatialScene(points, camera, width, height, '語彙0')).toEqual(scene);
      }
    });
});
