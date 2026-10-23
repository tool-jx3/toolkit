/**
 * 調查熱點圖（建置產物 next/clue-map/）的端對端測試（規格 docs/refactor/specs/clue-map.md）：
 * - 開頁沒有錯誤、範例（8 個熱點）、頁尾只有靈感來源；
 * - 場景（標題與導言、內建場景、上傳的圖、網址、拿掉、載入範例、清空熱點）；
 * - 熱點的編輯（新增、畫出、選取、移動、控點、方向鍵、數值、形狀、名稱、刪除、複製、排序、上限）；
 * - 熱點的內容與出現條件（文字、圖片、檢定提示、KP 備註、條件、隱藏、永遠不會出現的警告）；
 * - 遊玩設定與試玩（找到、解鎖、隱藏熱點、顯示所有熱點、重來、進度保留）；
 * - 互動 HTML（下載的檔案離線也能玩、記住進度、沒有 KP 備註、文字跳脫）；
 * - 分享連結（畫面只有遊玩畫面、上傳的圖停用、壞掉的連結）；總覽 PNG（尺寸與像素）；
 * - 專案檔（ZIP、JSON、重設、開啟）、自動儲存與還原、復原／重做、快捷鍵；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('clue-map') ?? { id: 'clue-map', status: 'next' })}/`;
const KEY = 'trpg-toolkit:clue-map';

test.use({ viewport: { width: 1280, height: 900 } });

/** 範例熱點的代號（src/tools/clue-map/sample.ts） */
const ID = {
  desk: 'hdesk01',
  shelf: 'hshelf1',
  fireplace: 'hfire01',
  window: 'hwindow',
  painting: 'hpaint1',
  drawer: 'hdrawer',
  safe: 'hsafe01',
  hatch: 'hhatch1',
} as const;

/* ---------- 共用 ---------- */

async function png(w: number, h: number, fill: (x: number, y: number) => number[]) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(fill(x, y), (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}
const solid = (r: number, g: number, b: number, w = 40, h = 40) => png(w, h, () => [r, g, b, 255]);
const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/** 在瀏覽器裡畫一張大圖（Node 端的 PNG 編碼器畫大圖很慢） */
async function bigPng(page: Page, w: number, h: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#d04040');
      g.addColorStop(1, '#2040d0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    [w, h],
  );
  return Buffer.from(b64, 'base64');
}

async function open(page: Page, path = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.route(/img\.example/, async (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: r.request().url().includes('wide')
        ? await solid(200, 120, 40, 600, 300)
        : await solid(0, 160, 255),
    }),
  );
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: '調查熱點圖' })).toBeVisible();
  return errors;
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const spotRows = (page: Page) => page.locator('[data-spot-row]');
const stageImage = (page: Page) => page.getByTestId('stage-image');

async function stored(page: Page): Promise<Record<string, any>> {
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, KEY);
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.state?.data, KEY);
}

