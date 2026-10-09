/**
 * 劇本心得九宮格（建置產物 next/review-grid/）的端對端測試（規格 docs/refactor/specs/review-grid.md）：
 * - 開頁沒有錯誤、預設 9 格（900 × 900、2 倍 1800 × 1800）、頁尾只有靈感來源；
 * - 格子：點預覽選取、加一格、刪除（至少一格）、排序、欄位畫到預覽上；
 * - 心得標籤：選 3 個、第 4 個提醒、取消、自己寫一個；標籤清單（改字、刪除、回到預設）；
 * - 圖片：這一格、一次放入多張、拖到預覽上的格子、貼上（滑鼠指著的／選取的格子）、頭像、拿掉；
 * - 排列與比例（清單、依原圖）；下載 PNG（檔名、倍率、像素）；
 * - 自動儲存與還原（含圖片）、復原／重做；專案檔（ZIP、重設、開啟、缺圖片）；原作的資料備份；
 * - 比較多人的心得；390 寬沒有橫向捲動；1280 與 390 的視覺基準；
 * - 對等驗證後的修正（規格 7.1）：同一批的通知合成一則、存不進瀏覽器的提醒、開頁的圖片整理不刪讀到一半的圖（假時鐘＋CPU 變慢）、
 *   比較區不是專案檔的檔、標籤欄的字數／上限。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('review-grid') ?? { id: 'review-grid', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:review-grid';
const CELL_W = (800 - 60) / 3;

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Stored {
  view: string;
  ratio: string;
  profile: { image: { id: string } | null; name: string; handle: string };
  cells: {
    id: string;
    image: { id: string; name: string; width: number; height: number } | null;
    rule: string;
    title: string;
    writer: string;
    tags: string[];
    comment: string;
  }[];
  tags: string[];
}

/* ---------- 共用 ---------- */

const hex = (c: string): Rgba => [
  Number.parseInt(c.slice(1, 3), 16),
  Number.parseInt(c.slice(3, 5), 16),
  Number.parseInt(c.slice(5, 7), 16),
  255,
];

async function solidPng(color: string, w = 60, h = 60): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  const c = hex(color);
  for (let i = 0; i < w * h; i++) px.set(c, i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

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
  await expect(page.getByRole('heading', { level: 1, name: '劇本心得九宮格' })).toBeVisible();
  return errors;
}

const canvas = (page: Page) => page.getByTestId('card-canvas');
const editor = (page: Page) => page.getByTestId('cell-editor');
const picker = (page: Page) => page.getByTestId('tag-picker');
const cellList = (page: Page) => page.getByRole('list', { name: '格子清單' });
const region = (page: Page, key: string) => page.locator(`[data-region="${key}"]`);
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const dropInput = (page: Page, name: string) =>
  page.getByRole('group', { name }).locator('input[type=file]');

async function state(page: Page): Promise<Stored> {
  const d = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
  /* 還沒有任何變更、還沒寫過時是預設的內容 */
  return (
    d ?? {
      view: 'grid',
      ratio: 'square',
      profile: { image: null, name: '', handle: '' },
      cells: Array.from({ length: 9 }, (_, i) => cell(i + 1)),
      tags: [],
    }
  );
}

async function seed(page: Page, data: Partial<Stored>) {
  await page.evaluate(
    ({ key, data }) => {
      const cur = JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data ?? {};
      localStorage.setItem(
        key,
        JSON.stringify({ state: { data: { ...cur, ...data } }, version: 1 }),
      );
    },
    { key: STORAGE_KEY, data },
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '劇本心得九宮格' })).toBeVisible();
}

const cell = (i: number, over: Partial<Stored['cells'][number]> = {}) => ({
  id: `c${i}`,
  image: null,
  rule: '',
  title: '',
  writer: '',
  tags: [],
  comment: '',
  ...over,
});

async function pixel(target: Locator, x: number, y: number): Promise<Rgba> {
  return target.evaluate(
    (el, [x, y]) => {
      const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as [
        number,
        number,
        number,
        number,
      ];
    },
    [x, y],
  );
}

const near = (a: number[], b: number[], tol = 6) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

/** 第 i 格（從 0 起）圖片框中央的畫布座標（九宮格、正方形、沒有個人資料時） */
const cellCenter = (i: number, top = 50): [number, number] => [
  Math.round(50 + (i % 3) * (CELL_W + 30) + CELL_W / 2),
  Math.round(top + Math.floor(i / 3) * (CELL_W + 30) + CELL_W / 2),
];

/** 畫布座標 → 螢幕座標 */
async function screenAt(page: Page, x: number, y: number) {
  const c = canvas(page);
  const b = await c.boundingBox();
  const [w, h] = ((await c.getAttribute('data-size')) ?? '1x1').split('x').map(Number);
  if (!b) throw new Error('找不到畫布');
  return { x: b.x + (x / w) * b.width, y: b.y + (y / h) * b.height };
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

async function downloadPng(page: Page): Promise<{ name: string; png: Png }> {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-bar').getByRole('button', { name: '下載 PNG' }).click(),
  ]);
  return { name: dl.suggestedFilename(), png: readPng(readFileSync((await dl.path()) as string)) };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function openProjectItem(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function openProjectFile(page: Page, name: string, bytes: Buffer, mimeType: string) {
  await openProjectItem(page, '開啟專案檔…');
  await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '選擇檔案' }).click(),
  ]);
  await chooser.setFiles(file(name, bytes, mimeType));
}

