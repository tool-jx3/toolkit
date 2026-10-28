/**
 * 動態背景產生器（建置產物 tools/bg-motion/）的端對端測試：
 * - 開頁的預設值（E01、2.5 秒、標準、原始尺寸、循環、無濾鏡）、頁尾、沒有 console error；
 * - 載入：選檔（單張、多張）、拖放（拖曳經過的醒目狀態）、範例圖、圖片資訊、自動畫質與尺寸（標籤寫改畫質之後的像素）、
 *   不是圖片／讀不到的檔案（整批不載入、指出檔名、原本的圖片保留）；
 * - 效果：選取時秒數與循環換成預設、預覽從頭播放、再按一次取消（無動態）、方向鍵選取；
 * - 轉場順序（拖曳縮圖）、淡化順序（對調成淡入）；預覽像素（固定像素的黑邊、淡入的白色、透明淡化）；
 * - 匯出：WebP（解析 RIFF：影格數、整數毫秒延遲、循環、尺寸、有損、透明旗標）、第一格 PNG、APNG、GIF、取消、
 *   檔名欄改了就用新名稱、作廢；只套濾鏡的靜態 PNG；
 * - 快捷鍵、設定記住（圖片不記住）、390 寬沒有橫向捲動、1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { parseWebp } from '../../src/core/encode/webp';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { expectSameGifFrames, exportGifBeforeAfter } from '../helpers/gifCrop';
import { composeApng, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('bg-motion') ?? { id: 'bg-motion', status: 'next' })}/`;
const ACCEPT = 'image/png,image/jpeg,image/webp';

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
  await expect(page.getByRole('heading', { level: 1, name: '動態背景產生器' })).toBeVisible();
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 單色 PNG（pad：在 IEND 後面補上幾個位元組，讓檔案變大但照樣解碼） */
async function pngOf(w: number, h: number, rgb: number[], pad = 0): Promise<Buffer> {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  const png = Buffer.from(await encodePng(px, w, h));
  return pad ? Buffer.concat([png, Buffer.alloc(pad)]) : png;
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({
  name,
  mimeType,
  buffer,
});

const fileInput = (page: Page) => page.locator(`input[type=file][accept="${ACCEPT}"]`);
const status = (page: Page) => page.getByTestId('status');
const info = (page: Page) => page.getByTestId('image-info');
const effect = (page: Page, name: string) =>
  page
    .getByRole('radiogroup', { name: '動態效果' })
    .getByRole('radio', { name: new RegExp(`^${name}：`) });
const filter = (page: Page, name: string) =>
  page
    .getByRole('radiogroup', { name: '濾鏡' })
    .getByRole('radio', { name: new RegExp(`^${name}：`) });
const seconds = (page: Page) => page.getByRole('spinbutton', { name: '秒數' });
const loopSwitch = (page: Page) => page.getByRole('switch', { name: '循環播放' });

interface BgDebug {
  playing: boolean;
  time: number;
  seek: (t: number) => void;
  images: () => { name: string }[];
}
type W = { __bgMotion: BgDebug };
const isPlaying = (page: Page) => page.evaluate(() => (window as unknown as W).__bgMotion.playing);
const seekTo = (page: Page, t: number) =>
  page.evaluate((x) => (window as unknown as W).__bgMotion.seek(x), t);

/** 預覽畫布上（輸出座標）某一點的 RGBA */
const previewPixel = (page: Page, x: number, y: number) =>
  page.getByTestId('bg-preview').evaluate(
    (c: HTMLCanvasElement, [ox, oy]) => {
      const [w, h] = (c.dataset.output ?? '1x1').split('x').map(Number);
      const px = Math.min(c.width - 1, Math.floor((ox / w) * c.width));
      const py = Math.min(c.height - 1, Math.floor((oy / h) * c.height));
      return Array.from(c.getContext('2d')!.getImageData(px, py, 1, 1).data);
    },
    [x, y],
  );

/** WebP 動畫的結構：畫布尺寸、透明旗標、循環次數、各格延遲、是否有損 */
function webpInfo(bytes: Uint8Array) {
  const chunks = parseWebp(bytes);
  const vp8x = chunks.find((c) => c.fourcc === 'VP8X')!.data;
  const anim = chunks.find((c) => c.fourcc === 'ANIM')!.data;
  const u24 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8) | (d[o + 2] << 16);
  const frames = chunks
    .filter((c) => c.fourcc === 'ANMF')
    .map((c) => {
      /* 影格資料（16 位元組的標頭之後）是 ALPH／VP8／VP8L chunk */
      const kinds: string[] = [];
      for (let o = 16; o + 8 <= c.data.length; ) {
        kinds.push(String.fromCharCode(...c.data.subarray(o, o + 4)));
        const size =
          c.data[o + 4] | (c.data[o + 5] << 8) | (c.data[o + 6] << 16) | (c.data[o + 7] << 24);
        o += 8 + size + (size & 1);
      }
      return {
        x: u24(c.data, 0) * 2,
        y: u24(c.data, 3) * 2,
        w: u24(c.data, 6) + 1,
        h: u24(c.data, 9) + 1,
        ms: u24(c.data, 12),
        lossy: kinds.includes('VP8 '),
      };
    });
  return {
    width: u24(vp8x, 4) + 1,
    height: u24(vp8x, 7) + 1,
    alpha: !!(vp8x[0] & 0x10),
    animation: !!(vp8x[0] & 0x02),
    loops: anim[4] | (anim[5] << 8),
    frames,
  };
}

/** 選格式與 FPS，按匯出，等結果卡出現後下載 */
async function exportAs(page: Page, format: string, fps?: number) {
  await page.getByRole('radio', { name: format, exact: true }).click();
  if (fps) {
    await page.getByRole('combobox').filter({ hasText: 'fps' }).click();
    await page.getByRole('option', { name: `${fps} fps` }).click();
  }
  await page.getByRole('button', { name: new RegExp(`^匯出 ${format}`) }).click();
  const card = page.getByTestId('export-result').first();
  await expect(card).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  const bytes = readFileSync(await download.path());
  return { name: download.suggestedFilename(), bytes: new Uint8Array(bytes) };
}

async function downloadFirstFrame(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-first').click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync(await download.path())),
  };
}

