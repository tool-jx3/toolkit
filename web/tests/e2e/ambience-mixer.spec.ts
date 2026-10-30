/**
 * 環境音混音器（建置產物 next/ambience-mixer/）的端對端測試：
 * - 開頁沒有錯誤、靈感來源、分類與聲音卡片、預設組合；
 * - 點卡片加入並開始播放、再點拿掉；預設組合、隨機組合、復原；一軌的音量、參數（重新合成）、起伏、換一種變化；
 * - 我的組合、分享連結（開連結時先確認）、自己的音檔（循環／只播一次）、定時停止、自動儲存、鍵盤；
 * - 匯出 WAV：格式、長度、首尾相接、和 Node 裡的合成一模一樣（預覽＝匯出；OfflineAudioContext 的混音只乘上音量）、
 *   檔案大小與 CCFOLIA 上限的提醒；
 * - 匯出 MP3（預設）：lamejs 按下匯出才載入（獨立的 chunk、Worker）；用 Chromium 的 decodeAudioData 解碼，
 *   長度剛好（LAME 的 Info 標頭）、和 Node 的合成對齊、接縫附近和中間一樣；新的兩種聲音與預設組合；
 * - 390 寬沒有橫向捲動、1280／390 視覺基準；
 * - @serial：即時播放（AudioContext 的時間往前走、主輸出有聲音；暫停後沒有聲音）；MP3 編碼中取消。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { renderAmbience } from '../../src/core/audio/ambience/render';
import { listMp3Frames, readMp3InfoTag } from '../../src/core/audio/mp3/frames';
import { encodeWav, type PcmAudio, parseWav } from '../../src/core/audio/pcm';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('ambience-mixer') ?? { id: 'ambience-mixer', status: 'next' })}/`;

interface Hook {
  state: () => {
    tracks: {
      key: string;
      kind: string;
      volume: number;
      params?: Record<string, number>;
      swell: boolean;
      seed?: number;
      loop?: boolean;
    }[];
    master: number;
    mixName: string;
    export: { seconds: number; sampleRate: number; channels: number; format: string; kbps: number };
  };
  status: () => Record<string, string>;
  playing: () => boolean;
  contextState: () => string;
  currentTime: () => number;
  level: () => number;
  renders: () => number;
  tracks: () => string[];
  decodes: () => { active: number; max: number };
}
type W = { __ambienceMixer: Hook };
const hook = <T>(page: Page, fn: (h: Hook) => T) =>
  page.evaluate((src) => {
    const h = (window as unknown as W).__ambienceMixer;
    return new Function('h', `return (${src})(h)`)(h);
  }, fn.toString()) as Promise<Awaited<T>>;
const state = (page: Page) => hook(page, (h) => h.state());

async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '環境音混音器' })).toBeVisible();
  return errors;
}

const card = (page: Page, id: string) => page.locator(`button[data-sound="${id}"]`);
const track = (page: Page, key: string) => page.locator(`li[data-track="${key}"]`);
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** 每一軌都準備好（合成或解碼完） */
async function waitReady(page: Page, count: number) {
  await expect
    .poll(
      async () => {
        const s = await hook(page, (h) => h.status());
        const v = Object.values(s);
        return v.length === count && v.every((x) => x === 'ready');
      },
      { timeout: 45_000 },
    )
    .toBe(true);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 測試用的音檔：440 Hz 的正弦（立體聲 44.1 kHz） */
function sineWav(seconds: number, freq = 440, rate = 44100): Buffer {
  const n = Math.round(seconds * rate);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / rate);
  return Buffer.from(encodeWav({ sampleRate: rate, channels: [ch, Float32Array.from(ch)] }));
}

const fileInput = (page: Page) => page.locator('input[type="file"][accept^="audio"]');

async function addFile(page: Page, name: string, data: Buffer) {
  await fileInput(page).setInputFiles({ name, mimeType: 'audio/wav', buffer: data });
}

/** 很長的靜音 WAV（單聲道 16-bit；只用來測長度上限） */
function silentWav(seconds: number, rate: number): Buffer {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  return buf;
}

/** 靜音的 MP3（MPEG-1 Layer III、128 kbps、44.1 kHz 的影格；每個 1152 個取樣） */
function silentMp3(frames: number): Buffer {
  const len = Math.floor((144 * 128000) / 44100);
  const out = Buffer.alloc(len * frames);
  for (let f = 0; f < frames; f++) out.set([0xff, 0xfb, 0x90, 0x00], f * len);
  return out;
}

/** 匯出並下載（格式照目前的設定），回傳檔案 */
async function exportFile(
  page: Page,
  label: 'WAV' | 'MP3',
): Promise<{ data: Buffer; name: string }> {
  await expect(page.getByTestId('export-run')).toHaveText(`匯出 ${label}`);
  await page.getByTestId('export-run').click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: `下載 ${label}` }).click(),
  ]);
  return { data: readFileSync(await download.path()), name: download.suggestedFilename() };
}

/** 格式選 WAV（預設是 MP3），匯出並解析下載的 WAV */
async function exportWav(page: Page): Promise<{ pcm: PcmAudio; name: string; bytes: number }> {
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  const { data, name } = await exportFile(page, 'WAV');
  return { pcm: parseWav(new Uint8Array(data)), name, bytes: data.length };
}

/** 在瀏覽器裡用 decodeAudioData 解碼（OfflineAudioContext 的取樣率＝rate，不重新取樣） */
async function decodeInBrowser(page: Page, data: Buffer, rate: number): Promise<Float32Array[]> {
  const out = await page.evaluate(
    async ({ b64, rate }) => {
      const bin = atob(b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(u.buffer);
      const chans: string[] = [];
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const b = new Uint8Array(buf.getChannelData(c).slice().buffer);
        let s = '';
        for (let i = 0; i < b.length; i += 32768)
          s += String.fromCharCode(...b.subarray(i, i + 32768));
        chans.push(btoa(s));
      }
      return { rate: buf.sampleRate, chans };
    },
    { b64: data.toString('base64'), rate },
  );
  expect(out.rate).toBe(rate);
  return out.chans.map((c) => new Float32Array(Buffer.from(c, 'base64').buffer.slice(0)));
}

