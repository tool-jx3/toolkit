/**
 * 讀取動畫產生器（建置產物 tools/loading-maker/）的端對端測試：
 * - 開頁：沒有 console error、預設畫面、支援度標示、狀態列、總長的組成與預估列（F06、F08、F144、F152、F161）。
 * - 播放／暫停、時間軸、預覽速度、預覽開場與結尾、目前影格 PNG（F85、F100、F145～F149）。
 * - 匯出 APNG／GIF／WebP 並解析：尺寸、影格數、延遲、播放次數、最後一格全透明、檔名（F154～F166、3.9～3.11）；取消、處理量上限。
 * - 上傳角色：三格 100／200／300 ms 的 APNG、自然排序的連續圖、錯誤；改回內建（F13～F18、F32～F34）。
 * - 跟著進度條、拖曳與吸附（F36～F42、F150、F151）；時間表、漸層色標、底形清單、對齊整圈長度（F70、F74、F116、F133、F134）。
 * - 本機字型（F135）；不透明背景時結尾連背景一起消失（3.3）。
 * - 專案檔（存成 JSON／ZIP、開啟、錯誤）、新專案（F01～F04）；390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { existsSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { composeApng, parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('loading-maker') ?? { id: 'loading-maker', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '讀取動畫產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __loadingMaker?: unknown }).__loadingMaker,
  );
  return errors;
}

/** 呼叫測試入口（window.__loadingMaker） */
const hook = <T>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) => {
      // biome-ignore lint/suspicious/noExplicitAny: 測試入口
      const lm = (window as any).__loadingMaker;
      return new Function('lm', 'arg', `return (${f})(lm, arg)`)(lm, a);
    },
    [fn, arg] as const,
  ) as Promise<T>;

const set = (page: Page, path: string, value: unknown) =>
  hook(page, '(lm, a) => lm.set(a[0], a[1])', [path, value]);

/** t 秒時畫面的統計：不透明度總和、不透明度 > 8 的外接框、某一點的顏色 */
const stats = (page: Page, t: number, at?: [number, number]) =>
  hook<{ sum: number; box: number[] | null; px: number[] | null }>(
    page,
    `(lm, a) => {
      const img = lm.render(a.t);
      const d = img.data;
      let sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const al = d[(y * img.width + x) * 4 + 3];
        sum += al;
        if (al > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      const px = a.at ? Array.from(d.slice((a.at[1] * img.width + a.at[0]) * 4, (a.at[1] * img.width + a.at[0]) * 4 + 4)) : null;
      return { sum, box: x1 < 0 ? null : [x0, y0, x1, y1], px };
    }`,
    { t, at },
  );

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const status = (page: Page) => page.getByTestId('status');

async function menu(page: Page, item: string) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function exportAs(page: Page, format: 'APNG' | 'WebP' | 'GIF') {
  await page.getByRole('radio', { name: format, exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('button', { name: `匯出 ${format}` }).click(),
  ]);
  await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 120_000 });
  return {
    name: download.suggestedFilename(),
    bytes: readFileSync((await download.path()) as string),
  };
}

/* ---------- 測試用圖片（自己組 PNG／APNG，不依賴被測的編碼器） ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** 單色的 PNG（一格）或 APNG（多格，每格各自的毫秒） */
function makePng(w: number, h: number, frames: { rgba: number[]; ms: number }[]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const data = (rgba: number[]) => {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) raw.set(rgba, y * (w * 4 + 1) + 1 + x * 4);
    return deflateSync(raw);
  };
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (frames.length === 1) {
    parts.push(chunk('IDAT', data(frames[0].rgba)));
  } else {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(frames.length, 0);
    parts.push(chunk('acTL', actl));
    let seq = 0;
    frames.forEach((f, i) => {
      const fctl = Buffer.alloc(26);
      fctl.writeUInt32BE(seq++, 0);
      fctl.writeUInt32BE(w, 4);
      fctl.writeUInt32BE(h, 8);
      fctl.writeUInt16BE(f.ms, 20);
      fctl.writeUInt16BE(1000, 22);
      parts.push(chunk('fcTL', fctl));
      if (i === 0) parts.push(chunk('IDAT', data(f.rgba)));
      else {
        const s = Buffer.alloc(4);
        s.writeUInt32BE(seq++);
        parts.push(chunk('fdAT', Buffer.concat([s, data(f.rgba)])));
      }
    });
  }
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];

