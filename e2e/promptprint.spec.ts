import { expect, test, type Page } from '@playwright/test';

const TEST_ORIGIN = 'http://127.0.0.1:4173';

declare global {
  interface Window {
    __promptprintCanvasTexts: string[];
    __promptprintCreatedUrls: string[];
    __promptprintRevokedUrls: string[];
    __promptprintCreatedUrlCount: number;
    __promptprintInk: Array<{ x: number; y: number; width: number; height: number }>;
  }
}

const installGuards = (page: Page) => {
  const consoleErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== TEST_ORIGIN) externalRequests.push(request.url());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  return { consoleErrors, externalRequests };
};

const readBrowserStorage = async (page: Page) => page.evaluate(async () => ({
  localStorageItems: localStorage.length,
  sessionStorageItems: sessionStorage.length,
  cookie: document.cookie,
  databases: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0,
  caches: 'caches' in window ? (await caches.keys()).length : 0,
  serviceWorkers: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
}));

const EMPTY_BROWSER_STORAGE = {
  localStorageItems: 0,
  sessionStorageItems: 0,
  cookie: '',
  databases: 0,
  caches: 0,
  serviceWorkers: 0,
};

const openDemo = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^AIとの会話から、/ })).toBeVisible();
  await page.getByRole('button', { name: 'デモを見る' }).click();
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
};

const clearAnalysis = async (page: Page) => {
  await page.getByRole('button', { name: '解析データを消去' }).click();
  await page.getByRole('button', { name: '消去を実行' }).click();
};

const openAnalysis = async (page: Page) => {
  await page.locator('.analysis-shell').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page.locator('.analysis-toolbar')).toHaveCount(1);
};

// Inspect actual rendered glyphs, not only the layout model's rectangles.
const assertCloudGeometry = async (page: Page, overview = false) => {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const geometry = await page.locator('.mirror-cloud').evaluate((node) => {
    const svg = node as SVGSVGElement;
    return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
      terms: [...svg.querySelectorAll<SVGGElement>('[data-term]')].map((group) => {
        const text = group.querySelector('text')!;
        const glyph = text.getBBox();
        const box = JSON.parse(group.dataset.box!) as { x: number; y: number; width: number; height: number };
        return { term: group.dataset.term, bias: Number(group.dataset.bias), label: group.dataset.biasLabel,
          box, glyph: { x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height } };
      }) };
  });
  expect(geometry.terms.length).toBeGreaterThan(0);
  const pad = overview ? 8 : 18;
  for (const [index, term] of geometry.terms.entries()) {
    const { glyph, box } = term;
    const target = geometry.width / 2 - term.bias * (geometry.width / 2 - (overview ? 50 : 90));
    expect(Math.abs(box.x - target)).toBeLessThanOrEqual(geometry.width * 0.055 + 0.02);
    expect(glyph.x).toBeGreaterThanOrEqual(box.x - box.width / 2 - 0.1);
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(box.x + box.width / 2 + 0.1);
    expect(glyph.y).toBeGreaterThanOrEqual(box.y - box.height / 2 - 0.1);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(box.y + box.height / 2 + 0.1);
    expect(glyph.x).toBeGreaterThanOrEqual(pad - 0.1);
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(geometry.width - pad + 0.1);
    expect(glyph.y).toBeGreaterThanOrEqual(pad - 0.1);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(geometry.height - pad + 0.1);
    if (term.label === 'user') expect(glyph.x + glyph.width).toBeLessThan(geometry.width / 2);
    if (term.label === 'assistant') expect(glyph.x).toBeGreaterThan(geometry.width / 2);
    for (const other of geometry.terms.slice(index + 1)) {
      const right = other.glyph;
      expect(glyph.x < right.x + right.width && glyph.x + glyph.width > right.x &&
        glyph.y < right.y + right.height && glyph.y + glyph.height > right.y).toBe(false);
    }
  }
  const caption = await page.getByTestId('cloud-caption').boundingBox();
  expect(caption!.y + caption!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  return geometry;
};

