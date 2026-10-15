/**
 * 短文圖片產生器（建置產物 next/prose-card/）的端對端測試（規格 docs/refactor/specs/prose-card.md）：
 * - 開頁沒有錯誤、預設範例一頁、頁尾只有靈感來源；
 * - 標題、小標、頁首、頁尾、自動頁碼與起始頁碼、整份的字型；
 * - 本文：打字、Enter、粗體／斜體／刪除線（快捷鍵與工具列）、沒有選取時接下來打的字、文字顏色、螢光筆、我的顏色、
 *   選取文字的字型與字級、清除格式、段落對齊、整體對齊、行距、本文字級、貼上只取純文字；
 * - 復原／重做（打字中、游標放在改變的地方）；
 * - 分頁：Ctrl＋Enter、工具列、Backspace 拿掉；放不下時自動接到下一頁、頁碼；
 * - 下載：一頁的 PNG（2400 × 3200、1 倍 1200 × 1600）、兩頁以上的 ZIP 與單頁下載；
 * - 背景：單色、漸層、圖片（模糊、飽和度、變暗）、紙張紋理；照片＋文字：照片、高度、蓋滿／完整顯示、調整位置、拿掉；
 * - 我的字型：加入、選用、刪除；自動儲存與還原（含圖片）、專案檔；
 * - 390 寬：切換列、沒有橫向捲動；1280 與 390 的視覺基準。
 *
 * 兩次修改之間至少間隔 450 ms（0.4 秒內的連續變更合成一步復原）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('prose-card') ?? { id: 'prose-card', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:prose-card';
const PREFS_KEY = 'trpg-toolkit:prose-card:preview';
const FONT = '/usr/share/fonts/opentype/tlwg/Loma.otf';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgb = [number, number, number];

interface Run {
  text: string;
  bold: boolean;
  color: string;
  italic?: boolean;
  strike?: boolean;
  highlight?: string;
  size?: number;
  font?: string;
}
interface Line {
  runs: Run[];
  align?: string;
  pageBreak?: boolean;
}
interface State {
  layout: string;
  title: string;
  kicker: string;
  icon: string;
  header: string;
  footerLeft: string;
  footerRight: string;
  autoNumber: boolean;
  pageStart: number;
  font: string;
  body: { lines: Line[] };
  align: string;
  bodySize: number;
  lineHeight: number;
  textColor: string;
  texture: boolean;
  bg: {
    kind: string;
    color: string;
    from: string;
    to: string;
    angle: number;
    image: { id: string; name: string } | null;
    blur: number;
    saturation: number;
    dim: number;
    place: { zoom: number; x: number; y: number; turns: number };
  };
  photo: {
    image: { id: string; name: string } | null;
    height: number;
    fit: string;
    place: { zoom: number; x: number; y: number; turns: number };
  };
}

/* ---------- 共用 ---------- */

async function open(page: Page, { mobile = false }: { mobile?: boolean } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '短文圖片產生器' })).toBeVisible();
  /* 手機一開始是編輯畫面（預覽藏起來） */
  if (mobile) await expect(page.locator('[data-rich-editor="full"]')).toBeVisible();
  else await expect(page.getByTestId('prose-page').first()).toBeVisible();
  return errors;
}

const editor = (page: Page) => page.locator('[data-rich-editor="full"]');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: '本文文字格式' });
const pages = (page: Page) => page.getByTestId('prose-page');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const tab = (page: Page, name: '文字' | '背景' | '版面') => page.getByRole('tab', { name });

async function state(page: Page): Promise<State> {
  return page.evaluate(() =>
    (window as unknown as { __proseCard: { doc: () => State } }).__proseCard.doc(),
  );
}

async function saved(page: Page): Promise<State> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
    STORAGE_KEY,
  );
}

const lineText = (l: Line) => l.runs.map((r) => r.text).join('');
const bodyText = async (page: Page) => (await state(page)).body.lines.map(lineText).join('\n');

async function expectPages(page: Page, n: number) {
  await expect(page.getByTestId('page-count')).toHaveAttribute('data-count', String(n));
  await expect(pages(page)).toHaveCount(n);
}

/** 本文換成一段純文字（全選後貼上） */
async function setBody(page: Page, text: string) {
  await page.getByRole('tab', { name: '文字' }).click();
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await editor(page).evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, text);
  await expect.poll(() => bodyText(page)).toBe(text.replace(/\r\n?/g, '\n'));
}

