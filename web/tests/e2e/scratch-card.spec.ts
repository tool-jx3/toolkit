/**
 * 刮刮卡產生器（建置產物 next/scratch-card/）的端對端測試（規格 docs/refactor/specs/scratch-card.md）：
 * - 開頁沒有錯誤、預設 350 × 180、頁尾只有靈感來源、這次開頁抽了 1 張；
 * - 刮（滑鼠拖曳）→ 刮開判定、彩帶；再蓋一次、直接刮開、抽新的一張（種子、張數、自己指定種子）、快捷鍵 N／R；
 * - 抽籤和原作的 mulberry32 相同（自己指定種子）；
 * - 內容種類（圖示數量與大小、句子、圖片小圖／蓋滿、沒有圖片、網址圖片、去掉透明留白、不是圖片的通知）；
 * - 塗層（顏色、文字、筆刷）；進階設定（底色、刮開區、標題、塗層形狀、句子顏色）；
 * - 互動 HTML（程式碼、下載、獨立網頁裡照樣能刮、窄畫面縮小、待填的網址）；
 * - 分享連結（畫面只有卡片、能刮、上傳的圖片時停用、壞掉的連結）；
 * - 自動儲存與還原（含圖片）、復原／重做、專案檔（ZIP、重設、開啟、原作的設定檔、不認得的檔）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('scratch-card') ?? { id: 'scratch-card', status: 'next' })}/`;
const KEY = 'trpg-toolkit:scratch-card';

test.use({ viewport: { width: 1280, height: 900 } });

/* ---------- 共用 ---------- */

/** 原作的亂數（照原作的寫法） */
function upstreamMulberry32(seed: number) {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ICON_NAMES = ['寶石', '金幣', '皇冠', '禮物', '星星', '炸彈', '骰子', '愛心'];

async function png(w: number, h: number, fill: (x: number, y: number) => number[]) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(fill(x, y), (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}
const solid = (r: number, g: number, b: number, w = 40, h = 40) => png(w, h, () => [r, g, b, 255]);
const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/** 讓雜點、彩帶的亂數固定（視覺基準用） */
async function fixedRandom(page: Page) {
  await page.addInitScript(() => {
    let s = 1;
    Math.random = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  });
}

async function open(page: Page, path = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.route(/example\.(com|org)/, async (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: await solid(0, 160, 255) }),
  );
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: '刮刮卡產生器' })).toBeVisible();
  return errors;
}

const card = (page: Page) => page.locator('[data-scx="card"]').first();
const cover = (page: Page) => page.locator('canvas[data-scx="cover"]').first();
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);

async function stored(page: Page): Promise<Record<string, unknown>> {
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, KEY);
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.state?.data, KEY);
}

async function seed(page: Page, data: Record<string, unknown>) {
  await page.evaluate(
    ({ key, data }) => {
      const cur = JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data ?? {};
      localStorage.setItem(
        key,
        JSON.stringify({ state: { data: { ...cur, ...data } }, version: 1 }),
      );
    },
    { key: KEY, data },
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '刮刮卡產生器' })).toBeVisible();
}

/** 用滑鼠一列一列刮過整張卡（rows：刮幾列；從上往下） */
async function scratch(page: Page, target: Locator = cover(page), rows = 12, part = 1) {
  await target.scrollIntoViewIfNeeded();
  const b = (await target.boundingBox())!;
  const ys = Array.from({ length: rows }, (_, i) => b.y + ((i + 0.5) * b.height * part) / rows);
  await page.mouse.move(b.x + 2, ys[0]);
  await page.mouse.down();
  for (const y of ys) {
    await page.mouse.move(b.x + 2, y, { steps: 2 });
    await page.mouse.move(b.x + b.width - 2, y, { steps: 10 });
  }
  await page.mouse.up();
}

