/**
 * 劇本排版台 2026-10 跟進（上游 v3.10～v3.26）第二批的端對端測試（規格 1.14 F277～F296）：
 * - 頁面圖片：改成自由配置、選取（紙面與文字欄的清單）、位置、角落、寬（px）、外框與陰影、刪除與復原、放回本文；
 * - 讀入原作 v3.26 的頁面圖片原稿、再存檔、PDF；
 * - markdown：打「# 」、第一行的 :::／---＋Enter、:: 的候選、貼上；
 * - 匯出：不分頁的一張（導覽、返回、附錄）、逐頁時目錄跳到那一頁的開頭；章目錄；
 * - 這頁設為雙欄只改勾選的頁；PDF 補字失敗時略過「↩」。
 */
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { getTool, outputDir } from '../../src/registry';
import { pdfPageTexts } from '../helpers/pdf';

const URL = `/${outputDir(getTool('scenario-editor') ?? { id: 'scenario-editor', status: 'next' })}/`;
/** 原作 v3.26.0 的程式產生的原稿（頁面圖片、圖片的 px／外框／陰影、章目錄） */
const UP_PIMG = new globalThis.URL(
  './fixtures/scenario-editor-upstream-v326-pimg.json',
  import.meta.url,
);
const TTC = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const CORS = { 'access-control-allow-origin': '*' };

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

async function routeExternal(target: Page | BrowserContext, subset = true) {
  await target.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await target.route(/fonts\.gstatic\.com\/s\/noto(serif|sans)tc\/.*\.ttf$/, (r) =>
    r.fulfill({ status: 200, contentType: 'font/ttf', headers: CORS, body: readFileSync(TTC) }),
  );
  if (!subset) return;
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
const source = (page: Page) => page.getByTestId('se-source');

async function open(page: Page, subset = true) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeExternal(page, subset);
  await page.goto(URL);
  await expect(status(page)).toContainText('已開啟');
  await expect(stage(page).locator('.pg').first()).toBeVisible();
  return errors;
}

async function loadFile(page: Page, buffer: Buffer, title: string) {
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('toolbar', { name: '工具列' })
    .getByRole('button', { name: '開啟', exact: true })
    .click();
  await (await chooser).setFiles({ name: 'doc.json', buffer, mimeType: 'application/json' });
  await expect(status(page)).toContainText(title);
}

type TestBlock = { id: string; type: string; cols: number; text: string } & Record<string, unknown>;
const blk = (id: string, type: string, text = '', extra: Record<string, unknown> = {}) =>
  ({ id, type, cols: 2, text, ...extra }) as TestBlock;
const loadDoc = (page: Page, title: string, blocks: TestBlock[], extra: object = {}) =>
  loadFile(
    page,
    Buffer.from(
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
    title,
  );

async function download(page: Page, click: () => Promise<void>) {
  const d = page.waitForEvent('download');
  await click();
  const dl = await d;
  return { name: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) };
}

async function savedDoc(page: Page) {
  const { bytes } = await download(page, async () => {
    await page.getByTestId('se-save-menu').click();
    await page.getByRole('menuitem', { name: /存成 JSON 檔/ }).click();
  });
  return JSON.parse(bytes.toString('utf8')).data as {
    blocks: TestBlock[];
    pageImgs: Record<string, unknown>[];
    pages: { cols: number }[];
  };
}

async function exportedHtml(page: Page, shape: '逐頁（A4）' | '不分頁的一張') {
  await page.getByRole('button', { name: '匯出', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: '匯出閱覽用 HTML' });
  await dlg.getByRole('radio', { name: shape }).click();
  const { bytes } = await download(page, () =>
    dlg.getByRole('button', { name: '匯出', exact: true }).click(),
  );
  return bytes.toString('utf8');
}

/** 紙面上一個元素相對於頁的位置（mm） */
async function posMm(page: Page, sel: string) {
  return stage(page)
    .locator(sel)
    .first()
    .evaluate((el) => {
      const pg = el.closest('.pg') as HTMLElement;
      const p = pg.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const k = p.width / 210;
      return [r.left - p.left, r.top - p.top, r.width].map((v) => Math.round((v / k) * 10) / 10);
    });
}

