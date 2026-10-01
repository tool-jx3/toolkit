/**
 * 元件展示頁「OBS 疊加」分頁（G4 共用層）的端對端測試：
 * - 四個模擬頁（角色狀態頁、房間訊息框、聊天另開視窗、Streamkit）切換都沒有錯誤，DOM 結構正確；
 * - CssPreviewFrame：以來源原尺寸排版、等比縮放（倍率公式）、量測來源內容尺寸、套用前、模擬滑鼠移入；
 * - 動畫：危急時發光，?pause=毫秒 讓動畫停在指定時間；
 * - 390 寬沒有橫向捲動。
 */
import { expect, type Page, test } from '@playwright/test';

async function openObs(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(`/next/_gallery/${query}`);
  await page.getByRole('tab', { name: 'OBS 疊加' }).click();
  await expect(page.getByRole('tab', { name: 'OBS 疊加' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  return errors;
}

const scene = (page: Page, name: string) =>
  page
    .getByRole('radiogroup', { name: '模擬頁' })
    .getByRole('radio', { name, exact: true })
    .click();

const frame = (page: Page) => page.frameLocator('iframe[title="OBS 預覽"]');

/** 預覽區的倍率與尺寸 */
async function previewMetrics(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('[data-testid="css-preview-area"]') as HTMLElement;
    const src = document.querySelector('[data-testid="css-preview-source"]') as HTMLElement;
    const iframe = src.querySelector('iframe') as HTMLIFrameElement;
    const doc = iframe.contentDocument!;
    return {
      areaWidth: area.clientWidth,
      scale: Number(src.dataset.scale),
      boxWidth: src.getBoundingClientRect().width,
      boxHeight: src.getBoundingClientRect().height,
      viewport: [doc.documentElement.clientWidth, doc.defaultView!.innerHeight],
    };
  });
}

test.describe('元件展示頁：OBS 疊加', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('四個模擬頁切換都沒有錯誤，結構符合外部事實', async ({ page }) => {
    const errors = await openObs(page);
    const f = frame(page);
    await expect(f.locator('div[variant="bar"] > div')).toHaveCount(3);
    await expect(f.locator('.MuiBadge-badge')).toHaveText('12');

    await scene(page, '訊息框');
    const box = f.locator('.MuiPaper-root[role="status"][aria-label="メッセージ"]');
    await expect(box).toBeVisible();
    await expect(box.locator('> .MuiPaper-root > div:last-child > p')).toContainText(
      '門後好像有聲音',
      {
        timeout: 10_000,
      },
    );
    /* 房間的替身（上方列、盤面、聊天欄）看不見 */
    await expect(f.locator('header.MuiAppBar-root')).toBeHidden();

    await scene(page, '聊天');
    await expect(f.locator('ul[role="log"] div[data-index]:visible')).toHaveCount(3);
    await page.getByRole('button', { name: '成功', exact: true }).click();
    await expect(f.locator('ul[role="log"] div[data-index]:visible').last()).toContainText('閃避');

    await scene(page, 'Streamkit');
    await expect(f.locator('li[class*="Voice_voiceState__"]')).toHaveCount(3);
    await expect(f.locator('img[class*="Voice_avatar__"]').first()).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('CssPreviewFrame：原尺寸排版、等比縮放、量測來源內容、套用前', async ({ page }) => {
    const errors = await openObs(page);
    /* 狀態頁：#root 縮成剛好包住內容（318 × 90）＋外距 10 → 來源 338 × 110 */
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 338 × 高 110');
    let m = await previewMetrics(page);
    expect(m.scale).toBeCloseTo(Math.min(2, (m.areaWidth - 32) / 338, 560 / 110), 5);
    expect(m.boxWidth).toBeCloseTo(338 * m.scale, 0);
    expect(m.boxHeight).toBeCloseTo(110 * m.scale, 0);
    expect(m.viewport).toEqual([338, 110]);
    const bg = () =>
      page.evaluate(() => {
        const doc = (document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement)
          .contentDocument!;
        return doc.defaultView!.getComputedStyle(doc.body).backgroundColor;
      });
    expect(await bg()).toBe('rgba(0, 0, 0, 0)');
    /* 工具的 CSS 在前、CCFOLIA（模擬頁）的樣式在後 */
    const order = await page.evaluate(() =>
      [
        ...(
          document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement
        ).contentDocument!.head.querySelectorAll('style'),
      ].map((s) => s.id || s.dataset.mock),
    );
    expect(order).toEqual(['tk-user-css', 'ccfolia-character']);
    await page.getByRole('button', { name: '查看套用前的樣子' }).click();
    expect(await bg()).toBe('rgb(255, 255, 255)');
    await expect(page.getByTestId('css-preview-area')).toContainText('套用前');
    await page.getByRole('button', { name: '顯示套用後' }).click();
    expect(await bg()).toBe('rgba(0, 0, 0, 0)');

    /* 訊息框：1280 × 720，不放大 */
    await scene(page, '訊息框');
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 1280 × 高 720');
    m = await previewMetrics(page);
    expect(m.scale).toBeCloseTo(Math.min(1, (m.areaWidth - 32) / 1280, 560 / 720), 5);
    expect(m.viewport).toEqual([1280, 720]);
    expect(errors).toEqual([]);
  });

  test('模擬滑鼠移入：「滑鼠移上才顯示」的按鈕會出現', async ({ page }) => {
    const errors = await openObs(page);
    await scene(page, '訊息框');
    const buttons = frame(page).locator('.MuiPaper-root[role="status"] .MuiToolbar-root > button');
    await expect(buttons.first()).toBeHidden();
    await page.getByRole('button', { name: '模擬滑鼠移到畫面上（OBS 的「互動」視窗）' }).click();
    await expect(buttons).toHaveCount(2);
    await expect(buttons.first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('動畫：危急時發光；?pause= 讓動畫停在指定毫秒', async ({ page }) => {
    const errors = await openObs(page, '?pause=550');
    await page.getByRole('button', { name: '危急' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const doc = (document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement)
            .contentDocument!;
          return doc
            .getAnimations()
            .filter((a) => (a as CSSAnimation).animationName === 'tk-demo-pulse')
            .map((a) => [a.playState, Math.round(Number(a.currentTime))]);
        }),
      )
      .toEqual([
        ['paused', 550],
        ['paused', 550],
        ['paused', 550],
      ]);
    /* 回復數值：發光結束 */
    await page.getByRole('button', { name: '全部回復' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement)
              .contentDocument!.getAnimations()
              .filter((a) => (a as CSSAnimation).animationName === 'tk-demo-pulse').length,
        ),
      )
      .toBe(0);
    expect(errors).toEqual([]);
  });

  test('改設定時重播動畫；數值回復後動畫結束', async ({ page }) => {
    const errors = await openObs(page);
    const pulses = () =>
      page.evaluate(() =>
        (document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement)
          .contentDocument!.getAnimations()
          .filter((a) => (a as CSSAnimation).animationName === 'tk-demo-pulse')
          .map((a) => Number(a.currentTime)),
      );
    await page.getByRole('button', { name: '危急' }).click();
    await expect.poll(async () => (await pulses()).length).toBe(3);
    await page.waitForTimeout(700);
    expect(Math.min(...(await pulses()))).toBeGreaterThan(500);
    /* 改字型外框線 → CSS 改變 → 動畫從頭播放 */
    await page.getByRole('radio', { name: '描邊', exact: true }).click();
    const after = await pulses();
    expect(after).toHaveLength(3);
    expect(Math.max(...after)).toBeLessThan(300);
    await page.getByRole('button', { name: '全部回復' }).click();
    await expect.poll(async () => (await pulses()).length).toBe(0);
    expect(errors).toEqual([]);
  });

  test('復原手勢：滑桿拖完才記一步', async ({ page }) => {
    const errors = await openObs(page);
    const steps = page.getByTestId('obs-undo-steps');
    await expect(steps).toHaveText('可復原 0 步');
    const slider = page.getByRole('slider', { name: '危急門檻' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(steps).toHaveText('可復原 2 步');
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++)
      await page.mouse.move(box.x + box.width / 2 + i * 15, box.y + box.height / 2);
    await page.mouse.up();
    await expect(steps).toHaveText('可復原 3 步');
    expect(errors).toEqual([]);
  });
});

test.describe('元件展示頁：OBS 疊加（390 寬）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('四個模擬頁都沒有橫向捲動', async ({ page }) => {
    const errors = await openObs(page);
    for (const name of ['狀態頁', '訊息框', '聊天', 'Streamkit']) {
      await scene(page, name);
      await page.waitForTimeout(200);
      const [sw, cw] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      expect(sw, `${name}：不應出現橫向捲動`).toBeLessThanOrEqual(cw);
      const m = await previewMetrics(page);
      expect(m.boxWidth).toBeLessThanOrEqual(m.areaWidth);
    }
    expect(errors).toEqual([]);
  });
});
