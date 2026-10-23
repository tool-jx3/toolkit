/**
 * 歌詞演出產生器（建置產物 tools/lyric-fx/）的端對端測試（規格 docs/refactor/specs/lyric-fx.md）：
 * - 開頁：外框、頁尾、示範歌詞的狀態、沒有 console error；預覽只由時間決定（同一個時間畫出來逐點相同）；
 * - 歌詞：打字、語言、略過的行、演出延遲、讀歌詞檔、沒有時間標記、打點（按鈕與 Ctrl＋Enter）；
 * - 逐句調整：改時間、改字、還原、重抽、鎖定（重新抽位置也不動）、清除；重新抽位置（G）與復原；
 * - 風格：字級、中英文樣式、配色預設（內建、存成預設、刪除）、發光、透視、預點亮（槽位）、角度範圍；
 * - 避開區域：在預覽上框選、完成／取消（Esc）、數值欄、清除；排出來的句避開它；
 * - 畫面：尺寸、背景色、背景圖；音樂（選檔、播放列、拿掉）；拖放；
 * - 匯出：有聲影片（無頭 Chromium 是 VP9＋Opus 的 MP4，用 <video> 讀回）、透明 WebM（解析 EBML、<video> 讀回檢查透明度）、
 *   PNG 連番（解析 ZIP）、PNG（與預覽逐點相同）、PNG 連番超過上限時停用；
 * - 逐句的手動調整（F75～F81）：預覽上點選、拖曳、旋轉（Shift 每 15°）、方向鍵、Esc；清單的欄位（X、Y、角度、顏色、大小、
 *   透明度、字型）；恢復自動、復原、清除；字型換了之後的寬度與折行、逐句的字型先載入；PNG、PNG 連番的像素；390 寬觸控拖曳；
 * - 自動儲存（重新整理後音樂還在）、專案檔（ZIP）、重設；鍵盤；390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodeWav } from '../../src/core/audio/pcm';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const PAGE_URL = `/${outputDir(getTool('lyric-fx') ?? { id: 'lyric-fx', status: 'next' })}/`;

interface PlanLine {
  key: string;
  x: number;
  y: number;
  angle: number;
  rows: string[];
  start: number;
  interval: number;
  slotBorn: number | null;
  fadeStart: number | null;
  fadeEnd: number | null;
  box: { x: number; y: number; width: number; height: number };
  locked: boolean;
  latin: boolean;
  font: string;
  pinned: boolean;
  th: number | null;
  textColor: string | null;
  glowColor: string | null;
  opacity: number | null;
  /** 每個字的前進寬度的和 */
  width: number;
}
interface Pt {
  x: number;
  y: number;
}
interface Placement {
  x: number;
  y: number;
  angle: number;
  bounds: { x: number; y: number; width: number; height: number };
  box: { x: number; y: number; width: number; height: number } | null;
  pivot: Pt;
  tip: Pt;
  shownAt: number;
  fixed: boolean;
}
interface Hook {
  // biome-ignore lint/suspicious/noExplicitAny: 測試讀設定的各種欄位
  settings: () => Record<string, any>;
  set: (path: string, value: unknown) => void;
  session: () => {
    audioState: string;
    duration: number;
    bgState: string;
    exporting: boolean;
    fontTick: number;
    regionEditing: boolean;
    regionPending: unknown;
  };
  lines: () => { key: string; t: number; end: number; text: string; tr: string }[];
  rows: () => {
    key: string;
    t: number;
    text: string;
    tr: string;
    skipped: string | null;
    edited: boolean;
  }[];
  plan: () => { width: number; height: number; preview: number; lines: PlanLine[] };
  seek: (t: number) => void;
  time: () => number;
  toggle: () => void;
  selected: () => string | null;
  select: (key: string | null) => void;
  placement: (key: string, t?: number) => Placement | null;
  hit: (x: number, y: number, t?: number) => string | null;
}
type W = { __lyricFx: Hook };
const hook = <T>(page: Page, fn: (h: Hook) => T) =>
  page.evaluate((src) => {
    const h = (window as unknown as W).__lyricFx;
    return new Function('h', `return (${src})(h)`)(h);
  }, fn.toString()) as Promise<Awaited<T>>;
const settings = (page: Page) => hook(page, (h) => h.settings());
const session = (page: Page) => hook(page, (h) => h.session());
const plan = (page: Page) => hook(page, (h) => h.plan());
const set = (page: Page, path: string, value: unknown) =>
  page.evaluate(([p, v]) => (window as unknown as W).__lyricFx.set(p as string, v), [path, value]);
const seek = (page: Page, t: number) =>
  page.evaluate((tt) => (window as unknown as W).__lyricFx.seek(tt), t);

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
const canvas = (page: Page) => page.getByTestId('preview-canvas');
const rendered = (page: Page) =>
  canvas(page)
    .getAttribute('data-rendered')
    .then((v) => Number(v ?? 0));

/** 預覽畫布：不透明（alpha > 0）的像素數與指紋 */
const frameInfo = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) ink++;
      if (i % (4 * 31) === 0)
        h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13 + d[i + 3] * 17) >>> 0;
    }
    return { ink, hash: h, w: c.width, h2: c.height };
  });

/** 跳到時間 t、等預覽畫好 */
async function at(page: Page, t: number) {
  await seek(page, t);
  await expect.poll(() => canvas(page).getAttribute('data-time')).toBe(t.toFixed(3));
  await page.waitForTimeout(60);
  return frameInfo(page);
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE_URL);
  await expect(page.getByRole('heading', { level: 1, name: '歌詞演出產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__lyricFx);
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

/** 測試音檔：seconds 秒、44.1 kHz、立體聲 */
function wavBytes(seconds = 6, sr = 44100): Buffer {
  const n = Math.round(seconds * sr);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    a[i] = Math.sin(2 * Math.PI * 330 * t) * 0.2 * Math.exp(-(t % 0.5) * 6);
  }
  return Buffer.from(encodeWav({ sampleRate: sr, channels: [a, a.slice()] }));
}

async function solidPng(w: number, h: number, rgb: [number, number, number]): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([...rgb, 255], i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });
const audioInput = (page: Page) => page.locator('input[type=file][accept^="audio/*"]');

async function loadAudio(page: Page, seconds = 6) {
  await tab(page, '畫面').click();
  await audioInput(page).setInputFiles(file('song.wav', 'audio/wav', wavBytes(seconds)));
  await expect.poll(async () => (await session(page)).audioState).toBe('ready');
  await expect(page.getByTestId('audio-transport')).toBeVisible();
}

/** 匯出並下載 */
async function exportFile(page: Page, format: RegExp) {
  await tab(page, '匯出').click();
  await page.getByRole('radio', { name: format }).click();
  await page.getByRole('button', { name: /^匯出 / }).click();
  const card = page.getByTestId('export-result');
  await expect(card).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await download.path()) as string)),
  };
}

