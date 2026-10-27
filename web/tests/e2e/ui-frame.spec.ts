/**
 * UI 框素材產生器（建置產物 next/ui-frame/）的端對端測試（規格 docs/refactor/specs/ui-frame.md）：
 * - 開頁沒有錯誤、預設（文字冒險、案件卷宗、1280 × 720、39 張）、頁尾只有靈感來源；
 * - 匯出列（畫面大小、ZIP、配置程式碼）捲到哪裡都看得到；
 * - 兩種用途：測試文字欄位、素材清單（39／5／7 張）、四種狀態與配置程式碼只在文字冒險；
 * - 世界觀預設、主色（看不懂的色碼）、回到原始值（全部、單一欄位、按兩下滑桿）、復原與重做；預覽跟著變；
 * - 打字中直接換分頁：那筆編輯收尾，復原不會卡住；重設不改畫面大小；
 * - 預覽：滑過與按下（拖出按鈕就取消按下；四種狀態跟著切）、放大鏡、截圖、預覽背景與試看的圖（重新整理還在；
 *   選範例背景時拿掉試看背景圖；拿掉的圖從瀏覽器的資料庫刪掉）；
 * - 匯出：單張 PNG（素材清單、四種狀態）、ZIP（解開檢查檔案數、每張的尺寸、透明、.ks 的座標與檔名）、1920 × 1080、TRPG 文字畫進 PNG；
 * - 配置程式碼的對話框（三個檔、下載）；我的預設（存、改名、套用、匯出 JSON、刪除、讀入、重新整理還在）；
 * - 自動儲存；390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('ui-frame') ?? { id: 'ui-frame', status: 'next' })}/`;

test.use({ viewport: { width: 1280, height: 900 } });

interface PartInfo {
  id: string;
  file: string;
  name: string;
  group: string;
  width: number;
  height: number;
}

interface Hook {
  doc: () => {
    mode: string;
    resolution: number;
    design: Record<string, unknown> & { keyColor: string; borderWidth: number };
    texts: Record<string, unknown>;
    base: { kind: string; id: string; name: string; design: Record<string, unknown> };
  };
  prefs: () => Record<string, unknown> & {
    bg: { id: string; name: string } | null;
    char: { id: string; name: string } | null;
    inspect: string;
    scene: string;
  };
  mine: () => { items: { id: string; name: string; design: Record<string, unknown> }[] };
  session: () => { hover: string | null; pressed: string | null };
  parts: () => PartInfo[];
  part: (id: string) => Promise<string | null>;
  code: () => { quickPaste: string; choiceExample: string; css: string };
  assetIds: () => Promise<string[]>;
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
  await expect(page.getByRole('heading', { level: 1, name: 'UI 框素材產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __uiFrame?: unknown }).__uiFrame);
  return errors;
}

function call<K extends keyof Hook>(
  page: Page,
  name: K,
  ...args: Parameters<Hook[K]>
): Promise<Awaited<ReturnType<Hook[K]>>> {
  return page.evaluate(
    ([n, a]) => {
      const h = (window as unknown as { __uiFrame: Record<string, (...x: unknown[]) => unknown> })
        .__uiFrame;
      return h[n as string](...(a as unknown[]));
    },
    [name, args] as const,
  ) as Promise<Awaited<ReturnType<Hook[K]>>>;
}

async function download(page: Page, action: () => Promise<unknown>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

/** PNG → 尺寸與 RGBA（透明的 PNG 一定是 RGBA） */
function png(bytes: Uint8Array) {
  const chunks = parseChunks(bytes);
  for (const c of chunks) expect(c.crcOk).toBe(true);
  const ihdr = readIhdr(chunks);
  const parts = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  const rgba =
    ihdr.colorType === 6 ? decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType) : null;
  const alpha = (x: number, y: number) => (rgba ? rgba[(y * ihdr.width + x) * 4 + 3] : 255);
  return { width: ihdr.width, height: ihdr.height, colorType: ihdr.colorType, alpha };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const stage = (page: Page) => page.getByTestId('stage-canvas');
const assetCount = (page: Page) => page.getByTestId('asset-count');

