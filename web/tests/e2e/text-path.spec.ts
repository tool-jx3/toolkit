/**
 * 文字軌跡產生器（建置產物 next/text-path/ 或 tools/text-path/）的端對端測試：
 * - 開頁狀態（圓形、軌跡已畫好、結果是空的）、沒有 pageerror／console error、不保留狀態；
 * - 產生、形狀與欄數不自動重產、間距倍數／填空字元／行首替換會重產、起訖對調、依字數縮放、清除；
 * - 各種訊息出現的時機與約 3 秒後消失；滑鼠與觸控畫線、離開繪製區就結束；疊字出現與消失；
 * - 複製（讀剪貼簿逐字比對）；390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { expect, type Page, test } from '@playwright/test';
import { type Point, reversePath } from '../../src/core/path';
import { getTool, outputDir } from '../../src/registry';
import {
  FILL_CHARS,
  type FillKind,
  fitPathToText,
  generate,
  type PresetShapeId,
  resultCount,
  shapePath,
  splitChars,
} from '../../src/tools/text-path/logic';
import { S } from '../../src/tools/text-path/strings';

const URL = `/${outputDir(getTool('text-path') ?? { id: 'text-path', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '文字軌跡產生器' })).toBeVisible();
  return errors;
}

interface Expect {
  text?: string;
  shape?: PresetShapeId;
  path?: Point[];
  cols?: number;
  fill?: FillKind;
  lineHead?: boolean;
  reverse?: boolean;
  /** 依序做的「依字數縮放」（間距倍數） */
  fits?: number[];
}

function expectedPath({
  text = S.sampleText,
  shape = 'circle',
  path,
  cols = 25,
  reverse,
  fits = [],
}: Expect) {
  let p = path ?? shapePath(shape);
  if (reverse) p = reversePath(p);
  for (const spacing of fits) {
    const r = fitPathToText({ path: p, count: splitChars(text).length, cols, spacing });
    if (r.ok) p = r.path;
  }
  return p;
}

function expected(o: Expect = {}) {
  const r = generate({
    text: o.text ?? S.sampleText,
    path: expectedPath(o),
    cols: o.cols ?? 25,
    fill: FILL_CHARS[o.fill ?? 'ideographic'],
    lineHead: o.lineHead ?? false,
  });
  if (!r.ok) throw new Error(`預期值產生失敗：${r.reason}`);
  return r.text;
}

