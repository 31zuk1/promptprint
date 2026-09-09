import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NormalizedConversation } from '../src/domain/models';
import type { PrivateCheckpoint, PrivateConversationRecord } from '../src/private/models';

// Disposable synthetic IndexedDB only: no ChatGPT page, credentials, source GET,
// real browser profile, or real history is used. All HTTP(S) is refused and counted.
const EVIDENCE = '/private/tmp/promptprint-private-20260909/test-evidence';
const EMAIL = 'spatial-fixture@example.invalid';
const namespace = JSON.stringify(['chatgpt', 'synthetic-spatial-account', 'synthetic-spatial-workspace']);
const at = (day: string) => Date.parse(`${day}T12:00:00+09:00`);
const diagnostics = { skippedMessages: 0, truncatedConversations: 0 };
const conversations: NormalizedConversation[] = [
  ['first', '2026-01-01'], ['last', '2026-01-03'], ['undated', null],
].map(([id, day]) => {
  const conversationId = `synthetic-spatial-${id!}`;
  const timestamp = day ? at(day) : null;
  return { id: conversationId, title: `SYNTHETIC_SPATIAL_TITLE_${id!}`, provider: 'chatgpt',
    createdAt: timestamp, updatedAt: timestamp,
    messages: Array.from({ length: 4 }, (_, index) => {
      const role = index < 2 ? 'user' as const : 'assistant' as const;
      // A noun, not the adjective "undated": this fixture tests missing dates,
      // not bypassing the production POS policy.
      const word = !day ? 'cobalt' : (role === 'user') === (id === 'first') ? 'alpha' : 'bravo';
      const originalText = `${word} ${word}\n> SYNTHETIC_PRIVATE_EXCERPT_MUST_NOT_EXPORT\nhttps://spatial-private.invalid/sentinel spatial-identity@example.invalid`;
      return { id: `${conversationId}-${index}`, conversationId, provider: 'chatgpt' as const, role,
        createdAt: timestamp, order: index, originalText, analysisText: originalText };
    }),
  };
});
const checkpoint: PrivateCheckpoint = {
  version: 1, namespace, identity: { accountId: 'synthetic-spatial-account',
    workspaceId: 'synthetic-spatial-workspace', email: EMAIL, personal: true, plan: 'pro' },
  target: 100, items: conversations.map((conversation) => ({ id: conversation.id,
    createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, state: 'done', attempts: 0,
    messageCount: 4, diagnostics, errorCode: null })),
  cursor: null, seenCursors: [], listExhausted: true, totalAvailable: null, order: 'updated',
  startedAt: at('2026-01-04'), updatedAt: at('2026-01-04'), phase: 'paused', revision: 1,
};
const records = conversations.map((conversation) => ({
  key: JSON.stringify([namespace, conversation.id]), namespace,
  record: { id: conversation.id, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
    fetchedAt: at('2026-01-04'), conversation, diagnostics } satisfies PrivateConversationRecord,
}));

