/**
 * 動態對話泡泡產生器（建置產物 next/speech-bubble/）的端對端測試（規格 docs/refactor/specs/speech-bubble.md）：
 * - 範本一覽：開頁沒有錯誤、28 張卡片、分類、搜尋（多關鍵字、全形）、結果數、沒有結果與清除篩選、`/`、縮圖背景與播放（記住）；
 * - 點卡片進入編輯、範本列（已修改、上一個／下一個、［］）、回到一覽與繼續編輯；
 * - 泡泡：內文、標題、位置、新增（照抄造型）、複製、刪除、排序、上限、換造型換配色、配色、恢復預設、套用到全部、圖示與按鈕欄；
 * - 動畫與版面的設定反映到時間表與畫布尺寸；空白泡泡；
 * - 預覽像素（第一格空的、全部出現時有泡泡的底色）；
 * - 匯出：APNG（尺寸、無限循環、格數、總長、第一格透明、中間有泡泡）、GIF、WebP、PNG、連番 PNG 的 ZIP、檔名；
 * - 自動儲存與還原、復原／重做、專案檔（存、開、重設）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準；
 * - 2026-10 對話卡片：整段貼上（名字：內容、LINE 文字檔）、兩側的預設與單獨調整、說話者與日期、卡片底（比例、最小高度、
 *   頁首頁尾、紋理、圓角、匯出的第一格）、背景圖與 ZIP 專案檔、第 1 版的專案檔、自由拖曳、樣式預設檔、複製圖片。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { composeApng, decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('speech-bubble') ?? { id: 'speech-bubble', status: 'next' })}/`;
const STORAGE_KEY = 'trpg-toolkit:speech-bubble';

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

interface Hook {
  data(): Record<string, unknown> & { bubbles: Record<string, unknown>[] };
  prefs(): Record<string, unknown>;
  ui(): { screen: string; selectedId: string | null };
  set(patch: Record<string, unknown>): void;
  applyPreset(id: string): void;
  scene(): {
    width: number;
    height: number;
    duration: number;
    ready: number;
    leave: number;
    empty: boolean;
    overflow: boolean;
    items: {
      x: number;
      y: number;
      w: number;
      h: number;
      lines: string[];
      enter0: number;
      exit0: number;
      exit1: number;
      rank: number;
    }[];
  };
  seek(t: number): void;
}

const hook = <T>(page: Page, fn: string): Promise<T> =>
  page.evaluate((src) => {
    const h = (window as unknown as { __speechBubble: unknown }).__speechBubble;
    return new Function('h', `return (${src})(h)`)(h);
  }, fn) as Promise<T>;
const data = (page: Page) => hook<ReturnType<Hook['data']>>(page, '(h) => h.data()');
const scene = (page: Page) => hook<ReturnType<Hook['scene']>>(page, '(h) => h.scene()');
const set = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate(
    (p) => (window as unknown as { __speechBubble: Hook }).__speechBubble.set(p),
    patch,
  );
const seek = (page: Page, t: number) =>
  page.evaluate((t) => (window as unknown as { __speechBubble: Hook }).__speechBubble.seek(t), t);

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
  await expect(page.getByRole('heading', { level: 1, name: '動態對話泡泡產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __speechBubble?: unknown }).__speechBubble,
  );
  return errors;
}

const card = (page: Page, id: string) => page.locator(`button:has([data-preset-thumb="${id}"])`);
const cards = (page: Page) => page.locator('[data-preset-thumb]');
const search = (page: Page) => page.getByRole('searchbox', { name: '搜尋範本' });
const count = (page: Page) => page.getByTestId('result-count');
const category = (page: Page, name: string) =>
  page.getByRole('radiogroup', { name: '分類' }).getByRole('radio', { name, exact: true });
const presetName = (page: Page) => page.getByTestId('preset-name');
const tab = (page: Page, name: string) => page.getByRole('tab', { name }).click();
const rows = (page: Page) =>
  page.getByRole('list', { name: '泡泡清單（依畫的順序）' }).locator('[data-bubble-row]');
/** 內文的編輯區（2026-10 第二步：格式化文字編輯區） */
const text = (page: Page) => page.getByTestId('bubble-text').locator('[data-rich-editor="full"]');

/** 編輯區顯示的內文（段落之間是換行） */
async function editorText(page: Page): Promise<string> {
  return text(page).evaluate((el) =>
    Array.from(el.children)
      .map((c) => c.textContent ?? '')
      .join('\n'),
  );
}

/** 換掉整個內文：全選後貼上純文字（空字串＝刪掉） */
async function setText(page: Page, value: string) {
  await text(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  if (value)
    await text(page).evaluate((el, t) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, value);
  else await page.keyboard.press('Delete');
  await expect.poll(() => editorText(page)).toBe(value);
}
const canvas = (page: Page) => page.getByTestId('sb-canvas');

async function choose(page: Page, id: string) {
  await card(page, id).click();
  await expect(page.getByTestId('preset-bar')).toBeVisible();
}

async function noHorizontalScroll(page: Page, what = '') {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, `${what}不應出現橫向捲動`).toBeLessThanOrEqual(cw);
}

async function pickSelect(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function fillNumber(scope: Page | Locator, label: string, value: number) {
  const box = scope.getByRole('spinbutton', { name: label, exact: true });
  await box.fill(String(value));
  await box.press('Enter');
}

/** 預覽畫布上一點的 RGBA */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return canvas(page).evaluate(
    (el, [x, y]) =>
      Array.from(
        (el as HTMLCanvasElement).getContext('2d')!.getImageData(Math.round(x), Math.round(y), 1, 1)
          .data,
      ),
    [x, y],
  );
}

/** 預覽畫布不透明的像素數 */
async function opaqueCount(page: Page): Promise<number> {
  return canvas(page).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
}

async function exportAs(page: Page, format: string) {
  await page.getByRole('radio', { name: format, exact: true }).click();
  await page.getByRole('button', { name: `匯出 ${format}` }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await download.path())!)),
    result,
  };
}

