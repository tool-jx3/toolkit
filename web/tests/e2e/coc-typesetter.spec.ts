/**
 * CoC 劇本排版工具（建置產物 next/coc-typesetter/）的端對端測試：
 * - 開頁：範例劇本、沒有 pageerror／console error、頁尾只有靈感來源、狀態列（F66、F70）；
 * - 紙面設定：紙張、配色、封面、目錄、每章換頁、書眉、顯示比例（F10～F16）；
 * - 文字欄：打字後重新排版、格式按鈕（插入與包住、暫定文字）、「/」選單（篩選、↑↓、Enter、Esc、關閉條件）、復原、
 *   封面資訊自動讀入、游標與紙面同步、點紙面跳到內文（F20～F31）；
 * - 封面與概要（F35～F41）、新建、讀入範例（F64、F65）、放不下的內容（F62）；
 * - 輸出：列印用文件（只有紙面；按鈕與 Ctrl＋P）、儲存列印用 HTML（解析下載檔）（F75、F76、F81）；
 * - 自動存檔、讀入舊版存檔（F67、F68）；
 * - 窄畫面：編輯／預覽切換、收合設定與格式按鈕（記住）、390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('coc-typesetter') ?? { id: 'coc-typesetter', status: 'next' })}/`;
const STORE_KEY = 'trpg-toolkit:coc-typesetter';
const LEGACY_KEY = 'coc-typesetter:v2';

test.use({ viewport: { width: 1280, height: 900 } });

async function open(page: Page, { goto = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  if (goto) await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: 'CoC 劇本排版工具' })).toBeVisible();
  await expect(status(page)).toContainText('共');
  return errors;
}

const paper = (page: Page) => page.getByTestId('coc-paper');
const pages = (page: Page) => paper(page).locator('.book > .page');
const source = (page: Page) => page.getByRole('textbox', { name: '劇本內文' });
const status = (page: Page) => page.getByTestId('coc-status');
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name });
const slashMenu = (page: Page) => page.getByRole('listbox', { name: '插入格式' });
const formats = (page: Page) => page.getByRole('toolbar', { name: '插入格式' });
/** 通知（Radix Toast 另有一份給螢幕閱讀器的文字，取第一個） */
const toast = (page: Page, text: string) => page.getByText(text, { exact: true }).first();