/** 選取本文裡的一段字（第一個出現的地方；可以跨片段，不跨段落） */
async function selectText(page: Page, text: string) {
  await editor(page).evaluate((el, text) => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    const all = nodes.map((n) => n.nodeValue ?? '').join('');
    const i = all.indexOf(text);
    if (i < 0) throw new Error(`找不到「${text}」`);
    const at = (pos: number, end: boolean): [Text, number] => {
      let left = pos;
      for (const n of nodes) {
        const len = (n.nodeValue ?? '').length;
        if (end ? left <= len : left < len) return [n, left];
        left -= len;
      }
      const last = nodes[nodes.length - 1];
      return [last, (last.nodeValue ?? '').length];
    };
    (el as HTMLElement).focus();
    const r = document.createRange();
    r.setStart(...at(i, false));
    r.setEnd(...at(i + text.length, true));
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  }, text);
  await page.waitForTimeout(80);
}

/** 游標放在本文的某段字後面 */
async function caretAfter(page: Page, text: string) {
  await editor(page).evaluate((el, text) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.nodeValue ?? '').indexOf(text);
      if (i < 0) continue;
      (el as HTMLElement).focus();
      const r = document.createRange();
      r.setStart(n, i + text.length);
      r.collapse(true);
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
      return;
    }
    throw new Error(`找不到「${text}」`);
  }, text);
  await page.waitForTimeout(80);
}

/** 游標在本文的位置（全文位置；只算文字與段落） */
async function caretOffset(page: Page): Promise<number> {
  return editor(page).evaluate((el) => {
    const s = getSelection();
    if (!s?.rangeCount) return -1;
    const r = document.createRange();
    r.setStart(el, 0);
    r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset);
    const frag = r.cloneContents();
    let n = 0;
    const lines = frag.childNodes.length;
    frag.childNodes.forEach((c) => {
      n += (c.textContent ?? '').length;
    });
    return n + Math.max(0, lines - 1);
  });
}

/** 某一頁上一區的平均顏色（頁面座標） */
async function mean(page: Page, index: number, x: number, y: number, w = 20, h = 20): Promise<Rgb> {
  return pages(page)
    .nth(index)
    .evaluate(
      (el, [x, y, w, h]) => {
        const c = el as HTMLCanvasElement;
        const d = c.getContext('2d')?.getImageData(x, y, w, h).data;
        const sum: [number, number, number] = [0, 0, 0];
        if (!d) return sum;
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
        return sum.map((v) => Math.round(v / (w * h))) as [number, number, number];
      },
      [x, y, w, h],
    );
}

/** 某一頁的雜湊（內容有沒有變） */
async function pageHash(page: Page, index = 0): Promise<number> {
  return pages(page)
    .nth(index)
    .evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      if (!d) return 0;
      for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
      return h;
    });
}

/** 某一區裡比底色暗很多的像素數（有沒有畫字；頁尾的字是半透明的，門檻放寬） */
async function ink(page: Page, index: number, x: number, y: number, w: number, h: number) {
  return pages(page)
    .nth(index)
    .evaluate(
      (el, [x, y, w, h]) => {
        const c = el as HTMLCanvasElement;
        const d = c.getContext('2d')?.getImageData(x, y, w, h).data;
        if (!d) return 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 540) n++;
        return n;
      },
      [x, y, w, h],
    );
}

/** 某一區裡接近某個顏色的像素數 */
async function countColor(
  page: Page,
  index: number,
  [x, y, w, h]: [number, number, number, number],
  rgb: Rgb,
  tol = 24,
) {
  return pages(page)
    .nth(index)
    .evaluate(
      (el, { box, rgb, tol }) => {
        const c = el as HTMLCanvasElement;
        const d = c.getContext('2d')?.getImageData(box[0], box[1], box[2], box[3]).data;
        if (!d) return 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (Math.max(...[0, 1, 2].map((k) => Math.abs(d[i + k] - rgb[k]))) <= tol) n++;
        return n;
      },
      { box: [x, y, w, h], rgb, tol },
    );
}

const near = (a: number[], b: number[], tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

interface Png {
  width: number;
  height: number;
  at: (x: number, y: number) => number[];
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
    at: (x, y) => Array.from(px.subarray((y * ihdr.width + x) * 4, (y * ihdr.width + x) * 4 + 4)),
  };
}

