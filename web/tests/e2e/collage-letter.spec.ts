/**
 * 匿名拼貼信產生器（建置產物 next/collage-letter/）的端對端測試：
 * 開頁流程（載入字型 → 自動產生）、版面幾何（規格 3.1）、數值欄的退回與對調、按「產生」才套用、
 * 配色與字型的新增刪除與全部未勾選、HTML 與 Roll20 格式文字（解析驗證）、PNG／JPG 下載（解析驗證）、
 * 複製圖片、複製失敗、提示訊息、不保留狀態、字素切字、390 寬沒有橫向捲動、視覺回歸基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzlibSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('collage-letter') ?? { id: 'collage-letter', status: 'next' })}/`;
const SEED = 20261001;

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL + query);
  await expect(page.getByRole('heading', { level: 1, name: '匿名拼貼信產生器' })).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('data-generation', '1', { timeout: 20_000 });
  await expect(generateButton(page)).toBeEnabled();
  return errors;
}

const generateButton = (page: Page) => page.getByRole('button', { name: '產生', exact: true });
const canvas = (page: Page) => page.getByTestId('collage-canvas');
const content = (page: Page) => page.getByRole('textbox', { name: '內容' });
const num = (page: Page, name: string) => page.getByRole('spinbutton', { name, exact: true });
const sizeText = (page: Page) => page.getByTestId('collage-size');
const piecesText = (page: Page) => page.getByTestId('collage-pieces');

/** 按「產生」並等到這次產生完成 */
async function generate(page: Page) {
  const before = Number(await canvas(page).getAttribute('data-generation'));
  await generateButton(page).click();
  await expect(canvas(page)).toHaveAttribute('data-generation', String(before + 1));
}

async function generateWith(page: Page, text: string) {
  await content(page).fill(text);
  await generate(page);
}

const canvasSize = (page: Page) =>
  canvas(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height]);

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** 先清空剪貼簿，按下複製，等到剪貼簿有新內容 */
async function copyVia(page: Page, button: string) {
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.getByRole('button', { name: button }).click();
  await expect.poll(() => readClipboard(page)).not.toBe('');
  return readClipboard(page);
}

const copyHtml = (page: Page) => copyVia(page, '複製 HTML');
const copyRoll20 = (page: Page) => copyVia(page, '複製 Roll20 格式');

/** HTML 文字裡的每一張紙片 */
function htmlPieces(html: string) {
  const re =
    /<span style="display: inline-block; transform: rotate\((-?\d+)deg\); filter: drop-shadow\(2px 3px 2px rgba\(0, 0, 0, 0\.5\)\); margin: 2px 4px;"><span style="display: inline-block; font-family: ([^;]+); font-size: (\d+)px; background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6}); clip-path: polygon\(([^)]*)\); padding: 6px 12px; font-weight: 900; text-shadow: none; line-height: 1;">([^<]*)<\/span><\/span>/g;
  return [...html.matchAll(re)].map((m) => ({
    rotate: Number(m[1]),
    family: m[2],
    size: Number(m[3]),
    bg: m[4],
    fg: m[5],
    polygon: m[6],
    ch: m[7],
  }));
}

/** Roll20 文字裡的每一張紙片 */
function roll20Pieces(text: string) {
  const re =
    /\[([^\]]*)\]\(#" style="text-decoration: none; display: inline-block; font-family: ([^;]+); font-size: (\d+)px; line-height: 1\.2; background-color: (#[0-9a-f]{6}); color: (#[0-9a-f]{6}); padding: 5px; border-radius: (\d+)px (\d+)px (\d+)px (\d+)px; margin: 2px; font-weight: bold; box-shadow: 2px 3px 5px #333333;"\)/g;
  return [...text.matchAll(re)].map((m) => ({
    ch: m[1],
    family: m[2],
    size: Number(m[3]),
    bg: m[4],
    fg: m[5],
    radii: m.slice(6, 10).map(Number),
  }));
}