/** 原作的頁面存的資料備份（內容是自己的測試資料） */
const originalFile = () =>
  readFileSync(new globalThis.URL('../unit/fixtures/review-grid-original.json', import.meta.url));

async function saveProject(page: Page): Promise<{ name: string; bytes: Buffer }> {
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
}

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、預設 9 格、900 × 900（2 倍 1800 × 1800）、頁尾只有靈感來源（F08、F23、F30、F45）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-size', '900x900');
  await expect(page.getByTestId('export-size')).toHaveText('1800 × 1800 px');
  await expect(page.getByTestId('cell-count')).toHaveText('9 格');
  await expect(cellList(page).locator('[data-cell-row]')).toHaveCount(9);
  await expect(editor(page)).toHaveAttribute('data-cell', 'c1');
  await expect(
    page.getByLabel('設定').getByRole('button', { name: '第 1 格', exact: true }),
  ).toBeVisible();
  /* 白底、灰色的圖片框 */
  expect(near(await pixel(canvas(page), 10, 10), [255, 255, 255])).toBe(true);
  expect(near(await pixel(canvas(page), ...cellCenter(0)), [0xe9, 0xec, 0xef])).toBe(true);
  expect(near(await pixel(canvas(page), ...cellCenter(8)), [0xe9, 0xec, 0xef])).toBe(true);
  /* 20 個預設的心得標籤 */
  await expect(picker(page).getByRole('button')).toHaveCount(20);
  await expect(page.getByTestId('tag-count')).toHaveText('已選 0／3');
  /* 頁尾只有靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/scenario-review',
  );
  await expect(page.locator('a[href*="x.com"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 格子 ---------- */

test('格子：點預覽選取、欄位畫到預覽上、加一格、刪除（至少一格）、排序（F09～F12、F15～F17、F48）', async ({
  page,
}) => {
  const errors = await open(page);
  await region(page, 'cell:c5').click();
  await expect(editor(page)).toHaveAttribute('data-cell', 'c5');
  await expect(
    page.getByLabel('設定').getByRole('button', { name: '第 5 格', exact: true }),
  ).toBeVisible();
  await expect(cellList(page).locator('[data-cell-row="c5"]').locator('..')).toHaveAttribute(
    'aria-current',
    'true',
  );
  await editor(page).getByRole('combobox', { name: '規則' }).fill('CoC 7版');
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).fill('雨夜的訪客');
  await editor(page).getByRole('textbox', { name: '作者' }).fill('某某');
  await editor(page).getByRole('textbox', { name: '作者' }).press('Enter');
  let s = await state(page);
  expect(s.cells[4]).toMatchObject({ rule: 'CoC 7版', title: '雨夜的訪客', writer: '某某' });
  /* 預覽：第二列多了文字，畫布變高；清單的列顯示劇本名稱 */
  await expect(canvas(page)).not.toHaveAttribute('data-size', '900x900');
  await expect(cellList(page).locator('[data-cell-row="c5"]')).toContainText('雨夜的訪客');
  await expect(cellList(page).locator('[data-cell-row="c5"]')).toContainText('第 5 格 · CoC 7版');
  await expect(region(page, 'cell:c5')).toHaveAttribute('aria-label', '第 5 格：雨夜的訪客');
  /* 規則的建議 */
  await expect(page.locator('#rg-rule-suggestions option')).toHaveCount(8);
  /* 加一格 */
  await page.getByRole('button', { name: '加一格' }).click();
  await expect(page.getByTestId('cell-count')).toHaveText('10 格');
  await expect(editor(page)).toHaveAttribute('data-cell', 'c10');
  await expect(canvas(page)).toHaveAttribute('data-size', /^900x/);
  /* 刪除 */
  await cellList(page).getByRole('button', { name: '刪除第 10 格' }).click();
  await expect(page.getByTestId('cell-count')).toHaveText('9 格');
  /* 排序：列有焦點時 Alt＋↓ */
  await cellList(page).locator('[data-cell-row="c1"]').click();
  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(async () => (await state(page)).cells.slice(0, 2).map((c) => c.id))
    .toEqual(['c2', 'c1']);
  /* 至少一格 */
  await seed(page, { cells: [cell(1, { title: '唯一' })] });
  await expect(cellList(page).getByRole('button', { name: '刪除第 1 格' })).toBeDisabled();
  s = await state(page);
  expect(s.cells).toHaveLength(1);
  expect(errors).toEqual([]);
});

/* ---------- 心得標籤 ---------- */

