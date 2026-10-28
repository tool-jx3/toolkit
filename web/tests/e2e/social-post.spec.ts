/**
 * 社群貼文產生器（建置產物 tools/social-post/）的端對端測試（規格 docs/refactor/specs/social-post.md）：
 * - 開頁沒有錯誤、預設的範例內容、頁尾只有靈感來源、介面沒有商標字樣；
 * - 貼文：清單（新增、複製、往後、刪除）、照片（加入、選取、拿掉、拖曳與滾輪調整位置、調整範圍）、比例、帳號列、反應、內文；
 * - 留言：疊在貼文上、面板高度、留言的欄位與勾選、新增、關閉留言；
 * - 限時動態：版面、格子（點空格子放照片、拖曳）、背景、貼紙（加入、選取、拖曳、滾輪、Shift＋滾輪、Delete）、畫面上的介面；
 * - 個人頁：點縮圖到貼文、點精選動態到限時動態、底部分頁列、精選動態、其他照片；帳號與畫面：帳號、狀態列、時間、字級、深色；
 * - 圖片網址（成功、跨網域讀不到、雲端硬碟連結的轉換）、整個視窗拖放、貼上；
 * - 匯出：PNG（四種畫面的尺寸、倍率、像素與預覽一致）、HTML（只有這個畫面、全部；結構、沒有外部資源、在瀏覽器裡點）；
 * - 自動儲存與還原（含照片）、復原／重做、專案檔、重設；390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 * 兩次修改之間至少隔 450 ms（自動儲存與復原的步驟分開）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('social-post') ?? { id: 'social-post', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:social-post';
const PREFS_KEY = 'trpg-toolkit:social-post:preview';
const K = 3;

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];

/* ---------- 共用 ---------- */

async function solidPng(rgb: [number, number, number], w = 120, h = 90): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([...rgb, 255], i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 左半紅、右半藍 */
async function halfPng(w = 300, h = 200): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      px.set(x < w / 2 ? [210, 40, 40, 255] : [40, 70, 210, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 橫圖（藍底）：右邊 stripe px 是綠色的直條（判斷照片的右邊有沒有貼齊框） */
async function stripePng(w = 300, h = 200, stripe = 12): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      px.set(x >= w - stripe ? [40, 200, 60, 255] : [40, 70, 210, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '社群貼文產生器' })).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  return errors;
}

const settle = (page: Page) => page.waitForTimeout(450);
const canvas = (page: Page) => page.getByTestId('sp-canvas');
const tab = (
  page: Page,
  name: '貼文' | '留言' | '限時動態' | '個人頁' | '首頁動態' | '私訊' | '帳號與畫面',
) => page.getByRole('tab', { name, exact: true });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const dialog = (page: Page) => page.getByRole('dialog');
const alertDialog = (page: Page) => page.getByRole('alertdialog');
const sw = (page: Page, name: string) => page.getByRole('switch', { name, exact: true });
const textbox = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const exportPanel = (page: Page) => page.getByRole('region', { name: '匯出' });

interface Stored {
  theme: string;
  profile: { username: string; avatar: { kind: string; name?: string } | null; verified: boolean };
  screen: { status: boolean; clock: string; fontScale: number };
  posts: {
    id: string;
    photos: {
      id: string;
      image: { kind: string; name?: string };
      place: { zoom: number; x: number; y: number };
    }[];
    current: number;
    ratio: string;
    caption: string;
    countStyle: string;
    commentsOff: boolean;
    friend: boolean;
    owner: { username: string };
    inFeed: boolean;
    thumb: { zoom: number };
    sheet: {
      backdrop: boolean;
      height: string;
      items: { id: string; username: string; author: boolean; text: string }[];
    };
  }[];
  stories: {
    id: string;
    layout: string;
    cells: {
      image: { kind: string; name?: string } | null;
      place: { zoom: number; x: number; y: number };
    }[];
    bg: string;
    stickers: {
      id: string;
      type: string;
      x: number;
      y: number;
      scale: number;
      rot: number;
      text?: string;
    }[];
    showTop: boolean;
    bottom: string;
    friend: boolean;
    seen: boolean;
    count: number;
  }[];
  feed: { logo: string; heartDot: boolean; dmBadge: string; myStories: string[] };
  dm: {
    c1: string;
    c2: string;
    threads: {
      id: string;
      username: string;
      name: string;
      unread: boolean;
      messages: {
        id: string;
        from: string;
        text: string;
        image: { kind: string; name?: string } | null;
        react: string;
      }[];
    }[];
  };
  account: {
    nav: boolean;
    highlights: { id: string; title: string; story: string | null }[];
    grid: { id: string; image: { kind: string; name?: string } }[];
  };
}

async function state(page: Page): Promise<Stored> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
}

async function prefs(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    PREFS_KEY,
  );
}

interface Layout {
  width: number;
  height: number;
  parts: Record<string, { x: number; y: number; width: number; height: number }>;
  hits: { key: string; box: { x: number; y: number; width: number; height: number } }[];
}

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() =>
    (window as unknown as { __socialPost: { layout: () => Layout } }).__socialPost.layout(),
  );
}

/** 預覽畫布上一點的顏色（畫面單位） */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y, k]) => {
      const d = (el as HTMLCanvasElement)
        .getContext('2d')
        ?.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as Rgba;
    },
    [x, y, K],
  );
}

const near = (a: number[], b: number[], tol = 12) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

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
  return {
    width: ihdr.width,
    height: ihdr.height,
    at: (x: number, y: number): Rgba => {
      const k = (y * ihdr.width + x) * 4;
      return [px[k], px[k + 1], px[k + 2], px[k + 3]];
    },
  };
}

