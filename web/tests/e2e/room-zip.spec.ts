/**
 * 房間 ZIP 產生器的端對端測試（測建置產物 tools/room-zip/）：
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

/** 專案資料（自動存在 localStorage） */
async function projectData(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('trpg-toolkit:room-zip') ?? 'null')?.state?.data as {
        room: { fieldWidth: number; backgroundUrl: string | null };
        parts: { id: string; x: number; y: number; width: number }[];
        materials: { name: string; label: string }[];
      },
  );
}

/** 素材圖片資料（IndexedDB）：刪掉／檢查有沒有 */
async function assetBlob(page: Page, name: string, remove = false) {
  return page.evaluate(
    async ({ n, rm }) => {
      const db = await new Promise<IDBDatabase>((ok, ng) => {
        const q = indexedDB.open('trpg-toolkit:tool:room-zip:assets');
        q.onsuccess = () => ok(q.result);
        q.onerror = () => ng(q.error);
      });
      const has = await new Promise<boolean>((ok) => {
        const t = db.transaction('kv', rm ? 'readwrite' : 'readonly');
        const store = t.objectStore('kv');
        if (rm) {
          store.delete(n);
          t.oncomplete = () => ok(false);
        } else {
          const r = store.get(n);
          r.onsuccess = () => ok(r.result != null);
        }
      });
      db.close();
      return has;
    },
    { n: name, rm: remove },
  );
}

test('數字欄：夾住或維持原值後顯示實際的值；製作器的不透明度 0～100、一次欄位編輯一步復原、鎖定時全部停用（F106、F111、F115、F137、F166）', async ({
  page,
}) => {
  const errors = await open(page);
  await go(page, 'materials');
  await page.getByRole('button', { name: '文字＋圖形合成圖' }).click();
  const maker = page.getByRole('dialog', { name: '文字＋圖形合成圖' });
  /* F106：16～4096；Enter 後焦點還在也改成實際的值 */
  const cw = maker.getByRole('spinbutton', { name: '畫布：寬' });
  await cw.fill('5');
  await cw.press('Enter');
  await expect(cw).toBeFocused();
  await expect(cw).toHaveValue('16');
  await expect(page.getByTestId('maker-canvas')).toHaveJSProperty('width', 16);
  await cw.fill('9999');
  await cw.press('Tab');
  await expect(cw).toHaveValue('4096');
  await cw.fill('640');
  await cw.press('Tab');
  await maker.getByRole('button', { name: '方形', exact: true }).click();
  const fields = page.getByTestId('maker-fields');
  const x = fields.getByRole('spinbutton', { name: 'X：方形 1' });
  const undo = maker.getByRole('button', { name: '復原', exact: true });
  /* F115：一次欄位編輯（聚焦到離開）只算一步，Enter 再離開也一樣 */
  await x.fill('111');
  await x.press('Tab');
  await undo.click();
  await expect(x).toHaveValue('80');
  await x.fill('222');
  await x.press('Enter');
  await x.press('Tab');
  await undo.click();
  await expect(x).toHaveValue('80');
  await undo.click();
  await expect(fields).toHaveCount(0);
  await maker.getByRole('button', { name: '重做', exact: true }).click();
  /* F111：不透明度夾在 0～100 */
  const op = fields.getByRole('spinbutton', { name: '不透明度：方形 1' });
  await op.fill('150');
  await op.press('Enter');
  await expect(op).toHaveValue('100');
  await op.fill('-20');
  await op.press('Tab');
  await expect(op).toHaveValue('0');
  /* 鎖定時所有欄位（含顏色）停用 */
  await page
    .getByTestId('maker-layers')
    .locator('li')
    .first()
    .getByRole('button', { name: '鎖定／解除' })
    .click();
  for (const el of await fields.locator('input, button').all()) await expect(el).toBeDisabled();
  /* F285：Esc 關閉製作器（內容丟棄） */
  await page.keyboard.press('Escape');
  await expect(maker).toHaveCount(0);

  /* F137：盤面寬 0／負數／空白 → 維持原值，欄位也回到原值 */
  await go(page, 'room');
  const bw = page.getByRole('spinbutton', { name: '寬（格）', exact: true });
  await bw.fill('25');
  await bw.press('Enter');
  for (const v of ['0', '-3', '']) {
    await bw.fill(v);
    await bw.press('Tab');
    await expect(bw).toHaveValue('25');
  }
  await expect(page.getByTestId('board-size')).toHaveText('25 × 30 格');
  /* F166：部件寬 0 → 1 格 */
  await page.getByRole('button', { name: '新增共用標記', exact: true }).first().click();
  const pw = page.getByRole('spinbutton', { name: '寬：共用標記' });
  await pw.fill('0');
  await pw.press('Enter');
  await expect(pw).toHaveValue('1');
  await expect.poll(async () => (await projectData(page)).parts[0]?.width).toBe(1);
  expect(errors).toEqual([]);
});