async function solidPng(w: number, h: number, rgb: Rgb): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([...rgb, 255], i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 左右兩半不同顏色的圖 */
async function halvesPng(w: number, h: number, left: Rgb, right: Rgb): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) px.set([...(x < w / 2 ? left : right), 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

async function exportResult(page: Page) {
  const panel = page.getByRole('region', { name: '下載' });
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  return panel;
}

async function download(page: Page, click: () => Promise<unknown>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

const longText = (n: number) =>
  Array.from({ length: n }, (_, i) => `第${i + 1}行的文字`).join('\n');

/* ---------- 開頁 ---------- */

test('開頁：沒有錯誤、預設範例一頁、頁面 1200 × 1600、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  await expectPages(page, 1);
  await expect(pages(page).first()).toHaveAttribute('width', '1200');
  await expect(pages(page).first()).toHaveAttribute('height', '1600');
  await expect(page.getByText('每頁 2400 × 3200 px')).toBeVisible();
  const s = await state(page);
  expect(s.layout).toBe('cover');
  expect(s.title).toBe('霧港燈塔');
  expect(s.body.lines.length).toBe(11);
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: 'dan0030/writeediter2' })).toHaveAttribute(
    'href',
    'https://github.com/dan0030/writeediter2',
  );
  /* 封面：上方大片留白（沒有字）、文字在下半部 */
  expect(await ink(page, 0, 120, 260, 960, 300)).toBe(0);
  expect(await ink(page, 0, 120, 780, 600, 600)).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

/* ---------- 標題與頁首頁尾 ---------- */

test('標題、小標、頁首、頁尾、自動頁碼與起始頁碼、整份的字型', async ({ page }) => {
  const errors = await open(page);
  const field = (name: string) => page.locator(`[data-field="${name}"]`);
  let h = await pageHash(page);
  await field('title').fill('燈塔之後');
  await expect.poll(async () => (await state(page)).title).toBe('燈塔之後');
  await expect.poll(() => pageHash(page)).not.toBe(h);
  await page.waitForTimeout(450);
  await field('kicker').fill('第四夜');
  await page.waitForTimeout(450);
  await field('header').fill('CHAPTER 4');
  await page.waitForTimeout(450);
  await field('footerLeft').fill('KP 阿德');
  await expect.poll(async () => (await state(page)).footerLeft).toBe('KP 阿德');
  /* 自動頁碼：頁尾右邊不能改；起始頁碼 */
  await expect(field('footerRight')).toBeDisabled();
  await expect(field('footerRight')).toHaveAttribute('placeholder', '自動頁碼');
  await page.waitForTimeout(450);
  const start = page.getByRole('spinbutton', { name: '起始頁碼' });
  await start.fill('12');
  await start.press('Enter');
  await expect.poll(async () => (await state(page)).pageStart).toBe(12);
  await page.waitForTimeout(450);
  await page.getByRole('switch', { name: '頁尾右邊自動放頁碼' }).click();
  await expect(start).toBeHidden();
  await expect(field('footerRight')).toBeEnabled();
  await page.waitForTimeout(450);
  await field('footerRight').fill('END');
  await expect.poll(async () => (await state(page)).footerRight).toBe('END');
  /* 整份的字型 */
  h = await pageHash(page);
  await page.waitForTimeout(450);
  await field('font').click();
  await page.getByRole('option', { name: '思源黑體' }).click();
  await expect.poll(async () => (await state(page)).font).toBe('Noto Sans TC');
  /* 自動儲存 */
  await expect.poll(async () => (await saved(page))?.footerRight).toBe('END');
  expect(errors).toEqual([]);
});

/* ---------- 本文 ---------- */

test('本文：打字、Enter、粗體／斜體／刪除線（快捷鍵與工具列）、沒有選取時接下來打的字', async ({
  page,
}) => {
  const errors = await open(page);
  await setBody(page, '甲乙丙丁');
  await page.waitForTimeout(450);
  await caretAfter(page, '甲乙丙丁');
  await page.keyboard.press('Enter');
  await page.keyboard.type('戊己');
  await expect.poll(() => bodyText(page)).toBe('甲乙丙丁\n戊己');
  /* 粗體：Ctrl＋B；工具列按下狀態 */
  await page.waitForTimeout(450);
  await selectText(page, '乙丙');
  await page.keyboard.press('ControlOrMeta+b');
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs)
    .toEqual([
      { text: '甲', bold: false, color: '' },
      { text: '乙丙', bold: true, color: '' },
      { text: '丁', bold: false, color: '' },
    ]);
  await expect(toolbar(page).locator('[data-mark="bold"]')).toHaveAttribute('aria-pressed', 'true');
  /* 斜體：工具列；刪除線：Ctrl＋Shift＋X */
  await page.waitForTimeout(450);
  await selectText(page, '丙丁');
  await toolbar(page).locator('[data-mark="italic"]').click();
  await page.waitForTimeout(450);
  await selectText(page, '戊');
  await page.keyboard.press('ControlOrMeta+Shift+x');
  await expect
    .poll(async () => (await state(page)).body.lines)
    .toEqual([
      {
        runs: [
          { text: '甲', bold: false, color: '' },
          { text: '乙', bold: true, color: '' },
          { text: '丙', bold: true, color: '', italic: true },
          { text: '丁', bold: false, color: '', italic: true },
        ],
      },
      {
        runs: [
          { text: '戊', bold: false, color: '', strike: true },
          { text: '己', bold: false, color: '' },
        ],
      },
    ]);
  /* 沒有選取：按粗體後打的字是粗體 */
  await page.waitForTimeout(450);
  await caretAfter(page, '己');
  await toolbar(page).locator('[data-mark="bold"]').click();
  await expect(toolbar(page).locator('[data-mark="bold"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('庚');
  await expect
    .poll(async () => (await state(page)).body.lines[1].runs.at(-1))
    .toEqual({ text: '庚', bold: true, color: '' });
  /* 畫面：粗體、斜體、刪除線畫在頁面上（和沒有格式時不同） */
  expect(await ink(page, 0, 120, 1000, 400, 300)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('文字顏色、螢光筆、我的顏色、選取文字的字型與字級、清除格式', async ({ page }) => {
  const errors = await open(page);
  await setBody(page, '一二三四五六');
  await page.waitForTimeout(450);
  /* 文字顏色：常用色 */
  await selectText(page, '二三');
  await toolbar(page).locator('[data-color-button="text"]').click();
  const pop = page.getByRole('dialog', { name: '文字顏色' });
  await pop.getByRole('button', { name: '套用 #2f4a6b' }).click();
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs[1])
    .toEqual({ text: '二三', bold: false, color: '#2f4a6b' });
  /* 我的顏色：存下目前的顏色 */
  await pop.getByRole('button', { name: '＋ 存成我的顏色' }).click();
  await expect(pop.getByRole('button', { name: '套用我的顏色 #2f4a6b' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.state?.data?.textPresets,
        PREFS_KEY,
      ),
    )
    .toEqual(['#2f4a6b']);
  /* 回到預設字色 */
  await page.waitForTimeout(450);
  await pop.getByRole('button', { name: '回到預設字色' }).click();
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs)
    .toEqual([{ text: '一二三四五六', bold: false, color: '' }]);
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  /* 螢光筆：常用色、色碼、拿掉 */
  await page.waitForTimeout(450);
  await selectText(page, '四五');
  await toolbar(page).locator('[data-color-button="highlight"]').click();
  const hl = page.getByRole('dialog', { name: '螢光筆' });
  await hl.getByRole('button', { name: '套用 #fff0a8' }).click();
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs[1])
    .toEqual({ text: '四五', bold: false, color: '', highlight: '#fff0a8' });
  /* 頁面上：螢光筆的底色（淡黃）畫在字的後面（封面的本文只有一行：在頁尾上方） */
  await expect
    .poll(() => countColor(page, 0, [200, 1300, 80, 92], [255, 240, 168]))
    .toBeGreaterThan(300);
  await page.waitForTimeout(450);
  const hex = hl.getByRole('textbox', { name: '色碼' });
  await hex.fill('#d4e4f5');
  await hex.press('Enter');
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs[1].highlight)
    .toBe('#d4e4f5');
  await page.waitForTimeout(450);
  await hl.getByRole('button', { name: '拿掉螢光筆' }).click();
  await expect.poll(async () => (await state(page)).body.lines[0].runs.length).toBe(1);
  await page.keyboard.press('Escape');
  /* 字級、字型 */
  await page.waitForTimeout(450);
  await selectText(page, '一');
  await page.getByRole('combobox', { name: '選取文字的字級' }).click();
  await page.getByRole('option', { name: '58 px' }).click();
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs[0])
    .toEqual({ text: '一', bold: false, color: '', size: 58 });
  await page.waitForTimeout(450);
  await selectText(page, '六');
  await page.getByRole('combobox', { name: '選取文字的字型' }).click();
  await page.getByRole('option', { name: '粉圓體' }).click();
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs.at(-1))
    .toEqual({ text: '六', bold: false, color: '', font: 'Huninn' });
  /* 清除格式 */
  await page.waitForTimeout(450);
  await selectText(page, '一二三四五六');
  await toolbar(page).locator('[data-rich-clear]').click();
  await expect
    .poll(async () => (await state(page)).body.lines[0].runs)
    .toEqual([{ text: '一二三四五六', bold: false, color: '' }]);
  expect(errors).toEqual([]);
});