test('心得標籤：選 3 個、第 4 個提醒、取消；自己寫一個；標籤清單改字、刪除、回到預設（F18、F20～F22）', async ({
  page,
}) => {
  const errors = await open(page);
  const tag = (name: string) => picker(page).locator(`[data-tag="${name}"]`);
  await tag('笑到肚子痛').click();
  await tag('劇情完成度超高').click();
  await tag('後勁超強').click();
  await expect(page.getByTestId('tag-count')).toHaveText('已選 3／3');
  await expect(tag('笑到肚子痛')).toHaveAttribute('aria-pressed', 'true');
  expect((await state(page)).cells[0].tags).toEqual(['笑到肚子痛', '劇情完成度超高', '後勁超強']);
  await tag('強力推坑！').click();
  await expect(toast(page, '每一格最多 3 個心得標籤，先取消一個再選。')).toBeVisible();
  await expect(tag('強力推坑！')).toHaveAttribute('aria-pressed', 'false');
  /* 取消 */
  await tag('劇情完成度超高').click();
  expect((await state(page)).cells[0].tags).toEqual(['笑到肚子痛', '後勁超強']);
  /* 自己寫一個：加進清單並選取 */
  const quick = editor(page).getByRole('textbox', { name: '自己寫一個標籤' });
  await quick.fill('KP 帶得超好');
  await quick.press('Enter');
  let s = await state(page);
  expect(s.cells[0].tags).toEqual(['笑到肚子痛', '後勁超強', 'KP 帶得超好']);
  expect(s.tags.at(-1)).toBe('KP 帶得超好');
  await expect(quick).toHaveValue('');
  /* 標籤清單：改字（用到的格子跟著改） */
  await page.getByRole('button', { name: '心得標籤清單' }).click();
  const list = page.getByRole('list', { name: '心得標籤清單' });
  const text = list.getByRole('textbox', { name: '標籤「後勁超強」的文字' });
  await text.fill('後勁好強');
  await text.press('Enter');
  s = await state(page);
  expect(s.tags).toContain('後勁好強');
  expect(s.cells[0].tags).toEqual(['笑到肚子痛', '後勁好強', 'KP 帶得超好']);
  /* 改成已經有的字：還原 */
  const dup = list.getByRole('textbox', { name: '標籤「後勁好強」的文字' });
  await dup.fill('笑到肚子痛');
  await dup.press('Enter');
  await expect(toast(page, '清單裡已經有這個標籤。')).toBeVisible();
  expect((await state(page)).tags.filter((t) => t === '笑到肚子痛')).toHaveLength(1);
  /* 刪除用到的標籤：先確認，格子裡一起拿掉 */
  await list.getByRole('button', { name: '刪除標籤「笑到肚子痛」' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('有 1 格選了這個標籤');
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  s = await state(page);
  expect(s.tags).not.toContain('笑到肚子痛');
  expect(s.cells[0].tags).toEqual(['後勁好強', 'KP 帶得超好']);
  /* 新增 */
  await page.getByRole('textbox', { name: '新的標籤' }).fill('角色扮演很過癮');
  await page.getByRole('button', { name: '加入標籤' }).click();
  expect((await state(page)).tags.at(-1)).toBe('角色扮演很過癮');
  await page.getByRole('textbox', { name: '新的標籤' }).fill('角色扮演很過癮');
  await page.getByRole('button', { name: '加入標籤' }).click();
  await expect(page.getByText('清單裡已經有這個標籤。').first()).toBeVisible();
  /* 回到預設：格子裡的標籤留著（不在清單裡的標示虛線） */
  await page.getByRole('button', { name: '回到預設的標籤' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '回到預設' }).click();
  s = await state(page);
  expect(s.tags).toHaveLength(20);
  expect(s.tags).toContain('笑到肚子痛');
  expect(s.cells[0].tags).toEqual(['後勁好強', 'KP 帶得超好']);
  await expect(picker(page).getByRole('button')).toHaveCount(22);
  await expect(tag('後勁好強')).toHaveAttribute('title', '後勁好強（不在標籤清單裡）');
  expect(errors).toEqual([]);
});

/* ---------- 圖片 ---------- */

test('圖片：這一格、一次放入多張、拖到預覽上的格子、貼上、頭像、拿掉（F04、F07、F13、F14、F24）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 這一格 */
  await dropInput(page, '這一格的圖片').setInputFiles(file('red.png', await solidPng('#dd2222')));
  await expect.poll(async () => (await state(page)).cells[0].image?.name).toBe('red.png');
  await expect
    .poll(async () => near(await pixel(canvas(page), ...cellCenter(0)), [0xdd, 0x22, 0x22]))
    .toBe(true);
  await expect(page.getByTestId('cell-image-field-current')).toContainText('red.png');
  /* 一次放入多張：從頭放進沒有圖片的格子 */
  await dropInput(page, '一次放入多張圖片').setInputFiles([
    file('g.png', await solidPng('#22aa44')),
    file('b.png', await solidPng('#2244cc')),
  ]);
  await expect(toast(page, '已放進 2 格。')).toBeVisible();
  let s = await state(page);
  expect(s.cells.slice(0, 3).map((c) => c.image?.name)).toEqual(['red.png', 'g.png', 'b.png']);
  /* 拖到預覽上的第 6 格（之後的放進後面沒有圖片的格子） */
  const [x6, y6] = cellCenter(5);
  const at6 = await screenAt(page, x6, y6);
  const gold = (await solidPng('#ddaa22')).toString('base64');
  const pink = (await solidPng('#ee66aa')).toString('base64');
  await page.evaluate(
    async ({ files, x, y }) => {
      const dt = new DataTransfer();
      for (const [name, b64] of files) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        dt.items.add(new File([bytes], name, { type: 'image/png' }));
      }
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      window.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    },
    {
      files: [
        ['gold.png', gold],
        ['pink.png', pink],
      ],
      x: at6.x,
      y: at6.y,
    },
  );
  await expect.poll(async () => (await state(page)).cells[5].image?.name).toBe('gold.png');
  s = await state(page);
  expect(s.cells[6].image?.name).toBe('pink.png');
  expect(s.cells[3].image).toBeNull();
  /* 貼上：滑鼠指著第 9 格 */
  const paste = (name: string, b64: string) =>
    page.evaluate(
      ({ name, b64 }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name, { type: 'image/png' }));
        document.body.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
        );
      },
      { name, b64 },
    );
  await region(page, 'cell:c9').hover();
  await paste('teal.png', (await solidPng('#11aaaa')).toString('base64'));
  await expect.poll(async () => (await state(page)).cells[8].image?.name).toBe('teal.png');
  /* 沒有指著格子：選取的格子 */
  await page.mouse.move(5, 5);
  await cellList(page).locator('[data-cell-row="c4"]').click();
  await paste('navy.png', (await solidPng('#112266')).toString('base64'));
  await expect.poll(async () => (await state(page)).cells[3].image?.name).toBe('navy.png');
  /* 頭像：個人資料列出現在最上面，格子往下移 */
  await dropInput(page, '頭像圖片').setInputFiles(file('me.png', await solidPng('#f2711c')));
  await expect.poll(async () => (await state(page)).profile.image).not.toBeNull();
  await expect(canvas(page)).toHaveAttribute('data-size', '900x1040');
  await expect
    .poll(async () => near(await pixel(canvas(page), 100, 100), [0xf2, 0x71, 0x1c]))
    .toBe(true);
  expect(near(await pixel(canvas(page), ...cellCenter(0, 190)), [0xdd, 0x22, 0x22])).toBe(true);
  /* 不是圖片 */
  await dropInput(page, '這一格的圖片').setInputFiles(
    file('a.txt', Buffer.from('x'), 'text/plain'),
  );
  await expect(toast(page, /不是圖片檔/)).toBeVisible();
  /* 拿掉圖片 */
  await editor(page).getByRole('button', { name: '拿掉圖片' }).click();
  expect((await state(page)).cells[3].image).toBeNull();
  await expect
    .poll(async () => near(await pixel(canvas(page), ...cellCenter(3, 190)), [0xe9, 0xec, 0xef]))
    .toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 排列與比例 ---------- */

