import { chromium, expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// All identities, credentials, bodies, titles, timestamps and browser profiles
// here are SYNTHETIC. Never point these tests at the owner's Chrome profile.
const EVIDENCE = '/private/tmp/promptprint-private-20260909/test-evidence';
const EMAIL = 'fixture@example.invalid';
const TOKEN = 'SYNTHETIC_TOKEN_NOT_A_REAL_CREDENTIAL';
const TITLE = 'PRIVATE_SYNTHETIC_TITLE_NEVER_FOR_PNG';
const hidden = 'INTERNAL_REASONING_SENTINEL';
const citationControl = '\uE200cite\uE202turn0search0\uE201';
const fileCitationControl = '\uE200filecite\uE202turn0file0\uE201';
const stamp = Date.parse('2026-09-08T00:00:00Z');
const itemFor = (index: number) => ({
  id: `synthetic-thread-${index}`, title: `${TITLE}-${index}`,
  create_time: new Date(stamp - (1000 + index) * 60_000).toISOString(),
  update_time: new Date(stamp - index * 60_000).toISOString(),
});
const detailFor = (index: number) => ({
  ...itemFor(index), current_node: 'final', mapping: {
    // Deliberately listed first: a discarded branch must not reserve final's ID.
    discarded: { parent: 'user', message: { id: 'assistant-id', author: { role: 'assistant' },
      content: { content_type: 'text', parts: ['DISCARDED_BRANCH_SENTINEL'] }, recipient: 'all' } },
    user: { parent: null, message: { id: 'user-id', author: { role: 'user' }, recipient: 'all',
      create_time: (stamp - index * 60_000) / 1000,
      content: { content_type: 'text', parts: ['研究。ロボット。データ。優先順位。参考 https://example.invalid/private 本文メール fixture@example.invalid'] } } },
    internal: { parent: 'user', message: { id: 'hidden-id', author: { role: 'assistant' }, recipient: 'all', channel: 'analysis',
      content: { content_type: 'text', parts: [hidden] } } },
    final: { parent: 'internal', message: { id: 'assistant-id', author: { role: 'assistant' }, recipient: 'all', channel: 'final',
      create_time: (stamp - index * 60_000 + 1000) / 1000,
      content: { content_type: 'text', parts: [`検証。${citationControl}要件。リスク。データ。優先順位。${fileCitationControl}`] } } },
  },
});

interface Harness {
  context: BrowserContext;
  page: Page;
  requests: { lists: number[]; bodies: number[]; methods: string[] };
  errors: string[];
  forbidden: string[];
  expectedHttpStatuses: Set<number>;
  setSessionHandler(handler: ((route: Route) => Promise<boolean>) | null): void;
  setDetailHandler(handler: ((route: Route, index: number) => Promise<boolean>) | null): void;
}

async function launchHarness(distinctPersonalAccounts = false): Promise<Harness> {
  await mkdir(EVIDENCE, { recursive: true });
  const profile = await mkdtemp('/private/tmp/promptprint-private-synthetic-profile-');
  const extension = resolve('dist-private');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const requests = { lists: [] as number[], bodies: [] as number[], methods: [] as string[] };
  const errors: string[] = [];
  const forbidden: string[] = [];
  const expectedHttpStatuses = new Set<number>();
  let detailHandler: ((route: Route, index: number) => Promise<boolean>) | null = null;
  let sessionHandler: ((route: Route) => Promise<boolean>) | null = null;
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      const status = text.startsWith('Failed to load resource:') ? /status of (\d+)/.exec(text)?.[1] : undefined;
      // Only a status explicitly injected by a negative-path fixture is expected.
      // Unexpected resource, CSP, console and uncaught errors still fail the test.
      if (status === undefined || !expectedHttpStatuses.has(Number(status))) errors.push(text);
    });
  });
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (!['chrome-extension:', 'blob:', 'data:', 'about:'].includes(url.protocol) && url.origin !== 'https://chatgpt.com') {
      forbidden.push(url.origin);
    }
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'chrome-extension:') { await route.continue(); return; }
    if (url.origin !== 'https://chatgpt.com') { forbidden.push(url.origin); await route.abort(); return; }
    requests.methods.push(request.method());
    if (request.method() !== 'GET') { forbidden.push(`method:${request.method()}`); await route.abort(); return; }
    if (url.pathname === '/') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic ChatGPT fixture</title><p>Local synthetic fixture only.</p>' });
    } else if (url.pathname === '/api/auth/session') {
      if (sessionHandler && await sessionHandler(route)) return;
      await route.fulfill({ json: { accessToken: TOKEN, user: { id: 'synthetic-user-id', email: EMAIL } } });
    } else if (url.pathname === '/backend-api/accounts/check/v4-2023-04-27') {
      expect(request.headers().authorization).toBe(`Bearer ${TOKEN}`);
      const account = { account_id: 'synthetic-personal-workspace', structure: 'personal', plan_type: 'pro', is_deactivated: false };
      // The live response's safe shape has a default alias and another key for
      // the SAME personal ID. This synthetic fixture reproduces structure only.
      await route.fulfill({ json: { accounts: {
        default: { account },
        personal: { account: { ...account, account_id: distinctPersonalAccounts ? 'synthetic-other-personal' : account.account_id } },
      }, account_ordering: ['default', 'personal'] } });
    } else if (url.pathname === '/backend-api/conversations') {
      expect(request.headers()['chatgpt-account-id']).toBe('synthetic-personal-workspace');
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      requests.lists.push(offset);
      await route.fulfill({ json: { items: Array.from({ length: Math.min(limit, 100 - offset) }, (_, index) => itemFor(index + offset)),
        offset, limit, total: 100, has_missing_conversations: false } });
    } else if (url.pathname.startsWith('/backend-api/conversation/synthetic-thread-')) {
      expect(request.headers()['chatgpt-account-id']).toBe('synthetic-personal-workspace');
      const index = Number(url.pathname.split('-').at(-1));
      requests.bodies.push(index);
      if (detailHandler && await detailHandler(route, index)) return;
      await route.fulfill({ json: detailFor(index) });
    } else if (url.pathname === '/favicon.ico') await route.fulfill({ status: 204 });
    else { forbidden.push(url.pathname); await route.abort(); }
  });
  const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(serviceWorker.url()).host;
  const source = await context.newPage();
  await source.goto('https://chatgpt.com/');
  const page = await context.newPage();
  await page.addInitScript(() => {
    const capture = window as unknown as { privateCanvasTexts: string[] };
    capture.privateCanvasTexts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      capture.privateCanvasTexts.push(text);
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto(`chrome-extension://${id}/private.html`);
  try {
    await expect(page.getByRole('heading', { name: /^あなたの会話を、\s*ひとつの指紋に。$/ })).toBeVisible();
    await page.getByLabel('本人の個人アカウント').fill(EMAIL);
  } catch (error) { await context.close(); throw error; }
  return { context, page, requests, errors, forbidden, expectedHttpStatuses,
    setSessionHandler: (handler) => { sessionHandler = handler; },
    setDetailHandler: (handler) => { detailHandler = handler; } };
}

async function storedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('promptprint-private-v1');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error('synthetic inspection failed'));
    });
    const tx = db.transaction(['conversations', 'checkpoints']);
    const read = (store: string) => new Promise<unknown[]>((resolve, reject) => {
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(new Error('synthetic inspection failed'));
    });
    const [conversations, checkpoints] = await Promise.all([read('conversations'), read('checkpoints')]);
    db.close();
    return { conversations, checkpoints, local: Object.fromEntries(Object.entries(localStorage)) };
  });
}

