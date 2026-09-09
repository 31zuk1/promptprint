import { chromium, expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { NormalizedConversation } from '../src/domain/models';
import type { PrivateCheckpoint, PrivateConversationRecord } from '../src/private/models';

// Only a disposable synthetic extension profile is used. No ChatGPT source
// tab exists and every HTTP(S) request is aborted and counted as a failure.
const EVIDENCE = '/private/tmp/promptprint-private-20260909/test-evidence';
const EMAIL = 'topics-fixture@example.invalid';
const TITLE = 'SYNTHETIC_PRIVATE_TOPIC_TITLE';
const GENERIC = ['今回', '内容', '確認', '必要', '方法'];
const CONTENT = ['税金', 'ロボット', 'センサー', '留学', '大学院', '奨学金'];
const namespace = JSON.stringify(['chatgpt', 'synthetic-topic-account', 'synthetic-topic-workspace']);
const families = [
  ['今回の内容は、税金と確定申告です。必要な方法を確認したいです。領収書と控除を整理します。',
    '今回の内容を確認しました。税金と確定申告では控除が必要です。方法を確認し、申告書と納税を整理します。'],
  ['今回の内容は、ロボットとセンサーです。必要な方法を確認したいです。モーターと制御を実験します。',
    '今回の内容を確認しました。ロボットとセンサーでは校正が必要です。方法を確認し、モーターと制御を設計します。'],
  ['今回の内容は、留学と大学院です。必要な方法を確認したいです。奨学金と推薦状を準備します。',
    '今回の内容を確認しました。留学と大学院では審査が必要です。方法を確認し、奨学金と推薦状を準備します。'],
];
const conversations: NormalizedConversation[] = families.flatMap((family, familyIndex) => Array.from({ length: 3 }, (_, index) => {
  const id = `synthetic-private-topic-${familyIndex}-${index}`;
  const timestamp = Date.parse(`2026-01-${String(familyIndex * 3 + index + 1).padStart(2, '0')}T12:00:00+09:00`);
  return { id, provider: 'chatgpt', title: `${TITLE}_${familyIndex}_${index}`, createdAt: timestamp, updatedAt: timestamp,
    messages: [0, 1].flatMap((round) => (['user', 'assistant'] as const).map((role, roleIndex) => {
      const text = `${family[roleIndex]} ${EMAIL}`;
      return { id: `${id}-${round}-${role}`, conversationId: id, provider: 'chatgpt' as const, role,
        createdAt: timestamp, order: round * 2 + roleIndex, originalText: text, analysisText: text };
    })),
  };
}));
const diagnostics = { skippedMessages: 0, truncatedConversations: 0 };
const checkpoint: PrivateCheckpoint = {
  version: 1, namespace,
  identity: { accountId: 'synthetic-topic-account', workspaceId: 'synthetic-topic-workspace',
    email: EMAIL, personal: true, plan: 'pro' },
  target: 100, items: conversations.map((conversation) => ({
    id: conversation.id, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
    state: 'done', attempts: 0, messageCount: 4, diagnostics, errorCode: null,
  })), cursor: null, seenCursors: [], listExhausted: true, totalAvailable: null, order: 'updated',
  startedAt: Date.parse('2026-01-10T00:00:00+09:00'), updatedAt: Date.parse('2026-01-10T00:00:00+09:00'),
  phase: 'paused', revision: 1,
};
const records = conversations.map((conversation) => ({ key: JSON.stringify([namespace, conversation.id]), namespace,
  record: { id: conversation.id, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
    fetchedAt: Date.parse('2026-01-10T00:00:00+09:00'), conversation, diagnostics } satisfies PrivateConversationRecord,
}));

const storedBodies = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('promptprint-private-v1');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new Error('Synthetic storage inspection failed'));
  });
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction('conversations').objectStore('conversations').getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(new Error('Synthetic storage inspection failed'));
  });
  db.close();
  return rows;
});