/** 塗層畫布上某一點的 RGBA */
async function coverPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([x, y]) => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-scx="cover"]')!;
      return Array.from(c.getContext('2d')!.getImageData(x, y, 1, 1).data);
    },
    [x, y],
  );
}

/**
 * 塗層顏色（四周 2 × 2 的雜點最多差 10% 白／5% 黑，所以取 3 × 3 的中位數，再容許 ±30）
 */
async function coverColorNear(page: Page, x: number, y: number): Promise<number[]> {
  const px: number[][] = [];
  for (let dy = 0; dy < 3; dy++)
    for (let dx = 0; dx < 3; dx++)
      px.push((await coverPixel(page, x + dx * 3, y + dy * 3)).slice(0, 3));
  return [0, 1, 2].map((c) => px.map((p) => p[c]).sort((a, b) => a - b)[4]);
}

const near = (got: number[], want: number[]) =>
  got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= 30);

async function pickSelect(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function openProjectItem(page: Page, name: string) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

async function openProjectFile(page: Page, name: string, bytes: Buffer, mimeType: string) {
  await openProjectItem(page, '開啟專案檔…');
  await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file(name, bytes, mimeType));
}

async function saveProject(page: Page): Promise<{ name: string; bytes: Buffer }> {
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
}

const iconNames = (page: Page) =>
  card(page)
    .locator('.scx-icon')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

const imagesDrop = (page: Page) =>
  page.getByRole('group', { name: '把圖片拖到這裡' }).locator('input[type=file]');

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、預設 350 × 180、3 個圖示、塗層蓋住、頁尾只有靈感來源、抽了 1 張（F02、F18、F30、F58）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(cover(page)).toHaveAttribute('width', '350');
  await expect(cover(page)).toHaveAttribute('height', '180');
  await expect(card(page)).toHaveAttribute('data-state', 'covered');
  expect(await iconNames(page)).toHaveLength(3);
  await expect(page.getByTestId('draw-count')).toHaveText('這次開頁抽了 1 張');
  /* 塗層：刮開區（整張卡）填 #9ca3af */
  expect(near(await coverColorNear(page, 5, 5), [156, 163, 175])).toBe(true);
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/Scratchcard',
  );
  await expect(page.getByText('@bb_uu_t')).toHaveCount(0);
  /* 第一次開頁就把種子存起來，重新整理後是同一張 */
  const s = await stored(page);
  const names = await iconNames(page);
  await page.reload();
  expect((await stored(page)).seed).toBe(s.seed);
  expect(await iconNames(page)).toEqual(names);
  expect(errors).toEqual([]);
});

/* ---------- 刮 ---------- */

test('刮開：拖曳擦掉塗層、刮掉大部分時自動清掉並噴彩帶；再蓋一次、直接刮開、R（F35、F37、F38、F40、F43）', async ({
  page,
}) => {
  const errors = await open(page);
  const b = (await cover(page).boundingBox())!;
  /* 只刮一條：擦掉那條線，還沒刮開 */
  await page.mouse.move(b.x + 20, b.y + 90);
  await page.mouse.down();
  await page.mouse.move(b.x + 200, b.y + 90, { steps: 10 });
  await page.mouse.up();
  expect((await coverPixel(page, 100, 90))[3]).toBe(0);
  expect((await coverPixel(page, 100, 20))[3]).toBe(255);
  await expect(card(page)).toHaveAttribute('data-state', 'covered');
  const p = Number(await card(page).getAttribute('data-progress'));
  expect(p).toBeGreaterThan(0.05);
  expect(p).toBeLessThan(0.8);
  /* 刮掉大部分 */
  await scratch(page);
  await expect(card(page)).toHaveAttribute('data-state', 'revealed');
  expect((await coverPixel(page, 175, 20))[3]).toBe(0);
  await expect(page.locator('canvas[data-scx="confetti"]')).toHaveCount(1);
  await expect(page.getByTestId('reveal-status')).toHaveText('已經刮開了。');
  await expect(card(page).locator('[data-scx="result"]')).toHaveAttribute('aria-hidden', 'false');
  await expect(btn(page, '直接刮開')).toBeDisabled();
  /* 再蓋一次 */
  await btn(page, '再蓋一次').click();
  await expect(card(page)).toHaveAttribute('data-state', 'covered');
  expect((await coverPixel(page, 175, 20))[3]).toBe(255);
  /* 直接刮開 */
  await btn(page, '直接刮開').click();
  await expect(card(page)).toHaveAttribute('data-state', 'revealed');
  /* R：再蓋一次 */
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('r');
  await expect(card(page)).toHaveAttribute('data-state', 'covered');
  expect(errors).toEqual([]);
});