test('demo exploration, filters, privacy-safe PNG, screenshot, and clear flow', async ({ page }) => {
  const guards = installGuards(page);
  await page.addInitScript(() => {
    window.__promptprintCanvasTexts = [];
    window.__promptprintInk = [];
    window.__promptprintCreatedUrls = [];
    window.__promptprintRevokedUrls = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
      window.__promptprintCanvasTexts.push(String(text));
      if (this.canvas.width === 2200 && this.textBaseline === 'middle') {
        const metrics = this.measureText(text);
        const scale = maxWidth === undefined ? 1 : Math.min(1, maxWidth / metrics.width);
        window.__promptprintInk.push({
          x: x - metrics.actualBoundingBoxLeft * scale, y: y - metrics.actualBoundingBoxAscent,
          width: (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) * scale,
          height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
        });
      }
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      const url = originalCreateObjectUrl(object);
      window.__promptprintCreatedUrls.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__promptprintRevokedUrls.push(url);
      originalRevokeObjectUrl(url);
    };
  });
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/promptprint-landing.png', fullPage: true });
  await openDemo(page);

  await expect(page.getByText('ロボット', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('研究', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('要件', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('リスク', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('交絡要因', { exact: true }).first()).toBeVisible();
  await assertCloudGeometry(page);
  await expect(page.getByTestId('cloud-caption')).toContainText('上下＝意味なし');
  await expect(page.getByTestId('cloud-caption')).toContainText('合成デモ');
  await page.mouse.move(1, 1);
  await page.screenshot({ path: 'artifacts/promptprint-demo.png' });
  await expect(page.getByRole('button', { name: '分析を見る' })).toHaveCount(0);
  await expect(page.locator('.dashboard__discovery-rail')).toHaveCount(0);
  await expect(page.locator('.analysis-preview')).toHaveCount(0);
  await openAnalysis(page);
  await page.screenshot({ path: 'artifacts/promptprint-demo-full.png' });
  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const robot = page.getByRole('button', { name: /^ロボット、/ }).first();
  await robot.focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('あなた');
  await expect(tooltip).toContainText('AI');
  await expect(tooltip).toContainText('会話カバー');
  await expect(tooltip).toContainText('その語を含む発言の割合');
  await expect(tooltip).toContainText('1,000トークンあたり');
  const tooltipBounds = await tooltip.boundingBox();
  const cloudBounds = await page.getByTestId('mirror-cloud').boundingBox();
  expect(tooltipBounds!.x).toBeGreaterThanOrEqual(cloudBounds!.x);
  expect(tooltipBounds!.y).toBeGreaterThanOrEqual(cloudBounds!.y);
  expect(tooltipBounds!.x + tooltipBounds!.width).toBeLessThanOrEqual(cloudBounds!.x + cloudBounds!.width);
  expect(tooltipBounds!.y + tooltipBounds!.height).toBeLessThanOrEqual(cloudBounds!.y + cloudBounds!.height);
  await page.screenshot({ path: 'artifacts/promptprint-tooltip.png' });
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'ロボット' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('mark').first()).toHaveText('ロボット');
  const closeButton = page.getByRole('button', { name: '閉じる', exact: true });
  const hideButton = page.getByRole('button', { name: 'この語を表示から隠す' });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(hideButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(robot).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  await hideButton.click();
  await expect(page.getByText('更新中')).toBeHidden();
  await expect(page.getByRole('button', { name: /^ロボット、/ })).toHaveCount(0);

  const wordsBefore = await page.locator('.mirror-cloud [role="button"]').count();
  await openAnalysis(page);
  await page.getByText('表示条件を変える', { exact: true }).click();
  await page.getByLabel('表示する語').selectOption('40');
  await expect(page.getByText('更新中')).toBeHidden();
  const wordsAfter = await page.locator('.mirror-cloud [role="button"]').count();
  expect(wordsAfter).toBeLessThanOrEqual(40);
  expect(wordsAfter).toBeLessThanOrEqual(wordsBefore);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^promptprint-\d{4}-\d{2}-\d{2}\.png$/);
  await download.saveAs('artifacts/promptprint-export.png');
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  if (stream) {
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const png = Buffer.concat(chunks);
  expect(png.byteLength).toBeGreaterThan(10_000);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const canvasTexts = await page.evaluate(() => window.__promptprintCanvasTexts);
  expect(canvasTexts.some((text) => text.includes('ロボット'))).toBe(false);
  expect(canvasTexts.join(' ')).not.toContain('@');
  expect(canvasTexts.join(' ')).not.toContain('全方向ロボットの試作');
  const ink = await page.evaluate(() => window.__promptprintInk);
  const labels = await page.locator('.mirror-cloud [data-bias-label]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-bias-label')));
  expect(ink).toHaveLength(labels.length);
  for (const [index, box] of ink.entries()) {
    expect(box.x).toBeGreaterThan(120);
    expect(box.x + box.width).toBeLessThan(2080);
    expect(box.y).toBeGreaterThan(240);
    expect(box.y + box.height).toBeLessThan(1120);
    if (labels[index] === 'user') expect(box.x + box.width).toBeLessThan(1100);
    if (labels[index] === 'assistant') expect(box.x).toBeGreaterThan(1100);
    for (const other of ink.slice(index + 1)) {
      expect(box.x < other.x + other.width && box.x + box.width > other.x &&
        box.y < other.y + other.height && box.y + box.height > other.y).toBe(false);
    }
  }

  expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);

  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);

  await clearAnalysis(page);
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  await expect(page.getByTestId('mirror-cloud')).toHaveCount(0);
  const urlLifecycle = await page.evaluate(() => ({
    created: window.__promptprintCreatedUrls,
    revoked: window.__promptprintRevokedUrls,
  }));
  expect(urlLifecycle.created.length).toBeGreaterThan(0);
  expect(urlLifecycle.created.every((url) => urlLifecycle.revoked.includes(url))).toBe(true);
});

