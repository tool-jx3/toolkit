/**
 * 輕量轉場 APNG 產生器（建置產物 next/apng-wipe/）的端對端測試：
 * 預設值、自訂尺寸的錯誤訊息與預覽修正、匯出的檔名與狀態（影格數、KB）、色碼欄與面板的雙向同步、
 * 預覽倍率標示、預覽播放、390 寬沒有橫向捲動、視覺回歸基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('apng-wipe') ?? { id: 'apng-wipe', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '輕量轉場 APNG 產生器' })).toBeVisible();
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 讀 APNG 的 IHDR 與 acTL */
function apngInfo(bytes: Buffer) {
  let o = 8;
  const out = { width: 0, height: 0, frames: 0, plays: -1 };
  while (o < bytes.length) {
    const len = bytes.readUInt32BE(o);
    const type = bytes.subarray(o + 4, o + 8).toString('latin1');
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      out.width = data.readUInt32BE(0);
      out.height = data.readUInt32BE(4);
    } else if (type === 'acTL') {
      out.frames = data.readUInt32BE(0);
      out.plays = data.readUInt32BE(4);
    }
    o += 12 + len;
  }
  return out;
}

async function exportFile(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '匯出 APNG' }).click(),
  ]);
  const bytes = readFileSync(await download.path());
  return { name: download.suggestedFilename(), bytes, info: apngInfo(bytes) };
}

/** 預覽畫布中心像素的透明度 */
const centerAlpha = (page: Page) =>
  page.getByTestId('wipe-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c
      .getContext('2d')!
      .getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return d[3];
  });

