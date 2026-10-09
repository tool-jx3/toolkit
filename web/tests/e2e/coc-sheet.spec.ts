/**
 * CoC 7 版調查員角色卡（建置產物 next/coc-sheet/）的端對端測試（規格 docs/refactor/specs/coc-sheet.md）：
 * - 開頁沒有錯誤、預設的角色卡與 A4 兩頁的紙面；
 * - 屬性的困難／極限、自動計算（HP、MP、SAN、移動力、DB／體格）與手動值、目前值與狀態勾選；
 * - 技能：點數、技能值、Enter 插入／Backspace 刪除、超過 60 列、搜尋、成長勾選、Alt＋↓ 排序；
 * - 武器：新增、使用的技能、上移、超過 7 把；背景故事、裝備、資產、備註與「文字太多」的提醒；
 * - 頭像：上傳、裁切、調整裁切、移除、重新整理後還在；多張角色卡；舊存檔搬移（真實的舊版存檔）；
 * - 復原、自動保存、專案檔（ZIP，含頭像）；列印（Ctrl＋P）、匯出 PNG（尺寸與像素）、CCFOLIA 角色資料；
 * - 1280／390 視覺基準，390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('coc-sheet') ?? { id: 'coc-sheet', status: 'next' })}/`;

const LEGACY = JSON.parse(
  readFileSync(
    new globalThis.URL('../unit/fixtures/coc-sheet-legacy.json', import.meta.url),
    'utf8',
  ),
) as { charasheet: Record<string, string>; autosave: string };

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
  await expect(page.getByRole('heading', { level: 1, name: 'CoC 7 版調查員角色卡' })).toBeVisible();
  return errors;
}

const btn = (page: Page | Locator, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
const paper = (page: Page) => page.getByTestId('sheet-paper');
const page1 = (page: Page) => paper(page).locator('.cs-page[data-page="1"]');
const page2 = (page: Page) => paper(page).locator('.cs-page[data-page="2"]');
const sheets = (page: Page) => page.getByRole('list', { name: '角色卡清單' }).getByRole('listitem');
const skillRows = (page: Page) => page.getByRole('list', { name: '技能表' }).getByRole('listitem');
const warnings = (page: Page) => page.getByTestId('print-warnings');

/** 紙面上的一般／困難／極限 */
async function roll(loc: Locator) {
  return [
    await loc.locator('.cs-r').textContent(),
    await loc.locator('.cs-h').textContent(),
    await loc.locator('.cs-x').textContent(),
  ];
}
const stat = (page: Page, key: string) => page1(page).locator(`[data-stat="${key}"]`);
const skillCell = (page: Page, n: number) =>
  page1(page)
    .locator('.cs-sk')
    .nth(n - 1);
const weaponRow = (page: Page, i: number) => page1(page).locator(`.cs-wrow[data-weapon="${i}"]`);

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

/** 一張測試圖（左紅右藍、中間白圓） */
async function testPng(page: Page, w = 300, h = 200): Promise<Buffer> {
  const data = await page.evaluate(
    ([width, height]) => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.fillStyle = '#c0392b';
      g.fillRect(0, 0, width / 2, height);
      g.fillStyle = '#2c3e8f';
      g.fillRect(width / 2, 0, width / 2, height);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(width / 2, height / 2, height / 4, 0, Math.PI * 2);
      g.fill();
      return c.toDataURL('image/png').split(',')[1];
    },
    [w, h],
  );
  return Buffer.from(data, 'base64');
}

async function uploadPortrait(page: Page) {
  await tab(page, '基本資料');
  await page.getByLabel('選擇圖片', { exact: true }).setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: await testPng(page),
  });
  const dialog = page.getByRole('dialog', { name: '裁切頭像' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '套用' }).click();
  await expect(dialog).toBeHidden();
}

/** 下載的 PNG 在頁面上解碼：尺寸與幾個點的顏色 */
async function pngInfo(page: Page, bytes: Buffer, points: [number, number][]) {
  return page.evaluate(
    async ([b64, pts]) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.drawImage(bmp, 0, 0);
      return {
        width: bmp.width,
        height: bmp.height,
        colors: pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data]),
      };
    },
    [bytes.toString('base64'), points] as const,
  );
}

