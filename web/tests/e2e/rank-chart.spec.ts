/**
 * 排行榜產生器（建置產物 next/rank-chart/）的端對端測試（規格 docs/refactor/specs/rank-chart.md）：
 * - 開頁沒有錯誤、預設值、標題預覽、頁尾只有靈感來源；標題的組法與字數上限；
 * - 名單：新增名字、一次輸入名字、拖曳排序、刪除、換成範例、全部清空；一次加很多張照片（選檔、拖放、貼上）、壞檔；
 *   加照片 → 裁切 → 套用（取消不變）、調整裁切（回到上次的範圍）、移除照片；名字卡；
 * - 排名者照片：擺放模式、拖曳卡片／控點／照片、滑桿、重設、卡片大小；
 * - 規則與外觀：格數、說明、演出時間、比例（畫布尺寸）、配色（像素）、自訂配色；
 * - 遊戲：開始前的檢查（切分頁、焦點）、抽選、揭曉、選名次（排行榜與名次按鈕）、再確認、確定、完成、出場順序、
 *   設定鎖住、不再確認＋自動抽下一位、不要快速切換、回到設定、再玩一次、播放畫面、鍵盤；
 * - 下載：PNG（尺寸、檔名、像素）、2 倍＋附錄、WebP、沒出場的角色；
 * - 自動儲存與接著玩（抽選中重新整理直接揭曉同一位）、存的遊戲對不上時的提醒；復原／重做（遊戲中停用）；
 * - 專案檔 ZIP（內容、重設、開啟還原）、開啟原作的設定檔；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('rank-chart') ?? { id: 'rank-chart', status: 'next' })}/`;
const GAME = 'trpg-toolkit:rank-chart:preview';

test.use({ viewport: { width: 1280, height: 900 } });

type Rgba = [number, number, number, number];
const RED: Rgba = [200, 40, 40, 255];
const BLUE: Rgba = [40, 80, 200, 255];
const GREEN: Rgba = [40, 160, 60, 255];
const YELLOW: Rgba = [230, 200, 40, 255];
const hex = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const near = (a: number[], b: number[], tol = 6) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

interface Character {
  id: string;
  name: string;
  photo: { id: string; width: number; height: number } | null;
  thumb: string | null;
  crop: { zoom: number; x: number; y: number };
}
interface Config {
  name: string;
  intro: string;
  subject: string;
  question: string;
  slots: number;
  spinMs: number;
  confirmRank: boolean;
  autoNext: boolean;
  reducedMotion: boolean;
  format: string;
  theme: string;
  customTheme: Record<string, string>;
  portrait: { photo: { id: string } | null; fit: string; zoom: number; x: number; y: number };
  overlay: { x: number; y: number; size: number };
  characters: Character[];
}
interface Run {
  deck: string[];
  ranks: ({ id: string; drawIndex: number } | null)[];
  turn: number;
  phase: string;
  pending: number | null;
}

/* ---------- 共用 ---------- */

/** 四個象限四種顏色的測試照片 */
async function quadPng(w = 400, h = 300): Promise<Buffer> {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = x < w / 2 ? (y < h / 2 ? RED : GREEN) : y < h / 2 ? BLUE : YELLOW;
      px.set(c, (y * w + x) * 4);
    }
  return Buffer.from(await encodePng(px, w, h));
}

const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

/** 可重設的亂數（取代 crypto.getRandomValues，讓出場順序固定） */
const SEEDED = () => {
  let s = 1;
  (window as unknown as { __seed: (n: number) => void }).__seed = (n: number) => {
    s = n >>> 0;
  };
  const orig = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (<T extends ArrayBufferView | null>(arr: T): T => {
    if (!(arr instanceof Uint32Array)) return orig(arr as never) as T;
    for (let i = 0; i < arr.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      arr[i] = s;
    }
    return arr;
  }) as typeof crypto.getRandomValues;
};

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.addInitScript(SEEDED);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '排行榜產生器' })).toBeVisible();
  return errors;
}

const config = (page: Page): Promise<Config> =>
  page.evaluate(() =>
    (window as unknown as { __rankChart: { config: () => Config } }).__rankChart.config(),
  );
const run = (page: Page): Promise<Run | null> =>
  page.evaluate(() =>
    (window as unknown as { __rankChart: { run: () => Run | null } }).__rankChart.run(),
  );
const patch = (page: Page, p: Partial<Config>) =>
  page.evaluate(
    (p) =>
      (window as unknown as { __rankChart: { patch: (p: unknown) => void } }).__rankChart.patch(p),
    p,
  );
const savedRun = (page: Page): Promise<Run | null> =>
  page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? 'null')?.state?.data?.run ?? null,
    GAME,
  );

const canvas = (page: Page) => page.getByTestId('rank-canvas');
const main = (page: Page) => page.getByTestId('main-action');
const statusText = (page: Page) => page.getByTestId('status-text');
const tab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text).first();
const rows = (page: Page) => page.getByTestId('character-row');
const choices = (page: Page) => page.getByRole('group', { name: '選擇名次' });
const hotspot = (page: Page, i: number) => page.locator(`[data-region="rank:${i}"]`);
const dropInput = (page: Page) =>
  page.getByRole('group', { name: '加入角色照片' }).locator('input[type=file]');

/** 預覽畫布上一點的顏色 */
async function pixel(page: Page, x: number, y: number): Promise<Rgba> {
  return canvas(page).evaluate(
    (el, [x, y]) => {
      const d = (el as HTMLCanvasElement).getContext('2d')?.getImageData(x, y, 1, 1).data;
      return [d?.[0] ?? 0, d?.[1] ?? 0, d?.[2] ?? 0, d?.[3] ?? 0] as [
        number,
        number,
        number,
        number,
      ];
    },
    [x, y],
  );
}

/** 名次列的位置（畫布座標，data-rows） */
async function rowRects(page: Page): Promise<number[][]> {
  const raw = (await canvas(page).getAttribute('data-rows')) ?? '';
  return raw.split(';').map((r) => r.split(',').map(Number));
}

/** 開始前把演出時間縮短、不輪流換圖（測試快、結果固定）；之後重設亂數種子 */
async function quick(page: Page, extra: Partial<Config> = {}) {
  await patch(page, { spinMs: 1000, reducedMotion: true, ...extra });
  await page.evaluate(() => (window as unknown as { __seed: (n: number) => void }).__seed(12345));
}

async function waitRevealed(page: Page) {
  await expect(main(page)).toHaveText(/請選擇名次|確定為第/, { timeout: 8000 });
}

/** 一路玩完：依序點 picks 的名次（再確認時再按確定） */
async function playAll(page: Page, picks: number[], confirm = true) {
  await main(page).click();
  for (let t = 0; t < picks.length; t++) {
    await waitRevealed(page);
    await hotspot(page, picks[t]).click();
    if (confirm) await main(page).click();
    if (t < picks.length - 1) {
      await expect(main(page)).toHaveText('抽下一位 →');
      await main(page).click();
    }
  }
  await expect(main(page)).toHaveText('下載 PNG');
}