/** 存檔裡的熱點（依順序） */
async function storedSpots(page: Page): Promise<Record<string, any>[]> {
  return (await stored(page)).spots;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 場景在畫面上的範圍；把場景的 % 座標換成畫面座標 */
async function onStage(page: Page, xPct: number, yPct: number) {
  const b = (await stageImage(page).boundingBox())!;
  return { x: b.x + (xPct / 100) * b.width, y: b.y + (yPct / 100) * b.height };
}

/** 在場景上從一個 % 座標拖到另一個 */
async function dragStage(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const a = await onStage(page, ...from);
  const b = await onStage(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

/** 選取熱點（清單） */
async function selectRow(page: Page, index: number) {
  await tab(page, '熱點').click();
  await spotRows(page).nth(index).click();
}

const field = (page: Page, testId: string) => page.getByTestId(testId);

async function openProjectItem(page: Page, name: string) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function saveProject(page: Page): Promise<{ name: string; bytes: Buffer }> {
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
}

async function openProjectFile(page: Page, name: string, bytes: Buffer, mimeType: string) {
  await openProjectItem(page, '開啟專案檔…');
  await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file(name, bytes, mimeType));
}

/** 遊玩畫面（試玩）的元素 */
const play = (page: Page) => page.getByTestId('play-host');
const spot = (root: Locator | Page, id: string) => root.locator(`[data-spot="${id}"]`);

async function goPlay(page: Page) {
  await page.getByRole('radio', { name: '試玩', exact: true }).click();
  await expect(play(page).locator('.cm-main')).toBeVisible();
}
async function goEdit(page: Page) {
  await page.getByRole('radio', { name: '編輯', exact: true }).click();
  await expect(stageImage(page)).toBeVisible();
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、範例（8 個熱點）、舞台上有輪廓與編號、頁尾只有靈感來源（F07、F22、F24）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  await tab(page, '熱點').click();
  await expect(page.getByText('熱點清單（8／40）')).toBeVisible();
  await expect(spotRows(page)).toHaveCount(8);
  await expect(spotRows(page).nth(0)).toContainText('書桌');
  await expect(spotRows(page).nth(5)).toContainText('書桌抽屜');
  await expect(spotRows(page).nth(5)).toContainText('需要解鎖');
  await expect(spotRows(page).nth(7)).toContainText('隱藏');
  /* 隱藏的用虛線、需要解鎖的編號是深色底 */
  await expect(
    page.locator(`[data-shape-id="${ID.hatch}"]`).locator('ellipse').last(),
  ).toHaveAttribute('stroke-dasharray', /.+/);
  await expect(
    page.locator(`[data-shape-id="${ID.desk}"]`).locator('rect').last(),
  ).not.toHaveAttribute('stroke-dasharray', /.+/);
  await expect(
    page.locator(`[data-shape-id="${ID.drawer}"] circle`),
  ).toHaveAttribute('fill', '#1f2328');
  await expect(
    page.locator(`[data-shape-id="${ID.desk}"] circle`),
  ).toHaveAttribute('fill', '#f5b83d');
  /* 頁尾只有靈感來源 */
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('靈感來源：momo102938/MUNgs_click（콕콕）');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://momo102938.github.io/MUNgs_click/',
  );
  expect(errors).toEqual([]);
});

test('版面：390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('stage-shapes')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('clue-map-1280.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('stage-shapes')).toBeVisible();
  await noHorizontalScroll(page);
  await expect(page).toHaveScreenshot('clue-map-390.png');
  for (const name of ['熱點', '遊玩設定', '場景']) {
    await tab(page, name).click();
    await noHorizontalScroll(page);
  }
  await goPlay(page);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

/* ---------- 場景 ---------- */

test('標題與導言：遊玩畫面顯示；空白時不顯示；網頁標題與檔名用標題（F01、F02）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByTestId('title-input').fill('地下室的調查');
  await page.getByTestId('intro-input').fill('第一行\n第二行');
  await goPlay(page);
  await expect(play(page).locator('.cm-title')).toHaveText('地下室的調查');
  await expect(play(page).locator('.cm-intro')).toHaveText('第一行\n第二行');
  await expect(play(page).locator('.cm-intro')).toHaveCSS('white-space', 'pre-line');
  await goEdit(page);
  await page.getByTestId('title-input').fill('');
  await page.getByTestId('intro-input').fill('');
  await goPlay(page);
  await expect(play(page).locator('.cm-title')).toHaveCount(0);
  await expect(play(page).locator('.cm-intro')).toHaveCount(0);
  /* 上限 */
  await goEdit(page);
  await page.getByTestId('title-input').fill('字'.repeat(80));
  await expect(page.getByTestId('title-input')).toHaveValue('字'.repeat(60));
  await page.getByTestId('intro-input').fill('字'.repeat(600));
  await expect(page.getByTestId('intro-input')).toHaveValue('字'.repeat(500));
  expect(errors).toEqual([]);
});

