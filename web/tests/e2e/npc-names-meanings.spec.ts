/**
 * NPC 名字產生器：依真實人數的名單也附涵義（F57，2026-10 修訂）的端對端測試。
 * - 日本、台灣、美國的人數名單抽出的姓或名，考據語料裡有同一個時附上涵義（姓名順序），下面一行標出處（純文字）；
 * - 只有姓／只有名只留那一段；「顯示涵義」開關一起控制，關著時不載入語料；語料讀不到時名字照常、不另外提示；
 * - CSV 的「涵義」欄（匯出前先載入）、備註留白；存檔與紀錄不存涵義。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('npc-names') ?? { id: 'npc-names', status: 'next' })}/`;
const SOURCE = '弄墨 Inknomu《角色姓名產生器》';

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** 記下載入的名字資料檔（names-jp、inknomu-jp…） */
function watchChunks(page: Page) {
  const requested: string[] = [];
  page.on('request', (r) => {
    const m = /(names|inknomu)-(jp|tw|us|kr|uk|ru|nordic|fantasy)-[\w-]+\.js$/.exec(r.url());
    if (m) requested.push(`${m[1]}-${m[2]}`);
  });
  return requested;
}

async function open(page: Page) {
  const errors = watchErrors(page);
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
const card = (page: Page, text: string) =>
  cards(page).filter({ has: page.getByTestId('name-text').getByText(text, { exact: true }) });
const meaningSwitch = (page: Page) => page.getByRole('switch', { name: '顯示涵義' });

async function setSeed(page: Page, seed: string) {
  const field = page.getByLabel('種子', { exact: true });
  if (!(await field.isVisible())) await btn(page, '種子').click();
  await field.fill(seed);
}

async function generate(page: Page) {
  const before = await nameTexts(page);
  await btn(page, '產生').click();
  await expect.poll(async () => (await nameTexts(page)).join('\n')).not.toBe(before.join('\n'));
}

/** 一張卡的說明行（涵義的段落，不含出處） */
async function meaningLines(c: ReturnType<typeof cards>) {
  return c
    .getByTestId('name-meaning')
    .locator('p:not([data-testid=meaning-credit])')
    .allInnerTexts();
}

/** 日本・現代（人數名單）的一批：兩段出自兩個包、一個包、只對上名、都對不上 */
const JP_NAMES = [
  ['佐藤', '博', 'さとう', 'ひろし', 'male'],
  ['佐藤', '誠', 'さとう', 'まこと', 'male'],
  ['浅井', '誠', 'あさい', 'まこと', 'male'],
  ['篠原', '有里', 'しのはら', 'ゆり', 'female'],
].map(([family, given, familyReading, givenReading, gender]) => ({
  region: 'jp',
  era: 'modern',
  gender,
  family,
  given,
  familyReading,
  givenReading,
  text: `${family} ${given}`,
}));

/** 存檔換成日本・現代的這一批（`meaning`：顯示涵義）後重新整理 */
async function loadSaved(page: Page, meaning: boolean) {
  await page.evaluate(
    ([names, meaning]) => {
      localStorage.setItem(
        'trpg-toolkit:npc-names',
        JSON.stringify({
          state: {
            data: {
              region: 'jp',
              eras: { jp: 'modern' },
              gender: 'any',
              count: names.length,
              show: {
                hiragana: true,
                katakana: true,
                romaji: true,
                original: true,
                meaning,
              },
              names,
              locked: [],
              seed: '',
              lastSeed: 'saved1',
            },
          },
          version: 1,
        }),
      );
    },
    [JP_NAMES, meaning] as const,
  );
  await page.reload();
  await expect(cards(page)).toHaveCount(JP_NAMES.length);
}

async function download(page: Page, item: string) {
  await btn(page, '匯出').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: new RegExp(`^${item}`) }).click(),
  ]);
  return readFileSync(await dl.path(), 'utf8');
}

/** CSV（涵義裡沒有逗號、引號：人數名單的三個地區的語料都沒有） */
const csvLines = (text: string) =>
  text
    .slice(1)
    .split('\r\n')
    .filter(Boolean)
    .map((line) => line.split(','));

