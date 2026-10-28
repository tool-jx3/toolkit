/**
 * 角色配色條產生器：配色卡（規格 1.2；參考 dearmysn1p3r/Colorpalettecard_Maker 的功能，2026-10）。
 * - 角色（立繪）與照片當來源；k-means 自動取 4～6 色（同一張圖同樣的 N 結果相同）；用角色的顏色；
 * - 點色塊設代表色（角色的代表色一起改）；照片上拖曳、滾輪縮放 → 重新取色；
 * - 匯出 PNG（兩倍）、GIF（無限循環、色票一列一列出現）、複製 HEX（色名與綜合色）；
 * - 配色條的圖片取色多一個「依顏色分群」（k-means）；
 * - 專案檔（含照片）的存讀；390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import type { Bar, Settings } from '../../src/tools/color-palette/logic';
import { parseGif } from '../helpers/gif';
import { parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('color-palette') ?? { id: 'color-palette', status: 'next' })}/`;

type Rgba = [number, number, number, number];
async function pngOf(w: number, h: number, at: (x: number, y: number) => Rgba) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(at(x, y), (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}
/** 150 × 150（取色時不必縮小）：上 50 列紅 #e03030、中 40 列綠 #30c030、下 60 列藍 #3050e0 */
const bands = () =>
  pngOf(150, 150, (_x, y) =>
    y < 50 ? [224, 48, 48, 255] : y < 90 ? [48, 192, 48, 255] : [48, 80, 224, 255],
  );
const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

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
  await expect(page.getByRole('heading', { level: 1, name: '角色配色條產生器' })).toBeVisible();
  return errors;
}

const state = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __colorPalette: { useSettings: { getState: () => { data: Settings } } };
        }
      ).__colorPalette.useSettings.getState().data,
  );
const named = async (page: Page, name: string) =>
  (await state(page)).bars.find((b) => b.name === name) as Bar;
const mode = (page: Page, name: '配色條' | '色票櫃' | '配色卡') =>
  page.getByRole('radio', { name: new RegExp(`^${name}`) }).click();
const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const column = (page: Page, n: number) => page.getByRole('region', { name: `第 ${n} 張` });
const swatches = (page: Page, n: number) =>
  page.getByTestId(`card-swatches-${n - 1}`).locator('button');
const hexes = (page: Page, n: number) =>
  swatches(page, n).evaluateAll((els) => els.map((e) => e.getAttribute('data-hex')));
const toastText = (page: Page, text: string) => page.getByText(text).first();

async function loadSamples(page: Page) {
  await mode(page, '色票櫃');
  await btn(page, '載入範例').click();
  await expect(page.getByTestId('character-count')).toHaveText('7／24');
  await mode(page, '配色卡');
}

