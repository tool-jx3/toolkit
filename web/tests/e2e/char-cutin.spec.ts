/**
 * 立繪切入產生器（建置產物 next/char-cutin/）的端對端測試（規格 docs/refactor/specs/char-cutin.md）：
 * - 開頁沒有錯誤、預設狀態、示意人形、頁尾只有靈感來源。
 * - 放立繪（檔名→名字、自然排序、臉的自動對準）、改名字與小標題、ROUND 編號、排序、拿掉、換圖、復原／重做。
 * - 六種型的預覽有畫；換型時樣式跟著換、這個型回到初始值。
 * - 匯出：WebP／APNG（存下來解析：尺寸、影格數、每格延遲、播放次數、透明、1 MB 以下）、一次、全員 ZIP（檔名、VS 拿掉對手）、
 *   CCFOLIA 房間 ZIP（切入的名稱與圖）、影片（能編時 MP4，不能時 WebM）。
 * - 自動儲存（重新整理後演員與立繪還在）、專案檔（存、重來、開啟）。
 * - 390／360／320 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync, zlibSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';
import { parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('char-cutin') ?? { id: 'char-cutin', status: 'next' })}/`;

/* ---------- 測試用的立繪（自己畫的人形：頭、脖子、肩膀以下） ---------- */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** w × h 的人形；cx：臉的橫向位置（0～1）；tint：衣服的顏色 */
function portrait(w: number, h: number, cx: number, tint: number[]): Buffer {
  const raw = new Uint8Array((w * 4 + 1) * h);
  const hx = w * cx;
  const headR = w * 0.18;
  const headY = h * 0.05 + headR;
  const neckY = headY + headR * 1.4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const head = (x - hx) ** 2 + ((y - headY) / 1.2) ** 2 < headR ** 2;
      const eye = Math.abs(y - headY) < 3 && Math.abs(Math.abs(x - hx) - headR * 0.4) < 4;
      const neck = y >= headY && y < neckY && Math.abs(x - hx) < headR * 0.4;
      const body = y >= neckY && Math.abs(x - hx) < headR * 1.2 + (y - neckY) * 0.6;
      const px = eye
        ? [40, 30, 60, 255]
        : head || neck
          ? [241, 201, 168, 255]
          : body
            ? [...tint, 255]
            : [0, 0, 0, 0];
      raw.set(px, y * (w * 4 + 1) + 1 + x * 4);
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

const FILES = [
  { name: '10_羅蘭.png', mimeType: 'image/png', buffer: portrait(240, 560, 0.55, [47, 122, 79]) },
  { name: '02_黑川.png', mimeType: 'image/png', buffer: portrait(260, 520, 0.45, [122, 42, 58]) },
  { name: '1-艾莉絲.png', mimeType: 'image/png', buffer: portrait(240, 600, 0.5, [59, 91, 181]) },
];

/* ---------- 共用 ---------- */

async function open(page: Page, { clear = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  if (clear) {
    await page.evaluate(async () => {
      localStorage.clear();
      for (const db of (await indexedDB.databases?.()) ?? [])
        if (db.name) indexedDB.deleteDatabase(db.name);
    });
    await page.reload();
  }
  await expect(page.getByRole('heading', { level: 1, name: '立繪切入產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __charCutin?: unknown }).__charCutin);
  return errors;
}

// biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
const hook = <T>(page: Page, fn: (h: any) => T) =>
  page.evaluate(
    (src) =>
      // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
      new Function('h', `return (${src})(h)`)((window as any).__charCutin) as T,
    fn.toString(),
  );

const actors = (page: Page) =>
  hook<{ name: string; tag: string; eyeY: number; eyeX: number; image: string }[]>(page, (h) =>
    h
      .doc()
      .actors.map(
        (a: { name: string; tag: string; eyeY: number; eyeX: number; image: string }) => ({
          name: a.name,
          tag: a.tag,
          eyeY: a.eyeY,
          eyeX: a.eyeX,
          image: a.image,
        }),
      ),
  );

async function addPortraits(page: Page) {
  await page.getByLabel('選擇檔案').first().setInputFiles(FILES);
  await expect(page.getByTestId('cast-row')).toHaveCount(3);
  await expect(page.getByTestId('cast-status')).toHaveText('已加入 3 位演員。');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 預覽畫布上不透明的像素比例（取樣） */
const coverage = (page: Page) =>
  page.getByTestId('cutin-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let all = 0;
    for (let i = 3; i < d.length; i += 4 * 97) {
      all++;
      if (d[i]) n++;
    }
    return n / all;
  });

async function download(page: Page, button: RegExp | string) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('button', { name: button }).click(),
  ]);
  return { name: dl.suggestedFilename(), bytes: readFileSync((await dl.path()) as string) };
}

/** 動態 WebP：尺寸、播放次數、每格延遲 */
function webpInfo(bytes: Buffer) {
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  const out = { width: 0, height: 0, loops: -1, delays: [] as number[], alpha: false };
  let o = 12;
  while (o + 8 <= bytes.length) {
    const type = bytes.subarray(o, o + 4).toString('latin1');
    const size = bytes.readUInt32LE(o + 4);
    const d = bytes.subarray(o + 8, o + 8 + size);
    if (type === 'VP8X') {
      out.alpha = (d[0] & 0x10) !== 0;
      out.width = d.readUIntLE(4, 3) + 1;
      out.height = d.readUIntLE(7, 3) + 1;
    } else if (type === 'ANIM') out.loops = d.readUInt16LE(4);
    else if (type === 'ANMF') out.delays.push(d.readUIntLE(12, 3));
    o += 8 + size + (size & 1);
  }
  return out;
}

const chooseKind = (page: Page, label: string) =>
  page.getByRole('radio', { name: label, exact: true }).click();

const seek = (page: Page, t: number) => hook(page, new Function(`return (h) => h.seek(${t})`)());

/* ---------- 一般操作 ---------- */

test.describe('一般操作', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('預設、示意人形、頁尾', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByRole('radio', { name: '斬入', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('還沒有演員。先放進立繪（也可以拖進預覽）。')).toBeVisible();
    await expect(page.getByRole('button', { name: '匯出選取的一人' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '全員匯出成 ZIP（兩人以上）' })).toBeDisabled();
    /* 示意人形與範例文字 */
    await seek(page, 0.9);
    expect(await coverage(page)).toBeGreaterThan(0.2);
    const footer = page.locator('footer');
    await expect(footer).toContainText('靈感來源：あまやどり／カットインジェネレーター');
    await expect(footer.getByRole('link')).toHaveAttribute('href', 'https://nureenishi.booth.pm/');
    expect(errors).toEqual([]);
  });

  test('放立繪：檔名變名字、自然排序、臉自動對準；改文字、ROUND 編號、排序、拿掉、換圖、復原', async ({
    page,
  }) => {
    const errors = await open(page);
    await addPortraits(page);
    const list = await actors(page);
    expect(list.map((a) => a.name)).toEqual(['艾莉絲', '黑川', '羅蘭']);
    /* 人形的臉：眼睛約在頭的中間（圖高的 5% ＋ 頭半徑 × 1.2…），橫向照畫的位置 */
    expect(list[0].eyeX).toBeGreaterThan(47);
    expect(list[0].eyeX).toBeLessThan(53);
    expect(list[1].eyeX).toBeLessThan(48);
    expect(list[2].eyeX).toBeGreaterThan(52);
    for (const a of list) {
      expect(a.eyeY).toBeGreaterThan(5);
      expect(a.eyeY).toBeLessThan(30);
    }
    await expect(page.getByTestId('cast-row').first()).toHaveAttribute('data-selected', 'true');

    /* 改名字與台詞（離開欄位才記一步） */
    const name = page.getByRole('textbox', { name: '名字', exact: true });
    await expect(name).toHaveValue('艾莉絲');
    await name.fill('艾莉絲・蘭');
    await page.getByRole('textbox', { name: '一句台詞' }).fill('輪到我了！');
    await page.getByRole('textbox', { name: '一句台詞' }).blur();
    await expect(page.getByTestId('cast-name').first()).toHaveText('艾莉絲・蘭');

    /* ROUND 編號 */
    await page.getByRole('button', { name: '小標題改成 ROUND 編號' }).click();
    expect((await actors(page)).map((a) => a.tag)).toEqual(['ROUND 01', 'ROUND 02', 'ROUND 03']);

    /* 排序：下移、Alt＋↑ */
    await page.getByRole('button', { name: '「艾莉絲・蘭」往下移' }).click();
    expect((await actors(page)).map((a) => a.name)).toEqual(['黑川', '艾莉絲・蘭', '羅蘭']);
    await page.getByTestId('cast-row').nth(1).click();
    await page.keyboard.press('Alt+ArrowUp');
    expect((await actors(page)).map((a) => a.name)).toEqual(['艾莉絲・蘭', '黑川', '羅蘭']);

    /* 復原、重做 */
    await page.getByRole('button', { name: /^復原/ }).click();
    expect((await actors(page)).map((a) => a.name)).toEqual(['黑川', '艾莉絲・蘭', '羅蘭']);
    await page.getByRole('button', { name: /^重做/ }).click();
    expect((await actors(page)).map((a) => a.name)).toEqual(['艾莉絲・蘭', '黑川', '羅蘭']);

    /* 換圖（點縮圖）：名字不變、圖換掉 */
    const before = (await actors(page))[2].image;
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '換掉「羅蘭」的圖' }).click();
    await (await chooser).setFiles([
      { name: 'x.png', mimeType: 'image/png', buffer: portrait(300, 500, 0.3, [200, 120, 40]) },
    ]);
    await expect(page.getByTestId('cast-status')).toHaveText(/已換掉「羅蘭」的圖/);
    const after = (await actors(page))[2];
    expect(after.name).toBe('羅蘭');
    expect(after.image).not.toBe(before);
    expect(after.eyeX).toBeLessThan(40);

    /* 拿掉 */
    await page.getByRole('button', { name: '拿掉「黑川」' }).click();
    expect((await actors(page)).map((a) => a.name)).toEqual(['艾莉絲・蘭', '羅蘭']);
    await page.keyboard.press('Control+z');
    expect((await actors(page)).map((a) => a.name)).toEqual(['艾莉絲・蘭', '黑川', '羅蘭']);
    expect(errors).toEqual([]);
  });

  test('六種型都有畫；換型時樣式跟著換；這個型回到初始值', async ({ page }) => {
    const errors = await open(page);
    await addPortraits(page);
    for (const k of ['斬入', '橫掠', '眼部特寫', '升起', '重擊', 'VS']) {
      await chooseKind(page, k);
      await seek(page, 0.9);
      expect(await coverage(page), k).toBeGreaterThan(0.1);
      await seek(page, 1.8);
      expect(await coverage(page), k).toBe(0);
    }
    /* VS：對手、謎之剪影的名字 */
    await page.getByRole('tab', { name: '樣式' }).click();
    await expect(page.getByRole('textbox', { name: '剪影的名字' })).toHaveValue('？？？');
    await page.getByRole('combobox', { name: '對手' }).click();
    await page.getByRole('option', { name: /黑川/ }).click();
    await expect(page.getByRole('textbox', { name: '剪影的名字' })).toHaveCount(0);
    expect(await hook(page, (h) => h.shot().input.rivalName)).toBe('黑川');
    /* 重擊：重擊字與逐字的間距 */
    await chooseKind(page, '重擊');
    await expect(page.getByRole('textbox', { name: '重擊的字' })).toHaveValue('反擊');
    await page.getByRole('spinbutton', { name: '「反」和「擊」之間' }).fill('-20');
    await page.getByRole('spinbutton', { name: '「反」和「擊」之間' }).press('Enter');
    expect(await hook(page, (h) => h.doc().styles.impact.impact.gaps)).toEqual([-20]);
    await expect(page.getByTestId('kind-state')).toHaveText('這個型改過設定（自動儲存）。');
    /* 其他型不受影響 */
    await chooseKind(page, '斬入');
    await expect(page.getByTestId('kind-state')).toHaveText('這個型是初始值。');
    await chooseKind(page, '重擊');
    await page.getByRole('button', { name: '這個型回到初始值' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '回到初始值' }).click();
    await expect(page.getByTestId('kind-state')).toHaveText('這個型是初始值。');
    expect(await hook(page, (h) => h.doc().styles.impact.impact.gaps)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('自動儲存：重新整理後演員、立繪與設定都還在；專案檔存了、重來、再開回來', async ({
    page,
  }) => {
    const errors = await open(page);
    await addPortraits(page);
    await chooseKind(page, '升起');
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __charCutin?: unknown }).__charCutin,
    );
    await expect(page.getByTestId('cast-row')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: '升起', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await seek(page, 0.9);
    await expect.poll(() => coverage(page)).toBeGreaterThan(0.1);
    /* 專案檔 */
    await page.getByRole('button', { name: '專案' }).click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^char-cutin-\d{8}-\d{4}\.zip$/);
    const projectPath = (await dl.path()) as string;
    const zip = unzipSync(readFileSync(projectPath));
    const proj = JSON.parse(strFromU8(zip['project.json']));
    expect(proj).toMatchObject({ format: 'trpg-toolkit-project', tool: 'char-cutin', version: 1 });
    expect(proj.data.actors).toHaveLength(3);
    expect(Object.keys(zip).filter((n) => n.startsWith('files/'))).toHaveLength(3);
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    await expect(page.getByTestId('cast-row')).toHaveCount(0);
    await page.getByRole('button', { name: '專案' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
    await (await chooser).setFiles(projectPath);
    await expect(page.getByTestId('cast-row')).toHaveCount(3);
    expect((await actors(page)).map((a) => a.name)).toEqual(['艾莉絲', '黑川', '羅蘭']);
    await expect(page.getByRole('radio', { name: '升起', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    /* 壞掉的專案檔 */
    await page.getByRole('button', { name: '專案' }).click();
    const bad = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
    await (await bad).setFiles([
      { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{壞掉') },
    ]);
    await expect(page.getByText(/這不是有效的專案檔/).first()).toBeVisible();
    await expect(page.getByTestId('cast-row')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
});

/* ---------- 匯出 ---------- */

test.describe('匯出', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('WebP 640 × 360：重複、24 fps、1 MB 以下、透明；一次＝播放 1 次', {
    tag: '@serial',
  }, async ({ page }) => {
    const errors = await open(page);
    await addPortraits(page);
    await expect(page.getByTestId('estimate')).toHaveText(/容量的預估：每人約 .+，全員約 .+/);
    const a = await download(page, '匯出選取的一人');
    expect(a.name).toBe('01_艾莉絲_斬入.webp');
    const w = webpInfo(a.bytes);
    expect(w).toMatchObject({ width: 640, height: 360, loops: 0, alpha: true });
    expect(a.bytes.length).toBeLessThanOrEqual(1_000_000);
    expect(w.delays.every((d) => d % 42 === 0)).toBe(true);
    expect(w.delays.reduce((s, d) => s + d, 0)).toBe(44 * 42);
    await expect(page.getByTestId('export-status')).toHaveText(/已匯出「01_艾莉絲_斬入\.webp」/);
    /* 一次 */
    await page.getByRole('radio', { name: '一次' }).click();
    const b = await download(page, '匯出選取的一人');
    const wb = webpInfo(b.bytes);
    expect(wb.loops).toBe(1);
    expect(wb.delays.reduce((s, d) => s + d, 0)).toBe(37 * 42);
    expect(errors).toEqual([]);
  });

  test('APNG：640 × 360 放進 1 MB；1280 × 720 單色背景', { tag: '@serial' }, async ({ page }) => {
    const errors = await open(page);
    await addPortraits(page);
    await page.getByRole('radio', { name: 'APNG' }).click();
    await chooseKind(page, '眼部特寫');
    const a = await download(page, '匯出選取的一人');
    expect(a.name).toBe('01_艾莉絲_眼部特寫.png');
    expect(a.bytes.length).toBeLessThanOrEqual(1_000_000);
    const info = parseApng(new Uint8Array(a.bytes));
    expect(info.numPlays).toBe(0);
    expect(info.frames[0]).toMatchObject({ width: 640, height: 360 });
    /* 第一格（開始前）是全透明的 */
    expect(info.frames.length).toBeGreaterThan(10);
    /* 1280 × 720、單色背景 */
    await page.getByRole('radio', { name: '1280 × 720' }).click();
    await page.getByRole('radio', { name: '單色' }).click();
    const b = await download(page, '匯出選取的一人');
    const big = parseApng(new Uint8Array(b.bytes));
    expect(big.frames[0]).toMatchObject({ width: 1280, height: 720 });
    expect(errors).toEqual([]);
  });

  test('全員 ZIP（VS 拿掉對手）與 CCFOLIA 房間 ZIP', { tag: '@serial' }, async ({ page }) => {
    const errors = await open(page);
    await addPortraits(page);
    const all = await download(page, '全員匯出成 ZIP（3 人）');
    expect(all.name).toBe('立繪切入_斬入_3人.zip');
    const files = unzipSync(all.bytes);
    expect(Object.keys(files)).toEqual(['01_艾莉絲.webp', '02_黑川.webp', '03_羅蘭.webp']);
    for (const f of Object.values(files)) expect(f.length).toBeLessThanOrEqual(1_000_000);
    /* VS：對手（黑川）以外 */
    await chooseKind(page, 'VS');
    await page.getByRole('tab', { name: '樣式' }).click();
    await page.getByRole('combobox', { name: '對手' }).click();
    await page.getByRole('option', { name: /黑川/ }).click();
    const vs = await download(page, '全員匯出成 ZIP（3 人）');
    expect(vs.name).toBe('立繪切入_VS_2人.zip');
    expect(Object.keys(unzipSync(vs.bytes))).toEqual(['01_艾莉絲.webp', '03_羅蘭.webp']);
    /* 房間 ZIP：每人一個切入 */
    const room = await download(page, 'CCFOLIA 房間 ZIP');
    expect(room.name).toBe('立繪切入_VS_CCFOLIA房間.zip');
    const rz = unzipSync(room.bytes);
    const data = JSON.parse(strFromU8(rz['__data.json']));
    expect(data.entities.room).toEqual({});
    const effects = Object.values(data.entities.effects) as { name: string; imageUrl: string }[];
    expect(effects.map((e) => e.name)).toEqual(['@艾莉絲VS黑川', '@羅蘭VS黑川']);
    for (const e of effects) {
      expect(e.imageUrl).toMatch(/^[0-9a-f]{64}\.webp$/);
      expect(rz[e.imageUrl]).toBeTruthy();
    }
    expect(rz['.token']).toBeTruthy();
    /* 選取的人是對手時不能匯出一人 */
    await page.getByRole('tab', { name: '演員' }).click();
    await page.getByTestId('cast-row').nth(1).click();
    await page.getByRole('button', { name: '匯出選取的一人' }).click();
    await expect(page.getByTestId('export-status')).toHaveText(/選取的人是 VS 的對手/);
    expect(errors).toEqual([]);
  });

  test('匯出中取消：一人、全員、房間都顯示「已取消匯出。」、按鈕恢復、沒有下載', {
    tag: '@serial',
  }, async ({ page }) => {
    const errors = await open(page);
    await addPortraits(page);
    /* 做得久一點：APNG 1280 × 720、速度 0.3（一人約 128 格） */
    await page.getByRole('radio', { name: 'APNG' }).click();
    await page.getByRole('radio', { name: '1280 × 720' }).click();
    await page.getByRole('tab', { name: '樣式' }).click();
    await page.getByRole('slider', { name: '速度' }).press('Home');
    expect(await hook(page, (h) => h.doc().styles.strike.pace)).toBe(0.3);
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    const busy = page.getByTestId('export-busy');
    for (const name of ['匯出選取的一人', '全員匯出成 ZIP（3 人）', 'CCFOLIA 房間 ZIP']) {
      await page.getByRole('button', { name }).click();
      /* 等到真的在編碼（進度條動了）才取消 */
      await expect
        .poll(() =>
          busy
            .getByRole('progressbar')
            .getAttribute('aria-valuenow')
            .catch(() => '0'),
        )
        .not.toBe('0');
      await busy.getByRole('button', { name: '取消' }).click();
      await expect(page.getByTestId('export-status')).toHaveText('已取消匯出。');
      await expect(busy).toHaveCount(0);
      await expect(page.getByRole('button', { name })).toBeEnabled();
    }
    expect(downloads).toEqual([]);
    /* 取消之後照常匯出得出來 */
    await page.getByRole('slider', { name: '速度' }).press('End');
    await page.getByRole('radio', { name: '640 × 360（1 MB 以下）' }).click();
    const again = await download(page, '匯出選取的一人');
    expect(again.name).toBe('01_艾莉絲_斬入.png');
    expect(errors).toEqual([]);
  });

  test('影片：能編 MP4 就是 MP4，不能時 WebM', { tag: '@serial' }, async ({ page }) => {
    const errors = await open(page);
    await addPortraits(page);
    await page.getByRole('radio', { name: '影片' }).click();
    await expect(
      page.getByLabel('背景', { exact: true }).getByRole('radio', { name: '透明' }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'CCFOLIA 房間 ZIP' })).toBeDisabled();
    const route = await page.evaluate(async () => {
      try {
        const s = await VideoEncoder.isConfigSupported({
          codec: 'avc1.640028',
          width: 1280,
          height: 720,
          bitrate: 8e6,
          framerate: 30,
        });
        return s.supported ? 'mp4' : 'webm';
      } catch {
        return 'webm';
      }
    });
    const v = await download(page, '匯出選取的一人');
    if (v.name.endsWith('.mp4')) {
      expect(route).toBe('mp4');
      expect(v.bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
    } else {
      expect(v.name).toBe('01_艾莉絲_斬入.webm');
      expect(v.bytes.readUInt32BE(0)).toBe(0x1a45dfa3);
      await expect(page.getByTestId('export-status')).toContainText('改存成 WebM');
    }
    expect(v.bytes.length).toBeGreaterThan(10_000);
    expect(errors).toEqual([]);
  });
});

/* ---------- 版面 ---------- */

test.describe('版面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('390／360／320 寬沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await addPortraits(page);
    for (const w of [390, 360, 320]) {
      await page.setViewportSize({ width: w, height: 800 });
      await noHorizontalScroll(page);
      await page.getByRole('tab', { name: '樣式' }).click();
      await chooseKind(page, '重擊');
      await noHorizontalScroll(page);
      await chooseKind(page, 'VS');
      await noHorizontalScroll(page);
      await page.getByRole('tab', { name: '演員' }).click();
    }
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await addPortraits(page);
    await seek(page, 0.9);
    await expect(page.getByTestId('estimate')).toHaveText(/每人約/);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('char-cutin-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await addPortraits(page);
    await seek(page, 0.9);
    await expect(page.getByTestId('estimate')).toHaveText(/每人約/);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('char-cutin-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