/** 訊號與誤差的比（dB）：y 和參考 ref 在 [from, from + len) 環狀的範圍 */
function snrDb(y: Float32Array, ref: Float32Array, from: number, len: number): number {
  const n = ref.length;
  let s = 0;
  let e = 0;
  for (let k = 0; k < len; k++) {
    const i = (((from + k) % n) + n) % n;
    s += ref[i] * ref[i];
    e += (y[i] - ref[i]) ** 2;
  }
  return 10 * Math.log10(s / Math.max(e, 1e-20));
}

/** 選匯出設定（下拉選單） */
async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const rmsOf = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

test('開頁：沒有錯誤、靈感來源、7 個分類 26 種聲音、12 個預設組合；沒有聲音時播放鍵停用', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByRole('link', { name: 'remvze/moodist' })).toHaveAttribute(
    'href',
    'https://github.com/remvze/moodist',
  );
  await expect(page.locator('button[data-sound]')).toHaveCount(26);
  await expect(page.locator('[data-category]')).toHaveCount(7);
  await expect(page.locator('button[data-preset]')).toHaveCount(12);
  await expect(page.getByTestId('play-toggle')).toBeDisabled();
  /* 空狀態的說明只出現一次（在「混音中」區塊） */
  await expect(page.getByTestId('mix-summary')).toHaveText('');
  await expect(
    page.getByText('還沒有聲音。點選聲音卡片，或挑一個預設組合。', { exact: true }),
  ).toHaveCount(1);
  await expect(card(page, 'rain-light')).toHaveAccessibleDescription(
    '細細的雨聲，偶爾有雨滴落在水窪。',
  );
  expect(await hook(page, (h) => h.contextState())).toBe('none');
  expect(errors).toEqual([]);
});

test('點聲音卡片：加入、準備好、開始播放；再點一次拿掉（沒有聲音就停）', async ({ page }) => {
  const errors = await open(page);
  await card(page, 'rain-light').click();
  await expect(card(page, 'rain-light')).toHaveAttribute('aria-pressed', 'true');
  await expect(track(page, 's:rain-light')).toBeVisible();
  await waitReady(page, 1);
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(true);
  await expect(page.getByTestId('play-toggle')).toHaveText('暫停');
  await card(page, 'clock').click();
  await waitReady(page, 2);
  expect((await state(page)).tracks.map((t) => t.key)).toEqual(['s:rain-light', 's:clock']);
  await expect(page.getByTestId('mix-summary')).toHaveText('2 個聲音');
  /* 再點一次拿掉 */
  await card(page, 'rain-light').click();
  await expect(card(page, 'rain-light')).toHaveAttribute('aria-pressed', 'false');
  await expect(track(page, 's:rain-light')).toHaveCount(0);
  await track(page, 's:clock').getByRole('button', { name: '拿掉「時鐘」' }).click();
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(false);
  await expect(page.getByTestId('play-toggle')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('預設組合：換掉合成的聲音、記住名稱；復原回上一個組合；隨機組合', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-preset="rainy-mansion"]').click();
  await waitReady(page, 4);
  const s = await state(page);
  expect(s.mixName).toBe('雨夜洋館');
  expect(s.tracks.map((t) => [t.key, t.volume])).toEqual([
    ['s:rain-window', 65],
    ['s:thunder', 55],
    ['s:clock', 50],
    ['s:fireplace', 45],
  ]);
  expect(s.tracks[2].params).toEqual({ type: 1, room: 45 });
  await page.locator('[data-preset="tavern"]').click();
  await expect
    .poll(async () => (await state(page)).tracks.map((t) => t.key))
    .toEqual(['s:crowd', 's:fireplace']);
  /* 復原：回到雨夜洋館 */
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect.poll(async () => (await state(page)).mixName).toBe('雨夜洋館');
  expect((await state(page)).tracks).toHaveLength(4);
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect.poll(async () => (await state(page)).mixName).toBe('熱鬧的酒館');
  /* 隨機組合：2～3 個聲音、沒有名稱 */
  await page.getByTestId('random-mix').click();
  await expect.poll(async () => (await state(page)).mixName).toBe('');
  const n = (await state(page)).tracks.length;
  expect(n).toBeGreaterThanOrEqual(2);
  expect(n).toBeLessThanOrEqual(3);
  await waitReady(page, n);
  expect(errors).toEqual([]);
});

test('一軌的控制：音量、調整參數會重新合成、起伏、換一種變化', async ({ page }) => {
  const errors = await open(page);
  await card(page, 'wind').click();
  await waitReady(page, 1);
  const t = track(page, 's:wind');
  /* 音量：方向鍵 */
  const vol = t.getByRole('slider', { name: '風的音量' });
  await vol.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await state(page)).tracks[0].volume).toBe(71);
  const before = await hook(page, (h) => h.renders());
  /* 音量不重新合成 */
  expect(before).toBe(1);
  /* 調整：強度 → 重新合成（舊的先繼續播，狀態「更新中」→ 準備好） */
  await t.getByRole('button', { name: '調整' }).click();
  await expect(t.getByRole('button', { name: '調整' })).toHaveAttribute('aria-expanded', 'true');
  const strength = t.getByRole('slider', { name: '風：強度' });
  await strength.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => (await state(page)).tracks[0].params?.intensity).toBe(100);
  await expect.poll(() => hook(page, (h) => h.renders())).toBe(2);
  await waitReady(page, 1);
  /* 起伏 */
  const swell = t.locator('[data-action="swell"]');
  await swell.click();
  await expect(swell).toHaveAttribute('aria-pressed', 'true');
  expect((await state(page)).tracks[0].swell).toBe(true);
  /* 換一種變化：種子換掉、重新合成 */
  const seed = (await state(page)).tracks[0].seed;
  await t.locator('[data-action="reroll"]').click();
  await expect.poll(async () => (await state(page)).tracks[0].seed).not.toBe(seed);
  await expect.poll(() => hook(page, (h) => h.renders())).toBe(3);
  await waitReady(page, 1);
  /* 選項參數（時鐘的種類） */
  await card(page, 'clock').click();
  await waitReady(page, 2);
  const c = track(page, 's:clock');
  await c.getByRole('button', { name: '調整' }).click();
  await c.getByRole('radio', { name: '懷錶' }).click();
  await expect.poll(async () => (await state(page)).tracks[1].params?.type).toBe(2);
  await waitReady(page, 2);
  expect(errors).toEqual([]);
});

