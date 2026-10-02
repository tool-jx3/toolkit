/**
 * 前景框產生器（建置產物 next/foreground-frame/）的端對端測試：
 * - 開頁沒有 pageerror／console error；預設值、格數提示、窗的資訊；頁尾只有靈感來源；
 * - 輸出的像素（規格 3.2～3.6、3.8、3.9 的量測值）：四角形狀、外側圓角、窗與畫面的邊線（含雙線）、陰影、
 *   線性／放射漸層、不透明度、顆粒、換尺寸等比例、角飾範圍、差分標籤尺寸、覆蓋色、窗內效果、決定性；
 * - 操作：自訂尺寸（限制後回填）、邊距快速設定、四邊／四角共用、套用範本與復原／重做（按鈕、快捷鍵）、
 *   沿框裝飾（新增、排序、重新產生、複製、刪除）、圖片（選檔、自動擺放、拖放、解碼失敗）、文字圖層、
 *   預覽上的點選／拖曳／Shift／方向鍵／Delete、差分（切換列、縮圖、種類、至少一個、新增、顏色）、字型上傳；
 * - 匯出：PNG（尺寸、透明的窗、檔名、與畫面相同的內容）、ZIP（跳號的檔名、每張 PNG）；
 * - 自動存檔與還原、設定分頁、專案檔（JSON 與帶圖片的 ZIP）、全部重來；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { unzipFiles } from '../../src/core/files';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('foreground-frame') ?? { id: 'foreground-frame', status: 'next' })}/`;
const FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf';

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
  await expect(page.getByRole('heading', { level: 1, name: '前景框產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __foregroundFrame?: unknown }).__foregroundFrame,
  );
  return errors;
}

/** 在頁面裡呼叫測試入口：fn 的第一個參數是 window.__foregroundFrame */
const hook = <T>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) => {
      // biome-ignore lint/suspicious/noExplicitAny: 測試入口
      const h = (window as any).__foregroundFrame;
      return new Function('h', 'arg', `return (${f})(h, arg)`)(h, a);
    },
    [fn, arg] as const,
  ) as Promise<T>;

// biome-ignore lint/suspicious/noExplicitAny: 設定物件
type AnyState = any;
const getState = (page: Page) => hook<AnyState>(page, '(h) => h.state()');

/** 「乾淨」的設定：單色黑、沒有線條與陰影 */
const PLAIN = `(s) => { s.frame.fill = 'solid'; s.frame.innerLine.on = false; s.frame.shadow.on = false; s.palette.frame1 = '#000000'; }`;

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const status = (page: Page) => page.getByTestId('status');

async function pickOption(page: Page, combobox: string, option: string) {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function setNumber(page: Page, label: string, value: number) {
  const box = page.getByRole('spinbutton', { name: label });
  await box.fill(String(value));
  await box.press('Enter');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

function decode(bytes: Uint8Array) {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const parts = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const z = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    z.set(p, o);
    o += p.length;
  }
  return { ...ihdr, px: decodePixels(z, ihdr.width, ihdr.height, ihdr.colorType) };
}

async function download(page: Page, testId: string) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
  const path = await dl.path();
  if (!path) throw new Error('下載失敗');
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

const at = (png: { px: Uint8Array; width: number }, x: number, y: number) => {
  const k = (y * png.width + x) * 4;
  return [png.px[k], png.px[k + 1], png.px[k + 2], png.px[k + 3]];
};

async function testPng(
  w: number,
  h: number,
  rgba: [number, number, number, number],
): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set(rgba, i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

/** 用 DataTransfer 把檔案拖放到頁面（WindowDrop） */
async function dropFiles(page: Page, files: { name: string; type: string; b64: string }[]) {
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, files);
}

/** 預覽上的單位座標 → 螢幕座標 */
async function screenPoint(page: Page, x: number, y: number) {
  const b = await page.getByTestId('preview-canvas').boundingBox();
  if (!b) throw new Error('找不到預覽');
  const k = b.height / 1080;
  return { x: b.x + x * k, y: b.y + y * k };
}

const hits = async (page: Page) =>
  JSON.parse((await page.getByTestId('preview-canvas').getAttribute('data-hits')) ?? '[]') as {
    id: string;
    cx: number;
    cy: number;
    w: number;
    h: number;
  }[];

test.describe('開頁與預設值', () => {
  test('沒有錯誤；格數提示、窗的資訊、狀態列；頁尾只有靈感來源', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByTestId('grid-hint')).toHaveText(
      '在 CCFOLIA 設定前景時，寬填 48 格、高填 27 格（1 格＝24 px）。',
    );
    await expect(page.getByTestId('window-info')).toHaveText(
      '窗 1848 × 1008 px，相當於盤面的寬 46.2 × 高 25.2 格，左上角在第 0.9, 0.9 格的位置。',
    );
    await expect(status(page)).toHaveText('準備完成。先在「框」分頁挑範本或調整窗的形狀。');
    const footer = page.locator('footer');
    await expect(footer).toContainText('靈感來源');
    await expect(footer.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/shiki365/foreground-frame-maker',
    );
    await expect(footer.getByRole('link')).toHaveCount(1);
    for (const name of ['框', '裝飾', '圖層', '差分', '專案'])
      await expect(tab(page, name)).toBeVisible();
    await expect(page.getByRole('combobox', { name: '範本' })).toContainText('簡約');
    await expect(page.getByRole('combobox', { name: '尺寸' })).toContainText('1920 × 1080');
    expect(errors).toEqual([]);
  });
});

