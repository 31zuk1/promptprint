import { expect, test, type Page } from '@playwright/test';
import { projectPoint } from '../src/analysis/spatial';

const TEST_ORIGIN = 'http://127.0.0.1:4173';
const PRIVATE_TITLE = 'SYNTHETIC_SPATIAL_PRIVATE_TITLE';
const JANUARY = '2026-01-01 – 2026-01-31';
const FEBRUARY = '2026-02-01 – 2026-02-28';
const MARCH = '2026-03-01 – 2026-03-31';
const ALL_TERMS = ['研究', '検証', 'ロボット', 'リスク', '留学', '要件', 'データ'];

declare global {
  interface Window {
    __spatialCanvasPoints: Array<{ x: number; y: number; radius: number }>;
  }
}

const spatialFixture = () => [
  { id: 'spatial-jan-a', date: '2026-01-01T00:00:00+09:00', user: '研究', assistant: '検証' },
  { id: 'spatial-jan-b', date: '2026-01-31T23:59:59+09:00', user: 'ロボット', assistant: 'リスク' },
  { id: 'spatial-feb', date: '2026-02-01T00:00:00+09:00', user: '研究', assistant: '研究。リスク' },
  { id: 'spatial-apr', date: '2026-04-01T00:00:00+09:00', user: '留学', assistant: '要件' },
].map((source) => ({
  id: source.id, title: `${PRIVATE_TITLE}_${source.id}`,
  messages: [0, 1].flatMap((index) => (['user', 'assistant'] as const).map((role) => ({
    id: `${source.id}-${index}-${role}`, author: { role },
    create_time: Date.parse(source.date) / 1000,
    content: `${source[role]}。データ。はい！ synthetic-spatial@example.invalid`,
  }))),
}));

const installGuards = (page: Page) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== TEST_ORIGIN) external.push(request.url());
  });
  return { errors, external };
};

const assertGuards = async (page: Page, guards: ReturnType<typeof installGuards>) => {
  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }))).toEqual({ local: 0, session: 0, cookie: '', databases: 0, caches: 0, serviceWorkers: 0 });
  expect(guards.errors).toEqual([]);
  expect(guards.external).toEqual([]);
};

const settled = async (page: Page) => {
  await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
};

const openFixture = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'synthetic-spatial.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(spatialFixture())),
  });
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await expect(page.getByRole('button', { name: '2D ミラー', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '3D 分布', exact: true })).toHaveAttribute('aria-pressed', 'false');
};

const use3D = async (page: Page) => {
  await page.getByRole('button', { name: '3D 分布', exact: true }).click();
  await expect(page.getByRole('button', { name: '3D 分布', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('spatial-cloud')).toBeVisible();
  await expect(page.locator('.mirror-cloud')).toHaveCount(0);
};

const read2D = (page: Page) => page.locator('.mirror-cloud [data-term]').evaluateAll((nodes) => nodes.map((node) => ({
  term: node.getAttribute('data-term'), box: node.getAttribute('data-box'),
  text: node.querySelector('text')?.getAttribute('font-size'),
})).sort((left, right) => (left.term ?? '').localeCompare(right.term ?? '')));

const readSpatial = (page: Page) => page.getByTestId('spatial-cloud').evaluate((node) => {
  const svg = node as unknown as SVGSVGElement;
  const inverse = svg.getScreenCTM()!.inverse();
  return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
    points: [...svg.querySelectorAll<SVGGElement>('[data-spatial-term]')].map((group) => {
      const circle = group.querySelector<SVGCircleElement>('circle.spatial-dot')!;
      const center = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value)
        .matrixTransform(circle.getScreenCTM()!).matrixTransform(inverse);
      return {
        term: group.dataset.spatialTerm!,
        x: Number(group.dataset.worldX), y: Number(group.dataset.worldY), z: Number(group.dataset.worldZ),
        projectedX: Number(group.dataset.projectedX), projectedY: Number(group.dataset.projectedY),
        circleX: Number(circle.getAttribute('cx')), circleY: Number(circle.getAttribute('cy')),
        actualX: center.x, actualY: center.y, radius: circle.r.baseVal.value,
      };
    }).sort((left, right) => left.term.localeCompare(right.term)) };
});

