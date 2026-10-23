/**
 * 家系圖產生器（建置產物 next/family-tree/）的端對端測試（規格 docs/refactor/specs/family-tree.md，第一批）：
 * - 開頁沒有錯誤、範例圖板（綾瀬家：四代、世代標籤、配偶卡片、圖例）、頁尾只有靈感來源；
 * - 選取與人物面板、雙擊就地編輯（Enter、Esc、Tab）、F2、加兒子／女兒／配偶／兄弟姊妹／上一代、新增始祖；
 * - 拖曳：換順序、調間距、換父母、不能放到自己的子孫、Esc 取消；手動模式只移動父母；
 * - 父親的位置、詳細／簡易卡片、備註、配偶、色分類與圖例、折疊子孫、搜尋、縮放與全覽、自動整列；
 * - 父母的下拉、和左右交換、刪除（有子孫時不能刪；通知的「復原」）；
 * - 圖板：新增（空白的畫面）、改名、切換、刪除（至少留一張）、加入範例；
 * - 匯出 PNG（大小、檔名、橫向、選取的人以下）；專案檔（存、開啟加成新的圖板、只存這張圖板）；讀原作的備份檔；
 * - 自動儲存與還原、復原／重做；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 * 兩次修改之間至少隔 450 ms（0.4 秒內的連續變更會合成一步復原）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('family-tree') ?? { id: 'family-tree', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:family-tree';
const STEP = 460;

test.use({ viewport: { width: 1280, height: 900 } });

interface NodePos {
  id: string;
  x: number;
  y: number;
  gen: number;
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
  await expect(page.getByRole('heading', { level: 1, name: '家系圖產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __familyTree?: unknown }).__familyTree,
  );
  await page.waitForTimeout(200);
  return errors;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 成員卡片（aria-label「名字，第 N 代」） */
const card = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${esc(name)}，第 \\d+ 代$`) });
/** 配偶卡片（aria-label「名字（成員的妻／夫）」） */
const chip = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${esc(name)}（`) });
const canvas = (page: Page) => page.getByTestId('tree-canvas');
const layout = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __familyTree: { layout: () => NodePos[] } }).__familyTree.layout(),
  );
const board = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __familyTree: {
          board: () => {
            title: string;
            align: string;
            people: Record<string, Record<string, unknown>>;
          };
        };
      }
    ).__familyTree.board(),
  );
const personByName = async (page: Page, name: string) =>
  Object.values((await board(page)).people).find((p) => p.name === name) as
    | Record<string, unknown>
    | undefined;
const pos = async (page: Page, name: string) => {
  const p = await personByName(page, name);
  return (await layout(page)).find((n) => n.id === p?.id);
};
const tab = (page: Page, name: '人物' | '顯示' | '匯出' | '圖板') =>
  page.getByRole('tab', { name, exact: true }).click();
const settle = (page: Page) => page.waitForTimeout(STEP);

/** 從 a 的卡片拖到 b 的卡片中央（或位移 dx, dy；畫面 px） */
async function dragCard(
  page: Page,
  from: Locator,
  to: Locator | { dx: number; dy?: number },
  opts: { alt?: boolean; shift?: boolean; hold?: (page: Page) => Promise<void> } = {},
) {
  const a = await from.boundingBox();
  if (!a) throw new Error('no card');
  const sx = a.x + 30;
  const sy = a.y + 12;
  let ex: number;
  let ey: number;
  if ('dx' in to) {
    ex = sx + to.dx;
    ey = sy + (to.dy ?? 0);
  } else {
    const b = await to.boundingBox();
    if (!b) throw new Error('no target');
    ex = b.x + b.width / 2;
    ey = b.y + 12;
  }
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 8, sy + 1, { steps: 2 });
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.move(ex, ey, { steps: 10 });
  await page.waitForTimeout(120);
  if (opts.hold) await opts.hold(page);
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
  if (opts.shift) await page.keyboard.up('Shift');
  await settle(page);
}

const scale = async (page: Page) =>
  Number(await page.getByTestId('tree-content').getAttribute('data-scale'));

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw).toBeLessThanOrEqual(cw);
}

async function exportPng(page: Page) {
  await tab(page, '匯出');
  const panel = page.getByRole('region', { name: '匯出圖片' });
  await panel.getByRole('button', { name: /^匯出/ }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  const ihdr = readIhdr(parseChunks(bytes));
  return { name: dl.suggestedFilename(), width: ihdr.width, height: ihdr.height, bytes };
}

async function projectMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function openFile(page: Page, name: string, content: unknown) {
  const chooser = page.waitForEvent('filechooser');
  await projectMenu(page, /開啟專案檔/);
  await (await chooser).setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content)),
  });
}

/* ---------- 開頁 ---------- */

