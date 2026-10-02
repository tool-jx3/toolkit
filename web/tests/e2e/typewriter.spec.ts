/**
 * 打字機動畫產生器（建置產物 tools/typewriter/）的端對端測試：
 * - 開頁沒有 pageerror／console error；四個模式的設定各自獨立、切換後保留；文字即時更新預覽與逐格資料；
 *   影格計數、暫停／繼續／重播；空文字（0／0、不能匯出、不能裁切）。
 * - 色碼欄、複製色碼（大寫）、卡拉 OK 配色預設、依文字裁切（卡拉 OK 的公式、打字的墨跡範圍）。
 * - 匯出 APNG（調色盤／全彩）、GIF、WebP（無損／有損）並解析檔案：尺寸、無限循環、各格延遲與總長、檔名。
 * - 片尾名單分段匯出（每段一個檔案、檔名）、靜音 WAV；打字音效（上傳、合成、試聽、下載 WAV）。
 * - 自動儲存、專案檔、重設；390 寬沒有橫向捲動；1280／390 視覺基準圖。
 * - 對等驗證後的追加裁定（規格 7.1）：播放中改任何設定（含配色按鈕）都回到第 1 格（F64、F57）；
 *   圖形模式不套用水平縮放、欄位停用並註明（F06）；WebP 每格至少 20 ms（F69）；
 *   不能編碼 WebP 時，選其他格式也看得到原因（F70）。
 * - 複驗後修正：陰影的偏移不跟著水平縮放（F19）。
 */
import { readFileSync } from 'node:fs';
import { type Download, expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { parseGif } from '../helpers/gif';
import { parseApng, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('typewriter') ?? { id: 'typewriter', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '打字機動畫產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __typewriter?: unknown }).__typewriter,
  );
  return errors;
}

const hook = <T>(page: Page, fn: string) =>
  page.evaluate((f) => {
    // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
    const t = (window as any).__typewriter;
    return new Function('t', `return (${f})(t)`)(t);
  }, fn) as Promise<T>;

/** 預覽畫布的雜湊（確認畫面有變） */
const canvasHash = (page: Page) =>
  page.getByTestId('tw-canvas').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    const u = new Uint32Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer);
    let h = 2166136261;
    for (let i = 0; i < u.length; i += 7) h = Math.imul(h ^ u[i], 16777619);
    return h >>> 0;
  });

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const counter = (page: Page) => page.getByTestId('frame-counter');
const meta = (page: Page) => page.getByTestId('meta-line');

async function exportAs(page: Page, format: string) {
  await page.getByRole('radio', { name: format, exact: true }).click();
  await page.getByRole('button', { name: `匯出 ${format}` }).click();
  const card = page.getByTestId('export-result');
  await expect(card).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('link', { name: '下載' }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    bytes: readFileSync((await download.path())!),
    card,
  };
}

/** WebP（RIFF）：ANIM 的循環次數、各 ANMF 的延遲、是否有無損（VP8L）／有損（VP8 ＋ ALPH）影像 */
function parseWebpInfo(bytes: Buffer) {
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  let loop = -1;
  const durations: number[] = [];
  const kinds = new Set<string>();
  let width = 0;
  let height = 0;
  const walk = (start: number, end: number) => {
    let o = start;
    while (o + 8 <= end) {
      const id = bytes.subarray(o, o + 4).toString('latin1');
      const size = bytes.readUInt32LE(o + 4);
      const body = o + 8;
      if (id === 'VP8X') {
        width = 1 + bytes.readUIntLE(body + 4, 3);
        height = 1 + bytes.readUIntLE(body + 7, 3);
      } else if (id === 'ANIM') loop = bytes.readUInt16LE(body + 4);
      else if (id === 'ANMF') {
        durations.push(bytes.readUIntLE(body + 12, 3));
        walk(body + 16, body + size);
      } else kinds.add(id);
      o = body + size + (size % 2);
    }
  };
  walk(12, bytes.length);
  return { loop, durations, kinds, width, height };
}

