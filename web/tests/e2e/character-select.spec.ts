/**
 * 選角畫面產生器（建置產物 next/character-select/）的端對端測試：
 * - 開頁的預設值（內建角色、960 × 540、8.45 秒、路徑）、外框與頁尾、分頁、「下一步」、分頁提示卡、沒有 console error；
 * - 角色：選檔新增、不是圖片、往後移／複製／刪除（玩家的目標跟著角色走）、復原；
 * - 點預覽指定目標（不可重複的讓位、大主格時停在確定演出的開頭）、玩家設定（人數、角色不夠的提示、單一玩家、自行指定路徑）；
 * - 版型（主格在上、1:1）；
 * - 匯出：APNG、GIF、WebP、AVI（解析檔案：尺寸、影格、延遲、循環）、MP4 不支援時停用、目前畫面 PNG、互動 HTML（對話框、獨立 HTML 的鍵盤操作）；
 * - 專案檔（存、開）、匯入舊版的專案檔、自動保存；
 * - 390 寬沒有橫向捲動、1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { parseWebp } from '../../src/core/encode/webp';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { parseApng } from '../helpers/png';

const URL = `/${outputDir(getTool('character-select') ?? { id: 'character-select', status: 'next' })}/`;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Hook {
  settings: () => {
    canvas: { width: number; height: number };
    text: { title: string };
    characters: { id: string; name: string; image: string }[];
    players: {
      targets: number[];
      count: number;
      pathModes: string[];
      paths: number[][];
      allowDuplicate: boolean;
    };
    mainPanel: { enabled: boolean };
    layout: { autoGap: boolean };
    export: { fps: number; scale: number; format: string };
    animation: { loop: boolean };
  };
  duration: () => number;
  path: (p: number) => number[];
  tiles: () => Box[];
  seek: (ms: number) => void;
  time: number;
  playing: boolean;
  editingPlayer: () => number;
}
type W = { __characterSelect: Hook };
const hook = <T>(page: Page, fn: (h: Hook) => T) =>
  page.evaluate((src) => {
    const h = (window as unknown as W).__characterSelect;
    return new Function('h', `return (${src})(h)`)(h);
  }, fn.toString()) as Promise<Awaited<T>>;
const settings = (page: Page) => hook(page, (h) => h.settings());

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
  await expect(page.getByRole('heading', { level: 1, name: '選角畫面產生器' })).toBeVisible();
  await expect(page.getByTestId('character-count')).toHaveText('8 人');
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function dismissToasts(page: Page) {
  const close = page.getByRole('button', { name: '關閉通知' });
  while ((await close.count()) > 0) await close.first().click();
  await expect(close).toHaveCount(0);
}

/** 單色 PNG */
async function pngOf(w: number, h: number, rgb: number[]): Promise<Buffer> {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return Buffer.from(await encodePng(px, w, h));
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(name) });
const imageInput = (page: Page) => page.locator('input[type=file][accept^="image/*"]').first();

/** 在預覽上點第 i 個格子 */
async function clickTile(page: Page, i: number) {
  const canvas = page.getByTestId('preview-canvas');
  const box = (await canvas.boundingBox())!;
  const s = await settings(page);
  const r = (await hook(page, (h) => h.tiles()))[i];
  await canvas.click({
    position: {
      x: ((r.x + r.width / 2) / s.canvas.width) * box.width,
      y: ((r.y + r.height / 2) / s.canvas.height) * box.height,
    },
  });
}

/** 匯出分頁：選格式、尺寸 50%，匯出後下載 */
async function exportAs(page: Page, format: string) {
  await tab(page, '匯出').click();
  await page.getByRole('radio', { name: format, exact: true }).click();
  await page.getByRole('combobox', { name: '尺寸' }).click();
  await page.getByRole('option', { name: /^50%/ }).click();
  await page.getByRole('button', { name: new RegExp(`^匯出 ${format}`) }).click();
  const card = page.getByTestId('export-result').first();
  await expect(card).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync(await download.path())),
  };
}

const le32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o, true);
const ascii = (b: Uint8Array, o: number, n = 4) => String.fromCharCode(...b.subarray(o, o + n));

