/**
 * 2.5D 動態立繪（建置產物 next/anime-rig/）的端對端測試：
 * - 開頁沒有 pageerror／console error；讀入畫面；頁尾只有靈感來源；
 * - 讀入程式畫的 PSD（tests/helpers/animeRig.ts）：自動綁定的結果（部件、左右、未分類、內建差分、髮束）、診斷、圖層清單；
 *   副檔名錯誤、壞檔的訊息與保留目前的模型；
 * - 表情預設的按鈕與快捷鍵 1～7、0；滑桿、數值欄、按兩下還原；暫停（Space）與畫面的變化；
 * - 錨點編輯（E、拖曳、方向鍵、還原、Esc）；背景（B）；圖層（隱藏、順序、濃度）；復原／重做；
 * - PNG 匯出（尺寸、透明、綠幕的像素）；錄影（無頭 Chromium 的 MediaRecorder：提早停止、WebM）；輕量 PSD；
 * - 設定：儲存（Ctrl＋S、未儲存標示）、重新整理後讀入同一個 PSD 自動還原、匯出／讀入 JSON（v1）、其他模型的 JSON；
 *   舊版的存檔（anime25d.settings.<指紋>、anime25d.prefs）；
 * - 攝影機追蹤：模型沒下載時的提示、模型下載（假的網址＋小檔案驗 SHA-256）、假的特徵點來源 → 參數、校正；
 *   麥克風（Chromium 的假裝置）；真的 FaceLandmarker（設定 ANIME_RIG_FACE_MODEL＝模型檔的路徑才跑）；
 * - 設定搜尋、全部收合／展開；390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type Download, expect, type Page, test } from '@playwright/test';
import { decodePng } from '../../src/core/decode/png';
import { getTool, outputDir } from '../../src/registry';
import { FACE_LANDMARKER_MODEL } from '../../src/tools/anime-rig/faceModel';
import { fingerprint } from '../../src/tools/anime-rig/runtime';
import { rigTestPsdBytes } from '../helpers/animeRig';

const URL = `/${outputDir(getTool('anime-rig') ?? { id: 'anime-rig', status: 'next' })}/`;

/* 有臉的影片（ANIME_RIG_FACE_VIDEO，Y4M）：設定了就讓 Chromium 的假攝影機播它 */
const FACE_VIDEO = process.env.ANIME_RIG_FACE_VIDEO;

test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      ...(FACE_VIDEO ? [`--use-file-for-fake-video-capture=${FACE_VIDEO}`] : []),
    ],
    env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  },
  permissions: ['camera', 'microphone'],
});

const PSD = rigTestPsdBytes();
const PSD_ID = fingerprint(PSD);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const REAL_MODEL = process.env.ANIME_RIG_FACE_MODEL;

/* ---------- 測試用的小伺服器（真的臉部模型） ---------- */

let server: Server;
let base = '';

test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    if (req.url === '/face.task' && REAL_MODEL && existsSync(REAL_MODEL)) {
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-length', String(statSync(REAL_MODEL).size));
      createReadStream(REAL_MODEL).pipe(res);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((r) => server.close(r));
});

/* ---------- 開頁與讀入 ---------- */

interface OpenOptions {
  /** 開頁前寫進 localStorage 的內容 */
  storage?: Record<string, string>;
  /** 假的特徵點來源（window.__animeRigFakeLandmarks） */
  fakeFace?: boolean;
  query?: string;
}

async function open(page: Page, { storage, fakeFace, query = '' }: OpenOptions = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.route('https://storage.googleapis.com/**', (r) => {
    if (REAL_MODEL && existsSync(REAL_MODEL))
      return r.fulfill({
        status: 302,
        headers: { location: `${base}/face.task`, 'access-control-allow-origin': '*' },
      });
    return r.fulfill({ status: 404, body: 'no', headers: { 'access-control-allow-origin': '*' } });
  });
  if (storage) {
    await page.addInitScript((items) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
    }, storage);
  }
  if (fakeFace) await page.addInitScript(installFakeFace);
  await page.goto(URL + query);
  await expect(page.getByRole('heading', { level: 1, name: '2.5D 動態立繪' })).toBeVisible();
  return errors;
}