/** 匯出並下載 */
async function exportFile(page: Page, format: 'PNG' | 'HTML 檔', scope?: '只有這個畫面' | RegExp) {
  const panel = exportPanel(page);
  await panel.getByRole('radio', { name: format, exact: true }).click();
  if (scope) await panel.getByRole('radio', { name: scope }).click();
  await panel.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 在一個元素的中央按下、拖曳 (dx, dy) 螢幕 px、放開 */
async function drag(page: Page, el: Locator, dx: number, dy: number) {
  const b = await el.boundingBox();
  if (!b) throw new Error('no box');
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

async function wheel(page: Page, el: Locator, deltaY: number, shift = false) {
  const b = await el.boundingBox();
  if (!b) throw new Error('no box');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.wheel(0, deltaY);
  if (shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(120);
}

const BRAND = /instagram|insta\b|\bIG\b/i;
/** HTML 裡的文字（拿掉 data URL 的內容，base64 可能剛好有這些字母） */
const textOf = (html: string) => html.replace(/data:[^"]+/g, 'data:');

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、範例內容、頁尾只有靈感來源、沒有商標字樣（F02、F13、D1、D2、F110）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：貼文 1');
  await expect(canvas(page)).toHaveAttribute('data-screen', 'post');
  const l = await layout(page);
  expect(l.width).toBe(390);
  expect(l.parts.media).toEqual({ x: 0, y: 110, width: 390, height: 487.5 });
  await expect(canvas(page)).toHaveAttribute('data-size', `1170x${Math.round(l.height * K)}`);
  const s = await state(page);
  expect(s.posts).toHaveLength(2);
  expect(s.stories).toHaveLength(2);
  expect(s.profile.username).toBe('xiaoyu.lin');
  /* 頁尾 */
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link', { name: 's2ndrome/4layout' })).toHaveAttribute(
    'href',
    'https://s2ndrome.github.io/4layout/',
  );
  /* 每個分頁都沒有商標字樣 */
  for (const t of [
    '貼文',
    '留言',
    '限時動態',
    '個人頁',
    '首頁動態',
    '私訊',
    '帳號與畫面',
  ] as const) {
    await tab(page, t).click();
    expect(await page.locator('body').innerText()).not.toMatch(BRAND);
  }
  expect(await page.title()).not.toMatch(BRAND);
  expect(errors).toEqual([]);
});

/* ---------- 貼文 ---------- */

test('貼文清單：新增、選取、複製、往後、刪除（確認、可以復原）（F13～F17）', async ({ page }) => {
  const errors = await open(page);
  const list = page.getByRole('group', { name: '貼文清單' });
  await page.getByRole('button', { name: '新增貼文' }).click();
  await settle(page);
  let s = await state(page);
  expect(s.posts.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  expect(s.posts[2].photos).toEqual([]);
  await expect(list.getByRole('button', { name: '貼文 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：貼文 3');
  /* 選貼文 1、複製 */
  await list.getByRole('button', { name: '貼文 1' }).click();
  await page.getByRole('button', { name: '複製', exact: true }).first().click();
  await expect(toast(page, '已複製貼文')).toBeVisible();
  await settle(page);
  s = await state(page);
  expect(s.posts).toHaveLength(4);
  expect(s.posts[1].caption).toBe(s.posts[0].caption);
  expect((await prefs(page)).postId).toBe(s.posts[1].id);
  /* 往後 */
  const copyId = s.posts[1].id;
  await page.getByRole('button', { name: '往後' }).first().click();
  await settle(page);
  s = await state(page);
  expect(s.posts[2].id).toBe(copyId);
  /* 刪除（確認） */
  await page.getByRole('button', { name: '刪除', exact: true }).first().click();
  await expect(alertDialog(page)).toContainText('刪除貼文 3？');
  await alertDialog(page).getByRole('button', { name: '刪除' }).click();
  await settle(page);
  s = await state(page);
  expect(s.posts.map((p) => p.id)).not.toContain(copyId);
  /* 復原 */
  await page.getByRole('button', { name: /^復原/ }).click();
  await settle(page);
  expect((await state(page)).posts.map((p) => p.id)).toContain(copyId);
  expect(errors).toEqual([]);
});

test('照片：加入（多張）、選取、拿掉、比例、在預覽上拖曳與滾輪、調整範圍、回到預設、格狀縮圖（F18～F22、F35）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 選貼文 2（1 張） → 加入 2 張 */
  await page
    .getByRole('group', { name: '貼文清單' })
    .getByRole('button', { name: '貼文 2' })
    .click();
  await page
    .getByRole('group', { name: '加入照片' })
    .locator('input[type=file]')
    .setInputFiles([
      file('red.png', await solidPng([200, 40, 40])),
      file('half.png', await halfPng()),
    ]);
  await expect(toast(page, '已加入 2 張圖片')).toBeVisible();
  await settle(page);
  let s = await state(page);
  let post = s.posts[1];
  expect(post.photos.map((p) => p.image.name ?? p.image.kind)).toEqual([
    'sample',
    'red.png',
    'half.png',
  ]);
  expect(post.current).toBe(1);
  /* 預覽：輪播的膠囊與照片的顏色 */
  let l = await layout(page);
  const m = l.parts.media;
  expect(near(await pixel(page, m.x + 20, m.y + m.height / 2), [200, 40, 40])).toBe(true);
  /* 點縮圖換成第 3 張（左紅右藍） */
  await page.getByRole('list', { name: '照片清單' }).getByText('half.png').click();
  await settle(page);
  expect((await state(page)).posts[1].current).toBe(2);
  expect(near(await pixel(page, 20, m.y + m.height / 2), [210, 40, 40])).toBe(true);
  expect(near(await pixel(page, 370, m.y + m.height / 2), [40, 70, 210])).toBe(true);
  /* 在預覽上拖曳：往右拖照片跟著往右（框是正方形，照片 3:2 蓋滿時左右可以移動） */
  const zone = page.getByTestId('media-zone');
  await drag(page, zone, 60, 0);
  await settle(page);
  post = (await state(page)).posts[1];
  expect(post.photos[2].place.x).toBeGreaterThan(0);
  /* 滾輪放大 */
  await wheel(page, zone, -200);
  await settle(page);
  post = (await state(page)).posts[1];
  expect(post.photos[2].place.zoom).toBeGreaterThan(1.2);
  /* 回到預設 */
  await page.getByRole('button', { name: '回到預設' }).first().click();
  await settle(page);
  expect((await state(page)).posts[1].photos[2].place).toEqual({ zoom: 1, x: 0, y: 0, turns: 0 });
  /* 調整範圍（共用的圖片放進框）：放大後套用 */
  await page.getByRole('button', { name: '調整範圍' }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: '放大' }).click();
  await dialog(page).getByRole('button', { name: '套用' }).click();
  await settle(page);
  expect((await state(page)).posts[1].photos[2].place.zoom).toBeCloseTo(1.1, 2);
  /* 比例 4:5 */
  await page.getByRole('combobox', { name: '比例' }).click();
  await page.getByRole('option', { name: '4:5 直式' }).click();
  await settle(page);
  l = await layout(page);
  expect(l.parts.media.height).toBe(487.5);
  /* 拿掉第 1 張（按下時清單先選取那一張）：剩 2 張、目前那張在範圍內 */
  await page.getByRole('button', { name: '移除「照片 1」' }).click();
  await settle(page);
  s = await state(page);
  expect(s.posts[1].photos.map((p) => p.image.name)).toEqual(['red.png', 'half.png']);
  expect(s.posts[1].current).toBe(0);
  expect(errors).toEqual([]);
});

test('照片的位置：拖到邊之後縮放仍貼齊那一邊、換比例與滑桿縮小後在範圍裡、拖曳沒有死區（F20、F51）', async ({
  page,
}) => {
  const errors = await open(page);
  const GREEN = [40, 200, 60];
  /* 貼文 2（1:1）加入 300 × 200 的橫圖：框裡照片寬 1.5 倍、左右可以移動 ±0.25 */
  await page
    .getByRole('group', { name: '貼文清單' })
    .getByRole('button', { name: '貼文 2' })
    .click();
  await page
    .getByRole('group', { name: '加入照片' })
    .locator('input[type=file]')
    .setInputFiles([file('stripe.png', await stripePng())]);
  await expect(toast(page, '已加入 1 張圖片')).toBeVisible();
  await settle(page);
  const zone = page.getByTestId('media-zone');
  const place = async () => (await state(page)).posts[1].photos[1].place;
  const rightEdgeGreen = async () => {
    const m = (await layout(page)).parts.media;
    return near(await pixel(page, m.x + m.width - 2, m.y + m.height / 2), GREEN);
  };
  /* 往左拖到底：照片的右邊貼齊框 */
  await drag(page, zone, -600, 0);
  await settle(page);
  expect((await place()).x).toBeCloseTo(-0.25, 3);
  expect(await rightEdgeGreen()).toBe(true);
  /* 滾輪放大：右邊仍貼齊（原作以 object-position 為錨點）→ x ＝ −(1.5 × 縮放 − 1) ÷ 2 */
  await wheel(page, zone, -100);
  await settle(page);
  let p = await place();
  expect(p.zoom).toBeCloseTo(Math.exp(0.15), 3);
  expect(p.x).toBeCloseTo(-(1.5 * p.zoom - 1) / 2, 3);
  expect(await rightEdgeGreen()).toBe(true);
  /* 縮放滑桿拉到 100%：仍貼齊、在範圍裡 */
  const slider = page.getByRole('slider', { name: '照片 2：縮放' });
  await slider.focus();
  await slider.press('Home');
  await settle(page);
  p = await place();
  expect(p.zoom).toBe(1);
  expect(p.x).toBeCloseTo(-0.25, 3);
  expect(await rightEdgeGreen()).toBe(true);
  /* 換成 4:5：照片寬 1.875 倍，右邊仍貼齊 */
  const ratio = async (name: string) => {
    await page.getByRole('combobox', { name: '比例' }).click();
    await page.getByRole('option', { name }).click();
    await settle(page);
  };
  await ratio('4:5 直式');
  expect((await place()).x).toBeCloseTo(-0.4375, 3);
  expect(await rightEdgeGreen()).toBe(true);
  /* 換回 1:1：夾回 ±0.25；接著往右拖框寬的 10% 立刻動（沒有死區） */
  await ratio('1:1 正方形');
  expect((await place()).x).toBeCloseTo(-0.25, 3);
  const box = await zone.boundingBox();
  if (!box) throw new Error('no box');
  await drag(page, zone, box.width * 0.1, 0);
  await settle(page);
  expect((await place()).x).toBeCloseTo(-0.15, 2);
  /* 限時動態的格子（F51）：第 1 格（燈塔的範例 1080 × 1350）拖到最左再放大，右邊仍貼齊 */
  await tab(page, '限時動態').click();
  const cell = page.getByTestId('cell-zone-0');
  await drag(page, cell, -600, 0);
  await settle(page);
  const r = (await layout(page)).parts.cell0;
  const base = Math.max(r.width / 1080, r.height / 1350);
  const over = (z: number) => (1080 * base * z) / r.width - 1;
  let c = (await state(page)).stories[0].cells[0].place;
  expect(c.x).toBeCloseTo(-over(1) / 2, 3);
  await wheel(page, cell, -100);
  await settle(page);
  c = (await state(page)).stories[0].cells[0].place;
  expect(c.x).toBeCloseTo(-over(c.zoom) / 2, 3);
  /* 換版面再換回來：位置不變 */
  await page.getByRole('radio', { name: '1 張' }).click();
  await settle(page);
  await page.getByRole('radio', { name: '4 格' }).click();
  await settle(page);
  expect((await state(page)).stories[0].cells[0].place.x).toBeCloseTo(c.x, 3);
  expect(errors).toEqual([]);
});

test('照片清單、其他照片：Alt＋←／→ 排序（F19、F81）', async ({ page }) => {
  const errors = await open(page);
  const list = page.getByRole('list', { name: '照片清單' });
  /* 貼文 1 的 3 張：點第 1 張（清單取得焦點）→ Alt＋→ 移到第 2 張的位置 */
  await list.getByText('照片 1', { exact: true }).click();
  await page.keyboard.press('Alt+ArrowRight');
  await settle(page);
  let s = await state(page);
  expect(s.posts[0].photos.map((p) => p.id)).toEqual(['ph2', 'ph1', 'ph3']);
  expect(s.posts[0].current).toBe(1);
  /* 焦點在第 3 張的移除按鈕上：Alt＋← 移動那一張 */
  await list.getByRole('button', { name: '移除「照片 3」' }).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await settle(page);
  s = await state(page);
  expect(s.posts[0].photos.map((p) => p.id)).toEqual(['ph2', 'ph3', 'ph1']);
  /* 個人頁的其他照片 */
  await tab(page, '個人頁').click();
  const grid = page.getByRole('list', { name: '其他照片清單' });
  await grid.getByRole('button', { name: '移除「照片 1」' }).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await settle(page);
  s = await state(page);
  expect(s.account.grid.map((g) => g.id)).toEqual(['g2', 'g1', 'g3', 'g4']);
  expect(errors).toEqual([]);
});

test('帳號列、反應、內文：地點、共同貼文、追蹤、數字的顯示方式、按讚的人、關閉留言、折疊、時間（F23～F34）', async ({
  page,
}) => {
  const errors = await open(page);
  await textbox(page, '共同貼文的帳號').fill('kai.archive');
  await textbox(page, '共同貼文的帳號').blur();
  await settle(page);
  await sw(page, '追蹤按鈕').click();
  await settle(page);
  /* 舊式：圓點列不見、按鈕列往上 18 */
  const before = await layout(page);
  await page.getByRole('radio', { name: '「○ 個讚」' }).click();
  await settle(page);
  let l = await layout(page);
  expect(l.parts.actions.y).toBe(before.parts.actions.y - 18);
  expect(l.hits.filter((h) => h.key === 'open-comments')).toHaveLength(2);
  /* 關閉留言：留言圖示與「查看全部」都不能點 */
  await sw(page, '關閉留言').click();
  await settle(page);
  l = await layout(page);
  expect(l.hits.some((h) => h.key === 'open-comments')).toBe(false);
  /* 內文、折疊 */
  await textbox(page, '內文').fill('第一行 #標籤\n第二行');
  await textbox(page, '內文').blur();
  await settle(page);
  const h1 = (await layout(page)).parts.body.height;
  await sw(page, '只顯示第一行（「… 更多」）').click();
  await settle(page);
  expect((await layout(page)).parts.body.height).toBeLessThan(h1);
  await textbox(page, '發文時間').fill('');
  await settle(page);
  const s = await state(page);
  expect(s.posts[0]).toMatchObject({
    countStyle: 'classic',
    commentsOff: true,
    caption: '第一行 #標籤\n第二行',
  });
  expect(errors).toEqual([]);
});

/* ---------- 留言 ---------- */

test('留言：疊在貼文上（844）／只有面板、面板高度、新增留言、作者、關閉留言時沒有輸入列（F37～F47）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '留言').click();
  await expect(canvas(page)).toHaveAttribute('data-screen', 'comments');
  await expect(canvas(page)).toHaveAttribute('data-size', '1170x2532');
  let l = await layout(page);
  expect(l.parts.sheet.y).toBeCloseTo(844 * 0.34, 1);
  expect(l.parts.foot).toEqual({ x: 0, y: 844 - 121, width: 390, height: 121 });
  await page.getByRole('radio', { name: '全部', exact: true }).click();
  await settle(page);
  expect((await layout(page)).parts.sheet.y).toBe(54);
  /* 新增留言 */
  await page.getByRole('button', { name: '新增留言' }).click();
  await settle(page);
  let s = await state(page);
  expect(s.posts[0].sheet.items.at(-1)).toMatchObject({ username: 'user_4', text: '留言內容' });
  /* 第 4 則改內容 */
  const t = page.getByRole('textbox', { name: '留言 4：user_4：內容' });
  await t.fill('我也想去 #霧港鎮');
  await t.blur();
  await settle(page);
  /* 第 1 則改成作者：帳號欄不見 */
  await page.locator('[data-comment="c1"]').getByRole('switch', { name: '作者（我）' }).click();
  await settle(page);
  await expect(page.getByRole('textbox', { name: /^留言 1：.*：帳號$/ })).toHaveCount(0);
  s = await state(page);
  expect(s.posts[0].sheet.items[0].author).toBe(true);
  /* 只有面板：高度依內容 */
  await sw(page, '疊在貼文上').click();
  await settle(page);
  l = await layout(page);
  expect(l.height).not.toBe(844);
  expect(l.parts.status).toBeUndefined();
  /* 關閉留言（貼文分頁）→ 留言面板沒有輸入列 */
  await tab(page, '貼文').click();
  await sw(page, '關閉留言').click();
  await settle(page);
  await tab(page, '留言').click();
  expect((await layout(page)).parts.foot).toBeUndefined();
  expect(errors).toEqual([]);
});

/* ---------- 限時動態 ---------- */

test('限時動態：版面、點空格子放入照片、拖曳格子的照片、清空、格線、背景（F48～F55）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '限時動態').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1080x1920');
  /* 6 格 */
  await page.getByRole('radio', { name: '6 格' }).click();
  await settle(page);
  let s = await state(page);
  expect(s.stories[0].layout).toBe('6');
  /* 點第 5 格（空的）→ 選檔 */
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('cell-zone-4').click(),
  ]);
  await chooser.setFiles(file('half.png', await halfPng(400, 200)));
  await expect(toast(page, '已加入 1 張圖片')).toBeVisible();
  await settle(page);
  s = await state(page);
  expect(s.stories[0].cells[4].image?.name).toBe('half.png');
  expect((await prefs(page)).cell).toBe(4);
  /* 拖曳格子的照片 */
  await drag(page, page.getByTestId('cell-zone-4'), 40, 0);
  await settle(page);
  s = await state(page);
  expect(s.stories[0].cells[4].place.x).toBeGreaterThan(0);
  /* 清空 */
  await page.getByRole('button', { name: '清空' }).click();
  await settle(page);
  expect((await state(page)).stories[0].cells[4].image).toBeNull();
  /* 換回 4 格：原本的 4 張照片還在 */
  await page.getByRole('radio', { name: '4 格' }).click();
  await settle(page);
  s = await state(page);
  expect(s.stories[0].cells.slice(0, 4).every((c) => c.image)).toBe(true);
  /* 背景：白；格線間距 0 時看得到… */
  await page.getByRole('radio', { name: '白', exact: true }).click();
  await settle(page);
  expect((await state(page)).stories[0].bg).toBe('#ffffff');
  expect(errors).toEqual([]);
});

