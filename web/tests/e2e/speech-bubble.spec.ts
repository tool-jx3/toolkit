/**
 * 動態對話泡泡產生器（建置產物 next/speech-bubble/）的端對端測試（規格 docs/refactor/specs/speech-bubble.md）：
 * - 範本一覽：開頁沒有錯誤、28 張卡片、分類、搜尋（多關鍵字、全形）、結果數、沒有結果與清除篩選、`/`、縮圖背景與播放（記住）；
 * - 點卡片進入編輯、範本列（已修改、上一個／下一個、［］）、回到一覽與繼續編輯；
 * - 泡泡：內文、標題、位置、新增（照抄造型）、複製、刪除、排序、上限、換造型換配色、配色、恢復預設、套用到全部、圖示與按鈕欄；
 * - 動畫與版面的設定反映到時間表與畫布尺寸；空白泡泡；
 * - 預覽像素（第一格空的、全部出現時有泡泡的底色）；
 * - 匯出：APNG（尺寸、無限循環、格數、總長、第一格透明、中間有泡泡）、GIF、WebP、PNG、連番 PNG 的 ZIP、檔名；
 * - 自動儲存與還原、復原／重做、專案檔（存、開、重設）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺基準。
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
const text = (page: Page) => page.getByTestId('bubble-text');
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
    await page.getByRole('radio', { name: '透明', exact: true }).click();
    await expect.poll(async () => (await corner())[3]).toBe(0);
    await motion.click();
    await expect(motion).toBeChecked();
    await page.reload();
    await expect(page.getByRole('switch', { name: '縮圖一起播放' })).toBeChecked();
    await expect(page.getByRole('radio', { name: '透明', exact: true })).toHaveAttribute(
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
    await text(page).fill('改過了');
    await expect(presetName(page)).toContainText('已修改');
    /* 回到一覽：繼續編輯、勾勾 */
    await page.getByRole('button', { name: '範本一覽' }).click();
    await expect(page.getByText('目前的內容：擲骰成功通知')).toBeVisible();
    await expect(card(page, 'toast-success')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await expect(text(page)).toHaveValue('改過了');
    expect(errors).toEqual([]);
  });
});

/* ---------- 泡泡 ---------- */

test.describe('泡泡', () => {
  test('內文、標題、位置反映到預覽；新增、複製、刪除、排序、上限', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    await expect(rows(page)).toHaveCount(1);
    await text(page).fill('第一行\n第二行很長很長很長很長很長很長很長很長很長很長很長很長很長很長');
    await text(page).blur();
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
    await expect(text(page)).toHaveValue('新的泡泡');
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
    await text(page).fill('第三個');
    await text(page).blur();
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
    /* 上限 12 */
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: '新增泡泡' }).click();
    await expect(rows(page)).toHaveCount(12);
    await expect(page.getByRole('button', { name: '新增泡泡' })).toBeDisabled();
    await expect(page.getByText('最多 12 個泡泡。')).toBeVisible();
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
    await text(page).fill('');
    await text(page).blur();
    let s = await scene(page);
    expect(s.items).toHaveLength(1);
    expect(s.items[0].enter0).toBe(0);
    await rows(page).nth(1).click();
    await text(page).fill('   ');
    await text(page).blur();
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
    await text(page).fill('存檔測試');
    await text(page).blur();
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
    await expect(text(page)).toHaveValue('存檔測試');
    expect(errors).toEqual([]);
  });

  test('復原／重做：文字欄離開算一步、按鈕與快捷鍵', async ({ page }) => {
    const errors = await open(page);
    await choose(page, 'chat-blue');
    const before = (await data(page)).bubbles[0].text;
    await text(page).fill('一');
    await text(page).fill('一二');
    await text(page).fill('一二三');
    await text(page).blur();
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
    await text(page).fill('專案檔測試');
    await text(page).blur();
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
      version: 1,
      data: { presetId: 'hud-scan', bubbles: [{ style: 'hud', text: '專案檔測試' }], fps: 16 },
    });
    await text(page).fill('改掉了');
    await text(page).blur();
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
    await expect(text(page)).toHaveValue('專案檔測試');
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
    await expect(text(page)).toHaveValue('專案檔測試');
    /* 重設：回到預設範本與範本一覽 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設…' }).click();
    await page.getByRole('button', { name: '重設', exact: true }).click();
    await expect(page.getByTestId('gallery')).toBeVisible();
    expect((await data(page)).presetId).toBe('chat-blue');
    await expect(page.getByRole('button', { name: '繼續編輯' })).toHaveCount(0);
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
    for (const name of ['動畫', '版面', '泡泡']) {
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
