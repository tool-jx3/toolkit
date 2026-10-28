/**
 * 立繪身高比較板：操作導覽與第二批細節（原作 2026-10 更新，規格 1.1 節 F72 起）——
 * - 第一次開（空盤面）自動開始導覽；六個步驟、上一步／下一步、略過、Esc、完成；看過之後不再自動開；
 *   以前用過（自動保存還原了角色）不自動開；導覽中盤面的資料不變、快捷鍵不作用；從空盤面與說明重看；手機上照亮名稱與身高欄；
 * - 刪除後的通知「取消刪除」、匯出成功的提醒、重畫變慢的提示、自動保存無法使用的提示（關閉、存成專案檔）、
 *   操作說明依輸入裝置、手機空盤面不顯示刻度欄。
 */
import { expect, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import type { BoardData } from '../../src/tools/height-board/logic';

const URL = `/${outputDir(getTool('height-board') ?? { id: 'height-board', status: 'next' })}/`;
const SEEN = 'trpg-toolkit:height-board:tour-seen';

test.use({ viewport: { width: 1280, height: 900 } });

async function imgA() {
  const w = 200;
  const h = 400;
  const px = new Uint8Array(w * h * 4);
  for (let y = 60; y < 360; y++)
    for (let x = 50; x < 150; x++) px.set([220, 60, 60, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

async function open(page: Page, { seen = false } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  if (seen)
    await page.addInitScript((k) => {
      localStorage.setItem(k, '1');
    }, SEEN);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '立繪身高比較板' })).toBeVisible();
  return errors;
}

// biome-ignore lint/suspicious/noExplicitAny: 測試用的除錯介面
const hb = <T = any>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(
    ([fn, args]) =>
      (
        window as unknown as { __heightBoard: Record<string, (...a: unknown[]) => unknown> }
      ).__heightBoard[fn as string](...(args as unknown[])),
    [fn, args] as const,
  ) as Promise<T>;
const chars = async (page: Page) => (await hb<BoardData>(page, 'data')).characters;
const history = (page: Page) => hb<{ past: number; future: number }>(page, 'history');
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const tour = (page: Page) => page.getByTestId('guided-tour');
const rows = (page: Page) =>
  page.getByRole('list', { name: '角色清單（上面的在前面）' }).locator(':scope > li');

async function addA(page: Page, name = 'A', height = 160) {
  const n = (await chars(page)).length;
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '選擇圖片…').click(),
  ]);
  await fc.setFiles([{ name: `${name}.png`, mimeType: 'image/png', buffer: await imgA() }]);
  const d = page.getByRole('dialog', { name: '加入角色' });
  await d.getByRole('spinbutton', { name: '身高' }).fill(String(height));
  await d.getByRole('button', { name: '加入', exact: true }).click();
  await expect.poll(async () => (await chars(page)).length).toBe(n + 1);
}

/** 照亮處與元素的範圍有重疊 */
async function spotCovers(page: Page, selector: string) {
  const spot = await page.getByTestId('tour-spot').boundingBox();
  const el = await page.locator(selector).first().boundingBox();
  if (!spot || !el) return false;
  return (
    spot.x <= el.x + 1 &&
    spot.y <= el.y + 1 &&
    spot.x + spot.width >= el.x + el.width - 1 &&
    spot.y + spot.height >= el.y + el.height - 1
  );
}