test.describe('一般操作', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('開頁的預設值、頁尾、沒有圖片時的預覽', async ({ page }) => {
    const errors = await open(page);
    await expect(effect(page, '上下震盪')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radiogroup', { name: '動態效果' }).getByRole('radio')).toHaveCount(
      24,
    );
    /* 主控裁定：開頁就套用 E01 的預設 2.5 秒 */
    await expect(seconds(page)).toHaveValue('2.5');
    await expect(page.getByRole('radio', { name: '標準', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('combobox', { name: '圖片尺寸' })).toHaveText(/原始尺寸/);
    await expect(loopSwitch(page)).toBeChecked();
    await expect(page.getByTestId('file-name')).toHaveValue('bg_motion_上下震盪_無_循環');
    await expect(info(page)).toHaveText('還沒有載入圖片。');
    await expect(page.getByTestId('preview-empty')).toBeVisible();
    await expect(status(page)).toContainText('請先載入背景圖片');
    /* 5 MB 的說明一律顯示 */
    await expect(page.getByTestId('size-note')).toContainText('5 MB');
    /* 濾鏡分頁：「無」＋26 種，三組 */
    await page.getByRole('tab', { name: '濾鏡' }).click();
    await expect(page.getByRole('radiogroup', { name: '濾鏡' }).getByRole('radio')).toHaveCount(27);
    await expect(filter(page, '無')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('不會真的換掉天空')).toBeVisible();
    await expect(page.locator('footer')).toHaveText('靈感來源：くま。／TRPG WEBツール観測所');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://kumachansteps.github.io/trpg-web-tools/',
    );
    /* 沒有圖片時按播放只提示 */
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect(status(page)).toHaveText('請先載入圖片。');
    expect(errors).toEqual([]);
  });

  test('選檔載入：單張資訊、預覽停在第一格、尺寸選單的像素隨畫質改變', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('m1280.png', await pngOf(1280, 720, [40, 80, 160]))]);
    await expect(info(page)).toContainText('m1280.png');
    await expect(info(page)).toContainText('1280 × 720 px');
    await expect(info(page)).toContainText(/約 \d+ KB/);
    await expect(status(page)).toContainText('已載入圖片。畫質設為「標準」、原始尺寸。');
    await expect(page.getByTestId('preview-empty')).toHaveCount(0);
    expect(await isPlaying(page)).toBe(false);
    expect(await page.evaluate(() => (window as unknown as W).__bgMotion.time)).toBe(0);
    await expect(page.getByTestId('bg-preview')).toHaveAttribute('data-output', '1280x720');
    await expect(page.getByTestId('file-name')).toHaveValue('m1280_上下震盪_無_循環');
    /* 尺寸選單：數字隨畫質改變 */
    await page.getByRole('radio', { name: '最小', exact: true }).click();
    await expect(page.getByTestId('bg-preview')).toHaveAttribute('data-output', '768x432');
    await page.getByRole('combobox', { name: '圖片尺寸' }).click();
    await expect(page.getByRole('option', { name: '4:3（640 × 480）' })).toBeVisible();
    await page.getByRole('option', { name: '1:1（640 × 640）' }).click();
    await expect(page.getByTestId('bg-preview')).toHaveAttribute('data-output', '640x640');
    await page.getByRole('radio', { name: '高畫質', exact: true }).click();
    await expect(page.getByTestId('bg-preview')).toHaveAttribute('data-output', '1600x1600');
    expect(errors).toEqual([]);
  });

  test('自動畫質與尺寸：依最大的檔案（狀態列與選單寫改畫質之後的像素）', async ({ page }) => {
    const errors = await open(page);
    const mb = 1024 * 1024;
    const base = await pngOf(1240, 900, [90, 90, 90]);
    await fileInput(page).setInputFiles([
      file('big.png', await pngOf(1240, 900, [90, 90, 90], 1.2 * mb - base.length)),
    ]);
    await expect(status(page)).toContainText('檔案超過 1 MB，畫質自動改為「輕量」。');
    await expect(page.getByRole('radio', { name: '輕量', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await fileInput(page).setInputFiles([
      file('big3.png', await pngOf(1240, 900, [90, 90, 90], 3.1 * mb - base.length)),
    ]);
    await expect(status(page)).toContainText('畫質自動改為「輕量」、尺寸改為 4:3（800 × 600）');
    await expect(page.getByRole('combobox', { name: '圖片尺寸' })).toHaveText(/4:3（800 × 600）/);
    await fileInput(page).setInputFiles([
      file('small.png', await pngOf(1280, 720, [10, 10, 10])),
      file('big6.png', await pngOf(1240, 900, [90, 90, 90], 6.1 * mb - base.length)),
    ]);
    /* 多張以第一張（1280 × 720）挑比例 */
    await expect(status(page)).toContainText('畫質自動改為「最小」、尺寸改為 16:9（768 × 432）');
    await expect(page.getByTestId('bg-preview')).toHaveAttribute('data-output', '768x432');
    expect(errors).toEqual([]);
  });

  test('載入失敗：不是圖片、讀不到的圖片（整批不載入、原本的圖片保留）', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('note.txt', Buffer.from('hello'), 'text/plain')]);
    await expect(status(page)).toContainText('選到的檔案都不是圖片');
    await fileInput(page).setInputFiles([file('ok.png', await pngOf(640, 360, [200, 0, 0]))]);
    await expect(info(page)).toContainText('ok.png');
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 7),
    ]);
    await fileInput(page).setInputFiles([
      file('fine.png', await pngOf(320, 180, [0, 200, 0])),
      file('壞掉.png', broken),
    ]);
    await expect(status(page)).toContainText('無法讀取「壞掉.png」');
    await expect(info(page)).toContainText('ok.png');
    expect(await page.evaluate(() => (window as unknown as W).__bgMotion.images().length)).toBe(1);
    const filtered = errors.filter((e) => !/Failed to load resource|ERR_/.test(e));
    expect(filtered).toEqual([]);
  });

  test('拖放載入：拖曳經過時醒目、放開後恢復並載入（GIF 也收）', async ({ page }) => {
    const errors = await open(page);
    const zone = page.getByRole('group', { name: '把圖片拖到這裡，或點一下選擇檔案' });
    const dt = await page.evaluateHandle(async () => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 100;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#336699';
      ctx.fillRect(0, 0, 200, 100);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      const d = new DataTransfer();
      d.items.add(new File([blob], 'drop.gif', { type: 'image/gif' }));
      return d;
    });
    await zone.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(zone).toHaveAttribute('data-over', 'true');
    await zone.dispatchEvent('drop', { dataTransfer: dt });
    await expect(zone).not.toHaveAttribute('data-over', 'true');
    await expect(info(page)).toContainText('drop.gif');
    await expect(info(page)).toContainText('200 × 100 px');
    expect(errors).toEqual([]);
  });

  test('範例圖：本站畫的 2048 × 1536 夜景', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '範例圖' }).click();
    await expect(status(page)).toHaveText('範例圖已就緒，選一個效果試試看。');
    await expect(info(page)).toContainText('2048 × 1536 px');
    await expect(page.getByTestId('bg-preview')).toHaveAttribute('data-output', '1024x768');
    expect(errors).toEqual([]);
  });

  test('選效果：秒數與循環換成預設、從頭播放；再按一次取消（無動態）；方向鍵選取', async ({
    page,
  }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('a.png', await pngOf(640, 360, [200, 60, 60]))]);
    await effect(page, '鏡頭推近').click();
    await expect(seconds(page)).toHaveValue('3');
    await expect(loopSwitch(page)).not.toBeChecked();
    await expect(status(page)).toContainText('已選擇「鏡頭推近」（單次）');
    await expect.poll(() => isPlaying(page)).toBe(true);
    await expect(page.getByTestId('file-name')).toHaveValue('a_鏡頭推近_無_單次');
    /* 預覽依循環設定：不循環時播完停在最後（主控裁定） */
    await seekTo(page, 2.9);
    await expect.poll(() => isPlaying(page)).toBe(false);
    expect(await page.evaluate(() => (window as unknown as W).__bgMotion.time)).toBe(3);
    await effect(page, '來回橫移').click();
    await expect(seconds(page)).toHaveValue('4');
    await expect(loopSwitch(page)).toBeChecked();
    await effect(page, '往上滑出').click();
    await expect(seconds(page)).toHaveValue('1.5');
    /* 再按一次：無動態 */
    await effect(page, '往上滑出').click();
    await expect(
      page.getByRole('radiogroup', { name: '動態效果' }).locator('[aria-checked="true"]'),
    ).toHaveCount(0);
    await expect(status(page)).toContainText('已取消動態（無動態）');
    await expect(page.getByTestId('file-name')).toHaveValue('a_無動態_無_單次');
    expect(await isPlaying(page)).toBe(false);
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect(status(page)).toHaveText('目前沒有選擇動態效果。');
    /* 方向鍵：→ 下一張並選取，← 上一張 */
    await effect(page, '上下震盪').click();
    await effect(page, '上下震盪').focus();
    await page.keyboard.press('ArrowRight');
    await expect(effect(page, '左右震盪')).toHaveAttribute('aria-checked', 'true');
    await expect(effect(page, '左右震盪')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(effect(page, '上下震盪')).toHaveAttribute('aria-checked', 'true');
    /* Tab 離開格子（標準的單選格） */
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radiogroup', { name: '動態效果' }).locator(':focus')).toHaveCount(
      0,
    );
    /* 秒數：不是 0.5 倍數照用；空白當成 3 秒 */
    await seconds(page).fill('1.3');
    await expect(page.getByTestId('output-size')).toContainText('1.3 秒');
    await seconds(page).fill('');
    await expect(page.getByTestId('output-size')).toContainText('3 秒');
    await seconds(page).fill('99');
    await expect(page.getByTestId('output-size')).toContainText('12 秒');
    expect(errors).toEqual([]);
  });

  test('預覽是輸出的等比縮圖：上下震盪的黑邊、淡入的白色、透明淡化', { tag: '@serial' }, async ({
    page,
  }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('red.png', await pngOf(640, 360, [220, 30, 30]))]);
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    /* E01 在 t＝0.25（2.5 秒的 0.625 秒）往下 18 px：上方 18 px 是黑邊 */
    await seekTo(page, 0.625);
    await expect.poll(() => previewPixel(page, 320, 8)).toEqual([0, 0, 0, 255]);
    expect((await previewPixel(page, 320, 24)).slice(0, 3)).toEqual([220, 30, 30]);
    /* 淡化到白，換成「顏色 → 圖片」（淡入）：t＝0 時整片白 */
    await effect(page, '淡化到白').click();
    const order = page.getByRole('list', { name: '淡化的順序' });
    await expect(order.getByRole('listitem')).toHaveCount(2);
    await expect(order.getByRole('listitem').first()).toContainText('red.png');
    await expect(order.getByRole('listitem').nth(1)).toContainText('白色');
    const a = order.getByRole('listitem').first();
    const b = order.getByRole('listitem').nth(1);
    await b.dragTo(a);
    await expect(status(page)).toHaveText('已改成淡入（顏色 → 圖片）。');
    await expect(order.getByRole('listitem').first()).toContainText('白色');
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    await seekTo(page, 0);
    await expect.poll(() => previewPixel(page, 320, 180)).toEqual([255, 255, 255, 255]);
    await seekTo(page, 2);
    await expect.poll(() => previewPixel(page, 320, 180)).toEqual([220, 30, 30, 255]);
    /* 換效果時淡化順序回到預設 */
    await effect(page, '淡化到透明').click();
    await expect(order.getByRole('listitem').first()).toContainText('red.png');
    await expect(order.getByRole('listitem').nth(1)).toContainText('透明');
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    await seekTo(page, 1);
    /* 單純降低不透明度：t＝0.5 時約一半透明、顏色不變 */
    await expect.poll(async () => (await previewPixel(page, 320, 180))[3]).toBeGreaterThan(120);
    const px = await previewPixel(page, 320, 180);
    expect(px[3]).toBeLessThan(135);
    expect(Math.abs(px[0] - 220)).toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
  });

  test('多張：資訊、轉場順序拖曳排序、單張沒有濾鏡時的提示', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([
      file('a.png', await pngOf(640, 360, [200, 60, 60])),
      file('b.png', await pngOf(800, 450, [60, 60, 200])),
      file('c.png', await pngOf(320, 180, [60, 200, 60])),
      file('d.png', await pngOf(320, 180, [9, 9, 9])),
    ]);
    await expect(info(page)).toContainText('共 4 張・第一張 640 × 360 px');
    await expect(info(page)).toContainText('…還有 1 張');
    await expect(status(page)).toContainText('已載入 4 張圖片');
    await expect(page.getByTestId('file-name')).toHaveValue('a_and_3_more_上下震盪_無_循環');
    /* 非轉場效果不顯示順序卡 */
    await expect(page.getByRole('list', { name: '轉場的圖片順序' })).toHaveCount(0);
    await effect(page, '交叉溶接').click();
    await expect(status(page)).toContainText('會依目前順序疊化切換 4 張圖片');
    const list = page.getByRole('list', { name: '轉場的圖片順序' });
    await expect(list.getByRole('listitem')).toHaveCount(4);
    await expect(list.getByRole('listitem').first()).toContainText('1. a.png');
    await list.getByRole('listitem').nth(2).dragTo(list.getByRole('listitem').first());
    await expect(list.getByRole('listitem').first()).toContainText('1. c.png');
    await expect(status(page)).toContainText('已調整順序');
    await expect(info(page)).toContainText('第一張 320 × 180 px');
    /* 原檔名段不因排序改變 */
    await expect(page.getByTestId('file-name')).toHaveValue('a_and_3_more_交叉溶接_無_循環');
    /* 只有 1 張：轉場需要 2 張以上（或加濾鏡） */
    await fileInput(page).setInputFiles([file('solo.png', await pngOf(320, 180, [200, 60, 60]))]);
    await effect(page, '左右擦除').click();
    await expect(status(page)).toContainText('轉場需要 2 張以上的圖片');
    await page.getByRole('tab', { name: '濾鏡' }).click();
    await filter(page, '黑白').click();
    await expect(status(page)).toContainText('會從原圖過渡到套用「黑白」的圖');
    expect(errors).toEqual([]);
  });

  test('清除：圖片與濾鏡回到預設，效果與輸出設定不變', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('a.png', await pngOf(640, 360, [200, 60, 60]))]);
    await effect(page, '呼吸脹縮').click();
    await page.getByRole('radio', { name: '輕量', exact: true }).click();
    await page.getByRole('tab', { name: '濾鏡' }).click();
    await filter(page, '入夜').click();
    await expect(page.getByTestId('file-name')).toHaveValue('a_呼吸脹縮_入夜_循環');
    await page.getByRole('button', { name: '清除' }).click();
    await expect(status(page)).toContainText('已清除圖片與濾鏡');
    await expect(info(page)).toHaveText('還沒有載入圖片。');
    await expect(filter(page, '無')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('file-name')).toHaveValue('bg_motion_呼吸脹縮_無_循環');
    await expect(page.getByRole('radio', { name: '輕量', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('tab', { name: '動態' }).click();
    await expect(effect(page, '呼吸脹縮')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  });
});

