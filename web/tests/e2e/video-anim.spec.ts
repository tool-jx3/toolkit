/**
 * 影片轉動圖工具（建置產物 tools/video-anim/）的端對端測試：
 * - 開頁（整頁載入區、比較表、頁尾）、載入（選檔、拖放、不是影片、讀不到、範例影片）、影片資訊；
 * - 選取區間（0.2 秒的間隔、還原、[ ] 快捷鍵、暫停時可以停在終點之後）、播放（區間內循環、空白鍵、播放速度）；
 * - 裁切（中央 80%、方向鍵移動、對話框設定範圍、關掉再開重設）、比例與輸出尺寸（偶數）；
 * - 匯出並解析下載的檔案：APNG（影格數、1/FPS 的延遲、循環、逐格取到正確的時間）、WebP（無損 VP8L／有損 VP8、累計毫秒）、
 *   GIF（最多 50 FPS、每格的調色盤、色數上限、抖色）、速度＋裁切＋比例、取消、新分頁、複製資料網址；
 * - APNG 的「沒變的像素透明疊上」（大小與舊版相當、瀏覽器解碼逐像素相同）、編碼 Worker 載不到時匯出失敗而不是卡住；
 * - 逐格檢視（12 張樣本）、設定記住（影片不記住）、格式比較（寬的地方是表、設定欄裡每種格式一張卡）、快捷鍵說明、
 *   390 寬沒有橫向捲動、1280／390 視覺基準圖。
 *
 * 測試影片 fixtures/video-anim-clip.webm：320 × 180、30 fps、3 秒（90 格）、VP8。四個象限是紅、綠、藍、黃，
 * 中間 y 80～99 是深灰帶，帶上的白色方塊第 k 格在 x＝4 + 3k（寬 12）。用 Pillow 畫 JPEG 影格，再以 Playwright 附的 ffmpeg 編成 WebM。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { decodeAnimatedImage } from '../../src/core/decode';
import { parseWebp } from '../../src/core/encode/webp';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('video-anim') ?? { id: 'video-anim', status: 'next' })}/`;
const CLIP_PATH = new globalThis.URL('./fixtures/video-anim-clip.webm', import.meta.url);
const CLIP = readFileSync(CLIP_PATH);
const CLIP_NAME = 'video-anim-clip.webm';

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
  await expect(page.getByRole('heading', { level: 1, name: '影片轉動圖工具' })).toBeVisible();
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
const toast = (page: Page, text: string | RegExp) => page.getByText(text).first();

/** 關掉畫面上所有的通知（截圖前） */
async function dismissToasts(page: Page) {
  const close = page.getByRole('button', { name: '關閉通知' });
  while ((await close.count()) > 0) await close.first().click();
  await expect(close).toHaveCount(0);
}
const dims = (page: Page) => page.getByTestId('video-dims');
const video = (page: Page) => page.getByTestId('preview-video');

async function loadClip(page: Page) {
  await fileInput(page).setInputFiles({ name: CLIP_NAME, mimeType: 'video/webm', buffer: CLIP });
  await expect(dims(page)).toHaveText('320x180（3.0 秒）');
  await waitVideoReady(page);
}

async function waitVideoReady(page: Page) {
  await video(page).evaluate(
    (v: HTMLVideoElement) =>
      new Promise<void>((r) => {
        if (v.readyState >= 2) r();
        else v.addEventListener('loadeddata', () => r(), { once: true });
      }),
  );
}

/** 預覽跳到 t 秒（等跳轉完成） */
async function seekPreview(page: Page, t: number) {
  await video(page).evaluate(
    (v: HTMLVideoElement, time) =>
      new Promise<void>((r) => {
        v.addEventListener('seeked', () => r(), { once: true });
        v.currentTime = time;
      }),
    t,
  );
}

const rangeText = (page: Page, id: 'start' | 'end' | 'length' | 'current') =>
  page.getByTestId(`range-${id}`);

