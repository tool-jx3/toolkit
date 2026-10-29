/**
 * 室內平面圖產生器（建置產物 next/floor-plan/）的端對端測試：
 * - 開頁沒有錯誤、預設的套房、頁尾只有靈感來源；
 * - 各工具：房間（拖曳、預設尺寸、從面板拖放）、牆、門窗（吸附、重疊、方向）、家具（貼牆轉向、連續放）、文字、橡皮擦、平移；
 * - 選取：點選、Shift、框選、移動（連同內容／Alt 只動房間）、控制點、鎖定、刪除、複製、剪貼簿、方向鍵、旋轉、翻轉；
 * - 屬性面板、GM／PL 檢視、隱藏線索、樓層、範本（格局、線索；2026-10 增補的 7 個範本與分類、視覺基準）、匯出（尺寸、檔名、PL／GM 像素、每層各一張、透明）、
 *   專案檔（存、開、原作的 .trpgmap.json）、自動保存、復原；
 * - 1280／390 視覺基準、390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import { ASSETS } from '../../src/tools/floor-plan/model/assets';
import type { Floor, Project, Rect, TextLabel } from '../../src/tools/floor-plan/model/types';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('floor-plan') ?? { id: 'floor-plan', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '室內平面圖產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan);
  return errors;
}

type Hook = {
  useProject: { getState: () => { data: Project; replace: (p: Project) => void } };
  usePrefs: {
    getState: () => { data: Record<string, unknown> & { showClues: boolean; grid: boolean } };
  };
  useEditor: {
    getState: () => {
      tool: string;
      sel: { type: string; id: string }[];
      playerView: boolean;
      zoomPct: number;
    };
  };
  act: Record<string, (...a: unknown[]) => unknown>;
  toClient: (x: number, y: number) => { x: number; y: number };
  view: () => { zoom: number; ox: number; oy: number };
};

type WallRunLike = { o: 'h' | 'v'; c: number; a: number; b: number };

const project = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __floorPlan: Hook }).__floorPlan.useProject.getState().data,
  );
const floor = async (page: Page): Promise<Floor> => {
  const p = await project(page);
  return p.floors[p.active];
};
const editorState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __floorPlan: Hook }).__floorPlan.useEditor.getState();
    return { tool: s.tool, sel: s.sel, playerView: s.playerView, zoomPct: s.zoomPct };
  });
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __floorPlan: Hook }).__floorPlan.toClient(x, y),
    [x, y],
  );
const run = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(
    ([n, a]) =>
      (window as unknown as { __floorPlan: Hook }).__floorPlan.act[n as string](
        ...(a as unknown[]),
      ),
    [name, args] as const,
  );

async function click(page: Page, x: number, y: number, modifiers: ('Shift' | 'Alt')[] = []) {
  const p = await at(page, x, y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
}

async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
  modifiers: ('Shift' | 'Alt')[] = [],
) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

/** 空白地圖、選取工具、100% */
async function blank(page: Page) {
  await run(page, 'newMap');
  await run(page, 'setTool', 'select');
  await page.getByTestId('map-canvas').focus();
}

/** 兩個相鄰的房間：A (0,0,10,8)、B (10,0,6,8) */
async function twoRooms(page: Page) {
  await blank(page);
  await page.keyboard.press('b');
  await drag(page, [0, 0], [10, 8]);
  await drag(page, [10, 0], [16, 8]);
  await page.keyboard.press('v');
}

const walls = (page: Page) =>
  page.evaluate(() => {
    const h = (
      window as unknown as {
        __floorPlan: Hook & {
          computeWalls: (f: Floor) => {
            runs: { o: string; c: number; a: number; b: number; kind: string }[];
          };
        };
      }
    ).__floorPlan;
    const p = h.useProject.getState().data;
    return h
      .computeWalls(p.floors[p.active])
      .runs.map((r) => `${r.o}${r.c}:${r.a}-${r.b}:${r.kind}`);
  });

function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}
const px = (b: PixelBuffer, x: number, y: number) =>
  Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test('開頁：套房範本、工具列、素材、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  const p = await project(page);
  expect(p.name).toBe('套房（一房一廳）');
  expect(p.floors.map((f) => f.name)).toEqual(['1F']);
  expect(p.floors[0].rooms.map((r) => r.name)).toEqual([
    '玄關',
    '浴室',
    '廚房',
    '客廳',
    '臥室',
    '陽台',
  ]);
  await expect(page.getByTestId('tool-strip').getByRole('button')).toHaveCount(8);
  await expect(page.getByRole('tab', { name: '房間' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('map-stats')).toHaveText('1F：6 個房間・20 件家具・12 個門窗');
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源：くま。／TRPG室内図メーカー');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://kumachansteps.github.io/trpg-web-tools/',
  );
  await expect(page.getByText('GM 用', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('畫房間與牆', () => {
  test('房間工具：拖曳畫房間，相鄰的房間自動產生內牆與外牆；點一下放預設尺寸', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    expect((await editorState(page)).tool).toBe('select');
    await page.keyboard.press('b');
    expect((await editorState(page)).tool).toBe('room');
    await drag(page, [0, 0], [10, 8]);
    await drag(page, [10, 0], [16, 8]);
    const f = await floor(page);
    expect(f.rooms.map((r) => [r.x, r.y, r.w, r.h, r.name, r.cat])).toEqual([
      [0, 0, 10, 8, '房間', 'living'],
      [10, 0, 6, 8, '房間', 'living'],
    ]);
    expect(await walls(page)).toEqual([
      'h0:0-16:ext',
      'h8:0-16:ext',
      'v0:0-8:ext',
      'v10:0-8:int',
      'v16:0-8:ext',
    ]);
    /* 房間分頁的卡片：浴室 2×2m（4×4 格），點一下放在游標中央 */
    await page.getByTestId('library').locator('[data-room="bath"]').click();
    await expect(page.getByTestId('canvas-hint')).toContainText('「浴室」');
    await click(page, 20, 20);
    const bath = (await floor(page)).rooms.at(-1);
    expect(bath).toMatchObject({ x: 18, y: 18, w: 4, h: 4, name: '浴室', cat: 'wet' });
    /* 再點一次卡片＝放下工具 */
    await page.getByTestId('library').locator('[data-room="bath"]').click();
    expect((await editorState(page)).tool).toBe('select');
    expect(errors).toEqual([]);
  });

  test('從素材面板把房間、家具拖到畫布上', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    const canvas = page.getByTestId('map-canvas');
    const target = await at(page, 6, 6);
    const box = (await canvas.boundingBox()) as { x: number; y: number };
    await page
      .getByTestId('library')
      .locator('[data-room="kitchen"]')
      .dragTo(canvas, {
        targetPosition: { x: target.x - box.x, y: target.y - box.y },
      });
    expect((await floor(page)).rooms).toMatchObject([{ name: '廚房', w: 5, h: 4, x: 4, y: 4 }]);
    await page.getByRole('tab', { name: '家具・小物' }).click();
    await page
      .getByTestId('library')
      .locator('[data-asset="plant"]')
      .dragTo(canvas, {
        targetPosition: { x: target.x - box.x, y: target.y - box.y },
      });
    expect((await floor(page)).items).toMatchObject([{ t: 'plant' }]);
    expect((await editorState(page)).sel).toEqual([
      { type: 'item', id: (await floor(page)).items[0].id },
    ]);
    expect(errors).toEqual([]);
  });

  test('牆工具：水平／垂直（Shift 斜線），吸到既有的端點；手畫的牆可以放門', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    await page.keyboard.press('w');
    await drag(page, [0, 0], [6, 0.7]);
    await drag(page, [6.1, 0.1], [9, 4], ['Shift']);
    const f = await floor(page);
    expect(f.walls.map((w) => [w.x1, w.y1, w.x2, w.y2, w.kind])).toEqual([
      [0, 0, 6, 0, 'int'],
      [6, 0, 9, 4, 'int'],
    ]);
    /* 圍籬 */
    await page.getByRole('tab', { name: '門窗' }).click();
    await page.getByTestId('library').locator('[data-wall="fence"]').click();
    await expect(page.getByTestId('canvas-hint')).toContainText('「圍籬」');
    await drag(page, [0, 10], [0.2, 16]);
    expect((await floor(page)).walls.at(-1)).toMatchObject({
      x1: 0,
      y1: 10,
      x2: 0,
      y2: 16,
      kind: 'fence',
    });
    /* 門放在手畫的牆上 */
    await page.keyboard.press('d');
    await click(page, 3, 0.3);
    expect((await floor(page)).openings).toMatchObject([{ kind: 'door', o: 'h', y: 0, len: 1.5 }]);
    expect(errors).toEqual([]);
  });
});

test.describe('門窗', () => {
  test('門：靠近牆吸附、往游標那一側開、和既有的門重疊時不能放；R 換鉸鍊；沒有牆時提示', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.keyboard.press('d');
    await click(page, 10.4, 4);
    await click(page, 9.6, 1);
    let f = await floor(page);
    expect(f.openings.map((o) => [o.kind, o.o, o.x, o.y, o.len, o.side, o.hinge])).toEqual([
      ['door', 'v', 10, 3.25, 1.5, 1, 0],
      ['door', 'v', 10, 0.25, 1.5, -1, 0],
    ]);
    /* 重疊：不放，點到既有的門 → 改成選取它 */
    await click(page, 10.2, 3.9);
    f = await floor(page);
    expect(f.openings).toHaveLength(2);
    expect((await editorState(page)).tool).toBe('select');
    expect((await editorState(page)).sel).toEqual([{ type: 'opening', id: f.openings[0].id }]);
    /* R：要放的門換鉸鍊那一邊 */
    await page.keyboard.press('d');
    await page.keyboard.press('r');
    await click(page, 3, 7.7);
    expect((await floor(page)).openings.at(-1)).toMatchObject({ o: 'h', y: 8, side: -1, hinge: 1 });
    /* 牆外很遠的地方：提示沒有牆、不放 */
    const p = await at(page, 4, 4);
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('canvas-hint')).toContainText('這裡沒有牆');
    await page.mouse.click(p.x, p.y);
    expect((await floor(page)).openings).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  test('窗：從門窗分頁選種類；寬度不超過牆段', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.getByRole('tab', { name: '門窗' }).click();
    await page.getByTestId('library').locator('[data-opening="window2"]').click();
    expect((await editorState(page)).tool).toBe('window');
    await click(page, 13, -0.3);
    expect((await floor(page)).openings).toMatchObject([
      { kind: 'window2', o: 'h', y: 0, len: 3.5, x: 11.25 },
    ]);
    expect(errors).toEqual([]);
  });
});

test.describe('家具與文字', () => {
  test('靠牆時背面朝牆；Shift 連續放；R 轉向後不再自動轉；Alt 不吸附', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.getByRole('tab', { name: '家具・小物' }).click();
    await page.getByRole('searchbox', { name: '搜尋家具' }).fill('單人床');
    await expect(page.getByTestId('library').locator('[data-asset]')).toHaveCount(1);
    await page.getByTestId('library').locator('[data-asset="bed_single"]').click();
    await click(page, 9, 4, ['Shift']);
    let items = (await floor(page)).items;
    expect(items[0]).toMatchObject({ t: 'bed_single', rot: 90, x: 6, w: 4, h: 2 });
    expect((await editorState(page)).tool).toBe('place');
    await page.keyboard.press('r');
    await click(page, 5, 1);
    items = (await floor(page)).items;
    expect(items[1]).toMatchObject({ rot: 90, w: 4, h: 2 });
    expect((await editorState(page)).tool).toBe('select');
    await page.getByTestId('library').locator('[data-asset="bed_single"]').click();
    await click(page, 3.1, 4.1, ['Alt']);
    expect((await floor(page)).items[2]).toMatchObject({ rot: 0, x: 2, y: 2 });
    expect(errors).toEqual([]);
  });

  test('文字工具：放下後聚焦文字欄，打字即時改', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    await page.keyboard.press('t');
    await click(page, 5, 5);
    const box = page.locator('[data-focus="text"]');
    await expect(box).toBeFocused();
    await box.fill('閣樓入口');
    await box.blur();
    expect((await floor(page)).texts).toMatchObject([{ x: 5, y: 5, text: '閣樓入口', size: 0.7 }]);
    expect(errors).toEqual([]);
  });

  test('橡皮擦：點一下刪掉，拖曳連續刪家具（房間不會被拖曳刪掉），整次拖曳算一步', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    for (const x of [2, 4, 6]) {
      await run(page, 'setTool', 'place', { kind: 'item', t: 'chair', rot: 0 });
      await click(page, x, 4, ['Alt']);
    }
    await page.keyboard.press('e');
    await drag(page, [2, 4], [6.2, 4]);
    let f = await floor(page);
    expect(f.items).toEqual([]);
    expect(f.rooms).toHaveLength(2);
    await click(page, 13, 4);
    f = await floor(page);
    expect(f.rooms).toHaveLength(1);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect((await floor(page)).items).toHaveLength(3);
    expect(errors).toEqual([]);
  });
});

test.describe('選取與編輯', () => {
  test('點選、Shift 加選、框選；拖曳房間連同內容一起動，Alt 只動房間；復原', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await run(page, 'setTool', 'place', { kind: 'item', t: 'chair', rot: 0 });
    await click(page, 4, 4, ['Alt']);
    await click(page, 4, 1);
    await expect(page.getByTestId('props-title')).toHaveText('房間');
    await click(page, 13, 1, ['Shift']);
    expect((await editorState(page)).sel).toHaveLength(2);
    await expect(page.getByTestId('props-panel')).toContainText('已選取 2 個');
    /* 框選：完全包住的才算 */
    await drag(page, [-1, -1], [11, 9]);
    expect((await editorState(page)).sel.map((s) => s.type).sort()).toEqual(['item', 'room']);
    /* 移動房間（整格），椅子一起動 */
    await click(page, 1, 1);
    await drag(page, [1, 1], [1, 3]);
    let f = await floor(page);
    expect([f.rooms[0].y, f.items[0].y]).toEqual([2, 5.5]);
    await page.getByTestId('undo').click();
    f = await floor(page);
    expect([f.rooms[0].y, f.items[0].y]).toEqual([0, 3.5]);
    await page.getByTestId('redo').click();
    await page.getByTestId('undo').click();
    /* Alt：只動房間 */
    await drag(page, [1, 1], [1, 3], ['Alt']);
    f = await floor(page);
    expect([f.rooms[0].y, f.items[0].y]).toEqual([2, 3.5]);
    expect(errors).toEqual([]);
  });

  test('控制點：房間依整格、家具 0.25 格改大小；拖到別處放開才算一步', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await click(page, 5, 5);
    const se = await at(page, 10, 8);
    await page.mouse.move(se.x + 5, se.y + 5);
    await page.mouse.down();
    const to = await at(page, 12.2, 9.4);
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
    expect((await floor(page)).rooms[0]).toMatchObject({ w: 12, h: 9 });
    await page.keyboard.press('Control+z');
    expect((await floor(page)).rooms[0]).toMatchObject({ w: 10, h: 8 });
    expect(errors).toEqual([]);
  });

  test('鎖定（L）：不能移動、旋轉、刪除；拖曳變成框選；解除後可以', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await click(page, 5, 5);
    await page.keyboard.press('l');
    expect((await floor(page)).rooms[0].locked).toBe(true);
    await drag(page, [5, 5], [5, 7]);
    expect((await floor(page)).rooms[0].y).toBe(0);
    await click(page, 5, 5);
    await page.keyboard.press('Delete');
    await expect(page.getByText('鎖定的房間沒有改動。', { exact: true })).toBeVisible();
    expect((await floor(page)).rooms).toHaveLength(2);
    await page.keyboard.press('ArrowDown');
    expect((await floor(page)).rooms[0].y).toBe(0);
    await page.getByTestId('mini-bar').locator('[data-mini="lock"]').click();
    expect((await floor(page)).rooms[0].locked).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('刪除、複製（Ctrl＋D）、剪貼簿（同一層每次錯開、別層同位置）、方向鍵（連按算一步）', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    await click(page, 13, 4);
    await page.keyboard.press('Control+d');
    let f = await floor(page);
    expect(f.rooms.map((r) => r.x)).toEqual([0, 10, 16]);
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Control+v');
    f = await floor(page);
    expect(f.rooms.map((r) => r.x)).toEqual([0, 10, 16, 22, 28]);
    await run(page, 'addFloor');
    await page.keyboard.press('Control+v');
    expect((await floor(page)).rooms.map((r) => r.x)).toEqual([16]);
    await run(page, 'switchFloor', 0);
    await click(page, 5, 5);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    expect((await floor(page)).rooms[0]).toMatchObject({ x: 3, y: 4 });
    await page.waitForTimeout(800);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).rooms[0]).toMatchObject({ x: 0, y: 0 });
    /* 方向鍵之後馬上做別的變更（0.7 秒內）：各算一步，不會併在一起 */
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+d');
    expect((await floor(page)).rooms).toHaveLength(6);
    await page.keyboard.press('Control+z');
    f = await floor(page);
    expect([f.rooms.length, f.rooms[0].x]).toEqual([5, 1]);
    await page.keyboard.press('Control+z');
    f = await floor(page);
    expect([f.rooms.length, f.rooms[0].x]).toEqual([5, 0]);
    await click(page, 5, 5);
    await page.keyboard.press('Delete');
    expect((await floor(page)).rooms).toHaveLength(4);
    await expect(page.getByText('已刪除 1 個', { exact: true })).toBeVisible();
    await page.getByTestId('toast-action').first().click();
    expect((await floor(page)).rooms).toHaveLength(5);
    expect(errors).toEqual([]);
  });

  test('旋轉：房間連同門與家具順時針轉 90°；家具單獨轉；翻轉', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    await page.keyboard.press('b');
    await drag(page, [0, 0], [8, 4]);
    await page.keyboard.press('d');
    await click(page, 2, 3.8);
    await run(page, 'setTool', 'place', { kind: 'item', t: 'sofa2', rot: 0 });
    await click(page, 6, 2, ['Alt']);
    await click(page, 2, 2);
    await page.keyboard.press('r');
    const f = await floor(page);
    expect(f.rooms[0]).toMatchObject({ x: 2, y: -2, w: 4, h: 8 });
    expect(f.openings[0]).toMatchObject({ o: 'v', x: 2 });
    expect(f.items[0].rot).toBe(90);
    await click(page, f.items[0].x + 0.5, f.items[0].y + 0.5);
    await page.keyboard.press('f');
    expect((await floor(page)).items[0].flip).toBe(true);
    await page.getByTestId('props-panel').getByRole('radio', { name: '180°' }).click();
    expect((await floor(page)).items[0].rot).toBe(180);
    expect(errors).toEqual([]);
  });

  test('屬性面板：名字、PL 名字、種類、GM 筆記、不產生牆；兩下點房間聚焦名字欄', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    const p = await at(page, 13, 4);
    await page.mouse.dblclick(p.x, p.y);
    const name = page.locator('[data-focus="name"]');
    await expect(name).toBeFocused();
    await name.fill('密室');
    await page.getByRole('textbox', { name: '給 PL 看的名字' }).fill('？？？');
    await page.getByRole('combobox', { name: '種類' }).click();
    await page.getByRole('option', { name: '特殊・儀式' }).click();
    await page.getByRole('switch', { name: '不產生牆（例如客餐廳的分區）' }).click();
    await page.getByRole('textbox', { name: 'GM 筆記' }).fill('祭壇下有暗格');
    await page.getByRole('textbox', { name: 'GM 筆記' }).blur();
    const r = (await floor(page)).rooms[1];
    expect(r).toMatchObject({
      name: '密室',
      plName: '？？？',
      cat: 'special',
      noWall: true,
      note: '祭壇下有暗格',
    });
    expect(await walls(page)).toContain('v10:0-8:zone');
    await expect(page.getByTestId('props-readout').first()).toHaveText(
      '面積　3×4m · 12㎡ · 3.6 坪',
    );
    expect(errors).toEqual([]);
  });
});

test.describe('工具列', () => {
  const bg = (loc: ReturnType<Page['locator']>) =>
    loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  const TRANSPARENT = 'rgba(0, 0, 0, 0)';

  for (const width of [1280, 390])
    test(`${width} 寬：按鈕上有快捷鍵字母、目前的工具看得出按下（F30、D14）`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors = await open(page);
      const strip = page.getByTestId('tool-strip');
      for (const [tool, key] of [
        ['select', 'V'],
        ['hand', 'H'],
        ['room', 'B'],
        ['wall', 'W'],
        ['door', 'D'],
        ['window', 'N'],
        ['text', 'T'],
        ['eraser', 'E'],
      ]) {
        const btn = strip.locator(`[data-tool="${tool}"]`);
        const letter = btn.locator('[data-tool-key]');
        await expect(letter).toHaveText(key);
        await expect(letter).toBeVisible();
        /* 字母在按鈕裡面（不擠出去） */
        const [b, l] = [await btn.boundingBox(), await letter.boundingBox()];
        expect(b && l && l.x >= b.x && l.y >= b.y && l.x + l.width <= b.x + b.width + 0.5).toBe(
          true,
        );
        expect(l && b && l.y + l.height <= b.y + b.height + 0.5).toBe(true);
      }
      await noHorizontalScroll(page);
      const room = strip.locator('[data-tool="room"]');
      const select = strip.locator('[data-tool="select"]');
      await expect(select).toHaveAttribute('aria-pressed', 'true');
      /* 底色有 transition（transition-colors）：等變完再看 */
      await expect.poll(() => bg(select)).not.toBe(TRANSPARENT);
      await expect.poll(() => bg(room)).toBe(TRANSPARENT);
      await page.getByTestId('map-canvas').focus();
      await page.keyboard.press('b');
      await expect(room).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => bg(room)).not.toBe(TRANSPARENT);
      await expect.poll(() => bg(select)).toBe(TRANSPARENT);
      expect(errors).toEqual([]);
    });

  test('迷你工具列的線索、GM 按鈕看得出按下（F125）', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    await run(page, 'addObject', 'item', {
      id: 'i1',
      t: 'crate',
      x: 4,
      y: 4,
      w: 1.6,
      h: 1.6,
      rot: 0,
    });
    await click(page, 4.8, 4.8);
    const clue = page.getByTestId('mini-bar').locator('[data-mini="clue"]');
    await expect(clue).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => bg(clue)).toBe(TRANSPARENT);
    await clue.click();
    await expect(clue).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(clue)).not.toBe(TRANSPARENT);
    const gm = page.getByTestId('mini-bar').locator('[data-mini="gm"]');
    await gm.click();
    await expect(gm).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bg(gm)).not.toBe(TRANSPARENT);
    expect(errors).toEqual([]);
  });
});

