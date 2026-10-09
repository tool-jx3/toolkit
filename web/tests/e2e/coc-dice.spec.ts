/**
 * CoC 擲骰工具（建置產物 tools/coc-dice/）的端對端測試。亂數用頁面上的注入點 `window.__cocRandom` 固定：
 * - 開頁沒有錯誤、頁尾只有靈感來源、群組分頁；
 * - 技能檢定：獎勵骰／懲罰骰、十位骰變暗、00＋0＝100、成功等級、沒填技能值、Enter 擲骰、技能值的增減鈕；
 * - 自訂擲骰：全形算式、Enter、明細紀錄、快速加骰與合併、清除、錯誤訊息；
 * - 動畫：約 0.8 秒的跳動後揭曉（減少動態時立刻揭曉）；
 * - 擲骰紀錄：開關、時間、全部刪除（取消／確認）、最多 200 筆、重新整理後還在、舊版紀錄搬移；
 * - 傷害計算：扣護甲加總、:HP- 指令、點一下複製、兩種錯誤、自訂擲骰帶入；
 * - 復原、專案檔；390 寬沒有橫向捲動；1280／390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('coc-dice') ?? { id: 'coc-dice', status: 'next' })}/`;
const PREFS_KEY = 'trpg-toolkit:coc-dice:preview';

/** 讓一顆 sides 面骰擲出 face 的亂數 */
const r = (face: number, sides: number) => (face - 0.5) / sides;

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
  await expect(page.getByRole('heading', { level: 1, name: 'CoC 擲骰工具' })).toBeVisible();
  return errors;
}

