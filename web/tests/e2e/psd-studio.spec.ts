/**
 * CCFOLIA & 圖片調色工作室（建置產物 next/psd-studio/）的端對端測試：
 * - 開頁沒有 pageerror／console error；空狀態、模式標記與統計、頁尾只放靈感來源、說明；
 * - 載入：選檔（圖片累加、同名加 _1、文字檔略過、不支援的訊息）、資料夾（相對路徑與資料夾項目）、拖放（醒目狀態）、壞檔略過；
 * - 調色：整體色相 30 匯出後逐點對照附件、負數輸入、單圖檢視器畫面＝匯出；全部重設、自訂組合、漸層預設、曲線新增與刪除；
 * - PSD：圖層由上到下、同名保留、隱藏與獨顯、點擊選取與雙擊開檢視器、匯出的分割圖層（名稱、尺寸、原始像素）；
 * - 房間 ZIP：配置檢視與面板、匯出（檔名＝SHA-256、.jpeg → .png 與 resources、JSON 改名、.token 原封不動、隱藏的保留原檔）；
 * - APNG：播放次數（整體／個別）、延遲 0 保留、檢視器的播放控制、容量壓縮試算；
 * - 畫布尺寸：補到 24 倍數（含 APNG）、縮小時確認、全部補；
 * - 自動存檔與還原（含原 ZIP）、清除作業；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { decodeApng } from '../../src/core/decode/png';
import { zipFiles } from '../../src/core/files';
import { getTool, outputDir } from '../../src/registry';
import {
  ballApng,
  loop0Apng,
  measurePng,
  roomZip,
  sha,
  solidPng,
  testPsd,
} from '../helpers/psdStudio';

const URL = `/${outputDir(getTool('psd-studio') ?? { id: 'psd-studio', status: 'next' })}/`;

const file = (name: string, data: Uint8Array, mimeType = 'image/png') => ({
  name,
  mimeType,
  buffer: Buffer.from(data),
});

async function open(page: Page, { fresh = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(
    page.getByRole('heading', { level: 1, name: 'CCFOLIA & 圖片調色工作室' }),
  ).toBeVisible();
  if (fresh) await expect(page.getByTestId('empty-drop')).toBeVisible();
  return errors;
}

const settingsPane = (page: Page) => page.getByRole('complementary', { name: '設定' });
const fileInput = (page: Page) => page.getByTestId('file-input');
const tiles = (page: Page) => page.getByTestId('asset-tile');
const rows = (page: Page) => page.getByTestId('layer-row');
const modeBadge = (page: Page) => page.getByTestId('mode-badge');
const toastText = (page: Page, text: string | RegExp) => page.getByText(text).first();
const viewer = (page: Page) => page.getByRole('dialog');
const btn = (scope: Page | Locator, name: string | RegExp) =>
  scope.getByRole('button', { name, exact: typeof name === 'string' });

async function load(page: Page, files: ReturnType<typeof file>[]) {
  await fileInput(page).setInputFiles(files);
  await expect(page.getByTestId('busy')).toHaveCount(0);
}

/** 解開 ZIP：依 ZIP 內的順序回傳名稱與內容（含資料夾項目） */
function readZip(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const order: string[] = [];
  const files = unzipSync(bytes, {
    filter: (f) => {
      order.push(f.name);
      return true;
    },
  });
  return order.map((name) => ({ name, data: files[name] }));
}

async function download(page: Page, action: () => Promise<unknown>): Promise<Download> {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  return dl;
}

const bytesOf = async (dl: Download) => new Uint8Array(readFileSync((await dl.path()) as string));

async function exportZip(page: Page) {
  const dl = await download(page, () => page.getByTestId('export').click());
  return { name: dl.suggestedFilename(), entries: readZip(await bytesOf(dl)) };
}

const decode = (b: Uint8Array) => decodeApng(b, { minDelayMs: 0, defaultDelayMs: 0 });

/** 設定欄的數字欄（例：色相） */
const tone = (page: Page, name: string) =>
  settingsPane(page).getByRole('spinbutton', { name, exact: true });

