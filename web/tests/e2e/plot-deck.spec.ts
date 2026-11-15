/**
 * 劇本骨架抽卡（建置產物 next/plot-deck/）的端對端測試：
 * - 開頁沒有錯誤、頁尾的靈感來源、開始的畫面（卡組、題材、氣氛）；
 * - 隨機抽（題材與氣氛）、重抽、鎖定與全部重抽、放大看與從清單挑（Esc 關閉）、清單的顯示方式；
 * - 照條件抽（三張核心 → 挑卡 → 抽剩下的）、換題材與氣氛；
 * - PC 與 NPC（關係與秘密、對象、人數、秘密卡）、回答問題（隨機回答、改寫與還原、清除、沒回答的隨機填）；
 * - 場景與線索（草稿、連線索、3 條的檢查、刪除與移動）；
 * - 匯出（HTML、文字、劇本排版台的格式的下載與複製、列印）——實際存下來檢查；
 * - 自動儲存、專案檔（存、重設、開、較新版本）、切換現代與奇幻、劇本清單、卡片一覽；
 * - 390／320 寬沒有橫向捲動；1280／390 視覺基準（種子固定）。
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

/** 選題材與氣氛，按「隨機抽」或「照條件抽」 */
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
  /* 題材 7＋交給系統、氣氛 7＋交給系統（現代） */
  await expect(page.locator('[data-choice]')).toHaveCount(16);
  await expect(page.locator('[data-choice="auto"]').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-choice="horror"]')).toContainText('氣氛卡：怪異');
  /* 奇幻：氣氛 6 種 */
  await page.getByRole('radio', { name: '奇幻' }).click();
  await expect(page.locator('[data-choice]')).toHaveCount(15);
  await expect(page.locator('[data-choice="heroic"]')).toContainText('英雄・神話');
  /* 題材選了之後，氣氛旁邊寫符合的核心張數 */
  await page.locator('[data-choice="explore"]').click();
  await expect(page.locator('[data-choice="fairy"]')).toContainText('符合的體驗的核心 3 張');
  await expect(page.getByRole('tab', { name: '劇本清單' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('隨機抽：9 張卡、劇情大綱、重抽、鎖定與全部重抽、放大看與從清單挑（Esc 關閉）、清單的顯示方式', async ({
  page,
}) => {
  const errors = await open(page);
  await start(page, 'random', 'inv', 'horror');
  await expect(page.getByTestId('card')).toHaveCount(9);
  await expect(page.getByTestId('mt-mission')).toHaveText('調查・偵探');
  await expect(page.getByTestId('mt-tone')).toHaveText('怪奇・恐怖');
  expect(tonesOf(await cardId(page, 'core'))).toEqual(['horror']);
  expect(tonesOf(await cardId(page, 'tone'))).toEqual(['horror']);
  /* 氣氛卡的名字跟著氣氛（怪奇・恐怖＝怪異） */
  await expect(page.getByTestId('group-stage')).toContainText('舞台與怪異');
  const stageTitle = (await card(page, 'stage').locator('h3').textContent()) ?? '';
  await expect(page.getByTestId('synopsis')).toContainText(`舞台是「${stageTitle}」`);
  await expect(page.getByTestId('synopsis')).toContainText('真相（GM 用）');
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
  /* 放大看：點卡片，Esc 關閉 */
  await card(page, 'truth').locator('h3').click();
  const zoom = page.getByRole('dialog');
  await expect(zoom.getByTestId('card-zoom')).toBeVisible();
  await expect(zoom.getByRole('heading', { level: 2 })).toContainText('真相：');
  await page.keyboard.press('Escape');
  await expect(zoom).toBeHidden();
  /* 「放大看」的按鈕（鍵盤） */
  await card(page, 'npc').getByRole('button', { name: '放大看' }).click();
  await expect(page.getByTestId('card-zoom')).toBeVisible();
  await page.keyboard.press('Escape');
  /* 從清單挑：目前這張標出來、挑別張；Esc 關閉 */
  await btn(card(page, 'stage'), '從清單挑').click();
  const list = page.getByTestId('picker-option');
  await expect(list).toHaveCount(8);
  await expect(list.and(page.locator('[aria-current="true"]'))).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('picker-list')).toBeHidden();
  const target = (await cardId(page, 'stage')) === 'stage.market' ? 'stage.store' : 'stage.market';
  await btn(card(page, 'stage'), '從清單挑').click();
  await page.locator(`[data-testid="picker-option"][data-card="${target}"]`).click();
  await expect(card(page, 'stage')).toHaveAttribute('data-card', target);
  /* 清單的顯示方式 */
  await page.getByRole('radio', { name: '清單' }).click();
  await expect(page.getByTestId('desk-row')).toHaveCount(9);
  await page.getByRole('radio', { name: '卡片' }).click();
  await expect(page.getByTestId('card')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('照條件抽：三張體驗的核心 → 挑想先決定的卡 → 抽剩下的；換題材與氣氛', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'setup', 'rescue', 'youth');
  const options = page.getByTestId('core-option');
  await expect(options).toHaveCount(3);
  const first = await Promise.all([0, 1, 2].map((i) => options.nth(i).getAttribute('data-card')));
  for (const id of first) expect(tonesOf(id)).toEqual(['youth']);
  /* 每種氣氛 3 張：換三張是同樣的 3 張換順序（規格 D） */
  await btn(page, '換三張').click();
  await expect(options).toHaveCount(3);
  const again = await Promise.all([0, 1, 2].map((i) => options.nth(i).getAttribute('data-card')));
  expect(new Set(again)).toEqual(new Set(first));
  const chosen = await options.nth(0).getAttribute('data-card');
  await options.nth(0).click();
  await expect(page.getByTestId('setup-desk')).toBeVisible();
  await expect(page.getByTestId('setup-count')).toHaveText('決定了 1／9 張');
  await expect(card(page, 'core')).toHaveAttribute('data-card', chosen ?? '');
  /* 點空的欄＝從清單挑 */
  await card(page, 'stage').click();
  await page.locator('[data-testid="picker-option"][data-card="stage.rooftop"]').click();
  await expect(card(page, 'stage')).toHaveAttribute('data-card', 'stage.rooftop');
  await expect(page.getByTestId('setup-count')).toHaveText('決定了 2／9 張');
  /* 移除再挑回來 */
  await btn(card(page, 'stage'), '移除').click();
  await expect(page.getByTestId('setup-count')).toHaveText('決定了 1／9 張');
  await btn(card(page, 'stage'), '從清單挑').click();
  await page.locator('[data-testid="picker-option"][data-card="stage.rooftop"]').click();
  await page.getByTestId('setup-draw').click();
  await expect(page.getByTestId('desk')).toBeVisible();
  await expect(card(page, 'stage')).toHaveAttribute('data-card', 'stage.rooftop');
  await expect(card(page, 'stage')).toHaveAttribute('data-locked', 'true');
  await expect(card(page, 'core')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('card')).toHaveCount(9);
  /* 換題材與氣氛：氣氛換了，核心與氣氛卡重抽（先問） */
  await page.getByTestId('mt-strip').getByRole('button', { name: '變更' }).click();
  const dlg = page.getByTestId('mt-dialog');
  await dlg.locator('[data-choice="crime"]').click();
  await dlg.locator('[data-choice="noir"]').click();
  await btn(page.getByRole('dialog'), '套用').click();
  await expect(alert(page)).toContainText('要重抽合不來的卡嗎？');
  await btn(alert(page), '重抽').click();
  await expect(page.getByTestId('mt-tone')).toHaveText('黑色');
  await expect.poll(async () => tonesOf(await cardId(page, 'core'))).toEqual(['noir']);
  expect(tonesOf(await cardId(page, 'tone'))).toEqual(['noir']);
  await expect(page.getByTestId('group-stage')).toContainText('舞台與泥沼');
  expect(errors).toEqual([]);
});

test('PC 與 NPC、回答問題：關係與秘密、對象、人數、秘密卡、隨機回答、改寫與還原', async ({
  page,
}) => {
  const errors = await open(page);
  await start(page, 'random', 'inv', 'daily');
  await btn(page, '下一步：PC 與 NPC').click();
  await btn(page, '全員抽卡').click();
  await expect(page.getByTestId('qa')).toHaveCount(4);
  /* 稱呼會出現在關係的「PC1 → PC2（阿哲）」 */
  await page.locator('[data-pc="2"] [data-field="pc-name"]').fill('阿哲');
  await expect(qa(page, 'rel1').getByTestId('card-who')).toHaveText('PC1 → PC2（阿哲）');
  /* 對象改成 NPC */
  await qa(page, 'rel1').getByTestId('rel-target').click();
  await page.getByRole('option', { name: /^NPC：/ }).click();
  await expect(qa(page, 'rel1').getByTestId('card-who')).toContainText('PC1 → ');
  await expect(qa(page, 'rel1').getByTestId('card-who')).not.toContainText('PC2');
  /* 不用秘密卡 → 只剩關係；3 人 → PC3 要抽卡 */
  await page.getByTestId('pc-settings').getByRole('switch').click();
  await expect(page.getByTestId('qa')).toHaveCount(2);
  await page.getByTestId('pc-settings').getByRole('radio', { name: '3 人' }).click();
  await btn(page.locator('[data-pc="3"]'), 'PC3 抽卡').click();
  await expect(page.getByTestId('qa')).toHaveCount(3);
  /* 空著的回答隨機填（NPC 也取名） */
  await btn(page, '空著的回答隨機填').click();
  await expect(page.locator('[data-testid="qa"][data-answered="true"]')).toHaveCount(3);
  await expect(page.getByTestId('cast-count')).toHaveText('回答了 3／3 題');
  expect(MODERN.names).toContain(await page.locator('[data-field="npc-name"]').inputValue());
  /* 回答問題 */
  await btn(page, '下一步：回答問題').click();
  await expect(page.getByTestId('qa')).toHaveCount(9);
  await expect(page.getByTestId('answers-count')).toHaveText('回答了 1／9 題');
  await btn(qa(page, 'truth'), '隨機回答').click();
  const truthAnswer = await qa(page, 'truth').locator('[data-field="answer"]').inputValue();
  const truthId = await qa(page, 'truth').getAttribute('data-card');
  const truth = MODERN.cards.find((c) => c.id === truthId);
  expect(truth?.answers).toContain(truthAnswer);
  await expect(page.getByTestId('answers-count')).toHaveText('回答了 2／9 題');
  /* 自己寫 */
  await qa(page, 'stage').locator('[data-field="answer"]').fill('一樓是便利商店，二樓是空屋');
  /* 改寫問題 → 還原 */
  const q = qa(page, 'clue').locator('[data-field="question"]');
  const original = await q.inputValue();
  await q.fill('');
  await expect(q).toHaveValue('');
  await q.fill('這條線索是誰留下的？');
  await q.blur();
  await expect(btn(qa(page, 'clue'), '問題還原')).toBeVisible();
  await btn(qa(page, 'clue'), '問題還原').click();
  await expect(q).toHaveValue(original);
  /* 清除回答 */
  await btn(qa(page, 'truth'), '清除回答').click();
  await expect(qa(page, 'truth').locator('[data-field="answer"]')).toHaveValue('');
  await btn(page, '沒回答的隨機填').click();
  await expect(page.getByTestId('answers-count')).toHaveText('回答了 9／9 題');
  /* 回到抽卡：卡上看得到回答 */
  await step(page, '抽卡');
  await expect(card(page, 'stage').getByTestId('card-answer')).toHaveText(
    '一樓是便利商店，二樓是空屋',
  );
  expect(errors).toEqual([]);
});

test('場景與線索：草稿、連線索、一個推理 3 條的檢查、刪除與移動', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'random', 'chase', 'suspense');
  await step(page, '場景與線索');
  await btn(page, '從卡片做草稿').click();
  await expect(page.getByTestId('deduction')).toHaveCount(3);
  await expect(page.getByTestId('scene')).toHaveCount(6);
  await expect(page.getByTestId('clue')).toHaveCount(2);
  const check = page.getByTestId('plot-check');
  await expect(check.locator('li').first()).toHaveAttribute('data-level', 'warn');
  await expect(check.locator('li').first()).toContainText('N1 ');
  await expect(check.locator('li').first()).toContainText('線索 1 條');
  /* 在 S2 追加兩條線索，連到 N1 → 3 條，ok */
  const s2 = page.getByTestId('scene').nth(1);
  for (const t of ['抽屜裡的車票', '鄰居聽到的爭吵']) {
    await btn(s2, '在這個場景追加線索').click();
    const c = s2.getByTestId('clue').last();
    await expect(c.locator('textarea')).toBeFocused();
    await c.locator('textarea').fill(t);
    await c.locator('[data-link="N1"]').click();
    await expect(c.locator('[data-link="N1"]')).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByTestId('deduction').first().getByTestId('deduction-count')).toHaveText(
    '線索 3',
  );
  await expect(check.locator('li').first()).toHaveAttribute('data-level', 'ok');
  await expect(check.locator('li').first()).toContainText('線索 3 條');
  /* 線索換場景：C1 換到 S4 */
  const firstClue = s2.getByTestId('clue').first();
  const clueId = await firstClue.getAttribute('data-clue');
  await firstClue.getByTestId('clue-scene').click();
  await page.getByRole('option', { name: /^S4 / }).click();
  await expect(page.getByTestId('scene').nth(3).locator(`[data-clue="${clueId}"]`)).toBeVisible();
  /* 刪掉有內容的場景要確認；線索移到「還沒決定場景」 */
  const s4name = await page
    .getByTestId('scene')
    .nth(3)
    .locator('[data-field="scene-name"]')
    .inputValue();
  await btn(page.getByTestId('scene').nth(3), 'S4 刪掉').click();
  await expect(alert(page)).toContainText('要刪掉 S4 嗎？');
  await btn(alert(page), '刪掉').click();
  await expect(page.getByTestId('scene')).toHaveCount(5);
  await expect(page.getByTestId('loose-clues').locator(`[data-clue="${clueId}"]`)).toBeVisible();
  await expect(check).toContainText('還沒決定場景的線索');
  /* 場景往上移 */
  const last = await page.getByTestId('scene').last().getAttribute('data-scene');
  await page.getByRole('button', { name: 'S5 往上移' }).click();
  await expect(page.getByTestId('scene').nth(3)).toHaveAttribute('data-scene', last ?? '');
  expect(s4name).toBeTruthy();
  /* 追加推理 */
  await btn(page, '追加推理').click();
  await expect(page.getByTestId('deduction')).toHaveCount(4);
  await expect(page.getByTestId('deduction').last().locator('textarea')).toBeFocused();
  expect(errors).toEqual([]);
});

test.describe('匯出', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('HTML、文字、劇本排版台的格式（下載與複製）、列印——實際存下來檢查', async ({ page }) => {
    const errors = await open(page);
    await start(page, 'random', 'expose', 'comedy');
    await step(page, '回答問題');
    await btn(page, '沒回答的隨機填').click();
    await step(page, '場景與線索');
    await btn(page, '從卡片做草稿').click();
    await step(page, '文件');
    await page.locator('[data-field="title"]').fill('霧中的廟口 <1>');
    await expect(page.getByTestId('document').locator('.pd-title')).toHaveText('霧中的廟口 <1>');
    await expect(page.getByTestId('document').locator('[data-doc-section]')).toHaveCount(5);
    /* HTML */
    const html = await download(page, () => btn(page, 'HTML').click());
    expect(html.name).toBe('霧中的廟口 _1_.html');
    expect(html.text).toMatch(/^<!doctype html>/);
    expect(html.text).toContain('<h1 class="pd-title">霧中的廟口 &lt;1&gt;</h1>');
    expect(html.text.match(/data-doc-section=/g)).toHaveLength(5);
    expect(html.text).toContain('.pd-doc{');
    /* 文字 */
    const txt = await download(page, () => btn(page, '文字').click());
    expect(txt.name).toBe('霧中的廟口 _1_.txt');
    const lines = txt.text.split('\n');
    expect(lines[0]).toBe('霧中的廟口 <1>');
    expect(lines[2]).toBe('題材：報導・揭發／氣氛：喜劇');
    expect(txt.text).toContain('【劇情大綱的例子】');
    expect(txt.text).toContain('【場景與線索】');
    expect(txt.text).toContain('【劇本的骨架】');
    expect(txt.text.match(/^　回答：/gm)?.length).toBe(9);
    /* 劇本排版台的格式：下載 .md 與複製 */
    await btn(page, '劇本排版台的格式').click();
    const md = await download(page, () => page.getByTestId('md-download').click());
    expect(md.name).toBe('霧中的廟口 _1_.md');
    expect(md.text.startsWith(':::title\n霧中的廟口 <1>\n:::')).toBe(true);
    expect(md.text).toContain('# 舞台與鬧劇');
    expect(md.text).toContain(':::handout[PC1的手冊]{no=HO1}');
    expect(md.text).toContain('|編號|線索|取得的方法|連到|');
    await btn(page, '劇本排版台的格式').click();
    await page.getByTestId('md-copy').click();
    await expect(page.getByText('已複製劇本排版台的格式', { exact: false }).first()).toBeVisible();
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

test('存讀：自動儲存、專案檔（存、重設、開、較新版本）', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'random', 'survive', 'powers');
  await step(page, '回答問題');
  await qa(page, 'core').locator('[data-field="answer"]').fill('在停電的城市裡擋住怪物');
  await qa(page, 'core').locator('[data-field="answer"]').blur();
  const cards = await Promise.all(
    ['core', 'truth', 'stage'].map((k) => qa(page, k).getAttribute('data-card')),
  );
  await page.waitForFunction((key) => (localStorage.getItem(key) ?? '').includes('擋住怪物'), KEY);
  await page.reload();
  await expect(qa(page, 'core').locator('[data-field="answer"]')).toHaveValue(
    '在停電的城市裡擋住怪物',
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
    data: { scenario: { deck: 'modern', mission: 'survive', tone: 'powers', phase: 'done' } },
  });
  expect(dl.suggestedFilename()).toMatch(/_\d{8}\.json$/);
  /* 重設這份劇本 */
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: '重設這份劇本…' }).click();
  await btn(alert(page), '重設').click();
  await expect(page.getByTestId('start')).toBeVisible();
  /* 開啟：加進清單、變成目前的劇本 */
  await btn(page, '專案').click();
  const chooser = await waitForFileChooser(page, () =>
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  );
  await chooser.setFiles(path);
  await expect(page.getByText('已開啟專案檔，加進了劇本清單。').first()).toBeVisible();
  await expect(qa(page, 'core').locator('[data-field="answer"]')).toHaveValue(
    '在停電的城市裡擋住怪物',
  );
  expect(
    await Promise.all(['core', 'truth', 'stage'].map((k) => qa(page, k).getAttribute('data-card'))),
  ).toEqual(cards);
  await expect(page.getByRole('tab', { name: '劇本清單（1）' })).toBeVisible();
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
    page.getByText('這是較新版本存的專案檔，請更新頁面後再開啟。').first(),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: '劇本清單（1）' })).toBeVisible();
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