test.describe('輸出的像素（規格 3.2～3.6）', () => {
  test('四角形狀、外側圓角（3.2）', async ({ page }) => {
    await open(page);
    const res = await page.evaluate(async (plain) => {
      // biome-ignore lint/suspicious/noExplicitAny: 測試入口
      const h = (window as any).__foregroundFrame;
      const base = h.state();
      const plainFn = new Function(`return (${plain})`)();
      const alpha = (img: ImageData, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];
      const out: Record<string, number | number[]> = {};
      for (const type of ['square', 'round', 'chamfer', 'scoop', 'notch']) {
        const s = JSON.parse(JSON.stringify(base));
        plainFn(s);
        s.opening.margin = { t: 200, r: 200, b: 200, l: 200 };
        s.opening.corners = [0, 1, 2, 3].map(() => ({ type, size: 120 }));
        h.replace(s);
        const img = h.render(null);
        let d = 0;
        while (d < 300 && alpha(img, 200 + d, 200 + d) > 127) d++;
        out[type] = d;
      }
      const s = JSON.parse(JSON.stringify(base));
      plainFn(s);
      s.opening.outerRadius = 100;
      h.replace(s);
      const img = h.render(null);
      let x = 0;
      while (alpha(img, x, 0) < 128) x++;
      let d = 0;
      while (alpha(img, d, d) < 128) d++;
      out.outer = [x, d];
      return out;
    }, PLAIN);
    expect(res).toEqual({
      square: 0,
      round: 35,
      chamfer: 60,
      scoop: 85,
      notch: 120,
      outer: [90, 29],
    });
  });

  test('窗的邊線、雙線、畫面的邊線（3.4）；1280 × 720 等比例（F06）', async ({ page }) => {
    await open(page);
    /* 回傳一列中有顏色（不透明且接近強調色）的 x */
    const lineXs = (src: string, y = 540, size?: [number, number]) =>
      hook<number[]>(
        page,
        `(h) => {
          const s = h.defaults(); (${PLAIN})(s); s.frame.fill = 'none'; s.palette.accent = '#ff0000'; (${src})(s); h.replace(s);
          const img = h.render(null${size ? `, ${size[0]}, ${size[1]}` : ''});
          const xs = [];
          for (let x = 0; x < 200; x++) { const k = (${y} * img.width + x) * 4; if (img.data[k + 3] > 127) xs.push(x); }
          return xs;
        }`,
      );
    expect(
      await lineXs(
        `(s) => { s.frame.innerLine = { on: true, width: 3, gap: 10, double: false, color: 'accent' }; }`,
      ),
    ).toEqual([23, 24, 25]);
    expect(
      await lineXs(
        `(s) => { s.opening.margin = { t: 100, r: 100, b: 100, l: 100 }; s.frame.innerLine = { on: true, width: 4, gap: 10, double: true, color: 'accent' }; }`,
      ),
    ).toEqual([76, 77, 78, 79, 86, 87, 88, 89]);
    expect(
      await lineXs(
        `(s) => { s.opening.margin = { t: 100, r: 100, b: 100, l: 100 }; s.frame.innerLine = { on: true, width: 1, gap: 0, double: true, color: 'accent' }; }`,
      ),
    ).toEqual([95, 99]);
    expect(
      await lineXs(
        `(s) => { s.opening.margin = { t: 100, r: 100, b: 100, l: 100 }; s.frame.outerLine = { on: true, width: 6, gap: 12, double: false, color: 'accent' }; }`,
      ),
    ).toEqual([12, 13, 14, 15, 16, 17]);
    /* 1280 × 720：邊距 36 單位＝24 px，線在 15～16 px */
    const small = await lineXs(
      `(s) => { s.size = { w: 1280, h: 720 }; s.frame.innerLine = { on: true, width: 3, gap: 10, double: false, color: 'accent' }; }`,
      360,
      [1280, 720],
    );
    expect(small[0]).toBeGreaterThanOrEqual(15);
    expect(small[small.length - 1]).toBeLessThanOrEqual(17);
    /* 線條只在框上：窗內沒有 */
    expect(
      (
        await lineXs(
          `(s) => { s.frame.innerLine = { on: true, width: 24, gap: 0, double: false, color: 'accent' }; }`,
        )
      ).every((x) => x < 36),
    ).toBe(true);
  });

  test('窗的陰影：模糊 80、濃度 100%、紅色每 5 單位 126、114、101、89、77…；預設約 17%（3.5）', async ({
    page,
  }) => {
    await open(page);
    const read = (shadow: string) =>
      hook<number[]>(
        page,
        `(h) => {
          const s = h.defaults(); (${PLAIN})(s); s.frame.fill = 'none'; s.frame.shadow = ${shadow}; h.replace(s);
          const img = h.render(null); const a = [];
          for (let d = 0; d <= 100; d += 5) a.push(img.data[(540 * img.width + 36 + d) * 4 + 3]);
          return a;
        }`,
      );
    const strong = await read(`{ on: true, size: 80, opacity: 1, color: '#ff0000' }`);
    expect(strong.slice(0, 5).map((v, i) => Math.abs(v - [126, 114, 101, 89, 77][i]) <= 3)).toEqual(
      [true, true, true, true, true],
    );
    expect(strong[19]).toBeLessThanOrEqual(2);
    const def = await read(`{ on: true, size: 28, opacity: 0.35, color: '#000000' }`);
    expect(Math.abs(def[0] - 43)).toBeLessThanOrEqual(3);
    expect(def[7]).toBeLessThanOrEqual(1);
  });

  test('填色：線性漸層的方向、放射漸層、不透明度、顆粒（3.3）', async ({ page }) => {
    await open(page);
    const sample = (src: string, points: [number, number][]) =>
      hook<number[][]>(
        page,
        `(h) => {
          const s = h.defaults(); (${PLAIN})(s); s.palette.frame1 = '#ff0000'; s.palette.frame2 = '#0000ff';
          s.opening.margin = { t: 500, r: 900, b: 500, l: 900 }; (${src})(s); h.replace(s);
          const img = h.render(null);
          return ${JSON.stringify(points)}.map(([x, y]) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)));
        }`,
      );
    const near = (a: number[], b: number[], tol = 4) =>
      a.every((v, i) => Math.abs(v - b[i]) <= tol);
    const RED = [255, 0, 0, 255];
    const BLUE = [0, 0, 255, 255];
    let [p, q] = await sample(`(s) => { s.frame.fill = 'linear'; s.frame.angle = 180; }`, [
      [960, 0],
      [960, 1079],
    ]);
    expect(near(p, RED) && near(q, BLUE)).toBe(true);
    [p, q] = await sample(`(s) => { s.frame.fill = 'linear'; s.frame.angle = 0; }`, [
      [960, 0],
      [960, 1079],
    ]);
    expect(near(p, BLUE) && near(q, RED)).toBe(true);
    [p, q] = await sample(`(s) => { s.frame.fill = 'linear'; s.frame.angle = 90; }`, [
      [0, 540],
      [1919, 540],
    ]);
    expect(near(p, RED) && near(q, BLUE)).toBe(true);
    [p, q] = await sample(`(s) => { s.frame.fill = 'linear'; s.frame.angle = 45; }`, [
      [0, 1079],
      [1919, 0],
    ]);
    expect(near(p, RED, 6) && near(q, BLUE, 6)).toBe(true);
    /* 放射：黑 → 白；距中心 385 單位仍是黑、959 約 80% 白 */
    const [c385, c959] = await sample(
      `(s) => { s.frame.fill = 'radial'; s.palette.frame1 = '#000000'; s.palette.frame2 = '#ffffff'; s.opening.margin = { t: 540, r: 960, b: 540, l: 960 }; }`,
      [
        [960 - 385, 540],
        [1, 540],
      ],
    );
    expect(c385[0]).toBeLessThanOrEqual(3);
    expect(Math.abs(c959[0] - 204)).toBeLessThanOrEqual(12);
    /* 不透明度 50% → alpha 128 */
    const [half] = await sample(`(s) => { s.frame.opacity = 0.5; }`, [[10, 10]]);
    expect(Math.abs(half[3] - 128)).toBeLessThanOrEqual(1);
    /* 顆粒（填色 #808080）：30% 標準差約 12、100% 約 40 */
    const grain = (g: number) =>
      hook<{ mean: number; sd: number }>(
        page,
        `(h) => {
          const s = h.defaults(); (${PLAIN})(s); s.palette.frame1 = '#808080'; s.frame.grain = ${g};
          s.opening.margin = { t: 300, r: 300, b: 300, l: 300 }; h.replace(s);
          const img = h.render(null); let n = 0, sum = 0, sq = 0;
          for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = img.data[(y * img.width + x) * 4]; n++; sum += v; sq += v * v; }
          const mean = sum / n; return { mean, sd: Math.sqrt(sq / n - mean * mean) };
        }`,
      );
    const g30 = await grain(0.3);
    const g100 = await grain(1);
    expect(Math.abs(g30.mean - 128)).toBeLessThanOrEqual(3);
    expect(Math.abs(g30.sd - 12)).toBeLessThanOrEqual(3);
    expect(Math.abs(g100.sd - 40)).toBeLessThanOrEqual(5);
  });

  test('角飾的範圍（3.6）與差分標籤的尺寸（3.9）', async ({ page }) => {
    await open(page);
    const box = (type: string) =>
      hook<number[]>(
        page,
        `(h) => {
          const s = h.defaults(); (${PLAIN})(s); s.frame.fill = 'none'; s.opening.margin = { t: 300, r: 300, b: 300, l: 300 };
          s.frame.ornament = { type: '${type}', size: 100, gap: 20, width: 6, color: '#ff0000' }; h.replace(s);
          const img = h.render(null); let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
          for (let y = 0; y < 540; y++) for (let x = 0; x < 700; x++) if (img.data[(y * img.width + x) * 4 + 3] > 127) {
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
          const k = (290 * img.width + 290) * 4;
          return [x0, x1, y0, y1, img.data[k], img.data[k + 1], img.data[k + 2]];
        }`,
      );
    const spec: Record<string, [number, number]> = {
      bracket: [277, 382],
      diamond: [192, 367],
      star: [238, 346],
      flourish: [264, 376],
      dots: [266, 375],
    };
    for (const [type, [lo, hi]] of Object.entries(spec)) {
      const [x0, x1, y0, y1] = await box(type);
      expect(Math.abs(x0 - lo), `${type} 左緣 ${x0}`).toBeLessThanOrEqual(type === 'star' ? 8 : 3);
      expect(Math.abs(x1 - hi), `${type} 右緣 ${x1}`).toBeLessThanOrEqual(type === 'star' ? 4 : 3);
      expect([y0, y1]).toEqual([x0, x1]);
    }
    /* 標籤：徽章左上 (30, 30)，高 76；純文字款（有底板）高約 103；軌道 224 × 184 */
    const label = (style: string) =>
      hook<{ cx: number; cy: number; w: number; h: number }>(
        page,
        `(h) => { const s = h.defaults(); s.variants.enabled = true; s.variants.label.style = '${style}'; s.variants.label.pos = 'tl'; h.replace(s);
          return h.render('morning').hits.find((x) => x.id === 'indicator'); }`,
      );
    const badge = await label('badge');
    expect(badge.cx - badge.w / 2).toBeCloseTo(30, 5);
    expect(badge.cy - badge.h / 2).toBeCloseTo(30, 5);
    expect(badge.h).toBe(76);
    expect(badge.w).toBeGreaterThan(140);
    expect(badge.w).toBeLessThan(240);
    const plate = await label('label');
    expect(plate.h).toBeCloseTo(102.5, 5);
    const dial = await label('dial');
    expect([dial.w, dial.h]).toEqual([224, 184]);
    const tabs = await label('tabs');
    expect(tabs.h).toBe(56);
  });
});

