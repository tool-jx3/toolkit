/**
 * NPC 名字產生器（建置產物 next/npc-names/）的端對端測試。用「種子」讓結果固定：
 * - 開頁沒有錯誤、頁尾沒有靈感來源（本站的工具）、開頁自動產生一批；資料用到才載入（切換地區時才下載那個地區的檔）；
 * - 三種地區各產生一批（日本附三種讀音、臺灣「姓名」、美國「名 姓」與中間名縮寫）、年代與性別；
 * - 種子重現、「填入這個種子」；鎖定後再產生（鎖定的留在原位）；數量；
 * - 複製一個、全部複製、附上讀音；自動儲存、復原；390 寬沒有橫向捲動；1280／390 視覺基準。
 */
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

async function setSeed(page: Page, seed: string) {
  const field = page.getByLabel('種子', { exact: true });
  if (!(await field.isVisible())) await btn(page, '種子').click();
  await field.fill(seed);
}

/** 產生一批，等名字換掉 */
async function generate(page: Page) {
  const before = (await nameTexts(page)).join('\n');
  await btn(page, '產生').click();
  await expect.poll(async () => (await nameTexts(page)).join('\n')).not.toBe(before);
}

async function setCount(page: Page, value: number) {
  const input = page.getByRole('spinbutton', { name: '數量', exact: true });
  await input.fill(String(value));
  await input.press('Enter');
  await expect(cards(page)).toHaveCount(value);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test('開頁：沒有錯誤、沒有靈感來源、自動產生一批日本的名字；資料用到才載入', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => {
    const m = /names-(jp|tw|us)-[\w-]+\.js$/.exec(r.url());
    if (m) requested.push(m[1]);
  });
  const errors = await open(page);
  await expect(page.getByText(/靈感來源/)).toHaveCount(0);
  await expect(radio(page, '日本')).toHaveAttribute('aria-checked', 'true');
  await expect(radio(page, '現代')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('names-summary')).toHaveText('共 10 個');
  expect(requested).toEqual(['jp']);
  /* 讀音三行：平假名、片假名、羅馬拼音 */
  const first = cards(page).first();
  const lines = (await first.getByRole('button').first().innerText()).split('\n');
  expect(lines).toHaveLength(4);
  expect(lines[0]).toMatch(/^\S+ \S+$/);
  expect(lines[1]).toMatch(/^[ぁ-ゖ]+ [ぁ-ゖ]+$/);
  expect(lines[2]).toMatch(/^[ァ-ヶ]+ [ァ-ヶ]+$/);
  expect(lines[3]).toMatch(/^[A-Z][a-z']+ [A-Z][a-z']+$/);
  await radio(page, '臺灣').click();
  await expect.poll(() => requested).toEqual(['jp', 'tw']);
  expect(errors).toEqual([]);
});