test('切換現代與奇幻、劇本清單（找、打開、看文件、複製一份、刪除）', async ({ page }) => {
  const errors = await open(page);
  await start(page, 'random', 'inv', 'horror');
  const modernStage = (await card(page, 'stage').locator('h3').textContent()) ?? '';
  /* 抽過卡之後換卡組：先問，開一份新的 */
  await page.getByTestId('top-bar').getByRole('radio', { name: '奇幻' }).click();
  await expect(alert(page)).toContainText('改用奇幻的卡？');
  await btn(alert(page), '開新的劇本').click();
  await expect(page.getByTestId('start')).toBeVisible();
  await expect(page.locator('[data-choice="heroic"]')).toBeVisible();
  await start(page, 'random', 'dungeon', 'heroic');
  expect(tonesOf(await cardId(page, 'core'))).toEqual(['heroic']);
  expect(FANTASY.cards.some((c) => c.id === 'stage.mine')).toBe(true);
  expect((await cardId(page, 'stage'))?.startsWith('stage.')).toBe(true);
  /* 劇本清單 */
  await page.getByRole('tab', { name: '劇本清單（2）' }).click();
  const entries = page.getByTestId('library-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toHaveAttribute('data-current', 'true');
  await expect(entries.first()).toContainText('奇幻');
  await page.getByRole('searchbox', { name: '用名字或卡片找' }).fill(modernStage);
  await expect(entries).toHaveCount(1);
  await expect(page.getByTestId('library-count')).toHaveText(
    `2 份（符合「${modernStage}」的 1 份）`,
  );
  await btn(entries.first(), '看文件').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  await expect(page.getByTestId('document')).toContainText(modernStage);
  await page.getByRole('tab', { name: /劇本清單/ }).click();
  await page.getByRole('searchbox', { name: '用名字或卡片找' }).fill('');
  /* 看文件＝打開那一份（現代的變成編輯中） */
  const current = page.locator('[data-testid="library-entry"][data-current="true"]');
  await expect(current).toContainText(modernStage);
  /* 改名、複製一份、刪除 */
  await current.locator('[data-field="library-title"]').fill('廟口的怪談');
  await btn(current, '複製一份').click();
  await expect(entries).toHaveCount(3);
  await expect(
    page.locator('[data-field="library-title"][value="廟口的怪談（複本）"]'),
  ).toHaveCount(1);
  const copy = entries.filter({ has: page.locator('[value="廟口的怪談（複本）"]') });
  await btn(copy, '刪除').click();
  await expect(alert(page)).toContainText('要刪除「廟口的怪談（複本）」嗎？');
  await btn(alert(page), '刪除').click();
  await expect(entries).toHaveCount(2);
  /* 打開另一份（奇幻） */
  await btn(entries.filter({ hasText: '奇幻' }), '打開').click();
  await expect(page.getByTestId('desk')).toBeVisible();
  expect(tonesOf(await cardId(page, 'core'))).toEqual(['heroic']);
  expect(errors).toEqual([]);
});

test('卡片一覽：張數、種類、搜尋、挑卡開始（挑的卡鎖定）', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '卡片一覽' }).click();
  await expect(page.getByTestId('catalog-count')).toHaveText(
    `顯示 ${MODERN.cards.length} 張／共 ${MODERN.cards.length} 張`,
  );
  await page.getByTestId('catalog-filter').click();
  await page.getByRole('option', { name: '舞台' }).click();
  await expect(page.getByTestId('catalog-card')).toHaveCount(8);
  await page.getByRole('searchbox', { name: '找卡片' }).fill('便利商店');
  await expect(page.getByTestId('catalog-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '找卡片' }).fill('');
  await page.getByRole('radio', { name: '奇幻' }).click();
  await page.getByTestId('catalog-filter').click();
  await page.getByRole('option', { name: '全部' }).click();
  await expect(page.getByTestId('catalog-count')).toHaveText(
    `顯示 ${FANTASY.cards.length} 張／共 ${FANTASY.cards.length} 張`,
  );
  await btn(page.locator('[data-card="core.devil"]'), '用這張開始').click();
  await btn(page.locator('[data-card="stage.sewer"]'), '用這張開始').click();
  await expect(page.locator('[data-card="relation.village"]')).toContainText(
    'PC 的卡在「PC 與 NPC」一步抽',
  );
  await expect(page.getByTestId('catalog-bar')).toContainText('挑了 2 張');
  await btn(page, '用挑的 2 張開始').click();
  await expect(page.getByTestId('desk')).toBeVisible();
  await expect(card(page, 'core')).toHaveAttribute('data-card', 'core.devil');
  await expect(card(page, 'core')).toHaveAttribute('data-locked', 'true');
  await expect(card(page, 'stage')).toHaveAttribute('data-card', 'stage.sewer');
  await expect(page.getByTestId('mt-tone')).toHaveText('頹廢・黑暗');
  expect(errors).toEqual([]);
});

