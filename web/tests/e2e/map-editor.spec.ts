/**
 * 地圖編輯器（建置產物 next/map-editor/）的端對端測試：
 * - 一覽：還沒有地圖時打開「新增地圖」、建立、網址、頁面標題、複製、重新命名、匯出／讀取 JSON、刪除；
 * - 舊版存檔的搬移（IndexedDB trpg-mapper）與舊版夾具的對等（同一個範圍的匯出圖與舊版的匯出圖比對）；
 * - 作圖：矩形（點兩下、拖曳）、橢圓（外框、中心）、直線、折線、多邊形、曲線、封閉曲線、圓角、吸附、名稱；
 * - 格子（畫筆、橡皮擦、填滿、同色合併）、地面、牆壁、房間、自訂圖樣、裝飾、手繪、文字、圖片；
 * - 選取：動作列（複製、顯示、鎖定、上下層、刪除、群組、解散、布林運算）、右鍵選單、X／Y、方向鍵、R 旋轉、樣式；
 * - 圖層面板：點選、Ctrl／Shift、改名、顯示、排序、解鎖、新增圖層、不透明度、混合模式；
 * - 匯出：範圍、對話框、PNG（尺寸、像素抽查）、JPEG、SVG、檔名；地圖設定；自動儲存與重新開啟；復原／重做；
 * - 1280／390 視覺基準、390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const TOOL_URL = `/${outputDir(getTool('map-editor') ?? { id: 'map-editor', status: 'next' })}/`;
const FIX = fileURLToPath(new URL('./fixtures/map-editor/', import.meta.url));

interface LegacyRecord {
  id: string;
  name: string;
  gridType: string;
  data: Record<string, unknown>;
  thumbnail: string | null;
}

const fixture = (name: string): LegacyRecord =>
  JSON.parse(readFileSync(path.join(FIX, `${name}.json`), 'utf8')) as LegacyRecord;

/* ---------- 共用 ---------- */

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function blockFonts(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
}

/** 開一覽（還沒有地圖時「新增地圖」會自動打開） */
async function openList(page: Page): Promise<string[]> {
  const errors = watchErrors(page);
  await blockFonts(page);
  await page.goto(TOOL_URL);
  await expect(page.getByTestId('map-list')).toBeVisible();
  return errors;
}

/** 舊版的瀏覽器存檔（IndexedDB trpg-mapper v1、maps） */
async function seedLegacy(page: Page, records: LegacyRecord[]) {
  await page.goto('/');
  await page.evaluate(async (recs) => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('trpg-mapper', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('maps', { keyPath: 'id' });
      r.onsuccess = () => {
        const tx = r.result.transaction('maps', 'readwrite');
        for (const rec of recs) tx.objectStore('maps').put(rec);
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    });
  }, records);
}

/** 新增地圖並開啟；回傳 id */
async function createMap(
  page: Page,
  opts: {
    kind?: '方格' | '六角格';
    orientation?: '平頂' | '尖頂';
    fit?: boolean;
    name?: string;
  } = {},
): Promise<string> {
  const dlg = page.getByTestId('new-map-dialog');
  if (!(await dlg.isVisible())) await page.getByRole('button', { name: '新增地圖' }).click();
  await expect(dlg).toBeVisible();
  if (opts.kind) await dlg.getByRole('radio', { name: opts.kind }).click();
  if (opts.orientation) await dlg.getByRole('radio', { name: opts.orientation }).click();
  if (opts.fit) await dlg.getByRole('switch').click();
  if (opts.name !== undefined) await dlg.getByRole('textbox').fill(opts.name);
  await page.getByRole('button', { name: '建立並開啟' }).click();
  await ready(page);
  return new URL(page.url()).searchParams.get('id') ?? '';
}

/** 編輯畫面讀取完成 */
async function ready(page: Page) {
  await expect(page.getByTestId('map-editor')).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __mapEditor?: { session: unknown } }).__mapEditor?.session,
  );
}

type Obj = {
  type: string;
  name: string;
  left: number;
  top: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
};

/** 畫布上的圖層物件（由下而上） */
async function objects(page: Page): Promise<Obj[]> {
  return page.evaluate(() => {
    const e = (
      window as unknown as { __mapEditor: { engine: { canvas: { getObjects(): unknown[] } } } }
    ).__mapEditor.engine;
    return (e.canvas.getObjects() as Record<string, unknown>[])
      .filter((o) => o._isMapLayer)
      .map((o) => {
        const c = (o as { getCenterPoint(): { x: number; y: number } }).getCenterPoint();
        return {
          type: String(o.type),
          name: String(o._layerName),
          left: Number(o.left),
          top: Number(o.top),
          w: Number(o.width) * Math.abs(Number(o.scaleX)),
          h: Number(o.height) * Math.abs(Number(o.scaleY)),
          cx: Math.round(c.x * 100) / 100,
          cy: Math.round(c.y * 100) / 100,
        };
      });
  });
}

const names = async (page: Page) => (await objects(page)).map((o) => o.name);

/** 世界座標 → 視窗座標 */
async function toClient(page: Page, x: number, y: number) {
  return page.evaluate(
    ([wx, wy]) =>
      (
        window as unknown as {
          __mapEditor: {
            engine: { worldToClient(x: number, y: number): { x: number; y: number } };
          };
        }
      ).__mapEditor.engine.worldToClient(wx, wy),
    [x, y] as const,
  );
}

async function clickAt(
  page: Page,
  x: number,
  y: number,
  opts: { button?: 'left' | 'right'; modifiers?: ('Shift' | 'Control')[] } = {},
) {
  const p = await toClient(page, x, y);
  for (const m of opts.modifiers ?? []) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y, { button: opts.button });
  for (const m of opts.modifiers ?? []) await page.keyboard.up(m);
}

async function moveTo(page: Page, x: number, y: number, steps = 3) {
  const p = await toClient(page, x, y);
  await page.mouse.move(p.x, p.y, { steps });
}

async function dragWorld(page: Page, from: [number, number], to: [number, number], steps = 6) {
  const a = await toClient(page, ...from);
  const b = await toClient(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

const tool = (page: Page, id: string) =>
  page.locator(`[data-testid="tool-rail"] [data-tool="${id}"]`);
const action = (page: Page, id: string) =>
  page.locator(`[data-testid="action-bar"] [data-action="${id}"]`);
const layerRow = (page: Page, name: string) =>
  page.locator('[data-testid="layers-panel"] li[data-layer-id]').filter({
    has: page.locator('[data-testid="layer-name"]', { hasText: new RegExp(`^${name}$`) }),
  });
const statusMsg = (page: Page) => page.getByTestId('status-message');

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

function pngPixels(bytes: Buffer) {
  const chunks = parseChunks(bytes);
  const { width, height, bitDepth, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, bitDepth, colorType, data: decodePixels(z, width, height, colorType) };
}

/** 等自動儲存（狀態列「已儲存」） */
async function saved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', {
    timeout: 8000,
  });
}

/* ================= 一覽 ================= */