test('段落對齊（選取的段落）、整體對齊、行距、本文字級', async ({ page }) => {
  const errors = await open(page);
  await setBody(page, '甲\n乙\n丙');
  await page.waitForTimeout(450);
  await caretAfter(page, '乙');
  await page
    .getByRole('group', { name: '選取段落的對齊' })
    .locator('[data-rich-align="right"]')
    .click();
  await expect
    .poll(async () => (await state(page)).body.lines.map((l) => l.align ?? null))
    .toEqual([null, 'right', null]);
  await expect(page.locator('[data-rich-align="right"]')).toHaveAttribute('aria-pressed', 'true');
  /* 頁面上：「乙」靠右（右半邊有字） */
  const s0 = await state(page);
  expect(s0.align).toBe('left');
  await page.waitForTimeout(450);
  await caretAfter(page, '乙');
  await page.getByRole('button', { name: '跟著整體', exact: true }).click();
  await expect.poll(async () => (await state(page)).body.lines[1].align).toBeUndefined();
  /* 整體對齊 */
  await page.waitForTimeout(450);
  await page.getByRole('radio', { name: '整體對齊：置中' }).click();
  await expect.poll(async () => (await state(page)).align).toBe('center');
  await expect(editor(page)).toHaveCSS('text-align', 'center');
  /* 行距、本文字級 */
  await page.waitForTimeout(450);
  await page.locator('[data-field="lineHeight"]').click();
  await page.getByRole('option', { name: '2.6' }).click();
  await expect.poll(async () => (await state(page)).lineHeight).toBe(2.6);
  await page.waitForTimeout(450);
  await page.locator('[data-field="bodySize"]').click();
  await page.getByRole('option', { name: '40 px' }).click();
  await expect.poll(async () => (await state(page)).bodySize).toBe(40);
  expect(errors).toEqual([]);
});