const near = (a: number[], b: number[], tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

/* ---------- 範本一覽 ---------- */

test.describe('範本一覽', () => {
  test('開頁：28 張卡片、結果數、頁尾只有靈感來源', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByTestId('gallery')).toBeVisible();
    await expect(cards(page)).toHaveCount(28);
    await expect(count(page)).toContainText('28／28');
    await expect(page.getByRole('button', { name: '繼續編輯' })).toHaveCount(0);
    const footer = page.locator('footer');
    await expect(footer).toContainText('靈感來源：sotsotssi/TextBubbleMaker-preview');
    await expect(footer.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/sotsotssi/TextBubbleMaker-preview',
    );
    /* 卡片的說明：造型・秒數 */
    await expect(card(page, 'chat-blue')).toContainText('藍色訊息泡泡');
    await expect(card(page, 'chat-blue')).toContainText(/訊息泡泡・\d\.\d 秒/);
    await expect(card(page, 'boss-phases')).toContainText('3 種造型');
    expect(errors).toEqual([]);
  });

  test('分類、搜尋、結果數、沒有結果時清除篩選、/ 聚焦搜尋', async ({ page }) => {
    const errors = await open(page);
    await category(page, '科幻・賽博').click();
    await expect(cards(page)).toHaveCount(3);
    await expect(count(page)).toContainText('3／28');
    await category(page, '對話').click();
    await expect(cards(page)).toHaveCount(6);
    await category(page, '全部').click();
    /* 搜尋：名稱、文字、造型、全形、多關鍵字 */
    await search(page).fill('霓虹');
    await expect(cards(page)).toHaveCount(2);
    await search(page).fill('ＯＮ　ＡＩＲ');
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, 'neon-onair')).toBeVisible();
    await search(page).fill('懷錶');
    await expect(cards(page)).toHaveCount(1);
    await search(page).fill('終端機 打字');
    await expect(cards(page)).toHaveCount(0);
    await search(page).fill('終端機');
    await expect(cards(page)).toHaveCount(1);
    /* 分類與搜尋一起作用 */
    await category(page, '對話').click();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByTestId('gallery-empty')).toContainText('沒有符合條件的範本。');
    await expect(count(page)).toContainText('0／28');
    await page.getByRole('button', { name: '清除篩選' }).click();
    await expect(cards(page)).toHaveCount(28);
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
    await expect(category(page, '全部')).toHaveAttribute('aria-checked', 'true');
    /* / 鍵 */
    await search(page).blur();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    await expect(search(page)).toBeFocused();
    await expect(search(page)).toHaveValue('');
    /* 焦點在分類（radio）、一起播放（switch）上時 / 也跳到搜尋欄（7.1） */
    await category(page, '對話').click();
    await page.keyboard.press('/');
    await expect(search(page)).toBeFocused();
    await expect(search(page)).toHaveValue('');
    await page.getByRole('switch', { name: '縮圖一起播放' }).focus();
    await page.keyboard.press('/');
    await expect(search(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('縮圖背景與一起播放：記住；減少動態效果時預設關閉', async ({ page }) => {
    const errors = await open(page);
    const motion = page.getByRole('switch', { name: '縮圖一起播放' });
    await expect(motion).not.toBeChecked();
    /* 縮圖背景：深色 → 淺色時，縮圖的角落從深色變淺色 */
    const corner = () =>
      page
        .locator('[data-preset-thumb="chat-blue"] canvas')
        .evaluate((el) =>
          Array.from((el as HTMLCanvasElement).getContext('2d')!.getImageData(2, 2, 1, 1).data),
        );
    expect(near(await corner(), [0x1b, 0x1d, 0x22, 255])).toBe(true);
    await page.getByRole('radio', { name: '淺色', exact: true }).click();
    await expect.poll(corner).toEqual([0xf5, 0xf3, 0xee, 255]);
    const thumbBg = page.getByRole('radiogroup', { name: '縮圖背景' });
    await thumbBg.getByRole('radio', { name: '透明', exact: true }).click();
    await expect.poll(async () => (await corner())[3]).toBe(0);
    await motion.click();
    await expect(motion).toBeChecked();
    await page.reload();
    await expect(page.getByRole('switch', { name: '縮圖一起播放' })).toBeChecked();
    await expect(thumbBg.getByRole('radio', { name: '透明', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(errors).toEqual([]);
  });

  test('點卡片進入編輯；範本列：已修改、上一個／下一個（在篩選結果裡）、回到一覽與繼續編輯', async ({
    page,
  }) => {
    const errors = await open(page);
    await category(page, '通知・系統').click();
    await choose(page, 'toast-success');
    await expect(presetName(page)).toHaveText('範本：擲骰成功通知');
    expect((await data(page)).presetId).toBe('toast-success');
    /* 下一個：通知・系統的第二組；［ 回到上一個；第一組再往前接到最後一組 */
    await page.getByRole('button', { name: /^下一個範本/ }).click();
    await expect(presetName(page)).toHaveText('範本：注意視窗');
    await page.locator('body').click({ position: { x: 5, y: 800 } });
    await page.keyboard.press('[');
    await expect(presetName(page)).toHaveText('範本：擲骰成功通知');
    await page.keyboard.press('[');
    await expect(presetName(page)).toHaveText('範本：選擇視窗');
    await page.keyboard.press(']');
    await expect(presetName(page)).toHaveText('範本：擲骰成功通知');
    /* 改了內容就標「已修改」 */
    await setText(page, '改過了');
    await expect(presetName(page)).toContainText('已修改');
    /* 回到一覽：繼續編輯、勾勾 */
    await page.getByRole('button', { name: '範本一覽' }).click();
    await expect(page.getByText('目前的內容：擲骰成功通知')).toBeVisible();
    await expect(card(page, 'toast-success')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await expect.poll(() => editorText(page)).toBe('改過了');
    /* 用鍵盤進入編輯畫面：焦點移到範本列（不是掉到 body，7.1） */
    await page.getByRole('button', { name: '範本一覽' }).click();
    await card(page, 'toast-success').focus();
    await page.keyboard.press('Enter');
    await expect(presetName(page)).toBeFocused();
    expect(errors).toEqual([]);
  });
});

/* ---------- 泡泡 ---------- */

test.describe('泡泡', () => {
  test('內文、標題、位置反映到預覽；新增、複製、刪除、排序、上限', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await expect(rows(page)).toHaveCount(1);
    await setText(page, '第一行\n第二行很長很長很長很長很長很長很長很長很長很長很長很長很長很長');
    let s = await scene(page);
    expect(s.items[0].lines[0]).toBe('第一行');
    expect(s.items[0].lines.length).toBeGreaterThan(2);
    /* 標題（名字）在泡泡外面：畫布變高 */
    const h0 = s.height;
    await page.getByTestId('bubble-title').fill('小明');
    await page.getByTestId('bubble-title').blur();
    s = await scene(page);
    expect(s.height).toBeGreaterThan(h0);
    /* 新增：照抄造型與配色，選取新的 */
    await page.getByRole('button', { name: '新增泡泡' }).click();
    await expect(rows(page)).toHaveCount(2);
    let d = await data(page);
    expect(d.bubbles[1]).toMatchObject({
      style: 'messenger',
      text: '新的泡泡',
      title: '',
      align: 'right',
    });
    expect(d.bubbles[1].colors).toEqual(d.bubbles[0].colors);
    await expect.poll(() => editorText(page)).toBe('新的泡泡');
    await page.getByRole('radio', { name: '靠左', exact: true }).click();
    expect((await data(page)).bubbles[1].align).toBe('left');
    /* 直向排列：第二個在第一個下面；靠左與靠右錯開 */
    s = await scene(page);
    expect(s.items[1].y).toBeGreaterThan(s.items[0].y + s.items[0].h);
    expect(s.items[0].x + s.items[0].w).toBeGreaterThan(s.items[1].x + s.items[1].w);
    /* 複製（連文字）、刪除、排序（Alt＋↑） */
    await rows(page)
      .nth(1)
      .getByRole('button', { name: /^複製這個泡泡/ })
      .click();
    await expect(rows(page)).toHaveCount(3);
    d = await data(page);
    expect(d.bubbles[2].text).toBe('新的泡泡');
    await setText(page, '第三個');
    await page.getByRole('list', { name: '泡泡清單（依畫的順序）' }).locator('li').nth(2).focus();
    await page.keyboard.press('Alt+ArrowUp');
    d = await data(page);
    expect(d.bubbles.map((b) => b.text)).toEqual([
      expect.stringContaining('第一行'),
      '第三個',
      '新的泡泡',
    ]);
    await rows(page)
      .nth(0)
      .getByRole('button', { name: /^刪除這個泡泡/ })
      .click();
    await expect(rows(page)).toHaveCount(2);
    /* 上限 40（2026-10 從 12 放寬）：先放 39 個，再新增一個 */
    const one = (await data(page)).bubbles[0];
    await set(page, { bubbles: Array.from({ length: 39 }, (_, i) => ({ ...one, id: `x${i}` })) });
    await page.getByRole('button', { name: '新增泡泡' }).click();
    await expect(rows(page)).toHaveCount(40);
    await expect(page.getByRole('button', { name: '新增泡泡' })).toBeDisabled();
    await expect(page.getByText('最多 40 個泡泡。')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('造型：換造型換成預設配色與圖示；圖示、按鈕欄只在有的造型出現；配色、恢復預設、套用到全部', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    const styles = page.getByRole('radiogroup', { name: '造型' });
    await expect(styles.getByRole('radio')).toHaveCount(21);
    await expect(page.getByRole('combobox', { name: '圖示' })).toBeHidden();
    await expect(page.getByTestId('bubble-button')).toBeHidden();
    await styles.getByRole('radio', { name: '系統視窗' }).click();
    let d = await data(page);
    expect(d.bubbles[0]).toMatchObject({ style: 'window', icon: 'warn' });
    expect((d.bubbles[0].colors as Record<string, string>).fill).toBe('#fffaf0');
    await expect(page.getByRole('combobox', { name: '圖示' })).toBeVisible();
    await expect(page.getByText('視窗標題')).toBeVisible();
    await page.getByTestId('bubble-button').fill('好');
    await page.getByTestId('bubble-button').blur();
    await pickSelect(page, '圖示', '問號');
    d = await data(page);
    expect(d.bubbles[0]).toMatchObject({ button: '好', icon: 'question' });
    /* 配色：色碼欄 */
    const fillHex = page.getByRole('textbox', { name: '底色' });
    await fillHex.fill('#112233');
    await fillHex.press('Enter');
    expect((await data(page)).bubbles[0].colors).toMatchObject({ fill: '#112233' });
    await page.getByRole('button', { name: '恢復造型的預設配色' }).click();
    expect((await data(page)).bubbles[0].colors).toMatchObject({ fill: '#fffaf0' });
    /* 套用到全部：第二個泡泡變成系統視窗（文字不變） */
    await page.getByRole('button', { name: '套用到全部泡泡' }).click();
    await expect(page.getByText('已套用到 1 個泡泡。').first()).toBeVisible();
    d = await data(page);
    expect(d.bubbles[1]).toMatchObject({
      style: 'window',
      icon: 'question',
      text: '收到！等等就看。',
    });
    /* 復原一次回到套用前 */
    await page.keyboard.press('Control+z');
    expect((await data(page)).bubbles[1].style).toBe('messenger');
    expect(errors).toEqual([]);
  });

  test('空白的泡泡不畫；全部空白時提示，匯出說明沒有內容', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    await setText(page, '');
    let s = await scene(page);
    expect(s.items).toHaveLength(1);
    expect(s.items[0].enter0).toBe(0);
    await rows(page).nth(1).click();
    await setText(page, '   ');
    s = await scene(page);
    expect(s.empty).toBe(true);
    expect([s.width, s.height]).toEqual([320, 180]);
    await expect(page.getByText('泡泡裡沒有文字。請在「泡泡」分頁輸入內文或標題。')).toBeVisible();
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    await expect(page.getByText('泡泡裡沒有文字，沒有東西可以匯出。')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

/* ---------- 動畫與版面 ---------- */

test.describe('動畫與版面', () => {
  test('動畫設定反映到時間表', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    await tab(page, '動畫');
    await pickSelect(page, '登場動作', '旋轉放大');
    await fillNumber(page, '登場時間', 0.5);
    await fillNumber(page, '停留時間', 1);
    await fillNumber(page, '依序出現的間隔', 1);
    await fillNumber(page, '退場時間', 0.4);
    let d = await data(page);
    expect(d).toMatchObject({ enter: 'spin', enterDur: 0.5, hold: 1, stagger: 1, exitDur: 0.4 });
    let s = await scene(page);
    /* 兩個泡泡：0、1 秒登場；全部出現完 1.5 秒；停 1 秒；依序退場 2.5、3.5；結束 3.9 */
    expect(s.items.map((i) => i.enter0)).toEqual([0, 1]);
    expect(s.ready).toBeCloseTo(1.5, 5);
    expect(s.items.map((i) => i.exit0)).toEqual([2.5, 3.5]);
    expect(s.duration).toBeCloseTo(3.9, 5);
    await expect(page.getByTestId('meta-line')).toContainText('3.90 秒');
    /* 一起退場 */
    await page.getByRole('switch', { name: '一起退場' }).click();
    s = await scene(page);
    expect(s.items.map((i) => i.exit0)).toEqual([2.5, 2.5]);
    /* 逐字打出：速度與游標出現 */
    await expect(page.getByRole('spinbutton', { name: '打字速度' })).toBeHidden();
    await pickSelect(page, '文字出現的方式', '逐字打出');
    await fillNumber(page, '打字速度', 10);
    await page.getByRole('radio', { name: '方塊 ▋' }).click();
    d = await data(page);
    expect(d).toMatchObject({ textAnim: 'type', typeSpeed: 10, cursor: 'block' });
    s = await scene(page);
    /* 「收到！等等就看。」8 個字＝0.8 秒 */
    expect(s.ready).toBeCloseTo(1 + 0.5 + 0.8, 5);
    /* 不退場：沒有退場時間、一起退場的欄位 */
    await pickSelect(page, '退場動作', '不退場（停在最後）');
    await expect(page.getByRole('spinbutton', { name: '退場時間' })).toBeHidden();
    await expect(page.getByRole('switch', { name: '一起退場' })).toBeHidden();
    s = await scene(page);
    expect(s.duration).toBeCloseTo(s.ready + 1, 5);
    expect(errors).toEqual([]);
  });

  test('版面：字級、排列、間距、畫布（自動、自訂、放不下）', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'progress-capsules');
    await tab(page, '版面');
    const s0 = await scene(page);
    await fillNumber(page, '字級', 30);
    const s1 = await scene(page);
    expect(s1.width).toBeGreaterThan(s0.width);
    /* 留白：自動畫布每邊加減 */
    await fillNumber(page, '留白', 44);
    const s2 = await scene(page);
    expect(s2.width - s1.width).toBe(40);
    expect(s2.height - s1.height).toBe(40);
    await expect(canvas(page)).toHaveAttribute('data-size', `${s2.width}x${s2.height}`);
    /* 格狀：兩欄、比直向寬 */
    await page.getByRole('radio', { name: '格狀', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '欄數' })).toBeVisible();
    const s3 = await scene(page);
    expect(s3.width).toBeGreaterThan(s2.width);
    expect(s3.items[1].y).toBeCloseTo(s3.items[0].y, 0);
    /* 輪流：沒有間距、間隔 */
    await page.getByRole('radio', { name: '輪流出現', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: '間距' })).toBeHidden();
    /* 自訂畫布 */
    await page.getByRole('radio', { name: '自訂', exact: true }).click();
    await fillNumber(page, '寬', 640);
    await fillNumber(page, '高', 360);
    const s4 = await scene(page);
    expect([s4.width, s4.height]).toEqual([640, 360]);
    await fillNumber(page, '寬', 100);
    await expect(page.getByText(/內容比畫布大/)).toBeVisible();
    /* 陰影開關 */
    await page.getByRole('switch', { name: '陰影' }).click();
    expect((await data(page)).shadow).toBe(false);
    expect(errors).toEqual([]);
  });
});

/* ---------- 預覽與匯出 ---------- */

test.describe('預覽與匯出', () => {
  test('預覽：第一格空的、全部出現時是泡泡的底色、最後一格空的', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await set(page, { idle: 'none' });
    const s = await scene(page);
    const it = s.items[0];
    await seek(page, 0);
    await expect.poll(() => opaqueCount(page)).toBe(0);
    await seek(page, s.ready + 0.2);
    /* 泡泡左上角內側（避開文字）是 #3b82f6 */
    await expect
      .poll(() => pixel(page, it.x + 6, it.y + it.h / 2))
      .toEqual([0x3b, 0x82, 0xf6, 255]);
    await seek(page, s.duration);
    await expect.poll(() => opaqueCount(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('APNG：尺寸、無限循環、格數與總長、第一格透明、中間有泡泡；檔名', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await set(page, { idle: 'none' });
    const s = await scene(page);
    const apng = await exportAs(page, 'APNG');
    expect(apng.name).toMatch(/^bubble_\d{13}\.png$/);
    const a = parseApng(apng.bytes);
    expect(a.ihdr).toMatchObject({ width: s.width, height: s.height });
    expect(a.numPlays).toBe(0);
    const n = Math.ceil(s.duration * 16 - 1e-9);
    const delays = a.frames.map((f) => (f.delayNum * 1000) / (f.delayDen || 100));
    expect(delays.reduce((x, y) => x + y, 0)).toBeCloseTo((n / 16) * 1000, -1);
    const frames = composeApng(a);
    const first = frames[0];
    expect(first.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
    /* 全部出現時（停留中）泡泡內側是底色：找蓋住 ready＋0.1 秒的那一格（相同的格合併成一格） */
    let t = 0;
    let mid: Uint8Array | null = null;
    for (let i = 0; i < a.frames.length; i++) {
      if (t + delays[i] > s.ready * 1000 + 100) {
        mid = frames[i];
        break;
      }
      t += delays[i];
    }
    expect(mid).not.toBeNull();
    const it = s.items[0];
    const k = (Math.round(it.y + it.h / 2) * s.width + Math.round(it.x + 6)) * 4;
    expect(Array.from(mid!.subarray(k, k + 4))).toEqual([0x3b, 0x82, 0xf6, 255]);
    await expect(apng.result).toContainText(`${s.width}×${s.height} px`);
    expect(errors).toEqual([]);
  });

  test('GIF、WebP、PNG、連番 PNG；FPS 與尺寸倍率', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    await choose(page, 'toast-success');
    const s = await scene(page);
    /* FPS 改 10（記進設定、可以復原） */
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '10 fps' }).click();
    expect((await data(page)).fps).toBe(10);
    await expect(page.getByTestId('meta-line')).toContainText('10 fps');
    const gif = await exportAs(page, 'GIF');
    expect(gif.name).toMatch(/^bubble_\d{13}\.gif$/);
    const g = parseGif(gif.bytes);
    expect([g.width, g.height]).toEqual([s.width, s.height]);
    expect(g.loopCount).toBe(0);
    expect(g.frames.reduce((x, f) => x + f.delayCs, 0)).toBeCloseTo(
      Math.ceil(s.duration * 10 - 1e-9) * 10,
      -1,
    );

    const webp = await exportAs(page, 'WebP');
    expect(webp.name).toMatch(/^bubble_\d{13}\.webp$/);
    const head = new TextDecoder().decode(webp.bytes.subarray(0, 16));
    expect(head.slice(0, 4)).toBe('RIFF');
    expect(head.slice(8, 12)).toBe('WEBP');

    /* PNG：全部出現的畫面；尺寸倍率 2 */
    await page.getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^200%/ }).click();
    const png = await exportAs(page, 'PNG');
    expect(png.name).toMatch(/^bubble_\d{13}\.png$/);
    const chunks = parseChunks(png.bytes);
    const ihdr = readIhdr(chunks);
    expect([ihdr.width, ihdr.height]).toEqual([s.width * 2, s.height * 2]);
    expect(chunks.some((c) => c.type === 'acTL')).toBe(false);
    const idat = chunks.filter((c) => c.type === 'IDAT');
    const all = new Uint8Array(idat.reduce((x, c) => x + c.data.length, 0));
    let o = 0;
    for (const c of idat) {
      all.set(c.data, o);
      o += c.data.length;
    }
    const px = decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType);
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(ihdr.width * ihdr.height * 0.2);

    await page.getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^100%/ }).click();
    const zip = await exportAs(page, '連番 PNG');
    expect(zip.name).toMatch(/^bubble_\d{13}\.zip$/);
    const files = Object.keys(unzipSync(zip.bytes)).filter((f) => f.endsWith('.png'));
    expect(files.length).toBe(Math.ceil(s.duration * 10 - 1e-9));
    expect(errors).toEqual([]);
  });
});