test.describe('匯出', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('WebP 24 FPS：影格數、整數毫秒延遲、無限循環、尺寸、有損；第一格 PNG；作廢', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 還沒匯出時，第一格 PNG 只提示 */
    await page.getByTestId('download-first').click({ force: true });
    await expect(page.getByText('請先匯出', { exact: true })).toBeVisible();
    await fileInput(page).setInputFiles([file('m640.png', await pngOf(640, 360, [40, 120, 200]))]);
    const w = await exportAs(page, 'WebP', 24);
    expect(w.name).toBe('m640_上下震盪_無_循環.webp');
    const i = webpInfo(w.bytes);
    expect(i).toMatchObject({ width: 640, height: 360, alpha: false, animation: true, loops: 0 });
    /* 2.5 秒 × 24 FPS＝60 格；前 40 格 42 ms、後 20 格 41 ms（相同的格會合併、延遲相加） */
    const want = [...Array.from({ length: 40 }, () => 42), ...Array.from({ length: 20 }, () => 41)];
    /* 畫面相同的連續格合併成一格：每一格的延遲是原本連續幾格的和 */
    let k = 0;
    for (const f of i.frames) {
      let acc = 0;
      while (acc < f.ms && k < want.length) acc += want[k++];
      expect(acc).toBe(f.ms);
    }
    expect(k).toBe(60);
    expect(i.frames.every((f) => f.lossy)).toBe(true);
    await expect(page.getByTestId('export-result')).toContainText('60 格');
    await expect(status(page)).toContainText('已完成：m640_上下震盪_無_循環.webp（');
    await expect(status(page)).toContainText('上下震盪・循環・2.5 秒・24 FPS・標準・640 × 360');
    await expect(status(page)).toContainText('實際播放速度以使用的環境為準');
    const first = await downloadFirstFrame(page);
    expect(first.name).toBe('m640_上下震盪_無_循環_frame01.png');
    const ihdr = readIhdr(parseChunks(first.bytes));
    expect(ihdr).toMatchObject({ width: 640, height: 360, bitDepth: 8, colorType: 6 });
    /* 改秒數：結果作廢（結果卡清掉、第一格 PNG 只提示） */
    await seconds(page).fill('3');
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    await page.getByTestId('download-first').click({ force: true });
    await expect(page.getByText('請先匯出', { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('不循環、60 FPS、自訂檔名；APNG 與 GIF', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('s.png', await pngOf(320, 180, [200, 200, 40]))]);
    await effect(page, '淡化到黑').click();
    await page.getByTestId('file-name').fill('雨夜 片頭');
    const w = await exportAs(page, 'WebP', 60);
    expect(w.name).toBe('雨夜_片頭.webp');
    const i = webpInfo(w.bytes);
    expect(i.loops).toBe(1);
    /* 2 秒 × 60＝120 格：前 80 格 17 ms、後 40 格 16 ms */
    /* 開頭與結尾幾格畫面相同、合併成一格（延遲相加），總長仍是 2 秒 */
    expect(i.frames.reduce((a, f) => a + f.ms, 0)).toBe(2000);
    expect(i.frames.at(-1)?.ms).toBeGreaterThanOrEqual(16);
    await expect(page.getByTestId('export-result')).toContainText('120 格');
    const apng = await exportAs(page, 'APNG', 24);
    expect(apng.name).toBe('雨夜_片頭.png');
    const a = parseApng(apng.bytes);
    expect(a.ihdr.width).toBe(320);
    expect(a.numPlays).toBe(1);
    expect(a.frames.length).toBeGreaterThan(40);
    const gif = await exportAs(page, 'GIF', 30);
    expect(gif.name).toBe('雨夜_片頭.gif');
    const g = parseGif(gif.bytes);
    expect(g.width).toBe(320);
    expect(g.height).toBe(180);
    /* 2 秒 × 30＝60 格，延遲以 1/100 秒累計，總長 2 秒 */
    expect(g.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(200);
    expect(errors).toEqual([]);
  });

  test('GIF 只寫變化的範圍（F109、5. D1）：解碼後每一格和改版前相同、檔案變小；淡化到透明照舊', async ({
    page,
  }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([
      file('a.png', await pngOf(320, 180, [200, 60, 40])),
      file('b.png', await pngOf(320, 180, [30, 90, 200])),
    ]);
    await effect(page, '左右擦除').click();
    const gif = async () => (await exportAs(page, 'GIF')).bytes;
    /* 擦除切換：每格只有擦過去的那一條在變 */
    const wipe = await exportGifBeforeAfter(page, gif);
    const s = await expectSameGifFrames(page, wipe.before, wipe.after, { cropped: true });
    expect(s.cropped).toBe(s.frames - 1);
    expect(s.after).toBeLessThan(s.before * 0.5);
    /* 淡化到透明（E21）：有透明像素，每格照舊寫整格（逐位元組相同） */
    await effect(page, '淡化到透明').click();
    const fade = await exportGifBeforeAfter(page, gif);
    await expectSameGifFrames(page, fade.before, fade.after, { cropped: false });
    expect(errors).toEqual([]);
  });

  test('對等修正：改畫質前的尺寸表挑比例、連番 PNG 一格一張、點通知本體關閉、檔名結尾的符號', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 自動比例照原作用「改畫質之前」（標準）的尺寸表打分：1199 × 1020 → 1:1（輕量的 800 × 800） */
    const mb = 1024 * 1024;
    const base = await pngOf(1199, 1020, [90, 90, 90]);
    await fileInput(page).setInputFiles([
      file('big3.png', await pngOf(1199, 1020, [90, 90, 90], 3.1 * mb - base.length)),
    ]);
    await expect(status(page)).toContainText('畫質自動改為「輕量」、尺寸改為 1:1（800 × 800）');
    await expect(page.getByRole('combobox', { name: '圖片尺寸' })).toHaveText(/1:1（800 × 800）/);
    /* 連番 PNG：60 FPS × 1 秒＝60 張（原作的張數＝影格數） */
    await fileInput(page).setInputFiles([file('z.png', await pngOf(160, 90, [40, 120, 200]))]);
    await effect(page, '鏡頭推近').click();
    await seconds(page).fill('1');
    await page.getByTestId('file-name').fill('我的 背景:測試*?');
    const zip = await exportAs(page, '連番 PNG', 60);
    expect(zip.name).toBe('我的_背景_測試_.zip');
    const pngs = Object.keys(unzipSync(zip.bytes)).filter((n) => n.endsWith('.png'));
    expect(pngs).toHaveLength(60);
    expect(pngs.some((n) => n.includes('__'))).toBe(false);
    /* 先用 × 關掉現有的通知（原本的關法照樣可用） */
    const closeButtons = page.getByRole('button', { name: '關閉通知' });
    while ((await closeButtons.count()) > 0) await closeButtons.first().click();
    /* 第一格 PNG：主體結尾是被換掉的符號時不會有兩個底線 */
    const first = await downloadFirstFrame(page);
    expect(first.name).toBe('我的_背景_測試_frame01.png');
    /* 通知：點本體立刻關閉（「已開始下載」原本停留 3.2 秒） */
    const toast = page.getByText('已開始下載', { exact: true });
    await expect(toast).toHaveCount(1);
    await toast.click();
    await expect(toast).toHaveCount(0, { timeout: 1500 });
    expect(errors).toEqual([]);
  });

  test('透明淡化：WebP 標示含透明；最後一格全透明', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('t.png', await pngOf(320, 180, [255, 255, 255]))]);
    await effect(page, '淡化到透明').click();
    const w = await exportAs(page, 'WebP', 24);
    const i = webpInfo(w.bytes);
    expect(i.alpha).toBe(true);
    expect(i.loops).toBe(1);
    expect(errors).toEqual([]);
  });

  test('取消匯出：狀態列與通知先說正在取消、再顯示已取消；清除按鈕在匯出中變成取消', async ({
    page,
  }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('big.png', await pngOf(1280, 720, [10, 90, 10]))]);
    await page.getByRole('radio', { name: '高畫質', exact: true }).click();
    await seconds(page).fill('12');
    await page.getByRole('combobox').filter({ hasText: 'fps' }).click();
    await page.getByRole('option', { name: '60 fps' }).click();
    await page.getByRole('button', { name: /^匯出 WebP/ }).click();
    await expect(page.getByText(/開始產生 60 FPS 的 WebP/).first()).toBeVisible();
    await expect(status(page)).toContainText(/正在產生 WebP：第 \d+／720 格/);
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
    const cancel = page.getByRole('button', { name: '取消', exact: true }).first();
    await page
      .getByRole('complementary', { name: '設定' })
      .getByRole('button', { name: '取消' })
      .click();
    await expect(status(page)).toHaveText('已取消匯出。');
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '清除' })).toBeVisible();
    await expect(cancel).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('只套濾鏡（無動態）：立刻可以下載套好濾鏡的靜態 PNG（輸出尺寸）', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('p.png', await pngOf(1280, 720, [200, 60, 60]))]);
    await effect(page, '上下震盪').click();
    await page.getByRole('tab', { name: '濾鏡' }).click();
    await expect(page.getByTestId('download-still')).toHaveCount(0);
    await filter(page, '黑白').click();
    await expect(status(page)).toContainText('已選擇濾鏡「黑白」');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-still').click(),
    ]);
    expect(download.suggestedFilename()).toBe('p_無動態_黑白_循環_still.png');
    const bytes = new Uint8Array(readFileSync(await download.path()));
    expect(readIhdr(parseChunks(bytes))).toMatchObject({ width: 1280, height: 720 });
    expect(errors).toEqual([]);
  });
});

test.describe('快捷鍵與存檔', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('Ctrl＋Shift＋P 播放／停止；Alt＋Shift＋F 以 30 FPS 匯出 WebP；Alt＋Shift＋T 切換深淺色', async ({
    page,
  }) => {
    const errors = await open(page);
    /* Ctrl＋Shift＋O：開啟選檔視窗 */
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press('Control+Shift+O'),
    ]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([file('k.png', await pngOf(320, 180, [80, 80, 80]))]);
    await expect(info(page)).toContainText('k.png');
    await page.keyboard.press('Control+Shift+P');
    await expect.poll(() => isPlaying(page)).toBe(true);
    await page.keyboard.press('Control+Shift+P');
    await expect.poll(() => isPlaying(page)).toBe(false);
    await page.getByRole('radio', { name: 'APNG', exact: true }).click();
    await page.keyboard.press('Alt+Shift+F');
    const card = page.getByTestId('export-result').first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText('.webp');
    await expect(card).toContainText('75 格');
    await expect(page.getByRole('combobox').filter({ hasText: 'fps' })).toHaveText(/30 fps/);
    const before = await page.evaluate(() => document.documentElement.dataset.theme ?? 'dark');
    await page.keyboard.press('Alt+Shift+T');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? 'dark'))
      .not.toBe(before);
    /* 快捷鍵一覽 */
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('以 24 FPS 匯出');
    await expect(dialog).toContainText('播放／停止預覽');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    /* Esc 不會清掉圖片（刻意改善） */
    await page.keyboard.press('Escape');
    await expect(info(page)).toContainText('k.png');
    expect(errors).toEqual([]);
  });

  test('設定記住（效果、秒數、畫質、尺寸、循環），圖片與濾鏡不記住', async ({ page }) => {
    const errors = await open(page);
    await fileInput(page).setInputFiles([file('r.png', await pngOf(320, 180, [80, 80, 80]))]);
    await effect(page, '水波扭曲').click();
    await seconds(page).fill('5');
    await page.getByRole('radio', { name: '高畫質', exact: true }).click();
    await loopSwitch(page).click();
    await page.getByRole('tab', { name: '濾鏡' }).click();
    await filter(page, '濃霧').click();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '動態背景產生器' })).toBeVisible();
    await expect(effect(page, '水波扭曲')).toHaveAttribute('aria-checked', 'true');
    await expect(seconds(page)).toHaveValue('5');
    await expect(page.getByRole('radio', { name: '高畫質', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(loopSwitch(page)).not.toBeChecked();
    await expect(info(page)).toHaveText('還沒有載入圖片。');
    await page.getByRole('tab', { name: '濾鏡' }).click();
    await expect(filter(page, '無')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  });
});