/** 1920 座標 → 螢幕座標 */
async function stagePoint(page: Page, x: number, y: number) {
  const b = (await stage(page).boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  return { x: b.x + (x / 1920) * b.width, y: b.y + (y / 1080) * b.height };
}

const stagePixels = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector('[data-testid="stage-canvas"]') as HTMLCanvasElement).toDataURL(),
  );

test('開頁：沒有錯誤、預設的內容、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  const doc = await call(page, 'doc');
  expect(doc.mode).toBe('novel');
  expect(doc.resolution).toBe(1280);
  expect(doc.base).toMatchObject({ kind: 'preset', id: 'casefile', name: '案件卷宗' });
  await expect(page.getByRole('radio', { name: '文字冒險' })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^案件卷宗/ })).toBeChecked();
  await expect(page.getByTestId('base-status')).toContainText('「案件卷宗」的原始設定');
  await expect(assetCount(page)).toHaveText('39 張 PNG');
  await expect(page.getByTestId('zip-button')).toHaveText(/下載 ZIP（39 張＋程式碼）/);
  await expect(stage(page)).toHaveAttribute('width', '1280');
  await expect(stage(page)).toHaveAttribute('height', '720');
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://novewaku-studio.pages.dev',
  );
  await expect(footer.getByRole('link')).toHaveText('KIIN／ノベワク STUDIO');
  expect(errors).toEqual([]);
});

test('兩種用途：文字欄位、素材清單、四種狀態與配置程式碼只在文字冒險（F01、F25～F27、F36、F38）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '測試文字' }).click();
  await expect(page.getByRole('textbox', { name: '角色名' })).toHaveValue('柏木 遙');
  await expect(page.getByText('按鈕的四種狀態')).toBeVisible();
  await expect(page.getByRole('button', { name: '配置程式碼' })).toBeVisible();
  await page.getByRole('radio', { name: 'TRPG・直播' }).click();
  await expect(page.getByRole('textbox', { name: '角色名' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '狀態 3' })).toHaveValue('SAN 62 / 75');
  await expect(assetCount(page)).toHaveText('5 張 PNG');
  await expect(page.getByText('按鈕的四種狀態')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '配置程式碼' })).toHaveCount(0);
  await expect(page.getByTestId('zip-button')).toHaveText(/下載 ZIP（5 張）/);
  const files5 = (await call(page, 'parts')).map((p) => p.file);
  expect(files5).toEqual([
    '01_screen_frame.png',
    '02_message_board.png',
    '03_character_frame.png',
    '04_status_badge.png',
    '05_dice_panel.png',
  ]);
  await page.getByRole('switch', { name: '文字畫進 PNG' }).click();
  await expect(assetCount(page)).toHaveText('7 張 PNG');
  /* 文字欄位：字數、單行的換行 */
  const dice = page.getByRole('textbox', { name: '骰子／資訊面板' });
  await dice.fill('理智 1D100');
  await dice.blur();
  expect((await call(page, 'doc')).texts.dice).toBe('理智 1D100');
  await page.getByRole('radio', { name: '文字冒險' }).click();
  await expect(assetCount(page)).toHaveText('39 張 PNG');
  expect(errors).toEqual([]);
});