/* ---------- 存檔、復原、專案檔 ---------- */

test.describe('存檔與復原', () => {
  test('自動儲存：重新整理後回到範本一覽（繼續編輯）、內容還在', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'rpg-navy');
    await setText(page, '存檔測試');
    await expect(page.getByRole('status').filter({ hasText: '已自動儲存' })).toBeVisible();
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.state?.data,
      STORAGE_KEY,
    );
    expect(stored).toMatchObject({
      presetId: 'rpg-navy',
      bubbles: [{ text: '存檔測試', style: 'rpg' }],
    });
    await page.reload();
    await expect(page.getByTestId('gallery')).toBeVisible();
    await expect(page.getByText('目前的內容：藍色 RPG 對話框')).toBeVisible();
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await expect.poll(() => editorText(page)).toBe('存檔測試');
    expect(errors).toEqual([]);
  });

  test('復原／重做：連續打字算一步（2026-10 第二步：0.4 秒內）、按鈕與快捷鍵', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    const before = (await data(page)).bubbles[0].text;
    await text(page).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('一二三');
    await expect.poll(() => editorText(page)).toBe('一二三');
    await page.getByRole('radio', { name: '置中', exact: true }).click();
    const undo = page.getByRole('button', { name: /^復原/ });
    await undo.click();
    expect((await data(page)).bubbles[0].align).toBe('right');
    expect((await data(page)).bubbles[0].text).toBe('一二三');
    await undo.click();
    expect((await data(page)).bubbles[0].text).toBe(before);
    await page.locator('body').click({ position: { x: 5, y: 800 } });
    await page.keyboard.press('Control+Shift+z');
    expect((await data(page)).bubbles[0].text).toBe('一二三');
    await page.keyboard.press('Control+y');
    expect((await data(page)).bubbles[0].align).toBe('center');
    expect(errors).toEqual([]);
  });

  test('專案檔：存、開、壞檔不套用、重設', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'hud-scan');
    await setText(page, '專案檔測試');
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^對話泡泡_\d{8}\.json$/);
    const saved = readFileSync((await download.path())!, 'utf8');
    expect(JSON.parse(saved)).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'speech-bubble',
      /* 2026-10：資料第 3 版（第 2 版：兩側的預設、卡片底…；第 3 版：內文的部分格式）；舊的專案檔照常開（見「對話卡片」的測試） */
      version: 3,
      data: { presetId: 'hud-scan', bubbles: [{ style: 'hud', text: '專案檔測試' }], fps: 16 },
    });
    await setText(page, '改掉了');
    const openFile = async (name: string, body: string) => {
      await page.getByRole('button', { name: '專案' }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
      ]);
      await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(body) });
      await page.getByRole('button', { name: '開啟', exact: true }).click();
    };
    await openFile('備份.json', saved);
    await expect.poll(() => editorText(page)).toBe('專案檔測試');
    /* 壞檔：內容不變 */
    await openFile(
      '壞的.json',
      JSON.stringify({
        format: 'trpg-toolkit-project',
        tool: 'speech-bubble',
        version: 1,
        data: 5,
      }),
    );
    await expect(page.getByText(/無法開啟專案檔/).first()).toBeVisible();
    await expect.poll(() => editorText(page)).toBe('專案檔測試');
    /* 重設：回到預設範本與範本一覽 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設…' }).click();
    await page.getByRole('button', { name: '重設', exact: true }).click();
    await expect(page.getByTestId('gallery')).toBeVisible();
    expect((await data(page)).presetId).toBe('chat-blue');
    await expect(page.getByRole('button', { name: '繼續編輯' })).toHaveCount(0);
    /* 確認框寫「可以用『復原』回來」：Ctrl＋Z 回到重設前的內容（7.1） */
    await page.keyboard.press('Control+z');
    await expect.poll(async () => JSON.stringify(await data(page))).toContain('專案檔測試');
    expect(errors).toEqual([]);
  });
});