test('開頁：範例圖板（四代、世代標籤、配偶、圖例）、頁尾只有靈感來源（F01、F06、F13～F15、F19、F23）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByRole('combobox', { name: '目前的圖板' })).toContainText('範例：綾瀬家');
  const nodes = await layout(page);
  expect(nodes.length).toBe(13);
  /* 一代一列：y＝(代數 − 1) × 168 */
  for (const n of nodes) expect(n.y).toBe((n.gen - 1) * 168);
  for (const g of [1, 2, 3, 4])
    await expect(canvas(page).getByText(`第 ${g} 代`, { exact: true })).toBeVisible();
  await expect(card(page, '綾瀬 宗一郎')).toContainText('あやせ そういちろう');
  await expect(card(page, '綾瀬 宗一郎')).toContainText('1889');
  await expect(card(page, '綾瀬 宗一郎')).toContainText('初代當家');
  await expect(chip(page, '綾瀬 千代')).toContainText('妻');
  await expect(chip(page, '三輪 誠')).toContainText('夫');
  await expect(page.getByTestId('legend')).toContainText('當家');
  await expect(page.getByTestId('legend')).toContainText('調查對象');
  /* 卡片 140 × 90、配偶卡片 108 */
  const box = await card(page, '綾瀬 正嗣').boundingBox();
  const s = await scale(page);
  expect(box?.width).toBeCloseTo(140 * s, 0);
  expect(box?.height).toBeCloseTo(90 * s, 0);
  /* 頁尾只有靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://gagyedo.j-segrc.workers.dev',
  );
  expect(errors).toEqual([]);
});

/* ---------- 選取與就地編輯 ---------- */

test('選取、人物面板；Esc 與點空白處取消選取（F32、F35、F43）', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('no-selection')).toBeVisible();
  await card(page, '綾瀬 透').click();
  await expect(page.getByTestId('person-title')).toHaveText('綾瀬 透');
  await expect(page.getByTestId('person-sub')).toHaveText('第 3 代 · 綾瀬 正嗣 的兒子');
  await expect(card(page, '綾瀬 透')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('no-selection')).toBeVisible();
  await card(page, '綾瀬 宗一郎').click();
  await expect(page.getByTestId('person-sub')).toHaveText('第 1 代 · 始祖');
  /* 空白處 */
  const c = await canvas(page).boundingBox();
  await page.mouse.click((c?.x ?? 0) + 20, (c?.y ?? 0) + (c?.height ?? 0) - 120);
  await expect(page.getByTestId('no-selection')).toBeVisible();
  /* 配偶 */
  await chip(page, '綾瀬 菊江').click();
  await expect(page.getByTestId('person-sub')).toHaveText('綾瀬 正嗣 的妻子');
  await expect(page.getByTestId('spouse-panel').getByLabel('出身')).toHaveValue('舊姓 早瀬');
  await page.getByRole('button', { name: '回到 綾瀬 正嗣' }).click();
  await expect(page.getByTestId('person-title')).toHaveText('綾瀬 正嗣');
});

test('雙擊就地編輯：Enter 確定、Esc 取消、Tab 跳欄、F2；復原（F33、F34、F69）', async ({
  page,
}) => {
  await open(page);
  const toru = card(page, '綾瀬 透');
  await toru.locator('[data-f="name"]').dblclick();
  const input = page.locator('input[data-inline]');
  await expect(input).toHaveAttribute('data-inline', 'name');
  await input.fill('綾瀬 徹');
  await page.keyboard.press('Tab');
  await expect(page.locator('input[data-inline]')).toHaveAttribute('data-inline', 'reading');
  await page.keyboard.type('とおる');
  await page.keyboard.press('Tab');
  await expect(page.locator('input[data-inline]')).toHaveAttribute('data-inline', 'birth');
  await page.keyboard.press('Escape');
  await expect(page.locator('input[data-inline]')).toHaveCount(0);
  await expect(card(page, '綾瀬 徹')).toContainText('とおる');
  expect(await personByName(page, '綾瀬 徹')).toMatchObject({ reading: 'とおる', birth: '1950' });
  /* 點在生歿年那一行：生年；Shift＋Tab 回到上一欄 */
  await settle(page);
  await card(page, '綾瀬 徹').locator('[data-f="death"]').dblclick();
  await expect(page.locator('input[data-inline]')).toHaveAttribute('data-inline', 'death');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('input[data-inline]')).toHaveAttribute('data-inline', 'birth');
  await page.keyboard.press('Escape');
  /* 名字前後的空白去掉 */
  await settle(page);
  await card(page, '綾瀬 徹').focus();
  await page.keyboard.press('F2');
  await page.locator('input[data-inline]').fill('  綾瀬 透  ');
  await page.keyboard.press('Enter');
  await expect(card(page, '綾瀬 透')).toBeVisible();
  /* 復原：回到「綾瀬 徹」 */
  await settle(page);
  await page.keyboard.press('Control+z');
  await expect(card(page, '綾瀬 徹')).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(card(page, '綾瀬 透')).toBeVisible();
});

