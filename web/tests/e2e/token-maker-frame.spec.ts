/**
 * VTT 棋子產生器 2026-11-12 跟進 token-workshop（70f1503）的端對端測試（規格 1.11、F90～F95、3.13）：
 * - 畫布邊界：預覽的虛線（「更多」選單開關、記住）、手動邊距時出框超出畫布變紅；
 * - 讓出框配合畫布邊界：往下推、縮小到剛好（自動邊距改成手動 0%，和擺放同一步復原）；
 * - 畫布貼合：斜角的出框時外框比以前的算法大，匯出的圖上出框碰到畫布的邊、外框還在中間；
 * - 外緣淡出：匯出的 PNG 在外半徑＋1 px 以外沒有外框的像素（鎖鏈停用、霓虹不顯示）；
 * - 滑桿：拖曳中重算（自動的靈敏度停 0.26 秒會重新自動選取）不會動到滑桿、放開時以滑桿的位置為準、很快點兩下不會重設；
 * - 配合外框調整圖片的顏色（原作 ce4c62b 的 Match picture colour to ring）；
 * - 自動儲存與專案檔：版本 3 帶著新的欄位，版本 2 的存檔照讀（新的欄位是以前的畫法）；390／360／320 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('token-maker') ?? { id: 'token-maker', status: 'next' })}/`;
const N = 1024;
const KEY = 'trpg-toolkit:token-maker';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];
const GREEN: Rgba = [40, 160, 60, 255];
const SKIN: Rgba = [240, 200, 160, 255];
const BLUE: Rgba = [40, 80, 220, 255];
const PURPLE: Rgba = [130, 40, 160, 255];

/** 400 × 400 不透明：綠底、中間膚色的頭、上面藍色的帽子（x 150～250、y 10～70）、下面紫色的身體 */
async function heroPng(): Promise<Buffer> {
  const w = 400;
  const h = 400;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c =
        x >= 150 && x < 250 && y >= 10 && y < 70
          ? BLUE
          : (x - 200) ** 2 + (y - 160) ** 2 < 90 ** 2
            ? SKIN
            : y > 280 && Math.abs(x - 200) < 150
              ? PURPLE
              : GREEN;
      px.set(c, (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

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
  await expect(page.getByRole('heading', { level: 1, name: 'VTT 棋子產生器' })).toBeVisible();
  return errors;
}

interface View {
  x: number;
  y: number;
  zoom: number;
  rotate: number;
  flip: boolean;
}
interface Token {
  id: string;
  image: { id: string; name: string; width: number; height: number } | null;
  view: View;
  mask: { id: string; width: number; height: number } | null;
  adjust: { bright: number; contrast: number; sat: number; hue: number };
}
interface Doc {
  look: Record<string, unknown>;
  tokens: Token[];
  current: string | null;
}
interface Overflow {
  l: number;
  r: number;
  t: number;
  b: number;
  L: number;
}
type Hook = {
  __tokenMaker: {
    doc: () => Doc;
    prefs: () => Record<string, unknown>;
    pad: () => number;
    overflow: () => Overflow | null;
  };
};

const doc = (page: Page): Promise<Doc> =>
  page.evaluate(() => (window as never as Hook).__tokenMaker.doc());
const prefs = (page: Page) => page.evaluate(() => (window as never as Hook).__tokenMaker.prefs());
const look = async (page: Page) => (await doc(page)).look;
const cur = async (page: Page) => {
  const d = await doc(page);
  return d.tokens.find((t) => t.id === d.current) as Token;
};
const padOf = (page: Page): Promise<number> =>
  page.evaluate(() => (window as never as Hook).__tokenMaker.pad());
const overflowOf = (page: Page) =>
  page.evaluate(() => (window as never as Hook).__tokenMaker.overflow());
const maxOver = (o: Overflow | null) => (o ? Math.max(o.l, o.r, o.t, o.b) : Number.NaN);

const dropInput = (page: Page) =>
  page.getByRole('group', { name: '圖片載入區' }).locator('input[type=file]');
const layer = (page: Page) => page.getByTestId('token-interaction');
const tab = (page: Page, name: '圖片' | '出框' | '外框' | '名字' | '效果' | '匯出') =>
  page.getByRole('tab', { name });
const frame = (page: Page) => page.getByTestId('image-frame');
const ratio = (page: Page) => page.getByTestId('selection-ratio');

async function loadImage(page: Page, buffer: Buffer, name = 'hero.png') {
  await dropInput(page).setInputFiles(file(name, buffer));
  await expect(page.getByTestId('image-info')).toContainText(name);
  await expect(layer(page)).toBeVisible();
  await expect.poll(async () => (await cur(page))?.image?.name).toBe(name);
}

/** 圖片的 px → 螢幕座標（依目前的擺放與邊距） */
async function imageToScreen(page: Page, u: number, v: number) {
  const t = await cur(page);
  const pad = await padOf(page);
  const img = t.image as NonNullable<Token['image']>;
  const R = N * (0.5 - pad);
  const s = ((2 * R) / Math.min(img.width, img.height)) * t.view.zoom;
  const a = (t.view.rotate * Math.PI) / 180;
  const f = t.view.flip ? -1 : 1;
  const lx = (u - img.width / 2) * s * f;
  const ly = (v - img.height / 2) * s;
  const x = N / 2 + t.view.x * R + lx * Math.cos(a) - ly * Math.sin(a);
  const y = N / 2 + t.view.y * R + lx * Math.sin(a) + ly * Math.cos(a);
  const b = await layer(page).boundingBox();
  if (!b) throw new Error('找不到預覽');
  return { x: b.x + (x / N) * b.width, y: b.y + (y / N) * b.height };
}

/** 讀圖、用魔術棒點帽子（出框），回到移動工具 */
async function heroWithHat(page: Page) {
  await loadImage(page, await heroPng());
  await page.keyboard.press('w');
  const hat = await imageToScreen(page, 200, 40);
  await page.mouse.click(hat.x, hat.y);
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  await page.keyboard.press('v');
}

/** 焦點不在欄位上時按方向鍵（移動圖片 5% R） */
async function nudge(page: Page, key: string, times: number) {
  await page.locator('body').click({ position: { x: 5, y: 880 } });
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

interface Png {
  width: number;
  height: number;
  at(x: number, y: number): Rgba;
}

function readPng(bytes: Uint8Array): Png {
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
  return {
    width: ihdr.width,
    height: ihdr.height,
    at: (x, y) => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

async function downloadPng(page: Page): Promise<Png> {
  await tab(page, '匯出').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載 PNG' }).click(),
  ]);
  return readPng(readFileSync((await dl.path()) as string));
}

const near = (p: Rgba, c: Rgba, tol: number) =>
  Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function menu(page: Page, item: string | RegExp) {
  await page.getByTestId('mask-menu').click();
  await page.getByRole('menuitem', { name: item }).click();
}

/* ---------- 測試 ---------- */

test('畫布邊界：預覽上的虛線（「更多」選單開關、重新整理後記得）；手動邊距、出框超出時變紅', async ({
  page,
}) => {
  const errors = await open(page);
  /* 還沒有圖片：沒有畫布邊界 */
  await expect(frame(page)).toHaveCount(0);
  await heroWithHat(page);
  await expect(frame(page)).toBeVisible();
  await expect(frame(page)).not.toHaveAttribute('data-over');
  /* 只在預覽：匯出的圖四角透明（沒有畫到線） */
  const png = await downloadPng(page);
  for (const [x, y] of [
    [0, 0],
    [511, 0],
    [0, 511],
    [511, 511],
  ] as [number, number][])
    expect(png.at(x, y)[3]).toBe(0);

  /* 手動邊距 0%、圖片往上移 0.3 R：帽子超出畫布的上面 → 紅色 */
  await tab(page, '出框').click();
  await page.getByRole('switch', { name: '自動邊距' }).click();
  await page.getByRole('spinbutton', { name: '邊距' }).fill('0');
  await page.getByRole('spinbutton', { name: '邊距' }).press('Enter');
  await expect.poll(() => padOf(page)).toBe(0);
  await expect(frame(page)).not.toHaveAttribute('data-over');
  await nudge(page, 'Shift+ArrowUp', 6);
  await expect.poll(async () => (await cur(page)).view.y).toBeCloseTo(-0.3);
  await expect(frame(page)).toHaveAttribute('data-over', 'true');
  await expect(page.getByTestId('fit-info')).toHaveText(
    /^出框超出畫布：上 1[23]%（外框直徑的比例）。$/,
  );
  /* 自動邊距：不會超出，不紅；復原回到手動 0% 又變紅 */
  await page.getByRole('switch', { name: '自動邊距' }).click();
  await expect(frame(page)).not.toHaveAttribute('data-over');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await look(page)).autoMargin).toBe(false);
  await expect(frame(page)).toHaveAttribute('data-over', 'true');

  /* 「更多」選單：不顯示 → 重新整理之後還是不顯示 → 再打開 */
  await menu(page, '不顯示畫布邊界');
  await expect(frame(page)).toHaveCount(0);
  expect((await prefs(page)).showFrame).toBe(false);
  await page.reload();
  await expect(layer(page)).toBeVisible();
  await expect(frame(page)).toHaveCount(0);
  await menu(page, '顯示畫布邊界');
  await expect(frame(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('讓出框配合畫布邊界：往下推、縮小到剛好（自動邊距改成手動 0%，同一步復原）；沒有出框時停用', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await tab(page, '出框').click();
  const scale = page.getByRole('button', { name: '縮小到剛好' });
  const down = page.getByRole('button', { name: '往下推' });
  /* 還沒有出框：停用 */
  await expect(scale).toBeDisabled();
  await expect(down).toBeDisabled();
  await expect(page.getByTestId('fit-info')).toContainText('先在「出框」分頁選好要出框的部分');

  await page.keyboard.press('w');
  const hat = await imageToScreen(page, 200, 40);
  await page.mouse.click(hat.x, hat.y);
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  await page.keyboard.press('v');
  await nudge(page, 'Shift+ArrowUp', 6);
  await expect.poll(async () => (await cur(page)).view.y).toBeCloseTo(-0.3);
  await expect(page.getByTestId('fit-info')).toContainText('自動邊距會讓畫布剛好容得下出框');
  await expect(scale).toBeEnabled();

  /* 縮小到剛好：自動邊距關掉、邊距 0%、出框都在畫布裡 */
  await scale.click();
  await expect.poll(async () => (await look(page)).autoMargin).toBe(false);
  expect((await look(page)).margin).toBe(0);
  await expect(
    page.getByText('自動邊距已關掉，邊距改成手動 0%（所有棋子共用）。', { exact: true }).first(),
  ).toBeVisible();
  const o = await overflowOf(page);
  expect(maxOver(o)).toBeLessThanOrEqual(0.003);
  expect(maxOver(o)).toBeGreaterThan(-0.01);
  const t = await cur(page);
  expect(t.view.zoom).toBeLessThan(1);
  expect(t.view.y).toBeCloseTo(-0.3 * t.view.zoom, 6);
  await expect(page.getByTestId('fit-info')).toHaveText('出框都在畫布裡。');
  await expect(frame(page)).not.toHaveAttribute('data-over');
  /* 一步復原：擺放與自動邊距一起回來 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await look(page)).autoMargin).toBe(true);
  expect((await cur(page)).view).toMatchObject({ zoom: 1 });
  expect((await cur(page)).view.y).toBeCloseTo(-0.3);

  /* 往下推：上面收進畫布；往上推：下面本來就在畫布裡 */
  await down.click();
  await expect.poll(async () => (await look(page)).autoMargin).toBe(false);
  await expect.poll(async () => (await overflowOf(page))?.t ?? 1).toBeLessThanOrEqual(0.003);
  expect((await cur(page)).view.zoom).toBe(1);
  await expect(page.getByText('推好了，出框都在畫布裡。').first()).toBeVisible();
  const y = (await cur(page)).view.y;
  await page.getByRole('button', { name: '往上推' }).click();
  await expect(page.getByText('那一邊已經在畫布裡，不用推。').first()).toBeVisible();
  expect((await cur(page)).view.y).toBe(y);
  /* 已經放得下時「縮小到剛好」不改縮放 */
  await scale.click();
  await expect(page.getByText('已經放得下了。').first()).toBeVisible();
  expect((await cur(page)).view.zoom).toBe(1);
  expect(errors).toEqual([]);
});

test('讓出框配合畫布邊界：自動邊距改成手動 0% 時，通知寫出名單裡其他棋子有幾個的出框會超出畫布', async ({
  page,
}) => {
  const errors = await open(page);
  const hero = await heroPng();
  await dropInput(page).setInputFiles([
    file('hero1.png', hero),
    file('hero2.png', hero),
    file('hero3.png', hero),
  ]);
  const roster = page.getByRole('list', { name: '棋子名單' });
  await expect(roster.getByRole('listitem')).toHaveCount(3);
  /* 每個棋子點帽子出框；第 1、2 個往上移 0.3 R（手動 0% 時帽子會超出畫布），第 3 個不動（放得下） */
  for (const [i, up] of [
    [0, true],
    [1, true],
    [2, false],
  ] as [number, boolean][]) {
    await tab(page, '圖片').click();
    await roster.getByRole('listitem').nth(i).click();
    await expect
      .poll(async () => {
        const d = await doc(page);
        return d.current === d.tokens[i].id;
      })
      .toBe(true);
    await page.locator('body').click({ position: { x: 5, y: 880 } });
    await page.keyboard.press('w');
    const hat = await imageToScreen(page, 200, 40);
    await page.mouse.click(hat.x, hat.y);
    await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
    await page.keyboard.press('v');
    if (up) {
      await nudge(page, 'Shift+ArrowUp', 6);
      await expect.poll(async () => (await cur(page)).view.y).toBeCloseTo(-0.3);
    }
  }
  /* 在第 1 個按「縮小到剛好」：第 2 個會超出、第 3 個不會 → 「另外 1 個」 */
  await tab(page, '圖片').click();
  await roster.getByRole('listitem').nth(0).click();
  await tab(page, '出框').click();
  await page.getByRole('button', { name: '縮小到剛好' }).click();
  await expect(
    page
      .getByText(
        '自動邊距已關掉，邊距改成手動 0%（所有棋子共用）。另外 1 個棋子的出框會超出畫布，可以復原。',
      )
      .first(),
  ).toBeVisible();
  await expect.poll(async () => (await look(page)).autoMargin).toBe(false);
  /* 復原：一步回到自動邊距 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await look(page)).autoMargin).toBe(true);
  /* 第 2 個也放下來：其他棋子都放得下時不寫這一句 */
  await tab(page, '圖片').click();
  await roster.getByRole('listitem').nth(1).click();
  await nudge(page, 'Shift+ArrowDown', 6);
  await expect.poll(async () => (await cur(page)).view.y).toBeCloseTo(0);
  await tab(page, '圖片').click();
  await roster.getByRole('listitem').nth(0).click();
  await tab(page, '出框').click();
  await page.getByRole('button', { name: '往下推' }).click();
  const note = page.getByText(/^自動邊距已關掉，邊距改成手動 0%（所有棋子共用）。/).first();
  await expect(note).toBeVisible();
  await expect(note).not.toContainText('另外');
  expect(errors).toEqual([]);
});

test('畫布貼合：斜角的出框時外框比以前的算法大，匯出的圖上出框碰到畫布的邊、外框還在中間', async ({
  page,
}) => {
  const errors = await open(page);
  await heroWithHat(page);
  /* 帽子移到右上：離中心最遠的距離比上下左右的範圍大很多 */
  await nudge(page, 'Shift+ArrowUp', 10);
  await nudge(page, 'Shift+ArrowRight', 10);
  await expect.poll(async () => (await cur(page)).view.x).toBeCloseTo(0.5);
  await tab(page, '出框').click();
  const tight = page.getByRole('switch', { name: '畫布貼合' });
  await expect(tight).not.toBeChecked();
  const oldPad = await padOf(page);
  expect(oldPad).toBeGreaterThan(0.15);

  const firstBlueRow = (p: Png) => {
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++) if (near(p.at(x, y), BLUE, 30)) return y;
    return -1;
  };
  const before = await downloadPng(page);
  expect(firstBlueRow(before)).toBeGreaterThan(8);

  await tab(page, '出框').click();
  await tight.click();
  await expect(tight).toBeChecked();
  expect((await look(page)).tightFit).toBe(true);
  const pad = await padOf(page);
  expect(pad).toBeLessThan(oldPad - 0.02);
  const after = await downloadPng(page);
  /* 帽子碰到畫布的上面（不留空），外框還在中間：中心正下方的外框上不是圖片的顏色 */
  expect(firstBlueRow(after)).toBeLessThanOrEqual(1);
  const R = 512 * (0.5 - pad);
  for (const [x, y] of [
    [256 - R + 3, 256],
    [256, 256 + R - 3],
  ])
    expect(after.at(Math.round(x), Math.round(y))[3]).toBe(255);
  for (const [x, y] of [
    [256 - R - 3, 256],
    [256, 256 + R + 3],
  ])
    expect(after.at(Math.round(x), Math.round(y))[3]).toBe(0);
  /* 一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await look(page)).tightFit).toBe(false);
  /* 手動邊距時不顯示這個開關 */
  await tab(page, '出框').click();
  await page.getByRole('switch', { name: '自動邊距' }).click();
  await expect(tight).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('外緣淡出：浮雕環的外半徑＋1 px 以外沒有外框的像素、裡面不變；鎖鏈停用、霓虹不顯示', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await tab(page, '外框').click();
  const styles = page.getByRole('radiogroup', { name: '外框樣式' });
  await styles.getByRole('radio', { name: '齒輪', exact: true }).click();
  const fade = page.getByRole('switch', { name: '外緣淡出' });
  await expect(fade).not.toBeChecked();
  const pad = await padOf(page);
  const R = 512 * (0.5 - pad);
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - 256, y + 0.5 - 256);
  const off = await downloadPng(page);
  await tab(page, '外框').click();
  await fade.click();
  await expect.poll(async () => (await look(page)).edgeFade).toBe(true);
  const on = await downloadPng(page);
  let outside = 0;
  let innerDiff = 0;
  let bandOn = 0;
  let bandOff = 0;
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const d = dist(x, y);
      const a = on.at(x, y);
      if (d > R + 1.05 && a[3] > 0) outside++;
      if (d < R - 1.5 && a.some((v, i) => v !== off.at(x, y)[i])) innerDiff++;
      if (d > R && d <= R + 1.05) {
        bandOn += a[3];
        bandOff += off.at(x, y)[3];
      }
    }
  expect(outside).toBe(0);
  expect(innerDiff).toBe(0);
  expect(bandOn).toBeLessThan(bandOff);

  /* 鎖鏈：停用（本來就伸出外緣）；霓虹與幾何：不顯示 */
  await tab(page, '外框').click();
  await styles.getByRole('radio', { name: '鎖鏈', exact: true }).click();
  await expect(fade).toBeDisabled();
  await expect(page.getByText('鎖鏈、寶石本來就伸出外緣，不套用外緣淡出。')).toBeVisible();
  await styles.getByRole('radio', { name: '細環', exact: true }).click();
  await expect(fade).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('配合外框調整圖片的顏色：目前棋子的飽和度跟著外框改、亮度與對比不動；一步復原', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '外框').click();
  const btn = page.getByRole('button', { name: '配合外框調整' });
  await expect(btn).toBeDisabled();
  await tab(page, '圖片').click();
  await loadImage(page, await heroPng());
  await tab(page, '外框').click();
  await btn.click();
  const toast = page.getByText(/^已配合外框把圖片的飽和度調成 \d+%（亮度不變）。$/).first();
  await expect(toast).toBeVisible();
  const sat = Number((await toast.textContent())?.match(/(\d+)%/)?.[1]);
  const adj = (await cur(page)).adjust;
  expect(adj).toEqual({ bright: 100, contrast: 100, sat, hue: 0 });
  expect(sat).toBeGreaterThanOrEqual(70);
  expect(sat).toBeLessThanOrEqual(130);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await cur(page)).adjust.sat).toBe(100);
  expect(errors).toEqual([]);
});

