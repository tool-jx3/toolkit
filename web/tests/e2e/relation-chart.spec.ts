/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 角色關係圖產生器（建置產物 next/relation-chart/）的端對端測試（規格 docs/refactor/specs/relation-chart.md）：
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
import { buildSample, type SampleKey } from '../../src/tools/relation-chart/logic/samples';
import { makeChar, makeRel, makeType } from '../../src/tools/relation-chart/model/factory';
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
  return { sheets, active: 0, labels: [], nextId: 90000, font: 'sans', ...extra };
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
  await seed(page, project([s0], { labels: [{ id: 77, text: '甲班' }] }));
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
    project([s0, sample('mind', 1000, '靈感')], { labels: [{ id: 7, text: '主角群' }] }),
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
  expect(pj).toMatchObject({ format: 'trpg-toolkit-project', tool: 'relation-chart', version: 1 });
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
  await expect(toast(page, /便利貼/)).toBeVisible();
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
  /* 原作匯入的字型檔（f:…）對應不到：改用黑體，列在略過的內容 */
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
  await expect(toast(page, /匯入的文件字型/).first()).toBeVisible();
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