test('貼上只取純文字；格式跟著游標前面的字', async ({ page }) => {
  const errors = await open(page);
  await setBody(page, '甲乙');
  await page.waitForTimeout(450);
  await selectText(page, '甲');
  await page.keyboard.press('ControlOrMeta+b');
  await page.waitForTimeout(450);
  await caretAfter(page, '甲');
  await editor(page).evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'X\nY');
    dt.setData('text/html', '<b style="color:red">X</b><br>Y');
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect.poll(() => bodyText(page)).toBe('甲X\nY乙');
  const s = await state(page);
  expect(s.body.lines[0].runs).toEqual([{ text: '甲X', bold: true, color: '' }]);
  expect(await caretOffset(page)).toBe(4);
  expect(errors).toEqual([]);
});

/* ---------- 復原 ---------- */

test('復原／重做：打字中也可以，游標放在改變的地方；頁首的按鈕', async ({ page }) => {
  const errors = await open(page);
  await setBody(page, '甲乙丙');
  await page.waitForTimeout(450);
  await caretAfter(page, '甲');
  await page.keyboard.type('XYZ');
  await expect.poll(() => bodyText(page)).toBe('甲XYZ乙丙');
  await page.waitForTimeout(450);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => bodyText(page)).toBe('甲乙丙');
  await expect(editor(page)).toBeFocused();
  expect(await caretOffset(page)).toBe(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => bodyText(page)).toBe('甲XYZ乙丙');
  expect(await caretOffset(page)).toBe(4);
  /* Ctrl＋Y 也是重做；頁首的復原按鈕 */
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+y');
  await expect.poll(() => bodyText(page)).toBe('甲XYZ乙丙');
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect.poll(() => bodyText(page)).toBe('甲乙丙');
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect.poll(() => bodyText(page)).toBe('甲XYZ乙丙');
  /* 標題欄裡的 Ctrl＋Z 也是同一份復原紀錄 */
  await page.waitForTimeout(450);
  const title = page.locator('[data-field="title"]');
  await title.fill('新標題');
  await page.waitForTimeout(450);
  await title.press('ControlOrMeta+z');
  await expect.poll(async () => (await state(page)).title).toBe('霧港燈塔');
  expect(errors).toEqual([]);
});

/* ---------- 分頁 ---------- */

test('分頁：Ctrl＋Enter、段落開頭 Backspace 拿掉、工具列；放不下時自動接到下一頁、頁碼', async ({
  page,
}) => {
  const errors = await open(page);
  await setBody(page, '甲乙\n丙');
  await page.waitForTimeout(450);
  await caretAfter(page, '甲');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect.poll(() => bodyText(page)).toBe('甲\n乙\n丙');
  await expect.poll(async () => (await state(page)).body.lines[1].pageBreak).toBe(true);
  await expect(toast(page, '從這裡開始換到下一頁。')).toBeVisible();
  await expectPages(page, 2);
  await expect(editor(page).locator('[data-page-break]')).toHaveCount(1);
  /* 段落開頭按 Backspace：先拿掉分頁（字不動） */
  await page.waitForTimeout(450);
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await state(page)).body.lines[1].pageBreak).toBeUndefined();
  await expect.poll(() => bodyText(page)).toBe('甲\n乙\n丙');
  await expectPages(page, 1);
  /* 工具列的分頁鈕：游標在段落開頭時直接設定；再按一次拿掉 */
  await page.waitForTimeout(450);
  const btn = toolbar(page).locator('[data-rich-page-break]');
  await caretAfter(page, '乙');
  await page.keyboard.press('Home');
  await btn.click();
  await expectPages(page, 2);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(450);
  await btn.click();
  await expectPages(page, 1);
  /* 自動分頁：封面第一頁 11 行，接續的頁 19 行（30 px × 1.9） */
  await page.waitForTimeout(450);
  await setBody(page, longText(40));
  await expectPages(page, 3);
  await expect(page.getByTestId('page-caption').nth(1)).toHaveText('02 / 03');
  /* 接續的頁：頁首（細線）＋標題一行＋本文 */
  expect(await ink(page, 1, 120, 300, 600, 900)).toBeGreaterThan(1000);
  /* 頁碼：自動頁碼的第 2 頁是 02（右下角有字） */
  expect(await ink(page, 1, 1000, 1470, 80, 26)).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

