import { expect, test } from '@playwright/test';

test('a corrupt local dictionary fails closed and a fresh local retry recovers without storage or external requests', async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  const external: string[] = [];
  const dictionaryFiles = new Set<string>();
  const origin = new URL(baseURL!).origin;
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin) external.push(request.url());
    if (url.pathname.includes('/morphology/ipadic-0.1.2/')) dictionaryFiles.add(url.pathname.split('/').at(-1)!);
  });
  const asset = '**/morphology/ipadic-0.1.2/base.dat.gz';
  await context.route(asset, (route) => route.fulfill({
    status: 200, contentType: 'application/octet-stream', body: 'SYNTHETIC_CORRUPT_DICTIONARY',
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'デモを見る', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('端末内の品詞辞書を読み込めませんでした');
  await expect(page.getByTestId('mirror-cloud')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('SYNTHETIC_CORRUPT_DICTIONARY');

  await context.unroute(asset);
  dictionaryFiles.clear();
  await page.getByRole('button', { name: 'デモを見る', exact: true }).click();
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PNGを書き出す', exact: true })).toBeEnabled();
  expect([...dictionaryFiles].sort()).toEqual([
    'base.dat.gz', 'cc.dat.gz', 'check.dat.gz', 'tid.dat.gz', 'tid_map.dat.gz', 'tid_pos.dat.gz',
    'unk.dat.gz', 'unk_char.dat.gz', 'unk_compat.dat.gz', 'unk_invoke.dat.gz', 'unk_map.dat.gz', 'unk_pos.dat.gz',
  ].sort());
  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
    databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }))).toEqual({ local: 0, session: 0, cookie: '', databases: 0, caches: 0, serviceWorkers: 0 });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
