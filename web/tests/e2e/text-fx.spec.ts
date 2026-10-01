/**
 * 文字演出產生器（建置產物 next/text-fx/）的端對端測試：
 * - 開頁沒有 pageerror／console error；
 * - 套用範本、改文字即時更新預覽、切換模式、效果一覽、快捷鍵、復原；
 * - 五種格式（APNG、GIF、WebP、PNG、連番 PNG）都能匯出並被瀏覽器解碼；
 * - 390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('text-fx') ?? { id: 'text-fx', status: 'next' })}/`;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '文字演出產生器' })).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __textFx?: unknown }).__textFx);
  return errors;
}

/** 預覽畫布的雜湊（確認畫面有變） */
const canvasHash = (page: Page) =>
  page.getByTestId('tfx-canvas').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    const u = new Uint32Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer);
    let h = 2166136261;
    for (let i = 0; i < u.length; i += 7) h = Math.imul(h ^ u[i], 16777619);
    return h >>> 0;
  });

const hook = <T>(page: Page, fn: string) =>
  page.evaluate((f) => {
    // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
    const t = (window as any).__textFx;
    return new Function('t', `return (${f})(t)`)(t);
  }, fn) as Promise<T>;

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('文字演出產生器', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁、套用範本、改文字、切換模式、效果一覽、快捷鍵、復原都沒有錯誤', async ({ page }) => {
    const errors = await open(page);
    /* 減少動態效果：不自動播放；第一格是空的，所以停在完成狀態（代表畫面） */
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
    await expect
      .poll(() => hook<number>(page, '(t) => Math.abs(t.t - t.scene.repTime)'))
      .toBeLessThan(1e-6);
    expect(await hook<string>(page, '(t) => t.app.tplId()')).toBe('battle-start');
    await expect(page.getByTestId('meta-line')).toContainText('戰鬥開始');
    const h0 = await canvasHash(page);

    /* 套用範本（分類 → 卡片） */
    await page.getByRole('radio', { name: 'CoC 7 版' }).click();
    await page.getByRole('button', { name: /^大成功/ }).click();
    expect(await hook<string>(page, '(t) => t.app.tplId()')).toBe('coc7-critical');
    await expect(page.getByTestId('meta-line')).toContainText('大成功');

    /* 改文字：預覽立即更新 */
    await page.getByRole('tab', { name: '文字' }).click();
    const text = page.getByRole('textbox', { name: '主文字' });
    await text.fill('奇蹟');
    await expect.poll(() => hook<string>(page, '(t) => t.app.cfg().text')).toBe('奇蹟');
    await hook(page, '(t) => t.seek(t.scene.repTime)');
    await expect.poll(() => canvasHash(page)).not.toBe(h0);
    const h1 = await canvasHash(page);
    await text.fill('奇蹟發生');
    await hook(page, '(t) => t.seek(t.scene.repTime)');
    await expect.poll(() => canvasHash(page)).not.toBe(h1);

    /* 快捷鍵：2 切到長文、3 切到字幕、1 回標語；? 開說明 */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('2');
    expect(await hook<string>(page, '(t) => t.app.mode()')).toBe('long');
    await page.keyboard.press('3');
    expect(await hook<string>(page, '(t) => t.app.mode()')).toBe('caption');
    await page.keyboard.press('1');
    expect(await hook<string>(page, '(t) => t.app.mode()')).toBe('title');
    /* 模式各自保留設定：剛才改的文字還在 */
    expect(await hook<string>(page, '(t) => t.app.cfg().text')).toBe('奇蹟發生');
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog', { name: '快捷鍵' })).toBeVisible();
    await page.keyboard.press('Escape');

    /* 切換模式會從頭播放；先暫停，再用空白鍵播放、→ 往後一格並暫停 */
    await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    await hook(page, '(t) => t.setPlaying(false)');
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();

    /* 效果一覽：點一下就套用 */
    await page.getByRole('tab', { name: '模式' }).click();
    await page.getByRole('button', { name: '效果一覽' }).first().click();
    const dlg = page.getByRole('dialog', { name: '登場效果一覽' });
    await expect(dlg).toBeVisible();
    await dlg.locator('[data-effect="glitch"]').click();
    await expect(dlg).toBeHidden();
    expect(await hook<string>(page, '(t) => t.app.cfg().intro.fx')).toBe('glitch');

    /* 復原：回到上一個效果 */
    await page.waitForTimeout(450);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect.poll(() => hook<string>(page, '(t) => t.app.cfg().intro.fx')).toBe('impact');

    /* 每個分頁都打得開 */
    for (const tab of ['文字', '樣式', '裝飾', '時間與尺寸', '模式']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }
    expect(errors).toEqual([]);
  });

  test('長文與字幕：範本、提示與自動縮小', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: /^長文/ }).click();
    expect(await hook<string>(page, '(t) => t.app.mode()')).toBe('long');
    await page.getByRole('radio', { name: '片尾' }).click();
    await page.getByRole('button', { name: /片尾名單/ }).click();
    await expect(page.getByTestId('meta-line')).toContainText('片尾名單');
    /* 停留效果提示、呼吸發光需要光暈（附按鈕） */
    await hook(page, "(t) => t.app.set('hold.fx', 'breathe')");
    await expect(page.getByText('「呼吸發光」需要先開啟光暈。')).toBeVisible();
    await page.getByRole('button', { name: '開啟光暈' }).click();
    expect(await hook<boolean>(page, '(t) => t.app.cfg().glow.on')).toBe(true);
    await expect(page.getByText('已選停留效果：每一格畫面都不同，檔案會變大。')).toHaveCount(0);
    /* 捲動很慢 → 影格數超過上限 */
    await hook(page, "(t) => t.app.set('flow.speed', 10)");
    await expect(page.getByText(/影格數 \d+ 超過上限 1800/)).toBeVisible();
    /* 自動縮小提示、停留效果提示 */
    await page.getByRole('radio', { name: /^標語/ }).click();
    await hook(page, "(t) => t.app.set('size', 400)");
    await expect(page.getByText(/文字放不下，已自動縮小：400 px → \d+ px/)).toBeVisible();
    await hook(page, "(t) => t.app.set('hold.fx', 'wave')");
    await expect(page.getByText('已選停留效果：每一格畫面都不同，檔案會變大。')).toBeVisible();
    /* 退場關閉＋無限循環（附「改成播放一次」） */
    await hook(page, "(t) => { t.app.set('outroOn', false); t.app.set('loop', 'infinite'); }");
    await page.getByRole('button', { name: '改成播放一次' }).click();
    expect(await hook<string>(page, '(t) => t.app.cfg().loop')).toBe('once');
    /* 沒有文字：提示，且不能匯出 */
    await hook(page, "(t) => { t.app.set('text', ''); t.app.set('sub', ''); }");
    await expect(page.getByText('還沒有文字：請在「文字」分頁輸入內容。')).toBeVisible();
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '請先輸入文字，再匯出。' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('效果一覽（五種）、快捷鍵、自動存檔與預覽設定記憶、說明', async ({ page }) => {
    const errors = await open(page);
    /* 登場、停留、退場 */
    const galleries: [number, string, number][] = [
      [0, '登場效果一覽', 25],
      [1, '停留中效果一覽', 9],
      [2, '退場效果一覽', 18],
    ];
    for (const [i, title, n] of galleries) {
      await page.getByRole('button', { name: '效果一覽' }).nth(i).click();
      const dlg = page.getByRole('dialog', { name: title });
      await expect(dlg.locator('[data-effect]')).toHaveCount(n);
      await expect(dlg.locator('[data-effect][aria-pressed="true"]')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();
    }
    /* 長文：流程、每個字 */
    await page.getByRole('radio', { name: /^長文/ }).click();
    for (const [i, title, n] of [
      [0, '長文顯示流程一覽', 7],
      [1, '每個字的出現方式', 16],
    ] as [number, string, number][]) {
      await page.getByRole('button', { name: '效果一覽' }).nth(i).click();
      const dlg = page.getByRole('dialog', { name: title });
      await expect(dlg.locator('[data-effect]')).toHaveCount(n);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: '效果一覽' }).first().click();
    await page
      .getByRole('dialog', { name: '長文顯示流程一覽' })
      .locator('[data-effect="scroll"]')
      .click();
    expect(await hook<string>(page, '(t) => t.app.cfg().flow.kind')).toBe('scroll');

    /* R：從頭播放；在輸入框裡打字時快捷鍵不作用 */
    await hook(page, '(t) => t.seek(2)');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('r');
    await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '文字' }).click();
    const text = page.getByRole('textbox', { name: '主文字' });
    await text.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('1');
    expect(await hook<string>(page, '(t) => t.app.mode()')).toBe('long');

    /* 預覽底色、自動存檔：重新整理後還在 */
    await page.getByRole('radio', { name: '黑色背景' }).click();
    await expect(page.getByRole('status').filter({ hasText: '已自動儲存' })).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __textFx?: unknown }).__textFx);
    expect(await hook<string>(page, '(t) => t.app.mode()')).toBe('long');
    expect(await hook<string>(page, '(t) => t.app.cfg().flow.kind')).toBe('scroll');
    expect(await hook<string>(page, '(t) => t.app.cfg().text')).toMatch(/1$/);
    await expect(page.getByRole('radio', { name: '黑色背景' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('tab', { name: '文字' })).toHaveAttribute('aria-selected', 'true');

    /* 說明：使用方式與關於 */
    await page.getByRole('button', { name: '說明' }).click();
    const help = page.getByRole('dialog', { name: '文字演出產生器：使用方式' });
    await expect(help).toContainText('空一行就是換頁');
    await expect(help).toContainText('原創工具');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
});

