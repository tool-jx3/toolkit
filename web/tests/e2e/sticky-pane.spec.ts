/**
 * 寬畫面的固定欄（共用的 `sticky-pane`，tokens.css 的 --sticky-top／--sticky-bottom）：捲到頁尾時，
 * 預覽欄、輸出欄的頂端仍在頁首下方，不會被往上推到頁首底下（coc-npc 對等驗證 F34）。
 * 原本的 top-16＋max-h-[calc(100dvh-5rem)] 比頁尾留給它的空間高，下面這些頁面在這個大小都會被推上去約 43 px。
 */
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const url = (id: string) => `/${outputDir(getTool(id) ?? { id, status: 'next' })}/`;

const CASES: { id: string; width: number; height: number; note: string }[] = [
  { id: 'text-fx', width: 1280, height: 900, note: 'ToolShell 的預覽欄' },
  { id: 'emotion-maker', width: 1024, height: 768, note: '編輯與清單欄' },
  { id: 'session-report', width: 1280, height: 720, note: '預覽欄（下面還有免責聲明）' },
  { id: 'coc-npc', width: 1280, height: 900, note: '清單欄與輸出欄' },
];

async function stickyTops(page: Page) {
  return page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 250));
    const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const panes = [...document.querySelectorAll<HTMLElement>('main *')].filter(
      (el) => getComputedStyle(el).position === 'sticky' && el.getBoundingClientRect().height > 80,
    );
    return {
      header,
      scrolled: window.scrollY > 0,
      tops: panes.map((el) => el.getBoundingClientRect().top),
    };
  });
}

for (const c of CASES) {
  test(`${c.id}（${c.note}）：${c.width}×${c.height} 捲到頁尾，固定欄的頂端在頁首下方`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await page.goto(url(c.id));
    await expect(page.locator('header').first()).toBeVisible();
    await page.waitForTimeout(500);
    const r = await stickyTops(page);
    expect(r.scrolled, '頁面要能捲動').toBe(true);
    expect(r.tops.length, '要有固定欄').toBeGreaterThan(0);
    for (const top of r.tops) expect(top).toBeGreaterThanOrEqual(r.header - 0.5);
  });
}
