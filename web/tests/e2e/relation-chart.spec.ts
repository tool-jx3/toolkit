/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器（建置產物 tools/relation-chart/）的端對端測試（規格 docs/refactor/specs/relation-chart.md）：
 * - 開頁沒有錯誤、起手提示、頁尾只有靈感來源；
 * - 角色：新增、編輯面板（名稱、顏色、進階）、批次建立（Enter、重複、貼上一欄、用頭像圖片建立）、複製、刪除、清單搜尋與聚焦；
 * - 頭像：上傳、調整範圍、圖示、清除、自動儲存；
 * - 關係：關係類型（新增、名稱、線型、隱藏、Alt＝只顯示、複製、刪除）、建立關係模式（一對多、換起點、升級成雙向、
 *   已存在、本輪取消、長按＝自我關係）、關係線的編輯（備註、反轉、合併、拆開、捆綁、彎曲、刪除）；
 * - 畫布：拖曳（碰撞推擠）、框選、群組拖曳、Shift＋點、方向鍵、Delete、Esc、Ctrl＋A、長按與按兩下＝編輯、縮放、小地圖；
 * - 排列（預覽、取消還原、確定一步復原）、對齊與分佈、打亂座位、磁鐵、畫布尺寸、貼合內容、背景圖；
 * - 分頁：新增、改名、複製、排序、刪除與復原；
 * - 關係表：貼上（標題列、新角色、新關係類型、沿用）、複製；範例；
 * - 匯出：PNG（尺寸、去背、像素、多張 ZIP、檔名）、分層 SVG、分層 PSD、互動網頁（出處、不連外部、聚焦、角色卡、
 *   找關係路徑、圖例、名冊搜尋、分頁籤）；預覽；
 * - 專案檔 ZIP（存、全部重設、開啟、圖片）、原作的專案檔（ZIP 與只有 project.json、加入／取代）；
 * - 自動儲存與還原、復原／重做；390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { readPsd } from 'ag-psd';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { snapHash } from '../../src/tools/relation-chart/logic/legacy';
import { buildSample, type SampleKey } from '../../src/tools/relation-chart/logic/samples';
import {
  makeChar,
  makeLabel,
  makeRel,
  makeType,
} from '../../src/tools/relation-chart/model/factory';
import { emptySheet } from '../../src/tools/relation-chart/model/normalize';
import type { Project, Sheet } from '../../src/tools/relation-chart/model/types';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('relation-chart') ?? { id: 'relation-chart', status: 'next' })}/`;
const KEY = 'trpg-toolkit:relation-chart';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

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
  await expect(page.getByRole('heading', { level: 1, name: '角色關係圖產生器' })).toBeVisible();
  await expect(page.getByTestId('chart').locator('svg')).toBeVisible();
  return errors;
}

/** 自動儲存的內容 */
async function saved(page: Page): Promise<Project | null> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data ?? null,
    KEY,
  );
}

/** 目前分頁（等自動儲存寫進去） */
async function sheet(page: Page): Promise<Sheet> {
  await page.waitForTimeout(450);
  const p = await saved(page);
  if (!p) throw new Error('還沒有自動儲存');
  return p.sheets[p.active];
}

/** 範例分頁，id 加上 offset（多張分頁不重複） */
function sample(key: SampleKey, offset = 0, name?: string): Sheet {
  const s = buildSample(key);
  for (const c of s.chars) c.id += offset;
  for (const t of s.types) t.id += offset;
  for (const r of s.rels) {
    r.id += offset;
    r.from += offset;
    r.to += offset;
    r.type += offset;
  }
  s.id = 50000 + offset;
  s.defNo = offset / 1000 + 1;
  if (name !== undefined) s.name = name;
  return s;
}

function project(sheets: Sheet[], extra: Partial<Project> = {}): Project {
  return {
    sheets,
    active: 0,
    labels: [],
    nextId: 90000,
    font: 'sans',
    library: [],
    relLibrary: [],
    radarTpls: [],
    frames: [],
    fonts: [],
    noteBin: [],
    settingsLib: [],
    sheetLib: [],
    ...extra,
  };
}

/** 三位角色（甲、乙、丙）的分頁 */
function trio(): Sheet {
  const s = emptySheet(1, 1);
  s.chars.push(
    makeChar(1, '甲', 250, 500, { defNo: 1 }),
    makeChar(2, '乙', 750, 500, { defNo: 2 }),
    makeChar(3, '丙', 500, 200, { defNo: 3 }),
  );
  return s;
}

async function seed(page: Page, p: Project) {
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify({ state: { data }, version: 1 })),
    { key: KEY, data: p },
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '角色關係圖產生器' })).toBeVisible();
  await expect(page.getByTestId('chart').locator('svg')).toBeVisible();
}

const chart = (page: Page) => page.getByTestId('chart');
const node = (page: Page, id: number) => chart(page).locator(`.node[data-id="${id}"]`);
const title = (page: Page) => page.getByTestId('inspector-title');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);

async function center(loc: Locator): Promise<{ x: number; y: number }> {
  const b = await loc.boundingBox();
  if (!b) throw new Error('看不到元素');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** 角色頭像的中心（不含名字） */
async function nodeCenter(page: Page, id: number) {
  const body = node(page, id).locator(':scope > circle, :scope > rect').first();
  return center(body);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 3, from.y + (to.y - from.y) / 3, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

async function openProjectItem(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function more(page: Page, testId: string) {
  await page.getByTestId('more-menu').click();
  await page.getByTestId(testId).click();
}

async function solidPng(color: Rgba, w = 64, h = 64): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(color, i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

interface Png {
  width: number;
  height: number;
  at: (x: number, y: number) => Rgba;
}

function readPng(bytes: Uint8Array): Png {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const all = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let o = 0;
  for (const d of idat) {
    all.set(d, o);
    o += d.length;
  }
  const px = decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType);
  return {
    width: ihdr.width,
    height: ihdr.height,
    at: (x, y) => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

async function runExport(
  page: Page,
  format: 'PNG（圖片）' | '分層 SVG' | '分層 PSD' | '互動網頁（唯讀）',
  opts: { scope?: '目前分頁' | '全部分頁'; transparent?: boolean } = {},
): Promise<{ name: string; bytes: Uint8Array }> {
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  await dlg.getByRole('radio', { name: format }).click();
  if (opts.scope) await dlg.getByRole('radio', { name: opts.scope }).click();
  if (opts.transparent !== undefined) {
    const cb = dlg.getByRole('checkbox', { name: '去背（透明背景）' });
    if (((await cb.getAttribute('data-state')) === 'checked') !== opts.transparent)
      await cb.click();
  }
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dlg.getByTestId('export-run').click(),
  ]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  await expect(dlg).toBeHidden();
  return { name: dl.suggestedFilename(), bytes };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/* ---------- 開頁 ---------- */

test('開頁：空白分頁、起手提示、頁尾只有靈感來源、沒有錯誤', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('empty-hint')).toContainText('還沒有角色');
  await expect(page.getByTestId('sheet-tab')).toHaveText(['分頁1']);
  await expect(page.getByTestId('char-count')).toHaveText('0 位');
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveText(['PaiTei4234／Relationship Chart Maker']);
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://paitei4234.itch.io/relationshipchartmaker',
  );
  await expect(title(page)).toHaveText('分頁設定');
  /* 起手提示的按鈕 */
  await page.getByTestId('empty-hint').getByRole('button', { name: '開啟範例…' }).click();
  await expect(page.getByRole('dialog', { name: '開啟範例' })).toBeVisible();
  await page.getByTestId('sample-family').click();
  await expect(page.getByTestId('sheet-tab')).toHaveText(['分頁1', '範例：家族樹']);
  await expect(chart(page).locator('.node')).toHaveCount(7);
  await expect(toast(page, '已加入範例「家族樹」')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 角色 ---------- */

test('新增角色：編輯面板即時套用、名字可以換行、文字欄離開才記一步、復原／重做', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByTestId('add-char').click();
  await expect(title(page)).toHaveText('編輯角色');
  await expect(chart(page).locator('.node')).toHaveCount(1);
  const s0 = await sheet(page);
  expect(s0.chars[0]).toMatchObject({ name: '', defNo: 1 });
  /* 沒名字時顯示「角色 N」的第一個字 */
  await expect(chart(page).locator('.node text').first()).toHaveText('角');
  const name = page.getByTestId('char-name');
  await name.fill('阿明');
  await name.press('Enter');
  await name.type('Alex');
  await expect(chart(page).locator('.node-name text')).toHaveText(['阿明', 'Alex']);
  await expect(page.getByTestId('char-row')).toContainText('阿明 Alex');
  await name.blur();
  expect((await sheet(page)).chars[0].name).toBe('阿明\nAlex');
  await page.getByTestId('undo').click();
  expect((await sheet(page)).chars[0].name).toBe('');
  await page.getByTestId('undo').click();
  expect((await sheet(page)).chars).toHaveLength(0);
  await page.getByTestId('redo').click();
  await page.getByTestId('redo').click();
  expect((await sheet(page)).chars[0].name).toBe('阿明\nAlex');
  /* 復原時編輯面板跟著角色收起；從清單的鉛筆再打開 */
  await expect(title(page)).toHaveText('分頁設定');
  await page.getByTestId('char-edit').click();
  /* 顏色：自動、對調 */
  await page.getByTestId('char-colors').getByRole('button', { name: '對調兩色' }).click();
  expect((await sheet(page)).chars[0]).toMatchObject({ color: 'auto', nameColor: 'auto' });
  /* 進階：釘選、形狀、尺寸、重要度、標籤 */
  await page.getByRole('button', { name: '進階' }).click();
  await expect(page.getByTestId('char-show-avatar').getByRole('switch')).toBeVisible();
  await page.getByTestId('char-lock').getByRole('switch', { name: '釘選位置' }).click();
  await page.getByRole('radio', { name: '方形' }).click();
  await page.getByRole('spinbutton', { name: '頭像 px' }).fill('80');
  await page.getByRole('spinbutton', { name: '頭像 px' }).press('Enter');
  await page.getByTestId('level-input').fill('3');
  await page.getByTestId('level-input').press('Enter');
  await page.getByTestId('label-input').fill('學生');
  await page.getByTestId('label-input').press('Enter');
  await expect(page.getByTestId('label-chip')).toHaveText(['學生']);
  const c = (await sheet(page)).chars[0];
  expect(c).toMatchObject({ locked: true, shape: 'square', size: 80, level: 3 });
  const p = await saved(page);
  expect(p?.labels.map((l) => l.text)).toEqual(['學生']);
  expect(c.labels).toEqual([p?.labels[0].id]);
  await expect(node(page, c.id).locator('.pin-badge')).toHaveCount(1);
  await expect(node(page, c.id).locator(':scope > rect')).toHaveAttribute('width', '80');
  /* 複製：名字數字＋1、外觀與標籤一起、釘選也照抄（原作） */
  await page.getByTestId('char-copy').click();
  const s1 = await sheet(page);
  expect(s1.chars).toHaveLength(2);
  expect(s1.chars[1]).toMatchObject({
    name: '阿明\nAlex2',
    shape: 'square',
    locked: true,
    labels: c.labels,
  });
  await expect(title(page)).toHaveText('編輯角色');
  await page.getByTestId('char-delete').click();
  expect((await sheet(page)).chars).toHaveLength(1);
  await expect(title(page)).toHaveText('分頁設定');
  expect(errors).toEqual([]);
});

test('批次建立：Enter 跳下一格、重複略過、貼上試算表的一欄、空分頁排成陣型、一步復原', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByTestId('open-batch').click();
  const dlg = page.getByRole('dialog', { name: '批次建立角色' });
  const cells = dlg.getByTestId('batch-cell');
  await cells.nth(0).fill('甲');
  await cells.nth(0).press('Enter');
  await expect(cells.nth(1)).toBeFocused();
  await page.keyboard.type('乙');
  await page.keyboard.press('Enter');
  await page.keyboard.type('甲');
  await expect(dlg.getByTestId('batch-preview')).toHaveText('將建立 2 位角色（已略過 1 個重複）');
  /* 格內換行 */
  await cells.nth(1).press('Alt+Enter');
  await page.keyboard.type('B');
  /* 貼上一欄（多欄只取第一欄） */
  await cells.nth(3).evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '丙\t1\n丁\t2');
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(dlg.getByTestId('batch-preview')).toHaveText(
    '將建立 4 位角色（已略過 1 個重複）（多欄貼上：已取第 1 欄）',
  );
  await expect(cells).toHaveCount(6);
  await dlg.getByTestId('batch-create').click();
  await expect(dlg).toBeHidden();
  const s = await sheet(page);
  expect(s.chars.map((c) => c.name)).toEqual(['甲', '乙\nB', '丙', '丁']);
  /* 空分頁：整批排成圓形（四個位置都不同、都在畫布裡） */
  expect(new Set(s.chars.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`)).size).toBe(4);
  for (const c of s.chars) {
    expect(c.x).toBeGreaterThan(0);
    expect(c.x).toBeLessThan(1000);
  }
  await page.getByTestId('undo').click();
  expect((await sheet(page)).chars).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('批次建立：用頭像圖片建立（檔名＝名稱、讀不了的略過）', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('open-batch').click();
  const dlg = page.getByRole('dialog', { name: '批次建立角色' });
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    dlg.getByTestId('batch-images').click(),
  ]);
  await fc.setFiles([
    { name: '紅.png', mimeType: 'image/png', buffer: await solidPng([255, 0, 0, 255]) },
    { name: '藍.png', mimeType: 'image/png', buffer: await solidPng([0, 0, 255, 255]) },
    { name: '壞.png', mimeType: 'image/png', buffer: Buffer.from('nope') },
  ]);
  await expect(dlg).toBeHidden();
  await expect(toast(page, '已加入 2 位角色')).toBeVisible();
  const s = await sheet(page);
  expect(s.chars.map((c) => c.name)).toEqual(['紅', '藍']);
  expect(s.chars.every((c) => c.avatar?.img && c.avatar.src)).toBe(true);
  await expect(chart(page).locator('image.av-img')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('頭像：上傳、用檔名當角色名、調整範圍、圖示、清除；重新整理後還在', async ({ page }) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  /* 偏好：用檔名當角色名 */
  await page.getByRole('switch', { name: '用檔名當角色名（只在這台瀏覽器）' }).click();
  await node(page, 1).dblclick();
  await expect(title(page)).toHaveText('編輯角色');
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('avatar-upload').click(),
  ]);
  const half = new Uint8Array(200 * 100 * 4);
  for (let i = 0; i < 200 * 100; i++)
    half.set(i % 200 < 100 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
  await fc.setFiles({
    name: '紅藍.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await encodePng(half, 200, 100)),
  });
  await expect(node(page, 1).locator('image.av-img')).toHaveCount(1);
  const c1 = (await sheet(page)).chars[0];
  expect(c1.name).toBe('紅藍');
  expect(c1.avatar?.place).toBeNull();
  /* 調整範圍：往右拖＝看到左半（紅） */
  await page.getByTestId('avatar-crop').click();
  const dlg = page.getByRole('dialog', { name: /調整範圍：紅藍/ });
  await expect(dlg).toBeVisible();
  const view = dlg.locator('canvas').first();
  const vc = await center(view);
  await drag(page, vc, { x: vc.x + 120, y: vc.y });
  await dlg.getByRole('button', { name: '套用' }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(async () => (await sheet(page)).chars[0].avatar?.img).not.toBe(c1.avatar?.img);
  const c2 = (await sheet(page)).chars[0];
  expect(c2.avatar?.src).toBe(c1.avatar?.src);
  expect(Math.abs(c2.avatar?.place?.x ?? 0)).toBeGreaterThan(0.05);
  /* 重新整理：頭像照樣畫出來 */
  await page.reload();
  await expect(node(page, 1).locator('image.av-img')).toHaveCount(1);
  await expect(node(page, 1).locator('image.av-img')).toHaveAttribute('href', /^blob:/);
  /* 圖示、清除 */
  await node(page, 1).dblclick();
  await page.getByTestId('avatar-icon').click();
  await page.getByTestId('icon-heart').click();
  await expect(node(page, 1).locator('.av-icon')).toHaveCount(1);
  expect((await sheet(page)).chars[0]).toMatchObject({ icon: 'heart', avatar: null });
  await page.getByTestId('avatar-clear').click();
  await expect(node(page, 1).locator('.av-icon')).toHaveCount(0);
  await expect(node(page, 1).locator('.node-face text')).toHaveText('紅');
  expect(errors).toEqual([]);
});

/* ---------- 關係 ---------- */

test('關係類型與建立關係模式：一對多、換起點、升級成雙向、已存在、本輪取消、長按＝自我關係', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await page.getByTestId('type-add').click();
  await expect(title(page)).toHaveText('編輯關係類型');
  await page.getByTestId('type-name').fill('朋友');
  await page.getByTestId('type-name').blur();
  const t0 = (await sheet(page)).types[0];
  expect(t0).toMatchObject({ label: '朋友', color: 'auto', lineStyle: 'solid', capStyle: 'arrow' });
  /* 點清單的一列＝建立關係模式 */
  await page.getByTestId('type-row').locator('span', { hasText: '朋友' }).click();
  const banner = page.getByTestId('link-banner');
  await expect(banner).toContainText('建立關係【朋友】：點起點');
  await node(page, 1).click();
  await expect(banner).toContainText('建立關係【朋友】：甲 →');
  await expect(node(page, 1).locator('.link-from')).toHaveCount(1);
  await node(page, 2).click();
  await node(page, 3).click();
  let s = await sheet(page);
  expect(s.rels.map((r) => [r.from, r.to, r.both])).toEqual([
    [1, 2, false],
    [1, 3, false],
  ]);
  await expect(node(page, 2).locator('.link-done-badge')).toHaveCount(1);
  /* 本輪剛建立的再點一次＝取消 */
  await node(page, 3).click();
  expect((await sheet(page)).rels).toHaveLength(1);
  /* 再點起點＝換起點 */
  await node(page, 1).click();
  await expect(banner).toContainText('點起點');
  await node(page, 2).click();
  await node(page, 1).click();
  await expect(banner).toContainText('已合併成一條雙向線');
  s = await sheet(page);
  expect(s.rels.map((r) => [r.from, r.to, r.both])).toEqual([[1, 2, true]]);
  /* 起點留著：再點丙＝乙 → 丙 */
  await node(page, 3).click();
  /* 長按＝指向自己 */
  const c3 = await nodeCenter(page, 3);
  await page.mouse.move(c3.x, c3.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  s = await sheet(page);
  expect(s.rels.map((r) => [r.from, r.to])).toEqual([
    [1, 2],
    [2, 3],
    [3, 3],
  ]);
  expect(s.rels[0].both).toBe(true);
  await expect(chart(page).locator('.self-edge')).toHaveCount(1);
  /* Esc 結束 */
  await page.keyboard.press('Escape');
  await expect(banner).toBeHidden();
  /* 已經存在：橫幅提示 */
  await page.getByTestId('type-row').locator('span', { hasText: '朋友' }).click();
  await node(page, 1).click();
  await node(page, 2).click();
  await expect(banner).toContainText('這條關係已經存在了');
  await banner.getByRole('button', { name: '結束' }).click();
  await expect(banner).toBeHidden();
  /* 隱藏、Alt＝只顯示這一種 */
  await page.getByTestId('type-add').click();
  await page.getByTestId('type-name').fill('敵對');
  await page.getByTestId('type-name').blur();
  await page.getByTestId('type-visible').first().click();
  await expect(chart(page).locator('.edge')).toHaveCount(0);
  expect((await sheet(page)).types.map((t) => t.hidden)).toEqual([true, false]);
  await page
    .getByTestId('type-visible')
    .first()
    .click({ modifiers: ['Alt'] });
  expect((await sheet(page)).types.map((t) => t.hidden)).toEqual([false, true]);
  await page
    .getByTestId('type-visible')
    .first()
    .click({ modifiers: ['Alt'] });
  expect((await sheet(page)).types.map((t) => t.hidden)).toEqual([false, false]);
  expect(errors).toEqual([]);
});

test('關係類型的編輯：線型、端點、粗細、外框、隱藏於圖例、複製、刪除（有線時確認）', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = trio();
  s0.types.push(makeType(10, '友情', { color: '#58b368' }));
  s0.rels.push(makeRel(20, 1, 2, 10));
  await seed(page, project([s0]));
  await page.getByTestId('type-edit').click();
  await expect(page.getByTestId('type-used')).toHaveText('目前有 1 條線、2 位角色使用這種關係。');
  /* 名稱清空＝存成「未命名關係（現有最大編號＋1）」；清單、下拉、圖例都顯示這個名字（原作） */
  const nameBox = page.getByTestId('type-name');
  await nameBox.fill('');
  await expect(page.getByTestId('type-row').first()).toContainText('未命名關係1');
  await nameBox.blur();
  expect((await sheet(page)).types[0].label).toBe('未命名關係1');
  await expect(chart(page).locator('.legend-item[data-legend-type="10"]')).toContainText(
    '未命名關係1',
  );
  await nameBox.fill('友情');
  await nameBox.blur();
  await page.getByTestId('type-line-style').click();
  await page.getByRole('option', { name: '波浪線' }).click();
  await page.getByTestId('type-cap-style').click();
  await page.getByRole('option', { name: '空心菱形' }).click();
  await page.getByRole('spinbutton', { name: '外框寬度' }).fill('0');
  await page.getByRole('spinbutton', { name: '外框寬度' }).press('Enter');
  await page.getByRole('checkbox', { name: '隱藏於圖例' }).click();
  const t = (await sheet(page)).types[0];
  expect(t).toMatchObject({
    lineStyle: 'wavy',
    capStyle: 'hdiamond',
    outlineW: 0,
    hideInLegend: true,
  });
  await expect(chart(page).locator('[data-legend-type]')).toHaveCount(0);
  await page.getByTestId('type-copy').click();
  expect((await sheet(page)).types.map((x) => x.label)).toEqual(['友情', '友情（複製1）']);
  await expect(title(page)).toHaveText('編輯關係類型');
  await page.getByTestId('type-row').first().getByTestId('type-edit').click();
  await page.getByTestId('type-delete').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('刪除這種關係及 1 條相關的線？');
  await confirm.getByRole('button', { name: '刪除' }).click();
  const s = await sheet(page);
  expect(s.types.map((x) => x.label)).toEqual(['友情（複製1）']);
  expect(s.rels).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('關係線的編輯：點線打開、備註、反轉、合併與拆開、捆綁、彎曲、標籤拖曳、刪除', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = trio();
  s0.types.push(makeType(10, '友情'), makeType(11, '敵對'));
  s0.rels.push(makeRel(20, 1, 2, 10), makeRel(21, 2, 1, 10));
  s0.settings.showRelName = true;
  await seed(page, project([s0]));
  /* 兩個方向的同類線＝中央接點 */
  await expect(chart(page).locator('.pair-joint')).toHaveCount(1);
  await chart(page).locator('.edge-lbl[data-relid="20"]').click();
  await expect(title(page)).toHaveText('編輯關係');
  const panel = page.getByTestId('rel-panel');
  await expect(panel).toContainText('甲');
  await page.getByTestId('rel-note').fill('第一章');
  await page.getByTestId('rel-note').blur();
  expect((await sheet(page)).rels[0].note).toBe('第一章');
  /* 合併為雙向 */
  await page.getByTestId('rel-merge').click();
  let s = await sheet(page);
  expect(s.rels.map((r) => [r.id, r.from, r.to, r.both])).toEqual([[20, 1, 2, true]]);
  await page.getByTestId('rel-split').click();
  s = await sheet(page);
  expect(s.rels.map((r) => [r.from, r.to, r.both])).toEqual([
    [1, 2, false],
    [2, 1, false],
  ]);
  /* 反轉會撞到既有的線：擋下 */
  await page.getByTestId('rel-flip').click();
  await expect(panel).toContainText('反轉後會和既有的關係重複。');
  /* 換關係類型 */
  await page.getByTestId('rel-type').click();
  await page.getByRole('option', { name: '敵對' }).click();
  s = await sheet(page);
  expect(s.rels[0]).toMatchObject({ from: 1, to: 2, type: 11 });
  /* 捆綁／解除（這兩人之間全部的線） */
  await page.getByTestId('rel-bundle').click();
  s = await sheet(page);
  expect(s.rels.every((r) => r.pairSkip)).toBe(true);
  await expect(chart(page).locator('.pair-joint')).toHaveCount(0);
  await page.getByTestId('rel-bundle').click();
  expect((await sheet(page)).rels.every((r) => !r.pairSkip)).toBe(true);
  /* 彎曲 */
  await panel.getByTestId('rel-curve').getByRole('radio', { name: '反向弧' }).click();
  expect((await sheet(page)).rels.map((r) => r.curveDir)).toEqual([-1, -1]);
  /* 換了類型之後可以反轉 */
  await page.getByTestId('rel-flip').click();
  s = await sheet(page);
  expect(s.rels[0]).toMatchObject({ from: 2, to: 1, type: 11, curveDir: 1 });
  /* 拖曳線上的標籤＝沿線移動 */
  await page.getByTestId('panel-close').click();
  /* 拆開時新建的那一條 */
  const other = (await sheet(page)).rels.find((r) => r.id !== 20)?.id ?? 0;
  const lbl = chart(page).locator(`.edge-lbl[data-relid="${other}"]`);
  const lc = await center(lbl);
  const a = await nodeCenter(page, 1);
  await drag(page, lc, { x: lc.x + (a.x - lc.x) * 0.6, y: lc.y + (a.y - lc.y) * 0.6 });
  const lt = (await sheet(page)).rels.find((r) => r.id === other)?.labelT ?? null;
  expect(lt).not.toBeNull();
  expect(Math.abs((lt ?? 0.5) - 0.5)).toBeGreaterThan(0.1);
  await page.getByTestId('undo').click();
  expect((await sheet(page)).rels.find((r) => r.id === other)?.labelT).toBeNull();
  /* 刪除 */
  await lbl.click();
  await page.getByTestId('rel-delete').click();
  expect((await sheet(page)).rels.map((r) => r.id)).toEqual([20]);
  expect(errors).toEqual([]);
});

/* ---------- 畫布 ---------- */

