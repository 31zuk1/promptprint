import { expect, test, type Page } from '@playwright/test';

const TEST_ORIGIN = 'http://127.0.0.1:4173';
const PRIVATE_TITLE = 'SYNTHETIC_TIMELINE_PRIVATE_TITLE';
const PRIVATE_EMAIL = 'synthetic-timeline@example.invalid';
const period = (start: string, end: string) => `${start} – ${end}`;
const JANUARY = period('2026-01-31', '2026-01-31');
const FEBRUARY = period('2026-02-01', '2026-02-28');
const MARCH = period('2026-03-01', '2026-03-31');
const APRIL = period('2026-04-01', '2026-04-01');

declare global {
  interface Window {
    __timelineDelay: number;
    __timelineRequests: Array<{ start: string; end: string }>;
  }
}

// All instants are explicit JST boundaries, not relative to the machine's date/time zone.
const fixture = () => {
  const pairs = (id: string, userTerm: string, assistantTerm: string, dates: Array<string | null>) =>
    dates.flatMap((date, index) => (['user', 'assistant'] as const).map((role) => ({
      id: `${id}-${index}-${role}`,
      author: { role },
      ...(date ? { create_time: Date.parse(date) / 1000 } : {}),
      content: `${role === 'user' ? userTerm : assistantTerm}。データ。はい！ ${PRIVATE_EMAIL}`,
    })));
  return [
    { id: 'timeline-january', title: `${PRIVATE_TITLE}_JAN`, messages: pairs('jan', '研究', '検証', [
      '2026-01-31T23:59:58+09:00', '2026-01-31T23:59:59+09:00',
    ]) },
    { id: 'timeline-february', title: `${PRIVATE_TITLE}_FEB`, messages: pairs('feb', 'ロボット', 'リスク', [
      '2026-02-01T00:00:00+09:00', '2026-02-01T00:00:01+09:00',
      '2026-02-28T23:59:58+09:00', '2026-02-28T23:59:59+09:00',
    ]) },
    { id: 'timeline-april', title: `${PRIVATE_TITLE}_APR`, messages: pairs('apr', '留学', '要件', [
      '2026-04-01T00:00:00+09:00', '2026-04-01T00:00:01+09:00',
    ]) },
    { id: 'timeline-undated', title: `${PRIVATE_TITLE}_UNKNOWN`, messages: pairs('unknown', '旅行', '制約', [null, null]) },
  ];
};

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

const openFixture = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'synthetic-timeline.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture())),
  });
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await expect(page.locator('.mirror-cloud [data-term="研究"]')).toBeVisible();
  const fold = page.locator('details').filter({ has: page.getByText('期間・時系列', { exact: true }) });
  await expect(fold).not.toHaveAttribute('open');
  await page.getByText('期間・時系列', { exact: true }).click();
  await expect(fold).toHaveAttribute('open', '');
  await expect(page.getByTestId('timeline-current-period')).toContainText('全期間');
  await expect(page.getByLabel('再生単位')).toHaveValue('month');
  await expect(page.getByLabel('再生方法')).toHaveValue('window');
  await expect(page.getByLabel('表示間隔')).toHaveValue('2000');
  await expect(page.getByLabel('開始日', { exact: true })).toHaveValue('2026-01-31');
  await expect(page.getByLabel('終了日', { exact: true })).toHaveValue('2026-04-01');
  await expect(fold).toContainText('日時不明 4発言');
};

const settled = async (page: Page) => {
  await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
};

const ensureOptions = async (page: Page) => {
  if (await page.locator('.timeline__details').getAttribute('open') === null) {
    await page.getByText('期間・時系列', { exact: true }).click();
  }
};

const expectCounts = async (page: Page, conversations: number, user: number, assistant: number) => {
  for (const [label, count] of [['会話', conversations], ['あなたの発言', user], ['AIの発言', assistant]] as const) {
    const card = page.locator('.stat-card').filter({ has: page.getByText(label, { exact: true }) });
    await expect(card.locator('strong')).toHaveText(`${count}件`);
  }
};

const applyRange = async (page: Page, start: string, end: string) => {
  await ensureOptions(page);
  await page.getByLabel('開始日', { exact: true }).fill(start);
  await page.getByLabel('終了日', { exact: true }).fill(end);
  await page.getByRole('button', { name: '期間を適用', exact: true }).click();
  await settled(page);
};

const seekFirst = async (page: Page) => {
  await ensureOptions(page);
  const slider = page.getByRole('slider', { name: '表示する時点' });
  // End then Home ensures a real input event even when all-time has the initial value 0.
  await slider.press('End');
  await settled(page);
  await slider.press('Home');
  await settled(page);
};

