/**
 * 魔法陣製作器（建置產物 tools/magic-circle/）的端對端測試：
 * - 開頁：沒有 console error、古典魔法陣範本、狀態列（F11、F12）。
 * - 繪圖：鋼筆（轉角、把手、閉合、雙擊）、手繪、直線、圓、橢圓、多邊形、星形、太小放棄、文字（F43～F50）。
 * - 選取與編輯：點選、多選、拖曳、控制點、刪除、再製、全選、復原／重做、方向鍵（F35～F42、F138）。
 * - 元素分頁：清單點選、顯示／鎖定、上移、對齊與分佈（F52～F63）。
 * - 樣式、形狀（盧恩）、動態、畫布分頁與範本（F64～F101）。
 * - 時間軸：自動排列、反轉、長條拖曳、點軌道、空白鍵播放（F102～F112、F128）。
 * - 匯出：PNG、靜態 WebP、GIF、APNG（解析檔案）、倍率、檔名（F113～F126、3.7）。
 * - 專案檔、舊版專案檔、自動儲存、舊版自動儲存的帶入（F09～F11、F137）。
 * - 390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { composeApng, decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('magic-circle') ?? { id: 'magic-circle', status: 'next' })}/`;

test.use({ viewport: { width: 1280, height: 900 } });

/* ---------- 共用 ---------- */

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
  await expect(page.getByRole('heading', { level: 1, name: '魔法陣製作器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __magicCircle?: unknown }).__magicCircle,
  );
  /* 等編輯畫面符合畫面 */
  await expect
    .poll(() => hook<{ zoom: number } | null>(page, '(mc) => mc.toClient(0, 0)'))
    .not.toBeNull();
  return errors;
}

const hook = <T>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) => {
      // biome-ignore lint/suspicious/noExplicitAny: 測試入口
      const mc = (window as any).__magicCircle;
      return new Function('mc', 'arg', `return (${f})(mc, arg)`)(mc, a);
    },
    [fn, arg] as const,
  ) as Promise<T>;

interface Pt {
  x: number;
  y: number;
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  smooth: boolean;
}
interface El {
  id: string;
  name: string;
  type: 'path' | 'circle' | 'text';
  visible: boolean;
  locked: boolean;
  symmetry: boolean;
  closed?: boolean;
  points?: Pt[];
  x?: number;
  y?: number;
  rx?: number;
  ry?: number;
  text?: string;
  style: Record<string, unknown> & { stroke: string; strokeWidth: number };
  animation: Record<string, unknown> & { mode: string; start: number; duration: number };
}
interface Proj {
  document: {
    name: string;
    width: number;
    height: number;
    transparent: boolean;
    background: string;
  };
  symmetry: { enabled: boolean; count: number; centerX: number; centerY: number };
  snap: Record<string, unknown>;
  animation: { duration: number; fps: number; plays: number };
  elements: El[];
}
interface Ui {
  tool: string;
  selected: string[];
  primary: string | null;
  node: { id: string; index: number } | null;
  status: string;
  tab: string;
}

const data = (page: Page) => hook<Proj>(page, '(mc) => mc.data()');
const ui = (page: Page) => hook<Ui>(page, '(mc) => mc.ui()');

/** 畫布座標 → 視窗座標 */
async function at(page: Page, x: number, y: number) {
  const p = await hook<{ x: number; y: number; zoom: number }>(
    page,
    '(mc, a) => mc.toClient(a[0], a[1])',
    [x, y],
  );
  return p;
}

/** 換成測試用的空白作品（對稱尺與吸附關閉） */
async function blank(page: Page, extra: Partial<Proj> = {}) {
  await hook(page, '(mc, p) => mc.replace(p)', {
    version: 2,
    document: {
      name: '測試',
      width: 1000,
      height: 1000,
      background: '#070A17',
      transparent: false,
    },
    symmetry: { enabled: false, count: 8, mirror: false, centerX: 500, centerY: 500, offset: 0 },
    snap: { enabled: false },
    animation: { duration: 4, fps: 24, loop: true },
    elements: [],
    ...extra,
  });
  await expect
    .poll(async () => (await data(page)).document.name)
    .toBe(extra.document?.name ?? '測試');
  await page.waitForTimeout(100);
}

