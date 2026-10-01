/**
 * 文字方框產生器（建置產物 next/textbox/）的端對端測試：
 * - 開頁沒有 pageerror／console error；預設輸出；
 * - 模式切換保留兩邊的輸入、逐字輸入即時更新、自訂比例欄位的顯示／隱藏；
 * - 複製：剪貼簿內容與輸出逐字相同（含行尾空白、全形空白、沒有結尾換行）、提示約 2 秒、複製後維持全選；
 * - 數值欄照打的文字解析、超出範圍的提示；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { expect, type Page, test } from '@playwright/test';
import { DEFAULT_INPUT, renderTextbox, type TextboxInput } from '../../src/tools/textbox/layout';

const URL = '/next/textbox/';

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
  await expect(page.getByRole('heading', { level: 1, name: '文字方框產生器' })).toBeVisible();
  return errors;
}

const expected = (patch: Partial<TextboxInput>) =>
  renderTextbox({ ...DEFAULT_INPUT, ...patch }).text;

const output = (page: Page) => page.getByRole('textbox', { name: '輸出' });
const body = (page: Page) => page.getByRole('textbox', { name: '內文' });
const title = (page: Page) => page.getByRole('textbox', { name: '標題' });
const table = (page: Page) => page.getByRole('textbox', { name: '表格資料' });

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const SAMPLE_TITLE = '第三夜　霧中的港口';
const SAMPLE_BODY =
  '汽笛聲從霧裡傳來，碼頭的燈一盞接一盞熄滅。\n調查員在倉庫門口撿到一枚生鏽的鑰匙。\n\nSAN 檢定：1d100 → 42（成功）';

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('開頁沒有錯誤；預設是方框模式，輸出寬 10 格的空方框；重新整理後回到預設', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByRole('radio', { name: '方框' })).toHaveAttribute('aria-checked', 'true');
  await expect(output(page)).toHaveValue('──────────\n　　　　　　　  \n──────────');
  await expect(output(page)).toHaveValue(expected({}));
  /* 頁尾只有靈感來源 */
  await expect(page.getByRole('contentinfo')).toContainText('靈感來源');
  await expect(page.getByRole('link', { name: 'sotsotssi/TextBoxGen' })).toHaveAttribute(
    'href',
    'https://github.com/sotsotssi/TextBoxGen',
  );
  /* 不保留狀態 */
  await body(page).fill('暫時的內容');
  await page.reload();
  await expect(body(page)).toHaveValue('');
  await expect(output(page)).toHaveValue(expected({}));
  expect(errors).toEqual([]);
});

test('即時更新：逐字輸入、改選項都立刻反映在輸出', async ({ page }) => {
  const errors = await open(page);
  await body(page).pressSequentially('鐘樓在午');
  await expect(output(page)).toHaveValue(expected({ body: '鐘樓在午' }));
  await body(page).pressSequentially('夜敲了十三下。');
  const text = '鐘樓在午夜敲了十三下。';
  await expect(output(page)).toHaveValue(expected({ body: text }));
  await page.getByRole('switch', { name: '側邊框線' }).click();
  await expect(output(page)).toHaveValue(expected({ body: text, sides: true }));
  await page.getByRole('radio', { name: /雙線/ }).click();
  await expect(output(page)).toHaveValue(expected({ body: text, sides: true, line: 'double' }));
  await page.getByRole('radio', { name: '只用半形空白' }).click();
  await expect(output(page)).toHaveValue(
    expected({ body: text, sides: true, line: 'double', pad: 'halfwidth' }),
  );
  await page.getByRole('radio', { name: '等寬 1:2' }).click();
  await expect(output(page)).toHaveValue(
    expected({ body: text, sides: true, line: 'double', pad: 'halfwidth', calibration: 'mono' }),
  );
  await title(page).fill('鐘聲');
  await expect(output(page)).toHaveValue(
    expected({
      title: '鐘聲',
      body: text,
      sides: true,
      line: 'double',
      pad: 'halfwidth',
      calibration: 'mono',
    }),
  );
  expect(errors).toEqual([]);
});

