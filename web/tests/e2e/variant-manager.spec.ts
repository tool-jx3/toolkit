/**
 * 角色差分管理器（建置產物 next/variant-manager/）的端對端測試：
 * - 開頁沒有 pageerror／console error；初始狀態、按鈕啟用規則；頁尾只放靈感來源；
 * - 載入：點整個載入區選檔（只列 PNG／JPEG／WebP）、拖放（醒目狀態）、類型過濾、累加、去重（檔名＋大小＋修改時間）、主名稱自動帶入；
 * - 命名：主名稱清理與 character、編號開關、差分名即時更新輸出檔名／大圖標籤／聊天面板、建議詞、自動完成候選；
 * - 選取：點一列、聚焦差分名欄、整頁 ↑↓（到頭到尾就停、不捲動頁面、文字欄裡不作用）、拖曳排序（往下、往上）；
 *   再次載入後維持選取（F10 追加裁定）；清單面板配合視窗高度、↑↓ 只捲清單就看得到選到的列（F11 追加裁定）；
 * - 匯出：ZIP 解開比對檔名與順序、圖片逐位元組相同、聊天面板文字檔、撞名自動加序號、完成提示約 2.2 秒後消失；
 * - 複製聊天面板（剪貼簿內容）、快捷鍵（Ctrl＋Shift＋O／E／L／Enter〔F30 追加裁定：取代 N〕、Esc 的兩種情況、文字欄裡的 Esc）、
 *   快捷鍵說明標出在文字欄裡也作用的組合、重設確認、單張移除；
 * - 不保留狀態；390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('variant-manager') ?? { id: 'variant-manager', status: 'next' })}/`;

/** 透明畫布中央一塊不透明的色塊 */
async function png(w: number, h: number, rgb: [number, number, number]): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = Math.floor(h * 0.1); y < h; y++) {
    for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.75); x++) {
      const k = (y * w + x) * 4;
      px[k] = rgb[0];
      px[k + 1] = rgb[1];
      px[k + 2] = rgb[2];
      px[k + 3] = 255;
    }
  }
  return Buffer.from(await encodePng(px, w, h));
}

const RED = () => png(120, 240, [220, 70, 70]);
const GREEN = () => png(160, 260, [70, 190, 90]);
const BLUE = () => png(900, 1400, [70, 90, 220]);
const GOLD = () => png(100, 100, [220, 180, 40]);

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
  await expect(page.getByRole('heading', { level: 1, name: '角色差分管理器' })).toBeVisible();
  return errors;
}

const zone = (page: Page) =>
  page.getByRole('group', { name: '把差分圖拖到這裡，或點一下選擇檔案' });
const input = (page: Page) => zone(page).locator('input[type=file]');
const list = (page: Page) => page.getByRole('list', { name: '差分清單' });
const rows = (page: Page) => list(page).getByRole('listitem');
const status = (page: Page) => page.getByTestId('status-text');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const mainName = (page: Page) => page.getByLabel('主名稱', { exact: true });
const numbering = (page: Page) => page.getByRole('switch', { name: '加上編號' });
const variant = (page: Page, n: number) => page.getByLabel(`第 ${n} 張的差分名`, { exact: true });
const outputs = (page: Page) => page.getByTestId('output-name');
const palette = (page: Page) => page.getByRole('textbox', { name: '聊天面板文字' });
const chip = (page: Page, name: string) =>
  page.getByRole('group', { name: '差分名建議' }).getByRole('button', { name, exact: true });
const selectedVariant = (page: Page) => page.getByTestId('selected-variant');
const selectedOutput = (page: Page) => page.getByTestId('selected-output');
const confirmDialog = (page: Page) => page.getByRole('alertdialog');

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 第幾列被選取（aria-current） */
async function selectedRow(page: Page): Promise<number> {
  return rows(page).evaluateAll((els) => els.findIndex((el) => el.getAttribute('aria-current')));
}

/** 把焦點移出文字欄（點頁首的標題） */
async function blur(page: Page) {
  await page.getByRole('heading', { level: 1 }).click();
}

/** 解開 ZIP：依 ZIP 內的順序回傳檔名與內容 */
async function readZip(dl: Download): Promise<{ name: string; data: Uint8Array }[]> {
  const bytes = readFileSync((await dl.path()) as string);
  const order: string[] = [];
  const files = unzipSync(new Uint8Array(bytes), {
    filter: (f) => {
      order.push(f.name);
      return true;
    },
  });
  return order.map((name) => ({ name, data: files[name] }));
}