test('三種地區各產生一批：寫法、年代的說明、性別、中間名縮寫', async ({ page }) => {
  const errors = await open(page);
  await setSeed(page, 'regions');
  await generate(page);
  /* 日本：大正～昭和初期、女性 */
  await radio(page, '大正～昭和初期').click();
  await expect(page.getByText('1870～1910 年代出生的人')).toBeVisible();
  await radio(page, '女').click();
  await expect(cards(page).getByText('女', { exact: true })).toHaveCount(10);
  for (const t of await nameTexts(page)) expect(t).toMatch(/^\S+ \S+$/);

  /* 臺灣：姓名連在一起、沒有讀音、只有一個年代 */
  await radio(page, '臺灣').click();
  await expect(radio(page, '現今')).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => (await nameTexts(page)).every((t) => /^\p{sc=Han}{3,4}$/u.test(t)))
    .toBe(true);
  const lines = await cards(page).first().getByRole('button').first().innerText();
  expect(lines.split('\n')).toHaveLength(1);
  await radio(page, '男').click();
  await expect(cards(page).getByText('男', { exact: true })).toHaveCount(10);

  /* 美國：1920 年代（1880～1909 年出生）、名 姓；中間名縮寫 */
  await radio(page, '美國').click();
  await expect(page.getByText('1880～1909 年出生的人（1920 年代的大人）')).toBeVisible();
  await expect
    .poll(async () =>
      (await nameTexts(page)).every((t) => /^[A-Z][a-z]+ [A-Z][A-Za-z' ]+$/.test(t)),
    )
    .toBe(true);
  await page.getByRole('switch', { name: '中間名縮寫' }).click();
  await expect
    .poll(async () =>
      (await nameTexts(page)).every((t) => /^[A-Z][a-z]+ [A-Z]\. [A-Z][A-Za-z' ]+$/.test(t)),
    )
    .toBe(true);
  await radio(page, '1920 年代出生').click();
  await expect(page.getByText('1920～1929 年出生的人', { exact: false })).toBeVisible();
  /* 地區各自記住年代 */
  await radio(page, '日本').click();
  await expect(radio(page, '大正～昭和初期')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('種子：同樣的種子同一批、「這一批的種子」可以填回去重現', async ({ page }) => {
  const errors = await open(page);
  await setSeed(page, 'abc');
  await generate(page);
  const a = await nameTexts(page);
  await btn(page, '產生').click();
  await page.waitForTimeout(200);
  expect(await nameTexts(page)).toEqual(a);
  await expect(page.getByTestId('last-seed')).toHaveText('這一批的種子：abc');
  await expect(btn(page, '填入這個種子')).toBeDisabled();

  /* 留白＝隨機，記下這一批的種子再填回去 */
  await page.getByLabel('種子', { exact: true }).fill('');
  await generate(page);
  const b = await nameTexts(page);
  const seed = ((await page.getByTestId('last-seed').innerText()).split('：')[1] ?? '').trim();
  expect(seed).toMatch(/^[a-z2-9]{6}$/);
  await generate(page);
  await btn(page, '填入這個種子').click();
  await expect(page.getByLabel('種子', { exact: true })).toHaveValue(
    ((await page.getByTestId('last-seed').innerText()).split('：')[1] ?? '').trim(),
  );
  await page.getByLabel('種子', { exact: true }).fill(seed);
  await page.getByLabel('種子', { exact: true }).press('Enter');
  await expect.poll(() => nameTexts(page)).toEqual(b);
  expect(errors).toEqual([]);
});

test('鎖定後再產生：鎖定的留在原位、其他換新；數量增減；同一批不重複', async ({ page }) => {
  const errors = await open(page);
  const before = await nameTexts(page);
  await btn(page, `鎖定「${before[1]}」`).click();
  await btn(page, `鎖定「${before[4]}」`).click();
  await expect(btn(page, `取消鎖定「${before[1]}」`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('names-summary')).toHaveText('共 10 個，鎖定 2 個');
  await page.keyboard.press('g');
  await expect.poll(async () => (await nameTexts(page)).join()).not.toBe(before.join());
  const after = await nameTexts(page);
  expect(after[1]).toBe(before[1]);
  expect(after[4]).toBe(before[4]);
  expect(after.filter((t, i) => i !== 1 && i !== 4 && before.includes(t)).length).toBeLessThan(3);
  await expect(cards(page).nth(1)).toHaveAttribute('data-locked', 'true');

  await setCount(page, 30);
  const many = await nameTexts(page);
  expect(new Set(many).size).toBe(30);
  expect(many[1]).toBe(before[1]);
  await setCount(page, 3);
  const few = await nameTexts(page);
  expect(few[1]).toBe(before[1]);
  /* 數量比鎖定的少：鎖定的都留著 */
  const count = page.getByRole('spinbutton', { name: '數量', exact: true });
  await count.fill('1');
  await count.press('Enter');
  await expect(cards(page)).toHaveCount(2);
  expect(await nameTexts(page)).toEqual([before[1], before[4]]);
  await btn(page, `取消鎖定「${before[1]}」`).click();
  await btn(page, '產生').click();
  await expect(cards(page)).toHaveCount(1);
  expect(await nameTexts(page)).toEqual([before[4]]);
  expect(errors).toEqual([]);
});

test.describe('複製', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('點名字複製一個、全部複製（按鈕與 C 鍵）、附上讀音', async ({ page }) => {
    const errors = await open(page);
    await setSeed(page, 'copy');
    await generate(page);
    const texts = await nameTexts(page);
    await btn(page, `複製「${texts[2]}」`).click();
    await expect(page.getByText(`已複製：${texts[2]}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(texts[2]);

    await btn(page, '全部複製').click();
    await expect(page.getByText('已複製 10 個名字', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(texts.join('\n'));

    /* 附上讀音（只附有勾的讀音） */
    await page.getByRole('switch', { name: '複製時附上讀音' }).click();
    await page.getByRole('checkbox', { name: '片假名' }).click();
    await expect(cards(page).first().getByRole('button').first()).not.toContainText(/[ァ-ヶ]/);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('c');
    await expect(page.getByText('已複製 10 個名字', { exact: true })).toBeVisible();
    const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[0]).toMatch(/^\S+ \S+（[ぁ-ゖ]+ [ぁ-ゖ]+／[A-Z][a-z']+ [A-Z][a-z']+）$/);
    expect(lines[0].startsWith(texts[0])).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('自動儲存與復原：重新整理後同一批與鎖定；換一批可以復原', async ({ page }) => {
  const errors = await open(page);
  await radio(page, '美國').click();
  await expect.poll(async () => (await nameTexts(page))[0]).toMatch(/^[A-Z]/);
  const a = await nameTexts(page);
  await btn(page, `鎖定「${a[0]}」`).click();
  await page.reload();
  await expect(cards(page)).toHaveCount(10);
  expect(await nameTexts(page)).toEqual(a);
  await expect(cards(page).first()).toHaveAttribute('data-locked', 'true');
  await expect(radio(page, '美國')).toHaveAttribute('aria-checked', 'true');

  await generate(page);
  expect((await nameTexts(page))[0]).toBe(a[0]);
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect.poll(() => nameTexts(page)).toEqual(a);
  expect(errors).toEqual([]);
});

test.describe('390 寬', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('名字在上、條件在下，沒有橫向捲動；視覺基準', async ({ page }) => {
    const errors = await open(page);
    await setSeed(page, 'shot');
    await generate(page);
    await page.getByLabel('種子', { exact: true }).blur();
    const listTop = await cards(page).first().boundingBox();
    const regionTop = await radio(page, '日本').boundingBox();
    expect(listTop && regionTop && listTop.y < regionTop.y).toBe(true);
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('npc-names-390.png');
    expect(errors).toEqual([]);
  });
});

test('1280 寬：視覺基準（種子 shot 的一批固定）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await open(page);
  await setSeed(page, 'shot');
  await generate(page);
  /* 同一份資料、同一個種子，建置之間也不會變（資料或抽法改了才要更新） */
  expect(await nameTexts(page)).toEqual([
    '山本 圭子',
    '横山 智子',
    '佐々木 智子',
    '吉田 俊介',
    '中山 春美',
    '高杉 絵美子',
    '長沼 浩',
    '春名 一',
    '岡 陽一',
    '八木 一弘',
  ]);
  await btn(page, `鎖定「${(await nameTexts(page))[1]}」`).click();
  await page.getByLabel('種子', { exact: true }).blur();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('npc-names-1280.png');
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