test('排列與比例：清單（灰底等高、畫感想、不畫圖片）、依原圖（F01～F03、F19、F25～F29）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, {
    cells: [
      cell(1, { title: '雨夜', comment: '一\n二\n三', tags: ['好玩'] }),
      cell(2, { title: '月門' }),
      cell(3),
    ],
  });
  await dropInput(page, '這一格的圖片').setInputFiles(
    file('wide.png', await solidPng('#2244cc', 120, 60)),
  );
  await expect.poll(async () => (await state(page)).cells[0].image?.width).toBe(120);
  const gridH = Number((await canvas(page).getAttribute('data-size'))?.split('x')[1]);
  /* 依原圖：寬圖變矮，空的格子 150 */
  await radio(page, '依原圖').click();
  expect((await state(page)).ratio).toBe('original');
  await expect
    .poll(async () => Number((await canvas(page).getAttribute('data-size'))?.split('x')[1]))
    .toBeLessThan(gridH);
  expect(
    near(await pixel(canvas(page), 60, 50 + Math.round(CELL_W / 2) - 5), [0x22, 0x44, 0xcc]),
  ).toBe(true);
  /* 清單：一列 2 格、不畫圖片、圖片比例停用 */
  await radio(page, '清單').click();
  expect((await state(page)).view).toBe('list');
  await expect(radio(page, '依原圖')).toBeDisabled();
  expect(near(await pixel(canvas(page), 60, 80), [0xf1, 0xf3, 0xf5])).toBe(true);
  /* 同一列的灰底等高：第 2 格的底到第 1 格（有感想）那麼高 */
  const lay = await canvas(page).getAttribute('data-size');
  const h = Number(lay?.split('x')[1]);
  expect(near(await pixel(canvas(page), 460 + 195, 50 + 200), [0xf1, 0xf3, 0xf5])).toBe(true);
  /* 感想只有清單畫：九宮格時沒有感想的高度 */
  await radio(page, '九宮格').click();
  await radio(page, '清單').click();
  await expect(canvas(page)).toHaveAttribute('data-size', `900x${h}`);
  expect(errors).toEqual([]);
});

/* ---------- 下載 ---------- */