/* ---------- 對話卡片（2026-10，規格 F57～F69） ---------- */

const sideEditor = (page: Page) => page.getByTestId('side-editor');
const prefs = (page: Page) => hook<{ styles: { name: string }[] }>(page, '(h) => h.prefs()');

/** 頁面裡畫一張單色的 PNG（背景圖用） */
async function solidPng(page: Page, color: string, w = 60, h = 40): Promise<Buffer> {
  const b64 = await page.evaluate(
    ([c, ww, hh]) => {
      const cv = document.createElement('canvas');
      cv.width = ww as number;
      cv.height = hh as number;
      const x = cv.getContext('2d')!;
      x.fillStyle = c as string;
      x.fillRect(0, 0, ww as number, hh as number);
      return cv.toDataURL('image/png').split(',')[1];
    },
    [color, w, h],
  );
  return Buffer.from(b64, 'base64');
}

async function commitHex(scope: Page | Locator, name: string, hex: string) {
  const box = scope.getByRole('textbox', { name, exact: true });
  await box.fill(hex);
  await box.press('Enter');
}

const LINE_TXT = [
  '[LINE] 與「霧港調查團」的聊天記錄',
  '儲存日期：2026/10/15 22:10',
  '',
  '2026/10/14（三）',
  '21:03\t阿明\t今晚要開團嗎？',
  '21:04\t小華\t"好啊',
  '老地方見"',
  '21:05\t\t小華已收回訊息',
  '2026/10/15（四）',
  '下午02:30\t阿明\t到了！',
].join('\r\n');

