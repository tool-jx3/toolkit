/**
 * 圖塊地圖編輯器（建置產物）的端對端測試：開頁（範例地圖、無 console 錯誤）、畫筆／填滿／圖形／橡皮擦、復原、
 * 拖曳中按 Esc 作廢、選取的搬動、整張移動的裁切確認、圖層（新增、改名、隱藏、刪除的確認）、快捷鍵、
 * 匯入圖塊表（透明格略過、框成大圖塊）、放大圖塊與擦掉、匯出 PNG／PDF（解析下載的檔案；超過上限時按鈕停用）、
 * 專案檔存讀（換一個瀏覽器環境也畫得出來、圖塊收進圖庫）、圖庫備份、自動存檔（圖庫改了馬上重新整理也留著）、
 * 在地圖演出產生器開啟（新分頁真的收到圖）、390 寬、視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getTool, outputDir } from '../../src/registry';
import type { Library } from '../../src/tools/tile-map/model/library';
import type { TileMap } from '../../src/tools/tile-map/model/types';

const URL = `/${outputDir(getTool('tile-map') ?? { id: 'tile-map', status: 'next' })}/`;

interface Hook {
  useMap: { getState(): { data: TileMap }; temporal: { getState(): { pastStates: unknown[] } } };
  useEditor: {
    getState(): {
      ready: boolean;
      tool: string;
      tile: string | null;
      selection: number[];
      layers: string[];
      active: string;
      savedAt: number | null;
    };
    setState(p: Record<string, unknown>): void;
  };
  useLibrary: { getState(): { lib: Library } };
  usePrefs: { getState(): { data: { grid: boolean } } };
  act: { chooseTile(id: string): void; selectLayer(id: string): void };
  zoomTo(z: number): void;
  fitView(): void;
  cellToClient(x: number, y: number): { x: number; y: number } | null;
}
type W = { __tileMap: Hook };

async function routeFonts(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeFonts(page);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '圖塊地圖編輯器' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__tileMap?.useEditor.getState().ready))
    .toBe(true);
  return errors;
}

const mapOf = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__tileMap.useMap.getState().data);
const editorOf = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__tileMap.useEditor.getState());
const cellAt = (page: Page, layer: number, x: number, y: number) =>
  page.evaluate(
    ([l, x, y]) => {
      const m = (window as unknown as W).__tileMap.useMap.getState().data;
      return m.layers[l].cells[y * m.width + x] ?? null;
    },
    [layer, x, y] as const,
  );

/** 畫面放大到 100% 並把 (x, y) 捲進畫面裡，回傳那一格中心的螢幕位置 */
async function point(page: Page, x: number, y: number) {
  const p = await page.evaluate(([x, y]) => (window as unknown as W).__tileMap.cellToClient(x, y), [
    x,
    y,
  ] as const);
  if (!p) throw new Error('cell not on screen');
  return p;
}

async function clickCell(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y, { button });
}