/** 假的特徵點：一張正面的臉，`window.__fakeEye`（0～0.3）、`__fakeMouth` 可以改 */
function installFakeFace() {
  const w = window as unknown as {
    __animeRigFakeLandmarks: (t: number) => { x: number; y: number }[] | null;
    __fakeEye: number;
    __fakeMouth: number;
    __fakeYaw: number;
    __fakeNoFace: boolean;
  };
  w.__fakeEye = 0.3;
  w.__fakeMouth = 0.02;
  w.__fakeYaw = 0;
  w.__fakeNoFace = false;
  w.__animeRigFakeLandmarks = () => {
    if (w.__fakeNoFace) return null;
    const ar = 4 / 3;
    const lm = Array.from({ length: 478 }, (_, i) => ({
      x: 0.5 + 0.1 * Math.sin(i),
      y: 0.5 + 0.1 * Math.cos(i * 1.3),
    }));
    const set = (i: number, x: number, y: number) => {
      lm[i] = { x, y };
    };
    set(234, 0.35, 0.5);
    set(454, 0.65, 0.5);
    set(1, 0.5 + (w.__fakeYaw * 0.3) / ar, 0.52);
    set(10, 0.5, 0.3);
    set(152, 0.5, 0.75);
    for (const [o, n, t, b, cx] of [
      [33, 133, 159, 145, 0.43],
      [263, 362, 386, 374, 0.57],
    ]) {
      set(o, cx - 0.03, 0.45);
      set(n, cx + 0.03, 0.45);
      set(t, cx, 0.45 - (w.__fakeEye * 0.06) / ar / 2);
      set(b, cx, 0.45 + (w.__fakeEye * 0.06) / ar / 2);
    }
    for (const i of [70, 63, 105, 66, 107, 300, 293, 334, 296, 336])
      set(i, 0.45, 0.4 - 0.085 * 0.45);
    set(61, 0.45, 0.62);
    set(291, 0.55, 0.62);
    set(13, 0.5, 0.62 - (w.__fakeMouth * 0.1) / ar / 2);
    set(14, 0.5, 0.62 + (w.__fakeMouth * 0.1) / ar / 2);
    set(468, 0.43, 0.45);
    set(473, 0.57, 0.45);
    return lm;
  };
}

async function choosePsd(page: Page, bytes: Uint8Array = PSD, name = 'test-avatar.psd') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開啟 PSD' }).first().click();
  await (await chooser).setFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
}

async function loadPsd(page: Page, bytes: Uint8Array = PSD, name = 'test-avatar.psd') {
  await choosePsd(page, bytes, name);
  await expect(page.getByTestId('status-text')).toHaveText(`已讀入 ${name}`, { timeout: 30_000 });
}

type RigState = {
  model: { id: string; name: string; layers: number } | null;
  paused: boolean;
  anchorMode: boolean;
  preset: string | null;
  background: string;
  params: Record<string, number>;
  anchors: Record<string, { dx?: number; dy?: number }>;
  layers: { id: string; visible: boolean; opacity: number; depth: number }[];
  auto: Record<string, boolean>;
  unsaved: boolean;
  cam: string;
  camLive: boolean;
  mic: string;
  calibrated: boolean;
  frame: Record<string, number> | null;
  recording: boolean;
};

const state = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __animeRig: { state(): unknown } }).__animeRig.state(),
  ) as Promise<RigState>;

