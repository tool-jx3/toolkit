/**
 * 立繪尺寸統一器（建置產物 next/portrait-size/）的端對端測試：
 * - 開頁沒有 pageerror／console error；按鈕啟用規則；
 * - 選檔與拖放載入、類型過濾（依檔頭）、累加、移除、清除；
 * - 處理進度、處理後的縮圖與尺寸、改選項的提示；
 * - 逐張下載：檔名、順序、間隔約 0.5 秒、輸出格式與像素；
 * - 讀檔失敗的訊息指出檔名；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';

const URL = '/next/portrait-size/';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 透明畫布上畫一塊不透明的內容（左右兩半不同顏色，方便確認位置） */
async function png(w: number, h: number, c: Box): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = c.y; y < c.y + c.height; y++) {
    for (let x = c.x; x < c.x + c.width; x++) {
      const k = (y * w + x) * 4;
      const left = x < c.x + c.width / 2;
      px[k] = left ? 220 : 30;
      px[k + 1] = 40;
      px[k + 2] = left ? 30 : 200;
      px[k + 3] = 255;
    }
  }
  return Buffer.from(await encodePng(px, w, h));
}

/* 規格 3.2 的 A、B、C */
const A = () => png(200, 300, { x: 30, y: 20, width: 130, height: 240 });
const B = () => png(400, 250, { x: 50, y: 10, width: 300, height: 230 });
const C = () => png(120, 120, { x: 20, y: 25, width: 60, height: 70 });

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
  /* 記錄每次下載的檔名與時間（<a download> 被點的那一刻） */
  await page.addInitScript(() => {
    const log: { name: string; t: number }[] = [];
    (window as unknown as { __downloads: typeof log }).__downloads = log;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download) log.push({ name: this.download, t: performance.now() });
      return click.call(this);
    };
  });
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '立繪尺寸統一器' })).toBeVisible();
  return errors;
}

const dropZone = (page: Page) => page.getByRole('group', { name: '把 PNG／WebP 立繪拖到這裡' });
const input = (page: Page) => dropZone(page).locator('input[type=file]');
const list = (page: Page) => page.getByRole('list', { name: '已載入的立繪' });
const items = (page: Page) => list(page).getByRole('listitem');
const status = (page: Page) => page.getByTestId('status-text');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 在頁面裡用瀏覽器編碼一張 WebP（無損） */
async function webp(page: Page, w: number, h: number, c: Box): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ w, h, c }) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#28c850';
      ctx.fillRect(c.x, c.y, c.width, c.height);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/webp', 1));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    },
    { w, h, c },
  );
  return Buffer.from(b64, 'base64');
}

/** 在頁面裡解碼圖片，回傳尺寸與指定位置的像素 */
async function decode(page: Page, bytes: Buffer, points: [number, number][]) {
  return page.evaluate(
    async ({ b64, points }) => {
      const data = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([data]));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      return {
        width: bmp.width,
        height: bmp.height,
        px: points.map(([x, y]) =>
          Array.from(img.data.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4)),
        ),
      };
    },
    { b64: bytes.toString('base64'), points },
  );
}

const fourcc = (bytes: Buffer, tag: string) => bytes.includes(Buffer.from(tag, 'latin1'));
const isPng = (bytes: Buffer) => bytes.subarray(1, 4).toString('latin1') === 'PNG';
const isWebp = (bytes: Buffer) =>
  bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
  bytes.subarray(8, 12).toString('latin1') === 'WEBP';

