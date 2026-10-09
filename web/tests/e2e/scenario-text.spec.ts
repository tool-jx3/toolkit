/**
 * 劇本文字產生器（建置產物 next/scenario-text/）的端對端測試（規格 docs/refactor/specs/scenario-text.md）：
 * - 開頁沒有錯誤、預設狀態、頁尾只有靈感來源。
 * - 台本與依小標分段：範例、讀取方式、未登錄的說話者與差分。
 * - 圖片庫：加入（同內容、格式不符）、名稱的自動對應、網址、刪除（列出用到的地方）、每張圖做一則。
 * - 說話者：從圖片庫建立差分、效果差分（剪影的透明檢查、模糊加邊）、新增與刪除。
 * - 預覽：訊息框的原尺寸、三種視窗寬度、資訊文字、聊天欄、差分名稱加進標題。
 * - 修改與清單：標題、說話者、差分、圖片、本文、上下移、加一則、刪除、從文字重建；鍵盤。
 * - 確定、已確定的清單（展開、上下移、放回、刪除）。
 * - 匯出房間 ZIP（解析 __data.json 與圖片）、本文空白的檢查；打包圖片（解析清單文字）。
 * - 專案檔（存、重來、開啟、原作的專案檔）、自動保存、復原、拖到拖放區以外。
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync, zlibSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('scenario-text') ?? { id: 'scenario-text', status: 'next' })}/`;

/* ---------- 測試圖（自己畫的簡單圖形） ---------- */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(w: number, h: number, px: (x: number, y: number) => number[]): Buffer {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
const figure = (rgb: number[]) => (x: number, y: number) =>
  (x - 30) ** 2 + (y - 25) ** 2 < 225 || (y > 38 && y < 118 && Math.abs(x - 30) < 8 + (y - 38) / 5)
    ? [...rgb, 255]
    : [0, 0, 0, 0];
const ALICE = png(60, 120, figure([220, 120, 160]));
const ALICE_SMILE = png(60, 120, figure([250, 190, 80]));
const KEY = png(100, 50, (_x, y) =>
  Math.abs(y - 25) < 5 ? [200, 170, 60, 255] : [30, 40, 60, 255],
);
const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/* ---------- 共用的操作 ---------- */

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  /* 網址的圖：本機送出（example.test 不連外） */
  await page.route(/https:\/\/img\.example\.test\//, (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: KEY }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '劇本文字產生器' })).toBeVisible();
  return errors;
}

const tab = (page: Page, name: RegExp | string) => page.getByRole('tab', { name });
const script = (page: Page) => page.getByTestId('script');
const entries = (page: Page) => page.getByTestId('entry');
const titles = (page: Page) => entries(page).locator('[data-role="title"]');
const texts = (page: Page) => entries(page).locator('[data-role="text"]');
const status = (page: Page, area: string) => page.getByTestId(`status-${area}`);
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });

async function pick(page: Page, combo: string, option: string) {
  await page.getByRole('combobox', { name: combo, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function addImages(page: Page, files: ReturnType<typeof file>[]) {
  await tab(page, /^圖片庫/).click();
  await page.locator('input[type="file"]').first().setInputFiles(files);
}

async function setScript(page: Page, text: string) {
  await tab(page, '文字').click();
  await script(page).fill(text);
}

async function download(page: Page, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  return { name: dl.suggestedFilename(), bytes };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/* ---------- 測試 ---------- */

test('開頁：沒有錯誤、預設狀態、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  await expect(tab(page, '說話者（2）')).toBeVisible();
  await expect(tab(page, '圖片庫（0）')).toBeVisible();
  await expect(page.getByTestId('empty-list')).toHaveText(
    '在文字欄貼上文字，這裡會一則一則列出來。',
  );
  await expect(page.getByTestId('preview-hint')).toBeVisible();
  await expect(page.getByTestId('export-summary')).toHaveText('還沒有可以匯出的劇本文字。');
  await expect(btn(page, '匯出房間 ZIP')).toBeDisabled();
  await expect(btn(page, '確定，換下一段文字')).toBeDisabled();
  const footer = page.locator('footer');
  await expect(footer).toHaveText('靈感來源：shiki365/scenario-text-maker');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/shiki365/scenario-text-maker',
  );
  await tab(page, /^說話者/).click();
  await expect(page.getByRole('textbox', { name: '第 1 位說話者的名稱' })).toHaveValue('艾莉絲');
  await expect(page.getByRole('textbox', { name: '第 2 位說話者的名稱' })).toHaveValue('鮑伯');
  expect(errors).toEqual([]);
});

test('台本：範例、未登錄的說話者與差分、讀取方式', async ({ page }) => {
  const errors = await open(page);
  await btn(page, '填入範例').click();
  await expect(titles(page)).toHaveText([
    '艾莉絲',
    '鮑伯',
    '（聊天欄的名稱）旁白',
    /^艾莉絲差分 不安沒有這個差分/,
    '鮑伯',
  ]);
  await expect(page.getByTestId('list-title')).toHaveText('劇本文字（5 則）');
  await expect(page.getByTestId('list-summary')).toHaveText('有圖 0 則・沒有圖 5 則');
  await expect(entries(page).first().locator('[data-role="line"]')).toHaveText('1');
  /* 未登錄的差分 → 加為差分 */
  await btn(page, '把「艾莉絲（不安）」加為差分').click();
  await expect(page.getByTestId('unknown-faces')).toHaveCount(0);
  await expect(titles(page).nth(3)).toHaveText('艾莉絲差分 不安');
  /* 未登錄的說話者 → 加為說話者 */
  await script(page).fill('路人「你好」\n路人：嗯\n時間：晚上九點');
  await expect(titles(page)).toHaveText([
    '路人未登錄',
    '（聊天欄的名稱）旁白',
    '（聊天欄的名稱）旁白',
  ]);
  await btn(page, '把「路人」加為說話者').click();
  await expect(tab(page, '說話者（3）')).toBeVisible();
  await expect(titles(page)).toHaveText(['路人', '路人', '（聊天欄的名稱）旁白']);
  /* 讀取方式 */
  await script(page).fill('艾莉絲「一\n二」\n\n艾莉絲：「冒號」\n時間：九點');
  await expect(texts(page)).toHaveText(['「一\n二」', '「冒號」', '時間：九點']);
  await page.getByRole('switch', { name: '保留台詞的引號' }).click();
  await expect(texts(page)).toHaveText(['一\n二', '冒號', '時間：九點']);
  await pick(page, '說話者的寫法', '只認 名：台詞');
  await expect(titles(page)).toHaveText(['（聊天欄的名稱）旁白', '艾莉絲', '時間未登錄']);
  await pick(page, '說話者的寫法', '自動（名「台詞」／登錄的名：台詞）');
  await pick(page, '一則的分法', '空行分隔的一段一則');
  await expect(entries(page)).toHaveCount(2);
  await page.getByRole('radio', { name: '不放（只有台詞）' }).click();
  await expect(page.getByRole('textbox', { name: '旁白的名稱' })).toHaveCount(0);
  await expect(titles(page)).toHaveText(['艾莉絲', '艾莉絲']);
  await page.getByRole('radio', { name: '放進劇本文字' }).click();
  await page.getByRole('textbox', { name: '旁白的名稱' }).fill('鮑伯');
  await pick(page, '一則的分法', '一行一則（引號還沒關上時接著讀下一行）');
  await expect(titles(page).nth(2)).toHaveText('鮑伯旁白');
  expect(errors).toEqual([]);
});

test('依小標分段：範例（取代前確認）、小標之前、標籤', async ({ page }) => {
  const errors = await open(page);
  await script(page).fill('舊的文字');
  await page.getByRole('radio', { name: '依小標分段' }).click();
  await expect(page.locator('#scenario-text-title')).toHaveText('本文（依小標分段）');
  await expect(page.getByRole('combobox', { name: '一則的分法' })).toHaveCount(0);
  await expect(page.getByText('小標之前的文字的名稱')).toBeVisible();
  await btn(page, '填入範例').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '取代' }).click();
  await expect(titles(page)).toHaveText(['圖書館', '書房', '艾莉絲']);
  await script(page).fill('前言\n■鑰匙\n\n■地下室\n樓梯很暗。');
  await page.getByRole('textbox', { name: '小標之前的文字的名稱' }).fill('GM');
  await expect(titles(page)).toHaveText(['GM小標之前', '鑰匙', '地下室']);
  await expect(texts(page)).toHaveText(['前言', '鑰匙', '樓梯很暗。']);
  expect(errors).toEqual([]);
});