/** 預覽停在決定性的姿勢，等兩個畫面 */
async function still(page: Page) {
  await page.evaluate(async () => {
    (window as unknown as { __animeRig: { still(): void } }).__animeRig.still();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

const settings = (page: Page) => page.getByRole('complementary', { name: '設定' });
const status = (page: Page) => page.getByTestId('status-text');

async function readDownload(d: Download): Promise<Uint8Array> {
  const p = await d.path();
  return new Uint8Array(readFileSync(p));
}

/* ---------- 開頁、讀入、綁定 ---------- */

test('開頁：讀入畫面、頁尾只有靈感來源、沒有錯誤', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('drop-empty')).toContainText('讓插畫動起來');
  await expect(page.getByTestId('model-name')).toHaveText('未讀入模型');
  await expect(page.locator('footer')).toContainText('靈感來源');
  await expect(page.locator('footer a')).toHaveAttribute(
    'href',
    'https://github.com/852wa/Anime2.5DRig',
  );
  await expect(page.getByRole('button', { name: '儲存 PNG' }).first()).toBeDisabled();
  expect(errors).toEqual([]);
});

test('讀入 PSD：自動綁定、診斷、圖層清單', async ({ page }) => {
  const errors = await open(page);
  await loadPsd(page);
  const s = await state(page);
  expect(s.model).toEqual({ id: PSD_ID, name: 'test-avatar.psd', layers: 20 });
  await expect(page.getByTestId('model-name')).toHaveText('模型：test-avatar.psd');
  const info = page.getByTestId('rig-info');
  await expect(info).toContainText('已自動綁定 20 個部件／11 條擺動部件');
  await expect(info).toContainText('512 × 512 px');
  await expect(info).toContainText('已去除雜訊：1／14 個圖層');
  await expect(info.locator('[data-level="auto"]')).toHaveCount(2);
  await expect(info).toContainText('瀏海 5 束、後髮 5 束');
  await expect(info).toContainText('未分類的圖層 1 個');
  await expect(info).toContainText('已略過空白圖層「blank」。');
  const layers = page.getByRole('list', { name: '圖層（上面在後、下面在前）' });
  await expect(layers.getByRole('listitem')).toHaveCount(20);
  await expect(layers.getByRole('listitem').first()).toContainText('back hair');
  await expect(layers.getByRole('listitem').first()).toContainText('後髮');
  await expect(layers.locator('[data-layer="6:eyewhite_l"]')).toContainText('白目');
  await expect(layers.locator('[data-layer="6:eyewhite_l"]')).toContainText('眼白 · 左');
  await expect(layers.locator('[data-layer="12:eye_close_l"]')).toContainText('自動產生');
  await expect(layers.locator('[data-layer="19:ribbon"]')).toContainText('未分類 → 跟著頭部');
  await expect(layers.locator('[data-layer="18:front hair"]')).toContainText('髮束 5');
  expect(errors).toEqual([]);
});

test('讀入失敗：副檔名、壞檔的訊息，目前的模型保留', async ({ page }) => {
  await open(page);
  await choosePsd(page, new Uint8Array([1, 2, 3]), 'note.txt');
  await expect(status(page)).toHaveText('錯誤：請選擇副檔名為 .psd 的檔案。');
  await loadPsd(page);
  const broken = new Uint8Array(PSD.slice(0, 200));
  await choosePsd(page, broken, 'broken.psd');
  await expect(status(page)).toHaveText(/^錯誤：/);
  expect((await state(page)).model?.name).toBe('test-avatar.psd');
  const psb = new Uint8Array(PSD);
  psb[5] = 2;
  await choosePsd(page, psb, 'big.psd');
  await expect(status(page)).toHaveText('錯誤：不是支援的 PSD 檔案（不支援 PSB）。');
  expect((await state(page)).model?.name).toBe('test-avatar.psd');
});

/* ---------- 表情預設、參數、暫停 ---------- */

test('表情預設：按鈕與快捷鍵 1～7、再按一次解除、0 解除、手動調整取消', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  await page.keyboard.press('2');
  let s = await state(page);
  expect(s.preset).toBe('smile');
  expect(s.params).toMatchObject({ eyeOpenL: 0, eyeOpenR: 0, brow: 0.45, mouthForm: 0.9 });
  await expect(settings(page).locator('[data-preset="smile"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('2');
  s = await state(page);
  expect(s.preset).toBeNull();
  expect(s.params).toMatchObject({ eyeOpenL: 1, eyeOpenR: 1, brow: 0, mouthForm: 0 });
  await page.keyboard.press('4');
  expect((await state(page)).params.irisScale).toBe(0.7);
  await page.keyboard.press('0');
  s = await state(page);
  expect(s.preset).toBeNull();
  expect(s.params.irisScale).toBe(1);
  await settings(page).locator('[data-preset="winkR"]').click();
  s = await state(page);
  expect(s.preset).toBe('winkR');
  expect(s.params).toMatchObject({ eyeOpenL: 1, eyeOpenR: 0 });
  /* 動任何滑桿：預設的按下狀態取消，參數保留 */
  const slider = settings(page).locator('[data-param="angleX"]').getByRole('slider');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  s = await state(page);
  expect(s.preset).toBeNull();
  expect(s.params.eyeOpenR).toBe(0);
  expect(s.params.angleX).toBeCloseTo(0.01, 5);
});

test('參數：數值欄（夾範圍）、按兩下還原；暫停中改數值畫面立刻變；Space', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  await still(page);
  const canvas = page.getByTestId('rig-canvas');
  const before = await canvas.screenshot();
  const row = settings(page).locator('[data-param="angleX"]');
  const input = row.getByRole('spinbutton');
  await input.fill('0.8');
  await input.press('Enter');
  expect((await state(page)).params.angleX).toBe(0.8);
  await input.fill('5');
  await input.press('Enter');
  expect((await state(page)).params.angleX).toBe(1);
  await page.waitForTimeout(200);
  const after = await canvas.screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
  expect((await state(page)).frame?.angleX).toBe(1);
  await row.getByRole('slider').dblclick();
  expect((await state(page)).params.angleX).toBe(0);
  /* 暫停／播放（Space） */
  await page.getByTestId('model-name').click();
  await page.keyboard.press('Space');
  expect((await state(page)).paused).toBe(false);
  await expect(status(page)).toHaveText('播放中。');
  await page.keyboard.press('Space');
  expect((await state(page)).paused).toBe(true);
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible();
});

/* ---------- 錨點、背景、圖層、復原 ---------- */

test('錨點編輯：E、拖曳、方向鍵、還原、Esc', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  await page.keyboard.press('e');
  expect((await state(page)).anchorMode).toBe(true);
  await expect(page.getByTestId('anchor-hint')).toBeVisible();
  const mouth = page.locator('[data-anchor="mouth"]');
  await expect(mouth).toBeVisible();
  const box = await mouth.locator('circle').boundingBox();
  if (!box) throw new Error('no handle');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const scale = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="rig-canvas"]') as HTMLCanvasElement;
    return c.getBoundingClientRect().width / c.width;
  });
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20 * scale, cy + 10 * scale, { steps: 5 });
  await page.mouse.up();
  let s = await state(page);
  expect(Math.abs((s.anchors.mouth?.dx ?? 0) - 20)).toBeLessThanOrEqual(1);
  expect(Math.abs((s.anchors.mouth?.dy ?? 0) - 10)).toBeLessThanOrEqual(1);
  const dx = s.anchors.mouth?.dx ?? 0;
  /* 閉眼位置只能上下 */
  const close = page.locator('[data-anchor="eyeLClose"]');
  await close.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  s = await state(page);
  expect(s.anchors.eyeLClose).toEqual({ dy: 10 });
  await mouth.focus();
  await page.keyboard.press('ArrowLeft');
  expect((await state(page)).anchors.mouth?.dx).toBe(dx - 1);
  await expect(page.getByTestId('anchor-summary')).toHaveText('已手動調整 2 處');
  /* 復原：方向鍵每次一步 */
  await page.keyboard.press('Control+z');
  expect((await state(page)).anchors.mouth?.dx).toBe(dx);
  await settings(page).getByRole('button', { name: '還原成自動偵測的位置' }).click();
  expect((await state(page)).anchors).toEqual({});
  await expect(page.getByTestId('anchor-summary')).toHaveText('全部都是自動偵測的位置');
  await page.keyboard.press('Escape');
  expect((await state(page)).anchorMode).toBe(false);
});

