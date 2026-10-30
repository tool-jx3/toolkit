/**
 * 證件與票券產生器（建置產物 tools/id-ticket/）的端對端測試（規格 docs/refactor/specs/id-ticket.md）：
 * - 開頁沒有錯誤、預設內容（員工證、正面、掛繩）、頁尾只有靈感來源、類別與範本；
 * - 證件：欄位（共用、下拉選單、重新產生、清空／填入範例）、點預覽上的字跳到欄位、點條碼重新產生、換範本回到正面、翻面（按鈕、F）；
 * - 照片：選檔放入、縮放、調整範圍、回到初始、拿掉、各款共用、不是圖片的通知；
 * - 樣式：深色、色票、會員卡的背景漸層、掛繩；
 * - 證件匯出：卡片／印刷 × 目前這一面／正反面各一張／排在一張（尺寸、600 dpi、透明圓角、白底、檔名）、橫式；
 * - 票券：五款的大小、欄位、重新產生、欄位名稱、收據品項與合計、照片格開關、配色、墊紙、匯出 PNG 與 GIF；
 * - 自動儲存與還原（含照片）、復原／重做、專案檔 ZIP；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { code128Widths } from '../../src/tools/id-ticket/code128';
import { gifFrameRgba, parseGif } from '../helpers/gif';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('id-ticket') ?? { id: 'id-ticket', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:id-ticket';
const PREFS_KEY = 'trpg-toolkit:id-ticket:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Photo {
  image: { id: string; name: string; width: number; height: number };
  place: { zoom: number; x: number; y: number; turns: number };
}
interface Stored {
  kind: 'id' | 'ticket';
  idTemplate: string;
  ticketTemplate: string;
  idValues: Record<string, string>;
  idStyles: Record<string, { color: string; dark: boolean; g1: string | null; g2: string | null }>;
  idPhoto: Photo | null;
  ticketValues: Record<string, Record<string, string>>;
  ticketCaptions: Record<string, Record<string, string>>;
  ticketPhotos: Record<string, Photo>;
  receiptItems: { id: string; name: string; qty: number; price: number }[];
  receiptPhoto: boolean;
  theme: { c1: string; c2: string };
}

/* ---------- 共用 ---------- */

/** 四色照片（左上紅、右上藍、左下綠、右下黃） */
async function quadPng(w = 400, h = 300): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c: Rgba =
        x < w / 2
          ? y < h / 2
            ? [200, 40, 40, 255]
            : [40, 160, 60, 255]
          : y < h / 2
            ? [40, 80, 200, 255]
            : [230, 200, 40, 255];
      px.set(c, (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '證件與票券產生器' })).toBeVisible();
  return errors;
}

/** 兩次修改之間至少隔 450 ms（自動儲存、文字欄的復原步驟） */
const settle = (page: Page) => page.waitForTimeout(450);
const radio = (scope: Page | Locator, name: string) =>
  scope.getByRole('radio', { name, exact: true });
const tab = (page: Page, name: '內容' | '樣式') => page.getByRole('tab', { name });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const fieldInput = (page: Page, key: string) => page.locator(`[data-field="${key}"]`);
const region = (page: Page, id: string) => page.locator(`[data-region="${id}"]`).first();
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const photoInput = (page: Page) =>
  page.getByRole('group', { name: '放入照片' }).locator('input[type=file]');
const front = (page: Page) => page.getByTestId('card-front');
const ticketCanvas = (page: Page) => page.getByTestId('ticket-canvas');

async function state(page: Page): Promise<Stored> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
}

async function prefs(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    PREFS_KEY,
  );
}

/** 畫布上一點（畫布像素）的顏色 */
async function pixelAt(target: Locator, x: number, y: number): Promise<Rgba> {
  return target.evaluate(
    (el, [x, y]) => {
      const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as Rgba;
    },
    [x, y],
  );
}

/** 畫布的指紋（比對有沒有重畫） */
async function fingerprint(target: Locator): Promise<string> {
  return target.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d =
      c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? new Uint8ClampedArray();
    let h = 0;
    for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
    return `${c.width}x${c.height}:${h}`;
  });
}

function readPng(bytes: Uint8Array) {
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
  const bpp = ihdr.colorType === 6 ? 4 : 3;
  const phys = chunks.find((c) => c.type === 'pHYs');
  return {
    width: ihdr.width,
    height: ihdr.height,
    types: chunks.map((c) => c.type),
    ppm: phys
      ? new DataView(phys.data.buffer, phys.data.byteOffset, phys.data.byteLength).getUint32(0)
      : null,
    at: (x: number, y: number): Rgba => {
      const k = (y * ihdr.width + x) * bpp;
      return [px[k], px[k + 1], px[k + 2], bpp === 4 ? px[k + 3] : 255];
    },
  };
}