test('圖片庫：加入、同內容、格式不符、自動對應、網址、刪除、每張圖做一則', async ({ page }) => {
  const errors = await open(page);
  await addImages(page, [
    file('艾莉絲.png', ALICE),
    file('鑰匙.png', KEY),
    file('說明.txt', Buffer.from('x'), 'text/plain'),
  ]);
  await expect(status(page, 'shelf')).toHaveText(
    '已把 2 張圖片放進圖片庫。1 個檔案的格式不能用（可以用 PNG、JPEG、GIF、WebP）。',
  );
  await expect(tab(page, '圖片庫（2）')).toBeVisible();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([file('另一個名字.png', KEY)]);
  await expect(status(page, 'shelf')).toHaveText('1 張和圖片庫裡的圖片相同，沿用原本那張。');
  await expect(page.getByTestId('shelf-image')).toHaveCount(2);
  await expect(page.getByTestId('image-info').first()).toHaveText('1 KB');
  /* 名稱與小標同名 → 自動用上 */
  await setScript(page, '■鑰匙\n舊鑰匙\n■地圖\n地圖');
  await page.getByRole('radio', { name: '依小標分段' }).click();
  await expect(page.getByTestId('list-summary')).toHaveText('有圖 1 則・沒有圖 1 則');
  /* 網址 */
  await tab(page, /^圖片庫/).click();
  await btn(page, '用網址加入…').click();
  const dialog = page.getByRole('dialog', { name: '用網址加入圖片' });
  await dialog.getByRole('textbox').fill('http://img.example.test/a.png');
  await dialog.getByRole('button', { name: '加入' }).click();
  await expect(dialog.getByText('網址請用 https:// 開頭（不能有空白）。')).toBeVisible();
  await dialog.getByRole('textbox').fill('https://img.example.test/%E5%9C%B0%E5%9C%96.png');
  await dialog.getByRole('button', { name: '加入' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page, 'shelf')).toHaveText('已把網址的圖片放進圖片庫。');
  await expect(page.getByRole('textbox', { name: '圖片「地圖」的名稱' })).toHaveValue('地圖');
  await expect(page.getByTestId('image-info').nth(2)).toHaveText('網址');
  await expect(page.getByTestId('list-summary')).toHaveText('有圖 2 則・沒有圖 0 則');
  /* 出處 */
  await page.getByRole('textbox', { name: '圖片「鑰匙」的出處／作者' }).fill('自己畫的');
  /* 刪除：用到的地方（立繪） */
  await tab(page, /^說話者/).click();
  await pick(page, '艾莉絲的立繪', '艾莉絲');
  await tab(page, /^圖片庫/).click();
  await btn(page, '刪除圖片「艾莉絲」').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('「艾莉絲」有地方用到，確定刪除？');
  await expect(confirm).toContainText('說話者、差分：艾莉絲');
  await confirm.getByRole('button', { name: '刪除' }).click();
  await expect(status(page, 'shelf')).toHaveText('已刪除；用到的地方變成「沒有圖」。');
  await expect(page.getByTestId('shelf-image')).toHaveCount(2);
  /* 每張圖做一則：清單已經用到的略過 */
  await btn(page, '每張圖做一則').click();
  await expect(status(page, 'shelf')).toHaveText('圖片庫的圖片都已經用在清單裡了。');
  await setScript(page, '■別的\n文字');
  await tab(page, /^圖片庫/).click();
  await btn(page, '每張圖做一則').click();
  await expect(status(page, 'shelf')).toHaveText(
    '已依圖片加了 2 則劇本文字。本文是空的，請一則一則填。',
  );
  await expect(titles(page)).toHaveText(['別的', '鑰匙個別的圖', '地圖個別的圖']);
  await expect(page.getByTestId('edited-note')).toBeVisible();
  await expect(entries(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  expect(errors).toEqual([]);
});

test('說話者：從圖片庫建立差分、效果差分、新增與刪除', async ({ page }) => {
  const errors = await open(page);
  await addImages(page, [
    file('艾莉絲.png', ALICE),
    file('艾莉絲_笑臉.png', ALICE_SMILE),
    file('鑰匙.png', KEY),
  ]);
  await tab(page, /^說話者/).click();
  await btn(page, '從圖片庫建立差分').first().click();
  await expect(status(page, 'speakers')).toHaveText('已建立 1 個差分：笑臉。也設定了立繪。');
  await expect(page.getByRole('textbox', { name: '艾莉絲的差分名稱' })).toHaveValue('笑臉');
  await expect(page.getByRole('combobox', { name: '艾莉絲的立繪' })).toHaveText('艾莉絲');
  await btn(page, '從圖片庫建立差分').first().click();
  await expect(status(page, 'speakers')).toHaveText('沒有可以新建的差分（都已經建好了）。');
  /* 鮑伯沒有立繪：效果差分停用 */
  await expect(btn(page, '從鮑伯的立繪做「剪影」差分')).toBeDisabled();
  /* 剪影 */
  await btn(page, '從艾莉絲的立繪做「剪影」差分').click();
  await expect(status(page, 'speakers')).toHaveText(
    '已做出「剪影」差分（圖片放進了圖片庫）。台本寫「艾莉絲（剪影）「…」」就會用上。',
  );
  await expect(tab(page, '圖片庫（4）')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '差分「剪影」的圖' })).toHaveText(
    '艾莉絲（剪影）',
  );
  await btn(page, '從艾莉絲的立繪做「剪影」差分').click();
  await expect(status(page, 'speakers')).toHaveText('已經有「剪影」差分了。');
  /* 背景不透明的立繪做剪影 → 錯誤 */
  await pick(page, '鮑伯的立繪', '鑰匙');
  await btn(page, '從鮑伯的立繪做「剪影」差分').click();
  await expect(status(page, 'speakers')).toHaveText(
    '這張圖的背景不是透明的，剪影會變成黑色方塊。請用背景透明的 PNG 立繪。',
  );
  /* 模糊：四周加 8 px 的邊（短邊 50 ÷ 20 → 至少 8） */
  await btn(page, '從鮑伯的立繪做「模糊」差分').click();
  await expect(status(page, 'speakers')).toContainText('已做出「模糊」差分');
  /* 新增：游標移到名稱；刪除有立繪的說話者要確認 */
  await btn(page, '新增說話者').click();
  await expect(page.getByRole('textbox', { name: '第 3 位說話者的名稱' })).toBeFocused();
  await btn(page, '新增差分').first().click();
  await expect(page.getByRole('textbox', { name: '艾莉絲的差分名稱' }).nth(2)).toBeFocused();
  await btn(page, '刪除第 2 位說話者').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(tab(page, '說話者（2）')).toBeVisible();
  await btn(page, '刪除第 2 位說話者').click();
  await expect(tab(page, '說話者（1）')).toBeVisible();
  /* 模糊的輸出尺寸：打包後看 PNG 的寬高 */
  await setScript(page, '鮑伯「x」');
  await page.getByRole('checkbox', { name: '放入圖片庫的所有圖片' }).click();
  const zip = await download(page, () => btn(page, '把用到的圖片打包成 ZIP').click());
  const files = unzipSync(zip.bytes);
  const blurred = files['images/鑰匙（模糊）.png'];
  const dv = new DataView(blurred.buffer, blurred.byteOffset);
  expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([116, 66]);
  expect(errors).toEqual([]);
});