test('畫布：拖曳、碰撞推擠、點選聚焦、框選與群組拖曳、Shift＋點、方向鍵、Delete、Esc、Ctrl＋A', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = trio();
  s0.types.push(makeType(10, '友情'));
  s0.rels.push(makeRel(20, 1, 3, 10));
  await seed(page, project([s0]));
  /* 拖曳：甲拖到乙的位置 → 乙被推開；一步復原 */
  const a = await nodeCenter(page, 1);
  const b = await nodeCenter(page, 2);
  await drag(page, a, b);
  let s = await sheet(page);
  const [ca, cb] = s.chars;
  expect(ca.x).toBeGreaterThan(600);
  expect(Math.hypot(ca.x - cb.x, ca.y - cb.y)).toBeGreaterThan(90);
  await page.getByTestId('undo').click();
  s = await sheet(page);
  expect(s.chars.map((c) => [c.x, c.y])).toEqual([
    [250, 500],
    [750, 500],
    [500, 200],
  ]);
  /* 點角色＝聚焦（一度關係保留，其他淡化）；再點取消 */
  await node(page, 1).click();
  const svg = chart(page).locator('svg');
  await expect(svg).toHaveClass(/focus-active/);
  await expect(node(page, 1)).toHaveClass(/focusedV/);
  await expect(node(page, 3)).toHaveClass(/focusedV/);
  await expect(node(page, 2)).not.toHaveClass(/focusedV/);
  /* Esc 取消聚焦（還開著的按鈕提示會先吃掉一次 Esc） */
  await page.keyboard.press('Escape');
  if (await svg.evaluate((el) => el.classList.contains('focus-active')))
    await page.keyboard.press('Escape');
  await expect(svg).not.toHaveClass(/focus-active/);
  /* 框選 */
  const box = await page.getByTestId('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const c1 = await nodeCenter(page, 1);
  const c3 = await nodeCenter(page, 3);
  await drag(page, { x: c1.x - 70, y: c3.y - 70 }, { x: c3.x + 70, y: c1.y + 70 });
  await expect(title(page)).toHaveText('已選 2 位');
  await expect(node(page, 1).locator('.sel-ring')).toHaveCount(1);
  /* 群組拖曳 */
  await drag(page, c1, { x: c1.x, y: c1.y + 60 });
  s = await sheet(page);
  expect(s.chars[0].y).toBeGreaterThan(530);
  expect(s.chars[2].y - 200).toBeCloseTo(s.chars[0].y - 500, 0);
  expect(s.chars[1].y).toBe(500);
  /* 方向鍵（Shift＝10 px）、連按算一步 */
  const before = s.chars.map((c) => c.x);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  s = await sheet(page);
  expect(s.chars[0].x).toBe(before[0] + 11);
  expect(s.chars[1].x).toBe(before[1]);
  await page.waitForTimeout(600);
  await page.getByTestId('undo').click();
  expect((await sheet(page)).chars[0].x).toBe(before[0]);
  /* Shift＋點加入、Esc 取消選取 */
  await node(page, 2).click({ modifiers: ['Shift'] });
  await expect(title(page)).toHaveText('已選 3 位');
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('分頁設定');
  /* Ctrl＋A、Delete */
  await page.keyboard.press('Control+a');
  await expect(title(page)).toHaveText('已選 3 位');
  await page.keyboard.press('Delete');
  s = await sheet(page);
  expect(s.chars).toHaveLength(0);
  expect(s.rels).toHaveLength(0);
  await page.keyboard.press('Control+z');
  expect((await sheet(page)).chars).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('拖曳的快速路徑：拖曳中只移動角色與相連的線、不整張重畫，放開才寫回；120 位時每次移動夠快', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = emptySheet(1, 1, { W: 2400, H: 1800 });
  s0.types.push(makeType(10, '友情'));
  for (let i = 0; i < 120; i++)
    s0.chars.push(
      makeChar(i + 1, `角色${i + 1}`, 140 + (i % 12) * 190, 140 + Math.floor(i / 12) * 170, {
        defNo: i + 1,
      }),
    );
  for (let i = 1; i < 120; i++) s0.rels.push(makeRel(1000 + i, i, i + 1, 10));
  await seed(page, project([s0]));
  /* 畫面那張 SVG（拖曳時底下另有一張放動到的線） */
  const svg = chart(page).locator('svg.rc-chart:not(.rc-live-under)');
  await svg.evaluate((el) => el.setAttribute('data-mark', 'before'));
  const line = chart(page).locator('.edge[data-relid="1030"] path').last();
  const d0 = await line.getAttribute('d');
  const a = await nodeCenter(page, 30);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 1; i <= 30; i++) await page.mouse.move(a.x + i * 2, a.y + i);
  const perMove = (Date.now() - t0) / 30;
  await page.waitForTimeout(100);
  /* 拖曳中：同一份 SVG（沒有整張重畫），被拖的角色用 transform 移動，相連的線跟著重畫 */
  await expect(svg).toHaveAttribute('data-mark', 'before');
  await expect(node(page, 30)).toHaveAttribute('transform', /^translate\(/);
  expect(await line.getAttribute('d')).not.toBe(d0);
  await page.mouse.up();
  /* 放開：寫回專案、整張重畫 */
  await expect(svg).not.toHaveAttribute('data-mark', 'before');
  const s = await sheet(page);
  const c30 = s.chars.find((c) => c.id === 30);
  expect(c30?.x).toBeGreaterThan(s0.chars[29].x + 100);
  await expect(node(page, 30)).not.toHaveAttribute('transform', /translate/);
  /* 一步復原 */
  await page.getByTestId('undo').click();
  expect((await sheet(page)).chars[29]).toMatchObject({ x: s0.chars[29].x, y: s0.chars[29].y });
  /* 寬鬆的上限（機器忙時也穩）；每次移動都整張重畫的舊做法，驗證者量到 120 位約 174 ms */
  expect(perMove).toBeLessThan(100);
  expect(errors).toEqual([]);
});

test('整組拖到畫布外：保持隊形、只加邊緣阻力（可以進出血區）', async ({ page }) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await node(page, 1).click({ modifiers: ['Shift'] });
  await node(page, 3).click({ modifiers: ['Shift'] });
  await expect(title(page)).toHaveText('已選 2 位');
  const from = await nodeCenter(page, 3);
  const zoom = Number.parseInt((await page.getByTestId('zoom-level').textContent()) ?? '0', 10);
  const k = zoom / 100;
  /* 丙(500,200) 往右拖 600、往上拖 300（畫布座標） */
  await drag(page, from, { x: from.x + 600 * k, y: from.y - 300 * k });
  const s = await sheet(page);
  const [a, , c] = s.chars;
  /* 隊形不變（甲和丙的相對位置）、丙超出畫布右上（進出血區）、乙不動 */
  expect(Math.round(c.x - a.x)).toBe(250);
  expect(Math.round(c.y - a.y)).toBe(-300);
  expect(c.x).toBeGreaterThan(1000 - 46);
  expect(c.y).toBeLessThan(46);
  expect(s.chars[1]).toMatchObject({ x: 750, y: 500 });
  expect(errors).toEqual([]);
});

test('磁鐵停下時解開重疊（原作的 separateAll）、整段一步復原', async ({ page }) => {
  const errors = await open(page);
  const s0 = emptySheet(1, 1);
  /* 兩位釘選的角色中間夾一位：力量左右抵消，只有停下時的解開重疊會移動它 */
  s0.chars.push(
    makeChar(1, '甲', 400, 500, { defNo: 1, locked: true }),
    makeChar(2, '乙', 500, 500, { defNo: 2 }),
    makeChar(3, '丙', 600, 500, { defNo: 3, locked: true }),
  );
  await seed(page, project([s0]));
  await page.getByTestId('magnet').click();
  await expect(page.getByTestId('magnet').locator('svg')).toHaveClass(/animate-pulse/);
  await expect(page.getByTestId('magnet').locator('svg')).not.toHaveClass(/animate-pulse/, {
    timeout: 10000,
  });
  const s = await sheet(page);
  expect(s.chars.map((c) => [c.x, c.y])).toEqual([
    [400, 500],
    [492, 500],
    [600, 500],
  ]);
  await page.getByTestId('undo').click();
  expect((await sheet(page)).chars[1]).toMatchObject({ x: 500, y: 500 });
  expect(errors).toEqual([]);
});

test('批次編輯面板：釘選、形狀、混合、尺寸、重要度、複製、刪除', async ({ page }) => {
  const errors = await open(page);
  const s0 = trio();
  s0.chars[0].shape = 'square';
  s0.chars[0].size = 120;
  await seed(page, project([s0]));
  await page.keyboard.press('Control+a');
  const panel = page.getByTestId('batch-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.text-warning', { hasText: '混合' })).toHaveCount(0);
  /* 尺寸欄：不一致＝「混合」，大家都是自動才是「自動」 */
  await expect(panel.getByRole('spinbutton', { name: '頭像 px' })).toHaveAttribute(
    'placeholder',
    '混合',
  );
  await expect(panel.getByRole('spinbutton', { name: '頭像 px' })).toHaveValue('');
  await expect(panel.getByRole('spinbutton', { name: '名字 px' })).toHaveAttribute(
    'placeholder',
    '自動',
  );
  await panel.getByRole('radio', { name: '圓形' }).click();
  expect((await sheet(page)).chars.map((c) => c.shape)).toEqual(['circle', 'circle', 'circle']);
  await panel.getByTestId('batch-lock').click();
  expect((await sheet(page)).chars.every((c) => c.locked)).toBe(true);
  await expect(panel.getByTestId('batch-lock')).toHaveText('解除釘選');
  await panel.getByRole('button', { name: '+1' }).click();
  expect((await sheet(page)).chars.map((c) => c.level)).toEqual([1, 1, 1]);
  await panel.getByRole('spinbutton', { name: '名字 px' }).fill('20');
  await panel.getByRole('spinbutton', { name: '名字 px' }).press('Enter');
  expect((await sheet(page)).chars.map((c) => c.nameSize)).toEqual([20, 20, 20]);
  await panel.getByTestId('batch-copy').click();
  await expect(panel.getByTestId('batch-count')).toHaveText('已選 3 位');
  let s = await sheet(page);
  expect(s.chars.map((c) => c.name)).toEqual(['甲', '乙', '丙', '甲2', '乙2', '丙2']);
  await panel.getByTestId('batch-delete').click();
  s = await sheet(page);
  expect(s.chars.map((c) => c.name)).toEqual(['甲', '乙', '丙']);
  expect(errors).toEqual([]);
});

test('長按與按兩下＝編輯；縮放按鈕、滾輪、符合畫面；小地圖', async ({ page }) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  const c = await nodeCenter(page, 2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await expect(page.getByTestId('press-ring')).toBeVisible();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(title(page)).toHaveText('編輯角色');
  await expect(page.getByTestId('char-name')).toHaveValue('乙');
  await page.getByTestId('panel-close').click();
  await node(page, 3).dblclick();
  await expect(page.getByTestId('char-name')).toHaveValue('丙');
  const zoom = page.getByTestId('zoom-level');
  const z0 = Number.parseInt((await zoom.textContent()) ?? '0', 10);
  const zoomNow = async () => Number.parseInt((await zoom.textContent()) ?? '0', 10);
  await page.getByTestId('zoom-in').click();
  await expect.poll(zoomNow).toBeGreaterThanOrEqual(Math.floor(z0 * 1.25) - 1);
  const z1 = await zoomNow();
  expect(z1).toBeLessThanOrEqual(Math.ceil(z0 * 1.25) + 1);
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, 200);
  await expect.poll(zoomNow).toBeLessThan(z1);
  await page.getByTestId('zoom-fit').click();
  await expect(zoom).toHaveText(`${z0}%`);
  /* 小地圖：點一下移動視角；× 關閉、更多選單再打開 */
  const mm = page.getByTestId('minimap');
  await expect(mm).toBeVisible();
  const before = await nodeCenter(page, 1);
  const mmBox = await mm.getByRole('img', { name: /小地圖/ }).boundingBox();
  if (!mmBox) throw new Error('no minimap');
  await page.mouse.click(mmBox.x + 5, mmBox.y + 5);
  const after = await nodeCenter(page, 1);
  expect(after.x).toBeGreaterThan(before.x);
  await page.getByTestId('minimap-close').click();
  await expect(mm).toBeHidden();
  await more(page, 'menu-minimap');
  await expect(page.getByTestId('minimap')).toBeVisible();
  expect(errors).toEqual([]);
});

test('縮放途中（還沒重新排版）：圖層拿掉 will-change，停手重新排版後標回去；文字一律幾何縮放（7.10 D72、7.11 D72b）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  const layer = page.getByTestId('chart');
  const look = () =>
    layer.evaluate((el) => {
      const svg = el.querySelector(':scope > svg.rc-chart');
      return {
        scaled: /scale\(/.test((el as HTMLElement).style.transform),
        willChange: (el as HTMLElement).style.willChange,
        text: svg ? getComputedStyle(svg).textRendering : null,
      };
    });
  await expect
    .poll(look)
    .toEqual({ scaled: false, willChange: 'transform', text: 'geometricprecision' });
  /* 滾一格、等這一格畫好（兩個 rAF）就看：還在縮放途中 */
  const mid = await page.evaluate(async () => {
    const host = document.querySelector('[data-testid=canvas]') as HTMLElement;
    const el = document.querySelector('[data-testid=chart]') as HTMLElement;
    const r = host.getBoundingClientRect();
    host.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        bubbles: true,
        cancelable: true,
      }),
    );
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const svg = el.querySelector(':scope > svg.rc-chart') as SVGElement;
    return {
      scaled: /scale\(/.test(el.style.transform),
      willChange: el.style.willChange,
      text: getComputedStyle(svg).textRendering,
    };
  });
  expect(mid).toEqual({ scaled: true, willChange: 'auto', text: 'geometricprecision' });
  await expect.poll(look, { timeout: 5000 }).toEqual({
    scaled: false,
    willChange: 'transform',
    text: 'geometricprecision',
  });
  expect(errors).toEqual([]);
});

