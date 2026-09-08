import { expect, test, type Page } from '@playwright/test';

const TEST_ORIGIN = 'http://127.0.0.1:4173';

declare global {
  interface Window {
    __promptprintCanvasTexts: string[];
    __promptprintCreatedUrls: string[];
    __promptprintRevokedUrls: string[];
    __promptprintCreatedUrlCount: number;
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

test('demo exploration, filters, privacy-safe PNG, screenshot, and clear flow', async ({ page }) => {
  const guards = installGuards(page);
  await page.addInitScript(() => {
    window.__promptprintCanvasTexts = [];
    window.__promptprintCreatedUrls = [];
    window.__promptprintRevokedUrls = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
      window.__promptprintCanvasTexts.push(String(text));
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
      { id: `u-${index}`, role: 'user', content: 'private orbital focus' },
      { id: `a-${index}`, role: 'assistant', content: 'private requirement response' },
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
  await page.getByRole('button', { name: /^private、/ }).first().click();
  await page.getByRole('button', { name: 'この語を表示から隠す' }).click();
  await openAnalysis(page);
  const exportButton = page.getByRole('button', { name: 'PNGを書き出す' });
  await expect(exportButton).toBeDisabled();

  let leakedExportWindow = false;
  await expect.poll(async () => {
    const hiddenTermStillVisible = await page.locator('[data-term="private"]').count() > 0;
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

    const opening = page.locator('.dashboard__opening');
    await expect(opening.getByText('あなた ←')).toBeVisible();
    await expect(opening.getByText('共有語彙')).toBeVisible();
    await expect(opening.getByText('→ AI')).toBeVisible();
    await expect(page.getByRole('button', { name: '要点 24語' })).toHaveAttribute('aria-pressed', 'true');
    const cloudScroller = page.getByTestId('mirror-cloud');
    await page.getByRole('button', { name: /詳しく見る 49語/ }).click();
    await cloudScroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    expect(await cloudScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.getByRole('button', { name: '要点 24語' }).click();
    await page.getByRole('button', { name: /^ロボット、/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'ロボット' })).toBeVisible();
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