test('我的組合：存、改名、套用、刪除（先確認）', async ({ page }) => {
  const errors = await open(page);
  await btn(page, '我的組合').click();
  await expect(page.getByRole('textbox', { name: '組合名稱' })).toBeDisabled();
  await page.locator('[data-preset="catacomb"]').click();
  await page.getByRole('textbox', { name: '組合名稱' }).fill('第三幕');
  await btn(page, '存下目前的組合').click();
  const row = page.locator('[data-saved]');
  await expect(row).toHaveCount(1);
  await expect(row.getByText('3 個聲音')).toBeVisible();
  await row.getByRole('textbox', { name: '「第三幕」的名稱' }).fill('第三幕・墓室');
  await expect(row.getByRole('textbox', { name: '「第三幕・墓室」的名稱' })).toBeVisible();
  /* 換成別的組合，再套用我的組合 */
  await page.locator('[data-preset="tavern"]').click();
  await expect.poll(async () => (await state(page)).tracks.length).toBe(2);
  await row.getByRole('button', { name: '套用', exact: true }).click();
  await expect.poll(async () => (await state(page)).mixName).toBe('第三幕・墓室');
  expect((await state(page)).tracks.map((t) => t.key)).toEqual([
    's:cave-drips',
    's:drone',
    's:wind',
  ]);
  /* 刪除：先確認 */
  await row.getByRole('button', { name: '刪除「第三幕・墓室」' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText('還沒有存下的組合。')).toBeVisible();
  expect(errors).toEqual([]);
});

test('分享連結：對話框的網址；開連結時有聲音先確認、沒有直接套用；壞掉的連結', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await page.locator('[data-preset="forest-campfire"]').click();
  const crickets = track(page, 's:crickets');
  await crickets.getByRole('slider', { name: '蟲鳴的音量' }).focus();
  await page.keyboard.press('Home');
  await page.getByTestId('share-open').click();
  const dialog = page.getByTestId('share-dialog');
  const link = await dialog.getByRole('textbox').inputValue();
  expect(link).toContain(`${URL}#s=`);
  await page.keyboard.press('Escape');
  /* 關閉後焦點回到「分享連結」 */
  await expect(page.getByTestId('share-open')).toBeFocused();

  /* 另一個分頁（另一個瀏覽器環境沒有存檔）：直接套用 */
  const fresh = await context.browser()?.newContext();
  if (!fresh) throw new Error('no browser');
  const p2 = await fresh.newPage();
  const errors2 = await open(p2, link);
  await expect
    .poll(async () => (await state(p2)).tracks.map((t) => [t.key, t.volume]))
    .toEqual([
      ['s:campfire', 70],
      ['s:crickets', 0],
      ['s:owl', 45],
      ['s:wind', 25],
    ]);
  expect((await state(p2)).mixName).toBe('森林營火');
  await expect(p2.getByText('已套用分享的組合，按播放開始。', { exact: true })).toBeVisible();
  expect(await p2.evaluate(() => location.hash)).toBe('');
  /* 已經有聲音：先確認，選「保留目前的」就不換 */
  await p2.locator('[data-preset="tavern"]').click();
  await p2.goto(link);
  await expect(p2.getByRole('alertdialog')).toContainText('營火、蟲鳴、貓頭鷹、風');
  await p2.getByRole('button', { name: '保留目前的' }).click();
  expect((await state(p2)).mixName).toBe('熱鬧的酒館');
  await p2.goto(link);
  await p2.getByRole('button', { name: '換成分享的組合' }).click();
  await expect.poll(async () => (await state(p2)).mixName).toBe('森林營火');
  /* 壞掉的連結 */
  await p2.goto(`${URL}#s=broken`);
  await expect(
    p2.getByText('分享連結讀不出來（可能不完整或是舊版的連結）。', { exact: true }),
  ).toBeVisible();
  expect((await state(p2)).mixName).toBe('森林營火');
  /* 空的 #s=：清掉並通知（前一則同樣的通知可能還在） */
  const brokenToast = p2.getByText('分享連結讀不出來（可能不完整或是舊版的連結）。', {
    exact: true,
  });
  const before = await brokenToast.count();
  await p2.goto(`${URL}#s=`);
  await expect.poll(() => p2.evaluate(() => location.hash)).toBe('');
  await expect(brokenToast).toHaveCount(before + 1);
  /* moodist 的分享連結（?share=）：讀不了，說明並從網址拿掉 */
  await p2.goto(`${URL}?share=${encodeURIComponent('{"rain":0.5}')}`);
  await expect(
    p2.getByText(
      '這是 moodist 的分享連結，這裡讀不了（兩邊的聲音不同）；可以從預設組合或聲音卡片重新組一個。',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  expect(await p2.evaluate(() => location.search)).toBe('');
  expect((await state(p2)).mixName).toBe('森林營火');
  await fresh.close();
  expect(errors).toEqual([]);
  expect(errors2).toEqual([]);
});

test('自己的音檔：加入、循環／只播一次、匯出時一起混進去（首尾相接）', async ({ page }) => {
  const errors = await open(page);
  await addFile(page, '我的鐘聲.wav', sineWav(2.5));
  const t = track(page, 'f1');
  await expect(t).toBeVisible();
  await expect(t).toContainText('我的鐘聲.wav');
  await expect(t).toContainText('長度 0:03');
  await waitReady(page, 1);
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(true);
  await t.getByRole('button', { name: '調整' }).click();
  await expect(t.getByRole('slider', { name: '我的鐘聲.wav：接縫淡化' })).toBeVisible();
  await t.getByRole('switch', { name: '我的鐘聲.wav：循環播放' }).click();
  await expect.poll(async () => (await state(page)).tracks[0].loop).toBe(false);
  await expect(t.getByRole('slider', { name: '我的鐘聲.wav：淡入' })).toBeVisible();
  await t.getByRole('switch', { name: '我的鐘聲.wav：循環播放' }).click();
  /* 分享連結不含音檔：只有音檔時不能分享 */
  await expect(page.getByTestId('share-open')).toBeDisabled();
  /* 匯出 10 秒：音檔循環了 4 次多，接縫淡化 */
  await pick(page, '長度', '10 秒');
  const { pcm, name } = await exportWav(page);
  expect(name).toBe('環境音-我的鐘聲-10秒.wav');
  const x = pcm.channels[0];
  expect(x).toHaveLength(10 * 32000);
  expect(rmsOf(x)).toBeGreaterThan(0.05);
  let local = 0;
  for (let i = 1; i < 64; i++)
    local = Math.max(
      local,
      Math.abs(x[i] - x[i - 1]),
      Math.abs(x[x.length - i] - x[x.length - i - 1]),
    );
  expect(Math.abs(x[0] - x[x.length - 1])).toBeLessThanOrEqual(local * 1.5 + 1e-3);
  /* 只播一次：匯出的 WAV 從 0 秒開始（淡入 0.5 秒），2.5 秒之後是靜音 */
  await t.getByRole('switch', { name: '我的鐘聲.wav：循環播放' }).click();
  await expect.poll(async () => (await state(page)).tracks[0].loop).toBe(false);
  const once = (await exportWav(page)).pcm.channels[0];
  const win = (a: number, b: number) =>
    rmsOf(once.subarray(Math.round(a * 32000), Math.round(b * 32000)));
  expect(Math.abs(once[0])).toBeLessThan(0.01);
  expect(win(0, 0.05)).toBeLessThan(win(0.6, 0.65) * 0.3);
  expect(win(0.6, 1.4)).toBeGreaterThan(0.2);
  expect(win(2.6, 10)).toBeLessThan(1e-4);
  /* 太短（不到 0.5 秒）、太長（超過 15 分鐘，解碼前讀 WAV 的檔頭就擋掉）、空的音檔不收 */
  await addFile(page, '短.wav', sineWav(0.3));
  await expect(
    page.getByText('「短.wav」太短了（不到 0.5 秒），循環起來只會是一連串的雜音。', {
      exact: true,
    }),
  ).toBeVisible();
  /* 上限邊界：902 秒寫成「15 分 2 秒」（不會和上限一樣是「15 分鐘」） */
  await addFile(page, '長.wav', silentWav(902, 8000));
  await expect(
    page.getByText(
      '「長.wav」太長了（15 分 2 秒）：上限 15 分鐘（太長的音檔會佔用很多記憶體），請剪短後再加入。',
      { exact: true },
    ),
  ).toBeVisible();
  /* 0 位元組：不給 <audio> 讀（主控台不會有錯誤） */
  await addFile(page, '空.wav', Buffer.alloc(0));
  await expect(page.getByText('「空.wav」是空的檔案（0 位元組）', { exact: true })).toBeVisible();
  expect((await state(page)).tracks).toHaveLength(1);
  /* 非音檔 */
  await fileInput(page).setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByText('這不是音檔', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('存檔裡超過 15 分鐘的音檔：開頁時不解碼，軌上說明原因', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const track = {
      kind: 'file',
      key: 'f1',
      asset: 'not-here',
      name: '很長的錄音.mp3',
      duration: 64 * 60,
      volume: 70,
      swell: false,
      loop: true,
      seam: 1,
      fadeIn: 0.5,
      fadeOut: 1,
    };
    const data = {
      tracks: [track],
      master: 100,
      export: { seconds: 60, sampleRate: 32000, channels: 2 },
      mixName: '',
    };
    localStorage.setItem(
      'trpg-toolkit:ambience-mixer',
      JSON.stringify({ state: { data }, version: 1 }),
    );
  });
  const errors = await open(page);
  await expect(track(page, 'f1')).toBeVisible();
  /* 第 1 版的存檔（匯出設定沒有格式與位元率）照讀：補上預設的 MP3、128 kbps */
  expect((await state(page)).export).toEqual({
    seconds: 60,
    sampleRate: 32000,
    channels: 2,
    format: 'mp3',
    kbps: 128,
  });
  await expect.poll(() => hook(page, (h) => h.status())).toEqual({ f1: 'tooLong' });
  await expect(track(page, 'f1')).toContainText(
    '這個音檔太長了（64 分鐘），沒有載入：上限 15 分鐘（太長的音檔會佔用很多記憶體）。請拿掉，剪短後再加入。',
  );
  /* 只剩沒有載入的音檔時匯出：照實寫原因 */
  await page.getByTestId('export-run').click();
  await expect(
    page.getByText(
      '沒有可以匯出的聲音：「很長的錄音.mp3」（太長，超過 15 分鐘）沒有載入。請拿掉或換掉再匯出。',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId('export-result')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('自己的音檔加起來最多 30 分鐘：開頁時一次解碼一個、超過的不載入；匯出時說明沒有混進去的音檔', async ({
  page,
}) => {
  const errors = await open(page);
  for (const [i, name] of ['甲.wav', '乙.wav', '丙.wav'].entries()) {
    await addFile(page, name, sineWav(2, 300 + i * 100));
    await waitReady(page, i + 1);
  }
  /* 存檔裡的長度改成 900、900、10 秒（加起來超過 30 分鐘），重新整理 */
  await page.evaluate(() => {
    const k = 'trpg-toolkit:ambience-mixer';
    const j = JSON.parse(localStorage.getItem(k) ?? '{}');
    const d = [900, 900, 10];
    j.state.data.tracks.forEach((t: { duration: number }, i: number) => {
      t.duration = d[i];
    });
    localStorage.setItem(k, JSON.stringify(j));
  });
  await page.reload();
  await expect
    .poll(() => hook(page, (h) => h.status()), { timeout: 20_000 })
    .toEqual({ f1: 'ready', f2: 'ready', f3: 'overTotal' });
  expect((await hook(page, (h) => h.decodes())).max).toBe(1);
  await expect(track(page, 'f3')).toContainText(
    '自己的音檔加起來超過 30 分鐘，這一軌沒有載入（解碼後的音檔很佔記憶體）。拿掉前面的音檔後會自動載入。',
  );
  /* 再加一個：加不進來 */
  await addFile(page, '丁.wav', sineWav(3));
  await expect(
    page.getByText(
      '「丁.wav」（3 秒）加不進來：自己的音檔加起來最多 30 分鐘，目前已經有 30 分鐘。請先拿掉一些。',
      { exact: true },
    ),
  ).toBeVisible();
  expect((await state(page)).tracks).toHaveLength(3);
  /* 匯出：沒有載入的音檔不混進去、結果裡說明、檔名不列 */
  await pick(page, '長度', '10 秒');
  const { name } = await exportWav(page);
  expect(name).toBe('環境音-甲・乙-10秒.wav');
  await expect(page.getByTestId('export-result')).toContainText(
    '沒有混進去：「丙.wav」（音檔加起來超過 30 分鐘）。',
  );
  /* 拿掉第一個：第三個自動載入 */
  await track(page, 'f1').locator('[data-action="remove"]').click();
  await waitReady(page, 2);
  expect((await hook(page, (h) => h.decodes())).max).toBe(1);
  expect(errors).toEqual([]);
});

test('讀不到長度的音檔：讀取中的提示；可能太長時先問', async ({ page }) => {
  /* 讓 <audio> 讀不到 metadata（4 秒後逾時） */
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      set() {},
      get() {
        return '';
      },
      configurable: true,
    });
  });
  const errors = await open(page);
  const mp3 = silentMp3(2400);
  const add = () =>
    fileInput(page).setInputFiles({ name: '雨.mp3', mimeType: 'audio/mpeg', buffer: mp3 });
  await add();
  await expect(page.getByText('正在讀取「雨.mp3」…', { exact: true })).toBeVisible();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText('讀不到「雨.mp3」的長度');
  await expect(dialog).toContainText('這個檔案 1 MB，可能超過 15 分鐘。');
  await dialog.getByRole('button', { name: '不要', exact: true }).click();
  await expect(page.getByText('正在讀取「雨.mp3」…', { exact: true })).toBeHidden();
  expect((await state(page)).tracks).toHaveLength(0);
  /* 試著載入：解碼後檢查長度（1 分多鐘，收下） */
  await add();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '試著載入', exact: true })
    .click({ timeout: 10_000 });
  await waitReady(page, 1);
  await expect(track(page, 'f1')).toContainText('長度 1:03');
  await expect(page.getByText('正在讀取「雨.mp3」…', { exact: true })).toBeHidden();
  expect(errors).toEqual([]);
});