test('cloud and analysis meet cleanly at the reported ultrawide ratio', async ({ page }) => {
  const guards = installGuards(page);
  await page.setViewportSize({ width: 1_710, height: 978 });
  await openDemo(page);

  await expect(page.locator('.dashboard__opening')).toHaveCount(1);
  await expect(page.locator('.analysis-toolbar')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '分析を見る' })).toHaveCount(0);
  await expect(page.locator('.dashboard__discovery-rail')).toHaveCount(0);
  await expect(page.locator('.analysis-preview')).toHaveCount(0);
  const boundary = await page.evaluate(() => {
    const opening = document.querySelector('.dashboard__opening')?.getBoundingClientRect();
    const analysis = document.querySelector('.analysis-shell')?.getBoundingClientRect();
    return { openingBottom: opening?.bottom ?? -1, analysisTop: analysis?.top ?? -2 };
  });
  expect(Math.abs(boundary.openingBottom - boundary.analysisTop)).toBeLessThanOrEqual(1);

  await openAnalysis(page);
  await page.screenshot({ path: 'artifacts/promptprint-ultrawide-analysis.png' });
  const toolbarBox = await page.locator('.analysis-toolbar').boundingBox();
  expect(toolbarBox?.y).toBe(0);

  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test('malformed import reports a recoverable Japanese diagnostic', async ({ page }) => {
  const guards = installGuards(page);
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"conversations": [this is not json]'),
  });
  await expect(page.getByRole('alert')).toContainText(/読み込めませんでした/);
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test('imports real-shaped ChatGPT JSON and reports a mixed unsupported file honestly', async ({ page }) => {
  const guards = installGuards(page);
  await page.addInitScript(() => {
    window.__promptprintCanvasTexts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
      window.__promptprintCanvasTexts.push(String(text));
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto('/');

  const conversations = Array.from({ length: 3 }, (_, index) => ({
    id: `import-${index + 1}`,
    title: `PRIVATE_TITLE_SENTINEL_${index + 1}`,
    create_time: 1_725_148_800 + index * 60,
    messages: [
      {
        id: `u-${index + 1}`,
        role: 'user',
        create_time: 1_725_148_801 + index * 60,
        content: index === 0
          ? 'Orbital ロボット データ RAW_EXCERPT_SENTINEL_7291 private@example.invalid'
          : 'Orbital ロボット データ',
      },
      {
        id: `a-${index + 1}`,
        role: 'assistant',
        create_time: 1_725_148_802 + index * 60,
        content: 'Orbital 要件 リスク',
      },
    ],
  }));

  await page.getByTestId('file-input').setInputFiles([
    {
      name: 'conversations.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conversations)),
    },
    {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('RAW_UNSUPPORTED_PRIVATE_VALUE'),
    },
  ]);

  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Orbital、/ }).first()).toBeVisible();
  expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);
  await openAnalysis(page);
  await expect(page.locator('.stat-card').first()).toContainText('3');
  await page.getByText(/読み込み診断/).click();
  await expect(page.getByText(/スキップ: 1件/)).toBeVisible();
  await expect(page.getByText('notes.txt')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('RAW_UNSUPPORTED_PRIVATE_VALUE');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す' }).click();
  await downloadPromise;
  const canvasTexts = await page.evaluate(() => window.__promptprintCanvasTexts);
  expect(canvasTexts.join(' ')).not.toContain('PRIVATE_TITLE_SENTINEL');
  expect(canvasTexts.join(' ')).not.toContain('RAW_EXCERPT_SENTINEL_7291');
  expect(canvasTexts.join(' ')).not.toContain('private@example.invalid');
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test('unsupported Claude shape shows safe keys without exposing values', async ({ page }) => {
  const guards = installGuards(page);
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'claude-unknown.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      account: 'RAW_PRIVATE_SENTINEL',
      chats: [{ uuid: 'unsupported', transcript: { body: 'RAW_PRIVATE_SENTINEL' } }],
      ['RAW_PRIVATE_SENTINEL used as a key']: true,
    })),
  });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('キー: account, chats');
  await expect(alert).not.toContainText('RAW_PRIVATE_SENTINEL');
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test('cancel during file reading cannot repopulate the dashboard', async ({ page }) => {
  const guards = installGuards(page);
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function delayedArrayBuffer() {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
      return original.call(this);
    };
  });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'slow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{
      id: 'slow-conversation',
      title: '遅い読み込み',
      messages: [
        { id: 'u1', role: 'user', content: 'ロボット データ' },
        { id: 'a1', role: 'assistant', content: 'データ 要件' },
      ],
    }])),
  });
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('mirror-cloud')).toHaveCount(0);
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test('clearing during PNG encoding prevents a late download or object URL', async ({ page }) => {
  const guards = installGuards(page);
  let downloadCount = 0;
  page.on('download', () => { downloadCount += 1; });
  await page.addInitScript(() => {
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function delayedToBlob(callback, type, quality) {
      originalToBlob.call(this, (blob) => {
        window.setTimeout(() => callback(blob), 700);
      }, type, quality);
    };
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    window.__promptprintCreatedUrlCount = 0;
    URL.createObjectURL = (object) => {
      window.__promptprintCreatedUrlCount += 1;
      return originalCreateObjectUrl(object);
    };
  });

  await openDemo(page);
  await openAnalysis(page);
  await page.getByRole('button', { name: 'PNGを書き出す' }).click();
  await clearAnalysis(page);
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  await page.waitForTimeout(1_000);

  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => window.__promptprintCreatedUrlCount)).toBe(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByTestId('mirror-cloud')).toHaveCount(0);
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test('an older filter result cannot reopen PNG export while a hide request is queued', async ({ page }) => {
  test.setTimeout(60_000);
  const guards = installGuards(page);
  await page.goto('/');
  const conversations = Array.from({ length: 10_000 }, (_, index) => ({
    id: `race-${index}`,
    title: `Race ${index}`,
    messages: [
      // A standalone noun is intentionally available to hide. The previous
      // adjective "private" is now correctly represented inside noun phrases.
      { id: `u-${index}`, role: 'user', content: 'privacy。orbital focus' },
      { id: `a-${index}`, role: 'assistant', content: 'privacy。requirement response' },
    ],
  }));
  await page.getByTestId('file-input').setInputFiles({
    name: 'conversations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(conversations)),
  });
  await expect(page.getByTestId('mirror-cloud')).toBeVisible({ timeout: 30_000 });

  await openAnalysis(page);
  await page.getByText('表示条件を変える', { exact: true }).click();
  await page.getByLabel('表示する語').selectOption('40');
  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: /^privacy、/ }).first().click();
  await page.getByRole('button', { name: 'この語を表示から隠す' }).click();
  await openAnalysis(page);
  const exportButton = page.getByRole('button', { name: 'PNGを書き出す' });
  await expect(exportButton).toBeDisabled();

  let leakedExportWindow = false;
  await expect.poll(async () => {
    const hiddenTermStillVisible = await page.locator('[data-term="privacy"]').count() > 0;
    if (hiddenTermStillVisible && await exportButton.isEnabled()) leakedExportWindow = true;
    return hiddenTermStillVisible;
  }, { timeout: 30_000, intervals: [20, 40, 80, 120] }).toBe(false);
  expect(leakedExportWindow).toBe(false);
  await expect(exportButton).toBeEnabled();
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('demo and context drawer remain operable', async ({ page }) => {
    const guards = installGuards(page);
    await openDemo(page);
    await expect(page.getByTestId('mirror-cloud')).toBeVisible();
    await page.screenshot({ path: 'artifacts/promptprint-mobile.png', fullPage: true });
    await assertCloudGeometry(page, true);
    await page.screenshot({ path: 'artifacts/promptprint-mobile-cloud.png' });

    const opening = page.locator('.dashboard__opening');
    await expect(opening.getByText('あなた ←')).toBeVisible();
    await expect(opening.getByText('共有語彙')).toBeVisible();
    await expect(opening.getByText('→ AI')).toBeVisible();
    await expect(page.getByRole('button', { name: '要点 24語' })).toHaveAttribute('aria-pressed', 'true');
    const cloudScroller = page.getByTestId('mirror-cloud');
    // Morphology ledger: 64 candidates, 18 policy exclusions, seven compound
    // representatives. The full topic set has 39 terms; overview stays 24.
    await page.getByRole('button', { name: '詳しく見る 39語', exact: true }).click();
    await cloudScroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    expect(await cloudScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole('button', { name: '要点 24語' }).click();
    await page.getByRole('button', { name: /^ロボット、/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'ロボット' })).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('1,000トークンあたり');
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openAnalysis(page);
    await page.getByText('表示条件を変える', { exact: true }).click();
    await expect(page.getByRole('button', { name: '単語のみ' })).toBeVisible();
    await expect(page.getByLabel('コードを除外')).toBeVisible();
    await expect(page.getByLabel('引用を除外')).toBeVisible();
    await page.getByRole('button', { name: '単語のみ' }).click();
    await expect(page.getByText('更新中')).toBeHidden();
    await expect(page.getByRole('button', { name: '単語のみ' })).toHaveAttribute('aria-pressed', 'true');

    expect(guards.externalRequests).toEqual([]);
    expect(guards.consoleErrors).toEqual([]);
  });
});