/** 簡易 PNG 解碼（8-bit RGBA、不交錯） */
function decodePng(bytes: Buffer) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  const idat: Buffer[] = [];
  while (o < bytes.length) {
    const len = dv.getUint32(o);
    const type = bytes.subarray(o + 4, o + 8).toString('latin1');
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = unzlibSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? px[y * stride + i - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= 4 ? px[(y - 1) * stride + i - 4] : 0;
      let v = x;
      if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + i] = v & 255;
    }
  }
  return { width, height, colorType, bitDepth, px };
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test.describe('開頁與預設值', () => {
  test('載入字型時按鈕停用，載入後自動填入範例信並產生一次（F01、F03）', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    /* 字型的樣式表延遲 1.5 秒：看得到「正在載入字型」 */
    await page.route(/fonts\.(googleapis|gstatic)\.com/, async (r) => {
      await new Promise((res) => setTimeout(res, 1500));
      await r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {});
    });
    await page.goto(URL, { waitUntil: 'commit' });
    const loading = page.getByRole('button', { name: '正在載入字型…' });
    await expect(loading).toBeVisible();
    await expect(loading).toBeDisabled();
    await expect(generateButton(page)).toBeEnabled({ timeout: 20_000 });
    await expect(canvas(page)).toHaveAttribute('data-generation', '1');
    await expect(page.getByText('已產生新的拼貼信', { exact: true })).toBeVisible();
    await expect(content(page)).toHaveValue(/^致調查員們：\n/);
    expect(Number((await piecesText(page).textContent())?.replace(/\D/g, ''))).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });

  test('預設值、空白時的提示、頁尾只有靈感來源', async ({ page }) => {
    const errors = await open(page);
    await expect(num(page, '最小字級')).toHaveValue('45');
    await expect(num(page, '最大字級')).toHaveValue('70');
    await expect(num(page, '圖片寬度')).toHaveValue('800');
    await expect(num(page, '圖片寬度')).toBeEnabled();
    await expect(page.getByRole('checkbox', { name: '以最長一行決定寬度' })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: '置中' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('已勾選 8／8 組')).toBeVisible();
    await expect(page.getByText('已勾選 13／15 套')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '改用 Roll20 的基本字型' })).toBeChecked();
    await expect(num(page, 'Roll20 最小字級')).toHaveValue('16');
    await expect(num(page, 'Roll20 最大字級')).toHaveValue('24');
    expect((await canvasSize(page))[0]).toBe(800);
    await content(page).fill('');
    await expect(content(page)).toHaveAttribute('placeholder', '例：今晚 12 點，舊鐘樓見。');
    await expect(page.locator('footer')).toHaveText('靈感來源：sotsotssi/collage-letter');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://github.com/sotsotssi/collage-letter',
    );
    /* 按鈕的滑鼠提示 */
    await page.getByRole('button', { name: '下載 PNG' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('背景透明');
    await page.mouse.move(5, 5, { steps: 10 });
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByRole('button', { name: '下載 JPG' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('紙張底');
    expect(errors).toEqual([]);
  });
});

