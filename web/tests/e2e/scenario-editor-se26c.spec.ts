/**
 * 劇本排版台 2026-10 跟進（上游 v3.10～v3.26）第三批的端對端測試（規格 1.14 F297～F315）：
 * - 段落裡的段落：Tab／Shift＋Tab、Enter 的規則（特殊區塊、外面、「■」的換行）、紙面的結構；
 * - 特殊區塊：標題語欄、範本、外觀、按一下複製（匯出）；讀入原作 v3.26 的原稿、PDF；
 * - ↑↓ 跨段、只選了段落時的 ↑↓／Enter／Tab、書式按鈕在下面新增、標題 1 下的章目錄；
 * - Esc 一次取消、設定欄的「×」、新增段落後紙面捲過去、間距欄的預設值；
 * - 手冊的變數、變數清單直接改；作品清單「讀入 JSON」。
 */
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getTool, outputDir } from '../../src/registry';
import { pdfPageTexts } from '../helpers/pdf';

const URL = `/${outputDir(getTool('scenario-editor') ?? { id: 'scenario-editor', status: 'next' })}/`;
/** 原作 v3.26.0 的程式產生的原稿（段落裡的段落、對話／注釋／情報的範本、按一下複製、pt、繞排圖片旁的框） */
const UP_KIDS = new globalThis.URL(
  './fixtures/scenario-editor-upstream-v326-kids.json',
  import.meta.url,
);
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
const ta = (page: Page, id: string) => source(page).locator(`textarea[data-bid="${id}"]`);
const lbl = (page: Page, id: string) => source(page).locator(`input[data-lbl="${id}"]`);
const panel = (page: Page) => page.getByTestId('se-block-panel');

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
const SKILL = { ln: 'dash', bar: false, fill: true, sm: true, col: 'aka' };
const docJson = (title: string, blocks: TestBlock[], extra: object = {}) =>
  JSON.stringify({
    title,
    pkv: 1,
    padV: 18,
    padH: 16,
    base: 10,
    foot: { num: true, text: '', from: 1 },
    pages: [{ id: 'p1', bg: { preset: 'none', img: null, fit: 'cover', opa: 35 }, cols: 1 }],
    blocks,
    ...extra,
  });
const loadDoc = (page: Page, title: string, blocks: TestBlock[], extra: object = {}) =>
  loadFile(page, Buffer.from(docJson(title, blocks, extra)), title);

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
  return JSON.parse(bytes.toString('utf8')).data as { blocks: TestBlock[]; pkv: number };
}

/** 原稿的結構：id 與裡面的段落 */
type Tree = (string | [string, Tree])[];
const tree = (bs: TestBlock[]): Tree =>
  bs.map((b) => {
    const k = b.kids as TestBlock[] | undefined;
    return k?.length ? [b.id, tree(k)] : b.id;
  });