/** 觸控的指標事件（Playwright 沒有多指觸控；直接發 pointer 事件給點到的元素） */
async function touch(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  id: number,
  x: number,
  y: number,
) {
  await page.evaluate(
    ({ type, id, x, y }) => {
      const el = document.elementFromPoint(x, y) ?? document.body;
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 1,
          clientX: x,
          clientY: y,
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerup' ? 0 : 1,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { type, id, x, y },
  );
}

test('觸控：拖曳角色＝移動、拖曳空白處＝平移、雙指捏合＝縮放、圖例＝只看這種關係', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = trio();
  s0.types.push(makeType(10, '友情'), makeType(11, '敵對'));
  s0.rels.push(makeRel(20, 1, 3, 10), makeRel(21, 2, 3, 11));
  await seed(page, project([s0]));
  /* 拖曳角色 */
  const a = await nodeCenter(page, 1);
  await touch(page, 'pointerdown', 1, a.x, a.y);
  for (let k = 1; k <= 5; k++) await touch(page, 'pointermove', 1, a.x, a.y + k * 12);
  await touch(page, 'pointerup', 1, a.x, a.y + 60);
  const s = await sheet(page);
  expect(s.chars[0].y).toBeGreaterThan(560);
  expect(s.chars[0].x).toBe(250);
  /* 拖曳空白處＝平移（不框選） */
  const box = await page.getByTestId('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const p0 = { x: box.x + 40, y: box.y + box.height - 80 };
  const before = await nodeCenter(page, 2);
  await touch(page, 'pointerdown', 1, p0.x, p0.y);
  for (let k = 1; k <= 5; k++) await touch(page, 'pointermove', 1, p0.x + k * 10, p0.y);
  await touch(page, 'pointerup', 1, p0.x + 50, p0.y);
  const after = await nodeCenter(page, 2);
  expect(after.x - before.x).toBeCloseTo(50, 0);
  await expect(page.getByTestId('box-select')).toHaveCount(0);
  await expect(title(page)).toHaveText('分頁設定');
  /* 雙指捏合 */
  const zoom = page.getByTestId('zoom-level');
  const z0 = Number.parseInt((await zoom.textContent()) ?? '0', 10);
  const c = { x: box.x + box.width / 2, y: box.y + 60 };
  await touch(page, 'pointerdown', 1, c.x - 40, c.y);
  await touch(page, 'pointerdown', 2, c.x + 40, c.y);
  for (let k = 1; k <= 4; k++) {
    await touch(page, 'pointermove', 1, c.x - 40 - k * 10, c.y);
    await touch(page, 'pointermove', 2, c.x + 40 + k * 10, c.y);
  }
  await touch(page, 'pointerup', 1, c.x - 80, c.y);
  await touch(page, 'pointerup', 2, c.x + 80, c.y);
  const z1 = Number.parseInt((await zoom.textContent()) ?? '0', 10);
  expect(z1).toBeGreaterThan(z0 * 1.6);
  /* 圖例（編輯畫面）：點一項＝只看這種關係，再點一次取消 */
  await page.getByTestId('zoom-fit').click();
  const item = chart(page).locator('.legend-item[data-legend-type="11"]');
  await item.click();
  const svg = chart(page).locator('svg');
  await expect(svg).toHaveClass(/focus-active/);
  await expect(item).toHaveClass(/legend-on/);
  await expect(node(page, 2)).toHaveClass(/focusedV/);
  await expect(node(page, 1)).not.toHaveClass(/focusedV/);
  await item.click();
  await expect(svg).not.toHaveClass(/focus-active/);
  expect(errors).toEqual([]);
});

test('角色清單：搜尋、點一列＝聚焦、依標籤分組（8 位以上）', async ({ page }) => {
  const errors = await open(page);
  const s0 = emptySheet(1, 1);
  for (let i = 1; i <= 9; i++)
    s0.chars.push(makeChar(i, `角色${i}`, 100 * i, 500, { defNo: i, labels: i <= 3 ? [77] : [] }));
  await seed(page, project([s0], { labels: [makeLabel(77, '甲班')] }));
  await page.getByTestId('char-search').fill('角色5');
  await page.getByRole('button', { name: '角色5', exact: true }).click();
  await expect(node(page, 5)).toHaveClass(/focusedV/);
  await expect(title(page)).toHaveText('分頁設定');
  await page.getByTestId('char-row').nth(1).click();
  await expect(node(page, 2)).toHaveClass(/focusedV/);
  await page.getByTestId('char-group').click();
  await expect(page.locator('summary', { hasText: '甲班' })).toContainText('3');
  await expect(page.locator('summary', { hasText: '未分類' })).toContainText('6');
  expect(errors).toEqual([]);
});

test('角色清單與關係類型清單：觸控按住把手拖曳換順序', async ({ page }) => {
  const errors = await open(page);
  const s0 = trio();
  s0.types.push(makeType(10, '友情'), makeType(11, '敵對'));
  await seed(page, project([s0]));
  const rows = page.getByTestId('char-row');
  const handle = rows.first().locator('[data-drag-handle]');
  await expect(handle).toHaveAttribute('title', /觸控/);
  const a = await center(handle);
  const end = await center(rows.nth(2));
  await touch(page, 'pointerdown', 1, a.x, a.y);
  for (let k = 1; k <= 6; k++)
    await touch(page, 'pointermove', 1, a.x, a.y + ((end.y + 6 - a.y) * k) / 6);
  await touch(page, 'pointerup', 1, a.x, end.y + 6);
  const s = await sheet(page);
  expect(s.chars.map((c) => c.name)).toEqual(['乙', '丙', '甲']);
  /* 關係類型清單也一樣 */
  const trows = page.getByTestId('type-row');
  const h2 = await center(trows.first().locator('[data-drag-handle]'));
  const e2 = await center(trows.nth(1));
  await touch(page, 'pointerdown', 1, h2.x, h2.y);
  for (let k = 1; k <= 6; k++)
    await touch(page, 'pointermove', 1, h2.x, h2.y + ((e2.y + 6 - h2.y) * k) / 6);
  await touch(page, 'pointerup', 1, h2.x, e2.y + 6);
  expect((await sheet(page)).types.map((t) => t.label)).toEqual(['敵對', '友情']);
  expect(errors).toEqual([]);
});

test('排列：預覽、取消回到原位、確定一步復原；對齊與分佈；打亂座位', async ({ page }) => {
  const errors = await open(page);
  await seed(page, project([sample('story')]));
  const pos = async () => (await sheet(page)).chars.map((c) => [Math.round(c.x), Math.round(c.y)]);
  const p0 = await pos();
  await page.getByTestId('open-layout').click();
  const dlg = page.getByRole('dialog', { name: '排列方式' });
  await dlg.getByTestId('layout-line').click();
  let s = await sheet(page);
  /* 重要度不同的排在不同排（主角 H2 在前排），同一個重要度在同一排 */
  expect(new Set(s.chars.filter((c) => !c.level).map((c) => Math.round(c.y))).size).toBe(1);
  expect(Math.round(s.chars[0].y)).not.toBe(Math.round(s.chars[1].y));
  expect(s.settings.lastLayout).toBe('line');
  await dlg.getByTestId('layout-cancel').click();
  await expect(dlg).toBeHidden();
  expect(await pos()).toEqual(p0);
  expect((await sheet(page)).settings.lastLayout).toBe('circle');
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.getByTestId('open-layout').click();
  await dlg.getByTestId('layout-vline').click();
  await dlg.getByRole('switch', { name: '重要度反向排列' }).click();
  await dlg.getByTestId('layout-ok').click();
  s = await sheet(page);
  expect(new Set(s.chars.filter((c) => !c.level).map((c) => Math.round(c.x))).size).toBe(1);
  expect(s.settings.pinFlip).toBe(true);
  await page.getByTestId('undo').click();
  expect(await pos()).toEqual(p0);
  await expect(page.getByTestId('undo')).toBeDisabled();
  /* 對齊（沒有選取＝以畫布為對象） */
  await page.getByTestId('open-align').click();
  const al = page.getByRole('dialog', { name: '對齊與分佈' });
  await expect(al.getByTestId('align-target')).toContainText('以畫布為對象（6 位角色）');
  await al.getByTestId('align-top').click();
  s = await sheet(page);
  expect(Math.min(...s.chars.map((c) => c.y))).toBe(46);
  await page.keyboard.press('Escape');
  /* 選取 3 位：靠左對齊 */
  await node(page, 2).click({ modifiers: ['Shift'] });
  await node(page, 3).click({ modifiers: ['Shift'] });
  await node(page, 5).click({ modifiers: ['Shift'] });
  await page.getByTestId('open-align').click();
  await expect(al.getByTestId('align-target')).toHaveText('對象：選取的 3 位角色');
  await al.getByTestId('align-left').click();
  s = await sheet(page);
  expect(new Set([2, 3, 5].map((id) => s.chars.find((c) => c.id === id)?.x)).size).toBe(1);
  await page.keyboard.press('Escape');
  /* 打亂座位：只在選取的人之間交換位置 */
  const before = (await sheet(page)).chars.map((c) => [c.id, c.x, c.y]);
  await more(page, 'menu-shuffle');
  s = await sheet(page);
  const moved = s.chars
    .filter((c, i) => c.x !== before[i][1] || c.y !== before[i][2])
    .map((c) => c.id);
  expect(moved.length).toBeGreaterThanOrEqual(2);
  expect(moved.every((id) => [2, 3, 5].includes(id))).toBe(true);
  /* 只選 1 位：只移動那一位、以畫布為參考（原作） */
  await page.keyboard.press('Escape');
  if ((await title(page).textContent()) !== '分頁設定') await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('分頁設定');
  await node(page, 4).click({ modifiers: ['Shift'] });
  const one = (await sheet(page)).chars.map((c) => [c.id, c.x, c.y]);
  await page.getByTestId('open-align').click();
  await expect(al.getByTestId('align-target')).toHaveText('對象：選取的 1 位角色（以畫布為參考）');
  await al.getByTestId('align-left').click();
  s = await sheet(page);
  expect(s.chars.filter((c, i) => c.x !== one[i][1] || c.y !== one[i][2]).map((c) => c.id)).toEqual(
    [4],
  );
  expect(s.chars.find((c) => c.id === 4)?.x).toBeLessThan(Number(one.find((r) => r[0] === 4)?.[1]));
  expect(errors).toEqual([]);
});

test('磁鐵排列：有關係的兩人靠近、靜下來後自動停、整段一步復原', async ({ page }) => {
  const errors = await open(page);
  const s0 = trio();
  s0.chars[0].x = 120;
  s0.chars[1].x = 880;
  s0.types.push(makeType(10, '友情'));
  s0.rels.push(makeRel(20, 1, 2, 10));
  await seed(page, project([s0]));
  await page.getByTestId('magnet').click();
  await expect(page.getByTestId('magnet')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => (await saved(page))?.sheets[0].settings.snapMode, { timeout: 3000 })
    .toBe(true);
  await page.waitForTimeout(4000);
  const s = await sheet(page);
  expect(s.chars[1].x - s.chars[0].x).toBeLessThan(700);
  await page.getByTestId('magnet').click();
  await expect(page.getByTestId('magnet')).toHaveAttribute('aria-pressed', 'false');
  /* 復原：關掉 → 磁鐵移動的整段 → 打開 */
  await page.getByTestId('undo').click();
  await page.getByTestId('undo').click();
  let back = await sheet(page);
  expect(back.chars.map((c) => c.x)).toEqual([120, 880, 500]);
  expect(back.settings.snapMode).toBe(true);
  await page.getByTestId('undo').click();
  back = await sheet(page);
  expect(back.settings.snapMode).toBe(false);
  await expect(page.getByTestId('undo')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('畫布尺寸（基準點、預覽拖曳）、畫布貼合內容、背景圖片', async ({ page }) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await more(page, 'menu-canvas');
  const dlg = page.getByRole('dialog', { name: '修改畫布尺寸' });
  await dlg.getByTestId('canvas-w').getByRole('spinbutton', { name: '寬' }).fill('1200');
  await dlg.getByRole('spinbutton', { name: '寬' }).press('Tab');
  await dlg.getByTestId('canvas-h').getByRole('spinbutton', { name: '高' }).fill('800');
  await dlg.getByRole('spinbutton', { name: '高' }).press('Tab');
  await dlg.getByRole('radio', { name: '左上' }).click();
  await dlg.getByTestId('canvas-ok').click();
  let s = await sheet(page);
  expect([s.W, s.H]).toEqual([1200, 800]);
  expect(s.chars[0]).toMatchObject({ x: 250, y: 500 });
  await page.getByTestId('undo').click();
  await more(page, 'menu-canvas');
  await dlg.getByRole('spinbutton', { name: '寬' }).fill('1200');
  await dlg.getByRole('spinbutton', { name: '寬' }).press('Tab');
  await dlg.getByTestId('canvas-ok').click();
  s = await sheet(page);
  expect(s.W).toBe(1200);
  expect(s.chars[0].x).toBe(350);
  await more(page, 'menu-fit-canvas');
  await expect(toast(page, /畫布改成/)).toBeVisible();
  s = await sheet(page);
  expect(s.W).toBeLessThan(800);
  expect(Math.min(...s.chars.map((c) => c.x))).toBeCloseTo(60 + 46, 0);
  /* 背景圖片 */
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    (async () => {
      await page.getByTestId('more-menu').click();
      await page.getByRole('menuitem', { name: '匯入背景圖片…' }).click();
    })(),
  ]);
  await fc.setFiles({
    name: 'bg.png',
    mimeType: 'image/png',
    buffer: await solidPng([0, 0, 255, 255]),
  });
  await expect(chart(page).locator('image.canvas-bgimg')).toHaveCount(1);
  expect((await sheet(page)).bg).toBeTruthy();
  await page.getByTestId('more-menu').click();
  await page.getByRole('menuitem', { name: '移除背景圖片' }).click();
  await expect(chart(page).locator('image.canvas-bgimg')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('分頁：新增（沿用尺寸與設定）、改名、複製、選單換順序、刪除與復原', async ({ page }) => {
  const errors = await open(page);
  const s0 = trio();
  s0.W = 1200;
  s0.settings.palette = 'light';
  s0.types.push(makeType(10, '友情'));
  s0.rels.push(makeRel(20, 1, 2, 10));
  await seed(page, project([s0]));
  const tabs = page.getByTestId('sheet-tab');
  await page.getByTestId('sheet-add').click();
  await expect(tabs).toHaveText(['分頁1', '分頁2']);
  let p = await saved(page);
  await page.waitForTimeout(450);
  p = await saved(page);
  expect(p?.active).toBe(1);
  expect(p?.sheets[1]).toMatchObject({ W: 1200, chars: [], types: [] });
  expect(p?.sheets[1].settings.palette).toBe('light');
  await tabs.nth(1).dblclick();
  await page.getByTestId('sheet-rename-input').fill('第二章');
  await page.getByTestId('sheet-rename-input').press('Enter');
  await expect(tabs).toHaveText(['分頁1', '第二章']);
  /* 複製第一張（角色各自獨立） */
  await tabs.nth(0).click();
  await page.getByTestId('sheet-copy').click();
  await expect(tabs).toHaveText(['分頁1', '第二章', '分頁3']);
  await page.waitForTimeout(450);
  p = await saved(page);
  const copy = p?.sheets[2] as Sheet;
  expect(copy.chars.map((c) => c.name)).toEqual(['甲', '乙', '丙']);
  expect(copy.chars[0].id).not.toBe(p?.sheets[0].chars[0].id);
  expect(copy.rels[0].from).toBe(copy.chars[0].id);
  /* 選單：往左移 */
  await page.getByTestId('sheet-menu').nth(2).click();
  await page.getByRole('menuitem', { name: '往左移' }).click();
  await expect(tabs).toHaveText(['分頁1', '分頁3', '第二章']);
  /* 刪除＋復原 */
  await page.getByTestId('sheet-close').nth(2).click();
  await expect(tabs).toHaveText(['分頁1', '分頁3']);
  await expect(toast(page, '已刪除分頁「第二章」')).toBeVisible();
  await page.getByTestId('toast-action').click();
  await expect(tabs).toHaveText(['分頁1', '分頁3', '第二章']);
  /* 只剩一張時不能刪 */
  await page.getByTestId('sheet-close').nth(2).click();
  await page.getByTestId('sheet-close').nth(1).click();
  await expect(page.getByTestId('sheet-close')).toBeDisabled();
  expect(errors).toEqual([]);
});

/* ---------- 關係表、範例 ---------- */

test('貼上關係表：標題列、新角色與新關係類型、沿用既有的、寫法幾乎相同的提醒；複製關係表', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = trio();
  s0.types.push(makeType(10, 'Friend'));
  await seed(page, project([s0]));
  await page.getByTestId('open-paste').click();
  const dlg = page.getByRole('dialog', { name: '貼上關係表' });
  await dlg
    .getByTestId('paste-text')
    .fill(
      '來源\t目標\t關係\t備註\n甲\t小美\t喜歡\t從小認識\n小美\t甲\tＦｒｉｅｎｄ\n\t乙\t朋友\n乙\t丙\n',
    );
  await expect(dlg.getByTestId('paste-preview')).toHaveText(
    '將建立 3 條關係、1 位新角色、2 種新關係（沿用畫布上 3 位既有角色）（已略過 1 列：來源或目標是空的）（第 1 列看起來是標題，已略過）',
  );
  await expect(dlg).toContainText('「Friend」與「Ｆｒｉｅｎｄ」寫法幾乎相同');
  await dlg.getByTestId('paste-apply').click();
  await expect(toast(page, '已建立 3 條關係')).toBeVisible();
  const s = await sheet(page);
  expect(s.chars.map((c) => c.name)).toEqual(['甲', '乙', '丙', '小美']);
  expect(s.types.map((t) => t.label)).toEqual(['Friend', '喜歡', 'Ｆｒｉｅｎｄ']);
  const name = (id: number) => s.chars.find((c) => c.id === id)?.name;
  const tl = (id: number) => s.types.find((t) => t.id === id)?.label;
  expect(s.rels.map((r) => [name(r.from), name(r.to), tl(r.type), r.note])).toEqual([
    ['甲', '小美', '喜歡', '從小認識'],
    ['小美', '甲', 'Ｆｒｉｅｎｄ', ''],
    ['乙', '丙', 'Friend', ''],
  ]);
  /* 複製關係表 */
  await more(page, 'menu-copy-table');
  const cp = page.getByRole('dialog', { name: '複製關係表' });
  await expect(cp.getByTestId('copy-text')).toHaveValue(
    '來源\t目標\t關係\t備註\n甲\t小美\t喜歡\t從小認識\n小美\t甲\tＦｒｉｅｎｄ\t\n乙\t丙\tFriend\t',
  );
  await expect(cp).toContainText('共 3 列。');
  expect(errors).toEqual([]);
});

test('貼上關係表到空分頁：整批排成目前的陣型', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('open-paste').click();
  const dlg = page.getByRole('dialog', { name: '貼上關係表' });
  await dlg.getByTestId('paste-text').fill('A,B,友\nB,C\nC,D,敵');
  await dlg.getByTestId('paste-apply').click();
  const s = await sheet(page);
  expect(s.chars.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D']);
  expect(s.types.map((t) => t.label)).toEqual(['友', '敵']);
  expect(new Set(s.chars.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`)).size).toBe(4);
  expect(errors).toEqual([]);
});

test('分頁設定：畫布配色、關係名稱、間距重排；頭像的網址與貼上；自我關係的縮小頭貼拖曳', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = trio();
  s0.types.push(makeType(10, '友情'));
  s0.rels.push(makeRel(20, 1, 2, 10), makeRel(21, 3, 3, 10));
  await seed(page, project([s0]));
  /* 畫布配色：淺色 */
  await page.getByRole('radio', { name: '淺色' }).click();
  await expect(chart(page).locator('rect.layer-bg')).toHaveAttribute('fill', '#f5f5f5');
  /* 關係名稱 */
  await expect(chart(page).locator('.edge-lbl')).toHaveCount(0);
  await page.getByTestId('set-rel-name').getByRole('switch', { name: '關係名稱' }).click();
  /* 一般的線：標籤在最上層的 .edge-lbl；自我關係的標籤在自己的群組裡 */
  await expect(chart(page).locator('.edge-lbl')).toHaveCount(1);
  await expect(chart(page).locator('.edge-lbl text')).toHaveText('友情');
  await expect(chart(page).locator('.self-edge text', { hasText: '友情' })).toHaveCount(1);
  /* 間距：依目前的陣型（圓形）重排 */
  const spacing = page.getByRole('spinbutton', { name: '角色之間的間距（整體）' });
  await spacing.fill('150');
  await spacing.press('Enter');
  let s = await sheet(page);
  expect(s.settings.spacingPct).toBe(150);
  expect(s.chars.map((c) => [c.x, c.y])).not.toEqual([
    [250, 500],
    [750, 500],
    [500, 200],
  ]);
  /* 自我關係的縮小頭貼：拖曳＝繞著角色轉 */
  const mini = chart(page).locator('.self-mini');
  const m = await center(mini);
  const c3 = await nodeCenter(page, 3);
  await drag(page, m, { x: c3.x - 80, y: c3.y });
  s = await sheet(page);
  expect(Math.abs(Math.abs(s.rels.find((r) => r.id === 21)?.selfAng ?? 0) - Math.PI)).toBeLessThan(
    0.3,
  );
  /* 頭像：網址（對方允許跨站讀取） */
  await page.route('https://img.example/a.png', async (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: await solidPng([200, 0, 200, 255]),
    }),
  );
  await node(page, 2).dblclick();
  await page.getByTestId('avatar-url').click();
  await page.getByTestId('avatar-url-input').fill('ftp://nope');
  await page.getByTestId('avatar-url-input').press('Enter');
  await expect(page.getByTestId('char-panel')).toContainText('這不像是圖片網址');
  await page.getByTestId('avatar-url-input').fill('https://img.example/a.png');
  await page.getByTestId('avatar-url-input').press('Enter');
  await expect(node(page, 2).locator('image.av-img')).toHaveCount(1);
  /* 頭像：在面板裡貼上圖片 */
  await page.getByTestId('panel-close').click();
  await node(page, 1).dblclick();
  const png = (await solidPng([0, 0, 0, 255])).toString('base64');
  await page.getByTestId('char-name').evaluate((el, b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'p.png', { type: 'image/png' }));
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, png);
  await expect(node(page, 1).locator('image.av-img')).toHaveCount(1);
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出 PNG：畫布大小、去背與不去背的像素、檔名；多張分頁＝ZIP', async ({ page }) => {
  const errors = await open(page);
  const s0 = sample('story', 0, '本篇');
  s0.chars[0].color = '#ff0000';
  await seed(page, project([s0, sample('types', 1000, '屬性')]));
  const t = await runExport(page, 'PNG（圖片）', { transparent: true });
  expect(t.name).toBe('本篇_去背圖.png');
  const png = readPng(t.bytes);
  expect([png.width, png.height]).toEqual([1100, 900]);
  expect(png.at(5, 5)[3]).toBe(0);
  /* 主角（550, 430）的外框是紅色：圓的最上緣附近 */
  const ring = png.at(550, 430 - 46);
  expect(ring[0]).toBeGreaterThan(200);
  expect(ring[1]).toBeLessThan(80);
  const o = await runExport(page, 'PNG（圖片）', { transparent: false });
  expect(o.name).toBe('本篇.png');
  expect(readPng(o.bytes).at(5, 5)).toEqual([0x12, 0x12, 0x12, 255]);
  const z = await runExport(page, 'PNG（圖片）', { scope: '全部分頁' });
  expect(z.name).toBe('關係圖包.zip');
  const files = unzipSync(z.bytes);
  expect(Object.keys(files).sort()).toEqual(['屬性.png', '本篇.png']);
  expect([readPng(files['屬性.png']).width, readPng(files['屬性.png']).height]).toEqual([
    1000, 900,
  ]);
  expect(errors).toEqual([]);
});

test('匯出分層 SVG 與 PSD：圖層、內嵌圖片、圖示出處', async ({ page }) => {
  const errors = await open(page);
  const s0 = sample('story', 0, '本篇');
  s0.settings.bgMode = 'axis';
  await seed(page, project([s0]));
  const svg = await runExport(page, '分層 SVG');
  expect(svg.name).toBe('本篇.svg');
  const text = strFromU8(svg.bytes);
  const labels = [...text.matchAll(/inkscape:label="([^"]+)"/g)].map((m) => m[1]);
  expect(labels).toEqual(['背景', '輔助線', '關係線', '角色', '名稱', '圖例']);
  expect(text).toContain('<!-- 角色圖示改編自 Relationship Chart Maker');
  expect(text).toContain('width="1100" height="900" viewBox="0 0 1100 900"');
  const psd = await runExport(page, '分層 PSD');
  expect(psd.name).toBe('本篇.psd');
  expect(strFromU8(psd.bytes.subarray(0, 4))).toBe('8BPS');
  const doc = readPsd(psd.bytes, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  expect([doc.width, doc.height]).toEqual([1100, 900]);
  expect(doc.children?.map((l) => l.name)).toEqual([
    '背景',
    '輔助線',
    '關係線',
    '角色',
    '名稱',
    '圖例',
  ]);
  expect(errors).toEqual([]);
});

test('互動網頁：出處與授權、不連外部資源；點角色看關係與找路徑、點線、圖例、名冊搜尋、分頁籤', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  const s0 = sample('story', 0, '本篇');
  s0.chars[0].labels = [7];
  await seed(
    page,
    project([s0, sample('mind', 1000, '靈感')], { labels: [makeLabel(7, '主角群')] }),
  );
  const h = await runExport(page, '互動網頁（唯讀）', { scope: '全部分頁' });
  expect(h.name).toBe('角色關係圖_互動檢視.html');
  const html = strFromU8(h.bytes);
  expect(html).toContain('Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0）');
  expect(html).toContain('https://creativecommons.org/licenses/by-nc-sa/4.0/');
  expect(html).not.toMatch(/(src|href)="https?:/);
  /* 開來看（離線：擋掉所有網路要求） */
  const v = await context.newPage();
  const vErrors: string[] = [];
  v.on('pageerror', (e) => vErrors.push(e.message));
  v.on('console', (m) => m.type() === 'error' && vErrors.push(m.text()));
  let external = 0;
  await v.route('**/*', (r) => {
    if (r.request().url() === 'http://viewer.test/')
      return r.fulfill({ body: html, contentType: 'text/html' });
    external++;
    return r.abort();
  });
  await v.setViewportSize({ width: 1100, height: 800 });
  await v.goto('http://viewer.test/');
  await expect(v.locator('h1')).toHaveText('角色關係圖');
  await expect(v.locator('.tabV')).toHaveText(['本篇', '靈感']);
  const vnode = (id: number) => v.locator(`.sheetV.active .node[data-id="${id}"]`);
  /* 點角色（頭像的中心；圖示蓋在圓上，直接用滑鼠點） */
  const vclick = async (id: number) => {
    const c = await center(vnode(id).locator(':scope > circle'));
    await v.mouse.click(c.x, c.y);
  };
  await vclick(1);
  const tip = v.locator('#tipV');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('主角');
  await expect(tip).toContainText('戀愛');
  await expect(tip).toContainText('主角群');
  await expect(v.locator('.sheetV.active svg')).toHaveClass(/focus-active/);
  await expect(vnode(2)).toHaveClass(/focusedV/);
  await expect(vnode(6)).toHaveClass(/focusedV/);
  /* 找關係路徑：戀人 → 神秘人（經過主角兩步） */
  await vclick(2);
  await tip.getByRole('button', { name: /找關係路徑/ }).click();
  await expect(tip).toContainText('點另一位角色');
  await vclick(6);
  await expect(tip).toContainText('戀人 ⋯ 神秘人');
  await expect(tip).toContainText('2 步');
  /* 點圖例＝只看這種關係 */
  await v.locator('.sheetV.active .legend-item[data-legend-type="104"]').click();
  await expect(v.locator('.sheetV.active .legend-item[data-legend-type="104"]')).toHaveClass(
    /legend-on/,
  );
  await expect(vnode(5)).toHaveClass(/focusedV/);
  await expect(vnode(2)).not.toHaveClass(/focusedV/);
  /* 名冊搜尋 */
  await v.locator('#rvSearch').fill('導');
  await expect(v.locator('#rosterV .rv-item')).toHaveText(['導師1']);
  await v.locator('#rvSearch').press('Enter');
  await expect(vnode(5)).toHaveClass(/focusedV/);
  /* 分頁籤 */
  await v.locator('.tabV', { hasText: '靈感' }).click();
  await expect(v.locator('.sheetV.active .node')).toHaveCount(7);
  expect(external).toBe(0);
  expect(vErrors).toEqual([]);
  /* 預覽（對話框裡的同一份網頁） */
  await page.getByTestId('open-export').click();
  await page
    .getByRole('dialog', { name: '匯出' })
    .getByRole('radio', { name: '互動網頁（唯讀）' })
    .click();
  await page.getByTestId('export-preview').click();
  const frame = page.frameLocator('[data-testid="viewer-preview"]');
  await expect(frame.locator('h1')).toHaveText('本篇');
  expect(errors).toEqual([]);
});

/* ---------- 專案檔 ---------- */

test('專案檔：存成 ZIP（含圖片）、全部重設、開啟還原；Ctrl＋S', async ({ page }) => {
  const errors = await open(page);
  await page.clock.setFixedTime(new Date('2026-10-15T10:00:00+08:00'));
  const s0 = trio();
  s0.name = '本篇';
  await seed(page, project([s0]));
  await node(page, 1).dblclick();
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('avatar-upload').click(),
  ]);
  await fc.setFiles({
    name: 'a.png',
    mimeType: 'image/png',
    buffer: await solidPng([0, 200, 0, 255]),
  });
  await expect(node(page, 1).locator('image.av-img')).toHaveCount(1);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    openProjectItem(page, '存成專案檔…'),
  ]);
  expect(dl.suggestedFilename()).toBe('角色關係圖_20261015.zip');
  const zbytes = readFileSync((await dl.path()) as string);
  const files = unzipSync(new Uint8Array(zbytes));
  const pj = JSON.parse(strFromU8(files['project.json']));
  expect(pj).toMatchObject({ format: 'trpg-toolkit-project', tool: 'relation-chart', version: 5 });
  const av = pj.data.sheets[0].chars[0].avatar;
  expect(Object.keys(files)).toEqual(
    expect.arrayContaining([`files/${av.img}.png`, `files/${av.src}.png`]),
  );
  /* Ctrl＋S＝同一種檔 */
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+s'),
  ]);
  expect(dl2.suggestedFilename()).toBe('角色關係圖_20261015.zip');
  /* 全部重設 */
  await openProjectItem(page, '全部重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(chart(page).locator('.node')).toHaveCount(0);
  await expect(page.getByTestId('sheet-tab')).toHaveText(['分頁1']);
  /* 開啟 */
  const [fc2] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc2.setFiles({ name: 'p.zip', mimeType: 'application/zip', buffer: zbytes });
  const ok = page.getByRole('alertdialog');
  await expect(ok).toContainText('目前的設定會被「p.zip」取代');
  await ok.getByRole('button', { name: '開啟' }).click();
  await expect(page.getByTestId('sheet-tab')).toHaveText(['本篇']);
  await expect(node(page, 1).locator('image.av-img')).toHaveCount(1);
  expect(errors).toEqual([]);
});

/** 原作「匯出專案」的 ZIP（資料夾＋project.json＋images/） */
async function legacyZip(withImages = true): Promise<Buffer> {
  const data = {
    app: 'CharRelDiagram',
    format: 7,
    activeSheetIdx: 0,
    docFont: 'serif',
    labels: [{ id: 3, text: '學生' }],
    prefs: { light: false },
    library: [
      {
        id: 106,
        variants: [
          {
            id: 107,
            name: '主角',
            icon: 'star',
            image: 'images/lib_106_v107.png',
            imageSrc: 'images/lib_106_v107_src.png',
            crop: { zoom: 1.5, ox: 10, oy: -5 },
            labels: [3],
          },
        ],
      },
      { id: 110, variants: [{ id: 111, name: '配角', color: '#00ff00' }] },
    ],
    sheets: [
      {
        id: 2,
        name: '原作的分頁',
        W: 1100,
        H: 900,
        bgImage: 'images/bg_s2.png',
        relTypes: [
          { id: 101, label: '戀愛', color: '#e0607e', lineStyle: 'dashed', capStyle: 'heart' },
        ],
        settings: { legendPos: 'online' },
        chars: [
          { id: 1, libId: 106, varId: 107, x: 550, y: 430, level: 2 },
          { id: 2, libId: 110, varId: 111, x: 300, y: 300 },
        ],
        rels: [{ id: 11, from: 1, to: 2, relTypeId: 101, both: true, note: '青梅竹馬' }],
        notes: [{ id: 9, text: '便利貼' }],
      },
    ],
  };
  const tree: Record<string, Uint8Array> = {
    '專案/project.json': strToU8(JSON.stringify(data, null, 2)),
    '專案/README.txt': strToU8('readme'),
  };
  if (withImages) {
    tree['專案/images/lib_106_v107.png'] = new Uint8Array(
      await solidPng([255, 0, 0, 255], 256, 256),
    );
    tree['專案/images/lib_106_v107_src.png'] = new Uint8Array(
      await solidPng([0, 255, 0, 255], 400, 300),
    );
    tree['專案/images/bg_s2.png'] = new Uint8Array(await solidPng([0, 0, 255, 255], 300, 200));
  }
  return Buffer.from(zipSync(tree));
}

test('原作的專案檔：ZIP（頭像、原圖與位置、背景圖、標籤）、加入為新分頁、只有 project.json', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc.setFiles({ name: 'orig.zip', mimeType: 'application/zip', buffer: await legacyZip() });
  const choice = page.getByRole('alertdialog');
  await expect(choice).toContainText('檔案裡有 1 張分頁');
  await choice.getByRole('button', { name: '加入為新分頁' }).click();
  await expect(toast(page, '已讀入原作的專案：1 張分頁、2 位角色、1 條關係')).toBeVisible();
  /* 第四批起便利貼照樣讀進來，不再列在「沒有讀進來」裡 */
  await expect(toast(page, /便利貼/)).toHaveCount(0);
  await expect(page.getByTestId('sheet-tab')).toHaveText(['分頁1', '原作的分頁']);
  const p = await saved(page);
  await page.waitForTimeout(450);
  const q = (await saved(page)) ?? p;
  const s = q?.sheets[1] as Sheet;
  expect(q?.active).toBe(1);
  expect(s.chars.map((c) => [c.name, c.level, c.icon])).toEqual([
    ['主角', 2, 'star'],
    ['配角', 0, null],
  ]);
  expect(s.chars[0].avatar?.img).toBeTruthy();
  expect(s.chars[0].avatar?.src).toBeTruthy();
  expect(s.chars[0].avatar?.place?.zoom).toBeCloseTo(1.5);
  expect(s.chars[1].color).toBe('#00ff00');
  expect(s.bg).toBeTruthy();
  expect(s.notes.map((n) => n.text)).toEqual(['便利貼']);
  expect(s.settings.showRelName).toBe(true);
  expect(s.rels[0]).toMatchObject({ both: true, note: '青梅竹馬' });
  expect(q?.labels.map((l) => l.text)).toEqual(['學生']);
  expect(s.chars[0].labels).toEqual([q?.labels[0].id]);
  /* 加入為新分頁：文件字型不變（原作也一樣） */
  expect(q?.font).toBe('sans');
  await expect(node(page, s.chars[0].id).locator('image.av-img')).toHaveCount(1);
  await expect(chart(page).locator('image.canvas-bgimg')).toHaveCount(1);
  /* 只有 project.json：取代、提醒沒有圖片 */
  const json = strFromU8(unzipSync(new Uint8Array(await legacyZip(false)))['專案/project.json']);
  const [fc2] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc2.setFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  await page.getByRole('alertdialog').getByRole('button', { name: '取代目前內容' }).click();
  await expect(toast(page, /頭像與背景圖不在檔案裡/)).toBeVisible();
  await expect(page.getByTestId('sheet-tab')).toHaveText(['原作的分頁']);
  /* 取代：文件字型跟著原作的檔（明體） */
  await expect.poll(async () => (await saved(page))?.font).toBe('serif');
  await expect(chart(page).locator('svg')).toHaveAttribute('font-family', /Noto Serif TC/);
  /* 原作匯入的字型檔（f:…）不在檔案裡：改用黑體，通知裡寫出來（第三批起讀得進匯入的字型） */
  const [fc3] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc3.setFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json.replace('"docFont": "serif"', '"docFont": "f:abc123"')),
  });
  await page.getByRole('alertdialog').getByRole('button', { name: '取代目前內容' }).click();
  await expect(toast(page, /1 套匯入的字型的檔案不在檔案裡/).first()).toBeVisible();
  await expect.poll(async () => (await saved(page))?.font).toBe('sans');
  expect(errors).toEqual([]);
});

test('自動儲存與還原：重新整理後內容、分頁、設定都在；圖片存在資產庫', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('more-menu').click();
  await page.getByTestId('menu-samples').click();
  await page.getByTestId('sample-mind').click();
  await page.getByRole('radio', { name: '淺色' }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId('sheet-tab')).toHaveText(['分頁1', '範例：心智圖']);
  await expect(chart(page).locator('.node')).toHaveCount(7);
  expect((await sheet(page)).settings.palette).toBe('light');
  await expect(page.getByTestId('undo')).toBeDisabled();
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T10:00:00+08:00'));
  const errors = await open(page);
  const s0 = sample('story', 0, '本篇');
  s0.settings.showRelName = true;
  await seed(page, project([s0, sample('family', 1000)]));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('relation-chart-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await noHorizontalScroll(page);
  await page.getByTestId('zoom-fit').click();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('relation-chart-390.png', { fullPage: true });
  /* 打開編輯面板：面板緊接在畫布下面 */
  await node(page, 1).dblclick();
  await noHorizontalScroll(page);
  const canvasBox = await page.getByTestId('canvas').boundingBox();
  const panelBox = await page.getByTestId('inspector').boundingBox();
  const listBox = await page.getByTestId('char-list').boundingBox();
  expect(panelBox?.y ?? 0).toBeGreaterThan(canvasBox?.y ?? 0);
  expect(panelBox?.y ?? 0).toBeLessThan(listBox?.y ?? 0);
  expect(errors).toEqual([]);
});

/* ---------- 第二批：標籤與群體 ---------- */

/** 八位角色：甲（陣營框：1～3）、乙（4、5）、丙（沒有人用）；朋友、敵人 */
function zoned(): Project {
  const s = emptySheet(1, 1, { W: 1200, H: 900, name: '王國' });
  s.types.push(makeType(10, '朋友'), makeType(11, '敵人', { color: '#e0607e' }));
  const pos: [number, number][] = [
    [300, 300],
    [430, 300],
    [365, 420],
    [800, 300],
    [900, 420],
    [700, 700],
    [200, 750],
    [1000, 750],
  ];
  pos.forEach(([x, y], i) => {
    s.chars.push(
      makeChar(i + 1, `角色${i + 1}`, x, y, {
        defNo: i + 1,
        labels: i < 3 ? [1] : i < 5 ? [2] : [],
      }),
    );
  });
  s.rels.push(
    makeRel(100, 1, 2, 10),
    makeRel(101, 1, 4, 10),
    makeRel(102, 2, 6, 11),
    makeRel(103, 4, 5, 10),
  );
  return project([s], {
    labels: [
      makeLabel(1, '甲', { zone: true, color: '#3366ff' }),
      makeLabel(2, '乙', { color: '#e67e22' }),
      makeLabel(3, '丙'),
    ],
  });
}

const lib = (page: Page) => page.getByTestId('library');

/** 打開檔案庫並切到標籤庫（第三批起，檔案庫預設的頁籤是角色庫） */
async function openLabelLib(page: Page) {
  await page.getByTestId('library-open').click();
  await page.getByTestId('library').getByTestId('library-tab-labels').click();
}
const chip = (page: Page, id: number) =>
  lib(page).locator(`[data-testid="label-item"][data-label-id="${id}"]`).first();

test('標籤庫（檔案庫）：新增、同名沿用、未命名、依分頁分組、搜尋、三個開關與徽章、編輯模式、隱藏／陣營框／刪除模式、整組刪除、拖曳換順序、復原', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, zoned());
  await openLabelLib(page);
  await expect(lib(page)).toBeVisible();
  await expect(lib(page).getByTestId('library-tab-labels')).toHaveText('標籤庫');
  /* 依分頁分組（預設開）：這張分頁用到的、未使用 */
  const groups = lib(page).getByTestId('label-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText('王國');
  await expect(groups.nth(1)).toContainText('未使用');
  await expect(groups.nth(1).getByTestId('label-item')).toHaveText(['丙0']);
  /* 使用人數（詳細） */
  await expect(chip(page, 1).getByTestId('label-item-count')).toHaveText('3');
  /* 新增：Enter、同名沿用、未命名 */
  const input = lib(page).getByTestId('label-new');
  await input.fill('丁');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await input.fill('甲');
  await input.press('Enter');
  await page.waitForTimeout(450);
  expect((await saved(page))?.labels.map((l) => l.text)).toEqual(['甲', '乙', '丙', '丁']);
  await lib(page).getByTestId('library-act-add').click();
  await page.waitForTimeout(450);
  expect((await saved(page))?.labels.map((l) => l.text)).toEqual([
    '甲',
    '乙',
    '丙',
    '丁',
    '未命名標籤1',
  ]);
  /* 新增的那一個打開設定 */
  await expect(lib(page).getByTestId('label-detail')).toContainText('未命名標籤1');
  /* 搜尋 */
  await lib(page).getByTestId('library-search').fill('未命名');
  await expect(lib(page).getByTestId('label-item')).toHaveCount(1);
  await lib(page).getByTestId('library-search').fill('');
  /* 不分組 */
  await lib(page).getByTestId('library-group').click();
  await expect(groups).toHaveCount(1);
  await expect(lib(page).getByTestId('label-item')).toHaveCount(5);
  /* 點一下＝在左欄設定：隱藏 → 畫布上的陣營框不見、徽章出現；點徽章＝取消隱藏 */
  await chip(page, 1).click();
  const detail = lib(page).getByTestId('label-detail');
  await expect(detail).toContainText('甲');
  await expect(chart(page).locator('.zone-g[data-zone="1"]')).toHaveCount(1);
  await detail.getByRole('switch', { name: '隱藏' }).click();
  await expect(chart(page).locator('.zone-g')).toHaveCount(0);
  await expect(chip(page, 1).getByTestId('label-badge-hidden')).toBeVisible();
  await chip(page, 1).getByTestId('label-badge-hidden').click();
  await expect(chart(page).locator('.zone-g[data-zone="1"]')).toHaveCount(1);
  /* 引力關掉 → 徽章 */
  await page.waitForTimeout(450);
  await detail.getByRole('switch', { name: '引力' }).click();
  await expect(chip(page, 1).getByTestId('label-badge-noPull')).toBeVisible();
  /* 編輯模式：點標籤＝載入文字，Enter＝覆蓋 */
  await lib(page).getByTestId('library-act-edit').click();
  await expect(lib(page).getByTestId('label-hint')).toContainText('編輯模式');
  await chip(page, 2).click();
  await expect(input).toHaveValue('乙');
  await input.fill('乙組');
  await input.press('Enter');
  await page.waitForTimeout(450);
  expect((await saved(page))?.labels[1]).toMatchObject({ text: '乙組', color: '#e67e22' });
  /* 陣營框模式：點乙＝陣營框（畫布上多一個框）；再點＝取消 */
  await lib(page).getByTestId('library-act-zone').click();
  await chip(page, 2).click();
  await expect(chart(page).locator('.zone-g[data-zone="2"]')).toHaveCount(1);
  await expect(chip(page, 2).getByTestId('label-badge-zone')).toBeVisible();
  /* 隱藏模式 */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-hide').click();
  await chip(page, 3).click();
  await expect(chip(page, 3)).toHaveClass(/opacity-50/);
  /* 刪除模式：點＝刪除（從角色身上拿掉） */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-del').click();
  /* 新標籤的 id 不一定是 nextId（第三批起開頁時角色庫的條目也用掉 id）：用名稱找 */
  await lib(page).getByTestId('label-item').filter({ hasText: '丁' }).click();
  await expect(lib(page).getByTestId('label-item')).toHaveCount(4);
  /* 刪掉的原地留墓碑（版面不位移） */
  await expect(lib(page).getByTestId('label-ghost')).toHaveCount(1);
  /* 分組＋刪除模式：整組刪除（確認） */
  await lib(page).getByTestId('library-group').click();
  await lib(page).getByTestId('label-group-delete').last().click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('刪除「未使用」組的全部 2 個標籤？');
  await dlg.getByRole('button', { name: '刪除整組' }).click();
  await page.waitForTimeout(450);
  expect((await saved(page))?.labels.map((l) => l.text)).toEqual(['甲', '乙組']);
  await expect(lib(page).getByTestId('label-ghost')).toHaveCount(2);
  /* Esc＝結束模式（同原作的 Esc 鏈：建立關係 → 面板 → 聚焦 → 模式） */
  await page.locator('body').press('Escape');
  await expect(lib(page).getByTestId('library-act-del')).toHaveAttribute('aria-pressed', 'false');
  await expect(lib(page).getByTestId('label-ghost')).toHaveCount(0);
  /* 拖曳換順序（一般模式；同一組內） */
  await drag(page, await center(chip(page, 1)), await center(chip(page, 2)));
  await page.waitForTimeout(450);
  expect((await saved(page))?.labels.map((l) => l.text)).toEqual(['乙組', '甲']);
  /* 復原 */
  await page.getByTestId('undo').click();
  await page.waitForTimeout(450);
  expect((await saved(page))?.labels.map((l) => l.text)).toEqual(['甲', '乙組']);
  /* 收起 */
  await lib(page).getByTestId('library-close').click();
  await expect(lib(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('陣營框與收合：拖曳角色時框跟著（快速路徑）、名稱拖曳改方向、點名稱收合、聚合線、拖曳收合節點、點一下展開', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, zoned());
  const zone = chart(page).locator('.layer-zones .zone-g[data-zone="1"]');
  await expect(zone).toHaveAttribute('data-members', '1,2,3');
  await expect(zone.locator('text')).toHaveText('甲');
  /* 點名稱＝收合 */
  await chart(page).locator('.zone-colhot[data-zonecol="1"]').click();
  await expect(chart(page).locator('.colnode[data-collbl="1"]')).toBeVisible();
  await expect(chart(page).locator('.colnode[data-collbl="1"]')).toContainText('×3');
  for (const id of [1, 2, 3]) await expect(node(page, id)).toHaveCount(0);
  let s = await sheet(page);
  expect(s.collapsed).toEqual([1]);
  /* 聚合線：1→4（朋友）、2→6（敵人）；同組內的 1→2 不畫 */
  await expect(chart(page).locator('.col-edge')).toHaveCount(2);
  await expect(chart(page).locator('.edge[data-relid="100"]')).toHaveCount(0);
  await chart(page).locator('.col-edge[data-colkey="C4|L1|10"] line').last().click({ force: true });
  await expect(title(page)).toHaveText('聚合的關係線');
  await expect(page.getByTestId('coledge-rows')).toContainText('角色1');
  /* 拖曳收合節點＝整組搬移 */
  const g = await center(chart(page).locator('.colnode[data-collbl="1"] circle'));
  const before = (await sheet(page)).chars.slice(0, 3).map((c) => [c.x, c.y]);
  await drag(page, g, { x: g.x + 60, y: g.y + 40 });
  const after = (await sheet(page)).chars.slice(0, 3).map((c) => [c.x, c.y]);
  const dx = after[0][0] - before[0][0];
  expect(dx).toBeGreaterThan(30);
  for (let i = 0; i < 3; i++) expect(after[i][0] - before[i][0]).toBeCloseTo(dx, 5);
  /* 點一下＝展開；復原＝回到收合 */
  await chart(page).locator('.colnode[data-collbl="1"]').click();
  await expect(chart(page).locator('.colnode')).toHaveCount(0);
  await expect(node(page, 1)).toBeVisible();
  expect((await sheet(page)).collapsed).toEqual([]);
  await page.getByTestId('undo').click();
  await expect(chart(page).locator('.colnode[data-collbl="1"]')).toBeVisible();
  await chart(page).locator('.colnode[data-collbl="1"]').click();
  await expect(node(page, 1)).toBeVisible();
  /* 名稱拖曳＝改方向（存角度） */
  const h = await center(chart(page).locator('.zone-colhot[data-zonecol="1"]'));
  await drag(page, h, { x: h.x + 120, y: h.y + 80 });
  s = await sheet(page);
  expect(s.settings.zoneNameAng['1']).toBeGreaterThan(-1.5);
  expect(s.collapsed).toEqual([]);
  /* 拖曳角色：同一份 SVG，陣營框即時跟著 */
  const svg = chart(page).locator('svg.rc-chart:not(.rc-live-under)');
  await svg.evaluate((el) => el.setAttribute('data-mark', 'before'));
  const d0 = await zone.locator('path').first().getAttribute('d');
  const a = await nodeCenter(page, 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x - i * 4, a.y + i * 2);
  await page.waitForTimeout(100);
  await expect(svg).toHaveAttribute('data-mark', 'before');
  const zoneNow = page
    .getByTestId('chart')
    .locator('.layer-zones .zone-g[data-zone="1"] path')
    .first();
  expect(await zoneNow.getAttribute('d')).not.toBe(d0);
  await page.mouse.up();
  await expect(svg).not.toHaveAttribute('data-mark', 'before');
  expect(errors).toEqual([]);
});

test('標籤網與群體關係：拖曳標籤節點、點標籤聚焦、建立關係模式點標籤／陣營框＝群體關係、面板（算到每位成員、例外、刪除）、角色面板', async ({
  page,
}) => {
  const errors = await open(page);
  const p = zoned();
  p.sheets[0].settings.showLabelNodes = true;
  p.sheets[0].settings.showRelName = true;
  await seed(page, p);
  /* 乙是一般標籤＝圓點＋虛線；甲是陣營框（有成員）＝不畫圓點；丙沒有人用＝不畫 */
  await expect(chart(page).locator('.lbl-node[data-lblnode="2"]')).toBeVisible();
  await expect(chart(page).locator('.lbl-links[data-lbllink="2"] line')).toHaveCount(2);
  await expect(chart(page).locator('.lbl-node[data-lblnode="1"]')).toHaveCount(0);
  await expect(chart(page).locator('.lbl-node[data-lblnode="3"]')).toHaveCount(0);
  /* 拖曳＝存位置 */
  const ln = chart(page).locator('.lbl-node[data-lblnode="2"] circle');
  const l0 = await center(ln);
  await drag(page, l0, { x: l0.x + 50, y: l0.y + 60 });
  let s = await sheet(page);
  expect(s.settings.labelPos['2']).toBeTruthy();
  /* 點一下＝聚焦（成員亮） */
  await chart(page).locator('.lbl-node[data-lblnode="2"] circle').click();
  await expect(chart(page).locator('svg.rc-chart').first()).toHaveClass(/focus-active/);
  await expect(node(page, 4)).toHaveClass(/focusedV/);
  await expect(node(page, 1)).not.toHaveClass(/focusedV/);
  await chart(page).locator('.lbl-node[data-lblnode="2"] circle').click();
  /* 建立關係模式：點標籤節點＝端點（橫幅顯示標籤名） */
  await page.getByTestId('type-row').locator('span', { hasText: '敵人' }).click();
  const banner = page.getByTestId('link-banner');
  await chart(page).locator('.lbl-node[data-lblnode="2"] circle').click();
  await expect(banner.getByTestId('link-from-label')).toHaveText('乙');
  await node(page, 7).click();
  s = await sheet(page);
  expect(s.grels).toMatchObject([{ from: 'L2', to: 'C7', type: 11, both: false }]);
  await expect(chart(page).locator('.grel-edge')).toHaveCount(1);
  await expect(chart(page).locator('.grel-pill')).toContainText('敵人 ×2');
  /* 本輪建立的再點一次＝取消 */
  await node(page, 7).click();
  expect((await sheet(page)).grels).toEqual([]);
  /* 陣營框也是端點：換起點＝點陣營框（名稱上） */
  await chart(page).locator('.lbl-node[data-lblnode="2"] circle').click();
  await expect(banner).toContainText('點起點');
  await chart(page).locator('.zone-colhot[data-zonecol="1"]').click();
  await expect(banner.getByTestId('link-from-label')).toHaveText('甲');
  await node(page, 8).click();
  await page.getByTestId('link-end').click();
  s = await sheet(page);
  expect(s.grels.map((g) => [g.from, g.to])).toEqual([['L1', 'C8']]);
  /* 面板：點膠囊 */
  await chart(page).locator('.grel-pill').click();
  await expect(title(page)).toHaveText('群體關係');
  const panel = page.getByTestId('grel-panel');
  await expect(panel.getByTestId('grel-ends')).toHaveText('甲 → 角色8');
  await expect(panel.getByTestId('grel-counts')).toHaveText('成員 3 人');
  await panel.getByRole('switch', { name: '算到每位成員' }).click();
  await page.waitForTimeout(450);
  expect((await sheet(page)).grels[0].inherit).toBe(true);
  /* 角色面板（進階）：成員身分繼承的列（來自標籤：甲），排除＝例外 */
  await node(page, 2).dblclick();
  await page.getByRole('button', { name: '進階' }).click();
  const rows = page.getByTestId('char-grel-row');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('來自標籤：甲');
  await rows.getByTestId('char-grel-except').click();
  await page.waitForTimeout(450);
  expect((await sheet(page)).grels[0].except).toEqual([2]);
  await expect(chart(page).locator('.grel-pill')).toContainText('×2');
  /* 群體關係面板：清空例外、刪除（可以復原） */
  await chart(page).locator('.grel-pill').click();
  await page.getByTestId('grel-clear-except').click();
  await page.waitForTimeout(450);
  expect((await sheet(page)).grels[0].except).toEqual([]);
  await page.getByTestId('grel-delete').click();
  expect((await sheet(page)).grels).toEqual([]);
  await page.getByTestId('undo').click();
  expect((await sheet(page)).grels).toHaveLength(1);
  /* 刪除角色 8＝群體關係一起刪 */
  await node(page, 8).dblclick();
  await page.getByTestId('char-delete').click();
  expect((await sheet(page)).grels).toEqual([]);
  expect(errors).toEqual([]);
});

test('標籤與陣營框的顯示（每張分頁）、標籤圖例：開關與位置、圖例項目＝聚焦標籤；陣營框依標籤順序', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, zoned());
  await openLabelLib(page);
  await lib(page)
    .getByRole('button', { name: /標籤與陣營框的顯示/ })
    .click();
  const disp = lib(page).getByTestId('label-display');
  /* 陣營框總開關 */
  await disp.getByRole('switch', { name: '陣營框' }).click();
  await expect(chart(page).locator('.layer-zones')).toHaveCount(0);
  await page.waitForTimeout(450);
  await disp.getByRole('switch', { name: '陣營框' }).click();
  await expect(chart(page).locator('.layer-zones .zone-g')).toHaveCount(1);
  /* 依標籤順序＝不透明填色 */
  await disp.getByRole('radio', { name: '依標籤順序' }).click();
  await expect(chart(page).locator('.zone-g path').first()).not.toHaveAttribute(
    'fill-opacity',
    /./,
  );
  /* 標籤圖例：陣營框標籤列出；開著時框上不畫名稱 */
  await page.waitForTimeout(450);
  await disp.getByRole('switch', { name: '標籤圖例' }).click();
  const item = chart(page).locator('.lbl-legend .legend-item[data-legend-lbl="1"]');
  await expect(item).toBeVisible();
  await expect(chart(page).locator('.zone-g text')).toHaveCount(0);
  await item.click();
  await expect(item).toHaveClass(/legend-on/);
  await expect(node(page, 1)).toHaveClass(/focusedV/);
  await expect(node(page, 6)).not.toHaveClass(/focusedV/);
  /* 標籤網＋游離標籤：丙也畫（外圈、半透明） */
  await page.waitForTimeout(450);
  await disp.getByRole('switch', { name: '標籤網（標籤畫成節點）' }).click();
  await disp.getByRole('switch', { name: '也畫這張分頁沒用到的標籤' }).click();
  await expect(chart(page).locator('.lbl-node.lbl-free[data-lblnode="3"]')).toBeVisible();
  const s = await sheet(page);
  expect(s.settings).toMatchObject({
    showZones: true,
    zoneBlend: false,
    showLblLegend: true,
    showLabelNodes: true,
    showFreeLbls: true,
  });
  /* 新分頁沿用設定、各自的值 */
  await page.getByTestId('sheet-add').click();
  await disp.getByRole('switch', { name: '標籤圖例' }).click();
  await page.waitForTimeout(450);
  const q = await saved(page);
  expect(q?.sheets.map((x) => x.settings.showLblLegend)).toEqual([true, false]);
  expect(errors).toEqual([]);
});

test('匯出：分層 SVG 多一層陣營框、互動網頁（標籤網聚焦、陣營框跟著亮、角色卡的群體關係與隱藏標籤）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  const p = zoned();
  p.sheets[0].settings.showLabelNodes = true;
  p.sheets[0].grels.push({
    id: 300,
    from: 'L1',
    to: 'C6',
    type: 11,
    both: false,
    inherit: true,
    note: '',
    except: [],
  });
  p.labels[2].hidden = true;
  p.sheets[0].chars[0].labels = [1, 3];
  await seed(page, p);
  const svg = strFromU8((await runExport(page, '分層 SVG')).bytes);
  const layers = [...svg.matchAll(/inkscape:label="([^"]+)"/g)].map((m) => m[1]);
  expect(layers).toEqual(['背景', '陣營框', '關係線', '角色', '名稱', '圖例']);
  expect(svg).toContain('class="grel-edge"');
  expect(svg).not.toContain('zone-colhot');
  const h = await runExport(page, '互動網頁（唯讀）');
  const html = strFromU8(h.bytes);
  const v = await context.newPage();
  await v.route('**/*', (r) =>
    r.request().url() === 'http://viewer.test/'
      ? r.fulfill({ body: html, contentType: 'text/html' })
      : r.abort(),
  );
  await v.setViewportSize({ width: 1100, height: 800 });
  await v.goto('http://viewer.test/');
  const c = v.locator('.sheetV.active svg');
  /* 點標籤節點＝聚焦成員 */
  const lc = await center(v.locator('.lbl-node[data-lblnode="2"] circle'));
  await v.mouse.click(lc.x, lc.y);
  await expect(c).toHaveClass(/focus-active/);
  await expect(v.locator('.node[data-id="4"]')).toHaveClass(/focusedV/);
  await expect(v.locator('.lbl-node[data-lblnode="2"]')).toHaveClass(/focusedV/);
  /* 點角色＝他的陣營框亮；角色卡：群體關係、隱藏的標籤（預設列出） */
  const nc = await center(v.locator('.node[data-id="1"] > circle').first());
  await v.mouse.click(nc.x, nc.y);
  await expect(v.locator('.zone-g[data-zone="1"]')).toHaveClass(/focusedV/);
  const tip = v.locator('#tipV');
  await expect(tip).toContainText('敵人');
  await expect(tip).toContainText('角色6');
  await expect(tip.locator('.tl')).toHaveText(['甲', '丙']);
  /* 繼承來的群體關係寫「來自標籤：甲」（F093e，照原作） */
  await expect(tip).toContainText('來自標籤：甲');
  await v.keyboard.press('Escape');
  /* 找關係路徑也走群體關係（算到每位成員的）：角色3 只靠群體關係（經由甲）連到角色6 */
  const n3 = await center(v.locator('.node[data-id="3"] > circle').first());
  await v.mouse.click(n3.x, n3.y);
  await tip.locator('.ti-btn[data-path]').click();
  const n6 = await center(v.locator('.node[data-id="6"] > circle').first());
  await v.mouse.click(n6.x, n6.y);
  await expect(tip).toContainText('1 步');
  await expect(tip).toContainText('來自標籤：甲');
  await v.close();
  /* 關掉「網頁也顯示隱藏標籤」 */
  await openLabelLib(page);
  await lib(page)
    .getByRole('button', { name: /標籤與陣營框的顯示/ })
    .click();
  await lib(page).getByRole('switch', { name: '匯出的網頁也顯示隱藏標籤' }).click();
  const html2 = strFromU8((await runExport(page, '互動網頁（唯讀）')).bytes);
  expect(html2).not.toContain('"丙"');
  expect(errors).toEqual([]);
});

test('互動網頁：只有群體關係（沒有一般的關係線）時也有「找關係路徑」，路徑經由群體關係', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  const s = emptySheet(1, 1);
  s.chars.push(
    makeChar(1, '阿一', 300, 400, { defNo: 1, labels: [1] }),
    makeChar(2, '阿二', 300, 600, { defNo: 2, labels: [1] }),
    makeChar(3, '阿三', 700, 500, { defNo: 3 }),
  );
  s.types.push(makeType(10, '同盟'));
  s.grels.push({
    id: 20,
    from: 'L1',
    to: 'C3',
    type: 10,
    both: false,
    inherit: true,
    note: '',
    except: [],
  });
  await seed(page, project([s], { labels: [makeLabel(1, '左陣營')] }));
  const html = strFromU8((await runExport(page, '互動網頁（唯讀）')).bytes);
  const v = await context.newPage();
  await v.route('**/*', (r) =>
    r.request().url() === 'http://viewer.test/'
      ? r.fulfill({ body: html, contentType: 'text/html' })
      : r.abort(),
  );
  await v.setViewportSize({ width: 1100, height: 800 });
  await v.goto('http://viewer.test/');
  const tip = v.locator('#tipV');
  const n1 = await center(v.locator('.node[data-id="1"] > circle').first());
  await v.mouse.click(n1.x, n1.y);
  await expect(tip).toContainText('來自標籤：左陣營');
  await tip.locator('.ti-btn[data-path]').click();
  const n3 = await center(v.locator('.node[data-id="3"] > circle').first());
  await v.mouse.click(n3.x, n3.y);
  await expect(tip).toContainText('1 步');
  await expect(tip).toContainText('同盟');
  await v.close();
  expect(errors).toEqual([]);
});

test('檔案庫的左右比例：右欄至少留 220 px（夾限扣掉分隔線）；游標換算成畫布座標沒有偏差（陣營名稱的角度）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, zoned());
  await page.getByTestId('library-open').click();
  const div = await page.getByTestId('library-divider').boundingBox();
  if (!div) throw new Error('看不到分隔線');
  await page.mouse.move(div.x + div.width / 2, div.y + div.height / 2);
  await page.mouse.down();
  await page.mouse.move(1279, div.y + div.height / 2, { steps: 6 });
  await page.mouse.up();
  const listW = await page
    .getByTestId('library-divider')
    .evaluate((el) => (el.nextElementSibling as HTMLElement).getBoundingClientRect().width);
  expect(listW).toBeGreaterThanOrEqual(220);
  await page.getByTestId('library-close').click();
  /* 名稱拖到畫布上精準的一點：角度＝質心到那一點的 atan2（游標換算差 1 px 時會偏 0.008 rad） */
  const st = await sheet(page);
  const mem = st.chars.filter((c) => c.labels.includes(1));
  const cx = mem.reduce((a, c) => a + c.x, 0) / mem.length;
  const cy = mem.reduce((a, c) => a + c.y, 0) / mem.length;
  for (const [tx, ty] of [
    [cx - 150, cy - 120],
    [cx + 150, cy + 30],
  ]) {
    const h = await center(chart(page).locator('.zone-colhot[data-zonecol="1"]'));
    const to = await chart(page)
      .locator('svg.rc-chart:not(.rc-live-under) .canvas-content')
      .evaluate(
        (g, [x, y]) => {
          const p = new DOMPoint(x, y).matrixTransform(
            (g as SVGGraphicsElement).getScreenCTM() as DOMMatrix,
          );
          return { x: p.x, y: p.y };
        },
        [tx, ty],
      );
    await drag(page, h, to);
    const a = (await sheet(page)).settings.zoneNameAng['1'];
    expect(Math.abs(a - Math.atan2(ty - cy, tx - cx))).toBeLessThan(0.002);
  }
  expect(errors).toEqual([]);
});

test('原作的專案檔：標籤的顏色與開關、陣營框設定、群體關係、收合狀態都讀進來', async ({ page }) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  const data = {
    app: 'CharRelDiagram',
    format: 7,
    lblLegendPos: 'leftOut',
    labels: [
      { id: 3, text: '學生會', color: '#2980b9', zone: true },
      { id: 4, text: '社團', hidden: true },
    ],
    library: [
      { id: 106, variants: [{ id: 107, name: '會長', labels: [3] }] },
      { id: 110, variants: [{ id: 111, name: '副會長', labels: [3, 4] }] },
      { id: 112, variants: [{ id: 113, name: '外人' }] },
    ],
    sheets: [
      {
        id: 2,
        name: '學校',
        W: 1000,
        H: 800,
        relTypes: [{ id: 101, label: '對立' }],
        settings: { zoneThick: 8, showLblLegend: true },
        chars: [
          { id: 1, libId: 106, varId: 107, x: 300, y: 300 },
          { id: 2, libId: 110, varId: 111, x: 420, y: 330 },
          { id: 3, libId: 112, varId: 113, x: 800, y: 600 },
        ],
        rels: [],
        collapsedLbls: [3],
        groupRels: [{ id: 50, from: 'L3', to: 'C3', relTypeId: 101, inherit: true }],
      },
    ],
  };
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc.setFiles({
    name: 'project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('alertdialog').getByRole('button', { name: '取代目前內容' }).click();
  await expect(toast(page, /已讀入原作的專案/)).toBeVisible();
  await expect(toast(page, /群體關係|陣營框/)).toHaveCount(0);
  const q = await saved(page);
  await page.waitForTimeout(450);
  const p = (await saved(page)) ?? q;
  expect(p?.labels.map((l) => [l.text, l.color, l.zone, l.hidden])).toEqual([
    ['學生會', '#2980b9', true, false],
    ['社團', 'auto', false, true],
  ]);
  const s = p?.sheets[0] as Sheet;
  const lid = p?.labels[0].id as number;
  expect(s.collapsed).toEqual([lid]);
  expect(s.settings).toMatchObject({ zoneThick: 8, showLblLegend: true, lblLegendPos: 'leftOut' });
  expect(s.grels).toMatchObject([{ from: `L${lid}`, to: `C${s.chars[2].id}`, inherit: true }]);
  await expect(chart(page).locator(`.colnode[data-collbl="${lid}"]`)).toBeVisible();
  await expect(chart(page).locator('.grel-edge')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('120 位＋6 個陣營框：拖曳仍走快速路徑（同一份 SVG、陣營框跟著），每次移動夠快', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = emptySheet(1, 1, { W: 2400, H: 1800 });
  s0.types.push(makeType(10, '友情'));
  for (let i = 0; i < 120; i++)
    s0.chars.push(
      makeChar(i + 1, `角色${i + 1}`, 140 + (i % 12) * 190, 140 + Math.floor(i / 12) * 170, {
        defNo: i + 1,
        labels: [1 + (Math.floor(i / 12) % 6)],
      }),
    );
  for (let i = 1; i < 120; i++) s0.rels.push(makeRel(1000 + i, i, i + 1, 10));
  await seed(
    page,
    project([s0], {
      labels: [1, 2, 3, 4, 5, 6].map((i) => makeLabel(i, `陣營${i}`, { zone: true })),
    }),
  );
  await expect(chart(page).locator('.zone-g')).toHaveCount(6);
  const svg = chart(page).locator('svg.rc-chart:not(.rc-live-under)');
  await svg.evaluate((el) => el.setAttribute('data-mark', 'before'));
  const a = await nodeCenter(page, 30);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const t0 = Date.now();
  for (let i = 1; i <= 30; i++) await page.mouse.move(a.x + i * 2, a.y + i);
  const perMove = (Date.now() - t0) / 30;
  await page.waitForTimeout(100);
  await expect(svg).toHaveAttribute('data-mark', 'before');
  await expect(chart(page).locator('.zone-g')).toHaveCount(6);
  await page.mouse.up();
  await expect(svg).not.toHaveAttribute('data-mark', 'before');
  expect(perMove).toBeLessThan(100);
  expect(errors).toEqual([]);
});

test('390 寬：檔案庫蓋滿畫面、沒有橫向捲動、可以新增標籤與收起', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await seed(page, zoned());
  await openLabelLib(page);
  const box = await lib(page).boundingBox();
  expect(box?.width).toBeGreaterThan(380);
  await noHorizontalScroll(page);
  await lib(page).getByTestId('label-new').fill('新標籤');
  await lib(page).getByTestId('label-new').press('Enter');
  await expect(lib(page).getByTestId('label-item').filter({ hasText: '新標籤' })).toHaveCount(1);
  await lib(page).getByTestId('library-close').click();
  await expect(lib(page)).toBeHidden();
  expect(errors).toEqual([]);
});

/* ---------- 第三批：角色與關係的資料 ---------- */

/** 等自動儲存，取整個專案 */
async function data(page: Page): Promise<Project> {
  await page.waitForTimeout(450);
  const p = await saved(page);
  if (!p) throw new Error('還沒有自動儲存');
  return p;
}

const entryOf = (p: Project, lib: number) => p.library.find((e) => e.id === lib);

/** 打開角色的編輯面板＋進階 */
async function editChar(page: Page, id: number, advanced = true) {
  await node(page, id).dblclick();
  await expect(title(page)).toHaveText('編輯角色');
  if (advanced) await page.getByRole('button', { name: '進階' }).click();
}

async function clickAt(page: Page, p: { x: number; y: number }) {
  await page.mouse.click(p.x, p.y);
}

async function pickOption(page: Page, trigger: Locator, name: string | RegExp) {
  await trigger.click();
  await page
    .getByRole('option', typeof name === 'string' ? { name, exact: true } : { name })
    .click();
}

test('角色庫與變體：衣櫃（新增、換穿、名字跟著變體）、統一顏色、複製分頁＝同一批人、複製成獨立的新角色、跨分頁刪除一步復原', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await editChar(page, 1);
  const vsel = page.getByTestId('char-variant');
  await expect(vsel).toContainText('甲');
  /* 新增變體＝複製目前這件、名字加「（變體）」、立刻換穿 */
  await pickOption(page, vsel, '＋ 新增變體（複製目前外觀）');
  await expect(vsel).toContainText('甲（變體）');
  let p = await data(page);
  const c1 = p.sheets[0].chars[0];
  expect(c1.name).toBe('甲（變體）');
  expect(entryOf(p, c1.lib)?.variants.map((v) => v.name)).toEqual(['甲', '甲（變體）']);
  /* 換回第一件：名字跟著變體 */
  await pickOption(page, vsel, '甲');
  await expect(node(page, 1).locator('.node-name text')).toHaveText('甲');
  /* 統一顏色：打開＝用目前這件的顏色蓋過全部 */
  await page.waitForTimeout(450);
  await page.getByTestId('char-unify').getByRole('switch').click();
  p = await data(page);
  expect(entryOf(p, c1.lib)?.unified).toBe(true);
  /* 複製分頁＝同一批人：改名兩邊一起變 */
  await page.waitForTimeout(450);
  await page.getByTestId('sheet-copy').click();
  await expect(page.getByTestId('sheet-tab')).toHaveCount(2);
  p = await data(page);
  expect(p.sheets[1].chars.map((c) => c.lib)).toEqual(p.sheets[0].chars.map((c) => c.lib));
  const twin = p.sheets[1].chars[1];
  await node(page, twin.id).dblclick();
  await page.getByTestId('char-name').fill('乙改');
  await page.getByTestId('char-name').blur();
  p = await data(page);
  expect(p.sheets[0].chars[1].name).toBe('乙改');
  /* 分頁選單「複製成獨立的新角色」：每位都是新條目 */
  await page.getByTestId('sheet-menu').nth(1).click();
  await page.getByTestId('sheet-copy-fork').click();
  await expect(page.getByTestId('sheet-tab')).toHaveCount(3);
  p = await data(page);
  const libs0 = new Set(p.sheets[0].chars.map((c) => c.lib));
  expect(p.sheets[2].chars.every((c) => !libs0.has(c.lib))).toBe(true);
  expect(p.sheets[2].chars.map((c) => c.name)).toEqual(p.sheets[1].chars.map((c) => c.name));
  /* 角色庫：刪除模式點「乙改」＝所有分頁的乙改與他的關係一起刪；復原一步回來（原作的復原會遺失其他分頁） */
  await page.waitForTimeout(450);
  await page.getByTestId('library-open').click();
  await expect(lib(page).getByTestId('library-tab-chars')).toHaveAttribute('aria-selected', 'true');
  await lib(page).getByTestId('library-act-del').click();
  await lib(page).getByTestId('lib-entry').filter({ hasText: '乙改' }).first().click();
  await expect(lib(page).getByTestId('lib-ghost').first()).toBeVisible();
  p = await data(page);
  expect(p.sheets.map((s) => s.chars.length)).toEqual([2, 2, 3]);
  await page.getByTestId('undo').click();
  p = await data(page);
  expect(p.sheets.map((s) => s.chars.length)).toEqual([3, 3, 3]);
  expect(errors).toEqual([]);
});

test('角色庫：匯入當前分頁（主要變體與指定的變體）、複製模式照抄、只看未使用、依分頁分組、改變體名稱、用標籤篩選', async ({
  page,
}) => {
  const errors = await open(page);
  const s = trio();
  s.chars[0].labels = [7];
  const s2 = emptySheet(2, 2);
  s2.name = '第二張';
  s2.chars.push(makeChar(11, '丁', 500, 500, { defNo: 4 }));
  await seed(page, project([s, s2], { labels: [makeLabel(7, '學生')] }));
  await page.getByTestId('library-open').click();
  /* 依分頁分組（預設開）：分頁1、第二張 */
  await expect(lib(page).getByTestId('lib-group')).toHaveCount(2);
  await expect(lib(page).getByTestId('lib-group').nth(1)).toContainText('第二張');
  /* 點一列＝左欄看詳情；新增變體（複製主要外觀）、改名 */
  await lib(page).getByTestId('lib-entry').filter({ hasText: '丁' }).click();
  const detail = lib(page).getByTestId('lib-detail');
  await detail.getByTestId('lib-add-variant').click();
  await expect(detail.getByTestId('lib-variant')).toHaveCount(2);
  await detail.getByTestId('lib-variant-name').nth(1).click();
  await page.getByTestId('var-name').fill('丁（夏裝）');
  await page.getByTestId('var-name-ok').click();
  await expect(detail.getByTestId('lib-variant-name').nth(1)).toHaveText('丁（夏裝）');
  /* 只看未使用：丁的第二件沒人用 */
  await lib(page).getByRole('switch', { name: '只看未使用的變體' }).click();
  await expect(lib(page).getByTestId('lib-entry')).toHaveCount(1);
  await lib(page).getByRole('switch', { name: '只看未使用的變體' }).click();
  /* 「＋」＝這一件加到目前分頁（分頁1） */
  await page.waitForTimeout(450);
  await detail.getByTestId('lib-variant-add').nth(1).click();
  let p = await data(page);
  expect(p.sheets[0].chars.map((c) => c.name)).toEqual(['甲', '乙', '丙', '丁（夏裝）']);
  /* 匯入模式：點條目＝加主要變體（可以連續加） */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-import').click();
  await lib(page).getByTestId('lib-entry').filter({ hasText: '丙' }).first().click();
  p = await data(page);
  expect(p.sheets[0].chars.filter((c) => c.name === '丙')).toHaveLength(2);
  /* 複製模式：條目＝新的人（照抄，插在後面） */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-copy').click();
  const n0 = p.library.length;
  await lib(page).getByTestId('lib-entry').filter({ hasText: '甲' }).first().click();
  p = await data(page);
  expect(p.library).toHaveLength(n0 + 1);
  expect(p.library.map((e) => e.variants[0].name)).toContain('甲（變體）');
  await lib(page).getByTestId('library-act-copy').click();
  /* 用標籤篩選：跳到標籤庫挑「學生」，回來只列有那個標籤的 */
  await lib(page).getByTestId('lib-label-filter').click();
  await expect(lib(page).getByTestId('library-tab-labels')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await lib(page).getByTestId('label-item').filter({ hasText: '學生' }).click();
  await expect(lib(page).getByTestId('library-tab-chars')).toHaveAttribute('aria-selected', 'true');
  await expect(lib(page).getByTestId('lib-entry')).toHaveCount(2);
  await expect(lib(page).getByTestId('lib-label-filter')).toContainText('只列標籤「學生」');
  expect(errors).toEqual([]);
});

test('角色庫、關係庫：匯入／複製／刪除模式中保留選取與左欄詳情，點變體＝對那一件動作（7.8）', async ({
  page,
}) => {
  const errors = await open(page);
  const s = trio();
  s.types.push(makeType(10, '友情'));
  s.rels.push(makeRel(20, 1, 2, 10));
  await seed(page, project([s]));
  await page.getByTestId('library-open').click();
  await lib(page).getByTestId('lib-entry').filter({ hasText: '甲' }).first().click();
  const detail = lib(page).getByTestId('lib-detail');
  await detail.getByTestId('lib-add-variant').click();
  await expect(detail.getByTestId('lib-variant')).toHaveCount(2);
  let p = await data(page);
  const lid = p.sheets[0].chars[0].lib;
  const vars = () => (p.library.find((e) => e.id === lid)?.variants ?? []).map((v) => v.id);
  /* 複製模式：詳情還在；點第二件＝複製那一件（插在它後面） */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-copy').click();
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('lib-variant')).toHaveCount(2);
  await detail.getByTestId('lib-variant-name').nth(1).click();
  await expect(detail.getByTestId('lib-variant')).toHaveCount(3);
  p = await data(page);
  const third = vars()[2];
  /* 匯入模式：點第三件＝把那一件加到目前分頁 */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-import').click();
  await expect(detail).toBeVisible();
  await detail.getByTestId('lib-variant-name').nth(2).click();
  p = await data(page);
  expect(p.sheets[0].chars.map((c) => c.vari)).toContain(third);
  /* 刪除模式：點第三件＝刪掉那一件（穿著它的角色換回第一件） */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-del').click();
  await expect(detail).toBeVisible();
  await detail.getByTestId('lib-variant-name').nth(2).click();
  await expect(detail.getByTestId('lib-variant')).toHaveCount(2);
  p = await data(page);
  expect(vars()).not.toContain(third);
  /* 關係庫：同樣保留詳情，複製、刪除變體 */
  await lib(page).getByTestId('library-tab-rels').click();
  await lib(page).getByTestId('lib-entry').first().click();
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-copy').click();
  await expect(detail).toBeVisible();
  await detail.getByTestId('lib-variant-name').first().click();
  await expect(detail.getByTestId('lib-variant')).toHaveCount(2);
  p = await data(page);
  expect(p.relLibrary[0].variants.map((v) => v.label)).toEqual(['友情', '友情（變體）']);
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-del').click();
  await detail.getByTestId('lib-variant-name').nth(1).click();
  await expect(detail.getByTestId('lib-variant')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('關係庫：改了分頁上的關係類型就同步到其他分頁穿同一件的（一步復原）、加入本分頁不重複、改變體名稱', async ({
  page,
}) => {
  const errors = await open(page);
  const s = trio();
  s.types.push(makeType(10, '友情'));
  s.rels.push(makeRel(20, 1, 2, 10));
  await seed(page, project([s]));
  await page.getByTestId('sheet-copy').click();
  await page.waitForTimeout(450);
  let p = await data(page);
  expect(p.sheets[1].types[0].lib).toBe(p.sheets[0].types[0].lib);
  /* 第二張分頁改關係類型的名稱 → 第一張跟著變 */
  await page.getByTestId('type-edit').first().click();
  await page.getByTestId('type-name').fill('摯友');
  await page.getByTestId('type-name').blur();
  p = await data(page);
  expect(p.sheets.map((x) => x.types[0].label)).toEqual(['摯友', '摯友']);
  expect(p.relLibrary.find((e) => e.id === p.sheets[0].types[0].lib)?.variants[0].label).toBe(
    '摯友',
  );
  /* 一步復原：兩張分頁與關係庫一起回去（原作只回目前分頁） */
  await page.getByTestId('undo').click();
  p = await data(page);
  expect(p.sheets.map((x) => x.types[0].label)).toEqual(['友情', '友情']);
  /* 關係庫：同一件已經在這張分頁＝不重複加；新增變體後可以加 */
  await page.getByTestId('library-open').click();
  await lib(page).getByTestId('library-tab-rels').click();
  await lib(page).getByTestId('lib-entry').first().click();
  const detail = lib(page).getByTestId('lib-detail');
  await detail.getByTestId('lib-variant-add').first().click();
  await expect(toast(page, '這件已經在這張分頁了。')).toBeVisible();
  await page.waitForTimeout(450);
  await detail.getByTestId('lib-add-variant').click();
  await page.waitForTimeout(450);
  await detail.getByTestId('lib-variant-name').nth(1).click();
  await page.getByTestId('var-name').fill('友情（表面）');
  await page.getByTestId('var-name-ok').click();
  await detail.getByTestId('lib-variant-add').nth(1).click();
  p = await data(page);
  expect(p.sheets[p.active].types.map((t) => t.label)).toEqual(['友情', '友情（表面）']);
  expect(errors).toEqual([]);
});

test('連線總表：排序、只看某一種、點列編輯、直接換關係（重複擋下）、新增（重複擋下、自我關係）、批次改關係（略過重複）、刪除勾選與刪除模式', async ({
  page,
}) => {
  const errors = await open(page);
  const s = trio();
  s.types.push(makeType(10, '友情'), makeType(11, '敵對'));
  s.rels.push(makeRel(20, 1, 2, 10), makeRel(21, 3, 1, 11), makeRel(22, 2, 3, 10));
  await seed(page, project([s]));
  await page.getByTestId('library-open').click();
  await lib(page).getByTestId('library-tab-table').click();
  const rows = lib(page).getByTestId('reltable-row');
  await expect(rows).toHaveCount(3);
  await expect(lib(page).getByTestId('reltable-count')).toHaveText('共 3 條');
  /* 排序：來源 ▲（預設）→ 再點＝反向 */
  const order = async () =>
    rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-rel-id')));
  const asc = await order();
  await lib(page).getByTestId('reltable-sort-from').click();
  expect(await order()).toEqual([...asc].reverse());
  /* 只看「敵對」 */
  await pickOption(page, lib(page).getByTestId('reltable-filter'), '敵對');
  await expect(rows).toHaveCount(1);
  await pickOption(page, lib(page).getByTestId('reltable-filter'), '全部關係');
  /* 點列＝打開那條關係的編輯面板 */
  await lib(page)
    .locator('[data-testid="reltable-row"][data-rel-id="20"] .text-sm')
    .first()
    .click();
  await expect(title(page)).toHaveText('編輯關係');
  /* 新增：重複擋下、自我關係允許（雙向一律關） */
  await lib(page).getByTestId('reltable-add-toggle').click();
  await lib(page).getByTestId('reltable-add-go').click();
  await expect(toast(page, '關係已存在')).toBeVisible();
  await pickOption(page, lib(page).getByTestId('reltable-add-to'), '甲');
  await page.waitForTimeout(450);
  await lib(page).getByTestId('reltable-add-go').click();
  let sh = await sheet(page);
  expect(sh.rels.find((r) => r.from === 1 && r.to === 1)).toMatchObject({ both: false });
  /* 批次改關係：全選 → 改成「敵對」：3→1 已經是、1→1 換成敵對、略過會重複的 */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('reltable-check-all').getByRole('checkbox').click();
  await pickOption(page, lib(page).getByTestId('reltable-retag-type'), '敵對');
  await lib(page).getByTestId('reltable-retag').click();
  sh = await sheet(page);
  expect(sh.rels.every((r) => r.type === 11)).toBe(true);
  /* 刪除勾選的 */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('reltable-del-checked').click();
  await expect(rows).toHaveCount(0);
  await page.getByTestId('undo').click();
  await expect(rows).toHaveCount(4);
  /* 刪除模式：點列即刪、留墓碑；指示字樣是連線總表的 */
  await page.waitForTimeout(450);
  await lib(page).getByTestId('library-act-del').click();
  await expect(lib(page).getByTestId('lib-hint')).toContainText('點關係列即刪除該關係');
  /* 點列（名字；中間的下拉與勾選框不算） */
  await lib(page)
    .locator('[data-testid="reltable-row"][data-rel-id="22"] .text-sm')
    .first()
    .click();
  await expect(lib(page).getByTestId('reltable-ghost')).toHaveCount(1);
  sh = await sheet(page);
  expect(sh.rels.map((r) => r.id)).not.toContain(22);
  expect(errors).toEqual([]);
});

test('角色資訊、看法、角色卡：富文本（工具列、一段編輯一步復原、同一人跨分頁共用）、看法氣泡（點擊聚焦）、複製角色卡', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  const s = trio();
  s.types.push(makeType(10, '友情'));
  s.rels.push(makeRel(20, 1, 2, 10));
  await seed(page, project([s]));
  await editChar(page, 1);
  /* 角色資訊 */
  await page.getByTestId('char-info').click();
  await expect(title(page)).toHaveText('角色資訊');
  const ed = page.getByTestId('info-editor');
  await ed.click();
  await page.keyboard.type('背景故事');
  await page.keyboard.press('Control+a');
  await page.getByTestId('rich-bold').click();
  await page.getByTestId('info-back').click();
  let p = await data(page);
  const info = p.library.find((e) => e.id === p.sheets[0].chars[0].lib)?.info ?? '';
  expect(info).toMatch(/<(b|strong)>背景故事<\/(b|strong)>|font-weight/);
  /* 一段編輯＝一步復原 */
  await page.getByTestId('undo').click();
  p = await data(page);
  expect(p.library.find((e) => e.id === p.sheets[0].chars[0].lib)?.info).toBe('');
  await page.getByTestId('redo').click();
  /* 看法：選對象 → 一句話（離開才寫入） */
  await editChar(page, 2, false);
  await pickOption(page, page.getByTestId('view-add'), '甲');
  await page.getByTestId('view-input').fill('可靠的夥伴');
  await page.getByTestId('view-input').press('Enter');
  const sh = await sheet(page);
  expect(sh.views['2']).toEqual({ '1': '可靠的夥伴' });
  /* 點擊聚焦甲：乙頭上浮看法氣泡（滑過不出） */
  await page.getByTestId('panel-close').click();
  const c1 = await nodeCenter(page, 1);
  await page.mouse.click(c1.x, c1.y);
  await expect(node(page, 2).locator('.view-bubble')).toContainText('可靠的夥伴');
  await page.keyboard.press('Escape');
  await expect(chart(page).locator('.view-bubble')).toHaveCount(0);
  /* 角色卡：複製成純文字 */
  await editChar(page, 1, false);
  await page.getByTestId('char-card').click();
  await expect(page.getByTestId('char-card')).toHaveText('已複製');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('# 甲');
  expect(text).toContain('## 角色資訊\n背景故事');
  expect(text).toContain('- → 友情 乙');
  expect(text).toContain('- ← 乙：「可靠的夥伴」');
  expect(errors).toEqual([]);
});

test('角色資訊的「連結」：打字後按連結面板不關；選取的字變成連結（存成 請看<a>官網</a>，7.8）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await editChar(page, 1);
  await page.getByTestId('char-info').click();
  const ed = page.getByTestId('info-editor');
  await ed.click();
  await page.keyboard.type('請看官網');
  /* 打字之後立刻按「連結」：面板還在、浮層出來 */
  await page.getByTestId('rich-link').click();
  await expect(title(page)).toHaveText('角色資訊');
  await expect(page.getByTestId('rich-link-input')).toBeFocused();
  await page.keyboard.press('Escape');
  /* 選「官網」兩個字 → 連結 → 網址 → Enter */
  await page.waitForTimeout(450);
  await ed.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.getByTestId('rich-link').click();
  await page.getByTestId('rich-link-input').fill('https://ok.example/x');
  await page.getByTestId('rich-link-input').press('Enter');
  await expect(ed.locator('a')).toHaveText('官網');
  await page.getByTestId('info-back').click();
  const p = await data(page);
  const info = p.library.find((e) => e.id === p.sheets[0].chars[0].lib)?.info ?? '';
  expect(info).toMatch(/^(<p>)?請看<a href="https:\/\/ok\.example\/x"[^>]*>官網<\/a>/);
  /* 有圖的資訊：重新整理後再打開，主控台沒有載入失敗（rcimg: 不放進 src，7.8） */
  await page.getByTestId('char-info').click();
  await ed.click();
  await page.keyboard.press('Control+End');
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '插入圖片' }).click(),
  ]);
  await fc.setFiles({
    name: 'pic.png',
    mimeType: 'image/png',
    buffer: await solidPng([20, 160, 90, 255], 30, 30),
  });
  await expect(ed.locator('img')).toHaveCount(1);
  await page.getByTestId('info-back').click();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('chart').locator('svg').first()).toBeVisible();
  /* 「進階」的開合記在瀏覽器：關著才打開 */
  await editChar(page, 1, false);
  if (!(await page.getByTestId('char-info').isVisible()))
    await page.getByRole('button', { name: '進階' }).click();
  await page.getByTestId('char-info').click();
  await expect(page.getByTestId('info-editor').locator('img')).toHaveAttribute('src', /^blob:/);
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('數值圖表：新增範本、填數值（打字即時重畫、離開記一步）、狀態、範本設定（刪軸）、數值比較；互動網頁的雷達與資訊', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await editChar(page, 1);
  await page.getByRole('button', { name: '數值圖表' }).click();
  await page.getByTestId('radar-new-tpl').click();
  const tplDlg = page.getByTestId('radar-tpl-dialog');
  await expect(tplDlg).toBeVisible();
  await tplDlg.getByTestId('radar-tpl-name').fill('能力值');
  await tplDlg.getByTestId('radar-tpl-name').blur();
  await expect(tplDlg.getByTestId('radar-axis')).toHaveCount(5);
  await page.waitForTimeout(450);
  await tplDlg.getByTestId('radar-axis-del').first().click();
  await expect(tplDlg.getByTestId('radar-axis')).toHaveCount(4);
  await page.keyboard.press('Escape');
  /* 填數值：第一個狀態 */
  await page.getByTestId('radar-state-add').click();
  const vals = page.getByTestId('radar-val');
  await vals.nth(0).fill('80');
  await vals.nth(0).blur();
  await expect(page.getByTestId('radar-chart').locator('polygon')).not.toHaveCount(0);
  let p = await data(page);
  const v = p.library.find((e) => e.id === p.sheets[0].chars[0].lib)?.variants[0];
  expect(v?.radars[0].vals[String(p.radarTpls[0].axes[0].id)]).toBe(80);
  /* 一步復原 */
  await page.getByTestId('undo').click();
  p = await data(page);
  expect(
    p.library.find((e) => e.id === p.sheets[0].chars[0].lib)?.variants[0].radars[0].vals,
  ).toEqual({});
  await page.getByTestId('redo').click();
  /* 數值比較 */
  await page.getByTestId('radar-compare').click();
  const cmp = page.getByTestId('radar-compare-dialog');
  await expect(cmp.getByTestId('radar-chart')).toBeVisible();
  await expect(cmp.getByTestId('radar-legend')).toContainText('甲');
  await page.keyboard.press('Escape');
  /* 互動網頁：卡片上「雷達 ›」→ 右側窗格 */
  const html = strFromU8((await runExport(page, '互動網頁（唯讀）')).bytes);
  expect(html).toContain('id="radarDocV"');
  const w = await context.newPage();
  await w.route('**/*', (r) =>
    r.request().url() === 'http://viewer.test/'
      ? r.fulfill({ body: html, contentType: 'text/html' })
      : r.abort(),
  );
  await w.goto('http://viewer.test/');
  const nc = await center(w.locator('.node[data-id="1"] > circle').first());
  await w.mouse.click(nc.x, nc.y);
  await w.locator('#tipV .ti-btn[data-radar]').click();
  await expect(w.locator('#loreV')).toHaveClass(/show/);
  await expect(w.locator('#radarDocV .rdv-title')).toHaveText(['能力值']);
  await expect(w.locator('#radarDocV svg polygon')).not.toHaveCount(0);
  await w.close();
  expect(errors).toEqual([]);
});

test('頭像框：上傳（同一張只存一份）、角色指定／跟隨標籤／分頁預設、名字往下讓、管理與刪除（清掉分頁預設）、匯出內嵌', async ({
  page,
}) => {
  const errors = await open(page);
  const s = trio();
  s.chars[1].labels = [7];
  await seed(page, project([s], { labels: [makeLabel(7, '護衛')] }));
  /* 分頁設定 › 頭像框 › 上傳 */
  await page.getByRole('button', { name: '頭像框' }).click();
  const frame = await solidPng([255, 0, 0, 128], 64, 64);
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('frame-upload').click(),
  ]);
  await fc.setFiles({ name: 'red-frame.png', mimeType: 'image/png', buffer: frame });
  await expect(toast(page, '已加入 1 張頭像框')).toBeVisible();
  const [fc2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('frame-upload').click(),
  ]);
  await fc2.setFiles({ name: 'again.png', mimeType: 'image/png', buffer: frame });
  await expect(toast(page, '這些框已經在庫裡了（同樣的圖只會存一份）。')).toBeVisible();
  let p = await data(page);
  expect(p.frames.map((f) => f.name)).toEqual(['red-frame']);
  const fid = p.frames[0].id;
  /* 分頁預設：沒指定、沒標籤框的人都戴上；名字往下讓 */
  const y0 = Number(await node(page, 1).locator('.node-name text').getAttribute('y'));
  await pickOption(page, page.getByTestId('def-frame'), 'red-frame');
  await expect(node(page, 1).locator('.node-frame image.av-frame')).toHaveCount(1);
  const y1 = Number(await node(page, 1).locator('.node-name text').getAttribute('y'));
  expect(y1).toBeGreaterThan(y0);
  /* 角色指定「不使用框」壓過分頁預設 */
  await page.waitForTimeout(450);
  await editChar(page, 3);
  await pickOption(page, page.getByTestId('char-frame'), '不使用框');
  await expect(node(page, 3).locator('.node-frame')).toHaveCount(0);
  /* 跟隨的目前值寫實際的來源 */
  await editChar(page, 2, false);
  await expect(page.getByTestId('char-frame')).toContainText('分頁預設（red-frame）');
  /* 管理：刪除＝指定的退回跟隨、標籤與分頁預設的這張一起拿掉 */
  await page.getByTestId('panel-close').click();
  await page.getByTestId('frame-manage').click();
  await page.getByTestId('frame-del').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '確定' }).click();
  await page.keyboard.press('Escape');
  p = await data(page);
  expect(p.frames).toEqual([]);
  expect(p.sheets[0].settings.defFrame).toBe('');
  await expect(chart(page).locator('.node-frame')).toHaveCount(0);
  /* 復原 → 框回來；分層 SVG 內嵌框 */
  await page.getByTestId('undo').click();
  await expect(node(page, 1).locator('.node-frame image')).toHaveCount(1);
  const svg = strFromU8((await runExport(page, '分層 SVG')).bytes);
  expect(svg).toMatch(/class="av-frame" href="data:image\/png;base64,/);
  void fid;
  expect(errors).toEqual([]);
});

test('匯入的字型：匯入、文件字型與角色字型（名字的 style）、PNG／SVG 內嵌、管理與刪除（退回預設）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  const FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf';
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('font-import').click(),
  ]);
  await fc.setFiles(FONT);
  await expect(toast(page, '已匯入 1 套字型')).toBeVisible();
  let p = await data(page);
  expect(p.fonts.map((f) => [f.name, f.fmt])).toEqual([['LiberationSerif-Regular', 'ttf']]);
  const fid = p.fonts[0].id;
  /* 角色字型：只影響名字（style） */
  await editChar(page, 1);
  await pickOption(page, page.getByTestId('char-font'), 'LiberationSerif-Regular');
  await expect(node(page, 1).locator('.node-name text')).toHaveAttribute(
    'style',
    new RegExp(`font-family:"crf-${fid}"`),
  );
  await expect(node(page, 2).locator('.node-name text')).not.toHaveAttribute('style', /crf-/);
  /* 匯出 SVG：內嵌用到的字型 */
  const svg = strFromU8((await runExport(page, '分層 SVG')).bytes);
  expect(svg).toContain(`@font-face{font-family:"crf-${fid}";src:url("data:font/ttf;base64,`);
  /* 文件字型改成匯入的；刪除字型＝文件字型回黑體、角色字型回跟隨 */
  await page.getByTestId('panel-close').click();
  await pickOption(page, page.getByTestId('doc-font'), 'LiberationSerif-Regular');
  p = await data(page);
  expect(p.font).toBe(`f:${fid}`);
  await page.getByTestId('font-manage').click();
  await expect(page.getByTestId('font-row')).toContainText('使用中');
  await page.getByTestId('font-del').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '確定' }).click();
  await page.keyboard.press('Escape');
  p = await data(page);
  expect(p.font).toBe('sans');
  expect(p.library.every((e) => e.font === '')).toBe(true);
  expect(errors).toEqual([]);
});

test('交換位置模式：點兩位＝交換座標與清單順序（釘選的也能換、一步復原）、再點同一位＝放下、拖不動、清單點一列也算、Esc 結束', async ({
  page,
}) => {
  const errors = await open(page);
  const s = trio();
  s.chars[2].locked = true;
  await seed(page, project([s]));
  await page.getByTestId('more-menu').click();
  await page.getByTestId('menu-swap').click();
  /* 選單不關（可以勾選）：點旁邊收起 */
  await page.mouse.click(5, 5);
  await expect(page.getByTestId('swap-banner')).toContainText('交換位置');
  /* 甲 ↔ 丙（釘選） */
  await clickAt(page, await nodeCenter(page, 1));
  await expect(page.getByTestId('swap-banner')).toContainText('甲');
  await clickAt(page, await nodeCenter(page, 3));
  let sh = await sheet(page);
  expect(sh.chars.map((c) => [c.id, c.x, c.y])).toEqual([
    [3, 250, 500],
    [2, 750, 500],
    [1, 500, 200],
  ]);
  /* 一步復原 */
  await page.getByTestId('undo').click();
  sh = await sheet(page);
  expect(sh.chars.map((c) => c.id)).toEqual([1, 2, 3]);
  /* 拖不動：拖一段放開＝點一下（挑起），再點同一位＝放下 */
  const a = await nodeCenter(page, 2);
  await drag(page, a, { x: a.x + 80, y: a.y + 40 });
  await expect(page.getByTestId('swap-banner')).toContainText('乙');
  sh = await sheet(page);
  expect(sh.chars[1]).toMatchObject({ x: 750, y: 500 });
  await page.mouse.click(a.x, a.y);
  await expect(page.getByTestId('swap-banner')).not.toContainText('乙');
  /* 清單點一列也算 */
  await page.getByTestId('char-row').nth(0).click();
  await page.getByTestId('char-row').nth(1).click();
  sh = await sheet(page);
  expect(sh.chars.map((c) => c.id)).toEqual([2, 1, 3]);
  /* Esc 結束 */
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('swap-banner')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('原作的專案檔（第三批）：角色庫的每件變體、關係庫、角色資訊（再淨化）、看法、數值、頭像框與匯入字型（用原作的雜湊對上檔案）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  const framePng = await solidPng([255, 200, 0, 160], 64, 64);
  const fontBytes = readFileSync(
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  );
  const fh = snapHash(`data:image/png;base64,${Buffer.from(framePng).toString('base64')}`);
  const th = snapHash(`data:font/ttf;base64,${Buffer.from(fontBytes).toString('base64')}`);
  const data = {
    app: 'CharRelDiagram',
    format: 7,
    activeSheetIdx: 0,
    docFont: `f:${th}`,
    labels: [],
    library: [
      {
        id: 120,
        info: '<p><b>背景</b></p><script>alert(1)</script><img src="x" onerror="alert(1)">',
        font: `f:${th}`,
        variants: [
          {
            id: 121,
            name: '艾莉絲',
            icon: 'star',
            frame: fh,
            radars: [{ tpl: 150, state: '', vals: { 151: 50 } }],
          },
          { id: 122, name: '魔女艾莉絲', icon: 'moon', frame: '' },
        ],
      },
      { id: 130, unifiedColor: true, variants: [{ id: 131, name: '雷恩', icon: 'shield' }] },
    ],
    relLibrary: [
      {
        id: 140,
        variants: [
          { id: 141, label: '戀愛', color: '#e0607e', lineStyle: 'solid', capStyle: 'arrow' },
          {
            id: 142,
            label: '戀愛（單戀）',
            color: '#e0607e',
            lineStyle: 'dashed',
            capStyle: 'heart',
          },
        ],
      },
    ],
    radarLib: [
      {
        id: 150,
        name: '能力值',
        chart: 'radar',
        shape: 'poly',
        rings: 4,
        valMode: 'raw',
        shared: false,
        axes: [
          { id: 151, label: '力', max: 100, unit: '' },
          { id: 152, label: '速', max: 100, unit: '' },
          { id: 153, label: '智', max: 100, unit: '' },
        ],
      },
    ],
    sheets: [
      {
        id: 2,
        name: '學院',
        W: 1000,
        H: 800,
        relTypes: [
          {
            id: 160,
            label: '戀愛',
            color: '#e0607e',
            lineStyle: 'solid',
            capStyle: 'arrow',
            relLibId: 140,
            relVarId: 141,
          },
        ],
        chars: [
          { id: 1, libId: 120, varId: 121, x: 300, y: 300 },
          { id: 2, libId: 130, varId: 131, x: 700, y: 300 },
        ],
        rels: [{ id: 11, from: 1, to: 2, relTypeId: 160 }],
        views: { 2: { 1: '可靠的夥伴' } },
      },
    ],
  };
  const zip = Buffer.from(
    zipSync({
      '專案/project.json': strToU8(JSON.stringify(data)),
      '專案/frames/金框.png': new Uint8Array(framePng),
      '專案/fonts/LiberationSerif.ttf': new Uint8Array(fontBytes),
    }),
  );
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc.setFiles({ name: 'orig.zip', mimeType: 'application/zip', buffer: zip });
  await page.getByRole('alertdialog').getByRole('button', { name: '取代目前內容' }).click();
  await expect(toast(page, '已讀入原作的專案：1 張分頁、2 位角色、1 條關係')).toBeVisible();
  await page.waitForTimeout(600);
  const p = (await saved(page)) as Project;
  const s = p.sheets[0];
  /* 角色庫：每一件變體都讀進來；統一顏色 */
  expect(p.library.map((e) => e.variants.map((v) => v.name))).toEqual([
    ['艾莉絲', '魔女艾莉絲'],
    ['雷恩'],
  ]);
  expect(p.library[1].unified).toBe(true);
  /* 角色資訊再淨化（script、事件屬性都不進來） */
  expect(p.library[0].info).toContain('<b>背景</b>');
  expect(p.library[0].info).not.toMatch(/script|onerror/);
  /* 關係庫與綁定 */
  expect(p.relLibrary[0].variants.map((v) => v.label)).toEqual(['戀愛', '戀愛（單戀）']);
  expect(s.types[0].lib).toBe(p.relLibrary[0].id);
  /* 看法（角色 id 照分頁換）、數值 */
  expect(Object.values(s.views)[0]).toEqual({ [String(s.chars[0].id)]: '可靠的夥伴' });
  expect(p.radarTpls.map((t) => t.name)).toEqual(['能力值']);
  expect(p.library[0].variants[0].radars[0].vals[String(p.radarTpls[0].axes[0].id)]).toBe(50);
  /* 頭像框與字型：原作的雜湊對上 ZIP 裡的檔案 */
  expect(p.frames.map((f) => f.name)).toEqual(['金框']);
  expect(p.fonts.map((f) => [f.name, f.fmt])).toEqual([['LiberationSerif', 'ttf']]);
  expect(p.library[0].variants[0].frame).toBe(p.frames[0].id);
  expect(p.library[0].variants[1].frame).toBe('');
  expect(p.font).toBe(`f:${p.fonts[0].id}`);
  await expect(node(page, s.chars[0].id).locator('.node-frame image')).toHaveCount(1);
  await expect(node(page, s.chars[0].id).locator('.node-name text')).toHaveAttribute(
    'style',
    new RegExp(`crf-${p.fonts[0].id}`),
  );
  /* 互動網頁：圖（頭像框）用 data-rcimg 帶著，載入後才設 href＝主控台沒有載入失敗（7.8） */
  const vhtml = strFromU8((await runExport(page, '互動網頁（唯讀）')).bytes);
  expect(vhtml).not.toMatch(/(href|src)="rcimg:/);
  const v = await page.context().newPage();
  const vErrors: string[] = [];
  v.on('pageerror', (e) => vErrors.push(e.message));
  v.on('console', (m) => m.type() === 'error' && vErrors.push(m.text()));
  await v.route('**/*', (r) =>
    r.request().url() === 'http://viewer.test/'
      ? r.fulfill({ body: vhtml, contentType: 'text/html' })
      : r.abort(),
  );
  await v.goto('http://viewer.test/');
  await expect(v.locator('.sheetV.active .node-frame image').first()).toHaveAttribute(
    'href',
    /^data:image\//,
  );
  await v.waitForTimeout(300);
  expect(vErrors).toEqual([]);
  await v.close();
  expect(errors).toEqual([]);
});

/* ---------- 第四批：畫布、檢視與分享 ---------- */

const noteEl = (page: Page, id: number) => chart(page).locator(`.note-node[data-noteid="${id}"]`);
/** 便利貼的紙面（直屬的 rect） */
const notePaper = (page: Page, id: number) => noteEl(page, id).locator(':scope > rect').first();
const noteBtn = (page: Page, id: number, act: 'pin' | 'del' | 'cfg') =>
  noteEl(page, id).locator(`.note-btn[data-note-act="${act}"] > circle`).first();

/** 打開「檢視」選單的一項 */
async function viewMenu(page: Page, testId: string) {
  await page.getByTestId('view-menu').click();
  await page.getByTestId(testId).click();
}

/** 畫布座標 → 螢幕座標 */
async function canvasPt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const g = document.querySelector(
        '[data-testid=chart] svg.rc-chart:not(.rc-live-under) .canvas-content',
      ) as SVGGraphicsElement;
      const p = new DOMPoint(x, y).matrixTransform(g.getScreenCTM() as DOMMatrix);
      return { x: p.x, y: p.y };
    },
    [x, y],
  );
}

test('便利貼：新增即就地輸入（一段編輯一步復原、Esc 放棄）、拖曳（可以放到畫布外，畫布下方說明）、右下把手改大小、釘選、設定（隱藏紙面、字級）、關閉進便利貼庫、放回、尺寸範本', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await more(page, 'menu-add-note');
  const ed = page.locator('[data-note-editor]');
  await expect(ed).toBeFocused();
  await page.keyboard.type('第一行');
  await page.keyboard.press('Enter');
  await page.keyboard.type('第二行');
  /* 點畫布別的地方＝收起 */
  await clickAt(page, await canvasPt(page, 80, 950));
  await expect(ed).toHaveCount(0);
  let s = await sheet(page);
  expect(s.notes).toHaveLength(1);
  const id = s.notes[0].id;
  expect(s.notes[0]).toMatchObject({ text: '第一行\n第二行', w: 200, h: 200 });
  await expect(noteEl(page, id).locator('.note-text text')).toHaveText(['第一行', '第二行']);
  /* 一段編輯＝一步復原（新增是另一步） */
  await page.getByTestId('undo').click();
  s = await sheet(page);
  expect(s.notes.map((n) => n.text)).toEqual(['']);
  await page.getByTestId('redo').click();
  await page.waitForTimeout(450);
  /* 點一下＝再編輯；Esc＝放棄這次的修改 */
  await clickAt(page, await center(notePaper(page, id)));
  await expect(ed).toBeFocused();
  await page.keyboard.type('不要的字');
  await page.keyboard.press('Escape');
  await expect(ed).toHaveCount(0);
  s = await sheet(page);
  expect(s.notes[0].text).toBe('第一行\n第二行');
  /* 拖到畫布外（不夾回）：畫布下方的說明、沒有出血框（先縮小，畫布四周才有空間） */
  await page.getByTestId('zoom-out').click();
  await page.getByTestId('zoom-out').click();
  const before = s.notes[0];
  const from = await center(notePaper(page, id));
  await drag(page, from, await canvasPt(page, -80, before.y));
  s = await sheet(page);
  /* 放在游標指的位置（外擴撐開時畫布留在原地） */
  expect(Math.abs(s.notes[0].x + 80)).toBeLessThan(2);
  expect(Math.abs(s.notes[0].y - before.y)).toBeLessThan(2);
  await expect(chart(page).locator('.note-out-hint')).toHaveText(
    '有 1 張便利貼在畫布外：互動網頁看得到，但 .png 只裁畫布、不會包含它們。',
  );
  await expect(chart(page).locator('.canvas-bleed-frame')).toHaveCount(0);
  /* 拖回來，改大小：左上角固定、吸 50 的倍數 */
  await drag(page, await center(notePaper(page, id)), await canvasPt(page, 500, 700));
  await page.getByTestId('zoom-fit').click();
  s = await sheet(page);
  expect(s.notes[0].x).toBeGreaterThan(400);
  const n0 = s.notes[0];
  const left = n0.x - n0.w / 2;
  const top = n0.y - n0.h / 2;
  const grip = noteEl(page, id).locator('.note-grip path');
  /* 抓三角形的直角（右下角）：寬高＝游標到左上角的距離 */
  const gb = (await grip.boundingBox()) as { x: number; y: number; width: number; height: number };
  const g = { x: gb.x + gb.width - 1, y: gb.y + gb.height - 1 };
  const k = (await canvasPt(page, 100, 0)).x - (await canvasPt(page, 0, 0)).x;
  await drag(page, g, { x: g.x + (80 * k) / 100, y: g.y + (30 * k) / 100 });
  s = await sheet(page);
  expect(s.notes[0]).toMatchObject({ w: 300, h: 250 });
  expect(s.notes[0].x - s.notes[0].w / 2).toBeCloseTo(left, 1);
  expect(s.notes[0].y - s.notes[0].h / 2).toBeCloseTo(top, 1);
  /* 釘選：沒有把手、拖不動 */
  const pc = await center(noteBtn(page, id, 'pin'));
  await clickAt(page, pc);
  await expect(noteEl(page, id).locator('.note-grip')).toHaveCount(0);
  s = await sheet(page);
  const pinned = s.notes[0];
  await drag(page, await center(notePaper(page, id)), await canvasPt(page, 200, 200));
  s = await sheet(page);
  expect([s.notes[0].x, s.notes[0].y]).toEqual([pinned.x, pinned.y]);
  /* 設定：隱藏紙面、字級 */
  await clickAt(page, await center(noteBtn(page, id, 'cfg')));
  await expect(title(page)).toHaveText('便利貼設定');
  await page.getByRole('checkbox', { name: '隱藏紙面（只顯示文字）' }).click();
  await expect(noteEl(page, id)).toHaveClass(/note-bare/);
  await page.getByRole('spinbutton', { name: '字級 px（≥1）' }).fill('22');
  await page.getByRole('spinbutton', { name: '字級 px（≥1）' }).blur();
  await expect(page.getByTestId('note-fs-now')).toHaveText('目前實際字級：22 px');
  s = await sheet(page);
  expect(s.notes[0]).toMatchObject({ bare: true, size: 22, locked: true });
  /* 刪除＝關閉：內容進便利貼庫（不確認） */
  await page.getByTestId('note-del').click();
  s = await sheet(page);
  expect(s.notes).toHaveLength(0);
  await page.getByTestId('library-open').click();
  await page.getByTestId('library-tab-notes').click();
  const row = lib(page).getByTestId('lib-entry');
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('lib-entry-name')).toHaveText('第一行');
  await expect(row.getByTestId('lib-entry-meta')).toHaveText('6 × 5');
  /* 點一筆＝放回並移出紀錄 */
  await row.click();
  await expect(
    lib(page).getByText('還沒有關閉過的便利貼。按便利貼的 ✕，內容就會留在這裡。'),
  ).toBeVisible();
  let p = await data(page);
  expect(p.noteBin).toHaveLength(0);
  expect(p.sheets[0].notes[0]).toMatchObject({
    text: '第一行\n第二行',
    w: 300,
    h: 250,
    size: 22,
    bare: true,
  });
  /* 尺寸範本：3 × 3 */
  await lib(page).locator('[data-testid=notelib-tpl][data-cells="3"]').click();
  p = await data(page);
  expect(p.sheets[0].notes.at(-1)).toMatchObject({ w: 150, h: 150, text: '' });
  /* 刪除模式：點紀錄＝只刪紀錄 */
  const nid = p.sheets[0].notes.at(-1)?.id as number;
  await clickAt(page, await center(noteBtn(page, nid, 'del')));
  await page.getByTestId('library-act-del').click();
  await lib(page).getByTestId('lib-entry').click();
  p = await data(page);
  expect(p.noteBin).toHaveLength(0);
  expect(p.sheets[0].notes).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('圖表節點：數值比較「放到畫布上」、設定（標題、範本、角色 A／B 與狀態、圖例、隱藏卡面）、點一下＝打開設定、分層 SVG 的便利貼圖層', async ({
  page,
}) => {
  const errors = await open(page);
  const s = trio();
  const radarTpls = [
    {
      id: 900,
      name: '能力值',
      chart: 'radar' as const,
      shape: 'poly' as const,
      rings: 4,
      valMode: 'raw' as const,
      shared: false,
      axes: [
        { id: 901, label: '力', max: 100, unit: '' },
        { id: 902, label: '速', max: 100, unit: '' },
        { id: 903, label: '智', max: 100, unit: '' },
      ],
    },
  ];
  await seed(page, project([s], { radarTpls }));
  let p = await data(page);
  /* 甲：兩個狀態；乙：一個 */
  await page.evaluate(
    ({ key, a, b }) => {
      const raw = JSON.parse(localStorage.getItem(key) as string);
      const lib = raw.state.data.library;
      lib.find((e: { id: number }) => e.id === a).variants[0].radars = [
        { tpl: 900, state: '戰前', vals: { 901: 80, 902: 40, 903: 60 } },
        { tpl: 900, state: '戰後', vals: { 901: 30, 902: 90, 903: 60 } },
      ];
      lib.find((e: { id: number }) => e.id === b).variants[0].radars = [
        { tpl: 900, state: '', vals: { 901: 50, 902: 50, 903: 50 } },
      ];
      localStorage.setItem(key, JSON.stringify(raw));
    },
    { key: KEY, a: p.sheets[0].chars[0].lib, b: p.sheets[0].chars[1].lib },
  );
  await page.reload();
  await expect(page.getByTestId('chart').locator('svg')).toBeVisible();
  await more(page, 'menu-compare');
  const cmp = page.getByTestId('radar-compare-dialog');
  await pickOption(page, cmp.getByTestId('radar-a'), '甲');
  await page.getByTestId('radar-compare-to-canvas').click();
  await expect(title(page)).toHaveText('圖表節點設定');
  p = await data(page);
  const n = p.sheets[0].notes[0];
  expect(n).toMatchObject({
    w: 400,
    h: 400,
    chart: { tpl: 900, a: 1, b: 0, stA: 0, legend: true },
  });
  await expect(noteEl(page, n.id).locator('.radar-svg')).toHaveCount(1);
  /* 標題、B、狀態（換角色＝兩邊的狀態都回到第 1 個，所以先選 B 再選狀態） */
  await page.getByTestId('note-chart-title').fill('戰前 vs 戰後');
  await page.getByTestId('note-chart-title').blur();
  await pickOption(page, page.getByTestId('note-chart-sta'), '戰後');
  await pickOption(page, page.getByTestId('note-chart-b'), '乙');
  await expect(page.getByTestId('note-chart-sta')).toContainText('戰前');
  await pickOption(page, page.getByTestId('note-chart-sta'), '戰後');
  await expect(noteEl(page, n.id).locator('.chart-body > text').first()).toHaveText('戰前 vs 戰後');
  await expect(noteEl(page, n.id).locator('.chart-body circle[r="4.5"]')).toHaveCount(2);
  await expect(noteEl(page, n.id)).toContainText('甲・戰後');
  /* 圖例關掉、隱藏卡面 */
  await page.getByRole('checkbox', { name: '顯示圖例' }).click();
  await expect(noteEl(page, n.id).locator('.chart-body circle[r="4.5"]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '隱藏卡面（只顯示圖）' }).click();
  await expect(noteEl(page, n.id)).toHaveClass(/note-bare/);
  p = await data(page);
  expect(p.sheets[0].notes[0]).toMatchObject({
    text: '戰前 vs 戰後',
    bare: true,
    chart: { a: 1, b: 2, stA: 1, legend: false },
  });
  /* 點一下＝打開設定（不是文字編輯） */
  await page.getByTestId('panel-close').click();
  await clickAt(page, await center(noteEl(page, n.id).locator('.radar-svg')));
  await expect(title(page)).toHaveText('圖表節點設定');
  await expect(page.locator('[data-note-editor]')).toHaveCount(0);
  /* 分層 SVG：最上面多一層「便利貼」（沒有小圓鈕） */
  const svg = strFromU8((await runExport(page, '分層 SVG')).bytes);
  expect(svg).toMatch(/inkscape:label="便利貼" id="layer-notes"/);
  expect(svg).toContain('class="radar-svg"');
  expect(svg).not.toContain('note-btn');
  expect(errors).toEqual([]);
});

test('世界觀與備忘錄：富文本（一段編輯一步復原）、沿用別的分頁（唯讀顯示）、備忘錄（不進匯出）、互動網頁的「世界觀」鈕；世界觀的圖重新整理後還在', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await seed(page, project([trio(), sample('family', 1000, '家族')]));
  await viewMenu(page, 'menu-lore');
  await expect(title(page)).toHaveText('世界觀');
  const ed = page.getByTestId('lore-editor');
  await ed.click();
  await page.keyboard.type('北境與南境分裂');
  /* 插入圖片（存進資產庫） */
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '插入圖片' }).click(),
  ]);
  await fc.setFiles({
    name: 'map.png',
    mimeType: 'image/png',
    buffer: await solidPng([200, 40, 40, 255], 40, 40),
  });
  await expect(ed.locator('img')).toHaveCount(1);
  await clickAt(page, await canvasPt(page, 80, 950));
  let p = await data(page);
  expect(p.sheets[0].lore).toContain('北境與南境分裂');
  expect(p.sheets[0].lore).toMatch(/<img src="rcimg:[0-9a-z]+">/);
  /* 第二張分頁：沿用第一張 */
  await page.getByTestId('sheet-tab').nth(1).click();
  await viewMenu(page, 'menu-lore');
  await pickOption(page, page.getByTestId('lore-src'), '分頁1');
  await expect(page.getByTestId('lore-view')).toContainText('北境與南境分裂');
  await expect(page.getByTestId('lore-editor')).toHaveCount(0);
  p = await data(page);
  expect(p.sheets[1].loreFrom).toBe(p.sheets[0].id);
  /* 備忘錄：打字即寫入，停手後一步 */
  await viewMenu(page, 'menu-memo');
  await page.getByTestId('memo-text').fill('色票：#e5b84b');
  await page.waitForTimeout(800);
  p = await data(page);
  expect(p.sheets[1].memo).toBe('色票：#e5b84b');
  /* 互動網頁：兩張分頁都有世界觀（沿用的指到同一份）、備忘錄不進 */
  const html = strFromU8((await runExport(page, '互動網頁（唯讀）', { scope: '全部分頁' })).bytes);
  expect(html).toContain('id="loreBtnV"');
  expect(html).not.toContain('色票');
  expect(html.match(/class="loreDoc"/g)).toHaveLength(1);
  const w = await context.newPage();
  await w.route('**/*', (r) =>
    r.request().url() === 'http://viewer.test/'
      ? r.fulfill({ body: html, contentType: 'text/html' })
      : r.abort(),
  );
  await w.goto('http://viewer.test/');
  await w.locator('#loreBtnV').click();
  await expect(w.locator('#loreV')).toHaveClass(/show/);
  await expect(w.locator('#loreVBody .loreDoc:not([hidden])')).toContainText('北境與南境分裂');
  await expect(w.locator('#loreVBody .loreDoc:not([hidden]) img')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  /* 窗格蓋住右上的鈕：用窗格的 ✕ 關 */
  await w.locator('#loreVClose').click();
  await expect(w.locator('#loreV')).not.toHaveClass(/show/);
  await w.close();
  /* 資產回收：重新整理（開頁 3 秒後整理）兩次之後，世界觀的圖還在 */
  await page.reload();
  await page.waitForTimeout(3600);
  await page.reload();
  await page.getByTestId('sheet-tab').first().click();
  await viewMenu(page, 'menu-lore');
  await expect(page.getByTestId('lore-editor').locator('img')).toHaveAttribute('src', /^blob:/);
  expect(errors).toEqual([]);
});

test('統計與尋路：中心度排行、孤立角色（點列＝選取）、最短關係鏈（畫布鎖定聚焦）、N 度聚焦、清除；關掉面板解除', async ({
  page,
}) => {
  const errors = await open(page);
  const s = sample('story');
  s.chars.push(makeChar(350, '孤獨者', 900, 800, { defNo: 350 }));
  await seed(page, project([s]));
  await viewMenu(page, 'menu-stats');
  await expect(title(page)).toHaveText('統計與尋路（本分頁）');
  const rank = page.getByTestId('stats-rank').getByTestId('stats-row');
  await expect(rank).toHaveCount(6);
  await expect(rank.first()).toHaveText('1.主角5');
  await expect(page.getByTestId('stats-iso')).toContainText('孤立角色（沒有任何關係）（1）');
  await page.getByTestId('stats-iso').getByTestId('stats-row').click();
  await expect(node(page, 350).locator('.sel-ring')).toHaveCount(1);
  /* 最短關係鏈：戀人 → 神秘人 */
  const ids = Object.fromEntries(s.chars.map((c) => [c.name, c.id]));
  await pickOption(page, page.getByTestId('stats-from'), '戀人');
  await pickOption(page, page.getByTestId('stats-to'), '神秘人');
  await page.getByTestId('stats-find').click();
  await expect(page.getByTestId('stats-path-msg')).toHaveText('戀人 → 主角 → 神秘人（2 步）');
  const svg = chart(page).locator('svg.rc-chart').first();
  await expect(svg).toHaveClass(/focus-active/);
  for (const nm of ['戀人', '主角', '神秘人'])
    await expect(node(page, ids[nm])).toHaveClass(/focusedV/);
  await expect(node(page, ids.摯友)).not.toHaveClass(/focusedV/);
  /* 找不到 */
  await pickOption(page, page.getByTestId('stats-to'), '孤獨者');
  await page.getByTestId('stats-find').click();
  await expect(page.getByTestId('stats-path-msg')).toHaveText('這兩位角色之間沒有任何關係鏈。');
  /* N 度聚焦：戀人 2 度以內＝6 人 */
  await pickOption(page, page.getByTestId('stats-focus-char'), '戀人');
  await page.getByRole('radio', { name: '2 度以內' }).click();
  await page.getByTestId('stats-focus-go').click();
  await expect(chart(page).locator('.node.focusedV')).toHaveCount(6);
  await page.getByTestId('stats-focus-clear').click();
  await expect(svg).not.toHaveClass(/focus-active/);
  await page.getByTestId('stats-focus-go').click();
  await expect(svg).toHaveClass(/focus-active/);
  /* 關掉面板＝解除 */
  await page.getByTestId('panel-close').click();
  await expect(svg).not.toHaveClass(/focus-active/);
  expect(errors).toEqual([]);
});

test('唯讀瀏覽模式：只留畫布與分頁列、拖角色＝平移、點角色＝聚焦、改資料的按鍵沒作用、Esc 或點提示退出', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio(), sample('family', 1000, '家族')]));
  await viewMenu(page, 'menu-readonly');
  await expect(page.getByTestId('readonly-hint')).toHaveText('唯讀瀏覽模式──點此或按 Esc 退出');
  await expect(page.getByTestId('inspector')).toHaveCount(0);
  await expect(page.getByTestId('char-count')).toHaveCount(0);
  await expect(page.getByTestId('library-open')).toHaveCount(0);
  await expect(page.getByTestId('sheet-close')).toHaveCount(0);
  await expect(page.getByTestId('add-char')).toHaveCount(0);
  /* 拖角色＝平移（角色不動） */
  const before = await sheet(page);
  const v0 = await page.evaluate(() =>
    document.querySelector('[data-testid=chart]')?.getAttribute('style'),
  );
  const c1 = await nodeCenter(page, 1);
  await drag(page, c1, { x: c1.x + 120, y: c1.y + 40 });
  const after = await sheet(page);
  expect(after.chars.map((c) => [c.x, c.y])).toEqual(before.chars.map((c) => [c.x, c.y]));
  expect(
    await page.evaluate(() => document.querySelector('[data-testid=chart]')?.getAttribute('style')),
  ).not.toBe(v0);
  /* 點角色＝聚焦（不開面板）；Delete、Ctrl＋A 沒作用 */
  await clickAt(page, await nodeCenter(page, 1));
  await expect(node(page, 1)).toHaveClass(/focusedV/);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  expect((await sheet(page)).chars).toHaveLength(3);
  /* 分頁列照樣能切換 */
  await page.getByTestId('sheet-tab').nth(1).click();
  await expect(page.getByTestId('sheet-tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  /* Esc 退出 */
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('readonly-hint')).toHaveCount(0);
  await expect(page.getByTestId('inspector')).toBeVisible();
  /* 再進去，點提示退出 */
  await viewMenu(page, 'menu-readonly');
  await page.getByTestId('readonly-hint').click();
  await expect(page.getByTestId('add-char')).toBeVisible();
  expect(errors).toEqual([]);
});