for (const count of [40, 80, 120]) {
  for (const side of ['user', 'assistant'] as const) {
    test(`one-sided ${count} ${side} terms: desktop, mobile, PNG and deterministic coordinates`, async ({ page }) => {
      const guards = installGuards(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        window.__promptprintInk = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
          if (this.canvas.width === 2200 && this.textBaseline === 'middle') {
            const metrics = this.measureText(text);
            const scale = maxWidth === undefined ? 1 : Math.min(1, maxWidth / metrics.width);
            window.__promptprintInk.push({
              x: x - metrics.actualBoundingBoxLeft * scale,
              y: y - metrics.actualBoundingBoxAscent,
              width: (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) * scale,
              height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
            });
          }
          if (maxWidth === undefined) original.call(this, text, x, y);
          else original.call(this, text, x, y, maxWidth);
        };
      });
      await page.goto('/');
      const vocabulary = Array.from({ length: count }, (_, index) =>
        // Explicit acronym-shaped synthetic nouns keep this a 40/80/120-term
        // geometry stress test, not a contextual POS classification test.
        `LEXEME${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`).join('。');
      const corpus = [0, 1].map((index) => ({ id: `stress-${index}`, create_time: 1_725_148_800,
        messages: (['user', 'assistant'] as const).map((role) => ({
          id: `${index}-${role}`, role, content: role === side ? vocabulary : 'and the',
        })) }));
      await page.getByTestId('file-input').setInputFiles({ name: 'conversations.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(corpus)) });
      await expect(page.getByTestId('mirror-cloud')).toBeVisible();
      await openAnalysis(page);
      await page.getByText('表示条件を変える', { exact: true }).click();
      await page.getByLabel('表示する語').selectOption(String(count));
      await expect(page.getByText('更新中')).toBeHidden();
      await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      const desktop = await assertCloudGeometry(page);
      expect(desktop.terms.every((term) => term.label === side && Math.abs(term.bias) === 1)).toBe(true);
      await expect(page.getByTestId('cloud-caption')).toContainText(`配置のため省略 ${count - desktop.terms.length}語`);
      await expect(page.getByTestId('cloud-caption')).toContainText('読み込みデータ · ChatGPT');
      if (count === 120) await page.screenshot({ path: `artifacts/promptprint-stress-${side}-desktop.png` });

      await openAnalysis(page);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'PNGを書き出す' }).click();
      const download = await downloadPromise;
      if (count === 120) await download.saveAs(`artifacts/promptprint-stress-${side}-export.png`);
      const ink = await page.evaluate(() => window.__promptprintInk);
      expect(ink).toHaveLength(desktop.terms.length);
      for (const [index, box] of ink.entries()) {
        expect(box.x).toBeGreaterThan(120);
        expect(box.x + box.width).toBeLessThan(2080);
        expect(box.y).toBeGreaterThan(240);
        expect(box.y + box.height).toBeLessThan(1120);
        if (side === 'user') expect(box.x + box.width).toBeLessThan(1100);
        else expect(box.x).toBeGreaterThan(1100);
        for (const other of ink.slice(index + 1)) {
          expect(box.x < other.x + other.width && box.x + box.width > other.x &&
            box.y < other.y + other.height && box.y + box.height > other.y).toBe(false);
        }
      }
      await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('button', { name: /^要点/ })).toBeVisible();
      await assertCloudGeometry(page, true);
      if (count === 120) {
        // Keep the omission caption unobscured in the visual evidence.
        await expect(page.locator('.toast')).toHaveCount(0);
        await page.screenshot({ path: `artifacts/promptprint-stress-${side}-mobile.png` });
      }
      await page.getByRole('button', { name: /^詳しく見る/ }).click();
      await assertCloudGeometry(page);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(page.locator('.cloud-canvas--detail')).toHaveCount(0);
      expect(await assertCloudGeometry(page)).toEqual(desktop);
      expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);
      expect(guards.externalRequests).toEqual([]);
      expect(guards.consoleErrors).toEqual([]);
    });
  }
}

