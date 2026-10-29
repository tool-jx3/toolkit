/**
 * 室內平面圖產生器：2026-10-29 參考 KIIN マップ制作スタジオ的四組功能（規格 1.25：F250～F269）——
 * L 形房間（工具 J、缺角的控制點、屬性、旋轉、匯出）、打通兩間房（K：共用的牆放門、自動走廊）、整理家具、
 * 家具跟著房間縮放、桌上的小物、黑色電影／監視終端、紙的污漬與摺痕、座標標示、VTT 用的匯出與上限、
 * 送到地圖演出產生器（map-fx F84）、專案檔版本 7。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { Floor, Item, Project, Room } from '../../src/tools/floor-plan/model/types';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('floor-plan') ?? { id: 'floor-plan', status: 'next' })}/`;
const FX_URL = `/${outputDir(getTool('map-fx') ?? { id: 'map-fx', status: 'next' })}/`;

type Hook = {
  useProject: { getState: () => { data: Project; replace: (p: Project) => void } };
  useEditor: { getState: () => { tool: string; sel: { type: string; id: string }[] } };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: { fitView: () => void };
  toClient: (x: number, y: number) => { x: number; y: number };
  computeWalls: (f: Floor) => {
    runs: { o: string; c: number; a: number; b: number; kind: string }[];
  };
};

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

const project = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __floorPlan: Hook }).__floorPlan.useProject.getState().data,
  );
const floor = async (page: Page): Promise<Floor> => {
  const p = await project(page);
  return p.floors[p.active];
};
const sel = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __floorPlan: Hook }).__floorPlan.useEditor.getState().sel,
  );
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __floorPlan: Hook }).__floorPlan.toClient(x, y),
    [x, y],
  );
const walls = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
    const p = h.useProject.getState().data;
    return h
      .computeWalls(p.floors[p.active])
      .runs.map((r) => `${r.o}${r.c}:${r.a}-${r.b}:${r.kind}`);
  });

/** 換成指定的樓層內容（一層、選取工具、畫面重新置中） */
async function setFloor(page: Page, patch: Partial<Floor>, extra: Partial<Project> = {}) {
  await page.evaluate(
    ([patch, extra]) => {
      const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
      const p = h.useProject.getState().data;
      const f = {
        id: 'f1',
        name: '1F',
        rooms: [],
        walls: [],
        openings: [],
        items: [],
        texts: [],
        ...patch,
      };
      h.useProject.getState().replace({ ...p, name: '測試', floors: [f], active: 0, ...extra });
      h.act.setTool('select');
      h.editor.fitView();
    },
    [patch, extra] as const,
  );
  await page.getByTestId('map-canvas').focus();
}

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

function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

const room = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
): Room => ({
  id,
  x,
  y,
  w,
  h,
  name: id,
  cat: 'living',
  ...extra,
});
const item = (
  id: string,
  t: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
): Item => ({
  id,
  t,
  x,
  y,
  w,
  h,
  rot,
});