test('內建場景：三種（書房 1200 × 800、舊紙 1200 × 900、調查板 1200 × 800），畫出來不是單色（F05、F06）', async ({
  page,
}) => {
  const errors = await open(page);
  const size = () =>
    stageImage(page).evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      const seen = new Set<string>();
      for (let i = 0; i < d.length; i += 4)
        seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      return { w: img.naturalWidth, h: img.naturalHeight, colors: seen.size };
    });
  const pick = async (name: string) => {
    await page.getByRole('radio', { name, exact: false }).filter({ hasText: name }).click();
  };
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  expect(await size()).toMatchObject({ w: 1200, h: 800 });
  await pick('舊紙');
  await expect(page.getByTestId('scene-name')).toHaveText('舊紙');
  await expect.poll(async () => (await size()).h).toBe(900);
  expect((await size()).colors).toBeGreaterThan(8);
  await pick('調查板');
  await expect(page.getByTestId('scene-name')).toHaveText('調查板');
  await expect.poll(async () => (await size()).h).toBe(800);
  expect((await size()).colors).toBeGreaterThan(8);
  /* 舞台的比例跟著場景 */
  const b = (await stageImage(page).boundingBox())!;
  expect(b.width / b.height).toBeCloseTo(1.5, 1);
  await pick('舊紙');
  await expect
    .poll(async () => {
      const r = (await stageImage(page).boundingBox())!;
      return Math.round((r.width / r.height) * 100) / 100;
    })
    .toBeCloseTo(1.33, 1);
  /* 熱點留在原來的百分比位置 */
  expect((await storedSpots(page))[0]).toMatchObject({ id: ID.desk });
  expect(errors).toEqual([]);
});