test('人物面板改資料：名字、性別、別名、生歿年、備註；起始代數（F35）', async ({ page }) => {
  await open(page);
  await card(page, '綾瀬 慎吾').click();
  const panel = page.getByTestId('member-panel');
  await panel.getByLabel('名字', { exact: true }).fill('綾瀬 慎之介');
  await panel.getByLabel('別名').fill('長男\n記者');
  await panel.getByLabel('歿年').fill('不詳');
  await panel.getByLabel('歿年').blur();
  await expect(card(page, '綾瀬 慎之介')).toContainText(/1978\s*–\s*不詳/);
  await expect(card(page, '綾瀬 慎之介')).toContainText('記者');
  await settle(page);
  await panel.getByRole('radio', { name: '女' }).click();
  expect((await personByName(page, '綾瀬 慎之介'))?.gender).toBe('F');
  /* 起始代數：只有始祖有 */
  await expect(panel.getByLabel('起始代數')).toHaveCount(0);
  await card(page, '綾瀬 宗一郎').click();
  const gen = page.getByTestId('member-panel').getByLabel('起始代數');
  await gen.fill('3');
  await gen.press('Enter');
  await expect(canvas(page).getByText('第 3 代', { exact: true })).toBeVisible();
  await expect(canvas(page).getByText('第 6 代', { exact: true })).toBeVisible();
  expect((await pos(page, '綾瀬 宗一郎'))?.gen).toBe(3);
});

/* ---------- 加人 ---------- */

test('加兒子、加女兒、加配偶、加兄弟姊妹、加上一代、新增始祖（F07～F11）', async ({ page }) => {
  await open(page);
  await card(page, '綾瀬 和臣').click();
  await page.getByRole('button', { name: '加兒子' }).click();
  await page.keyboard.type('綾瀬 新');
  await page.keyboard.press('Enter');
  const k = await personByName(page, '綾瀬 新');
  /* 和臣只有一位妻子：母親自動填 */
  expect(k).toMatchObject({ gender: 'M', order: 3 });
  expect(k?.motherId).toBe((await personByName(page, '綾瀬 小夜子'))?.id);
  await expect(page.getByTestId('person-title')).toHaveText('綾瀬 新');
  await settle(page);
  await page.getByRole('button', { name: '加妻子' }).click();
  await page.keyboard.type('綾瀬 新妻');
  await page.keyboard.press('Enter');
  await expect(chip(page, '綾瀬 新妻')).toContainText('妻');
  await settle(page);
  await card(page, '綾瀬 新').click();
  await page.getByRole('button', { name: '加兄弟姊妹' }).click();
  await page.keyboard.type('綾瀬 弟');
  await page.keyboard.press('Enter');
  expect((await personByName(page, '綾瀬 弟'))?.fatherId).toBe(
    (await personByName(page, '綾瀬 和臣'))?.id,
  );
  await settle(page);
  /* 女兒加孩子：母親＝她、父親＝她唯一的丈夫 */
  await card(page, '綾瀬 雪乃').click();
  await page.getByRole('button', { name: '加女兒' }).click();
  await page.keyboard.type('三輪 茜');
  await page.keyboard.press('Enter');
  expect(await personByName(page, '三輪 茜')).toMatchObject({
    gender: 'F',
    motherId: (await personByName(page, '綾瀬 雪乃'))?.id,
    fatherId: (await personByName(page, '三輪 誠'))?.id,
  });
  await settle(page);
  /* 加上一代：始祖才有 */
  await card(page, '綾瀬 宗一郎').click();
  await page.getByRole('button', { name: '加上一代' }).click();
  await page.keyboard.type('綾瀬 祖');
  await page.keyboard.press('Enter');
  expect((await pos(page, '綾瀬 祖'))?.gen).toBe(1);
  expect((await pos(page, '綾瀬 宗一郎'))?.gen).toBe(2);
  await expect(page.getByTestId('person-sub')).toHaveText('第 1 代 · 始祖');
  await settle(page);
  /* 新增始祖：排在最後 */
  await page.getByRole('button', { name: '新增始祖' }).click();
  await expect(page.locator('input[data-inline="name"]')).toBeFocused();
  await page.keyboard.type('久世 家');
  await page.keyboard.press('Enter');
  const nodes = await layout(page);
  const root = await pos(page, '久世 家');
  expect(root?.gen).toBe(1);
  expect(root?.x).toBe(Math.max(...nodes.filter((n) => n.gen === 1).map((n) => n.x)));
});

/* ---------- 拖曳 ---------- */