interface Png {
  width: number;
  height: number;
  at: (x: number, y: number) => Rgba;
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

async function download(page: Page, button: Locator) {
  const [dl] = await Promise.all([page.waitForEvent('download'), button.click()]);
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

async function openProjectItem(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name }).click();
}

/* ---------- 開頁、標題 ---------- */

test('開頁：沒有錯誤、預設值、標題預覽、預覽尺寸、頁尾只有靈感來源（F01～F07、F19、F34、F35、F53、F59、F73）', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(canvas(page)).toHaveAttribute('data-size', '1080x1350');
  await expect(page.getByTestId('size-badge')).toHaveText('1080 × 1350');
  await expect(page.getByTestId('stage-heading')).toContainText('排行榜預覽');
  await expect(page.getByTestId('stage-heading')).toContainText('LIVE PREVIEW');
  await expect(page.getByRole('textbox', { name: '排名的人' })).toHaveValue('小明');
  await expect(page.getByRole('textbox', { name: '名字後面的文字' })).toHaveValue('的盲選排行');
  await expect(page.getByRole('textbox', { name: '主題（對象、作品、團體）' })).toHaveValue(
    '○○○○ 登場角色',
  );
  await expect(page.getByRole('textbox', { name: '最後的問題' })).toHaveValue('能交往嗎？');
  await expect(page.getByTestId('title-preview')).toContainText(
    '小明的盲選排行○○○○ 登場角色能交往嗎？',
  );
  await expect(page.getByTestId('status-eyebrow')).toHaveText('READY TO PICK');
  await expect(statusText(page)).toHaveText('會抽到哪個角色呢？');
  await expect(page.getByTestId('status-help')).toHaveText('10 位中出場 6 位 · 下一位是誰是祕密。');
  await expect(main(page)).toHaveText('開始 →');
  await expect(page.getByTestId('lock-notice')).toHaveCount(0);
  const c = await config(page);
  expect(c).toMatchObject({
    slots: 6,
    spinMs: 1800,
    confirmRank: true,
    autoNext: false,
    format: '4:5',
    theme: 'cream',
  });
  expect(c.characters.map((ch) => ch.name)).toEqual([
    '承恩',
    '語晴',
    '宥廷',
    '子芸',
    '品睿',
    '詠晴',
    '柏宇',
    '芯妤',
    '睿哲',
    '心悅',
  ]);
  /* 名次列（標題各一行）：與原作相同的版面 */
  const r = await rowRects(page);
  expect(r).toHaveLength(6);
  expect(r[0][0]).toBe(50);
  expect(r[0][1]).toBeCloseTo(363.2, 1);
  expect(r[0][3]).toBeCloseTo(141.47, 1);
  /* 背景是奶油玫瑰 */
  expect(near(await pixel(page, 5, 5), hex('#fbf7ef'), 1)).toBe(true);
  /* 名單與規則 */
  await tab(page, /角色名單/).click();
  await expect(page.getByTestId('pool-count')).toHaveText('10 位');
  await expect(page.getByTestId('pool-stat')).toContainText('10 / 120 位');
  await expect(rows(page)).toHaveCount(10);
  await tab(page, /規則與外觀/).click();
  await expect(page.getByRole('spinbutton', { name: '名次格數' })).toHaveValue('6');
  await expect(page.getByTestId('selection-info')).toHaveText(
    '10 位中只會出場 6 位。其他 4 位不會出現在排行榜上。',
  );
  /* 頁尾只有靈感來源；沒有原作者的帳號連結 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/would-you-rank',
  );
  await expect(page.locator('a[href*="x.com"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('標題：即時預覽、英數字與中文之間自動空格、字數以字元計、空白時的替代字（F01～F07）', async ({
  page,
}) => {
  const errors = await open(page);
  const name = page.getByRole('textbox', { name: '排名的人' });
  const intro = page.getByRole('textbox', { name: '名字後面的文字' });
  await name.fill('Kim');
  await expect(page.getByTestId('title-preview')).toContainText('Kim 的盲選排行');
  await intro.fill('presents');
  await expect(page.getByTestId('title-preview')).toContainText('Kim presents');
  await name.fill('小明');
  await intro.fill(' 出題');
  await expect(page.getByTestId('title-preview')).toContainText('小明 出題');
  await name.fill('😀'.repeat(35));
  await expect(name).toHaveAttribute('data-count', '30');
  expect(Array.from((await config(page)).name)).toHaveLength(30);
  await page.getByRole('textbox', { name: '最後的問題' }).fill('');
  await name.fill('');
  await page.getByRole('textbox', { name: '主題（對象、作品、團體）' }).fill('');
  const preview = page.getByTestId('title-preview');
  await expect(preview).toContainText('我 出題角色');
  await expect(preview.locator('p')).toHaveCount(3);
  expect(errors).toEqual([]);
});

/* ---------- 名單 ---------- */

test('名單：新增名字、一次輸入名字、名稱去空白、拖曳排序、刪除、換成範例、全部清空、空名單（F19～F24、F29～F33、F79）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, /角色名單/).click();
  await page.getByRole('button', { name: '新增名字' }).click();
  await expect(rows(page)).toHaveCount(11);
  const last = page.getByRole('textbox', { name: '第 11 位的名稱' });
  await expect(last).toBeFocused();
  await expect(last).toHaveValue('角色 11');
  await page.keyboard.type('  阿光  ');
  await last.blur();
  await expect(last).toHaveValue('阿光');
  /* 一次輸入名字 */
  await page.getByRole('button', { name: '一次輸入名字' }).click();
  const dlg = page.getByRole('dialog', { name: '一次輸入名字' });
  await dlg.getByRole('button', { name: '加入' }).click();
  await expect(dlg.getByRole('alert')).toHaveText('請一行輸入一個名字。');
  await dlg.getByRole('textbox').fill(' 小雨 \n\n  \n小風');
  await dlg.getByRole('button', { name: '加入' }).click();
  await expect(toast(page, '已加入 2 位。')).toBeVisible();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('pool-count')).toHaveText('13 位');
  expect((await config(page)).characters.slice(-2).map((c) => c.name)).toEqual(['小雨', '小風']);
  /* 超過 120 位 */
  await page.getByRole('button', { name: '一次輸入名字' }).click();
  await dlg.getByRole('textbox').fill(Array.from({ length: 108 }, (_, i) => `n${i}`).join('\n'));
  await dlg.getByRole('button', { name: '加入' }).click();
  await expect(dlg.getByRole('alert')).toHaveText('最多 120 位，還可以再加 107 位。');
  await dlg.getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('pool-count')).toHaveText('13 位');
  /* 刪除 */
  await page.getByRole('button', { name: '刪除：小雨' }).click();
  await expect(page.getByTestId('pool-count')).toHaveText('12 位');
  /* 拖曳排序（F79）：第 1 位拖到第 3 位之後；一次拖曳一步復原 */
  const items = page.getByRole('list', { name: '角色名單' }).getByRole('listitem');
  const names = async () => (await config(page)).characters.slice(0, 3).map((c) => c.name);
  expect(await names()).toEqual(['承恩', '語晴', '宥廷']);
  await items.nth(2).scrollIntoViewIfNeeded();
  await items.nth(0).scrollIntoViewIfNeeded();
  const src = (await items.nth(0).boundingBox()) as { x: number; y: number; height: number };
  const dst = (await items.nth(2).boundingBox()) as { x: number; y: number; height: number };
  await page.mouse.move(src.x + 20, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(src.x + 20, src.y + src.height / 2 + 8, { steps: 2 });
  await page.mouse.move(dst.x + 20, dst.y + dst.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(names).toEqual(['語晴', '宥廷', '承恩']);
  await page.keyboard.press('Control+z');
  await expect.poll(names).toEqual(['承恩', '語晴', '宥廷']);
  /* 全部清空（確認） */
  await page.getByRole('button', { name: '全部清空' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '全部清空' }).click();
  await expect(page.getByText('還沒有角色，請新增名字或加入照片。')).toBeVisible();
  await expect(page.getByTestId('pool-count')).toHaveText('0 位');
  /* 換成範例（確認）；標題不變 */
  await page.getByRole('button', { name: '換成範例名單' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '換成範例' }).click();
  await expect(page.getByTestId('pool-count')).toHaveText('10 位');
  expect((await config(page)).name).toBe('小明');
  expect(errors).toEqual([]);
});

