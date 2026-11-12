/**
 * 室內平面圖產生器：2026-11-12 跟進 KIIN「マップ制作スタジオ」v3.0（規格 1.31：F329～F340）——
 * 事件前後（切換狀態、出現時機、事件後新放的東西、倒下・破損、事件後才停電）、事件前後兩張一次存（實際存下來檢查）、
 * PL 用連結的狀態、和風的素材與榻榻米的鋪法、日式宅邸的區畫、日式老宅範本、Z／X、H、旋轉的按鈕、重疊的家具換選、窄畫面。
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
  useEditor: {
    getState: () => { tool: string; sel: { type: string; id: string }[]; zoomPct: number };
    setState: (p: Record<string, unknown>) => void;
  };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: { fitView: () => void };
  toClient: (x: number, y: number) => { x: number; y: number };
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
const editorState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __floorPlan: Hook }).__floorPlan.useEditor.getState();
    return { tool: s.tool, sel: s.sel, zoomPct: s.zoomPct };
  });
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __floorPlan: Hook }).__floorPlan.toClient(x, y),
    [x, y],
  );

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
      const { moment: _m, blackout: _b, ...rest } = p;
      h.useProject.getState().replace({ ...rest, name: '測試', floors: [f], active: 0, ...extra });
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

function pngPixels(bytes: Buffer): PixelBuffer {
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

const room = (
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
) => ({ id: name, name, cat: 'living', x, y, w, h, ...extra }) as Room;
const item = (
  id: string,
  t: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Item> = {},
) => ({ id, t, x, y, w, h, rot: 0, ...extra }) as Item;

/** 復原紀錄的步數 */
const pastSteps = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __floorPlan: { useProject: { temporal: { getState: () => { pastStates: unknown[] } } } };
        }
      ).__floorPlan.useProject.temporal.getState().pastStates.length,
  );

const toggle = (page: Page, m: 'before' | 'after') =>
  page.getByTestId('moment-toggle').locator(`[data-moment="${m}"]`);

async function loadEstate(page: Page) {
  await page.evaluate(() =>
    (window as unknown as { __floorPlan: Hook }).__floorPlan.act.loadTemplate('japanese-estate', {
      structureOnly: false,
      clues: false,
    }),
  );
  await expect.poll(async () => (await project(page)).name).toBe('日式老宅（事件前後）');
}

test('事件前後：切換狀態（不算一步復原）、事件後新放的只在事件後出現、出現時機、倒下・破損、事件後才停電（F329～F332）', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('客廳', 0, 0, 12, 10)],
    items: [item('desk', 'desk', 1, 1, 2.4, 1.2)],
  });
  await expect(toggle(page, 'before')).toHaveAttribute('aria-pressed', 'true');
  const steps0 = await pastSteps(page);
  await toggle(page, 'after').click();
  await expect(toggle(page, 'after')).toHaveAttribute('aria-pressed', 'true');
  expect((await project(page)).moment).toBe('after');
  /* 切換狀態不算一步復原 */
  expect(await pastSteps(page)).toBe(steps0);
  /* 事件後放的血跡只在事件後 */
  await page.getByRole('tab', { name: '家具・小物' }).click();
  await page.getByRole('searchbox', { name: '搜尋家具' }).fill('拖行的血跡');
  await page.getByTestId('library').locator('[data-asset="blood_drag"]').click();
  await expect(page.getByTestId('canvas-hint')).toContainText('事件後：新放的只在事件後出現');
  await click(page, 6, 6);
  let f = await floor(page);
  const blood = f.items.find((i) => i.t === 'blood_drag');
  expect(blood?.only).toBe('after');
  expect((await editorState(page)).sel).toEqual([{ type: 'item', id: blood?.id }]);
  await expect(page.getByTestId('moment-only')).toHaveText('只在事件後');
  /* 切回事件前：看不到、點不到（取消選取） */
  await toggle(page, 'before').click();
  expect((await editorState(page)).sel).toEqual([]);
  await click(page, 6.8, 7.5);
  expect((await editorState(page)).sel.map((s) => s.id)).not.toContain(blood?.id);
  /* 書桌：出現時機改成只在事件後（事件前看不到了、通知）→ 復原；事件後倒下 */
  await click(page, 2, 1.5);
  expect((await editorState(page)).sel).toEqual([{ type: 'item', id: 'desk' }]);
  await page.getByTestId('moment-only').click();
  await page.getByRole('option', { name: '只在事件後' }).click();
  await expect(
    page.getByText('已設成「只在事件後」，現在的狀態看不到了（可以復原）。', { exact: true }),
  ).toBeVisible();
  expect((await editorState(page)).sel).toEqual([]);
  expect((await floor(page)).items.find((i) => i.id === 'desk')?.only).toBe('after');
  await page.getByRole('button', { name: '復原' }).first().click();
  expect((await floor(page)).items.find((i) => i.id === 'desk')?.only).toBeUndefined();
  await click(page, 2, 1.5);
  await page.getByRole('switch', { name: '事件後倒下・翻亂' }).click();
  expect((await floor(page)).items.find((i) => i.id === 'desk')?.upset).toBe(true);
  /* 地圖設定：事件後才停電 */
  await page.keyboard.press('Escape');
  await page.getByRole('switch', { name: '事件後才停電' }).click();
  expect((await project(page)).blackout).toBe(true);
  await expect(page.getByTestId('moment-map')).toContainText('只在事件後 1 個');
  /* 重新整理之後狀態與資料還在（自動儲存；離開頁面時立刻寫） */
  await toggle(page, 'after').click();
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan);
  await expect(toggle(page, 'after')).toHaveAttribute('aria-pressed', 'true');
  f = await floor(page);
  expect(f.items.find((i) => i.t === 'blood_drag')?.only).toBe('after');
  expect(errors).toEqual([]);
});