test('匯出 WAV：格式與長度、首尾相接、和 Node 的合成一模一樣（只乘上音量）；大小與 CCFOLIA 上限', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('export-run')).toBeDisabled();
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  await expect(page.getByTestId('export-format-hint')).toContainText('WAV 不壓縮、最無縫');
  await card(page, 'rain-light').click();
  await waitReady(page, 1);
  await btn(page, '暫停').click();
  /* 音量 100%、總音量 50%（2 × 0.5² ＝ 0.5 倍） */
  await track(page, 's:rain-light').getByRole('slider', { name: '小雨的音量' }).focus();
  await page.keyboard.press('End');
  await page.getByRole('spinbutton', { name: '總音量' }).fill('50');
  await page.getByRole('spinbutton', { name: '總音量' }).press('Enter');
  await expect.poll(async () => (await state(page)).master).toBe(50);
  /* 預設（60 秒、32 kHz、立體聲）：約 7.7 MB（1000 進位，和 CCFOLIA 的 10 MB 一致）、和預覽一模一樣 */
  await expect(page.getByTestId('export-size')).toHaveText('約 7.7 MB・和預覽聽到的一模一樣。');
  /* WAV 沒有位元率 */
  await expect(page.getByRole('combobox', { name: '位元率' })).toHaveCount(0);
  /* 太大：3 分、44.1 kHz 立體聲 → 提醒 */
  await pick(page, '長度', '3 分');
  await pick(page, '取樣率', '44.1 kHz（CD 音質）');
  await expect(page.getByText(/超過 CCFOLIA 的音源上限/)).toBeVisible();
  await expect(page.getByTestId('export-size')).toContainText('約 31.8 MB');
  await expect(page.getByText(/每個檔案約 10 MB/)).toBeVisible();
  /* 10 秒、22.05 kHz、立體聲 */
  await pick(page, '長度', '10 秒');
  await pick(page, '取樣率', '22.05 kHz（檔案小）');
  await expect(page.getByText(/超過 CCFOLIA 的音源上限/)).toHaveCount(0);
  const { pcm, name, bytes } = await exportWav(page);
  expect(name).toBe('環境音-小雨-10秒.wav');
  expect(bytes).toBe(44 + 10 * 22050 * 4);
  expect(pcm.sampleRate).toBe(22050);
  expect(pcm.channels).toHaveLength(2);
  await expect(page.getByTestId('export-details')).toContainText('10 秒・22.05 kHz・立體聲');
  /* Node 裡用同樣的設定合成：匯出＝0.5 × 合成（從 0 秒開始、逐取樣對齊；WAV 的量化誤差以內） */
  const ref = renderAmbience('rain-light', {}, { duration: 10, sampleRate: 22050, seed: 1 });
  const n = 10 * 22050;
  const off = 0;
  let maxErr = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < n; i++)
      maxErr = Math.max(
        maxErr,
        Math.abs(pcm.channels[c][i] - 0.5 * ref.channels[c][(i + off) % n]),
      );
  }
  expect(maxErr).toBeLessThan(3 / 32768);
  /* 單聲道：左右平均 */
  await page.getByRole('radio', { name: '單聲道' }).click();
  const mono = await exportWav(page);
  expect(mono.pcm.channels).toHaveLength(1);
  expect(mono.bytes).toBe(44 + 10 * 22050 * 2);
  let monoErr = 0;
  for (let i = 0; i < n; i++) {
    const want = 0.25 * (ref.channels[0][(i + off) % n] + ref.channels[1][(i + off) % n]);
    monoErr = Math.max(monoErr, Math.abs(mono.pcm.channels[0][i] - want));
  }
  expect(monoErr).toBeLessThan(3 / 32768);
  expect(errors).toEqual([]);
});