test.describe('L 形房間（F257～F260）', () => {
  test('J 畫 L 形、牆照 L 形產生；缺角的控制點、形狀與缺角的屬性、旋轉、復原', async ({ page }) => {
    const errors = await open(page);
    await setFloor(page, {});
    await page.keyboard.press('j');
    await expect(page.locator('[data-tool="lroom"]')).toHaveAttribute('aria-pressed', 'true');
    await drag(page, [0, 0], [10, 8]);
    let f = await floor(page);
    expect(f.rooms).toHaveLength(1);
    expect(f.rooms[0]).toMatchObject({ x: 0, y: 0, w: 10, h: 8, cut: { c: 'ne', w: 5, h: 4 } });
    expect((await walls(page)).sort()).toEqual(
      [
        'h0:0-5:ext',
        'h4:5-10:ext',
        'h8:0-10:ext',
        'v0:0-8:ext',
        'v5:0-4:ext',
        'v10:4-8:ext',
      ].sort(),
    );
    /* 選取（工具留在 L 形房間）→ 選取工具、點 L 的下半部選到；缺角裡點不到 */
    await page.keyboard.press('v');
    await click(page, 7.5, 2);
    expect(await sel(page)).toEqual([]);
    await click(page, 2, 6);
    expect((await sel(page))[0]).toMatchObject({ type: 'room' });
    /* 轉角裡面的菱形控制點：拖到 (7, 2) → 缺角 3 × 2 */
    await drag(page, [5, 4], [7, 2]);
    f = await floor(page);
    expect(f.rooms[0].cut).toEqual({ c: 'ne', w: 3, h: 2 });
    /* 屬性面板：缺角換到左下、寬改 4 */
    const panel = page.getByTestId('props-panel');
    await expect(panel.getByTestId('props-readout')).toContainText('缺角 1.5×1m');
    await panel.getByRole('radio', { name: '左下' }).click();
    expect((await floor(page)).rooms[0].cut).toEqual({ c: 'sw', w: 3, h: 2 });
    /* R：順時針轉，缺角 sw → nw、寬深對調 */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('r');
    expect((await floor(page)).rooms[0]).toMatchObject({
      w: 8,
      h: 10,
      cut: { c: 'nw', w: 2, h: 3 },
    });
    /* 形狀改回長方形，再復原 */
    await panel.getByRole('radio', { name: '長方形' }).click();
    expect((await floor(page)).rooms[0].cut).toBeUndefined();
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await floor(page)).rooms[0].cut).toEqual({ c: 'nw', w: 2, h: 3 });
    expect(errors).toEqual([]);
  });

  test('拿著房間預設時 J 留著預設；點一下放預設尺寸的 L 形；專案檔版本 7 帶著缺角', async ({
    page,
  }) => {
    const errors = await open(page);
    await setFloor(page, {});
    await page.getByRole('tab', { name: '房間' }).click();
    await page.getByTestId('library').getByRole('button', { name: /^客廳/ }).click();
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('j');
    await click(page, 10, 10);
    const r = (await floor(page)).rooms[0];
    expect(r).toMatchObject({ name: '客廳', w: 9, h: 7, cut: { c: 'ne', w: 4, h: 3 } });
    await page.keyboard.press('Escape');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(saved).toMatchObject({ format: 'trpg-toolkit-project', tool: 'floor-plan', version: 7 });
    expect(saved.data.floors[0].rooms[0].cut).toEqual({ c: 'ne', w: 4, h: 3 });
    expect(errors).toEqual([]);
  });
});

test('L 形的匯出：缺角裡是背景；GM 專用的 L 形房間在 PL 用的圖蓋灰、缺角照樣是背景；分享連結帶著缺角（F260）', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('L', 0, 0, 12, 10, { cut: { c: 'ne', w: 6, h: 5 }, gm: true })],
  });
  await page.keyboard.press('Control+e');
  await expect(page.getByTestId('export-info')).toHaveText('768 × 672 px');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  const img = pngPixels(readFileSync((await dl.path()) as string));
  /* 世界座標 (x, y) → 匯出的 px（框從 -2 開始、每格 48 px） */
  const at2 = (x: number, y: number) => {
    const i = (Math.round((y + 2) * 48) * img.width + Math.round((x + 2) * 48)) * 4;
    return Array.from(img.data.subarray(i, i + 4));
  };
  expect(at2(9, 2)).toEqual([255, 255, 255, 255]);
  const gray = at2(3, 7);
  expect(gray[0]).toBeLessThan(230);
  expect(Math.abs(gray[0] - gray[2])).toBeLessThan(12);
  const hash = await page.evaluate(() =>
    (
      window as unknown as { __floorPlan: { shareHash: (m: string) => string } }
    ).__floorPlan.shareHash('pl'),
  );
  await page.keyboard.press('Escape');
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await page.getByRole('alertdialog').getByRole('button', { name: '取代' }).click();
  await expect.poll(async () => (await floor(page)).rooms[0]?.cut).toEqual({ c: 'ne', w: 6, h: 5 });
  expect(errors).toEqual([]);
});

