/**
 * 房間 ZIP 產生器的端對端測試（測建置產物 next/room-zip/）：
 * - 開頁沒有錯誤、各頁都能開；
 * - 匯入圖片（自動推測用途、合併重複）、建立場景、立繪登場，匯出房間 ZIP 後解開檢查：
 *   `__data.json`、`.token`、圖片檔名＝內容的 SHA-256＋副檔名、resources 與圖片一一對應、場景與立繪的座標；
 * - 載入範例專案再匯出、專案檔存檔與讀取的來回；
 * - 390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { checkRoomZip } from '../../src/ccfolia';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('room-zip') ?? { id: 'room-zip', status: 'next' })}/`;

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
  await expect(page.getByTestId('home-page')).toBeVisible();
  return errors;
}

/** 單色背景加一塊色塊的 PNG */
async function png(w: number, h: number, rgb: [number, number, number]): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    const inner = x > w * 0.2 && x < w * 0.8 && y > h * 0.1;
    px[i * 4] = inner ? rgb[0] : 40;
    px[i * 4 + 1] = inner ? rgb[1] : 40;
    px[i * 4 + 2] = inner ? rgb[2] : 60;
    px[i * 4 + 3] = 255;
  }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

const nav = (page: Page, id: string) => page.locator(`nav [data-nav="${id}"]`).first();

async function go(page: Page, id: string) {
  await nav(page, id).click();
  await expect(nav(page, id)).toHaveAttribute('aria-current', 'page');
}

async function importImages(page: Page, files: ReturnType<typeof file>[]) {
  await go(page, 'materials');
  await page.getByTestId('materials-page').locator('input[type=file]').first().setInputFiles(files);
}

async function exportZip(page: Page) {
  await go(page, 'save');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByTestId('save-page').getByRole('button', { name: '匯出房間 ZIP' }).click(),
  ]);
  const bytes = new Uint8Array(readFileSync(await download.path()));
  return { name: download.suggestedFilename(), bytes };
}

interface RoomJson {
  meta: { version: string };
  entities: {
    room: Record<string, unknown> & { backgroundUrl: string | null; fieldWidth: number };
    scenes: Record<
      string,
      Record<string, unknown> & { name: string; foregroundUrl: string | null }
    >;
    items: Record<string, Record<string, unknown>>;
    markers?: Record<string, unknown>;
  };
  resources: Record<string, { type: string }>;
}

function readZip(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const data = JSON.parse(new TextDecoder().decode(files['__data.json'])) as RoomJson;
  return { files, data };
}

async function noHorizontalScroll(page: Page, what = '') {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, `${what}不應出現橫向捲動`).toBeLessThanOrEqual(cw);
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

const PAGES = [
  'room',
  'materials',
  'scenes',
  'tachie',
  'cutins',
  'story',
  'pieces',
  'save',
  'settings',
];