test.describe('版面幾何（規格 3.1）', () => {
  test('高度只看最大字級與行數；空行、對調、自動寬度、窄寬度、空白內容', async ({ page }) => {
    const errors = await open(page);
    await generateWith(page, '一二三\n\n四五六');
    await expect(sizeText(page)).toHaveText('800 × 348 px');
    expect(await canvasSize(page)).toEqual([800, 348]);

    await num(page, '最小字級').fill('30');
    await num(page, '最大字級').fill('30');
    await generateWith(page, '一\n\n二');
    await expect(sizeText(page)).toHaveText('800 × 172 px');

    /* 最小大於最大：對調使用，欄位上的數字不變 */
    await num(page, '最小字級').fill('80');
    await num(page, '最大字級').fill('40');
    await generate(page);
    await expect(sizeText(page)).toHaveText('800 × 392 px');
    await expect(num(page, '最小字級')).toHaveValue('80');
    await expect(num(page, '最大字級')).toHaveValue('40');

    /* 空白、0：退回 45～70 */
    await num(page, '最小字級').fill('');
    await num(page, '最大字級').fill('0');
    await generateWith(page, '一');
    await expect(sizeText(page)).toHaveText('800 × 166 px');

    /* 寬 200：每個字各佔一行 */
    await num(page, '圖片寬度').fill('200');
    await generateWith(page, '一二三');
    await expect(sizeText(page)).toHaveText('200 × 348 px');

    /* 寬度限制在 100～4000（主控裁定） */
    await num(page, '圖片寬度').fill('50');
    await generate(page);
    expect((await canvasSize(page))[0]).toBe(100);

    /* 自動寬度：寬度欄停用、只依手動換行分行 */
    await page.getByRole('checkbox', { name: '以最長一行決定寬度' }).click();
    await expect(num(page, '圖片寬度')).toBeDisabled();
    await generateWith(page, '永'.repeat(30));
    const [w, h] = await canvasSize(page);
    expect(h).toBe(166);
    expect(w).toBeGreaterThan(30 * (45 + 20 + 2));
    expect(w).toBeLessThanOrEqual(30 * (70 + 30 + 8) + 80);
    await expect(page.getByText('圖片寬度依最長的一行決定。')).toBeVisible();
    await page.getByRole('checkbox', { name: '以最長一行決定寬度' }).click();
    await num(page, '圖片寬度').fill('800');

    /* 空白內容用提示文字；只有空白字元時沒有紙片 */
    await generateWith(page, '');
    await expect(piecesText(page)).toHaveText('7 張');
    await generateWith(page, '   ');
    await expect(piecesText(page)).toHaveText('0 張');
    await expect(sizeText(page)).toHaveText('800 × 166 px');

    /* 結尾的換行多一個空行；表情符號以字素切字 */
    await generateWith(page, '一\n');
    await expect(sizeText(page)).toHaveText('800 × 257 px');
    await generateWith(page, '🎲👍🏽🇹🇼 é');
    await expect(piecesText(page)).toHaveText('4 張');
    expect(errors).toEqual([]);
  });

  test('改設定不會自動重畫，要按「產生」（F02）；每次產生都是新的排版', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page, `?seed=${SEED}`);
    const before = await canvasSize(page);
    await num(page, '圖片寬度').fill('400');
    await content(page).fill('一');
    await page.waitForTimeout(300);
    expect(await canvasSize(page)).toEqual(before);
    const h1 = await copyHtml(page);
    await generate(page);
    expect((await canvasSize(page))[0]).toBe(400);
    const h2 = await copyHtml(page);
    await generate(page);
    const h3 = await copyHtml(page);
    expect(htmlPieces(h2)).toHaveLength(1);
    expect(h2).not.toBe(h3);
    expect(h1).not.toBe(h2);
    expect(errors).toEqual([]);
  });

  test('?seed= 固定種子：同樣的設定得到同樣的排版', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, `?seed=${SEED}`);
    const a = await copyHtml(page);
    await page.reload();
    await expect(canvas(page)).toHaveAttribute('data-generation', '1');
    const b = await copyHtml(page);
    expect(b).toBe(a);
  });
});

test.describe('配色與字型', () => {
  test('新增、刪除自訂配色；全部未勾選時用第一組（F10～F12）', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await page.getByRole('button', { name: '新增配色' }).click();
    await expect(page.getByText('已新增配色', { exact: true })).toBeVisible();
    await expect(page.getByText('已勾選 9／9 組')).toBeVisible();
    await page.getByRole('button', { name: '新增配色' }).click();
    await expect(page.getByText('已勾選 10／10 組')).toBeVisible();
    await page.getByRole('button', { name: '刪除配色「自訂」' }).first().click();
    await expect(page.getByText('已勾選 9／9 組')).toBeVisible();
    /* 內建的不能刪 */
    await expect(page.getByRole('button', { name: '刪除配色「墨黑」' })).toHaveCount(0);

    /* 只勾自訂（白底黑字）→ 所有紙片都是白底黑字 */
    for (const name of ['墨黑', '報紙白', '灰燼', '鉛灰', '朱紅', '檸檬黃', '桃紅', '湖水青'])
      await page.getByRole('checkbox', { name, exact: true }).click();
    await expect(page.getByText('已勾選 1／9 組')).toBeVisible();
    await generateWith(page, '一二三四五六');
    let pieces = htmlPieces(await copyHtml(page));
    expect(pieces).toHaveLength(6);
    expect(new Set(pieces.map((p) => `${p.bg}/${p.fg}`))).toEqual(new Set(['#ffffff/#000000']));

    /* 全部不勾 → 用清單的第一組（墨黑） */
    await page.getByRole('checkbox', { name: '自訂', exact: true }).click();
    await expect(page.getByText('已勾選 0／9 組')).toBeVisible();
    await generate(page);
    pieces = htmlPieces(await copyHtml(page));
    expect(new Set(pieces.map((p) => `${p.bg}/${p.fg}`))).toEqual(new Set(['#161616/#f4efe4']));
    expect(errors).toEqual([]);
  });

  test('字型：全部未勾選時用系統字型（F15）；加入字型（F14 裁定：FontPicker）', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    const list = page.getByRole('list', { name: '字型清單' });
    await expect(list.getByRole('checkbox')).toHaveCount(15);
    /* 名稱用字型本身顯示（繁中、韓文、日文、英文都有） */
    await expect(list.getByText('思源黑體（特粗）')).toBeVisible();
    await expect(list.getByText('Black Han Sans')).toBeVisible();

    await generateWith(page, '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸');
    let pieces = htmlPieces(await copyHtml(page));
    expect(pieces.length).toBe(20);
    expect(pieces.some((p) => p.family !== 'sans-serif')).toBe(true);

    const boxes = await list.getByRole('checkbox').all();
    for (const box of boxes)
      if ((await box.getAttribute('aria-checked')) === 'true') await box.click();
    await expect(page.getByText('已勾選 0／15 套')).toBeVisible();
    await generate(page);
    pieces = htmlPieces(await copyHtml(page));
    expect(new Set(pieces.map((p) => p.family))).toEqual(new Set(['sans-serif']));

    /* 加入字型：FontPicker 預設的思源黑體 400（清單裡的是 900，不重複） */
    await page.getByRole('button', { name: '加入字型' }).click();
    await expect(page.getByText('已加入字型', { exact: true })).toBeVisible();
    await expect(page.getByText('已勾選 1／16 套')).toBeVisible();
    await page.getByRole('button', { name: '加入字型' }).click();
    await expect(page.getByText('這套字型已經在清單裡', { exact: true })).toBeVisible();
    await expect(page.getByText('已勾選 1／16 套')).toBeVisible();
    await generate(page);
    pieces = htmlPieces(await copyHtml(page));
    expect(new Set(pieces.map((p) => p.family))).toEqual(new Set(["'Noto Sans TC', sans-serif"]));
    expect(errors).toEqual([]);
  });
});