/* ---------- 下載 ---------- */

test('下載：一頁的 PNG 2400 × 3200（1 倍 1200 × 1600），像素和預覽一致', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  const panel = await exportResult(page);
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const png = await download(page, () => result.getByRole('link', { name: '下載' }).click());
  expect(png.name).toBe('霧港燈塔.png');
  const img = readPng(png.bytes);
  expect([img.width, img.height]).toEqual([2400, 3200]);
  /* 背景色（左上角，避開紋理取平均）與預覽相同 */
  const pv = await mean(page, 0, 40, 40, 20, 20);
  const sum = [0, 0, 0];
  for (let y = 80; y < 120; y++)
    for (let x = 80; x < 120; x++) {
      const c = img.at(x, y);
      for (let k = 0; k < 3; k++) sum[k] += c[k];
    }
  expect(
    near(
      sum.map((v) => v / 1600),
      pv,
      6,
    ),
  ).toBe(true);
  /* 1 倍 */
  await panel.getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^100%/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.state?.data?.scale,
        PREFS_KEY,
      ),
    )
    .toBe(1);
  await expect(page.getByText('每頁 1200 × 1600 px')).toBeVisible();
  await panel.getByRole('button', { name: '匯出 PNG' }).click();
  await expect(result).toBeVisible({ timeout: 60_000 });
  const small = await download(page, () => result.getByRole('link', { name: '下載' }).click());
  expect(readPng(small.bytes).width).toBe(1200);
  expect(errors).toEqual([]);
});

test('下載：兩頁以上——全部、打包成 ZIP、只下載這一頁；檔名有頁碼', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  await page.locator('[data-field="title"]').fill('長/文?');
  await page.waitForTimeout(450);
  await setBody(page, longText(25));
  await expectPages(page, 2);
  await exportResult(page);
  const batch = page.getByTestId('export-batch');
  await expect(batch).toBeVisible({ timeout: 90_000 });
  await expect(batch.getByText('共 2 個檔案')).toBeVisible();
  const zip = await download(page, () => batch.getByRole('button', { name: '打包成 ZIP' }).click());
  expect(zip.name).toBe('長-文-.zip');
  const entries = unzipSync(zip.bytes);
  expect(Object.keys(entries).sort()).toEqual(['長-文--01.png', '長-文--02.png']);
  expect(readPng(entries['長-文--02.png']).height).toBe(3200);
  /* 只下載第 2 頁 */
  const one = await download(page, () =>
    page.getByRole('button', { name: '下載這一頁（02 / 02）' }).click(),
  );
  expect(one.name).toBe('長-文--02.png');
  expect(readPng(one.bytes).width).toBe(2400);
  expect(errors).toEqual([]);
});

/* ---------- 背景 ---------- */

