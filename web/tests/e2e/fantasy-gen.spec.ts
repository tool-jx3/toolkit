/**
 * 奇幻隨機產生器（建置產物 next/fantasy-gen/）的端對端測試：
 * - 開頁沒有錯誤、頁尾的靈感來源、自動產生 10 筆 NPC（名字的語料用到才載入）；
 * - 選產生器與條件（改了就換一批）、數量、種子重現；
 * - 一欄的選單：重抽這一欄（其他欄不變）、鎖定這一欄（整張重抽時留著）；鎖住整張（再產生時留著）；
 * - 複製（文字、CCFOLIA 棋子）、全部複製、匯出 TXT／CSV；
 * - 我的清單、自動儲存、復原；專案檔存讀往返；紀錄放回；
 * - 自訂產生器（範例、檢查、產生）；
 * - 390 寬沒有橫向捲動、窄畫面的產生器下拉選單；1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('fantasy-gen') ?? { id: 'fantasy-gen', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '奇幻隨機產生器' })).toBeVisible();
  await expect(cards(page)).toHaveCount(10);
  return errors;
}

const cards = (page: Page) => page.getByTestId('result-card');
const texts = (page: Page) => page.getByTestId('result-text').allInnerTexts();
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const picker = (page: Page, name: string) =>
  page.getByTestId('generator-picker').getByRole('button', { name, exact: true });
const field = (page: Page, card: number, label: string) =>
  cards(page).nth(card).locator(`[data-field="${label}"]`).first();

async function setSeed(page: Page, seed: string) {
  const input = page.getByLabel('種子', { exact: true });
  if (!(await input.isVisible())) await btn(page, '種子（重現同一批）').click();
  await input.fill(seed);
}

/** 產生一批，等結果換掉 */
async function generate(page: Page) {
  const before = (await texts(page)).join('\n');
  await btn(page, '產生').click();
  await expect.poll(async () => (await texts(page)).join('\n')).not.toBe(before);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test('開頁：沒有錯誤、靈感來源、自動產生 10 筆 NPC；名字的語料用到才載入', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => {
    if (/inknomu-fantasy-[\w-]+\.js$/.test(r.url())) requested.push(r.url());
  });
  const errors = await open(page);
  expect(requested).toHaveLength(1);
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: 'Sly Flourish／Lazy GM Tools' })).toHaveAttribute(
    'href',
    'https://github.com/mshea/lazy_gm_tools',
  );
  /* NPC 的一筆：「名字——個性的種族身分，特徵，穿著…，想要…。」，七個欄 */
  const first = (await texts(page))[0];
  expect(first).toMatch(/^.+——.+的.+，.+，穿著.+，想要.+。$/);
  await expect(cards(page).first().locator('[data-field]')).toHaveCount(7);
  /* 關於規則內容：四份 CC BY 4.0 的署名文（照原文） */
  await btn(page, '關於規則內容與授權').click();
  await expect(page.getByTestId('attribution')).toHaveCount(4);
  await expect(page.getByTestId('about-rules')).toContainText(
    'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC',
  );
  expect(errors).toEqual([]);
});

test('名字的語料讀不到：先寫「（無名氏）」；重新整理讀到後只補上名字', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  let block = true;
  await page.route(/inknomu-fantasy-[\w-]+\.js$/, (route) =>
    block ? route.abort() : route.continue(),
  );
  await page.goto(URL);
  await expect(cards(page)).toHaveCount(10);
  await expect(page.getByText(/名字的資料讀不到/)).toBeVisible();
  const before = await texts(page);
  expect(before.every((t) => t.startsWith('（無名氏）——'))).toBe(true);
  /* 同一頁裡失敗過的動態載入不會重新下載（瀏覽器記住失敗），所以「重新整理」是整頁重新整理；開頁時補上名字 */
  block = false;
  await btn(page, '重新整理').click();
  await expect(cards(page)).toHaveCount(10);
  await expect
    .poll(async () => (await texts(page)).some((t) => t.startsWith('（無名氏）')))
    .toBe(false);
  await expect(page.getByText(/名字的資料讀不到/)).toBeHidden();
  /* 名字以外的欄不變 */
  const after = await texts(page);
  expect(after.map((t) => t.replace(/^.+?——/, ''))).toEqual(
    before.map((t) => t.replace(/^.+?——/, '')),
  );
  expect(errors).toEqual([]);
});

