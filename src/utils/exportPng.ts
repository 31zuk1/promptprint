import type { AnalysisResult } from '../domain/models';
import { CLOUD_READING, datasetScopeLabel, MESSAGE_RATE_READING, privateDatasetScopeLabel, QUOTA_READING, selectedPeriodLabel, TIMELINE_READING, vocabularySelectionLabel } from '../analysis/presentation';
import { clampCamera, createSpatialPoints, DEFAULT_CAMERA, type Camera } from '../analysis/spatial';
import { drawSpatialExport } from './exportSpatial';

const W = 2200;
const H = 1340;
const SCALE_X = 1.76;
const SCALE_Y = 1.23;
const activeObjectUrls = new Set<string>();

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

const drawPaperGrain = (context: CanvasRenderingContext2D) => {
  const tile = document.createElement('canvas');
  tile.width = 160;
  tile.height = 160;
  const tileContext = tile.getContext('2d');
  if (!tileContext) return;

  const pixels = tileContext.createImageData(tile.width, tile.height);
  let state = 17;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const visible = random() > .5;
    pixels.data[offset] = 23;
    pixels.data[offset + 1] = 21;
    pixels.data[offset + 2] = 28;
    pixels.data[offset + 3] = visible ? Math.round(5 + random() * 7) : 0;
  }
  tileContext.putImageData(pixels, 0, 0);
  const pattern = context.createPattern(tile, 'repeat');
  if (!pattern) return;
  context.save();
  context.fillStyle = pattern;
  context.fillRect(0, 0, W, H);
  context.restore();
};

const aborted = (): DOMException => new DOMException('PNGの生成を中止しました。', 'AbortError');

export interface PngExportOptions {
  /** No arbitrary strings: identities, titles and source text cannot enter this option. */
  privateSource?: { partial: boolean };
  view?: 'mirror' | 'spatial';
  camera?: Camera;
}