test('貼紙：選取、拖曳、滾輪縮放、Shift＋滾輪旋轉、字型、移到中央、Delete；加入每一種（F56～F65）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '限時動態').click();
  /* 範例的文字貼紙 k1：點預覽上的貼紙選取 */
  const first = page.locator('[data-sticker="k1"]');
  await first.click();
  await expect(page.getByTestId('sticker-editor')).toHaveAttribute('data-sticker-type', 'text');
  let s = await state(page);
  const x0 = s.stories[0].stickers[0].x;
  /* 拖曳 */
  await drag(page, first, 40, 0);
  await settle(page);
  s = await state(page);
  expect(s.stories[0].stickers[0].x).toBeGreaterThan(x0 + 2);
  /* 滾輪放大、Shift＋滾輪旋轉 */
  await wheel(page, first, -200);
  await settle(page);
  s = await state(page);
  expect(s.stories[0].stickers[0].scale).toBeGreaterThan(1.2);
  const r0 = s.stories[0].stickers[0].rot;
  await wheel(page, first, 50, true);
  await settle(page);
  s = await state(page);
  expect(s.stories[0].stickers[0].rot).toBeCloseTo(r0 + 10, 0);
  /* 字型、移到中央 */
  await page.getByRole('group', { name: '字型' }).getByRole('button', { name: '霓虹' }).click();
  await settle(page);
  await page.getByRole('button', { name: '移到中央' }).click();
  await settle(page);
  s = await state(page);
  expect(s.stories[0].stickers[0]).toMatchObject({ x: 50, y: 50 });
  /* 往上拖出畫面：中心夾在 −10%（不是 LayoutCanvas 的「至少留 12 px 在畫面裡」） */
  {
    const stage = await page.getByTestId('layout-canvas').boundingBox();
    const b = await first.boundingBox();
    if (!stage || !b) throw new Error('no box');
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    expect((1 - stage.y) / stage.height).toBeLessThan(-0.12);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, (y + 1) / 2, { steps: 4 });
    await page.mouse.move(x, 1, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    s = await state(page);
    expect(s.stories[0].stickers[0].y).toBe(-10);
    await page.getByRole('button', { name: '移到中央' }).click();
    await settle(page);
  }
  /* Delete 刪除選取中的貼紙（焦點不在輸入欄） */
  await first.click();
  await page.keyboard.press('Delete');
  await settle(page);
  s = await state(page);
  expect(s.stories[0].stickers.map((k) => k.id)).toEqual(['k2']);
  /* 加入每一種：加在最上層並選取 */
  const add = page.getByTestId('sticker-add');
  for (const name of ['文字', '表情符號', '提及', '地點', '主題標籤', '連結', '音樂', '提問']) {
    await add.getByRole('button', { name, exact: true }).click();
    await settle(page);
  }
  s = await state(page);
  expect(s.stories[0].stickers.map((k) => k.type)).toEqual([
    'location',
    'text',
    'emoji',
    'mention',
    'location',
    'hashtag',
    'link',
    'music',
    'question',
  ]);
  expect(s.stories[0].stickers.find((k) => k.type === 'mention')?.text).toBe('xiaoyu.lin');
  await expect(page.getByTestId('sticker-editor')).toHaveAttribute('data-sticker-type', 'question');
  expect(errors).toEqual([]);
});