/** 按匯出、等結果卡、下載，回傳檔名與位元組 */
async function exportAndDownload(page: Page) {
  await page.getByRole('button', { name: /^匯出 / }).click();
  const card = page.getByTestId('export-result');
  await expect(card).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)), card };
}

/** 一格畫面裡白色方塊的位置 → 來源的第幾格 */
function sourceFrameIndex(rgba: ArrayLike<number>, W: number, H: number): number {
  const y = Math.round(90 * (H / 180));
  let s = 0;
  let n = 0;
  for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    if ((rgba[k] + rgba[k + 1] + rgba[k + 2]) / 3 > 150) {
      s += x;
      n++;
    }
  }
  return n ? Math.round((s / n / (W / 320) - 9.5) / 3) : -1;
}

/**
 * 用瀏覽器的 ImageDecoder 解碼動圖（動態 WebP、APNG），回傳每一格對應的來源格數、毫秒與整格像素的雜湊（FNV-1a）
 */
async function browserFrames(page: Page, bytes: Uint8Array, type = 'image/webp') {
  return page.evaluate(
    async ([arr, type]) => {
      const data = new Uint8Array(arr as number[]);
      const dec = new ImageDecoder({ data, type: type as string });
      await dec.tracks.ready;
      const n = dec.tracks.selectedTrack?.frameCount ?? 0;
      const out: { idx: number; ms: number; hash: number }[] = [];
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const W = image.displayWidth;
        const H = image.displayHeight;
        const c = new OffscreenCanvas(W, H);
        const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
        ctx.drawImage(image, 0, 0);
        const ms = (image.duration ?? 0) / 1000;
        image.close();
        const all = ctx.getImageData(0, 0, W, H).data;
        let hash = 0x811c9dc5;
        for (let k = 0; k < all.length; k++) hash = Math.imul(hash ^ all[k], 0x01000193);
        const y = Math.round(90 * (H / 180));
        const d = all.subarray(y * W * 4, (y + 1) * W * 4);
        let s = 0;
        let m = 0;
        for (let x = 0; x < W; x++) {
          if ((d[x * 4] + d[x * 4 + 1] + d[x * 4 + 2]) / 3 > 150) {
            s += x;
            m++;
          }
        }
        out.push({ idx: m ? Math.round((s / m / (W / 320) - 9.5) / 3) : -1, ms, hash: hash >>> 0 });
      }
      return out;
    },
    [Array.from(bytes), type] as const,
  );
}

/** 與 browserFrames 相同的像素雜湊（FNV-1a） */
function frameHash(rgba: ArrayLike<number>): number {
  let hash = 0x811c9dc5;
  for (let k = 0; k < rgba.length; k++) hash = Math.imul(hash ^ rgba[k], 0x01000193);
  return hash >>> 0;
}

const riff = (bytes: Uint8Array) => {
  const chunks = parseWebp(bytes);
  const anmf = chunks.filter((c) => c.fourcc === 'ANMF');
  const anim = chunks.find((c) => c.fourcc === 'ANIM');
  return {
    vp8x: chunks.find((c) => c.fourcc === 'VP8X')?.data,
    loops: anim ? anim.data[4] | (anim.data[5] << 8) : null,
    frames: anmf.map((c) => ({
      ms: c.data[12] | (c.data[13] << 8) | (c.data[14] << 16),
      sub: String.fromCharCode(...c.data.subarray(16, 20)),
    })),
  };
};

const formatRadio = (page: Page, name: 'APNG' | 'WebP' | 'GIF') =>
  page.getByRole('radio', { name, exact: true });

