/**
 * 室內平面圖產生器：2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」第一批（規格 1.29：F303～F312）——
 * 檢視方式（平面編輯／立體樓層圖／樓層總覽）、立體視角、點樓層切回平面編輯、上層樓的快速建立（三種做法、
 * 把外框複製到上一層、立體圖上的「＋」）、祕密樓層（PL 檢視、匯出、全部公開再存一張、分享連結）、兩種新的匯出範圍。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import type { Floor, Project } from '../../src/tools/floor-plan/model/types';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('floor-plan') ?? { id: 'floor-plan', status: 'next' })}/`;

type Pt = { x: number; y: number };
type Hook = {
  useProject: { getState: () => { data: Project; replace: (p: Project) => void } };
  useEditor: { getState: () => { tool: string; sel: unknown[] } };
  usePrefs: { getState: () => { data: { view?: string; ghost: boolean } } };
  act: Record<string, (...a: unknown[]) => unknown>;
  editor: {
    fitView: () => void;
    debugShown: () => { veiled?: boolean; rooms: { name: string }[] };
  };
  stackClient: (x: number, y: number, level: number) => Pt;
  plateClient: (level: number) => Pt;
  cardClient: (level: number) => Pt | null;
  stackLinks: () => { level: number; kind: string }[];
  stackExportSize: (range: 'stack' | 'board', px: number) => { width: number; height: number };
  shareHash: (mode: 'pl' | 'full') => string;
  toClient: (x: number, y: number) => Pt;
};

const routeFonts = (p: Page) =>
  p.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );

async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeFonts(page);
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '室內平面圖產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan);
  return errors;
}

const hook = <T>(page: Page, fn: (h: Hook, arg: unknown) => T, arg?: unknown) =>
  page.evaluate(
    ([src, a]) => {
      const h = (window as unknown as { __floorPlan: Hook }).__floorPlan;
      return new Function('h', 'a', `return (${src})(h, a);`)(h, a) as T;
    },
    [fn.toString(), arg] as const,
  );

const project = (page: Page) => hook(page, (h) => h.useProject.getState().data);

async function loadTemplate(page: Page, id: string) {
  await hook(page, (h, a) => h.act.loadTemplate(a, { structureOnly: false, clues: false }), id);
}

const viewRadio = (page: Page, name: string) =>
  page.getByTestId('editor-bar').getByRole('radio', { name, exact: true });

function pngInfo(path: string) {
  const bytes = readFileSync(path);
  const chunks = parseChunks(bytes);
  const { width, height, colorType } = readIhdr(chunks);
  const z = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  return { width, height, data: decodePixels(z, width, height, colorType) };
}

test.describe('檢視方式（F303、F304）', () => {
  test('切換平面編輯／立體樓層圖／樓層總覽：工具列、屬性面板、畫布的說明跟著換', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadTemplate(page, 'clockshop');
    await expect(viewRadio(page, '平面編輯')).toBeChecked();
    await expect(page.getByTestId('tool-strip')).toBeVisible();
    await viewRadio(page, '立體樓層圖').click();
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toHaveAttribute('data-view', 'stack');
    await expect(canvas).toHaveAttribute('aria-label', /立體樓層圖的畫布/);
    await expect(page.getByTestId('tool-strip')).toHaveCount(0);
    await expect(page.getByTestId('props-title')).toHaveText('立體樓層圖');
    await expect(page.getByTestId('canvas-hint')).toContainText('拖曳');
    await viewRadio(page, '樓層總覽').click();
    await expect(canvas).toHaveAttribute('data-view', 'board');
    await expect(page.getByTestId('props-title')).toHaveText('樓層總覽');
    /* 拿起工具＝回到平面編輯 */
    await canvas.focus();
    await page.keyboard.press('b');
    await expect(canvas).toHaveAttribute('data-view', 'plan');
    await expect(page.getByTestId('tool-strip')).toBeVisible();
    /* 檢視方式記在瀏覽器（重新整理後還在），不算一步復原 */
    await viewRadio(page, '立體樓層圖').click();
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __floorPlan?: unknown }).__floorPlan,
    );
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-view', 'stack');
    expect(errors).toEqual([]);
  });

  test('立體視角：左轉／右轉 45°、滑桿、拖曳旋轉；不算復原的步驟；回到預設', async ({ page }) => {
    const errors = await open(page);
    await loadTemplate(page, 'clockshop');
    await viewRadio(page, '立體樓層圖').click();
    const steps = () =>
      hook(
        page,
        (h) =>
          (
            h.useProject as unknown as {
              temporal: { getState: () => { pastStates: unknown[] } };
            }
          ).temporal.getState().pastStates.length,
      );
    const before = await steps();
    await page.getByTestId('stack-right').click();
    expect((await project(page)).stack?.angle).toBe(17);
    await page.getByTestId('stack-left').click();
    await page.getByTestId('stack-left').click();
    expect((await project(page)).stack?.angle).toBe(-73);
    /* 拖曳：左右轉、上下改俯視 */
    const box = (await page.getByTestId('map-canvas').boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const cx = box.x + box.width - 60;
    const cy = box.y + 80;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 40, cy + 20, { steps: 4 });
    await page.mouse.move(cx - 80, cy + 40, { steps: 4 });
    await page.mouse.up();
    const cam = (await project(page)).stack;
    expect(cam?.angle).toBe(-73 - 36);
    expect(cam?.pitch).toBeCloseTo(0.64, 2);
    await page.getByRole('slider', { name: '樓層間距' }).focus();
    await page.keyboard.press('ArrowRight');
    expect((await project(page)).stack?.gap).toBe(1.05);
    await page.getByTestId('stack-reset').click();
    expect((await project(page)).stack).toBeUndefined();
    await expect(page.getByTestId('stack-reset')).toBeDisabled();
    /* 改視角不算一步復原：復原的步數不變 */
    expect(await steps()).toBe(before);
    expect(errors).toEqual([]);
  });

  test('點一下樓層牌或樓板：切到那一層的平面編輯；總覽點卡片也一樣', async ({ page }) => {
    const errors = await open(page);
    await loadTemplate(page, 'clockshop');
    expect((await project(page)).active).toBe(1);
    await viewRadio(page, '立體樓層圖').click();
    /* 上下樓層的連接：B1→1F、1F→2F 的樓梯 */
    expect(await hook(page, (h) => h.stackLinks())).toEqual([
      { level: 0, kind: 'stairs' },
      { level: 1, kind: 'stairs' },
    ]);
    const plate = await hook(page, (h) => h.plateClient(2));
    await page.mouse.click(plate.x, plate.y);
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-view', 'plan');
    expect((await project(page)).active).toBe(2);
    await expect(page.getByText('已切換到「2F」的平面編輯', { exact: true })).toBeVisible();
    await viewRadio(page, '立體樓層圖').click();
    const slab = await hook(page, (h) => h.stackClient(4, 4, 0));
    await page.mouse.click(slab.x, slab.y);
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-view', 'plan');
    expect((await project(page)).active).toBe(0);
    await viewRadio(page, '樓層總覽').click();
    const card = (await hook(page, (h) => h.cardClient(1))) as Pt;
    await page.mouse.click(card.x, card.y);
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-view', 'plan');
    expect((await project(page)).active).toBe(1);
    /* 屬性面板的樓層清單（由上往下） */
    await viewRadio(page, '立體樓層圖').click();
    await expect(page.getByTestId('stack-floors').locator('[data-stack-floor]')).toHaveText([
      '2F',
      '1F',
      'B1',
    ]);
    expect(errors).toEqual([]);
  });

  test('390 寬：立體樓層圖、樓層總覽沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await loadTemplate(page, 'clockshop');
    for (const name of ['立體樓層圖', '樓層總覽']) {
      await viewRadio(page, name).click();
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, name).toBeLessThanOrEqual(390);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('上層樓的快速建立（F308、F309）', () => {
  test('新增的空樓層：沿用外框與樓梯、整層複製、從空白開始畫（三種）', async ({ page }) => {
    const errors = await open(page);
    await loadTemplate(page, 'townhouse');
    await hook(page, (h) => h.act.switchFloor(0));
    await page.getByTestId('floor-add').click();
    const quick = page.getByTestId('quick-setup');
    await expect(quick).toBeVisible();
    await expect(quick).toContainText('「4F」還沒有房間');
    /* 下一層（左邊）是 3F */
    await expect(page.getByTestId('quick-shell')).toHaveText('沿用「3F」的外框與樓梯（建議）');
    await page.getByTestId('quick-shell').click();
    let p = await project(page);
    const src = p.floors[2];
    let f = p.floors[3];
    expect(f.rooms.length).toBeGreaterThan(0);
    expect(f.items.every((i) => /stairs|spiral|elevator|ladder|trapdoor/.test(i.t))).toBe(true);
    expect(f.items.length).toBeGreaterThan(0);
    expect(f.texts).toEqual([]);
    expect(f.rooms.length).toBeLessThanOrEqual(src.rooms.length);
    await expect(quick).toHaveCount(0);
    await expect(
      page.getByText('已沿用「3F」的外框與樓梯建立「4F」', { exact: true }),
    ).toBeVisible();
    /* 復原 → 再選整層複製 */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    await expect(quick).toBeVisible();
    await page.getByTestId('quick-full').click();
    p = await project(page);
    f = p.floors[3];
    expect(f.items.length).toBe(p.floors[2].items.length);
    expect(f.rooms.length).toBe(p.floors[2].rooms.length);
    await page.keyboard.press('Control+z');
    /* 從空白開始畫：這一層不再顯示，「下一層」的淡影打開 */
    await hook(page, (h) => {
      (
        h.usePrefs as unknown as {
          getState: () => { update: (f: (d: { ghost: boolean }) => void) => void };
        }
      )
        .getState()
        .update((d) => {
          d.ghost = false;
        });
    });
    await page.getByTestId('quick-blank').click();
    await expect(quick).toHaveCount(0);
    expect(await hook(page, (h) => h.usePrefs.getState().data.ghost)).toBe(true);
    expect((await project(page)).floors[3].rooms).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('把外框複製到上一層：沒有上一層時新增；有東西時先問', async ({ page }) => {
    const errors = await open(page);
    /* 開頁的套房（一層） */
    await page.getByTestId('copy-shell-up').click();
    let p = await project(page);
    expect(p.floors.map((f) => f.name)).toEqual(['1F', '2F']);
    expect(p.active).toBe(1);
    expect(p.floors[1].rooms.length).toBeGreaterThan(0);
    /* 回到 1F 再按一次：2F 有東西 → 確認（取消＝不變） */
    await hook(page, (h) => h.act.switchFloor(0));
    await page.getByTestId('copy-shell-up').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('取代「2F」的內容？');
    await dialog.getByRole('button', { name: '取消' }).click();
    expect((await project(page)).active).toBe(0);
    await page.getByTestId('copy-shell-up').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取代' }).click();
    p = await project(page);
    expect(p.active).toBe(1);
    expect(p.floors).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test('立體樓層圖只有一層時：點上面的「＋」增建一層（沿用外框與樓梯）', async ({ page }) => {
    const errors = await open(page);
    await viewRadio(page, '立體樓層圖').click();
    const plus = await hook(page, (h) => {
      const p = h.useProject.getState().data;
      const r = p.floors[0].rooms[0];
      return h.stackClient(r.x + r.w / 2, r.y + r.h / 2, 1);
    });
    await page.mouse.click(plus.x, plus.y);
    const p = await project(page);
    expect(p.floors.map((f) => f.name)).toEqual(['1F', '2F']);
    expect(p.floors[1].rooms.length).toBeGreaterThan(0);
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-view', 'stack');
    expect(errors).toEqual([]);
  });
});

test.describe('祕密樓層（F307）與匯出（F306）', () => {
  test('祕密樓層：地圖設定的開關、PL 檢視只剩輪廓與「？？？」、樓層分頁的標記', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadTemplate(page, 'townhouse');
    await hook(page, (h) => h.act.switchFloor(2));
    await page.getByRole('switch', { name: '祕密樓層（PL 看到「？？？」）' }).click();
    expect((await project(page)).floors[2].secret).toBe(true);
    await expect(page.locator('[data-floor="2"]')).toHaveAttribute('title', /祕密樓層/);
    await page.getByRole('radio', { name: 'PL 檢視' }).click();
    const shown = await hook(page, (h) => h.editor.debugShown());
    expect(shown.veiled).toBe(true);
    expect(shown.rooms.every((r) => r.name === '')).toBe(true);
    /* 驗證後修訂（2026-11-09，L1）：PL 檢視的祕密樓層是唯讀的——點房間、Ctrl＋A 都選不到，屬性面板照樣是地圖設定 */
    const r0 = (await project(page)).floors[2].rooms[0];
    await hook(page, (h) => h.editor.fitView());
    const at = await hook(page, (h, a) => h.toClient(...(a as [number, number])), [
      r0.x + r0.w / 2,
      r0.y + r0.h / 2,
    ]);
    await page.mouse.click(at.x, at.y);
    await expect(
      page.getByText('PL 檢視時祕密樓層不能編輯（切回 GM 檢視再改）', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Control+a');
    expect(await hook(page, (h) => h.useEditor.getState().sel)).toEqual([]);
    await expect(page.getByTestId('floor-fields')).toBeVisible();
    /* GM 檢視：照常選得到 */
    await page.getByRole('radio', { name: 'GM 檢視' }).click();
    await page.mouse.click(at.x, at.y);
    expect((await hook(page, (h) => h.useEditor.getState().sel)).length).toBe(1);
    await page.getByRole('radio', { name: 'PL 檢視' }).click();
    /* 切到 PL 檢視時，祕密樓層上選取的東西取消選取 */
    expect(await hook(page, (h) => h.useEditor.getState().sel)).toEqual([]);
    /* 復原：一步 */
    await page.getByTestId('map-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await project(page)).floors[2].secret).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('匯出立體樓層圖（PL、祕密樓層）→ 全部公開再存一張；樓層總覽（GM、透明背景）', {
    tag: '@serial',
  }, async ({ page }) => {
    const errors = await open(page);
    await loadTemplate(page, 'clockshop');
    await viewRadio(page, '立體樓層圖').click();
    await page.getByTestId('export-open').click();
    const dialog = page.getByTestId('export-dialog');
    /* 在立體樓層圖打開：範圍換成立體樓層圖 */
    await expect(dialog.getByRole('radio', { name: '立體樓層圖' })).toBeChecked();
    await expect(page.getByTestId('export-stack-note')).toBeVisible();
    await dialog.getByRole('radio', { name: '48px' }).click();
    const size = await hook(page, (h) => h.stackExportSize('stack', 48));
    await expect(page.getByTestId('export-info')).toHaveText(`${size.width} × ${size.height} px`);
    await expect(page.getByTestId('export-preview')).toBeVisible();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('鐘錶行（地下室～2F）_立體_PL.png');
    const img = pngInfo((await dl.path()) as string);
    expect([img.width, img.height]).toEqual([size.width, size.height]);
    /* B1 是祕密樓層：下載之後出現「全部公開再存一張」 */
    await expect(page.getByTestId('export-unveil')).toBeVisible();
    const [dl2] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-unveil-download').click(),
    ]);
    expect(dl2.suggestedFilename()).toBe('鐘錶行（地下室～2F）_立體_PL_全部公開.png');
    const img2 = pngInfo((await dl2.path()) as string);
    expect([img2.width, img2.height]).toEqual([size.width, size.height]);
    expect(Buffer.compare(Buffer.from(img.data), Buffer.from(img2.data))).not.toBe(0);
    /* 總覽、GM 用、透明背景：四個角是透明的 */
    await dialog.getByRole('radio', { name: '樓層總覽' }).click();
    await dialog.getByRole('radio', { name: 'GM 用（全部顯示）' }).click();
    await dialog.getByRole('switch', { name: '透明背景' }).click();
    await expect(page.getByTestId('export-unveil')).toHaveCount(0);
    const board = await hook(page, (h) => h.stackExportSize('board', 48));
    const [dl3] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ]);
    expect(dl3.suggestedFilename()).toBe('鐘錶行（地下室～2F）_總覽_GM.png');
    const img3 = pngInfo((await dl3.path()) as string);
    expect([img3.width, img3.height]).toEqual([board.width, board.height]);
    expect(img3.data[3]).toBe(0);
    expect(img3.data[(img3.width * img3.height - 1) * 4 + 3]).toBe(0);
    /* GM 用的圖沒有「全部公開」 */
    await expect(page.getByTestId('export-unveil')).toHaveCount(0);
    /* 立體圖、總覽不能送到地圖演出產生器 */
    await expect(page.getByTestId('export-send-fx')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('PL 用的立體圖與總覽：改祕密樓層的內容（遠處的文字、家具、GM 專用的房間）逐位元組相同；揭露用提示對不齊', {
    tag: '@serial',
  }, async ({ page }) => {
    const errors = await open(page);
    await loadTemplate(page, 'clockshop');
    await page.getByTestId('export-open').click();
    const dialog = page.getByTestId('export-dialog');
    await dialog.getByRole('radio', { name: '24px' }).click();
    const grab = async (range: string) => {
      await dialog.getByRole('radio', { name: range, exact: true }).click();
      await expect(page.getByTestId('export-preview')).toBeVisible();
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('export-download').click(),
      ]);
      return readFileSync((await dl.path()) as string);
    };
    const before = [await grab('立體樓層圖'), await grab('樓層總覽')];
    const sizes = [
      await hook(page, (h) => h.stackExportSize('stack', 24)),
      await hook(page, (h) => h.stackExportSize('board', 24)),
    ];
    await hook(page, (h) => {
      const s = h.useProject.getState();
      const p = structuredClone(s.data);
      const b1 = p.floors.find((f) => f.secret) as Floor;
      b1.texts.push({ id: 'far-t', x: 140, y: -70, text: '遠處的文字' });
      b1.items.push({ id: 'far-i', t: 'bed_single', x: -60, y: 80, w: 2, h: 4, rot: 0 });
      b1.rooms.push({
        id: 'far-r',
        x: 70,
        y: 50,
        w: 10,
        h: 8,
        name: '遠的密室',
        cat: 'danger',
        gm: true,
      });
      s.replace(p);
    });
    const after = [await grab('立體樓層圖'), await grab('樓層總覽')];
    expect(Buffer.compare(before[0], after[0])).toBe(0);
    expect(Buffer.compare(before[1], after[1])).toBe(0);
    /* PL 用的圖的大小不變；揭露用（範圍＝GM 用）比較大，提示對不齊 */
    expect(await hook(page, (h) => h.stackExportSize('stack', 24))).toEqual(sizes[0]);
    await dialog.getByRole('radio', { name: '揭露用' }).click();
    await expect(page.getByTestId('export-reveal-note')).toContainText('疊圖時對不齊');
    expect(errors).toEqual([]);
  });

  test('PL 用的分享連結：祕密樓層只剩輪廓（打開連結的人換到 GM 檢視也看不到）', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await loadTemplate(page, 'clockshop');
    const hash = await hook(page, (h) => h.shareHash('pl'));
    const other = await context.newPage();
    const errors2 = await open(other, `${URL}${hash}`);
    /* 同一個瀏覽器：自動儲存可能已經是鐘錶行（先問要不要取代），也可能還是開頁的範本（不問） */
    const replace = other.getByRole('alertdialog').getByRole('button', { name: '取代' });
    const opened = other.getByText(/^已開啟分享的地圖.*（PL 用）$/);
    await expect(replace.or(opened)).toBeVisible();
    if (await replace.isVisible()) await replace.click();
    await expect(opened).toBeVisible();
    const p = await project(other);
    const b1 = p.floors.find((f: Floor) => f.name === 'B1') as Floor;
    expect(b1.secret).toBe(true);
    /* 驗證後修訂（2026-11-09）：種類換成中性的、不標 GM 專用（GM 專用的房間不留） */
    expect(b1.rooms.length).toBeGreaterThan(0);
    expect(b1.rooms.every((r) => r.name === '' && !r.gm && r.cat === 'living')).toBe(true);
    const own = (await project(page)).floors.find((f: Floor) => f.name === 'B1') as Floor;
    expect(b1.rooms.length).toBe(own.rooms.filter((r) => !r.gm).length);
    expect([b1.items, b1.openings, b1.texts]).toEqual([[], [], []]);
    expect(errors).toEqual([]);
    expect(errors2).toEqual([]);
  });
});