test('房間設計畫布：多選點一個放開只選它、先按住 Shift 再拖動全部並鎖方向、操作說明的部件快捷鍵、快速裁切框與即時預覽（F151～F153、F158）', async ({
  page,
}) => {
  const errors = await open(page);
  await importImages(page, [file('標記.png', await png(64, 64, [200, 120, 60]))]);
  await go(page, 'room');
  const add = page.getByRole('button', { name: '新增共用標記', exact: true }).first();
  for (let i = 0; i < 3; i++) await add.click();
  const ids = (await projectData(page)).parts.map((p) => p.id);
  const card = (id: string) => page.locator(`article[data-part="${id}"]`);
  const setPos = async (id: string, x: number, y: number) => {
    for (const [label, v] of [
      ['水平位置：共用標記', x],
      ['垂直位置：共用標記', y],
    ] as const) {
      await card(id).getByLabel(label).fill(String(v));
      await card(id).getByLabel(label).press('Enter');
    }
  };
  await setPos(ids[0], -10, -5);
  await setPos(ids[1], 12, -8);
  await setPos(ids[2], 8, 6);
  await card(ids[1])
    .getByRole('button', { name: /^圖片：/ })
    .click();
  await page.getByTestId('image-picker').locator('[data-picker-tile]').first().click();
  await page.evaluate(() => window.scrollTo(0, 0));

  /* F151：操作說明列出三個部件快捷鍵與目前的按鍵 */
  await page.getByRole('button', { name: '操作說明' }).click();
  const help = page.getByTestId('room-keys-help');
  await expect(help).toContainText('開啟選取部件的設定：Ctrl＋1');
  await expect(help).toContainText('選取部件的鎖定切換：Ctrl＋2');
  await expect(help).toContainText('選取部件的顯示切換：Ctrl＋3');

  const canvas = page.getByTestId('room-canvas');
  const item = (id: string) => canvas.locator(`[data-board-item="${id}"]`);
  const center = async (id: string) => {
    const b = await item(id).boundingBox();
    if (!b) throw new Error(`沒有 ${id}`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width };
  };
  const toolbar = page.getByTestId('room-toolbar');
  const clickItem = async (id: string, mod?: 'Shift' | 'Control') => {
    const c = await center(id);
    if (mod) await page.keyboard.down(mod);
    await page.mouse.click(c.x, c.y);
    if (mod) await page.keyboard.up(mod);
  };
  /* F152：三個都選取後點其中一個（不拖）→ 只選它 */
  await clickItem(ids[0]);
  await clickItem(ids[1], 'Shift');
  await clickItem(ids[2], 'Shift');
  await expect(toolbar).toContainText('已選 3 個');
  await clickItem(ids[1]);
  await expect(toolbar).toContainText('已選 1 個');
  await expect(item(ids[1])).toHaveAttribute('data-selected', 'true');
  await expect(item(ids[0])).not.toHaveAttribute('data-selected', 'true');

  /* F153：選 A 後先按住 Shift 再按下 C 拖曳 → C 加選並與 A 一起移動，鎖成水平 */
  await clickItem(ids[0]);
  const cell = (await center(ids[0])).width / (await projectData(page)).parts[0].width;
  const c = await center(ids[2]);
  await page.keyboard.down('Shift');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + cell * 2, c.y + cell * 0.4, { steps: 3 });
  await page.mouse.move(c.x + cell * 4, c.y + cell * 0.8, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(toolbar).toContainText('已選 2 個');
  await expect
    .poll(async () => (await projectData(page)).parts.map((p) => `${p.x},${p.y}`))
    .toEqual(['-6,-5', '12,-8', '12,6']);

  /* F158：快速裁切框可拖曳、拉右下角調大小，部件圖即時套用裁切；透明與翻轉即時預覽 */
  await toolbar.getByRole('button', { name: '取消選取' }).click();
  await clickItem(ids[1]);
  await toolbar.getByRole('button', { name: '裁切', exact: true }).click();
  const quick = page.getByTestId('quick-edit');
  const sides = () =>
    quick
      .getByRole('spinbutton')
      .evaluateAll((els) => els.slice(0, 4).map((e) => (e as HTMLInputElement).value));
  const box = page.getByTestId('quick-crop-box');
  const b0 = await box.boundingBox();
  const h = await page.getByTestId('quick-crop-handle').boundingBox();
  if (!b0 || !h) throw new Error('沒有裁切框');
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 - b0.width * 0.3, h.y + h.height / 2 - b0.height * 0.2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect.poll(sides).toEqual(['0', '30', '0', '20']);
  const b1 = await box.boundingBox();
  if (!b1) throw new Error('沒有裁切框');
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    b1.x + b1.width / 2 + b0.width * 0.2,
    b1.y + b1.height / 2 + b0.height * 0.1,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect.poll(sides).toEqual(['20', '10', '10', '10']);
  await expect(toolbar).toContainText('已選 1 個');
  const img = item(ids[1]).locator('img');
  await expect(img).toHaveCSS('clip-path', 'inset(10% 10% 10% 20%)');
  await quick.getByRole('button', { name: '取消', exact: true }).click();
  await expect(img).toHaveCSS('clip-path', 'none');
  await toolbar.getByRole('button', { name: '透明', exact: true }).click();
  await quick.getByRole('spinbutton').first().fill('30');
  await quick.getByRole('spinbutton').first().press('Enter');
  await expect(img).toHaveCSS('opacity', '0.3');
  await quick.getByRole('button', { name: '取消', exact: true }).click();
  await expect(img).toHaveCSS('opacity', '1');
  await toolbar.getByRole('button', { name: '左右翻轉', exact: true }).click();
  await expect(img).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await quick.getByRole('button', { name: '取消', exact: true }).click();
  expect(errors).toEqual([]);
});