async function expectButtons(page: Page, process: boolean, download: boolean, clear: boolean) {
  const state = (b: Locator, on: boolean) =>
    on ? expect(b).toBeEnabled() : expect(b).toBeDisabled();
  await state(btn(page, '處理'), process);
  await state(btn(page, '全部下載'), download);
  await state(btn(page, '清除'), clear);
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('開頁沒有錯誤；初始三個按鈕都停用；只放靈感來源與非官方聲明', async ({ page }) => {
  const errors = await open(page);
  await expectButtons(page, false, false, false);
  await expect(status(page)).toHaveCount(0);
  await expect(page.getByText('還沒有載入立繪。')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'woolwag3338/character-image-size' }),
  ).toHaveAttribute('href', 'https://github.com/woolwag3338/character-image-size');
  await expect(page.getByText(/本工具與 CCFOLIA 官方無關/).first()).toBeVisible();
  /* 說明區預設收合，可以展開 */
  const usage = page.getByRole('button', { name: '使用方式' });
  await expect(usage).toHaveAttribute('aria-expanded', 'false');
  await usage.click();
  await expect(page.getByText(/CCFOLIA 依圖片的寬度決定棋子大小/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('選檔載入：類型過濾、依檔頭判斷、累加、同一個檔案可以再加一次', async ({ page }) => {
  const errors = await open(page);
  const a = await A();
  /* 一次放入的檔案裡有其他類型：靜默略過 */
  await input(page).setInputFiles([
    file('A.png', a),
    file('筆記.txt', Buffer.from('不是圖片'), 'text/plain'),
  ]);
  await expect(status(page)).toHaveText('已載入 1 個檔案。');
  await expect(items(page)).toHaveCount(1);
  await expectButtons(page, true, false, true);
  /* 全部都不合格：錯誤訊息，清單不受影響 */
  await input(page).setInputFiles([
    file('動圖.gif', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), 'image/gif'),
    file('照片.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), 'image/jpeg'),
  ]);
  await expect(status(page)).toHaveText('只能載入 PNG 或 WebP 圖片。');
  await expect(
    page.getByRole('alert').filter({ hasText: '只能載入 PNG 或 WebP 圖片。' }),
  ).toBeVisible();
  await expect(items(page)).toHaveCount(1);
  /* 沒有副檔名的 PNG 依檔頭收下（刻意改善） */
  await input(page).setInputFiles([file('沒有副檔名', await B(), '')]);
  await expect(status(page)).toHaveText('已載入 2 個檔案。');
  /* 同一個檔案再載入一次：出現兩筆 */
  await input(page).setInputFiles([file('A.png', a)]);
  await input(page).setInputFiles([file('A.png', a)]);
  await expect(status(page)).toHaveText('已載入 4 個檔案。');
  await expect(items(page)).toHaveCount(4);
  await expect(items(page).nth(0)).toContainText('A.png');
  await expect(items(page).nth(1)).toContainText('沒有副檔名');
  await expect(items(page).nth(3)).toContainText('A.png');
  /* WebP */
  await input(page).setInputFiles([
    file('D.webp', await webp(page, 80, 60, { x: 10, y: 10, width: 20, height: 30 }), 'image/webp'),
  ]);
  await expect(items(page)).toHaveCount(5);
  /* 縮圖載入完成（棋盤格上的圖片，不是佔位） */
  await expect(items(page).first().locator('img')).toBeVisible();
  /* 檔名過長時省略，滑過可看全名 */
  await expect(items(page).nth(1).getByText('沒有副檔名')).toHaveAttribute('title', '沒有副檔名');
  expect(errors).toEqual([]);
});

test('拖放載入：拖曳經過時醒目、離開恢復、放開後加入', async ({ page }) => {
  const errors = await open(page);
  const b64 = (await A()).toString('base64');
  const dt = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], '拖進來的.png', { type: 'image/png' }));
    dt.items.add(new File(['x'], '說明.txt', { type: 'text/plain' }));
    return dt;
  }, b64);
  const zone = dropZone(page);
  await zone.dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(zone).toHaveAttribute('data-over', 'true');
  await zone.dispatchEvent('dragleave', { dataTransfer: dt });
  await expect(zone).not.toHaveAttribute('data-over');
  await zone.dispatchEvent('dragenter', { dataTransfer: dt });
  await zone.dispatchEvent('drop', { dataTransfer: dt });
  await expect(zone).not.toHaveAttribute('data-over');
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('拖進來的.png');
  await expect(status(page)).toHaveText('已載入 1 個檔案。');
  /* 拖放同一批再一次：每次都會加入 */
  await zone.dispatchEvent('drop', { dataTransfer: dt });
  await expect(items(page)).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('處理：進度、完成、處理後縮圖；改選項提示；移除、加入讓結果作廢；清除', async ({ page }) => {
  const errors = await open(page);
  await input(page).setInputFiles([
    file('A.png', await A()),
    file('B.png', await B()),
    file('C.png', await C()),
  ]);
  await expect(items(page)).toHaveCount(3);
  /* 記錄狀態列出現過的文字 */
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __status: string[] }).__status = seen;
    new MutationObserver(() => {
      const t = document.querySelector('[data-testid=status-text]')?.textContent;
      if (t && seen[seen.length - 1] !== t) seen.push(t);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await btn(page, '處理').click();
  await expect(status(page)).toHaveText('處理完成：共 3 張，寬度統一為 300 px。');
  const seen = await page.evaluate(() => (window as unknown as { __status: string[] }).__status);
  expect(seen).toEqual([
    '處理中：第 1／共 3 張',
    '處理中：第 2／共 3 張',
    '處理中：第 3／共 3 張',
    '處理完成：共 3 張，寬度統一為 300 px。',
  ]);
  await expect(list(page).locator('li[data-status=done]')).toHaveCount(3);
  await expect(items(page).nth(0)).toContainText('已處理');
  await expect(items(page).nth(0)).toContainText('300 × 240 px');
  await expect(items(page).nth(1)).toContainText('300 × 230 px');
  await expect(items(page).nth(2)).toContainText('300 × 70 px');
  /* 縮圖換成處理後的圖 */
  await expect(items(page).nth(2).locator('canvas')).toHaveAttribute('data-width', '300');
  await expectButtons(page, true, true, true);

  /* 改處理選項：不自動重算，顯示提示 */
  await page.getByRole('switch', { name: '去除透明留白' }).click();
  await expect(page.getByText(/處理選項已變更/)).toBeVisible();
  await expect(items(page).nth(0)).toContainText('300 × 240 px');
  await btn(page, '處理').click();
  await expect(status(page)).toHaveText('處理完成：共 3 張，寬度統一為 400 px。');
  await expect(page.getByText(/處理選項已變更/)).toHaveCount(0);
  await expect(items(page).nth(0)).toContainText('400 × 300 px');
  await expect(items(page).nth(2)).toContainText('400 × 120 px');
  await page.getByRole('switch', { name: '統一寬度' }).click();
  await btn(page, '處理').click();
  await expect(status(page)).toHaveText('處理完成：共 3 張。');
  await expect(items(page).nth(0)).toContainText('200 × 300 px');

  /* 移除：結果作廢、縮圖回到未處理、下載停用、狀態更新檔案數 */
  await page.getByRole('button', { name: '移除「B.png」' }).click();
  await expect(items(page)).toHaveCount(2);
  await expect(list(page).locator('li[data-status=done]')).toHaveCount(0);
  await expect(status(page)).toHaveText('已載入 2 個檔案。');
  await expectButtons(page, true, false, true);
  await expect(items(page).nth(0).locator('img')).toBeVisible();

  /* 加入新檔：同樣作廢 */
  await btn(page, '處理').click();
  await expect(list(page).locator('li[data-status=done]')).toHaveCount(2);
  await input(page).setInputFiles([file('B.png', await B())]);
  await expect(list(page).locator('li[data-status=done]')).toHaveCount(0);
  await expect(status(page)).toHaveText('已載入 3 個檔案。');
  await expectButtons(page, true, false, true);

  /* 全部移除：狀態訊息清空 */
  for (const name of ['A.png', 'C.png', 'B.png'])
    await page.getByRole('button', { name: `移除「${name}」` }).click();
  await expect(items(page)).toHaveCount(0);
  await expect(status(page)).toHaveCount(0);
  await expectButtons(page, false, false, false);

  /* 清除全部：之後再選同一個檔案也能載入 */
  const a = await A();
  await input(page).setInputFiles([file('A.png', a)]);
  await btn(page, '處理').click();
  await expect(status(page)).toHaveText(/處理完成/);
  await btn(page, '清除').click();
  await expect(items(page)).toHaveCount(0);
  await expect(status(page)).toHaveCount(0);
  await expectButtons(page, false, false, false);
  await input(page).setInputFiles([file('A.png', a)]);
  await expect(items(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('逐張下載：檔名、順序、間隔約 0.5 秒；輸出格式在下載時才套用', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const d = await webp(page, 90, 80, { x: 20, y: 10, width: 30, height: 50 });
  await input(page).setInputFiles([
    file('立繪.v2.final.png', await A()),
    file('沒有副檔名', await B(), ''),
    file('.png', await C()),
    file('D.webp', d, 'image/webp'),
  ]);
  await btn(page, '處理').click();
  await expect(status(page)).toHaveText('處理完成：共 4 張，寬度統一為 300 px。');

  async function downloadAll(expectedNames: string[]) {
    const downloads: Download[] = [];
    const onDownload = (dl: Download) => downloads.push(dl);
    page.on('download', onDownload);
    await page.evaluate(() => {
      (window as unknown as { __downloads: unknown[] }).__downloads.length = 0;
    });
    await btn(page, '全部下載').click();
    /* 下載期間按鈕停用，狀態顯示進度與提醒 */
    await expect(btn(page, '全部下載')).toBeDisabled();
    await expect(status(page)).toHaveText(/下載中：第 \d／共 4 張/);
    await expect(
      page.getByText('瀏覽器可能會詢問是否允許這個網站下載多個檔案，請選擇允許。'),
    ).toBeVisible();
    await expect(status(page)).toHaveText('下載完成：共 4 張。', { timeout: 15_000 });
    await expect(btn(page, '全部下載')).toBeEnabled();
    await expect.poll(() => downloads.length).toBe(4);
    page.off('download', onDownload);
    const log = await page.evaluate(
      () => (window as unknown as { __downloads: { name: string; t: number }[] }).__downloads,
    );
    expect(log.map((x) => x.name)).toEqual(expectedNames);
    for (let i = 1; i < log.length; i++) {
      const gap = log[i].t - log[i - 1].t;
      expect(gap, `第 ${i} 與第 ${i + 1} 張的間隔`).toBeGreaterThanOrEqual(450);
      expect(gap, `第 ${i} 與第 ${i + 1} 張的間隔`).toBeLessThanOrEqual(700);
    }
    return Promise.all(downloads.map(async (dl) => readFileSync((await dl.path())!)));
  }

  /* 預設：轉 WebP、無損 */
  let files = await downloadAll(['立繪.v2.final.webp', '沒有副檔名.webp', '.png.webp', 'D.webp']);
  for (const f of files) {
    expect(isWebp(f)).toBe(true);
    expect(fourcc(f, 'VP8L')).toBe(true);
  }
  /* A：300×240，內容從 x＝85 開始，不透明像素顏色不變 */
  const a = await decode(page, files[0], [
    [84, 0],
    [85, 0],
    [85 + 129, 239],
    [85 + 130, 0],
  ]);
  expect([a.width, a.height]).toEqual([300, 240]);
  expect(a.px[0][3]).toBe(0);
  expect(a.px[1]).toEqual([220, 40, 30, 255]);
  expect(a.px[2]).toEqual([30, 40, 200, 255]);
  expect(a.px[3][3]).toBe(0);
  const c = await decode(page, files[2], [
    [119, 0],
    [120, 0],
  ]);
  expect([c.width, c.height]).toEqual([300, 70]);
  expect(c.px[0][3]).toBe(0);
  expect(c.px[1]).toEqual([220, 40, 30, 255]);
  const dd = await decode(page, files[3], [[135, 0]]);
  expect([dd.width, dd.height]).toEqual([300, 50]);
  expect(dd.px[0]).toEqual([40, 200, 80, 255]);

  /* 自選品質 90%：有損 WebP（不必重新處理） */
  await page.getByRole('radio', { name: '自選品質' }).click();
  await expect(page.getByRole('slider', { name: '品質' })).toHaveAttribute('aria-valuenow', '90');
  files = await downloadAll(['立繪.v2.final.webp', '沒有副檔名.webp', '.png.webp', 'D.webp']);
  for (const f of files) {
    expect(isWebp(f)).toBe(true);
    expect(fourcc(f, 'VP8 ')).toBe(true);
    expect(fourcc(f, 'VP8L')).toBe(false);
  }
  expect((await decode(page, files[0], [])).width).toBe(300);

  /* 品質 100%：與無損相同 */
  const slider = page.getByRole('slider', { name: '品質' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
  files = await downloadAll(['立繪.v2.final.webp', '沒有副檔名.webp', '.png.webp', 'D.webp']);
  for (const f of files) expect(fourcc(f, 'VP8L')).toBe(true);

  /* 不轉 WebP：PNG 輸出 PNG，WebP 輸出無損 WebP（看實際類型，不看檔名） */
  await page.getByRole('switch', { name: '輸出為 WebP' }).click();
  files = await downloadAll(['立繪.v2.final.png', '沒有副檔名.png', '.png.png', 'D.webp']);
  expect(files.slice(0, 3).map(isPng)).toEqual([true, true, true]);
  expect(isWebp(files[3]) && fourcc(files[3], 'VP8L')).toBe(true);
  const ap = await decode(page, files[0], [
    [84, 0],
    [85, 0],
  ]);
  expect([ap.width, ap.height, ap.px[0][3]]).toEqual([300, 240, 0]);
  expect(ap.px[1]).toEqual([220, 40, 30, 255]);
  expect(errors).toEqual([]);
});

test('讀檔失敗：中止處理、訊息指出檔名、沒有處理結果', async ({ page }) => {
  const errors = await open(page);
  await input(page).setInputFiles([
    file('A.png', await A()),
    file('壞掉.png', Buffer.from('這不是 PNG 的內容'), 'image/png'),
    file('C.png', await C()),
  ]);
  await expect(items(page)).toHaveCount(3);
  await btn(page, '處理').click();
  const alert = page.getByRole('alert').filter({ hasText: '壞掉.png' });
  await expect(alert).toBeVisible();
  await expect(status(page)).toContainText('無法讀取「壞掉.png」');
  await expect(list(page).locator('li[data-status=done]')).toHaveCount(0);
  await expectButtons(page, true, false, true);
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  async function loadAndProcess(page: Page) {
    await input(page).setInputFiles([
      file('平常.png', await A()),
      file('持武器.png', await B()),
      file('受傷.png', await C()),
    ]);
    await btn(page, '處理').click();
    await expect(status(page)).toHaveText(/處理完成/);
    await page.mouse.move(0, 0);
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await loadAndProcess(page);
    await expect(page).toHaveScreenshot('portrait-size-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await loadAndProcess(page);
    await expect(page).toHaveScreenshot('portrait-size-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    await page.getByRole('radio', { name: '自選品質' }).click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