const PNG = (() => {
  /* 40×30 的藍色 PNG（長寬比 0.75） */
  const w = 40;
  const h = 30;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) raw.set([43, 74, 111], y * (w * 3 + 1) + 1 + x * 3);
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const v of b) {
      c ^= v;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t, 'latin1'), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
})();

test.describe('劇本排版台：2026-10 跟進第二批', () => {
  test('頁面圖片：自由配置、選取、位置、角落、寬（px）、外框與陰影、刪除與復原、放回本文（F277～F283）', async ({
    page,
  }) => {
    const errors = await open(page);
    const long = '這是一段很長的描述文，用來看文字怎麼避開放在頁上的圖片。'.repeat(8);
    await loadDoc(page, '頁面圖片', [
      blk('h', 'h1', '第一章', { cols: 1 }),
      blk('a', 'desc', long),
      blk('im', 'image', '', { img: PNG, ar: 0.75, w: 40, pos: 'inline', cols: 1, cap: '地圖' }),
      blk('b', 'desc', long),
    ]);
    await stage(page).locator('[data-id="im"]').click();
    await page.getByRole('radio', { name: '自由配置' }).click();
    await expect(status(page)).toContainText('已改成自由配置（頁面圖片）');
    const pimg = stage(page).locator('.pimg[data-pimg="im"]');
    await expect(pimg).toHaveCount(1);
    await expect(pimg).toHaveClass(/is-sel/);
    await expect(stage(page).locator('.bp-image')).toHaveCount(0);
    /* 文字避開它（單欄頁） */
    await expect(stage(page).locator('.imgshape')).toHaveCount(2);
    const panel = page.getByTestId('se-pimg-panel');
    await expect(panel).toContainText('自由配置的圖片');
    /* 文字欄的清單 */
    const row = source(page).locator('[data-pimgrow="im"]');
    await expect(row).toHaveText(/P\.1　地圖/);
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    /* 位置：距左 30、距上 100 */
    await panel.getByRole('spinbutton', { name: '距左' }).fill('30');
    await panel.getByRole('spinbutton', { name: '距上' }).fill('100');
    await panel.getByRole('spinbutton', { name: '距上' }).press('Enter');
    await expect.poll(() => posMm(page, '.pimg')).toEqual([30, 100, 71.2]);
    /* 角落：右下（版心的右下角；高＝寬 × 0.75 ＋ 說明 6） */
    await panel.getByRole('button', { name: '右下', exact: true }).click();
    await expect(status(page)).toContainText('已對齊版心的右下');
    await expect.poll(() => posMm(page, '.pimg')).toEqual([122.8, 219.6, 71.2]);
    /* 寬：換成 px（看起來的寬不變），再改 200 px */
    await panel.getByRole('radio', { name: 'px（像素）' }).click();
    await expect(panel.getByRole('spinbutton', { name: '寬（px）' })).toHaveValue('269');
    await panel.getByRole('spinbutton', { name: '寬（px）' }).fill('200');
    await panel.getByRole('spinbutton', { name: '寬（px）' }).press('Enter');
    await expect(panel).toContainText('實際寬度：約 52.9 mm');
    /* 外框：雙線、藏青；陰影：濃 */
    await panel.getByRole('radio', { name: '雙線' }).click();
    await panel
      .getByRole('group', { name: '外框的顏色' })
      .getByRole('button', { name: '藏青' })
      .click();
    await panel.getByRole('radio', { name: '濃' }).click();
    const frame = pimg.locator('.imgfr-b');
    await expect(frame).toHaveCSS('border-top-style', 'double');
    await expect(frame).toHaveCSS('border-top-color', 'rgb(28, 43, 60)');
    await expect(pimg.locator('img')).toHaveClass('sh-l');
    /* 與文字的距離：上下 5 */
    await panel.getByRole('spinbutton', { name: '上下' }).fill('5');
    await panel.getByRole('spinbutton', { name: '上下' }).press('Enter');
    /* 存檔：pageImgs */
    const saved = await savedDoc(page);
    expect(saved.pageImgs).toEqual([
      expect.objectContaining({
        id: 'im',
        pg: 1,
        w: 200,
        wu: 'px',
        fr: 'double',
        frc: 'kon',
        sh: 'l',
        gv: 5,
        cap: '地圖',
      }),
    ]);
    /* Esc 取消選取、按清單選取、Delete 刪除、Ctrl＋Z 復原 */
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Escape');
    await expect(pimg).not.toHaveClass(/is-sel/);
    await row.click();
    await expect(pimg).toHaveClass(/is-sel/);
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    /* 0.7 秒內的連續修改合成一步（F019）：隔開，復原只取消刪除 */
    await page.waitForTimeout(800);
    await page.keyboard.press('Delete');
    await expect(status(page)).toContainText('已刪除圖片');
    await expect(stage(page).locator('.pimg')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(stage(page).locator('.pimg')).toHaveCount(1);
    /* 放回本文：那一頁的第一個段落之前 */
    await stage(page).locator('.pimg').click();
    await page.getByTestId('se-pimg-panel').getByRole('radio', { name: '靠左繞排' }).click();
    await expect(status(page)).toContainText('已放回本文');
    await expect(stage(page).locator('.pimg')).toHaveCount(0);
    await expect(stage(page).locator('.pg-body > .bp').first()).toHaveClass(/bp-image.*fl-l/);
    expect(errors).toEqual([]);
  });

  test('讀入原作 v3.26 的頁面圖片原稿：位置、外框、章目錄；再存不會遺失；PDF（F280、F284、F287）', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors = await open(page);
    await loadFile(page, readFileSync(UP_PIMG.pathname), '第二批的驗證稿');
    await expect(stage(page).locator('.pimg')).toHaveCount(3);
    await expect.poll(() => posMm(page, '.pimg[data-pimg="p1"]')).toEqual([120, 40, 71.2]);
    await expect.poll(() => posMm(page, '.pimg[data-pimg="old"]')).toEqual([20, 30, 83.7]);
    await expect(stage(page).locator('.pimg[data-pimg="p1"] .imgfr-b')).toHaveAttribute(
      'style',
      'border:1mm solid #2f5d73',
    );
    await expect(stage(page).locator('.pimg[data-pimg="p1"] img')).toHaveClass('sh-l');
    await expect(stage(page).locator('[data-id="im1"] img')).toHaveClass('sh-m');
    /* 章目錄：只收第一章的標題 2 */
    await expect(stage(page).locator('[data-id="toc1"] .toc-line')).toHaveText([/一之一/]);
    await stage(page).locator('[data-id="toc1"]').click();
    await expect(page.getByRole('radio', { name: '這一章' })).toBeChecked();
    await page.getByRole('radio', { name: '整份' }).click();
    await expect(stage(page).locator('[data-id="toc1"] .toc-line')).toHaveCount(4);
    await page.keyboard.press('Control+z');
    await expect(stage(page).locator('[data-id="toc1"] .toc-line')).toHaveCount(1);
    const saved = await savedDoc(page);
    const up = JSON.parse(readFileSync(UP_PIMG.pathname, 'utf8'));
    expect(saved.pageImgs).toEqual(up.pageImgs);
    expect(saved.blocks.find((b) => b.id === 'im1')).toMatchObject({
      w: 250,
      wu: 'px',
      fr: 'double',
      frc: 'kon',
      sh: 'm',
    });
    /* PDF：產生得出來（外框是向量的線、陰影是點陣） */
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    const dlg = page.getByRole('dialog', { name: '列印 / PDF' });
    const { bytes } = await download(page, () =>
      dlg.getByRole('button', { name: '下載 PDF' }).click(),
    );
    const pdf = await PDFDocument.load(bytes);
    const xobjs = pdf.getPages().map((p) => {
      const res = p.node.Resources();
      const xo = res?.lookup(PDFName.of('XObject'), PDFDict);
      return xo ? xo.keys().length : 0;
    });
    /* 只有 1 頁（p2 的第 2 頁超過總頁數，放在最後一頁）：背景＋圖片段落（陰影＋圖）＋p1（陰影＋圖）＋p2＋old＝7 */
    expect(xobjs).toEqual([7]);
    expect(errors).toEqual([]);
  });

  test('markdown：打「# 」、:::／---＋Enter、:: 的候選、貼上（F289～F293）', async ({ page }) => {
    const errors = await open(page);
    await loadDoc(page, 'md', [blk('a', 'desc', '')]);
    const ta = source(page).locator('textarea[data-bid="a"]');
    await ta.click();
    await page.keyboard.type('## 小節');
    await expect(source(page).locator('[data-row="a"]')).toContainText('標題 2');
    await expect(ta).toHaveValue('小節');
    await expect(status(page)).toContainText('已改成標題 2');
    /* Enter：新的描述文，第一行 :::skill ＋ Enter → 特殊區塊、游標在裡面 */
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(':::skill');
    const sug = page.getByTestId('se-md-suggest');
    await expect(sug.getByRole('option')).toHaveText([/技能檢定/]);
    await page.keyboard.press('Escape');
    await expect(sug).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(status(page)).toContainText('已改成特殊區塊');
    await page.keyboard.type('〈偵查〉成功時');
    let d = await savedDoc(page);
    expect(d.blocks.map((b) => [b.type, b.text])).toEqual([
      ['h2', '小節'],
      ['proc', '〈偵查〉成功時'],
    ]);
    /* 新的描述文：--- ＋ Enter → 橫線＋描述文（存檔時焦點離開了文字欄，先點回去） */
    await source(page).locator('textarea').nth(1).click();
    await page.keyboard.press('Control+End');
    /* 特殊區塊的文字最後的 Enter 是裡面的段落、空的再按 Enter 拿到外面（F300，第三批） */
    await page.keyboard.press('Enter');
    await expect(source(page).locator('[data-kids] textarea')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(source(page).locator('[data-kids]')).toHaveCount(0);
    await page.keyboard.type('---');
    await page.keyboard.press('Enter');
    await expect(status(page)).toContainText('已改成橫線');
    /* :: 的候選：::pa → 換頁，Enter */
    await page.keyboard.type('::pa');
    await expect(sug.getByRole('option')).toHaveText([/換頁/]);
    await expect(sug.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(status(page)).toContainText('已改成換頁');
    /* ：：換（全形） → 換頁、換欄、場景轉換（中文的名稱），↓ 選換欄 */
    await page.keyboard.type('：：換');
    await expect(sug.getByRole('option')).toHaveCount(3);
    await page.keyboard.press('Escape');
    d = await savedDoc(page);
    expect(d.blocks.map((b) => b.type)).toEqual(['h2', 'proc', 'hr', 'break', 'desc']);
    await source(page).locator('textarea').last().click();
    /* 貼上 markdown：變成段落；沒有寫法的一行照一般的文字 */
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.evaluate(() => {
      const el = document.activeElement as HTMLTextAreaElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', '# 第二章\n\n:::info[線索]\n抽屜裡有信。\n:::\n\n「誰？」');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect(status(page)).toContainText('已貼上 3 個段落');
    d = await savedDoc(page);
    expect(d.blocks.map((b) => [b.type, b.text])).toEqual([
      ['h2', '小節'],
      ['proc', '〈偵查〉成功時'],
      ['hr', ''],
      ['break', ''],
      ['h1', '第二章'],
      ['info', '抽屜裡有信。'],
      ['dialog', '「誰？」'],
    ]);
    expect(errors).toEqual([]);
  });

  test('匯出：不分頁的一張（導覽、返回、附錄、浮動視窗）與逐頁的目錄跳到頁首（F285、F286、F288）', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    const long = '這一段很長。'.repeat(120);
    await loadDoc(page, '流', [
      blk('toc', 'toc', '', { cols: 1 }),
      blk('br0', 'break', '', { cols: 1 }),
      blk('h1a', 'h1', '第一章', { cols: 1 }),
      blk('d1', 'desc', long),
      blk('pp', 'popup', '', {
        pop: { label: '抽屜', body: '', only: false, blocks: [blk('pc', 'desc', '日記')] },
      }),
      blk('br1', 'break', '', { cols: 1 }),
      blk('h1b', 'h1', '第二章', { cols: 1 }),
      blk('d2', 'desc', long),
      blk('s', 'scene', '前往第一章'),
    ]);
    await expect(stage(page).locator('.pg')).toHaveCount(3);
    const html = await exportedHtml(page, '不分頁的一張');
    const view = await context.newPage();
    const verr: string[] = [];
    view.on('pageerror', (e) => verr.push(e.message));
    await routeExternal(view);
    await view.setContent(html);
    await expect(view.locator('body')).toHaveClass('tocmask fx');
    await expect(view.locator('.fx-paper .pg')).toHaveCount(0);
    await expect(view.locator('#nav .nv')).toHaveCount(4);
    await expect(view.locator('#bh1a .fx-up')).toHaveText('↑ 回到目錄');
    await expect(view.locator('#apxpp .fx-back')).toHaveText('↩ 回到本文');
    /* 目錄跳過去、返回 */
    await view.locator('#btoc a.toc-line').nth(1).click();
    await expect(view.locator('#bh1b')).toBeInViewport();
    const back = view.locator('#fxBack');
    await expect(back).toBeVisible();
    await expect(back).toContainText('↩ 返回');
    await back.click();
    await expect(back).toBeHidden();
    await expect(view.locator('#btoc')).toBeInViewport();
    /* 彈出視窗照樣是浮動視窗 */
    await view.locator('[data-popopen="pp"]').click();
    await expect(view.locator('.fwin')).toContainText('日記');
    await view.close();
    /* 逐頁：按目錄跳到那一頁的開頭 */
    const paged = await exportedHtml(page, '逐頁（A4）');
    const v2 = await context.newPage();
    await routeExternal(v2);
    await v2.setContent(paged);
    await v2.locator('#nav .nv', { hasText: /./ }).nth(1).click();
    const off = await v2.evaluate(() => {
      const pg = document.getElementById('bh1b')?.closest('.pg') as HTMLElement;
      return Math.round(pg.getBoundingClientRect().top);
    });
    expect(off).toBe(20);
    await expect(v2.locator('[data-id="h1b"]')).toHaveClass(/pg-hit/);
    await v2.close();
    expect(verr).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('章目錄：選取標題 1 建立這一章的目錄（F287）；這頁設為雙欄只改勾選的頁（F295）', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadDoc(page, '章', [
      blk('h1a', 'h1', '第一章', { cols: 1 }),
      blk('a1', 'h2', '一之一'),
      blk('br', 'break', '', { cols: 1 }),
      blk('h1b', 'h1', '第二章', { cols: 1 }),
      blk('b1', 'h2', '二之一'),
      blk('br2', 'break', '', { cols: 1 }),
      blk('c', 'desc', '第三頁'),
    ]);
    await expect(stage(page).locator('.pg')).toHaveCount(3);
    await stage(page).locator('[data-id="h1a"]').click();
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Control+Shift+KeyP');
    const ov = page.getByTestId('se-overview');
    await ov.getByRole('radio', { name: '標題' }).click();
    await ov.getByRole('button', { name: '在這個位置建立目錄區塊' }).click();
    await expect(status(page)).toContainText('這一章的目錄');
    const toc = stage(page).locator('.bp-toc');
    await expect(toc).toContainText('本章目錄');
    await expect(toc.locator('.toc-line')).toHaveText([/一之一/]);
    await expect(page.getByRole('radio', { name: '這一章' })).toBeChecked();
    /* 這頁設為雙欄：只改 P.2（P.3 沒有自己的設定也不跟著變） */
    await stage(page).locator('[data-id="b1"]').click();
    await page.getByRole('button', { name: '這頁設為雙欄' }).click();
    await expect(stage(page).locator('.pghead-c')).toHaveText(['單欄', '雙欄', '單欄']);
    const d = await savedDoc(page);
    expect(d.pages.map((p) => p.cols)).toEqual([1, 2, 1]);
    expect(errors).toEqual([]);
  });

  test('PDF：補字的字型下載失敗時，只缺「↩」照常產生（F296、D34）', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = await open(page, false);
    await page.route(/fonts\.googleapis\.com\/css2\?.*&text=/, (r) => r.abort());
    await loadDoc(page, '退路', [
      blk('d', 'desc', '本文'),
      blk('pp', 'popup', '', {
        pop: { label: '抽屜', body: '', only: false, blocks: [blk('pc', 'desc', '日記')] },
      }),
    ]);
    /* 排版完成（分頁的結果是這份原稿的） */
    await expect(stage(page).locator('[data-id="d"]')).toHaveCount(1);
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    const dlg = page.getByRole('dialog', { name: '列印 / PDF' });
    const { bytes } = await download(page, () =>
      dlg.getByRole('button', { name: '下載 PDF' }).click(),
    );
    const pdf = await PDFDocument.load(bytes);
    const texts = pdfPageTexts(pdf);
    expect(texts).toHaveLength(2);
    expect(texts[1].text).toContain('回到P.1');
    expect(texts[1].text).not.toContain('↩');
    expect(errors.filter((e) => !/net::ERR_FAILED|Failed to load resource/.test(e))).toEqual([]);
  });
});
