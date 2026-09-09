import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NormalizedConversation } from '../src/domain/models';
import type { PrivateCheckpoint, PrivateConversationRecord } from '../src/private/models';

// SYNTHETIC local DB only. No ChatGPT tab, source response, credentials or real
// profile is used; any HTTP(S) attempt fails these tests.
const EVIDENCE = '/private/tmp/promptprint-private-20260909/test-evidence';
const EMAIL = 'timeline-fixture@example.invalid';
const namespace = JSON.stringify(['chatgpt', 'synthetic-timeline-account', 'synthetic-timeline-workspace']);
const at = (day: string) => Date.parse(`${day}T12:00:00+09:00`);
const createConversation = (id: string, timestamp: number | null, reverse = false): NormalizedConversation => ({
  id, provider: 'chatgpt', title: `SYNTHETIC_PRIVATE_TIMELINE_TITLE_${id}`, createdAt: timestamp, updatedAt: timestamp,
  messages: Array.from({ length: 4 }, (_, index) => {
    const role = index < 2 ? 'user' as const : 'assistant' as const;
    // Preserve the missing-date scenario using an actual noun, not an adjective.
    const text = timestamp === null ? 'cobalt' : (role === 'user') !== reverse ? 'alpha' : 'bravo';
    return { id: `${id}-${index}`, conversationId: id, provider: 'chatgpt' as const, role,
      createdAt: timestamp, order: index, originalText: text, analysisText: text };
  }),
});
const conversations = [
  createConversation('synthetic-day-three', at('2026-01-03'), true),
  createConversation('synthetic-day-one', at('2026-01-01')),
  createConversation('synthetic-undated', null),
];
const diagnostics = { skippedMessages: 0, truncatedConversations: 0 };
const checkpoint: PrivateCheckpoint = {
  version: 1, namespace,
  identity: { accountId: 'synthetic-timeline-account', workspaceId: 'synthetic-timeline-workspace',
    email: EMAIL, personal: true, plan: 'pro' },
  target: 100, items: conversations.map((conversation) => ({
    id: conversation.id, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
    state: 'done', attempts: 0, messageCount: 4, diagnostics, errorCode: null,
  })),
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
  const profile = await mkdtemp('/private/tmp/promptprint-private-timeline-synthetic-');
  const extension = resolve('dist-private');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.setDefaultTimeout(15_000);
  const network: string[] = [];
  const errors: string[] = [];
  context.on('request', (request) => {
    if (/^https?:/u.test(request.url())) network.push(request.url());
  });
  await context.route(/^https?:/u, async (route) => { await route.abort(); });
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Fault injection corrupts ONE analysis request only, so the real worker's
    // production catch/error path runs. It never modifies saved records or
    // fabricates a success result; recovery uses the normal worker and IDB.
    const state = window as unknown as { failNextTimelineAnalysis: boolean; analysisRequestCount: number };
    state.failNextTimelineAnalysis = false;
    state.analysisRequestCount = 0;
    window.Worker = new Proxy(window.Worker, {
      construct(Target, args: [string | URL, WorkerOptions?]) {
        const instance = new Target(...args);
        const post = instance.postMessage.bind(instance);
        instance.postMessage = (message: unknown, options?: Transferable[] | StructuredSerializeOptions) => {
          let payload = message;
          if (message && typeof message === 'object' && 'type' in message && message.type === 'ANALYZE_STORED') {
            state.analysisRequestCount += 1;
            if (state.failNextTimelineAnalysis && 'settings' in message && message.settings && typeof message.settings === 'object') {
              state.failNextTimelineAnalysis = false;
              payload = { ...message, settings: { ...message.settings, hiddenTerms: null } };
            }
          }
          if (Array.isArray(options)) post(payload, options);
          else post(payload, options);
        };
        return instance;
      },
    });
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
      open.onerror = () => reject(new Error('Synthetic fixture initialization failed'));
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['conversations', 'checkpoints'], 'readwrite');
      tx.objectStore('checkpoints').put(checkpoint);
      for (const record of records) tx.objectStore('conversations').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Synthetic fixture initialization failed'));
    });
    db.close();
    localStorage.setItem('promptprint-private:expected-email', email);
  }, { checkpoint, records, email: EMAIL });
  await page.reload();
  await expect(page.getByTestId('private-status')).toHaveAttribute('data-fetched', '3');
  await expect(page.getByTestId('private-status')).toHaveAttribute('data-messages', '12');
  await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '3');
  await expect(page.getByTestId('timeline-current-period')).toHaveText('全期間');
  return { context, page, network, errors };
}