test.describe('差分的窗處理（3.8）', () => {
  test('覆蓋色、窗內效果、決定性、關閉差分時不畫', async ({ page }) => {
    await open(page);
    const res = await hook<Record<string, unknown>>(
      page,
      `(h) => {
        const base = h.defaults();
        const out = {};
        const mk = (fx, amt, tint) => { const s = JSON.parse(JSON.stringify(base)); s.frame.shadow.on = false; s.variants.enabled = true; s.variants.label.style = 'none';
          Object.assign(s.variants.items[1], { effect: fx, effectAmount: amt, tint: '#ffffff', tintAlpha: tint }); return s; };
        const mean = (img) => { let a = 0, n = 0; for (let y = 40; y < 1040; y += 2) for (let x = 40; x < 1880; x += 2) { a += img.data[(y * img.width + x) * 4 + 3]; n++; } return a / n / 255; };
        h.replace(mk('none', 0.5, 0.7)); out.tint = h.render('day').data[(540 * 1920 + 960) * 4 + 3];
        for (const fx of ['vignette', 'fog', 'sepia', 'storm', 'alert', 'glitch', 'rain', 'snow', 'petals', 'leaves', 'sparkle', 'dust', 'scanlines']) {
          h.replace(mk(fx, 0.2, 0.06)); const lo = mean(h.render('day'));
          h.replace(mk(fx, 1, 0.06)); const hi = mean(h.render('day'));
          out[fx] = [lo, hi];
        }
        h.replace(mk('scanlines', 1, 0)); const sc = h.render('day');
        out.scan = [36, 37, 38, 39, 40, 41, 42].map((y) => sc.data[(y * 1920 + 960) * 4 + 3]);
        h.replace(mk('sepia', 1, 0)); out.sepiaCenter = Array.from(h.render('day').data.slice((540 * 1920 + 960) * 4, (540 * 1920 + 960) * 4 + 4));
        h.replace(mk('rain', 0.6, 0)); const a = h.render('day').data; const b = h.render('day').data;
        let same = a.length === b.length; for (let i = 0; i < a.length && same; i++) if (a[i] !== b[i]) same = false; out.same = same;
        const s2 = mk('rain', 0.6, 0); s2.variants.items[3].effect = 'rain'; s2.variants.items[3].effectAmount = 0.6; s2.variants.items[3].tintAlpha = 0; h.replace(s2);
        const n1 = h.render('night').data; let diff = 0; for (let i = 3; i < a.length; i += 4000) if (a[i] !== n1[i]) diff++; out.otherVariantDiffers = diff > 0;
        const off = mk('rain', 0.6, 0.5); off.variants.enabled = false; h.replace(off);
        out.offCenter = h.render('day').data[(540 * 1920 + 960) * 4 + 3];
        return out;
      }`,
    );
    expect(Math.abs((res.tint as number) - 179)).toBeLessThanOrEqual(1);
    for (const fx of [
      'vignette',
      'fog',
      'sepia',
      'storm',
      'alert',
      'glitch',
      'rain',
      'snow',
      'petals',
      'leaves',
      'sparkle',
      'dust',
      'scanlines',
    ]) {
      const [lo, hi] = res[fx] as [number, number];
      expect(hi, `${fx} 強度越高越明顯`).toBeGreaterThan(lo);
      expect(lo).toBeGreaterThan(0.055);
    }
    /* 量測值的範圍（規格 3.8 的表，容許 ±0.07） */
    const ranges: Record<string, [number, number]> = {
      storm: [0.09, 0.22],
      fog: [0.19, 0.5],
      vignette: [0.1, 0.28],
      alert: [0.09, 0.25],
      glitch: [0.13, 0.27],
      sepia: [0.25, 0.51],
    };
    for (const [fx, [lo, hi]] of Object.entries(ranges)) {
      const [a, b] = res[fx] as [number, number];
      expect(Math.abs(a - lo), `${fx} 20%`).toBeLessThanOrEqual(0.07);
      expect(Math.abs(b - hi), `${fx} 100%`).toBeLessThanOrEqual(0.11);
    }
    /* 掃描線：每 6 單位一條高 2 的黑線，不透明度 10%＋28% × 強度 */
    expect(res.scan).toEqual([97, 97, 0, 0, 0, 0, 97]);
    /* 懷舊褐色：窗中央只有褐色（14%＋30% × 強度） */
    const sep = res.sepiaCenter as number[];
    expect(sep.map((v, i) => Math.abs(v - [118, 82, 40, 112][i]) <= 1)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(res.same).toBe(true);
    expect(res.otherVariantDiffers).toBe(true);
    expect(res.offCenter).toBe(0);
  });

  test('各差分是否顯示（F45）：沒勾的差分不畫；關閉差分時一律顯示', async ({ page }) => {
    await open(page);
    const res = await hook<number[]>(
      page,
      `(h) => {
        const s = h.defaults(); s.frame.shadow.on = false; s.variants.label.style = 'none';
        s.layers = [{ kind: 'text', text: '■', x: 0.5, y: 0.5, size: 200, color: '#ff0000', hideIn: { day: true } }];
        s.variants.enabled = true; h.replace(s);
        const a = (id) => h.render(id).data[(540 * 1920 + 960) * 4 + 3];
        const r = [a('morning'), a('day')];
        const t = h.state(); t.variants.enabled = false; h.replace(t); r.push(a(null));
        return r;
      }`,
    );
    expect(res[0]).toBeGreaterThan(200);
    expect(res[1]).toBe(0);
    expect(res[2]).toBeGreaterThan(200);
  });
});

test.describe('框的操作', () => {
  test('自訂尺寸：Enter 才套用、限制在 64～4096 並回填；格數提示', async ({ page }) => {
    await open(page);
    await pickOption(page, '尺寸', '自訂');
    await setNumber(page, '寬', 30);
    await expect(page.getByRole('spinbutton', { name: '寬' })).toHaveValue('64');
    await setNumber(page, '高', 5000);
    await expect(page.getByRole('spinbutton', { name: '高' })).toHaveValue('4096');
    expect((await getState(page)).size).toEqual({ w: 64, h: 4096 });
    await expect(page.getByTestId('grid-hint')).toContainText('寬填 1 格、高填 64 格');
    await setNumber(page, '寬', 1001);
    await setNumber(page, '高', 700);
    await expect(page.getByTestId('grid-hint')).toContainText('寬填 48 格、高填 34 格');
    await expect(page.getByTestId('grid-hint')).toContainText('接近值');
    await pickOption(page, '尺寸', '1440 × 1080（4:3）');
    await expect(page.getByTestId('window-info')).toContainText('窗 1368 × 1008 px');
  });

  test('邊距快速設定、四邊共用、四角共用（F08～F12）', async ({ page }) => {
    await open(page);
    await btn(page, '上下帶狀').click();
    let s = await getState(page);
    expect([s.opening.margin, s.opening.linkMargin]).toEqual([
      { t: 120, r: 0, b: 120, l: 0 },
      false,
    ]);
    for (const name of ['上邊距', '下邊距', '左邊距', '右邊距'])
      await expect(page.getByRole('spinbutton', { name })).toBeVisible();
    await setNumber(page, '上邊距', 77);
    await page.getByRole('switch', { name: '四邊共用' }).click();
    s = await getState(page);
    expect(s.opening.margin).toEqual({ t: 77, r: 77, b: 77, l: 77 });
    await btn(page, '細').click();
    expect((await getState(page)).opening.linkMargin).toBe(true);
    await expect(page.getByRole('spinbutton', { name: '框的粗細' })).toHaveValue('20');
    /* 四角：切成個別時四角都先複製成共用的設定 */
    await setNumber(page, '四角的大小', 50);
    await page.getByRole('switch', { name: '四角共用' }).click();
    for (const n of ['左上角', '右上角', '右下角', '左下角'])
      await expect(page.getByRole('spinbutton', { name: `${n}的大小` })).toHaveValue('50');
    s = await getState(page);
    expect(s.opening.corners.every((c: { size: number }) => c.size === 50)).toBe(true);
    /* 橢圓時沒有四角 */
    await page.getByRole('radio', { name: '橢圓' }).click();
    await expect(page.getByRole('switch', { name: '四角共用' })).toBeHidden();
  });

  test('套用範本與復原／重做（F02、F79、F80）', async ({ page }) => {
    await open(page);
    await hook(page, `(h) => h.set('fileBase', '我的框')`);
    await pickOption(page, '範本', '恐怖');
    /* 選了還不會套用 */
    expect((await getState(page)).design).toBe('simple');
    await expect(page.getByText('暗沉的框配上滴落的液體與蜘蛛網')).toBeVisible();
    await btn(page, '套用').click();
    await expect(status(page)).toHaveText('已套用範本「恐怖」。');
    let s = await getState(page);
    expect(s.design).toBe('horror');
    expect(s.decorations.map((d: { type: string }) => d.type)).toEqual(['drips', 'cobweb']);
    expect(s.fileBase).toBe('我的框');
    /* 復原（按鈕） */
    await page.getByRole('button', { name: /^復原/ }).click();
    expect((await getState(page)).design).toBe('simple');
    /* 重做（快捷鍵）、再復原（快捷鍵） */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+y');
    expect((await getState(page)).design).toBe('horror');
    await page.keyboard.press('Control+z');
    expect((await getState(page)).design).toBe('simple');
    await page.keyboard.press('Control+Shift+z');
    s = await getState(page);
    expect(s.design).toBe('horror');
    /* 文字欄裡不攔截 */
    const name = page.getByRole('textbox', { name: '檔名' });
    await name.click();
    await page.keyboard.press('Control+z');
    expect((await getState(page)).design).toBe('horror');
    /* 拖滑桿途中不記錄、放開算一步 */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    const before = await hook<number>(page, '(h) => h.undoSteps()');
    const slider = page.getByRole('slider', { name: '框的粗細' });
    await slider.focus();
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await expect.poll(() => hook<number>(page, '(h) => h.undoSteps()')).toBe(before + 2);
    expect((await getState(page)).opening.margin.t).toBe(48);
  });
});

test.describe('沿框裝飾與角飾', () => {
  test('新增、清單順序、往前／往後、重新產生、複製、刪除（F25～F28）', async ({ page }) => {
    await open(page);
    await tab(page, '裝飾').click();
    await expect(page.getByTestId('deco-empty')).toBeVisible();
    await page.getByRole('button', { name: '新增藤蔓' }).click();
    await expect(status(page)).toHaveText('已新增「藤蔓」。');
    await page.getByRole('button', { name: '新增鎖鏈' }).click();
    /* 清單上方＝畫面前方（最新的在上） */
    const rows = page.getByTestId('deco-row');
    await expect(rows).toHaveText(['鎖鏈', '藤蔓']);
    await expect(page.getByTestId('deco-props')).toBeVisible();
    await expect(page.getByRole('button', { name: '鎖鏈往前' })).toBeDisabled();
    await page.getByRole('button', { name: '鎖鏈往後' }).click();
    await expect(rows).toHaveText(['藤蔓', '鎖鏈']);
    /* 選藤蔓、重新產生、複製 */
    await rows
      .filter({ hasText: '藤蔓' })
      .getByRole('button', { name: '藤蔓', exact: true })
      .click();
    const s0 = await getState(page);
    const ivy = s0.decorations.find((d: { type: string }) => d.type === 'ivy');
    await btn(page, '重新產生圖樣').click();
    let s = await getState(page);
    expect(s.decorations.find((d: { id: string }) => d.id === ivy.id).seed).toBe(ivy.seed + 1);
    await btn(page, '複製').click();
    s = await getState(page);
    expect(s.decorations.map((d: { type: string }) => d.type)).toEqual(['chain', 'ivy', 'ivy']);
    expect(s.decorations[2].seed).not.toBe(s.decorations[1].seed);
    expect(await hook<string | null>(page, '(h) => h.session().decoSelected')).toBe(
      s.decorations[2].id,
    );
    /* 延伸量只有沿邊類；蜘蛛網（角落類）沒有 */
    await expect(page.getByRole('slider', { name: '延伸量' })).toBeVisible();
    await page.getByRole('button', { name: '新增蜘蛛網' }).click();
    await expect(page.getByRole('slider', { name: '延伸量' })).toBeHidden();
    await btn(page, '刪除').click();
    await expect(status(page)).toHaveText('已刪除「蜘蛛網」（可以復原）。');
    await expect(rows).toHaveCount(3);
    /* 顯示勾選 */
    await page.getByRole('checkbox', { name: '顯示鎖鏈' }).click();
    s = await getState(page);
    expect(s.decorations[0].on).toBe(false);
  });

  test('裝飾畫在哪裡：配置、溢出、密度（3.7）', async ({ page }) => {
    await open(page);
    const res = await hook<Record<string, number[]>>(
      page,
      `(h) => {
        const base = h.defaults();
        const run = (deco) => { const s = JSON.parse(JSON.stringify(base)); s.frame.fill = 'none'; s.frame.innerLine.on = false; s.frame.shadow.on = false;
          s.opening.margin = { t: 120, r: 120, b: 120, l: 120 };
          s.decorations = [Object.assign({ id: 'd', type: 'flowers', on: true, seed: 1, clipFrame: false, hideIn: {}, placement: 'all', size: 1, density: 0.5, coverage: 1, offset: 0, color: '#ff0000', color2: '#ffff00' }, deco)];
          h.replace(s); const img = h.render(null); let n = 0, top = 0, bottom = 0, inside = 0;
          for (let y = 0; y < 1080; y += 2) for (let x = 0; x < 1920; x += 2) { if (img.data[(y * 1920 + x) * 4 + 3] > 0) { n++; if (y < 300) top++; if (y > 780) bottom++; if (x > 125 && x < 1795 && y > 125 && y < 955) inside++; } }
          return [n, top, bottom, inside]; };
        return { d0: run({ density: 0 }), d50: run({ density: 0.5 }), d100: run({ density: 1 }), top: run({ placement: 'top' }),
          inside: run({ offset: -40 }), clipped: run({ offset: -40, clipFrame: true }) };
      }`,
    );
    expect(res.d0[0]).toBeLessThan(res.d50[0]);
    expect(res.d50[0]).toBeLessThan(res.d100[0]);
    expect(res.top[2]).toBe(0);
    expect(res.top[1]).toBeGreaterThan(0);
    expect(res.inside[3]).toBeGreaterThan(0);
    expect(res.clipped[0]).toBe(0);
  });
});

test.describe('圖層', () => {
  test('新增圖片：自動擺放、清單、選取並切到圖層分頁；解碼失敗略過（F30、F33）', async ({
    page,
  }) => {
    await open(page);
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      tab(page, '圖層')
        .click()
        .then(() => btn(page, '新增圖片').click()),
    ]);
    await fc.setFiles([
      {
        name: '整張框.png',
        mimeType: 'image/png',
        buffer: await testPng(1920, 1080, [0, 255, 0, 255]),
      },
      {
        name: '徽記.png',
        mimeType: 'image/png',
        buffer: await testPng(900, 540, [255, 0, 0, 255]),
      },
      { name: '壞掉.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
    ]);
    await expect(page.getByTestId('layer-row')).toHaveCount(2);
    await expect(page.getByTestId('layer-row')).toHaveText(['徽記', '整張框']);
    const s = await getState(page);
    expect(s.layers.map((l: { fit: string; scale: number }) => [l.fit, l.scale])).toEqual([
      ['stretch', 1],
      ['free', 0.8],
    ]);
    expect(await hook<string>(page, '(h) => h.session().selected')).toBe(s.layers[1].id);
    await expect(status(page)).toContainText('已新增 2 張圖片。');
    await expect(status(page)).toContainText('無法讀取「壞掉.png」');
    await expect(page.getByTestId('layer-props')).toBeVisible();
    /* 拉伸鋪滿：輸出的窗也蓋滿綠色；換色 */
    await hook(page, `(h) => h.ready()`);
    const px = await hook<number[]>(
      page,
      `(h) => { const d = h.render(null).data; const k = (540 * 1920 + 200) * 4; return Array.from(d.slice(k, k + 4)); }`,
    );
    expect(px).toEqual([0, 255, 0, 255]);
    /* 拖放：圖片當圖層、壞檔顯示錯誤 */
    await dropFiles(page, [{ name: 'bad.png', type: 'image/png', b64: btoa('nope') }]);
    await expect(status(page)).toContainText('無法讀取「bad.png」');
    const png = (await testPng(10, 10, [0, 0, 255, 255])).toString('base64');
    await dropFiles(page, [{ name: '小圖.png', type: 'image/png', b64: png }]);
    await expect(page.getByTestId('layer-row')).toHaveCount(3);
    await expect(page.getByTestId('layer-row').first()).toHaveText('小圖');
    /* 拖進頁面時出現全頁提示 */
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    });
    await expect(page.getByText('放開即可加入')).toBeVisible();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
      window.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true }));
    });
    await expect(page.getByText('放開即可加入')).toBeHidden();
    /* Ctrl＋V 貼上圖片（焦點不在文字欄） */
    await page.evaluate((b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], '貼上.png', { type: 'image/png' }));
      document.body.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, png);
    await expect(page.getByTestId('layer-row')).toHaveCount(4);
    await expect(page.getByTestId('layer-row').first()).toHaveText('貼上');
  });

  test('文字圖層：新增、複製、預覽上拖曳／Shift／方向鍵／Delete（F32、F46、F48、F49）', async ({
    page,
  }) => {
    await open(page);
    await tab(page, '圖層').click();
    await btn(page, '新增文字').click();
    await expect(page.getByTestId('layer-row')).toHaveText(['文文字']);
    let s = await getState(page);
    const id = s.layers[0].id;
    expect([s.layers[0].x, s.layers[0].y]).toEqual([0.5, 0.88]);
    /* 預覽上拖曳：放開記一步 */
    const steps = await hook<number>(page, '(h) => h.undoSteps()');
    const from = await screenPoint(page, 960, 950);
    const to = await screenPoint(page, 1060, 900);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
    s = await getState(page);
    expect(s.layers[0].x).toBeCloseTo((960 + 100) / 1920, 2);
    expect(s.layers[0].y).toBeCloseTo((950.4 - 50) / 1080, 2);
    expect(await hook<number>(page, '(h) => h.undoSteps()')).toBe(steps + 1);
    /* Shift：只沿較大的方向 */
    const p1 = await screenPoint(page, 1060, 900);
    const p2 = await screenPoint(page, 1160, 880);
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(p2.x, p2.y, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const s2 = await getState(page);
    expect(s2.layers[0].y).toBeCloseTo(s.layers[0].y, 4);
    expect(s2.layers[0].x).toBeGreaterThan(s.layers[0].x);
    /* 方向鍵：1 單位、Shift 10 單位 */
    const canvas = page.getByTestId('preview-canvas');
    await canvas.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowDown');
    const s3 = await getState(page);
    expect((s2.layers[0].x - s3.layers[0].x) * 1920).toBeCloseTo(1, 1);
    expect((s3.layers[0].y - s2.layers[0].y) * 1080).toBeCloseTo(10, 1);
    /* 複製：名稱加「 的複本」、往右下偏 2% */
    await btn(page, '複製').click();
    s = await getState(page);
    expect(s.layers[1].name).toBe('文字 的複本');
    expect(s.layers[1].x).toBeCloseTo(s.layers[0].x + 0.02, 6);
    /* 空白處取消選取；點文字選取；Delete 刪除 */
    const empty = await screenPoint(page, 400, 300);
    await page.mouse.click(empty.x, empty.y);
    expect(await hook<string | null>(page, '(h) => h.session().selected')).toBeNull();
    const hit = (await hits(page)).find((h) => h.id === id);
    if (!hit) throw new Error('沒有文字的命中範圍');
    /* 複本疊在右下方：點原本那個的左緣 */
    const c = await screenPoint(page, hit.cx - hit.w / 2 + 6, hit.cy);
    await page.mouse.click(c.x, c.y);
    expect(await hook<string | null>(page, '(h) => h.session().selected')).toBe(id);
    await page.keyboard.press('Delete');
    s = await getState(page);
    expect(s.layers.map((l: { id: string }) => l.id)).not.toContain(id);
    await expect(status(page)).toHaveText('已刪除圖層（可以復原）。');
  });
});