test('照片：一次加很多張（選檔、拖放到視窗、貼上）、檔名當名稱、不是圖片與壞檔的訊息（F21、F78）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, /角色名單/).click();
  await page.getByRole('button', { name: '全部清空' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '全部清空' }).click();
  await dropInput(page).setInputFiles([
    file('阿光.png', await quadPng()),
    file('broken.png', Buffer.from('nope')),
    file('小雨.final.png', await quadPng(300, 500)),
  ]);
  await expect(toast(page, '已加入 2 張照片。需要時可以重新裁切。')).toBeVisible();
  await expect(toast(page, '有些照片無法加入')).toBeVisible();
  await expect(page.getByRole('region', { name: /^通知/ })).toContainText('無法讀取「broken.png」');
  let c = await config(page);
  expect(c.characters.map((ch) => ch.name)).toEqual(['阿光', '小雨.final']);
  expect(c.characters[0].photo).toMatchObject({ width: 400, height: 300 });
  expect(c.characters[0].thumb).toBeTruthy();
  await expect(rows(page).first()).toContainText('照片 · 512 × 512');
  /* 拖放到視窗任何地方 */
  const png = (await quadPng(200, 200)).toString('base64');
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, png);
  await expect(page.getByTestId('pool-count')).toHaveText('3 位');
  /* 貼上 */
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, png);
  await expect(page.getByTestId('pool-count')).toHaveText('4 位');
  c = await config(page);
  expect(c.characters.map((ch) => ch.name)).toEqual(['阿光', '小雨.final', 'dropped', 'pasted']);
  /* 不是圖片 */
  await dropInput(page).setInputFiles(file('notes.txt', Buffer.from('hi'), 'text/plain'));
  await expect(toast(page, '「notes.txt」不是圖片檔。')).toBeVisible();
  await expect(page.getByTestId('pool-count')).toHaveText('4 位');
  expect(errors).toEqual([]);
});