test('字型還沒載入時先用替代字型畫，並顯示「字型載入中…」', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  /* Google Fonts 慢 2 秒才回應（空樣式） */
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async (r) => {
    await new Promise((res) => setTimeout(res, 2000));
    await r.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {});
  });
  await page.goto(URL);
  await expect(page.getByRole('status').filter({ hasText: '字型載入中…' })).toBeVisible();
  await expect(page.getByTestId('tfx-canvas')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '字型載入中…' })).toBeHidden({
    timeout: 15_000,
  });
  expect(errors).toEqual([]);
});

test.describe('匯出', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  async function decode(page: Page, bytes: Buffer, type: string) {
    return page.evaluate(
      async ({ b64, type }) => {
        const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        // biome-ignore lint/suspicious/noExplicitAny: ImageDecoder 還沒有型別
        const d = new (window as any).ImageDecoder({ data, type });
        await d.tracks.ready;
        await d.completed;
        const first = await d.decode({ frameIndex: 0 });
        const out = {
          frames: d.tracks.selectedTrack.frameCount as number,
          width: first.image.displayWidth as number,
          height: first.image.displayHeight as number,
        };
        first.image.close();
        return out;
      },
      { b64: bytes.toString('base64'), type },
    );
  }

  async function exportAs(page: Page, format: string) {
    await page.getByRole('radio', { name: format, exact: true }).click();
    await page.getByRole('button', { name: `匯出 ${format}` }).click();
    const card = page.getByTestId('export-result');
    await expect(card).toBeVisible({ timeout: 120_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('link', { name: '下載' }).click(),
    ]);
    return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()), card };
  }

  test('APNG／GIF／WebP／PNG／連番 PNG 都能匯出並被解碼', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    /* 12 fps 讓測試快一點 */
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '12 fps' }).click();
    expect(await hook<number>(page, '(t) => t.app.cfg().fps')).toBe(12);
    const frames = await hook<number>(page, '(t) => Math.ceil(t.scene.duration * 12 - 1e-9)');

    const apng = await exportAs(page, 'APNG');
    expect(apng.name).toBe('戰鬥開始_巨大撞擊.png');
    expect(apng.bytes.includes(Buffer.from('acTL', 'latin1'))).toBe(true);
    const a = await decode(page, apng.bytes, 'image/png');
    expect(a).toMatchObject({ width: 1280, height: 720 });
    expect(a.frames).toBeGreaterThan(5);
    await expect(apng.card).toContainText(`${frames} 格`);
    await expect(apng.card).toContainText('256 色');
    await expect(apng.card).toContainText('預設圖');

    /* GIF、WebP 用 50% 尺寸（以等比放大的設定重新排版） */
    await page.getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^50%/ }).click();
    const gif = await exportAs(page, 'GIF');
    expect(gif.name).toBe('戰鬥開始_巨大撞擊.gif');
    expect(gif.bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    expect(await decode(page, gif.bytes, 'image/gif')).toMatchObject({ width: 640, height: 360 });

    const webp = await exportAs(page, 'WebP');
    expect(webp.name).toBe('戰鬥開始_巨大撞擊.webp');
    expect(webp.bytes.subarray(8, 16).toString('latin1')).toBe('WEBPVP8X');
    const w = await decode(page, webp.bytes, 'image/webp');
    expect(w).toMatchObject({ width: 640, height: 360 });
    expect(w.frames).toBeGreaterThan(5);

    await page.getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^100%/ }).click();
    const png = await exportAs(page, 'PNG');
    expect(png.name).toBe('戰鬥開始_巨大撞擊_靜止.png');
    expect(await decode(page, png.bytes, 'image/png')).toMatchObject({
      frames: 1,
      width: 1280,
      height: 720,
    });
    await expect(png.card).toContainText('完成狀態');

    /* 連番 PNG＋自動裁掉透明邊（換成沒有放大效果的範本，才裁得掉） */
    await hook(page, "(t) => t.app.applyTemplate('coc7-success')");
    await page.getByRole('switch', { name: '自動裁掉透明邊' }).click();
    const n2 = await hook<number>(
      page,
      '(t) => Math.ceil(t.scene.duration * t.app.cfg().fps - 1e-9)',
    );
    const zip = await exportAs(page, '連番 PNG');
    expect(zip.name).toBe('成功_上浮淡入_連番.zip');
    const files = unzipSync(new Uint8Array(zip.bytes));
    const names = Object.keys(files).sort();
    expect(names.filter((f) => f.endsWith('.png'))).toHaveLength(n2);
    expect(names[0]).toBe('成功_上浮淡入_0001.png');
    const info = Buffer.from(files['成功_上浮淡入_資訊.txt']).toString('utf8');
    expect(info).toContain('文字演出產生器　連番 PNG');
    expect(info).toContain('FPS：24');
    const first = await decode(page, Buffer.from(files[names[0]]), 'image/png');
    expect(first.width).toBeLessThan(1280);
    expect(first.height).toBeLessThan(720);
    await expect(zip.card).toContainText('已裁掉透明邊');

    /* 手動檔名 */
    await page.getByRole('textbox', { name: '檔名（留空＝自動命名）' }).fill('我的 素材');
    await page.getByRole('textbox', { name: '檔名（留空＝自動命名）' }).press('Enter');
    await page.getByRole('switch', { name: '自動裁掉透明邊' }).click();
    const named = await exportAs(page, 'PNG');
    expect(named.name).toBe('我的_素材_靜止.png');
    expect(errors).toEqual([]);
  });

  test('Ctrl＋Enter 匯出 APNG', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page);
    await hook(page, "(t) => t.app.set('fps', 12)");
    await page.getByRole('radio', { name: 'PNG', exact: true }).click();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+Enter');
    await expect(page.getByTestId('export-result')).toContainText('戰鬥開始_巨大撞擊.png', {
      timeout: 60_000,
    });
    await expect(page.getByRole('radio', { name: 'APNG', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  async function ready(page: Page) {
    await expect(page.locator('[data-thumbs-ready="true"]')).toBeAttached({ timeout: 30_000 });
    await page.mouse.move(0, 0);
  }
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await ready(page);
    await expect(page).toHaveScreenshot('text-fx-1280.png', { fullPage: true, mask: masks(page) });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，且每個分頁都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await ready(page);
    await expect(page).toHaveScreenshot('text-fx-390.png', { fullPage: true, mask: masks(page) });
    for (const tab of ['文字', '樣式', '裝飾', '時間與尺寸', '模式']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    for (const m of ['長文', '字幕']) {
      await page.getByRole('radio', { name: new RegExp(`^${m}`) }).click();
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
});