export const createPromptprintPng = (result: AnalysisResult, signal?: AbortSignal, options: PngExportOptions = {}): Promise<Blob> => {
  if (signal?.aborted) return Promise.reject(aborted());
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像を書き出せるブラウザ機能を利用できません。');
  const spatial = options.view === 'spatial';
  const camera = clampCamera(options.camera ?? DEFAULT_CAMERA);

  context.fillStyle = '#fcfaf6';
  context.fillRect(0, 0, W, H);

  const gradient = context.createLinearGradient(120, 250, 2080, 1120);
  gradient.addColorStop(0, '#edf5ff');
  gradient.addColorStop(0.48, '#f7f2ff');
  gradient.addColorStop(1, '#fff0e7');
  roundedRect(context, 120, 240, 1960, 880, 36);
  // A left-to-right wash would imply screen-X still represents role after a
  // camera turn. Spatial mode keeps the established paper/grain, without it.
  context.fillStyle = spatial ? '#faf9f7' : gradient;
  context.fill();
  context.strokeStyle = '#cbc3b8';
  context.lineWidth = 2;
  context.stroke();

  drawPaperGrain(context);

  context.fillStyle = '#17151c';
  context.font = '800 62px system-ui, -apple-system, sans-serif';
  context.fillText('Promptprint', 126, 126);
  context.font = '400 29px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#625e66';
  context.fillText('AIとの会話から、言葉の指紋を見る。', 126, 194);
  context.font = '400 20px system-ui, -apple-system, sans-serif';
  context.fillText(vocabularySelectionLabel(result.display), 126, 226, 1300);
  if (spatial || result.timeline?.appliedRange) {
    context.textAlign = 'right';
    context.font = '600 26px system-ui, -apple-system, sans-serif';
    context.fillText(`表示期間 ${selectedPeriodLabel(result)}（日本時間）`, 2070, 126, 1200);
    context.font = '400 22px system-ui, -apple-system, sans-serif';
    context.fillText(spatial
      ? `3D · 正投影 · 水平 ${camera.yaw.toFixed(1)}° / 仰角 ${camera.pitch.toFixed(1)}° / 拡大 ${camera.zoom.toFixed(2)}倍`
      : TIMELINE_READING, 2070, 194, 1200);
    context.textAlign = 'left';
  }

  let spatialLabelCount = 0;
  if (spatial) {
    spatialLabelCount = drawSpatialExport(context, createSpatialPoints(result.layout, result.summary), camera);
  } else {
    context.font = '700 25px system-ui, -apple-system, sans-serif';
    context.fillStyle = '#2563eb';
    context.fillText('あなた ←', 190, 312);
    context.textAlign = 'center';
    context.fillStyle = '#7c3aed';
    context.fillText(result.summary.userMessageCount && result.summary.assistantMessageCount ? '共有語彙' : '比較材料不足', W / 2, 312);
    context.textAlign = 'right';
    context.fillStyle = '#c2410c';
    context.fillText('→ AI', 2010, 312);
    context.textAlign = 'left';

    context.strokeStyle = 'rgba(23, 21, 28, .18)';
    context.lineWidth = 2;
    context.setLineDash([8, 12]);
    context.beginPath();
    context.moveTo(W / 2, 340);
    context.lineTo(W / 2, 1050);
    context.stroke();
    context.setLineDash([]);

    for (const term of result.layout) {
      // Font geometry cannot grow faster than the vertical coordinate scale.
      // Using 1.75 here previously made collision-free SVG words overlap in PNG.
      context.font = `700 ${term.fontSize * Math.min(SCALE_X, SCALE_Y)}px system-ui, -apple-system, sans-serif`;
      context.fillStyle = term.color;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(term.display, 132 + term.x * SCALE_X, 320 + term.y * SCALE_Y,
        (term.width - 14) * Math.min(SCALE_X, SCALE_Y));
    }
  }

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = '600 23px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#17151c';
  const summary = result.summary;
  const scopeLabel = options.privateSource ? privateDatasetScopeLabel(summary, options.privateSource.partial) : datasetScopeLabel(summary, result.timeline?.sourceProviders);
  context.fillText(spatial
    ? `${scopeLabel} · ${summary.userMessageCount + summary.assistantMessageCount}発言 · 点 ${result.layout.length}語 · 文字ラベル省略 ${result.layout.length - spatialLabelCount}語 · 2D配置による省略 ${result.display.layoutOmittedCount}語`
    : `${scopeLabel} · ${summary.userMessageCount + summary.assistantMessageCount}発言 · 表示 ${result.layout.length}語 · 配置のため省略 ${result.display.layoutOmittedCount}語`, 130, 1165, 1940);
  context.font = '400 22px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#6f6962';
  if (spatial) {
    context.fillText('X＝相対的な使用傾向（−1 あなた / 0 均衡 / +1 AI）。回転後の画面左右ではなく、X軸を読みます。', 130, 1200, 1940);
    context.fillText('Y＝役割別の発言出現率の均等平均（片役割は観測側のみ）。Z＝選択期間の会話カバー率。各率は0〜100%固定。', 130, 1235, 1940);
    context.fillText('点と文字は一定サイズ。近接は語の意味の類似を示しません。表示語数の比率は元データの比率ではありません。', 130, 1270, 1940);
  } else {
    context.fillText(CLOUD_READING, 130, 1200);
    context.fillText(MESSAGE_RATE_READING, 130, 1235);
    context.fillText(QUOTA_READING, 130, 1270);
  }

  context.font = '400 23px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#6f6962';
  context.fillText(spatial && options.privateSource
    ? '個人用・非公開 · 端末内で保存・解析 · 原文は画像に含まれません'
    : '端末内で解析 · 原文は画像に含まれません', 130, 1310);
  context.textAlign = 'right';
  context.fillText(!summary.userMessageCount || !summary.assistantMessageCount
    ? spatial ? '灰色の四角＝比較材料不足（共有ではありません）' : '灰色＝比較材料不足（共有ではありません）'
    : spatial ? '点は重なる場合があります · 線はラベルとの対応' : 'Promptprint · 言葉の指紋', 2070, 1310);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (signal?.aborted) {
        reject(aborted());
        return;
      }
      if (blob) resolve(blob);
      else reject(new Error('PNGの生成に失敗しました。'));
    }, 'image/png');
  });
};

export const downloadPromptprintPng = async (result: AnalysisResult, signal?: AbortSignal, options: PngExportOptions = {}): Promise<void> => {
  const blob = await createPromptprintPng(result, signal, options);
  if (signal?.aborted) throw aborted();
  const url = URL.createObjectURL(blob);
  activeObjectUrls.add(url);
  if (signal?.aborted) {
    URL.revokeObjectURL(url);
    activeObjectUrls.delete(url);
    throw aborted();
  }
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.download = `promptprint-${date}.png`;
  anchor.href = url;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    activeObjectUrls.delete(url);
  }, 1_000);
};

export const revokePromptprintObjectUrls = (): void => {
  for (const url of activeObjectUrls) URL.revokeObjectURL(url);
  activeObjectUrls.clear();
};
