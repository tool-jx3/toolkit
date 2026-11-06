/**
 * 先攻與戰鬥追蹤（建置產物 next/combat-tracker/）的端對端測試：
 * - 開頁沒有錯誤、頁尾只有靈感來源、群組分頁、空的清單；
 * - 加入（Enter 移到下一欄、最後一欄加入、同名多隻加 A／B／C、擲先攻、排序）、下一位／上一位與輪數（N、Shift＋N）、跳過倒下的敵方；
 * - HP（打 -8／+5／12、±1、臨時 HP 先扣、勾選後一次傷害）、5e 的死亡豁免、狀態（SRD 的說明、持續回合倒數、自訂）、專注的提醒；
 * - 鎖定順序、新的戰鬥、刪除、隱藏；復原／重做；自動儲存；專案檔；原作的 JSON；複製文字；
 * - 玩家視圖（另開視窗：隱藏的不顯示、敵方 HP 概略、GM 一改就更新）；
 * - 390 寬沒有橫向捲動；1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('combat-tracker') ?? { id: 'combat-tracker', status: 'next' })}/`;
const KEY = 'trpg-toolkit:combat-tracker';

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
  /* 擲骰固定：d20 都是 11 */
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await routeFonts(page);
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: '先攻與戰鬥追蹤' })).toBeVisible();
  return errors;
}

const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const row = (page: Page, name: string) =>
  page.locator(`[data-testid="combatant"][data-name="${name}"]`);