test('世界觀預設、主色、回到原始值、復原與重做；預覽跟著變（F02～F08、F12、F45）', async ({
  page,
}) => {
  const errors = await open(page);
  const before = await stagePixels(page);
  await page.getByRole('radio', { name: /^軌道站/ }).click();
  let doc = await call(page, 'doc');
  expect(doc.base).toMatchObject({ kind: 'preset', id: 'orbital', name: '軌道站' });
  expect(doc.design).toMatchObject({ keyColor: '#2a8fd8', corner: 'round', ornament: 'circuit' });
  expect((await call(page, 'prefs')).scene).toBe('neon');
  await expect.poll(() => stagePixels(page)).not.toBe(before);
  /* 主色 */
  await page.getByRole('tab', { name: '外觀' }).click();
  const hex = page.getByRole('textbox', { name: '主色' });
  await hex.fill('#5b8def');
  await hex.press('Enter');
  doc = await call(page, 'doc');
  expect(doc.design.keyColor).toBe('#5b8def');
  /* 看不懂的色碼：Enter 或離開欄位時說明、顏色不變 */
  await hex.fill('xyz');
  await hex.press('Enter');
  await expect(page.getByText('看不懂「xyz」', { exact: false })).toBeVisible();
  await expect(hex).toHaveValue('#5b8def');
  expect((await call(page, 'doc')).design.keyColor).toBe('#5b8def');
  await hex.fill('#12');
  await hex.blur();
  await expect(page.getByText('看不懂「#12」', { exact: false })).toBeVisible();
  expect((await call(page, 'doc')).design.keyColor).toBe('#5b8def');
  /* 單一欄位回到原始值 */
  await page.getByRole('button', { name: '主色：回到原始值' }).click();
  expect((await call(page, 'doc')).design.keyColor).toBe('#2a8fd8');
  await expect(page.getByRole('button', { name: '主色：回到原始值' })).toHaveCount(0);
  await expect(page.getByText('看不懂「#12」', { exact: false })).toHaveCount(0);
  /* 推薦的主色 */
  await page.getByRole('button', { name: '主色改成 #d9648c' }).click();
  expect((await call(page, 'doc')).design.keyColor).toBe('#d9648c');
  /* 滑桿：方向鍵，按兩下回到原始值 */
  const border = page.locator('[data-range="borderWidth"]').getByRole('slider');
  await border.focus();
  await border.press('ArrowRight');
  await border.press('ArrowRight');
  expect((await call(page, 'doc')).design.borderWidth).toBe(4);
  await page.locator('[data-range="borderWidth"]').dblclick();
  expect((await call(page, 'doc')).design.borderWidth).toBe(3);
  /* 全部回到原始值 */
  await page.getByRole('tab', { name: '世界觀' }).click();
  await expect(page.getByTestId('base-status')).toContainText('以「軌道站」為底、已調整');
  await page.getByRole('button', { name: '全部回到原始值' }).click();
  doc = await call(page, 'doc');
  expect(doc.design).toEqual(doc.base.design);
  await expect(page.getByTestId('base-status')).toContainText('「軌道站」的原始設定');
  /* 復原：回到換成粉紅色、再回到預設之前 */
  await page.keyboard.press('Control+z');
  expect((await call(page, 'doc')).design.keyColor).toBe('#d9648c');
  await page.keyboard.press('Control+Shift+z');
  expect((await call(page, 'doc')).design.keyColor).toBe('#2a8fd8');
  /* 換外框形狀、四角裝飾（縮圖選項） */
  await page.getByRole('tab', { name: '外觀' }).click();
  await page.getByRole('radio', { name: '內凹', exact: true }).click();
  await page.getByRole('radio', { name: '哥德', exact: true }).click();
  await page.getByRole('radio', { name: '和紙纖維', exact: true }).click();
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  doc = await call(page, 'doc');
  expect(doc.design).toMatchObject({
    corner: 'concave',
    ornament: 'gothic',
    texture: 'washi',
    polarity: 'dark',
  });
  expect(errors).toEqual([]);
});