test('抽新的一張：換種子、張數 +1、可以復原；自己指定種子時不換；換一個種子；N（F03、F30、F41、F57）', async ({
  page,
}) => {
  await open(page);
  const s0 = (await stored(page)).seed;
  await btn(page, '抽新的一張').click();
  await expect(page.getByTestId('draw-count')).toHaveText('這次開頁抽了 2 張');
  await expect.poll(async () => (await stored(page)).seed).not.toBe(s0);
  /* 復原回到上一張 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await stored(page)).seed).toBe(s0);
  /* 自己指定種子 */
  await page.getByRole('switch', { name: '自己指定種子' }).click();
  await page.getByRole('spinbutton', { name: '種子' }).fill('2024');
  await page.getByRole('spinbutton', { name: '種子' }).press('Enter');
  await expect.poll(async () => (await stored(page)).seed).toBe(2024);
  await scratch(page);
  await expect(card(page)).toHaveAttribute('data-state', 'revealed');
  const names = await iconNames(page);
  await btn(page, '抽新的一張').click();
  await expect(card(page)).toHaveAttribute('data-state', 'covered');
  expect((await stored(page)).seed).toBe(2024);
  expect(await iconNames(page)).toEqual(names);
  await expect(page.getByTestId('draw-count')).toHaveText('這次開頁抽了 3 張');
  /* 換一個種子：立刻抽一張 */
  await page.getByRole('button', { name: '換一個種子' }).click();
  await expect.poll(async () => (await stored(page)).seed).not.toBe(2024);
  await expect(page.getByTestId('draw-count')).toHaveText('這次開頁抽了 4 張');
  /* N */
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('n');
  await expect(page.getByTestId('draw-count')).toHaveText('這次開頁抽了 5 張');
});

test('抽籤和原作相同：同一個種子抽到同樣的位置；數量 > 5 時圖示變小（F03、F17、F18）', async ({
  page,
}) => {
  await open(page);
  for (const [s, count] of [
    [12345, 3],
    [777, 6],
    [999999, 10],
  ]) {
    await seed(page, { fixedSeed: true, seed: s, count, kind: 'icons' });
    const r = upstreamMulberry32(s);
    const expected = Array.from({ length: count }, () => ICON_NAMES[Math.floor(r() * 8)]);
    expect(await iconNames(page)).toEqual(expected);
    const size = await card(page)
      .locator('.scx-icon')
      .first()
      .evaluate((e) => e.clientWidth);
    expect(size).toBe(count > 5 ? 30 : 48);
  }
});

/* ---------- 內容 ---------- */

test('句子：從清單抽一句、空白行不算、全部空白時「沒有結果」、字級（F16、F19、F20）', async ({
  page,
}) => {
  await open(page);
  await seed(page, { fixedSeed: true, seed: 42 });
  await pickSelect(page, '內容種類', '隨機句子');
  const area = page.getByRole('textbox', { name: '句子清單' });
  await area.fill('甲\n\n乙\n丙');
  await area.blur();
  await expect(page.getByText('一行一句，空白行不算。共 3 句。')).toBeVisible();
  const r = upstreamMulberry32(42);
  await expect(card(page).locator('.scx-text')).toHaveText(['甲', '乙', '丙'][Math.floor(r() * 3)]);
  await page.getByRole('spinbutton', { name: '句子字級' }).fill('40');
  await page.getByRole('spinbutton', { name: '句子字級' }).press('Enter');
  await expect(card(page).locator('.scx-text')).toHaveCSS('font-size', '40px');
  await area.fill(' \n ');
  await area.blur();
  await expect(card(page).locator('.scx-text')).toHaveText('沒有結果');
});

