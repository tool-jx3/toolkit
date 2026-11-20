/**
 * CoC 7 版調查員角色卡：CCFOLIA 的參照式聊天面板（2026-11-20，規格 1.12、3.9、F68～F73）。
 * 開關、只放有點數的技能、複製的角色資料、寫不進參數的說明、復原、新增的角色卡跟著目前的、專案檔版本 2。
 */
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('coc-sheet') ?? { id: 'coc-sheet', status: 'next' })}/`;

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

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const refs = (page: Page) =>
  page.getByRole('switch', { name: '技能寫進參數（聊天面板用 {技能名} 參照）' });
const pointsOnly = (page: Page) => page.getByRole('switch', { name: '只放有點數的技能' });

async function copied(page: Page) {
  await btn(page, '複製 CCFOLIA 角色資料').click();
  await expect(page.getByText('已複製到剪貼簿').first()).toBeVisible();
  return JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).data;
}

test.describe('參照式聊天面板', () => {
  test.use({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 900 },
  });

  test('技能寫進參數；只放有點數的技能；復原', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('tab', { name: '屬性與狀態', exact: true }).click();
    await field(page, 'STR 力量').fill('50');
    await field(page, 'SIZ 體型').fill('60');
    const off = await copied(page);
    expect(off.commands).toContain('CC<=25 徒手');
    expect(off.commands).toContain('//STR=50');
    await expect(pointsOnly(page)).toHaveCount(0);
    await refs(page).click();
    const on = await copied(page);
    const lines = on.commands.split('\n');
    expect(lines).toContain('CC<={STR} STR');
    expect(lines).toContain('CC<={恐嚇} 恐嚇');
    expect(lines).toContain('CC<={格鬥（鬥毆）} 徒手');
    expect(lines).toContain('1D3+{DB} 徒手（傷害）');
    expect(lines.some((l: string) => l.startsWith('//'))).toBe(false);
    const labels = on.params.map((p: { label: string }) => p.label);
    expect(labels.slice(0, 11)).toEqual([
      'STR',
      'CON',
      'POW',
      'DEX',
      'APP',
      'SIZ',
      'INT',
      'EDU',
      'DB',
      '體格',
      'MOV',
    ]);
    expect(labels).toContain('恐嚇');
    /* 只放有點數的技能：預設的技能都沒點數 → 參數只有屬性那些，檢定寫數字 */
    await pointsOnly(page).click();
    const few = await copied(page);
    expect(few.params).toHaveLength(11);
    expect(few.commands).toContain('CC<=15 恐嚇');
    expect(few.commands).toContain('CC<={STR} STR');
    await page.keyboard.press('Control+z');
    await expect(pointsOnly(page)).not.toBeChecked();
    await page.keyboard.press('Control+z');
    await expect(refs(page)).not.toBeChecked();
    expect((await copied(page)).commands).toBe(off.commands);
    expect(errors).toEqual([]);
  });

  test('寫不進參數的名稱：大括號、重複、和狀態同名（技能表第 10～12 列）', async ({ page }) => {
    const errors = await open(page);
    await refs(page).click();
    await page.getByRole('tab', { name: '技能', exact: true }).click();
    /*
     * 第 10、11 列是空白列（沒有初始值）：名稱之外還要有技能值或點數才會輸出（和沒開時相同，3.7）。
     * 先填技能值（欄位的名稱是「第 n 列」），再改名稱。第 12 列是「鎖匠」（初始 1）。
     */
    await field(page, '技能值（第 10 列）').fill('30');
    await field(page, '技能名稱（第 10 列）').fill('{x}');
    await field(page, '技能值（第 11 列）').fill('40');
    await field(page, '技能名稱（第 11 列）').fill('偵查');
    await field(page, '技能名稱（第 12 列）').fill('san');
    await expect(page.getByTestId('refs-skipped')).toHaveText(
      '這些技能沒寫進參數，聊天面板照舊寫數字：{x}（名稱有大括號）、san（和屬性、狀態同名）、偵查（名稱重複）。',
    );
    const data = await copied(page);
    const lines = data.commands.split('\n');
    expect(lines).toContain('CC<=30 {x}');
    expect(lines).toContain('CC<=1 san');
    /* 第 11 列的「偵查」在前面，寫進參數；預設的「偵查」（第 54 列，初始 25）重複，寫數字 */
    expect(lines).toContain('CC<={偵查} 偵查');
    expect(lines).toContain('CC<=25 偵查');
    const params = data.params.map(
      (p: { label: string; value: string }) => `${p.label}=${p.value}`,
    );
    expect(params).toContain('偵查=40');
    expect(params.filter((p: string) => p.startsWith('偵查='))).toHaveLength(1);
    expect(
      params.some((p: string) => p.startsWith('{x}') || p.toUpperCase().startsWith('SAN=')),
    ).toBe(false);
    expect(errors).toEqual([]);
  });

  test('新增的角色卡跟著目前的；重新整理後還在', async ({ page }) => {
    const errors = await open(page);
    await refs(page).click();
    await btn(page, '新增角色卡').click();
    await expect(refs(page)).toBeChecked();
    await page.reload();
    await expect(refs(page)).toBeChecked();
    const saved = JSON.parse(
      (await page.evaluate(() => localStorage.getItem('trpg-toolkit:coc-sheet'))) as string,
    );
    expect(saved.version).toBe(2);
    expect(saved.state.data.sheets.map((s: { paletteRefs?: boolean }) => s.paletteRefs)).toEqual([
      true,
      true,
    ]);
    expect(errors).toEqual([]);
  });

  test('390 寬沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await refs(page).click();
    await pointsOnly(page).click();
    const [sw, cw] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(sw).toBeLessThanOrEqual(cw);
    expect(errors).toEqual([]);
  });
});