test('遠近簡化：60 位以上拉遠＝中（線上標籤、次要名字藏起來）→ 遠（圓點、重要角色的大名字、圖例藏起來）；匯出不受影響', async ({
  page,
}) => {
  const errors = await open(page);
  const s = emptySheet(1, 1, { W: 2400, H: 1800 });
  s.types.push(makeType(10, '朋友'));
  for (let i = 0; i < 80; i++)
    s.chars.push(
      makeChar(i + 1, `村民${i + 1}`, 150 + (i % 10) * 230, 150 + Math.floor(i / 10) * 200, {
        defNo: i + 1,
        level: i < 5 ? 3 : 0,
      }),
    );
  for (let i = 1; i < 80; i += 2)
    s.rels.push(makeRel(500 + i, i, i + 1, 10, { both: i % 4 === 1 }));
  s.settings.showRelName = true;
  await seed(page, project([s]));
  const svg = chart(page).locator('svg.rc-chart').first();
  await page.getByTestId('zoom-fit').click();
  await expect(svg).not.toHaveClass(/lod-/);
  /* 60 位以上一律帶著標記（換檔只換 class）；近的時候都藏著 */
  await expect(chart(page).locator('.lod-dot')).toHaveCount(80);
  await expect(chart(page).locator('.lod-dot').first()).toBeHidden();
  /* 縮小到「符合畫面」的 0.8 倍左右：中 */
  await page.getByTestId('zoom-out').click();
  await expect(svg).toHaveClass(/lod-mid/);
  await expect(chart(page).locator('.edge-label').first()).toBeHidden();
  await expect(chart(page).locator('.node-name.lod-minorname').first()).toBeHidden();
  /* 再縮小：遠 */
  await page.getByTestId('zoom-out').click();
  await page.getByTestId('zoom-out').click();
  await page.getByTestId('zoom-out').click();
  await expect(svg).toHaveClass(/lod-far/);
  await expect(chart(page).locator('.lod-dot').first()).toBeVisible();
  await expect(chart(page).locator('.lod-farname')).toHaveCount(5);
  await expect(chart(page).locator('.layer-legend')).toBeHidden();
  /* 放大回來：近 */
  await page.getByTestId('zoom-fit').click();
  await page.getByTestId('zoom-in').click();
  await expect(svg).not.toHaveClass(/lod-/);
  /* 匯出（PNG 用的 SVG、分層 SVG）沒有遠近標記 */
  for (let i = 0; i < 5; i++) await page.getByTestId('zoom-out').click();
  await expect(svg).toHaveClass(/lod-far/);
  const layered = strFromU8((await runExport(page, '分層 SVG')).bytes);
  expect(layered).not.toContain('lod-');
  expect(errors).toEqual([]);
});

