/**
 * 切入素材產生器的端對端測試（測建置產物 next/cutin/）：
 * - 開頁的範本一覽、用途選擇、套用範本、已修改與恢復範本外觀、回到一覽、重新整理；
 * - 用途切換與「手動改過」、檢查清單的各條件；外觀、動態、匯出設定的條件顯示、進階設定的記憶；
 * - 預覽（減少動態時靜止、播放按鈕、空白提示、預覽像素＝匯出的影格）；
 * - 匯出 APNG／GIF／PNG（解析檔案結構、延遲、循環、透明度、檔名）、結果對話框、決定性、自動縮小、匯出失敗；
 * - 分享連結的來回、損壞的連結、錯誤畫面；390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { composeApng, decodePixels, parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('cutin') ?? { id: 'cutin', status: 'next' })}/`;

async function open(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL + hash);
  return errors;
}

const card = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const templateName = (page: Page) => page.getByTestId('template-name');
const summary = (page: Page) => page.getByTestId('export-summary');
const checklist = (page: Page) => page.getByRole('status', { name: '檢查結果' });
const radio = (page: Page, group: string, name: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name }).click();
const advanced = (page: Page) => page.getByRole('switch', { name: '顯示進階設定' });
const set = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate(
    (p) => (window as unknown as { __cutin: { set(p: unknown): void } }).__cutin.set(p),
    patch,
  );
const settings = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __cutin: { settings(): Record<string, unknown> } }).__cutin.settings(),
  );

async function choose(page: Page, name: string) {
  await card(page, name).click();
  await expect(templateName(page)).toContainText(name);
}

async function exportAndDownload(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog', { name: '匯出完成' });
  await expect(dialog).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(readFileSync(await download.path())),
    dialog,
  };
}

async function noHorizontalScroll(page: Page, what = '') {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, `${what}不應出現橫向捲動`).toBeLessThanOrEqual(cw);
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test.describe('範本一覽與範本', () => {
  test('開頁先顯示範本一覽：用途選擇（提示、格式、上限、尺寸）與三類 14 張範本', async ({
    page,
  }) => {
    const errors = await open(page);
    await expect(page.getByTestId('gallery')).toBeVisible();
    await expect(page.getByRole('heading', { name: '先選一個範本' })).toBeVisible();
    await expect(
      page.getByRole('list', { name: '克蘇魯（CoC）常用範本' }).getByRole('button'),
    ).toHaveCount(6);
    await expect(page.getByRole('list', { name: '通用範本' }).getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('list', { name: '外觀風格範本' }).getByRole('button')).toHaveCount(
      5,
    );
    await expect(page.getByRole('button', { name: '繼續編輯' })).toHaveCount(0);
    /* 用途 */
    await expect(radio(page, '用途', 'CCFOLIA 切入演出')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('target-summary')).toContainText('APNG、GIF、PNG 靜態圖');
    await expect(page.getByTestId('target-summary')).toContainText('976.6 KB');
    await expect(page.getByTestId('target-summary')).toContainText('480 × 480');
    await radio(page, '用途', 'Discord 伺服器貼圖').hover();
    await expect(page.getByRole('tooltip')).toContainText('尺寸固定 320 × 320');
    await radio(page, '用途', 'Discord 伺服器貼圖').click();
    await expect(page.getByTestId('target-summary')).toContainText('500.0 KB');
    await expect(page.getByTestId('target-summary')).toContainText('320 × 320');
    await expect(page.getByTestId('target-summary')).toContainText('尺寸固定');
    /* 縮圖：停留時播放 */
    await card(page, '霓虹夜城').hover();
    await expect(card(page, '霓虹夜城').locator('canvas')).toBeVisible();
    /* 點卡片進入編輯畫面：文字換成範本的範例文字，用途帶過來 */
    await choose(page, '大成功');
    await expect(page.getByRole('textbox', { name: '文字', exact: true })).toHaveValue('大成功！');
    await expect(radio(page, '用途', 'Discord 伺服器貼圖')).toHaveAttribute('aria-checked', 'true');
    await tab(page, '匯出');
    await expect(summary(page)).toContainText(
      '320 × 320・12 格・20 fps・一個循環 0.60 秒・上限 500.0 KB',
    );
    await expect(page.getByTestId('fixed-size-note')).toContainText('320 × 320');
    /* 回到範本一覽：設定保留，可以繼續編輯 */
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('自己的字');
    await page.getByRole('button', { name: '回到範本一覽' }).click();
    await expect(page.getByTestId('gallery')).toBeVisible();
    await expect(radio(page, '用途', 'Discord 伺服器貼圖')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await expect(page.getByRole('textbox', { name: '文字', exact: true })).toHaveValue('自己的字');
    /* 重新整理：回到範本一覽（設定已自動儲存） */
    await page.reload();
    await expect(page.getByTestId('gallery')).toBeVisible();
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await expect(page.getByRole('textbox', { name: '文字', exact: true })).toHaveValue('自己的字');
    expect(errors).toEqual([]);
  });

  test('範本套用的保留欄位、已修改與恢復範本外觀', async ({ page }) => {
    const errors = await open(page);
    await choose(page, '大成功');
    await expect(templateName(page)).not.toContainText('已修改');
    /* 只改文字或匯出設定不算修改 */
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('換掉的文字');
    await advanced(page).click();
    await tab(page, '匯出');
    await page.getByRole('slider', { name: 'fps' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(summary(page)).toContainText('19 fps');
    await expect(templateName(page)).not.toContainText('已修改');
    await expect(page.getByRole('button', { name: '恢復範本外觀' })).toHaveCount(0);
    /* 改配色＝已修改 */
    await tab(page, '外觀');
    await radio(page, '配色', '黑白').click();
    await expect(templateName(page)).toContainText('已修改');
    /* 改種子也算 */
    await tab(page, '動態');
    await page.getByRole('slider', { name: '隨機種子' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: '恢復範本外觀' }).click();
    await expect(templateName(page)).not.toContainText('已修改');
    await tab(page, '外觀');
    await expect(radio(page, '配色', '彩虹金框')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('textbox', { name: '文字', exact: true })).toHaveValue(
      '換掉的文字',
    );
    expect((await settings(page)).seed).toBe(12346);
    /* 再套另一個範本：文字換掉，手動改過的 fps 保留、種子保留 */
    await page.getByRole('button', { name: '回到範本一覽' }).click();
    await choose(page, '勝利');
    await expect(page.getByRole('textbox', { name: '文字', exact: true })).toHaveValue('勝利！');
    const s = await settings(page);
    expect([s.fps, s.frames, s.seed, s.style, s.palette, s.fx, s.motion]).toEqual([
      19,
      15,
      12346,
      'extrude',
      'gold',
      'confetti',
      'bounce',
    ]);
    expect(errors).toEqual([]);
  });
});