async function readStoredBodies(page: Page) {
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

test('private saved-history timeline restores and reanalyses dates, empty frames and cumulative sides without any HTTP', async () => {
  const h = await test.step('Restore the synthetic IndexedDB corpus', () => harness());
  try {
    const { page } = h;
    const before = await readStoredBodies(page);
    const timeline = page.getByRole('region', { name: '期間と時系列プレビュー' });
    const period = page.getByTestId('timeline-current-period');
    await timeline.locator('summary').click();
    await timeline.getByLabel('開始日', { exact: true }).fill('2026-01-01');
    await timeline.getByLabel('終了日', { exact: true }).fill('2026-01-01');
    await timeline.getByRole('button', { name: '期間を適用', exact: true }).click();
    await expect(period).toHaveText('2026-01-01 – 2026-01-01');
    await expect(page.locator('.mirror-cloud [data-term="alpha"]')).toHaveAttribute('data-bias-label', 'user');
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '1');
    await expect(page.locator('.mirror-cloud [data-term="cobalt"]')).toHaveCount(0);
    await timeline.getByLabel('終了日', { exact: true }).fill('2026-01-03');
    await timeline.getByLabel('再生単位').selectOption('day');
    await timeline.getByRole('button', { name: '時系列を再生', exact: true }).click();
    await expect(period).toHaveText('2026-01-02 – 2026-01-02');
    await expect(page.locator('.mirror-cloud [data-term]')).toHaveCount(0);
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '0');
    await expect(period).toHaveText('2026-01-03 – 2026-01-03');
    await expect(timeline.getByRole('button', { name: '時系列を再生', exact: true })).toBeEnabled();
    await expect(page.locator('.mirror-cloud [data-term="alpha"]')).toHaveAttribute('data-bias-label', 'assistant');
    await timeline.getByLabel('再生方法').selectOption('cumulative');
    await timeline.getByRole('button', { name: '時系列を再生', exact: true }).click();
    await expect(period).toHaveText('2026-01-01 – 2026-01-03');
    await expect(timeline.getByRole('button', { name: '時系列を再生', exact: true })).toBeEnabled();
    await expect(page.locator('.mirror-cloud [data-term="alpha"]')).toHaveAttribute('data-bias-label', 'shared');
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '2');
    const completedRequests = await page.evaluate(() => (window as unknown as { analysisRequestCount: number }).analysisRequestCount);
    await page.waitForTimeout(2200);
    expect(await page.evaluate(() => (window as unknown as { analysisRequestCount: number }).analysisRequestCount)).toBe(completedRequests);
    await page.screenshot({ path: `${EVIDENCE}/synthetic-private-timeline-cumulative.png`, fullPage: true });
    expect(await readStoredBodies(page)).toEqual(before);
    await page.reload();
    await expect(period).toHaveText('全期間');
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '3');
    await expect(page.locator('.mirror-cloud [data-term="cobalt"]')).toHaveCount(1);
    expect(await readStoredBodies(page)).toEqual(before);
    expect(h.network).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { await h.context.close(); }
});

test('private local analysis error blocks replay, then reanalysis recovers without source retrieval or DB mutation', async () => {
  const h = await harness();
  try {
    const { page } = h;
    const before = await readStoredBodies(page);
    await page.evaluate(() => { (window as unknown as { failNextTimelineAnalysis: boolean }).failNextTimelineAnalysis = true; });
    await page.getByRole('button', { name: '再解析', exact: true }).click();
    const error = page.getByText('保存済みデータの解析に失敗しました。取得を停止して再解析するか、表示条件を軽くして再試行してください。', { exact: true });
    await expect(error).toBeVisible();
    await expect(page.getByRole('button', { name: '時系列を再生', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '再解析', exact: true }).click();
    await expect(error).toHaveCount(0);
    await expect(page.getByRole('button', { name: '時系列を再生', exact: true })).toBeEnabled();
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '3');
    await expect(page.locator('.mirror-cloud [data-term="alpha"]')).toHaveAttribute('data-bias-label', 'shared');
    await page.getByRole('region', { name: '期間と時系列プレビュー' }).locator('summary').click();
    await page.getByLabel('開始日', { exact: true }).fill('2026-01-03');
    await page.getByLabel('終了日', { exact: true }).fill('2026-01-03');
    await page.getByRole('button', { name: '期間を適用', exact: true }).click();
    await expect(page.getByTestId('timeline-current-period')).toHaveText('2026-01-03 – 2026-01-03');
    await expect(page.locator('.mirror-cloud [data-term="alpha"]')).toHaveAttribute('data-bias-label', 'assistant');
    expect(await readStoredBodies(page)).toEqual(before);
    expect(h.network).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { await h.context.close(); }
});
