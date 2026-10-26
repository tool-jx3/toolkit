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
import { expectSameGifFrames, exportGifBeforeAfter } from '../helpers/gifCrop';

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
    await expect(help).toContainText('無塵室方式獨立撰寫');
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

  test('GIF 只寫變化的範圍（F310、5. D12）：不透明背景時解碼後每一格和改版前相同、檔案變小；透明時照舊', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    /* 12 fps、50% 尺寸讓測試快一點 */
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await page.getByRole('option', { name: '12 fps' }).click();
    await page.getByRole('combobox', { name: '尺寸' }).click();
    await page.getByRole('option', { name: /^50%/ }).click();
    const gif = async () => new Uint8Array((await exportAs(page, 'GIF')).bytes);
    /* 預設（背景無＝透明）：每格照舊寫整格（逐位元組相同） */
    const clear = await exportGifBeforeAfter(page, gif);
    await expectSameGifFrames(page, clear.before, clear.after, { cropped: false });
    /* 整張背景：單色、不透明、不跟著文字淡入淡出 → 整張不透明，第 2 格起只寫變化的範圍 */
    await hook(
      page,
      "(t) => { t.app.set('bg.kind', 'solid'); t.app.set('bg.alpha', 1); t.app.set('bg.sync', false); }",
    );
    const solid = await exportGifBeforeAfter(page, gif);
    const s = await expectSameGifFrames(page, solid.before, solid.after, { cropped: true });
    expect(s.cropped).toBeGreaterThan(s.frames / 2);
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

test.describe('P11 新增：登場開關、理智範本、我的範本、一次匯出多個', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  const blankHash = (page: Page) =>
    page.getByTestId('tfx-canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
      return true;
    });

  test('登場開關（F297）：關掉時第一格就是完成狀態、自動檔名「無登場」、登場的欄位收起來', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 開著：第一格（開始前空白）是空的 */
    await hook(page, '(t) => t.seek(0)');
    await expect.poll(() => blankHash(page)).toBe(true);
    const bar = page.getByRole('switch', { name: '登場', exact: true });
    await expect(bar).toBeChecked();
    await bar.click();
    expect(await hook<boolean>(page, '(t) => t.app.cfg().introOn')).toBe(false);
    await hook(page, '(t) => t.seek(0)');
    await expect.poll(() => blankHash(page)).toBe(false);
    await expect.poll(() => hook<number>(page, '(t) => t.scene.repTime')).toBe(0);
    await expect(page.getByRole('textbox', { name: '檔名（留空＝自動命名）' })).toHaveAttribute(
      'placeholder',
      '戰鬥開始_無登場',
    );
    /* 模式分頁：登場的開關同步、效果欄位收起來；時間分頁：開始前空白註明不使用 */
    const sw = page.getByRole('switch', { name: '要有登場' });
    await expect(sw).not.toBeChecked();
    await expect(page.getByRole('combobox', { name: '效果' })).toHaveCount(2); // 停留、退場
    await expect(page.getByText('副文字登場')).toHaveCount(0);
    await page.getByRole('tab', { name: '時間與尺寸' }).click();
    await expect(page.getByText('登場動畫關閉時不使用（第一格就是完成狀態）。')).toBeVisible();
    /* 套用內建範本：保留登場開關（同退場開關） */
    await hook(page, "(t) => t.app.applyTemplate('coc7-critical')");
    expect(await hook<boolean>(page, '(t) => t.app.cfg().introOn')).toBe(false);
    /* 長文：開關在「顯示流程」，關掉時顯示說明；向上捲動時不顯示開關 */
    await page.getByRole('tab', { name: '模式' }).click();
    await page.getByRole('radio', { name: /^長文/ }).click();
    await page.getByRole('switch', { name: '要有登場' }).click();
    await expect(page.getByTestId('intro-off-note')).toBeVisible();
    await hook(page, "(t) => t.app.set('flow.kind', 'scroll')");
    await expect(page.getByRole('switch', { name: '要有登場' })).toHaveCount(0);
    /* 復原 */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.waitForTimeout(450);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hook<string>(page, '(t) => t.app.cfg().flow.kind')).toBe('seq');
    expect(errors).toEqual([]);
  });

  test('理智與瘋狂範本（F305～F309）：分組、套用', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: '理智與瘋狂' }).click();
    const cards = page.getByRole('list', { name: '標語範本' }).getByRole('button');
    await expect(cards).toHaveText([
      '理智喪失',
      '臨時性瘋狂',
      '不定性瘋狂',
      'SAN 值歸零',
      '理智回復',
    ]);
    await page.getByRole('button', { name: /^SAN 值歸零/ }).click();
    expect(await hook<string>(page, '(t) => t.app.tplId()')).toBe('san-zero');
    await expect(page.getByTestId('meta-line')).toContainText('SAN 值歸零');
    expect(await hook<string>(page, '(t) => t.app.cfg().sub')).toBe('SANITY : 0');
    expect(errors).toEqual([]);
  });

  test('我的範本（F298～F301）：存、改名、套用、匯出、讀入（合成一則通知）、刪除、重新整理後還在', async ({
    page,
  }) => {
    const errors = await open(page);
    await hook(page, "(t) => { t.app.set('text', '我的字卡'); t.app.set('hold.fx', 'wave'); }");
    const section = page.getByRole('list', { name: '我的範本清單' });
    await page.getByRole('button', { name: '存成我的範本' }).click();
    /* 新增後游標在名稱欄，直接改名 */
    const name = page.getByRole('textbox', { name: '範本名稱（我的字卡）' });
    await expect(name).toBeFocused();
    await name.fill('理智字卡');
    await expect(section.getByRole('listitem')).toHaveCount(1);
    expect(await hook<string[]>(page, '(t) => t.app.mine().map((m) => m.name)')).toEqual([
      '理智字卡',
    ]);

    /* 換成別的範本、改尺寸，再套用我的範本：設定回來、尺寸保留、資訊列顯示範本名稱 */
    await page.getByRole('radio', { name: 'CoC 7 版' }).click();
    await page.getByRole('button', { name: /^大成功/ }).click();
    await hook(page, "(t) => { t.app.set('canvasW', 960); t.app.set('canvasH', 540); }");
    await page.getByRole('button', { name: '套用「理智字卡」' }).click();
    expect(await hook<string>(page, '(t) => t.app.cfg().text')).toBe('我的字卡');
    expect(await hook<string>(page, '(t) => t.app.cfg().hold.fx')).toBe('wave');
    expect(await hook<number>(page, '(t) => t.app.cfg().canvasW')).toBe(960);
    await expect(page.getByTestId('meta-line')).toContainText('標語／理智字卡');
    await expect(page.getByRole('button', { name: '套用「理智字卡」' })).toHaveText('套用中');

    /* 匯出一個：範本檔（JSON） */
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '匯出「理智字卡」' }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe('文字演出範本_理智字卡.json');
    const file = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    expect(file.format).toBe('trpg-toolkit:text-fx-templates');
    expect(file.templates).toHaveLength(1);
    expect(file.templates[0]).toMatchObject({ name: '理智字卡', mode: 'title' });
    expect(file.templates[0].settings.text).toBe('我的字卡');

    /* 讀入兩個檔：一個是範本檔（含一個長文範本）、一個不是 → 一則通知同時說明成功與失敗 */
    const good = JSON.stringify({
      ...file,
      templates: [file.templates[0], { name: '長文的', mode: 'long', settings: { text: '長文' } }],
    });
    await expect(page.getByText('讀入範本檔', { exact: true })).toBeVisible();
    await page.locator('input[type=file][accept*=".json"]').setInputFiles([
      { name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(good) },
      { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"rows":[]}') },
    ]);
    const toast = page.getByRole('status').filter({ hasText: '已讀入 2 個範本，1 個檔案讀不到' });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('長文 1 個');
    await expect(toast).toContainText('bad.json：不是文字演出產生器的範本檔。');
    await expect(section.getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('textbox', { name: '範本名稱（理智字卡（2））' })).toBeVisible();
    await expect(page.getByText('其他模式還有 1 個我的範本（切換模式就看得到）。')).toBeVisible();

    /* 刪除（確認） */
    await page.getByRole('button', { name: '刪除「理智字卡（2）」' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(section.getByRole('listitem')).toHaveCount(1);

    /* 重新整理後還在；長文模式看得到讀入的長文範本 */
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as { __textFx?: unknown }).__textFx);
    await expect(
      page.getByRole('list', { name: '我的範本清單' }).getByRole('listitem'),
    ).toHaveCount(1);
    await page.getByRole('radio', { name: /^長文/ }).click();
    await expect(page.getByRole('textbox', { name: '範本名稱（長文的）' })).toBeVisible();
    /* 390 寬：清單的列（縮圖、名稱、套用、匯出、刪除）不會撐出橫向捲動 */
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('一次匯出多個（F302～F304）：每一行各一個、勾選的範本；打包成 ZIP', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await open(page);
    await hook(
      page,
      "(t) => { t.app.set('text', '大成功\\n成功'); t.app.set('sub', 'CRITICAL\\nSUCCESS'); t.app.set('fps', 12); }",
    );
    await page.getByRole('combobox', { name: '一次匯出多個' }).click();
    await page.getByRole('option', { name: '每一行各一個' }).click();
    await expect(page.getByTestId('batch-note')).toContainText('會做出 2 個：「大成功」、「成功」');
    await expect(page.getByTestId('batch-note')).toContainText('依行配對');
    /* 連番 PNG 不能用 */
    await expect(page.getByRole('radio', { name: '連番 PNG' })).toBeDisabled();

    await page.getByRole('radio', { name: 'PNG', exact: true }).click();
    await page.getByRole('button', { name: '匯出 PNG' }).click();
    const batch = page.getByTestId('export-batch');
    await expect(batch).toBeVisible({ timeout: 60_000 });
    await expect(batch).toContainText('共 2 個檔案');
    await expect(batch).toContainText('每一行各一個，共 2 個');
    await expect(batch.getByTestId('export-result')).toHaveCount(2);
    await expect(batch.getByTestId('export-result').nth(0)).toContainText(
      '01_大成功_巨大撞擊_靜止.png',
    );
    await expect(batch.getByTestId('export-result').nth(1)).toContainText(
      '02_成功_巨大撞擊_靜止.png',
    );
    const [zipDl] = await Promise.all([
      page.waitForEvent('download'),
      batch.getByRole('button', { name: '打包成 ZIP' }).click(),
    ]);
    expect(zipDl.suggestedFilename()).toBe('大成功_巨大撞擊_批次.zip');
    const files = unzipSync(new Uint8Array(readFileSync(await zipDl.path())));
    expect(Object.keys(files).sort()).toEqual([
      '01_大成功_巨大撞擊_靜止.png',
      '02_成功_巨大撞擊_靜止.png',
    ]);
    expect(Buffer.from(files['02_成功_巨大撞擊_靜止.png'].subarray(1, 4)).toString()).toBe('PNG');

    /* 勾選的範本：對話框裡依分組勾選 */
    await page.getByRole('combobox', { name: '一次匯出多個' }).click();
    await page.getByRole('option', { name: '勾選的範本' }).click();
    await page.getByRole('button', { name: '選擇範本（已選 0 個）' }).click();
    const dlg = page.getByRole('dialog', { name: '一次匯出的範本' });
    await dlg.getByRole('button', { name: '「理智與瘋狂」全選／全不選' }).click();
    await dlg.getByRole('checkbox', { name: '理智回復' }).click();
    await dlg.getByRole('button', { name: '完成' }).click();
    await expect(page.getByRole('button', { name: '選擇範本（已選 4 個）' })).toBeVisible();
    await page.getByRole('radio', { name: 'APNG', exact: true }).click();
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    await expect(batch).toContainText('勾選的範本，共 4 個', { timeout: 120_000 });
    const names = await batch.getByTestId('export-result').allTextContents();
    expect(names.map((n) => /^(\S+?\.png)/.exec(n)?.[1])).toEqual([
      '01_理智喪失_模糊對焦.png',
      '02_臨時性瘋狂_上下交錯.png',
      '03_不定性瘋狂_四散聚合.png',
      '04_SAN_值歸零_巨大撞擊.png',
    ]);
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

/* ---------- SF 標題（2026-10-26，規格 1.18 F311～F335） ---------- */

test.describe('SF 標題', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  const blankHash = (page: Page) =>
    page.getByTestId('tfx-canvas').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
      return true;
    });

  /** APNG 的 acTL：影格數、播放次數 */
  function apngInfo(b: Buffer) {
    const i = b.indexOf(Buffer.from('acTL', 'latin1'));
    expect(i).toBeGreaterThan(0);
    return { frames: b.readUInt32BE(i + 4), plays: b.readUInt32BE(i + 8) };
  }

  /** 動態 WebP：畫布尺寸、循環次數、影格數、每格的編碼（VP8＝有損、VP8L＝無損） */
  function webpInfo(b: Buffer) {
    expect(b.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(b.subarray(8, 12).toString('latin1')).toBe('WEBP');
    const out = { width: 0, height: 0, loops: -1, frames: 0, codecs: new Set<string>() };
    for (let o = 12; o + 8 <= b.length; ) {
      const id = b.subarray(o, o + 4).toString('latin1');
      const size = b.readUInt32LE(o + 4);
      const p = o + 8;
      if (id === 'VP8X') {
        out.width = b.readUIntLE(p + 4, 3) + 1;
        out.height = b.readUIntLE(p + 7, 3) + 1;
      } else if (id === 'ANIM') out.loops = b.readUInt16LE(p + 4);
      else if (id === 'ANMF') {
        out.frames++;
        for (let q = p + 16; q + 8 <= p + size; ) {
          const sid = b.subarray(q, q + 4).toString('latin1');
          const ssz = b.readUInt32LE(q + 4);
          if (sid !== 'ALPH') out.codecs.add(sid.trim());
          q += 8 + ssz + (ssz & 1);
        }
      }
      o = p + size + (size & 1);
    }
    return out;
  }

  async function decodeFrames(page: Page, bytes: Buffer, type: string) {
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

  test('切到 SF 標題、選範本、改文字與樣式、播放方式、尺寸（F311～F329、F335）', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 停在「裝飾」分頁時切到 SF 標題：裝飾分頁不顯示，改看「樣式」（R9） */
    await page.getByRole('tab', { name: '裝飾' }).click();
    /* 快捷鍵 4 切到 SF 標題（快捷鍵說明寫「切換到 SF 標題」，R7） */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog', { name: '快捷鍵' })).toContainText('切換到 SF 標題');
    await page.keyboard.press('Escape');
    await page.keyboard.press('4');
    expect(await hook<string>(page, '(t) => t.app.mode()')).toBe('sf');
    await expect(page.getByTestId('meta-line')).toContainText(
      'SF 標題／雷達掃描・960×320・15 fps・4.00 秒・60 格',
    );
    await expect(page.getByRole('tab', { name: '裝飾' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: '樣式' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: '模式' }).click();
    /* 切換模式會從頭播放；暫停在代表畫面（登場結束＝1.6 秒） */
    expect(await hook<number>(page, '(t) => t.scene.repTime')).toBeCloseTo(1.6, 6);
    await hook(page, '(t) => t.seek(t.scene.repTime)');
    await expect.poll(() => blankHash(page)).toBe(false);
    const h0 = await canvasHash(page);

    /* 8 個範本（縮圖選項）；選「指令視窗」 */
    const group = page.getByRole('radiogroup', { name: 'SF 標題範本' });
    await expect(group.getByRole('radio')).toHaveCount(8);
    await group.getByRole('radio', { name: /指令視窗/ }).click();
    expect(await hook<string>(page, '(t) => t.app.tplId()')).toBe('console');
    expect(await hook<string>(page, '(t) => t.app.cfg().sf.tpl')).toBe('console');
    await expect(page.getByTestId('meta-line')).toContainText('SF 標題／指令視窗');
    await hook(page, '(t) => t.seek(t.scene.repTime)');
    await expect.poll(() => canvasHash(page)).not.toBe(h0);

    /* 文字：標題、副文字、代碼（留空＝自動）、編號 */
    await page.getByRole('tab', { name: '文字' }).click();
    const title = page.getByRole('textbox', { name: '標題' });
    await expect(title).toHaveValue('異常訊號');
    const code = page.getByRole('textbox', { name: '代碼標籤（留空＝自動）' });
    const auto0 = await code.getAttribute('placeholder');
    expect(auto0).toMatch(/^[A-Z]{2}-[0-9A-F]{4}·\d{2}$/);
    const h1 = await canvasHash(page);
    await title.fill('封鎖區域');
    await expect.poll(() => hook<string>(page, '(t) => t.app.cfg().text')).toBe('封鎖區域');
    await expect(code).not.toHaveAttribute('placeholder', auto0!);
    await hook(page, '(t) => t.seek(t.scene.repTime)');
    await expect.poll(() => canvasHash(page)).not.toBe(h1);
    await code.fill('ZX-0001');
    await page.getByRole('textbox', { name: '編號' }).fill('42');
    await expect.poll(() => hook<string>(page, '(t) => t.app.cfg().sf.code')).toBe('ZX-0001');
    expect(await hook<string>(page, '(t) => t.app.cfg().sf.num')).toBe('42');

    /* 樣式：主色色票、強調色、字型、光暈、掃描線、故障 */
    await page.getByRole('tab', { name: '樣式' }).click();
    await page
      .getByRole('radiogroup', { name: '主色' })
      .getByRole('radio', { name: '琥珀（#ffc861）' })
      .click();
    expect(await hook<string>(page, '(t) => t.app.cfg().sf.main')).toBe('#ffc861');
    await expect(
      page
        .getByRole('radiogroup', { name: '主色' })
        .getByRole('radio', { name: '琥珀（#ffc861）' }),
    ).toHaveAttribute('aria-checked', 'true');
    await page
      .getByRole('radiogroup', { name: '強調色' })
      .getByRole('radio', { name: '螢光綠（#d4ff40）' })
      .click();
    expect(await hook<string>(page, '(t) => t.app.cfg().sf.accent')).toBe('#d4ff40');
    /* 色票用方向鍵移動並選取（R8） */
    const lime = page
      .getByRole('radiogroup', { name: '強調色' })
      .getByRole('radio', { name: '螢光綠（#d4ff40）' });
    await expect(lime).toBeFocused();
    /* 方向鍵按住一下再放（Radix 的單選在焦點移過去時，按鍵還按著才選取；press 太快放開會漏掉） */
    await page.keyboard.down('ArrowRight');
    await expect(
      page
        .getByRole('radiogroup', { name: '強調色' })
        .getByRole('radio', { name: '琥珀（#ffc861）' }),
    ).toBeFocused();
    await page.keyboard.up('ArrowRight');
    await expect.poll(() => hook<string>(page, '(t) => t.app.cfg().sf.accent')).toBe('#ffc861');
    await page.getByRole('combobox', { name: '中文字型' }).click();
    await page.getByRole('option', { name: '俐方體 11 號（像素）' }).click();
    expect(await hook<string>(page, '(t) => t.app.cfg().sf.cjk')).toBe('cubic-11');
    await page.getByRole('switch', { name: '掃描線' }).click();
    expect(await hook<boolean>(page, '(t) => t.app.cfg().sf.scan')).toBe(true);

    /* 播放方式：對應到登場、退場開關與循環 */
    await page.getByRole('tab', { name: '模式' }).click();
    const play = page.getByRole('combobox', { name: '播放方式' });
    await play.click();
    await page.getByRole('option', { name: '循環播放（只有停留）' }).click();
    expect(
      await hook<unknown[]>(
        page,
        '(t) => [t.app.cfg().introOn, t.app.cfg().outroOn, t.app.cfg().loop]',
      ),
    ).toEqual([false, false, 'infinite']);
    /* 無縫循環：不提示「退場關閉又設成無限循環」；完成狀態在 0 秒 */
    await expect(page.getByText('退場關閉又設成無限循環')).toHaveCount(0);
    await expect.poll(() => hook<number>(page, '(t) => t.scene.repTime')).toBe(0);
    await play.click();
    await page.getByRole('option', { name: '播放一次（沒有退場）' }).click();
    expect(
      await hook<unknown[]>(
        page,
        '(t) => [t.app.cfg().introOn, t.app.cfg().outroOn, t.app.cfg().loop]',
      ),
    ).toEqual([true, false, 'once']);
    /* 預覽下方的退場開關打開＝自訂的組合 */
    await page.getByRole('switch', { name: '退場', exact: true }).click();
    await expect(play).toContainText('自訂的組合');

    /* 時間與尺寸：比例 2:1、寬 800、fps 10、長度 */
    await page.getByRole('tab', { name: '時間與尺寸' }).click();
    await page.getByRole('radio', { name: '2:1' }).click();
    await page.getByRole('radio', { name: '800', exact: true }).click();
    await expect
      .poll(() => hook<number[]>(page, '(t) => [t.scene.W, t.scene.H]'))
      .toEqual([800, 400]);
    await page.getByRole('radio', { name: '16:9' }).click();
    await expect
      .poll(() => hook<number[]>(page, '(t) => [t.scene.W, t.scene.H]'))
      .toEqual([800, 450]);
    await page.getByRole('radio', { name: '10', exact: true }).click();
    /* 長度：打 3.3 → 離開欄位時取到 3.5（R3） */
    const dur = page.getByRole('spinbutton', { name: '長度' });
    await dur.fill('3.3');
    await dur.press('Tab');
    await expect(dur).toHaveValue('3.5');
    expect(await hook<number>(page, '(t) => t.app.cfg().sf.dur')).toBe(3.5);
    await hook(page, "(t) => t.app.set('sf.dur', 6)");
    await expect(page.getByTestId('total-note')).toContainText('總長 6.00 秒・10 fps 共 60 格');
    /* 匯出區的 FPS 選單也是 10～24 */
    await page.getByRole('combobox', { name: 'FPS' }).click();
    await expect(page.getByRole('option')).toHaveText([
      '10 fps',
      '12 fps',
      '15 fps',
      '20 fps',
      '24 fps',
    ]);
    await page.keyboard.press('Escape');

    /* 一次匯出多個的「勾選的範本」：SF 的說明（R5） */
    await page.getByRole('combobox', { name: '一次匯出多個' }).click();
    await page.getByRole('option', { name: '勾選的範本' }).click();
    await page.getByRole('button', { name: /^選擇範本/ }).click();
    const pick = page.getByRole('dialog', { name: '一次匯出的範本' });
    await expect(pick).toContainText('範本共用目前的文字與樣式');
    await expect(pick.getByRole('checkbox')).toHaveCount(8);
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: '一次匯出多個' }).click();
    await page.getByRole('option', { name: '不用（只匯出目前的設定）' }).click();

    /* 切回標語：各自保留設定（F002）；裝飾分頁回來 */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('1');
    expect(await hook<string>(page, '(t) => t.app.cfg().text')).toBe('戰鬥開始');
    await expect(page.getByRole('tab', { name: '裝飾' })).toHaveCount(1);
    await page.keyboard.press('4');
    expect(await hook<string>(page, '(t) => t.app.cfg().text')).toBe('封鎖區域');
    expect(await hook<string>(page, '(t) => t.app.cfg().sf.tpl')).toBe('console');
    expect(errors).toEqual([]);
  });

  test('匯出 APNG 與 WebP：尺寸、格數、循環次數、5 MB 標示、決定性（F326～F334）', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    await page.getByRole('radio', { name: /^SF 標題/ }).click();
    /* 3:1 × 640、10 fps、長度 2 秒 → 20 格 */
    await page.getByRole('tab', { name: '時間與尺寸' }).click();
    await page.getByRole('radio', { name: '3:1' }).click();
    await page.getByRole('radio', { name: '640', exact: true }).click();
    await page.getByRole('radio', { name: '10', exact: true }).click();
    await hook(page, "(t) => t.app.set('sf.dur', 2)");
    await expect
      .poll(() => hook<number[]>(page, '(t) => [t.scene.W, t.scene.H, t.scene.duration]'))
      .toEqual([640, 214, 2]);

    /* 循環播放（登場→停留→退場）：APNG 無限循環 */
    const a1 = await exportAs(page, 'APNG');
    expect(a1.name).toBe('異常訊號_雷達掃描_循環.png');
    const i1 = apngInfo(a1.bytes);
    expect(i1.plays).toBe(0);
    expect(i1.frames).toBeGreaterThan(15);
    expect(i1.frames).toBeLessThanOrEqual(20);
    expect(await decodeFrames(page, a1.bytes, 'image/png')).toMatchObject({
      width: 640,
      height: 214,
    });
    await expect(a1.card).toContainText('20 格');
    /* 5,000,000 位元組（共用匯出區以 1024 進位顯示成 4.77 MB），沒超過＝綠色 */
    await expect(a1.card.getByTestId('export-limit')).toContainText('／4.77 MB');
    await expect(a1.card.getByTestId('export-limit')).not.toHaveAttribute('data-over', '');
    /* 同樣的設定再匯出一次：逐位元組相同 */
    const a2 = await exportAs(page, 'APNG');
    expect(a2.bytes.equals(a1.bytes)).toBe(true);

    /* 播放一次（沒有退場）：APNG 播放 1 次 */
    await page.getByRole('tab', { name: '模式' }).click();
    await page.getByRole('combobox', { name: '播放方式' }).click();
    await page.getByRole('option', { name: '播放一次（沒有退場）' }).click();
    const once = await exportAs(page, 'APNG');
    expect(once.name).toBe('異常訊號_雷達掃描_無退場.png');
    expect(apngInfo(once.bytes).plays).toBe(1);

    /* 循環播放（只有停留）＋WebP（品質 60，有損） */
    await page.getByRole('combobox', { name: '播放方式' }).click();
    await page.getByRole('option', { name: '循環播放（只有停留）' }).click();
    await page.getByRole('radio', { name: 'WebP', exact: true }).click();
    await expect(page.getByText('WebP 品質', { exact: true })).toBeVisible();
    await hook(page, "(t) => t.app.set('sf.webpQuality', 60)");
    const w = await exportAs(page, 'WebP');
    expect(w.name).toBe('異常訊號_雷達掃描_無登場_無退場_循環.webp');
    const wi = webpInfo(w.bytes);
    expect(wi).toMatchObject({ width: 640, height: 214, loops: 0 });
    expect(wi.frames).toBeGreaterThan(15);
    expect(wi.frames).toBeLessThanOrEqual(20);
    expect([...wi.codecs]).toEqual(['VP8']);
    expect((await decodeFrames(page, w.bytes, 'image/webp')).frames).toBe(wi.frames);
    await expect(w.card).toContainText('WebP 品質60');

    /* 一次匯出多個：SF 標題沒有「每一行各一個」 */
    await page.getByRole('combobox', { name: '一次匯出多個' }).click();
    await expect(page.getByRole('option')).toHaveText(['不用（只匯出目前的設定）', '勾選的範本']);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：SF 標題 1280 寬；390 寬每個分頁都沒有橫向捲動', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: /^SF 標題/ }).click();
    await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    await hook(page, '(t) => t.setPlaying(false)');
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
    await hook(page, '(t) => t.seek(t.scene.repTime)');
    await expect
      .poll(() => hook<number>(page, '(t) => Math.abs(t.t - t.scene.repTime)'))
      .toBeLessThan(1e-6);
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('text-fx-sf-1280.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ['文字', '樣式', '時間與尺寸', '模式']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
});