async function pickCharacter(page: Page, n: number, name: string) {
  await page.getByRole('combobox', { name: `第 ${n} 張選擇角色` }).click();
  await page.getByRole('option', { name }).click();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test('角色當來源：自動取 4～6 色（同一張圖同樣的 N 結果相同）、用角色的顏色、點色塊設代表色', async ({
  page,
}) => {
  const errors = await open(page);
  await loadSamples(page);
  await expect(page.getByText('選擇角色')).toBeVisible();
  await pickCharacter(page, 1, '林予安');
  await expect(swatches(page, 1)).toHaveCount(5);
  const five = await hexes(page, 1);
  /* 換成 6 色、再換回 5 色：結果和第一次相同 */
  await page.getByRole('radio', { name: '6', exact: true }).click();
  await expect.poll(async () => (await hexes(page, 1)).length).toBe(6);
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await expect.poll(async () => (await hexes(page, 1)).length).toBe(4);
  await page.getByRole('radio', { name: '5', exact: true }).click();
  await expect.poll(() => hexes(page, 1)).toEqual(five);
  /* 重新整理後也一樣 */
  await page.reload();
  await expect.poll(() => hexes(page, 1)).toEqual(five);
  /* 用角色的顏色：部位的顏色（「無」不算、重複的只留一個） */
  await column(page, 1).getByRole('radio', { name: '用角色的顏色' }).click();
  await expect.poll(() => hexes(page, 1)).toEqual(['#2a2a32', '#8a5a3c', '#f2d3bd', '#3f4a5c']);
  /* 點色塊設成代表色：角色的代表色一起改 */
  await swatches(page, 1).nth(2).click();
  expect((await named(page, '林予安')).theme).toBe('#f2d3bd');
  await expect(swatches(page, 1).nth(2)).toHaveAttribute('aria-pressed', 'true');
  await btn(column(page, 1), '自動選代表色').click();
  expect((await named(page, '林予安')).theme).toBeNull();
  expect(errors).toEqual([]);
});

test('照片當來源：取出照片裡的顏色與占比；拖曳、滾輪縮放後重新取色', async ({ page }) => {
  const errors = await open(page);
  await mode(page, '配色卡');
  await column(page, 1).getByRole('radio', { name: '照片' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(column(page, 1), '選擇照片').click(),
  ]);
  await chooser.setFiles([file('三色.png', await bands())]);
  await expect(column(page, 1).getByRole('textbox', { name: '第 1 張名字' })).toHaveValue('三色');
  await expect.poll(() => hexes(page, 1)).toEqual(['#3050e0', '#e03030', '#30c030']);
  const shares = await swatches(page, 1).evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-share')),
  );
  expect(shares).toEqual(['0.400', '0.333', '0.267']);
  /* 滾輪放大照片的下半部：只剩藍色 */
  const area = page.getByRole('application', { name: '第 1 張照片（拖曳移動、滾輪或兩指縮放）' });
  const b = (await area.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.95);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
  await expect(area).not.toHaveAttribute('data-placement', /^1\.000,/);
  await expect.poll(() => hexes(page, 1)).toEqual(['#3050e0']);
  /* 往下拖曳（看到照片的上面）：又看得到紅色 */
  for (let i = 0; i < 7; i++) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * 2.4, { steps: 6 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await hexes(page, 1)).includes('#e03030')).toBe(true);
  /* 照片的代表色：點色塊 */
  await swatches(page, 1).first().click();
  expect((await state(page)).card?.columns[0].key).toBe(
    await swatches(page, 1).first().getAttribute('data-hex'),
  );
  expect(errors).toEqual([]);
});

/** 在頁面上貼上幾張圖片（焦點不在文字欄時，等於拖進視窗） */
async function pasteImages(page: Page, files: { name: string; buffer: Buffer }[]) {
  await page.evaluate(
    (list) => {
      const dt = new DataTransfer();
      for (const f of list) {
        const bin = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bin], f.name, { type: 'image/png' }));
      }
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }),
      );
    },
    files.map((f) => ({ name: f.name, b64: f.buffer.toString('base64') })),
  );
}

/** 觸控的兩指：從中心往外拉開 */
async function pinchOut(area: Locator, from: number, to: number) {
  const b = (await area.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const ev = (id: number, x: number) => ({
    pointerId: id,
    pointerType: 'touch',
    isPrimary: id === 1,
    clientX: x,
    clientY: cy,
    button: 0,
    buttons: 1,
  });
  await area.dispatchEvent('pointerdown', ev(1, cx - from / 2));
  await area.dispatchEvent('pointerdown', ev(2, cx + from / 2));
  for (let k = 1; k <= 5; k++) {
    const half = (from + ((to - from) * k) / 5) / 2;
    await area.dispatchEvent('pointermove', ev(1, cx - half));
    await area.dispatchEvent('pointermove', ev(2, cx + half));
  }
  await area.dispatchEvent('pointerup', { ...ev(2, cx + to / 2), buttons: 0 });
  await area.dispatchEvent('pointerup', { ...ev(1, cx - to / 2), buttons: 0 });
}

test('照片：空的照片框點一下選照片、換照片時名字跟著換（沒改過時）、兩指縮放、放不下的圖片會通知', async ({
  page,
}) => {
  const errors = await open(page);
  await mode(page, '配色卡');
  /* 預覽上空的照片框：點一下選照片（來源換成照片） */
  const [c1] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '第 1 張：選擇照片' }).click(),
  ]);
  await c1.setFiles([file('三色.png', await bands())]);
  await expect(column(page, 1).getByRole('radio', { name: '照片' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const nameBox = column(page, 1).getByRole('textbox', { name: '第 1 張名字' });
  await expect(nameBox).toHaveValue('三色');
  /* 換一張：名字還是上一張的檔名 → 跟著換 */
  const [c2] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(column(page, 1), '選擇照片').click(),
  ]);
  await c2.setFiles([file('第二張.png', await bands())]);
  await expect(nameBox).toHaveValue('第二張');
  /* 自己打的名字：換照片時留著 */
  await nameBox.fill('自己取的');
  await nameBox.blur();
  const [c3] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(column(page, 1), '選擇照片').click(),
  ]);
  await c3.setFiles([file('第三張.png', await bands())]);
  await expect(nameBox).toHaveValue('自己取的');
  /* 兩指縮放（觸控）：放開時才寫進設定、重新取色 */
  const area = page.getByRole('application', { name: '第 1 張照片（拖曳移動、滾輪或兩指縮放）' });
  await expect(area).toHaveAttribute('data-placement', /^1\.000,/);
  await pinchOut(area, 40, 120);
  await expect(area).toHaveAttribute('data-placement', /^3\.000,/);
  /* 拖進或貼上的圖片放進空的照片欄（不夠時加欄，最多 4 張）：放不下的通知 */
  const many = await Promise.all(
    [1, 2, 3, 4, 5].map(async (i) => file(`貼上${i}.png`, await bands())),
  );
  await pasteImages(page, many);
  await expect(page.getByText('有 2 張沒有加入（配色卡最多 4 張）。').first()).toBeVisible();
  await expect(page.getByRole('region', { name: /^第 \d 張$/ })).toHaveCount(4);
  await expect(column(page, 4).getByRole('textbox', { name: '第 4 張名字' })).toHaveValue('貼上3');
  expect(errors).toEqual([]);
});