async function dragCells(page: Page, from: [number, number], to: [number, number]) {
  const a = await point(page, ...from);
  const b = await point(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/* ---------- 測試用的 PNG ---------- */

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function makePng(
  w: number,
  h: number,
  px: (x: number, y: number) => [number, number, number, number],
): Buffer {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * 4 + 1) + 1 + x * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PNG 的寬高與某一點的 RGBA（只解本工具輸出的 8-bit RGBA；濾波照規格還原） */
function pngInfo(bytes: Buffer) {
  let o = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (o < bytes.length) {
    const len = bytes.readUInt32BE(o);
    const type = bytes.subarray(o + 4, o + 8).toString('latin1');
    const body = bytes.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
    } else if (type === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  return { width: w, height: h, raw: inflateSync(Buffer.concat(idat)) };
}

/** 4 × 2 格（16 px）的圖塊表：右下那格完全透明、它左邊那格半透明 */
const SHEET = makePng(64, 32, (x, y) => {
  const cx = Math.floor(x / 16);
  const cy = Math.floor(y / 16);
  if (cx === 3 && cy === 1) return [0, 0, 0, 0];
  const a = cx === 2 && cy === 1 ? 128 : 255;
  return [40 + cx * 50, 200 - cy * 120, 80 + ((x + y) % 4) * 20, a];
});

/* ---------- 測試 ---------- */

test('開頁：範例地圖、圖塊、圖層，沒有錯誤', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('map-size')).toHaveText('32 × 24 格');
  await expect(page.getByTestId('layer-row')).toHaveCount(3);
  await expect(page.getByTestId('layer-row').first()).toContainText('物件');
  /* 內建三組：16＋136＋132 */
  await expect(page.getByTestId('tile-grid').getByRole('button')).toHaveCount(284);
  await expect(page.getByTestId('brush-name')).toHaveText('石板地');
  const map = await mapOf(page);
  expect(map.name).toBe('地下水道的岔路');
  expect((await cellAt(page, 2, 4, 4))?.t).toBe('kt:89');
  expect(errors).toEqual([]);
});

test('畫筆、橡皮擦、填滿、圖形、滴管、復原', async ({ page }) => {
  const errors = await open(page);
  /* 畫筆：換成草地，畫在地面層的 (0,0)～(1,0) */
  await page.locator('[data-tile="kb:grass"]').click();
  await expect(page.getByTestId('brush-name')).toHaveText('草地');
  await dragCells(page, [0, 0], [1, 1]);
  expect((await cellAt(page, 0, 0, 0))?.t).toBe('kb:grass');
  expect((await cellAt(page, 0, 1, 1))?.t).toBe('kb:grass');
  await expect(page.getByTestId('cursor-status')).toContainText('第 2 欄、第 2 列・地面');
  /* 一筆畫＝一步 */
  await page.getByTestId('undo').click();
  expect(await cellAt(page, 0, 0, 0)).toBeNull();
  expect(await cellAt(page, 0, 1, 1)).toBeNull();
  await page.getByTestId('redo').click();
  expect((await cellAt(page, 0, 1, 1))?.t).toBe('kb:grass');
  /* 轉 90° 再畫 */
  await page.keyboard.press('r');
  await clickCell(page, 0, 2);
  expect(await cellAt(page, 0, 0, 2)).toMatchObject({ t: 'kb:grass', r: 1 });
  /* 橡皮擦 */
  await page.keyboard.press('e');
  await clickCell(page, 0, 2);
  expect(await cellAt(page, 0, 0, 2)).toBeNull();
  /* 填滿：地面層左上的空地（第 0～1 欄） */
  await page.keyboard.press('g');
  await page.locator('[data-tile="kb:sand"]').click();
  await clickCell(page, 0, 5);
  expect((await cellAt(page, 0, 0, 5))?.t).toBe('kb:sand');
  expect((await cellAt(page, 0, 0, 23))?.t).toBe('kb:sand');
  expect((await cellAt(page, 0, 1, 1))?.t).toBe('kb:grass');
  await page.keyboard.press('Control+z');
  expect(await cellAt(page, 0, 0, 5)).toBeNull();
  /* 圖形：右鍵指定 3 × 3 */
  await page.keyboard.press('u');
  await expect(page.getByTestId('shape-options')).toBeVisible();
  await clickCell(page, 16, 22, 'right');
  const dlg = page.getByRole('dialog', { name: '長方形的大小' });
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('shape-place').click();
  for (const [x, y] of [
    [15, 21],
    [17, 23],
  ])
    expect((await cellAt(page, 0, x, y))?.t).toBe('kb:sand');
  /* 滴管：拿物件層的寶箱，畫的圖層換成物件 */
  await page.keyboard.press('i');
  await clickCell(page, 4, 4);
  const ed = await editorOf(page);
  expect(ed.tile).toBe('kt:89');
  expect(ed.tool).toBe('brush');
  expect(ed.active).toBe('layer-2');
  expect(errors).toEqual([]);
});

/** 按住拖到 to、按 Esc、再移一點才放開（放開前後都不能寫進地圖） */
async function escapeDrag(page: Page, from: [number, number], to: [number, number]) {
  const a = await point(page, ...from);
  const b = await point(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (to[0] !== from[0] || to[1] !== from[1]) await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.move(b.x + 30, b.y + 20, { steps: 2 });
  await page.mouse.up();
}

/** 地圖的格子與復原的步數（Esc 作廢前後比對） */
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const h = (window as unknown as W).__tileMap;
    return {
      cells: h.useMap.getState().data.layers.map((l) => l.cells),
      steps: h.useMap.temporal.getState().pastStates.length,
    };
  });
}