test('背景：單色、漸層、圖片（模糊、飽和度、變暗）、預設字色、紙張紋理', async ({ page }) => {
  const errors = await open(page);
  await tab(page, '背景').click();
  /* 紋理關掉：背景是純色 */
  await page.getByRole('switch', { name: '紙張紋理' }).click();
  await expect.poll(async () => (await state(page)).texture).toBe(false);
  await expect.poll(async () => mean(page, 0, 20, 20)).toEqual([0xf2, 0xee, 0xe5]);
  await page.waitForTimeout(450);
  await page.getByRole('textbox', { name: '背景顏色色碼' }).fill('#203040');
  await expect.poll(async () => mean(page, 0, 20, 20)).toEqual([0x20, 0x30, 0x40]);
  /* 漸層：180°（由上往下）＝上面起始色、下面結束色 */
  await page.waitForTimeout(450);
  await page.getByRole('radio', { name: '漸層' }).click();
  await page.getByRole('textbox', { name: '起始顏色色碼' }).fill('#ff0000');
  await page.waitForTimeout(450);
  await page.getByRole('textbox', { name: '結束顏色色碼' }).fill('#0000ff');
  await page.waitForTimeout(450);
  const angle = page.getByRole('spinbutton', { name: '漸層角度' });
  await angle.fill('180');
  await angle.press('Enter');
  await expect
    .poll(async () => near(await mean(page, 0, 590, 2, 20, 4), [255, 0, 0], 12))
    .toBe(true);
  await expect
    .poll(async () => near(await mean(page, 0, 590, 1594, 20, 4), [0, 0, 255], 12))
    .toBe(true);
  /* 圖片：左紅右綠；模糊後中間混色；飽和度 0 變灰；變暗 */
  await page.waitForTimeout(450);
  await page.getByRole('radio', { name: '圖片' }).click();
  await expect(page.getByText('還沒有背景圖片，先畫成背景顏色。')).toBeVisible();
  await page
    .getByTestId('bg-load')
    .locator('input[type=file]')
    .setInputFiles(file('bg.png', await halvesPng(300, 400, [220, 30, 30], [30, 200, 30])));
  await expect(page.getByTestId('bg-name')).toContainText('bg.png');
  await expect(toast(page, '已換上背景圖片。')).toBeVisible();
  const s = await state(page);
  expect(s.bg.kind).toBe('image');
  expect(s.bg.image?.name).toBe('bg.png');
  /* 預設：模糊 5、飽和度 80%、變暗 18% */
  const leftDefault = await mean(page, 0, 100, 800);
  expect(leftDefault[0]).toBeGreaterThan(leftDefault[1] + 40);
  await page.waitForTimeout(450);
  const sat = page.getByRole('spinbutton', { name: '飽和度' });
  await sat.fill('0');
  await sat.press('Enter');
  await expect
    .poll(async () => {
      const c = await mean(page, 0, 100, 800);
      return Math.max(...c) - Math.min(...c);
    })
    .toBeLessThan(6);
  await page.waitForTimeout(450);
  const dim = page.getByRole('spinbutton', { name: '變暗' });
  await dim.fill('70');
  await dim.press('Enter');
  await expect.poll(async () => (await mean(page, 0, 100, 800))[0]).toBeLessThan(45);
  /* 預設字色 */
  await page.waitForTimeout(450);
  await page.getByRole('textbox', { name: '預設字色色碼' }).fill('#ffffff');
  await expect.poll(async () => (await state(page)).textColor).toBe('#ffffff');
  /* 拿掉背景圖片 */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '拿掉背景圖片' }).click();
  await expect.poll(async () => (await state(page)).bg.image).toBeNull();
  expect(errors).toEqual([]);
});

/* ---------- 照片＋文字 ---------- */

test('照片＋文字：放照片、照片高度、蓋滿／完整顯示、調整位置、回到置中、拿掉', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('radio', { name: '照片＋文字' }).click();
  await expect(tab(page, '版面')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(async () => (await state(page)).layout).toBe('photo');
  /* 沒有照片：空的框（框的上緣 96、高 600） */
  await page
    .getByTestId('photo-load')
    .locator('input[type=file]')
    .setInputFiles(file('wide.png', await halvesPng(800, 200, [200, 40, 40], [40, 80, 200])));
  await expect(page.getByTestId('photo-name')).toContainText('wide.png');
  /* 蓋滿：框的左右兩端是圖片中間附近（紅與藍） */
  await expect.poll(async () => near(await mean(page, 0, 130, 380), [200, 40, 40], 20)).toBe(true);
  await expect.poll(async () => near(await mean(page, 0, 1050, 380), [40, 80, 200], 20)).toBe(true);
  /* 完整顯示：圖片 4:1 放進 960 × 600 → 高 240，框的上下是空的 */
  await page.waitForTimeout(450);
  await page.getByRole('radio', { name: '完整顯示' }).click();
  await expect
    .poll(async () => near(await mean(page, 0, 300, 396, 20, 6), [200, 40, 40], 20))
    .toBe(true);
  expect(near(await mean(page, 0, 300, 140, 20, 10), [200, 40, 40], 40)).toBe(false);
  /* 照片高度 */
  await page.waitForTimeout(450);
  const height = page.getByRole('spinbutton', { name: '照片高度' });
  await height.fill('300');
  await height.press('Enter');
  await expect.poll(async () => (await state(page)).photo.height).toBe(300);
  /* 調整位置：對話框、放大後套用 */
  await page.waitForTimeout(450);
  await page.getByRole('radio', { name: '蓋滿' }).click();
  await page.getByRole('button', { name: '調整位置與縮放…' }).click();
  const dlg = page.getByRole('dialog', { name: '照片的位置與縮放' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: '放大' }).click();
  await dlg.getByRole('button', { name: '套用' }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(async () => (await state(page)).photo.place.zoom).toBeCloseTo(1.1, 3);
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '回到置中' }).click();
  await expect.poll(async () => (await state(page)).photo.place.zoom).toBe(1);
  /* 頁首文字在照片右下角（深色的標籤） */
  expect(await ink(page, 0, 900, 84 + 300 - 50, 158, 32)).toBeGreaterThan(200);
  /* 拿掉 */
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: '拿掉照片' }).click();
  await expect.poll(async () => (await state(page)).photo.image).toBeNull();
  /* 其他版面：說明要選照片＋文字 */
  await page.getByRole('radio', { name: '內文頁' }).click();
  await expect(page.getByText('要放照片時，在上面選「照片＋文字」版面。')).toBeVisible();
  expect(errors).toEqual([]);
});