test('預覽：滑過與按下（拖出去就取消）、四種狀態跟著切、放大鏡（F32、F33、F36）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 第一個選項的中心（1920 座標：x 960、y 234） */
  const p = await stagePoint(page, 960, 234);
  await page.mouse.move(p.x, p.y);
  await expect(stage(page)).toHaveAttribute('data-hover', 'choice:0');
  await expect(page.getByTestId('stage-status')).toHaveText(/滑過中/);
  await expect(page.getByTestId('magnifier')).toBeVisible();
  await page.mouse.down();
  await expect(stage(page)).toHaveAttribute('data-pressed', 'choice:0');
  await expect(page.getByTestId('stage-status')).toHaveText(/按下中/);
  await page.mouse.up();
  await expect(stage(page)).toHaveAttribute('data-pressed', '');
  /* 按住拖到按鈕外：立刻取消按下（放開之前）；拖回來也不再按下 */
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect(stage(page)).toHaveAttribute('data-pressed', 'choice:0');
  const outside = await stagePoint(page, 960, 140);
  await page.mouse.move(outside.x, outside.y, { steps: 3 });
  await expect(stage(page)).toHaveAttribute('data-pressed', '');
  await expect(stage(page)).toHaveAttribute('data-hover', '');
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await expect(stage(page)).toHaveAttribute('data-hover', 'choice:0');
  await expect(stage(page)).toHaveAttribute('data-pressed', '');
  /* 拖到別的按鈕上也一樣 */
  const second = await stagePoint(page, 960, 350);
  await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  await page.mouse.down();
  await page.mouse.move(second.x, second.y, { steps: 3 });
  await expect(stage(page)).toHaveAttribute('data-hover', 'choice:1');
  await expect(stage(page)).toHaveAttribute('data-pressed', '');
  await page.mouse.up();
  /* 放大鏡：捲動頁面時收起來 */
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('magnifier')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await expect(page.getByTestId('magnifier')).toHaveCount(0);
  /* 系統按鈕 LOAD：按下後四種狀態切到 LOAD（按鈕寬 112、間隔 24，靠訊息框右邊 20） */
  const { msgW, msgH } = await page.evaluate(() => {
    const d = (
      window as unknown as {
        __uiFrame: { doc: () => { design: { msgW: number; msgH: number } } };
      }
    ).__uiFrame.doc().design;
    return { msgW: d.msgW, msgH: d.msgH };
  });
  const startX = (1920 - msgW) / 2 + msgW - 20 - (8 * 112 + 7 * 24);
  const sysY = 1080 - 40 - msgH - 14 - 40;
  const load = await stagePoint(page, startX + 136 + 56, sysY + 20);
  await page.mouse.move(load.x, load.y);
  await expect(stage(page)).toHaveAttribute('data-hover', 'sys:load');
  await page.mouse.down();
  await page.mouse.up();
  expect((await call(page, 'prefs')).inspect).toBe('load');
  const grid = page.getByTestId('state-grid');
  await expect(grid.getByRole('button')).toHaveCount(4);
  await expect(grid.getByRole('button').first()).toHaveAccessibleName(
    '存成 PNG：btn_load_normal.png',
  );
  /* 放大鏡關掉 */
  await page.getByRole('button', { name: '放大鏡' }).click();
  await page.mouse.move(p.x, p.y + 2);
  await expect(page.getByTestId('magnifier')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(stage(page)).toHaveAttribute('data-hover', '');
  expect(errors).toEqual([]);
});

test('匯出單張 PNG：素材清單、四種狀態（F36、F38）', async ({ page }) => {
  const errors = await open(page);
  const parts = await call(page, 'parts');
  const msg = await download(page, () =>
    page.locator('[data-file="data/image/uiframe/message_window.png"]').click(),
  );
  expect(msg.name).toBe('message_window.png');
  const m = png(msg.bytes);
  expect([m.width, m.height]).toEqual([1045, 208]);
  expect(m.colorType).toBe(6);
  for (const [x, y] of [
    [0, 0],
    [m.width - 1, 0],
    [0, m.height - 1],
    [m.width - 1, m.height - 1],
  ])
    expect(m.alpha(x, y)).toBe(0);
  expect(m.alpha(Math.round(m.width / 2), Math.round(m.height / 2))).toBeGreaterThan(200);
  /* 收合的群組裡的系統按鈕 */
  await page.locator('[data-group="system"] summary').click();
  const close = await download(page, () =>
    page.locator('[data-file="data/image/uiframe/system_buttons/btn_close_disabled.png"]').click(),
  );
  expect(close.name).toBe('btn_close_disabled.png');
  const info = parts.find((x) => x.id === 'sys:close:disabled') as PartInfo;
  expect([png(close.bytes).width, png(close.bytes).height]).toEqual([info.width, info.height]);
  /* 四種狀態：滑過 */
  const hover = await download(page, () =>
    page.getByTestId('state-grid').locator('[data-state="hover"]').click(),
  );
  expect(hover.name).toBe('choice_btn_hover.png');
  expect([png(hover.bytes).width, png(hover.bytes).height]).toEqual([459, 77]);
  expect(errors).toEqual([]);
});