const ESC_CASES = [
  { name: '畫筆', key: 'b', from: [0, 0], to: [1, 6] },
  /* 填滿：按下時已經畫出結果，放開前按 Esc */
  { name: '填滿', key: 'g', from: [0, 5], to: [0, 5] },
  { name: '圖形', key: 'u', from: [0, 0], to: [1, 8] },
  /* 整張移動：會裁掉圖塊的位移 */
  { name: '整張移動', key: 'm', from: [10, 10], to: [14, 12] },
] as const;

for (const c of ESC_CASES)
  test(`拖曳中按 Esc 作廢（${c.name}）：放開時不寫進地圖、不多一步復原，之後照常能畫`, async ({
    page,
  }) => {
    const errors = await open(page);
    await page.locator('[data-tile="kb:grass"]').click();
    const before = await snapshot(page);
    await page.keyboard.press(c.key);
    await escapeDrag(page, [...c.from], [...c.to]);
    expect(await snapshot(page)).toEqual(before);
    if (c.key === 'm') {
      /* 放開時也不跳裁掉的確認；拖曳中的 Esc 只作廢那一次，再按一次 Esc 才回到選取 */
      await expect(page.getByRole('dialog', { name: '移動地圖並裁掉圖塊？' })).toHaveCount(0);
      expect((await editorOf(page)).tool).toBe('move-map');
      await page.keyboard.press('Escape');
      expect((await editorOf(page)).tool).toBe('select');
    }
    await page.keyboard.press('b');
    await dragCells(page, [0, 0], [1, 0]);
    expect((await cellAt(page, 0, 1, 0))?.t).toBe('kb:grass');
    expect((await snapshot(page)).steps).toBe(before.steps + 1);
    expect(errors).toEqual([]);
  });

test('拖曳中按 Esc 作廢（搬動選取）：圖塊不動、選取照舊', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '選擇圖層「物件」' }).click();
  await page.keyboard.press('Control+a');
  const selected = (await editorOf(page)).selection;
  expect(selected.length).toBeGreaterThan(0);
  const before = await snapshot(page);
  /* 從寶箱拖走 */
  await escapeDrag(page, [4, 4], [6, 5]);
  expect(await snapshot(page)).toEqual(before);
  expect((await editorOf(page)).selection).toEqual(selected);
  expect(errors).toEqual([]);
});

test('選取：框選、方向鍵搬動、刪除；整張移動會裁掉時確認', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '選擇圖層「物件」' }).click();
  await page.keyboard.press('s');
  await dragCells(page, [3, 3], [5, 5]);
  await expect(page.getByTestId('selection-count')).toHaveText('已選 1 格');
  await page.keyboard.press('ArrowRight');
  expect(await cellAt(page, 2, 4, 4)).toBeNull();
  expect((await cellAt(page, 2, 5, 4))?.t).toBe('kt:89');
  await page.keyboard.press('Delete');
  expect(await cellAt(page, 2, 5, 4)).toBeNull();
  await page.keyboard.press('Control+z');
  expect((await cellAt(page, 2, 5, 4))?.t).toBe('kt:89');
  /* Ctrl＋A：選中圖層的全部 */
  await page.keyboard.press('Control+a');
  expect((await editorOf(page)).selection.length).toBeGreaterThan(15);
  await page.keyboard.press('Escape');
  expect((await editorOf(page)).selection).toEqual([]);
  /* 整張移動：往右 3 格會裁掉東邊的牆 */
  await page.keyboard.press('m');
  await dragCells(page, [10, 10], [13, 10]);
  const dlg = page.getByRole('dialog', { name: '移動地圖並裁掉圖塊？' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: '取消' }).click();
  expect((await cellAt(page, 1, 2, 2))?.t).toBe('kb:stonewall');
  await dragCells(page, [10, 10], [13, 10]);
  await page.getByTestId('move-confirm').click();
  expect(await cellAt(page, 1, 2, 2)).toBeNull();
  expect((await cellAt(page, 1, 5, 2))?.t).toBe('kb:stonewall');
  await page.keyboard.press('Control+z');
  expect((await cellAt(page, 1, 2, 2))?.t).toBe('kb:stonewall');
  expect(errors).toEqual([]);
});

