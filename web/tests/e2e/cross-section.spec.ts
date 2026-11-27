/**
 * 斷面圖產生器（規格 docs/refactor/specs/cross-section.md）：
 * 開頁與「從哪個舞台開始」、加樓層與區域、拖曳隔間、放設備、環境與 GM 用／PL 用、匯出 PNG（尺寸、透明、VTT、事件前後兩張）、
 * 專案檔與原作的作業 JSON、窄畫面（390／360／320）、1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import type { Layout } from '../../src/tools/cross-section/model/layout';
import type { SectionDoc, SelRef } from '../../src/tools/cross-section/model/types';
import { waitForFileChooser } from '../helpers/fileChooser';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('cross-section') ?? { id: 'cross-section', status: 'next' })}/`;

type Hook = {
  useDoc: {
    getState: () => { data: SectionDoc; replace: (d: SectionDoc) => void };
    temporal: { getState: () => { pastStates: unknown[] } };
  };
  useEditor: { getState: () => { tool: string; sel: SelRef | null; audience: string } };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: { fitView: () => void };
  layout: () => Layout;
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
  await expect(page.getByRole('heading', { level: 1, name: '斷面圖產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __crossSection?: unknown }).__crossSection,
  );
  return errors;
}

const doc = (page: Page): Promise<SectionDoc> =>
  page.evaluate(
    () => (window as unknown as { __crossSection: Hook }).__crossSection.useDoc.getState().data,
  );
const sel = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __crossSection: Hook }).__crossSection.useEditor.getState().sel,
  );
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => (window as unknown as { __crossSection: Hook }).__crossSection.toClient(x, y),
    [x, y],
  );
const past = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __crossSection: Hook }).__crossSection.useDoc.temporal.getState()
        .pastStates.length,
  );

/** 換成空白的斷面圖、畫面整張 */
async function blank(page: Page) {
  await page.evaluate(() => {
    const h = (window as unknown as { __crossSection: Hook }).__crossSection;
    h.act.newBlank();
    h.editor.fitView();
  });
}

async function drag(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  await page.mouse.up();
}

async function click(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}

