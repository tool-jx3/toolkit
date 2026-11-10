/**
 * 魔法脈繪製工具（建置產物 next/floria-veins/）的端對端測試：
 * - 開頁沒有錯誤；頁尾只放靈感來源；權利人的註明在頁面裡；
 * - 直線、多角形、塗色（吸附交點）、傷害格（點與拖曳）、顏色；刪除（標出會刪的）；右鍵退一點、復原／重做；
 *   移動、反轉、旋轉；換畫法時草稿丟掉、復原時回來；
 * - 畫布：新增隨從、改名、全員一覽、點一張打開；
 * - 匯出 PNG（這張、全部排成一張、全部各一張的 ZIP）；
 * - 自動儲存、專案檔（存、全部重來、開）、讀入原作的資料；
 * - 觸控（一指按著移到想要的點再放開、拖曳標傷害格）；390／360／320 寬沒有橫向捲動；1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';
import type { Doc } from '../../src/tools/floria-veins/model/types';
import type { Prefs } from '../../src/tools/floria-veins/store';
import { waitForFileChooser } from '../helpers/fileChooser';
import { parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('floria-veins') ?? { id: 'floria-veins', status: 'next' })}/`;
const U = 1200;
const KEY = 'trpg-toolkit:floria-veins';

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
  await expect(
    page.getByRole('heading', { level: 1, name: '魔法脈繪製工具（翠緑のフローリア）' }),
  ).toBeVisible();
  await expect(page.getByTestId('pan-zoom-viewport')).toBeVisible();
  return errors;
}

type Floria = {
  useDoc: { getState: () => { data: Doc } };
  usePrefs: { getState: () => { data: Prefs } };
  gridToClient: (x: number, y: number) => { x: number; y: number } | null;
};

const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __floria: Floria }).__floria.useDoc.getState().data);
const prefs = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __floria: Floria }).__floria.usePrefs.getState().data,
  );
async function active(page: Page) {
  const [d, p] = await Promise.all([doc(page), prefs(page)]);
  return d.canvases.find((c) => c.id === p.active) ?? d.canvases[0];
}

async function at(page: Page, x: number, y: number) {
  await expect
    .poll(() =>
      page.evaluate(
        ([gx, gy]) =>
          (window as unknown as { __floria?: Floria }).__floria?.gridToClient?.(gx, gy) ?? null,
        [x, y],
      ),
    )
    .not.toBeNull();
  return (await page.evaluate(
    ([gx, gy]) => (window as unknown as { __floria: Floria }).__floria.gridToClient(gx, gy),
    [x, y],
  )) as { x: number; y: number };
}

/** 在格子座標 (x, y)（格）上點一下 */
async function tapGrid(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const p = await at(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button });
  await page.mouse.up({ button });
}

const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出 PNG' });
const commit = (page: Page) => btn(page, '決定').click();

/** 關掉所有的通知（視覺基準不要有會自己消失的東西） */
async function closeToasts(page: Page) {
  for (const b of await page.getByRole('button', { name: '關閉通知' }).all()) await b.click();
  await expect(page.getByRole('button', { name: '關閉通知' })).toHaveCount(0);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 畫面上 (x, y)（格）的顏色 */
async function pixelAt(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  return page.evaluate(
    ([cx, cy]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="pan-zoom-viewport"] canvas',
      );
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      const k = canvas.width / r.width;
      const ctx = canvas.getContext('2d');
      const d = ctx?.getImageData(
        Math.round((cx - r.left) * k),
        Math.round((cy - r.top) * k),
        1,
        1,
      );
      return d ? Array.from(d.data) : null;
    },
    [p.x, p.y],
  );
}

function pngSize(bytes: Uint8Array) {
  const { width, height } = readIhdr(parseChunks(bytes));
  return [width, height];
}