async function download(page: Page, link: Locator) {
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

/** 匯出並下載（單一檔案） */
async function exportOne(page: Page, format: 'PNG' | 'GIF') {
  const panel = exportPanel(page);
  await radio(panel, format).click();
  await panel.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  return download(page, result.getByRole('link', { name: '下載' }));
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function putPhoto(page: Page, name = 'quad.png') {
  await photoInput(page).setInputFiles(file(name, await quadPng()));
  await expect(toast(page, `已放入照片「${name}」`)).toBeVisible();
}

/* ---------- 開頁、類別與範本 ---------- */

test('開頁：員工證正面、掛繩、範本 7 款；類別切到票券有 5 款；頁尾只有靈感來源（F01～F03、F27、F63）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(radio(page, '證件')).toHaveAttribute('aria-checked', 'true');
  const list = page.getByTestId('template-list');
  await expect(list.getByRole('radio')).toHaveCount(7);
  await expect(radio(list, '員工證')).toHaveAttribute('aria-checked', 'true');
  await expect(front(page)).toHaveAttribute('data-template', 'employee');
  /* 預覽 3 倍解析度：297 × 473 → 891 × 1419 */
  await expect
    .poll(() =>
      front(page).evaluate((c) => [
        (c as HTMLCanvasElement).width,
        (c as HTMLCanvasElement).height,
      ]),
    )
    .toEqual([891, 1419]);
  await expect(page.getByTestId('flip')).toHaveAttribute('data-side', 'front');
  /* 圓角外透明、卡片中央不透明 */
  expect((await pixelAt(front(page), 2, 2))[3]).toBe(0);
  expect((await pixelAt(front(page), 445, 1300))[3]).toBe(255);
  await expect(page.locator('footer')).toContainText('靈感來源');
  await expect(page.locator('footer').getByRole('link')).toHaveAttribute(
    'href',
    'https://dearmysn1p3r.github.io/DearMySn1p3r_20/',
  );
  await radio(page, '票券').click();
  await expect(list.getByRole('radio')).toHaveCount(5);
  await expect(ticketCanvas(page)).toHaveAttribute('data-template', 'movie');
  /* 墊紙＋電影票 438 × 832，預覽 2 倍 */
  await expect
    .poll(() =>
      ticketCanvas(page).evaluate((c) => [
        (c as HTMLCanvasElement).width,
        (c as HTMLCanvasElement).height,
      ]),
    )
    .toEqual([876, 1664]);
  await settle(page);
  expect((await state(page)).kind).toBe('ticket');
  expect(errors).toEqual([]);
});

/* ---------- 證件：欄位 ---------- */

test('證件欄位：打字更新預覽、姓名在各款共用；下拉選單；重新產生；清空與填入範例（F06、F14～F17）', async ({
  page,
}) => {
  const errors = await open(page);
  const before = await fingerprint(front(page));
  await fieldInput(page, 'name').fill('陳以安');
  await fieldInput(page, 'name').blur();
  await expect.poll(() => fingerprint(front(page))).not.toBe(before);
  await settle(page);
  expect((await state(page)).idValues.name).toBe('陳以安');
  /* 換到記者證：姓名一樣 */
  await radio(page, '記者證').click();
  await expect(fieldInput(page, 'name')).toHaveValue('陳以安');
  await expect(fieldInput(page, 'emp_dept')).toHaveCount(0);
  await expect(fieldInput(page, 'press_beat')).toHaveValue('社會新聞');
  /* 下拉選單 */
  await fieldInput(page, 'press_role').click();
  await page.getByRole('option', { name: '攝影記者' }).click();
  await settle(page);
  expect((await state(page)).idValues.press_role).toBe('攝影記者');
  await fieldInput(page, 'press_role').click();
  await page.getByRole('option', { name: '（不填）' }).click();
  await settle(page);
  expect((await state(page)).idValues.press_role).toBe('');
  /* 重新產生 */
  await page.locator('[data-regen="press_no"]').click();
  await settle(page);
  expect((await state(page)).idValues.press_no).toMatch(/^PR-[1-9]\d-\d{4}$/);
  /* 清空、填入範例 */
  await page.getByRole('button', { name: '清空欄位' }).click();
  await settle(page);
  const cleared = (await state(page)).idValues;
  expect([cleared.name, cleared.press_org, cleared.press_no]).toEqual(['', '', '']);
  /* 共用的姓名也空了；員工證自己的欄位不受影響 */
  expect(cleared.emp_org).toBe('辰星生技股份有限公司');
  await page.getByRole('button', { name: '填入範例' }).click();
  await settle(page);
  const filled = (await state(page)).idValues;
  expect([filled.name, filled.press_org, filled.press_no]).toEqual([
    '林若晴',
    '晨鐘日報',
    'PR-24-0817',
  ]);
  /* 上限：姓名 20 字 */
  await fieldInput(page, 'name').fill('一二三四五六七八九十一二三四五六七八九十多出來的');
  await fieldInput(page, 'name').blur();
  await settle(page);
  expect((await state(page)).idValues.name).toHaveLength(20);
  /* QR code 內容太長（印出來每格不到 0.3 mm）時提醒；網址不提醒 */
  const dense = page.getByTestId('qr-dense');
  await expect(dense).toHaveCount(0);
  await fieldInput(page, 'qr').fill('霧港市碼頭街十三號的燈塔'.repeat(25));
  await expect(dense).toContainText('內容太長');
  await expect(dense).toContainText('mm');
  await expect(fieldInput(page, 'qr')).toHaveAttribute('aria-describedby', /.+/);
  await fieldInput(page, 'qr').fill('https://example.com/clue/03');
  await expect(dense).toHaveCount(0);
  await fieldInput(page, 'qr').blur();
  expect(errors).toEqual([]);
});

test('快速打字：看得到的那一面跟著變；背面、範本縮圖等停下來才重畫（F02）', async ({ page }) => {
  const errors = await open(page);
  await page.waitForTimeout(800);
  /* 正面、背面、第一張縮圖的指紋（一次讀完） */
  const prints = () =>
    page.evaluate(() => {
      const fp = (c: HTMLCanvasElement | null) => {
        if (!c) return '';
        const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data ?? [];
        let h = 0;
        for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
        return `${c.width}x${c.height}:${h}`;
      };
      const q = (sel: string) => document.querySelector<HTMLCanvasElement>(sel);
      return [
        fp(q('[data-testid="card-front"]')),
        fp(q('[data-testid="card-back"]')),
        fp(q('[data-testid="template-list"] canvas')),
      ];
    });
  const before = await prints();
  await fieldInput(page, 'name').click();
  await fieldInput(page, 'name').press('End');
  await page.keyboard.type('陳以安', { delay: 50 });
  /* 剛打完：背面（300 ms）與縮圖（350 ms）還沒重畫 */
  const during = await prints();
  expect(during[1]).toBe(before[1]);
  expect(during[2]).toBe(before[2]);
  await expect.poll(async () => (await prints())[0]).not.toBe(before[0]);
  await expect.poll(async () => (await prints())[1]).not.toBe(before[1]);
  /* 縮圖只畫看得到的：捲回來之後才跟上 */
  await page.getByTestId('template-list').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await prints())[2]).not.toBe(before[2]);
  await expect(fieldInput(page, 'name')).toHaveValue('林若晴陳以安');
  expect(errors).toEqual([]);
});