async function setNumber(input: Locator, value: string) {
  await input.fill(value);
  await input.press('Enter');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 瀏覽器做的 JPEG（單色） */
async function jpeg(page: Page, w: number, h: number, color: string): Promise<Uint8Array> {
  const b64 = await page.evaluate(
    async ([w, h, color]) => {
      const c = new OffscreenCanvas(Number(w), Number(h));
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = String(color);
      ctx.fillRect(0, 0, Number(w), Number(h));
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const x of u8) s += String.fromCharCode(x);
      return btoa(s);
    },
    [w, h, color] as const,
  );
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** 附件的取樣點（量測圖） */
const SAMPLE_POINTS = {
  灰階: [...Array.from({ length: 16 }, (_, k) => k * 16), 255].map((x) => [x, 4]),
  色塊: Array.from({ length: 9 }, (_, k) => [14 + 28 * k, 12]),
  透明度: Array.from({ length: 4 }, (_, k) => [32 + 64 * k, 20]),
  純色: Array.from({ length: 8 }, (_, k) => [16 + 32 * k, 28]),
} as const;
type Samples = Record<keyof typeof SAMPLE_POINTS, Record<string, string>>;
const EX: unknown = JSON.parse(
  readFileSync(
    new globalThis.URL('../../../docs/refactor/specs/psd-studio.examples.json', import.meta.url),
    'utf8',
  ),
);
const HUE30 = (EX as unknown as { 調色: { 整體: Record<string, Samples> } }).調色.整體['色相 30'];

function expectMatchesExample(rgba: Uint8ClampedArray, want: Samples) {
  for (const part of Object.keys(SAMPLE_POINTS) as (keyof typeof SAMPLE_POINTS)[]) {
    Object.values(want[part]).forEach((v, i) => {
      const [x, y] = SAMPLE_POINTS[part][i];
      const o = (y * 256 + x) * 4;
      const m = v.split(',');
      const a = m[3]?.startsWith('a') ? Number(m[3].slice(1)) : 255;
      expect(rgba[o + 3], `${part}#${i} 不透明度`).toBe(a);
      if (a === 0) return;
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(rgba[o + c] - Number(m[c])), `${part}#${i}：${v}`).toBeLessThanOrEqual(
          a === 255 ? 2 : 3,
        );
      }
    });
  }
}

test.use({
  contextOptions: { reducedMotion: 'reduce' },
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});

test('開頁：空狀態、模式與統計、頁尾只放靈感來源、說明', async ({ page }) => {
  const errors = await open(page);
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'idle');
  await expect(modeBadge(page)).toContainText('等待');
  await expect(page.getByTestId('stats')).toHaveText('0 個素材・圖片');
  await expect(page.getByTestId('export')).toBeDisabled();
  await expect(page.getByTestId('export')).toHaveText('下載成品（ZIP）');
  await expect(page.getByTestId('no-selection')).toBeVisible();
  /* F03：點載入區的空白處也開選檔視窗（可多選；接受圖片、ZIP、PSD） */
  const zone = page.getByTestId('empty-drop');
  const box = (await zone.boundingBox())!;
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.mouse.click(box.x + 10, box.y + 10),
  ]);
  expect(chooser.isMultiple()).toBe(true);
  expect(await chooser.element().getAttribute('accept')).toBe('image/*,.zip,.psd');
  /* 頁尾：只有靈感來源，沒有原作者的條款 */
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link')).toHaveCount(1);
  await expect(
    footer.getByRole('link', { name: 'fyam-hamu/F_Ccfolia-PSD-Studio' }),
  ).toHaveAttribute('href', 'https://github.com/fyam-hamu/F_Ccfolia-PSD-Studio');
  /* 說明（F108、F109） */
  await page.getByRole('button', { name: '說明' }).click();
  const help = page.getByRole('dialog', { name: /使用方式/ });
  await expect(help).toContainText('不會上傳');
  await expect(help).toContainText('低解析度');
  await expect(help).toContainText('Windows');
  await expect(help).toContainText('SHA-256');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  expect(errors).toEqual([]);
});

