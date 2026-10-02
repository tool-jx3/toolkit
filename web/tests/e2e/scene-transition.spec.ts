/**
 * 場景轉換素材產生器（建置產物 tools/scene-transition/）的端對端測試：
 * - 開頁沒有 pageerror／console error；預設（E01、1280 × 720、24、WebP）、狀態列的輸出摘要、頁尾的靈感來源。
 * - 選效果：初始設定、說明、依效果出現的形狀設定（F22）、換花紋、字幕的保留規則（4.5）、預覽從頭播放。
 * - 復原／重做（按鈕與快捷鍵；文字欄裡不觸發）、自動儲存與開頁還原。
 * - 預覽畫面（逐格）、背景（示意場景、自選圖片、取消選檔維持原本的背景）、重播。
 * - 匯出：WebP（解析 RIFF：VP8X、ANIM 播放次數、每格延遲）、APNG（acTL、fcTL 延遲）、檔名（倒著播放的後綴）、
 *   狀態列的完成訊息；不支援 WebP 的瀏覽器（模擬）；匯出錯誤（模擬）。
 * - 390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('scene-transition') ?? { id: 'scene-transition', status: 'next' })}/`;

async function open(page: Page, { clear = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  if (clear) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await expect(page.getByRole('heading', { level: 1, name: '場景轉換素材產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __sceneTransition?: unknown }).__sceneTransition,
  );
  return errors;
}

const hook = <T>(page: Page, fn: string) =>
  page.evaluate((f) => {
    // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
    const t = (window as any).__sceneTransition;
    return new Function('t', `return (${f})(t)`)(t);
  }, fn) as Promise<T>;

const status = (page: Page) => page.getByTestId('st-status');

async function chooseEffect(page: Page, name: string) {
  await page.getByRole('combobox', { name: '選擇效果' }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 預覽畫布某一點的 RGBA */
const pixel = (page: Page, x: number, y: number) =>
  page
    .getByTestId('st-canvas')
    .evaluate(
      (c: HTMLCanvasElement, [px, py]) =>
        Array.from(c.getContext('2d')!.getImageData(px, py, 1, 1).data),
      [x, y] as const,
    );

async function seekFrame(page: Page, i: number) {
  await page.evaluate((k) => {
    // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
    (window as any).__sceneTransition.seekFrame(k);
  }, i);
}

/** 讀動態 WebP：VP8X 旗標、播放次數、每格（ANMF）的延遲 */
function webpInfo(bytes: Buffer) {
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  const out = {
    flags: 0,
    width: 0,
    height: 0,
    loops: -1,
    delays: [] as number[],
    kinds: new Set<string>(),
  };
  let o = 12;
  while (o + 8 <= bytes.length) {
    const type = bytes.subarray(o, o + 4).toString('latin1');
    const size = bytes.readUInt32LE(o + 4);
    const d = bytes.subarray(o + 8, o + 8 + size);
    if (type === 'VP8X') {
      out.flags = d[0];
      out.width = d.readUIntLE(4, 3) + 1;
      out.height = d.readUIntLE(7, 3) + 1;
    } else if (type === 'ANIM') out.loops = d.readUInt16LE(4);
    else if (type === 'ANMF') {
      out.delays.push(d.readUIntLE(12, 3));
      /* 影格裡的位元流（VP8L＝無損、VP8＝有損） */
      let p = 16;
      while (p + 8 <= d.length) {
        const t = d.subarray(p, p + 4).toString('latin1');
        out.kinds.add(t);
        p += 8 + d.readUInt32LE(p + 4) + (d.readUInt32LE(p + 4) & 1);
      }
    }
    o += 8 + size + (size & 1);
  }
  return out;
}

async function exportFile(page: Page, button: RegExp) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: button }).click(),
  ]);
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}

