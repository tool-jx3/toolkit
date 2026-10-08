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

  test('自訂圖樣：上傳、用在地面與牆壁、刪除後改回單色', async ({ page }) => {
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
    const bed = (await objects(page))[0];
    expect(bed).toMatchObject({ name: '裝飾_床1', cx: 36, cy: 36 });
    expect(Math.max(bed.w, bed.h)).toBeCloseTo(72, 0);
    await page.keyboard.press('r');
    await expect(page.getByRole('spinbutton', { name: '旋轉', exact: true })).toHaveValue('30');
    await page.getByRole('button', { name: '水平' }).click();
    await clickAt(page, 180, 36);
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
