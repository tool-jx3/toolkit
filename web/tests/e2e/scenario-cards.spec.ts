/**
 * 劇本資訊卡片產生器（建置產物 next/scenario-cards/）的端對端測試：
 * - 開頁沒有 pageerror／console error；初始狀態；頁尾只放靈感來源；非官方聲明；說明。
 * - 開啟 TXT 檔（附件 I01、I07：整理規則、專案名稱只在空白時帶入）、Big5 與 UTF-16 自動辨認、同一個檔再開一次、復原。
 * - 選取建卡（附件 S01、S03、S08、S09）、C／Shift＋C 鍵（Ctrl＋C 不建卡、沒有選取時照常打字）、新卡片的捲動與聚焦。
 * - 複製文字（附件 C05、C13、C16 剪貼簿逐字；剪貼簿不能用時顯示錯誤）、換類型（前後綴、第二標題保留但不顯示）。
 * - 搜尋（附件 Q01 每一步的計數與選取、Q05、Q07 修正後、選取的那一行捲到中間、外框亮起）。
 * - 類型快捷鍵（Alt＋1～9、0、-、=，依焦點決定改哪個選單；Mac 的 Option＋數字；Alt＋↑↓ 循環）。
 * - 新增卡片（篩選中切回全部）、建立副本、刪除與復原、拖曳排序（插到目標之前、篩選中）、鍵盤排序、篩選、清單捲動鈕。
 * - 專案：存到瀏覽器（名稱空白、覆蓋、繁中排序）、從清單讀取（可以復原）、依名稱讀取、刪除；
 *   匯出專案檔（解析下載的 JSON、檔名規則）、讀入專案檔（驗證、錯誤）；自動存檔（重新整理還原、損壞時空白開始）。
 * - 卡片內文欄 4～6 行；390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('scenario-cards') ?? { id: 'scenario-cards', status: 'next' })}/`;

const STORY =
  '第一章　霧港的燈塔\n\n港口的霧在傍晚六點準時湧上岸，燈塔卻已經三天沒有亮過。\n漁會的理事長說，看守人老溫最後一次被看見，是在週二的魚市。\n\n\n\n燈塔一樓\n螺旋梯的扶手上纏著一圈濕透的麻繩。\n牆上的日曆停在十月七日，那一天被紅筆圈了三次。\n\n〈看守人的日誌〉\n「今晚的光又往海裡多照了一尺。」\n「它在數我點燈的次數。」\n\n《偵查》成功\n樓梯第十三階的木板是新的，釘子還沒生鏽。';

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
  await expect(page.getByRole('heading', { level: 1, name: '劇本資訊卡片產生器' })).toBeVisible();
  return errors;
}

const source = (page: Page) => page.getByRole('textbox', { name: '劇本內文' });
const status = (page: Page) => page.getByTestId('status-text');
const statusBox = (page: Page) => page.getByTestId('status');
const list = (page: Page) => page.getByTestId('card-list');
const cards = (page: Page) => list(page).locator('article');
const card = (page: Page, n: number) => cards(page).nth(n);
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const projectName = (page: Page) => page.getByRole('textbox', { name: '專案名稱' });
const selectionType = (page: Page) => page.getByRole('combobox', { name: '選取建卡的類型' });
const newType = (page: Page) => page.getByRole('combobox', { name: '新增卡片的類型' });
const savedList = (page: Page) => page.getByRole('combobox', { name: '已存的專案' });
const searchBox = (page: Page) => page.getByRole('searchbox', { name: '搜尋內文' });
const searchCount = (page: Page) => page.getByTestId('search-count');
const filterBtn = (page: Page, name: string) =>
  page.getByRole('group', { name: '依類型篩選' }).getByRole('button', { name, exact: true });
const titleOf = (c: Locator) => c.locator('[data-role="title"]');
const extraOf = (c: Locator) => c.locator('[data-role="extra"]');
const bodyOf = (c: Locator) => c.locator('[data-role="body"]');
const typeIcon = (c: Locator, name: string) =>
  c.getByRole('group', { name: '卡片類型' }).getByRole('button', { name, exact: true });
const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

async function setSource(page: Page, text: string) {
  await source(page).fill(text);
}

async function select(page: Page, start: number, end: number) {
  await source(page).evaluate(
    (el: HTMLTextAreaElement, [a, b]) => {
      el.focus();
      el.setSelectionRange(a, b);
    },
    [start, end],
  );
}

async function selection(page: Page): Promise<[number, number]> {
  return source(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);
}

async function pick(page: Page, combo: Locator, option: string) {
  await combo.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(combo).toHaveText(option);
}

/** 新增一張空白卡片並填好（新增卡片的類型先選好） */
async function addFilled(
  page: Page,
  type: string,
  fields: { title?: string; extra?: string; body?: string },
) {
  await pick(page, newType(page), type);
  const n = await cards(page).count();
  await btn(page, '新增卡片').click();
  const c = card(page, n);
  await expect(c).toBeVisible();
  if (fields.title !== undefined) await titleOf(c).fill(fields.title);
  if (fields.extra !== undefined) await extraOf(c).fill(fields.extra);
  if (fields.body !== undefined) await bodyOf(c).fill(fields.body);
  return c;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function cardTitles(page: Page): Promise<string[]> {
  return cards(page)
    .locator('[data-role="title"]')
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
}

const txt = (name: string, content: string | Buffer, mimeType = 'text/plain') => ({
  name,
  mimeType,
  buffer: typeof content === 'string' ? Buffer.from(content, 'utf8') : content,
});

async function openTxt(page: Page, file: ReturnType<typeof txt>) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    btn(page, '開啟 TXT 檔').click(),
  ]);
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles(file);
}

/** 頁首的「專案」選單 */
const projectMenu = (page: Page) =>
  page.getByRole('banner').getByRole('button', { name: '專案', exact: true });