/** 在頁面上用 <video> 讀影片：尺寸、長度、某一格的透明／不透明像素 */
const probeVideo = (page: Page, bytes: Uint8Array, type: string, t: number) =>
  page.evaluate(
    async ([b64, mime, tt]) => {
      const bin = atob(b64 as string);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: mime as string }));
      const v = document.createElement('video');
      v.muted = true;
      v.src = url;
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error('video error'));
      });
      v.currentTime = tt as number;
      await new Promise<void>((res) => {
        v.onseeked = () => res();
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext('2d')!;
      g.drawImage(v, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let transparent = 0;
      let opaque = 0;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) transparent++;
        else if (d[i + 3] > 250) opaque++;
        if (d[i + 3] > 200 && d[i] > 200 && d[i + 1] > 200) bright++;
      }
      URL.revokeObjectURL(url);
      return {
        w: v.videoWidth,
        h: v.videoHeight,
        duration: v.duration,
        transparent,
        opaque,
        bright,
      };
    },
    [Buffer.from(bytes).toString('base64'), type, t] as const,
  );

const TWO = '[00:00.20]第一句測試的歌詞\n[00:02.00]第二句也在這裡\n[00:04.00]第三句結束';

/* ---------- 逐句的手動調整（F75～F81） ---------- */

const placementOf = (page: Page, key: string, t?: number) =>
  page.evaluate(
    ([k, tt]) =>
      (window as unknown as W).__lyricFx.placement(k as string, tt as number | undefined),
    [key, t] as const,
  ) as Promise<Placement>;

/** 畫面的比例 → 螢幕座標 */
async function toScreen(page: Page, p: Pt): Promise<Pt> {
  const r = await canvas(page).boundingBox();
  if (!r) throw new Error('no canvas');
  return { x: r.x + p.x * r.width, y: r.y + p.y * r.height };
}

/** 跳到一句完整出現的時間（暫停）、等預覽畫好 */
async function showLine(page: Page, key: string) {
  const pl = await placementOf(page, key, 0);
  await at(page, Math.round(pl.shownAt * 1000) / 1000);
}

/** 解一張 PNG：紅色（文字顏色 #ff0000）的像素數與最大的不透明度 */
const redPixels = (page: Page, png: Uint8Array) =>
  page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }), {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let count = 0;
    let maxAlpha = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] > 0 && d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) {
        count++;
        maxAlpha = Math.max(maxAlpha, d[i + 3]);
      }
    return { count, maxAlpha, w: bmp.width, h: bmp.height };
  }, Buffer.from(png).toString('base64'));

async function savePngBytes(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-png').click(),
  ]);
  return new Uint8Array(readFileSync((await download.path()) as string));
}

const ex = <T>(v: T | null | undefined): T => {
  if (v == null) throw new Error('missing');
  return v;
};