test('匯出 MP3（預設）：lamejs 按下匯出才載入；Chromium 解碼後長度剛好、和 Node 的合成對齊、接縫和中間一樣；格式與位元率記得', async ({
  page,
}) => {
  const loaded: string[] = [];
  page.on('request', (r) => {
    if (/\/(lamejs|mp3\.worker)-[^/]*\.js/.test(r.url())) loaded.push(r.url());
  });
  const errors = await open(page);
  await card(page, 'rain-light').click();
  await waitReady(page, 1);
  await btn(page, '暫停').click();
  await track(page, 's:rain-light').getByRole('slider', { name: '小雨的音量' }).focus();
  await page.keyboard.press('End');
  await page.getByRole('spinbutton', { name: '總音量' }).fill('50');
  await page.getByRole('spinbutton', { name: '總音量' }).press('Enter');
  await expect.poll(async () => (await state(page)).master).toBe(50);
  /* 預設：MP3、128 kbps；1 分鐘約 962 KB，和預覽是同一段（MP3 有壓縮） */
  await expect(page.getByRole('radio', { name: 'MP3', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('combobox', { name: '位元率' })).toHaveText('128 kbps');
  await expect(page.getByTestId('export-size')).toHaveText(
    /^約 96\d KB・和預覽是同一段聲音（MP3 有壓縮）。$/,
  );
  await expect(page.getByTestId('export-format-hint')).toContainText('要最無縫時選 WAV');
  await expect(page.getByTestId('export-format-hint')).toContainText(
    '位元率 128 kbps 是建議的音質、192 kbps 是高音質。',
  );
  /* 22.05 kHz 時高音質是 160 kbps（MPEG-2 的上限） */
  await pick(page, '取樣率', '22.05 kHz（檔案小）');
  await page.getByRole('combobox', { name: '位元率' }).click();
  await expect(page.getByRole('option', { name: '160 kbps', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-format-hint')).toContainText('160 kbps 是高音質');
  await pick(page, '取樣率', '32 kHz（建議）');
  await pick(page, '長度', '10 秒');
  /* 還沒匯出：編碼器沒有下載 */
  expect(loaded).toEqual([]);
  const { data, name } = await exportFile(page, 'MP3');
  expect(name).toBe('環境音-小雨-10秒.mp3');
  expect(loaded.some((u) => /\/lamejs-/.test(u))).toBe(true);
  expect(loaded.some((u) => /\/mp3\.worker-/.test(u))).toBe(true);
  await expect(page.getByTestId('export-details')).toContainText('10 秒・32 kHz・立體聲・128 kbps');
  /* 結構：Info 標頭（編碼器延遲 576、填充）＋聲音影格；大小和估計的差不到幾個位元組 */
  const tag = readMp3InfoTag(new Uint8Array(data));
  expect(tag).toMatchObject({ kind: 'Info', bytes: data.length, delay: 576, tagCrcOk: true });
  expect(listMp3Frames(new Uint8Array(data))).toHaveLength(1 + (tag?.frames ?? 0));
  expect((tag?.frames ?? 0) * 1152 - (tag?.delay ?? 0) - (tag?.padding ?? 0)).toBe(320000);
  /* Chromium 解碼：照標頭裁掉開頭與結尾，剛好 10 秒；第 0 個取樣就是循環的第 0 個（和 Node 的合成 × 0.5 對齊） */
  const y = await decodeInBrowser(page, data, 32000);
  expect(y).toHaveLength(2);
  expect(y[0]).toHaveLength(320000);
  const ref = renderAmbience('rain-light', {}, { duration: 10, sampleRate: 32000, seed: 1 });
  const n = 320000;
  for (let c = 0; c < 2; c++) {
    const r = ref.channels[c].map((v) => v * 0.5);
    /* 對齊：前後錯開 1～2 個取樣時差很多 */
    const whole = snrDb(y[c], r, 0, n);
    const shifted = snrDb(y[c].subarray(1), r.subarray(0, n - 1), 0, n - 1);
    expect(whole).toBeGreaterThan(5);
    expect(whole).toBeGreaterThan(shifted + 3);
    /* 接縫（最後 2048 個取樣接回開頭 2048 個）的誤差和中間差不多：首尾相接 */
    const seam = snrDb(y[c], r, n - 2048, 4096);
    const middle = snrDb(y[c], r, n / 2 - 2048, 4096);
    expect(seam).toBeGreaterThan(Math.min(middle, whole) - 4);
  }
  /* 位元率改 192、重新整理後格式與位元率都還在 */
  await pick(page, '位元率', '192 kbps');
  await expect(page.getByTestId('export-result')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'MP3', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect((await state(page)).export).toMatchObject({ format: 'mp3', kbps: 192, seconds: 10 });
  expect(errors).toEqual([]);
});

test('新的兩種聲音：雨打在帳篷／傘上、房間底噪；預設組合「雨中的帳篷」「深夜的圖書館」；匯出和 Node 的合成一樣', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(card(page, 'rain-tent')).toHaveAccessibleDescription(
    '躲在帳篷裡或撐著傘：雨滴打在布上悶悶的「噗噗」聲，邊緣不停滴水。',
  );
  await expect(card(page, 'room-tone')).toBeVisible();
  await page.locator('[data-preset="rainy-camp"]').click();
  await waitReady(page, 3);
  expect((await state(page)).tracks.map((t) => t.key)).toEqual([
    's:rain-tent',
    's:wind',
    's:thunder',
  ]);
  await page.locator('[data-preset="night-library"]').click();
  await waitReady(page, 3);
  const s = await state(page);
  expect(s.mixName).toBe('深夜的圖書館');
  expect(s.tracks[0]).toMatchObject({
    key: 's:room-tone',
    params: { hum: 20, traffic: 20, room: 75 },
  });
  await btn(page, '暫停').click();
  /* 「在哪裡」選傘下（選項參數） */
  await page.locator('[data-preset="rainy-camp"]').click();
  await waitReady(page, 3);
  await btn(page, '暫停').click();
  const tent = track(page, 's:rain-tent');
  await tent.getByRole('button', { name: '調整' }).click();
  await tent.getByRole('radio', { name: '傘下', exact: true }).click();
  await expect.poll(async () => (await state(page)).tracks[0].params?.canopy).toBe(1);
  /* 拿掉另外兩軌，匯出 10 秒的 WAV：和 Node 的合成一模一樣（音量 70% → 0.49、總音量 100% → 2 倍；柔和限幅在線性的範圍內不變） */
  await track(page, 's:wind').getByRole('button', { name: '拿掉「風」' }).click();
  await track(page, 's:thunder').getByRole('button', { name: '拿掉「雷」' }).click();
  await waitReady(page, 1);
  await pick(page, '長度', '10 秒');
  const { pcm } = await exportWav(page);
  const ref = renderAmbience(
    'rain-tent',
    { canopy: 1, intensity: 60, drips: 45 },
    { duration: 10, sampleRate: 32000, seed: 1 },
  );
  /* 混音：x × 0.49 × 2（柔和限幅只壓 0.6 以上的少數取樣，不比） */
  let maxErr = 0;
  for (let c = 0; c < 2; c++)
    for (let i = 0; i < 320000; i++) {
      const want = ref.channels[c][i] * 0.98;
      if (Math.abs(want) < 0.6) maxErr = Math.max(maxErr, Math.abs(pcm.channels[c][i] - want));
    }
  expect(maxErr).toBeLessThan(3 / 32768);
  expect(errors).toEqual([]);
});

test('MP3 的 Worker 開不起來（new Worker 丟 SecurityError）：在主執行緒編，照樣匯出', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('mp3.worker')) throw new DOMException('blocked', 'SecurityError');
        super(url, options);
      }
    };
  });
  const loaded: string[] = [];
  page.on('request', (r) => {
    if (/\/(lamejs|mp3\.worker)-[^/]*\.js/.test(r.url())) loaded.push(r.url());
  });
  const errors = await open(page);
  await card(page, 'pink-noise').click();
  await waitReady(page, 1);
  await btn(page, '暫停').click();
  await pick(page, '長度', '10 秒');
  const { data, name } = await exportFile(page, 'MP3');
  expect(name).toBe('環境音-粉紅噪音-10秒.mp3');
  expect(readMp3InfoTag(new Uint8Array(data))).toMatchObject({
    bytes: data.length,
    tagCrcOk: true,
  });
  await expect(page.getByText(/^匯出失敗/)).toHaveCount(0);
  /* 編碼器在主執行緒載入（Worker 的檔案沒有下載） */
  expect(loaded.some((u) => /\/lamejs-/.test(u))).toBe(true);
  expect(loaded.some((u) => /\/mp3\.worker-/.test(u))).toBe(false);
  const y = await decodeInBrowser(page, data, 32000);
  expect(y[0]).toHaveLength(320000);
  expect(errors).toEqual([]);
});