function png(bytes: Buffer) {
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test('開頁：範例「霧丘洋館」、三個分頁、36 種設備（2026-11-27 第二批加列車專用 6 種）與搜尋、頁尾只有靈感來源', async ({
  page,
}) => {
  const errors = await open(page);
  const d = await doc(page);
  expect(d.title).toBe('霧丘洋館');
  expect(d.building.floors.map((f) => f.level)).toEqual([2, 1, -1, -2]);
  for (const tab of ['構造', '設備・家具', '完成'])
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  await expect(page.getByTestId('floor-count')).toHaveText('4／12 層');
  await expect(page.getByTestId('stat-secrets')).toHaveText('1');
  await page.getByRole('tab', { name: '設備・家具' }).click();
  const grid = page.getByTestId('fixture-grid');
  await expect(grid.getByRole('button')).toHaveCount(36);
  await page.getByRole('searchbox', { name: '搜尋設備' }).fill('血');
  await expect(grid.getByRole('button')).toHaveCount(2);
  await page.getByRole('searchbox', { name: '搜尋設備' }).fill('');
  await page.getByRole('radio', { name: '門・窗・梯子' }).click();
  await expect(grid.getByRole('button')).toHaveCount(5);
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源：KIIN／階層・連結マップ制作スタジオ');
  await expect(footer.getByRole('link')).toHaveAttribute('href', 'https://kiin.booth.pm/');
  expect(errors).toEqual([]);
});

test('從哪個舞台開始：範例、新的縱向斷面、繼續；換掉之後可以復原', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('open-start').click();
  const dialog = page.getByRole('dialog', { name: '從哪個舞台開始' });
  await expect(dialog).toBeVisible();
  /* 2026-11-27 第二批：新的橫向車廂可以按、橫向的範例 2 個（另見 cross-section-train.spec.ts） */
  await expect(dialog.getByTestId('start-train')).toBeEnabled();
  await expect(dialog.getByTestId('samples').getByRole('button')).toHaveCount(4);
  await expect(dialog.getByTestId('train-samples').getByRole('button')).toHaveCount(2);
  await dialog.getByTestId('sample-station').click();
  await expect(dialog).toBeHidden();
  expect((await doc(page)).title).toBe('舊環線廢站');
  await page.getByTestId('undo').click();
  expect((await doc(page)).title).toBe('霧丘洋館');
  await page.getByTestId('open-start').click();
  await dialog.getByTestId('start-blank').click();
  const d = await doc(page);
  expect(d.building.floors.map((f) => f.rooms.length)).toEqual([2, 2]);
  expect(d.building.shafts.map((s) => s.kind)).toEqual(['elevator']);
  await page.getByTestId('open-start').click();
  await expect(dialog.getByTestId('start-resume')).toContainText(d.title);
  await dialog.getByTestId('start-resume').click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('構造：加地上層與地下層、增減區域、刪掉一層、建築寬、通道；一次操作一步復原', async ({
  page,
}) => {
  const errors = await open(page);
  await blank(page);
  await page.getByTestId('add-above').click();
  await page.getByTestId('add-below').click();
  await expect(page.getByTestId('floor-count')).toHaveText('4／12 層');
  expect((await doc(page)).building.floors.map((f) => f.level)).toEqual([2, 1, -1, -2]);
  const row = page.getByTestId('floor-1F');
  await row.getByTestId('split-room').click();
  await expect(row).toContainText('3 間');
  await row.getByTestId('merge-room').click();
  await expect(row).toContainText('2 間');
  await page.getByTestId('floor-B2F').getByTestId('delete-floor').click();
  await expect(page.getByTestId('floor-count')).toHaveText('3／12 層');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('floor-count')).toHaveText('4／12 層');
  await page.getByTestId('width-select').click();
  await page.getByRole('option', { name: '44' }).click();
  expect((await doc(page)).building.width).toBe(44);
  await page.getByTestId('add-shaft-ladder').click();
  await expect(page.getByTestId('shaft-panel')).toBeVisible();
  const d = await doc(page);
  expect(d.building.shafts.map((s) => [s.kind, s.top, s.bottom])).toEqual([
    ['elevator', 1, -1],
    ['ladder', 2, -2],
  ]);
  /* 上端選到比下端低的樓層：兩端對調（F33） */
  const panel = page.getByTestId('shaft-panel');
  await panel.getByRole('combobox', { name: '下端' }).click();
  await page.getByRole('option', { name: 'B1F', exact: true }).click();
  await panel.getByRole('combobox', { name: '上端' }).click();
  await page.getByRole('option', { name: 'B2F', exact: true }).click();
  expect((await doc(page)).building.shafts[1]).toMatchObject({ top: -1, bottom: -2 });
  /* 最多 12 層 */
  await page.evaluate(() => {
    const h = (window as unknown as { __crossSection: Hook }).__crossSection;
    for (let i = 0; i < 10; i++) h.act.addFloorAt('above');
  });
  await expect(page.getByTestId('floor-count')).toHaveText('12／12 層');
  await expect(page.getByTestId('add-above')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('畫布：拖曳隔間（整數格、一步復原）、點區域選取、放設備、拖曳設備、刪除', async ({ page }) => {
  const errors = await open(page);
  await blank(page);
  await page.getByTestId('floor-1F').getByTestId('split-room').click();
  let rooms = (await doc(page)).building.floors[0].rooms.map((r) => [r.x0, r.x1]);
  expect(rooms).toEqual([
    [0, 16],
    [19, 27],
    [27, 36],
  ]);
  const before = await past(page);
  await drag(page, [27, 3], [30.7, 3]);
  rooms = (await doc(page)).building.floors[0].rooms.map((r) => [r.x0, r.x1]);
  expect(rooms).toEqual([
    [0, 16],
    [19, 31],
    [31, 36],
  ]);
  expect(await past(page)).toBe(before + 1);
  await page.getByTestId('undo').click();
  expect((await doc(page)).building.floors[0].rooms[1].x1).toBe(27);
  /* 點區域 → 屬性 */
  await click(page, 8, 2.5);
  await expect(page.getByTestId('room-panel')).toBeVisible();
  await page.getByTestId('room-name').fill('實驗室');
  await page.getByTestId('room-name').blur();
  expect((await doc(page)).building.floors[0].rooms[0].name).toBe('實驗室');
  /* 放設備（連續放置） */
  await page.getByRole('tab', { name: '設備・家具' }).click();
  await page.getByTestId('fixture-grid').locator('[data-kind="tank"]').click();
  const n0 = (await doc(page)).items.length;
  await click(page, 4, 4);
  await click(page, 11, 4);
  let d = await doc(page);
  expect(d.items.length).toBe(n0 + 2);
  const placed = d.items.slice(-2);
  expect(
    placed.every((it) => it.kind === 'tank' && it.room === d.building.floors[0].rooms[0].id),
  ).toBe(true);
  expect(placed[0].rx).toBeLessThan(placed[1].rx);
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __crossSection: Hook }).__crossSection.useEditor.getState().tool,
    ),
  ).toBe('select');
  /* 拖曳最後一件往左 */
  const last = placed[1];
  const box = await page.evaluate((id) => {
    const h = (window as unknown as { __crossSection: Hook }).__crossSection;
    const L = h.layout();
    const it = h.useDoc.getState().data.items.find((v) => v.id === id);
    const r = L.rooms.find((v) => v.room.id === it?.room);
    return r ? { x: r.x, w: r.w, y: r.y, h: r.h } : null;
  }, last.id);
  if (!box) throw new Error('room');
  const ix = box.x + 0.32 + last.rx * (box.w - 0.64);
  await drag(page, [ix, box.y + box.h - 1.5], [ix - 3, box.y + box.h - 1.5]);
  d = await doc(page);
  expect(d.items.find((v) => v.id === last.id)?.rx).toBeLessThan(last.rx - 0.1);
  expect(await sel(page)).toEqual({ kind: 'item', id: last.id });
  await page.keyboard.press('Delete');
  expect((await doc(page)).items.some((v) => v.id === last.id)).toBe(false);
  /* 備註 */
  await page.keyboard.press('t');
  await click(page, 25, 9);
  await expect(page.getByTestId('note-text')).toBeFocused();
  await page.keyboard.type('密碼在這裡');
  await page.getByTestId('note-text').blur();
  d = await doc(page);
  expect(d.notes.at(-1)).toMatchObject({
    text: '密碼在這裡',
    room: d.building.floors[1].rooms[1].id,
  });
  expect(errors).toEqual([]);
});

