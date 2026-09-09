import { projectPoint, type Camera, type ProjectedPoint, type SpatialPoint, type WorldPoint } from './spatial';

export const SPATIAL_FONT_SIZE = 14;
export const SPATIAL_POINT_RADIUS = 5;
export const SPATIAL_READING = 'X＝あなた −1 ↔ AI +1 · Y＝発言出現率 · Z＝会話カバー率（Y・Zは0–100%）';
export const SPATIAL_RATE_READING = 'Yは役割別の発言出現率の均等平均。片役割しかない場合は観測側の率です。Zは現在の対象会話のうち、その語が現れた割合です。';
export const SPATIAL_VIEW_READING = '回転後の画面の左右ではなくX軸を読みます。点・文字の大きさに意味はなく、点間距離は意味の類似度ではありません。';

export interface SpatialLabel {
  term: string; text: string; x: number; y: number; width: number; height: number;
  anchorX: number; anchorY: number;
}
interface Edge { from: ProjectedPoint; to: ProjectedPoint; axis?: 'x' | 'y' | 'z' | undefined }
interface Tick { x: number; y: number; text: string; anchorX: number; anchorY: number }
export interface SpatialScene {
  points: (SpatialPoint & { screen: ProjectedPoint })[];
  labels: SpatialLabel[]; edges: Edge[]; ticks: Tick[];
}

// Reserve a full em even for ASCII: bold W/M are wider than average Latin
// letters. Screen and PNG labels must fit without font-dependent collisions.
const textWidth = (text: string) => Array.from(text).length * SPATIAL_FONT_SIZE + 12;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y;

/** Camera-only presentation. Metric points never move to make room for labels. */
export function createSpatialScene(points: SpatialPoint[], camera: Camera, width: number, height: number, selectedTerm?: string): SpatialScene {
  const project = (point: WorldPoint) => projectPoint(point, camera, width, height);
  const projected = points.map((point) => ({ ...point, screen: project(point) }));
  const edges: Edge[] = [];
  for (const y of [0, 1]) for (const z of [0, 1]) edges.push({ from: project({ x: -1, y, z }), to: project({ x: 1, y, z }), axis: y === 0 && z === 0 ? 'x' : undefined });
  for (const x of [-1, 1]) for (const z of [0, 1]) edges.push({ from: project({ x, y: 0, z }), to: project({ x, y: 1, z }), axis: x === -1 && z === 0 ? 'y' : undefined });
  for (const x of [-1, 1]) for (const y of [0, 1]) edges.push({ from: project({ x, y, z: 0 }), to: project({ x, y, z: 1 }), axis: x === -1 && y === 0 ? 'z' : undefined });
  const ticks: Tick[] = [];
  const reserved: { x: number; y: number; width: number; height: number }[] = [];
  const tick = (point: WorldPoint, text: string, dx: number, dy: number, required = false) => {
    const screen = project(point);
    const length = textWidth(text);
    const x = Math.max(length / 2 + 4, Math.min(width - length / 2 - 4, screen.x + dx));
    for (const offset of required ? [0, -28, 28, -56, 56, -84, 84] : [0]) {
      const y = Math.max(16, Math.min(height - 12, screen.y + dy + offset));
      const box = { x: x - length / 2, y: y - 10, width: length, height: 20 };
      if (!reserved.some((other) => overlap(box, other))) {
        ticks.push({ x, y, text, anchorX: screen.x, anchorY: screen.y }); reserved.push(box); break;
      }
    }
  };
  tick({ x: 1, y: 0, z: 0 }, 'X +1', 0, 24, true);
  tick({ x: -1, y: 1, z: 0 }, 'Y 100%', 0, -20, true);
  tick({ x: -1, y: 0, z: 1 }, 'Z 100%', 0, 25, true);
  tick({ x: -1, y: 0, z: 0 }, '−1 / 0%', 0, 25);
  tick({ x: 0, y: 0, z: 0 }, '0', 0, 24);
  tick({ x: -1, y: .5, z: 0 }, '50%', -26, 0);
  tick({ x: -1, y: 0, z: .5 }, '50%', -22, 14);

  const labels: SpatialLabel[] = [];
  const priority = [...projected].sort((a, b) => Number(b.term.term === selectedTerm) - Number(a.term.term === selectedTerm) || b.term.importance - a.term.importance || (a.term.term < b.term.term ? -1 : 1));
  const limit = width <= 620 ? 10 : 28;
  for (const point of priority) {
    if (labels.length >= limit) break;
    const chars = Array.from(point.term.display);
    const text = chars.length > 14 ? `${chars.slice(0, 13).join('')}…` : point.term.display;
    const labelWidth = textWidth(text);
    const labelHeight = 24;
    const anchorX = point.screen.x;
    const anchorY = point.screen.y;
    const candidates = [0, -30, 30, -60, 60, -90, 90].flatMap((dy) => [
      { x: anchorX + 12, y: anchorY - labelHeight / 2 + dy },
      { x: anchorX - labelWidth - 12, y: anchorY - labelHeight / 2 + dy },
    ]);
    for (const candidate of candidates) {
      const box = { ...candidate, width: labelWidth, height: labelHeight };
      if (box.x < 8 || box.y < 8 || box.x + box.width > width - 8 || box.y + box.height > height - 8) continue;
      if (reserved.some((other) => overlap(box, other))) continue;
      if (projected.some((other) => overlap(box, { x: other.screen.x - 6, y: other.screen.y - 6, width: 12, height: 12 }))) continue;
      labels.push({ ...box, term: point.term.term, text, anchorX, anchorY }); reserved.push(box); break;
    }
  }
  return { points: projected.sort((a, b) => a.screen.depth - b.screen.depth), labels, edges, ticks };
}