test('圖層：新增、改名、隱藏、刪除（有圖塊時確認）、復原', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('layer-add').click();
  await expect(page.getByTestId('layer-row')).toHaveCount(4);
  await expect(page.getByTestId('layer-row').first()).toContainText('圖層 4');
  await page.getByTestId('layer-menu').first().click();
  await page.getByRole('menuitem', { name: '重新命名…' }).click();
  await page.getByTestId('rename-layer-input').fill('陷阱');
  await page.getByTestId('rename-layer-ok').click();
  await expect(page.getByTestId('layer-row').first()).toContainText('陷阱');
  /* 不透明度 */
  await page.getByTestId('layer-menu').first().click();
  await page.getByRole('menuitem', { name: '不透明度 50%' }).click();
  await expect(page.getByTestId('layer-row').first()).toContainText('50%');
  /* 隱藏：畫不了 */
  await page.getByRole('button', { name: '隱藏「陷阱」' }).click();
  await expect(page.getByRole('button', { name: '顯示「陷阱」' })).toBeVisible();
  /* 空的圖層直接刪 */
  await page.getByTestId('layer-menu').first().click();
  await page.getByRole('menuitem', { name: '刪除圖層' }).click();
  await expect(page.getByTestId('layer-row')).toHaveCount(3);
  /* 地面有圖塊：先確認 */
  await page.getByTestId('layer-menu').last().click();
  await page.getByRole('menuitem', { name: '刪除圖層' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('「地面」和上面的');
  await confirm.getByRole('button', { name: '刪除圖層' }).click();
  await expect(page.getByTestId('layer-row')).toHaveCount(2);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('layer-row')).toHaveCount(3);
  await expect(page.getByTestId('layer-row').last()).toContainText('地面');
  /* 快捷鍵：V 切換格線 */
  const grid = () =>
    page.evaluate(() => (window as unknown as W).__tileMap.usePrefs.getState().data.grid);
  const before = await grid();
  await page.locator('body').press('v');
  expect(await grid()).toBe(!before);
  expect(errors).toEqual([]);
});