const characterInput = (page: Page) =>
  page.getByRole('group', { name: '角色圖片' }).locator('input[type="file"]');

/** 角色固定在中央、不動、不陰影（方便讀中心的顏色） */
async function stillCharacter(page: Page) {
  await set(page, 'character.motion', 'none');
  await set(page, 'character.shadow', false);
  await set(page, 'loader.type', 'none');
  await set(page, 'text.top.enabled', false);
  await set(page, 'text.bottom.enabled', false);
}

test('開頁：預設畫面、支援度、狀態列、總長的組成與預估', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('canvas-size')).toHaveText('640 × 360px');
  await expect(page.getByTestId('capabilities').getByRole('listitem')).toHaveCount(4);
  await expect(page.getByTestId('capabilities')).toContainText('APNG 匯出');
  await expect(status(page)).toHaveText('選一個內建角色，或上傳角色圖片開始製作。');
  await expect(page.getByTestId('breakdown')).toHaveText(
    '到達 100% 3.00 ＋ 停留 0.35 ＋ 結尾 0.70 ＝ 4.05 秒',
  );
  await expect(page.getByTestId('export-estimate')).toContainText(
    '4.05 秒 · 49 格 · 每格約 82.7 ms',
  );
  expect(await hook<number>(page, '(lm) => lm.duration()')).toBeCloseTo(4.05, 9);
  /* 畫面有角色、進度條、兩段文字 */
  const s = await stats(page, 1.5);
  expect(s.sum).toBeGreaterThan(1_000_000);
  expect(s.box?.[0]).toBeLessThan(170);
  /* 開頁就自動播放 */
  await expect.poll(() => hook<number>(page, '(lm) => lm.time')).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});

test('播放／暫停、時間軸、預覽速度、預覽開場與結尾、目前影格 PNG', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '暫停' }).click();
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible();
  expect(await hook<boolean>(page, '(lm) => lm.playing')).toBe(false);
  const timeline = page.getByRole('slider', { name: '時間軸' });
  await timeline.focus();
  await page.keyboard.press('End');
  await expect(page.getByText('4.05／4.05 秒')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(page.getByText('0.00／4.05 秒')).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(page.getByText('1.00／4.05 秒')).toBeVisible();
  /* 預覽速度只影響預覽 */
  const rate = page.getByRole('spinbutton', { name: '預覽速度' });
  await rate.fill('2');
  await rate.press('Enter');
  await expect(page.getByTestId('export-estimate')).toContainText('4.05 秒 · 49 格');
  /* 預覽開場：淡入關閉時停用 */
  await page.getByRole('tab', { name: '讀取動畫' }).click();
  const fadeBtn = page.getByRole('button', { name: '預覽開場' });
  await expect(fadeBtn).toBeDisabled();
  await set(page, 'bar.fadeIn', true);
  await expect(fadeBtn).toBeEnabled();
  await expect(page.getByTestId('breakdown')).toHaveText(
    '淡入 0.70 ＋ 到達 100% 3.00 ＋ 停留 0.35 ＋ 結尾 0.70 ＝ 4.75 秒',
  );
  await page.getByRole('button', { name: '播放' }).click();
  await page.getByRole('button', { name: '暫停' }).click();
  await fadeBtn.click();
  expect(await hook<boolean>(page, '(lm) => lm.playing')).toBe(true);
  expect(await hook<number>(page, '(lm) => lm.time')).toBeLessThan(0.5);
  /* 淡入期間停在第 0 秒：畫面＝第 0 秒的畫面 × 不透明度 */
  const t0 = await stats(page, 0.71);
  const mid = await stats(page, 0.35);
  expect(mid.sum / t0.sum).toBeGreaterThan(0.4);
  expect(mid.sum / t0.sum).toBeLessThan(0.6);
  /* 預覽結尾：跳到結尾開始處並播放 */
  await page.getByRole('button', { name: '預覽結尾' }).click();
  const t = await hook<number>(page, '(lm) => lm.time');
  expect(t).toBeGreaterThanOrEqual(4.05);
  await set(page, 'bar.vanish', 'none');
  await expect(page.getByRole('button', { name: '預覽結尾' })).toBeDisabled();
  /* 目前影格 PNG */
  await hook(page, '(lm) => lm.setPlaying(false)');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '目前影格 PNG' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('loading-animation-frame.png');
  const png = readFileSync((await dl.path()) as string);
  expect(png.readUInt32BE(16)).toBe(640);
  expect(png.readUInt32BE(20)).toBe(360);
  expect(errors).toEqual([]);
});