test.describe('對話卡片（2026-10）', () => {
  test('整段貼上：辨識「名字：內容」與則數、兩個人自動對側、合併同一人、取代；一步復原', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    const before = (await data(page)).bubbles.map((b) => b.text);
    await page.getByRole('button', { name: '整段貼上…' }).click();
    await page
      .getByTestId('import-text')
      .fill('阿明：今天要開團嗎？\n小華：好啊\n幾點？\n阿明：八點，老地方');
    await expect(page.getByTestId('import-status')).toHaveText('辨識為「名字：內容」，共 4 則。');
    const sp = page.getByTestId('import-speakers').locator('li');
    await expect(sp).toHaveCount(2);
    await expect(sp.nth(0)).toContainText('阿明');
    await expect(sp.nth(0)).toContainText('2 則');
    await expect(sp.nth(1)).toContainText('小華');
    await expect(sp.nth(0).getByRole('radio', { name: '靠左' })).toBeChecked();
    await expect(sp.nth(1).getByRole('radio', { name: '靠右' })).toBeChecked();
    /* 只有兩個人：阿明換到靠右，小華自動換到靠左 */
    await sp.nth(0).getByRole('radio', { name: '靠右' }).click();
    await expect(sp.nth(1).getByRole('radio', { name: '靠左' })).toBeChecked();
    await expect(page.getByTestId('import-confirm')).toHaveText('加入 4 個泡泡');
    await page.getByRole('switch', { name: '同一人連續的訊息合成一個泡泡' }).click();
    await expect(page.getByTestId('import-confirm')).toHaveText('加入 3 個泡泡');
    await page.getByTestId('import-confirm').click();
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    const d = await data(page);
    expect(d.bubbles.map((b) => [b.align, b.speaker, b.text])).toEqual([
      ['right', '阿明', '今天要開團嗎？'],
      ['left', '小華', '好啊\n幾點？'],
      ['right', '阿明', '八點，老地方'],
    ]);
    /* 樣式用那一側的預設（兩人對話：靠左灰、靠右藍） */
    expect((d.bubbles[1].colors as Record<string, string>).fill).toBe('#eceff3');
    expect((d.bubbles[0].colors as Record<string, string>).fill).toBe('#3b82f6');
    /* 名字畫在泡泡上方：場景的泡泡往下移 */
    const s = await scene(page);
    expect(s.items[0].y).toBeGreaterThan(30);
    await page.keyboard.press('Control+z');
    expect((await data(page)).bubbles.map((b) => b.text)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('整段貼上：開啟 LINE 匯出的文字檔，帶入日期＋時間、每天的日期做成置中的泡泡、加在後面', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await page.getByRole('button', { name: '整段貼上…' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: '開啟文字檔…' }).click(),
    ]);
    await chooser.setFiles({
      name: '[LINE]霧港調查團.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(LINE_TXT),
    });
    const status = page.getByTestId('import-status');
    await expect(status).toContainText('辨識為「LINE 聊天記錄」，共 3 則。');
    await expect(status).toContainText('略過 1 則系統訊息');
    await page.getByRole('radio', { name: '日期＋時間' }).click();
    await page.getByRole('switch', { name: '每天的日期做成置中的泡泡' }).click();
    await page.getByRole('radio', { name: '加在後面' }).click();
    await page.getByTestId('import-confirm').click();
    const d = await data(page);
    expect(d.bubbles.slice(1).map((b) => [b.align, b.speaker, b.text, b.time])).toEqual([
      ['center', '', '2026/10/14（三）', ''],
      ['left', '阿明', '今晚要開團嗎？', '2026/10/14（三） 21:03'],
      ['right', '小華', '好啊\n老地方見', '2026/10/14（三） 21:04'],
      ['center', '', '2026/10/15（四）', ''],
      ['left', '阿明', '到了！', '2026/10/15（四） 下午02:30'],
    ]);
    expect(errors).toEqual([]);
  });

  test('兩側的預設：改一側套用到沒有單獨調整的泡泡；單獨調整的標示、回到預設、換位置換成那一側', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    /* 第 2 個靠左的泡泡，底色單獨改成紅色 */
    await page.getByRole('button', { name: '新增泡泡' }).click();
    await commitHex(page, '底色', '#ff0000');
    await expect(page.locator('[data-custom-badge]')).toHaveCount(1);
    let d = await data(page);
    expect(d.bubbles[1].custom).toEqual(['fill']);
    await tab(page, '樣式');
    await expect(page.getByRole('radio', { name: '靠左（2）' })).toBeChecked();
    await commitHex(sideEditor(page), '底色', '#00ff00');
    await fillNumber(sideEditor(page), '字級', 30);
    d = await data(page);
    expect(d.bubbles.map((b) => (b.colors as Record<string, string>).fill)).toEqual([
      '#00ff00',
      '#ff0000',
      '#3b82f6',
    ]);
    expect(d.bubbles.map((b) => (b.fmt as Record<string, unknown>).fontSize)).toEqual([
      30,
      30,
      null,
    ]);
    /* 回到這一側的預設 */
    await tab(page, '泡泡');
    await page.getByRole('button', { name: '這個泡泡的樣式' }).click();
    await expect(page.getByTestId('custom-count')).toHaveText('單獨調整了 1 項');
    await page.getByRole('button', { name: '回到這一側的預設' }).click();
    d = await data(page);
    expect((d.bubbles[1].colors as Record<string, string>).fill).toBe('#00ff00');
    await expect(page.getByTestId('custom-count')).toHaveText('全部跟著這一側的預設');
    /* 換位置：換成靠右的樣式 */
    await page
      .getByTestId('bubble-editor')
      .getByRole('radio', { name: '靠右', exact: true })
      .click();
    d = await data(page);
    expect((d.bubbles[1].colors as Record<string, string>).fill).toBe('#3b82f6');
    expect((d.bubbles[1].fmt as Record<string, unknown>).fontSize).toBeNull();
    expect(errors).toEqual([]);
  });

  test('說話者與日期：泡泡外上方＋旁邊、泡泡裡、不顯示', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    const s0 = await scene(page);
    await page.getByTestId('bubble-speaker').fill('小明');
    await page.getByTestId('bubble-speaker').blur();
    await page.getByTestId('bubble-time').fill('下午 2:30');
    await page.getByTestId('bubble-time').blur();
    const s1 = await scene(page);
    expect(s1.height).toBeGreaterThan(s0.height);
    expect(s1.width).toBeGreaterThan(s0.width);
    await tab(page, '樣式');
    await page.getByRole('radio', { name: '靠右（1）' }).click();
    await pickSelect(page, '顯示位置', '泡泡裡的最下面');
    const s2 = await scene(page);
    expect(s2.items[0].h).toBeGreaterThan(s1.items[0].h);
    await pickSelect(page, '顯示位置', '不顯示');
    const s3 = await scene(page);
    expect([s3.width, s3.height]).toEqual([s0.width, s0.height]);
    expect(errors).toEqual([]);
  });

  test('卡片底：底色、圓角、紋理；正方形、限動、橫幅、最小高度；頁首頁尾；第一格就有卡片', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await set(page, { idle: 'none' });
    await tab(page, '版面');
    await page.getByRole('switch', { name: '畫卡片底' }).click();
    await commitHex(page, '底色', '#204060');
    await seek(page, 0);
    await expect.poll(() => pixel(page, 3, 3)).toEqual([0x20, 0x40, 0x60, 255]);
    /* 比例 */
    await page.getByRole('radio', { name: '正方形（1:1）' }).click();
    let s = await scene(page);
    expect(s.width).toBe(s.height);
    await page.getByRole('radio', { name: '限動（9:16）' }).click();
    s = await scene(page);
    expect(s.width * 16).toBe(s.height * 9);
    await page.getByRole('radio', { name: '橫幅（16:9）' }).click();
    s = await scene(page);
    expect(s.width * 9).toBe(s.height * 16);
    await page.getByRole('radio', { name: '自動', exact: true }).click();
    const auto = await scene(page);
    await fillNumber(page, '最小高度', 400);
    s = await scene(page);
    expect([s.width, s.height]).toEqual([auto.width, 400]);
    await fillNumber(page, '最小高度', 0);
    /* 頁首頁尾與分隔線 */
    await page.getByTestId('card-header').fill('第三章　霧之港');
    await page.getByTestId('card-header').blur();
    await page.getByRole('radio', { name: '雙線' }).click();
    s = await scene(page);
    expect(s.height).toBeGreaterThan(auto.height + 30);
    /* 紋理：方格的線和底色不同 */
    await pickSelect(page, '紋理', '方格');
    await seek(page, 0);
    await expect.poll(async () => (await pixel(page, 40, 8)).join()).not.toBe('32,64,96,255');
    expect(await pixel(page, 45, 8)).toEqual([0x20, 0x40, 0x60, 255]);
    /* 卡片圓角：角落外透明 */
    await fillNumber(page, '卡片圓角', 30);
    await expect.poll(async () => (await pixel(page, 0, 0))[3]).toBe(0);
    /* 匯出的 APNG：第一格就有卡片底（泡泡還沒出現） */
    s = await scene(page);
    const apng = await exportAs(page, 'APNG');
    const a = parseApng(apng.bytes);
    expect(a.ihdr).toMatchObject({ width: s.width, height: s.height });
    const first = composeApng(a)[0];
    const k = (35 * s.width + 35) * 4;
    expect(Array.from(first.subarray(k, k + 4))).toEqual([0x20, 0x40, 0x60, 255]);
    expect(first[3]).toBe(0);
    expect(errors).toEqual([]);
  });

  test('背景圖：放進卡片、專案檔存成 ZIP（含圖片）並讀回；第 1 版的專案檔照常開', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await set(page, { idle: 'none' });
    await tab(page, '版面');
    await page.getByRole('switch', { name: '畫卡片底' }).click();
    const png = await solidPng(page, '#ff0000');
    await page
      .getByRole('group', { name: '把背景圖拖到這裡' })
      .locator('input[type=file]')
      .setInputFiles({ name: '背景.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByRole('button', { name: '移除背景圖' })).toBeVisible();
    const id = (await data(page)).card as Record<string, unknown>;
    expect(id.image).toMatch(/^[0-9a-z]+$/i);
    await seek(page, 0);
    await expect.poll(() => pixel(page, 3, 3)).toEqual([255, 0, 0, 255]);
    /* 專案檔：有背景圖時存成 ZIP（project.json＋files/圖片） */
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^對話泡泡_\d{8}\.zip$/);
    const zipBytes = readFileSync((await download.path())!);
    const files = unzipSync(new Uint8Array(zipBytes));
    const project = JSON.parse(new TextDecoder().decode(files['project.json']));
    expect(project).toMatchObject({ version: 3, data: { card: { bg: true, image: id.image } } });
    expect(Object.keys(files).some((f) => f.startsWith(`files/${id.image}`))).toBe(true);
    /* 移除後開回專案檔：背景圖回來 */
    await page.getByRole('button', { name: '移除背景圖' }).click();
    expect(((await data(page)).card as Record<string, unknown>).image).toBeNull();
    const openFile = async (name: string, mimeType: string, buffer: Buffer) => {
      await page.getByRole('button', { name: '專案' }).click();
      const [ch] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
      ]);
      await ch.setFiles({ name, mimeType, buffer });
      await page.getByRole('button', { name: '開啟', exact: true }).click();
    };
    await openFile('備份.zip', 'application/zip', zipBytes);
    await expect(page.getByRole('button', { name: '移除背景圖' })).toBeVisible();
    await seek(page, 0);
    await expect.poll(() => pixel(page, 3, 3)).toEqual([255, 0, 0, 255]);
    /* 第 1 版的專案檔（整合前存的）：沒有兩側的預設、卡片底 */
    const v1 = {
      format: 'trpg-toolkit-project',
      tool: 'speech-bubble',
      version: 1,
      savedAt: '2026-10-10T00:00:00.000Z',
      data: {
        presetId: 'chat-duo',
        fontSize: 22,
        bubbles: [
          {
            id: 'a',
            style: 'messenger',
            title: '',
            text: '舊的左邊',
            icon: 'none',
            button: '',
            align: 'left',
            colors: { fill: '#eceff3', border: '#00000000', text: '#1f2937', accent: '#94a3b8' },
          },
          {
            id: 'b',
            style: 'messenger',
            title: '',
            text: '舊的右邊',
            icon: 'none',
            button: '',
            align: 'right',
            colors: { fill: '#3b82f6', border: '#00000000', text: '#ffffff', accent: '#94a3b8' },
          },
        ],
      },
    };
    await openFile('舊的.json', 'application/json', Buffer.from(JSON.stringify(v1)));
    await tab(page, '泡泡');
    await expect.poll(() => editorText(page)).toBe('舊的左邊');
    const d = await data(page);
    expect(d.card).toMatchObject({ bg: false, image: null });
    const sides = d.sides as Record<string, { colors: Record<string, string> }>;
    expect(sides.left.colors.fill).toBe('#eceff3');
    expect(sides.right.colors.fill).toBe('#3b82f6');
    expect(d.bubbles.map((b) => b.custom)).toEqual([[], []]);
    expect(errors).toEqual([]);
  });

  test('自由拖曳：拖曳中畫布不變、放開後重算；方向鍵微調；一次拖曳一步復原；回到排列的位置', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    const s0 = await scene(page);
    await page.getByTestId('drag-toggle').click();
    await expect(page.getByTestId('drag-toggle')).toHaveAttribute('aria-pressed', 'true');
    const handle = page.locator('[data-drag-bubble]').nth(1);
    const box = (await handle.boundingBox())!;
    const zoom = box.width / s0.items[1].w;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++)
      await page.mouse.move(
        box.x + box.width / 2 - i * 10 * zoom,
        box.y + box.height / 2 + i * 5 * zoom,
      );
    /* 拖曳中：畫布大小與第一個泡泡不動 */
    const mid = await scene(page);
    expect([mid.width, mid.height]).toEqual([s0.width, s0.height]);
    expect(mid.items[0].x).toBeCloseTo(s0.items[0].x, 3);
    await page.mouse.up();
    let d = await data(page);
    expect([d.bubbles[1].dx, d.bubbles[1].dy]).toEqual([-80, 40]);
    const s1 = await scene(page);
    expect(s1.height).toBe(s0.height + 40);
    expect(s1.items[1].x - s1.items[0].x).toBeCloseTo(s0.items[1].x - s0.items[0].x - 80, 3);
    /* 方向鍵：1 px、Shift 10 px，每按一下一步 */
    await handle.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('ArrowUp');
    d = await data(page);
    expect([d.bubbles[1].dx, d.bubbles[1].dy]).toEqual([-70, 39]);
    await expect(page.getByTestId('bubble-offset')).toContainText('往左 70 px、往下 39 px');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    d = await data(page);
    expect([d.bubbles[1].dx, d.bubbles[1].dy]).toEqual([-80, 40]);
    await page.keyboard.press('Control+z');
    d = await data(page);
    expect([d.bubbles[1].dx, d.bubbles[1].dy]).toEqual([0, 0]);
    await page.keyboard.press('Control+Shift+z');
    await page.getByRole('button', { name: '回到排列的位置' }).click();
    d = await data(page);
    expect([d.bubbles[1].dx, d.bubbles[1].dy]).toEqual([0, 0]);
    expect(errors).toEqual([]);
  });

  test('樣式預設檔：套用內建（可以復原）、存成預設、匯出、刪除、匯入', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    await tab(page, '樣式');
    await page.getByRole('button', { name: '套用樣式：深夜咖啡' }).click();
    await page.getByRole('button', { name: '套用', exact: true }).click();
    let d = await data(page);
    expect(d.card).toMatchObject({ bg: true, color: '#1d1915', texture: 'grain' });
    expect((d.bubbles[0].colors as Record<string, string>).fill).toBe('#c7a063');
    await seek(page, 0);
    await expect.poll(async () => (await pixel(page, 20, 20))[3]).toBe(255);
    await page.keyboard.press('Control+z');
    expect(((await data(page)).card as Record<string, unknown>).bg).toBe(false);
    await page.keyboard.press('Control+Shift+z');
    /* 存成樣式預設 */
    await page.getByRole('button', { name: '存成樣式預設…' }).click();
    await page.getByRole('textbox', { name: '名稱' }).fill('我的深夜');
    await page.getByRole('button', { name: '存成樣式預設', exact: true }).click();
    const mine = page.locator('[data-style-preset]').filter({ hasText: '我的深夜' });
    await expect(mine).toHaveCount(1);
    expect((await prefs(page)).styles.map((s) => s.name)).toEqual(['我的深夜']);
    /* 匯出成檔案 */
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '匯出樣式檔：我的深夜' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('我的深夜.bubble-style.json');
    const file = readFileSync((await download.path())!, 'utf8');
    expect(JSON.parse(file)).toMatchObject({
      format: 'trpg-toolkit-bubble-style',
      version: 1,
      name: '我的深夜',
      card: { color: '#1d1915' },
    });
    /* 刪除 → 匯入 */
    await page.getByRole('button', { name: '刪除樣式：我的深夜' }).click();
    await page.getByRole('button', { name: '刪除', exact: true }).click();
    await expect(mine).toHaveCount(0);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: '匯入樣式檔…' }).click(),
    ]);
    await chooser.setFiles({
      name: '我的深夜.json',
      mimeType: 'application/json',
      buffer: Buffer.from(file),
    });
    await expect(mine).toHaveCount(1);
    /* 換成別的再套用匯入的 */
    await page.getByRole('button', { name: '套用樣式：留言本' }).click();
    await page.getByRole('button', { name: '套用', exact: true }).click();
    await page.getByRole('button', { name: '套用樣式：我的深夜' }).click();
    await page.getByRole('button', { name: '套用', exact: true }).click();
    d = await data(page);
    expect((d.card as Record<string, unknown>).color).toBe('#1d1915');
    expect(errors).toEqual([]);
  });

  test('複製圖片：全部出現的畫面放進剪貼簿', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await choose(page, 'chat-blue');
    const s = await scene(page);
    await page.getByRole('button', { name: '複製圖片' }).click();
    await expect(page.getByText('已複製圖片（全部出現的畫面）。').first()).toBeVisible();
    const size = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const blob = await item.getType('image/png');
      const bmp = await createImageBitmap(blob);
      return [bmp.width, bmp.height];
    });
    expect(size).toEqual([s.width, s.height]);
    expect(errors).toEqual([]);
  });
});

