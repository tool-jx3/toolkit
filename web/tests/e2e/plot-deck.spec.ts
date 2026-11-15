/**
 * 劇本骨架抽卡（建置產物 next/plot-deck/）的端對端測試：
 * - 開頁沒有錯誤、頁尾的靈感來源、開始的畫面（卡組、題材、氣氛）；
 * - 一次抽齊（題材與氣氛）、重抽、鎖定與全部重抽、打開來看與自己挑（Esc、點外面、關閉鈕；焦點回到打開的按鈕）、列表的排法；
 * - 先挑餘韻（三張餘韻 → 放上想要的卡 → 抽完其餘的）、改題材與氣氛（焦點回到「改」）；
 * - 角色（關係與秘密、對象、人數、秘密卡）、填答（給個例子、改寫與改回、清空、空白的先放例子）；
 * - 推理與場景（草稿、指向推理題、3 條的健檢、刪除與移動）；
 * - 匯出（HTML、純文字、送去劇本排版台的下載與複製、列印）——實際存下來檢查；
 * - 自動儲存、專案檔（存、清空、開、較新版本）、切換現代與奇幻、我的劇本、卡庫（題材與氣氛的篩選、餘韻決定氣氛）；
 * - 390／320 寬沒有橫向捲動（含卡庫與我的劇本）；1280／390 視覺基準（種子固定）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { FANTASY } from '../../src/tools/plot-deck/data/fantasy';
import { MODERN } from '../../src/tools/plot-deck/data/modern';
import { waitForFileChooser } from '../helpers/fileChooser';

const URL = `/${outputDir(getTool('plot-deck') ?? { id: 'plot-deck', status: 'next' })}/`;
const KEY = 'trpg-toolkit:plot-deck';

const tonesOf = (id: string | null) =>
  [...MODERN.cards, ...FANTASY.cards].find((c) => c.id === id)?.tones ?? [];

async function open(page: Page, seed = 'e2e') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.addInitScript((s) => {
    (window as unknown as Record<string, unknown>).__plotDeckSeed = s;
  }, seed);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '劇本骨架抽卡' })).toBeVisible();
  return errors;
}

const btn = (scope: Page | Locator, name: string | RegExp) =>
  scope.getByRole('button', { name, exact: typeof name === 'string' });
const card = (page: Page, slot: string) =>
  page.locator(`[data-testid="card"][data-slot="${slot}"]`).first();
const cardId = (page: Page, slot: string) => card(page, slot).getAttribute('data-card');
const qa = (page: Page, slot: string) => page.locator(`[data-testid="qa"][data-slot="${slot}"]`);
const alert = (page: Page) => page.getByRole('alertdialog');

/** 選題材與氣氛，按「一次抽齊」或「先挑餘韻」 */
async function start(
  page: Page,
  mode: 'random' | 'setup',
  mission?: string,
  tone?: string,
): Promise<void> {
  if (mission) await page.locator(`[data-choice="${mission}"]`).click();
  if (tone) await page.locator(`[data-choice="${tone}"]`).click();
  await page.locator(`[data-start="${mode}"]`).click();
}

async function step(page: Page, label: string) {
  await page
    .getByRole('navigation', { name: '做劇本的步驟' })
    .getByRole('button', { name: label })
    .click();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function download(page: Page, trigger: () => Promise<unknown>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), trigger()]);
  return { name: dl.suggestedFilename(), text: readFileSync((await dl.path()) as string, 'utf8') };
}

