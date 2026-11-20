/**
 * CoC NPC 產生器：參照式聊天面板（2026-11-20，規格 1.9、3.6、F38～F43）。
 * 開關、技能寫進參數、聊天面板用 {技能名}、寫不進參數的技能的說明、新增的 NPC 跟著目前的、復原、存檔與專案檔。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('coc-npc') ?? { id: 'coc-npc', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: 'CoC NPC 產生器' })).toBeVisible();
  return errors;
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const output = (page: Page) => page.getByTestId('npc-output').locator('textarea');
const refs = (page: Page) =>
  page.getByRole('switch', { name: '技能寫進參數（聊天面板用 {技能名} 參照）' });

async function json(page: Page) {
  await page.getByRole('radio', { name: 'CCFOLIA' }).click();
  return JSON.parse(await output(page).inputValue());
}
async function palette(page: Page) {
  await page.getByRole('radio', { name: '聊天面板' }).click();
  return output(page).inputValue();
}

test.describe('參照式聊天面板', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('開關：技能寫進參數、聊天面板用 {技能名}；關掉時和以前一樣', async ({ page }) => {
    const errors = await open(page);
    await field(page, 'STR 的值').fill('60');
    await field(page, '技能 1：名稱').fill('偵查');
    await field(page, '技能 1：成功率').fill('70');
    await btn(page, '新增技能').click();
    await field(page, '技能 2：名稱').fill('偵查');
    await field(page, '技能 2：成功率').fill('40');
    await field(page, '指令 1：名稱').fill('踢');
    await field(page, '指令 1：算式').fill('1D6+db+str');
    const before = await palette(page);
    expect(before).toContain('CC<=70 偵查');
    expect(before).toContain('//STR=60');
    expect(before).toContain('1D6+{DB}+str 踢');
    await expect(refs(page)).not.toBeChecked();
    await refs(page).click();
    const p = await palette(page);
    expect(p.split('\n').slice(0, 2)).toEqual(['CC<={SAN} 理智檢定', 'CC<={STR} STR']);
    expect(p).toContain('CC<={偵查} 偵查');
    expect(p).toContain('CC<=40 偵查');
    expect(p).toContain('1D6+{DB}+{STR} 踢');
    expect(p).not.toContain('//');
    await expect(page.getByTestId('refs-skipped')).toHaveText(
      '這些技能沒寫進參數，聊天面板照舊寫數字：偵查（名稱重複）。',
    );
    const data = (await json(page)).data;
    expect(data.params.at(-1)).toEqual({ label: '偵查', value: '70' });
    expect(data.commands).toBe(p);
    /* 復原：一步回到關 */
    await page.keyboard.press('Control+z');
    await expect(refs(page)).not.toBeChecked();
    expect(await palette(page)).toBe(before);
    expect(errors).toEqual([]);
  });

  test('新增的 NPC 跟著目前的；存檔與專案檔帶著這個設定（專案檔版本 2）', async ({ page }) => {
    const errors = await open(page);
    await refs(page).click();
    await btn(page, '新增 NPC').click();
    await expect(refs(page)).toBeChecked();
    await page.reload();
    await expect(refs(page)).toBeChecked();
    const saved = await page.evaluate(() => localStorage.getItem('trpg-toolkit:coc-npc'));
    expect(
      JSON.parse(saved as string).state.data.npcs.map(
        (n: { paletteRefs?: boolean }) => n.paletteRefs,
      ),
    ).toEqual([true, true]);
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
    ]);
    const project = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(project).toMatchObject({ tool: 'coc-npc', version: 2 });
    expect(project.data.npcs[0].paletteRefs).toBe(true);
    /* 關掉時拿掉欄位（存檔和以前相同）；目前的是新增的第二個 */
    await refs(page).click();
    await expect
      .poll(async () =>
        JSON.parse(
          (await page.evaluate(() => localStorage.getItem('trpg-toolkit:coc-npc'))) as string,
        ).state.data.npcs.map((n: object) => 'paletteRefs' in n),
      )
      .toEqual([true, false]);
    expect(errors).toEqual([]);
  });

  test('390 寬沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await refs(page).click();
    const [sw, cw] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(sw).toBeLessThanOrEqual(cw);
    expect(errors).toEqual([]);
  });
});