/** 用 DataTransfer 拖放（可以指定修改時間） */
async function drop(
  page: Page,
  target: Locator,
  files: { name: string; type: string; b64: string; lastModified: number }[],
) {
  const dt = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], f.name, { type: f.type, lastModified: f.lastModified }));
    }
    return dt;
  }, files);
  await target.dispatchEvent('dragenter', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });
}

/** 載入三張（紅、綠、藍）並等縮圖與大圖都出來 */
async function loadThree(page: Page) {
  await input(page).setInputFiles([
    file('alice_smile.png', await RED()),
    file('alice_angry.png', await GREEN()),
    file('Alice Normal.JPG', await BLUE(), 'image/jpeg'),
  ]);
  await expect(rows(page)).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(rows(page).nth(i).locator('img')).toBeVisible();
  await expect(page.getByTestId('preview-image')).toBeVisible();
}

test.use({
  contextOptions: { reducedMotion: 'reduce' },
  viewport: { width: 1280, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});

test('開頁沒有錯誤；初始狀態與按鈕；頁尾只放靈感來源；說明', async ({ page }) => {
  const errors = await open(page);
  await expect(status(page)).toHaveText(/先載入同一個角色的差分圖/);
  await expect(btn(page, '匯出 ZIP')).toBeDisabled();
  await expect(btn(page, '複製聊天面板文字')).toBeDisabled();
  await expect(page.getByTestId('file-count')).toHaveText('共 0 個檔案');
  await expect(page.getByText('還沒有圖片。先在上面載入同一個角色的差分圖。')).toBeVisible();
  await expect(selectedVariant(page)).toHaveText('沒有圖片');
  await expect(selectedOutput(page)).toHaveText('-');
  await expect(mainName(page)).toHaveValue('');
  await expect(mainName(page)).toHaveAttribute('placeholder', /例：/);
  await expect(numbering(page)).toBeChecked();
  await expect(palette(page)).toHaveValue('');
  await expect(palette(page)).toHaveAttribute('placeholder', '@普通\n@微笑\n@生氣');
  await expect(page.getByTestId('zip-name')).toHaveText('ZIP 檔名：character_sabun.zip');
  /* 頁尾：只有靈感來源 */
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link')).toHaveCount(1);
  await expect(footer.getByRole('link', { name: 'くま。／TRPG WEBツール観測所' })).toHaveAttribute(
    'href',
    'https://kumachansteps.github.io/trpg-web-tools/',
  );
  /* 使用方式（頁首「說明」） */
  await page.getByRole('button', { name: '說明' }).click();
  const help = page.getByRole('dialog', { name: '角色差分管理器：使用方式' });
  await expect(help).toBeVisible();
  await expect(help).toContainText('聊天面板');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('選檔載入：點整個載入區、只列 PNG／JPEG／WebP、類型過濾、累加、主名稱自動帶入', async ({
  page,
}) => {
  const errors = await open(page);
  /* F01：點載入區的空白處（不是按鈕）也會開選檔視窗 */
  const box = (await zone(page).boundingBox())!;
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.mouse.click(box.x + 12, box.y + 12),
  ]);
  expect(chooser.isMultiple()).toBe(true);
  const accept = await chooser.element().getAttribute('accept');
  expect(accept?.split(',')).toEqual(
    expect.arrayContaining(['image/png', 'image/jpeg', 'image/webp']),
  );
  expect(accept).not.toContain('image/*');
  await chooser.setFiles([
    file('alice_smile.png', await RED()),
    file('筆記.txt', Buffer.from('不是圖片'), 'text/plain'),
  ]);
  await expect(status(page)).toHaveText('已加入 1 張，清單共 1 張。');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('1. alice_smile.png');
  await expect(page.getByTestId('file-count')).toHaveText('共 1 個檔案');
  /* F07：主名稱帶入（去掉結尾的表情詞） */
  await expect(mainName(page)).toHaveValue('alice');
  await expect(outputs(page).first()).toHaveText('alice01.png');
  await expect(btn(page, '匯出 ZIP')).toBeEnabled();
  await expect(btn(page, '複製聊天面板文字')).toBeDisabled();

  /* F03：全部都不是圖片：警告，清單不變 */
  await input(page).setInputFiles([file('說明.txt', Buffer.from('x'), 'text/plain')]);
  await expect(status(page)).toHaveText(/沒有可用的圖片/);
  await expect(page.getByRole('status').filter({ hasText: '沒有可用的圖片' })).toHaveAttribute(
    'data-tone',
    'warning',
  );
  await expect(rows(page)).toHaveCount(1);

  /* F04：累加到最後；主名稱已有內容時不動 */
  await mainName(page).fill('my char:01');
  await input(page).setInputFiles([
    file('bob_angry.png', await GREEN()),
    file('動圖.gif', await GOLD(), 'image/gif'),
  ]);
  await expect(status(page)).toHaveText('已加入 2 張，清單共 3 張。');
  await expect(mainName(page)).toHaveValue('my char:01');
  await expect(outputs(page)).toHaveText(['my_char0101.png', 'my_char0102.png', 'my_char0103.gif']);
  /* F10：載入後選取第一張 */
  expect(await selectedRow(page)).toBe(0);

  /* 主名稱清空（只有空白）後再載入：用清單第一張的檔名帶入 */
  await mainName(page).fill('   ');
  await expect(outputs(page).first()).toHaveText('character01.png');
  await input(page).setInputFiles([file('Mira Angry.webp', await GOLD(), 'image/webp')]);
  await expect(mainName(page)).toHaveValue('alice');
  await expect(rows(page)).toHaveCount(4);
  await expect(outputs(page).nth(3)).toHaveText('alice04.webp');
  expect(errors).toEqual([]);
});

test('去重：檔名、大小、修改時間都相同才略過', async ({ page }, testInfo) => {
  const errors = await open(page);
  const a = testInfo.outputPath('a.png');
  const b = testInfo.outputPath('b.png');
  writeFileSync(a, await RED());
  writeFileSync(b, await GREEN());
  const t = new Date('2026-09-01T12:00:00Z');
  utimesSync(a, t, t);
  utimesSync(b, t, t);
  await input(page).setInputFiles([a]);
  await expect(status(page)).toHaveText('已加入 1 張，清單共 1 張。');
  await input(page).setInputFiles([a, b]);
  await expect(status(page)).toHaveText('已加入 1 張，清單共 2 張。');
  await input(page).setInputFiles([a, b]);
  await expect(status(page)).toHaveText('加入 0 張：這些檔案都已經在清單裡（清單共 2 張）。');
  await expect(rows(page)).toHaveCount(2);

  /* 拖放：同名同大小但修改時間不同 → 視為不同檔案 */
  const b64 = (await RED()).toString('base64');
  await drop(page, zone(page), [
    { name: 'x.png', type: 'image/png', b64, lastModified: 1_000 },
    { name: 'x.png', type: 'image/png', b64, lastModified: 1_000 },
    { name: 'x.png', type: 'image/png', b64, lastModified: 2_000 },
  ]);
  await expect(status(page)).toHaveText('已加入 2 張，清單共 4 張。');
  expect(errors).toEqual([]);
});

test('拖放載入：拖曳經過時醒目、放開後加入、非圖片略過', async ({ page }) => {
  const errors = await open(page);
  const b64 = (await RED()).toString('base64');
  const dt = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], '拖進來的_微笑.png', { type: 'image/png' }));
    dt.items.add(new File(['x'], '說明.txt', { type: 'text/plain' }));
    return dt;
  }, b64);
  const z = zone(page);
  await z.dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(z).toHaveAttribute('data-over', 'true');
  await z.dispatchEvent('dragleave', { dataTransfer: dt });
  await expect(z).not.toHaveAttribute('data-over');
  await z.dispatchEvent('dragenter', { dataTransfer: dt });
  await z.dispatchEvent('drop', { dataTransfer: dt });
  await expect(z).not.toHaveAttribute('data-over');
  await expect(rows(page)).toHaveCount(1);
  await expect(status(page)).toHaveText('已加入 1 張，清單共 1 張。');
  await expect(mainName(page)).toHaveValue('拖進來的');
  expect(errors).toEqual([]);
});