test('拖曳換順序（連同子孫）、Esc 取消、通知的復原（F44、F45、F49）', async ({ page }) => {
  await open(page);
  const before = await layout(page);
  /* 和臣（有孩子）拖到 透 的右邊 */
  const t = await card(page, '綾瀬 透').boundingBox();
  const a = await card(page, '綾瀬 和臣').boundingBox();
  await dragCard(
    page,
    card(page, '綾瀬 和臣'),
    {
      dx: (t?.x ?? 0) + (t?.width ?? 0) + 20 - (a?.x ?? 0),
    },
    {
      hold: async (p) => {
        await expect(p.getByTestId('drag-label')).toHaveText('連同子孫 2 人換順序');
      },
    },
  );
  const order = async () =>
    (
      await Promise.all(['綾瀬 和臣', '綾瀬 雪乃', '綾瀬 透'].map((n) => personByName(page, n)))
    ).map((p) => p?.order);
  expect(await order()).toEqual([3, 1, 2]);
  /* 子孫跟著移動 */
  expect((await pos(page, '綾瀬 遥'))?.x).not.toBe(before.find((n) => n.id === 'ex-haruka')?.x);
  await expect(page.getByText('已換順序').first()).toBeVisible();
  await page.getByRole('button', { name: '復原' }).first().click();
  expect(await order()).toEqual([1, 2, 3]);
  await settle(page);
  /* Esc 取消 */
  const b = await card(page, '綾瀬 雪乃').boundingBox();
  await page.mouse.move((b?.x ?? 0) + 20, (b?.y ?? 0) + 12);
  await page.mouse.down();
  await page.mouse.move((b?.x ?? 0) + 400, (b?.y ?? 0) + 14, { steps: 8 });
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settle(page);
  expect(await order()).toEqual([1, 2, 3]);
  expect(await layout(page)).toEqual(before);
});

test('調間距；自動整列清掉間距（F46、F30、F50）', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: '拖曳卡片只調整和左邊的間距' }).click();
  const s = await scale(page);
  const dist = async () =>
    ((await pos(page, '綾瀬 慎吾'))?.x ?? 0) - ((await pos(page, '綾瀬 遥'))?.x ?? 0);
  const x0 = (await pos(page, '綾瀬 慎吾'))?.x ?? 0;
  const d0 = await dist();
  await dragCard(
    page,
    card(page, '綾瀬 慎吾'),
    { dx: 60 * s },
    {
      hold: async (p) => {
        await expect(p.getByTestId('drag-label')).toContainText('左側間距');
      },
    },
  );
  const gap = Number((await personByName(page, '綾瀬 慎吾'))?.gap);
  expect(gap).toBeGreaterThan(55);
  expect(gap).toBeLessThan(65);
  /* 兩個孩子之間多了間距（父母仍在兩人中間，所以兩人各移一半） */
  expect((await dist()) - d0).toBe(gap);
  await expect(page.getByText('已調整間距').first()).toBeVisible();
  await page.getByRole('button', { name: '自動整列' }).click();
  await settle(page);
  expect((await personByName(page, '綾瀬 慎吾'))?.gap).toBeUndefined();
  expect((await pos(page, '綾瀬 慎吾'))?.x).toBe(x0);
});

test('拖到別列的卡片上換父母；不能放到自己的子孫；Alt 放到同一列（F48）', async ({ page }) => {
  await open(page);
  await dragCard(page, card(page, '綾瀬 律'), card(page, '綾瀬 透'), {
    hold: async (p) => {
      await expect(p.getByTestId('drag-label')).toHaveText('放開：變成 綾瀬 透 的孩子');
      await expect(card(p, '綾瀬 透')).toHaveClass(/border-success/);
    },
  });
  expect((await personByName(page, '綾瀬 律'))?.fatherId).toBe('ex-toru');
  expect((await pos(page, '綾瀬 律'))?.gen).toBe(4);
  await expect(page.getByText('綾瀬 律 移到 綾瀬 透 底下（兒子）').first()).toBeVisible();
  await expect(page.getByTestId('person-title')).toHaveText('綾瀬 律');
  await settle(page);
  /* 放到配偶卡片：母親＝那位配偶 */
  await dragCard(page, card(page, '綾瀬 律'), chip(page, '綾瀬 小夜子'));
  expect(await personByName(page, '綾瀬 律')).toMatchObject({
    fatherId: 'ex-kazuomi',
    motherId: 'ex-sayoko',
  });
  await settle(page);
  /* 自己的子孫 */
  await dragCard(page, card(page, '綾瀬 正嗣'), card(page, '綾瀬 遥'), {
    hold: async (p) => {
      await expect(p.getByTestId('drag-label')).toHaveText('不能移到自己的子孫底下');
    },
  });
  await expect(page.getByText('不能移到自己的子孫底下').first()).toBeVisible();
  expect((await personByName(page, '綾瀬 正嗣'))?.fatherId).toBe('ex-soichiro');
  await settle(page);
  /* Alt：同一列的卡片 */
  await dragCard(page, card(page, '綾瀬 慎吾'), card(page, '三輪 葵'), { alt: true });
  expect((await personByName(page, '綾瀬 慎吾'))?.motherId).toBe('ex-aoi');
  expect((await pos(page, '綾瀬 慎吾'))?.gen).toBe(5);
});