test.describe('複製成文字', () => {
  test('HTML：結構與數值、跳脫、空白與換行；對齊取複製當下的值（F34）', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await generateWith(page, '今晚 <見>\n\n&');
    const html = await copyHtml(page);
    await expect(page.getByText('已複製 HTML', { exact: true })).toBeVisible();
    expect(
      html.startsWith(
        '<div style="text-align: center; line-height: 2.5; padding: 20px; background: #2a2a2a; border-radius: 10px;">\n',
      ),
    ).toBe(true);
    expect(html.endsWith('<br>\n\n</div>')).toBe(true);
    expect(html.match(/<br>\n/g)).toHaveLength(3);
    expect(html.match(/&nbsp;&nbsp;/g)).toHaveLength(1);
    const pieces = htmlPieces(html);
    expect(pieces.map((p) => p.ch)).toEqual(['今', '晚', '&lt;', '見', '&gt;', '&amp;']);
    for (const p of pieces) {
      expect(Number.isInteger(p.rotate)).toBe(true);
      expect(Math.abs(p.rotate)).toBeLessThanOrEqual(18);
      expect(p.size).toBeGreaterThanOrEqual(Math.round(45 * 0.55));
      expect(p.size).toBeLessThanOrEqual(Math.round(70 * 0.55));
      const pts = p.polygon.split(', ').map((pt) => pt.split(' ').map((v) => Number.parseFloat(v)));
      expect(pts).toHaveLength(4);
      expect(p.polygon).toMatch(/^(\d+\.\d% \d+\.\d%, ){3}\d+\.\d% \d+\.\d%$/);
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = pts;
      for (const v of [x0, y0, y1, x3]) expect(v).toBeLessThanOrEqual(10);
      for (const v of [x1, x2, y2, y3]) expect(v).toBeGreaterThanOrEqual(90);
    }
    /* 改對齊、不重新產生：只有容器的對齊改變 */
    await page.getByRole('radio', { name: '靠右' }).click();
    const right = await copyHtml(page);
    expect(right).toBe(html.replace('text-align: center;', 'text-align: right;'));
    expect(errors).toEqual([]);
  });

  test('Roll20：基本字型每次複製重新挑、字級換算、圓角、跳脫；Roll20 範圍不對調（F35～F37）', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await generateWith(page, '[今晚] 見\n"走"');
    const text = await copyRoll20(page);
    await expect(page.getByText('已複製 Roll20 格式文字', { exact: true })).toBeVisible();
    const pieces = roll20Pieces(text);
    expect(pieces.map((p) => p.ch)).toEqual(['［', '今', '晚', '］', '見', '＂', '走', '＂']);
    expect(text.split('\n')).toHaveLength(3);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain(')  [');
    for (const p of pieces) {
      expect(['Batang, sans-serif', 'Dotum, sans-serif', 'Gungsuh, sans-serif']).toContain(
        p.family,
      );
      expect(p.size).toBeGreaterThanOrEqual(16);
      expect(p.size).toBeLessThanOrEqual(24);
      for (const r of p.radii) {
        expect(r).toBeGreaterThanOrEqual(2);
        expect(r).toBeLessThanOrEqual(12);
      }
    }
    /* 與 HTML 同一份排版：底色、字色一致 */
    const html = htmlPieces(await copyHtml(page));
    expect(html.map((p) => p.bg)).toEqual(pieces.map((p) => p.bg));
    expect(html.map((p) => p.fg)).toEqual(pieces.map((p) => p.fg));

    /* 再複製一次：除了基本字型，其他都不變 */
    const again = roll20Pieces(await copyRoll20(page));
    expect(again.map(({ family: _f, ...rest }) => rest)).toEqual(
      pieces.map(({ family: _f, ...rest }) => rest),
    );

    /* 關掉基本字型：用紙片原本的字型 */
    await page.getByRole('checkbox', { name: '改用 Roll20 的基本字型' }).click();
    const own = roll20Pieces(await copyRoll20(page));
    for (const p of own) expect(p.family).not.toMatch(/^(Batang|Dotum|Gungsuh),/);
    expect(own.every((p) => /, sans-serif$/.test(p.family))).toBe(true);

    /* Roll20 字級 30～10：不對調，大字反而變小 */
    await num(page, 'Roll20 最小字級').fill('30');
    await num(page, 'Roll20 最大字級').fill('10');
    const swapped = roll20Pieces(await copyRoll20(page));
    for (const p of swapped) {
      expect(p.size).toBeGreaterThanOrEqual(10);
      expect(p.size).toBeLessThanOrEqual(30);
    }
    const order = (xs: { size: number }[]) => xs.map((p) => p.size);
    const big = order(own).indexOf(Math.max(...order(own)));
    const small = order(own).indexOf(Math.min(...order(own)));
    if (own[big].size !== own[small].size)
      expect(swapped[big].size).toBeLessThanOrEqual(swapped[small].size);
    expect(errors).toEqual([]);
  });

  test('剪貼簿寫不進去時提示複製沒有成功（F40）', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      document.execCommand = () => false;
    });
    const errors = await open(page);
    await page.getByRole('button', { name: '複製 HTML' }).click();
    await expect(page.getByText('複製文字沒有成功', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '複製圖片' }).click();
    await expect(page.getByText('無法把圖片放進剪貼簿', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('下載與複製圖片', () => {
  test('PNG：與預覽同尺寸、透明背景、與畫面逐像素相同；檔名 calling_card_＋時間（F32、F42）', async ({
    page,
  }) => {
    const errors = await open(page, `?seed=${SEED}`);
    const [w, h] = await canvasSize(page);
    const t0 = Date.now();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下載 PNG' }).click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/^calling_card_\d{13}\.png$/);
    const stamp = Number(name.slice(13, 26));
    expect(stamp).toBeGreaterThanOrEqual(t0 - 1000);
    expect(stamp).toBeLessThanOrEqual(Date.now() + 1000);
    const png = decodePng(readFileSync(await download.path()));
    expect([png.width, png.height, png.bitDepth, png.colorType]).toEqual([w, h, 8, 6]);
    /* 左上角是透明的、有不透明的紙片、有半透明的投影 */
    expect(png.px[3]).toBe(0);
    let opaque = 0;
    let partial = 0;
    for (let i = 3; i < png.px.length; i += 4) {
      if (png.px[i] === 255) opaque++;
      else if (png.px[i] > 0) partial++;
    }
    expect(opaque).toBeGreaterThan(1000);
    expect(partial).toBeGreaterThan(100);
    const screen = await canvas(page).evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] === 255) n++;
      return n;
    });
    expect(opaque).toBe(screen);
    expect(errors).toEqual([]);
  });

  test('JPG：紙張底色、斑點、與預覽同尺寸；下載後預覽仍是透明（F33）', async ({ page }) => {
    const errors = await open(page, `?seed=${SEED}`);
    const [w, h] = await canvasSize(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下載 JPG' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^calling_card_\d{13}\.jpg$/);
    const bytes = readFileSync(await download.path());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    const stats = await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      /* 左邊 24 px 寬的直條（留白區，只有紙張） */
      const d = ctx.getImageData(0, 0, 24, bmp.height).data;
      const sum = [0, 0, 0];
      let alpha = 255;
      const gray: number[] = [];
      for (let i = 0; i < d.length; i += 4) {
        sum[0] += d[i];
        sum[1] += d[i + 1];
        sum[2] += d[i + 2];
        alpha = Math.min(alpha, d[i + 3]);
        gray.push((d[i] + d[i + 1] + d[i + 2]) / 3);
      }
      const n = d.length / 4;
      const median = [...gray].sort((x, y) => x - y)[Math.floor(n / 2)];
      /* 斑點：比紙張暗 4 以上的像素 */
      const dark = gray.filter((v) => v <= median - 4).length / n;
      return { w: bmp.width, h: bmp.height, avg: sum.map((v) => v / n), alpha, dark };
    }, bytes.toString('base64'));
    expect([stats.w, stats.h]).toEqual([w, h]);
    expect(stats.alpha).toBe(255);
    const [r, g, b] = stats.avg;
    expect(Math.abs(r - 244)).toBeLessThanOrEqual(3);
    expect(Math.abs(g - 235)).toBeLessThanOrEqual(3);
    expect(Math.abs(b - 216)).toBeLessThanOrEqual(3);
    /* 斑點約佔 寬 × 高 ÷ 150 個 × 平均 4.7 px² ≈ 3%（JPG 壓縮會抹掉一些） */
    expect(stats.dark).toBeGreaterThan(0.015);
    expect(stats.dark).toBeLessThan(0.045);
    /* 預覽仍是透明的 */
    const cornerAlpha = await canvas(page).evaluate(
      (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, 1, 1).data[3],
    );
    expect(cornerAlpha).toBe(0);
    expect(errors).toEqual([]);
  });

  test('複製圖片：PNG 放進剪貼簿（F38）', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await page.getByRole('button', { name: '複製圖片' }).click();
    await expect(page.getByText('已把圖片複製到剪貼簿', { exact: true })).toBeVisible();
    const info = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const blob = await items[0].getType('image/png');
      const bmp = await createImageBitmap(blob);
      return { types: items[0].types, w: bmp.width, h: bmp.height };
    });
    expect(info.types).toContain('image/png');
    expect([info.w, info.h]).toEqual(await canvasSize(page));
    expect(errors).toEqual([]);
  });
});