const expectPeriod = async (page: Page, value: string) => {
  await expect(page.getByTestId('timeline-current-period')).toHaveText(value);
  await settled(page);
};

const cloudTerms = (page: Page) => page.locator('.mirror-cloud [data-term]').evaluateAll((nodes) =>
  nodes.map((node) => node.getAttribute('data-term')).sort());

const expectTerms = async (page: Page, terms: string[]) => {
  await expect.poll(() => cloudTerms(page)).toEqual([...terms].sort());
};

const assertGeometry = async (page: Page, mobile = false) => {
  if (await page.locator('.timeline__details').getAttribute('open') !== null) {
    await page.getByText('期間・時系列', { exact: true }).click();
  }
  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const geometry = await page.locator('.mirror-cloud').evaluate((node) => {
    const svg = node as SVGSVGElement;
    return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
      terms: [...svg.querySelectorAll<SVGGElement>('[data-term]')].map((group) => {
        const glyph = group.querySelector('text')!.getBBox();
        return { label: group.dataset.biasLabel, bias: Number(group.dataset.bias),
          box: JSON.parse(group.dataset.box!) as { x: number; y: number; width: number; height: number },
          glyph: { x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height } };
      }) };
  });
  expect(geometry.terms.length).toBeGreaterThan(0);
  const padding = mobile ? 8 : 18;
  for (const [index, term] of geometry.terms.entries()) {
    const { glyph, box } = term;
    const target = geometry.width / 2 - term.bias * (geometry.width / 2 - (mobile ? 50 : 90));
    expect(Math.abs(box.x - target)).toBeLessThanOrEqual(geometry.width * 0.055 + 0.02);
    expect(glyph.x).toBeGreaterThanOrEqual(Math.max(padding, box.x - box.width / 2) - 0.1);
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(Math.min(geometry.width - padding, box.x + box.width / 2) + 0.1);
    expect(glyph.y).toBeGreaterThanOrEqual(Math.max(padding, box.y - box.height / 2) - 0.1);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(Math.min(geometry.height - padding, box.y + box.height / 2) + 0.1);
    if (term.label === 'user') expect(glyph.x + glyph.width).toBeLessThan(geometry.width / 2);
    if (term.label === 'assistant') expect(glyph.x).toBeGreaterThan(geometry.width / 2);
    for (const other of geometry.terms.slice(index + 1)) {
      const right = other.glyph;
      expect(glyph.x < right.x + right.width && glyph.x + glyph.width > right.x &&
        glyph.y < right.y + right.height && glyph.y + glyph.height > right.y).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  const caption = await page.getByTestId('cloud-caption').boundingBox();
  expect(caption!.y + caption!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  return geometry;
};

test('timeline date bounds use inclusive JST messages, preserve unknown dates only in all-time, and recover from empty periods', async ({ page }) => {
  const guards = installGuards(page);
  await openFixture(page);
  await expectCounts(page, 4, 10, 10);
  await applyRange(page, '2026-02-01', '2026-02-28');
  await expectPeriod(page, FEBRUARY);
  await expectCounts(page, 1, 4, 4);
  await expectTerms(page, ['ロボット', 'リスク', 'データ']);
  await assertGeometry(page);
  await page.locator('.mirror-cloud [data-term="ロボット"]').click();
  const drawer = page.getByRole('dialog', { name: 'ロボット' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('4 / 4');
  await expect(drawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('0 / 4');
  await expect(drawer.locator('.context-list')).toContainText('はい!');
  await page.keyboard.press('Escape');

  await applyRange(page, '2026-02-01', '2026-02-01');
  await expectPeriod(page, period('2026-02-01', '2026-02-01'));
  await expectCounts(page, 1, 2, 2);
  await applyRange(page, '2026-02-28', '2026-02-28');
  await expectPeriod(page, period('2026-02-28', '2026-02-28'));
  await expectCounts(page, 1, 2, 2);
  await page.getByLabel('開始日', { exact: true }).fill('2026-04-01');
  await page.getByLabel('終了日', { exact: true }).fill('2026-02-28');
  await expect(page.getByRole('button', { name: '期間を適用', exact: true })).toBeDisabled();
  await expect(page.getByText('開始日は終了日以前の日付を指定してください。', { exact: true })).toBeVisible();
  await expectPeriod(page, period('2026-02-28', '2026-02-28'));
  await expectCounts(page, 1, 2, 2);

  await applyRange(page, '2026-03-01', '2026-03-31');
  await expectPeriod(page, MARCH);
  await expectCounts(page, 0, 0, 0);
  await expect(page.getByText('この条件では表示できる語がありません', { exact: true })).toBeVisible();
  await expect(page.locator('.mirror-cloud [data-term]')).toHaveCount(0);
  await expect(page.getByTestId('cloud-caption')).toContainText('ChatGPT');
  await expect(page.getByTestId('cloud-caption')).toContainText('2026-03-01');
  await page.getByRole('button', { name: '全期間に戻す', exact: true }).click();
  await settled(page);
  await expect(page.getByTestId('timeline-current-period')).toContainText('全期間');
  await expectCounts(page, 4, 10, 10);
  await expect(page.locator('.mirror-cloud [data-term="旅行"]')).toHaveCount(1);
  await applyRange(page, '', '2026-01-31');
  await expectCounts(page, 1, 2, 2);
  await expectTerms(page, ['研究', '検証', 'データ']);
  await applyRange(page, '2026-04-01', '');
  await expectCounts(page, 1, 2, 2);
  await expectTerms(page, ['留学', '要件', 'データ']);
  await assertGuards(page, guards);
});

test('timeline monthly window/cumulative frames and daily empty frames use real aggregates and keyboard seeking', async ({ page }) => {
  const guards = installGuards(page);
  await openFixture(page);
  await seekFirst(page);
  await expectPeriod(page, JANUARY);
  await expectCounts(page, 1, 2, 2);
  await expectTerms(page, ['研究', '検証', 'データ']);
  await page.getByRole('button', { name: '次の期間', exact: true }).click();
  await expectPeriod(page, FEBRUARY);
  await expectCounts(page, 1, 4, 4);
  await expectTerms(page, ['ロボット', 'リスク', 'データ']);
  await page.getByRole('button', { name: '次の期間', exact: true }).click();
  await expectPeriod(page, MARCH);
  await expectCounts(page, 0, 0, 0);
  await expectTerms(page, []);
  await page.getByRole('button', { name: '次の期間', exact: true }).click();
  await expectPeriod(page, APRIL);
  await expectCounts(page, 1, 2, 2);
  await page.getByRole('button', { name: '前の期間', exact: true }).click();
  await expectPeriod(page, MARCH);

  await page.getByLabel('再生方法').selectOption('cumulative');
  await seekFirst(page);
  await expectPeriod(page, JANUARY);
  await page.getByRole('button', { name: '次の期間', exact: true }).click();
  await expectPeriod(page, period('2026-01-31', '2026-02-28'));
  await expectCounts(page, 2, 6, 6);
  await expectTerms(page, ['研究', '検証', 'ロボット', 'リスク', 'データ']);
  await page.getByRole('button', { name: '次の期間', exact: true }).click();
  await expectPeriod(page, period('2026-01-31', '2026-03-31'));
  await expectCounts(page, 2, 6, 6);
  await page.getByRole('slider', { name: '表示する時点' }).press('End');
  await expectPeriod(page, period('2026-01-31', '2026-04-01'));
  await expectCounts(page, 3, 8, 8);
  await expect(page.locator('.mirror-cloud [data-term="旅行"]')).toHaveCount(0);

  await applyRange(page, '2026-02-28', '2026-03-02');
  await page.getByLabel('再生方法').selectOption('window');
  await page.getByLabel('再生単位').selectOption('day');
  await seekFirst(page);
  await expectPeriod(page, period('2026-02-28', '2026-02-28'));
  await expectCounts(page, 1, 2, 2);
  await page.getByRole('slider', { name: '表示する時点' }).press('ArrowRight');
  await expectPeriod(page, period('2026-03-01', '2026-03-01'));
  await expectCounts(page, 0, 0, 0);
  await expect(page.getByRole('slider', { name: '表示する時点' })).toHaveValue('1');
  await assertGuards(page, guards);
});

test('timeline playback stops for explicit pause, manual filters, context, export and hidden pages; mobile and PNG remain private', async ({ page }) => {
  test.setTimeout(60_000);
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
  await openFixture(page);
  await page.getByLabel('表示間隔').selectOption('1000');
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await expectPeriod(page, JANUARY);
  await expectPeriod(page, FEBRUARY);
  await page.getByRole('button', { name: '再生を停止', exact: true }).click();
  await expect(page.getByRole('button', { name: '時系列を再生', exact: true })).toBeVisible();
  await page.waitForTimeout(1_150);
  await expectPeriod(page, FEBRUARY);
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await expectPeriod(page, MARCH);
  await expectCounts(page, 0, 0, 0);
  await page.getByRole('button', { name: '再生を停止', exact: true }).click();

  await seekFirst(page);
  await page.getByLabel('表示間隔').selectOption('4000');
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await page.getByText('表示条件を変える', { exact: true }).click();
  await page.getByRole('button', { name: '単語のみ', exact: true }).click();
  await settled(page);
  await expect(page.getByRole('button', { name: '時系列を再生', exact: true })).toBeVisible();

  await seekFirst(page);
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await settled(page);
  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await page.locator('.mirror-cloud [data-term]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '再生を停止', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '全期間に戻す', exact: true }).click();
  await settled(page);
  await seekFirst(page);
  await page.getByRole('button', { name: '次の期間', exact: true }).click();
  await expectPeriod(page, FEBRUARY);
  const desktop = await assertGeometry(page);
  await page.screenshot({ path: 'output/playwright/promptprint-timeline-desktop.png' });
  await page.getByText('期間・時系列', { exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await settled(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す' }).click();
  const download = await downloadPromise;
  await download.saveAs('output/playwright/promptprint-timeline-export.png');
  expect(download.suggestedFilename()).toMatch(/^promptprint-.*\.png$/u);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(10_000);
  await expect(page.getByRole('button', { name: '再生を停止', exact: true })).toHaveCount(0);
  const drawn = await page.evaluate(() => window.__promptprintCanvasTexts);
  expect(drawn.join('\n')).toContain('2026-02-01');
  expect(drawn.join('\n')).toContain('2026-02-28');
  expect(drawn.join('\n')).not.toMatch(/SYNTHETIC_TIMELINE_PRIVATE_TITLE|synthetic-timeline@|はい/iu);
  for (const term of ['ロボット', 'リスク', 'データ']) expect(drawn).toContain(term);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mirror-cloud')).toHaveClass(/mirror-cloud--overview/u);
  await assertGeometry(page, true);
  await expect(page.getByText('PNGを書き出しました。', { exact: true })).toBeHidden();
  await page.screenshot({ path: 'output/playwright/promptprint-timeline-mobile-cloud.png' });
  await page.getByText('期間・時系列', { exact: true }).scrollIntoViewIfNeeded();
  await ensureOptions(page);
  const controls = page.locator('details').filter({ has: page.getByText('期間・時系列', { exact: true }) });
  const bounds = await controls.locator('input, select, button').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, width: rect.width, height: rect.height };
  }));
  for (const box of bounds) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'output/playwright/promptprint-timeline-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.mirror-cloud')).not.toHaveClass(/mirror-cloud--overview/u);
  expect(await assertGeometry(page)).toEqual(desktop);

  await ensureOptions(page);
  await page.getByRole('button', { name: '全期間に戻す', exact: true }).click();
  await settled(page);
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await expect(page.getByRole('button', { name: '再生を停止', exact: true })).toBeVisible();
  // Simulate the browser visibility signal without opening any external surface.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '再生を停止', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '時系列を再生', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '解析データを消去' }).click();
  await page.getByRole('button', { name: '消去を実行' }).click();
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  await assertGuards(page, guards);
});

test('timeline waits for worker completion before its dwell and keeps committed labels while stopping a pending frame', async ({ page }) => {
  const guards = installGuards(page);
  await page.addInitScript(() => {
    window.__timelineDelay = 0;
    window.__timelineRequests = [];
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function delayedTimelineMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const data = message as { type?: string; settings?: { timeRange?: string; startDate?: string; endDate?: string } };
      const custom = data.type === 'ANALYZE_NORMALIZED' && data.settings?.timeRange === 'custom';
      if (custom) window.__timelineRequests.push({ start: data.settings?.startDate ?? '', end: data.settings?.endDate ?? '' });
      const send = () => Reflect.apply(original, this, options === undefined ? [message] : [message, options]);
      if (custom && window.__timelineDelay > 0) window.setTimeout(send, window.__timelineDelay);
      else send();
    };
  });
  await openFixture(page);
  await page.getByLabel('表示間隔').selectOption('1000');
  await page.evaluate(() => { window.__timelineDelay = 2200; });
  await page.getByRole('button', { name: '時系列を再生', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__timelineRequests.length)).toBe(1);
  await page.waitForTimeout(1_150);
  await expect(page.getByTestId('timeline-current-period')).toContainText('全期間');
  await expectCounts(page, 4, 10, 10);
  await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeDisabled();
  expect(await page.evaluate(() => window.__timelineRequests.length)).toBe(1);
  await expectPeriod(page, JANUARY);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__timelineRequests.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__timelineRequests.length)).toBe(2);
  await expect(page.getByTestId('timeline-current-period')).toHaveText(JANUARY);
  await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeDisabled();
  await page.getByRole('button', { name: '再生を停止', exact: true }).click();
  await expectPeriod(page, FEBRUARY);
  await expectCounts(page, 1, 4, 4);
  await page.waitForTimeout(1_150);
  expect(await page.evaluate(() => window.__timelineRequests)).toEqual([
    { start: '2026-01-31', end: '2026-01-31' },
    { start: '2026-02-01', end: '2026-02-28' },
  ]);
  await expect(page.getByTestId('timeline-current-period')).toHaveText(FEBRUARY);
  await expect(page.getByRole('button', { name: '時系列を再生', exact: true })).toBeVisible();
  await assertGuards(page, guards);
});