test('場景圖：選檔放進來（縮到長邊 1600）、熱點位置不變、拿掉改回舊紙、通知（F03、F06、E01、E02）', async ({
  page,
}) => {
  const errors = await open(page);
  const input = page.getByRole('group', { name: '場景圖' }).locator('input[type=file]');
  await input.setInputFiles(file('房間.png', await bigPng(page, 2000, 1000)));
  await expect(page.getByTestId('scene-name')).toHaveText('房間.png');
  await expect(page.getByTestId('scene-info')).toContainText('1600 × 800');
  await expect(toast(page, '已換成新的場景圖')).toBeVisible();
  await expect
    .poll(async () => {
      const r = (await stageImage(page).boundingBox())!;
      return Math.round((r.width / r.height) * 10) / 10;
    })
    .toBe(2);
  const s = await storedSpots(page);
  expect(s).toHaveLength(8);
  expect(s[0]).toMatchObject({ id: ID.desk, shape: 'rect', x: 8.33, y: 60, w: 36.67 });
  const scene = (await stored(page)).scene;
  expect(scene).toMatchObject({ kind: 'asset', name: '房間.png', width: 1600, height: 800 });
  /* 拿掉 */
  await page.getByRole('button', { name: '拿掉場景圖（改回舊紙）' }).click();
  await expect(page.getByTestId('scene-name')).toHaveText('舊紙');
  /* 不是圖片、讀不了 */
  await input.setInputFiles(file('筆記.txt', Buffer.from('hello'), 'text/plain'));
  await expect(toast(page, /「筆記.txt」不是圖片/)).toBeVisible();
  await expect(page.getByTestId('scene-name')).toHaveText('舊紙');
  await input.setInputFiles(file('壞.png', Buffer.from('not really a png'), 'image/png'));
  await expect(toast(page, /讀不了圖片「壞.png」/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('場景圖：網址（只收 http／https）、讀進來後舞台依實際比例、載入失敗的說明（F04、E04、E05）', async ({
  page,
}) => {
  const errors = await open(page);
  const url = page.getByTestId('scene-url');
  await url.fill('javascript:alert(1)');
  await url.press('Enter');
  await expect(page.getByText('請貼 http:// 或 https:// 開頭的圖片網址')).toBeVisible();
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  await url.fill('https://img.example/wide.png');
  await page.getByRole('button', { name: '用網址', exact: true }).first().click();
  await expect(page.getByTestId('scene-name')).toHaveText('wide.png');
  await expect(page.getByTestId('scene-info')).toContainText('網址');
  await expect
    .poll(async () => {
      const r = (await stageImage(page).boundingBox())!;
      return Math.round((r.width / r.height) * 10) / 10;
    })
    .toBe(2);
  expect((await stored(page)).scene).toEqual({
    kind: 'url',
    url: 'https://img.example/wide.png',
    name: 'wide.png',
  });
  await expect(page.getByTestId('scene-load-failed')).toHaveCount(0);
  /* 載入失敗 */
  await page.route(/img\.example\/gone/, (r) => r.abort());
  await url.fill('https://img.example/gone.png');
  await url.press('Enter');
  await expect(page.getByTestId('scene-load-failed')).toContainText('圖片讀不到');
  expect(errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e))).toEqual([]);
});

test('載入範例與清空熱點：先確認、可以復原（F07、F08）', async ({ page }) => {
  const errors = await open(page);
  await expect(btn(page, '清空熱點')).toBeEnabled();
  await btn(page, '清空熱點').click();
  await expect(page.getByRole('alertdialog')).toContainText('清空所有熱點？');
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  await btn(page, '清空熱點').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(0);
  await expect(btn(page, '清空熱點')).toBeDisabled();
  /* 場景與標題不變 */
  await expect(page.getByTestId('title-input')).toHaveValue('舊書房的調查');
  await expect(page.getByTestId('scene-name')).toHaveText('書房');
  /* 復原 */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '復原' }).first().click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '重做' }).first().click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(0);
  /* 載入範例（沒有熱點時不必確認） */
  await btn(page, '載入範例').click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(8);
  /* 有熱點時要確認 */
  await btn(page, '載入範例').click();
  await expect(page.getByRole('alertdialog')).toContainText('載入範例？');
  await page.getByRole('alertdialog').getByRole('button', { name: '載入' }).click();
  await expect(toast(page, '已載入範例').last()).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 熱點的編輯 ---------- */

/** 清空熱點（從空白開始） */
async function clearAll(page: Page) {
  await tab(page, '場景').click();
  await btn(page, '清空熱點').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(0);
}

const num = (page: Page, label: string) =>
  page.getByRole('spinbutton', { name: label, exact: true });
const tool = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const rowItem = (page: Page, index: number) => spotRows(page).nth(index).locator('..');

test('新增熱點（按鈕）：矩形與橢圓的預設位置、名稱欄取得焦點、編號與名稱；到 40 個停用（F10、F22、F23）', async ({
  page,
}) => {
  const errors = await open(page);
  await clearAll(page);
  await tab(page, '熱點').click();
  await expect(page.getByText('熱點清單（0／40）')).toBeVisible();
  await expect(page.getByText('還沒有熱點')).toBeVisible();
  await btn(page, '新增矩形').click();
  await expect(spotRows(page)).toHaveCount(1);
  await expect(spotRows(page).first()).toContainText('熱點 1');
  await expect(rowItem(page, 0)).toHaveAttribute('aria-current', 'true');
  await expect(field(page, 'spot-name')).toBeFocused();
  await expect(field(page, 'spot-name')).toHaveAttribute('placeholder', '熱點 1');
  await expect(num(page, '寬')).toHaveValue('22');
  await expect(num(page, '高')).toHaveValue('16');
  await btn(page, '新增橢圓').click();
  await expect(spotRows(page)).toHaveCount(2);
  const s = await storedSpots(page);
  expect(s[0]).toMatchObject({ shape: 'rect', name: '', x: 29, y: 32, w: 22, h: 16 });
  /* 橢圓是正圓：場景 3:2（書房），高 20%、寬 20 ÷ 1.5 ＝ 13.33%；比上一個往右下錯開 4% */
  expect(s[1]).toMatchObject({ shape: 'ellipse', h: 20, w: 13.33, x: 37.33, y: 34 });
  await expect(
    page.getByTestId('stage-shapes').locator('[data-shape-id] ellipse').first(),
  ).toBeVisible();
  /* 到 40 個 */
  for (let i = 2; i < 40; i++) await btn(page, '新增矩形').click();
  await expect(page.getByText('熱點清單（40／40）')).toBeVisible();
  await expect(btn(page, '新增矩形')).toBeDisabled();
  await expect(btn(page, '新增橢圓')).toBeDisabled();
  await expect(btn(page, '複製熱點')).toBeDisabled();
  await expect(page.getByTestId('spots-full')).toHaveText('熱點最多 40 個。');
  expect((await storedSpots(page)).length).toBe(40);
  await tool(page, '畫矩形').click();
  await dragStage(page, [10, 10], [30, 30]);
  expect((await storedSpots(page)).length).toBe(40);
  expect(errors).toEqual([]);
});