test('沒有素材時「從素材挑選」只警告（F173）；共用設定視窗的欄位沒有英文（F219）', async ({
  page,
}) => {
  const errors = await open(page);
  for (const [id, label] of [
    ['scenes', '從素材挑選建立'],
    ['tachie', '從素材挑選登錄'],
    ['cutins', '從素材挑選建立'],
    ['room', '從素材挑選'],
  ] as const) {
    await go(page, id);
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await expect(page.getByText('還沒有素材，請先放入圖片').last()).toBeVisible();
    await expect(page.getByTestId('multi-pick')).toHaveCount(0);
  }
  await page.getByRole('button', { name: '新增共用標記', exact: true }).first().click();
  const id = (await projectData(page)).parts[0].id;
  /* 移開，不要被盤面中央的暫用立繪蓋住 */
  const posX = page.getByRole('spinbutton', { name: '水平位置：共用標記' });
  await posX.fill('-12');
  await posX.press('Enter');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId('room-canvas').locator(`[data-board-item="${id}"]`).click();
  await page.getByTestId('room-toolbar').getByRole('button', { name: '詳細' }).click();
  const aria = await page
    .getByTestId('source-dialog')
    .locator('input[type=number]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(aria).toEqual(['水平位置', '垂直位置', '寬', '高', '堆疊順序']);
  expect(errors).toEqual([]);
});

test('Esc：有通知時一次就關閉對話框（通知留著）；登錄範本的輸入框自動聚焦、Enter＝確定（F285）', async ({
  page,
}) => {
  const errors = await open(page);
  await go(page, 'scenes');
  const quick = page.locator('#quick-scene-name');
  await quick.fill('開場');
  await quick.press('Enter');
  await page.getByRole('button', { name: '場景範本', exact: true }).click();
  const templates = page.getByTestId('scene-templates');
  await templates.getByRole('button', { name: '把目前場景登錄為範本' }).click();
  const prompt = page.getByRole('dialog', { name: '把目前場景登錄為範本' });
  const input = prompt.getByRole('textbox');
  await expect(input).toBeFocused();
  await input.fill('我的範本');
  await input.press('Enter');
  await expect(prompt).toHaveCount(0);
  const toast = page.getByText('已登錄範本', { exact: true });
  await expect(toast).toBeVisible();
  await expect(templates).toContainText('我的範本');
  await page.keyboard.press('Escape');
  await expect(templates).toHaveCount(0);
  await expect(toast).toBeVisible();
  /* 焦點不在對話框裡（例如在 body）時也一樣 */
  await page.getByRole('button', { name: '場景範本', exact: true }).click();
  await expect(templates).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await expect(templates).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('淡入淡出動態圖：產生中按 Esc 也關閉、背景做完照樣加入素材；從加工開啟的 Esc 不回到加工（F285）', async ({
  page,
}) => {
  const errors = await open(page);
  await importImages(page, [file('大圖.png', await png(1600, 900, [80, 160, 90]))]);
  const cards = page.getByTestId('materials-page').locator('[data-material]');
  await expect(cards).toHaveCount(1);
  await cards.first().locator('img').first().click();
  await page.getByRole('button', { name: '淡入淡出動態圖' }).click();
  const dialog = page.getByRole('dialog', { name: '淡入淡出動態圖（APNG）' });
  const seconds = dialog.getByRole('spinbutton').first();
  await seconds.fill('4');
  await seconds.press('Tab');
  await dialog.getByRole('button', { name: '產生' }).click();
  await expect(dialog.getByRole('button', { name: /產生中/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(cards).toHaveCount(2, { timeout: 60_000 });
  /* 加工 → 轉成動態圖 → Esc：不回到加工對話框 */
  await cards.first().getByRole('button', { name: '加工' }).click();
  await page.getByTestId('edit-dialog').waitFor();
  await page.getByRole('button', { name: '轉成動態圖' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('edit-dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('補上原圖：選原本那個檔時補回圖片資料（F280）', async ({ page }) => {
  const errors = await open(page);
  const img = file('前景.png', await png(320, 180, [180, 90, 140]));
  await importImages(page, [img]);
  await expect.poll(async () => (await projectData(page))?.materials.length).toBe(1);
  const name = (await projectData(page)).materials[0].name;
  /* 用在房間背景（有被引用的圖才算遺失） */
  await go(page, 'room');
  await page.getByRole('button', { name: '房間背景', exact: true }).click();
  await page.getByTestId('image-picker').locator('[data-picker-tile]').first().click();
  await expect.poll(async () => (await projectData(page)).room.backgroundUrl).toBe(name);
  await assetBlob(page, name, true);
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await go(page, 'materials');
  await page.getByTestId('broken-banner').getByRole('button', { name: '開啟修復' }).click();
  const dialog = page.getByTestId('broken-dialog');
  await expect(dialog.locator('[data-broken]')).toHaveCount(1);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dialog.getByRole('button', { name: '補上原圖' }).click(),
  ]);
  await chooser.setFiles(img);
  await expect(dialog).toContainText('沒有找不到的圖片了。');
  await expect(page.getByText('已補上', { exact: true })).toBeVisible();
  expect((await projectData(page)).materials.map((m) => m.name)).toEqual([name]);
  expect(await assetBlob(page, name)).toBe(true);
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
