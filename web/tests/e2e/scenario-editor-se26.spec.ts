/**
 * 劇本排版台 2026-10 跟進（上游 v3.10～v3.26）第一批的端對端測試（規格 1.14 F261～F276）：
 * - 儲存選單：存成 JSON 檔（Ctrl＋S）、存到瀏覽器（有名稱的版本，★）、還原；
 * - 背景：9 種花紋、每頁的紙色、勾選頁面時面板跟著那頁、隨機配色的對比；
 * - 文字大小：段落、選取的文字、Ctrl＋Shift＋> ／ <、混在一起時「—」、恢復預設；
 * - 匯出 HTML 的浮動視窗；列印與 PDF 的「→ 附錄」「↩ 回到 P.n」、場景轉換連到標題（PDF 裡可以按）；
 * - 場景轉換的「跳到的標題」；讀入原作 v3.26 的原稿。
 */
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { getTool, outputDir } from '../../src/registry';
import { pdfPageTexts } from '../helpers/pdf';

const URL = `/${outputDir(getTool('scenario-editor') ?? { id: 'scenario-editor', status: 'next' })}/`;
/** 原作 v3.26.0 的程式產生的原稿（紙色、花紋、文字大小、場景轉換、彈出視窗） */
const UP326 = new globalThis.URL('./fixtures/scenario-editor-upstream-v326.json', import.meta.url);
const TTC = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const CORS = { 'access-control-allow-origin': '*' };

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

async function routeExternal(target: Page | BrowserContext) {
  await target.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await target.route(/fonts\.gstatic\.com\/s\/noto(serif|sans)tc\/.*\.ttf$/, (r) =>
    r.fulfill({ status: 200, contentType: 'font/ttf', headers: CORS, body: readFileSync(TTC) }),
  );
  /* PDF 的補字：DejaVu Sans（箭頭等） */
  await target.route(/fonts\.googleapis\.com\/css2\?.*&text=/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'text/css',
      headers: CORS,
      body: "@font-face{font-family:'T';src:url(https://fonts.gstatic.com/l/font?kit=t) format('truetype');}",
    }),
  );
  await target.route(/fonts\.gstatic\.com\/l\/font\?/, (r) =>
    r.fulfill({ status: 200, contentType: 'font/ttf', headers: CORS, body: readFileSync(DEJAVU) }),
  );
}

const stage = (page: Page) => page.getByTestId('se-stage');
const status = (page: Page) => page.getByTestId('se-status');

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeExternal(page);
  await page.goto(URL);
  await expect(status(page)).toContainText('已開啟');
  await expect(stage(page).locator('.pg').first()).toBeVisible();
  return errors;
}

async function loadFile(page: Page, file: { name: string; buffer: Buffer }, title: string) {
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('toolbar', { name: '工具列' })
    .getByRole('button', { name: '開啟', exact: true })
    .click();
  await (await chooser).setFiles({ ...file, mimeType: 'application/json' });
  await expect(status(page)).toContainText(title);
}

async function loadUpstream(page: Page) {
  await loadFile(
    page,
    { name: 'v326.json', buffer: readFileSync(UP326.pathname) },
    '紙色與連結的驗證稿',
  );
  /* 排版（分頁）完成 */
  await expect(stage(page).locator('.pg')).toHaveCount(4);
}

type TestBlock = { id: string; type: string; cols: number; text: string } & Record<string, unknown>;
const blk = (id: string, type: string, text = '', extra: Record<string, unknown> = {}) =>
  ({ id, type, cols: 2, text, ...extra }) as TestBlock;
const loadDoc = (page: Page, title: string, blocks: TestBlock[], extra: object = {}) =>
  loadFile(
    page,
    {
      name: 'doc.json',
      buffer: Buffer.from(
        JSON.stringify({
          title,
          padV: 18,
          padH: 16,
          base: 10,
          foot: { num: true, text: '', from: 1 },
          pages: [{ id: 'p1', bg: { preset: 'none', img: null, fit: 'cover', opa: 35 }, cols: 1 }],
          blocks,
          ...extra,
        }),
      ),
    },
    title,
  );

async function download(page: Page, click: () => Promise<void>) {
  const d = page.waitForEvent('download');
  await click();
  const dl = await d;
  return { name: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) };
}

