/**
 * 元件展示頁（建置產物 next/_gallery/）的端對端測試：
 * - 沒有 pageerror／console error；
 * - 1280 與 390 寬的視覺回歸基準（tests/__screenshots__/）；390 寬沒有橫向捲動；
 * - 示範動畫實際匯出 APNG、GIF、WebP、PNG、連番 PNG（ZIP），並驗證檔案能被瀏覽器解碼。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('_gallery') ?? { id: '_gallery', status: 'next' })}/`;

/** 收集錯誤；Google Fonts 改成空樣式（離線也能跑、截圖穩定） */
async function openGallery(page: Page, { theme }: { theme?: 'light' | 'dark' } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  if (theme) await page.addInitScript((t) => localStorage.setItem('trpg-toolkit:theme', t), theme);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '元件展示' })).toBeVisible();
  return errors;
}

/** 停在固定時間點（減少動態效果時不會自動播放） */
async function freezeAt(page: Page, pageUps: number) {
  const pause = page.getByRole('button', { name: '暫停', exact: true });
  if (await pause.isVisible()) await pause.click();
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  const slider = page.getByRole('slider', { name: '時間軸' });
  await slider.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < pageUps; i++) await page.keyboard.press('PageUp');
  await page.mouse.move(0, 0);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('元件展示頁', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('載入與互動都沒有錯誤', async ({ page }) => {
    const errors = await openGallery(page);
    for (const tab of ['控制項', '顏色與字型', '圖片', '對話框', '範本', '模組', '示範動畫']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }
    /* 快捷鍵 ? 開啟說明 */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog', { name: '快捷鍵' })).toBeVisible();
    await page.keyboard.press('Escape');
    /* 深淺色切換 */
    await page.getByRole('button', { name: '切換成淺色' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: '切換成深色' }).click();
    /* 改文字 → 自動存檔 → 復原 */
    const text = page.getByRole('textbox', { name: '判定文字' });
    await text.fill('成功');
    await expect(page.getByRole('status').filter({ hasText: '已自動儲存' })).toBeVisible();
    await page.waitForTimeout(500);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect(text).toHaveValue('大成功！');
    /* 字型對話框與色彩面板 */
    await page.getByRole('button', { name: /^字型/ }).click();
    await expect(page.getByRole('radiogroup', { name: 'Google 字型' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: /文字顏色：|選擇顏色/ })
      .first()
      .click();
    await expect(page.getByRole('slider', { name: '色相' })).toBeVisible();
    await page.keyboard.press('Escape');
    /* 確認對話框 */
    await page.getByRole('tab', { name: '對話框' }).click();
    await page.getByRole('button', { name: '確認（危險）' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(page.getByTestId('confirm-answer')).toHaveText('上次的回答：刪除');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬（深色、淺色）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await openGallery(page);
    await freezeAt(page, 1);
    await expect(page).toHaveScreenshot('gallery-1280-dark.png', { fullPage: true });
    await page.getByRole('button', { name: '切換成淺色' }).click();
    await page.getByRole('tab', { name: '控制項' }).click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('gallery-1280-light-controls.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，且每個分頁都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openGallery(page);
    await freezeAt(page, 1);
    await expect(page).toHaveScreenshot('gallery-390-dark.png', { fullPage: true });
    for (const tab of ['控制項', '顏色與字型', '圖片', '對話框', '範本', '模組', '示範動畫']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('示範動畫匯出', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  /** 用瀏覽器內建的 ImageDecoder 解碼，回傳影格數與尺寸 */
  async function decode(page: Page, bytes: Buffer, type: string) {
    return page.evaluate(
      async ({ b64, type }) => {
        const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const Decoder = (
          window as unknown as {
            ImageDecoder: new (o: {
              data: Uint8Array;
              type: string;
            }) => {
              tracks: {
                ready: Promise<void>;
                selectedTrack: { frameCount: number; animated: boolean };
              };
              completed: Promise<void>;
              decode: (o: { frameIndex: number }) => Promise<{
                image: { displayWidth: number; displayHeight: number; close(): void };
              }>;
            };
          }
        ).ImageDecoder;
        const d = new Decoder({ data, type });
        await d.tracks.ready;
        await d.completed;
        const first = await d.decode({ frameIndex: 0 });
        const last = await d.decode({ frameIndex: d.tracks.selectedTrack.frameCount - 1 });
        const out = {
          frames: d.tracks.selectedTrack.frameCount,
          animated: d.tracks.selectedTrack.animated,
          width: first.image.displayWidth,
          height: first.image.displayHeight,
          lastWidth: last.image.displayWidth,
        };
        first.image.close();
        last.image.close();
        return out;
      },
      { b64: bytes.toString('base64'), type },
    );
  }

  async function exportAs(page: Page, format: string, button: string) {
    await page.getByRole('radio', { name: format, exact: true }).click();
    await page.getByRole('button', { name: button }).click();
    const card = page.getByTestId('export-result');
    await expect(card).toBeVisible({ timeout: 60_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('link', { name: '下載' }).click(),
    ]);
    const path = await download.path();
    return { name: download.suggestedFilename(), bytes: readFileSync(path), card };
  }

  test('APNG／GIF／WebP／PNG／連番 PNG 都能匯出並被解碼', async ({ page }) => {
    const errors = await openGallery(page);
    const ascii = (b: Buffer, s: string) => b.includes(Buffer.from(s, 'latin1'));

    const apng = await exportAs(page, 'APNG', '匯出 APNG');
    expect(apng.name).toBe('骰子判定.png');
    expect(apng.bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(
      ascii(apng.bytes, 'acTL') && ascii(apng.bytes, 'fcTL') && ascii(apng.bytes, 'fdAT'),
    ).toBe(true);
    const a = await decode(page, apng.bytes, 'image/png');
    expect(a).toMatchObject({ animated: true, width: 480, height: 270 });
    expect(a.frames).toBeGreaterThan(20);
    await expect(apng.card).toContainText('78 格');

    const gif = await exportAs(page, 'GIF', '匯出 GIF');
    expect(gif.name).toBe('骰子判定.gif');
    expect(gif.bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    const g = await decode(page, gif.bytes, 'image/gif');
    expect(g).toMatchObject({ animated: true, width: 480, height: 270 });
    expect(g.frames).toBeGreaterThan(20);

    const webp = await exportAs(page, 'WebP', '匯出 WebP');
    expect(webp.name).toBe('骰子判定.webp');
    expect(webp.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(webp.bytes.subarray(8, 16).toString('latin1')).toBe('WEBPVP8X');
    expect(ascii(webp.bytes, 'ANIM') && ascii(webp.bytes, 'ANMF')).toBe(true);
    const w = await decode(page, webp.bytes, 'image/webp');
    expect(w).toMatchObject({ animated: true, width: 480, height: 270, lastWidth: 480 });
    expect(w.frames).toBeGreaterThan(20);
    test.info().annotations.push({
      type: 'webp',
      description: ascii(webp.bytes, 'VP8L') ? '影格為無損 VP8L' : '影格為有損 VP8',
    });

    const png = await exportAs(page, 'PNG', '匯出 PNG');
    expect(png.name).toBe('骰子判定.png');
    const p = await decode(page, png.bytes, 'image/png');
    expect(p).toMatchObject({ frames: 1, width: 480, height: 270 });
    expect(ascii(png.bytes, 'acTL')).toBe(false);

    const zip = await exportAs(page, '連番 PNG', '匯出 連番 PNG');
    expect(zip.name).toBe('骰子判定.zip');
    const files = Object.keys(unzipSync(new Uint8Array(zip.bytes))).sort();
    expect(files.filter((f) => f.endsWith('.png'))).toHaveLength(78);
    expect(files[0]).toBe('骰子判定_0001.png');
    expect(files).toContain('骰子判定_資訊.txt');

    expect(errors).toEqual([]);
  });

  test('減色與縮放：APNG 檔案變小、尺寸跟著縮放', async ({ page }) => {
    const errors = await openGallery(page);
    const full = await exportAs(page, 'APNG', '匯出 APNG');
    await page.getByRole('switch', { name: '減色（256 色）' }).click();
    await page.getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^50%/ }).click();
    const small = await exportAs(page, 'APNG', '匯出 APNG');
    expect(small.bytes.length).toBeLessThan(full.bytes.length);
    const d = await decode(page, small.bytes, 'image/png');
    expect(d).toMatchObject({ width: 240, height: 135 });
    expect(errors).toEqual([]);
  });
});

test('模組：音樂與歌詞的示範（播放、目前這一句、打點、有聲音的影片）', async ({ page }) => {
  const errors = await openGallery(page);
  await page.getByRole('tab', { name: '模組' }).click();
  const section = page.getByTestId('music-demo');
  await section.getByRole('button', { name: '產生 4 秒的示範音樂' }).click();
  await expect(section.getByTestId('transport-time')).toHaveText('0:00／0:04');
  await expect(section.getByTestId('music-demo-line')).toContainText('目前：—');
  await section.getByRole('slider', { name: '時間軸' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(section.getByTestId('music-demo-line')).toHaveText(
    '目前：擲出骰子　下一句：命運開始轉動',
  );
  /* 打點：游標在第四行 → 寫上目前的時間（1 秒），尾端補換行 */
  const area = section.getByRole('textbox', { name: '示範歌詞' });
  await area.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
  await section.getByRole('button', { name: '打點' }).click();
  await expect(area).toHaveValue(/\[00:01\.00\] 第四句還沒有時間\n$/);
  await section.getByRole('button', { name: /編成有聲音的影片/ }).click();
  await expect(section.getByTestId('music-demo-movie')).toContainText(/示範\.(mp4|mov)/, {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

test('模組：模型下載卡（假的下載）：告知、進度、取消、驗證失敗、下載完成、刪除', async ({
  page,
}) => {
  const errors = await openGallery(page);
  await page.getByRole('tab', { name: '模組' }).click();
  const panel = page.getByTestId('model-panel');
  await expect(panel).toHaveAttribute('data-status', 'missing');
  await expect(panel).toContainText('要先下載 AI 模型才能使用：示範模型（假的），約 2 MB。');
  await expect(panel).toContainText('授權：MIT');
  /* 下載中：進度條與 MB 數；取消 */
  await panel.getByRole('button', { name: '下載模型（約 2 MB）' }).click();
  await expect(panel).toHaveAttribute('data-status', 'downloading');
  await expect(panel.getByRole('progressbar')).toBeVisible();
  await expect(panel.getByTestId('model-progress-text')).toHaveText(/^\d+\.\d／2\.0 MB（\d+%）$/);
  await panel.getByRole('button', { name: '取消下載' }).click();
  await expect(panel).toContainText('已取消下載。');
  /* 下載壞掉的檔案：SHA-256 不符 */
  await page.getByRole('switch', { name: '下次下載壞掉的檔案（示範驗證失敗）' }).click();
  await panel.getByRole('button', { name: '下載模型（約 2 MB）' }).click();
  await expect(panel.getByRole('alert')).toHaveText(
    '下載的檔案與官方版本不符（SHA-256 不同），已丟棄。請再試一次。',
    { timeout: 15_000 },
  );
  /* 正常下載 → 已下載 → 刪除（先確認） */
  await page.getByRole('switch', { name: '下次下載壞掉的檔案（示範驗證失敗）' }).click();
  await panel.getByRole('button', { name: '重新下載' }).click();
  await expect(panel).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
  await expect(panel).toContainText('模型已下載（約 2 MB，存在這個瀏覽器）：示範模型（假的）');
  await panel.getByRole('button', { name: '刪除已下載的模型' }).click();
  await page
    .getByRole('alertdialog', { name: '刪除已下載的模型？' })
    .getByRole('button', { name: '刪除' })
    .click();
  await expect(panel).toHaveAttribute('data-status', 'missing');
  expect(errors).toEqual([]);
});