test('環境（1～4）、淹水、GM 用／PL 用（G）：PL 用時不能編輯', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.press('2');
  expect((await doc(page)).env).toBe('night');
  await expect(page.getByRole('radio', { name: '夜・雨' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('4');
  expect((await doc(page)).env).toBe('after');
  await page.keyboard.press('3');
  expect((await doc(page)).env).toBe('blackout');
  await page.keyboard.press('1');
  expect((await doc(page)).env).toBe('day');
  await page.getByTestId('flood-toggle').click();
  expect((await doc(page)).flood).toBe(true);
  await expect(page.getByTestId('flood-toggle')).toHaveText('淹水 34%');
  await page.keyboard.press('g');
  await expect(page.getByRole('radio', { name: 'PL 用' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('canvas-hint')).toContainText('祕密區域已偽裝');
  await click(page, 8, 3);
  expect(await sel(page)).toBeNull();
  await expect(page.getByText('PL 用只能看；切回 GM 用才能編輯', { exact: true })).toBeVisible();
  await page.keyboard.press('g');
  await click(page, 8, 3);
  expect((await sel(page))?.kind).toBe('room');
  expect(errors).toEqual([]);
});

test('匯出 PNG：尺寸、透明、VTT 的格子、事件前後兩張', { tag: '@serial' }, async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const h = (window as unknown as { __crossSection: Hook }).__crossSection;
    h.act.newBlank();
    const d = h.useDoc.getState().data;
    h.useDoc.getState().replace({ ...d, title: '測試/大樓', wear: 0 });
  });
  await page.getByTestId('export-open').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: '1600 px' }).click();
  await expect(page.getByTestId('export-info')).toHaveText('1600 × 921 px（45 × 26 格）');
  await expect(page.getByTestId('export-preview')).toBeVisible();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  expect(dl.suggestedFilename()).toBe('測試_大樓_PL用_白天・平常.png');
  const a = png(readFileSync((await dl.path()) as string));
  expect([a.width, a.height]).toEqual([1600, 921]);
  expect(a.data[3]).toBe(255);
  /* 背景透明：圖框外側的紙變透明 */
  await dialog.getByRole('switch', { name: '背景透明' }).click();
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  const b = png(readFileSync((await dl2.path()) as string));
  expect(b.data[3]).toBe(0);
  const mid = ((b.height >> 1) * b.width + (b.width >> 1)) * 4;
  expect(b.data[mid + 3]).toBe(255);
  /* VTT：每格 48 px，地圖本體 42 × 20 格 */
  await dialog.getByRole('radio', { name: '對齊 VTT 的格子' }).click();
  await expect(page.getByTestId('export-info')).toHaveText('2016 × 960 px（42 × 20 格）');
  await expect(dialog.getByRole('switch', { name: '背景透明' })).toBeDisabled();
  const [dl3] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  const c = png(readFileSync((await dl3.path()) as string));
  expect([c.width, c.height]).toEqual([2016, 960]);
  /* 事件前後各一張（同樣的大小、檔名分得出來） */
  await page.getByTestId('export-env').click();
  await page.getByRole('option', { name: '夜・雨' }).click();
  const downloads: string[] = [];
  const paths: string[] = [];
  page.on('download', async (d) => {
    downloads.push(d.suggestedFilename());
    paths.push((await d.path()) as string);
  });
  await page.getByTestId('export-pair').click();
  await expect.poll(() => paths.length, { timeout: 20_000 }).toBe(2);
  expect(downloads).toEqual(['測試_大樓_PL用_事件前.png', '測試_大樓_PL用_事件後.png']);
  const [p1, p2] = paths.map((p) => png(readFileSync(p)));
  expect([p1.width, p1.height]).toEqual([2016, 960]);
  expect([p2.width, p2.height]).toEqual([2016, 960]);
  expect(Buffer.compare(Buffer.from(p1.data), Buffer.from(p2.data))).not.toBe(0);
  expect(errors).toEqual([]);
});