test('開頁：沒有錯誤、靈感來源、開始的畫面（卡組、題材、氣氛）', async ({ page }) => {
  const errors = await open(page);
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Xelltis エノキ／Kadan' }),
  ).toHaveAttribute('href', 'https://www.xelltis.com/');
  await expect(page.getByRole('heading', { name: '開始一份新的劇本骨架' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '現代' })).toBeChecked();
  /* 題材 6＋抽的時候再決定、氣氛 6＋抽的時候再決定（現代） */
  await expect(page.locator('[data-choice]')).toHaveCount(14);
  await expect(page.locator('[data-choice="auto"]').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-choice="dread"]')).toContainText('焦點叫「怪談」');
  await expect(page.getByText('PC 們要完成的事')).toBeVisible();
  await expect(page.getByText('希望桌上的感覺')).toBeVisible();
  /* 奇幻：題材 6、氣氛 5 */
  await page.getByRole('radio', { name: '奇幻' }).click();
  await expect(page.locator('[data-choice]')).toHaveCount(13);
  await expect(page.locator('[data-choice="romp"]')).toContainText('焦點叫「燙手山芋」');
  /* 題材選了之後，氣氛旁邊寫可以選的餘韻張數 */
  await page.locator('[data-choice="treasure"]').click();
  await expect(page.locator('[data-choice="legend"]')).toContainText('可以選的餘韻：1 張');
  await expect(page.getByRole('tab', { name: '我的劇本' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('一次抽齊：9 張卡、故事梗概、重抽、鎖定與全部重抽、打開來看與自己挑（焦點回到打開的按鈕）、列表的排法', async ({
  page,
}) => {
  const errors = await open(page);
  await start(page, 'random', 'riddle', 'dread');
  await expect(page.getByTestId('card')).toHaveCount(9);
  await expect(page.getByTestId('mt-mission')).toHaveText('解謎');
  await expect(page.getByTestId('mt-tone')).toHaveText('陰森');
  expect(tonesOf(await cardId(page, 'core'))).toEqual(['dread']);
  expect(tonesOf(await cardId(page, 'tone'))).toEqual(['dread']);
  /* 焦點的名字跟著氣氛（陰森＝怪談）；三組 */
  await expect(card(page, 'tone')).toContainText('怪談');
  for (const g of ['aim', 'front', 'back'])
    await expect(page.getByTestId(`group-${g}`)).toBeVisible();
  const stageTitle = (await card(page, 'stage').locator('h3').textContent()) ?? '';
  await expect(page.getByTestId('synopsis')).toContainText(`帶到了「${stageTitle}」`);
  await expect(page.getByTestId('synopsis')).toContainText('幕後（只給 GM）');
  /* 重抽 */
  const intro = await cardId(page, 'intro');
  await btn(card(page, 'intro'), '重抽導入').click();
  await expect(card(page, 'intro')).not.toHaveAttribute('data-card', intro ?? '');
  /* 鎖定 → 全部重抽也留著；鎖定的不能重抽 */
  const clue = await cardId(page, 'clue');
  await btn(card(page, 'clue'), '鎖定').click();
  await expect(card(page, 'clue')).toHaveAttribute('data-locked', 'true');
  await expect(btn(card(page, 'clue'), '重抽線索')).toBeDisabled();
  const before = await Promise.all(
    ['intro', 'obstacle', 'stage', 'npc'].map((k) => cardId(page, k)),
  );
  await btn(page, '全部重抽').click();
  await expect
    .poll(async () =>
      (await Promise.all(['intro', 'obstacle', 'stage', 'npc'].map((k) => cardId(page, k)))).join(),
    )
    .not.toBe(before.join());
  expect(await cardId(page, 'clue')).toBe(clue);
  /* 打開來看：點卡片，Esc 關閉；焦點回到那張卡的「打開來看」 */
  const zoomBtn = (slot: string) => card(page, slot).getByRole('button', { name: '打開來看' });
  await card(page, 'truth').locator('h3').click();
  const zoom = page.getByRole('dialog');
  await expect(zoom.getByTestId('card-zoom')).toBeVisible();
  await expect(zoom.getByRole('heading', { level: 2 })).toContainText('真相・');
  await page.keyboard.press('Escape');
  await expect(zoom).toBeHidden();
  await expect(zoomBtn('truth')).toBeFocused();
  /* 「打開來看」的按鈕：Esc、點外面、關閉鈕都把焦點還給它 */
  await zoomBtn('npc').click();
  await expect(page.getByTestId('card-zoom')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(zoomBtn('npc')).toBeFocused();
  await zoomBtn('npc').click();
  await expect(page.getByTestId('card-zoom')).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(page.getByTestId('card-zoom')).toBeHidden();
  await expect(zoomBtn('npc')).toBeFocused();
  await zoomBtn('npc').click();
  await btn(page.getByRole('dialog'), '關閉').click();
  await expect(page.getByTestId('card-zoom')).toBeHidden();
  await expect(zoomBtn('npc')).toBeFocused();
  /* 自己挑：目前這張標出來；Esc 關閉、焦點回到「自己挑」 */
  const pickBtn = btn(card(page, 'stage'), '自己挑');
  await pickBtn.click();
  const list = page.getByTestId('picker-option');
  await expect(list).toHaveCount(8);
  await expect(list.and(page.locator('[aria-current="true"]'))).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('picker-list')).toBeHidden();
  await expect(pickBtn).toBeFocused();
  /* 挑別張：焦點也回到「自己挑」 */
  const target =
    (await cardId(page, 'stage')) === 'stage.rooftop' ? 'stage.bowling' : 'stage.rooftop';
  await pickBtn.click();
  await page.locator(`[data-testid="picker-option"][data-card="${target}"]`).click();
  await expect(card(page, 'stage')).toHaveAttribute('data-card', target);
  await expect(pickBtn).toBeFocused();
  /* 從打開來看裡的「自己挑」打開：關閉後焦點回到頁面上那張卡的「自己挑」 */
  await zoomBtn('ending').click();
  await btn(page.getByTestId('card-zoom'), '自己挑').click();
  await expect(page.getByTestId('picker-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('picker-list')).toBeHidden();
  await expect(btn(card(page, 'ending'), '自己挑')).toBeFocused();
  /* 列表的排法 */
  await page.getByRole('radio', { name: '列表' }).click();
  await expect(page.getByTestId('desk-row')).toHaveCount(9);
  await page.getByRole('radio', { name: '卡面' }).click();
  await expect(page.getByTestId('card')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('先挑餘韻：三張餘韻 → 放上想要的卡 → 抽完其餘的；改題材與氣氛（焦點回到「改」）', async ({
  page,
}) => {
  const errors = await open(page);
  await start(page, 'setup', 'search', 'tender');
  const options = page.getByTestId('core-option');
  await expect(options).toHaveCount(3);
  const first = await Promise.all([0, 1, 2].map((i) => options.nth(i).getAttribute('data-card')));
  for (const id of first) expect(tonesOf(id)).toEqual(['tender']);
  /* 每種氣氛 5 張：再發三張換得到沒看過的（規格 D13） */
  await btn(page, '再發三張').click();
  await expect(options).toHaveCount(3);
  const again = await Promise.all([0, 1, 2].map((i) => options.nth(i).getAttribute('data-card')));
  for (const id of again) expect(tonesOf(id)).toEqual(['tender']);
  expect(again.filter((id) => !first.includes(id)).length).toBeGreaterThanOrEqual(1);
  const chosen = await options.nth(0).getAttribute('data-card');
  await options.nth(0).click();
  await expect(page.getByTestId('setup-desk')).toBeVisible();
  await expect(page.getByTestId('setup-count')).toHaveText('已經放了 1 張（共 9 欄）');
  await expect(card(page, 'core')).toHaveAttribute('data-card', chosen ?? '');
  /* 點空的欄＝自己挑 */
  await card(page, 'stage').click();
  await page.locator('[data-testid="picker-option"][data-card="stage.rooftop"]').click();
  await expect(card(page, 'stage')).toHaveAttribute('data-card', 'stage.rooftop');
  await expect(page.getByTestId('setup-count')).toHaveText('已經放了 2 張（共 9 欄）');
  /* 拿掉再挑回來 */
  await btn(card(page, 'stage'), '拿掉').click();
  await expect(page.getByTestId('setup-count')).toHaveText('已經放了 1 張（共 9 欄）');
  await btn(card(page, 'stage'), '自己挑').click();
  await page.locator('[data-testid="picker-option"][data-card="stage.rooftop"]').click();
  await page.getByTestId('setup-draw').click();
  await expect(page.getByTestId('desk')).toBeVisible();
  await expect(card(page, 'stage')).toHaveAttribute('data-card', 'stage.rooftop');
  await expect(card(page, 'stage')).toHaveAttribute('data-locked', 'true');
  await expect(card(page, 'core')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('card')).toHaveCount(9);
  /* 改題材與氣氛：取消時焦點回到「改」 */
  const change = page.getByTestId('mt-change');
  await change.click();
  await expect(page.getByTestId('mt-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mt-dialog')).toBeHidden();
  await expect(change).toBeFocused();
  await change.click();
  await btn(page.getByRole('dialog'), '取消').click();
  await expect(change).toBeFocused();
  /* 氣氛換了，餘韻與焦點重抽（先問） */
  await change.click();
  const dlg = page.getByTestId('mt-dialog');
  await dlg.locator('[data-choice="deal"]').click();
  await dlg.locator('[data-choice="absurd"]').click();
  await btn(page.getByRole('dialog'), '就這樣').click();
  await expect(alert(page)).toContainText('跟新方向不搭的卡要換掉嗎？');
  await btn(alert(page), '換').click();
  await expect(page.getByTestId('mt-tone')).toHaveText('荒謬');
  await expect.poll(async () => tonesOf(await cardId(page, 'core'))).toEqual(['absurd']);
  expect(tonesOf(await cardId(page, 'tone'))).toEqual(['absurd']);
  await expect(card(page, 'tone')).toContainText('怪事');
  expect(errors).toEqual([]);
});

test('角色、填答：關係與秘密、對象、人數、秘密卡、給個例子、改寫與改回', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'random', 'riddle', 'tender');
  await btn(page, '往下：角色').click();
  await btn(page, '每位 PC 都抽').click();
  await expect(page.getByTestId('qa')).toHaveCount(4);
  /* 名字會出現在關係的「PC1 → PC2（阿哲）」 */
  await page.locator('[data-pc="2"] [data-field="pc-name"]').fill('阿哲');
  await expect(qa(page, 'rel1').getByTestId('card-who')).toHaveText('PC1 → PC2（阿哲）');
  /* 對象改成 NPC */
  await qa(page, 'rel1').getByTestId('rel-target').click();
  await page.getByRole('option', { name: /^NPC：/ }).click();
  await expect(qa(page, 'rel1').getByTestId('card-who')).toContainText('PC1 → ');
  await expect(qa(page, 'rel1').getByTestId('card-who')).not.toContainText('PC2');
  /* 不用秘密卡 → 只剩關係；3 人 → PC3 要抽 */
  await page.getByTestId('pc-settings').getByRole('switch').click();
  await expect(page.getByTestId('qa')).toHaveCount(2);
  await page.getByTestId('pc-settings').getByRole('radio', { name: '3 人' }).click();
  await btn(page.locator('[data-pc="3"]'), '替 PC3 抽').click();
  await expect(page.getByTestId('qa')).toHaveCount(3);
  /* 空白的回答先放例子（NPC 也取名） */
  await btn(page, '空白的回答先放例子').click();
  await expect(page.locator('[data-testid="qa"][data-answered="true"]')).toHaveCount(3);
  await expect(page.getByTestId('cast-count')).toHaveText('已答 3／3');
  expect(MODERN.names).toContain(await page.locator('[data-field="npc-name"]').inputValue());
  /* 填答 */
  await btn(page, '往下：填答').click();
  await expect(page.getByTestId('qa')).toHaveCount(9);
  await expect(page.getByTestId('answers-count')).toHaveText('已答 1／9');
  await btn(qa(page, 'truth'), '給個例子').click();
  const truthAnswer = await qa(page, 'truth').locator('[data-field="answer"]').inputValue();
  const truthId = await qa(page, 'truth').getAttribute('data-card');
  const truth = MODERN.cards.find((c) => c.id === truthId);
  expect(truth?.answers).toContain(truthAnswer);
  await expect(page.getByTestId('answers-count')).toHaveText('已答 2／9');
  /* 自己寫 */
  await qa(page, 'stage').locator('[data-field="answer"]').fill('一樓是洗衣店，二樓是空屋');
  /* 改寫提問 → 改回原本的 */
  const q = qa(page, 'clue').locator('[data-field="question"]');
  const original = await q.inputValue();
  await q.fill('');
  await expect(q).toHaveValue('');
  await q.fill('這條線索是誰留下的？');
  await q.blur();
  await expect(btn(qa(page, 'clue'), '改回原本的提問')).toBeVisible();
  await btn(qa(page, 'clue'), '改回原本的提問').click();
  await expect(q).toHaveValue(original);
  /* 清空 */
  await btn(qa(page, 'truth'), '清空').click();
  await expect(qa(page, 'truth').locator('[data-field="answer"]')).toHaveValue('');
  await btn(page, '空白的都先放例子').click();
  await expect(page.getByTestId('answers-count')).toHaveText('已答 9／9');
  /* 回到抽骨架：卡上看得到回答 */
  await step(page, '抽骨架');
  await expect(card(page, 'stage').getByTestId('card-answer')).toHaveText(
    '一樓是洗衣店，二樓是空屋',
  );
  expect(errors).toEqual([]);
});

test('推理與場景：草稿、指向推理題、一道題 3 條的健檢、刪除與移動', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'random', 'getaway', 'tense');
  await step(page, '推理與場景');
  await btn(page, '用卡片排草稿').click();
  await expect(page.getByTestId('deduction')).toHaveCount(3);
  await expect(page.getByTestId('scene')).toHaveCount(5);
  await expect(page.getByTestId('clue')).toHaveCount(3);
  const check = page.getByTestId('plot-check');
  const rowA = check.locator('li').nth(1);
  await expect(check.locator('li').first()).toHaveText('推理題 3 道、場景 5 個、線索 3 條。');
  await expect(rowA).toHaveAttribute('data-level', 'warn');
  await expect(rowA).toContainText('A. ');
  await expect(rowA).toContainText('只有 1 條線索');
  /* 在 #2 再放兩條線索，指向 A → 3 條，ok */
  const s2 = page.getByTestId('scene').nth(1);
  for (const t of ['抽屜裡的車票', '鄰居聽到的爭吵']) {
    await btn(s2, '在這一場放一條線索').click();
    const c = s2.getByTestId('clue').last();
    await expect(c.locator('textarea')).toBeFocused();
    await c.locator('textarea').fill(t);
    await c.locator('[data-link="A"]').click();
    await expect(c.locator('[data-link="A"]')).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByTestId('deduction').first().getByTestId('deduction-count')).toHaveText(
    '3 條',
  );
  await expect(rowA).toHaveAttribute('data-level', 'ok');
  await expect(rowA).toContainText('3 條線索，夠了');
  /* 線索換場景：#2 的第一條換到 #4 */
  const firstClue = s2.getByTestId('clue').first();
  const clueId = await firstClue.getAttribute('data-clue');
  await firstClue.getByTestId('clue-scene').click();
  await page.getByRole('option', { name: /^#4 / }).click();
  await expect(page.getByTestId('scene').nth(3).locator(`[data-clue="${clueId}"]`)).toBeVisible();
  /* 刪掉有內容的場景要確認；線索移到「還沒放進場景的線索」 */
  await btn(page.getByTestId('scene').nth(3), '#4 刪除').click();
  await expect(alert(page)).toContainText('刪除#4？');
  await btn(alert(page), '刪除').click();
  await expect(page.getByTestId('scene')).toHaveCount(4);
  await expect(page.getByTestId('unplaced-clues').locator(`[data-clue="${clueId}"]`)).toBeVisible();
  await expect(check).toContainText('還沒放進任何場景');
  /* 場景往前移 */
  const last = await page.getByTestId('scene').last().getAttribute('data-scene');
  await page.getByRole('button', { name: '把#4往前移' }).click();
  await expect(page.getByTestId('scene').nth(2)).toHaveAttribute('data-scene', last ?? '');
  /* 加一道推理題 */
  await btn(page, '加一道推理題').click();
  await expect(page.getByTestId('deduction')).toHaveCount(4);
  await expect(page.getByTestId('deduction').last().locator('textarea')).toBeFocused();
  expect(errors).toEqual([]);
});

test.describe('匯出', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('HTML、純文字、送去劇本排版台（下載與複製）、列印——實際存下來檢查', async ({ page }) => {
    const errors = await open(page);
    await start(page, 'random', 'deal', 'absurd');
    await step(page, '填答');
    await btn(page, '空白的都先放例子').click();
    await step(page, '推理與場景');
    await btn(page, '用卡片排草稿').click();
    await step(page, '成品');
    await page.locator('[data-field="title"]').fill('霧中的廟口 <1>');
    await expect(page.getByTestId('document').locator('.pdk-name')).toHaveText('霧中的廟口 <1>');
    await expect(page.getByTestId('document').locator('[data-doc-section]')).toHaveCount(6);
    /* HTML */
    const html = await download(page, () => btn(page, 'HTML').click());
    expect(html.name).toBe('霧中的廟口 _1_.html');
    expect(html.text).toMatch(/^<!doctype html>/);
    expect(html.text).toContain('<h1 class="pdk-name">霧中的廟口 &lt;1&gt;</h1>');
    expect(html.text.match(/data-doc-section=/g)).toHaveLength(6);
    expect(html.text).toContain('.pdk-paper{');
    /* 純文字 */
    const txt = await download(page, () => btn(page, '純文字').click());
    expect(txt.name).toBe('霧中的廟口 _1_.txt');
    const lines = txt.text.split('\n');
    expect(lines[0]).toBe('霧中的廟口 <1>');
    expect(lines[2]).toBe('談判周旋・荒謬');
    expect(txt.text).toContain('＝＝ 故事梗概 ＝＝');
    expect(txt.text).toContain('＝＝ 推理題與場景表 ＝＝');
    expect(txt.text).toContain('＝＝ 卡片與回答 ＝＝');
    expect(txt.text.match(/^　回答　/gm)?.length).toBe(9);
    /* 送去劇本排版台：下載 .md 與複製 */
    await btn(page, '送去劇本排版台').click();
    const md = await download(page, () => page.getByTestId('md-download').click());
    expect(md.name).toBe('霧中的廟口 _1_.md');
    expect(md.text.startsWith(':::title\n霧中的廟口 <1>\n:::')).toBe(true);
    expect(md.text).toContain('# 幕後與線頭');
    expect(md.text).toContain(':::handout[PC1的手冊]{no=HO1}');
    expect(md.text).toContain('|#|線索|怎麼拿到|指向|');
    await btn(page, '送去劇本排版台').click();
    await page.getByTestId('md-copy').click();
    await expect(page.getByText('複製好了', { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(md.text);
    /* 列印：另開一份列印用的文件（只有紙面） */
    await page.getByTestId('print').click();
    const frame = page.frameLocator('iframe[data-paged-print]');
    await expect(frame.locator('h1')).toHaveText('霧中的廟口 <1>');
    expect(await page.locator('iframe[data-paged-print]').getAttribute('title')).toBe(
      '霧中的廟口 <1>',
    );
    const css = await frame.locator('style').first().textContent();
    expect(css).toContain('@page{size:210mm 297mm;margin:12mm}');
    expect(errors).toEqual([]);
  });
});

test('存讀：自動儲存、專案檔（存、清空、開、較新版本）', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'random', 'trespass', 'nostalgic');
  await step(page, '填答');
  await qa(page, 'core').locator('[data-field="answer"]').fill('在停電的保齡球館裡等天亮');
  await qa(page, 'core').locator('[data-field="answer"]').blur();
  const cards = await Promise.all(
    ['core', 'truth', 'stage'].map((k) => qa(page, k).getAttribute('data-card')),
  );
  await page.waitForFunction((key) => (localStorage.getItem(key) ?? '').includes('等天亮'), KEY);
  await page.reload();
  await expect(qa(page, 'core').locator('[data-field="answer"]')).toHaveValue(
    '在停電的保齡球館裡等天亮',
  );
  /* 存成專案檔 */
  await btn(page, '專案').click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const path = (await dl.path()) as string;
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  expect(saved).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'plot-deck',
    version: 1,
    data: {
      scenario: { deck: 'modern', mission: 'trespass', tone: 'nostalgic', phase: 'done' },
    },
  });
  expect(dl.suggestedFilename()).toMatch(/_\d{8}\.json$/);
  /* 清空這份劇本 */
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: '把這份清空…' }).click();
  await btn(alert(page), '清空').click();
  await expect(page.getByTestId('start')).toBeVisible();
  /* 開啟：加進清單、變成目前的劇本 */
  await btn(page, '專案').click();
  const chooser = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser.setFiles(path);
  await expect(page.getByText('專案檔開好了，放進了「我的劇本」。').first()).toBeVisible();
  await expect(qa(page, 'core').locator('[data-field="answer"]')).toHaveValue(
    '在停電的保齡球館裡等天亮',
  );
  expect(
    await Promise.all(['core', 'truth', 'stage'].map((k) => qa(page, k).getAttribute('data-card'))),
  ).toEqual(cards);
  await expect(page.getByRole('tab', { name: '我的劇本（1）' })).toBeVisible();
  /* 較新版本存的檔：不開、說明原因 */
  saved.version = 2;
  await btn(page, '專案').click();
  const chooser2 = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser2.setFiles({
    name: 'newer.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(
    page.getByText('這個專案檔是比較新的版本存的；重新整理頁面之後再開。').first(),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: '我的劇本（1）' })).toBeVisible();
  /* 壞掉的自動存檔：開頁時整理，不會壞掉 */
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        state: {
          data: {
            scenarios: [{ deck: 'modern', phase: 'done', slots: { core: { card: '不存在' } } }, 3],
            current: 'x',
          },
        },
        version: 1,
      }),
    );
  }, KEY);
  await page.reload();
  await expect(page.getByTestId('start')).toBeVisible();
  expect(errors).toEqual([]);
});

