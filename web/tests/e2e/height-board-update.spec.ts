/**
 * 立繪身高比較板：跟進原作 2026-10 更新（規格 1.2 節，F57 起）的端對端測試——
 * - 頭頂／腳底線拖到圖外（身高換算、滑桿停在端點、數值照實顯示、復原、重新整理後還在）；
 * - 兩指縮放與平移（CDP 觸控）、一指拖角色時放第二指回原位；
 * - 手機（390）分頁與收合、平板直向（800 × 1100）並排與收合、收合記住；
 * - 清單長按排序（CDP 觸控）；
 * - 原作的 .hboard：拖到盤面開啟、從「專案」開啟、損壞與版本；
 * - 不是圖片的檔案提示檔名、批次對話框的「會加入 n 位」；
 * - 桌面：設定欄寬度拖曳（記住、按兩下回預設、方向鍵）、「選取的角色」收合（標題帶名稱、記住）；
 * - 名稱 NFC、篩選 NFKC；空盤面不顯示篩選列（F83）；拖進專案檔時顯示讀取中（F84）；
 * - 開頁時圖片讀不到（資料庫少一張圖、資料庫暫時打不開）：角色留著、標示並提示，下次開頁讀得到就回來（D8，驗證後修正）。
 */
import { type CDPSession, expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import type { BoardData, Geometry } from '../../src/tools/height-board/logic';

const URL = `/${outputDir(getTool('height-board') ?? { id: 'height-board', status: 'next' })}/`;

test.use({ viewport: { width: 1280, height: 900 } });

/* ---------- 測試圖 ---------- */

type Rgb = [number, number, number];

async function pngOf(w: number, h: number, box: [number, number, number, number], c: Rgb) {
  const px = new Uint8Array(w * h * 4);
  const [x0, y0, bw, bh] = box;
  for (let y = y0; y < y0 + bh; y++)
    for (let x = x0; x < x0 + bw; x++) px.set([...c, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** A＝200 × 400，內容 100 × 300 位於 (50, 60)（規格 3.1） */
const imgA = () => pngOf(200, 400, [50, 60, 100, 300], [220, 60, 60]);
/** B＝300 × 300，內容 150 × 200 */
const imgB = () => pngOf(300, 300, [75, 50, 150, 200], [40, 140, 220]);

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/** 照原作的格式組一個 .hboard（"THB1"＋中繼資料長度＋JSON＋圖片） */
function hboard(
  recs: {
    name: string;
    heightCm: number;
    x: number;
    z: number;
    topRatio?: number;
    bottomRatio?: number;
    hidden?: boolean;
    png: Buffer;
  }[],
  version = 1,
): Buffer {
  const meta = {
    version,
    chars: recs.map((r, i) => ({
      id: `c${i}`,
      name: r.name,
      heightCm: r.heightCm,
      x: r.x,
      z: r.z,
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      topRatio: r.topRatio ?? 0,
      bottomRatio: r.bottomRatio ?? 1,
      hidden: !!r.hidden,
      srcW: 1,
      srcH: 1,
      blobType: 'image/png',
      blobSize: r.png.length,
    })),
  };
  const json = Buffer.from(JSON.stringify(meta), 'utf8');
  const head = Buffer.alloc(8);
  head.write('THB1', 0, 'ascii');
  head.writeUInt32LE(json.length, 4);
  return Buffer.concat([head, json, ...recs.map((r) => r.png)]);
}

/* ---------- 頁面操作 ---------- */

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  /* 操作導覽另外測（height-board-tour.spec.ts）：這裡當成看過了 */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('trpg-toolkit:height-board:tour-seen', '1');
    } catch {
      /* 不能存就算了 */
    }
  });
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
const geos = (page: Page) => hb<(Geometry & { id: string; name: string })[]>(page, 'geometry');
const view = (page: Page) =>
  hb<{ zoom: number; scale: number; scrollX: number; scrollY: number }>(page, 'view');
const history = (page: Page) => hb<{ past: number; future: number }>(page, 'history');
const screenOf = (page: Page, x: number, h: number) =>
  hb<{ x: number; y: number } | null>(page, 'toScreen', x, h);
const worldOf = (page: Page, cx: number, cy: number) =>
  hb<{ x: number; h: number } | null>(page, 'toWorld', cx, cy);

const board = (page: Page) => page.getByTestId('pan-zoom-viewport');
const canvas = (page: Page) => board(page).locator('section canvas');
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const list = (page: Page) => page.getByRole('list', { name: '角色清單（上面的在前面）' });
const rows = (page: Page) => list(page).locator(':scope > li');

async function choose(page: Page, files: ReturnType<typeof file>[]) {
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '選擇圖片…').click(),
  ]);
  await fc.setFiles(files);
}