async function saveJson(page: Page) {
  await page.getByTestId('se-save-menu').click();
  await page.getByRole('menuitem', { name: /存成 JSON 檔/ }).click();
}

async function savedDoc(page: Page) {
  const { bytes } = await download(page, () => saveJson(page));
  return JSON.parse(bytes.toString('utf8')).data as {
    pages: { bg: Record<string, unknown> }[];
    blocks: (TestBlock & { pt?: number; mk?: Record<string, unknown>[]; jump?: string })[];
  };
}

async function exportedHtml(page: Page): Promise<string> {
  await page.getByRole('button', { name: '匯出', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: '匯出閱覽用 HTML' });
  const { bytes } = await download(page, () =>
    dlg.getByRole('button', { name: '匯出', exact: true }).click(),
  );
  return bytes.toString('utf8');
}

test.describe('劇本排版台：2026-10 跟進第一批', () => {
  test('儲存選單：存成 JSON 檔（Ctrl＋S 也是）、存到瀏覽器留下有名稱的版本、還原（F261～F263）', async ({
    page,
  }) => {
    const errors = await open(page);
    await page.getByTestId('se-save-menu').click();
    const menu = page.getByRole('menu', { name: '儲存' });
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    await expect(menu.getByRole('menuitem').first()).toContainText('存到瀏覽器');
    await expect(menu.getByRole('menuitem').nth(1)).toContainText('Ctrl＋S');
    await page.keyboard.press('Escape');
    const a = await download(page, () => saveJson(page));
    expect(a.name).toBe('未命名的劇本.json');
    expect(JSON.parse(a.bytes.toString('utf8')).format).toBe('trpg-toolkit-project');
    const b = await download(page, () => page.keyboard.press('Control+s'));
    expect(b.name).toBe('未命名的劇本.json');
    /* 存到瀏覽器：預設名稱「手動儲存 日期時間」 */
    await page.getByTestId('se-save-menu').click();
    await page.getByRole('menuitem', { name: /存到瀏覽器/ }).click();
    const dlg = page.getByRole('dialog', { name: '存到瀏覽器' });
    const field = dlg.getByRole('textbox', { name: '這個版本的名稱' });
    await expect(field).toHaveValue(/^手動儲存 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    await field.fill('第一版');
    await dlg.getByRole('button', { name: '儲存' }).click();
    await expect(status(page)).toContainText('已在這個瀏覽器留下「第一版」');
    /* 內容沒變也留（自己留的版本） */
    await page.getByTestId('se-save-menu').click();
    await page.getByRole('menuitem', { name: /存到瀏覽器/ }).click();
    await dlg.getByRole('textbox').fill('第二版');
    await dlg.getByRole('textbox').press('Enter');
    await expect(status(page)).toContainText('「第二版」');
    /* 取消時不留 */
    await page.getByTestId('se-save-menu').click();
    await page.getByRole('menuitem', { name: /存到瀏覽器/ }).click();
    await dlg.getByRole('button', { name: '取消' }).click();
    await page.getByRole('button', { name: '作品', exact: true }).click();
    const lib = page.getByRole('dialog', { name: '作品' });
    await lib.getByRole('button', { name: '過去的版本' }).click();
    const gens = page.getByRole('dialog', { name: '過去的版本' });
    await expect(gens.getByTestId('se-gen-name')).toHaveText(['★ 第二版', '★ 第一版']);
    await expect(gens).toContainText('不會被自動留的版本擠掉');
    await expect(gens.getByRole('listitem')).toHaveCount(3);
    await gens.getByRole('listitem').nth(1).getByRole('button', { name: '還原成新作品' }).click();
    await expect(page.getByRole('dialog', { name: '作品' })).toContainText('2 個作品');
    expect(errors).toEqual([]);
  });

  test('背景：9 種花紋、每頁的紙色、勾選頁面時面板跟著那頁（F264～F266）', async ({ page }) => {
    const errors = await open(page);
    await loadDoc(page, '背景', [
      blk('a', 'desc', '第一頁'),
      blk('b1', 'break'),
      blk('b', 'desc', '第二頁'),
      blk('b2', 'break'),
      blk('c', 'desc', '第三頁'),
    ]);
    await expect(stage(page).locator('.pg')).toHaveCount(3);
    await page.getByRole('tab', { name: '頁面' }).click();
    const chips = page.getByRole('group', { name: '花紋' });
    await expect(chips.getByRole('button')).toHaveText([
      '素色',
      '紙紋',
      '方格',
      '圓點',
      '舊紙',
      '和紙',
      '裝飾框',
      '四角花飾',
      '上下色帶',
    ]);
    await page.getByRole('checkbox', { name: /^P\.2/ }).click();
    await chips.getByRole('button', { name: '和紙' }).click();
    const papers = page.getByRole('group', { name: '紙的顏色' });
    await papers.getByRole('button', { name: '淡水藍' }).click();
    await expect(papers.getByRole('button', { name: '淡水藍' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText(/淡水藍（#e9f0f3）　和文字的對比 \d+\.\d:1（AAA）/)).toBeVisible();
    await page.getByRole('button', { name: '套用到選取的頁面' }).click();
    await expect(status(page)).toContainText('已把背景套用到 1 頁');
    const p2 = stage(page).locator('.pg').nth(1);
    await expect(p2).toHaveClass(/bg-washi/);
    await expect(p2).toHaveAttribute('style', '--paper:#e9f0f3;');
    expect(await p2.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(233, 240, 243)',
    );
    await expect(page.getByRole('checkbox', { name: 'P.2 單欄／和紙／淡水藍' })).toBeVisible();
    /* 其他頁不跟著變 */
    await expect(page.getByRole('checkbox', { name: 'P.3 單欄／素色' })).toBeVisible();
    /* 勾選 P.1（第一個勾選的頁）→ 面板換成 P.1 的素色；取消 P.1 → 回到 P.2 的和紙＋淡水藍 */
    await page.getByRole('checkbox', { name: /^P\.1/ }).click();
    await expect(chips.getByRole('button', { name: '素色' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(papers.getByRole('button', { name: '米白' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('checkbox', { name: /^P\.1/ }).click();
    await expect(chips.getByRole('button', { name: '和紙' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(papers.getByRole('button', { name: '淡水藍' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    /* 只改紙色：花紋不變 */
    await papers.getByRole('button', { name: '淡粉紅' }).click();
    await page.getByRole('button', { name: '套用到選取的頁面' }).click();
    await expect(p2).toHaveClass(/bg-washi/);
    await expect(p2).toHaveAttribute('style', '--paper:#f8ece9;');
    /* 隨機配色：一定是 AAA */
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: '隨機配色' }).click();
      await expect(page.getByText(/和文字的對比 \d+\.\d:1（AAA）/)).toBeVisible();
    }
    /* P.3：裝飾框（帶間距）、上下色帶的預設紙色 */
    await page.getByRole('checkbox', { name: /^P\.2/ }).click();
    await page.getByRole('checkbox', { name: /^P\.3/ }).click();
    await chips.getByRole('button', { name: '上下色帶' }).click();
    await page.getByRole('button', { name: '套用到選取的頁面' }).click();
    const p3 = stage(page).locator('.pg').nth(2);
    await expect(p3).toHaveAttribute('style', '--mv:18mm;--mh:16mm;');
    expect(await p3.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(241, 239, 234)',
    );
    await chips.getByRole('button', { name: '裝飾框' }).click();
    await page.getByRole('button', { name: '套用到選取的頁面' }).click();
    await expect(p3).toHaveClass(/bg-frame/);
    const frame = await p3
      .locator('.pg-bg')
      .evaluate((el) => getComputedStyle(el, '::before').borderTopWidth);
    expect(frame).toBe('1px');
    const saved = await savedDoc(page);
    expect(saved.pages[1].bg).toMatchObject({ preset: 'bg-washi', color: '#f8ece9' });
    expect(saved.pages[2].bg).toMatchObject({ preset: 'bg-frame', color: '' });
    /* 移除背景 */
    await page.getByRole('button', { name: '移除背景' }).click();
    await expect(p3).not.toHaveAttribute('style', /.+/);
    expect(errors).toEqual([]);
  });

  test('文字大小：段落、選取的文字、Ctrl＋Shift＋> ／ <、混在一起時「—」、恢復預設（F273～F275）', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadDoc(page, '文字大小', [blk('a', 'desc', '一二三四五六七八'), blk('h', 'h1', '標題')]);
    const para = stage(page).locator('[data-id="a"] > .b');
    const sizes = page.getByRole('group', { name: '文字大小' });
    const input = page.getByRole('spinbutton', { name: '文字大小（pt）' });
    /* 選取段落 → 目前 10 pt */
    await stage(page).locator('[data-id="a"]').click();
    await expect(input).toHaveValue('10');
    await expect(sizes.getByRole('button', { name: '10 pt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await sizes.getByRole('button', { name: '14 pt' }).click();
    await expect(para).toHaveAttribute('style', 'font-size:14pt;');
    await expect(input).toHaveValue('14');
    /* 標題 1 本來是 16 pt */
    await stage(page).locator('[data-id="h"]').click();
    await expect(input).toHaveValue('16');
    /* 選取的文字：只改那一段；和段落的大小混在一起時「—」 */
    const ta = page.getByTestId('se-source').getByRole('textbox', { name: '描述文的文字' });
    await ta.focus();
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(2, 4));
    await expect(input).toHaveValue('14');
    await sizes.getByRole('button', { name: '24 pt' }).click();
    await expect(para.locator('span[style]')).toHaveAttribute('style', 'font-size:24pt;');
    await expect(para.locator('span[style]')).toHaveText('三四');
    await expect(input).toHaveValue('24');
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 8));
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('placeholder', '—');
    await expect(sizes.getByRole('button', { name: '14 pt' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    /* 顏色和大小可以同時加 */
    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(2, 3));
    await page.getByRole('button', { name: '朱', exact: true }).click();
    await expect(para.locator('span[style]').first()).toHaveAttribute(
      'style',
      'color:#a8331f;font-size:24pt;',
    );
    /* Ctrl＋Shift＋>：24 → 26 */
    await ta.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(2, 4);
    });
    await page.keyboard.press('Control+Shift+Period');
    await expect(para.locator('span[style*="26pt"]')).toHaveCount(2);
    await expect(status(page)).toContainText('26pt');
    /* 輸入 pt（Enter 套用） */
    await input.fill('11.3');
    await input.press('Enter');
    await expect(para.locator('span[style*="11.5pt"]')).toHaveCount(2);
    /* 取消選取文字，Ctrl＋Shift＋< 改段落：14 → 12 */
    await ta.press('Escape');
    await stage(page).locator('[data-id="a"]').click();
    await page.keyboard.press('Control+Shift+Comma');
    await expect(para).toHaveAttribute('style', 'font-size:12pt;');
    let saved = await savedDoc(page);
    expect(saved.blocks.find((x) => x.id === 'a')?.pt).toBe(12);
    /* 顏色與大小是分開的裝飾（範圍可以重疊） */
    expect(saved.blocks.find((x) => x.id === 'a')?.mk).toEqual([
      { a: 2, b: 3, col: '#a8331f', bold: false },
      { a: 2, b: 4, col: '', bold: false, pt: 11.5 },
    ]);
    /* 恢復預設：段落與文字另外設的大小都拿掉（顏色留著） */
    await page.getByRole('button', { name: '恢復預設' }).last().click();
    await expect(para).not.toHaveAttribute('style', /font-size/);
    saved = await savedDoc(page);
    const a = saved.blocks.find((x) => x.id === 'a');
    expect(a?.pt).toBeUndefined();
    expect(a?.mk).toEqual([{ a: 2, b: 3, col: '#a8331f', bold: false }]);
    /* 72 pt 不能再放大 */
    await input.fill('72');
    await input.press('Enter');
    await page.keyboard.press('Control+Shift+Period');
    await expect(status(page)).toContainText('不能再放大了');
    expect(errors).toEqual([]);
  });

  test('匯出 HTML：浮動視窗（開、拖曳、好幾個、Esc、焦點回到按鈕、窄畫面在下半部）（F268）', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await loadUpstream(page);
    const html = await exportedHtml(page);
    const view = await context.newPage();
    const verr: string[] = [];
    view.on('pageerror', (e) => verr.push(e.message));
    await routeExternal(view);
    await view.setViewportSize({ width: 1280, height: 900 });
    await view.setContent(html);
    const btn1 = view.locator('#doc [data-popopen="pp2"]').first();
    await btn1.click();
    const w = view.locator('.fwin');
    await expect(w).toHaveCount(1);
    await expect(w).toHaveAttribute('role', 'dialog');
    await expect(w).toHaveAttribute('aria-modal', 'false');
    await expect(w.locator('.fw-t')).toHaveText('管家的證詞');
    await expect(w).toHaveAccessibleName('管家的證詞');
    await expect(w.locator('.fw-b')).toContainText('「那晚我什麼都沒聽見。」');
    await expect(w.locator('.fw-x')).toBeFocused();
    expect(await w.evaluate((el) => getComputedStyle(el).resize)).toBe('both');
    const r1 = await w.boundingBox();
    expect([r1?.x, r1?.y, r1?.width, r1?.height]).toEqual([776, 60, 480, 600]);
    /* 背景不變暗：本文照樣可以按 */
    await expect(view.locator('#popOv')).toHaveCount(0);
    /* 拖曳標題列 */
    const hb = await w.locator('.fw-h').boundingBox();
    if (!hb) throw new Error('no header');
    await view.mouse.move(hb.x + 40, hb.y + 10);
    await view.mouse.down();
    await view.mouse.move(hb.x - 160, hb.y + 110, { steps: 5 });
    await view.mouse.up();
    expect(await w.boundingBox()).toMatchObject({ x: 576, y: 160 });
    /* 第二個視窗：錯開 28 px、在上面 */
    await view.locator('#doc [data-popopen="pp1"]').first().click();
    await expect(view.locator('.fwin')).toHaveCount(2);
    const w2 = view.locator('.fwin').nth(1);
    expect(await w2.boundingBox()).toMatchObject({ x: 748, y: 88 });
    const w1 = view.locator('.fwin').first();
    const z = async (l: typeof w) => Number(await l.evaluate((el) => el.style.zIndex));
    expect(await z(w2)).toBeGreaterThan(await z(w1));
    /* 同一個按鈕再按：不開新的，第一個移到上面 */
    await btn1.click();
    await expect(view.locator('.fwin')).toHaveCount(2);
    expect(await z(w1)).toBeGreaterThan(await z(w2));
    /* Esc：關掉焦點所在的視窗，焦點回到按鈕；再 Esc 關掉剩下的 */
    await view.keyboard.press('Escape');
    await expect(view.locator('.fwin')).toHaveCount(1);
    await expect(btn1).toBeFocused();
    await view.keyboard.press('Escape');
    await expect(view.locator('.fwin')).toHaveCount(0);
    /* 列印時不印 */
    await btn1.click();
    await view.emulateMedia({ media: 'print' });
    expect(await view.locator('.fwin').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    await view.emulateMedia({ media: 'screen' });
    await view.keyboard.press('Escape');
    /* 窄畫面：畫面的下半部 */
    await view.setViewportSize({ width: 390, height: 800 });
    await view.evaluate(() => (document.querySelector('[data-popopen]') as HTMLElement).click());
    expect(await view.locator('.fwin').boundingBox()).toEqual({
      x: 0,
      y: 352,
      width: 390,
      height: 448,
    });
    await view.close();
    expect(verr).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('列印與 PDF：「→ 附錄」「↩ 回到 P.n」、場景轉換連到標題，PDF 裡可以按（F269、F270、F272）', async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    const errors = await open(page);
    await loadUpstream(page);
    /* 列印用文件 */
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    const dlg = page.getByRole('dialog', { name: '列印 / PDF' });
    await dlg.getByRole('button', { name: '列印', exact: true }).click();
    const doc = page.frameLocator('iframe[data-paged-print]');
    await expect(doc.locator('.paged-print-page')).toHaveCount(5);
    const plink = doc.locator('.pop-plink').first();
    await expect(plink).toBeVisible();
    await expect(plink).toHaveText('→ 附錄「管家的證詞」');
    await expect(plink).toHaveAttribute('href', '#apxpp2');
    await expect(doc.locator('[data-popopen="pp2"]').first()).toBeHidden();
    await expect(doc.locator('#apxpp2')).toHaveText('管家的證詞');
    await expect(doc.locator('.ap-backs a')).toHaveText(['↩ 回到 P.1', '↩ 回到 P.1']);
    await expect(doc.locator('.ap-backs a').first()).toHaveAttribute('href', '#prpp1-1');
    await expect(doc.locator('[data-id="sc1"] a.scene-link')).toHaveAttribute('href', '#bh1b');
    await expect(doc.locator('[data-id="sc2"] a.scene-link')).toHaveAttribute('href', '#bh1a');
    await expect(doc.locator('#bh1b')).toHaveText('大廳');
    /* 匯出 HTML：畫面上看不到、列印時出現；場景轉換在畫面上也能按 */
    const html = await exportedHtml(page);
    const view = await context.newPage();
    await routeExternal(view);
    await view.setContent(html);
    await expect(view.locator('.pop-plink').first()).toBeHidden();
    await view.emulateMedia({ media: 'print' });
    await expect(view.locator('.pop-plink').first()).toBeVisible();
    await expect(view.locator('#doc .pg [data-popopen="pp2"]')).toBeHidden();
    await view.emulateMedia({ media: 'screen' });
    await view.locator('[data-id="sc1"] a.scene-link').click();
    await expect(view.locator('#bh1b')).toBeInViewport();
    await view.close();
    /* PDF：連結註解 */
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    const { bytes } = await download(page, () =>
      dlg.getByRole('button', { name: '下載 PDF' }).click(),
    );
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    expect(pages).toHaveLength(5);
    const index = new Map(pages.map((p, i) => [p.ref.toString(), i]));
    const links = pages.map((p) =>
      (p.node.Annots()?.asArray() ?? []).map((ref) => {
        const a = pdf.context.lookup(ref, PDFDict);
        expect(String(a.get(PDFName.of('Subtype')))).toBe('/Link');
        const dest = a.lookup(PDFName.of('Dest'), PDFArray);
        return index.get(dest.get(0).toString());
      }),
    );
    /* P.1：→ 附錄 ×2（附錄頁）、場景轉換 ×4（P.2、P.1、P.2、P.2）；附錄：↩ 回到 ×2（P.1） */
    expect(links[0]).toEqual([4, 4, 1, 0, 1, 1]);
    expect(links[4]).toEqual([0, 0]);
    const texts = pdfPageTexts(pdf);
    expect(texts[0].text).toContain('→附錄「管家的證詞」');
    expect(texts[4].text).toContain('↩回到P.1');
    expect(errors).toEqual([]);
  });

  test('場景轉換的「跳到的標題」與讀入原作 v3.26 的原稿（F271、F276）', async ({ page }) => {
    const errors = await open(page);
    await loadUpstream(page);
    /* 原作 v3.26 的紙色與花紋、文字大小 */
    const pgs = stage(page).locator('.pg');
    await expect(pgs).toHaveCount(4);
    await expect(pgs.nth(0)).toHaveClass(/bg-washi/);
    await expect(pgs.nth(0)).toHaveAttribute('style', '--paper:#f8ece9;');
    await expect(pgs.nth(3)).toHaveAttribute('style', '--mv:18mm;--mh:16mm;--paper:#88b0d7;');
    await expect(stage(page).locator('[data-id="d2"] > .b')).toHaveAttribute(
      'style',
      'font-size:14pt;',
    );
    await expect(stage(page).locator('[data-id="h2a"] > .b')).toHaveAttribute(
      'style',
      'font-size:20pt;',
    );
    /* 場景轉換：找到的標題 */
    await stage(page).locator('[data-id="sc1"]').click();
    const target = page.getByTestId('se-scene-target');
    await expect(target).toHaveText('→「大廳」（P.2）');
    const jump = page.getByRole('combobox', { name: '跳到的標題' });
    await expect(jump).toHaveValue('');
    const opts = await page
      .locator('datalist[id^="se-jump-"] option')
      .evaluateAll((l) => l.map((o) => (o as HTMLOptionElement).value));
    expect(opts).toEqual(['書房', '大廳', '地下室']);
    await jump.fill('地下室');
    await expect(target).toHaveText('→「地下室」（P.2）');
    await jump.fill('廚房');
    await expect(target).toContainText(
      '找不到要連的標題（建立名為「廚房」的標題 1～3 就能連過去）',
    );
    await jump.fill('書房');
    await expect(target).toHaveText('→「書房」（P.1）');
    const saved = await savedDoc(page);
    expect(saved.blocks.find((b) => b.id === 'sc1')?.jump).toBe('書房');
    expect(saved.blocks.find((b) => b.id === 'sc4')?.jump).toBe('大廳');
    expect(saved.pages.map((p) => p.bg.color)).toEqual(['#f8ece9', '', '', '#88b0d7']);
    expect(errors).toEqual([]);
  });
});
