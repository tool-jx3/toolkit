/**
 * 證件與票券產生器 2026-11-05 的追加（規格 1.18、F87～F95；補收 CyberDelaai/sinforge-ui 剩下的功能）：
 * - SF 證件：條碼的種類（看起來像的碼）、晶片的種類（點晶片換下一種）、日期的格式、光暈／顆粒／掃描線、數位證件（匯出整個場景）、
 *   名字產生器（離線語料）、複製到剪貼簿、預設集（存、套用、匯出入、內建範例）；
 * - 既有證件：浮水印（印在哪一面）與裝飾圖（每一面各自），沒用時匯出逐位元組相同；
 * - 390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { waitForFileChooser } from '../helpers/fileChooser';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('id-ticket') ?? { id: 'id-ticket', status: 'next' })}/`;
const PREFS_KEY = 'trpg-toolkit:id-ticket:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

interface Doc {
  kind: string;
  sf: {
    blank: string;
    values: Record<string, string>;
    style: Record<string, unknown>;
    photo: unknown;
  };
  idDecor: {
    watermark: Record<string, unknown>;
    side: string;
    elements: Record<string, Record<'front' | 'back', { id: string; x: number }[]>>;
  };
}

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
  await expect(page.getByRole('heading', { level: 1, name: '證件與票券產生器' })).toBeVisible();
  return errors;
}

const radio = (scope: Page | Locator, name: string) =>
  scope.getByRole('radio', { name, exact: true });
const tab = (page: Page, name: '內容' | '樣式') => page.getByRole('tab', { name });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const fieldInput = (page: Page, key: string) => page.locator(`[data-field="${key}"]`);
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });
const doc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __idTicket: { doc: () => Doc } }).__idTicket.doc());

async function prefs(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    PREFS_KEY,
  );
}

async function sfOpen(page: Page, blank = '公民 ID') {
  await radio(page, 'SF 證件').click();
  await radio(page.getByTestId('template-list'), blank).click();
  await expect(page.getByTestId('sf-canvas')).toBeVisible();
}

/** 預覽顯示的面（「顯示的面」；浮水印的「印在」也有正面、背面） */
const showSide = (page: Page, name: '正面' | '背面') =>
  radio(page.getByRole('radiogroup', { name: '顯示的面' }), name).click();

async function choose(page: Page, combo: string, option: string) {
  await page.getByRole('combobox', { name: combo }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function ringPng(size = 200): Promise<Buffer> {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2, y - size / 2);
      px.set(
        d < size * 0.35 && d > size * 0.2 ? [220, 30, 30, 255] : [255, 255, 255, 255],
        (y * size + x) * 4,
      );
    }
  return Buffer.from(await encodePng(px, size, size));
}

function readPng(bytes: Uint8Array) {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const all = new Uint8Array(idat.reduce((s, d) => s + d.length, 0));
  let o = 0;
  for (const d of idat) {
    all.set(d, o);
    o += d.length;
  }
  const px = decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType);
  const bpp = ihdr.colorType === 6 ? 4 : 3;
  return {
    width: ihdr.width,
    height: ihdr.height,
    at(x: number, y: number): Rgba {
      const k = (y * ihdr.width + x) * bpp;
      return [px[k], px[k + 1], px[k + 2], bpp === 4 ? px[k + 3] : 255];
    },
  };
}