test('ZIP：文字冒險 39 張＋程式碼，尺寸、透明、.ks 的座標與檔名對得上（F37、F39）', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  for (const res of [1280, 1920] as const) {
    if (res === 1920) await page.getByRole('radio', { name: '1920 × 1080' }).click();
    const parts = await call(page, 'parts');
    const zip = await download(page, () => page.getByTestId('zip-button').click());
    expect(zip.name).toBe(`UI框素材_文字冒險_${res}x${(res * 9) / 16}.zip`);
    const entries = unzipSync(zip.bytes);
    const names = Object.keys(entries).sort();
    const pngs = names.filter((n) => n.endsWith('.png'));
    expect(pngs).toHaveLength(39);
    expect(names).toEqual(
      [
        ...parts.map((p) => p.file),
        'Tyrano_QuickPaste.ks',
        'Choice_Example.ks',
        'data/others/uiframe/uiframe.css',
        '說明.txt',
      ].sort(),
    );
    for (const p of parts) {
      const img = png(entries[p.file]);
      expect([img.width, img.height], p.file).toEqual([p.width, p.height]);
      expect(img.alpha(0, 0), p.file).toBe(0);
    }
    /* .ks：訊息框的寬高＝PNG、用到的圖片都在 ZIP 裡 */
    const ks = strFromU8(entries['Tyrano_QuickPaste.ks']);
    const msg = parts[0];
    expect(ks).toContain(`width="${msg.width}" height="${msg.height}"`);
    expect(ks).toContain('frame="uiframe/message_window.png"');
    const used = [
      ...ks.matchAll(/(?:frame|storage|line|graphic|enterimg|activeimg)="([^"]+\.png)"/g),
    ].map((m) => `data/image/${m[1]}`);
    expect(used.length).toBeGreaterThan(25);
    for (const f of used) expect(names, f).toContain(f);
    const choice = strFromU8(entries['Choice_Example.ks']);
    const c = parts.find((p) => p.id === 'choice:normal') as PartInfo;
    expect(choice).toContain(`width="${c.width}" height="${c.height}"`);
    expect(choice).toContain('text="推開書房的門"');
    expect(strFromU8(entries['data/others/uiframe/uiframe.css'])).toContain('.uiframe_choice');
    expect(strFromU8(entries['說明.txt'])).toContain('Tyrano_QuickPaste.ks');
    /* 和頁面上的配置程式碼相同 */
    expect(ks).toBe((await call(page, 'code')).quickPaste);
  }
  expect(errors).toEqual([]);
});

test('ZIP：TRPG・直播，文字畫進 PNG 時 7 張；畫面外框中間透明（F27、F39）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page);
  await page.getByRole('radio', { name: 'TRPG・直播' }).click();
  await page.getByRole('radio', { name: '1920 × 1080' }).click();
  await page.getByRole('tab', { name: '測試文字' }).click();
  await page.getByRole('switch', { name: '文字畫進 PNG' }).click();
  const zip = await download(page, () => page.getByTestId('zip-button').click());
  expect(zip.name).toBe('UI框素材_TRPG・直播_1920x1080.zip');
  const entries = unzipSync(zip.bytes);
  expect(Object.keys(entries).sort()).toEqual(
    [
      '01_screen_frame.png',
      '02_message_board.png',
      '03_character_frame.png',
      '04_status_badge_1.png',
      '04_status_badge_2.png',
      '04_status_badge_3.png',
      '05_dice_panel.png',
      '說明.txt',
    ].sort(),
  );
  const screen = png(entries['01_screen_frame.png']);
  expect([screen.width, screen.height]).toEqual([1920, 1080]);
  expect(screen.alpha(960, 540)).toBe(0);
  expect(screen.alpha(30, 540)).toBeGreaterThan(200);
  expect(strFromU8(entries['說明.txt'])).toContain('螢幕面板');
  expect(errors).toEqual([]);
});