test('圖片：加入（不是圖片的寫在同一則通知）、網址、小圖的樣式與大小、蓋滿、沒有圖片、刪除（F22～F28）', async ({
  page,
}) => {
  const errors = await open(page);
  await pickSelect(page, '內容種類', '圖片（小圖）');
  await expect(card(page).locator('.scx-empty')).toHaveText('還沒有圖片。');
  await imagesDrop(page).setInputFiles([
    file('red.png', await solid(255, 0, 0)),
    file('note.txt', Buffer.from('hello'), 'text/plain'),
    file('bad.png', Buffer.from('not a png')),
  ]);
  await expect(toast(page, '已加入 1 張圖片。')).toBeVisible();
  await expect(toast(page, /不是圖片：note\.txt。讀不了：bad\.png。/)).toBeVisible();
  await expect(page.getByRole('button', { name: '圖片清單（共 1 張）' })).toBeVisible();
  /* 網址 */
  const urlField = page.getByRole('textbox', { name: '圖片網址' });
  await urlField.fill('javascript:alert(1)');
  await btn(page, '加入').click();
  await expect(page.getByText('請輸入 http 或 https 開頭的圖片網址。')).toBeVisible();
  await urlField.fill('https://example.com/blue.png');
  await urlField.press('Enter');
  await expect(urlField).toHaveValue('');
  const list = page.getByRole('list', { name: '圖片清單' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText('blue.png');
  /* 小圖：3 張、80 px、圓角方形 */
  const imgs = card(page).locator('img.scx-img');
  await expect(imgs).toHaveCount(3);
  await expect(imgs.first()).toHaveClass(/scx-img-rounded/);
  expect(await imgs.first().evaluate((e) => e.clientWidth)).toBe(80);
  await pickSelect(page, '圖片樣式', '圓形');
  await expect(imgs.first()).toHaveClass(/scx-img-circle-flat/);
  await page.getByRole('spinbutton', { name: '圖片大小' }).fill('50');
  await page.getByRole('spinbutton', { name: '圖片大小' }).press('Enter');
  expect(await imgs.first().evaluate((e) => e.clientWidth)).toBe(50);
  /* 圖片都讀得到（上傳的是 blob:，網址照樣） */
  const srcs = await imgs.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
  for (const s of srcs) expect(s).toMatch(/^(blob:|https:\/\/example\.com\/blue\.png)/);
  /* 蓋滿 */
  await pickSelect(page, '內容種類', '圖片（蓋滿）');
  await expect(card(page).locator('img.scx-full')).toHaveCount(1);
  await expect(card(page).locator('img.scx-full')).toHaveCSS('border-radius', '12px');
  /* 刪除（可以復原） */
  await list.getByRole('button', { name: '刪除「red.png」' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(list.getByRole('listitem')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('去掉透明留白：小圖裁掉四周透明的部分（F24）', async ({ page }) => {
  await open(page);
  await seed(page, { kind: 'image-icon', count: 1, imageStyle: 'contain' });
  /* 60 × 60，中間 20 × 10 不透明 */
  const img = await png(60, 60, (x, y) =>
    x >= 20 && x < 40 && y >= 25 && y < 35 ? [0, 128, 0, 255] : [0, 0, 0, 0],
  );
  await imagesDrop(page).setInputFiles([file('pad.png', img)]);
  await expect(toast(page, '已加入 1 張圖片。')).toBeVisible();
  const el = card(page).locator('img.scx-img');
  const natural = () =>
    el.evaluate((e) => [
      (e as HTMLImageElement).naturalWidth,
      (e as HTMLImageElement).naturalHeight,
    ]);
  await expect.poll(natural).toEqual([60, 60]);
  await page.getByRole('switch', { name: '去掉透明留白' }).click();
  await expect.poll(natural).toEqual([20, 10]);
});

/* ---------- 塗層與進階設定 ---------- */

test('塗層：顏色、文字、筆刷大小；進階：個別形狀（圓）只蓋住每個結果（F12～F15、F34）', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('textbox', { name: '塗層顏色' }).fill('#336699');
  await page
    .getByRole('textbox', { name: '塗層顏色' })
    .press('Enter')
    .catch(() => undefined);
  await expect.poll(async () => near(await coverColorNear(page, 5, 5), [51, 102, 153])).toBe(true);
  const text = page.getByRole('textbox', { name: '塗層文字' });
  await text.fill('</script>刮我');
  await text.blur();
  expect((await stored(page)).coverText).toBe('</script>刮我');
  await page.getByRole('slider', { name: '筆刷大小' }).focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await stored(page)).brush).toBe(80);
  /* 進階：每個各自一個圓 */
  await seed(page, {
    expert: true,
    coverShape: 'circle',
    kind: 'icons',
    count: 1,
    fixedSeed: true,
    seed: 1,
  });
  /* 圖示在刮開區 (20, 20, 310, 140) 正中央：(151, 66) 48 × 48 → 圓心 (175, 90)、半徑 39 */
  expect((await coverPixel(page, 175, 90))[3]).toBe(255);
  expect((await coverPixel(page, 175, 90 - 36))[3]).toBe(255);
  expect((await coverPixel(page, 175 - 37, 90 - 37))[3]).toBe(0);
  expect((await coverPixel(page, 30, 30))[3]).toBe(0);
  /* 刮開圓的範圍就刮開 */
  const b = (await cover(page).boundingBox())!;
  await page.mouse.move(b.x + 140, b.y + 55);
  await page.mouse.down();
  for (let y = 55; y <= 125; y += 10) {
    await page.mouse.move(b.x + 136, b.y + y, { steps: 2 });
    await page.mouse.move(b.x + 214, b.y + y, { steps: 6 });
  }
  await page.mouse.up();
  await expect(card(page)).toHaveAttribute('data-state', 'revealed');
});

test('進階設定：底色、刮開區、標題（位置、在塗層下面）、句子顏色；關閉時都不作用（F01、F04、F07～F11、F21）', async ({
  page,
}) => {
  await open(page);
  await seed(page, { kind: 'sentence', sentences: '中獎', fixedSeed: true, seed: 3 });
  await page.getByRole('switch', { name: '進階設定' }).click();
  await expect(page.getByRole('button', { name: '背景與刮開區（進階）' })).toBeVisible();
  /* 刮開區 (20, 20, 310, 140)：外面沒有塗層 */
  expect((await coverPixel(page, 10, 10))[3]).toBe(0);
  expect((await coverPixel(page, 25, 25))[3]).toBe(255);
  await page.getByRole('spinbutton', { name: 'X' }).fill('100');
  await page.getByRole('spinbutton', { name: 'X' }).press('Enter');
  await expect.poll(async () => (await coverPixel(page, 50, 50))[3]).toBe(0);
  /* 底色 */
  await page.getByRole('textbox', { name: '底色' }).fill('#fef3c7');
  await page
    .getByRole('textbox', { name: '底色' })
    .press('Enter')
    .catch(() => undefined);
  await expect(card(page)).toHaveCSS('background-color', 'rgb(254, 243, 199)');
  /* 標題 */
  const title = page.getByRole('textbox', { name: '標題文字' });
  await title.fill('<b>酒館</b>');
  await title.blur();
  const t = card(page).locator('.scx-title');
  await expect(t).toHaveText('<b>酒館</b>');
  await expect(t).toHaveCSS('justify-content', 'center');
  await expect(t).toHaveCSS('align-items', 'flex-start');
  await page.getByRole('radio', { name: '右下' }).click();
  await expect(t).toHaveCSS('justify-content', 'flex-end');
  await expect(t).toHaveCSS('align-items', 'flex-end');
  expect(await t.evaluate((e) => getComputedStyle(e).zIndex)).toBe('2');
  /* 句子顏色 */
  await expect(card(page).locator('.scx-text')).toHaveCSS('color', 'rgb(31, 41, 55)');
  await page.getByRole('textbox', { name: '句子顏色' }).fill('#ff0000');
  await page
    .getByRole('textbox', { name: '句子顏色' })
    .press('Enter')
    .catch(() => undefined);
  await expect.poll(async () => (await stored(page)).sentenceColor).toBe('#ff0000');
  /* 關閉：白底、整張卡、沒有標題 */
  await page.getByRole('switch', { name: '進階設定' }).click();
  await expect(card(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(card(page).locator('.scx-title')).toHaveCount(0);
  expect((await coverPixel(page, 5, 5))[3]).toBe(255);
  await expect(card(page).locator('.scx-text')).toHaveCSS('color', 'rgb(31, 41, 55)');
  await expect(card(page).locator('.scx-result')).toHaveClass(/scx-stripes/);
});

/* ---------- 互動 HTML ---------- */

test('互動 HTML：程式碼、下載的獨立網頁照樣能刮、再蓋一次、窄畫面縮小；待填的網址（F45～F49）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await seed(page, { fixedSeed: true, seed: 5, kind: 'image-icon', count: 2 });
  await imagesDrop(page).setInputFiles([file('red.png', await solid(255, 0, 0))]);
  await expect(toast(page, '已加入 1 張圖片。')).toBeVisible();
  await btn(page, '互動 HTML…').click();
  const dialog = page.getByTestId('html-dialog');
  const code = dialog.getByRole('textbox', { name: '程式碼' });
  await expect(code).toHaveValue(/^<!-- 刮刮卡產生器：互動 HTML 開始 -->/);
  const snippet = await code.inputValue();
  expect(snippet).toContain('data:image/png;base64,');
  expect(snippet).not.toMatch(/cdn|googleapis|fontawesome/i);
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '下載 HTML').click()]);
  expect(dl.suggestedFilename()).toBe('刮刮卡.html');
  const html = readFileSync((await dl.path()) as string, 'utf8');
  expect(html).toContain(snippet);
  /* 待填的網址 */
  await dialog.getByRole('switch', { name: '上傳的圖片改成待填的網址' }).click();
  await expect(code).toHaveValue(/請換成第1張圖片的網址/);
  expect(await code.inputValue()).not.toContain('data:image/png');
  await page.keyboard.press('Escape');

  /* 獨立網頁：手機寬度、能刮、再蓋一次 */
  const p2 = await context.newPage();
  const errs2: string[] = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.setViewportSize({ width: 300, height: 600 });
  await p2.setContent(html);
  const c2 = p2.locator('canvas[data-scx="cover"]');
  const box = (await c2.boundingBox())!;
  expect(box.width).toBeLessThan(300);
  expect(box.width).toBeGreaterThan(250);
  expect(Math.abs(box.width / box.height - 350 / 180)).toBeLessThan(0.02);
  expect(await p2.locator('img.scx-img').count()).toBe(2);
  await scratch(p2, c2);
  await expect(p2.locator('[data-scx="card"]')).toHaveAttribute('data-state', 'revealed');
  await p2.getByRole('button', { name: '再蓋一次' }).click();
  await expect(p2.locator('[data-scx="card"]')).toHaveAttribute('data-state', 'covered');
  expect(await p2.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(300);
  expect(errs2).toEqual([]);
  expect(errors).toEqual([]);
});

/* ---------- 分享連結 ---------- */

test('分享連結：畫面只有卡片、能刮、不動到自己存的內容；上傳的圖片時停用；壞掉的連結（F50、F51）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, { kind: 'sentence', sentences: '秘密的結果', expert: true, titleText: '抽籤' });
  await btn(page, '分享連結…').click();
  const link = page.getByTestId('share-dialog').getByRole('textbox', { name: '連結' });
  const url = await link.inputValue();
  expect(url).toMatch(/\/next\/scratch-card\/#c=/);
  expect(url).not.toContain('秘密');
  await page.keyboard.press('Escape');
  const before = await stored(page);

  await page.goto(url);
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '設定' })).toHaveCount(0);
  await expect(card(page).locator('.scx-text')).toHaveText('秘密的結果');
  await expect(card(page).locator('.scx-title')).toHaveText('抽籤');
  await scratch(page);
  await expect(card(page)).toHaveAttribute('data-state', 'revealed');
  await btn(page, '再蓋一次').click();
  await expect(card(page)).toHaveAttribute('data-state', 'covered');
  await btn(page, '直接刮開').click();
  await expect(card(page)).toHaveAttribute('data-state', 'revealed');
  expect(await stored(page)).toEqual(before);
  await page.setViewportSize({ width: 300, height: 700 });
  await noHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  /* 自己做一張：回到編輯畫面 */
  await page.getByRole('link', { name: '自己做一張刮刮卡' }).click();
  await expect(page.getByRole('complementary', { name: '設定' })).toBeVisible();

  /* 上傳的圖片：停用並說明 */
  await pickSelect(page, '內容種類', '圖片（蓋滿）');
  await imagesDrop(page).setInputFiles([file('red.png', await solid(255, 0, 0))]);
  await expect(btn(page, '分享連結…')).toBeDisabled();
  await expect(page.getByTestId('share-blocked')).toHaveText(
    '上傳的圖片放不進連結：改用網址加入圖片，或用互動 HTML。',
  );

  /* 壞掉的連結：照常打開編輯畫面並通知 */
  await page.goto(`${URL}#c=broken`);
  await expect(toast(page, '分享連結的內容讀不出來。')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '設定' })).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 儲存、復原、專案檔 ---------- */