test('點預覽上的字跳到欄位（聚焦）；點條碼重新產生；點 QR code 跳到 QR 欄；換範本回到正面；翻面（F04、F15、F18、F28）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '樣式').click();
  await region(page, 'field:name').click();
  await expect(tab(page, '內容')).toHaveAttribute('aria-selected', 'true');
  await expect(fieldInput(page, 'name')).toBeFocused();
  /* 下拉類的欄位：聚焦到選單 */
  await region(page, 'field:emp_access').click();
  await expect(fieldInput(page, 'emp_access')).toBeFocused();
  /* 條碼 */
  const old = await fieldInput(page, 'emp_no').inputValue();
  await region(page, 'code:emp_no').click();
  await settle(page);
  const next = (await state(page)).idValues.emp_no;
  expect(next).toMatch(/^AB-[1-9]\d{3}$/);
  expect(next).not.toBe(old);
  /* 背面：QR code */
  await radio(page, '背面').click();
  await expect(page.getByTestId('flip')).toHaveAttribute('data-side', 'back');
  await region(page, 'qr:qr').click();
  await expect(fieldInput(page, 'qr')).toBeFocused();
  /* F 鍵翻面 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('f');
  await expect(page.getByTestId('flip')).toHaveAttribute('data-side', 'front');
  await page.keyboard.press('f');
  await expect(page.getByTestId('flip')).toHaveAttribute('data-side', 'back');
  /* 換範本回到正面 */
  await radio(page, '大學學生證').click();
  await expect(page.getByTestId('flip')).toHaveAttribute('data-side', 'front');
  await expect(front(page)).toHaveAttribute('data-template', 'university');
  await settle(page);
  expect((await prefs(page)).side).toBe('front');
  expect(errors).toEqual([]);
});

/* ---------- 證件：照片 ---------- */