test('滑桿：拖曳中重算不會動到滑桿、放開時以滑桿的位置為準；很快點兩下不會重設', async ({
  page,
}) => {
  const errors = await open(page);
  await loadImage(page, await heroPng());
  await tab(page, '出框').click();
  const thumb = page.getByRole('slider', { name: '自動的靈敏度' });
  await thumb.scrollIntoViewIfNeeded();
  const root = thumb.locator('xpath=ancestor::span[contains(@class,"touch-none")][1]');
  const bb = await root.boundingBox();
  if (!bb) throw new Error('找不到滑桿');
  const X = (f: number) => bb.x + bb.width * f;
  const y = bb.y + bb.height / 2;
  const value = async () => Number(await thumb.getAttribute('aria-valuenow'));
  await expect(ratio(page)).toHaveText('還沒有選取');

  /* 按住拖到 60%，停住：0.26 秒後重新自動選取（預覽換成新的選取），滑桿不動 */
  await page.mouse.move(X(0.3), y);
  await page.mouse.down();
  await page.mouse.move(X(0.6), y, { steps: 6 });
  const held = await value();
  expect(held).toBeGreaterThan(45);
  await expect(ratio(page)).toHaveText(/已選取圖片的/);
  expect(await value()).toBe(held);
  await expect(page.getByRole('spinbutton', { name: '自動的靈敏度' })).toHaveValue(String(held));
  expect((await cur(page)).mask).toBeNull();
  /* 放開：設定、滑桿、數字欄都是滑桿的位置，選取存成一步 */
  await page.mouse.up();
  await expect.poll(async () => (await cur(page)).mask).not.toBeNull();
  expect((await prefs(page)).autoSens).toBe(held);
  expect(await value()).toBe(held);

  /* 很快點兩下（兩次抓取）：滑桿跑到點的地方，不會回到預設的 50 */
  await page.mouse.dblclick(X(0.85), y);
  await expect.poll(async () => (await prefs(page)).autoSens).toBe(await value());
  expect(await value()).toBeGreaterThan(75);
  expect(errors).toEqual([]);
});