test('命名：差分名即時更新輸出檔名、大圖標籤、聊天面板；編號開關；建議詞；自動完成', async ({
  page,
}) => {
  const errors = await open(page);
  /* F19：沒有圖片時點建議詞只警告 */
  await chip(page, '微笑').click();
  await expect(status(page)).toHaveText('請先載入並選取一張圖片。');
  await expect(page.getByRole('group', { name: '差分名建議' }).getByRole('button')).toHaveCount(23);

  await loadThree(page);
  await expect(mainName(page)).toHaveValue('alice');
  await expect(outputs(page)).toHaveText(['alice01.png', 'alice02.png', 'alice03.jpg']);
  await expect(selectedVariant(page)).toHaveText('（未輸入）');
  await expect(selectedOutput(page)).toHaveText('alice01.png');

  /* F09：輸入差分名；F17 標籤顯示原樣、檔名與聊天面板用清理後的 */
  await variant(page, 1).fill('怒り/怒?');
  await expect(outputs(page).first()).toHaveText('alice01_怒り怒.png');
  await expect(selectedVariant(page)).toHaveText('怒り/怒?');
  await expect(selectedOutput(page)).toHaveText('alice01_怒り怒.png');
  await expect(palette(page)).toHaveValue('@怒り怒');
  await expect(btn(page, '複製聊天面板文字')).toBeEnabled();

  /* F10：聚焦第 3 張的差分名欄就選取那一張 */
  await variant(page, 3).fill('笑 大');
  expect(await selectedRow(page)).toBe(2);
  await expect(selectedOutput(page)).toHaveText('alice03_笑_大.jpg');
  await expect(palette(page)).toHaveValue('@怒り怒\n@笑_大');
  await expect(page.getByTestId('palette-lines')).toHaveText('共 2 行');

  /* 自動完成的候選＝建議名稱 */
  const listId = await variant(page, 2).getAttribute('list');
  expect(listId).toBeTruthy();
  const options = await page
    .locator(`datalist[id="${listId}"] option`)
    .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
  expect(options).toHaveLength(23);
  expect(options).toContain('微笑');

  /* F19：建議詞覆蓋選取中那張的差分名 */
  await rows(page).nth(1).locator('img').click();
  expect(await selectedRow(page)).toBe(1);
  await chip(page, '生氣').click();
  await expect(variant(page, 2)).toHaveValue('生氣');
  await expect(chip(page, '生氣')).toHaveAttribute('aria-pressed', 'true');
  await chip(page, '大笑').click();
  await expect(variant(page, 2)).toHaveValue('大笑');
  await expect(palette(page)).toHaveValue('@怒り怒\n@大笑\n@笑_大');

  /* F13：編號開關 */
  await numbering(page).click();
  await expect(status(page)).toHaveText('編號：關。');
  await expect(outputs(page)).toHaveText(['alice_怒り怒.png', 'alice_大笑.png', 'alice_笑_大.jpg']);
  await numbering(page).click();
  await expect(status(page)).toHaveText(/編號：開/);

  /* F06：主名稱清理、空白時 character */
  await mainName(page).fill(' my char:01 ');
  await expect(outputs(page).first()).toHaveText('my_char0101_怒り怒.png');
  await expect(page.getByTestId('zip-name')).toHaveText('ZIP 檔名：my_char01_sabun.zip');
  await mainName(page).fill('');
  await expect(outputs(page).nth(1)).toHaveText('character02_大笑.png');

  /* F24：只剩空白（清理後是空的）名稱時，複製停用 */
  for (const n of [1, 2, 3]) await variant(page, n).fill(' / ');
  await expect(palette(page)).toHaveValue('');
  await expect(btn(page, '複製聊天面板文字')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('選取：點一列後焦點在清單、整頁 ↑↓ 切換（到頭停、不捲動頁面、文字欄裡不作用）', async ({
  page,
}) => {
  const errors = await open(page);
  await loadThree(page);
  await rows(page).nth(0).locator('img').click();
  await expect(list(page)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  expect(await selectedRow(page)).toBe(1);
  await expect(page.getByTestId('preview-image')).toHaveAttribute('alt', 'alice_angry.png');

  /* 焦點不在清單上（點頁首標題）也能用 */
  await blur(page);
  await page.evaluate(() => window.scrollTo(0, 120));
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('ArrowDown');
  expect(await selectedRow(page)).toBe(2);
  await page.keyboard.press('ArrowDown');
  expect(await selectedRow(page)).toBe(2);
  expect(await page.evaluate(() => window.scrollY)).toBe(y0);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await selectedRow(page)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(y0);
  await expect(selectedOutput(page)).toHaveText('alice01.png');

  /* 在文字欄裡不作用 */
  await mainName(page).focus();
  await page.keyboard.press('ArrowDown');
  expect(await selectedRow(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('F10：再次載入後維持原本的選取（加入新檔、全部重複都一樣）；選取的那張不在了才選第一張', async ({
  page,
}, testInfo) => {
  const errors = await open(page);
  /* 重複檔要修改時間也相同：寫到磁碟、固定修改時間 */
  const cry = testInfo.outputPath('alice_cry.png');
  writeFileSync(cry, await GOLD());
  const t = new Date('2026-09-01T12:00:00Z');
  utimesSync(cry, t, t);
  await loadThree(page);
  expect(await selectedRow(page)).toBe(0);
  await rows(page).nth(2).locator('img').click();
  expect(await selectedRow(page)).toBe(2);
  await expect(selectedOutput(page)).toHaveText('alice03.jpg');
  const previewSrc = await page.getByTestId('preview-image').getAttribute('src');

  /* 加入新檔：選取、大圖、輸出檔名都不變 */
  await input(page).setInputFiles([cry]);
  await expect(status(page)).toHaveText('已加入 1 張，清單共 4 張。');
  expect(await selectedRow(page)).toBe(2);
  await expect(selectedOutput(page)).toHaveText('alice03.jpg');
  await expect(page.getByTestId('preview-image')).toHaveAttribute('src', previewSrc!);

  /* 全部重複（加入 0 張）：同樣維持 */
  await input(page).setInputFiles([cry]);
  await expect(status(page)).toHaveText('加入 0 張：這些檔案都已經在清單裡（清單共 4 張）。');
  expect(await selectedRow(page)).toBe(2);
  await expect(selectedOutput(page)).toHaveText('alice03.jpg');

  /* 選取的那張被移除後再載入：選第一張 */
  await page.getByRole('button', { name: '移除「Alice Normal.JPG」' }).click();
  await input(page).setInputFiles([file('alice_wink.png', await RED())]);
  await expect(rows(page)).toHaveCount(4);
  expect(await selectedRow(page)).toBe(0);
  await expect(selectedOutput(page)).toHaveText('alice01.png');
  expect(errors).toEqual([]);
});

test.describe('F11：清單面板的高度與 ↑↓', () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  /** 選取中的列：完全在清單面板與畫面（頁首下方）裡 */
  async function selectedRowVisible(page: Page) {
    return page.evaluate(() => {
      const box = document.querySelector('[data-testid="list-scroller"]')!.getBoundingClientRect();
      const row = document.querySelector('ul[aria-label="差分清單"] > li[aria-current]')!;
      const r = row.getBoundingClientRect();
      const header = document.querySelector('header')!.getBoundingClientRect().bottom;
      const inBox = r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
      const onScreen = r.top >= header - 0.5 && r.bottom <= innerHeight + 0.5;
      return inBox && onScreen;
    });
  }

  test('清單面板的下緣停在視窗裡；↑↓ 只捲清單、整頁不動，選到的列都看得到（焦點在清單上、不在清單上）', async ({
    page,
  }) => {
    const errors = await open(page);
    const files = [];
    for (let i = 0; i < 12; i++)
      files.push(file(`p${String(i).padStart(2, '0')}.png`, await RED()));
    await input(page).setInputFiles(files);
    await expect(rows(page)).toHaveCount(12);
    const scroller = page.getByTestId('list-scroller');
    const geo = await scroller.evaluate((el) => ({
      bottom: el.getBoundingClientRect().bottom,
      overflow: el.scrollHeight > el.clientHeight,
    }));
    expect(geo.bottom).toBeLessThanOrEqual(1100);
    expect(geo.overflow).toBe(true);

    /* 焦點在清單上 */
    await rows(page).nth(0).locator('img').click();
    await expect(list(page)).toBeFocused();
    const y0 = await page.evaluate(() => window.scrollY);
    for (let i = 1; i < 12; i++) {
      await page.keyboard.press('ArrowDown');
      expect(await selectedRow(page)).toBe(i);
      expect(await selectedRowVisible(page), `第 ${i + 1} 列`).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBe(y0);
    }
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    /* 焦點不在清單上（整頁的 ↑↓） */
    await blur(page);
    for (let i = 10; i >= 0; i--) {
      await page.keyboard.press('ArrowUp');
      expect(await selectedRow(page)).toBe(i);
      expect(await selectedRowVisible(page), `第 ${i + 1} 列`).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBe(y0);
    }
    /* 回到第一列：清單捲回最上面（只剩面板 2 px 的內距） */
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  test('常見筆電尺寸：清單面板至少約四列高（複驗後調整）', async ({ page }) => {
    const errors = await open(page);
    const files = [];
    for (let i = 0; i < 12; i++)
      files.push(file(`n${String(i).padStart(2, '0')}.png`, await RED()));
    await input(page).setInputFiles(files);
    await expect(rows(page)).toHaveCount(12);
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(
          () =>
            page.getByTestId('list-scroller').evaluate((el) => el.getBoundingClientRect().height),
          { message: `${width}×${height}` },
        )
        .toBeGreaterThanOrEqual(400);
    }
    expect(errors).toEqual([]);
  });

  test('視窗更矮（清單面板保留的最小高度超出視窗）：選到的列仍然看得到', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    const errors = await open(page);
    const files = [];
    for (let i = 0; i < 8; i++) files.push(file(`q${i}.png`, await GREEN()));
    await input(page).setInputFiles(files);
    await expect(rows(page)).toHaveCount(8);
    await blur(page);
    for (let i = 1; i < 8; i++) {
      await page.keyboard.press('ArrowDown');
      expect(await selectedRow(page)).toBe(i);
      expect(await selectedRowVisible(page), `第 ${i + 1} 列`).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});

test('拖曳排序：往下落在目標後、往上落在目標前；編號、聊天面板跟著改；從文字欄拖不算', async ({
  page,
}) => {
  /* 視窗高一點，四列都在清單面板裡看得到（清單面板的高度配合視窗，F11） */
  await page.setViewportSize({ width: 1280, height: 1200 });
  const errors = await open(page);
  await input(page).setInputFiles([
    file('a.png', await RED()),
    file('b.png', await GREEN()),
    file('c.png', await BLUE()),
    file('d.png', await GOLD()),
  ]);
  await expect(rows(page)).toHaveCount(4);
  await mainName(page).fill('x');
  for (const [n, v] of [
    [1, 'A'],
    [2, 'B'],
    [3, 'C'],
    [4, 'D'],
  ] as const)
    await variant(page, n).fill(v);

  const dragRow = async (from: number, to: number) => {
    const src = (await rows(page).nth(from).boundingBox())!;
    const dst = (await rows(page).nth(to).boundingBox())!;
    await page.mouse.move(src.x + 30, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 30, src.y + src.height / 2 + 8, { steps: 2 });
    await expect(rows(page).nth(from)).toHaveAttribute('data-dragging', 'true');
    await page.mouse.move(dst.x + 30, dst.y + dst.height / 2, { steps: 6 });
    await expect(rows(page).nth(to)).toHaveAttribute('data-over', 'true');
    await page.mouse.up();
  };

  /* 第 1 張拖到第 3 張：落在目標之後 */
  await dragRow(0, 2);
  await expect(status(page)).toHaveText('已調整順序。');
  await expect(rows(page)).toContainText(['1. b.png', '2. c.png', '3. a.png', '4. d.png']);
  await expect(outputs(page)).toHaveText(['x01_B.png', 'x02_C.png', 'x03_A.png', 'x04_D.png']);
  await expect(palette(page)).toHaveValue('@B\n@C\n@A\n@D');
  expect(await selectedRow(page)).toBe(2);

  /* 第 4 張拖到第 2 張：落在目標之前 */
  await dragRow(3, 1);
  await expect(rows(page)).toContainText(['1. b.png', '2. d.png', '3. c.png', '4. a.png']);
  await expect(palette(page)).toHaveValue('@B\n@D\n@C\n@A');
  expect(await selectedRow(page)).toBe(1);

  /* 從差分名欄開始拖：不排序 */
  const field = (await variant(page, 1).boundingBox())!;
  const dst = (await rows(page).nth(3).boundingBox())!;
  await page.mouse.move(field.x + 10, field.y + field.height / 2);
  await page.mouse.down();
  await page.mouse.move(dst.x + 30, dst.y + dst.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(rows(page)).toContainText(['1. b.png', '2. d.png', '3. c.png', '4. a.png']);
  expect(errors).toEqual([]);
});

test('匯出 ZIP：檔名與順序、圖片逐位元組相同、聊天面板文字檔、完成提示', async ({ page }) => {
  const errors = await open(page);
  const red = await RED();
  const green = await GREEN();
  const blue = await BLUE();
  const broken = Buffer.from('這不是 PNG');
  await input(page).setInputFiles([
    file('alice_smile.png', red),
    file('alice_angry.png', green),
    file('Alice Normal.JPG', blue, 'image/jpeg'),
    file('沒有副檔名', broken),
  ]);
  await expect(rows(page)).toHaveCount(4);
  await variant(page, 1).fill('笑 大');
  await variant(page, 2).fill('怒り/怒?');
  await variant(page, 4).fill('生氣');
  /* 損壞的圖片照樣列出，大圖區標示無法顯示 */
  await expect(rows(page).nth(3).locator('[data-placeholder]')).toBeVisible();
  await expect(page.getByTestId('preview-broken')).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出 ZIP').click()]);
  expect(dl.suggestedFilename()).toBe('alice_sabun.zip');
  await expect(status(page)).toHaveText('已開始下載 alice_sabun.zip（4 張圖片＋聊天面板文字）。');
  /* 完成提示約 2.2 秒後消失 */
  const toast = page.getByText('ZIP 已開始下載', { exact: true });
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 5000 });

  const entries = await readZip(dl);
  expect(entries.map((e) => e.name)).toEqual([
    'alice01_笑_大.png',
    'alice02_怒り怒.png',
    'alice03.jpg',
    'alice04_生氣.png',
    'sabun-chatpalette.txt',
  ]);
  expect(Buffer.from(entries[0].data).equals(red)).toBe(true);
  expect(Buffer.from(entries[1].data).equals(green)).toBe(true);
  expect(Buffer.from(entries[2].data).equals(blue)).toBe(true);
  expect(Buffer.from(entries[3].data).equals(broken)).toBe(true);
  /* UTF-8、沒有 BOM、LF、最後沒有換行；與畫面上的聊天面板相同 */
  const text = Buffer.from(entries[4].data);
  expect(text.equals(Buffer.from('@笑_大\n@怒り怒\n@生氣', 'utf8'))).toBe(true);
  await expect(palette(page)).toHaveValue('@笑_大\n@怒り怒\n@生氣');
  expect(errors).toEqual([]);
});

test('ZIP 內撞名：自動加序號、加了之後再檢查，不覆蓋；清單上不顯示序號', async ({ page }) => {
  const errors = await open(page);
  const bufs = [await RED(), await GREEN(), await BLUE()];
  await input(page).setInputFiles([
    file('p1.png', bufs[0]),
    file('p2.png', bufs[1]),
    file('p3.png', bufs[2]),
  ]);
  await mainName(page).fill('x');
  await numbering(page).click();
  await variant(page, 1).fill('a');
  await variant(page, 2).fill('a');
  await variant(page, 3).fill('a_2');
  await expect(outputs(page)).toHaveText(['x_a.png', 'x_a.png', 'x_a_2.png']);
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出 ZIP').click()]);
  const entries = await readZip(dl);
  expect(entries.map((e) => e.name)).toEqual([
    'x_a.png',
    'x_a_2.png',
    'x_a_2_2.png',
    'sabun-chatpalette.txt',
  ]);
  entries.slice(0, 3).forEach((e, i) => {
    expect(Buffer.from(e.data).equals(bufs[i])).toBe(true);
  });
  expect(Buffer.from(entries[3].data).toString('utf8')).toBe('@a\n@a\n@a_2');
  expect(errors).toEqual([]);
});

test('複製聊天面板：剪貼簿內容與畫面、狀態列', async ({ page }) => {
  const errors = await open(page);
  await loadThree(page);
  await variant(page, 1).fill('普通');
  await variant(page, 3).fill('生 氣');
  await btn(page, '複製聊天面板文字').click();
  await expect(status(page)).toHaveText('已複製聊天面板文字（2 行）。');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('@普通\n@生_氣');
  expect(errors).toEqual([]);
});

test('快捷鍵：Ctrl＋Shift＋O／E／L／Enter（文字欄、開關、按鈕上也作用）、說明列出改用的按鍵與標示', async ({
  page,
}) => {
  const errors = await open(page);
  /* E：清單空時不動作 */
  let downloads = 0;
  page.on('download', () => downloads++);
  await blur(page);
  await page.keyboard.press('Control+Shift+E');
  await page.waitForTimeout(300);
  expect(downloads).toBe(0);
  await expect(status(page)).toHaveText(/先載入同一個角色的差分圖/);
  /* L：聊天面板空時不動作 */
  await page.keyboard.press('Control+Shift+L');
  await expect(status(page)).toHaveText(/先載入同一個角色的差分圖/);

  /* O：開啟選檔視窗 */
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Control+Shift+O'),
  ]);
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([file('alice_smile.png', await RED()), file('b.png', await GREEN())]);
  await expect(rows(page)).toHaveCount(2);

  /* Enter（F30：Ctrl＋Shift＋N 是瀏覽器保留給無痕視窗的組合，改用 Enter）：在文字欄裡也能切換 */
  await variant(page, 1).fill('微笑');
  await variant(page, 1).focus();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(numbering(page)).not.toBeChecked();
  await expect(status(page)).toHaveText('編號：關。');
  await expect(outputs(page).first()).toHaveText('alice_微笑.png');
  await page.keyboard.press('Control+Shift+Enter');
  await expect(numbering(page)).toBeChecked();
  await expect(variant(page, 1)).toHaveValue('微笑');
  await expect(variant(page, 1)).toBeFocused();
  /* 主名稱欄、開關、按鈕上也作用（不會按到按鈕） */
  await mainName(page).focus();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(numbering(page)).not.toBeChecked();
  await numbering(page).focus();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(numbering(page)).toBeChecked();
  await btn(page, '重設').focus();
  await page.keyboard.press('Control+Shift+Enter');
  await expect(numbering(page)).not.toBeChecked();
  await expect(confirmDialog(page)).toHaveCount(0);
  await page.keyboard.press('Control+Shift+Enter');
  await expect(numbering(page)).toBeChecked();
  /* 舊的 N 不再切換 */
  await blur(page);
  await page.keyboard.press('Control+Shift+N');
  await page.waitForTimeout(200);
  await expect(numbering(page)).toBeChecked();

  /* L：複製（Ctrl＋Shift＋C 會開開發者工具，改用 L） */
  await page.keyboard.press('Control+Shift+L');
  await expect(status(page)).toHaveText('已複製聊天面板文字（1 行）。');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('@微笑');

  /* E：匯出 */
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+Shift+E'),
  ]);
  expect(dl.suggestedFilename()).toBe('alice_sabun.zip');
  expect((await readZip(dl)).map((e) => e.name)).toEqual([
    'alice01_微笑.png',
    'alice02.png',
    'sabun-chatpalette.txt',
  ]);

  /* 快捷鍵說明（?） */
  await blur(page);
  await page.keyboard.press('?');
  const keys = page.getByRole('dialog', { name: '快捷鍵' });
  await expect(keys).toBeVisible();
  await expect(keys).toContainText('匯出 ZIP');
  await expect(keys).toContainText('Ctrl＋Shift＋C 會開啟瀏覽器的開發者工具');
  await expect(keys).toContainText(
    'Ctrl＋Shift＋N 是瀏覽器開無痕視窗的按鍵，網頁收不到，所以改用 Enter',
  );
  /* 在文字欄裡也作用的組合（O、E、L、Enter）有標示，↑↓、Esc、? 沒有 */
  await expect(keys).toContainText('標示「輸入框裡也可用」的在輸入框裡照樣作用');
  const marked = keys.locator('[data-in-input]');
  await expect(marked).toHaveCount(4);
  for (const label of ['選擇圖片', '匯出 ZIP', '複製聊天面板文字', '切換編號'])
    await expect(marked.filter({ hasText: label })).toContainText('輸入框裡也可用');
  await expect(marked.filter({ hasText: '切換編號' }).locator('kbd')).toHaveText([
    'Ctrl',
    'Shift',
    'Enter',
  ]);
  await expect(keys.getByText('輸入框裡也可用', { exact: true })).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  await expect(confirmDialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('重設：按鈕與 Esc 都先確認；取消不變、確定清空；文字欄裡的 Esc 不觸發', async ({ page }) => {
  const errors = await open(page);
  await loadThree(page);
  await mainName(page).fill('mira');
  await variant(page, 2).fill('生氣');
  await numbering(page).click();

  /* 文字欄裡按 Esc：不跳確認（主控裁定） */
  await variant(page, 2).focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await expect(confirmDialog(page)).toHaveCount(0);

  /* 按鈕 → 取消 */
  await btn(page, '重設').click();
  await expect(confirmDialog(page)).toBeVisible();
  await expect(confirmDialog(page)).toContainText('會清空圖片清單、主名稱與所有差分名');
  await confirmDialog(page).getByRole('button', { name: '取消' }).click();
  await expect(confirmDialog(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(mainName(page)).toHaveValue('mira');

  /* Esc（不在文字欄）→ 確定 */
  await blur(page);
  await page.keyboard.press('Escape');
  await expect(confirmDialog(page)).toBeVisible();
  await confirmDialog(page).getByRole('button', { name: '重設' }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(mainName(page)).toHaveValue('');
  await expect(numbering(page)).toBeChecked();
  await expect(palette(page)).toHaveValue('');
  await expect(status(page)).toHaveText('已重設，清單與所有輸入都已清空。');
  await expect(btn(page, '匯出 ZIP')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('單張移除（可接受的增加）；不保留狀態（重新整理後回到初始）', async ({ page }) => {
  const errors = await open(page);
  await loadThree(page);
  await variant(page, 2).fill('生氣');
  await rows(page).nth(1).locator('img').click();
  await page.getByRole('button', { name: '移除「alice_angry.png」' }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(status(page)).toHaveText('已移除「alice_angry.png」。');
  /* 選取的那張不在了：視為第一張 */
  expect(await selectedRow(page)).toBe(0);
  await expect(outputs(page)).toHaveText(['alice01.png', 'alice02.jpg']);
  await expect(palette(page)).toHaveValue('');

  await page.reload();
  await expect(rows(page)).toHaveCount(0);
  await expect(mainName(page)).toHaveValue('');
  await expect(numbering(page)).toBeChecked();
  await expect(status(page)).toHaveText(/先載入同一個角色的差分圖/);
  const stored = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.includes('variant-manager')),
  );
  expect(stored).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('視覺回歸', () => {
  async function loadForShot(page: Page) {
    await loadThree(page);
    await variant(page, 1).fill('微笑');
    await variant(page, 2).fill('生氣');
    await blur(page);
    await page.mouse.move(0, 0);
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await loadForShot(page);
    await expect(page).toHaveScreenshot('variant-manager-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await loadForShot(page);
    await expect(page).toHaveScreenshot('variant-manager-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