test('下載 PNG：檔名、2 倍與 1 倍、像素與預覽相同、不含選取框（F30、F31）', async ({ page }) => {
  const errors = await open(page);
  await dropInput(page, '這一格的圖片').setInputFiles(file('red.png', await solidPng('#dd2222')));
  await expect.poll(async () => (await state(page)).cells[0].image).not.toBeNull();
  let r = await downloadPng(page);
  expect(r.name).toBe('劇本心得九宮格.png');
  expect([r.png.width, r.png.height]).toEqual([1800, 1800]);
  const [cx, cy] = cellCenter(0);
  expect(near(r.png.at(cx * 2, cy * 2), [0xdd, 0x22, 0x22])).toBe(true);
  expect(near(r.png.at(cellCenter(4)[0] * 2, cellCenter(4)[1] * 2), [0xe9, 0xec, 0xef])).toBe(true);
  /* 選取框（預覽上的虛線）不在圖裡：第 1 格左上角外面是白的 */
  expect(near(r.png.at(48 * 2, 120 * 2), [255, 255, 255])).toBe(true);
  expect(r.png.at(0, 0)[3]).toBe(255);
  await page.getByRole('radio', { name: '1 倍' }).click();
  await expect(page.getByTestId('export-size')).toHaveText('900 × 900 px');
  r = await downloadPng(page);
  expect([r.png.width, r.png.height]).toEqual([900, 900]);
  expect(near(r.png.at(cx, cy), [0xdd, 0x22, 0x22])).toBe(true);
  /* 和預覽的畫布相同 */
  for (const [x, y] of [cellCenter(0), cellCenter(5), [10, 10] as [number, number]])
    expect(near(r.png.at(x, y), await pixel(canvas(page), x, y), 2)).toBe(true);
  await radio(page, '清單').click();
  r = await downloadPng(page);
  expect(r.name).toBe('劇本心得清單.png');
  expect(errors).toEqual([]);
});

/* ---------- 自動儲存、復原 ---------- */

test('自動儲存與還原（含圖片）、復原／重做（F38、F39）', async ({ page }) => {
  const errors = await open(page);
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).fill('雨');
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).fill('雨夜');
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).blur();
  await dropInput(page, '這一格的圖片').setInputFiles(file('red.png', await solidPng('#dd2222')));
  await expect.poll(async () => (await state(page)).cells[0].image).not.toBeNull();
  await page.getByRole('textbox', { name: '暱稱' }).fill('阿草');
  await page.getByRole('textbox', { name: '暱稱' }).blur();
  /* 復原：暱稱 → 圖片 → 劇本名稱（文字欄從聚焦到離開算一步） */
  await page.mouse.click(5, 300);
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('textbox', { name: '暱稱' })).toHaveValue('');
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).cells[0].image).toBeNull();
  await page.keyboard.press('Control+z');
  await expect(editor(page).getByRole('textbox', { name: '劇本名稱' })).toHaveValue('');
  /* 重做全部 */
  await page.keyboard.press('Control+Shift+z');
  await expect(editor(page).getByRole('textbox', { name: '劇本名稱' })).toHaveValue('雨夜');
  await page.keyboard.press('Control+y');
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect(page.getByRole('textbox', { name: '暱稱' })).toHaveValue('阿草');
  expect((await state(page)).cells[0].image).not.toBeNull();
  /* 重新整理後還原（圖片從 IndexedDB 讀回） */
  await page.reload();
  await expect(page.getByRole('textbox', { name: '暱稱' })).toHaveValue('阿草');
  await expect(editor(page).getByRole('textbox', { name: '劇本名稱' })).toHaveValue('雨夜');
  const top = 50 + 36 + 40;
  await expect(canvas(page)).toHaveAttribute('data-size', /^900x/);
  await expect
    .poll(async () => near(await pixel(canvas(page), ...cellCenter(0, top)), [0xdd, 0x22, 0x22]))
    .toBe(true);
  /* 重新整理後沒有復原紀錄 */
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

/* ---------- 專案檔 ---------- */