async function download(page: Page, link: Locator) {
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

async function exportPng(page: Page) {
  const panel = exportPanel(page);
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const out = await download(page, result.getByRole('link', { name: '下載' }));
  await result
    .getByRole('button', { name: /關閉|移除|清除/ })
    .first()
    .click()
    .catch(() => undefined);
  return out;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/* ---------- SF 證件 ---------- */

test('條碼的種類、晶片、日期的格式；點晶片換下一種；看起來像的碼不提醒太密（F87～F89）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page);
  await tab(page, '樣式').click();
  const before = await page.getByTestId('sf-canvas').screenshot();
  await choose(page, '條碼的種類', 'EAN-13（看起來像）');
  await expect.poll(async () => (await doc(page)).sf.style.code).toBe('ean13');
  await expect
    .poll(async () => (await page.getByTestId('sf-canvas').screenshot()).equals(before))
    .toBe(false);
  /* 點條碼照樣重新產生編號 */
  const n0 = (await doc(page)).sf.values.number;
  await page.locator('[data-region^="code:number"]').click();
  await expect.poll(async () => (await doc(page)).sf.values.number).not.toBe(n0);
  await choose(page, '條碼的種類', '點碼（看起來像）');
  await expect.poll(async () => (await doc(page)).sf.style.code).toBe('dots');
  /* 晶片：下拉與點預覽 */
  await choose(page, '晶片的種類', 'EMV 付款晶片');
  await expect.poll(async () => (await doc(page)).sf.style.chipType).toBe('emv');
  await page.locator('[data-region="chip:chip"]').click();
  await expect.poll(async () => (await doc(page)).sf.style.chipType).toBe('die');
  /* 日期的格式：活動證沒有日期、公民 ID 有 */
  await choose(page, '日期的格式', '31 OCT 2077');
  await expect.poll(async () => (await doc(page)).sf.style.dateFmt).toBe('dmon');
  await radio(page.getByTestId('template-list'), '活動證').click();
  await expect(page.getByRole('combobox', { name: '日期的格式' })).toHaveCount(0);
  /* 活動證的預設編號 1 倍會提醒（Code 128）；看起來像的碼不提醒 */
  await expect(page.getByTestId('sf-code-dense')).toHaveCount(0);
  await choose(page, '條碼的種類', 'Code 128 條碼');
  await expect(page.getByTestId('sf-code-dense')).toHaveCount(1);
  await choose(page, '條碼的種類', '四態郵政（看起來像）');
  await expect(page.getByTestId('sf-code-dense')).toHaveCount(0);
  /* 一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await doc(page)).sf.style.code).toBe('barcode');
  expect(errors).toEqual([]);
});

test('效果與數位證件：光暈、顆粒、掃描線；數位證件匯出整個場景（不透明、比卡片大、檔名 -digital）（F90、F91）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page);
  await tab(page, '樣式').click();
  const fx = page.getByTestId('sf-fx');
  for (const name of ['光暈', '顆粒', '掃描線']) await fx.getByRole('switch', { name }).click();
  await expect
    .poll(async () => {
      const st = (await doc(page)).sf.style;
      return [st.glow, st.grain, st.scan];
    })
    .toEqual([true, true, true]);
  await expect(fx.getByRole('slider')).toHaveCount(3);
  const plain = readPng((await exportPng(page)).bytes);
  expect([plain.width, plain.height]).toEqual([1600, 1010]);
  /* 數位證件 */
  await page.getByRole('switch', { name: '數位證件模式' }).click();
  await expect.poll(async () => (await doc(page)).sf.style.digital).toBe(true);
  const dims = await page.getByTestId('export-dims').textContent();
  const m = /輸出 (\d+) × (\d+) px/.exec(dims ?? '');
  const w = Number(m?.[1]);
  const h = Number(m?.[2]);
  expect(w).toBeGreaterThan(1600);
  expect(h).toBeGreaterThan(1010);
  const out = await exportPng(page);
  expect(out.name).toBe('sf-citizen-digital.png');
  const png = readPng(out.bytes);
  expect([png.width, png.height]).toEqual([w, h]);
  /* 四角不透明（場景），中間是卡片 */
  for (const [x, y] of [
    [2, 2],
    [w - 3, h - 3],
  ])
    expect(png.at(x, y)[3]).toBe(255);
  /* 預覽上可以點的範圍跟著卡片移過去：點姓跳到欄位 */
  await page.locator('[data-region="field:surname"]').first().click();
  await expect(fieldInput(page, 'surname')).toBeFocused();
  /* 背景色票 */
  await tab(page, '樣式').click();
  await page.getByRole('button', { name: '背景 #ff6b6b' }).click();
  await expect.poll(async () => (await doc(page)).sf.style.digitalBg).toBe('#ff6b6b');
  expect(errors).toEqual([]);
});

test('名字產生器：地區與性別、填名與姓（大寫）、公民 ID 的性別；一步復原；複製圖片（F92、F93）', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await sfOpen(page);
  await choose(page, '地區', '日本（羅馬拼音）');
  await page.getByRole('radio', { name: '男', exact: true }).click();
  await expect
    .poll(async () => (await prefs(page))?.sfNames)
    .toEqual({ region: 'jp', gender: 'm' });
  await page.getByTestId('sf-name-gen').click();
  await expect.poll(async () => (await doc(page)).sf.values.given).not.toBe('NOVA');
  const v = (await doc(page)).sf.values;
  expect(v.given).toMatch(/^[A-Z' -]+$/);
  expect(v.surname).toMatch(/^[A-Z' -]+$/);
  expect(v.sex).toBe('M');
  await expect(fieldInput(page, 'given')).toHaveValue(v.given);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await doc(page)).sf.values.given).toBe('NOVA');
  expect((await doc(page)).sf.values.sex).toBe('F');
  /* 通行證：沒有性別，只填名、姓；操作員 ID 沒有名字欄（沒有產生器） */
  await radio(page.getByTestId('template-list'), '操作員 ID').click();
  await expect(page.getByTestId('sf-name-gen')).toHaveCount(0);
  /* 複製圖片 */
  await page.getByTestId('sf-copy').click();
  await expect(toast(page, '已複製圖片')).toBeVisible({ timeout: 30_000 });
  const type = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items[0]?.types.join(',');
  });
  expect(type).toContain('image/png');
  expect(errors).toEqual([]);
});