test('調色盤：圖塊組與分類、Alt＋方向鍵排序（存在圖庫）、收起內建圖塊組', async ({ page }) => {
  const errors = await open(page);
  /* Alt＋→：石板地和碎石路對調 */
  await page.locator('[data-tile="kb:flagstone"]').focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('[data-tile]').nth(1)).toHaveAttribute('data-tile', 'kb:flagstone');
  await expect(page.locator('[data-tile="kb:flagstone"]')).toBeFocused();
  const order = await page.evaluate(
    () => (window as unknown as W).__tileMap.useLibrary.getState().lib.order.basic,
  );
  expect(order?.slice(0, 2)).toEqual(['kb:cobble', 'kb:flagstone']);
  /* 換到迷你地城：分類出現；「角色」只列角色 */
  await page.getByTestId('palette-set').click();
  await page.getByRole('option', { name: /Kenney 迷你地城/ }).click();
  await expect(page.getByTestId('tile-grid').getByRole('button')).toHaveCount(132);
  await page.getByRole('group', { name: '分類' }).getByRole('button', { name: '角色' }).click();
  await expect(page.getByTestId('tile-grid').getByRole('button')).toHaveCount(21);
  /* 收起簡易地形：選單不列、地圖照畫 */
  await page.getByTestId('manage-sets').click();
  const mgr = page.getByRole('dialog', { name: '圖塊組' });
  await mgr.locator('[data-set="basic"]').click();
  await mgr.getByRole('switch', { name: '列在調色盤' }).click();
  await page.keyboard.press('Escape');
  await page.getByTestId('palette-set').click();
  await expect(page.getByRole('option', { name: /簡易地形/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

async function importSheet(page: Page) {
  await page.getByTestId('manage-sets').click();
  const mgr = page.getByRole('dialog', { name: '圖塊組' });
  await mgr.getByTestId('new-set').click();
  await expect(mgr.getByTestId('set-detail')).toContainText('這個圖塊組是空的');
  await mgr.getByTestId('open-import').click();
  const dlg = page.getByRole('dialog', { name: '匯入圖塊' });
  await dlg
    .locator('input[type=file]')
    .setInputFiles({ name: '地城.png', mimeType: 'image/png', buffer: SHEET });
  await dlg.getByRole('radio', { name: '16 px' }).click();
  await expect(dlg.getByTestId('import-status')).toHaveText('7 個圖塊・64 × 32 px');
  /* 框起左上 2 × 2 格＝一個大圖塊（預覽放大 8 倍：一格 128 px） */
  const box = await dlg.getByTestId('import-preview').boundingBox();
  if (!box) throw new Error('preview');
  const k = box.width / 64;
  await page.mouse.move(box.x + 8 * k, box.y + 8 * k);
  await page.mouse.down();
  await page.mouse.move(box.x + 24 * k, box.y + 24 * k, { steps: 4 });
  await page.mouse.up();
  await expect(dlg.getByTestId('import-status')).toHaveText('4 個圖塊・64 × 32 px');
  await dlg.getByTestId('import-submit').click();
  await expect(page.getByText('已匯入 4 個圖塊').first()).toBeVisible();
  await expect(dlg).toBeHidden();
}

test('匯入圖塊表：透明格略過、框成大圖塊；放大圖塊、擦掉一格整個拿掉', async ({ page }) => {
  const errors = await open(page);
  await importSheet(page);
  const lib = await page.evaluate(
    () => (window as unknown as W).__tileMap.useLibrary.getState().lib,
  );
  expect(lib.sets).toHaveLength(1);
  const tiles = lib.sets[0].imports[0].tiles;
  expect(tiles.map((t) => [t.rect, t.span ?? null])).toEqual([
    [
      [0, 0, 32, 32],
      [2, 2],
    ],
    [[32, 0, 16, 16], null],
    [[48, 0, 16, 16], null],
    [[32, 16, 16, 16], null],
  ]);
  await expect(page.getByTestId('brush-name')).toHaveText('地城 1');
  await expect(page.getByTestId('brush-panel')).toContainText('2 × 2 格');
  await page.getByRole('button', { name: '選擇圖層「物件」' }).click();
  await clickCell(page, 0, 0);
  const c = await cellAt(page, 2, 1, 1);
  expect(c).toMatchObject({ t: tiles[0].id, p: [1, 1] });
  /* 地圖邊緣放不下：略過 */
  await clickCell(page, 31, 23);
  expect(await cellAt(page, 2, 31, 23)).toBeNull();
  await page.keyboard.press('e');
  await clickCell(page, 1, 0);
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    expect(await cellAt(page, 2, x, y)).toBeNull();
  expect(errors).toEqual([]);
});

test('圖庫：換了順序馬上重新整理也留著（離開頁面時立刻存）', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-tile="kb:flagstone"]').focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('[data-tile]').nth(1)).toHaveAttribute('data-tile', 'kb:flagstone');
  /* 不等自動存檔的 0.1 秒 */
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__tileMap?.useEditor.getState().ready))
    .toBe(true);
  await expect(page.locator('[data-tile]').nth(0)).toHaveAttribute('data-tile', 'kb:cobble');
  await expect(page.locator('[data-tile]').nth(1)).toHaveAttribute('data-tile', 'kb:flagstone');
  expect(errors).toEqual([]);
});