test('預覽：訊息框的原尺寸、視窗寬度、資訊文字、聊天欄、差分名稱加進標題', async ({ page }) => {
  const errors = await open(page);
  await addImages(page, [
    file('艾莉絲.png', ALICE),
    file('艾莉絲_笑臉.png', ALICE_SMILE),
    file('鑰匙.png', KEY),
  ]);
  await tab(page, /^說話者/).click();
  await btn(page, '從圖片庫建立差分').first().click();
  await setScript(page, '艾莉絲「你好」\n艾莉絲@笑臉「哈哈」\n■鑰匙\n旁白');
  await entries(page).first().click();
  const native = page.getByTestId('preview-native');
  await expect(page.getByTestId('mbox-name')).toHaveText('艾莉絲');
  await expect(page.getByTestId('mbox-text')).toHaveText('「你好」');
  await expect(page.getByTestId('preview-info')).toHaveText(
    '立繪會以寬 240px × 高 480px 顯示（原圖 60×120）。',
  );
  await expect(native).toHaveAttribute('data-width', '768');
  await expect(native).toHaveAttribute('data-height', '672');
  await expect(page.getByTestId('mbox')).toHaveAttribute('data-box', '720');
  expect(
    await page.getByTestId('mbox-portrait').evaluate((el) => (el as HTMLImageElement).style.width),
  ).toBe('240px');
  await expect(page.getByTestId('log-icon')).toBeVisible();
  await expect(page.getByTestId('log-name')).toHaveText('艾莉絲');
  await pick(page, 'CCFOLIA 的視窗寬度', '手機・寬度未滿 600px（120px）');
  await expect(page.getByTestId('preview-info')).toHaveText(
    '立繪會以寬 120px × 高 240px 顯示（原圖 60×120）。',
  );
  await expect(native).toHaveAttribute('data-width', '319');
  await expect(native).toHaveAttribute('data-height', '432');
  await pick(page, 'CCFOLIA 的視窗寬度', '小畫面・寬度未滿 900px（180px）');
  await expect(page.getByTestId('mbox')).toHaveAttribute('data-box', '696');
  /* 差分：標題不變、立繪換；開了差分名稱加進標題後是「名（差分）」 */
  await entries(page).nth(1).click();
  await expect(page.getByTestId('mbox-name')).toHaveText('艾莉絲');
  await tab(page, /^說話者/).click();
  await page.getByRole('switch', { name: /差分名稱加進標題/ }).click();
  await expect(page.getByTestId('mbox-name')).toHaveText('艾莉絲（笑臉）');
  /* 橫長的圖、沒有圖 */
  await entries(page).nth(2).click();
  await expect(page.getByTestId('mbox-name')).toHaveText('（送出時聊天欄的名稱）');
  await expect(page.getByTestId('preview-info')).toHaveText('這則沒有圖。');
  await tab(page, '文字').click();
  await page.getByRole('radio', { name: '依小標分段' }).click();
  await entries(page).nth(1).click();
  await expect(page.getByTestId('preview-info')).toHaveText(
    '立繪會以寬 180px × 高 90px 顯示（原圖 100×50）。橫長的圖寬度固定，所以會顯示得比較小。',
  );
  /* 設定記在瀏覽器（重新整理後還是小畫面） */
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'CCFOLIA 的視窗寬度' })).toHaveText(
    '小畫面・寬度未滿 900px（180px）',
  );
  expect(errors).toEqual([]);
});