test.describe('歌詞演出產生器', () => {
  test('開頁：外框、頁尾、示範歌詞；預覽只由時間決定', async ({ page }) => {
    const errors = await open(page);
    await expect(
      page.getByRole('link', { name: 'YouRanCoder/LimbusLyricSimulator' }),
    ).toHaveAttribute('href', 'https://github.com/YouRanCoder/LimbusLyricSimulator');
    await expect(page.getByText('讀到 9 句、3 句有翻譯、略過 1 句。')).toBeVisible();
    const s = await settings(page);
    expect(s.styleId).toBe('scatter');
    expect(s.canvas.size).toBe('1920x1080');
    expect(s.background.kind).toBe('transparent');
    /* 第一句前沒有字；之後有字；同一個時間畫出來逐點相同（倒回去、再前進） */
    expect((await at(page, 0.5)).ink).toBe(0);
    const a = await at(page, 12.5);
    expect(a.ink).toBeGreaterThan(200);
    expect(a.w).toBe(1920);
    await at(page, 3);
    const b = await at(page, 12.5);
    expect(b.hash).toBe(a.hash);
    /* 每一句的開始在時間軸上有標記 */
    await expect(page.getByTestId('loop-transport')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('歌詞：打字、語言、略過的行、演出延遲、沒有時間標記', async ({ page }) => {
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    await area.fill(TWO);
    await area.blur();
    await expect(page.getByText('讀到 3 句。')).toBeVisible();
    expect((await hook(page, (h) => h.lines())).map((l) => l.text)).toEqual([
      '第一句測試的歌詞',
      '第二句也在這裡',
      '第三句結束',
    ]);
    /* 同一時間的翻譯與語言 */
    await area.fill('[00:01.00]你好\n[00:01.00]Hello\n[00:03.00]作曲：某人\n[00:04.00]再見');
    await area.blur();
    await expect(page.getByText('讀到 2 句、1 句有翻譯、略過 1 句。')).toBeVisible();
    await page.getByRole('radio', { name: '翻譯', exact: true }).click();
    expect((await hook(page, (h) => h.lines())).map((l) => l.text)).toEqual(['Hello', '再見']);
    await page.waitForTimeout(450);
    await page.getByRole('radio', { name: '原文＋翻譯' }).click();
    await expect.poll(async () => (await hook(page, (h) => h.lines()))[0].tr).toBe('Hello');
    expect((await plan(page)).lines[0].rows).toEqual(['你好', 'Hello']);
    /* 略過的行：關掉就照樣排 */
    await page.getByRole('button', { name: '略過的行' }).click();
    await page.getByRole('switch', { name: '略過作詞作曲等資訊行' }).click();
    await expect.poll(async () => (await hook(page, (h) => h.lines())).length).toBe(3);
    await page.getByRole('switch', { name: '略過作詞作曲等資訊行' }).click();
    await expect.poll(async () => (await hook(page, (h) => h.lines())).length).toBe(2);
    /* 改關鍵字、還原預設 */
    const words = page.getByRole('textbox', { name: '資訊行的關鍵字' });
    await words.fill('再見');
    await words.blur();
    await expect
      .poll(async () => (await hook(page, (h) => h.lines())).map((l) => l.text))
      .toEqual(['你好', '作曲：某人']);
    await page.getByRole('button', { name: '還原預設的關鍵字' }).first().click();
    await expect.poll(async () => (await hook(page, (h) => h.lines())).length).toBe(2);
    /* 演出延遲 */
    const offset = page.getByRole('spinbutton', { name: '演出延遲' });
    await offset.fill('1.5');
    await offset.press('Enter');
    await expect.poll(async () => (await hook(page, (h) => h.lines()))[0].t).toBe(2.5);
    /* 沒有時間標記：整段當一句 */
    await area.fill('沒有時間的第一行\n第二行');
    await area.blur();
    await expect(page.getByText(/沒有時間標記：整段當成一句/)).toBeVisible();
    const p = await plan(page);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].rows).toEqual(['沒有時間的第一行', '第二行']);
    expect(p.lines[0].interval).toBe(50);
    expect(errors).toEqual([]);
  });

  test('歌詞檔、音樂、打點（按鈕與 Ctrl＋Enter）、拿掉音樂、拖放', async ({ page }) => {
    const errors = await open(page);
    await page
      .locator('input[type=file][accept^=".lrc"]')
      .setInputFiles(file('song.lrc', 'text/plain', Buffer.from(TWO)));
    await expect.poll(async () => (await settings(page)).lyrics.fileName).toBe('song.lrc');
    await expect(page.getByText('song.lrc').first()).toBeVisible();
    /* 打點：沒有音樂時停用 */
    await expect(page.getByTestId('stamp')).toBeDisabled();
    await loadAudio(page, 4);
    expect((await settings(page)).audio.name).toBe('song.wav');
    await tab(page, '歌詞').click();
    const area = page.getByTestId('lyrics-text');
    await area.fill('第一行\n第二行');
    await area.blur();
    await page.waitForTimeout(450);
    await seek(page, 1.25);
    await area.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(0, 0);
    });
    await page.getByTestId('stamp').click();
    await expect(area).toHaveValue('[00:01.25] 第一行\n第二行');
    await seek(page, 2.5);
    await area.focus();
    await page.keyboard.press('Control+Enter');
    await expect(area).toHaveValue('[00:01.25] 第一行\n[00:02.50] 第二行\n');
    /* 拿掉音樂 */
    await page.getByRole('button', { name: '拿掉音樂' }).first().click();
    await expect.poll(async () => (await session(page)).audioState).toBe('none');
    await expect(page.getByTestId('loop-transport')).toBeVisible();
    /* 拖放：音樂、背景圖、不支援的檔 */
    const png = (await solidPng(64, 36, [10, 120, 200])).toString('base64');
    await page.evaluate(
      (list) => {
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
      },
      [
        { name: 'bg.png', type: 'image/png', b64: png },
        { name: 'x.bin', type: 'application/octet-stream', b64: 'AAAA' },
      ],
    );
    await expect.poll(async () => (await settings(page)).background.kind).toBe('image');
    await expect.poll(async () => (await session(page)).bgState).toBe('ready');
    await expect(page.getByText('不支援的檔案：x.bin').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('逐句調整：改時間、改字、還原、重抽、鎖定、清除；重新抽位置（G）與復原', async ({
    page,
  }) => {
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    await area.fill(TWO);
    await area.blur();
    await page.waitForTimeout(450);
    const rows = page.getByTestId('line-row');
    await expect(rows).toHaveCount(3);
    /* 改時間 */
    const time2 = rows.nth(1).getByTestId('line-time');
    await time2.fill('0:05.50');
    await time2.press('Enter');
    await expect
      .poll(async () => (await hook(page, (h) => h.lines())).map((l) => l.text))
      .toEqual(['第一句測試的歌詞', '第三句結束', '第二句也在這裡']);
    expect((await settings(page)).lyrics.text).toBe(TWO);
    await page.waitForTimeout(450);
    /* 改字（清單依時間排，改過的那句現在是第 3 句） */
    const text3 = page.getByTestId('line-row').nth(2).getByTestId('line-text');
    await text3.fill('改過的第二句');
    await text3.press('Enter');
    await expect
      .poll(async () => (await hook(page, (h) => h.lines()))[2].text)
      .toBe('改過的第二句');
    await expect(page.getByTestId('line-row').nth(2).getByText('改過')).toBeVisible();
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: '還原第 3 句' }).click();
    await expect
      .poll(async () => (await hook(page, (h) => h.lines()))[1].text)
      .toBe('第二句也在這裡');
    await page.waitForTimeout(450);
    /* 重抽一句：那一句換位置、前面的不變 */
    const before = await plan(page);
    await page.getByRole('button', { name: '重抽第 2 句的位置' }).click();
    await expect
      .poll(async () => {
        const p = await plan(page);
        return [p.lines[1].x, p.lines[1].y];
      })
      .not.toEqual([before.lines[1].x, before.lines[1].y]);
    expect((await plan(page)).lines[0].x).toBe(before.lines[0].x);
    await page.waitForTimeout(450);
    /* 鎖定第 1 句 → 重新抽位置（G）不動它 */
    await page.getByRole('button', { name: '鎖定第 1 句的位置' }).click();
    await expect(page.getByTestId('line-row').first().getByText('已鎖定')).toBeVisible();
    const locked = (await plan(page)).lines[0];
    expect(locked.locked).toBe(true);
    await page.waitForTimeout(450);
    const seed = (await settings(page)).seed;
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('g');
    await expect.poll(async () => (await settings(page)).seed).not.toBe(seed);
    const after = await plan(page);
    expect([after.lines[0].x, after.lines[0].y, after.lines[0].angle]).toEqual([
      locked.x,
      locked.y,
      locked.angle,
    ]);
    /* 復原：種子回到原本的 */
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await settings(page)).seed).toBe(seed);
    await page.waitForTimeout(450);
    /* 清除逐句調整（先確認） */
    await page.getByTestId('clear-overrides').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '確定' }).click();
    await expect.poll(async () => Object.keys((await settings(page)).overrides).length).toBe(0);
    expect(errors).toEqual([]);
  });

  test('風格：字級、樣式、配色預設、發光、透視、預點亮、角度範圍', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '風格').click();
    await expect(page.getByTestId('lyric-style-controls')).toBeVisible();
    const t = 12.5;
    const base = await at(page, t);
    /* 字級 */
    const size = page.getByRole('spinbutton', { name: '字級' });
    await size.fill('60');
    await size.press('Enter');
    await expect.poll(async () => (await settings(page)).styles.scatter.fontSize).toBe(60);
    const big = await at(page, t);
    expect(big.ink).toBeGreaterThan(base.ink);
    await page.waitForTimeout(450);
    /* 中英文樣式：英文 */
    await page.getByRole('radio', { name: '英文', exact: true }).click();
    await expect.poll(async () => (await plan(page)).lines.every((l) => l.latin)).toBe(true);
    await page.waitForTimeout(450);
    await page.getByRole('radio', { name: '自動', exact: true }).click();
    await page.waitForTimeout(450);
    /* 配色預設：內建「紫」 */
    await page.getByRole('button', { name: '紫', exact: true }).click();
    await expect.poll(async () => (await settings(page)).styles.scatter.textColor).toBe('#b223cb');
    expect((await settings(page)).styles.scatter.glowColor).toBe('#b223cb');
    /* 存成預設、套用、刪除 */
    await page.getByRole('button', { name: '存成預設' }).click();
    await page.getByRole('dialog').getByRole('textbox', { name: '名稱' }).fill('我的紫');
    await page.getByRole('dialog').getByRole('button', { name: '存成預設' }).click();
    await expect(page.getByRole('button', { name: '我的紫', exact: true })).toBeVisible();
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: '金', exact: true }).click();
    await expect.poll(async () => (await settings(page)).styles.scatter.textColor).toBe('#fffeef');
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: '我的紫', exact: true }).click();
    await expect.poll(async () => (await settings(page)).styles.scatter.textColor).toBe('#b223cb');
    await page.getByRole('button', { name: '刪除「我的紫」' }).click();
    await expect(page.getByRole('button', { name: '我的紫', exact: true })).toHaveCount(0);
    /* 發光：關掉時光暈的設定收起來 */
    await page.getByRole('button', { name: '發光' }).click();
    await page.getByRole('switch', { name: '發光' }).click();
    await expect.poll(async () => (await settings(page)).styles.scatter.glow).toBe(false);
    await expect(page.getByText('光暈粗細')).toHaveCount(0);
    /* 透視：關掉時位置不變、畫面不同 */
    const withPersp = await at(page, t);
    await page.getByRole('button', { name: '3D 透視' }).click();
    await page.getByRole('switch', { name: '3D 透視' }).click();
    await expect.poll(async () => (await settings(page)).styles.scatter.perspective).toBe(false);
    const flat = await at(page, t);
    expect(flat.hash).not.toBe(withPersp.hash);
    /* 預點亮：同屏 3 句 → 槽位 */
    await page.getByRole('button', { name: '時間與預點亮' }).click();
    await page.getByRole('radio', { name: '同屏 3 句' }).click();
    await expect
      .poll(async () => (await plan(page)).lines.some((l) => l.slotBorn !== null))
      .toBe(true);
    /* 有翻譯而且顯示原文＋翻譯：不使用預點亮、說明 */
    await tab(page, '歌詞').click();
    await page.getByRole('radio', { name: '原文＋翻譯' }).click();
    await tab(page, '風格').click();
    await expect(page.getByRole('note').filter({ hasText: '預點亮暫停使用' })).toBeVisible();
    expect((await plan(page)).preview).toBe(0);
    /* 角度範圍 */
    await page.getByRole('button', { name: '動畫' }).click();
    const amin = page.getByRole('spinbutton', { name: '最小' });
    const amax = page.getByRole('spinbutton', { name: '最大' });
    await amin.fill('20');
    await amin.press('Enter');
    await amax.fill('30');
    await amax.press('Enter');
    await expect
      .poll(async () => (await plan(page)).lines.every((l) => l.angle >= 20 && l.angle <= 30))
      .toBe(true);
    expect(errors).toEqual([]);
  });

  test('避開區域：在預覽上框選、Esc 取消、完成、數值欄、清除；句子避開它', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '風格').click();
    await page.getByRole('button', { name: '位置' }).click();
    await page.getByTestId('region-pick').click();
    await expect.poll(async () => (await session(page)).regionEditing).toBe(true);
    const overlay = page.getByTestId('region-overlay');
    const box = (await overlay.boundingBox())!;
    const drag = async (x0: number, y0: number, x1: number, y1: number) => {
      await page.mouse.move(box.x + box.width * x0, box.y + box.height * y0);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1, { steps: 5 });
      await page.mouse.up();
    };
    await drag(0.3, 0.2, 0.7, 0.8);
    await expect(page.getByTestId('region-pending')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await session(page)).regionEditing).toBe(false);
    expect((await settings(page)).region).toBeNull();
    /* 再框一次、按完成 */
    await page.getByTestId('region-pick').click();
    await drag(0.3, 0.2, 0.7, 0.8);
    await page.getByTestId('region-toolbar').getByRole('button', { name: '完成' }).click();
    await expect.poll(async () => (await settings(page)).region).not.toBeNull();
    const r = (await settings(page)).region;
    expect(r.x).toBeCloseTo(0.3, 1);
    expect(r.width).toBeCloseTo(0.4, 1);
    await expect(page.getByTestId('region-box')).toBeVisible();
    await expect(page.getByTestId('region-status')).toHaveText('已設定（40% × 60%）');
    /* 避開區域是工具層的共用設定：風格的「出現範圍」從 context 知道有區域、停用 */
    const posX = page.getByRole('spinbutton', { name: '出現範圍 X：最小' });
    await expect(posX).toBeDisabled();
    expect((await settings(page)).styles.scatter.region).toBeUndefined();
    /* 排出來的句避開它（透視前） */
    const p = await plan(page);
    const R = { x: r.x * 1920, y: r.y * 1080, width: r.width * 1920, height: r.height * 1080 };
    for (const l of p.lines) {
      const b = l.box;
      const hit =
        b.x < R.x + R.width && R.x < b.x + b.width && b.y < R.y + R.height && R.y < b.y + b.height;
      expect(hit, l.key).toBe(false);
    }
    /* 數值欄 */
    const w = page.getByRole('spinbutton', { name: '寬', exact: true });
    await w.fill('10');
    await w.press('Enter');
    await expect.poll(async () => (await settings(page)).region.width).toBeCloseTo(0.1, 3);
    /* 隱藏預覽上的框 */
    await page.getByRole('switch', { name: '在預覽上顯示避開區域' }).click();
    await expect(page.getByTestId('region-box')).toHaveCount(0);
    /* 清除 */
    await page.getByTestId('region-clear').click();
    await expect.poll(async () => (await settings(page)).region).toBeNull();
    await expect(posX).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('畫面：尺寸、背景色、背景圖；PNG 與預覽逐點相同', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '畫面').click();
    await page.getByTestId('size-select').click();
    await page.getByRole('option', { name: '1080 × 1920（直式）' }).click();
    await expect.poll(async () => (await frameInfo(page)).w).toBe(1080);
    expect((await frameInfo(page)).h2).toBe(1920);
    await page.waitForTimeout(450);
    await page.getByTestId('size-select').click();
    await page.getByRole('option', { name: '1280 × 720' }).click();
    await expect.poll(async () => (await frameInfo(page)).w).toBe(1280);
    /* 背景色 */
    await page.getByRole('radio', { name: '單色' }).click();
    await page.getByRole('textbox', { name: '背景色' }).fill('#336699');
    await page.getByRole('textbox', { name: '背景色' }).press('Enter');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
          return Array.from(c.getContext('2d')!.getImageData(2, 2, 1, 1).data);
        }),
      )
      .toEqual([0x33, 0x66, 0x99, 255]);
    /* PNG：與預覽逐點相同 */
    await at(page, 12.5);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-png').click(),
    ]);
    expect(download.suggestedFilename()).toBe('lyric-fx-lyrics.png');
    const png = readFileSync((await download.path()) as string);
    const same = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const a = g.getImageData(0, 0, c.width, c.height).data;
      const pc = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
      const b = pc.getContext('2d')!.getImageData(0, 0, pc.width, pc.height).data;
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 2) diff++;
      return { w: bmp.width, h: bmp.height, diff };
    }, png.toString('base64'));
    expect(same).toEqual({ w: 1280, h: 720, diff: 0 });
    /* 背景圖（完整放入：其他地方是背景色） */
    await page.getByRole('radio', { name: '圖片' }).click();
    await page
      .locator('input[type=file][accept^="image/png"]')
      .setInputFiles(file('bg.png', 'image/png', await solidPng(100, 100, [200, 30, 30])));
    await expect.poll(async () => (await session(page)).bgState).toBe('ready');
    await page.getByRole('radio', { name: '完整放入' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
          const g = c.getContext('2d')!;
          return [
            Array.from(g.getImageData(2, 2, 1, 1).data),
            Array.from(g.getImageData(640, 2, 1, 1).data),
          ];
        }),
      )
      .toEqual([
        [0x33, 0x66, 0x99, 255],
        [200, 30, 30, 255],
      ]);
    expect(errors).toEqual([]);
  });

  test('匯出：透明 WebM（逐格、讀回有透明度）、PNG 連番、超過上限時停用', async ({ page }) => {
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    await area.fill('[00:00.10]透明的歌詞\n[00:01.00]Second line');
    await area.blur();
    await set(page, 'canvas.size', '1280x720');
    await expect.poll(async () => (await frameInfo(page)).w).toBe(1280);
    /* 透明 WebM */
    const webm = await exportFile(page, /透明 WebM/);
    expect(webm.name).toBe('lyric-fx-lyrics.webm');
    expect([...webm.bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    const has = (seq: number[]) => {
      outer: for (let i = 0; i < Math.min(webm.bytes.length, 4096); i++) {
        for (let j = 0; j < seq.length; j++) if (webm.bytes[i + j] !== seq[j]) continue outer;
        return true;
      }
      return false;
    };
    expect(has([0x53, 0xc0, 0x81, 0x01]), 'AlphaMode 1').toBe(true);
    const v = await probeVideo(page, webm.bytes, 'video/webm', 2.5);
    expect(v.w).toBe(1280);
    expect(v.h).toBe(720);
    expect(v.duration).toBeGreaterThan(4);
    expect(v.transparent).toBeGreaterThan(1280 * 720 * 0.9);
    expect(v.opaque + v.bright).toBeGreaterThan(50);
    /* PNG 連番：最後一句打完再 3 秒（約 4.5 秒）× 24 FPS */
    await page.getByRole('radio', { name: /PNG 連番/ }).click();
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '24 fps' }).click();
    const zip = await exportFile(page, /PNG 連番/);
    expect(zip.name).toBe('lyric-fx-lyrics-frames.zip');
    const entries = unzipSync(zip.bytes);
    const names = Object.keys(entries).sort();
    const pngs = names.filter((n) => n.endsWith('.png'));
    expect(pngs.length).toBeGreaterThan(90);
    expect(pngs[0]).toBe('lyric-fx-lyrics-frames/lyric-fx-lyrics_0001.png');
    const timing = strFromU8(entries['lyric-fx-lyrics-frames/timing.txt']);
    expect(timing).toContain('1280 × 720、24 FPS');
    expect(timing).toMatch(/\n0002 0\.042\n/);
    const first = entries[pngs[30]];
    const dims = new DataView(first.buffer, first.byteOffset + 16, 8);
    expect([dims.getUint32(0), dims.getUint32(4)]).toEqual([1280, 720]);
    /* 60 FPS、歌詞很長 → 超過 1,800 格：PNG 連番停用並說明 */
    await tab(page, '歌詞').click();
    await area.fill('[00:01.00]一\n[01:00.00]二');
    await area.blur();
    await tab(page, '匯出').click();
    await page
      .getByRole('radio', { name: /^MP4|有聲影片|MOV|WebM（即時錄影）/ })
      .first()
      .click();
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '60 fps' }).click();
    await expect(page.locator('[data-disabled-format="png"]')).toContainText('超過 PNG 連番的上限');
    expect(errors).toEqual([]);
  });

  test('匯出：有聲影片（逐格；讀回尺寸與長度）', async ({ page }) => {
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    await area.fill('[00:00.10]有聲音的歌詞\n[00:01.00]第二句');
    await area.blur();
    await set(page, 'canvas.size', '1280x720');
    await loadAudio(page, 3);
    const movie = await exportFile(page, /^(MP4|MOV)/);
    expect(movie.name).toMatch(/^song-lyrics\.(mp4|mov)$/);
    expect(String.fromCharCode(...movie.bytes.subarray(4, 8))).toBe('ftyp');
    const v = await probeVideo(page, movie.bytes, 'video/mp4', 2);
    expect(v.w).toBe(1280);
    expect(v.h).toBe(720);
    expect(v.duration).toBeGreaterThan(2.9);
    expect(v.duration).toBeLessThan(3.1);
    /* MP4 沒有透明：背景透明時是黑色 */
    expect(v.transparent).toBe(0);
    expect(errors).toEqual([]);
  });

  test('匯出：不能逐格時即時錄影（透明 WebM 照樣有透明度）', async ({ page }) => {
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    await area.fill('[00:00.10]即時錄影');
    await area.blur();
    await set(page, 'canvas.size', '1280x720');
    await page.evaluate(() =>
      (
        window as unknown as { __lyricFx: { forceRealtime: (v: boolean) => void } }
      ).__lyricFx.forceRealtime(true),
    );
    await tab(page, '匯出').click();
    await page.getByRole('radio', { name: /透明 WebM/ }).click();
    await expect(page.getByText(/播放一遍即時錄下來的 WebM/)).toBeVisible();
    const webm = await exportFile(page, /透明 WebM/);
    expect(webm.name).toBe('lyric-fx-lyrics.webm');
    const v = await probeVideo(page, webm.bytes, 'video/webm', 2);
    expect(v.w).toBe(1280);
    expect(v.transparent).toBeGreaterThan(1280 * 720 * 0.9);
    expect(v.opaque + v.bright).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });

  test('自動儲存（重新整理後音樂還在）、復原／重做、專案檔、重設', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '風格').click();
    const size = page.getByRole('spinbutton', { name: '字級' });
    await size.fill('50');
    await size.press('Enter');
    await expect.poll(async () => (await settings(page)).styles.scatter.fontSize).toBe(50);
    await page.waitForTimeout(450);
    await page.getByRole('radio', { name: '英文', exact: true }).click();
    await expect.poll(async () => (await settings(page)).styles.scatter.mode).toBe('latin');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await settings(page)).styles.scatter.mode).toBe('auto');
    expect((await settings(page)).styles.scatter.fontSize).toBe(50);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await settings(page)).styles.scatter.mode).toBe('latin');
    await loadAudio(page, 2);
    const saved = await settings(page);
    await expect(page.getByText(/已自動儲存/).first()).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as Partial<W>).__lyricFx);
    await expect.poll(async () => (await session(page)).audioState).toBe('ready');
    expect(await settings(page)).toEqual(saved);
    /* 專案檔（ZIP：project.json＋音樂）→ 重設 → 開啟 */
    await page.getByRole('button', { name: '專案' }).click();
    const [proj] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(proj.suggestedFilename()).toMatch(/^lyric-fx_\d{8}\.zip$/);
    const zipPath = (await proj.path()) as string;
    const zip = unzipSync(new Uint8Array(readFileSync(zipPath)));
    const names = Object.keys(zip).sort();
    expect(names).toContain('project.json');
    expect(names.filter((n) => n.startsWith('files/')).map((n) => n.split('.').pop())).toEqual([
      'wav',
    ]);
    const json = JSON.parse(strFromU8(zip['project.json']));
    expect(json.tool).toBe('lyric-fx');
    expect(json.data.styles.scatter.fontSize).toBe(50);
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect.poll(async () => (await settings(page)).styles.scatter.fontSize).toBe(37);
    await expect.poll(async () => (await session(page)).audioState).toBe('none');
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(zipPath);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect.poll(async () => settings(page)).toEqual(saved);
    await expect.poll(async () => (await session(page)).audioState).toBe('ready');
    expect(errors).toEqual([]);
  });

  test('逐句手動調整：預覽上點選、拖曳、旋轉、方向鍵、Esc；清單的欄位；恢復自動、復原、清除', async ({
    page,
  }) => {
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    await area.fill(TWO);
    await area.blur();
    await page.waitForTimeout(450);
    const base = await plan(page);
    const key = base.lines[1].key;
    await showLine(page, key);

    /* 點空白處：沒有選取 */
    const corner = await toScreen(page, { x: 0.005, y: 0.99 });
    await page.mouse.click(corner.x, corner.y);
    expect(await hook(page, (h) => h.selected())).toBeNull();
    /* 點一句：選取（外框、旋轉控點、工具列、清單標出並展開欄位） */
    const pl0 = await placementOf(page, key);
    const p0 = await toScreen(page, pl0.pivot);
    const grab = { x: p0.x + 6, y: p0.y };
    await page.mouse.click(grab.x, grab.y);
    await expect.poll(() => hook(page, (h) => h.selected())).toBe(key);
    await expect(page.getByTestId('line-selection')).toBeVisible();
    await expect(page.getByTestId('line-rotate')).toBeVisible();
    await expect(page.getByTestId('line-toolbar')).toContainText('已選取第 2 句');
    const selectedRow = page.locator('[data-testid="line-row"][data-selected]');
    await expect(selectedRow).toHaveAttribute('data-key', key);
    await expect(selectedRow.getByTestId('line-adjust')).toBeVisible();

    /* 拖曳：錨點在畫面上跟著指標移動；這一句固定 */
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(grab.x + i * 10, grab.y + i * 5);
    await page.mouse.up();
    const pl1 = await placementOf(page, key);
    const p1 = await toScreen(page, pl1.pivot);
    expect(Math.abs(p1.x - (p0.x + 80))).toBeLessThan(1.5);
    expect(Math.abs(p1.y - (p0.y + 40))).toBeLessThan(1.5);
    const s1 = await settings(page);
    expect(s1.overrides[key].adjust).toMatchObject({ angle: base.lines[1].angle });
    expect((await plan(page)).lines[1].pinned).toBe(true);
    await expect(selectedRow.getByTestId('line-adjusted')).toBeVisible();
    /* 清單的欄位和預覽同步 */
    const panel = page.getByTestId('line-adjust');
    await expect
      .poll(async () =>
        Number.parseFloat(await panel.getByRole('spinbutton', { name: 'X' }).inputValue()),
      )
      .toBeCloseTo(pl1.x * 100, 1);
    /* 復原：一次拖曳算一步 */
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await settings(page)).overrides[key]).toBeUndefined();
    await page.keyboard.press('Control+Shift+z');
    await expect
      .poll(async () => (await settings(page)).overrides[key]?.adjust?.x)
      .toBe(s1.overrides[key].adjust.x);
    await page.waitForTimeout(450);

    /* 旋轉：第一行指向控點拖到的方向 */
    const aim = (from: Pt, deg: number, r = 220) => ({
      x: from.x + r * Math.cos((deg * Math.PI) / 180),
      y: from.y + r * Math.sin((deg * Math.PI) / 180),
    });
    const rot = ex(await page.getByTestId('line-rotate').boundingBox());
    await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2);
    await page.mouse.down();
    for (const d of [5, 12, 20, 25]) {
      const q = aim(p1, d);
      await page.mouse.move(q.x, q.y);
    }
    await page.mouse.up();
    const pl2 = await placementOf(page, key);
    const tip = await toScreen(page, pl2.tip);
    const piv = await toScreen(page, pl2.pivot);
    const cursor = aim(p1, 25);
    const shown = (Math.atan2(tip.y - piv.y, tip.x - piv.x) * 180) / Math.PI;
    const wanted = (Math.atan2(cursor.y - piv.y, cursor.x - piv.x) * 180) / Math.PI;
    expect(Math.abs(shown - wanted)).toBeLessThan(1.5);
    expect((await plan(page)).lines[1].angle).toBe(pl2.angle);
    await page.waitForTimeout(450);
    /* Shift：每 15° */
    const rot2 = ex(await page.getByTestId('line-rotate').boundingBox());
    await page.mouse.move(rot2.x + rot2.width / 2, rot2.y + rot2.height / 2);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    for (const d of [10, -10, -38]) {
      const q = aim(piv, d);
      await page.mouse.move(q.x, q.y);
    }
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const a3 = (await plan(page)).lines[1].angle;
    expect(Math.abs(a3 % 15)).toBe(0);
    expect(a3).toBeLessThan(0);
    await page.waitForTimeout(450);

    /* 方向鍵：1 px，Shift 10 px */
    const before = (await plan(page)).lines[1];
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    await expect.poll(async () => (await plan(page)).lines[1].x).toBe(before.x + 3);
    expect((await plan(page)).lines[1].y).toBe(before.y - 10);
    /* Delete 不刪句 */
    await page.keyboard.press('Delete');
    expect((await hook(page, (h) => h.lines())).length).toBe(3);
    expect(await hook(page, (h) => h.selected())).toBe(key);
    /* Esc：取消選取 */
    await page.keyboard.press('Escape');
    await expect.poll(() => hook(page, (h) => h.selected())).toBeNull();
    await expect(page.getByTestId('line-selection')).toHaveCount(0);
    await expect(page.getByTestId('line-toolbar')).toHaveCount(0);
    await page.waitForTimeout(450);

    /* 清單的「調整」：選取、預覽跳到這一句完整出現的時間 */
    const k0 = base.lines[0].key;
    await page.getByRole('button', { name: '調整第 1 句' }).click();
    await expect.poll(() => hook(page, (h) => h.selected())).toBe(k0);
    const shownAt = (await placementOf(page, k0, 0)).shownAt;
    await expect.poll(() => hook(page, (h) => h.time())).toBeCloseTo(shownAt, 2);
    await expect(page.getByTestId('line-selection')).toBeVisible();
    /* 欄位：X、角度 */
    const fx = panel.getByRole('spinbutton', { name: 'X' });
    await fx.fill('30');
    await fx.press('Enter');
    await expect.poll(async () => (await plan(page)).lines[0].x).toBe(576);
    await page.waitForTimeout(450);
    const fa = panel.getByRole('spinbutton', { name: '角度' });
    await fa.fill('-30');
    await fa.press('Enter');
    await expect.poll(async () => (await plan(page)).lines[0].angle).toBe(-30);
    expect((await plan(page)).lines[0].pinned).toBe(true);
    await page.waitForTimeout(450);
    /* 文字顏色（可以清掉回到風格的顏色）、發光顏色 */
    const color = panel.getByRole('textbox', { name: '文字顏色' });
    await color.fill('#ff0000');
    await color.press('Enter');
    await expect.poll(async () => (await plan(page)).lines[0].textColor).toBe('#ff0000');
    await page.waitForTimeout(450);
    await panel.getByTestId('adjust-color-clear').click();
    await expect.poll(async () => (await plan(page)).lines[0].textColor).toBeNull();
    await page.waitForTimeout(450);
    const glow = panel.getByRole('textbox', { name: '發光顏色' });
    await glow.fill('#00ff00');
    await glow.press('Enter');
    await expect.poll(async () => (await plan(page)).lines[0].glowColor).toBe('#00ff00');
    await page.waitForTimeout(450);
    /* 大小、透明度 */
    const size = panel.getByRole('spinbutton', { name: '大小' });
    await size.fill('150');
    await size.press('Enter');
    await expect.poll(async () => (await plan(page)).lines[0].font).toContain('55.5px');
    expect((await plan(page)).lines[0].th).toBeCloseTo(37 * 1.5 * 1.32, 6);
    await page.waitForTimeout(450);
    const op = panel.getByRole('spinbutton', { name: '透明度' });
    await op.fill('40');
    await op.press('Enter');
    await expect.poll(async () => (await plan(page)).lines[0].opacity).toBe(0.4);
    await page.waitForTimeout(450);
    await expect(page.getByTestId('lines-summary')).toHaveText('2 句手動調整');
    /* 恢復自動（一步）→ 復原 */
    const adjusted = (await settings(page)).overrides[k0].adjust;
    await panel.getByTestId('adjust-reset').click();
    await expect.poll(async () => (await settings(page)).overrides[k0]).toBeUndefined();
    const auto = (await plan(page)).lines[0];
    expect([auto.textColor, auto.glowColor, auto.opacity, auto.th, auto.pinned]).toEqual([
      null,
      null,
      null,
      null,
      false,
    ]);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await settings(page)).overrides[k0]?.adjust).toEqual(adjusted);
    await page.waitForTimeout(450);
    /* 清除逐句調整：全部回到自動（和調整之前的排位置完全相同） */
    await page.getByTestId('clear-overrides').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '確定' }).click();
    await expect.poll(async () => Object.keys((await settings(page)).overrides).length).toBe(0);
    const back = await plan(page);
    expect(back.lines.map((l) => [l.x, l.y, l.angle, l.rows])).toEqual(
      base.lines.map((l) => [l.x, l.y, l.angle, l.rows]),
    );
    expect(errors).toEqual([]);
  });

  test('逐句手動調整：換字型（寬度、折行、先載入）；PNG 與 PNG 連番的像素（顏色、透明度）', async ({
    page,
  }) => {
    const fontCss: string[] = [];
    page.on('request', (r) => {
      if (/fonts\.googleapis\.com/.test(r.url())) fontCss.push(decodeURIComponent(r.url()));
    });
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    const words = Array.from({ length: 30 }, () => 'iiiii').join(' ');
    await area.fill(`[00:00.20]${words}\n[00:03.00]第二句紅色的歌詞`);
    await area.blur();
    await page.waitForTimeout(450);
    const p0 = await plan(page);
    const [k0, k1] = p0.lines.map((l) => l.key);
    /* 「另選字型」：先帶入這一句目前的字型 */
    await page.getByRole('button', { name: '調整第 1 句' }).click();
    const panel = page.getByTestId('line-adjust');
    await panel.getByRole('radio', { name: '另選字型' }).click();
    await expect
      .poll(async () => (await settings(page)).overrides[k0]?.adjust?.font?.family)
      .toBe('Noto Sans TC');
    await page.waitForTimeout(450);
    /* 換成等寬的電腦字型：用新字型量字寬，折行跟著變；另一句照風格的字型 */
    await set(page, `overrides.${k0}.adjust.font`, {
      source: 'local',
      family: 'DejaVu Sans Mono',
      weight: 400,
    });
    await expect.poll(async () => (await plan(page)).lines[0].font).toContain('DejaVu Sans Mono');
    const p1 = await plan(page);
    expect(p1.lines[0].width).toBeGreaterThan(p0.lines[0].width * 1.5);
    expect(p1.lines[0].rows.length).toBeGreaterThan(p0.lines[0].rows.length);
    expect(p1.lines[0].rows.join(' ')).toBe(words);
    expect(p1.lines[1].font).toBe(p0.lines[1].font);
    /* Google 字型：逐句用到的字型也先載入 */
    await set(page, `overrides.${k1}`, {
      adjust: { font: { source: 'google', family: 'Klee One', weight: 600 } },
    });
    await expect.poll(() => fontCss.some((u) => /Klee[+ ]One/.test(u))).toBe(true);
    await expect.poll(async () => (await plan(page)).lines[1].font).toContain('Klee One');

    /* PNG：這一句的文字顏色與透明度（背景透明；發光、描邊關掉，只剩填色） */
    await set(page, `overrides.${k1}`, { adjust: { color: '#ff0000', opacity: 0.5 } });
    await set(page, 'styles.scatter.glow', false);
    await set(page, 'styles.scatter.mode', 'latin');
    await set(page, 'styles.scatter.strokeWidth', 0);
    await showLine(page, k1);
    const halfBox = (await plan(page)).lines[1].box;
    const half = await redPixels(page, await savePngBytes(page));
    expect(half.count).toBeGreaterThan(300);
    expect(half.maxAlpha).toBeGreaterThanOrEqual(120);
    expect(half.maxAlpha).toBeLessThanOrEqual(130);
    await set(page, `overrides.${k1}`, { adjust: { color: '#ff0000' } });
    await page.waitForTimeout(100);
    const full = await redPixels(page, await savePngBytes(page));
    expect(full.maxAlpha).toBe(255);
    expect(full.count).toBeGreaterThan(half.count * 0.8);
    /* 透明度 0：看不到，但照樣占位置 */
    await set(page, `overrides.${k1}`, { adjust: { color: '#ff0000', opacity: 0 } });
    await page.waitForTimeout(100);
    expect((await redPixels(page, await savePngBytes(page))).count).toBe(0);
    expect((await plan(page)).lines[1].box).toEqual(halfBox);

    /* PNG 連番：同一句在連番的那一格也是紅色、半透明 */
    await set(page, `overrides.${k1}`, { adjust: { color: '#ff0000', opacity: 0.5 } });
    await tab(page, '匯出').click();
    await page.getByRole('radio', { name: /PNG 連番/ }).click();
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '24 fps' }).click();
    const zip = await exportFile(page, /PNG 連番/);
    const entries = unzipSync(zip.bytes);
    const t = (await placementOf(page, k1, 0)).shownAt;
    const name = `lyric-fx-lyrics-frames/lyric-fx-lyrics_${String(Math.ceil(t * 24) + 1).padStart(4, '0')}.png`;
    const frame = await redPixels(page, ex(entries[name]));
    expect(frame.count).toBeGreaterThan(300);
    expect(frame.maxAlpha).toBeLessThanOrEqual(130);
    expect(errors).toEqual([]);
  });

  test('鍵盤：空白鍵播放／暫停、R 從頭播放', async ({ page }) => {
    const errors = await open(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    const t0 = await hook(page, (h) => h.time());
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    const t1 = await hook(page, (h) => h.time());
    expect(t1).toBeGreaterThan(t0 + 0.2);
    await page.keyboard.press('Space');
    const t2 = await hook(page, (h) => h.time());
    await page.waitForTimeout(400);
    expect(await hook(page, (h) => h.time())).toBeCloseTo(t2, 2);
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    expect(await hook(page, (h) => h.time())).toBeLessThan(t2);
    await page.keyboard.press('Space');
    expect(errors).toEqual([]);
  });

  test('視覺基準：1280 與 390 寬（390 寬沒有橫向捲動）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await at(page, 12.5);
    await dismissToasts(page);
    await page.mouse.move(0, 0);
    const masks = [page.getByRole('status').filter({ hasText: '自動儲存' })];
    await expect(page).toHaveScreenshot('lyric-fx-1280.png', { fullPage: true, mask: masks });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await noHorizontalScroll(page);
    for (const name of ['風格', '畫面', '匯出', '歌詞']) {
      await tab(page, name).click();
      await noHorizontalScroll(page);
    }
    await at(page, 12.5);
    await expect(page).toHaveScreenshot('lyric-fx-390.png', { fullPage: true, mask: masks });
    expect(errors).toEqual([]);
  });
});