async function assertGeometry(page: Page, semanticInset = 90, padding = 18) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))); });
  const geometry = await page.locator('.mirror-cloud').evaluate((node) => {
    const svg = node as SVGSVGElement;
    return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
      terms: [...svg.querySelectorAll<SVGGElement>('[data-term]')].map((group) => {
        const text = group.querySelector('text')!;
        const box = text.getBBox();
        return { label: group.dataset.biasLabel, bias: Number(group.dataset.bias),
          x: box.x, y: box.y, width: box.width, height: box.height,
          model: JSON.parse(group.dataset.box!) as { x: number; y: number; width: number; height: number } };
      }) };
  });
  expect(geometry.terms.length).toBeGreaterThan(0);
  expect(new Set(geometry.terms.map((term) => term.label))).toEqual(new Set(['user', 'shared', 'assistant']));
  for (const [index, term] of geometry.terms.entries()) {
    expect(term.x).toBeGreaterThanOrEqual(padding - 0.1);
    expect(term.x + term.width).toBeLessThanOrEqual(geometry.width - padding + 0.1);
    expect(term.y).toBeGreaterThanOrEqual(padding - 0.1);
    expect(term.y + term.height).toBeLessThanOrEqual(geometry.height - padding + 0.1);
    expect(term.model.x - term.model.width / 2).toBeGreaterThanOrEqual(padding - 0.1);
    expect(term.model.x + term.model.width / 2).toBeLessThanOrEqual(geometry.width - padding + 0.1);
    expect(term.model.y - term.model.height / 2).toBeGreaterThanOrEqual(padding - 0.1);
    expect(term.model.y + term.model.height / 2).toBeLessThanOrEqual(geometry.height - padding + 0.1);
    expect(Math.abs(term.model.x - (geometry.width / 2 - term.bias * (geometry.width / 2 - semanticInset))))
      .toBeLessThanOrEqual(geometry.width * 0.055 + 0.02);
    if (term.label === 'user') expect(term.x + term.width).toBeLessThan(geometry.width / 2);
    if (term.label === 'assistant') expect(term.x).toBeGreaterThan(geometry.width / 2);
    for (const other of geometry.terms.slice(index + 1)) {
      expect(term.x < other.x + other.width && term.x + term.width > other.x &&
        term.y < other.y + other.height && term.y + term.height > other.y).toBe(false);
    }
  }
  return geometry;
}