test('專案檔：存成 ZIP（設定＋圖片）、重設、開啟還原；缺圖片的不套用（F34、F35、F37）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('textbox', { name: '暱稱' }).fill('阿草');
  await page.getByRole('textbox', { name: '暱稱' }).blur();
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).fill('雨夜');
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).blur();
  await dropInput(page, '這一格的圖片').setInputFiles(file('red.png', await solidPng('#dd2222')));
  await expect.poll(async () => (await state(page)).cells[0].image).not.toBeNull();
  const saved = await saveProject(page);
  expect(saved.name).toMatch(/^劇本心得_阿草_\d{8}\.zip$/);
  const entries = unzipSync(new Uint8Array(saved.bytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('review-grid');
  expect(project.version).toBe(1);
  expect(project.data.profile.name).toBe('阿草');
  expect(project.data.cells[0].title).toBe('雨夜');
  expect(project.data.tags).toHaveLength(20);
  const imageId = project.data.cells[0].image.id;
  expect(Object.keys(entries)).toContain(`files/${imageId}.png`);
  /* 重設 */
  await openProjectItem(page, '重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  expect((await state(page)).profile.name).toBe('');
  /* 開啟 */
  await openProjectFile(page, saved.name, saved.bytes, 'application/zip');
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  expect((await state(page)).cells[0].title).toBe('雨夜');
  await expect
    .poll(async () => near(await pixel(canvas(page), ...cellCenter(0, 126)), [0xdd, 0x22, 0x22]))
    .toBe(true);
  /* 缺圖片：不套用 */
  const missing = structuredClone(project);
  missing.data.cells[0].image.id = 'anotherimg1';
  missing.data.cells[0].title = '缺圖';
  await openProjectFile(
    page,
    'missing.zip',
    Buffer.from(zipSync({ 'project.json': strToU8(JSON.stringify(missing)) })),
    'application/zip',
  );
  await expect(page.getByText('專案檔裡少了圖片，無法開啟。').first()).toBeVisible();
  expect((await state(page)).cells[0].title).toBe('雨夜');
  expect(errors).toEqual([]);
});

test('原作的資料備份：開啟專案檔讀進來（示範字當成空白、圖片），可以復原；不認得的 JSON 照共用的錯誤（F35、F36）', async ({
  page,
}) => {
  const errors = await open(page);
  await radio(page, '清單').click();
  await openProjectFile(page, 'other.json', Buffer.from('{"foo":1}'), 'application/json');
  await expect(toast(page, '無法開啟專案檔')).toBeVisible();
  await openProjectFile(page, '시나리오_후기_Tester.json', originalFile(), 'application/json');
  await expect(toast(page, '已讀入原作的資料備份：9 格。')).toBeVisible();
  const s = await state(page);
  expect(s.view).toBe('list');
  expect(s.profile).toMatchObject({ name: 'Tester', handle: '@tester' });
  expect(s.profile.image).not.toBeNull();
  expect(s.cells).toHaveLength(9);
  expect(s.cells[0]).toMatchObject({
    rule: 'CoC 7th',
    title: 'Rainy Night',
    writer: 'Someone',
    tags: ['완성도가 높아요', '웃음이 나와요'],
  });
  expect(s.cells[0].image).not.toBeNull();
  expect(s.cells[1]).toMatchObject({ rule: '', title: 'Moon Gate', writer: '' });
  expect(s.cells[2]).toMatchObject({ rule: '', title: '', writer: '' });
  await expect(picker(page).locator('[data-tag="완성도가 높아요"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  /* 一步復原 */
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).profile.name).toBe('');
  expect(errors).toEqual([]);
});

/* ---------- 比較 ---------- */

test('比較多人的心得：本工具的 ZIP＋原作的 JSON → 比較圖（2000 寬）、下載；不到 2 個、讀不了的檔（F40～F44）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('textbox', { name: '暱稱' }).fill('阿草');
  await page.getByRole('textbox', { name: '暱稱' }).blur();
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).fill('rainy  night');
  await editor(page).getByRole('textbox', { name: '劇本名稱' }).blur();
  await picker(page).locator('[data-tag="後勁超強"]').click();
  await dropInput(page, '頭像圖片').setInputFiles(file('me.png', await solidPng('#f2711c')));
  await expect.poll(async () => (await state(page)).profile.image).not.toBeNull();
  const mine = await saveProject(page);
  await page.getByRole('button', { name: '比較多人的心得' }).click();
  const input = dropInput(page, '比較多人的心得：選擇檔案');
  /* 只有一個 */
  await input.setInputFiles(file(mine.name, mine.bytes, 'application/zip'));
  await expect(toast(page, '請選 2 個以上的檔案（每個檔案是一個人）。')).toBeVisible();
  /* 一個讀不了 */
  await input.setInputFiles([
    file(mine.name, mine.bytes, 'application/zip'),
    file('bad.json', Buffer.from('{"x":1}'), 'application/json'),
  ]);
  await expect(toast(page, /無法讀取「bad\.json」/)).toBeVisible();
  await expect(toast(page, '能讀的檔案不到 2 個，無法比較。')).toBeVisible();
  /* 兩個人：Rainy Night 兩人都有、Moon Gate 只有原作的檔 */
  await input.setInputFiles([
    file(mine.name, mine.bytes, 'application/zip'),
    file('original.json', originalFile(), 'application/json'),
  ]);
  const dialog = page.getByRole('dialog', { name: '比較圖' });
  await expect(dialog).toContainText('2 人、2 個劇本');
  await expect(page.getByTestId('compare-size')).toHaveText(/^2000 × \d+ px$/);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: '下載 PNG' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('劇本心得比較.png');
  const png = readPng(readFileSync((await dl.path()) as string));
  expect(png.width).toBe(2000);
  /* 四角透明、中間白底；第一個人的頭像（橘色） */
  expect(png.at(0, 0)[3]).toBe(0);
  expect(near(png.at(1000, 40), [255, 255, 255])).toBe(true);
  let found = false;
  for (let y = 300; y < Math.min(png.height, 1200) && !found; y += 4)
    if (near(png.at(250, y), [0xf2, 0x71, 0x1c], 10)) found = true;
  expect(found).toBe(true);
  await dialog.locator('button', { hasText: '關閉' }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

/* ---------- 對等驗證後的修正（規格 7.1） ---------- */

/** 通知區裡含有這段文字的那一則（標題＋說明） */
const toastItem = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).locator('li').filter({ hasText: text });

/** 圖片庫（IndexedDB）裡有幾張圖（資料庫還沒建立時 0；不能替工具建立空的資料庫） */
async function storedImages(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const name = 'trpg-toolkit:tool:review-grid:assets';
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === name)) return 0;
    const db = await new Promise<IDBDatabase | null>((res) => {
      const req = indexedDB.open(name);
      req.onupgradeneeded = () => req.transaction?.abort();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
    });
    if (!db) return 0;
    let n = 0;
    for (const store of [...db.objectStoreNames]) {
      const tx = db.transaction(store, 'readonly');
      n += await new Promise<number>((res) => {
        const r = tx.objectStore(store).count();
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(0);
      });
    }
    db.close();
    return n;
  });
}

