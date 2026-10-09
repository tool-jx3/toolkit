/**
 * 舊網址的轉址頁（repo 的 tools/trpg-lab/，照原樣複製進網站）：每一頁都轉到改寫後的新工具，
 * 地圖編輯器的 ?id= 與網址的 #… 照樣帶過去；實驗室首頁轉到首頁的「CoC 跑團輔助」。
 */
import { expect, test } from '@playwright/test';

const PAGES: [string, string][] = [
  ['coc7_dice.html', '/tools/coc-dice/'],
  ['damage_sum.html', '/tools/coc-dice/'],
  ['coc_npc_token.html', '/tools/coc-npc/'],
  ['coc7_Investigator_sheet.html', '/tools/coc-sheet/'],
  ['grid_maker.html', '/tools/grid-maker/'],
  ['hex_maker.html', '/tools/grid-maker/'],
  ['grid_ruler.html', '/tools/range-ruler/'],
  ['hex_ruler.html', '/tools/range-ruler/'],
  ['trpg_map_maker/map_list.html', '/tools/map-editor/'],
];

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

for (const [from, to] of PAGES) {
  test(`tools/trpg-lab/${from} → ${to}`, async ({ page }) => {
    await page.goto(`/tools/trpg-lab/${from}`);
    await expect(page).toHaveURL((u) => u.pathname === to);
    await expect(page.locator('#root')).not.toBeEmpty();
  });
}

test('地圖編輯器：?id= 與 # 照樣帶過去；找不到那張地圖時回到一覽並提示', async ({ page }) => {
  await page.goto('/tools/trpg-lab/trpg_map_maker/map_editor.html?id=nonexistent123#x');
  await expect(page).toHaveURL((u) => u.pathname === '/tools/map-editor/');
  await expect(page.getByText('找不到這張地圖').first()).toBeVisible();
});

test('實驗室首頁 → 首頁的「CoC 跑團輔助」；授權頁 → 網站的通知檔', async ({ page }) => {
  await page.goto('/tools/trpg-lab/');
  await expect(page).toHaveURL((u) => u.pathname === '/' && u.hash === '#group-G9');
  await expect(page.locator('#group-G9')).toBeVisible();
  const res = await page.goto('/tools/trpg-lab/third-party-licenses.html');
  expect(res?.ok()).toBe(true);
  await expect(page).toHaveURL((u) => u.pathname === '/assets/build/THIRD_PARTY_NOTICES.md');
});
