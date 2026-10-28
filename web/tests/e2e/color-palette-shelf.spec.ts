/**
 * 角色配色條產生器：色票櫃（規格 1.1、1.3；併入 saturn97v/Color-shelf 的功能，2026-10）。
 * - 三種呈現的切換（重新整理後記得）；色票櫃的預設內容；
 * - 新增角色：一次選兩張 → 圈頭像（同上一張的範圍）→ 滴管取髮色、瞳色（自動換到瞳色、「無」、名字）→ 儲存；
 * - 排序（髮色、瞳色、亮度、名字、自己拖曳）與依色系分組、每列幾位、顯示名字／代表色；
 * - 點色塊複製色碼（「無」不複製）；拖曳卡片調整順序（改成自己拖曳，配色條也照這個順序）；
 * - 角色的編輯視窗：名字、髮色多一格（雙色）、滴管、代表色、其他部位、「無」不畫在配色條上、色碼表 PNG、刪除與復原；
 * - 從立繪補取色；整櫃存成 PNG（大小）；全部清除（可以復原）；專案檔（ZIP，含圖片）的存讀；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import type { Bar, Settings } from '../../src/tools/color-palette/logic';
import { planChart, planShelf } from '../../src/tools/color-palette/shelfRender';
import { parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('color-palette') ?? { id: 'color-palette', status: 'next' })}/`;

type Rgba = [number, number, number, number];
async function pngOf(w: number, h: number, at: (x: number, y: number) => Rgba) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(at(x, y), (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}
/** 300 × 400：上半藍 #204080、下半紅 #e03030 */
const blueRed = () =>
  pngOf(300, 400, (_x, y) => (y < 200 ? [32, 64, 128, 255] : [224, 48, 48, 255]));
/** 200 × 200：整張綠 #30c030 */
const green = () => pngOf(200, 200, () => [48, 192, 48, 255]);
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
const bars = async (page: Page) => (await state(page)).bars;
const named = async (page: Page, name: string) =>
  (await bars(page)).find((b) => b.name === name) as Bar;

const mode = (page: Page, name: '配色條' | '色票櫃' | '配色卡') =>
  page.getByRole('radio', { name: new RegExp(`^${name}`) }).click();
const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const shelf = (page: Page) => page.getByRole('region', { name: '色票櫃' });
const cards = (page: Page) => shelf(page).locator('[data-character]');
const cardNamed = (page: Page, name: string) =>
  shelf(page).locator('[data-character]').filter({ hasText: name });
const dialog = (page: Page) => page.getByRole('dialog');
/** 通知（通知區與螢幕閱讀器的朗讀區各有一份文字，取第一個） */
const toastText = (page: Page, text: string) => page.getByText(text).first();
/** 連續的變更 400 ms 內算同一步復原：要分開記的操作之間等一下 */
const nextStep = (page: Page) => page.waitForTimeout(500);