test('配置程式碼的對話框：三個檔、下載（F40）', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '配置程式碼' }).click();
  const dialog = page.getByRole('dialog', { name: 'TyranoScript 配置程式碼' });
  await expect(dialog).toBeVisible();
  const code = await call(page, 'code');
  await expect(dialog.getByRole('textbox')).toHaveValue(code.quickPaste);
  const ks = await download(page, () =>
    dialog.getByRole('button', { name: '下載這個檔案' }).click(),
  );
  expect(ks.name).toBe('Tyrano_QuickPaste.ks');
  expect(strFromU8(ks.bytes)).toBe(code.quickPaste);
  await dialog.getByRole('radio', { name: 'Choice_Example.ks' }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue(code.choiceExample);
  await dialog.getByRole('radio', { name: 'uiframe.css' }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue(code.css);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('我的預設：存、改名、套用、匯出 JSON、刪除、讀入、重新整理還在（F41～F44）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '存成我的預設' }).click();
  let mine = await call(page, 'mine');
  expect(mine.items).toHaveLength(1);
  expect(mine.items[0].name).toBe('案件卷宗');
  await expect(page.getByRole('textbox', { name: '改名（案件卷宗）' })).toBeVisible();
  /* 欄位的名稱跟著名稱變 */
  const nameBox = page.getByRole('textbox', { name: /^改名（/ });
  /* 名稱清空時，下載的檔名用「未命名」 */
  await nameBox.fill('');
  const unnamed = await download(page, () =>
    page.getByRole('button', { name: '匯出「未命名」' }).click(),
  );
  expect(unnamed.name).toBe('UI框預設_未命名.json');
  await nameBox.fill('我的洋館');
  await expect(page.getByTestId('base-status')).toContainText('我的預設「我的洋館」');
  /* 改外觀再套用 → 回到存的樣子 */
  await page.getByRole('radio', { name: /^社辦筆記/ }).click();
  expect((await call(page, 'doc')).design.keyColor).toBe('#3f9f78');
  await page.getByRole('button', { name: '套用「我的洋館」' }).click();
  let doc = await call(page, 'doc');
  expect(doc.design.keyColor).toBe('#9a6b3f');
  expect(doc.base).toMatchObject({ kind: 'mine', name: '我的洋館' });
  /* 匯出 JSON */
  const json = await download(page, () =>
    page.getByRole('button', { name: '匯出「我的洋館」' }).click(),
  );
  expect(json.name).toBe('UI框預設_我的洋館.json');
  const file = JSON.parse(strFromU8(json.bytes));
  expect(file.format).toBe('trpg-toolkit:ui-frame-presets');
  expect(file.presets[0]).toMatchObject({ name: '我的洋館', design: { keyColor: '#9a6b3f' } });
  /* 刪除（先確認） */
  await page.getByRole('button', { name: '刪除「我的洋館」' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /刪除/ }).click();
  expect((await call(page, 'mine')).items).toHaveLength(0);
  /* 讀入剛才的 JSON（按鈕開選檔視窗；頁面上沒有可以 Tab 到、沒有名稱的檔案欄位） */
  await expect(page.getByTestId('mine-drop').locator('input[type=file]')).toHaveCount(0);
  expect(
    await page.$$eval('input[type=file]', (els) =>
      els.filter((e) => (e as HTMLInputElement).tabIndex >= 0).map((e) => e.outerHTML),
    ),
  ).toEqual([]);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '讀入 JSON…' }).click(),
  ]);
  await chooser.setFiles({
    name: 'mine.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json.bytes),
  });
  await expect(page.getByText('已讀入 1 組我的預設', { exact: true })).toBeVisible();
  mine = await call(page, 'mine');
  expect(mine.items.map((t) => t.name)).toEqual(['我的洋館']);
  /* 重新整理：我的預設與目前的設定都還在 */
  doc = await call(page, 'doc');
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __uiFrame?: unknown }).__uiFrame);
  expect((await call(page, 'mine')).items.map((t) => t.name)).toEqual(['我的洋館']);
  expect(await call(page, 'doc')).toEqual(doc);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('預覽背景、試看的圖、截圖（F29～F31、F35）', async ({ page }) => {
  const errors = await open(page);
  const w = 64;
  const h = 48;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([200, 40, 40, 255], i * 4);
  const red = Buffer.from(await encodePng(px, w, h));
  for (let i = 0; i < w * h; i++) px.set([40, 40, 200, 255], i * 4);
  const blue = Buffer.from(await encodePng(px, w, h));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '試看背景圖' }).click(),
  ]);
  await chooser.setFiles({ name: 'red.png', mimeType: 'image/png', buffer: red });
  await expect(page.getByTestId('bg-name')).toHaveText('背景圖：red.png');
  /* 背景圖蓋滿：畫面左上角是紅色 */
  const corner = () =>
    page.evaluate(() => {
      const c = document.querySelector('[data-testid="stage-canvas"]') as HTMLCanvasElement;
      return Array.from(c.getContext('2d')!.getImageData(2, 2, 1, 1).data);
    });
  await expect.poll(corner).toEqual([200, 40, 40, 255]);
  /* 重新整理還在 */
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __uiFrame?: unknown }).__uiFrame);
  await expect(page.getByTestId('bg-name')).toHaveText('背景圖：red.png');
  await expect.poll(corner).toEqual([200, 40, 40, 255]);
  /* 截圖 */
  const shot = await download(page, () => page.getByRole('button', { name: '存成截圖' }).click());
  expect(shot.name).toBe('UI框預覽_案件卷宗_1280x720.png');
  const s = png(shot.bytes);
  expect([s.width, s.height]).toEqual([1280, 720]);
  /* 換外觀：試看背景圖留著（提醒一下） */
  const bgId = (await call(page, 'prefs')).bg?.id as string;
  expect(await call(page, 'assetIds')).toContain(bgId);
  await page.getByRole('radio', { name: /^禁書庫/ }).click();
  await expect(
    page.getByText('預覽仍顯示試看背景圖；拿掉之後會是「夜之書房」', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('bg-name')).toHaveText('背景圖：red.png');
  /* 選範例背景：拿掉試看背景圖、從資料庫刪掉，預覽換成選的背景 */
  await page.getByRole('combobox', { name: '預覽背景' }).click();
  await page.getByRole('option', { name: /透明/ }).click();
  await expect(page.getByTestId('bg-name')).toHaveCount(0);
  await expect(
    page.getByText('已拿掉試看背景圖，預覽改用「透明（檢查透明的地方）」', { exact: true }),
  ).toBeVisible();
  await expect.poll(corner).not.toEqual([200, 40, 40, 255]);
  await expect.poll(() => call(page, 'assetIds')).not.toContain(bgId);
  /* 再放一張立繪，用「拿掉試看的圖」拿掉：也從資料庫刪掉 */
  const [chooserChar] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '試看立繪' }).click(),
  ]);
  await chooserChar.setFiles({ name: 'blue.png', mimeType: 'image/png', buffer: blue });
  await expect(page.getByTestId('char-name')).toHaveText('立繪：blue.png');
  const charId = (await call(page, 'prefs')).char?.id as string;
  expect(await call(page, 'assetIds')).toContain(charId);
  await page.getByRole('button', { name: '拿掉試看的圖' }).click();
  await expect(page.getByTestId('char-name')).toHaveCount(0);
  await expect.poll(() => call(page, 'assetIds')).not.toContain(charId);
  await page.getByRole('switch', { name: '範例立繪' }).click();
  await expect.poll(corner).toEqual([0, 0, 0, 0]);
  /* 不是圖片 */
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '試看立繪' }).click(),
  ]);
  await chooser2.setFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(
    page.getByText('「a.txt」讀不出來，請用 PNG、JPEG 或 WebP。', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('匯出列：捲到頁面與預覽欄的最下面，畫面大小、ZIP、配置程式碼都還看得到（F38～F40）', async ({
  page,
}) => {
  const errors = await open(page);
  const bar = page.getByTestId('export-bar');
  await expect(bar.getByRole('radio', { name: '1280 × 720' })).toBeChecked();
  /* 匯出列在預覽的上面、素材清單在下面 */
  const order = await page.evaluate(() => {
    const ids = ['export-bar', 'stage-canvas', 'asset-list'];
    const el = ids.map((id) => document.querySelector(`[data-testid="${id}"]`) as Element);
    const before = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return [before(el[0], el[1]), before(el[1], el[2])];
  });
  expect(order).toEqual([true, true]);
  await expect(bar.getByRole('button', { name: '配置程式碼' })).toBeVisible();
  await expect(bar.getByTestId('zip-button')).toBeVisible();
  /* 展開素材清單的群組，預覽欄變長 */
  await page.locator('[data-group="system"] summary').click();
  await page.locator('[data-group="choice"] summary').click();
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const pane = document.getElementById('tool-preview') as HTMLElement;
    pane.scrollTop = pane.scrollHeight;
  });
  await expect(page.locator('[data-file$="btn_close_disabled.png"]')).toBeInViewport();
  await expect(bar.getByTestId('zip-button')).toBeInViewport();
  await expect(bar.getByRole('radio', { name: '1920 × 1080' })).toBeInViewport();
  await expect(bar.getByRole('button', { name: '配置程式碼' })).toBeInViewport();
  expect(errors).toEqual([]);
});