test('載入圖片：累加、同名加 _1、文字檔略過、不支援的訊息、壞檔略過；清單、搜尋、排序', async ({
  page,
}) => {
  const errors = await open(page);
  await load(page, [
    file('measure.png', await measurePng()),
    file('ball.png', await ballApng()),
    file('筆記.txt', new TextEncoder().encode('不是圖片'), 'text/plain'),
  ]);
  await expect(tiles(page)).toHaveCount(2);
  await expect(toastText(page, '加入了 2 張圖片')).toBeVisible();
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'image');
  await expect(page.getByTestId('stats')).toHaveText('2 個素材・圖片');
  await expect(page.getByRole('tab', { name: '圖片清單' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: '配置檢視' })).toBeDisabled();
  /* 選取最後一張（F07、F59～F61） */
  await expect(page.getByTestId('selected-name')).toHaveText('ball.png');
  await expect(page.getByTestId('selected-meta')).toHaveText('64 × 48 px｜APNG');
  const ball = tiles(page).nth(1);
  await expect(ball).toContainText('APNG');
  await expect(ball).toContainText('6 格');
  await expect(ball.getByTestId('tile-size')).toHaveText('64×48');
  await expect(tiles(page).first()).toContainText('靜態');
  /* 再加一張同名的：累加、名稱加 _1 */
  await load(page, [file('measure.png', await solidPng(30, 20, [1, 2, 3, 255]))]);
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(2)).toHaveAttribute('data-name', 'measure_1.png');
  /* 不支援：原內容不變 */
  await load(page, [file('a.txt', new TextEncoder().encode('x'), 'text/plain')]);
  await expect(toastText(page, '沒有可以處理的檔案')).toBeVisible();
  await expect(tiles(page)).toHaveCount(3);
  /* 壞檔略過、其餘照常載入並列出讀不到的檔名（第 5 節第 13 項） */
  await load(page, [
    file('壞掉.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])),
    file('ok.png', await solidPng(10, 10, [9, 9, 9, 255])),
  ]);
  await expect(tiles(page)).toHaveCount(4);
  await expect(toastText(page, /讀不到：壞掉\.png/)).toBeVisible();
  /* 搜尋（F18）：只影響清單 */
  await page.getByRole('searchbox', { name: '搜尋' }).fill('BALL');
  await expect(tiles(page)).toHaveCount(1);
  await page.getByRole('searchbox', { name: '搜尋' }).fill('');
  await expect(tiles(page)).toHaveCount(4);
  /* 排序（第 7 節裁定）：名稱、類型 */
  await page.getByRole('combobox', { name: '排序' }).click();
  await page.getByRole('option', { name: '名稱' }).click();
  await expect(tiles(page).first()).toHaveAttribute('data-name', 'ball.png');
  await page.getByRole('combobox', { name: '排序' }).click();
  await expect(page.getByRole('option', { name: '在房間中的角色' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('option', { name: '載入順序' }).click();
  await expect(tiles(page).first()).toHaveAttribute('data-name', 'measure.png');
  expect(errors).toEqual([]);
});

test('整體色相 30：匯出的 PNG 逐點對照附件；檢視器畫面＝匯出；負數可以打；全部重設', async ({
  page,
}) => {
  const errors = await open(page);
  await load(page, [file('measure.png', await measurePng())]);
  await setNumber(tone(page, '色相'), '30');
  await expect(tone(page, '色相')).toHaveValue('30');
  const { name, entries } = await exportZip(page);
  expect(name).toBe('measure_recolor.zip');
  expect(entries.map((e) => e.name)).toEqual(['measure.png']);
  const out = decode(entries[0].data);
  expect([out.width, out.height]).toEqual([256, 32]);
  expectMatchesExample(out.frames[0].rgba, HUE30);
  await expect(toastText(page, 'measure_recolor.zip 下載完成')).toBeVisible();
  /* 檢視器的大畫面與匯出相同（不透明的取樣點） */
  await tiles(page).first().click();
  await expect(viewer(page)).toBeVisible();
  await expect
    .poll(async () =>
      page.getByTestId('viewer-canvas').evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        return [d[(12 * 256 + 154) * 4], d[(12 * 256 + 154) * 4 + 1], d[(12 * 256 + 154) * 4 + 2]];
      }),
    )
    .toEqual([...out.frames[0].rgba.slice((12 * 256 + 154) * 4, (12 * 256 + 154) * 4 + 3)]);
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toBeHidden();
  /* 負數（第 5 節第 4 項：舊版打不出負數） */
  await tone(page, '亮度').fill('-20');
  await expect(tone(page, '亮度')).toHaveValue('-20');
  await tone(page, '亮度').press('Enter');
  /* 全部重設（F53） */
  await btn(settingsPane(page), '全部重設').click();
  await expect(tone(page, '色相')).toHaveValue('0');
  await expect(tone(page, '亮度')).toHaveValue('0');
  expect(errors).toEqual([]);
});

test('個別調色：與整體疊加、「個別調整」角標、個別重設', async ({ page }) => {
  const errors = await open(page);
  await load(page, [
    file('measure.png', await measurePng()),
    file('other.png', await measurePng()),
  ]);
  await tiles(page).first().click();
  const v = viewer(page);
  await setNumber(v.getByRole('spinbutton', { name: '色相', exact: true }), '30');
  await expect(tiles(page).first()).toContainText('個別調整');
  await expect(tiles(page).nth(1)).not.toContainText('個別調整');
  await btn(v, '回到清單').click();
  /* 只有 measure.png 轉了 30 度：與附件「色相 30」相同 */
  const { entries } = await exportZip(page);
  expectMatchesExample(
    decode(entries.find((e) => e.name === 'measure.png')!.data).frames[0].rgba,
    HUE30,
  );
  const other = decode(entries.find((e) => e.name === 'other.png')!.data).frames[0].rgba;
  expect([...other.slice((12 * 256 + 154) * 4, (12 * 256 + 154) * 4 + 3)]).toEqual([220, 40, 40]);
  /* 個別重設（F62）：角標消失 */
  await btn(page.getByTestId('selected-summary'), '個別重設').click();
  await expect(tiles(page).first()).not.toContainText('個別調整');
  expect(errors).toEqual([]);
});

