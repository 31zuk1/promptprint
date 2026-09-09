import { expect, test, type Page } from '@playwright/test';
import { expectedSubjectFamilies, grammaticalDebris, naturalMixedTopicCorpus } from '../src/test/fixtures/topic-quality';

const PRIVATE_TITLE = 'SYNTHETIC_QUALITY_PRIVATE_TITLE';
const PRIVATE_EMAIL = 'quality-fixture@example.invalid';
const SUBJECT = '乳酸発酵';

declare global {
  interface Window { __qualityDrawStrings: string[] }
}

const fixture = () => naturalMixedTopicCorpus().map((conversation) => ({
  id: conversation.id,
  title: `${PRIVATE_TITLE}_${conversation.id}`,
  create_time: conversation.createdAt! / 1000,
  messages: conversation.messages.map((message) => ({
    id: message.id,
    author: { role: message.role },
    create_time: message.createdAt! / 1000,
    content: `${message.originalText}\n${PRIVATE_EMAIL}`,
  })),
}));

const displayedTerms = (page: Page) => page.locator('.mirror-cloud [data-term]').evaluateAll((nodes) =>
  nodes.map((node) => node.getAttribute('data-term')!));

const assertGeometry = async (page: Page) => {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const scene = await page.locator('.mirror-cloud').evaluate((node) => {
    const svg = node as SVGSVGElement;
    return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
      glyphs: [...svg.querySelectorAll<SVGGElement>('[data-term]')].map((group) => {
        const rect = group.querySelector('text')!.getBBox();
        return { label: group.dataset.biasLabel, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }) };
  });
  expect(scene.glyphs.length).toBeGreaterThan(0);
  for (const [index, glyph] of scene.glyphs.entries()) {
    expect(glyph.x).toBeGreaterThanOrEqual(0);
    expect(glyph.y).toBeGreaterThanOrEqual(0);
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(scene.width);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(scene.height);
    if (glyph.label === 'user') expect(glyph.x + glyph.width).toBeLessThan(scene.width / 2);
    if (glyph.label === 'assistant') expect(glyph.x).toBeGreaterThan(scene.width / 2);
    for (const other of scene.glyphs.slice(index + 1)) {
      expect(glyph.x < other.x + other.width && glyph.x + glyph.width > other.x &&
        glyph.y < other.y + other.height && glyph.y + glyph.height > other.y).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
};

const openSubject = async (page: Page, spatial = false) => {
  if (spatial) {
    await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).selectOption(SUBJECT);
    await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
  } else {
    await page.locator(`.mirror-cloud [data-term="${SUBJECT}"]`).focus();
    await page.keyboard.press('Enter');
  }
  const drawer = page.getByRole('dialog', { name: SUBJECT, exact: true });
  await expect(drawer).toBeVisible();
  expect(await drawer.getByRole('row', { name: '出現発言 / 全発言' }).locator('td').allTextContents())
    .toEqual(['6 / 60', '6 / 60']);
  await expect(drawer.locator('.term-metrics')).toContainText('10.0%');
  await expect(drawer.locator('.term-metrics')).toContainText('3件');
  await expect(drawer.locator('.context-list')).toContainText(PRIVATE_TITLE);
  await expect(drawer.locator('.context-list')).toContainText('塩分濃度');
  const metrics = await drawer.locator('.term-metrics').innerText();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  return metrics;
};

test('natural Japanese conversations produce evidenced subjects on desktop, mobile, 3D and private-text-free PNG', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const unexpectedHosts: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) unexpectedHosts.push(request.url());
  });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__qualityDrawStrings = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
      window.__qualityDrawStrings.push(String(text));
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'synthetic-natural-topic-quality.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture())),
  });
  await expect(page.getByTestId('mirror-cloud')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'PNGを書き出す', exact: true })).toBeEnabled();
  const labels = await displayedTerms(page);
  expect(expectedSubjectFamilies.filter((family) => family.some((term) => labels.includes(term))).length,
    `rendered subjects: ${labels.join(' / ')}`).toBeGreaterThanOrEqual(9);
  expect(labels.filter((term) => grammaticalDebris.has(term))).toEqual([]);
  await assertGeometry(page);
  const metrics = await openSubject(page);
  await page.getByRole('button', { name: '2D ミラー', exact: true }).focus();
  await page.mouse.move(1, 1);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByTestId('cloud-caption')).toContainText('話題優先');
  await page.screenshot({ path: 'output/playwright/promptprint-quality-desktop.png' });

  await page.evaluate(() => { window.__qualityDrawStrings = []; });
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
  const download = await pendingDownload;
  await download.saveAs('output/playwright/promptprint-quality-export.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.length).toBeGreaterThan(10_000);
  const exported = await page.evaluate(() => window.__qualityDrawStrings);
  expect(exported).toContain(SUBJECT);
  expect(exported.join('\n')).not.toContain(PRIVATE_TITLE);
  expect(exported.join('\n')).not.toContain(PRIVATE_EMAIL);
  expect(exported.join('\n')).not.toContain(naturalMixedTopicCorpus()[0]!.messages[0]!.originalText);
  expect(exported.filter((term) => grammaticalDebris.has(term))).toEqual([]);
  await expect(page.locator('.toast')).toHaveCount(0);

  await page.getByRole('button', { name: 'クラウド全体を見る', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mirror-cloud--overview')).toBeVisible();
  await assertGeometry(page);
  expect((await displayedTerms(page)).filter((term) => grammaticalDebris.has(term))).toEqual([]);
  await page.screenshot({ path: 'output/playwright/promptprint-quality-mobile.png' });
  await page.getByRole('button', { name: '3D 分布', exact: true }).click();
  await expect(page.getByTestId('spatial-cloud')).toBeVisible();
  const points = await page.locator('[data-spatial-term]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-spatial-term')!).sort());
  expect(points).toEqual([...labels].sort());
  expect(await openSubject(page, true)).toBe(metrics);
  const subjectPoint = page.locator(`[data-spatial-term="${SUBJECT}"]`);
  await expect(subjectPoint).toHaveAttribute('data-world-x', '0');
  expect(Number(await subjectPoint.getAttribute('data-world-y'))).toBeCloseTo(0.1, 12);
  expect(Number(await subjectPoint.getAttribute('data-world-z'))).toBeCloseTo(0.1, 12);
  await page.getByRole('button', { name: 'クラウド全体を見る', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/promptprint-quality-mobile-3d.png' });

  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }))).toEqual({ local: 0, session: 0, cookie: '', databases: 0, caches: 0, serviceWorkers: 0 });
  expect(unexpectedHosts).toEqual([]);
  expect(errors).toEqual([]);
});