test('real unpacked extension: probe, 100-thread acquisition, pause/reload/resume, IDB, semantic SVG and private PNG', async () => {
  const h = await launchHarness();
  const { page } = h;
  try {
    const options = await page.getByLabel('取得する直近のスレッド数').locator('option').evaluateAll((elements) => elements.map((element) => (element as HTMLOptionElement).value));
    expect(options).toEqual(['100', '500', '1000', '3000']);
    await page.getByLabel('取得する直近のスレッド数').selectOption('100');
    await page.getByRole('button', { name: '接続確認（本文3件）' }).click();
    const status = page.getByTestId('private-status');
    await expect(status).toHaveAttribute('data-phase', 'paused');
    await expect(status).toHaveAttribute('data-fetched', '3');
    await expect(status).toHaveAttribute('data-messages', '6');
    expect(h.requests.lists).toEqual([0]);
    expect(h.requests.bodies).toEqual([0, 1, 2]);
    await expect(page.getByTestId('mirror-cloud')).toBeVisible();
    await page.getByRole('button', { name: '選択件数まで取得する' }).click();
    await expect.poll(async () => Number(await status.getAttribute('data-fetched')), { timeout: 45_000 }).toBeGreaterThanOrEqual(30);
    await page.getByRole('button', { name: '取得を停止' }).click();
    await expect(status).toHaveAttribute('data-phase', 'paused');
    const paused = Number(await status.getAttribute('data-fetched'));
    await expect(status).toHaveAttribute('data-analyzed', String(paused));
    const firstStore = await storedState(page);
    expect(firstStore.conversations).toHaveLength(paused);
    expect(JSON.stringify(firstStore)).not.toMatch(/SYNTHETIC_TOKEN_NOT_A_REAL_CREDENTIAL|INTERNAL_REASONING_SENTINEL|DISCARDED_BRANCH_SENTINEL/);
    await page.reload();
    await expect(status).toHaveAttribute('data-fetched', String(paused));
    await expect(status).toHaveAttribute('data-messages', String(paused * 2));
    await expect(status).toHaveAttribute('data-analyzed', String(paused));
    await page.getByRole('button', { name: '取得を再開' }).click();
    await expect(status).toHaveAttribute('data-phase', 'complete', { timeout: 110_000 });
    await expect(status).toHaveAttribute('data-fetched', '100');
    await expect(status).toHaveAttribute('data-messages', '200');
    await expect(status).toHaveAttribute('data-analyzed', '100');
    await expect(status).toHaveAttribute('data-failed', '0');
    const store = await storedState(page);
    expect(store.conversations).toHaveLength(100);
    expect(store.checkpoints).toHaveLength(1);
    // Context originals retain provider controls; derived words do not.
    expect(JSON.stringify(store.conversations)).toContain(citationControl);
    expect(JSON.stringify(store.conversations)).toContain(fileCitationControl);
    expect(new Set(h.requests.bodies).size).toBe(100);
    // One source read may already be in-flight at pause, but persistence is an upsert.
    expect(h.requests.bodies.length).toBeLessThanOrEqual(101);
    expect(h.requests.lists).toEqual([0, 50]);
    const desktopGeometry = await assertGeometry(page);
    expect(await page.locator('.mirror-cloud [data-term]').evaluateAll((groups) =>
      groups.map((group) => (group as SVGGElement).dataset.term).join(' ')))
      .not.toMatch(/cite|turn0search0|turn0file0|[\uE200-\uE202]/u);
    await page.getByTestId('mirror-cloud').screenshot({ path: `${EVIDENCE}/synthetic-extension-cloud.png` });
    await page.screenshot({ path: `${EVIDENCE}/synthetic-extension-page.png`, fullPage: true });
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'PNGを書き出す' }).click();
    const download = await downloaded;
    await download.saveAs(`${EVIDENCE}/synthetic-extension-export.png`);
    const bytes = await readFile(`${EVIDENCE}/synthetic-extension-export.png`);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    const rendered = await page.evaluate(() => (window as unknown as { privateCanvasTexts: string[] }).privateCanvasTexts.join('\n'));
    expect(rendered).toContain('実データ · ChatGPT Web読取');
    expect(rendered).toContain('100会話');
    expect(rendered).toContain('200発言');
    expect(rendered).not.toMatch(/PRIVATE_SYNTHETIC_TITLE|fixture@example.invalid|SYNTHETIC_TOKEN|INTERNAL_REASONING|DISCARDED_BRANCH/);
    expect(rendered).not.toMatch(/cite|turn0search0|turn0file0|[\uE200-\uE202]/u);

    // The same private extension page must remain usable at a narrow viewport.
    // This is a synthetic-profile responsive check, not mobile-extension support.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.mirror-cloud')).toHaveClass(/mirror-cloud--overview/);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    for (const control of [page.getByLabel('本人の個人アカウント'), page.getByLabel('取得する直近のスレッド数'),
      page.getByRole('button', { name: '選択件数まで取得する' }), page.getByRole('button', { name: '取得を再開' })]) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `${EVIDENCE}/synthetic-extension-mobile-entry.png` });
    const mobileGeometry = await assertGeometry(page, 50, 8);
    expect(mobileGeometry.width).toBe(390);
    expect(mobileGeometry.terms.length).toBeLessThanOrEqual(24);
    await page.locator('.dashboard__opening').screenshot({ path: `${EVIDENCE}/synthetic-extension-mobile-cloud.png` });
    await expect(page.getByTestId('cloud-caption')).toContainText('上下＝意味なし');
    await expect(page.getByTestId('cloud-caption')).toContainText('100会話');
    await page.getByTestId('mirror-cloud').getByRole('button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const drawer = await page.getByRole('dialog').boundingBox();
    expect(drawer!.x).toBeGreaterThanOrEqual(0);
    expect(drawer!.x + drawer!.width).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: `${EVIDENCE}/synthetic-extension-mobile-page.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.mirror-cloud')).not.toHaveClass(/mirror-cloud--overview/);
    const restoredGeometry = await assertGeometry(page);
    expect(restoredGeometry.terms.map((term) => term.model)).toEqual(desktopGeometry.terms.map((term) => term.model));
    expect(h.forbidden).toEqual([]);
    expect(h.errors).toEqual([]);
    expect(new Set(h.requests.methods)).toEqual(new Set(['GET']));
  } finally { await h.context.close(); }
});

test('clear while a real executeScript request is pending never restores IDB data or cloud', async () => {
  const h = await launchHarness();
  let release = () => {};
  let seen = false;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  h.setDetailHandler(async (route) => {
    seen = true;
    await delayed;
    await route.fulfill({ json: detailFor(0) });
    return true;
  });
  try {
    await h.page.getByRole('button', { name: '接続して取得を開始' }).click();
    await expect.poll(() => seen).toBe(true);
    await h.page.getByRole('button', { name: '端末内の会話・進捗を全消去' }).click();
    await h.page.getByRole('button', { name: '全消去を実行する' }).click();
    await expect(h.page.getByText('この個人用拡張が保存した会話・進捗を消去しました。ChatGPT側の履歴は変更していません。')).toBeVisible();
    release();
    await h.page.waitForTimeout(1200);
    const state = await storedState(h.page);
    expect(state.conversations).toEqual([]);
    expect(state.checkpoints).toEqual([]);
    expect(state.local).toEqual({});
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-fetched', '0');
    await expect(h.page.getByTestId('mirror-cloud')).toHaveCount(0);
    await h.page.reload();
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-fetched', '0');
    await expect(h.page.getByTestId('mirror-cloud')).toHaveCount(0);
    expect(h.requests.bodies).toHaveLength(1);
    expect(h.forbidden).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { release(); await h.context.close(); }
});

test('two extension pages cannot acquire concurrently and cross-tab clear releases pending work and both views', async () => {
  const h = await launchHarness();
  let release = () => {};
  let pending = false;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  try {
    await h.page.getByRole('button', { name: '接続確認（本文3件）' }).click();
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-phase', 'paused');
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-analyzed', '3');
    const second = await h.context.newPage();
    await second.goto(h.page.url());
    await expect(second.getByTestId('private-status')).toHaveAttribute('data-fetched', '3');
    await expect(second.getByTestId('private-status')).toHaveAttribute('data-analyzed', '3');
    h.setDetailHandler(async (route, index) => {
      if (index !== 3) return false;
      pending = true;
      await delayed;
      await route.fulfill({ json: detailFor(index) });
      return true;
    });
    await h.page.getByRole('button', { name: '取得を再開' }).click();
    await expect.poll(() => pending).toBe(true);
    await second.getByRole('button', { name: '取得を再開' }).click();
    await expect(second.getByTestId('private-status')).toHaveAttribute('data-phase', 'blocked');
    await expect(second.getByTestId('private-status')).toContainText('OTHER_PRIVATE_TAB');
    expect(h.requests.bodies).toEqual([0, 1, 2, 3]);
    await second.getByRole('button', { name: '端末内の会話・進捗を全消去' }).click();
    await second.getByRole('button', { name: '全消去を実行する' }).click();
    await expect(second.getByText('この個人用拡張が保存した会話・進捗を消去しました。ChatGPT側の履歴は変更していません。')).toBeVisible();
    await expect(h.page.getByTestId('mirror-cloud')).toHaveCount(0);
    await expect(second.getByTestId('mirror-cloud')).toHaveCount(0);
    release();
    await second.waitForTimeout(1200);
    expect((await storedState(second)).conversations).toEqual([]);
    expect((await storedState(second)).checkpoints).toEqual([]);
    await h.page.reload();
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-fetched', '0');
    await expect(h.page.getByTestId('mirror-cloud')).toHaveCount(0);
    expect(h.requests.bodies).toEqual([0, 1, 2, 3]);
    expect(h.forbidden).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { release(); await h.context.close(); }
});

test('clear during initial identity verification is immediate and a late session cannot begin acquisition', async () => {
  const h = await launchHarness();
  let release = () => {};
  let pending = false;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  h.setSessionHandler(async (route) => {
    pending = true;
    await delayed;
    await route.fulfill({ json: { accessToken: TOKEN, user: { id: 'synthetic-user-id', email: EMAIL } } });
    return true;
  });
  try {
    await h.page.getByRole('button', { name: '接続して取得を開始' }).click();
    await expect.poll(() => pending).toBe(true);
    await h.page.getByRole('button', { name: '端末内の会話・進捗を全消去' }).click();
    await h.page.getByRole('button', { name: '全消去を実行する' }).click();
    await expect(h.page.getByText('この個人用拡張が保存した会話・進捗を消去しました。ChatGPT側の履歴は変更していません。')).toBeVisible();
    release();
    await h.page.waitForTimeout(1200);
    expect((await storedState(h.page)).conversations).toEqual([]);
    expect((await storedState(h.page)).checkpoints).toEqual([]);
    expect(h.requests.lists).toEqual([]);
    expect(h.requests.bodies).toEqual([]);
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-fetched', '0');
    expect(h.forbidden).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { release(); await h.context.close(); }
});

test('two distinct personal workspace IDs fail closed before any conversation request', async () => {
  const h = await launchHarness(true);
  try {
    await h.page.getByRole('button', { name: '接続確認（本文3件）' }).click();
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-phase', 'blocked');
    await expect(h.page.getByTestId('private-status')).toContainText('PERSONAL_WORKSPACE_AMBIGUOUS');
    expect(h.requests.lists).toEqual([]);
    expect(h.requests.bodies).toEqual([]);
    expect((await storedState(h.page)).conversations).toEqual([]);
    expect(h.forbidden).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { await h.context.close(); }
});

for (const [code, phase] of [[401, 'auth-required'], [403, 'blocked']] as const) {
  test(`actual extension transport stops on ${code} without retrying`, async () => {
    const h = await launchHarness();
    h.expectedHttpStatuses.add(code);
    h.setDetailHandler(async (route) => { await route.fulfill({ status: code, json: { error: 'synthetic refusal' } }); return true; });
    try {
      await h.page.getByRole('button', { name: '接続確認（本文3件）' }).click();
      await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-phase', phase);
      await h.page.waitForTimeout(1200);
      expect(h.requests.bodies).toHaveLength(1);
      expect((await storedState(h.page)).conversations).toHaveLength(0);
      expect(h.forbidden).toEqual([]);
      expect(h.errors).toEqual([]);
    } finally { await h.context.close(); }
  });
}

test('actual extension transport honors Retry-After on 429 and then resumes bounded work', async () => {
  const h = await launchHarness();
  h.expectedHttpStatuses.add(429);
  const times: number[] = [];
  h.setDetailHandler(async (route, index) => {
    if (index !== 0) return false;
    times.push(Date.now());
    if (times.length > 1) return false;
    await route.fulfill({ status: 429, headers: { 'retry-after': '2' }, json: { error: 'synthetic rate limit' } });
    return true;
  });
  try {
    await h.page.getByRole('button', { name: '接続確認（本文3件）' }).click();
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-phase', 'waiting');
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-phase', 'paused');
    await expect(h.page.getByTestId('private-status')).toHaveAttribute('data-fetched', '3');
    expect(times).toHaveLength(2);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(1950);
    expect(h.requests.bodies).toEqual([0, 0, 1, 2]);
    expect(h.forbidden).toEqual([]);
    expect(h.errors).toEqual([]);
  } finally { await h.context.close(); }
});