test('資料夾載入：相對路徑、資料夾項目、JPG 改成 .png、ZIP 檔名用資料夾名', async ({
  page,
}, info) => {
  const errors = await open(page);
  const root = info.outputPath('角色A');
  mkdirSync(path.join(root, 'sub'), { recursive: true });
  writeFileSync(path.join(root, 'a.png'), await solidPng(20, 20, [200, 30, 30, 255]));
  writeFileSync(path.join(root, 'sub', 'a.png'), await solidPng(20, 20, [30, 200, 30, 255]));
  writeFileSync(path.join(root, 'sub', 'b.jpg'), await jpeg(page, 16, 16, '#3050a0'));
  await page.getByTestId('folder-input').setInputFiles(root);
  await expect(tiles(page)).toHaveCount(3);
  const names = await tiles(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
  expect(names.sort()).toEqual(['角色A/a.png', '角色A/sub/a.png', '角色A/sub/b.jpg']);
  const { name, entries } = await exportZip(page);
  expect(name).toBe('角色A_recolor.zip');
  expect(entries.map((e) => e.name).sort()).toEqual(
    ['角色A/', '角色A/a.png', '角色A/sub/', '角色A/sub/a.png', '角色A/sub/b.png'].sort(),
  );
  const b = entries.find((e) => e.name === '角色A/sub/b.png')!;
  expect([...b.data.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  expect(errors).toEqual([]);
});

test('只有圖片的 ZIP：圖片模式、其他檔案原封不動、之後加入的圖片放進同一個 ZIP', async ({
  page,
}) => {
  const errors = await open(page);
  const readme = new TextEncoder().encode('說明文字');
  const zip = zipFiles([
    { name: 'a.png', data: await solidPng(12, 12, [10, 20, 30, 255]) },
    { name: 'dir/', data: new Uint8Array(0) },
    { name: 'dir/b.jpg', data: await jpeg(page, 10, 10, '#808080') },
    { name: 'readme.txt', data: readme },
  ]);
  await load(page, [file('images-only.zip', zip, 'application/zip')]);
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'image');
  await expect(tiles(page)).toHaveCount(2);
  await expect(toastText(page, /以圖片模式載入 2 張/)).toBeVisible();
  await load(page, [file('circle.png', await solidPng(16, 16, [255, 255, 0, 255], 4))]);
  await expect(tiles(page)).toHaveCount(3);
  const { name, entries } = await exportZip(page);
  expect(name).toBe('images-only_recolor.zip');
  expect(entries.map((e) => e.name)).toEqual([
    'a.png',
    'dir/',
    'dir/b.png',
    'readme.txt',
    'circle.png',
  ]);
  expect([...entries[3].data]).toEqual([...readme]);
  expect(errors).toEqual([]);
});

test('PSD：由上到下、同名保留、隱藏與獨顯、點擊選取、匯出原始像素的分割圖層', async ({ page }) => {
  const errors = await open(page);
  await load(page, [file('test.psd', testPsd(), 'application/octet-stream')]);
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'psd');
  await expect(page.getByTestId('stats')).toHaveText('12 個素材・PSD 圖層');
  await expect(page.getByRole('tab', { name: '圖層配置' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('export')).toHaveText('下載分割圖層（ZIP）');
  const order = [
    '最上層',
    '有遮色片',
    '超出畫布',
    '名稱/含:特殊*字元?',
    '重複',
    '重複',
    '剪裁',
    '色彩增值',
    '半透明',
    '臉',
    '身體',
    '底色',
  ];
  await expect(rows(page)).toHaveCount(12);
  expect(await page.getByTestId('row-label').allTextContents()).toEqual(order);
  /* 點擊配置檢視：選取看得見的最上面那層（身體），不開檢視器；雙擊開檢視器 */
  const canvas = page.getByTestId('layout-canvas');
  const cb = (await canvas.boundingBox())!;
  const at = (x: number, y: number) => ({
    x: cb.x + cb.width / 2 - 160 + x,
    y: cb.y + cb.height / 2 - 120 + y,
  });
  let p = at(60, 180);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('selected-name')).toHaveText('身體');
  await expect(page.getByTestId('selected-meta')).toHaveText(
    '100 × 150 px｜PSD 圖層（位置 40, 50）',
  );
  await expect(viewer(page)).toBeHidden();
  /* 最上層（半透明）蓋在身體上：點到最上層 */
  p = at(120, 120);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('selected-name')).toHaveText('最上層');
  /* 拖曳平移不算點擊 */
  const camX = await canvas.getAttribute('data-cam-x');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 10, { steps: 4 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-cam-x', camX!);
  await expect(page.getByTestId('selected-name')).toHaveText('最上層');
  await btn(page, '回到中央').click();
  await expect(canvas).toHaveAttribute('data-cam-x', '0.0');
  p = at(60, 180);
  await page.mouse.dblclick(p.x, p.y);
  await expect(viewer(page)).toBeVisible();
  await expect(viewer(page).getByRole('heading', { name: '身體' })).toBeVisible();
  await page.keyboard.press('Escape');
  /* 隱藏「臉」、獨顯 */
  const face = rows(page).filter({ hasText: '臉' });
  await face.getByRole('button', { name: '隱藏「臉」' }).click();
  await expect(face).toHaveAttribute('data-hidden', 'true');
  const body = rows(page).filter({ hasText: '身體' });
  await body.getByRole('button', { name: '獨顯「身體」' }).click();
  await expect(rows(page).filter({ hasText: '底色' })).toHaveAttribute('data-hidden', 'true');
  await expect(body).not.toHaveAttribute('data-hidden', 'true');
  await btn(page, '解除獨顯').click();
  await expect(rows(page).filter({ hasText: '底色' })).not.toHaveAttribute('data-hidden', 'true');
  await expect(face).toHaveAttribute('data-hidden', 'true');
  /* 清單的「隱藏」角標 */
  await page.getByRole('tab', { name: '圖片清單' }).click();
  await expect(tiles(page).filter({ hasText: '臉' })).toContainText('隱藏');
  await expect(tiles(page).first()).toContainText('PSD');
  /* 匯出（F92、3.3）：看得見的圖層各一張、原始像素、各自的範圍 */
  const { name, entries } = await exportZip(page);
  expect(name).toBe('test_recolor.zip');
  expect(entries.map((e) => e.name).sort()).toEqual(
    [
      '最上層.png',
      '有遮色片.png',
      '超出畫布.png',
      '名稱_含_特殊_字元_.png',
      '重複.png',
      '重複_2.png',
      '剪裁.png',
      '色彩增值.png',
      '半透明.png',
      '身體.png',
      '底色.png',
    ].sort(),
  );
  const get = (n: string) => decode(entries.find((e) => e.name === n)!.data);
  expect([get('超出畫布.png').width, get('超出畫布.png').height]).toEqual([60, 60]);
  expect([get('底色.png').width, get('底色.png').height]).toEqual([320, 240]);
  expect([...get('半透明.png').frames[0].rgba.slice(0, 4)]).toEqual([0, 200, 0, 255]);
  const mask = get('有遮色片.png').frames[0].rgba;
  expect(mask[(10 * 40 + 35) * 4 + 3]).toBe(255);
  expect([...get('重複.png').frames[0].rgba.slice(0, 3)]).toEqual([0, 0, 0]);
  expect([...get('重複_2.png').frames[0].rgba.slice(0, 3)]).toEqual([255, 255, 255]);
  /* 沒有可用圖層的 PSD：原內容保留 */
  const { writePsdUint8Array } = await import('ag-psd');
  const empty = writePsdUint8Array({ width: 10, height: 10, children: [{ name: '空' }] });
  await load(page, [file('empty.psd', empty, 'application/octet-stream')]);
  await expect(toastText(page, 'PSD 裡沒有可以用的圖層')).toBeVisible();
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'psd');
  await load(page, [file('broken.psd', new Uint8Array([1, 2, 3, 4]), 'application/octet-stream')]);
  await expect(toastText(page, 'PSD 讀不了')).toBeVisible();
  await expect(tiles(page)).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('房間 ZIP：配置檢視、面板、雙擊開檢視器、匯出改名與房間資料同步、隱藏的保留原檔', async ({
  page,
}) => {
  const errors = await open(page);
  const room = await roomZip(await jpeg(page, 96, 72, '#284060'));
  await load(page, [file('room.zip', room.zip, 'application/zip')]);
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'room');
  await expect(page.getByTestId('stats')).toHaveText('10 個素材・房間備份');
  await expect(page.getByRole('tab', { name: 'CCFOLIA 房間' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).first()).toContainText('前景');
  await expect(rows(page).first()).toContainText('最上層');
  await expect(rows(page).nth(1)).toContainText('艾琳');
  await expect(rows(page).nth(1)).toContainText('z 7｜40×40');
  await expect(rows(page).last()).toContainText('素材｜');
  /* マーカー（-6,-4，2×2 格）：點一下選取（穿過前景的透明處）、點兩下開檢視器 */
  const canvas = page.getByTestId('layout-canvas');
  const cb = (await canvas.boundingBox())!;
  const mx = cb.x + cb.width / 2 - 5 * 50;
  const my = cb.y + cb.height / 2 - 3 * 50;
  await page.mouse.click(mx, my);
  await expect(page.getByTestId('selected-name')).toHaveText(room.names.marker);
  await page.mouse.dblclick(mx, my);
  await expect(viewer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  /* 縮放（F23、F27） */
  await btn(page, '放大').click();
  await expect(page.getByTestId('zoom-value')).toHaveText('120%');
  await canvas.hover();
  await page.mouse.wheel(0, 100);
  await expect(page.getByTestId('zoom-value')).toHaveText('102%');
  await btn(page, '回到中央').click();
  await expect(page.getByTestId('zoom-value')).toHaveText('100%');
  /* 隱藏マーカー的圖 */
  await rows(page).filter({ hasText: '標記' }).getByRole('button', { name: /^隱藏/ }).click();
  const { name, entries } = await exportZip(page);
  expect(name).toBe('room_recolor.zip');
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  expect(new TextDecoder().decode(byName.get('.token'))).toBe(room.token);
  const json = JSON.parse(new TextDecoder().decode(byName.get('__data.json')));
  expect(new TextDecoder().decode(byName.get('__data.json'))).toContain('\n  "meta": {');
  const images = entries.filter((e) => /\.(png|jpeg|jpg|gif|webp)$/.test(e.name));
  expect(images).toHaveLength(10);
  /* 新檔名＝新內容的 SHA-256；隱藏的マーカー保留原名與原內容 */
  for (const img of images) {
    if (img.name === room.names.marker) continue;
    expect(img.name).toBe(`${sha(img.data)}.png`);
  }
  expect(byName.get(room.names.marker)).toBeTruthy();
  expect(json.entities.room.markers.m1.imageUrl).toBe(room.names.marker);
  /* .jpeg → .png，resources 的 type 改正（第 7 節裁定） */
  const bg = json.entities.room.backgroundUrl as string;
  expect(bg).toMatch(/^[0-9a-f]{64}\.png$/);
  expect(byName.has(bg)).toBe(true);
  expect(json.resources[bg]).toEqual({ type: 'image/png' });
  /* 所有引用都改好、resources 與引用的圖一一對應；沒被引用的圖照樣改名但不在 resources */
  expect(json.entities.characters.c1.faces[0].iconUrl).toMatch(/^[0-9a-f]{64}\.png$/);
  expect(byName.has(json.entities.scenes.s1.backgroundUrl)).toBe(true);
  expect(byName.has(json.entities.effects.e1.imageUrl)).toBe(true);
  const keys = Object.keys(json.resources).sort();
  const referenced = images.map((e) => e.name).filter((n) => keys.includes(n));
  expect(referenced.sort()).toEqual(keys);
  expect(keys).toHaveLength(9);
  expect(JSON.stringify(json)).not.toContain(room.names.bg.slice(0, 64));
  /* APNG 仍是 6 格、播放 3 次 */
  const apng = decode(byName.get(json.entities.items.i2.imageUrl)!);
  expect(apng.frames).toHaveLength(6);
  expect(apng.loops).toBe(3);
  expect(errors).toEqual([]);
});

test('APNG：播放次數（整體／個別）、延遲 0 保留；檢視器的播放控制、對照原圖、單張下載、壓縮試算', async ({
  page,
}) => {
  const errors = await open(page);
  await load(page, [file('ball.png', await ballApng()), file('loop0.png', await loop0Apng())]);
  await settingsPane(page).getByRole('tab', { name: '匯出設定' }).click();
  await settingsPane(page).getByRole('switch', { name: '壓縮 APNG 到目標容量' }).click();
  await settingsPane(page).getByRole('combobox', { name: 'APNG 播放次數' }).click();
  await page.getByRole('option', { name: '指定次數' }).click();
  await setNumber(settingsPane(page).getByRole('spinbutton', { name: '次數' }), '5');
  /* 檢視器：ball 個別指定 7 次 */
  await tiles(page).first().click();
  const v = viewer(page);
  await expect(v.getByRole('heading', { name: 'ball.png' })).toBeVisible();
  await expect(v).toContainText('64 × 48 px（APNG）');
  await expect(v).toContainText('原檔：播放 3 次');
  await v.getByRole('combobox', { name: 'APNG 播放次數' }).click();
  await page.getByRole('option', { name: '指定次數' }).click();
  await setNumber(v.getByRole('spinbutton', { name: '次數' }), '7');
  /* 播放控制（F76～F80） */
  await expect(page.getByTestId('play-toggle')).toHaveText('暫停');
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('play-toggle')).toHaveText('播放');
  const info = page.getByTestId('frame-info');
  const first = await info.textContent();
  await v.getByRole('button', { name: '下一格' }).click();
  await expect(info).not.toHaveText(first!);
  await v.getByRole('slider', { name: '影格' }).focus();
  await page.keyboard.press('Home');
  await expect(info).toHaveText('1 / 6 格（100 ms）');
  await page.keyboard.press('ArrowRight');
  await expect(info).toHaveText('2 / 6 格（0 ms）');
  /* 對照原圖（F69）：按住時顯示原圖 */
  const compare = page.getByTestId('compare');
  await compare.hover();
  await page.mouse.down();
  await expect(page.getByTestId('viewer-canvas')).toHaveAttribute('data-original', 'true');
  await page.mouse.up();
  await expect(page.getByTestId('viewer-canvas')).not.toHaveAttribute('data-original', 'true');
  await compare.focus();
  await page.keyboard.down('Space');
  await expect(page.getByTestId('viewer-canvas')).toHaveAttribute('data-original', 'true');
  await page.keyboard.up('Space');
  await expect(page.getByTestId('viewer-canvas')).not.toHaveAttribute('data-original', 'true');
  /* 容量壓縮試算（F81）：已經在目標內 → 不減色 */
  await page.getByTestId('test-run').click();
  await expect(page.getByTestId('test-card')).toBeVisible();
  await expect(page.getByTestId('test-detail')).toHaveText('尺寸 100%｜無損（沒有減色）｜6 格');
  /* 單張下載（F71） */
  const one = await download(page, () => btn(v, '下載這一張').click());
  expect(one.suggestedFilename()).toBe('ball.png');
  const single = decode(await bytesOf(one));
  expect(single.loops).toBe(7);
  /* 上一張／下一張（←／→） */
  await v.getByRole('heading', { name: 'ball.png' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(v.getByRole('heading', { name: 'loop0.png' })).toBeVisible();
  await btn(viewer(page), '回到清單').click(); /* 通知開著時 Esc 會先關通知 */
  await expect(v).toBeHidden();
  /* 匯出：ball 7 次（個別優先）、loop0 5 次；延遲照原檔（0 保留） */
  const { entries } = await exportZip(page);
  const ball = decode(entries.find((e) => e.name === 'ball.png')!.data);
  const loop0 = decode(entries.find((e) => e.name === 'loop0.png')!.data);
  expect(ball.loops).toBe(7);
  expect(loop0.loops).toBe(5);
  expect(ball.frames.map((f) => Math.round(f.delayMs))).toEqual([100, 0, 50, 200, 100, 100]);
  /* 整體「照原檔」、ball 回到「跟隨整體」 */
  await settingsPane(page).getByRole('combobox', { name: 'APNG 播放次數' }).click();
  await page.getByRole('option', { name: '照原檔' }).click();
  await tiles(page).first().click();
  await viewer(page).getByRole('combobox', { name: 'APNG 播放次數' }).click();
  await page.getByRole('option', { name: '跟隨整體設定' }).click();
  await btn(viewer(page), '回到清單').click(); /* 通知開著時 Esc 會先關通知 */
  const again = await exportZip(page);
  expect(decode(again.entries.find((e) => e.name === 'ball.png')!.data).loops).toBe(3);
  expect(decode(again.entries.find((e) => e.name === 'loop0.png')!.data).loops).toBe(0);
  expect(errors).toEqual([]);
});

test('畫布尺寸：補到 24 倍數（含 APNG）、縮小時確認裁切、全部補', async ({ page }) => {
  const errors = await open(page);
  await load(page, [
    file('box.png', await solidPng(50, 30, [255, 0, 0, 255])),
    file('ball.png', await ballApng()),
    file('ok.png', await solidPng(48, 72, [0, 0, 255, 255])),
  ]);
  /* 選 box（點清單會開檢視器，在檢視器裡補） */
  await tiles(page).first().click();
  await btn(viewer(page), '補到 24 倍數').click();
  await expect(toastText(page, '畫布改成 72 × 48 px')).toBeVisible();
  await expect(viewer(page)).toContainText('72 × 48 px');
  await btn(viewer(page), '回到清單').click(); /* 通知開著時 Esc 會先關通知 */
  await expect(tiles(page).first().getByTestId('tile-size')).toHaveText('72×48');
  /* 縮小：先確認 */
  const summary = page.getByTestId('selected-summary');
  await summary.getByRole('spinbutton', { name: '寬' }).fill('40');
  await summary.getByRole('spinbutton', { name: '高' }).fill('20');
  await btn(summary, '套用').click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('72 × 48 px → 40 × 20 px');
  await btn(confirm, '裁切').click();
  await expect(tiles(page).first().getByTestId('tile-size')).toHaveText('40×20');
  /* 全部補（F103）：已整除的跳過 */
  await page.getByTestId('pad-all').click();
  await expect(toastText(page, '補了 2 張')).toBeVisible();
  await expect(tiles(page).first().getByTestId('tile-size')).toHaveText('48×24');
  await expect(tiles(page).nth(1).getByTestId('tile-size')).toHaveText('72×48');
  await expect(tiles(page).nth(2).getByTestId('tile-size')).toHaveText('48×72');
  /* 匯出：APNG 的每一格也補了（第 5 節第 17 項）、內容置中 */
  const { entries } = await exportZip(page);
  const ball = decode(entries.find((e) => e.name === 'ball.png')!.data);
  expect([ball.width, ball.height, ball.frames.length]).toEqual([72, 48, 6]);
  const box = decode(entries.find((e) => e.name === 'box.png')!.data);
  expect([box.width, box.height]).toEqual([48, 24]);
  /* 50×30 → 72×48（內容在 11,9）→ 40×20（偏移 −16,−14：剩下的全是內容）→ 48×24（偏移 4,2） */
  const alpha = (x: number, y: number) => box.frames[0].rgba[(y * 48 + x) * 4 + 3];
  expect([
    alpha(0, 0),
    alpha(3, 2),
    alpha(4, 1),
    alpha(4, 2),
    alpha(43, 21),
    alpha(44, 21),
  ]).toEqual([0, 0, 0, 255, 255, 0]);
  expect(errors).toEqual([]);
});

test('自訂組合、漸層預設、曲線編輯', async ({ page }) => {
  const errors = await open(page);
  await load(page, [file('measure.png', await measurePng())]);
  const pane = settingsPane(page);
  await setNumber(tone(page, '色相'), '-40');
  await pane.getByRole('textbox', { name: '組合名稱' }).fill('冷色');
  await pane.getByRole('textbox', { name: '組合名稱' }).press('Enter');
  await expect(toastText(page, '已儲存自訂組合「冷色」')).toBeVisible();
  await expect(pane.getByRole('textbox', { name: '組合名稱' })).toHaveValue('');
  await btn(pane, '儲存').click();
  await expect(pane.getByRole('button', { name: '套用「自訂組合 2」' })).toBeVisible();
  await btn(pane, '全部重設').click();
  await expect(tone(page, '色相')).toHaveValue('0');
  await pane.getByRole('button', { name: '套用「冷色」' }).click();
  await expect(tone(page, '色相')).toHaveValue('-40');
  await pane.getByRole('button', { name: '刪除「自訂組合 2」' }).click();
  await btn(page.getByRole('alertdialog'), '刪除').click();
  await expect(pane.getByRole('button', { name: '套用「自訂組合 2」' })).toHaveCount(0);
  /* 漸層預設：自動打開漸層對應 */
  const toggle = pane.getByRole('switch', { name: '使用漸層對應' });
  await expect(toggle).not.toBeChecked();
  await btn(pane.getByRole('group', { name: '整體漸層預設' }), '黑白').click();
  await expect(toggle).toBeChecked();
  /* 曲線：點空白處新增控制點、Delete 刪除 */
  const editor = pane.getByTestId('curve-editor');
  const eb = (await editor.boundingBox())!;
  await page.mouse.click(eb.x + eb.width * 0.5, eb.y + eb.height * 0.3);
  await expect(editor.getByRole('slider')).toHaveCount(3);
  await editor.getByRole('slider').nth(1).focus();
  await page.keyboard.press('Delete');
  await expect(editor.getByRole('slider')).toHaveCount(2);
  /* 自訂組合重新整理後還在 */
  await page.reload();
  await expect(pane.getByRole('button', { name: '套用「冷色」' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('自動存檔與還原（含原 ZIP）、清除作業', async ({ page }) => {
  const errors = await open(page);
  const room = await roomZip();
  await load(page, [file('room.zip', room.zip, 'application/zip')]);
  await setNumber(tone(page, '色相'), '30');
  await rows(page).filter({ hasText: '艾琳' }).click();
  await expect(page.getByText(/已自動儲存/)).toBeVisible();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(toastText(page, '已還原上次的作業（10 個素材）')).toBeVisible();
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'room');
  await expect(tone(page, '色相')).toHaveValue('30');
  /* 還原後選取的素材顯示在摘要（第 5 節第 33 項） */
  await expect(page.getByTestId('selected-name')).toHaveText(room.names.icon);
  /* 原 ZIP 一起存了：還原後也能匯出房間 */
  const { name, entries } = await exportZip(page);
  expect(name).toBe('room_recolor.zip');
  expect(entries.some((e) => e.name === '.token')).toBe(true);
  /* 清除作業（F106）：整體調色保留、回到等待 */
  await page.getByRole('button', { name: '清除作業' }).click();
  await btn(page.getByRole('alertdialog'), '清除').click();
  await expect(page.getByTestId('empty-drop')).toBeVisible();
  await expect(modeBadge(page)).toHaveAttribute('data-mode', 'idle');
  await expect(tone(page, '色相')).toHaveValue('30');
  await page.reload();
  await expect(page.getByTestId('empty-drop')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(tiles(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('拖放：視窗任何地方都可以放、載入區變醒目', async ({ page }) => {
  const errors = await open(page);
  const png = Buffer.from(await solidPng(8, 8, [1, 1, 1, 255])).toString('base64');
  const dt = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], 'drop.png', { type: 'image/png' }));
    return dt;
  }, png);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: dt });
  await expect(page.getByTestId('window-drop')).toBeVisible();
  await expect(page.getByTestId('load-area')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('empty-drop')).toHaveAttribute('data-active', 'true');
  await page.locator('body').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByTestId('window-drop')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByTestId('load-area')).not.toHaveAttribute('data-active', 'true');
  expect(errors).toEqual([]);
});

test.describe('版面', () => {
  test('390 寬：沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await load(page, [file('test.psd', testPsd(), 'application/octet-stream')]);
    await noHorizontalScroll(page);
    await page.getByRole('tab', { name: '圖片清單' }).click();
    await noHorizontalScroll(page);
    await tiles(page).first().click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280', async ({ page }) => {
    await open(page);
    await load(page, [file('test.psd', testPsd(), 'application/octet-stream')]);
    await page.mouse.move(0, 0);
    await expect(page.getByText('已載入 PSD：12 個圖層', { exact: true })).toBeHidden({
      timeout: 8000,
    });
    await expect(page).toHaveScreenshot('psd-studio-1280.png', {
      fullPage: true,
      mask: [page.getByText(/自動儲存/)],
    });
  });

  test('視覺回歸：390', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await load(page, [file('measure.png', await measurePng()), file('ball.png', await ballApng())]);
    await page.mouse.move(0, 0);
    await expect(page.getByText('加入了 2 張圖片', { exact: true })).toBeHidden({ timeout: 8000 });
    await expect(page).toHaveScreenshot('psd-studio-390.png', {
      fullPage: true,
      mask: [page.getByText(/自動儲存/)],
    });
  });
});
