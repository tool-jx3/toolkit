/**
 * 5e 速查計算（建置產物 next/5e-calc/）的端對端測試：
 * - 開頁沒有錯誤、頁尾只有靈感來源、預設（4 名 1 級對 1 隻 CR 1＝200 XP、低難度）、關於規則內容（三份署名照原文）；
 * - 遭遇：SRD 5.2.1 的例子（五名 3 級、2 隻 CR 2＋9 隻 CR 1/8＝1,125 XP、中難度）、簡易遭遇基準、提醒、加減組、
 *   加進戰鬥追蹤（新分頁收到、HP 與 AC 照快速怪物數值）、原作格式的 JSON、複製結果；
 * - 快速怪物：選 CR、上一級／下一級、網址的 ?cr=、一行的數值卡、全部的表、加進戰鬥追蹤；
 * - 點數購買：＋／－ 的限制、直接打的值、標準數組與依職業、背景的 +2／+1 與三項 +1、2014 的種族與半精靈自選；
 * - 復原／重做、自動儲存、專案檔；390 寬沒有橫向捲動；1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('5e-calc') ?? { id: '5e-calc', status: 'next' })}/`;
const KEY = 'trpg-toolkit:5e-calc';

async function routeFonts(page: Page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
}

async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await routeFonts(page);
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '5e 速查計算' })).toBeVisible();
  return errors;
}

const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name });

/** 下拉選單：字串＝完整的名稱；有說明的選項（名稱後面接著說明）用 RegExp */
async function pick(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page
    .getByRole(
      'option',
      typeof option === 'string' ? { name: option, exact: true } : { name: option },
    )
    .click();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** SRD 5.2.1 的例 2：五名 3 級、2 隻 CR 2＋9 隻 CR 1/8 */
async function example2(page: Page) {
  await page.getByLabel('第 1 組的人數').fill('5');
  await pick(page, page.getByLabel('第 1 組的等級'), '3 級');
  await page.getByLabel('第 1 組怪物的名字').fill('食人魔');
  await pick(page, page.getByLabel('第 1 組怪物的挑戰等級'), 'CR 2');
  await page.getByLabel('第 1 組怪物的數量').fill('2');
  await btn(page, '加一組怪物').click();
  await pick(page, page.getByLabel('第 2 組怪物的挑戰等級'), 'CR 1/8');
  await page.getByLabel('第 2 組怪物的數量').fill('9');
  await page.getByLabel('第 2 組怪物的數量').blur();
}

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、頁尾、預設的遭遇、關於規則內容', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer')).toHaveText('靈感來源：Sly Flourish／Lazy GM Tools');
    await expect(page.getByRole('link', { name: '先攻與戰鬥追蹤' })).toBeVisible();
    await expect(tab(page, '遭遇預算')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('total-xp')).toHaveText('200 XP');
    await expect(page.getByTestId('verdict')).toHaveText('低難度');
    await expect(page.getByTestId('bench-verdict')).toHaveText('可能致命');
    await btn(page, '關於規則內容').click();
    const about = page.getByTestId('about-rules');
    await expect(about.locator('[data-source]')).toHaveCount(3);
    await expect(about).toContainText(
      'This work includes material from the System Reference Document 5.2.1',
    );
    await expect(about).toContainText(
      'This work includes material taken from the System Reference Document 5.1',
    );
    await expect(about).toContainText(
      "This work includes material taken from the Lazy GM's 5e Monster Builder Resource Document",
    );
    await expect(about).toContainText('本站把上面的內容翻譯成繁體中文');
    expect(errors).toEqual([]);
  });

  test('遭遇：SRD 5.2.1 的例子、預算表、簡易遭遇基準、提醒、加減組、復原', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await example2(page);
    await expect(page.getByTestId('total-xp')).toHaveText('1,125 XP');
    await expect(page.getByTestId('verdict')).toHaveText('中難度');
    const budget = page.getByTestId('budget');
    await expect(budget.getByRole('row', { name: /低難度/ })).toContainText('750超過 375');
    await expect(budget.getByRole('row', { name: /中難度/ })).toContainText('1,1250');
    await expect(budget.getByRole('row', { name: /高難度/ })).toContainText('2,000875');
    /* 簡易遭遇基準：15 × 1/4 ＝ 3；CR 總和 2×2＋9×1/8＝5.125 → 可能致命 */
    await expect(page.getByTestId('benchmark')).toContainText(
      '角色等級總和 15 × 1/4 ＝ 3；怪物的 CR 總和 5.125',
    );
    await expect(page.getByTestId('bench-verdict')).toHaveText('可能致命');
    /* 提醒：11 隻 > 10、CR 2 < 平均 3（不提醒） */
    await expect(page.getByTestId('tips')).toContainText('生物很多時');
    await expect(page.getByTestId('tips')).not.toContainText('挑戰等級比隊伍的等級高');
    await expect(page.getByTestId('group-xp').nth(1)).toHaveText('每隻 25 XP × 9 ＝ 225 XP');
    /* 複製結果 */
    await btn(page, '複製結果').click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.split('\n')).toEqual([
      '角色 5 名（平均 3 級）、怪物 11 隻',
      '怪物的 XP 總和：1,125 XP',
      'XP 預算（SRD 5.2.1）：低難度 750／中難度 1,125／高難度 2,000　→ 中難度',
      '簡易遭遇基準（Lazy Encounter Benchmark）：角色等級總和 15 × 1/4 ＝ 3；怪物的 CR 總和 5.125　→ 可能致命',
    ]);
    /* 加一組角色（等級不同）：預算加總 */
    await btn(page, '加一組角色').click();
    await page.getByLabel('第 2 組的人數').fill('1');
    await pick(page, page.getByLabel('第 2 組的等級'), '5 級');
    await expect(budget.getByRole('row', { name: /低難度/ })).toContainText('1,250');
    /* 刪除第 2 組怪物、復原 */
    await page.getByRole('button', { name: '刪除第 2 組怪物' }).click();
    await expect(page.getByTestId('total-xp')).toHaveText('900 XP');
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('total-xp')).toHaveText('1,125 XP');
    /* 超過高難度 */
    await pick(page, page.getByLabel('第 1 組怪物的挑戰等級'), 'CR 10');
    await expect(page.getByTestId('verdict')).toHaveText('超過高難度');
    expect(errors).toEqual([]);
  });

  test('加進戰鬥追蹤：新分頁收到怪物（HP、AC、名字、先攻 1d20）；原作格式的 JSON', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await example2(page);
    const [ct] = await Promise.all([
      context.waitForEvent('page'),
      btn(page, '加進戰鬥追蹤').click(),
    ]);
    const ctErrors: string[] = [];
    ct.on('pageerror', (e) => ctErrors.push(e.message));
    await routeFonts(ct);
    await expect(ct.getByText('已加入「5e 速查計算」的 11 位').first()).toBeVisible({
      timeout: 15_000,
    });
    expect(await ct.evaluate(() => location.hash)).toBe('');
    const rows = ct.locator('[data-testid="combatant"]');
    await expect(rows).toHaveCount(11);
    await expect(ct.getByLabel('食人魔 A的目前 HP（可以打 -8、+5）')).toHaveValue('45');
    await expect(ct.getByLabel('食人魔 B的 AC')).toHaveValue('13');
    await expect(ct.getByLabel('CR 1/8 的怪物 I的 HP 上限')).toHaveValue('9');
    await expect(ct.getByLabel('食人魔 A的備註（只有 GM 看得到）')).toHaveValue(
      'CR 2｜熟練加值 +5｜每輪傷害 17（2 次 × 9〔2d6＋2〕）｜DC 13',
    );
    /* 同一組共用一次 1d20 */
    const a = await ct.getByLabel('食人魔 A的先攻').inputValue();
    expect(await ct.getByLabel('食人魔 B的先攻').inputValue()).toBe(a);
    expect(Number(a)).toBeGreaterThanOrEqual(1);
    expect(Number(a)).toBeLessThanOrEqual(20);
    await expect(page.getByText('已送出 11 隻到先攻與戰鬥追蹤').first()).toBeVisible();
    expect(ctErrors).toEqual([]);
    await ct.close();

    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      btn(page, '匯出原作格式的 JSON').click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^encounter_for_combat_tracker_.*\.json$/);
    const o = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(o.combatants).toHaveLength(11);
    expect(o.combatants[0]).toMatchObject({ name: '食人魔 A', initiative: 10, maxHp: 45, ac: 13 });
    expect(errors).toEqual([]);
  });

  test('快速怪物：選 CR、上一級／下一級、?cr=、一行的數值卡、全部的表、加進戰鬥追蹤', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page, `${URL}?cr=1/2`);
    await expect(tab(page, '快速怪物數值')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('stat-hp')).toHaveText('22');
    await expect(page.getByTestId('one-line')).toHaveText(
      'CR 1/2｜AC／DC 12｜HP 22（17～28）｜熟練加值 +4｜每輪傷害 8｜攻擊 2 次 × 4（1d4＋2）',
    );
    await btn(page, '高一級').click();
    await expect(page.getByTestId('stat-acdc')).toHaveText('12');
    await expect(page.getByTestId('stat-hp')).toHaveText('33');
    expect(new globalThis.URL(page.url()).searchParams.get('cr')).toBe('1');
    await pick(page, page.getByLabel('挑戰等級（CR）'), 'CR 20');
    await expect(page.getByTestId('stat-dpr')).toHaveText('132');
    await expect(page.getByTestId('stat-attacks')).toContainText('5 × 26');
    await expect(page.getByTestId('quick-stats')).toContainText('遠古白龍、深獄魔');
    await btn(page, '複製').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'CR 20｜AC／DC 21｜HP 300（225～375）｜熟練加值 +13｜每輪傷害 132｜攻擊 5 次 × 26（4d12）',
    );
    /* 全部的表 */
    await page.getByRole('button', { name: '全部挑戰等級的表' }).click();
    const table = page.getByTestId('cr-table');
    await expect(table.locator('tbody tr')).toHaveCount(34);
    await table.getByRole('button', { name: '5', exact: true }).click();
    await expect(page.getByTestId('stat-hp')).toHaveText('95');
    /* 怪物的特色 */
    await expect(page.getByTestId('features').locator('dt')).toHaveCount(10);
    /* 加進戰鬥追蹤 */
    const send = page.getByTestId('quick-send');
    await send.getByLabel('名字（選填）').fill('石像鬼');
    await send.getByRole('spinbutton').fill('2');
    const [ct] = await Promise.all([
      context.waitForEvent('page'),
      btn(send, '加進戰鬥追蹤').click(),
    ]);
    await routeFonts(ct);
    await expect(ct.locator('[data-testid="combatant"]')).toHaveCount(2, { timeout: 15_000 });
    await expect(ct.getByLabel('石像鬼 B的 HP 上限')).toHaveValue('95');
    await ct.close();
    expect(errors).toEqual([]);
  });

  test('點數購買：＋／－ 的限制、直接打的值、標準數組、背景與種族的加值、複製', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await tab(page, '能力值點數購買').click();
    const left = page.getByTestId('points-left');
    await expect(left).toHaveText('剩 27／27 點');
    await expect(page.getByRole('button', { name: '力量減 1' })).toBeDisabled();
    for (let i = 0; i < 7; i++) await page.getByRole('button', { name: '力量加 1' }).click();
    await expect(page.getByLabel('力量（點數購買）')).toHaveValue('15');
    await expect(left).toHaveText('剩 18／27 點');
    await expect(page.getByRole('button', { name: '力量加 1' })).toBeDisabled();
    /* 直接打：16 → 15；點數不夠時改成買得起的最高值 */
    await page.getByLabel('敏捷（點數購買）').fill('16');
    await page.getByLabel('敏捷（點數購買）').press('Enter');
    await expect(page.getByLabel('敏捷（點數購買）')).toHaveValue('15');
    await page.getByLabel('體質（點數購買）').fill('15');
    await page.getByLabel('體質（點數購買）').press('Enter');
    await expect(page.getByLabel('體質（點數購買）')).toHaveValue('15');
    await expect(left).toHaveText('剩 0／27 點');
    await page.getByLabel('智力（點數購買）').fill('12');
    await page.getByLabel('智力（點數購買）').press('Enter');
    await expect(page.getByLabel('智力（點數購買）')).toHaveValue('8');
    await expect(page.getByRole('button', { name: '感知加 1' })).toBeDisabled();
    /* 標準數組、依職業 */
    await btn(page, '套用標準數組').click();
    await expect(left).toHaveText('剩 0／27 點');
    await pick(page, page.getByLabel('選職業套用'), '法師（Wizard）');
    await expect(page.getByLabel('智力（點數購買）')).toHaveValue('15');
    await expect(page.getByLabel('感知（點數購買）')).toHaveValue('14');
    /* 2024 背景：賢者 → +2 智力、+1 體質 */
    await pick(page, page.getByLabel('背景'), /^賢者（Sage）/);
    await page.getByRole('radiogroup', { name: '+2' }).getByRole('radio', { name: '智力' }).click();
    await page.getByRole('radiogroup', { name: '+1' }).getByRole('radio', { name: '體質' }).click();
    const int = page.locator('[data-ability="int"]');
    await expect(int.getByTestId('final')).toContainText('最後 17（+3）');
    await expect(page.locator('[data-ability="con"]').getByTestId('final')).toContainText(
      '最後 14（+2）',
    );
    await page.getByRole('radio', { name: '三項各 +1' }).click();
    await expect(int.getByTestId('final')).toContainText('最後 16（+3）');
    await expect(page.locator('[data-ability="wis"]').getByTestId('final')).toContainText(
      '最後 15（+2）',
    );
    /* 2014 種族：半精靈（魅力 +2、自選兩項） */
    await page.getByRole('radio', { name: '2014（SRD 5.1）' }).click();
    await pick(page, page.getByLabel('種族'), /^半精靈（Half-Elf）/);
    await expect(page.locator('[data-ability="cha"]').getByTestId('final')).toContainText(
      '最後 12（+1）',
    );
    await expect(page.getByRole('checkbox', { name: '魅力' })).toHaveCount(0);
    await expect(page.locator('[data-ability="str"]').getByTestId('final')).toContainText(
      '加值 +1',
    );
    await page.getByRole('checkbox', { name: '力量' }).click();
    await page.getByRole('checkbox', { name: '智力' }).click();
    await expect(int.getByTestId('final')).toContainText('最後 16（+3）');
    await expect(page.getByRole('checkbox', { name: '體質' })).toBeDisabled();
    await btn(page, '複製結果').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      '力量 8（−1）、敏捷 13（+1）、體質 13（+1）、智力 16（+3）、感知 14（+2）、魅力 12（+1）\n點數購買 27／27 點｜2014（SRD 5.1）：半精靈（敏捷 +1、智力 +1、魅力 +2）',
    );
    expect(errors).toEqual([]);
  });

  test('自動儲存、專案檔（存、全部重來、開）', async ({ page }) => {
    const errors = await open(page);
    await example2(page);
    await page.waitForFunction((key) => (localStorage.getItem(key) ?? '').includes('食人魔'), KEY);
    await page.reload();
    await expect(page.getByTestId('total-xp')).toHaveText('1,125 XP');
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^5e 速查計算_\d{8}\.json$/);
    const path = (await dl.path()) as string;
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: '5e-calc',
    });
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(page.getByTestId('total-xp')).toHaveText('200 XP');
    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(path);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(page.getByTestId('total-xp')).toHaveText('1,125 XP');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await example2(page);
    await page.waitForFunction((key) => (localStorage.getItem(key) ?? '').includes('食人魔'), KEY);
    await page.reload();
    await expect(page.getByTestId('total-xp')).toHaveText('1,125 XP');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('5e-calc-1280.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test('三個分頁都沒有橫向捲動；視覺基準', async ({ page }) => {
    const errors = await open(page);
    await noHorizontalScroll(page);
    await tab(page, '快速怪物數值').click();
    await page.getByRole('button', { name: '全部挑戰等級的表' }).click();
    await expect(page.getByTestId('cr-table')).toBeVisible();
    await noHorizontalScroll(page);
    await tab(page, '能力值點數購買').click();
    await expect(page.getByTestId('point-buy')).toBeVisible();
    await noHorizontalScroll(page);
    await tab(page, '遭遇預算').click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('5e-calc-390.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});
