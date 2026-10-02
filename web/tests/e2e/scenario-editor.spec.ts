/**
 * 劇本排版台（建置產物 next/scenario-editor/）的端對端測試：
 * - 開頁：沒有 pageerror／console error；第一次使用直接用範例原稿建立作品（F008）；
 * - 書寫：打字、Enter 分段、Backspace 接合、斜線指令、書式快捷鍵（實體按鍵位置）、復原、多段貼上（F033～F037、F240、F019）；
 * - 紙面：自動分頁、目錄頁碼、頁尾、選取與捲動（F180～F190）；
 * - 輸出：存成檔案（解析 JSON）、匯出閱覽 HTML（解析並執行腳本）、下載 PDF（pdf-lib 解析）、列印用文件（F013、F230～F233）；
 * - 作品清單：新建、複製、刪除到垃圾桶、還原、兩個分頁的鎖（F001～F009）；
 * - 彈出視窗、流程圖、表格、NPC 卡（自動計算、CCFOLIA 棋子）（1.6）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('scenario-editor') ?? { id: 'scenario-editor', status: 'next' })}/`;
const SAMPLE = new globalThis.URL('./fixtures/scenario-editor-sample.json', import.meta.url);
const TTC = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

async function routeExternal(target: Page | BrowserContext) {
  await target.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  /* PDF 用的完整字型：換成容器裡的 TTC（後登記的先比對） */
  await target.route(/fonts\.gstatic\.com\/s\/noto(serif|sans)tc\/.*\.ttf$/, (r) =>
    r.fulfill({ status: 200, contentType: 'font/ttf', body: readFileSync(TTC) }),
  );
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeExternal(page);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '劇本排版台' })).toBeVisible();
  await expect(page.getByTestId('se-status')).toContainText('已開啟');
  await expect(stage(page).locator('.pg').first()).toBeVisible();
  return errors;
}

const stage = (page: Page) => page.getByTestId('se-stage');
const source = (page: Page) => page.getByTestId('se-source');
const status = (page: Page) => page.getByTestId('se-status');
const rowText = (page: Page, label: string) =>
  source(page).getByRole('textbox', { name: `${label}的文字` });

async function openSample(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('toolbar', { name: '工具列' })
    .getByRole('button', { name: '開啟', exact: true })
    .click();
  await (await chooser).setFiles(SAMPLE.pathname);
  await expect(status(page)).toContainText('霧中的洋館');
  await expect(stage(page).locator('.pg')).toHaveCount(5);
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
  return { name: dl.suggestedFilename(), bytes: readFileSync(path) };
}

