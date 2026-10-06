/**
 * 音樂播放畫面產生器（建置產物 next/music-frame/）的端對端測試：
 * - 開頁的預設值（示範封面、示範文字）、外框與頁尾、沒有 console error；
 * - 設計、動態的每個控制項都會改變畫面（比對畫布的指紋與抽查像素）；
 * - 封面（選檔、配色、移除、不是圖片）、音樂（測試音檔由程式產生 WAV：選檔、播放列、播放、跳轉、移除、不能播放的檔案）、
 *   拖放（圖片、音樂、歌詞檔、其他）；
 * - 歌詞（開關、文字、檔案〔含 Big5〕、狀態、打點〔按鈕與 Ctrl＋Enter〕、復原、偏移、位置、中央版面）；
 * - PNG（1920 × 1080、檔名、與預覽逐點相同）；
 * - 影片：無頭 Chromium 沒有 H.264，逐格編碼走 VP9＋Opus 的 MP4（解析 box、在頁面上播放驗證長度與畫面、聲音解得開），
 *   沒有音樂的循環、區間太短、取消；即時錄影（強制）；完全不支援時停用；
 * - 自動保存（重新整理後封面與音樂還在）、復原／重做、專案檔（ZIP：設定＋封面＋音樂）、重設；
 * - 鍵盤（空白鍵、Alt＋Shift＋P）；390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodeWav } from '../../src/core/audio/pcm';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('music-frame') ?? { id: 'music-frame', status: 'next' })}/`;

interface Settings {
  title: string;
  artist: string;
  subtitle: string;
  layout: string;
  background: string;
  mood: string;
  font: string;
  radius: number;
  accentAuto: boolean;
  accent: string;
  deco: string;
  hud: boolean;
  hudText: string;
  hudTextAuto: boolean;
  scanlines: boolean;
  viz: string;
  progress: boolean;
  motion: boolean;
  react: boolean;
  grain: boolean;
  fakeDuration: number;
  fakePosition: number;
  lyrics: {
    enabled: boolean;
    text: string;
    position: string;
    size: number;
    showNext: boolean;
    offset: number;
    fileName: string;
  };
  cover: { id: string | null; name: string };
  audio: { id: string | null; name: string };
  export: {
    loopLength: number;
    range: string;
    start: number;
    end: number;
    fps: number;
    mute: boolean;
  };
}
interface Session {
  coverState: string;
  artId: string | null;
  demo: boolean;
  audioState: string;
  duration: number;
  sampleRate: number;
  exporting: boolean;
  recording: boolean;
  fontTick: number;
}
interface Hook {
  settings: () => Settings;
  session: () => Session;
  set: (path: string, value: unknown) => void;
  lyrics: () => { lines: { t: number; text: string; tr: string }[]; untimed: number };
  player: {
    time: () => number;
    playing: () => boolean;
    play: (t?: number) => Promise<void>;
    pause: () => void;
    seek: (t: number) => void;
  };
  forceRealtime: (v: boolean) => void;
  fontStack: (id: string) => string;
}
type W = { __musicFrame: Hook };
const hook = <T>(page: Page, fn: (h: Hook) => T) =>
  page.evaluate((src) => {
    const h = (window as unknown as W).__musicFrame;
    return new Function('h', `return (${src})(h)`)(h);
  }, fn.toString()) as Promise<Awaited<T>>;
const settings = (page: Page) => hook(page, (h) => h.settings());
const session = (page: Page) => hook(page, (h) => h.session());

async function open(page: Page, { reducedMotion = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  /* 減少動態效果：循環預覽不自動播放，畫面停在第 0 秒（比對畫面用） */
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '音樂播放畫面產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__musicFrame);
  await expect.poll(() => rendered(page)).toBeGreaterThan(0);
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function dismissToasts(page: Page) {
  const close = page.getByRole('button', { name: '關閉通知' });
  while ((await close.count()) > 0) await close.first().click();
  await expect(close).toHaveCount(0);
}

/** 自動儲存的時間每次不同，截圖時遮住 */
const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const canvas = (page: Page) => page.getByTestId('preview-canvas');

/** 預覽畫了幾次 */
const rendered = (page: Page) =>
  canvas(page)
    .getAttribute('data-rendered')
    .then((v) => Number(v ?? 0));

/** 預覽畫布的指紋（每 97 個像素取一個） */
const signature = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4 * 97)
      h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) >>> 0;
    return h;
  });

/** 預覽上 (x, y) 的顏色 */
const pixel = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      return Array.from(c.getContext('2d')!.getImageData(px, py, 1, 1).data.slice(0, 3));
    },
    [x, y],
  );

/** 做一件事，等預覽重畫後回傳畫布的指紋 */
async function after(page: Page, action: () => Promise<unknown>): Promise<number> {
  const before = await rendered(page);
  await action();
  await expect.poll(() => rendered(page)).toBeGreaterThan(before);
  /* 字型等非同步的變化也畫完 */
  await page.waitForTimeout(150);
  return signature(page);
}

/** 換一個設定（UI 操作），確認畫面有變 */
async function changes(page: Page, action: () => Promise<unknown>) {
  const before = await signature(page);
  const now = await after(page, action);
  expect(now, '畫面應該改變').not.toBe(before);
  return now;
}

/** 測試音檔：seconds 秒、44.1 kHz、立體聲；每 0.5 秒一下低音鼓＋440 Hz 的音 */
function wavBytes(seconds = 6, sr = 44100): Buffer {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const beat = t % 0.5;
    a[i] = Math.max(
      -1,
      Math.min(
        1,
        Math.sin(2 * Math.PI * 55 * t) * Math.exp(-beat * 12) * 0.7 +
          Math.sin(2 * Math.PI * 440 * t) * 0.15,
      ),
    );
  }
  return Buffer.from(encodeWav({ sampleRate: sr, channels: [a, a.slice()] }));
}