test('切換現代與奇幻、我的劇本（搜尋、開啟、看成品、另存一份、刪除）', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'random', 'riddle', 'dread');
  const modernStage = (await card(page, 'stage').locator('h3').textContent()) ?? '';
  /* 抽過卡之後換卡組：先問，開一份新的 */
  await page.getByTestId('top-bar').getByRole('radio', { name: '奇幻' }).click();
  await expect(alert(page)).toContainText('改用奇幻的卡？');
  await btn(alert(page), '開新的一份').click();
  await expect(page.getByTestId('start')).toBeVisible();
  await expect(page.locator('[data-choice="legend"]')).toBeVisible();
  await start(page, 'random', 'hunt', 'legend');
  expect(tonesOf(await cardId(page, 'core'))).toEqual(['legend']);
  expect((await cardId(page, 'stage'))?.startsWith('stage.')).toBe(true);
  /* 我的劇本 */
  await page.getByRole('tab', { name: '我的劇本（2）' }).click();
  const entries = page.getByTestId('library-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toHaveAttribute('data-current', 'true');
  await expect(entries.first()).toContainText('奇幻');
  await page.getByRole('searchbox', { name: '用劇本名或卡名搜尋' }).fill(modernStage);
  await expect(entries).toHaveCount(1);
  await expect(page.getByTestId('library-count')).toHaveText(`「${modernStage}」：1／2 份`);
  await btn(entries.first(), '看成品').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  await expect(page.getByTestId('document')).toContainText(modernStage);
  await page.getByRole('tab', { name: /我的劇本/ }).click();
  await page.getByRole('searchbox', { name: '用劇本名或卡名搜尋' }).fill('');
  /* 看成品＝開啟那一份（現代的變成正在寫） */
  const current = page.locator('[data-testid="library-entry"][data-current="true"]');
  await expect(current).toContainText(modernStage);
  /* 改名、另存一份、刪除 */
  await current.locator('[data-field="library-title"]').fill('廟口的怪談');
  await btn(current, '另存一份').click();
  await expect(entries).toHaveCount(3);
  await expect(
    page.locator('[data-field="library-title"][value="廟口的怪談（又一份）"]'),
  ).toHaveCount(1);
  const copy = entries.filter({ has: page.locator('[value="廟口的怪談（又一份）"]') });
  await btn(copy, '刪除').click();
  await expect(alert(page)).toContainText('刪除「廟口的怪談（又一份）」？');
  await btn(alert(page), '刪除').click();
  await expect(entries).toHaveCount(2);
  /* 開啟另一份（奇幻） */
  await btn(entries.filter({ hasText: '奇幻' }), '開啟').click();
  await expect(page.getByTestId('desk')).toBeVisible();
  expect(tonesOf(await cardId(page, 'core'))).toEqual(['legend']);
  expect(errors).toEqual([]);
});