test.describe('連接兩個房間（F250～F252）', () => {
  test('共用的牆：K 放一扇門（一步復原）；再按一次說已經相通；迷你工具列也有按鈕', async ({
    page,
  }) => {
    const errors = await open(page);
    await setFloor(page, { rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8)] });
    await click(page, 3, 3);
    await click(page, 13, 3, ['Shift']);
    await expect(page.getByTestId('mini-bar').locator('[data-mini="connect"]')).toBeVisible();
    await page.keyboard.press('k');
    await expect(page.getByText('已在共用的牆上加了一扇門', { exact: true })).toBeVisible();
    let f = await floor(page);
    expect(f.openings).toHaveLength(1);
    expect(f.openings[0]).toMatchObject({ kind: 'door', o: 'v', x: 10, len: 1.5 });
    expect((await sel(page))[0]).toMatchObject({ type: 'opening' });
    /* 再選兩間按一次：已經相通 */
    await click(page, 3, 3);
    await click(page, 13, 3, ['Shift']);
    await page.getByTestId('props-panel').getByTestId('connect-rooms').click();
    await expect(page.getByText('這兩間已經有門相通。', { exact: true })).toBeVisible();
    f = await floor(page);
    expect(f.openings).toHaveLength(1);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await floor(page)).openings).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('沒有共用的牆：自動走廊（直的、L 形）＋兩扇門；接不起來時不改資料', async ({ page }) => {
    const errors = await open(page);
    await setFloor(page, { rooms: [room('a', 0, 0, 8, 8), room('b', 14, 0, 8, 8)] });
    await click(page, 3, 3);
    await click(page, 17, 3, ['Shift']);
    await page.keyboard.press('k');
    await expect(page.getByText('已加了一條走廊（長 3 m）和兩扇門', { exact: true })).toBeVisible();
    let f = await floor(page);
    expect(f.rooms).toHaveLength(3);
    expect(f.rooms[2]).toMatchObject({ name: '走廊', cat: 'hall', x: 8, w: 6, h: 3 });
    expect(f.openings).toHaveLength(2);
    /* 錯開的兩間：L 形的走廊 */
    await setFloor(page, { rooms: [room('a', 0, 0, 8, 6), room('b', 14, 12, 8, 6)] });
    await click(page, 3, 3);
    await click(page, 17, 15, ['Shift']);
    await page.keyboard.press('k');
    await expect(page.getByText(/已加了一條走廊/).first()).toBeVisible();
    f = await floor(page);
    expect(f.rooms[2].cut).toBeDefined();
    /* 中間整排被房間擋住 */
    await setFloor(page, {
      rooms: [room('a', 0, 0, 8, 8), room('wall', 8, -20, 4, 48), room('b', 12, 0, 8, 8)],
    });
    await click(page, 3, 3);
    await click(page, 15, 3, ['Shift']);
    await page.keyboard.press('k');
    await expect(page.getByText(/找不到可以接的走廊/).first()).toBeVisible();
    expect((await floor(page)).rooms).toHaveLength(3);
    expect((await floor(page)).openings).toHaveLength(0);
    /* 只選一間：提示 */
    await click(page, 3, 3);
    await page.keyboard.press('k');
    await expect(
      page.getByText('請選兩間房間（按住 Shift 點一下加選）。', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('家具（F253～F255）', () => {
  test('自動擺放家具：靠牆的貼牆、桌上的小物跟著桌子；一步復原', async ({ page }) => {
    const errors = await open(page);
    await setFloor(page, {
      rooms: [room('r', 0, 0, 12, 10, { name: '書房' })],
      openings: [{ id: 'd', kind: 'door', o: 'h', x: 5, y: 10, len: 1.5, side: -1, hinge: 0 }],
      items: [
        item('shelf', 'bookshelf', 4, 1.5, 3, 0.8),
        /* 房間中間（離牆超過 1 m）的靠牆家具：留在原處 */
        item('mid', 'bookshelf', 6.5, 4.5, 2, 0.8),
        item('desk', 'desk', 4.5, 7.5, 2.4, 1.2),
        item('lamp', 'desk_lamp', 4.7, 7.7, 0.7, 0.7),
      ],
    });
    await click(page, 1, 1);
    await expect(page.getByTestId('arrange-room')).toHaveText('自動擺放家具');
    await page.getByTestId('arrange-room').click();
    await expect(page.getByText('已重新擺放「書房」的 4 件家具', { exact: true })).toBeVisible();
    const f = await floor(page);
    const get = (id: string) => f.items.find((i) => i.id === id) as Item;
    const shelf = get('shelf');
    expect(shelf).toMatchObject({ y: 0, rot: 0 });
    expect(get('mid')).toMatchObject({ x: 6.5, y: 4.5, rot: 0 });
    /* 桌子原本壓在門前：移開了（書桌靠牆、背面朝牆）；檯燈仍在桌上（跟著桌子一起轉、一起移） */
    const desk = get('desk');
    const lamp = get('lamp');
    const cx = lamp.x + lamp.w / 2;
    const cy = lamp.y + lamp.h / 2;
    expect(cx).toBeGreaterThan(desk.x);
    expect(cx).toBeLessThan(desk.x + desk.w);
    expect(cy).toBeGreaterThan(desk.y);
    expect(cy).toBeLessThan(desk.y + desk.h);
    /* 門（5～6.5, 10，往上開）的開門範圍與門前空著 */
    const hitsDoor = desk.x < 6.5 && desk.x + desk.w > 5 && desk.y < 10 && desk.y + desk.h > 8.5;
    expect(hitsDoor).toBe(false);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await floor(page)).items.find((i) => i.id === 'desk')).toMatchObject({
      x: 4.5,
      y: 7.5,
    });
    expect(errors).toEqual([]);
  });

  test('家具跟著房間縮放：貼東牆的跟著；Alt 不跟；地圖設定關掉後不跟', async ({ page }) => {
    const errors = await open(page);
    const items = [item('e', 'bookshelf', 9.2, 2, 0.8, 3, 90), item('t', 'table', 4, 3, 2, 2)];
    await setFloor(page, { rooms: [room('r', 0, 0, 10, 8)], items });
    await click(page, 1, 1);
    /* 東邊中點的控制點拖到 x＝14 */
    await drag(page, [10, 4], [14, 4]);
    let f = await floor(page);
    expect(f.rooms[0].w).toBe(14);
    expect(f.items.find((i) => i.id === 'e')?.x).toBeCloseTo(13.2);
    expect(f.items.find((i) => i.id === 't')?.x).toBeCloseTo(6);
    await page.keyboard.press('Control+z');
    expect((await floor(page)).items.find((i) => i.id === 'e')?.x).toBeCloseTo(9.2);
    /* Alt：這一次不跟 */
    await drag(page, [10, 4], [12, 4], ['Alt']);
    f = await floor(page);
    expect(f.rooms[0].w).toBe(12);
    expect(f.items.find((i) => i.id === 'e')?.x).toBeCloseTo(9.2);
    await page.keyboard.press('Control+z');
    /* 地圖設定關掉 */
    await page.keyboard.press('Escape');
    const toggle = page.getByRole('switch', { name: '改房間大小時家具跟著移動' });
    await toggle.click();
    expect((await project(page)).fixedFurniture).toBe(true);
    await click(page, 1, 1);
    await drag(page, [10, 4], [14, 4]);
    expect((await floor(page)).items.find((i) => i.id === 'e')?.x).toBeCloseTo(9.2);
    expect(errors).toEqual([]);
  });

  test('屬性面板打寬度：打「14」＋Enter 和拖曳到 14 一樣（中間經過 1 不會擠壞）；欄位裡 Ctrl＋Z＝復原按鈕', async ({
    page,
  }) => {
    const errors = await open(page);
    const items = [
      item('e', 'bookshelf', 9.2, 2, 0.8, 3, 90),
      item('t', 'table', 4, 3, 2, 2),
      item('c', 'chair', 7, 5.5, 1, 1),
    ];
    await setFloor(page, { rooms: [room('r', 0, 0, 10, 8)], items });
    const pos = async () => (await floor(page)).items.map((i) => [i.id, i.x, i.y] as const).sort();
    const start = await pos();
    await click(page, 1, 1);
    await drag(page, [10, 4], [14, 4]);
    expect((await floor(page)).rooms[0].w).toBe(14);
    const dragged = await pos();
    expect(dragged).not.toEqual(start);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    expect(await pos()).toEqual(start);
    /* 慢慢打：每個按鍵都套用（先經過寬 1） */
    const w = page.getByRole('spinbutton', { name: '寬' });
    await w.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('1', { delay: 50 });
    await expect.poll(async () => (await floor(page)).rooms[0].w).toBe(1);
    await page.keyboard.type('4', { delay: 50 });
    await page.keyboard.press('Enter');
    expect((await floor(page)).rooms[0].w).toBe(14);
    expect(await pos()).toEqual(dragged);
    /* 焦點還在欄位裡按 Ctrl＋Z：整個這一次輸入退回去（同復原按鈕），不是瀏覽器的文字復原 */
    await expect(w).toBeFocused();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await floor(page)).rooms[0].w).toBe(10);
    expect(await pos()).toEqual(start);
    await expect(w).toHaveValue('10');
    /* Ctrl＋Y：重做回到 14 */
    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await floor(page)).rooms[0].w).toBe(14);
    expect(await pos()).toEqual(dragged);
    /* 打到一半（沒按 Enter）就 Ctrl＋Z：結果和按復原按鈕一樣 */
    await w.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('6', { delay: 50 });
    await expect.poll(async () => (await floor(page)).rooms[0].w).toBe(6);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await floor(page)).rooms[0].w).toBe(14);
    expect(await pos()).toEqual(dragged);
    expect(errors).toEqual([]);
  });

  test('桌上的小物：拖桌子一起動、R 一起轉、複製一起複製；只拖小物可以拿開；刪除桌子小物留著', async ({
    page,
  }) => {
    const errors = await open(page);
    await setFloor(page, {
      rooms: [room('r', 0, 0, 16, 12)],
      items: [item('desk', 'desk', 4, 4, 2.4, 1.2), item('lamp', 'desk_lamp', 4.2, 4.2, 0.7, 0.7)],
    });
    await click(page, 5.8, 4.6);
    expect(await sel(page)).toEqual([{ type: 'item', id: 'desk' }]);
    await drag(page, [5.8, 4.6], [7.8, 6.6]);
    let f = await floor(page);
    expect(f.items.find((i) => i.id === 'lamp')).toMatchObject({ x: 6.2, y: 6.2 });
    /* R：檯燈繞桌子的中心轉 */
    await page.keyboard.press('r');
    f = await floor(page);
    const desk = f.items.find((i) => i.id === 'desk') as Item;
    const lamp = f.items.find((i) => i.id === 'lamp') as Item;
    expect(desk).toMatchObject({ rot: 90, w: 1.2, h: 2.4 });
    expect(lamp.rot).toBe(90);
    expect(lamp.x + lamp.w / 2).toBeGreaterThan(desk.x + desk.w / 2);
    /* Ctrl＋D：一起複製 */
    await page.keyboard.press('Control+d');
    expect((await floor(page)).items.filter((i) => i.t === 'desk_lamp')).toHaveLength(2);
    await page.keyboard.press('Control+z');
    /* 只拖檯燈：拿開 */
    await click(page, lamp.x + lamp.w / 2, lamp.y + lamp.h / 2);
    expect(await sel(page)).toEqual([{ type: 'item', id: 'lamp' }]);
    await drag(page, [lamp.x + lamp.w / 2, lamp.y + lamp.h / 2], [12, 10]);
    f = await floor(page);
    expect(f.items.find((i) => i.id === 'desk')).toMatchObject({ x: desk.x, y: desk.y });
    /* 刪除桌子：檯燈留著 */
    await page.keyboard.press('Control+z');
    await click(page, desk.x + 0.3, desk.y + desk.h - 0.3);
    expect(await sel(page)).toEqual([{ type: 'item', id: 'desk' }]);
    await page.keyboard.press('Delete');
    f = await floor(page);
    expect(f.items.map((i) => i.id)).toEqual(['lamp']);
    expect(errors).toEqual([]);
  });
});

