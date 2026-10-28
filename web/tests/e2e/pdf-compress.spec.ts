/**
 * PDF 壓縮器（建置產物 next/pdf-compress/）的端對端測試：
 * - 開頁（頁首、頁尾的靈感來源、沒有主控台錯誤）、390 寬沒有橫向捲動、1280／390 視覺基準圖；
 * - 每個等級壓縮測試檔 → 下載的檔案 pdf.js 打得開、頁數相同、不是整頁轉圖時文字還在、確實變小；
 * - 批次與 ZIP；壞檔、不是 PDF、加密檔（密碼錯誤、密碼正確、輸出不加密）；沒有變小時保留原檔；前後比對；設定記住。
 * - 沒有內嵌中日韓字型的提示；瀏覽器不支援時一開頁就說明。
 * 測試檔由程式產生：文字、連結、書籤、表單用 pdf-lib；照片的 JPEG 由瀏覽器的 canvas 編碼，Flate 照片在 Node 產生。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { closePdf, configurePdfjs, docSignature, openPdf } from '../../src/core/pdf/pdfjs';
import { INSPECT_ARGS, parseInspectJson } from '../../src/core/pdf/qpdfArgs';
import { getTool, outputDir } from '../../src/registry';
import {
  cjkPdf,
  flateXObject,
  jpegXObject,
  photoRgba,
  placeXObject,
  rgbaToSamples,
  textPdf,
} from '../helpers/pdfFixtures';
import { encryptPdf, nodeModulePath, nodeQpdf } from '../helpers/pdfQpdf';

const URL = `/${outputDir(getTool('pdf-compress') ?? { id: 'pdf-compress', status: 'next' })}/`;

configurePdfjs({
  cMapUrl: nodeModulePath('pdfjs-dist/cmaps/'),
  standardFontDataUrl: nodeModulePath('pdfjs-dist/standard_fonts/'),
  wasmUrl: nodeModulePath('pdfjs-dist/wasm/'),
});

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
  await expect(page.getByRole('heading', { level: 1, name: 'PDF 壓縮器' })).toBeVisible();
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const fileInput = (page: Page) => page.locator('input[type=file]').first();
const pdfFile = (name: string, bytes: Uint8Array) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(bytes),
});
const row = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) });

/** 瀏覽器的 canvas 編出一張像照片的 JPEG（漸層＋雜訊） */
async function browserJpeg(page: Page, w: number, h: number, quality: number): Promise<Uint8Array> {
  const b64 = await page.evaluate(
    async ({ w, h, q }) => {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#c33');
      g.addColorStop(0.5, '#3c6');
      g.addColorStop(1, '#36c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      let s = 1;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const n = (s % 41) - 20;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: q });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000)
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { w, h, q: quality },
  );
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** 2 頁：大張 JPEG（1800 × 1350 畫成 4 英吋）＋文字；Flate 照片（900 × 675） */
async function photoPdf(page: Page): Promise<Uint8Array> {
  const jpeg = await browserJpeg(page, 1800, 1350, 0.95);
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]);
  placeXObject(p1, jpegXObject(doc, jpeg, 1800, 1350), 36, 400, 288, 216);
  p1.drawText('Handout A: the photograph', { x: 36, y: 700, size: 18, font });
  const p2 = doc.addPage([612, 792]);
  const flat = flateXObject(doc, rgbaToSamples(photoRgba(900, 675, 4), 3), 900, 675, 3);
  placeXObject(p2, flat, 36, 300, 288, 216);
  p2.drawText('Handout B: the map', { x: 36, y: 700, size: 18, font });
  return doc.save({ useObjectStreams: false });
}

async function signature(bytes: Uint8Array) {
  const doc = await openPdf(bytes);
  try {
    return await docSignature(doc);
  } finally {
    await closePdf(doc);
  }
}

async function chooseLevel(page: Page, label: string) {
  await page.getByRole('radio', { name: label, exact: true }).click();
  await expect(page.getByRole('radio', { name: label, exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
}

async function compressAll(page: Page) {
  await page.getByTestId('start').click();
  await expect(page.getByRole('button', { name: '取消' })).toHaveCount(0, { timeout: 120_000 });
}

async function download(page: Page, button: ReturnType<Page['getByRole']>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  return { name: dl.suggestedFilename(), bytes };
}

test('開頁：標題、頁尾的靈感來源、等級與說明；390 寬沒有橫向捲動；視覺基準圖', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('contentinfo')).toContainText('靈感來源：mrflamingchad67/qcompress');
  await expect(page.getByRole('radio', { name: '平衡', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByText('檔案只在這個瀏覽器裡處理，不會上傳')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page).toHaveScreenshot('pdf-compress-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await expect(page).toHaveScreenshot('pdf-compress-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});

test('每個等級：下載的檔案打得開、頁數相同、變小；不是整頁轉圖時文字還在', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await open(page);
  const src = await photoPdf(page);
  await fileInput(page).setInputFiles(pdfFile('handout.pdf', src));
  const r = row(page, 'handout.pdf');
  await expect(r.getByText('2 頁')).toBeVisible();
  const before = await signature(src);
  const sizes: Record<string, number> = {};
  for (const level of ['無損', '高畫質', '平衡', '最小', '整頁轉圖']) {
    await chooseLevel(page, level);
    if (level === '整頁轉圖') await expect(page.getByTestId('raster-warning')).toBeVisible();
    await compressAll(page);
    await expect(r.getByTestId('item-result')).toBeVisible();
    const { name, bytes } = await download(page, r.getByTestId('download'));
    expect(name).toBe('handout_壓縮.pdf');
    expect(bytes.length, level).toBeLessThan(src.length);
    sizes[level] = bytes.length;
    const after = await signature(bytes);
    expect(after.pages, level).toBe(2);
    if (level === '整頁轉圖') {
      expect(after.text.join('')).toBe('');
      await expect(r.getByText('文字已經變成圖片')).toBeVisible();
    } else {
      expect(after.text, level).toEqual(before.text);
      await expect(
        r.getByText('已比對：頁數、文字、連結、書籤、表單欄位都和原檔相同。'),
      ).toBeVisible();
    }
  }
  /* 會失真的等級比無損小；最小不比平衡大 */
  expect(sizes.平衡).toBeLessThan(sizes.無損);
  expect(sizes.最小).toBeLessThanOrEqual(sizes.平衡);
  expect(errors).toEqual([]);
});

test('批次與 ZIP：兩個檔案依序壓縮、總計、ZIP 裡的檔名', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  const photo = await photoPdf(page);
  const text = await textPdf();
  await fileInput(page).setInputFiles([pdfFile('a.pdf', photo), pdfFile('劇本.pdf', text)]);
  await expect(page.getByTestId('note')).toContainText('已加入 2 個 PDF');
  await expect(page.getByTestId('start')).toHaveText('開始壓縮（2 個）');
  await compressAll(page);
  await expect(page.getByTestId('totals')).toContainText('2 個檔案');
  await expect(page.getByTestId('start')).toBeDisabled();
  const { name, bytes } = await download(page, page.getByTestId('zip'));
  expect(name).toBe('壓縮後的PDF.zip');
  const files = unzipSync(bytes);
  expect(Object.keys(files).sort()).toEqual(['a_壓縮.pdf', '劇本_壓縮.pdf']);
  expect((await signature(files['劇本_壓縮.pdf'])).outline).toEqual(['Opening', 'Clues', 'Ending']);
  /* 換等級：完成的列標示「設定改過了」，再按開始會重壓 */
  await chooseLevel(page, '無損');
  await expect(row(page, 'a.pdf').getByText('設定改過了')).toBeVisible();
  await expect(page.getByTestId('start')).toHaveText('開始壓縮（2 個）');
  expect(errors).toEqual([]);
});

test('不是 PDF、壞檔、加密檔（密碼錯誤、正確、輸出不加密）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const text = await textPdf();
  await fileInput(page).setInputFiles([
    { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello, not a pdf') },
  ]);
  await expect(page.getByTestId('note')).toContainText('「notes.pdf」：不是 PDF');
  await fileInput(page).setInputFiles(pdfFile('broken.pdf', text.slice(0, 700)));
  await expect(row(page, 'broken.pdf').getByTestId('item-error')).toContainText('這個檔案打不開');
  await expect(row(page, 'broken.pdf').getByRole('button', { name: '複製錯誤資訊' })).toBeVisible();
  const enc = await encryptPdf(text, 'secret');
  await fileInput(page).setInputFiles(pdfFile('locked.pdf', enc));
  const r = row(page, 'locked.pdf');
  const pw = r.getByTestId('password');
  await pw.fill('wrong');
  await r.getByRole('button', { name: '確定' }).click();
  await expect(r.getByText('密碼不對。')).toBeVisible();
  await pw.fill('secret');
  await r.getByRole('button', { name: '確定' }).click();
  await expect(r.getByText(/3 頁 · PDF \d\.\d · 已加密/)).toBeVisible();
  await compressAll(page);
  await expect(r.getByText('輸出的檔案沒有加密')).toBeVisible();
  const { bytes } = await download(page, r.getByTestId('download'));
  const j = await nodeQpdf()(bytes, INSPECT_ARGS);
  expect(parseInspectJson(j.stdout)?.encrypted).toBe(false);
  expect((await signature(bytes)).pages).toBe(3);
  /* 壞檔不會被「開始壓縮」重壓 */
  await expect(page.getByTestId('start')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('沒有變小時保留原檔：下載的是原檔本身（原檔名）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await chooseLevel(page, '無損');
  const text = await textPdf();
  await fileInput(page).setInputFiles(pdfFile('scenario.pdf', text));
  await compressAll(page);
  const first = await download(page, row(page, 'scenario.pdf').getByTestId('download'));
  await fileInput(page).setInputFiles(pdfFile('again.pdf', first.bytes));
  await compressAll(page);
  const r = row(page, 'again.pdf');
  await expect(r.getByText('沒有變小，保留原檔')).toBeVisible();
  /* 名稱旁的狀態標記 */
  await expect(r).toHaveAttribute('data-status', 'done');
  await expect(r.getByText('保留原檔', { exact: true })).toBeVisible();
  const kept = await download(page, r.getByRole('button', { name: '下載原檔' }));
  expect(kept.name).toBe('again.pdf');
  expect(Buffer.from(kept.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  expect(errors).toEqual([]);
});

test('前後比對：兩邊都畫出同一頁、可以換頁；設定記住', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const photo = await photoPdf(page);
  await fileInput(page).setInputFiles(pdfFile('compare.pdf', photo));
  await compressAll(page);
  await row(page, 'compare.pdf').getByRole('button', { name: '前後比對' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByTestId('compare-page')).toHaveText('第 1／2 頁');
  for (const id of ['compare-before', 'compare-after']) {
    const c = dlg.getByTestId(id);
    await expect(c).toBeVisible({ timeout: 30_000 });
    const nonWhite = await c.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d') as CanvasRenderingContext2D;
      const d = ctx.getImageData(0, 0, el.width, el.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i] < 200) n++;
      return n;
    });
    expect(nonWhite, id).toBeGreaterThan(100);
  }
  await dlg.getByRole('button', { name: '下一頁' }).click();
  await expect(dlg.getByTestId('compare-page')).toHaveText('第 2／2 頁');
  await page.keyboard.press('ArrowLeft');
  await expect(dlg.getByTestId('compare-page')).toHaveText('第 1／2 頁');
  /* 放大 2 倍、關掉再開：回到第 1 頁、符合寬度 */
  await dlg.getByRole('radio', { name: '2 倍' }).click();
  await dlg.getByRole('button', { name: '下一頁' }).click();
  await dlg.getByRole('button', { name: '關閉' }).first().click();
  await row(page, 'compare.pdf').getByRole('button', { name: '前後比對' }).click();
  await expect(dlg.getByRole('radio', { name: '符合寬度' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(dlg.getByTestId('compare-page')).toHaveText('第 1／2 頁');
  await dlg.getByRole('button', { name: '關閉' }).first().click();
  /* 設定記住（等級） */
  await chooseLevel(page, '最小');
  await page.reload();
  await expect(page.getByRole('radio', { name: '最小', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(errors).toEqual([]);
});

test('取消：處理中的回到等待；進階設定（關掉 PNG 轉 JPEG、回到預設）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const photo = await photoPdf(page);
  await fileInput(page).setInputFiles(pdfFile('slow.pdf', photo));
  const r = row(page, 'slow.pdf');
  await expect(r.getByText('等待壓縮')).toBeVisible();
  await page.getByTestId('start').click();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('note')).toHaveText('已取消，還沒壓完的檔案回到等待。');
  await expect(r.getByText('等待壓縮')).toBeVisible();
  /* 進階設定：關掉 PNG 轉 JPEG → Flate 的照片不動 */
  await page.getByRole('button', { name: '進階設定' }).click();
  const toggle = page.getByRole('switch', { name: '照片類的 PNG、未壓縮影像也轉成 JPEG' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await compressAll(page);
  await expect(r.getByTestId('item-result')).toContainText('不是 JPEG（進階設定沒有開啟轉換） 1');
  await page.getByRole('button', { name: '進階設定回到預設' }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(r.getByText('設定改過了')).toBeVisible();
  expect(errors).toEqual([]);
});

test('沒有內嵌的中日韓字型：清單與前後比對提示預覽會缺字', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await chooseLevel(page, '無損');
  await fileInput(page).setInputFiles(pdfFile('mincho.pdf', await cjkPdf(false)));
  const r = row(page, 'mincho.pdf');
  await expect(r.getByTestId('fonts-hint')).toHaveText(
    '這個 PDF 有沒有內嵌的中日韓字型：預覽（縮圖、前後比對）會缺字，壓縮後的檔案在電腦上開啟不受影響。',
  );
  await compressAll(page);
  await expect(r.getByTestId('item-result')).toBeVisible();
  await expect(r.getByTestId('fonts-hint')).toBeVisible();
  const compare = r.getByRole('button', { name: '前後比對' });
  if (await compare.count()) {
    await compare.click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByTestId('compare-fonts-hint')).toBeVisible();
    await dlg.getByRole('button', { name: '關閉' }).first().click();
    await expect(dlg).toHaveCount(0);
  }
  /* 內嵌的不提示 */
  await fileInput(page).setInputFiles(pdfFile('embedded.pdf', await cjkPdf(true)));
  await expect(row(page, 'embedded.pdf').getByText('等待壓縮')).toBeVisible();
  await expect(row(page, 'embedded.pdf').getByTestId('fonts-hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('瀏覽器不支援（沒有 OffscreenCanvas）：一開頁就說明，不能加入檔案', async ({ page }) => {
  await page.addInitScript(() => {
    // biome-ignore lint/suspicious/noExplicitAny: 測試：拿掉瀏覽器的功能
    delete (globalThis as any).OffscreenCanvas;
  });
  const errors = await open(page);
  await expect(page.getByTestId('unsupported')).toHaveText(
    '這個瀏覽器不能用 PDF 壓縮器（缺少 OffscreenCanvas）。請改用最新版的 Chrome、Edge、Firefox 或 Safari。',
  );
  await expect(fileInput(page)).toBeDisabled();
  expect(errors).toEqual([]);
});