const expectedAll: Record<string, [number, number, number]> = {
  研究: [-1 / 3, 0.375, 0.5], 検証: [1, 0.125, 0.25], ロボット: [-1, 0.125, 0.25],
  リスク: [1, 0.25, 0.5], 留学: [-1, 0.125, 0.25], 要件: [1, 0.125, 0.25], データ: [0, 1, 1],
};

// Compare semantic/projection values exactly; screenCTM inversion is checked
// numerically below because scrolling can change floating-point round-off.
const cameraState = (cloud: Awaited<ReturnType<typeof readSpatial>>) => ({
  width: cloud.width, height: cloud.height,
  points: cloud.points.map(({ term, x, y, z, projectedX, projectedY, radius }) =>
    ({ term, x, y, z, projectedX, projectedY, radius })),
});

const assertSpatial = async (page: Page, expected: Record<string, [number, number, number]>) => {
  await expect.poll(async () => (await readSpatial(page)).points.map((point) => point.term).sort())
    .toEqual(Object.keys(expected).sort());
  const cloud = await readSpatial(page);
  expect(new Set(cloud.points.map((point) => point.radius)).size).toBeLessThanOrEqual(1);
  for (const point of cloud.points) {
    const [x, y, z] = expected[point.term];
    expect(point.x, `${point.term}: bias`).toBeCloseTo(x, 12);
    expect(point.y, `${point.term}: role-balanced occurrence rate`).toBeCloseTo(y, 12);
    expect(point.z, `${point.term}: current conversation coverage`).toBeCloseTo(z, 12);
    expect(point.circleX).toBe(point.projectedX);
    expect(point.circleY).toBe(point.projectedY);
    // Chromium SVGLength stores float32, whereas the attributes retain doubles.
    // Require exact attribute projection and sub-0.001px rendered agreement.
    expect(Math.abs(point.actualX - point.projectedX)).toBeLessThan(0.001);
    expect(Math.abs(point.actualY - point.projectedY)).toBeLessThan(0.001);
    expect(point.projectedX - point.radius).toBeGreaterThanOrEqual(0);
    expect(point.projectedX + point.radius).toBeLessThanOrEqual(cloud.width);
    expect(point.projectedY - point.radius).toBeGreaterThanOrEqual(0);
    expect(point.projectedY + point.radius).toBeLessThanOrEqual(cloud.height);
  }
  const options = await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).locator('option').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean).sort());
  expect(options).toEqual(Object.keys(expected).sort());
  return cloud;
};

const cameraOptions = async (page: Page) => {
  const details = page.locator('.spatial-camera');
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').click();
  }
};

