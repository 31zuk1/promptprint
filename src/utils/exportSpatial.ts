import type { Camera, SpatialPoint } from '../analysis/spatial';
import { createSpatialScene, SPATIAL_FONT_SIZE, SPATIAL_POINT_RADIUS } from '../analysis/spatialScene';

// The same orthographic scene as the screen, fitted to a fixed PNG viewBox.
// This transform is uniform: no change to metric positions, aspect or depth.
const PLOT_SCALE = 1.4;
const PLOT_X = 330;
const PLOT_Y = 246;
const PLOT_WIDTH = 1100;
const PLOT_HEIGHT = 620;
const PAPER = '#faf9f7';
const INSUFFICIENT = '#77747b';

/** Draws aggregate statistics only; no context, title or account fields enter
 * this renderer. Label omission never removes or displaces a metric point.
 * Pointer/selection highlighting is intentionally absent from a saved image.
 */
export function drawSpatialExport(
  context: CanvasRenderingContext2D,
  points: SpatialPoint[],
  camera: Camera,
): number {
  const scene = createSpatialScene(points, camera, PLOT_WIDTH, PLOT_HEIGHT);
  context.save();
  context.translate(PLOT_X, PLOT_Y);
  context.scale(PLOT_SCALE, PLOT_SCALE);
  context.setLineDash([]);
  context.lineCap = 'round';

  for (const edge of scene.edges) {
    context.strokeStyle = edge.axis ? '#77747b' : '#d8d4d0';
    context.lineWidth = edge.axis ? 1.4 : 1;
    context.beginPath();
    context.moveTo(edge.from.x, edge.from.y);
    context.lineTo(edge.to.x, edge.to.y);
    context.stroke();
  }
  context.font = `600 ${SPATIAL_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#625e66';
  for (const tick of scene.ticks) {
    context.strokeStyle = '#d8d4d0';
    context.lineWidth = .8;
    context.beginPath();
    context.moveTo(tick.anchorX, tick.anchorY);
    context.lineTo(tick.x, tick.y - Math.sign(tick.y - tick.anchorY) * 10);
    context.stroke();
    context.fillText(tick.text, tick.x, tick.y);
  }

  // Painter order comes from the shared scene. Equal-position points remain
  // coincident, including all-one-side and same-statistic stress fixtures.
  for (const point of scene.points) {
    context.fillStyle = point.comparisonAvailable ? point.term.color : INSUFFICIENT;
    context.strokeStyle = PAPER;
    context.lineWidth = 1;
    context.beginPath();
    if (point.comparisonAvailable) {
      context.arc(point.screen.x, point.screen.y, SPATIAL_POINT_RADIUS, 0, Math.PI * 2);
    } else {
      context.rect(point.screen.x - SPATIAL_POINT_RADIUS, point.screen.y - SPATIAL_POINT_RADIUS,
        SPATIAL_POINT_RADIUS * 2, SPATIAL_POINT_RADIUS * 2);
    }
    context.fill();
    context.stroke();
  }

  const colors = new Map(points.map((point) => [point.term.term,
    point.comparisonAvailable ? point.term.color : INSUFFICIENT]));
  context.font = `600 ${SPATIAL_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  for (const label of scene.labels) {
    const centerY = label.y + label.height / 2;
    context.strokeStyle = '#aaa5a0';
    context.lineWidth = .8;
    context.beginPath();
    context.moveTo(label.anchorX, label.anchorY);
    context.lineTo(Math.max(label.x, Math.min(label.x + label.width, label.anchorX)), centerY);
    context.stroke();
    context.beginPath();
    context.roundRect(label.x, label.y, label.width, label.height, 4);
    context.fillStyle = PAPER;
    context.fill();
    context.fillStyle = colors.get(label.term) ?? '#17151c';
    context.fillText(label.text, label.x + label.width / 2, centerY, label.width - 8);
  }
  if (!scene.points.length) {
    context.fillStyle = '#625e66';
    context.fillText('この条件では表示できる語がありません', PLOT_WIDTH / 2, PLOT_HEIGHT / 2, PLOT_WIDTH - 160);
  }
  context.restore();
  return scene.labels.length;
}
