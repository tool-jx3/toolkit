/**
 * 幾何花紋產生器（建置產物 tools/geo-bloom/）的端對端測試：
 * - 開頁沒有錯誤；頁尾只有靈感來源；預設值；第一次開頁的隨機種子；
 * - 和原作逐值相同：同樣的種子與設定，Worker 裡產生的資料序列化後的 SHA-256 和原作 edb6828（Chromium）相同（規格 3.10）；
 * - 原作 2026-10 的新設定（三角形、同心圓、摩斯環、摩斯橋、貼著放、線的丟失、線不跨線）的操作；舊的專案檔、自動儲存（資料版本 1）；
 * - 種子、產生、固定種子、Space、統計；每個控制項的主要效果（數值欄夾到範圍、圖形種類、重疊、樣式）；
 * - 匯出：PNG（檔名、尺寸、8-bit RGBA、像素抽查、透明背景）、SVG（結構、數量、畫出來和 PNG 幾乎相同）；
 * - 範本、自動儲存、復原／重做、專案檔、重設、快捷鍵說明；
 * - 大畫布（8000 × 8000）：預覽縮小、畫的時候頁面照常反應、匯出全尺寸；Worker 不能用時改在主執行緒畫（像素相同）；
 * - 裝置的畫布上限提醒；1280／390 視覺基準、390 寬沒有橫向捲動。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { BloomScene } from '../../src/tools/geo-bloom/generate';
import type { Settings } from '../../src/tools/geo-bloom/settings';
import {
  canon,
  GOLDEN,
  HUGE,
  HUGE_COUNTS,
  HUGE_HASH,
  type Overrides,
  settingsWith,
} from '../helpers/geoBloomCases';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('geo-bloom') ?? { id: 'geo-bloom', status: 'next' })}/`;
const KEY = 'trpg-toolkit:geo-bloom';

interface Hook {
  useSettings: {
    getState: () => { data: Settings; replace: (d: Settings) => void };
    temporal: { getState: () => { clear: () => void } };
  };
  settingsNow: () => Settings;
  sceneFor: (s: Settings) => Promise<BloomScene>;
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '幾何花紋產生器' })).toBeVisible();
  await ready(page);
  return errors;
}

const preview = (page: Page) => page.getByTestId('bloom-preview');
const ready = (page: Page, timeout = 30_000) =>
  expect(preview(page)).toHaveAttribute('data-ready', 'true', { timeout });
const stats = (page: Page) => page.getByTestId('bloom-stats');
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __geoBloom: Hook }).__geoBloom.settingsNow());
const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const spin = (page: Page, name: string) => page.getByRole('spinbutton', { name, exact: true });
const toggle = (page: Page, name: string) => page.getByRole('switch', { name, exact: true });
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** 直接換掉設定（測試的前置；不列入復原），等預覽畫好 */
async function apply(page: Page, o: Overrides) {
  await page.evaluate((o) => {
    const h = (window as unknown as { __geoBloom: Hook }).__geoBloom;
    const st = h.useSettings.getState();
    const d = st.data;
    st.replace({ ...d, ...o, shapes: { ...d.shapes, ...(o.shapes ?? {}) } } as Settings);
    h.useSettings.temporal.getState().clear();
  }, o);
  await ready(page, 60_000);
}

/** 預覽畫布的內容（比較改了設定有沒有重畫） */
const previewSig = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="bloom-canvas"]') as HTMLCanvasElement;
    return `${c.width}x${c.height}:${c.toDataURL()}`;
  });

async function commit(box: Locator, value: string) {
  await box.fill(value);
  await box.press('Enter');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, bitDepth, colorType } = readIhdr(chunks);
  expect([bitDepth, colorType], '8-bit RGBA').toEqual([8, 6]);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

const px = (p: PixelBuffer, x: number, y: number) => {
  const i = (y * p.width + x) * 4;
  return [...p.data.subarray(i, i + 4)];
};

/** 用匯出區匯出並下載 */
async function exportAs(page: Page, format: 'PNG' | 'SVG') {
  await radio(page, format).click();
  await btn(page, `匯出 ${format}`).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、頁尾只有靈感來源、預設值、隨機種子', async ({ page }) => {
  const errors = await open(page);
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link', { name: 'al1scut/tkmizGeo' })).toHaveAttribute(
    'href',
    'https://al1scut.github.io/tkmizGeo/',
  );
  const s = await state(page);
  expect(s.seed).toMatch(/^[0-9a-z]{8}$/);
  expect(s).toMatchObject({
    lockSeed: false,
    width: 1600,
    height: 1600,
    maxShapes: 60,
    maxLines: 120,
    branchMin: 2,
    branchMax: 7,
    overlapMode: 'retry',
    background: '#0e0f12',
    lineWidth: 2,
  });
  await expect(page.getByTestId('seed')).toHaveValue(s.seed);
  await expect(stats(page)).toHaveText(/^圖形 \d+／線 \d+／點 \d+$/);
  await expect(page.getByTestId('bloom-size')).toHaveText('1600 × 1600 px');
  /* 預覽是全尺寸（1600 不必縮小） */
  expect((await previewSig(page)).startsWith('1600x1600:')).toBe(true);
  await expect(page.getByTestId('bloom-scaled')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test(`和原作逐值相同：產生的資料（Worker 裡算）序列化後的雜湊和原作相同（${GOLDEN.length + 1} 組）`, async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const cases = [...GOLDEN, { name: '8000 × 8000', o: HUGE, counts: HUGE_COUNTS, hash: HUGE_HASH }];
  for (const g of cases) {
    const scene = await page.evaluate(
      (s) => (window as unknown as { __geoBloom: Hook }).__geoBloom.sceneFor(s),
      settingsWith(g.o),
    );
    expect([scene.shapes.length, scene.lines.length, scene.dots.length], g.name).toEqual(g.counts);
    expect(sha(canon(scene)), g.name).toBe(g.hash);
  }
  expect(errors).toEqual([]);
});

/* ---------- 種子與產生 ---------- */

test('種子：打字即時重畫、空白當成「0」；統計和原作相同', async ({ page }) => {
  const errors = await open(page);
  const seed = page.getByTestId('seed');
  await seed.fill('abc');
  await ready(page);
  await expect(stats(page)).toHaveText('圖形 14／線 20／點 1');
  await seed.fill('');
  await ready(page);
  const empty = await stats(page).textContent();
  const emptySig = await previewSig(page);
  await seed.fill('0');
  await ready(page);
  await expect(stats(page)).toHaveText(empty ?? '');
  expect(await previewSig(page)).toBe(emptySig);
  await expect(page.getByText('空白時當成「0」')).toBeVisible();
  expect(errors).toEqual([]);
});