test('自動儲存與還原（含圖片）、復原／重做（F56、F57）', async ({ page }) => {
  await open(page);
  await pickSelect(page, '內容種類', '圖片（蓋滿）');
  await imagesDrop(page).setInputFiles([file('red.png', await solid(255, 0, 0))]);
  await expect(toast(page, '已加入 1 張圖片。')).toBeVisible();
  await page.getByRole('spinbutton', { name: '寬' }).fill('400');
  await page.getByRole('spinbutton', { name: '寬' }).press('Enter');
  await expect(cover(page)).toHaveAttribute('width', '400');
  await page.reload();
  await expect(cover(page)).toHaveAttribute('width', '400');
  await expect(card(page).locator('img.scx-full')).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() =>
      card(page)
        .locator('img.scx-full')
        .evaluate((e) => (e as HTMLImageElement).naturalWidth),
    )
    .toBe(40);
  /* 復原／重做 */
  await page.getByRole('spinbutton', { name: '高' }).fill('200');
  await page.getByRole('spinbutton', { name: '高' }).press('Enter');
  await expect(cover(page)).toHaveAttribute('height', '200');
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(cover(page)).toHaveAttribute('height', '180');
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect(cover(page)).toHaveAttribute('height', '200');
});

test('專案檔：存成 ZIP（含圖片）、重設、開啟；原作的設定檔；不認得的檔（F52～F55）', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, { kind: 'image-icon', fixedSeed: true, seed: 8, count: 2, coverText: '專案' });
  await imagesDrop(page).setInputFiles([file('red.png', await solid(255, 0, 0))]);
  await expect(toast(page, '已加入 1 張圖片。')).toBeVisible();
  const saved = await saveProject(page);
  expect(saved.name).toMatch(/^刮刮卡_\d{8}\.zip$/);
  const zip = unzipSync(new Uint8Array(saved.bytes));
  const project = JSON.parse(strFromU8(zip['project.json']));
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'scratch-card',
    version: 1,
  });
  expect(project.data).toMatchObject({ kind: 'image-icon', seed: 8, coverText: '專案' });
  const id = project.data.images[0].id;
  expect(Object.keys(zip)).toContain(`files/${id}.png`);

  /* 重設 */
  await openProjectItem(page, '重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect.poll(async () => (await stored(page)).images).toEqual([]);
  expect((await stored(page)).coverText).toBe('刮刮看！');

  /* 開啟剛才的專案檔 */
  await openProjectFile(page, saved.name, saved.bytes, 'application/zip');
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  await expect.poll(async () => (await stored(page)).coverText).toBe('專案');
  await expect(card(page).locator('img.scx-img')).toHaveCount(2);

  /* 原作的設定檔（自己的測試資料） */
  const red = (await solid(255, 0, 0)).toString('base64');
  const legacy = {
    isExpertMode: false,
    seed: '4242',
    useCustomSeed: true,
    width: '300',
    height: '150',
    scratchText: '긁어 보세요!',
    color: '#000000',
    brush: '20',
    type: 'image-full',
    iconCount: '3',
    coverType: 'zone',
    sentences: 'A',
    imageIconSize: '80',
    imageIconStyle: 'rounded-rect',
    trimTransparent: false,
    ticketBgImageDataUrl: null,
    imagePool: [`data:image/png;base64,${red}`, 'https://example.com/x.png', 'oops'],
  };
  await openProjectFile(
    page,
    'scratch_ticket_config.json',
    Buffer.from(JSON.stringify(legacy)),
    'application/json',
  );
  await expect(toast(page, '已讀入原作的設定檔。')).toBeVisible();
  await expect(toast(page, '有 1 張圖片讀不了。')).toBeVisible();
  const s = await stored(page);
  expect(s).toMatchObject({
    width: 300,
    height: 150,
    seed: 4242,
    coverText: '긁어 보세요!',
    brush: 20,
  });
  expect((s.images as { kind: string }[]).map((i) => i.kind)).toEqual(['asset', 'url']);
  await expect(cover(page)).toHaveAttribute('width', '300');
  expect(near(await coverColorNear(page, 5, 5), [0, 0, 0])).toBe(true);
  /* 一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await stored(page)).coverText).toBe('專案');

  /* 不認得的檔 */
  await openProjectFile(page, 'x.json', Buffer.from(strToU8('{"hello":1}')), 'application/json');
  await expect(toast(page, '無法開啟專案檔')).toBeVisible();
  expect((await stored(page)).coverText).toBe('專案');
  expect(errors).toEqual([]);
});

/* ---------- 版面與視覺基準 ---------- */

test('版面：390 寬沒有橫向捲動；1280 與 390 的視覺基準（F59）', async ({ page }) => {
  await fixedRandom(page);
  const errors = await open(page);
  await seed(page, { fixedSeed: true, seed: 2024, kind: 'icons', count: 4 });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('scratch-card-1280.png', { fullPage: true });
  /* 刮開一半的樣子 */
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = 'canvas[data-scx="confetti"]{display:none!important}';
    document.head.appendChild(s);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.getByRole('switch', { name: '進階設定' }).click();
  await page.getByRole('textbox', { name: '標題文字' }).fill('酒館的抽獎券');
  await page.getByRole('textbox', { name: '標題文字' }).blur();
  await noHorizontalScroll(page);
  await scratch(page, cover(page), 5, 0.5);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('scratch-card-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