async function pickSelect(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

async function setCropByDialog(page: Page, r: { x: number; y: number; w: number; h: number }) {
  await page.getByRole('button', { name: '調整裁切範圍' }).click();
  const dlg = page.getByRole('dialog', { name: '調整裁切範圍' });
  await expect(dlg).toBeVisible();
  for (const [label, v] of [
    ['寬', r.w],
    ['高', r.h],
    ['X', r.x],
    ['Y', r.y],
  ] as const) {
    const f = dlg.getByRole('spinbutton', { name: label, exact: true });
    await f.fill(String(v));
    await f.press('Enter');
  }
  await dlg.getByRole('button', { name: '確定' }).click();
  await expect(dlg).toBeHidden();
}

test.describe('開頁與載入', () => {
  test('開頁：整頁的載入區、範例影片、格式比較表、頁尾，沒有 console error', async ({ page }) => {
    const errors = await open(page);
    await expect(
      page.getByRole('group', { name: '把影片檔拖到這裡，或點一下選擇檔案' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '產生範例影片' })).toBeVisible();
    await expect(page.getByTestId('video-dims')).toHaveCount(0);
    /* 比較表預設收合 */
    await expect(page.getByRole('table')).toHaveCount(0);
    await page.getByRole('button', { name: /APNG／WebP／GIF 的比較/ }).click();
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(6);
    await expect(table).toContainText('只有全透明或不透明');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('靈感來源');
    await expect(footer.getByRole('link', { name: 'sotsotssi/video-to-pic' })).toHaveAttribute(
      'href',
      'https://github.com/sotsotssi/video-to-pic',
    );
    expect(errors).toEqual([]);
  });

  test('載入：不是影片、讀不到時通知並保留原本的影片；影片資訊與起點終點', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles({
      name: 'note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(toast(page, '不是可用的影片檔')).toBeVisible();
    await expect(
      page.getByRole('group', { name: '把影片檔拖到這裡，或點一下選擇檔案' }),
    ).toBeVisible();
    await fileInput(page).setInputFiles({
      name: 'broken.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from('this is not a video at all'),
    });
    await expect(toast(page, '無法讀取影片')).toBeVisible({ timeout: 20_000 });
    await expect(dims(page)).toHaveCount(0);

    await loadClip(page);
    await expect(toast(page, '影片已載入')).toBeVisible();
    await expect(page.getByTestId('video-info')).toContainText(CLIP_NAME);
    await expect(rangeText(page, 'start')).toHaveText('0.00s');
    await expect(rangeText(page, 'end')).toHaveText('3.00s');
    await expect(rangeText(page, 'length')).toHaveText('3.00s');
    await expect(rangeText(page, 'current')).toHaveText('0.00s');

    /* 換影片時讀不到：原本的影片保留 */
    await fileInput(page).setInputFiles({
      name: 'broken2.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('nope'),
    });
    await expect(toast(page, '無法讀取影片').first()).toBeVisible({ timeout: 20_000 });
    await expect(dims(page)).toHaveText('320x180（3.0 秒）');
    expect(errors.filter((e) => !/MEDIA_ELEMENT_ERROR|Failed to load resource/.test(e))).toEqual(
      [],
    );
  });

  test('拖放載入（拖曳經過時醒目）', async ({ page }) => {
    await open(page);
    const drop = page.getByRole('group', { name: '把影片檔拖到這裡，或點一下選擇檔案' });
    const dt = await page.evaluateHandle(
      ({ bytes, name }) => {
        const d = new DataTransfer();
        d.items.add(new File([new Uint8Array(bytes)], name, { type: 'video/webm' }));
        return d;
      },
      { bytes: Array.from(CLIP), name: CLIP_NAME },
    );
    await drop.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(drop).toHaveAttribute('data-over', 'true');
    await drop.dispatchEvent('drop', { dataTransfer: dt });
    await expect(dims(page)).toHaveText('320x180（3.0 秒）');
  });

  test('產生範例影片（640 × 360、約 3 秒）', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '產生範例影片' }).click();
    await expect(toast(page, '正在產生範例影片')).toBeVisible();
    await expect(dims(page)).toHaveText(/^640x360（3\.\d 秒）$/, { timeout: 30_000 });
    await expect(page.getByTestId('video-info')).toContainText('sample_motion.webm');
    expect(errors).toEqual([]);
  });
});

