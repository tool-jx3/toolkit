/**
 * 立繪去背工具（建置產物 tools/bg-remover/）的端對端測試：
 * - 開頁沒有 pageerror／console error；AI 模式先告知模型的大小、來源、授權；推論尺寸固定 1024；
 * - 模型下載：固定 revision 的網址、HTTP 錯誤、進度與取消、SHA-256 不符時丟棄、存進 Cache Storage 後不再下載、刪除；
 * - AI 去背：用小的假模型（tests/fixtures/bg-remover-fake-model.onnx，形狀與名稱同真模型）跑完整流程，
 *   匯出的遮罩與「新版前後處理＋假模型的算式」逐像素比對；
 * - 真模型（設定 BG_REMOVER_MODEL、BG_REMOVER_REF 時才跑）：匯出的遮罩、白底圖與 Python 參考做法比對；
 * - 純色去背（自動偵測、只去掉相連的背景、從圖上取色）、筆刷（擦掉、補回、復原／重做、快捷鍵）；
 * - 批次與 ZIP、匯出格式（PNG／WebP／JPG、背景、裁透明邊、遮罩、比較圖）；
 * - 自動保存與重新整理後還原、專案檔；390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準；
 * - 對等驗證後的修正（規格 7.1）：顯示卡建不起來時改用 CPU（F05）、Wi-Fi 提醒（F12）、SHA-256 階段看得到（F13）、
 *   自動 AI 去背遇到壞掉的模型（F20）、取消 AI 去背的訊息（F21）、預覽背景圖重新整理後還在（F41）、第一張圖的「讀取中…」（F43）、
 *   去色邊處理邊界旁一圈（F32）、快捷鍵一覽的 Esc（F58）、大圖不凍住畫面、匯出取消的訊息、略過不是圖片的檔案。
 *
 * 模型網址一律用 page.route 攔下：假模型直接回傳位元組；慢速下載與真模型由測試裡的小伺服器（隨機 port）提供，
 * 再以 302 轉過去（大檔案不能直接塞進 route.fulfill）。
 */
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { decodePng } from '../../src/core/decode/png';
import { encodePng } from '../../src/core/encode/png';
import { quantizeMask } from '../../src/core/image/mask';
import type { ModelSpec } from '../../src/core/models';
import { getTool, outputDir } from '../../src/registry';
import { fromModelOutput, MODEL_SIZE, toModelInput } from '../../src/tools/bg-remover/animeSeg';
import { ANIME_SEG_MODEL } from '../../src/tools/bg-remover/model';
import { fakeSegValue } from '../helpers/onnx';

const URL = `/${outputDir(getTool('bg-remover') ?? { id: 'bg-remover', status: 'next' })}/`;

const FAKE = readFileSync(
  new globalThis.URL('../fixtures/bg-remover-fake-model.onnx', import.meta.url),
);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const FAKE_SPEC: ModelSpec = {
  id: 'test-fake',
  url: 'https://models.invalid/fake/isnetis.onnx',
  bytes: FAKE.length,
  sha256: sha(FAKE),
  name: '測試用的假模型',
  source: '測試',
  license: 'MIT',
};

/** 慢速下載用：3 MB 的決定性資料 */
const SLOW = Buffer.alloc(3_000_000);
for (let i = 0; i < SLOW.length; i++) SLOW[i] = (i * 131 + 7) & 255;
const SLOW_SPEC: ModelSpec = {
  ...FAKE_SPEC,
  id: 'test-slow',
  url: 'https://models.invalid/slow/model.onnx',
  bytes: SLOW.length,
  sha256: sha(SLOW),
};

const REAL_MODEL = process.env.BG_REMOVER_MODEL;
const REAL_REF = process.env.BG_REMOVER_REF;
const REAL_OUT = process.env.BG_REMOVER_OUT;

/* ---------- 測試用的小伺服器（慢速下載、真模型） ---------- */

let server: Server;
let base = '';

test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    if (req.url === '/slow') {
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-length', String(SLOW.length));
      let o = 0;
      const timer = setInterval(() => {
        if (o >= SLOW.length || res.destroyed) {
          clearInterval(timer);
          res.end();
          return;
        }
        res.write(SLOW.subarray(o, o + 64 * 1024));
        o += 64 * 1024;
      }, 40);
      req.on('close', () => clearInterval(timer));
      return;
    }
    if (req.url === '/real.onnx' && REAL_MODEL && existsSync(REAL_MODEL)) {
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

/* ---------- 開頁 ---------- */

interface OpenOptions {
  /** 換成這個模型（e2e 的測試入口 window.__bgRemoverModel）；不給時用真的 Hugging Face 網址 */
  spec?: ModelSpec;
  /** 假模型的網址回傳改壞的位元組（驗證失敗） */
  corrupt?: boolean;
}

interface Opened {
  errors: string[];
  /** 模型網址被請求的次數 */
  modelRequests: string[];
}

async function open(page: Page, { spec, corrupt = false }: OpenOptions = {}): Promise<Opened> {
  const errors: string[] = [];
  const modelRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.route('https://models.invalid/**', (r) => {
    modelRequests.push(r.request().url());
    if (r.request().url() === SLOW_SPEC.url) {
      return r.fulfill({
        status: 302,
        headers: { location: `${base}/slow`, 'access-control-allow-origin': '*' },
      });
    }
    const body = Buffer.from(FAKE);
    if (corrupt) body[body.length - 3] ^= 1;
    return r.fulfill({ status: 200, body, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://huggingface.co/**', (r) => {
    modelRequests.push(r.request().url());
    if (REAL_MODEL && existsSync(REAL_MODEL))
      return r.fulfill({
        status: 302,
        headers: { location: `${base}/real.onnx`, 'access-control-allow-origin': '*' },
      });
    return r.fulfill({
      status: 404,
      body: 'not here',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  if (spec) {
    await page.addInitScript((s) => {
      (window as unknown as { __bgRemoverModel: unknown }).__bgRemoverModel = s;
    }, spec);
  }
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '立繪去背工具' })).toBeVisible();
  return { errors, modelRequests };
}

/* ---------- 小工具 ---------- */

const status = (page: Page) => page.getByTestId('status-text');
const modelPanel = (page: Page) => page.getByTestId('model-panel');
const canvas = (page: Page) => page.getByTestId('preview-canvas');
const exportArea = (page: Page) => page.getByRole('region', { name: '匯出' });
const fileInput = (page: Page) =>
  page.getByRole('group', { name: '把立繪拖到這裡' }).locator('input[type=file]');
const list = (page: Page) => page.getByRole('list', { name: '已載入的圖片' });
const items = (page: Page) => list(page).getByRole('listitem');
const strokeCount = (page: Page) => page.getByTestId('stroke-count');

/** 記下「AI 去背中」的進度有沒有出現過（假模型很快，等不到它出現在畫面上） */
async function watchAiProgress(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __aiSeen: boolean };
    w.__aiSeen = false;
    new MutationObserver((_, obs) => {
      if (document.querySelector('[data-testid="ai-progress"]')) {
        w.__aiSeen = true;
        obs.disconnect();
      }
    }).observe(document.body, { subtree: true, childList: true });
  });
}

async function aiProgressSeen(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __aiSeen: boolean }).__aiSeen);
  await expect(page.getByTestId('ai-progress')).toHaveCount(0, { timeout: 60_000 });
}

async function expectReady(page: Page) {
  await expect(canvas(page)).toHaveAttribute('data-phase', 'ready', { timeout: 60_000 });
}

/** 預覽畫好了目前的狀態（整張在 Worker 裡合成，畫好後畫布的 data-painted＝「data-tick:檢視」） */
async function expectPainted(page: Page, view: 'result' | 'original' | 'mask') {
  await expect(canvas(page)).toHaveAttribute('data-phase', 'ready');
  await page.waitForFunction(
    (v) => {
      const c = document.querySelector('[data-testid="preview-canvas"]');
      return c?.getAttribute('data-painted') === `${c?.getAttribute('data-tick')}:${v}`;
    },
    view,
    { timeout: 30_000 },
  );
}