test('修改：標題、說話者、差分、圖片、本文、移動、加一則、刪除、從文字重建、鍵盤', async ({
  page,
}) => {
  const errors = await open(page);
  await addImages(page, [file('鑰匙.png', KEY)]);
  await setScript(page, '艾莉絲「一」\n鮑伯「二」\n艾莉絲「三」');
  await entries(page).first().click();
  const editor = page.getByTestId('editor');
  await editor.getByRole('textbox', { name: '標題（名稱）' }).fill('神秘人');
  await expect(page.getByTestId('edited-note')).toBeVisible();
  await expect(titles(page).first()).toHaveText('神秘人');
  await btn(page, '回到說話者的名稱').click();
  await expect(titles(page).first()).toHaveText('艾莉絲');
  /* 改文字不再重建清單 */
  await script(page).fill('全新的文字');
  await expect(entries(page)).toHaveCount(3);
  /* 說話者、差分、圖片、本文 */
  await pick(page, '說話者', '鮑伯');
  await expect(titles(page).first()).toHaveText('鮑伯');
  await expect(page.getByRole('combobox', { name: '差分', exact: true })).toHaveText('基本');
  await pick(page, '圖片（只有這一則）', '鑰匙');
  await expect(titles(page).first()).toHaveText('鮑伯個別的圖');
  await pick(page, '圖片（只有這一則）', '沒有圖');
  await expect(titles(page).first()).toHaveText('鮑伯沒有圖');
  await editor.getByRole('textbox', { name: '本文' }).fill('改過的本文');
  await expect(texts(page).first()).toHaveText('改過的本文');
  /* 移動、加一則、刪除 */
  await btn(page, '下移').click();
  await expect(texts(page)).toHaveText(['「二」', '改過的本文', '「三」']);
  await btn(page, '在下面加一則').click();
  await expect(texts(page)).toHaveText(['「二」', '改過的本文', '（新的劇本文字）', '「三」']);
  await expect(entries(page).nth(2).locator('[data-role="line"]')).toHaveText('＋');
  await btn(page, '刪除這一則').click();
  await expect(entries(page)).toHaveCount(3);
  await expect(btn(page, '下移')).toBeDisabled();
  /* 鍵盤：↑ 選上一則、Home 到第一則 */
  await entries(page).nth(2).focus();
  await page.keyboard.press('ArrowUp');
  await expect(entries(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(entries(page).nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(entries(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  /* 從文字重建 */
  await btn(page, '從文字重建').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重建' }).click();
  await expect(texts(page)).toHaveText(['全新的文字']);
  await expect(status(page, 'list')).toHaveText('已從文字重建清單。');
  await expect(page.getByTestId('editor')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('確定、已確定的清單（展開、上下移、放回、刪除）、匯出的摘要', async ({ page }) => {
  const errors = await open(page);
  await setScript(page, '艾莉絲「第一批」');
  await btn(page, '確定，換下一段文字').click();
  await expect(status(page, 'list')).toHaveText('已確定（1 則），可以輸入下一段文字。');
  await expect(script(page)).toHaveValue('');
  await script(page).fill('鮑伯「第二批之一」\n鮑伯「第二批之二」');
  await btn(page, '確定，換下一段文字').click();
  await expect(page.getByTestId('batches-title')).toHaveText('已確定的劇本文字（3 則）');
  const batches = page.getByTestId('batch');
  await expect(batches.locator('[data-role="label"]')).toHaveText([
    '艾莉絲：「第一批」',
    '鮑伯：「第二批之一」',
  ]);
  await batches.nth(1).getByRole('button', { expanded: false }).click();
  await expect(
    page.getByRole('list', { name: '第 2 批的劇本文字' }).getByRole('listitem'),
  ).toHaveCount(2);
  await btn(page, '第 2 批上移').click();
  await expect(batches.locator('[data-role="label"]').first()).toHaveText('鮑伯：「第二批之一」');
  await script(page).fill('艾莉絲「目前」');
  await expect(page.getByTestId('export-summary')).toHaveText(
    '已確定 3 則＋目前的清單 1 則＝共 4 則，匯出成一個 ZIP。',
  );
  /* 放回：目前的清單先確定到最後 */
  await btn(page, '第 1 批放回修改').click();
  await expect(status(page, 'list')).toHaveText('已放回；原本的文字已經移到已確定的最後。');
  await expect(script(page)).toHaveValue('鮑伯「第二批之一」\n鮑伯「第二批之二」');
  await expect(batches.locator('[data-role="label"]')).toHaveText([
    '艾莉絲：「第一批」',
    '艾莉絲：「目前」',
  ]);
  /* 刪除要確認 */
  await btn(page, '刪除第 2 批').click();
  await expect(page.getByRole('alertdialog')).toContainText('刪除已確定的第 2 批（1 則）？');
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(batches).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('匯出房間 ZIP：只追加的 __data.json、圖片以雜湊命名、本文空白的檢查', async ({ page }) => {
  const errors = await open(page);
  await addImages(page, [file('艾莉絲.png', ALICE), file('鑰匙.png', KEY)]);
  await tab(page, /^說話者/).click();
  await btn(page, '從圖片庫建立差分').first().click();
  await setScript(page, '艾莉絲「你好」\n門開了。');
  await btn(page, '確定，換下一段文字').click();
  await page.getByRole('radio', { name: '依小標分段' }).click();
  await script(page).fill('■鑰匙\n舊鑰匙\n■網址\n地圖');
  /* 本文空白 → 擋下並選取那一則 */
  await entries(page).nth(1).click();
  await page.getByTestId('editor').getByRole('textbox', { name: '本文' }).fill('  ');
  await entries(page).nth(0).click();
  await btn(page, '匯出房間 ZIP').click();
  await expect(status(page, 'export')).toHaveText(
    '有本文空白的劇本文字（目前的清單）。CCFOLIA 會改送聊天欄裡的文字，請填入本文或刪除。',
  );
  await expect(entries(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('editor').getByRole('textbox', { name: '本文' }).fill('地圖');
  const before = Math.floor(Date.now() / 1000);
  const zip = await download(page, () => btn(page, '匯出房間 ZIP').click());
  expect(zip.name).toMatch(/^scenario-text-\d{8}-\d{4}\.zip$/);
  await expect(status(page, 'export')).toHaveText(
    '已匯出（劇本文字 4 則、圖片 2 張）。請在 CCFOLIA 的房間設定讀入。',
  );
  const files = unzipSync(zip.bytes);
  const alice = `${sha(ALICE)}.png`;
  const key = `${sha(KEY)}.png`;
  expect(Object.keys(files).sort()).toEqual(['.token', '__data.json', alice, key].sort());
  const data = JSON.parse(new TextDecoder().decode(files['__data.json']));
  expect(data.meta).toEqual({ version: '1.1.0' });
  expect(data.entities.room).toEqual({});
  for (const k of ['items', 'decks', 'characters', 'effects', 'scenes', 'savedatas', 'snapshots']) {
    expect(data.entities[k]).toEqual({});
  }
  const notes = Object.values(data.entities.notes) as { order: number }[];
  notes.sort((a, b) => a.order - b.order);
  expect(notes[0].order).toBeGreaterThanOrEqual(before);
  expect(notes.map((n, i) => ({ ...n, order: n.order - notes[0].order - i }))).toEqual([
    { name: '艾莉絲', text: '「你好」', iconUrl: alice, order: 0 },
    { name: '', text: '門開了。', iconUrl: '', order: 0 },
    { name: '鑰匙', text: '舊鑰匙', iconUrl: key, order: 0 },
    { name: '網址', text: '地圖', iconUrl: '', order: 0 },
  ]);
  expect(data.resources).toEqual({ [alice]: { type: 'image/png' }, [key]: { type: 'image/png' } });
  expect(Buffer.from(files[alice]).equals(ALICE)).toBe(true);
  expect(new TextDecoder().decode(files['.token'])).toMatch(/^0\.[0-9a-f]{64}$/);
  expect(errors).toEqual([]);
});

test('打包圖片：用到的與全部、清單文字', async ({ page }) => {
  const errors = await open(page);
  await addImages(page, [file('艾莉絲.png', ALICE), file('鑰匙.png', KEY)]);
  await page.getByRole('textbox', { name: '圖片「艾莉絲」的出處／作者' }).fill('畫師 A');
  await btn(page, '用網址加入…').click();
  await page.getByRole('dialog').getByRole('textbox').fill('https://img.example.test/map.png');
  await page.getByRole('dialog').getByRole('button', { name: '加入' }).click();
  await expect(btn(page, '把用到的圖片打包成 ZIP')).toBeDisabled();
  await setScript(page, '艾莉絲「一」\n艾莉絲「二」');
  await tab(page, /^說話者/).click();
  await pick(page, '艾莉絲的立繪', '艾莉絲');
  const used = await download(page, () => btn(page, '把用到的圖片打包成 ZIP').click());
  expect(used.name).toMatch(/^scenario-text-images-\d{8}-\d{4}\.zip$/);
  const f1 = unzipSync(used.bytes);
  expect(Object.keys(f1)).toEqual(['images/艾莉絲.png', '圖片清單.txt']);
  const lines = new TextDecoder().decode(f1['圖片清單.txt']).split('\r\n');
  expect(lines[0]).toBe('劇本文字產生器 圖片清單');
  expect(lines.slice(2)).toEqual([
    '圖片 1 張（劇本文字用到的圖片）',
    '圖片檔在 images 資料夾裡。',
    '「房間 ZIP 裡的檔名」是這張圖片在匯出的房間 ZIP 裡的檔名。',
    '',
    '[1] images/艾莉絲.png',
    '    大小：1 KB（image/png）',
    `    房間 ZIP 裡的檔名：${sha(ALICE)}.png`,
    '    出處／作者：畫師 A',
    '    用在：艾莉絲 ×2',
    '',
  ]);
  await expect(status(page, 'export')).toContainText('已把 1 張圖片打包成 scenario-text-images-');
  await page.getByRole('checkbox', { name: '放入圖片庫的所有圖片' }).click();
  const all = await download(page, () => btn(page, '把用到的圖片打包成 ZIP').click());
  const f2 = unzipSync(all.bytes);
  expect(Object.keys(f2)).toEqual(['images/艾莉絲.png', 'images/鑰匙.png', '圖片清單.txt']);
  const t2 = new TextDecoder().decode(f2['圖片清單.txt']);
  expect(t2).toContain(
    '[3] map（網址的圖片，ZIP 裡沒有內容）\r\n    網址：https://img.example.test/map.png',
  );
  await expect(status(page, 'export')).toContainText('網址的圖片 1 張只在清單寫了網址。');
  expect(errors).toEqual([]);
});

test('專案檔：存、重來、開啟（圖片庫合併、可以復原）、原作的專案檔', async ({ page }) => {
  const errors = await open(page);
  await addImages(page, [file('艾莉絲.png', ALICE)]);
  await tab(page, /^說話者/).click();
  await pick(page, '艾莉絲的立繪', '艾莉絲');
  await setScript(page, '艾莉絲「存檔前」');
  await btn(page, '確定，換下一段文字').click();
  await script(page).fill('鮑伯「目前」');
  await btn(page, '專案').click();
  const saved = await download(page, () =>
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  );
  expect(saved.name).toMatch(/^scenario-text-project-\d{8}-\d{4}\.zip$/);
  const pf = unzipSync(saved.bytes);
  const project = JSON.parse(new TextDecoder().decode(pf['project.json']));
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'scenario-text',
    version: 1,
  });
  expect(project.data.script).toBe('鮑伯「目前」');
  expect(Object.keys(pf).filter((n) => n.startsWith('files/'))).toHaveLength(1);
  /* 重來：圖片庫留著 */
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: '重來…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重來' }).click();
  await expect(script(page)).toHaveValue('');
  await expect(page.getByTestId('batch')).toHaveCount(0);
  await expect(tab(page, '圖片庫（1）')).toBeVisible();
  /* 另外加一張，再開啟專案檔：專案檔的在前、目前多的接在後 */
  await addImages(page, [file('鑰匙.png', KEY)]);
  await btn(page, '專案').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles({
    name: saved.name,
    mimeType: 'application/zip',
    buffer: Buffer.from(saved.bytes),
  });
  await expect(page.getByText(/已開啟專案檔/).first()).toBeVisible();
  await expect(tab(page, '圖片庫（2）')).toBeVisible();
  await tab(page, '文字').click();
  await expect(script(page)).toHaveValue('鮑伯「目前」');
  await expect(page.getByTestId('batch')).toHaveCount(1);
  await tab(page, /^圖片庫/).click();
  await expect(page.getByRole('textbox', { name: '圖片「艾莉絲」的名稱' })).toBeVisible();
  await expect(page.getByTestId('image-info').first()).toHaveText('1 KB');
  /* 原作的專案檔 */
  const legacy = {
    tool: 'scenario-text-maker',
    version: 2,
    state: {
      images: [
        {
          id: 'iold',
          kind: 'file',
          name: '舊立繪',
          type: 'image/png',
          size: ALICE_SMILE.length,
          credit: '原作',
          dataUrl: `data:image/png;base64,${ALICE_SMILE.toString('base64')}`,
        },
      ],
      speakers: [{ id: 's1', name: '甲', aliases: '', imageId: 'iold', faces: [] }],
      script: '甲「原作的台本」',
      opts: {
        mode: 'script',
        unit: 'line',
        style: 'auto',
        keepQuotes: true,
        narration: 'include',
        narratorName: '',
        faceInTitle: false,
      },
      edited: null,
      confirmed: [],
    },
  };
  await btn(page, '專案').click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟原作的專案檔（.json）…' }).click(),
  ]);
  await chooser2.setFiles({
    name: 'scenario-text-20261005-1200.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(
    page
      .getByText(
        '已開啟原作的專案檔「scenario-text-20261005-1200.json」，圖片 1 張放進了圖片庫（可以復原）。',
      )
      .first(),
  ).toBeVisible();
  await expect(tab(page, '圖片庫（3）')).toBeVisible();
  await expect(titles(page)).toHaveText(['甲']);
  await expect(page.getByTestId('list-summary')).toHaveText('有圖 1 則・沒有圖 0 則');
  /* 可以復原（回到開啟前） */
  await btn(page, /^復原/).click();
  await expect(titles(page)).toHaveText(['鮑伯']);
  expect(errors).toEqual([]);
});

test('自動保存（重新整理後還原文字、說話者、圖片）、復原與重做、拖到拖放區以外', async ({
  page,
}) => {
  const errors = await open(page);
  await addImages(page, [file('艾莉絲.png', ALICE)]);
  await tab(page, /^說話者/).click();
  await pick(page, '艾莉絲的立繪', '艾莉絲');
  await page.getByRole('textbox', { name: '第 2 位說話者的名稱' }).fill('鮑伯二號');
  await setScript(page, '艾莉絲「保存」\n鮑伯二號「我也是」');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(script(page)).toHaveValue('艾莉絲「保存」\n鮑伯二號「我也是」');
  await expect(titles(page)).toHaveText(['艾莉絲', '鮑伯二號']);
  await expect(page.getByTestId('list-summary')).toHaveText('有圖 1 則・沒有圖 1 則');
  await entries(page).first().click();
  await expect(page.getByTestId('preview-info')).toHaveText(
    '立繪會以寬 240px × 高 480px 顯示（原圖 60×120）。',
  );
  /* 復原、重做（頁首按鈕與快捷鍵） */
  await page.waitForTimeout(500);
  await btn(page, '確定，換下一段文字').click();
  await expect(script(page)).toHaveValue('');
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('Control+z');
  await expect(script(page)).toHaveValue('艾莉絲「保存」\n鮑伯二號「我也是」');
  await btn(page, /^重做/).click();
  await expect(script(page)).toHaveValue('');
  /* 拖到拖放區以外：提示、不打開檔案 */
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
    const target = document.querySelector('h1') as HTMLElement;
    target.dispatchEvent(
      new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
    target.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByText('圖片請拖到圖片庫，或說話者的圖。').first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${URL}$`));
  expect(errors).toEqual([]);
});

test('拖放：圖片拖到說話者的框設成立繪、拖到修改區設成這一則的圖', async ({ page }) => {
  const errors = await open(page);
  await setScript(page, '艾莉絲「一」\n艾莉絲「二」');
  const drop = async (selector: string, nth: number, name: string, b64: string) => {
    await page.evaluate(
      async ([sel, i, n, data]) => {
        const bytes = Uint8Array.from(atob(data as string), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], n as string, { type: 'image/png' }));
        const el = document.querySelectorAll(sel as string)[i as number] as HTMLElement;
        el.dispatchEvent(
          new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
        el.dispatchEvent(
          new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      },
      [selector, nth, name, b64],
    );
  };
  await tab(page, /^說話者/).click();
  await drop('[data-drop-target]', 0, '艾莉絲.png', ALICE.toString('base64'));
  await expect(page.getByRole('combobox', { name: '艾莉絲的立繪' })).toHaveText('艾莉絲');
  await expect(page.getByTestId('list-summary')).toHaveText('有圖 2 則・沒有圖 0 則');
  await entries(page).nth(1).click();
  await drop('[data-testid="editor"]', 0, '鑰匙.png', KEY.toString('base64'));
  await expect(titles(page).nth(1)).toHaveText('艾莉絲個別的圖');
  await expect(tab(page, '圖片庫（2）')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('視覺回歸', () => {
  async function prepare(page: Page) {
    const errors = await open(page);
    await addImages(page, [
      file('艾莉絲.png', ALICE),
      file('艾莉絲_笑臉.png', ALICE_SMILE),
      file('鑰匙.png', KEY),
    ]);
    await tab(page, /^說話者/).click();
    await btn(page, '從圖片庫建立差分').first().click();
    await tab(page, '文字').click();
    await btn(page, '填入範例').click();
    await script(page).fill(`${await script(page).inputValue()}\n艾莉絲@笑臉「哈哈」`);
    await entries(page).nth(5).click();
    await expect(page.getByTestId('preview-info')).toContainText('立繪會以寬');
    await page.getByRole('heading', { level: 1 }).click();
    await page.mouse.move(0, 0);
    /* 頁首是黏在上方的：捲回最上面再拍整頁 */
    await page.evaluate(() => window.scrollTo(0, 0));
    return errors;
  }

  test('1280 寬', async ({ page }) => {
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('scenario-text-1280.png', {
      fullPage: true,
      mask: [page.getByText(/已自動儲存|設定會自動儲存/)],
    });
    expect(errors).toEqual([]);
  });

  test('390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await tab(page, /^說話者/).click();
    await noHorizontalScroll(page);
    await tab(page, /^圖片庫/).click();
    await noHorizontalScroll(page);
    await tab(page, '文字').click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('scenario-text-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