test('產生、固定種子、Space（輸入欄裡不作用）、復原換回上一個種子', async ({ page }) => {
  const errors = await open(page);
  await apply(page, { seed: 'abc' });
  const before = await previewSig(page);
  await page.getByTestId('generate').click();
  await ready(page);
  const s1 = (await state(page)).seed;
  expect(s1).toMatch(/^[0-9a-z]{8}$/);
  expect(s1).not.toBe('abc');
  await expect(page.getByTestId('seed')).toHaveValue(s1);
  expect(await previewSig(page)).not.toBe(before);
  /* Space（焦點不在輸入欄） */
  await page.waitForTimeout(450);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await ready(page);
  const s2 = (await state(page)).seed;
  expect(s2).not.toBe(s1);
  /* 種子欄裡的空白是文字 */
  await page.getByTestId('seed').fill('ab');
  await page.getByTestId('seed').press('Space');
  await expect.poll(async () => (await state(page)).seed).toBe('ab ');
  /* 固定種子：產生、Space 都不換種子 */
  await page.getByTestId('seed').fill('fixed');
  await toggle(page, '固定種子').click();
  await page.getByTestId('generate').click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  expect((await state(page)).seed).toBe('fixed');
  await toggle(page, '固定種子').click();
  /* 復原：回到產生之前的種子 */
  await page.waitForTimeout(450);
  await page.getByTestId('generate').click();
  await ready(page);
  const s3 = (await state(page)).seed;
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).seed).not.toBe(s3);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await state(page)).seed).toBe(s3);
  expect(errors).toEqual([]);
});

/* ---------- 控制項 ---------- */

test('數值設定：每一個都會重畫；夾到範圍、取整數（線寬取 0.25 的倍數）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await apply(page, { seed: 'abc' });
  /* 第五項：用的種子（預設 abc；上限要用圖形、線都到上限的 seed1 才看得出變化） */
  const cases: [string, keyof Settings, string, number, string?][] = [
    ['寬', 'width', '1200', 1200],
    ['高', 'height', '900', 900],
    ['每個圖形的線數：最少', 'branchMin', '0', 0],
    ['每個圖形的線數：最多', 'branchMax', '12', 12],
    ['最大深度（代）', 'maxDepth', '6', 6],
    ['同心圓的最多層數', 'maxRings', '9', 9],
    ['中央圓的半徑：最小', 'rootMin', '100', 100],
    ['中央圓的半徑：最大', 'rootMax', '300', 300],
    ['子圖形的半徑：最小', 'childMin', '30', 30],
    ['子圖形的半徑：最大', 'childMax', '90', 90],
    ['每代的縮小率', 'shrink', '90', 90],
    ['線長：最小', 'lineMin', '120', 120],
    ['線長：最大', 'lineMax', '400', 400],
    ['線的末端放圖形', 'pShape', '40', 40],
    ['圖形再長線', 'pBranch', '95', 95],
    ['線的末端加點', 'pDot', '90', 90],
    ['角度的等間隔程度', 'regularity', '100', 100],
    ['圖形間的空隙', 'gap', '60', 60],
    ['強調色的比例', 'pAccent', '80', 80],
    ['線寬', 'lineWidth', '6.25', 6.25],
    ['塗滿的比例', 'pFill', '70', 70],
    ['圖形的最多數', 'maxShapes', '30', 30, 'seed1'],
    ['線的最多數（全部）', 'maxLines', '60', 60, 'seed1'],
    /* 原作 2026-10 的新設定 */
    ['不畫線、直接貼著放', 'pAttach', '30', 30],
    ['線的丟失率', 'pDrop', '60', 60],
    ['同心圓的最少層數', 'minRings', '5', 5],
    ['每一圈變成摩斯環的機率', 'pMorse', '50', 50],
    ['短點的長度', 'morseDot', '10.5', 10.5],
    ['長點的長度', 'morseDash', '5', 5],
    ['符號之間的間隔', 'morseGap', '2.25', 2.25],
    ['字母之間的間隔', 'morseLetterGap', '6', 6],
    ['單字之間的間隔', 'morseWordGap', '2', 2],
    ['長點的比例（隨機時）', 'pMorseDash', '90', 90],
    ['單字間隔的機率（隨機時）', 'pMorseWord', '90', 90],
    ['摩斯線的粗細', 'morseWidth', '2.5', 2.5],
    ['短點跟著每代縮小', 'morseShrink', '0', 0],
  ];
  const { seed: _s, lockSeed: _l, ...defaults } = await state(page);
  for (const [label, key, text, want, seed = 'abc'] of cases) {
    /* 每一項都從預設＋種子開始，只改這一項 */
    await apply(page, { ...defaults, seed });
    const before = await previewSig(page);
    await commit(spin(page, label), text);
    await expect.poll(async () => (await state(page))[key], label).toBe(want);
    await ready(page);
    expect(await previewSig(page), label).not.toBe(before);
  }
  /* 夾到範圍 */
  await commit(spin(page, '圖形的最多數'), '99999');
  await expect.poll(async () => (await state(page)).maxShapes).toBe(5000);
  await commit(spin(page, '寬'), '10');
  await expect.poll(async () => (await state(page)).width).toBe(64);
  await commit(spin(page, '線寬'), '2.4');
  await expect.poll(async () => (await state(page)).lineWidth).toBe(2.5);
  await commit(spin(page, '每代的縮小率'), '5');
  await expect.poll(async () => (await state(page)).shrink).toBe(30);
  await commit(spin(page, '短點的長度'), '6.3');
  await expect.poll(async () => (await state(page)).morseDot).toBe(6.5);
  await commit(spin(page, '符號之間的間隔'), '1.1');
  await expect.poll(async () => (await state(page)).morseGap).toBe(1);
  expect(errors).toEqual([]);
});

