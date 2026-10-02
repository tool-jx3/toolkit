/**
 * 角色介紹圖產生器（建置產物）的端對端測試：
 * - 版型一覽（9 張卡、分類篩選）、進入編輯與網址、上一頁、找不到版型、頁尾只放靈感來源；
 * - 點畫布元素切換設定欄、預設文字第一次聚焦清空、條件顯示、更小的文字；
 * - 圖片格：格式拒絕、裁切視窗（輸出＝格子大小、整張放入時四周透明）、出處畫在圖上（只在有圖時）；
 * - 貼紙：加入（長邊 300、中央）、拖曳、拖出去拉回、縮放下限、旋轉、陰影、順序、Delete 刪除、輸出含貼紙不含控點；
 * - 從畫布取色（放大鏡、點一下套用、Esc 取消）；
 * - 多人資料框：新增到 4 人與 7 人（畫布大小）、只看這一張、刪除（確認）、左右移；
 * - 文字記錄：自動分頁、頁面切換、看全部（PNG 大小）、新增／刪除頁面、PDF（頁數、頁面大小、可選取的文字）；
 * - 保存：自動保存與還原通知、存檔槽（建立、改名、讀取、刪除）、編輯檔 ZIP（匯出解析、重設、讀回、別的版型拒絕）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { pdfPageTexts } from '../helpers/pdf';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('pair-maker') ?? { id: 'pair-maker', status: 'next' })}/`;
const TTC = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

/* ---------- 共用 ---------- */

async function open(page: Page, template?: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  /* PDF 用的完整字型：換成容器裡的 TTC（後登記的先比對） */
  await page.route(/fonts\.gstatic\.com\/s\/noto(serif|sans)tc\/.*\.ttf$/, (r) =>
    r.fulfill({ status: 200, contentType: 'font/ttf', body: readFileSync(TTC) }),
  );
  await page.goto(template ? `${URL}?t=${template}` : URL);
  await expect(page.getByRole('heading', { level: 1, name: '角色介紹圖產生器' })).toBeVisible();
  if (template) await expect(page.getByTestId('template-name')).toBeVisible();
  return errors;
}

const canvas = (page: Page) => page.getByTestId('pair-canvas');
const region = (page: Page, key: string) => page.locator(`[data-region="${key}"]`).first();
const heading = (page: Page) => page.getByTestId('panel-heading');
const chip = (page: Page, name: string) =>
  page.getByRole('group', { name: '輸入項目' }).getByRole('button', { name, exact: true });
const notice = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);
const stickerBtn = (page: Page) => page.locator('[data-sticker]');

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 一張純色（或中間一塊色）的 PNG */
async function png(
  w: number,
  h: number,
  rgb: [number, number, number],
  alphaBorder = false,
): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4;
      const inner =
        !alphaBorder || (x >= w / 4 && x < (w * 3) / 4 && y >= h / 4 && y < (h * 3) / 4);
      px[k] = rgb[0];
      px[k + 1] = rgb[1];
      px[k + 2] = rgb[2];
      px[k + 3] = inner ? 255 : 0;
    }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

interface Png {
  width: number;
  height: number;
  at: (x: number, y: number) => [number, number, number, number];
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

async function download(page: Page, button: Locator): Promise<Download> {
  const [dl] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return dl;
}

async function downloadPng(page: Page): Promise<{ name: string; png: Png }> {
  const dl = await download(page, page.getByRole('button', { name: '下載 PNG' }));
  return { name: dl.suggestedFilename(), png: readPng(readFileSync((await dl.path()) as string)) };
}

const near = (a: number[], b: number[], tol = 6) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

/** 選檔（pickFiles 用動態的 input） */
async function choose(page: Page, trigger: Locator, files: ReturnType<typeof file>[]) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger.click()]);
  await chooser.setFiles(files);
}

/** 畫布座標 → 螢幕座標 */
async function screenAt(page: Page, x: number, y: number) {
  const box = await canvas(page).boundingBox();
  const size = ((await canvas(page).getAttribute('data-size')) ?? '1x1').split('x').map(Number);
  if (!box) throw new Error('沒有畫布');
  return { x: box.x + (x / size[0]) * box.width, y: box.y + (y / size[1]) * box.height };
}

const placement = async (page: Page) =>
  ((await stickerBtn(page).first().getAttribute('data-placement')) ?? '').split(',').map(Number);