/* ---------- 驗證後的修正（規格 7.4） ---------- */

test.describe('驗證後的修正（7.4）', () => {
  const importText = (page: Page) => page.getByTestId('import-text');
  const dateOption = (page: Page, name: string) =>
    page.getByTestId('import-dialog').getByRole('radio', { name, exact: true });

  test('整段貼上：重開對話框時「日期時間」回到「只有時間」；Discord 的「阿明今天 14:30」與三行複製', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    await page.getByRole('button', { name: '整段貼上…' }).click();
    await importText(page).fill('阿明今天 14:30\n今天要開團嗎？\n小雨今天 14:31\n要！');
    await expect(page.getByTestId('import-status')).toHaveText('辨識為「Discord 訊息」，共 2 則。');
    const sp = page.getByTestId('import-speakers').locator('li');
    await expect(sp).toHaveCount(2);
    await expect(sp.nth(0)).toContainText('阿明');
    await expect(sp.nth(1)).toContainText('小雨');
    await expect(dateOption(page, '只有時間')).toBeChecked();
    await dateOption(page, '不帶入').click();
    await expect(dateOption(page, '不帶入')).toBeChecked();
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    /* 重開：都回到預設 */
    await page.getByRole('button', { name: '整段貼上…' }).click();
    await expect(importText(page)).toHaveValue('');
    await importText(page).fill('阿明\n—\n今天 21:03\n第一則\n小雨\n—\n今天 21:05\n收到');
    await expect(page.getByTestId('import-status')).toHaveText('辨識為「Discord 訊息」，共 2 則。');
    await expect(dateOption(page, '只有時間')).toBeChecked();
    await page.getByTestId('import-confirm').click();
    const d = await data(page);
    expect(d.bubbles.map((b) => [b.speaker, b.time, b.text])).toEqual([
      ['阿明', '今天 21:03', '第一則'],
      ['小雨', '今天 21:05', '收到'],
    ]);
    expect(errors).toEqual([]);
  });

  test('整段貼上：加入後會超過畫布的高度上限時先說明（不擋加入）', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    await page.getByRole('button', { name: '整段貼上…' }).click();
    const lines = Array.from(
      { length: 40 },
      (_, i) =>
        `21:${String(i).padStart(2, '0')}\t${i % 2 ? '小雨' : '阿明'}\t第 ${i + 1} 則：今天的團要開嗎？我已經準備好角色卡了`,
    );
    await importText(page).fill(lines.slice(0, 5).join('\n'));
    await expect(page.getByTestId('import-status')).toContainText('共 5 則');
    await expect(page.getByTestId('import-too-tall')).toHaveCount(0);
    await importText(page).fill(lines.join('\n'));
    await expect(page.getByTestId('import-status')).toContainText('共 40 則');
    await expect(page.getByTestId('import-too-tall')).toHaveText(
      '會超過畫布的高度上限，最後幾則會被切掉：可以縮小字級或間距，或分成兩張。',
    );
    await expect(page.getByTestId('import-confirm')).toBeEnabled();
    await page.getByTestId('import-confirm').click();
    expect((await data(page)).bubbles).toHaveLength(40);
    expect((await scene(page)).height).toBe(4096);
    expect(errors).toEqual([]);
  });

  test('樣式預設已經 30 組：存成樣式預設不打開命名對話框、匯入不選檔', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    /* 先存一組，再把清單撐到 30 組（存在這個瀏覽器的偏好） */
    await tab(page, '樣式');
    await page.getByRole('button', { name: '存成樣式預設…' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '存成樣式預設', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate((key) => {
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
      const one = raw.state.data.styles[0];
      raw.state.data.styles = Array.from({ length: 30 }, (_, i) => ({
        ...one,
        id: `st${i}`,
        name: `樣式 ${i + 1}`,
      }));
      localStorage.setItem(key, JSON.stringify(raw));
    }, `${STORAGE_KEY}:preview`);
    await page.reload();
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await tab(page, '樣式');
    await expect(page.locator('[data-style-preset]')).toHaveCount(35);
    let chooser = false;
    page.on('filechooser', () => {
      chooser = true;
    });
    await page.getByRole('button', { name: '存成樣式預設…' }).click();
    await expect(page.getByText('樣式預設最多 30 組，請先刪掉不用的。').first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: '存成樣式預設' })).toHaveCount(0);
    await page.getByRole('button', { name: '匯入樣式檔…' }).click();
    await page.waitForTimeout(300);
    expect(chooser).toBe(false);
    expect(errors).toEqual([]);
  });

  test('內文貼上超過 400 字：放進放得下的部分並說明（共用編輯器）', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await setText(page, '字'.repeat(395));
    await page.waitForTimeout(450);
    await text(page).evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n as Text;
      (el as HTMLElement).focus();
      const r = document.createRange();
      r.setStart(last as Text, (last as Text).length);
      r.collapse(true);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
    });
    await page.waitForTimeout(80);
    await text(page).evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'A'.repeat(50));
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect.poll(async () => ((await data(page)).bubbles[0].text as string).length).toBe(400);
    expect(((await data(page)).bubbles[0].text as string).endsWith('字AAAAA')).toBe(true);
    await expect(page.getByText('超過上限的部分沒有貼上（最多 400 字）。').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('雲朵大小 0.5、留白 0：長的想法泡泡頂端不會被切平（和 1 倍一樣只碰到邊）', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'comic-thought');
    const topRow = async (puff: number) => {
      const d = await data(page);
      const b0 = d.bubbles[0] as Record<string, unknown>;
      await set(page, {
        idle: 'none',
        margin: 0,
        bubbles: [
          {
            ...b0,
            title: '',
            text: '幫我看一下角色卡\n第二行比較長的文字喔',
            fmt: { ...(b0.fmt as object), cloudPuff: puff },
          },
        ],
      });
      const s = await scene(page);
      await seek(page, s.ready + 0.2);
      await page.waitForTimeout(150);
      return canvas(page).evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const row = c.getContext('2d')!.getImageData(0, 0, c.width, 1).data;
        let n = 0;
        for (let i = 3; i < row.length; i += 4) if (row[i] > 128) n++;
        return n;
      });
    };
    const one = await topRow(1);
    const half = await topRow(0.5);
    expect(half).toBeLessThanOrEqual(one + 6);
    expect(errors).toEqual([]);
  });

  test('畫布大小的按鈕字是「正方形」', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-duo');
    await tab(page, '版面');
    await expect(page.getByRole('radio', { name: '正方形（1:1）' })).toHaveText('正方形');
    expect(errors).toEqual([]);
  });
});