test.describe('劇本排版台：2026-10 跟進第三批', () => {
  test('段落裡的段落：Tab／Shift＋Tab、Enter 的規則、紙面的結構（F297～F301）', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadDoc(page, '巢狀', [
      blk('a', 'desc', '房間裡很暗。'),
      blk('b', 'desc', '桌上有信。'),
      blk('h', 'h1', '第二章'),
      blk('c', 'desc', '走廊。'),
      blk('p', 'proc', '調查桌子。', { bx: SKILL, lb: '偵查' }),
    ]);
    /* Tab：放進上一段的最後（游標留在原處） */
    await ta(page, 'b').click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Tab');
    await expect(status(page)).toContainText('已放進上一個段落裡');
    await expect(source(page).locator('[data-kids="a"] [data-row="b"]')).toBeVisible();
    await expect(ta(page, 'b')).toBeFocused();
    await page.keyboard.type('X');
    await expect(ta(page, 'b')).toHaveValue('桌上有信X。');
    await expect(
      stage(page).locator('.bp[data-id="a"] > .b > .bx-kids.kids-ind > .bp[data-id="b"]'),
    ).toBeVisible();
    /* 上一段是標題：縮排 */
    await ta(page, 'c').click();
    await page.keyboard.press('Tab');
    await expect(status(page)).toContainText('縮排：第 1 層');
    await page.keyboard.press('Shift+Tab');
    /* Shift＋Tab：拿到外面（外面那段的下面） */
    await ta(page, 'b').click();
    await page.keyboard.press('Shift+Tab');
    await expect(status(page)).toContainText('已拿到外面');
    await expect(source(page).locator('[data-kids="a"]')).toHaveCount(0);
    expect(tree((await savedDoc(page)).blocks)).toEqual(['a', 'b', 'h', 'c', 'p']);
    /* 特殊區塊的文字的最後按 Enter：裡面最前面的描述文 */
    await ta(page, 'p').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const kid = source(page).locator('[data-kids="p"] textarea').first();
    await expect(kid).toBeFocused();
    await page.keyboard.type('■成功');
    /* 「■」那一行的最後：同一段裡換行 */
    await page.keyboard.press('Enter');
    await page.keyboard.type('找到信封。');
    await expect(kid).toHaveValue('■成功\n找到信封。');
    /* 文字的最後：切開成下一段（還在裡面）；空的最後一段按 Enter 拿到外面 */
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(status(page)).not.toContainText('縮排');
    const d = await savedDoc(page);
    const t = tree(d.blocks);
    expect(t.slice(0, 4)).toEqual(['a', 'b', 'h', 'c']);
    expect(t[4]).toEqual(['p', [expect.any(String)]]);
    expect(t).toHaveLength(6);
    /* 紙面：特殊區塊的框裡、「■」的一塊 */
    const sec = stage(page).locator('.bp[data-id="p"] .bx-kids > .bp.sec');
    await expect(sec).toBeVisible();
    await expect(sec.locator('.rh')).toHaveText('成功');
    expect(await sec.locator('> .b').evaluate((e) => getComputedStyle(e).borderLeftWidth)).toBe(
      '2px',
    );
    expect(errors).toEqual([]);
  });

  test('特殊區塊：標題語欄、範本、外觀、按一下複製（F303～F306、F311）', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await loadDoc(page, '特殊', [
      blk('p', 'proc', '第一行\n第二行', { bx: SKILL }),
      blk('d', 'dialog', '「你好」', { sp: '管家' }),
    ]);
    /* 文字上方的標題語欄：預設「技能檢定」、改了紙面與設定欄跟著改 */
    await expect(lbl(page, 'p')).toHaveValue('技能檢定');
    await expect(lbl(page, 'd')).toHaveValue('管家');
    await lbl(page, 'p').fill('聆聽');
    await expect(stage(page).locator('.bp[data-id="p"] .blb')).toHaveText('聆聽');
    await expect(panel(page).getByLabel('標題語', { exact: true })).toHaveValue('聆聽');
    /* Enter：到文字的開頭；文字的第一行按 ↑：回到標題語欄 */
    await page.keyboard.press('Enter');
    await expect(ta(page, 'p')).toBeFocused();
    expect(await ta(page, 'p').evaluate((e) => (e as HTMLTextAreaElement).selectionStart)).toBe(0);
    await page.keyboard.press('ArrowUp');
    await expect(lbl(page, 'p')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(ta(page, 'p')).toBeFocused();
    /* 範本：對話 → 文字欄的書式名稱是「對話文」；外觀可以細調 */
    await panel(page).getByRole('button', { name: '對話', exact: true }).click();
    await expect(source(page).locator('[data-row="p"] [data-label]')).toContainText('對話文');
    await expect(stage(page).locator('.bp[data-id="p"]')).toHaveClass(/sp-dialog/);
    await panel(page).getByRole('button', { name: '情報', exact: true }).click();
    await expect(source(page).locator('[data-row="p"] [data-label]')).toContainText('情報區塊');
    await expect(panel(page).getByRole('switch', { name: '按一下複製' })).toBeChecked();
    await panel(page).getByRole('radio', { name: '粗' }).click();
    await expect(source(page).locator('[data-row="p"] [data-label]')).toContainText('特殊區塊');
    await panel(page).getByRole('radio', { name: '更小' }).click();
    await panel(page).getByRole('checkbox', { name: '文字也用框的顏色' }).click();
    await expect(stage(page).locator('.bp[data-id="p"] > .b')).toHaveAttribute(
      'class',
      'b t-proc bx-l-none bx-bar bx-fill bx-copy bx-xs bx-ink',
    );
    /* 間距欄的預設值（淡淡顯示） */
    await expect(panel(page).getByLabel('上方間距')).toHaveAttribute('placeholder', '預設 3');
    /* 匯出：按框複製內文 */
    await page.getByRole('button', { name: '匯出', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: '匯出閱覽用 HTML' });
    await dlg.getByRole('radio', { name: '逐頁（A4）' }).click();
    const { bytes } = await download(page, () =>
      dlg.getByRole('button', { name: '匯出', exact: true }).click(),
    );
    const html = bytes.toString('utf8');
    const view = await context.newPage();
    await routeExternal(view);
    await view.setContent(html);
    /* about:blank 沒有剪貼簿：換成記下複製的文字 */
    await view.evaluate(() => {
      const w = window as unknown as { __cp: string[] };
      w.__cp = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (s: string) => {
            w.__cp.push(s);
            return Promise.resolve();
          },
        },
      });
    });
    await view.locator('.t-proc.bx-copy').click({ position: { x: 5, y: 5 } });
    await expect(view.locator('#cpToast')).toHaveClass(/on/);
    expect(await view.evaluate(() => (window as unknown as { __cp: string[] }).__cp)).toEqual([
      '第一行\n第二行',
    ]);
    await view.close();
    expect(errors).toEqual([]);
  });

  test('↑↓ 跨段、只選了段落時的 ↑↓／Enter／Tab、書式按鈕在下面新增、章目錄（F304、F309、F312、F315）', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadDoc(page, '移動', [
      blk('h', 'h1', '第一章'),
      blk('a', 'desc', '第一段的文字。'),
      blk('t', 'image', '', { pos: 'inline', cols: 1 }),
      blk('b', 'desc', '第二段\n第二行'),
    ]);
    /* ↓：最後一行時移到下一個欄位（表格是選取） */
    await ta(page, 'a').click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-row="t"]')).toHaveClass(/border-accent/);
    await expect(ta(page, 'a')).not.toBeFocused();
    /* 只選了段落：↓ 到下一段（游標在開頭）、↑ 回到表格、Enter 在下面加描述文 */
    await page.keyboard.press('ArrowDown');
    await expect(ta(page, 'b')).toBeFocused();
    expect(await ta(page, 'b').evaluate((e) => (e as HTMLTextAreaElement).selectionStart)).toBe(0);
    await page.keyboard.press('ArrowDown');
    await expect(ta(page, 'b')).toBeFocused();
    expect(await ta(page, 'b').evaluate((e) => (e as HTMLTextAreaElement).selectionStart)).toBe(4);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-row="t"]')).toHaveClass(/border-accent/);
    await page.keyboard.press('ArrowUp');
    await expect(ta(page, 'a')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const rows = () =>
      source(page)
        .locator(':scope > div > [data-row]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-row')));
    await expect.poll(async () => (await rows()).length).toBe(5);
    expect((await rows()).slice(0, 3)).toEqual(['h', 'a', 't']);
    await expect(source(page).locator('textarea').nth(2)).toBeFocused();
    /* 書式按鈕：有文字的段落按橫線 → 在下面新增 */
    await ta(page, 'a').click();
    await page.locator('button[data-type="hr"]').click();
    await expect(status(page)).toContainText('已在下面新增「橫線」');
    expect((await rows()).slice(0, 3)).toEqual(['h', 'a', expect.any(String)]);
    await expect(ta(page, 'a')).toHaveValue('第一段的文字。');
    /* 選取圖片時按描述文 → 下面新增、游標在裡面 */
    await page.locator('[data-row="t"] [data-label]').click();
    await page.locator('button[data-type="desc"]').click();
    await expect(page.locator('[data-row="t"]')).toBeVisible();
    await expect.poll(async () => (await rows()).indexOf('t')).toBeGreaterThan(0);
    {
      const r = await rows();
      const nid = String(r[r.indexOf('t') + 1]);
      await expect(ta(page, nid)).toBeFocused();
      await expect(ta(page, nid)).toHaveValue('');
    }
    /* 標題 1 下面按目錄 → 這一章的目錄 */
    await page.locator('[data-row="h"] [data-label]').click();
    await page.locator('button[data-type="toc"]').click();
    await expect(status(page)).toContainText('已在標題 1 之後建立這一章的目錄');
    expect((await rows())[1]).not.toBe('a');
    const d = await savedDoc(page);
    expect(d.blocks[1]).toMatchObject({ type: 'toc', toc: { scope: 'chapter', lb: '本章目錄' } });
    expect(d.blocks.filter((b) => b.type === 'break')).toHaveLength(0);
    /* 只選了段落時 Tab：放進上一段 */
    await page.locator('[data-row="b"] [data-label]').click();
    await page.keyboard.press('Tab');
    await expect(status(page)).toContainText('已放進上一個段落裡');
    expect(errors).toEqual([]);
  });

  test('Esc 一次取消、設定欄的「×」、新增段落後紙面捲過去（F310、F313、F314）', async ({
    page,
  }) => {
    const errors = await open(page);
    const many = Array.from({ length: 40 }, (_, i) =>
      blk(`d${i}`, 'desc', `第 ${i + 1} 段。${'很長的文字。'.repeat(20)}`),
    );
    await loadDoc(page, '捲動', many);
    /* Esc：打字中按一次就全部取消（設定欄也關掉） */
    await ta(page, 'd1').click();
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Shift+End');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(ta(page, 'd1')).not.toBeFocused();
    await expect(status(page)).toContainText('已取消選取');
    /* ×：取消選取、不回到文字欄 */
    await ta(page, 'd2').click();
    await page.getByTestId('se-panel-close').click();
    await expect(panel(page)).toHaveCount(0);
    await expect(ta(page, 'd2')).not.toBeFocused();
    /* 紙面在開頭時，在最後一段按 Enter：紙面捲到新的段落 */
    const sc = stage(page).locator('xpath=ancestor::section[1]');
    await sc.evaluate((e) => {
      e.scrollTop = 0;
    });
    await ta(page, 'd39').click();
    await page.keyboard.press('Control+End');
    await sc.evaluate((e) => {
      e.scrollTop = 0;
    });
    await page.keyboard.press('Enter');
    await expect.poll(() => sc.evaluate((e) => e.scrollTop)).toBeGreaterThan(1000);
    expect(errors).toEqual([]);
  });

  test('手冊的變數、變數清單直接改（F307）；作品清單「讀入 JSON」（F308）', async ({ page }) => {
    const errors = await open(page);
    await loadDoc(page, '變數', [
      blk('ho', 'handout', '你是記者。', { ho: { no: 'HO1', ttl: '記者' } }),
      blk('a', 'desc', '{HO1} 遇到了 {HO2}。'),
    ]);
    await page.locator('[data-row="ho"] [data-label]').click();
    await panel(page).getByTestId('se-ho-def').fill('小姐');
    await expect(panel(page).getByTestId('se-ho-note')).toHaveAttribute(
      'placeholder',
      '手冊「記者」的 PC',
    );
    await panel(page).getByTestId('se-ho-note').fill('扮演記者的 PC');
    await expect(stage(page).locator('.tvar[data-v="HO1"]').first()).toHaveText('小姐');
    await page.getByRole('tab', { name: '文件' }).click();
    const vars = page.getByTestId('se-vars');
    const hoRow = vars.locator('[data-var-kind="ho"]');
    await expect(hoRow.getByLabel('{HO1}的預設值')).toHaveValue('小姐');
    await expect(hoRow.getByLabel('{HO1}的說明')).toHaveValue('扮演記者的 PC');
    await hoRow.getByLabel('{HO1}的預設值').fill('女記者');
    await expect(stage(page).locator('.tvar[data-v="HO1"]').first()).toHaveText('女記者');
    /* 手冊的編號：離開欄位時檢查 */
    await hoRow.getByLabel('{HO1}的編號').fill('HO2');
    await hoRow.getByLabel('{HO1}的編號').press('Tab');
    await expect(stage(page).locator('.t-handout .ho-n')).toHaveText('HO2');
    /* 自動的列（本文寫到的 {HO1}）：填了就登錄 */
    const auto = vars.locator('[data-var-kind="auto"]');
    await expect(auto).toHaveCount(1);
    await auto.getByLabel('{HO1}的預設值').pressSequentially('甲');
    await expect(vars.locator('[data-var-kind="reg"]').getByLabel('變數 1 的預設值')).toHaveValue(
      '甲',
    );
    await expect(vars.locator('[data-var-kind="reg"]').getByLabel('變數 1 的預設值')).toBeFocused();
    await page.keyboard.type('乙');
    await expect(stage(page).locator('.tvar[data-v="HO1"]').first()).toHaveText('甲乙');
    /* 作品清單：讀入 JSON → 新的作品、開啟、清單關掉 */
    await page.getByRole('button', { name: '作品', exact: true }).click();
    const lib = page.getByRole('dialog', { name: '作品' });
    const chooser = page.waitForEvent('filechooser');
    await lib.getByRole('button', { name: '讀入 JSON' }).click();
    await (await chooser).setFiles({
      name: 'x.json',
      buffer: Buffer.from(docJson('讀入的作品', [blk('z', 'desc', '讀入的。')])),
      mimeType: 'application/json',
    });
    await expect(status(page)).toContainText('已把檔案加成新的作品「讀入的作品」並開啟');
    await expect(lib).toHaveCount(0);
    await expect(stage(page).locator('.bp[data-id="z"]')).toHaveText('讀入的。');
    expect(errors).toEqual([]);
  });

  test('讀入原作 v3.26 的原稿：裡面的段落、範本的名稱、pt；再存不會遺失；PDF（F302）', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors = await open(page);
    await loadFile(page, readFileSync(UP_KIDS.pathname), '第三批的驗證稿');
    await expect(source(page).locator('[data-kids="sk"] [data-row]')).toHaveCount(3);
    await expect(source(page).locator('[data-row="dl"] [data-label]')).toContainText('對話文');
    await expect(source(page).locator('[data-row="nt"] [data-label]')).toContainText('注釋');
    await expect(source(page).locator('[data-row="inf"] [data-label]')).toContainText('情報區塊');
    await expect(lbl(page, 'dl')).toHaveValue('管家');
    await expect(lbl(page, 'dl')).toHaveAttribute('placeholder', '（沒有說話者）');
    /* 外面那段 14pt：裡面的段落是本來的大小 */
    expect(
      await stage(page)
        .locator('.bp[data-id="rlk"] > .b')
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe(`${(10 * 96) / 72}px`.replace(/(\.\d{4})\d+/, '$1'));
    /* 繞排的圖片旁的框：縮到圖片的旁邊 */
    const im = await stage(page).locator('.bp[data-id="imf"]').boundingBox();
    const pf = await stage(page).locator('.bp[data-id="pf"] > .b').boundingBox();
    expect(pf && im && pf.x >= im.x + im.width - 1).toBe(true);
    const saved = await savedDoc(page);
    const up = JSON.parse(readFileSync(UP_KIDS.pathname, 'utf8'));
    expect(tree(saved.blocks)).toEqual(tree(up.blocks));
    expect(saved.pkv).toBe(1);
    expect(saved.blocks.find((b) => b.id === 'inf')?.bx).toEqual(
      up.blocks.find((b: TestBlock) => b.id === 'inf').bx,
    );
    /* PDF：產生得出來（裡面的段落的文字也在） */
    await page.getByRole('button', { name: '列印 / PDF' }).click();
    const dlg = page.getByRole('dialog', { name: '列印 / PDF' });
    const { bytes } = await download(page, () =>
      dlg.getByRole('button', { name: '下載 PDF' }).click(),
    );
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const texts = pdfPageTexts(await PDFDocument.load(bytes))
      .map((p) => p.text)
      .join('');
    for (const t of ['找到信封', '署名是', '裡面的段落用本來的大小', '管家'])
      expect(texts).toContain(t);
    expect(errors).toEqual([]);
  });
});