test.describe('提示訊息與狀態', () => {
  test('提示約 3 秒；連續觸發時後一則不會被前一則提早收掉（F39 修正）', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    const first = page.getByText('已產生新的拼貼信', { exact: true });
    await expect(first).toBeHidden({ timeout: 6000 });
    await generateButton(page).click();
    await page.mouse.move(0, 0);
    await expect(first).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '複製 HTML' }).click();
    await page.mouse.move(0, 0);
    const second = page.getByText('已複製 HTML', { exact: true });
    await expect(second).toBeVisible();
    /* 第一則在約 3 秒時收起，第二則還在 */
    await expect(first).toBeHidden({ timeout: 2500 });
    await expect(second).toBeVisible();
    await page.waitForTimeout(500);
    await expect(second).toBeVisible();
    await expect(second).toBeHidden({ timeout: 2500 });
    expect(errors).toEqual([]);
  });

  test('不保留狀態：重新整理後回到預設，自訂配色消失並重新產生（F44）', async ({ page }) => {
    const errors = await open(page);
    await content(page).fill('只是測試');
    await num(page, '圖片寬度').fill('500');
    await page.getByRole('radio', { name: '靠左' }).click();
    await page.getByRole('button', { name: '新增配色' }).click();
    await expect(page.getByText('已勾選 9／9 組')).toBeVisible();
    await page.reload();
    await expect(canvas(page)).toHaveAttribute('data-generation', '1', { timeout: 20_000 });
    await expect(content(page)).toHaveValue(/^致調查員們：/);
    await expect(num(page, '圖片寬度')).toHaveValue('800');
    await expect(page.getByRole('radio', { name: '置中' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('已勾選 8／8 組')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  async function settle(page: Page) {
    await expect(page.getByText('已產生新的拼貼信', { exact: true })).toBeHidden({
      timeout: 6000,
    });
    await page.mouse.move(0, 0);
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page, `?seed=${SEED}`);
    await settle(page);
    await expect(page).toHaveScreenshot('collage-letter-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, `?seed=${SEED}`);
    await settle(page);
    await expect(page).toHaveScreenshot('collage-letter-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    /* 自動寬度的很寬圖片也不會撐出橫向捲動 */
    await page.getByRole('checkbox', { name: '以最長一行決定寬度' }).click();
    await generateWith(page, '永'.repeat(40));
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