async function loadSample(page: Page) {
  await go(page, 'home');
  await page.getByRole('button', { name: '載入範例專案' }).click();
  const confirm = page.getByRole('alertdialog');
  if (await confirm.isVisible().catch(() => false))
    await confirm.getByRole('button').last().click();
  await expect(page.getByTestId('project-name')).toHaveText('範例房間', { timeout: 30_000 });
  await expect(page.getByTestId('busy')).toHaveCount(0);
}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** ZIP 的共同檢查：平坦、.token、__data.json 不縮排、圖片檔名＝SHA-256、resources 與圖片一一對應 */
async function expectValidRoomZip(bytes: Uint8Array) {
  const check = await checkRoomZip(bytes);
  expect(check.problems).toEqual([]);
  expect(check.ok).toBe(true);
  const { files, data } = readZip(bytes);
  const names = Object.keys(files);
  expect(names.every((n) => !n.includes('/'))).toBe(true);
  expect(names.slice(0, 2)).toEqual(['__data.json', '.token']);
  expect(new TextDecoder().decode(files['.token'])).toMatch(/^0\.[0-9a-f]{64}$/);
  expect(new TextDecoder().decode(files['__data.json'])).not.toContain('\n');
  const images = names.filter((n) => n !== '__data.json' && n !== '.token');
  for (const n of images) {
    expect(n).toMatch(/^[0-9a-f]{64}\.(webp|png|jpeg|gif)$/);
    expect(sha(files[n])).toBe(n.split('.')[0]);
  }
  expect(Object.keys(data.resources).sort()).toEqual([...images].sort());
  return { files, data, images, check };
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('開頁：首頁與各頁都能開，沒有錯誤', async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle('房間 ZIP 產生器｜TRPG Toolkit');
  await expect(page.getByTestId('project-name')).toHaveText('未命名房間');
  for (const id of [...PAGES, 'home']) await go(page, id);
  await expect(
    page.getByRole('link', { name: /johnko00\/ccfolia-room-zip-maker-demo/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('匯入圖片、建立場景與立繪，匯出的房間 ZIP 可以解開比對', async ({ page }) => {
  const errors = await open(page);
  const bg = await png(1280, 720, [200, 120, 60]);
  const hero = await png(360, 900, [60, 160, 200]);
  await importImages(page, [
    file('書房.png', bg),
    file('主角.png', hero),
    file('書房-複製.png', bg),
  ]);
  const cards = page.getByTestId('materials-page').locator('[data-material]');
  /* 內容相同的圖合併成一張 */
  await expect(cards).toHaveCount(2);
  const names = (await cards.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-material') ?? ''),
  )) as [string, string];
  for (const n of names) expect(n).toMatch(/^[0-9a-f]{64}\.(webp|png)$/);
  /* 依長寬推測用途：橫的＝前景、直長的＝立繪 */
  await expect(cards.nth(0).getByRole('checkbox', { name: '前景', exact: true })).toBeChecked();
  await expect(cards.nth(1).getByRole('checkbox', { name: '立繪', exact: true })).toBeChecked();
  await expect(cards.nth(0).getByRole('textbox')).toHaveValue('書房');

  await go(page, 'scenes');
  const nameInput = page.locator('#quick-scene-name');
  await nameInput.fill('第一幕');
  await nameInput.press('Enter');
  await expect(page.locator('[data-scene-row]')).toHaveCount(1);
  const media = (n: string) => page.locator(`[data-media-card="${n}"]`);
  await media(names[0]).getByRole('button', { name: '當前景' }).click();
  await media(names[1]).getByRole('button', { name: '當立繪' }).click();
  const detail = page.getByTestId('scene-detail');
  await detail.getByRole('checkbox', { name: /主角/ }).click();
  await expect(detail.locator('[data-scene-tachie]')).toHaveCount(1);

  const { name, bytes } = await exportZip(page);
  expect(name).toBe('未命名房間.zip');
  const { data, images, check } = await expectValidRoomZip(bytes);
  expect(images.sort()).toEqual([...names].sort());
  expect(check.sceneCount).toBe(1);
  /* 房間背景自動設成第一張前景（F043） */
  expect(data.entities.room.backgroundUrl).toBe(names[0]);
  expect(data.entities.room.fieldWidth).toBe(40);
  const scenes = Object.values(data.entities.scenes);
  expect(scenes).toHaveLength(1);
  expect(scenes[0].name).toBe('第一幕');
  expect(scenes[0].foregroundUrl).toBe(names[0]);
  const markers = Object.values(scenes[0].markers as Record<string, Record<string, unknown>>);
  const tachie = markers.find((m) => m.imageUrl === names[1]);
  expect(tachie).toBeTruthy();
  /* 立繪高 18 格、寬依原圖比例（360×900 → 7.2 → 7） */
  expect(tachie?.height).toBe(18);
  expect(tachie?.width).toBe(7);
  expect(errors).toEqual([]);
});

test('重新整理後自動還原專案內容與圖片（D15）', async ({ page }) => {
  const errors = await open(page);
  await importImages(page, [file('還原測試.png', await png(640, 360, [120, 200, 120]))]);
  const cards = page.getByTestId('materials-page').locator('[data-material]');
  await expect(cards).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveText('未命名房間');
  await expect(nav(page, 'materials')).toContainText('1');
  await go(page, 'materials');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('textbox')).toHaveValue('還原測試');
  await expect
    .poll(() =>
      cards
        .first()
        .locator('img')
        .first()
        .evaluate((im) => (im as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('範例專案：載入、復原、匯出，以及專案檔存檔與讀取的來回', async ({ page }) => {
  const errors = await open(page);
  await loadSample(page);
  await expect(nav(page, 'scenes')).toContainText('2');
  /* 載入範例可以復原 */
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(page.getByTestId('project-name')).toHaveText('未命名房間');
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect(page.getByTestId('project-name')).toHaveText('範例房間');

  const first = await exportZip(page);
  expect(first.name).toBe('範例房間.zip');
  const { data, check } = await expectValidRoomZip(first.bytes);
  expect(check.sceneCount).toBe(2);
  expect(check.characterCount).toBe(1);
  expect(Object.values(data.entities.scenes).map((s) => s.name)).toEqual([
    '序章・書房',
    '第一幕・夜晚街道',
  ]);
  /* 螢幕面板＝items */
  expect(Object.values(data.entities.items)).toHaveLength(1);

  /* 存成專案檔 → 開新房間 → 讀回來 */
  await go(page, 'save');
  const [saved] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('save-page').getByRole('button', { name: '儲存（下載專案檔）' }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe('範例房間.rzproj');
  const projectBytes = readFileSync(await saved.path());
  await page.getByTestId('save-page').getByRole('button', { name: '開新房間' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /開新房間|確定/ })
    .click();
  await expect(page.getByTestId('project-name')).toHaveText('新的房間');
  await go(page, 'save');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('save-page').getByRole('button', { name: '讀取', exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: '範例房間.rzproj',
    mimeType: 'application/zip',
    buffer: projectBytes,
  });
  await expect(page.getByTestId('project-name')).toHaveText('範例房間');
  const second = await exportZip(page);
  const again = readZip(second.bytes);
  /* 讀回來的專案匯出結果相同（.token 每次重新產生） */
  expect(again.data).toEqual(readZip(first.bytes).data);
  expect(errors).toEqual([]);
});

test('淡入淡出動態圖：從素材產生 APNG（格數、每格延遲、循環、縮小到長邊 1024）', async ({
  page,
}) => {
  const errors = await open(page);
  await importImages(page, [file('背景.png', await png(1280, 720, [90, 140, 200]))]);
  const cards = page.getByTestId('materials-page').locator('[data-material]');
  await expect(cards).toHaveCount(1);
  const source = (await cards.first().getAttribute('data-material')) ?? '';
  await cards.first().locator('img').first().click();
  await expect(page.getByTestId('material-sel-count')).toContainText('1');
  await page.getByRole('button', { name: '淡入淡出動態圖' }).click();
  const dialog = page.getByRole('dialog', { name: '淡入淡出動態圖（APNG）' });
  await expect(dialog.getByTestId('fade-summary')).toContainText('約 0.5 秒・6 格');
  await expect(dialog.getByTestId('fade-summary')).toContainText('循環：無');
  await dialog.getByRole('button', { name: '產生' }).click();
  await expect(dialog.getByTestId('fade-result')).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId('fade-result')).toContainText('背景_淡出.png');
  await page.keyboard.press('Escape');
  await expect(cards).toHaveCount(2);
  const name = (await cards.evaluateAll(
    (els, src) => els.map((e) => e.getAttribute('data-material')).find((n) => n !== src),
    source,
  )) as string;
  expect(name).toMatch(/^[0-9a-f]{64}\.png$/);
  const bytes = new Uint8Array(
    await page.evaluate(async (n) => {
      const img = document.querySelector(`[data-material="${n}"] img`) as HTMLImageElement;
      return [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())];
    }, name),
  );
  expect(sha(bytes)).toBe(name.split('.')[0]);
  const info = parseApng(bytes);
  expect([info.ihdr.width, info.ihdr.height]).toEqual([1024, 576]);
  expect(info.frames).toHaveLength(6);
  expect(info.numPlays).toBe(1);
  expect(info.frames.map((f) => Math.round((f.delayNum / (f.delayDen || 100)) * 1000))).toEqual([
    84, 84, 83, 83, 83, 83,
  ]);
  expect(errors).toEqual([]);
});

/** 從素材卡片的縮圖讀回圖片：格式、寬高與指定位置的像素 */
async function materialImage(page: Page, name: string, points: [number, number][]) {
  return page.evaluate(
    async ({ n, pts }) => {
      const img = document.querySelector(`[data-material="${n}"] img`) as HTMLImageElement;
      const blob = await (await fetch(img.src)).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const cx = c.getContext('2d') as CanvasRenderingContext2D;
      cx.drawImage(bmp, 0, 0);
      return {
        type: blob.type,
        width: bmp.width,
        height: bmp.height,
        pixels: pts.map(([x, y]) => [...cx.getImageData(x, y, 1, 1).data]),
      };
    },
    { n: name, pts: points },
  );
}

const near = (a: number[], b: number[], tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('素材製作：單色圖（附件 M01）與文字＋圖形合成圖（附件 M05）', async ({ page }) => {
  const errors = await open(page);
  await go(page, 'materials');
  const cards = page.getByTestId('materials-page').locator('[data-material]');
  const names = () =>
    cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-material') ?? ''));

  /* M01：#336699、16×16、名稱留空 → 名稱含色碼、標籤前景 */
  await page.getByRole('button', { name: '單色圖', exact: true }).click();
  const solid = page.getByRole('dialog', { name: '單色圖' });
  await solid.getByRole('textbox', { name: '顏色色碼' }).fill('#336699');
  await solid.getByRole('textbox', { name: '顏色色碼' }).press('Enter');
  await solid.getByRole('radio', { name: '16×16', exact: true }).click();
  await solid.getByRole('button', { name: '製作' }).click();
  await expect(solid).toHaveCount(0);
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('textbox')).toHaveValue('單色_#336699');
  await expect(cards.first().getByRole('checkbox', { name: '前景', exact: true })).toBeChecked();
  const [m01] = await names();
  const a = await materialImage(page, m01, [
    [0, 0],
    [8, 8],
    [15, 15],
  ]);
  expect([a.width, a.height]).toEqual([16, 16]);
  for (const px of a.pixels) expect(near(px, [51, 102, 153, 255], 2), String(px)).toBe(true);

  /* M05：畫布 400×300、背景單色 #202020、加入方形與圓形、品質標準、檔名 mk */
  await page.getByRole('button', { name: '文字＋圖形合成圖' }).click();
  const maker = page.getByRole('dialog', { name: '文字＋圖形合成圖' });
  for (const [label, v] of [
    ['畫布：寬', '400'],
    ['畫布：高', '300'],
  ]) {
    await maker.getByRole('spinbutton', { name: label }).fill(v);
    await maker.getByRole('spinbutton', { name: label }).press('Enter');
  }
  await maker.getByRole('radio', { name: '單色' }).click();
  await maker.getByRole('textbox', { name: '背景色色碼' }).fill('#202020');
  await maker.getByRole('textbox', { name: '背景色色碼' }).press('Enter');
  await maker.getByRole('button', { name: '方形', exact: true }).click();
  await maker.getByRole('button', { name: '圓形', exact: true }).click();
  await maker.getByRole('textbox', { name: '檔名' }).fill('mk');
  await maker.getByRole('button', { name: '製作', exact: true }).click();
  await expect(maker).toHaveCount(0);
  await expect(cards).toHaveCount(2);
  const m05 = (await names()).find((n) => n !== m01) ?? '';
  expect(m05).toMatch(/\.webp$/);
  const card = page.locator(`[data-material="${m05}"]`);
  await expect(card.getByRole('textbox')).toHaveValue('mk');
  await expect(card.getByRole('checkbox', { name: '其他', exact: true })).toBeChecked();
  const b = await materialImage(page, m05, [
    [0, 0],
    [200, 150],
    [399, 299],
  ]);
  expect([b.type, b.width, b.height]).toEqual(['image/webp', 400, 300]);
  expect(near(b.pixels[0], [32, 32, 32, 255]), String(b.pixels[0])).toBe(true);
  /* 中心是後加的圓形（本站預設色 #8fd3ff） */
  expect(near(b.pixels[1], [0x8f, 0xd3, 0xff, 255], 4), String(b.pixels[1])).toBe(true);
  expect(near(b.pixels[2], [32, 32, 32, 255]), String(b.pixels[2])).toBe(true);
  expect(errors).toEqual([]);
});

test('390 寬：各頁沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await noHorizontalScroll(page, '首頁');
  await loadSample(page);
  for (const id of PAGES) {
    await go(page, id);
    await noHorizontalScroll(page, id);
  }
  expect(errors).toEqual([]);
});

test.describe('視覺基準圖', () => {
  for (const width of [1280, 390]) {
    test(`場景頁（範例專案）${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await loadSample(page);
      await go(page, 'scenes');
      /* 關掉通知（時間不定，避免影響基準圖） */
      const toasts = page.getByRole('button', { name: '關閉通知' });
      while ((await toasts.count()) > 0) await toasts.first().click();
      await expect(toasts).toHaveCount(0);
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`room-zip-${width}.png`, { fullPage: true });
    });
  }
});