/** 左右兩半不同顏色的 PNG */
async function coverPng(w = 300, h = 200): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      px.set(x < w / 2 ? [220, 40, 40, 255] : [30, 60, 200, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 單色的 PNG（灰色封面：配色全是灰色，文字的彩度只來自反鋸齒） */
async function solidPng(w: number, h: number, rgb: [number, number, number]): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([...rgb, 255], i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/**
 * 一塊區域的文字像素：最大彩度（R、G、B 的最大差）與亮的像素數；
 * png 給了就量那張 PNG，否則量預覽。另外回傳整張圖最小的不透明度。
 */
const textChroma = (page: Page, rect: [number, number, number, number], png?: Buffer) =>
  page.evaluate(
    async ([[x, y, w, h], b64]) => {
      let g: CanvasRenderingContext2D;
      if (b64) {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }), {
          premultiplyAlpha: 'none',
        });
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        g = c.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
      } else
        g = document
          .querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!
          .getContext('2d')!;
      const d = g.getImageData(x, y, w, h).data;
      let maxChroma = 0;
      let textPixels = 0;
      for (let i = 0; i < d.length; i += 4) {
        maxChroma = Math.max(
          maxChroma,
          Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]),
        );
        if (d[i] + d[i + 1] + d[i + 2] > 300) textPixels++;
      }
      const all = g.getImageData(0, 0, g.canvas.width, g.canvas.height).data;
      let minAlpha = 255;
      for (let i = 3; i < all.length; i += 4) minAlpha = Math.min(minAlpha, all[i]);
      return { maxChroma, textPixels, minAlpha };
    },
    [rect, png?.toString('base64') ?? ''] as const,
  );

const file = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });
const coverInput = (page: Page) => page.locator('input[type=file][accept^="image/png"]');
const audioInput = (page: Page) => page.locator('input[type=file][accept^="audio/*"]');

async function loadAudio(page: Page, seconds = 6) {
  await tab(page, '曲目').click();
  await audioInput(page).setInputFiles(file('test.wav', 'audio/wav', wavBytes(seconds)));
  await expect.poll(async () => (await session(page)).audioState).toBe('ready');
  await expect(page.getByTestId('audio-transport')).toBeVisible();
}

/** 用 DataTransfer 把檔案拖放到頁面（WindowDrop） */
async function dropFiles(page: Page, files: { name: string; type: string; b64: string }[]) {
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, files);
}

/** 匯出影片並下載 */
async function exportVideo(page: Page) {
  await page.getByRole('button', { name: /^匯出 / }).click();
  const card = page.getByTestId('export-result');
  await expect(card).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await download.path()) as string)),
  };
}

/* ---------- MP4 的 box ---------- */

interface Box {
  type: string;
  start: number;
  size: number;
  children: Box[];
}
const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o);
const ascii = (b: Uint8Array, o: number, n = 4) => String.fromCharCode(...b.subarray(o, o + n));
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
function boxes(b: Uint8Array, start = 0, end = b.length): Box[] {
  const out: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    const size = u32(b, o);
    const type = ascii(b, o + 4);
    out.push({
      type,
      start: o,
      size,
      children: CONTAINERS.has(type) ? boxes(b, o + 8, o + size) : [],
    });
    if (type === 'mdat' || size < 8) break;
    o += size;
  }
  return out;
}
const child = (b: Box, ...path: string[]) => {
  let cur: Box | undefined = b;
  for (const t of path) cur = cur?.children.find((x) => x.type === t);
  return cur;
};

/** 在頁面上播放影片：長度、尺寸、某個時間點的畫面與聲音 */
const probeVideo = (page: Page, bytes: Uint8Array, type: string) =>
  page.evaluate(
    async ([b64, mime]) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const blob = new Blob([u8], { type: mime });
      const v = document.createElement('video');
      v.muted = true;
      v.src = window.URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        v.onloadeddata = () => resolve();
        v.onerror = () => reject(new Error(`無法播放：${v.error?.message}`));
      });
      await new Promise<void>((r) => {
        v.onseeked = () => r();
        v.currentTime = 0.5;
      });
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 108;
      c.getContext('2d')!.drawImage(v, 0, 0, 192, 108);
      const d = c.getContext('2d')!.getImageData(0, 0, 192, 108).data;
      let lum = 0;
      for (let i = 0; i < d.length; i += 4) lum += d[i] + d[i + 1] + d[i + 2];
      let audio: { duration: number; peak: number } | null = null;
      try {
        const ac = new OfflineAudioContext(2, 48000, 48000);
        const buf = await ac.decodeAudioData(await blob.arrayBuffer());
        let peak = 0;
        for (const x of buf.getChannelData(0)) peak = Math.max(peak, Math.abs(x));
        audio = { duration: buf.duration, peak };
      } catch {
        audio = null;
      }
      return {
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
        meanLum: lum / (192 * 108 * 3),
        audio,
      };
    },
    [Buffer.from(bytes).toString('base64'), type] as const,
  );