test('timeline context selection snapshots January metrics and excerpts while a February result completes', async ({ page }) => {
  const guards = installGuards(page);
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    window.__timelineDelay = 0;
    Worker.prototype.postMessage = function delayedTimelineMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
      const data = message as { type?: string; settings?: { timeRange?: string } };
      const custom = data.type === 'ANALYZE_NORMALIZED' && data.settings?.timeRange === 'custom';
      const send = () => Reflect.apply(original, this, options === undefined ? [message] : [message, options]);
      if (custom && window.__timelineDelay > 0) window.setTimeout(send, window.__timelineDelay);
      else send();
    };
  });
  await openFixture(page);
  await seekFirst(page);
  await expectPeriod(page, JANUARY);
  await page.evaluate(() => { window.__timelineDelay = 2200; });
  await page.getByRole('button', { name: '次の期間', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeDisabled();
  await expect(page.getByTestId('timeline-current-period')).toHaveText(JANUARY);
  await page.locator('.mirror-cloud [data-term="研究"]').click();
  const drawer = page.getByRole('dialog', { name: '研究', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(`選択時の期間 ${JANUARY}（日本時間）`, { exact: true })).toBeVisible();
  await expect(drawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('2 / 2');
  await expect(drawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('0 / 2');
  await expect(drawer.locator('.context-list article')).toHaveCount(2);
  await expect(drawer.locator('.context-list')).toContainText(`${PRIVATE_TITLE}_JAN`);
  await expect(drawer.locator('.context-list')).toContainText('研究。データ。はい!');
  const frozenMetrics = await drawer.locator('.term-metrics').textContent();
  const frozenContexts = await drawer.locator('.context-list').textContent();

  // The underlying cloud advances; the already-open drawer must retain its own
  // coherent term + bounded contexts + period snapshot, not today's result index.
  await expect(page.getByTestId('timeline-current-period')).toHaveText(FEBRUARY);
  await expectCounts(page, 1, 4, 4);
  await expectTerms(page, ['ロボット', 'リスク', 'データ']);
  await expect(drawer.getByText(`選択時の期間 ${JANUARY}（日本時間）`, { exact: true })).toBeVisible();
  expect(await drawer.locator('.term-metrics').textContent()).toBe(frozenMetrics);
  expect(await drawer.locator('.context-list').textContent()).toBe(frozenContexts);
  await expect(drawer.locator('.context-list')).not.toContainText(`${PRIVATE_TITLE}_FEB`);
  await expect(drawer.locator('.context-list')).not.toContainText('ロボット');
  await page.screenshot({ path: 'output/playwright/promptprint-timeline-selection.png' });

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await page.locator('.mirror-cloud [data-term="ロボット"]').click();
  const nextDrawer = page.getByRole('dialog', { name: 'ロボット', exact: true });
  await expect(nextDrawer.getByText(`選択時の期間 ${FEBRUARY}（日本時間）`, { exact: true })).toBeVisible();
  await expect(nextDrawer.getByRole('row', { name: '出現発言 / 全発言' })).toContainText('4 / 4');
  await expect(nextDrawer.locator('.context-list article')).toHaveCount(4);
  await expect(nextDrawer.locator('.context-list')).toContainText(`${PRIVATE_TITLE}_FEB`);
  await expect(nextDrawer.locator('.context-list')).not.toContainText(`${PRIVATE_TITLE}_JAN`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '解析データを消去' }).click();
  await page.getByRole('button', { name: '消去を実行' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'デモを見る' })).toBeVisible();
  await assertGuards(page, guards);
});