test('設定集（檔案庫）：存成新的一筆、檢視卡、套用（間距不同就重排）、覆寫、恢復出廠預設＝新分頁的預設、最愛（置頂、不能刪）、改名、刪除', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await page.getByTestId('library-open').click();
  await page.getByTestId('library-tab-gsets').click();
  await expect(
    lib(page).getByText('還沒有設定集：按這一頁的「存成新的一筆」即可把目前分頁的設定儲存下來。'),
  ).toBeVisible();
  await expect(page.getByTestId('gset-view-title')).toHaveText('N/A');
  /* 改設定 → 存成新的一筆 */
  await page.getByTestId('set-rel-name').getByRole('switch', { name: '關係名稱' }).click();
  await page.waitForTimeout(450);
  await page.getByTestId('gset-add').click();
  await expect(lib(page).getByTestId('lib-entry-name')).toHaveText(['未命名設定集1']);
  await expect(page.getByTestId('gset-view')).toContainText('關係名稱顯示');
  await expect(toast(page, '已存成「未命名設定集1」。')).toBeVisible();
  /* 恢復出廠預設：關係名稱關掉 */
  await page.getByTestId('gset-factory').click();
  await expect(toast(page, '目前分頁已恢復出廠預設。')).toBeVisible();
  let p = await data(page);
  expect(p.sheets[0].settings).toMatchObject({
    showRelName: false,
    bridgeMode: false,
    showRelNote: false,
  });
  /* 套用：回到那一筆的值 */
  await page.getByTestId('gset-apply').click();
  await expect(toast(page, '已套用「未命名設定集1」。')).toBeVisible();
  p = await data(page);
  expect(p.sheets[0].settings.showRelName).toBe(true);
  /* 一步復原 */
  await page.getByTestId('undo').click();
  p = await data(page);
  expect(p.sheets[0].settings.showRelName).toBe(false);
  /* 覆寫：用目前分頁（關係名稱關）的值蓋掉 */
  await page.waitForTimeout(450);
  await page.getByTestId('gset-overwrite').click();
  await expect(toast(page, '已用目前分頁的設定覆寫「未命名設定集1」。')).toBeVisible();
  p = await data(page);
  expect(p.settingsLib[0].values.showRelName).toBe(false);
  /* 第二筆、最愛（置頂）、刪除模式（最愛的刪不掉） */
  await page.waitForTimeout(450);
  await page.getByTestId('gset-add').click();
  await page.getByTestId('library-act-fav').click();
  await lib(page).getByTestId('lib-entry').filter({ hasText: '未命名設定集2' }).click();
  await expect(lib(page).getByTestId('lib-entry-name')).toHaveText([
    '未命名設定集2',
    '未命名設定集1',
  ]);
  await page.getByTestId('library-act-del').click();
  await lib(page).getByTestId('lib-entry').filter({ hasText: '未命名設定集2' }).click();
  await expect(toast(page, '最愛的設定集不能刪，先取消最愛。')).toBeVisible();
  await lib(page).getByTestId('lib-entry').filter({ hasText: '未命名設定集1' }).click();
  p = await data(page);
  expect(p.settingsLib.map((g) => g.name)).toEqual(['未命名設定集2']);
  /* 改名：點條目載入、Enter 確認 */
  await page.getByTestId('library-act-rename').click();
  await lib(page).getByTestId('lib-entry').first().click();
  await page.getByTestId('gset-name').fill('名稱＋粗線');
  await page.getByTestId('gset-name').press('Enter');
  p = await data(page);
  expect(p.settingsLib.map((g) => g.name)).toEqual(['名稱＋粗線']);
  expect(errors).toEqual([]);
});