async function addMany(page: Page, files: ReturnType<typeof file>[], heights: number[]) {
  const n = (await chars(page)).length;
  await choose(page, files);
  if (files.length === 1) {
    const d = page.getByRole('dialog', { name: '加入角色' });
    await d.getByRole('spinbutton', { name: '身高' }).fill(String(heights[0]));
    await d.getByRole('button', { name: '加入', exact: true }).click();
  } else {
    const d = page.getByRole('dialog', { name: `加入 ${files.length} 張圖片` });
    for (let i = 0; i < files.length; i++)
      await d.getByRole('spinbutton', { name: `第 ${i + 1} 張的身高` }).fill(String(heights[i]));
    await d.getByRole('button', { name: '加入', exact: true }).click();
  }
  await expect.poll(async () => (await chars(page)).length).toBe(n + files.length);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
  await page.mouse.up();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 拖放：在 target 上放開 files（名稱、類型、內容） */
async function dropFiles(
  page: Page,
  target: { x: number; y: number },
  files: { name: string; type: string; base64: string }[],
) {
  const dt = await page.evaluateHandle((files) => {
    const dt = new DataTransfer();
    for (const f of files)
      dt.items.add(
        new File([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], f.name, {
          type: f.type,
        }),
      );
    return dt;
  }, files);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: dt });
  await canvas(page).dispatchEvent('drop', {
    dataTransfer: dt,
    clientX: target.x,
    clientY: target.y,
  });
}

/* ---------- CDP 觸控 ---------- */

type Pt = { x: number; y: number; id: number };
const touchEvent = (cdp: CDPSession, type: string, points: Pt[]) =>
  cdp.send('Input.dispatchTouchEvent', {
    type: type as 'touchStart',
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 1, radiusY: 1 })),
  });

/* ======================================================================= */

test('線拖到圖外：頭頂線到圖的上方、腳底線到圖的下方（換算、數值、滑桿停在端點、復原、重新整理後還在）', async ({
  page,
}) => {
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA())], [160]);
  const [g0] = await geos(page);
  const cx = g0.box.x + g0.width / 2;
  /* 頭頂線（160 cm）往上拖 40 cm（凍結比例：圖高 160 cm → −25%） */
  const from = await screenOf(page, cx, 160);
  const to = await screenOf(page, cx, 200);
  if (!from || !to) throw new Error('no screen');
  await drag(page, from, 0, to.y - from.y);
  let [c] = await chars(page);
  expect(c.top).toBeCloseTo(-25, 0);
  /* 兩線之間仍是身高：圖變小（上緣約 128 cm、寬約 42.67 cm） */
  let [g] = await geos(page);
  expect(g.imageTop).toBeCloseTo((160 * 100) / (100 - c.top), 3);
  expect(g.imageTop + (-c.top / 100) * g.box.height).toBeCloseTo(160, 3);
  /* 設定面板：數值照實顯示、滑桿停在端點 */
  const panel = page.getByTestId('character-panel');
  await expect(panel).toContainText(`${c.top.toFixed(1)}%`);
  await expect(panel.getByRole('slider').first()).toHaveAttribute('aria-valuenow', '0');
  /* 一步復原 */
  expect((await history(page)).past).toBe(2);
  /* 往上拖很遠：最多到 −100%（圖的上方一張圖高） */
  const head = await screenOf(page, cx, 160);
  if (!head) throw new Error('no screen');
  await drag(page, head, 0, -head.y + 2);
  [c] = await chars(page);
  expect(c.top).toBeGreaterThanOrEqual(-100);
  expect(c.top).toBeLessThan(-25);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  [c] = await chars(page);
  expect(c.top).toBe(0);
  /* 腳底線（0 cm）往下拖：圖浮起來（下緣高於地面） */
  const foot = await screenOf(page, cx, 0);
  if (!foot) throw new Error('no screen');
  await drag(page, foot, 0, 120);
  [c] = await chars(page);
  expect(c.bottom).toBeGreaterThan(100);
  [g] = await geos(page);
  expect(g.imageBottom).toBeGreaterThan(0);
  expect(g.imageTop - g.imageBottom).toBeCloseTo(g.box.height, 3);
  await expect(panel).toContainText(`${c.bottom.toFixed(1)}%`);
  await expect(panel.getByRole('slider').nth(1)).toHaveAttribute('aria-valuenow', '100');
  /* 盤面下緣仍是地面（沒有圖沉到地面以下） */
  expect((await hb<{ bottom: number }>(page, 'range')).bottom).toBe(0);
  /* 重新整理後還在 */
  const saved = c.bottom;
  await hb(page, 'flush');
  await page.reload();
  await expect.poll(async () => (await chars(page)).length).toBe(1);
  expect((await chars(page))[0].bottom).toBeCloseTo(saved, 6);
  /* 兩條線歸位 */
  await rows(page).nth(0).click();
  await btn(page, '兩條線歸位').click();
  expect((await chars(page))[0]).toMatchObject({ top: 0, bottom: 100 });
  expect(errors).toEqual([]);
});