const assertLabelGlyphs = async (page: Page) => {
  const measurements = await page.getByTestId('spatial-cloud').evaluate((node) => {
    const svg = node as unknown as SVGSVGElement;
    const bounds = (element: SVGGraphicsElement) => {
      const box = element.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
      labels: [...svg.querySelectorAll<SVGGElement>('[data-spatial-label]')].map((group) => ({
        term: group.dataset.spatialLabel!,
        rect: bounds(group.querySelector<SVGRectElement>('rect')!),
        text: bounds(group.querySelector<SVGTextElement>('text')!),
        textY: Number(group.querySelector('text')!.getAttribute('y')),
        display: group.querySelector('text')!.textContent,
      })) };
  });
  for (const label of measurements.labels) {
    expect(label.text.x, `${label.term}: actual glyph left`).toBeGreaterThanOrEqual(label.rect.x - 0.01);
    expect(label.text.y, `${label.term}: actual glyph top`).toBeGreaterThanOrEqual(label.rect.y - 0.01);
    expect(label.text.x + label.text.width, `${label.term}: actual glyph right`)
      .toBeLessThanOrEqual(label.rect.x + label.rect.width + 0.01);
    expect(label.text.y + label.text.height, `${label.term}: actual glyph bottom ${JSON.stringify(label)}`)
      .toBeLessThanOrEqual(label.rect.y + label.rect.height + 0.01);
    expect(label.rect.x).toBeGreaterThanOrEqual(8);
    expect(label.rect.y).toBeGreaterThanOrEqual(8);
    expect(label.rect.x + label.rect.width).toBeLessThanOrEqual(measurements.width - 8);
    expect(label.rect.y + label.rect.height).toBeLessThanOrEqual(measurements.height - 8);
  }
  for (let left = 0; left < measurements.labels.length; left += 1) {
    for (let right = left + 1; right < measurements.labels.length; right += 1) {
      const a = measurements.labels[left].text;
      const b = measurements.labels[right].text;
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y,
        `${measurements.labels[left].term}/${measurements.labels[right].term}: actual glyph overlap`).toBe(false);
    }
  }
  return measurements;
};

const timelineOptions = async (page: Page) => {
  if (await page.locator('.timeline__details').getAttribute('open') === null) {
    await page.getByText('期間・時系列', { exact: true }).click();
  }
};

const applyRange = async (page: Page, start: string, end: string) => {
  await timelineOptions(page);
  await page.getByLabel('開始日', { exact: true }).fill(start);
  await page.getByLabel('終了日', { exact: true }).fill(end);
  await page.getByRole('button', { name: '期間を適用', exact: true }).click();
  await expect(page.getByTestId('timeline-current-period')).toHaveText(`${start} – ${end}`);
  await settled(page);
};