test('匯出 APNG／GIF／WebP：格式、影格、延遲、播放次數、最後一格全透明、檔名', async ({ page }) => {
  const errors = await open(page);
  const apng = await exportAs(page, 'APNG');
  expect(apng.name).toBe('loading-animation.png');
  const info = parseApng(new Uint8Array(apng.bytes));
  expect([info.ihdr.width, info.ihdr.height]).toEqual([640, 360]);
  expect(info.numPlays).toBe(0);
  const delays = info.frames.map((f) => (f.delayNum / f.delayDen) * 1000);
  expect(Math.abs(delays.reduce((a, b) => a + b, 0) - 4050)).toBeLessThanOrEqual(2);
  const frames = composeApng(info);
  const alphaSum = (rgba: Uint8Array) => {
    let s = 0;
    for (let i = 3; i < rgba.length; i += 4) s += rgba[i];
    return s;
  };
  expect(alphaSum(frames[0])).toBeGreaterThan(100_000);
  expect(alphaSum(frames[frames.length - 1])).toBe(0);
  await expect(status(page)).toContainText('已存成 APNG（');

  /* GIF：播放次數 3（三種格式一致） */
  await page.getByRole('switch', { name: '無限循環' }).click();
  const plays = page.getByRole('spinbutton', { name: '播放次數' });
  await plays.fill('3');
  await plays.press('Enter');
  const gif = await exportAs(page, 'GIF');
  expect(gif.name).toBe('loading-animation.gif');
  const g = parseGif(new Uint8Array(gif.bytes));
  expect([g.width, g.height]).toEqual([640, 360]);
  /* 49 格；結尾全透明的相同影格會合併（延遲相加） */
  expect(g.frames.length).toBeLessThanOrEqual(49);
  expect(g.frames.length).toBeGreaterThan(40);
  expect(Math.abs(g.frames.reduce((a, f) => a + f.delayCs, 0) - 405)).toBeLessThanOrEqual(2);
  for (const f of g.frames.slice(0, 40))
    expect(Math.abs(f.delayCs * 10 - 82.65)).toBeLessThanOrEqual(10);
  expect(g.loopCount).toBe(2);

  /* WebP：延遲 83 ms（±1）、循環次數、檔名清理 */
  await page.getByRole('textbox', { name: '檔名' }).fill('我的 動畫/v1:測試');
  const webp = await exportAs(page, 'WebP');
  expect(webp.name).toBe('我的-動畫-v1-測試.webp');
  expect(webp.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  let o = 12;
  const durations: number[] = [];
  let loop = -1;
  while (o + 8 <= webp.bytes.length) {
    const id = webp.bytes.subarray(o, o + 4).toString('latin1');
    const size = webp.bytes.readUInt32LE(o + 4);
    if (id === 'ANIM') loop = webp.bytes.readUInt16LE(o + 8 + 4);
    if (id === 'ANMF') durations.push(webp.bytes.readUIntLE(o + 8 + 12, 3));
    o += 8 + size + (size % 2);
  }
  expect(loop).toBe(3);
  expect(durations.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4049);
  for (const d of durations) expect(d).toBeGreaterThanOrEqual(82);
  /* APNG 也寫播放次數 3 */
  const apng3 = await exportAs(page, 'APNG');
  expect(apng3.name).toBe('我的-動畫-v1-測試.png');
  expect(parseApng(new Uint8Array(apng3.bytes)).numPlays).toBe(3);
  expect(errors).toEqual([]);
});

test('循環動畫的匯出：循環型取樣不含終點；對齊整圈長度', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '讀取動畫' }).click();
  await page.getByRole('radio', { name: '循環動畫' }).click();
  await expect(page.getByTestId('breakdown')).toHaveText('總長 3 秒 · 轉 3.6 圈');
  await page.getByRole('button', { name: '對齊整圈長度' }).click();
  await expect(status(page)).toHaveText('已對齊為 3 圈、2.5 秒，預覽從頭播放。');
  await expect(page.getByTestId('breakdown')).toHaveText('總長 2.5 秒 · 轉 3 圈 · 無縫');
  await set(page, 'loop.speed', 0.3);
  await set(page, 'duration', 3);
  await page.getByRole('button', { name: '對齊整圈長度' }).click();
  await expect(status(page)).toContainText('1 圈、3.333333 秒（不足一圈，已延長）');
  /* 10 格 1 秒、每秒一圈：最後一格的領頭在第一格的前一步 */
  await set(page, 'loop.speed', 1);
  await set(page, 'duration', 1);
  await page.getByRole('spinbutton', { name: 'FPS' }).fill('10');
  await page.getByRole('spinbutton', { name: 'FPS' }).press('Enter');
  const frames = await hook<{ t: number }[]>(page, '(lm) => lm.frames()');
  expect(frames).toHaveLength(10);
  expect(frames[9].t).toBeCloseTo(0.9, 6);
  const apng = await exportAs(page, 'APNG');
  const info = parseApng(new Uint8Array(apng.bytes));
  expect(info.frames.length).toBe(10);
  /* 成功訊息約 6 秒後換回閒置訊息 */
  await expect(status(page)).toHaveText('所有處理都在你的瀏覽器裡完成，圖片與字型不會上傳。', {
    timeout: 9000,
  });
  expect(errors).toEqual([]);
});