test('手動模式：拖有孩子的卡片只移動父母；Shift 連同子孫（F28、F47）', async ({ page }) => {
  await open(page);
  await tab(page, '顯示');
  await page.getByRole('radio', { name: '手動' }).click();
  await settle(page);
  const s = await scale(page);
  const kid0 = (await pos(page, '綾瀬 遥'))?.x;
  const p0 = (await pos(page, '綾瀬 和臣'))?.x ?? 0;
  await dragCard(
    page,
    card(page, '綾瀬 和臣'),
    { dx: 50 * s },
    {
      hold: async (p) => {
        await expect(p.getByTestId('drag-label')).toHaveText('移動父親的位置（Shift：連同子孫）');
      },
    },
  );
  expect(Number((await personByName(page, '綾瀬 和臣'))?.shift)).toBeGreaterThan(40);
  expect(Math.abs(((await pos(page, '綾瀬 遥'))?.x ?? 0) - (kid0 ?? 0))).toBeLessThan(2);
  expect(((await pos(page, '綾瀬 和臣'))?.x ?? 0) - p0).toBeGreaterThan(40);
  await expect(page.getByText('已移動父親的位置').first()).toBeVisible();
  /* 人物面板：清除手動的間距與位置 */
  await card(page, '綾瀬 和臣').click();
  await page.getByRole('button', { name: '清除手動的間距與位置' }).click();
  expect((await personByName(page, '綾瀬 和臣'))?.shift).toBeUndefined();
});

/* ---------- 顯示 ---------- */

test('父親的位置、簡易卡片、備註、配偶（F16、F17、F20、F28）', async ({ page }) => {
  await open(page);
  await tab(page, '顯示');
  const center = await layout(page);
  await page.getByRole('radio', { name: '對齊長子' }).click();
  await expect(page.getByTestId('align-hint')).toContainText('長子正上方');
  await settle(page);
  /* 正嗣在長子和臣的正上方 */
  expect((await pos(page, '綾瀬 正嗣'))?.x).toBe((await pos(page, '綾瀬 和臣'))?.x);
  expect(await layout(page)).not.toEqual(center);
  await page.getByRole('radio', { name: '置中' }).click();
  await settle(page);
  expect(await layout(page)).toEqual(center);
  /* 簡易卡片：104 × 68 */
  await page.getByRole('radio', { name: /^簡易/ }).click();
  const s = await scale(page);
  const box = await card(page, '綾瀬 正嗣').boundingBox();
  expect(box?.width).toBeCloseTo(104 * s, 0);
  expect(box?.height).toBeCloseTo(68 * s, 0);
  await expect(page.getByRole('switch', { name: '備註' })).toBeDisabled();
  await page.getByRole('radio', { name: '詳細' }).click();
  /* 備註：卡片高 126 */
  await page.getByRole('switch', { name: '備註' }).click();
  const box2 = await card(page, '綾瀬 透').boundingBox();
  expect(box2?.height).toBeCloseTo(126 * (await scale(page)), 0);
  await expect(card(page, '綾瀬 透')).toContainText('十八歲時在後山的池塘溺死');
  /* 配偶：關掉時不畫、排版變窄 */
  const w0 =
    Math.max(...(await layout(page)).map((n) => n.x)) -
    Math.min(...(await layout(page)).map((n) => n.x));
  await page.getByRole('switch', { name: '配偶' }).click();
  await expect(chip(page, '綾瀬 千代')).toHaveCount(0);
  const L = await layout(page);
  expect(Math.max(...L.map((n) => n.x)) - Math.min(...L.map((n) => n.x))).toBeLessThan(w0);
});

test('色分類：新增、選、圖例、關掉顏色、刪除（F23、F36、F58、F59）', async ({ page }) => {
  await open(page);
  await card(page, '綾瀬 慎吾').click();
  await page.getByTestId('cat-picker').getByRole('button', { name: '新分類' }).click();
  expect((await board(page)).people['ex-shingo'].cat).toBeTruthy();
  await expect(page.getByTestId('legend')).toContainText('分類 4');
  await settle(page);
  await page.getByTestId('cat-picker').getByRole('button', { name: '當家' }).click();
  expect((await board(page)).people['ex-shingo'].cat).toBe('ex-head');
  await expect(page.getByTestId('legend')).not.toContainText('分類 4');
  /* 改名、關掉顏色 */
  await tab(page, '顯示');
  await page.getByTestId('cat-list').getByRole('textbox').first().fill('當家一脈');
  await page.getByTestId('cat-list').getByRole('textbox').first().blur();
  await expect(page.getByTestId('legend')).toContainText('當家一脈');
  await page.getByRole('switch', { name: '卡片上顯示顏色' }).click();
  await expect(page.getByTestId('legend')).toHaveCount(0);
  await page.getByRole('switch', { name: '卡片上顯示顏色' }).click();
  await settle(page);
  /* 刪除分類：用到的人清掉 */
  await page.getByRole('button', { name: '刪除分類「當家一脈」' }).click();
  expect((await board(page)).people['ex-shingo'].cat).toBeUndefined();
  await expect(page.getByTestId('legend')).not.toContainText('當家一脈');
  await settle(page);
  await page.getByTestId('cat-add').click();
  await expect(page.getByTestId('cat-list').getByRole('textbox').last()).toBeFocused();
});

