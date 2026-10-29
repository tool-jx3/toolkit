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
/** 卡片的虛線外框（F44）：樣式、粗細、和框的間距 */
const outlineOf = (el: Locator) =>
  el.evaluate((e) => {
    const c = getComputedStyle(e);
    return `${c.outlineStyle} ${c.outlineWidth} ${c.outlineOffset}`;
  });
/** 卡片四個角的圓角（F17） */
const radiusOf = (el: Locator) =>
  el.evaluate((e) => {
    const c = getComputedStyle(e);
    return [
      c.borderTopLeftRadius,
      c.borderTopRightRadius,
      c.borderBottomRightRadius,
      c.borderBottomLeftRadius,
    ].join(' ');
  });

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
  /* Enter 之後焦點回到卡片 */
  await expect(card(page, '綾瀬 透')).toBeFocused();
  /* 點畫布的空白處＝確定 */
  await settle(page);
  await card(page, '綾瀬 冬子').locator('[data-f="name"]').dblclick();
  await page.locator('input[data-inline]').fill('綾瀬 冬');
  const c = await canvas(page).boundingBox();
  await page.mouse.click((c?.x ?? 0) + 20, (c?.y ?? 0) + (c?.height ?? 0) - 120);
  await expect(card(page, '綾瀬 冬')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(card(page, '綾瀬 冬子')).toBeVisible();
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

/** 人數剛好 n 的原作備份檔：一位始祖＋n − 1 位孩子 */
function crowdFile(n: number) {
  const people: Record<string, unknown> = {
    r: { id: 'r', kind: 'member', name: '根', gender: 'M', gen: 1, order: 1 },
  };
  for (let i = 0; i < n - 1; i++)
    people[`k${i}`] = {
      id: `k${i}`,
      kind: 'member',
      name: `子${i}`,
      gender: i % 2 ? 'F' : 'M',
      order: i + 1,
      fatherId: 'r',
    };
  return { format: 'family-tree/v1', title: '人數上限', meta: {}, people };
}

test('一張圖板滿 2,000 人：工具列的「＋始祖」停用並提示（F07、規格第 2 節）', async ({ page }) => {
  await open(page);
  /* 1,999 人：還能加 */
  await openFile(page, 'crowd.json', crowdFile(1999));
  await expect(page.getByRole('combobox', { name: '目前的圖板' })).toContainText('人數上限');
  const toolbar = page.getByTestId('canvas-toolbar');
  const add = toolbar.getByRole('button', { name: '新增始祖' });
  await expect(add).toBeEnabled();
  await expect(toolbar).not.toContainText('一張圖板最多 2000 人。');
  /* 加第 2,000 位之後：停用、旁邊寫原因（按鈕的說明指到它） */
  await add.click();
  await expect(page.locator('input[data-inline="name"]')).toBeFocused();
  await page.keyboard.type('第兩千位');
  await page.keyboard.press('Enter');
  expect(Object.keys((await board(page)).people).length).toBe(2000);
  await expect(add).toBeDisabled();
  await expect(toolbar).toContainText('一張圖板最多 2000 人。');
  const hint = await add.getAttribute('aria-describedby');
  expect(hint).toBeTruthy();
  await expect(page.locator(`[id="${hint}"]`)).toHaveText('一張圖板最多 2000 人。');
  /* 人物面板的加人按鈕本來就停用 */
  await expect(page.getByTestId('add-buttons').getByRole('button').first()).toBeDisabled();
  /* 復原回到 1,999 人：又能加（加人與輸入名字可能是兩步，退到人數少一為止） */
  for (let i = 0; i < 3; i++) {
    if (Object.keys((await board(page)).people).length < 2000) break;
    await settle(page);
    await page.keyboard.press('Control+z');
  }
  expect(Object.keys((await board(page)).people).length).toBe(1999);
  await expect(add).toBeEnabled();
  await expect(toolbar).not.toContainText('一張圖板最多 2000 人。');
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
        /* F44：要移動的卡片（被拖的人與子孫）有 2 px 虛線外框、間距 3 px（同原作）；其他卡片沒有 */
        for (const n of ['綾瀬 和臣', '綾瀬 遥', '綾瀬 慎吾'])
          expect(await outlineOf(card(p, n)), n).toBe('dashed 2px 3px');
        for (const n of ['綾瀬 雪乃', '綾瀬 透'])
          expect(await outlineOf(card(p, n)), n).toMatch(/^none /);
      },
    },
  );
  /* 放開後虛線外框收掉 */
  await expect.poll(() => outlineOf(card(page, '綾瀬 和臣'))).toMatch(/^none /);
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
  /* 圓角：簡易卡片與簡易配偶卡片 8 px（規格 3.2） */
  expect(await radiusOf(card(page, '綾瀬 正嗣'))).toBe('8px 8px 8px 8px');
  expect(await radiusOf(chip(page, '綾瀬 千代'))).toBe('8px 8px 8px 8px');
  await expect(page.getByRole('switch', { name: '備註' })).toBeDisabled();
  await page.getByRole('radio', { name: '詳細' }).click();
  /* 詳細卡片 10 px */
  expect(await radiusOf(card(page, '綾瀬 正嗣'))).toBe('10px 10px 10px 10px');
  expect(await radiusOf(chip(page, '綾瀬 千代'))).toBe('10px 10px 10px 10px');
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
  /* 匯出分頁的兩組標題不重複：共用匯出區（標題）叫「匯出圖片」，上面那一組（可摺疊的區塊）叫「範圍與內容」 */
  await tab(page, '匯出');
  const exportTab = page.getByTestId('export-tab');
  await expect(exportTab.getByRole('heading', { name: '匯出圖片', exact: true })).toHaveCount(1);
  await expect(exportTab.getByRole('button', { name: '匯出圖片', exact: true })).toHaveCount(0);
  await expect(exportTab.getByRole('button', { name: '範圍與內容', exact: true })).toHaveCount(1);
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
  /* 在「匯出」分頁點卡片不會切到「人物」 */
  await expect(page.getByRole('tab', { name: '匯出' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('綾瀬 和臣與他所有的子孫（折疊的不畫）。')).toBeVisible();
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

test('快捷鍵對話框的按鍵名；拖曳方式的無障礙名稱包含畫面上的字（F50、F57）', async ({ page }) => {
  await open(page);
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: '快捷鍵' });
  await expect(dialog).toBeVisible();
  const keysOf = (label: string) =>
    dialog
      .locator('dt', { hasText: label })
      .locator('xpath=following-sibling::dd[1]')
      .locator('kbd')
      .allTextContents();
  expect(await keysOf('（卡片上）直接修改名字')).toEqual(['F2']);
  expect(await keysOf('（拖曳中）放到同一列的卡片上換父母')).toEqual(['Alt']);
  expect(await keysOf('（手動模式拖曳中）連同子孫')).toEqual(['Shift']);
  expect(await keysOf('（卡片上）選取')).toEqual(['Enter']);
  expect(await keysOf('取消選取／取消拖曳')).toEqual(['Esc']);
  await page.keyboard.press('Escape');
  /* 語音控制說畫面上的字（「換順序」「調間距」）要對得到：無障礙名稱以畫面上的字開頭，說明接在後面 */
  const modes = page.getByRole('radiogroup', { name: '拖曳方式' });
  for (const [text, hint] of [
    ['換順序', '拖曳卡片換兄弟姊妹之間的順序'],
    ['調間距', '拖曳卡片只調整和左邊的間距'],
  ]) {
    const radio = modes.getByRole('radio', { name: text });
    await expect(radio).toHaveText(text);
    await expect(radio).toHaveAccessibleName(new RegExp(`^${text}.*${hint}`));
  }
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
  /* 資料版本 2（第二批；版本 1 的檔照讀） */
  expect(saved).toMatchObject({ format: 'trpg-toolkit-project', tool: 'family-tree', version: 2 });
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

/* ---------- 第二批（F80～F88） ---------- */

/** 頭像用的小圖（自己畫的 96 × 128 PNG：圓臉與兩點眼睛） */
const FACE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAACACAIAAAB7vvvtAAABYElEQVR42u3csW3DQAwFUM6U2gO4zCSuPVIG8QwewRukSZU2lQOfjtKRfsCvBdxrJOj4GffblzxJIAAECBAgQIAAARJAgAABAgQIECABBAgQIECAAAESQKsCXc4fr+YtgAZcjpWKWjT7M0VFmj2Zoi7NPkxRnSabKdroJBlFJ50Mo+hEk8EULXUmGkVXnVlGgPKBltWZYhS9dbYbRXudjUaA0oAK6WwxApQDVE5n2AhQAlBRnTEjQLOBSusMGAFaA+jn+/E3w2eb8pxEoCmnGj7brOe8ZAQIECBA3YFWe4utCFT3UwgQIECAAAECBAgQIED5QH65AgKUDeReDJC7eUDHA5kPAmRGEdDxQOakTdrragDSF6vQF9M41FnVetabt3nB7o5+uztsf7E/yAYqW8oAAQIECBCgtkCnz6s8CSBAgAABAgQIECABBAgQIECAAAESQIAAAQIECBAgAfRffgFTBWrkqE3p/QAAAABJRU5ErkJggg==';

/** 第二批的對等測試資料（原作的備份檔格式；tests/unit/fixtures/family-tree-b2/） */
const b2Data = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/unit/fixtures/family-tree-b2/${name}.json`, 'utf8')).data;

async function openLegacy(page: Page, name: string) {
  await openFile(page, `${name}.json`, b2Data(name));
  await expect(page.getByText(/已讀進原作的備份檔/).first()).toBeVisible();
  /* 通知蓋在畫布右下角的縮放按鈕上，留著會吃掉之後按「全覽」的那一下 */
  const close = page
    .getByRole('region', { name: /^通知/ })
    .getByRole('button', { name: '關閉通知' });
  while ((await close.count()) > 0) await close.first().click();
  await expect(close).toHaveCount(0);
  await settle(page);
}

const stubs = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __familyTree: {
          stubs: () => { id: string; x: number; y: number; parent: string | null }[];
        };
      }
    ).__familyTree.stubs(),
  );
const stubCard = (page: Page, id: string) => page.locator(`[data-stub="${id}"]`);
const lines = (page: Page, kind: 'kin' | 'out' | 'link') =>
  page.getByTestId('tree-lines').locator(`path[data-edge="${kind}"]`);
const memberPanel = (page: Page) => page.getByTestId('member-panel');
const toggle = (page: Page, name: string) => page.getByRole('switch', { name, exact: true });

async function exportFile(page: Page, format: 'PNG 圖片' | 'SVG 向量圖' = 'PNG 圖片') {
  await tab(page, '匯出');
  const panel = page.getByRole('region', { name: '匯出圖片' });
  await panel.getByRole('radio', { name: format }).click();
  await panel.getByRole('button', { name: /^匯出/ }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  return { name: dl.suggestedFilename(), bytes };
}

test('出系／入系：「入」、「出」字小卡、生家的開關、面板設定過繼（F80）', async ({ page }) => {
  const errors = await open(page);
  await openLegacy(page, 'adopt');
  /* 白石 二郎（m004）出系到 氷室 進（m00c）：掛在繼父底下，生父 白石 源（m001）底下有「出」字小卡 */
  const L = await layout(page);
  const S0 = await stubs(page);
  expect(S0.map((s) => [s.id, s.parent]).sort()).toEqual(
    [
      ['m004', 'm001'],
      ['m009', 'm001'],
      ['m00f', 'm00a'],
      ['m00s', 'm00p'],
    ].sort(),
  );
  expect(L.find((n) => n.id === 'm004')?.gen).toBe(3);
  await expect(card(page, '白石 二郎')).toContainText('生父 白石 源 · 繼子');
  await expect(card(page, '白石 二郎').locator('[data-seal="in"]')).toHaveText('入');
  await expect(card(page, '氷室 朧')).toContainText('生父 氷室 誠 · 養子');
  await expect(stubCard(page, 'm004')).toContainText('→ 氷室 進 的繼子');
  await expect(stubCard(page, 'm004').locator('[data-seal="out"]')).toHaveText('出');
  /* 「出」字小卡的連線是紅色虛線 */
  await expect(lines(page, 'out')).toHaveCount(4);
  await expect(lines(page, 'out').first()).toHaveAttribute('stroke-dasharray', '4 3');
  /* 點「出」字小卡：選取本人 */
  await stubCard(page, 'm004').click();
  await expect(page.getByTestId('person-title')).toHaveText('白石 二郎');
  await expect(page.getByTestId('person-sub')).toHaveText('第 3 代 · 氷室 進 的兒子（繼子）');
  /* 生家也顯示出系的人：關掉時小卡不見、排版照原作變窄 */
  await tab(page, '顯示');
  await toggle(page, '生家也顯示出系的人').click();
  await expect(stubCard(page, 'm004')).toHaveCount(0);
  expect(await stubs(page)).toEqual([]);
  await toggle(page, '生家也顯示出系的人').click();
  await expect(stubCard(page, 'm004')).toHaveCount(1);
  /* 面板：把 白石 三郎 出系到 黑川 剛 */
  await card(page, '白石 三郎').click();
  const panel = memberPanel(page);
  await panel.getByRole('combobox', { name: '類別' }).click();
  await page.getByRole('option', { name: '出系（過繼承嗣）' }).click();
  await settle(page);
  await panel.getByRole('combobox', { name: '繼父（過繼到的家）' }).click();
  /* 選項沒有自己、子孫與生父 */
  await expect(page.getByRole('option', { name: /^白石 源/ })).toHaveCount(0);
  await expect(page.getByRole('option', { name: /^白石 三郎/ })).toHaveCount(0);
  await page.getByRole('option', { name: /^黑川 剛/ }).click();
  await settle(page);
  const c = (await board(page)).people.m005;
  expect(c.adopt).toMatchObject({ fatherId: 'm00p', kind: 'heir' });
  expect((await stubs(page)).find((s) => s.id === 'm005')?.parent).toBe('m001');
  await expect(card(page, '白石 三郎')).toContainText('生父 白石 源 · 繼子');
  /* 復原一步回到原本 */
  await page.keyboard.press('Control+z');
  await expect(card(page, '白石 三郎').locator('[data-seal="in"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('「出」字小卡：在生父的孩子之間換順序、拖到別人卡片上換生家、不能放到繼父（F80）', async ({
  page,
}) => {
  await open(page);
  await openLegacy(page, 'adopt');
  await page.getByRole('button', { name: '全覽（整張圖放進畫面）' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '放大' }).click();
  await page.getByTestId('search').fill('白石 一郎');
  await page.getByTestId('search').press('Enter');
  await settle(page);
  /* 白石 四郎（m009）的小卡拖到 白石 一郎 的左邊 */
  const before = (await stubs(page)).find((s) => s.id === 'm009');
  const a = await card(page, '白石 一郎').boundingBox();
  const sbox = await stubCard(page, 'm009').boundingBox();
  if (!a || !sbox) throw new Error('no box');
  await page.mouse.move(sbox.x + 30, sbox.y + 12);
  await page.mouse.down();
  await page.mouse.move(sbox.x + 38, sbox.y + 13, { steps: 2 });
  await page.mouse.move(a.x - 40, sbox.y + 12, { steps: 10 });
  await expect(page.getByTestId('drag-label')).toHaveText('換「出」字小卡的順序');
  await page.mouse.up();
  await settle(page);
  const after = (await stubs(page)).find((s) => s.id === 'm009');
  expect(after && before && after.x < before.x).toBe(true);
  expect((await board(page)).people.m009.adopt).toMatchObject({ order: 1 });
  await expect(page.getByText('已換順序').first()).toBeVisible();
  /* 拖到繼父 氷室 進 的卡片上：不行 */
  await page.keyboard.press('Control+z');
  await settle(page);
  await page.getByTestId('search').fill('氷室 進');
  await page.getByTestId('search').press('Enter');
  await settle(page);
  await page.getByRole('button', { name: '全覽（整張圖放進畫面）' }).click();
  await settle(page);
  /* 繼父、黑川 剛 都和小卡同一列：按住 Alt 放到卡片上 */
  await dragCard(page, stubCard(page, 'm009'), card(page, '氷室 進'), {
    alt: true,
    hold: async (p) => {
      await expect(p.getByTestId('drag-label')).toHaveText('不能把繼父設成生父');
    },
  });
  await expect(page.getByText('不能把繼父設成生父').first()).toBeVisible();
  /* 拖到 黑川 剛 上：生家改成他，繼父那邊不變 */
  await dragCard(page, stubCard(page, 'm009'), card(page, '黑川 剛'), { alt: true });
  const p = (await board(page)).people.m009;
  expect(p.fatherId).toBe('m00p');
  expect(p.adopt).toMatchObject({ fatherId: 'm00c' });
  expect((await stubs(page)).find((s) => s.id === 'm009')?.parent).toBe('m00p');
  await expect(page.getByText('白石 四郎 的生家改成 黑川 剛').first()).toBeVisible();
});

test('母系外孫的開關與「外孫 · 母」；替女兒加孩子時自動打開（F81）', async ({ page }) => {
  await open(page);
  await expect(card(page, '三輪 葵')).toContainText('外孫 · 母 綾瀬 雪乃');
  await tab(page, '顯示');
  await toggle(page, '母系外孫').click();
  await expect(card(page, '三輪 葵')).toHaveCount(0);
  await card(page, '綾瀬 雪乃').click();
  await expect(memberPanel(page)).toContainText(
    '女兒的孩子（外孫）要到「顯示」打開「母系外孫」才看得到。',
  );
  await memberPanel(page).getByRole('button', { name: '加女兒' }).click();
  await settle(page);
  await page.keyboard.press('Escape');
  await expect(card(page, '三輪 葵')).toBeVisible();
  await tab(page, '顯示');
  await expect(toggle(page, '母系外孫')).toBeChecked();
});

test('跨家系的婚姻連結：兩邊的配偶卡片、紫色虛線、移到連結的人、開關、刪除（F82）', async ({
  page,
}) => {
  await open(page);
  await openLegacy(page, 'links');
  /* 5 對（同一對有兩張連過去的配偶卡片時只畫一條，原作同） */
  await expect(lines(page, 'link')).toHaveCount(5);
  await expect(lines(page, 'link').first()).toHaveAttribute('stroke-dasharray', '5 4');
  /* 連結的配偶卡片顯示被連結的人、寫「· 連結」 */
  const linked = page.locator('[data-pid][data-linked="1"]');
  expect(await linked.count()).toBeGreaterThanOrEqual(6);
  await expect(card(page, '東條 長男')).toContainText('婚姻 · 南條 女');
  /* 東條 次男 加配偶、連到 南條 女 */
  await card(page, '東條 次男').click();
  await memberPanel(page).getByRole('button', { name: '和別的家系的人結婚' }).click();
  await settle(page);
  const sp = page.getByTestId('spouse-panel');
  await expect(sp.locator('[data-field="link"]')).toBeFocused();
  await sp.locator('[data-field="link"]').click();
  await page.getByRole('option', { name: /^南條 女/ }).click();
  await settle(page);
  await expect(page.getByText('南條 女 的卡片也加上了配偶').first()).toBeVisible();
  await expect(lines(page, 'link')).toHaveCount(6);
  await expect(page.getByTestId('person-sub')).toHaveText('東條 次男 的妻子 · 和別的家系連結');
  await sp.getByRole('button', { name: '移到連結的人' }).click();
  await expect(page.getByTestId('person-title')).toHaveText('南條 女');
  /* 南條 女 那邊的配偶清單：已連結 */
  await expect(page.getByTestId('spouse-list')).toContainText('已連結 · 東條 家主 家系 第 2 代');
  /* 婚姻連線的開關 */
  await tab(page, '顯示');
  await toggle(page, '婚姻連線').click();
  await expect(lines(page, 'link')).toHaveCount(0);
  await toggle(page, '婚姻連線').click();
  /* 刪除這邊的配偶：對方那邊自動建立的一起刪 */
  const count = Object.keys((await board(page)).people).length;
  await chip(page, '南條 女').click();
  await page.getByTestId('spouse-panel').getByRole('button', { name: '刪除配偶' }).click();
  await settle(page);
  expect(Object.keys((await board(page)).people).length).toBe(count - 2);
  await expect(lines(page, 'link')).toHaveCount(5);
});

test('框選範圍匯出：拖一個框、碰到的卡片匯出；Esc 取消、框裡沒有卡片時通知（F83）', async ({
  page,
}) => {
  await open(page);
  await tab(page, '匯出');
  await page.getByRole('radio', { name: '框選範圍' }).click();
  await expect(
    page.getByText('在畫布上拖一個框，碰到的卡片（含配偶卡片的範圍）都匯出。'),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: '匯出圖片' }).getByRole('button', { name: /^匯出/ }),
  ).toBeDisabled();
  /* Esc 取消 */
  await page.getByTestId('area-start').click();
  await expect(page.getByTestId('area-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('area-overlay')).toHaveCount(0);
  /* 空白處：通知 */
  await page.getByTestId('area-start').click();
  const cv = await canvas(page).boundingBox();
  if (!cv) throw new Error('no canvas');
  await page.mouse.move(cv.x + 5, cv.y + cv.height - 60);
  await page.mouse.down();
  await page.mouse.move(cv.x + 30, cv.y + cv.height - 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('框裡沒有卡片').first()).toBeVisible();
  /* 框住 綾瀬 和臣 與 綾瀬 遥：碰到的卡片外框變藍，放開就匯出 */
  await page.getByTestId('area-start').click();
  const a = await card(page, '綾瀬 和臣').boundingBox();
  const b = await card(page, '綾瀬 遥').boundingBox();
  if (!a || !b) throw new Error('no card');
  await page.mouse.move(a.x + 5, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 20, { steps: 6 });
  await expect(page.getByTestId('area-box')).toBeVisible();
  await page.mouse.up();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/已框選 \d+ 張卡片。/)).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  const png = readIhdr(parseChunks(new Uint8Array(readFileSync((await dl.path()) as string))));
  /* 第 3、4 代的兩張卡片（含配偶）：高＝2 ×（2 × 90 ＋ 78 ＋ 80 ＋ 40） */
  expect(png.height).toBe(2 * (2 * 90 + 78 + 80 + 40));
  expect(png.width).toBeLessThan(2000);
});

test('女兒寫成「女（適 丈夫）」：卡片、配偶卡片不畫、女婿的資料、就地編輯改丈夫（F84）', async ({
  page,
}) => {
  await open(page);
  await tab(page, '顯示');
  await toggle(page, '女兒寫成「女（適 丈夫）」').click();
  await expect(card(page, '綾瀬 千鶴')).toContainText('女（適 鷺沼 文雄）');
  await expect(chip(page, '鷺沼 文雄')).toHaveCount(0);
  await expect(card(page, '綾瀬 冬子')).toContainText('女 綾瀬 冬子');
  await card(page, '綾瀬 千鶴').click();
  await expect(page.getByTestId('person-title')).toHaveText('女（適 鷺沼 文雄）');
  await expect(page.getByTestId('person-sub')).toHaveText(
    '女兒 綾瀬 千鶴 · 第 2 代 · 綾瀬 宗一郎 的女兒',
  );
  await expect(memberPanel(page).locator('[data-field="husband-name"]')).toHaveValue('鷺沼 文雄');
  /* 卡片上雙擊名字：改的是丈夫的名字 */
  await card(page, '綾瀬 千鶴').locator('[data-f="name"]').dblclick();
  const input = page.locator('[data-inline="name"]');
  await expect(input).toHaveValue('鷺沼 文雄');
  await input.fill('鷺沼 文吾');
  await input.press('Enter');
  await settle(page);
  await expect(card(page, '綾瀬 千鶴')).toContainText('女（適 鷺沼 文吾）');
  expect((await personByName(page, '鷺沼 文吾'))?.kind).toBe('spouse');
  expect(await personByName(page, '綾瀬 千鶴')).toBeTruthy();
});

test('狀態：存活／死亡／失蹤的印記（F85）', async ({ page }) => {
  await open(page);
  await card(page, '綾瀬 透').click();
  await memberPanel(page).getByRole('radio', { name: '死亡' }).click();
  await settle(page);
  await expect(card(page, '綾瀬 透').locator('[data-seal="dead"]')).toHaveText('歿');
  await card(page, '綾瀬 清彦').click();
  await memberPanel(page).getByRole('radio', { name: '失蹤' }).click();
  await settle(page);
  await expect(card(page, '綾瀬 清彦').locator('[data-seal="missing"]')).toHaveText('失蹤');
  expect((await personByName(page, '綾瀬 清彦'))?.status).toBe('missing');
  await memberPanel(page).getByRole('radio', { name: '存活' }).click();
  await settle(page);
  await expect(card(page, '綾瀬 清彦').locator('[data-seal]')).toHaveCount(0);
  expect((await personByName(page, '綾瀬 清彦'))?.status).toBeUndefined();
  /* 配偶也有狀態 */
  await chip(page, '綾瀬 志乃').click();
  await page.getByTestId('spouse-panel').getByRole('radio', { name: '死亡' }).click();
  await settle(page);
  await expect(chip(page, '綾瀬 志乃')).toHaveAttribute('data-status', 'dead');
  await expect(chip(page, '綾瀬 志乃').locator('[data-seal="dead"]')).toHaveText('歿');
});

test('GM 專用與 PL 檢視：只有 GM 看得到的人與欄位、GM 筆記、PL 用與 GM 用的匯出、P 鍵（F86）', async ({
  page,
}) => {
  await open(page);
  /* 綾瀬 清（連同兒子 綾瀬 律）只有 GM 看得到 */
  await card(page, '綾瀬 清').click();
  await memberPanel(page).getByRole('switch', { name: '這個人只有 GM 看得到' }).click();
  await settle(page);
  await expect(card(page, '綾瀬 清').locator('xpath=..').locator('[data-gm-only]')).toHaveCount(1);
  /* 鷺沼 文雄（綾瀬 千鶴 的丈夫，第 2 代最右邊）只有 GM 看得到：PL 用的圖比較窄 */
  await chip(page, '鷺沼 文雄').click();
  await page
    .getByTestId('spouse-panel')
    .getByRole('switch', { name: '這位配偶只有 GM 看得到' })
    .click();
  await settle(page);
  /* 綾瀬 透：歿年 PL 看不到；GM 筆記 */
  await card(page, '綾瀬 透').click();
  await memberPanel(page).getByRole('button', { name: '歿年' }).click();
  await settle(page);
  await expect(memberPanel(page).getByRole('button', { name: '歿年' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await memberPanel(page).getByLabel('GM 筆記').fill('其實不是意外。');
  await memberPanel(page).getByLabel('GM 筆記').blur();
  await settle(page);
  await expect(card(page, '綾瀬 透').locator('[data-gm-info]')).toHaveCount(1);
  /* GM 檢視的匯出（GM 用）比 PL 用大：PL 用沒有 綾瀬 清 那一支 */
  const gmBefore = await exportPng(page);
  await page.getByRole('radio', { name: 'GM 用（全部）' }).click();
  const gmExport = await exportPng(page);
  expect(gmExport.width).toBeGreaterThan(gmBefore.width);
  await page.getByRole('radio', { name: 'PL 用（拿掉 GM 專用）' }).click();
  /* PL 檢視（P 鍵）：看不到 綾瀬 清、綾瀬 律；綾瀬 透 沒有歿年；不能編輯 */
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('p');
  await expect(canvas(page)).toHaveAttribute('data-view', 'pl');
  await expect(page.getByTestId('pl-badge')).toBeVisible();
  await expect(card(page, '綾瀬 清')).toHaveCount(0);
  await expect(card(page, '綾瀬 律')).toHaveCount(0);
  await expect(card(page, '綾瀬 透')).not.toContainText('1968');
  await expect(card(page, '綾瀬 透').locator('[data-gm-info]')).toHaveCount(0);
  await tab(page, '人物');
  await expect(page.getByTestId('pl-readonly')).toBeVisible();
  await card(page, '綾瀬 透').dblclick();
  await expect(page.locator('[data-inline]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新增始祖' })).toBeDisabled();
  /* 搜尋找不到 GM 專用的人 */
  await page.getByTestId('search').fill('綾瀬 律');
  await page.getByTestId('search').press('Enter');
  await expect(page.getByText('找不到「綾瀬 律」').first()).toBeVisible();
  /* 專案檔是完整的（GM 的資料） */
  const [dl] = await Promise.all([page.waitForEvent('download'), projectMenu(page, /^存成專案檔/)]);
  const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
  const people = Object.values(saved.data.boards[0].people) as Record<string, unknown>[];
  expect(people.find((p) => p.name === '綾瀬 清')?.gm).toBe(true);
  expect(people.find((p) => p.name === '綾瀬 透')?.secret).toBe('其實不是意外。');
  /* 切回 GM 檢視 */
  await page
    .getByTestId('pl-readonly')
    .locator('xpath=../..')
    .getByRole('button', { name: '切回 GM 檢視' })
    .click();
  await expect(card(page, '綾瀬 清')).toBeVisible();
});

test('頭像：放進圖片、卡片多頭像那一欄、專案檔存成 ZIP 再開回來、匯出（F87）', async ({ page }) => {
  await open(page);
  await card(page, '綾瀬 宗一郎').click();
  const before = await card(page, '綾瀬 宗一郎').boundingBox();
  await memberPanel(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'face.png',
      mimeType: 'image/png',
      buffer: Buffer.from(FACE_PNG, 'base64'),
    });
  await expect(card(page, '綾瀬 宗一郎').locator('[data-avatar="image"]')).toHaveCount(1);
  await expect(card(page, '綾瀬 正嗣').locator('[data-avatar="initial"]')).toHaveText('正');
  const after = await card(page, '綾瀬 宗一郎').boundingBox();
  expect(after && before && Math.round((after.width / before.width) * 140)).toBe(188);
  /* 「顯示」的頭像關掉：卡片回到原本的寬 */
  await tab(page, '顯示');
  await toggle(page, '頭像').click();
  await expect(card(page, '綾瀬 宗一郎').locator('[data-avatar]')).toHaveCount(0);
  await toggle(page, '頭像').click();
  /* 專案檔：ZIP（project.json＋files/） */
  const [dl] = await Promise.all([page.waitForEvent('download'), projectMenu(page, /^存成專案檔/)]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const zip = readFileSync((await dl.path()) as string);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.includes(Buffer.from('files/'))).toBe(true);
  /* 開回來（取代全部）：頭像還在 */
  const chooser = page.waitForEvent('filechooser');
  await projectMenu(page, /開啟專案檔/);
  await (await chooser).setFiles({ name: 'a.zip', mimeType: 'application/zip', buffer: zip });
  await page.getByRole('alertdialog').getByRole('button', { name: '取代全部的圖板' }).click();
  await expect(card(page, '綾瀬 宗一郎').locator('[data-avatar="image"]')).toHaveCount(1);
  /* 匯出：卡片多 48 px（縱向 2 倍） */
  const png = await exportPng(page);
  expect(png.width).toBeGreaterThan(2256);
});

test('SVG 匯出：向量、版面和 PNG 一樣、文字可以選取（F88）', async ({ page }) => {
  await open(page);
  const png = await exportPng(page);
  const svg = await exportFile(page, 'SVG 向量圖');
  expect(svg.name).toBe('範例：綾瀬家.svg');
  const text = new TextDecoder().decode(svg.bytes);
  expect(text.startsWith('<svg')).toBe(true);
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(text);
  expect(m && [Math.ceil(Number(m[1])) * 2, Math.ceil(Number(m[2])) * 2]).toEqual([
    png.width,
    png.height,
  ]);
  expect(text).toContain('>綾瀬 宗一郎<');
  expect(text).toContain('>第 1 代<');
  await expect(page.getByTestId('export-result')).toContainText('字型');
});

test('資料版本 1 的自動儲存照讀', async ({ page }) => {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      key,
      JSON.stringify({
        state: {
          data: {
            boards: [
              {
                id: 'b-old',
                title: '舊的圖板',
                createdAt: '2026-10-01T00:00:00.000Z',
                align: 'center',
                cats: [],
                people: {
                  p1: { id: 'p1', kind: 'member', name: '舊 一', gender: 'M', order: 1, gen: 1 },
                  p2: {
                    id: 'p2',
                    kind: 'member',
                    name: '舊 二',
                    gender: 'M',
                    order: 1,
                    fatherId: 'p1',
                  },
                },
              },
            ],
          },
        },
        version: 1,
      }),
    );
  }, STORAGE_KEY);
  await open(page);
  await expect(page.getByRole('combobox', { name: '目前的圖板' })).toContainText('舊的圖板');
  await expect(card(page, '舊 二')).toBeVisible();
});

/* ---------- 第二批對等驗證後的修正（規格 7.4） ---------- */

const toPl = async (page: Page) => {
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('p');
  await expect(canvas(page)).toHaveAttribute('data-view', 'pl');
};
const toGm = async (page: Page) => {
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('p');
  await expect(canvas(page)).toHaveAttribute('data-view', 'gm');
};
const personNames = async (page: Page) =>
  Object.values((await board(page)).people).map((p) => p.name);

test('PL 檢視：「顯示」分頁的色分類只列 PL 看得到的人用到的，而且不能改（F86、D29）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 「調查對象」只有 綾瀬 遥 用；她只有 GM 看得到 */
  await card(page, '綾瀬 遥').click();
  await memberPanel(page).getByRole('switch', { name: '這個人只有 GM 看得到' }).click();
  await settle(page);
  await tab(page, '顯示');
  await expect(page.getByTestId('cat-list').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('cat-list').locator('input[type="text"]').nth(2)).toHaveValue(
    '調查對象',
  );
  await toPl(page);
  const panel = page.getByTestId('view-panel');
  /* 只列畫面上的人用到的分類：沒有編輯用的清單、名稱欄、新增 */
  await expect(page.getByTestId('cat-list')).toHaveCount(0);
  await expect(page.getByTestId('cat-list-pl').locator('li')).toHaveText(['當家', '死因不明']);
  await expect(panel.getByRole('textbox', { name: '分類名稱' })).toHaveCount(0);
  await expect(page.getByTestId('cat-add')).toHaveCount(0);
  /* 整頁（含隱藏的分頁、輸入欄的值）都找不到只有 GM 專用的人用到的分類名稱 */
  const leaked = await page.evaluate(() => {
    const texts = [document.body.innerText, document.body.textContent ?? ''];
    for (const el of document.querySelectorAll('input,textarea'))
      texts.push((el as HTMLInputElement).value);
    return texts.some((t) => t.includes('調查對象'));
  });
  expect(leaked).toBe(false);
  /* 父親的位置也是圖板的資料：不能改，提示在旁邊 */
  await expect(panel.getByRole('radio', { name: '置中' })).toBeDisabled();
  await expect(panel.getByRole('radio', { name: '對齊長子' })).toBeDisabled();
  await expect(panel.getByTestId('pl-lock').first()).toHaveText('切回 GM 檢視才能編輯');
  /* 切回 GM 檢視：三個分類都在，沒有被動過 */
  await toGm(page);
  await expect(page.getByTestId('cat-list').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('cat-list-pl')).toHaveCount(0);
  await expect(panel.getByRole('radio', { name: '置中' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('PL 檢視：復原、重做、圖板的改名／新增／刪除都不作用並提示；匯出的「對象」照樣可以選（F86、D29）', async ({
  page,
}) => {
  const errors = await open(page);
  /* GM 檢視改一個名字 */
  await card(page, '綾瀬 透').locator('[data-f="name"]').dblclick();
  await page.locator('input[data-inline]').fill('綾瀬 透（改）');
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await personNames(page)).toContain('綾瀬 透（改）');
  /* 提示（通知）；其他分頁裡藏著的「切回 GM 檢視才能編輯」不算 */
  const notice = page.getByText('切回 GM 檢視才能編輯').filter({ visible: true });
  await toPl(page);
  /* Ctrl＋Z、頁首的復原鈕：不作用、提示 */
  await page.keyboard.press('Control+z');
  await expect(notice.first()).toBeVisible();
  expect(await personNames(page)).toContain('綾瀬 透（改）');
  await page.getByRole('button', { name: /^復原/ }).click();
  expect(await personNames(page)).toContain('綾瀬 透（改）');
  /* 「圖板」分頁：名稱欄、新增、加入範例、刪除都停用，旁邊有提示；強制按也不動資料 */
  await tab(page, '圖板');
  const boards = () =>
    page.evaluate(
      (k) =>
        JSON.parse(localStorage.getItem(k) ?? '{}').state.data.boards.map(
          (b: { title: string }) => b.title,
        ),
      STORAGE_KEY,
    );
  const before = await boards();
  await expect(page.getByTestId('pl-lock').last()).toHaveText('切回 GM 檢視才能編輯');
  await expect(page.locator('[data-field="board-title"]')).toBeDisabled();
  await expect(page.getByRole('button', { name: '新增圖板' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '加入範例圖板' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '刪除圖板' })).toBeDisabled();
  await page.getByRole('button', { name: '刪除圖板' }).click({ force: true });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: '新增圖板' }).click({ force: true });
  await page.waitForTimeout(200);
  expect(await boards()).toEqual(before);
  /* 匯出的「對象」照樣可以選（那是匯出設定） */
  await tab(page, '匯出');
  await page.getByRole('radio', { name: 'GM 用（全部）' }).click();
  await expect(page.getByRole('radio', { name: 'GM 用（全部）' })).toBeChecked();
  await page.getByRole('radio', { name: 'PL 用（拿掉 GM 專用）' }).click();
  /* 切回 GM 檢視：圖板可以改名、Ctrl＋Z 復原改名那一步 */
  await toGm(page);
  await tab(page, '圖板');
  await page.locator('[data-field="board-title"]').fill('改過的名稱');
  await page.locator('[data-field="board-title"]').blur();
  await settle(page);
  expect((await board(page)).title).toBe('改過的名稱');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await settle(page);
  expect((await board(page)).title).toBe('範例：綾瀬家');
  /* 重做：GM 檢視時可以；PL 檢視時不作用 */
  await toPl(page);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(200);
  expect((await board(page)).title).toBe('範例：綾瀬家');
  await toGm(page);
  await page.keyboard.press('Control+Shift+z');
  await settle(page);
  expect((await board(page)).title).toBe('改過的名稱');
  expect(errors).toEqual([]);
});

const hatchOf = (el: Locator) =>
  el.evaluate((e) => getComputedStyle(e).backgroundImage.includes('repeating-linear-gradient'));

test('GM 檢視：連到 GM 專用的人的配偶卡片（PL 版會拿掉）也畫斜線與「GM」標（F86）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 綾瀬 慎吾 加一位配偶，連到 綾瀬 遥（家系圖裡別的人） */
  await card(page, '綾瀬 慎吾').click();
  await memberPanel(page).getByRole('button', { name: '和別的家系的人結婚' }).click();
  await settle(page);
  const sp = page.getByTestId('spouse-panel');
  await sp.locator('[data-field="link"]').click();
  await page.getByRole('option', { name: /^綾瀬 遥/ }).click();
  await settle(page);
  const shingo = await personByName(page, '綾瀬 慎吾');
  const chipId = Object.values((await board(page)).people).find(
    (p) => p.kind === 'spouse' && p.spouseOf === shingo?.id,
  )?.id as string;
  const chipEl = page.locator(`[data-pid="${chipId}"]`);
  const host = page.locator(`[data-host="${shingo?.id}"]`);
  /* 還沒有 GM 專用的人：都沒有斜線、沒有小標 */
  expect(await hatchOf(chipEl)).toBe(false);
  await expect(page.locator('[data-gm-only]')).toHaveCount(0);
  /* 綾瀬 遥 只有 GM 看得到 */
  await card(page, '綾瀬 遥').click();
  await memberPanel(page).getByRole('switch', { name: '這個人只有 GM 看得到' }).click();
  await settle(page);
  /* 遥 的卡片、慎吾 的配偶卡片（連到她）都有斜線；慎吾 本人沒有 */
  expect(await hatchOf(card(page, '綾瀬 遥'))).toBe(true);
  expect(await hatchOf(chipEl)).toBe(true);
  expect(await hatchOf(card(page, '綾瀬 慎吾'))).toBe(false);
  /* 「GM」小標：遥（自己）與 慎吾 的配偶卡片各一個（自動建立的那張在她底下，不另外標） */
  await expect(host.locator('[data-gm-only]')).toHaveCount(1);
  await expect(page.locator('[data-gm-only]')).toHaveCount(2);
  /* PL 檢視：那張配偶卡片真的不見了（斜線標出來的就是 PL 看不到的） */
  await toPl(page);
  await expect(chipEl).toHaveCount(0);
  await expect(card(page, '綾瀬 遥')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('改連結、不連結：自動建立的配偶刪掉後孩子的父母不懸空，Ctrl＋Z 一步復原（F82）', async ({
  page,
}) => {
  const errors = await open(page);
  await openLegacy(page, 'links');
  /* 東條 次男 加配偶、連到 南條 家主（沒有配偶）；替 南條 家主 加兒子（母親自動填成他唯一的妻子＝自動建立的配偶） */
  await card(page, '東條 次男').click();
  await memberPanel(page).getByRole('button', { name: '和別的家系的人結婚' }).click();
  await settle(page);
  const sp = page.getByTestId('spouse-panel');
  await sp.locator('[data-field="link"]').click();
  await page.getByRole('option', { name: /^南條 家主/ }).click();
  await settle(page);
  const people = async () => (await board(page)).people;
  const jinan = (await personByName(page, '東條 次男'))?.id;
  const head = (await personByName(page, '南條 家主'))?.id;
  const chipId = Object.values(await people()).find(
    (p) =>
      p.kind === 'spouse' &&
      p.spouseOf === jinan &&
      (p.link as { personId?: string } | undefined)?.personId === head,
  )?.id as string;
  const autoId = ((await people())[chipId].link as { pairId: string }).pairId;
  expect(((await people())[autoId].link as { auto?: boolean }).auto).toBe(true);
  await card(page, '南條 家主').click();
  await memberPanel(page).getByRole('button', { name: '加兒子' }).click();
  await settle(page);
  await page.keyboard.press('Escape');
  const kid = Object.values(await people()).find(
    (p) => p.kind === 'member' && p.fatherId === head && p.name === '',
  );
  expect(kid?.motherId).toBe(autoId);
  /* 資料裡的參照都指到存在的人 */
  const dangling = () =>
    page.evaluate(() => {
      const ppl = (
        window as unknown as {
          __familyTree: { board: () => { people: Record<string, Record<string, unknown>> } };
        }
      ).__familyTree.board().people;
      const bad: string[] = [];
      for (const [id, p] of Object.entries(ppl)) {
        for (const k of ['fatherId', 'motherId'])
          if (p[k] && !ppl[p[k] as string]) bad.push(`${id}.${k}`);
        const link = p.link as { personId?: string; pairId?: string } | undefined;
        if (link?.personId && !ppl[link.personId]) bad.push(`${id}.link.personId`);
        if (link?.pairId && !ppl[link.pairId]) bad.push(`${id}.link.pairId`);
      }
      return bad;
    });
  expect(await dangling()).toEqual([]);
  /* 連結改成「不連結」：自動建立的配偶一起刪，孩子的母親清掉 */
  /* 配偶卡片可能在畫面外：聚焦後按 Enter 選取 */
  await page.locator(`[data-pid="${chipId}"]`).focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('spouse-panel').locator('[data-field="link"]').click();
  await page.getByRole('option', { name: /不連結/ }).click();
  await settle(page);
  expect((await people())[autoId]).toBeUndefined();
  expect((await people())[kid?.id as string].motherId).toBeUndefined();
  expect((await people())[kid?.id as string].fatherId).toBe(head);
  expect(await dangling()).toEqual([]);
  /* 一步復原：連結、自動建立的配偶、孩子的母親都回來 */
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await settle(page);
  expect((await people())[autoId]).toBeDefined();
  expect((await people())[kid?.id as string].motherId).toBe(autoId);
  expect(((await people())[chipId].link as { personId: string }).personId).toBe(head);
  expect(await dangling()).toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * 把 PNG（1×）與 SVG 在瀏覽器裡畫成點陣，比文字（深色的像素）的重心與逐像素的差
 * （SVG 以自己的寬高畫，不縮放）。
 */
async function compareRaster(page: Page, png: Uint8Array, svg: Uint8Array) {
  return page.evaluate(
    async ([pngB64, svgB64]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => rej(new Error('load'));
          i.src = src;
        });
      const A = await load(`data:image/png;base64,${pngB64}`);
      const B = await load(`data:image/svg+xml;base64,${svgB64}`);
      const head = /width="([\d.]+)" height="([\d.]+)"/.exec(atob(svgB64).slice(0, 300));
      const sw = Number(head?.[1]);
      const sh = Number(head?.[2]);
      const w = A.naturalWidth;
      const h = A.naturalHeight;
      const draw = (img: HTMLImageElement, iw: number, ih: number) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const x = c.getContext('2d') as CanvasRenderingContext2D;
        x.fillStyle = '#fff';
        x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, iw, ih);
        return x.getImageData(0, 0, w, h).data;
      };
      const a = draw(A, w, h);
      const b = draw(B, sw, sh);
      const luma = (d: Uint8ClampedArray, i: number) =>
        0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const centroid = (d: Uint8ClampedArray) => {
        let sx = 0;
        let sy = 0;
        let sum = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const l = luma(d, (y * w + x) * 4);
            if (l >= 110) continue;
            const wt = 255 - l;
            sx += x * wt;
            sy += y * wt;
            sum += wt;
          }
        return { x: sx / sum, y: sy / sum, n: sum };
      };
      const ca = centroid(a);
      const cb = centroid(b);
      let dark = 0;
      let off = 0;
      for (let i = 0; i < a.length; i += 4) {
        const la = luma(a, i);
        const lb = luma(b, i);
        if (la < 110 || lb < 110) dark++;
        if (Math.abs(la - lb) > 100) off++;
      }
      return {
        size: [w, h, sw, sh],
        dx: cb.x - ca.x,
        dy: cb.y - ca.y,
        offRatio: off / Math.max(1, dark),
      };
    },
    [Buffer.from(png).toString('base64'), Buffer.from(svg).toString('base64')] as const,
  );
}

test('SVG 的文字位置和 PNG 一樣：垂直置中的文字（只有名字、名字＋讀音、簡易卡片）與詳細卡片的重心差 ≤ 0.1 px（F88）', async ({
  page,
}) => {
  await open(page);
  /* 尺寸 1×（SVG 的倍率固定 1，兩邊同大小） */
  await tab(page, '匯出');
  await page
    .getByRole('region', { name: '匯出圖片' })
    .getByRole('combobox', { name: '尺寸' })
    .click();
  await page.getByRole('option', { name: /^100%/ }).click();
  const modes: [string, () => Promise<void>][] = [
    ['詳細卡片', async () => undefined],
    ['只有名字', () => page.getByRole('radio', { name: '只有名字' }).click()],
    ['名字＋讀音', () => page.getByRole('radio', { name: '名字＋讀音' }).click()],
    [
      '簡易卡片',
      async () => {
        await tab(page, '顯示');
        await page.getByRole('radio', { name: /^簡易/ }).click();
        await tab(page, '匯出');
        await page.getByRole('radio', { name: '照顯示設定' }).click();
      },
    ],
  ];
  const got: string[] = [];
  for (const [name, setup] of modes) {
    await tab(page, '匯出');
    await setup();
    await tab(page, '匯出');
    const png = await exportFile(page, 'PNG 圖片');
    const svg = await exportFile(page, 'SVG 向量圖');
    const r = await compareRaster(page, png.bytes, svg.bytes);
    got.push(
      `${name}：Δx ${r.dx.toFixed(3)}、Δy ${r.dy.toFixed(3)}、差很多的像素 ${(r.offRatio * 100).toFixed(2)}%`,
    );
    expect(Math.abs(r.dx), `${name}的 Δx`).toBeLessThanOrEqual(0.1);
    expect(Math.abs(r.dy), `${name}的 Δy`).toBeLessThanOrEqual(0.1);
    expect(r.offRatio, `${name}差很多的像素`).toBeLessThan(0.01);
  }
  test.info().annotations.push({ type: '文字重心差', description: got.join('；') });
});

test('改倍率、格式、拖曳方式、分頁不會重排整張圖板；改匯出的方向只算匯出那一份；改顯示設定才重排畫面（特大圖板的效能，7.4）', async ({
  page,
}) => {
  const errors = await open(page);
  const calls = () =>
    page.evaluate(() =>
      (
        window as unknown as { __familyTree: { layoutCalls: () => number } }
      ).__familyTree.layoutCalls(),
    );
  const n0 = await calls();
  /* 倍率、格式、拖曳方式、分頁：不影響排版 */
  await tab(page, '匯出');
  await page
    .getByRole('region', { name: '匯出圖片' })
    .getByRole('combobox', { name: '尺寸' })
    .click();
  await page.getByRole('option', { name: /^100%/ }).click();
  await page.getByRole('radio', { name: 'SVG 向量圖' }).click();
  await tab(page, '顯示');
  await page.getByRole('radio', { name: /^調間距/ }).click();
  await tab(page, '圖板');
  await tab(page, '人物');
  await page.waitForTimeout(300);
  expect(await calls()).toBe(n0);
  /* 匯出的方向：匯出的排版（算畫布大小）一份，畫面不重排 */
  await tab(page, '匯出');
  await page.getByRole('radio', { name: '橫向' }).click();
  await page.waitForTimeout(300);
  expect(await calls()).toBe(n0 + 1);
  /* 顯示設定（簡易卡片）：畫面與匯出各重排一次 */
  await tab(page, '顯示');
  await page.getByRole('radio', { name: /^簡易/ }).click();
  await expect.poll(calls).toBe(n0 + 3);
  expect(errors).toEqual([]);
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