test('預設集：存、目前、套用（一步復原）、蓋過、匯出全部、匯入、範例（留著照片）、刪除（F94）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page);
  const list = page.getByTestId('sf-presets');
  await expect(list.locator('li')).toHaveCount(5);
  await page.getByRole('button', { name: '存成預設…' }).click();
  await page.getByTestId('sf-preset-name').fill('夜城特工');
  await page.getByTestId('sf-preset-save').click();
  await expect(toast(page, '已存成「夜城特工」')).toBeVisible();
  const row = list.locator('li').first();
  await expect(row).toContainText('夜城特工');
  await expect(row).toHaveAttribute('aria-current', 'true');
  expect(((await prefs(page))?.sfPresets as unknown[] | undefined)?.length).toBe(1);
  /* 改了內容就不是目前的；套用時先問 */
  await fieldInput(page, 'surname').fill('KANE');
  await fieldInput(page, 'surname').blur();
  await expect(row).not.toHaveAttribute('aria-current', 'true');
  await row.getByRole('button', { name: '套用預設：夜城特工' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '套用' }).click();
  await expect.poll(async () => (await doc(page)).sf.values.surname).toBe('LIN');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await doc(page)).sf.values.surname).toBe('KANE');
  /* 蓋過 */
  await row.getByRole('button', { name: '用目前的內容蓋過：夜城特工' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '用目前的內容蓋過' }).click();
  await expect(row).toHaveAttribute('aria-current', 'true');
  /* 匯出全部 */
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '匯出全部' }).click(),
  ]);
  const json = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
  expect(json.format).toBe('trpg-toolkit/id-ticket-sf-presets');
  expect(json.presets[0].sf.values.surname).toBe('KANE');
  /* 範例：換成活動證 */
  await list
    .locator('li', { hasText: '範例：展覽講者證' })
    .getByRole('button', { name: /套用/ })
    .click();
  const confirm = page.getByRole('alertdialog');
  if (await confirm.isVisible().catch(() => false))
    await confirm.getByRole('button', { name: '套用' }).click();
  await expect.poll(async () => (await doc(page)).sf.blank).toBe('event');
  expect((await doc(page)).sf.style.code).toBe('postal');
  /* 刪除，再匯入剛剛匯出的檔案 */
  await row.getByRole('button', { name: '刪除預設：夜城特工' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(list.locator('li')).toHaveCount(5);
  const chooser = await waitForFileChooser(page, () =>
    page.getByRole('button', { name: '匯入…' }).click(),
  );
  await chooser.setFiles({
    name: 'presets.json',
    mimeType: 'application/json',
    buffer: readFileSync((await dl.path()) as string),
  });
  await expect(toast(page, '已匯入 1 個預設')).toBeVisible();
  await expect(list.locator('li')).toHaveCount(6);
  expect(errors).toEqual([]);
});

/* ---------- 自組底版 ---------- */

interface Custom {
  id: string;
  name: string;
  base: string;
  items: {
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    cap: string;
    kind: string;
  }[];
}
const customs = async (page: Page) =>
  (await doc(page)).sf as unknown as { customs: Custom[]; custom: string | null };

