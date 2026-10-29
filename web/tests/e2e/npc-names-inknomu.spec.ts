/**
 * NPC 名字產生器：弄墨 Inknomu 的考據語料（2026-10 導入）、輸出（全名／只有名／只有姓）與查名字的端對端測試。
 * - 8 個地區、年代分兩組（依真實人數／考據語料）、語料用到才載入（依地區分檔）；
 * - 中性、階級、國家只在有標記的包出現；涵義與原文／拼音的顯示、複製附讀音；「關於這份語料」與出處；
 * - CSV 的新欄位；2026-10 以前的存檔照常讀入；輸出；查名字（正規化、開頭優先、篩選停用、跨年代、讀音）；
 * - 390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('npc-names') ?? { id: 'npc-names', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: 'NPC 名字產生器' })).toBeVisible();
  await expect(cards(page)).toHaveCount(10);
  return errors;
}

const cards = (page: Page) => page.getByTestId('name-card');
const nameTexts = (page: Page) => page.getByTestId('name-text').allInnerTexts();
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const eraBox = (page: Page) => page.getByRole('combobox', { name: /^(年代|種族|年代與分類)$/ });
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const conditions = (page: Page) => page.locator('#npc-names-conditions');

async function pickEra(page: Page, label: string) {
  await eraBox(page).click();
  await page.getByRole('option', { name: new RegExp(`^${escapeRe(label)}`) }).click();
  await expect(eraBox(page)).toHaveText(label);
}

/** 換條件後等名字換掉 */
async function changed(page: Page, before: string[]) {
  await expect.poll(async () => (await nameTexts(page)).join('\n')).not.toBe(before.join('\n'));
}