interface Harness { context: BrowserContext; page: Page; network: string[]; errors: string[] }
async function harness(): Promise<Harness> {
  await mkdir(EVIDENCE, { recursive: true });
  const profile = await mkdtemp('/private/tmp/promptprint-private-spatial-synthetic-');
  const extension = resolve('dist-private');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.setDefaultTimeout(15_000);
  const network: string[] = [];
  const errors: string[] = [];
  context.on('request', (request) => { if (/^https?:/u.test(request.url())) network.push(request.url()); });
  await context.route(/^https?:/u, async (route) => { await route.abort(); });
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.addInitScript(() => {
    const state = window as unknown as { spatialAnalysisRequests: number; spatialCanvasTexts: string[] };
    state.spatialAnalysisRequests = 0;
    state.spatialCanvasTexts = [];
    window.Worker = new Proxy(window.Worker, {
      construct(Target, args: [string | URL, WorkerOptions?]) {
        const instance = new Target(...args);
        const post = instance.postMessage.bind(instance);
        instance.postMessage = (message: unknown, options?: Transferable[] | StructuredSerializeOptions) => {
          if (message && typeof message === 'object' && 'type' in message && message.type === 'ANALYZE_STORED') {
            state.spatialAnalysisRequests += 1;
          }
          if (Array.isArray(options)) post(message, options);
          else post(message, options);
        };
        return instance;
      },
    });
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fillText>) {
      state.spatialCanvasTexts.push(args[0]);
      return Reflect.apply(fillText, this, args);
    };
  });
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/private.html`);
  await expect(page.getByLabel('本人の個人アカウント')).toBeVisible();
  await page.evaluate(async ({ checkpoint, records, email }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('promptprint-private-v1', 1);
      open.onupgradeneeded = () => {
        const conversations = open.result.createObjectStore('conversations', { keyPath: 'key' });
        conversations.createIndex('namespace', 'namespace');
        open.result.createObjectStore('checkpoints', { keyPath: 'namespace' });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error('Synthetic spatial fixture initialization failed'));
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['conversations', 'checkpoints'], 'readwrite');
      tx.objectStore('checkpoints').put(checkpoint);
      for (const row of records) tx.objectStore('conversations').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Synthetic spatial fixture write failed'));
    });
    db.close();
    localStorage.setItem('promptprint-private:expected-email', email);
  }, { checkpoint, records, email: EMAIL });
  await page.reload();
  await expect(page.getByTestId('private-status')).toHaveAttribute('data-fetched', '3');
  await expect(page.getByTestId('private-status')).toHaveAttribute('data-messages', '12');
  await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '3');
  return { context, page, network, errors };
}

async function storedBodies(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('promptprint-private-v1');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error('Synthetic fixture inspection failed'));
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction('conversations').objectStore('conversations').getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(new Error('Synthetic fixture inspection failed'));
    });
    db.close();
    return rows;
  });
}
const analysisRequests = (page: Page) => page.evaluate(() =>
  (window as unknown as { spatialAnalysisRequests: number }).spatialAnalysisRequests);
const worldCoordinates = (page: Page) => page.locator('[data-spatial-term]').evaluateAll((nodes) => nodes
  .map((node) => ({ term: node.getAttribute('data-spatial-term'), x: node.getAttribute('data-world-x'),
    y: node.getAttribute('data-world-y'), z: node.getAttribute('data-world-z') }))
  .sort((a, b) => (a.term ?? '').localeCompare(b.term ?? '')));
async function assertSpatialFlow(page: Page) {
  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    return { openingBottom: rect('.dashboard__opening').bottom, spatialBottom: rect('.spatial-view').bottom,
      cloudBottom: rect('.spatial-canvas').bottom, controlsBottom: rect('.spatial-controls').bottom,
      selectionBottom: rect('.spatial-selection').bottom, captionBottom: rect('.spatial-caption').bottom,
      analysisTop: rect('.analysis-shell').top };
  });
  // Visibility alone misses a diagram painted behind the following opaque analysis panel.
  const contentBottom = Math.max(geometry.cloudBottom, geometry.controlsBottom,
    geometry.selectionBottom, geometry.captionBottom);
  expect(geometry.spatialBottom).toBeGreaterThanOrEqual(contentBottom - 0.5);
  expect(geometry.openingBottom).toBeGreaterThanOrEqual(contentBottom - 0.5);
  expect(geometry.analysisTop).toBeGreaterThanOrEqual(contentBottom - 0.5);
}

test('private saved history switches to 3D offline with exact metrics, camera-only projection, periods and private PNG', async () => {
  const h = await harness();
  try {
    const { page } = h;
    const before = await storedBodies(page);
    const requests = await analysisRequests(page);
    await expect(page.locator('.mirror-cloud')).toBeVisible();
    await page.getByRole('button', { name: '3D 分布', exact: true }).click();
    const cloud = page.getByTestId('spatial-cloud');
    await expect(cloud).toBeVisible();
    await expect(page.locator('[data-spatial-term]')).toHaveCount(3);
    const alpha = page.locator('[data-spatial-term="alpha"]');
    await expect(alpha).toHaveAttribute('data-world-x', '0');
    await expect(alpha).toHaveAttribute('data-world-y', String(1 / 3));
    await expect(alpha).toHaveAttribute('data-world-z', String(2 / 3));
    const coordinates = await worldCoordinates(page);
    const originalProjection = await alpha.getAttribute('data-projected-x');
    await page.getByText('視点を操作', { exact: true }).click();
    await page.getByRole('button', { name: '右へ回転', exact: true }).click();
    await expect(cloud).toHaveAttribute('data-yaw', '-16');
    await expect(alpha).not.toHaveAttribute('data-projected-x', originalProjection!);
    expect(await worldCoordinates(page)).toEqual(coordinates);
    await cloud.focus();
    await page.keyboard.press('ArrowUp');
    await expect(cloud).toHaveAttribute('data-pitch', '28');
    await page.getByRole('button', { name: '視点をリセット', exact: true }).click();
    await expect(cloud).toHaveAttribute('data-yaw', '-28');
    await expect(cloud).toHaveAttribute('data-pitch', '20');
    await expect(alpha).toHaveAttribute('data-projected-x', originalProjection!);
    expect(await analysisRequests(page)).toBe(requests);

    const timeline = page.getByRole('region', { name: '期間と時系列プレビュー' });
    await timeline.locator('summary').click();
    await timeline.getByLabel('開始日', { exact: true }).fill('2026-01-01');
    await timeline.getByLabel('終了日', { exact: true }).fill('2026-01-01');
    await timeline.getByRole('button', { name: '期間を適用', exact: true }).click();
    await expect(page.getByTestId('timeline-current-period')).toHaveText('2026-01-01 – 2026-01-01');
    await expect(alpha).toHaveAttribute('data-world-x', '-1');
    await expect(alpha).toHaveAttribute('data-world-y', '0.5');
    await expect(alpha).toHaveAttribute('data-world-z', '1');
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '1');
    await page.getByLabel('3Dで選ぶ語').selectOption('bravo');
    await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('bravo');
    await drawer.getByRole('button', { name: 'この語を表示から隠す' }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.locator('[data-spatial-term="bravo"]')).toHaveCount(0);
    await expect(page.locator('[data-spatial-term]')).toHaveCount(1);
    await assertSpatialFlow(page);
    await page.screenshot({ path: `${EVIDENCE}/synthetic-private-spatial-desktop.png`, fullPage: true });

    await page.getByRole('button', { name: '右へ回転', exact: true }).click();
    await expect(cloud).toHaveAttribute('data-yaw', '-16');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNGを書き出す', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^promptprint-.*\.png$/u);
    const pngPath = `${EVIDENCE}/synthetic-private-spatial-export.png`;
    await download.saveAs(pngPath);
    const png = await readFile(pngPath);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.length).toBeGreaterThan(10_000);
    const drawn = await page.evaluate(() => (window as unknown as { spatialCanvasTexts: string[] }).spatialCanvasTexts);
    expect(drawn).toContain('alpha');
    expect(drawn).not.toContain('bravo');
    expect(drawn.some((text) => text.includes('2026-01-01 – 2026-01-01'))).toBe(true);
    expect(drawn.some((text) => text.includes('3D') && text.includes('-16.0°'))).toBe(true);
    expect(drawn.join('\n')).not.toMatch(/SYNTHETIC_SPATIAL_TITLE|SYNTHETIC_PRIVATE_EXCERPT|spatial-private\.invalid|spatial-identity@example|spatial-fixture@example/u);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(cloud).toBeVisible();
    await expect(alpha).toHaveAttribute('data-world-x', '-1');
    await expect(alpha).toHaveAttribute('data-world-y', '0.5');
    await expect(alpha).toHaveAttribute('data-world-z', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await assertSpatialFlow(page);
    await cloud.scrollIntoViewIfNeeded();
    await cloud.screenshot({ path: `${EVIDENCE}/synthetic-private-spatial-mobile-cloud.png` });
    await page.screenshot({ path: `${EVIDENCE}/synthetic-private-spatial-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: '2D ミラー', exact: true }).click();
    await expect(page.locator('.mirror-cloud [data-term="alpha"]')).toHaveAttribute('data-bias-label', 'user');
    await page.getByRole('button', { name: '3D 分布', exact: true }).click();
    await expect(cloud).toHaveAttribute('data-yaw', '-16');
    expect(await storedBodies(page)).toEqual(before);
    await page.reload();
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '3');
    await expect(page.getByTestId('timeline-current-period')).toHaveText('全期間');
    await expect(page.locator('.mirror-cloud')).toBeVisible();
    expect(await storedBodies(page)).toEqual(before);
    expect(h.network).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { await h.context.close(); }
});