test('匯出後復原（Ctrl＋Z）、重做匯出設定：設定和結果不同就清掉結果', async ({ page }) => {
  /* 0.4 秒內的變更算同一步復原：每一步之後把時鐘往前撥，步驟才分得開 */
  await page.clock.install();
  const errors = await open(page);
  const nextStep = () => page.clock.fastForward(500);
  await card(page, 'brown-noise').click();
  await waitReady(page, 1);
  await btn(page, '暫停').click();
  await nextStep();
  await pick(page, '長度', '10 秒');
  await nextStep();
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  await nextStep();
  await exportFile(page, 'WAV');
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible();
  const keys = async (k: string) => {
    await page.locator('body').click({ position: { x: 5, y: 600 } });
    await page.keyboard.press(k);
  };
  /* 復原「WAV」：格式回到 MP3，結果（WAV）清掉 */
  await keys('Control+z');
  await expect.poll(async () => (await state(page)).export.format).toBe('mp3');
  expect((await state(page)).export.seconds).toBe(10);
  await expect(result).toHaveCount(0);
  /* 重做：回到 WAV（結果已經清掉，不會回來）；再匯出一次 */
  await keys('Control+Shift+z');
  await expect.poll(async () => (await state(page)).export.format).toBe('wav');
  await expect(result).toHaveCount(0);
  await exportFile(page, 'WAV');
  await expect(result).toBeVisible();
  /* 復原兩步：格式、長度都回去，結果清掉 */
  await keys('Control+z');
  await keys('Control+z');
  await expect.poll(async () => (await state(page)).export.seconds).toBe(60);
  expect((await state(page)).tracks).toHaveLength(1);
  await expect(result).toHaveCount(0);
  /* 改了別的（音量）不影響結果 */
  await nextStep();
  await page.getByRole('radio', { name: 'WAV', exact: true }).click();
  await nextStep();
  await exportFile(page, 'WAV');
  await track(page, 's:brown-noise').getByRole('slider', { name: '棕色噪音的音量' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await state(page)).tracks[0].volume).toBe(69);
  await expect(result).toBeVisible();
  expect(errors).toEqual([]);
});