test.describe('選取區間與播放', () => {
  test('起點與終點：0.2 秒的間隔、[ ] 快捷鍵、暫停時可以停在終點之後、還原', async ({ page }) => {
    const errors = await open(page);
    await loadClip(page);
    await seekPreview(page, 1);
    await page.getByRole('button', { name: '以目前位置為起點' }).click();
    await expect(rangeText(page, 'start')).toHaveText('1.00s');
    await expect(toast(page, '起點設在 1.00 秒')).toBeVisible();
    await seekPreview(page, 0.5);
    await page.getByRole('button', { name: '以目前位置為終點' }).click();
    await expect(rangeText(page, 'end')).toHaveText('1.20s');
    await expect(rangeText(page, 'length')).toHaveText('0.20s');

    /* [：最晚到終點 − 0.2 秒 */
    await seekPreview(page, 1.15);
    await page.keyboard.press('[');
    await expect(rangeText(page, 'start')).toHaveText('1.00s');
    /* 暫停時停在終點之後不會被拉回（規格 5. D12），] 把終點往後延 */
    await seekPreview(page, 2.5);
    await page.waitForTimeout(300);
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(2.5, 2);
    await page.keyboard.press(']');
    await expect(rangeText(page, 'end')).toHaveText('2.50s');
    await expect(rangeText(page, 'length')).toHaveText('1.50s');

    await page.getByRole('button', { name: '還原成整段' }).click();
    await expect(rangeText(page, 'start')).toHaveText('0.00s');
    await expect(rangeText(page, 'end')).toHaveText('3.00s');
    expect(errors).toEqual([]);
  });

  test('播放：區間內循環、空白鍵、播放速度套到預覽', async ({ page }) => {
    await open(page);
    await loadClip(page);
    await seekPreview(page, 1);
    await page.keyboard.press('[');
    await seekPreview(page, 1.5);
    await page.keyboard.press(']');
    await expect(rangeText(page, 'end')).toHaveText('1.50s');
    await seekPreview(page, 1);
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press(' ');
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
    const times: number[] = [];
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(150);
      times.push(await video(page).evaluate((v: HTMLVideoElement) => v.currentTime));
    }
    /* 播了 1.8 秒仍在區間裡（終點後立刻回到起點） */
    expect(Math.min(...times)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...times)).toBeLessThan(1.6);
    await page.keyboard.press(' ');
    await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();

    await page.getByRole('radio', { name: '2.0x' }).click();
    expect(await video(page).evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(2);
  });
});

test.describe('裁切與尺寸', () => {
  test('裁切：中央 80%、方向鍵移動、對話框設定範圍、關掉再開重設；比例選單與偶數尺寸', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadClip(page);
    const out = page.getByTestId('output-size');
    await expect(out).toHaveText('輸出尺寸 320×180 px');
    await page.getByRole('switch', { name: '裁切' }).click();
    const info = page.getByTestId('crop-info');
    await expect(info).toHaveText('範圍：X 32、Y 18、256×144 px');
    await expect(out).toHaveText('輸出尺寸 256×144 px');
    const frame = page.getByRole('slider', { name: '裁切範圍' });
    await expect(frame).toBeVisible();
    await frame.focus();
    await page.keyboard.press('ArrowRight');
    await expect(info).toHaveText('範圍：X 33、Y 18、256×144 px');

    await setCropByDialog(page, { x: 160, y: 0, w: 160, h: 80 });
    await expect(info).toHaveText('範圍：X 160、Y 0、160×80 px');
    await expect(out).toHaveText('輸出尺寸 160×80 px');

    await pickSelect(page, '解析度比例', /^33%/);
    await expect(out).toHaveText('輸出尺寸 54×26 px');
    await pickSelect(page, '解析度比例', /^75%/);
    await expect(out).toHaveText('輸出尺寸 120×60 px');

    await page.getByRole('switch', { name: '裁切' }).click();
    await expect(info).toHaveCount(0);
    await expect(out).toHaveText('輸出尺寸 240×136 px');
    await page.getByRole('switch', { name: '裁切' }).click();
    await expect(info).toHaveText('範圍：X 32、Y 18、256×144 px');
    expect(errors).toEqual([]);
  });
});