/* ---------- 部分文字格式（2026-10 第二步） ---------- */

test.describe('部分文字格式（2026-10 第二步）', () => {
  const toolbar = (page: Page) => page.getByRole('toolbar', { name: '內文文字格式' });
  const mark = (page: Page, name: string) =>
    toolbar(page).getByRole('button', { name: new RegExp(`^${name}`) });
  type Run = { text: string; bold: boolean; color: string } & Record<string, unknown>;
  const runs = async (page: Page): Promise<Run[] | null> => {
    const b = (await data(page)).bubbles[0] as { rich?: { lines: { runs: Run[] }[] } };
    return b.rich ? b.rich.lines[0].runs : null;
  };

  /** 選取內文裡的一段字（第一個出現的地方；不跨段落） */
  async function selectText(page: Page, s: string) {
    await text(page).evaluate((el, s) => {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
      const all = nodes.map((n) => n.nodeValue ?? '').join('');
      const i = all.indexOf(s);
      if (i < 0) throw new Error(`找不到「${s}」`);
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
      r.setEnd(...at(i + s.length, true));
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
    }, s);
    await page.waitForTimeout(80);
  }

  /** 游標放在某段字後面 */
  async function caretAfter(page: Page, s: string) {
    await text(page).evaluate((el, s) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.nodeValue ?? '').indexOf(s);
        if (i < 0) continue;
        (el as HTMLElement).focus();
        const r = document.createRange();
        r.setStart(n, i + s.length);
        r.collapse(true);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(r);
        return;
      }
      throw new Error(`找不到「${s}」`);
    }, s);
    await page.waitForTimeout(80);
  }

  type Box = { x: number; y: number; w: number; h: number };
  interface Ink {
    /** 接近 color 的像素數 */
    count: number;
    /** 同一列裡最長的連續一段 */
    run: number;
    /** 每一欄的數量（看字形的變化） */
    cols: number[];
  }
  /** 一塊範圍裡接近某個顏色的像素（px：RGBA，寬 width） */
  function inkOf(px: ArrayLike<number>, width: number, box: Box, color: number[], tol = 48): Ink {
    let count = 0;
    let best = 0;
    const cols: number[] = [];
    for (let y = Math.ceil(box.y); y < box.y + box.h; y++) {
      let run = 0;
      for (let x = Math.ceil(box.x), k = 0; x < box.x + box.w; x++, k++) {
        const i = (y * width + x) * 4;
        const ok =
          px[i + 3] > 200 &&
          Math.abs(px[i] - color[0]) <= tol &&
          Math.abs(px[i + 1] - color[1]) <= tol &&
          Math.abs(px[i + 2] - color[2]) <= tol;
        if (ok) {
          count++;
          run++;
          best = Math.max(best, run);
          cols[k] = (cols[k] ?? 0) + 1;
        } else run = 0;
      }
    }
    return { count, run: best, cols };
  }
  /** 預覽畫布的像素 */
  async function previewPixels(page: Page): Promise<{ width: number; px: number[] }> {
    return canvas(page).evaluate((el) => {
      const c = el as HTMLCanvasElement;
      return {
        width: c.width,
        px: Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data),
      };
    });
  }
  /** 預覽畫布上的 inkOf */
  async function previewInk(page: Page, box: Box, color: number[]): Promise<Ink> {
    const { width, px } = await previewPixels(page);
    return inkOf(px, width, box, color);
  }
  /** 每一列「比之前亮」的像素數（白字加刪除線：只有一兩列、約兩個字寬） */
  function brighterRows(a: ArrayLike<number>, b: ArrayLike<number>, width: number, box: Box) {
    const out: number[] = [];
    for (let y = Math.ceil(box.y); y < box.y + box.h; y++) {
      let n = 0;
      for (let x = Math.ceil(box.x); x < box.x + box.w; x++) {
        const i = (y * width + x) * 4;
        const lum = (p: ArrayLike<number>) => p[i] + p[i + 1] + p[i + 2];
        if (lum(b) - lum(a) > 30) n++;
      }
      out.push(n);
    }
    return out;
  }
  const colDiff = (a: number[], b: number[]) => {
    let d = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    return d;
  };

  test('選取文字套粗體、斜體、刪除線、文字顏色：預覽與匯出的 PNG 看得到；一次套用一步復原；重新整理後還在', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await set(page, { idle: 'none' });
    await setText(page, '格式測試文字');
    await page.waitForTimeout(450);
    const fs = (await data(page)).fontSize as number;
    const WHITE = [255, 255, 255];
    const RED = [0xd9, 0x3f, 0x3f];
    const still = async () => {
      const s = await scene(page);
      await seek(page, s.ready + 0.2);
      await page.waitForTimeout(120);
      return s.items[0];
    };
    let box = await still();
    const plain = await previewInk(page, box, WHITE);
    expect(plain.count).toBeGreaterThan(100);
    expect(plain.run).toBeLessThan(fs * 1.3);
    expect((await previewInk(page, box, RED)).count).toBe(0);

    /* 粗體：選取的兩個字 */
    await selectText(page, '格式');
    await mark(page, '粗體').click();
    await expect
      .poll(() => runs(page))
      .toEqual([
        { text: '格式', bold: true, color: '' },
        { text: '測試文字', bold: false, color: '' },
      ]);
    box = await still();
    const bold = await previewInk(page, box, WHITE);
    expect(bold.count).toBeGreaterThan(plain.count * 1.02);

    /* 斜體 */
    await page.waitForTimeout(450);
    await selectText(page, '測試');
    await mark(page, '斜體').click();
    await expect.poll(async () => (await runs(page))?.[1]).toMatchObject({ italic: true });
    box = await still();
    const italic = await previewInk(page, box, WHITE);
    expect(colDiff(italic.cols, bold.cols)).toBeGreaterThan(40);

    /* 刪除線：兩個字寬的一條橫線（和套用前比，同一列連續變亮） */
    const noStrike = await previewPixels(page);
    await page.waitForTimeout(450);
    await selectText(page, '文字');
    await mark(page, '刪除線').click();
    await expect.poll(async () => (await runs(page))?.[2]).toMatchObject({ strike: true });
    box = await still();
    const struck = await previewPixels(page);
    const rowsOn = brighterRows(noStrike.px, struck.px, struck.width, box);
    expect(Math.max(...rowsOn)).toBeGreaterThan(fs * 0.9);
    expect(rowsOn.filter((n) => n > 5).length).toBeLessThanOrEqual(4);

    /* 文字顏色：常用色（紅） */
    await page.waitForTimeout(450);
    await selectText(page, '格式測試文字');
    await toolbar(page).locator('[data-color-button="text"]').click();
    const pop = page.getByRole('dialog', { name: '文字顏色' });
    await pop.getByRole('button', { name: '套用 #d93f3f' }).click();
    await expect
      .poll(async () => (await runs(page))?.every((r) => r.color === '#d93f3f'))
      .toBe(true);
    await page.keyboard.press('Escape');
    box = await still();
    expect((await previewInk(page, box, RED)).count).toBeGreaterThan(80);

    /* 匯出的 PNG（全部出現的畫面）也看得到 */
    const png = await exportAs(page, 'PNG');
    const chunks = parseChunks(png.bytes);
    const ihdr = readIhdr(chunks);
    const idat = chunks.filter((c) => c.type === 'IDAT');
    const all = new Uint8Array(idat.reduce((x, c) => x + c.data.length, 0));
    let o = 0;
    for (const c of idat) {
      all.set(c.data, o);
      o += c.data.length;
    }
    const px = decodePixels(all, ihdr.width, ihdr.height, ihdr.colorType);
    expect(inkOf(px, ihdr.width, box, RED).count).toBeGreaterThan(80);
    /* 和預覽（全部出現的畫面）一樣：粗體、斜體、刪除線、顏色都在 */
    const shown = await previewPixels(page);
    expect(ihdr.width).toBe(shown.width);
    let diff = 0;
    for (let y = Math.ceil(box.y); y < box.y + box.h; y++)
      for (let x = Math.ceil(box.x); x < box.x + box.w; x++) {
        const i = (y * shown.width + x) * 4;
        if ([0, 1, 2, 3].some((k) => Math.abs(px[i + k] - shown.px[i + k]) > 8)) diff++;
      }
    expect(diff).toBeLessThan(box.w * box.h * 0.01);

    /* 復原：一次套用＝一步（先拿掉顏色，再拿掉刪除線）；重做 */
    await page.waitForTimeout(450);
    await caretAfter(page, '文字');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await runs(page))?.every((r) => r.color === '')).toBe(true);
    expect((await runs(page))?.[2]).toMatchObject({ strike: true });
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await runs(page))?.some((r) => r.strike)).toBe(false);
    expect((await runs(page))?.[1]).toMatchObject({ italic: true });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await runs(page))?.[2]).toMatchObject({ strike: true });
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await runs(page))?.[0].color).toBe('#d93f3f');

    /* 重新整理後還在（編輯區也顯示格式） */
    await page.waitForTimeout(600);
    const before = await runs(page);
    await page.reload();
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await expect.poll(() => runs(page)).toEqual(before);
    await expect(text(page).locator('span', { hasText: '格式' })).toHaveCSS('font-weight', '700');
    await expect(text(page).locator('span', { hasText: '文字' })).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );
    expect(errors).toEqual([]);
  });

  test('沒有選取時接下來打的字用這個格式；快捷鍵（B、I、U、Shift＋X）、底線、清除格式；整個泡泡的斜體與底線', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await setText(page, '一二三');
    await page.waitForTimeout(450);
    /* 沒有選取：Ctrl＋B 之後打的字是粗體 */
    await caretAfter(page, '一二三');
    await page.keyboard.press('ControlOrMeta+b');
    await expect(mark(page, '粗體')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.type('AB');
    await expect
      .poll(() => runs(page))
      .toEqual([
        { text: '一二三', bold: false, color: '' },
        { text: 'AB', bold: true, color: '' },
      ]);
    /* 快捷鍵：底線、斜體、刪除線（每一個一步） */
    await page.waitForTimeout(450);
    await selectText(page, '一二');
    await page.keyboard.press('ControlOrMeta+u');
    await expect.poll(async () => (await runs(page))?.[0]).toMatchObject({ underline: true });
    await page.waitForTimeout(450);
    await page.keyboard.press('ControlOrMeta+i');
    await page.waitForTimeout(450);
    await page.keyboard.press('ControlOrMeta+Shift+x');
    await expect
      .poll(async () => (await runs(page))?.[0])
      .toEqual({
        text: '一二',
        bold: false,
        color: '',
        italic: true,
        strike: true,
        underline: true,
      });
    await expect(mark(page, '底線')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(450);
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(async () => (await runs(page))?.[0])
      .toEqual({ text: '一二', bold: false, color: '', italic: true, underline: true });
    /* 底線按鈕：再按一次拿掉 */
    await page.waitForTimeout(450);
    await selectText(page, '一二');
    await mark(page, '底線').click();
    await expect.poll(async () => (await runs(page))?.[0].underline).toBeUndefined();
    /* 清除格式：全部變回純文字（沒有 rich） */
    await page.waitForTimeout(450);
    await selectText(page, '一二三AB');
    await mark(page, '清除格式').click();
    await expect.poll(() => runs(page)).toBeNull();
    expect((await data(page)).bubbles[0].text).toBe('一二三AB');
    /* 整個泡泡的斜體與底線（這個泡泡的樣式；標示單獨調整） */
    await page.getByRole('button', { name: '這個泡泡的樣式' }).click();
    const whole = page.getByTestId('whole-text').first();
    await whole.getByRole('switch', { name: '斜體' }).click();
    await whole.getByRole('switch', { name: '底線' }).click();
    const fmt = (await data(page)).bubbles[0].fmt as Record<string, unknown>;
    expect(fmt).toMatchObject({ italic: true, strike: false, underline: true });
    expect((await data(page)).bubbles[0].custom).toEqual(
      expect.arrayContaining(['italic', 'underline']),
    );
    await expect(whole.locator('[data-custom-badge]')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('沒有選取時按粗體再打字（一般輸入）＝打的字是粗體、一步復原；輸入法組字中不改內容、Ctrl＋Z 不作用', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await setText(page, '甲乙');
    await page.waitForTimeout(450);
    const cdp = await page.context().newCDPSession(page);
    /*
     * 沒有選取時按粗體，再打字（一般輸入 insertText）：打的字是粗體。
     * 「先按格式再用輸入法組字」會被共用的 RichTextEditor 丟掉格式（組字開始時 selectionchange 清掉 pending），
     * 由 prose-card 那邊修共用元件；修好之前這裡用一般輸入驗。
     */
    await caretAfter(page, '甲乙');
    await page.keyboard.press('ControlOrMeta+b');
    await cdp.send('Input.insertText', { text: '八' });
    await expect
      .poll(() => runs(page))
      .toEqual([
        { text: '甲乙', bold: false, color: '' },
        { text: '八', bold: true, color: '' },
      ]);
    /* 一步復原 */
    await page.waitForTimeout(450);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await data(page)).bubbles[0].text).toBe('甲乙');
    await expect.poll(() => editorText(page)).toBe('甲乙');
    expect(await runs(page)).toBeNull();
    /* 輸入法組字：組字中內容不變；組字中按 Ctrl＋Z 不會復原掉前面的字；確定後才寫進內文 */
    await caretAfter(page, '甲乙');
    await cdp.send('Input.imeSetComposition', { text: 'ㄉ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', {
      text: 'ㄉㄧ',
      selectionStart: 2,
      selectionEnd: 2,
    });
    expect((await data(page)).bubbles[0].text).toBe('甲乙');
    await page.keyboard.press('ControlOrMeta+z');
    expect((await data(page)).bubbles[0].text).toBe('甲乙');
    await cdp.send('Input.insertText', { text: '丁' });
    await expect.poll(async () => (await data(page)).bubbles[0].text).toBe('甲乙丁');
    await page.keyboard.type('丙');
    await expect.poll(async () => (await data(page)).bubbles[0].text).toBe('甲乙丁丙');
    expect(errors).toEqual([]);
  });
});

/* ---------- 版面與視覺基準 ---------- */

test.describe('版面與視覺基準', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('1280 寬：範本一覽與編輯畫面', async ({ page }) => {
    const errors = await open(page);
    await noHorizontalScroll(page, '範本一覽：');
    await expect(page).toHaveScreenshot('speech-bubble-gallery-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await choose(page, 'chat-duo');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('speech-bubble-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });

  test('390 寬：每個畫面與分頁都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page, '範本一覽：');
    await choose(page, 'window-warn');
    for (const name of ['樣式', '動畫', '版面', '泡泡']) {
      await tab(page, name);
      await noHorizontalScroll(page, `${name}：`);
    }
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('speech-bubble-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