test('模式切換：兩邊的輸入各自保留，輸出立刻換成目前模式', async ({ page }) => {
  const errors = await open(page);
  const text = '霧氣從碼頭一路漫進巷子。';
  const data = '角色 | 職業\n林語晴 | 記者';
  await title(page).fill('第一章');
  await body(page).fill(text);
  await page.getByRole('radio', { name: '表格' }).click();
  await expect(body(page)).toHaveCount(0);
  await expect(table(page)).toHaveValue('');
  await expect(output(page)).toHaveValue(expected({ mode: 'table' }));
  await table(page).fill(data);
  await page.getByRole('switch', { name: '首列當表頭' }).click();
  await expect(output(page)).toHaveValue(expected({ mode: 'table', table: data, header: true }));
  await page.getByRole('radio', { name: '方框' }).click();
  await expect(title(page)).toHaveValue('第一章');
  await expect(body(page)).toHaveValue(text);
  await expect(output(page)).toHaveValue(expected({ title: '第一章', body: text }));
  await page.getByRole('radio', { name: '表格' }).click();
  await expect(table(page)).toHaveValue(data);
  await expect(page.getByRole('switch', { name: '首列當表頭' })).toBeChecked();
  await expect(output(page)).toHaveValue(expected({ mode: 'table', table: data, header: true }));
  expect(errors).toEqual([]);
});

test('自訂比例：只有選了才出現兩個數值欄，切走時隱藏但數值保留', async ({ page }) => {
  const errors = await open(page);
  await body(page).fill('霧港');
  const wide = page.getByRole('spinbutton', { name: '寬字寬度' });
  const border = page.getByRole('spinbutton', { name: '框線寬度' });
  await expect(wide).toHaveCount(0);
  await page.getByRole('radio', { name: '自訂比例' }).click();
  await expect(wide).toHaveValue('2.66');
  await expect(border).toHaveValue('2.12');
  await expect(output(page)).toHaveValue(expected({ body: '霧港', calibration: 'custom' }));
  /* 微調鈕每次 0.01 */
  await page.getByRole('button', { name: '寬字寬度：增加' }).click();
  await expect(wide).toHaveValue('2.67');
  await border.focus();
  await page.keyboard.press('ArrowDown');
  await expect(border).toHaveValue('2.11');
  await expect(output(page)).toHaveValue(
    expected({ body: '霧港', calibration: 'custom', customWide: '2.67', customBorder: '2.11' }),
  );
  /* 負數：限制並提示（刻意差異） */
  await border.fill('-1');
  await expect(page.getByText('寬度必須大於 0，目前以 1 計算。')).toBeVisible();
  await expect(output(page)).toHaveValue(
    expected({ body: '霧港', calibration: 'custom', customWide: '2.67', customBorder: '1' }),
  );
  await border.fill('0.5');
  await page.getByRole('radio', { name: 'CCFOLIA 校準' }).click();
  await expect(wide).toHaveCount(0);
  await page.getByRole('radio', { name: '自訂比例' }).click();
  await expect(wide).toHaveValue('2.67');
  await expect(border).toHaveValue('0.5');
  expect(errors).toEqual([]);
});