test.describe('焦點', () => {
  test('按兩下門窗或牆：選取並把焦點放到「種類」（F62）', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.keyboard.press('d');
    await click(page, 4, 7.6);
    await page.keyboard.press('Escape');
    const d = (await floor(page)).openings[0];
    const dp = await at(page, d.x + d.len / 2, d.y);
    await page.mouse.dblclick(dp.x, dp.y);
    const kind = page.locator('[data-focus="kind"]');
    await expect(kind).toBeFocused();
    await expect(kind).toHaveText('單開門');
    expect((await editorState(page)).sel).toEqual([{ type: 'opening', id: d.id }]);
    /* 手畫的牆 */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('w');
    await drag(page, [2, 3], [6, 3]);
    await page.keyboard.press('Escape');
    const wp = await at(page, 4, 3);
    await page.mouse.dblclick(wp.x, wp.y);
    await expect(kind).toBeFocused();
    await expect(kind).toHaveText('內牆');
    expect((await editorState(page)).sel[0].type).toBe('wall');
    expect(errors).toEqual([]);
  });

  test('輸入欄裡按 Esc 離開輸入欄（文字、多行、數字），選取不變；對話框、樓層改名的 Esc 照舊（F174）', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    await click(page, 4, 4);
    const panel = page.getByTestId('props-panel');
    const active = () => page.evaluate(() => document.activeElement?.tagName ?? '');
    for (const field of [
      panel.locator('[data-focus="name"]'),
      panel.getByRole('textbox', { name: 'GM 筆記' }),
      panel.getByRole('spinbutton', { name: 'Y' }),
    ]) {
      await field.click();
      await expect(field).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(field).not.toBeFocused();
      expect(await active()).toBe('BODY');
      expect((await editorState(page)).sel).toHaveLength(1);
    }
    /* 數字欄打到一半按 Esc：一次就離開，打的數字留著 */
    const y = panel.getByRole('spinbutton', { name: 'Y' });
    await y.click();
    await y.fill('2');
    await page.keyboard.press('Escape');
    await expect(y).not.toBeFocused();
    expect((await floor(page)).rooms[0].y).toBe(2);
    await expect(y).toHaveValue('2');
    /* 樓層改名的 Esc＝取消 */
    await page.locator('[data-floor="0"]').dblclick();
    await page.getByTestId('floor-rename').fill('屋頂');
    await page.getByTestId('floor-rename').press('Escape');
    expect((await project(page)).floors[0].name).toBe('1F');
    /* 對話框裡的 Esc 關對話框 */
    await page.getByRole('button', { name: '範本' }).click();
    await expect(page.getByTestId('template-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('template-dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('檢視', () => {
  test('GM／PL 檢視：GM 專用的房間在 PL 檢視蓋灰、裡面的東西藏起來，PL 名字；P 切換', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    await run(page, 'setTool', 'place', { kind: 'item', t: 'safe', rot: 0 });
    await click(page, 13, 4, ['Alt']);
    await click(page, 14.5, 1);
    await page.getByTestId('mini-bar').locator('[data-mini="gm"]').click();
    expect((await floor(page)).rooms[1].gm).toBe(true);
    await click(page, 13, 4, ['Shift']);
    expect((await editorState(page)).sel.map((s) => s.type).sort()).toEqual(['item', 'room']);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('p');
    expect((await editorState(page)).playerView).toBe(true);
    await expect(page.getByRole('radio', { name: 'PL 檢視' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const shown = await page.evaluate(() => {
      const h = (
        window as unknown as {
          __floorPlan: {
            editor: { debugShown: () => Omit<Floor, 'rooms'> & { rooms: { masked?: boolean }[] } };
          };
        }
      ).__floorPlan;
      const f = h.editor.debugShown();
      return { rooms: f.rooms.map((r) => r.masked ?? false), items: f.items.length };
    });
    expect(shown).toEqual({ rooms: [false, true], items: 0 });
    /* 選取中的東西看不到時取消選取（蓋灰的房間還看得到，留著） */
    expect((await editorState(page)).sel.map((s) => s.type)).toEqual(['room']);
    await page.getByRole('radio', { name: 'GM 檢視' }).click();
    expect((await editorState(page)).playerView).toBe(false);
    expect(errors).toEqual([]);
  });

  test('隱藏線索：開關（C）只藏線索，通知個數；記在瀏覽器', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await run(page, 'setTool', 'place', { kind: 'item', t: 'key', rot: 0 });
    await click(page, 4, 4, ['Alt']);
    await page.getByTestId('mini-bar').locator('[data-mini="clue"]').click();
    expect((await floor(page)).items[0].clue).toBe(true);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('c');
    await expect(page.getByText('隱藏線索已藏起來（1 個）', { exact: true })).toBeVisible();
    await expect(page.getByTestId('clue-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect((await editorState(page)).sel).toEqual([]);
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    await expect(page.getByTestId('clue-toggle')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('clue-toggle').click();
    await expect(page.getByText('顯示隱藏線索（1 個）', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('縮放：按鈕、鍵盤、滾輪；顯示全部', async ({ page }) => {
    const errors = await open(page);
    const z0 = (await editorState(page)).zoomPct;
    await page.getByRole('button', { name: '放大（+）' }).click();
    expect((await editorState(page)).zoomPct).toBe(Math.round(z0 * 1.25));
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('-');
    expect(Math.abs((await editorState(page)).zoomPct - z0)).toBeLessThanOrEqual(1);
    const c = (await page.getByTestId('map-canvas').boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.wheel(0, 200);
    expect((await editorState(page)).zoomPct).toBeLessThan(z0);
    await page.getByTestId('zoom-fit').click();
    expect((await editorState(page)).zoomPct).toBe(z0);
    /* 平移工具 */
    await page.keyboard.press('h');
    const v0 = await page.evaluate(() =>
      (window as unknown as { __floorPlan: Hook }).__floorPlan.view(),
    );
    await page.mouse.move(c.x + 200, c.y + 200);
    await page.mouse.down();
    await page.mouse.move(c.x + 260, c.y + 230, { steps: 4 });
    await page.mouse.up();
    const v1 = await page.evaluate(() =>
      (window as unknown as { __floorPlan: Hook }).__floorPlan.view(),
    );
    expect(v1.ox - v0.ox).toBeCloseTo(60, 6);
    expect(v1.oy - v0.oy).toBeCloseTo(30, 6);
    expect(errors).toEqual([]);
  });
});

test('樓層：新增、改名（按兩下）、複製、左右移動、刪除（確認）、［ ］切換', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('floor-add').click();
  let p = await project(page);
  expect([p.floors.map((f) => f.name), p.active]).toEqual([['1F', '2F'], 1]);
  await page.locator('[data-floor="1"]').dblclick();
  await page.getByTestId('floor-rename').fill('屋頂');
  await page.getByTestId('floor-rename').press('Enter');
  await page.getByRole('button', { name: '複製這一層' }).click();
  p = await project(page);
  expect([p.floors.map((f) => f.name), p.active]).toEqual([['1F', '屋頂', '2F'], 2]);
  await page.getByRole('button', { name: '樓層順序往左移（與左邊的樓層對調）' }).click();
  expect((await project(page)).floors.map((f) => f.name)).toEqual(['1F', '2F', '屋頂']);
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('[');
  expect((await project(page)).active).toBe(0);
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  expect((await project(page)).active).toBe(2);
  await page.getByTestId('floor-remove').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除這一層' }).click();
  p = await project(page);
  expect([p.floors.map((f) => f.name), p.active]).toEqual([['1F', '2F'], 1]);
  expect(errors).toEqual([]);
});

test('範本對話框：預設「全部」；空白地圖在每個分類（含「全部」）都是最後一張（F190）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '範本' }).click();
  const dialog = page.getByTestId('template-dialog');
  await expect(dialog.getByRole('radio', { name: '全部' })).toBeChecked();
  const cards = dialog.getByRole('list').getByRole('button');
  /* 2026-10 第三批後半：13 類、範本 56 個，一個範本可以在好幾類（D53；原本 4 類 15 個，D17） */
  await expect(dialog.getByRole('radio')).toHaveText([
    '全部',
    '住宅',
    '住宿・餐飲',
    '醫療・研究',
    '公共場所',
    '商店・辦公',
    '娛樂・表演',
    '交通・運輸',
    '工業・設施',
    '軍警・保全',
    '宗教・古蹟',
    '野外・地下',
    '廢墟・事件',
    '奇幻・科幻',
  ]);
  /* 分類按鈕換行：14 顆都在對話框裡（不擠成看不到的字） */
  const box = await dialog.boundingBox();
  for (const r of await dialog.getByRole('radio').all()) {
    const b = await r.boundingBox();
    expect(
      b && box && b.x >= box.x && b.x + b.width <= box.x + box.width,
      await r.innerText(),
    ).toBe(true);
    expect(await r.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  for (const [tag, n] of [
    ['全部', 58],
    ['住宅', 11],
    ['住宿・餐飲', 7],
    ['醫療・研究', 6],
    ['公共場所', 9],
    ['商店・辦公', 9],
    ['娛樂・表演', 9],
    ['交通・運輸', 6],
    ['工業・設施', 7],
    ['軍警・保全', 5],
    ['宗教・古蹟', 8],
    ['野外・地下', 8],
    ['廢墟・事件', 11],
    ['奇幻・科幻', 6],
  ] as const) {
    await dialog.getByRole('radio', { name: tag }).click();
    await expect(cards, tag).toHaveCount(n);
    await expect(cards.last(), tag).toContainText('空白地圖');
  }
  expect(errors).toEqual([]);
});

test('範本對話框的縮圖：捲到看得到的卡片才畫，畫過的留著（D55）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await open(page);
  await page.getByRole('button', { name: '範本' }).click();
  const dialog = page.getByTestId('template-dialog');
  const cards = dialog.getByRole('list').getByRole('button');
  await expect(cards).toHaveCount(58);
  /* 上面幾排先畫好；最後一個範本（魔法師之塔）捲到之前還沒畫 */
  await expect(cards.first().locator('img')).toHaveCount(1);
  /* 看得到的卡片一張一張畫，第一張畫好時其他的可能還在畫 */
  await expect.poll(() => cards.locator('img').count()).toBeGreaterThan(4);
  const last = dialog.getByRole('button', { name: /^魔法師之塔/ });
  await expect(last.locator('img')).toHaveCount(0);
  expect(await cards.locator('img').count()).toBeLessThan(56);
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator('img')).toHaveCount(1);
  /* 關掉再打開：畫過的直接用 */
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '範本' }).click();
  await expect(cards.first().locator('img')).toHaveCount(1);
  expect(errors).toEqual([]);
});

/**
 * 範本對話框每張卡片離「捲動區的可見範圍」多遠（gap，0＝看得到）、縮圖畫好沒有（空白地圖算畫好）、捲動區的捲動位置。
 * 捲動區＝對話框裡第一個真的會捲動的祖先。
 */
async function thumbGaps(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[data-testid=template-dialog]') as HTMLElement;
    let sc: HTMLElement | null = dialog;
    while (
      sc &&
      !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))
    )
      sc = sc.parentElement;
    if (!sc) throw new Error('找不到對話框的捲動區');
    const r = sc.getBoundingClientRect();
    const cards = [...dialog.querySelectorAll('ul > li')].map((li) => {
      const b = li.getBoundingClientRect();
      return {
        name: li.textContent?.slice(0, 6) ?? '',
        gap: Math.max(0, r.top - b.bottom, b.top - r.bottom),
        /* 空白地圖沒有縮圖（只有加號），一開始就算畫好 */
        blank: !!li.textContent?.includes('空白地圖'),
        drawn: !!li.querySelector('img') || !!li.textContent?.includes('空白地圖'),
      };
    });
    return { cards, scrollTop: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight };
  });
}

for (const [width, height] of [
  [1280, 900],
  [390, 844],
] as const) {
  test(`${width} 寬：範本縮圖看得到的與上下 300 px 內的都會畫，遠的先不畫；慢慢捲動時看得到的不是「…」（D55、7.18）`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const errors = await open(page);
    await page.getByRole('button', { name: '範本' }).click();
    await expect(
      page.getByTestId('template-dialog').getByRole('list').getByRole('button'),
    ).toHaveCount(58);
    /* 上下 300 px 內（少算 5 px，避開剛好壓在邊界上的小數位） */
    const undrawnNear = async () =>
      (await thumbGaps(page)).cards.filter((c) => c.gap <= 295 && !c.drawn).length;
    /* 打開之後不用捲：看得到的與上下 300 px 內的縮圖都會畫 */
    await expect.poll(undrawnNear, { timeout: 20_000 }).toBe(0);
    const first = await thumbGaps(page);
    expect(first.cards.filter((c) => c.gap === 0).length).toBeGreaterThanOrEqual(6);
    expect(first.cards.filter((c) => c.gap > 0 && c.gap <= 295).length).toBeGreaterThan(0);
    /* 離畫面很遠的先不畫（不是一股腦全畫） */
    const far = first.cards.filter((c) => c.gap > 340 && !c.blank);
    expect(far.length).toBeGreaterThan(10);
    expect(far.every((c) => !c.drawn)).toBe(true);
    /* 慢慢捲（每次 120 px）：上下 300 px 內都畫好了，捲動時看得到的不會是「…」（等一幀） */
    let steps = 0;
    for (;;) {
      const s = await thumbGaps(page);
      if (s.scrollTop >= s.max - 1 || steps >= 60) break;
      await page.evaluate(() => {
        const dialog = document.querySelector('[data-testid=template-dialog]') as HTMLElement;
        let sc: HTMLElement | null = dialog;
        while (
          sc &&
          !(
            sc.scrollHeight > sc.clientHeight + 4 &&
            /auto|scroll/.test(getComputedStyle(sc).overflowY)
          )
        )
          sc = sc.parentElement;
        (sc as HTMLElement).scrollTop += 120;
        return new Promise<void>((r) => requestAnimationFrame(() => r()));
      });
      steps++;
      const blank = (await thumbGaps(page)).cards.filter((c) => c.gap === 0 && !c.drawn);
      expect(blank, `第 ${steps} 步：看得到的縮圖還是「…」`).toEqual([]);
      await expect.poll(undrawnNear, { timeout: 20_000 }).toBe(0);
    }
    expect(steps).toBeGreaterThan(5);
    /* 捲到底：全部 56 張都畫好 */
    await expect
      .poll(async () => (await thumbGaps(page)).cards.filter((c) => !c.drawn).length, {
        timeout: 20_000,
      })
      .toBe(0);
    expect(errors).toEqual([]);
  });
}

test('390 寬：範本對話框沒有橫向捲動，13 類的分類按鈕換行、字都看得到', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await page.getByRole('button', { name: '範本' }).click();
  const dialog = page.getByTestId('template-dialog');
  await expect(dialog.getByRole('radio')).toHaveCount(14);
  await noHorizontalScroll(page);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const r of await dialog.getByRole('radio').all())
    expect(
      await r.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      await r.innerText(),
    ).toBe(true);
  await dialog.getByRole('radio', { name: '奇幻・科幻' }).click();
  await expect(dialog.getByRole('list').getByRole('button')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('範本：分類、只載入格局、放入隱藏線索、空白地圖；可以復原', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '範本' }).click();
  const dialog = page.getByTestId('template-dialog');
  await expect(dialog.getByRole('button', { name: /洋館/ })).toBeVisible();
  await dialog.getByRole('radio', { name: '公共場所' }).click();
  await expect(dialog.getByRole('button', { name: /洋館/ })).toHaveCount(0);
  await dialog.getByRole('radio', { name: '全部' }).click();
  await dialog.getByRole('switch', { name: '放入隱藏線索' }).click();
  await dialog.getByRole('button', { name: /洋館/ }).click();
  let p = await project(page);
  expect(p.name).toBe('洋館（地下室～2F）');
  expect(p.floors.map((f) => f.name)).toEqual(['B1', '1F', '2F']);
  expect(p.active).toBe(1);
  expect(p.floors.flatMap((f) => f.texts).filter((t) => t.clue)).toHaveLength(5);
  await expect(page.getByText('已載入「洋館（地下室～2F）」', { exact: true })).toBeVisible();
  /* 廢墟類載入時換成恐怖調查樣式 */
  await page.getByRole('button', { name: '範本' }).click();
  await dialog.getByRole('switch', { name: '只載入格局（不含家具）' }).click();
  await dialog.getByRole('switch', { name: '放入隱藏線索' }).click();
  await dialog.getByRole('button', { name: /廢棄醫院/ }).click();
  p = await project(page);
  expect(p.theme).toBe('horror');
  expect(p.floors.every((f) => f.items.length === 0 && f.texts.length === 0)).toBe(true);
  await page.getByTestId('undo').click();
  expect((await project(page)).name).toBe('洋館（地下室～2F）');
  await page.getByRole('button', { name: '範本' }).click();
  await dialog.getByRole('button', { name: /空白地圖/ }).click();
  p = await project(page);
  expect([p.name, p.floors.length, p.floors[0].rooms.length]).toEqual(['新的地圖', 1, 0]);
  expect((await editorState(page)).tool).toBe('room');
  expect(errors).toEqual([]);
});

test.describe('2026-10 增補的範本', () => {
  /** 從範本對話框載入（分類 → 卡片），回傳載入後的專案 */
  async function loadFromDialog(page: Page, tag: string, name: RegExp) {
    await page.getByRole('button', { name: '範本' }).click();
    const dialog = page.getByTestId('template-dialog');
    await dialog.getByRole('radio', { name: tag }).click();
    await dialog.getByRole('button', { name }).click();
    await expect(page.getByTestId('template-dialog')).toHaveCount(0);
    return project(page);
  }

  test('學校、警察局、圖書館、寺廟、洞窟、山中小屋、地下教團據點都載入得了（分類、樓層、地面層、樣式）', async ({
    page,
  }) => {
    const errors = await open(page);
    for (const [tag, name, title, floors, active, theme] of [
      ['公共場所', /^學校/, '學校（教室大樓）', ['1F', '2F', '屋頂'], 0, 'clean'],
      ['公共場所', /^警察局/, '警察局（派出所）', ['1F'], 0, 'clean'],
      ['公共場所', /^圖書館/, '圖書館（地下書庫）', ['B1', '1F'], 1, 'clean'],
      ['公共場所', /^寺廟/, '寺廟（台灣的廟）', ['1F'], 0, 'clean'],
      ['野外・地下', /^洞窟/, '洞窟', ['洞窟'], 0, 'clean'],
      ['野外・地下', /^地下教團據點/, '地下教團據點', ['B1', '1F'], 1, 'horror'],
      ['住宅', /^山中小屋/, '山中小屋（兩層）', ['1F', '2F'], 0, 'clean'],
    ] as const) {
      const p = await loadFromDialog(page, tag, name);
      expect([p.name, p.floors.map((f) => f.name), p.active, p.theme], title).toEqual([
        title,
        floors,
        active,
        theme,
      ]);
      expect(p.floors.every((f) => f.rooms.length > 0)).toBe(true);
      await expect(page.getByText(`已載入「${title}」`, { exact: true })).toBeVisible();
    }
    /* 放入隱藏線索：寺廟 4 條（小物＋說明都標成線索） */
    await page.getByRole('button', { name: '範本' }).click();
    await page.getByTestId('template-dialog').getByRole('switch', { name: '放入隱藏線索' }).click();
    await page.keyboard.press('Escape');
    const p = await loadFromDialog(page, '公共場所', /^寺廟/);
    const [f] = p.floors;
    expect(f.items.filter((i) => i.clue)).toHaveLength(4);
    expect(f.texts.filter((t) => t.clue).map((t) => t.text.replace('\n', ''))).toContain(
      '金爐旁掉落的照片',
    );
    expect(errors).toEqual([]);
  });

  test('視覺基準：範本對話框的「野外・地下」、洞窟載入後的畫布', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.getByRole('button', { name: '範本' }).click();
    const dialog = page.getByTestId('template-dialog');
    await dialog.getByRole('radio', { name: '野外・地下' }).click();
    const cards = dialog.getByRole('list').getByRole('button');
    /* 2026-10 第三批後半：山中小屋、下水道、洞窟、地下教團據點、露營區、廢礦坑、地下迷宮＋空白地圖（D53） */
    await expect(cards).toHaveCount(8);
    /* 縮圖在打開之後才一張一張畫（看得到的才畫，D55） */
    await expect(cards.locator('img')).toHaveCount(7);
    await page.mouse.move(0, 0);
    await expect(dialog.getByRole('list')).toHaveScreenshot('floor-plan-tpl-wild.png');
    await dialog.getByRole('button', { name: /^洞窟/ }).click();
    await expect(page.getByTestId('template-dialog')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expect(page.getByTestId('map-canvas')).toHaveScreenshot('floor-plan-tpl-cave.png');
    expect(errors).toEqual([]);
  });
});

test.describe('匯出', () => {
  test('PNG：尺寸、檔名、PL 用的 GM 房間蓋灰、GM 用的字帶；透明背景', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.evaluate(() => {
      const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
      h.useProject.getState().replace({ ...h.useProject.getState().data, name: '測試 地圖' });
    });
    await click(page, 13, 4);
    await page.getByTestId('mini-bar').locator('[data-mini="gm"]').click();
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+e');
    const dialog = page.getByTestId('export-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('export-info')).toHaveText('960 × 576 px');
    let [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('測試_地圖_PL.png');
    let img = pngPixels(readFileSync((await dl.path()) as string));
    expect([img.width, img.height]).toEqual([960, 576]);
    /* 2 格留白＝96 px；A 房間內 (2,2) 是客廳色，B 房間內 (13,2) 蓋灰 */
    const at2 = (b: PixelBuffer, x: number, y: number, top = 0) =>
      px(b, Math.round((x + 2) * 48), Math.round((y + 2) * 48 + top));
    expect(at2(img, 2, 6.5)).toEqual([251, 238, 214, 255]);
    const gray = at2(img, 13, 6.5);
    expect(gray[0]).toBeLessThan(230);
    expect(Math.abs(gray[0] - gray[2])).toBeLessThan(12);
    await dialog.getByRole('radio', { name: 'GM 用（全部顯示）' }).click();
    /* 字帶 1.76 格 → 取到整格 2 格（2026-10，F214） */
    await expect(page.getByTestId('export-info')).toHaveText(`960 × ${(12 + 2) * 48} px`);
    [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('測試_地圖_GM.png');
    img = pngPixels(readFileSync((await dl.path()) as string));
    expect(img.height).toBe((12 + 2) * 48);
    await dialog.getByRole('radio', { name: '24px' }).click();
    await dialog.getByRole('switch', { name: '透明背景' }).click();
    [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    img = pngPixels(readFileSync((await dl.path()) as string));
    expect(img.width).toBe(480);
    expect(px(img, 2, img.height - 2)[3]).toBe(0);
    expect(errors).toEqual([]);
  });

  test('範圍對齊整格：寬高是每格 px 的整數倍，開了格線時是 2 格的整數倍（F214、D26）', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 開頁的套房：範圍左上在 (−1.5, −0.5)，以前是 24 × 20.5 格（1152 × 984 px） */
    await page.getByTestId('export-open').click();
    const dialog = page.getByTestId('export-dialog');
    await expect(page.getByTestId('export-info')).toHaveText('1200 × 1008 px');
    await dialog.getByRole('switch', { name: '畫格線' }).click();
    await expect(page.getByTestId('export-info')).toHaveText('1248 × 1056 px');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    const img = pngPixels(readFileSync((await dl.path()) as string));
    expect([img.width, img.height]).toEqual([1248, 1056]);
    expect([img.width % 96, img.height % 96]).toEqual([0, 0]);
    expect(errors).toEqual([]);
  });

  test('好幾層：所有樓層排成一張（標樓層名稱）、每層各一張；空的樓層不匯出', async ({ page }) => {
    const errors = await open(page);
    await run(page, 'loadTemplate', 'hotel', { structureOnly: false, clues: false });
    await page.getByTestId('export-open').click();
    const dialog = page.getByTestId('export-dialog');
    await dialog.getByRole('radio', { name: '24px' }).click();
    await dialog.getByRole('radio', { name: '所有樓層排成一張' }).click();
    const info = await page.getByTestId('export-info').textContent();
    let [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('商務飯店_PL.png');
    const img = pngPixels(readFileSync((await dl.path()) as string));
    expect(`${img.width} × ${img.height} px`).toBe(info);
    await dialog.getByRole('radio', { name: '每層各一張' }).click();
    await expect(page.getByTestId('export-info')).toContainText('× 2');
    const names: string[] = [];
    page.on('download', (d) => names.push(d.suggestedFilename()));
    [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    await expect.poll(() => names.length).toBe(2);
    expect(names).toEqual(['商務飯店_1F_PL.png', '商務飯店_2F_PL.png']);
    /* 空白的一層 */
    await page.keyboard.press('Escape');
    await page.getByTestId('floor-add').click();
    await page.getByTestId('export-open').click();
    await dialog.getByRole('radio', { name: '只有這一層' }).click();
    await expect(dialog.getByText('這一層沒有東西可以匯出。')).toBeVisible();
    await expect(page.getByTestId('export-download')).toBeDisabled();
    expect(errors).toEqual([]);
  });
});

test.describe('存檔', () => {
  test('專案檔：Ctrl＋S 存成 JSON、開啟、原作的 .trpgmap.json 也讀得到', async ({ page }) => {
    const errors = await open(page);
    await page.getByTestId('map-canvas').focus();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    expect(dl.suggestedFilename()).toBe('套房（一房一廳）.floor-plan.json');
    const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    /* 2026-10：圓標加了 texts[].badge（版本 2，D33）；棋子方格加了 tokenGrid（版本 3，D38）；
       第二批的新種類、房間的牆種類、顯示內部（版本 4，D45）；第三批的新家具（版本 5，D52）；
       2026-10-29 跟進原作 v1.15 的雙開拉門與新家具（版本 6，D63） */
    expect(saved).toMatchObject({ format: 'trpg-toolkit-project', tool: 'floor-plan', version: 6 });
    expect(saved.data.floors[0].rooms).toHaveLength(6);
    await blank(page);
    /* 開啟（專案選單） */
    await page.getByRole('button', { name: '專案' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
    await (await chooser).setFiles({
      name: 'a.json',
      mimeType: 'application/json',
      buffer: readFileSync((await dl.path()) as string),
    });
    await expect.poll(async () => (await project(page)).floors[0].rooms.length).toBe(6);
    /* 原作的地圖檔 */
    const legacy = {
      app: 'indoor-map-maker',
      v: 1,
      name: '古い家',
      theme: 'mono',
      showSize: 'jo',
      showNames: true,
      floors: [
        {
          id: 'f',
          name: '1F',
          rooms: [{ id: 'r', x: 0, y: 0, w: 6, h: 4, name: '居間', cat: 'living' }],
          walls: [],
          openings: [],
          items: [
            { id: 'i', t: 'sofa2', x: 1, y: 0, w: 3.2, h: 1.8, rot: 0 },
            { id: 'j', t: 'warp_gate', x: 1, y: 2, w: 1, h: 1, rot: 0 },
          ],
          texts: [],
        },
      ],
      active: 0,
    };
    await page.getByRole('button', { name: '專案' }).click();
    const chooser2 = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '匯入「TRPG 室內圖メーカー」的地圖檔…' }).click();
    await (await chooser2).setFiles({
      name: '古い家.trpgmap.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    await expect(page.getByText('已匯入「古い家」', { exact: true })).toBeVisible();
    /* 家具被略過時寫在同一則通知的說明裡（2026-10 改，F213） */
    await expect(page.getByText('1 件家具略過。詳細', { exact: true })).toBeVisible();
    const p = await project(page);
    expect([p.name, p.theme, p.showSize, p.floors[0].items.map((i) => i.t)]).toEqual([
      '古い家',
      'mono',
      'ping',
      ['sofa2'],
    ]);
    expect(errors).toEqual([]);
  });

  test('開啟的四條路（選單、Ctrl＋O、拖放、匯入）結果相同：原作的檔讀得到、讀不了時「這個檔案讀不進來」＋原因、版本太新的不開（F06、F08、D15）', async ({
    page,
  }) => {
    /* 通知的紀錄（每一則的文字），一樣的通知連續出現也分得出來 */
    await page.addInitScript(() => {
      const w = window as unknown as { __toasts: string[] };
      w.__toasts = [];
      new MutationObserver((muts) => {
        for (const m of muts)
          for (const n of m.addedNodes)
            if (n instanceof HTMLElement && n.matches('li[data-radix-collection-item]'))
              w.__toasts.push(n.innerText);
      }).observe(document, { childList: true, subtree: true });
    });
    const errors = await open(page);
    const toasts = () =>
      page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.slice());
    const legacy = {
      app: 'indoor-map-maker',
      v: 1,
      name: '古い家',
      showSize: 'jo',
      floors: [
        {
          id: 'f',
          name: '1F',
          rooms: [{ id: 'r', x: 0, y: 0, w: 6, h: 4, name: '居間', cat: 'living' }],
          walls: [],
          openings: [],
          items: [],
          texts: [],
        },
      ],
      active: 0,
    };
    const newer = {
      format: 'trpg-toolkit-project',
      tool: 'floor-plan',
      version: 99,
      savedAt: '2030-01-01T00:00:00.000Z',
      data: { ...legacy, app: undefined, name: '未來的地圖' },
    };
    const json = (name: string, data: unknown) => ({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    });
    const FAILED = '這個檔案讀不進來。請選本工具的專案檔，或原作存的 .trpgmap.json。';
    const NEWER = '這個專案檔是用較新版本的工具存的，請重新整理頁面後再開啟。';
    type Way = 'menu' | 'ctrlO' | 'import' | 'drop';
    const openWith = async (way: Way, file: ReturnType<typeof json>) => {
      if (way === 'drop') {
        await page.evaluate(
          ([name, text]) => {
            const dt = new DataTransfer();
            dt.items.add(new File([text], name, { type: 'application/json' }));
            window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
            window.dispatchEvent(
              new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
            );
          },
          [file.name, file.buffer.toString('utf8')] as const,
        );
        return;
      }
      const chooser = page.waitForEvent('filechooser');
      if (way === 'ctrlO') {
        await page.getByTestId('map-canvas').focus();
        await page.keyboard.press('Control+o');
      } else {
        await page.getByRole('button', { name: '專案' }).click();
        await page
          .getByRole('menuitem', {
            name: way === 'menu' ? '開啟專案檔…' : '匯入「TRPG 室內圖メーカー」的地圖檔…',
          })
          .click();
      }
      const fc = await chooser;
      /* 選檔視窗都接受原作的 .trpgmap.json */
      expect(await fc.element().getAttribute('accept')).toContain('.trpgmap');
      await fc.setFiles(file);
    };
    const expectToast = async (n: number, ...texts: string[]) => {
      await expect.poll(async () => (await toasts()).length).toBe(n);
      const last = (await toasts()).at(-1) ?? '';
      for (const t of texts) expect(last).toContain(t);
    };
    const ways: Way[] = ['menu', 'ctrlO', 'import', 'drop'];
    let count = 0;
    for (const way of ways) {
      await blank(page);
      count = (await toasts()).length;
      /* 原作的地圖檔：已匯入＋復原 */
      await openWith(way, json('古い家.trpgmap.json', legacy));
      await expectToast(count + 1, '已匯入「古い家」', '復原');
      expect((await project(page)).name, way).toBe('古い家');
      /* 不是地圖檔：讀不進來＋原因，地圖不變 */
      await openWith(way, json('hello.json', { hello: 'world' }));
      await expectToast(count + 2, FAILED, '這不是 TRPG Toolkit 的專案檔。');
      /* 版本太新的專案檔（D15）：讀不進來＋原因，地圖不變 */
      await openWith(way, json('future.floor-plan.json', newer));
      await expectToast(count + 3, FAILED, NEWER);
      expect((await project(page)).name, way).toBe('古い家');
    }
    expect(errors).toEqual([]);
  });

  test('原作 v1.13 格式的地圖檔：新的門窗、房間、牆種類、家具原樣保留，房間的牆種類與顯示內部照讀；一則通知＋「詳細」（F213、F231、F236、D22～D25、D46）', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __toasts: string[] };
      w.__toasts = [];
      new MutationObserver((muts) => {
        for (const m of muts)
          for (const n of m.addedNodes)
            if (n instanceof HTMLElement && n.matches('li[data-radix-collection-item]'))
              w.__toasts.push(n.innerText);
      }).observe(document, { childList: true, subtree: true });
    });
    const errors = await open(page);
    const toasts = () =>
      page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.slice());
    /* 自己寫的 v1.13 格式範例（只用原作存檔的欄位與種類代號） */
    const v113 = {
      app: 'indoor-map-maker',
      v: 1,
      tool: 'v1.13',
      name: '新版的地圖',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      tokenGrid: 2,
      floors: [
        {
          id: 'site',
          name: '外觀',
          showInside: true,
          inside: 'f1',
          rooms: [{ id: 'b', x: 0, y: 0, w: 20, h: 12, name: '主屋', cat: 'roof' }],
          walls: [],
          openings: [],
          items: [],
          texts: [],
        },
        {
          id: 'f1',
          name: '1F',
          rooms: [
            { id: 'a', x: 0, y: 0, w: 10, h: 12, name: '大廳', cat: 'stone', wall: 'stone' },
            { id: 'm', x: 10, y: 0, w: 10, h: 12, name: '練團室', cat: 'studio', wall: 'sound' },
            { id: 'y', x: 0, y: 12, w: 20, h: 4, name: '前院', cat: 'dirt' },
          ],
          walls: [
            { id: 'w1', x1: 2, y1: 4, x2: 8, y2: 4, kind: 'stone' },
            { id: 'w2', x1: 2, y1: 8, x2: 8, y2: 8, kind: 'sound' },
            { id: 'w3', x1: 12, y1: 4, x2: 12, y2: 10, kind: 'cracked' },
          ],
          openings: [
            { id: 'o1', kind: 'steel', o: 'h', x: 1, y: 0, len: 1.5, side: 1, hinge: 0 },
            { id: 'o2', kind: 'firedoor', o: 'h', x: 4, y: 0, len: 2, side: 1, hinge: 0 },
            { id: 'o3', kind: 'gate', o: 'h', x: 11, y: 0, len: 2, side: 1, hinge: 0 },
            { id: 'o4', kind: 'big2', o: 'h', x: 14, y: 0, len: 5, side: 1, hinge: 0 },
            { id: 'o5', kind: 'revolve', o: 'v', x: 10, y: 1, len: 3, side: 1, hinge: 0 },
            { id: 'o6', kind: 'sealed', o: 'v', x: 10, y: 8, len: 2, side: 1, hinge: 0 },
            { id: 'o7', kind: 'platewin', o: 'v', x: 20, y: 2, len: 2, side: 1, hinge: 0 },
            { id: 'o8', kind: 'open', o: 'h', x: 0.5, y: 12, len: 7.25, side: 1, hinge: 0 },
          ],
          items: [
            { id: 'i1', t: 'sofa2', x: 1, y: 1, w: 3.2, h: 1.8, rot: 0 },
            { id: 'i2', t: 'throne', x: 4, y: 1, w: 2, h: 2, rot: 0 },
            { id: 'i3', t: 'npc_guard', x: 6, y: 1, w: 1, h: 1, rot: 0 },
            { id: 'i4', t: 'wall_hole', x: 12, y: 11.5, w: 2, h: 1, rot: 0 },
            /* 將來的版本才有的家具（本工具不認得） */
            { id: 'i5', t: 'warp_gate', x: 2, y: 6, w: 1, h: 1, rot: 0 },
          ],
          texts: [],
        },
      ],
      active: 1,
    };
    await blank(page);
    /* 「已開新的空白地圖」先出來 */
    await expect.poll(async () => (await toasts()).length).toBeGreaterThan(0);
    const before = (await toasts()).length;
    await page.getByRole('button', { name: '專案' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '匯入「TRPG 室內圖メーカー」的地圖檔…' }).click();
    await (await chooser).setFiles({
      name: '新版的地圖.trpgmap.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(v113)),
    });
    /* 只有一則通知：標題、摘要、「詳細」與「復原」 */
    await expect.poll(async () => (await toasts()).length).toBe(before + 1);
    await page.waitForTimeout(500);
    expect((await toasts()).length).toBe(before + 1);
    const text = (await toasts()).at(-1) ?? '';
    expect(text).toContain('已匯入「新版的地圖」');
    /* 2026-10 第三批起：原作的家具（含疊在牆上的牆洞）都照讀，略過的只剩將來的版本才有的代號 */
    expect(text).toContain('1 件家具略過。');
    expect(text).not.toContain('換成相近的種類');
    expect(text).toContain('詳細');
    expect(text).toContain('復原');
    /* 門窗的種類不變，每一個都把牆切開 */
    const f = await floor(page);
    expect(f.openings.map((o) => o.kind)).toEqual([
      'steel',
      'firedoor',
      'gate',
      'big2',
      'revolve',
      'sealed',
      'platewin',
      'open',
    ]);
    const uncut = await page.evaluate(() => {
      const h = (
        window as unknown as {
          __floorPlan: Hook & { computeWalls: (f: Floor) => { runs: WallRunLike[] } };
        }
      ).__floorPlan;
      const p = h.useProject.getState().data;
      const fl = p.floors[p.active];
      const runs = h.computeWalls(fl).runs;
      return fl.openings
        .filter((o) => {
          const line = o.o === 'h' ? o.y : o.x;
          const mid = (o.o === 'h' ? o.x : o.y) + o.len / 2;
          return runs.some((r) => r.o === o.o && r.c === line && r.a < mid && mid < r.b);
        })
        .map((o) => o.id);
    });
    expect(uncut).toEqual([]);
    /* 房間、手畫的牆的種類不變；每間房的牆種類照讀（戶外的前院沒有設） */
    expect([
      f.rooms.map((r) => r.cat),
      f.rooms.map((r) => r.wall ?? null),
      f.walls.map((w) => w.kind),
    ]).toEqual([
      ['stone', 'studio', 'dirt'],
      ['stone', 'sound', null],
      ['stone', 'sound', 'cracked'],
    ]);
    /* 大廳（石牆 0.6）與練團室（隔音牆 0.48）之間取厚的：石牆 */
    expect(await walls(page)).toContain('v10:0-1:stone');
    /* 原作新增的家具照讀（第三批）；疊在牆上的牆洞是貼牆素材，不再換成牆上的破洞（D46） */
    expect(f.items.map((i) => i.t)).toEqual(['sofa2', 'throne', 'npc_guard', 'wall_hole']);
    /* 外觀層的「顯示內部」照讀：疊上來的是 1F */
    const site = (await project(page)).floors[0];
    expect([site.rooms[0].cat, site.showInside, site.inside]).toEqual(['roof', true, f.id]);
    /* 「詳細」：逐項列出 */
    await page.getByTestId('import-report-open').click();
    const dialog = page.getByRole('dialog', { name: '匯入時的調整' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('import-report-converted')).toHaveCount(0);
    const dropped = dialog.getByTestId('import-report-dropped').getByRole('listitem');
    await expect(dropped).toHaveCount(1);
    await expect(dropped.first()).toContainText('1 件');
    await expect(dropped.first()).toContainText('warp_gate ×1');
    /* 棋子方格（v1.07 的 tokenGrid）照讀，不再算略過 */
    await expect(dropped.filter({ hasText: '棋子方格' })).toHaveCount(0);
    await dialog.getByRole('button', { name: '關閉', exact: true }).click();
    await expect(dialog).toBeHidden();
    /* 棋子方格讀進來了（tokenGrid: 2＝1 m） */
    expect((await project(page)).tokenGrid).toBe(2);
    /* 復原回到匯入前（空白地圖） */
    await page.getByTestId('toast-action').last().click();
    await expect.poll(async () => (await project(page)).name).toBe('新的地圖');
    expect((await project(page)).tokenGrid).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('自動保存：重新整理後還原地圖與偏好；壞掉的存檔換回預設', async ({ page }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: '顯示格線（G）' }).click();
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    expect((await floor(page)).rooms).toHaveLength(2);
    await expect(page.getByRole('switch', { name: '顯示格線（G）' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    /* 復原紀錄不跨頁面 */
    await expect(page.getByTestId('undo')).toBeDisabled();
    await page.evaluate(() =>
      localStorage.setItem(
        'trpg-toolkit:floor-plan',
        JSON.stringify({ state: { data: { floors: 'x' } }, version: 1 }),
      ),
    );
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    expect((await project(page)).name).toBe('套房（一房一廳）');
    expect(errors).toEqual([]);
  });
});

test('快捷鍵說明與使用方式', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Shift+?');
  const help = page.getByRole('dialog', { name: '快捷鍵' });
  await expect(help).toContainText('房間工具（拖曳畫房間）');
  await expect(help).toContainText('切換 GM／PL 檢視');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test.describe('分享連結與房間編號（2026-10，參考 Maptsukuri）', () => {
  /** 範本對話框「專案 → 分享連結…」裡的連結 */
  async function shareLink(page: Page, mode: 'PL 用' | '完整（GM 用）') {
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '分享連結…' }).click();
    const dialog = page.getByTestId('share-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: mode }).click();
    const url = await dialog.locator('textarea').inputValue();
    return { dialog, url };
  }
  /** id 不比（連結裡不放 id） */
  const noIds = (p: Project) =>
    JSON.parse(JSON.stringify(p, (k, v) => (k === 'id' ? undefined : v))) as Project;
  const lastToast = (page: Page) => page.locator('li[data-radix-collection-item]').last();
  /** 直接打開某個網址（分享連結）；回傳主控台錯誤 */
  async function openAt(page: Page, url: string) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await page.goto(url);
    await page.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    return errors;
  }

  test('完整連結：新的瀏覽器環境打開 → 地圖相同、通知可以復原、網址的 # 拿掉（F215、F217）', async ({
    page,
    browser,
  }) => {
    const errors = await open(page);
    await run(page, 'loadTemplate', 'mansion', { structureOnly: false, clues: true });
    await page.waitForTimeout(500);
    const original = await project(page);
    const { dialog, url } = await shareLink(page, '完整（GM 用）');
    expect(new globalThis.URL(url).hash.startsWith('#m=')).toBe(true);
    await expect(dialog).toContainText('連結裡有整張地圖');
    await expect(dialog.getByTestId('share-removed')).toHaveCount(0);
    /* 複製 */
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await dialog.getByRole('button', { name: '複製連結' }).click();
    await expect(page.getByText('已複製分享連結', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    const errors2 = await openAt(other, url);
    await expect(lastToast(other)).toContainText('已開啟分享的地圖「洋館（地下室～2F）」');
    await expect(lastToast(other)).toContainText('復原');
    /* 第一次打開這個工具（開頁的範本沒改過）：不確認 */
    await expect(other.getByRole('alertdialog')).toHaveCount(0);
    expect(new globalThis.URL(other.url()).hash).toBe('');
    expect(noIds(await project(other))).toEqual(noIds(original));
    expect((await editorState(other)).playerView).toBe(false);
    /* 本機原本的地圖（開頁的套房）可以復原回來 */
    await lastToast(other).getByTestId('toast-action').click();
    await expect.poll(async () => (await project(other)).name).toBe('套房（一房一廳）');
    /* 重新整理不會再開一次 */
    await other.reload();
    await other.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    expect((await project(other)).name).toBe('套房（一房一廳）');
    await ctx.close();
    expect([...errors, ...errors2]).toEqual([]);
  });

  test('PL 用連結：GM 專用的房間只剩牆框，GM 的東西、暗門、線索、GM 筆記都不在 store 裡（F216）', async ({
    page,
    browser,
  }) => {
    const errors = await open(page);
    await run(page, 'loadTemplate', 'mansion', { structureOnly: false, clues: true });
    await page.waitForTimeout(500);
    const original = await project(page);
    const { dialog, url } = await shareLink(page, 'PL 用');
    await expect(dialog.getByTestId('share-removed')).toContainText('GM 專用的房間');
    await expect(dialog.getByTestId('share-removed')).toContainText('隱藏線索');
    const gmNames = original.floors.flatMap((f) =>
      f.rooms.filter((r) => r.gm && r.name).map((r) => r.name),
    );
    expect(gmNames.length).toBeGreaterThan(0);

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    const errors2 = await openAt(other, url);
    await expect(lastToast(other)).toContainText('（PL 用）');
    expect(new globalThis.URL(other.url()).hash).toBe('');
    expect((await editorState(other)).playerView).toBe(true);
    const got = await project(other);
    const all = JSON.stringify(got);
    for (const f of got.floors) {
      expect(f.rooms.filter((r) => r.gm).every((r) => r.name === '' && !r.note)).toBe(true);
      expect([...f.items, ...f.texts, ...f.walls, ...f.openings].some((x) => x.gm)).toBe(false);
      expect(f.openings.some((o) => o.kind === 'secret')).toBe(false);
      expect([...f.items, ...f.texts].some((x) => x.clue)).toBe(false);
    }
    for (const n of gmNames) expect(all).not.toContain(`"${n}"`);
    expect(all).not.toContain('"note"');
    expect(all).not.toContain('"plName"');
    /* 換到 GM 檢視也拿不到 */
    await other.getByRole('radio', { name: 'GM 檢視' }).click();
    expect(JSON.stringify(await project(other))).toBe(all);
    await ctx.close();
    expect([...errors, ...errors2]).toEqual([]);
  });

  test('目前的地圖有內容時先確認：取消＝地圖不變、# 拿掉；取代＝可以復原；空白地圖不確認（F217、D29、7.6）', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 要分享的地圖：洞窟 */
    await run(page, 'loadTemplate', 'cave', { structureOnly: false, clues: false });
    const cave = noIds(await project(page));
    const hash = await page.evaluate(() =>
      (
        window as unknown as { __floorPlan: { shareHash: (m: string) => string } }
      ).__floorPlan.shareHash('full'),
    );
    /* 目前的地圖：洋館（有內容），自動儲存 */
    await run(page, 'loadTemplate', 'mansion', { structureOnly: false, clues: false });
    await page.waitForTimeout(600);
    const mansion = noIds(await project(page));
    const confirm = page.getByRole('alertdialog');

    /* 打開連結（重新載入）→ 確認 → 取消：地圖不變、# 拿掉 */
    await page.goto('about:blank');
    await page.goto(`${URL}${hash}`);
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('要用分享的地圖取代目前的地圖嗎？');
    await expect(confirm).toContainText('存成專案檔');
    await confirm.getByRole('button', { name: '取消' }).click();
    await expect(confirm).toHaveCount(0);
    expect(noIds(await project(page))).toEqual(mansion);
    expect(new globalThis.URL(page.url()).hash).toBe('');
    await expect(page.getByText('已開啟分享的地圖', { exact: false })).toHaveCount(0);

    /* 開著的頁面換 # → 確認 → 取代：換成洞窟，通知的「復原」回到洋館 */
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '取代' }).click();
    await expect(lastToast(page)).toContainText('已開啟分享的地圖「洞窟」');
    expect(noIds(await project(page))).toEqual(cave);
    await expect.poll(() => new globalThis.URL(page.url()).hash).toBe('');
    await lastToast(page).getByTestId('toast-action').click();
    await expect.poll(async () => noIds(await project(page))).toEqual(mansion);

    /* 空白地圖：不確認，直接打開 */
    await run(page, 'newMap');
    await page.waitForTimeout(600);
    await page.goto('about:blank');
    await page.goto(`${URL}${hash}`);
    await expect(lastToast(page)).toContainText('已開啟分享的地圖「洞窟」');
    await expect(confirm).toHaveCount(0);
    expect(noIds(await project(page))).toEqual(cave);
    expect(errors).toEqual([]);
  });

  test('壞掉的連結：錯誤通知、地圖不變、# 拿掉；開著的頁面換 # 也讀得到（F217）', async ({
    page,
  }) => {
    const errors = await openAt(page, `${URL}#m=abcdefg`);
    await expect(lastToast(page)).toContainText('分享連結讀不出來。');
    await expect(lastToast(page)).toContainText('地圖沒有改變。');
    expect(new globalThis.URL(page.url()).hash).toBe('');
    expect((await project(page)).name).toBe('套房（一房一廳）');
    /* 開著的頁面換 #：也讀得到 */
    const p = await project(page);
    const hash = await page.evaluate(() => {
      const h = (window as unknown as { __floorPlan: { shareHash: (m: string) => string } })
        .__floorPlan;
      return h.shareHash('full');
    });
    await run(page, 'newMap');
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await expect(lastToast(page)).toContainText('已開啟分享的地圖');
    expect(noIds(await project(page))).toEqual(noIds(p));
    await expect.poll(() => new globalThis.URL(page.url()).hash).toBe('');
    expect(errors).toEqual([]);
  });

  test('圓標樣式、依序編號、匯出 PNG（PL 用的圖沒有 GM 專用的編號）、專案檔（F218、F219）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    /* A (0,0,8,6)、B (8,0,6,6)、GM 專用的 C (0,6,14,6) */
    await page.keyboard.press('b');
    await drag(page, [0, 0], [8, 6]);
    await drag(page, [8, 0], [14, 6]);
    await drag(page, [0, 6], [14, 12]);
    await page.keyboard.press('v');
    await click(page, 7, 9);
    await page.getByTestId('mini-bar').locator('[data-mini="gm"]').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByTestId('number-rooms').click();
    await expect(lastToast(page)).toContainText('已替 3 間房間編號（其中 1 間只有 GM 看得到）');
    let f = await floor(page);
    expect(f.texts.map((t) => [t.text, t.x, t.y, !!t.badge, !!t.gm])).toEqual([
      ['1', 0.7, 0.7, true, false],
      ['2', 8.7, 0.7, true, false],
      ['3', 0.7, 6.7, true, true],
    ]);
    /* 再按一次：重新編號（不會多出一份） */
    await page.waitForTimeout(450);
    await page.getByTestId('number-rooms').click();
    f = await floor(page);
    expect(f.texts).toHaveLength(3);
    /* 一步復原：回到第一次編號後 */
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).texts).toHaveLength(3);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).texts).toHaveLength(0);
    await page.keyboard.press('Control+Shift+z');
    f = await floor(page);

    /* 文字的樣式：一般文字 ↔ 圓標 */
    const t1 = f.texts[0];
    await page.keyboard.press('t');
    await click(page, 4, 3);
    await page.keyboard.press('Escape');
    const plain = (await floor(page)).texts.at(-1) as TextLabel;
    expect(plain.badge).toBeUndefined();
    const style = page.getByRole('radiogroup', { name: '樣式', exact: true });
    await style.getByRole('radio', { name: '圓標' }).click();
    expect((await floor(page)).texts.at(-1)?.badge).toBe(true);
    await page.waitForTimeout(450);
    await style.getByRole('radio', { name: '一般文字' }).click();
    expect((await floor(page)).texts.at(-1)?.badge).toBeUndefined();
    await run(page, 'deleteSelection');

    /* 匯出（每格 48 px）：PL 用的圖 1 號是圓標的深色、3 號（GM 專用）沒有；GM 用的圖 3 號是 GM 色 */
    const frame = await page.evaluate(() => {
      const h = (
        window as unknown as {
          __floorPlan: Hook & {
            parity: {
              exportLayout: (f: Floor[], o: unknown) => { frames: Rect[]; badgeH: number };
            };
          };
        }
      ).__floorPlan;
      const p = h.useProject.getState().data;
      const o = {
        theme: 'clean',
        px: 48,
        showSize: 'none',
        hideNames: false,
        playerView: true,
        hideClues: false,
        grid: false,
        transparent: false,
        gmBadge: null,
      };
      return [
        h.parity.exportLayout([p.floors[0]], o),
        h.parity.exportLayout([p.floors[0]], { ...o, playerView: false, gmBadge: 'GM 用' }),
      ];
    });
    /** 圓標上緣附近（字的上面）：圓的顏色 */
    const ring = (b: PixelBuffer, L: { frames: Rect[]; badgeH: number }, t: TextLabel) =>
      px(
        b,
        Math.round((t.x - L.frames[0].x) * 48),
        Math.round((t.y - 0.6 * 1.5 * 0.4 - L.frames[0].y + L.badgeH) * 48),
      );
    await page.getByTestId('export-open').click();
    const dialog = page.getByTestId('export-dialog');
    let [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    let img = pngPixels(readFileSync((await dl.path()) as string));
    const [b1, , b3] = (await floor(page)).texts;
    expect(ring(img, frame[0], b1)).toEqual([37, 41, 48, 255]);
    expect(ring(img, frame[0], b3)).not.toEqual([37, 41, 48, 255]);
    await dialog.getByRole('radio', { name: 'GM 用（全部顯示）' }).click();
    [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    img = pngPixels(readFileSync((await dl.path()) as string));
    expect(ring(img, frame[1], b1)).toEqual([37, 41, 48, 255]);
    expect(ring(img, frame[1], b3)).toEqual([138, 63, 210, 255]);
    await page.keyboard.press('Escape');

    /* 專案檔：版本 4（2026-10 圓標起 2、棋子方格起 3、第二批起 4）、圓標帶著 */
    await page.getByTestId('map-canvas').focus();
    const [save] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    const saved = JSON.parse(readFileSync((await save.path()) as string, 'utf8'));
    expect(saved.version).toBe(6);
    expect(
      saved.data.floors[0].texts.map((t: TextLabel) => [t.text, t.badge, t.gm ?? false]),
    ).toEqual([
      ['1', true, false],
      ['2', true, false],
      ['3', true, true],
    ]);
    expect(t1.text).toBe('1');
    expect(errors).toEqual([]);
  });
});

test.describe('分享連結與圓標的修正（7.7）', () => {
  const lastToast = (page: Page) => page.locator('li[data-radix-collection-item]').last();
  const shareHash = (page: Page, mode: 'full' | 'pl') =>
    page.evaluate(
      (m) =>
        (
          window as unknown as { __floorPlan: { shareHash: (m: string) => string } }
        ).__floorPlan.shareHash(m),
      mode,
    );
  const addTexts = (page: Page, texts: TextLabel[]) =>
    page.evaluate((ts) => {
      const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
      const p = h.useProject.getState().data;
      h.useProject.getState().replace({
        ...p,
        floors: p.floors.map((f, i) => (i === p.active ? { ...f, texts: [...f.texts, ...ts] } : f)),
      });
    }, texts);

  test('匯出範圍含圓標的外框：靠近邊緣的大圓標、長條圓標不會被切掉（3.8）', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    await page.keyboard.press('b');
    await drag(page, [0, 0], [6, 6]);
    await page.keyboard.press('v');
    await addTexts(page, [
      { id: 'big', x: 3, y: -1.45, text: 'A', size: 4, badge: true },
      { id: 'long', x: 8, y: 3, text: '入口在這裡往右走', size: 1, badge: true },
    ]);
    await page.getByTestId('export-open').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    const img = pngPixels(readFileSync((await dl.path()) as string));
    const white = [255, 255, 255, 255];
    const top = Array.from({ length: img.width }, (_, x) => px(img, x, 0));
    const right = Array.from({ length: img.height }, (_, y) => px(img, img.width - 1, y));
    expect(top.filter((c) => c.join() !== white.join())).toEqual([]);
    expect(right.filter((c) => c.join() !== white.join())).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('打開連結並取代時關掉其他對話框；分享對話框關掉後焦點回到「專案」；390 寬時「連結」不折行', async ({
    page,
  }) => {
    const errors = await open(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const hash = await shareHash(page, 'full');
    /* 分享對話框：Esc 關掉 → 焦點在「專案」 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '分享連結…' }).click();
    const dialog = page.getByTestId('share-dialog');
    await expect(dialog).toBeVisible();
    const title = dialog.getByRole('heading', { name: '連結', exact: true });
    const box = await title.boundingBox();
    expect(box?.height ?? 99).toBeLessThan(26);
    await expect(dialog).toContainText('內容');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.textContent?.trim()))
      .toBe('專案');

    /* 範本對話框開著時打開連結（空白地圖，不確認）→ 範本對話框關掉 */
    await run(page, 'newMap');
    await page.evaluate(
      (patch) =>
        (
          window as unknown as { __floorPlan: { useEditor: { setState: (p: unknown) => void } } }
        ).__floorPlan.useEditor.setState(patch),
      { templatesOpen: true },
    );
    await expect(page.getByTestId('template-dialog')).toBeVisible();
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await expect(lastToast(page)).toContainText('已開啟分享的地圖');
    await expect(page.getByTestId('template-dialog')).toHaveCount(0);
    /* 匯出對話框開著時也一樣（有內容 → 確認 → 取代） */
    await run(page, 'loadTemplate', 'mansion', { structureOnly: false, clues: false });
    await page.evaluate(
      (patch) =>
        (
          window as unknown as { __floorPlan: { useEditor: { setState: (p: unknown) => void } } }
        ).__floorPlan.useEditor.setState(patch),
      { exportOpen: true },
    );
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await page.getByRole('alertdialog').getByRole('button', { name: '取代' }).click();
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('從連結打開時「詳細」對話框寫的是分享連結（不是原作的地圖檔）', async ({ page }) => {
    const errors = await open(page);
    await run(page, 'newMap');
    const hash = await page.evaluate(() => {
      const json = JSON.stringify({
        v: 1,
        d: {
          name: '奇怪的連結',
          floors: [
            {
              name: '1F',
              /* 不認得的房間種類（2026-10 第二批起 stone 等原作的種類都認得，改用將來才有的代號） */
              rooms: [{ x: 0, y: 0, w: 4, h: 4, name: 'A', cat: 'moonbase' }],
              items: [{ t: 'ufo', x: 1, y: 1, w: 1, h: 1 }],
            },
          ],
        },
      });
      return json;
    });
    /* 用工具自己的編碼做出連結 */
    const link = await page.evaluate(async (json) => {
      const bytes = new TextEncoder().encode(json);
      const cs = new CompressionStream('deflate-raw');
      const out = new Uint8Array(
        await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer(),
      );
      let bin = '';
      for (const b of out) bin += String.fromCharCode(b);
      return `#m=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    }, hash);
    await page.evaluate((h) => {
      location.hash = h;
    }, link);
    await expect(lastToast(page)).toContainText('1 個換成相近的種類、1 件家具略過。');
    await page.getByTestId('import-report-open').click();
    const report = page.getByRole('dialog', { name: '打開連結時的調整' });
    await expect(report).toBeVisible();
    await expect(report).toContainText('分享連結');
    await expect(report).not.toContainText('原作');
    expect(errors).toEqual([]);
  });
});

test.describe('第一批跟進（2026-10，原作 v1.05～v1.14）', () => {
  /** 照匯出對話框目前的設定畫出第一張圖，解成像素 */
  async function exportedImage(page: Page) {
    const r = await page.evaluate(() =>
      (
        window as unknown as {
          __floorPlan: {
            exportPng: () => { name: string; width: number; height: number; url: string };
          };
        }
      ).__floorPlan.exportPng(),
    );
    return { ...r, img: pngPixels(Buffer.from(r.url.split(',')[1], 'base64')) };
  }
  const shareHash = (page: Page, mode: 'full' | 'pl') =>
    page.evaluate(
      (m) =>
        (
          window as unknown as { __floorPlan: { shareHash: (m: string) => string } }
        ).__floorPlan.shareHash(m),
      mode,
    );
  /** 地圖設定（沒有選取）或匯出對話框的「棋子方格」選單 */
  async function chooseTokenGrid(page: Page, testId: string, label: string) {
    await page.getByTestId(testId).click();
    await page.getByRole('option', { name: label, exact: true }).click();
  }
  const dark = (c: number[]) => c[0] < 100;
  const white = [255, 255, 255, 255];

  test('棋子方格：地圖設定、不透明度、畫在家具上面；匯出的圖從左上角的方格線開始（F220、F221）', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    /* 一件家具跨過 x＝4 的方格線 */
    await run(page, 'addObject', 'item', {
      id: 'sofa',
      t: 'sofa2',
      x: 3,
      y: 2,
      w: 3.2,
      h: 1.8,
      rot: 0,
    });
    /* 沒有選取的東西時，屬性面板是地圖設定 */
    await page.keyboard.press('Escape');
    expect((await editorState(page)).sel).toEqual([]);
    const panel = page.getByTestId('props-panel');
    await expect(page.getByTestId('token-grid-size')).toContainText('不顯示');
    await expect(panel.getByText('方格的顏色')).toHaveCount(0);
    expect((await project(page)).tokenGrid).toBeUndefined();
    await chooseTokenGrid(page, 'token-grid-size', '1 m');
    expect((await project(page)).tokenGrid).toBe(2);
    await expect(panel.getByText('方格的顏色')).toBeVisible();
    await expect(panel.getByText('方格的不透明度').first()).toBeVisible();
    /* 不透明度：滑桿 End＝100% */
    const slider = page.getByRole('slider', { name: '方格的不透明度' });
    await slider.focus();
    await page.keyboard.press('End');
    expect((await project(page)).tokenGridOpacity).toBe(1);
    await page.getByTestId('map-canvas').focus();

    /* 匯出（PL 用、每格 48 px）：960 × 576，每格 1 m＝96 px */
    await page.getByTestId('export-open').click();
    await expect(page.getByTestId('export-info')).toHaveText('960 × 576 px');
    await expect(page.getByTestId('export-token-info')).toHaveText('棋子方格：每格 1 m ＝ 96 px');
    let r = await exportedImage(page);
    expect([r.width, r.height, r.img.width, r.img.height]).toEqual([960, 576, 960, 576]);
    /* 圖的最左邊與最上面是方格線，每 96 px 一條；格線之間是留白（白） */
    expect(dark(px(r.img, 0, 10))).toBe(true);
    expect(dark(px(r.img, 10, 0))).toBe(true);
    expect(px(r.img, 48, 10)).toEqual(white);
    for (const x of [96, 192, 288])
      expect(dark(px(r.img, x, 10)) || dark(px(r.img, x - 1, 10))).toBe(true);
    expect(px(r.img, 60, 10)).toEqual(white);
    /* 畫在家具的上面：沙發（世界座標 3～6.2 × 2～3.8）裡 x＝4 的方格線還看得到 */
    const sy = Math.round((2.9 + 2) * 48);
    expect(dark(px(r.img, 288, sy)) || dark(px(r.img, 287, sy))).toBe(true);
    expect(px(r.img, Math.round((4.5 + 2) * 48), sy)[0]).toBeGreaterThan(100);

    /* 1.5 m（3 格）：範圍對齊 3 格，左上角仍在方格線上 */
    await chooseTokenGrid(page, 'export-token-grid', '1.5 m');
    expect((await project(page)).tokenGrid).toBe(3);
    await expect(page.getByTestId('export-info')).toHaveText('1008 × 720 px');
    await expect(page.getByTestId('export-token-info')).toHaveText(
      '棋子方格：每格 1.5 m ＝ 144 px',
    );
    r = await exportedImage(page);
    expect([r.img.width % 144, r.img.height % 144]).toEqual([0, 0]);
    expect(dark(px(r.img, 0, 10))).toBe(true);
    expect(dark(px(r.img, 10, 0))).toBe(true);
    expect(px(r.img, 72, 10)).toEqual(white);
    expect(dark(px(r.img, 144, 10)) || dark(px(r.img, 143, 10))).toBe(true);
    /* 每格大小 24 px：每格 72 px */
    const exportDialog = page.getByTestId('export-dialog');
    await exportDialog.getByRole('radio', { name: '24px' }).click();
    await expect(page.getByTestId('export-token-info')).toHaveText('棋子方格：每格 1.5 m ＝ 72 px');
    await expect(page.getByTestId('export-info')).toHaveText('504 × 360 px');
    await exportDialog.getByRole('radio', { name: '48px' }).click();
    /* GM 用：字帶的高度也對齊（取到 3 格） */
    await exportDialog.getByRole('radio', { name: 'GM 用（全部顯示）' }).click();
    await expect(page.getByTestId('export-info')).toHaveText('1008 × 864 px');
    r = await exportedImage(page);
    expect([r.img.width % 144, r.img.height % 144]).toEqual([0, 0]);
    expect(dark(px(r.img, 0, 10 + 144))).toBe(true);
    /* 開了「畫格線」：2 格與 3 格的最小公倍數＝6 格（288 px） */
    await exportDialog.getByRole('switch', { name: '畫格線' }).click();
    const info = await page.getByTestId('export-info').innerText();
    const [w, h] = info.split(' px')[0].split(' × ').map(Number);
    expect([w % 288, h % 288]).toEqual([0, 0]);
    await page.keyboard.press('Escape');

    /* 專案檔帶著（版本 3 起；第二批起 4） */
    await page.getByTestId('map-canvas').focus();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(saved).toMatchObject({ version: 6 });
    expect([saved.data.tokenGrid, saved.data.tokenGridOpacity]).toEqual([3, 1]);
    expect(errors).toEqual([]);
  });

  test('棋子方格：復原、重新整理後還原、新的空白地圖保留、PL 用連結帶著、原作的 tokenGrid 讀得到（F220）', async ({
    page,
    browser,
  }) => {
    const errors = await open(page);
    await blank(page);
    await page.waitForTimeout(500);
    await chooseTokenGrid(page, 'token-grid-size', '2 m');
    expect((await project(page)).tokenGrid).toBe(4);
    /* 復原一步就沒有了 */
    await run(page, 'undo');
    expect((await project(page)).tokenGrid).toBeUndefined();
    await run(page, 'redo');
    expect((await project(page)).tokenGrid).toBe(4);
    await page.waitForTimeout(600);
    /* 自動保存 */
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    expect((await project(page)).tokenGrid).toBe(4);
    await expect(page.getByTestId('token-grid-size')).toContainText('2 m');
    /* 新的空白地圖保留方格設定 */
    await run(page, 'newMap');
    expect((await project(page)).tokenGrid).toBe(4);
    /* 分享連結（PL 用）帶著方格；另一個瀏覽器環境打開 */
    await run(page, 'loadTemplate', 'studio', { structureOnly: false, clues: false });
    const hash = await shareHash(page, 'pl');
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    const errors2: string[] = [];
    other.on('pageerror', (e) => errors2.push(e.message));
    await other.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await other.goto(`${URL}${hash}`);
    await other.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    await expect.poll(async () => (await project(other)).tokenGrid).toBe(4);
    await ctx.close();
    /* 原作 v1.07 的地圖檔：tokenGrid＝3（1.5 m）照讀，通知裡不算略過 */
    const legacy = {
      app: 'indoor-map-maker',
      v: 1,
      tool: 'v1.07',
      name: '方格的地圖',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      tokenGrid: 3,
      floors: [
        {
          id: 'f',
          name: '1F',
          rooms: [{ id: 'r', x: 0, y: 0, w: 6, h: 4, name: '居間', cat: 'living' }],
          walls: [],
          openings: [],
          items: [],
          texts: [],
        },
      ],
      active: 0,
    };
    await page.getByRole('button', { name: '專案' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '匯入「TRPG 室內圖メーカー」的地圖檔…' }).click();
    await (await chooser).setFiles({
      name: '方格.trpgmap.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    await expect(page.getByText('已匯入「方格的地圖」', { exact: true })).toBeVisible();
    expect((await project(page)).tokenGrid).toBe(3);
    await expect(page.getByText('項設定略過')).toHaveCount(0);
    expect([...errors, ...errors2]).toEqual([]);
  });

  test('不透明度滑桿有焦點時直接 Ctrl＋Z：只退回滑桿的值；再 Ctrl＋Z 回到不顯示；重做依序回來（F220、7.10）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    await page.waitForTimeout(500);
    await chooseTokenGrid(page, 'token-grid-size', '1 m');
    expect((await project(page)).tokenGrid).toBe(2);
    await page.waitForTimeout(500);
    /* 滑桿聚焦（開始一個手勢）、用鍵盤調 3 次（40% → 55%），焦點不離開 */
    const slider = page.getByRole('slider', { name: '方格的不透明度' });
    await slider.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    expect((await project(page)).tokenGridOpacity).toBe(0.55);
    await expect(slider).toBeFocused();
    /* 直接 Ctrl＋Z：只退回滑桿的值（方格大小還在） */
    await page.keyboard.press('Control+z');
    let p = await project(page);
    expect([p.tokenGrid, p.tokenGridOpacity]).toEqual([2, undefined]);
    await expect(page.getByText('沒有可以復原的步驟')).toHaveCount(0);
    /* 再 Ctrl＋Z：回到不顯示 */
    await page.keyboard.press('Control+z');
    p = await project(page);
    expect([p.tokenGrid, p.tokenGridOpacity]).toEqual([undefined, undefined]);
    /* 重做依序回來 */
    await page.keyboard.press('Control+Shift+z');
    p = await project(page);
    expect([p.tokenGrid, p.tokenGridOpacity]).toEqual([2, undefined]);
    await page.keyboard.press('Control+Shift+z');
    p = await project(page);
    expect([p.tokenGrid, p.tokenGridOpacity]).toEqual([2, 0.55]);
    /* 離開滑桿（blur）之後沒有多記一步：復原兩次剛好回到不顯示 */
    await page.getByTestId('map-canvas').focus();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    p = await project(page);
    expect([p.tokenGrid, p.tokenGridOpacity]).toEqual([undefined, undefined]);
    expect(errors).toEqual([]);
  });

  test('沿著牆拖曳放門窗：長度跟著拖曳（對齊 0.25 格）、停在別的門窗旁、沒拖就照預設寬度；一步復原（F223）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    await page.keyboard.press('b');
    await drag(page, [0, 0], [10, 8]);
    await page.keyboard.press('v');
    /* 窗（N）：在上面的外牆 x＝2 按下、拖到 5.1（對齊 → 5） */
    await page.keyboard.press('n');
    await drag(page, [2, 0], [5.1, 0]);
    let f = await floor(page);
    expect(f.openings).toHaveLength(1);
    expect(f.openings[0]).toMatchObject({ kind: 'window', o: 'h', x: 2, y: 0, len: 3 });
    expect((await editorState(page)).tool).toBe('window');
    expect(await walls(page)).toEqual(expect.arrayContaining(['h0:0-2:ext', 'h0:5-10:ext']));
    /* 一次放下＝一步復原 */
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).openings).toHaveLength(0);
    await page.keyboard.press('Control+Shift+z');
    expect((await floor(page)).openings).toHaveLength(1);
    /* 門（D）：x＝7 按下往左拖過頭（到 0）→ 停在窗的右邊（5） */
    await page.keyboard.press('d');
    await drag(page, [7, 0], [0, 0]);
    f = await floor(page);
    expect(f.openings).toHaveLength(2);
    expect(f.openings[1]).toMatchObject({ kind: 'door', o: 'h', x: 5, y: 0, len: 2 });
    /* 往右拖到牆段的盡頭以外：不超出牆段（10） */
    await drag(page, [8, 0], [14, 0]);
    expect((await floor(page)).openings[2]).toMatchObject({ kind: 'door', x: 8, len: 2 });
    /* 沒拖（點一下）：照預設寬度（門 1.5 格）；垂直的牆上也可以拖 */
    await click(page, 10, 3);
    expect((await floor(page)).openings[3]).toMatchObject({
      kind: 'door',
      o: 'v',
      x: 10,
      y: 2.25,
      len: 1.5,
    });
    await drag(page, [10, 5], [10, 7.6]);
    expect((await floor(page)).openings[4]).toMatchObject({ o: 'v', y: 5, len: 2.5 });
    expect(await walls(page)).toEqual(
      expect.arrayContaining(['v10:0-2.25:ext', 'v10:3.75-5:ext', 'v10:7.5-8:ext']),
    );
    expect(errors).toEqual([]);
  });

  test('沿牆拖曳：「開口」「牆上的破洞」挖掉任意長度的一段牆；Esc 取消；放好後仍可用控制點改寬度（F223、F111）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    await page.keyboard.press('b');
    await drag(page, [0, 0], [10, 8]);
    await page.keyboard.press('v');
    await page.getByRole('tab', { name: '門窗' }).click();
    await page.getByTestId('library').locator('[data-opening="open"]').click();
    await drag(page, [1, 8], [9.5, 8]);
    expect((await floor(page)).openings[0]).toMatchObject({
      kind: 'open',
      o: 'h',
      y: 8,
      x: 1,
      len: 8.5,
    });
    const w1 = await walls(page);
    expect(w1).toEqual(expect.arrayContaining(['h8:0-1:ext', 'h8:9.5-10:ext']));
    expect(w1.filter((w) => w.startsWith('h8:'))).toHaveLength(2);
    await page.getByTestId('library').locator('[data-opening="hole"]').click();
    await drag(page, [0, 2], [0, 6.1]);
    expect((await floor(page)).openings[1]).toMatchObject({
      kind: 'hole',
      o: 'v',
      x: 0,
      y: 2,
      len: 4,
    });
    /* Esc：拖曳到一半取消，什麼都沒放 */
    const a = await at(page, 4, 0);
    const b = await at(page, 7, 0);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    expect((await floor(page)).openings).toHaveLength(3);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await floor(page)).openings).toHaveLength(2);
    /* 放好之後選取工具的控制點照舊可以改寬度 */
    await page.keyboard.press('v');
    await click(page, 5, 8);
    const o = (await floor(page)).openings[0];
    expect((await editorState(page)).sel).toEqual([{ type: 'opening', id: o.id }]);
    await drag(page, [9.5, 8], [8, 8]);
    expect((await floor(page)).openings[0]).toMatchObject({ x: 1, len: 7 });
    expect(errors).toEqual([]);
  });

  /** 房間 (0,0,10,8)：裡面有家具、文字、一道隔間牆、邊上有一扇門；旁邊一間空房 (10,0,6,8) */
  async function roomWithThings(page: Page) {
    await twoRooms(page);
    await run(page, 'addObject', 'item', {
      id: 'sofa',
      t: 'sofa2',
      x: 2,
      y: 4,
      w: 3.2,
      h: 1.8,
      rot: 0,
    });
    await run(page, 'addObject', 'text', { id: 'note', x: 6, y: 2, text: '說明' });
    await run(page, 'addObject', 'wall', { id: 'wl', x1: 5, y1: 6, x2: 8, y2: 6, kind: 'int' });
    await run(page, 'addObject', 'opening', {
      id: 'dr',
      kind: 'door',
      o: 'h',
      x: 4,
      y: 0,
      len: 1.5,
      side: 1,
      hinge: 0,
    });
    await page.keyboard.press('v');
  }
  const counts = async (page: Page) => {
    const f = await floor(page);
    return [f.rooms.length, f.items.length, f.texts.length, f.walls.length, f.openings.length];
  };

  test('刪除有東西的房間：只刪房間／連裡面的東西一起刪／取消；一步復原（F224）', async ({
    page,
  }) => {
    const errors = await open(page);
    await roomWithThings(page);
    expect(await counts(page)).toEqual([2, 1, 1, 1, 1]);
    const dialog = page.getByRole('alertdialog');
    /* 取消：什麼都不刪 */
    await click(page, 8, 1);
    await page.keyboard.press('Delete');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('刪除「房間」？');
    await expect(dialog).toContainText('房間裡還有 1 件家具、1 則文字、1 個門窗、1 道牆');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await counts(page)).toEqual([2, 1, 1, 1, 1]);
    /* 只刪房間：東西留著；一步復原 */
    await page.keyboard.press('Delete');
    await dialog.getByRole('button', { name: '只刪房間' }).click();
    expect(await counts(page)).toEqual([1, 1, 1, 1, 1]);
    await expect(page.getByText('已刪除 1 個', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+z');
    expect(await counts(page)).toEqual([2, 1, 1, 1, 1]);
    /* Esc 關掉對話框＝取消；連裡面的東西一起刪，一步復原 */
    await click(page, 8, 1);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await counts(page)).toEqual([2, 1, 1, 1, 1]);
    await page.keyboard.press('Delete');
    await dialog.getByRole('button', { name: '連裡面的東西一起刪' }).click();
    expect(await counts(page)).toEqual([1, 0, 0, 0, 0]);
    await expect(page.getByText('已刪除 5 個', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+z');
    expect(await counts(page)).toEqual([2, 1, 1, 1, 1]);
    await page.keyboard.press('Control+Shift+z');
    expect(await counts(page)).toEqual([1, 0, 0, 0, 0]);
    expect(errors).toEqual([]);
  });

  test('刪除房間：空的房間不問；屬性面板與迷你工具列的刪除會問；剪下、橡皮擦不問；鎖定的房間略過（F224）', async ({
    page,
  }) => {
    const errors = await open(page);
    await roomWithThings(page);
    const dialog = page.getByRole('alertdialog');
    /* 旁邊的空房間：直接刪 */
    await click(page, 14, 4);
    await page.keyboard.press('Delete');
    await expect(dialog).toHaveCount(0);
    expect(await counts(page)).toEqual([1, 1, 1, 1, 1]);
    /* 屬性面板的刪除鈕也會問 */
    await click(page, 8, 1);
    await page.getByTestId('props-panel').getByRole('button', { name: '刪除' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '取消' }).click();
    /* 迷你工具列的刪除也會問 */
    await page.getByTestId('mini-bar').locator('[data-mini="delete"]').click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '只刪房間' }).click();
    expect(await counts(page)).toEqual([0, 1, 1, 1, 1]);
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+z');
    expect(await counts(page)).toEqual([1, 1, 1, 1, 1]);
    /* 剪下：連同裡面的東西帶走，不問；貼上帶回來 */
    await click(page, 8, 1);
    await page.keyboard.press('Control+x');
    await expect(dialog).toHaveCount(0);
    expect(await counts(page)).toEqual([0, 0, 0, 0, 0]);
    await page.keyboard.press('Control+v');
    expect(await counts(page)).toEqual([1, 1, 1, 1, 1]);
    /* 鎖定的房間：略過、不問 */
    await run(page, 'toggleLock');
    await page.keyboard.press('Delete');
    await expect(dialog).toHaveCount(0);
    expect(await counts(page)).toEqual([1, 1, 1, 1, 1]);
    await run(page, 'toggleLock');
    /* 橡皮擦：點房間照舊只刪房間（不問，可以復原） */
    await page.keyboard.press('e');
    await click(page, 8, 1);
    await expect(dialog).toHaveCount(0);
    expect((await counts(page))[0]).toBe(0);
    expect(errors).toEqual([]);
  });

  test('範本的後台類房間預設只有 GM 看得到：圖書館的機房、倉庫、館員辦公室；PL 檢視只剩牆框；可以關掉（F225）', async ({
    page,
  }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '範本' }).click();
    const dialog = page.getByTestId('template-dialog');
    await dialog.getByRole('radio', { name: '公共場所' }).click();
    await dialog.getByRole('button', { name: /^圖書館/ }).click();
    const p = await project(page);
    const gm = p.floors.flatMap((f) =>
      f.rooms.filter((r) => r.gm).map((r) => `${f.name}/${r.name}`),
    );
    expect(gm.sort()).toEqual(['1F/館員辦公室', 'B1/倉庫', 'B1/禁書庫', 'B1/機房'].sort());
    /* 有線索的房間與一進門就看得到的房間不是 GM 專用 */
    const open1 = p.floors.flatMap((f) => f.rooms.filter((r) => !r.gm).map((r) => r.name));
    for (const n of ['修復室', '古籍室', '大廳・服務台', '開架閱覽區']) expect(open1).toContain(n);
    /* PL 檢視（地面層 1F）：館員辦公室只剩牆框，沒有名字 */
    await page.getByRole('radio', { name: 'PL 檢視' }).click();
    const masked = () =>
      page.evaluate(() => {
        const h = (
          window as unknown as {
            __floorPlan: {
              editor: { debugShown: () => { rooms: { name: string; masked?: boolean }[] } };
            };
          }
        ).__floorPlan;
        return h.editor
          .debugShown()
          .rooms.filter((r) => r.masked)
          .map((r) => r.name);
      });
    expect(await masked()).toEqual(['']);
    await page.getByRole('radio', { name: 'GM 檢視' }).click();
    /* 在屬性面板關掉「只有 GM 看得到」：選取館員辦公室 → 關閉 → 復原回來 */
    const office = (await floor(page)).rooms.find((r) => r.name === '館員辦公室');
    expect(office?.gm).toBe(true);
    await page.evaluate((id) => {
      (
        window as unknown as {
          __floorPlan: {
            useEditor: { setState: (s: { sel: { type: string; id: string }[] }) => void };
          };
        }
      ).__floorPlan.useEditor.setState({ sel: [{ type: 'room', id: id as string }] });
    }, office?.id);
    await page
      .getByTestId('props-panel')
      .getByRole('switch', { name: /只有 GM 看得到/ })
      .click();
    expect((await floor(page)).rooms.find((r) => r.name === '館員辦公室')?.gm).toBeUndefined();
    await page.waitForTimeout(500);
    await run(page, 'undo');
    expect((await floor(page)).rooms.find((r) => r.name === '館員辦公室')?.gm).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('第二批跟進（2026-10，原作 v1.05～v1.14）：新的門窗、牆、房間種類、外觀層', () => {
  async function exportedImage(page: Page) {
    const r = await page.evaluate(() =>
      (
        window as unknown as {
          __floorPlan: {
            exportPng: () => { name: string; width: number; height: number; url: string };
          };
        }
      ).__floorPlan.exportPng(),
    );
    return { ...r, img: pngPixels(Buffer.from(r.url.split(',')[1], 'base64')) };
  }
  /** 中點還在牆上（沒有被切開）的門窗 */
  const uncut = (page: Page) =>
    page.evaluate(() => {
      const h = (
        window as unknown as {
          __floorPlan: Hook & { computeWalls: (f: Floor) => { runs: WallRunLike[] } };
        }
      ).__floorPlan;
      const p = h.useProject.getState().data;
      const fl = p.floors[p.active];
      const runs = h.computeWalls(fl).runs;
      return fl.openings
        .filter((o) => {
          const line = o.o === 'h' ? o.y : o.x;
          const mid = (o.o === 'h' ? o.x : o.y) + o.len / 2;
          return runs.some((r) => r.o === o.o && r.c === line && r.a < mid && mid < r.b);
        })
        .map((o) => o.id);
    });
  /** 編輯畫面點得到的東西（外觀層「顯示內部」時只有外觀層自己的東西；PL 檢視照 PL 規則） */
  const shown = (page: Page) =>
    page.evaluate(() => {
      const h = (
        window as unknown as {
          __floorPlan: {
            editor: {
              debugShown: () => {
                rooms: { name: string }[];
                openings: unknown[];
                items: unknown[];
              };
            };
          };
        }
      ).__floorPlan;
      const f = h.editor.debugShown();
      return {
        rooms: f.rooms.map((r) => r.name),
        openings: f.openings.length,
        items: f.items.length,
      };
    });
  const near = (c: number[], hex: string, tol = 6) => {
    const want = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    return want.every((v, i) => Math.abs(v - c[i]) <= tol);
  };
  const library = (page: Page) => page.getByTestId('library');

  test('新的門窗 7 種：從門窗分頁放、切開牆、屬性面板（種類、鉸鍊）、PL 檢視與匯出 PNG 抽查、只有 GM 看得到（F226）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    /* 縮小一點（30 格寬的房間放得進畫面） */
    for (let i = 0; i < 3; i++) await page.keyboard.press('-');
    await page.keyboard.press('b');
    await drag(page, [0, 0], [30, 10]);
    await page.getByRole('tab', { name: '門窗' }).click();
    /* 門 19、窗 6、牆 12 張卡片（2026-10-29：雙開拉門） */
    await expect(library(page).locator('[data-opening]')).toHaveCount(25);
    await expect(library(page).locator('[data-wall]')).toHaveCount(12);
    const place: [string, number, number][] = [
      ['steel', 2, 0.3],
      ['firedoor', 5, 0.3],
      ['gate', 8, 0.3],
      ['big2', 13, 0.3],
      ['revolve', 19, 0.3],
      ['sealed', 24.5, 0.3],
      ['platewin', 29.7, 5],
    ];
    for (const [kind, x, y] of place) {
      await library(page).locator(`[data-opening="${kind}"]`).click();
      expect((await editorState(page)).tool).toBe(kind === 'platewin' ? 'window' : 'door');
      await click(page, x, y);
      await page.waitForTimeout(450);
    }
    const f = await floor(page);
    /* （縮小後拖曳出來的座標可能是 -0，+ 0 換成 0 再比） */
    expect(f.openings.map((o) => [o.kind, o.o, o.x + 0, o.y + 0, o.len, o.side])).toEqual([
      ['steel', 'h', 1.25, 0, 1.5, 1],
      ['firedoor', 'h', 4, 0, 2, 1],
      ['gate', 'h', 7, 0, 2, 1],
      ['big2', 'h', 10.5, 0, 5, 1],
      ['revolve', 'h', 17, 0, 4, 1],
      ['sealed', 'h', 23.5, 0, 2, 1],
      ['platewin', 'v', 30, 4, 2, -1],
    ]);
    /* 每一個都把牆切開 */
    expect(await uncut(page)).toEqual([]);

    /* 屬性面板：鐵門有「換鉸鍊那一邊」，封印的門沒有；種類可以換、一步復原 */
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await click(page, 2, 0);
    await expect(page.getByTestId('props-title')).toHaveText('鐵門');
    /* 屬性面板與迷你工具列各一顆 */
    await expect(page.getByRole('button', { name: '換鉸鍊那一邊' })).toHaveCount(2);
    await click(page, 24.5, 0);
    await expect(page.getByTestId('props-title')).toHaveText('封印的門');
    await expect(page.getByRole('button', { name: '換鉸鍊那一邊' })).toHaveCount(0);
    await page.getByTestId('props-panel').locator('[data-focus="kind"]').click();
    await page.getByRole('option', { name: '旋轉門', exact: true }).click();
    expect((await floor(page)).openings[5].kind).toBe('revolve');
    await page.waitForTimeout(450);
    await run(page, 'undo');
    expect((await floor(page)).openings[5].kind).toBe('sealed');

    /* PL 檢視：新的門窗都照樣看得到（不是秘密） */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('p');
    expect((await shown(page)).openings).toBe(7);
    await page.keyboard.press('p');

    /* 匯出 PNG（PL 用、每格 48 px）：範圍（-2,-5）～（33,12）＝ 1680 × 816 */
    let r = await exportedImage(page);
    expect([r.width, r.height]).toEqual([1680, 816]);
    const at48 = (x: number, y: number) =>
      px(r.img, Math.round((x + 2) * 48), Math.round((y + 5) * 48));
    /* 防火門的門板（警示色）：鉸鍊在 x＝4，往下開 */
    const fire = at48(4, 1);
    expect(fire[0]).toBeGreaterThan(180);
    expect(fire[1]).toBeLessThan(110);
    /* 鐵門的門板（灰色的鐵板） */
    expect(near(at48(1.25, 1), '#8d939d', 20)).toBe(true);
    /* 旋轉門的中心（門的顏色）、封印的門的封印（淡紫） */
    expect(at48(19, 0)[0]).toBeLessThan(100);
    expect(near(at48(24.5, 0), '#e7d2f0', 12)).toBe(true);
    /* 鐵板封住的窗：灰色的鐵板 */
    const plate = at48(30.08, 4.55);
    expect(plate[0]).toBeGreaterThan(120);
    expect(plate[0]).toBeLessThan(200);

    /* 封印的門設成只有 GM 看得到：PL 用的圖裡那裡是一般的牆（深色） */
    await click(page, 24.5, 0);
    await page
      .getByTestId('props-panel')
      .getByRole('switch', { name: /只有 GM 看得到/ })
      .click();
    r = await exportedImage(page);
    expect(at48(24.5, 0)[0]).toBeLessThan(80);
    expect(errors).toEqual([]);
  });

  test('新的牆 3 種與房間的牆種類：屬性面板設定（兩間都有設時取厚的）、戶外房間沒有、牆工具、復原、匯出（F227、F228）', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    await click(page, 5, 4);
    const wallSelect = page.getByRole('combobox', { name: '這間房的牆' });
    await expect(wallSelect).toContainText('自動（外牆・內牆）');
    await wallSelect.click();
    /* 選單：自動＋10 種（欄杆、圍籬除外） */
    await expect(page.getByRole('option')).toHaveCount(11);
    await page.getByRole('option', { name: '玻璃牆', exact: true }).click();
    expect((await floor(page)).rooms[0].wall).toBe('glass');
    let w = await walls(page);
    expect(w).toContain('h0:0-10:glass');
    expect(w).toContain('v10:0-8:glass');
    await page.waitForTimeout(450);
    await click(page, 13, 4);
    await wallSelect.click();
    await page.getByRole('option', { name: '石牆（城堡・地城）', exact: true }).click();
    w = await walls(page);
    expect(w).toContain('v10:0-8:stone');
    expect(w).toContain('h0:10-16:stone');
    expect(w).toContain('h0:0-10:glass');
    /* 一步復原 */
    await page.waitForTimeout(450);
    await run(page, 'undo');
    expect((await floor(page)).rooms[1].wall).toBeUndefined();
    expect(await walls(page)).toContain('v10:0-8:glass');

    /* 戶外的房間：沒有這個欄位，只有一行說明 */
    await run(page, 'addObject', 'room', {
      id: 'yard',
      x: 0,
      y: 8,
      w: 16,
      h: 4,
      name: '庭院',
      cat: 'garden',
    });
    await click(page, 8, 10);
    await expect(page.getByTestId('props-title')).toHaveText('庭院');
    await expect(wallSelect).toHaveCount(0);
    await expect(page.getByTestId('props-panel')).toContainText('戶外的房間沒有自己的牆');
    /* 和庭院之間：室內那一間的（玻璃） */
    expect(await walls(page)).toContain('h8:0-10:glass');

    /* 牆工具：石牆、隔音牆、有裂痕的牆 */
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '門窗' }).click();
    for (const [kind, y] of [
      ['stone', 2],
      ['sound', 4],
      ['cracked', 6],
    ] as const) {
      await library(page).locator(`[data-wall="${kind}"]`).click();
      expect((await editorState(page)).tool).toBe('wall');
      await drag(page, [2, y], [8, y]);
      await page.waitForTimeout(450);
    }
    expect((await floor(page)).walls.map((x) => [x.kind, x.x1, x.y1, x.x2, x.y2])).toEqual([
      ['stone', 2, 2, 8, 2],
      ['sound', 2, 4, 8, 4],
      ['cracked', 2, 6, 8, 6],
    ]);
    await expect(page.getByTestId('props-title')).toHaveText('有裂痕的牆');

    /* 匯出（PL 用、48 px）：範圍（-2,-2）～（18,14）；玻璃牆（淡藍）、石牆（深色） */
    const r = await exportedImage(page);
    expect([r.width, r.height]).toEqual([960, 768]);
    const at48 = (x: number, y: number) =>
      px(r.img, Math.round((x + 2) * 48), Math.round((y + 2) * 48));
    expect(near(at48(5, 0), '#9ecdf1', 16)).toBe(true);
    expect(at48(5, 2.2)[0]).toBeLessThan(80);
    expect(errors).toEqual([]);
  });

  test('新的房間種類 14 種：房間分頁的卡片、點一下放、種類選單；外圍的牆照原作的分類（F229）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    for (let i = 0; i < 3; i++) await page.keyboard.press('-');
    await page.getByRole('tab', { name: '房間' }).click();
    await expect(library(page).locator('[data-room]')).toHaveCount(51);
    await expect(library(page).getByRole('heading', { name: '石造・工廠・建物' })).toBeVisible();
    await expect(
      library(page).getByRole('heading', { name: '交通・工地・戶外地面' }),
    ).toBeVisible();
    for (const [preset, x, y] of [
      ['platform', 12, 4],
      ['rooftop', 8, 18],
      ['building', 26, 18],
    ] as const) {
      await library(page).locator(`[data-room="${preset}"]`).click();
      await click(page, x, y);
      await page.waitForTimeout(450);
    }
    const f = await floor(page);
    expect(f.rooms.map((r) => [r.name, r.cat, r.x + 0, r.y + 0, r.w, r.h])).toEqual([
      ['月台', 'platform', 0, 0, 24, 8],
      ['屋頂平台', 'rooftop', 0, 12, 16, 12],
      ['建物（外觀）', 'roof', 18, 12, 16, 12],
    ]);
    /* 月台（戶外）沒有牆、屋頂平台（戶外）是欄杆、建物（室內）是外牆 */
    expect(await walls(page)).toEqual([
      'h12:0-16:rail',
      'h12:18-34:ext',
      'h24:0-16:rail',
      'h24:18-34:ext',
      'v0:12-24:rail',
      'v16:12-24:rail',
      'v18:12-24:ext',
      'v34:12-24:ext',
    ]);
    /* 種類選單：35 種；換成枯山水（戶外、外圍沒有牆） */
    await page.keyboard.press('Escape');
    await click(page, 26, 18);
    await page.getByRole('combobox', { name: '種類' }).click();
    await expect(page.getByRole('option')).toHaveCount(35);
    await page.getByRole('option', { name: '枯山水・白砂（戶外）' }).click();
    expect((await floor(page)).rooms[2].cat).toBe('gravel');
    expect((await walls(page)).filter((x) => x.endsWith(':ext'))).toEqual([]);
    /* 匯出：月台的地板色（彩色） */
    const r = await exportedImage(page);
    expect(px(r.img, Math.round(7.5 * 48), Math.round(5.5 * 48))).toEqual([236, 231, 220, 255]);
    expect(errors).toEqual([]);
  });

  test('外觀層：建物（屋頂）＋「顯示內部」疊上 1F；點得到的只有外觀層的東西；匯出、專案檔、分享連結；刪掉 1F 時關掉（F230、F231）', async ({
    page,
    browser,
  }) => {
    const errors = await open(page);
    await blank(page);
    /* 1F：兩間房、正門 */
    await page.keyboard.press('b');
    await drag(page, [4, 4], [10, 12]);
    await drag(page, [10, 4], [16, 12]);
    await page.keyboard.press('d');
    await click(page, 9, 11.7);
    /* 外觀層：庭院＋建物（屋頂）＋同一個位置的正門＋屋頂上的水塔 */
    await page.getByTestId('floor-add').click();
    await page.locator('[data-floor="1"]').dblclick();
    await page.getByTestId('floor-rename').fill('外觀');
    await page.getByTestId('floor-rename').press('Enter');
    await run(page, 'addObject', 'room', {
      id: 'yard',
      x: 0,
      y: 0,
      w: 20,
      h: 16,
      name: '庭院',
      cat: 'garden',
    });
    await library(page).locator('[data-room="building"]').click();
    await drag(page, [4, 4], [16, 12]);
    await page.keyboard.press('d');
    await click(page, 9, 12.3);
    await run(page, 'addObject', 'item', {
      id: 'tank',
      t: 'barrel',
      x: 6,
      y: 6,
      w: 1.2,
      h: 1.2,
      rot: 0,
    });
    let p = await project(page);
    expect(p.floors[1].rooms.map((r) => r.cat)).toEqual(['garden', 'roof']);
    expect(p.floors[1].openings[0]).toMatchObject({ o: 'h', y: 12, x: 8.25 });
    expect(p.floors[0].openings[0]).toMatchObject({ o: 'h', y: 12, x: 8.25 });
    expect(await shown(page)).toEqual({ rooms: ['庭院', '建物（外觀）'], openings: 1, items: 1 });

    /* 地圖設定：這一層的「顯示內部」 */
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const panel = page.getByTestId('props-panel');
    await expect(panel).toContainText('這一層（外觀）');
    const toggle = page.getByRole('switch', { name: '顯示內部（拿掉屋頂）' });
    await expect(toggle).not.toBeChecked();
    let r = await exportedImage(page);
    /* 範圍（-2,-2）～（22,18）；（5.25, 5.25）是屋頂 */
    expect([r.width, r.height]).toEqual([1152, 960]);
    expect(near(px(r.img, 348, 348), '#fbeed6', 6)).toBe(false);
    await toggle.click();
    await expect(toggle).toBeChecked();
    p = await project(page);
    expect([p.floors[1].showInside, p.floors[1].inside]).toEqual([true, p.floors[0].id]);
    await expect(page.getByRole('combobox', { name: '疊上來的樓層' })).toContainText('1F');
    /* 畫的是疊好的：屋頂拿掉、1F 的房間露出來（匯出也一樣） */
    r = await exportedImage(page);
    expect([r.width, r.height]).toEqual([1152, 960]);
    expect(px(r.img, 348, 348)).toEqual([251, 238, 214, 255]);
    /* 點得到的只有外觀層留下來的東西：庭院；屋頂、屋頂上的水塔、和 1F 同一個位置的正門都不在 */
    expect(await shown(page)).toEqual({ rooms: ['庭院'], openings: 0, items: 0 });
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('v');
    await click(page, 7, 8);
    expect((await editorState(page)).sel).toEqual([{ type: 'room', id: 'yard' }]);
    await page.keyboard.press('Escape');

    /* 專案檔（版本 4）帶著 */
    await page.getByTestId('map-canvas').focus();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(saved.version).toBe(6);
    expect([saved.data.floors[1].showInside, saved.data.floors[1].inside]).toEqual([
      true,
      saved.data.floors[0].id,
    ]);

    /* 分享連結（PL 用）：另一個瀏覽器環境打開，疊上來的樓層接得上 */
    const hash = await page.evaluate(() =>
      (
        window as unknown as { __floorPlan: { shareHash: (m: string) => string } }
      ).__floorPlan.shareHash('pl'),
    );
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.route(/fonts\.(googleapis|gstatic)\.com/, (rt) =>
      rt.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await other.goto(`${URL}${hash}`);
    await other.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    await expect.poll(async () => (await project(other)).name).toBe('新的地圖');
    const op = await project(other);
    expect([op.floors[1].showInside, op.floors[1].inside]).toEqual([true, op.floors[0].id]);
    await ctx.close();

    /* 復原：關掉 */
    await page.waitForTimeout(450);
    await run(page, 'undo');
    expect((await project(page)).floors[1].showInside).toBeUndefined();
    await toggle.click();
    expect((await project(page)).floors[1].showInside).toBe(true);
    /* 刪掉 1F（疊上來的那一層）：外觀層的「顯示內部」一起關掉 */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('[');
    await page.getByTestId('floor-remove').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除這一層' }).click();
    p = await project(page);
    expect(p.floors.map((x) => x.name)).toEqual(['外觀']);
    expect([p.floors[0].showInside, p.floors[0].inside]).toEqual([undefined, undefined]);
    expect(await shown(page)).toEqual({ rooms: ['庭院', '建物（外觀）'], openings: 1, items: 1 });
    expect(errors).toEqual([]);
  });

  /** 室內層 1F 與外觀層（庭院、池、兩棟屋頂，舊的編號 9／8 與屋頂上的字）的地圖 */
  const siteMap = (): Project => {
    const room = (
      id: string,
      x: number,
      y: number,
      w: number,
      h: number,
      name: string,
      cat: string,
    ) => ({ id, x, y, w, h, name, cat }) as unknown as Project['floors'][number]['rooms'][number];
    return {
      name: '外觀測試',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      active: 1,
      floors: [
        {
          id: 'f1',
          name: '1F',
          rooms: [
            room('hall', 4, 4, 6, 8, '大廳', 'living'),
            room('guest', 10, 4, 6, 8, '客房', 'living'),
            room('kitchen', 16, 4, 4, 8, '廚房', 'kitchen'),
          ],
          walls: [],
          openings: [],
          items: [],
          texts: [],
        },
        {
          id: 'site',
          name: '外觀',
          rooms: [
            room('yard', 0, 0, 30, 20, '庭院', 'garden'),
            room('bldg', 4, 4, 16, 8, '主屋', 'roof'),
            room('shed', 24, 14, 4, 4, '倉庫', 'roof'),
            room('pond', 22, 2, 6, 6, '池', 'garden'),
          ],
          walls: [],
          openings: [],
          items: [],
          texts: [
            { id: 'oldYard', x: 0.7, y: 0.7, text: '9', size: 0.6, badge: true },
            { id: 'oldRoof', x: 4.7, y: 4.7, text: '8', size: 0.6, badge: true },
            { id: 'roofNote', x: 12, y: 8, text: '瓦屋頂' },
          ],
        },
      ],
    } as Project;
  };
  const load = (page: Page, p: Project) =>
    page.evaluate(
      (pr) =>
        (window as unknown as { __floorPlan: Hook }).__floorPlan.useProject.getState().replace(pr),
      p,
    );
  const lastToast = (page: Page) => page.locator('li[data-radix-collection-item]').last();

  test('外觀層打開「顯示內部」時「替這一層的房間編號」只編留下來、看得到的房間；一步復原（F219、F230、7.13）', async ({
    page,
  }) => {
    const errors = await open(page);
    await load(page, siteMap());
    await page.getByTestId('map-canvas').focus();
    const toggle = page.getByRole('switch', { name: '顯示內部（拿掉屋頂）' });
    /* 沒打開時：這一層 4 間房（含兩個屋頂）都編 */
    await expect(toggle).not.toBeChecked();
    await page.getByTestId('number-rooms').click();
    await expect(lastToast(page)).toContainText('已替 4 間房間編號');
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).texts.map((t) => t.id)).toEqual(['oldYard', 'oldRoof', 'roofNote']);
    /* 打開「顯示內部」：畫面只看到庭院和池（屋頂拿掉、1F 的房間疊上來但不是這一層的） */
    await page.waitForTimeout(450);
    await toggle.click();
    await expect(toggle).toBeChecked();
    expect(await shown(page)).toEqual({ rooms: ['庭院', '池'], openings: 0, items: 0 });
    await page.waitForTimeout(450);
    await page.getByTestId('number-rooms').click();
    await expect(lastToast(page)).toContainText('已替 2 間房間編號');
    await expect(lastToast(page)).not.toContainText('5 間');
    let f = await floor(page);
    const nums = f.texts.filter((t) => t.badge && /^\d+$/.test(t.text));
    expect(nums.map((t) => [t.text, t.x, t.y])).toEqual([
      ['1', 0.7, 0.7],
      ['2', 22.7, 2.7],
    ]);
    /* 看不到的一般文字留著；疊上來的 1F 沒有被動到 */
    expect(f.texts.find((t) => t.id === 'roofNote')?.text).toBe('瓦屋頂');
    expect((await project(page)).floors[0].texts).toEqual([]);
    /* 一步復原：回到編號前（舊的編號 9、8 也回來） */
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    f = await floor(page);
    expect(f.texts.map((t) => t.id)).toEqual(['oldYard', 'oldRoof', 'roofNote']);
    expect(errors).toEqual([]);
  });

  test('刪除樓層：外觀層的「顯示內部」沒有 inside 時疊的是第一個別的樓層，刪掉它就關掉，不換成疊 2F（F230、D41、7.13）', async ({
    page,
  }) => {
    const errors = await open(page);
    const flat = (id: string, name: string) => ({
      id,
      name,
      rooms: [{ id: `${id}r`, x: 0, y: 0, w: 6, h: 6, name: `${name}的房間`, cat: 'living' }],
      walls: [],
      openings: [],
      items: [],
      texts: [],
    });
    await load(page, {
      name: '三層',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      active: 0,
      floors: [flat('a', '1F'), { ...flat('s', '敷地'), showInside: true }, flat('c', '2F')],
    } as unknown as Project);
    const toggle = page.getByRole('switch', { name: '顯示內部（拿掉屋頂）' });
    /* 敷地：開著，疊的是 1F（選單顯示 1F） */
    await page.locator('[data-floor="1"]').click();
    await expect(toggle).toBeChecked();
    await expect(page.getByRole('combobox', { name: '疊上來的樓層' })).toContainText('1F');
    /* 刪掉 1F */
    await page.locator('[data-floor="0"]').click();
    await page.getByTestId('floor-remove').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除這一層' }).click();
    let p = await project(page);
    expect(p.floors.map((x) => x.name)).toEqual(['敷地', '2F']);
    expect([p.floors[0].showInside, p.floors[0].inside]).toEqual([undefined, undefined]);
    /* 敷地的開關是關的，不是改疊 2F；畫面上只有敷地自己的房間 */
    await page.locator('[data-floor="0"]').click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByRole('combobox', { name: '疊上來的樓層' })).toHaveCount(0);
    expect(await shown(page)).toEqual({ rooms: ['敷地的房間'], openings: 0, items: 0 });
    /* 復原：1F 與開關一起回來 */
    await page.waitForTimeout(450);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    p = await project(page);
    expect(p.floors.map((x) => x.name)).toEqual(['1F', '敷地', '2F']);
    expect(p.floors[1].showInside).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('第三批跟進（2026-10，家具擴充、貼牆素材、標籤搜尋）', () => {
  const library = (page: Page) => page.getByTestId('library');
  const cards = (page: Page) => library(page).locator('[data-asset]');
  const search = (page: Page) => page.getByRole('searchbox', { name: '搜尋家具' });
  const tagged = (tag: string) => ASSETS.filter((a) => (a.tags as readonly string[]).includes(tag));
  async function exportedImage(page: Page) {
    const r = await page.evaluate(() =>
      (
        window as unknown as {
          __floorPlan: {
            exportPng: () => { name: string; width: number; height: number; url: string };
          };
        }
      ).__floorPlan.exportPng(),
    );
    return { ...r, img: pngPixels(Buffer.from(r.url.split(',')[1], 'base64')) };
  }
  const near = (c: number[], hex: string, tol = 8) => {
    const want = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    return want.every((v, i) => Math.abs(v - c[i]) <= tol);
  };
  const shownItems = (page: Page) =>
    page.evaluate(() => {
      const h = (
        window as unknown as {
          __floorPlan: { editor: { debugShown: () => { items: { t: string }[] } } };
        }
      ).__floorPlan;
      return h.editor.debugShown().items.map((i) => i.t);
    });

  test('素材面板：389 種、分類選單一直在上面、名稱與 #標籤搜尋、標籤建議、其他分類的提示；放新的家具（F232、F234）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    await page.getByRole('tab', { name: '家具・小物' }).click();
    await expect(cards(page)).toHaveCount(389);
    /* 分類選單：全部＋24 類（名稱後面是符合的件數） */
    const groupSelect = page.getByRole('combobox', { name: '家具分類' });
    await expect(groupSelect).toHaveText('全部（389）');
    await groupSelect.click();
    await expect(page.getByRole('option')).toHaveCount(25);
    await page.getByRole('option', { name: '貼牆素材（9）' }).click();
    await expect(cards(page)).toHaveCount(9);
    /* 捲到下面時搜尋欄與分類仍然看得到（固定在上面） */
    await groupSelect.click();
    await page.getByRole('option', { name: '全部（389）' }).click();
    await library(page).locator('[data-asset="wild_animal"]').scrollIntoViewIfNeeded();
    await expect(search(page)).toBeInViewport();
    await expect(groupSelect).toBeInViewport();

    /* #標籤 */
    await search(page).fill('#鐵道');
    await expect(cards(page)).toHaveCount(tagged('railway').length);
    await expect(library(page).locator('[data-asset="train_car"]')).toBeVisible();
    /* 全形的＃也可以；兩個標籤要都符合 */
    await search(page).fill('＃戶外 #恐怖');
    await expect(cards(page)).toHaveCount(
      ASSETS.filter((a) => a.tags.includes('outdoor') && a.tags.includes('horror')).length,
    );
    /* 打 # 時列出標籤，按一下補上 */
    await search(page).fill('#地');
    const suggest = library(page).getByRole('group', { name: '標籤' });
    await expect(suggest.getByRole('button').first()).toHaveText('#地下');
    await suggest.getByRole('button', { name: '#地下' }).click();
    await expect(search(page)).toHaveValue('#地下 ');
    await expect(search(page)).toBeFocused();
    await expect(cards(page)).toHaveCount(tagged('underground').length);

    /* 分類＋搜尋：別的分類有符合的時候提示 */
    await groupSelect.click();
    await page.getByRole('option', { name: /^鐵道・車站/ }).click();
    await search(page).fill('消防');
    await expect(cards(page)).toHaveCount(0);
    await expect(library(page)).toContainText('找不到符合的家具。');
    await expect(library(page)).toContainText('其他分類還有 3 件符合。');
    await library(page).getByRole('button', { name: '在全部分類裡找' }).click();
    await expect(cards(page)).toHaveCount(3);
    await expect(groupSelect).toHaveText('全部（3）');

    /* 放一件新的家具（點卡片 → 點畫布） */
    await search(page).fill('警察');
    await library(page).locator('[data-asset="npc_police"]').click();
    expect((await editorState(page)).tool).toBe('place');
    await click(page, 6, 4);
    const items = (await floor(page)).items;
    expect(items.map((i) => [i.t, i.w, i.h, i.rot])).toEqual([['npc_police', 1.2, 1.2, 0]]);
    await expect(page.getByTestId('props-title')).toHaveText('警察');
    expect(errors).toEqual([]);
  });

  test('素材面板：搜尋欄貼齊面板頂端、只選分類時不說「其他分類還有…」；圖示捲到才畫、捲動時不空白、清空搜尋不重畫全部（F234、D50、7.16）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    await page.getByRole('tab', { name: '家具・小物' }).click();
    await expect(cards(page)).toHaveCount(389);
    const panel = library(page).getByRole('tabpanel');
    const bar = page.getByTestId('library-search');
    /* 搜尋欄貼齊面板頂端（上面沒有縫隙，卡片不會從它上面露出來）：沒捲動與捲動之後都一樣 */
    const barGap = () =>
      page.evaluate(() => {
        const b = document.querySelector('[data-testid=library-search]');
        const p = b?.closest('[role=tabpanel]');
        if (!b || !p) throw new Error('no panel');
        return b.getBoundingClientRect().top - p.getBoundingClientRect().top;
      });
    expect(await barGap()).toBeCloseTo(0, 0);
    for (const y of [700, 2500]) {
      await panel.evaluate((el, top) => {
        el.scrollTop = top;
      }, y);
      expect(await barGap()).toBeCloseTo(0, 0);
    }
    await expect(bar).toBeInViewport();
    await panel.evaluate((el) => {
      el.scrollTop = 0;
    });

    /* 只選分類、沒有搜尋字：不說「其他分類還有 N 件符合」；打了字才說 */
    const elsewhere = library(page).getByText(/其他分類還有 \d+ 件符合/);
    await page.getByRole('combobox', { name: '家具分類' }).click();
    await page.getByRole('option', { name: '貼牆素材（9）' }).click();
    await expect(cards(page)).toHaveCount(9);
    await expect(elsewhere).toHaveCount(0);
    await search(page).fill('消防');
    await expect(elsewhere).toHaveCount(1);
    await search(page).fill('');
    await expect(elsewhere).toHaveCount(0);
    await page.getByRole('combobox', { name: '家具分類' }).click();
    await page.getByRole('option', { name: /^全部（/ }).click();
    await expect(cards(page)).toHaveCount(389);

    /* 圖示：一打開只畫看得到的與上下 300 px 內的，不是 389 張 */
    const drawn = () => page.locator('[data-asset] canvas[data-drawn="1"]').count();
    await expect.poll(drawn).toBeGreaterThan(10);
    await page.waitForTimeout(300);
    expect(await drawn()).toBeLessThan(120);
    /* 一格滾輪（120 px）捲 30 次：每次兩個 frame 之後，看得到的圖示都畫好了（預先畫的範圍有作用） */
    const blankAfterScroll = await page.evaluate(async () => {
      const b = document.querySelector('[data-testid=library-search]');
      const p = b?.closest('[role=tabpanel]');
      if (!b || !p) throw new Error('no panel');
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const visible = () => {
        const pr = p.getBoundingClientRect();
        const top = b.getBoundingClientRect().bottom;
        return [...document.querySelectorAll<HTMLCanvasElement>('[data-asset] canvas')].filter(
          (c) => {
            const r = c.getBoundingClientRect();
            return r.height > 0 && r.bottom > top && r.top < pr.bottom;
          },
        );
      };
      const out: number[] = [];
      for (let i = 0; i < 30; i++) {
        p.scrollTop += 120;
        await raf();
        await raf();
        out.push(visible().filter((c) => c.dataset.drawn !== '1').length);
      }
      return out;
    });
    expect(blankAfterScroll.reduce((a, c) => a + c, 0)).toBe(0);
    expect(await drawn()).toBeLessThan(389);

    /* 搜尋再清空：清空時不把 389 張的圖示都重畫（只畫看得到的與預先畫的），而且很快畫好 */
    await search(page).fill('椅');
    await expect(cards(page)).not.toHaveCount(389);
    await search(page).fill('');
    await expect(cards(page)).toHaveCount(389);
    const t = await page.evaluate(async () => {
      const t0 = performance.now();
      const b = document.querySelector('[data-testid=library-search]');
      const p = b?.closest('[role=tabpanel]');
      if (!b || !p) throw new Error('no panel');
      const pr = p.getBoundingClientRect();
      const top = b.getBoundingClientRect().bottom;
      for (;;) {
        const vis = [...document.querySelectorAll<HTMLCanvasElement>('[data-asset] canvas')].filter(
          (c) => {
            const r = c.getBoundingClientRect();
            return r.height > 0 && r.bottom > top && r.top < pr.bottom;
          },
        );
        if (vis.length && vis.every((c) => c.dataset.drawn === '1')) break;
        if (performance.now() - t0 > 3000) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return performance.now() - t0;
    });
    expect(t).toBeLessThan(1500);
    await page.waitForTimeout(300);
    expect(await drawn()).toBeLessThan(120);
    expect(errors).toEqual([]);
  });

  test('貼牆素材：吸到牆線、跟著牆的方向、沿著牆移動；畫在牆的上面；PL／GM 檢視與匯出（F233）', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.getByRole('tab', { name: '家具・小物' }).click();
    await search(page).fill('#貼牆');
    await expect(cards(page)).toHaveCount(9);
    /* 上面的橫牆（y＝0）：崩塌的牆面，長邊沿著牆、中心線在牆線上 */
    await library(page).locator('[data-asset="collapse_wall"]').click();
    await click(page, 5, 0.7);
    let items = (await floor(page)).items;
    expect(items[0]).toMatchObject({ t: 'collapse_wall', x: 3.5, y: -0.8, w: 3, h: 1.6, rot: 0 });
    await page.waitForTimeout(450);
    /* 右邊的直牆（x＝16）：血手印轉 90° */
    await library(page).locator('[data-asset="wall_blood"]').click();
    await click(page, 15.6, 4);
    items = (await floor(page)).items;
    expect(items[1]).toMatchObject({ t: 'wall_blood', x: 15.6, y: 3, w: 0.8, h: 1.6, rot: 90 });
    await page.waitForTimeout(450);

    /* 匯出（PL 用、每格 48 px）：範圍 (-2,-3)～(19,10)。崩塌的地方看不到牆（背景色），旁邊照樣是牆 */
    let r = await exportedImage(page);
    expect([r.width, r.height]).toEqual([1008, 624]);
    let pxAt = (x: number, y: number) =>
      px(r.img, Math.round((x + 2) * 48), Math.round((y + 3) * 48));
    expect(pxAt(5, 0)[0]).toBeGreaterThan(220);
    expect(pxAt(12, 0)[0]).toBeLessThan(80);
    /* 血手印畫在牆的上面：右邊的牆上有紅色 */
    let red = 0;
    for (let y = 3; y <= 4.6; y += 0.05)
      for (let x = 15.7; x <= 16.3; x += 0.05) {
        const c = pxAt(x, y);
        if (c[0] > 110 && c[1] < 90 && c[2] < 90) red++;
      }
    expect(red).toBeGreaterThan(20);

    /* 沿著牆拖：只動沿著牆的方向，中心線留在牆線上 */
    await drag(page, [5, -0.2], [7.1, 0.5]);
    items = (await floor(page)).items;
    expect(items[0].y).toBe(-0.8);
    expect(items[0].x).toBeGreaterThan(5);
    await page.waitForTimeout(450);
    await run(page, 'undo');
    expect((await floor(page)).items[0].x).toBe(3.5);

    /* 只有 GM 看得到：PL 檢視與 PL 用的圖都看不到（那裡又是牆） */
    await click(page, 5, -0.2);
    await expect(page.getByTestId('props-title')).toHaveText('崩塌的牆面');
    await page
      .getByTestId('props-panel')
      .getByRole('switch', { name: /只有 GM 看得到/ })
      .click();
    expect(await shownItems(page)).toEqual(['collapse_wall', 'wall_blood']);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('p');
    expect(await shownItems(page)).toEqual(['wall_blood']);
    await page.keyboard.press('p');
    r = await exportedImage(page);
    /* 崩塌藏起來之後範圍的上緣回到 -2 */
    expect([r.width, r.height]).toEqual([1008, 576]);
    pxAt = (x: number, y: number) => px(r.img, Math.round((x + 2) * 48), Math.round((y + 2) * 48));
    expect(pxAt(5, 0)[0]).toBeLessThan(80);
    expect(errors).toEqual([]);
  });

  test('貼牆素材跟著房間走：移動、旋轉、複製、刪除房間（含詢問的件數）都帶著；房間外面的不動（F233、F224、7.16）', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 房間 A (0,0,10,8)、B (10,0,6,8)：A 的上緣有裂痕、A 與 B 共用的牆上有血手印、B 的右緣有觸手（A 的外面） */
    const setup = async () => {
      await twoRooms(page);
      await run(page, 'addObject', 'item', {
        id: 'top',
        t: 'crack_wall',
        x: 2.5,
        y: -0.4,
        w: 3,
        h: 0.8,
        rot: 0,
      });
      await run(page, 'addObject', 'item', {
        id: 'mid',
        t: 'wall_blood',
        x: 9.6,
        y: 2.2,
        w: 0.8,
        h: 1.6,
        rot: 90,
      });
      await run(page, 'addObject', 'item', {
        id: 'far',
        t: 'tendrils',
        x: 14.5,
        y: 3,
        w: 3,
        h: 4,
        rot: 90,
      });
      await page.keyboard.press('v');
    };
    const itemOf = async (id: string) => (await floor(page)).items.find((i) => i.id === id);
    await setup();

    /* 移動：房間 A 往右 2 格，裂痕與血手印跟著動，B 右緣的觸手不動；一步復原 */
    await click(page, 5, 5);
    await drag(page, [5, 5], [7, 5]);
    expect((await floor(page)).rooms[0].x).toBe(2);
    expect(await itemOf('top')).toMatchObject({ x: 4.5, y: -0.4 });
    expect(await itemOf('mid')).toMatchObject({ x: 11.6, y: 2.2 });
    expect(await itemOf('far')).toMatchObject({ x: 14.5, y: 3 });
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).rooms[0].x).toBe(0);
    expect(await itemOf('top')).toMatchObject({ x: 2.5 });
    expect(await itemOf('mid')).toMatchObject({ x: 9.6 });
    /* Alt：只動房間，貼牆素材留在原地 */
    await page.waitForTimeout(450);
    await drag(page, [5, 5], [7, 5], ['Alt']);
    expect((await floor(page)).rooms[0].x).toBe(2);
    expect(await itemOf('top')).toMatchObject({ x: 2.5 });
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(450);

    /* 旋轉（R）：A (0,0,10,8) 順時針轉成 (1,-1,8,10)；上緣的裂痕轉到右緣（x＝9）、方向 90° */
    await page.keyboard.press('r');
    const a = (await floor(page)).rooms[0];
    expect([a.x, a.y, a.w, a.h]).toEqual([1, -1, 8, 10]);
    const top = await itemOf('top');
    expect(top?.rot).toBe(90);
    expect((top?.x ?? 0) + (top?.w ?? 0) / 2).toBeCloseTo(a.x + a.w, 6);
    expect(await itemOf('far')).toMatchObject({ x: 14.5, y: 3, rot: 90 });
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(450);
    expect(await itemOf('top')).toMatchObject({ x: 2.5, rot: 0 });

    /* 複製（Ctrl＋D）：房間連同裂痕、血手印一起複製（往右移 10 格），觸手不複製 */
    await page.keyboard.press('Control+d');
    const f = await floor(page);
    expect(f.rooms.map((r) => r.x)).toEqual([0, 10, 10]);
    expect(f.items.map((i) => i.t).sort()).toEqual(
      ['crack_wall', 'crack_wall', 'tendrils', 'wall_blood', 'wall_blood'].sort(),
    );
    const copy = f.items.filter((i) => i.t === 'crack_wall' && i.id !== 'top')[0];
    expect(copy).toMatchObject({ x: 12.5, y: -0.4 });

    /* 刪除房間：詢問的件數寫「N 個貼牆素材」；連裡面的東西一起刪＝貼牆素材也刪；一步復原 */
    await setup();
    const dialog = page.getByRole('alertdialog');
    await click(page, 5, 5);
    await page.keyboard.press('Delete');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('房間裡還有 2 個貼牆素材。');
    await dialog.getByRole('button', { name: '只刪房間' }).click();
    expect((await floor(page)).items.length).toBe(3);
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    await click(page, 5, 5);
    await page.keyboard.press('Delete');
    await dialog.getByRole('button', { name: '連裡面的東西一起刪' }).click();
    expect((await floor(page)).items.map((i) => i.id)).toEqual(['far']);
    await expect(page.getByText('已刪除 3 個', { exact: true })).toBeVisible();
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).items.length).toBe(3);
    expect(errors).toEqual([]);
  });

  test('匯出抽查：新的家具照樣式的顏色畫（消防車的紅、戰車的綠、站名牌的藍）', async ({ page }) => {
    const errors = await open(page);
    await blank(page);
    await run(page, 'addObject', 'item', {
      id: 'ft',
      t: 'fire_truck',
      x: 0,
      y: 0,
      w: 5,
      h: 17,
      rot: 0,
    });
    await run(page, 'addObject', 'item', {
      id: 'tk',
      t: 'tank_mil',
      x: 8,
      y: 0,
      w: 7,
      h: 14,
      rot: 0,
    });
    await run(page, 'addObject', 'item', {
      id: 'sg',
      t: 'station_sign',
      x: 0,
      y: 18,
      w: 3,
      h: 0.5,
      rot: 0,
    });
    const r = await exportedImage(page);
    /* 範圍 (-2,-2)～(17,21) */
    expect([r.width, r.height]).toEqual([912, 1104]);
    const pxAt = (x: number, y: number) =>
      px(r.img, Math.round((x + 2) * 48), Math.round((y + 2) * 48));
    expect(near(pxAt(0.6, 3), '#d5463f')).toBe(true);
    /* 戰車的砲管朝上（7.16），在中線上：抽查砲管旁邊的車身 */
    expect(near(pxAt(10, 3), '#b6d8a3')).toBe(true);
    expect(near(pxAt(1.5, 18.39), '#3b7ad6')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('範本對話框的搜尋：名稱或 #標籤，分類一直看得到、和搜尋一起套用（F235）', async ({
    page,
  }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '範本' }).click();
    const dialog = page.getByTestId('template-dialog');
    const tplCards = dialog.getByRole('list').getByRole('button');
    const box = dialog.getByRole('searchbox', { name: '搜尋範本' });
    /* 2026-10 第三批後半：範本 56 個（#地下 21 個） */
    await box.fill('#地下');
    await expect(tplCards).toHaveCount(21);
    await expect(dialog.getByRole('button', { name: /^地下鐵車站/ })).toBeVisible();
    await dialog.getByRole('radio', { name: '交通・運輸' }).click();
    await expect(tplCards).toHaveCount(3);
    await expect(tplCards).toContainText(['地方車站', '地下鐵車站', '地下停車場']);
    /* 打 # 時列出標籤 */
    await box.fill('#鐵');
    await dialog
      .getByRole('group', { name: '標籤' })
      .getByRole('button', { name: '#鐵道' })
      .click();
    await expect(box).toHaveValue('#鐵道 ');
    await expect(tplCards).toHaveCount(2);
    await expect(tplCards).toContainText(['地方車站', '地下鐵車站']);
    await dialog.getByRole('radio', { name: '全部' }).click();
    await box.fill('zzz');
    await expect(tplCards).toHaveCount(0);
    await expect(dialog).toContainText('找不到符合的範本。');
    /* 分類名稱也找得到（宗教・古蹟 7 個） */
    await box.fill('古蹟');
    await expect(tplCards).toHaveCount(7);
    await box.fill('三合院');
    await expect(tplCards).toHaveCount(1);
    await tplCards.first().click();
    await expect(dialog).toHaveCount(0);
    expect((await project(page)).name).toBe('三合院');
    expect(errors).toEqual([]);
  });
});

test.describe('2026-10 第三批後半的範本（F237～F239）', () => {
  /** 從範本對話框載入（分類 → 卡片），回傳載入後的專案 */
  async function loadFromDialog(page: Page, tag: string, name: RegExp) {
    await page.getByRole('button', { name: '範本' }).click();
    const dialog = page.getByTestId('template-dialog');
    await dialog.getByRole('radio', { name: tag }).click();
    await dialog.getByRole('button', { name }).click();
    await expect(page.getByTestId('template-dialog')).toHaveCount(0);
    return project(page);
  }

  test('新的範本載入得了：樓層、地面層、樣式；預設 GM 專用的後台；放入隱藏線索', async ({
    page,
  }) => {
    const errors = await open(page);
    for (const [tag, name, title, floors, active, theme] of [
      ['交通・運輸', /^地下鐵車站/, '地下鐵車站', ['B2', 'B1', '1F'], 2, 'clean'],
      ['交通・運輸', /^渡輪/, '渡輪', ['B1', '1F', '2F'], 1, 'clean'],
      ['住宅', /^老公寓/, '老公寓（四樓）', ['1F', '4F', '頂樓'], 0, 'clean'],
      ['宗教・古蹟', /^古城/, '古城', ['B1', '1F', '2F'], 1, 'clean'],
      ['廢墟・事件', /^廢棄工廠/, '廢棄工廠', ['1F', '2F'], 0, 'horror'],
      ['奇幻・科幻', /^魔法師之塔/, '魔法師之塔', ['1F', '2F', '3F'], 0, 'clean'],
      ['商店・辦公', /^夜市/, '夜市', ['1F'], 0, 'clean'],
    ] as const) {
      const p = await loadFromDialog(page, tag, name);
      expect([p.name, p.floors.map((f) => f.name), p.active, p.theme], title).toEqual([
        title,
        floors,
        active,
        theme,
      ]);
      expect(p.floors.every((f) => f.rooms.length > 0)).toBe(true);
      await expect(page.getByText(`已載入「${title}」`, { exact: true })).toBeVisible();
    }
    /* 便利商店：倉庫、冷藏庫、員工休息室預設只有 GM 看得到（F225、D37） */
    let p = await loadFromDialog(page, '商店・辦公', /^便利商店/);
    expect(
      p.floors[0].rooms
        .filter((r) => r.gm)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['倉庫', '冷藏庫', '員工休息室'].sort());
    /* 放入隱藏線索：渡輪 4 條（三層裡的小物＋說明） */
    await page.getByRole('button', { name: '範本' }).click();
    await page.getByTestId('template-dialog').getByRole('switch', { name: '放入隱藏線索' }).click();
    await page.keyboard.press('Escape');
    p = await loadFromDialog(page, '交通・運輸', /^渡輪/);
    expect(p.floors.flatMap((f) => f.items).filter((i) => i.clue)).toHaveLength(4);
    expect(p.floors.flatMap((f) => f.texts).filter((t) => t.clue)).toHaveLength(4);
    expect(errors).toEqual([]);
  });

  test('匯出抽查：古城的所有樓層（PL 用、GM 用）、地下鐵車站每層各一張；寬高是每格 px 的整數倍', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadFromDialog(page, '宗教・古蹟', /^古城/);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+e');
    const dialog = page.getByTestId('export-dialog');
    await dialog.getByRole('radio', { name: '所有樓層排成一張' }).click();
    const info = page.getByTestId('export-info');
    const size = async () => {
      const m = (await info.innerText()).match(/(\d+) × (\d+) px/);
      return m ? [Number(m[1]), Number(m[2])] : [0, 0];
    };
    const [w, h] = await size();
    expect(w % 48).toBe(0);
    expect(h % 48).toBe(0);
    let [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('古城_PL.png');
    let img = pngPixels(readFileSync((await dl.path()) as string));
    expect([img.width, img.height]).toEqual([w, h]);
    await dialog.getByRole('radio', { name: 'GM 用（全部顯示）' }).click();
    const [gw, gh] = await size();
    expect(gw).toBe(w);
    expect(gh).toBeGreaterThan(h);
    [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('古城_GM.png');
    img = pngPixels(readFileSync((await dl.path()) as string));
    expect([img.width, img.height]).toEqual([gw, gh]);
    await page.keyboard.press('Escape');
    /* 地下鐵車站：每層各一張（3 張） */
    await loadFromDialog(page, '交通・運輸', /^地下鐵車站/);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+e');
    await dialog.getByRole('radio', { name: '每層各一張' }).click();
    const names: string[] = [];
    page.on('download', (d) => names.push(d.suggestedFilename()));
    await page.getByTestId('export-download').click();
    await expect.poll(() => names.length, { timeout: 10000 }).toBe(3);
    expect(names.sort()).toEqual(
      ['地下鐵車站_B2_GM.png', '地下鐵車站_B1_GM.png', '地下鐵車站_1F_GM.png'].sort(),
    );
    expect(errors).toEqual([]);
  });

  test('線索說明（7.19）：套房換成自己想的三樣、斷點讓 5 則說明回到 0.42 字級（瀏覽器照字型量字寬）', async ({
    page,
  }) => {
    const errors = await open(page);
    /* [範本, 說明（接起來）, 是否斷成兩行] */
    const want = [
      ['studio', '對準床鋪的縮時相機', null],
      ['studio', '電視背面的便利貼', null],
      ['studio', '冷凍格深處的信封', null],
      ['lodge', '少一把的鑰匙串', '少一把的\n鑰匙串'],
      ['lodge', '塞進門縫的警告', '塞進門縫的\n警告'],
      ['prison', '床板底下刻著日期', '床板底下\n刻著日期'],
      ['prison', '會客時遞來的照片', '會客時\n遞來的照片'],
    ] as const;
    for (const id of new Set(want.map((w) => w[0]))) {
      await run(page, 'loadTemplate', id, { structureOnly: false, clues: true });
      const p = await project(page);
      const clues = p.floors.flatMap((f) => f.texts).filter((t) => t.clue);
      for (const [tpl, text, two] of want.filter((w) => w[0] === id)) {
        const t = clues.find((c) => c.text.replace('\n', '') === text);
        expect(t, `${tpl} ${text}`).toBeTruthy();
        expect(t?.size, `${tpl} ${text}`).toBe(0.42);
        if (two) expect(t?.text).toBe(two);
      }
    }
    expect(errors).toEqual([]);
  });
});

test.describe('2026-10-29 跟進原作 v1.15（健身房範本、家具 8 種、雙開拉門、讀原作 v1.15 的地圖檔）', () => {
  /** 匯出對話框的設定（匯出 PNG 抽查用） */
  const setExport = (page: Page, patch: Record<string, unknown>) =>
    page.evaluate((p) => {
      const h = (
        window as unknown as {
          __floorPlan: {
            usePrefs: {
              getState: () => {
                data: { exp: Record<string, unknown> };
                patch: (x: unknown) => void;
              };
            };
          };
        }
      ).__floorPlan;
      const s = h.usePrefs.getState();
      s.patch({ exp: { ...s.data.exp, ...p } });
    }, patch);
  async function exported(page: Page) {
    const r = await page.evaluate(() =>
      (
        window as unknown as {
          __floorPlan: { exportPng: () => { width: number; height: number; url: string } };
        }
      ).__floorPlan.exportPng(),
    );
    return { ...r, img: pngPixels(Buffer.from(r.url.split(',')[1], 'base64')) };
  }
  const shownOf = (page: Page) =>
    page.evaluate(() => {
      const h = (
        window as unknown as {
          __floorPlan: {
            editor: {
              debugShown: () => {
                rooms: { name: string; masked?: boolean }[];
                openings: { kind: string }[];
                items: { t: string }[];
              };
            };
          };
        }
      ).__floorPlan;
      return h.editor.debugShown();
    });
  /** 世界座標 (x, y) 的像素：單一樓層、每格 48 px、四周留 2 格（匯出範圍取整格時，左上角是 (minX − 2, minY − 2)） */
  const pxAt = (img: PixelBuffer, minX: number, minY: number, x: number, y: number, band = 0) =>
    px(img, Math.round((x - minX + 2) * 48), Math.round((y - minY + 2 + band) * 48));
  const NEW_ITEMS: [string, string][] = [
    ['squat_rack', '深蹲架'],
    ['cable_machine', '滑輪訓練機'],
    ['rowing_machine', '划船機'],
    ['yoga_mat', '瑜珈墊'],
    ['wash_station', '澡堂洗身區'],
    ['urinal', '小便斗'],
    ['squat_toilet', '蹲式馬桶'],
    ['trough_sink', '長型洗手台'],
  ];

  test('健身房範本：娛樂・表演與商店・辦公都找得到；載入後用到新家具與雙開拉門，員工區預設 GM 專用，舊三溫暖室要暗門；放入隱藏線索（F245）', async ({
    page,
  }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '範本' }).click();
    const dialog = page.getByTestId('template-dialog');
    for (const tag of ['娛樂・表演', '商店・辦公']) {
      await dialog.getByRole('radio', { name: tag }).click();
      await expect(dialog.getByRole('button', { name: /^健身房/ }), tag).toBeVisible();
    }
    /* 搜尋：名稱、#標籤 */
    await dialog.getByRole('radio', { name: '全部' }).click();
    const box = dialog.getByRole('searchbox', { name: '搜尋範本' });
    const cards = dialog.getByRole('list').getByRole('button');
    await box.fill('健身');
    await expect(cards).toHaveCount(1);
    await box.fill('#公共 #娛樂');
    await expect(dialog.getByRole('button', { name: /^健身房/ })).toBeVisible();
    await box.fill('健身');
    await dialog.getByRole('button', { name: /^健身房/ }).click();
    await expect(page.getByTestId('template-dialog')).toHaveCount(0);

    const p = await project(page);
    expect([p.name, p.theme, p.floors.map((f) => f.name)]).toEqual(['健身房', 'clean', ['1F']]);
    const f = p.floors[0];
    const kinds = new Set(f.items.map((i) => i.t));
    for (const [id] of NEW_ITEMS) expect(kinds.has(id), id).toBe(true);
    expect(f.openings.filter((o) => o.kind === 'slidingc').length).toBeGreaterThan(0);
    expect(
      f.rooms
        .filter((r) => r.gm)
        .map((r) => r.name)
        .sort(),
    ).toEqual(['員工室', '儲藏室', '舊三溫暖室'].sort());
    /* 沒有放入線索時沒有線索 */
    expect(f.items.some((i) => i.clue)).toBe(false);

    /* PL 檢視：GM 專用的三間房只剩牆框（沒有名字），裡面的家具藏起來；舊三溫暖室的暗門在 PL 檢視是牆 */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('p');
    const pl = await shownOf(page);
    expect(pl.rooms.filter((r) => !r.name)).toHaveLength(3);
    expect(pl.rooms.map((r) => r.name)).toContain('瑜珈教室');
    /* 監視器螢幕牆 2 個：員工室的藏起來，瑜珈教室的投影螢幕還在 */
    expect(pl.items.filter((i) => i.t === 'monitor_wall')).toHaveLength(1);
    expect(pl.items.some((i) => i.t === 'bench' || i.t === 'yoga_mat')).toBe(true);
    await page.keyboard.press('p');

    /* 匯出 PNG（PL 用）：員工室蓋灰、GM 用看得到房間的顏色；範圍是 (−2, −3)～(62, 34)（上面的窗與下面的後門凸出牆外）的 64 × 37 格 */
    let r = await exported(page);
    expect([r.width, r.height]).toEqual([64 * 48, 37 * 48]);
    const staffPl = pxAt(r.img, 0, -1, 44.5, 4.5);
    expect(Math.abs(staffPl[0] - staffPl[2])).toBeLessThan(8);
    await setExport(page, { view: 'gm' });
    r = await exported(page);
    /* GM 用的圖最上面多一條「GM 用」的字帶（整格） */
    const band = (r.height - 37 * 48) / 48;
    expect(Number.isInteger(band) && band > 0).toBe(true);
    const staffGm = pxAt(r.img, 0, -1, 44.5, 4.5, band);
    expect(staffGm.slice(0, 3)).not.toEqual(staffPl.slice(0, 3));
    expect(Math.abs(staffGm[0] - staffGm[2])).toBeGreaterThan(5);
    await setExport(page, { view: 'pl' });

    /* 放入隱藏線索：4 條，都在公開的房間裡 */
    await page.getByRole('button', { name: '範本' }).click();
    await dialog.getByRole('switch', { name: '放入隱藏線索' }).click();
    await box.fill('健身');
    await dialog.getByRole('button', { name: /^健身房/ }).click();
    const withClues = (await floor(page)).items.filter((i) => i.clue);
    expect(withClues.map((i) => i.t).sort()).toEqual(['bag', 'diary', 'photo', 'pills']);
    expect(errors).toEqual([]);
  });

  test('新家具 8 種：素材面板的分類（娛樂・運動 20、衛浴 10）、名稱搜尋、放置（預設大小）、旋轉與翻轉、匯出 PNG 畫得出來（F244）', async ({
    page,
  }) => {
    const errors = await open(page);
    await blank(page);
    await page.getByRole('tab', { name: '家具・小物' }).click();
    const library = page.getByTestId('library');
    const cards = library.locator('[data-asset]');
    const search = page.getByRole('searchbox', { name: '搜尋家具' });
    await expect(cards).toHaveCount(389);
    const groupSelect = page.getByRole('combobox', { name: '家具分類' });
    for (const [group, n, ids] of [
      ['娛樂・運動', 20, ['squat_rack', 'cable_machine', 'rowing_machine', 'yoga_mat']],
      ['衛浴', 10, ['wash_station', 'urinal', 'squat_toilet', 'trough_sink']],
    ] as const) {
      await groupSelect.click();
      await page.getByRole('option', { name: `${group}（${n}）` }).click();
      await expect(cards, group).toHaveCount(n);
      for (const id of ids) await expect(library.locator(`[data-asset="${id}"]`), id).toBeVisible();
    }
    await groupSelect.click();
    await page.getByRole('option', { name: '全部（389）' }).click();
    /* 名稱、別名、#標籤 */
    await search.fill('深蹲');
    await expect(cards).toHaveCount(1);
    await search.fill('大浴場');
    await expect(library.locator('[data-asset="wash_station"]')).toBeVisible();
    await search.fill('#公共');
    for (const id of ['wash_station', 'urinal', 'squat_toilet', 'trough_sink'])
      await expect(library.locator(`[data-asset="${id}"]`), id).toBeVisible();
    await search.fill('');

    /* 8 種各放一件：預設大小（格）和原作相同 */
    const sizes: Record<string, [number, number]> = {
      squat_rack: [3, 2.4],
      cable_machine: [3, 2.4],
      rowing_machine: [1.2, 4.4],
      yoga_mat: [1.2, 3.6],
      wash_station: [1.6, 2],
      urinal: [0.9, 0.8],
      squat_toilet: [1, 1.6],
      trough_sink: [4, 1.2],
    };
    for (const [i, [id, name]] of NEW_ITEMS.entries()) {
      await search.fill(name);
      await library.locator(`[data-asset="${id}"]`).click();
      expect((await editorState(page)).tool).toBe('place');
      await click(page, 4 + (i % 4) * 5, 4 + Math.floor(i / 4) * 8);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
    }
    const f = await floor(page);
    expect(f.items.map((i) => [i.t, i.w, i.h, i.rot])).toEqual(
      NEW_ITEMS.map(([id]) => [id, ...sizes[id], 0]),
    );

    /* 選一件：屬性面板（名稱、向、左右反轉）；轉 90°、翻轉、復原 */
    await page.keyboard.press('v');
    const yoga = f.items[3];
    await click(page, yoga.x + yoga.w / 2, yoga.y + yoga.h / 2);
    await expect(page.getByTestId('props-title')).toHaveText('瑜珈墊');
    await page.getByTestId('props-panel').getByRole('radio', { name: '90°' }).click();
    let y2 = (await floor(page)).items[3];
    expect([y2.rot, y2.w, y2.h]).toEqual([90, 3.6, 1.2]);
    await page
      .getByTestId('props-panel')
      .getByRole('switch', { name: /左右翻轉/ })
      .click();
    y2 = (await floor(page)).items[3];
    expect(y2.flip).toBe(true);
    await page.waitForTimeout(450);
    await run(page, 'undo');
    expect((await floor(page)).items[3].flip).toBeUndefined();

    /* 匯出 PNG：每一件的範圍裡都畫了東西（不是空白） */
    const { img, width, height } = await exported(page);
    const items = (await floor(page)).items;
    const minX = Math.floor(Math.min(...items.map((i) => i.x)) - 2) + 0;
    const minY = Math.floor(Math.min(...items.map((i) => i.y)) - 2) + 0;
    const bg = px(img, 2, 2).slice(0, 3);
    expect(width).toBeGreaterThan(48 * 20);
    expect(height).toBeGreaterThan(48 * 15);
    for (const i of items) {
      let ink = 0;
      for (let dy = 0; dy < i.h; dy += 0.1)
        for (let dx = 0; dx < i.w; dx += 0.1) {
          const c = pxAt(img, minX + 2, minY + 2, i.x + dx, i.y + dy).slice(0, 3);
          if (c.some((v, k) => Math.abs(v - bg[k]) > 10)) ink++;
        }
      expect(ink, i.t).toBeGreaterThan(8);
    }
    expect(errors).toEqual([]);
  });

  test('雙開拉門：從門窗分頁放、切開牆、屬性面板（種類、寬度）、沿牆拖曳決定長度、PL 檢視與匯出、只有 GM 看得到、復原（F243）', async ({
    page,
  }) => {
    const errors = await open(page);
    await twoRooms(page);
    await page.getByRole('tab', { name: '門窗' }).click();
    const library = page.getByTestId('library');
    /* 雙開拉門排在雙片拉門後面 */
    const order = await library
      .locator('[data-opening]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-opening')));
    expect(order.indexOf('slidingc')).toBe(order.indexOf('sliding2') + 1);
    await expect(library.locator('[data-opening="slidingc"]')).toContainText('雙開拉門');
    /* 放在兩個房間之間的牆（x＝10）：預設寬 3 格，牆被切開 */
    await library.locator('[data-opening="slidingc"]').click();
    expect((await editorState(page)).tool).toBe('door');
    await click(page, 10, 4);
    await page.waitForTimeout(450);
    let f = await floor(page);
    expect(f.openings).toHaveLength(1);
    const d = f.openings[0];
    expect([d.kind, d.o, d.x, d.len]).toEqual(['slidingc', 'v', 10, 3]);
    const w = await walls(page);
    expect(w).toContain(`v10:0-${d.y}:int`);
    expect(w).toContain(`v10:${d.y + 3}-8:int`);

    /* 選取：屬性面板的種類選單有雙開拉門；不是會開的門（沒有換鉸鍊的按鈕）；可以換成別的種類再換回來 */
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await click(page, 10, d.y + 1.5);
    await expect(page.getByTestId('props-title')).toHaveText('雙開拉門');
    await expect(page.getByRole('button', { name: '換鉸鍊那一邊' })).toHaveCount(0);
    const kind = page.getByTestId('props-panel').locator('[data-focus="kind"]');
    await kind.click();
    await expect(page.getByRole('option', { name: '雙開拉門', exact: true })).toBeVisible();
    await page.getByRole('option', { name: '雙片拉門・紙門', exact: true }).click();
    expect((await floor(page)).openings[0].kind).toBe('sliding2');
    await page.waitForTimeout(450);
    await kind.click();
    await page.getByRole('option', { name: '雙開拉門', exact: true }).click();
    expect((await floor(page)).openings[0].kind).toBe('slidingc');
    await page.waitForTimeout(450);

    /* PL 檢視照樣看得到；匯出（PL 用、每格 48 px）：門的位置牆被切開，兩側的牆還在 */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('p');
    expect((await shownOf(page)).openings.map((o) => o.kind)).toEqual(['slidingc']);
    await page.keyboard.press('p');
    let r = await exported(page);
    /* 門的位置：牆的粗細（±0.1 格）裡至少有一邊是淺色（門板很薄、偏向一邊），門外的牆是深色 */
    const across = (y: number) =>
      [-0.09, 0.09].map((dx) => pxAt((r as { img: PixelBuffer }).img, 0, 0, 10 + dx, y)[0]);
    expect(Math.max(...across(d.y + 0.75))).toBeGreaterThan(150);
    expect(Math.max(...across(d.y - 1))).toBeLessThan(90);
    expect(Math.min(...across(d.y - 1))).toBeLessThan(90);

    /* 只有 GM 看得到：PL 檢視與 PL 用的圖裡那裡是一般的牆 */
    await page
      .getByTestId('props-panel')
      .getByRole('switch', { name: /只有 GM 看得到/ })
      .click();
    await page.keyboard.press('Escape');
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('p');
    expect((await shownOf(page)).openings).toEqual([]);
    await page.keyboard.press('p');
    r = await exported(page);
    expect(Math.max(...across(d.y + 0.75))).toBeLessThan(90);

    /* 沿著牆拖曳決定長度（F223）：先刪掉這一個，再拖出寬 5 格的 */
    await click(page, 10, d.y + 1.5);
    await page.keyboard.press('Delete');
    expect((await floor(page)).openings).toHaveLength(0);
    await library.locator('[data-opening="slidingc"]').click();
    await drag(page, [10, 1], [10, 6]);
    f = await floor(page);
    expect(f.openings).toHaveLength(1);
    expect([f.openings[0].kind, f.openings[0].len]).toEqual(['slidingc', 5]);
    expect(errors).toEqual([]);
  });

  test('讀原作 v1.15 實際存的地圖檔：新家具 8 種與雙開拉門原樣讀進來，沒有略過的東西；位置、方向、翻轉、標籤、隱藏線索、GM 專用都留著；復原回到匯入前（F246）', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __toasts: string[] };
      w.__toasts = [];
      new MutationObserver((muts) => {
        for (const m of muts)
          for (const n of m.addedNodes)
            if (n instanceof HTMLElement && n.matches('li[data-radix-collection-item]'))
              w.__toasts.push(n.innerText);
      }).observe(document, { childList: true, subtree: true });
    });
    const errors = await open(page);
    const toasts = () =>
      page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.slice());
    const file = readFileSync(
      new globalThis.URL('../fixtures/floor-plan-upstream-v115.trpgmap.json', import.meta.url),
    );
    const raw = JSON.parse(file.toString('utf8'));
    expect(raw.tool).toBe('v1.15');
    await blank(page);
    await expect.poll(async () => (await toasts()).length).toBeGreaterThan(0);
    const before = (await toasts()).length;
    await page.getByRole('button', { name: '專案' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: '匯入「TRPG 室內圖メーカー」的地圖檔…' }).click();
    await (await chooser).setFiles({
      name: '健身房與澡堂.trpgmap.json',
      mimeType: 'application/json',
      buffer: file,
    });
    /* 一般的「已匯入」通知（沒有要提醒的東西：不說略過、換成相近的種類），只有「復原」 */
    await expect.poll(async () => (await toasts()).length).toBe(before + 1);
    const text = (await toasts()).at(-1) ?? '';
    expect(text).toContain('已匯入「健身房與澡堂（v1.15 新種類）」');
    expect(text).not.toContain('略過');
    expect(text).not.toContain('換成相近');
    expect(text).not.toContain('詳細');
    expect(text).toContain('復原');

    const p = await project(page);
    expect(p.name).toBe('健身房與澡堂（v1.15 新種類）');
    const f = p.floors[0];
    expect(f.rooms.map((r) => r.name)).toEqual(['訓練室', '洗身區・廁所']);
    expect(f.items.map((i) => i.t).sort()).toEqual(NEW_ITEMS.map(([id]) => id).sort());
    expect(f.openings.map((o) => o.kind).sort()).toEqual(['sliding2', 'slidingc', 'slidingc']);
    const it = (t: string) => f.items.find((i) => i.t === t);
    expect(it('squat_rack')).toMatchObject({ x: 2.5, y: 2.75, w: 3, h: 2.4, clue: true });
    expect(it('rowing_machine')).toMatchObject({ label: '朝練用', w: 1.2, h: 4.4 });
    expect(it('yoga_mat')).toMatchObject({ rot: 90, w: 3.6, h: 1.2 });
    expect(it('wash_station')).toMatchObject({ flip: true });
    expect(it('urinal')).toMatchObject({ gm: true });
    /* 雙開拉門把牆切開 */
    expect(await walls(page)).toContain('v17:1-6.5:int');
    expect(await walls(page)).toContain('v17:9.5-13:int');

    /* PL 用的圖：GM 專用的小便斗不畫；GM 用的圖畫（半透明加虛線框）。兩張圖在小便斗的範圍裡不一樣，其他家具的範圍裡一樣 */
    const pl = await exported(page);
    await setExport(page, { view: 'gm' });
    const gm = await exported(page);
    const band = (gm.height - pl.height) / 48;
    expect(Number.isInteger(band) && band > 0).toBe(true);
    const differ = (i: { x: number; y: number; w: number; h: number }) => {
      let n = 0;
      for (let dy = 0.05; dy < i.h; dy += 0.05)
        for (let dx = 0.05; dx < i.w; dx += 0.05) {
          /* 範圍是 (−1, −2)～：上面的引違戶往牆外凸出 0.5 格，再留 2 格取整格 */
          const a = pxAt(pl.img, 1, 0, i.x + dx, i.y + dy).slice(0, 3);
          const b = pxAt(gm.img, 1, 0, i.x + dx, i.y + dy, band).slice(0, 3);
          if (a.some((v, k) => Math.abs(v - b[k]) > 12)) n++;
        }
      return n;
    };
    expect(differ(it('urinal') as NonNullable<ReturnType<typeof it>>)).toBeGreaterThan(30);
    expect(differ(it('squat_toilet') as NonNullable<ReturnType<typeof it>>)).toBe(0);

    /* 專案檔（版本 6：新的門窗種類與新家具，D63）帶著新的東西 */
    await page.getByTestId('map-canvas').focus();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(saved.version).toBe(6);
    expect(
      saved.data.floors[0].openings.filter((o: { kind: string }) => o.kind === 'slidingc'),
    ).toHaveLength(2);
    expect(saved.data.floors[0].items.map((i: { t: string }) => i.t).sort()).toEqual(
      NEW_ITEMS.map(([id]) => id).sort(),
    );

    /* 復原：回到匯入前的空白地圖 */
    await page.getByTestId('toast-action').last().click();
    await expect.poll(async () => (await project(page)).name).toBe('新的地圖');
    expect((await floor(page)).items).toHaveLength(0);
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('floor-plan-1280.png', { mask: masks(page) });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await page.getByRole('tab', { name: '家具・小物' }).click();
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('floor-plan-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