test('日本：人數名單的名字附涵義與出處（兩個包、一個包、只對上名、都對不上）；不附備註；存檔不存涵義', async ({
  page,
}) => {
  const errors = await open(page);
  await loadSaved(page, true);
  expect(await nameTexts(page)).toEqual(JP_NAMES.map((n) => n.text));

  /* 佐藤 博：姓出自平成令和、名出自昭和 */
  const hiroshi = card(page, '佐藤 博');
  await expect(hiroshi.getByTestId('meaning-credit')).toHaveText(
    `涵義：${SOURCE}（日本・平成令和時代、昭和時代）`,
  );
  expect(await meaningLines(hiroshi)).toEqual([
    '姓：佐（輔佐）、藤（藤原氏後裔用字），日本第一大姓，多源自藤原氏支流。',
    '名：博學、廣博。',
  ]);
  /* 出處是純文字（不做連結，每張卡不多一個 Tab 停點；連結在使用方式與說明對話框） */
  await expect(hiroshi.getByRole('link')).toHaveCount(0);
  await page.getByRole('button', { name: '說明' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    '依真實人數的名單抽到的姓或名，若考據語料裡有同一個，也會附上那一筆的涵義（標出處）。',
  );
  await expect(dialog.getByRole('link', { name: SOURCE, exact: true })).toHaveAttribute(
    'href',
    'https://inknomu.com/namegen/',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  /* 涵義在點一下複製的範圍外面 */
  await expect(hiroshi.getByRole('button', { name: '複製「佐藤 博」' })).not.toContainText('姓：');

  /* 佐藤 誠：都出自平成令和（平成令和的「誠」涵義和昭和不同） */
  const makoto = card(page, '佐藤 誠');
  await expect(makoto.getByTestId('meaning-credit')).toHaveText(
    `涵義：${SOURCE}（日本・平成令和時代）`,
  );
  expect(await meaningLines(makoto)).toEqual([
    '姓：佐（輔佐）、藤（藤原氏後裔用字），日本第一大姓，多源自藤原氏支流。',
    '名：真誠不欺。',
  ]);
  /* 浅井（あさい）：語料是戰國的あざい，讀音不同不算 → 只有名 */
  expect(await meaningLines(card(page, '浅井 誠'))).toEqual(['名：真誠不欺。']);
  /* 篠原 有里：都對不上 → 整塊不出現 */
  await expect(card(page, '篠原 有里').getByTestId('name-meaning')).toHaveCount(0);
  await expect(page.getByTestId('meaning-credit')).toHaveCount(3);

  /* 卡片的讀音照舊（4 行：全名＋三種讀音） */
  const lines = (await hiroshi.getByRole('button').first().innerText()).split('\n');
  expect(lines).toEqual(['佐藤 博', 'さとう ひろし', 'サトウ ヒロシ', 'Satou Hiroshi']);

  /* 鎖定、改設定後存檔裡的名字也沒有涵義 */
  await btn(page, '鎖定「佐藤 博」').click();
  const stored = await page.evaluate(() => localStorage.getItem('trpg-toolkit:npc-names') ?? '');
  expect(stored).toContain('佐藤 博');
  expect(stored).not.toContain('姓：');
  expect(stored).not.toContain('meanings');
  expect(errors).toEqual([]);
});

test('台灣先姓後名、美國先名後姓；出處標地區與包', async ({ page }) => {
  const errors = await open(page);
  await setSeed(page, 'meaning');
  await radio(page, '台灣').click();
  await expect.poll(async () => (await nameTexts(page))[0]).toMatch(/^\p{sc=Han}{3,4}$/u);
  await expect(page.getByTestId('meaning-credit').first()).toBeVisible();
  const tw = cards(page);
  let both = 0;
  for (let i = 0; i < (await tw.count()); i++) {
    const c = tw.nth(i);
    if (!(await c.getByTestId('name-meaning').count())) continue;
    const m = await meaningLines(c);
    expect(m.length).toBeGreaterThan(0);
    if (m.length === 2) {
      both++;
      expect(m[0]).toMatch(/^姓：/);
      expect(m[1]).toMatch(/^名：/);
    }
    await expect(c.getByTestId('meaning-credit')).toHaveText(
      new RegExp(`^涵義：${SOURCE}（台灣・[^）]+）$`),
    );
  }
  expect(both).toBeGreaterThan(0);

  /* 美國：名在前 */
  await radio(page, '美國').click();
  await expect.poll(async () => (await nameTexts(page))[0]).toMatch(/^[A-Z]/);
  await expect(page.getByTestId('meaning-credit').first()).toBeVisible();
  const us = cards(page);
  both = 0;
  for (let i = 0; i < (await us.count()); i++) {
    const c = us.nth(i);
    if (!(await c.getByTestId('name-meaning').count())) continue;
    const m = await meaningLines(c);
    if (m.length === 2) {
      both++;
      expect(m[0]).toMatch(/^名：/);
      expect(m[1]).toMatch(/^姓：/);
    }
    await expect(c.getByTestId('meaning-credit')).toHaveText(
      new RegExp(`^涵義：${SOURCE}（美國・[^）]+）$`),
    );
    await expect(c.getByRole('link')).toHaveCount(0);
  }
  expect(both).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('只有姓、只有名：只留那一段的涵義', async ({ page }) => {
  const errors = await open(page);
  await setSeed(page, 'part-meaning');
  for (const [part, label] of [
    ['只有姓', '姓：'],
    ['只有名', '名：'],
  ] as const) {
    const before = await nameTexts(page);
    await radio(page, part).click();
    await expect.poll(async () => (await nameTexts(page)).join('\n')).not.toBe(before.join('\n'));
    await expect(page.getByTestId('meaning-credit').first()).toBeVisible();
    const blocks = page.getByTestId('name-meaning');
    expect(await blocks.count()).toBeGreaterThan(0);
    for (const text of await blocks.allInnerTexts()) {
      const lines = text.split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(lines[0].startsWith(label)).toBe(true);
      expect(lines[1]).toMatch(new RegExp(`^涵義：${SOURCE}（日本・[^）]+）$`));
    }
  }
  expect(errors).toEqual([]);
});

test('「顯示涵義」開關：關著時不載入語料、不顯示；打開才載入（只載一次）', async ({ page }) => {
  const errors = await open(page);
  /* 開頁那一次的語料已經載入完（之後才開始記） */
  await expect(page.getByTestId('meaning-credit').first()).toBeVisible();
  const requested = watchChunks(page);
  await loadSaved(page, false);
  await expect(meaningSwitch(page)).not.toBeChecked();
  await page.waitForTimeout(500);
  /* 存檔的這一批直接顯示（人數名單也不用載入）；語料不載入 */
  expect(requested).toEqual([]);
  await expect(page.getByTestId('name-meaning')).toHaveCount(0);

  await meaningSwitch(page).click();
  await expect(page.getByTestId('meaning-credit')).toHaveCount(3);
  expect(requested).toEqual(['inknomu-jp']);
  await meaningSwitch(page).click();
  await expect(page.getByTestId('name-meaning')).toHaveCount(0);
  await meaningSwitch(page).click();
  await expect(page.getByTestId('meaning-credit')).toHaveCount(3);
  /* 選語料的包時用同一個檔，不再下載 */
  await page.getByRole('combobox', { name: '年代' }).click();
  await page.getByRole('option', { name: /^江戶時代/ }).click();
  await expect.poll(async () => (await nameTexts(page))[0]).not.toBe('佐藤 博');
  expect(requested.filter((r) => r === 'inknomu-jp')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('語料讀不到：名字照常顯示、沒有涵義，不另外提示', async ({ page }) => {
  await page.route(/inknomu-jp-[\w-]+\.js$/, (route) => route.abort('failed'));
  const errors = await open(page);
  await expect(page.getByTestId('names-summary')).toHaveText('共 10 個');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('name-meaning')).toHaveCount(0);
  await expect(page.getByText('名字資料讀不到，請檢查網路後重新整理頁面。')).toHaveCount(0);
  /* 可以照常產生 */
  await generate(page);
  await expect(cards(page)).toHaveCount(10);
  expect(
    errors.filter((e) => !/Failed to (load resource|fetch dynamically imported module)/.test(e)),
  ).toEqual([]);
});

test('CSV：人數名單的列填涵義（和卡片相同）、備註留白；「顯示涵義」關著時匯出前先載入語料', async ({
  page,
}) => {
  const errors = await open(page);
  await setSeed(page, 'csv-meaning');
  await generate(page);
  await expect(page.getByTestId('meaning-credit').first()).toBeVisible();
  const texts = await nameTexts(page);
  const expected: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    const c = cards(page).nth(i);
    expected.push(
      (await c.getByTestId('name-meaning').count()) ? (await meaningLines(c)).join('；') : '',
    );
  }
  expect(expected.some(Boolean)).toBe(true);
  const rows = csvLines(await download(page, 'CSV'));
  expect(rows[0].slice(-3)).toEqual(['原文／拼音', '涵義', '備註']);
  expect(rows.slice(1).map((r) => r[0])).toEqual(texts);
  expect(rows.slice(1).map((r) => r[11])).toEqual(expected);
  for (const r of rows.slice(1)) {
    expect(r).toHaveLength(13);
    expect([r[10], r[12]]).toEqual(['', '']);
  }

  /* 顯示涵義關著（語料還沒載入）：匯出時先載入，照樣填 */
  const requested = watchChunks(page);
  await loadSaved(page, false);
  await page.waitForTimeout(300);
  expect(requested).not.toContain('inknomu-jp');
  const saved = csvLines(await download(page, 'CSV'));
  expect(requested).toContain('inknomu-jp');
  expect(saved.slice(1).map((r) => r[11])).toEqual([
    '姓：佐（輔佐）、藤（藤原氏後裔用字），日本第一大姓，多源自藤原氏支流。；名：博學、廣博。',
    '姓：佐（輔佐）、藤（藤原氏後裔用字），日本第一大姓，多源自藤原氏支流。；名：真誠不欺。',
    '名：真誠不欺。',
    '',
  ]);
  /* 畫面上還是沒有涵義（開關沒動） */
  await expect(page.getByTestId('name-meaning')).toHaveCount(0);
  /* TXT 與複製不附涵義 */
  expect(await download(page, 'TXT')).toBe(`${JP_NAMES.map((n) => n.text).join('\r\n')}\r\n`);
  expect(errors).toEqual([]);
});