test.describe('圖面風格與座標（F261～F264）', () => {
  test('黑色電影、監視終端：畫面與匯出都畫得出來（掃描線一列一列明暗交替）；匯出可以關掉顆粒與雜訊', async ({
    page,
  }) => {
    const errors = await open(page);
    await setFloor(page, { rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8, { gm: true })] });
    await page.keyboard.press('Escape');
    const style = page.getByRole('combobox', { name: '顯示樣式' });
    await style.click();
    await page.getByRole('option', { name: '監視終端' }).click();
    expect((await project(page)).theme).toBe('terminal');
    await page.keyboard.press('Control+e');
    await expect(page.getByTestId('export-info')).toHaveText('960 × 576 px');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    const img = pngPixels(readFileSync((await dl.path()) as string));
    /* 每格 48 px＝掃描線每 6 px 一條：同一欄的上下兩列亮度不同 */
    const scanLines = (im: typeof img) => {
      const l = (x: number, y: number) => {
        const i = (y * im.width + x) * 4;
        return im.data[i] + im.data[i + 1] + im.data[i + 2];
      };
      let n = 0;
      for (let y = 200; y < 260; y++) if (l(300, y) < l(300, y + 1) - 6) n++;
      return n;
    };
    expect(scanLines(img)).toBeGreaterThanOrEqual(6);
    /* 顆粒與雜訊（只有黑色電影、監視終端有）：關掉時檔案小很多、掃描線照畫 */
    const noise = page.getByRole('switch', { name: '顆粒與雜訊' });
    await expect(noise).toBeChecked();
    await noise.click();
    const [dl2] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    const bytes2 = readFileSync((await dl2.path()) as string);
    const bytes1 = readFileSync((await dl.path()) as string);
    expect(bytes2.length).toBeLessThan(bytes1.length * 0.5);
    expect(scanLines(pngPixels(bytes2))).toBeGreaterThanOrEqual(6);
    const exportStyle = page.getByTestId('export-dialog').getByRole('combobox', { name: '樣式' });
    await exportStyle.click();
    await page.getByRole('option', { name: '彩色' }).click();
    await expect(noise).toHaveCount(0);
    await exportStyle.click();
    await page.getByRole('option', { name: '黑色電影' }).click();
    await expect(noise).not.toBeChecked();
    await noise.click();
    await page.keyboard.press('Escape');
    await style.click();
    await page.getByRole('option', { name: '黑色電影' }).click();
    expect((await project(page)).theme).toBe('noir');
    expect(errors).toEqual([]);
  });

  test('座標標示：匯出的圖變大、左上角仍在方格線上；污漬與摺痕：重新產生會改種子、可以復原', async ({
    page,
  }) => {
    const errors = await open(page);
    await setFloor(
      page,
      { rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8)] },
      { tokenGrid: 2 },
    );
    await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: '座標標示（A1、B2…）' }).click();
    expect((await project(page)).coords).toBe(true);
    await page.keyboard.press('Control+e');
    /* 沒有座標時 960 × 576（2 格留白、對齊 1 m）；有座標時上面與左邊多一個 1 m */
    await expect(page.getByTestId('export-info')).toHaveText('1056 × 672 px');
    await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: '紙的污漬與摺痕' }).click();
    const p1 = await project(page);
    expect(p1.wear).toBe(0.6);
    expect(typeof p1.wearSeed).toBe('number');
    await page.getByTestId('wear-shuffle').click();
    const p2 = await project(page);
    expect(p2.wearSeed).not.toBe(p1.wearSeed);
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await project(page)).wearSeed).toBe(p1.wearSeed);
    expect(errors).toEqual([]);
  });
});