test('畫面上的介面：上方介面、段數與進度、下方（F67～F71）', async ({ page }) => {
  const errors = await open(page);
  await tab(page, '限時動態').click();
  await page.getByRole('spinbutton', { name: '一共幾段' }).fill('5');
  await page.getByRole('spinbutton', { name: '一共幾段' }).blur();
  await settle(page);
  await page.getByRole('spinbutton', { name: '目前第幾段' }).fill('2');
  await page.getByRole('spinbutton', { name: '目前第幾段' }).blur();
  await settle(page);
  const l = await layout(page);
  expect(l.parts.bar.width).toBeCloseTo((360 - 2 * 7.92 - 4 * 3.6) / 5, 1);
  /* 上方介面、狀態列關掉、下方「無」：只有照片 */
  await sw(page, '進度條、帳號列與 ✕').click();
  await settle(page);
  await sw(page, '狀態列').click();
  await settle(page);
  await page.getByRole('combobox', { name: '下方' }).click();
  await page.getByRole('option', { name: '無' }).click();
  await settle(page);
  const s = await state(page);
  expect(s.stories[0]).toMatchObject({ showTop: false, bottom: 'none' });
  expect(s.screen.status).toBe(false);
  expect((await layout(page)).parts.bar).toBeUndefined();
  expect(errors).toEqual([]);
});

/* ---------- 個人頁、帳號與畫面 ---------- */

test('個人頁：點縮圖到貼文、點精選動態到限時動態、底部分頁列、精選動態、其他照片（F73～F83）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '個人頁').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1170x2532');
  /* 點貼文 2 的縮圖 */
  await page.locator('[data-region="post:p2"]').click();
  await expect(tab(page, '貼文')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：貼文 2');
  /* 點精選動態「取材」 */
  await tab(page, '個人頁').click();
  await page.locator('[data-region="story:s1"]').click();
  await expect(tab(page, '限時動態')).toHaveAttribute('aria-selected', 'true');
  await tab(page, '個人頁').click();
  /* 底部分頁列關掉：依內容 */
  await sw(page, '底部分頁列').click();
  await settle(page);
  const l = await layout(page);
  expect(l.height).toBeLessThan(844);
  expect(l.parts.nav).toBeUndefined();
  /* 沒有連結的精選動態「連到」顯示「無」（F78） */
  await expect(page.getByRole('combobox', { name: '精選動態 2：日常：連到' })).toHaveText('無');
  /* 新增精選動態、連到限時動態 1、再改回無 */
  await page.getByRole('button', { name: '新增精選動態' }).click();
  await settle(page);
  let s = await state(page);
  expect(s.account.highlights.at(-1)).toMatchObject({ title: '新的精選', story: null });
  const link = page.getByRole('combobox', { name: '精選動態 3：新的精選：連到' });
  await expect(link).toHaveText('無');
  await link.click();
  await page.getByRole('option', { name: '限時動態 1' }).click();
  await settle(page);
  s = await state(page);
  expect(s.account.highlights.at(-1)?.story).toBe('s1');
  await expect(link).toHaveText('限時動態 1');
  await link.click();
  await page.getByRole('option', { name: '無', exact: true }).click();
  await settle(page);
  s = await state(page);
  expect(s.account.highlights.at(-1)?.story).toBeNull();
  await expect(link).toHaveText('無');
  await link.click();
  await page.getByRole('option', { name: '限時動態 1' }).click();
  await settle(page);
  expect((await state(page)).account.highlights.at(-1)?.story).toBe('s1');
  /* 其他照片 */
  await page
    .getByRole('group', { name: '其他照片' })
    .locator('input[type=file]')
    .setInputFiles(file('green.png', await solidPng([40, 160, 60])));
  await settle(page);
  s = await state(page);
  expect(s.account.grid.at(-1)?.image.name).toBe('green.png');
  expect(errors).toEqual([]);
});

test('帳號與畫面：帳號、認證、狀態列、用現在的時間、字級、深色、大頭貼（F01～F12）', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-16T09:05:00+08:00'));
  const errors = await open(page);
  await tab(page, '帳號與畫面').click();
  await textbox(page, '帳號').fill('kai.archive');
  await textbox(page, '帳號').blur();
  await settle(page);
  await sw(page, '認證徽章').click();
  await settle(page);
  await page.getByRole('button', { name: '用現在的時間' }).click();
  await settle(page);
  let s = await state(page);
  expect(s.profile).toMatchObject({ username: 'kai.archive', verified: true });
  expect(s.screen.clock).toBe('9:05');
  /* 狀態列關掉：貼文從 0 開始 */
  await sw(page, '狀態列').click();
  await settle(page);
  expect((await layout(page)).parts.header.y).toBe(0);
  /* 字級 140%：內文變高 */
  const h0 = (await layout(page)).parts.body.height;
  const slider = page.getByRole('slider', { name: '字級' });
  await slider.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await settle(page);
  s = await state(page);
  expect(s.screen.fontScale).toBe(1.4);
  expect((await layout(page)).parts.body.height).toBeGreaterThan(h0);
  /* 深色：底色變暗 */
  await page.getByRole('radio', { name: '深色' }).click();
  await settle(page);
  const px = await pixel(page, 380, 30);
  expect(px[0]).toBeLessThan(40);
  /* 大頭貼：選檔 */
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '大頭貼：選擇圖片' }).click(),
  ]);
  await chooser.setFiles(file('me.png', await solidPng([230, 200, 40], 80, 80)));
  await settle(page);
  s = await state(page);
  expect(s.profile.avatar?.name).toBe('me.png');
  expect(errors).toEqual([]);
});

/* ---------- 圖片網址、拖放、貼上 ---------- */