const undoButton = (page: Page) => page.getByRole('button', { name: '復原（Ctrl＋Z）' });

test.use({
  contextOptions: { reducedMotion: 'reduce' },
  viewport: { width: 1280, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});

test('開頁沒有錯誤；初始狀態；頁尾只放靈感來源；非官方聲明；說明', async ({ page }) => {
  const errors = await open(page);
  await expect(source(page)).toHaveValue('');
  await expect(source(page)).toHaveAttribute('placeholder', /把劇本全文貼在這裡/);
  await expect(searchCount(page)).toHaveText('0 / 0');
  await expect(selectionType(page)).toHaveText('◆ 場景');
  await expect(newType(page)).toHaveText('◆ 場景');
  await expect(cards(page)).toHaveCount(0);
  await expect(list(page)).toContainText('還沒有卡片');
  await expect(page.getByTestId('card-count')).toHaveText('共 0 張');
  await expect(projectName(page)).toHaveValue('');
  await expect(savedList(page)).toBeDisabled();
  await expect(savedList(page)).toHaveText('還沒有存在瀏覽器裡的專案');
  await expect(filterBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
  const filters = page.getByRole('group', { name: '依類型篩選' }).getByRole('button');
  await expect(filters).toHaveText([
    '全部',
    '◆ 場景',
    '▼ 探索地點',
    '■ 資料',
    '◇ NPC 資訊',
    '● 技能成功',
    '・ 備忘',
    '◈ 道具',
    '※ 規則',
    '◎ HO1',
    '〓 HO2',
    '△ HO3',
    '❖ HO4',
  ]);
  await expect(status(page)).toHaveText('');
  /* 頁尾：只有靈感來源；另有一句自己寫的非官方聲明 */
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link')).toHaveCount(1);
  await expect(footer.getByRole('link', { name: 'くま。／TRPG WEBツール観測所' })).toHaveAttribute(
    'href',
    'https://kumachansteps.github.io/trpg-web-tools/',
  );
  await expect(page.getByTestId('disclaimer')).toContainText('非官方');
  await expect(page.getByText(/KumachanSteps/)).toHaveCount(0);
  /* 說明與快捷鍵 */
  await page.getByRole('button', { name: '說明' }).click();
  const help = page.getByRole('dialog', { name: '劇本資訊卡片產生器：使用方式' });
  await expect(help).toContainText('CCFOLIA');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('?');
  const keys = page.getByRole('dialog', { name: '快捷鍵' });
  await expect(keys).toContainText('選類型：◆ 場景');
  await expect(keys).toContainText('選類型：❖ HO4');
  await expect(keys).toContainText('輸入框裡也可用');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('開啟 TXT 檔：整理規則（I01）、專案名稱只在空白時帶入（I07）、Big5／UTF-16、同一檔再開、復原', async ({
  page,
}) => {
  const errors = await open(page);
  const I01 =
    '\r\n\r\n  第一章　霧港的燈塔\r\n\r\n\r\n\r\n港口的霧在傍晚六點準時湧上岸。\r\n燈塔卻已經三天沒有亮過。\r\n\r\n\r\n漁會的理事長說了實話。\r\n\r\n   \r\n';
  await openTxt(page, txt('霧港的燈塔.txt', I01));
  await expect(source(page)).toHaveValue(
    '第一章　霧港的燈塔\n\n港口的霧在傍晚六點準時湧上岸。\n燈塔卻已經三天沒有亮過。\n\n漁會的理事長說了實話。',
  );
  await expect(projectName(page)).toHaveValue('霧港的燈塔');
  await expect(status(page)).toHaveText('已讀入「霧港的燈塔.txt」。');
  /* 專案名稱已經有了：不覆蓋；內容取代 */
  await openTxt(page, txt('第二章.v2.final.txt', '﻿內容\r\r\r\r結尾'));
  await expect(source(page)).toHaveValue('內容\n\n結尾');
  await expect(projectName(page)).toHaveValue('霧港的燈塔');
  /* 同一個檔案可以再開一次 */
  await setSource(page, '改過');
  await openTxt(page, txt('第二章.v2.final.txt', '﻿內容\r\r\r\r結尾'));
  await expect(source(page)).toHaveValue('內容\n\n結尾');
  /* 名稱空白時才帶入（只去掉最後一個副檔名） */
  await projectName(page).fill('  ');
  await openTxt(page, txt('第二章.v2.final.txt', '內容'));
  await expect(projectName(page)).toHaveValue('第二章.v2.final');
  /* Big5：自動辨認 */
  const big5 = Buffer.from([0xa4, 0xa4, 0xa4, 0xe5, 0x0d, 0x0a, 0xa5, 0x5f]); // 中文\r\n北
  await openTxt(page, txt('舊檔.txt', big5));
  await expect(source(page)).toHaveValue('中文\n北');
  await expect(status(page)).toHaveText('已讀入「舊檔.txt」（以 Big5 編碼解讀）。');
  /* 有 BOM 的 UTF-16 */
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('燈塔\r\n日誌', 'utf16le')]);
  await openTxt(page, txt('u16.txt', u16));
  await expect(source(page)).toHaveValue('燈塔\n日誌');
  /* 讀入可以復原（狀態列的「復原」） */
  await statusBox(page).getByRole('button', { name: '復原' }).click();
  await expect(source(page)).toHaveValue('中文\n北');
  expect(errors).toEqual([]);
});

test('選取建卡（S01、S03、S08、S09）、C 鍵、新卡片的捲動與聚焦', async ({ page }) => {
  const errors = await open(page);
  await setSource(page, STORY);
  /* S09：沒有選取 */
  await select(page, 1, 1);
  await btn(page, '用選取的內容建立卡片').click();
  await expect(status(page)).toHaveText('請先在內文選取一段文字。');
  await expect(cards(page)).toHaveCount(0);
  /* S01：探索地點 */
  await pick(page, selectionType(page), '▼ 探索地點');
  await select(page, 72, 118);
  await btn(page, '用選取的內容建立卡片').click();
  await expect(cards(page)).toHaveCount(1);
  const c1 = card(page, 0);
  await expect(c1.getByTestId('card-header')).toHaveText('▼ 探索地點');
  await expect(titleOf(c1)).toHaveValue('燈塔一樓');
  await expect(bodyOf(c1)).toHaveValue(
    '螺旋梯的扶手上纏著一圈濕透的麻繩。\n牆上的日曆停在十月七日，那一天被紅筆圈了三次。',
  );
  await expect(c1.getByTestId('title-prefix')).toHaveText('【');
  await expect(c1.getByTestId('title-suffix')).toHaveText('】');
  /* 新卡片：游標在標題欄並全選、外框亮起 */
  await expect(titleOf(c1)).toBeFocused();
  expect(
    await titleOf(c1).evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]),
  ).toEqual([0, 4]);
  await expect(c1).toHaveAttribute('data-flash', 'true');
  await expect(c1).not.toHaveAttribute('data-flash', 'true', { timeout: 2000 });
  await expect(status(page)).toHaveText('已新增卡片：▼ 探索地點。');
  /* S03：技能成功的第一行放進第二標題（C 鍵） */
  await pick(page, selectionType(page), '● 技能成功');
  await select(page, 160, 187);
  await page.keyboard.press('c');
  await expect(cards(page)).toHaveCount(2);
  await expect(source(page)).toHaveValue(STORY);
  const c2 = card(page, 1);
  await expect(titleOf(c2)).toHaveValue('');
  await expect(extraOf(c2)).toHaveValue('《偵查》成功');
  await expect(bodyOf(c2)).toHaveValue('樓梯第十三階的木板是新的，釘子還沒生鏽。');
  /* Shift＋C 也算 */
  await pick(page, selectionType(page), '〓 HO2');
  await select(page, 120, 158);
  await page.keyboard.press('Shift+C');
  await expect(cards(page)).toHaveCount(3);
  await expect(card(page, 2).getByTestId('card-header')).toHaveText('〓 HO2 秘匿');
  await expect(titleOf(card(page, 2))).toHaveValue('〈看守人的日誌〉');
  /* Ctrl＋C 是複製，不建卡 */
  await select(page, 72, 76);
  await page.keyboard.press('Control+c');
  await expect(cards(page)).toHaveCount(3);
  expect(await clipboard(page)).toBe('燈塔一樓');
  /* 沒有選取時照常打字 */
  await select(page, 0, 0);
  await page.keyboard.press('c');
  await expect(source(page)).toHaveValue(`c${STORY}`);
  await expect(cards(page)).toHaveCount(3);
  /* S08：只選到空白與換行 */
  await setSource(page, '甲\n   \n\n乙');
  await select(page, 1, 6);
  await page.keyboard.press('c');
  await expect(status(page)).toHaveText('選取的內容只有空白，沒有建立卡片。');
  await expect(cards(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('複製文字（C05、C13、C16 逐字）、剪貼簿失敗、換類型與第二標題', async ({ page }) => {
  const errors = await open(page);
  const c05 = await addFilled(page, '● 技能成功', {
    title: '偵查',
    extra: '樓梯的新木板',
    body: '第十三階的木板是新的，釘子還沒生鏽。',
  });
  await c05.getByRole('button', { name: '複製', exact: true }).click();
  await expect(status(page)).toHaveText('已複製卡片文字，可以貼到 CCFOLIA 的聊天欄。');
  expect(await clipboard(page)).toBe(
    '●《偵查》成功：樓梯的新木板\n\n第十三階的木板是新的，釘子還沒生鏽。',
  );

  const c13 = await addFilled(page, '◆ 場景', {});
  await c13.getByRole('button', { name: '複製', exact: true }).click();
  await expect(status(page)).toHaveText(/已複製/);
  expect(await clipboard(page)).toBe('◆場景\n\n');

  const c16 = await addFilled(page, '▼ 探索地點', {
    title: '含 <標籤> & "引號"',
    body: '特殊字元原樣輸出：< > & " \'',
  });
  await c16.getByRole('button', { name: '複製', exact: true }).click();
  await expect
    .poll(() => clipboard(page))
    .toBe('▼【含 <標籤> & "引號"】\n\n特殊字元原樣輸出：< > & " \'');

  /* 換類型（F18）：標題、內文、第二標題保留；第二標題只在技能成功顯示（F20） */
  await typeIcon(c05, '備忘').click();
  await expect(status(page)).toHaveText('已換成 ・ 備忘。');
  await expect(c05.getByTestId('card-header')).toHaveText('・ 備忘');
  await expect(typeIcon(c05, '備忘')).toHaveAttribute('aria-pressed', 'true');
  await expect(typeIcon(c05, '技能成功')).toHaveAttribute('aria-pressed', 'false');
  await expect(extraOf(c05)).toHaveCount(0);
  await expect(titleOf(c05)).toHaveValue('偵查');
  await c05.getByRole('button', { name: '複製', exact: true }).click();
  await expect.poll(() => clipboard(page)).toBe('・偵查\n\n第十三階的木板是新的，釘子還沒生鏽。');
  await typeIcon(c05, '技能成功').click();
  await expect(extraOf(c05)).toHaveValue('樓梯的新木板');
  await typeIcon(c05, 'HO3').click();
  await expect(c05.getByTestId('card-header')).toHaveText('△ HO3 秘匿');
  await expect(c05.getByTestId('title-prefix')).toHaveText('HO3 秘匿：');
  await expect(c05.getByTestId('title-suffix')).toHaveCount(0);
  await expect(titleOf(c05)).toHaveAttribute('placeholder', '秘匿的標題');

  /* 剪貼簿不能用時顯示錯誤（舊版不論成敗都顯示已複製） */
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    document.execCommand = () => false;
  });
  await c13.getByRole('button', { name: '複製', exact: true }).click();
  await expect(status(page)).toHaveText('無法複製到剪貼簿，請改用手動選取後複製。');
  await expect(statusBox(page)).toHaveAttribute('data-tone', 'danger');
  expect(errors).toEqual([]);
});

test('搜尋：Q01 每一步、Q05 找不到、Q07 修正後、捲到中間、外框亮起', async ({ page }) => {
  const errors = await open(page);
  await setSource(page, '霧港的燈塔在霧港的北邊。\n霧港漁會。');
  /* 沒有關鍵字 */
  await btn(page, '搜尋').click();
  await expect(status(page)).toHaveText('請先輸入要搜尋的文字。');
  await select(page, 3, 3);
  await searchBox(page).fill('霧港');
  await expect(searchCount(page)).toHaveText('1 / 3');
  /* 輸入關鍵字時只重算計數，還沒選取 */
  expect(await selection(page)).toEqual([3, 3]);
  await btn(page, '搜尋').click();
  await expect(searchCount(page)).toHaveText('1 / 3');
  expect(await selection(page)).toEqual([0, 2]);
  await expect(source(page)).toBeFocused();
  await expect(source(page)).toHaveAttribute('data-flash', '');
  await expect(source(page)).not.toHaveAttribute('data-flash', '', { timeout: 2000 });
  const steps: [string, string, [number, number]][] = [
    ['Enter', '2 / 3', [6, 8]],
    ['Enter', '3 / 3', [13, 15]],
    ['Enter', '1 / 3', [0, 2]],
    ['Shift+Enter', '3 / 3', [13, 15]],
  ];
  for (const [key, count, sel] of steps) {
    await searchBox(page).press(key);
    await expect(searchCount(page)).toHaveText(count);
    expect(await selection(page)).toEqual(sel);
  }
  await page.getByRole('button', { name: '上一個符合處（Shift＋Enter）' }).click();
  await expect(searchCount(page)).toHaveText('2 / 3');
  expect(await selection(page)).toEqual([6, 8]);
  await page.getByRole('button', { name: '下一個符合處（Enter）' }).click();
  await expect(searchCount(page)).toHaveText('3 / 3');
  expect(await selection(page)).toEqual([13, 15]);
  /* 內文改變時回到第 1 個（還沒選取） */
  await source(page).press('End');
  await source(page).pressSequentially('霧港');
  await expect(searchCount(page)).toHaveText('1 / 4');

  /* Q07（修正）：打完關鍵字直接按 Enter 選第 1 個 */
  await setSource(page, '甲乙甲乙甲');
  await searchBox(page).fill('甲');
  await expect(searchCount(page)).toHaveText('1 / 3');
  await searchBox(page).press('Enter');
  await expect(searchCount(page)).toHaveText('1 / 3');
  expect(await selection(page)).toEqual([0, 1]);

  /* Q05：找不到 */
  await setSource(page, '燈塔');
  await searchBox(page).fill('鑰匙');
  await expect(searchCount(page)).toHaveText('0 / 0');
  await select(page, 1, 2);
  await searchBox(page).press('Enter');
  await expect(status(page)).toHaveText('找不到「鑰匙」。');
  expect(await selection(page)).toEqual([1, 2]);

  /* 長文：選取的那一行捲到文字區中間（自動換行的長段落也算） */
  const lines = Array.from({ length: 200 }, (_, i) =>
    i === 150
      ? '這一行有關鍵字：看守人的鑰匙'
      : `第 ${i + 1} 行：${'霧'.repeat(i % 3 === 0 ? 120 : 8)}`,
  );
  await setSource(page, lines.join('\n'));
  await searchBox(page).fill('看守人的鑰匙');
  await btn(page, '搜尋').click();
  const pos = await source(page).evaluate((el: HTMLTextAreaElement) => {
    const lh = Number.parseFloat(getComputedStyle(el).lineHeight);
    return { scrollTop: el.scrollTop, client: el.clientHeight, lh };
  });
  expect(pos.scrollTop).toBeGreaterThan(1000);
  /* 用選取的位置量：在可見範圍中央附近 */
  const caretY = await source(page).evaluate((el: HTMLTextAreaElement) => {
    const m = document.createElement('div');
    const cs = getComputedStyle(el);
    for (const p of [
      'fontFamily',
      'fontSize',
      'lineHeight',
      'paddingTop',
      'paddingLeft',
      'paddingRight',
      'letterSpacing',
    ] as const)
      m.style[p] = cs[p];
    m.style.cssText += `;position:absolute;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;width:${el.clientWidth}px`;
    m.textContent = el.value.slice(0, el.selectionStart);
    const s = document.createElement('span');
    s.textContent = '.';
    m.appendChild(s);
    document.body.appendChild(m);
    const top = s.offsetTop;
    m.remove();
    return top - el.scrollTop;
  });
  expect(Math.abs(caretY + pos.lh / 2 - pos.client / 2)).toBeLessThan(pos.lh * 1.5);
  expect(errors).toEqual([]);
});

test('類型快捷鍵：依焦點改不同的選單、Mac 的 Option＋數字、Alt＋↑↓ 循環', async ({ page }) => {
  const errors = await open(page);
  await setSource(page, STORY);
  /* 焦點在內文區：改「選取建卡的類型」，字元不會打進內文 */
  await select(page, 0, 0);
  await page.keyboard.press('Alt+Digit3');
  await expect(selectionType(page)).toHaveText('■ 資料');
  await expect(newType(page)).toHaveText('◆ 場景');
  await expect(status(page)).toHaveText('選取建卡的類型：■ 資料');
  await expect(source(page)).toHaveValue(STORY);
  await page.keyboard.press('Alt+Digit0');
  await expect(selectionType(page)).toHaveText('〓 HO2');
  await page.keyboard.press('Alt+Minus');
  await expect(selectionType(page)).toHaveText('△ HO3');
  await page.keyboard.press('Alt+Equal');
  await expect(selectionType(page)).toHaveText('❖ HO4');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(selectionType(page)).toHaveText('◆ 場景');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(selectionType(page)).toHaveText('❖ HO4');
  /* Mac：Option＋1 產生「¡」，依實體按鍵位置比對 */
  await source(page).evaluate((el) => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '¡',
        code: 'Digit1',
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(selectionType(page)).toHaveText('◆ 場景');
  /* 沒有焦點（點標題）也是選取用的選單 */
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('Alt+Digit2');
  await expect(selectionType(page)).toHaveText('▼ 探索地點');
  /* 焦點在搜尋欄 */
  await searchBox(page).focus();
  await page.keyboard.press('Alt+Digit4');
  await expect(selectionType(page)).toHaveText('◇ NPC 資訊');
  await expect(searchBox(page)).toHaveValue('');
  /* 焦點在右欄（卡片的標題欄裡打字中）：改「新增卡片的類型」 */
  await btn(page, '新增卡片').click();
  await expect(titleOf(card(page, 0))).toBeFocused();
  await page.keyboard.press('Alt+Digit5');
  await expect(newType(page)).toHaveText('● 技能成功');
  await expect(selectionType(page)).toHaveText('◇ NPC 資訊');
  await expect(status(page)).toHaveText('新增卡片的類型：● 技能成功');
  await expect(titleOf(card(page, 0))).toHaveValue('');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(newType(page)).toHaveText('・ 備忘');
  /* 焦點在類型選單的按鈕上：Alt＋↑↓ 照樣換類型，不展開選單（F16） */
  await newType(page).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(newType(page)).toHaveText('● 技能成功');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.keyboard.press('Alt+ArrowDown');
  await expect(newType(page)).toHaveText('・ 備忘');
  await selectionType(page).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(selectionType(page)).toHaveText('● 技能成功');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.keyboard.press('Alt+ArrowUp');
  await expect(selectionType(page)).toHaveText('◇ NPC 資訊');
  /* 選單被記住 */
  await page.reload();
  await open(page, { goto: false });
  await expect(newType(page)).toHaveText('・ 備忘');
  await expect(selectionType(page)).toHaveText('◇ NPC 資訊');
  expect(errors).toEqual([]);
});

test('新增卡片（篩選中切回全部）、建立副本、刪除與復原', async ({ page }) => {
  const errors = await open(page);
  await addFilled(page, '◆ 場景', { title: '霧港的傍晚', body: '霧' });
  await addFilled(page, '◇ NPC 資訊', { title: '陳伯', body: '理事長' });
  await expect(page.getByTestId('card-count')).toHaveText('共 2 張');
  /* 篩選 NPC：新增 NPC 時篩選不變 */
  await filterBtn(page, '◇ NPC 資訊').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByTestId('card-count')).toHaveText('共 2 張，顯示 1 張');
  await btn(page, '新增卡片').click();
  await expect(cards(page)).toHaveCount(2);
  await expect(filterBtn(page, '◇ NPC 資訊')).toHaveAttribute('aria-pressed', 'true');
  /* 新增其他類型：切回全部，新卡片看得到（第 7 節裁定） */
  await pick(page, newType(page), '◈ 道具');
  await btn(page, '新增卡片').click();
  await expect(filterBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards(page)).toHaveCount(4);
  await expect(status(page)).toHaveText(/篩選已切回「全部」/);
  await expect(card(page, 3).getByTestId('card-header')).toHaveText('◈ 道具');
  await expect(titleOf(card(page, 3))).toBeFocused();
  /* 建立副本：加在最後，標題「原標題 副本」 */
  await bodyOf(card(page, 0)).fill('霧\n很濃');
  await card(page, 0).getByRole('button', { name: '建立副本' }).click();
  await expect(cards(page)).toHaveCount(5);
  await expect(titleOf(card(page, 4))).toHaveValue('霧港的傍晚 副本');
  await expect(bodyOf(card(page, 4))).toHaveValue('霧\n很濃');
  await expect(card(page, 4).getByTestId('card-header')).toHaveText('◆ 場景描寫');
  await expect(status(page)).toHaveText('已建立副本（加在清單最後）。');
  /* 刪除：立即刪除，可以從狀態列復原 */
  await card(page, 1).getByRole('button', { name: '刪除' }).click();
  await expect(cards(page)).toHaveCount(4);
  await expect(status(page)).toHaveText('已刪除「陳伯」。');
  await statusBox(page).getByRole('button', { name: '復原' }).click();
  await expect(cards(page)).toHaveCount(5);
  await expect(titleOf(card(page, 1))).toHaveValue('陳伯');
  /* 頁首的復原（Ctrl＋Z） */
  await card(page, 0).getByRole('button', { name: '刪除' }).click();
  await expect(cards(page)).toHaveCount(4);
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(5);
  await expect(titleOf(card(page, 0))).toHaveValue('霧港的傍晚');
  await page.keyboard.press('Control+Shift+z');
  await expect(cards(page)).toHaveCount(4);
  await undoButton(page).click();
  await expect(cards(page)).toHaveCount(5);
  expect(errors).toEqual([]);
});

async function dragHandleTo(page: Page, from: Locator, to: Locator, check?: () => Promise<void>) {
  const h = (await from.locator('[data-drag-handle]').boundingBox())!;
  const t = (await to.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 8, { steps: 2 });
  await page.mouse.move(t.x + t.width / 2, t.y + 20, { steps: 8 });
  await check?.();
  await page.mouse.up();
}

test('拖曳排序：插到目標之前、篩選中也能拖、只有把手能拖；鍵盤排序', async ({ page }) => {
  /* 四張卡片都看得到（拖到看不到的卡片要靠清單邊緣的自動捲動） */
  await page.setViewportSize({ width: 1280, height: 1500 });
  const errors = await open(page);
  for (const [type, title] of [
    ['◆ 場景', 'A'],
    ['・ 備忘', 'B'],
    ['◆ 場景', 'C'],
    ['・ 備忘', 'D'],
  ] as const)
    await addFilled(page, type, { title });
  await expect.poll(() => cardTitles(page)).toEqual(['A', 'B', 'C', 'D']);
  /* 往上拖：D 放到 B 上 → 插到 B 之前；拖曳中半透明、目標上緣有色線 */
  await dragHandleTo(page, card(page, 3), card(page, 1), async () => {
    await expect(card(page, 3)).toHaveAttribute('data-dragging', 'true');
    await expect(card(page, 1).getByTestId('drop-line')).toBeVisible();
    expect(await card(page, 3).evaluate((el) => getComputedStyle(el).opacity)).toBe('0.48');
  });
  await expect.poll(() => cardTitles(page)).toEqual(['A', 'D', 'B', 'C']);
  await expect(status(page)).toHaveText('已調整卡片順序。');
  /* 往下拖：A 放到 B 上 → 插到 B 之前 */
  await dragHandleTo(page, card(page, 0), card(page, 2));
  await expect.poll(() => cardTitles(page)).toEqual(['D', 'A', 'B', 'C']);
  /* 從卡片的其他地方拖不動 */
  const body = (await bodyOf(card(page, 0)).boundingBox())!;
  const target = (await card(page, 3).boundingBox())!;
  await page.mouse.move(body.x + 10, body.y + 10);
  await page.mouse.down();
  await page.mouse.move(target.x + 20, target.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => cardTitles(page)).toEqual(['D', 'A', 'B', 'C']);
  /* 篩選中（場景：A、C）：C 拖到 A 上 → 全部的順序裡 C 在 A 之前 */
  await filterBtn(page, '◆ 場景').click();
  await expect.poll(() => cardTitles(page)).toEqual(['A', 'C']);
  await dragHandleTo(page, card(page, 1), card(page, 0));
  await expect.poll(() => cardTitles(page)).toEqual(['C', 'A']);
  await filterBtn(page, '全部').click();
  await expect.poll(() => cardTitles(page)).toEqual(['D', 'C', 'A', 'B']);
  /* 鍵盤：把手聚焦時 ↑／↓ 移動一格，焦點留在同一張的把手上 */
  await card(page, 1).locator('[data-drag-handle]').focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => cardTitles(page)).toEqual(['D', 'A', 'C', 'B']);
  await expect(card(page, 2).locator('[data-drag-handle]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => cardTitles(page)).toEqual(['D', 'A', 'B', 'C']);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => cardTitles(page)).toEqual(['D', 'A', 'C', 'B']);
  expect(errors).toEqual([]);
});

test('篩選（捲回頂端、被記住）與清單捲動鈕', async ({ page }) => {
  const errors = await open(page);
  /* 用讀入專案檔一次放 30 張卡片 */
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `c${i}`,
    type: i % 3 === 0 ? 'rule' : 'memo',
    title: `第 ${i + 1} 張`,
    body: '內文\n'.repeat(3),
  }));
  await projectMenu(page).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: /開啟專案檔/ }).click(),
  ]);
  await chooser.setFiles({
    name: 'many.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'trpg-toolkit-project',
        tool: 'scenario-cards',
        version: 1,
        savedAt: '',
        data: { name: '多', text: '', cards: many },
      }),
    ),
  });
  await expect(cards(page)).toHaveCount(30);
  const scrollTop = () => list(page).evaluate((el) => el.scrollTop);
  const client = await list(page).evaluate((el) => el.clientHeight);
  const step = Math.max(280, Math.floor(client * 1.25));
  await page.getByRole('button', { name: '往下捲動卡片清單' }).click();
  await expect.poll(scrollTop).toBe(step);
  await page.getByRole('button', { name: '往下捲動卡片清單' }).click();
  await expect.poll(scrollTop).toBe(step * 2);
  await page.getByRole('button', { name: '往上捲動卡片清單' }).click();
  await expect.poll(scrollTop).toBe(step);
  /* 篩選：只顯示該類型、捲回頂端 */
  await filterBtn(page, '※ 規則').click();
  await expect(cards(page)).toHaveCount(10);
  await expect(filterBtn(page, '※ 規則')).toHaveAttribute('aria-pressed', 'true');
  await expect(filterBtn(page, '全部')).toHaveAttribute('aria-pressed', 'false');
  expect(await scrollTop()).toBe(0);
  await filterBtn(page, '❖ HO4').click();
  await expect(cards(page)).toHaveCount(0);
  await expect(list(page)).toContainText('這個類型還沒有卡片。');
  await filterBtn(page, '※ 規則').click();
  await page.reload();
  await open(page, { goto: false });
  await expect(filterBtn(page, '※ 規則')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards(page)).toHaveCount(10);
  expect(errors).toEqual([]);
});