const near = (c: number[], rgb: number[], tol = 12) =>
  c.slice(0, 3).every((v, i) => Math.abs(v - rgb[i]) <= tol);

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('開頁：沒有錯誤、頁尾只有靈感來源、預設的角色卡與兩頁紙面', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer a')).toHaveCount(1);
    await expect(page.locator('footer')).toContainText(
      '靈感來源：ihoukentiku/ihoukentiku.github.io',
    );
    await expect(sheets(page)).toHaveCount(1);
    await expect(field(page, '角色卡名稱（新角色卡）')).toHaveValue('新角色卡');
    await expect(paper(page).locator('.cs-page')).toHaveCount(2);
    await expect(page1(page).locator('.cs-sk')).toHaveCount(60);
    await expect(skillCell(page, 1)).toContainText('恐嚇（15%）');
    expect(await roll(skillCell(page, 1))).toEqual(['15', '7', '3']);
    await expect(skillCell(page, 8)).toContainText('閃避（DEX×½）');
    expect(await roll(skillCell(page, 8))).toEqual(['', '', '']);
    await expect(skillCell(page, 9)).toContainText('科學（1%）');
    await expect(skillCell(page, 19)).toContainText('克蘇魯神話（0%）');
    expect(await roll(skillCell(page, 19))).toEqual(['0', '', '']);
    await expect(skillCell(page, 19).locator('.cs-check.off')).toHaveCount(1);
    await expect(skillCell(page, 52)).toContainText('母語（EDU%）');
    await expect(page1(page).locator('.cs-wrow[data-weapon]')).toHaveCount(7);
    await expect(weaponRow(page, 0)).toContainText('徒手');
    await expect(weaponRow(page, 0)).toContainText('1D3 + DB');
    await expect(weaponRow(page, 0).locator('.cs-wc').nth(1)).toHaveText('25');
    await expect(page2(page)).toContainText('外貌描述');
    await expect(page2(page)).toContainText('遭遇過的超自然存在');
    await expect(page.getByTestId('migration-notice')).toHaveCount(0);
    await expect(warnings(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('屬性：困難／極限、自動計算與手動值、目前值、狀態勾選', async ({ page }) => {
    const errors = await open(page);
    await field(page, '年齡').fill('42');
    await tab(page, '屬性與狀態');
    const vals: [string, string][] = [
      ['STR 力量', '50'],
      ['DEX 敏捷', '65'],
      ['INT 智力（靈感）', '70'],
      ['CON 體質', '55'],
      ['APP 外貌', '45'],
      ['POW 意志', '60'],
      ['SIZ 體型', '70'],
      ['EDU 教育（知識）', '80'],
    ];
    for (const [label, v] of vals) await field(page, label).fill(v);
    await expect(page.getByTestId('stat-STR-thresholds')).toHaveText('困難 25／極限 10');
    expect(await roll(stat(page, 'STR'))).toEqual(['50', '25', '10']);
    expect(await roll(stat(page, 'EDU'))).toEqual(['80', '40', '16']);
    /* 自動：HP 12、MP 12、初始理智 60、理智上限 99、移動力 6（42 歲） */
    await expect(field(page, '生命值上限')).toHaveAttribute('placeholder', '12');
    await expect(page.getByText('空白＝自動：12（(CON＋SIZ)÷10）')).toBeVisible();
    const thead = page1(page).locator('.cs-thead .cs-mini');
    await expect(thead.nth(0)).toHaveText('12');
    await expect(thead.nth(1)).toHaveText('60');
    await expect(thead.nth(2)).toHaveText('99');
    await expect(page1(page).locator('[data-stat="MOV"] .cs-oval')).toHaveText('6');
    /* 手動 → 改回自動 */
    await field(page, '生命值上限').fill('15');
    await expect(thead.nth(0)).toHaveText('15');
    await btn(page, '改回自動（生命值上限）').click();
    await expect(thead.nth(0)).toHaveText('12');
    await expect(field(page, '生命值上限')).toHaveValue('');
    await field(page, '移動力').fill('9');
    await expect(page1(page).locator('[data-stat="MOV"] .cs-oval')).toHaveText('9');
    /* 目前值：圈起來；超過上限變淡 */
    await field(page, '目前的生命值').fill('10');
    const hpTrack = page1(page).locator('.cs-hp .cs-track');
    await expect(hpTrack.locator('[data-n="10"]')).toHaveClass(/cs-now/);
    await expect(hpTrack.locator('[data-n="13"]')).toHaveClass(/cs-over/);
    await expect(hpTrack.locator('[data-n="12"]')).not.toHaveClass(/cs-over/);
    await field(page, '目前的理智').fill('55');
    await expect(page1(page).locator('.cs-san .cs-track [data-n="55"]')).toHaveClass(/cs-now/);
    /* 狀態勾選 */
    await page.getByRole('checkbox', { name: '重傷' }).click();
    await page.getByRole('checkbox', { name: '不定期瘋狂' }).click();
    await expect(page1(page).locator('.cs-hp .cs-check').first()).toHaveText('✓');
    await expect(page1(page).locator('.cs-san .cs-check').nth(1)).toHaveText('✓');
    /* 幸運 */
    await field(page, '幸運').fill('55');
    await expect(page1(page).locator('.cs-luck .cs-mini')).toHaveText('55');
    /* 0 的困難／極限留白 */
    await field(page, 'STR 力量').fill('0');
    expect(await roll(stat(page, 'STR'))).toEqual(['0', '', '']);
    /* 數字欄：全形數字、看不懂的字還原 */
    await field(page, 'STR 力量').fill('６０');
    expect(await roll(stat(page, 'STR'))).toEqual(['60', '30', '12']);
    await field(page, 'STR 力量').fill('abc');
    await field(page, 'STR 力量').blur();
    await expect(field(page, 'STR 力量')).toHaveValue('60');
    expect(errors).toEqual([]);
  });

  test('技能：點數、技能值、Enter／Backspace、超過 60 列、搜尋、成長勾選、Alt＋↓ 排序', async ({
    page,
  }) => {
    const errors = await open(page);
    await tab(page, '屬性與狀態');
    await field(page, 'INT 智力（靈感）').fill('70');
    await field(page, 'EDU 教育（知識）').fill('80');
    await tab(page, '技能');
    await expect(field(page, '職業技能點數')).toHaveAttribute('placeholder', '320');
    await field(page, '職業（偵查）').fill('50');
    await expect(page.getByTestId('budget-occupation')).toHaveText('已用 50／320');
    await expect(field(page, '技能值（偵查）')).toHaveAttribute('placeholder', '75');
    expect(await roll(skillCell(page, 54))).toEqual(['75', '37', '15']);
    await field(page, '興趣（恐嚇）').fill('150');
    await expect(page.getByTestId('budget-interest')).toHaveText('已用 150／140（超過 10 點）');
    /* 手動的技能值 → 改回自動 */
    await field(page, '技能值（恐嚇）').fill('70');
    expect(await roll(skillCell(page, 1))).toEqual(['70', '35', '14']);
    await btn(page, '改回自動（恐嚇）').click();
    expect(await roll(skillCell(page, 1))).toEqual(['165', '82', '33']);
    /* 母語的初始值＝EDU */
    expect(await roll(skillCell(page, 52))).toEqual(['80', '40', '16']);
    /* 成長勾選 */
    await page.getByRole('checkbox', { name: '成長勾選（恐嚇）' }).click();
    await expect(skillCell(page, 1).locator('.cs-check')).toHaveText('✓');
    /* 專長 */
    await field(page, '專長（科學）').fill('化學');
    await expect(skillCell(page, 9)).toContainText('化學');
    /* 空白列：名稱 → Enter 插入一列（游標移過去）→ Backspace 刪掉（游標回來） */
    const name10 = field(page, '技能名稱（第 10 列）');
    await name10.fill('藥學');
    await expect(skillCell(page, 10)).toContainText('藥學');
    await name10.press('Enter');
    await expect(skillRows(page)).toHaveCount(61);
    await expect(field(page, '技能名稱（第 11 列）')).toBeFocused();
    await expect(warnings(page)).toContainText('技能有 61 列；角色卡只印得下 60 列');
    await page.keyboard.press('Backspace');
    await expect(skillRows(page)).toHaveCount(60);
    await expect(name10).toBeFocused();
    await expect(warnings(page)).toHaveCount(0);
    /* 列的按鈕：插入、刪除（可以復原） */
    await btn(page, '在「藥學」下面插入一列').click();
    await expect(skillRows(page)).toHaveCount(61);
    await btn(page, '刪除「藥學」').click();
    await expect(skillRows(page)).toHaveCount(60);
    await expect(skillCell(page, 10)).not.toContainText('藥學');
    await page.keyboard.press('Control+z');
    await expect(skillCell(page, 10)).toContainText('藥學');
    /* 新增技能：加在最後 */
    await btn(page, '新增技能').first().click();
    await expect(skillRows(page)).toHaveCount(62);
    await expect(field(page, '技能名稱（第 62 列）')).toBeFocused();
    /* 搜尋 */
    await field(page, '搜尋技能').fill('射擊');
    await expect(skillRows(page)).toHaveCount(2);
    await field(page, '搜尋技能').fill('沒有這個');
    await expect(page.getByText('沒有符合的技能。')).toBeVisible();
    await field(page, '搜尋技能').fill('');
    /* Alt＋↓：第一列往下移 */
    await skillRows(page).first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(skillCell(page, 1)).toContainText('話術');
    await expect(skillCell(page, 2)).toContainText('恐嚇');
    /* 閃避的初始值跟著 DEX */
    await expect(page.getByTestId('skill-base-formula').first()).toContainText('DEX½');
    await tab(page, '屬性與狀態');
    await field(page, 'DEX 敏捷').fill('65');
    await tab(page, '技能');
    await expect(page.getByTestId('skill-base-formula').first()).toContainText('32');
    expect(await roll(skillCell(page, 8))).toEqual(['32', '16', '6']);
    expect(errors).toEqual([]);
  });

  test('戰鬥：武器（使用的技能、上移、超過 7 把）、DB／體格、閃避', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '屬性與狀態');
    await field(page, 'STR 力量').fill('50');
    await field(page, 'SIZ 體型').fill('70');
    await tab(page, '戰鬥');
    const weapons = page.getByRole('list', { name: '武器清單' }).getByRole('listitem');
    await expect(weapons).toHaveCount(1);
    await expect(page.getByTestId('weapon-linked-value')).toContainText('25');
    await btn(page, '新增武器').click();
    await field(page, '武器名稱（未命名的武器）').fill('手槍');
    await page.getByRole('combobox', { name: '使用的技能（手槍）' }).click();
    await page.getByRole('option', { name: '射擊（手槍）（20）' }).click();
    await field(page, '傷害（手槍）').fill('1D10');
    await field(page, '射程（手槍）').fill('15m');
    await expect(weaponRow(page, 1)).toContainText('手槍');
    await expect(weaponRow(page, 1).locator('.cs-wc').nth(1)).toHaveText('20');
    await expect(weaponRow(page, 1).locator('.cs-wc').nth(2)).toHaveText('10');
    await expect(weaponRow(page, 1).locator('.cs-wc').nth(3)).toHaveText('4');
    await expect(weaponRow(page, 1)).toContainText('1D10');
    /* 直接填技能值 */
    await page.getByRole('combobox', { name: '使用的技能（手槍）' }).click();
    await page.getByRole('option', { name: '（直接填技能值）' }).click();
    await field(page, '技能值（手槍）').fill('45');
    await expect(weaponRow(page, 1).locator('.cs-wc').nth(1)).toHaveText('45');
    /* 上移 */
    await btn(page, '把「手槍」往上移').click();
    await expect(weaponRow(page, 0)).toContainText('手槍');
    await expect(weaponRow(page, 1)).toContainText('徒手');
    /* DB／體格：自動 0／0；STR 80 → +1D4／1；手動 */
    const ovals = page1(page).locator('.cs-combat .cs-oval');
    await expect(ovals.nth(0)).toHaveText('0');
    await expect(ovals.nth(1)).toHaveText('0');
    await field(page, '傷害加值（DB）').fill('+1D6');
    await expect(ovals.nth(0)).toHaveText('+1D6');
    await btn(page, '改回自動（傷害加值（DB））').click();
    await tab(page, '屬性與狀態');
    await field(page, 'STR 力量').fill('80');
    await expect(ovals.nth(0)).toHaveText('+1D4');
    await expect(ovals.nth(1)).toHaveText('1');
    /* 閃避跟著技能 */
    await field(page, 'DEX 敏捷').fill('60');
    expect(await roll(page1(page).locator('.cs-combat .cs-roll'))).toEqual(['30', '15', '6']);
    await tab(page, '戰鬥');
    await expect(page.getByTestId('combat-dodge')).toHaveText('30（困難 15／極限 6）');
    /* 超過 7 把 */
    for (let i = 0; i < 6; i++) await btn(page, '新增武器').click();
    await expect(weapons).toHaveCount(8);
    await expect(warnings(page)).toContainText('武器有 8 列；角色卡只印得下 7 列');
    expect(errors).toEqual([]);
  });

  test('背景與物品：背景故事、裝備、資產、備註；文字太多時提醒', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '背景與物品');
    await field(page, '外貌描述').fill('身材瘦高，總是穿著洗到褪色的風衣。');
    await expect(page2(page).locator('.cs-lines').first()).toContainText(
      '外貌描述身材瘦高，總是穿著洗到褪色的風衣。',
    );
    await field(page, '裝備與隨身物品').fill(
      ['手電筒', '筆記本', '', '', '', '', '', '', '', '', '左輪手槍'].join('\n'),
    );
    const gearCols = page2(page).locator('.cs-gear .cs-lcol');
    await expect(gearCols.nth(0).locator('.cs-line').nth(0)).toHaveText('手電筒');
    await expect(gearCols.nth(0).locator('.cs-line').nth(1)).toHaveText('筆記本');
    await expect(gearCols.nth(1).locator('.cs-line').nth(0)).toHaveText('左輪手槍');
    await field(page, '消費水準').fill('中等');
    await field(page, '現金').fill('$500');
    await field(page, '其他').fill('公寓一間');
    const assets = page2(page).locator('.cs-assets .cs-line');
    await expect(assets.nth(0)).toHaveText('消費水準中等');
    await expect(assets.nth(1)).toHaveText('現金$500');
    await expect(assets.nth(3)).toHaveText('公寓一間');
    await field(page, '備註').fill('第一行\n第二行');
    await expect(page2(page).locator('.cs-memo-text')).toHaveText('第一行\n第二行');
    await expect(warnings(page)).toHaveCount(0);
    /* 太多 */
    await field(page, '備註').fill(
      Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行`).join('\n'),
    );
    await field(page, '思想／信念').fill('很長的信念'.repeat(80));
    await expect(warnings(page)).toContainText(
      '這些欄位的文字太多，印出來會被截掉：思想／信念、備註。',
    );
    await field(page, '備註').fill('');
    await field(page, '思想／信念').fill('');
    await expect(warnings(page)).toHaveCount(0);
    /* 自訂欄 */
    await tab(page, '基本資料');
    await field(page, '標題').fill('線索');
    await field(page, '內容').fill('鑰匙');
    await expect(page1(page).locator('.cs-custom .cs-head')).toHaveText('線索');
    await expect(page1(page).locator('.cs-custom .cs-lines')).toHaveText('鑰匙');
    expect(errors).toEqual([]);
  });

  test('頭像：上傳後裁切、調整裁切、移除、重新整理後還在', async ({ page }) => {
    const errors = await open(page);
    await uploadPortrait(page);
    const img = page1(page).locator('.cs-portrait-frame img');
    await expect(img).toHaveCount(1);
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    /* 13：16 的比例（300×200 的圖：寬 163、高 201） */
    expect(
      await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]),
    ).toEqual([163, 201]);
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page1(page).locator('.cs-portrait-frame img')).toHaveCount(1);
    await expect
      .poll(() =>
        page1(page)
          .locator('.cs-portrait-frame img')
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBe(163);
    await btn(page, '調整裁切').click();
    const dialog = page.getByRole('dialog', { name: '裁切頭像' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '套用' }).click();
    await btn(page, '移除頭像').click();
    await expect(page1(page).locator('.cs-portrait-frame img')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(page1(page).locator('.cs-portrait-frame img')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('多張角色卡：新增、重新命名、複製、刪除（確認、可以復原）、切換、重新整理後還原', async ({
    page,
  }) => {
    const errors = await open(page);
    await field(page, '姓名').fill('林子安');
    await expect(sheets(page).first()).toContainText('林子安');
    await btn(page, '新增角色卡').click();
    await expect(sheets(page)).toHaveCount(2);
    await expect(field(page, '姓名')).toHaveValue('');
    await sheets(page).nth(1).getByRole('textbox').fill('乙');
    await field(page, '姓名').fill('佐藤');
    await expect(page1(page).locator('.cs-info')).toContainText('佐藤');
    await btn(page, '複製「乙」').click();
    await expect(sheets(page)).toHaveCount(3);
    await expect(sheets(page).nth(2).getByRole('textbox')).toHaveValue('乙（複本）');
    await expect(sheets(page).nth(2).getByRole('button', { name: '編輯中' })).toBeVisible();
    await expect(field(page, '姓名')).toHaveValue('佐藤');
    /* 切換 */
    await sheets(page).nth(0).getByRole('button', { name: '選取' }).click();
    await expect(field(page, '姓名')).toHaveValue('林子安');
    await expect(page1(page).locator('.cs-info')).toContainText('林子安');
    /* 刪除：先確認 */
    await btn(page, '刪除「乙（複本）」').click();
    const confirm = page.getByRole('alertdialog', { name: '刪除角色卡「乙（複本）」？' });
    await expect(confirm).toContainText('可以用復原');
    await confirm.getByRole('button', { name: '刪除' }).click();
    await expect(sheets(page)).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(sheets(page)).toHaveCount(3);
    /* 重新整理：清單、目前的角色卡、分頁 */
    await sheets(page).nth(1).getByRole('button', { name: '選取' }).click();
    await tab(page, '技能');
    await page.waitForTimeout(100);
    await page.reload();
    await expect(sheets(page)).toHaveCount(3);
    await expect(page.getByRole('tab', { name: '技能', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tab(page, '基本資料');
    await expect(field(page, '姓名')).toHaveValue('佐藤');
    expect(errors).toEqual([]);
  });

  test('舊版的存檔：第一次開啟時搬過來（真實的舊版存檔），之後不再讀舊版', async ({ page }) => {
    const errors = await open(page);
    await page.evaluate((f) => {
      localStorage.clear();
      localStorage.setItem('coc7_charasheet', JSON.stringify(f.charasheet));
      localStorage.setItem('coc7_autosave', f.autosave);
    }, LEGACY);
    await page.reload();
    const notice = page.getByTestId('migration-notice');
    await expect(notice).toContainText('已從舊版角色卡搬來 3 張');
    await expect(notice).toContainText('「自動儲存的角色卡」、「調查員甲」、「調查員乙」');
    await expect(notice).toContainText(
      '「調查員甲」：下列內容無法轉換，已略過：欄位名稱「PL」（玩家欄改過的名稱；新版的欄位名稱是固定的）；技能「機械維修」的技能值「60/30」（只取 60）',
    );
    await expect(sheets(page)).toHaveCount(3);
    await expect(field(page, '姓名')).toHaveValue('佐藤（改）');
    /* 調查員甲 */
    await sheets(page).nth(1).getByRole('button', { name: '選取' }).click();
    await expect(field(page, '姓名')).toHaveValue('林子安');
    await expect(field(page, '玩家')).toHaveValue('小明');
    expect(await roll(stat(page, 'STR'))).toEqual(['50', '25', '10']);
    await expect(page1(page).locator('[data-stat="MOV"] .cs-oval')).toHaveText('7');
    await expect(page1(page).locator('.cs-custom .cs-head')).toHaveText('線索');
    await expect(skillCell(page, 9)).toContainText('化學');
    expect(await roll(skillCell(page, 9))).toEqual(['31', '15', '6']);
    await expect(skillCell(page, 18)).toContainText('神學');
    expect(await roll(skillCell(page, 18))).toEqual(['20', '10', '4']);
    await expect(skillCell(page, 26)).toContainText('電腦使用（0%）');
    await expect(weaponRow(page, 1)).toContainText('手槍（.38）');
    await expect(page1(page).locator('.cs-portrait-frame img')).toHaveCount(1);
    await expect
      .poll(() =>
        page1(page)
          .locator('.cs-portrait-frame img')
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBe(520);
    await expect(page2(page)).toContainText('相信科學');
    await btn(page, '知道了').click();
    await expect(notice).toHaveCount(0);
    /* 舊版的資料沒有刪；新版已經有存檔 */
    const keys = await page.evaluate(() => ({
      saves: localStorage.getItem('coc7_charasheet'),
      auto: localStorage.getItem('coc7_autosave'),
      mine: localStorage.getItem('trpg-toolkit:coc-sheet'),
    }));
    expect(keys.saves).toBe(JSON.stringify(LEGACY.charasheet));
    expect(keys.auto).toBe(LEGACY.autosave);
    expect(keys.mine).not.toBeNull();
    /* 重新整理：不再搬、目前的角色卡還是調查員甲、頭像還在 */
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByTestId('migration-notice')).toHaveCount(0);
    await expect(sheets(page)).toHaveCount(3);
    await expect(field(page, '姓名')).toHaveValue('林子安');
    await expect(page1(page).locator('.cs-portrait-frame img')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('復原／重做、快捷鍵說明', async ({ page }) => {
    const errors = await open(page);
    await field(page, '姓名').fill('ABC');
    await expect(page.getByRole('button', { name: /^復原/ })).toBeEnabled();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect(field(page, '姓名')).toHaveValue('');
    await page.keyboard.press('Control+Shift+z');
    await expect(field(page, '姓名')).toHaveValue('ABC');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    await expect(field(page, '姓名')).toHaveValue('ABC');
    /* 打字之後緊接著的操作（400 ms 內）仍是獨立的一步 */
    await field(page, '姓名').fill('ABCD');
    await btn(page, '新增角色卡').click();
    await expect(sheets(page)).toHaveCount(2);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect(sheets(page)).toHaveCount(1);
    await expect(field(page, '姓名')).toHaveValue('ABCD');
    await page.keyboard.press('Shift+?');
    const help = page.getByRole('dialog', { name: '快捷鍵' });
    await expect(help).toContainText('列印');
    await expect(help).toContainText('復原');
    expect(errors).toEqual([]);
  });

  test('專案檔（ZIP，含頭像）、全部重來、開啟專案檔', async ({ page }) => {
    const errors = await open(page);
    await field(page, '姓名').fill('林子安');
    await uploadPortrait(page);
    await btn(page, '新增角色卡').click();
    await field(page, '姓名').fill('佐藤');
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^CoC 角色卡_\d{8}\.zip$/);
    const path = (await dl.path()) as string;
    const zip = unzipSync(new Uint8Array(readFileSync(path)));
    const project = JSON.parse(new TextDecoder().decode(zip['project.json']));
    expect(project).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'coc-sheet',
      version: 1,
    });
    expect(project.data.sheets.map((s: { info: { name: string } }) => s.info.name)).toEqual([
      '林子安',
      '佐藤',
    ]);
    expect(project.data.currentId).toBe(project.data.sheets[1].id);
    const pngs = Object.keys(zip).filter((n) => n.startsWith('files/') && n.endsWith('.png'));
    expect(pngs).toEqual([`files/${project.data.sheets[0].portrait.assetId}.png`]);

    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await expect(page.getByRole('alertdialog')).toContainText('刪除所有角色卡、重新開始？');
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(sheets(page)).toHaveCount(1);
    await expect(field(page, '姓名')).toHaveValue('');

    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(path);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(sheets(page)).toHaveCount(2);
    await expect(field(page, '姓名')).toHaveValue('佐藤');
    await sheets(page).nth(0).getByRole('button', { name: '選取' }).click();
    await expect(page1(page).locator('.cs-portrait-frame img')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
    /* 不是這個工具的資料 */
    await btn(page, '專案').click();
    const [chooser2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser2.setFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'trpg-toolkit-project',
          tool: 'coc-sheet',
          version: 1,
          savedAt: '',
          data: { foo: 1 },
        }),
      ),
    });
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(page.getByText('專案檔的內容無法使用。').first()).toBeVisible();
    await expect(sheets(page)).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('列印：只印角色卡兩頁（按鈕與 Ctrl＋P）', async ({ page }) => {
    const errors = await open(page);
    await field(page, '姓名').fill('林子安');
    await btn(page, '列印／存成 PDF').click();
    const frame = page.frameLocator('iframe[data-paged-print]');
    await expect(frame.locator('.paged-print-page')).toHaveCount(2);
    await expect(frame.locator('body')).toHaveClass('cs-sheet');
    await expect(frame.locator('.cs-page')).toHaveCount(2);
    await expect(frame.locator('.cs-info')).toContainText('林子安');
    expect(await page.locator('iframe[data-paged-print]').getAttribute('title')).toBe('林子安');
    const css = await frame.locator('style').first().textContent();
    expect(css).toContain('@page{size:210mm 297mm;margin:0}');
    expect(css).toContain('print-color-adjust:exact');
    /* Ctrl＋P（在輸入框裡也有效）：重新建立列印文件 */
    await field(page, '姓名').fill('佐藤');
    await field(page, '姓名').press('Control+p');
    await expect(frame.locator('.cs-info')).toContainText('佐藤');
    await expect(page.locator('iframe[data-paged-print]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('匯出 PNG：第 1 頁（192 dpi）、兩頁接成一張（96 dpi）的尺寸與像素', async ({ page }) => {
    const errors = await open(page);
    await field(page, '姓名').fill('林子安');
    const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出 PNG').click()]);
    expect(dl.suggestedFilename()).toBe('林子安_角色卡_第1頁.png');
    await expect(page.getByText('已匯出 林子安_角色卡_第1頁.png').first()).toBeVisible();
    const bytes = readFileSync((await dl.path()) as string);
    /* 角落白色；「調查員角色卡」標題帶是深藍灰（#2f4656） */
    const info = await pngInfo(page, bytes, [
      [10, 10],
      [73, 72],
    ]);
    expect([info.width, info.height]).toEqual([1588, 2246]);
    expect(near(info.colors[0], [255, 255, 255])).toBe(true);
    expect(near(info.colors[1], [47, 70, 86], 16)).toBe(true);
    /* 兩頁、倍率 1 */
    await page.getByRole('combobox', { name: 'PNG 的頁面' }).click();
    await page.getByRole('option', { name: '兩頁接成一張' }).click();
    await page.getByRole('combobox', { name: 'PNG 的解析度' }).click();
    await page.getByRole('option', { name: '標準（96 dpi）' }).click();
    const [dl2] = await Promise.all([page.waitForEvent('download'), btn(page, '匯出 PNG').click()]);
    expect(dl2.suggestedFilename()).toBe('林子安_角色卡.png');
    const both = await pngInfo(page, readFileSync((await dl2.path()) as string), [[400, 1131]]);
    expect([both.width, both.height]).toEqual([794, 1123 * 2 + 16]);
    expect(near(both.colors[0], [255, 255, 255])).toBe(true);
    expect(errors).toEqual([]);
  });

  test.describe('剪貼簿', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('複製 CCFOLIA 角色資料', async ({ page }) => {
      const errors = await open(page);
      await field(page, '姓名').fill('林子安');
      await tab(page, '屬性與狀態');
      await field(page, 'DEX 敏捷').fill('65');
      await field(page, 'POW 意志').fill('60');
      await btn(page, '複製 CCFOLIA 角色資料').click();
      await expect(page.getByText('已複製到剪貼簿').first()).toBeVisible();
      const text = await page.evaluate(() => navigator.clipboard.readText());
      const json = JSON.parse(text);
      expect(json.kind).toBe('character');
      expect(json.data.name).toBe('林子安');
      expect(json.data.initiative).toBe(65);
      expect(json.data.status[2]).toEqual({ label: 'SAN', value: 60, max: 99 });
      expect(json.data.commands.split('\n')[0]).toBe('CC<={SAN} 理智檢定');
      expect(json.data.commands).toContain('CC<=25 徒手');
      expect(json.data.commands).toContain('1D3+{DB} 徒手（傷害）');
      expect(errors).toEqual([]);
    });
  });

  test('縮放：縮小、放大、配合寬度', async ({ page }) => {
    const errors = await open(page);
    const value = page.getByTestId('zoom-value');
    const fit = await value.textContent();
    await btn(page, '放大').click();
    await expect(value).not.toHaveText(fit as string);
    await expect(btn(page, '配合寬度')).toHaveAttribute('aria-pressed', 'false');
    await btn(page, '配合寬度').click();
    await expect(value).toHaveText(fit as string);
    await btn(page, '縮小').click();
    const smaller = Number((await value.textContent())?.replace('%', ''));
    expect(smaller).toBeLessThan(Number(fit?.replace('%', '')));
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await field(page, '姓名').fill('林子安');
    await field(page, '職業').fill('私家偵探');
    await field(page, '年齡').fill('42');
    await tab(page, '屬性與狀態');
    for (const [label, v] of [
      ['STR 力量', '50'],
      ['DEX 敏捷', '65'],
      ['CON 體質', '55'],
      ['POW 意志', '60'],
      ['SIZ 體型', '70'],
      ['EDU 教育（知識）', '80'],
    ] as const)
      await field(page, label).fill(v);
    await tab(page, '技能');
    await field(page, '職業（偵查）').fill('50');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('coc-sheet-1280.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test('清單預設收合、每個分頁都沒有橫向捲動；視覺回歸', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByRole('list', { name: '角色卡清單' })).toBeHidden();
    await expect(page.getByTestId('collapsed-current')).toHaveText('編輯中：新角色卡');
    await noHorizontalScroll(page);
    for (const name of ['屬性與狀態', '技能', '戰鬥', '背景與物品', '基本資料']) {
      await tab(page, name);
      await noHorizontalScroll(page);
    }
    await field(page, '姓名').fill('林子安');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('coc-sheet-390.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});