test('圖片網址：成功、跨網域讀不到時照實說明、雲端硬碟連結的轉換（F99、D7）', async ({ page }) => {
  const errors = await open(page);
  const png = await solidPng([40, 70, 210], 60, 60);
  await page.route('https://img.example/ok.png', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      body: png,
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  /* 跨網域讀不到：瀏覽器的 fetch 丟 TypeError（同 CORS 被擋） */
  await page.route('https://img.example/nocors.png', (r) => r.abort('failed'));
  await page.route('https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlmn=w2000', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'image/png',
      body: png,
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.getByRole('button', { name: '圖片網址' }).first().click();
  const urlBox = page.getByTestId('url-input');
  await urlBox.fill('https://img.example/ok.png\nhttps://img.example/nocors.png');
  await page.getByTestId('url-apply').click();
  await expect(page.getByTestId('url-failed')).toContainText('跨網域');
  /* 讀得到的照樣加入（通知在對話框後面） */
  await expect
    .poll(async () => (await state(page)).posts[0].photos.at(-1)?.image.name)
    .toBe('ok.png');
  await expect(urlBox).toHaveValue('https://img.example/nocors.png');
  /* 雲端硬碟的分享連結 */
  await urlBox.fill('https://drive.google.com/file/d/1AbCdEfGhIjKlmn/view?usp=sharing');
  await page.getByTestId('url-apply').click();
  await expect(dialog(page)).toBeHidden();
  await settle(page);
  const s = await state(page);
  expect(s.posts[0].photos.map((p) => p.image.name ?? p.image.kind)).toEqual([
    'sample',
    'sample',
    'sample',
    'ok.png',
    '1AbCdEfGhIjKlmn=w2000',
  ]);
  /* 不是網址 */
  await page.getByRole('button', { name: '圖片網址' }).first().click();
  await page.getByTestId('url-input').fill('ftp://x/a.png');
  await page.getByTestId('url-apply').click();
  await expect(dialog(page)).toContainText('請輸入 http:// 或 https:// 開頭的圖片網址。');
  /* 讀不到的那個網址：瀏覽器自己會在主控台記一筆 ERR_FAILED */
  expect(errors.filter((e) => !/ERR_FAILED/.test(e))).toEqual([]);
});

test('整個視窗拖放、貼上：依分頁放到貼文照片、格子、其他照片、大頭貼（F100）', async ({ page }) => {
  const errors = await open(page);
  const dropImage = async (name: string, rgb: [number, number, number]) => {
    const b64 = (await solidPng(rgb, 50, 50)).toString('base64');
    await page.evaluate(
      async ([b64, name]) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name, { type: 'image/png' }));
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
        window.dispatchEvent(
          new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
      },
      [b64, name],
    );
    await settle(page);
  };
  const pasteImage = async (name: string) => {
    const b64 = (await solidPng([90, 90, 90], 40, 40)).toString('base64');
    await page.evaluate(
      async ([b64, name]) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name, { type: 'image/png' }));
        document.body.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
        );
      },
      [b64, name],
    );
    await settle(page);
  };
  await dropImage('drop-post.png', [200, 40, 40]);
  let s = await state(page);
  expect(s.posts[0].photos.at(-1)?.image.name).toBe('drop-post.png');
  await tab(page, '限時動態').click();
  await page.getByRole('group', { name: '格子' }).getByRole('button', { name: '第 2 格' }).click();
  await dropImage('drop-cell.png', [40, 160, 60]);
  s = await state(page);
  expect(s.stories[0].cells[1].image?.name).toBe('drop-cell.png');
  await tab(page, '個人頁').click();
  await pasteImage('paste-grid.png');
  s = await state(page);
  expect(s.account.grid.at(-1)?.image.name).toBe('paste-grid.png');
  await tab(page, '帳號與畫面').click();
  await pasteImage('paste-avatar.png');
  s = await state(page);
  expect(s.profile.avatar?.name).toBe('paste-avatar.png');
  /* 首頁動態 → 目前貼文的照片；私訊 → 目前對話最後一則我的照片訊息（2026-10） */
  await tab(page, '首頁動態').click();
  await dropImage('drop-feed.png', [40, 40, 200]);
  s = await state(page);
  expect(s.posts[0].photos.at(-1)?.image.name).toBe('drop-feed.png');
  await tab(page, '私訊').click();
  await pasteImage('paste-dm.png');
  s = await state(page);
  expect(s.dm.threads[0].messages.at(-1)).toMatchObject({
    from: 'me',
    text: '',
    image: { name: 'paste-dm.png' },
  });
  expect(errors).toEqual([]);
});

/* ---------- 匯出 ---------- */

test('匯出 PNG：四種畫面的尺寸（3 倍）、倍率、像素與預覽一致、檔名（F85～F87）', async ({
  page,
}) => {
  const errors = await open(page);
  const sizes: Record<string, [number, number]> = {};
  for (const t of ['貼文', '留言', '限時動態', '個人頁'] as const) {
    await tab(page, t).click();
    const l = await layout(page);
    const out = await exportFile(page, 'PNG');
    expect(out.name).toMatch(/^socialpost-(post-1|comments-1|story-1|profile)-\d{8}-\d{6}\.png$/);
    expect(out.name).not.toMatch(BRAND);
    const png = readPng(out.bytes);
    sizes[t] = [png.width, png.height];
    expect([png.width, png.height]).toEqual([Math.round(l.width * 3), Math.round(l.height * 3)]);
    /* 抽一點：與預覽相同 */
    const [x, y] = t === '限時動態' ? [180, 320] : [195, 300];
    expect(near(png.at(x * 3, y * 3), await pixel(page, x, y), 6)).toBe(true);
  }
  expect(sizes.留言).toEqual([1170, 2532]);
  expect(sizes.限時動態).toEqual([1080, 1920]);
  expect(sizes.個人頁).toEqual([1170, 2532]);
  /* 限時動態：編輯用的選取框不畫進 PNG（第 1 格的左上角） */
  await tab(page, '限時動態').click();
  const preview = await pixel(page, 1, 300);
  const out = await exportFile(page, 'PNG');
  const png = readPng(out.bytes);
  expect(near(preview, [63, 99, 224], 30)).toBe(true);
  expect(near(png.at(3, 900), [63, 99, 224], 30)).toBe(false);
  /* 倍率 1 */
  await exportPanel(page).getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^100%/ }).click();
  const small = readPng((await exportFile(page, 'PNG')).bytes);
  expect([small.width, small.height]).toEqual([360, 640]);
  expect(errors).toEqual([]);
});

