import { expect, test, type Page } from '@playwright/test';

// Synthetic, hand-countable multi-topic conversations. This is not a real
// user's history and no source account or acquisition route is exercised.
const PRIVATE_TITLE = 'SYNTHETIC_PRIVATE_TOPICS_TITLE';
const EMAIL = 'synthetic-topics@example.invalid';
const GENERIC = ['今回', '内容', '確認', '必要', '方法'];
const TOPICS = ['税金', 'ロボット', 'センサー', '留学', '大学院', '奨学金'];
const topicFamilies = [
  {
    id: 'tax',
    user: '今回の内容は、税金と確定申告です。必要な方法を確認したいです。領収書と控除を整理します。',
    assistant: '今回の内容を確認しました。税金と確定申告では控除が必要です。方法を確認し、申告書と納税を整理します。',
  },
  {
    id: 'robotics',
    user: '今回の内容は、ロボットとセンサーです。必要な方法を確認したいです。モーターと制御を実験します。',
    assistant: '今回の内容を確認しました。ロボットとセンサーでは校正が必要です。方法を確認し、モーターと制御を設計します。',
  },
  {
    id: 'admissions',
    user: '今回の内容は、留学と大学院です。必要な方法を確認したいです。奨学金と推薦状を準備します。',
    assistant: '今回の内容を確認しました。留学と大学院では審査が必要です。方法を確認し、奨学金と推薦状を準備します。',
  },
];
const topicFixture = () => topicFamilies.flatMap((family, familyIndex) => Array.from({ length: 3 }, (_, index) => {
  const id = `synthetic-topics-${family.id}-${index}`;
  const timestamp = Date.parse(`2026-01-${String(familyIndex * 3 + index + 1).padStart(2, '0')}T12:00:00+09:00`) / 1000;
  return { id, title: `${PRIVATE_TITLE}_${family.id}_${index}`,
    messages: [0, 1].flatMap((round) => (['user', 'assistant'] as const).map((role) => ({
      id: `${id}-${round}-${role}`, author: { role }, create_time: timestamp,
      content: `${family[role]} ${EMAIL}`,
    }))),
  };
}));

declare global {
  interface Window { __topicDrawStrings: string[] }
}

const guardBrowser = async (page: Page, origin: string) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).origin !== origin) external.push(request.url()); });
  await page.addInitScript(() => {
    window.__topicDrawStrings = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
      window.__topicDrawStrings.push(String(text));
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  return async () => {
    expect(await page.evaluate(async () => ({
      local: localStorage.length, session: sessionStorage.length, cookie: document.cookie,
      databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
      serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
    }))).toEqual({ local: 0, session: 0, cookie: '', databases: 0, caches: 0, serviceWorkers: 0 });
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  };
};

const importFixture = async (page: Page, fixture: unknown) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'synthetic-topic-conversations.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
};

const terms2D = (page: Page) => page.locator('.mirror-cloud [data-term]').evaluateAll((nodes) =>
  nodes.map((node) => node.getAttribute('data-term')!).sort());
const terms3D = (page: Page) => page.locator('[data-spatial-term]').evaluateAll((nodes) =>
  nodes.map((node) => node.getAttribute('data-spatial-term')!).sort());

const filterOptions = async (page: Page) => {
  const fold = page.locator('.dash-fold').filter({ has: page.getByText('表示条件を変える', { exact: true }) });
  if (await fold.getAttribute('open') === null) await page.getByText('表示条件を変える', { exact: true }).click();
};

const selectFocus = async (page: Page, value: 'topics' | 'all') => {
  await filterOptions(page);
  const selection = page.getByRole('combobox', { name: '語の選び方', exact: true });
  await expect(selection).toBeEnabled();
  await selection.selectOption(value);
  await expect(selection).toHaveValue(value);
  await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
  await expect(page.locator('.spatial-caption, [data-testid="cloud-caption"]'))
    .toContainText(value === 'topics' ? '話題優先' : '使用語を広く');
  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
};

const assertTopicTerms = (terms: string[]) => {
  for (const term of TOPICS) expect(terms, `content-bearing term ${term}`).toContain(term);
  for (const term of GENERIC) expect(terms, `procedural word ${term}`).not.toContain(term);
  expect(terms.some((term) => /はい|いいえ|\bok\b|ください|って|けど/iu.test(term))).toBe(false);
};