test('在場景上畫出熱點：拖曳、只點一下、Esc 取消、V／R／E 切換工具（F11、F96）', async ({
  page,
}) => {
  const errors = await open(page);
  await clearAll(page);
  await tool(page, '畫矩形').click();
  await expect(page.getByTestId('draw-layer')).toHaveAttribute('data-tool', 'rect');
  await expect(page.getByTestId('stage-hint')).toContainText('按住拖曳畫出熱點');
  /* 拖曳中有虛線框 */
  const a = await onStage(page, 20, 20);
  const b = await onStage(page, 40, 35);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(page.getByTestId('draw-draft')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('draw-draft')).toHaveCount(0);
  await expect(spotRows(page)).toHaveCount(1);
  const s = await storedSpots(page);
  expect(s[0].shape).toBe('rect');
  expect(s[0].x).toBeCloseTo(20, 0);
  expect(s[0].y).toBeCloseTo(20, 0);
  expect(s[0].w).toBeCloseTo(20, 0);
  expect(s[0].h).toBeCloseTo(15, 0);
  /* 工具回到選取、新熱點被選取、名稱欄取得焦點 */
  await expect(tool(page, '選取')).toBeChecked();
  await expect(field(page, 'spot-name')).toBeFocused();
  /* 反方向拖也可以；橢圓 */
  await tool(page, '畫橢圓').click();
  await dragStage(page, [90, 80], [60, 50]);
  const t = await storedSpots(page);
  expect(t[1].shape).toBe('ellipse');
  expect(t[1].x).toBeCloseTo(60, 0);
  expect(t[1].w).toBeCloseTo(30, 0);
  /* 只點一下：以點為中心放預設大小 */
  await tool(page, '畫矩形').click();
  const c = await onStage(page, 50, 70);
  await page.mouse.click(c.x, c.y);
  const u = await storedSpots(page);
  expect(u).toHaveLength(3);
  expect(u[2]).toMatchObject({ x: 39, y: 62, w: 22, h: 16 });
  /* 快捷鍵與 Esc */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('r');
  await expect(tool(page, '畫矩形')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(tool(page, '選取')).toBeChecked();
  await page.keyboard.press('e');
  await expect(tool(page, '畫橢圓')).toBeChecked();
  await page.keyboard.press('v');
  await expect(tool(page, '選取')).toBeChecked();
  expect(errors).toEqual([]);
});

test('選取、移動、控點調整大小、夾在場景內、方向鍵、數值欄、Esc、Delete（F12～F16、F19、F26）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 窗戶：x 6.67、y 10、w 21.67、h 36.25 */
  const target = page.locator(`[data-layout-item="${ID.window}"]`);
  const c = await onStage(page, 15, 25);
  await page.mouse.click(c.x, c.y);
  await expect(target).toHaveAttribute('data-selected', 'true');
  await expect(tab(page, '熱點')).toHaveAttribute('data-state', 'active');
  await expect(rowItem(page, 3)).toHaveAttribute('aria-current', 'true');
  await expect(num(page, 'X')).toHaveValue('6.7');
  /* 移動 */
  await dragStage(page, [15, 25], [25, 35]);
  let w = (await storedSpots(page))[3];
  expect(w.x).toBeCloseTo(16.67, 0);
  expect(w.y).toBeCloseTo(20, 0);
  /* 拖到場景外：夾在場景內 */
  await dragStage(page, [25, 35], [-30, -30], 12);
  w = (await storedSpots(page))[3];
  expect(w).toMatchObject({ x: 0, y: 0 });
  /* 控點：右下角往右下拉 10%，對角（左上）不動 */
  const se = page.locator('[data-layout-handle="se"]');
  const hb = (await se.boundingBox())!;
  const stage = (await stageImage(page).boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    hb.x + hb.width / 2 + stage.width * 0.1,
    hb.y + hb.height / 2 + stage.height * 0.1,
    { steps: 6 },
  );
  await page.mouse.up();
  w = (await storedSpots(page))[3];
  expect(w.x).toBe(0);
  expect(w.y).toBe(0);
  expect(w.w).toBeCloseTo(31.67, 0);
  expect(w.h).toBeCloseTo(46.25, 0);
  /* 八個控點 */
  await expect(page.locator('[data-layout-handle]')).toHaveCount(8);
  /* 左邊的控點不能拉出場景 */
  const wb = (await page.locator('[data-layout-handle="w"]').boundingBox())!;
  await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await page.mouse.down();
  await page.mouse.move(wb.x - 80, wb.y + wb.height / 2, { steps: 4 });
  await page.mouse.up();
  w = (await storedSpots(page))[3];
  expect(w.x).toBe(0);
  expect(w.w).toBeCloseTo(31.67, 0);
  /* 方向鍵：0.5%、Shift 5% */
  await page.waitForTimeout(450);
  await target.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  w = (await storedSpots(page))[3];
  expect(w.x).toBeCloseTo(0.5, 5);
  expect(w.y).toBeCloseTo(5, 5);
  /* 數值欄：夾在場景內（X ＋ 寬 ≤ 100）、寬高至少 1.5 */
  await num(page, 'X').fill('90');
  await num(page, 'X').press('Enter');
  w = (await storedSpots(page))[3];
  expect(w.x).toBeCloseTo(68.33, 1);
  await num(page, '寬').fill('0.5');
  await num(page, '寬').press('Enter');
  w = (await storedSpots(page))[3];
  expect(w.w).toBe(1.5);
  /* Esc 取消選取 */
  await target.focus();
  await page.keyboard.press('Escape');
  await expect(target).not.toHaveAttribute('data-selected', 'true');
  /* Delete 刪除選取的熱點（點清單選取之後焦點回到頁面） */
  const shelf = await onStage(page, 100 - 10, 30);
  await page.mouse.click(shelf.x, shelf.y);
  await expect(page.locator(`[data-layout-item="${ID.shelf}"]`)).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('stage-shapes').locator('[data-shape-id]')).toHaveCount(7);
  expect((await storedSpots(page)).map((x) => x.id)).not.toContain(ID.shelf);
  expect(errors).toEqual([]);
});