const names = (page: Page) =>
  page
    .locator('[data-testid="combatant"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
const hp = (page: Page, name: string) => page.getByLabel(`${name}的目前 HP（可以打 -8、+5）`);

interface AddOpts {
  side?: '玩家角色' | '友方' | '敵方';
  init?: number;
  mod?: number;
  hp?: number;
  ac?: number;
  qty?: number;
}

async function add(page: Page, name: string, o: AddOpts = {}) {
  await page.locator('[data-add="name"]').fill(name);
  if (o.side) await page.getByRole('radio', { name: o.side, exact: true }).click();
  if (o.init !== undefined) await page.locator('[data-add="init"] input').fill(String(o.init));
  if (o.mod !== undefined) await page.locator('[data-add="initMod"] input').fill(String(o.mod));
  if (o.hp !== undefined) await page.locator('[data-add="maxHp"] input').fill(String(o.hp));
  if (o.ac !== undefined) await page.locator('[data-add="ac"] input').fill(String(o.ac));
  if (o.qty !== undefined) await page.locator('[data-add="qty"] input').fill(String(o.qty));
  await btn(page, '加入').click();
}

/** 艾琳（玩家角色 17、24 HP、AC 16）＋哥布林 ×3（加值 +2 → 13、7 HP、AC 15） */
async function seedParty(page: Page) {
  await add(page, '艾琳', { side: '玩家角色', init: 17, hp: 24, ac: 16 });
  await add(page, '哥布林', { side: '敵方', mod: 2, hp: 7, ac: 15, qty: 3 });
  await expect(page.locator('[data-testid="combatant"]')).toHaveCount(4);
}

/** 截圖前：等自動儲存寫好、重新整理（清掉通知與焦點）、捲回最上面 */
async function settle(page: Page) {
  const want = await page.locator('[data-testid="combatant"]').count();
  await page.waitForFunction(
    ([key, n]) => {
      const raw = localStorage.getItem(key as string);
      return !!raw && JSON.parse(raw).state.data.list.length === n;
    },
    [KEY, want] as const,
  );
  await page.reload();
  await expect(page.locator('[data-testid="combatant"]')).toHaveCount(want);
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、頁尾只有靈感來源、群組分頁、空的清單', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer')).toHaveText('靈感來源：Sly Flourish／Lazy GM Tools');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://github.com/mshea/lazy_gm_tools',
    );
    await expect(page.getByRole('link', { name: '5e 速查計算' })).toBeVisible();
    await expect(page.getByText('還沒有參戰者。從「加入參戰者」開始')).toBeVisible();
    await expect(page.getByTestId('round')).toHaveText('第 1 輪');
    expect(errors).toEqual([]);
  });

  test('加入：Enter 移到下一欄、最後一欄加入；同名多隻 A／B／C；擲先攻（同名共用）；排序', async ({
    page,
  }) => {
    const errors = await open(page);
    /* Enter：名字 → 先攻 → 先攻加值 → HP 上限 → AC → 數量（加入） */
    await page.locator('[data-add="name"]').fill('狼');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-add="init"] input')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await page.keyboard.type('11');
    await page.keyboard.press('Enter');
    await page.keyboard.type('13');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('2');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="combatant"]')).toHaveCount(2);
    expect(await names(page)).toEqual(['狼 A', '狼 B']);
    /* 先攻空白：1d20（固定 11）＋3＝14，兩隻共用 */
    await expect(page.getByLabel('狼 A的先攻')).toHaveValue('14');
    await expect(page.getByLabel('狼 B的先攻')).toHaveValue('14');
    await expect(page.getByLabel('狼 A的 AC')).toHaveValue('13');
    await expect(hp(page, '狼 A')).toHaveValue('11');
    await expect(page.locator('[data-add="name"]')).toBeFocused();
    await expect(page.locator('[data-add="name"]')).toHaveValue('');
    /* 再加一隻同名的：接著編 C；玩家角色排到前面 */
    await add(page, '狼', { init: 5 });
    await add(page, '艾琳', { side: '玩家角色', init: 18 });
    expect(await names(page)).toEqual(['艾琳', '狼 A', '狼 B', '狼 C']);
    /* 改先攻 → 重新排序 */
    await page.getByLabel('狼 C的先攻').fill('20');
    await page.getByLabel('狼 C的先攻').press('Enter');
    expect(await names(page)).toEqual(['狼 C', '艾琳', '狼 A', '狼 B']);
    /* 沒填名字時提示 */
    await btn(page, '加入').click();
    await expect(page.getByText('請填名字')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('回合：下一位（N）、繞回時輪數 +1、跳過倒下的敵方、上一位（Shift＋N）', async ({ page }) => {
    const errors = await open(page);
    await seedParty(page);
    expect(await names(page)).toEqual(['艾琳', '哥布林 A', '哥布林 B', '哥布林 C']);
    await expect(row(page, '艾琳')).toHaveAttribute('data-current', 'true');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('n');
    await expect(row(page, '哥布林 A')).toHaveAttribute('data-current', 'true');
    await expect(page.getByTestId('current')).toContainText('哥布林 A');
    /* 哥布林 B 打倒：輪到時跳過 */
    await hp(page, '哥布林 B').fill('-7');
    await hp(page, '哥布林 B').press('Enter');
    await expect(row(page, '哥布林 B')).toHaveAttribute('data-status', 'down');
    await expect(row(page, '哥布林 B').getByTestId('status')).toHaveText('倒下');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('n');
    await expect(row(page, '哥布林 C')).toHaveAttribute('data-current', 'true');
    await page.keyboard.press('n');
    await expect(row(page, '艾琳')).toHaveAttribute('data-current', 'true');
    await expect(page.getByTestId('round')).toHaveText('第 2 輪');
    await expect(page.getByText('第 2 輪', { exact: true }).last()).toBeVisible();
    await page.keyboard.press('Shift+N');
    await expect(row(page, '哥布林 C')).toHaveAttribute('data-current', 'true');
    await expect(page.getByTestId('round')).toHaveText('第 1 輪');
    /* 按鈕也可以 */
    await btn(page, '下一位').click();
    await expect(row(page, '艾琳')).toHaveAttribute('data-current', 'true');
    expect(errors).toEqual([]);
  });

  test('HP：打字、±1、臨時 HP 先扣、勾選後一次傷害；死亡豁免（5e）；專注的提醒', async ({
    page,
  }) => {
    const errors = await open(page);
    await seedParty(page);
    await hp(page, '艾琳').fill('-8');
    await hp(page, '艾琳').press('Enter');
    await expect(hp(page, '艾琳')).toHaveValue('16');
    await hp(page, '艾琳').fill('+3');
    await hp(page, '艾琳').press('Enter');
    await expect(hp(page, '艾琳')).toHaveValue('19');
    await hp(page, '艾琳').fill('50');
    await hp(page, '艾琳').press('Enter');
    await expect(hp(page, '艾琳')).toHaveValue('24');
    await page.getByRole('button', { name: '艾琳受到 1 點傷害' }).click();
    await expect(hp(page, '艾琳')).toHaveValue('23');
    /* 看不懂的字：還原 */
    await hp(page, '艾琳').fill('abc');
    await hp(page, '艾琳').press('Enter');
    await expect(hp(page, '艾琳')).toHaveValue('23');

    /* 臨時 HP：勾選兩隻哥布林＋艾琳 → 給 5 → 傷害 7 */
    const panel = page.getByTestId('hp-panel');
    await page.getByRole('checkbox', { name: '勾選「艾琳」' }).click();
    await page.getByRole('checkbox', { name: '勾選「哥布林 A」' }).click();
    await expect(panel).toContainText('套用到勾選的 2 位');
    await panel.getByRole('spinbutton').fill('5');
    await btn(panel, '給臨時 HP').click();
    await expect(page.getByLabel('艾琳的臨時 HP')).toHaveValue('5');
    await panel.getByRole('spinbutton').fill('7');
    await btn(panel, '傷害').click();
    await expect(page.getByLabel('艾琳的臨時 HP')).toHaveValue('0');
    await expect(hp(page, '艾琳')).toHaveValue('21');
    await expect(hp(page, '哥布林 A')).toHaveValue('5');
    await btn(panel, '取消勾選').click();
    await expect(panel).toContainText('套用到目前輪到的「艾琳」');

    /* 專注：受到傷害時提醒 DC */
    await page.getByRole('button', { name: '幫「艾琳」加狀態' }).click();
    const dlg = page.getByTestId('cond-dialog');
    await dlg.getByRole('button', { name: '專注（Concentration）' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '加上', exact: true }).click();
    await expect(row(page, '艾琳').locator('[data-cond="concentration"]')).toBeVisible();
    await hp(page, '艾琳').fill('-4');
    await hp(page, '艾琳').press('Enter');
    await expect(page.getByText('艾琳要做專注檢定：體質豁免 DC 10').first()).toBeVisible();

    /* 0 HP：死亡豁免（擲出 11：成功） */
    await hp(page, '艾琳').fill('0');
    await hp(page, '艾琳').press('Enter');
    const ds = row(page, '艾琳').getByTestId('death-saves');
    await expect(ds).toBeVisible();
    await expect(row(page, '艾琳')).toHaveAttribute('data-status', 'dying');
    await page.getByRole('button', { name: '幫「艾琳」擲死亡豁免' }).click();
    await expect(page.getByText('艾琳：擲出 11：成功（1／3）').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '艾琳的死亡豁免成功第 1 次' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    /* 0 HP 時受到傷害：失敗一次；重擊兩次 → 3 次失敗死亡 */
    await page.getByRole('button', { name: '艾琳受到 1 點傷害' }).click();
    await expect(page.getByRole('button', { name: '艾琳的死亡豁免失敗第 1 次' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('checkbox', { name: '勾選「艾琳」' }).click();
    await page.getByRole('checkbox', { name: /重擊/ }).click();
    await panel.getByRole('spinbutton').fill('1');
    await btn(panel, '傷害').click();
    await expect(row(page, '艾琳')).toHaveAttribute('data-status', 'dead');
    await expect(page.getByText('艾琳死亡了').first()).toBeVisible();
    /* 死亡的不回復 */
    await btn(panel, '治療').click();
    await expect(page.getByText('艾琳已經死亡，沒有回復').first()).toBeVisible();
    /* 復原：回到還沒死 */
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(row(page, '艾琳')).toHaveAttribute('data-status', 'dying');
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.press('Control+Shift+z');
    await expect(row(page, '艾琳')).toHaveAttribute('data-status', 'dead');
    expect(errors).toEqual([]);
  });

  test('狀態：SRD 的名稱與說明、持續回合倒數、自訂狀態、編輯與拿掉；關掉 5e 的狀態', async ({
    page,
  }) => {
    const errors = await open(page);
    await seedParty(page);
    await page.getByRole('button', { name: '幫「哥布林 B」加狀態' }).click();
    const dlg = page.getByTestId('cond-dialog');
    await expect(dlg.getByRole('button', { name: /（/ })).toHaveCount(16);
    await dlg.getByRole('button', { name: '倒地（Prone）' }).click();
    await expect(page.getByTestId('cond-details')).toContainText('你只能爬行');
    await page.getByRole('dialog').getByRole('radio', { name: '幾輪' }).click();
    await page.getByRole('dialog').getByRole('spinbutton', { name: '幾輪' }).fill('2');
    await page.getByRole('dialog').getByRole('button', { name: '加上', exact: true }).click();
    const chip = row(page, '哥布林 B').locator('[data-cond="prone"]');
    await expect(chip).toContainText('倒地2 輪');
    /* 自訂狀態 */
    await page.getByRole('button', { name: '幫「哥布林 B」加狀態' }).click();
    await page.getByRole('dialog').getByLabel('自訂狀態').fill('被標記');
    await page.getByRole('dialog').getByLabel('自訂狀態').press('Enter');
    await expect(row(page, '哥布林 B').locator('[data-cond="被標記"]')).toBeVisible();
    /* 輪到哥布林 B 兩次 → 倒地拿掉 */
    await btn(page, '下一位').click();
    await btn(page, '下一位').click();
    await expect(chip).toContainText('倒地1 輪');
    for (let i = 0; i < 4; i++) await btn(page, '下一位').click();
    await expect(chip).toHaveCount(0);
    await expect(page.getByText('哥布林 B的「倒地」結束了').first()).toBeVisible();
    /* 編輯：力竭 3 → 改成 4、拿掉 */
    await page.getByRole('button', { name: '幫「哥布林 A」加狀態' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '力竭（Exhaustion）' }).click();
    await page.getByRole('dialog').getByLabel('力竭等級').fill('3');
    await page.getByRole('dialog').getByRole('button', { name: '加上', exact: true }).click();
    const ex = row(page, '哥布林 A').locator('[data-cond="exhaustion"]');
    await expect(ex).toContainText('力竭 3');
    await ex.getByRole('button').first().click();
    await page.getByRole('dialog').getByLabel('力竭等級').fill('4');
    await page.getByRole('dialog').getByRole('button', { name: '儲存', exact: true }).click();
    await expect(ex).toContainText('力竭 4');
    await ex.getByRole('button', { name: '拿掉「力竭 4」' }).click();
    await expect(ex).toHaveCount(0);
    /* 關掉 5e 的狀態：只剩自訂 */
    await page.getByRole('switch', { name: '5e 的狀態（SRD 5.2.1）' }).click();
    await page.getByRole('button', { name: '幫「哥布林 A」加狀態' }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: '倒地（Prone）' }),
    ).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('button', { name: '被標記' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('鎖定順序、依先攻排序、新的戰鬥、刪除、隱藏與陣營、複製文字', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await seedParty(page);
    await btn(page, '鎖定順序').click();
    await page.getByLabel('哥布林 C的先攻').fill('25');
    await page.getByLabel('哥布林 C的先攻').press('Enter');
    expect(await names(page)).toEqual(['艾琳', '哥布林 A', '哥布林 B', '哥布林 C']);
    await expect(btn(page, '依先攻排序')).toBeDisabled();
    await btn(page, '鎖定順序').click();
    await btn(page, '依先攻排序').click();
    expect(await names(page)).toEqual(['哥布林 C', '艾琳', '哥布林 A', '哥布林 B']);
    /* 隱藏（伏兵）、改陣營 */
    await page.getByRole('button', { name: '「哥布林 C」的更多操作' }).click();
    await page.getByRole('menuitem', { name: '在玩家視圖隱藏（伏兵）' }).click();
    await expect(row(page, '哥布林 C')).toContainText('隱藏中');
    await page.getByRole('button', { name: '「哥布林 A」的更多操作' }).click();
    await page.getByRole('menuitem', { name: '陣營：友方' }).click();
    await expect(row(page, '哥布林 A')).toContainText('友方');
    /* 複製文字：隱藏的不列 */
    await btn(page, '複製文字').click();
    await expect(page.getByText('已複製先攻順序').first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      ['**先攻順序**（第 1 輪）', '- 17：艾琳', '- 13：哥布林 A', '- 13：哥布林 B'].join('\n'),
    );
    /* 刪除（確認後；可以復原） */
    await page.getByRole('button', { name: '「哥布林 B」的更多操作' }).click();
    await page.getByTestId('row-remove').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(row(page, '哥布林 B')).toHaveCount(0);
    /* 新的戰鬥：只留玩家角色 */
    await btn(page, '下一位').click();
    await btn(page, '新的戰鬥').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '開始新的戰鬥' }).click();
    expect(await names(page)).toEqual(['艾琳']);
    await expect(row(page, '艾琳')).toHaveAttribute('data-current', 'true');
    await page.keyboard.press('Control+z');
    expect(await names(page)).toEqual(['哥布林 C', '艾琳', '哥布林 A']);
    expect(errors).toEqual([]);
  });

  test('自動儲存、專案檔（存、全部重來、開）、Ctrl＋S、原作的 JSON（讀、匯出）', async ({
    page,
  }) => {
    const errors = await open(page);
    await seedParty(page);
    await btn(page, '下一位').click();
    await page.waitForFunction(
      (key) => (localStorage.getItem(key) ?? '').includes('哥布林 C'),
      KEY,
    );
    await page.reload();
    expect(await names(page)).toEqual(['艾琳', '哥布林 A', '哥布林 B', '哥布林 C']);
    await expect(row(page, '哥布林 A')).toHaveAttribute('data-current', 'true');

    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^先攻與戰鬥追蹤_\d{8}\.json$/);
    const path = (await dl.path()) as string;
    const project = JSON.parse(readFileSync(path, 'utf8'));
    expect(project).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'combat-tracker',
      version: 1,
    });
    expect(project.data.list.map((c: { name: string }) => c.name)).toEqual([
      '艾琳',
      '哥布林 A',
      '哥布林 B',
      '哥布林 C',
    ]);
    const [dl2] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    expect(JSON.parse(readFileSync((await dl2.path()) as string, 'utf8')).data).toEqual(
      project.data,
    );

    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(page.locator('[data-testid="combatant"]')).toHaveCount(0);

    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(path);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    expect(await names(page)).toEqual(['艾琳', '哥布林 A', '哥布林 B', '哥布林 C']);

    /* 原作的 JSON：匯出（原作的欄位）→ 讀入（加在後面） */
    const [dl3] = await Promise.all([
      page.waitForEvent('download'),
      btn(page, '匯出原作格式的 JSON').click(),
    ]);
    expect(dl3.suggestedFilename()).toMatch(/^combat_\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.json$/);
    const orig = JSON.parse(readFileSync((await dl3.path()) as string, 'utf8'));
    expect(orig.currentTurnIndex).toBe(1);
    expect(orig.combatants[0]).toMatchObject({
      name: '艾琳',
      initiative: 17,
      maxHp: 24,
      currentHp: 24,
      ac: 16,
    });
    const [chooser2] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '讀入原作的 JSON').click(),
    ]);
    await chooser2.setFiles({
      name: 'combat.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          combatants: [{ id: 1, name: 'Bandit', initiative: 30, maxHp: 11, currentHp: 4, ac: 12 }],
          currentTurnIndex: 0,
        }),
      ),
    });
    await expect(page.getByText('已讀入 1 位').first()).toBeVisible();
    expect(await names(page)).toEqual(['Bandit', '艾琳', '哥布林 A', '哥布林 B', '哥布林 C']);
    await expect(hp(page, 'Bandit')).toHaveValue('4');
    const [chooser3] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '讀入原作的 JSON').click(),
    ]);
    await chooser3.setFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"x":1}'),
    });
    await expect(page.getByText('無法讀入「bad.json」').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('玩家視圖：另開視窗、隱藏的不顯示、敵方 HP 概略、GM 一改就更新；關於規則內容', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await seedParty(page);
    await page.getByRole('button', { name: '「哥布林 C」的更多操作' }).click();
    await page.getByRole('menuitem', { name: '在玩家視圖隱藏（伏兵）' }).click();
    const [pv] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('open-player').click(),
    ]);
    const pvErrors: string[] = [];
    pv.on('pageerror', (e) => pvErrors.push(e.message));
    await routeFonts(pv);
    await expect(pv.getByRole('heading', { level: 1, name: '先攻順序' })).toBeVisible();
    const rows = pv.getByTestId('player-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('艾琳');
    await expect(rows.nth(0)).toHaveAttribute('data-current', 'true');
    await expect(rows.nth(0).getByTestId('player-hp')).toHaveText('24／24');
    await expect(rows.nth(1).getByTestId('player-hp')).toHaveText('無傷');
    await expect(pv.getByText('哥布林 C')).toHaveCount(0);
    /* GM 這邊改：傷害、下一位、狀態 */
    await hp(page, '哥布林 A').fill('-5');
    await hp(page, '哥布林 A').press('Enter');
    await expect(rows.nth(1).getByTestId('player-hp')).toHaveText('重傷');
    await btn(page, '下一位').click();
    await expect(rows.nth(1)).toHaveAttribute('data-current', 'true');
    await expect(pv.getByTestId('player-round')).toHaveText('第 1 輪');
    /* 設定：敵方的 HP 不顯示 */
    await page
      .getByRole('radiogroup', { name: '敵方的 HP' })
      .getByRole('radio', { name: '不顯示' })
      .click();
    await expect(rows.nth(1).getByTestId('player-hp')).toHaveCount(0);
    /* 字的大小 */
    await pv.getByRole('radio', { name: '特大' }).click();
    await expect(pv.locator('main')).toHaveClass(/text-3xl/);
    expect(pvErrors).toEqual([]);
    await pv.close();
    /* 關於規則內容：SRD 5.2.1 的署名照原文 */
    await btn(page, '關於規則內容').click();
    await expect(page.getByTestId('about-rules')).toContainText(
      'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC',
    );
    expect(errors).toEqual([]);
  });

  test('兩個分頁同步（F07）；鍵盤調整順序（Alt＋↓），鎖定時不動', async ({ page, context }) => {
    const errors = await open(page);
    await seedParty(page);
    const other = await context.newPage();
    await other.addInitScript(() => {
      Math.random = () => 0.5;
    });
    await routeFonts(other);
    await other.goto(URL);
    await expect(other.locator('[data-testid="combatant"]')).toHaveCount(4);
    /* 另一個分頁加的，這邊跟著出現；這邊改的，另一邊也跟著 */
    await add(other, '狼', { init: 30 });
    await expect(row(page, '狼')).toBeVisible();
    await hp(page, '艾琳').fill('-4');
    await hp(page, '艾琳').press('Enter');
    await expect(hp(other, '艾琳')).toHaveValue('20');
    await other.close();
    /* 鍵盤：列有焦點時 Alt＋↓ 往下移 */
    await page.locator('ul[aria-label="參戰者"] > li').first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await names(page)).toEqual(['艾琳', '狼', '哥布林 A', '哥布林 B', '哥布林 C']);
    await btn(page, '鎖定順序').click();
    await page.locator('ul[aria-label="參戰者"] > li').nth(1).focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await names(page)).toEqual(['艾琳', '狼', '哥布林 A', '哥布林 B', '哥布林 C']);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await seedParty(page);
    await hp(page, '哥布林 B').fill('-7');
    await hp(page, '哥布林 B').press('Enter');
    await page.getByRole('button', { name: '幫「哥布林 A」加狀態' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '倒地（Prone）' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '加上', exact: true }).click();
    await btn(page, '下一位').click();
    await settle(page);
    await expect(page).toHaveScreenshot('combat-tracker-1280.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test('沒有橫向捲動；清單在上；視覺基準', async ({ page }) => {
    const errors = await open(page);
    await seedParty(page);
    await noHorizontalScroll(page);
    const listTop = await page
      .locator('[data-testid="combatant"]')
      .first()
      .evaluate((e) => e.getBoundingClientRect().top);
    const addTop = await page
      .locator('[data-add="name"]')
      .evaluate((e) => e.getBoundingClientRect().top);
    expect(listTop).toBeLessThan(addTop);
    await settle(page);
    await expect(page).toHaveScreenshot('combat-tracker-390.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});