const line = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Partial<El> = {},
) => ({
  id,
  name: id,
  type: 'path',
  symmetry: false,
  points: [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ],
  style: { strokeWidth: 0 },
  ...extra,
});

async function drag(page: Page, from: [number, number], to: [number, number], steps = 6) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

async function clickAt(page: Page, x: number, y: number) {
  const a = await at(page, x, y);
  await page.mouse.click(a.x, a.y);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function exportAs(page: Page, label: string) {
  await page.getByRole('radio', { name: label, exact: true }).click();
  await page.getByRole('button', { name: `匯出 ${label}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await download.path()) as string)),
  };
}

async function pauseAt(page: Page, t: number) {
  await hook(page, '(mc, t) => { mc.pause(); mc.seek(t); }', t);
  await expect.poll(() => hook<number>(page, '(mc) => mc.time()')).toBeCloseTo(t, 5);
}

/* ---------- 開頁 ---------- */

test('開頁：古典魔法陣範本、工具、狀態列', async ({ page }) => {
  const errors = await open(page);
  const d = await data(page);
  expect(d.document).toMatchObject({ name: '古典魔法陣', width: 1000, height: 1000 });
  expect(d.symmetry.count).toBe(12);
  expect(d.elements.map((e) => e.name)).toEqual([
    '外圈環',
    '外圈輔助線',
    '內圈環',
    '中央六芒圖樣',
    '放射盧恩裝飾',
    '放射寶石點',
    '中央核心',
  ]);
  const u = await ui(page);
  expect(u.tool).toBe('select');
  expect(u.selected).toEqual([d.elements[4].id]);
  await expect(page.getByTestId('status-message')).toHaveText(
    '準備就緒 · 可從鋼筆或手繪筆畫開始。',
  );
  await expect(page.getByTestId('selection-status')).toHaveText('放射盧恩裝飾 · 6 點');
  await expect(page.getByTestId('tool-name')).toHaveText('選取');
  await expect(page.getByTestId('empty-hint')).toHaveCount(0);
  /* 播放頭在結尾、縮放符合畫面 */
  expect(await hook<number>(page, '(mc) => mc.time()')).toBeCloseTo(4);
  const zoom = (await at(page, 0, 0)).zoom;
  await expect(page.getByTestId('zoom-label')).toHaveText(`${Math.round(zoom * 100)}%`);
  /* 工具快捷鍵 */
  await page.locator('body').press('p');
  await expect(page.getByTestId('tool-name')).toHaveText('貝茲鋼筆');
  await page.locator('body').press('b');
  await expect(page.getByTestId('tool-name')).toHaveText('手繪筆畫');
  await page.locator('body').press('h');
  await expect(page.getByTestId('tool-name')).toHaveText('平移畫面');
  await page.getByRole('button', { name: /^選取（/ }).click();
  await expect(page.getByTestId('tool-name')).toHaveText('選取');
  expect(errors).toEqual([]);
});

/* ---------- 繪圖 ---------- */

test('鋼筆：轉角、拖出把手、Enter 完成；點回起點閉合；雙擊完成', async ({ page }) => {
  const errors = await open(page);
  await blank(page);
  await page.locator('body').press('p');
  await clickAt(page, 200, 200);
  await clickAt(page, 400, 200);
  /* 第三點按住拖曳拉出把手 */
  await drag(page, [400, 400], [450, 400]);
  await page.keyboard.press('Enter');
  let d = await data(page);
  expect(d.elements).toHaveLength(1);
  const p = d.elements[0];
  expect(p).toMatchObject({ type: 'path', name: '魔法筆畫', closed: false, symmetry: true });
  expect(p.points).toHaveLength(3);
  expect(p.points?.[0].x).toBeCloseTo(200, 0);
  expect(p.points?.[2].outX).toBeCloseTo(450, 0);
  expect(p.points?.[2].inX).toBeCloseTo(350, 0);
  expect(p.points?.[2].smooth).toBe(true);
  expect(p.animation).toMatchObject({ mode: 'drawGlow', start: 0, duration: 1.1 });
  await expect(page.getByTestId('status-message')).toHaveText('已新增路徑。');
  expect((await ui(page)).node).toEqual({ id: p.id, index: 2 });

  /* 點回起點＝閉合 */
  await clickAt(page, 100, 600);
  await clickAt(page, 300, 600);
  await clickAt(page, 300, 800);
  await clickAt(page, 102, 601);
  d = await data(page);
  expect(d.elements).toHaveLength(2);
  expect(d.elements[1]).toMatchObject({ name: '封閉圖樣', closed: true });
  expect(d.elements[1].points).toHaveLength(3);
  /* 新元素的開始時間＝元素數 × 0.08 */
  expect(d.elements[1].animation.start).toBeCloseTo(0.08);

  /* 雙擊完成（開放） */
  await clickAt(page, 600, 100);
  const q = await at(page, 800, 100);
  await page.mouse.dblclick(q.x, q.y);
  d = await data(page);
  expect(d.elements).toHaveLength(3);
  expect(d.elements[2].points).toHaveLength(2);
  expect(d.elements[2].closed).toBe(false);

  /* 只有 1 點時完成＝放棄；Esc 取消 */
  await clickAt(page, 600, 600);
  await page.keyboard.press('Enter');
  await clickAt(page, 600, 700);
  await clickAt(page, 700, 700);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('status-message')).toHaveText('已取消繪製。');
  expect((await data(page)).elements).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('手繪、直線、圓、橢圓、多邊形、星形；太小時放棄', async ({ page }) => {
  const errors = await open(page);
  await blank(page);
  await page.locator('body').press('b');
  const pts: [number, number][] = [
    [100, 800],
    [200, 700],
    [300, 820],
    [400, 700],
    [500, 800],
  ];
  const s = await at(page, ...pts[0]);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    const c = await at(page, ...p);
    await page.mouse.move(c.x, c.y, { steps: 8 });
  }
  await page.mouse.up();
  let d = await data(page);
  expect(d.elements).toHaveLength(1);
  expect(d.elements[0]).toMatchObject({ name: '手繪筆畫', symmetry: false, type: 'path' });
  expect(d.elements[0].points?.length).toBeGreaterThanOrEqual(3);
  expect(d.elements[0].points?.every((p) => p.smooth)).toBe(true);
  expect(d.elements[0].animation).toMatchObject({ mode: 'drawGlow', duration: 1.25 });
  expect(d.elements[0].style).toMatchObject({ lineCap: 'round', lineJoin: 'round' });

  await page.locator('body').press('l');
  await drag(page, [100, 100], [300, 100]);
  await page.locator('body').press('o');
  await drag(page, [500, 500], [600, 500]);
  await page.keyboard.down('Alt');
  await drag(page, [100, 300], [300, 400]);
  await page.keyboard.up('Alt');
  await page.locator('body').press('g');
  await drag(page, [700, 300], [800, 300]);
  await page.locator('body').press('s');
  await drag(page, [700, 600], [700, 700]);
  /* 太小（1 螢幕 px）放棄 */
  const t = await at(page, 900, 900);
  await page.mouse.move(t.x, t.y);
  await page.mouse.down();
  await page.mouse.move(t.x + 1, t.y);
  await page.mouse.up();
  d = await data(page);
  expect(d.elements.map((e) => e.name)).toEqual([
    '手繪筆畫',
    '直線',
    '圓形',
    '橢圓',
    '6 邊形',
    '5 角星',
  ]);
  const [, ln, circle, ellipse, poly, star] = d.elements;
  expect(ln.points).toHaveLength(2);
  expect(ln.symmetry).toBe(true);
  expect(circle).toMatchObject({ type: 'circle', symmetry: false });
  expect(circle.rx).toBeCloseTo(100, 0);
  expect(circle.animation.mode).toBe('centerSpread');
  expect(ellipse.x).toBeCloseTo(200, 0);
  expect(ellipse.rx).toBeCloseTo(100, 0);
  expect(ellipse.ry).toBeCloseTo(50, 0);
  expect(poly).toMatchObject({ closed: true });
  expect(poly.points).toHaveLength(6);
  /* 第一個頂點在拖曳方向 */
  expect(poly.points?.[0].x).toBeCloseTo(800, 0);
  expect(star.points).toHaveLength(10);
  expect(star.points?.[0].y).toBeCloseTo(700, 0);
  expect(Math.hypot((star.points?.[1].x ?? 0) - 700, (star.points?.[1].y ?? 0) - 600)).toBeCloseTo(
    46,
    0,
  );
  expect(errors).toEqual([]);
});

test('文字工具：放一個 ᚱ、切到形狀分頁並聚焦內容', async ({ page }) => {
  const errors = await open(page);
  await blank(page);
  await page.locator('body').press('t');
  await clickAt(page, 500, 500);
  const d = await data(page);
  expect(d.elements[0]).toMatchObject({
    type: 'text',
    text: 'ᚱ',
    name: '盧恩文字',
    symmetry: false,
  });
  expect((await ui(page)).tool).toBe('select');
  await expect(page.getByRole('tab', { name: '形狀' })).toHaveAttribute('aria-selected', 'true');
  const content = page.locator('#mc-text-content');
  await expect(content).toBeFocused();
  await page.keyboard.type('ᛟᛟ');
  await expect.poll(async () => (await data(page)).elements[0].text).toBe('ᛟᛟ');
  expect(errors).toEqual([]);
});

/* ---------- 選取與編輯 ---------- */

test('點選、多選、拖曳、控制點、復原、刪除、再製、全選、方向鍵', async ({ page }) => {
  const errors = await open(page);
  await blank(page, {
    elements: [
      line('a', 100, 100, 300, 100, { style: { strokeWidth: 4 } } as Partial<El>),
      line('b', 100, 400, 300, 400, { style: { strokeWidth: 4 } } as Partial<El>),
      { id: 'c', name: 'c', type: 'circle', symmetry: false, x: 700, y: 700, rx: 100, ry: 100 },
    ] as unknown as El[],
  });
  await clickAt(page, 200, 100);
  expect((await ui(page)).selected).toEqual(['a']);
  await page.keyboard.down('Shift');
  await clickAt(page, 200, 400);
  await page.keyboard.up('Shift');
  expect((await ui(page)).selected.sort()).toEqual(['a', 'b']);
  await expect(page.getByTestId('selection-status')).toHaveText('已選取 2 個 · 基準：b');
  /* 拖曳 b：多選時一起移動 */
  await drag(page, [200, 400], [250, 450]);
  let d = await data(page);
  expect(d.elements[0].points?.[0].x).toBeCloseTo(150, 0);
  expect(d.elements[1].points?.[0].y).toBeCloseTo(450, 0);
  /* 復原一次回到拖曳前 */
  await page.locator('body').press('Control+z');
  d = await data(page);
  expect(d.elements[0].points?.[0].x).toBe(100);
  await page.locator('body').press('Control+y');
  expect((await data(page)).elements[0].points?.[0].x).toBeCloseTo(150, 0);
  await page.locator('body').press('Control+z');

  /* 點空白取消選取；點圓、拖 X 半徑點 */
  await clickAt(page, 900, 100);
  expect((await ui(page)).selected).toEqual([]);
  await clickAt(page, 700, 600);
  expect((await ui(page)).primary).toBe('c');
  await drag(page, [800, 700], [850, 700]);
  expect((await data(page)).elements[2].rx).toBeCloseTo(150, 0);

  /* 方向鍵微調（焦點在編輯畫面） */
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  d = await data(page);
  expect(d.elements[2]).toMatchObject({ x: 701, y: 710 });

  /* 再製：+18、+18，名稱「複本」，開始時間 +0.1 */
  await page.keyboard.press('Control+d');
  d = await data(page);
  expect(d.elements).toHaveLength(4);
  expect(d.elements[3]).toMatchObject({ name: 'c 複本', x: 719, y: 728 });
  expect(d.elements[3].animation.start).toBeCloseTo(0.1);
  expect((await ui(page)).selected).toEqual([d.elements[3].id]);
  /* 刪除 */
  await page.keyboard.press('Delete');
  await expect(page.getByText('已刪除元素「c 複本」。', { exact: true })).toBeVisible();
  expect((await data(page)).elements).toHaveLength(3);
  /* 全選可編輯 */
  await page.keyboard.press('Control+a');
  expect((await ui(page)).selected).toHaveLength(3);
  await expect(page.getByText('已選取 3 個可編輯的元素。', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await ui(page)).selected).toEqual([]);
  expect(errors).toEqual([]);
});

test('元素分頁：清單點選、範圍、顯示與鎖定、上移、對齊與分佈', async ({ page }) => {
  const errors = await open(page);
  await blank(page, {
    elements: [
      line('a', 100, 100, 200, 100),
      line('b', 250, 300, 350, 300),
      line('c', 700, 500, 900, 500),
    ] as unknown as El[],
  });
  const names = page.getByTestId('layer-name');
  await expect(names).toHaveCount(3);
  await expect(names.first()).toContainText('c');
  await names.nth(2).click();
  expect((await ui(page)).selected).toEqual(['a']);
  await names.nth(0).click({ modifiers: ['Shift'] });
  expect((await ui(page)).selected.sort()).toEqual(['a', 'b', 'c']);
  await expect(page.getByTestId('align-count')).toHaveText('已選取 3 個');
  /* 靠左（畫布） */
  await page.locator('[data-align="align-left"]').click();
  let d = await data(page);
  expect(d.elements.map((e) => e.points?.[0].x)).toEqual([0, 0, 0]);
  await expect(page.getByTestId('status-message')).toHaveText(
    '已將 3 個元素以畫布為基準靠左對齊。',
  );
  /* 水平等距分佈：首尾不動 */
  await page.locator('body').press('Control+z');
  await page.locator('[data-align="distribute-x"]').click();
  d = await data(page);
  expect(d.elements[1].points?.[0].x).toBeCloseTo(400, 0);
  /* 鎖定 c 之後只算可移動 */
  await page.getByRole('button', { name: '鎖定「c」' }).click();
  await expect(page.getByTestId('align-count')).toHaveText('已選取 3 個 · 可移動 2 個');
  await page.getByRole('button', { name: '隱藏「b」' }).click();
  d = await data(page);
  expect(d.elements[1].visible).toBe(false);
  expect(d.elements[2].locked).toBe(true);
  /* 基準元素上移（a → 第二層） */
  await names.nth(2).click();
  await page.getByRole('button', { name: '基準元素上移' }).click();
  d = await data(page);
  expect(d.elements.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  expect(errors).toEqual([]);
});

test('樣式、形狀（盧恩）、動態、畫布分頁', async ({ page }) => {
  const errors = await open(page);
  await blank(page, {
    elements: [
      line('a', 100, 100, 200, 100),
      { id: 't', name: 't', type: 'text', x: 500, y: 500, text: 'X', symmetry: false },
    ] as unknown as El[],
  });
  /* 未選取時的提示 */
  await hook(page, '(mc) => mc.select([])');
  await page.getByRole('tab', { name: '樣式' }).click();
  await expect(page.getByText('請選取要調整樣式的元素。', { exact: true })).toBeVisible();
  await hook(page, '(mc) => mc.select(["a"])');
  await page.getByRole('spinbutton', { name: '線條粗細' }).fill('12');
  await page.getByRole('spinbutton', { name: '線條粗細' }).press('Enter');
  await expect.poll(async () => (await data(page)).elements[0].style.strokeWidth).toBe(12);
  await page.getByRole('button', { name: '聖光金輝' }).click();
  let d = await data(page);
  expect(d.elements[0].style).toMatchObject({ stroke: '#ffe59a', glowBlur: 32, strokeWidth: 5 });
  await page.getByLabel('虛線').fill('20, 10');
  await expect.poll(async () => (await data(page)).elements[0].style.dash).toEqual([20, 10]);

  /* 動態預設、效果 */
  await page.getByRole('tab', { name: '動態' }).click();
  await page.getByRole('button', { name: '消散' }).click();
  d = await data(page);
  expect(d.elements[0].animation).toMatchObject({
    mode: 'fadeOut',
    easing: 'easeIn',
    holdAfter: false,
  });

  /* 形狀：盧恩 */
  await hook(page, '(mc) => mc.select(["t"])');
  await page.getByRole('tab', { name: '形狀' }).click();
  await expect(page.getByTestId('rune-status')).toHaveText('古弗薩克 · 顯示 24 字');
  await page.locator('#mc-text-content').click();
  await page.locator('#mc-text-content').press('End');
  await page.locator('button[data-rune="ᚠ"]').click();
  await expect.poll(async () => (await data(page)).elements[1].text).toBe('Xᚠ');
  await page.getByRole('searchbox', { name: '搜尋' }).fill('奧薩拉');
  await expect(page.getByTestId('rune-status')).toHaveText('古弗薩克 · 顯示 1 字');
  await page.getByLabel('拉丁字母近似轉換').fill('futhark, thing');
  await expect(page.getByTestId('rune-result')).toHaveText('ᚠᚢᚦᚨᚱᚲ, ᚦᛁᛜ');
  await page.getByRole('button', { name: '取代內容' }).click();
  await expect.poll(async () => (await data(page)).elements[1].text).toBe('ᚠᚢᚦᚨᚱᚲ, ᚦᛁᛜ');

  /* 畫布：寬度改變時對稱中心跟著移到正中央 */
  await page.getByRole('tab', { name: '畫布' }).click();
  await page.getByRole('spinbutton', { name: '寬度' }).fill('1200');
  await page.getByRole('spinbutton', { name: '寬度' }).press('Enter');
  await expect.poll(async () => (await data(page)).symmetry.centerX).toBe(600);
  /* 旋轉起始角可以有小數（8 份時半個扇形是 22.5°，F99） */
  await page.getByRole('spinbutton', { name: '旋轉起始角' }).fill('22.5');
  await page.getByRole('spinbutton', { name: '旋轉起始角' }).press('Enter');
  await expect.poll(async () => (await data(page)).symmetry.offset).toBe(22.5);
  /* 範本：盧恩輪 */
  await page
    .getByRole('button', { name: /盧恩輪/ })
    .first()
    .click();
  await expect.poll(async () => (await data(page)).document.name).toBe('盧恩輪');
  await expect(page.getByText('已載入盧恩輪範本。', { exact: true })).toBeVisible();
  await expect.poll(() => hook<number>(page, '(mc) => mc.time()')).toBeCloseTo(4);
  /* 可以復原回範本前 */
  await page.locator('body').press('Control+z');
  await expect.poll(async () => (await data(page)).document.name).toBe('測試');
  expect(errors).toEqual([]);
});

/* ---------- 時間軸 ---------- */

test('時間軸：自動排列、反轉、拖曳長條、點軌道、空白鍵播放', async ({ page }) => {
  const errors = await open(page);
  await blank(page, {
    elements: [
      line('a', 100, 100, 200, 100),
      line('b', 300, 300, 400, 300),
      { ...line('c', 700, 500, 900, 500), animation: { mode: 'none' } },
    ] as unknown as El[],
  });
  await page.getByRole('button', { name: '依圖層排序' }).click();
  let d = await data(page);
  const step = 4 / 3.5;
  expect(d.elements.map((e) => e.animation.start)).toEqual([
    0,
    Math.round(step * 1000) / 1000,
    Math.round(2 * step * 1000) / 1000,
  ]);
  expect(d.elements[2].animation.mode).toBe('drawGlow');
  await page.getByRole('button', { name: '反轉順序' }).click();
  d = await data(page);
  expect(d.elements[0].animation.start).toBeCloseTo(4 - d.elements[0].animation.duration, 3);

  /* 拖曳 a 的長條中段：開始時間往後 */
  await page.locator('body').press('Control+z');
  await page.locator('body').press('Control+z');
  const track = page.locator('[data-track="a"]');
  await track.scrollIntoViewIfNeeded();
  const tb = (await track.boundingBox())!;
  const bar = page.locator('[data-bar="a"]');
  const bb = (await bar.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 + tb.width / 4, bb.y + bb.height / 2, { steps: 5 });
  await page.mouse.up();
  d = await data(page);
  expect(d.elements[0].animation.start).toBeCloseTo(1, 1);
  expect((await ui(page)).selected).toEqual(['a']);
  /* 右端：改持續 */
  const bb2 = (await bar.boundingBox())!;
  await page.mouse.move(bb2.x + bb2.width - 2, bb2.y + bb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb2.x + bb2.width - 2 + tb.width / 8, bb2.y + bb2.height / 2, { steps: 4 });
  await page.mouse.up();
  const dur = (await data(page)).elements[0].animation.duration;
  expect(dur).toBeGreaterThan(d.elements[0].animation.duration + 0.4);

  /* 點軌道空白處：跳到那個時間 */
  await page.locator('[data-track="b"]').scrollIntoViewIfNeeded();
  const tc = (await page.locator('[data-track="b"]').boundingBox())!;
  await page.mouse.click(tc.x + tc.width * 0.995, tc.y + 3);
  await expect.poll(() => hook<number>(page, '(mc) => mc.time()')).toBeGreaterThan(3.9);

  /* 空白鍵：播放／暫停 */
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect.poll(() => hook<boolean>(page, '(mc) => mc.playing()')).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => hook<boolean>(page, '(mc) => mc.playing()')).toBe(false);
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出：PNG（播放頭的畫面）、靜態 WebP、倍率、檔名', async ({ page }) => {
  const errors = await open(page);
  await pauseAt(page, 4);
  const png = await exportAs(page, 'PNG');
  expect(png.name).toBe('古典魔法陣-4.00s.png');
  const chunks = parseChunks(png.bytes);
  const ihdr = readIhdr(chunks);
  expect([ihdr.width, ihdr.height]).toEqual([1000, 1000]);
  /* 角落是背景色、中央核心是亮的 */
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const z = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of idat) {
    z.set(c, o);
    o += c.length;
  }
  const px = decodePixels(z, 1000, 1000, ihdr.colorType);
  const pixel = (x: number, y: number) =>
    Array.from(px.subarray((y * 1000 + x) * 4, (y * 1000 + x) * 4 + 4));
  expect(pixel(5, 5)).toEqual([7, 10, 23, 255]);
  expect(
    pixel(500, 500)
      .slice(0, 3)
      .reduce((a, b) => a + b),
  ).toBeGreaterThan(150);

  /* 倍率 50% */
  await page.getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^50%/ }).click();
  await pauseAt(page, 1.5);
  const half = await exportAs(page, 'PNG');
  expect(half.name).toBe('古典魔法陣-1.50s.png');
  expect(readIhdr(parseChunks(half.bytes))).toMatchObject({ width: 500, height: 500 });

  const webp = await exportAs(page, '靜態 WebP');
  expect(webp.name).toBe('古典魔法陣-1.50s.webp');
  expect(String.fromCharCode(...webp.bytes.subarray(0, 4))).toBe('RIFF');
  expect(String.fromCharCode(...webp.bytes.subarray(8, 12))).toBe('WEBP');
  expect(errors).toEqual([]);
});

test('匯出：GIF、APNG（影格數、延遲、循環、透明背景）', async ({ page }) => {
  const errors = await open(page);
  /* 長度 1 秒、10 FPS */
  await page.getByRole('spinbutton', { name: '長度' }).fill('1');
  await page.getByRole('spinbutton', { name: '長度' }).press('Enter');
  await page.getByRole('radio', { name: 'GIF', exact: true }).click();
  const fps = page.getByRole('spinbutton', { name: 'FPS' }).last();
  await fps.fill('10');
  await fps.press('Enter');
  await expect
    .poll(async () => (await data(page)).animation)
    .toMatchObject({ duration: 1, fps: 10 });
  await expect(page.getByTestId('export-estimate')).toContainText('10 格');
  const gif = await exportAs(page, 'GIF');
  expect(gif.name).toBe('古典魔法陣.gif');
  const info = parseGif(gif.bytes);
  expect([info.width, info.height]).toEqual([1000, 1000]);
  expect(info.loopCount).toBe(0);
  expect(info.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(100);

  /* APNG：透明背景、只播一次 */
  await page.getByRole('radio', { name: 'APNG', exact: true }).click();
  await page.getByRole('switch', { name: '無限循環' }).click();
  await page.getByRole('switch', { name: '以透明背景儲存' }).click();
  await expect.poll(async () => (await data(page)).document.transparent).toBe(true);
  await expect.poll(async () => (await data(page)).animation.plays).toBe(1);
  const apng = await exportAs(page, 'APNG');
  expect(apng.name).toBe('古典魔法陣.png');
  const a = parseApng(apng.bytes);
  expect(a.numPlays).toBe(1);
  expect(a.ihdr).toMatchObject({ width: 1000, height: 1000 });
  const total = a.frames.reduce((s, f) => s + f.delayNum / (f.delayDen || 100), 0);
  expect(total).toBeCloseTo(1, 2);
  /* 第一格（t＝0）：背景透明 */
  const frames = composeApng(a);
  expect(frames[0][3]).toBe(0);
  expect(errors).toEqual([]);
});

/* ---------- 專案檔、自動儲存 ---------- */

test('專案檔：儲存（Ctrl＋S）、新的空白作品、開啟、舊版專案檔', async ({ page }) => {
  const errors = await open(page);
  const [saved] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('body').press('Control+s'),
  ]);
  expect(saved.suggestedFilename()).toMatch(/^古典魔法陣-\d{8}-\d{4}\.arcana\.json$/);
  const savedPath = (await saved.path()) as string;
  const json = JSON.parse(readFileSync(savedPath, 'utf8'));
  expect(json).toMatchObject({ format: 'trpg-toolkit-project', tool: 'magic-circle', version: 1 });
  expect(json.data.elements).toHaveLength(7);
  await expect(page.getByText('已儲存專案 JSON。', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '新的空白魔法陣…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '建立' }).click();
  await expect.poll(async () => (await data(page)).elements.length).toBe(0);
  await expect(page.getByTestId('empty-hint')).toBeVisible();
  const d = await data(page);
  expect(d.document).toMatchObject({ name: '新魔法陣', width: 1000, background: '#070a17' });
  expect(d.symmetry).toMatchObject({ enabled: true, count: 8 });

  await page.getByRole('button', { name: '專案' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles(savedPath);
  await expect.poll(async () => (await data(page)).elements.length).toBe(7);
  await expect(page.getByText('已載入專案。', { exact: true })).toBeVisible();

  /* 舊版的 .arcana.json */
  const legacy = {
    version: 2,
    document: { name: 'Old', width: 800, height: 600, background: '#112233', transparent: true },
    symmetry: { enabled: true, count: 5, mirror: true, centerX: 400, centerY: 300, offset: 10 },
    snap: { enabled: true },
    animation: { duration: 2, fps: 12, loop: false, playhead: 0.5 },
    elements: [{ id: 'x1', name: 'x1', type: 'circle', x: 400, y: 300, rx: 50, ry: 50 }],
    selectedId: 'x1',
  };
  await page.getByRole('button', { name: '專案' }).click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟舊版專案檔（.arcana.json）…' }).click(),
  ]);
  await chooser2.setFiles({
    name: 'old.arcana.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect.poll(async () => (await data(page)).document.name).toBe('Old');
  const l = await data(page);
  expect(l.animation).toEqual({ duration: 2, fps: 12, plays: 1 });
  expect(l.symmetry).toMatchObject({ count: 5, mirror: true, offset: 10 });
  expect((await ui(page)).selected).toEqual(['x1']);
  expect(await hook<number>(page, '(mc) => mc.time()')).toBeCloseTo(0.5);
  expect(errors).toEqual([]);
});

test('自動儲存：重新整理後還原', async ({ page }) => {
  const errors = await open(page);
  await hook(page, '(mc) => mc.select([mc.data().elements[0].id])');
  await page.locator('body').press('Delete');
  await expect.poll(async () => (await data(page)).elements.length).toBe(6);
  await pauseAt(page, 1.25);
  await page.reload();
  await page.waitForFunction(
    () => !!(window as unknown as { __magicCircle?: unknown }).__magicCircle,
  );
  await expect.poll(async () => (await data(page)).elements.length).toBe(6);
  await expect(page.getByText('已還原自動儲存的內容。', { exact: true })).toBeVisible();
  await expect(page.getByTestId('status-message')).toHaveText('已還原自動儲存的專案。');
  await expect.poll(() => hook<number>(page, '(mc) => mc.time()')).toBeCloseTo(1.25);
  expect(errors).toEqual([]);
});

test('舊版的自動儲存在第一次開啟時帶入', async ({ page }) => {
  const legacy = {
    version: 2,
    document: {
      name: '舊作品',
      width: 900,
      height: 900,
      background: '#000000',
      transparent: false,
    },
    symmetry: { enabled: true, count: 6, mirror: false, centerX: 450, centerY: 450, offset: 0 },
    snap: {},
    animation: { duration: 3, fps: 24, loop: true, playhead: 2 },
    elements: [{ id: 'k', name: 'k', type: 'circle', x: 450, y: 450, rx: 100, ry: 100 }],
    selectedId: 'k',
  };
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('magic-circle-maker-autosave-v2', raw);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(legacy));
  const errors = await open(page);
  await expect.poll(async () => (await data(page)).document.name).toBe('舊作品');
  await expect(page.getByText('已帶入舊版自動儲存的作品。', { exact: true })).toBeVisible();
  expect((await data(page)).elements.map((e) => e.id)).toEqual(['k']);
  await expect.poll(() => hook<number>(page, '(mc) => mc.time()')).toBeCloseTo(2);
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  async function prepare(page: Page) {
    await pauseAt(page, 4);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('magic-circle-1280.png', { mask: masks(page) });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('magic-circle-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