test('卡庫：張數、種類、題材與氣氛的篩選、搜尋、放卡開始（餘韻決定氣氛）', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '卡庫' }).click();
  await expect(page.getByTestId('catalog-count')).toHaveText(
    `${MODERN.cards.length}／${MODERN.cards.length} 張`,
  );
  await page.getByTestId('catalog-filter').click();
  await page.getByRole('option', { name: '舞台', exact: true }).click();
  await expect(page.getByTestId('catalog-card')).toHaveCount(8);
  await page.getByRole('searchbox', { name: '搜尋卡片' }).fill('婚紗');
  await expect(page.getByTestId('catalog-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '搜尋卡片' }).fill('');
  await page.getByRole('radio', { name: '奇幻' }).click();
  await page.getByTestId('catalog-filter').click();
  await page.getByRole('option', { name: '種類：全部' }).click();
  await expect(page.getByTestId('catalog-count')).toHaveText(
    `${FANTASY.cards.length}／${FANTASY.cards.length} 張`,
  );
  /* 題材與氣氛的篩選（沒有標的 PC 卡也算合） */
  const matches = (list: readonly string[] | undefined, id: string) =>
    !list?.length || list.includes(id);
  await page.getByTestId('catalog-mission').click();
  await page.getByRole('option', { name: '尋寶' }).click();
  await expect(page.getByTestId('catalog-count')).toHaveText(
    `${FANTASY.cards.filter((c) => matches(c.missions, 'treasure')).length}／${FANTASY.cards.length} 張`,
  );
  await page.getByTestId('catalog-tone').click();
  await page.getByRole('option', { name: '傳奇' }).click();
  await expect(page.getByTestId('catalog-count')).toHaveText(
    `${FANTASY.cards.filter((c) => matches(c.missions, 'treasure') && matches(c.tones, 'legend')).length}／${FANTASY.cards.length} 張`,
  );
  await page.getByTestId('catalog-mission').click();
  await page.getByRole('option', { name: '題材：不限' }).click();
  await page.getByTestId('catalog-tone').click();
  await page.getByRole('option', { name: '氣氛：不限' }).click();
  /* 放餘韻（傳奇）與焦點（活劇）：氣氛跟著餘韻，焦點換一張並通知 */
  await btn(page.locator('[data-card="core.respect"]'), '放進新劇本').click();
  await btn(page.locator('[data-card="stage.shipinn"]'), '放進新劇本').click();
  await btn(page.locator('[data-card="tone.pumpkin"]'), '放進新劇本').click();
  await expect(page.locator('[data-card="relation.jailbreak"]')).toContainText(
    'PC 的卡在「角色」那一步抽',
  );
  await expect(page.getByTestId('catalog-bar')).toContainText('放了 3 張');
  await btn(page, '用這 3 張開始').click();
  await expect(page.getByTestId('desk')).toBeVisible();
  await expect(page.getByText('焦點「一直變大的南瓜」和這張餘韻的氣氛不同').first()).toBeVisible();
  await expect(card(page, 'core')).toHaveAttribute('data-card', 'core.respect');
  await expect(card(page, 'core')).toHaveAttribute('data-locked', 'true');
  await expect(card(page, 'stage')).toHaveAttribute('data-card', 'stage.shipinn');
  await expect(card(page, 'tone')).not.toHaveAttribute('data-card', 'tone.pumpkin');
  expect(tonesOf(await cardId(page, 'tone'))).toEqual(['legend']);
  await expect(page.getByTestId('mt-tone')).toHaveText('傳奇');
  expect(errors).toEqual([]);
});