test.describe('窄畫面', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('390 寬：每一步都沒有橫向捲動、上一步／下一步、放大看；視覺基準', async ({ page }) => {
    const errors = await open(page, 'shot');
    await noHorizontalScroll(page);
    await start(page, 'random', 'inv', 'horror');
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
    for (const label of ['PC 與 NPC', '回答問題', '場景與線索', '文件']) {
      await btn(page.getByTestId('step-nav'), '下一步').click();
      await expect(page.getByTestId('step-nav')).toContainText(label);
      if (label === 'PC 與 NPC') await btn(page, '全員抽卡').click();
      if (label === '場景與線索') await btn(page, '從卡片做草稿').click();
      await noHorizontalScroll(page);
    }
    for (const tab of ['劇本清單（1）', '卡片一覽']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });

  test('320 寬：開始、抽卡、場景與線索、文件都沒有橫向捲動', async ({ page }) => {
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
    await btn(page, '全員抽卡').click();
    await noHorizontalScroll(page);
    await btn(page.getByTestId('step-nav'), '下一步').click();
    await btn(page.getByTestId('step-nav'), '下一步').click();
    await btn(page, '從卡片做草稿').click();
    await noHorizontalScroll(page);
    await btn(page.getByTestId('step-nav'), '下一步').click();
    await expect(page.getByTestId('sheet')).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test('1280 寬：視覺基準（種子 shot 的一副固定）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await open(page, 'shot');
  await start(page, 'random', 'inv', 'horror');
  /* 同一份資料、同一個種子，建置之間也不會變（資料或抽法改了才要更新） */
  expect(await Promise.all(['core', 'truth', 'stage'].map((k) => cardId(page, k)))).toEqual([
    'core.curse',
    'truth.coverup',
    'stage.rooftop',
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