test('專案檔：存了再開回來相同；開啟原作的作業 JSON；沒有車廂的橫向檔說明原因', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('霧丘洋館.cross-section.json');
  const saved = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
  expect(saved).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'cross-section',
    version: 1,
  });
  const original = await doc(page);
  await blank(page);
  await page.getByRole('button', { name: '專案' }).click();
  const chooser = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser.setFiles({
    name: 'a.json',
    mimeType: 'application/json',
    buffer: readFileSync((await dl.path()) as string),
  });
  await expect.poll(async () => (await doc(page)).title).toBe('霧丘洋館');
  expect(await doc(page)).toEqual(original);
  /* 原作的作業 JSON（欄位是原作的格式、內容是測試自己寫的） */
  const legacy = {
    format: 'kiin-cross-section-studio',
    mode: 'vertical',
    title: '舊的大樓',
    style: 'blueprint',
    environment: 'night',
    skyTheme: 'rain',
    building: {
      widthCells: 30,
      floorHeightCells: 6,
      hasRoof: false,
      roofStyle: 'industrial',
      floors: [
        {
          id: 'a',
          level: 1,
          label: '一樓',
          rooms: [{ id: 'r', name: '大廳', preset: 'lobby', wallTone: 'plaster', x0: 0, x1: 30 }],
        },
      ],
      shafts: [],
    },
    items: [
      { id: 'i', mode: 'vertical', roomId: 'r', asset: 'cctv', rx: 0.2 },
      { id: 'j', mode: 'vertical', roomId: 'r', asset: 'sleeper-berth', rx: 0.5 },
      { id: 'k', mode: 'vertical', roomId: 'r', asset: 'no-such-thing', rx: 0.5 },
    ],
    annotations: [],
  };
  await page.getByRole('button', { name: '專案' }).click();
  const chooser2 = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser2.setFiles({
    name: 'old.crosssection.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect.poll(async () => (await doc(page)).title).toBe('舊的大樓');
  const d = await doc(page);
  expect(d).toMatchObject({ style: 'blueprint', env: 'night', sky: 'rain' });
  expect(d.building).toMatchObject({ width: 30, rooftop: false, roof: 'sawtooth' });
  /* 2026-11-27 第二批：列車專用的設備放在建築裡也讀 */
  expect(d.items.map((it) => it.kind)).toEqual(['camera', 'bunk']);
  await expect(page.getByText('已讀入原作的作業檔', { exact: true })).toBeVisible();
  await expect(page.getByText('沒有讀進來的：認不出來的設備 1 件', { exact: true })).toBeVisible();
  /* 橫向車廂的作業檔但沒有車廂（第二批起橫向的檔讀得懂，見 cross-section-train.spec.ts） */
  await page.getByRole('button', { name: '專案' }).click();
  const chooser3 = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser3.setFiles({
    name: 'train.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...legacy, mode: 'horizontal', title: '列車' })),
  });
  await expect(
    page.getByText('這個橫向車廂的作業檔裡沒有車廂的資料', { exact: true }),
  ).toBeVisible();
  expect((await doc(page)).title).toBe('舊的大樓');
  /* 較新版本的工具存的專案檔：說明、不開 */
  await page.getByRole('button', { name: '專案' }).click();
  const chooser4 = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser4.setFiles({
    name: 'newer.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...saved, version: 99 })),
  });
  await expect(
    page.getByText('這個專案檔是較新版本的工具存的，請更新頁面後再開。', { exact: true }),
  ).toBeVisible();
  expect((await doc(page)).title).toBe('舊的大樓');
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  for (const width of [390, 360, 320])
    test(`窄畫面 ${width}：沒有橫向捲動、點區域選取、能開匯出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const errors = await open(page);
      await noHorizontalScroll(page);
      for (const tab of ['設備・家具', '完成', '構造']) {
        await page.getByRole('tab', { name: tab }).click();
        await noHorizontalScroll(page);
      }
      await page.getByTestId('section-canvas').scrollIntoViewIfNeeded();
      await page.evaluate(() =>
        (window as unknown as { __crossSection: Hook }).__crossSection.editor.fitView(),
      );
      await click(page, 8, 3);
      await expect(page.getByTestId('room-panel')).toBeVisible();
      await noHorizontalScroll(page);
      await page.getByTestId('export-open').click();
      await expect(page.getByTestId('export-dialog')).toBeVisible();
      await noHorizontalScroll(page);
      expect(errors).toEqual([]);
    });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('section-canvas')).toHaveAttribute('data-rendered', /\d+/);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('cross-section-1280.png', { mask: masks(page) });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('section-canvas')).toHaveAttribute('data-rendered', /\d+/);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('cross-section-390.png', {
      mask: masks(page),
      fullPage: false,
    });
    expect(errors).toEqual([]);
  });
});