test.describe('窄畫面', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('390 寬：每一步都沒有橫向捲動、往下／退回、打開來看；視覺基準', async ({ page }) => {
    const errors = await open(page, 'shot');
    await noHorizontalScroll(page);
    await start(page, 'random', 'riddle', 'dread');
    await expect(page.getByTestId('step-nav')).toBeVisible();
    await expect(page.getByTestId('synopsis-fold')).toBeVisible();
    await noHorizontalScroll(page);
    await card(page, 'truth').locator('h3').click();
    await expect(page.getByTestId('card-zoom')).toBeVisible();
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('plot-deck-390.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    for (const label of ['角色', '填答', '推理與場景', '成品']) {
      await btn(page.getByTestId('step-nav'), '下一步').click();
      await expect(page.getByTestId('step-nav')).toContainText(label);
      if (label === '角色') await btn(page, '每位 PC 都抽').click();
      if (label === '推理與場景') await btn(page, '用卡片排草稿').click();
      await noHorizontalScroll(page);
    }
    for (const tab of ['我的劇本（1）', '卡庫']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });

  test('320 寬：開始、抽骨架、推理與場景、成品、卡庫、我的劇本都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await start(page, 'setup');
    await noHorizontalScroll(page);
    await page.getByTestId('core-option').first().click();
    await noHorizontalScroll(page);
    await page.getByTestId('setup-draw').click();
    await noHorizontalScroll(page);
    await btn(page.getByTestId('step-nav'), '下一步').click();
    await btn(page, '每位 PC 都抽').click();
    await noHorizontalScroll(page);
    await btn(page.getByTestId('step-nav'), '下一步').click();
    await btn(page.getByTestId('step-nav'), '下一步').click();
    await btn(page, '用卡片排草稿').click();
    await noHorizontalScroll(page);
    await btn(page.getByTestId('step-nav'), '下一步').click();
    await expect(page.getByTestId('sheet')).toBeVisible();
    await noHorizontalScroll(page);
    /* 卡庫：篩選與搜尋的欄不超出畫面 */
    await page.getByRole('tab', { name: '卡庫' }).click();
    await expect(page.getByTestId('catalog')).toBeVisible();
    await noHorizontalScroll(page);
    for (const loc of [
      page.getByRole('searchbox', { name: '搜尋卡片' }),
      page.getByTestId('catalog-filter'),
      page.getByTestId('catalog-tone'),
    ]) {
      const box = await loc.boundingBox();
      expect(box && box.x + box.width).toBeLessThanOrEqual(320);
    }
    await btn(page.locator('[data-testid="catalog-card"]').first(), '放進新劇本').click();
    await expect(page.getByTestId('catalog-bar')).toBeVisible();
    await noHorizontalScroll(page);
    /* 我的劇本 */
    await page.getByRole('tab', { name: /我的劇本/ }).click();
    await expect(page.getByTestId('library-entry')).toHaveCount(1);
    await page.getByTestId('library-outline').locator('summary').click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test('1280 寬：視覺基準（種子 shot 的一副固定）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await open(page, 'shot');
  await start(page, 'random', 'riddle', 'dread');
  /* 同一份資料、同一個種子，建置之間也不會變（資料或抽法改了才要更新） */
  expect(await Promise.all(['core', 'truth', 'stage'].map((k) => cardId(page, k)))).toEqual([
    'core.heirloom',
    'truth.ghostwriter',
    'stage.bowling',
  ]);
  await btn(card(page, 'clue'), '鎖定').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('plot-deck-1280.png', {
    mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
  });
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});
