/**
 * 室內平面圖產生器：2026-11-05 跟進 KIIN「マップ制作スタジオ」v2.0 第二批（規格 1.28：F289～F302）——
 * 曲線的房間（形狀的切換、沿著曲線的牆、放在曲線上的門窗、家具超出時不改）、曲線的房間的預設、
 * 甲板疊在海面上的欄杆、客輪範本、送給地圖演出產生器的曲線範圍（map-fx F89）、專案檔版本 9。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { Floor, Item, Project, Room } from '../../src/tools/floor-plan/model/types';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('floor-plan') ?? { id: 'floor-plan', status: 'next' })}/`;

type Hook = {
  useProject: { getState: () => { data: Project; replace: (p: Project) => void } };
  useEditor: { getState: () => { tool: string; sel: { type: string; id: string }[] } };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: { fitView: () => void };
  toClient: (x: number, y: number) => { x: number; y: number };
  computeWalls: (f: Floor) => {
    runs: { o: string; c: number; a: number; b: number; kind: string }[];
    curves: { kind: string; pts: [number, number][] }[];
    poses: Map<string, { x: number; y: number; rot: number }>;
  };
};

const routeFonts = (p: Page) =>
  p.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeFonts(page);
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
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __floorPlan: Hook }).__floorPlan.toClient(x, y),
    [x, y],
  );

/** 目前這一層的牆：直的段（o、c、a～b、種類）、曲線的段的種類、放在曲線上的門窗 */
const walls = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
    const p = h.useProject.getState().data;
    const w = h.computeWalls(p.floors[p.active]);
    return {
      runs: w.runs.map((r) => `${r.o}${r.c}:${+r.a.toFixed(2)}-${+r.b.toFixed(2)}:${r.kind}`),
      curves: w.curves.map((c) => c.kind),
      poses: [...w.poses.keys()],
    };
  });

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

async function click(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
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
): Room => ({ id, x, y, w, h, name: id, cat: 'living', ...extra });
const item = (id: string, t: string, x: number, y: number, w: number, h: number): Item => ({
  id,
  t,
  x,
  y,
  w,
  h,
  rot: 0,
});

/** 世界座標 → 匯出的圖（每格 48 px、框從 -2 開始）的像素 */
const px48 = (img: PixelBuffer, x: number, y: number) => {
  const i = (Math.round((y + 2) * 48) * img.width + Math.round((x + 2) * 48)) * 4;
  return Array.from(img.data.subarray(i, i + 4));
};

test('曲線的房間（F289、F290）：屬性面板換成圓・橢圓、牆沿著曲線；換形狀；家具會超出時不改；回到長方形；復原', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, { rooms: [room('r', 0, 0, 10, 8)] });
  await click(page, 5, 4);
  const panel = page.getByTestId('props-panel');
  await panel.getByRole('radio', { name: '曲線' }).click();
  let f = await floor(page);
  expect(f.rooms[0].shape).toBe('ellipse');
  expect(await walls(page)).toEqual({ runs: [], curves: ['ext'], poses: [] });
  /* 形狀的選單：船體（船首朝右） */
  await panel.getByTestId('room-curve-shape').click();
  await page.getByRole('option', { name: '船體（船首朝右）' }).click();
  f = await floor(page);
  expect(f.rooms[0].shape).toBe('hull-e');
  const w = await walls(page);
  expect(w.runs.length).toBeGreaterThan(0);
  expect(w.curves.length).toBeGreaterThan(0);
  /* 圓角：半徑欄（0.5 格一格） */
  await panel.getByTestId('room-curve-shape').click();
  await page.getByRole('option', { name: '圓角' }).click();
  await panel.getByLabel('圓角的半徑').fill('2');
  await panel.getByLabel('圓角的半徑').press('Enter');
  expect((await floor(page)).rooms[0]).toMatchObject({ shape: 'round', radius: 2 });
  /* 回到長方形：形狀與半徑都拿掉；復原回到圓角 */
  await panel.getByRole('radio', { name: '長方形' }).click();
  f = await floor(page);
  expect(f.rooms[0].shape).toBeUndefined();
  expect(f.rooms[0].radius).toBeUndefined();
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await floor(page)).rooms[0].shape).toBe('round');

  /* 角落有家具：換成圓形會超出，不改、通知 */
  await setFloor(page, {
    rooms: [room('r', 0, 0, 10, 8)],
    items: [item('w', 'wardrobe', 0.2, 0.2, 3, 1.2)],
  });
  await click(page, 5, 4);
  await panel.getByRole('radio', { name: '曲線' }).click();
  await expect(page.getByText('有 1 件家具會超出新的形狀，沒有改變').first()).toBeVisible();
  expect((await floor(page)).rooms[0].shape).toBeUndefined();
  expect(errors).toEqual([]);
});