test('匯出 HTML：全部（首頁動態、個人頁、貼文、留言、限時動態）與只有這個畫面；沒有外部資源、點來點去（F89～F96、F126～F130）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  const all = await exportFile(page, 'HTML 檔', /^全部/);
  expect(all.name).toBe('xiaoyu.lin-all.html');
  const html = strFromU8(all.bytes);
  expect(html).toContain('<title>xiaoyu.lin</title>');
  expect(html).not.toMatch(/https?:\/\//);
  expect(textOf(html)).not.toMatch(BRAND);
  expect(html).toContain('<section class="v-scr" id="s-feed">');
  expect(html).toContain('<section class="v-scr" id="s-account" hidden>');
  expect(html).toContain('id="s-post-0"');
  expect(html).toContain('id="s-post-1"');
  expect(html).toContain('id="ov-c-0"');
  expect(html).toContain('id="ov-s-0"');
  expect(html).toContain('id="ov-s-1"');
  /* 首頁動態的限時動態列：我的（第 1 則）、朋友的（第 2 則） */
  expect(html).toContain('data-story="0"');
  expect(html).toContain('data-story="1"');
  /* 在瀏覽器裡點 */
  const v = await context.newPage();
  await v.setViewportSize({ width: 390, height: 844 });
  const requests: string[] = [];
  v.on('request', (r) => {
    if (
      !r.url().startsWith('data:') &&
      !r.url().startsWith('blob:') &&
      !r.url().includes('/viewer.html')
    )
      requests.push(r.url());
  });
  await v.route('**/viewer.html', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );
  await v.goto(`${new globalThis.URL(page.url()).origin}/viewer.html`);
  await expect(v.locator('#s-feed')).toBeVisible();
  /* 首頁動態裡的貼文：輪播（照片框可以左右滑；滑鼠點右半邊 → 下一張，膠囊與圓點跟著換） */
  const feedPill = v.locator('#s-feed .v-pill').first().locator('img');
  await expect(feedPill.nth(0)).toBeVisible();
  const track = v.locator('#s-feed .v-track').first();
  const tb = await track.boundingBox();
  if (!tb) throw new Error('no track');
  await v.mouse.click(tb.x + tb.width * 0.75, tb.y + tb.height / 2);
  await expect(feedPill.nth(1)).toBeVisible();
  await expect(feedPill.nth(0)).toBeHidden();
  /* 手指滑動＝捲動：捲到第 3 張 */
  await track.evaluate((t) => {
    t.scrollLeft = t.clientWidth * 2;
  });
  await expect(feedPill.nth(2)).toBeVisible();
  await expect(v.locator('#s-feed .v-dots').first().locator('img').nth(2)).toBeVisible();
  /* 留言面板：打開、Esc 關掉 */
  await v.locator('#s-feed [data-open="0"]').first().click();
  await expect(v.locator('#ov-c-0')).toBeVisible();
  await v.keyboard.press('Escape');
  await expect(v.locator('#ov-c-0')).toBeHidden();
  /* 朋友的限時動態：打開、進度條在跑、點一下（右邊）看完就關掉 */
  await v.locator('#s-feed [data-story="1"]').click();
  await expect(v.locator('#ov-s-1')).toBeVisible();
  await v.waitForTimeout(400);
  expect(
    await v
      .locator('#ov-s-1 .v-bars b')
      .first()
      .evaluate((b) => b.getBoundingClientRect().width),
  ).toBeGreaterThan(0);
  const sb = await v.locator('#ov-s-1 .v-story').boundingBox();
  if (!sb) throw new Error('no story');
  await v.mouse.click(sb.x + sb.width * 0.8, sb.y + sb.height / 2);
  await expect(v.locator('#ov-s-1')).toBeHidden();
  /* 底部的大頭貼 → 個人頁；點貼文 2 的縮圖；‹ 回到個人頁 */
  await v.locator('#s-feed [data-go="s-account"]').click();
  await expect(v.locator('#s-account')).toBeVisible();
  await expect(v.locator('#s-feed')).toBeHidden();
  await v.locator('[data-go="s-post-1"]').click();
  await expect(v.locator('#s-post-1')).toBeVisible();
  await v.locator('#s-post-1 [data-back]').click();
  await expect(v.locator('#s-account')).toBeVisible();
  await v.locator('[data-go="s-post-0"]').click();
  /* 輪播：只有照片框可以點，照片下面的圓點列不在範圍裡（F91，同原作） */
  {
    const car = await v.locator('#s-post-0 .v-car').boundingBox();
    const dots = await v.locator('#s-post-0 .v-dots').boundingBox();
    if (!car || !dots) throw new Error('no box');
    expect(dots.y).toBeGreaterThanOrEqual(car.y + car.height - 1);
  }
  /* 個人頁的精選動態 → 限時動態（✕ 關掉）；底部的首頁 → 首頁動態 */
  await v.locator('#s-post-0 [data-back]').click();
  await v.locator('#s-account [data-story="0"]').click();
  await expect(v.locator('#ov-s-0')).toBeVisible();
  await v.locator('#ov-s-0 [data-close]').click();
  await expect(v.locator('#ov-s-0')).toBeHidden();
  await v.locator('#s-account [data-go="s-feed"]').click();
  await expect(v.locator('#s-feed')).toBeVisible();
  expect(requests).toEqual([]);
  await v.close();
  /* 只有這個畫面：留言（疊在貼文上 → 打開的面板） */
  await tab(page, '留言').click();
  const one = await exportFile(page, 'HTML 檔', '只有這個畫面');
  expect(one.name).toBe('xiaoyu.lin-comments-1.html');
  const oh = strFromU8(one.bytes);
  expect(oh).toContain('<title>xiaoyu.lin・留言</title>');
  expect(oh).toContain('<div class="v-ov" id="ov-c-0" data-closable>');
  /* 限時動態：打開、不能關 */
  await tab(page, '限時動態').click();
  const st = strFromU8((await exportFile(page, 'HTML 檔', '只有這個畫面')).bytes);
  expect(st).toContain('<div class="v-ov v-st" id="ov-s-0">');
  /* 首頁動態：首頁＋留言面板＋限時動態（沒有個人頁，底部的按鈕不能點） */
  await tab(page, '首頁動態').click();
  const fd = await exportFile(page, 'HTML 檔', '只有這個畫面');
  expect(fd.name).toBe('xiaoyu.lin-feed.html');
  const fh = strFromU8(fd.bytes);
  expect(fh).toContain('<title>xiaoyu.lin・首頁動態</title>');
  expect(fh).toContain('id="s-feed"');
  expect(fh).not.toContain('id="s-account"');
  expect(fh).not.toContain('data-go=');
  expect(fh).toContain('id="ov-s-1"');
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含照片）、復原／重做（F101、F102、F106）', async ({ page }) => {
  const errors = await open(page);
  await page
    .getByRole('group', { name: '加入照片' })
    .locator('input[type=file]')
    .setInputFiles(file('keep.png', await solidPng([200, 40, 40])));
  await settle(page);
  await textbox(page, '內文').fill('改過的內文');
  await textbox(page, '內文').blur();
  await settle(page);
  /* 復原：內文回去；重做 */
  await page.getByRole('button', { name: /^復原/ }).click();
  await settle(page);
  expect((await state(page)).posts[0].caption).not.toBe('改過的內文');
  await page.getByRole('button', { name: /^重做/ }).click();
  await settle(page);
  expect((await state(page)).posts[0].caption).toBe('改過的內文');
  /* 重新整理：內容與照片都在 */
  await page.reload();
  await expect(canvas(page)).toBeVisible();
  const s = await state(page);
  expect(s.posts[0].caption).toBe('改過的內文');
  expect(s.posts[0].photos.at(-1)?.image.name).toBe('keep.png');
  await expect(page.getByTestId('missing-images')).toHaveCount(0);
  const m = (await layout(page)).parts.media;
  await expect
    .poll(async () => near(await pixel(page, 195, m.y + m.height / 2), [200, 40, 40]))
    .toBe(true);
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（內容＋照片）、重設（深淺色不變）、開啟還原（F104、F105、F107）', async ({
  page,
}) => {
  const errors = await open(page);
  await page
    .getByRole('group', { name: '加入照片' })
    .locator('input[type=file]')
    .setInputFiles(file('zip.png', await solidPng([40, 160, 60])));
  await settle(page);
  await page.getByRole('radio', { name: '深色' }).click();
  await settle(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('social-post');
  const added = project.data.posts[0].photos.at(-1).image;
  expect(added.name).toBe('zip.png');
  expect(Object.keys(entries)).toContain(`files/${added.id}.png`);
  /* 重設：範例內容、深色不變 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await alertDialog(page).getByRole('button', { name: '重設' }).click();
  await settle(page);
  let s = await state(page);
  expect(s.posts[0].photos).toHaveLength(3);
  expect(s.theme).toBe('dark');
  /* 開啟 */
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    alertDialog(page).getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('back.zip', zipBytes, 'application/zip'));
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  s = await state(page);
  expect(s.posts[0].photos.at(-1)?.image.name).toBe('zip.png');
  /* 每個分頁的重設：貼文 → 空白貼文 */
  await page.getByRole('button', { name: '重設這則貼文' }).click();
  await alertDialog(page).getByRole('button', { name: '重設' }).click();
  await settle(page);
  expect((await state(page)).posts[0].photos).toEqual([]);
  expect(errors).toEqual([]);
});

/* ---------- 首頁動態、朋友身分、限時動態的新行為（1.10～1.13） ---------- */

