/**
 * 首頁（web/src/index.html → repo 根目錄的 index.html）：
 * 卡片從 registry 產生、每個連結都指得到、搜尋、分類連結、靈感來源頁尾、與工具頁互相往返。
 */
import { expect, type Page, test } from '@playwright/test';
import { EXTERNAL, homeEntries, LEGACY, matchEntry } from '../../src/home/entries';
import { getTool, outputDir, TOOLS } from '../../src/registry';

const entries = homeEntries();
const live = TOOLS.filter((t) => t.status === 'live');

/** 名稱開頭的卡片（連結的名稱＝名稱＋標記＋說明） */
const startsWith = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const cards = (page: Page) =>
  page.getByRole('main').getByRole('region').getByRole('listitem').getByRole('link');
const search = (page: Page) => page.getByRole('searchbox', { name: '搜尋工具' });

test('列出每個已上線的工具、還沒重寫完的舊版工具與其他網站，連結都指得到', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('TRPG Toolkit｜跑團用的網頁小工具');
  await expect(page.getByRole('heading', { level: 1, name: 'TRPG Toolkit' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(entries.length);
  await expect(page.getByText(`共 ${entries.length - EXTERNAL.length} 個`)).toBeVisible();

  for (const t of live) {
    const card = page.getByRole('link', { name: startsWith(t.name) });
    await expect(card, t.id).toHaveAttribute('href', `./tools/${t.id}/`);
    await expect(card).toContainText(t.summary);
  }
  for (const e of LEGACY.filter((e) => !live.some((t) => t.id === e.id))) {
    const card = page.getByRole('link', { name: startsWith(e.name) });
    await expect(card, e.id).toHaveAttribute('href', e.href);
    await expect(card).toContainText('舊版');
  }
  for (const e of EXTERNAL) {
    const card = page.getByRole('link', { name: startsWith(e.name) });
    await expect(card).toHaveAttribute('href', e.href);
    await expect(card).toHaveAttribute('target', '_blank');
    await expect(card).toContainText('其他網站');
  }

  /* 站內的連結都要指得到（其他網站不連） */
  for (const e of entries.filter((e) => e.kind !== 'external')) {
    const res = await request.get(new URL(e.href, 'http://x/').pathname);
    expect(res.status(), e.href).toBe(200);
  }
});

test('依群組分段，分類連結跳到該段', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '工具分類' });
  await expect(nav.getByRole('link', { name: /^文字演出/ })).toBeVisible();
  await expect(nav.getByRole('link', { name: /^其他網站/ })).toBeVisible();
  await expect(nav.getByRole('link', { name: /^開發用/ })).toHaveCount(0);

  const g3 = page.getByRole('region', { name: /^立繪工作台/ });
  for (const t of live.filter((t) => t.group === 'G3')) {
    await expect(g3.getByRole('link', { name: startsWith(t.name) })).toBeVisible();
  }
  await nav.getByRole('link', { name: /^CCFOLIA 資料/ }).click();
  await expect(page).toHaveURL(/#group-G5$/);
  await expect(page.getByRole('heading', { level: 2, name: /^CCFOLIA 資料/ })).toBeInViewport();
});

test('搜尋：名稱、說明或分類符合每個詞的才列出，沒有結果時說明；清空後全部回來', async ({
  page,
}) => {
  await page.goto('/');
  const names = () =>
    page.getByRole('main').getByRole('region').getByRole('heading', { level: 3 }).allTextContents();
  const expected = (q: string) => entries.filter((e) => matchEntry(e, q)).map((e) => e.name);
  const status = page.getByRole('status');

  await search(page).fill('立繪');
  const portrait = expected('立繪');
  expect(portrait.length).toBeGreaterThan(3);
  expect(portrait.length).toBeLessThan(entries.length);
  await expect(status).toHaveText(`找到 ${portrait.length} 個工具`);
  expect((await names()).sort()).toEqual([...portrait].sort());
  /* 分類名稱也算：立繪工作台的工具全部列出（例如說明沒有「立繪」兩字的角色差分管理器） */
  for (const t of live.filter((t) => t.group === 'G3')) expect(await names()).toContain(t.name);

  await search(page).fill('立繪 ＯＢＳ');
  const both = expected('立繪 obs');
  expect(both.length).toBeGreaterThan(0);
  expect((await names()).sort()).toEqual([...both].sort());
  await expect(page.getByRole('region', { name: /^OBS 疊加/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /^文字演出/ })).toHaveCount(0);

  await search(page).fill('沒有這種工具');
  await expect(status).toHaveText('沒有符合「沒有這種工具」的工具');
  await expect(cards(page)).toHaveCount(0);

  await search(page).fill('');
  await expect(cards(page)).toHaveCount(entries.length);
});

test('頁尾只列靈感來源，每個已上線工具的出處都在', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('heading', { name: '靈感來源' })).toBeVisible();
  for (const t of live) {
    if (!t.inspiration) continue;
    const item = t.inspiration.url
      ? footer.getByRole('link', { name: t.inspiration.name, exact: true })
      : footer.getByText(t.inspiration.name, { exact: true });
    await expect(item.first(), t.id).toBeVisible();
    if (t.inspiration.url) await expect(item.first()).toHaveAttribute('href', t.inspiration.url);
  }
});

test('從首頁進工具頁、再用頁首的「TRPG Toolkit」回到首頁；深淺色兩邊共用', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '切換成淺色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const tool = getTool('textbox');
  if (!tool) throw new Error('textbox 不在 registry');
  await page.getByRole('link', { name: new RegExp(`^${tool.name}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/${outputDir(tool)}/$`));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('link', { name: 'TRPG Toolkit' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'TRPG Toolkit' })).toBeVisible();
  await expect(page.getByRole('button', { name: '切換成深色' })).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`視覺基準 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(cards(page).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    /* 分類列的數字會隨工具上線改變，不列入比對 */
    await expect(page).toHaveScreenshot(`home-${width}.png`, {
      mask: [
        page.getByRole('navigation', { name: '工具分類' }),
        page.getByText(/^跑團用的網頁小工具/),
      ],
    });
  });
}