test('折疊子孫、搜尋（展開祖先、輪流、找不到）（F22、F55）', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '折疊「綾瀬 正嗣」的子孫' }).click();
  await expect(card(page, '綾瀬 和臣')).toHaveCount(0);
  expect((await layout(page)).length).toBe(7);
  const search = page.getByTestId('search');
  await search.fill('遥');
  await search.press('Enter');
  await expect(card(page, '綾瀬 遥')).toBeVisible();
  await expect(card(page, '綾瀬 遥')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('第 1 個（共 1 個）').first()).toBeVisible();
  await search.fill('綾瀬');
  await search.press('Enter');
  await search.press('Enter');
  await expect(page.getByText(/第 \d+ 個（共 1[0-9] 個）/).first()).toBeVisible();
  /* 讀音也找得到 */
  await search.fill('そういち');
  await search.press('Enter');
  await expect(page.getByTestId('person-title')).toHaveText('綾瀬 宗一郎');
  await search.fill('沒有這個人');
  await search.press('Enter');
  await expect(page.getByText('找不到「沒有這個人」').first()).toBeVisible();
});

test('縮放、全覽、平移、滾輪（F51～F53）', async ({ page }) => {
  await open(page);
  const level = page.getByTestId('zoom-level');
  const z0 = await scale(page);
  await page.getByRole('button', { name: '放大' }).click();
  expect(await scale(page)).toBeCloseTo(z0 * 1.2, 5);
  await page.getByRole('button', { name: '縮小' }).click();
  await page.getByRole('button', { name: '縮小' }).click();
  expect(await scale(page)).toBeCloseTo(z0 / 1.2, 5);
  await expect(level).toHaveText(`${Math.round((z0 / 1.2) * 100)}%`);
  await page.getByRole('button', { name: '全覽（整張圖放進畫面）' }).click();
  await page.waitForTimeout(400);
  expect(await scale(page)).toBeCloseTo(z0, 5);
  /* 空白處拖曳平移 */
  const c = await canvas(page).boundingBox();
  const a0 = await card(page, '綾瀬 宗一郎').boundingBox();
  await page.mouse.move((c?.x ?? 0) + 30, (c?.y ?? 0) + 300);
  await page.mouse.down();
  await page.mouse.move((c?.x ?? 0) + 130, (c?.y ?? 0) + 340, { steps: 5 });
  await page.mouse.up();
  const a1 = await card(page, '綾瀬 宗一郎').boundingBox();
  expect((a1?.x ?? 0) - (a0?.x ?? 0)).toBeCloseTo(100, 0);
  expect((a1?.y ?? 0) - (a0?.y ?? 0)).toBeCloseTo(40, 0);
  /* 滑鼠滾輪（一次 100 px）縮放：指標下的點不動 */
  const px = (c?.x ?? 0) + 300;
  const py = (c?.y ?? 0) + 200;
  await page.mouse.move(px, py);
  const s1 = await scale(page);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(100);
  expect(await scale(page)).toBeCloseTo(s1 * 1.1, 5);
  /* 觸控板的小捲動：平移 */
  const b0 = await card(page, '綾瀬 宗一郎').boundingBox();
  await page.mouse.wheel(20, 10);
  await page.waitForTimeout(100);
  const b1 = await card(page, '綾瀬 宗一郎').boundingBox();
  expect((b0?.x ?? 0) - (b1?.x ?? 0)).toBeCloseTo(20, 0);
});

/* ---------- 父母、位置、刪除 ---------- */

test('父母的下拉、和左右交換、刪除（有子孫時不能刪、復原）（F39～F42）', async ({ page }) => {
  await open(page);
  await card(page, '綾瀬 律').click();
  const panel = page.getByTestId('member-panel');
  await panel.locator('[data-field="father"]').click();
  await page.getByRole('option', { name: /^綾瀬 透 · 第 3 代 · 綾瀬 宗一郎 家系/ }).click();
  expect((await personByName(page, '綾瀬 律'))?.fatherId).toBe('ex-toru');
  await expect(page.getByTestId('person-sub')).toHaveText('第 4 代 · 綾瀬 透 的兒子');
  await settle(page);
  /* 母親：父親的配偶（雪乃的丈夫那邊） */
  await card(page, '三輪 葵').click();
  await page.getByTestId('member-panel').locator('[data-field="mother"]').click();
  await expect(page.getByRole('option', { name: '綾瀬 雪乃 （女兒那邊）' })).toBeVisible();
  await page.keyboard.press('Escape');
  /* 和左右交換 */
  await card(page, '綾瀬 雪乃').click();
  await page.getByRole('button', { name: '和左邊交換' }).click();
  expect((await personByName(page, '綾瀬 雪乃'))?.order).toBe(1);
  await settle(page);
  /* 有子孫時不能刪 */
  await card(page, '綾瀬 正嗣').click();
  await page.getByRole('button', { name: '刪除這個人' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '有子孫時不能刪' })).toBeVisible();
  /* 刪除配偶、成員；復原 */
  await chip(page, '三輪 誠').click();
  await page.getByRole('button', { name: '刪除配偶' }).click();
  await expect(chip(page, '三輪 誠')).toHaveCount(0);
  expect((await personByName(page, '三輪 葵'))?.fatherId).toBeUndefined();
  await page.getByRole('button', { name: '復原' }).first().click();
  await expect(chip(page, '三輪 誠')).toBeVisible();
  expect((await personByName(page, '三輪 葵'))?.fatherId).toBe('ex-makoto');
  await settle(page);
  await card(page, '綾瀬 律').click();
  await page.getByRole('button', { name: '刪除這個人' }).click();
  await expect(card(page, '綾瀬 律')).toHaveCount(0);
  await expect(page.getByText('已刪除「綾瀬 律」').first()).toBeVisible();
});