/** 之後的擲骰依序取這些亂數 */
async function setRandom(page: Page, values: number[]) {
  await page.evaluate((seq) => {
    let i = 0;
    (window as unknown as { __cocRandom: () => number }).__cocRandom = () => seq[i++ % seq.length];
  }, values);
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const skillInput = (page: Page) => page.getByLabel('技能值', { exact: true });
const exprInput = (page: Page) => page.getByTestId('custom-expr');
const result = (page: Page) => page.getByTestId('dice-result');
const total = (page: Page) => page.getByTestId('roll-total');
const level = (page: Page) => page.getByTestId('roll-level');
const dice = (page: Page) => result(page).getByTestId('die');
const logItems = (page: Page) => page.getByTestId('log-list').locator('li');

async function diceFaces(page: Page) {
  return dice(page).evaluateAll((els) =>
    els.map((el) => ({
      face: el.textContent,
      kind: el.getAttribute('data-kind'),
      dimmed: el.getAttribute('data-dimmed') === 'true',
    })),
  );
}

async function storedLog(page: Page): Promise<{ time: string; text: string }[]> {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? '{"state":{"data":{"log":[]}}}').state.data.log,
    PREFS_KEY,
  );
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('減少動態（立刻揭曉）', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、頁尾只有靈感來源、群組分頁、兩個分頁', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer')).toHaveText('靈感來源：ihoukentiku/ihoukentiku.github.io');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://github.com/ihoukentiku/ihoukentiku.github.io',
    );
    await expect(page.getByRole('link', { name: 'CoC NPC 產生器' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '擲骰' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: '傷害計算' })).toBeVisible();
    await expect(result(page)).toContainText('按「擲骰」開始。');
    await expect(page.getByRole('radio', { name: '不加獎勵骰或懲罰骰' })).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('技能檢定：獎勵骰取小、沒採用的十位骰變暗、成功等級與紀錄', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: '獎勵骰 1 顆' }).click();
    await skillInput(page).fill('50');
    /* 個位 3 → 十位 80、10 → 候選 83、13 → 13（困難成功） */
    await setRandom(page, [0.35, 0.85, 0.15]);
    await btn(page, '技能檢定：擲骰').click();
    await expect(total(page)).toHaveText('13');
    await expect(level(page)).toHaveText('困難成功');
    await expect(level(page)).toHaveAttribute('data-level', 'hard');
    expect(await diceFaces(page)).toEqual([
      { face: '80', kind: 'tens', dimmed: true },
      { face: '10', kind: 'tens', dimmed: false },
      { face: '3', kind: 'ones', dimmed: false },
    ]);
    await expect(page.getByTestId('roll-announce')).toHaveText('結果 13，困難成功');
    const log = await storedLog(page);
    expect(log[0].text).toBe('技能值[50] BD/PD[1] ＞ 83, 13 ＞ 13 ＞ 困難成功');
    expect(log[0].time).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    /* 懲罰骰 2 顆：取最大；00＋0＝100 → 大失敗（技能值 50 以上只有 100） */
    await page.getByRole('radio', { name: '懲罰骰 2 顆' }).click();
    await setRandom(page, [r(1, 10), r(5, 10), r(1, 10), r(3, 10)]);
    await btn(page, '技能檢定：擲骰').click();
    await expect(total(page)).toHaveText('100');
    await expect(level(page)).toHaveText('大失敗');
    expect((await diceFaces(page)).map((d) => [d.face, d.dimmed])).toEqual([
      ['40', true],
      ['00', false],
      ['20', true],
      ['0', false],
    ]);
    expect((await storedLog(page))[0].text).toBe(
      '技能值[50] BD/PD[-2] ＞ 40, 100, 20 ＞ 100 ＞ 大失敗',
    );

    /* 沒有獎勵骰：一顆十位骰、不變暗；出 1 → 大成功 */
    await page.getByRole('radio', { name: '不加獎勵骰或懲罰骰' }).click();
    await setRandom(page, [r(2, 10), r(1, 10)]);
    await btn(page, '技能檢定：擲骰').click();
    await expect(total(page)).toHaveText('1');
    await expect(level(page)).toHaveText('大成功');
    expect(await diceFaces(page)).toEqual([
      { face: '00', kind: 'tens', dimmed: false },
      { face: '1', kind: 'ones', dimmed: false },
    ]);

    /* 技能值 49：96 以上大失敗；在技能值欄按 Enter 也會擲 */
    await skillInput(page).fill('49');
    await setRandom(page, [r(7, 10), r(10, 10)]);
    await skillInput(page).press('Enter');
    await expect(total(page)).toHaveText('96');
    await expect(level(page)).toHaveText('大失敗');

    /* 沒填技能值：只擲 1D100、不判定 */
    await skillInput(page).fill('');
    await setRandom(page, [r(6, 10), r(5, 10)]);
    await btn(page, '技能檢定：擲骰').click();
    await expect(total(page)).toHaveText('45');
    await expect(level(page)).toHaveCount(0);
    expect((await storedLog(page))[0].text).toBe('技能值[] BD/PD[0] ＞ 45 ＞ 45');
    expect(errors).toEqual([]);
  });

  test('技能值的增減鈕（空白按減少是 0、按增加是 1）與成功等級的分界', async ({ page }) => {
    await open(page);
    await btn(page, '技能值：減少').click();
    await expect(skillInput(page)).toHaveValue('0');
    await skillInput(page).fill('');
    await btn(page, '技能值：增加').click();
    await expect(skillInput(page)).toHaveValue('1');
    await btn(page, '技能值：增加').click();
    await expect(skillInput(page)).toHaveValue('2');
    await btn(page, '技能值：減少').click();
    await expect(skillInput(page)).toHaveValue('1');

    /* 指數寫法：擲骰和增減鈕用同一個值（1e2 是 100；對等驗證後修正） */
    await skillInput(page).fill('1e2');
    await setRandom(page, [r(1, 10), r(10, 10)]);
    await btn(page, '技能檢定：擲骰').click();
    await expect(total(page)).toHaveText('90');
    expect((await storedLog(page))[0].text).toContain('技能值[100]');
    await btn(page, '技能值：增加').click();
    await expect(skillInput(page)).toHaveValue('101');

    const cases: [number, number, string][] = [
      [60, 12, '極限成功'],
      [60, 13, '困難成功'],
      [60, 30, '困難成功'],
      [60, 31, '一般成功'],
      [60, 60, '一般成功'],
      [60, 61, '失敗'],
      [60, 99, '失敗'],
    ];
    for (const [skill, roll, label] of cases) {
      await skillInput(page).fill(String(skill));
      const tens = Math.floor((roll % 100) / 10);
      const ones = roll % 10;
      await setRandom(page, [r(ones + 1, 10), r(tens + 1, 10)]);
      await btn(page, '技能檢定：擲骰').click();
      await expect(total(page)).toHaveText(String(roll));
      await expect(level(page)).toHaveText(label);
    }
  });

  test('自訂擲骰：全形、Enter、明細；快速加骰的合併；清除；錯誤訊息', async ({ page }) => {
    const errors = await open(page);
    await exprInput(page).fill('１Ｄ６＋１ｄ４＋２');
    await setRandom(page, [r(3, 6), r(2, 4)]);
    await exprInput(page).press('Enter');
    await expect(total(page)).toHaveText('7');
    expect((await diceFaces(page)).map((d) => d.face)).toEqual(['3', '2']);
    expect((await storedLog(page))[0].text).toBe('1D6+1D4+2 ＞ 1D6[3]+1D4[2]+2 ＞ 7');

    await setRandom(page, [r(4, 6), r(1, 4), r(4, 4)]);
    await exprInput(page).fill('-1d6-2D4+10');
    await btn(page, '自訂擲骰：擲骰').click();
    await expect(total(page)).toHaveText('1');
    expect((await storedLog(page))[0].text).toBe('-1d6-2D4+10 ＞ -1D6[4]-2D4[1,4]+10 ＞ 1');

    /* 快速加骰；清除鈕按了就消失，焦點移回算式欄（對等驗證後修正） */
    await btn(page, '清除算式').focus();
    await page.keyboard.press('Enter');
    await expect(exprInput(page)).toHaveValue('');
    await expect(exprInput(page)).toBeFocused();
    /* 只打了正負號時加骰當成空白（對等驗證後修正） */
    await exprInput(page).fill('+');
    await btn(page, '算式加上 1D6').click();
    await expect(exprInput(page)).toHaveValue('1D6');
    await btn(page, '清除算式').click();
    const quick = (t: string) => btn(page, `算式加上 ${t}`).click();
    await quick('1D6');
    await expect(exprInput(page)).toHaveValue('1D6');
    await quick('1D6');
    await expect(exprInput(page)).toHaveValue('2D6');
    await quick('1');
    await expect(exprInput(page)).toHaveValue('2D6+1');
    await quick('1');
    await expect(exprInput(page)).toHaveValue('2D6+2');
    await quick('1D4');
    await quick('1D4');
    await expect(exprInput(page)).toHaveValue('2D6+2+2D4');
    await exprInput(page).fill('1D6-1D4');
    await quick('1D4');
    await expect(exprInput(page)).toHaveValue('1D6-1D4+1D4');
    await exprInput(page).fill('３ｄ８ ');
    await quick('1D8');
    await expect(exprInput(page)).toHaveValue('4D8');
    for (const t of ['1D3', '1D10', '1D12', '1D20', '1D100']) await quick(t);
    await expect(exprInput(page)).toHaveValue('4D8+1D3+1D10+1D12+1D20+1D100');

    /* 錯誤：不擲骰、不寫紀錄；改算式後錯誤消失 */
    const before = (await storedLog(page)).length;
    await exprInput(page).fill('2D6×5');
    await exprInput(page).press('Enter');
    await expect(page.getByText(/看不懂這個算式/)).toBeVisible();
    await exprInput(page).fill('0D6');
    await exprInput(page).press('Enter');
    await expect(page.getByText('骰子數與面數都要 1 以上。')).toBeVisible();
    await exprInput(page).fill('1D6');
    await expect(page.getByText('骰子數與面數都要 1 以上。')).toHaveCount(0);
    expect((await storedLog(page)).length).toBe(before);
    /* 空白：什麼都不做 */
    await exprInput(page).fill('');
    await btn(page, '自訂擲骰：擲骰').click();
    expect((await storedLog(page)).length).toBe(before);
    expect(errors).toEqual([]);
  });

  test('擲骰紀錄：開關、全部刪除要確認、重新整理後還在、最多 200 筆', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByTestId('log-list')).toBeHidden();
    await setRandom(page, [0.1, 0.2, 0.3, 0.4]);
    await btn(page, '技能檢定：擲骰').click();
    await exprInput(page).fill('2D6');
    await btn(page, '自訂擲骰：擲骰').click();
    await btn(page, '顯示紀錄').click();
    await expect(logItems(page)).toHaveCount(2);
    await expect(logItems(page).first()).toContainText('2D6 ＞ 2D6[');
    await expect(logItems(page).nth(1)).toContainText('技能值[] BD/PD[0] ＞');
    await expect(logItems(page).first()).toContainText(/^\[\d{2}:\d{2}:\d{2}\]/);
    await expect(page.getByTestId('log-count')).toHaveText('（2 筆）');

    /* 重新整理：紀錄與面板開關都還在 */
    await page.waitForTimeout(100);
    await page.reload();
    await expect(logItems(page)).toHaveCount(2);
    await btn(page, '收起紀錄').click();
    await expect(page.getByTestId('log-list')).toBeHidden();
    await btn(page, '顯示紀錄').click();

    /* 全部刪除：取消時不刪 */
    await btn(page, '全部刪除').click();
    const dialog = page.getByRole('alertdialog', { name: '刪除所有擲骰紀錄？' });
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(logItems(page)).toHaveCount(2);
    await btn(page, '全部刪除').click();
    await dialog.getByRole('button', { name: '刪除' }).click();
    await expect(page.getByText('還沒有擲骰紀錄。')).toBeVisible();
    await expect(btn(page, '全部刪除')).toBeDisabled();

    /* 200 筆的上限：放 200 筆再擲一次，最舊的被擠掉 */
    await page.evaluate((key) => {
      const log = Array.from({ length: 200 }, (_, i) => ({
        id: `x${i}`,
        time: '01:02:03',
        text: `第 ${i} 筆`,
      }));
      localStorage.setItem(
        key,
        JSON.stringify({ state: { data: { tab: 'roll', logOpen: true, log } }, version: 1 }),
      );
    }, PREFS_KEY);
    await page.reload();
    await expect(page.getByTestId('log-count')).toHaveText('（200 筆）');
    await btn(page, '技能檢定：擲骰').click();
    await expect(page.getByTestId('log-count')).toHaveText('（200 筆）');
    const log = await storedLog(page);
    expect(log).toHaveLength(200);
    expect(log[0].text).toMatch(/^技能值\[\]/);
    expect(log[1].text).toBe('第 0 筆');
    expect(log[199].text).toBe('第 198 筆');
    expect(errors).toEqual([]);
  });

  test('壞掉的存檔：用預設值、頁面照常', async ({ page }) => {
    const errors = await open(page);
    await page.evaluate((key) => {
      localStorage.setItem(
        'trpg-toolkit:coc-dice',
        JSON.stringify({ state: { data: { skill: 5, bonus: 'x', expr: null } }, version: 1 }),
      );
      localStorage.setItem(
        key,
        JSON.stringify({ state: { data: { log: 'oops', tab: 3 } }, version: 1 }),
      );
    }, PREFS_KEY);
    await page.reload();
    await expect(skillInput(page)).toHaveValue('');
    await expect(page.getByRole('radio', { name: '不加獎勵骰或懲罰骰' })).toBeChecked();
    await expect(page.getByTestId('log-count')).toHaveText('（0 筆）');
    await btn(page, '技能檢定：擲骰').click();
    await expect(page.getByTestId('log-count')).toHaveText('（1 筆）');
    expect(errors).toEqual([]);
  });

  test('舊版的擲骰紀錄（iklab_coc7_dice_v1）第一次開啟時搬過來', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        'iklab_coc7_dice_v1',
        JSON.stringify([
          { time: '下午3:04:05', text: '1D6 ＞ 1D6[4] ＞ 4' },
          { time: '下午3:00:00', text: '技能值[50] BD/PD[0] ＞ 45 ＞ 45 ＞ 一般成功' },
        ]),
      );
    });
    await page.reload();
    await btn(page, '顯示紀錄').click();
    await expect(logItems(page)).toHaveCount(2);
    await expect(logItems(page).first()).toHaveText('[下午3:04:05]1D6 ＞ 1D6[4] ＞ 4');
    await expect(logItems(page).nth(1)).toContainText(
      '技能值[50] BD/PD[0] ＞ 45 ＞ 45 ＞ 一般成功',
    );
    /* 新版有了自己的紀錄之後就不再讀舊版（舊版的不刪） */
    await btn(page, '全部刪除').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await page.waitForTimeout(100);
    await page.reload();
    await expect(page.getByTestId('log-count')).toHaveText('（0 筆）');
    expect(await page.evaluate(() => localStorage.getItem('iklab_coc7_dice_v1'))).not.toBeNull();
  });

  test.describe('剪貼簿', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('傷害計算：扣護甲加總、指令點一下複製、兩種錯誤；自訂擲骰帶入', async ({ page }) => {
      const errors = await open(page);
      await page.getByRole('tab', { name: '傷害計算' }).click();
      const text = page.getByTestId('damage-text');
      await expect(text).toHaveAttribute('placeholder', /\(1D10\+2\) ＞ 3\[3\]\+2 ＞ 5/);
      await text.fill(
        [
          '調查員 - 今天 21:04',
          'x3 1D10+2 手槍 #1',
          '(1D10+2) ＞ 3[3]+2 ＞ 5',
          '',
          '#2',
          '(1D10+2) ＞ 7[7]+2 ＞ 9',
          '',
          '#3',
          '(1D10+2) ＞ 4[4]+2 ＞ 6',
          'CC<=50 (1D100<=50) ＞ 23 ＞ 成功',
        ].join('\n'),
      );
      await page.getByLabel('護甲').fill('1');
      await btn(page, '計算').click();
      await expect(page.getByTestId('damage-total')).toHaveText('傷害合計：17');
      await expect(page.getByTestId('damage-detail')).toContainText('共 3 筆：5、9、6');
      await expect(page.getByTestId('damage-detail')).toContainText('扣掉護甲 1 之後：4、8、5');
      await expect(page.getByTestId('damage-command')).toHaveText(':HP-17');
      await page.getByTestId('damage-command').click();
      await expect(page.getByTestId('damage-copied')).toHaveText('已複製指令！');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(':HP-17');
      await expect(page.getByTestId('damage-copied')).toBeHidden({ timeout: 4000 });

      /* 護甲比傷害大：每筆最少 0 */
      await page.getByLabel('護甲').fill('7');
      await btn(page, '計算').click();
      await expect(page.getByTestId('damage-total')).toHaveText('傷害合計：2');

      /* 錯誤：護甲空白（先檢查）、找不到結果 */
      await page.getByLabel('護甲').fill('');
      await btn(page, '計算').click();
      await expect(page.getByTestId('damage-error')).toHaveText('請輸入正確的護甲值');
      await page.getByLabel('護甲').fill('0');
      await text.fill('沒有擲骰結果');
      await btn(page, '計算').click();
      await expect(page.getByTestId('damage-error')).toHaveText('找不到傷害擲骰結果');

      /* 自訂擲骰的結果帶入傷害計算 */
      await text.fill('');
      await page.getByRole('tab', { name: '擲骰' }).click();
      await exprInput(page).fill('1D10+2');
      await setRandom(page, [r(7, 10)]);
      await exprInput(page).press('Enter');
      await btn(page, '帶入傷害計算').click();
      await expect(btn(page, '已帶入傷害計算')).toBeDisabled();
      await page.getByRole('tab', { name: '傷害計算' }).click();
      await expect(text).toHaveValue('1D10+2 ＞ 1D10[7]+2 ＞ 9');
      await btn(page, '計算').click();
      await expect(page.getByTestId('damage-total')).toHaveText('傷害合計：9');
      expect(errors).toEqual([]);
    });
  });

  test('復原／重做、自動保存、專案檔', async ({ page }) => {
    const errors = await open(page);
    await skillInput(page).fill('65');
    await page.waitForTimeout(450);
    await page.getByRole('radio', { name: '獎勵骰 2 顆' }).click();
    await page.waitForTimeout(450);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect(page.getByRole('radio', { name: '不加獎勵骰或懲罰骰' })).toBeChecked();
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByRole('radio', { name: '獎勵骰 2 顆' })).toBeChecked();
    await setRandom(page, [0.5, 0.5, 0.5, 0.5]);
    await btn(page, '技能檢定：擲骰').click();

    /* 重新整理：輸入還在 */
    await page.reload();
    await expect(skillInput(page)).toHaveValue('65');
    await expect(page.getByRole('radio', { name: '獎勵骰 2 顆' })).toBeChecked();

    /* 存成專案檔：輸入＋紀錄 */
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    const projectPath = (await dl.path()) as string;
    const project = JSON.parse(readFileSync(projectPath, 'utf8'));
    expect(project).toMatchObject({ format: 'trpg-toolkit-project', tool: 'coc-dice' });
    expect(project.data.settings).toMatchObject({ skill: '65', bonus: 2 });
    expect(project.data.log).toHaveLength(1);

    /* 重設輸入（紀錄不刪）→ 開啟專案檔 */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /重設輸入/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(skillInput(page)).toHaveValue('');
    expect(await storedLog(page)).toHaveLength(1);
    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(projectPath);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(skillInput(page)).toHaveValue('65');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: '獎勵骰 1 顆' }).click();
    await skillInput(page).fill('60');
    await setRandom(page, [0.35, 0.85, 0.15]);
    await btn(page, '技能檢定：擲骰').click();
    await expect(total(page)).toHaveText('13');
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('coc-dice-1280.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test('沒有橫向捲動；視覺回歸', async ({ page }) => {
    const errors = await open(page);
    await exprInput(page).fill('3D6+1D4+2');
    await setRandom(page, [r(6, 6), r(1, 6), r(4, 6), r(3, 4)]);
    await btn(page, '自訂擲骰：擲骰').click();
    await expect(total(page)).toHaveText('16');
    await noHorizontalScroll(page);
    await page.getByRole('tab', { name: '傷害計算' }).click();
    await noHorizontalScroll(page);
    await page.getByRole('tab', { name: '擲骰' }).click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('coc-dice-390.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});

test.describe('動畫', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('跳動約 0.8 秒後揭曉；跳動中不顯示結果與成功等級', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: '懲罰骰 1 顆' }).click();
    await skillInput(page).fill('40');
    await setRandom(page, [r(5, 10), r(3, 10), r(8, 10)]);
    const t0 = Date.now();
    await btn(page, '技能檢定：擲骰').click();
    await expect(result(page)).toHaveAttribute('data-phase', 'rolling');
    await expect(total(page)).toHaveCount(0);
    await expect(level(page)).toHaveCount(0);
    await expect(dice(page)).toHaveCount(3);
    /* 跳動中不變暗 */
    expect((await diceFaces(page)).every((d) => !d.dimmed)).toBe(true);
    await expect(result(page)).toHaveAttribute('data-phase', 'done', { timeout: 3000 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(700);
    await expect(total(page)).toHaveText('74');
    await expect(level(page)).toHaveText('失敗');
    expect(await diceFaces(page)).toEqual([
      { face: '20', kind: 'tens', dimmed: true },
      { face: '70', kind: 'tens', dimmed: false },
      { face: '4', kind: 'ones', dimmed: false },
    ]);
    /* 紀錄在按下時就寫入 */
    expect((await storedLog(page))[0].text).toBe('技能值[40] BD/PD[-1] ＞ 24, 74 ＞ 74 ＞ 失敗');
    expect(errors).toEqual([]);
  });
});