test.describe('差分', () => {
  test('開關、切換列、縮圖、種類、至少一個、新增、顏色（F53～F65）', async ({ page }) => {
    await open(page);
    await tab(page, '差分').click();
    await page.getByRole('switch', { name: '製作差分' }).click();
    await expect(page.getByTestId('export-zip')).toBeVisible();
    await expect(page.getByTestId('export-png')).toHaveText('只匯出目前差分（PNG）');
    const sw = page.getByTestId('variant-switch').getByRole('button');
    await expect(sw).toHaveText(['早晨', '白天', '夜晚']);
    await expect(page.getByTestId('variant-thumbs').getByRole('button')).toHaveCount(3);
    await sw.filter({ hasText: '夜晚' }).click();
    expect(await hook<string>(page, '(h) => h.current()')).toBe('night');
    await expect(page.getByText('「夜晚」的設定')).toBeVisible();
    /* 目前改的是差分自己的顏色（F14） */
    await tab(page, '框').click();
    await expect(page.getByTestId('colors-target')).toContainText('正在改差分「夜晚」自己的顏色');
    await tab(page, '差分').click();
    /* 至少要有一個要匯出 */
    await page.getByRole('checkbox', { name: '匯出早晨' }).click();
    await page.getByRole('checkbox', { name: '匯出白天' }).click();
    await page.getByRole('checkbox', { name: '匯出夜晚' }).click();
    await expect(status(page)).toHaveText('至少要有一個要匯出的差分。');
    await expect(page.getByRole('checkbox', { name: '匯出夜晚' })).toBeChecked();
    /* 目前差分即使不匯出也列在切換列 */
    await page
      .getByTestId('variant-row')
      .filter({ hasText: '早晨' })
      .getByRole('button', { name: '早晨 不匯出' })
      .click();
    await expect(sw).toHaveText(['早晨', '夜晚']);
    /* 換種類：整批換掉、目前差分改成第一個要匯出的 */
    await pickOption(page, '差分種類', '天氣');
    await expect(status(page)).toHaveText('已把差分種類換成「天氣」。');
    await expect(page.getByTestId('variant-row')).toHaveCount(6);
    expect(await hook<string>(page, '(h) => h.current()')).toBe('sunny');
    /* 新增：複製目前差分、帶編號的名稱、切過去 */
    await btn(page, '新增差分').click();
    let s = await getState(page);
    const added = s.variants.items[6];
    expect([added.name, added.sub, added.on]).toEqual(['組合 7', 'PATTERN 7', true]);
    expect(await hook<string>(page, '(h) => h.current()')).toBe(added.id);
    /* 至少要留一個差分 */
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^刪除/ }).first().click();
    await expect(page.getByTestId('variant-row')).toHaveCount(1);
    await page.getByRole('button', { name: /^刪除/ }).first().click();
    await expect(status(page)).toHaveText('至少要留一個差分；不需要差分時請關閉「製作差分」。');
    /* 顏色複製到全部差分 */
    await pickOption(page, '差分種類', '季節');
    await btn(page, '把這組顏色套用到所有差分').click();
    s = await getState(page);
    expect(new Set(s.variants.items.map((i: { frame1: string }) => i.frame1)).size).toBe(1);
    await expect(status(page)).toHaveText('已把「春」的顏色套用到所有差分。');
    /* 標籤位置：按鈕、拖曳後變自由 */
    await page.getByRole('button', { name: '右下', exact: true }).click();
    expect((await getState(page)).variants.label.pos).toBe('br');
    await expect
      .poll(async () => (await hits(page)).find((h) => h.id === 'indicator')?.cx ?? 0)
      .toBeGreaterThan(1500);
    const ind = (await hits(page)).find((h) => h.id === 'indicator');
    if (!ind) throw new Error('沒有標籤');
    const a = await screenPoint(page, ind.cx, ind.cy);
    const b = await screenPoint(page, ind.cx - 300, ind.cy - 200);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    s = await getState(page);
    expect(s.variants.label.pos).toBe('free');
    expect(s.variants.label.x * 1920).toBeCloseTo(ind.cx - 300, 0);
    await expect(page.getByRole('button', { name: '右下', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

test.describe('匯出', () => {
  test('PNG：尺寸、透明的窗、檔名、大小；開了差分只匯出目前差分（F75、F77）', async ({ page }) => {
    await open(page);
    const one = await download(page, 'export-png');
    expect(one.name).toBe('前景框.png');
    const png = decode(one.bytes);
    expect([png.width, png.height, png.bitDepth, png.colorType]).toEqual([1920, 1080, 8, 6]);
    expect(at(png, 960, 540)[3]).toBe(0);
    expect(at(png, 10, 10)[3]).toBe(255);
    await expect(status(page)).toHaveText(/^已儲存 前景框\.png（\d+ KB）。$/);
    /* 與畫面上的設計相同（不含範例風景） */
    const same = await hook<boolean>(
      page,
      `(h) => { const d = h.render(null).data; return d[(540 * 1920 + 960) * 4 + 3] === 0 && d[3] === 255; }`,
    );
    expect(same).toBe(true);
    await hook(page, `(h) => { h.set('variants.enabled', true); h.set('fileBase', 'a/b'); }`);
    await page.getByTestId('variant-switch').getByRole('button', { name: '夜晚' }).click();
    const night = await download(page, 'export-png');
    expect(night.name).toBe('a_b_4_夜晚.png');
  });

  test('ZIP：每個要匯出的差分一張、序號依整個清單（F76）', async ({ page }) => {
    await open(page);
    await hook(page, `(h) => { h.set('variants.enabled', true); h.set('fileBase', 'frame'); }`);
    const zip = await download(page, 'export-zip');
    expect(zip.name).toBe('frame.zip');
    const files = unzipFiles(zip.bytes);
    expect(files.map((f) => f.name)).toEqual([
      'frame_1_早晨.png',
      'frame_2_白天.png',
      'frame_4_夜晚.png',
    ]);
    for (const f of files) {
      const p = decode(f.data);
      expect([p.width, p.height]).toEqual([1920, 1080]);
    }
    /* 夜晚的窗有覆蓋色（28%）、白天沒有 */
    expect(at(decode(files[2].data), 960, 540)[3]).toBe(71);
    expect(at(decode(files[1].data), 960, 540)[3]).toBe(0);
    await expect(status(page)).toHaveText(/^已把 3 張打包成 frame\.zip（[\d.]+ (KB|MB)）。$/);
  });
});

test.describe('存檔與專案', () => {
  test('自動存檔與還原、記住設定分頁、選取不保存（F81、F82、F84）', async ({ page }) => {
    await open(page);
    await tab(page, '圖層').click();
    await btn(page, '新增文字').click();
    await hook(page, `(h) => { h.set('opening.margin', { t: 50, r: 50, b: 50, l: 50 }); }`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '前景框產生器' })).toBeVisible();
    await expect(status(page)).toHaveText('已還原上次的編輯內容。');
    await expect(tab(page, '圖層')).toHaveAttribute('aria-selected', 'true');
    const s = await getState(page);
    expect(s.layers).toHaveLength(1);
    expect(s.opening.margin.t).toBe(50);
    expect(await hook<string | null>(page, '(h) => h.session().selected')).toBeNull();
    await page.keyboard.press('Control+z');
    expect((await getState(page)).opening.margin.t).toBe(50);
    /* 分頁列：方向鍵、Home、End（循環） */
    await tab(page, '圖層').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '差分')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tab(page, '專案')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '框')).toHaveAttribute('aria-selected', 'true');
    expect(await hook<string>(page, '(h) => h.preview().tab')).toBe('frame');
  });

  test('專案檔：存成 ZIP（含圖片）再開啟、全部重來（F85～F87）', async ({ page }) => {
    await open(page);
    await tab(page, '圖層').click();
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '新增圖片').click(),
    ]);
    await fc.setFiles([
      { name: '徽記.png', mimeType: 'image/png', buffer: await testPng(40, 20, [255, 0, 0, 255]) },
    ]);
    await expect(page.getByTestId('layer-row')).toHaveCount(1);
    await hook(page, `(h) => h.set('fileBase', '我的專案')`);
    await page.getByRole('button', { name: '專案' }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe('我的專案.frame.zip');
    const path = await dl.path();
    if (!path) throw new Error('下載失敗');
    const names = unzipFiles(new Uint8Array(readFileSync(path))).map((f) => f.name);
    expect(names).toContain('project.json');
    expect(names.some((n) => n.startsWith('files/') && n.endsWith('.png'))).toBe(true);
    await expect(status(page)).toHaveText('已儲存專案檔 我的專案.frame.zip。');
    /* 全部重來 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '全部重來…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    await expect(status(page)).toHaveText('已回到剛開啟時的狀態。');
    expect((await getState(page)).layers).toHaveLength(0);
    expect(await hook<number>(page, '(h) => h.undoSteps()')).toBe(0);
    /* 開啟：圖片一起回來、清空復原紀錄 */
    await page.getByRole('button', { name: '專案' }).click();
    const [fc2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await fc2.setFiles(path);
    await expect(status(page)).toHaveText(/已開啟「/);
    const s = await getState(page);
    expect(s.fileBase).toBe('我的專案');
    expect(s.layers).toHaveLength(1);
    await hook(page, `(h) => h.ready()`);
    const red = await hook<number[]>(
      page,
      `(h) => { const d = h.render(null).data; const k = (540 * 1920 + 960) * 4; return Array.from(d.slice(k, k + 4)); }`,
    );
    expect(red).toEqual([255, 0, 0, 255]);
    /* 不是這個工具的檔案 */
    await dropFiles(page, [{ name: 'x.json', type: 'application/json', b64: btoa('{"a":1}') }]);
    await expect(status(page)).toHaveText('這不是 TRPG Toolkit 的專案檔。');
  });

  test('字型：上傳後列在專案分頁並可移除；壞檔顯示錯誤（F72）', async ({ page }) => {
    await open(page);
    await tab(page, '專案').click();
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '上傳字型').click(),
    ]);
    await fc.setFiles([FONT]);
    await expect(status(page)).toHaveText('已載入 1 個字型，所有字型選單都可以選。');
    await expect(page.getByTestId('font-list')).toContainText('Liberation Serif');
    await dropFiles(page, [{ name: 'broken.ttf', type: 'font/ttf', b64: btoa('not a font') }]);
    await expect(status(page)).toHaveText('「broken.ttf」不是可用的字型檔。');
    await expect(page.getByTestId('font-list').getByRole('listitem')).toHaveCount(1);
    await page.getByRole('button', { name: '移除字型「Liberation Serif」' }).click();
    await expect(status(page)).toHaveText('已移除字型「Liberation Serif」。');
  });
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await page.waitForTimeout(300);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('foreground-frame-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('390 寬沒有橫向捲動；視覺回歸', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await hook(page, `(h) => h.set('variants.enabled', true)`);
    for (const name of ['裝飾', '圖層', '差分', '專案', '框']) {
      await tab(page, name).click();
      await noHorizontalScroll(page);
    }
    await tab(page, '裝飾').click();
    await page.getByRole('button', { name: '新增藤蔓' }).click();
    await noHorizontalScroll(page);
    await tab(page, '框').click();
    await page.waitForTimeout(400);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('foreground-frame-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
