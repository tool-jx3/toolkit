/**
 * 室內平面圖產生器（建置產物 next/floor-plan/）的端對端測試：
 * - 開頁沒有錯誤、預設的套房、頁尾只有靈感來源；
 * - 各工具：房間（拖曳、預設尺寸、從面板拖放）、牆、門窗（吸附、重疊、方向）、家具（貼牆轉向、連續放）、文字、橡皮擦、平移；
 * - 選取：點選、Shift、框選、移動（連同內容／Alt 只動房間）、控制點、鎖定、刪除、複製、剪貼簿、方向鍵、旋轉、翻轉；
 * - 屬性面板、GM／PL 檢視、隱藏線索、樓層、範本（格局、線索）、匯出（尺寸、檔名、PL／GM 像素、每層各一張、透明）、
 *   專案檔（存、開、原作的 .trpgmap.json）、自動保存、復原；
 * - 1280／390 視覺基準、390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { Floor, Project } from '../../src/tools/floor-plan/model/types';
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
      expect(await bg(select)).not.toBe(TRANSPARENT);
      expect(await bg(room)).toBe(TRANSPARENT);
      await page.getByTestId('map-canvas').focus();
      await page.keyboard.press('b');
      await expect(room).toHaveAttribute('aria-pressed', 'true');
      expect(await bg(room)).not.toBe(TRANSPARENT);
      expect(await bg(select)).toBe(TRANSPARENT);
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
    expect(await bg(clue)).toBe(TRANSPARENT);
    await clue.click();
    await expect(clue).toHaveAttribute('aria-pressed', 'true');
    expect(await bg(clue)).not.toBe(TRANSPARENT);
    const gm = page.getByTestId('mini-bar').locator('[data-mini="gm"]');
    await gm.click();
    await expect(gm).toHaveAttribute('aria-pressed', 'true');
    expect(await bg(gm)).not.toBe(TRANSPARENT);
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
  await page.getByRole('button', { name: '往左移' }).click();
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
  for (const [tag, n] of [
    ['全部', 9],
    ['住宅', 4],
    ['飯店・醫院', 3],
    ['廢墟・事件', 4],
  ] as const) {
    await dialog.getByRole('radio', { name: tag }).click();
    await expect(cards, tag).toHaveCount(n);
    await expect(cards.last(), tag).toContainText('空白地圖');
  }
  expect(errors).toEqual([]);
});

test('範本：分類、只載入格局、放入隱藏線索、空白地圖；可以復原', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '範本' }).click();
  const dialog = page.getByTestId('template-dialog');
  await expect(dialog.getByRole('button', { name: /洋館/ })).toBeVisible();
  await dialog.getByRole('radio', { name: '飯店・醫院' }).click();
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
    await expect(page.getByTestId('export-info')).toHaveText(
      `960 × ${Math.round((12 + 1.76) * 48)} px`,
    );
    [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('測試_地圖_GM.png');
    img = pngPixels(readFileSync((await dl.path()) as string));
    expect(img.height).toBe(Math.round((12 + 1.76) * 48));
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
    expect(saved).toMatchObject({ format: 'trpg-toolkit-project', tool: 'floor-plan', version: 1 });
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
    await expect(
      page.getByText('有 1 件家具的種類本工具沒有，已略過。', { exact: true }),
    ).toBeVisible();
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