test('首頁動態：上方列、限時動態列（我的、朋友的、看過了）、首頁的貼文、點圈到限時動態、PNG（F114～F122）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, '首頁動態').click();
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：首頁動態');
  await expect(canvas(page)).toHaveAttribute('data-size', '1170x2532');
  let l = await layout(page);
  expect(l.hits.map((h) => h.key)).toEqual(
    expect.arrayContaining(['tray:s1', 'tray:s2', 'feed:dm']),
  );
  /* 上方列 */
  await textbox(page, '左上角的字').fill('霧港日常');
  await textbox(page, '左上角的字').blur();
  await settle(page);
  await textbox(page, '訊息的未讀數').fill('');
  await textbox(page, '訊息的未讀數').blur();
  await settle(page);
  await sw(page, '通知的紅點').click();
  await settle(page);
  let s = await state(page);
  expect(s.feed).toMatchObject({ logo: '霧港日常', dmBadge: '', heartDot: false });
  /* 我的限時動態：拿掉 → 圈沒有外框（不能點）；新增我的限時動態 → 換到限時動態分頁 */
  await page.getByTestId('feed-story-s1').getByRole('switch', { name: '放進我的限時動態' }).click();
  await settle(page);
  l = await layout(page);
  expect(l.hits.map((h) => h.key)).not.toContain('tray:s1');
  await page.getByRole('button', { name: '新增我的限時動態' }).click();
  await expect(tab(page, '限時動態')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：限時動態 3');
  await settle(page);
  /* 朋友的限時動態：同一個帳號的合成一個圈 */
  await tab(page, '首頁動態').click();
  await page.getByRole('button', { name: '新增朋友的限時動態' }).click();
  await settle(page);
  await expect(tab(page, '限時動態')).toHaveAttribute('aria-selected', 'true');
  await textbox(page, '朋友的帳號').fill('KAI.archive');
  await textbox(page, '朋友的帳號').blur();
  await settle(page);
  await sw(page, '看過了（首頁動態的圈是灰色的）').click();
  await settle(page);
  s = await state(page);
  expect(s.feed.myStories).toEqual(['s3']);
  expect(s.stories.at(-1)).toMatchObject({ friend: true, seen: true });
  await tab(page, '首頁動態').click();
  l = await layout(page);
  expect(l.hits.filter((h) => h.key.startsWith('tray:')).map((h) => h.key)).toEqual([
    'tray:s3',
    'tray:s2,s4',
  ]);
  /* 點朋友的圈 → 那個帳號的第一則 */
  await page.locator('[data-region="tray:s2,s4"]').click();
  await expect(tab(page, '限時動態')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：限時動態 2');
  /* 首頁的貼文：第 2 則不顯示 */
  await tab(page, '首頁動態').click();
  await page.getByTestId('feed-post-p2').getByRole('switch', { name: '在首頁動態顯示' }).click();
  await settle(page);
  expect((await state(page)).posts[1].inFeed).toBe(false);
  /* PNG：1170 × 2532、檔名 */
  const out = await exportFile(page, 'PNG');
  expect(out.name).toMatch(/^socialpost-feed-\d{8}-\d{6}\.png$/);
  const png = readPng(out.bytes);
  expect([png.width, png.height]).toEqual([1170, 2532]);
  expect(near(png.at(195 * 3, 300 * 3), await pixel(page, 195, 300), 6)).toBe(true);
  /* 重設：字、未讀數、紅點回到預設，我的限時動態只放第一則 */
  await page.getByRole('button', { name: '首頁動態回到預設' }).click();
  await alertDialog(page).getByRole('button', { name: '重設' }).click();
  await settle(page);
  expect((await state(page)).feed).toEqual({
    logo: 'Moments',
    heartDot: true,
    dmBadge: '2',
    myStories: ['s1'],
  });
  expect(errors).toEqual([]);
});

test('朋友的貼文：帳號列與作者的留言用朋友的帳號、清單接帳號、個人頁不放；預覽上的「‹」「›」換照片（F111、F113、F129）', async ({
  page,
}) => {
  const errors = await open(page);
  await sw(page, '朋友的貼文').click();
  await settle(page);
  await textbox(page, '朋友的帳號').fill('kai.archive');
  await textbox(page, '朋友的帳號').blur();
  await settle(page);
  await expect(page.getByRole('button', { name: '貼文 1 · kai.archive' })).toBeVisible();
  let s = await state(page);
  expect(s.posts[0]).toMatchObject({ friend: true, owner: { username: 'kai.archive' } });
  /* 留言分頁：作者是朋友 */
  await tab(page, '留言').click();
  await expect(
    page.locator('[data-comment="c2"]').getByRole('switch', { name: '作者（朋友）' }),
  ).toBeChecked();
  await expect(page.locator('[data-comment="c2"] h3')).toHaveText('留言 2：kai.archive（作者）');
  /* 個人頁：格狀只有貼文 2 */
  await tab(page, '個人頁').click();
  const keys = (await layout(page)).hits.map((h) => h.key);
  expect(keys).not.toContain('post:p1');
  expect(keys).toContain('post:p2');
  /* 預覽上的「›」「‹」：換目前那張（編輯用，PNG 不畫） */
  await tab(page, '貼文').click();
  await expect(page.getByTestId('photo-prev')).toHaveCount(0);
  await page.getByTestId('photo-next').click();
  await settle(page);
  s = await state(page);
  expect(s.posts[0].current).toBe(1);
  await page.getByTestId('photo-next').click();
  await settle(page);
  await expect(page.getByTestId('photo-next')).toHaveCount(0);
  await page.getByTestId('photo-prev').click();
  await settle(page);
  expect((await state(page)).posts[0].current).toBe(1);
  const btn = await page.getByTestId('photo-prev').boundingBox();
  const cv = await canvas(page).boundingBox();
  if (!btn || !cv) throw new Error('no box');
  const ratio = 390 / cv.width;
  const bx = (btn.x + btn.width / 2 - cv.x) * ratio;
  const by = (btn.y + btn.height / 2 - cv.y) * ratio;
  const png = readPng((await exportFile(page, 'PNG')).bytes);
  /* 按鈕是 DOM，不在畫布上：PNG 與預覽畫布的同一點一樣 */
  expect(near(png.at(Math.round(bx * 3), Math.round(by * 3)), await pixel(page, bx, by), 6)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('HTML：我的限時動態好幾則接著看（一則一段、←／→、5 秒）、限時動態列可以橫向捲動（F119、F126、F128）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await tab(page, '首頁動態').click();
  await page.getByRole('button', { name: '新增我的限時動態' }).click();
  await settle(page);
  /* 朋友的限時動態 5 個帳號：圈排不下，HTML 可以左右捲動 */
  for (let i = 0; i < 5; i++) {
    await tab(page, '首頁動態').click();
    await page.getByRole('button', { name: '新增朋友的限時動態' }).click();
    await settle(page);
  }
  await tab(page, '首頁動態').click();
  const all = strFromU8((await exportFile(page, 'HTML 檔', /^全部/)).bytes);
  expect(all).toContain('data-story="0,2"');
  const v = await context.newPage();
  await v.setViewportSize({ width: 390, height: 844 });
  await v.route('**/viewer.html', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: all }),
  );
  await v.goto(`${new globalThis.URL(page.url()).origin}/viewer.html`);
  await v.locator('[data-story="0,2"]').click();
  await expect(v.locator('#ov-s-0')).toBeVisible();
  await expect(v.locator('#ov-s-0 .v-bars i')).toHaveCount(2);
  await v.keyboard.press('ArrowRight');
  await expect(v.locator('#ov-s-2')).toBeVisible();
  await expect(v.locator('#ov-s-0')).toBeHidden();
  await expect(v.locator('#ov-s-2 .v-bars i')).toHaveCount(2);
  expect(
    await v
      .locator('#ov-s-2 .v-bars b')
      .first()
      .evaluate((b) => (b as HTMLElement).style.width),
  ).toBe('100%');
  await v.keyboard.press('ArrowLeft');
  await expect(v.locator('#ov-s-0')).toBeVisible();
  /* 5 秒換下一則、看完關掉 */
  await expect(v.locator('#ov-s-2')).toBeVisible({ timeout: 7000 });
  await expect(v.locator('#ov-s-2')).toBeHidden({ timeout: 7000 });
  /* 限時動態列：比畫面寬、可以捲到最後一個圈 */
  const tray = v.locator('#s-feed .v-hscroll');
  const [sw0, cw0] = await tray.evaluate((t) => [t.scrollWidth, t.clientWidth]);
  expect(sw0).toBeGreaterThan(cw0);
  await tray.evaluate((t) => {
    t.scrollLeft = t.scrollWidth;
  });
  const last = v.locator('#s-feed .v-hscroll [data-story]').last();
  await expect(last).toBeInViewport();
  await last.click();
  await expect(v.locator('.v-st:not([hidden])')).toHaveCount(1);
  await v.close();
  expect(errors).toEqual([]);
});

test('私訊：訊息列表點對話打開、泡泡顏色、新增訊息與照片、時間、反應、新增對話、PNG（F134～F145）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 首頁動態的訊息圖示 → 私訊的訊息列表 */
  await tab(page, '首頁動態').click();
  await page.locator('[data-region="feed:dm"]').click();
  await expect(tab(page, '私訊')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：私訊・訊息列表');
  await expect(canvas(page)).toHaveAttribute('data-size', '1170x2532');
  const list = await exportFile(page, 'PNG');
  expect(list.name).toMatch(/^socialpost-dm-\d{8}-\d{6}\.png$/);
  /* 點第 2 個對話 → 打開 */
  await page.locator('[data-region="thread:t2"]').click();
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：私訊・mistharbor.info');
  await expect(page.getByRole('radio', { name: '對話', exact: true })).toBeChecked();
  /* 泡泡顏色 */
  await page.getByRole('radio', { name: '粉紅' }).click();
  await settle(page);
  let s = await state(page);
  expect([s.dm.c1, s.dm.c2]).toEqual(['#e0457b', '#d6338a']);
  /* 新增我的訊息、打字、反應；新增時間 */
  await page.getByRole('button', { name: '新增我的訊息' }).click();
  await settle(page);
  await textbox(page, '訊息 4：我：內容').fill('明天見 #霧港鎮');
  await textbox(page, '訊息 4：我：內容').blur();
  await settle(page);
  await textbox(page, '訊息 4：我：反應的表情符號').fill('👍');
  await textbox(page, '訊息 4：我：反應的表情符號').blur();
  await settle(page);
  await page
    .locator('[data-message]')
    .last()
    .getByRole('button', { name: /照片：選擇圖片$/ })
    .waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .locator('[data-message]')
      .last()
      .getByRole('button', { name: /照片：選擇圖片$/ })
      .click(),
  ]);
  await chooser.setFiles(file('dm-photo.png', await solidPng([200, 40, 40], 80, 60)));
  await settle(page);
  await page.getByRole('button', { name: '新增時間' }).click();
  await settle(page);
  s = await state(page);
  const ms = s.dm.threads[1].messages;
  expect(ms.at(-2)).toMatchObject({
    from: 'me',
    text: '明天見 #霧港鎮',
    react: '👍',
    image: { name: 'dm-photo.png' },
  });
  expect(ms.at(-1)).toMatchObject({ from: 'time', text: '今天 下午 3:00' });
  /* 時間 → 對方 */
  await page
    .getByRole('radiogroup', { name: '訊息 5：時間：誰的訊息' })
    .getByRole('radio', { name: '對方' })
    .click();
  await settle(page);
  expect((await state(page)).dm.threads[1].messages.at(-1)?.from).toBe('them');
  /* 已讀只在最後一則是我的時：現在最後是對方的 */
  /* 新增對話 */
  await page.getByRole('button', { name: '新增對話' }).click();
  await settle(page);
  s = await state(page);
  expect(s.dm.threads.map((t) => t.username)).toEqual([
    'kai.archive',
    'mistharbor.info',
    'friend_3',
  ]);
  await expect(page.getByTestId('preview-title')).toHaveText('預覽：私訊・friend_3');
  /* PNG：對話是第幾個 */
  await page.getByRole('button', { name: 'mistharbor.info', exact: true }).click();
  const out = await exportFile(page, 'PNG');
  expect(out.name).toMatch(/^socialpost-dm-2-\d{8}-\d{6}\.png$/);
  const png = readPng(out.bytes);
  expect([png.width, png.height]).toEqual([1170, 2532]);
  expect(near(png.at(195 * 3, 500 * 3), await pixel(page, 195, 500), 6)).toBe(true);
  expect(errors).toEqual([]);
});