test('專案：存到瀏覽器、清單（繁中排序）、選了就讀取（可以復原）、依名稱讀取、刪除', async ({
  page,
}) => {
  const errors = await open(page);
  /* 名稱空白：提示並把游標移到名稱欄 */
  await btn(page, '存到瀏覽器').click();
  await expect(status(page)).toHaveText('請先輸入專案名稱。');
  await expect(projectName(page)).toBeFocused();
  await btn(page, '讀取').click();
  await expect(status(page)).toHaveText('請輸入要讀取的專案名稱。');

  await setSource(page, '霧港的內文');
  await addFilled(page, '▼ 探索地點', { title: '燈塔一樓', body: '麻繩' });
  await filterBtn(page, '▼ 探索地點').click();
  await pick(page, selectionType(page), '※ 規則');
  await projectName(page).fill('  霧港  ');
  await btn(page, '存到瀏覽器').click();
  await expect(status(page)).toHaveText('已存到瀏覽器：霧港');
  await expect(savedList(page)).toHaveText('霧港');
  /* 其他專案 */
  await filterBtn(page, '全部').click();
  await projectName(page).fill('abc');
  await setSource(page, 'abc 的內文');
  await btn(page, '存到瀏覽器').click();
  await projectName(page).fill('阿里山');
  await setSource(page, '阿里山的內文');
  await card(page, 0).getByRole('button', { name: '刪除' }).click();
  await btn(page, '存到瀏覽器').click();
  await savedList(page).click();
  await expect(page.getByRole('option')).toHaveText(['阿里山', '霧港', 'abc']);
  /* 選了就讀取：名稱、內文、卡片、篩選、類型選單 */
  await page.getByRole('option', { name: '霧港' }).click();
  await expect(status(page)).toHaveText('已讀取專案：霧港');
  await expect(projectName(page)).toHaveValue('霧港');
  await expect(source(page)).toHaveValue('霧港的內文');
  await expect(cards(page)).toHaveCount(1);
  await expect(titleOf(card(page, 0))).toHaveValue('燈塔一樓');
  await expect(filterBtn(page, '▼ 探索地點')).toHaveAttribute('aria-pressed', 'true');
  await expect(selectionType(page)).toHaveText('※ 規則');
  /* 可以復原（狀態列） */
  await statusBox(page).getByRole('button', { name: '復原' }).click();
  await expect(source(page)).toHaveValue('阿里山的內文');
  await expect(cards(page)).toHaveCount(0);
  /* 依名稱讀取 */
  await projectName(page).fill('abc');
  await btn(page, '讀取').click();
  await expect(source(page)).toHaveValue('abc 的內文');
  await expect(status(page)).toHaveText('已讀取專案：abc');
  await projectName(page).fill('不存在');
  await btn(page, '讀取').click();
  await expect(status(page)).toHaveText('瀏覽器裡沒有「不存在」這個專案。');
  /* 同名覆蓋 */
  await projectName(page).fill('abc');
  await setSource(page, 'abc 第二版');
  await btn(page, '存到瀏覽器').click();
  await setSource(page, '暫時');
  await btn(page, '讀取').click();
  await expect(source(page)).toHaveValue('abc 第二版');
  /* 刪除：先確認 */
  await expect(savedList(page)).toHaveText('abc');
  await btn(page, '刪除選取的已存專案').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('從瀏覽器刪除「abc」？');
  await dialog.getByRole('button', { name: '刪除' }).click();
  await expect(status(page)).toHaveText('已從瀏覽器刪除「abc」。');
  await expect(savedList(page)).toHaveText('選擇已存的專案…');
  await savedList(page).click();
  await expect(page.getByRole('option')).toHaveText(['阿里山', '霧港']);
  await page.keyboard.press('Escape');
  /* 重新整理後清單還在 */
  await page.reload();
  await open(page, { goto: false });
  await savedList(page).click();
  await expect(page.getByRole('option')).toHaveText(['阿里山', '霧港']);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('匯出專案檔（解析下載的 JSON、檔名規則）、讀入專案檔（驗證、錯誤）', async ({ page }) => {
  const errors = await open(page);
  await setSource(page, STORY);
  await addFilled(page, '● 技能成功', { title: '偵查', extra: '腳印', body: '泥地' });
  await filterBtn(page, '● 技能成功').click();
  await projectName(page).fill(' 霧港:第一章/前篇? ');
  await projectMenu(page).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('霧港_第一章_前篇_.json');
  await expect(status(page)).toHaveText('已匯出專案檔：霧港_第一章_前篇_.json');
  const json = readFileSync((await dl.path()) as string, 'utf8');
  const project = JSON.parse(json);
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'scenario-cards',
    version: 1,
  });
  expect(project.data).toMatchObject({
    name: '霧港:第一章/前篇?',
    text: STORY,
    filter: 'skill',
    newType: 'skill',
    selectionType: 'scene',
  });
  expect(project.data.cards).toEqual([
    { id: expect.any(String), type: 'skill', title: '偵查', extra: '腳印', body: '泥地' },
  ]);
  /* 名稱空白時用預設檔名 */
  await projectName(page).fill('');
  await projectMenu(page).click();
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(dl2.suggestedFilename()).toBe('劇本資訊卡片.json');

  const openFile = async (name: string, content: string) => {
    await projectMenu(page).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: /開啟專案檔/ }).click(),
    ]);
    await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
  };
  /* 清空後讀回 */
  await projectMenu(page).click();
  await page.getByRole('menuitem', { name: /清空全部/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
  await expect(source(page)).toHaveValue('');
  await expect(cards(page)).toHaveCount(0);
  await openFile('a.json', json);
  await expect(status(page)).toHaveText('已讀入專案檔：a.json');
  await expect(source(page)).toHaveValue(STORY);
  await expect(projectName(page)).toHaveValue('霧港:第一章/前篇?');
  await expect(cards(page)).toHaveCount(1);
  await expect(extraOf(card(page, 0))).toHaveValue('腳印');
  await expect(filterBtn(page, '● 技能成功')).toHaveAttribute('aria-pressed', 'true');
  /* 不是本工具的檔案：不套用（舊版任何 JSON 都會清空） */
  await openFile('b.json', '[]');
  await expect(status(page)).toHaveText(/無法讀入專案檔/);
  await expect(statusBox(page)).toHaveAttribute('data-tone', 'danger');
  await openFile('c.json', '{ 壞掉');
  await expect(status(page)).toHaveText(/無法讀入專案檔：這不是有效的專案檔/);
  await openFile(
    'd.json',
    JSON.stringify({ format: 'trpg-toolkit-project', tool: 'textbox', version: 1, data: {} }),
  );
  await expect(status(page)).toHaveText(/其他工具/);
  await openFile(
    'e.json',
    JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-cards',
      version: 1,
      data: [],
    }),
  );
  await expect(status(page)).toHaveText('無法讀入專案檔：檔案裡沒有劇本資訊卡片的資料。');
  await expect(source(page)).toHaveValue(STORY);
  await expect(cards(page)).toHaveCount(1);
  /* 類型認不得變成備忘、缺少的欄位補空白、名稱沒有時保留目前的 */
  await openFile(
    'f.json',
    JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-cards',
      version: 1,
      data: { text: '新', cards: [{ type: 'xx', title: '舊卡' }], filter: 'nope', newType: 'bad' },
    }),
  );
  await expect(projectName(page)).toHaveValue('霧港:第一章/前篇?');
  await expect(source(page)).toHaveValue('新');
  await expect(card(page, 0).getByTestId('card-header')).toHaveText('・ 備忘');
  await expect(bodyOf(card(page, 0))).toHaveValue('');
  await expect(filterBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
  await expect(newType(page)).toHaveText('● 技能成功');
  expect(errors).toEqual([]);
});