const geometry2D = async (page: Page, overview = false) => {
  await page.mouse.move(1, 1);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const cloud = await page.locator('.mirror-cloud').evaluate((node) => {
    const svg = node as SVGSVGElement;
    return { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height,
      terms: [...svg.querySelectorAll<SVGGElement>('[data-term]')].map((group) => {
        const glyph = group.querySelector('text')!.getBBox();
        return { term: group.dataset.term!, bias: Number(group.dataset.bias), label: group.dataset.biasLabel,
          box: JSON.parse(group.dataset.box!) as { x: number; y: number; width: number; height: number },
          glyph: { x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height } };
      }) };
  });
  const pad = overview ? 8 : 18;
  expect(cloud.terms.length).toBeGreaterThan(0);
  for (const [index, term] of cloud.terms.entries()) {
    const { glyph, box } = term;
    const target = cloud.width / 2 - term.bias * (cloud.width / 2 - (overview ? 50 : 90));
    expect(Math.abs(box.x - target)).toBeLessThanOrEqual(cloud.width * 0.055 + 0.02);
    expect(glyph.x).toBeGreaterThanOrEqual(box.x - box.width / 2 - 0.1);
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(box.x + box.width / 2 + 0.1);
    expect(glyph.y).toBeGreaterThanOrEqual(box.y - box.height / 2 - 0.1);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(box.y + box.height / 2 + 0.1);
    expect(glyph.x).toBeGreaterThanOrEqual(pad - 0.1);
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(cloud.width - pad + 0.1);
    expect(glyph.y).toBeGreaterThanOrEqual(pad - 0.1);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(cloud.height - pad + 0.1);
    if (term.label === 'user') expect(glyph.x + glyph.width).toBeLessThan(cloud.width / 2);
    if (term.label === 'assistant') expect(glyph.x).toBeGreaterThan(cloud.width / 2);
    for (const other of cloud.terms.slice(index + 1)) {
      const b = other.glyph;
      expect(glyph.x < b.x + b.width && glyph.x + glyph.width > b.x &&
        glyph.y < b.y + b.height && glyph.y + glyph.height > b.y).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  return cloud;
};

const robotMetrics = async (page: Page, spatial = false) => {
  if (spatial) {
    await page.getByRole('combobox', { name: '3Dで選ぶ語', exact: true }).selectOption('ロボット');
    await page.getByRole('button', { name: '選択した語の文脈を見る', exact: true }).click();
  } else {
    await page.locator('.mirror-cloud [data-term="ロボット"]').focus();
    await page.keyboard.press('Enter');
  }
  const drawer = page.getByRole('dialog', { name: 'ロボット', exact: true });
  await expect(drawer).toBeVisible();
  expect(await drawer.getByRole('row', { name: '出現発言 / 全発言' }).locator('td').allTextContents()).toEqual(['6 / 18', '6 / 18']);
  await expect(drawer.locator('.term-metrics')).toContainText('33.3%');
  await expect(drawer.locator('.term-metrics')).toContainText('3件');
  await expect(drawer.locator('.context-list')).toContainText(`${PRIVATE_TITLE}_robotics`);
  await expect(drawer.locator('.context-list')).toContainText(topicFamilies[1]!.user);
  const metrics = await drawer.locator('.term-metrics').innerText();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  return metrics;
};

const savePng = async (page: Page, name: string, mode: 'topics' | 'all') => {
  await page.evaluate(() => { window.__topicDrawStrings = []; });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNGを書き出す' }).click();
  const download = await pending;
  await download.saveAs(`output/playwright/promptprint-topics-${name}.png`);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.length).toBeGreaterThan(10_000);
  const strings = await page.evaluate(() => window.__topicDrawStrings);
  expect(strings.join('\n')).not.toContain(PRIVATE_TITLE);
  expect(strings.join('\n')).not.toContain(EMAIL);
  expect(strings.join('\n')).not.toContain(topicFamilies[1]!.user);
  expect(strings.join('\n')).toContain(mode === 'topics' ? '話題優先' : '使用語を広く');
  if (mode === 'topics') for (const word of GENERIC) expect(strings).not.toContain(word);
  await expect(page.locator('.toast')).toHaveCount(0);
};

test('topic focus conveys tax, robotics and admissions while broad mode restores procedure without changing measured rates', async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  const assertPrivacy = await guardBrowser(page, new URL(baseURL!).origin);
  await importFixture(page, topicFixture());
  const initialTerms = await terms2D(page);
  assertTopicTerms(initialTerms);
  const originalGeometry = await geometry2D(page);
  const metrics = await robotMetrics(page);
  await expect(page.getByTestId('cloud-caption')).toContainText('話題優先');
  await expect(page.getByTestId('cloud-caption')).toContainText('定型語等を対象外');
  await page.screenshot({ path: 'output/playwright/promptprint-topics-tooltip.png' });
  await page.getByRole('button', { name: '2D ミラー', exact: true }).focus();
  await page.mouse.move(1, 1);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.screenshot({ path: 'output/playwright/promptprint-topics-desktop.png' });
  await savePng(page, 'export', 'topics');
  await selectFocus(page, 'all');
  const broadTerms = await terms2D(page);
  for (const word of GENERIC) expect(broadTerms).toContain(word);
  expect(await robotMetrics(page)).toBe(metrics);
  await expect(page.getByTestId('cloud-caption')).toContainText('使用語を広く');
  await savePng(page, 'broad-export', 'all');
  await selectFocus(page, 'topics');
  expect(await terms2D(page)).toEqual(initialTerms);
  expect(await geometry2D(page)).toEqual(originalGeometry);

  await page.getByRole('button', { name: '3D 分布', exact: true }).click();
  await expect(page.getByTestId('spatial-cloud')).toBeVisible();
  expect(await terms3D(page)).toEqual(initialTerms);
  const robot = page.locator('[data-spatial-term="ロボット"]');
  await expect(robot).toHaveAttribute('data-world-x', '0');
  expect(Number(await robot.getAttribute('data-world-y'))).toBeCloseTo(1 / 3, 12);
  expect(Number(await robot.getAttribute('data-world-z'))).toBeCloseTo(1 / 3, 12);
  expect(await robotMetrics(page, true)).toBe(metrics);
  await savePng(page, '3d-export', 'topics');
  await selectFocus(page, 'all');
  for (const word of GENERIC) expect(await terms3D(page)).toContain(word);
  expect(Number(await robot.getAttribute('data-world-y'))).toBeCloseTo(1 / 3, 12);
  expect(Number(await robot.getAttribute('data-world-z'))).toBeCloseTo(1 / 3, 12);
  expect(await robotMetrics(page, true)).toBe(metrics);
  await selectFocus(page, 'topics');
  expect(await terms3D(page)).toEqual(initialTerms);
  await page.getByRole('button', { name: '2D ミラー', exact: true }).click();
  expect(await terms2D(page)).toEqual(initialTerms);
  await assertPrivacy();
});