test('形狀、名稱、複製、刪除（連帶清出現條件）、排序（按鈕、鍵盤、拖曳）、復原（F17～F21、F44）', async ({
  page,
}) => {
  const errors = await open(page);
  await selectRow(page, 2);
  /* 形狀 */
  await page.getByRole('radio', { name: '橢圓', exact: true }).click();
  expect((await storedSpots(page))[2].shape).toBe('ellipse');
  await expect(page.locator(`[data-shape-id="${ID.fireplace}"] ellipse`).first()).toBeVisible();
  await page.getByRole('radio', { name: '矩形', exact: true }).click();
  expect((await storedSpots(page))[2].shape).toBe('rect');
  /* 名稱：空白時用「熱點 N」代替顯示；上限 30 字 */
  await field(page, 'spot-name').fill('爐火');
  await expect(spotRows(page).nth(2)).toContainText('爐火');
  await field(page, 'spot-name').fill('');
  await expect(spotRows(page).nth(2)).toContainText('熱點 3');
  await field(page, 'spot-name').fill('字'.repeat(40));
  await expect(field(page, 'spot-name')).toHaveValue('字'.repeat(30));
  await field(page, 'spot-name').fill('壁爐');
  await field(page, 'spot-name').press('Enter');
  /* 複製：名稱加（複製）、往右下 3%、放在原本那個的上面一層並選取、內容照抄 */
  await btn(page, '複製熱點').click();
  await expect(spotRows(page)).toHaveCount(9);
  await expect(spotRows(page).nth(3)).toContainText('壁爐（複製）');
  const s = await storedSpots(page);
  expect(s[3]).toMatchObject({
    name: '壁爐（複製）',
    text: s[2].text,
    check: s[2].check,
    memo: s[2].memo,
  });
  expect(s[3].id).not.toBe(s[2].id);
  expect(s[3].x).toBeCloseTo(s[2].x + 3, 1);
  expect(s[3].y).toBeCloseTo(s[2].y + 3, 1);
  await expect(rowItem(page, 3)).toHaveAttribute('aria-current', 'true');
  /* 上下順序：按鈕 */
  await page.getByRole('button', { name: '上移「壁爐（複製）」' }).click();
  await expect(spotRows(page).nth(2)).toContainText('壁爐（複製）');
  await expect(spotRows(page).nth(3)).toContainText('壁爐');
  await expect(spotRows(page).nth(0).getByRole('button', { name: /^上移/ })).toBeDisabled();
  await expect(spotRows(page).nth(8).getByRole('button', { name: /^下移/ })).toBeDisabled();
  /* 編號跟著順序（舞台上的編號圓標） */
  await expect(page.locator(`[data-shape-id="${s[3].id}"] text`)).toHaveText('3');
  await page.getByRole('button', { name: '下移「壁爐（複製）」' }).click();
  await expect(page.locator(`[data-shape-id="${s[3].id}"] text`)).toHaveText('4');
  /* 鍵盤：列有焦點時 Alt＋↑ */
  await rowItem(page, 3).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(spotRows(page).nth(2)).toContainText('壁爐（複製）');
  /* 拖曳把手 */
  const handle = spotRows(page).nth(0).locator('[data-drag-handle]');
  const hb = (await handle.boundingBox())!;
  const target = (await spotRows(page).nth(1).boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, target.y + target.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await expect(spotRows(page).nth(0)).toContainText('書架');
  await expect(spotRows(page).nth(1)).toContainText('書桌');
  /* 順序不影響出現條件（記的是代號） */
  const after = await storedSpots(page);
  expect(after.find((x) => x.id === ID.drawer)).toMatchObject({ requires: [ID.shelf] });
  /* 復原（一次拖曳一步） */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '復原' }).first().click();
  await expect(spotRows(page).nth(0)).toContainText('書桌');
  /* 刪除：其他熱點的條件裡的它一併拿掉（條件空了＝一開始就看得到，並提醒） */
  await page.getByRole('button', { name: '刪除「書架」' }).click();
  await expect(spotRows(page)).toHaveCount(8);
  const d = (await storedSpots(page)).find((x) => x.id === ID.drawer)!;
  expect(d.requires).toEqual([]);
  expect(d.locked).toBe(true);
  await spotRows(page).filter({ hasText: '書桌抽屜' }).click();
  await expect(page.getByText('還沒有勾任何熱點：目前等於一開始就看得到。')).toBeVisible();
  expect(errors).toEqual([]);
});