test('互動網頁的嵌入模式與壓縮頭像；再次匯出（不開對話框、記住格式與勾選、檔名重算）', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await seed(page, project([sample('story'), sample('family', 1000, '家族')]));
  await expect(page.getByTestId('export-again')).toHaveCount(0);
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  await dlg.getByRole('radio', { name: '互動網頁（唯讀）' }).click();
  await expect(dlg.getByRole('checkbox', { name: '壓縮頭像（大幅縮小檔案）' })).toHaveAttribute(
    'data-state',
    'checked',
  );
  await dlg
    .getByRole('checkbox', { name: '嵌入模式（精簡外框，供 iframe 嵌進別人的網頁）' })
    .click();
  await expect(dlg.getByTestId('embed-code')).toHaveValue(
    '<iframe src="把這裡換成你託管後的網址" style="width:100%;aspect-ratio:4/3;border:0" loading="lazy" allowfullscreen></iframe>',
  );
  await dlg.getByTestId('embed-copy').click();
  await expect(dlg.getByTestId('embed-copy')).toHaveText('已複製！');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('<iframe src=');
  await dlg.getByRole('radio', { name: '全部分頁' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dlg.getByTestId('export-run').click(),
  ]);
  const html = readFileSync((await dl.path()) as string, 'utf8');
  expect(html).toContain('<body class="embed">');
  expect(html).toContain('<div id="tabsV">');
  /* 再次匯出：字＝格式・範圍；點了直接下載同樣的設定 */
  const again = page.getByTestId('export-again');
  await expect(again).toHaveAttribute('aria-label', '再次匯出（互動網頁・全部分頁）');
  const [dl2] = await Promise.all([page.waitForEvent('download'), again.click()]);
  expect(dl2.suggestedFilename()).toBe('角色關係圖_互動檢視.html');
  expect(readFileSync((await dl2.path()) as string, 'utf8')).toContain('<body class="embed">');
  await expect(page.getByRole('dialog', { name: '匯出' })).toHaveCount(0);
  /* 嵌入模式的網頁：單指觸控不平移（讓給頁面捲動） */
  const w = await context.newPage();
  await w.route('**/*', (r) =>
    r.request().url() === 'http://viewer.test/'
      ? r.fulfill({ body: html, contentType: 'text/html' })
      : r.abort(),
  );
  await w.goto('http://viewer.test/');
  await expect(w.locator('header h1')).toBeHidden();
  await expect(w.locator('.tabV')).toHaveCount(2);
  await expect(w.locator('#zReset')).toBeVisible();
  await w.close();
  /* 換成 PNG（目前分頁）之後，再次匯出跟著換 */
  await runExport(page, 'PNG（圖片）', { scope: '目前分頁' });
  await expect(again).toHaveAttribute('aria-label', '再次匯出（PNG・目前分頁）');
  const [dl3] = await Promise.all([page.waitForEvent('download'), again.click()]);
  expect(dl3.suggestedFilename()).toMatch(/\.png$/);
  expect(errors).toEqual([]);
});