test('匯出：選狀態、事件前後各存一張（同樣大小、檔名、內容不同）；PL 用連結只帶一個狀態（F333、F335）', {
  tag: '@serial',
}, async ({ page }) => {
  const errors = await open(page);
  await loadEstate(page);
  await page.keyboard.press('Control+e');
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog.getByTestId('export-moment')).toBeVisible();
  await dialog.getByRole('radio', { name: '24px' }).click();
  const downloads: { name: string; path: string }[] = [];
  page.on('download', async (d) => {
    downloads.push({ name: d.suggestedFilename(), path: (await d.path()) as string });
  });
  await dialog.getByTestId('export-pair').click();
  await expect(page.getByText('已下載事件前、事件後的 PNG（2 張）', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.map((d) => d.name)).toEqual([
    '日式老宅（事件前後）_PL_事件前.png',
    '日式老宅（事件前後）_PL_事件後.png',
  ]);
  const [a, b] = downloads.map((d) => pngPixels(readFileSync(d.path)));
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i]) diff++;
  expect(diff).toBeGreaterThan(1000);
  /* 單張：狀態選事件後 → 檔名 */
  await dialog.getByRole('radio', { name: '事件後' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  expect(dl.suggestedFilename()).toBe('日式老宅（事件前後）_PL_事件後.png');
  await page.keyboard.press('Escape');
  /* 分享連結：PL 用連結的狀態 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: /分享連結/ }).click();
  const share = page.getByTestId('share-dialog');
  await share.getByRole('radio', { name: 'PL 用' }).click();
  await expect(share.getByTestId('share-moment')).toBeVisible();
  await expect(share.getByTestId('share-removed')).toContainText(
    '另一個狀態（事件前／事件後）才有的東西',
  );
  await share.getByTestId('share-moment').getByRole('radio', { name: '事件後' }).click();
  await expect(share.getByTestId('share-moment')).toContainText(
    'PL 用連結只有「事件後」看得到的東西',
  );
  expect(errors).toEqual([]);
});

test('和風的素材與榻榻米的鋪法、日式宅邸的區畫（F334）', async ({ page }) => {
  const errors = await open(page);
  await setFloor(page, { rooms: [room('和室', 0, 0, 8, 8, { cat: 'washitsu' })] });
  /* 素材：日文的別名也找得到 */
  await page.getByRole('tab', { name: '家具・小物' }).click();
  await page.getByRole('searchbox', { name: '搜尋家具' }).fill('こたつ');
  await expect(page.getByTestId('library').locator('[data-asset]')).toHaveCount(1);
  await page.getByTestId('library').locator('[data-asset="kotatsu"]').click();
  await click(page, 4, 4);
  expect((await floor(page)).items.map((i) => i.t)).toEqual(['kotatsu']);
  await page.getByRole('searchbox', { name: '搜尋家具' }).fill('#和風');
  for (const id of ['tansu', 'oshiire', 'kamidana', 'hibachi', 'chabudai'])
    await expect(page.getByTestId('library').locator(`[data-asset="${id}"]`)).toHaveCount(1);
  /* 榻榻米的鋪法 */
  await page.keyboard.press('Escape');
  await click(page, 0.5, 7.5);
  await page.getByTestId('room-tatami').click();
  await page.getByRole('option', { name: '祝儀鋪法（一般住宅）' }).click();
  expect((await floor(page)).rooms[0].tatami).toBe('shugi');
  await page.getByTestId('room-tatami').click();
  await page.getByRole('option', { name: '半疊市松（琉球疊）' }).click();
  expect((await floor(page)).rooms[0].tatami).toBe('ryukyu');
  /* 客廳：地板選榻榻米之後才有鋪法 */
  await page.getByTestId('room-floor').click();
  await page.getByRole('option', { name: '榻榻米' }).click();
  await expect(page.getByTestId('room-tatami')).toBeVisible();
  /* 房間分頁：日式宅邸 7 張；座敷畫出來是祝儀鋪法 */
  await page.getByRole('tab', { name: '房間' }).click();
  await expect(
    page.getByTestId('library').getByRole('heading', { name: '日式宅邸' }),
  ).toBeVisible();
  for (const id of ['genkan', 'nakaroka', 'zashiki', 'butsuma', 'hiroen', 'hanare', 'kura'])
    await expect(page.getByTestId('library').locator(`[data-room="${id}"]`)).toHaveCount(1);
  await page.getByTestId('library').locator('[data-room="zashiki"]').click();
  await page.getByTestId('map-canvas').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('-');
  await click(page, 14, 4);
  const z = (await floor(page)).rooms.find((r) => r.name === '座敷・客間');
  expect(z).toMatchObject({ cat: 'washitsu', tatami: 'shugi', w: 8, h: 8 });
  expect(errors).toEqual([]);
});