test('private offline topic focus changes only selection, preserves stored bodies and exports no private excerpts', async () => {
  await mkdir(EVIDENCE, { recursive: true });
  const profile = await mkdtemp('/private/tmp/promptprint-private-topics-synthetic-');
  const extension = resolve('dist-private');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const errors: string[] = [];
  const network: string[] = [];
  context.on('request', (request) => { if (/^https?:/u.test(request.url())) network.push(request.url()); });
  await context.route(/^https?:/u, async (route) => { await route.abort(); });
  context.on('page', (page) => {
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const state = window as unknown as { topicPngStrings: string[] };
      state.topicPngStrings = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
        state.topicPngStrings.push(String(text));
        if (maxWidth === undefined) original.call(this, text, x, y);
        else original.call(this, text, x, y, maxWidth);
      };
    });
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/private.html`);
    await expect(page.getByLabel('本人の個人アカウント')).toBeVisible();
    await page.evaluate(async ({ checkpoint, records, email }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('promptprint-private-v1', 1);
        open.onupgradeneeded = () => {
          const rows = open.result.createObjectStore('conversations', { keyPath: 'key' });
          rows.createIndex('namespace', 'namespace');
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
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-fetched', '9');
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-messages', '36');
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '9');
    await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
    const originalBodies = await storedBodies(page);
    const displayed = () => page.locator('.mirror-cloud [data-term]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-term')!).sort());
    const initial = await displayed();
    for (const term of CONTENT) expect(initial).toContain(term);
    for (const term of GENERIC) expect(initial).not.toContain(term);
    await expect(page.getByTestId('cloud-caption')).toContainText('話題優先');
    await page.locator('.mirror-cloud [data-term="ロボット"]').focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'ロボット', exact: true });
    expect(await drawer.getByRole('row', { name: '出現発言 / 全発言' }).locator('td').allTextContents()).toEqual(['6 / 18', '6 / 18']);
    await expect(drawer.locator('.context-list')).toContainText(families[1]![0]!);
    const originalMetrics = await drawer.locator('.term-metrics').innerText();
    await page.keyboard.press('Escape');
    await page.getByText('表示条件を変える', { exact: true }).click();
    const selection = page.getByRole('combobox', { name: '語の選び方', exact: true });
    await expect(selection).toHaveValue('topics');
    await selection.selectOption('all');
    await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
    for (const term of GENERIC) expect(await displayed()).toContain(term);
    await page.locator('.mirror-cloud [data-term="ロボット"]').focus();
    await page.keyboard.press('Enter');
    expect(await drawer.locator('.term-metrics').innerText()).toBe(originalMetrics);
    await page.keyboard.press('Escape');
    expect(await storedBodies(page)).toEqual(originalBodies);
    await selection.selectOption('topics');
    await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
    expect(await displayed()).toEqual(initial);
    await page.getByRole('button', { name: '3D 分布', exact: true }).click();
    expect(await page.locator('[data-spatial-term]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-spatial-term')!).sort())).toEqual(initial);
    const robot = page.locator('[data-spatial-term="ロボット"]');
    await expect(robot).toHaveAttribute('data-world-x', '0');
    expect(Number(await robot.getAttribute('data-world-y'))).toBeCloseTo(1 / 3, 12);
    expect(Number(await robot.getAttribute('data-world-z'))).toBeCloseTo(1 / 3, 12);
    await page.screenshot({ path: `${EVIDENCE}/synthetic-private-topics-desktop.png`, fullPage: true });
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNGを書き出す' }).click();
    const png = await pending;
    await png.saveAs(`${EVIDENCE}/synthetic-private-topics-export.png`);
    const strings = await page.evaluate(() => (window as unknown as { topicPngStrings: string[] }).topicPngStrings);
    expect(strings.join('\n')).toContain('話題優先');
    expect(strings.join('\n')).toContain('個人用');
    expect(strings.join('\n')).not.toContain(TITLE);
    expect(strings.join('\n')).not.toContain(EMAIL);
    expect(strings.join('\n')).not.toContain(families[1]![0]!);
    for (const term of GENERIC) expect(strings).not.toContain(term);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).selectOption('ロボット');
    await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
    expect(await drawer.locator('.term-metrics').innerText()).toBe(originalMetrics);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${EVIDENCE}/synthetic-private-topics-mobile.png`, fullPage: true });
    expect(await storedBodies(page)).toEqual(originalBodies);
    await page.reload();
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '9');
    await expect(page.getByTestId('cloud-caption')).toContainText('話題優先');
    expect(await storedBodies(page)).toEqual(originalBodies);
    await page.getByRole('button', { name: '端末内の会話・進捗を全消去', exact: true }).click();
    await page.getByRole('button', { name: '全消去を実行する', exact: true }).click();
    await expect(page.getByTestId('private-status')).toHaveAttribute('data-fetched', '0');
    await expect(page.getByText('この個人用拡張が保存した会話・進捗を消去しました。ChatGPT側の履歴は変更していません。', { exact: true })).toBeVisible();
    await expect.poll(() => storedBodies(page)).toEqual([]);
    expect(errors).toEqual([]);
    expect(network).toEqual([]);
  } finally { await context.close(); }
});