test('自組底版：新建、欄位、加項目與設定、預覽上拖曳（吸附 10）、Delete、換外形縮放、匯出、重新整理還在、刪除（F96～F100）', async ({
  page,
}) => {
  const errors = await open(page);
  await sfOpen(page);
  await tab(page, '樣式').click();
  const ctor = page.getByTestId('sf-ctor');
  await ctor.getByRole('button', { name: '新的自組底版' }).click();
  await expect(toast(page, '已建立自組底版「CUSTOM 1」')).toBeVisible();
  const c0 = await customs(page);
  expect(c0.customs).toHaveLength(1);
  expect(c0.custom).toBe(c0.customs[0].id);
  expect(c0.customs[0].base).toBe('citizen');
  await expect(page.getByTestId('sf-canvas')).toHaveAttribute(
    'data-template',
    `custom:${c0.customs[0].id}`,
  );
  await expect(radio(page.getByTestId('template-list'), 'CUSTOM 1')).toBeChecked();
  /* 文字項目是「內容」分頁的欄位 */
  const [, nameIt, noIt] = c0.customs[0].items;
  await tab(page, '內容').click();
  await expect(fieldInput(page, nameIt.id)).toHaveValue('NOVA LIN');
  await expect(fieldInput(page, noIt.id)).toHaveValue('MP-2087-0413');
  await fieldInput(page, nameIt.id).fill('ADA KING');
  await fieldInput(page, nameIt.id).blur();
  await tab(page, '樣式').click();
  /* 加文字、設定標題與種類 */
  await ctor.getByRole('button', { name: '文字', exact: true }).click();
  const c1 = await customs(page);
  const added = c1.customs[0].items[3];
  expect(added.type).toBe('text');
  await page.getByTestId('ctor-cap').fill('EXPIRES');
  await page.getByTestId('ctor-cap').blur();
  await radio(page.getByTestId('ctor-item'), '日期').click();
  await expect
    .poll(async () => {
      const it = (await customs(page)).customs[0].items[3];
      return [it.cap, it.kind];
    })
    .toEqual(['EXPIRES', 'date']);
  expect((await doc(page)).sf.values[added.id]).toBe('2093-12-31');
  /* 預覽上拖曳（吸附 10） */
  const layer = page.getByTestId('ctor-layer');
  const item = layer.locator(`[data-layout-item="${added.id}"]`);
  await expect(item).toBeVisible();
  const box = (await item.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 47, box.y + box.height / 2 + 33, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await customs(page)).customs[0].items[3].x).not.toBe(added.x);
  const moved = (await customs(page)).customs[0].items[3];
  expect(moved.x % 10).toBe(0);
  expect(moved.y % 10).toBe(0);
  /* 方向鍵微調 1 */
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await customs(page)).customs[0].items[3].x).toBe(moved.x + 1);
  /* 拉左上角縮放：對角不動、吸附 10；Shift 維持比例 */
  const before = (await customs(page)).customs[0].items[3];
  const nw = layer.locator('[data-layout-handle="nw"]');
  const hb = (await nw.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 - 30, hb.y + hb.height / 2 - 20, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await customs(page)).customs[0].items[3].w)
    .toBeGreaterThan(before.w);
  const grown = (await customs(page)).customs[0].items[3];
  expect(grown.x + grown.w).toBe(before.x + before.w);
  expect(grown.y + grown.h).toBe(before.y + before.h);
  expect(grown.x % 10).toBe(0);
  const se = layer.locator('[data-layout-handle="se"]');
  const sb = (await se.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.keyboard.down('Shift');
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + 40, sb.y + sb.height / 2 + 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => (await customs(page)).customs[0].items[3].w)
    .toBeGreaterThan(grown.w);
  const prop = (await customs(page)).customs[0].items[3];
  expect(prop.w / prop.h).toBeCloseTo(grown.w / grown.h, 1);
  /* Delete 刪除 */
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await customs(page)).customs[0].items.length).toBe(3);
  /* 換外形：通行證（直式），版面跟著縮放 */
  await page.getByRole('combobox', { name: '外形' }).click();
  await page.getByRole('option', { name: '通行證', exact: true }).click();
  await expect.poll(async () => (await customs(page)).customs[0].base).toBe('pass');
  const photo = (await customs(page)).customs[0].items[0];
  expect(photo.x).toBe(Math.round(157 * (1000 / 1600)));
  await expect(page.getByTestId('export-dims')).toHaveText('輸出 1000 × 1600 px');
  const out = await exportPng(page);
  expect(out.name).toBe('sf-custom.png');
  expect([readPng(out.bytes).width, readPng(out.bytes).height]).toEqual([1000, 1600]);
  /* 重新整理還在 */
  await page.reload();
  await expect(page.getByTestId('sf-canvas')).toHaveAttribute(
    'data-template',
    `custom:${c0.customs[0].id}`,
  );
  expect((await doc(page)).sf.values[nameIt.id]).toBe('ADA KING');
  /* 刪除（可以復原） */
  await tab(page, '樣式').click();
  await page.getByTestId('sf-ctor').getByRole('button', { name: '刪除這個底版' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除這個底版' }).click();
  await expect.poll(async () => (await customs(page)).customs.length).toBe(0);
  expect((await doc(page)).sf.blank).toBe('pass');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await customs(page)).customs.length).toBe(1);
  expect(errors).toEqual([]);
});