test('3D uses exact fixed-scale rates and coverage, keeps coincident points selectable, and restores the identical 2D layout', async ({ page }) => {
  const guards = installGuards(page);
  await openFixture(page);
  const original2D = await read2D(page);
  expect(original2D.map((term) => term.term).sort()).toEqual([...ALL_TERMS].sort());
  await use3D(page);
  const initial = await assertSpatial(page, expectedAll);
  const robot = initial.points.find((point) => point.term === 'ロボット')!;
  const study = initial.points.find((point) => point.term === '留学')!;
  expect([robot.projectedX, robot.projectedY]).toEqual([study.projectedX, study.projectedY]);
  await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).selectOption('留学');
  await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
  const studyDrawer = page.getByRole('dialog', { name: '留学', exact: true });
  await expect(studyDrawer).toBeVisible();
  await expect(studyDrawer.locator('.context-list')).toContainText(`${PRIVATE_TITLE}_spatial-apr`);
  await expect(studyDrawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('2 / 8');
  await page.keyboard.press('Escape');
  await expect(studyDrawer).toHaveCount(0);

  const research = page.locator('[data-spatial-term="研究"]');
  await research.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: '研究', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('4 / 8');
  await expect(drawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('2 / 8');
  await expect(drawer.locator('.context-list')).toContainText('はい!');
  await page.keyboard.press('Escape');
  await expect(research).toBeFocused();
  expect(cameraState(await assertSpatial(page, expectedAll))).toEqual(cameraState(initial));

  await page.getByRole('button', { name: '2D ミラー', exact: true }).click();
  await expect(page.getByTestId('spatial-cloud')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2D ミラー', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await read2D(page)).toEqual(original2D);
  await use3D(page);
  expect(cameraState(await assertSpatial(page, expectedAll))).toEqual(cameraState(initial));
  await assertGuards(page, guards);
});

test('3D camera buttons and empty-canvas drag change only projection; hidden words stay out of PNG and mobile controls fit', async ({ page }) => {
  test.setTimeout(60_000);
  const guards = installGuards(page);
  await page.addInitScript(() => {
    window.__promptprintCanvasTexts = [];
    window.__spatialCanvasPoints = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
      window.__promptprintCanvasTexts.push(String(text));
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
    const originalArc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function arc(x, y, radius, startAngle, endAngle, counterclockwise) {
      const transform = this.getTransform();
      const screenRadius = radius * Math.hypot(transform.a, transform.b);
      if (this.canvas.width === 2200 && Math.abs(screenRadius - 7) < 0.00001) {
        const point = new DOMPoint(x, y).matrixTransform(transform);
        window.__spatialCanvasPoints.push({ x: point.x, y: point.y, radius: screenRadius });
      }
      originalArc.call(this, x, y, radius, startAngle, endAngle, counterclockwise);
    };
  });
  await openFixture(page);
  await use3D(page);
  const initial = await assertSpatial(page, expectedAll);
  await cameraOptions(page);
  for (const name of ['左へ回転', '右へ回転', '上から見る', '水平に近づける', '拡大', '縮小']) {
    const before = cameraState(await readSpatial(page));
    await page.getByRole('button', { name, exact: true }).click();
    await expect.poll(async () => cameraState(await readSpatial(page))).not.toEqual(before);
    await assertSpatial(page, expectedAll);
  }
  await page.getByRole('button', { name: '視点をリセット', exact: true }).click();
  expect(cameraState(await assertSpatial(page, expectedAll))).toEqual(cameraState(initial));
  await page.getByTestId('spatial-cloud').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => cameraState(await readSpatial(page))).not.toEqual(cameraState(initial));
  await page.keyboard.press('Home');
  expect(cameraState(await assertSpatial(page, expectedAll))).toEqual(cameraState(initial));
  await page.getByTestId('spatial-cloud').scrollIntoViewIfNeeded();
  const start = await page.getByTestId('spatial-cloud').evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    for (const [fx, fy] of [[0.08, 0.12], [0.9, 0.15], [0.1, 0.85]]) {
      const x = bounds.left + bounds.width * fx;
      const y = bounds.top + bounds.height * fy;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === node || node.contains(hit)) && !hit.closest('[data-spatial-term]')) return { x, y };
    }
    return null;
  });
  expect(start).not.toBeNull();
  await page.mouse.move(start!.x, start!.y);
  await page.mouse.down();
  await page.mouse.move(start!.x + 75, start!.y + 30, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => cameraState(await readSpatial(page))).not.toEqual(cameraState(initial));
  await assertSpatial(page, expectedAll);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '視点をリセット', exact: true }).click();
  expect(cameraState(await assertSpatial(page, expectedAll))).toEqual(cameraState(initial));

  await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).selectOption('ロボット');
  await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
  await page.getByRole('button', { name: 'この語を表示から隠す' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await settled(page);
  const remaining = Object.fromEntries(Object.entries(expectedAll).filter(([term]) => term !== 'ロボット'));
  await assertSpatial(page, remaining);
  await applyRange(page, '2026-01-01', '2026-04-01');
  await page.getByText('期間・時系列', { exact: true }).click();
  await cameraOptions(page);
  await page.getByRole('button', { name: '左へ回転', exact: true }).click();
  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.screenshot({ path: 'output/playwright/promptprint-3d-desktop.png' });
  const exportedCamera = await page.getByTestId('spatial-cloud').evaluate((node) => ({
    yaw: Number(node.getAttribute('data-yaw')), pitch: Number(node.getAttribute('data-pitch')),
    zoom: Number(node.getAttribute('data-zoom')),
  }));

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す' }).click();
  const download = await downloadPromise;
  await download.saveAs('output/playwright/promptprint-3d-export.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(download.suggestedFilename()).toMatch(/^promptprint-.*\.png$/u);
  const drawn = await page.evaluate(() => window.__promptprintCanvasTexts.join('\n'));
  expect(drawn).toContain('3D');
  expect(drawn).toContain('2026-01-01');
  expect(drawn).toContain('2026-04-01');
  expect(drawn).toContain('発言出現率');
  expect(drawn).toContain('会話');
  expect(drawn).not.toMatch(/ロボット|SYNTHETIC_SPATIAL_PRIVATE_TITLE|synthetic-spatial@|はい/iu);
  const ink = await page.evaluate(() => window.__spatialCanvasPoints);
  expect(ink).toHaveLength(Object.keys(remaining).length);
  const expectedInk = Object.values(remaining).map(([x, y, z]) => {
    const projected = projectPoint({ x, y, z }, exportedCamera, 1100, 620);
    return { x: 330 + projected.x * 1.4, y: 246 + projected.y * 1.4 };
  }).sort((left, right) => left.x - right.x || left.y - right.y);
  ink.sort((left, right) => left.x - right.x || left.y - right.y);
  for (const [index, point] of ink.entries()) {
    // Chromium also exposes its Canvas transform with float32-scale rounding.
    expect(Math.abs(point.x - expectedInk[index].x)).toBeLessThan(0.001);
    expect(Math.abs(point.y - expectedInk[index].y)).toBeLessThan(0.001);
    expect(Math.abs(point.radius - 7)).toBeLessThan(0.00001);
  }

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByTestId('spatial-cloud')).toBeVisible();
    await assertSpatial(page, remaining);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const control of [page.getByRole('button', { name: '2D ミラー', exact: true }),
      page.getByRole('button', { name: '3D 分布', exact: true }), page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }),
      page.getByRole('button', { name: '選択した語の文脈を見る', exact: true })]) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('.toast')).toHaveCount(0);
    if (width === 390) await page.screenshot({ path: 'output/playwright/promptprint-3d-mobile.png', fullPage: true });
    await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).selectOption('留学');
    await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '留学', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: '解析データを消去' }).click();
  await page.getByRole('button', { name: '消去を実行' }).click();
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  await expect(page.getByTestId('spatial-cloud')).toHaveCount(0);
  await assertGuards(page, guards);
});