test('裁切：加照片 → 裁切 → 套用（取消不變）、調整裁切回到上次的範圍、換照片、移除照片、名字卡（F23、F25～F28）', async ({
  page,
}) => {
  const errors = await open(page);
  await quick(page, { slots: 1, confirmRank: false });
  /* 只留第一位（一格就一定是他出場） */
  await patch(page, { characters: (await config(page)).characters.slice(0, 1) });
  await tab(page, /角色名單/).click();
  /* 加照片 → 取消：名單不變 */
  let [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '加照片：承恩' }).click(),
  ]);
  await chooser.setFiles(file('q.png', await quadPng()));
  const dlg = page.getByRole('dialog', { name: '裁切：承恩' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('spinbutton', { name: '寬' })).toHaveValue('300');
  await dlg.getByRole('button', { name: '取消' }).click();
  expect((await config(page)).characters[0].photo).toBeNull();
  /* 加照片 → 改範圍（靠左）→ 套用 */
  [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '加照片：承恩' }).click(),
  ]);
  await chooser.setFiles(file('q.png', await quadPng()));
  await expect(dlg.getByRole('spinbutton', { name: 'X' })).toHaveValue('50');
  await dlg.getByRole('spinbutton', { name: 'X' }).fill('0');
  await dlg.getByRole('spinbutton', { name: 'X' }).press('Enter');
  await expect(dlg.getByTestId('crop-preview')).toBeVisible();
  await dlg.getByRole('button', { name: '套用' }).click();
  await expect(dlg).toHaveCount(0);
  /* 套用：做好裁切圖（非同步）才換上 */
  await expect.poll(async () => (await config(page)).characters[0].thumb).toBeTruthy();
  let ch = (await config(page)).characters[0];
  expect(ch.photo).toMatchObject({ width: 400, height: 300 });
  expect(ch.crop).toEqual({ zoom: 1, x: 1, y: 0 });
  await expect(rows(page).first()).toContainText('照片 · 512 × 512');
  /* 放進名次後看圖：裁切從最左邊開始 → 左上紅、右上藍（300 寬裡的 200～300） */
  await main(page).click();
  await waitRevealed(page);
  await hotspot(page, 0).click();
  await expect(main(page)).toHaveText('下載 PNG');
  const [x, y, , h] = (await rowRects(page))[0];
  const pad = Math.max(6, Math.min(13, h * 0.1));
  const s = Math.min(108, h - pad * 2);
  const ix = x + 48 + pad;
  const iy = y + pad;
  expect(near(await pixel(page, Math.round(ix + s * 0.2), Math.round(iy + s * 0.2)), RED, 12)).toBe(
    true,
  );
  expect(
    near(await pixel(page, Math.round(ix + s * 0.85), Math.round(iy + s * 0.2)), BLUE, 12),
  ).toBe(true);
  expect(
    near(await pixel(page, Math.round(ix + s * 0.2), Math.round(iy + s * 0.8)), GREEN, 12),
  ).toBe(true);
  await page.getByRole('button', { name: '回到設定' }).click();
  /* 調整裁切：回到上次的範圍；放大 2 倍置中 */
  await page.getByRole('button', { name: '調整裁切：承恩' }).click();
  await expect(dlg.getByRole('spinbutton', { name: 'X' })).toHaveValue('0');
  await dlg.getByRole('spinbutton', { name: '寬' }).fill('150');
  await dlg.getByRole('spinbutton', { name: '寬' }).press('Enter');
  await dlg.getByRole('spinbutton', { name: 'X' }).fill('125');
  await dlg.getByRole('spinbutton', { name: 'X' }).press('Enter');
  await dlg.getByRole('spinbutton', { name: 'Y' }).fill('75');
  await dlg.getByRole('spinbutton', { name: 'Y' }).press('Enter');
  await dlg.getByRole('button', { name: '套用' }).click();
  await expect.poll(async () => (await config(page)).characters[0].crop.zoom).toBeCloseTo(2, 5);
  ch = (await config(page)).characters[0];
  expect(ch.crop.zoom).toBeCloseTo(2, 5);
  expect(ch.crop.x).toBeCloseTo(0, 5);
  expect(ch.crop.y).toBeCloseTo(0, 5);
  /* 換照片：新的照片、裁切回到置中 */
  [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '換照片：承恩' }).click(),
  ]);
  await chooser.setFiles(file('tall.png', await quadPng(300, 500)));
  await expect(dlg.getByRole('spinbutton', { name: 'Y' })).toHaveValue('100');
  await dlg.getByRole('button', { name: '套用' }).click();
  await expect.poll(async () => (await config(page)).characters[0].photo?.height).toBe(500);
  ch = (await config(page)).characters[0];
  expect(ch.photo).toMatchObject({ width: 300, height: 500 });
  expect(ch.crop).toEqual({ zoom: 1, x: 0, y: 0 });
  /* 移除照片：名字卡 */
  await page.getByRole('button', { name: '移除照片：承恩' }).click();
  ch = (await config(page)).characters[0];
  expect(ch).toMatchObject({ photo: null, thumb: null, crop: { zoom: 1, x: 0, y: 0 } });
  await expect(rows(page).first()).toContainText('名字卡 · 可以加照片');
  /* 名字卡：淺灰底（#dddddd）、右上的灰圓（#c9c9c9） */
  await main(page).click();
  await waitRevealed(page);
  await hotspot(page, 0).click();
  await expect(main(page)).toHaveText('下載 PNG');
  expect(
    near(await pixel(page, Math.round(ix + 4), Math.round(iy + s * 0.5)), hex('#dddddd'), 3),
  ).toBe(true);
  expect(
    near(
      await pixel(page, Math.round(ix + s * 0.85), Math.round(iy + s * 0.12)),
      hex('#c9c9c9'),
      3,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 排名者照片與卡片 ---------- */

test('排名者照片：擺放模式、拖曳卡片／控點／照片、滑桿、重設、移除；卡片大小（F08～F18）', async ({
  page,
}) => {
  const errors = await open(page);
  /* 沒有照片時卡片置中；卡片大小 */
  await expect(page.getByTestId('card-size-info')).toHaveText('圖片 297 × 297 px');
  await page.getByRole('spinbutton', { name: '抽選卡片大小' }).fill('90');
  await page.getByRole('spinbutton', { name: '抽選卡片大小' }).press('Enter');
  expect((await config(page)).overlay.size).toBeCloseTo(0.9);
  await expect(page.getByTestId('card-size-info')).toHaveText('圖片 461 × 461 px');
  await page.getByRole('button', { name: '預設大小' }).click();
  expect((await config(page)).overlay.size).toBeCloseTo(0.58);
  await expect(page.getByTestId('placement-toggle')).toHaveCount(0);
  /* 放照片：進入擺放模式 */
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '放照片' }).click(),
  ]);
  await chooser.setFiles(file('me.png', await quadPng(1200, 900)));
  await expect(page.getByTestId('placement-layer')).toBeVisible();
  await expect(toast(page, /拖曳卡片/)).toBeVisible();
  await expect(page.getByTestId('stage-caption')).toHaveText(
    '拖曳卡片：移動 · 右下角：大小 · 拖卡片以外的照片：調整照片',
  );
  let c = await config(page);
  expect(c.portrait).toMatchObject({ fit: 'cover', zoom: 1, x: 0, y: 0 });
  expect(c.portrait.photo).toBeTruthy();
  await expect(page.getByTestId('placement-outline')).toHaveAttribute(
    'data-box',
    '626,414,297,365',
  );
  /* 拖曳（畫布座標 → 螢幕座標） */
  const layer = page.getByTestId('placement-layer');
  const drag = async (a: [number, number], b: [number, number]) => {
    const r = await layer.boundingBox();
    if (!r) throw new Error('layer');
    const p = (x: number, y: number) =>
      [r.x + (x / 1080) * r.width, r.y + (y / 1350) * r.height] as const;
    await page.mouse.move(...p(...a));
    await page.mouse.down();
    await page.mouse.move(...p(...b), { steps: 6 });
    await page.mouse.up();
  };
  await drag([774, 600], [834, 750]);
  c = await config(page);
  expect(c.overlay.x).toBeCloseTo(0.85079, 3);
  expect(c.overlay.y).toBeCloseTo(0.41249, 3);
  const [bx, by, bs, bh] = (
    (await page.getByTestId('placement-outline').getAttribute('data-box')) ?? ''
  )
    .split(',')
    .map(Number);
  await drag([bx + bs + 5, by + bh + 5], [bx + bs - 75, by + bh - 40]);
  c = await config(page);
  expect(c.overlay.size).toBeCloseTo(0.42375, 3);
  expect(c.overlay.x).toBeCloseTo(0.57967, 2);
  await drag([530, 1240], [600, 1180]);
  c = await config(page);
  expect(c.portrait.x).toBeCloseTo(0.20396, 3);
  expect(c.portrait.y).toBe(0);
  /* 一次拖曳＝一步復原 */
  await page.keyboard.press('Control+z');
  expect((await config(page)).portrait.x).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  /* 滑桿：擺法換了位置歸零、放大、位置 */
  await page.getByRole('radio', { name: '完整顯示' }).click();
  c = await config(page);
  expect(c.portrait).toMatchObject({ fit: 'contain', x: 0, y: 0 });
  await page.getByRole('spinbutton', { name: '照片放大' }).fill('2.5');
  await page.getByRole('spinbutton', { name: '照片放大' }).press('Enter');
  await page.getByRole('spinbutton', { name: '照片左右位置' }).fill('-40');
  await page.getByRole('spinbutton', { name: '照片左右位置' }).press('Enter');
  await page.getByRole('spinbutton', { name: '卡片縱向位置' }).fill('100');
  await page.getByRole('spinbutton', { name: '卡片縱向位置' }).press('Enter');
  c = await config(page);
  expect(c.portrait).toMatchObject({ zoom: 2.5, x: -0.4 });
  expect(c.overlay.y).toBe(1);
  /* 重設擺放 */
  await page.getByRole('button', { name: '重設擺放' }).click();
  c = await config(page);
  expect(c.overlay).toEqual({ x: 0.5, y: 0.06, size: 0.58 });
  expect(c.portrait).toMatchObject({ fit: 'contain', zoom: 1, x: 0, y: 0 });
  /* 擺放完成 → 名次的點選層 */
  await page.getByTestId('placement-toggle').click();
  await expect(page.getByTestId('placement-layer')).toHaveCount(0);
  await expect(page.getByTestId('stage-caption')).toHaveText(
    '還沒出場的角色是祕密。名次一旦確定就不能改。',
  );
  /* 移除照片 */
  await page.getByRole('button', { name: '移除照片' }).click();
  expect((await config(page)).portrait.photo).toBeNull();
  await expect(page.getByTestId('placement-toggle')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 規則與外觀 ---------- */

test('規則與外觀：格數與說明、演出時間、開關、比例（畫布尺寸）、配色（像素）、自訂配色（F34～F43）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, /規則與外觀/).click();
  const slots = page.getByRole('spinbutton', { name: '名次格數' });
  await slots.fill('10');
  await slots.press('Enter');
  await expect(page.getByTestId('selection-info')).toHaveText(
    '10 位中只會出場 10 位。每位角色都會出場一次。',
  );
  await slots.fill('12');
  await slots.press('Enter');
  await expect(page.getByTestId('selection-info')).toHaveText(
    '角色不夠，請增加角色或減少名次格數。',
  );
  await slots.fill('30');
  await slots.press('Enter');
  expect((await config(page)).slots).toBe(20);
  await expect(canvas(page)).toHaveAttribute('data-rows', /;.*;.*/);
  expect(await rowRects(page)).toHaveLength(20);
  await slots.fill('6');
  await slots.press('Enter');
  await page.getByRole('combobox', { name: '抽選演出時間' }).click();
  await page.getByRole('option', { name: '心跳加速 · 2.8 秒' }).click();
  expect((await config(page)).spinMs).toBe(2800);
  await page.getByRole('switch', { name: '確定名次前再確認一次' }).click();
  await page.getByRole('switch', { name: '確定後自動抽下一位' }).click();
  await page.getByRole('switch', { name: '不要快速切換圖片' }).click();
  let c = await config(page);
  expect(c).toMatchObject({ confirmRank: false, autoNext: true, reducedMotion: true });
  /* 比例 */
  await page.getByRole('combobox', { name: '圖片比例' }).click();
  await page.getByRole('option', { name: /9:16/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1080x1920');
  await expect(page.getByTestId('size-badge')).toHaveText('1080 × 1920');
  await page.getByRole('combobox', { name: '圖片比例' }).click();
  await page.getByRole('option', { name: /1:1/ }).click();
  await expect(canvas(page)).toHaveAttribute('data-size', '1080x1080');
  /* 配色 */
  await page.locator('[data-theme-id="midnight"]').click();
  await expect(page.locator('[data-theme-id="midnight"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => near(await pixel(page, 5, 5), hex('#1c252b'), 1)).toBe(true);
  await page.locator('[data-theme-id="lilac"]').click();
  await expect.poll(async () => near(await pixel(page, 5, 5), hex('#f3effa'), 1)).toBe(true);
  /* 自訂配色：改一個顏色就切到自訂 */
  await page.getByRole('button', { name: '自訂配色' }).click();
  const bg = page.getByRole('textbox', { name: '背景', exact: true });
  await bg.fill('#102030');
  await bg.press('Enter');
  c = await config(page);
  expect(c.theme).toBe('custom');
  expect(c.customTheme.bg).toBe('#102030');
  expect(c.customTheme.accent).toBe('#df5670');
  await expect.poll(async () => near(await pixel(page, 5, 5), [16, 32, 48], 1)).toBe(true);
  expect(errors).toEqual([]);
});

/* ---------- 遊戲 ---------- */

test('開始前的檢查：錯誤訊息、切到對應的分頁、焦點移到要改的欄位（F44）', async ({ page }) => {
  const errors = await open(page);
  await patch(page, { name: ' ' });
  await main(page).click();
  await expect(toast(page, '請輸入排名的人的名字。')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '排名的人' })).toBeFocused();
  await patch(page, { name: '小明', subject: '' });
  await tab(page, /規則與外觀/).click();
  await main(page).click();
  await expect(toast(page, '請輸入主題（對象、作品或團體）。')).toBeVisible();
  await expect(tab(page, /主題與排名者/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: '主題（對象、作品、團體）' })).toBeFocused();
  await patch(page, { subject: 'X' });
  const c = await config(page);
  await patch(page, {
    characters: c.characters.map((ch, i) => (i === 2 ? { ...ch, name: '' } : ch)),
  });
  await main(page).click();
  await expect(toast(page, '每位角色都要有名稱。')).toBeVisible();
  await expect(tab(page, /角色名單/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: '第 3 位的名稱' })).toBeFocused();
  await patch(page, { characters: c.characters, slots: 11 });
  await main(page).click();
  await expect(toast(page, '名次格數不能比角色人數多。')).toBeVisible();
  await expect(tab(page, /規則與外觀/)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('spinbutton', { name: '名次格數' })).toBeFocused();
  await patch(page, { characters: [] });
  await main(page).click();
  await expect(toast(page, '請至少放進一位角色。')).toBeVisible();
  expect(await run(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('遊戲：抽選 → 揭曉 → 選名次（排行榜／按鈕）→ 再確認 → 確定 → … → 完成；出場順序、設定鎖住、復原停用（F45～F55、F60、F77）', async ({
  page,
}) => {
  const errors = await open(page);
  await quick(page);
  await main(page).click();
  await expect(page.getByTestId('stage-heading')).toContainText('盲選排行');
  await expect(main(page)).toHaveText('抽選中…');
  await expect(main(page)).toBeDisabled();
  await expect(statusText(page)).toHaveText('正在抽角色…');
  await expect(page.getByTestId('appearance-order')).toHaveText('等待第一位角色出場。');
  await waitRevealed(page);
  const r0 = (await run(page)) as Run;
  expect(r0.deck).toHaveLength(6);
  expect(new Set(r0.deck).size).toBe(6);
  const c = await config(page);
  const nameOf = (id: string) => c.characters.find((ch) => ch.id === id)?.name ?? '';
  /* 種子 12345：出場順序固定 */
  expect(r0.deck.map(nameOf)).toEqual(['心悅', '詠晴', '品睿', '宥廷', '語晴', '承恩']);
  await expect(page.getByTestId('status-eyebrow')).toHaveText('PICK 01 / 06');
  await expect(statusText(page)).toHaveText(`${nameOf(r0.deck[0])}，要排第幾名？`);
  await expect(page.getByTestId('appearance-order')).toHaveText(nameOf(r0.deck[0]));
  /* 設定鎖住、復原停用 */
  await expect(page.getByTestId('lock-notice')).toContainText('確定的名次不能更改。');
  await expect(page.getByRole('textbox', { name: '排名的人' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  await tab(page, /角色名單/).click();
  await expect(page.getByRole('button', { name: '新增名字' })).toBeDisabled();
  /* 名次按鈕：5 欄 */
  await expect(choices(page).getByRole('button')).toHaveCount(6);
  await expect(hotspot(page, 0)).toBeVisible();
  /* 排行榜上點第 3 名 → 待確定；再改成按鈕的第 2 名 */
  await hotspot(page, 2).click();
  await expect(statusText(page)).toHaveText(`${nameOf(r0.deck[0])} → 放在第 3 名？`);
  await expect(main(page)).toHaveText('確定為第 3 名');
  await expect(choices(page).getByRole('button', { name: '選第 3 名' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await choices(page).getByRole('button', { name: '選第 2 名' }).click();
  await expect(main(page)).toHaveText('確定為第 2 名');
  /* 待確定的列：強調底色 */
  const rr = await rowRects(page);
  expect(near(await pixel(page, rr[1][0] + 300, rr[1][1] + 6), hex('#fbe8e9'), 2)).toBe(true);
  await main(page).click();
  await expect(statusText(page)).toHaveText(`${nameOf(r0.deck[0])} 的名次確定了。`);
  await expect(page.getByTestId('status-help')).toHaveText('已完成 1 / 6 格 · 還要再抽 5 位。');
  await expect(main(page)).toHaveText('抽下一位 →');
  await expect(choices(page)).toHaveCount(0);
  /* 第 2 位：已有人的名次不能點、按鈕停用並顯示名字 */
  await main(page).click();
  await waitRevealed(page);
  await expect(hotspot(page, 1)).toHaveCount(0);
  const filled = choices(page).getByRole('button', {
    name: `第 2 名：${nameOf(r0.deck[0])}（已確定）`,
  });
  await expect(filled).toBeDisabled();
  /* 鍵盤：Tab 到名次按鈕、Enter */
  await choices(page).getByRole('button', { name: '選第 1 名' }).focus();
  await page.keyboard.press('Enter');
  await expect(main(page)).toHaveText('確定為第 1 名');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(choices(page).getByRole('button', { name: '選第 4 名' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(main(page)).toHaveText('確定為第 4 名');
  await main(page).click();
  /* 其餘 */
  for (const i of [0, 2, 4, 5]) {
    await main(page).click();
    await waitRevealed(page);
    await hotspot(page, i).click();
    await main(page).click();
  }
  await expect(page.getByTestId('status-eyebrow')).toHaveText('EVERY PICK, LOCKED IN.');
  await expect(statusText(page)).toHaveText('你的排行榜完成了！');
  await expect(page.getByTestId('status-help')).toHaveText(
    '從 10 位中抽出 6 位，所有名次都確定了。',
  );
  await expect(main(page)).toHaveText('下載 PNG');
  await expect(page.getByTestId('stage-heading')).toContainText('完成的排行榜');
  await expect(page.getByTestId('lock-notice')).toContainText('所有名次都確定了。');
  const done = (await run(page)) as Run;
  expect(done.phase).toBe('complete');
  expect(done.ranks.map((e) => e && nameOf(e.id))).toEqual([
    '品睿',
    '心悅',
    '宥廷',
    '詠晴',
    '語晴',
    '承恩',
  ]);
  expect(done.ranks.map((e) => e?.drawIndex)).toEqual([3, 1, 4, 2, 5, 6]);
  await expect(page.getByTestId('appearance-order')).toHaveText(
    '心悅 > 詠晴 > 品睿 > 宥廷 > 語晴 > 承恩',
  );
  /* 回到設定（完成後不必確認） */
  await page.getByRole('button', { name: '回到設定' }).click();
  expect(await run(page)).toBeNull();
  /* 回到設定後可以復原設定的變更（開始前的設定），這一局不受影響 */
  await expect(page.getByRole('button', { name: /^復原/ })).toBeEnabled();
  await tab(page, /主題與排名者/).click();
  await expect(page.getByRole('textbox', { name: '排名的人' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('不再確認＋自動抽下一位；不要快速切換時抽選中是「?」（F37～F39、F46、F51）', async ({
  page,
}) => {
  const errors = await open(page);
  await quick(page, { slots: 3, confirmRank: false, autoNext: true });
  await main(page).click();
  await waitRevealed(page);
  await hotspot(page, 0).click();
  /* 直接確定、0.8 秒後自動抽下一位 */
  expect((await run(page))?.ranks[0]).toBeTruthy();
  await expect(main(page)).toHaveText('開始下一次抽選');
  await expect(main(page)).toHaveText('抽選中…', { timeout: 3000 });
  await waitRevealed(page);
  await hotspot(page, 2).click();
  await expect(main(page)).toHaveText('抽選中…', { timeout: 3000 });
  /* 不要快速切換：抽選中卡片沒有角色（「···」） */
  const r = (await run(page)) as Run;
  expect(r.phase).toBe('spinning');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __rankChart: { spin: () => string | null } }).__rankChart.spin(),
    ),
  ).toBeNull();
  await waitRevealed(page);
  await hotspot(page, 1).click();
  await expect(main(page)).toHaveText('下載 PNG');
  expect(errors).toEqual([]);
});

test('抽選演出：輪流換候選（不包括已確定的）、時間到揭曉出場順序的那一位（F46、F47）', async ({
  page,
}) => {
  const errors = await open(page);
  await patch(page, { spinMs: 1800, reducedMotion: false, slots: 2 });
  await main(page).click();
  await waitRevealed(page);
  const r = (await run(page)) as Run;
  await hotspot(page, 0).click();
  await main(page).click();
  await main(page).click();
  /* 抽選中：卡片輪流換候選（名單裡還沒確定的角色，包括不會出場的）、不會連續兩次同一位 */
  const seen: string[] = [];
  for (let i = 0; i < 20; i++) {
    const id = await page.evaluate(() =>
      (window as unknown as { __rankChart: { spin: () => string | null } }).__rankChart.spin(),
    );
    if (id && seen.at(-1) !== id) seen.push(id);
    await page.waitForTimeout(60);
  }
  expect(new Set(seen).size).toBeGreaterThanOrEqual(4);
  expect(seen).not.toContain(r.deck[0]);
  await waitRevealed(page);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __rankChart: { spin: () => string | null } }).__rankChart.spin(),
    ),
  ).toBeNull();
  expect((await run(page))?.deck).toEqual(r.deck);
  expect(errors).toEqual([]);
});

test('回到設定（確認）、同樣設定再玩一次、播放畫面（窄畫面開始時自動進入）（F56～F58）', async ({
  page,
}) => {
  const errors = await open(page);
  await quick(page, { slots: 2 });
  await main(page).click();
  await waitRevealed(page);
  /* 還沒完成：回到設定先確認；取消就繼續 */
  await page.getByRole('button', { name: '回到設定' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('回到設定？');
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
  expect(await run(page)).not.toBeNull();
  await page.getByRole('button', { name: '回到設定' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清掉並回到設定' }).click();
  expect(await run(page)).toBeNull();
  await expect(main(page)).toHaveText('開始 →');
  /* 播放畫面：隱藏設定欄 */
  await page.getByTestId('focus-toggle').click();
  await expect(page.getByRole('complementary', { name: '設定' })).toHaveCount(0);
  await expect(page.getByTestId('focus-toggle')).toHaveText('顯示設定');
  await page.getByTestId('focus-toggle').click();
  await expect(page.getByRole('complementary', { name: '設定' })).toBeVisible();
  /* 再玩一次 */
  await playAll(page, [1, 0]);
  const first = (await run(page))?.deck;
  await page.getByRole('button', { name: '同樣設定再玩一次' }).click();
  await expect(main(page)).toHaveText(/抽選中…|請選擇名次/);
  const second = (await run(page)) as Run;
  expect(second.turn).toBe(0);
  expect(second.deck).not.toEqual(first);
  /* 窄畫面：開始時自動進入播放畫面 */
  await page.getByRole('button', { name: '回到設定' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清掉並回到設定' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await main(page).click();
  await expect(page.getByRole('complementary', { name: '設定' })).toHaveCount(0);
  await expect(page.getByTestId('focus-toggle')).toHaveText('顯示設定');
  expect(errors).toEqual([]);
});

/* ---------- 下載 ---------- */

test('下載：PNG（尺寸、檔名、像素）、2 倍＋附錄、WebP、沒出場的角色（F61～F67）', async ({
  page,
}) => {
  const errors = await open(page);
  await quick(page, { name: 'Kim', subject: 'a/b?c' });
  await playAll(page, [0, 1, 2, 3, 4, 5]);
  const bar = page.getByTestId('export-bar');
  await expect(bar).toBeVisible();
  /* 沒出場的角色 */
  const missing = page.getByTestId('missing');
  await expect(missing).toContainText('這次沒有出場的 4 位');
  await missing.locator('summary').click();
  await expect(page.getByTestId('missing-chip')).toHaveCount(4);
  /* 主要按鈕：PNG 1080 × 1350 */
  let dl = await download(page, main(page));
  expect(dl.name).toBe('Kim_a_b_c_排行榜.png');
  let png = readPng(dl.bytes);
  expect([png.width, png.height]).toEqual([1080, 1350]);
  await expect(toast(page, '已下載 1080 × 1350 px 的 PNG。')).toBeVisible();
  /* 與預覽相同的像素（背景、名次列的紙張色） */
  expect(near(png.at(5, 5), hex('#fbf7ef'), 1)).toBe(true);
  const rr = await rowRects(page);
  expect(near(png.at(rr[0][0] + 300, Math.round(rr[0][1] + 6)), hex('#ffffff'), 1)).toBe(true);
  const prev = await pixel(page, 600, 700);
  expect(near(png.at(600, 700), prev, 2)).toBe(true);
  /* 2 倍＋附錄：2160 ×（1350 ＋ 120 ＋ 162 ＋ 38）× 2 */
  await bar.getByRole('combobox', { name: '解析度' }).click();
  await page.getByRole('option', { name: '2 倍解析度' }).click();
  await bar.getByRole('checkbox', { name: '附上沒出場的角色' }).click();
  dl = await download(page, bar.getByRole('button', { name: '下載 PNG' }));
  png = readPng(dl.bytes);
  expect([png.width, png.height]).toEqual([2160, (1350 + 320) * 2]);
  expect(near(png.at(10, 1350 * 2 + 100), hex('#fbf7ef'), 1)).toBe(true);
  /* 附錄第一位（名字卡）：淺灰 */
  expect(near(png.at((50 + 5 + 4) * 2, (1350 + 112 + 50) * 2), hex('#dddddd'), 3)).toBe(true);
  /* WebP */
  dl = await download(page, bar.getByRole('button', { name: '下載 WebP' }));
  expect(dl.name).toBe('Kim_a_b_c_排行榜.webp');
  expect(strFromU8(dl.bytes.slice(0, 4))).toBe('RIFF');
  expect(strFromU8(dl.bytes.slice(8, 12))).toBe('WEBP');
  expect(errors).toEqual([]);
});

/* ---------- 存檔 ---------- */

test('自動儲存與接著玩：重新整理後同一局（抽選中直接揭曉同一位）、完成的排行榜、存的遊戲對不上（F70、F71）', async ({
  page,
}) => {
  const errors = await open(page);
  await quick(page, { slots: 3, spinMs: 4000, name: '阿光' });
  await main(page).click();
  await waitRevealed(page);
  await hotspot(page, 1).click();
  await main(page).click();
  await main(page).click();
  await expect(main(page)).toHaveText('抽選中…');
  const before = (await savedRun(page)) as Run;
  expect(before.phase).toBe('spinning');
  await page.reload();
  await expect(toast(page, '接著上次的抽選與確定的名次繼續。')).toBeVisible();
  await expect(main(page)).toHaveText('請選擇名次');
  const after = (await run(page)) as Run;
  expect(after.deck).toEqual(before.deck);
  expect(after.turn).toBe(1);
  expect(after.phase).toBe('revealed');
  expect((await config(page)).name).toBe('阿光');
  await expect(page.getByRole('textbox', { name: '排名的人' })).toBeDisabled();
  await hotspot(page, 0).click();
  await main(page).click();
  await main(page).click();
  await waitRevealed(page);
  await hotspot(page, 2).click();
  await main(page).click();
  await expect(main(page)).toHaveText('下載 PNG');
  await page.reload();
  await expect(toast(page, '已還原完成的排行榜。')).toBeVisible();
  await expect(main(page)).toHaveText('下載 PNG');
  /* 存的遊戲和名單對不上 */
  await page.evaluate((k) => {
    const raw = JSON.parse(localStorage.getItem(k) ?? '{}');
    raw.state.data.run.deck[0] = 'nobody';
    localStorage.setItem(k, JSON.stringify(raw));
  }, GAME);
  await page.reload();
  await expect(toast(page, '設定已還原，但存下來的遊戲讀不到，已準備新的一局。')).toBeVisible();
  await expect(main(page)).toHaveText('開始 →');
  expect(errors).toEqual([]);
});

test('復原／重做：文字欄一步、名單、設定；遊戲中停用（F77）', async ({ page }) => {
  const errors = await open(page);
  const name = page.getByRole('textbox', { name: '排名的人' });
  await name.fill('');
  await name.pressSequentially('阿光');
  await name.blur();
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(name).toHaveValue('小明');
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect(name).toHaveValue('阿光');
  await tab(page, /角色名單/).click();
  await page.getByRole('button', { name: '刪除：承恩' }).click();
  await expect(page.getByTestId('pool-count')).toHaveText('9 位');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('pool-count')).toHaveText('10 位');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('pool-count')).toHaveText('9 位');
  await page.keyboard.press('Control+z');
  /* 遊戲中：快捷鍵也不作用 */
  await quick(page);
  await main(page).click();
  await waitRevealed(page);
  await page.keyboard.press('Control+z');
  expect((await config(page)).characters).toHaveLength(10);
  expect(await run(page)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('專案檔：存成 ZIP（設定＋照片，不含這一局）、重設、開啟還原；開啟原作的設定檔（F68、F69）', async ({
  page,
}) => {
  const errors = await open(page);
  await patch(page, { name: '阿光', slots: 3 });
  await tab(page, /角色名單/).click();
  await dropInput(page).setInputFiles([file('照片角色.png', await quadPng())]);
  await expect(page.getByTestId('pool-count')).toHaveText('11 位');
  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^○○○○ 登場角色_\d{8}\.zip$/);
  const zipBytes = readFileSync((await dl.path()) as string);
  const entries = unzipSync(new Uint8Array(zipBytes));
  const project = JSON.parse(strFromU8(entries['project.json']));
  expect(project.tool).toBe('rank-chart');
  expect(project.version).toBe(1);
  expect(project.data.name).toBe('阿光');
  expect(project.data.run).toBeUndefined();
  const ch = project.data.characters[10];
  expect(ch.name).toBe('照片角色');
  expect(Object.keys(entries).filter((k) => k.startsWith('files/'))).toHaveLength(2);
  expect(entries[`files/${ch.photo.id}.png`]).toBeTruthy();
  expect(entries[`files/${ch.thumb}.png`]).toBeTruthy();
  /* 重設：預設值、這一局也清掉 */
  await quick(page);
  await main(page).click();
  await openProjectItem(page, '重設…');
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  expect(await run(page)).toBeNull();
  expect((await config(page)).name).toBe('小明');
  /* 開啟專案檔 */
  await openProjectItem(page, '開啟專案檔…');
  await expect(page.getByRole('alertdialog')).toContainText('開啟專案檔？');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(file('back.zip', zipBytes, 'application/zip'));
  await expect(toast(page, '已開啟專案檔，可以開始新的一局。')).toBeVisible();
  const c = await config(page);
  expect(c.name).toBe('阿光');
  expect(c.characters[10]).toEqual(ch);
  /* 原作的設定檔：助詞接進標題、照片做成裁切圖 */
  const q = (await quadPng(200, 100)).toString('base64');
  const legacy = {
    app: 'blind-pick-studio',
    version: 1,
    config: {
      name: '김씨',
      nameParticle: 'auto',
      intro: '말아주는',
      subject: 'OOOO 등장인물',
      subjectParticle: 'with',
      question: '사귈 수 있을까?',
      slots: 2,
      format: '1:1',
      theme: 'midnight',
      characters: [
        {
          id: 'c_a',
          name: '도윤',
          source: `data:image/png;base64,${q}`,
          crop: { zoom: 1, x: 1, y: 0 },
        },
        { id: 'c_b', name: '서아', source: '' },
      ],
    },
  };
  await openProjectItem(page, '開啟原作的設定檔（JSON）…');
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser2.setFiles(
    file('old.json', Buffer.from(JSON.stringify(legacy)), 'application/json'),
  );
  await expect(toast(page, '已開啟原作的設定檔，可以開始新的一局。')).toBeVisible();
  await tab(page, /主題與排名者/).click();
  await expect(page.getByTestId('title-preview')).toContainText(
    '김씨가 말아주는OOOO 등장인물과사귈 수 있을까?',
  );
  const lc = await config(page);
  expect(lc).toMatchObject({ slots: 2, format: '1:1', theme: 'midnight' });
  expect(lc.characters.map((x) => x.name)).toEqual(['도윤', '서아']);
  expect(lc.characters[0].photo).toMatchObject({ width: 200, height: 100 });
  expect(lc.characters[0].crop).toEqual({ zoom: 1, x: 1, y: 0 });
  await expect(canvas(page)).toHaveAttribute('data-size', '1080x1080');
  /* 不是原作的檔案 */
  await openProjectItem(page, '開啟原作的設定檔（JSON）…');
  const [chooser3] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser3.setFiles(file('x.json', Buffer.from('{"app":"other"}'), 'application/json'));
  await expect(toast(page, '這不是原作存的第 1 版設定檔。')).toBeVisible();
  expect((await config(page)).characters).toHaveLength(2);
  expect(errors).toEqual([]);
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；1280 與 390 的視覺基準（F75）', async ({ page }) => {
  const errors = await open(page);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('rank-chart-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('rank-chart-390.png', { fullPage: true });
  /* 遊戲中、完成後、名單分頁也不能橫向捲動 */
  await quick(page, { slots: 2 });
  await playAll(page, [1, 0]);
  await noHorizontalScroll(page);
  await page.getByTestId('focus-toggle').click();
  await page.getByRole('tab', { name: /角色名單/ }).click();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

/* ---------- 對等驗證後的修正（規格 7.1） ---------- */

test('7.1：自動儲存失敗只通知一次，再次存成功後又失敗才再通知（F71）', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as { __failSave: boolean; __saveToasts: number };
    w.__failSave = true;
    w.__saveToasts = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (w.__failSave && String(k).startsWith('trpg-toolkit:rank-chart'))
        throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, k, v);
    };
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes)
          if (
            n instanceof HTMLElement &&
            n.matches('li') &&
            n.textContent?.includes('自動儲存失敗')
          )
            w.__saveToasts++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const toasts = () =>
    page.evaluate(() => (window as unknown as { __saveToasts: number }).__saveToasts);
  const name = page.getByRole('textbox', { name: '排名的人' });
  await name.click();
  await page.keyboard.type('abcdefghij', { delay: 60 });
  await page.waitForTimeout(800);
  expect(await toasts()).toBe(1);
  /* 存成功一次 → 之後又失敗：再通知一次 */
  await page.evaluate(() => {
    (window as unknown as { __failSave: boolean }).__failSave = false;
  });
  await page.keyboard.type('k', { delay: 60 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    (window as unknown as { __failSave: boolean }).__failSave = true;
  });
  await page.keyboard.type('lmn', { delay: 60 });
  await page.waitForTimeout(800);
  expect(await toasts()).toBe(2);
});

test('7.1：一次加很多張照片時混了不是圖片的檔：列出「不是圖片檔」，圖片照樣加入（F21）', async ({
  page,
}) => {
  const errors = await open(page);
  await tab(page, /角色名單/).click();
  await dropInput(page).setInputFiles([
    file('a.png', await quadPng()),
    file('notes.txt', Buffer.from('hello'), 'text/plain'),
  ]);
  await expect(toast(page, '已加入 1 張照片。需要時可以重新裁切。')).toBeVisible();
  await expect(toast(page, '有些照片無法加入')).toBeVisible();
  await expect(toast(page, '「notes.txt」不是圖片檔。')).toBeVisible();
  await expect(page.getByTestId('pool-count')).toHaveText('11 位');
  expect((await config(page)).characters.at(-1)?.name).toBe('a');
  expect(errors).toEqual([]);
});

test('7.1：窄畫面在遊戲中重新整理時進入播放畫面（寬畫面不會）（F58）', async ({ page }) => {
  const errors = await open(page);
  await quick(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await main(page).click();
  await waitRevealed(page);
  await page.reload();
  await expect(main(page)).toHaveText('請選擇名次');
  await expect(page.getByTestId('focus-toggle')).toHaveText('顯示設定');
  await expect(page.getByRole('complementary', { name: '設定' })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(main(page)).toHaveText('請選擇名次');
  await expect(page.getByTestId('focus-toggle')).toHaveText('播放畫面');
  await expect(page.getByRole('complementary', { name: '設定' })).toBeVisible();
  expect(errors).toEqual([]);
});