async function exportNow(page: Page) {
  await exportPanel(page).getByRole('button', { name: /^匯出/ }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：一張 PC、頁尾只放靈感來源、權利人的註明在頁面裡', async ({ page }) => {
    const errors = await open(page);
    const d = await doc(page);
    expect(d.canvases.map((c) => [c.name, c.size])).toEqual([['PC', 11]]);
    await expect(radio(page, '直線')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, '畫')).toHaveAttribute('aria-checked', 'true');
    const footer = page.locator('footer');
    await expect(footer).toContainText('靈感來源');
    await expect(footer.getByRole('link')).toHaveCount(1);
    await expect(footer.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/Nuts-ABCd/floria_canvas',
    );
    const note = page.getByTestId('rights-note');
    await expect(note).toContainText('猫憑／六畳間幻想空間');
    await expect(note).toContainText('非官方');
    await expect(footer).not.toContainText('猫憑');
    /* 不放原作者的 X 帳號 */
    await expect(page.locator('a[href*="x.com"], a[href*="twitter"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('直線：點兩點、決定；右鍵退一點；復原一步一步退回草稿（F30、F35、F36、F05）', async ({
    page,
  }) => {
    const errors = await open(page);
    await tapGrid(page, 1, 1);
    await tapGrid(page, 4.2, 1.9);
    await expect(page.getByTestId('draft-status')).toHaveAttribute('data-ready', 'true');
    /* 右鍵：打開上一條（少最後一點） */
    await tapGrid(page, 6, 6, 'right');
    expect((await doc(page)).draft?.current).toEqual([[U, U]]);
    await tapGrid(page, 4, 2);
    await tapGrid(page, 2, 2);
    await tapGrid(page, 2, 5);
    await commit(page);
    expect((await active(page)).lines).toEqual([
      { a: [U, U], b: [4 * U, 2 * U], color: '#0000ff' },
      { a: [2 * U, 2 * U], b: [2 * U, 5 * U], color: '#0000ff' },
    ]);
    /* 畫上去的線（藍）在畫面上 */
    const px = (await pixelAt(page, 2, 3.5)) ?? [0, 0, 0];
    expect(px[2] - Math.max(px[0], px[1]), `藍色的線：${px}`).toBeGreaterThan(60);
    await page.keyboard.press('Control+z');
    expect((await active(page)).lines).toEqual([]);
    expect((await doc(page)).draft?.figures).toHaveLength(2);
    await page.keyboard.press('Control+z');
    expect((await doc(page)).draft?.current).toEqual([[2 * U, 2 * U]]);
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.press('Enter');
    expect((await active(page)).lines).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test('多角形、塗色（吸附交點、顏色）、傷害格（點與拖曳）（F31～F33、F41）', async ({ page }) => {
    const errors = await open(page);
    await radio(page, '多角形').click();
    for (const [x, y] of [
      [1, 1],
      [5, 1],
      [3, 4],
      [1, 1],
    ])
      await tapGrid(page, x, y);
    await commit(page);
    expect((await active(page)).lines).toHaveLength(3);
    /* 塗色：點在交點附近就吸附上去（3,4 附近的 3.2,3.8 → 3,4） */
    await radio(page, '塗色').click();
    await radio(page, '綠').click();
    for (const [x, y] of [
      [1.2, 0.8],
      [4.8, 1.3],
      [3.2, 3.8],
      [1, 1],
    ])
      await tapGrid(page, x, y);
    await expect(page.getByTestId('draft-status')).toHaveAttribute('data-ready', 'true');
    await page.keyboard.press('Enter');
    expect((await active(page)).fills).toEqual([
      {
        pts: [
          [U, U],
          [5 * U, U],
          [3 * U, 4 * U],
        ],
        color: '#00a000',
      },
    ]);
    /* 傷害格：點一格、拖過兩格 */
    await radio(page, '傷害格').click();
    await tapGrid(page, 7.5, 7.5);
    const a = await at(page, 8.5, 8.5);
    const b = await at(page, 9.5, 8.5);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    expect((await doc(page)).draft?.cells).toEqual([
      [7, 7],
      [8, 8],
      [9, 8],
    ]);
    /* 一次拖曳是一步復原 */
    await btn(page, /^復原/).click();
    expect((await doc(page)).draft?.cells).toEqual([[7, 7]]);
    await btn(page, /^重做/).click();
    await commit(page);
    expect((await active(page)).damage).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  test('刪除：直線、塗色、傷害格；會刪掉的先標出來（F42～F46）', async ({ page }) => {
    const errors = await open(page);
    await radio(page, '多角形').click();
    for (const [x, y] of [
      [1, 1],
      [5, 1],
      [3, 4],
      [1, 1],
    ])
      await tapGrid(page, x, y);
    await commit(page);
    await radio(page, '塗色').click();
    for (const [x, y] of [
      [1, 1],
      [5, 1],
      [3, 4],
      [1, 1],
    ])
      await tapGrid(page, x, y);
    await commit(page);
    await radio(page, '傷害格').click();
    await tapGrid(page, 8.5, 8.5);
    await commit(page);
    /* 刪除直線 */
    await radio(page, '刪除').click();
    await radio(page, '直線').click();
    await tapGrid(page, 5, 1);
    await tapGrid(page, 1, 1);
    await expect(page.getByTestId('mode-hint')).toContainText('標紅');
    await commit(page);
    expect((await active(page)).lines).toHaveLength(2);
    /* 刪除塗色：(5,1) 已經不是交點了，現有塗色的頂點照樣吸附得到 */
    await radio(page, '塗色').click();
    for (const [x, y] of [
      [1, 1],
      [5, 1],
      [3, 4],
      [1, 1],
    ])
      await tapGrid(page, x, y);
    await commit(page);
    expect((await active(page)).fills).toEqual([]);
    /* 刪除傷害格；沒有符合的時候通知 */
    await radio(page, '傷害格').click();
    await tapGrid(page, 2.5, 2.5);
    await commit(page);
    await expect(toast(page, '沒有符合的東西，什麼都沒刪')).toBeVisible();
    await tapGrid(page, 8.5, 8.5);
    await commit(page);
    expect((await active(page)).damage).toEqual([]);
    await expect(page.getByTestId('mode-hint')).toHaveText('這張畫布沒有傷害格。');
    expect(errors).toEqual([]);
  });

  test('移動、反轉、旋轉；換畫法時草稿丟掉、復原時回來（F37～F40）', async ({ page }) => {
    const errors = await open(page);
    await tapGrid(page, 1, 1);
    await tapGrid(page, 4, 1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    expect((await doc(page)).draft?.figures[0].pts).toEqual([
      [2 * U, 2 * U],
      [5 * U, 2 * U],
    ]);
    await btn(page, /^旋轉 90°/).click();
    expect((await doc(page)).draft?.figures[0].pts).toEqual([
      [4 * U, U],
      [4 * U, 4 * U],
    ]);
    await btn(page, '往上移一格').click();
    await btn(page, '往上移一格').click();
    await expect(toast(page, '已經到畫布的邊緣，不能再移')).toBeVisible();
    await radio(page, '多角形').click();
    expect((await doc(page)).draft).toBeNull();
    await page.keyboard.press('Control+z');
    await expect(radio(page, '直線')).toHaveAttribute('aria-checked', 'true');
    expect((await doc(page)).draft?.figures).toHaveLength(1);
    await btn(page, '取消').click();
    expect((await doc(page)).draft).toBeNull();
    expect(errors).toEqual([]);
  });

  test('畫布：新增隨從（6×6）、改名、全員一覽、點一張打開（F10～F15）', async ({ page }) => {
    const errors = await open(page);
    await btn(page, '新增畫布').click();
    await page.getByRole('menuitem', { name: /隨從（6×6）/ }).click();
    let c = await active(page);
    expect([c.name, c.size]).toEqual(['隨從1', 6]);
    await page.getByTestId('canvas-name').fill('狼');
    await page.getByTestId('canvas-name').blur();
    await tapGrid(page, 0, 3);
    await tapGrid(page, 6, 3);
    await commit(page);
    c = await active(page);
    expect(c.name).toBe('狼');
    expect(c.lines).toEqual([{ a: [0, 3 * U], b: [6 * U, 3 * U], color: '#0000ff' }]);
    await btn(page, '全員').click();
    await expect(page.getByTestId('overview')).toBeVisible();
    await page.getByRole('button', { name: '打開「PC」' }).click();
    await expect(page.getByTestId('board')).toBeVisible();
    expect((await active(page)).name).toBe('PC');
    expect(errors).toEqual([]);
  });

  test('匯出 PNG：這張（1 倍 757×779、2 倍）、全部排成一張、全部各一張的 ZIP（F50～F51）', async ({
    page,
  }) => {
    const errors = await open(page);
    let out = await exportNow(page);
    expect(out.name).toBe('魔法脈_PC.png');
    expect(pngSize(out.bytes)).toEqual([757, 779]);
    await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^200%/ }).click();
    out = await exportNow(page);
    expect(pngSize(out.bytes)).toEqual([1513, 1557]);
    await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^100%/ }).click();
    await btn(page, '新增畫布').click();
    await page.getByRole('menuitem', { name: /隨從（6×6）/ }).click();
    await radio(page, '所有的畫布排成一張圖').click();
    out = await exportNow(page);
    expect(out.name).toBe('魔法脈_全部.png');
    const [w, h] = pngSize(out.bytes);
    expect(w).toBeGreaterThan(757 + 400);
    expect(h).toBe(779 + 32);
    await radio(page, '每張畫布各一個檔（可以打包成 ZIP）').click();
    await exportPanel(page).getByRole('button', { name: /^匯出/ }).click();
    const batch = page.getByTestId('export-batch');
    await expect(batch).toContainText('共 2 個檔案', { timeout: 60_000 });
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      batch.getByRole('button', { name: '打包成 ZIP' }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe('魔法脈.zip');
    const entries = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
    expect(Object.keys(entries).sort()).toEqual(['01_魔法脈_PC.png', '02_魔法脈_隨從1.png']);
    expect(errors).toEqual([]);
  });

  test('自動儲存、專案檔（存、全部重來、開）、讀入原作的資料（F04、F06、F53）', async ({
    page,
  }) => {
    const errors = await open(page);
    await tapGrid(page, 0, 1);
    await tapGrid(page, 3, 1);
    await commit(page);
    await page.waitForFunction((key) => (localStorage.getItem(key) ?? '').includes('3600'), KEY);
    await page.reload();
    await expect(page.getByTestId('board')).toBeVisible();
    expect((await active(page)).lines).toHaveLength(1);
    /* 存成專案檔 */
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^魔法脈_\d{8}\.json$/);
    const path = (await dl.path()) as string;
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'floria-veins',
      version: 1,
      data: { draft: null },
    });
    /* 全部重來 */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    expect((await active(page)).lines).toEqual([]);
    /* 開啟 */
    await btn(page, '專案').click();
    const chooser = await waitForFileChooser(page, () =>
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    );
    await chooser.setFiles(path);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    expect((await active(page)).lines).toHaveLength(1);
    /* 較新版本的工具存的檔：不開、提示（驗證後補） */
    const newer = JSON.parse(readFileSync(path, 'utf8'));
    newer.version = 2;
    await btn(page, '專案').click();
    const chooser2 = await waitForFileChooser(page, () =>
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    );
    await chooser2.setFiles({
      name: 'newer.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(newer)),
    });
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(
      page.getByText('這個專案檔是用較新版本的工具存的，請重新整理頁面後再開啟。'),
    ).toBeVisible();
    expect((await active(page)).lines).toHaveLength(1);
    /* 讀入原作的資料（貼上） */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: '讀入原作的資料…' }).click();
    await page
      .getByTestId('legacy-text')
      .fill(
        'GS:1200|GN:6|NM:Mob%201|CD:|CF:|CL:L:P:0_0-P:7200_7200~L:P:0_3600-P:7200_3600-#C00000',
      );
    await page.getByRole('dialog').getByRole('button', { name: '讀入' }).click();
    await expect(toast(page, '已讀入「Mob 1」')).toBeVisible();
    const c = await active(page);
    expect([c.name, c.size, c.lines]).toEqual([
      'Mob 1',
      6,
      [{ a: [0, 3 * U], b: [6 * U, 3 * U], color: '#c00000' }],
    ]);
    /* 壞掉的資料 */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: '讀入原作的資料…' }).click();
    await page.getByTestId('legacy-text').fill('hello');
    await page.getByRole('dialog').getByRole('button', { name: '讀入' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      '無法讀入：這不是原作（魔法脈描画ツール）的資料。',
    );
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬（範例的 PC3）', async ({ page }) => {
    const errors = await open(page);
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: '載入範例' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '載入' }).click();
    await expect(page.getByTestId('overview')).toBeVisible();
    expect((await doc(page)).canvases).toHaveLength(7);
    await page.getByRole('button', { name: '打開「PC3」' }).click();
    await radio(page, '塗色').click();
    await closeToasts(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('floria-veins-1280.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('窄畫面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test('390／360／320 沒有橫向捲動；全員一覽；390 視覺基準', async ({ page }) => {
    const errors = await open(page);
    await noHorizontalScroll(page);
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: '載入範例' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '載入' }).click();
    await expect(page.getByTestId('overview')).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: '打開「BOSS」' }).click();
    await noHorizontalScroll(page);
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await noHorizontalScroll(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    /* 從一覽打開的畫布捲到畫面裡 */
    await expect(page.getByTestId('board')).toBeInViewport();
    await closeToasts(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('floria-veins-390.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});

test('觸控：一指按著移到想要的點再放開；拖曳標傷害格（F47）', async ({ browser }) => {
  const ctx: BrowserContext = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const errors = await open(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] });
  /* 按在 (1,1)、移到 (3,2) 才放開：點放在 (3,2) */
  const p1 = await at(page, 1, 1);
  const p2 = await at(page, 3, 2);
  await touch('touchStart', p1);
  for (let i = 1; i <= 4; i++)
    await touch('touchMove', {
      x: p1.x + ((p2.x - p1.x) * i) / 4,
      y: p1.y + ((p2.y - p1.y) * i) / 4,
    });
  await touch('touchEnd');
  expect((await doc(page)).draft?.current).toEqual([[3 * U, 2 * U]]);
  const p3 = await at(page, 6, 6);
  await touch('touchStart', p3);
  await touch('touchEnd');
  await page.getByRole('button', { name: '決定' }).tap();
  expect((await active(page)).lines).toEqual([
    { a: [3 * U, 2 * U], b: [6 * U, 6 * U], color: '#0000ff' },
  ]);
  /* 傷害格：一指拖過三格 */
  await page.getByRole('radio', { name: '傷害格' }).tap();
  const c1 = await at(page, 0.5, 9.5);
  const c3 = await at(page, 2.5, 9.5);
  await touch('touchStart', c1);
  for (let i = 1; i <= 6; i++)
    await touch('touchMove', { x: c1.x + ((c3.x - c1.x) * i) / 6, y: c1.y });
  await touch('touchEnd');
  expect((await doc(page)).draft?.cells).toEqual([
    [0, 9],
    [1, 9],
    [2, 9],
  ]);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
  await ctx.close();
});