test('照片：放入、縮放、調整範圍、回到初始、拿掉；各款共用；不是圖片的通知（F07～F13）', async ({
  page,
}) => {
  const errors = await open(page);
  const empty = await pixelAt(front(page), 445, 400);
  await putPhoto(page);
  await settle(page);
  const s = await state(page);
  expect(s.idPhoto?.image.name).toBe('quad.png');
  expect(s.idPhoto?.place).toEqual({ zoom: 1, x: 0, y: 0, turns: 0 });
  await expect.poll(() => pixelAt(front(page), 445, 400)).not.toEqual(empty);
  /* 縮放滑桿 */
  const slider = page.getByRole('slider', { name: '縮放' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect((await state(page)).idPhoto?.place.zoom).toBeCloseTo(1.02, 5);
  await page.getByRole('button', { name: '回到初始' }).click();
  await settle(page);
  expect((await state(page)).idPhoto?.place.zoom).toBe(1);
  /* 點預覽上的照片打開調整範圍 */
  await region(page, 'photo:photo').click();
  const dlg = page.getByRole('dialog', { name: '調整照片範圍' });
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('frame-view').focus();
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await dlg.getByRole('button', { name: '套用' }).click();
  await settle(page);
  const placed = (await state(page)).idPhoto?.place;
  expect(placed?.zoom).toBeGreaterThan(1);
  /* 換到高中學生證：同一張照片 */
  await radio(page, '高中學生證').click();
  await expect(page.getByTestId('photo-load')).toHaveAttribute('data-state', 'loaded');
  await expect(page.getByTestId('photo-name')).toContainText('quad.png');
  /* 拿掉 */
  await page.getByRole('button', { name: '拿掉照片' }).click();
  await settle(page);
  expect((await state(page)).idPhoto).toBeNull();
  /* 不是圖片 */
  await photoInput(page).setInputFiles(file('notes.txt', Buffer.from('hello'), 'text/plain'));
  await expect(toast(page, '無法放入照片')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 證件：樣式 ---------- */

test('樣式：深色、色票、自訂色；會員卡的背景漸層；掛繩只在預覽（F05、F24～F27）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '樣式').click();
  await radio(page, '深色').click();
  await settle(page);
  expect((await state(page)).idStyles.employee.dark).toBe(true);
  await page.getByRole('button', { name: '#dc2626', exact: true }).click();
  await settle(page);
  expect((await state(page)).idStyles.employee.color).toBe('#dc2626');
  await expect(page.getByRole('button', { name: '#dc2626', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  /* 色碼欄 */
  const hexInput = page.getByRole('textbox', { name: '主題色' });
  await hexInput.fill('#123456');
  await hexInput.press('Enter');
  await settle(page);
  expect((await state(page)).idStyles.employee.color).toBe('#123456');
  /* 其他款不受影響；換回來還在 */
  await radio(page, '會員卡').click();
  expect((await state(page)).idStyles.member.color).toBe('#be185d');
  await expect(page.getByRole('button', { name: '背景漸層' })).toBeVisible();
  await expect(page.getByRole('button', { name: '自動' })).toBeDisabled();
  await page.getByRole('button', { name: '漸層 3' }).click();
  await settle(page);
  expect((await state(page)).idStyles.member).toMatchObject({ g1: '#c7d7fb', g2: '#f3e8ff' });
  await page.getByRole('button', { name: '自動' }).click();
  await settle(page);
  expect((await state(page)).idStyles.member).toMatchObject({ g1: null, g2: null });
  await radio(page, '員工證').click();
  await expect(page.getByRole('button', { name: '背景漸層' })).toHaveCount(0);
  expect((await state(page)).idStyles.employee).toMatchObject({ color: '#123456', dark: true });
  /* 掛繩（2026-10-30 修訂 F27：開關改成「只在預覽／不要／掛繩孔／掛繩孔＋掛繩」，預設「只在預覽」＝以前的開） */
  await expect(page.getByTestId('strap')).toHaveCount(1);
  await page.getByTestId('lanyard').click();
  await page.getByRole('option', { name: '不要', exact: true }).click();
  await settle(page);
  expect((await prefs(page)).lanyard).toBe('none');
  await expect(page.getByTestId('strap')).toHaveCount(0);
  /* 「只在預覽」的掛繩不會匯出：匯出的卡片上緣（掛繩的位置）是圓角外的透明 */
  await page.getByTestId('lanyard').click();
  await page.getByRole('option', { name: '只在預覽', exact: true }).click();
  await expect(page.getByTestId('strap')).toHaveCount(1);
  const card = readPng((await exportOne(page, 'PNG')).bytes);
  expect(card.at(2, 2)[3]).toBe(0);
  expect([card.width, card.height]).toEqual([1276, 2031]);
  expect(errors).toEqual([]);
});

/* ---------- 證件：匯出 ---------- */

test('證件匯出：卡片 1276 × 2031（600 dpi、圓角外透明）、印刷 1370 × 2126（白底）（F31、F32、F36、F37）', async ({
  page,
}) => {
  const errors = await open(page);
  const panel = exportPanel(page);
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1276 × 2031 px（54 × 86 mm）');
  const card = await exportOne(page, 'PNG');
  expect(card.name).toBe('id-employee-front-card.png');
  const a = readPng(card.bytes);
  expect([a.width, a.height]).toEqual([1276, 2031]);
  expect(a.types.slice(0, 2)).toEqual(['IHDR', 'pHYs']);
  expect(a.ppm).toBe(23622);
  expect(a.at(2, 2)[3]).toBe(0);
  expect(a.at(638, 1015)[3]).toBe(255);
  /* 上方色帶是主題色（#2563eb） */
  const band = a.at(1100, 380);
  expect(Math.abs(band[2] - 0xeb)).toBeLessThan(30);
  await radio(panel, '印刷').click();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1370 × 2126 px（58 × 90 mm）');
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible();
  const print = await download(page, result.getByRole('link', { name: '下載' }));
  expect(print.name).toBe('id-employee-front-print.png');
  const b = readPng(print.bytes);
  expect([b.width, b.height, b.ppm]).toEqual([1370, 2126, 23622]);
  /* 出血也畫滿：左上角是色帶、不透明 */
  expect(b.at(1, 1)[3]).toBe(255);
  expect(Math.abs(b.at(1, 1)[2] - 0xeb)).toBeLessThan(40);
  expect(errors).toEqual([]);
});

test('證件匯出：正反面各一張（兩個檔）、排在一張（中間 6 mm）、背面、橫式（F33～F35）', async ({
  page,
}) => {
  const errors = await open(page);
  const panel = exportPanel(page);
  await panel.getByRole('radio', { name: '正面、背面各一個檔案' }).click();
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  const batch = page.getByTestId('export-batch');
  await expect(batch).toBeVisible();
  const cards = batch.getByTestId('export-result');
  await expect(cards).toHaveCount(2);
  const f = await download(page, cards.nth(0).getByRole('link', { name: '下載' }));
  const b = await download(page, cards.nth(1).getByRole('link', { name: '下載' }));
  expect([f.name, b.name]).toEqual(['id-employee-front-card.png', 'id-employee-back-card.png']);
  expect(readPng(b.bytes).ppm).toBe(23622);
  /* 排在一張 */
  await panel.getByRole('radio', { name: '正面、背面左右排在一張（中間隔 6 mm）' }).click();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 2694 × 2031 px');
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible();
  const sheet = await download(page, result.getByRole('link', { name: '下載' }));
  expect(sheet.name).toBe('id-employee-sheet-card.png');
  const s = readPng(sheet.bytes);
  expect([s.width, s.height, s.ppm]).toEqual([2694, 2031, 23622]);
  expect(s.at(1276 + 71, 1000)[3]).toBe(0);
  expect(s.at(600, 1000)[3]).toBe(255);
  expect(s.at(1276 + 142 + 600, 1000)[3]).toBe(255);
  /* 印刷：排在一張是白底 */
  await radio(panel, '印刷').click();
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  await expect(result).toBeVisible();
  const ps = readPng((await download(page, result.getByRole('link', { name: '下載' }))).bytes);
  expect([ps.width, ps.height]).toEqual([2882, 2126]);
  expect(ps.at(1370 + 71, 1000)).toEqual([255, 255, 255, 255]);
  /* 橫式：刑警證的背面 */
  await radio(panel, '卡片').click();
  await panel.getByRole('radio', { name: '只輸出目前這一面' }).click();
  await radio(page, '刑警證').click();
  await radio(page, '背面').click();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 2031 × 1276 px（86 × 54 mm）');
  const back = await exportOne(page, 'PNG');
  expect(back.name).toBe('id-police-back-card.png');
  const p = readPng(back.bytes);
  expect([p.width, p.height]).toEqual([2031, 1276]);
  expect(errors).toEqual([]);
});

/* ---------- 票券 ---------- */

test('票券：五款的大小；欄位；點條碼與「重新產生所有編號」；票上的欄位名稱（F40、F41、F44、F45、F51）', async ({
  page,
}) => {
  const errors = await open(page);
  await radio(page, '票券').click();
  const size = () =>
    ticketCanvas(page).evaluate((c) => [
      (c as HTMLCanvasElement).width / 2,
      (c as HTMLCanvasElement).height / 2,
    ]);
  const expected: [string, string, number[]][] = [
    ['電影票', 'movie', [438, 832]],
    ['登機證', 'boarding', [892, 462]],
    ['台鐵風格車票', 'rail', [692, 402]],
    ['高鐵風格車票', 'hsr', [692, 392]],
    ['收據', 'receipt', [412, 837]],
  ];
  for (const [name, id, wh] of expected) {
    await radio(page, name).click();
    await expect(ticketCanvas(page)).toHaveAttribute('data-template', id);
    await expect.poll(size).toEqual(wh);
  }
  /* 登機證：欄位、點條碼 */
  await radio(page, '登機證').click();
  await fieldInput(page, 'bp_to').fill('CTS');
  await fieldInput(page, 'bp_to').blur();
  await settle(page);
  expect((await state(page)).ticketValues.boarding.bp_to).toBe('CTS');
  await region(page, 'code:bp_seq').click();
  await settle(page);
  expect((await state(page)).ticketValues.boarding.bp_seq).toMatch(
    /^SEQ [1-9]\d{2} · TKT \d{3} \d{4} \d{4}$/,
  );
  /* 電影票：重新產生所有編號（票號、條碼號碼） */
  await radio(page, '電影票').click();
  const old = (await state(page)).ticketValues.movie;
  await page.getByRole('button', { name: '重新產生所有編號' }).click();
  await settle(page);
  const next = (await state(page)).ticketValues.movie;
  expect(next.mv_no).toMatch(/^NO\. [1-9]\d{3}$/);
  expect(next.mv_code).toMatch(/^[1-9]\d{3} \d{4} \d{4}$/);
  expect([next.mv_no, next.mv_code]).not.toEqual([old.mv_no, old.mv_code]);
  expect(next.mv_title).toBe(old.mv_title);
  /* 票券的欄位各自一份：登機證改的不影響電影票 */
  expect(next.bp_to).toBeUndefined();
  /* 點預覽上的小標：打開欄位名稱並跳過去 */
  await region(page, 'field:caption:mv_date').click();
  const cap = page.locator('[data-caption="mv_date"]');
  await expect(cap).toBeFocused();
  await cap.fill('DATE');
  await cap.blur();
  await settle(page);
  expect((await state(page)).ticketCaptions.movie.mv_date).toBe('DATE');
  await page.getByRole('button', { name: '還原名稱：日期' }).click();
  await settle(page);
  expect((await state(page)).ticketCaptions.movie.mv_date).toBeUndefined();
  /* 點片名跳到欄位 */
  await region(page, 'field:mv_title').click();
  await expect(fieldInput(page, 'mv_title')).toBeFocused();
  expect(errors).toEqual([]);
});

test('收據：品項的新增、修改、刪除與合計；折扣；照片格開關；配色組合（F46～F50）', async ({
  page,
}) => {
  const errors = await open(page);
  await radio(page, '票券').click();
  await radio(page, '收據').click();
  const totals = page.getByTestId('receipt-totals');
  await expect(totals).toHaveText('小計 NT$300 − 折扣 0 ＝ 合計 NT$300');
  await page.getByRole('button', { name: '新增品項' }).click();
  const name3 = page.getByRole('textbox', { name: '品名 3' });
  await expect(name3).toBeFocused();
  await name3.fill('司康');
  await settle(page);
  await page.getByRole('spinbutton', { name: '數量 3' }).fill('3');
  await page.getByRole('spinbutton', { name: '數量 3' }).press('Enter');
  await settle(page);
  await page.getByRole('spinbutton', { name: '單價 3' }).fill('65');
  await page.getByRole('spinbutton', { name: '單價 3' }).press('Enter');
  await settle(page);
  await expect(totals).toHaveText('小計 NT$495 − 折扣 0 ＝ 合計 NT$495');
  await fieldInput(page, 'rc_discount').fill('-95');
  await fieldInput(page, 'rc_discount').blur();
  await settle(page);
  await expect(totals).toHaveText('小計 NT$495 − 折扣 95 ＝ 合計 NT$400');
  const s = await state(page);
  expect(s.receiptItems.map((i) => [i.name, i.qty, i.price])).toEqual([
    ['美式咖啡', 2, 90],
    ['檸檬塔', 1, 120],
    ['司康', 3, 65],
  ]);
  /* 收據變長（多一列 22） */
  await expect
    .poll(() => ticketCanvas(page).evaluate((c) => (c as HTMLCanvasElement).height / 2))
    .toBe(837 + 22);
  /* 點預覽上的品項 */
  await region(page, `field:item:${s.receiptItems[2].id}`).click();
  await expect(name3).toBeFocused();
  await page.getByRole('button', { name: '刪除「檸檬塔」' }).click();
  await settle(page);
  await expect(totals).toHaveText('小計 NT$375 − 折扣 95 ＝ 合計 NT$280');
  /* 單價可以有 2 位小數（第 3 位四捨五入），欄位照樣顯示 */
  const price2 = page.getByRole('spinbutton', { name: '單價 2' });
  await price2.fill('4.5');
  await price2.press('Enter');
  await settle(page);
  await expect(price2).toHaveValue('4.5');
  await expect(totals).toHaveText('小計 NT$193.5 − 折扣 95 ＝ 合計 NT$98.5');
  const price1 = page.getByRole('spinbutton', { name: '單價 1' });
  await price1.fill('112.346');
  await price1.press('Enter');
  await settle(page);
  await expect(price1).toHaveValue('112.35');
  expect((await state(page)).receiptItems.map((i) => i.price)).toEqual([112.35, 4.5]);
  await expect(totals).toHaveText('小計 NT$238.2 − 折扣 95 ＝ 合計 NT$143.2');
  /* 照片格開關 */
  await page.getByRole('switch', { name: '照片格' }).click();
  await settle(page);
  expect((await state(page)).receiptPhoto).toBe(false);
  await expect
    .poll(() => ticketCanvas(page).evaluate((c) => (c as HTMLCanvasElement).height / 2))
    .toBe(Math.ceil(248 + 2 * 22 + 250) + 92);
  await expect(page.getByTestId('photo-load')).toHaveCount(0);
  /* 配色 */
  await tab(page, '樣式').click();
  await page.getByRole('button', { name: '琥珀' }).click();
  await settle(page);
  expect((await state(page)).theme).toEqual({ c1: '#e9b44c', c2: '#fdf0d0' });
  await expect(page.getByRole('button', { name: '琥珀' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('票券的照片：各款各自一張；車票沒有照片格（F42、F43）', async ({ page }) => {
  const errors = await open(page);
  await radio(page, '票券').click();
  const empty = await fingerprint(ticketCanvas(page));
  await putPhoto(page, 'movie.png');
  await expect.poll(() => fingerprint(ticketCanvas(page))).not.toBe(empty);
  await settle(page);
  expect((await state(page)).ticketPhotos.movie?.image.name).toBe('movie.png');
  await radio(page, '登機證').click();
  await expect(page.getByTestId('photo-load')).toHaveAttribute('data-state', 'empty');
  await radio(page, '台鐵風格車票').click();
  await expect(page.getByText('這一款沒有照片格。')).toBeVisible();
  await expect(page.locator('[data-region="photo:photo"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('票券匯出：PNG 2 倍含墊紙、沒有墊紙（四周透明）、3 倍；GIF 48 格 × 70 ms（F52～F54）', async ({
  page,
}) => {
  const errors = await open(page);
  await radio(page, '票券').click();
  const panel = exportPanel(page);
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 876 × 1664 px');
  const png = await exportOne(page, 'PNG');
  expect(png.name).toBe('ticket-movie.png');
  const a = readPng(png.bytes);
  expect([a.width, a.height]).toEqual([876, 1664]);
  expect(a.at(1, 1)[3]).toBe(0);
  expect(a.at(40, 800)[3]).toBe(255);
  /* 墊紙關掉：只有票 */
  await page.getByRole('switch', { name: '墊紙' }).click();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 692 × 1480 px');
  await expect
    .poll(() => ticketCanvas(page).evaluate((c) => (c as HTMLCanvasElement).width / 2))
    .toBe(346);
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible();
  const bare = readPng((await download(page, result.getByRole('link', { name: '下載' }))).bytes);
  expect([bare.width, bare.height]).toEqual([692, 1480]);
  /* 打孔的半圓缺口是透明的（y 662 × 2） */
  expect(bare.at(4, 1324)[3]).toBe(0);
  expect(bare.at(346, 1324 + 40)[3]).toBe(255);
  await radio(panel, '3 倍').click();
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1038 × 2220 px');
  await settle(page);
  expect(await prefs(page)).toMatchObject({ mat: false, pngScale: 3 });
  /* GIF：長邊 700（一律不超過選的長邊） */
  await radio(panel, 'GIF').click();
  await radio(panel, '700 px').click();
  await expect(page.getByTestId('export-dims')).toContainText('輸出 369 × 700 px');
  await panel.getByRole('button', { name: '匯出 GIF' }).click();
  await expect(result).toBeVisible({ timeout: 120_000 });
  const gif = await download(page, result.getByRole('link', { name: '下載' }));
  expect(gif.name).toBe('ticket-movie.gif');
  const info = parseGif(gif.bytes);
  expect([info.width, info.height]).toEqual([369, 700]);
  /* 48 格 × 7／100 秒＝3.36 秒；畫面完全相同的連續兩格合成一格（總長不變） */
  expect(info.frames.reduce((a, f) => a + f.delayCs, 0)).toBe(48 * 7);
  expect(info.frames.length).toBeLessThanOrEqual(48);
  expect(info.frames.length).toBeGreaterThan(24);
  expect(info.frames.every((f) => f.delayCs % 7 === 0)).toBe(true);
  await expect(result).toContainText('48');
  expect(info.loopCount).toBe(0);
  /* 登機證、長邊 1000：墊紙是單色（大片單色不抖色；以前約 10% 是紙色的點） */
  await radio(page, '登機證').click();
  await radio(panel, '1000 px').click();
  await expect(page.getByTestId('export-dims')).toContainText('輸出 1000 × 519 px');
  await panel.getByRole('button', { name: '匯出 GIF' }).click();
  await expect(result).toBeVisible({ timeout: 120_000 });
  const bp = parseGif((await download(page, result.getByRole('link', { name: '下載' }))).bytes);
  expect([bp.width, bp.height]).toEqual([1000, 519]);
  const f0 = gifFrameRgba(bp, bp.frames[0]);
  const matTop = new Set<number>();
  for (let i = 0; i < 1000 * 24; i++)
    matTop.add((f0[i * 4] << 16) | (f0[i * 4 + 1] << 8) | f0[i * 4 + 2]);
  expect(matTop.size).toBe(1);
  expect(errors).toEqual([]);
});

test('票券的條碼：1／3 倍 PNG 的最細的條是整數 px（2、6 px），條寬換回模組＝號碼的 Code 128（F44）', async ({
  page,
}) => {
  const errors = await open(page);
  await radio(page, '票券').click();
  const panel = exportPanel(page);
  /* 沒有墊紙：PNG 的座標＝票的座標 × 倍率 */
  await page.getByRole('switch', { name: '墊紙' }).click();
  const tickets: [string, string, string][] = [
    ['電影票', 'mv_code', 'movie'],
    ['登機證', 'bp_seq', 'boarding'],
    ['台鐵風格車票', 'rl_no', 'rail'],
    ['收據', 'rc_code', 'receipt'],
  ];
  for (const k of [1, 3]) {
    await radio(panel, `${k} 倍`).click();
    for (const [name, key] of tickets) {
      await radio(page, name).click();
      await settle(page);
      const r = await page
        .locator(`[data-region="code:${key}"]`)
        .evaluate((b) =>
          [b.style.left, b.style.top, b.style.width, b.style.height].map(parseFloat),
        );
      const value = await fieldInput(page, key).inputValue();
      const png = readPng((await exportOne(page, 'PNG')).bytes);
      /* 條碼中間那一列：由左到右的黑白段 */
      const y = Math.round((r[1] + r[3] / 2) * k);
      const runs: number[] = [];
      let dark: boolean | null = null;
      for (let x = Math.floor(r[0] * k) - 8; x <= Math.ceil((r[0] + r[2]) * k) + 8; x++) {
        const [R, G, B] = png.at(x, y);
        const d = 0.2126 * R + 0.7152 * G + 0.0722 * B < 128;
        if (d === dark) runs[runs.length - 1]++;
        else if (d || dark !== null) {
          runs.push(1);
          dark = d;
        }
      }
      /* 最後一段是右邊的空白 */
      if (!dark) runs.pop();
      const want = code128Widths(value.replace(/\s+/g, '')) as number[];
      const module = runs[0] / want[0];
      expect(module, `${name} ${k} 倍`).toBe(2 * k);
      expect(
        runs.map((n) => n / module),
        `${name} ${k} 倍`,
      ).toEqual(want);
    }
  }
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含照片）；復原／重做（F56、F58）', async ({ page }) => {
  const errors = await open(page);
  await putPhoto(page);
  await settle(page);
  await fieldInput(page, 'emp_org').fill('霧港造船');
  await fieldInput(page, 'emp_org').blur();
  await settle(page);
  /* 復原：公司名稱（文字欄聚焦到離開算一步）→ 照片 */
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  await page.keyboard.press('Control+z');
  await expect(fieldInput(page, 'emp_org')).toHaveValue('辰星生技股份有限公司');
  await page.keyboard.press('Control+Shift+z');
  await expect(fieldInput(page, 'emp_org')).toHaveValue('霧港造船');
  await page.getByRole('button', { name: /^復原/ }).click();
  await page.getByRole('button', { name: /^復原/ }).click();
  await settle(page);
  expect((await state(page)).idPhoto).toBeNull();
  await page.getByRole('button', { name: /^重做/ }).click();
  await page.getByRole('button', { name: /^重做/ }).click();
  await settle(page);
  expect((await state(page)).idPhoto?.image.name).toBe('quad.png');
  /* 顯示的面不列入復原，但會記住 */
  await radio(page, '背面').click();
  await settle(page);
  await page.reload();
  await expect(fieldInput(page, 'emp_org')).toHaveValue('霧港造船');
  await expect(page.getByTestId('photo-name')).toContainText('quad.png');
  await expect(page.getByTestId('flip')).toHaveAttribute('data-side', 'back');
  /* 照片從 IndexedDB 讀回、畫在背面以外的正面上 */
  await expect(page.getByRole('button', { name: '調整範圍' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（內容＋照片）、重設、開啟還原（F57、F59）', async ({ page }) => {
  const errors = await open(page);
  await putPhoto(page);
  await settle(page);
  await radio(page, '票券').click();
  await fieldInput(page, 'mv_title').fill('深海來信');
  await fieldInput(page, 'mv_title').blur();
  await settle(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  const project = JSON.parse(strFromU8(zip['project.json']));
  expect(project.tool).toBe('id-ticket');
  expect(project.data.ticketValues.movie.mv_title).toBe('深海來信');
  const id = project.data.idPhoto.image.id as string;
  expect(Object.keys(zip).some((n) => n.startsWith(`files/${id}`))).toBe(true);
  /* 重設 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: /重設/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /重設/ }).click();
  await expect(radio(page, '證件')).toHaveAttribute('aria-checked', 'true');
  await settle(page);
  expect((await state(page)).idPhoto).toBeNull();
  /* 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    confirm.getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles({
    name: 'p.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(zip)),
  });
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  await expect(fieldInput(page, 'mv_title')).toHaveValue('深海來信');
  await settle(page);
  expect((await state(page)).idPhoto?.image.id).toBe(id);
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動（證件與票券）；1280 與 390 的視覺基準（F61）', async ({ page }) => {
  const errors = await open(page);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('id-ticket-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('id-ticket-390.png', { fullPage: true });
  await radio(page, '票券').click();
  await radio(page, '登機證').click();
  await noHorizontalScroll(page);
  await tab(page, '樣式').click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
