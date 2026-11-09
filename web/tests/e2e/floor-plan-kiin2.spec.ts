/**
 * 室內平面圖產生器：2026-11-05 跟進 KIIN「マップ制作スタジオ」v2.0 第一批（規格 1.27：F273～F287）——
 * 夜的暗度與光源、房間的內裝預設、圓形配置、家具的細角度與倍率、整張地圖轉 90°／反轉、新的地板、
 * 船的素材與螺旋梯、下繪圖、揭露用的圖、自由線與曲線箭頭、專案檔版本 8。
 */
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import type { PixelBuffer } from '../../src/core/image';
import { getTool, outputDir } from '../../src/registry';
import type { Floor, Item, Project, Room } from '../../src/tools/floor-plan/model/types';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('floor-plan') ?? { id: 'floor-plan', status: 'next' })}/`;

type Hook = {
  useProject: { getState: () => { data: Project; replace: (p: Project) => void } };
  useEditor: {
    getState: () => { tool: string; sel: { type: string; id: string }[]; underlay: unknown };
  };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: { fitView: () => void };
  toClient: (x: number, y: number) => { x: number; y: number };
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

/** 一張單色的小 PNG（下繪圖用；RGB、不壓縮的濾波 0） */
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

async function download(page: Page): Promise<{ name: string; img: PixelBuffer }> {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  return {
    name: dl.suggestedFilename(),
    img: pngPixels(readFileSync((await dl.path()) as string)),
  };
}

const room = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
): Room => ({ id, x, y, w, h, name: id, cat: 'living', ...extra });
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

/** 世界座標 → 匯出的圖（每格 48 px、框從 -2 開始）的像素 */
const px48 = (img: PixelBuffer, x: number, y: number) => {
  const i = (Math.round((y + 2) * 48) * img.width + Math.round((x + 2) * 48)) * 4;
  return Array.from(img.data.subarray(i, i + 4));
};
const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('夜的暗度（F273、F274）：房間變暗、燭台旁邊亮；光不跨到隔壁；房間外面（透明背景）不蓋；PL 用的圖不含 GM 專用的光源', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('A', 0, 0, 10, 8), room('B', 10, 0, 8, 8)],
    items: [
      item('c', 'candle', 8.6, 3.6, 0.8, 0.8),
      { ...item('g', 'candle', 13.6, 3.6, 0.8, 0.8), gm: true },
    ],
  });
  /* 地圖設定：一鍵打開（55%） */
  await page.getByTestId('night-on').click();
  expect((await project(page)).night).toBe(0.55);
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Control+e');
  const dialog = page.getByTestId('export-dialog');
  await dialog.getByRole('switch', { name: '透明背景' }).click();
  await dialog.getByRole('radio', { name: 'GM 用（全部顯示）' }).click();
  const gm = await download(page);
  await dialog.getByRole('radio', { name: 'PL 用（藏起 GM 專用）' }).click();
  const pl = await download(page);
  /* 燭台旁邊（1 格多）比房間的另一頭亮；隔壁的 B 在 PL 用的圖是全暗、在 GM 用的圖有 GM 的燭台 */
  const near = luma(px48(pl.img, 8, 5));
  const far = luma(px48(pl.img, 1, 7));
  expect(near).toBeGreaterThan(far + 40);
  const bPl = luma(px48(pl.img, 14, 5));
  const bGm = luma(px48(gm.img, 14, 5));
  expect(bGm).toBeGreaterThan(bPl + 40);
  /* 牆的另一邊（B，離 A 的燭台 1.5 格）在 PL 用的圖和 B 的遠處一樣暗：光不跨過牆 */
  expect(Math.abs(luma(px48(pl.img, 10.5, 4)) - luma(px48(pl.img, 17, 7)))).toBeLessThan(8);
  /* 房間外面：透明 */
  expect(px48(pl.img, -1, -1)[3]).toBe(0);
  /* 0% 是白天（拿掉欄位） */
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    (window as unknown as { __floorPlan: Hook }).__floorPlan.act.setNight(0),
  );
  expect((await project(page)).night).toBeUndefined();
  expect(errors).toEqual([]);
});

test('內裝預設（F275）：書房換掉房間裡的家具、線索留著；一步復原；太小的房間不改', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('R', 0, 0, 12, 10), room('S', 14, 0, 2, 2)],
    openings: [{ id: 'd', kind: 'door', o: 'h', x: 5, y: 10, len: 1.5, side: -1, hinge: 0 }],
    items: [
      item('old', 'bed_single', 1, 1, 2, 4),
      { ...item('clue', 'diary', 9, 7, 1, 0.8), clue: true },
    ],
  });
  await click(page, 6, 2);
  const panel = page.getByTestId('props-panel');
  await panel.locator('[data-furnish="study"]').click();
  await expect(page.getByText(/^已把「R」換成書房的內裝/)).toBeVisible();
  let f = await floor(page);
  const ts = f.items.map((i) => i.t);
  expect(ts).not.toContain('bed_single');
  expect(ts).toEqual(expect.arrayContaining(['desk', 'chair', 'bookshelf', 'diary']));
  expect(f.items.find((i) => i.id === 'clue')).toMatchObject({ x: 9, y: 7 });
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Control+z');
  f = await floor(page);
  expect(f.items.map((i) => i.id).sort()).toEqual(['clue', 'old']);
  /* 2 × 2 的小房間：放不下研究室 */
  await click(page, 15, 1);
  await panel.locator('[data-furnish="lab"]').click();
  await expect(
    page.getByText('「S」放不下研究室的家具，沒有改變。請把房間放大，或換一組。', { exact: true }),
  ).toBeVisible();
  expect((await floor(page)).items).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('圓形配置（F279）：6 個一圈朝著圓桌、換成 8 個、內外反轉、選取整圈；單獨拖一件離開這一圈', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('R', 0, 0, 16, 16)],
    items: [item('t', 'table_round', 7.1, 7.1, 1.8, 1.8), item('c', 'chair', 7.5, 4, 1, 1)],
  });
  await click(page, 8, 4.5);
  const panel = page.getByTestId('props-panel');
  await panel.locator('[data-ring="6"]').click();
  await expect(page.getByText('已排成 6 個一圈', { exact: true })).toBeVisible();
  let chairs = (await floor(page)).items.filter((i) => i.t === 'chair');
  expect(chairs).toHaveLength(6);
  const ring = chairs[0].ring;
  expect(ring).toBeTruthy();
  for (const c of chairs) {
    expect(c.ring).toBe(ring);
    const ang = (Math.atan2(c.y + c.h / 2 - 8, c.x + c.w / 2 - 8) * 180) / Math.PI;
    expect(c.rot).toBe((((Math.round(ang + 90) % 360) + 360) % 360) % 360);
  }
  await expect(panel.getByTestId('ring')).toContainText('一圈 6 個');
  await panel.locator('[data-ring="8"]').click();
  chairs = (await floor(page)).items.filter((i) => i.t === 'chair');
  expect(chairs).toHaveLength(8);
  const before = chairs.map((c) => c.rot);
  await panel.locator('[data-ring="flip"]').click();
  chairs = (await floor(page)).items.filter((i) => i.t === 'chair');
  expect(chairs.map((c) => c.rot)).toEqual(before.map((r) => (r + 180) % 360));
  await panel.locator('[data-ring="select"]').click();
  expect(await sel(page)).toHaveLength(8);
  /* 單獨拖一件：離開這一圈 */
  const one = chairs[0];
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Escape');
  await drag(
    page,
    [one.x + one.w / 2, one.y + one.h / 2],
    [one.x + one.w / 2 + 1, one.y + one.h / 2 - 1],
  );
  const moved = (await floor(page)).items.find((i) => i.id === one.id);
  expect(moved?.ring).toBeUndefined();
  expect((await floor(page)).items.filter((i) => i.ring === ring)).toHaveLength(7);
  expect(errors).toEqual([]);
});

test('家具的角度與倍率（F277、F278）：Shift＋R 15°、Q 反方向 90°、角度欄 1°、倍率 2 倍；放置中也可以轉 15°', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('R', 0, 0, 12, 10)],
    items: [item('s', 'sofa2', 4, 4, 3.2, 1.8)],
  });
  await click(page, 5.6, 4.9);
  await page.keyboard.press('Shift+r');
  expect((await floor(page)).items[0].rot).toBe(15);
  await page.keyboard.press('Shift+q');
  await page.keyboard.press('Shift+q');
  expect((await floor(page)).items[0].rot).toBe(345);
  await page.keyboard.press('q');
  expect((await floor(page)).items[0]).toMatchObject({ rot: 255, w: 1.8, h: 3.2 });
  const panel = page.getByTestId('props-panel');
  const angle = panel.getByRole('spinbutton', { name: '角度' });
  await angle.fill('30');
  await angle.press('Enter');
  expect((await floor(page)).items[0]).toMatchObject({ rot: 30, w: 3.2, h: 1.8 });
  const scale = panel.getByRole('spinbutton', { name: '倍率' });
  await scale.fill('2');
  await scale.press('Enter');
  const s = (await floor(page)).items[0];
  expect([s.w, s.h]).toEqual([6.4, 3.6]);
  /* 中心不動 */
  expect(s.x + s.w / 2).toBeCloseTo(5.6, 6);
  expect(s.y + s.h / 2).toBeCloseTo(4.9, 6);
  /* 放置中：Shift＋R 每次 15° */
  await page.getByRole('tab', { name: '家具・小物' }).click();
  await page.getByRole('searchbox', { name: '搜尋家具' }).fill('帆柱');
  await page.getByTestId('library').locator('[data-asset="mast"]').click();
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Shift+r');
  await page.keyboard.press('Shift+r');
  await click(page, 6, 8);
  const mast = (await floor(page)).items.find((i) => i.t === 'mast');
  expect(mast?.rot).toBe(30);
  expect(errors).toEqual([]);
});

test('整張地圖轉 90°、反轉（F276）：所有樓層一起轉、轉四次回到原樣、一步復原', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '範本' }).click();
  await page.getByTestId('template-dialog').getByRole('button', { name: /^洋館/ }).click();
  await expect(page.getByTestId('template-dialog')).toHaveCount(0);
  const before = await project(page);
  const panel = page.getByTestId('props-panel');
  const tr = panel.getByTestId('map-transform');
  await tr.getByRole('button', { name: '轉 90°' }).click();
  await expect(page.getByText('整張地圖轉了 90°', { exact: true })).toBeVisible();
  let p = await project(page);
  /* 每一層的第一間房：寬深對調 */
  p.floors.forEach((f, i) => {
    expect([f.rooms[0].w, f.rooms[0].h]).toEqual([
      before.floors[i].rooms[0].h,
      before.floors[i].rooms[0].w,
    ]);
  });
  for (let k = 0; k < 3; k++) await tr.getByRole('button', { name: '轉 90°' }).click();
  p = await project(page);
  expect(p.floors.map((f) => f.rooms.map((r) => [r.x, r.y, r.w, r.h]))).toEqual(
    before.floors.map((f) => f.rooms.map((r) => [r.x, r.y, r.w, r.h])),
  );
  await tr.getByRole('button', { name: '左右反轉' }).click();
  p = await project(page);
  expect(p.floors[0].rooms[0].x).not.toBe(before.floors[0].rooms[0].x);
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Control+z');
  p = await project(page);
  expect(p.floors[0].rooms[0].x).toBe(before.floors[0].rooms[0].x);
  expect(errors).toEqual([]);
});

test('新的地板（F282）與船的素材、逆時針的螺旋梯（F280、F281）', async ({ page }) => {
  const errors = await open(page);
  await setFloor(page, { rooms: [room('R', 0, 0, 10, 8)] });
  await click(page, 5, 4);
  const panel = page.getByTestId('props-panel');
  await panel.getByTestId('room-floor').click();
  await page.getByRole('option', { name: '地毯' }).click();
  expect((await floor(page)).rooms[0].floor).toBe('carpet');
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+e');
  const carpet = await download(page);
  /* 地毯的底色（不是彩色樣式客廳的米色） */
  const c = px48(carpet.img, 1.5, 4);
  expect(c[0]).toBeGreaterThan(c[2] + 20);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '家具・小物' }).click();
  const search = page.getByRole('searchbox', { name: '搜尋家具' });
  for (const [q, id] of [
    ['艦砲', 'ship_cannon'],
    ['蒸汽機', 'steam_engine'],
    ['絞盤', 'capstan'],
    ['纜繩', 'rope_coil'],
    ['逆時針', 'spiral_ccw'],
  ] as const) {
    await search.fill(q);
    await expect(page.getByTestId('library').locator(`[data-asset="${id}"]`)).toBeVisible();
  }
  await search.fill('#船');
  await expect(page.getByTestId('library').locator('[data-asset="mast"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('下繪圖（F283）：選圖片之後疊在畫面上；不存進專案檔、不畫進匯出的圖', async ({ page }) => {
  const errors = await open(page);
  await setFloor(page, { rooms: [room('R', 0, 0, 10, 8)] });
  await page.keyboard.press('Control+e');
  const plain = await download(page);
  await page.keyboard.press('Escape');
  /* 一張 8 × 8 的紅色 PNG */
  const red = solidPng(8, 8, [255, 0, 0]);
  await page
    .getByTestId('underlay-input')
    .setInputFiles({ name: 'sketch.png', mimeType: 'image/png', buffer: red });
  await expect(
    page.getByText('已放上下繪圖（只在這個畫面上，不存檔、不匯出）', { exact: true }),
  ).toBeVisible();
  const u = await page.evaluate(
    () => (window as unknown as { __floorPlan: Hook }).__floorPlan.useEditor.getState().underlay,
  );
  expect(u).toMatchObject({ x: 5, y: 4, w: 10, opacity: 0.4, visible: true, name: 'sketch.png' });
  /* 畫面上看得到（房間中間的那一點偏紅） */
  const pt = await at(page, 5, 6);
  const mid = await page.evaluate(
    ([x, y]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="map-canvas"]');
      const r = c?.getBoundingClientRect();
      const g = c?.getContext('2d');
      if (!c || !r || !g) return [0, 0, 0, 0];
      const k = c.width / r.width;
      return Array.from(
        g.getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data,
      );
    },
    [pt.x, pt.y] as const,
  );
  expect(mid[0]).toBeGreaterThan(mid[1] + 40);
  await page.keyboard.press('Control+e');
  const withUnder = await download(page);
  expect(Buffer.from(withUnder.img.data).equals(Buffer.from(plain.img.data))).toBe(true);
  await page.keyboard.press('Escape');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const saved = readFileSync((await dl.path()) as string, 'utf8');
  expect(saved).not.toContain('sketch');
  expect(saved).not.toContain('blob:');
  expect(JSON.parse(saved).version).toBe(10);
  expect(errors).toEqual([]);
});

test('揭露用的圖（F284）：檔名「揭露」、暗門畫成門、沒有 GM 字帶與斜線；和 PL 用的圖一樣大', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('A', 0, 0, 10, 8), room('S', 10, 0, 6, 8, { gm: true, name: '密室' })],
    openings: [{ id: 'd', kind: 'secret', o: 'v', x: 10, y: 3, len: 1.5, side: 1, hinge: 0 }],
  });
  await page.keyboard.press('Control+e');
  const dialog = page.getByTestId('export-dialog');
  const pl = await download(page);
  await dialog.getByRole('radio', { name: '揭露用' }).click();
  await expect(page.getByTestId('export-reveal-note')).toContainText('揭露秘密時換上去的圖');
  const rv = await download(page);
  expect(rv.name).toBe('測試_揭露.png');
  expect([rv.img.width, rv.img.height]).toEqual([pl.img.width, pl.img.height]);
  await dialog.getByRole('radio', { name: 'GM 用（全部顯示）' }).click();
  const gm = await download(page);
  /* GM 用多一條字帶（比較高）；揭露用的密室裡沒有斜線：和白底一樣 */
  expect(gm.img.height).toBeGreaterThan(rv.img.height);
  const inside = px48(rv.img, 13, 6);
  expect(inside.slice(0, 3)).toEqual(px48(rv.img, 5, 6).slice(0, 3));
  expect(errors).toEqual([]);
});

test('自由線（F285、F286）：U 畫線、拖中間的方塊改彎曲、F 反轉、曲線箭頭；PL 檢視藏起 GM 專用的；一步復原', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, { rooms: [room('R', 0, 0, 16, 10)] });
  await page.keyboard.press('u');
  await drag(page, [2, 5], [10, 5]);
  let f = await floor(page);
  expect(f.lines).toHaveLength(1);
  expect(f.lines?.[0]).toMatchObject({ kind: 'rail', x1: 2, y1: 5, x2: 10, y2: 5, cx: 6, cy: 5 });
  expect((await sel(page))[0]).toMatchObject({ type: 'line' });
  /* 選取工具：拖正中間的方塊到 (6, 2) → 曲線通過那一點 */
  await page.keyboard.press('v');
  await drag(page, [6, 5], [6, 2]);
  f = await floor(page);
  expect(f.lines?.[0]).toMatchObject({ cx: 6, cy: -1 });
  /* 屬性：種類改成曲線箭頭、GM 專用 */
  const panel = page.getByTestId('props-panel');
  await panel.getByTestId('line-kind').click();
  await page.getByRole('option', { name: '曲線箭頭' }).click();
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('f');
  f = await floor(page);
  expect(f.lines?.[0]).toMatchObject({ kind: 'arrow', x1: 10, x2: 2 });
  await panel.getByRole('switch', { name: '只有 GM 看得到（PL 看不到）' }).click();
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('p');
  expect(await sel(page)).toEqual([]);
  await page.keyboard.press('p');
  /* 素材面板的卡片也拿得起來 */
  await page.getByRole('tab', { name: '門窗' }).click();
  await page.getByTestId('line-cards').locator('[data-line="rope"]').click();
  await page.getByTestId('map-canvas').focus();
  await drag(page, [2, 8], [6, 8]);
  f = await floor(page);
  expect(f.lines?.map((l) => l.kind)).toEqual(['arrow', 'rope']);
  await page.keyboard.press('Control+z');
  expect((await floor(page)).lines?.map((l) => l.kind)).toEqual(['arrow']);
  /* 刪掉最後一條：沒有 lines 欄位 */
  await page.keyboard.press('v');
  await click(page, 6, 2);
  expect((await sel(page))[0]).toMatchObject({ type: 'line' });
  await page.keyboard.press('Delete');
  expect((await floor(page)).lines).toBeUndefined();
  expect(errors).toEqual([]);
});

test('390 寬：地圖設定、房間與家具的新欄位沒有橫向捲動；快捷鍵說明有 U、Q、Shift＋R', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  const noScroll = async () => {
    const [sw, cw] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(sw).toBeLessThanOrEqual(cw);
  };
  await expect(page.getByTestId('map-transform')).toBeVisible();
  await noScroll();
  await setFloor(page, {
    rooms: [room('R', 0, 0, 10, 8)],
    items: [item('c', 'chair', 4, 4, 1, 1)],
  });
  await click(page, 1, 1);
  await expect(page.getByTestId('furnish')).toBeVisible();
  await noScroll();
  await click(page, 4.5, 4.5);
  await expect(page.getByTestId('ring')).toBeVisible();
  await noScroll();
  await page.getByTestId('map-canvas').focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  const help = page.getByRole('dialog');
  await expect(help).toContainText('自由線工具');
  await expect(help).toContainText('反方向旋轉 90°');
  await expect(help).toContainText('家具轉 15°');
  expect(errors).toEqual([]);
});