async function openProjectItem(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

/* ---------- 一覽 ---------- */

test('版型一覽：9 張卡、分類篩選、進入編輯與網址、上一頁、找不到版型；頁尾只放靈感來源', async ({
  page,
}) => {
  const errors = await open(page);
  const cards = page.getByRole('list', { name: '版型一覽' }).getByRole('listitem');
  await expect(cards).toHaveCount(9);
  await expect(page.locator('[data-thumb]')).toHaveCount(9);
  await page.getByRole('radio', { name: '文字' }).click();
  await expect(cards).toHaveCount(4);
  await page.getByRole('radio', { name: '全部' }).click();
  await page.getByRole('button', { name: /雙人配對・主題背景/ }).click();
  await expect(page.getByTestId('template-name')).toHaveText('雙人配對・主題背景');
  expect(page.url()).toContain('?t=duo-theme');
  /* 換版型：設定欄的選單 */
  await page.getByRole('combobox', { name: '換版型' }).click();
  await page.getByRole('option', { name: /花紋橫幅/ }).click();
  await expect(page.getByTestId('template-name')).toHaveText('花紋橫幅');
  await expect(canvas(page)).toHaveAttribute('data-size', '1500x500');
  await page.goBack();
  await expect(page.getByTestId('template-name')).toHaveText('雙人配對・主題背景');
  await page.getByRole('button', { name: '版型一覽' }).click();
  await expect(cards).toHaveCount(9);
  /* 頁尾只放靈感來源 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/baegop157902/PairMaker',
  );
  /* 找不到版型 */
  await page.goto(`${URL}?t=nope`);
  await expect(page.getByText('找不到「nope」這個版型')).toBeVisible();
  await expect(cards).toHaveCount(9);
  expect(errors).toEqual([]);
});

/* ---------- 欄位 ---------- */

test('點畫布開啟項目；預設文字第一次聚焦清空；條件顯示；更小的文字；PNG 原尺寸與檔名', async ({
  page,
}) => {
  const errors = await open(page, 'duo-sheet');
  await expect(canvas(page)).toHaveAttribute('data-size', '1920x1080');
  await region(page, 'right/name').click();
  await expect(heading(page)).toHaveText('右 名字與標語');
  await expect(page.getByRole('tab', { name: '右邊的角色' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const name = page.getByRole('textbox', { name: '名字', exact: true });
  await expect(name).toHaveValue('角色名字');
  await name.focus();
  await expect(name).toHaveValue('');
  await name.fill('艾莉絲');
  await name.blur();
  await name.fill('角色名字');
  await name.blur();
  await name.focus();
  /* 改過的欄位不再清空 */
  await expect(name).toHaveValue('角色名字');
  await expect(page.getByTestId('font-sample')).toHaveText('Character');
  /* 鍵盤：點選區是按鈕，Enter 開啟 */
  await region(page, 'left/colors').focus();
  await page.keyboard.press('Enter');
  await expect(heading(page)).toHaveText('左 髮色與瞳色');
  /* 條件顯示：背景色只在勾選背景時出現 */
  await chip(page, '頭像').click();
  await expect(page.getByText('背景色', { exact: true })).toHaveCount(0);
  await page.getByRole('switch', { name: '背景' }).click();
  await expect(page.getByText('背景色', { exact: true })).toBeVisible();
  /* 數值與輸出 */
  const { name: file1, png: out } = await downloadPng(page);
  expect(file1).toMatch(/^雙人資料卡_\d{8}-\d{4}\.png$/);
  expect([out.width, out.height]).toEqual([1920, 1080]);
  /* 背景色是 #f3f1ec，沒有選取框等標示 */
  expect(near(out.at(960, 100), [0xf3, 0xf1, 0xec])).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 圖片格 ---------- */

test('圖片格：格式拒絕、裁切輸出＝格子大小、整張放入時透明、出處只在有圖時畫', async ({ page }) => {
  const errors = await open(page, 'duo-sheet');
  await region(page, 'left/profile').click();
  await expect(heading(page)).toHaveText('左 頭像');
  /* GIF 不收 */
  await choose(page, page.getByRole('button', { name: '頭像：選擇圖片' }), [
    file('a.gif', Buffer.from('GIF89a'), 'image/gif'),
  ]);
  await expect(notice(page, '請選擇 PNG、JPG 或 WebP 檔。')).toBeVisible();
  /* 出處：還沒有圖時不畫 */
  await page.getByRole('textbox', { name: '頭像：出處' }).fill('繪師名');
  let { png: out } = await downloadPng(page);
  /* 空的格子是深灰底（中央是「＋」） */
  expect(near(out.at(400, 130), [0x3a, 0x3a, 0x40])).toBe(true);
  /* 400 × 200 的紅圖 → 圓形格 180：裁切視窗輸出 180 × 180 */
  await choose(page, page.getByRole('button', { name: '頭像：選擇圖片' }), [
    file('red.png', await png(400, 200, [220, 30, 40])),
  ]);
  const dialog = page.getByRole('dialog', { name: '裁切圖片' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('frame-output')).toHaveText('180 × 180 px');
  await dialog.getByRole('button', { name: '整張放入' }).click();
  await dialog.getByRole('button', { name: '套用' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-slot="left.profile"] img')).toBeVisible();
  ({ png: out } = await downloadPng(page));
  /* 圓心是紅色；整張放入時上下是透明的（看得到底色） */
  expect(near(out.at(460, 130), [220, 30, 40])).toBe(true);
  expect(near(out.at(460, 52), [0xf3, 0xf1, 0xec])).toBe(true);
  /* 出處畫在格子下緣（灰字白邊）：下緣那一列有非紅、非底色的像素 */
  let marks = 0;
  for (let x = 400; x < 520; x++) {
    const c = out.at(x, 40 + 180 - 14);
    if (!near(c, [220, 30, 40], 30) && !near(c, [0xf3, 0xf1, 0xec], 10)) marks++;
  }
  expect(marks).toBeGreaterThan(3);
  /* 清空圖片 */
  await page.getByRole('button', { name: '頭像：清空圖片' }).click();
  await expect(page.locator('[data-slot="left.profile"] img')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 貼紙 ---------- */

test('貼紙：加入、拖曳、拉回、縮放下限、旋轉、陰影、順序、Delete；輸出含貼紙不含控點', async ({
  page,
}) => {
  const errors = await open(page, 'duo-sheet');
  const { png: base } = await downloadPng(page);
  await page.getByRole('tab', { name: '貼紙' }).click();
  await choose(page, page.getByRole('button', { name: '加入貼紙' }), [
    file('blue.png', await png(600, 300, [30, 60, 200])),
  ]);
  await expect(notice(page, /已加入貼紙/)).toBeVisible();
  await expect(stickerBtn(page)).toHaveCount(1);
  expect(await placement(page)).toEqual([960, 540, 300, 150, 0]);
  await expect(page.getByTestId('sticker-frame')).toBeVisible();
  /* 輸出：貼紙範圍是藍色；外圍一圈與沒有貼紙時相同（選取框、控點不會畫進去） */
  let { png: out } = await downloadPng(page);
  expect(near(out.at(960, 540), [30, 60, 200])).toBe(true);
  expect(near(out.at(812, 467), [30, 60, 200])).toBe(true);
  let diff = 0;
  for (let x = 790; x <= 1130; x += 4)
    for (const y of [457, 461, 619, 623]) if (!near(out.at(x, y), base.at(x, y), 2)) diff++;
  for (let y = 445; y <= 635; y += 4)
    for (const x of [802, 806, 1114, 1118]) if (!near(out.at(x, y), base.at(x, y), 2)) diff++;
  expect(diff).toBe(0);
  /* 拖曳 */
  const c = await screenAt(page, 960, 540);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  const to = await screenAt(page, 1160, 640);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  let p = await placement(page);
  expect(Math.abs(p[0] - 1160)).toBeLessThan(4);
  expect(Math.abs(p[1] - 640)).toBeLessThan(4);
  const dragged = p;
  /* 縮放：往內拖很多 → 短邊 12；復原 */
  const se = page.locator('[data-sticker-corner="se"]');
  const sb = await se.boundingBox();
  if (!sb) throw new Error('沒有控點');
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x - 600, sb.y - 600, { steps: 6 });
  await page.mouse.up();
  p = await placement(page);
  expect(p[3]).toBe(12);
  expect(p[2]).toBe(24);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  expect(await placement(page)).toEqual(dragged);
  /* 拖到畫布外：放開時拉回到至少 16 px 在畫布內；復原 */
  const from = await screenAt(page, dragged[0], dragged[1]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const away = await screenAt(page, 2600, 640);
  await page.mouse.move(away.x, away.y, { steps: 6 });
  await page.mouse.up();
  p = await placement(page);
  expect(p[0] - p[2] / 2).toBe(1920 - 16);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  p = await placement(page);
  expect(p).toEqual(dragged);
  /* 選取並旋轉（Shift 吸附 15°） */
  await page.mouse.click(from.x, from.y);
  await expect(page.getByTestId('sticker-frame')).toBeVisible();
  const rot = await page.locator('[data-sticker-rotate]').boundingBox();
  if (!rot) throw new Error('沒有旋轉控點');
  const center = await screenAt(page, p[0], p[1]);
  await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(center.x + 200, center.y, { steps: 8 });
  await page.keyboard.up('Shift');
  await page.mouse.up();
  p = await placement(page);
  expect(p[4]).toBe(90);
  /* 方向鍵微調 */
  await page.keyboard.press('ArrowLeft');
  expect((await placement(page))[0]).toBe(p[0] - 1);
  /* 陰影、外框線、出處（設定欄） */
  await expect(page.getByTestId('sticker-detail')).toBeVisible();
  await page.getByTestId('sticker-detail').getByRole('switch', { name: '陰影' }).click();
  await page.getByTestId('sticker-detail').getByRole('switch', { name: '外框線' }).click();
  await expect(
    page.getByTestId('sticker-toolbar').getByRole('button', { name: '陰影' }),
  ).toHaveAttribute('aria-pressed', 'true');
  /* 第二張：在最上層；移到後面 */
  await choose(page, page.getByRole('button', { name: '加入貼紙' }), [
    file('green.png', await png(100, 100, [20, 180, 60])),
  ]);
  const rows = page.getByRole('list', { name: '貼紙清單（上面＝前面）' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('green.png');
  await page.getByTestId('sticker-detail').getByRole('button', { name: '移到後面' }).click();
  await expect(rows.first()).toContainText('blue.png');
  /* Delete 刪除選取的（第二張：選取中） */
  await expect(page.getByTestId('sticker-detail')).toContainText('green.png');
  await page.keyboard.press('Delete');
  await expect(stickerBtn(page)).toHaveCount(1);
  ({ png: out } = await downloadPng(page));
  expect(out.width).toBe(1920);
  expect(errors).toEqual([]);
});

/* ---------- 從畫布取色 ---------- */

test('從畫布取色：放大鏡、點一下套用、Esc 取消', async ({ page }) => {
  const errors = await open(page, 'duo-sheet');
  await region(page, 'left/colors').click();
  const hair = page.getByRole('button', { name: /髮色：選擇顏色/ });
  await hair.click();
  await page.getByRole('button', { name: '從畫布取色' }).click();
  await expect(page.getByTestId('pick-layer')).toBeVisible();
  const at = await screenAt(page, 960, 100);
  await page.mouse.move(at.x, at.y);
  await expect(page.getByTestId('pick-loupe')).toHaveAttribute('data-hex', '#f3f1ec');
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('pick-layer')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '髮色色碼' })).toHaveValue('#f3f1ec');
  /* Esc 取消：顏色不變 */
  await hair.click();
  await page.getByRole('button', { name: '從畫布取色' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pick-layer')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '髮色色碼' })).toHaveValue('#f3f1ec');
  expect(errors).toEqual([]);
});

/* ---------- 多人資料框 ---------- */

test('多人資料框：新增到 4 人、7 人（畫布大小）、只看這一張、左右移、刪除（確認）', async ({
  page,
}) => {
  const errors = await open(page, 'roster');
  await expect(canvas(page)).toHaveAttribute('data-size', '615x694');
  const add = page.getByRole('button', { name: '新增角色' });
  for (let i = 0; i < 3; i++) await add.click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1845x1390');
  await expect(page.getByRole('tab', { name: '角色 4' })).toHaveAttribute('aria-selected', 'true');
  let { png: out } = await downloadPng(page);
  expect([out.width, out.height]).toEqual([1845, 1390]);
  for (let i = 0; i < 3; i++) await add.click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1845x2084');
  /* 只看這一張（7 人以上才有）：畫面變一張卡，輸出照樣是全部 */
  await page.getByRole('button', { name: '只看這一張' }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '615x694');
  ({ png: out } = await downloadPng(page));
  expect([out.width, out.height]).toEqual([1845, 2084]);
  await page.getByRole('button', { name: '看全部' }).click();
  /* 分頁名稱不自動清空；改名後分頁跟著改 */
  await page.getByRole('tab', { name: '角色 1' }).click();
  await chip(page, '資訊').click();
  const tab = page.getByRole('textbox', { name: '分頁名稱' });
  await tab.focus();
  await expect(tab).toHaveValue('角色 1');
  await tab.fill('主角');
  await expect(page.getByRole('tab', { name: '主角' })).toBeVisible();
  /* 往右移 */
  await page.getByRole('button', { name: '往左移' }).isDisabled();
  await page.getByRole('button', { name: '往右移' }).click();
  /* 刪除（確認） */
  await page.getByRole('button', { name: '刪除這個角色' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除這個角色' }).click();
  await expect(page.getByRole('tab', { name: '主角' })).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-size', '1845x1390');
  expect(errors).toEqual([]);
});

/* ---------- 文字記錄 ---------- */

test('文字記錄：自動分頁、頁面切換、看全部、新增與刪除頁面、PDF', async ({ page }) => {
  const errors = await open(page, 'log-plain');
  await expect(canvas(page)).toHaveAttribute('data-size', '780x1080');
  await page.getByRole('tab', { name: '1p' }).click();
  await chip(page, '本文').click();
  const body = page.getByRole('textbox', { name: '本文' });
  await body.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('一二三四五六七八九十'.repeat(120));
  /* 打字中不分頁；離開本文欄才分頁 */
  await expect(page.getByTestId('page-counter')).toHaveText('1 / 1');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await expect(page.getByTestId('page-counter')).toHaveText(/^1 \/ [2-9]$/);
  const total = Number(
    ((await page.getByTestId('page-counter').textContent()) ?? '').split('/')[1],
  );
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect(page.getByTestId('page-counter')).toHaveText(`2 / ${total}`);
  await expect(page.getByRole('tab', { name: '2p' })).toHaveAttribute('aria-selected', 'true');
  /* 看全部：3 欄、頁間 10 px；PNG 跟著檢視 */
  await page.getByRole('button', { name: '看全部' }).click();
  const w = Math.min(3, total) * 790 - 10;
  const h = Math.ceil(total / 3) * 1090 - 10;
  await expect(canvas(page)).toHaveAttribute('data-size', `${w}x${h}`);
  let { png: out } = await downloadPng(page);
  expect([out.width, out.height]).toEqual([w, h]);
  /* 在總覽點一頁：回到單獨看那一頁 */
  await region(page, 'goto/1').click();
  await expect(canvas(page)).toHaveAttribute('data-size', '780x1080');
  await expect(page.getByTestId('page-counter')).toHaveText(`1 / ${total}`);
  ({ png: out } = await downloadPng(page));
  expect([out.width, out.height]).toEqual([780, 1080]);
  /* 新增頁面：在最後、切過去 */
  await page.getByTestId('page-nav').getByRole('button', { name: '新增頁面' }).click();
  await expect(page.getByTestId('page-counter')).toHaveText(`${total + 1} / ${total + 1}`);
  /* 刪除這一頁（確認） */
  await page.getByRole('button', { name: '刪除這一頁' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除這一頁' }).click();
  await expect(page.getByTestId('page-counter')).toHaveText(`${total} / ${total}`);
  /* PDF：所有頁、585 × 810 pt、文字可以選取 */
  const dl = await download(page, page.getByRole('button', { name: '下載 PDF' }));
  expect(dl.suggestedFilename()).toMatch(/^文字記錄・素面_\d{8}-\d{4}\.pdf$/);
  const pdf = await PDFDocument.load(readFileSync((await dl.path()) as string));
  expect(pdf.getPageCount()).toBe(total);
  const size = pdf.getPage(0).getSize();
  expect([Math.round(size.width), Math.round(size.height)]).toEqual([585, 810]);
  const texts = pdfPageTexts(pdf);
  expect(texts[0].text).toContain('雨後的茶館');
  expect(texts[0].text).toContain('傍晚的雨停了');
  expect(texts[1].text).toContain('一二三四五');
  expect(texts[0].text).toContain('1');
  await expect(page.getByText(`已儲存 ${total} 頁的 PDF。`)).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 保存 ---------- */

test('保存：自動保存與還原、存檔槽、編輯檔 ZIP（匯出、重設、讀回、別的版型拒絕）', async ({
  page,
}) => {
  const errors = await open(page, 'duo-sheet');
  await region(page, 'left/name').click();
  const name = page.getByRole('textbox', { name: '名字', exact: true });
  await name.fill('保存測試');
  await page.waitForTimeout(300);
  await page.reload();
  await expect(notice(page, '已載入最近一次的編輯。')).toBeVisible();
  await region(page, 'left/name').click();
  await expect(name).toHaveValue('保存測試');
  /* 圖片（給編輯檔用） */
  await region(page, 'left/profile').click();
  await choose(page, page.getByRole('button', { name: '頭像：選擇圖片' }), [
    file('red.png', await png(200, 200, [220, 30, 40])),
  ]);
  await page
    .getByRole('dialog', { name: '裁切圖片' })
    .getByRole('button', { name: '套用' })
    .click();
  await expect(page.locator('[data-slot="left.profile"] img')).toBeVisible();

  /* 存檔槽：建立、改名、讀取、刪除 */
  await openProjectItem(page, '存檔槽…');
  const slots = page.getByRole('dialog', { name: '存檔槽' });
  await slots.getByRole('button', { name: '建立新的存檔槽' }).click();
  const list = slots.getByTestId('slot-list').getByRole('listitem');
  await expect(list).toHaveCount(1);
  await expect(list.first().getByRole('textbox', { name: '存檔槽名稱' })).toHaveValue('雙人資料卡');
  await expect(list.first().getByRole('img', { name: '存檔槽的預覽' })).toBeVisible();
  await list.first().getByRole('textbox', { name: '存檔槽名稱' }).fill('第一版');
  await list.first().getByRole('textbox', { name: '存檔槽名稱' }).press('Enter');
  await slots.getByRole('button', { name: '關閉' }).first().click();
  await expect(slots).toBeHidden();
  await region(page, 'left/name').click();
  await name.fill('改過了');
  await openProjectItem(page, '存檔槽…');
  await expect(list.first().getByRole('textbox', { name: '存檔槽名稱' })).toHaveValue('第一版');
  await list.first().getByRole('button', { name: '讀取' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '讀取' }).click();
  await expect(notice(page, '已讀取存檔槽。')).toBeVisible();
  await region(page, 'left/name').click();
  await expect(name).toHaveValue('保存測試');

  /* 編輯檔：匯出 ZIP 解析 */
  await page.getByRole('button', { name: '專案' }).click();
  const zipDl = await download(page, page.getByRole('menuitem', { name: '存成專案檔…' }));
  expect(zipDl.suggestedFilename()).toMatch(/^雙人資料卡_\d{8}-\d{4}\.zip$/);
  const zipBytes = readFileSync((await zipDl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('pair-maker');
  expect(project.data.template).toBe('duo-sheet');
  expect(project.data.draft.v['left.name']).toBe('保存測試');
  const imageId = project.data.draft.images['left.profile'];
  const imageFile = Object.keys(entries).find((k) => k.startsWith(`files/${imageId}`));
  expect(imageFile).toBeTruthy();
  const cropped = readPng(entries[imageFile as string]);
  expect([cropped.width, cropped.height]).toEqual([180, 180]);

  /* 重設 → 讀回 */
  await openProjectItem(page, '重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await region(page, 'left/name').click();
  await expect(name).toHaveValue('角色名字');
  await expect(page.locator('[data-region="left/profile"]')).toBeVisible();
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '讀取' }).click(),
  ]);
  await chooser.setFiles(file('back.zip', zipBytes, 'application/zip'));
  await expect(notice(page, '已讀取編輯檔。')).toBeVisible();
  await region(page, 'left/name').click();
  await expect(name).toHaveValue('保存測試');

  /* 別的版型的編輯檔：拒絕、內容不變 */
  const other = { ...project, data: { ...project.data, template: 'roster' } };
  const otherZip = Buffer.from(zipSync({ 'project.json': strToU8(JSON.stringify(other)) }));
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '讀取' }).click(),
  ]);
  await chooser2.setFiles(file('other.zip', otherZip, 'application/zip'));
  await expect(page.getByText(/這是「多人資料卡（1～30 人）」的編輯檔/)).toBeVisible();
  await region(page, 'left/name').click();
  await expect(name).toHaveValue('保存測試');

  /* 存檔槽刪除 */
  await openProjectItem(page, '存檔槽…');
  await list.first().getByRole('button', { name: '刪除' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(list).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  const errors = await open(page, 'duo-sheet');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('pair-maker-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const t of ['duo-sheet', 'roster', 'log-duo', 'pattern-banner']) {
    await page.goto(`${URL}?t=${t}`);
    await expect(page.getByTestId('template-name')).toBeVisible();
    await noHorizontalScroll(page);
  }
  await page.goto(URL);
  await noHorizontalScroll(page);
  await page.goto(`${URL}?t=duo-sheet`);
  await expect(page.getByTestId('template-name')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('pair-maker-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