test('代表色不在取出的顏色裡：設定欄與卡片另外標出代表色', async ({ page }) => {
  const errors = await open(page);
  await loadSamples(page);
  /* 範例「白澄」的代表色 #c43a3a 不是從立繪取出的 5 色之一 */
  await pickCharacter(page, 1, '白澄');
  await expect(swatches(page, 1).first()).toBeVisible();
  const key = page.getByTestId('card-key-0');
  await expect(key).toHaveAttribute('data-key', '#C43A3A');
  await expect(key).toHaveAttribute('data-in-swatches', 'false');
  await expect(key).toContainText('不在取出的顏色裡');
  /* 點色票設成代表色之後就在色票裡 */
  await swatches(page, 1).nth(1).click();
  await expect(key).toHaveAttribute('data-in-swatches', 'true');
  await expect(swatches(page, 1).nth(1)).toHaveAttribute('title', /^.+・#[0-9A-F]{6}・占 \d+%$/);
  expect(errors).toEqual([]);
});

test('匯出 PNG（兩倍）、GIF（無限循環、一列一列出現）、複製 HEX', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await loadSamples(page);
  await pickCharacter(page, 1, '白澄');
  await btn(page, '加一張').click();
  await pickCharacter(page, 2, '沈墨');
  await page.getByRole('textbox', { name: '標題' }).fill('白與墨');
  await expect(swatches(page, 2)).toHaveCount(5);
  const size = (await page.getByTestId('card-size').textContent()) ?? '';
  const [w, h] = size.split(' × ').map((v) => Number.parseInt(v, 10));
  /* PNG */
  const [png] = await Promise.all([page.waitForEvent('download'), btn(page, '存成 PNG').click()]);
  expect(png.suggestedFilename()).toBe('白與墨.png');
  const ihdr = readIhdr(parseChunks(readFileSync((await png.path()) as string)));
  expect([ihdr.width, ihdr.height]).toEqual([w, h]);
  /* GIF：寬不超過 1150（高畫質） */
  const [gif] = await Promise.all([page.waitForEvent('download'), btn(page, '存成 GIF').click()]);
  expect(gif.suggestedFilename()).toBe('白與墨.gif');
  const info = parseGif(new Uint8Array(readFileSync((await gif.path()) as string)));
  expect(info.width).toBeLessThanOrEqual(1150);
  expect(info.loopCount).toBe(0);
  expect(info.frames.length).toBeGreaterThan(5);
  /* 最後一格停留 2 秒 */
  expect(info.frames.at(-1)?.delayCs).toBe(200);
  await expect(page.getByTestId('card-status')).toContainText('白與墨.gif');
  /* 複製 HEX：名字、每色「#HEX 色名」、空一行；最後是綜合色 */
  await btn(page, '複製 HEX').click();
  await expect(toastText(page, '已複製色碼與色名')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const lines = text.split('\n');
  expect(lines[0]).toBe('白澄');
  expect(lines[1]).toMatch(/^#[0-9A-F]{6} \S+$/);
  expect(lines).toContain('沈墨');
  expect(lines.at(-1)).toMatch(/^綜合色 #[0-9A-F]{6} \S+$/);
  /* 同一張卡的色名不重複 */
  const names = lines.filter((l) => l.startsWith('#')).map((l) => l.split(' ')[1]);
  expect(new Set(names).size).toBe(names.length);
  expect(errors).toEqual([]);
});

test('專案檔：配色卡的設定與照片一起存讀', async ({ page }) => {
  const errors = await open(page);
  await mode(page, '配色卡');
  await column(page, 1).getByRole('radio', { name: '照片' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(column(page, 1), '選擇照片').click(),
  ]);
  await chooser.setFiles([file('三色.png', await bands())]);
  await page.getByRole('radio', { name: '4:5' }).click();
  await expect.poll(() => hexes(page, 1)).toEqual(['#3050e0', '#e03030', '#30c030']);
  await page.getByRole('button', { name: /專案/ }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zip = readFileSync((await dl.path()) as string);
  /* 全部重來 → 開啟專案檔 */
  await page.getByRole('button', { name: /專案/ }).click();
  await page.getByRole('menuitem', { name: '全部重來…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(column(page, 1).getByRole('radio', { name: '角色' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: /專案/ }).click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /開啟專案檔/ }).click(),
  ]);
  await chooser2.setFiles([{ name: 'p.zip', mimeType: 'application/zip', buffer: zip }]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect(page.getByRole('radio', { name: '4:5' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => hexes(page, 1)).toEqual(['#3050e0', '#e03030', '#30c030']);
  expect(errors).toEqual([]);
});

test('配色條的圖片取色多一個「依顏色分群」（k-means）：依面積由多到少，比例＝面積', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '第 1 條：從圖片取色' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('tab', { name: '依顏色分群' }).click();
  await d.locator('input[type=file]').setInputFiles([file('三色.png', await bands())]);
  await expect(page.getByTestId('image-sampler').locator('canvas')).toBeVisible();
  /* 分群模式沒有取色點與分割線 */
  await expect(d.locator('[data-split]')).toHaveCount(0);
  const count = d.getByRole('spinbutton', { name: '要分成幾色' });
  await count.fill('3');
  await count.press('Enter');
  await btn(d, '套用').click();
  await expect(d).toHaveCount(0);
  const segs = (await state(page)).bars[0].segments;
  expect(segs.map((s) => [s.color, s.ratio])).toEqual([
    ['#3050e0', 0.4],
    ['#e03030', 0.333],
    ['#30c030', 0.267],
  ]);
  /* 下次打開沿用分群模式 */
  await page.getByRole('button', { name: '第 1 條：從圖片取色' }).click();
  await expect(d.getByRole('tab', { name: '依顏色分群' })).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('取色結果取代有標部位的角色時先確認（列出會清掉的部位）：取消不改、取代才改', async ({
  page,
}) => {
  const errors = await open(page);
  await loadSamples(page);
  await mode(page, '配色條');
  const before = (await state(page)).bars[6];
  await page.getByRole('button', { name: '第 7 條：從圖片取色' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('tab', { name: '依顏色分群' }).click();
  await d.locator('input[type=file]').setInputFiles([file('三色.png', await bands())]);
  await expect(page.getByTestId('image-sampler').locator('canvas')).toBeVisible();
  await btn(d, '套用').click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('髮色');
  await expect(ask).toContainText('瞳色（無）');
  await ask.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog', { name: /從圖片取色/ })).toBeVisible();
  expect((await state(page)).bars[6].segments).toEqual(before.segments);
  await btn(page.getByRole('dialog', { name: /從圖片取色/ }), '套用').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '取代' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = (await state(page)).bars[6].segments;
  expect(after.map((s) => s.color)).toEqual(['#3050e0', '#e03030', '#30c030']);
  expect(after.every((s) => s.role === null)).toBe(true);
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：配色卡 1280 寬', async ({ page }) => {
    const errors = await open(page);
    await loadSamples(page);
    await pickCharacter(page, 1, '夏千晴');
    await btn(page, '加一張').click();
    await pickCharacter(page, 2, '葉棠');
    await page.getByRole('textbox', { name: '標題' }).fill('晴與棠');
    await page.getByRole('textbox', { name: '標題' }).blur();
    await expect(swatches(page, 2)).toHaveCount(5);
    await page.getByRole('button', { name: '關閉通知' }).first().click();
    await expect(toastText(page, '已加入 6 位範例角色。')).toBeHidden();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('color-palette-card-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：配色卡 390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await loadSamples(page);
    await pickCharacter(page, 1, '沈墨');
    await expect(swatches(page, 1)).toHaveCount(5);
    await page.getByRole('button', { name: '關閉通知' }).first().click();
    await expect(toastText(page, '已加入 6 位範例角色。')).toBeHidden();
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('color-palette-card-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