/* ---------- 圖片切換模式（2026-10，F110～F156） ---------- */

interface DeckData {
  slides: {
    uid: string;
    image: { id: string; name: string; width: number; height: number };
    hold: number;
    trans: string;
    dur: number;
  }[];
  bulk: { hold: number; trans: string; dur: number };
  intro: { trans: string; dur: number };
  outro: { trans: string; dur: number };
  width: number;
  height: number;
  fit: string;
  bg: string;
  transparent: boolean;
  loopBack: boolean;
  easing: string;
  seed: number;
  format: string;
  fps: number;
  quality: number;
  plays: number;
  capOn: boolean;
  capMb: number;
}
interface DeckHook {
  deck: () => DeckData;
  deckFrame: (t: number) => Promise<{ w: number; h: number; b64: string }>;
  deckLastExport: () => {
    q: number;
    fps: number;
    width: number;
    height: number;
    bytes: number;
    frames: number;
  }[];
  deckPlan: (fps: number) => {
    total: number;
    segs: { type: string; i: number; j?: number; kind?: string; start: number; dur: number }[];
    plan: { t: number; d: number }[];
  };
}
type DW = { __bgMotion: DeckHook };
const deckData = (page: Page) => page.evaluate(() => (window as unknown as DW).__bgMotion.deck());
const deckPlanOf = (page: Page, fps: number) =>
  page.evaluate((f) => (window as unknown as DW).__bgMotion.deckPlan(f), fps);

const deckInput = (page: Page) => page.locator('input[type=file][multiple]');
const rows = (page: Page) => page.getByTestId('deck-row');
const deckStats = (page: Page) => page.getByTestId('deck-stats');
const holdInput = (page: Page, n: number) =>
  page.getByRole('spinbutton', { name: `第 ${n} 張：顯示秒數` });
const durInput = (page: Page, n: number) =>
  page.getByRole('spinbutton', { name: `第 ${n} 張：切換秒數` });
const transButton = (page: Page, target: string) =>
  page.getByRole('button', { name: new RegExp(`^${target}的切換效果：`) });

async function setNum(input: ReturnType<Page['getByRole']>, v: number) {
  await input.fill(String(v));
  await input.press('Enter');
}

/** 開效果對話框、點一個效果（點下去就套用並關閉） */
async function pickTrans(page: Page, target: string, label: string) {
  await transButton(page, target).click();
  const dlg = page.getByRole('dialog', { name: /選擇切換效果/ });
  await dlg.getByRole('radio', { name: new RegExp(`^${label}：`) }).click();
  await expect(dlg).toHaveCount(0);
}

async function openDeck(page: Page) {
  const errors = await open(page);
  await page.getByRole('radio', { name: '圖片切換', exact: true }).click();
  await expect(page.getByTestId('deck-count')).toHaveText('共 0 張');
  return errors;
}

/** 預覽畫布上（輸出座標）某一點的 RGBA */
const deckPixel = (page: Page, x: number, y: number) =>
  page.getByTestId('deck-preview').evaluate(
    (c: HTMLCanvasElement, [ox, oy]) => {
      const [w, h] = (c.dataset.output ?? '1x1').split('x').map(Number);
      const px = Math.min(c.width - 1, Math.floor((ox / w) * c.width));
      const py = Math.min(c.height - 1, Math.floor((oy / h) * c.height));
      return Array.from(c.getContext('2d')!.getImageData(px, py, 1, 1).data);
    },
    [x, y],
  );
async function expectDeckColor(page: Page, x: number, y: number, rgb: number[], tol = 10) {
  await expect
    .poll(
      async () => {
        const p = await deckPixel(page, x, y);
        return Math.max(...rgb.map((v, i) => Math.abs(v - p[i])));
      },
      { timeout: 8000 },
    )
    .toBeLessThanOrEqual(tol);
}

const RED = [200, 0, 0];
const GREEN = [0, 160, 0];
const BLUE = [0, 0, 200];
const WHITE = [255, 255, 255];

async function addThree(page: Page) {
  await deckInput(page).setInputFiles([
    file('red.png', await pngOf(640, 360, RED)),
    file('green.png', await pngOf(640, 360, GREEN)),
    file('blue.png', await pngOf(640, 360, BLUE)),
  ]);
  await expect(rows(page)).toHaveCount(3);
}

/** 三張圖：顯示 1、1.5、2 秒；第 1 張→第 2 張＝滑入（從右）0.5 秒，第 2 張→第 3 張＝擦除（從左）0.4 秒 */
async function scenario(page: Page) {
  await addThree(page);
  await setNum(holdInput(page, 1), 1);
  await setNum(holdInput(page, 3), 2);
  await setNum(durInput(page, 1), 0.5);
  await setNum(durInput(page, 2), 0.4);
  await pickTrans(page, '第 1 張', '滑入（從右）');
  await pickTrans(page, '第 2 張', '擦除（從左）');
  await expect(deckStats(page)).toContainText('全體 5.4 秒・匯出 17 格・640 × 360 px');
}

/* 規格 3.11.3 的影格表：停住一格；0.5 秒切換 15 fps ＝ 8 格；0.4 秒 ＝ 6 格（累計取整的毫秒） */
const SCENARIO_DELAYS = [
  1000,
  ...[63, 62, 63, 62, 63, 62, 63, 62],
  1500,
  ...[67, 66, 67, 67, 66, 67],
  2000,
];