test('原作的專案檔（第四批）：便利貼（含畫布外、隱藏紙面、釘選）、世界觀（圖片對上檔案）與沿用、備忘錄、便利貼庫、設定集', async ({
  page,
}) => {
  const errors = await open(page);
  const data0 = JSON.parse(
    readFileSync(`${process.cwd()}/tests/unit/fixtures/relation-chart-b4-notes-lore.json`, 'utf8'),
  );
  const img = await solidPng([30, 120, 200, 255], 32, 32);
  const zip = Buffer.from(
    zipSync({
      '專案/project.json': strToU8(JSON.stringify(data0)),
      '專案/images/rich_1cufq98-b8pqm2-271a.png': new Uint8Array(img),
    }),
  );
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc.setFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: zip });
  await expect(toast(page, /已讀入原作的專案：3 張分頁/)).toBeVisible();
  /* 第五批起分頁庫也讀進來：沒有「已略過」的通知 */
  await expect(toast(page, /已略過/)).toHaveCount(0);
  await page.waitForTimeout(600);
  const p = (await saved(page)) as Project;
  const main = p.sheets[1];
  expect(main.notes).toHaveLength(7);
  expect(main.lore).toMatch(/<img src="rcimg:[0-9a-z]{20,}">/);
  expect(p.sheets[2].loreFrom).toBe(main.id);
  expect(p.noteBin.map((n) => n.text)).toEqual(['關掉的隱藏紙面', '關掉的 6×6']);
  expect(p.settingsLib.map((g) => [g.name, g.fav])).toEqual([
    ['名稱＋粗線', false],
    ['跳線＋格線', true],
  ]);
  await page.getByTestId('sheet-tab').nth(1).click();
  await expect(chart(page).locator('.note-node')).toHaveCount(7);
  await expect(chart(page).locator('.note-node.note-bare')).toHaveCount(1);
  await expect(chart(page).locator('.note-out-hint')).toBeVisible();
  await viewMenu(page, 'menu-lore');
  await expect(page.getByTestId('lore-editor').locator('img')).toHaveAttribute('src', /^blob:/);
  expect(errors).toEqual([]);
});

test('第四批修正（7.10）：切分頁時世界觀／備忘錄／統計面板留著並換成新分頁的內容；便利貼字級與本分頁預設字級填 0＝留空', async ({
  page,
}) => {
  const errors = await open(page);
  const a = trio();
  a.name = '主線';
  a.memo = '主線的備忘錄';
  a.lore = '<p>主線的世界觀</p>';
  a.notes = [
    {
      id: 900,
      text: '便利貼',
      x: 500,
      y: 700,
      w: 150,
      h: 100,
      size: 30,
      locked: false,
      bare: false,
      chart: null,
    },
  ];
  const b = sample('story', 1000, '支線');
  b.memo = '支線的備忘錄';
  b.lore = '<p>支線的世界觀</p>';
  await seed(page, project([a, b]));
  /* 備忘錄 */
  await viewMenu(page, 'menu-memo');
  await expect(page.getByTestId('memo-text')).toHaveValue('主線的備忘錄');
  await page.getByTestId('sheet-tab').nth(1).click();
  await expect(title(page)).toHaveText('備忘錄');
  await expect(page.getByTestId('memo-text')).toHaveValue('支線的備忘錄');
  /* 世界觀 */
  await viewMenu(page, 'menu-lore');
  await expect(page.getByTestId('lore-editor')).toContainText('支線的世界觀');
  await page.getByTestId('sheet-tab').nth(0).click();
  await expect(title(page)).toHaveText('世界觀');
  await expect(page.getByTestId('lore-editor')).toContainText('主線的世界觀');
  /* 統計：換成新分頁的排行 */
  await viewMenu(page, 'menu-stats');
  await expect(page.getByTestId('stats-iso')).toContainText('孤立角色（沒有任何關係）（3）');
  await page.getByTestId('sheet-tab').nth(1).click();
  await expect(title(page)).toHaveText('統計與尋路（本分頁）');
  await expect(page.getByTestId('stats-rank').getByTestId('stats-row').first()).toHaveText(
    '1.主角5',
  );
  /* 便利貼字級填 0＝留空（跟隨）；本分頁預設字級填 0＝留空（自動） */
  await page.getByTestId('sheet-tab').nth(0).click();
  await clickAt(page, await center(noteBtn(page, 900, 'cfg')));
  await expect(title(page)).toHaveText('便利貼設定');
  const fs = page.getByRole('spinbutton', { name: '字級 px（≥1）' });
  await expect(fs).toHaveValue('30');
  await fs.fill('0');
  await fs.press('Enter');
  await expect(fs).toHaveValue('');
  await expect(page.getByTestId('note-fs-now')).not.toHaveText('目前實際字級：1 px');
  let s = await sheet(page);
  expect(s.notes[0].size).toBeNull();
  const def = page.getByRole('spinbutton', { name: '本分頁預設字級' });
  await def.fill('18');
  await def.press('Enter');
  await expect(page.getByTestId('note-fs-now')).toHaveText('目前實際字級：18 px');
  await page.waitForTimeout(450);
  await def.fill('0');
  await def.press('Enter');
  await expect(def).toHaveValue('');
  await expect(page.getByTestId('note-fs-now')).not.toHaveText('目前實際字級：1 px');
  s = await sheet(page);
  expect(s.settings.defStickySize).toBe(0);
  expect(errors).toEqual([]);
});

/* ---------- 第四批複驗後的修正（7.11） ---------- */

test('滑過聚焦（7.11）：淡化程度與 0.2 秒轉場照舊，但轉場不讓角色、線各自變成合成層（大圖整層重新點陣化的停頓）', async ({
  page,
}) => {
  const errors = await open(page);
  const s0 = sample('story', 0, '本篇');
  s0.settings.showRelName = true;
  s0.settings.showLabelNodes = true;
  s0.settings.showFreeLbls = true;
  await seed(page, project([s0], { labels: [makeLabel(77, '游離')] }));
  /* 滑過關係最少的一位（才有不相干的角色與線） */
  const deg = (id: number) => s0.rels.filter((r) => r.from === id || r.to === id).length;
  const hub = [...s0.chars].filter((c) => deg(c.id)).sort((a, b) => deg(a.id) - deg(b.id))[0].id;
  const r0 = s0.rels.find((r) => r.from === hub || r.to === hub) ?? s0.rels[0];
  const mate = r0.from === hub ? r0.to : r0.from;
  const near = new Set([hub]);
  for (const r of s0.rels)
    if (r.from === hub || r.to === hub) {
      near.add(r.from);
      near.add(r.to);
    }
  const far = s0.chars.find((c) => !near.has(c.id));
  const farRel = s0.rels.find((r) => r.from !== hub && r.to !== hub);
  if (!far || !farRel) throw new Error('範例要有不相干的角色與線');
  const svg = chart(page).locator('svg.rc-chart').first();
  const edge = (id: number) => svg.locator(`.edge[data-relid="${id}"]:not(.edge-lbl)`);
  const op = (loc: Locator) => loc.evaluate((el) => getComputedStyle(el).opacity);
  const free = svg.locator('.lbl-node.lbl-free');
  /* 游離的標籤圓點平常是 0.72（屬性），不被聚焦的樣式蓋掉 */
  await expect.poll(() => op(free)).toBe('0.72');
  /* 合成層數（Chromium 的 LayerTree）：平常幾層 → 滑過、移開時最多幾層 */
  const cdp = await page.context().newCDPSession(page);
  let layers = 0;
  let maxLayers = 0;
  cdp.on('LayerTree.layerTreeDidChange', (e) => {
    if (!e.layers) return;
    layers = e.layers.filter((l) => l.drawsContent).length;
    maxLayers = Math.max(maxLayers, layers);
  });
  await cdp.send('LayerTree.enable');
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    document.body.style.outline = '1px solid transparent';
  });
  await page.waitForTimeout(500);
  const idle = layers;
  expect(idle).toBeGreaterThan(0);
  maxLayers = idle;
  /* 滑過：轉場是 0.2 秒 ease（同之前），但動的是 --rc-op（主執行緒），不是 opacity（每個元素各自一個合成層） */
  const p = await nodeCenter(page, hub);
  /* 聚焦一套上就收集正在跑的轉場 */
  const animsP = page.evaluate(
    () =>
      new Promise<string[]>((res) => {
        const el = document.querySelector('[data-testid=chart] svg.rc-chart');
        if (!el) return res([]);
        const mo = new MutationObserver(() => {
          if (!el.classList.contains('focus-active')) return;
          mo.disconnect();
          res(
            document
              .getAnimations()
              .filter(
                (a) =>
                  a instanceof CSSTransition &&
                  (a.effect as KeyframeEffect | null)?.target?.closest('[data-testid=chart]'),
              )
              .map((a) => {
                const t = (a.effect as KeyframeEffect).getTiming();
                return `${(a as CSSTransition).transitionProperty} ${t.duration} ${t.easing}`;
              }),
          );
        });
        mo.observe(el, { attributes: true, attributeFilter: ['class'] });
      }),
  );
  await page.mouse.move(p.x, p.y);
  const anims = await animsP;
  await expect(svg).toHaveClass(/focus-active/);
  expect(anims.length).toBeGreaterThan(5);
  expect([...new Set(anims)]).toEqual(['--rc-op 200 ease']);
  await page.waitForTimeout(600);
  /* 淡化程度照舊：一度關係 1、其他角色 0.15、其他線 0.07；游離標籤 0.15 */
  expect(await op(node(page, hub))).toBe('1');
  expect(await op(node(page, mate))).toBe('1');
  expect(await op(node(page, far.id))).toBe('0.15');
  expect(await op(edge(r0.id))).toBe('1');
  expect(await op(edge(farRel.id))).toBe('0.07');
  expect(await op(free)).toBe('0.15');
  expect(maxLayers - idle).toBeLessThanOrEqual(2);
  /* 移開：淡回原樣（同樣只走主執行緒） */
  const before = layers;
  maxLayers = layers;
  await page.mouse.move(0, 0);
  await expect(svg).not.toHaveClass(/focus-active/);
  await page.waitForTimeout(600);
  expect(await op(node(page, far.id))).toBe('1');
  expect(await op(edge(farRel.id))).toBe('1');
  expect(await op(free)).toBe('0.72');
  expect(maxLayers - before).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('便利貼字級（7.11，F190d）：小於 1＝留空、照原作捨去成整數；本分頁預設字級小於 1＝自動、1～5.x＝6', async ({
  page,
}) => {
  const errors = await open(page);
  const a = trio();
  a.notes = [
    {
      id: 900,
      text: '便利貼',
      x: 500,
      y: 700,
      w: 150,
      h: 100,
      size: 30,
      locked: false,
      bare: false,
      chart: null,
    },
  ];
  await seed(page, project([a]));
  await clickAt(page, await center(noteBtn(page, 900, 'cfg')));
  await expect(title(page)).toHaveText('便利貼設定');
  const fs = page.getByRole('spinbutton', { name: '字級 px（≥1）' });
  const now = page.getByTestId('note-fs-now');
  /* 0.5～0.99＝留空（跟隨），不是 1 px */
  for (const v of ['0.5', '0.99']) {
    await fs.fill('22');
    await fs.press('Enter');
    await expect(fs).toHaveValue('22');
    await page.waitForTimeout(450);
    await fs.fill(v);
    await fs.press('Enter');
    await expect(fs).toHaveValue('');
    await expect(now).not.toHaveText('目前實際字級：1 px');
    expect((await sheet(page)).notes[0].size).toBeNull();
  }
  /* 捨去（原作 parseInt）：1.5 → 1、2.7 → 2 */
  await fs.fill('1.5');
  await fs.press('Enter');
  await expect(fs).toHaveValue('1');
  await expect(now).toHaveText('目前實際字級：1 px');
  await page.waitForTimeout(450);
  await fs.fill('2.7');
  await fs.press('Enter');
  await expect(fs).toHaveValue('2');
  expect((await sheet(page)).notes[0].size).toBe(2);
  /* 留空後看本分頁預設字級 */
  await page.waitForTimeout(450);
  await fs.fill('');
  await fs.press('Enter');
  const def = page.getByRole('spinbutton', { name: '本分頁預設字級' });
  await def.fill('3');
  await def.press('Enter');
  await expect(def).toHaveValue('6');
  await expect(now).toHaveText('目前實際字級：6 px');
  expect((await sheet(page)).settings.defStickySize).toBe(6);
  await page.waitForTimeout(450);
  await def.fill('12.5');
  await def.press('Enter');
  await expect(def).toHaveValue('12.5');
  await expect(now).toHaveText('目前實際字級：12.5 px');
  await page.waitForTimeout(450);
  await def.fill('0.5');
  await def.press('Enter');
  await expect(def).toHaveValue('');
  await expect(now).not.toHaveText('目前實際字級：1 px');
  expect((await sheet(page)).settings.defStickySize).toBe(0);
  /* 一步復原回 12.5 */
  await page.getByTestId('undo').click();
  await expect(def).toHaveValue('12.5');
  expect(errors).toEqual([]);
});