test('匯出的取消與處理量上限', async ({ page }) => {
  const errors = await open(page);
  await set(page, 'duration', 12);
  const fps = page.getByRole('spinbutton', { name: 'FPS' });
  await fps.fill('60');
  await fps.press('Enter');
  await page.getByRole('button', { name: '匯出 APNG' }).click();
  await expect(page.getByRole('progressbar').first()).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(status(page)).toHaveText('已取消匯出。');
  await expect(page.getByRole('button', { name: '匯出 APNG' })).toBeEnabled();
  /* 寬 × 高 × 格數 > 2 億 2 千萬：不能匯出 */
  await set(page, 'canvas.width', 1920);
  await set(page, 'canvas.height', 1080);
  await expect(page.getByTestId('export-over-budget')).toContainText('處理量超過上限');
  await expect(page.getByRole('button', { name: '匯出 APNG' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('上傳角色：三格 APNG 依檔案的時間播放、連續圖依檔名自然排序、錯誤、改回內建', async ({
  page,
}) => {
  const errors = await open(page);
  await stillCharacter(page);
  const anim = makePng(40, 40, [
    { rgba: RED, ms: 100 },
    { rgba: GREEN, ms: 200 },
    { rgba: BLUE, ms: 300 },
  ]);
  await characterInput(page).setInputFiles({
    name: 'walk.png',
    mimeType: 'image/png',
    buffer: anim,
  });
  await expect(status(page)).toHaveText('已載入角色（3 格）。');
  await expect(page.getByTestId('character-info')).toContainText('3 格 · 40×40');
  await expect(page.getByTestId('character-info')).toContainText('walk.png');
  const media = await hook<{ character: { delays: number[]; animated: boolean } }>(
    page,
    '(lm) => lm.media()',
  );
  expect(media.character.delays).toEqual([100, 200, 300]);
  const center: [number, number] = [320, 169];
  const color = async (t: number) => (await stats(page, t, center)).px?.slice(0, 3);
  expect(await color(0.05)).toEqual([255, 0, 0]);
  expect(await color(0.15)).toEqual([0, 255, 0]);
  expect(await color(0.35)).toEqual([0, 0, 255]);
  expect(await color(0.65)).toEqual([255, 0, 0]);
  /* 播放速度 2 倍：每格時間減半 */
  await set(page, 'character.speed', 2);
  expect(await color(0.06)).toEqual([0, 255, 0]);
  /* 不照檔案的時間：改用 FPS */
  await set(page, 'character.speed', 1);
  await page.getByRole('switch', { name: '照檔案的影格時間' }).click();
  await set(page, 'character.fps', 10);
  expect(await color(0.15)).toEqual([0, 255, 0]);
  expect(await color(0.25)).toEqual([0, 0, 255]);

  /* 連續圖：1、2、10 的順序（不是 1、10、2），每格依 FPS（8 FPS＝125 ms） */
  await set(page, 'character.fps', 8);
  await characterInput(page).setInputFiles([
    { name: '10.png', mimeType: 'image/png', buffer: makePng(30, 60, [{ rgba: BLUE, ms: 0 }]) },
    { name: '2.png', mimeType: 'image/png', buffer: makePng(30, 60, [{ rgba: GREEN, ms: 0 }]) },
    { name: '1.png', mimeType: 'image/png', buffer: makePng(30, 60, [{ rgba: RED, ms: 0 }]) },
  ]);
  await expect(status(page)).toHaveText('已載入角色（3 格）。');
  await expect(page.getByTestId('character-info')).toContainText('1.png、2.png，另外 1 個');
  expect(await color(0.06)).toEqual([255, 0, 0]);
  expect(await color(0.19)).toEqual([0, 255, 0]);
  expect(await color(0.31)).toEqual([0, 0, 255]);
  /* 寬度依圖的比例：高 42% × 0.5 */
  const b = await hook<{ character: { width: number; height: number } }>(
    page,
    '(lm) => lm.bounds(0)',
  );
  expect(b.character.width / b.character.height).toBeCloseTo(0.5, 3);

  /* 錯誤：不是圖片 */
  await characterInput(page).setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(status(page)).toContainText('沒有可用的圖片檔。');
  await expect(page.getByTestId('character-info')).toContainText('內建角色');
  /* 改回內建角色 */
  await characterInput(page).setInputFiles({
    name: 'walk.png',
    mimeType: 'image/png',
    buffer: anim,
  });
  await expect(page.getByTestId('character-info')).toContainText('3 格');
  await page.getByRole('button', { name: '改回內建角色' }).click();
  await expect(status(page)).toHaveText('已改回內建角色。');
  await expect(page.getByRole('combobox', { name: '內建角色' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('拖曳與吸附：拖曳期間暫停、放開後繼續；靠近中線就對齊；跟隨進度條時改微調值', async ({
  page,
}) => {
  const errors = await open(page);
  const loader = page.locator('[data-layout-item="loader"]');
  const box = (await loader.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 30, { steps: 4 });
  expect(await hook<boolean>(page, '(lm) => lm.playing')).toBe(false);
  const moved = await hook<{ loader: { x: number; y: number } }>(page, '(lm) => lm.settings()');
  expect(moved.loader.x).toBeGreaterThan(55);
  /* 拉回到中線附近（8 螢幕 px 以內）就吸住 */
  await page.mouse.move(cx + 5, cy + 30, { steps: 4 });
  await expect(page.getByTestId('layout-snap')).toBeVisible();
  await page.mouse.up();
  const snapped = await hook<{ loader: { x: number; y: number } }>(page, '(lm) => lm.settings()');
  expect(snapped.loader.x).toBeCloseTo(50, 6);
  await expect.poll(() => hook<boolean>(page, '(lm) => lm.playing')).toBe(true);

  /* 角色：拖曳改位置（%） */
  await hook(page, '(lm) => { lm.setPlaying(false); lm.seek(1); }');
  await set(page, 'canvas.snapCanvas', false);
  await set(page, 'canvas.snapItems', false);
  const ch = (await page.locator('[data-layout-item="character"]').boundingBox())!;
  await page.mouse.move(ch.x + ch.width / 2, ch.y + 20);
  await page.mouse.down();
  await page.mouse.move(ch.x + ch.width / 2 - 40, ch.y + 20, { steps: 4 });
  await page.mouse.up();
  const after = await hook<{ character: { x: number } }>(page, '(lm) => lm.settings()');
  expect(after.character.x).toBeLessThan(47);

  /* 跟著進度條：中心＝條左端＋條寬 × 進度；拖曳改的是微調值 */
  await set(page, 'character.follow', true);
  await set(page, 'bar.mode', 'linear');
  const bounds = await hook<{ character: { cx: number }; loader: { left: number; width: number } }>(
    page,
    '(lm) => lm.bounds(1.5)',
  );
  expect(bounds.character.cx).toBeCloseTo(bounds.loader.left + bounds.loader.width * 0.5, 0);
  await hook(page, '(lm) => lm.seek(1.5)');
  const fc = (await page.locator('[data-layout-item="character"]').boundingBox())!;
  await page.mouse.move(fc.x + fc.width / 2, fc.y + 20);
  await page.mouse.down();
  await page.mouse.move(fc.x + fc.width / 2 + 30, fc.y + 20, { steps: 4 });
  await page.mouse.up();
  const f = await hook<{ character: { x: number; followX: number } }>(
    page,
    '(lm) => lm.settings()',
  );
  expect(f.character.followX).toBeGreaterThan(10);
  expect(f.character.x).toBe(after.character.x);
  expect(errors).toEqual([]);
});

test('自訂時間表與漸層色標的增刪與限制', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '讀取動畫' }).click();
  await page.getByRole('radio', { name: /^自訂時間表/ }).click();
  await expect(page.getByTestId('length-readonly')).toHaveText('3.00 秒（＝最後節點的時間）');
  await expect(page.getByTestId('keyframe-count')).toContainText('4');
  await page.getByRole('button', { name: '新增節點' }).click();
  await expect(page.getByTestId('keyframe-count')).toContainText('5');
  await page.getByRole('button', { name: '恢復預設節點' }).click();
  await expect(page.getByTestId('keyframe-count')).toContainText('4');
  await expect(status(page)).toHaveText('已恢復預設的 4 個節點。');
  const p = await hook<number>(page, '(lm) => lm.progress(0.25)');
  expect(p).toBeCloseTo(0.174, 2);

  /* 漸層色標：2～7 個 */
  await page.getByRole('radio', { name: '漸層', exact: true }).click();
  await expect(page.getByTestId('stop-count')).toHaveText('顏色 3／7');
  const add = page.getByRole('button', { name: '新增色標' });
  for (let i = 0; i < 4; i++) await add.click();
  await expect(page.getByTestId('stop-count')).toHaveText('顏色 7／7');
  await expect(add).toBeDisabled();
  const stops = await hook<{ bar: { stops: { pos: number }[] } }>(page, '(lm) => lm.settings()');
  expect(stops.bar.stops.map((s) => s.pos)).toEqual([0, 12.5, 25, 37.5, 50, 75, 100]);
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '刪除第 2 個色標' }).click();
  await expect(page.getByTestId('stop-count')).toHaveText('顏色 2／7');
  await expect(page.getByRole('button', { name: '刪除第 1 個色標' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('換圖列：底形清單跟著格數、全部套用；圖片組的載入與移除', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '讀取動畫' }).click();
  await page.getByRole('radio', { name: '換圖列' }).click();
  const list = page.getByTestId('row-shapes');
  await expect(list.getByRole('combobox')).toHaveCount(8);
  await set(page, 'row.count', 3);
  await expect(list.getByRole('combobox')).toHaveCount(3);
  await page.getByRole('combobox', { name: '要套用的底形' }).click();
  await page.getByRole('option', { name: '星' }).click();
  await page.getByRole('button', { name: '全部套用' }).click();
  await expect(status(page)).toHaveText('已把所有位置的底形改成「星」。');
  await expect(list.getByRole('combobox').first()).toHaveText('星');
  /* 目標圖片：整組換掉、移除全部 */
  const input = page.getByTestId('row-target').locator('input[type="file"]');
  await input.setInputFiles([
    { name: 'b.png', mimeType: 'image/png', buffer: makePng(8, 8, [{ rgba: GREEN, ms: 0 }]) },
    { name: 'a.png', mimeType: 'image/png', buffer: makePng(8, 8, [{ rgba: RED, ms: 0 }]) },
  ]);
  await expect(page.getByTestId('row-target-info')).toContainText('2 張 · 按檔名自然順序排列');
  await expect(page.getByTestId('row-target-info')).toContainText('a.png、b.png');
  expect(await hook<{ rowTarget: number }>(page, '(lm) => lm.media()')).toMatchObject({
    rowTarget: 2,
  });
  await page.getByTestId('row-target').getByRole('button', { name: '移除全部' }).click();
  await expect(page.getByTestId('row-target-info')).toContainText('還沒有圖片');
  /* 起始圖片：上傳後自動切到圖片組 */
  await page.getByRole('radio', { name: '圖片', exact: true }).click();
  await page
    .getByTestId('row-start')
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'x.png',
      mimeType: 'image/png',
      buffer: makePng(8, 8, [{ rgba: BLUE, ms: 0 }]),
    });
  await expect(page.getByTestId('row-start-info')).toContainText('1 張');
  await expect(page.getByTestId('breakdown')).toHaveText('3 格 · 停在換好的狀態 · 全長 3.00 秒');
  expect(errors).toEqual([]);
});

test('不透明背景：結尾動作連背景一起消失，最後一格全透明', async ({ page }) => {
  const errors = await open(page);
  await set(page, 'canvas.transparent', false);
  await set(page, 'canvas.background', '#00ff00');
  const corner: [number, number] = [2, 2];
  expect((await stats(page, 1, corner)).px).toEqual([0, 255, 0, 255]);
  /* 平順淡出 0.7 秒：一半時約 128 */
  const half = (await stats(page, 3.35 + 0.35, corner)).px!;
  expect(Math.abs(half[3] - 128)).toBeLessThanOrEqual(8);
  expect((await stats(page, 4.05, corner)).px?.[3]).toBe(0);
  expect((await stats(page, 4.05)).sum).toBe(0);
  expect(errors).toEqual([]);
});

test('本機字型：上下兩段文字都改用它', async ({ page }) => {
  const FONT = '/usr/share/fonts/opentype/tlwg/Loma.otf';
  test.skip(!existsSync(FONT), '這台機器沒有測試用字型檔');
  const errors = await open(page);
  await page.getByRole('tab', { name: '文字' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '上傳字型檔' }).click(),
  ]);
  await chooser.setFiles(FONT);
  await expect(status(page)).toContainText('上下兩段文字都已改用字型');
  await expect(page.getByTestId('font-info')).toContainText('已套用');
  const s = await hook<{
    text: {
      top: { font: { source: string; family: string } };
      bottom: { font: { family: string } };
    };
  }>(page, '(lm) => lm.settings()');
  expect(s.text.top.font.source).toBe('upload');
  expect(s.text.bottom.font.family).toBe(s.text.top.font.family);
  expect(errors).toEqual([]);
});

test('專案檔：只含設定（JSON）、含素材（ZIP）、開啟、錯誤的檔案、新專案', async ({ page }) => {
  const errors = await open(page);
  await set(page, 'loader.seed', 777);
  await set(page, 'export.includeAssets', false);
  const [jsonDl] = await Promise.all([page.waitForEvent('download'), menu(page, '存成專案檔…')]);
  expect(jsonDl.suggestedFilename()).toBe('loading-animation.project.json');
  await expect(status(page)).toContainText('已存成專案檔（只含設定）');
  const jsonPath = (await jsonDl.path()) as string;
  expect(JSON.parse(readFileSync(jsonPath, 'utf8')).tool).toBe('loading-maker');

  /* 含素材：有上傳的角色時存成 ZIP */
  await set(page, 'export.includeAssets', true);
  await characterInput(page).setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: makePng(20, 20, [{ rgba: RED, ms: 0 }]),
  });
  await expect(page.getByTestId('character-info')).toContainText('1 格');
  const [zipDl] = await Promise.all([page.waitForEvent('download'), menu(page, '存成專案檔…')]);
  expect(zipDl.suggestedFilename()).toBe('loading-animation.project.zip');
  await expect(status(page)).toContainText('已存成專案檔（含素材）');
  const zipPath = (await zipDl.path()) as string;

  /* 新專案：確認後回到預設 */
  await menu(page, '新專案…');
  await page.getByRole('alertdialog').getByRole('button', { name: '開新專案' }).click();
  await expect(status(page)).toHaveText('已重設成預設值。');
  let s = await hook<{ loader: { seed: number }; character: { upload: unknown } }>(
    page,
    '(lm) => lm.settings()',
  );
  expect(s.loader.seed).toBe(21);
  expect(s.character.upload).toBeNull();

  /* 開啟 ZIP：設定與角色圖都回來 */
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), menu(page, '開啟專案檔…')]);
  await fc.setFiles(zipPath);
  await expect(status(page)).toContainText('已開啟專案檔');
  s = await hook(page, '(lm) => lm.settings()');
  expect(s.loader.seed).toBe(777);
  expect(s.character.upload).not.toBeNull();
  await expect(page.getByTestId('character-info')).toContainText('1 格 · 20×20');

  /* 不是本工具的檔案：顯示錯誤、目前內容不變 */
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), menu(page, '開啟專案檔…')]);
  await fc2.setFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ format: 'trpg-toolkit-project', tool: 'cutin', version: 1, data: {} }),
    ),
  });
  await expect(status(page)).toHaveAttribute('data-tone', 'danger');
  s = await hook(page, '(lm) => lm.settings()');
  expect(s.loader.seed).toBe(777);
  /* 只含設定的 JSON 也能開 */
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), menu(page, '開啟專案檔…')]);
  await fc3.setFiles(jsonPath);
  await expect(status(page)).toContainText('已開啟專案檔');
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await hook(page, '(lm) => lm.seek(1.6)');
    await expect(page.getByText('1.60／4.05 秒')).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('loading-maker-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    for (const tab of ['讀取動畫', '文字', '畫布', '角色']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    await page.getByRole('tab', { name: '讀取動畫' }).click();
    for (const type of ['循環動畫', '換圖列', '進度條']) {
      await page.getByRole('radio', { name: type }).click();
      await noHorizontalScroll(page);
    }
    await page.getByRole('tab', { name: '角色' }).click();
    await hook(page, '(lm) => lm.seek(1.6)');
    await expect(page.getByText('1.60／4.05 秒')).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('loading-maker-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