test.describe('VTT 用的匯出（F265、F266）', () => {
  test('整數格、每格 px、檔名帶格數、複製格數；太大時不能匯出', async ({ page }) => {
    const errors = await open(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await setFloor(page, { rooms: [room('a', 0, 0, 13, 9)] }, { tokenGrid: 2 });
    await page.keyboard.press('Control+e');
    const dialog = page.getByTestId('export-dialog');
    await dialog.getByRole('radio', { name: 'VTT 用' }).click();
    /* 13 × 9 格＋四周 2 格 → 18 × 14 格 → 對齊 1 m：18 × 14 → 9 × 7 個 VTT 格 */
    await expect(page.getByTestId('export-info')).toHaveText('橫 9 格 × 縱 7 格・900 × 700 px');
    await dialog.getByRole('radio', { name: '50px' }).click();
    await expect(page.getByTestId('export-info')).toHaveText('橫 9 格 × 縱 7 格・450 × 350 px');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('測試_PL_9x7.png');
    const img = pngPixels(readFileSync((await dl.path()) as string));
    expect([img.width, img.height]).toEqual([450, 350]);
    await page.getByTestId('export-vtt-copy').click();
    await expect(page.getByText('已複製格數與大小', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      '橫 9 格 × 縱 7 格・450 × 350 px',
    );
    /* 太大：任一邊超過 8192 px */
    await page.keyboard.press('Escape');
    await setFloor(page, { rooms: [room('a', 0, 0, 200, 20)] }, { tokenGrid: 2 });
    await page.keyboard.press('Control+e');
    await dialog.getByRole('radio', { name: '100px' }).click();
    await expect(page.getByTestId('export-vtt-too-large')).toContainText(
      '圖片太大（10200 × 1200 px）',
    );
    /* 已經只有這一層：不再建議「改成只匯出這一層」 */
    await expect(page.getByTestId('export-vtt-too-large')).not.toContainText('只匯出這一層');
    await expect(page.getByTestId('export-download')).toBeDisabled();
    await expect(page.getByTestId('export-send-fx')).toBeDisabled();
    await dialog.getByRole('radio', { name: '一般圖片' }).click();
    await expect(page.getByTestId('export-vtt-too-large')).toHaveCount(0);
    await expect(page.getByTestId('export-download')).toBeEnabled();
    expect(errors).toEqual([]);
  });
});

/** 送出的頁面：記下 window.open 的網址；`blobDelayMs` 讓畫好的圖晚一點才交出來（模擬很大的圖） */
const watchSend = (page: Page, blobDelayMs = 0) =>
  page.evaluate((delay) => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    const open = window.open.bind(window);
    window.open = (url?: string | URL, target?: string, features?: string) => {
      w.__opened.push(String(url));
      return open(url, target, features);
    };
    if (delay > 0) {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
        toBlob.call(this, (b) => setTimeout(() => cb(b), delay), ...a);
      };
    }
  }, blobDelayMs);