async function loadSamples(page: Page) {
  await btn(page, '載入範例').click();
  await expect(page.getByTestId('character-count')).toHaveText('7／24');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

function pngSize(bytes: Buffer) {
  const { width, height } = readIhdr(parseChunks(bytes));
  return [width, height];
}

/** 在圓形頭像上的相對位置（0～1）點一下 */
async function clickCircle(page: Page, u: number, v: number) {
  const c = page.getByTestId('circle-picker').last();
  const b = (await c.boundingBox())!;
  await page.mouse.click(b.x + b.width * u, b.y + b.height * v);
}

test('三種呈現的切換；色票櫃的預設內容；重新整理後記得目前的呈現', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('radio', { name: /^配色條/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await mode(page, '色票櫃');
  await expect(shelf(page)).toBeVisible();
  await expect(page.getByTestId('character-count')).toHaveText('1／24');
  /* 開頁的那一條沒有髮色：放在「沒有髮色」那一組；頭像是剪影 */
  await expect(cards(page)).toHaveCount(1);
  await expect(shelf(page).locator('[data-group]')).toHaveAttribute('data-group', 'none');
  await expect(cards(page).locator('canvas')).toHaveAttribute('data-avatar', 'silhouette');
  await expect(cards(page).locator('[data-chip="hair"]')).toHaveAttribute('data-empty', 'true');
  await page.reload();
  await expect(page.getByRole('radio', { name: /^色票櫃/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await mode(page, '配色條');
  await expect(page.getByTestId('palette-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('新增角色：一次兩張、圈頭像、滴管取髮色與瞳色（自動換到瞳色）、名字、「無」、同上一張的範圍', async ({
  page,
}) => {
  const errors = await open(page);
  await mode(page, '色票櫃');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '新增角色').click(),
  ]);
  await chooser.setFiles([file('甲.png', await blueRed()), file('乙.png', await green())]);
  /* 第 1 張：圈頭像（第一張沒有「同上一張的範圍」） */
  await expect(
    dialog(page).getByRole('heading', { name: '新增角色（1／2）：圈出頭像' }),
  ).toBeVisible();
  await expect(btn(dialog(page), '同上一張的範圍')).toBeDisabled();
  await dialog(page).getByRole('spinbutton', { name: '縮放' }).fill('150');
  await dialog(page).getByRole('spinbutton', { name: '縮放' }).press('Enter');
  await btn(dialog(page), '套用').click();
  /* 取色：第一格髮色一開始是頭像的主色；點下半（紅）→ 髮色，之後自動換到瞳色；點上半（藍）→ 瞳色 */
  await expect(dialog(page).getByRole('heading', { name: '新增角色（1／2）：取色' })).toBeVisible();
  const hair = page.getByTestId('slots-hair').locator('[data-slot]');
  const eye = page.getByTestId('slots-eye').locator('[data-slot]');
  await expect(hair).toHaveCount(1);
  await expect(eye.first()).toHaveAttribute('aria-label', '瞳色 1：未指定');
  await clickCircle(page, 0.5, 0.8);
  await expect(hair.first()).toHaveAttribute('data-color', '#e03030');
  await expect(eye.first()).toHaveAttribute('aria-pressed', 'true');
  await clickCircle(page, 0.5, 0.2);
  await expect(eye.first()).toHaveAttribute('data-color', '#204080');
  /* 瞳色多一格，標「無」 */
  await page.getByRole('button', { name: '加一個瞳色' }).click();
  await btn(dialog(page), '無').click();
  await expect(eye.nth(1)).toHaveAttribute('data-none', 'true');
  await dialog(page).getByRole('textbox', { name: '名字' }).fill('測試甲');
  await btn(dialog(page), '儲存，下一張').click();
  /* 第 2 張：同上一張的範圍可以用了 */
  await expect(
    dialog(page).getByRole('heading', { name: '新增角色（2／2）：圈出頭像' }),
  ).toBeVisible();
  await btn(dialog(page), '同上一張的範圍').click();
  await expect(page.getByTestId('frame-view')).toHaveAttribute('data-placement', /^1\.500,/);
  await btn(dialog(page), '套用').click();
  await btn(dialog(page), '儲存').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(toastText(page, '已加入 2 位角色。')).toBeVisible();

  const list = await bars(page);
  expect(list).toHaveLength(3);
  const a = list[1];
  expect(a.name).toBe('測試甲');
  expect(a.segments.map((s) => [s.role, s.color, s.none])).toEqual([
    ['hair', '#e03030', false],
    ['eye', '#204080', false],
    ['eye', '#204080', true],
  ]);
  expect(a.image).toMatchObject({ width: 300, height: 400 });
  expect(a.avatar?.zoom).toBeCloseTo(1.5, 3);
  expect(a.scale).toBe(160);
  /* 第 2 位：髮色是自動取的主色，瞳色沒指定（沒有存） */
  expect(list[2].segments.map((s) => [s.role, s.color])).toEqual([['hair', '#30c030']]);
  expect(list[2].avatar?.zoom).toBeCloseTo(1.5, 3);
  /* 頭像畫的是立繪 */
  await expect(cardNamed(page, '測試甲').locator('canvas')).toHaveAttribute('data-avatar', 'image');
  /* 色票櫃：紅系一組、綠系一組、沒有髮色一組 */
  await expect(shelf(page).locator('[data-group]')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('排序與分組、每列幾位、顯示名字與代表色', async ({ page }) => {
  const errors = await open(page);
  await mode(page, '色票櫃');
  await loadSamples(page);
  const order = () =>
    cards(page).evaluateAll((els) => els.map((e) => e.textContent?.trim() || '(無名)'));
  /* 髮色（預設）：黃 → 紫 → 棕 → 黑 → 白 → 雙色 → 沒有髮色 */
  await expect.poll(order).toEqual(['夏千晴', '柯雨', '葉棠', '林予安', '白澄', '沈墨', '未命名']);
  await expect(shelf(page).locator('[data-group]')).toHaveCount(7);
  await expect(shelf(page).locator('[data-group="twotone"]')).toContainText('雙色');
  /* 瞳色：異色瞳在白之後、「無」只有的是其他 */
  await page.getByRole('combobox', { name: '排序' }).click();
  await page.getByRole('option', { name: '瞳色' }).click();
  await expect(shelf(page).locator('[data-group="oddeye"]')).toContainText('葉棠');
  await expect(shelf(page).locator('[data-group="other"]')).toContainText('柯雨');
  /* 名字：沒有名字的放最後 */
  await page.getByRole('combobox', { name: '排序' }).click();
  await page.getByRole('option', { name: '名字' }).click();
  await expect(shelf(page).locator('[data-group]')).toHaveCount(0);
  expect((await order()).at(-1)).toBe('未命名');
  /* 亮度：代表色由亮到暗（夏千晴的金黃最亮） */
  await page.getByRole('combobox', { name: '排序' }).click();
  await page.getByRole('option', { name: '亮度' }).click();
  expect((await order())[0]).toBe('夏千晴');
  /* 依色系分組只在依髮色、瞳色排序時可以用 */
  await expect(page.getByRole('switch', { name: '依色系分組' })).toBeDisabled();
  /* 每列幾位 */
  await page.getByRole('spinbutton', { name: '每列幾位' }).fill('3');
  await expect(shelf(page).locator('ul').first()).toHaveAttribute(
    'style',
    /grid-template-columns: repeat\(3, minmax\(0px, 1fr\)\)/,
  );
  /* 顯示名字、代表色 */
  await expect(cardNamed(page, '白澄').locator('[data-chip="theme"]')).toHaveCount(1);
  await page.getByRole('switch', { name: '顯示代表色' }).click();
  await expect(shelf(page).locator('[data-chip="theme"]')).toHaveCount(0);
  await page.getByRole('switch', { name: '顯示名字' }).click();
  await expect(shelf(page).getByText('白澄')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('點色塊複製色碼（大寫、兩色以逗號分隔；「無」不複製）', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await mode(page, '色票櫃');
  await loadSamples(page);
  await cardNamed(page, '沈墨').locator('[data-chip="hair"]').click();
  await expect(toastText(page, '已複製色碼')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('#1D1E22, #B8303F');
  await cardNamed(page, '白澄').locator('[data-chip="theme"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('#C43A3A');
  await cardNamed(page, '柯雨').locator('[data-chip="eye"]').click();
  await expect(toastText(page, '「無」沒有色碼可以複製。')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('#C43A3A');
  expect(errors).toEqual([]);
});

test('拖曳卡片調整順序：改成「自己拖曳」，配色條也照這個順序', async ({ page }) => {
  const errors = await open(page);
  await mode(page, '色票櫃');
  await loadSamples(page);
  /* 不分組：卡片排在同一個格子裡 */
  await page.getByRole('switch', { name: '依色系分組' }).click();
  await cardNamed(page, '沈墨').scrollIntoViewIfNeeded();
  const from = (await cardNamed(page, '沈墨').locator('button[data-drag-handle]').boundingBox())!;
  const to = (await cards(page).first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 10, to.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('combobox', { name: '排序' })).toHaveText(/自己拖曳/);
  const names = (await bars(page)).map((b) => b.name);
  expect(names[0]).toBe('沈墨');
  /* 沒拖動就放開＝打開編輯視窗 */
  await cards(page).nth(1).locator('button[data-drag-handle]').click();
  await expect(dialog(page).getByRole('heading', { name: /^編輯角色：/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('角色的編輯視窗：名字、雙色、滴管、代表色、其他部位、「無」、色碼表、刪除與復原', async ({
  page,
}) => {
  const errors = await open(page);
  await mode(page, '色票櫃');
  await loadSamples(page);
  await cardNamed(page, '林予安').locator('button[data-drag-handle]').click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: '編輯角色：林予安' })).toBeVisible();
  await d.getByRole('textbox', { name: '名字' }).fill('林予安改');
  /* 髮色多一格 → 雙色 */
  await d.getByRole('button', { name: '加一個髮色' }).click();
  await expect(page.getByTestId('edit-slots-hair').locator('[data-slot]')).toHaveCount(2);
  await expect(d.getByRole('combobox', { name: '髮色色系' })).toHaveText(/自動（雙色）/);
  /* 滴管：選中的是新的那一格；點頭像的背景（左上角附近） */
  /* 頭像左邊的背景（不是頭髮） */
  await clickCircle(page, 0.03, 0.5);
  const after = await named(page, '林予安改');
  const hairs = after.segments.filter((s) => s.role === 'hair');
  expect(hairs).toHaveLength(2);
  expect(hairs[1].color).not.toBe('#2a2a32');
  /* 代表色 */
  await d.getByTestId('edit-theme').click();
  await d.getByRole('textbox', { name: '代表色色碼' }).fill('#00ff88');
  await d.getByRole('textbox', { name: '代表色色碼' }).press('Enter');
  expect((await named(page, '林予安改')).theme).toBe('#00ff88');
  /* 其他部位：加一個「緞帶」，標「無」→ 配色條不畫 */
  await btn(d, '新增部位').click();
  await d.getByRole('textbox', { name: '其他名稱或備註' }).fill('緞帶');
  await btn(d, '無').click();
  const ribbon = (await named(page, '林予安改')).segments.at(-1);
  expect([ribbon?.role, ribbon?.memo, ribbon?.none]).toEqual(['other', '緞帶', true]);
  /* 色碼表 PNG */
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(d, '存成色碼表').click()]);
  expect(dl.suggestedFilename()).toBe('色碼表_林予安改.png');
  const plan = planChart(await named(page, '林予安改'));
  expect(pngSize(readFileSync((await dl.path()) as string))).toEqual([
    plan.width * 2,
    plan.height * 2,
  ]);
  /* 配色條：名字顯示在標題旁、「無」的段不畫 */
  await btn(d, '完成').click();
  await mode(page, '配色條');
  await expect(page.getByTestId('bar-name').filter({ hasText: '林予安改' })).toBeVisible();
  await expect(page.getByText('無（不畫在配色條上）').first()).toBeVisible();
  /* 刪除（確認）→ 復原 */
  await mode(page, '色票櫃');
  await cardNamed(page, '林予安改').locator('button[data-drag-handle]').click();
  await btn(dialog(page), '刪除角色').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除角色' }).click();
  await expect(page.getByTestId('character-count')).toHaveText('6／24');
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(page.getByTestId('character-count')).toHaveText('7／24');
  expect(errors).toEqual([]);
});

test('從立繪補取色：選部位與角色，依序用滴管取色', async ({ page }) => {
  const errors = await open(page);
  await mode(page, '色票櫃');
  await loadSamples(page);
  await btn(page, '從立繪補取色…').click();
  const d = dialog(page);
  /* 預設瞳色：沒有瞳色的角色先勾好（範例都有瞳色） */
  await expect(d.getByRole('button', { name: '開始' })).toBeDisabled();
  await d.getByRole('checkbox', { name: '柯雨' }).click();
  await d.getByRole('checkbox', { name: '白澄' }).click();
  await btn(d, '開始（2 位）').click();
  await expect(d.getByRole('heading', { name: '補取瞳色（1／2）' })).toBeVisible();
  /* 已經有的顏色先帶進來 */
  await expect(page.getByTestId('slots-eye').locator('[data-slot]').first()).toHaveAttribute(
    'data-color',
    '#c43a3a',
  );
  await expect(page.getByTestId('slots-hair')).toHaveCount(0);
  await clickCircle(page, 0.5, 0.95);
  await btn(dialog(page), '儲存，下一張').click();
  await expect(dialog(page).getByRole('heading', { name: '補取瞳色（2／2）' })).toBeVisible();
  await btn(dialog(page), '跳過').click();
  await expect(toastText(page, '已更新 1 位角色的顏色。')).toBeVisible();
  const eye = (await named(page, '白澄')).segments.filter((s) => s.role === 'eye');
  expect(eye).toHaveLength(1);
  expect(eye[0].color).not.toBe('#c43a3a');
  expect(errors).toEqual([]);
});

test('整櫃存成 PNG：兩倍解析度，大小依每列幾位與分組', async ({ page }) => {
  const errors = await open(page);
  await mode(page, '色票櫃');
  await loadSamples(page);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    btn(page, '整櫃存成圖片').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^色票櫃_\d{8}\.png$/);
  const s = await state(page);
  const plan = planShelf(s.bars, s.shelf!);
  expect(plan.columns).toBe(6);
  expect(pngSize(readFileSync((await dl.path()) as string))).toEqual([
    plan.width * 2,
    plan.height * 2,
  ]);
  await expect(page.getByTestId('shelf-status')).toContainText(
    `${plan.width * 2} × ${plan.height * 2} px`,
  );
  expect(errors).toEqual([]);
});

test('全部清除（先存成專案檔的選項；可以復原）；專案檔（ZIP，含圖片）的存讀', async ({ page }) => {
  const errors = await open(page);
  await mode(page, '色票櫃');
  await loadSamples(page);
  /* 存成專案檔：有圖片 → ZIP */
  await page.getByRole('button', { name: /專案/ }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^配色條_\d{8}\.zip$/);
  const zip = readFileSync((await dl.path()) as string);
  /* 全部清除：可以復原 */
  await nextStep(page);
  await btn(page, '全部清除…').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清除', exact: true }).click();
  await expect(page.getByTestId('character-count')).toHaveText('0／24');
  await expect(page.getByText('還沒有角色。')).toBeVisible();
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(page.getByTestId('character-count')).toHaveText('7／24');
  /* 清除後開啟專案檔：角色與圖片都回來 */
  await btn(page, '全部清除…').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清除', exact: true }).click();
  await page.getByRole('button', { name: /專案/ }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /開啟專案檔/ }).click(),
  ]);
  await chooser.setFiles([{ name: 'p.zip', mimeType: 'application/zip', buffer: zip }]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect(page.getByTestId('character-count')).toHaveText('7／24');
  await expect(cardNamed(page, '沈墨').locator('canvas')).toHaveAttribute('data-avatar', 'image');
  expect((await named(page, '沈墨')).segments.filter((s) => s.role === 'hair')).toHaveLength(2);
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：色票櫃 1280 寬', async ({ page }) => {
    const errors = await open(page);
    await mode(page, '色票櫃');
    await loadSamples(page);
    await expect(toastText(page, '已加入 6 位範例角色。')).toBeVisible();
    await page.getByRole('button', { name: '關閉通知' }).click();
    await expect(toastText(page, '已加入 6 位範例角色。')).toBeHidden();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('color-palette-shelf-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：色票櫃 390 寬，沒有橫向捲動（編輯視窗、新增角色也是）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await mode(page, '色票櫃');
    await loadSamples(page);
    await expect(toastText(page, '已加入 6 位範例角色。')).toBeVisible();
    await page.getByRole('button', { name: '關閉通知' }).click();
    await expect(toastText(page, '已加入 6 位範例角色。')).toBeHidden();
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('color-palette-shelf-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    await cardNamed(page, '白澄').locator('button[data-drag-handle]').click();
    await noHorizontalScroll(page);
    await btn(dialog(page), '完成').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '新增角色').click(),
    ]);
    await chooser.setFiles([file('甲.png', await blueRed())]);
    await btn(dialog(page), '套用').click();
    await expect(page.getByTestId('circle-picker')).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