test('選產生器與條件：改了就換一批；數量；種子重現', async ({ page }) => {
  const errors = await open(page);
  await picker(page, '陷阱').click();
  await expect(picker(page, '陷阱')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards(page)).toHaveCount(10);
  expect((await texts(page))[0]).toMatch(/觸發條件是.+。$/);

  /* 地名：原作是 20 筆；英文的寫法 */
  await picker(page, '地名').click();
  await expect(cards(page)).toHaveCount(20);
  /* 一行的短結果：按鈕和字排在同一行 */
  await expect(cards(page).first()).toHaveAttribute('data-compact', 'true');
  await page.getByRole('radio', { name: '英文（原作）' }).click();
  await expect.poll(async () => (await texts(page))[0]).toMatch(/^[A-Z][a-z]+ [a-z]+$/);

  /* 寶藏：一筆、依角色等級；17 級以上的錢幣是幾萬 GP */
  await picker(page, '寶藏（Lazy 5e）').click();
  await expect(cards(page)).toHaveCount(1);
  expect((await texts(page))[0].split('\n')[0]).toMatch(/^錢幣：[\d,]+ CP、[\d,]+ SP、[\d,]+ GP$/);
  await page.getByRole('radio', { name: '17 級以上' }).click();
  await expect
    .poll(async () => (await texts(page))[0].split('\n')[0])
    .toMatch(/^錢幣：[\d,]{6,} GP、/);
  await page.getByRole('radio', { name: '不要遺物' }).click();
  await expect.poll(async () => (await texts(page))[0]).not.toContain('遺物：');

  /* 數量 */
  await picker(page, '法術捲軸').click();
  const count = page.getByRole('spinbutton', { name: '數量', exact: true });
  await count.fill('4');
  await count.press('Enter');
  await expect(cards(page)).toHaveCount(4);
  expect((await texts(page))[0]).toMatch(
    /^法術捲軸（Spell Scroll）：「.+（.+）」（.+，DC \d+，法術攻擊 \+\d+，[\d,]+ GP）$/,
  );

  /* 種子：同一個種子同一批；空白時顯示用過的種子，可以填回去 */
  await setSeed(page, 'abc');
  await generate(page);
  const once = await texts(page);
  await btn(page, '產生').click();
  await expect(page.getByTestId('last-seed')).toHaveText('這一批的種子：abc');
  expect(await texts(page)).toEqual(once);
  await setSeed(page, '');
  await generate(page);
  const last = (await page.getByTestId('last-seed').innerText()).replace('這一批的種子：', '');
  const random = await texts(page);
  await btn(page, '填入這個種子').click();
  await btn(page, '產生').click();
  await expect.poll(() => texts(page)).toEqual(random);
  await expect(page.getByLabel('種子', { exact: true })).toHaveValue(last);
  expect(errors).toEqual([]);
});

test('一欄：重抽這一欄（其他欄不變）、鎖定這一欄；鎖住整張；復原', async ({ page }) => {
  const errors = await open(page);
  await setSeed(page, 'field');
  await generate(page);
  const fieldsOf = (i: number) =>
    cards(page)
      .nth(i)
      .locator('[data-field]')
      .evaluateAll((els) => els.map((e) => `${e.getAttribute('data-field')}=${e.textContent}`));
  const before = await fieldsOf(0);

  /* 重抽「目標」：只有目標換了（換到一樣的機會很小，種子固定） */
  await field(page, 0, '目標').click();
  await page.getByRole('menuitem', { name: '重抽「目標」' }).click();
  await expect.poll(() => fieldsOf(0)).not.toEqual(before);
  const after = await fieldsOf(0);
  expect(after.filter((f) => !f.startsWith('目標='))).toEqual(
    before.filter((f) => !f.startsWith('目標=')),
  );
  /* 選單關掉後焦點回到那一欄 */
  await expect(field(page, 0, '目標')).toBeFocused();

  /* 鎖定「名字」→ 整張重抽時名字留著，其他換掉 */
  await field(page, 0, '名字').click();
  await page.getByRole('menuitem', { name: '鎖定「名字」' }).click();
  await expect(field(page, 0, '名字')).toHaveAttribute('data-locked', 'true');
  const name = await field(page, 0, '名字').textContent();
  await btn(page, '重抽第 1 筆（鎖定的欄留著）').click();
  await expect.poll(() => fieldsOf(0)).not.toEqual(after);
  expect(await field(page, 0, '名字').textContent()).toBe(name);

  /* 鍵盤：Enter 打開選單 */
  await field(page, 1, '個性').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: '重抽「個性」' })).toBeFocused();
  await page.keyboard.press('Escape');

  /* 鎖住第 2 張 → 再產生時留在原位 */
  const second = (await texts(page))[1];
  await btn(page, '鎖定第 2 筆').click();
  await expect(cards(page).nth(1)).toHaveAttribute('data-locked', 'true');
  await setSeed(page, 'other');
  await generate(page);
  expect((await texts(page))[1]).toBe(second);
  await expect(page.getByTestId('results-summary')).toHaveText('10 筆（鎖定 1 筆）');

  /* 復原：回到產生之前的那一批 */
  const now = await texts(page);
  await page.keyboard.press('Control+z');
  await expect.poll(() => texts(page)).not.toEqual(now);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => texts(page)).toEqual(now);
  expect(errors).toEqual([]);
});