test('原作 2026-10 的新設定：貼著放、三角形、同心圓、摩斯環、摩斯橋、線的丟失', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await apply(page, { seed: 'abc', maxShapes: 120, maxLines: 240, pBranch: 90 });
  const scene = () =>
    page.evaluate(() => {
      const h = (window as unknown as { __geoBloom: Hook }).__geoBloom;
      return h.sceneFor(h.settingsNow());
    });
  let prev = await previewSig(page);
  const changed = async (label: string) => {
    await ready(page);
    const now = await previewSig(page);
    expect(now, label).not.toBe(prev);
    prev = now;
  };
  /* 同心圓：放射線的起點（下拉選單）、子圖形接在同一圈、中央一定是同心圓 */
  await page.getByRole('combobox', { name: '放射線的起點' }).click();
  await page.getByRole('option', { name: '中心' }).click();
  await changed('中心');
  await toggle(page, '子圖形也接在同一圈').click();
  await changed('子圖形也接在同一圈');
  await toggle(page, '中央一定是同心圓').click();
  await expect.poll(async () => (await state(page)).rootRings).toBe(false);
  await ready(page);
  prev = await previewSig(page);
  expect(await state(page)).toMatchObject({ startRing: 'center', endAtRing: false });
  /* 貼著放：機率 0 時「嵌進去」停用 */
  await expect(spin(page, '貼著放時嵌進去')).toBeDisabled();
  await commit(spin(page, '不畫線、直接貼著放'), '60');
  await changed('貼著放');
  await expect(spin(page, '貼著放時嵌進去')).toBeEnabled();
  await commit(spin(page, '貼著放時嵌進去'), '40');
  await changed('嵌進去');
  expect((await scene()).shapes.some((x) => x.attached)).toBe(true);
  /* 三角形：沒勾時出現率與內接在哪一圈停用 */
  await expect(spin(page, '三角形的出現率')).toBeDisabled();
  await expect(radio(page, '第二圈')).toBeDisabled();
  await page.getByRole('checkbox', { name: '三角環', exact: true }).click();
  await changed('三角環');
  await expect(spin(page, '三角形的出現率')).toBeEnabled();
  await radio(page, '第二圈').click();
  await changed('第二圈');
  await commit(spin(page, '三角形的出現率'), '80');
  await changed('出現率');
  const tris = (await scene()).shapes.filter((x) => x.tri?.mode === 'ring');
  expect(tris.length).toBeGreaterThan(3);
  expect(await state(page)).toMatchObject({ triRing: 'second', pTri: 80, pAttach: 60 });
  /* 摩斯環：實線的圈數跟著起點時「保留成實線的內圈數」停用；起點是中心時不跟 */
  await expect(spin(page, '保留成實線的內圈數')).toBeEnabled();
  await commit(spin(page, '保留成實線的內圈數'), '0');
  await changed('保留成實線的內圈數');
  await page.getByRole('combobox', { name: '放射線的起點' }).click();
  await page.getByRole('option', { name: '第一圈（最內層）' }).click();
  await ready(page);
  await expect(spin(page, '保留成實線的內圈數')).toBeDisabled();
  await toggle(page, '實線的圈數跟著放射線的起點').click();
  await expect(spin(page, '保留成實線的內圈數')).toBeEnabled();
  await ready(page);
  prev = await previewSig(page);
  for (const name of ['短點畫成圓點', '點線的兩端是圓的']) {
    await toggle(page, name).click();
    await changed(name);
  }
  /* 摩斯電碼的文字：排成的電碼與略過的字；一個能轉的字都沒有時和沒填一樣（隨機） */
  const text = page.getByTestId('morse-text');
  await text.fill('SOS 救命');
  await changed('文字');
  const note = page.getByTestId('morse-note');
  await expect(note).toContainText('排成：... --- ... /');
  await expect(note).toContainText('略過（沒有摩斯電碼）：救、命');
  await expect(spin(page, '長點的比例（隨機時）')).toBeDisabled();
  await text.fill('');
  await ready(page);
  const randomSig = await previewSig(page);
  await expect(note).toHaveCount(0);
  await text.fill('救命');
  await ready(page);
  await expect(note).toContainText('沒有能轉成摩斯電碼的字，改成隨機排。');
  expect(await previewSig(page)).toBe(randomSig);
  await text.fill('ｓｏｓ');
  await ready(page);
  await expect(note).toContainText('排成：... --- ...');
  prev = await previewSig(page);
  /* 摩斯橋：關閉時機率停用；打開後統計有「橋」 */
  await expect(spin(page, '每個字母架橋的機率')).toBeDisabled();
  await toggle(page, '摩斯橋').click();
  await changed('摩斯橋');
  await commit(spin(page, '每個字母架橋的機率'), '100');
  await changed('架橋的機率');
  await expect(stats(page)).toHaveText(/／橋 \d+$/);
  /* 線的丟失：統計寫出丟失的數量 */
  await commit(spin(page, '線的丟失率'), '100');
  await changed('線的丟失率');
  await expect(stats(page)).toHaveText(/^圖形 \d+／線 \d+（另丟失 \d+）／點 \d+／橋 \d+$/);
  /* 摩斯環關閉 */
  await toggle(page, '摩斯環').click();
  await changed('摩斯環');
  expect(await state(page)).toMatchObject({
    startRing: 'ring1',
    solidFollow: false,
    solidInner: 0,
    morseRound: true,
    morseCap: false,
    morseText: 'ｓｏｓ',
    bridges: true,
    pBridge: 100,
    pDrop: 100,
    morse: false,
  });
  expect(errors).toEqual([]);
});

test('數量：上限、深度 0、不放圖形、不加點；最小大於最大時互換', async ({ page }) => {
  const errors = await open(page);
  await apply(page, { seed: 'abc', maxDepth: 0 });
  await expect(stats(page)).toHaveText('圖形 1／線 0／點 0');
  await apply(page, { maxDepth: 4, maxLines: 0 });
  await expect(stats(page)).toHaveText('圖形 1／線 0／點 0');
  await apply(page, { maxLines: 120, maxShapes: 1, pDot: 0 });
  await expect(stats(page)).toHaveText(/^圖形 1／線 \d+／點 0$/);
  await apply(page, { maxShapes: 60, pDot: 40, pShape: 0 });
  await expect(stats(page)).toHaveText(/^圖形 1／線 [1-9]\d*／點 \d+$/);
  /* 互換：9～3 和 3～9 是同一張 */
  await apply(page, { pShape: 70, branchMin: 3, branchMax: 9, rootMin: 100, rootMax: 300 });
  const a = await previewSig(page);
  await apply(page, { branchMin: 9, branchMax: 3, rootMin: 300, rootMax: 100 });
  expect(await previewSig(page)).toBe(a);
  expect(errors).toEqual([]);
});

