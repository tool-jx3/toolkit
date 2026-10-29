/**
 * 環境音混音器（建置產物 next/ambience-mixer/）的端對端測試：
 * - 開頁沒有錯誤、靈感來源、分類與聲音卡片、預設組合；
 * - 點卡片加入並開始播放、再點拿掉；預設組合、隨機組合、復原；一軌的音量、參數（重新合成）、起伏、換一種變化；
 * - 我的組合、分享連結（開連結時先確認）、自己的音檔（循環／只播一次）、定時停止、自動儲存、鍵盤；
 * - 匯出 WAV：格式、長度、首尾相接、和 Node 裡的合成一模一樣（預覽＝匯出；OfflineAudioContext 的混音只乘上音量）、
 *   檔案大小與 CCFOLIA 上限的提醒；
 * - 390 寬沒有橫向捲動、1280／390 視覺基準；
 * - @serial：即時播放（AudioContext 的時間往前走、主輸出有聲音；暫停後沒有聲音）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { renderAmbience } from '../../src/core/audio/ambience/render';
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
    export: { seconds: number; sampleRate: number; channels: number };
  };
  status: () => Record<string, string>;
  playing: () => boolean;
  contextState: () => string;
  currentTime: () => number;
  level: () => number;
  renders: () => number;
  tracks: () => string[];
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

/** 匯出並解析下載的 WAV */
async function exportWav(page: Page): Promise<{ pcm: PcmAudio; name: string; bytes: number }> {
  await page.getByTestId('export-wav').click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載 WAV' }).click(),
  ]);
  const path = await download.path();
  const bytes = readFileSync(path);
  return {
    pcm: parseWav(new Uint8Array(bytes)),
    name: download.suggestedFilename(),
    bytes: bytes.length,
  };
}

/** 選匯出設定（下拉選單） */
async function pick(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const rmsOf = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

test('開頁：沒有錯誤、靈感來源、7 個分類 24 種聲音、10 個預設組合；沒有聲音時播放鍵停用', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByRole('link', { name: 'remvze/moodist' })).toHaveAttribute(
    'href',
    'https://github.com/remvze/moodist',
  );
  await expect(page.locator('button[data-sound]')).toHaveCount(24);
  await expect(page.locator('[data-category]')).toHaveCount(7);
  await expect(page.locator('button[data-preset]')).toHaveCount(10);
  await expect(page.getByTestId('play-toggle')).toBeDisabled();
  await expect(page.getByTestId('mix-summary')).toHaveText(
    '還沒有聲音。點選聲音卡片，或挑一個預設組合。',
  );
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
  expect(link).toMatch(/\/next\/ambience-mixer\/#s=/);
  await page.keyboard.press('Escape');

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
  /* 非音檔 */
  await fileInput(page).setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByText('這不是音檔', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('匯出 WAV：格式與長度、首尾相接、和 Node 的合成一模一樣（只乘上音量）；大小與 CCFOLIA 上限', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('export-wav')).toBeDisabled();
  await card(page, 'rain-light').click();
  await waitReady(page, 1);
  await btn(page, '暫停').click();
  /* 音量 100%、總音量 50%（2 × 0.5² ＝ 0.5 倍） */
  await track(page, 's:rain-light').getByRole('slider', { name: '小雨的音量' }).focus();
  await page.keyboard.press('End');
  await page.getByRole('spinbutton', { name: '總音量' }).fill('50');
  await page.getByRole('spinbutton', { name: '總音量' }).press('Enter');
  await expect.poll(async () => (await state(page)).master).toBe(50);
  /* 預設（60 秒、32 kHz、立體聲）：約 7.3 MB、和預覽一模一樣 */
  await expect(page.getByTestId('export-size')).toHaveText('約 7.3 MB・和預覽聽到的一模一樣。');
  /* 太大：3 分、44.1 kHz 立體聲 → 提醒 */
  await pick(page, '長度', '3 分');
  await pick(page, '取樣率', '44.1 kHz（CD 音質）');
  await expect(page.getByText(/超過 CCFOLIA 的音源上限/)).toBeVisible();
  await expect(page.getByTestId('export-size')).toContainText('約 30.3 MB');
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
  /* Node 裡用同樣的設定合成：匯出＝0.5 × 合成（從第 2 秒開始的一個週期；WAV 的量化誤差以內） */
  const ref = renderAmbience('rain-light', {}, { duration: 10, sampleRate: 22050, seed: 1 });
  const n = 10 * 22050;
  const off = 2 * 22050;
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
  await expect(page.getByTestId('timer-left')).toHaveText(/^還有 1[45]:\d\d 慢慢停下來$/);
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
  await page.clock.fastForward('15:01');
  await expect.poll(() => hook(page, (h) => h.playing())).toBe(false);
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