test.describe('匯出', () => {
  test('APNG：90 格、每格 1/30 秒、無限循環、逐格取到正確的時間；結果的資訊', async ({ page }) => {
    const errors = await open(page);
    await loadClip(page);
    await expect(page.getByTestId('export-estimate')).toContainText('3.00 秒 · 90 格');
    const { name, bytes, card } = await exportAndDownload(page);
    expect(name).toBe('video-anim-clip.png');
    const apng = parseApng(bytes);
    expect(apng.ihdr.width).toBe(320);
    expect(apng.ihdr.height).toBe(180);
    expect(apng.ihdr.colorType).toBe(6);
    expect(apng.numPlays).toBe(0);
    expect(apng.numFrames).toBe(90);
    expect(apng.frames.every((f) => f.delayNum === 1 && f.delayDen === 30)).toBe(true);
    const anim = await decodeAnimatedImage(bytes, { maxFrames: 500 });
    expect(anim.frames.map((f) => sourceFrameIndex(f.rgba, 320, 180))).toEqual(
      Array.from({ length: 90 }, (_, i) => i),
    );
    await expect(card).toContainText('APNG（無損）');
    await expect(card).toContainText('30 FPS・1.0 倍速・90 格');
    await expect(card).toContainText(/編碼時間\s*\d+\.\d 秒/);
    await expect(card).toContainText(/大小（MB）\s*0\.\d\d MB/);
    await expect(toast(page, '轉換完成')).toBeVisible();
    await expect(page.getByTestId('result-preview')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('APNG 10 FPS：沒變的像素存成透明再疊上、必要時還原成前兩格，大小與舊版相當；瀏覽器解碼每格相同', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadClip(page);
    await pickSelect(page, 'FPS', '10 fps');
    const { bytes } = await exportAndDownload(page);
    const apng = parseApng(bytes);
    expect(apng.numFrames).toBe(30);
    expect(apng.frames[0]).toMatchObject({ x: 0, y: 0, width: 320, height: 180, blend: 0 });
    /* 規格 3.3、7.1：範圍裡沒變的像素透明、以 OVER 疊上；和前兩格比較小時上一格改成 PREVIOUS */
    expect(apng.frames.filter((f) => f.blend === 1).length).toBeGreaterThan(20);
    expect(apng.frames.some((f) => f.dispose === 2)).toBe(true);
    /* 舊版（UPNG.js）同設定 16,902 B（修正前 27,834 B＝1.65 倍）；規格 3.8：不超過 1.5 倍 */
    expect(bytes.length).toBeLessThanOrEqual(Math.floor(16902 * 1.5));
    const expected = Array.from({ length: 30 }, (_, i) => i * 3);
    const anim = await decodeAnimatedImage(bytes, { maxFrames: 100 });
    expect(anim.frames.map((f) => sourceFrameIndex(f.rgba, 320, 180))).toEqual(expected);
    /* 瀏覽器自己的解碼（dispose／blend 由瀏覽器處理）與 core/decode 逐像素相同 */
    const native = await browserFrames(page, bytes, 'image/png');
    expect(native.map((f) => f.idx)).toEqual(expected);
    expect(native.map((f) => f.hash)).toEqual(anim.frames.map((f) => frameHash(f.rgba)));
    expect(errors).toEqual([]);
  });

  test('WebP：無損 VP8L／有損 VP8、累計毫秒、無限循環、逐格取到正確的時間', async ({ page }) => {
    const errors = await open(page);
    await loadClip(page);
    await formatRadio(page, 'WebP').click();
    await expect(page.getByRole('switch', { name: '無損' })).toBeChecked();
    let { name, bytes, card } = await exportAndDownload(page);
    expect(name).toBe('video-anim-clip.webp');
    let w = riff(bytes);
    expect(w.loops).toBe(0);
    expect(w.vp8x?.[0] && w.vp8x[0] & 0x02).toBeTruthy();
    expect(w.frames.length).toBe(90);
    expect(w.frames.reduce((s, f) => s + f.ms, 0)).toBe(3000);
    expect(new Set(w.frames.map((f) => f.ms))).toEqual(new Set([33, 34]));
    expect(new Set(w.frames.map((f) => f.sub))).toEqual(new Set(['VP8L']));
    const decoded = await browserFrames(page, bytes);
    expect(decoded.map((f) => f.idx)).toEqual(Array.from({ length: 90 }, (_, i) => i));
    await expect(card).toContainText('WebP（無損）');

    await page.getByRole('switch', { name: '無損' }).click();
    const q = page.getByRole('spinbutton', { name: '畫質' });
    await q.fill('50');
    await q.press('Enter');
    ({ bytes, card } = await exportAndDownload(page));
    w = riff(bytes);
    expect(w.frames.length).toBe(90);
    expect(new Set(w.frames.map((f) => f.sub))).toEqual(new Set(['VP8 ']));
    await expect(card).toContainText('WebP（有損・畫質 50%）');
    expect(errors).toEqual([]);
  });

  test('GIF：最多 50 FPS、每格各自的調色盤、色數上限、抖色', async ({ page }) => {
    const errors = await open(page);
    await loadClip(page);
    await pickSelect(page, 'FPS', '60 fps');
    await formatRadio(page, 'GIF').click();
    await expect(page.getByRole('combobox', { name: 'FPS' })).toHaveText('50 fps');
    await expect(page.getByTestId('export-estimate')).toContainText('3.00 秒 · 150 格');
    let { name, bytes, card } = await exportAndDownload(page);
    expect(name).toBe('video-anim-clip.gif');
    let gif = parseGif(bytes);
    expect(gif.loopCount).toBe(0);
    expect(gif.width).toBe(320);
    expect(gif.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(300);
    expect(gif.frames.every((f) => f.delayCs >= 2)).toBe(true);
    expect(gif.frames.every((f) => f.localPalette !== null || f === gif.frames[0])).toBe(true);
    await expect(card).toContainText('GIF（最多 256 色・Floyd–Steinberg 抖色）');
    await expect(card).toContainText('50 FPS・1.0 倍速・150 格');
    const dithered = bytes;

    await pickSelect(page, '顏色數上限', '64 色');
    await pickSelect(page, '抖色', /^不用/);
    ({ bytes, card } = await exportAndDownload(page));
    gif = parseGif(bytes);
    for (const f of gif.frames)
      expect(((f.localPalette ?? gif.globalPalette).length / 3) | 0).toBeLessThanOrEqual(64);
    expect(Buffer.from(bytes).equals(Buffer.from(dithered))).toBe(false);
    await expect(card).toContainText('GIF（最多 64 色・不抖色）');
    /* 回到 APNG 時仍是 60 FPS（GIF 顯示的 50 只是夾過的值） */
    await formatRadio(page, 'APNG').click();
    await expect(page.getByRole('combobox', { name: 'FPS' })).toHaveText('60 fps');
    expect(errors).toEqual([]);
  });

  test('24 FPS、2 倍速、裁切右上角、比例 50%：36 格、長度 1.5 秒、畫面是綠色象限', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadClip(page);
    await page.getByRole('switch', { name: '裁切' }).click();
    await setCropByDialog(page, { x: 160, y: 0, w: 160, h: 80 });
    await pickSelect(page, '解析度比例', /^50%/);
    await page.getByRole('radio', { name: '2.0x' }).click();
    await pickSelect(page, 'FPS', '24 fps');
    await expect(page.getByTestId('export-estimate')).toContainText('1.50 秒 · 36 格');
    const { bytes, card } = await exportAndDownload(page);
    const apng = parseApng(bytes);
    expect(apng.ihdr.width).toBe(80);
    expect(apng.ihdr.height).toBe(40);
    /* 裁掉了移動的方塊，畫面幾乎不變：相同的格合併（每格仍以 1/24 秒為單位、總長 1.5 秒） */
    expect(apng.frames.every((f) => f.delayDen === 24)).toBe(true);
    expect(apng.frames.reduce((s, f) => s + f.delayNum, 0)).toBe(36);
    const anim = await decodeAnimatedImage(bytes);
    const px = anim.frames[0].rgba;
    const k = (20 * 80 + 40) * 4;
    expect(px[k + 1]).toBeGreaterThan(150);
    expect(px[k]).toBeLessThan(100);
    await expect(card).toContainText('24 FPS・2.0 倍速・36 格');
    await expect(card).toContainText('1.50 秒');
    expect(errors).toEqual([]);
  });

  test('取消：不產生檔案、通知已取消', async ({ page }) => {
    await open(page);
    await loadClip(page);
    await pickSelect(page, 'FPS', '60 fps');
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(toast(page, '已取消轉換')).toBeVisible();
    await expect(page.getByRole('button', { name: '匯出 APNG' })).toBeVisible();
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    await expect(page.getByTestId('result-preview')).toHaveCount(0);
  });

  test('編碼用的背景處理載不到：匯出區顯示失敗並通知（不會一直停在準備中），之後可以再匯出', async ({
    page,
  }) => {
    const errors = await open(page);
    const worker = /\/encode\.worker-[^/]*\.js$/;
    let hits = 0;
    await page.route(worker, (r) => {
      hits++;
      return r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    });
    await loadClip(page);
    await pickSelect(page, 'FPS', '10 fps');
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    const alert = page.getByRole('alert').filter({ hasText: '匯出失敗' });
    await expect(alert).toContainText('背景處理無法執行，請重新整理頁面再試一次。', {
      timeout: 15_000,
    });
    expect(hits).toBeGreaterThan(0);
    await expect(toast(page, '轉換失敗')).toBeVisible();
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '匯出 APNG' })).toBeEnabled();
    /* Worker 檔案恢復後再匯出一次就成功 */
    await page.unroute(worker);
    const { bytes } = await exportAndDownload(page);
    expect(parseApng(bytes).numFrames).toBe(30);
    expect(errors.filter((e) => !/Failed to load resource|404/.test(e))).toEqual([]);
  });

  test.describe('結果的按鈕', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
    test('在新分頁開啟、複製資料網址', async ({ page, context }) => {
      await open(page);
      await loadClip(page);
      await pickSelect(page, 'FPS', '10 fps');
      await exportAndDownload(page);
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        page.getByRole('button', { name: '在新分頁開啟' }).click(),
      ]);
      await popup.waitForLoadState();
      expect(popup.url()).toMatch(/^blob:/);
      await popup.close();
      await page.getByRole('button', { name: '複製資料網址' }).click();
      await expect(toast(page, '資料網址已複製到剪貼簿')).toBeVisible();
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text.startsWith('data:image/png;base64,')).toBe(true);
    });
  });
});