/* ---------- 既有證件的浮水印與裝飾圖 ---------- */

test('證件的浮水印：印在哪一面；關掉後匯出和原本逐位元組相同（F95）', async ({ page }) => {
  const errors = await open(page);
  const base = (await exportPng(page)).bytes;
  await showSide(page, '背面');
  const baseBack = (await exportPng(page)).bytes;
  await showSide(page, '正面');
  await tab(page, '樣式').click();
  const wm = page.getByTestId('id-watermark');
  await radio(wm, '文字').click();
  await expect.poll(async () => (await doc(page)).idDecor.watermark.mode).toBe('text');
  const withWm = (await exportPng(page)).bytes;
  expect(same(withWm, base)).toBe(false);
  /* 只印在正面：背面和原本相同 */
  await radio(wm, '正面').click();
  await expect.poll(async () => (await doc(page)).idDecor.side).toBe('front');
  await showSide(page, '背面');
  expect(same((await exportPng(page)).bytes, baseBack)).toBe(true);
  await showSide(page, '正面');
  /* 關掉：和原本逐位元組相同 */
  await radio(wm, '關').click();
  expect(same((await exportPng(page)).bytes, base)).toBe(true);
  expect(errors).toEqual([]);
});

test('證件的裝飾圖：每一面各自；預覽上拖曳；Delete 刪除；刪掉後匯出和原本相同（F95）', async ({
  page,
}) => {
  const errors = await open(page);
  const base = (await exportPng(page)).bytes;
  await tab(page, '樣式').click();
  await page
    .getByRole('group', { name: '放入裝飾圖' })
    .locator('input[type=file]')
    .setInputFiles([{ name: 'ring.png', mimeType: 'image/png', buffer: await ringPng() }]);
  const crop = page.getByRole('dialog', { name: '裁切裝飾圖' });
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: '確定' }).click();
  await expect.poll(async () => (await doc(page)).idDecor.elements.employee.front.length).toBe(1);
  expect((await doc(page)).idDecor.elements.employee.back).toHaveLength(0);
  const el = (await doc(page)).idDecor.elements.employee.front[0];
  expect(el.x).toBeCloseTo(0.5, 2);
  /* 拖曳 */
  const item = page.locator(`[data-layout-item="${el.id}"]`).last();
  await expect(item).toBeVisible();
  const box = (await item.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await doc(page)).idDecor.elements.employee.front[0].x)
    .toBeLessThan(0.4);
  expect(same((await exportPng(page)).bytes, base)).toBe(false);
  /* 背面沒有 */
  await showSide(page, '背面');
  await expect(page.getByRole('list', { name: '這一款背面的裝飾圖' })).toHaveCount(0);
  await showSide(page, '正面');
  /* Delete 刪除選取的 */
  await page
    .getByRole('list', { name: '這一款正面的裝飾圖' })
    .getByRole('listitem')
    .first()
    .click();
  await page.locator(`[data-layout-item="${el.id}"]`).last().click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await doc(page)).idDecor.elements.employee.front.length).toBe(0);
  expect(same((await exportPng(page)).bytes, base)).toBe(true);
  expect(errors).toEqual([]);
});

test('390 寬沒有橫向捲動（SF 證件的新區塊、證件的浮水印與裝飾圖）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await tab(page, '樣式').click();
  await radio(page.getByTestId('id-watermark'), '文字').click();
  await noHorizontalScroll(page);
  await tab(page, '內容').click();
  await sfOpen(page);
  await noHorizontalScroll(page);
  await tab(page, '樣式').click();
  await page.getByRole('switch', { name: '數位證件模式' }).click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