test('打字中直接換分頁：那筆編輯收尾，復原依序退回（F45）', async ({ page }) => {
  const errors = await open(page);
  const undo = page.getByRole('button', { name: /^復原/ });
  const typeName = async () => {
    await page.getByRole('tab', { name: '測試文字' }).click();
    const f = page.getByRole('textbox', { name: '角色名', exact: true });
    await f.click();
    await page.keyboard.press('End');
    await page.keyboard.type('ABC');
    expect((await call(page, 'doc')).texts.charName).toBe('柏木 遙ABC');
  };
  /* A：打字 → 世界觀分頁 → 換預設 → 復原兩次 */
  await typeName();
  await page.getByRole('tab', { name: '世界觀' }).click();
  await page.getByRole('radio', { name: /^軌道站/ }).click();
  expect((await call(page, 'doc')).base.id).toBe('orbital');
  await expect(undo).toBeEnabled();
  await undo.click();
  let doc = await call(page, 'doc');
  expect(doc.base.id).toBe('casefile');
  expect(doc.texts.charName).toBe('柏木 遙ABC');
  await undo.click();
  doc = await call(page, 'doc');
  expect(doc.texts.charName).toBe('柏木 遙');
  /* B：打字 → 外觀分頁 → 滑桿 → 復原兩次 */
  await typeName();
  await page.getByRole('tab', { name: '外觀' }).click();
  const slider = page.locator('[data-range="cornerSize"]').getByRole('slider');
  const before = (await call(page, 'doc')).design.cornerSize as number;
  await slider.focus();
  await slider.press('ArrowRight');
  expect((await call(page, 'doc')).design.cornerSize).toBe(before + 1);
  await slider.blur();
  await expect(undo).toBeEnabled();
  await undo.click();
  doc = await call(page, 'doc');
  expect(doc.design.cornerSize).toBe(before);
  expect(doc.texts.charName).toBe('柏木 遙ABC');
  await undo.click();
  expect((await call(page, 'doc')).texts.charName).toBe('柏木 遙');
  expect(errors).toEqual([]);
});