test.describe('音樂播放畫面產生器', () => {
  test('開頁：預設值、示範封面、分頁、外框與頁尾', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByRole('link', { name: /zznaptime\/1007mv/ })).toHaveAttribute(
      'href',
      'https://github.com/zznaptime/1007mv',
    );
    await expect(page.getByRole('tablist', { name: '設定分類' }).getByRole('tab')).toHaveText([
      '曲目',
      '設計',
      '動態',
      '歌詞',
      '匯出',
    ]);
    const s = await settings(page);
    expect([s.title, s.artist, s.subtitle]).toEqual(['星夜下的酒館', '吟遊詩人樂團', '']);
    expect([s.layout, s.background, s.mood, s.font, s.deco, s.viz]).toEqual([
      'split',
      'blur',
      'auto',
      'sans',
      'cyber',
      'bars',
    ]);
    expect([s.radius, s.fakeDuration, s.export.loopLength, s.export.fps]).toEqual([18, 663, 8, 30]);
    const sess = await session(page);
    expect(sess.demo).toBe(true);
    expect(sess.audioState).toBe('none');
    await expect(page.getByTestId('cover-name')).toHaveText('示範封面（星空下的二十面骰）');
    await expect(page.getByTestId('audio-info')).toContainText('沒有音樂');
    await expect(page.getByTestId('loop-transport')).toContainText('預覽 8 秒的循環');
    /* 畫布 1920 × 1080，不是單色 */
    expect(await canvas(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([
      1920, 1080,
    ]);
    expect(await pixel(page, 400, 540)).not.toEqual(await pixel(page, 1700, 900));
    /* 減少動態效果時循環預覽不自動播放 */
    await expect(
      page.getByTestId('loop-transport').getByRole('button', { name: '播放' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('設計：版面、背景、明暗、字型、圓角、重點色、邊框、角落文字、掃描線', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '設計').click();
    for (const name of ['中央', '黑膠', '左右']) {
      await changes(page, () => page.getByRole('radio', { name, exact: true }).click());
    }
    expect((await settings(page)).layout).toBe('split');
    for (const name of ['漸層', '單色', '封面模糊'])
      await changes(page, () => page.getByRole('radio', { name, exact: true }).click());
    /* 明暗：淺色時背景亮、深色時暗 */
    await changes(page, () => page.getByRole('radio', { name: '淺色', exact: true }).click());
    const light = await pixel(page, 960, 1060);
    await changes(page, () => page.getByRole('radio', { name: '深色', exact: true }).click());
    const dark = await pixel(page, 960, 1060);
    expect(light.reduce((a, b) => a + b)).toBeGreaterThan(dark.reduce((a, b) => a + b) + 200);
    await page.getByRole('radio', { name: '自動', exact: true }).click();
    /* 字型 */
    await page.getByRole('radio', { name: /^明體/ }).click();
    await expect.poll(async () => (await settings(page)).font).toBe('serif');
    await page.getByRole('radio', { name: /^黑體/ }).click();
    /* 圓角 */
    await changes(page, async () => {
      const r = page.getByRole('spinbutton', { name: '封面圓角' });
      await r.fill('48');
      await r.press('Enter');
    });
    expect((await settings(page)).radius).toBe(48);
    /* 重點色：關掉自動 → 從抽出來的顏色開始；改成紅色 → 角落括號變紅 */
    const autoHex = await page.getByRole('textbox', { name: '重點色' }).inputValue();
    await page.getByRole('switch', { name: '從封面自動抽色' }).click();
    expect((await settings(page)).accent).toBe(autoHex.toLowerCase());
    await changes(page, async () => {
      const hex = page.getByRole('textbox', { name: '重點色' });
      await hex.fill('#ff0000');
      await hex.press('Enter');
    });
    const corner = await pixel(page, 80, 44);
    expect(corner[0]).toBeGreaterThan(200);
    expect(corner[1]).toBeLessThan(90);
    /* 邊框：無 → 角落沒有括號；線條 → 有括號、沒有科技風的刻度 */
    await changes(page, () => page.getByRole('radio', { name: '無', exact: true }).click());
    expect((await pixel(page, 80, 44))[0]).toBeLessThan(150);
    await changes(page, () => page.getByRole('radio', { name: '線條', exact: true }).click());
    expect((await pixel(page, 80, 44))[0]).toBeGreaterThan(200);
    await expect(page.getByRole('switch', { name: '角落文字' })).toHaveCount(0);
    await changes(page, () => page.getByRole('radio', { name: '科技風', exact: true }).click());
    await changes(page, () => page.getByRole('switch', { name: '角落文字' }).click());
    await changes(page, () => page.getByRole('switch', { name: '角落文字' }).click());
    /* 左下角文字：預設跟著 FPS，改了之後不再跟著 */
    const hud = page.getByRole('textbox', { name: '左下角文字' });
    await expect(hud).toHaveValue('30 FPS');
    await changes(page, () => hud.fill('第一章・序曲'));
    let s = await settings(page);
    expect([s.hudText, s.hudTextAuto]).toEqual(['第一章・序曲', false]);
    await changes(page, () => page.getByRole('switch', { name: '掃描線' }).click());
    s = await settings(page);
    expect(s.scanlines).toBe(true);
    expect(errors).toEqual([]);
  });

  test('字型：等寬、像素體載不到時退回電腦的等寬字（monospace）', async ({ page }) => {
    const errors = await open(page);
    /* 這裡的 Google Fonts 都是空的：Roboto Mono、DotGothic16 都沒有載入，只剩字型堆疊後面的退路 */
    const stacks = await hook(page, (h) => [h.fontStack('mono'), h.fontStack('pixel')]);
    const widths = await page.evaluate((list) => {
      const g = document.createElement('canvas').getContext('2d')!;
      return list.map((stack) =>
        ['iiiiiiii', 'MMMMMMMM', '00:00:00'].map((t) => {
          g.font = `400 40px ${stack}`;
          return Math.round(g.measureText(t).width * 10) / 10;
        }),
      );
    }, stacks);
    for (const [i, w] of widths.entries())
      expect(new Set(w).size, `${stacks[i]}：${w.join('／')}`).toBe(1);
    expect(errors).toEqual([]);
  });

  test('動態：視覺化、進度條、漂浮、顆粒、沒有音樂時的曲長與進度', async ({ page }) => {
    const errors = await open(page);
    /* 循環預覽停在 2 秒（相位不是 0 才看得出漂浮的差別） */
    const slider = page.getByTestId('loop-transport').getByRole('slider', { name: '時間軸' });
    await slider.focus();
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageUp');
    await expect(page.getByTestId('loop-transport').getByTestId('transport-time')).toHaveText(
      '2.00／8.00 秒',
    );
    await tab(page, '動態').click();
    for (const name of ['波形', '整首波形', '關閉', '長條'])
      await changes(page, () => page.getByRole('radio', { name, exact: true }).click());
    await changes(page, () => page.getByRole('switch', { name: '進度條與時間' }).click());
    await changes(page, () => page.getByRole('switch', { name: '進度條與時間' }).click());
    await changes(page, () => page.getByRole('switch', { name: '封面漂浮' }).click());
    await changes(page, () => page.getByRole('switch', { name: '底片顆粒' }).click());
    await expect(page.getByText('放進音樂後才有作用。').first()).toBeVisible();
    /* 曲長：分:秒；看不懂時還原 */
    const dur = page.getByRole('textbox', { name: '曲長' });
    await changes(page, async () => {
      await dur.fill('4:05');
      await dur.press('Enter');
    });
    expect((await settings(page)).fakeDuration).toBe(245);
    await dur.fill('abc');
    await dur.press('Enter');
    await expect(dur).toHaveValue('4:05');
    await changes(page, async () => {
      const pos = page.getByRole('spinbutton', { name: '進度位置' });
      await pos.fill('80');
      await pos.press('Enter');
    });
    expect((await settings(page)).fakePosition).toBeCloseTo(0.8);
    const s = await settings(page);
    expect([s.motion, s.grain, s.progress, s.viz]).toEqual([false, false, true, 'bars']);
    expect(errors).toEqual([]);
  });

  test('時間欄：有小數的值離開欄位後保留（只有改了文字才重新解析）', async ({ page }) => {
    const errors = await open(page);
    const elsewhere = () => page.getByRole('heading', { level: 1 }).click();
    /* 曲長（沒有音樂，F29） */
    await tab(page, '動態').click();
    const dur = page.getByRole('textbox', { name: '曲長' });
    await dur.fill('4:05.5');
    await dur.press('Enter');
    expect((await settings(page)).fakeDuration).toBe(245.5);
    await expect(dur).toHaveValue('4:05');
    /* 點一下欄位、點別處；Enter 確定後再離開：都不重新解析顯示的「4:05」 */
    await dur.click();
    await elsewhere();
    await dur.focus();
    await dur.press('Enter');
    await dur.press('Tab');
    expect((await settings(page)).fakeDuration).toBe(245.5);
    /* 看不懂時還原成原本的值（小數保留） */
    await dur.fill('abc');
    await dur.press('Tab');
    await expect(dur).toHaveValue('4:05');
    expect((await settings(page)).fakeDuration).toBe(245.5);
    /* 改成別的值照常生效 */
    await dur.fill('3:00');
    await dur.press('Tab');
    expect((await settings(page)).fakeDuration).toBe(180);

    /* 匯出的指定區間（F44）：開始 2.4、結束 3.5 → 1.1 秒，不是「區間太短」 */
    await loadAudio(page);
    await tab(page, '匯出').click();
    await page.getByRole('radio', { name: '指定區間', exact: true }).click();
    const start = page.getByRole('textbox', { name: '開始' });
    const end = page.getByRole('textbox', { name: '結束' });
    await start.fill('0:02.4');
    await start.press('Enter');
    await end.fill('0:03.5');
    await end.press('Enter');
    await elsewhere();
    await end.click();
    await start.click();
    await elsewhere();
    let s = await settings(page);
    expect([s.export.start, s.export.end]).toEqual([2.4, 3.5]);
    await expect(page.getByTestId('range-error')).toHaveCount(0);
    /* Tab 離開後再點進去、Esc */
    await end.fill('0:04.25');
    await end.press('Tab');
    await end.click();
    await end.press('Escape');
    await elsewhere();
    s = await settings(page);
    expect(s.export.end).toBe(4.25);
    await expect(end).toHaveValue('0:04');
    expect(errors).toEqual([]);
  });

  test('封面：選檔、配色依封面、移除回到示範封面；不是圖片時提示', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '設計').click();
    const demoAccent = await page.getByRole('textbox', { name: '重點色' }).inputValue();
    await tab(page, '曲目').click();
    const sig0 = await signature(page);
    await coverInput(page).setInputFiles(file('cover.png', 'image/png', await coverPng()));
    await expect.poll(async () => (await session(page)).coverState).toBe('ready');
    await expect(page.getByTestId('cover-name')).toHaveText('cover.png');
    await expect(page.getByText('已換上封面，配色依封面重新設定。').first()).toBeVisible();
    expect((await settings(page)).cover.name).toBe('cover.png');
    await expect.poll(() => signature(page)).not.toBe(sig0);
    /* 正方形取中央：左上角（封面的 x＝170..790）左半是紅、右半是藍 */
    const left = await pixel(page, 250, 540);
    const right = await pixel(page, 700, 540);
    expect(left[0]).toBeGreaterThan(left[2]);
    expect(right[2]).toBeGreaterThan(right[0]);
    await tab(page, '設計').click();
    await expect(page.getByRole('textbox', { name: '重點色' })).not.toHaveValue(demoAccent);
    await tab(page, '曲目').click();
    await page.getByRole('button', { name: '移除封面' }).click();
    await expect.poll(async () => (await session(page)).demo).toBe(true);
    await expect(page.getByTestId('cover-name')).toHaveText('示範封面（星空下的二十面骰）');
    /* 不是圖片 */
    await coverInput(page).setInputFiles(file('note.txt', 'text/plain', Buffer.from('hi')));
    await expect(page.getByText(/無法當成封面/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('音樂：選檔、播放列、播放與暫停、跳轉、整首波形、移除；不能播放的檔案', async ({ page }) => {
    const errors = await open(page);
    await loadAudio(page);
    await expect(page.getByTestId('audio-info')).toHaveText('test.wav・0:06');
    const transport = page.getByTestId('audio-transport');
    await expect(transport.getByTestId('transport-time')).toHaveText('0:00／0:06');
    const s = await settings(page);
    expect(s.audio.name).toBe('test.wav');
    expect([s.export.start, s.export.end]).toEqual([0, 6]);
    expect((await session(page)).duration).toBeCloseTo(6, 2);
    /* 播放、暫停（播放列的按鈕） */
    await transport.getByRole('button', { name: '播放', exact: true }).click();
    await expect
      .poll(() => hook(page, (h) => h.player.time()), { timeout: 5000 })
      .toBeGreaterThan(0.3);
    await transport.getByRole('button', { name: '暫停', exact: true }).click();
    const t = await hook(page, (h) => h.player.time());
    await page.waitForTimeout(300);
    expect(await hook(page, (h) => h.player.time())).toBe(t);
    /* 跳到結尾（時間軸聚焦時 End） */
    await transport.getByRole('slider', { name: '時間軸' }).focus();
    await page.keyboard.press('End');
    await expect(transport.getByTestId('transport-time')).toHaveText('0:06／0:06');
    await page.keyboard.press('Home');
    await expect(transport.getByTestId('transport-time')).toHaveText('0:00／0:06');
    /* 整首波形：有音樂時用音樂的峰值（和示意的不同） */
    await tab(page, '動態').click();
    await page.getByRole('radio', { name: '整首波形', exact: true }).click();
    const withAudio = await after(page, () =>
      transport.getByRole('slider', { name: '時間軸' }).press('PageUp'),
    );
    /* 移除音樂 → 回到循環預覽 */
    await page.getByRole('button', { name: '移除音樂' }).click();
    await expect(page.getByTestId('loop-transport')).toBeVisible();
    expect((await settings(page)).audio.id).toBeNull();
    await expect.poll(() => signature(page)).not.toBe(withAudio);
    /* 不能播放的檔案 */
    await tab(page, '曲目').click();
    await audioInput(page).setInputFiles(
      file('broken.mp3', 'audio/mpeg', Buffer.from('not audio')),
    );
    await expect(page.getByText(/「broken\.mp3」無法播放/).first()).toBeVisible();
    expect((await session(page)).audioState).toBe('none');
    expect(errors).toEqual([]);
  });

  test('拖放：圖片→封面、音樂→音樂、歌詞檔→歌詞；其他檔案提示', async ({ page }) => {
    const errors = await open(page);
    await dropFiles(page, [
      { name: 'drop.png', type: 'image/png', b64: (await coverPng(120, 120)).toString('base64') },
      { name: 'drop.wav', type: 'audio/wav', b64: wavBytes(3).toString('base64') },
      {
        name: 'song.lrc',
        type: '',
        b64: Buffer.from('[00:00.50]第一句\n[00:01.50]第二句').toString('base64'),
      },
      { name: 'data.zip', type: 'application/zip', b64: Buffer.from('PK').toString('base64') },
    ]);
    await expect.poll(async () => (await session(page)).coverState).toBe('ready');
    await expect.poll(async () => (await session(page)).audioState).toBe('ready');
    await expect.poll(async () => (await settings(page)).lyrics.fileName).toBe('song.lrc');
    const s = await settings(page);
    expect([s.cover.name, s.audio.name, s.lyrics.enabled]).toEqual(['drop.png', 'drop.wav', true]);
    expect(s.lyrics.text).toBe('[00:00.50]第一句\n[00:01.50]第二句');
    await expect(page.getByText('「data.zip」不是圖片、音樂或歌詞檔。').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('歌詞：開關、文字、狀態、檔案（Big5）、偏移、位置、大小、預告', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '歌詞').click();
    await page.getByRole('switch', { name: '隨時間顯示歌詞' }).click();
    const area = page.getByTestId('lyrics-text');
    /* 沒有音樂時歌詞依「進度位置」的時間（5:28）；放一句在 5:20 */
    const sig0 = await signature(page);
    await area.fill(
      '[05:20.00] 酒館的門被推開了\n[05:20.00] [-] The tavern door opens\n沒有時間的一行\n[05:30.00] 下一句',
    );
    await expect(
      page.getByText('讀到 2 句歌詞・翻譯 1 句・沒有時間的 1 行不會顯示。'),
    ).toBeVisible();
    await expect.poll(() => signature(page)).not.toBe(sig0);
    const shown = await signature(page);
    /* 時間偏移 −3 秒：歌詞的時間＝5:28 ＋ 3 秒 → 換成 5:30 的下一句 */
    await changes(page, async () => {
      const off = page.getByRole('spinbutton', { name: '時間偏移' });
      await off.fill('-3');
      await off.press('Enter');
    });
    expect((await settings(page)).lyrics.offset).toBe(-3);
    await changes(page, () =>
      page.getByRole('radio', { name: '曲目資訊下方', exact: true }).click(),
    );
    expect((await settings(page)).lyrics.position).toBe('stack');
    await changes(page, async () => {
      const size = page.getByRole('spinbutton', { name: '大小' });
      await size.fill('48');
      await size.press('Enter');
    });
    await changes(page, () => page.getByRole('switch', { name: '預告下一句' }).click());
    /* 中央版面：位置固定在資訊下方 */
    await tab(page, '設計').click();
    await page.getByRole('radio', { name: '中央', exact: true }).click();
    await tab(page, '歌詞').click();
    await expect(page.getByText('中央版面固定在曲目資訊下方。').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: '畫面下方', exact: true })).toBeDisabled();
    /* 關掉歌詞：畫面回到沒有歌詞的樣子 */
    await tab(page, '設計').click();
    await page.getByRole('radio', { name: '左右', exact: true }).click();
    await tab(page, '歌詞').click();
    await page.getByRole('switch', { name: '隨時間顯示歌詞' }).click();
    await expect.poll(() => signature(page)).toBe(sig0);
    expect(shown).not.toBe(sig0);
    /* 歌詞檔（Big5 編碼的 .lrc） */
    await page.getByRole('switch', { name: '隨時間顯示歌詞' }).click();
    const big5 = Buffer.from([
      ...Buffer.from('[00:01.00]'),
      0xb4,
      0xfa,
      0xb8,
      0xd5,
      0x0a,
      ...Buffer.from('[00:02.00]'),
      0xa4,
      0x40,
    ]);
    await page
      .locator('input[type=file][accept^=".lrc"]')
      .setInputFiles(file('big5.lrc', 'application/octet-stream', big5));
    await expect(area).toHaveValue('[00:01.00]測試\n[00:02.00]一');
    await expect(page.getByText('以 Big5 編碼讀取。').first()).toBeVisible();
    expect((await settings(page)).lyrics.fileName).toBe('big5.lrc');
    expect(errors).toEqual([]);
  });

  test('歌詞的打點：按鈕與 Ctrl＋Enter、翻譯行跟著、全部有時間、復原', async ({ page }) => {
    const errors = await open(page);
    await loadAudio(page);
    await tab(page, '歌詞').click();
    await page.getByRole('switch', { name: '隨時間顯示歌詞' }).click();
    const area = page.getByTestId('lyrics-text');
    await area.fill('第一行\n[-] first\n第二行');
    await area.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(0, 0);
    });
    await hook(page, (h) => h.player.seek(1.5));
    await page.getByTestId('stamp').click();
    await expect(area).toHaveValue('[00:01.50] 第一行\n[00:01.50] [-] first\n第二行');
    await area.focus();
    await hook(page, (h) => h.player.seek(3.25));
    await page.keyboard.press('Control+Enter');
    /* 打完最後一行：尾端補一個換行，游標在最後 */
    await expect(area).toHaveValue('[00:01.50] 第一行\n[00:01.50] [-] first\n[00:03.25] 第二行\n');
    const lines = await hook(page, (h) => h.lyrics().lines);
    expect(lines.map((l) => [l.t, l.text, l.tr])).toEqual([
      [1.5, '第一行', 'first'],
      [3.25, '第二行', ''],
    ]);
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText(/每一行都有時間了/).first()).toBeVisible();
    /* 復原：一次退一個打點 */
    await page.getByRole('button', { name: /^復原/ }).click();
    await expect(area).toHaveValue('[00:01.50] 第一行\n[00:01.50] [-] first\n第二行');
    /* 沒有音樂時不能打點 */
    await page.getByRole('button', { name: '移除音樂' }).click();
    await expect(page.getByTestId('stamp')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('PNG：1920 × 1080、檔名、與預覽逐點相同', async ({ page }) => {
    const errors = await open(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-png').click(),
    ]);
    expect(download.suggestedFilename()).toBe('星夜下的酒館 - 吟遊詩人樂團.png');
    const bytes = readFileSync((await download.path()) as string);
    expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    const points = [
      [80, 44],
      [400, 540],
      [1000, 540],
      [1700, 900],
      [960, 20],
    ];
    const fromPng = await page.evaluate(
      async ([b64, pts]) => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const g = c.getContext('2d')!;
        g.drawImage(bmp, 0, 0);
        return {
          size: [bmp.width, bmp.height],
          px: pts.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3))),
        };
      },
      [bytes.toString('base64'), points] as const,
    );
    expect(fromPng.size).toEqual([1920, 1080]);
    for (let i = 0; i < points.length; i++) {
      const p = await pixel(page, points[i][0], points[i][1]);
      for (let k = 0; k < 3; k++) expect(Math.abs(p[k] - fromPng.px[i][k])).toBeLessThanOrEqual(2);
    }
    await expect(page.getByText(/已儲存 星夜下的酒館/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('文字反鋸齒：預覽與 PNG 的小字是灰階（沒有彩色的邊）、PNG 不透明', async ({ page }) => {
    const errors = await open(page);
    /* 灰色封面：底色、文字色都是灰色，文字像素的彩度只會來自 LCD 次像素反鋸齒 */
    const drawn = await rendered(page);
    await coverInput(page).setInputFiles(
      file('gray.png', 'image/png', await solidPng(300, 300, [128, 128, 128])),
    );
    await expect.poll(async () => (await session(page)).coverState).toBe('ready');
    await hook(page, (h) => {
      h.set('grain', false);
      h.set('motion', false);
    });
    await expect.poll(() => rendered(page)).toBeGreaterThan(drawn);
    await page.waitForTimeout(150);
    /* 歌手那一行（34 px，左右版面 x 910、y 約 457～501） */
    const artist: [number, number, number, number] = [900, 450, 420, 60];
    const live = await textChroma(page, artist);
    expect(live.textPixels, '區域裡要有文字').toBeGreaterThan(200);
    expect(live.maxChroma, `預覽：文字像素的最大彩度 ${live.maxChroma}`).toBeLessThanOrEqual(12);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-png').click(),
    ]);
    const png = readFileSync((await download.path()) as string);
    const out = await textChroma(page, artist, png);
    expect(out.textPixels).toBeGreaterThan(200);
    expect(out.maxChroma, `PNG：文字像素的最大彩度 ${out.maxChroma}`).toBeLessThanOrEqual(12);
    /* 背景鋪滿：輸出照樣不透明 */
    expect(out.minAlpha).toBe(255);
    expect(errors).toEqual([]);
  });

  test('影片（逐格）：有音樂的區間 → MP4（畫面＋聲音，可以播放）；區間太短', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page);
    await loadAudio(page);
    await tab(page, '匯出').click();
    await expect(page.locator('[data-disabled-format]')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'MP4', exact: true })).toBeEnabled();
    await page.getByRole('radio', { name: '指定區間', exact: true }).click();
    const start = page.getByRole('textbox', { name: '開始' });
    const end = page.getByRole('textbox', { name: '結束' });
    /* 區間太短 */
    await start.fill('0:02');
    await start.press('Enter');
    await end.fill('0:02.5');
    await end.press('Enter');
    await expect(page.getByTestId('range-error')).toHaveText('區間太短：結束要比開始晚 1 秒以上。');
    await end.fill('0:04');
    await end.press('Enter');
    await expect(page.getByTestId('range-error')).toHaveCount(0);
    const video = await exportVideo(page);
    expect(video.name).toBe('星夜下的酒館 - 吟遊詩人樂團.mp4');
    const b = video.bytes;
    const top = boxes(b);
    expect(top.map((x) => x.type)).toEqual(['ftyp', 'moov', 'mdat']);
    const traks = top[1].children.filter((x) => x.type === 'trak');
    expect(traks).toHaveLength(2);
    const vStbl = child(traks[0], 'mdia', 'minf', 'stbl')!;
    const vEntry = ascii(b, child(vStbl, 'stsd')!.start + 20);
    expect(['avc1', 'vp09']).toContain(vEntry);
    expect(u32(b, child(vStbl, 'stsz')!.start + 16)).toBe(60);
    /* 關鍵影格每 2 秒（60 格）一個 */
    expect(u32(b, child(vStbl, 'stss')!.start + 12)).toBe(1);
    const aEntry = ascii(b, child(traks[1], 'mdia', 'minf', 'stbl', 'stsd')!.start + 20);
    expect(['mp4a', 'Opus', 'sowt']).toContain(aEntry);
    if (vEntry === 'vp09') {
      const info = await probeVideo(page, b, 'video/mp4');
      expect(info.width).toBe(1920);
      expect(info.height).toBe(1080);
      expect(Math.abs(info.duration - 2)).toBeLessThan(0.1);
      expect(info.meanLum).toBeGreaterThan(5);
      expect(info.audio).not.toBeNull();
      expect(Math.abs(info.audio!.duration - 2)).toBeLessThan(0.1);
      expect(info.audio!.peak).toBeGreaterThan(0.1);
    }
    await expect(page.getByTestId('export-result')).toContainText('30 FPS');
    expect(errors).toEqual([]);
  });

  test('影片（逐格）：沒有音樂的循環、60 FPS、取消', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page);
    await tab(page, '匯出').click();
    const loop = page.getByRole('spinbutton', { name: '循環長度' });
    await loop.fill('4');
    await loop.press('Enter');
    const video = await exportVideo(page);
    const top = boxes(video.bytes);
    const traks = top[1].children.filter((x) => x.type === 'trak');
    expect(traks).toHaveLength(1);
    expect(u32(video.bytes, child(traks[0], 'mdia', 'minf', 'stbl', 'stsz')!.start + 16)).toBe(120);
    const mdhd = child(traks[0], 'mdia', 'mdhd')!;
    expect(u32(video.bytes, mdhd.start + 20)).toBe(30);
    /* 60 FPS、20 秒 → 取消 */
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '60 fps' }).click();
    expect((await settings(page)).export.fps).toBe(60);
    await loop.fill('20');
    await loop.press('Enter');
    await page.getByRole('button', { name: /^匯出 / }).click();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.getByText('已取消匯出。').first()).toBeVisible();
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    expect((await session(page)).exporting).toBe(false);
    expect(errors).toEqual([]);
  });

  test('影片（即時錄影）：不能逐格編碼時錄預覽的畫布＋音樂', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page);
    await loadAudio(page, 3);
    await hook(page, (h) => h.forceRealtime(true));
    await tab(page, '匯出').click();
    await expect(page.getByRole('radio', { name: /（即時錄影）$/ })).toBeVisible();
    await expect(page.getByText(/改用即時錄影/).first()).toBeVisible();
    await page.getByRole('radio', { name: '指定區間', exact: true }).click();
    const end = page.getByRole('textbox', { name: '結束' });
    await end.fill('0:01.5');
    await end.press('Enter');
    await page.getByRole('switch', { name: '錄影時喇叭靜音' }).click();
    const video = await exportVideo(page);
    expect(video.name).toMatch(/^星夜下的酒館 - 吟遊詩人樂團\.(webm|mp4)$/);
    const b = video.bytes;
    if (video.name.endsWith('.webm'))
      expect([...b.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    else expect(ascii(b, 4)).toBe('ftyp');
    expect(b.length).toBeGreaterThan(10_000);
    expect(await hook(page, (h) => h.player.playing())).toBe(false);
    expect((await session(page)).recording).toBe(false);
    expect(errors).toEqual([]);
  });

  test('影片：瀏覽器完全不能匯出影片時停用並說明', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.VideoEncoder;
      delete w.AudioEncoder;
      delete w.MediaRecorder;
    });
    const errors = await open(page);
    await tab(page, '匯出').click();
    await expect(page.locator('[data-disabled-format="video"]')).toContainText(
      '這個瀏覽器不支援匯出影片',
    );
    await expect(page.getByRole('button', { name: /^匯出 / })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('自動保存、復原／重做、專案檔（封面＋音樂）、重設', async ({ page }) => {
    const errors = await open(page);
    /* 文字欄：打字在離開時算一步 */
    const title = page.getByRole('textbox', { name: '標題' });
    await title.fill('龍之谷的夜曲');
    await title.blur();
    await tab(page, '設計').click();
    await page.getByRole('radio', { name: '中央', exact: true }).click();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await settings(page)).layout).toBe('split');
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await settings(page)).layout).toBe('center');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await settings(page)).title).toBe('星夜下的酒館');
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await settings(page)).layout).toBe('center');
    /* 封面與音樂 */
    await tab(page, '曲目').click();
    await coverInput(page).setInputFiles(file('cover.png', 'image/png', await coverPng()));
    await expect.poll(async () => (await session(page)).coverState).toBe('ready');
    await loadAudio(page, 2);
    const saved = await settings(page);
    await expect(page.getByText(/已自動儲存/).first()).toBeVisible();

    /* 重新整理：設定、封面、音樂都還在 */
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as Partial<W>).__musicFrame);
    await expect.poll(async () => (await session(page)).coverState).toBe('ready');
    await expect.poll(async () => (await session(page)).audioState).toBe('ready');
    expect(await settings(page)).toEqual(saved);
    await expect(page.getByTestId('audio-info')).toHaveText('test.wav・0:02');

    /* 專案檔（ZIP：project.json＋封面＋音樂）→ 重設 → 開啟 */
    await page.getByRole('button', { name: '專案' }).click();
    const [proj] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(proj.suggestedFilename()).toMatch(/^龍之谷的夜曲_\d{8}\.zip$/);
    const zipPath = (await proj.path()) as string;
    const zip = unzipSync(new Uint8Array(readFileSync(zipPath)));
    const names = Object.keys(zip).sort();
    expect(names).toContain('project.json');
    expect(
      names
        .filter((n) => n.startsWith('files/'))
        .map((n) => n.split('.').pop())
        .sort(),
    ).toEqual(['png', 'wav']);
    const json = JSON.parse(strFromU8(zip['project.json']));
    expect(json.data.title).toBe('龍之谷的夜曲');
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect.poll(async () => (await settings(page)).title).toBe('星夜下的酒館');
    await expect.poll(async () => (await session(page)).demo).toBe(true);
    await expect.poll(async () => (await session(page)).audioState).toBe('none');
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(zipPath);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect.poll(async () => settings(page)).toEqual(saved);
    await expect.poll(async () => (await session(page)).coverState).toBe('ready');
    await expect.poll(async () => (await session(page)).audioState).toBe('ready');
    expect(errors).toEqual([]);
  });

  test('匯出中：專案選單的「開啟專案檔」「重設」停用；被擋下時不說專案檔壞了', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page);
    const menu = () => page.getByRole('button', { name: '專案' }).click();
    const item = (name: string) => page.getByRole('menuitem', { name });
    await menu();
    const [proj] = await Promise.all([page.waitForEvent('download'), item('存成專案檔…').click()]);
    const zipPath = (await proj.path()) as string;
    await dismissToasts(page);
    await tab(page, '匯出').click();
    const loop = page.getByRole('spinbutton', { name: '循環長度' });
    await loop.fill('20');
    await loop.press('Enter');
    const exportButton = page.getByRole('button', { name: /^匯出 / });

    /* 匯出中打開選單：會換掉內容的項目停用，存檔照常 */
    await exportButton.click();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await menu();
    await expect(item('開啟專案檔…')).toBeDisabled();
    await expect(item('重設…')).toBeDisabled();
    await expect(item('存成專案檔…')).toBeEnabled();
    let chooser = false;
    page.once('filechooser', () => {
      chooser = true;
    });
    await item('開啟專案檔…').click({ force: true });
    await page.waitForTimeout(300);
    expect(chooser, '停用時不開選檔視窗').toBe(false);
    await page.keyboard.press('Escape');
    await expect(item('開啟專案檔…')).toHaveCount(0);
    await page.getByRole('button', { name: '取消' }).click();
    await expect.poll(async () => (await session(page)).exporting).toBe(false);
    await dismissToasts(page);
    await menu();
    await expect(item('開啟專案檔…')).toBeEnabled();
    await expect(item('重設…')).toBeEnabled();

    /* 選檔視窗開著時開始匯出：開啟被擋下，只說「匯出中」，不說專案檔的內容無法使用 */
    const [picker] = await Promise.all([
      page.waitForEvent('filechooser'),
      item('開啟專案檔…').click(),
    ]);
    await exportButton.click();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await picker.setFiles(zipPath);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(page.getByText('匯出中，請等匯出完成或取消後再操作。').first()).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByText('專案檔的內容無法使用')).toHaveCount(0);
    expect((await settings(page)).export.loopLength).toBe(20);
    await page.getByRole('button', { name: '取消' }).click();
    await expect.poll(async () => (await session(page)).exporting).toBe(false);
    expect(errors).toEqual([]);
  });

  test('鍵盤：空白鍵、Alt＋Shift＋P 播放／暫停；快捷鍵說明', async ({ page }) => {
    const errors = await open(page);
    const loop = page.getByTestId('loop-transport');
    const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await blur();
    await page.keyboard.press('Space');
    await expect(loop.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(loop.getByRole('button', { name: '播放', exact: true })).toBeVisible();
    /* 在文字欄裡也可以用 Alt＋Shift＋P */
    await page.getByRole('textbox', { name: '標題' }).focus();
    await page.keyboard.press('Alt+Shift+P');
    await expect(loop.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    await page.keyboard.press('Alt+Shift+P');
    await expect(loop.getByRole('button', { name: '播放', exact: true })).toBeVisible();
    /* 有音樂時控制音樂 */
    await loadAudio(page);
    await blur();
    await page.keyboard.press('Space');
    await expect.poll(() => hook(page, (h) => h.player.playing())).toBe(true);
    await page.keyboard.press('Space');
    await expect.poll(() => hook(page, (h) => h.player.playing())).toBe(false);
    /* 快捷鍵說明 */
    await page.keyboard.press('?');
    const help = page.getByRole('dialog');
    await expect(help).toContainText('打點（歌詞欄裡也可用）');
    await expect(help).toContainText('播放／暫停');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await dismissToasts(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('music-frame-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    for (const name of ['設計', '動態', '歌詞', '匯出', '曲目']) {
      await tab(page, name).click();
      await noHorizontalScroll(page);
    }
    await tab(page, '歌詞').click();
    await page.getByRole('switch', { name: '隨時間顯示歌詞' }).click();
    await noHorizontalScroll(page);
    await page.getByRole('switch', { name: '隨時間顯示歌詞' }).click();
    await tab(page, '曲目').click();
    await dismissToasts(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('music-frame-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