test.describe('劇本排版台', () => {
  test('開頁：範例原稿、沒有錯誤、頁尾只有靈感來源', async ({ page }) => {
    const errors = await open(page);
    /* 第一次使用：不顯示作品清單，直接用範例原稿 */
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(stage(page).locator('.t-title')).toHaveText('未命名的劇本');
    await expect(stage(page).locator('.t-proc .blb')).toHaveText('技能檢定');
    await expect(page.getByTestId('se-count')).toContainText('1 頁');
    await expect(page.locator('footer')).toContainText('靈感來源');
    expect(errors).toEqual([]);
  });

  test('書寫：打字、Enter 分段、Backspace 接合、斜線指令、書式快捷鍵、復原', async ({ page }) => {
    const errors = await open(page);
    const desc = rowText(page, '描述文').first();
    await desc.click();
    await desc.press('End');
    await page.keyboard.press('Control+End');
    await page.keyboard.type('追加');
    await expect(stage(page).locator('.t-desc').first()).toContainText('追加');
    /* Enter：後半成為新的描述文 */
    await page.keyboard.press('Enter');
    await page.keyboard.type('新的段落');
    await expect(rowText(page, '描述文')).toHaveCount(2);
    await expect(rowText(page, '描述文').nth(1)).toHaveValue('新的段落');
    /* 斜線指令 */
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('/head ');
    await expect(rowText(page, '描述文').nth(1)).toHaveValue('新的段落\n■');
    /* Ctrl＋Shift＋1：改成標題 1（Shift 改變字元也照實體按鍵判斷）；停頓 0.7 秒以上才分成另一步復原 */
    await page.waitForTimeout(800);
    await page.keyboard.press('Control+Shift+Digit1');
    await expect(rowText(page, '標題 1')).toHaveCount(2);
    await expect(status(page)).toContainText('標題 1');
    /* 復原 */
    await page.waitForTimeout(800);
    await page.keyboard.press('Control+z');
    await expect(rowText(page, '標題 1')).toHaveCount(1);
    /* Backspace 接合：游標在開頭 */
    const second = rowText(page, '描述文').nth(1);
    await second.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Backspace');
    await expect(rowText(page, '描述文')).toHaveCount(1);
    await expect(rowText(page, '描述文').first()).toHaveValue(/追加新的段落/);
    /* 空的段落：Backspace 刪除它，回到前一段 */
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await expect(rowText(page, '描述文')).toHaveCount(2);
    await page.keyboard.press('Backspace');
    await expect(rowText(page, '描述文')).toHaveCount(1);
    await expect(status(page)).toContainText('已刪除 1 個段落');
    expect(errors).toEqual([]);
  });

  test('貼上多段：依第一行猜書式（F036）', async ({ page }) => {
    await open(page);
    const desc = rowText(page, '描述文').first();
    await desc.click();
    await desc.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '## 第二章\n\n「你好」\n\n【技能檢定】〈聆聽〉成功的話聽見腳步聲。');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect(rowText(page, '標題 2')).toHaveValue('第二章');
    await expect(rowText(page, '對話文').first()).toHaveValue('「你好」');
    await expect(rowText(page, '規則框').first()).toHaveValue('〈聆聽〉成功的話聽見腳步聲。');
    await expect(status(page)).toContainText('已貼上 3 個段落');
  });

  test('紙面：開啟檔案、自動分頁、目錄、頁尾、選取', async ({ page }) => {
    const errors = await open(page);
    await openSample(page);
    /* 目錄（第 2 頁）：標題都在第 3 頁 */
    const toc = stage(page).locator('.toc-line');
    await expect(toc).toHaveCount(3);
    await expect(toc.first().locator('.pn')).toHaveText('3');
    /* 頁尾的固定文字 {title} */
    await expect(stage(page).locator('.pg-foot').first()).toContainText('霧中的洋館');
    /* 紙面上按段落：選取並在文字欄標出 */
    await stage(page).locator('.bp-h2').click();
    await expect(stage(page).locator('.bp-h2')).toHaveClass(/is-sel/);
    await expect(page.getByTestId('se-block-panel')).toContainText('目前：標題 2');
    /* 字數 */
    await expect(page.getByTestId('se-count')).toContainText('5 頁');
    expect(errors).toEqual([]);
  });

  test('存成檔案：專案檔格式', async ({ page }) => {
    await open(page);
    const { name, bytes } = await download(page, () =>
      page.getByRole('button', { name: '儲存', exact: true }).click(),
    );
    expect(name).toBe('未命名的劇本.json');
    const json = JSON.parse(bytes.toString('utf8'));
    expect(json.format).toBe('trpg-toolkit-project');
    expect(json.tool).toBe('scenario-editor');
    expect(json.data.title).toBe('未命名的劇本');
    expect(json.data.blocks.map((b: { type: string }) => b.type)).toEqual([
      'title',
      'subtitle',
      'h1',
      'desc',
      'dialog',
      'proc',
    ]);
    expect(json.data.pages[0].bg.preset).toBe('bg-paper');
  });

  test('匯出閱覽 HTML：目錄遮字、頁面、彈出視窗、複製用資料', async ({ page, context }) => {
    await open(page);
    await openSample(page);
    await page.getByRole('button', { name: '匯出', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: '匯出閱覽用 HTML' });
    await expect(dlg).toBeVisible();
    const { name, bytes } = await download(page, () =>
      dlg.getByRole('button', { name: '匯出', exact: true }).click(),
    );
    expect(name).toBe('霧中的洋館.html');
    const html = bytes.toString('utf8');
    expect(html).toContain('<html lang="zh-Hant-TW">');
    const view = await context.newPage();
    await routeExternal(view);
    await view.setContent(html);
    await expect(view.locator('.pagebox:not(.appx)')).toHaveCount(5);
    await expect(view.locator('#nav .nv')).toHaveCount(3);
    await expect(view.locator('#nav .nvt').first()).toHaveText('■■');
    await view.locator('#tocMask').click();
    await expect(view.locator('#nav .nvt').first()).toHaveText('導入');
    /* 彈出視窗 */
    await view.locator('[data-popopen]').first().click();
    await expect(view.locator('#popOv')).toHaveClass(/on/);
    await expect(view.locator('#popIn')).toContainText('二樓的走廊盡頭');
    await view.keyboard.press('Escape');
    await expect(view.locator('#popOv')).not.toHaveClass(/on/);
    /* 預先放好的資料：表格的 roll-table、NPC 卡的棋子 */
    const out = await view.locator('script.outdata[id^="out"]').first().textContent();
    expect(out).toBe('/roll-table\n大廳的事件\n1D3\n1:時鐘響起\n2:燈光熄滅\n3:樓上傳來腳步聲');
    const ccf = JSON.parse(
      (await view.locator('script.outdata[id^="ccf"]').first().textContent()) ?? '{}',
    );
    expect(ccf.kind).toBe('character');
    expect(ccf.data.name).toBe('管家');
    expect(ccf.data.status.find((s: { label: string }) => s.label === 'HP').value).toBe(12);
    /* 註解 */
    await view.locator('[data-cmt]').first().click();
    await expect(view.locator('#cmtRail')).toContainText('這裡的探索者指 PC。');
    await view.close();
  });

  test('下載 PDF：頁數、A4、附錄', async ({ page }) => {
    test.setTimeout(150_000);
    await open(page);
    await openSample(page);
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    const dlg = page.getByRole('dialog', { name: '列印 / PDF' });
    const { name, bytes } = await download(page, () =>
      dlg.getByRole('button', { name: '下載 PDF' }).click(),
    );
    expect(name).toBe('霧中的洋館.pdf');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    /* 5 頁＋附錄 1 頁 */
    expect(pdf.getPageCount()).toBe(6);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(pdf.getTitle()).toBe('霧中的洋館');
    await expect(status(page)).toContainText('霧中的洋館.pdf');
  });

  test('列印：獨立的列印文件（範圍與附錄）', async ({ page }) => {
    await open(page);
    await openSample(page);
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    const dlg = page.getByRole('dialog', { name: '列印 / PDF' });
    await dlg.getByRole('radio', { name: '指定頁' }).click();
    await dlg.getByRole('spinbutton', { name: '從第' }).fill('4');
    await dlg.getByRole('spinbutton', { name: '到第' }).fill('3');
    await dlg.getByRole('button', { name: '列印', exact: true }).click();
    const frame = page.locator('iframe[data-paged-print]');
    await expect(frame).toHaveCount(1);
    const pages = page.frameLocator('iframe[data-paged-print]').locator('.paged-print-page');
    /* 第 3～4 頁＋附錄 */
    await expect(pages).toHaveCount(3);
    await expect(pages.last()).toContainText('附錄');
    await expect(page.frameLocator('iframe[data-paged-print]').locator('body')).toHaveClass(
      /pv-print/,
    );
  });

  test('作品清單：新建、複製、刪除、垃圾桶、還原、兩個分頁', async ({ page, context }) => {
    await open(page);
    await page.getByRole('button', { name: '作品', exact: true }).click();
    const lib = page.getByRole('dialog', { name: '作品' });
    await expect(lib).toContainText('1 個作品');
    await lib.getByRole('button', { name: '新建' }).click();
    await expect(lib).toHaveCount(0);
    await page.getByRole('button', { name: '作品', exact: true }).click();
    await expect(lib).toContainText('2 個作品');
    await lib.getByRole('button', { name: '複製' }).click();
    await expect(lib).toContainText('3 個作品');
    await expect(lib.getByRole('option').filter({ hasText: '（副本）' })).toHaveCount(1);
    /* 刪除副本 → 垃圾桶 → 還原 */
    await lib.getByRole('option').filter({ hasText: '（副本）' }).click();
    await lib.getByRole('button', { name: '刪除' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(lib).toContainText('2 個作品');
    await lib.getByRole('button', { name: /垃圾桶/ }).click();
    await expect(page.getByRole('dialog', { name: '垃圾桶' })).toContainText('剩 30 天');
    await page.getByRole('button', { name: '還原' }).click();
    await page.getByRole('button', { name: '回到清單' }).click();
    await expect(lib).toContainText('3 個作品');
    await page.keyboard.press('Escape');
    /* 第二個分頁：目前的作品被鎖住 */
    const other = await context.newPage();
    await routeExternal(other);
    await other.goto(URL);
    const lib2 = other.getByRole('dialog', { name: '作品' });
    await expect(lib2).toBeVisible();
    await expect(lib2.getByText('正在別的分頁編輯')).toHaveCount(1);
    await other.close();
  });

  test('彈出視窗、表格輸出、流程圖、NPC 卡', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await openSample(page);
    /* 紙面上的彈出視窗按鈕 → 編輯視窗 */
    await stage(page).locator('.bp-popup [data-popopen]').click();
    const pop = page.getByTestId('se-popup-dialog');
    await expect(pop).toBeVisible();
    await expect(pop.getByRole('textbox', { name: '名稱' })).toHaveValue('地圖');
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    /* 表格：roll-table 輸出 */
    await source(page).locator('[data-label]').filter({ hasText: '表格' }).first().click();
    await expect(page.getByRole('textbox', { name: '輸出的文字' })).toHaveValue(
      /^\/roll-table\n大廳的事件\n1D3\n1:時鐘響起/,
    );
    /* 流程圖：舊式文字轉成的圖 → 加一個方框 */
    await stage(page).locator('.bp-flow').dblclick();
    const flow = page.getByTestId('se-flow-dialog');
    await expect(flow).toBeVisible();
    await expect(flow).toContainText('方框 5 個');
    await flow.getByRole('button', { name: '＋菱形' }).click();
    await expect(flow).toContainText('方框 6 個');
    /* Delete：刪除選取的方框（不會刪到紙面的段落） */
    await page.keyboard.press('Delete');
    await expect(flow).toContainText('方框 5 個');
    await expect(stage(page).locator('.bp-flow')).toHaveCount(1);
    await page.keyboard.press('Escape');
    /* NPC 卡：自動計算與 CCFOLIA */
    await stage(page).locator('.bp-npc').click();
    await page.getByRole('button', { name: '開啟角色卡' }).click();
    const npc = page.getByRole('dialog', { name: '角色卡' });
    await expect(npc.getByRole('textbox', { name: '耐久' })).toHaveAttribute('placeholder', '12');
    await npc.getByRole('button', { name: '複製 CCFOLIA 棋子' }).click();
    await expect(status(page)).toContainText('已複製 CCFOLIA 棋子');
    const clip = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    expect(clip.data.commands).toContain('CC<={SAN} 【正気度ロール】');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('段落操作：選取、上移、複製、合併、刪除、整段複製貼上、拖曳搬移', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    const label = (name: string) =>
      source(page).locator('[data-label]').filter({ hasText: name }).first();
    const types = () => source(page).locator('[data-label] span:first-child').allTextContents();
    expect(await types()).toEqual(['主標題', '副標題', '標題 1', '描述文', '對話文', '規則框']);
    /* 選取對話文 → 上移 */
    await label('對話文').click();
    await page.getByRole('button', { name: '上移' }).click();
    expect(await types()).toEqual(['主標題', '副標題', '標題 1', '對話文', '描述文', '規則框']);
    /* Shift＋按：範圍選取 → 合併 */
    await label('描述文').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('se-block-panel')).toContainText('已選取 2 段');
    await page.getByRole('button', { name: '合併選取的段落' }).click();
    expect(await types()).toEqual(['主標題', '副標題', '標題 1', '對話文', '規則框']);
    await expect(rowText(page, '對話文')).toHaveValue(
      /^「首先，請試著點一下這個段落」\n在這裡寫導入的描述/,
    );
    /* 複製段落 */
    await page.getByRole('button', { name: '複製段落（放在下方）' }).click();
    expect(await types()).toEqual(['主標題', '副標題', '標題 1', '對話文', '對話文', '規則框']);
    /* Delete 刪除（焦點在按鈕上） */
    await label('規則框').click();
    await page.keyboard.press('Delete');
    expect(await types()).toEqual(['主標題', '副標題', '標題 1', '對話文', '對話文']);
    await expect(status(page)).toContainText('已刪除 1 個段落');
    /* Ctrl＋C／Ctrl＋V：整段複製貼上（剪貼簿同時有純文字與段落資料） */
    await label('標題 1').click();
    await page.keyboard.press('Control+c');
    await expect(status(page)).toContainText('已複製 1 個段落的文字');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('導入');
    await label('副標題').click();
    await page.keyboard.press('Control+v');
    expect(await types()).toEqual(['主標題', '副標題', '標題 1', '標題 1', '對話文', '對話文']);
    /* 拖曳搬移：把主標題搬到最後 */
    const handle = source(page).locator('[data-handle]').first();
    const last = source(page).locator('[data-row]').last();
    const hb = await handle.boundingBox();
    const lb = await last.boundingBox();
    if (!hb || !lb) throw new Error('no box');
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 4, hb.y + 30, { steps: 4 });
    await page.mouse.move(lb.x + 40, lb.y + lb.height - 2, { steps: 8 });
    await page.mouse.up();
    expect(await types()).toEqual(['副標題', '標題 1', '標題 1', '對話文', '對話文', '主標題']);
    expect(errors).toEqual([]);
  });

  test('頁面一覽、頁面分頁、文件分頁與字型', async ({ page }) => {
    const errors = await open(page);
    await openSample(page);
    /* 頁面一覽（Ctrl＋Shift＋P） */
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Control+Shift+KeyP');
    const ov = page.getByTestId('se-overview');
    await expect(ov).toBeVisible();
    await expect(ov.getByRole('listitem')).toHaveCount(5);
    await expect(ov.getByRole('button', { name: /^第 3 頁：導入/ })).toBeVisible();
    await ov.getByRole('radio', { name: '標題' }).click();
    await expect(ov).toContainText('共 3 項');
    await ov.getByRole('button', { name: /洋館的大廳/ }).click();
    await expect(stage(page).locator('.bp-h2')).toHaveClass(/is-sel/);
    /* 頁面分頁：勾選全部 → 素色 */
    await page.getByRole('tab', { name: '頁面' }).click();
    await page.getByRole('button', { name: '選取全部頁面' }).click();
    await expect(stage(page).locator('[data-pgsel]:checked')).toHaveCount(5);
    await page.getByRole('button', { name: '套用到選取的頁面' }).click();
    await expect(status(page)).toContainText('已把背景套用到 5 頁');
    await expect(stage(page).locator('.pg.bg-paper')).toHaveCount(0);
    /* 文件分頁：間距與字型 */
    await page.getByRole('tab', { name: '文件' }).click();
    await page.getByRole('spinbutton', { name: '上下間距' }).fill('30');
    await expect(stage(page).locator('.pg-body').first()).toHaveAttribute(
      'style',
      /padding:30mm 16mm/,
    );
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '從檔案新增' }).click();
    await (await chooser).setFiles('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf');
    await expect(status(page)).toContainText('已新增字型「DejaVu Sans Mono」');
    await expect(page.getByRole('list', { name: '嵌入的字型' })).toContainText('DejaVu Sans Mono');
    expect(await page.locator('#se-paper-css').evaluate((e) => e.textContent)).toContain(
      '@font-face{font-family:"DejaVu Sans Mono"',
    );
    expect(errors).toEqual([]);
  });

  test('圖片：插入時縮小、自由配置', async ({ page }) => {
    const errors = await open(page);
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 2000;
      c.height = 1000;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#2b4a6f';
        ctx.fillRect(0, 0, 2000, 1000);
      }
      return c.toDataURL('image/png').split(',')[1];
    });
    const chooser = page.waitForEvent('filechooser');
    await page.locator('button[data-type="image"]').click();
    await (await chooser).setFiles({
      name: 'map.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    const img = stage(page).locator('.bp-image img');
    await expect(img).toHaveCount(1);
    const size = await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]);
    expect(size).toEqual([1600, 800]);
    await page.getByRole('radio', { name: '自由配置' }).click();
    await expect(stage(page).locator('.bp-image.free')).toHaveCount(1);
    await expect(status(page)).toContainText('已改成自由配置');
    expect(errors).toEqual([]);
  });

  test('接收舊版的存檔（F018）', async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      const doc = (title: string) =>
        JSON.stringify({ title, blocks: [{ type: 'desc', text: title }] });
      await new Promise<void>((resolve, reject) => {
        const q = indexedDB.open('trpg-typeset', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('kv');
        q.onerror = () => reject(q.error);
        q.onsuccess = () => {
          const t = q.result.transaction('kv', 'readwrite');
          const st = t.objectStore('kv');
          st.put(
            JSON.stringify([
              { id: 'a1', title: '舊作品一', upd: 1700000000000 },
              { id: 'a2', title: '舊作品二', upd: 1700000001000, del: Date.now() },
            ]),
            'trpg-prj-index',
          );
          st.put(doc('舊作品一'), 'trpg-prj:a1');
          st.put(doc('舊作品二'), 'trpg-prj:a2');
          t.oncomplete = () => {
            q.result.close();
            resolve();
          };
        };
      });
      localStorage.setItem('trpg-typeset-v2', doc('單一作品'));
    });
    await page.reload();
    const lib = page.getByRole('dialog', { name: '作品' });
    await expect(lib).toBeVisible();
    await expect(lib.getByRole('option').filter({ hasText: '舊作品一' })).toHaveCount(1);
    await expect(lib.getByRole('option').filter({ hasText: '單一作品' })).toHaveCount(1);
    await lib.getByRole('button', { name: /垃圾桶/ }).click();
    await expect(page.getByRole('dialog', { name: '垃圾桶' })).toContainText('舊作品二');
    /* 同一份只接收一次 */
    await page.reload();
    await expect(page.getByRole('dialog', { name: '作品' })).toContainText('3 個作品');
  });

  test('縮放與快捷鍵', async ({ page }) => {
    await open(page);
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    const zoomBtn = page.getByRole('button', { name: /^配合寬度/ });
    await expect(zoomBtn).toHaveText('100%');
    await page.keyboard.press('Control+Equal');
    await expect(zoomBtn).toHaveText('125%');
    await page.keyboard.press('Control+Shift+ArrowDown');
    await expect(zoomBtn).toHaveText('100%');
    await page.keyboard.press('Control+Digit0');
    await expect(zoomBtn).not.toHaveText('100%');
    /* 書式快捷鍵：Ctrl＋Alt＋鍵（沒有選取時新增在最後） */
    await page.keyboard.press('Control+Alt+KeyH');
    await expect(source(page).locator('[data-label]').last()).toContainText('橫線');
  });

  test('390 寬沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await noHorizontalScroll(page);
    await openSample(page);
    await noHorizontalScroll(page);
  });

  for (const width of [1280, 390]) {
    test(`視覺基準 ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await page.mouse.move(0, 0);
      await expect(status(page)).toContainText('已開啟');
      await page.evaluate(() => {
        const s = document.querySelector('[data-testid="se-status"]');
        if (s) s.textContent = '';
      });
      await expect(page).toHaveScreenshot(`scenario-editor-${width}.png`, {
        fullPage: width !== 390,
      });
    });
  }
});