/* ---------- 圖板 ---------- */

test('圖板：新增（空白）、新增始祖、改名、切換、刪除（至少留一張）、加入範例（F01～F06、F25）', async ({
  page,
}) => {
  await open(page);
  await tab(page, '圖板');
  await page.getByRole('button', { name: '新增圖板' }).click();
  await expect(page.locator('[data-field="board-title"]')).toBeFocused();
  await expect(page.locator('[data-field="board-title"]')).toHaveValue('新家系圖');
  await expect(canvas(page).getByText('從第一個人開始')).toBeVisible();
  await page.locator('[data-field="board-title"]').fill('久世家');
  await page.locator('[data-field="board-title"]').blur();
  await expect(page.getByRole('combobox', { name: '目前的圖板' })).toContainText('久世家');
  await canvas(page).getByRole('button', { name: '新增始祖' }).click();
  await page.keyboard.type('久世 誠一');
  await page.keyboard.press('Enter');
  await expect(card(page, '久世 誠一')).toBeVisible();
  /* 換圖板：復原紀錄清空 */
  await page.getByRole('combobox', { name: '目前的圖板' }).click();
  await page.getByRole('option', { name: '範例：綾瀬家' }).click();
  await expect(card(page, '綾瀬 宗一郎')).toBeVisible();
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  /* 刪除目前的圖板（範例）→ 切到久世家 */
  await tab(page, '圖板');
  await page.getByRole('button', { name: '刪除圖板' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除圖板' }).click();
  await expect(page.getByRole('combobox', { name: '目前的圖板' })).toContainText('久世家');
  /* 刪掉最後一張：換成空白的圖板 */
  await page.getByRole('button', { name: '刪除圖板' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除圖板' }).click();
  await expect(page.getByRole('combobox', { name: '目前的圖板' })).toContainText('新家系圖');
  await expect(canvas(page).getByText('從第一個人開始')).toBeVisible();
  await page.getByRole('button', { name: '加入範例圖板' }).click();
  await expect(card(page, '綾瀬 宗一郎')).toBeVisible();
  await expect(page.getByTestId('board-count')).toContainText('共 2 張圖板');
});

/* ---------- 匯出 ---------- */

test('匯出 PNG：大小、檔名、橫向、選取的人以下（F60～F67）', async ({ page }) => {
  await open(page);
  /* 縱向、詳細卡片、2 倍：2256 × 1716（版面同原作：寬＝卡片範圍 ＋ 96 ＋ 40） */
  const v = await exportPng(page);
  expect(v.name).toBe('範例：綾瀬家.png');
  const L = await layout(page);
  const x0 = Math.min(...L.map((n) => n.x));
  expect(v.width % 2).toBe(0);
  expect(v.width).toBeGreaterThan(2 * (Math.max(...L.map((n) => n.x)) - x0));
  expect(v.height).toBe(2 * (4 * 90 + 3 * 78 + 80 + 40));
  /* 橫向：世代由左到右 */
  await page.getByRole('radio', { name: '橫向' }).click();
  const h = await exportPng(page);
  expect(h.width).toBe(2 * (4 * 140 + 3 * 64 + 40 + 40));
  /* 只有名字 */
  await page.getByRole('radio', { name: '縱向（同畫面）' }).click();
  await page.getByRole('radio', { name: '只有名字' }).click();
  const n = await exportPng(page);
  expect(n.height).toBe(2 * (4 * 36 + 3 * 40 + 80 + 40));
  /* 選取的人以下：沒有選取時不能匯出 */
  await page.getByRole('radio', { name: '選取的人以下' }).click();
  await expect(page.getByText('先在圖上點一個人。').first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: '匯出圖片' }).getByRole('button', { name: /^匯出/ }),
  ).toBeDisabled();
  await card(page, '綾瀬 和臣').click();
  const sub = await exportPng(page);
  expect(sub.height).toBe(2 * (2 * 36 + 40 + 80 + 40));
  /* 檔名欄 */
  await page.locator('[data-field="export-name"]').fill('綾瀬家 給 PL.png');
  const named = await exportPng(page);
  expect(named.name).toBe('綾瀬家 給 PL.png');
  /* 倍率 1× */
  await page
    .getByRole('region', { name: '匯出圖片' })
    .getByRole('combobox', { name: '尺寸' })
    .click();
  await page.getByRole('option', { name: /^100%/ }).click();
  const one = await exportPng(page);
  expect(one.width * 2).toBe(named.width);
});

/* ---------- 專案檔 ---------- */

test('專案檔：存、開啟（加成新的圖板／取代）、只存這張圖板；讀原作的備份檔（F70）', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T10:00:00+08:00'));
  await open(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), projectMenu(page, /^存成專案檔/)]);
  expect(dl.suggestedFilename()).toBe('家系圖 2026-10-23.json');
  const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
  expect(saved).toMatchObject({ format: 'trpg-toolkit-project', tool: 'family-tree', version: 1 });
  expect(saved.data.boards.length).toBe(1);
  expect(Object.keys(saved.data.boards[0].people).length).toBe(19);
  const [one] = await Promise.all([
    page.waitForEvent('download'),
    projectMenu(page, /只把這張圖板/),
  ]);
  expect(one.suggestedFilename()).toBe('範例：綾瀬家 2026-10-23.json');
  /* 開啟：加成新的圖板 */
  await openFile(page, 'a.json', saved);
  await page.getByRole('alertdialog').getByRole('button', { name: '加成新的圖板' }).click();
  await expect(page.getByText('已開啟專案檔').first()).toBeVisible();
  await tab(page, '圖板');
  await expect(page.getByTestId('board-count')).toContainText('共 2 張圖板');
  /* 取代全部 */
  await openFile(page, 'a.json', saved);
  await page.getByRole('alertdialog').getByRole('button', { name: '取代全部的圖板' }).click();
  await expect(page.getByTestId('board-count')).toContainText('共 1 張圖板');
  /* 取消時不改 */
  await openFile(page, 'a.json', saved);
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('board-count')).toContainText('共 1 張圖板');
  /* 原作的備份檔 */
  await openFile(page, 'gagyedo.json', {
    format: 'family-tree/v1',
    title: '霧島家',
    meta: { title: '霧島家', align: 'eldest', cats: [] },
    people: {
      p1: {
        id: 'p1',
        kind: 'member',
        name: '霧島 一',
        hanja: 'きりしま はじめ',
        gender: 'M',
        gen: 1,
        order: 1,
      },
      p2: { id: 'p2', kind: 'member', name: '霧島 二', gender: 'F', order: 1, fatherId: 'p1' },
      p3: {
        id: 'p3',
        kind: 'spouse',
        spouseOf: 'p1',
        name: '霧島 妻',
        clan: '舊姓 月城',
        order: 1,
      },
    },
  });
  await expect(page.getByText('已讀進原作的備份檔（1 張圖板）').first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: '目前的圖板' })).toContainText('霧島家');
  await expect(card(page, '霧島 一')).toContainText('きりしま はじめ');
  await expect(chip(page, '霧島 妻')).toContainText('舊姓 月城');
  expect((await board(page)).align).toBe('eldest');
  /* 不認得的檔案 */
  await openFile(page, 'x.json', { hello: 'world' });
  await expect(page.getByText('這不是家系圖的專案檔或原作的備份檔').first()).toBeVisible();
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原；重設回到範例（F68、F69）', async ({ page }) => {
  await open(page);
  await card(page, '綾瀬 透').click();
  await page.getByTestId('member-panel').getByLabel('名字', { exact: true }).fill('綾瀬 透（改）');
  await page.getByTestId('member-panel').getByLabel('名字', { exact: true }).blur();
  await tab(page, '顯示');
  await page.getByRole('radio', { name: /^簡易/ }).click();
  await page.getByRole('button', { name: '折疊「綾瀬 清彦」的子孫' }).click();
  const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  expect(stored).toContain('綾瀬 透（改）');
  await page.reload();
  await expect(card(page, '綾瀬 透（改）')).toBeVisible();
  await expect(card(page, '綾瀬 清')).toHaveCount(0);
  const box = await card(page, '綾瀬 正嗣').boundingBox();
  expect(box?.height).toBeCloseTo(68 * (await scale(page)), 0);
  await projectMenu(page, /重設/);
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(card(page, '綾瀬 透')).toBeVisible();
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；觸控點選與捏合；1280 與 390 的視覺基準（F72）', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-23T10:00:00+08:00'));
  const errors = await open(page);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('family-tree-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '全覽（整張圖放進畫面）' }).click();
  await page.waitForTimeout(300);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('family-tree-390.png', { fullPage: true });
  /* 選取後的人物面板也不會橫向捲動 */
  await card(page, '綾瀬 遥').click();
  await expect(page.getByTestId('person-title')).toHaveText('綾瀬 遥');
  await noHorizontalScroll(page);
  /* 兩指捏合：放大 */
  const s0 = await scale(page);
  const c = await canvas(page).boundingBox();
  const cx = (c?.x ?? 0) + 150;
  const cy = (c?.y ?? 0) + 200;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', d: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: cx - d, y: cy, id: 1 },
              { x: cx + d, y: cy, id: 2 },
            ],
    });
  await touch('touchStart', 30);
  await touch('touchMove', 45);
  await touch('touchMove', 60);
  await touch('touchEnd', 0);
  await page.waitForTimeout(100);
  expect(await scale(page)).toBeCloseTo(s0 * 2, 1);
  expect(errors).toEqual([]);
});