test('照片太高：第一頁放不下本文，本文從第 2 頁開始', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('radio', { name: '照片＋文字' }).click();
  const height = page.getByRole('spinbutton', { name: '照片高度' });
  await height.fill('1100');
  await height.press('Enter');
  await expect(page.getByText('照片太高，第一頁放不下本文：本文從第 2 頁開始。')).toBeVisible();
  await expectPages(page, 2);
  expect(errors).toEqual([]);
});

/* ---------- 我的字型 ---------- */

test('我的字型：加入（存在瀏覽器）、整份與選取文字都能選、刪除後改回預設字型', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '我的字型' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '加入字型檔…' }).click();
  await (await chooser).setFiles(FONT);
  await expect(toast(page, /已加入字型「.+」。/)).toBeVisible();
  const chip = page.getByRole('list', { name: '我的字型' }).getByRole('listitem');
  await expect(chip).toHaveCount(1);
  const family = (await chip.textContent())?.trim() ?? '';
  expect(family.length).toBeGreaterThan(0);
  await page.locator('[data-field="font"]').click();
  await page.getByRole('option', { name: `我的字型・${family}` }).click();
  await expect.poll(async () => (await state(page)).font).toBe(family);
  /* 重新整理後還在 */
  await page.reload();
  await expect(page.getByRole('list', { name: '我的字型' }).getByRole('listitem')).toHaveCount(1);
  /* 刪除：先確認；用到的地方改回預設字型 */
  await page.getByRole('button', { name: `刪除字型「${family}」` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(page.getByText('還沒有加入字型。')).toBeVisible();
  await expect.poll(async () => (await state(page)).font).toBe('Noto Serif TC');
  expect(errors).toEqual([]);
});

/* ---------- 儲存 ---------- */

test('自動儲存與還原（含圖片）；專案檔存了再開', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await page.getByRole('radio', { name: '照片＋文字' }).click();
  await page
    .getByTestId('photo-load')
    .locator('input[type=file]')
    .setInputFiles(file('red.png', await solidPng(200, 100, [200, 30, 30])));
  await expect(page.getByTestId('photo-name')).toContainText('red.png');
  await page.waitForTimeout(450);
  await setBody(page, '保存的本文');
  await expect
    .poll(async () => lineText((await saved(page))?.body.lines[0] ?? { runs: [] }))
    .toBe('保存的本文');
  await page.reload();
  await expect.poll(() => bodyText(page)).toBe('保存的本文');
  await expect(page.getByTestId('photo-name')).toContainText('red.png');
  await expect.poll(async () => near(await mean(page, 0, 500, 300), [200, 30, 30], 12)).toBe(true);
  /* 專案檔：ZIP（project.json＋圖片） */
  await page.getByRole('button', { name: '專案' }).click();
  const proj = await download(page, () =>
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  );
  expect(proj.name).toMatch(/\.zip$/);
  const entries = unzipSync(proj.bytes);
  const names = Object.keys(entries);
  expect(names).toContain('project.json');
  expect(names.some((n) => /^files\/[0-9a-f]+\.png$/.test(n))).toBe(true);
  const json = JSON.parse(new TextDecoder().decode(entries['project.json']));
  expect(json.data.state.photo.image.name).toBe('red.png');
  /* 改掉之後開回來 */
  await page.waitForTimeout(450);
  await setBody(page, '別的內容');
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles({
    name: proj.name,
    mimeType: 'application/zip',
    buffer: Buffer.from(proj.bytes),
  });
  await expect.poll(() => bodyText(page)).toBe('保存的本文');
  await expect(toast(page, '已開啟專案檔')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 手機 ---------- */

test.describe('390 寬', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('切換列：編輯／預覽／儲存；沒有橫向捲動', async ({ page }) => {
    const errors = await open(page, { mobile: true });
    const bar = page.getByRole('navigation', { name: '切換畫面' });
    await expect(bar).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(pages(page).first()).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await bar.getByRole('button', { name: '預覽' }).click();
    await expect(pages(page).first()).toBeVisible();
    await expect(editor(page)).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await bar.getByRole('button', { name: '編輯' }).click();
    await expect(editor(page)).toBeVisible();
    /* 儲存：切到預覽、捲到下載區並開始匯出 */
    await bar.getByRole('button', { name: '儲存' }).click();
    await expect(page.getByTestId('export-result')).toBeVisible({ timeout: 60_000 });
    for (const t of ['背景', '版面'] as const) {
      await bar.getByRole('button', { name: '編輯' }).click();
      await tab(page, t).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
    }
    expect(errors).toEqual([]);
  });

  test('視覺基準（390）', async ({ page }) => {
    await open(page, { mobile: true });
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('prose-card-390.png', { fullPage: true });
  });
});

test('視覺基準（1280）', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(600);
  await expect(page).toHaveScreenshot('prose-card-1280.png', { fullPage: true });
});