test('topic and word/phrase selection remain operable with bounded 2D/3D on mobile', async ({ page, baseURL }) => {
  const assertPrivacy = await guardBrowser(page, new URL(baseURL!).origin);
  await importFixture(page, topicFixture());
  const fullTerms = await terms2D(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mirror-cloud--overview')).toBeVisible();
  await geometry2D(page, true);
  for (const word of GENERIC) expect(await terms2D(page)).not.toContain(word);
  await page.screenshot({ path: 'output/playwright/promptprint-topics-mobile.png' });
  await filterOptions(page);
  await expect(page.getByRole('combobox', { name: '語の選び方', exact: true })).toHaveValue('topics');
  for (const mode of ['単語のみ', '単語＋フレーズ']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect(page.getByRole('button', { name: 'PNGを書き出す' })).toBeEnabled();
    await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
    await geometry2D(page, true);
    for (const word of GENERIC) expect(await terms2D(page)).not.toContain(word);
  }
  await page.getByRole('button', { name: '3D 分布', exact: true }).click();
  await expect(page.getByTestId('spatial-cloud')).toBeVisible();
  expect(await terms3D(page)).toEqual(fullTerms);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await robotMetrics(page, true);
  await page.getByRole('button', { name: 'クラウド全体を見る' }).click();
  await page.screenshot({ path: 'output/playwright/promptprint-topics-mobile-3d.png', fullPage: true });
  await selectFocus(page, 'all');
  for (const word of GENERIC) expect(await terms3D(page)).toContain(word);
  await selectFocus(page, 'topics');
  expect(await terms3D(page)).toEqual(fullTerms);
  await assertPrivacy();
});

test('generic-only history stays honestly empty by default and broad selection or clearing recovers locally', async ({ page, baseURL }) => {
  const assertPrivacy = await guardBrowser(page, new URL(baseURL!).origin);
  await importFixture(page, [{ id: 'synthetic-generic-only', title: PRIVATE_TITLE,
    messages: [0, 1].flatMap((index) => (['user', 'assistant'] as const).map((role) => ({
      id: `generic-${index}-${role}`, author: { role }, create_time: Date.parse('2026-01-01T12:00:00+09:00') / 1000,
      content: `${GENERIC.join('。')}。はい！いいえ。OK!?`,
    }))),
  }]);
  expect(await terms2D(page)).toEqual([]);
  await expect(page.locator('.cloud-empty')).toBeVisible();
  await expect(page.getByTestId('cloud-caption')).toContainText('話題優先');
  await page.screenshot({ path: 'output/playwright/promptprint-topics-empty.png' });
  await selectFocus(page, 'all');
  expect(await terms2D(page)).toEqual([...GENERIC].sort());
  await selectFocus(page, 'topics');
  expect(await terms2D(page)).toEqual([]);
  await page.getByRole('button', { name: '3D 分布', exact: true }).click();
  expect(await terms3D(page)).toEqual([]);
  await expect(page.locator('.spatial-empty')).toBeVisible();
  await page.getByRole('button', { name: '解析データを消去' }).click();
  await page.getByRole('button', { name: '消去を実行' }).click();
  await expect(page.getByRole('button', { name: 'デモを見る', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'デモを見る', exact: true }).click();
  await expect(page.getByTestId('mirror-cloud')).toBeVisible();
  await filterOptions(page);
  await expect(page.getByRole('combobox', { name: '語の選び方', exact: true })).toHaveValue('topics');
  expect((await terms2D(page)).length).toBeGreaterThan(0);
  await assertPrivacy();
});
