/**
 * 填字遊戲產生器（建置產物 next/crossword/）的端對端測試：
 * - 開頁沒有錯誤、頁尾只有靈感來源、群組分頁、開頁的範例（自己列答案、12 個答案全部排進去）；
 * - 自己列答案：改清單、Ctrl＋Enter 產生、排不進去的答案、清單的問題、改過之後的提醒；
 * - 從文字擷取：貼上英文、單字數、讀進 HTML 檔（CCFOLIA 日誌）、清除文字、空白時的提醒；
 * - 預覽：顯示答案（開關與 A 鍵）、版面（左右／上下的圖寬）、標題、空格透明；
 * - 匯出：PNG（檔名、尺寸、像素）、HTML（結構）、列印（列印文件）；
 * - 自動儲存、復原／重做、專案檔（Ctrl＋S、開啟、別的工具的檔案、全部重來）、很長的文字不存；
 * - 390 寬沒有橫向捲動；1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('crossword') ?? { id: 'crossword', status: 'next' })}/`;
const KEY = 'trpg-toolkit:crossword';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '填字遊戲產生器' })).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  return errors;
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const canvas = (page: Page) => page.getByTestId('sheet-canvas');
const status = (page: Page) => page.getByTestId('generate-status');
const toast = (page: Page, text: string | RegExp) =>
  page.getByRole('region', { name: /^通知/ }).getByText(text);

interface StoredWord {
  answer: string;
  hint: string;
  x: number;
  y: number;
  dir: 'across' | 'down';
  num: number;
}
interface Stored {
  mode: string;
  text: string;
  list: string;
  title: string;
  layout: string;
  puzzle: { width: number; height: number; words: StoredWord[] } | null;
  stats: { found: number; unplaced: string[] } | null;
}

async function stored(page: Page): Promise<Stored> {
  await page.waitForFunction((k) => localStorage.getItem(k) !== null, KEY);
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) as string).state.data, KEY);
}

/** 盤面一致：每個詞的字和格子相同（交叉的格子沒有衝突） */
function expectConsistent(p: NonNullable<Stored['puzzle']>) {
  const cells = new Map<string, string>();
  for (const w of p.words)
    Array.from(w.answer).forEach((ch, i) => {
      const k = w.dir === 'across' ? `${w.x + i},${w.y}` : `${w.x},${w.y + i}`;
      if (cells.has(k)) expect(cells.get(k)).toBe(ch);
      cells.set(k, ch);
      expect(w.dir === 'across' ? w.x + i : w.x).toBeLessThan(p.width);
      expect(w.dir === 'across' ? w.y : w.y + i).toBeLessThan(p.height);
    });
}

/** 按「產生」，等到產生完、存進瀏覽器（答案少時盤面可能和原本一樣，存檔不變，最多等 3 秒） */
async function generateNow(page: Page) {
  const seq = await page.evaluate((k) => localStorage.getItem(k), KEY);
  await page.getByTestId('generate').click();
  await page
    .waitForFunction(([k, prev]) => localStorage.getItem(k as string) !== prev, [KEY, seq], {
      timeout: 3000,
    })
    .catch(() => undefined);
  await expect(page.getByTestId('generate')).toBeEnabled();
}

async function download(page: Page, click: () => Promise<void>) {
  const d = page.waitForEvent('download');
  await click();
  const dl = await d;
  return {
    name: dl.suggestedFilename(),
    bytes: new Uint8Array(readFileSync((await dl.path()) as string)),
  };
}