test('範本：日式老宅（事件前後）載入後從事件前開始、事件後才停電；畫面上看得到不同（F336）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '範本' }).click();
  const dlg = page.getByTestId('template-dialog');
  await dlg.getByPlaceholder(/#標籤/).fill('日式老宅');
  await expect(
    dlg.getByRole('list').getByRole('button', { name: /^日式老宅（事件前後）/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await loadEstate(page);
  const p = await project(page);
  expect(p.blackout).toBe(true);
  expect(p.moment).toBeUndefined();
  await expect(toggle(page, 'before')).toHaveAttribute('aria-pressed', 'true');
  const canvas = page.getByTestId('map-canvas');
  const before = await canvas.screenshot();
  await toggle(page, 'after').click();
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), before)).not.toBe(0);
  expect(errors).toEqual([]);
});

test('操作：Z／X 以游標為中心縮放、H 再按一次回到選取、15°／90° 的旋轉按鈕、重疊的家具再點一下換選（F337～F339）', async ({
  page,
}) => {
  const errors = await open(page);
  await setFloor(page, {
    rooms: [room('客廳', 0, 0, 12, 10)],
    items: [
      item('table', 'table', 4, 4, 2.8, 1.6),
      item('chair', 'chair', 5, 4.5, 1, 1),
      item('rug', 'rug', 3, 3, 4, 3),
    ],
  });
  const z0 = (await editorState(page)).zoomPct;
  const c = await at(page, 6, 5);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press('z');
  await expect.poll(async () => (await editorState(page)).zoomPct).toBeGreaterThan(z0);
  /* 游標下的那一點不動 */
  const c2 = await at(page, 6, 5);
  expect(Math.abs(c2.x - c.x)).toBeLessThan(2);
  expect(Math.abs(c2.y - c.y)).toBeLessThan(2);
  await page.keyboard.press('x');
  await expect.poll(async () => (await editorState(page)).zoomPct).toBe(z0);
  await page.keyboard.press('h');
  expect((await editorState(page)).tool).toBe('hand');
  await page.keyboard.press('h');
  expect((await editorState(page)).tool).toBe('select');
  /* 重疊的家具：椅子（最上面）→ 再點一下桌子 → 地毯 → 回到椅子 */
  const p = await at(page, 5.5, 5);
  await page.mouse.click(p.x, p.y);
  expect((await editorState(page)).sel).toEqual([{ type: 'item', id: 'chair' }]);
  await page.mouse.click(p.x, p.y);
  expect((await editorState(page)).sel).toEqual([{ type: 'item', id: 'table' }]);
  await page.mouse.click(p.x, p.y);
  expect((await editorState(page)).sel).toEqual([{ type: 'item', id: 'rug' }]);
  await page.mouse.click(p.x, p.y);
  expect((await editorState(page)).sel).toEqual([{ type: 'item', id: 'chair' }]);
  /* 旋轉的按鈕 */
  const buttons = page.getByTestId('item-rotate-buttons');
  await buttons.locator('[data-rotate="cw15"]').click();
  expect((await floor(page)).items.find((i) => i.id === 'chair')?.rot).toBe(15);
  await buttons.locator('[data-rotate="ccw90"]').click();
  expect((await floor(page)).items.find((i) => i.id === 'chair')?.rot).toBe(285);
  await buttons.locator('[data-rotate="cw90"]').click();
  await buttons.locator('[data-rotate="ccw15"]').click();
  expect((await floor(page)).items.find((i) => i.id === 'chair')?.rot).toBe(0);
  expect(errors).toEqual([]);
});

for (const width of [390, 360, 320])
  test(`窄畫面 ${width}：不能橫向捲動；狀態的切換與匯出的兩張一次存看得到（F330、F333）`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const errors = await open(page);
    await loadEstate(page);
    await toggle(page, 'after').click();
    await expect(toggle(page, 'after')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.getByRole('button', { name: '匯出圖片' }).click();
    await expect(page.getByTestId('export-pair')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(errors).toEqual([]);
  });