const routeFonts = (p: Page) =>
  p.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );

test.describe('送到地圖演出產生器（F267、map-fx F84）', () => {
  test('點了馬上開新分頁（網址帶交接編號）；圖晚到也讀得到、1 格幾 px 跟著；讀過一次就沒有了', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await setFloor(
      page,
      { rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8)] },
      { tokenGrid: 2 },
    );
    await page.keyboard.press('Control+e');
    const dialog = page.getByTestId('export-dialog');
    await dialog.getByRole('radio', { name: 'VTT 用' }).click();
    await dialog.getByRole('radio', { name: '70px' }).click();
    /* 圖要 4 秒才畫好：新分頁不等它，開好之後顯示「正在接收」 */
    await watchSend(page, 4000);
    const [fx] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('export-send-fx').click(),
    ]);
    const fxErrors: string[] = [];
    fx.on('pageerror', (e) => fxErrors.push(e.message));
    await routeFonts(fx);
    expect(
      await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened),
    ).toEqual([expect.stringMatching(new RegExp(`${FX_URL}#handoff=[\\w-]+$`))]);
    await expect(page.getByText('已送到地圖演出產生器（新分頁）', { exact: true })).toHaveCount(0);
    await expect(fx.getByTestId('handoff-waiting')).toContainText('正在接收平面圖產生器送來的圖');
    const ask = fx.getByRole('alertdialog');
    await expect(ask).toContainText(/平面圖產生器送來的圖/, { timeout: 15_000 });
    await expect(ask).toContainText('測試_PL_10x6');
    await expect(fx.getByTestId('handoff-waiting')).toHaveCount(0);
    await expect(page.getByText('已送到地圖演出產生器（新分頁）', { exact: true })).toBeVisible();
    /* 交接編號讀到就從網址拿掉 */
    expect(await fx.evaluate(() => location.hash)).toBe('');
    await ask.getByRole('button', { name: /讀入|取代/ }).click();
    await expect(
      fx.getByText('已讀入平面圖產生器送來的「測試_PL_10x6」', { exact: true }),
    ).toBeVisible();
    await fx.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
    const state = await fx.evaluate(() => {
      const h = (window as unknown as { __mapFx: Record<string, () => Record<string, unknown>> })
        .__mapFx;
      return { image: h.doc().image, grid: h.prefs().grid };
    });
    expect(state.image).toMatchObject({ name: '測試_PL_10x6', width: 700, height: 420 });
    expect(state.grid).toBe(70);
    /* 重新整理：不會再問一次、也不會再等 */
    await fx.reload();
    await expect(fx.getByRole('heading', { level: 1 })).toBeVisible();
    await fx.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
    await expect(fx.getByRole('alertdialog')).toHaveCount(0);
    await expect(fx.getByTestId('handoff-waiting')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(fxErrors).toEqual([]);
  });

  test('寫入失敗：已經開的分頁馬上知道（不乾等到逾時）、不問；平面圖這邊也說明', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await setFloor(page, { rooms: [room('a', 0, 0, 10, 8)] });
    /* 交接的資料庫寫不進去（失敗的紀錄也寫不進去：只能靠分頁之間的通知） */
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...a: Parameters<IDBObjectStore['put']>) {
        if (this.transaction.db.name === 'trpg-toolkit:handoff')
          throw new DOMException('測試：空間不足', 'QuotaExceededError');
        return put.apply(this, a);
      };
    });
    await watchSend(page);
    await page.keyboard.press('Control+e');
    const [fx] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('export-send-fx').click(),
    ]);
    const fxErrors: string[] = [];
    fx.on('pageerror', (e) => fxErrors.push(e.message));
    await routeFonts(fx);
    await expect(
      page.getByText('瀏覽器不能暫存這張圖，請改用「下載 PNG」，再到地圖演出產生器讀入。', {
        exact: true,
      }),
    ).toBeVisible();
    const t0 = Date.now();
    await expect(fx.getByText('平面圖產生器沒能把圖送過來', { exact: true }).first()).toBeVisible({
      timeout: 8_000,
    });
    /* 平面圖已經說失敗了：不必等到 10 秒的逾時 */
    expect(Date.now() - t0).toBeLessThan(8_000);
    await expect(fx.getByTestId('handoff-waiting')).toHaveCount(0);
    await expect(fx.getByRole('alertdialog')).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(fxErrors).toEqual([]);
  });
});