/** 讓 CPU 變慢（讀圖跨過開頁的整理時間） */
async function throttle(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

test('一次放入多張圖片：同一批的結果合成一則通知（放進幾格、不是圖片、讀不了），拖到預覽的格子也一樣（F14）', async ({
  page,
}) => {
  const errors = await open(page);
  await dropInput(page, '一次放入多張圖片').setInputFiles([
    file('sq.png', await solidPng('#2244cc')),
    file('broken.png', Buffer.from('not a png at all')),
    file('note.txt', Buffer.from('hello'), 'text/plain'),
    file('tall.png', await solidPng('#22aa44', 40, 80)),
  ]);
  await expect.poll(async () => (await state(page)).cells.filter((c) => c.image).length).toBe(2);
  const item = toastItem(page, '已放進 2 格。');
  await expect(item).toBeVisible();
  await expect(item).toContainText('「note.txt」不是圖片檔。');
  await expect(item).toContainText('無法讀取「broken.png」');
  await expect(item).toHaveClass(/border-warning/);
  /* 拖到預覽上的第 5 格：[note.txt, broken.png, sq.png] */
  const [x, y] = cellCenter(4);
  const at = await screenAt(page, x, y);
  const b64 = (await solidPng('#ddaa22')).toString('base64');
  await page.evaluate(
    ({ b64, x, y }) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['hello'], 'note.txt', { type: 'text/plain' }));
      dt.items.add(new File(['broken'], 'broken.png', { type: 'image/png' }));
      dt.items.add(
        new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'gold.png', {
          type: 'image/png',
        }),
      );
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      window.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    },
    { b64, x: at.x, y: at.y },
  );
  await expect.poll(async () => (await state(page)).cells[4].image?.name).toBe('gold.png');
  const dropped = toastItem(page, '已放進圖片。');
  await expect(dropped).toBeVisible();
  await expect(dropped).toContainText('「note.txt」不是圖片檔。');
  await expect(dropped).toContainText('無法讀取「broken.png」');
  /* 全部都放不進去：錯誤色 */
  await dropInput(page, '一次放入多張圖片').setInputFiles([
    file('a.txt', Buffer.from('x'), 'text/plain'),
  ]);
  const failed = toastItem(page, '「a.txt」不是圖片檔。');
  await expect(failed).toBeVisible();
  await expect(failed).toHaveClass(/border-danger/);
  expect(errors).toEqual([]);
});

test('圖片存不進瀏覽器（IndexedDB 擋掉）時看得到提醒：放進格子、開本工具的 ZIP（F38）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 先存一份有圖片的專案檔 */
  await dropInput(page, '這一格的圖片').setInputFiles(file('red.png', await solidPng('#dd2222')));
  await expect.poll(async () => (await state(page)).cells[0].image).not.toBeNull();
  const saved = await saveProject(page);
  await page.addInitScript(() => {
    const orig = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name: string, ...rest: [number?]) {
      if (String(name).includes('review-grid')) throw new DOMException('blocked', 'SecurityError');
      return orig.call(this, name, ...rest);
    };
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '劇本心得九宮格' })).toBeVisible();
  await cellList(page).locator('[data-cell-row="c2"]').click();
  await dropInput(page, '這一格的圖片').setInputFiles(file('blue.png', await solidPng('#2244cc')));
  await expect.poll(async () => (await state(page)).cells[1].image?.name).toBe('blue.png');
  const placed = toastItem(page, '已放進圖片。');
  await expect(placed).toContainText('瀏覽器空間不足或無法存檔');
  await openProjectFile(page, saved.name, saved.bytes, 'application/zip');
  await expect(toastItem(page, '已開啟專案檔')).toBeVisible();
  await expect(toast(page, /瀏覽器空間不足或無法存檔/).first()).toBeVisible();
  expect(errors.filter((e) => !e.includes('blocked'))).toEqual([]);
});