test.describe('觸控', () => {
  test.use({ hasTouch: true });

  test('兩指縮放與平移；一指拖角色時放上第二指 → 角色回原位、不記復原步驟', async ({ page }) => {
    const errors = await open(page);
    await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
    const cdp = await page.context().newCDPSession(page);
    /* 角色上方的空白處（盤面內容的範圍裡）：兩指從中點往外張開 */
    const mid = await screenOf(page, 60, 170);
    if (!mid) throw new Error('no screen');
    const w0 = await worldOf(page, mid.x, mid.y);
    if (!w0) throw new Error('no world');
    const z0 = (await view(page)).zoom;
    const xs = (await chars(page)).map((c) => c.x);
    await touchEvent(cdp, 'touchStart', [{ x: mid.x - 40, y: mid.y, id: 0 }]);
    await touchEvent(cdp, 'touchStart', [
      { x: mid.x - 40, y: mid.y, id: 0 },
      { x: mid.x + 40, y: mid.y, id: 1 },
    ]);
    for (let i = 1; i <= 5; i++) {
      const d = 40 + i * 8;
      /* 兩指一起往下移 30 px（平移） */
      await touchEvent(cdp, 'touchMove', [
        { x: mid.x - d, y: mid.y + i * 6, id: 0 },
        { x: mid.x + d, y: mid.y + i * 6, id: 1 },
      ]);
    }
    /* 放開一指（CDP 的 touchEnd 列出放開的手指） */
    await touchEvent(cdp, 'touchEnd', [{ x: mid.x + 80, y: mid.y + 30, id: 1 }]);
    /* 捏合後剩下的一指移動不會開始別的操作 */
    await touchEvent(cdp, 'touchMove', [{ x: mid.x - 120, y: mid.y + 30, id: 0 }]);
    await touchEvent(cdp, 'touchEnd', []);
    const v = await view(page);
    expect(v.zoom / z0).toBeCloseTo(80 / 40, 1);
    /* 開始時中點下的點跟著中點走（往下 30 px） */
    const p = await screenOf(page, w0.x, w0.h);
    if (!p) throw new Error('no screen');
    expect(Math.abs(p.x - mid.x)).toBeLessThan(3);
    expect(Math.abs(p.y - (mid.y + 30))).toBeLessThan(3);
    expect((await chars(page)).map((c) => c.x)).toEqual(xs);
    expect((await view(page)).zoom).toBeCloseTo(v.zoom, 6);

    /* 一指拖 A 再放第二指：A 回原位，沒有多一步復原 */
    await page.getByTestId('zoom').click();
    await expect(page.getByTestId('zoom')).toHaveText('100%');
    const past = (await history(page)).past;
    const [ga] = await geos(page);
    const a = await screenOf(page, ga.box.x + ga.width / 2, ga.imageTop / 2);
    if (!a) throw new Error('no screen');
    const x0 = (await chars(page))[0].x;
    await touchEvent(cdp, 'touchStart', [{ x: a.x, y: a.y, id: 0 }]);
    for (let i = 1; i <= 4; i++)
      await touchEvent(cdp, 'touchMove', [{ x: a.x + i * 15, y: a.y, id: 0 }]);
    await expect.poll(async () => (await chars(page))[0].x).toBeGreaterThan(x0 + 5);
    await touchEvent(cdp, 'touchStart', [
      { x: a.x + 60, y: a.y, id: 0 },
      { x: a.x + 160, y: a.y + 40, id: 1 },
    ]);
    await expect.poll(async () => (await chars(page))[0].x).toBe(x0);
    await touchEvent(cdp, 'touchEnd', [{ x: a.x + 160, y: a.y + 40, id: 1 }]);
    await touchEvent(cdp, 'touchEnd', []);
    expect((await chars(page))[0].x).toBe(x0);
    expect((await history(page)).past).toBe(past);
    expect(errors).toEqual([]);
  });

  test('清單長按排序：按住約 0.4 秒再上下移動 → 調整前後順序（一步復原）；直接滑動不排序', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await addMany(
      page,
      [file('甲.png', await imgA()), file('乙.png', await imgB()), file('丙.png', await imgA())],
      [150, 120, 160],
    );
    await expect(rows(page).nth(0)).toContainText('丙');
    const cdp = await page.context().newCDPSession(page);
    const name = async (i: number) => {
      await rows(page).nth(2).scrollIntoViewIfNeeded();
      const r = await rows(page).nth(i).locator('span.truncate').boundingBox();
      if (!r) throw new Error('no row');
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    /* 直接滑動（沒有按住）：捲動頁面，不排序 */
    const s0 = await name(0);
    await touchEvent(cdp, 'touchStart', [{ ...s0, id: 0 }]);
    for (let i = 1; i <= 5; i++)
      await touchEvent(cdp, 'touchMove', [{ x: s0.x, y: s0.y - i * 12, id: 0 }]);
    await touchEvent(cdp, 'touchEnd', []);
    expect((await chars(page)).map((c) => c.name)).toEqual(['甲', '乙', '丙']);
    /* 按住 0.5 秒後往下移到第 3 列 */
    const past = (await history(page)).past;
    const p0 = await name(0);
    const p2 = await name(2);
    await touchEvent(cdp, 'touchStart', [{ ...p0, id: 0 }]);
    await page.waitForTimeout(550);
    for (let i = 1; i <= 8; i++)
      await touchEvent(cdp, 'touchMove', [
        { x: p0.x, y: p0.y + ((p2.y + 12 - p0.y) * i) / 8, id: 0 },
      ]);
    await touchEvent(cdp, 'touchEnd', []);
    expect((await chars(page)).map((c) => c.name)).toEqual(['丙', '甲', '乙']);
    expect((await history(page)).past).toBe(past + 1);
    /* 點一下：選取、換到「角色設定」分頁 */
    const q = await name(0);
    await touchEvent(cdp, 'touchStart', [{ ...q, id: 0 }]);
    await touchEvent(cdp, 'touchEnd', []);
    await expect(page.getByRole('tab', { name: '角色設定' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(errors).toEqual([]);
  });
});

test('手機（390）：「角色清單／角色設定」分頁、選取時換到設定、收合（記住、盤面變高）', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
  const tabList = page.getByRole('tab', { name: /角色清單/ });
  const tabDetail = page.getByRole('tab', { name: '角色設定' });
  await expect(tabList).toHaveAttribute('aria-selected', 'true');
  await expect(tabList).toContainText('2 位');
  await expect(list(page)).toBeVisible();
  await expect(page.getByTestId('character-panel')).toBeHidden();
  /* 加入後不換分頁；點清單的列 → 換到「角色設定」 */
  await rows(page).nth(1).click();
  await expect(tabDetail).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('character-panel')).toBeVisible();
  await expect(list(page)).toBeHidden();
  await tabList.click();
  await expect(list(page)).toBeVisible();
  /* 收合：只留分頁列，盤面變高；重新整理後仍收合 */
  const h0 = (await board(page).boundingBox())?.height ?? 0;
  await page.getByTestId('panel-toggle').click();
  await expect(list(page)).toBeHidden();
  await expect(page.getByTestId('panel-toggle')).toHaveAttribute('aria-expanded', 'false');
  const h1 = (await board(page).boundingBox())?.height ?? 0;
  expect(h1).toBeGreaterThan(h0 + 100);
  await noHorizontalScroll(page);
  await page.reload();
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  await expect(page.getByTestId('panel-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(list(page)).toBeHidden();
  /* 點分頁 → 展開 */
  await tabList.click();
  await expect(list(page)).toBeVisible();
  await expect(page.getByTestId('panel-toggle')).toHaveAttribute('aria-expanded', 'true');
  /* 在盤面上點角色 → 換到「角色設定」 */
  const [g] = await geos(page);
  const p = await screenOf(page, g.box.x + g.width / 2, g.imageTop / 2);
  if (!p) throw new Error('no screen');
  await page.mouse.click(p.x, p.y);
  await expect(tabDetail).toHaveAttribute('aria-selected', 'true');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('平板直向（800 × 1100）：清單與設定左右並排，一起收合（記住）', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1100 });
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA())], [160]);
  const l = await list(page).boundingBox();
  const d = await page.getByTestId('character-panel').boundingBox();
  if (!l || !d) throw new Error('no box');
  /* 左右並排、都在盤面下面 */
  expect(d.x).toBeGreaterThan(l.x + l.width - 1);
  const b = await board(page).boundingBox();
  expect(l.y).toBeGreaterThan((b?.y ?? 0) + (b?.height ?? 0));
  await page.getByTestId('panel-toggle').click();
  await expect(list(page)).toBeHidden();
  await expect(page.getByTestId('character-panel')).toBeHidden();
  /* 收合時標題帶出選取的角色名稱 */
  await expect(page.getByText('選取的角色：A')).toBeVisible();
  await page.reload();
  await expect.poll(async () => (await chars(page)).length).toBe(1);
  await expect(list(page)).toBeHidden();
  await page.getByTestId('panel-toggle').click();
  await expect(list(page)).toBeVisible();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('原作的 .hboard：拖到盤面開啟（確認、取代、復原清空）、從「專案」開啟、損壞與版本', async ({
  page,
}) => {
  const errors = await open(page);
  const a = await imgA();
  const b = await imgB();
  const good = hboard([
    { name: '前面', heightCm: 120, x: 70, z: 5, png: b },
    {
      name: '後面',
      heightCm: 160,
      x: 5,
      z: 1,
      png: a,
      topRatio: -0.1,
      bottomRatio: 1.2,
      hidden: false,
    },
    { name: '藏起來', heightCm: 5000, x: -3, z: 3, png: a, hidden: true },
  ]);
  /* 空盤面：不確認，直接開啟 */
  const at = await canvas(page).boundingBox();
  if (!at) throw new Error('no canvas');
  const center = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
  /* 讀取中狀態列顯示「讀取專案檔中…」（F84）：在頁面裡記下狀態列的每一次變化 */
  await page.evaluate(() => {
    const w = window as unknown as { __statusSeen: string[]; __statusStop: () => void };
    w.__statusSeen = [];
    const mo = new MutationObserver(() => {
      const t = document.querySelector('[data-testid="status-text"]')?.textContent;
      if (t && w.__statusSeen.at(-1) !== t) w.__statusSeen.push(t);
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    w.__statusStop = () => mo.disconnect();
  });
  await dropFiles(page, center, [
    { name: '盤面.hboard', type: '', base64: good.toString('base64') },
  ]);
  await expect.poll(async () => (await chars(page)).length).toBe(3);
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __statusSeen: string[]; __statusStop: () => void };
    w.__statusStop();
    return w.__statusSeen;
  });
  expect(seen).toContain('讀取專案檔中…');
  await expect(page.getByTestId('status-text')).toHaveCount(0);
  let list1 = await chars(page);
  /* 依 z 由後往前；身高、位置夾到範圍；兩條線換成 %；隱藏 */
  expect(list1.map((c) => c.name)).toEqual(['後面', '藏起來', '前面']);
  expect(list1[0]).toMatchObject({ height: 160, x: 5, visible: true });
  expect(list1[0].top).toBeCloseTo(-10, 6);
  expect(list1[0].bottom).toBeCloseTo(120, 6);
  expect(list1[1]).toMatchObject({ height: 1000, x: 0, visible: false });
  /* 透明留白照本站重新計算 */
  expect(list1[2].crop).toEqual({ x: 75, y: 50, width: 150, height: 200 });
  await expect(page.getByText('已開啟專案檔').first()).toBeVisible();
  expect(await history(page)).toEqual({ past: 0, future: 0 });
  /* 盤面有角色：先確認；取消就不變 */
  const other = hboard([{ name: '新的', heightCm: 150, x: 5, z: 0, png: a }]);
  await dropFiles(page, center, [{ name: 'x.hboard', type: '', base64: other.toString('base64') }]);
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('無法復原');
  await confirm.getByRole('button', { name: '取消' }).click();
  expect((await chars(page)).length).toBe(3);
  await dropFiles(page, center, [{ name: 'x.hboard', type: '', base64: other.toString('base64') }]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟', exact: true }).click();
  await expect.poll(async () => (await chars(page)).map((c) => c.name)).toEqual(['新的']);
  /* 圖片和專案檔一起拖進來：開啟專案檔（不加入圖片） */
  await dropFiles(page, center, [
    { name: 'a.png', type: 'image/png', base64: a.toString('base64') },
    { name: 'y.hboard', type: '', base64: good.toString('base64') },
  ]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟', exact: true }).click();
  await expect.poll(async () => (await chars(page)).length).toBe(3);
  await expect(page.getByRole('dialog', { name: '加入角色' })).toHaveCount(0);
  /* 從「專案 → 開啟專案檔」也能開 .hboard */
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '選擇專案檔' }).click(),
  ]);
  await fc.setFiles([{ name: 'z.hboard', mimeType: 'application/octet-stream', buffer: other }]);
  await expect.poll(async () => (await chars(page)).map((c) => c.name)).toEqual(['新的']);
  /* 損壞、版本不支援：錯誤訊息，盤面不變 */
  list1 = await chars(page);
  const broken = Buffer.concat([good.subarray(0, 8), Buffer.from('{{{')]);
  await dropFiles(page, center, [
    { name: '壞.hboard', type: '', base64: broken.toString('base64') },
  ]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟', exact: true }).click();
  await expect(page.getByText('這個 .hboard 檔案已損壞，無法開啟。').first()).toBeVisible();
  const v2 = hboard([{ name: 'v2', heightCm: 150, x: 5, z: 0, png: a }], 2);
  await dropFiles(page, center, [{ name: 'v2.hboard', type: '', base64: v2.toString('base64') }]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟', exact: true }).click();
  await expect(page.getByText(/較新版本的原作存的（版本 2）/).first()).toBeVisible();
  expect(await chars(page)).toEqual(list1);
  expect(errors).toEqual([]);
});

