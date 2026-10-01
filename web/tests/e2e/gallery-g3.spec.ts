/**
 * 元件展示頁「立繪工作台」分頁（G3 共用層）的端對端測試：
 * - 分頁與三個預覽（頭像版面、身高板、裁切框）都沒有 console error；
 * - 版面編輯層：點選、拖曳（參考線與距離標籤）、控點改大小、方向鍵微調、Delete 取消選取、Esc 隱藏參考線；
 * - PanZoomViewport：滾輪以游標為中心縮放（游標下的點不動）、Shift＋滾輪橫向、拖曳角色、空白處拖曳平移；
 * - 裁切框：只能水平拖曳、夾在圖內；舞台不按 Ctrl 的滾輪縮放與拖曳平移；
 * - 縮圖清單的 ↑↓ 選取與拖曳排序、建議詞、三選一；
 * - 390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

async function openG3(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto('/next/_gallery/');
  await page.getByRole('tab', { name: '立繪工作台' }).click();
  await expect(page.getByRole('tab', { name: '立繪工作台' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  return errors;
}

const view = (page: Page, name: string) =>
  page
    .getByRole('radiogroup', { name: '立繪工作台預覽' })
    .getByRole('radio', { name, exact: true })
    .click();

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`找不到 ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

const summary = (page: Page) => page.getByTestId('layout-summary');

test.describe('元件展示頁：立繪工作台', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('三個預覽切換都沒有錯誤', async ({ page }) => {
    const errors = await openG3(page);
    await expect(page.getByTestId('layout-editor')).toBeVisible();
    await view(page, '身高板');
    await expect(page.getByTestId('pan-zoom-viewport')).toBeVisible();
    await view(page, '裁切框');
    await expect(page.getByTestId('crop-frame')).toBeVisible();
    await view(page, '頭像版面');
    expect(errors).toEqual([]);
  });

  test('版面編輯層：拖曳、參考線、控點、方向鍵、Delete、Esc', async ({ page }) => {
    const errors = await openG3(page);
    await expect(summary(page)).toContainText('選取：名字牌｜左上 (78.0%, 8.0%)・11.0 × 48.0');
    /* 拖曳 HO 牌：按下即選取、參考線出現、放開消失 */
    const ho = await center(page, '[data-layout-item="ho"]');
    await page.mouse.move(ho.x, ho.y);
    await page.mouse.down();
    await page.mouse.move(ho.x + 30, ho.y - 20, { steps: 4 });
    await expect(page.getByTestId('layout-guides')).toBeVisible();
    await expect(page.getByTestId('layout-distance-x')).toContainText(/左 \d+%｜右 \d+%/);
    await expect(page.getByTestId('layout-distance-y')).toContainText(/上 \d+%｜下 \d+%/);
    await page.mouse.up();
    await expect(page.getByTestId('layout-guides')).toHaveCount(0);
    const moved = await summary(page).textContent();
    expect(moved).toContain('選取：HO 牌');
    const m = /左上 \(([\d.-]+)%, ([\d.-]+)%\)/.exec(moved ?? '');
    expect(Number(m?.[1])).toBeGreaterThan(7.5);
    expect(Number(m?.[2])).toBeLessThan(84);
    /* 方向鍵 0.2%、Shift 2% */
    const x0 = Number(m?.[1]);
    await page.keyboard.press('ArrowRight');
    await expect(summary(page)).toContainText(`左上 (${(x0 + 0.2).toFixed(1)}%`);
    await page.keyboard.press('Shift+ArrowRight');
    await expect(summary(page)).toContainText(`左上 (${(x0 + 2.2).toFixed(1)}%`);
    /* 右下角控點改大小 */
    const handle = await center(page, '[data-layout-handle="se"]');
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 40, handle.y + 20, { steps: 4 });
    await page.mouse.up();
    const resized = /・([\d.]+) × ([\d.]+)/.exec((await summary(page).textContent()) ?? '');
    expect(Number(resized?.[1])).toBeGreaterThan(20);
    /* 復原：拖曳一次算一步 */
    await page.getByRole('button', { name: '復原（立繪工作台）' }).click();
    await expect(summary(page)).toContainText('・20.0 × 9.0');
    /* Delete 取消選取，之後方向鍵不作用 */
    await page.locator('[data-layout-item="ho"]').focus();
    await page.keyboard.press('Delete');
    await expect(summary(page)).toContainText('沒有選取物件');
    await expect(page.locator('[data-layout-item="ho"]')).toHaveAttribute('aria-pressed', 'false');
    /* 拖曳中按 Esc 隱藏參考線 */
    const name = await center(page, '[data-layout-item="name"]');
    await page.mouse.move(name.x, name.y);
    await page.mouse.down();
    await page.mouse.move(name.x - 10, name.y, { steps: 2 });
    await expect(page.getByTestId('layout-guides')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('layout-guides')).toHaveCount(0);
    await page.mouse.up();
    /* 文字欄有焦點時方向鍵不移動物件 */
    const before = await summary(page).textContent();
    await page.getByRole('textbox', { name: '主名稱' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(summary(page)).toHaveText(before ?? '');
    expect(errors).toEqual([]);
  });

  test('PanZoomViewport：滾輪以游標為中心縮放、Shift＋滾輪橫捲、拖曳角色、平移', async ({
    page,
  }) => {
    const errors = await openG3(page);
    await view(page, '身高板');
    const vp = page.getByTestId('pan-zoom-viewport');
    await expect(vp).toHaveAttribute('data-zoom', '100');
    const box = (await vp.boundingBox())!;
    const at = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 };
    await page.mouse.move(at.x, at.y);
    const read = async () => {
      const t = (await page.getByTestId('board-pointer').textContent()) ?? '';
      const m = /游標：([\d.-]+) cm、高 ([\d.-]+) cm/.exec(t);
      return [Number(m?.[1]), Number(m?.[2])];
    };
    const [wx, wy] = await read();
    await page.mouse.wheel(0, -100);
    await expect(vp).toHaveAttribute('data-zoom', '116');
    await page.mouse.move(at.x + 1, at.y);
    await page.mouse.move(at.x, at.y);
    const [wx2, wy2] = await read();
    expect(Math.abs(wx2 - wx)).toBeLessThan(1);
    expect(Math.abs(wy2 - wy)).toBeLessThan(1);
    /* 放大到內容比畫面寬 → Shift＋滾輪橫向捲動 */
    await page.mouse.wheel(0, -300);
    const scroller = vp.locator('section');
    const left0 = await scroller.evaluate((el) => el.scrollLeft);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Shift');
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(left0);
    /* 倍率按鈕回到 100%；ctrl＋滾輪不攔截 */
    await page.getByTestId('board-zoom').click();
    await expect(vp).toHaveAttribute('data-zoom', '100');
    /* 點角色選取並拖曳 */
    const rows = page.getByRole('list', { name: '角色清單' });
    const first = rows.locator('li').filter({ hasText: '艾莉絲' });
    await expect(first).toContainText('x 5.0 cm');
    /* 艾莉絲在最左邊：從清單點選後，在盤面上找她的位置拖曳 */
    await first.click();
    await expect(first).toHaveAttribute('aria-current', 'true');
    const canvas = vp.locator('canvas').last();
    const cb = (await canvas.boundingBox())!;
    /* 掃描找到角色（游標變成 move） */
    let hit: { x: number; y: number } | null = null;
    for (let dx = 10; dx < 200 && !hit; dx += 6) {
      const p = { x: cb.x + dx, y: cb.y + cb.height * 0.7 };
      await page.mouse.move(p.x, p.y);
      if ((await canvas.evaluate((el) => (el as HTMLCanvasElement).style.cursor)) === 'move')
        hit = p;
    }
    expect(hit).not.toBeNull();
    await expect(page.getByTestId('viewport-tooltip')).toContainText('cm');
    await page.mouse.down();
    await page.mouse.move(hit!.x + 60, hit!.y, { steps: 5 });
    await page.mouse.up();
    await expect(first).not.toContainText('x 5.0 cm');
    /* 方向鍵移動 1 px */
    const text = (await first.textContent()) ?? '';
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowRight');
    await expect(first).not.toHaveText(text);
    /* 空白處拖曳平移（放大後才能捲） */
    await page.getByRole('button', { name: '放大' }).first().click();
    await page.getByRole('button', { name: '放大' }).first().click();
    const sl = await scroller.evaluate((el) => el.scrollLeft);
    await page.mouse.move(cb.x + cb.width - 20, cb.y + 20);
    await page.mouse.down();
    await page.mouse.move(cb.x + cb.width - 140, cb.y + 20, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(sl);
    expect(errors).toEqual([]);
  });

  test('裁切框：只能水平拖曳、夾在圖內；舞台滾輪縮放與拖曳平移', async ({ page }) => {
    const errors = await openG3(page);
    await view(page, '裁切框');
    const info = page.getByTestId('crop-info');
    const text0 = (await info.textContent()) ?? '';
    const [, , y0] = /左上 \((\d+), (\d+)\)/.exec(text0) ?? [];
    const f = await center(page, '[data-testid="crop-frame"]');
    await page.mouse.move(f.x, f.y);
    await page.mouse.down();
    await page.mouse.move(f.x - 2000, f.y + 300, { steps: 6 });
    await page.mouse.up();
    await expect(info).toContainText(`左上 (0, ${y0})`);
    /* 方向鍵 */
    await page.getByRole('slider', { name: '裁切框' }).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(info).toContainText(`左上 (10, ${y0})`);
    /* 舞台：不按 Ctrl 的滾輪縮放（以符合畫面為 100%） */
    const stage = page.getByRole('region', { name: '裁切框預覽' });
    await expect(stage).toHaveAttribute('data-zoom', '100');
    const sb = (await stage.boundingBox())!;
    await page.mouse.move(sb.x + 20, sb.y + 20);
    await page.mouse.wheel(0, -100);
    await expect(stage).toHaveAttribute('data-zoom', '110');
    await page.mouse.wheel(0, 100);
    await expect(stage).toHaveAttribute('data-zoom', '99');
    /* 在空白處拖曳平移 */
    const content = stage.locator(':scope > div').first();
    const c0 = (await content.boundingBox())!;
    await page.mouse.move(sb.x + 10, sb.y + 10);
    await page.mouse.down();
    await page.mouse.move(sb.x + 60, sb.y + 40, { steps: 3 });
    await page.mouse.up();
    const c1 = (await content.boundingBox())!;
    expect(Math.round(c1.x - c0.x)).toBe(50);
    await page.getByRole('button', { name: '歸位' }).click();
    await expect(stage).toHaveAttribute('data-zoom', '100');
    expect(errors).toEqual([]);
  });

  test('縮圖清單（↑↓、拖曳排序、建議詞）與三選一', async ({ page }) => {
    const errors = await openG3(page);
    const list = page.getByRole('list', { name: '差分清單' });
    const items = list.locator(':scope > li');
    await expect(items.nth(0)).toHaveAttribute('aria-current', 'true');
    await items.nth(0).click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'true');
    await page
      .getByRole('group', { name: '差分名建議' })
      .getByRole('button', { name: '害羞' })
      .click();
    await expect(page.getByRole('textbox', { name: '第 2 張的差分名' })).toHaveValue('害羞');
    await expect(page.getByTestId('variant-output').nth(1)).toHaveText('character02_害羞.png');
    /* 同名檔：第 3、4 張都是 生氣，ZIP 內自動加序號（編號關閉時） */
    await page.getByRole('switch', { name: '加上編號' }).click();
    await expect(page.getByTestId('zip-names')).toContainText('character_生氣.webp');
    await expect(page.getByTestId('zip-names')).toContainText('character_生氣.png');
    /* 拖曳第 1 列到第 3 列 */
    const a = (await items.nth(0).boundingBox())!;
    const c = (await items.nth(2).boundingBox())!;
    await page.mouse.move(a.x + 30, a.y + 30);
    await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y + c.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(items.nth(2)).toContainText('艾莉絲_smile.png');
    await expect(items.nth(2)).toHaveAttribute('aria-current', 'true');
    /* 三選一：取消、加入 */
    await page.getByRole('button', { name: '三選一示範' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
    await expect(page.getByTestId('choice-answer')).toHaveText('上次的選擇：取消');
    await page.getByRole('button', { name: '三選一示範' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取代' }).click();
    await expect(page.getByTestId('choice-answer')).toHaveText('上次的選擇：replace');
    expect(errors).toEqual([]);
  });

  test('取色視窗與合輯圖', async ({ page }) => {
    const errors = await openG3(page);
    await page.getByRole('button', { name: '開啟取色視窗' }).click();
    const dialog = page.getByRole('dialog', { name: '從圖片取色' });
    await expect(dialog.getByRole('slider', { name: '分割線 1' })).toBeVisible();
    await dialog.getByRole('button', { name: '套用' }).click();
    await expect(page.getByTestId('sampler-result')).toContainText('#e03030');
    await expect(page.getByTestId('sampler-result')).toContainText('#30c030');
    await expect(page.getByTestId('sampler-result')).toContainText('#3050e0');
    await page.getByRole('button', { name: '產生合輯圖' }).click();
    await expect(page.getByTestId('sheet-info')).toContainText('表情 2 個 · 2×1');
    expect(errors).toEqual([]);
  });
});

test('ProjectMenu：存成 ZIP（project.json＋files/）、開啟前先確認、讀回', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = await openG3(page);
  const menu = page.getByTestId('g3-project-menu');
  await menu.getByRole('button', { name: '專案' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^g3-demo_\d{8}-\d{4}\.zip$/);
  const path = await download.path();
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  expect(Object.keys(files).sort()).toEqual(['files/face.png', 'project.json']);
  expect(Array.from(files['files/face.png'].slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  const json = JSON.parse(strFromU8(files['project.json']));
  expect(json).toMatchObject({ format: 'trpg-toolkit-project', tool: '_gallery-g3', version: 1 });
  expect(json.data.expressions).toHaveLength(3);
  /* 刪掉一筆，再開啟專案檔還原：清單不是空的時先確認（在選檔之前） */
  await page.getByRole('button', { name: '刪除「開心」' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(page.getByRole('heading', { name: /表情清單/ })).toContainText('（2）');
  await menu.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('無法復原');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '選擇檔案' }).click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('choice-answer')).toHaveText(
    '上次的選擇：開啟專案檔（附帶 1 個檔案）',
  );
  await expect(page.getByRole('heading', { name: /表情清單/ })).toContainText('（3）');
  expect(errors).toEqual([]);
});

test('立繪工作台：390 寬沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openG3(page);
  for (const name of ['頭像版面', '身高板', '裁切框']) {
    await view(page, name);
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});