test.describe('圖片切換模式', () => {
  test.use({ viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

  test('模式切換（F110）：預設動態效果；兩個模式各自保留，來回不互相覆蓋；模式記住', async ({
    page,
  }) => {
    const errors = await open(page);
    await expect(page.getByRole('radio', { name: '動態效果', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    /* 動態效果模式：頁首沒有復原與專案選單 */
    await expect(page.getByRole('button', { name: /^復原/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '專案' })).toHaveCount(0);
    await fileInput(page).setInputFiles([file('m.png', await pngOf(320, 180, [10, 120, 200]))]);
    await effect(page, '水波扭曲').click();
    await page.getByRole('radio', { name: '圖片切換', exact: true }).click();
    await expect(page.getByTestId('deck-count')).toHaveText('共 0 張');
    await expect(page.getByTestId('deck-preview-empty')).toBeVisible();
    await expect(page.getByTestId('image-info')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^復原/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '專案' })).toBeVisible();
    await deckInput(page).setInputFiles([file('d1.png', await pngOf(320, 180, RED))]);
    await expect(rows(page)).toHaveCount(1);
    /* 回到動態效果：圖片與效果都還在 */
    await page.getByRole('radio', { name: '動態效果', exact: true }).click();
    await expect(info(page)).toContainText('m.png');
    await expect(effect(page, '水波扭曲')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: '專案' })).toHaveCount(0);
    /* 模式記住：重新整理停在上次的模式，圖片切換的內容也在 */
    await page.getByRole('radio', { name: '圖片切換', exact: true }).click();
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '動態背景產生器' })).toBeVisible();
    await expect(page.getByTestId('deck-count')).toHaveText('共 1 張');
    expect(errors).toEqual([]);
  });

  test('舊的設定存檔（只有動態效果的設定，資料版本 1）照常讀得到、模式是動態效果', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('seeded')) return;
      localStorage.setItem('seeded', '1');
      localStorage.setItem(
        'trpg-toolkit:bg-motion',
        JSON.stringify({
          state: {
            data: {
              effect: 'pan',
              secondsText: '4',
              quality: 'light',
              size: '16:9',
              loop: false,
              format: 'apng',
              fps: 30,
              quantize: true,
            },
          },
          version: 1,
        }),
      );
    });
    const errors = await open(page);
    await expect(effect(page, '來回橫移')).toHaveAttribute('aria-checked', 'true');
    await expect(seconds(page)).toHaveValue('4');
    await expect(page.getByRole('radio', { name: '輕量', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(loopSwitch(page)).not.toBeChecked();
    await expect(page.getByRole('radio', { name: '動態效果', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(errors).toEqual([]);
  });

  test('加入三張圖、個別設定秒數與效果：清單、時間軸與預覽的畫面', async ({ page }) => {
    const errors = await openDeck(page);
    await scenario(page);
    /* 第一次加入就照第一張的尺寸；新加入的圖片帶入「一次設定」的值 */
    const d = await deckData(page);
    expect([d.width, d.height]).toEqual([640, 360]);
    expect(d.slides.map((s) => [s.image.name, s.hold, s.trans, s.dur])).toEqual([
      ['red.png', 1, 'slideR', 0.5],
      ['green.png', 1.5, 'wipeL', 0.4],
      ['blue.png', 2, 'fade', 0.8],
    ]);
    await expect(rows(page).nth(0)).toContainText('red.png');
    await expect(rows(page).nth(0)).toContainText('640×360');
    await expect(transButton(page, '第 1 張')).toContainText('滑入（從右）');
    await expect(transButton(page, '第 2 張')).toContainText('擦除（從左）');
    /* 最後一張沒勾「切回第一張」：那一行淡掉並說明 */
    await expect(rows(page).nth(2).getByTestId('deck-conn')).toHaveAttribute('data-inactive', '');
    await expect(rows(page).nth(2)).toContainText('沒有勾選「最後一張切回第一張」');
    await expect(rows(page).nth(0).getByTestId('deck-conn')).not.toHaveAttribute(
      'data-inactive',
      '',
    );
    /* 時間軸（3.11.2）：5 段（3 個停住、2 個切換），起點 0、1、1.5、3、3.4 */
    const plan = await deckPlanOf(page, 15);
    expect(plan.segs.map((g) => [g.type, g.i, g.j ?? null, g.kind ?? null])).toEqual([
      ['hold', 0, null, null],
      ['trans', 0, 1, 'slideR'],
      ['hold', 1, null, null],
      ['trans', 1, 2, 'wipeL'],
      ['hold', 2, null, null],
    ]);
    expect(plan.segs.map((g) => Math.round(g.start * 1000) / 1000)).toEqual([0, 1, 1.5, 3, 3.4]);
    expect(plan.plan.map((f) => f.d)).toEqual(SCENARIO_DELAYS);
    expect(plan.total).toBeCloseTo(5.4, 9);
    /* 預覽：停住、滑入（從右）一半、擦除（從左）一半 */
    await expect(page.getByTestId('deck-preview')).toHaveAttribute('data-output', '640x360');
    expect(await isPlaying(page)).toBe(false);
    await seekTo(page, 0.5);
    await expectDeckColor(page, 320, 180, RED);
    await seekTo(page, 1.25);
    await expectDeckColor(page, 160, 180, RED);
    await expectDeckColor(page, 480, 180, GREEN);
    await seekTo(page, 2);
    await expectDeckColor(page, 320, 180, GREEN);
    await seekTo(page, 3.2);
    await expectDeckColor(page, 160, 180, BLUE);
    await expectDeckColor(page, 480, 180, GREEN);
    await seekTo(page, 4.5);
    await expectDeckColor(page, 320, 180, BLUE);
    /* 播放／暫停 */
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(() => isPlaying(page)).toBe(true);
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    await expect.poll(() => isPlaying(page)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('匯出 WebP、APNG、GIF：格數、尺寸、每格時間、循環；停住只存一格', async ({ page }) => {
    const errors = await openDeck(page);
    await scenario(page);
    const w = await exportAs(page, 'WebP');
    expect(w.name).toBe('red_and_2_more_切換.webp');
    const i = webpInfo(w.bytes);
    expect([i.width, i.height]).toEqual([640, 360]);
    expect(i.animation).toBe(true);
    expect(i.alpha).toBe(false);
    expect(i.loops).toBe(0);
    expect(i.frames.map((f) => f.ms)).toEqual(SCENARIO_DELAYS);
    expect(i.frames.every((f) => f.lossy)).toBe(true);
    await expect(page.getByTestId('export-result')).toContainText('17 格');
    await expect(page.getByTestId('export-result')).toContainText('5.40 秒');
    const apng = await exportAs(page, 'APNG');
    expect(apng.name).toBe('red_and_2_more_切換.png');
    const a = parseApng(apng.bytes);
    expect([a.ihdr.width, a.ihdr.height]).toEqual([640, 360]);
    expect(a.numPlays).toBe(0);
    expect(a.frames.map((f) => Math.round((f.delayNum * 1000) / f.delayDen))).toEqual(
      SCENARIO_DELAYS,
    );
    const gif = await exportAs(page, 'GIF');
    expect(gif.name).toBe('red_and_2_more_切換.gif');
    const g = parseGif(gif.bytes);
    expect([g.width, g.height]).toEqual([640, 360]);
    expect(g.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(540);
    /* 播放次數：指定 3 次 */
    await page.getByRole('switch', { name: '無限循環' }).click();
    await page.getByRole('spinbutton', { name: '播放次數' }).fill('3');
    await page.getByRole('spinbutton', { name: '播放次數' }).press('Enter');
    const w3 = await exportAs(page, 'WebP');
    expect(webpInfo(w3.bytes).loops).toBe(3);
    /* FPS 只影響切換段的影格數：10 fps ＝ 3 個停住 + 5 + 4 格 */
    const w10 = await exportAs(page, 'WebP', 10);
    expect(webpInfo(w10.bytes).frames).toHaveLength(3 + 5 + 4);
    expect(webpInfo(w10.bytes).frames.reduce((s, f) => s + f.ms, 0)).toBe(5400);
    expect(errors).toEqual([]);
  });

  test('匯出的 APNG（無損）逐格和計算的一致：停住是原色、切換的邊緣位置對得上', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await scenario(page);
    const apng = await exportAs(page, 'APNG');
    const a = parseApng(apng.bytes);
    expect(a.frames).toHaveLength(17);
    const frames = composeApng(a);
    const px = (k: number, x: number, y: number) => {
      const f = frames[k];
      const o = (y * 640 + x) * 4;
      return [f[o], f[o + 1], f[o + 2]];
    };
    /* 第 1 格＝紅；最後一格＝藍；第 2～9 格是滑入（從右）：第 5 格（k＝3）段內位置 4/9 */
    expect(px(0, 320, 180)).toEqual(RED);
    expect(px(16, 320, 180)).toEqual(BLUE);
    expect(px(9, 320, 180)).toEqual(GREEN);
    const u = 4 / 9;
    const p = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const edge = Math.round(640 * (1 - p));
    expect(px(4, edge - 6, 180)).toEqual(RED);
    expect(px(4, edge + 6, 180)).toEqual(GREEN);
    expect(errors).toEqual([]);
  });

  test('第一張出現、最後一張消失、只有一張圖也能用；切回第一張的規則（F121、F122）', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await deckInput(page).setInputFiles([file('one.png', await pngOf(640, 360, RED))]);
    await expect(rows(page)).toHaveCount(1);
    await expect(deckStats(page)).toContainText('全體 1.5 秒・匯出 1 格');
    /* 只有一張圖：最後一張的「切回第一張」沒有作用 */
    await expect(rows(page).nth(0).getByTestId('deck-conn')).toHaveAttribute('data-inactive', '');
    await expect(rows(page).nth(0)).toContainText('只有一張圖');
    await pickTrans(page, '第一張出現', '交叉溶接');
    /* 秒數預設 0.8：1.5 ＋ 0.8，格數 1 ＋ round(12) */
    await expect(deckStats(page)).toContainText('全體 2.3 秒・匯出 13 格');
    await setNum(page.getByRole('spinbutton', { name: '第一張出現：切換秒數' }), 0.5);
    await expect(deckStats(page)).toContainText('全體 2.0 秒・匯出 9 格');
    await pickTrans(page, '最後一張消失', '圓形收合');
    await setNum(page.getByRole('spinbutton', { name: '最後一張消失：切換秒數' }), 0.7);
    /* 停 1.5＋出現 0.5＋消失 0.7；格數 1 ＋ 8 ＋ round(10.5)＝11 */
    await expect(deckStats(page)).toContainText('全體 2.7 秒・匯出 20 格');
    /* 預覽：t＝0 是空白（白）、停住是紅、結尾又回到空白 */
    await seekTo(page, 0);
    await expectDeckColor(page, 320, 180, WHITE);
    await seekTo(page, 1.2);
    await expectDeckColor(page, 320, 180, RED);
    await seekTo(page, 2.7);
    await expectDeckColor(page, 320, 180, WHITE);
    const plan = await deckPlanOf(page, 15);
    expect(plan.segs.map((g) => [g.type, g.i, g.j ?? null, g.kind ?? null])).toEqual([
      ['trans', -1, 0, 'fade'],
      ['hold', 0, null, null],
      ['trans', 0, -1, 'circleClose'],
    ]);
    /* 第 2 張進來，勾「切回第一張」：有「最後一張消失」時不起作用（開關旁說明、那一行淡掉） */
    await deckInput(page).setInputFiles([file('two.png', await pngOf(640, 360, GREEN))]);
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('switch', { name: '最後一張切回第一張' }).click();
    await expect(page.getByText('目前有設「最後一張消失」，這個選項不會用到。')).toBeVisible();
    await expect(rows(page).nth(1).getByTestId('deck-conn')).toHaveAttribute('data-inactive', '');
    await expect(rows(page).nth(1)).toContainText('有設定「最後一張消失」');
    expect((await deckPlanOf(page, 15)).segs.at(-1)).toMatchObject({ type: 'trans', i: 1, j: -1 });
    /* 把「最後一張消失」設成無：切回第一張生效，最後一行不再淡掉 */
    await pickTrans(page, '最後一張消失', '無');
    await expect(rows(page).nth(1).getByTestId('deck-conn')).not.toHaveAttribute(
      'data-inactive',
      '',
    );
    expect((await deckPlanOf(page, 15)).segs.at(-1)).toMatchObject({ type: 'trans', i: 1, j: 0 });
    expect(errors).toEqual([]);
  });

  test('隨機分配與重新抽籤（F120）：抽到的效果由序號和種子決定，同一組設定每次一樣', async ({
    page,
  }) => {
    /* 規格 3.11.7：24 個效果裡第 (7k + 3 + 種子) mod 24 個（k 從 0 起算） */
    const POOL = [
      '交叉溶接',
      '經過黑色',
      '經過白色',
      '滑入從右',
      '滑入從左',
      '滑入從下',
      '滑入從上',
      '蓋過從右',
      '蓋過從左',
      '蓋過從下',
      '蓋過從上',
      '擦除從右',
      '擦除從左',
      '擦除從下',
      '擦除從上',
      '放大',
      '縮小',
      '圓形展開',
      '圓形收合',
      '百葉窗直',
      '百葉窗橫',
      '模糊',
      '馬賽克',
      '翻牌',
    ];
    const errors = await openDeck(page);
    await addThree(page);
    const picked = async () => {
      const seed = (await deckData(page)).seed;
      const names = await page.getByTestId('picked-kind').allInnerTexts();
      return { seed, names: names.map((n) => n.replace(/[（）]|抽到：/g, '')) };
    };
    /* 第 3 張是最後一張，它的效果沒有作用，但按鈕上仍寫出抽到什麼 */
    const expected = (seed: number) => [0, 1, 2].map((k) => POOL[(7 * k + 3 + seed) % 24]);
    await page.getByRole('button', { name: '隨機分配', exact: true }).click();
    let r = await picked();
    expect((await deckData(page)).slides.map((s) => s.trans)).toEqual([
      'random',
      'random',
      'random',
    ]);
    expect(r.names).toEqual(expected(r.seed));
    await page.getByRole('button', { name: '重新抽籤', exact: true }).click();
    const r2 = await picked();
    expect(r2.seed).not.toBe(r.seed);
    expect(r2.names).toEqual(expected(r2.seed));
    const kinds = (await deckPlanOf(page, 15)).segs
      .filter((g) => g.type === 'trans')
      .map((g) => g.kind);
    expect(kinds).toHaveLength(2);
    /* 同一組設定每次都一樣：重新整理後種子與抽到的效果不變 */
    await page.waitForTimeout(500);
    await page.reload();
    await expect(rows(page)).toHaveCount(3);
    r = await picked();
    expect(r.seed).toBe(r2.seed);
    expect(r.names).toEqual(r2.names);
    expect(
      (await deckPlanOf(page, 15)).segs.filter((g) => g.type === 'trans').map((g) => g.kind),
    ).toEqual(kinds);
    expect(errors).toEqual([]);
  });

  test('一次設定與全部套用；新加入的圖片帶入一次設定；排序、複製、移除；復原', async ({ page }) => {
    const errors = await openDeck(page);
    await addThree(page);
    /* 一次設定改了不動到已有的圖片 */
    await setNum(page.getByRole('spinbutton', { name: '一次設定：顯示秒數' }), 2.5);
    await setNum(page.getByRole('spinbutton', { name: '一次設定：切換秒數' }), 0.3);
    await pickTrans(page, '一次設定', '縮小');
    expect((await deckData(page)).slides.map((s) => [s.hold, s.trans, s.dur])).toEqual([
      [1.5, 'fade', 0.8],
      [1.5, 'fade', 0.8],
      [1.5, 'fade', 0.8],
    ]);
    await page.getByRole('button', { name: '全部套用', exact: true }).click();
    expect((await deckData(page)).slides.map((s) => [s.hold, s.trans, s.dur])).toEqual([
      [2.5, 'zoomOut', 0.3],
      [2.5, 'zoomOut', 0.3],
      [2.5, 'zoomOut', 0.3],
    ]);
    await expect(holdInput(page, 2)).toHaveValue('2.5');
    await expect(transButton(page, '第 3 張')).toContainText('縮小');
    /* 新加入的圖片帶入一次設定 */
    await deckInput(page).setInputFiles([file('new.png', await pngOf(320, 180, [90, 90, 90]))]);
    await expect(rows(page)).toHaveCount(4);
    expect((await deckData(page)).slides[3]).toMatchObject({
      hold: 2.5,
      trans: 'zoomOut',
      dur: 0.3,
    });
    /* 排序：上移、下移，每張的設定跟著圖走 */
    await setNum(holdInput(page, 1), 4);
    const names = async () => (await deckData(page)).slides.map((s) => s.image.name);
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: '下移第 1 張：red.png' }).click();
    expect(await names()).toEqual(['green.png', 'red.png', 'blue.png', 'new.png']);
    await expect(holdInput(page, 2)).toHaveValue('4');
    await page.getByRole('button', { name: '上移第 4 張：new.png' }).click();
    expect(await names()).toEqual(['green.png', 'red.png', 'new.png', 'blue.png']);
    await expect(page.getByRole('button', { name: /^上移第 1 張/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^下移第 4 張/ })).toBeDisabled();
    /* 拖曳把手排序：把第 1 列拖到最後 */
    const handle = rows(page).nth(0).locator('[data-drag-handle]');
    const hb = (await handle.boundingBox())!;
    const target = (await rows(page).nth(3).boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 6, hb.y + 30, { steps: 4 });
    await page.mouse.move(hb.x + 6, target.y + target.height - 6, { steps: 16 });
    await page.mouse.up();
    await expect.poll(names).toEqual(['red.png', 'new.png', 'blue.png', 'green.png']);
    /* 複製：同一張圖多一列，設定一樣，不重複存圖 */
    await page.getByRole('button', { name: '複製第 2 張：new.png' }).click();
    await expect(rows(page)).toHaveCount(5);
    const d = await deckData(page);
    expect(d.slides[2].image.name).toBe('new.png');
    expect(d.slides[2].image.id).toBe(d.slides[1].image.id);
    expect(d.slides[2].uid).not.toBe(d.slides[1].uid);
    /* 移除，然後復原、重做 */
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: '移除第 3 張：new.png' }).click();
    await expect(rows(page)).toHaveCount(4);
    await expect(page.getByTestId('deck-count')).toHaveText('共 4 張');
    await page.getByRole('button', { name: /^復原/ }).click();
    await expect(rows(page)).toHaveCount(5);
    await page.getByRole('button', { name: /^重做/ }).click();
    await expect(rows(page)).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('看效果選：26 個效果、方向鍵移動不套用、點一下或 Enter 才套用並關閉、Esc 放棄', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await addThree(page);
    await transButton(page, '第 1 張').click();
    const dlg = page.getByRole('dialog', { name: /選擇切換效果：第 1 張/ });
    const grid = dlg.getByRole('radiogroup', { name: '切換效果' });
    await expect(grid.getByRole('radio')).toHaveCount(26);
    await expect(grid.getByRole('radio', { name: /^交叉溶接：/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(grid.locator('canvas').first()).toBeVisible();
    /* 方向鍵移動：選取跟著動，但還沒套用 */
    await grid.getByRole('radio', { name: /^交叉溶接：/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(grid.getByRole('radio', { name: /^經過黑色：/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect((await deckData(page)).slides[0].trans).toBe('fade');
    /* Esc：放棄 */
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    expect((await deckData(page)).slides[0].trans).toBe('fade');
    /* Enter：套用並關閉 */
    await transButton(page, '第 1 張').click();
    await grid.getByRole('radio', { name: /^交叉溶接：/ }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(dlg).toHaveCount(0);
    expect((await deckData(page)).slides[0].trans).toBe('dipblack');
    /* 第一張出現：「不切換」顯示成「無」 */
    await transButton(page, '第一張出現').click();
    const grid2 = page.getByRole('dialog').getByRole('radiogroup', { name: '切換效果' });
    await expect(grid2.getByRole('radio', { name: /^無：/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(grid2.getByRole('radio', { name: /^不切換：/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('整體設定：尺寸（預設尺寸、照第一張）、放法、背景與透明、緩急曲線；預覽依設定', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await deckInput(page).setInputFiles([
      file('wide.png', await pngOf(1600, 900, RED)),
      file('tall.png', await pngOf(300, 600, GREEN)),
    ]);
    await expect(rows(page)).toHaveCount(2);
    /* 清單原本是空的：第一次加入後尺寸照第一張（長邊超過 800 時縮小到 800） */
    await expect(page.getByTestId('deck-preview')).toHaveAttribute('data-output', '800x450');
    await page.getByRole('combobox', { name: '預設尺寸' }).click();
    await page.getByRole('option', { name: '400 × 400' }).click();
    await expect(page.getByTestId('deck-preview')).toHaveAttribute('data-output', '400x400');
    await page.getByRole('button', { name: '照第一張' }).click();
    await expect(page.getByTestId('deck-preview')).toHaveAttribute('data-output', '800x450');
    const width = page.getByRole('spinbutton', { name: '寬' });
    const height = page.getByRole('spinbutton', { name: '高' });
    await setNum(width, 100);
    await setNum(height, 100);
    await expect(page.getByTestId('deck-preview')).toHaveAttribute('data-output', '100x100');
    await setNum(width, 99999);
    await expect(width).toHaveValue('4096');
    await setNum(width, 100);
    /* 第 2 張（直式）在 100 × 100：完整放入＝高度滿、左右留白（背景白）；填滿＝蓋滿 */
    await setNum(holdInput(page, 1), 0.5);
    await seekTo(page, 0.5 + 0.8 + 0.1);
    await expectDeckColor(page, 50, 50, GREEN);
    await expectDeckColor(page, 5, 50, WHITE);
    await page.getByRole('radio', { name: '填滿', exact: true }).click();
    await expectDeckColor(page, 5, 50, GREEN);
    await page.getByRole('radio', { name: '完整放入', exact: true }).click();
    /* 背景色 */
    const color = page.getByRole('textbox', { name: '背景' });
    await color.fill('#336699');
    await color.press('Enter');
    await expectDeckColor(page, 5, 50, [0x33, 0x66, 0x99]);
    /* 透明：留白變透明（預覽畫布的 alpha＝0） */
    await page.getByRole('switch', { name: '透明' }).click();
    await expect.poll(async () => (await deckPixel(page, 5, 50))[3]).toBe(0);
    /* 緩急曲線三選一 */
    await page.getByRole('radio', { name: '等速', exact: true }).click();
    expect((await deckData(page)).easing).toBe('linear');
    await page.getByRole('radio', { name: '快進慢出', exact: true }).click();
    expect((await deckData(page)).easing).toBe('out');
    expect(errors).toEqual([]);
  });

  test('拖放與貼上加入圖片；不是圖片的略過並提示、讀不到的列出檔名；範例圖（F111～F113）', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    const zone = page.getByRole('group', { name: '把圖片拖到這裡，或點一下選擇檔案' });
    const dt = await page.evaluateHandle(async () => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 100;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#336699';
      ctx.fillRect(0, 0, 200, 100);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      const d = new DataTransfer();
      d.items.add(new File([blob], 'drop1.png', { type: 'image/png' }));
      d.items.add(new File([blob], 'drop2.png', { type: 'image/png' }));
      return d;
    });
    await zone.dispatchEvent('dragenter', { dataTransfer: dt });
    await expect(zone).toHaveAttribute('data-over', 'true');
    await zone.dispatchEvent('drop', { dataTransfer: dt });
    await expect(zone).not.toHaveAttribute('data-over', 'true');
    await expect(rows(page)).toHaveCount(2);
    /* 貼上：接在最後面 */
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 50;
      c.height = 50;
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      const d = new DataTransfer();
      d.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
      document.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true }),
      );
    });
    await expect(rows(page)).toHaveCount(3);
    expect((await deckData(page)).slides.map((s) => s.image.name)).toEqual([
      'drop1.png',
      'drop2.png',
      'pasted.png',
    ]);
    /* 不是圖片、壞檔 */
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 7),
    ]);
    await deckInput(page).setInputFiles([
      file('note.txt', Buffer.from('hello'), 'text/plain'),
      file('壞掉.png', broken),
      file('ok.png', await pngOf(64, 64, RED)),
    ]);
    await expect(rows(page)).toHaveCount(4);
    await expect(page.getByText('不是圖片，已略過：note.txt').first()).toBeVisible();
    await expect(page.getByText('無法讀取：壞掉.png').first()).toBeVisible();
    /* 範例圖：4 張，接在最後面 */
    await page.getByRole('button', { name: '範例圖' }).click();
    await expect(rows(page)).toHaveCount(8);
    expect((await deckData(page)).slides.slice(4).map((s) => s.image.name)).toEqual([
      'sample_day.png',
      'sample_dusk.png',
      'sample_night.png',
      'sample_dawn.png',
    ]);
    /* 整個視窗都能拖放：拖著檔案進入視窗，整個畫面出現「放開即可加入圖片」 */
    const dt2 = await page.evaluateHandle(async () => {
      const c = document.createElement('canvas');
      c.width = 30;
      c.height = 30;
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      const d = new DataTransfer();
      d.items.add(new File([blob], 'win.png', { type: 'image/png' }));
      return d;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt2 });
    await expect(page.getByText('放開即可加入圖片')).toBeVisible();
    await page.dispatchEvent('body', 'drop', { dataTransfer: dt2 });
    await expect(page.getByText('放開即可加入圖片')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(9);
    expect((await deckData(page)).slides.at(-1)?.image.name).toBe('win.png');
    expect(errors.filter((e) => !/Failed to load resource|ERR_/.test(e))).toEqual([]);
  });

  test('資訊列（F129）：全體秒數、匯出格數、輸出尺寸；影格超過 400 格時警告', async ({ page }) => {
    const errors = await openDeck(page);
    await addThree(page);
    /* 預設：每張 1.5 秒、溶接 0.8 秒；15 fps → 3 個停住 + 2 × 12 格 ＝ 27 格，全體 6.1 秒 */
    await expect(deckStats(page)).toHaveText('全體 6.1 秒・匯出 27 格・640 × 360 px');
    await expect(page.getByTestId('deck-many-frames')).toHaveCount(0);
    await setNum(durInput(page, 1), 10);
    await setNum(durInput(page, 2), 10);
    await expect(deckStats(page)).toContainText('全體 24.5 秒・匯出 303 格');
    await expect(page.getByTestId('deck-many-frames')).toHaveCount(0);
    /* 30 fps：2 × 300 + 3 ＝ 603 格 */
    await page.getByRole('combobox').filter({ hasText: 'fps' }).click();
    await page.getByRole('option', { name: '30 fps', exact: true }).click();
    await expect(deckStats(page)).toContainText('匯出 603 格');
    await expect(page.getByTestId('deck-many-frames')).toHaveText('影格很多，檔案會變大');
    expect(errors).toEqual([]);
  });

  test('容量上限：超過就依序降畫質 → FPS → 尺寸重新匯出（最多 8 次）；關掉就不調整', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    /* 亂數雜訊的圖（壓不小），320 × 180 */
    const noise = async (seed: number) => {
      const px = new Uint8ClampedArray(320 * 180 * 4);
      let s = seed;
      for (let i = 0; i < px.length; i += 4) {
        s = (s * 1664525 + 1013904223) >>> 0;
        px[i] = s >>> 24;
        px[i + 1] = (s >>> 16) & 255;
        px[i + 2] = (s >>> 8) & 255;
        px[i + 3] = 255;
      }
      return Buffer.from(await encodePng(px, 320, 180));
    };
    await deckInput(page).setInputFiles([
      file('n1.png', await noise(1)),
      file('n2.png', await noise(2)),
      file('n3.png', await noise(3)),
    ]);
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('deck-preview')).toHaveAttribute('data-output', '320x180');
    for (const n of [1, 2, 3]) {
      await setNum(holdInput(page, n), 0.5);
      await setNum(durInput(page, n), 0.5);
    }
    const capMb = page.getByRole('spinbutton', { name: '容量上限（MB）' });
    await setNum(capMb, 0.1);
    await expect(capMb).toHaveValue('0.1');
    await exportAs(page, 'WebP');
    const log = await page.evaluate(() => (window as unknown as DW).__bgMotion.deckLastExport());
    const limit = 0.1 * 1024 * 1024;
    expect(log.length).toBeGreaterThanOrEqual(4);
    expect(log.length).toBeLessThanOrEqual(8);
    expect(log[0]).toMatchObject({ fps: 15, width: 320, height: 180 });
    expect(log[0].q).toBeCloseTo(0.9, 9);
    /* 一次只改一個項目，順序：畫質 → FPS → 尺寸 */
    const kind = (a: (typeof log)[number], b: (typeof log)[number]) => {
      const q = Math.abs(a.q - b.q) > 1e-9;
      const f = a.fps !== b.fps;
      const s = a.width !== b.width || a.height !== b.height;
      expect([q, f, s].filter(Boolean)).toHaveLength(1);
      return q ? 0 : f ? 1 : 2;
    };
    const order = log.slice(1).map((a, k) => kind(log[k], a));
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(log[1].q).toBeCloseTo(0.54, 9);
    expect(log[2].q).toBeCloseTo(0.4, 9);
    expect(log[3].fps).toBe(10);
    expect(order.filter((o) => o === 1)).toHaveLength(1);
    for (const a of log.slice(0, -1)) expect(a.bytes).toBeGreaterThan(limit);
    const last = log.at(-1)!;
    expect(last.bytes <= limit || log.length === 8).toBe(true);
    const card = page.getByTestId('export-result').first();
    await expect(card).toContainText('容量調整');
    await expect(card).toContainText(`匯出 ${log.length} 次`);
    await expect(card).toContainText('畫質 90 → 40');
    await expect(card).toContainText('15 → 10 fps');
    await expect(card).toContainText(`${last.width}×${last.height} px`);
    /* 設定欄的畫質、FPS、尺寸不變（調整的是匯出） */
    const d = await deckData(page);
    expect([d.quality, d.fps, d.width, d.height]).toEqual([90, 15, 320, 180]);
    /* 關掉自動調整：只匯出一次 */
    await page.getByRole('switch', { name: '超過就自動調整' }).click();
    await exportAs(page, 'WebP');
    expect(
      await page.evaluate(() => (window as unknown as DW).__bgMotion.deckLastExport()),
    ).toHaveLength(1);
    await expect(page.getByTestId('export-result').first()).not.toContainText('容量調整');
    expect(errors).toEqual([]);
  });

  test('自動儲存：重新整理後圖片、順序、每張的設定與抽籤種子完整還原；復原紀錄清空', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await scenario(page);
    await page.getByRole('button', { name: '隨機分配', exact: true }).click();
    await page.getByRole('switch', { name: '最後一張切回第一張' }).click();
    await page.getByRole('radio', { name: '填滿', exact: true }).click();
    const before = await deckData(page);
    await page.waitForTimeout(600);
    await page.reload();
    await expect(rows(page)).toHaveCount(3);
    expect(await deckData(page)).toEqual(before);
    await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
    /* 圖片讀回來了（預覽是圖，不是空白） */
    await seekTo(page, 0.3);
    await expectDeckColor(page, 320, 180, RED);
    await expect(page.getByTestId('deck-missing')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('圖片讀不回來（已從瀏覽器清除）：那一列說明、預覽以空白代替、匯出說明原因', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await addThree(page);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const key = 'trpg-toolkit:bg-motion-deck';
      const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
      raw.state.data.slides[1].image.id = 'amissingimage0';
      localStorage.setItem(key, JSON.stringify(raw));
    });
    await page.reload();
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).nth(1).getByTestId('deck-row-missing')).toBeVisible();
    await expect(page.getByTestId('deck-missing')).toContainText('有 1 張圖片讀不到');
    /* 第 2 張停住的時間（預設每張 1.5 秒、溶接 0.8 秒：2.3～3.8 秒） */
    await seekTo(page, 3);
    await expectDeckColor(page, 320, 180, WHITE);
    /* 匯出停用並說明原因（共用匯出區的處理量上限那一欄的做法） */
    await expect(page.getByRole('button', { name: /^匯出 WebP/ })).toBeDisabled();
    await expect(page.getByTestId('export-over-budget')).toContainText('有 1 張圖片讀不到');
    expect(errors.filter((e) => !/Failed to load resource|ERR_/.test(e))).toEqual([]);
  });

  test('復原／重做（F136）：頁首按鈕與 Ctrl＋Z、Ctrl＋Shift＋Z；連續調整 0.4 秒內算一步', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await addThree(page);
    await page.waitForTimeout(450);
    await expect(page.getByRole('button', { name: /^復原/ })).toBeEnabled();
    await setNum(holdInput(page, 1), 3);
    await page.waitForTimeout(450);
    await pickTrans(page, '第 2 張', '翻牌');
    await page.waitForTimeout(450);
    await page.getByRole('switch', { name: '最後一張切回第一張' }).click();
    expect((await deckData(page)).loopBack).toBe(true);
    await page.getByRole('button', { name: /^復原/ }).click();
    expect((await deckData(page)).loopBack).toBe(false);
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Control+z');
    expect((await deckData(page)).slides[1].trans).toBe('fade');
    await page.keyboard.press('Control+z');
    expect((await deckData(page)).slides[0].hold).toBe(1.5);
    await page.keyboard.press('Control+Shift+z');
    expect((await deckData(page)).slides[0].hold).toBe(3);
    await page.keyboard.press('Control+y');
    expect((await deckData(page)).slides[1].trans).toBe('flip');
    /* 連續調整：0.4 秒內算一步 */
    await page.waitForTimeout(450);
    const hold = holdInput(page, 3);
    await hold.fill('4');
    await hold.fill('5');
    await hold.fill('6');
    await hold.press('Enter');
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: /^復原/ }).click();
    expect((await deckData(page)).slides[2].hold).toBe(1.5);
    expect(errors).toEqual([]);
  });

  test('專案檔（F137）：存成 ZIP（設定＋圖片）、重設、開啟還原；缺圖片的不開啟', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await scenario(page);
    await page.getByRole('button', { name: '專案' }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/\.zip$/);
    const zipBytes = readFileSync((await dl.path()) as string);
    const entries = unzipSync(new Uint8Array(zipBytes));
    const project = JSON.parse(strFromU8(entries['project.json']));
    expect(project.tool).toBe('bg-motion');
    expect(project.version).toBe(1);
    expect(project.data.slides).toHaveLength(3);
    expect(project.data.slides[0]).toMatchObject({ hold: 1, trans: 'slideR', dur: 0.5 });
    for (const s of project.data.slides)
      expect(Object.keys(entries)).toContain(`files/${s.image.id}.png`);
    const before = await deckData(page);
    /* 重設 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(page.getByTestId('deck-count')).toHaveText('共 0 張');
    /* 開啟 */
    const openZip = async (name: string, bytes: Uint8Array) => {
      await page.getByRole('button', { name: '專案' }).click();
      await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
      await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
      ]);
      await chooser.setFiles(file(name, Buffer.from(bytes), 'application/zip'));
    };
    await openZip('back.zip', zipBytes);
    await expect(rows(page)).toHaveCount(3);
    const after = await deckData(page);
    expect(after.slides.map((s) => [s.image.name, s.hold, s.trans, s.dur])).toEqual(
      before.slides.map((s) => [s.image.name, s.hold, s.trans, s.dur]),
    );
    await seekTo(page, 0.5);
    await expectDeckColor(page, 320, 180, RED);
    /* 開啟後可以復原 */
    await page.getByRole('button', { name: /^復原/ }).click();
    await expect(page.getByTestId('deck-count')).toHaveText('共 0 張');
    /* 缺圖片：不開啟 */
    const missing = {
      ...project,
      data: {
        ...project.data,
        slides: project.data.slides.map((s: { image: object }) => ({
          ...s,
          image: { ...s.image, id: 'amissingimage1' },
        })),
      },
    };
    await openZip('missing.zip', zipSync({ 'project.json': strToU8(JSON.stringify(missing)) }));
    await expect(page.getByText('專案檔裡有圖片讀不到，無法開啟。').first()).toBeVisible();
    await expect(page.getByTestId('deck-count')).toHaveText('共 0 張');
    expect(errors.filter((e) => !/Failed to load resource|ERR_/.test(e))).toEqual([]);
  });

  /* ---------- 對等驗證後的修正（規格 7.3） ---------- */

  test('拖曳排序在清單範圍外放開也會結束：之後滑鼠移過列不再排序，復原可以用（F115、F136）', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await addThree(page);
    await page.getByRole('button', { name: '範例圖' }).click();
    await expect(rows(page)).toHaveCount(7);
    await page.waitForTimeout(450);
    const names = async () => (await deckData(page)).slides.map((s) => s.image.name);
    const before = await names();
    const handle = rows(page).nth(0).locator('[data-drag-handle]');
    const hb = (await handle.boundingBox())!;
    const outro = (await page.getByTestId('deck-outro').boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 6, hb.y + 30, { steps: 4 });
    /* 往下拖過其他列（列被重排），再拖到清單下面的「最後一張消失」放開 */
    const last = (await rows(page).nth(6).boundingBox())!;
    await page.mouse.move(hb.x + 6, last.y + last.height - 6, { steps: 20 });
    await page.mouse.move(outro.x + outro.width / 2, outro.y + outro.height / 2, { steps: 8 });
    await page.mouse.up();
    const moved = await names();
    expect(moved).not.toEqual(before);
    expect(moved.at(-1)).toBe(before[0]);
    /* 放開之後，不按著滑鼠移過列，順序不會再變 */
    for (const i of [2, 1, 0, 3, 5]) {
      const b = (await rows(page).nth(i).boundingBox())!;
      await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 });
    }
    expect(await names()).toEqual(moved);
    /* 這一整次拖曳是一步復原：Ctrl＋Z 回到原來的順序 */
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Control+z');
    await expect.poll(names).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('清單超過約 8 張時清單區自己捲動，不把設定欄撐很長（F114）', async ({ page }) => {
    const errors = await openDeck(page);
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: '範例圖' }).click();
      await expect(rows(page)).toHaveCount(4 * (i + 1));
    }
    const list = page.getByRole('list', { name: '圖片清單' });
    const m = await list.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        overflowY: cs.overflowY,
        client: el.clientHeight,
        scroll: el.scrollHeight,
        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      };
    });
    expect(m.overflowY).toBe('auto');
    expect(m.scroll).toBeGreaterThan(m.client);
    expect(m.client).toBeLessThanOrEqual(63 * m.rem);
    /* 捲動清單：最後一列進入視野 */
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const last = rows(page).nth(15);
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([list.boundingBox(), last.boundingBox()]);
        return !!a && !!b && b.y >= a.y - 1 && b.y + b.height <= a.y + a.height + 1;
      })
      .toBe(true);
    expect(errors).toEqual([]);
  });

  test('沒有圖片、或有圖片讀不到時匯出停用並說明原因（F130、F134）', async ({ page }) => {
    const errors = await openDeck(page);
    const exportButton = page.getByRole('button', { name: /^匯出 WebP/ });
    await expect(exportButton).toBeDisabled();
    await expect(page.getByTestId('export-over-budget')).toContainText('請先加入圖片');
    await addThree(page);
    await expect(exportButton).toBeEnabled();
    await expect(page.getByTestId('export-over-budget')).toHaveCount(0);
    for (let i = 0; i < 3; i++)
      await page
        .getByRole('button', { name: /^移除第 \d 張/ })
        .first()
        .click();
    await expect(rows(page)).toHaveCount(0);
    await expect(exportButton).toBeDisabled();
    /* 快捷鍵在停用時也不會匯出 */
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('Alt+Shift+W');
    await page.waitForTimeout(400);
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('效果對話框：開啟時焦點在目前的效果，關閉後回到打開它的按鈕（F118）', async ({ page }) => {
    const errors = await openDeck(page);
    await addThree(page);
    const dlg = page.getByRole('dialog', { name: /選擇切換效果/ });
    await transButton(page, '第 2 張').click();
    await expect(dlg.getByRole('radio', { name: /^交叉溶接：/ })).toBeFocused();
    /* 點一個效果：套用、關閉、焦點回到按鈕 */
    await dlg.getByRole('radio', { name: /^翻牌：/ }).click();
    await expect(dlg).toHaveCount(0);
    await expect(transButton(page, '第 2 張')).toBeFocused();
    await expect(transButton(page, '第 2 張')).toContainText('翻牌');
    /* 再開：焦點在目前的效果（翻牌）；Esc 放棄，焦點也回到按鈕 */
    await page.keyboard.press('Enter');
    await expect(dlg.getByRole('radio', { name: /^翻牌：/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(transButton(page, '第 2 張')).toBeFocused();
    /* 一次設定、第一張出現也一樣 */
    await transButton(page, '第一張出現').click();
    await expect(dlg.getByRole('radio', { name: /^無：/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(transButton(page, '第一張出現')).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('改 FPS、格式、播放次數也讓結果卡作廢（F133）', async ({ page }) => {
    const errors = await openDeck(page);
    await addThree(page);
    const card = page.getByTestId('export-result');
    const exportNow = async (name: RegExp) => {
      await page.getByRole('button', { name }).click();
      await expect(card.first()).toBeVisible({ timeout: 60_000 });
    };
    await exportNow(/^匯出 WebP/);
    await page.getByRole('combobox').filter({ hasText: 'fps' }).click();
    await page.getByRole('option', { name: '24 fps', exact: true }).click();
    await expect(card).toHaveCount(0);
    await exportNow(/^匯出 WebP/);
    await page.getByRole('radio', { name: 'APNG', exact: true }).click();
    await expect(card).toHaveCount(0);
    await exportNow(/^匯出 APNG/);
    await page.getByRole('switch', { name: '無限循環' }).click();
    await expect(card).toHaveCount(0);
    await exportNow(/^匯出 APNG/);
    await page.getByRole('switch', { name: '減色（256 色）' }).click();
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('快捷鍵一覽在圖片切換模式寫實際的 FPS（最高 30）；動態效果模式照舊（F138）', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    /* 單鍵快捷鍵不在表單控制項（模式的單選鈕）上觸發，先離開它 */
    const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await blur();
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('以 24 FPS 匯出');
    await expect(dialog).toContainText('以 30 FPS 匯出');
    await expect(dialog).not.toContainText('以 60 FPS 匯出');
    await page.keyboard.press('Escape');
    await page.getByRole('radio', { name: '動態效果', exact: true }).click();
    await blur();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog')).toContainText('以 60 FPS 匯出');
    expect(errors).toEqual([]);
  });

  test('清單的加入、移除、複製、排序在 0.4 秒內連續做，也各算一步復原（F136）', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    await addThree(page);
    await page.waitForTimeout(450);
    /* 連續移除兩列（不等 0.4 秒） */
    await page.getByRole('button', { name: '移除第 3 張：blue.png' }).click();
    await page.getByRole('button', { name: '移除第 2 張：green.png' }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^復原/ }).click();
    await expect(rows(page)).toHaveCount(2);
    await page.getByRole('button', { name: /^復原/ }).click();
    await expect(rows(page)).toHaveCount(3);
    /* 連續複製、上移 */
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: '複製第 1 張：red.png' }).click();
    await page.getByRole('button', { name: '上移第 3 張：green.png' }).click();
    const names = async () => (await deckData(page)).slides.map((s) => s.image.name);
    expect(await names()).toEqual(['red.png', 'green.png', 'red.png', 'blue.png']);
    await page.getByRole('button', { name: /^復原/ }).click();
    expect(await names()).toEqual(['red.png', 'red.png', 'green.png', 'blue.png']);
    await page.getByRole('button', { name: /^復原/ }).click();
    expect(await names()).toEqual(['red.png', 'green.png', 'blue.png']);
    expect(errors).toEqual([]);
  });
});

test.describe('圖片切換模式：沒有畫布濾鏡的瀏覽器', () => {
  test.use({ viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

  test('模糊改用交叉溶接（F152）：同一時間的畫面和「交叉溶接」逐像素相同', async ({ page }) => {
    /* 模擬舊版 Safari：2D 環境沒有 filter 屬性 */
    await page.addInitScript(() => {
      Reflect.deleteProperty(CanvasRenderingContext2D.prototype, 'filter');
      Reflect.deleteProperty(OffscreenCanvasRenderingContext2D.prototype, 'filter');
    });
    const errors = await openDeck(page);
    /* 左白右黑與左黑右白的兩張圖（單色圖看不出略為放大的差別） */
    const halves = async (left: number, right: number) => {
      const w = 320;
      const h = 180;
      const px = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const v = x < w / 2 ? left : right;
          px.set([v, v, v, 255], (y * w + x) * 4);
        }
      return Buffer.from(await encodePng(px, w, h));
    };
    await deckInput(page).setInputFiles([
      file('a.png', await halves(255, 0)),
      file('b.png', await halves(0, 255)),
    ]);
    await expect(rows(page)).toHaveCount(2);
    await setNum(holdInput(page, 1), 1);
    const frame = () =>
      page.evaluate(() => (window as unknown as DW).__bgMotion.deckFrame(1.4).then((f) => f.b64));
    await pickTrans(page, '第 1 張', '模糊');
    const blur = await frame();
    await pickTrans(page, '第 1 張', '交叉溶接');
    const fade = await frame();
    expect(blur).toBe(fade);
    expect(errors).toEqual([]);
  });
});

test.describe('圖片切換模式（接續）', () => {
  test.use({ viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

  test('快捷鍵：Ctrl＋Shift＋O 加入圖片、Ctrl＋Shift＋P 播放／暫停、Alt＋Shift＋F 以 30 FPS 匯出', async ({
    page,
  }) => {
    const errors = await openDeck(page);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.keyboard.press('Control+Shift+O'),
    ]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([
      file('k1.png', await pngOf(320, 180, RED)),
      file('k2.png', await pngOf(320, 180, GREEN)),
    ]);
    await expect(rows(page)).toHaveCount(2);
    await page.keyboard.press('Control+Shift+P');
    await expect.poll(() => isPlaying(page)).toBe(true);
    await page.keyboard.press('Control+Shift+P');
    await expect.poll(() => isPlaying(page)).toBe(false);
    await page.keyboard.press('Alt+Shift+F');
    const card = page.getByTestId('export-result').first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText('.webp');
    await expect(page.getByRole('combobox').filter({ hasText: 'fps' })).toHaveText(/30 fps/);
    expect((await deckData(page)).fps).toBe(30);
    /* 60 FPS 的那組：圖片切換最高 30 fps */
    await page.keyboard.press('Alt+Shift+A');
    await expect(card).toBeVisible({ timeout: 60_000 });
    expect((await deckData(page)).fps).toBe(30);
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('復原');
    await expect(dialog).toContainText('播放／停止預覽');
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.getByRole('button', { name: '範例圖' }).click();
    await expect(info(page)).toContainText('2048 × 1536 px');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('bg-motion-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await fileInput(page).setInputFiles([
      file('a.png', await pngOf(640, 360, [200, 60, 60])),
      file('b.png', await pngOf(640, 360, [60, 60, 200])),
    ]);
    await effect(page, '交叉溶接').click();
    await expect(page.getByRole('list', { name: '轉場的圖片順序' })).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole('tab', { name: '濾鏡' }).click();
    await noHorizontalScroll(page);
    await page.getByRole('tab', { name: '動態' }).click();
    await page.getByRole('button', { name: '清除' }).click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('bg-motion-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  /* 圖片切換模式：三張單色圖（固定的設定與時間，預覽停在第 0 秒） */
  const deckLayout = async (page: Page) => {
    await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+08:00'));
    const errors = await openDeck(page);
    await addThree(page);
    await setNum(holdInput(page, 1), 1);
    await pickTrans(page, '第 1 張', '滑入（從右）');
    await pickTrans(page, '第 2 張', '擦除（從左）');
    await expect(deckStats(page)).toContainText('匯出');
    /* 「已加入 3 張圖片」的通知消失之後再截圖 */
    await expect(page.getByText('已加入 3 張圖片')).toHaveCount(0, { timeout: 15_000 });
    await seekTo(page, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    return errors;
  };

  test('視覺回歸：圖片切換 1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await deckLayout(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('bg-motion-deck-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：圖片切換 390 寬（手機）沒有橫向捲動，效果對話框也是', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await deckLayout(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('bg-motion-deck-390.png', { fullPage: true });
    await transButton(page, '第 1 張').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noHorizontalScroll(page);
    const box = (await page.getByRole('dialog').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
});