test('背景（B）、圖層（隱藏、順序、濃度、重設）、復原與重做', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  await page.keyboard.press('b');
  expect((await state(page)).background).toBe('green');
  await page.keyboard.press('b');
  expect((await state(page)).background).toBe('dark');
  await page.keyboard.press('Control+z');
  expect((await state(page)).background).toBe('green');
  await page.keyboard.press('Control+Shift+z');
  expect((await state(page)).background).toBe('dark');
  await page.keyboard.press('b');
  expect((await state(page)).background).toBe('checker');
  const layers = page.getByRole('list', { name: '圖層（上面在後、下面在前）' });
  const face = layers.locator('[data-layer="4:face"]');
  await face.getByRole('button', { name: '顯示「face」' }).click();
  let s = await state(page);
  expect(s.layers.find((l) => l.id === '4:face')?.visible).toBe(false);
  await face.getByRole('button', { name: '往後：face' }).click();
  s = await state(page);
  expect(s.layers.map((l) => l.id).slice(2, 5)).toEqual(['2:topwear', '4:face', '3:handwear']);
  await face.getByRole('button', { name: 'face 的詳細設定' }).click();
  const opacity = face.getByRole('spinbutton').first();
  await opacity.fill('0.5');
  await opacity.press('Enter');
  expect((await state(page)).layers.find((l) => l.id === '4:face')?.opacity).toBe(0.5);
  /* 滑過時預覽標出範圍 */
  await face.hover();
  await expect(page.getByTestId('layer-box')).toHaveCount(1);
  await settings(page).getByRole('button', { name: '重設圖層設定' }).click();
  s = await state(page);
  expect(s.layers.find((l) => l.id === '4:face')).toEqual({
    id: '4:face',
    visible: true,
    opacity: 1,
    depth: 1,
  });
  expect(s.layers[3].id).toBe('3:handwear');
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await state(page)).layers.find((l) => l.id === '4:face')?.opacity).toBe(0.5);
});

/* ---------- 匯出 ---------- */

async function pixel(png: Uint8Array, x: number, y: number) {
  const img = await decodePng(png);
  const i = (y * img.width + x) * 4;
  return { w: img.width, h: img.height, px: Array.from(img.rgba.slice(i, i + 4)) };
}

test('儲存 PNG：原尺寸、透明背景、綠幕背景', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  await still(page);
  let dl = page.waitForEvent('download');
  await page.getByRole('button', { name: '儲存 PNG' }).first().click();
  let d = await dl;
  expect(d.suggestedFilename()).toBe('test-avatar.png');
  let png = await readDownload(d);
  let p = await pixel(png, 5, 5);
  expect([p.w, p.h]).toEqual([512, 512]);
  expect(p.px).toEqual([0, 0, 0, 0]);
  const torso = await pixel(png, 256, 470);
  expect(torso.px[3]).toBe(255);
  expect(torso.px[0]).toBeLessThan(90);
  expect(torso.px[2]).toBeGreaterThan(130);
  await expect(status(page)).toHaveText('已匯出 PNG（512 × 512 px，透明）');
  const exportArea = settings(page).locator('[data-section="export"]');
  await exportArea.getByRole('radio', { name: '綠幕' }).click();
  dl = page.waitForEvent('download');
  await exportArea.getByRole('button', { name: '儲存 PNG' }).click();
  d = await dl;
  png = await readDownload(d);
  p = await pixel(png, 5, 5);
  expect(p.px).toEqual([0, 177, 64, 255]);
  await expect(status(page)).toHaveText('已匯出 PNG（512 × 512 px）');
});

test('錄影：WebM、提早停止並儲存', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  const dl = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByTestId('record-button').click();
  await expect(page.getByTestId('rec-badge')).toContainText('● REC');
  expect((await state(page)).recording).toBe(true);
  await page.waitForTimeout(1500);
  await page.getByTestId('record-button').click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('test-avatar.webm');
  const bytes = await readDownload(d);
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  await expect(status(page)).toHaveText(/^已匯出影片（512 × 512 px，\d+\.\d 秒，[\d.]+ MB）$/);
  expect((await state(page)).recording).toBe(false);
});

test('儲存輕量 PSD：去掉雜點、裁過，讀得回來', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  const dl = page.waitForEvent('download');
  await settings(page).getByRole('button', { name: '儲存輕量 PSD' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('test-avatar_clean.psd');
  const bytes = await readDownload(d);
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x38, 0x42, 0x50, 0x53]);
  await expect(status(page)).toHaveText(/^已儲存輕量 PSD（[\d.]+ MB，已去除雜訊並裁切）。$/);
  await loadPsd(page, bytes, 'clean.psd');
  expect((await state(page)).model?.layers).toBe(20);
  await expect(page.getByTestId('rig-info')).not.toContainText('已去除雜訊');
});

/* ---------- 設定 ---------- */