async function setSeed(page: Page, seed: string) {
  const field = page.getByLabel('種子', { exact: true });
  if (!(await field.isVisible())) await btn(page, '種子').click();
  await field.fill(seed);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test('8 個地區；年代分兩組；考據語料用到才載入那個地區的檔；卡片附涵義；關於這份語料與出處', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (r) => {
    const m = /(names|inknomu)-(jp|tw|us|kr|uk|ru|nordic|fantasy)-[\w-]+\.js$/.exec(r.url());
    if (m) requested.push(`${m[1]}-${m[2]}`);
  });
  const errors = await open(page);
  for (const r of ['日本', '台灣', '韓國', '英國', '美國', '俄羅斯', '北歐', '奇幻'])
    await expect(radio(page, r)).toBeVisible();
  expect(requested).toEqual(['names-jp']);
  /* 日本：9 個選項分兩組 */
  await eraBox(page).click();
  const listbox = page.getByRole('listbox');
  await expect(listbox.getByText('依真實人數', { exact: true })).toBeVisible();
  await expect(
    listbox.getByText('考據語料（弄墨 Inknomu，附涵義）', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(9);
  await page.keyboard.press('Escape');
  /* 沒有選語料時沒有「關於這份語料」 */
  await expect(btn(page, '關於這份語料')).toHaveCount(0);

  const before = await nameTexts(page);
  await pickEra(page, '江戶時代（1603–1868）');
  await changed(page, before);
  await expect.poll(() => requested).toEqual(['names-jp', 'inknomu-jp']);
  await expect(
    page.getByText('武家的通稱與町人、百姓的名字（平民的姓是屋號）', { exact: true }),
  ).toBeVisible();
  /* 卡片：全名、三種讀音、涵義（姓：…／名：…） */
  const first = cards(page).first();
  await expect(first.getByTestId('name-meaning')).toContainText(/^姓：/);
  await expect(first.getByTestId('name-meaning').locator('p').nth(1)).toHaveText(/^名：/);
  const lines = (await first.getByRole('button').first().innerText()).split('\n');
  expect(lines).toHaveLength(4);
  expect(lines[1]).toMatch(/^[ぁ-ゖ]+ [ぁ-ゖ]+(／[ぁ-ゖ]+)?$/);

  /* 關於這份語料：說明、來源與考據、出處連到原站的日本頁與授權 */
  await btn(page, '關於這份語料').click();
  const about = page.getByTestId('corpus-about');
  await expect(about).toContainText('江戶的名字由苗字、通稱和實名三層構成');
  await expect(about).toContainText('來源與考據');
  const credit = page.getByTestId('corpus-credit');
  await expect(credit).toHaveText(
    '語料：弄墨 Inknomu《角色姓名產生器》（CC BY 4.0），本站改寫格式',
  );
  await expect(
    credit.getByRole('link', { name: '弄墨 Inknomu《角色姓名產生器》' }),
  ).toHaveAttribute('href', 'https://inknomu.com/namegen/jp');
  await expect(credit.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
  /* 資料來源：照原站分組、各組標筆數，連結另開分頁 */
  const groups = page.getByTestId('corpus-source-group');
  await expect(groups).toHaveCount(3);
  expect((await groups.locator('> p').allInnerTexts()).map((t) => t.trim())).toEqual([
    '政府和研究機構（4 筆）',
    '網站（6 筆）',
    '書籍（4 筆）',
  ]);
  await expect(groups.nth(1).locator('li')).toHaveCount(6);
  const link = groups.nth(1).getByRole('link', { name: '「華族」' });
  await expect(link).toHaveAttribute('href', 'https://ja.wikipedia.org/wiki/%E8%8F%AF%E6%97%8F');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(groups.nth(2).getByRole('link')).toHaveCount(0);
  /* 頁尾沒有靈感來源；說明對話框的來源有 Inknomu */
  await expect(page.getByText(/靈感來源/)).toHaveCount(0);
  await page.getByRole('button', { name: '說明' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    '弄墨 Inknomu《角色姓名產生器》（CC BY 4.0）',
  );
  await page.keyboard.press('Escape');

  /* 英國：名在前，涵義先「名：」再「姓：」 */
  await radio(page, '英國').click();
  await expect.poll(async () => (await nameTexts(page))[0]).toMatch(/^[A-Z]/);
  const ukLines = cards(page).first().getByTestId('name-meaning').locator('p');
  await expect(ukLines.nth(0)).toHaveText(/^名：/);
  await expect(ukLines.nth(1)).toHaveText(/^姓：/);
  /* 英國的資料來源（5 組） */
  await expect(page.getByTestId('corpus-source-group')).toHaveCount(5);

  /* 奇幻：欄名是「種族」；美國：「年代與分類」 */
  await radio(page, '奇幻').click();
  await expect(page.getByRole('combobox', { name: '種族', exact: true })).toHaveText('人類');
  await expect.poll(() => requested).toContain('inknomu-fantasy');
  await radio(page, '美國').click();
  await expect(page.getByRole('combobox', { name: '年代與分類', exact: true })).toHaveText(
    '1920 年代',
  );
  await pickEra(page, '拉美裔（西班牙語系命名傳統）');
  await btn(page, '關於這份語料').click({ trial: true });
  await expect(page.getByTestId('corpus-about')).toContainText('雙姓：');
  await expect(page.getByTestId('corpus-about')).toContainText('這裡產生的名字只有一個姓。');
  expect(requested.filter((r) => r === 'inknomu-jp')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('中性、階級、國家只在有標記的包出現；性別標記「中性」', async ({ page }) => {
  const errors = await open(page);
  const field = (label: string) => conditions(page).getByText(label, { exact: true });
  /* 依人數的名單：沒有中性、階級、國家 */
  await expect(radio(page, '中性')).toHaveCount(0);
  await expect(field('階級')).toBeHidden();
  await expect(field('國家')).toBeHidden();

  await radio(page, '英國').click();
  await pickEra(page, '現代（1990–今）');
  await expect(field('階級')).toBeVisible();
  await expect(field('國家')).toBeHidden();
  const before = await nameTexts(page);
  await radio(page, '中性').click();
  await changed(page, before);
  await expect(cards(page).getByText('中性', { exact: true })).toHaveCount(10);
  await radio(page, '貴族').click();
  await expect(radio(page, '貴族')).toHaveAttribute('aria-checked', 'true');

  /* 俄羅斯沒有中性名：當作不限（記住的中性不變，回到英國時還是中性） */
  await radio(page, '俄羅斯').click();
  await expect(radio(page, '中性')).toHaveCount(0);
  await expect(radio(page, '不限')).toHaveAttribute('aria-checked', 'true');
  await expect(field('階級')).toBeHidden();
  await radio(page, '英國').click();
  await expect(radio(page, '中性')).toHaveAttribute('aria-checked', 'true');
  await radio(page, '俄羅斯').click();
  /* 俄羅斯：女性用姓的女性形，備註有暱稱與姓的另一形；原文一行是西里爾字母 */
  await radio(page, '女').click();
  await expect
    .poll(async () => (await cards(page).getByText('女', { exact: true }).count()) === 10)
    .toBe(true);
  await expect(cards(page).first().getByTestId('name-meaning')).toContainText('姓氏男性形 ');
  await expect(cards(page).first().getByRole('button').first()).toContainText(/[А-Яа-яЁё]/);

  /* 北歐：維京沒有國家；現代有國家，選瑞典 */
  await radio(page, '北歐').click();
  await expect(eraBox(page)).toHaveText('維京時代（793–1066）');
  await expect(field('國家')).toBeHidden();
  await expect
    .poll(async () => (await nameTexts(page)).every((t) => /(son|dóttir)( |$)/.test(t)))
    .toBe(true);
  /* 維京：「名：…」「父名：…之子（維京時代無姓氏，以父名＋後綴構成）」 */
  const vLines = cards(page).first().getByTestId('name-meaning').locator('p');
  await expect(vLines.nth(0)).toHaveText(/^名：/);
  await expect(vLines.nth(1)).toHaveText(
    /^父名：\S+ 之(子|女)（維京時代無姓氏，以父名＋後綴構成）$/,
  );
  await pickEra(page, '現代（1990–今）');
  await expect(field('國家')).toBeVisible();
  await radio(page, '瑞典').click();
  await expect(radio(page, '瑞典')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('history-entry').first()).toContainText(
    '北歐・現代（1990–今）・瑞典',
  );
  /* 階級記在所有地區共用的設定：回到英國時還是貴族 */
  await radio(page, '英國').click();
  await expect(radio(page, '貴族')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test.describe('顯示與複製', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('原文／拼音一行（開關）、顯示涵義（開關）；複製附讀音時附上原文／拼音，涵義不附', async ({
    page,
  }) => {
    const errors = await open(page);
    await setSeed(page, 'kr');
    await radio(page, '韓國').click();
    await expect.poll(async () => (await nameTexts(page))[0]).toMatch(/^\p{sc=Hangul}+$/u);
    const card = cards(page).first();
    const lines = (await card.getByRole('button').first().innerText()).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^[A-Z][a-z]* [A-Z][a-z-]*$/);
    await expect(card.getByTestId('name-meaning')).toBeVisible();

    await page.getByRole('checkbox', { name: '原文／拼音' }).click();
    expect((await card.getByRole('button').first().innerText()).split('\n')).toHaveLength(1);
    await page.getByRole('checkbox', { name: '原文／拼音' }).click();
    await page.getByRole('switch', { name: '顯示涵義' }).click();
    await expect(page.getByTestId('name-meaning')).toHaveCount(0);
    await page.getByRole('switch', { name: '顯示涵義' }).click();
    await expect(page.getByTestId('name-meaning')).toHaveCount(10);

    await page.getByRole('switch', { name: '複製時附上讀音' }).click();
    const text = lines[0];
    await btn(page, `複製「${text}」`).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${text}（${lines[1]}）`,
    );
    expect(errors).toEqual([]);
  });
});

async function download(page: Page, item: string) {
  await btn(page, '匯出').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: new RegExp(`^${item}`) }).click(),
  ]);
  return readFileSync(await dl.path(), 'utf8');
}

/** 簡單的 CSV 解析（引號包住的欄位裡可能有逗號） */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

test('CSV：考據語料的列有原文／拼音、涵義、備註', async ({ page }) => {
  const errors = await open(page);
  await setSeed(page, 'csv');
  await radio(page, '俄羅斯').click();
  await expect.poll(async () => (await nameTexts(page))[0]).toMatch(/^[A-Z]/);
  const texts = await nameTexts(page);
  const rows = parseCsv((await download(page, 'CSV')).slice(1));
  expect(rows[0].slice(-3)).toEqual(['原文／拼音', '涵義', '備註']);
  expect(rows).toHaveLength(11);
  expect(rows.slice(1).map((r) => r[0])).toEqual(texts);
  for (const r of rows.slice(1)) {
    expect(r).toHaveLength(13);
    expect(r[0]).toBe(`${r[2]} ${r[1]}`);
    expect(r[5]).toBe('俄羅斯');
    expect(r[6]).toBe('帝俄時代（1721–1917）');
    expect(r[7] + r[8] + r[9]).toBe('');
    expect(r[11]).toMatch(/^名：.+；姓：/);
    expect(r[12]).toMatch(/姓氏(女|男)性形 /);
  }
  expect(rows.slice(1).some((r) => /[А-Яа-яЁё]/.test(r[10]))).toBe(true);
  expect(errors).toEqual([]);
});

test('2026-10 以前的存檔（只有日本、台灣、美國與舊的年代 id）照常讀入', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    localStorage.setItem(
      'trpg-toolkit:npc-names',
      JSON.stringify({
        state: {
          data: {
            region: 'us',
            eras: { jp: 'showa', tw: 'now', us: 'born1920' },
            gender: 'female',
            count: 3,
            middleInitial: false,
            show: { hiragana: true, katakana: false, romaji: true },
            copyReading: false,
            seed: '',
            names: [
              {
                region: 'us',
                era: 'born1920',
                gender: 'female',
                family: 'Smith',
                given: 'Mary',
                text: 'Mary Smith',
              },
              {
                region: 'us',
                era: 'born1920',
                gender: 'female',
                family: 'Brown',
                given: 'Ruth',
                text: 'Ruth Brown',
              },
              {
                region: 'us',
                era: 'born1920',
                gender: 'female',
                family: 'Jones',
                given: 'Helen',
                text: 'Helen Jones',
              },
            ],
            locked: ['Ruth Brown'],
            lastSeed: 'old123',
          },
        },
        version: 1,
      }),
    );
  });
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  expect(await nameTexts(page)).toEqual(['Mary Smith', 'Ruth Brown', 'Helen Jones']);
  await expect(cards(page).nth(1)).toHaveAttribute('data-locked', 'true');
  await expect(radio(page, '美國')).toHaveAttribute('aria-checked', 'true');
  await expect(eraBox(page)).toHaveText('1920 年代出生');
  await expect(radio(page, '女')).toHaveAttribute('aria-checked', 'true');
  /* 新的欄位用預設值：原文／拼音、顯示涵義是開的 */
  await expect(page.getByRole('checkbox', { name: '原文／拼音' })).toBeChecked();
  await expect(page.getByRole('switch', { name: '顯示涵義' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '片假名' })).not.toBeChecked();
  await radio(page, '日本').click();
  await expect(eraBox(page)).toHaveText('昭和中後期');
  expect(errors).toEqual([]);
});

test('輸出：只有名、只有姓（台灣沒有；維京沒有只有姓）；紀錄寫輸出', async ({ page }) => {
  const errors = await open(page);
  await setSeed(page, 'part');
  const field = conditions(page).getByText('輸出', { exact: true });
  /* 日本（人數名單）：只有姓 */
  let before = await nameTexts(page);
  await radio(page, '只有姓').click();
  await changed(page, before);
  for (const t of await nameTexts(page)) expect(t).toMatch(/^\S+$/);
  expect(new Set(await nameTexts(page)).size).toBe(10);
  const lines = (await cards(page).first().getByRole('button').first().innerText()).split('\n');
  expect(lines[1]).toMatch(/^[ぁ-ゖ]+$/);
  await expect(page.getByTestId('history-entry').first()).toContainText('日本・現代・不限・只有姓');
  /* 台灣：沒有輸出 */
  await radio(page, '台灣').click();
  await expect(field).toBeHidden();
  await expect
    .poll(async () => (await nameTexts(page)).every((t) => /^\p{sc=Han}{2,4}$/u.test(t)))
    .toBe(true);
  /* 維京：沒有「只有姓」，當作全名；只有名時沒有父名 */
  await radio(page, '北歐').click();
  await expect(field).toBeVisible();
  await expect(radio(page, '只有姓')).toHaveCount(0);
  await expect(radio(page, '全名')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await nameTexts(page)).every((t) => / /.test(t))).toBe(true);
  before = await nameTexts(page);
  await radio(page, '只有名').click();
  await changed(page, before);
  for (const t of await nameTexts(page)) expect(t).toMatch(/^\S+$/);
  await expect(page.getByTestId('name-meaning').first()).not.toContainText('父名');
  /* 英國：記住的只有姓又回來 */
  await radio(page, '英國').click();
  await radio(page, '只有姓').click();
  await expect.poll(async () => (await nameTexts(page)).every((t) => /^\S+$/.test(t))).toBe(true);
  await expect(cards(page).first().getByTestId('name-meaning')).toHaveText(/^姓：/);
  expect(errors).toEqual([]);
});

test.describe('查名字', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  async function search(page: Page, q: string) {
    const box = page.getByRole('searchbox', { name: '姓或名' });
    if (!(await box.isVisible())) await btn(page, '查名字').click();
    await box.fill(q);
    await box.press('Enter');
    await expect(page.getByTestId('search-total')).toBeVisible();
  }
  const total = (page: Page) => page.getByTestId('search-total');
  const hitTexts = (page: Page) => page.getByTestId('search-hit-text').allInnerTexts();

  test('正規化：片假名、濁音、大小寫、重音、全形；讀音比對、開頭優先、跨年代', async ({ page }) => {
    const errors = await open(page);
    /* 沒有送出前不查 */
    await btn(page, '查名字').click();
    await page.getByRole('searchbox', { name: '姓或名' }).fill('さとう');
    await expect(total(page)).toHaveCount(0);
    await btn(page, '搜尋').click();
    await expect(total(page)).toHaveText(/^共 \d+ 筆$/);
    const hira = await hitTexts(page);
    expect(hira).toContain('佐藤');
    await search(page, 'サトウ');
    expect(await hitTexts(page)).toEqual(hira);
    await search(page, 'ｻﾄｳ');
    expect(await hitTexts(page)).toEqual(hira);
    /* 濁音：たて 找得到 伊達（だて） */
    await search(page, 'たて');
    expect(await hitTexts(page)).toContain('伊達');
    /* 跨年代：佐藤在好幾個年代，每個年代一筆 */
    await search(page, '佐藤');
    const metas = await page.getByTestId('search-hit-meta').allInnerTexts();
    expect(new Set(metas).size).toBeGreaterThan(1);
    expect(metas.every((m) => m.startsWith('姓・'))).toBe(true);

    /* 美國：大小寫、重音、全形 */
    await radio(page, '美國').click();
    await search(page, 'jose');
    const jose = await hitTexts(page);
    expect(jose).toEqual(expect.arrayContaining(['José', 'José Luis']));
    for (const q of ['JOSE', 'JOSÉ', 'ｊｏｓｅ']) {
      await search(page, q);
      expect(await hitTexts(page)).toEqual(jose);
    }
    /* 開頭就對上的排前面 */
    await radio(page, '英國').click();
    await search(page, 'an');
    const an = await hitTexts(page);
    const firstOther = an.findIndex((t) => !t.toLowerCase().startsWith('an'));
    expect(firstOther).toBeGreaterThan(0);
    expect(an.slice(firstOther).some((t) => t.toLowerCase().startsWith('an'))).toBe(false);
    /* 韓國：讀音（羅馬拼音） */
    await radio(page, '韓國').click();
    await search(page, 'gim');
    expect(await hitTexts(page)).toContain('김');
    await search(page, 'zzzz');
    await expect(total(page)).toHaveText('共 0 筆');
    await expect(page.getByText('查無資料，換個字試試。')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('篩選：會變成 0 筆的選項停用、清空篩選；點一筆複製；顯示更多', async ({ page }) => {
    const errors = await open(page);
    await radio(page, '北歐').click();
    await search(page, 'er');
    const n = Number((await total(page).innerText()).match(/\d+/)?.[0]);
    expect(n).toBeGreaterThan(50);
    /* 一次顯示 50 筆，其他按「顯示更多」 */
    await expect(page.getByTestId('search-hit')).toHaveCount(50);
    await page.getByRole('button', { name: /^顯示更多/ }).click();
    await expect(page.getByTestId('search-hit')).toHaveCount(Math.min(n, 100));
    /* 年代＝維京：類別「姓」沒有結果 → 停用 */
    const filters = page.getByTestId('search-filters');
    await filters.getByRole('combobox', { name: '年代' }).click();
    await page.getByRole('option', { name: '維京時代（793–1066）' }).click();
    await expect(filters.getByRole('radio', { name: '姓', exact: true })).toBeDisabled();
    await expect(filters.getByRole('radio', { name: '名', exact: true })).toBeEnabled();
    const metas = await page.getByTestId('search-hit-meta').allInnerTexts();
    expect(metas.every((m) => m.endsWith('維京時代（793–1066）'))).toBe(true);
    await expect(btn(page, '清空篩選')).toBeVisible();
    await btn(page, '清空篩選').click();
    await expect(btn(page, '清空篩選')).toHaveCount(0);
    await expect(total(page)).toHaveText(`共 ${n} 筆`);
    /* 國家：瑞典 */
    await filters.getByRole('radio', { name: '瑞典', exact: true }).click();
    await expect(total(page)).not.toHaveText(`共 ${n} 筆`);
    /* 點一筆複製 */
    const first = (await page.getByTestId('search-hit-text').first().innerText()).trim();
    await page.getByTestId('search-hit').first().getByRole('button').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);
    await expect(page.getByText(`已複製：${first}`, { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('語料讀不到：提示重新整理頁面', async ({ page }) => {
  const errors = await open(page);
  await page.route(/inknomu-uk-[\w-]+\.js$/, (route) => route.abort('failed'));
  await radio(page, '英國').click();
  await expect(
    page.getByText('名字資料讀不到，請檢查網路後重新整理頁面。', { exact: true }),
  ).toBeVisible();
  expect(
    errors.filter((e) => !/Failed to (load resource|fetch dynamically imported module)/.test(e)),
  ).toEqual([]);
});

test.describe('390 寬', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('地區 4 欄 2 列、年代選單、語料的卡片與查名字，沒有橫向捲動', async ({ page }) => {
    const errors = await open(page);
    await setSeed(page, 'narrow');
    await radio(page, '奇幻').click();
    await expect.poll(async () => (await nameTexts(page))[0]).toMatch(/^[A-Z]/);
    await pickEra(page, '獸人／半獸人');
    await btn(page, '關於這份語料').click();
    await noHorizontalScroll(page);
    const jp = await radio(page, '日本').boundingBox();
    const us = await radio(page, '美國').boundingBox();
    expect(jp && us && us.y > jp.y + 10).toBe(true);
    await btn(page, '查名字').click();
    await page.getByRole('searchbox', { name: '姓或名' }).fill('gr');
    await btn(page, '搜尋').click();
    await expect(page.getByTestId('search-hit').first()).toBeVisible();
    await noHorizontalScroll(page);
    await expect(page.getByTestId('conditions-summary')).toHaveText(
      '條件：奇幻・獸人／半獸人・不限・10 個',
    );
    expect(errors).toEqual([]);
  });
});