async function setText(page: Page, text: string) {
  await source(page).fill(text);
  /* 內文停 0.5 秒後排版 */
  await page.waitForTimeout(700);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function download(page: Page, click: () => Promise<void>) {
  const d = page.waitForEvent('download');
  await click();
  const dl = await d;
  const path = await dl.path();
  return { name: dl.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

test.describe('CoC 劇本排版工具', () => {
  test('開頁：範例劇本、沒有錯誤、頁尾只有靈感來源、狀態列', async ({ page }) => {
    const errors = await open(page);
    await expect(paper(page).locator('.book')).toHaveClass('book paper-a5 theme-mono');
    await expect(pages(page).first()).toHaveClass(/cover/);
    await expect(pages(page).first().locator('.cv-title')).toHaveText('霧港的第二道光');
    await expect(pages(page).nth(1)).toHaveClass(/toc-page/);
    const n = await pages(page).count();
    expect(n).toBeGreaterThanOrEqual(7);
    await expect(status(page)).toContainText(/字數 1,\d{3} 字/);
    await expect(status(page)).toContainText('標題 13 個（章 6、探索點 7）');
    await expect(status(page)).toContainText(`A5・共 ${n} 頁`);
    /* 目錄的頁碼與章的頁面一致 */
    const tocPg = await pages(page).nth(1).locator('.toc-item.lv2 .pg').allTextContents();
    const chPg = await paper(page)
      .locator('.page-body h2[id]')
      .evaluateAll((hs) => hs.map((h) => (h.closest('.page') as HTMLElement).dataset.no));
    expect(tocPg).toEqual(chPg);
    /* 頁碼：奇數頁靠右、偶數頁靠左 */
    await expect(pages(page).nth(2).locator('.page-foot')).toHaveText('3');
    await expect(pages(page).nth(2)).toHaveClass(/odd/);
    const footer = page.locator('footer');
    await expect(footer).toContainText('靈感來源');
    await expect(footer).toContainText('scenario-tool（作者不明）');
    expect(errors).toEqual([]);
  });

  test('紙面設定：紙張、配色、封面、目錄、每章換頁、書眉、顯示比例', async ({ page }) => {
    await open(page);
    const book = paper(page).locator('.book');
    const before = await pages(page).count();
    await page.getByRole('radio', { name: 'B5' }).click();
    await expect(book).toHaveClass(/paper-b5/);
    await expect(status(page)).toContainText('B5・共');
    /* 頁面寬 182 mm（未縮放的 px） */
    expect(
      await pages(page)
        .nth(2)
        .evaluate((p) => (p as HTMLElement).offsetWidth),
    ).toBe(Math.round((182 * 96) / 25.4));
    await page.getByRole('radio', { name: 'A5' }).click();
    await page.getByRole('radio', { name: '深夜' }).click();
    await expect(book).toHaveClass(/theme-night/);
    await page.getByRole('radio', { name: '舊書' }).click();
    await expect(book).toHaveClass(/theme-antique/);
    await expect(page.getByTestId('coc-theme-name')).toHaveText('舊書');
    /* 封面 */
    await btn(page, '封面').click();
    await expect(btn(page, '封面')).toHaveAttribute('aria-pressed', 'false');
    await expect(paper(page).locator('.cover')).toHaveCount(0);
    await expect(paper(page).locator('.titleblock .tb-title')).toHaveText('霧港的第二道光');
    await btn(page, '封面').click();
    /* 目錄 */
    await btn(page, '目錄').click();
    await expect(paper(page).locator('.toc-page')).toHaveCount(0);
    await btn(page, '目錄').click();
    await expect(paper(page).locator('.toc-page')).toHaveCount(1);
    /* 每章換頁 */
    await btn(page, '每章換頁').click();
    await expect.poll(() => pages(page).count()).toBeLessThan(before);
    await btn(page, '每章換頁').click();
    await expect.poll(() => pages(page).count()).toBe(before);
    /* 書眉 */
    await expect(pages(page).nth(2).locator('.page-head')).toContainText('霧港的第二道光');
    await expect(pages(page).nth(2).locator('.page-head')).toContainText('01開始之前');
    await btn(page, '書眉').click();
    await expect(paper(page).locator('.page-head')).toHaveCount(0);
    await btn(page, '書眉').click();
    /* 顯示比例 */
    await page.getByRole('combobox', { name: '顯示比例' }).click();
    await page.getByRole('option', { name: '100%' }).click();
    const content = page
      .getByRole('region', { name: '紙面' })
      .locator('div[style*="scale"]')
      .first();
    await expect(content).toHaveAttribute('style', /scale\(1\)/);
    /* Ctrl＋滾輪縮放：選單顯示自訂倍率 */
    const region = page.getByRole('region', { name: '紙面' }).last();
    await region.hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect(page.getByRole('combobox', { name: '顯示比例' })).toHaveText('112%');
  });

  test('文字欄：打字後重新排版、格式按鈕、暫定文字、包住選取的行、復原', async ({ page }) => {
    await open(page);
    await setText(page, '第一段');
    await expect(paper(page).locator('.page-body p').first()).toHaveText('第一段');
    /* 章：插入範本，章名呈選取狀態，直接打字取代 */
    await source(page).click();
    await page.keyboard.press('Control+End');
    await formats(page).getByRole('button', { name: '章' }).click();
    await page.keyboard.type('新的章');
    await expect(source(page)).toHaveValue('第一段\n\n## 新的章\n');
    await page.waitForTimeout(700);
    await expect(paper(page).locator('h2[id] .ch-tx')).toHaveText('新的章');
    /* 選取「第一段」包成描述 */
    await source(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 3));
    await formats(page).getByRole('button', { name: '描述' }).click();
    /* 選取的行換成包好的內容＋換行（後面原本的換行保留，舊版相同） */
    await expect(source(page)).toHaveValue('> 第一段\n\n\n## 新的章\n');
    await page.waitForTimeout(700);
    await expect(paper(page).locator('.desc .desc-label')).toHaveText('描述');
    /* 瀏覽器的復原 */
    await page.keyboard.press('Control+z');
    await expect(source(page)).toHaveValue('第一段\n\n## 新的章\n');
    /* SANc 插在游標處、括號裡的文字選取 */
    await source(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 3));
    await formats(page).getByRole('button', { name: 'SANc' }).click();
    await page.keyboard.type('1/1d6');
    await expect(source(page)).toHaveValue('第一段SANc（1/1d6）\n\n## 新的章\n');
    await page.waitForTimeout(700);
    await expect(paper(page).locator('.san')).toHaveText('SANc（1/1d6）');
  });

  test('「/」選單：篩選、↑↓、Enter 插入、Esc 與移動游標時關閉', async ({ page }) => {
    await open(page);
    await setText(page, '甲\n');
    await source(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('/');
    await expect(slashMenu(page)).toBeVisible();
    await expect(slashMenu(page).getByRole('option')).toHaveCount(11);
    await expect(slashMenu(page).getByRole('option').first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowUp');
    await expect(slashMenu(page).getByRole('option').last()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('kp');
    await expect(slashMenu(page).getByRole('option')).toHaveCount(1);
    await expect(slashMenu(page).getByRole('option')).toContainText('KP 資訊');
    await page.keyboard.press('Enter');
    await expect(slashMenu(page)).toHaveCount(0);
    await page.keyboard.type('真相');
    await expect(source(page)).toHaveValue('甲\n\n:::kp\n真相\n:::\n');
    /* 沒有符合的格式：Enter 照常換行 */
    await page.keyboard.press('Control+End');
    await page.keyboard.type('/zzz');
    await expect(slashMenu(page)).toContainText('沒有符合的格式');
    await page.keyboard.press('Enter');
    await expect(slashMenu(page)).toHaveCount(0);
    await expect(source(page)).toHaveValue('甲\n\n:::kp\n真相\n:::\n/zzz\n');
    /* Esc 關閉；行中間的「/」不開；打空白關閉 */
    await page.keyboard.type('/');
    await expect(slashMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(slashMenu(page)).toHaveCount(0);
    await page.keyboard.type('a/');
    await expect(slashMenu(page)).toHaveCount(0);
    await page.keyboard.press('Enter');
    await page.keyboard.type('/檢 ');
    await expect(slashMenu(page)).toHaveCount(0);
    /* 點選項插入 */
    await page.keyboard.press('Enter');
    await page.keyboard.type('／');
    await slashMenu(page).getByRole('option', { name: /換頁/ }).click();
    await expect(source(page)).toHaveValue(/\n===換頁===\n$/);
  });

  test('封面資訊自動讀入、封面與概要', async ({ page }) => {
    await open(page);
    await setText(page, '');
    await source(page).fill(
      '---\n標題: 讀入的標題\n作者：某人\n舞台: 台南\n---\n\n## 第一章\n內文',
    );
    await expect(toast(page, '已把封面資訊讀進「封面與概要」分頁')).toBeVisible();
    await expect(source(page)).toHaveValue('## 第一章\n內文');
    await page.getByRole('tab', { name: '封面與概要' }).click();
    await expect(page.getByRole('textbox', { name: '標題', exact: true })).toHaveValue(
      '讀入的標題',
    );
    await expect(page.getByRole('textbox', { name: '作者', exact: true })).toHaveValue('某人');
    await expect(page.getByRole('combobox', { name: '項目 1' })).toHaveValue('舞台');
    await expect(page.getByRole('textbox', { name: '內容 1' })).toHaveValue('台南');
    await expect(page.getByTestId('coc-item')).toHaveCount(1);
    /* 改標題 → 封面與書眉 */
    await page.getByRole('textbox', { name: '標題', exact: true }).fill('新的標題');
    await expect(pages(page).first().locator('.cv-title')).toHaveText('新的標題');
    await expect(pages(page).nth(2).locator('.ph-title')).toHaveText('新的標題');
    /* 新增項目：焦點在新一列的項目欄 */
    await btn(page, '新增項目').click();
    await expect(page.getByRole('combobox', { name: '項目 2' })).toBeFocused();
    await page.keyboard.type('建議人數');
    await page.getByRole('textbox', { name: '內容 2' }).fill('3 人');
    await expect(pages(page).first().locator('.spec-item dt')).toHaveText(['舞台', '建議人數']);
    await btn(page, '上移（第 2 項）').click();
    await expect(pages(page).first().locator('.spec-item dt')).toHaveText(['建議人數', '舞台']);
    await btn(page, '刪除（第 1 項）').click();
    await expect(pages(page).first().locator('.spec-item dt')).toHaveText(['舞台']);
  });

  test('游標與紙面同步、點紙面跳到內文、點封面到標題欄、點目錄捲到標題', async ({ page }) => {
    await open(page);
    /* 游標移到「### 燈室」那一行 → 紙面上的該標題加外框 */
    const value = await source(page).inputValue();
    const line = value.split('\n').indexOf('### 燈室');
    const pos = value.split('\n').slice(0, line).join('\n').length + 1;
    await source(page).click();
    await source(page).evaluate((el: HTMLTextAreaElement, p) => el.setSelectionRange(p, p), pos);
    await page.keyboard.press('End');
    await expect(paper(page).locator('.is-cursor')).toHaveText('燈室');
    /* 點紙面的描述 → 游標在那一個區塊的第一行 */
    const desc = paper(page).locator('.desc').first();
    const dl = Number(await desc.getAttribute('data-line'));
    await desc.click();
    await expect(source(page)).toBeFocused();
    const caret = await source(page).evaluate((el: HTMLTextAreaElement) => el.selectionStart);
    expect(value.slice(0, caret).split('\n').length - 1).toBe(dl);
    await expect(paper(page).locator('.is-cursor').first()).toHaveClass(/desc/);
    /* 點封面 → 封面與概要、焦點在標題欄 */
    await pages(page)
      .first()
      .click({ position: { x: 100, y: 100 } });
    await expect(page.getByRole('textbox', { name: '標題', exact: true })).toBeFocused();
    /* 點目錄 → 紙面捲到該章 */
    const scroller = page.getByRole('region', { name: '紙面' }).last();
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await pages(page).nth(1).locator('.toc-item.lv2').last().click();
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000);
    expect(page.url()).not.toContain('#');
  });

  test('新建、讀入範例、放不下的內容', async ({ page }) => {
    await open(page);
    await btn(page, '新建').click();
    const dlg = page.getByRole('alertdialog');
    await expect(dlg).toContainText('建立新的劇本？');
    await dlg.getByRole('button', { name: '清除並新建' }).click();
    await expect(toast(page, '已建立新的劇本，可以從標題開始輸入')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '標題', exact: true })).toBeFocused();
    await expect(page.getByTestId('coc-item')).toHaveCount(5);
    await expect(page.getByRole('combobox', { name: '項目 1' })).toHaveValue('規則版本');
    await page.getByRole('tab', { name: '內文' }).click();
    await expect(source(page)).toHaveValue('');
    await expect(pages(page).first().locator('.cv-title')).toHaveText('未命名劇本');
    /* 設定保留 */
    await page.getByRole('radio', { name: 'A4' }).click();
    /* 放不下的內容 */
    await setText(page, `# ${'非常長的大標題文字'.repeat(60)}`);
    await expect(page.getByTestId('coc-over')).toHaveText('有放不進一頁的內容（1 頁，以紅框標出）');
    await expect(paper(page).locator('.page.overflow')).toHaveCount(1);
    /* 讀入範例 */
    await btn(page, '寫法說明').click();
    const help = page.getByRole('dialog', { name: '寫法說明' });
    await expect(help).toContainText('內文的寫法');
    await help.getByRole('button', { name: /讀入範例劇本/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '讀入範例' }).click();
    await expect(help).toHaveCount(0);
    await expect(source(page)).toHaveValue(/^## 開始之前/);
    await expect(pages(page).first().locator('.cv-title')).toHaveText('霧港的第二道光');
    await expect(paper(page).locator('.book')).toHaveClass(/paper-a4/);
  });

  test('排版錯誤：顯示原因、紙面維持上一次的結果、下次成功時消失', async ({ page }) => {
    await open(page);
    const before = await pages(page).count();
    await page.evaluate(() => {
      document.createTreeWalker = () => {
        throw new Error('測試用的錯誤');
      };
    });
    await source(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('追加');
    await expect(page.getByRole('alert')).toContainText('排版時發生錯誤：測試用的錯誤');
    await expect(pages(page)).toHaveCount(before);
    await page.evaluate(() => {
      delete (document as unknown as Record<string, unknown>).createTreeWalker;
    });
    await page.keyboard.type('再追加');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(paper(page).locator('.page-body').last()).toContainText('追加再追加');
  });

  test('輸出：列印用文件（只有紙面）與 Ctrl＋P、儲存列印用 HTML', async ({ page }) => {
    await open(page);
    const n = await pages(page).count();
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
    });
    await btn(page, '列印成 PDF').click();
    const frame = page.frameLocator('iframe[data-paged-print]');
    await expect(frame.locator('.paged-print-page')).toHaveCount(n);
    await expect(frame.locator('body')).toHaveClass('book paper-a5 theme-mono');
    await expect(frame.locator('[data-line]')).toHaveCount(0);
    await expect(frame.locator('.is-cursor')).toHaveCount(0);
    expect(await page.locator('iframe[data-paged-print]').getAttribute('title')).toBe(
      '霧港的第二道光',
    );
    const css = await frame.locator('style').first().textContent();
    expect(css).toContain('@page{size:148mm 210mm;margin:0}');
    /* Ctrl＋P（文字欄裡也有效）：重新建立列印文件 */
    await page.getByRole('radio', { name: 'B5' }).click();
    await source(page).click();
    await page.keyboard.press('Control+p');
    await expect(frame.locator('body')).toHaveClass('book paper-b5 theme-mono');
    await expect(page.locator('iframe[data-paged-print]')).toHaveCount(1);
    /* 儲存列印用 HTML */
    const { name, text } = await download(page, () => btn(page, '儲存列印用 HTML').click());
    expect(name).toBe('霧港的第二道光_列印用.html');
    await expect(toast(page, `已儲存 ${name}`)).toBeVisible();
    expect(text).toContain('<title>霧港的第二道光</title>');
    expect(text).toContain('@page{size:182mm 257mm;margin:0}');
    expect(text).not.toContain('data-line');
    expect(text).not.toContain('<script');
    const parsed = await page.evaluate((html) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      return {
        pages: d.querySelectorAll('.book > .page').length,
        cls: d.querySelector('.book')?.className,
        lang: d.documentElement.lang,
        cover: d.querySelector('.cv-title')?.textContent,
      };
    }, text);
    expect(parsed).toEqual({
      pages: await pages(page).count(),
      cls: 'book paper-b5 theme-mono',
      lang: 'zh-Hant-TW',
      cover: '霧港的第二道光',
    });
  });

  test('自動存檔、讀入舊版存檔', async ({ page }) => {
    await open(page);
    await setText(page, '## 存起來的章\n內文');
    await page.getByRole('radio', { name: 'B5' }).click();
    await page.reload();
    await open(page, { goto: false });
    await expect(source(page)).toHaveValue('## 存起來的章\n內文');
    await expect(paper(page).locator('.book')).toHaveClass(/paper-b5/);
    /* 舊版的存檔（新版沒有存檔時才讀） */
    await page.evaluate(
      ([key, legacy]) => {
        localStorage.clear();
        localStorage.setItem(
          legacy,
          JSON.stringify({
            text: '## 舊版的章\n舊內文',
            meta: {
              title: '舊作',
              subtitle: '',
              author: '',
              items: [{ key: '舞台', value: '台東' }],
            },
            settings: {
              paper: 'A4',
              theme: 'shinkai',
              cover: true,
              toc: false,
              chapter: true,
              header: true,
              zoom: '1',
            },
          }),
        );
        void key;
      },
      [STORE_KEY, LEGACY_KEY],
    );
    await page.reload();
    await open(page, { goto: false });
    await expect(source(page)).toHaveValue('## 舊版的章\n舊內文');
    await expect(paper(page).locator('.book')).toHaveClass('book paper-a4 theme-night');
    await expect(paper(page).locator('.toc-page')).toHaveCount(0);
    await expect(pages(page).first().locator('.cv-title')).toHaveText('舊作');
    await expect(pages(page).first().locator('.spec-item dd')).toHaveText('台東');
    await expect(page.getByRole('combobox', { name: '顯示比例' })).toHaveText('100%');
    /* 舊版的存檔不刪 */
    expect(await page.evaluate((k) => localStorage.getItem(k) !== null, LEGACY_KEY)).toBe(true);
  });

  test('視覺回歸：1280', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('coc-typesetter-1280.png');
  });
});