test('放在曲線上的門（F291）：拿著門點在曲線附近 → 門畫在曲線上；點選得到；PNG 的外框角落是背景、中間是地板', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, { rooms: [room('e', 0, 0, 12, 10, { shape: 'ellipse', cat: 'public' })] });
  /* 素材面板的門窗分頁：單開門 */
  await page.getByRole('tab', { name: '門窗' }).click();
  await page.locator('[data-opening="door"]').first().click();
  /* 東北的曲線上（裡面一點） */
  await click(page, 9.6, 1.9);
  let w = await walls(page);
  expect(w.poses).toHaveLength(1);
  const f = await floor(page);
  expect(f.openings).toHaveLength(1);
  /* 選取工具、點那扇門 → 選到門 */
  await page.keyboard.press('v');
  const pose = await page.evaluate(() => {
    const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
    const p = h.useProject.getState().data;
    const fl = p.floors[p.active];
    const [o] = fl.openings;
    return h.computeWalls(fl).poses.get(o.id);
  });
  await click(page, pose?.x ?? 0, pose?.y ?? 0);
  const sel = await page.evaluate(
    () => (window as unknown as { __floorPlan: Hook }).__floorPlan.useEditor.getState().sel,
  );
  expect(sel[0]).toMatchObject({ type: 'opening' });
  /* 曲線的牆在門的地方切開（一整圈的牆切成兩段，接頭在外形的起點） */
  w = await walls(page);
  expect(w.curves.length).toBeGreaterThanOrEqual(1);

  /* 匯出 PNG（每格 48 px）：外框的左上角是背景、中間是地板（不是白底） */
  await page.keyboard.press('Control+e');
  const dialog = page.getByTestId('export-dialog');
  await dialog.getByRole('radio', { name: '48px' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  const img = pngPixels(readFileSync((await dl.path()) as string));
  const corner = px48(img, 0.4, 0.4);
  const bg = px48(img, -1.5, -1.5);
  expect(corner).toEqual(bg);
  expect(px48(img, 6, 5)).not.toEqual(bg);
  expect(errors).toEqual([]);
});

test('曲線的房間的預設（F289）：素材面板「曲線的房間・船」的圓形大廳拖曳畫出橢圓；專案檔版本 9 帶著形狀', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {});
  await page.getByRole('tab', { name: '房間' }).click();
  await page.locator('[data-room="roundHall"]').click();
  await drag(page, [0, 0], [12, 10]);
  const f = await floor(page);
  expect(f.rooms).toHaveLength(1);
  expect(f.rooms[0]).toMatchObject({ x: 0, y: 0, w: 12, h: 10, shape: 'ellipse', cat: 'public' });
  /* 專案檔 */
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const json = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
  expect(json.version).toBe(12);
  expect(json.data.floors[0].rooms[0].shape).toBe('ellipse');
  expect(errors).toEqual([]);
});