test('自動存檔：重新整理後還原；存檔損壞時用空白開始', async ({ page }) => {
  const errors = await open(page);
  await setSource(page, STORY);
  await projectName(page).fill('霧港');
  await addFilled(page, '◎ HO1', { title: '你是老溫的姪子', body: '信' });
  await pick(page, newType(page), '◈ 道具');
  await pick(page, selectionType(page), '■ 資料');
  await filterBtn(page, '◎ HO1').click();
  await page.reload();
  await open(page, { goto: false });
  await expect(source(page)).toHaveValue(STORY);
  await expect(projectName(page)).toHaveValue('霧港');
  await expect(cards(page)).toHaveCount(1);
  await expect(titleOf(card(page, 0))).toHaveValue('你是老溫的姪子');
  await expect(newType(page)).toHaveText('◈ 道具');
  await expect(selectionType(page)).toHaveText('■ 資料');
  await expect(filterBtn(page, '◎ HO1')).toHaveAttribute('aria-pressed', 'true');
  /* 損壞：丟棄 */
  await page.evaluate(() => {
    localStorage.setItem('trpg-toolkit:scenario-cards', '{ 壞掉');
    localStorage.setItem(
      'trpg-toolkit:scenario-cards:preview',
      JSON.stringify({ state: { data: 3 } }),
    );
  });
  await page.reload();
  await open(page, { goto: false });
  await expect(source(page)).toHaveValue('');
  await expect(cards(page)).toHaveCount(0);
  await expect(filterBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
  await expect(newType(page)).toHaveText('◆ 場景');
  /* 部分欄位錯誤：整理後使用 */
  await page.evaluate(() => {
    localStorage.setItem(
      'trpg-toolkit:scenario-cards',
      JSON.stringify({
        state: { data: { name: '殘', text: 5, cards: [{ id: 'a', type: 'nope', title: 'X' }] } },
        version: 1,
      }),
    );
  });
  await page.reload();
  await open(page, { goto: false });
  await expect(projectName(page)).toHaveValue('殘');
  await expect(source(page)).toHaveValue('5');
  await expect(card(page, 0).getByTestId('card-header')).toHaveText('・ 備忘');
  expect(errors).toEqual([]);
});

test('卡片內文欄：至少 4 行、自動長到 6 行，超過出現捲軸', async ({ page }) => {
  const errors = await open(page);
  const c = await addFilled(page, '◆ 場景', { title: '高度' });
  const metrics = () =>
    bodyOf(c).evaluate((el: HTMLTextAreaElement) => {
      const cs = getComputedStyle(el);
      const px = (v: string) => Number.parseFloat(v);
      const lh = px(cs.lineHeight);
      const extra =
        px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
      return { lines: (el.offsetHeight - extra) / lh, overflow: cs.overflowY };
    });
  let m = await metrics();
  expect(m.lines).toBeCloseTo(4, 0);
  await bodyOf(c).fill('1\n2\n3\n4\n5');
  m = await metrics();
  expect(m.lines).toBeCloseTo(5, 0);
  expect(m.overflow).toBe('hidden');
  await bodyOf(c).fill(Array.from({ length: 20 }, (_, i) => i).join('\n'));
  m = await metrics();
  expect(m.lines).toBeCloseTo(6, 0);
  expect(m.overflow).toBe('auto');
  await bodyOf(c).fill('短');
  m = await metrics();
  expect(m.lines).toBeCloseTo(4, 0);
  expect(errors).toEqual([]);
});

test.describe('視覺回歸', () => {
  async function prepare(page: Page) {
    await page.clock.setFixedTime(new Date('2026-10-01T10:00:00+08:00'));
    const errors = await open(page);
    await setSource(page, STORY);
    await projectName(page).fill('霧港的燈塔');
    await pick(page, selectionType(page), '▼ 探索地點');
    await select(page, 72, 118);
    await btn(page, '用選取的內容建立卡片').click();
    await pick(page, selectionType(page), '● 技能成功');
    await select(page, 160, 187);
    await page.keyboard.press('c');
    await pick(page, selectionType(page), '〓 HO2');
    await select(page, 120, 158);
    await page.keyboard.press('c');
    await titleOf(card(page, 1)).fill('偵查');
    await list(page).evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.getByRole('heading', { level: 1 }).click();
    await page.mouse.move(0, 0);
    await expect(status(page)).toHaveText('', { timeout: 8000 });
    return errors;
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await prepare(page);
    await expect(page).toHaveScreenshot('scenario-cards-1280.png', { fullPage: true });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('scenario-cards-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