/** PCM WAV 的表頭與長度 */
function parseWavInfo(bytes: Buffer) {
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
  let o = 12;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let samples = 0;
  while (o + 8 <= bytes.length) {
    const id = bytes.subarray(o, o + 4).toString('latin1');
    const size = bytes.readUInt32LE(o + 4);
    if (id === 'fmt ') {
      channels = bytes.readUInt16LE(o + 10);
      rate = bytes.readUInt32LE(o + 12);
      bits = bytes.readUInt16LE(o + 22);
    } else if (id === 'data') samples = size / (channels * (bits / 8));
    o += 8 + size + (size % 2);
  }
  return { channels, rate, bits, samples, seconds: samples / rate };
}

/** 測試用的音效：8000 Hz、單聲道、0.25 秒的嗶聲（PCM 16-bit WAV） */
function beepWav(): Buffer {
  const rate = 8000;
  const n = rate / 4;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 880) * 12000), 44 + i * 2);
  return buf;
}

test.describe('打字機動畫產生器', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('模式切換保留設定、文字即時更新、影格計數、播放控制、空文字', async ({ page }) => {
    const errors = await open(page);
    /* 預設：打字、減少動態效果時停在打完的那一格 */
    await expect(page.getByRole('tab', { name: '打字' })).toHaveAttribute('aria-selected', 'true');
    await expect(counter(page)).toHaveText('13／13 格');
    await expect(meta(page)).toContainText('打字・600×300・12 fps・3.00 秒');
    const h0 = await canvasHash(page);

    /* 改文字：逐格資料與畫面立即更新（規格附件 T01） */
    const text = page.getByTestId('typing-text');
    await text.fill('早安，\n冒險者');
    const frames = await hook<{ 畫面文字: string; 延遲毫秒: number }[]>(page, '(t) => t.frames()');
    expect(frames.map((f) => f.畫面文字)).toEqual([
      '早',
      '早安',
      '早安，',
      '早安，\n',
      '早安，\n冒',
      '早安，\n冒險',
      '早安，\n冒險者',
    ]);
    expect(frames.at(-1)!.延遲毫秒).toBe(2000);
    await expect(counter(page)).toHaveText('7／7 格');
    await expect.poll(() => canvasHash(page)).not.toBe(h0);

    /* 字級只改打字模式 */
    const size = page.getByRole('spinbutton', { name: '字級' });
    await size.fill('60');
    await size.press('Enter');
    expect(await hook<number>(page, '(t) => t.data().typing.size')).toBe(60);
    expect(await hook<number>(page, '(t) => t.data().glitch.size')).toBe(48);

    /* 切換模式：預覽換成該模式的畫布尺寸，切回來時設定保留 */
    await page.getByRole('tab', { name: '故障' }).click();
    await expect(meta(page)).toContainText('故障・600×300・15 fps');
    await page.getByRole('tab', { name: '片尾名單' }).click();
    await expect(meta(page)).toContainText('片尾名單・720×400・12 fps・20.00 秒');
    await expect(counter(page)).toHaveText('121／240 格');
    await page.getByRole('tab', { name: '卡拉 OK' }).click();
    await expect(meta(page)).toContainText('卡拉 OK・720×300・20 fps・10.00 秒');
    await expect(counter(page)).toHaveText('171／171 格');
    await page.getByRole('tab', { name: '打字' }).click();
    await expect(page.getByTestId('typing-text')).toHaveValue('早安，\n冒險者');
    await expect(page.getByRole('spinbutton', { name: '字級' })).toHaveValue('60');

    /* 暫停／繼續／重播 */
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    const paused = await counter(page).textContent();
    await page.waitForTimeout(300);
    await expect(counter(page)).toHaveText(paused!);
    await page.getByRole('button', { name: '重播' }).click();
    await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
    expect(await hook<number>(page, '(t) => t.frame')).toBeLessThan(3);
    await hook(page, '(t) => t.setPlaying(false)');

    /* 空文字：只有背景、0／0、不能匯出、不能裁切 */
    await page.getByTestId('typing-text').fill('');
    await expect(counter(page)).toHaveText('0／0 格');
    await expect(page.getByText('還沒有文字：預覽只顯示背景，也不能匯出。')).toBeVisible();
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '沒有文字可用' })).toBeVisible();
    await page.getByRole('button', { name: '依文字裁切畫布' }).click();
    await expect(page.getByText('沒有文字可用').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('色碼欄、複製色碼、配色預設、依文字裁切', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    /* 色碼欄：3 位色碼（# 可有可無）在離開欄位時套用 */
    const fill = page.getByRole('textbox', { name: '文字填色', exact: true });
    await fill.fill('f00');
    await fill.press('Tab');
    expect(await hook<string>(page, '(t) => t.data().typing.fill')).toBe('#ff0000');
    /* 複製色碼：大寫 6 位，按鈕文字暫時改成「已複製」 */
    const copy = page.getByRole('button', { name: '複製文字填色色碼' });
    await copy.click();
    await expect(copy).toHaveText('已複製');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('#FF0000');
    await expect(copy).toHaveText('複製', { timeout: 3000 });

    /* 依文字裁切（打字）：墨跡範圍＋留白，比原本的畫布小 */
    await page.getByRole('button', { name: '依文字裁切畫布' }).click();
    await expect(page.getByText(/畫布已改成 \d+ × \d+/).first()).toBeVisible();
    const fitted = await hook<{ width: number; height: number }>(
      page,
      '(t) => ({ width: t.data().typing.width, height: t.data().typing.height })',
    );
    expect(fitted.width).toBeLessThan(600);
    expect(fitted.height).toBeLessThan(300);
    expect(fitted.width).toBeGreaterThan(100);
    await expect(meta(page)).toContainText(`${fitted.width}×${fitted.height}`);

    /* 卡拉 OK：配色預設 */
    await page.getByRole('tab', { name: '卡拉 OK' }).click();
    await page.getByRole('button', { name: /海洋/ }).click();
    expect(
      await hook<string[]>(
        page,
        '(t) => { const k = t.data().karaoke; return [k.beforeFill, k.afterFill]; }',
      ),
    ).toEqual(['#e8f4ff', '#5ce1e6']);
    await page.getByRole('button', { name: /金黃與桃紅/ }).click();
    expect(await hook<string>(page, '(t) => t.data().karaoke.afterStroke')).toBe('#ff2e63');

    /* 卡拉 OK 的裁切：高＝行數 × 字級 × 行距＋2 × 外框＋2 × 陰影模糊＋40（4 行 → 352；固定 2 行 → 208） */
    await page.getByRole('button', { name: '依文字裁切畫布' }).click();
    await expect.poll(() => hook<number>(page, '(t) => t.data().karaoke.height')).toBe(352);
    await hook(page, "(t) => t.patch('karaoke', { show: 'rotate', rows: 2 })");
    await expect(page.getByText('同時出現的行數')).toBeVisible();
    await page.getByRole('button', { name: '依文字裁切畫布' }).click();
    await expect.poll(() => hook<number>(page, '(t) => t.data().karaoke.height')).toBe(208);
    expect(errors).toEqual([]);
  });

  test('卡拉 OK：時間標記與分配、顯示方式', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('tab', { name: '卡拉 OK' }).click();
    await page.getByTestId('karaoke-text').fill('月光照進窗台 | 2\n擲出命運的骰子吧\n\n大成功');
    const k = await hook<{
      結束秒數: number;
      格數: number;
      各行: { 顯示文字: string; 開始秒數: number; 長度秒數: number }[];
    }>(page, '(t) => t.karaoke()');
    expect(k.結束秒數).toBeCloseTo(8.5, 6);
    expect(k.格數).toBe(171);
    expect(k.各行.map((l) => l.顯示文字)).toEqual([
      '月光照進窗台',
      '擲出命運的骰子吧',
      '',
      '大成功',
    ]);
    expect(k.各行[2].開始秒數).toBeCloseTo(6.8636, 3);
    /* 每句等長 */
    await page.getByRole('radio', { name: '每句等長' }).click();
    expect(await hook<number>(page, '(t) => t.karaoke().各行[1].長度秒數')).toBeCloseTo(3, 6);
    /* 只顯示正在唱的一句：第二句開始後第一句消失 */
    await page.getByRole('combobox', { name: '顯示方式' }).click();
    await page.getByRole('option', { name: '只顯示正在唱的一句' }).click();
    expect(await hook<number[]>(page, '(t) => t.karaoke().visibilityAt(3)')).toEqual([0, 1, 0, 0]);
    expect(errors).toEqual([]);
  });

  test('圖形模式不套用水平縮放：欄位停用並註明，畫面與 100% 相同（F06）', async ({ page }) => {
    const errors = await open(page);
    await page.getByTestId('typing-text').fill('IIIIIIII');
    const scaleX = page.getByRole('spinbutton', { name: '水平縮放' });
    await expect(scaleX).toBeEnabled();
    /* 不用圖形：水平縮放有作用 */
    await expect(counter(page)).toHaveText('8／8 格');
    const plain100 = await canvasHash(page);
    await hook(page, "(t) => t.patch('typing', { scaleX: 50 })");
    await expect.poll(() => canvasHash(page)).not.toBe(plain100);

    /* 圖形（圓）＋100% */
    await hook(page, "(t) => t.patch('typing', { scaleX: 100 })");
    await page.getByRole('radio', { name: '圓', exact: true }).click();
    await expect(scaleX).toBeDisabled();
    await expect(scaleX).toHaveAccessibleDescription(/圖形模式不適用/);
    await expect(page.getByText('圖形模式不適用。')).toBeVisible();
    await expect.poll(() => canvasHash(page)).not.toBe(plain100);
    const circle100 = await canvasHash(page);
    /* 圖形＋50%：先切回不用圖形（畫面一定不同），再開圓 → 和 100% 完全相同 */
    await hook(page, "(t) => t.patch('typing', { shape: 'none', scaleX: 50 })");
    await expect(scaleX).toBeEnabled();
    await expect.poll(() => canvasHash(page)).not.toBe(circle100);
    await hook(page, "(t) => t.patch('typing', { shape: 'circle' })");
    await expect.poll(() => canvasHash(page)).toBe(circle100);
    /* 設定值保留（只是不套用） */
    await expect(scaleX).toHaveValue('50');
    expect(await hook<number>(page, '(t) => t.data().typing.scaleX')).toBe(50);
    expect(errors).toEqual([]);
  });

  test('陰影的偏移不跟著水平縮放（F19，複驗後修正）', async ({ page }) => {
    const errors = await open(page);
    await page.getByTestId('typing-text').fill('I');
    await hook(
      page,
      "(t) => t.patch('typing', { strokeWidth: 0, fill: '#ffffff', shadowColor: '#00ff00', shadowBlur: 0, shadowX: 8, shadowY: 0, bgOn: false })",
    );
    /* 白字與綠色陰影最右邊的 x */
    const rightEdges = () =>
      page.getByTestId('tw-canvas').evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let ink = -1;
        let shadow = -1;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          const x = (i / 4) % c.width;
          if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) ink = Math.max(ink, x);
          else if (d[i + 1] > 200 && d[i] < 80 && d[i + 2] < 80) shadow = Math.max(shadow, x);
        }
        return shadow - ink;
      });
    for (const scaleX of [100, 50, 200]) {
      await hook(page, `(t) => t.patch('typing', { scaleX: ${scaleX} })`);
      await expect.poll(rightEdges, `水平縮放 ${scaleX}%`).toBe(8);
    }
    expect(errors).toEqual([]);
  });

  test('不能編碼 WebP 的瀏覽器：選其他格式時也看得到原因（F70）', async ({ page }) => {
    /* 模擬 Safari：canvas 要求 WebP 時給 PNG */
    await page.addInitScript(() => {
      const oc = OffscreenCanvas.prototype.convertToBlob;
      OffscreenCanvas.prototype.convertToBlob = function (o?: ImageEncodeOptions) {
        return oc.call(this, o?.type === 'image/webp' ? { ...o, type: 'image/png' } : o);
      };
      const tb = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
        tb.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
      };
    });
    const errors = await open(page);
    const webp = page.getByRole('radio', { name: 'WebP', exact: true });
    await expect(webp).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'APNG', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const reason = page.getByText(/這個瀏覽器無法匯出 WebP/);
    await expect(reason).toBeVisible();
    const group = page.getByRole('radiogroup', { name: '格式' });
    await expect(group).toHaveAccessibleDescription(/全彩、半透明都保留.*這個瀏覽器無法匯出 WebP/);
    /* 換成 GIF 仍然看得到 */
    await page.getByRole('radio', { name: 'GIF', exact: true }).click();
    await expect(group).toHaveAccessibleDescription(/相容性最好.*這個瀏覽器無法匯出 WebP/);
    await expect(reason).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('預覽播放（不減少動態效果）', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('播放中改任何設定（含配色按鈕）都回到第 1 格（F64、F57）', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await open(page);
    /* 每次畫面更新記下預覽時間的最小值（要求從頭播放後一定會掉回 0 附近） */
    await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
      const w = window as any;
      w.__minT = Number.POSITIVE_INFINITY;
      const loop = () => {
        const t = w.__typewriter.t as number;
        if (t < w.__minT) w.__minT = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const minT = () =>
      // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
      page.evaluate(() => (window as any).__minT as number);
    /** 跳到 1.5 秒繼續播，確認記錄從 1.5 秒以後開始，再做 change：必須回到開頭並繼續播放 */
    const expectRestart = async (label: string, change: () => Promise<void>) => {
      await hook(page, '(t) => { t.seek(1.5); t.setPlaying(true); }');
      await expect.poll(() => hook<number>(page, '(t) => t.t')).toBeGreaterThan(1.5);
      // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
      await page.evaluate(() => ((window as any).__minT = Number.POSITIVE_INFINITY));
      await page.waitForTimeout(50);
      expect(await minT(), `${label}：改設定前`).toBeGreaterThan(1.4);
      await change();
      await expect
        .poll(minT, { message: `${label}：應回到第 1 格`, timeout: 3000 })
        .toBeLessThan(0.15);
      expect(await hook<boolean>(page, '(t) => t.playing')).toBe(true);
    };
    /* 打字、故障的停留拉長，播放時不會在檢查期間繞回開頭 */
    await hook(page, "(t) => t.patch('typing', { holdMs: 20000 })");
    await hook(page, "(t) => t.patch('glitch', { holdMs: 20000 })");
    for (const mode of ['打字', '故障', '片尾名單', '卡拉 OK']) {
      await page.getByRole('tab', { name: mode }).click();
      const shadowX = page.getByRole('spinbutton', { name: '陰影 X 偏移' });
      for (const v of [5, -3, 7]) {
        await expectRestart(`${mode} 陰影 X 偏移 ${v}`, async () => {
          await shadowX.fill(String(v));
          await shadowX.press('Enter');
        });
      }
    }
    /* 卡拉 OK 的配色按鈕（F57） */
    for (const name of ['海洋', '櫻花', '金黃與桃紅']) {
      await expectRestart(`配色 ${name}`, () =>
        page.getByRole('button', { name: new RegExp(name) }).click(),
      );
    }
    expect(errors).toEqual([]);
  });
});