test.describe('用途、檢查清單與設定', () => {
  test('用途切換與手動改過；檢查清單逐條件', async ({ page }) => {
    const errors = await open(page);
    await choose(page, '大成功');
    await expect(checklist(page)).toContainText('沒有問題');
    await tab(page, '匯出');
    /* 附件：GIF、720 × 720、30 格 30 fps、Discord 暗色底 */
    await radio(page, '用途', 'Discord 訊息附件').click();
    await expect(summary(page)).toContainText(
      '720 × 720・30 格・30 fps・一個循環 1.00 秒・上限 7.63 MB',
    );
    await expect(radio(page, '格式', 'GIF')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'APNG（此用途不能用）' })).toHaveAttribute(
      'data-unsupported',
      '',
    );
    await advanced(page).click();
    await expect(page.getByTestId('gif-matte-value')).toHaveText('#313338');
    /* 合成底色時沒有一階透明的警告；不合成時有 */
    await expect(checklist(page)).not.toContainText('GIF 的透明只有');
    await page.getByRole('button', { name: '不合成', exact: true }).click();
    await expect(page.getByTestId('gif-matte-value')).toHaveText('不合成');
    await expect(checklist(page).locator('[data-level="warning"]')).toContainText('GIF 的透明只有');
    /* 選了這個用途不收的格式：錯誤（仍然可以選） */
    await page.getByRole('radio', { name: 'APNG（此用途不能用）' }).click();
    await expect(checklist(page).locator('[data-level="error"]')).toContainText('不接受 APNG');
    await expect(page.getByTestId('gif-matte-value')).toHaveCount(0);
    /* 回到 CCFOLIA：手動選的 APNG 保留；改過的 GIF 底色（不合成）也保留 */
    await radio(page, '用途', 'CCFOLIA 切入演出').click();
    await expect(summary(page)).toContainText('480 × 480・15 格・20 fps');
    await expect(radio(page, '格式', 'APNG')).toHaveAttribute('aria-checked', 'true');
    /* CCFOLIA＋GIF＋底色：資訊 */
    await radio(page, '格式', 'GIF').click();
    await page.getByRole('button', { name: 'Discord 暗色' }).click();
    await expect(checklist(page).locator('[data-level="info"]')).toContainText('合成底色後');
    /* 手動改過的 fps 在切換用途時保留；固定尺寸一律強制 */
    await page.getByRole('slider', { name: 'fps' }).focus();
    await page.keyboard.press('End');
    await radio(page, '用途', 'Discord 伺服器貼圖').click();
    await expect(summary(page)).toContainText('320 × 320・12 格・30 fps');
    await expect(radio(page, '格式', 'APNG')).toHaveAttribute('aria-checked', 'true');
    await radio(page, '用途', 'CCFOLIA 切入演出').click();
    await expect(summary(page)).toContainText('480 × 480・15 格・30 fps');
    /* 尺寸按鈕（選取狀態）與寬高欄（限制在 64～1600） */
    await page.getByRole('button', { name: /寬螢幕/ }).click();
    await expect(page.getByRole('button', { name: /寬螢幕/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(summary(page)).toContainText('800 × 450・15 格・20 fps');
    expect((await settings(page)).contentScale).toBe(1);
    await page.getByRole('button', { name: /大方形/ }).click();
    expect((await settings(page)).contentScale).toBe(0.72);
    await expect(summary(page)).toContainText('600 × 600・18 格・20 fps');
    const w = page.getByRole('spinbutton', { name: '寬' });
    await w.fill('5000');
    await w.press('Enter');
    await expect(w).toHaveValue('1600');
    await page.getByRole('spinbutton', { name: '高' }).fill('1600');
    await page.getByRole('spinbutton', { name: '高' }).press('Enter');
    await page.getByRole('slider', { name: '影格數' }).focus();
    await page.keyboard.press('End');
    await expect(checklist(page).locator('[data-level="error"]')).toContainText(
      '尺寸 × 影格數太大',
    );
    await page.getByRole('slider', { name: '影格數' }).focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('PageUp');
    await expect(checklist(page).locator('[data-level="warning"]')).toContainText(
      '尺寸 × 影格數很大',
    );
    /* 色數：0 時標示無損 */
    await page.getByRole('slider', { name: '色數' }).focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('colors-value')).toHaveText('無損');
    /* 字數：超過用途或字型建議 → 警告色＋檢查清單 */
    await radio(page, '用途', 'Discord 伺服器貼圖').click();
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('一二三四五\n六七八九');
    await expect(page.getByTestId('char-count')).toHaveText('9／8 字');
    await expect(page.getByTestId('char-count')).toHaveAttribute('data-over', '');
    await expect(checklist(page)).toContainText('字數超過 Discord 伺服器貼圖的建議');
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('👍🏽好');
    await expect(page.getByTestId('char-count')).toHaveText('2／8 字');
    expect(errors).toEqual([]);
  });

  test('外觀、動態的條件顯示；進階設定記在瀏覽器', async ({ page }) => {
    const errors = await open(page);
    await choose(page, '大成功');
    await expect(advanced(page)).not.toBeChecked();
    await expect(page.getByTestId('background-field')).toHaveCount(0);
    /* 字型：11 套，名稱用字型本身顯示 */
    await page.getByRole('combobox', { name: '字型' }).click();
    await expect(page.getByRole('option')).toHaveCount(11);
    await page.getByRole('option', { name: '霞鶩文楷（楷書）' }).click();
    await expect(page.getByRole('combobox', { name: '字型' })).toContainText('霞鶩文楷');
    await expect(templateName(page)).toContainText('已修改');
    /* 樣式：9 種；霓虹＋透明背景 → 警告；挖空 → 背景區出現、自動換成配色的填色 */
    await expect(page.getByRole('radiogroup', { name: '文字樣式' }).getByRole('radio')).toHaveCount(
      9,
    );
    await expect(page.getByRole('radiogroup', { name: '配色' }).getByRole('radio')).toHaveCount(8);
    await radio(page, '文字樣式', '霓虹發光').click();
    await expect(page.getByTestId('look-warnings')).toContainText('適合暗色背景');
    await radio(page, '文字樣式', '挖空').click();
    await expect(page.getByTestId('background-field')).toBeVisible();
    expect((await settings(page)).background).toBe('palette');
    await expect(page.getByTestId('look-warnings')).toHaveCount(0);
    await page.getByTestId('background-field').getByRole('radio', { name: '透明' }).click();
    await expect(page.getByTestId('look-warnings')).toContainText('挖空會把字挖成透明');
    /* 進階：文字顏色、外框顏色（依樣式）、排版微調 */
    await advanced(page).click();
    await expect(page.getByText('文字顏色', { exact: true })).toHaveCount(0);
    await expect(page.getByText('外框顏色', { exact: true })).toHaveCount(0);
    await radio(page, '文字樣式', '雙層外框').click();
    await expect(page.getByText('文字顏色', { exact: true })).toBeVisible();
    await expect(page.getByText('外框顏色', { exact: true })).toBeVisible();
    await expect(page.getByTestId('background-field')).toBeVisible();
    await expect(page.getByRole('slider', { name: '文字縮放' })).toBeVisible();
    await expect(page.getByRole('slider', { name: '行距' })).toHaveAttribute('aria-valuemin', '1');
    await expect(page.getByRole('slider', { name: '字距' })).toHaveAttribute(
      'aria-valuemin',
      '-0.1',
    );
    await radio(page, '文字樣式', '斜紋填色').click();
    await expect(page.getByText('文字顏色', { exact: true })).toHaveCount(0);
    await expect(page.getByText('外框顏色', { exact: true })).toBeVisible();
    /* 背景：單色時多一個顏色選擇器 */
    await page.getByTestId('background-field').getByRole('radio', { name: '單色' }).click();
    await expect(page.getByText('背景色', { exact: true })).toBeVisible();
    /* 動態：特效 5 種、細調、動態強度、種子 */
    await tab(page, '動態');
    await expect(page.getByRole('radiogroup', { name: '裝飾特效' }).getByRole('radio')).toHaveCount(
      5,
    );
    await radio(page, '裝飾特效', '擴散圓環').click();
    await expect(page.getByRole('button', { name: '「擴散圓環」的細調' })).toBeVisible();
    await expect(page.getByRole('slider', { name: '數量' })).toHaveAttribute('aria-valuenow', '3');
    await expect(page.getByRole('slider', { name: '數量' })).toHaveAttribute('aria-valuemin', '1');
    await radio(page, '裝飾特效', '放射速度線').click();
    await expect(page.getByRole('slider', { name: '數量' })).toHaveAttribute('aria-valuenow', '48');
    await page.getByRole('radio', { name: '單色' }).click();
    await expect(page.getByRole('button', { name: /^顏色（單色）：選擇顏色/ })).toBeVisible();
    await page.getByRole('combobox', { name: '文字動態' }).click();
    await page.getByRole('option', { name: '整體旋轉' }).click();
    await expect(page.getByRole('slider', { name: '動態強度' })).toHaveAttribute(
      'aria-valuemax',
      '3',
    );
    await page.getByRole('combobox', { name: '文字動態' }).click();
    await page.getByRole('option', { name: '逐字波浪' }).click();
    expect((await settings(page)).motionAmount).toBe(0.08);
    await expect(page.getByRole('slider', { name: '隨機種子' })).toHaveAttribute(
      'aria-valuemax',
      '99999',
    );
    /* 進階設定開關記在瀏覽器裡 */
    await page.reload();
    await page.getByRole('button', { name: '繼續編輯' }).click();
    await expect(advanced(page)).toBeChecked();
    expect(errors).toEqual([]);
  });
});