test('不是圖片的檔案提示檔名；批次對話框顯示「會加入 n 位」，沒有填身高時不能加入', async ({
  page,
}) => {
  const errors = await open(page);
  const at = await canvas(page).boundingBox();
  if (!at) throw new Error('no canvas');
  const center = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
  await dropFiles(page, center, [
    { name: '說明.txt', type: 'text/plain', base64: Buffer.from('hi').toString('base64') },
  ]);
  await expect(page.getByText('「說明.txt」不是圖片，沒有加入').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await choose(page, [
    file('甲.png', await imgA()),
    file('乙.png', await imgB()),
    file('筆記.txt', Buffer.from('x'), 'text/plain'),
  ]);
  await expect(page.getByText('「筆記.txt」不是圖片，沒有加入').first()).toBeVisible();
  const d = page.getByRole('dialog', { name: '加入 2 張圖片' });
  await expect(d.getByTestId('batch-count')).toHaveText('還沒有填身高');
  await expect(d.getByRole('button', { name: '加入', exact: true })).toBeDisabled();
  await d.getByRole('spinbutton', { name: '第 2 張的身高' }).fill('120');
  await expect(d.getByTestId('batch-count')).toHaveText('會加入 1 位');
  await d.getByRole('button', { name: '加入', exact: true }).click();
  await expect.poll(async () => (await chars(page)).map((c) => c.name)).toEqual(['乙']);
  expect(errors).toEqual([]);
});

test('桌面：設定欄寬度拖曳（記住、按兩下回預設、方向鍵）；「選取的角色」收合（標題帶名稱、記住）', async ({
  page,
}) => {
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA())], [160]);
  const aside = page.getByRole('complementary', { name: '設定' });
  const w0 = (await aside.boundingBox())?.width ?? 0;
  /* 預設寬度照原作 clamp(320px, 26.4vw, 380px)：1280 寬時 338 px（F68，驗證後跟進） */
  expect(w0).toBeCloseTo(338, 0);
  const sep = page.getByTestId('settings-splitter');
  const s = await sep.boundingBox();
  if (!s) throw new Error('no splitter');
  await drag(page, { x: s.x + s.width / 2, y: 450 }, 120, 0);
  const w1 = (await aside.boundingBox())?.width ?? 0;
  expect(w1).toBeCloseTo(w0 + 120, -1);
  /* 盤面跟著變窄 */
  await page.reload();
  await expect.poll(async () => (await chars(page)).length).toBe(1);
  expect((await aside.boundingBox())?.width ?? 0).toBeCloseTo(w1, -1);
  /* 方向鍵：← 變窄 16 px、Shift＋← 64 px；Home 最窄 320 */
  await sep.focus();
  await page.keyboard.press('ArrowLeft');
  expect((await aside.boundingBox())?.width ?? 0).toBeCloseTo(w1 - 16, 0);
  await page.keyboard.press('Shift+ArrowLeft');
  expect((await aside.boundingBox())?.width ?? 0).toBeCloseTo(w1 - 80, 0);
  /* 方向鍵不會移動選取的角色 */
  const x = (await chars(page))[0].x;
  await page.keyboard.press('Home');
  expect((await aside.boundingBox())?.width ?? 0).toBeCloseTo(320, 0);
  expect((await chars(page))[0].x).toBe(x);
  /* 按兩下回到預設（分隔線本身寬 0，按在它的抓取範圍） */
  const s2 = await sep.boundingBox();
  if (!s2) throw new Error('no splitter');
  await page.mouse.dblclick(s2.x + 1, 450);
  expect((await aside.boundingBox())?.width ?? 0).toBeCloseTo(w0, 0);
  /* 「選取的角色」收合：標題帶出名稱；選別的角色不會自動展開；重新整理後仍收合 */
  await rows(page).nth(0).click();
  await page.getByRole('button', { name: '選取的角色', exact: true }).click();
  await expect(page.getByTestId('character-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: '選取的角色：A' })).toBeVisible();
  await page.reload();
  await expect.poll(async () => (await chars(page)).length).toBe(1);
  await rows(page).nth(0).click();
  await expect(page.getByTestId('character-panel')).toBeHidden();
  await page.getByRole('button', { name: '選取的角色：A' }).click();
  await expect(page.getByTestId('character-panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('名稱：檔名合成成 NFC；篩選不分半形全形（NFKC）', async ({ page }) => {
  const errors = await open(page);
  await addMany(
    page,
    [file('ビーナス.png', await imgA()), file('ＡＢＣ.png', await imgB())],
    [150, 120],
  );
  expect((await chars(page)).map((c) => c.name)).toEqual(['ビーナス', 'ＡＢＣ']);
  const search = page.getByRole('textbox', { name: '依名稱篩選角色' });
  await search.fill('ﾋﾞｰ');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText('ビーナス');
  await search.fill('abc');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).nth(0)).toContainText('ＡＢＣ');
  expect(errors).toEqual([]);
});