test('匯出：超過上限時說明原因、「匯出」按鈕停用；沒選中的格式照樣切得過去', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('new-map').click();
  const nd = page.getByRole('dialog', { name: '新地圖' });
  /* 用 Tab 離開欄位（Enter 會直接送出「建立」） */
  for (const side of ['寬', '高']) {
    const f = nd.getByRole('spinbutton', { name: side });
    await f.fill('200');
    await f.press('Tab');
  }
  await nd.getByTestId('new-map-create').click();
  await expect.poll(async () => (await mapOf(page)).width).toBe(200);
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  /* PNG：每格 64 px → 12,800 px，超過每邊 8,192 */
  await expect(dlg.getByTestId('png-size')).toHaveText('12,800 × 12,800 px');
  await expect(dlg.getByText(/太大了：每邊最多 8,192 px/)).toBeVisible();
  await expect(dlg.getByRole('button', { name: '匯出 PNG 圖片' })).toBeDisabled();
  await expect(dlg.getByTestId('send-fx')).toBeDisabled();
  /* 列印用 PDF：每格 1 英寸 → 29 × 20 頁，超過 100 頁 */
  await dlg.getByRole('radio', { name: '列印用 PDF' }).click();
  await expect(dlg.getByText(/這樣要 580 頁，最多 100 頁/)).toBeVisible();
  await expect(dlg.getByRole('button', { name: '匯出 列印用 PDF' })).toBeDisabled();
  /* 切回 PNG、每格改小就能匯出 */
  await dlg.getByRole('radio', { name: 'PNG 圖片' }).click();
  const px = dlg.getByRole('spinbutton', { name: '每格' });
  await px.fill('16');
  await px.press('Enter');
  await expect(dlg.getByTestId('png-size')).toHaveText('3,200 × 3,200 px');
  await expect(dlg.getByRole('button', { name: '匯出 PNG 圖片' })).toBeEnabled();
  await expect(dlg.getByTestId('send-fx')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('匯出 PNG 與列印用 PDF @serial', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  const px = dlg.getByRole('spinbutton', { name: '每格' });
  await px.fill('16');
  await px.press('Enter');
  await expect(dlg.getByTestId('png-size')).toHaveText('512 × 384 px');
  await dlg.getByRole('button', { name: '匯出 PNG 圖片' }).click();
  await expect(dlg.getByTestId('export-result')).toBeVisible();
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    dlg.getByRole('link', { name: '下載' }).click(),
  ]);
  expect(png.suggestedFilename()).toBe('地下水道的岔路.png');
  const info = pngInfo(readFileSync(await png.path()));
  expect([info.width, info.height]).toEqual([512, 384]);
  /* 列印用 PDF：A4 直式、每格 1 英寸 → 7 × 10 格一頁 → 橫 5 頁 × 直 3 頁 */
  await dlg.getByRole('radio', { name: '列印用 PDF' }).click();
  await expect(dlg.getByTestId('pdf-pages')).toHaveText('15 頁（橫 5 頁 × 直 3 頁）');
  await dlg.getByRole('button', { name: '匯出 列印用 PDF' }).click();
  await expect(dlg.getByTestId('export-result')).toBeVisible({ timeout: 60_000 });
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    dlg.getByRole('link', { name: '下載' }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe('地下水道的岔路-列印.pdf');
  const doc = await PDFDocument.load(readFileSync(await pdf.path()));
  expect(doc.getPageCount()).toBe(15);
  const size = doc.getPage(0).getSize();
  expect(size.width).toBeCloseTo(595.28, 1);
  expect(doc.getTitle()).toBe('地下水道的岔路');
  expect(errors).toEqual([]);
});

async function saveProject(page: Page) {
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.tile-map\.zip$/);
  return dl.path();
}

async function openProject(page: Page, file: string) {
  await page.getByRole('button', { name: '專案' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /開啟專案檔/ }).click(),
  ]);
  await chooser.setFiles(file);
}

/** 自動存檔（IndexedDB）裡的地圖名稱 */
const storedName = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open('trpg-toolkit:tool:tile-map');
        req.onsuccess = () => {
          try {
            const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('workspace');
            get.onsuccess = () => resolve(get.result?.name ?? null);
            get.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      }),
  );

async function freshPage(context: BrowserContext) {
  const page = await context.newPage();
  return page;
}

test('專案檔存讀（換一個瀏覽器也畫得出自訂圖塊、收進圖庫）、圖庫備份、自動存檔', async ({
  page,
  browser,
}) => {
  const errors = await open(page);
  await importSheet(page);
  await page.getByRole('button', { name: '選擇圖層「物件」' }).click();
  await clickCell(page, 0, 0);
  await page.getByTestId('map-name').fill('我的地城');
  await page.getByTestId('map-name').press('Tab');
  const file = await saveProject(page);
  /* 圖庫備份 */
  await page.getByTestId('manage-sets').click();
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-library').click(),
  ]);
  const backupPath = await backup.path();
  await page.keyboard.press('Escape');
  /* 自動存檔：寫進 IndexedDB 之後重新整理還在 */
  await expect.poll(() => storedName(page)).toBe('我的地城');
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as W).__tileMap?.useEditor.getState().ready))
    .toBe(true);
  expect((await mapOf(page)).name).toBe('我的地城');
  expect((await cellAt(page, 2, 0, 0))?.p).toEqual([0, 0]);
  /* 開新地圖、再開專案檔回來 */
  await page.getByTestId('new-map').click();
  await page.getByTestId('new-map-create').click();
  await expect(page.getByTestId('map-size')).toHaveText('40 × 30 格');
  await openProject(page, file);
  await expect(page.getByTestId('map-size')).toHaveText('32 × 24 格');
  expect((await mapOf(page)).name).toBe('我的地城');
  /* 換一個瀏覽器環境（沒有圖庫）：開專案檔，圖畫得出來、自訂圖塊收進圖庫 */
  const other = await browser.newContext({ locale: 'zh-TW', colorScheme: 'dark' });
  const p2 = await freshPage(other);
  const errors2 = await open(p2);
  await openProject(p2, file);
  await expect(p2.getByText('專案檔帶來的 1 個自訂圖塊也加進了圖庫。').first()).toBeVisible();
  const lib2 = await p2.evaluate(
    () => (window as unknown as W).__tileMap.useLibrary.getState().lib,
  );
  expect(lib2.sets.map((s) => s.name)).toEqual(['我的圖塊']);
  const drawn = await p2.evaluate(async () => {
    const m = (window as unknown as W).__tileMap.useMap.getState().data;
    const def = Object.values(m.defs)[0];
    return { def: !!def, cell: m.layers[2].cells[0]?.t === def?.id };
  });
  expect(drawn).toEqual({ def: true, cell: true });
  /* 圖庫備份讀進第三個環境 */
  const third = await browser.newContext({ locale: 'zh-TW', colorScheme: 'dark' });
  const p3 = await freshPage(third);
  const errors3 = await open(p3);
  await p3.getByTestId('manage-sets').click();
  const [chooser] = await Promise.all([
    p3.waitForEvent('filechooser'),
    p3.getByTestId('restore-library').click(),
  ]);
  await chooser.setFiles(backupPath);
  await expect(p3.getByText('已讀入圖庫備份，加了 4 個圖塊').first()).toBeVisible();
  await expect(p3.getByTestId('set-manager')).toContainText('我的圖塊');
  await other.close();
  await third.close();
  expect([...errors, ...errors2, ...errors3]).toEqual([]);
});