test('設定：Ctrl＋S、未儲存標示、重新整理後讀入同一個 PSD 自動還原', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  const save = page.getByTestId('save-settings');
  await expect(save).toHaveText('儲存調整');
  await page.keyboard.press('3');
  await page.keyboard.press('b');
  await expect(save).toHaveText('儲存調整 ●');
  expect((await state(page)).unsaved).toBe(true);
  await page.keyboard.press('Control+s');
  await expect(status(page)).toHaveText('已把這個模型的調整儲存到瀏覽器。');
  await expect(save).toHaveText('儲存調整');
  await page.keyboard.press('e');
  await page.locator('[data-anchor="neck"]').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+s');
  const saved = JSON.parse(
    (await page.evaluate(
      (id) => localStorage.getItem(`trpg-toolkit:anime-rig:model:${id}`),
      PSD_ID,
    )) ?? '{}',
  );
  expect(saved).toMatchObject({
    format: 'anime25d-settings',
    version: 2,
    modelId: PSD_ID,
    modelName: 'test-avatar.psd',
    preset: 'usume',
    background: 'green',
    anchors: { neck: { dy: 1 } },
  });
  await page.reload();
  await loadPsd(page);
  const s = await state(page);
  expect(s.preset).toBe('usume');
  expect(s.background).toBe('green');
  expect(s.anchors).toEqual({ neck: { dy: 1 } });
  expect(s.unsaved).toBe(false);
  /* 還原成已儲存的狀態 */
  await page.keyboard.press('0');
  await settings(page).getByRole('button', { name: '還原成已儲存的狀態' }).click();
  expect((await state(page)).preset).toBe('usume');
  await expect(status(page)).toHaveText('已還原儲存的調整');
});

test('設定 JSON：匯出、讀入 v1、其他模型的 JSON', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  await page.keyboard.press('5');
  const dl = page.waitForEvent('download');
  await settings(page).getByRole('button', { name: '匯出設定 JSON' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('test-avatar.rig.json');
  const json = JSON.parse(new TextDecoder().decode(await readDownload(d)));
  expect(json).toMatchObject({
    format: 'anime25d-settings',
    version: 2,
    modelId: PSD_ID,
    preset: 'jito',
  });
  expect(Object.keys(json.params)).toHaveLength(36);
  expect(json.layers).toHaveLength(20);
  expect(json.auto).toEqual({
    idle: true,
    blink: true,
    rand: true,
    talk: true,
    mouse: false,
    phys: true,
  });
  /* v1（沒有錨點）、圖層少一個、參數範圍外 */
  const v1 = {
    ...json,
    version: 1,
    preset: null,
    params: { ...json.params, brow: 9 },
    auto: { idle: false },
    layers: json.layers.slice(1),
  };
  delete v1.anchors;
  let chooser = page.waitForEvent('filechooser');
  await settings(page).getByRole('button', { name: '讀入設定 JSON' }).click();
  await (await chooser).setFiles({
    name: 'v1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(v1)),
  });
  await expect(status(page)).toHaveText(
    '已讀入設定（圖層結構不同的 1 項維持初始值）。按「儲存調整」就能記住。',
  );
  const s = await state(page);
  expect(s.preset).toBeNull();
  expect(s.params.brow).toBe(1);
  expect(s.auto.idle).toBe(false);
  chooser = page.waitForEvent('filechooser');
  await settings(page).getByRole('button', { name: '讀入設定 JSON' }).click();
  await (await chooser).setFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...json, modelId: 'zzz' })),
  });
  await expect(status(page)).toHaveText(
    '無法讀入設定：這是其他 PSD 的設定。請讀入與儲存時相同的 PSD。',
  );
});

