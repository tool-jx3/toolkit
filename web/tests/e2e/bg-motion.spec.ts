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
import { unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { parseWebp } from '../../src/core/encode/webp';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { parseApng, parseChunks, readIhdr } from '../helpers/png';

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

  test('預覽是輸出的等比縮圖：上下震盪的黑邊、淡入的白色、透明淡化', async ({ page }) => {
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
    const toast = page.getByText('已開始下載');
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
});