test.describe('一般操作', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('預設值、狀態列、頁尾', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByRole('combobox', { name: '選擇效果' })).toHaveText('黑色淡出');
    await expect(page.getByTestId('st-effect-desc')).toContainText('整個畫面慢慢變黑');
    await expect(page.getByTestId('st-effect-desc')).toContainText('切換效果時');
    await expect(status(page)).toHaveText(
      '輸出 1280x720・17 格・1.31 秒・只播一次（預覽會反覆播放）',
    );
    await expect(page.getByRole('combobox', { name: '輸出尺寸' })).toHaveText('1280 × 720');
    await expect(page.getByRole('radio', { name: '24', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('radio', { name: 'WebP（建議）' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('radio', { name: '示意場景（只供預覽）' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^重做/ })).toBeDisabled();
    /* 沒有形狀設定的效果：形狀設定、發光顏色、第二顏色都不出現 */
    await expect(page.getByText('形狀設定')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^發光顏色：/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^第二顏色：/ })).toHaveCount(0);
    await expect(page.locator('footer')).toHaveText('靈感來源：shiki365/scene-transition-maker');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://github.com/shiki365/scene-transition-maker',
    );
    /* 字級＝輸出高的 9% */
    await expect(page.getByRole('spinbutton', { name: '字級' })).toHaveValue('66');
    expect(errors).toEqual([]);
  });

  test('選效果：初始設定、依效果出現的設定、換花紋、預覽畫面', async ({ page }) => {
    const errors = await open(page);
    await chooseEffect(page, '向右擦除・蓋上');
    await expect(page.getByTestId('st-effect-desc')).toContainText('從左邊往右');
    await expect(page.getByRole('spinbutton', { name: '邊緣柔和度' })).toHaveValue('25');
    await expect(page.getByRole('combobox', { name: '方向' })).toHaveText('從左到右');
    await expect(status(page)).toHaveText(/^輸出 1280x720・13 格・1\.05 秒/);
    /* 預覽：最後一格全黑、第一格透明；中間一格左邊黑右邊透明 */
    await seekFrame(page, 12);
    await expect.poll(() => pixel(page, 470, 135)).toEqual([0, 0, 0, 255]);
    await seekFrame(page, 0);
    await expect.poll(() => pixel(page, 10, 135)).toEqual([0, 0, 0, 0]);
    await seekFrame(page, 6);
    await expect.poll(async () => (await pixel(page, 20, 135))[3]).toBe(255);
    expect((await pixel(page, 460, 135))[3]).toBe(0);

    /* 格子：出現順序改變時欄位跟著增減 */
    await chooseEffect(page, '方格斜向長出');
    await expect(page.getByRole('combobox', { name: '格子形狀' })).toHaveText('方形');
    await expect(page.getByRole('combobox', { name: '方向' })).toHaveText('從左上到右下');
    await expect(page.getByRole('slider', { name: '橫向格數' })).toHaveAttribute(
      'aria-valuenow',
      '16',
    );
    await page.getByRole('radio', { name: '從中心' }).click();
    await expect(page.getByRole('combobox', { name: '方向' })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: '中心（左右位置）' })).toBeVisible();
    await page.getByRole('radio', { name: '隨機' }).click();
    await expect(page.getByTestId('st-seed')).toHaveText('#7');
    await page.getByRole('button', { name: '換花紋' }).click();
    await expect(page.getByTestId('st-seed')).not.toHaveText('#7');
    /* 換花紋記一步復原 */
    await page.getByRole('button', { name: /^復原/ }).click();
    await expect(page.getByTestId('st-seed')).toHaveText('#7');

    /* 旋轉合攏：轉動角度顯示度數；雙色閃換 2 次以上才出現第二顏色 */
    await chooseEffect(page, '旋轉夾合成光線');
    await expect(page.getByTestId('st-strength-value')).toHaveText('180°');
    await expect(page.getByRole('button', { name: /^發光顏色：/ })).toBeVisible();
    await chooseEffect(page, '黑白輪閃');
    await expect(page.getByTestId('st-strobe-value')).toHaveText('4 次');
    await expect(page.getByRole('button', { name: /^第二顏色：/ })).toBeVisible();
    const strobe = page.getByRole('slider', { name: '雙色閃換' });
    await strobe.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('st-strobe-value')).toHaveText('1 次');
    await expect(page.getByRole('button', { name: /^第二顏色：/ })).toHaveCount(0);
    /* 掃過：帶寬出現 */
    await choose(page, '轉場方式', '掃過');
    await expect(page.getByRole('slider', { name: '帶寬' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('字幕：範例字幕跟著效果換、自己打的字保留；字型名稱與電腦字型清單', async ({ page }) => {
    const errors = await open(page);
    const caption = page.getByRole('textbox', { name: '字幕文字' });
    await chooseEffect(page, '黑幕＋字幕');
    await expect(caption).toHaveValue('——　三天後　——');
    await chooseEffect(page, '黑幕＋等寬字幕');
    await expect(caption).toHaveValue('SIGNAL LOST');
    await expect(page.getByRole('combobox', { name: '字型' })).toHaveText('等寬');
    await caption.fill('第二章　出發');
    await caption.blur();
    await chooseEffect(page, '向下擦除・蓋上');
    await expect(caption).toHaveValue('第二章　出發');
    await expect(page.getByRole('combobox', { name: '字型' })).toHaveText('等寬');
    /* 字幕有字時預覽最後一格中央是字（不是純黑） */
    const frames = await hook<number>(page, '(t) => t.preview().frames');
    await seekFrame(page, frames - 1);
    await expect
      .poll(async () => {
        const data = await page
          .getByTestId('st-canvas')
          .evaluate((c: HTMLCanvasElement) =>
            Array.from(c.getContext('2d')!.getImageData(140, 120, 200, 30).data),
          );
        let bright = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 1] > 128) bright++;
        return bright;
      })
      .toBeGreaterThan(20);
    /* 自訂名稱：字型名稱欄；瀏覽器能列字型時有「從清單選」 */
    await choose(page, '字型', '自訂名稱');
    await expect(page.getByRole('textbox', { name: '字型名稱' })).toBeVisible();
    const canList = await page.evaluate(() => 'queryLocalFonts' in window);
    await expect(page.getByRole('button', { name: '從清單選' })).toHaveCount(canList ? 1 : 0);
    /* 文字欄裡按 Ctrl＋Z 不觸發工具的復原 */
    const before = await hook<string>(page, '(t) => t.data().effect');
    await caption.focus();
    await page.keyboard.press('Control+z');
    expect(await hook<string>(page, '(t) => t.data().effect')).toBe(before);
    expect(errors).toEqual([]);
  });

  test('復原／重做（按鈕與快捷鍵）、自動儲存與開頁還原', async ({ page }) => {
    const errors = await open(page);
    await chooseEffect(page, '百葉窗');
    await page.getByRole('radio', { name: '左右' }).click();
    await page.getByRole('radio', { name: '12（輕量）' }).click();
    await expect(page.getByRole('button', { name: /^復原/ })).toBeEnabled();
    await page.getByRole('button', { name: /^復原/ }).click();
    await expect(page.getByRole('radio', { name: '24', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('radio', { name: '上下' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Control+y');
    await expect(page.getByRole('radio', { name: '左右' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByRole('radio', { name: '12（輕量）' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('button', { name: /^重做/ })).toBeDisabled();
    /* 滑桿：放開才記一步 */
    const soft = page.getByRole('slider', { name: '邊緣柔和度' });
    await soft.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('spinbutton', { name: '邊緣柔和度' })).toHaveValue('17');
    /* 重新整理：設定還在、復原從空的開始 */
    await page.reload();
    await expect(page.getByRole('combobox', { name: '選擇效果' })).toHaveText('百葉窗');
    await expect(page.getByRole('radio', { name: '左右' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: '12（輕量）' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('spinbutton', { name: '邊緣柔和度' })).toHaveValue('17');
    await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
    /* 壞掉的存檔：用預設 */
    await page.evaluate(() =>
      localStorage.setItem(
        'trpg-toolkit:scene-transition',
        '{"state":{"data":{"effect":"X"}},"version":1}',
      ),
    );
    await page.reload();
    await expect(page.getByRole('combobox', { name: '選擇效果' })).toHaveText('黑色淡出');
    expect(errors).toEqual([]);
  });

  test('預覽背景：自選圖片鋪滿預覽區；取消選檔維持原本的背景', async ({ page }) => {
    const errors = await open(page);
    const bgImage = page.getByRole('radio', { name: '背景圖（只供預覽）' });
    /* 取消選檔 */
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), bgImage.click()]);
    await chooser.setFiles([]);
    await expect(page.getByRole('radio', { name: '示意場景（只供預覽）' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    /* 選一張圖 */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      'base64',
    );
    const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), bgImage.click()]);
    await chooser2.setFiles({ name: 'bg.png', mimeType: 'image/png', buffer: png });
    await expect(bgImage).toHaveAttribute('aria-checked', 'true');
    const area = page.locator('[data-stage-background="image"]');
    await expect(area).toHaveCSS('background-image', /^url\("blob:/);
    await expect(area).toHaveCSS('background-size', 'cover');
    await page.getByRole('radio', { name: '白色背景' }).click();
    await expect(page.locator('[data-stage-background="light"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('匯出 WebP 與 APNG：檔案結構、延遲、播放次數、檔名、狀態列', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page);
    /* WebP（E01）：17 格、42 ms…642 ms、播放 1 次 */
    const webp = await exportFile(page, /^匯出 WebP/);
    expect(webp.name).toBe('黑色淡出.webp');
    const w = webpInfo(webp.bytes);
    expect(w.flags & 0x02, '動畫').toBe(0x02);
    expect(w.flags & 0x10, '透明').toBe(0x10);
    expect([w.width, w.height]).toEqual([1280, 720]);
    expect(w.loops).toBe(1);
    expect(w.delays).toHaveLength(17);
    expect(w.delays[0]).toBe(42);
    expect(w.delays[16]).toBe(642);
    expect(w.delays.reduce((a, b) => a + b, 0)).toBe(1314);
    await expect(status(page)).toHaveText(/^已匯出 黑色淡出\.webp（1280x720・17 格・[\d.]+ KB）$/);
    await expect(page.getByTestId('export-result')).toContainText('17 格・1.31 秒');
    expect(webp.bytes.length).toBeLessThan(0.8 * 1024 * 1.5);

    /* APNG（E06 黑色淡出再淡入、640 × 360、循環播放、倒著播放）：27 格、停留在中間 */
    await chooseEffect(page, '黑色淡出再淡入');
    await choose(page, '輸出尺寸', '640 × 360');
    await page.getByRole('switch', { name: '循環播放' }).click();
    await page.getByRole('switch', { name: '倒著播放' }).click();
    await page.getByRole('radio', { name: 'APNG（.png）' }).click();
    const apng = await exportFile(page, /^匯出 APNG/);
    expect(apng.name).toBe('黑色淡出再淡入（倒著播放）.png');
    const info = parseApng(new Uint8Array(apng.bytes));
    expect([info.ihdr.width, info.ihdr.height]).toEqual([640, 360]);
    expect(info.numPlays).toBe(0);
    expect(info.numFrames).toBe(27);
    const delays = info.frames.map((f) => Math.round((f.delayNum * 1000) / (f.delayDen || 100)));
    expect(delays[13]).toBe(842);
    expect(delays.reduce((a, b) => a + b, 0)).toBe(1934);
    await expect(status(page)).toHaveText(
      /^已匯出 黑色淡出再淡入（倒著播放）\.png（640x360・27 格・[\d.]+ KB）$/,
    );
    /* 格式記在設定裡 */
    expect(await hook<string>(page, '(t) => t.data().format')).toBe('apng');
    expect(errors).toEqual([]);
  });

  test('不支援 WebP 的瀏覽器（模擬）：WebP 停用、存成 APNG、說明原因', async ({ page }) => {
    await page.addInitScript(() => {
      const oc = OffscreenCanvas.prototype.convertToBlob;
      OffscreenCanvas.prototype.convertToBlob = function (o?: ImageEncodeOptions) {
        return oc.call(this, o?.type === 'image/webp' ? { ...o, type: 'image/png' } : o);
      };
      const tb = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
        tb.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
      };
    });
    const errors = await open(page);
    await expect(page.getByRole('radio', { name: 'WebP（建議）' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'APNG（.png）' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText(/這個瀏覽器無法匯出 WebP/)).toBeVisible();
    const file = await exportFile(page, /^匯出 APNG/);
    expect(file.name).toBe('黑色淡出.png');
    expect(errors).toEqual([]);
  });

  test('匯出錯誤（模擬）：狀態列以警示色顯示原因', async ({ page }) => {
    await page.addInitScript(() => {
      // biome-ignore lint/suspicious/noExplicitAny: 模擬沒有辦法開 Worker 的錯誤
      (window as any).Worker = class {
        constructor() {
          throw new Error('模擬的編碼錯誤');
        }
      };
    });
    const errors = await open(page);
    await page.getByRole('button', { name: /^匯出 WebP/ }).click();
    await expect(status(page)).toHaveText('錯誤：模擬的編碼錯誤');
    await expect(page.locator('[data-tone="danger"]').filter({ hasText: '錯誤：' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Google 字型載不到（離線、被擋）：狀態列很快附註已改用後備字型；匯出也附註（F37）', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors = await open(page);
    /* open() 把字型請求換成空的樣式表；這裡改成連線失敗 */
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await choose(page, '輸出尺寸', '640 × 360');
    await choose(page, '字型', 'Klee One');
    const caption = page.getByRole('textbox', { name: '字幕文字' });
    await caption.fill('字幕測試ABC');
    const t0 = Date.now();
    await caption.blur();
    await expect(status(page)).toContainText('字型沒有載入，已改用後備字型', { timeout: 5_000 });
    /* 舊版 0.2 秒內就附註；這裡含 0.12 秒的重算延遲，給 3 秒的餘裕（不能等到 10 秒逾時） */
    expect(Date.now() - t0).toBeLessThan(3_000);
    await page.getByRole('radio', { name: 'APNG（.png）' }).click();
    await exportFile(page, /^匯出 APNG/);
    await expect(status(page)).toHaveText(
      /^已匯出 .+（字型沒有載入，已改用後備字型；請檢查網路連線）$/,
    );
    /* 只有字型請求失敗的訊息 */
    expect(errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e))).toEqual([]);
  });
});

test.describe('預覽播放', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('改設定後從頭播放；沒勾循環時每輪之間停約 1.2 秒；重播', async ({ page }) => {
    const errors = await open(page);
    /* 播到最後一格之後停在最後一格約 1.2 秒才從頭（E01：1.31 秒＋1.2 秒） */
    await expect.poll(() => hook<number>(page, '(t) => t.frame()'), { timeout: 5000 }).toBe(16);
    const t0 = Date.now();
    await expect
      .poll(() => hook<number>(page, '(t) => t.frame()'), { timeout: 5000, intervals: [20] })
      .toBeLessThan(4);
    expect(Date.now() - t0).toBeGreaterThan(700);
    /* 換效果：立刻從第一格 */
    await chooseEffect(page, '向下擦除・蓋上');
    await expect
      .poll(() => hook<number>(page, '(t) => t.frame()'), { timeout: 3000 })
      .toBeLessThan(6);
    await page.getByRole('button', { name: '重播' }).click();
    await expect
      .poll(() => hook<number>(page, '(t) => t.frame()'), { timeout: 3000 })
      .toBeLessThan(6);
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('scene-transition-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    for (const name of ['方格斜向長出', '黑幕＋字幕', '旋轉夾合成光線']) {
      await chooseEffect(page, name);
      await noHorizontalScroll(page);
    }
    await choose(page, '字型', '自訂名稱');
    await noHorizontalScroll(page);
    await chooseEffect(page, '黑色淡出');
    await choose(page, '字型', '黑體');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('scene-transition-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