test('自動儲存與專案檔：版本 3 帶著畫布貼合與外緣淡出；版本 2 的存檔照讀（以前的畫法）', async ({
  page,
}) => {
  /* 以前（版本 2）存的：外觀沒有這兩個欄位 */
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      key,
      JSON.stringify({
        state: {
          data: {
            look: { frame: 'gear', count: 24, depth: 55, autoMargin: true, gMid: 50 },
            tokens: [],
            current: null,
            custom: { frame: null, mask: null },
          },
        },
        version: 2,
      }),
    );
  }, KEY);
  const errors = await open(page);
  const l = await look(page);
  expect(l).toMatchObject({ frame: 'gear', tightFit: false, edgeFade: false });

  await loadImage(page, await heroPng());
  await tab(page, '出框').click();
  await page.getByRole('switch', { name: '畫布貼合' }).click();
  await tab(page, '外框').click();
  await page.getByRole('switch', { name: '外緣淡出' }).click();
  await page.waitForFunction((key) => {
    const s = JSON.parse(localStorage.getItem(key) ?? '{}');
    return s.version === 3 && s.state?.data?.look?.edgeFade === true;
  }, KEY);
  /* 專案檔：project.json 是版本 3、帶著兩個欄位 */
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const zipPath = (await dl.path()) as string;
  const zip = unzipSync(new Uint8Array(readFileSync(zipPath)));
  const project = JSON.parse(strFromU8(zip['project.json']));
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'token-maker',
    version: 3,
  });
  expect(project.data.look).toMatchObject({ tightFit: true, edgeFade: true });
  /* 全部重來（以前的畫法）→ 開啟專案檔：回來 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect.poll(async () => (await look(page)).tightFit).toBe(false);
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(zipPath);
  await expect.poll(async () => (await look(page)).tightFit).toBe(true);
  expect((await look(page)).edgeFade).toBe(true);
  expect(errors).toEqual([]);
});

test('390／360／320 寬：出框、外框、圖片分頁沒有橫向捲動，推的按鈕排得下', async ({ page }) => {
  const errors = await open(page);
  await heroWithHat(page);
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const t of ['圖片', '出框', '外框'] as const) {
      await tab(page, t).click();
      await noHorizontalScroll(page);
    }
    await tab(page, '出框').click();
    for (const name of ['縮小到剛好', '往左推', '往右推', '往上推', '往下推']) {
      const b = await page.getByRole('button', { name }).boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= width).toBe(true);
    }
    await expect(frame(page)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