test('重設：外觀與文字回到預設，畫面大小不變（F46）', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('export-bar').getByRole('radio', { name: '1920 × 1080' }).click();
  await page.getByRole('radio', { name: /^點陣冒險/ }).click();
  expect((await call(page, 'doc')).base.id).toBe('retro');
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  const doc = await call(page, 'doc');
  expect(doc.base.id).toBe('casefile');
  expect(doc.resolution).toBe(1920);
  await expect(stage(page)).toHaveAttribute('width', '1920');
  expect(errors).toEqual([]);
});

test.describe('只有觸控的裝置', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('沒有放大鏡的開關與 100%／200%；說明改成點按（F33）', async ({ page }) => {
    const errors = await open(page);
    const canHover = await page.evaluate(() => matchMedia('(any-hover: hover)').matches);
    test.skip(canHover, '這個瀏覽器的觸控模擬仍回報可以滑過');
    await expect(page.getByRole('button', { name: '放大鏡' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: '100%' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: '200%' })).toHaveCount(0);
    await stage(page).tap({ position: { x: 195, y: 60 } });
    await expect(page.getByTestId('magnifier')).toHaveCount(0);
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-27T10:00:00+08:00'));
  const errors = await open(page);
  await page.mouse.move(0, 0);
  await expect(stage(page)).toHaveAttribute('data-drawn', /\d+/);
  await page.waitForTimeout(300);
  await noHorizontalScroll(page);
  await expect(page).toHaveScreenshot('ui-frame-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('ui-frame-390.png', { fullPage: true });
  await page.getByRole('radio', { name: 'TRPG・直播' }).click();
  await page.getByRole('tab', { name: '外觀' }).click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