test.describe('複製與匯出', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('複製一筆、一欄、全部；CCFOLIA 棋子；匯出 TXT／CSV', async ({ page }) => {
    const errors = await open(page);
    const all = await texts(page);
    await btn(page, '複製第 3 筆').click();
    await expect.poll(() => clipboard(page)).toBe(all[2]);
    await btn(page, '全部複製').click();
    await expect.poll(() => clipboard(page)).toBe(all.join('\n'));
    await field(page, 0, '種族').click();
    await page.getByRole('menuitem', { name: '複製「種族」' }).click();
    await expect.poll(() => clipboard(page)).toBe(await field(page, 0, '種族').textContent());

    /* CCFOLIA 棋子：名稱是 NPC 的名字，全文在備註 */
    await btn(page, '第 1 筆的其他動作').click();
    await page.getByTestId('card-ccfolia').click();
    await expect.poll(() => clipboard(page)).toContain('"kind": "character"');
    const json = JSON.parse(await clipboard(page));
    expect(json.data.name).toBe(await field(page, 0, '名字').textContent());
    expect(json.data.memo).toBe(all[0]);

    const [txt] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await btn(page, '匯出').click();
        await page.getByRole('menuitem', { name: /文字檔/ }).click();
      })(),
    ]);
    expect(txt.suggestedFilename()).toMatch(/^奇幻隨機產生器_NPC_\d{8}-\d{4}\.txt$/);
    expect(readFileSync((await txt.path()) as string, 'utf8')).toBe(all.join('\n'));
    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await btn(page, '匯出').click();
        await page.getByRole('menuitem', { name: /試算表/ }).click();
      })(),
    ]);
    const lines = readFileSync((await csv.path()) as string, 'utf8')
      .replace(/^﻿/, '')
      .split('\r\n');
    expect(lines[0]).toBe('產生器,全文,名字,個性,種族,身分,特徵,穿著,目標');
    expect(lines.filter(Boolean)).toHaveLength(11);
    expect(errors).toEqual([]);
  });
});

test('我的清單、自動儲存；專案檔存讀往返；紀錄放回', async ({ page }) => {
  const errors = await open(page);
  const all = await texts(page);
  await btn(page, '第 2 筆的其他動作').click();
  await page.getByTestId('card-save').click();
  await expect(page.getByTestId('saved-item')).toHaveCount(1);
  await expect(page.getByTestId('saved-item')).toContainText(all[1].slice(0, 10));

  /* 重新整理：結果與清單都還在 */
  await page.reload();
  await expect(cards(page)).toHaveCount(10);
  expect(await texts(page)).toEqual(all);
  await expect(page.getByTestId('saved-item')).toHaveCount(1);

  /* 專案檔 */
  await btn(page, '專案').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const projectPath = (await dl.path()) as string;
  const project = JSON.parse(readFileSync(projectPath, 'utf8'));
  expect(project.tool).toBe('fantasy-gen');
  expect(project.data.saved).toHaveLength(1);
  expect(project.data.results).toHaveLength(10);

  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(page.getByTestId('saved-item')).toHaveCount(0);
  await expect.poll(() => texts(page)).not.toEqual(all);

  await btn(page, '專案').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles(projectPath);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect(page.getByTestId('saved-item')).toHaveCount(1);
  await expect.poll(() => texts(page)).toEqual(all);

  /* 紀錄：放回上一批 */
  await generate(page);
  const latest = await texts(page);
  await btn(page, '最近產生的紀錄').click();
  await expect(page.getByTestId('history-entry').first()).toBeVisible();
  await page.getByTestId('history-entry').nth(1).getByRole('button', { name: /^放回/ }).click();
  await expect.poll(() => texts(page)).not.toEqual(latest);
  expect(errors).toEqual([]);
});