test('盤面是空的時不顯示清單的篩選列（F83）', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('list-tools')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '依名稱篩選角色' })).toHaveCount(0);
  await addMany(page, [file('A.png', await imgA())], [160]);
  await expect(page.getByTestId('list-tools')).toBeVisible();
  await rows(page).nth(0).click();
  await btn(page, '刪除').click();
  await expect(page.getByTestId('list-tools')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 開頁時圖片讀不到（D8，驗證後修正） ---------- */

const ASSET_DB = 'trpg-toolkit:tool:height-board:assets';
/** 自動保存（localStorage）裡的角色名稱 */
const savedNames = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('trpg-toolkit:height-board');
    const list = raw
      ? (JSON.parse(raw) as { state?: { data?: { characters?: { name: string }[] } } }).state?.data
          ?.characters
      : undefined;
    return (list ?? []).map((c) => c.name).sort();
  });
const statusText = (page: Page) => page.getByTestId('status-text');

async function readDownload(dl: { path: () => Promise<string | null> }) {
  const { readFile } = await import('node:fs/promises');
  const p = await dl.path();
  if (!p) throw new Error('下載失敗');
  return new Uint8Array(await readFile(p));
}

test('開頁時資料庫少了一張圖：角色留著、標「圖片讀不到」並提示；自動保存不洗掉；匯出與存檔略過並說明；換圖片後恢復', async ({
  page,
}) => {
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
  await hb(page, 'flush');
  const idA = (await chars(page)).find((c) => c.name === 'A')?.imageId;
  await page.evaluate(
    async ([name, id]) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      await new Promise<void>((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(id);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    [ASSET_DB, idA ?? ''] as const,
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '立繪身高比較板' })).toBeVisible();
  await expect(statusText(page)).toContainText('有 1 位角色的圖片讀不到');
  await expect(statusText(page)).toContainText('角色資料還留著');
  expect((await chars(page)).map((c) => c.name).sort()).toEqual(['A', 'B']);
  /* 自動保存照常（資料沒有被改掉） */
  await page.waitForTimeout(800);
  await hb(page, 'flush');
  expect(await savedNames(page)).toEqual(['A', 'B']);
  const rowA = rows(page).filter({ has: page.getByText('A', { exact: true }) });
  await expect(rowA).toContainText('圖片讀不到');
  await expect(rows(page).filter({ has: page.getByText('B', { exact: true }) })).not.toContainText(
    '圖片讀不到',
  );
  /* 選取時面板也說明 */
  await rowA.click();
  await expect(page.getByTestId('missing-image-hint')).toBeVisible();
  /* 匯出 PNG：讀不到的不放進圖裡，通知說明 */
  await Promise.all([page.waitForEvent('download'), btn(page, '匯出 PNG').click()]);
  await expect(page.getByText(/有 1 位角色的圖片讀不到，沒有放進圖裡/).first()).toBeVisible();
  /* 存成專案檔：只有讀得到的角色，通知說明 */
  await btn(page, '專案').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const entries = unzipSync(await readDownload(dl));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.data.characters.map((c: { name: string }) => c.name)).toEqual(['B']);
  await expect(page.getByText(/有 1 位角色的圖片讀不到，沒有存進專案檔/).first()).toBeVisible();
  /* 更換圖片：恢復，提示消失 */
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '更換圖片…').click(),
  ]);
  await fc.setFiles([file('A2.png', await pngOf(200, 400, [50, 60, 100, 300], [20, 160, 60]))]);
  await expect(page.getByTestId('missing-image-hint')).toHaveCount(0);
  await expect(rowA).not.toContainText('圖片讀不到');
  await expect(page.getByText(/位角色的圖片讀不到，先畫成/)).toHaveCount(0);
  expect((await chars(page)).map((c) => c.name).sort()).toEqual(['A', 'B']);
  expect(errors).toEqual([]);
});