test('在地圖演出產生器開啟：新分頁收到圖、「1 格幾 px」跟著改（map-fx F88）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  /* 記下開分頁的網址（照常開） */
  await page.evaluate(() => {
    const w = window as unknown as { open: typeof window.open; __opened?: string };
    const real = w.open.bind(window);
    w.open = (u?: string | URL, ...rest: [string?, string?]) => {
      w.__opened = String(u);
      return real(u, ...rest);
    };
  });
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  const px = dlg.getByRole('spinbutton', { name: '每格' });
  await px.fill('40');
  await px.press('Enter');
  const [fx] = await Promise.all([
    context.waitForEvent('page'),
    dlg.getByTestId('send-fx').click(),
  ]);
  const fxErrors: string[] = [];
  fx.on('pageerror', (e) => fxErrors.push(e.message));
  await routeFonts(fx);
  const opened = await page.evaluate(() => (window as unknown as { __opened?: string }).__opened);
  expect(opened).toMatch(/\/map-fx\/#handoff=[\w-]+&from=tile-map$/);
  await expect(page.getByText('已經送到地圖演出產生器（新分頁）。').first()).toBeVisible();
  const ask = fx.getByRole('alertdialog');
  await expect(ask).toContainText('要讀入圖塊地圖編輯器送來的圖嗎？', { timeout: 20_000 });
  await expect(ask).toContainText('地下水道的岔路');
  /* 沒有房間的範圍：只問要不要讀入（不是三選一） */
  await expect(ask.getByRole('button')).toHaveCount(2);
  await ask.getByRole('button', { name: '讀入' }).click();
  await expect(
    fx.getByText('已讀入圖塊地圖編輯器送來的「地下水道的岔路」', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    fx.getByText('房間遮罩 ZIP 的「1 格幾 px」改成 40 px（和圖塊地圖的格子對齊）。').first(),
  ).toBeVisible();
  const got = await fx.evaluate(() => {
    const h = (
      window as unknown as {
        __mapFx: {
          doc: () => { image: { name: string; width: number; height: number } | null };
          prefs: () => { grid: number };
        };
      }
    ).__mapFx;
    return { image: h.doc().image, grid: h.prefs().grid };
  });
  expect(got.image).toMatchObject({ name: '地下水道的岔路', width: 32 * 40, height: 24 * 40 });
  expect(got.grid).toBe(40);
  expect(errors).toEqual([]);
  expect(fxErrors).toEqual([]);
});

test('390 寬沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await noHorizontalScroll(page);
  await page.getByTestId('open-export').click();
  await noHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('manage-sets').click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('視覺基準圖 1280 與 390', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('tile-map-1280.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (window as unknown as W).__tileMap.fitView());
  await expect(page).toHaveScreenshot('tile-map-390.png');
});