/* ---------- 第五批：版本與動畫 ---------- */

/** GIF 的寬高、存下來的格數、每格延遲（百分之一秒）的總和 */
function readGif(b: Uint8Array): { sig: string; w: number; h: number; frames: number; cs: number } {
  const sig = String.fromCharCode(...b.slice(0, 6));
  const w = b[6] | (b[7] << 8);
  const h = b[8] | (b[9] << 8);
  let i = 13;
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));
  const skipSub = () => {
    while (b[i]) i += b[i] + 1;
    i++;
  };
  let frames = 0;
  let cs = 0;
  while (i < b.length) {
    const t = b[i++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[i++];
      if (label === 0xf9) cs += b[i + 2] | (b[i + 3] << 8);
      skipSub();
    } else if (t === 0x2c) {
      const packed = b[i + 8];
      i += 9;
      if (packed & 0x80) i += 3 * (1 << ((packed & 7) + 1));
      i++;
      skipSub();
      frames++;
    } else break;
  }
  return { sig, w, h, frames, cs };
}

/** 讀原作的時間軸範例（b45-timeline-notes 的 project.json；圖檔不附） */
async function openLegacyTimeline(page: Page) {
  const data0 = readFileSync(
    `${process.cwd()}/tests/unit/fixtures/relation-chart-b5-timeline.json`,
    'utf8',
  );
  const zip = Buffer.from(zipSync({ '專案/project.json': strToU8(data0) }));
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    openProjectItem(page, '開啟專案檔…'),
  ]);
  await fc.setFiles({ name: 'timeline.zip', mimeType: 'application/zip', buffer: zip });
  await expect(toast(page, /已讀入原作的專案：3 張分頁/)).toBeVisible();
  await expect(toast(page, /已略過/)).toHaveCount(0);
  await page.getByTestId('sheet-tab').nth(1).click();
  await expect(page.getByTestId('frame-bar')).toBeVisible();
}

const charX = (s: Sheet, id: number) => s.chars.find((c) => c.id === id)?.x;
const charCell = (page: Page, k: number) => page.getByTestId('tl-cell-chars').nth(k);

test('時間軸分頁（F028）：轉換、新增影格（延續上一格）＝保持、拖角色自動打關鍵、切影格不記一步、復原跳回那一格、秒數、速度、眼睛與鎖、刪除影格、播放、轉回', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, project([trio()]));
  await more(page, 'menu-timeline');
  await page.getByRole('alertdialog').getByRole('button', { name: '轉換' }).click();
  const marks = page.getByTestId('tl-mark');
  await expect(marks).toHaveCount(1);
  await expect(page.getByTestId('sheet-tab').first()).toContainText('時間軸分頁 1');
  /* 新增影格（延續上一格）：四條軌道都是保持 */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: /^新增影格（延續上一格）/ }).click();
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(charCell(page, 1)).toHaveAttribute('aria-label', '第 2 格的「角色與關係」：保持');
  /* 第 2 格拖角色＝那一層自動變成關鍵影格 */
  await page.waitForTimeout(450);
  const a = await nodeCenter(page, 1);
  await drag(page, a, { x: a.x + 120, y: a.y });
  await expect(charCell(page, 1)).toHaveAttribute(
    'aria-label',
    '第 2 格的「角色與關係」：關鍵影格',
  );
  let s = await sheet(page);
  const moved = charX(s, 1) as number;
  expect(moved).toBeGreaterThan(300);
  expect(s.tl?.frames[1].hold).not.toContain('chars');
  /* 切到第 1 格：角色回到第 1 格的位置；切影格不記一步 */
  await marks.nth(0).click();
  s = await sheet(page);
  expect(s.tl?.active).toBe(0);
  expect(charX(s, 1)).toBe(250);
  /* 復原：拖曳那一步在第 2 格＝跳回第 2 格再復原 */
  await page.getByTestId('undo').click();
  s = await sheet(page);
  expect(s.tl?.active).toBe(1);
  expect(charX(s, 1)).toBe(250);
  await expect(charCell(page, 1)).toHaveAttribute('aria-label', '第 2 格的「角色與關係」：保持');
  /* 重做＝回到按復原時的樣子（在第 1 格），第 2 格又是拖過的關鍵影格 */
  await page.getByTestId('redo').click();
  s = await sheet(page);
  expect(s.tl?.active).toBe(0);
  expect(s.tl?.frames[1].chars.find((c) => c.id === 1)?.x).toBe(moved);
  await expect(charCell(page, 1)).toHaveAttribute(
    'aria-label',
    '第 2 格的「角色與關係」：關鍵影格',
  );
  /* 第 2 格的角色層改回保持（確認） */
  await marks.nth(1).click();
  s = await sheet(page);
  expect(charX(s, 1)).toBe(moved);
  await page.waitForTimeout(450);
  await charCell(page, 1).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '改成保持' }).click();
  await expect(charCell(page, 1)).toHaveAttribute('aria-label', '第 2 格的「角色與關係」：保持');
  s = await sheet(page);
  expect(charX(s, 1)).toBe(250);
  /* 秒數：按兩下第 1 格 */
  await page.waitForTimeout(450);
  await marks.nth(0).dblclick();
  const dur = page.getByTestId('tl-dur');
  await dur.getByRole('spinbutton', { name: '影格播放時間' }).fill('2.5');
  await page.getByTestId('tl-dur-ok').click();
  s = await sheet(page);
  expect(s.tl?.frames[0].dur).toBe(2.5);
  await expect(marks.nth(0)).toHaveAttribute('title', /2\.5秒/);
  /* 速度：1× → 1.5× */
  await page.waitForTimeout(450);
  await page.getByTestId('tl-speed').click();
  await expect(page.getByTestId('tl-speed')).toHaveText('1.5×');
  /* 眼睛（只影響編輯畫面）與鎖 */
  await page.waitForTimeout(450);
  await page.getByTestId('tl-eye-chars').click();
  await expect(page.getByTestId('tl-eye-chars')).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(450);
  await page.getByTestId('tl-lock-notes').click();
  s = await sheet(page);
  expect(s.tl).toMatchObject({ speed: 1.5, hidden: ['chars'], locked: ['notes'] });
  /* 每一項都能復原 */
  await page.getByTestId('undo').click();
  await page.getByTestId('undo').click();
  await page.getByTestId('undo').click();
  s = await sheet(page);
  expect(s.tl).toMatchObject({ speed: 1, hidden: [], locked: [] });
  /* 刪除模式：點第 2 格＝刪除；復原回來 */
  await page.waitForTimeout(450);
  await page.getByTestId('tl-del-mode').click();
  await marks.nth(1).click();
  await expect(marks).toHaveCount(1);
  await page.getByTestId('undo').click();
  await expect(marks).toHaveCount(2);
  await page.getByTestId('tl-del-mode').click();
  /* 播放：播到最後一格停在「2」 */
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.getByTestId('transport-time')).toHaveText(/^2／2/, { timeout: 8000 });
  /* 轉回一般分頁（只留目前影格） */
  await marks.nth(0).click();
  await page.waitForTimeout(450);
  await more(page, 'menu-timeline');
  await page.getByRole('alertdialog').getByRole('button', { name: '轉回' }).click();
  await expect(page.getByTestId('frame-bar')).toHaveCount(0);
  s = await sheet(page);
  expect(s.tl).toBeNull();
  expect(errors).toEqual([]);
});

test('讀原作的時間軸（4 格、保持、秒數、鎖、1.5 倍速）；GIF（20 fps、960 × 785、和原作同長）、再次匯出、互動網頁的動畫', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await openLegacyTimeline(page);
  await expect(page.getByTestId('tl-mark')).toHaveText(['1', '2', '3', '4']);
  await expect(page.getByTestId('tl-speed')).toHaveText('1.5×');
  const keys = await page
    .getByTestId('tl-cell-chars')
    .evaluateAll((els) => els.map((e) => e.hasAttribute('data-key')));
  expect(keys).toEqual([true, false, true, false]);
  await expect(page.getByTestId('tl-lock-bg')).toHaveAttribute('aria-pressed', 'true');
  /* GIF：計畫和原作相同（65 格、960 × 785） */
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  await dlg.getByRole('radio', { name: 'GIF／影片' }).click();
  await dlg.getByRole('radio', { name: 'GIF 動畫' }).click();
  await expect(dlg.getByText(/65 格、960 × 785、約 4\.20 秒/).first()).toBeVisible();
  await dlg.getByRole('button', { name: '匯出 GIF 動畫' }).click();
  const link = dlg.getByRole('link', { name: '下載' });
  await expect(link).toBeVisible({ timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(dl.suggestedFilename()).toBe('第一章（時間軸）.gif');
  const gif = readGif(new Uint8Array(readFileSync((await dl.path()) as string)));
  /* 相同的連續畫面合併成一格（延遲相加）：總長和原作相同 */
  expect(gif).toMatchObject({ sig: 'GIF89a', w: 960, h: 785, cs: 420 });
  expect(gif.frames).toBeLessThanOrEqual(65);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  /* 再次匯出：記得 GIF */
  const again = page.getByTestId('export-again');
  await expect(again).toHaveAttribute('aria-label', /GIF/);
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    again.click(),
  ]);
  expect(dl2.suggestedFilename()).toMatch(/\.gif$/);
  /* 互動網頁：預先算好的動畫，帶每格秒數與速度 */
  const html = strFromU8((await runExport(page, '互動網頁（唯讀）', { scope: '目前分頁' })).bytes);
  expect(html).toContain('id="animBar"');
  const w = await context.newPage();
  const vErrors: string[] = [];
  w.on('pageerror', (e) => vErrors.push(e.message));
  await w.route('**/*', (r) =>
    r.request().url() === 'http://viewer.test/'
      ? r.fulfill({ body: html, contentType: 'text/html' })
      : r.abort(),
  );
  await w.goto('http://viewer.test/');
  await expect(w.locator('#animTime')).toHaveText('1 / 4');
  await w.locator('#animPlay').click();
  await expect(w.locator('#animTime')).toHaveText('4 / 4', { timeout: 10000 });
  expect(vErrors).toEqual([]);
  await w.close();
  expect(errors).toEqual([]);
});

test('時間軸分頁刪除關係類型：確認的線數算每一格（第一章的「戀愛」在第 1、3 格各一條＝2 條，7.13）', async ({
  page,
}) => {
  const errors = await open(page);
  await openLegacyTimeline(page);
  await page.getByTestId('type-row').first().getByTestId('type-edit').click();
  await page.getByTestId('type-delete').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('刪除這種關係及 2 條相關的線？');
  await confirm.getByRole('button', { name: '取消' }).click();
  expect(errors).toEqual([]);
});

test('背景層鎖住時：「匯入背景圖片」「移除背景圖片」都停用並附說明（設定面板與更多選單，7.13）', async ({
  page,
}) => {
  const errors = await open(page);
  await openLegacyTimeline(page);
  const LOCK = '背景層鎖住了（時間軸的圖層鎖）';
  await expect(page.getByTestId('tl-lock-bg')).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByTestId('inspector');
  for (const name of ['匯入背景圖片…', '移除背景圖片']) {
    const b = panel.getByRole('button', { name });
    await expect(b).toBeDisabled();
    await expect(b).toHaveAttribute('title', LOCK);
  }
  await expect(panel.getByTestId('bg-lock-note')).toHaveText(LOCK);
  await page.getByTestId('more-menu').click();
  for (const name of ['匯入背景圖片…', '移除背景圖片']) {
    const it = page.getByRole('menuitem', { name });
    await expect(it).toHaveAttribute('aria-disabled', 'true');
    await expect(it).toHaveAttribute('title', LOCK);
  }
  await page.keyboard.press('Escape');
  /* 解鎖：照常可用、沒有說明（這份檔沒有帶背景圖，「移除」照舊停用、但不寫鎖住） */
  await page.getByTestId('tl-lock-bg').click();
  await expect(panel.getByRole('button', { name: '匯入背景圖片…' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: '移除背景圖片' })).not.toHaveAttribute('title');
  await expect(panel.getByTestId('bg-lock-note')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('影片：檔頭寫著總長（即時錄的 WebM 也補上 Duration，7.13）、時長約 4.2 秒、尺寸 1100 × 900、每一格都是畫好的畫面', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await openLegacyTimeline(page);
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  await dlg.getByRole('radio', { name: 'GIF／影片' }).click();
  await dlg.getByRole('radio', { name: '影片（MP4／WebM）' }).click();
  await dlg.getByRole('button', { name: /^匯出 / }).click();
  const link = dlg.getByRole('link', { name: '下載' });
  await expect(link).toBeVisible({ timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(dl.suggestedFilename()).toMatch(/^第一章（時間軸）\.(webm|mp4)$/);
  const bytes = readFileSync((await dl.path()) as string);
  /* 一打開（loadedmetadata）就有總長，不必跳到尾端才知道 */
  const w = await context.newPage();
  const html = '<!doctype html><body></body>';
  await w.route('**/*', (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await w.goto('http://viewer.test/');
  const meta = await w.evaluate(
    async ([b64, type]) => {
      const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const v = document.createElement('video');
      v.muted = true;
      v.src = window.URL.createObjectURL(new Blob([u], { type }));
      await new Promise((r) => {
        v.onloadedmetadata = r;
      });
      const duration = v.duration;
      /* 每一格都是畫好的畫面：戀人（300, 300）、摯友（300, 620）的白色圖示一直在（只有背景的半成品格＝閃一下） */
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      const lum = (x: number, y: number) => {
        const d = g.getImageData(x, y, 1, 1).data;
        return (d[0] + d[1] + d[2]) / 3;
      };
      let frames = 0;
      let holes = 0;
      await new Promise<void>((resolve) => {
        const cb = () => {
          g.drawImage(v, 0, 0);
          frames++;
          if (lum(300, 300) < 180 && lum(300, 620) < 180) holes++;
          if (!v.ended) v.requestVideoFrameCallback(cb);
        };
        v.requestVideoFrameCallback(cb);
        v.onended = () => setTimeout(resolve, 100);
        v.playbackRate = 0.25;
        void v.play();
      });
      return { duration, w: v.videoWidth, h: v.videoHeight, frames, holes };
    },
    [
      bytes.toString('base64'),
      dl.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    ],
  );
  expect(Number.isFinite(meta.duration)).toBe(true);
  expect(meta.duration).toBeGreaterThan(4.0);
  expect(meta.duration).toBeLessThan(4.5);
  expect([meta.w, meta.h]).toEqual([1100, 900]);
  expect(meta.frames).toBeGreaterThan(30);
  expect(meta.holes).toBe(0);
  await w.close();
  expect(errors).toEqual([]);
});

test('時間軸的預覽與模式跟著分頁：預覽中（拖過時間軸）、複製模式中切到別的分頁＝結束（原作 switchSheet），一般分頁照樣能拖角色', async ({
  page,
}) => {
  const errors = await open(page);
  await openLegacyTimeline(page);
  const hint = page.getByTestId('frame-bar').locator('[aria-live=polite]');
  await page.getByRole('slider', { name: '時間軸' }).focus();
  await page.keyboard.press('PageUp');
  await expect(hint).toHaveText('預覽中：左鍵不能編輯，點影格標記回到編輯');
  await expect(page.getByTestId('canvas')).toHaveClass(/rc-preview/);
  /* 切到一般分頁：拖得動角色 */
  await page.getByTestId('sheet-tab').nth(2).click();
  await expect(page.getByTestId('frame-bar')).toHaveCount(0);
  const before = (await sheet(page)).chars[0];
  const a = await nodeCenter(page, before.id);
  await drag(page, a, { x: a.x + 60, y: a.y + 40 });
  await expect.poll(async () => (await sheet(page)).chars[0].x).not.toBe(before.x);
  /* 回到時間軸分頁：不在預覽；複製模式中切走再回來＝模式結束 */
  await page.getByTestId('sheet-tab').nth(1).click();
  await expect(hint).toHaveText('');
  await expect(page.getByTestId('canvas')).not.toHaveClass(/rc-preview/);
  await page.getByTestId('tl-copy-mode').click();
  await expect(page.getByTestId('tl-copy-mode')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('sheet-tab').nth(2).click();
  await page.getByTestId('sheet-tab').nth(1).click();
  await expect(page.getByTestId('tl-copy-mode')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('時間軸的播放列：「回到開頭」→ 暫停並停在第 1 格（預覽中）；「重播」仍是從頭播放', async ({
  page,
}) => {
  const errors = await open(page);
  await openLegacyTimeline(page);
  const time = page.getByTestId('transport-time');
  const hint = page.getByTestId('frame-bar').locator('[aria-live=polite]');
  const play = page.getByRole('button', { name: '播放', exact: true });
  /* 播放到第 2 格以後 → 回到開頭 */
  await play.click();
  await expect(time).not.toHaveText(/^1／4/, { timeout: 15_000 });
  await page.getByRole('button', { name: '回到開頭', exact: true }).click();
  await expect(play).toBeVisible();
  await expect(time).toHaveText(/^1／4/);
  await expect(hint).toHaveText('預覽中：左鍵不能編輯，點影格標記回到編輯');
  await page.waitForTimeout(700);
  await expect(time).toHaveText(/^1／4/);
  /* 「重播」＝從頭播放 */
  await page.getByRole('button', { name: '重播', exact: true }).click();
  await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
  await expect(time).not.toHaveText(/^1／4/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('390 寬：時間軸分頁的影格列、匯出對話框（格式多了 GIF／影片時換行、不截字）、分頁庫與快照頁籤沒有橫向捲動', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await openLegacyTimeline(page);
  await noHorizontalScroll(page);
  await page.getByTestId('open-export').click();
  const dlg = page.getByRole('dialog', { name: '匯出' });
  const fmts = dlg.getByRole('radiogroup', { name: '格式' }).first().getByRole('radio');
  await expect(fmts).toHaveText([
    'PNG（圖片）',
    '分層 SVG',
    '分層 PSD',
    '互動網頁（唯讀）',
    'GIF／影片',
  ]);
  /* 每個格式的字都完整顯示（放不下就換行，不截成「分…」） */
  const cut = await fmts.evaluateAll(
    (els) =>
      els.filter((el) => {
        const t = el.querySelector('span') ?? el;
        return t.scrollWidth > t.clientWidth + 1;
      }).length,
  );
  expect(cut).toBe(0);
  await fmts.filter({ hasText: 'GIF／影片' }).click();
  await noHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('library-open').click();
  await page.getByTestId('library-tab-sheets').click();
  await noHorizontalScroll(page);
  await page.getByTestId('library-tab-snaps').click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('分頁庫（F027）：刪除分頁＝封存（可以復原）；匯入當前（面板留著，7.10）、複製、刪除（墓碑、不進復原）；全部重設不清分頁庫', async ({
  page,
}) => {
  const errors = await open(page);
  const a = trio();
  a.name = '主線';
  const b = sample('story', 1000, '支線');
  b.memo = '支線的備忘錄';
  await seed(page, project([a, b]));
  const tabs = page.getByTestId('sheet-tab');
  await page.getByTestId('sheet-close').nth(1).click();
  await expect(tabs).toHaveText(['主線']);
  await expect(toast(page, '已刪除分頁「支線」（封存在檔案庫的分頁庫）')).toBeVisible();
  await viewMenu(page, 'menu-memo');
  await page.getByTestId('library-open').click();
  await page.getByTestId('library-tab-sheets').click();
  const entries = lib(page).getByTestId('lib-entry');
  await expect(entries.getByTestId('lib-entry-name')).toHaveText(['支線']);
  await expect(entries.getByTestId('lib-entry-meta')).toHaveText([/^6 角色 · \d+ 關係 · /]);
  /* 角色庫：封存的分頁也算在用（「1 分頁 · 分頁庫 1」；只看未使用不列；原作 libUsageBin） */
  await page.getByTestId('library-tab-chars').click();
  const hero = lib(page).getByTestId('lib-entry').filter({ hasText: '主角' });
  await expect(hero.getByTestId('lib-entry-meta')).toHaveText('1 分頁 · 分頁庫 1');
  await lib(page).getByRole('switch', { name: '只看未使用的變體' }).click();
  await expect(hero).toHaveCount(0);
  await lib(page).getByRole('switch', { name: '只看未使用的變體' }).click();
  await page.getByTestId('library-tab-sheets').click();
  /* 匯入當前：加成新分頁並切過去；備忘錄面板留著、換成那一張的 */
  await page.getByTestId('library-act-import').click();
  await entries.first().click();
  await expect(tabs).toHaveText(['主線', '支線']);
  await expect(title(page)).toHaveText('備忘錄');
  await expect(page.getByTestId('memo-text')).toHaveValue('支線的備忘錄');
  /* 複製模式 */
  await page.getByTestId('library-act-copy').click();
  await entries.first().click();
  await expect(entries.getByTestId('lib-entry-name')).toHaveText(['支線', '支線（複製）']);
  /* 刪除模式：留墓碑，離開模式才收掉；不進復原 */
  await page.getByTestId('library-act-del').click();
  await entries.nth(1).click();
  await expect(lib(page).getByTestId('lib-ghost')).toHaveCount(1);
  await page.getByTestId('library-act-del').click();
  await expect(lib(page).getByTestId('lib-ghost')).toHaveCount(0);
  await expect(entries.getByTestId('lib-entry-name')).toHaveText(['支線']);
  /* 復原只回到匯入前（分頁庫照舊一筆） */
  await page.getByTestId('undo').click();
  await expect(tabs).toHaveText(['主線']);
  let p = await data(page);
  expect(p.sheetLib.map((x) => x.name)).toEqual(['支線']);
  /* 全部重設：分頁庫留著 */
  await lib(page).getByTestId('library-close').click();
  await openProjectItem(page, '全部重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(tabs).toHaveText(['分頁1']);
  p = await data(page);
  expect(p.sheetLib.map((x) => x.name)).toEqual(['支線']);
  expect(errors).toEqual([]);
});

test('版本快照（F015）：建立（沒名字＝手動快照、命名）、還原整份（先拍「還原前」、可以復原）、只取一個分頁（面板留著，7.10）、匯出全部、匯入原作的備份並取回分頁；全部重設不清快照', async ({
  page,
}) => {
  const errors = await open(page);
  const a = trio();
  a.name = '主線';
  const b = sample('story', 1000, '支線');
  await seed(page, project([a, b]));
  const tabs = page.getByTestId('sheet-tab');
  /* 專案選單：建立快照 */
  await openProjectItem(page, '建立快照');
  await expect(toast(page, '已建立快照（檔案庫 › 快照）')).toBeVisible();
  /* 改一點：刪掉第二張 */
  await page.getByTestId('sheet-close').nth(1).click();
  await expect(tabs).toHaveText(['主線']);
  /* 查看快照 → 命名一份（開頁後的自動快照可能也在清單最後） */
  await openProjectItem(page, '查看快照…');
  const entries = lib(page).getByTestId('lib-entry');
  const names = entries.getByTestId('lib-entry-name');
  const manual = entries.filter({ hasText: '手動快照' });
  await expect(names.first()).toHaveText('手動快照');
  await page.getByTestId('snap-name').fill('只剩主線');
  await page.getByTestId('snap-take').click();
  await expect(names.first()).toHaveText('只剩主線');
  await expect(manual).toHaveCount(1);
  /* 搜尋：比對名稱與拍照時的分頁名；沒有符合的寫「快照」 */
  await lib(page).getByTestId('library-search').fill('支線');
  await expect(names).toContainText(['手動快照']);
  await lib(page).getByTestId('library-search').fill('沒有這個');
  await expect(lib(page).getByText('沒有符合搜尋的快照。')).toBeVisible();
  await lib(page).getByTestId('library-search').fill('');
  /* 還原整份：先拍「還原前」，可以復原 */
  await manual.click();
  await expect(page.getByTestId('snap-panel-name')).toHaveText('手動快照');
  await page.getByTestId('snap-restore').click();
  await expect(toast(page, '已還原快照')).toBeVisible();
  await expect(tabs).toHaveText(['主線', '支線']);
  await page.getByTestId('snap-back').click();
  await expect(names.first()).toHaveText('還原前');
  await page.getByTestId('undo').click();
  await expect(tabs).toHaveText(['主線']);
  /* 只取一個分頁：加成新分頁，統計面板留著 */
  await viewMenu(page, 'menu-stats');
  await manual.click();
  await page.getByTestId('snap-pick-sheet').filter({ hasText: '支線' }).click();
  await expect(toast(page, '已把該分頁加入為新分頁')).toBeVisible();
  await expect(tabs).toHaveText(['主線', '支線']);
  await expect(title(page)).toHaveText('統計與尋路（本分頁）');
  await expect(page.getByTestId('stats-rank').getByTestId('stats-row').first()).toHaveText(
    '1.主角5',
  );
  /* 匯出全部 */
  await page.getByTestId('snap-back').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('snap-export').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^快照備份_\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  const manifest = JSON.parse(strFromU8(files['snapshots/snapshots.json']));
  expect(manifest).toMatchObject({ v: 1, tool: 'relation-chart' });
  expect(manifest.snaps.length).toBe(await entries.count());
  /* 匯入原作「匯出全部」的備份：3 份都當成手動快照 */
  const n0 = await entries.count();
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('snap-import').click(),
  ]);
  await fc.setFiles(`${process.cwd()}/tests/unit/fixtures/relation-chart-b5-snapshots.zip`);
  await expect(toast(page, '已匯入 3 份快照（跳過 0 份重複的）')).toBeVisible();
  await expect(entries).toHaveCount(n0 + 3);
  await expect(entries.filter({ hasText: '第一份（手動）' })).toHaveCount(1);
  /* 從原作的快照取回「範例：家族樹」；統計面板照樣留著 */
  await entries.filter({ hasText: '第一份（手動）' }).click();
  await page.getByTestId('snap-pick-sheet').filter({ hasText: '範例：家族樹' }).click();
  /* 前面取回分頁的同一句通知可能還沒消失：看最新的那一則 */
  await expect(toast(page, '已把該分頁加入為新分頁').last()).toBeVisible();
  await expect(tabs).toHaveText(['主線', '支線', '範例：家族樹']);
  await expect(title(page)).toHaveText('統計與尋路（本分頁）');
  /* 全部重設：快照不清 */
  await lib(page).getByTestId('library-close').click();
  await openProjectItem(page, '全部重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(tabs).toHaveText(['分頁1']);
  await openProjectItem(page, '查看快照…');
  await expect(entries).toHaveCount(n0 + 3);
  expect(errors).toEqual([]);
});