test.describe('CoC 劇本排版工具（窄畫面）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('編輯／預覽切換、收合設定與格式按鈕（記住）、沒有橫向捲動', async ({ page }) => {
    const errors = await open(page);
    await noHorizontalScroll(page);
    const pane = page.getByRole('radiogroup', { name: '顯示' });
    await expect(source(page)).toBeVisible();
    await expect(page.getByRole('region', { name: '紙面' }).first()).toBeHidden();
    await pane.getByRole('radio', { name: '預覽' }).click();
    await expect(source(page)).toBeHidden();
    await expect(pages(page).first()).toBeVisible();
    await noHorizontalScroll(page);
    /* 點紙面 → 回到編輯 */
    await paper(page).locator('h2[id]').first().click();
    await expect(source(page)).toBeVisible();
    await expect(pane.getByRole('radio', { name: '編輯' })).toHaveAttribute('aria-checked', 'true');
    /* 收合 */
    await page.getByRole('button', { name: '設定' }).click();
    await expect(page.getByTestId('coc-settings')).toBeHidden();
    await page.getByRole('button', { name: /格式按鈕/ }).click();
    await expect(formats(page)).toBeHidden();
    await page.reload();
    await open(page, { goto: false });
    await expect(page.getByTestId('coc-settings')).toBeHidden();
    await expect(formats(page)).toBeHidden();
    await page.getByRole('button', { name: '設定' }).click();
    await page.getByRole('button', { name: /格式按鈕/ }).click();
    await expect(page.getByTestId('coc-settings')).toBeVisible();
    await expect(formats(page)).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('舊版的收合狀態（新版沒有時）', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('coc-typesetter:ui', JSON.stringify({ foldBar: true, foldIns: false })),
    );
    await open(page);
    await expect(page.getByTestId('coc-settings')).toBeHidden();
    await expect(formats(page)).toBeVisible();
  });

  test('視覺回歸：390', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('coc-typesetter-390.png', { fullPage: true });
  });
});