test('a missing role is visibly comparison-insufficient, never shared or a zero measured rate', async ({ page }) => {
  const guards = installGuards(page);
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({ name: 'conversations.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify([{ id: 'one-role', messages: [
      { id: 'u1', role: 'user', content: 'signal signal' },
      { id: 'u2', role: 'user', content: 'signal signal' },
    ] }])) });
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await expect(page.locator('.cloud-axis span').nth(1)).toHaveText('比較材料不足');
  await expect(page.getByTestId('cloud-caption')).toContainText('日時情報なし');
  await expect(page.getByTestId('cloud-caption')).toContainText('灰色の語は共有を意味しません');
  const term = page.getByRole('button', { name: /^signal、比較材料不足/ });
  await expect(term).toHaveAttribute('data-bias-label', 'insufficient');
  await expect(term.locator('text')).toHaveAttribute('fill', '#69656B');
  await assertCloudGeometry(page);
  await term.focus();
  await expect(page.getByRole('tooltip')).toContainText('—（発言なし）');
  await expect(page.getByRole('tooltip')).toContainText('1000.0回');
  expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);
  expect(guards.externalRequests).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test.describe('conversational noise', () => {
  const acknowledgments = 'はい！いいえ。OK!? ＯＫ yes no okay。って、とか、けど、ください。';
  const punctuation = '！？!?…。、「」『』（）()【】——；：';
  const expectedTerms = ['データ', 'リスク', 'ロボット', '検証', '研究'].sort();
  const noiseTerm = /^(?:はい|いいえ|ok|okay|yes|no|って|とか|けど|ください|くだ|さい)$/iu;

  const assertContentTerms = async (page: Page) => {
    const terms = await page.locator('.mirror-cloud [data-term]').evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-term')!));
    expect(terms.map((term) => term.normalize('NFKC')).some((term) => noiseTerm.test(term))).toBe(false);
    expect(terms.some((term) => !/[\p{L}\p{N}]/u.test(term))).toBe(false);
    // Exact vocabulary also rejects noise reconstructed as a multi-token phrase.
    expect([...terms].sort()).toEqual(expectedTerms);
    await expect(page.locator('[data-term="研究"]')).toHaveAttribute('data-bias-label', 'user');
    await expect(page.locator('[data-term="ロボット"]')).toHaveAttribute('data-bias-label', 'user');
    await expect(page.locator('[data-term="検証"]')).toHaveAttribute('data-bias-label', 'assistant');
    await expect(page.locator('[data-term="リスク"]')).toHaveAttribute('data-bias-label', 'assistant');
    await expect(page.locator('[data-term="データ"]')).toHaveAttribute('data-bias-label', 'shared');
  };

  test('noisy imports preserve content and originals across word/phrase, mobile and PNG rendering', async ({ page }) => {
    const guards = installGuards(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.__promptprintCanvasTexts = [];
      window.__promptprintInk = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
        window.__promptprintCanvasTexts.push(String(text));
        if (this.canvas.width === 2200 && this.textBaseline === 'middle') {
          const metrics = this.measureText(text);
          const scale = maxWidth === undefined ? 1 : Math.min(1, maxWidth / metrics.width);
          window.__promptprintInk.push({
            x: x - metrics.actualBoundingBoxLeft * scale,
            y: y - metrics.actualBoundingBoxAscent,
            width: (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) * scale,
            height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
          });
        }
        if (maxWidth === undefined) original.call(this, text, x, y);
        else original.call(this, text, x, y, maxWidth);
      };
    });
    await page.goto('/');
    const conversations = Array.from({ length: 8 }, (_, index) => ({
      id: `synthetic-noise-${index}`, title: `SYNTHETIC_NOISE_PRIVATE_TITLE_${index}`, create_time: 1_788_825_600,
      messages: [
        { id: `${index}-u`, role: 'user', content: `はい！研究。いいえ。ロボット。${acknowledgments}データ。`.repeat(12) },
        { id: `${index}-a`, role: 'assistant', content: `いいえ。検証！リスク。${acknowledgments}データ。`.repeat(12) },
        { id: `${index}-up`, role: 'user', content: punctuation.repeat(15) },
        { id: `${index}-aa`, role: 'assistant', content: acknowledgments.repeat(15) },
        { id: `${index}-ua`, role: 'user', content: acknowledgments.repeat(15) },
        { id: `${index}-ap`, role: 'assistant', content: punctuation.repeat(15) },
      ],
    }));
    await page.getByTestId('file-input').setInputFiles({ name: 'synthetic-noise.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conversations)) });
    await expect(page.getByTestId('mirror-cloud')).toBeVisible();
    await assertContentTerms(page);
    await assertCloudGeometry(page);

    await page.getByRole('button', { name: /^研究、/ }).click();
    const drawer = page.getByRole('dialog', { name: '研究' });
    await expect(drawer).toBeVisible();
    // Existing context display uses NFKC, while source originalText remains
    // unchanged (covered by tokenizer/pipeline unit tests). Noise words stay
    // present in the source excerpt even though none become displayed terms.
    await expect(drawer.locator('.context-list article p').first()).toContainText('はい!研究。いいえ。ロボット。');
    await expect(drawer.locator('.context-list article p').first()).toContainText('OK!? OK yes no okay');
    await expect(drawer.locator('mark').first()).toHaveText('研究');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    await openAnalysis(page);
    await page.getByText('表示条件を変える', { exact: true }).click();
    for (const mode of ['単語のみ', '単語＋フレーズ']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      await expect(page.getByText('更新中')).toBeHidden();
      await expect(page.getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await assertContentTerms(page);
    }
    await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const desktop = await assertCloudGeometry(page);
    await page.screenshot({ path: 'output/playwright/promptprint-noise-desktop.png' });

    await openAnalysis(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNGを書き出す' }).click();
    const download = await downloadPromise;
    await download.saveAs('output/playwright/promptprint-noise-export.png');
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    if (stream) for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const png = Buffer.concat(chunks);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.byteLength).toBeGreaterThan(10_000);
    const drawnTexts = await page.evaluate(() => window.__promptprintCanvasTexts);
    expect(drawnTexts.map((text) => text.normalize('NFKC')).some((text) => noiseTerm.test(text))).toBe(false);
    expect(drawnTexts.join(' ')).not.toMatch(/SYNTHETIC_NOISE_PRIVATE_TITLE|はい|いいえ|ください|\b(?:ok|okay|yes|no)\b/iu);
    for (const term of expectedTerms) expect(drawnTexts).toContain(term);
    const ink = await page.evaluate(() => window.__promptprintInk);
    expect(ink).toHaveLength(desktop.terms.length);
    for (const [index, box] of ink.entries()) {
      expect(box.x).toBeGreaterThan(120);
      expect(box.x + box.width).toBeLessThan(2080);
      expect(box.y).toBeGreaterThan(240);
      expect(box.y + box.height).toBeLessThan(1120);
      if (desktop.terms[index]!.label === 'user') expect(box.x + box.width).toBeLessThan(1100);
      if (desktop.terms[index]!.label === 'assistant') expect(box.x).toBeGreaterThan(1100);
      for (const other of ink.slice(index + 1)) expect(box.x < other.x + other.width && box.x + box.width > other.x &&
        box.y < other.y + other.height && box.y + box.height > other.y).toBe(false);
    }

    await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.mirror-cloud')).toHaveClass(/mirror-cloud--overview/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await assertContentTerms(page);
    await assertCloudGeometry(page, true);
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.screenshot({ path: 'output/playwright/promptprint-noise-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.mirror-cloud')).not.toHaveClass(/mirror-cloud--overview/);
    expect(await assertCloudGeometry(page)).toEqual(desktop);
    expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);
    await clearAnalysis(page);
    await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
    expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);
    expect(guards.externalRequests).toEqual([]);
    expect(guards.consoleErrors).toEqual([]);
  });

  test('punctuation and acknowledgments alone produce an empty cloud and remain clearable and reusable', async ({ page }) => {
    const guards = installGuards(page);
    await page.goto('/');
    const conversations = Array.from({ length: 4 }, (_, index) => ({ id: `synthetic-empty-${index}`, messages: [
      { id: `${index}-u`, role: 'user', content: `${acknowledgments}${punctuation}`.repeat(30) },
      { id: `${index}-a`, role: 'assistant', content: `${punctuation}${acknowledgments}`.repeat(30) },
    ] }));
    await page.getByTestId('file-input').setInputFiles({ name: 'synthetic-noise-only.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(conversations)) });
    await expect(page.getByTestId('mirror-cloud')).toBeVisible();
    await expect(page.getByText('この条件では表示できる語がありません')).toBeVisible();
    await expect(page.locator('.mirror-cloud [data-term]')).toHaveCount(0);
    await expect(page.getByTestId('cloud-caption')).toContainText('表示 0語');
    await page.screenshot({ path: 'output/playwright/promptprint-noise-empty.png' });
    expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);
    await clearAnalysis(page);
    await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
    await page.getByRole('button', { name: 'デモを見る' }).click();
    await expect(page.getByRole('button', { name: /^ロボット、/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^研究、/ }).first()).toBeVisible();
    expect(await readBrowserStorage(page)).toEqual(EMPTY_BROWSER_STORAGE);
    expect(guards.externalRequests).toEqual([]);
    expect(guards.consoleErrors).toEqual([]);
  });
});