test.describe('匯出', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('打字：APNG（調色盤／全彩）、GIF、WebP（無損／有損）', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    await page.getByTestId('typing-text').fill('早安，\n冒險者');

    const apng = await exportAs(page, 'APNG');
    expect(apng.name).toMatch(/^typing_\d{13}\.png$/);
    const a = parseApng(new Uint8Array(apng.bytes));
    expect(a.ihdr).toMatchObject({ width: 600, height: 300, colorType: 3 });
    expect(a.numPlays).toBe(0);
    const delays = a.frames.map((f) => (f.delayNum * 1000) / (f.delayDen || 100));
    expect(delays.reduce((s, d) => s + d, 0)).toBeCloseTo(2500, 0);
    expect(delays.at(-1)).toBe(2000);
    await expect(apng.card).toContainText('7 格');

    /* 減色關：全彩 RGBA */
    await page.getByRole('switch', { name: '減色（256 色）' }).click();
    expect(await hook<boolean>(page, '(t) => t.data().typing.quantize')).toBe(false);
    const full = await exportAs(page, 'APNG');
    expect(readIhdr(parseChunks(new Uint8Array(full.bytes))).colorType).toBe(6);

    const gif = await exportAs(page, 'GIF');
    expect(gif.name).toMatch(/^typing_\d{13}\.gif$/);
    const g = parseGif(new Uint8Array(gif.bytes));
    expect(g).toMatchObject({ width: 600, height: 300, loopCount: 0 });
    expect(g.frames.reduce((s, f) => s + f.delayCs, 0)).toBe(250);
    expect(g.frames.at(-1)!.delayCs).toBe(200);

    const webp = await exportAs(page, 'WebP');
    expect(webp.name).toMatch(/^typing_\d{13}\.webp$/);
    const w = parseWebpInfo(webp.bytes);
    expect(w).toMatchObject({ loop: 0, width: 600, height: 300 });
    expect(w.durations.reduce((s, d) => s + d, 0)).toBe(2500);
    expect(w.kinds.has('VP8L')).toBe(true);

    /* WebP 有損：品質欄可以用 */
    await page.getByRole('switch', { name: 'WebP 無損' }).click();
    await expect(page.getByRole('spinbutton', { name: 'WebP 品質' })).toBeEnabled();
    const lossy = await exportAs(page, 'WebP');
    const l = parseWebpInfo(lossy.bytes);
    expect(l.kinds.has('VP8 ')).toBe(true);
    expect(l.kinds.has('VP8L')).toBe(false);

    /* WebP 每格至少 20 ms（F69）：60 FPS、停留 500 → 20×5、500；APNG 不受影響 */
    await page.getByTestId('typing-text').fill('ABCDEF');
    await hook(page, "(t) => t.patch('typing', { fps: 60, holdMs: 500 })");
    await expect(counter(page)).toHaveText('6／6 格');
    const fast = parseWebpInfo((await exportAs(page, 'WebP')).bytes);
    expect(fast.durations).toEqual([20, 20, 20, 20, 20, 500]);
    const fastApng = parseApng(new Uint8Array((await exportAs(page, 'APNG')).bytes));
    expect(fastApng.frames.map((f) => (f.delayNum * 1000) / (f.delayDen || 100))).toEqual([
      17, 16, 17, 17, 16, 500,
    ]);
    expect(errors).toEqual([]);
  });

  test('故障與卡拉 OK 的 APNG：格數與延遲照時間軸', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    await page.getByRole('tab', { name: '故障' }).click();
    await page.getByTestId('glitch-text').fill('AB C\nD');
    await hook(page, "(t) => t.patch('glitch', { intensity: 2 })");
    const pattern = await hook<string[]>(page, "(t) => t.frames('glitch').map((f) => f.畫面文字)");
    expect(pattern).toHaveLength(12);
    expect(pattern[0]).toBe('◆');
    const glitch = await exportAs(page, 'APNG');
    expect(glitch.name).toMatch(/^glitch_\d{13}\.png$/);
    const ga = parseApng(new Uint8Array(glitch.bytes));
    const gd = ga.frames.map((f) => (f.delayNum * 1000) / (f.delayDen || 100));
    expect(gd.reduce((s, d) => s + d, 0)).toBeCloseTo(11 * (1000 / 15) + 2000, 0);

    await page.getByRole('tab', { name: '卡拉 OK' }).click();
    await hook(page, "(t) => t.patch('karaoke', { fps: 10, duration: 2, intro: 0 })");
    const kara = await exportAs(page, 'APNG');
    expect(kara.name).toMatch(/^karaoke_\d{13}\.png$/);
    const ka = parseApng(new Uint8Array(kara.bytes));
    expect(ka.ihdr).toMatchObject({ width: 720, height: 300 });
    const kd = ka.frames.map((f) => (f.delayNum * 1000) / (f.delayDen || 100));
    expect(kd.reduce((s, d) => s + d, 0)).toBeCloseTo(2000 + 1500, 0);
    expect(kd.at(-1)).toBe(1500);
    expect(errors).toEqual([]);
  });

  test('片尾名單：分段匯出（每段一個檔案）與靜音 WAV', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    await page.getByRole('tab', { name: '片尾名單' }).click();
    await hook(page, "(t) => t.patch('credits', { fps: 5, duration: 4, width: 320, height: 200 })");
    await page.getByRole('radio', { name: '以空白行分成多個檔案' }).click();
    await expect(page.getByText(/目前分成 4 段/)).toBeVisible();
    /* 預覽一律是整段 */
    await expect(meta(page)).toContainText('片尾名單・320×200・5 fps・4.00 秒');

    await page.getByRole('radio', { name: 'APNG', exact: true }).click();
    await page.getByRole('button', { name: '匯出 APNG' }).click();
    const batch = page.getByTestId('export-batch');
    await expect(batch).toBeVisible({ timeout: 120_000 });
    await expect(batch).toContainText('共 4 個檔案');
    const cards = batch.getByTestId('export-result');
    await expect(cards).toHaveCount(4);
    /* 各段長度＝總時間 × 字數（去頭尾空白）÷ 全部字數（14、6、11、7，共 38）→ 7、3、5、3 格 */
    const names: string[] = [];
    for (const [i, frames] of [7, 3, 5, 3].entries()) {
      await expect(cards.nth(i)).toContainText(`${frames} 格`);
      const [d] = await Promise.all([
        page.waitForEvent('download'),
        cards.nth(i).getByRole('link', { name: '下載' }).click(),
      ]);
      names.push(d.suggestedFilename());
    }
    expect(names[0]).toMatch(/^1_—_本次冒險_—_\d{13}\.png$/);
    expect(names[1]).toMatch(/^2_主持人_\d{13}\.png$/);
    expect(names[2]).toMatch(/^3_玩家_\d{13}\.png$/);
    expect(names[3]).toMatch(/^4_感謝各位的參與_\d{13}\.png$/);

    /* 靜音 WAV：每段一個，長度＝各段長度＋延長 */
    const extra = page.getByRole('spinbutton', { name: '靜音音檔延長' });
    await extra.fill('0.5');
    await extra.press('Enter');
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await page.getByRole('button', { name: '產生靜音 WAV' }).click();
    await expect.poll(() => downloads.length, { timeout: 15_000 }).toBe(4);
    await expect(page.getByText('已下載 4 個靜音 WAV').first()).toBeVisible();
    const wavs = await Promise.all(
      downloads.map(async (d) => ({
        name: d.suggestedFilename(),
        info: parseWavInfo(readFileSync((await d.path())!)),
      })),
    );
    expect(wavs[0].name).toMatch(/^1_—_本次冒險_—_\d{13}\.wav$/);
    for (const [i, chars] of [14, 6, 11, 7].entries()) {
      expect(wavs[i].info).toMatchObject({ channels: 1, rate: 44100, bits: 16 });
      expect(wavs[i].info.samples).toBe(Math.round(((4 * chars) / 38 + 0.5) * 44100));
    }

    /* 一個檔案：silent_<時間戳>.wav，長度＝總時間＋延長 */
    await page.getByRole('radio', { name: '整段一個檔案' }).click();
    downloads.length = 0;
    await page.getByRole('button', { name: '產生靜音 WAV' }).click();
    await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(1);
    expect(downloads[0].suggestedFilename()).toMatch(/^silent_\d{13}\.wav$/);
    const one = parseWavInfo(readFileSync((await downloads[0].path())!));
    expect(one.samples).toBe(4.5 * 44100);
    expect(errors).toEqual([]);
  });

  test('打字音效：上傳、合成、試聽、下載 WAV', async ({ page }) => {
    const errors = await open(page);
    await page.getByTestId('typing-text').fill('AB 한');
    await hook(page, "(t) => t.patch('typing', { fps: 10, holdMs: 1000 })");
    await expect(page.getByRole('button', { name: '合成音效' })).toBeDisabled();
    await page
      .locator('input[type="file"][accept*="audio"]')
      .setInputFiles({ name: '嗶.wav', mimeType: 'audio/wav', buffer: beepWav() });
    await expect(page.getByText(/已載入：嗶\.wav/)).toBeVisible();

    for (const mode of ['每格都播', '不疊音']) {
      await page.getByRole('radio', { name: mode }).click();
      await page.getByRole('button', { name: '合成音效' }).click();
      await expect(page.locator('audio')).toBeVisible();
      const [d] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: '下載音效 WAV' }).click(),
      ]);
      expect(d.suggestedFilename()).toMatch(/^sound_\d{13}\.wav$/);
      const info = parseWavInfo(readFileSync((await d.path())!));
      expect(info.channels).toBe(1);
      expect(info.bits).toBe(16);
      /* 「AB 한」6 單位、10 FPS、停留 1 秒、0.25 秒的音效 → 兩種方式都是 1.6 秒 */
      expect(Math.abs(info.samples - Math.round(1.6 * info.rate))).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('存檔', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('自動儲存、專案檔、重設', async ({ page }) => {
    const errors = await open(page);
    await page.getByTestId('typing-text').fill('存檔測試');
    await page.getByRole('tab', { name: '故障' }).click();
    await expect(page.getByRole('status').filter({ hasText: '已自動儲存' })).toBeVisible();
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __typewriter?: unknown }).__typewriter,
    );
    /* 重新整理後保留設定與目前的模式 */
    await expect(page.getByRole('tab', { name: '故障' })).toHaveAttribute('aria-selected', 'true');
    expect(await hook<string>(page, '(t) => t.data().typing.text')).toBe('存檔測試');

    /* 存成專案檔 → 改掉 → 開回來 */
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^打字機動畫_\d{8}\.json$/);
    const saved = readFileSync((await download.path())!, 'utf8');
    expect(JSON.parse(saved)).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'typewriter',
      data: { typing: { text: '存檔測試' }, webp: { lossless: true, quality: 92 } },
    });
    await page.getByRole('tab', { name: '打字' }).click();
    await page.getByTestId('typing-text').fill('改掉了');
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles({
      name: '備份.json',
      mimeType: 'application/json',
      buffer: Buffer.from(saved),
    });
    await page.getByRole('button', { name: '開啟', exact: true }).click();
    await expect(page.getByTestId('typing-text')).toHaveValue('存檔測試');

    /* 重設：確認後全部回到預設 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設…' }).click();
    await page.getByRole('button', { name: '重設', exact: true }).click();
    await expect(page.getByTestId('typing-text')).toHaveValue('歡迎來到\n迷霧森林的入口。');
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await expect(counter(page)).toHaveText('13／13 格');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('typewriter-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬（手機）沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await expect(counter(page)).toHaveText('13／13 格');
    for (const tab of ['故障', '片尾名單', '卡拉 OK', '打字']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('typewriter-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    expect(errors).toEqual([]);
  });
});
