import type { AnalysisResult } from '../domain/models';

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

export const createPromptprintPng = (result: AnalysisResult, signal?: AbortSignal): Promise<Blob> => {
  if (signal?.aborted) return Promise.reject(aborted());
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像を書き出せるブラウザ機能を利用できません。');

  context.fillStyle = '#fcfaf6';
  context.fillRect(0, 0, W, H);

  const gradient = context.createLinearGradient(120, 250, 2080, 1120);
  gradient.addColorStop(0, '#edf5ff');
  gradient.addColorStop(0.48, '#f7f2ff');
  gradient.addColorStop(1, '#fff0e7');
  roundedRect(context, 120, 240, 1960, 880, 36);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = '#cbc3b8';
  context.lineWidth = 2;
  context.stroke();

  drawPaperGrain(context);

  context.fillStyle = '#17151c';
  context.font = '800 62px system-ui, -apple-system, sans-serif';
  context.fillText('Promptprint', 126, 126);
  const identityGradient = context.createLinearGradient(126, 0, 300, 0);
  identityGradient.addColorStop(0, '#2563eb');
  identityGradient.addColorStop(.5, '#7c3aed');
  identityGradient.addColorStop(1, '#c2410c');
  context.fillStyle = identityGradient;
  context.fillRect(126, 148, 174, 5);
  context.font = '400 29px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#625e66';
  context.fillText('AIとの会話から、言葉の指紋を見る。', 126, 194);

  context.font = '700 25px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#2563eb';
  context.fillText('あなた ←', 190, 312);
  context.textAlign = 'center';
  context.fillStyle = '#7c3aed';
  context.fillText('共有語彙', W / 2, 312);
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
    context.font = `700 ${Math.round(term.fontSize * 1.75)}px system-ui, -apple-system, sans-serif`;
    context.fillStyle = term.color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(term.display, 132 + term.x * SCALE_X, 320 + term.y * SCALE_Y);
  }

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = '600 27px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#17151c';
  const summary = result.summary;
  context.fillText(`${summary.conversationCount} 会話`, 130, 1204);
  context.fillText(`${summary.userMessageCount + summary.assistantMessageCount} 発言`, 325, 1204);
  context.fillText(`${summary.analyzedTermCount} 語を分析`, 545, 1204);

  const dateFormat = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  const dateRange = summary.dateStart !== null && summary.dateEnd !== null
    ? `${dateFormat.format(summary.dateStart)} – ${dateFormat.format(summary.dateEnd)}`
    : '日時情報なし';
  context.font = '400 22px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#6f6962';
  context.fillText(dateRange, 790, 1204);

  const legend = [
    { label: 'あなた寄り', color: '#2563eb' },
    { label: '共有語彙', color: '#7c3aed' },
    { label: 'AI寄り', color: '#c2410c' },
  ];
  let legendX = 1210;
  for (const item of legend) {
    context.beginPath();
    context.arc(legendX, 1195, 8, 0, Math.PI * 2);
    context.fillStyle = item.color;
    context.fill();
    context.font = '600 24px system-ui, -apple-system, sans-serif';
    context.fillStyle = '#625e66';
    context.fillText(item.label, legendX + 18, 1204);
    legendX += 205;
  }

  context.font = '400 23px system-ui, -apple-system, sans-serif';
  context.fillStyle = '#6f6962';
  context.fillText('端末内で解析 · 原文は画像に含まれません', 130, 1284);
  context.textAlign = 'right';
  context.fillText('Promptprint · 言葉の指紋', 2070, 1284);

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

export const downloadPromptprintPng = async (result: AnalysisResult, signal?: AbortSignal): Promise<void> => {
  const blob = await createPromptprintPng(result, signal);
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