test('3D remains selected while day/month playback recomputes rates and preserves empty frames', async ({ page }) => {
  const guards = installGuards(page);
  await openFixture(page);
  await use3D(page);
  await applyRange(page, '2026-01-01', '2026-01-31');
  await assertSpatial(page, {
    研究: [-1, 0.25, 0.5], 検証: [1, 0.25, 0.5], ロボット: [-1, 0.25, 0.5],
    リスク: [1, 0.25, 0.5], データ: [0, 1, 1],
  });
  await applyRange(page, '2026-02-01', '2026-02-28');
  await assertSpatial(page, { 研究: [0, 1, 1], リスク: [1, 0.5, 1], データ: [0, 1, 1] });
  await applyRange(page, '2026-03-01', '2026-03-31');
  await assertSpatial(page, {});
  await expect(page.getByTestId('timeline-current-period')).toHaveText(MARCH);
  await expect(page.getByRole('button', { name: '3D 分布', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '全期間に戻す', exact: true }).click();
  await settled(page);
  await assertSpatial(page, expectedAll);
  await page.getByLabel('表示間隔').selectOption('1000');
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await expect(page.getByTestId('timeline-current-period')).toHaveText(JANUARY);
  await expect(page.getByTestId('timeline-current-period')).toHaveText(FEBRUARY);
  await page.getByRole('button', { name: '再生を停止', exact: true }).click();
  await assertSpatial(page, { 研究: [0, 1, 1], リスク: [1, 0.5, 1], データ: [0, 1, 1] });
  await applyRange(page, '2026-02-01', '2026-02-02');
  await page.getByLabel('再生単位').selectOption('day');
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await expect(page.getByTestId('timeline-current-period')).toHaveText('2026-02-01 – 2026-02-01');
  await expect(page.getByTestId('timeline-current-period')).toHaveText('2026-02-02 – 2026-02-02');
  await expect(page.getByRole('button', { name: '再生を停止', exact: true })).toHaveCount(0);
  await assertSpatial(page, {});
  await expect(page.getByRole('button', { name: '3D 分布', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await assertGuards(page, guards);
});

test('dense synthetic demo retains the 2D point set and rendered labels fit at desktop, 390px and 320px', async ({ page }) => {
  const guards = installGuards(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'デモを見る', exact: true }).click();
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  const original2D = await read2D(page);
  expect(original2D.length).toBeGreaterThan(25);
  await use3D(page);
  const initial = await readSpatial(page);
  expect(initial.points.map((point) => point.term).sort()).toEqual(original2D.map((point) => point.term).sort());
  const expected = Object.fromEntries(initial.points.map(({ term, x, y, z }) => [term, [x, y, z] as [number, number, number]]));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await assertSpatial(page, expected);
    const labels = await assertLabelGlyphs(page);
    expect(labels.labels.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await expect(page.locator('.toast')).toHaveCount(0);
    const variant = width === 1440 ? 'desktop' : `mobile-${width}`;
    await page.screenshot({ path: `output/playwright/promptprint-3d-demo-${variant}.png`, fullPage: true });
    await page.getByTestId('spatial-cloud').screenshot({ path: `output/playwright/promptprint-3d-demo-cloud-${variant}.png` });
    await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await assertGuards(page, guards);
});

test('long bold Latin and Japanese glyphs fit the label reservation without clipping', async ({ page }) => {
  const guards = installGuards(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const words = ['WWWWWWWWWWWWWWWWWWWW', 'MMMMMMMMMMMMMMMMMMMM'];
  await page.getByTestId('file-input').setInputFiles({
    name: 'synthetic-spatial-long-labels.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{ id: 'synthetic-long-labels', title: PRIVATE_TITLE,
      messages: [0, 1].flatMap((index) => (['user', 'assistant'] as const).map((role) => ({
        id: `${index}-${role}`, author: { role }, create_time: Date.parse('2026-01-01T00:00:00+09:00') / 1000,
        content: `${words.join('。')}。データ。`,
      }))),
    }])),
  });
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await use3D(page);
  await assertSpatial(page, { [words[0].toLowerCase()]: [0, 1, 1], [words[1].toLowerCase()]: [0, 1, 1], データ: [0, 1, 1] });
  for (const word of words) {
    await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).selectOption(word.toLowerCase());
    await expect(page.locator('.spatial-selection__metrics strong')).toHaveText(word);
    // Selection reorders labels. Wait for Chromium to commit the same frame to
    // SVG getBBox and attributes, retaining every strict geometry assertion.
    await expect(async () => {
      const labels = await assertLabelGlyphs(page);
      const selected = labels.labels.find((label) => label.term === word.toLowerCase());
      expect(selected).toBeDefined();
      expect(selected!.display).toBe(`${word.slice(0, 13)}…`);
      expect(selected!.text.width).toBeGreaterThan(150);
    }).toPass({ timeout: 8_000 });
  }
  // Measure full-width Japanese in the very same mounted SVG/font context.
  // The temporary glyph is removed immediately; no fabricated analysis result.
  const japanese = await page.getByTestId('spatial-cloud').evaluate((node) => {
    const original = node.querySelector<SVGTextElement>('[data-spatial-label] text')!;
    const probe = original.cloneNode(true) as SVGTextElement;
    probe.textContent = 'ソフトウェアインターフェイス';
    original.parentElement!.append(probe);
    const width = probe.getBBox().width;
    const fontSize = Number(probe.getAttribute('font-size'));
    const characters = Array.from(probe.textContent).length;
    probe.remove();
    return { width, fontSize, characters };
  });
  expect(japanese.characters).toBe(14);
  expect(japanese.fontSize).toBe(14);
  expect(japanese.width).toBeLessThanOrEqual(14 * 14 + 12);
  await page.screenshot({ path: 'output/playwright/promptprint-3d-long-labels.png', fullPage: true });
  await assertGuards(page, guards);
});