test.describe('地圖一覽', () => {
  test('還沒有地圖：自動打開新增地圖；名稱空白不建立；建立後開啟、網址、標題', async ({ page }) => {
    const errors = await openList(page);
    await expect(page.getByText('還沒有儲存的地圖')).toBeVisible();
    const dlg = page.getByTestId('new-map-dialog');
    await expect(dlg).toBeVisible();
    const d = new Date();
    await expect(dlg.getByRole('textbox')).toHaveValue(
      `地圖 ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    );
    /* 六角格才有方向與對齊網格 */
    await expect(dlg.getByRole('radio', { name: '平頂' })).toHaveCount(0);
    await dlg.getByRole('radio', { name: '六角格' }).click();
    await expect(dlg.getByRole('radio', { name: '平頂' })).toBeChecked();
    await dlg.getByRole('radio', { name: '方格' }).click();
    await dlg.getByRole('textbox').fill('   ');
    await page.getByRole('button', { name: '建立並開啟' }).click();
    await expect(dlg.getByText('請輸入地圖名稱')).toBeVisible();
    await dlg.getByRole('textbox').fill('測試地圖');
    await dlg.getByRole('textbox').press('Enter');
    await ready(page);
    expect(page.url()).toMatch(/\?id=[0-9a-z]+$/);
    await expect(page).toHaveTitle('測試地圖｜地圖編輯器｜TRPG Toolkit');
    await expect(page.getByTestId('map-name')).toHaveText('測試地圖');
    await expect(page.getByTestId('editor-bar')).toContainText('方格');
    /* 頁尾只有靈感來源 */
    const footer = page.locator('footer');
    await expect(footer).toContainText('靈感來源');
    await expect(footer.getByRole('link')).toHaveCount(1);
    await expect(footer.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/ihoukentiku/ihoukentiku.github.io',
    );
    /* 新地圖：100%、原點在畫面中央、選取工具 */
    await expect(page.getByTestId('status-zoom')).toHaveText('100%');
    await expect(tool(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    /* 上一頁回到一覽 */
    await page.goBack();
    await expect(page.getByTestId('map-list')).toBeVisible();
    await expect(page.getByTestId('map-card-name')).toHaveText(['測試地圖']);
    await expect(page).toHaveTitle('地圖編輯器｜TRPG Toolkit');
    expect(errors).toEqual([]);
  });

  test('六角格的種類、複製、重新命名、刪除、找不到的 id', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page, { kind: '六角格', orientation: '尖頂', fit: true, name: '尖頂地圖' });
    await expect(page.getByTestId('editor-bar')).toContainText('六角格・尖頂・對齊網格');
    await page.getByRole('button', { name: '地圖一覽' }).click();
    const card = page.getByTestId('map-card').filter({ hasText: '尖頂地圖' });
    await expect(card).toContainText('六角格・尖頂・對齊網格');
    await expect(card).toContainText(/更新：\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}/);
    await card.getByRole('button', { name: '複製' }).click();
    await expect(page.getByTestId('map-card-name')).toHaveText(['尖頂地圖（副本）', '尖頂地圖']);
    const copy = page.getByTestId('map-card').filter({ hasText: '尖頂地圖（副本）' });
    await copy.getByRole('button', { name: '重新命名' }).click();
    await page.getByTestId('rename-input').fill('改名後');
    await page.getByTestId('rename-input').press('Enter');
    await expect(page.getByTestId('map-card-name').first()).toHaveText('改名後');
    await page
      .getByTestId('map-card')
      .filter({ hasText: '改名後' })
      .getByRole('button', { name: '刪除' })
      .click();
    await expect(page.getByRole('alertdialog')).toContainText(
      '要刪除「改名後」嗎？刪除後無法復原。',
    );
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(page.getByTestId('map-card-name')).toHaveText(['尖頂地圖']);
    /* 網址的 id 找不到：回到一覽並提示 */
    await page.goto(`${TOOL_URL}?id=nope`);
    await expect(page.getByTestId('map-list')).toBeVisible();
    await expect(page.getByText('找不到這張地圖').first()).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    expect(errors).toEqual([]);
  });

  test('匯出 JSON、讀取 JSON（新版、舊版、專案檔格式、無效的檔案）', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page, { name: 'A/B:C' });
    await tool(page, 'rect').click();
    await clickAt(page, 0, 0);
    await clickAt(page, 144, 72);
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.getByRole('button', { name: '地圖一覽' }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('map-card').first().getByRole('button', { name: '匯出 JSON' }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe('A_B_C.json');
    const json = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(json.version).toBe(2);
    expect(json.cellSize).toBe(72);
    expect(json.gridType).toBe('square');
    expect(json.canvas.version).toBe('7.4.0');
    expect(json.canvas.objects).toHaveLength(1);
    expect(json.canvas.objects[0]).toMatchObject({
      type: 'Rect',
      _layerName: '矩形1',
      _isMapLayer: true,
      width: 144,
      height: 72,
    });
    expect(json.layerCounters).toEqual({ 矩形: 1 });
    expect(json.gridDashArray).toEqual([10, 5]);
    /* 讀回來 */
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '讀取 JSON' }).click();
    await (await chooser).setFiles([
      {
        name: '讀回來.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(json)),
      },
      {
        name: '舊版.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(fixture('legacy-hex-flat').data)),
      },
      {
        name: '專案檔.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({ format: 'trpg-toolkit-project', tool: 'map-editor', data: json }),
        ),
      },
      { name: '壞掉.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') },
    ]);
    await expect(page.getByText('檔案格式無效').first()).toBeVisible();
    await expect(page.getByTestId('map-card-name')).toHaveCount(4);
    await expect(page.getByTestId('map-card').filter({ hasText: '舊版' })).toContainText(
      '六角格・平頂',
    );
    await page
      .getByTestId('map-card')
      .filter({ hasText: '讀回來' })
      .getByTestId('map-card-name')
      .click();
    await ready(page);
    expect(await objects(page)).toMatchObject([{ type: 'rect', name: '矩形1', cx: 72, cy: 36 }]);
    expect(errors).toEqual([]);
  });
});

/* ================= 舊版存檔 ================= */

test.describe('舊版存檔', () => {
  const LEGACY = ['legacy-square', 'legacy-hex-flat', 'legacy-hex-pointy-fit', 'legacy-blank'];

  test('開頁時搬入舊版的地圖（只搬一次，刪掉後不再搬回）', async ({ page }) => {
    const errors = watchErrors(page);
    await blockFonts(page);
    await seedLegacy(page, LEGACY.map(fixture));
    await page.goto(TOOL_URL);
    await expect(page.getByText('已從舊版搬入 4 張地圖')).toBeVisible();
    await expect(page.getByTestId('map-card')).toHaveCount(4);
    await expect(page.getByTestId('map-card').filter({ hasText: '尖頂對齊' })).toContainText(
      '六角格・尖頂・對齊網格',
    );
    /* 縮圖照舊 */
    await expect(
      page.getByTestId('map-card').filter({ hasText: '方格夾具' }).locator('img'),
    ).toHaveAttribute('src', /^data:image\/png/);
    await page
      .getByTestId('map-card')
      .filter({ hasText: '空白地圖' })
      .getByRole('button', { name: '刪除' })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(page.getByTestId('map-card')).toHaveCount(3);
    await page.reload();
    await expect(page.getByTestId('map-card')).toHaveCount(3);
    await expect(page.getByText('已從舊版搬入')).toHaveCount(0);
    /* 舊版的資料不改不刪 */
    const legacyCount = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const r = indexedDB.open('trpg-mapper', 1);
          r.onsuccess = () => {
            const q = r.result.transaction('maps').objectStore('maps').count();
            q.onsuccess = () => resolve(q.result);
          };
        }),
    );
    expect(legacyCount).toBe(4);
    expect(errors).toEqual([]);
  });

  test('方格夾具：物件、名稱、格子圖層；匯出與舊版的匯出圖相同（容許文字與反鋸齒）', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await blockFonts(page);
    const rec = fixture('legacy-square');
    await seedLegacy(page, [rec]);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('map-card')).toHaveCount(1);
    await page.goto(`${TOOL_URL}?id=${rec.id}`);
    await ready(page);
    expect(await names(page)).toEqual([
      '改名的矩形',
      '橢圓2',
      '直線1',
      '直線2',
      '折線1',
      '折線2',
      '聯集1',
      '曲線1',
      '封閉曲線1',
      '格子1',
      '地面_矩形1',
      '地面_格子1',
      '地面_矩形2',
      '牆_矩形1',
      '牆_折線1',
      '牆_直線1',
      '互斥_房間1',
      '裝飾_床1',
      '裝飾_學校1',
      '裝飾_star1',
      '手繪1',
      '文字1',
      '圖片1',
      '群組1',
    ]);
    await page.waitForTimeout(800);
    const diff = await compareWithLegacy(
      page,
      'legacy-square',
      { x: 0, y: 0, w: 17 * 72, h: 15 * 72 },
      'white',
    );
    expect(diff.size).toEqual([1224, 1080, 1224, 1080]);
    expect(diff.mean).toBeLessThan(0.3);
    expect(diff.bigRatio).toBeLessThan(0.002);
    expect(errors).toEqual([]);
  });

  for (const name of ['legacy-hex-flat', 'legacy-hex-pointy-fit']) {
    test(`${name}：格子的位置與舊版相同`, async ({ page }) => {
      const errors = watchErrors(page);
      await blockFonts(page);
      const rec = fixture(name);
      await seedLegacy(page, [rec]);
      await page.goto(`${TOOL_URL}?id=${rec.id}`);
      await ready(page);
      await page.waitForTimeout(500);
      const diff = await compareWithLegacy(
        page,
        name,
        { x: -50, y: -50, w: 700, h: 600 },
        'transparent',
      );
      expect(diff.mean).toBeLessThan(0.05);
      expect(diff.bigRatio).toBeLessThan(0.0005);
      expect(errors).toEqual([]);
    });
  }
});

/** 新版匯出同一個範圍，與舊版的匯出圖逐像素比較 */
async function compareWithLegacy(
  page: Page,
  name: string,
  rect: { x: number; y: number; w: number; h: number },
  background: 'white' | 'transparent',
) {
  const legacy = `data:image/png;base64,${readFileSync(path.join(FIX, `${name}-region.png`)).toString('base64')}`;
  return page.evaluate(
    async ({ rect, background, legacy }) => {
      const hook = (
        window as unknown as {
          __mapEditor: { exportPng(r: unknown, o: unknown): string };
        }
      ).__mapEditor;
      const mine = hook.exportPng(rect, { scale: 1, background, grid: true });
      const load = (src: string) =>
        new Promise<HTMLImageElement>((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = src;
        });
      const [a, b] = await Promise.all([load(legacy), load(mine)]);
      const W = Math.max(a.width, b.width);
      const H = Math.max(a.height, b.height);
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d') as CanvasRenderingContext2D;
      x.drawImage(a, 0, 0);
      const da = x.getImageData(0, 0, W, H).data;
      x.clearRect(0, 0, W, H);
      x.drawImage(b, 0, 0);
      const db = x.getImageData(0, 0, W, H).data;
      let sum = 0;
      let big = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
          Math.abs(da[i + 3] - db[i + 3]),
        );
        sum += d;
        if (d > 64) big++;
      }
      return {
        size: [a.width, a.height, b.width, b.height],
        mean: sum / (W * H),
        bigRatio: big / (W * H),
      };
    },
    { rect, background, legacy },
  );
}

/* ================= 作圖 ================= */

/** 物件的詳細（依名稱） */
async function detail(page: Page, name: string): Promise<Record<string, unknown>> {
  return page.evaluate((n) => {
    const e = (
      window as unknown as {
        __mapEditor: { engine: { canvas: { getObjects(): Record<string, unknown>[] } } };
      }
    ).__mapEditor.engine;
    const o = e.canvas.getObjects().find((x) => x._layerName === n) as Record<string, unknown> & {
      toObject(p?: string[]): Record<string, unknown>;
      getObjects?: () => Record<string, unknown>[];
    };
    if (!o) return {};
    const out = o.toObject() as Record<string, unknown>;
    out.childCount = o.getObjects ? o.getObjects().length : 0;
    out.cellCount = (o._cellData as Map<string, unknown> | undefined)?.size ?? null;
    out.fillIsPattern = !!(o.fill && typeof o.fill === 'object' && 'source' in (o.fill as object));
    out.strokeIsPattern = !!(
      o.stroke &&
      typeof o.stroke === 'object' &&
      'source' in (o.stroke as object)
    );
    out.hasControlsNow = o.hasControls;
    out.selectableNow = o.selectable;
    return JSON.parse(JSON.stringify(out));
  }, name);
}

async function previewInfo(page: Page) {
  return page.evaluate(() => {
    const e = (
      window as unknown as {
        __mapEditor: { engine: { canvas: { getObjects(): Record<string, unknown>[] } } };
      }
    ).__mapEditor.engine;
    const p = e.canvas.getObjects().filter((o) => o.isPreview);
    return {
      count: p.length,
      texts: p.filter((o) => typeof o.text === 'string').map((o) => String(o.text)),
    };
  });
}

async function setNumber(page: Page, label: string, value: number | string, scope?: Locator) {
  const box = (scope ?? page).getByRole('spinbutton', { name: label, exact: true }).first();
  await box.fill(String(value));
  await box.press('Enter');
}

test.describe('作圖', () => {
  test('矩形：點兩下、拖曳、吸附、Shift 不吸附、太小不建立、測量顯示、復原／重做', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('r');
    await expect(tool(page, 'rect')).toHaveAttribute('aria-pressed', 'true');
    await clickAt(page, 3, -4);
    await moveTo(page, 140, 70);
    /* 預覽：寬 2 格、高 1 格的寸法線 */
    await expect.poll(async () => (await previewInfo(page)).texts.sort()).toEqual(['1', '2']);
    await clickAt(page, 146, 70);
    expect(await objects(page)).toMatchObject([
      { type: 'rect', name: '矩形1', cx: 72, cy: 36, w: 144, h: 72 },
    ]);
    expect((await previewInfo(page)).count).toBe(0);
    await expect(statusMsg(page)).toHaveText('新增 矩形');
    expect(await detail(page, '矩形1')).toMatchObject({
      fill: 'rgba(74,144,196,1)',
      stroke: 'rgba(0,0,0,1)',
      strokeWidth: 4,
      rx: 0,
      strokeLineJoin: 'miter',
      strokeLineCap: 'butt',
    });
    /* 拖曳 */
    await dragWorld(page, [216, 0], [288, 144]);
    expect((await objects(page))[1]).toMatchObject({
      name: '矩形2',
      cx: 252,
      cy: 72,
      w: 72,
      h: 144,
    });
    /* Shift：不吸附 */
    await page.keyboard.down('Shift');
    await clickAt(page, 5, 150);
    await clickAt(page, 100, 205);
    await page.keyboard.up('Shift');
    const r3 = (await objects(page))[2];
    expect(r3.name).toBe('矩形3');
    expect(Math.abs(r3.w - 95)).toBeLessThan(1.5);
    /* 太小（≤ 2 px）不建立 */
    await clickAt(page, 360, 0);
    await clickAt(page, 360, 0);
    expect(await objects(page)).toHaveLength(3);
    /* 復原、重做 */
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await objects(page)).length).toBe(2);
    await expect(statusMsg(page)).toHaveText('復原：新增 矩形');
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(async () => (await objects(page)).length).toBe(3);
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect.poll(async () => (await objects(page)).length).toBe(1);
    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await objects(page)).length).toBe(2);
    expect(errors).toEqual([]);
  });

  test('橢圓（外框、中心→半徑）、直線（長度 0 不建立）', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('e');
    await clickAt(page, 0, 0);
    await clickAt(page, 144, 72);
    expect(await detail(page, '橢圓1')).toMatchObject({ type: 'Ellipse', rx: 72, ry: 36 });
    await page.getByRole('radio', { name: '中心→半徑' }).click();
    await clickAt(page, 216, 216);
    await moveTo(page, 250, 216);
    await expect.poll(async () => (await previewInfo(page)).texts).toContain('r 0.5');
    await clickAt(page, 252, 216);
    expect((await objects(page))[1]).toMatchObject({
      name: '橢圓2',
      cx: 216,
      cy: 216,
      w: 72,
      h: 72,
    });
    await page.keyboard.press('l');
    await clickAt(page, 0, 144);
    await moveTo(page, 140, 144);
    await expect.poll(async () => (await previewInfo(page)).texts).toContain('2 格 ∠0°');
    await clickAt(page, 144, 144);
    expect(await detail(page, '直線1')).toMatchObject({
      type: 'Line',
      x1: -72,
      x2: 72,
      y1: 0,
      y2: 0,
    });
    expect((await objects(page))[2]).toMatchObject({ cx: 72, cy: 144 });
    await clickAt(page, 0, 288);
    await clickAt(page, 0, 288);
    expect(await objects(page)).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  test('折線、多邊形（圓角）、曲線、封閉曲線：Enter／確定完成、Esc 取消', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('p');
    await clickAt(page, -288, -216);
    const bar = page.getByTestId('finish-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: '確定' })).toBeDisabled();
    await clickAt(page, -216, -216);
    await clickAt(page, -216, -144);
    await page.keyboard.press('Enter');
    await expect(bar).toHaveCount(0);
    expect(await detail(page, '折線1')).toMatchObject({ type: 'Polyline', fill: '' });
    /* Esc：取消 */
    await clickAt(page, -288, -72);
    await clickAt(page, -216, -72);
    await page.keyboard.press('Escape');
    expect(await objects(page)).toHaveLength(1);
    /* 多邊形：確定按鈕 */
    await page.keyboard.press('g');
    await clickAt(page, -144, -216);
    await clickAt(page, 0, -216);
    await clickAt(page, 0, -72);
    await bar.getByRole('button', { name: '確定' }).click();
    const poly = await detail(page, '多邊形1');
    expect(poly.type).toBe('Polygon');
    expect(poly.points).toHaveLength(3);
    /* 圓角：變成路徑 */
    await setNumber(page, '圓角', 10);
    await clickAt(page, 72, -216);
    await clickAt(page, 216, -216);
    await clickAt(page, 216, -72);
    await page.keyboard.press('Enter');
    const rounded = await detail(page, '多邊形2');
    expect(rounded.type).toBe('Path');
    expect(JSON.stringify(rounded.path)).toContain('"Q"');
    /* 曲線、封閉曲線 */
    await page.keyboard.press('c');
    await clickAt(page, -288, 144);
    await clickAt(page, -216, 72);
    await clickAt(page, -144, 144);
    await page.keyboard.press('Enter');
    expect(await detail(page, '曲線1')).toMatchObject({ type: 'Path', fill: '' });
    await page.keyboard.press('Shift+c');
    await expect(tool(page, 'curve-closed')).toHaveAttribute('aria-pressed', 'true');
    await clickAt(page, 72, 72);
    await clickAt(page, 216, 72);
    await clickAt(page, 144, 216);
    await page.keyboard.press('Enter');
    const closed = await detail(page, '封閉曲線1');
    expect(closed.type).toBe('Path');
    expect(String(closed.fill)).toContain('rgba(74,144,196');
    expect(errors).toEqual([]);
  });
});

/* ================= 格子、地面、牆壁、房間、圖樣、裝飾、手繪、文字、圖片 ================= */

const PNG_FILE = () => readFileSync(path.join(FIX, 'legacy-hex-flat-region.png'));

async function setColor(page: Page, label: string, hex: string) {
  const box = page.getByRole('textbox', { name: label, exact: true }).first();
  await box.fill(hex);
  await box.press('Enter');
}

async function pickOption(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).first().click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('地圖工具', () => {
  test('格子：畫筆（拖曳、同色合併）、換色、橡皮擦、填滿（範圍外、空的圖層）、新增圖層', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('b');
    await clickAt(page, 36, 36);
    expect(await names(page)).toEqual(['格子1']);
    await dragWorld(page, [36, 108], [180, 108], 8);
    let cell = await detail(page, '格子1');
    expect(cell.cellCount).toBe(4);
    expect(cell.childCount).toBe(1);
    await expect(statusMsg(page)).toHaveText('格子填色');
    await setColor(page, '填色', '#ff0000ff');
    await clickAt(page, 36, 180);
    cell = await detail(page, '格子1');
    expect(cell.cellCount).toBe(5);
    expect(cell.childCount).toBe(2);
    await page.getByRole('radio', { name: '橡皮擦' }).click();
    await clickAt(page, 36, 36);
    expect((await detail(page, '格子1')).cellCount).toBe(4);
    await page.getByRole('radio', { name: '填滿' }).click();
    await clickAt(page, 300, 200);
    await expect(statusMsg(page)).toHaveText('超出格子圖層的範圍');
    /* 外接框是第 0～2 欄、第 1～2 列：第 2 列空的兩格相連 */
    await clickAt(page, 108, 180);
    await expect(statusMsg(page)).toHaveText('填滿（2 格）');
    expect((await detail(page, '格子1')).cellCount).toBe(6);
    await page.getByRole('button', { name: '新增格子圖層' }).click();
    expect(await names(page)).toEqual(['格子1', '格子2']);
    await clickAt(page, 108, 36);
    await expect(statusMsg(page)).toHaveText('格子圖層是空的');
    /* 存檔後重新開啟：格子由 _cellEntries 重建 */
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.reload();
    await ready(page);
    expect((await detail(page, '格子1')).cellCount).toBe(6);
    expect(errors).toEqual([]);
  });

  test('地面（格子、矩形；疊在地面的最上面）、牆壁（厚度、陰影）、房間（地面＋牆）', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await tool(page, 'ground').click();
    await clickAt(page, 36, 36);
    expect(await names(page)).toEqual(['地面_格子1']);
    await pickOption(page, '形狀', '矩形');
    await clickAt(page, 0, 72);
    await clickAt(page, 144, 144);
    expect(await detail(page, '地面_矩形1')).toMatchObject({
      fill: '#ffffff',
      strokeWidth: 0,
      _isGroundLayer: true,
    });
    await page.keyboard.press('r');
    await clickAt(page, -144, -144);
    await clickAt(page, -72, -72);
    await tool(page, 'ground').click();
    await clickAt(page, 0, -144);
    await clickAt(page, 72, -72);
    expect(await names(page)).toEqual(['地面_格子1', '地面_矩形1', '地面_矩形2', '矩形1']);
    /* 牆壁 */
    await tool(page, 'wall').click();
    await setNumber(page, '牆壁厚度', 20);
    await clickAt(page, -216, 0);
    await clickAt(page, -144, 144);
    const wall = await detail(page, '牆_矩形1');
    expect(wall).toMatchObject({
      strokeWidth: 20,
      fill: '',
      stroke: '#000000',
      _isWallLayer: true,
    });
    expect(wall.shadow).toMatchObject({ color: '#0000008c', blur: 8 });
    /* 房間 */
    await tool(page, 'room').click();
    await clickAt(page, 144, 0);
    await clickAt(page, 288, 144);
    const room = await detail(page, '房間_矩形1');
    expect(room).toMatchObject({ type: 'Group', _isRoomGroup: true, childCount: 2 });
    const kids = room.objects as Record<string, unknown>[];
    expect(kids[0]).toMatchObject({ _isRoomGround: true, strokeWidth: 0 });
    expect(kids[1]).toMatchObject({ _isRoomWall: true, strokeWidth: 12, fill: '' });
    expect(errors).toEqual([]);
  });

  test('自訂圖樣：上傳、用在地面（矩形、格子）與牆壁、刪除後選擇改回單色、畫好的物件重新開啟後也不變', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await tool(page, 'ground').click();
    await pickOption(page, '形狀', '矩形');
    await expect(page.getByText('沒有內建圖樣。請按「＋」上傳自己的圖片來當圖樣。')).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('ground-pattern').getByTestId('pattern-add').click();
    await (await chooser).setFiles({ name: '石板.png', mimeType: 'image/png', buffer: PNG_FILE() });
    const tile = page
      .getByTestId('ground-pattern')
      .getByRole('button', { name: '石板', exact: true });
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
    await clickAt(page, 0, 0);
    await clickAt(page, 144, 144);
    const g = await detail(page, '地面_矩形1');
    expect(g.fillIsPattern).toBe(true);
    expect((g._patternState as { mode: string }).mode).toBe('pattern');
    expect(g._patternScale).toBe(0.5);
    /* 格子形狀的地面也用這個圖樣 */
    await pickOption(page, '形狀', '格子');
    await clickAt(page, 252, 36);
    const cellFill = async () =>
      ((await detail(page, '地面_格子1')).objects as { fill: unknown }[] | undefined)?.[0]?.fill;
    expect(await cellFill()).toMatchObject({ type: 'pattern' });
    /* 太大的檔案 */
    const big = page.waitForEvent('filechooser');
    await page.getByTestId('ground-pattern').getByTestId('pattern-add').click();
    await (await big).setFiles({
      name: 'big.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(4 * 1024 * 1024 + 10),
    });
    await expect(statusMsg(page)).toHaveText('檔案太大（上限 4 MB）');
    /* 牆壁也能用 */
    await tool(page, 'wall').click();
    await page
      .getByTestId('wall-pattern')
      .getByRole('button', { name: '石板', exact: true })
      .click();
    await clickAt(page, -216, -144);
    await clickAt(page, -72, 0);
    expect((await detail(page, '牆_矩形1')).strokeIsPattern).toBe(true);
    /* 刪除：確認後選擇改回單色、畫好的物件不變 */
    await page
      .getByTestId('wall-pattern')
      .getByRole('button', { name: '石板', exact: true })
      .hover();
    await page
      .getByTestId('wall-pattern')
      .getByRole('button', { name: '刪除圖樣「石板」' })
      .click();
    await expect(page.getByRole('alertdialog')).toContainText('已經畫好的物件不受影響');
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(
      page.getByTestId('wall-pattern').getByRole('button', { name: '單色' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect((await detail(page, '牆_矩形1')).strokeIsPattern).toBe(true);
    expect(await cellFill()).toMatchObject({ type: 'pattern' });
    /* 重新開啟後也不變：圖片存在物件裡（F113；舊版重新開啟時會改成單色） */
    await page.keyboard.press('Control+s');
    await expect(page.getByRole('status').filter({ hasText: /^已儲存$/ })).toBeVisible();
    await page.reload();
    await ready(page);
    const g2 = await detail(page, '地面_矩形1');
    expect(g2.fillIsPattern).toBe(true);
    expect((g2._patternState as { mode: string }).mode).toBe('pattern');
    const w2 = await detail(page, '牆_矩形1');
    expect(w2.strokeIsPattern).toBe(true);
    expect((w2._patternState as { mode: string }).mode).toBe('pattern');
    expect(await cellFill()).toMatchObject({ type: 'pattern' });
    /* 圖樣清單不再列出刪掉的圖樣 */
    await tool(page, 'ground').click();
    await expect(
      page.getByTestId('ground-pattern').getByRole('button', { name: '石板', exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('裝飾：沒選時提示、預覽、放置（大小一格）、R 旋轉、翻轉、改色、大小', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await tool(page, 'decor').click();
    await clickAt(page, 36, 36);
    await expect(statusMsg(page)).toHaveText('請選擇裝飾');
    await page.locator('[data-decor="bed"]').click();
    await moveTo(page, 30, 40);
    await expect.poll(async () => (await previewInfo(page)).count).toBeGreaterThan(0);
    await clickAt(page, 36, 36);
    await expect.poll(() => names(page)).toEqual(['裝飾_床1']);
    const bed = (await objects(page))[0];
    expect(bed).toMatchObject({ name: '裝飾_床1', cx: 36, cy: 36 });
    expect(Math.max(bed.w, bed.h)).toBeCloseTo(72, 0);
    await page.keyboard.press('r');
    await expect(page.getByRole('spinbutton', { name: '旋轉', exact: true })).toHaveValue('30');
    await page.getByRole('button', { name: '水平' }).click();
    await clickAt(page, 180, 36);
    await expect.poll(() => names(page)).toContain('裝飾_床2');
    const d2 = await detail(page, '裝飾_床2');
    expect(d2.angle).toBe(30);
    /* 負的縮放：Fabric 換成 flipX（舊版亦同） */
    expect(d2.flipX).toBe(true);
    expect(d2._decorFlipX).toBe(true);
    /* 改色（SVG）、大小 200% */
    await page.locator('[data-decor="jp-school"]').click();
    await setNumber(page, '大小', 200);
    await setColor(page, '填色', '#ff0000ff');
    await clickAt(page, 36, 180);
    /* 放置是非同步的（第一次用的圖章要先載入 SVG） */
    await expect.poll(() => names(page)).toContain('裝飾_學校1');
    const sc = await detail(page, '裝飾_學校1');
    expect(String(sc._decorFill).slice(0, 7)).toBe('#ff0000');
    expect(sc._decorScale).toBe(2);
    expect(errors).toEqual([]);
  });

  test('手繪：畫筆、橡皮擦、手繪圖層', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('d');
    await dragWorld(page, [-100, -100], [100, 50], 12);
    await expect.poll(async () => (await detail(page, '手繪1')).childCount).toBe(1);
    await expect(statusMsg(page)).toHaveText('新增手繪');
    await page.getByRole('radio', { name: '橡皮擦' }).click();
    await dragWorld(page, [-100, 50], [100, -100], 12);
    const layer = await detail(page, '手繪1');
    expect(layer.childCount).toBe(2);
    expect((layer.objects as Record<string, unknown>[])[1].globalCompositeOperation).toBe(
      'destination-out',
    );
    await expect(statusMsg(page)).toHaveText('橡皮擦');
    await page.getByRole('button', { name: '新增手繪圖層' }).click();
    await page.getByRole('radio', { name: '畫筆' }).click();
    await dragWorld(page, [-200, 0], [-150, 100], 8);
    expect(await names(page)).toEqual(['手繪1', '手繪2']);
    expect((await detail(page, '手繪2')).childCount).toBe(1);
    expect(errors).toEqual([]);
  });

  test('文字：新增、Ctrl＋B、空白的文字刪掉；圖片：選檔放在原點', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('t');
    await clickAt(page, 0, 0);
    await page.keyboard.type('地圖');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Escape');
    const t = await detail(page, '文字1');
    expect(t).toMatchObject({
      type: 'IText',
      text: '地圖',
      fontFamily: 'Noto Sans TC',
      fontSize: 48,
      fontWeight: 'bold',
    });
    await expect(statusMsg(page)).toHaveText('新增 文字');
    /* 點空白處開始輸入、什麼都沒打就離開：刪掉 */
    await clickAt(page, 0, 200);
    await expect.poll(async () => names(page)).toEqual(['文字1', '文字2']);
    await page.keyboard.press('Escape');
    await expect.poll(async () => names(page)).toEqual(['文字1']);
    /* 圖片 */
    await page.keyboard.press('Escape');
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('i');
    await (await chooser).setFiles({ name: 'map.png', mimeType: 'image/png', buffer: PNG_FILE() });
    await expect.poll(async () => names(page)).toEqual(['文字1', '圖片1']);
    const img = await detail(page, '圖片1');
    expect(img).toMatchObject({
      type: 'Image',
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      width: 700,
      height: 600,
    });
    expect(errors).toEqual([]);
  });
});

/* ================= 選取、動作列、圖層 ================= */

async function drawRect(page: Page, a: [number, number], b: [number, number]) {
  await page.keyboard.press('Escape');
  await tool(page, 'rect').click();
  await clickAt(page, ...a);
  await clickAt(page, ...b);
}

async function selectedNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const e = (
      window as unknown as {
        __mapEditor: { engine: { canvas: { getActiveObjects(): Record<string, unknown>[] } } };
      }
    ).__mapEditor.engine;
    return e.canvas.getActiveObjects().map((o) => String(o._layerName));
  });
}

test.describe('選取與圖層', () => {
  test('選取資訊、X／Y、方向鍵、R 旋轉、填色與描邊、線型、陰影、不透明度、混合模式', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await drawRect(page, [0, 0], [144, 72]);
    await page.keyboard.press('v');
    await expect(page.getByTestId('sel-none')).toHaveText('請選取物件');
    await clickAt(page, 72, 36);
    const panel = page.getByTestId('select-panel');
    await expect(panel).toContainText('矩形1');
    await expect(panel.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('-2');
    await expect(panel).toContainText('144');
    await expect(page.getByTestId('action-bar')).toBeVisible();
    await setNumber(page, 'X', 100, panel);
    await expect.poll(async () => (await objects(page))[0].cx).toBe(174);
    await expect(statusMsg(page)).toHaveText('變更 矩形1 的 X');
    /* 欄位還有焦點時方向鍵給欄位；離開欄位後才是微調 */
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(async () => (await objects(page))[0]).toMatchObject({ cx: 175, cy: 46 });
    await page.keyboard.press('r');
    expect((await detail(page, '矩形1')).angle).toBe(30);
    await page.keyboard.press('Shift+r');
    expect((await detail(page, '矩形1')).angle).toBe(0);
    /* 樣式：填色、描邊、線寬、線型 */
    await setColor(page, '填色', '#00ff00');
    await setNumber(page, '線寬', 8, panel);
    await pickOption(page, '線型', '虛線');
    const r = await detail(page, '矩形1');
    expect(r).toMatchObject({ fill: 'rgba(0,255,0,1)', strokeWidth: 8, strokeDashArray: [40, 24] });
    /* 陰影 */
    await panel.getByRole('button', { name: '陰影' }).click();
    await panel.getByRole('switch', { name: '加上陰影' }).click();
    expect((await detail(page, '矩形1')).shadow).toMatchObject({ color: '#0000008c', blur: 8 });
    /* 不透明度、混合模式（圖層面板） */
    const layers = page.getByTestId('layers-panel');
    await setNumber(page, '不透明度', 50, layers);
    await pickOption(page, '混合模式', '色彩增值');
    expect(await detail(page, '矩形1')).toMatchObject({
      opacity: 0.5,
      globalCompositeOperation: 'multiply',
    });
    /* 存檔後重新開啟：樣式保留 */
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.reload();
    await ready(page);
    expect(await detail(page, '矩形1')).toMatchObject({
      opacity: 0.5,
      globalCompositeOperation: 'multiply',
      strokeDashArray: [40, 24],
    });
    expect(errors).toEqual([]);
  });

  test('動作列：複製、隱藏、鎖定、上下層、刪除；群組、解散；布林運算', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await drawRect(page, [0, 0], [144, 144]);
    await drawRect(page, [72, 72], [216, 216]);
    await page.keyboard.press('v');
    await clickAt(page, 20, 20);
    await action(page, 'duplicate').click();
    expect(await names(page)).toEqual(['矩形1', '矩形1 副本1', '矩形2']);
    expect((await objects(page))[1]).toMatchObject({ cx: 108, cy: 108 });
    expect(await selectedNames(page)).toEqual(['矩形1 副本1']);
    await expect(statusMsg(page)).toHaveText('複製');
    /* 隱藏：取消選取 */
    await action(page, 'visibility').click();
    expect((await detail(page, '矩形1 副本1')).visible).toBe(false);
    expect(await selectedNames(page)).toEqual([]);
    /* 鎖定：沒有控制點；圖層面板的鎖頭解除 */
    await layerRow(page, '矩形2').click();
    await action(page, 'lock').click();
    expect(await detail(page, '矩形2')).toMatchObject({ lockMovementX: true, hasControls: false });
    await layerRow(page, '矩形2').getByTestId('layer-lock').click();
    expect(await detail(page, '矩形2')).toMatchObject({ lockMovementX: false, hasControls: true });
    await expect(statusMsg(page)).toHaveText('解除鎖定 矩形2');
    /* 上下層 */
    await layerRow(page, '矩形1').click();
    await action(page, 'front').click();
    expect(await names(page)).toEqual(['矩形1 副本1', '矩形2', '矩形1']);
    await action(page, 'back').click();
    expect(await names(page)).toEqual(['矩形1', '矩形1 副本1', '矩形2']);
    /* 刪除 */
    await layerRow(page, '矩形1 副本1').click();
    await page.keyboard.press('Delete');
    expect(await names(page)).toEqual(['矩形1', '矩形2']);
    await expect(statusMsg(page)).toHaveText('刪除 矩形1 副本1');
    /* 群組：Ctrl＋G 只選一個時提示 */
    await layerRow(page, '矩形1').click();
    await page.keyboard.press('Control+g');
    await expect(statusMsg(page)).toHaveText('請選取 2 個以上');
    await page.keyboard.press('Control+Shift+g');
    await expect(statusMsg(page)).toHaveText('請選取群組');
    await layerRow(page, '矩形2').click({ modifiers: ['Control'] });
    expect((await selectedNames(page)).sort()).toEqual(['矩形1', '矩形2']);
    await expect(
      page.locator('[data-testid="action-bar"] [data-action="bool-union"]'),
    ).toBeVisible();
    await action(page, 'group').click();
    expect(await names(page)).toEqual(['群組1']);
    expect((await detail(page, '群組1')).childCount).toBe(2);
    await action(page, 'ungroup').click();
    expect(await names(page)).toEqual(['矩形1', '矩形2']);
    expect((await objects(page))[0]).toMatchObject({ cx: 72, cy: 72 });
    /* 布林運算：聯集 → 一個路徑（第一個的樣式、位置） */
    await action(page, 'bool-union').click();
    expect(await names(page)).toEqual(['聯集1']);
    const u = await detail(page, '聯集1');
    expect(u).toMatchObject({ type: 'Path', fillRule: 'evenodd', fill: 'rgba(74,144,196,1)' });
    await expect(statusMsg(page)).toHaveText('布林運算：聯集');
    expect(errors).toEqual([]);
  });

  test('布林運算：差集、房間、不同類不能運算；格子圖層不能群組', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await tool(page, 'room').click();
    await clickAt(page, 0, 0);
    await clickAt(page, 144, 144);
    await clickAt(page, 72, 72);
    await clickAt(page, 216, 216);
    await page.keyboard.press('v');
    await clickAt(page, 20, 20);
    await clickAt(page, 200, 200, { modifiers: ['Shift'] });
    await action(page, 'bool-xor').click();
    expect(await names(page)).toEqual(['互斥_房間1']);
    expect(await detail(page, '互斥_房間1')).toMatchObject({ _isRoomGroup: true, childCount: 2 });
    await expect(statusMsg(page)).toHaveText('房間布林運算：互斥');
    /* 一般圖形＋房間：不同類，沒有布林運算列 */
    await drawRect(page, [-216, -216], [-72, -72]);
    await page.keyboard.press('v');
    await clickAt(page, -144, -144);
    await clickAt(page, 20, 20, { modifiers: ['Shift'] });
    expect((await selectedNames(page)).length).toBe(2);
    await expect(action(page, 'group')).toBeVisible();
    await expect(page.locator('[data-action="bool-union"]')).toHaveCount(0);
    /* 差集：第一個減掉其餘 */
    await drawRect(page, [-216, 72], [-72, 216]);
    await drawRect(page, [-144, 72], [0, 216]);
    await page.keyboard.press('v');
    await clickAt(page, -200, 144);
    await clickAt(page, -20, 144, { modifiers: ['Shift'] });
    await action(page, 'bool-difference').click();
    const d = (await objects(page)).find((o) => o.name === '差集1');
    expect(d).toMatchObject({ type: 'path', w: 72, h: 144, cx: -180, cy: 144 });
    /* 格子圖層不能群組 */
    await page.keyboard.press('b');
    await clickAt(page, 252, -180);
    await page.keyboard.press('v');
    await layerRow(page, '格子1').click();
    await layerRow(page, '差集1').click({ modifiers: ['Control'] });
    await page.keyboard.press('Control+g');
    await expect(statusMsg(page)).toHaveText('格子／手繪圖層無法群組');
    expect(errors).toEqual([]);
  });

  test('右鍵選單、圖層面板（Shift 範圍、改名、顯示、拖曳排序、鍵盤、新增圖層、空白處取消）', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await drawRect(page, [0, 0], [72, 72]);
    await drawRect(page, [144, 0], [216, 72]);
    await drawRect(page, [0, 144], [72, 216]);
    await page.keyboard.press('v');
    /* 空白處按右鍵：沒有選單 */
    await clickAt(page, -200, -200, { button: 'right' });
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
    await clickAt(page, 36, 36, { button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      '重新命名',
      '複製',
      '移到最上層',
      '移到最下層',
      '鎖定',
      '刪除',
    ]);
    await menu.getByRole('menuitem', { name: '重新命名' }).click();
    const input = page.getByTestId('layer-rename');
    await expect(input).toBeFocused();
    await input.fill('房子');
    await input.press('Enter');
    expect(await names(page)).toEqual(['房子', '矩形2', '矩形3']);
    await expect(statusMsg(page)).toHaveText('重新命名：矩形1 → 房子');
    /* 右鍵選單的複製：半格、原物件的上一層 */
    await clickAt(page, 36, 36, { button: 'right' });
    await menu.getByRole('menuitem', { name: '複製' }).click();
    expect(await names(page)).toEqual(['房子', '房子 副本1', '矩形2', '矩形3']);
    /* 圖層面板：最上面的列是最上層 */
    const rows = page.locator('[data-testid="layers-panel"] [data-testid="layer-name"]');
    await expect(rows).toHaveText(['矩形3', '矩形2', '房子 副本1', '房子']);
    await layerRow(page, '矩形3').click();
    await layerRow(page, '房子 副本1').click({ modifiers: ['Shift'] });
    expect((await selectedNames(page)).sort()).toEqual(['房子 副本1', '矩形2', '矩形3']);
    /* 連點兩下改名、Esc 還原 */
    await layerRow(page, '矩形2').locator('[data-testid="layer-name"]').dblclick();
    await page.getByTestId('layer-rename').fill('不要');
    await page.getByTestId('layer-rename').press('Escape');
    await expect(rows).toHaveText(['矩形3', '矩形2', '房子 副本1', '房子']);
    /* 顯示／隱藏 */
    await layerRow(page, '矩形2').getByTestId('layer-eye').click();
    expect((await detail(page, '矩形2')).visible).toBe(false);
    await expect(statusMsg(page)).toHaveText('隱藏 矩形2');
    await layerRow(page, '矩形2').getByTestId('layer-eye').click();
    /* 拖曳排序：最下層拖到最上面 */
    const from = layerRow(page, '房子').locator('[data-drag-handle]');
    const to = layerRow(page, '矩形3');
    const fb = await from.boundingBox();
    const tb = await to.boundingBox();
    if (!fb || !tb) throw new Error('no box');
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + 20, tb.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect(rows).toHaveText(['房子', '矩形3', '矩形2', '房子 副本1']);
    await expect(statusMsg(page)).toHaveText('調整圖層順序');
    /* 鍵盤：↓ 選下一列、Alt＋↓ 往下移 */
    await layerRow(page, '房子').click();
    await layerRow(page, '房子').focus();
    await page.keyboard.press('ArrowDown');
    expect(await selectedNames(page)).toEqual(['矩形3']);
    await page.keyboard.press('Alt+ArrowDown');
    await expect(rows).toHaveText(['房子', '矩形2', '矩形3', '房子 副本1']);
    /* 新增圖層、點清單的空白處取消選取 */
    await page.getByTestId('layer-add').click();
    await expect(rows.first()).toHaveText('圖層1');
    await page.mouse.click(
      ...(await (async () => {
        const b = await page.getByTestId('layer-list').boundingBox();
        if (!b) throw new Error('no list');
        return [b.x + 20, b.y + b.height + 30] as [number, number];
      })()),
    );
    expect(await selectedNames(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('格子圖層：方向鍵整格移動、複製整格錯開；手繪圖層不能解散', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('b');
    await clickAt(page, 36, 36);
    await clickAt(page, 108, 36);
    await page.keyboard.press('v');
    await layerRow(page, '格子1').click();
    await page.keyboard.press('ArrowRight');
    const cells = async () =>
      page.evaluate(() => {
        const e = (
          window as unknown as {
            __mapEditor: { engine: { canvas: { getObjects(): Record<string, unknown>[] } } };
          }
        ).__mapEditor.engine;
        const o = e.canvas.getObjects().find((x) => x._layerName === '格子1') as Record<
          string,
          unknown
        >;
        return [...(o._cellData as Map<string, { col: number; row: number }>).values()]
          .map((c) => `${c.col},${c.row}`)
          .sort();
      });
    expect(await cells()).toEqual(['1,0', '2,0']);
    await action(page, 'duplicate').click();
    const copy = await page.evaluate(() => {
      const e = (
        window as unknown as {
          __mapEditor: { engine: { canvas: { getObjects(): Record<string, unknown>[] } } };
        }
      ).__mapEditor.engine;
      const o = e.canvas.getObjects().find((x) => x._layerName === '格子1 副本1') as Record<
        string,
        unknown
      >;
      return [...(o._cellData as Map<string, { col: number; row: number }>).values()]
        .map((c) => `${c.col},${c.row}`)
        .sort();
    });
    expect(copy).toEqual(['2,1', '3,1']);
    await page.keyboard.press('d');
    await dragWorld(page, [-100, -100], [-50, -50], 6);
    await page.keyboard.press('v');
    await layerRow(page, '手繪1').click();
    await page.keyboard.press('Control+Shift+g');
    await expect(statusMsg(page)).toHaveText('格子／手繪圖層無法解散');
    expect(errors).toEqual([]);
  });
});

/* ================= 匯出、地圖設定、儲存、檢視、快捷鍵、版面 ================= */

async function pickExportRegion(page: Page, a: [number, number], b: [number, number]) {
  await page.getByTestId('export-start').click();
  await expect(page.getByTestId('export-banner')).toBeVisible();
  await clickAt(page, ...a);
  await clickAt(page, ...b);
  await expect(page.getByTestId('export-dialog')).toBeVisible();
}

async function download(page: Page) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
}

const px = (img: ReturnType<typeof pngPixels>, x: number, y: number) =>
  Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

test.describe('匯出', () => {
  test('選範圍、對話框、PNG（尺寸、像素）、JPEG（白底）、SVG（不含網格）、檔名、連結', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await drawRect(page, [0, 0], [144, 144]);
    /* 太小的範圍取消 */
    await page.getByTestId('export-start').click();
    await clickAt(page, 0, 0);
    await clickAt(page, 2, 2);
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('export-banner')).toHaveCount(0);
    await pickExportRegion(page, [-72, -72], [216, 216]);
    const dlg = page.getByTestId('export-dialog');
    await expect(page.getByTestId('export-info')).toHaveText('4.0 × 4.0 格（內部：288 × 288 px）');
    await expect(page.getByTestId('export-size')).toHaveText('輸出尺寸：288 × 288 px');
    await expect(page.getByTestId('export-preview')).toBeVisible();
    await expect(dlg.getByRole('link', { name: '製作座標網格（方格）' })).toHaveAttribute(
      'href',
      `../../${outputDir(getTool('grid-maker') ?? { id: 'grid-maker', status: 'next' })}/`,
    );
    await expect(dlg.getByRole('link', { name: '製作量尺（方格）' })).toHaveAttribute(
      'href',
      `../../${outputDir(getTool('range-ruler') ?? { id: 'range-ruler', status: 'next' })}/`,
    );
    await setNumber(page, '每格解析度', 36, dlg);
    await expect(page.getByTestId('export-size')).toHaveText('輸出尺寸：144 × 144 px');
    const png = await download(page);
    expect(png.name).toBe('trpg-map_4x4.png');
    const img = pngPixels(png.bytes);
    expect([img.width, img.height]).toEqual([144, 144]);
    /* 矩形的填色（世界座標 48, 48）；範圍內沒有物件的地方透明 */
    expect(px(img, 60, 60)).toEqual([74, 144, 196, 255]);
    expect(px(img, 20, 20)[3]).toBe(0);
    /* 網格：方格的線在 36 px 的倍數上（虛線：同一條線上有畫、有空） */
    const column = Array.from({ length: 30 }, (_, y) => px(img, 36, y)[3]);
    expect(Math.max(...column)).toBeGreaterThan(0);
    expect(Math.min(...column)).toBe(0);
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    /* JPEG：背景固定白色 */
    await pickExportRegion(page, [-72, -72], [216, 216]);
    await dlg.getByRole('radio', { name: 'JPEG' }).click();
    await expect(dlg.getByRole('radio', { name: '透明' })).toBeDisabled();
    const jpg = await download(page);
    expect(jpg.name).toBe('trpg-map_4x4.jpg');
    expect([jpg.bytes[0], jpg.bytes[1]]).toEqual([0xff, 0xd8]);
    /* SVG */
    await pickExportRegion(page, [-72, -72], [216, 216]);
    await dlg.getByRole('radio', { name: 'SVG' }).click();
    await expect(dlg.getByRole('switch', { name: '含網格' })).toBeDisabled();
    const svg = await download(page);
    expect(svg.name).toBe('trpg-map_4x4.svg');
    const text = svg.bytes.toString('utf8');
    expect(text).toContain('<svg');
    expect(text).toContain('viewBox="-72 -72 288 288"');
    expect(text).toContain('<rect');
    expect(errors).toEqual([]);
  });

  test('六角格的檔名（平頂：0.5 格）', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page, { kind: '六角格' });
    await page.getByRole('tab', { name: '地圖設定' }).click();
    await page.getByRole('switch', { name: '啟用吸附' }).click();
    await page.getByTestId('export-start').click();
    await clickAt(page, 0, 0);
    await clickAt(page, 187.06, 144);
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await page.getByTestId('export-dialog').getByRole('radio', { name: 'SVG' }).click();
    expect((await download(page)).name).toBe('trpg-map_3x2.svg');
    expect(errors).toEqual([]);
  });
});

test.describe('設定、儲存、檢視', () => {
  test('地圖設定：網格的顯示與線型、吸附關閉；自動儲存關閉時只標未儲存、Ctrl＋S 儲存', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.getByRole('tab', { name: '地圖設定' }).click();
    const settings = page.getByTestId('settings-panel');
    await settings.getByRole('radio', { name: '點線' }).click();
    await setNumber(page, '粗細', 2, settings);
    await settings.getByRole('switch', { name: '顯示網格' }).click();
    const data = async () =>
      page.evaluate(() =>
        (
          window as unknown as { __mapEditor: { engine: { serialize(): Record<string, unknown> } } }
        ).__mapEditor.engine.serialize(),
      );
    expect(await data()).toMatchObject({
      gridVisible: false,
      gridLineWidth: 2,
      gridDashArray: [2, 4],
    });
    await saved(page);
    /* 吸附關閉 */
    await settings.getByRole('switch', { name: '啟用吸附' }).click();
    await expect(settings.getByRole('checkbox', { name: '交點（格點）' })).toBeDisabled();
    await drawRect(page, [5, 5], [100, 100]);
    expect(Math.abs((await objects(page))[0].w - 95)).toBeLessThan(1.5);
    /* 自動儲存關閉（沿用舊版的設定鍵） */
    await settings.getByRole('switch', { name: '自動儲存' }).click();
    expect(await page.evaluate(() => localStorage.getItem('trpg_autoSaveEnabled'))).toBe('false');
    await drawRect(page, [-200, -200], [-100, -100]);
    await expect(page.getByTestId('save-status')).toHaveText('未儲存');
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('save-status')).toHaveText('未儲存');
    await page.keyboard.press('Control+s');
    await expect(page.getByTestId('save-status')).toHaveText('已儲存');
    /* 有未儲存的修改時離開頁面：瀏覽器詢問 */
    await drawRect(page, [-200, 100], [-100, 200]);
    let asked = false;
    page.once('dialog', async (d) => {
      asked = d.type() === 'beforeunload';
      await d.accept();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => asked).toBe(true);
    expect(errors).toEqual([]);
  });

  test('自動儲存與重新開啟（檢視、物件）、一覽的縮圖；縮放按鈕、滾輪、空白鍵平移', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.getByRole('button', { name: '放大' }).click();
    await expect(page.getByTestId('status-zoom')).toHaveText('125%');
    await drawRect(page, [0, 0], [72, 72]);
    await saved(page);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('status-zoom')).toHaveText('125%');
    expect(await names(page)).toEqual(['矩形1']);
    await page.getByRole('button', { name: '重設檢視' }).click();
    await expect(page.getByTestId('status-zoom')).toHaveText('100%');
    /* 滾輪：以游標為中心 */
    const c = await toClient(page, 0, 0);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -500);
    await expect(page.getByTestId('status-zoom')).toHaveText(`${Math.round(0.999 ** -500 * 100)}%`);
    const after = await toClient(page, 0, 0);
    expect(Math.abs(after.x - c.x)).toBeLessThan(1);
    /* 空白鍵＋拖曳平移（剛按過的按鈕不會被空白鍵按下去） */
    await page.getByRole('button', { name: '重設檢視' }).click();
    const before = await toClient(page, 0, 0);
    await page.mouse.move(before.x, before.y);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(before.x + 50, before.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const moved = await toClient(page, 0, 0);
    expect([Math.round(moved.x - before.x), Math.round(moved.y - before.y)]).toEqual([50, 30]);
    expect(await names(page)).toEqual(['矩形1']);
    /* 一覽的縮圖 */
    await page.getByRole('button', { name: '地圖一覽' }).click();
    const thumb = page.getByTestId('map-card').first().locator('img');
    await expect(thumb).toHaveAttribute('src', /^data:image\/png/);
    const size = await thumb.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight]);
    expect(size[0]).toBeLessThanOrEqual(400);
    expect(size[1]).toBeLessThanOrEqual(250);
    expect(errors).toEqual([]);
  });

  test('快捷鍵：工具、？說明；編輯列的名稱重新命名', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page, { name: '快捷鍵' });
    for (const [key, id] of [
      ['b', 'cell'],
      ['e', 'ellipse'],
      ['l', 'line'],
      ['p', 'path'],
      ['g', 'polygon'],
      ['c', 'curve'],
      ['d', 'freehand'],
      ['t', 'text'],
      ['r', 'rect'],
      ['v', 'select'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(tool(page, id)).toHaveAttribute('aria-pressed', 'true');
    }
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog')).toContainText('復原');
    await page.keyboard.press('Escape');
    await page.getByTestId('map-name').click();
    await page.getByTestId('rename-input').fill('新名字');
    await page.getByTestId('rename-input').press('Enter');
    await expect(page.getByTestId('map-name')).toHaveText('新名字');
    await expect(page).toHaveTitle('新名字｜地圖編輯器｜TRPG Toolkit');
    await page.getByRole('button', { name: '地圖一覽' }).click();
    await expect(page.getByTestId('map-card-name')).toHaveText(['新名字']);
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  test('視覺回歸：1280 寬（一覽、編輯中）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = watchErrors(page);
    await blockFonts(page);
    const recs = ['legacy-square', 'legacy-hex-flat'].map(fixture);
    await seedLegacy(page, recs);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('map-card')).toHaveCount(2);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('map-editor-list-1280.png', { fullPage: true });
    await page
      .getByTestId('map-card')
      .filter({ hasText: '方格夾具' })
      .getByTestId('map-card-name')
      .click();
    await ready(page);
    await page.waitForTimeout(800);
    await page.keyboard.press('v');
    await clickAt(page, 72, 36);
    await page.mouse.move(0, 0);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('map-editor-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動；觸控兩指縮放', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      locale: 'zh-TW',
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    const errors = watchErrors(page);
    await blockFonts(page);
    await seedLegacy(page, [fixture('legacy-square')]);
    await page.goto(TOOL_URL);
    await expect(page.getByTestId('map-card')).toHaveCount(1);
    await noHorizontalScroll(page);
    await page.getByTestId('map-card-name').click();
    await ready(page);
    await page.waitForTimeout(800);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('map-editor-390.png', { fullPage: true });
    /* 兩指：以中點為中心縮放 */
    const z0 = await page.getByTestId('status-zoom').textContent();
    const box = await page.getByTestId('map-canvas').boundingBox();
    if (!box) throw new Error('no canvas');
    const cdp = await context.newCDPSession(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const touch = (d: number) => [
      { x: cx - d, y: cy },
      { x: cx + d, y: cy },
    ];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(40) });
    for (const d of [50, 60, 70, 80])
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('status-zoom')).not.toHaveText(z0 ?? '');
    expect(await names(page)).toHaveLength(24);
    expect(errors).toEqual([]);
    await context.close();
  });
});

/* ================= 其他 ================= */

/** 用 DataTransfer 把檔案拖放到視窗的某個位置（WindowDrop） */
async function dropFile(
  page: Page,
  file: { name: string; type: string; buffer: Buffer },
  at: { x: number; y: number },
) {
  await page.evaluate(
    ({ name, type, b64, x, y }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      const init = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y };
      window.dispatchEvent(new DragEvent('dragenter', init));
      window.dispatchEvent(new DragEvent('dragover', init));
      window.dispatchEvent(new DragEvent('drop', init));
    },
    { name: file.name, type: file.type, b64: file.buffer.toString('base64'), ...at },
  );
}

test.describe('其他', () => {
  test('自訂裝飾（SVG 去掉 script）、圖片拖進畫布、文字的字型、跟著地圖儲存的設定', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await tool(page, 'decor').click();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><rect width="10" height="5" fill="#123456"/></svg>',
    );
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('decor-add').click();
    await (await chooser).setFiles({ name: '箱子.svg', mimeType: 'image/svg+xml', buffer: svg });
    await expect(page.getByRole('radio', { name: '自訂' })).toBeVisible();
    const raw = await page.evaluate(() => {
      const e = (
        window as unknown as {
          __mapEditor: { engine: { serialize(): { userDecors: { rawSvg: string }[] } } };
        }
      ).__mapEditor.engine;
      return e.serialize().userDecors[0].rawSvg;
    });
    expect(raw).not.toContain('script');
    expect(raw).not.toContain('onload');
    await expect(page.getByText('改色（只有 SVG）')).toBeVisible();
    await clickAt(page, 36, 36);
    await expect.poll(async () => names(page)).toEqual(['裝飾_箱子1']);
    expect(Math.round((await objects(page))[0].w)).toBe(72);
    /* 圖片拖進畫布：放在放開的位置（中心） */
    const at = await toClient(page, 144, 144);
    await dropFile(page, { name: 'pic.png', type: 'image/png', buffer: PNG_FILE() }, at);
    await expect.poll(async () => names(page)).toEqual(['裝飾_箱子1', '圖片1']);
    expect((await objects(page))[1]).toMatchObject({ cx: 144, cy: 144 });
    /* 文字的字型 */
    await page.keyboard.press('t');
    await pickOption(page, '字型', 'Klee One');
    await clickAt(page, -200, -100);
    await page.keyboard.type('A');
    await page.keyboard.press('Escape');
    expect(await detail(page, '文字1')).toMatchObject({ fontFamily: 'Klee One' });
    /* 跟著地圖儲存的設定：牆壁厚度 */
    await tool(page, 'wall').click();
    await setNumber(page, '牆壁厚度', 30);
    await page.keyboard.press('Control+s');
    await saved(page);
    await page.reload();
    await ready(page);
    await tool(page, 'wall').click();
    await expect(page.getByRole('spinbutton', { name: '牆壁厚度', exact: true })).toHaveValue('30');
    /* 作圖設定（所有地圖共用）：字型記住 */
    await page.keyboard.press('t');
    await expect(page.getByRole('combobox', { name: '字型', exact: true })).toContainText(
      'Klee One',
    );
    /* 另一張新地圖：牆壁厚度回到 12 */
    await page.getByRole('button', { name: '地圖一覽' }).click();
    await createMap(page, { name: '第二張' });
    await tool(page, 'wall').click();
    await expect(page.getByRole('spinbutton', { name: '牆壁厚度', exact: true })).toHaveValue('12');
    expect(errors).toEqual([]);
  });
});

test.describe('補充', () => {
  test('格子圖層拖曳：整格移動；匯出範圍點在物件上不選取物件', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.keyboard.press('b');
    await clickAt(page, 36, 36);
    await clickAt(page, 108, 36);
    await page.keyboard.press('v');
    await layerRow(page, '格子1').click();
    await dragWorld(page, [36, 36], [116, 46], 10);
    const cells = await page.evaluate(() => {
      const e = (
        window as unknown as {
          __mapEditor: { engine: { canvas: { getObjects(): Record<string, unknown>[] } } };
        }
      ).__mapEditor.engine;
      const o = e.canvas.getObjects().find((x) => x._layerName === '格子1') as Record<
        string,
        unknown
      >;
      return [...(o._cellData as Map<string, { col: number; row: number }>).values()]
        .map((c) => `${c.col},${c.row}`)
        .sort();
    });
    expect(cells).toEqual(['1,0', '2,0']);
    await expect(statusMsg(page)).toHaveText('變更 格子1');
    /* 匯出範圍：從物件上開始點 */
    await drawRect(page, [-216, -216], [-72, -72]);
    await page.keyboard.press('v');
    const before = (await objects(page)).find((o) => o.name === '矩形1');
    await page.getByTestId('export-start').click();
    await dragWorld(page, [-144, -144], [0, 0], 6);
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await expect(page.getByTestId('export-info')).toHaveText('2.0 × 2.0 格（內部：144 × 144 px）');
    expect((await objects(page)).find((o) => o.name === '矩形1')).toEqual(before);
    expect(await selectedNames(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('共用元件（元件展示頁）', () => {
  test('ContextMenu：右鍵與 Shift＋F10 打開、選取項目；mapGrid 示範：塗格子、合併外框', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await blockFonts(page);
    await page.goto('/next/_gallery/');
    await page.getByRole('tab', { name: '對話框' }).click();
    const target = page.getByTestId('context-menu-demo');
    await target.click({ button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['重新命名', '鎖定', '刪除']);
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    /* Radix 在 setTimeout 裡才移動焦點：等移到第二項再按 Enter */
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('選了：鎖定')).toBeVisible();
    await target.focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.getByRole('tab', { name: '模組' }).click();
    const demo = page.getByTestId('map-grid-demo');
    await demo.scrollIntoViewIfNeeded();
    const b = await demo.boundingBox();
    if (!b) throw new Error('no demo');
    await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.4);
    await expect(page.getByTestId('map-grid-demo-info')).toHaveText('已塗 1 格；外框 1 條迴圈');
    await page.getByRole('radio', { name: 'square', exact: true }).click();
    await expect(page.getByTestId('map-grid-demo-info')).toHaveText('已塗 0 格；外框 0 條迴圈');
    expect(errors).toEqual([]);
  });
});

test.describe('面板的其他控制項', () => {
  test('手繪的筆刷設定、文字的描邊與樣式、圖樣細節、房間牆壁的陰影、牆壁的線型、裝飾的垂直翻轉', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    const brush = () =>
      page.evaluate(() => {
        const b = (
          window as unknown as {
            __mapEditor: {
              engine: {
                canvas: { freeDrawingBrush: { width: number; color: string; decimate: number } };
              };
            };
          }
        ).__mapEditor.engine.canvas.freeDrawingBrush;
        return { width: b.width, color: b.color, decimate: b.decimate };
      });
    /* 手繪 */
    await tool(page, 'freehand').click();
    await setColor(page, '顏色', '#ff0000');
    await setNumber(page, '線寬', 9);
    await setNumber(page, '平滑化', 2);
    expect(await brush()).toEqual({ width: 9, color: 'rgba(255,0,0,1)', decimate: 2 });
    /* 文字：描邊、樣式按鈕 */
    await tool(page, 'text').click();
    await setNumber(page, '描邊的粗細', 3);
    await setColor(page, '描邊', '#00ff00');
    await clickAt(page, -200, -150);
    await page.keyboard.type('Ab');
    await page.keyboard.press('Escape');
    expect(await detail(page, '文字1')).toMatchObject({
      stroke: 'rgba(0,255,0,1)',
      strokeWidth: 3,
    });
    await tool(page, 'select').click();
    await layerRow(page, '文字1').click();
    await tool(page, 'text').click();
    await clickAt(page, -190, -150);
    await page.keyboard.press('Control+a');
    for (const k of ['italic', 'underline', 'linethrough'])
      await page.locator(`[data-text-style="${k}"]`).click();
    await page.keyboard.press('Escape');
    const styles = JSON.stringify((await detail(page, '文字1')).styles);
    expect(styles).toContain('"fontStyle":"italic"');
    expect(styles).toContain('"underline":true');
    expect(styles).toContain('"linethrough":true');
    /* 地面的圖樣細節：只影響之後的物件 */
    await tool(page, 'ground').click();
    await pickOption(page, '形狀', '矩形');
    const ground = page.getByTestId('ground-panel');
    await ground.getByRole('button', { name: '圖樣細節' }).click();
    await setNumber(page, '偏移 X', 10, ground);
    await setNumber(page, '縮放', 200, ground);
    await clickAt(page, 0, 0);
    await clickAt(page, 72, 72);
    expect(await detail(page, '地面_矩形1')).toMatchObject({
      _patternOffsetX: 10,
      _patternScale: 2,
    });
    /* 牆壁的線型：依厚度換算 */
    await tool(page, 'wall').click();
    await pickOption(page, '線型', '虛線');
    await clickAt(page, 144, 0);
    await clickAt(page, 216, 72);
    expect(await detail(page, '牆_矩形1')).toMatchObject({ strokeDashArray: [60, 36] });
    /* 房間：牆壁的陰影關掉 */
    await tool(page, 'room').click();
    const roomPanel = page.getByTestId('room-panel');
    const shadowBtns = roomPanel.getByRole('button', { name: '陰影' });
    await shadowBtns.nth(1).click();
    await roomPanel.getByRole('switch', { name: '加上陰影' }).last().click();
    await clickAt(page, -216, 72);
    await clickAt(page, -72, 216);
    const room = await detail(page, '房間_矩形1');
    expect((room.objects as Record<string, unknown>[])[1].shadow).toBeNull();
    /* 裝飾：垂直翻轉 */
    await tool(page, 'decor').click();
    await page.locator('[data-decor="desk"]').click();
    await page.getByRole('button', { name: '垂直' }).click();
    await clickAt(page, 252, 180);
    expect(await detail(page, '裝飾_書桌1')).toMatchObject({ flipY: true, _decorFlipY: true });
    expect(errors).toEqual([]);
  });

  test('圖層面板的群組與刪除按鈕、地圖設定的網格顏色與吸附種類、縮小、立即儲存、匯出的白底與重新選範圍', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await drawRect(page, [0, 0], [72, 72]);
    await drawRect(page, [144, 0], [216, 72]);
    await page.keyboard.press('v');
    await layerRow(page, '矩形1').click();
    await layerRow(page, '矩形2').click({ modifiers: ['Control'] });
    await page.getByTestId('layer-group').click();
    expect(await names(page)).toEqual(['群組1']);
    await page.getByTestId('layer-group').click();
    expect(await names(page)).toEqual(['矩形1', '矩形2']);
    await layerRow(page, '矩形2').click();
    await page.getByTestId('layer-delete').click();
    expect(await names(page)).toEqual(['矩形1']);
    /* 地圖設定 */
    await page.getByRole('tab', { name: '地圖設定' }).click();
    const settings = page.getByTestId('settings-panel');
    await setColor(page, '顏色', '#ff000080');
    await settings.getByRole('checkbox', { name: '格子中心' }).click();
    const data = await page.evaluate(() =>
      (
        window as unknown as { __mapEditor: { engine: { serialize(): Record<string, unknown> } } }
      ).__mapEditor.engine.serialize(),
    );
    expect(data.gridColor).toBe('#ff000080');
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('trpg-toolkit:map-editor:preview') ?? '{}').state.data
            .snapCenter,
      ),
    ).toBe(false);
    /* 縮小、立即儲存 */
    await page.getByRole('button', { name: '縮小' }).click();
    await expect(page.getByTestId('status-zoom')).toHaveText('80%');
    await page.getByTestId('save-now').click();
    await expect(page.getByTestId('save-status')).toHaveText('已儲存');
    /* 匯出：白底、重新選範圍 */
    await pickExportRegion(page, [-72, -72], [144, 144]);
    const dlg = page.getByTestId('export-dialog');
    await dlg.getByRole('radio', { name: '白色' }).click();
    const png = pngPixels((await download(page)).bytes);
    expect(px(png, 10, 10)).toEqual([255, 255, 255, 255]);
    await pickExportRegion(page, [-72, -72], [144, 144]);
    await page.getByRole('button', { name: '重新選範圍' }).click();
    await expect(page.getByTestId('export-banner')).toBeVisible();
    await expect(page.getByTestId('export-dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('對等驗證後的修正（7.1）', () => {
  type Pt = { key: string; x: number; y: number };
  /** 選取中物件看得到的控制點（視窗座標，只列在畫布範圍內的） */
  async function controlPoints(page: Page): Promise<Pt[]> {
    return page.evaluate(() => {
      const c = (
        window as unknown as {
          __mapEditor: {
            engine: {
              canvas: {
                upperCanvasEl: HTMLCanvasElement;
                getActiveObject(): {
                  setCoords(): void;
                  isControlVisible(key: string): boolean;
                  oCoords: Record<string, { x: number; y: number }>;
                } | null;
              };
            };
          };
        }
      ).__mapEditor.engine.canvas;
      const o = c.getActiveObject();
      if (!o) return [];
      o.setCoords();
      const r = c.upperCanvasEl.getBoundingClientRect();
      return Object.entries(o.oCoords)
        .filter(([k]) => o.isControlVisible(k))
        .map(([key, p]) => ({ key, x: r.left + p.x, y: r.top + p.y }))
        .filter((p) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom);
    });
  }

  /** 控制點上面是畫布（沒有被動作列或其他東西蓋住） */
  async function covered(page: Page, pts: Pt[]): Promise<string[]> {
    return page.evaluate(
      (list) =>
        list
          .filter((p) => document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS')
          .map((p) => p.key),
      pts,
    );
  }

  test('F051：動作列不擋住控制點，拖曳旋轉控制點可以旋轉（轉過之後、物件靠近上緣時也一樣）', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await drawRect(page, [0, 0], [144, 72]);
    await page.keyboard.press('v');
    await clickAt(page, 72, 36);
    await expect(page.getByTestId('action-bar')).toBeVisible();
    const pts = await controlPoints(page);
    expect(pts.map((p) => p.key)).toContain('mtr');
    expect(await covered(page, pts)).toEqual([]);
    const h = pts.find((p) => p.key === 'mtr') as Pt;
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 120, h.y + 90, { steps: 8 });
    await page.mouse.up();
    const angle = Number((await detail(page, '矩形1')).angle);
    expect(angle).toBeGreaterThan(20);
    expect(angle).toBeLessThan(160);
    /* 轉過之後控制點換了位置：動作列仍然不擋 */
    await expect.poll(async () => covered(page, await controlPoints(page))).toEqual([]);

    /* 靠近畫布上緣（上方放不下，動作列放到下方）：下方的控制點也不擋 */
    const top = await page.evaluate(() => {
      const e = (
        window as unknown as {
          __mapEditor: {
            engine: {
              canvas: { upperCanvasEl: HTMLCanvasElement };
              worldToClient(x: number, y: number): { x: number; y: number };
            };
          };
        }
      ).__mapEditor.engine;
      const r = e.canvas.upperCanvasEl.getBoundingClientRect();
      const o = e.worldToClient(0, 0);
      return Math.ceil((r.top + 4 - o.y) / 72) * 72;
    });
    await drawRect(page, [-216, top], [-72, top + 72]);
    await page.keyboard.press('v');
    await clickAt(page, -144, top + 36);
    await expect(page.getByTestId('select-panel')).toContainText('矩形2');
    await expect.poll(async () => covered(page, await controlPoints(page))).toEqual([]);
    /* 動作列整個在控制點的上方或下方（1280×720 時上方放不下，放在下方） */
    const bar = await page.getByTestId('action-bar').boundingBox();
    const ys = (await controlPoints(page)).map((p) => p.y);
    if (!bar) throw new Error('沒有動作列');
    expect(bar.y + bar.height <= Math.min(...ys) || bar.y >= Math.max(...ys)).toBe(true);
    expect(bar.y).toBeGreaterThan(Math.max(...ys));
    expect(errors).toEqual([]);
  });
  test('F122：多個形狀的 SVG 圖章以 SVG 的畫布（不是內容的外接框）的長邊對齊一格，和舊版同大', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await tool(page, 'decor').click();
    /* 水田：250×250 的畫布、內容只佔中間一部分（舊版 72×72；用內容的外接框時會變大） */
    await page.locator('[data-decor="jp-rice-field"]').click();
    await moveTo(page, 30, 40);
    await expect.poll(async () => (await previewInfo(page)).count).toBeGreaterThan(0);
    await clickAt(page, 36, 36);
    await expect.poll(() => names(page)).toEqual(['裝飾_水田1']);
    const o = (await objects(page))[0];
    expect(o.w).toBeCloseTo(72, 1);
    expect(o.h).toBeCloseTo(72, 1);
    expect(o).toMatchObject({ cx: 36, cy: 36 });
    expect(errors).toEqual([]);
  });
  test('F150：既有的文字刪成空白後結束編輯：刪掉文字、記一步「刪除文字」、主控台沒有錯誤（Esc、點別處、切工具）', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    const finish = [
      () => page.keyboard.press('Escape'),
      /* 文字工具點別處：結束編輯，在那裡開始一段新的文字（空白，Esc 就消失、不記步驟） */
      async () => {
        await clickAt(page, 300, 200);
        await page.keyboard.press('Escape');
      },
      () => tool(page, 'rect').click(),
    ];
    for (const end of finish) {
      await page.keyboard.press('t');
      await clickAt(page, 0, 0);
      await page.keyboard.type('XYZ');
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await names(page)).length).toBe(1);
      await page.keyboard.press('t');
      await clickAt(page, 20, 20);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await end();
      await expect.poll(() => names(page)).toEqual([]);
      await expect(statusMsg(page)).toHaveText('刪除文字');
    }
    expect(errors).toEqual([]);
  });
  test('F173：自動儲存關著時改過，再打開自動儲存：約 2.5 秒後存好（同舊版）', async ({ page }) => {
    const errors = await openList(page);
    await createMap(page);
    await page.getByRole('tab', { name: '地圖設定' }).click();
    const toggle = page.getByTestId('settings-panel').getByRole('switch', { name: '自動儲存' });
    await toggle.click();
    await drawRect(page, [-200, -200], [-100, -100]);
    await expect(page.getByTestId('save-status')).toHaveText('未儲存');
    await page.getByRole('tab', { name: '地圖設定' }).click();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await saved(page);
    expect(errors).toEqual([]);
  });
  test('F024：選取物件後切到作圖工具，圖層清單的選取標示也清掉（同舊版）；格子工具照舊對準格子圖層', async ({
    page,
  }) => {
    const errors = await openList(page);
    await createMap(page);
    await drawRect(page, [0, 0], [144, 72]);
    await page.keyboard.press('v');
    await clickAt(page, 72, 36);
    await expect(layerRow(page, '矩形1')).toHaveAttribute('data-selected', 'true');
    await tool(page, 'ellipse').click();
    await expect(layerRow(page, '矩形1')).not.toHaveAttribute('data-selected', /.*/);
    /* 格子工具：對準最上面的格子圖層（F094） */
    await page.keyboard.press('b');
    await clickAt(page, 252, 36);
    await page.keyboard.press('v');
    await clickAt(page, 72, 36);
    await page.keyboard.press('b');
    await expect(layerRow(page, '格子1')).toHaveAttribute('data-selected', 'true');
    await expect(layerRow(page, '矩形1')).not.toHaveAttribute('data-selected', /.*/);
    expect(errors).toEqual([]);
  });
  test('F033：觸控時點一下後兩指縮放，矩形取消、不會多出一個（第二點在手指放開時才完成）；單指點兩下照常畫', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      locale: 'zh-TW',
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    const errors = await openList(page);
    await createMap(page);
    const cdp = await context.newCDPSession(page);
    const pt = async (x: number, y: number) => toClient(page, x, y);
    const tap = async (x: number, y: number) => {
      const c = await pt(x, y);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await tool(page, 'rect').click();
    /* 點一下（第一點），接著兩指縮放：第一指落下時還不完成，第二指落下就取消 */
    await tap(-72, -72);
    const z0 = await page.getByTestId('status-zoom').textContent();
    const a = await pt(0, 0);
    const b = await pt(72, 0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
    for (const d of [10, 20, 30])
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: a.x - d, y: a.y },
          { x: b.x + d, y: b.y },
        ],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('status-zoom')).not.toHaveText(z0 ?? '');
    expect(await names(page)).toEqual([]);
    expect(await previewInfo(page)).toMatchObject({ count: 0 });
    /* 單指點兩下：照常畫出矩形 */
    await tap(0, 0);
    await tap(72, 72);
    await expect.poll(() => names(page)).toEqual(['矩形1']);
    expect(errors).toEqual([]);
    await context.close();
  });
});
