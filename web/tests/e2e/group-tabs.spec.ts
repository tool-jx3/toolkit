/**
 * 群組分頁（共用 GroupTabs）的端對端測試：
 * - 放不下時整列橫向捲動、開頁時目前的分頁捲進可見範圍；
 * - 還有分頁藏在某一端外時那一端淡出（data-fade-left／right＋mask-image），捲到底的那一端不淡出；放得下時不淡出。
 * 用 G3 立繪工作台（7 個工具）：390 寬放不下，1280 寬放得下。
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir, toolsInGroup } from '../../src/registry';

const url = (id: string) => `/${outputDir(getTool(id) ?? { id, status: 'next' })}/`;
const G3 = toolsInGroup('G3');
const FIRST = G3[0]?.id ?? '';
const LAST = G3[G3.length - 1]?.id ?? '';

function tabs(page: Page): Locator {
  return page.getByRole('navigation', { name: '立繪工作台工具' });
}

async function scrollState(nav: Locator) {
  return nav.evaluate((el) => ({
    left: el.scrollLeft,
    max: el.scrollWidth - el.clientWidth,
    mask:
      getComputedStyle(el).maskImage || getComputedStyle(el).getPropertyValue('-webkit-mask-image'),
  }));
}

test.describe('390 寬（放不下）', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('第一個工具：捲在最左，只有右端淡出；捲到最右後只有左端淡出', async ({ page }) => {
    await page.goto(url(FIRST));
    const nav = tabs(page);
    await expect(nav).toBeVisible();
    const s = await scrollState(nav);
    expect(s.max).toBeGreaterThan(0);
    expect(s.left).toBe(0);
    await expect(nav).toHaveAttribute('data-fade-right', 'true');
    await expect(nav).not.toHaveAttribute('data-fade-left', /.*/);
    expect(s.mask).toContain('linear-gradient');

    await nav.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(nav).toHaveAttribute('data-fade-left', 'true');
    await expect(nav).not.toHaveAttribute('data-fade-right', /.*/);
  });

  test('最後一個工具：開頁時目前的分頁捲進可見範圍，只有左端淡出', async ({ page }) => {
    await page.goto(url(LAST));
    const nav = tabs(page);
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toBeInViewport();
    await expect(nav).toHaveAttribute('data-fade-left', 'true');
    await expect(nav).not.toHaveAttribute('data-fade-right', /.*/);
  });

  test('捲到中間時兩端都淡出', async ({ page }) => {
    await page.goto(url(FIRST));
    const nav = tabs(page);
    await nav.evaluate((el) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
    await expect(nav).toHaveAttribute('data-fade-left', 'true');
    await expect(nav).toHaveAttribute('data-fade-right', 'true');
  });
});

test.describe('1280 寬（放得下）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('不捲動、不淡出', async ({ page }) => {
    await page.goto(url(FIRST));
    const nav = tabs(page);
    await expect(nav).toBeVisible();
    const s = await scrollState(nav);
    expect(s.max).toBeLessThanOrEqual(0);
    await expect(nav).not.toHaveAttribute('data-fade-left', /.*/);
    await expect(nav).not.toHaveAttribute('data-fade-right', /.*/);
    expect(s.mask === 'none' || s.mask === '').toBe(true);
  });
});