const output = (page: Page) => page.getByRole('textbox', { name: '結果' });
const input = (page: Page) => page.getByRole('textbox', { name: '要排列的文字' });
const pad = (page: Page) => page.getByTestId('path-pad');
const hint = (page: Page) => page.getByTestId('path-pad-hint');
const shapeRadio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const message = (page: Page, text: string) => page.getByText(text, { exact: true });
const padImage = (page: Page) =>
  pad(page).evaluate((c: HTMLCanvasElement) => c.toDataURL('image/png'));

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function padPoint(page: Page, fx: number, fy: number) {
  const box = (await pad(page).boundingBox())!;
  return [box.x + box.width * fx, box.y + box.height * fy] as const;
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('開頁狀態：圓形、軌跡已畫好、結果是空的；頁尾只有靈感來源；重新整理回到預設', async ({
  page,
}) => {
  const errors = await open(page);
  await expect(shapeRadio(page, '圓')).toHaveAttribute('aria-checked', 'true');
  await expect(pad(page)).toHaveAttribute('data-points', '126');
  await expect(hint(page)).toHaveCount(0);
  await expect(output(page)).toHaveValue('');
  await expect(page.getByTestId('text-output-count')).toHaveCount(0);
  await expect(input(page)).toHaveValue(S.sampleText);
  await expect(page.getByTestId('char-count')).toHaveText(
    S.charCount(splitChars(S.sampleText).length),
  );
  await expect(page.getByTestId('cols-value')).toHaveText('25 欄');
  await expect(page.getByTestId('spacing-value')).toHaveText('適中（1.2）');
  await expect(page.getByRole('radio', { name: '全形空白' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('switch', { name: '行首空白替換' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('contentinfo')).toContainText('靈感來源');
  await expect(page.getByRole('link', { name: 'sotsotssi/text-path-generator' })).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/text-path-generator',
  );
  /* 不保留狀態（F31） */
  await input(page).fill('暫時的文字');
  await shapeRadio(page, '愛心').click();
  await page.getByRole('spinbutton', { name: '欄數' }).fill('40');
  await button(page, '產生').click();
  await expect(output(page)).not.toHaveValue('');
  await page.reload();
  await expect(input(page)).toHaveValue(S.sampleText);
  await expect(shapeRadio(page, '圓')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('cols-value')).toHaveText('25 欄');
  await expect(output(page)).toHaveValue('');
  expect(errors).toEqual([]);
});

test('產生：結果、結果字數、疊字；改文字不會自動重產，字數即時更新', async ({ page }) => {
  const errors = await open(page);
  const before = await padImage(page);
  await button(page, '產生').click();
  const want = expected();
  await expect(output(page)).toHaveValue(want);
  await expect(page.getByTestId('text-output-count')).toHaveText(`${resultCount(want)} 字`);
  /* 疊字畫在繪製區上 */
  expect(await padImage(page)).not.toBe(before);
  /* 改文字：字數即時更新（以碼位計），結果不變 */
  await input(page).fill('擲 🎲\n骰子𪜶');
  await expect(page.getByTestId('char-count')).toHaveText(S.charCount(5));
  await expect(output(page)).toHaveValue(want);
  await button(page, '產生').click();
  await expect(output(page)).toHaveValue(expected({ text: '擲🎲骰子𪜶' }));
  /* 再選一次圓：軌跡重畫，疊字消失 */
  await shapeRadio(page, '圓').click();
  await expect.poll(() => padImage(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('形狀與欄數不會自動重產；選取的形狀有標示', async ({ page }) => {
  const errors = await open(page);
  await button(page, '產生').click();
  const circle = expected();
  await expect(output(page)).toHaveValue(circle);

  await shapeRadio(page, '螺旋').click();
  await expect(shapeRadio(page, '螺旋')).toHaveAttribute('aria-checked', 'true');
  await expect(shapeRadio(page, '圓')).toHaveAttribute('aria-checked', 'false');
  await expect(pad(page)).toHaveAttribute('data-points', '377');
  await expect(output(page)).toHaveValue(circle);
  await button(page, '產生').click();
  await expect(output(page)).toHaveValue(expected({ shape: 'spiral' }));

  await shapeRadio(page, '愛心').click();
  await expect(pad(page)).toHaveAttribute('data-points', '126');
  await expect(output(page)).toHaveValue(expected({ shape: 'spiral' }));

  const cols = page.getByRole('spinbutton', { name: '欄數' });
  await cols.fill('40');
  await cols.press('Enter');
  await expect(page.getByTestId('cols-value')).toHaveText('40 欄');
  await expect(output(page)).toHaveValue(expected({ shape: 'spiral' }));
  await button(page, '產生').click();
  await expect(output(page)).toHaveValue(expected({ shape: 'heart', cols: 40 }));
  /* 滑桿的範圍 15～50 */
  await cols.fill('99');
  await cols.press('Enter');
  await expect(page.getByTestId('cols-value')).toHaveText('50 欄');
  expect(errors).toEqual([]);
});

test('間距倍數：描述詞五級；沒有結果時只改數值，有結果時立刻縮放並重產', async ({ page }) => {
  const errors = await open(page);
  const slider = page.getByRole('slider', { name: '間距倍數' });
  const value = page.getByTestId('spacing-value');
  await slider.focus();
  await slider.press('ArrowLeft');
  await expect(value).toHaveText('偏密（1.1）');
  await slider.press('ArrowLeft');
  await slider.press('ArrowLeft');
  await slider.press('ArrowLeft');
  await expect(value).toHaveText('很密（0.8）');
  await slider.press('Home');
  await expect(value).toHaveText('很密（0.5）');
  await slider.press('End');
  await expect(value).toHaveText('很疏（3.0）');
  for (let i = 0; i < 12; i++) await slider.press('ArrowLeft');
  await expect(value).toHaveText('偏疏（1.8）');
  for (let i = 0; i < 5; i++) await slider.press('ArrowLeft');
  await expect(value).toHaveText('適中（1.3）');
  /* 沒有結果時軌跡沒有被縮放 */
  await button(page, '產生').click();
  await expect(output(page)).toHaveValue(expected());
  /* 有結果：拖動（鍵盤）就依字數縮放並重產 */
  await slider.focus();
  await slider.press('ArrowLeft');
  await slider.press('ArrowLeft');
  await expect(value).toHaveText('偏密（1.1）');
  const want = expected({ fits: [1.2, 1.1] });
  expect(want).not.toBe(expected());
  await expect(output(page)).toHaveValue(want);
  await slider.press('ArrowLeft');
  await expect(output(page)).toHaveValue(expected({ fits: [1.2, 1.1, 1.0] }));
  expect(errors).toEqual([]);
});

test('填空字元與行首空白替換：有結果時立刻重產', async ({ page }) => {
  const errors = await open(page);
  /* 沒有結果時只改選項 */
  await page.getByRole('radio', { name: '半形空白' }).click();
  await expect(output(page)).toHaveValue('');
  await button(page, '產生').click();
  await expect(output(page)).toHaveValue(expected({ fill: 'space' }));
  await page.getByRole('radio', { name: '韓文中點 ㆍ' }).click();
  await expect(output(page)).toHaveValue(expected({ fill: 'middot' }));
  await expect(output(page)).toHaveValue(/ㆍ/);
  await page.getByRole('switch', { name: '行首空白替換' }).click();
  const want = expected({ fill: 'middot', lineHead: true });
  await expect(output(page)).toHaveValue(want);
  expect(want).toMatch(/^⠀/m);
  await page.getByRole('radio', { name: '全形空白' }).click();
  await expect(output(page)).toHaveValue(expected({ lineHead: true }));
  expect(errors).toEqual([]);
});

test('起訖對調與依字數縮放：有結果時重產；沒有結果時縮放顯示完成', async ({ page }) => {
  const errors = await open(page);
  /* 沒有結果：對調不產生 */
  await button(page, '起訖對調').click();
  await expect(output(page)).toHaveValue('');
  await button(page, '依字數縮放').click();
  await expect(message(page, S.messages.fitted)).toBeVisible();
  await expect(output(page)).toHaveValue('');
  await button(page, '產生').click();
  await expect(output(page)).toHaveValue(expected({ reverse: true, fits: [1.2] }));
  /* 有結果：對調立刻重產 */
  await button(page, '起訖對調').click();
  await expect(output(page)).toHaveValue(expected({ fits: [1.2] }));
  /* 有結果：縮放立刻重產 */
  await shapeRadio(page, '愛心').click();
  await button(page, '依字數縮放').click();
  await expect(output(page)).toHaveValue(expected({ shape: 'heart', fits: [1.2] }));
  /* 字數不到兩個 */
  await input(page).fill('月');
  await button(page, '依字數縮放').click();
  await expect(message(page, S.messages.fewChars)).toBeVisible();
  expect(errors).toEqual([]);
});

test('清除與沒有軌跡、沒有文字時的訊息；訊息約 3 秒後消失', async ({ page }) => {
  const errors = await open(page);
  await button(page, '產生').click();
  await expect(output(page)).not.toHaveValue('');
  await button(page, '清除').click();
  await expect(output(page)).toHaveValue('');
  await expect(page.getByTestId('text-output-count')).toHaveCount(0);
  await expect(shapeRadio(page, '自由繪製')).toHaveAttribute('aria-checked', 'true');
  await expect(pad(page)).toHaveAttribute('data-points', '0');
  await expect(hint(page)).toHaveText(S.padHint);

  await button(page, '產生').click();
  const noPath = message(page, S.messages.noPath);
  await expect(noPath).toBeVisible();
  await page.waitForTimeout(2300);
  await expect(noPath).toBeVisible();
  await expect(noPath).toBeHidden({ timeout: 2000 });

  await button(page, '起訖對調').click();
  await expect(message(page, S.messages.reverseNoPath)).toBeVisible();
  await button(page, '依字數縮放').click();
  await expect(message(page, S.messages.fitNoPath)).toBeVisible();

  await input(page).fill(' \n　 ');
  await expect(page.getByTestId('char-count')).toHaveText(S.charCount(0));
  await shapeRadio(page, '圓').click();
  await expect(hint(page)).toHaveCount(0);
  await button(page, '產生').click();
  await expect(message(page, S.messages.noText)).toBeVisible();
  await expect(output(page)).toHaveValue('');
  expect(errors).toEqual([]);
});

test('滑鼠畫線：切到自由繪製、不自動重產；離開繪製區就結束；只點一下無效', async ({ page }) => {
  const errors = await open(page);
  await input(page).fill('月光照進窗台的那一夜');
  await button(page, '產生').click();
  const circle = expected({ text: '月光照進窗台的那一夜' });
  await expect(output(page)).toHaveValue(circle);
  const before = await padImage(page);

  /* 在預設形狀狀態下直接畫：切到自由繪製 */
  await page.mouse.move(...(await padPoint(page, 0.05, 0.5)));
  await page.mouse.down();
  for (let i = 1; i <= 30; i++)
    await page.mouse.move(...(await padPoint(page, 0.05 + i * 0.03, 0.5)));
  await page.mouse.up();
  await expect(shapeRadio(page, '自由繪製')).toHaveAttribute('aria-checked', 'true');
  await expect(pad(page)).toHaveAttribute('data-points', '31');
  await expect(hint(page)).toHaveCount(0);
  /* 結果保留上一次的內容 */
  await expect(output(page)).toHaveValue(circle);
  expect(await padImage(page)).not.toBe(before);
  await button(page, '產生').click();
  /* 水平線：一行，十個字依序排開 */
  const line = await output(page).inputValue();
  expect(line).not.toContain('\n');
  expect(line.replaceAll('　', '')).toBe('月光照進窗台的那一夜');
  expect(line.startsWith('月') && line.endsWith('夜')).toBe(true);

  /* 選「自由繪製」不清掉軌跡 */
  await shapeRadio(page, '自由繪製').click();
  await expect(pad(page)).toHaveAttribute('data-points', '31');

  /* 按著拖出繪製區：離開時就結束，再進來不會接續 */
  await page.mouse.move(...(await padPoint(page, 0.5, 0.5)));
  await page.mouse.down();
  await page.mouse.move(...(await padPoint(page, 0.6, 0.5)));
  const box = (await pad(page).boundingBox())!;
  await page.mouse.move(box.x + box.width + 30, box.y + box.height / 2);
  await page.mouse.move(...(await padPoint(page, 0.9, 0.9)));
  await page.mouse.up();
  await expect(pad(page)).toHaveAttribute('data-points', '2');

  /* 只點一下：1 點，產生時提示沒有軌跡，並顯示繪製提示 */
  await page.mouse.click(...(await padPoint(page, 0.3, 0.3)));
  await expect(pad(page)).toHaveAttribute('data-points', '1');
  await expect(hint(page)).toHaveText(S.padHint);
  await button(page, '產生').click();
  await expect(message(page, S.messages.noPath)).toBeVisible();
  expect(errors).toEqual([]);
});

test('觸控畫線：頁面不捲動', async ({ browser }) => {
  const ctx = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const errors = await open(page);
  await expect(pad(page)).toHaveCSS('touch-action', 'none');
  await page.evaluate(() => window.scrollTo(0, 40));
  const y0 = await page.evaluate(() => window.scrollY);
  const box = (await pad(page).boundingBox())!;
  const pt = (fx: number, dy = 0) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height / 2 + dy,
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(0.1)] });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [pt(0.1 + i * 0.08, -i * 3)],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(pad(page)).toHaveAttribute('data-points', '11');
  await expect(shapeRadio(page, '自由繪製')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBe(y0);
  await button(page, '產生').click();
  await expect(output(page)).not.toHaveValue('');
  expect(errors).toEqual([]);
  await ctx.close();
});

test.describe('複製', () => {
  test('剪貼簿內容與結果逐字相同；訊息約 3 秒後消失；沒有結果時提示', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await button(page, '複製').click();
    await expect(message(page, S.messages.copyEmpty)).toBeVisible();
    await page.getByRole('switch', { name: '行首空白替換' }).click();
    await button(page, '產生').click();
    const want = expected({ lineHead: true });
    await expect(output(page)).toHaveValue(want);
    await button(page, '複製').click();
    const toast = message(page, S.messages.copied);
    await expect(toast).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(want);
    expect(clip).toContain('　');
    expect(clip).toContain('⠀');
    expect(clip.endsWith('\n')).toBe(false);
    await page.waitForTimeout(2300);
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 2000 });
    expect(errors).toEqual([]);
  });

  test('剪貼簿寫入失敗時提示手動複製', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      document.execCommand = () => false;
    });
    const errors = await open(page);
    await button(page, '產生').click();
    await button(page, '複製').click();
    await expect(message(page, S.messages.copyFailed)).toBeVisible();
    await expect(message(page, S.messages.copyFailedHint)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  async function settle(page: Page) {
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.mouse.move(0, 0);
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await button(page, '產生').click();
    await expect(output(page)).toHaveValue(expected());
    await settle(page);
    await expect(page).toHaveScreenshot('text-path-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬；結果很寬時只有結果欄可以橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await button(page, '產生').click();
    await expect(output(page)).toHaveValue(expected());
    await settle(page);
    await expect(page).toHaveScreenshot('text-path-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    /* 50 欄、橫跨整個繪製區的線：結果欄不折行（太寬時可以橫向捲動），頁面不出現橫向捲動 */
    const cols = page.getByRole('spinbutton', { name: '欄數' });
    await cols.fill('50');
    await cols.press('Enter');
    await pad(page).scrollIntoViewIfNeeded();
    await page.mouse.move(...(await padPoint(page, 0.02, 0.5)));
    await page.mouse.down();
    for (let i = 1; i <= 24; i++)
      await page.mouse.move(...(await padPoint(page, 0.02 + i * 0.04, 0.5 + (i % 2) * 0.05)));
    await page.mouse.up();
    await button(page, '產生').click();
    await expect(output(page)).not.toHaveValue('');
    expect((await output(page).inputValue()).split('\n')[0].length).toBeGreaterThan(40);
    const [scrollW, clientW, wrap] = await output(page).evaluate((el: HTMLTextAreaElement) => [
      el.scrollWidth,
      el.clientWidth,
      el.getAttribute('wrap'),
    ]);
    expect(wrap).toBe('off');
    expect(scrollW).toBeGreaterThan(clientW);
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