test('寬度上限：照打的文字解析（取整數部分、可超出微調範圍），負數改成 1 並提示', async ({
  page,
}) => {
  const errors = await open(page);
  const text = '霧氣從碼頭一路漫進巷子，路燈一盞接一盞熄滅。';
  await body(page).fill(text);
  await page.getByRole('switch', { name: '側邊框線' }).click();
  const limit = page.getByRole('spinbutton', { name: '方框寬度上限' });
  await expect(limit).toHaveValue('24');
  for (const v of ['12.9', '3e1', '5', '1000', '', '0']) {
    await limit.fill(v);
    await expect(limit).toHaveValue(v);
    await expect(output(page)).toHaveValue(expected({ body: text, sides: true, boxWidth: v }));
  }
  await limit.fill('-3');
  await expect(page.getByText('寬度上限至少為 1，目前以 1 計算。')).toBeVisible();
  await expect(output(page)).toHaveValue(expected({ body: text, sides: true, boxWidth: '1' }));
  /* 微調鈕限制在 10～100 */
  await limit.fill('24');
  await page.getByRole('button', { name: '方框寬度上限：增加' }).click();
  await expect(limit).toHaveValue('25');
  await limit.fill('5');
  await page.getByRole('button', { name: '方框寬度上限：減少' }).click();
  await expect(limit).toHaveValue('10');
  await limit.fill('1000');
  await limit.press('ArrowUp');
  await expect(limit).toHaveValue('100');
  /* 表格的退回值是 30 */
  await page.getByRole('radio', { name: '表格' }).click();
  const data = '時間 | 地點 | 事件\n深夜 | 舊港倉庫 | 調查員發現一只沾著海水的皮箱，鎖已經被撬開';
  await table(page).fill(data);
  const tlimit = page.getByRole('spinbutton', { name: '表格寬度上限' });
  await expect(tlimit).toHaveValue('19');
  await tlimit.fill('');
  await expect(output(page)).toHaveValue(
    expected({ mode: 'table', table: data, sides: true, tableWidth: '' }),
  );
  /* 只有分隔列：提示 */
  await table(page).fill('---');
  await expect(page.getByText('表格裡只有分隔列，沒有可以排的資料。')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('複製', () => {
  test('剪貼簿內容與輸出逐字相同；提示約 2 秒後消失；複製後輸出維持全選', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    /* 側邊框線關：每行結尾都是補白（行尾空白、全形空白） */
    const patch: Partial<TextboxInput> = { title: '線索', body: '  縮排兩格\n\n𪜶與🎲' };
    await title(page).fill(patch.title!);
    await body(page).fill(patch.body!);
    const want = expected(patch);
    expect(want).toMatch(/ $/m);
    expect(want).toContain('　');
    await expect(output(page)).toHaveValue(want);
    await page.getByRole('button', { name: '複製' }).click();
    const toast = page.getByText('已複製到剪貼簿', { exact: true });
    await expect(toast).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(want);
    expect(clip.endsWith('\n')).toBe(false);
    const sel = await output(page).evaluate((el: HTMLTextAreaElement) => [
      el.selectionStart,
      el.selectionEnd,
      el.value.length,
      document.activeElement === el,
    ]);
    expect(sel).toEqual([0, want.length, want.length, true]);
    /* 約 2 秒後消失 */
    await page.waitForTimeout(1500);
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 2000 });
    expect(errors).toEqual([]);
  });

  test('剪貼簿寫入失敗時顯示錯誤（刻意改善）', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      document.execCommand = () => false;
    });
    const errors = await open(page);
    await page.getByRole('button', { name: '複製' }).click();
    await expect(page.getByText('無法寫入剪貼簿', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  async function fillSample(page: Page) {
    await title(page).fill(SAMPLE_TITLE);
    await body(page).fill(SAMPLE_BODY);
    await page.getByRole('switch', { name: '側邊框線' }).click();
    await expect(output(page)).toHaveValue(
      expected({ title: SAMPLE_TITLE, body: SAMPLE_BODY, sides: true }),
    );
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.mouse.move(0, 0);
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await fillSample(page);
    await expect(page).toHaveScreenshot('textbox-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，方框與表格模式都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await fillSample(page);
    await expect(page).toHaveScreenshot('textbox-390.png', { fullPage: true });
    await noHorizontalScroll(page);
    await page.getByRole('radio', { name: '表格' }).click();
    await table(page).fill('技能 | 成功率 | 備註\n圖書館 | 65% | 找到一本很長很長很長的舊日記');
    await page.getByRole('radio', { name: '自訂比例' }).click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