test.describe('預覽與匯出', () => {
  test('預覽：減少動態時靜止在 t＝0.25、按播放開始；空白提示；預覽＝匯出的影格', async ({
    page,
  }) => {
    const errors = await open(page);
    await choose(page, '大成功');
    await set(page, {
      frames: 20,
      colors: 0,
      touched: { size: true, frames: true, fps: true, format: true, gifMatte: true },
    });
    await page.waitForTimeout(300);
    const state = () =>
      page.evaluate(() =>
        (
          window as unknown as { __cutin: { preview(): { frame: number; t: number } } }
        ).__cutin.preview(),
      );
    expect(await state()).toEqual({ frame: -1, t: 0.25 });
    /* 預覽像素 */
    const preview = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid=cutin-canvas]');
      const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
      return d ? Array.from(d) : [];
    });
    const { name, bytes, dialog } = await exportAndDownload(page, '匯出 APNG');
    expect(name).toBe('大成功！_480x480.png');
    const info = parseApng(bytes);
    expect(info.ihdr.colorType).toBe(6);
    expect(info.numFrames).toBe(20);
    const frames = composeApng(info);
    const frame5 = frames[5];
    let off = 0;
    for (let i = 0; i < frame5.length; i++) if (Math.abs(frame5[i] - preview[i]) > 24) off++;
    expect(off / frame5.length, '預覽與匯出的第 5 格（t＝0.25）相同').toBeLessThan(0.005);
    await dialog.getByRole('button', { name: '繼續編輯' }).click();
    /* 播放 */
    await page.getByRole('button', { name: '播放' }).click();
    await expect(page.getByRole('button', { name: '播放' })).toHaveCount(0);
    await expect.poll(async () => (await state()).frame).toBeGreaterThanOrEqual(0);
    /* 空白文字 */
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('   ');
    await expect(page.getByTestId('blank-hint')).toContainText('文字會出現在這裡');
    expect(errors).toEqual([]);
  });

  test('匯出 APNG／GIF／PNG：檔案結構、延遲、循環、透明度、檔名與結果對話框', async ({ page }) => {
    const errors = await open(page);
    await choose(page, '大成功');
    /* APNG：480 × 480、15 格、每格 50 ms、無限循環、256 色調色盤 */
    const a = await exportAndDownload(page, '匯出 APNG');
    expect(a.name).toBe('大成功！_480x480.png');
    await expect(a.dialog.getByTestId('result-format')).toHaveText('APNG');
    await expect(a.dialog.getByTestId('result-size')).toContainText('／976.6 KB（');
    await expect(a.dialog.getByTestId('result-size')).not.toHaveAttribute('data-over', '');
    await expect(a.dialog.getByTestId('result-filename')).toHaveText('大成功！_480x480.png');
    await expect(a.dialog).toContainText('CCFOLIA 切入演出的使用步驟');
    await expect(a.dialog).toContainText('「大成功！」');
    const apng = parseApng(a.bytes);
    expect([apng.ihdr.width, apng.ihdr.height, apng.numFrames, apng.numPlays]).toEqual([
      480, 480, 15, 0,
    ]);
    expect(apng.ihdr.colorType).toBe(3);
    /* 第一格同時是預設圖（IDAT 屬於第一格） */
    expect(apng.stillIdat).toBeNull();
    expect(apng.trns?.length).toBeGreaterThan(0);
    const delays = apng.frames.map((f) => (f.delayNum * 1000) / (f.delayDen || 100));
    expect(delays.reduce((x, y) => x + y, 0)).toBeCloseTo(750, 0);
    expect(a.bytes.length).toBeLessThan(1.5 * 274_000);
    /* 對話框：Esc 關閉、重新開啟、點外面關閉、繼續編輯 */
    await page.keyboard.press('Escape');
    await expect(a.dialog).toBeHidden();
    await page.getByRole('button', { name: '上次的匯出結果' }).click();
    await expect(a.dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(a.dialog).toBeHidden();
    await page.getByRole('button', { name: '上次的匯出結果' }).click();
    await a.dialog.getByRole('button', { name: '繼續編輯' }).click();
    await expect(a.dialog).toBeHidden();
    /* 同一組設定匯出兩次逐位元組相同 */
    const again = await exportAndDownload(page, '匯出 APNG');
    expect(Buffer.from(again.bytes).equals(Buffer.from(a.bytes))).toBe(true);
    await page.keyboard.press('Escape');
    /* GIF（附件）：720 × 720、30 格、總長 1 秒、無限循環、合成暗色底（不透明） */
    await radio(page, '用途', 'Discord 訊息附件').click();
    const g = await exportAndDownload(page, '匯出 GIF');
    expect(g.name).toBe('大成功！_720x720.gif');
    await expect(g.dialog.getByTestId('result-format')).toHaveText('GIF');
    await expect(g.dialog.getByTestId('result-size')).toContainText('／7.63 MB（');
    await expect(g.dialog).toContainText('Discord 訊息附件的使用步驟');
    const gif = parseGif(g.bytes);
    expect([gif.width, gif.height, gif.frames.length, gif.loopCount]).toEqual([720, 720, 30, 0]);
    expect(gif.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(100);
    expect(gif.frames.every((f) => f.transparentIndex === null)).toBe(true);
    /* 每格各自減色：第 2 格起都帶自己的區域調色盤（F50） */
    expect(gif.frames.slice(1).every((f) => f.localPalette !== null)).toBe(true);
    await page.keyboard.press('Escape');
    /* GIF（CCFOLIA、不合成）：一階透明 */
    await radio(page, '用途', 'CCFOLIA 切入演出').click();
    const g2 = await exportAndDownload(page, '匯出 GIF');
    const gif2 = parseGif(g2.bytes);
    expect(gif2.frames[0].transparentIndex).not.toBeNull();
    expect(gif2.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(75);
    await page.keyboard.press('Escape');
    /* PNG：單張、畫第一格；按了就把格式改成 PNG */
    await set(page, { colors: 0 });
    const p = await exportAndDownload(page, '匯出 PNG');
    expect(p.name).toBe('大成功！_480x480.png');
    await expect(p.dialog.getByTestId('result-format')).toHaveText('PNG 靜態圖');
    const chunks = parseChunks(p.bytes);
    expect(chunks.some((c) => c.type === 'acTL')).toBe(false);
    const ihdr = readIhdr(chunks);
    expect([ihdr.width, ihdr.height, ihdr.colorType]).toEqual([480, 480, 6]);
    await page.keyboard.press('Escape');
    const lossless = await exportAndDownload(page, '匯出 APNG');
    const first = composeApng(parseApng(lossless.bytes))[0];
    const idat = chunks.filter((c) => c.type === 'IDAT');
    const z = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
    let o = 0;
    for (const c of idat) {
      z.set(c.data, o);
      o += c.data.length;
    }
    const still = decodePixels(z, 480, 480, 6);
    expect(Buffer.from(still).equals(Buffer.from(first)), 'PNG 是 t＝0 那一格').toBe(true);
    /*
     * 256 色的減色品質（F49）：以同設定的無損 APNG 為準，兩邊不透明度 ≥ 128 的像素 |ΔR|＋|ΔG|＋|ΔB|
     * 平均 < 12、誤差 > 60 的像素每格不到 1%（舊版同類設定約 7～9、≤ 1.06%）
     */
    const ref = composeApng(parseApng(lossless.bytes));
    const q = composeApng(apng);
    expect(q).toHaveLength(ref.length);
    let meanSum = 0;
    for (let k = 0; k < ref.length; k++) {
      const r = ref[k];
      const t = q[k];
      let sum = 0;
      let n = 0;
      let big = 0;
      for (let i = 0; i < r.length; i += 4) {
        if (r[i + 3] < 128 || t[i + 3] < 128) continue;
        const d =
          Math.abs(r[i] - t[i]) + Math.abs(r[i + 1] - t[i + 1]) + Math.abs(r[i + 2] - t[i + 2]);
        sum += d;
        n++;
        if (d > 60) big++;
      }
      meanSum += sum / n;
      expect(big / n, `第 ${k} 格誤差 > 60 的比例`).toBeLessThan(0.01);
    }
    expect(meanSum / ref.length).toBeLessThan(12);
    await page.keyboard.press('Escape');
    await tab(page, '匯出');
    await expect(radio(page, '格式', 'APNG')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  });

  test('匯出進度、超過上限的自動縮小、匯出失敗', async ({ page }) => {
    const errors = await open(page);
    await choose(page, '大成功');
    await set(page, {
      width: 800,
      height: 800,
      frames: 30,
      colors: 0,
      background: 'rainbow',
      touched: { size: true, frames: true, fps: false, format: false, gifMatte: false },
    });
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    await expect(page.getByTestId('export-progress')).toHaveText(/繪製 \d+／30|編碼中/);
    await expect(page.getByRole('button', { name: '匯出 GIF' })).toBeDisabled();
    const dialog = page.getByRole('dialog', { name: '匯出完成' });
    await expect(dialog).toBeVisible({ timeout: 90_000 });
    await expect(dialog.getByTestId('result-size')).toHaveAttribute('data-over', '');
    await expect(dialog.getByTestId('result-size')).toContainText('超過上限');
    await page.keyboard.press('Escape');
    await expect(checklist(page).locator('[data-level="error"]')).toContainText(
      '超過CCFOLIA 切入演出的上限',
    );
    await page.getByRole('button', { name: '上次的匯出結果' }).click();
    /* 自動縮小：說明降了什麼並以同一格式重新匯出 */
    await dialog.getByRole('button', { name: '自動縮小檔案' }).click();
    await expect(dialog.getByTestId('shrink-note')).toHaveText('已降低：色數 無損 → 256 色', {
      timeout: 90_000,
    });
    await expect(dialog).toBeVisible({ timeout: 90_000 });
    await expect(dialog.getByTestId('result-format')).toHaveText('APNG');
    expect((await settings(page)).colors).toBe(256);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status', { name: '檢查結果' }).locator('..')).toContainText(
      '已降低：色數 無損 → 256 色',
    );
    /* 匯出失敗：檢查清單上方以紅字顯示 */
    await page.evaluate(() =>
      (
        window as unknown as { __cutin: { failNextExport(m: string): void } }
      ).__cutin.failNextExport('模擬的編碼失敗'),
    );
    await page.getByRole('button', { name: '匯出 PNG' }).click();
    await expect(page.getByRole('alert')).toContainText('匯出失敗：模擬的編碼失敗');
    expect(errors).toEqual([]);
  });
});

test.describe('分享連結與錯誤畫面', () => {
  test('分享連結：複製、開啟後直接進編輯畫面（自訂）；損壞的連結照一般開頁', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await choose(page, '秘密擲骰');
    await radio(page, '用途', 'Discord 伺服器貼圖').click();
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('分享\n測試');
    await page.getByRole('button', { name: '複製分享連結' }).click();
    await expect(page.getByText('已複製分享連結')).toBeVisible();
    const url = page.url();
    expect(url).toContain('#s=');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    /* 之後再改設定不會自動更新網址 */
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('改掉');
    expect(page.url()).toBe(url);
    const other = await context.newPage();
    const errors2 = await open(other, url.slice(url.indexOf('#')));
    await expect(other.getByTestId('gallery')).toHaveCount(0);
    await expect(templateName(other)).toContainText('自訂');
    await expect(other.getByRole('textbox', { name: '文字', exact: true })).toHaveValue(
      '分享\n測試',
    );
    await expect(radio(other, '用途', 'Discord 伺服器貼圖')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const s = await settings(other);
    expect([s.style, s.palette, s.fx, s.font]).toEqual(['neon', 'ice', 'stars', 'cactus']);
    expect(s.touched).toEqual({
      size: true,
      frames: true,
      fps: true,
      format: true,
      gifMatte: true,
    });
    await other.close();
    /* 損壞的連結 */
    const bad = await context.newPage();
    const errors3 = await open(bad, '#s=AAAAbroken');
    await expect(bad.getByTestId('gallery')).toBeVisible();
    await bad.close();
    expect([...errors, ...errors2, ...errors3]).toEqual([]);
  });

  test('錯誤畫面：繪製途中出錯時整頁換掉，「從頭來過」清掉網址的設定', async ({ page }) => {
    await open(page);
    await choose(page, '成功');
    await page.getByRole('button', { name: '複製分享連結' }).click();
    expect(page.url()).toContain('#s=');
    await page.evaluate(() =>
      (window as unknown as { __cutin: { crash(m: string): void } }).__cutin.crash(
        '測試用的繪製錯誤',
      ),
    );
    await page.getByRole('textbox', { name: '文字', exact: true }).fill('觸發重畫');
    await expect(page.getByTestId('crash-screen')).toBeVisible();
    await expect(page.getByTestId('crash-screen')).toContainText('測試用的繪製錯誤');
    await page.getByRole('button', { name: '從頭來過' }).click();
    await expect(page.getByTestId('gallery')).toBeVisible();
    expect(page.url()).not.toContain('#s=');
  });
});

test.describe('版面與視覺基準', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('1280 寬', async ({ page }) => {
    const errors = await open(page);
    await noHorizontalScroll(page, '範本一覽：');
    await choose(page, '大成功');
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('cutin-1280.png', { fullPage: true, mask: masks(page) });
    expect(errors).toEqual([]);
  });

  test('390 寬：每個畫面與分頁都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page, '範本一覽：');
    await choose(page, '大成功');
    await advanced(page).click();
    for (const name of ['外觀', '動態', '匯出']) {
      await tab(page, name);
      await noHorizontalScroll(page, `${name}：`);
    }
    await advanced(page).click();
    await tab(page, '外觀');
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('cutin-390.png', { fullPage: true, mask: masks(page) });
    expect(errors).toEqual([]);
  });
});