test('圖形的種類：只勾一種、全部取消時都是圓', async ({ page }) => {
  const errors = await open(page);
  await apply(page, { seed: 'kinds', maxShapes: 120, maxLines: 240, pBranch: 100 });
  const scene = () =>
    page.evaluate(() => {
      const h = (window as unknown as { __geoBloom: Hook }).__geoBloom;
      return h.sceneFor(h.settingsNow());
    });
  const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
  for (const name of ['圓', '同心圓', '半圓', '圓＋半圓', '雙正方形']) await box(name).click();
  await ready(page);
  expect((await state(page)).shapes).toEqual({
    circle: false,
    rings: false,
    semi: false,
    mix: false,
    square: true,
    doubleSquare: false,
    triCore: false,
    triRing: false,
  });
  let s = await scene();
  expect(s.shapes.length).toBeGreaterThan(5);
  expect(s.shapes.slice(1).every((x) => x.kind === 'square')).toBe(true);
  await box('正方形').click();
  await ready(page);
  s = await scene();
  expect(s.shapes.slice(1).every((x) => x.kind === 'circle')).toBe(true);
  await expect(page.getByText('一般的種類都不勾時全部是圓', { exact: false })).toBeVisible();
  /* 只勾三角心：子圖形全部是三角心 */
  await box('三角心').click();
  await ready(page);
  s = await scene();
  expect(s.shapes.length).toBeGreaterThan(5);
  expect(s.shapes.slice(1).every((x) => x.kind === 'rings' && x.tri?.mode === 'core')).toBe(true);
  /* 每個種類旁邊有小圖示 */
  await expect(page.locator('[data-shape-icon]')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('重疊：關閉時「重疊時」「空隙」停用；三種模式；線不穿過；收在畫布內', async ({ page }) => {
  const errors = await open(page);
  await apply(page, {
    seed: 'overlap',
    width: 900,
    height: 700,
    maxShapes: 200,
    maxLines: 400,
    maxDepth: 6,
  });
  /* 每一步都換了圖 */
  let prev = await previewSig(page);
  const changed = async (label: string) => {
    await ready(page);
    const now = await previewSig(page);
    expect(now, label).not.toBe(prev);
    prev = now;
  };
  for (const name of ['只畫線', '整條取消']) {
    await radio(page, name).click();
    await changed(name);
  }
  expect((await state(page)).overlapMode).toBe('skip');
  await radio(page, '換角度重試').click();
  await changed('換角度重試');
  await toggle(page, '線不穿過既有圖形').click();
  await changed('線不穿過既有圖形');
  await toggle(page, '線不跨過既有的線').click();
  await changed('線不跨過既有的線');
  await toggle(page, '收在畫布內').click();
  await changed('收在畫布內');
  await radio(page, '整條取消').click();
  await changed('整條取消');
  await toggle(page, '不和既有圖形重疊').click();
  await changed('不和既有圖形重疊');
  await expect(radio(page, '換角度重試')).toBeDisabled();
  await expect(spin(page, '圖形間的空隙')).toBeDisabled();
  expect(await state(page)).toMatchObject({
    avoidOverlap: false,
    overlapMode: 'skip',
    lineAvoid: true,
    noCross: true,
    inBounds: false,
  });
  expect(errors).toEqual([]);
});

test('匯出 PNG：檔名、全尺寸、像素（背景色、中央圖形的中心點、透明背景）', async ({ page }) => {
  const errors = await open(page);
  await apply(page, { seed: 'abc' });
  let f = await exportAs(page, 'PNG');
  expect(f.name).toBe('geometric_abc.png');
  let p = pngPixels(f.bytes);
  expect([p.width, p.height]).toEqual([1600, 1600]);
  expect(px(p, 0, 0)).toEqual([14, 15, 18, 255]);
  expect(px(p, 1599, 1599)).toEqual([14, 15, 18, 255]);
  /* 種子 abc 的中央是三角心的同心圓（不是強調色），中心有一般的中心點：線的顏色 */
  expect(px(p, 800, 800)).toEqual([232, 228, 218, 255]);
  await expect(page.getByTestId('export-result')).toContainText('匯出時間');
  /* 改顏色（色碼欄）：背景、線的顏色 */
  await commit(page.getByRole('textbox', { name: '背景色', exact: true }), '#ff0000');
  await commit(page.getByRole('textbox', { name: '線的顏色', exact: true }), '#00ff00');
  await ready(page);
  await expect(page.getByTestId('export-result')).toHaveCount(0);
  f = await exportAs(page, 'PNG');
  p = pngPixels(f.bytes);
  expect(px(p, 0, 0)).toEqual([255, 0, 0, 255]);
  expect(px(p, 800, 800)).toEqual([0, 255, 0, 255]);
  /* 透明背景：背景色停用、角落全透明 */
  await toggle(page, '背景透明').click();
  await ready(page);
  await expect(page.getByRole('textbox', { name: '背景色', exact: true })).toBeDisabled();
  f = await exportAs(page, 'PNG');
  p = pngPixels(f.bytes);
  expect(px(p, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(px(p, 800, 800)).toEqual([0, 255, 0, 255]);
  /* 空白的種子：geometric_.png（同原作） */
  await page.getByTestId('seed').fill('');
  await ready(page);
  f = await exportAs(page, 'PNG');
  expect(f.name).toBe('geometric_.png');
  expect(errors).toEqual([]);
});

test('匯出 SVG：結構與數量；瀏覽器畫出來和 PNG 幾乎相同', async ({ page }) => {
  const errors = await open(page);
  await apply(page, { seed: 'abc', pFill: 40 });
  const png = await exportAs(page, 'PNG');
  const svg = await exportAs(page, 'SVG');
  expect(svg.name).toBe('geometric_abc.svg');
  const text = svg.bytes.toString('utf8');
  expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1600" height="1600"/);
  expect(text).toContain('<rect width="1600" height="1600" fill="#0e0f12"/>');
  const st = await page.evaluate(() => {
    const h = (window as unknown as { __geoBloom: Hook }).__geoBloom;
    return h.sceneFor(h.settingsNow());
  });
  expect((text.match(/<g transform=/g) ?? []).length).toBe(st.shapes.length);
  /* 線：外層的 path（有 stroke 色）裡的每一段；丟失的線不畫 */
  const linePaths = [...text.matchAll(/<path d="([^"]*)" stroke="#[0-9a-f]{6}"\/>/g)];
  const segments = linePaths.reduce((n, m) => n + (m[1].match(/L/g) ?? []).length, 0);
  expect(segments).toBe(st.lines.filter((l) => !l.dropped).length);
  expect((text.match(/<circle cx=/g) ?? []).length).toBe(st.dots.length);
  /* 在頁面裡把 SVG 與 PNG 畫到同樣大的畫布上比較：差很多的像素不到 1% */
  const diff = await page.evaluate(
    async ({ svgText, pngB64 }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const read = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = 1600;
        c.height = 1600;
        const ctx = c.getContext('2d') as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0, 1600, 1600);
        return ctx.getImageData(0, 0, 1600, 1600).data;
      };
      const a = read(await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`));
      const b = read(await load(`data:image/png;base64,${pngB64}`));
      let far = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(
          Math.abs(a[i] - b[i]),
          Math.abs(a[i + 1] - b[i + 1]),
          Math.abs(a[i + 2] - b[i + 2]),
        );
        if (d > 96) far++;
      }
      return far / (a.length / 4);
    },
    { svgText: text, pngB64: png.bytes.toString('base64') },
  );
  test.info().annotations.push({
    type: 'SVG 與 PNG 差很多的像素',
    description: `${(diff * 100).toFixed(3)}%`,
  });
  expect(diff).toBeLessThan(0.01);
  /* 透明背景時沒有背景的 rect */
  await toggle(page, '背景透明').click();
  await ready(page);
  const t2 = (await exportAs(page, 'SVG')).bytes.toString('utf8');
  expect(t2).not.toContain('fill="#0e0f12"');
  expect(errors).toEqual([]);
});

test('範本：套用前確認，換掉種子以外的設定，可以復原', async ({ page }) => {
  const errors = await open(page);
  await apply(page, { seed: 'tpl' });
  const gallery = page.getByRole('list', { name: '花紋範本' });
  await expect(gallery.getByRole('button')).toHaveCount(8);
  await expect(gallery.getByRole('button', { name: /基本/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await gallery.getByRole('button', { name: /魔法陣/ }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('套用範本「魔法陣」？');
  await dlg.getByRole('button', { name: '套用' }).click();
  await ready(page);
  const s = await state(page);
  expect(s).toMatchObject({ seed: 'tpl', regularity: 100, rootMin: 220, overlapMode: 'skip' });
  await expect(gallery.getByRole('button', { name: /魔法陣/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await gallery.getByRole('button', { name: /科幻介面/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '套用' }).click();
  await ready(page);
  expect(await state(page)).toMatchObject({ seed: 'tpl', width: 1920, height: 1080 });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).rootMin).toBe(220);
  /* 示範新功能的兩組（D21）：電報＝摩斯電碼的文字＋摩斯橋；三角星盤＝三角心＋三角環 */
  await gallery.getByRole('button', { name: /電報/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '套用' }).click();
  await ready(page);
  expect(await state(page)).toMatchObject({
    seed: 'tpl',
    morse: true,
    morseText: 'CQ CQ DE BLOOM',
    bridges: true,
  });
  await expect(stats(page)).toContainText('／橋 ');
  await expect(page.getByTestId('morse-text')).toHaveValue('CQ CQ DE BLOOM');
  await gallery.getByRole('button', { name: /三角星盤/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '套用' }).click();
  await ready(page);
  expect(await state(page)).toMatchObject({
    seed: 'tpl',
    morse: false,
    shapes: { triCore: true, triRing: true },
  });
  await expect(gallery.getByRole('button', { name: /三角星盤/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原；專案檔存了再開；別的檔案開不了', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('seed').fill('saved-seed');
  await page.waitForTimeout(450);
  await commit(spin(page, '圖形的最多數'), '33');
  await ready(page);
  await expect
    .poll(() =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.state?.data?.seed, KEY),
    )
    .toBe('saved-seed');
  const sig = await previewSig(page);
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('seed')).toHaveValue('saved-seed');
  expect((await state(page)).maxShapes).toBe(33);
  expect(await previewSig(page)).toBe(sig);
  /* 專案檔（JSON） */
  await btn(page, '專案').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^幾何花紋_\d{8}\.json$/);
  const bytes = readFileSync((await dl.path()) as string);
  const json = JSON.parse(bytes.toString('utf8'));
  expect(json).toMatchObject({ format: 'trpg-toolkit-project', tool: 'geo-bloom', version: 2 });
  expect(json.data).toMatchObject({ seed: 'saved-seed', maxShapes: 33, width: 1600 });
  /* 改掉再開回來 */
  await page.getByTestId('seed').fill('other');
  await ready(page);
  await btn(page, '專案').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles({ name: 'p.json', mimeType: 'application/json', buffer: bytes });
  /* 讀檔後確認（共用 ProjectMenu 的預設）：等對話框出現再按「開啟」 */
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('開啟專案檔？');
  await confirm.getByRole('button', { name: '開啟', exact: true }).click();
  await expect(page.getByTestId('seed')).toHaveValue('saved-seed');
  await ready(page);
  expect(await previewSig(page)).toBe(sig);
  /* 別的工具的專案檔 */
  await btn(page, '專案').click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser2.setFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...json, tool: 'grid-maker' })),
  });
  await expect(toast(page, /不是|無法|開不了/).first()).toBeVisible();
  await expect(page.getByTestId('seed')).toHaveValue('saved-seed');
  expect(errors).toEqual([]);
});

/* ---------- 把種子刻進圖形、從圖片讀種子 ---------- */

const decodeOut = (page: Page) => page.getByTestId('decode-output');
/** 等讀種子的對話框讀完 */
async function decoded(page: Page) {
  await expect(page.getByTestId('decode-dialog')).toBeVisible();
  await expect(decodeOut(page)).toHaveAttribute('data-busy', 'false', { timeout: 60_000 });
  await expect(decodeOut(page)).not.toHaveText('');
}

/** 拖放圖片到視窗（WindowDrop） */
async function dropImage(page: Page, name: string, type: string, bytes: Buffer) {
  await page.evaluate(
    ({ name, type, b64 }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([arr], name, { type }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      window.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    },
    { name, type, b64: bytes.toString('base64') },
  );
}

/** 在頁面裡把 PNG 轉成別的格式或縮放（瀏覽器的編碼器） */
const reencode = (page: Page, png: Buffer, type: string, scale: number, quality?: number) =>
  page
    .evaluate(
      async ({ b64, type, scale, quality }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        (c.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0, c.width, c.height);
        const blob = (await new Promise<Blob | null>((r) => c.toBlob(r, type, quality))) as Blob;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
      },
      { b64: png.toString('base64'), type, scale, quality },
    )
    .then((b64) => Buffer.from(b64, 'base64'));

test('把種子刻進圖形：容量提示；匯出 PNG 再選檔讀回；用這個種子重畫（固定種子、同一張）', async ({
  page,
}) => {
  const errors = await open(page);
  await apply(page, { seed: 'e2e-code' });
  await toggle(page, '把種子刻進圖形').click();
  await ready(page);
  const info = page.getByTestId('code-info');
  await expect(info).toContainText('新方式：種子 8 位元組，連同檢查碼共 104 個位元');
  await expect(info).toContainText('✔ 整份都刻進去了');
  await expect(info).toHaveAttribute('data-ok', 'true');
  /* 舊方式的設定在新方式時停用 */
  await expect(spin(page, '一個圖形最多放幾個位元')).toBeDisabled();
  const sig = await previewSig(page);
  const png = await exportAs(page, 'PNG');
  /* 換掉種子後讀回 */
  await page.getByTestId('seed').fill('other');
  await ready(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('選擇圖片…', { exact: true }).click(),
  ]);
  await chooser.setFiles({ name: 'coded.png', mimeType: 'image/png', buffer: png.bytes });
  await decoded(page);
  await expect(decodeOut(page)).toHaveAttribute('data-ok', 'true');
  await expect(decodeOut(page)).toContainText('新方式：圖裡有');
  await expect(decodeOut(page)).toContainText('✔ 讀到種子了');
  await expect(decodeOut(page)).toContainText('種子：e2e-code');
  await expect(decodeOut(page)).toContainText('圖裡只刻了種子，重畫時沿用現在的設定。');
  await expect(page.getByTestId('decode-canvas')).toBeVisible();
  /* 換讀的方式：只用舊方式讀不出來，換回自動又讀得出來 */
  await page.getByRole('radio', { name: '只用舊方式' }).click();
  await expect(decodeOut(page)).toHaveAttribute('data-ok', 'false');
  await expect(decodeOut(page)).toContainText('舊方式：檢查了');
  await page.getByRole('radio', { name: '自動（先新後舊）' }).click();
  await expect(decodeOut(page)).toHaveAttribute('data-ok', 'true');
  await page.getByTestId('decode-apply').click();
  await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  /* 焦點回到「選擇圖片…」 */
  await expect(
    page.getByRole('group', { name: '選擇或拖放圖片' }).locator('input[type="file"]'),
  ).toBeFocused();
  await expect.poll(async () => (await state(page)).seed).toBe('e2e-code');
  expect((await state(page)).lockSeed).toBe(true);
  await ready(page);
  expect(await previewSig(page)).toBe(sig);
  /* 一步復原回到讀之前 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).seed).toBe('other');
  expect(errors).toEqual([]);
});

test('設定也一起刻：改掉設定後拖進視窗讀回，種子與設定一起換回來；舊方式讀目前的圖', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const original: Overrides = {
    seed: 'with-settings',
    code: true,
    codeSettings: true,
    maxShapes: 300,
    maxLines: 600,
    lineWidth: 2.5,
    background: '#203040',
  };
  await apply(page, original);
  await expect(page.getByTestId('code-info')).toContainText('新方式：種子與設定');
  await expect(page.getByTestId('code-info')).toHaveAttribute('data-ok', 'true');
  const sig = await previewSig(page);
  const png = await exportAs(page, 'PNG');
  await apply(page, {
    seed: 'x',
    lineWidth: 4,
    background: '#000000',
    maxShapes: 60,
  });
  await dropImage(page, 'coded.png', 'image/png', png.bytes);
  await decoded(page);
  await expect(decodeOut(page)).toContainText('種子：with-settings');
  await expect(decodeOut(page)).toContainText(/另外刻了 \d+ 項設定，重畫時一起套用。/);
  await page.getByTestId('decode-apply').click();
  await expect.poll(async () => (await state(page)).seed).toBe('with-settings');
  expect(await state(page)).toMatchObject({ ...original, lockSeed: true });
  await ready(page);
  expect(await previewSig(page)).toBe(sig);
  /* 舊方式：讀目前的圖（畫成全尺寸再讀） */
  await radio(page, '舊方式').click();
  await ready(page);
  await expect(page.getByTestId('code-info')).toContainText('舊方式：種子與設定');
  await expect(spin(page, '一個圖形最多放幾個位元')).toBeEnabled();
  await page.getByTestId('decode-current').click();
  await decoded(page);
  await expect(decodeOut(page)).toHaveAttribute('data-ok', 'true');
  await expect(decodeOut(page)).toContainText('自動：新方式沒讀到，下面是改用舊方式讀的結果。');
  await expect(decodeOut(page)).toContainText('種子：with-settings');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  /* 焦點回到「讀目前的圖」 */
  await expect(page.getByTestId('decode-current')).toBeFocused();
  expect(errors).toEqual([]);
});

test('從圖片讀種子的容忍度（照原作）：JPEG、WebP、放大讀得出來；縮到一半、沒刻種子的圖讀不出來', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  /* 讀得出來的範圍依圖而定（原作同；規格 3.16 的實測）：這張是種子 abc 的預設 */
  await apply(page, { seed: 'abc', code: true });
  const png = (await exportAs(page, 'PNG')).bytes;
  const cases: [string, string, number, number | undefined, boolean][] = [
    ['JPEG 品質 50%', 'image/jpeg', 1, 0.5, true],
    ['WebP 品質 75%', 'image/webp', 1, 0.75, true],
    ['放大 1.5 倍', 'image/png', 1.5, undefined, true],
    ['縮小到 75%', 'image/png', 0.75, undefined, true],
    ['縮小到 50%', 'image/png', 0.5, undefined, false],
  ];
  for (const [label, type, scale, q, ok] of cases) {
    const bytes = await reencode(page, png, type, scale, q);
    await dropImage(page, 'x', type, bytes);
    await decoded(page);
    await expect(decodeOut(page), label).toHaveAttribute('data-ok', ok ? 'true' : 'false');
    if (ok) await expect(decodeOut(page), label).toContainText('種子：abc');
    else await expect(page.getByTestId('decode-apply'), label).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  }
  /* 沒刻種子的圖 */
  await apply(page, { code: false });
  const plain = (await exportAs(page, 'PNG')).bytes;
  await dropImage(page, 'plain.png', 'image/png', plain);
  await decoded(page);
  await expect(decodeOut(page)).toHaveAttribute('data-ok', 'false');
  await expect(decodeOut(page)).toContainText('沒讀成功');
  /* 沒有縮過：不說明縮圖 */
  await expect(page.getByTestId('decode-scaled')).toHaveCount(0);
  /* 點圖上的位置再讀（加上中心）：照常讀完 */
  await page.getByTestId('decode-canvas').click({ position: { x: 20, y: 20 } });
  await expect(decodeOut(page)).toHaveAttribute('data-busy', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  /* 長邊超過 4000 px 又讀不出來：說明會先縮圖（短點跟著縮短） */
  const big = await reencode(page, plain, 'image/png', 2.6);
  await dropImage(page, 'big.png', 'image/png', big);
  await decoded(page);
  await expect(decodeOut(page)).toHaveAttribute('data-ok', 'false');
  await expect(page.getByTestId('decode-scaled')).toContainText(
    '這張圖是 4160 × 4160 px，會先縮到長邊 4000 px 再讀',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('不是圖片的檔案：拖放區、拖進視窗、貼上都通知讀不了，不開對話框', async ({ page }) => {
  const errors = await open(page);
  const message = '讀不了這個檔案，請用 PNG、JPEG 或 WebP 的圖。';
  /* 拖進視窗 */
  await dropImage(page, 'notes.txt', 'text/plain', Buffer.from('hello'));
  await expect(toast(page, message)).toBeVisible();
  await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  await page
    .getByRole('region', { name: /^通知/ })
    .getByRole('button', { name: '關閉通知' })
    .click();
  await expect(toast(page, message)).toHaveCount(0);
  /* 放在拖放區 */
  await page.getByRole('group', { name: '選擇或拖放圖片' }).evaluate((zone) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['{}'], 'data.json', { type: 'application/json' }));
    zone.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(toast(page, message)).toBeVisible();
  await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  await page
    .getByRole('region', { name: /^通知/ })
    .getByRole('button', { name: '關閉通知' })
    .click();
  await expect(toast(page, message)).toHaveCount(0);
  /* 貼上 */
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(toast(page, message)).toBeVisible();
  await expect(page.getByTestId('decode-dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** 資料版本 1（原作 3097b39 時）的設定：沒有原作 2026-10 的欄位，圖形種類只有六個 */
const V1_DATA = {
  seed: 'legacy-a',
  lockSeed: false,
  width: 1600,
  height: 1600,
  maxShapes: 60,
  maxLines: 120,
  branchMin: 2,
  branchMax: 7,
  maxDepth: 4,
  maxRings: 5,
  rootMin: 60,
  rootMax: 180,
  childMin: 12,
  childMax: 70,
  shrink: 75,
  lineMin: 60,
  lineMax: 260,
  pShape: 70,
  pBranch: 65,
  pDot: 40,
  regularity: 50,
  shapes: { circle: true, rings: true, semi: true, mix: true, square: true, doubleSquare: true },
  avoidOverlap: true,
  overlapMode: 'retry',
  gap: 8,
  lineAvoid: false,
  inBounds: true,
  background: '#0e0f12',
  transparent: false,
  lineColor: '#e8e4da',
  accentColor: '#d9a441',
  pAccent: 15,
  lineWidth: 2,
  pFill: 10,
  fromEdge: true,
};
const LEGACY_GOLDEN = GOLDEN.find((g) => g.name.startsWith('舊版的值')) as (typeof GOLDEN)[number];

const legacyHash = (page: Page) =>
  page.evaluate(async () => {
    const h = (window as unknown as { __geoBloom: Hook }).__geoBloom;
    return h.sceneFor(h.settingsNow());
  });

test('舊的專案檔（資料版本 1）：沒有的設定補舊版的值（沒有摩斯環、線從最外圈出發），和原作同樣的設定畫出同一張', async ({
  page,
}) => {
  const errors = await open(page);
  await btn(page, '專案').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  const file = {
    format: 'trpg-toolkit-project',
    tool: 'geo-bloom',
    version: 1,
    savedAt: '2026-10-17T00:00:00.000Z',
    data: V1_DATA,
  };
  await chooser.setFiles({
    name: 'old.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟', exact: true }).click();
  await expect(page.getByTestId('seed')).toHaveValue('legacy-a');
  /* 畫法改了：通知一次（3.8） */
  await expect(
    toast(
      page,
      '這份專案檔是改版前存的：這一版的畫法改了，同一個種子畫出來會和以前不同（中央是同心圓的圖差最多）。',
    ),
  ).toBeVisible();
  await ready(page);
  expect(await state(page)).toMatchObject({
    rootRings: false,
    minRings: 2,
    startRing: 'edge',
    morse: false,
    bridges: false,
    shapes: { ...V1_DATA.shapes, triCore: false, triRing: false },
  });
  const sc = await legacyHash(page);
  expect(sha(canon(sc))).toBe(LEGACY_GOLDEN.hash);
  await expect(stats(page)).toHaveText(
    `圖形 ${LEGACY_GOLDEN.counts[0]}／線 ${LEGACY_GOLDEN.counts[1]}／點 ${LEGACY_GOLDEN.counts[2]}`,
  );
  expect(errors).toEqual([]);
});

test('舊的自動儲存（資料版本 1）：重新整理後補舊版的值，通知一次', async ({ page }) => {
  await page.addInitScript(
    ({ key, data }) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, JSON.stringify({ state: { data }, version: 1 }));
        sessionStorage.setItem('seeded', '1');
      }
    },
    { key: KEY, data: { ...V1_DATA, maxShapes: 44 } },
  );
  const errors = await open(page);
  expect(await state(page)).toMatchObject({
    seed: 'legacy-a',
    maxShapes: 44,
    rootRings: false,
    startRing: 'edge',
    morse: false,
  });
  /* 畫法改了：通知一次（3.8） */
  await expect(toast(page, '上次的設定是改版前存的')).toBeVisible();
  await expect(toast(page, '這一版的畫法改了，同一個種子畫出來會和以前不同')).toBeVisible();
  /* 讀回後就存成資料版本 2：重新整理不再通知 */
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.version, KEY))
    .toBe(2);
  await page.reload();
  await ready(page);
  expect(await state(page)).toMatchObject({ seed: 'legacy-a', maxShapes: 44, morse: false });
  await expect(page.getByTestId('bloom-stats')).toBeVisible();
  await expect(toast(page, '上次的設定是改版前存的')).toHaveCount(0);
  await commit(spin(page, '線寬'), '3');
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.version, KEY))
    .toBe(2);
  expect(errors).toEqual([]);
});

test('復原／重做（按鈕與快捷鍵）；重設換新的種子、可以復原；快捷鍵說明', async ({ page }) => {
  const errors = await open(page);
  await apply(page, { seed: 'undo' });
  await page.waitForTimeout(450);
  await commit(spin(page, '最大深度（代）'), '7');
  await expect.poll(async () => (await state(page)).maxDepth).toBe(7);
  await btn(page, '復原（Ctrl＋Z）').click();
  await expect.poll(async () => (await state(page)).maxDepth).toBe(4);
  await btn(page, '重做（Ctrl＋Shift＋Z）').click();
  await expect.poll(async () => (await state(page)).maxDepth).toBe(7);
  /* 重設 */
  await page.waitForTimeout(450);
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: /重設/ }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('全部重設？');
  await dlg.getByRole('button', { name: /重設/ }).click();
  await expect.poll(async () => (await state(page)).maxDepth).toBe(4);
  const s = await state(page);
  expect(s.seed).toMatch(/^[0-9a-z]{8}$/);
  await btn(page, '復原（Ctrl＋Z）').click();
  await expect.poll(async () => (await state(page)).seed).toBe('undo');
  expect((await state(page)).maxDepth).toBe(7);
  /* 快捷鍵說明 */
  await btn(page, '快捷鍵（?）').click();
  const help = page.getByRole('dialog', { name: '快捷鍵' });
  for (const t of ['產生', '復原', '重做']) await expect(help).toContainText(t);
  expect(errors).toEqual([]);
});

/* ---------- 大畫布、Worker ---------- */

test('大畫布 8000 × 8000：預覽縮小、畫的時候頁面照常反應、匯出全尺寸', { tag: '@serial' }, async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  await page.evaluate((o) => {
    const h = (window as unknown as { __geoBloom: Hook }).__geoBloom;
    const st = h.useSettings.getState();
    st.replace({ ...st.data, ...o } as Settings);
  }, HUGE);
  /* 產生與繪製在 Worker：主執行緒照常（下一個畫面很快就來） */
  const frame = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const t0 = performance.now();
        requestAnimationFrame(() => resolve(performance.now() - t0));
      }),
  );
  expect(frame).toBeLessThan(250);
  /* 畫超過 0.3 秒：預覽上顯示「繪製中…」 */
  await expect(page.getByRole('status').filter({ hasText: '繪製中…' })).toBeVisible();
  await ready(page, 60_000);
  await expect(stats(page)).toHaveText(
    `圖形 ${HUGE_COUNTS[0]}／線 ${HUGE_COUNTS[1]}／點 ${HUGE_COUNTS[2]}`,
  );
  await expect(page.getByTestId('bloom-scaled')).toHaveText('預覽縮小為 26%，匯出為原尺寸。');
  expect((await previewSig(page)).startsWith('2048x2048:')).toBe(true);
  const t0 = Date.now();
  const f = await exportAs(page, 'PNG');
  test.info().annotations.push({ type: '8000 × 8000 PNG', description: `${Date.now() - t0} ms` });
  expect(f.name).toBe('geometric_huge.png');
  /* 超過 5 MB 的提醒寫這個工具能做的事（沒有 FPS、減色；7.1） */
  const card = page.getByTestId('export-result');
  await expect(card).toContainText('可以縮小畫布，或改匯出 SVG。');
  await expect(card).not.toContainText('FPS');
  await expect(card).not.toContainText('減色');
  const ihdr = readIhdr(parseChunks(f.bytes));
  expect([ihdr.width, ihdr.height]).toEqual([8000, 8000]);
  expect(errors).toEqual([]);
});

test('很慢的預覽剛開始就改回來、之後不再改：滿 1 秒時重開 Worker，不等慢的畫完（7.1）', {
  tag: '@serial',
}, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const fast: Overrides = {
    ...HUGE,
    childMin: 12,
    childMax: 70,
    shrink: 75,
    inBounds: true,
    lineAvoid: false,
    avoidOverlap: true,
  };
  await apply(page, fast);
  await expect(stats(page)).toHaveText(
    `圖形 ${HUGE_COUNTS[0]}／線 ${HUGE_COUNTS[1]}／點 ${HUGE_COUNTS[2]}`,
  );
  /* 這組在 Worker 裡要畫好幾分鐘（子圖形很大、不縮小、線不穿過、不重疊） */
  const slow: Overrides = {
    ...fast,
    seed: 'heavy-a',
    childMin: 520,
    childMax: 800,
    shrink: 100,
    inBounds: false,
    lineAvoid: true,
  };
  const set = (o: Overrides) =>
    page.evaluate((o) => {
      const st = (window as unknown as { __geoBloom: Hook }).__geoBloom.useSettings.getState();
      st.replace({ ...st.data, ...o } as Settings);
    }, o);
  await set(slow);
  await page.waitForTimeout(400);
  await set(fast);
  const t0 = Date.now();
  await ready(page, 20_000);
  test.info().annotations.push({ type: '改回來到畫好', description: `${Date.now() - t0} ms` });
  await expect(stats(page)).toHaveText(
    `圖形 ${HUGE_COUNTS[0]}／線 ${HUGE_COUNTS[1]}／點 ${HUGE_COUNTS[2]}`,
  );
  expect(errors).toEqual([]);
});

test('Worker 不能用時改在主執行緒畫：預覽與匯出照常，像素和 Worker 畫的相同', async ({
  browser,
  page,
}) => {
  const errors = await open(page);
  await apply(page, { seed: 'fallback', transparent: true, pFill: 50 });
  const viaWorker = pngPixels((await exportAs(page, 'PNG')).bytes);

  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const p2 = await ctx.newPage();
  const errs2: string[] = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await p2.route(/bloom\.worker[^/]*\.js/, (r) => r.abort());
  await p2.goto(URL);
  await ready(p2);
  await apply(p2, { seed: 'fallback', transparent: true, pFill: 50 });
  const viaMain = pngPixels((await exportAs(p2, 'PNG')).bytes);
  expect([viaMain.width, viaMain.height]).toEqual([viaWorker.width, viaWorker.height]);
  expect(Buffer.compare(Buffer.from(viaMain.data), Buffer.from(viaWorker.data))).toBe(0);
  expect(errs2).toEqual([]);
  await ctx.close();
  expect(errors).toEqual([]);
});

test.describe('iPhone', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  test('畫布超過裝置的上限時，匯出區上方提醒', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByTestId('device-limit')).toHaveCount(0);
    await apply(page, { width: 5000, height: 5000, maxShapes: 10, maxLines: 10 });
    await expect(page.getByTestId('device-limit')).toContainText('5000 × 5000');
    expect(errors).toEqual([]);
  });
});

/* ---------- 版面 ---------- */

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await apply(page, { seed: 'baseline' });
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('geo-bloom-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await apply(page, { seed: 'baseline' });
    await noHorizontalScroll(page);
    await apply(page, { width: 8000, height: 3000, maxShapes: 200, maxLines: 400 });
    await noHorizontalScroll(page);
    await apply(page, { width: 1600, height: 1600, maxShapes: 60, maxLines: 120 });
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('geo-bloom-390.png', { fullPage: true, mask: masks(page) });
    expect(errors).toEqual([]);
  });
});