function png(bytes: Uint8Array) {
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT');
  const z = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
  let o = 0;
  for (const c of idat) {
    z.set(c.data, o);
    o += c.data.length;
  }
  const px = decodePixels(z, ihdr.width, ihdr.height, ihdr.colorType);
  const at = (x: number, y: number) =>
    Array.from(px.slice((y * ihdr.width + x) * 4, (y * ihdr.width + x) * 4 + 3));
  return { ihdr, at };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function sheetSize(page: Page) {
  const c = canvas(page);
  return [Number(await c.getAttribute('data-width')), Number(await c.getAttribute('data-height'))];
}

const canvasUrl = (page: Page) =>
  canvas(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL());

const EN_TEXT = `The investigators arrived at the old mansion on a rainy night.
Alice found a rusty key inside the mailbox. The key opened the front door!
In the library, they discovered a diary hidden behind dusty books.
The last page of the diary mentioned a secret cellar beneath the kitchen.
The cellar door was locked with a heavy chain and an old padlock.`;

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、頁尾只有靈感來源、範例清單排好 12 個答案', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer')).toHaveText('靈感來源：sotsotssi/text2crossword');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://github.com/sotsotssi/text2crossword',
    );
    await expect(page.getByRole('link', { name: '劇本排版台' })).toBeVisible();
    await expect(radio(page, '自己列答案')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('list-count')).toHaveText('12 個答案');
    await expect(page.getByLabel('答案與提示')).toHaveValue(/^神父：在教堂裡/);
    await expect(status(page)).toContainText('排進 12／12 個答案。');
    expect(await sheetSize(page)).toEqual([1420, expect.any(Number)]);
    await expect(page.getByTestId('sheet-size')).toContainText('2,840 ×');
    await expect(page.getByRole('switch', { name: '顯示答案' })).not.toBeChecked();
    for (const v of ['題目', '解答'])
      for (const k of ['下載 PNG', '下載 HTML', '列印'])
        await expect(page.getByRole('button', { name: `${v}：${k}` })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('自己列答案：改清單、Ctrl＋Enter 產生、排不進去的答案、清單的問題、改過之後的提醒', async ({
    page,
  }) => {
    const errors = await open(page);
    const list = page.getByTestId('list-input');
    await list.fill(
      '米斯卡塔尼克大學：阿卡姆的名校\n印斯茅斯：海邊的小鎮\n克蘇魯神話：題材\n神父：教堂裡的人\n貓咪：沒有共同的字\nx：太短\n神父：重複\n暗門',
    );
    await expect(page.getByTestId('list-count')).toHaveText('6 個答案');
    const issues = page.getByTestId('list-issues');
    await expect(issues).toContainText('第 6 行的答案不到兩個字');
    await expect(issues).toContainText('重複的答案只用第一個：神父');
    await expect(issues).toContainText('1 個答案沒有寫提示');
    await expect(page.getByTestId('stale')).toBeVisible();

    await list.click();
    await page.keyboard.press('Control+Enter');
    await expect(status(page)).toContainText('排進 4／6 個答案。');
    await expect(page.getByTestId('unplaced')).toContainText('貓咪、暗門');
    await expect(page.getByTestId('stale')).toHaveCount(0);
    const d = await stored(page);
    expect(d.puzzle?.words.map((w) => w.answer).sort()).toEqual(
      ['克蘇魯神話', '印斯茅斯', '神父', '米斯卡塔尼克大學'].sort(),
    );
    if (d.puzzle) expectConsistent(d.puzzle);

    /* 全部清掉：提醒先列出答案，盤面不變 */
    await list.fill('');
    await page.getByTestId('generate').click();
    await expect(toast(page, '先列出答案。').first()).toBeVisible();
    expect((await stored(page)).puzzle).toEqual(d.puzzle);
    /* 只有排不進去的：沒有可以用的答案 */
    await list.fill('a：1\nb：2');
    await page.getByTestId('generate').click();
    await expect(toast(page, '沒有可以用的答案').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('從文字擷取：英文、單字數、讀進 HTML 日誌、清除文字', async ({ page }) => {
    const errors = await open(page);
    await radio(page, '從文字擷取').click();
    await expect(page.getByTestId('text-input')).toHaveValue(/\[主場景\] KP：深夜/);
    await expect(page.getByTestId('han-note')).toBeVisible();
    await page.getByTestId('text-input').fill(EN_TEXT);
    await expect(page.getByTestId('han-note')).toHaveCount(0);
    const count = page.getByRole('spinbutton', { name: '單字數' });
    await count.fill('8');
    await count.press('Enter');
    await generateNow(page);
    await expect(status(page)).toContainText(/從文字找到 \d+ 個單字，排進 8 個。/);
    const d = await stored(page);
    expect(d.mode).toBe('text');
    expect(d.puzzle?.words).toHaveLength(8);
    if (d.puzzle) {
      expectConsistent(d.puzzle);
      /* 每個提示都是文字裡的句子、含有答案 */
      for (const w of d.puzzle.words) {
        expect(EN_TEXT).toContain(w.hint);
        expect(w.hint).toContain(w.answer);
      }
    }

    /* 改成答案清單：盤面不變，清單是「答案：提示」（依號碼） */
    await btn(page, '改成答案清單').click();
    await expect(radio(page, '自己列答案')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('list-count')).toHaveText('8 個答案');
    await expect(status(page)).toContainText('排進 8／8 個答案。');
    await expect(page.getByTestId('stale')).toHaveCount(0);
    await expect(toast(page, '已把 8 個答案放進答案清單（可以復原）')).toBeVisible();
    const converted = await stored(page);
    expect(converted.puzzle).toEqual(d.puzzle);
    const firstNum = Math.min(...(d.puzzle?.words.map((w) => w.num) ?? []));
    const firstWord = d.puzzle?.words.find((w) => w.num === firstNum);
    expect(converted.list.split('\n')[0]).toBe(`${firstWord?.answer}：${firstWord?.hint}`);
    await radio(page, '從文字擷取').click();

    /* 讀進 HTML 檔（CCFOLIA 日誌）：標籤與說話者拿掉 */
    const html = `<html><head><style>p{}</style></head><body>
<p><span>[main]</span> <span>KP</span> : <span>The lighthouse keeper left a logbook on the table.</span></p>
<p><span>[main]</span> <span>Ann</span> : <span>I read the logbook &amp; check the lighthouse door.</span></p>
</body></html>`;
    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
      name: 'log.html',
      mimeType: 'text/html',
      buffer: Buffer.from(html),
    });
    await expect(page.getByTestId('text-input')).toHaveValue(html);
    await expect(page.getByText('目前的文字來自「log.html」')).toBeVisible();
    await expect(toast(page, '已讀取「log.html」').first()).toBeVisible();
    await expect(page.getByTestId('stale')).toBeVisible();
    await generateNow(page);
    const words = (await stored(page)).puzzle?.words ?? [];
    for (const w of words) {
      expect(w.hint).not.toMatch(/<|KP|\[main\]|&amp;/);
      expect([
        'lighthouse',
        'logbook',
        'The',
        'the',
        'keeper',
        'left',
        'on',
        'table',
        'read',
        'check',
        'door',
      ]).toContain(w.answer);
    }

    /* 不是文字檔 */
    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
      name: 'a.png',
      mimeType: 'image/png',
      buffer: Buffer.from([1, 2, 3]),
    });
    await expect(toast(page, '不是文字檔：a.png').first()).toBeVisible();

    await btn(page, '清除文字').click();
    await expect(page.getByTestId('text-input')).toHaveValue('');
    await expect(page.getByText('目前的文字來自「log.html」')).toHaveCount(0);
    await page.getByTestId('generate').click();
    await expect(toast(page, '先輸入文字。').first()).toBeVisible();
    /* 復原清除 */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('text-input')).toHaveValue(html);
    expect(errors).toEqual([]);
  });

  test('預覽：顯示答案（開關與 A 鍵）、版面、標題、空格透明', async ({ page }) => {
    const errors = await open(page);
    const q = await canvasUrl(page);
    await page.getByRole('switch', { name: '顯示答案' }).click();
    await expect.poll(() => canvasUrl(page)).not.toBe(q);
    const a = await canvasUrl(page);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('a');
    await expect(page.getByRole('switch', { name: '顯示答案' })).not.toBeChecked();
    await expect.poll(() => canvasUrl(page)).toBe(q);
    await page.keyboard.press('a');
    await expect.poll(() => canvasUrl(page)).toBe(a);

    /* 版面：左右 1300＋120、上下 900＋120 */
    expect((await sheetSize(page))[0]).toBe(1420);
    await page.getByRole('radio', { name: '盤面在上、提示在下' }).click();
    await expect.poll(async () => (await sheetSize(page))[0]).toBe(1020);
    expect((await stored(page)).layout).toBe('col');

    /* 標題：空白時沒有標題區（盤面往上移；題目版） */
    await page.getByRole('switch', { name: '顯示答案' }).click();
    await expect(page.getByRole('switch', { name: '顯示答案' })).not.toBeChecked();
    const board = async () => (await canvas(page).getAttribute('data-board')) ?? '';
    const withTitle = await board();
    await page.getByTestId('title-input').fill('');
    await expect.poll(board).not.toBe(withTitle);
    await page.getByTestId('title-input').fill('霧港的謎題');
    await expect.poll(board).toBe(withTitle);

    /* 空格透明：色彩欄停用 */
    await page.getByRole('checkbox', { name: '空格透明' }).click();
    await expect(page.getByRole('textbox', { name: '空格的顏色' })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('匯出：PNG（檔名、尺寸、像素）、HTML、列印', async ({ page }) => {
    const errors = await open(page);
    await generateNow(page);
    await expect(status(page)).toContainText('排進 12／12 個答案。');
    const [w, h] = await sheetSize(page);
    const board = ((await canvas(page).getAttribute('data-board')) ?? '').split(',').map(Number);
    const p = (await stored(page)).puzzle;
    expect(p).not.toBeNull();
    if (!p) return;
    /* 第一個詞的第一格中心、找一個空格（沒有字的格子）的中心 */
    const cell = (x: number, y: number) => [
      Math.round((board[0] + 2 + x * 49 + 24) * 2),
      Math.round((board[1] + 2 + y * 49 + 24) * 2),
    ];
    const filled = new Set<string>();
    for (const word of p.words)
      for (let i = 0; i < Array.from(word.answer).length; i++)
        filled.add(word.dir === 'across' ? `${word.x + i},${word.y}` : `${word.x},${word.y + i}`);
    let empty: [number, number] = [0, 0];
    for (let y = 0; y < p.height && !empty[0]; y++)
      for (let x = 0; x < p.width; x++)
        if (!filled.has(`${x},${y}`)) {
          empty = [x, y];
          break;
        }

    const q = await download(page, () =>
      page.getByRole('button', { name: '題目：下載 PNG' }).click(),
    );
    expect(q.name).toBe('填字遊戲_題目.png');
    const qp = png(q.bytes);
    expect([qp.ihdr.width, qp.ihdr.height]).toEqual([w * 2, h * 2]);
    expect(qp.at(5, 5)).toEqual([255, 255, 255]);
    expect(qp.at(...(cell(...empty) as [number, number]))).toEqual([0x33, 0x41, 0x55]);
    /* 題目版：格子中央是白的（沒有字） */
    const first = p.words[0];
    const [cx, cy] = cell(first.x, first.y);
    expect(qp.at(cx, cy)).toEqual([255, 255, 255]);
    await expect(toast(page, '已下載「填字遊戲_題目.png」').first()).toBeVisible();

    /* 解答版：格子中央附近有字（深色） */
    const a = await download(page, () =>
      page.getByRole('button', { name: '解答：下載 PNG' }).click(),
    );
    expect(a.name).toBe('填字遊戲_解答.png');
    const ap = png(a.bytes);
    let dark = 0;
    for (let dy = -14; dy <= 14; dy += 2)
      for (let dx = -14; dx <= 14; dx += 2) if (ap.at(cx + dx, cy + dy)[0] < 120) dark++;
    expect(dark).toBeGreaterThan(5);

    /* HTML */
    const hq = await download(page, () =>
      page.getByRole('button', { name: '題目：下載 HTML' }).click(),
    );
    expect(hq.name).toBe('填字遊戲_題目.html');
    const text = new TextDecoder().decode(hq.bytes);
    expect(text).toContain('<title>填字遊戲（題目）</title>');
    expect(text.match(/class="cell on"/g)?.length).toBe(filled.size);
    expect(text).toContain('橫向提示');
    expect(text).toContain('直向提示');
    expect(text).toContain('fonts.googleapis.com');
    const ha = await download(page, () =>
      page.getByRole('button', { name: '解答：下載 HTML' }).click(),
    );
    expect(new TextDecoder().decode(ha.bytes)).toContain('<span class="badge">（解答）</span>');

    /* 列印：列印文件裡一頁、一張圖 */
    await page.getByRole('button', { name: '題目：列印' }).click();
    const frame = page.frameLocator('iframe[data-paged-print]');
    await expect(frame.locator('.paged-print-page img')).toHaveCount(1);
    expect(await page.locator('iframe[data-paged-print]').getAttribute('title')).toBe(
      '填字遊戲（題目）',
    );
    const css = await frame.locator('style').first().textContent();
    expect(css).toContain('@page{size:297mm 210mm;margin:0}');
    expect(errors).toEqual([]);
  });

  test('自動儲存、復原／重做、專案檔、全部重來、很長的文字', async ({ page }) => {
    const errors = await open(page);
    const list = page.getByTestId('list-input');
    await list.fill('米斯卡塔尼克大學：甲\n印斯茅斯：乙\n克蘇魯神話：丙');
    await page.getByTestId('title-input').fill('第一章');
    await generateNow(page);
    const first = (await stored(page)).puzzle;
    await page.reload();
    await expect(page.getByTestId('list-input')).toHaveValue(
      '米斯卡塔尼克大學：甲\n印斯茅斯：乙\n克蘇魯神話：丙',
    );
    await expect(page.getByTestId('title-input')).toHaveValue('第一章');
    expect((await stored(page)).puzzle).toEqual(first);
    await expect(status(page)).toContainText('排進 3／3 個答案。');

    /* 復原／重做（產生是一步）：換一份清單再產生，復原回到上一個盤面 */
    await list.fill('米斯卡塔尼克大學：甲\n印斯茅斯：乙\n克蘇魯神話：丙\n神父：丁');
    await generateNow(page);
    await expect(status(page)).toContainText('排進 4／4 個答案。');
    const second = (await stored(page)).puzzle;
    expect(second?.words).toHaveLength(4);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => JSON.stringify((await stored(page)).puzzle))
      .toBe(JSON.stringify(first));
    await page.keyboard.press('Control+Shift+z');
    await expect
      .poll(async () => JSON.stringify((await stored(page)).puzzle))
      .toBe(JSON.stringify(second));

    /* Ctrl＋S：專案檔 */
    const saved = await download(page, () => page.keyboard.press('Control+s'));
    expect(saved.name).toBe('第一章_填字遊戲.json');
    const project = JSON.parse(new TextDecoder().decode(saved.bytes));
    expect(project).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'crossword',
      version: 1,
    });
    expect(project.data.puzzle).toEqual(second);

    /* 全部重來 → 範例；再開啟專案檔 */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /重設/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(page.getByTestId('list-count')).toHaveText('12 個答案');
    await expect(page.getByTestId('title-input')).toHaveValue('填字遊戲');
    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles({
      name: 'p.json',
      mimeType: 'application/json',
      buffer: Buffer.from(saved.bytes),
    });
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(page.getByTestId('title-input')).toHaveValue('第一章');
    expect((await stored(page)).puzzle).toEqual(second);

    /* 別的工具的專案檔 */
    await btn(page, '專案').click();
    const [chooser2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser2.setFiles({
      name: 'other.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ format: 'trpg-toolkit-project', tool: 'coc-npc', version: 1, data: {} }),
      ),
    });
    await expect(page.getByText('無法開啟專案檔', { exact: true })).toBeVisible();
    await expect(page.getByTestId('title-input')).toHaveValue('第一章');

    /* 很長的文字（超過 30 萬字）：不存文字，其餘照存 */
    await radio(page, '從文字擷取').click();
    await page.getByTestId('text-input').fill('a'.repeat(300_001));
    await expect(page.getByText('文字超過 30 萬字，不會自動儲存')).toBeVisible();
    await page.getByTestId('title-input').fill('長文');
    await expect.poll(async () => (await stored(page)).title).toBe('長文');
    expect((await stored(page)).text).toBe('');

    /* 壞掉的存檔：當作沒有存檔（回到範例） */
    await page.evaluate((k) => localStorage.setItem(k, '{broken'), KEY);
    await page.reload();
    await expect(page.getByTestId('list-count')).toHaveText('12 個答案');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('crossword-1280.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test('沒有橫向捲動（兩種來源、解答版）；視覺基準', async ({ page }) => {
    const errors = await open(page);
    await noHorizontalScroll(page);
    await radio(page, '從文字擷取').click();
    await noHorizontalScroll(page);
    await page.getByRole('switch', { name: '顯示答案' }).click();
    await noHorizontalScroll(page);
    await radio(page, '自己列答案').click();
    await page.getByRole('switch', { name: '顯示答案' }).click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('crossword-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