test('甲板疊在海面上（F299）：外圍是欄杆、甲板上的甲板是段差線；夜航蒸汽客輪範本（F301）載入後是曲線的船體', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [
      room('sea', 0, 0, 30, 16, { cat: 'water' }),
      room('deck', 3, 3, 22, 10, { cat: 'shipdeck', shape: 'hull-e', deck: true }),
      room('fore', 17, 5, 7, 6, { cat: 'shipdeck', shape: 'bow-e', deck: true }),
    ],
  });
  const w = await walls(page);
  expect(new Set(w.curves)).toEqual(new Set(['rail', 'step']));
  /* 屬性面板關掉「疊在地面上時外圍是欄杆」：船體的欄杆不見（照以前的規則）；復原 */
  await click(page, 6, 8);
  const sw = page
    .getByTestId('props-panel')
    .getByRole('switch', { name: '疊在地面上時外圍是欄杆' });
  await expect(sw).toBeChecked();
  await sw.click();
  expect((await floor(page)).rooms[1].deck).toBeUndefined();
  expect((await walls(page)).curves).toEqual(['step']);
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Control+z');
  expect((await floor(page)).rooms[1].deck).toBe(true);
  /* 新畫的甲板（素材面板的船體甲板）預設打開 */
  await page.getByRole('tab', { name: '房間' }).click();
  await page.locator('[data-room="hullDeck"]').click();
  await drag(page, [0, 18], [18, 24]);
  expect((await floor(page)).rooms.at(-1)).toMatchObject({
    cat: 'shipdeck',
    shape: 'hull-e',
    deck: true,
  });
  await page.keyboard.press('Escape');
  /* 範本：對話框裡搜尋得到；載入（同範本對話框的載入） */
  await page.getByRole('button', { name: '範本' }).click();
  const dlg = page.getByTestId('template-dialog');
  await dlg.getByPlaceholder(/#標籤/).fill('客輪');
  await expect(dlg.getByRole('list').getByRole('button', { name: /^夜航蒸汽客輪/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    (window as unknown as { __floorPlan: Hook }).__floorPlan.act.loadTemplate('steamliner', {
      structureOnly: false,
      clues: false,
    }),
  );
  await expect.poll(async () => (await project(page)).name).toBe('夜航蒸汽客輪');
  const p = await project(page);
  expect(p.floors.map((f) => f.name)).toEqual(['B1', '1F']);
  const deck = p.floors[1].rooms.find((r) => r.name === '散步甲板');
  expect(deck?.shape).toBe('hull-e');
  expect(p.floors[0].rooms.find((r) => r.name === '密艙')?.gm).toBe(true);
  expect(errors).toEqual([]);
});

test('送給地圖演出產生器（F297、map-fx F89）：曲線的房間是曲線的遮罩；長方形照舊', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('客廳', 0, 0, 12, 10), room('圓廳', 12, 0, 10, 10, { shape: 'ellipse' })],
  });
  await page.keyboard.press('Control+e');
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  const [fx] = await Promise.all([
    context.waitForEvent('page'),
    page.getByTestId('export-send-fx').click(),
  ]);
  const fxErrors: string[] = [];
  fx.on('pageerror', (e) => fxErrors.push(e.message));
  await routeFonts(fx);
  const ask = fx.getByRole('alertdialog');
  await expect(ask).toContainText('平面圖帶來 2 間房間的範圍與名字', { timeout: 15_000 });
  await ask.getByRole('button', { name: '讀入並建立 2 個房間遮罩' }).click();
  await expect(fx.getByText(/^已讀入平面圖產生器送來的/)).toBeVisible();
  await fx.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
  const frames = (await fx.evaluate(
    () =>
      (window as unknown as { __mapFx: { doc: () => { frames: unknown[] } } }).__mapFx.doc().frames,
  )) as { label: string; poly?: [number, number][] }[];
  expect(frames.map((f) => f.label)).toEqual(['客廳', '圓廳']);
  expect(frames[0].poly).toBeUndefined();
  expect(frames[1].poly?.length).toBeGreaterThan(20);
  expect(errors).toEqual([]);
  expect(fxErrors).toEqual([]);
});

test('390 寬：曲線的形狀欄位沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await setFloor(page, { rooms: [room('r', 0, 0, 10, 8, { shape: 'round' })] });
  await click(page, 5, 4);
  await expect(page.getByTestId('room-curve-shape')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