test.describe('選角畫面產生器', () => {
  test('開頁的預設值、外框、分頁與提示卡', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByRole('link', { name: /sotsotssi\/select-your-chara/ })).toHaveAttribute(
      'href',
      'https://github.com/sotsotssi/select-your-chara',
    );
    await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-output', '960x540');
    await expect(page.getByTestId('preview-size')).toContainText('960 × 540・8.45 秒');
    expect(await hook(page, (h) => h.duration())).toBe(8450);
    expect(await hook(page, (h) => [0, 1, 2, 3].map((p) => h.path(p)))).toEqual([
      [0, 3, 6, 3, 0],
      [2, 6, 2, 0, 1],
      [4, 1, 6, 5, 2],
      [6, 4, 2, 3],
    ]);
    const names = (await settings(page)).characters.map((c) => c.name);
    expect(names).toEqual(['蒼月', '緋焰', '翠風', '琥珀', '紫苑', '白霜', '墨影', '金雀']);
    /* 自動播放 */
    await expect.poll(() => hook(page, (h) => h.playing)).toBe(true);
    /* 分頁、提示卡、下一步 */
    await expect(tab(page, '角色')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('guide')).toContainText('想換成自己的圖片？');
    await page.getByRole('button', { name: '下一步：畫面樣式' }).click();
    await expect(tab(page, '畫面樣式')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('guide')).toContainText('調成喜歡的氣氛');
    await page.getByRole('button', { name: '下一步：選擇演出' }).click();
    await expect(tab(page, '選擇演出')).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: '下一步：匯出' }).click();
    await expect(tab(page, '匯出')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('frame-counts')).toHaveText('圖片 66 格／影片 85 格（10 FPS）');
    await tab(page, '角色').click();
    await page.getByRole('button', { name: '匯出', exact: true }).click();
    await expect(tab(page, '匯出')).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
  });

  test('角色：新增、不是圖片、往後移／複製／刪除、玩家的目標跟著角色走、復原', async ({ page }) => {
    const errors = await open(page);
    await imageInput(page).setInputFiles([
      { name: '紅色勇者.png', mimeType: 'image/png', buffer: await pngOf(60, 80, [220, 40, 40]) },
      { name: 'blue.png', mimeType: 'image/png', buffer: await pngOf(80, 60, [40, 60, 220]) },
    ]);
    await expect(page.getByTestId('character-count')).toHaveText('10 人');
    await expect(page.getByText('已新增 2 張圖片', { exact: true })).toBeVisible();
    let s = await settings(page);
    expect(s.characters.slice(-2).map((c) => c.name)).toEqual(['紅色勇者', 'blue']);
    await expect(page.getByRole('textbox', { name: '第 9 個角色的名稱' })).toHaveValue('紅色勇者');

    await imageInput(page).setInputFiles([
      { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('x') },
    ]);
    await expect(page.getByText('沒有可用的圖片', { exact: true })).toBeVisible();
    await expect(page.getByTestId('character-count')).toHaveText('10 人');

    /* 第 1 個角色（1P 的目標）往後移：1P 的目標跟著到第 2 格、2P 的目標變第 1 格 */
    await page.getByRole('button', { name: '往後移：蒼月' }).click();
    s = await settings(page);
    expect(s.characters[1].name).toBe('蒼月');
    expect(s.players.targets.slice(0, 2)).toEqual([1, 0]);
    /* 複製 */
    await page.getByRole('button', { name: '複製角色：蒼月' }).click();
    s = await settings(page);
    expect(s.characters[2].name).toBe('蒼月 複本');
    await expect(page.getByTestId('character-count')).toHaveText('11 人');
    /* 刪除 */
    await page.getByRole('button', { name: '刪除角色：蒼月 複本' }).click();
    await expect(page.getByTestId('character-count')).toHaveText('10 人');
    /* 復原（Ctrl＋Z） */
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('character-count')).toHaveText('11 人');
    /* 大格的顯示範圍：套用到所有角色 */
    const first = page.getByTestId('character-row').first();
    await first.getByRole('button', { name: '位置與縮放' }).click();
    await first.getByRole('button', { name: '設定大格顯示範圍' }).click();
    const crop = page.getByRole('dialog', { name: /大格的顯示範圍：/ });
    await expect(crop.getByTestId('crop-preview')).toBeVisible();
    const width = crop.getByRole('spinbutton', { name: '寬' });
    await width.fill('300');
    await width.press('Enter');
    await crop.getByRole('button', { name: '套用到所有角色' }).click();
    await expect(crop).toHaveCount(0);
    const crops = await hook(page, (h) =>
      (h.settings().characters as unknown as { mainCrop: { width: number } | null }[]).map(
        (c) => c.mainCrop,
      ),
    );
    expect(crops.every((c) => c && Math.abs(c.width - 0.5) < 1e-9)).toBe(true);
    await expect(first.getByText('大格用自訂的範圍')).toBeVisible();
    /* 小清單縮圖：只套用到這個角色、整張圖＝清除 */
    await first.getByRole('button', { name: '設定小清單縮圖' }).click();
    const list = page.getByRole('dialog', { name: /小清單縮圖的範圍：/ });
    await list.getByRole('button', { name: '套用到這個角色' }).click();
    await expect(list).toHaveCount(0);
    await expect(first.getByText('清單用整張原圖')).toBeVisible();
    /* 改名稱 */
    await page.getByRole('textbox', { name: '第 1 個角色的名稱' }).fill('影法師');
    expect((await settings(page)).characters[0].name).toBe('影法師');
    expect(errors).toEqual([]);
  });

  test('點預覽指定目標、玩家設定與路徑', async ({ page }) => {
    const errors = await open(page);
    /* 1P 點第 5 格 */
    await clickTile(page, 5);
    expect((await settings(page)).players.targets.slice(0, 4)).toEqual([5, 1, 2, 3]);
    /* 換成 2P，點同一格：2P 優先，1P 讓到下一個沒人選的 */
    await page
      .getByTestId('preview-players')
      .getByRole('button', { name: '指定 2P 的目標' })
      .click();
    await expect(page.getByTestId('canvas-tip')).toHaveText('點一下要當成 2P 目標的角色。');
    await clickTile(page, 5);
    expect((await settings(page)).players.targets.slice(0, 4)).toEqual([6, 5, 2, 3]);

    await tab(page, '選擇演出').click();
    /* 人數比角色多：提示、播放不了 */
    const count = page.getByRole('spinbutton', { name: '依序選擇的人數' });
    await count.fill('9');
    await count.press('Enter');
    await expect(page.getByTestId('selection-issue')).toContainText(
      '畫面上只有 8 個角色，選擇的人數卻是 9 人',
    );
    await expect.poll(() => hook(page, (h) => h.playing)).toBe(false);
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect(page.getByText(/選擇的人數卻是 9 人/).last()).toBeVisible();
    await page.getByRole('button', { name: '改成允許重複' }).click();
    await expect(page.getByTestId('selection-issue')).toHaveCount(0);
    expect((await settings(page)).players.allowDuplicate).toBe(true);

    /* 只讓 2P 選 */
    await page
      .getByRole('group', { name: '玩家編號快速選擇' })
      .getByRole('button', { name: '2P' })
      .click();
    await expect(page.getByTestId('mode-badge')).toHaveText('只有 2P');
    expect(await hook(page, (h) => h.duration())).toBe(650 + 1550 + 1600);
    await expect(page.getByTestId('player-row')).toHaveCount(1);

    /* 2P 的路徑：自行指定 → 加中繼點 */
    const row = page.getByTestId('player-row');
    await row.getByRole('button', { name: '游標路徑' }).click();
    await row.getByRole('button', { name: '固定目前的自動路徑' }).click();
    let s = await settings(page);
    expect(s.players.pathModes[1]).toBe('custom');
    await expect(row.getByTestId('waypoint')).toHaveCount(s.players.paths[1].length);
    await row.getByRole('button', { name: '＋ 中繼點' }).click();
    s = await settings(page);
    await expect(row.getByTestId('waypoint')).toHaveCount(s.players.paths[1].length);
    await expect(row.getByTestId('route-summary')).toContainText('→');

    /* 大主格：點格子停在那位玩家確定演出的開頭 */
    await tab(page, '畫面樣式').click();
    await page.getByRole('radio', { name: '大主格＋小清單' }).click();
    await clickTile(page, 3);
    await expect.poll(() => hook(page, (h) => h.playing)).toBe(false);
    expect(await hook(page, (h) => Math.round(h.time))).toBe(650 + 900);
    expect(errors).toEqual([]);
  });

  test('版型：主格在上、1:1', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '畫面樣式').click();
    await page.getByRole('button', { name: /主格在上・清單在下/ }).click();
    await expect(page.getByRole('button', { name: /主格在上・清單在下/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('preview-size')).toContainText('960 × 1280');
    expect((await settings(page)).mainPanel.enabled).toBe(true);
    await page.getByRole('button', { name: '畫面尺寸與角色排列' }).click();
    await expect(page.getByTestId('area-label')).toHaveText('主格與清單的整體區域（px）');
    await page
      .getByRole('group', { name: '畫布版型' })
      .getByRole('button', { name: '1:1' })
      .click();
    await expect(page.getByTestId('preview-size')).toContainText('1000 × 1000');
    await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-output', '1000x1000');
    expect(errors).toEqual([]);
  });

  test('匯出 APNG、GIF、WebP（解析檔案）', async ({ page }) => {
    const errors = await open(page);
    const apng = await exportAs(page, 'APNG');
    expect(apng.name).toBe('角色選擇.png');
    const a = parseApng(apng.bytes);
    expect(a.ihdr).toMatchObject({ width: 480, height: 270, colorType: 6 });
    expect(a.numPlays).toBe(0);
    expect(a.numFrames).toBeLessThanOrEqual(66);
    const total = a.frames.reduce((t, f) => t + f.delayNum / (f.delayDen || 100), 0);
    expect(total).toBeCloseTo(8.45, 2);
    expect(a.frames[0].delayNum / a.frames[0].delayDen).toBeCloseTo(0.65, 3);

    const gif = await exportAs(page, 'GIF');
    expect(gif.name).toBe('角色選擇.gif');
    const g = parseGif(gif.bytes);
    expect(g).toMatchObject({ width: 480, height: 270, loopCount: 0 });
    expect(g.frames.reduce((t, f) => t + f.delayCs, 0)).toBe(845);
    for (const f of g.frames) expect(f.delayCs).toBeGreaterThanOrEqual(2);
    expect(g.frames[0].delayCs).toBe(65);

    const webp = await exportAs(page, 'WebP');
    expect(webp.name).toBe('角色選擇.webp');
    const chunks = parseWebp(webp.bytes);
    const vp8x = chunks.find((c) => c.fourcc === 'VP8X')!.data;
    expect((vp8x[4] | (vp8x[5] << 8) | (vp8x[6] << 16)) + 1).toBe(480);
    const anim = chunks.find((c) => c.fourcc === 'ANIM')!.data;
    expect(anim[4] | (anim[5] << 8)).toBe(0);
    const ms = chunks
      .filter((c) => c.fourcc === 'ANMF')
      .reduce((t, c) => t + (c.data[12] | (c.data[13] << 8) | (c.data[14] << 16)), 0);
    expect(ms).toBe(8450);
    expect(errors).toEqual([]);
  });

  test('匯出 AVI（解析 RIFF）、MP4 不支援時停用、不循環', async ({ page }) => {
    const errors = await open(page);
    const h264 = await page.evaluate(async () => {
      try {
        return (
          await VideoEncoder.isConfigSupported({
            codec: 'avc1.42001f',
            width: 640,
            height: 360,
            framerate: 30,
            bitrate: 2e6,
          })
        ).supported;
      } catch {
        return false;
      }
    });
    await tab(page, '匯出').click();
    if (!h264) {
      await expect(page.locator('[data-disabled-format="mp4"]')).toContainText('MP4');
      await expect(page.getByRole('radio', { name: 'MP4', exact: true })).toBeDisabled();
    }
    const avi = await exportAs(page, 'AVI');
    expect(avi.name).toBe('角色選擇.avi');
    const b = avi.bytes;
    expect(ascii(b, 0)).toBe('RIFF');
    expect(le32(b, 4)).toBe(b.length - 8);
    expect(ascii(b, 8)).toBe('AVI ');
    expect(ascii(b, 24)).toBe('avih');
    expect(le32(b, 32)).toBe(100_000);
    expect(le32(b, 48)).toBe(85);
    expect([le32(b, 64), le32(b, 68)]).toEqual([480, 270]);
    const movi = ascii(b, 0, 4096).indexOf('movi');
    expect(ascii(b, movi + 4)).toBe('00dc');
    expect([b[movi + 12], b[movi + 13]]).toEqual([0xff, 0xd8]);
    const idx = b.length - 85 * 16 - 8;
    expect(ascii(b, idx)).toBe('idx1');
    expect(le32(b, idx + 8 + 16 * 3 + 8) + movi).toBeGreaterThan(movi);
    expect(ascii(b, movi + le32(b, idx + 8 + 16 * 3 + 8))).toBe('00dc');

    /* 不循環：GIF 沒有 NETSCAPE 循環 */
    await tab(page, '選擇演出').click();
    await page.getByRole('button', { name: '播放時間與速度' }).click();
    await page.getByRole('switch', { name: '無限循環' }).click();
    const gif = await exportAs(page, 'GIF');
    expect(parseGif(gif.bytes).loopCount).toBeNull();
    expect(errors).toEqual([]);
  });

  test('背景圖片、透明背景、自己試著選選看', async ({ page, context }) => {
    const errors = await open(page);
    await tab(page, '畫面樣式').click();
    const bgType = page.getByRole('radiogroup', { name: '背景方式' });
    await bgType.getByRole('radio', { name: '背景圖片' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: '選擇背景圖片' }).click(),
    ]);
    await chooser.setFiles({
      name: 'bg.png',
      mimeType: 'image/png',
      buffer: await pngOf(64, 36, [10, 120, 90]),
    });
    await expect(page.getByText('已套用背景圖片', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '更換背景圖片' })).toBeVisible();
    /* 背景圖的中央附近是綠色（疊上 24% 的深色） */
    await hook(page, (h) => h.seek(8000));
    const px = await page
      .getByTestId('preview-canvas')
      .evaluate((c: HTMLCanvasElement) =>
        Array.from(c.getContext('2d')!.getImageData(30, 270, 1, 1).data),
      );
    expect(px[1]).toBeGreaterThan(px[0] + 20);
    await page.getByRole('button', { name: '移除背景圖片' }).click();
    await expect(bgType.getByRole('radio', { name: '漸層' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    /* 透明背景：角落透明 */
    await bgType.getByRole('radio', { name: '透明' }).click();
    /* 透明背景時暗角與細紋也不畫（同舊版，F68、F69）：角落完全透明 */
    await expect
      .poll(() =>
        page
          .getByTestId('preview-canvas')
          .evaluate((c: HTMLCanvasElement) =>
            Array.from(c.getContext('2d')!.getImageData(2, 2, 1, 1).data),
          ),
      )
      .toEqual([0, 0, 0, 0]);

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: '自己試著選選看' }).click(),
    ]);
    await expect(popup.locator('.csx-status')).toHaveText('1P 選擇中', { timeout: 30_000 });
    await expect(popup.locator('.csx-tile')).toHaveCount(8);
    await popup.close();
    expect(errors).toEqual([]);
  });

  test('目前畫面 PNG、互動 HTML（對話框與獨立 HTML 的操作）', async ({ page, context }) => {
    const errors = await open(page);
    const [png] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('save-png').click(),
    ]);
    expect(png.suggestedFilename()).toBe('角色選擇-frame.png');
    const pb = new Uint8Array(readFileSync(await png.path()));
    const dv = new DataView(pb.buffer, pb.byteOffset);
    expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([720, 405]);

    await tab(page, '匯出').click();
    await page.getByRole('button', { name: 'HTML 程式碼' }).click();
    const dialog = page.getByRole('dialog', { name: '互動 HTML' });
    const code = dialog.getByRole('textbox');
    await expect(code).toHaveValue(/<div id="csx-[a-z0-9]+" class="csx"/, { timeout: 30_000 });
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: '儲存獨立 HTML' }).click(),
    ]);
    expect(file.suggestedFilename()).toBe('角色選擇-interactive.html');
    const html = readFileSync(await file.path(), 'utf8');
    expect(html).toMatch(/^<!doctype html>\n<html lang="zh-Hant-TW">/);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    const w = await context.newPage();
    await w.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await w.setContent(html);
    const root = w.locator('.csx');
    const status = w.locator('.csx-status');
    await expect(status).toHaveText('1P 選擇中');
    await root.focus();
    await w.keyboard.press('ArrowRight');
    await w.keyboard.press('Enter');
    await expect(w.locator('.csx-tile.is-picked')).toHaveCount(1);
    await expect(w.locator('.csx-tile').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(status).toHaveText('2P 選擇中');
    await w.locator('.csx-tile').nth(5).click();
    await w.locator('.csx-tile').nth(6).click();
    await w.locator('.csx-tile').nth(7).click();
    await expect(status).toHaveText('選擇完成');
    await w.keyboard.press('r');
    await expect(status).toHaveText('1P 選擇中');
    await expect(w.locator('.csx-tile.is-picked')).toHaveCount(0);
    await w.close();
    expect(errors).toEqual([]);
  });

  test('專案檔：存、開；匯入舊版的專案檔；自動保存', async ({ page }) => {
    const errors = await open(page);
    await imageInput(page).setInputFiles([
      { name: 'green.png', mimeType: 'image/png', buffer: await pngOf(40, 40, [30, 200, 60]) },
    ]);
    await expect(page.getByTestId('character-count')).toHaveText('9 人');
    await page.getByRole('button', { name: '專案' }).click();
    const [zip] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(zip.suggestedFilename()).toMatch(/^角色選擇_\d{8}\.zip$/);
    const zipPath = await zip.path();
    const entries = unzipSync(new Uint8Array(readFileSync(zipPath)));
    const project = JSON.parse(strFromU8(entries['project.json']));
    expect(project.tool).toBe('character-select');
    expect(project.data.settings.characters).toHaveLength(9);
    const imageId = project.data.settings.characters[8].image;
    expect(Object.keys(entries)).toContain(`files/${imageId}.png`);

    /* 改掉再開回來 */
    await tab(page, '畫面樣式').click();
    await page.getByRole('button', { name: '標題與名牌' }).click();
    await page.getByRole('textbox', { name: '主標題' }).fill('改過的標題');
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(zipPath);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect.poll(async () => (await settings(page)).text.title).toBe('角色選擇');
    expect((await settings(page)).characters).toHaveLength(9);

    /* 舊版的專案檔 */
    const red = `data:image/png;base64,${(await pngOf(30, 30, [250, 0, 0])).toString('base64')}`;
    const legacy = {
      version: 2,
      canvas: { width: 800, height: 450 },
      background: { type: 'solid', colorA: '#202020' },
      layout: { x: 40, y: 120, width: 720, height: 280, columns: 2, rows: 1 },
      text: { title: '舊的畫面' },
      players: { count: 2, labels: ['小明', ''], targets: [0, 1] },
      animation: { fps: 15, loop: false },
      export: { scale: 1, webpQuality: 0.82 },
      characters: [
        { id: 'a', name: 'Red', src: red, scale: 1.2 },
        { id: 'b', name: 'ASTER', demo: true, src: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E' },
      ],
    };
    await page.getByRole('button', { name: '專案' }).click();
    const [legacyChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '匯入舊版的專案檔（.json）…' }).click(),
    ]);
    await legacyChooser.setFiles({
      name: 'old.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    await expect(page.getByText('已匯入舊版的專案檔', { exact: true })).toBeVisible();
    const s = await settings(page);
    expect(s.canvas).toEqual({ width: 800, height: 450 });
    expect(s.text.title).toBe('舊的畫面');
    expect(s.characters.map((c) => c.name)).toEqual(['Red', '蒼月']);
    expect(s.layout.autoGap).toBe(false);
    expect(s.export.fps).toBe(15);
    expect(s.animation.loop).toBe(false);
    expect(s.players.count).toBe(2);

    /* 自動保存：重新整理後還在（圖片也在） */
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '選角畫面產生器' })).toBeVisible();
    await expect(page.getByTestId('character-count')).toHaveText('2 人');
    expect((await settings(page)).text.title).toBe('舊的畫面');
    await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-output', '800x450');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await hook(page, (h) => h.seek(3400));
    await dismissToasts(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('character-select-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    for (const name of ['畫面樣式', '選擇演出', '匯出', '角色']) {
      await tab(page, name).click();
      await noHorizontalScroll(page);
    }
    await tab(page, '選擇演出').click();
    await page.getByTestId('player-row').first().getByRole('button', { name: '游標路徑' }).click();
    await noHorizontalScroll(page);
    await tab(page, '角色').click();
    await hook(page, (h) => h.seek(3400));
    await dismissToasts(page);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('character-select-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