test('HTML：私訊（全部從首頁動態的訊息圖示進去、只有這個畫面的訊息列表與對話）（F143、F132）', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  const all = strFromU8((await exportFile(page, 'HTML 檔', /^全部/)).bytes);
  expect(all).toContain('<section class="v-scr" id="s-dms" hidden>');
  expect(all).toContain('<section class="v-scr v-fill" id="s-dm-0" hidden');
  expect(all).toContain('<section class="v-scr v-fill" id="s-dm-1" hidden');
  expect(textOf(all)).not.toMatch(BRAND);
  const v = await context.newPage();
  await v.setViewportSize({ width: 390, height: 844 });
  await v.route('**/viewer.html', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: all }),
  );
  await v.goto(`${new globalThis.URL(page.url()).origin}/viewer.html`);
  /* 首頁動態的訊息圖示 → 訊息列表 → 對話 → ‹ → ‹ */
  await v.locator('#s-feed [data-go="s-dms"]').first().click();
  await expect(v.locator('#s-dms')).toBeVisible();
  await v.locator('#s-dms [data-go="s-dm-0"]').click();
  await expect(v.locator('#s-dm-0')).toBeVisible();
  /* 對話撐滿畫面：上方、訊息（可以捲動）、下方都在畫面裡 */
  const foot = await v.locator('#s-dm-0 .v-ffoot').boundingBox();
  if (!foot) throw new Error('no foot');
  expect(foot.y + foot.height).toBeCloseTo(844, 0);
  await v.locator('#s-dm-0 [data-back]').click();
  await expect(v.locator('#s-dms')).toBeVisible();
  await v.locator('#s-dms [data-back]').click();
  await expect(v.locator('#s-feed')).toBeVisible();
  /* 底部分頁列的訊息也到訊息列表 */
  await v.locator('#s-feed .v-sticky-bottom [data-go="s-dms"]').click();
  await expect(v.locator('#s-dms')).toBeVisible();
  await v.close();
  /* 只有這個畫面：訊息列表（＋每個對話）／對話（只有那個，沒有 ‹） */
  await tab(page, '私訊').click();
  const one = await exportFile(page, 'HTML 檔', '只有這個畫面');
  expect(one.name).toBe('xiaoyu.lin-dm.html');
  const oh = strFromU8(one.bytes);
  expect(oh).toContain('<title>xiaoyu.lin・私訊</title>');
  expect(oh).toContain('<section class="v-scr" id="s-dms">');
  expect(oh).toContain('id="s-dm-1"');
  await page.getByRole('radio', { name: '對話', exact: true }).click();
  const chat = strFromU8((await exportFile(page, 'HTML 檔', '只有這個畫面')).bytes);
  expect(chat).toContain('<section class="v-scr v-fill" id="s-dm-0" style=');
  expect(chat).not.toContain('id="s-dms"');
  expect(chat).not.toContain('class="v-spot" data-back');
  expect(errors).toEqual([]);
});

test('舊的專案檔（資料版本 2）照常開啟：自己的貼文與限時動態、首頁動態與私訊的預設、進度條 3 段→1 段（3.9）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const entries = unzipSync(new Uint8Array(readFileSync((await dl.path()) as string)));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.version).toBe(3);
  /* 改成版本 2 的樣子：沒有朋友身分、首頁動態；限時動態只有 1 則、還是舊的預設 3 段 */
  project.version = 2;
  delete project.data.feed;
  delete project.data.dm;
  for (const p of project.data.posts) {
    delete p.friend;
    delete p.owner;
    delete p.inFeed;
  }
  project.data.stories = project.data.stories.slice(0, 1);
  for (const st of project.data.stories) {
    delete st.friend;
    delete st.owner;
    delete st.seen;
    Object.assign(st, { count: 3, current: 1, progress: 40 });
  }
  entries['project.json'] = strToU8(JSON.stringify(project));
  const zip = Buffer.from(zipSync(entries));
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    alertDialog(page).getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('old.zip', zip, 'application/zip'));
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  const s = (await state(page)) as unknown as {
    posts: { friend: boolean; inFeed: boolean }[];
    stories: { friend: boolean; seen: boolean; count: number }[];
    feed: { myStories: string[] };
  };
  expect(s.posts.every((p) => p.friend === false && p.inFeed === true)).toBe(true);
  expect(s.stories).toHaveLength(1);
  expect(s.stories[0]).toMatchObject({ friend: false, seen: false, count: 1 });
  expect(s.feed.myStories).toEqual(['s1']);
  expect((await state(page)).dm.threads.map((t) => t.id)).toEqual(['t1', 't2']);
  await tab(page, '首頁動態').click();
  expect((await layout(page)).hits.map((h) => h.key)).toContain('tray:s1');
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T10:00:00+08:00'));
  const errors = await open(page);
  await page.waitForTimeout(300);
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('social-post-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('social-post-390.png', { fullPage: true });
  for (const t of ['留言', '限時動態', '個人頁', '帳號與畫面'] as const) {
    await tab(page, t).click();
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});