test.describe('歌詞演出產生器（手機寬度、觸控）', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('390 寬：觸控點選與拖曳一句；工具列；沒有橫向捲動', async ({ page }) => {
    const errors = await open(page);
    const area = page.getByTestId('lyrics-text');
    await area.fill(TWO);
    await area.blur();
    await page.waitForTimeout(450);
    const key = (await plan(page)).lines[1].key;
    await showLine(page, key);
    await canvas(page).scrollIntoViewIfNeeded();
    const pl0 = await placementOf(page, key);
    const p0 = await toScreen(page, pl0.pivot);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    await touch('touchStart', p0.x + 2, p0.y);
    for (let i = 1; i <= 6; i++) await touch('touchMove', p0.x + 2 + i * 5, p0.y + i * 3);
    await touch('touchEnd');
    await expect.poll(() => hook(page, (h) => h.selected())).toBe(key);
    await expect.poll(async () => (await settings(page)).overrides[key]?.adjust?.x).toBeTruthy();
    const p1 = await toScreen(page, (await placementOf(page, key)).pivot);
    expect(Math.abs(p1.x - (p0.x + 30))).toBeLessThan(1.5);
    expect(Math.abs(p1.y - (p0.y + 18))).toBeLessThan(1.5);
    await expect(page.getByTestId('line-toolbar')).toBeVisible();
    await noHorizontalScroll(page);
    /* 工具列的「恢復自動」 */
    await page.getByTestId('toolbar-reset').click();
    await expect.poll(async () => (await settings(page)).overrides[key]).toBeUndefined();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