test('自訂產生器：範例、檢查、產生；刪除', async ({ page }) => {
  const errors = await open(page);
  await btn(page, '新增產生器').click();
  await expect(picker(page, '我的產生器 1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('custom-check')).toContainText('4 個表、2 種範本，可以產生。');
  await expect(cards(page)).toHaveCount(10);
  expect((await texts(page)).join('\n')).not.toMatch(/[{}]/);

  const text = page.getByLabel('表的內容', { exact: true });
  await text.fill('範本\n  {@顏色:色}的{@動物:{動物}}\n色\n  紅\n  藍\n');
  await expect(page.getByTestId('custom-check')).toContainText('範本參照的表「動物」不存在。');
  await text.fill('範本\n  {@顏色:{色}}的{@動物:{動物}}\n色\n  紅\n  藍 ^3\n動物\n  貓\n');
  await expect(page.getByTestId('custom-check')).toContainText('2 個表、1 種範本，可以產生。');
  await btn(page, '產生').click();
  await expect.poll(async () => (await texts(page))[0]).toMatch(/^(紅|藍)的貓$/);
  await field(page, 0, '顏色').click();
  await expect(page.getByRole('menuitem', { name: '重抽「顏色」' })).toBeVisible();
  await page.keyboard.press('Escape');

  /* 範本最上層的 \n 換行 */
  await text.fill('範本\n  第一行\\n第二行{@動物:{動物}}\n動物\n  貓\n');
  await btn(page, '產生').click();
  /* innerText 在兩個段落之間是兩個換行 */
  await expect
    .poll(async () => (await texts(page))[0].replace(/\n+/g, '\n'))
    .toBe('第一行\n第二行貓');

  await btn(page, '刪除這個產生器').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(picker(page, 'NPC')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test.describe('窄畫面', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('390 寬：沒有橫向捲動；產生器的下拉選單；視覺基準', async ({ page }) => {
    const errors = await open(page);
    await setSeed(page, 'shot');
    await generate(page);
    await noHorizontalScroll(page);
    await page.getByRole('combobox', { name: '產生器' }).click();
    await page.getByRole('option', { name: '委託', exact: true }).click();
    await expect(page.getByTestId('conditions-summary')).toContainText('委託');
    await expect.poll(async () => (await texts(page))[0]).toMatch(/希望角色們到.+盤據。$/);
    await noHorizontalScroll(page);
    await page.getByRole('combobox', { name: '產生器' }).click();
    await page.getByRole('option', { name: '寶藏（SRD 5.2）' }).click();
    await expect(cards(page)).toHaveCount(1);
    await noHorizontalScroll(page);
    await page.getByRole('combobox', { name: '產生器' }).click();
    await page.getByRole('option', { name: 'NPC', exact: true }).click();
    await expect(cards(page)).toHaveCount(10);
    await page.getByLabel('種子', { exact: true }).blur();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('fantasy-gen-390.png', {
      mask: [page.getByTestId('history-entry')],
    });
    expect(errors).toEqual([]);
  });
});

test('1280 寬：視覺基準（種子 shot 的一批固定）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await open(page);
  await setSeed(page, 'shot');
  await generate(page);
  /* 同一份資料、同一個種子，建置之間也不會變（資料或抽法改了才要更新） */
  expect((await texts(page))[0]).toBe(
    'Marlow Coldwater——慢條斯理的人類燒炭工，留著一條灰白的長辮子，穿著一件內外穿反的斗篷，想要保住村子的土地。',
  );
  await btn(page, '鎖定第 2 筆').click();
  await field(page, 0, '穿著').click();
  await page.getByRole('menuitem', { name: '鎖定「穿著」' }).click();
  await page.getByLabel('種子', { exact: true }).blur();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('fantasy-gen-1280.png', {
    mask: [page.getByTestId('history-entry')],
  });
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