test('320 寬：匯出的選單（長度、取樣率、位元率）文字沒有被截掉；窄的時候長度與取樣率上下排', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const errors = await open(page);
  await card(page, 'room-tone').click();
  await waitReady(page, 1);
  await btn(page, '暫停').click();
  await noHorizontalScroll(page);
  const truncated = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="combobox"]')]
        .map((c) => c.querySelector('span.truncate'))
        .filter((s): s is HTMLElement => !!s && s.scrollWidth > s.clientWidth)
        .map((s) => s.textContent),
    );
  for (const rate of ['44.1 kHz（CD 音質）', '22.05 kHz（檔案小）', '32 kHz（建議）']) {
    await pick(page, '取樣率', rate);
    await pick(page, '長度', '1 分 30 秒');
    expect(await truncated()).toEqual([]);
  }
  const len = await page.getByRole('combobox', { name: '長度', exact: true }).boundingBox();
  const rate = await page.getByRole('combobox', { name: '取樣率', exact: true }).boundingBox();
  expect(len && rate && rate.y > len.y + len.height).toBe(true);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('自動儲存：重新整理後組合還在（暫停中，按播放開始）；定時停止的選單', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-preset="night-office"]').click();
  await waitReady(page, 3);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: '環境音混音器' })).toBeVisible();
  expect((await state(page)).tracks.map((t) => t.key)).toEqual([
    's:office-hum',
    's:clock',
    's:rain-light',
  ]);
  expect((await state(page)).mixName).toBe('深夜的辦公室');
  await waitReady(page, 3);
  expect(await hook(page, (h) => h.playing())).toBe(false);
  await expect(page.getByTestId('mix-summary')).toHaveText('3 個聲音・按播放（或空白鍵）開始。');
  /* 鍵盤：空白鍵播放／暫停（焦點不在控制項上） */
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('Space');
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(false);
  /* Ctrl+Z 復原（拿掉一軌再復原） */
  await track(page, 's:clock').getByRole('button', { name: '拿掉「時鐘」' }).click();
  await expect.poll(async () => (await state(page)).tracks.length).toBe(2);
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state(page)).tracks.length).toBe(3);
  /* 定時停止 */
  await page.getByTestId('timer').click();
  await page.getByRole('option', { name: '15 分鐘後' }).click();
  await expect(page.getByTestId('timer-left')).toHaveText(/^還有 (15:00|14:59) 慢慢停下來$/);
  await page.getByTestId('timer').click();
  await page.getByRole('option', { name: '關' }).click();
  await expect(page.getByTestId('timer-left')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('定時停止：時間到時慢慢停下來', async ({ page }) => {
  await page.clock.install();
  const errors = await open(page);
  await card(page, 'stream').click();
  await waitReady(page, 1);
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(true);
  await page.getByTestId('timer').click();
  await page.getByRole('option', { name: '15 分鐘後' }).click();
  await expect(page.getByTestId('timer-left')).toHaveText('還有 15:00 慢慢停下來');
  await page.clock.fastForward('15:01');
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(false);
  /* 淡出（8 秒）結束才通知 */
  await expect(page.getByText('定時停止：聲音已經慢慢停下來了。', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(9000);
  await expect(page.getByText('定時停止：聲音已經慢慢停下來了。', { exact: true })).toBeVisible();
  await expect(page.getByTestId('timer-left')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('390 寬：混音在上、沒有橫向捲動；視覺基準', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await noHorizontalScroll(page);
  await page.locator('[data-preset="rainy-mansion"]').click();
  await waitReady(page, 4);
  await btn(page, '暫停').click();
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(false);
  await track(page, 's:clock').getByRole('button', { name: '調整' }).click();
  await noHorizontalScroll(page);
  /* 混音（播放鍵）在聲音清單上面 */
  const play = await page.getByTestId('play-toggle').boundingBox();
  const lib = await card(page, 'rain-light').boundingBox();
  expect(play && lib && play.y < lib.y).toBe(true);
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot('ambience-mixer-390.png');
  expect(errors).toEqual([]);
});

test('1280 寬：視覺基準（雨夜洋館、暫停中）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await open(page);
  await page.locator('[data-preset="rainy-mansion"]').click();
  await waitReady(page, 4);
  await btn(page, '暫停').click();
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(false);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('ambience-mixer-1280.png');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('匯出 MP3 的編碼中取消：沒有結果也沒有錯誤；之後照常匯出', {
  tag: '@serial',
}, async ({ page }) => {
  const errors = await open(page);
  await card(page, 'white-noise').click();
  await waitReady(page, 1);
  await btn(page, '暫停').click();
  /* 3 分鐘 44.1 kHz 的立體聲：編碼要十幾秒，來得及取消 */
  await pick(page, '長度', '3 分');
  await pick(page, '取樣率', '44.1 kHz（CD 音質）');
  await page.getByTestId('export-run').click();
  await expect(page.getByText('編碼 MP3…', { exact: true })).toBeVisible({ timeout: 60_000 });
  await btn(page, '取消').click();
  await expect(page.getByTestId('export-run')).toBeEnabled();
  await expect(page.getByTestId('export-result')).toHaveCount(0);
  await expect(page.getByText(/^匯出失敗/)).toHaveCount(0);
  /* 再匯出一次（短的）：照常完成 */
  await pick(page, '長度', '10 秒');
  const { data, name } = await exportFile(page, 'MP3');
  expect(name).toBe('環境音-白噪音-10秒.mp3');
  expect(readMp3InfoTag(new Uint8Array(data))?.bytes).toBe(data.length);
  expect(errors).toEqual([]);
});

test('即時播放：時間往前走、主輸出有聲音；暫停後 AudioContext 暫停、沒有聲音', {
  tag: '@serial',
}, async ({ page }) => {
  const errors = await open(page);
  await card(page, 'pink-noise').click();
  await waitReady(page, 1);
  await expect.poll(() => hook(page, (h) => h.contextState())).toBe('running');
  const t0 = await hook(page, (h) => h.currentTime());
  await expect
    .poll(() => hook(page, (h) => h.currentTime()), { timeout: 5000 })
    .toBeGreaterThan(t0 + 0.5);
  await expect.poll(() => hook(page, (h) => h.level()), { timeout: 5000 }).toBeGreaterThan(0.01);
  /* 總音量 0：沒有聲音 */
  await page.getByRole('spinbutton', { name: '總音量' }).fill('0');
  await page.getByRole('spinbutton', { name: '總音量' }).press('Enter');
  await expect.poll(() => hook(page, (h) => h.level()), { timeout: 5000 }).toBeLessThan(1e-4);
  await page.getByRole('spinbutton', { name: '總音量' }).fill('100');
  await page.getByRole('spinbutton', { name: '總音量' }).press('Enter');
  await expect.poll(() => hook(page, (h) => h.level()), { timeout: 5000 }).toBeGreaterThan(0.01);
  /* 暫停：淡出後 AudioContext 暫停，時間停住 */
  await btn(page, '暫停').click();
  await expect.poll(() => hook(page, (h) => h.contextState()), { timeout: 5000 }).toBe('suspended');
  const t1 = await hook(page, (h) => h.currentTime());
  await expect.poll(() => hook(page, (h) => h.currentTime())).toBe(t1);
  /* 再播放：接著播 */
  await btn(page, '播放').click();
  await expect
    .poll(() => hook(page, (h) => h.currentTime()), { timeout: 5000 })
    .toBeGreaterThan(t1 + 0.3);
  expect(errors).toEqual([]);
});