test('第一次開（空盤面）：自動開始導覽，六個步驟、上一步、略過；看過之後不再自動開', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(tour(page)).toBeVisible();
  await expect(tour(page)).toHaveAttribute('role', 'dialog');
  await expect(page.getByTestId('tour-count')).toHaveText('1／6');
  await expect(tour(page).getByRole('heading', { name: '加入角色' })).toBeVisible();
  await expect.poll(() => spotCovers(page, '[data-tour="add"]')).toBe(true);
  /* 焦點在「下一步」；練習用盤面有三位範例，選取「範例 B」 */
  await expect(btn(page, '下一步')).toBeFocused();
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).nth(1)).toContainText('範例 B');
  /* 盤面的資料（自動保存的那一份）不變 */
  expect(await chars(page)).toEqual([]);
  await btn(page, '下一步').click();
  await expect(page.getByTestId('tour-count')).toHaveText('2／6');
  await expect.poll(() => spotCovers(page, '[data-tour="fields"]')).toBe(true);
  await expect(
    page.getByTestId('character-panel').getByRole('textbox', { name: '名稱' }),
  ).toHaveValue('範例 B');
  await btn(page, '下一步').click();
  await btn(page, '下一步').click();
  await expect(page.getByTestId('tour-count')).toHaveText('4／6');
  await expect(tour(page).getByRole('heading', { name: '對齊頭頂和腳底' })).toBeVisible();
  expect(await hb(page, 'tourStep')).toBe(4);
  /* 上一步 */
  await btn(page, '上一步').click();
  await expect(page.getByTestId('tour-count')).toHaveText('3／6');
  await btn(page, '下一步').click();
  await btn(page, '下一步').click();
  await expect.poll(() => spotCovers(page, '[data-tour="arrange"]')).toBe(true);
  await btn(page, '下一步').click();
  await expect(page.getByTestId('tour-count')).toHaveText('6／6');
  await expect.poll(() => spotCovers(page, '[data-tour="export"]')).toBe(true);
  /* 導覽中按不到後面的東西、快捷鍵不作用 */
  await page.keyboard.press('Control+z');
  await expect(tour(page)).toBeVisible();
  /* 最後一步：「開始使用」關閉，回到空盤面 */
  await btn(page, '開始使用').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(page.getByTestId('board-empty')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBe('1');
  /* 重新整理：不再自動開 */
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '立繪身高比較板' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(tour(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('略過與 Esc；從空盤面、說明對話框、使用方式重看；導覽後盤面、選取、倍率、復原紀錄照舊', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(tour(page)).toBeVisible();
  await btn(page, '略過').click();
  await expect(tour(page)).toHaveCount(0);
  /* 從空盤面重看；Esc 結束 */
  await page.getByTestId('board-empty').getByRole('button', { name: '看操作導覽' }).click();
  await expect(tour(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  /* 有角色、選取、放大之後從說明對話框重看 */
  await addA(page, 'A');
  await addA(page, 'B', 120);
  await rows(page).nth(1).click();
  await btn(page, '放大').click();
  const zoom = await page.getByTestId('zoom').textContent();
  const before = await chars(page);
  const past = (await history(page)).past;
  await btn(page, '說明').click();
  const help = page.getByRole('dialog', { name: /使用方式/ });
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: '看操作導覽' }).click();
  await expect(tour(page)).toBeVisible();
  await expect(help).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(btn(page, '復原')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  expect(await chars(page)).toEqual(before);
  expect((await history(page)).past).toBe(past);
  expect(await hb(page, 'selected')).toBe(before[0].id);
  await expect(page.getByTestId('zoom')).toHaveText(zoom ?? '');
  await expect(rows(page)).toHaveCount(2);
  /* 「使用方式」區塊裡也有 */
  await page.getByRole('button', { name: '使用方式' }).click();
  await page.getByRole('button', { name: '看操作導覽' }).last().click();
  await expect(tour(page)).toBeVisible();
  await btn(page, '略過').click();
  await expect(tour(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('以前用過（自動保存還原了角色）：不自動開，記成看過', async ({ page }) => {
  const errors = await open(page, { seen: true });
  await addA(page);
  await hb(page, 'flush');
  await page.evaluate((k) => localStorage.removeItem(k), SEEN);
  await page.reload();
  await expect.poll(async () => (await chars(page)).length).toBe(1);
  await page.waitForTimeout(500);
  await expect(tour(page)).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBe('1');
  expect(errors).toEqual([]);
});

test('手機（390）：導覽照亮「角色設定」分頁的名稱與身高欄，結束後回到原本的分頁', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await expect(tour(page)).toBeVisible();
  await btn(page, '下一步').click();
  await expect(page.getByRole('tab', { name: '角色設定' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect.poll(() => spotCovers(page, '[data-tour="fields"]')).toBe(true);
  /* 卡片在畫面裡 */
  const card = await tour(page).getByRole('heading').boundingBox();
  expect(card && card.x >= 0 && card.x + card.width <= 390).toBe(true);
  await btn(page, '略過').click();
  await expect(page.getByRole('tab', { name: /角色清單/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  /* 空盤面時手機上不顯示刻度欄 */
  await expect(page.getByTestId('pan-zoom-viewport').locator('> canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('刪除後的通知可以「取消刪除」；之後又有變更時不復原', async ({ page }) => {
  const errors = await open(page, { seen: true });
  await addA(page, 'A');
  await addA(page, 'B', 120);
  await rows(page).nth(0).click();
  await btn(page, '刪除').click();
  await expect(page.getByText('已刪除「B」').first()).toBeVisible();
  await btn(page, '取消刪除').click();
  await expect.poll(async () => (await chars(page)).map((c) => c.name)).toEqual(['A', 'B']);
  /* 刪除後又改了別的：通知的按鈕不復原，改提示 */
  await rows(page).nth(0).click();
  await btn(page, '刪除').click();
  await rows(page).nth(0).getByRole('button', { name: '隱藏「A」' }).click();
  await btn(page, '取消刪除').click();
  await expect(page.getByText(/之後還有別的變更/).first()).toBeVisible();
  expect((await chars(page)).map((c) => c.name)).toEqual(['A']);
  expect(errors).toEqual([]);
});

test('匯出成功的提醒；重畫變慢的提示（只提示一次）；操作說明依輸入裝置', async ({ page }) => {
  const errors = await open(page, { seen: true });
  await addA(page);
  await Promise.all([page.waitForEvent('download'), btn(page, '匯出 PNG').click()]);
  await expect(page.getByText('已匯出 PNG').first()).toBeVisible();
  await expect(page.getByText(/PNG 不能再開回盤面/).first()).toBeVisible();
  /* 重畫變慢：150 ms 以上且顯示中 20 位以上 */
  await hb(page, 'noticeIfSlow', 120, 30);
  await hb(page, 'noticeIfSlow', 200, 10);
  await page.waitForTimeout(200);
  await expect(page.getByText(/盤面重畫變慢了/)).toHaveCount(0);
  await hb(page, 'noticeIfSlow', 200, 25);
  await expect(page.getByText('顯示中的角色有 25 位，盤面重畫變慢了').first()).toBeVisible();
  await hb(page, 'noticeIfSlow', 400, 60);
  await page.waitForTimeout(200);
  await expect(page.getByText(/有 60 位/)).toHaveCount(0);
  /* 滑鼠：沒有選取時的說明提到滾輪 */
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('board-help')).toContainText('滾輪');
  expect(errors).toEqual([]);
});

test.describe('觸控螢幕', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('操作說明與空盤面的文字換成觸控的說法', async ({ page }) => {
    const errors = await open(page, { seen: true });
    await expect(page.getByTestId('board-empty')).toContainText('選擇立繪圖片');
    await page.getByRole('tab', { name: '角色設定' }).click();
    await expect(page.getByTestId('board-help')).toContainText('兩指');
    expect(errors).toEqual([]);
  });
});

test('自動保存無法使用：提示可以關閉，旁邊可以直接存成專案檔', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'trpg-toolkit:height-board') throw new DOMException('blocked', 'SecurityError');
      return orig.call(this, k, v);
    };
  });
  const errors = await open(page, { seen: true });
  await addA(page);
  await expect(page.getByTestId('save-status')).toContainText('自動儲存無法使用');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('status').getByRole('button', { name: '存成專案檔' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^height-board_\d{8}-\d{4}\.zip$/);
  await page.getByRole('button', { name: '關閉這則提示' }).click();
  await expect(page.getByTestId('save-status')).toHaveCount(0);
  expect(errors).toEqual([]);
});