test('開頁當下資料庫暫時打不開：角色都留著（自動保存不洗掉），下次開頁讀得到就回來', async ({
  page,
}) => {
  const errors = await open(page);
  await addMany(page, [file('A.png', await imgA()), file('B.png', await imgB())], [160, 120]);
  await hb(page, 'flush');
  /* 之後的開頁：資產的資料庫打不開（像 iOS 的連線中斷），直到 sessionStorage 記了 ok */
  await page.addInitScript((name) => {
    const orig = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((db: string, ...rest: [number?]) => {
      if (db !== name || sessionStorage.getItem('__idb_ok')) return orig(db, ...rest);
      const req = {} as IDBOpenDBRequest & { error: DOMException };
      setTimeout(() => {
        Object.defineProperty(req, 'error', {
          value: new DOMException('Connection to Indexed Database server lost', 'UnknownError'),
        });
        req.onerror?.({ target: req } as unknown as Event);
      }, 5);
      return req;
    }) as typeof indexedDB.open;
  }, ASSET_DB);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '立繪身高比較板' })).toBeVisible();
  await expect(statusText(page)).toContainText('有 2 位角色的圖片讀不到');
  expect((await chars(page)).map((c) => c.name).sort()).toEqual(['A', 'B']);
  await page.waitForTimeout(800);
  await hb(page, 'flush');
  expect(await savedNames(page)).toEqual(['A', 'B']);
  await expect(rows(page).filter({ hasText: '圖片讀不到' })).toHaveCount(2);
  /* 恢復正常後再開一次：都回來了 */
  await page.evaluate(() => sessionStorage.setItem('__idb_ok', '1'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '立繪身高比較板' })).toBeVisible();
  await expect.poll(async () => (await chars(page)).length).toBe(2);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: '圖片讀不到' })).toHaveCount(0);
  await expect(page.getByText(/位角色的圖片讀不到/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