test.describe('一般操作', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('預設值、頁尾（出處不明時只有文字）', async ({ page }) => {
    const errors = await open(page);
    for (const name of ['方形 15 × 15', '整片淡變', '蓋上', '單次', '白']) {
      await expect(page.getByRole('radio', { name, exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    }
    await expect(page.getByText('1.0 秒')).toBeVisible();
    await expect(page.getByRole('slider', { name: '時長' })).toHaveAttribute(
      'aria-valuetext',
      '1.0 秒',
    );
    /* 擦除角度只在選擦除時出現 */
    await expect(page.getByRole('slider', { name: '擦除角度' })).toHaveCount(0);
    await page.getByRole('radio', { name: '方向擦除' }).click();
    await expect(page.getByRole('slider', { name: '擦除角度' })).toHaveAttribute(
      'aria-valuetext',
      '0°（往右）',
    );
    await expect(page.getByRole('textbox', { name: '色碼' })).toHaveValue('#28212f');
    await expect(page.getByTestId('preview-scale')).toHaveText(
      '實際尺寸 15 × 15 px・預覽放大 4 倍',
    );
    await expect(page.locator('footer')).toHaveText('靈感來源：出處不明的轉場 APNG 小工具');
    await expect(page.locator('footer a')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('自訂尺寸：不合法時不下載並顯示錯誤；預覽用修正後的值與倍率', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByRole('spinbutton', { name: '寬' })).toHaveCount(0);
    await page.getByRole('radio', { name: '自訂' }).click();
    const w = page.getByRole('spinbutton', { name: '寬' });
    const h = page.getByRole('spinbutton', { name: '高' });
    await expect(w).toHaveValue('20');
    await expect(h).toHaveValue('20');
    await expect(page.getByTestId('preview-scale')).toHaveText(
      '實際尺寸 20 × 20 px・預覽放大 4 倍',
    );
    let downloads = 0;
    page.on('download', () => downloads++);
    for (const [wv, hv, label] of [
      ['0', '20', '實際尺寸 1 × 20 px・預覽放大 4 倍'],
      ['1.5', '20', '實際尺寸 1 × 20 px・預覽放大 4 倍'],
      ['', '20', '實際尺寸 1 × 20 px・預覽放大 4 倍'],
      ['5000', '20', '實際尺寸 1200 × 20 px・預覽已縮小（長邊顯示為 180 px）'],
      ['100', '1201', '實際尺寸 100 × 1200 px・預覽已縮小（長邊顯示為 180 px）'],
    ]) {
      await w.fill(wv);
      await h.fill(hv);
      await expect(page.getByTestId('preview-scale')).toHaveText(label);
      await page.getByRole('button', { name: '匯出 APNG' }).click();
      await expect(page.getByRole('alert').filter({ hasText: '無法匯出' })).toHaveText(
        '無法匯出：自訂的寬與高都必須是 1～1200 的整數。',
      );
    }
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    /* 倍率標示跟著尺寸即時更新 */
    for (const [wv, hv, label] of [
      ['100', '20', '實際尺寸 100 × 20 px・預覽放大 1.8 倍'],
      ['46', '46', '實際尺寸 46 × 46 px・預覽放大 3.9 倍'],
      ['180', '90', '實際尺寸 180 × 90 px・預覽放大 1 倍'],
    ]) {
      await w.fill(wv);
      await h.fill(hv);
      await expect(page.getByTestId('preview-scale')).toHaveText(label);
    }
    /* 修正好之後可以匯出，檔名用 free */
    const file = await exportFile(page);
    expect(file.name).toBe('transition-free-normal-cover-0deg.png');
    expect([file.info.width, file.info.height]).toEqual([180, 90]);
    expect(errors).toEqual([]);
  });

  test('匯出：檔名、影格數與 KB 顯示、播放次數；匯出中按鈕停用', async ({ page }) => {
    const errors = await open(page);
    const first = await exportFile(page);
    expect(first.name).toBe('transition-square-normal-cover-0deg.png');
    expect(first.info).toMatchObject({ width: 15, height: 15, frames: 20, plays: 1 });
    const kb = (first.bytes.length / 1024).toFixed(1);
    await expect(page.getByTestId('export-status')).toHaveText(
      `已匯出 transition-square-normal-cover-0deg.png：20 格、${kb} KB`,
    );

    await page.getByRole('radio', { name: '方向擦除' }).click();
    const angle = page.getByRole('slider', { name: '擦除角度' });
    await angle.focus();
    await page.keyboard.press('ArrowRight');
    await expect(angle).toHaveAttribute('aria-valuetext', '45°（往右下）');
    await page.getByRole('radio', { name: '揭開' }).click();
    await page.getByRole('radio', { name: '無限循環' }).click();
    await page.getByRole('radio', { name: '縱長 15 × 30' }).click();
    const second = await exportFile(page);
    expect(second.name).toBe('transition-portrait-wipe-reveal-45deg.png');
    expect(second.info).toMatchObject({ width: 15, height: 30, plays: 0 });
    await expect(page.getByTestId('export-status')).toHaveText(
      `已匯出 transition-portrait-wipe-reveal-45deg.png：${second.info.frames} 格、${(second.bytes.length / 1024).toFixed(1)} KB`,
    );

    /* 淡變時檔名也帶目前的角度；時長滑桿 */
    await page.getByRole('radio', { name: '整片淡變' }).click();
    await page.getByRole('radio', { name: '橫長 30 × 15' }).click();
    const duration = page.getByRole('slider', { name: '時長' });
    await duration.focus();
    await page.keyboard.press('Home');
    await expect(duration).toHaveAttribute('aria-valuetext', '0.2 秒');
    await expect(page.getByText('0.2 秒', { exact: true })).toBeVisible();
    const third = await exportFile(page);
    expect(third.name).toBe('transition-landscape-normal-reveal-45deg.png');
    expect(third.info).toMatchObject({ width: 30, height: 15, frames: 6 });

    /* 大尺寸：匯出中按鈕停用並顯示處理中 */
    await page.getByRole('radio', { name: '自訂' }).click();
    await page.getByRole('spinbutton', { name: '寬' }).fill('1200');
    await page.getByRole('spinbutton', { name: '高' }).fill('1200');
    await page.getByRole('radio', { name: '方向擦除' }).click();
    await duration.focus();
    await page.keyboard.press('End');
    const button = page.getByRole('button', { name: '匯出 APNG' });
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(page.getByTestId('export-status')).toHaveText('正在產生 APNG…');
    const big = await downloadPromise;
    expect(big.suggestedFilename()).toBe('transition-free-wipe-reveal-45deg.png');
    await expect(button).toBeEnabled();
    await expect(page.getByTestId('export-status')).toHaveText(/^已匯出 .+：\d+ 格、[\d.]+ KB$/);
    expect(errors).toEqual([]);
  });

  test('色碼欄與面板雙向同步；不合法的色碼還原', async ({ page }) => {
    const errors = await open(page);
    const hex = page.getByRole('textbox', { name: '色碼' });
    const area = page.getByRole('slider', { name: '彩度與明度' });
    const hue = page.getByRole('slider', { name: '色相' });
    await expect(area).toHaveAttribute('aria-valuetext', '彩度 30%，明度 18%');
    await expect(hue).toHaveAttribute('aria-valuenow', '268');

    /* 輸入色碼（大寫）→ 轉小寫，面板標記與色相一起移動 */
    await hex.fill('#FF0000');
    await hex.press('Enter');
    await expect(hex).toHaveValue('#ff0000');
    await expect(page.getByRole('img', { name: '目前的顏色 #ff0000' })).toBeVisible();
    await expect(area).toHaveAttribute('aria-valuetext', '彩度 100%，明度 100%');
    await expect(hue).toHaveAttribute('aria-valuenow', '0');

    /* 不合法（3 位、少了 #、非 16 進位）→ 離開欄位後還原 */
    for (const bad of ['#abc', '00ff00', '#00ff0g']) {
      await hex.fill(bad);
      await hex.blur();
      await expect(hex).toHaveValue('#ff0000');
    }

    /* 動色相：顏色＝新色相＋目前的彩度與明度 */
    await hue.focus();
    await page.keyboard.press('PageUp');
    await expect(hue).toHaveAttribute('aria-valuenow', '10');
    await expect(hex).toHaveValue('#ff2a00');

    /* 動面板：方向鍵調整明度 */
    await area.focus();
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(area).toHaveAttribute('aria-valuetext', '彩度 100%，明度 50%');
    await expect(hex).toHaveValue('#801500');

    /* 點面板：正中央在色相 120 時是 #408040 */
    await hex.fill('#00ff00');
    await hex.press('Enter');
    await expect(hue).toHaveAttribute('aria-valuenow', '120');
    const box = (await area.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(hex).toHaveValue('#408040');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('apng-wipe-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，選擦除與自訂尺寸時也沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('apng-wipe-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    await page.getByRole('radio', { name: '方向擦除' }).click();
    await page.getByRole('radio', { name: '自訂' }).click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('預覽播放', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('單次：從頭播放後先是透明，播完停在最後（完全蓋上）；揭開相反；背景可切白／黑', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 5 秒：蓋上在 1.25 秒前都是透明，揭開在 0.75 秒前都是滿的，容易抓到 */
    const duration = page.getByRole('slider', { name: '時長' });
    await duration.focus();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: '從頭播放' }).click();
    await expect.poll(() => centerAlpha(page)).toBe(0);
    await expect.poll(() => centerAlpha(page), { timeout: 8000 }).toBe(255);
    await page.waitForTimeout(500);
    expect(await centerAlpha(page)).toBe(255);
    await page.getByRole('radio', { name: '揭開' }).click();
    await expect.poll(() => centerAlpha(page)).toBe(255);
    await expect.poll(() => centerAlpha(page), { timeout: 8000 }).toBe(0);
    const stage = page.getByRole('region', { name: '轉場預覽' });
    await expect(stage).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.getByRole('radio', { name: '黑', exact: true }).click();
    await expect(stage).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    expect(errors).toEqual([]);
  });

  test('循環：不斷重播', async ({ page }) => {
    const errors = await open(page);
    const duration = page.getByRole('slider', { name: '時長' });
    await duration.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(duration).toHaveAttribute('aria-valuetext', '2.0 秒');
    await page.getByRole('radio', { name: '無限循環' }).click();
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      samples.push(await centerAlpha(page));
      await page.waitForTimeout(100);
    }
    /* 5 秒內至少經過一次「蓋滿 → 回到透明 → 再蓋滿」 */
    const firstFull = samples.indexOf(255);
    expect(firstFull).toBeGreaterThanOrEqual(0);
    const backToZero = samples.indexOf(0, firstFull);
    expect(backToZero).toBeGreaterThan(firstFull);
    expect(samples.indexOf(255, backToZero)).toBeGreaterThan(backToZero);
    expect(errors).toEqual([]);
  });
});