test('開頁約 5 秒的圖片整理不會刪掉讀到一半的圖（一次放入多張）（F38）', async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  const errors = await open(page);
  /* 時間停住：開頁 5 秒的整理等下面 fastForward 才發生 */
  await page.clock.pauseAt(new Date(Date.now() + 300));
  const N = 16;
  const big = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      solidPng(`#${(0x203040 + i * 0x0a0b0c).toString(16).slice(-6)}`, 2000, 1500),
    ),
  );
  const cdp = await throttle(page, 4);
  await dropInput(page, '一次放入多張圖片').setInputFiles(
    big.map((b, i) => file(`big-${i}.png`, b)),
  );
  /* 有幾張已經進了圖片庫、還沒寫進狀態時，讓開頁 5 秒的整理發生 */
  await expect
    .poll(() => storedImages(page), { timeout: 90_000, intervals: [50] })
    .toBeGreaterThanOrEqual(2);
  expect((await state(page)).cells.filter((c) => c.image).length).toBe(0);
  await page.clock.fastForward(6000);
  await expect
    .poll(async () => (await state(page)).cells.filter((c) => c.image).length, {
      timeout: 120_000,
    })
    .toBe(N);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect.poll(() => storedImages(page)).toBe(N);
  await expect(page.getByText('有圖片讀不到了')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '劇本心得九宮格' })).toBeVisible();
  await page.clock.fastForward(6000);
  await expect.poll(() => storedImages(page)).toBe(N);
  await expect(page.getByText('有圖片讀不到了')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('原作的備份讀到一半時的圖片整理：讀完每一格的圖片都在（F38）', async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  const errors = await open(page);
  /* 時間停住：開頁 5 秒的整理等下面 fastForward 才發生 */
  await page.clock.pauseAt(new Date(Date.now() + 300));
  const N = 10;
  const imgs = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      solidPng(`#${(0x405060 + i * 0x0b0a09).toString(16).slice(-6)}`, 2000, 1500),
    ),
  );
  const backup = {
    profile: { img: null, nickname: 'race', handle: '' },
    scenarios: imgs.map((b, i) => ({
      img: `data:image/png;base64,${b.toString('base64')}`,
      rule: '',
      title: `R${i}`,
      writer: '',
      comment: '',
      chips: [],
    })),
  };
  const cdp = await throttle(page, 4);
  await openProjectFile(page, 'race.json', Buffer.from(JSON.stringify(backup)), 'application/json');
  await expect
    .poll(() => storedImages(page), { timeout: 90_000, intervals: [50] })
    .toBeGreaterThanOrEqual(2);
  expect((await state(page)).cells.filter((c) => c.image).length).toBe(0);
  await page.clock.fastForward(6000);
  await expect(toastItem(page, `已讀入原作的資料備份：${N} 格。`)).toBeVisible({
    timeout: 120_000,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const s = await state(page);
  expect(s.cells.filter((c) => c.image).length).toBe(N);
  await expect.poll(() => storedImages(page)).toBe(N);
  await expect(page.getByText('有圖片讀不到了')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('比較：不是 .zip／.json 的檔要通知檔名，能讀的照樣比較（F44）', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '比較多人的心得' }).click();
  const input = dropInput(page, '比較多人的心得：選擇檔案');
  const second = JSON.parse(originalFile().toString('utf8'));
  second.profile.nickname = 'Second';
  /* 只有一個能讀的＋一張圖：說明要 2 個以上，也說明圖片沒有列入 */
  await input.setInputFiles([
    file('original.json', originalFile(), 'application/json'),
    file('sq.png', await solidPng('#2244cc')),
  ]);
  const need = toastItem(page, '請選 2 個以上的檔案（每個檔案是一個人）。');
  await expect(need).toBeVisible();
  await expect(need).toContainText('「sq.png」不是專案檔');
  /* 兩個能讀的＋一張圖：照樣比較，另外說明圖片沒有列入 */
  await input.setInputFiles([
    file('original.json', originalFile(), 'application/json'),
    file('second.json', Buffer.from(JSON.stringify(second)), 'application/json'),
    file('sq.png', await solidPng('#2244cc')),
  ]);
  const dialog = page.getByRole('dialog', { name: '比較圖' });
  await expect(dialog).toContainText('2 人、2 個劇本');
  await expect(dialog).toContainText(
    '有檔案沒有列入比較。「sq.png」不是專案檔（.zip、.json），沒有列入比較。',
  );
  expect(errors).toEqual([]);
});

test('標籤的文字欄：顯示字數／上限，超過 20 字打不進去（F21、F22）', async ({ page }) => {
  const errors = await open(page);
  const long = '一二三四五六七八九十一二三四五六七八九十多出來的字';
  /* 自己寫一個標籤 */
  const quick = editor(page).getByRole('textbox', { name: '自己寫一個標籤' });
  await quick.fill(long);
  await expect(quick).toHaveValue(long.slice(0, 20));
  await expect(page.getByTestId('quick-tag-count')).toHaveText('20／20');
  await quick.fill('KP');
  await expect(page.getByTestId('quick-tag-count')).toHaveText('2／20');
  /* 新的標籤 */
  await page.getByRole('button', { name: '心得標籤清單' }).click();
  const fresh = page.getByRole('textbox', { name: '新的標籤' });
  await fresh.fill(long);
  await expect(fresh).toHaveValue(long.slice(0, 20));
  await expect(page.getByTestId('new-tag-count')).toHaveText('20／20');
  /* 清單裡改字 */
  const list = page.getByRole('list', { name: '心得標籤清單' });
  const row = list.getByRole('textbox', { name: '標籤「後勁超強」的文字' });
  await row.fill(long);
  await expect(row).toHaveValue(long.slice(0, 20));
  await expect(list.locator('[data-tag-row="後勁超強"]').getByTestId('tag-text-count')).toHaveText(
    '20／20',
  );
  await row.press('Enter');
  expect((await state(page)).tags).toContain(long.slice(0, 20));
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('版面：390 寬沒有橫向捲動；1280 與 390 的視覺基準（F46）', async ({ page }) => {
  const errors = await open(page);
  await noHorizontalScroll(page);
  await seed(page, {
    profile: { image: null, name: '阿草', handle: '@kusa_trpg' },
    cells: [
      cell(1, {
        rule: 'CoC 7版',
        title: '雨夜的訪客',
        writer: '某某',
        tags: ['後勁超強', '笑到肚子痛'],
      }),
      cell(2, { rule: 'DX3rd', title: '月門', writer: '作者', tags: ['強力推坑！'] }),
      cell(3, {
        title: '很長的劇本名稱會自動換行到下一行',
        tags: ['一路發糖好甜', 'NPC 讓人念念不忘', '想失憶再跑一次'],
      }),
      cell(4),
      cell(5, { rule: 'Emoklore', title: '花與信' }),
      cell(6),
    ],
  });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('review-grid-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await radio(page, '清單').click();
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('review-grid-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