test('舊版的存檔：anime25d.settings.<指紋> 與 anime25d.prefs 讀得到', async ({ page }) => {
  const legacy = {
    format: 'anime25d-settings',
    version: 2,
    app: 'Anime2.5DRig 2.0.0',
    modelId: PSD_ID,
    modelName: 'old.psd',
    params: { angleX: 0.25, mouthEase: 0.5 },
    preset: null,
    auto: { idle: false, blink: true, rand: false, talk: false, mouse: false, phys: true },
    background: 'dark',
    layers: [],
    anchors: { face: { dx: 7 } },
  };
  const prefs = {
    headGain: 1.7,
    linkEyes: false,
    exportBg: 'green',
    recSeconds: 10,
    collapsed: ['brow'],
  };
  await open(page, {
    storage: {
      [`anime25d.settings.${PSD_ID}`]: JSON.stringify(legacy),
      'anime25d.prefs': JSON.stringify(prefs),
    },
  });
  /* 偏好設定搬過來：眉毛區塊收合 */
  await expect(settings(page).getByRole('button', { name: '眉毛', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const migrated = JSON.parse(
    (await page.evaluate(() => localStorage.getItem('trpg-toolkit:anime-rig:preview'))) ?? '{}',
  );
  expect(migrated.state.data).toMatchObject({
    headGain: 1.7,
    linkEyes: false,
    exportBg: 'green',
    recSeconds: 10,
  });
  await loadPsd(page);
  const s = await state(page);
  expect(s.params.angleX).toBe(0.25);
  expect(s.params.mouthEase).toBe(0.5);
  expect(s.background).toBe('dark');
  expect(s.auto).toMatchObject({ idle: false, rand: false, talk: false });
  expect(s.anchors).toEqual({ face: { dx: 7 } });
});

/* ---------- 攝影機與麥克風 ---------- */

const modelPanel = (page: Page) => page.getByTestId('model-panel');
const camToggle = (page: Page) => settings(page).getByRole('switch', { name: '攝影機追蹤' });

/** 小的假模型檔（驗 SHA-256 的流程；不是真的 .task，建立偵測器會失敗） */
const FAKE_TASK = new Uint8Array(4096).map((_, i) => (i * 37 + 11) & 255);

test('攝影機追蹤：模型沒下載時提示、下載（驗 SHA-256）後接著開；壞的模型說明原因', async ({
  page,
}) => {
  await page.route('https://models.invalid/**', (r) =>
    r.fulfill({
      status: 200,
      body: Buffer.from(FAKE_TASK),
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.addInitScript(
    (spec) => {
      (window as unknown as { __animeRigFaceModel: unknown }).__animeRigFaceModel = spec;
    },
    {
      ...FACE_LANDMARKER_MODEL,
      id: 'test-fake-face',
      url: 'https://models.invalid/face.task',
      bytes: FAKE_TASK.length,
      sha256: sha(FAKE_TASK),
    },
  );
  const errors = await open(page);
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'missing');
  await expect(modelPanel(page)).toContainText('授權：Apache-2.0');
  await expect(modelPanel(page)).toContainText('Google 的 MediaPipe');
  await camToggle(page).click();
  await expect(status(page)).toHaveText('要先下載臉部追蹤模型。');
  expect((await state(page)).auto.cam).toBe(false);
  await modelPanel(page)
    .getByRole('button', { name: /^下載模型/ })
    .click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  /* 下載好就接著開攝影機：假的模型建立不了偵測器（WebAssembly 照樣從本站載入） */
  await expect(status(page)).toHaveText(/^無法啟動攝影機：無法載入臉部追蹤：/, { timeout: 60_000 });
  expect((await state(page)).auto.cam).toBe(false);
  expect((await state(page)).cam).toBe('off');
  expect(errors.filter((e) => !/face_landmarker|tasks-vision|wasm|Model|graph/i.test(e))).toEqual(
    [],
  );
});

test('攝影機追蹤（假的特徵點）：參數跟著臉、小畫面、校正、關掉', async ({ page }) => {
  const errors = await open(page, { fakeFace: true });
  await loadPsd(page);
  await settings(page).getByRole('switch', { name: '自動眨眼' }).click();
  await camToggle(page).click();
  await expect.poll(async () => (await state(page)).cam, { timeout: 20_000 }).toBe('on');
  await expect.poll(async () => (await state(page)).camLive).toBe(true);
  await expect(page.getByTestId('cam-preview')).toBeVisible();
  await expect(settings(page)).toContainText('攝影機追蹤中');
  /* 轉頭：本人往右（影像的右邊）→ 立繪的角度 X 是負的 */
  await page.evaluate(() => {
    (window as unknown as { __fakeYaw: number }).__fakeYaw = 0.15;
  });
  await expect
    .poll(async () => (await state(page)).frame?.angleX ?? 0, { timeout: 10_000 })
    .toBeLessThan(-0.3);
  /* 閉眼 */
  await page.evaluate(() => {
    (window as unknown as { __fakeEye: number }).__fakeEye = 0;
  });
  await expect
    .poll(async () => (await state(page)).frame?.eyeOpenL ?? 1, { timeout: 10_000 })
    .toBeLessThan(0.1);
  await page.evaluate(() => {
    const w = window as unknown as { __fakeEye: number; __fakeYaw: number };
    w.__fakeEye = 0.3;
    w.__fakeYaw = 0;
  });
  /* 校正 */
  await settings(page).getByRole('button', { name: '記錄正面（校正）' }).click();
  await expect(status(page)).toHaveText(/^已記錄正面的表情（\d+ 個影格）$/, { timeout: 10_000 });
  expect((await state(page)).calibrated).toBe(true);
  await expect(page.getByTestId('calibration-status')).toHaveText(
    '已記錄（以你的自然表情為基準判定）',
  );
  await settings(page).getByRole('button', { name: '清除記錄' }).click();
  expect((await state(page)).calibrated).toBe(false);
  /* 沒有臉：追蹤值停用 */
  await page.evaluate(() => {
    (window as unknown as { __fakeNoFace: boolean }).__fakeNoFace = true;
  });
  await expect.poll(async () => (await state(page)).camLive).toBe(false);
  /* 小畫面的 × 隱藏 */
  await page.getByRole('button', { name: '隱藏攝影機小畫面' }).click();
  await expect(page.getByTestId('cam-preview')).toBeHidden();
  await camToggle(page).click();
  expect((await state(page)).cam).toBe('off');
  expect(errors).toEqual([]);
});

test('?cam=1：開頁就開攝影機追蹤', async ({ page }) => {
  await open(page, { fakeFace: true, query: '?cam=1' });
  await expect.poll(async () => (await state(page)).cam, { timeout: 20_000 }).toBe('on');
  expect((await state(page)).auto.cam).toBe(true);
});

test('麥克風嘴型：Chromium 的假裝置、音量表', async ({ page }) => {
  const errors = await open(page);
  await loadPsd(page);
  await settings(page).getByRole('switch', { name: '麥克風嘴型' }).click();
  await expect.poll(async () => (await state(page)).mic, { timeout: 20_000 }).toBe('on');
  await expect(settings(page)).toContainText('麥克風使用中');
  await expect
    .poll(async () => Number(await page.getByTestId('mic-meter').getAttribute('value')), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  /* 麥克風開著時隨機嘴型停止，嘴巴跟著音量 */
  await settings(page).getByRole('switch', { name: '麥克風嘴型' }).click();
  await expect.poll(async () => (await state(page)).mic).toBe('off');
  expect(errors).toEqual([]);
});

test('真的臉部模型（ANIME_RIG_FACE_MODEL）：下載、驗證、在假的攝影機畫面上偵測', async ({
  page,
}) => {
  test.skip(!REAL_MODEL || !existsSync(REAL_MODEL), '沒有設定 ANIME_RIG_FACE_MODEL');
  test.skip(!!FACE_VIDEO, '假攝影機播的是有臉的影片（另一個測試）');
  const errors = await open(page);
  await loadPsd(page);
  await modelPanel(page)
    .getByRole('button', { name: /^下載模型/ })
    .click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await camToggle(page).click();
  await expect.poll(async () => (await state(page)).cam, { timeout: 60_000 }).toBe('on');
  /* 假的攝影機畫面沒有臉：追蹤值不採用，小畫面顯示「偵測不到臉」 */
  await page.waitForTimeout(1500);
  /* 偵測照常執行（出錯時追蹤會停止、開關關掉） */
  expect((await state(page)).cam).toBe('on');
  expect((await state(page)).camLive).toBe(false);
  await expect(page.getByTestId('cam-preview')).toBeVisible();
  expect(errors.filter((e) => !/WebGL|GPU|XNNPACK|TensorFlow/i.test(e))).toEqual([]);
});

/* 真的模型＋有臉的影片（Chromium 的假攝影機讀 Y4M）：ANIME_RIG_FACE_MODEL 與 ANIME_RIG_FACE_VIDEO 都設定才跑 */
test.describe('真的臉部模型＋有臉的影片', () => {
  test('偵測到臉：追蹤值帶動參數、校正', async ({ page }) => {
    test.skip(
      !REAL_MODEL || !existsSync(REAL_MODEL) || !FACE_VIDEO || !existsSync(FACE_VIDEO),
      '沒有設定 ANIME_RIG_FACE_MODEL／ANIME_RIG_FACE_VIDEO',
    );
    await open(page);
    await loadPsd(page);
    await modelPanel(page)
      .getByRole('button', { name: /^下載模型/ })
      .click();
    await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
    await camToggle(page).click();
    await expect.poll(async () => (await state(page)).cam, { timeout: 60_000 }).toBe('on');
    await expect.poll(async () => (await state(page)).camLive, { timeout: 20_000 }).toBe(true);
    await settings(page).getByRole('button', { name: '記錄正面（校正）' }).click();
    await expect(status(page)).toHaveText(/^已記錄正面的表情（\d+ 個影格）$/, { timeout: 15_000 });
    /* 校正之後同一張臉：頭部接近正面、眼睛張開 */
    await page.waitForTimeout(1500);
    const f = (await state(page)).frame ?? {};
    expect(Math.abs(f.angleX ?? 1)).toBeLessThan(0.2);
    expect(f.eyeOpenL ?? 0).toBeGreaterThan(0.6);
  });
});

/* ---------- 面板、版面 ---------- */

test('設定搜尋、全部收合／展開', async ({ page }) => {
  await open(page);
  await loadPsd(page);
  const search = settings(page).getByRole('searchbox', { name: '搜尋設定' });
  await search.fill('閉合');
  await expect(settings(page).locator('[data-param="eyeEase"]')).toBeVisible();
  await expect(settings(page).locator('[data-param="mouthEase"]')).toBeVisible();
  await expect(settings(page).locator('[data-param="angleX"]')).toHaveCount(0);
  await expect(settings(page).locator('[data-section="auto"]')).toHaveCount(0);
  await search.fill('瀏海');
  /* 區塊標題符合：整個區塊都顯示；圖層名稱也搜得到 */
  await expect(settings(page).locator('[data-param="bangL"]')).toBeVisible();
  await expect(settings(page).locator('[data-layer="18:front hair"]')).toBeVisible();
  await expect(settings(page).locator('[data-layer="4:face"]')).toHaveCount(0);
  await search.fill('不存在的設定');
  await expect(settings(page)).toContainText('沒有符合的設定');
  await search.fill('');
  await settings(page).getByRole('button', { name: '全部收合' }).click();
  await expect(settings(page).locator('[data-section]')).toHaveCount(0);
  await settings(page).getByRole('button', { name: '全部展開' }).click();
  await expect(settings(page).locator('[data-section="auto"]')).toBeVisible();
  await settings(page).getByRole('button', { name: '眼睛', exact: true }).click();
  await expect(settings(page).locator('[data-section="eyes"]')).toHaveCount(0);
  await page.reload();
  await expect(settings(page).getByRole('button', { name: '眼睛', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

async function noHorizontalScroll(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function prepareShot(page: Page) {
  await still(page);
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('視覺回歸：1280 寬', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await open(page);
  await loadPsd(page);
  await noHorizontalScroll(page);
  await prepareShot(page);
  await expect(page).toHaveScreenshot('anime-rig-1280.png', {
    mask: [page.getByTestId('fps'), status(page)],
  });
  expect(errors).toEqual([]);
});

test('視覺回歸：390 寬（沒有橫向捲動）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await noHorizontalScroll(page);
  await loadPsd(page);
  await noHorizontalScroll(page);
  await page.keyboard.press('e');
  await noHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await settings(page).getByRole('button', { name: '全部收合' }).click();
  await noHorizontalScroll(page);
  await prepareShot(page);
  await expect(page).toHaveScreenshot('anime-rig-390.png', {
    fullPage: true,
    mask: [page.getByTestId('fps'), status(page)],
  });
  expect(errors).toEqual([]);
});

/* ---------- 與舊版並排（舊版還在 repo 時） ---------- */

const LEGACY_URL = '/tools/anime-rig/';
const hasLegacyPage = existsSync(
  new globalThis.URL('../../../tools/anime-rig/lib/app.js', import.meta.url),
);

/** 錨點編輯的靜止姿勢下要比對的參數（角度、視線、呼吸在靜止姿勢裡歸零） */
const PARITY_PARAMS: Record<string, number> = {
  eyeOpenL: 0.55,
  eyeOpenR: 0.3,
  irisScale: 0.8,
  brow: 0.6,
  browAngL: 0.4,
  mouthOpen: 0.8,
  mouthForm: 0.7,
  mouthScale: 1.2,
  bangL: 0.5,
  armY: 0.5,
  eyeCY: 0.3,
};

const LEGACY_IDS: Record<string, string> = {
  eyeOpenL: 'pEyeL',
  eyeOpenR: 'pEyeR',
  irisScale: 'pIrisScale',
  brow: 'pBrow',
  browAngL: 'pBrowAngL',
  mouthOpen: 'pMouthOpen',
  mouthForm: 'pMouthForm',
  mouthScale: 'pMouthScale',
  bangL: 'pBangL',
  armY: 'pArmY',
  eyeCY: 'pEyeCY',
};

function pngDiff(
  a: { rgba: Uint8ClampedArray | Uint8Array },
  b: { rgba: Uint8ClampedArray | Uint8Array },
) {
  let max = 0;
  let count = 0;
  for (let i = 0; i < a.rgba.length; i++) {
    const d = Math.abs(a.rgba[i] - b.rgba[i]);
    if (d > max) max = d;
    if (d > 2) count++;
  }
  return { max, count };
}

test('與舊版並排：同一個 PSD、同樣的參數，錨點編輯的靜止姿勢匯出的 PNG 相同', async ({
  page,
  context,
}) => {
  test.skip(!hasLegacyPage, '舊版的檔案不在');
  test.setTimeout(180_000);
  /* 新版 */
  await open(page);
  await loadPsd(page);
  for (const [k, v] of Object.entries(PARITY_PARAMS)) {
    const input = settings(page).locator(`[data-param="${k}"]`).getByRole('spinbutton');
    await input.fill(String(v));
    await input.press('Enter');
  }
  await page
    .getByRole('toolbar', { name: '預覽的操作' })
    .getByRole('button', { name: '編輯錨點' })
    .click();
  expect((await state(page)).anchorMode).toBe(true);
  await page.waitForTimeout(30_000);
  let dl = page.waitForEvent('download');
  await page.getByRole('button', { name: '儲存 PNG' }).first().click();
  const mineBytes = await readDownload(await dl);
  const mine = await decodePng(mineBytes);
  if (process.env.ANIME_RIG_PARITY_OUT)
    writeFileSync(`${process.env.ANIME_RIG_PARITY_OUT}/new.png`, mineBytes);
  /* 舊版 */
  const old = await context.newPage();
  await old.route(/fonts\.(googleapis|gstatic)\.com|jsdelivr/, (r) =>
    r.fulfill({ status: 200, body: '' }),
  );
  await old.goto(LEGACY_URL);
  await old.locator('#fileInput').setInputFiles({
    name: 'test-avatar.psd',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(PSD),
  });
  await expect(old.locator('#modelName')).toHaveText('test-avatar.psd', { timeout: 30_000 });
  await old.evaluate(
    (pairs) => {
      for (const [id, v] of pairs) {
        const el = document.getElementById(id) as HTMLInputElement;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    Object.entries(PARITY_PARAMS).map(([k, v]) => [LEGACY_IDS[k], v] as [string, number]),
  );
  await old.locator('body').press('e');
  await old.waitForTimeout(30_000);
  dl = old.waitForEvent('download');
  await old.locator('#btnPng').click();
  const theirsBytes = await readDownload(await dl);
  const theirs = await decodePng(theirsBytes);
  if (process.env.ANIME_RIG_PARITY_OUT)
    writeFileSync(`${process.env.ANIME_RIG_PARITY_OUT}/old.png`, theirsBytes);
  expect([mine.width, mine.height]).toEqual([theirs.width, theirs.height]);
  const d = pngDiff(mine, theirs);
  /* 允許：彈簧的殘餘（12 秒後 < 0.5 px）造成髮梢邊緣少數像素的差異 */
  expect(d.count).toBeLessThan(mine.width * mine.height * 0.001);
});