test.describe('其他', () => {
  test('逐格檢視：選取區間的 12 張樣本', async ({ page }) => {
    const errors = await open(page);
    await loadClip(page);
    await page.getByRole('button', { name: /^逐格檢視/ }).click();
    await expect(page.getByTestId('frames-badge')).toHaveText('0 格');
    await page.getByRole('button', { name: '產生影格時間軸' }).click();
    const list = page.getByRole('list', { name: '選取區間的樣本影格' });
    await expect(list.getByRole('listitem')).toHaveCount(12);
    await expect(page.getByTestId('frames-badge')).toHaveText('12 格樣本');
    await expect(list.getByRole('listitem').first()).toContainText('0.0 s');
    await expect(list.getByRole('listitem').nth(4)).toContainText('1.0 s');
    await seekPreview(page, 1);
    await page.keyboard.press('[');
    await page.getByRole('button', { name: '產生影格時間軸' }).click();
    await expect(page.getByTestId('frames-badge')).toHaveText('12 格樣本');
    await expect(list.getByRole('listitem').first()).toContainText('1.0 s');
    expect(errors).toEqual([]);
  });

  test('設定記住（格式、FPS、比例、速度、畫質），影片不記住', async ({ page }) => {
    await open(page);
    await loadClip(page);
    await formatRadio(page, 'WebP').click();
    await pickSelect(page, 'FPS', '24 fps');
    await pickSelect(page, '解析度比例', /^50%/);
    await page.getByRole('radio', { name: '1.5x' }).click();
    await page.getByRole('switch', { name: '無損' }).click();
    await page.reload();
    await expect(
      page.getByRole('group', { name: '把影片檔拖到這裡，或點一下選擇檔案' }),
    ).toBeVisible();
    await loadClip(page);
    await expect(formatRadio(page, 'WebP')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('combobox', { name: 'FPS' })).toHaveText('24 fps');
    await expect(page.getByTestId('output-size')).toHaveText('輸出尺寸 160×90 px');
    await expect(page.getByRole('radio', { name: '1.5x' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: '無損' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: '裁切' })).not.toBeChecked();
  });

  test('格式比較：寬的地方是一張表；設定欄裡每種格式一張卡，GIF 也看得到、不用橫向捲動', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.getByRole('button', { name: /APNG／WebP／GIF 的比較/ }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByTestId('guide-cards')).toBeHidden();
    await loadClip(page);
    /* 載入後比較表在設定欄裡（展開狀態記住了）：改成三張卡 */
    const cards = page.getByTestId('guide-cards');
    await expect(cards).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    const items = cards.getByRole('listitem');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0).getByRole('heading', { name: 'APNG' })).toBeVisible();
    await expect(items.nth(1).getByRole('heading', { name: '動態 WebP' })).toBeVisible();
    await expect(items.nth(2).getByRole('heading', { name: 'GIF' })).toBeVisible();
    await expect(items.nth(2)).toContainText('只有全透明或不透明');
    await expect(items.nth(2)).toContainText('舊的軟體或服務、需要最廣的相容性');
    /* 每張卡都完整在欄內：沒有被裁掉、沒有橫向捲動 */
    const fit = await cards.evaluate((ul) => {
      const box = ul.getBoundingClientRect();
      let el: Element | null = ul;
      const scrollers: string[] = [];
      while (el) {
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible')
          scrollers.push(el.tagName);
        el = el.parentElement;
      }
      return {
        inside: [...ul.children].every((li) => {
          const r = li.getBoundingClientRect();
          return (
            r.left >= box.left - 0.5 &&
            r.right <= box.right + 0.5 &&
            li.scrollWidth <= li.clientWidth
          );
        }),
        scrollers,
      };
    });
    expect(fit).toEqual({ inside: true, scrollers: [] });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('快捷鍵說明', async ({ page }) => {
    await open(page);
    await page.keyboard.press('?');
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('播放／暫停');
    await expect(dlg).toContainText('以目前位置為起點');
    await expect(dlg).toContainText('以目前位置為終點');
  });
});

test.describe('版面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await loadClip(page);
    await page.getByRole('switch', { name: '裁切' }).click();
    await dismissToasts(page);
    await page.mouse.move(0, 0);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('video-anim-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: /APNG／WebP／GIF 的比較/ }).click();
    await noHorizontalScroll(page);
    await loadClip(page);
    await noHorizontalScroll(page);
    await formatRadio(page, 'GIF').click();
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: /^逐格檢視/ }).click();
    await page.getByRole('button', { name: '產生影格時間軸' }).click();
    await expect(page.getByTestId('frames-badge')).toHaveText('12 格樣本');
    await noHorizontalScroll(page);
    await formatRadio(page, 'APNG').click();
    await dismissToasts(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('video-anim-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