async function downloadModel(page: Page) {
  await page.getByRole('button', { name: /^下載模型/ }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready', { timeout: 120_000 });
}

async function useColorMode(page: Page) {
  await page.getByRole('radio', { name: '純色背景' }).click();
}

async function loadDemo(page: Page) {
  await page.getByRole('button', { name: '放入範例圖' }).click();
  await expect(status(page)).toHaveText('已加入 2 張圖片。');
  await expectReady(page);
}

/** 白底中間一個黑色長方形（w × h） */
async function squarePng(w = 64, h = 48): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4).fill(255);
  for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.75); y++)
    for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x++)
      px.set([0, 0, 0, 255], (y * w + x) * 4);
  /* 左上角一塊灰（假模型算出來是半透明） */
  for (let y = 2; y < 6; y++)
    for (let x = 2; x < 6; x++) px.set([128, 128, 128, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 用新版的前後處理＋假模型的算式算出的遮罩（0～255） */
function expectedFakeMask(png: Buffer): { mask: Uint8Array; width: number; height: number } {
  const img = decodePng(png);
  const { tensor, box } = toModelInput(img.rgba, img.width, img.height, MODEL_SIZE);
  const plane = MODEL_SIZE * MODEL_SIZE;
  const pred = new Float32Array(plane);
  for (let i = 0; i < plane; i++)
    pred[i] = fakeSegValue(tensor[i], tensor[plane + i], tensor[2 * plane + i]);
  return { mask: quantizeMask(fromModelOutput(pred, box)), width: img.width, height: img.height };
}

/** 匯出（目前的範圍與設定）；單檔回傳下載，多檔回傳結果區 */
async function exportOne(page: Page, format?: 'PNG' | 'WebP' | 'JPG'): Promise<Buffer> {
  const area = exportArea(page);
  if (format) await area.getByRole('radio', { name: format, exact: true }).click();
  await area.getByRole('button', { name: /^匯出 / }).click();
  const card = area.getByTestId('export-result');
  await expect(card).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  return readFileSync((await dl.path()) as string);
}

async function setExport(page: Page, label: string) {
  await exportArea(page).getByRole('radio', { name: label, exact: true }).click();
}

const pngPixel = (png: Buffer, x: number, y: number) => {
  const img = decodePng(png);
  const k = (y * img.width + x) * 4;
  return Array.from(img.rgba.slice(k, k + 4));
};

/** 讓焦點離開表單控制項（單鍵快捷鍵在開關、選項、輸入欄上不作用） */
async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 圖片座標 → 螢幕座標（預覽畫布的實際位置） */
async function toScreen(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  const [w, h] = await canvas(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  return { x: box.x + (x / w) * box.width, y: box.y + (y / h) * box.height };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  /* 預覽可能被捲到頁首底下：先捲到畫面中央 */
  await canvas(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

/* ---------- 開頁與模型 ---------- */

test('開頁沒有錯誤；AI 模式先告知模型的大小、來源與授權；推論尺寸固定 1024；只放靈感來源', async ({
  page,
}) => {
  const { errors, modelRequests } = await open(page);
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'missing');
  await expect(modelPanel(page)).toContainText(
    '要先下載 AI 模型才能使用：anime-seg（isnetis.onnx），約 176 MB。',
  );
  await expect(modelPanel(page)).toContainText('授權：Apache-2.0');
  /* 檔案很大：建議用 Wi-Fi（第 7 節 D1） */
  await expect(modelPanel(page)).toContainText('建議在 Wi-Fi 下下載。');
  await expect(
    modelPanel(page).getByRole('link', { name: /Hugging Face 上 SkyTNT 的 anime-seg/ }),
  ).toHaveAttribute('href', 'https://huggingface.co/skytnt/anime-seg');
  await expect(page.getByRole('button', { name: '下載模型（約 176 MB）' })).toBeVisible();
  await expect(page.getByTestId('infer-size')).toHaveText('1024 × 1024（模型固定）');
  await expect(page.getByRole('link', { name: 'SkyTNT/anime-segmentation' })).toHaveAttribute(
    'href',
    'https://github.com/SkyTNT/anime-segmentation',
  );
  /* 沒有按下載就不會連到模型網址 */
  expect(modelRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('下載模型：請求固定 revision 的 Hugging Face 網址；HTTP 錯誤時說明並可以重試', async ({
  page,
}) => {
  test.skip(!!REAL_MODEL, '有真模型時這個網址會轉到真的檔案');
  const { errors, modelRequests } = await open(page);
  await page.getByRole('button', { name: '下載模型（約 176 MB）' }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'error');
  await expect(modelPanel(page).getByRole('alert')).toHaveText(
    '下載網址回應錯誤，請稍後再試一次。（HTTP 404）',
  );
  expect(modelRequests).toEqual([ANIME_SEG_MODEL.url]);
  expect(ANIME_SEG_MODEL.url).toContain(
    '/resolve/493cb60893f47441b26ec4fb9a306bce9e342982/isnetis.onnx',
  );
  await expect(page.getByRole('button', { name: '重新下載' })).toBeVisible();
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('下載進度與取消：進度條與 MB 數增加；取消後沒有留下檔案', async ({ page }) => {
  const { errors } = await open(page, { spec: SLOW_SPEC });
  await page.getByRole('button', { name: '下載模型（約 3 MB）' }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'downloading');
  const bar = modelPanel(page).getByRole('progressbar');
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 10_000 })
    .toBeGreaterThan(10);
  await expect(page.getByTestId('model-progress-text')).toHaveText(/^\d+\.\d／3\.0 MB（\d+%）$/);
  await page.getByRole('button', { name: '取消下載' }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'error');
  await expect(modelPanel(page)).toContainText('已取消下載。');
  await expect(page.getByRole('button', { name: '下載模型（約 3 MB）' })).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await (await caches.open('trpg-toolkit:models')).keys()).length,
    ),
  ).toBe(0);
  /* 再下載一次：完整下載、驗證、存好 */
  await page.getByRole('button', { name: '下載模型（約 3 MB）' }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('SHA-256 不符：丟棄並說明，沒有存進瀏覽器', async ({ page }) => {
  const { errors } = await open(page, { spec: FAKE_SPEC, corrupt: true });
  await page.getByRole('button', { name: /^下載模型/ }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'error');
  await expect(modelPanel(page).getByRole('alert')).toHaveText(
    '下載的檔案與官方版本不符（SHA-256 不同），已丟棄。請再試一次。',
  );
  expect(
    await page.evaluate(
      async () => (await (await caches.open('trpg-toolkit:models')).keys()).length,
    ),
  ).toBe(0);
  await page.reload();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'missing');
  expect(errors).toEqual([]);
});

test('存進 Cache Storage 後重新整理不再下載；刪除已下載的模型', async ({ page }) => {
  const { errors, modelRequests } = await open(page, { spec: FAKE_SPEC });
  await downloadModel(page);
  expect(modelRequests).toEqual([FAKE_SPEC.url]);
  const keys = await page.evaluate(async () =>
    (await (await caches.open('trpg-toolkit:models')).keys()).map((r) => r.url),
  );
  expect(keys).toEqual([FAKE_SPEC.url]);
  await page.reload();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready');
  await expect(modelPanel(page)).toContainText('模型已下載');
  expect(modelRequests).toHaveLength(1);
  /* 刪除：先確認 */
  await page.getByRole('button', { name: '刪除已下載的模型' }).click();
  const dialog = page.getByRole('alertdialog', { name: '刪除已下載的模型？' });
  await expect(dialog).toContainText('之後要使用時需要重新下載');
  await dialog.getByRole('button', { name: '刪除' }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'missing');
  expect(
    await page.evaluate(
      async () => (await (await caches.open('trpg-toolkit:models')).keys()).length,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});

/* ---------- AI 去背 ---------- */

test('AI 去背（假模型）：放進圖自動去背，匯出的遮罩與前後處理＋模型的算式相同', async ({
  page,
}) => {
  const { errors } = await open(page, { spec: FAKE_SPEC });
  const png = await squarePng();
  /* 沒有模型時：提示先下載 */
  await fileInput(page).setInputFiles({ name: '方塊.png', mimeType: 'image/png', buffer: png });
  await expect(canvas(page)).toHaveAttribute('data-phase', 'needs-ai');
  await expect(page.getByTestId('stage-overlay')).toHaveText(
    '先在「AI 模型」下載模型，或改用「純色背景」。',
  );
  await expect(page.getByRole('button', { name: 'AI 去背這張' })).toBeDisabled();
  /* 下載模型後按「AI 去背這張」 */
  await downloadModel(page);
  await page.getByRole('button', { name: 'AI 去背這張' }).click();
  await expect(status(page)).toHaveText('已完成 AI 去背。', { timeout: 60_000 });
  await expectReady(page);
  await expect(page.getByTestId('backend-in-use')).toHaveText('目前使用：CPU（WebAssembly）');
  await expect(items(page).first()).toContainText('已去背');
  /* 已經去背：按鈕變成「重新 AI 去背」 */
  await expect(page.getByRole('button', { name: 'AI 去背這張' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重新 AI 去背' })).toBeEnabled();
  /* 遮罩 */
  await setExport(page, '遮罩');
  const maskPng = await exportOne(page, 'PNG');
  const got = decodePng(maskPng);
  const want = expectedFakeMask(png);
  expect([got.width, got.height]).toEqual([want.width, want.height]);
  let same = 0;
  let maxDiff = 0;
  for (let i = 0; i < want.mask.length; i++) {
    const d = Math.abs(got.rgba[i * 4] - want.mask[i]);
    if (!d) same++;
    maxDiff = Math.max(maxDiff, d);
  }
  expect(maxDiff).toBeLessThanOrEqual(1);
  expect(same / want.mask.length).toBeGreaterThan(0.99);
  /* 去背圖：透明度＝遮罩、RGB 原樣 */
  await setExport(page, '去背圖');
  const cut = decodePng(await exportOne(page));
  const k = (20 * 64 + 30) * 4;
  expect(Array.from(cut.rgba.slice(k, k + 4))).toEqual([0, 0, 0, want.mask[20 * 64 + 30]]);
  expect(cut.rgba[3]).toBe(want.mask[0]);
  /* 重新 AI 去背：再推論一次，結果相同 */
  await watchAiProgress(page);
  await page.getByRole('button', { name: '重新 AI 去背' }).click();
  await aiProgressSeen(page);
  await expect(status(page)).toHaveText('已完成 AI 去背。');
  await expectReady(page);
  await setExport(page, '遮罩');
  expect(decodePng(await exportOne(page)).rgba).toEqual(got.rgba);
  await setExport(page, '去背圖');
  /* 再放一張新圖：模型已下載時自動去背 */
  await fileInput(page).setInputFiles({
    name: '第二張.png',
    mimeType: 'image/png',
    buffer: await squarePng(40, 30),
  });
  await expect(status(page)).toHaveText('已完成 AI 去背。', { timeout: 60_000 });
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(1)).toContainText('已去背');
  expect(errors).toEqual([]);
});

test('AI 去背：重新整理後遮罩還在（不再推論）；全部 AI 去背；匯出前會檢查還沒去背的圖', async ({
  page,
}) => {
  const { errors } = await open(page, { spec: FAKE_SPEC });
  await useColorMode(page);
  await loadDemo(page);
  await page.getByRole('radio', { name: 'AI 去背' }).click();
  await expect(canvas(page)).toHaveAttribute('data-phase', 'needs-ai');
  /* 還沒 AI 去背就匯出：說明哪幾張還沒 */
  await setExport(page, '全部（2 張）');
  await exportArea(page)
    .getByRole('button', { name: /^匯出 / })
    .click();
  await expect(exportArea(page).getByRole('alert')).toHaveText(
    '匯出失敗：這些圖還沒 AI 去背：範例_白底.png、範例_綠底.png',
  );
  await downloadModel(page);
  await page.getByRole('button', { name: '全部 AI 去背（2 張）' }).click();
  await expect(status(page)).toHaveText('已完成 2 張的 AI 去背。', { timeout: 60_000 });
  await expectReady(page);
  await page.reload();
  await expectReady(page);
  await expect(items(page).nth(0)).toContainText('已去背');
  await expect(items(page).nth(1)).toContainText('已去背');
  await expect(page.getByRole('button', { name: '全部 AI 去背（0 張）' })).toBeDisabled();
  expect(errors).toEqual([]);
});

/** 選運算方式（設定欄的「運算方式」） */
async function chooseBackend(page: Page, label: '自動' | 'GPU（WebGPU）' | 'CPU') {
  await page.getByRole('combobox', { name: '運算方式' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

interface RealCompare {
  /** 期望實際使用的運算方式（「目前使用：…」） */
  backendText: string;
  /** 8 位元遮罩相同的比例下限、最大差上限 */
  minSame: number;
  maxDiff: number;
  /** 白底圖的最大差上限 */
  maxWhiteDiff: number;
  /** 匯出的遮罩與白底圖寫到 REAL_OUT 的這個子資料夾 */
  outName: string;
  backend?: 'GPU（WebGPU）' | 'CPU';
  /** 只比這幾張（預設參考資料夾裡的全部） */
  only?: readonly string[];
  /** 等 AI 去背全部完成的上限（毫秒） */
  aiTimeout?: number;
}

/**
 * 真模型：把參考資料夾的圖全部 AI 去背，匯出遮罩與白底圖，和 Python 參考做法（get_mask＋app.py 的白底）逐像素比對。
 * 回傳每張的結果（寫進測試的註記）。
 */
async function compareWithReference(page: Page, o: RealCompare) {
  const { errors } = await open(page);
  if (o.backend) await chooseBackend(page, o.backend);
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'missing');
  await downloadModel(page);
  const names = readdirSync(`${REAL_REF}/ref`)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .filter((n) => !o.only || o.only.includes(n))
    .sort();
  const t0 = Date.now();
  await fileInput(page).setInputFiles(
    names.map((n) => ({
      name: `${n}.png`,
      mimeType: 'image/png',
      buffer: readFileSync(`${REAL_REF}/images/${n}.png`),
    })),
  );
  await expect(status(page)).toHaveText(
    names.length > 1 ? `已完成 ${names.length} 張的 AI 去背。` : '已完成 AI 去背。',
    { timeout: o.aiTimeout ?? 800_000 },
  );
  const seconds = (Date.now() - t0) / 1000;
  await expect(page.getByTestId('backend-in-use')).toHaveText(o.backendText);
  await setExport(page, `全部（${names.length} 張）`);
  const zipOf = async () => {
    const area = exportArea(page);
    await area.getByRole('button', { name: /^匯出 / }).click();
    await expect(area.getByTestId('export-batch')).toBeVisible({ timeout: 120_000 });
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      area.getByRole('button', { name: '打包成 ZIP' }).click(),
    ]);
    return unzipSync(readFileSync((await dl.path()) as string));
  };
  await setExport(page, '遮罩');
  const masks = await zipOf();
  await setExport(page, '去背圖');
  await setExport(page, '白色');
  const whites = await zipOf();
  const rows: string[] = [
    `${o.backendText}：${names.length} 張共 ${seconds.toFixed(1)} 秒（含載入模型），平均每張 ${(seconds / names.length).toFixed(1)} 秒`,
  ];
  for (const n of names) {
    const got = decodePng(masks[`${n}_遮罩.png`]);
    const ref = decodePng(readFileSync(`${REAL_REF}/ref/${n}.alpha.png`));
    expect([got.width, got.height]).toEqual([ref.width, ref.height]);
    let same = 0;
    let max = 0;
    let sum = 0;
    const px = got.width * got.height;
    for (let i = 0; i < px; i++) {
      /* 參考的 alpha PNG 是灰階，decodePng 展開成 RGBA */
      const d = Math.abs(got.rgba[i * 4] - ref.rgba[i * 4]);
      if (!d) same++;
      sum += d;
      max = Math.max(max, d);
    }
    const white = decodePng(whites[`${n}_去背.png`]);
    const refWhite = decodePng(readFileSync(`${REAL_REF}/ref/${n}.white.png`));
    let wSame = 0;
    let wMax = 0;
    for (let i = 0; i < px * 4; i++) {
      if (i % 4 === 3) continue;
      const d = Math.abs(white.rgba[i] - refWhite.rgba[i]);
      if (!d) wSame++;
      wMax = Math.max(wMax, d);
    }
    rows.push(
      `${n}\t遮罩相同 ${((same / px) * 100).toFixed(3)}%（平均差 ${(sum / px).toFixed(5)}、最大差 ${max}）\t白底相同 ${((wSame / (px * 3)) * 100).toFixed(3)}%（最大差 ${wMax}）`,
    );
    if (REAL_OUT) {
      const dir = `${REAL_OUT}/${o.outName}`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/${n}.alpha.png`, masks[`${n}_遮罩.png`]);
      writeFileSync(`${dir}/${n}.white.png`, whites[`${n}_去背.png`]);
    }
    expect.soft(same / px, n).toBeGreaterThanOrEqual(o.minSame);
    expect.soft(max, n).toBeLessThanOrEqual(o.maxDiff);
    expect.soft(wMax, n).toBeLessThanOrEqual(o.maxWhiteDiff);
  }
  test.info().annotations.push({ type: '真模型比對', description: rows.join('\n') });
  console.log(rows.join('\n'));
  expect(errors).toEqual([]);
}

test('真模型（CPU）：匯出的遮罩與白底圖和 Python 參考做法（get_mask）比對', async ({ page }) => {
  test.skip(!REAL_MODEL || !REAL_REF, '設定 BG_REMOVER_MODEL 與 BG_REMOVER_REF 才跑');
  test.setTimeout(900_000);
  /* 無頭瀏覽器沒有 WebGPU：「自動」用 CPU */
  await compareWithReference(page, {
    backendText: '目前使用：CPU（WebAssembly）',
    minSame: 0.999,
    maxDiff: 1,
    maxWhiteDiff: 2,
    outName: 'wasm',
  });
});

/*
 * WebGPU：Chromium 加上 --enable-unsafe-webgpu 時，沒有顯示卡的環境也有 SwiftShader（CPU 模擬的 Vulkan）的 WebGPU，
 * 走的是同一條 WebGPU 推論路徑（速度不代表真的顯示卡）。拿不到 adapter 的環境跳過。
 * 啟動參數不同的瀏覽器要另外開（test.use 的 launchOptions 不能放在 describe 裡）。
 */
const gpuTest = test.extend<{ gpuPage: Page }>({
  gpuPage: async (
    {
      playwright,
      launchOptions,
      baseURL,
      viewport,
      locale,
      timezoneId,
      colorScheme,
      contextOptions,
    },
    use,
  ) => {
    const browser = await playwright.chromium.launch({
      ...launchOptions,
      args: [...(launchOptions.args ?? []), '--enable-unsafe-webgpu'],
    });
    const context = await browser.newContext({
      ...contextOptions,
      baseURL,
      viewport,
      locale,
      timezoneId,
      colorScheme,
      acceptDownloads: true,
    });
    await use(await context.newPage());
    await browser.close();
  },
});

async function needsWebGpu(page: Page) {
  /* navigator.gpu 只在安全環境（https、localhost）出現：先開本站的頁面 */
  await page.goto('/next/_gallery/');
  const ok = await page.evaluate(async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter().catch(() => null)));
  });
  test.skip(!ok, '這個瀏覽器拿不到 WebGPU adapter');
}

gpuTest(
  'WebGPU（SwiftShader）假模型：選「GPU（WebGPU）」跑完整流程，遮罩與前後處理＋模型的算式相同',
  async ({ gpuPage: page }) => {
    await needsWebGpu(page);
    const { errors } = await open(page, { spec: FAKE_SPEC });
    await chooseBackend(page, 'GPU（WebGPU）');
    await downloadModel(page);
    const png = await squarePng();
    await fileInput(page).setInputFiles({ name: '方塊.png', mimeType: 'image/png', buffer: png });
    await expect(status(page)).toHaveText('已完成 AI 去背。', { timeout: 60_000 });
    await expectReady(page);
    await expect(page.getByTestId('backend-in-use')).toHaveText('目前使用：GPU（WebGPU）');
    await setExport(page, '遮罩');
    const got = decodePng(await exportOne(page, 'PNG'));
    const want = expectedFakeMask(png);
    let maxDiff = 0;
    for (let i = 0; i < want.mask.length; i++)
      maxDiff = Math.max(maxDiff, Math.abs(got.rgba[i * 4] - want.mask[i]));
    expect(maxDiff).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  },
);

gpuTest(
  '真模型（WebGPU／SwiftShader）：匯出的遮罩與白底圖和 Python 參考做法比對',
  async ({ gpuPage: page }) => {
    test.skip(!REAL_MODEL || !REAL_REF, '設定 BG_REMOVER_MODEL 與 BG_REMOVER_REF 才跑');
    test.setTimeout(3_600_000);
    await needsWebGpu(page);
    /* SwiftShader 是 CPU 模擬的顯示卡，一張要好幾分鐘（4 核心的容器約 7～8 分鐘）：只比三張 */
    await compareWithReference(page, {
      only: ['banner-white', 'banner-wide', 'banner-half'],
      aiTimeout: 3_300_000,
      backend: 'GPU（WebGPU）',
      backendText: '目前使用：GPU（WebGPU）',
      minSame: 0.999,
      maxDiff: 2,
      maxWhiteDiff: 3,
      outName: 'webgpu',
    });
  },
);

/* ---------- 純色去背 ---------- */

test('純色去背：自動偵測白底；只去掉和邊緣相連的背景（白領子、眼睛亮點留著）；關掉時同色的都去掉', async ({
  page,
}) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await expect(page.getByText('依背景色與容許度去掉白底、單色底，不需要下載模型。')).toBeVisible();
  await loadDemo(page);
  await expect(page.getByTestId('key-detected')).toHaveText(
    '偵測到：#ffffff（四邊有 100% 是這個顏色）',
  );
  const cut = await exportOne(page, 'PNG');
  expect(pngPixel(cut, 0, 0)).toEqual([0, 0, 0, 0]);
  /* 白領子與眼睛的亮點：和背景同色但沒有相連 → 留著 */
  expect(pngPixel(cut, 210, 280)).toEqual([255, 255, 255, 255]);
  expect(pngPixel(cut, 206, 204)).toEqual([255, 255, 255, 255]);
  /* 洋裝 */
  expect(pngPixel(cut, 240, 400)[3]).toBe(255);
  await page.getByRole('switch', { name: '只去掉和圖邊相連的背景' }).click();
  await expectReady(page);
  const all = await exportOne(page);
  expect(pngPixel(all, 210, 280)[3]).toBe(0);
  expect(pngPixel(all, 240, 400)[3]).toBe(255);
  /* 第二張（綠底）：偵測到綠色 */
  await page.getByRole('button', { name: '下一張' }).click();
  await expectReady(page);
  await expect(page.getByTestId('key-detected')).toContainText('#a9dcbb');
  expect(errors).toEqual([]);
});

test('純色去背：從圖上取色（改成指定顏色）、Esc 取消；容許度與柔邊', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  await page.getByRole('button', { name: '從圖上取色' }).click();
  await expect(page.getByTestId('brush-layer')).toHaveAttribute('data-tool', 'pick');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('brush-layer')).not.toHaveAttribute('data-tool', 'pick');
  /* 取洋裝的顏色：洋裝變成背景 */
  await page.getByRole('button', { name: '從圖上取色' }).click();
  const p = await toScreen(page, 200, 400);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole('radio', { name: '指定顏色' })).toBeChecked();
  await expectReady(page);
  await page.getByRole('switch', { name: '只去掉和圖邊相連的背景' }).click();
  await expectReady(page);
  const cut = await exportOne(page, 'PNG');
  expect(pngPixel(cut, 200, 400)[3]).toBe(0);
  expect(pngPixel(cut, 0, 0)[3]).toBe(255);
  /* 容許度 0、柔邊 0：只有完全相同的顏色才去掉 */
  const tol = page.getByRole('spinbutton', { name: '容許度' });
  await tol.fill('0');
  await tol.press('Enter');
  const soft = page.getByRole('spinbutton', { name: '柔邊' });
  await soft.fill('0');
  await soft.press('Enter');
  await expectReady(page);
  expect(errors).toEqual([]);
});

/* ---------- 筆刷、復原 ---------- */

test('筆刷：擦掉與補回、筆刷大小快捷鍵、復原／重做', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  await expect(strokeCount(page)).toHaveText('這張還沒有筆刷');
  /* 匯出遮罩（先選好，之後的復原／重做只有筆刷） */
  await setExport(page, '遮罩');
  await setExport(page, 'PNG');
  await blur(page);
  /* E：擦掉；[ ]：筆刷大小 */
  await page.keyboard.press('e');
  await expect(page.getByRole('radio', { name: '擦掉', exact: true })).toBeChecked();
  const size = page.getByRole('spinbutton', { name: '筆刷大小' });
  await expect(size).toHaveValue('40');
  await page.keyboard.press(']');
  await expect(size).toHaveValue('50');
  await page.keyboard.press('[');
  await expect(size).toHaveValue('40');
  await drag(page, [180, 400], [300, 400]);
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  let mask = await exportOne(page);
  expect(pngPixel(mask, 240, 400)[0]).toBe(0);
  expect(pngPixel(mask, 240, 320)[0]).toBe(255);
  /* R：補回背景的一塊 */
  await blur(page);
  await page.keyboard.press('r');
  await expect(page.getByRole('radio', { name: '補回', exact: true })).toBeChecked();
  await drag(page, [30, 30], [60, 30]);
  await expect(strokeCount(page)).toHaveText('這張有 2 筆');
  mask = await exportOne(page);
  expect(pngPixel(mask, 45, 30)[0]).toBe(255);
  /* 復原兩次、重做一次 */
  await page.keyboard.press('Control+z');
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  await page.keyboard.press('Control+z');
  await expect(strokeCount(page)).toHaveText('這張還沒有筆刷');
  await expectReady(page);
  mask = await exportOne(page);
  expect(pngPixel(mask, 240, 400)[0]).toBe(255);
  await page.keyboard.press('Control+Shift+z');
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  mask = await exportOne(page);
  expect(pngPixel(mask, 240, 400)[0]).toBe(0);
  /* 清除這張的筆刷（可以復原） */
  await page.getByRole('button', { name: '清除這張的筆刷' }).click();
  await expect(strokeCount(page)).toHaveText('這張還沒有筆刷');
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  /* V：回到移動畫面（拖曳不會畫） */
  await blur(page);
  await page.keyboard.press('v');
  await drag(page, [100, 100], [150, 150]);
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  expect(errors).toEqual([]);
});

/* ---------- 同色擦掉／補回（F61） ---------- */

/**
 * 200 × 160 白底，中間 80 × 80 的紅方塊（60～139, 40～119），紅方塊裡兩塊 20 × 20 的白（領子 80～99, 60～79；
 * 亮點 110～129, 90～109，都沒有和外面的白底相連）。純色模式（只去掉相連的背景）時：白底去掉，紅與兩塊白留著。
 */
async function collarPng(): Promise<Buffer> {
  const w = 200;
  const h = 160;
  const px = new Uint8Array(w * h * 4).fill(255);
  const fill = (x0: number, y0: number, x1: number, y1: number, rgb: number[]) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) px.set([...rgb, 255], (y * w + x) * 4);
  };
  fill(60, 40, 140, 120, [200, 40, 40]);
  fill(80, 60, 100, 80, [255, 255, 255]);
  fill(110, 90, 130, 110, [255, 255, 255]);
  return Buffer.from(await encodePng(px, w, h));
}

/** 預覽畫布（遮罩檢視）在圖片座標 (x, y) 的值 */
async function previewMaskAt(page: Page, x: number, y: number) {
  await blur(page);
  await page.keyboard.press('3');
  await expectPainted(page, 'mask');
  const v = await canvas(page).evaluate(
    (c: HTMLCanvasElement, [px, py]) => c.getContext('2d')!.getImageData(px, py, 1, 1).data[0],
    [x, y],
  );
  await page.keyboard.press('1');
  return v;
}

async function hoverAt(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
}

async function clickAt(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}

const fillPreview = (page: Page) => page.getByTestId('fill-preview');
const fillCount = (page: Page) => page.getByTestId('fill-count');

test('F61 同色擦掉／補回：游標停著顯示範圍與像素數，點一下套用；相連／整張；復原、重新整理後還在，匯出和預覽相同', async ({
  page,
}) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await fileInput(page).setInputFiles({
    name: '領子.png',
    mimeType: 'image/png',
    buffer: await collarPng(),
  });
  await expect(status(page)).toHaveText('已加入 1 張圖片。');
  await expectReady(page);
  await canvas(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await setExport(page, '遮罩');
  await setExport(page, 'PNG');
  await blur(page);
  /* Shift＋E：同色擦掉；筆刷大小、硬度換成容許度與「只選相連的」 */
  await page.keyboard.press('Shift+E');
  await expect(page.getByRole('radio', { name: '同色擦掉' })).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: '筆刷大小' })).toHaveCount(0);
  /* 純色背景的容許度＋同色工具的容許度 */
  await expect(page.getByRole('spinbutton', { name: '容許度' })).toHaveCount(2);
  await expect(page.getByRole('spinbutton', { name: '容許度' }).nth(1)).toHaveValue('12');
  await expect(page.getByRole('switch', { name: '只選相連的' })).toBeChecked();
  /* 停在領子上：只選領子（不經過已經去掉的白底，不連到亮點） */
  await hoverAt(page, 90, 70);
  await expect(fillCount(page)).toHaveText('會擦掉 400 個像素');
  await expect(fillPreview(page)).toHaveAttribute('data-count', '400');
  const box = await fillPreview(page).evaluate((el: HTMLElement) => [
    el.style.left,
    el.style.top,
    el.style.width,
    el.style.height,
  ]);
  expect(box).toEqual(['80px', '60px', '20px', '20px']);
  /* 停在已經去掉的白底上：沒有可以擦掉的 */
  await hoverAt(page, 10, 10);
  await expect(fillCount(page)).toHaveText('這裡沒有可以擦掉的');
  await expect(fillPreview(page)).toHaveCount(0);
  /* 移出預覽：範圍與文字消失 */
  await page.mouse.move(5, 5);
  await expect(fillCount(page)).toHaveCount(0);
  /* 點領子：擦掉（一步） */
  await clickAt(page, 90, 70);
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  await expectReady(page);
  expect(await previewMaskAt(page, 90, 70)).toBe(0);
  expect(await previewMaskAt(page, 120, 100)).toBe(255);
  /* 關掉「只選相連的」：停在紅色上，整張看得到的紅都選（80 × 80 − 兩塊白 = 5,600） */
  await page.getByRole('switch', { name: '只選相連的' }).click();
  await hoverAt(page, 70, 50);
  await expect(fillCount(page)).toHaveText('會擦掉 5,600 個像素');
  /* 停在亮點：整張看得到的白（只剩亮點；領子已經擦掉、白底已經去掉） */
  await hoverAt(page, 120, 100);
  await expect(fillCount(page)).toHaveText('會擦掉 400 個像素');
  await clickAt(page, 120, 100);
  await expect(strokeCount(page)).toHaveText('這張有 2 筆');
  await expectReady(page);
  expect(await previewMaskAt(page, 120, 100)).toBe(0);
  /* 復原一步：亮點回來 */
  await page.keyboard.press('Control+z');
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  await expectReady(page);
  expect(await previewMaskAt(page, 120, 100)).toBe(255);
  /* Shift＋R：同色補回；停在白底（相連）：選得到被去掉的白底，領子（被去掉但被紅包住）不選 */
  await blur(page);
  await page.keyboard.press('Shift+R');
  await expect(page.getByRole('radio', { name: '同色補回' })).toBeChecked();
  await page.getByRole('switch', { name: '只選相連的' }).click();
  await expect(page.getByRole('switch', { name: '只選相連的' })).toBeChecked();
  await hoverAt(page, 10, 10);
  await expect(fillCount(page)).toHaveText('會補回 25,600 個像素');
  /* 停在看得到的紅：沒有可以補回的 */
  await hoverAt(page, 70, 50);
  await expect(fillCount(page)).toHaveText('這裡沒有可以補回的');
  /* 點領子補回 */
  await clickAt(page, 90, 70);
  await expect(strokeCount(page)).toHaveText('這張有 2 筆');
  await expectReady(page);
  expect(await previewMaskAt(page, 90, 70)).toBe(255);
  expect(await previewMaskAt(page, 10, 10)).toBe(0);
  /* 匯出的遮罩和預覽相同 */
  const before = await exportOne(page);
  for (const [x, y, v] of [
    [90, 70, 255],
    [120, 100, 255],
    [70, 50, 255],
    [10, 10, 0],
  ] as const)
    expect(pngPixel(before, x, y)[0], `${x},${y}`).toBe(v);
  /* 重新整理後還在（兩步：同色擦掉領子、同色補回領子） */
  await page.reload();
  await expectReady(page);
  await expect(strokeCount(page)).toHaveText('這張有 2 筆');
  await expect(page.getByRole('radio', { name: '同色補回' })).toBeChecked();
  const after = await exportOne(page);
  expect(decodePng(after).rgba).toEqual(decodePng(before).rgba);
  expect(errors).toEqual([]);
});

test('F61 觸控：按住顯示範圍、拖曳換位置、放開才套用；拖到預覽外放開就取消', async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const { errors } = await open(page);
  await useColorMode(page);
  await fileInput(page).setInputFiles({
    name: '領子.png',
    mimeType: 'image/png',
    buffer: await collarPng(),
  });
  await expectReady(page);
  await page.getByRole('radio', { name: '同色擦掉' }).click();
  await canvas(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: x === undefined ? [] : [{ x, y: y as number }],
    });
  /* 按住領子：顯示範圍，還沒有套用 */
  const collar = await toScreen(page, 90, 70);
  await touch('touchStart', collar.x, collar.y);
  await expect(fillPreview(page)).toHaveAttribute('data-count', '400');
  await expect(fillCount(page)).toHaveText('會擦掉 400 個像素');
  await expect(strokeCount(page)).toHaveText('這張還沒有筆刷');
  /* 拖到亮點：範圍跟著換 */
  const spot = await toScreen(page, 120, 100);
  for (let i = 1; i <= 5; i++)
    await touch(
      'touchMove',
      collar.x + ((spot.x - collar.x) * i) / 5,
      collar.y + ((spot.y - collar.y) * i) / 5,
    );
  await expect(fillPreview(page)).toHaveCSS('left', '110px');
  /* 放開：擦掉亮點，範圍消失 */
  await touch('touchEnd');
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  await expect(fillPreview(page)).toHaveCount(0);
  await expectReady(page);
  expect(await previewMaskAt(page, 120, 100)).toBe(0);
  expect(await previewMaskAt(page, 90, 70)).toBe(255);
  /* 按住領子、拖到預覽外放開：取消 */
  await touch('touchStart', collar.x, collar.y);
  await expect(fillPreview(page)).toHaveAttribute('data-count', '400');
  const stage = (await page.getByRole('region', { name: '去背預覽' }).boundingBox())!;
  await touch('touchMove', collar.x, stage.y + stage.height + 40);
  await touch('touchEnd');
  await expect(fillPreview(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  expect(await previewMaskAt(page, 90, 70)).toBe(255);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('預覽：結果／原圖／遮罩（1／2／3）；上一張／下一張（A／D）', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  await page.keyboard.press('2');
  await expect(canvas(page)).toHaveAttribute('data-view', 'original');
  await page.keyboard.press('3');
  await expect(canvas(page)).toHaveAttribute('data-view', 'mask');
  await expectPainted(page, 'mask');
  const corner = await canvas(page).evaluate((c: HTMLCanvasElement) =>
    Array.from(c.getContext('2d')!.getImageData(0, 0, 1, 1).data),
  );
  expect(corner).toEqual([0, 0, 0, 255]);
  await page.keyboard.press('1');
  await expect(canvas(page)).toHaveAttribute('data-view', 'result');
  await expect(page.getByTestId('counter')).toHaveText('1／2');
  await page.keyboard.press('d');
  await expect(page.getByTestId('counter')).toHaveText('2／2');
  await expect(page.getByTestId('file-name')).toHaveText('範例_綠底.png');
  await page.keyboard.press('a');
  await expect(page.getByTestId('counter')).toHaveText('1／2');
  expect(errors).toEqual([]);
});

/* ---------- 批次、格式 ---------- */

test('批次：全部匯出、打包成 ZIP（檔名＝原檔名＋_去背）', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  const area = exportArea(page);
  await setExport(page, '全部（2 張）');
  await area.getByRole('button', { name: '匯出 PNG' }).click();
  await expect(area.getByTestId('export-batch')).toContainText('共 2 個檔案');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    area.getByRole('button', { name: '打包成 ZIP' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('去背.zip');
  const zip = unzipSync(readFileSync((await dl.path()) as string));
  expect(Object.keys(zip).sort()).toEqual(['範例_白底_去背.png', '範例_綠底_去背.png']);
  for (const bytes of Object.values(zip)) {
    const img = decodePng(bytes);
    expect([img.width, img.height]).toEqual([480, 640]);
    expect(img.rgba[3]).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('匯出格式：PNG／WebP／JPG、白底與自訂色、裁掉透明邊、遮罩、比較圖', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  const webp = await exportOne(page, 'WebP');
  expect(webp.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(webp.subarray(8, 12).toString('latin1')).toBe('WEBP');
  /* JPG：透明時用白色 */
  await exportArea(page).getByRole('radio', { name: 'JPG', exact: true }).click();
  await expect(exportArea(page)).toContainText('JPG 沒有透明：選「透明」時用白色。');
  const jpg = await exportOne(page);
  expect(Array.from(jpg.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  const corner = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(
      new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]),
    );
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    return Array.from(g.getImageData(0, 0, 1, 1).data);
  }, jpg.toString('base64'));
  expect(corner.slice(0, 3).every((v) => v > 245)).toBe(true);
  /* 自訂色背景（PNG） */
  await setExport(page, '自訂色');
  const field = exportArea(page).getByRole('textbox', { name: '背景顏色' });
  await field.fill('#102030');
  await field.press('Enter');
  const colored = await exportOne(page, 'PNG');
  expect(pngPixel(colored, 0, 0)).toEqual([16, 32, 48, 255]);
  /* 裁掉透明邊＋留白 */
  await setExport(page, '透明');
  await exportArea(page).getByRole('switch', { name: '裁掉透明邊' }).click();
  const trimmed = decodePng(await exportOne(page));
  expect(trimmed.width).toBeLessThan(480);
  expect(trimmed.height).toBeLessThan(640);
  const pad = exportArea(page).getByRole('spinbutton', { name: '四周留白' });
  await pad.fill('10');
  await pad.press('Enter');
  const padded = decodePng(await exportOne(page));
  expect([padded.width, padded.height]).toEqual([trimmed.width + 20, trimmed.height + 20]);
  /* 遮罩：灰階不透明、原尺寸 */
  await setExport(page, '遮罩');
  const mask = decodePng(await exportOne(page));
  expect([mask.width, mask.height]).toEqual([480, 640]);
  expect(Array.from(mask.rgba.slice(0, 4))).toEqual([0, 0, 0, 255]);
  /* 比較圖：寬 3 倍（原圖｜疊在黑底｜遮罩） */
  await setExport(page, '比較圖');
  const cmp = await exportOne(page);
  const c = decodePng(cmp);
  expect([c.width, c.height]).toEqual([1440, 640]);
  expect(pngPixel(cmp, 0, 0)).toEqual([255, 255, 255, 255]);
  expect(pngPixel(cmp, 480, 0)).toEqual([0, 0, 0, 255]);
  expect(pngPixel(cmp, 960 + 240, 400)).toEqual([255, 255, 255, 255]);
  expect(errors).toEqual([]);
});

/* ---------- 保存 ---------- */

test('自動保存：重新整理後圖片、筆刷與設定還在；專案檔存了再開', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  const tol = page.getByRole('spinbutton', { name: '容許度' });
  await tol.fill('20');
  await tol.press('Enter');
  await blur(page);
  await page.keyboard.press('e');
  await drag(page, [180, 400], [300, 400]);
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  await page.reload();
  await expectReady(page);
  await expect(items(page)).toHaveCount(2);
  await expect(page.getByRole('spinbutton', { name: '容許度' })).toHaveValue('20');
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  /* 專案檔（ZIP：設定＋原圖） */
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const zipPath = (await dl.path()) as string;
  const files = Object.keys(unzipSync(readFileSync(zipPath)));
  expect(files).toContain('project.json');
  expect(files.filter((f) => f.startsWith('files/'))).toHaveLength(2);
  /* 重設 → 清單空了 → 開啟專案檔 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(items(page)).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-phase', 'empty');
  await page.getByRole('button', { name: '專案' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles(zipPath);
  const confirm = page.getByRole('alertdialog', { name: '開啟專案檔？' });
  if (await confirm.isVisible().catch(() => false))
    await confirm.getByRole('button', { name: /開啟/ }).click();
  await expect(items(page)).toHaveCount(2);
  await expectReady(page);
  await expect(strokeCount(page)).toHaveText('這張有 1 筆');
  expect(errors).toEqual([]);
});

/* ---------- 對等驗證後的修正（規格 7.1） ---------- */

/** 推論 Worker 的腳本前面加一段（模擬顯示卡建不起來、讓回覆停住）；第 n 次載入用 stubs[n]（沒有就原樣） */
async function stubOnnxWorker(page: Page, stubs: readonly (string | null)[]) {
  let n = 0;
  await page.route(/\/assets\/build\/onnx\.worker-[^/]+\.js$/, async (route) => {
    const stub = stubs[n++] ?? null;
    const res = await route.fetch();
    await route.fulfill({ response: res, body: stub ? stub + (await res.text()) : undefined });
  });
}

/** 有 WebGPU adapter，但 requestDevice() 失敗（驅動、記憶體）——只在推論 Worker 裡 */
const GPU_DEVICE_FAILS = `Object.defineProperty(WorkerNavigator.prototype, 'gpu', { configurable: true, get() {
  return { requestAdapter: async () => ({ features: new Set(), limits: {}, info: { vendor: 'stub' }, isFallbackAdapter: false,
    requestDevice: async () => { throw new DOMException('stub adapter: requestDevice failed', 'OperationError'); } }),
    getPreferredCanvasFormat: () => 'rgba8unorm', wgslLanguageFeatures: new Set() };
} });\n`;

/** 推論 Worker 不回覆某一種呼叫（模擬很慢的載入或推論）：open 的回覆有 backend、run 的回覆有 mask */
const holdReply = (field: 'backend' | 'mask') =>
  `(() => { const pm = self.postMessage.bind(self); self.postMessage = (m, t) => {
    if (m && m.value && typeof m.value === 'object' && ${JSON.stringify(field)} in m.value) return;
    return pm(m, t); }; })();\n`;

/** 大圖（寫成檔案、用路徑放進去：用 buffer 時 Playwright 自己會在頁面裡把 base64 轉成 File，本身就是長工作） */
const bigDir = mkdtempSync(join(tmpdir(), 'bg-remover-e2e-'));
const bigFiles = new Map<string, Promise<string>>();
function bigPngFile(w: number, h: number): Promise<string> {
  const key = `${w}x${h}`;
  let p = bigFiles.get(key);
  if (!p) {
    p = (async () => {
      /* 白底中間一個橢圓（顏色漸層），純色去背會去掉白底 */
      const px = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const k = (y * w + x) * 4;
          const dx = (x - w / 2) / (w * 0.3);
          const dy = (y - h / 2) / (h * 0.4);
          if (dx * dx + dy * dy < 1) {
            px[k] = (x * 7) & 255;
            px[k + 1] = (y * 5) & 127;
            px[k + 2] = ((x + y) * 3) & 255;
          } else {
            px[k] = px[k + 1] = px[k + 2] = 255;
          }
          px[k + 3] = 255;
        }
      }
      const file = join(bigDir, `big-${key}.png`);
      writeFileSync(file, await encodePng(px, w, h));
      return file;
    })();
    bigFiles.set(key, p);
  }
  return p;
}

/** 頁面裡記下狀態列、預覽中間的文字、模型下載的文字與長工作（addInitScript：重新整理後也記） */
async function recordTimeline(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __rec: { status: string[]; stage: string[]; model: string[]; long: [number, number][] };
    };
    const rec: typeof w.__rec = { status: [], stage: [], model: [], long: [] };
    w.__rec = rec;
    const push = (list: string[], v: string | null | undefined) => {
      if (v && list[list.length - 1] !== v) list.push(v);
    };
    const watch = () => {
      new MutationObserver(() => {
        push(rec.status, document.querySelector('[data-testid="status-text"]')?.textContent);
        push(rec.model, document.querySelector('[data-testid="model-progress-text"]')?.textContent);
        const c = document.querySelector('[data-testid="preview-canvas"]');
        /* 預覽欄：舞台（section）外面兩層，裡面直接放的 p 是疊在預覽中間的文字 */
        const box = c?.closest('section')?.parentElement?.parentElement;
        if (c && box) {
          const texts = Array.from(box.querySelectorAll(':scope > p')).map((p) => p.textContent);
          push(rec.stage, `${c.getAttribute('data-phase')}|${texts.join('/')}`);
        }
      }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-phase'],
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) rec.long.push([e.startTime, e.duration]);
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* 沒有 longtask 的瀏覽器 */
    }
  });
}

const timeline = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __rec: { status: string[]; stage: string[]; model: string[]; long: [number, number][] };
        }
      ).__rec,
  );

test('F05：「自動」時顯示卡建不起來（requestDevice 失敗）就改用 CPU 並說明；選「GPU」時說明失敗，不會一直等', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await stubOnnxWorker(page, [GPU_DEVICE_FAILS, GPU_DEVICE_FAILS]);
  const { errors } = await open(page, { spec: FAKE_SPEC });
  await downloadModel(page);
  await fileInput(page).setInputFiles({
    name: '方塊.png',
    mimeType: 'image/png',
    buffer: await squarePng(),
  });
  await expect(status(page)).toHaveText('已完成 AI 去背。', { timeout: 30_000 });
  await expect(page.getByTestId('backend-in-use')).toHaveText(
    '目前使用：CPU（WebAssembly）（顯示卡無法使用，已改用 CPU。）',
  );
  /* 指定 GPU：建不起來時說明（不改用 CPU） */
  await chooseBackend(page, 'GPU（WebGPU）');
  await page.getByRole('button', { name: '重新 AI 去背' }).click();
  await expect(status(page)).toHaveText(
    'AI 去背失敗：無法建立推論：這個瀏覽器可能不支援，或模型檔有問題。',
    { timeout: 30_000 },
  );
  /* F60：失敗的那張、在哪一步、瀏覽器回報的錯誤 */
  await page.getByRole('alert').getByRole('button', { name: '複製錯誤資訊' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('訊息：AI 去背失敗：無法建立推論：這個瀏覽器可能不支援，或模型檔有問題。');
  expect(text).toContain('— 方塊.png —\n尺寸：64 × 48\n步驟：AI 去背：載入模型\n運算方式：');
  expect(text).toMatch(/錯誤：\S/);
  expect(errors).toEqual([]);
});

test('F13：下載完先顯示「正在檢查檔案是否完整（SHA-256）…」再「正在存進瀏覽器…」（SHA-256 在 Worker 裡算）', async ({
  page,
}) => {
  await recordTimeline(page);
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));
  const { errors } = await open(page, { spec: SLOW_SPEC });
  await page.getByRole('button', { name: '下載模型（約 3 MB）' }).click();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  const { model } = await timeline(page);
  const verify = model.indexOf('正在檢查檔案是否完整（SHA-256）…');
  expect(verify, model.join(' → ')).toBeGreaterThan(0);
  expect(model.indexOf('正在存進瀏覽器…')).toBeGreaterThan(verify);
  expect(workers.some((u) => /hash\.worker-[^/]+\.js$/.test(u))).toBe(true);
  expect(errors).toEqual([]);
});

test('F20：存著的模型壞掉時，放進新圖自動 AI 去背會說明，下載區回到「要先下載」', async ({
  page,
}) => {
  const { errors } = await open(page, { spec: FAKE_SPEC });
  await downloadModel(page);
  /* 把 Cache Storage 裡的模型改壞一個位元組（大小與標頭不變） */
  await page.evaluate(async (url) => {
    const cache = await caches.open('trpg-toolkit:models');
    const res = (await cache.match(url)) as Response;
    const bytes = new Uint8Array(await res.arrayBuffer());
    bytes[bytes.length - 3] ^= 1;
    await cache.put(url, new Response(bytes, { headers: res.headers }));
  }, FAKE_SPEC.url);
  await page.reload();
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'ready');
  await fileInput(page).setInputFiles({
    name: '方塊.png',
    mimeType: 'image/png',
    buffer: await squarePng(),
  });
  await expect(status(page)).toHaveText(
    'AI 去背失敗：下載的檔案與官方版本不符（SHA-256 不同），已丟棄。請再試一次。',
    { timeout: 30_000 },
  );
  await expect(modelPanel(page)).toHaveAttribute('data-status', 'missing');
  await expect(page.getByRole('button', { name: 'AI 去背這張' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('F21：AI 去背中、載入模型中按「取消」都顯示「已取消 AI 去背。」，下次重開推論', async ({
  page,
}) => {
  /* 第 1 個推論 Worker：推論不回覆；第 2 個：載入模型不回覆；第 3 個：正常 */
  await stubOnnxWorker(page, [holdReply('mask'), holdReply('backend')]);
  const { errors } = await open(page, { spec: FAKE_SPEC });
  await downloadModel(page);
  const ai = page.getByTestId('ai-progress');
  await fileInput(page).setInputFiles({
    name: '一.png',
    mimeType: 'image/png',
    buffer: await squarePng(),
  });
  await expect(ai).toHaveText('AI 去背中…', { timeout: 30_000 });
  await expect(status(page)).toHaveText('已加入 1 張圖片。');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(status(page)).toHaveText('已取消 AI 去背。');
  await expect(ai).toHaveCount(0);
  /* 第二張：自動去背，停在載入模型 */
  await fileInput(page).setInputFiles({
    name: '二.png',
    mimeType: 'image/png',
    buffer: await squarePng(40, 30),
  });
  await expect(ai).toHaveText('正在載入模型…', { timeout: 30_000 });
  await expect(status(page)).toHaveText('已加入 1 張圖片。');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(status(page)).toHaveText('已取消 AI 去背。');
  /* 再按一次：重開推論，正常完成 */
  await page.getByRole('button', { name: 'AI 去背這張' }).click();
  await expect(status(page)).toHaveText('已完成 AI 去背。', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('F41：預覽背景「圖」存在素材庫，重新整理後還在', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  const px = new Uint8Array(32 * 24 * 4);
  for (let i = 0; i < px.length; i += 4) px.set([200, 40, 60, 255], i);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('radio', { name: '背景圖（只供預覽）' }).click(),
  ]);
  await chooser.setFiles({
    name: '背景.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await encodePng(px, 32, 24)),
  });
  const stage = page.getByRole('region', { name: '去背預覽' });
  await expect(stage).toHaveCSS('background-image', /^url\("blob:/);
  /* 換成黑底再換回「圖」：直接用存著的圖，不再跳出選檔視窗 */
  let choosers = 0;
  page.on('filechooser', () => {
    choosers++;
  });
  await page.getByRole('radio', { name: '黑色背景' }).click();
  await expect(stage).not.toHaveCSS('background-image', /^url\("blob:/);
  await page.getByRole('radio', { name: '背景圖（只供預覽）' }).click();
  await expect(stage).toHaveCSS('background-image', /^url\("blob:/);
  await page.waitForTimeout(300);
  expect(choosers).toBe(0);
  await page.reload();
  await expectReady(page);
  await expect(page.getByRole('radio', { name: '背景圖（只供預覽）' })).toBeChecked();
  await expect(stage).toHaveCSS('background-image', /^url\("blob:/);
  const size = await stage.evaluate(async (el) => {
    const url = /url\("(.+)"\)/.exec(getComputedStyle(el).backgroundImage)?.[1];
    if (!url) return null;
    try {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      return [bmp.width, bmp.height];
    } catch {
      return null;
    }
  });
  expect(size).toEqual([32, 24]);
  /* 全部重來：背景圖留著 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(items(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('radio', { name: '背景圖（只供預覽）' })).toBeChecked();
  await expect(stage).toHaveCSS('background-image', /^url\("blob:/);
  expect(errors).toEqual([]);
});

test('F43：清單是空的時放進第一張圖、重新整理後第一次讀圖，讀取中顯示「讀取中…」', async ({
  page,
}) => {
  const big = await bigPngFile(3000, 3000);
  await recordTimeline(page);
  const { errors } = await open(page);
  await useColorMode(page);
  await fileInput(page).setInputFiles(big);
  await expectReady(page);
  const loading = (await timeline(page)).stage.filter((s) => s.startsWith('loading|'));
  expect(loading.length).toBeGreaterThan(0);
  expect(loading).toEqual(loading.map(() => 'loading|讀取中…'));
  await page.reload();
  await expectReady(page);
  const again = (await timeline(page)).stage.filter((s) => s.startsWith('loading|'));
  expect(again.length).toBeGreaterThan(0);
  expect(again).toEqual(again.map(() => 'loading|讀取中…'));
  expect(errors).toEqual([]);
});

test('F32：去色邊也處理去背邊界旁一圈：範例圖（預設值）疊在黑底時，馬尾外圈的淺色邊變淡', async ({
  page,
}) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  const ring = (png: Buffer) => {
    /* 左邊馬尾（x 40～124、y 140～424）：外圈＝不透明度 > 0、旁邊（8 連通）有完全透明的像素；頭髮本身＝9 × 9 都不透明 */
    const img = decodePng(png);
    const { width: w, rgba } = img;
    const a = (x: number, y: number) => rgba[(y * w + x) * 4 + 3];
    const bright = (x: number, y: number) => {
      const k = (y * w + x) * 4;
      return (((rgba[k] + rgba[k + 1] + rgba[k + 2]) / 3) * rgba[k + 3]) / 255;
    };
    let rs = 0;
    let rn = 0;
    let hs = 0;
    let hn = 0;
    for (let y = 140; y < 425; y++) {
      for (let x = 40; x < 125; x++) {
        if (!a(x, y)) continue;
        let edge = false;
        let solid = true;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const v = a(x + dx, y + dy);
            if (v !== 255) solid = false;
            if (!v && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) edge = true;
          }
        }
        if (edge) {
          rs += bright(x, y);
          rn++;
        } else if (solid) {
          hs += bright(x, y);
          hn++;
        }
      }
    }
    return { ring: rs / rn, hair: hs / hn, n: rn };
  };
  const on = ring(await exportOne(page, 'PNG'));
  await page.getByRole('switch', { name: '去色邊' }).click();
  await expectReady(page);
  const off = ring(await exportOne(page));
  test.info().annotations.push({
    type: '外圈平均亮度（疊在黑底）',
    description: `去色邊開 ${on.ring.toFixed(1)}、關 ${off.ring.toFixed(1)}；頭髮本身 ${on.hair.toFixed(1)}（外圈 ${on.n} px）`,
  });
  expect(on.n).toBeGreaterThan(300);
  expect(off.ring).toBeGreaterThan(on.hair + 25);
  /* 開著時外圈接近頭髮本身的亮度 */
  expect(on.ring).toBeLessThan(on.hair + 12);
  expect(on.ring).toBeLessThan(off.ring - 25);
  expect(errors).toEqual([]);
});

test('F58：快捷鍵一覽列出「Esc 取消取色」', async ({ page }) => {
  const { errors } = await open(page);
  await blur(page);
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: '快捷鍵' });
  await expect(dialog).toBeVisible();
  const row = dialog.locator('dt', { hasText: '取消取色' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('xpath=following-sibling::dd[1]')).toHaveText('Esc');
  expect(errors).toEqual([]);
});

test('大圖：放進 4000 × 4000 與改設定時畫面不凍住（解碼、縮圖、合成在 Worker 裡）', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const big = await bigPngFile(4000, 4000);
  await recordTimeline(page);
  const { errors } = await open(page);
  await useColorMode(page);
  const longIn = async (fn: () => Promise<void>) => {
    const t0 = await page.evaluate(() => performance.now());
    await fn();
    await page.waitForTimeout(1000);
    return (await timeline(page)).long.filter(([s]) => s >= t0).map(([, d]) => Math.round(d));
  };
  /* 預覽畫好了目前的狀態；等不到也繼續（只量長工作；修正前沒有 data-painted） */
  const painted = () => expectPainted(page, 'result').catch(() => {});
  const add = await longIn(async () => {
    await fileInput(page).setInputFiles(big);
    await expect(status(page)).toHaveText('已加入 1 張圖片。', { timeout: 60_000 });
    await expectReady(page);
    await painted();
  });
  const tol = await longIn(async () => {
    const tick = await canvas(page).getAttribute('data-tick');
    const f = page.getByRole('spinbutton', { name: '容許度' });
    await f.fill('20');
    await f.press('Enter');
    await expect(canvas(page)).not.toHaveAttribute('data-tick', tick ?? '');
    await expectReady(page);
    await painted();
  });
  test.info().annotations.push({
    type: '主執行緒的長工作（毫秒）',
    description: `放進 4000 × 4000：${add.join('、') || '無'}；改容許度：${tol.join('、') || '無'}`,
  });
  expect(Math.max(0, ...add)).toBeLessThan(300);
  expect(Math.max(0, ...tol)).toBeLessThan(200);
  expect(errors).toEqual([]);
});

test('匯出：按「取消」立刻顯示「正在取消…」，停下來後「已取消匯出。」', async ({ page }) => {
  test.setTimeout(120_000);
  const big = await bigPngFile(4000, 4000);
  await recordTimeline(page);
  const { errors } = await open(page);
  await useColorMode(page);
  await fileInput(page).setInputFiles(big);
  await expect(status(page)).toHaveText('已加入 1 張圖片。', { timeout: 60_000 });
  await expectReady(page);
  const area = exportArea(page);
  await area.getByRole('button', { name: '匯出 PNG' }).click();
  await expect(area.getByRole('progressbar')).toBeVisible();
  const t0 = Date.now();
  await area.getByRole('button', { name: '取消', exact: true }).click();
  await expect(status(page)).toHaveText('已取消匯出。', { timeout: 30_000 });
  const ms = Date.now() - t0;
  const seen = (await timeline(page)).status;
  expect(seen.indexOf('正在取消…')).toBeGreaterThan(0);
  expect(seen.indexOf('已取消匯出。')).toBeGreaterThan(seen.indexOf('正在取消…'));
  await expect(area.getByRole('button', { name: '匯出 PNG' })).toBeVisible();
  await expect(area.getByTestId('export-result')).toHaveCount(0);
  test.info().annotations.push({ type: '按取消到停下來', description: `${ms} ms` });
  expect(errors).toEqual([]);
});

test('放進來的檔案裡有不是圖片的：「略過 N 個不是圖片的檔案。」', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await fileInput(page).setInputFiles([
    { name: '方塊.png', mimeType: 'image/png', buffer: await squarePng() },
    { name: '筆記.txt', mimeType: 'text/plain', buffer: Buffer.from('不是圖片') },
    { name: '假的.png', mimeType: 'image/png', buffer: Buffer.from('也不是圖片') },
  ]);
  await expect(status(page)).toHaveText('已加入 1 張圖片。 略過 2 個不是圖片的檔案。');
  await expect(items(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('讀不進來的圖：狀態列「無法讀取」旁有「複製錯誤資訊」（哪一步、瀏覽器回報的錯誤、檔案、裝置）', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors } = await open(page);
  await useColorMode(page);
  /* 檔頭是 JPEG、內容壞掉：認得是圖片，但瀏覽器解不開 */
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
  await fileInput(page).setInputFiles({ name: '壞掉.jpg', mimeType: 'image/jpeg', buffer: broken });
  await expect(status(page)).toHaveText('無法讀取：壞掉.jpg');
  const copy = page.getByRole('alert').getByRole('button', { name: '複製錯誤資訊' });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByRole('button', { name: '已複製' })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('【立繪去背工具】錯誤資訊\n訊息：無法讀取：壞掉.jpg\n處理方式：Worker');
  expect(text).toContain('— 壞掉.jpg —\n大小：404 B（404 位元組）\n類型：image/jpeg\n檔頭：jpeg');
  expect(text).toContain('步驟：解碼圖片（createImageBitmap）');
  expect(text).toMatch(/錯誤：\S+Error: \S/);
  expect(text).toContain('— 瀏覽器與裝置 —');
  expect(text).toMatch(/瀏覽器：Mozilla\/5\.0 /);
  expect(text).toMatch(/CPU 核心：\d+/);
  /* 好圖和壞圖一起放：「已加入 1 張圖片。 無法讀取：…」也可以複製 */
  await fileInput(page).setInputFiles([
    { name: '方塊.png', mimeType: 'image/png', buffer: await squarePng() },
    { name: '壞掉2.jpg', mimeType: 'image/jpeg', buffer: broken },
  ]);
  await expect(status(page)).toHaveText('已加入 1 張圖片。 無法讀取：壞掉2.jpg');
  await page.getByRole('status').getByRole('button', { name: '複製錯誤資訊' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('— 壞掉2.jpg —');
  /* 下一則訊息沒有錯誤：按鈕跟著消失 */
  await fileInput(page).setInputFiles({
    name: '方塊2.png',
    mimeType: 'image/png',
    buffer: await squarePng(50, 40),
  });
  await expect(status(page)).toHaveText('已加入 1 張圖片。');
  await expect(page.getByRole('button', { name: '複製錯誤資訊' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('選好的檔案之後就讀不到了（Android 相片挑選器的權限過期）：選的當下先讀進記憶體，照常加入', async ({
  page,
}) => {
  /*
   * 手機回報：Android 的相片挑選器給的檔案，讀取權限之後會失效；Worker 第一次用時才開（還要下載），
   * 等它去讀時已經 NotReadableError。這裡用「選好之後改掉磁碟上的檔案」重現同一個錯誤（Chrome 一樣回報
   * NotReadableError），並讓 Worker 晚 2 秒才載入。
   */
  const dir = mkdtempSync(join(tmpdir(), 'bg-remover-picked-'));
  const path = join(dir, '1000003457.png');
  writeFileSync(path, await squarePng());
  await page.route(/pixels\.worker-[^/]+\.js$/, async (r) => {
    await new Promise((ok) => setTimeout(ok, 2000));
    await r.continue();
  });
  const { errors } = await open(page);
  await useColorMode(page);
  await fileInput(page).setInputFiles(path);
  await page.waitForTimeout(300);
  /* 選好之後檔案變了（之後再讀就是 NotReadableError） */
  writeFileSync(path, Buffer.concat([await squarePng(), Buffer.alloc(16)]));
  await expect(status(page)).toHaveText('已加入 1 張圖片。', { timeout: 30_000 });
  await expect(items(page)).toHaveCount(1);
  await expectReady(page);
  expect(errors).toEqual([]);
});

test('選的當下就讀不到（NotReadableError，例如雲端相簿的照片）：說明怎麼辦，錯誤資訊寫「讀取檔案（選的當下）」', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (this: Blob) {
      if (this instanceof File && this.name === '雲端.png')
        return Promise.reject(
          new DOMException(
            'The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.',
            'NotReadableError',
          ),
        );
      return read.call(this);
    };
  });
  const { errors } = await open(page);
  await useColorMode(page);
  await fileInput(page).setInputFiles([
    { name: '雲端.png', mimeType: 'image/png', buffer: await squarePng() },
    { name: '方塊.png', mimeType: 'image/png', buffer: await squarePng(50, 40) },
  ]);
  await expect(status(page)).toHaveText(
    '已加入 1 張圖片。 無法讀取：雲端.png（瀏覽器沒有權限讀取這個檔案：請再選一次；雲端相簿的照片請先下載到手機再選。）',
  );
  await page.getByRole('status').getByRole('button', { name: '複製錯誤資訊' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('— 雲端.png —');
  expect(text).toContain(
    '步驟：讀取檔案（選的當下）\n錯誤：NotReadableError: The requested file could not be read',
  );
  expect(errors).toEqual([]);
});

test('加進來了但原圖解不成像素：預覽顯示「無法讀取」與「複製錯誤資訊」（例如手機的畫布上限）', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  /* 沒有 Worker（在主執行緒處理），OffscreenCanvas 超過 100 萬像素就拿不到 2D（模擬手機瀏覽器的畫布上限） */
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { value: undefined, configurable: true });
    const get = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (this: OffscreenCanvas, ...a: unknown[]) {
      if (this.width * this.height > 1_000_000) return null;
      return (get as (...x: unknown[]) => unknown).apply(this, a);
    } as typeof get;
  });
  const { errors } = await open(page);
  await useColorMode(page);
  const jpeg = Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1500;
      c.height = 1000;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 1500, 1000);
      g.fillStyle = '#c33';
      g.fillRect(500, 200, 500, 600);
      const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9));
      return [...new Uint8Array(await b.arrayBuffer())];
    }),
  );
  await fileInput(page).setInputFiles({ name: '大圖.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(status(page)).toHaveText('已加入 1 張圖片。');
  const box = page.getByTestId('stage-error');
  await expect(box).toContainText('無法讀取：大圖.jpg');
  await box.getByRole('button', { name: '複製錯誤資訊' }).click();
  await expect(box.getByRole('button', { name: '已複製' })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('訊息：無法讀取：大圖.jpg\n處理方式：主執行緒（Worker 不能用）');
  expect(text).toContain('— 大圖.jpg —');
  expect(text).toContain('尺寸：1500 × 1000');
  expect(text).toContain('步驟：讀取原圖的像素');
  expect(text).toContain('錯誤：Error: decode');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
}

test('視覺回歸：1280 寬', async ({ page }) => {
  const { errors } = await open(page);
  await useColorMode(page);
  await loadDemo(page);
  await settle(page);
  await expect(page).toHaveScreenshot('bg-remover-1280.png', { fullPage: true });
  expect(errors).toEqual([]);
});

test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await open(page);
  await noHorizontalScroll(page);
  await useColorMode(page);
  await loadDemo(page);
  await noHorizontalScroll(page);
  await settle(page);
  await expect(page).toHaveScreenshot('bg-remover-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
