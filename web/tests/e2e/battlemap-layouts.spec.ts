/**
 * 戰鬥地圖產生器 2026-10-30 追加（規格 F29～F43）的端對端測試：
 * 格局（生成法）與參數（種子不變、地圖資訊）、地圖尺寸與每格 px（畫布、匯出檔名與尺寸）、
 * 預設設定匯出的 PNG 與改版前逐位元組相同、瀏覽器與 Node 的繪製逐像素相同（非預設設定）、
 * 記住格局設定、重設、大地圖的生成與繪製時間（@serial）。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('battlemap') ?? { id: 'battlemap', status: 'next' })}/`;

/**
 * 改版前（commit 0292848）的程式在 Node 匯出的 PNG 檔的 FNV-1a 雜湊（種子 123456789、石砌地城、格線與火光開；
 * tests/unit/battlemap-compat.test.ts 的同一組資料）。
 */
const OLD_PNG_FILE_HASH = 726338043;
/** tests/unit/battlemap-generators.test.ts 的 FIXED_LAYOUT_HASHES */
const NODE_HASH = { cave: 3134756345, maze: 903714816 };

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL + query);
  await expect(page.getByRole('heading', { level: 1, name: '戰鬥地圖產生器' })).toBeVisible();
  await expect(page.getByTestId('map-seed')).not.toBeEmpty();
  return errors;
}

function fnv(bytes: ArrayLike<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619);
  return h >>> 0;
}

const canvas = (page: Page) => page.getByTestId('battlemap-canvas');
const canvasHash = (page: Page) =>
  canvas(page).evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
    return h >>> 0;
  });
const canvasSize = (page: Page) =>
  canvas(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
const seedOf = async (page: Page) => Number(await page.getByTestId('map-seed').textContent());

/** 大地圖畫好（沒有「正在產生」） */
const settled = async (page: Page, timeout = 30_000) => {
  await expect(canvas(page)).not.toHaveAttribute('data-pending', 'true', { timeout });
};

/** 畫面上的地圖已經是這個尺寸（尺寸說明跟著畫好的那一張；大地圖畫好之前是上一張的） */
async function shownSize(page: Page, cols: number, rows: number, px: number) {
  await expect(page.getByTestId('map-size-note')).toHaveText(
    `${cols * px} × ${rows * px} px（${cols} × ${rows} 格，每格 ${px} px）`,
    { timeout: 30_000 },
  );
  await settled(page);
  expect(await canvasSize(page)).toEqual([cols * px, rows * px]);
}

const generator = (page: Page, name: string) =>
  page.getByRole('radio', { name, exact: true }).click();

/** 數字欄打數字後按 Enter（確定時才套用） */
async function setNumber(page: Page, label: string, value: number) {
  const box = page.getByRole('spinbutton', { name: label, exact: true });
  await box.fill(String(value));
  await box.press('Enter');
  await expect(box).toHaveValue(String(value));
}

function decodePng(bytes: Buffer) {
  const chunks = parseChunks(new Uint8Array(bytes));
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
  const z = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let o = 0;
  for (const d of idat) {
    z.set(d, o);
    o += d.length;
  }
  return { ...ihdr, px: decodePixels(z, ihdr.width, ihdr.height, ihdr.colorType) };
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('預設設定：匯出的 PNG 檔和改版前逐位元組相同；地圖資訊有格局與尺寸', async ({ page }) => {
  const errors = await open(page, '?seed=123456789');
  await expect(page.getByTestId('map-generator')).toHaveText('房間＋走道');
  await expect(page.getByTestId('map-size')).toHaveText('22 × 16 格');
  await expect(page.getByTestId('map-size-note')).toHaveText(
    '1540 × 1120 px（22 × 16 格，每格 70 px）',
  );
  await expect(page.getByRole('radio', { name: '房間＋走道' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('radio', { name: '70 px' })).toHaveAttribute('aria-checked', 'true');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '匯出 PNG' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('battlemap_dungeon_123456789.png');
  expect(fnv(readFileSync(await download.path()))).toBe(OLD_PNG_FILE_HASH);
  expect(errors).toEqual([]);
});

test('格局：換格局與參數時種子不變、地圖換；參數依格局出現；天然洞窟與迷宮沒有房間數', async ({
  page,
}) => {
  const errors = await open(page, '?seed=777');
  const h0 = await canvasHash(page);
  await expect(page.getByRole('radio', { name: '少', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '填充率' })).toHaveCount(0);

  await generator(page, '挖掘式');
  await expect(page.getByTestId('map-generator')).toHaveText('挖掘式');
  expect(await seedOf(page)).toBe(777);
  await expect(page.getByTestId('map-rooms')).toHaveText(/^\d+ 間$/);
  expect(await canvasHash(page)).not.toBe(h0);

  /* 密度：同一個種子，換密度地圖就換 */
  const hDigger = await canvasHash(page);
  await page.getByRole('radio', { name: '多', exact: true }).click();
  await expect(page.getByRole('radio', { name: '多', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(await canvasHash(page)).not.toBe(hDigger);
  expect(await seedOf(page)).toBe(777);

  for (const name of ['均勻房間', '格狀房間']) {
    await generator(page, name);
    await expect(page.getByTestId('map-generator')).toHaveText(name);
    await expect(page.getByTestId('map-rooms')).toHaveText(/^\d+ 間$/);
  }

  await generator(page, '天然洞窟');
  await expect(page.getByTestId('map-generator')).toHaveText('天然洞窟');
  await expect(page.getByTestId('map-rooms')).toHaveText('—');
  await expect(page.getByRole('radio', { name: '少', exact: true })).toHaveCount(0);
  const hCave = await canvasHash(page);
  await setNumber(page, '填充率', 55);
  expect(await canvasHash(page)).not.toBe(hCave);
  const hFill = await canvasHash(page);
  await setNumber(page, '平滑次數', 1);
  expect(await canvasHash(page)).not.toBe(hFill);
  expect(await seedOf(page)).toBe(777);

  await generator(page, '迷宮');
  await expect(page.getByTestId('map-rooms')).toHaveText('—');
  const hMaze = await canvasHash(page);
  await page.getByRole('radio', { name: '蜿蜒' }).click();
  expect(await canvasHash(page)).not.toBe(hMaze);
  const hIcey = await canvasHash(page);
  await page.getByRole('radio', { name: '3 格' }).click();
  expect(await canvasHash(page)).not.toBe(hIcey);

  /* 換地形照舊換種子，格局不變 */
  await page.getByRole('radio', { name: '墓室' }).click();
  await expect(page.getByTestId('map-seed')).not.toHaveText('777');
  await expect(page.getByTestId('map-generator')).toHaveText('迷宮');
  /* G 鍵照舊換種子 */
  const s = await seedOf(page);
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('g');
  await expect(page.getByTestId('map-seed')).not.toHaveText(String(s));
  expect(errors).toEqual([]);
});

test('瀏覽器畫出來的像素與 Node 端相同（天然洞窟 30 × 20 格 50 px；迷宮 25 × 19 格 100 px）', async ({
  page,
}) => {
  /* 格局設定會記住，所以先設好再用網址的固定種子重開（開頁的地形一定是石砌地城） */
  const errors = await open(page);
  await generator(page, '天然洞窟');
  await setNumber(page, '欄數', 30);
  await setNumber(page, '列數', 20);
  await page.getByRole('radio', { name: '50 px' }).click();
  await page.goto(`${URL}?seed=777`);
  await expect(page.getByTestId('map-seed')).toHaveText('777');
  await expect(page.getByTestId('map-generator')).toHaveText('天然洞窟');
  await shownSize(page, 30, 20, 50);
  expect(await canvasHash(page)).toBe(NODE_HASH.cave);

  await generator(page, '迷宮');
  await page.getByRole('radio', { name: 'Eller 法' }).click();
  await page.getByRole('radio', { name: '3 格' }).click();
  await setNumber(page, '欄數', 25);
  await setNumber(page, '列數', 19);
  await page.getByRole('radio', { name: '100 px' }).click();
  await page.goto(`${URL}?seed=4242`);
  await expect(page.getByTestId('map-seed')).toHaveText('4242');
  await shownSize(page, 25, 19, 100);
  await page.getByRole('switch', { name: '火光' }).click();
  await expect(page.getByRole('switch', { name: '火光' })).toHaveAttribute('aria-checked', 'false');
  await settled(page);
  expect(await canvasHash(page)).toBe(NODE_HASH.maze);
  expect(errors).toEqual([]);
});

test('尺寸與每格 px：畫布、地圖資訊、匯出的檔名與內容；換成 100 px 時欄列數夾到 40 格', async ({
  page,
}) => {
  const errors = await open(page, '?seed=4242');
  await generator(page, '迷宮');
  await setNumber(page, '欄數', 25);
  await setNumber(page, '列數', 19);
  await page.getByRole('radio', { name: '100 px' }).click();
  await shownSize(page, 25, 19, 100);
  expect(await seedOf(page)).toBe(4242);
  await expect(page.getByTestId('map-size')).toHaveText('25 × 19 格');
  await expect(page.getByText('每格 100 px 的半透明格線')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '匯出 PNG' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('battlemap_dungeon_4242_maze_25x19_100px.png');
  const png = decodePng(readFileSync(await download.path()));
  expect([png.width, png.height, png.bitDepth, png.colorType]).toEqual([2500, 1900, 8, 6]);
  expect(fnv(png.px)).toBe(await canvasHash(page));

  /* 欄數 58（70 px 的上限）→ 換成 100 px 夾到 40 */
  await page.getByRole('radio', { name: '70 px' }).click();
  await setNumber(page, '欄數', 58);
  await shownSize(page, 58, 19, 70);
  await page.getByRole('radio', { name: '100 px' }).click();
  const clampNotice = page.getByText('每格 100 px 時每邊最多 40 格，已改成 40 × 19 格。');
  await expect(clampNotice).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '欄數' })).toHaveValue('40');
  await shownSize(page, 40, 19, 100);
  /* 夾小的通知：重新產生時留著，下一次改格局設定時清掉（2026-10-30 驗證後） */
  await page.getByRole('button', { name: '重新產生' }).click();
  await expect(clampNotice).toBeVisible();
  await page.getByRole('radio', { name: '蜿蜒' }).click();
  await expect(clampNotice).toHaveCount(0);
  /* 超出範圍的輸入夾回範圍 */
  await page.getByRole('spinbutton', { name: '列數' }).fill('3');
  await page.getByRole('spinbutton', { name: '列數' }).press('Enter');
  await expect(page.getByRole('spinbutton', { name: '列數' })).toHaveValue('10');
  await shownSize(page, 40, 10, 100);
  expect(errors).toEqual([]);
});

test('記住格局設定：重新整理後格局、參數、尺寸還在，地形、格線、火光回到預設；重設回到預設', async ({
  page,
}) => {
  const errors = await open(page);
  await generator(page, '天然洞窟');
  await setNumber(page, '填充率', 40);
  await setNumber(page, '欄數', 30);
  await page.getByRole('radio', { name: '50 px' }).click();
  await page.getByRole('radio', { name: '墓室' }).click();
  await page.getByRole('switch', { name: '格線' }).click();
  const stored = await page.evaluate(() => localStorage.getItem('trpg-toolkit:battlemap'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({
    version: 1,
    state: { data: { generator: 'cave', caveFill: 40, cols: 30, cellPx: 50 } },
  });
  await page.reload();
  await expect(page.getByTestId('map-seed')).not.toBeEmpty();
  await expect(page.getByTestId('map-generator')).toHaveText('天然洞窟');
  await expect(page.getByRole('spinbutton', { name: '填充率' })).toHaveValue('40');
  await shownSize(page, 30, 16, 50);
  await expect(page.getByTestId('map-terrain')).toHaveText('石砌地城');
  await expect(page.getByRole('switch', { name: '格線' })).toHaveAttribute('aria-checked', 'true');

  /* 壞掉的存檔：整理成合法的值 */
  await page.evaluate(() =>
    localStorage.setItem(
      'trpg-toolkit:battlemap',
      JSON.stringify({ state: { data: { generator: 'x', cols: 999, cellPx: 64 } }, version: 1 }),
    ),
  );
  await page.reload();
  await expect(page.getByTestId('map-generator')).toHaveText('房間＋走道');
  await expect(page.getByTestId('map-size')).toHaveText('58 × 16 格');

  await page.getByRole('button', { name: '重設格局與尺寸' }).click();
  await shownSize(page, 22, 16, 70);
  await expect(page.getByRole('button', { name: '重設格局與尺寸' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('390 寬：格局與尺寸的控制項沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page);
  await generator(page, '迷宮');
  await setNumber(page, '欄數', 40);
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw).toBeLessThanOrEqual(cw);
  expect(errors).toEqual([]);
});

/** 開始記錄主執行緒的長工作（> 50 ms）；回傳讀取「最長一段」的函式 */
async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[]; __obs?: PerformanceObserver };
    w.__obs?.disconnect();
    w.__long = [];
    w.__obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    });
    w.__obs.observe({ type: 'longtask' });
  });
  return () =>
    page.evaluate(() =>
      Math.round(Math.max(0, ...(window as unknown as { __long: number[] }).__long)),
    );
}

type Timing = { __t0: number; __t1: number; __mo?: MutationObserver };

/**
 * 在頁面裡量：按下（pointerdown／keydown）到大地圖畫好（畫布的 data-pending 拿掉、已經畫上畫布）。
 * 不用 Playwright 的輪詢量（輪詢的間隔越拉越長，量出來都是 1、2 秒）。
 * 連續操作時中途可能拿掉又加上好幾次（例如換回正在顯示的那一張）：記最後一次拿掉的時間，
 * 給了 done 就等它（例如「格局變成最後點的那一個」）之後才讀。
 */
async function timeToDrawn(
  page: Page,
  act: () => Promise<void>,
  done?: () => Promise<void>,
): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as Timing;
    w.__t0 = 0;
    w.__t1 = 0;
    const start = () => {
      if (!w.__t0) w.__t0 = performance.now();
    };
    addEventListener('pointerdown', start, { capture: true, once: true });
    addEventListener('keydown', start, { capture: true, once: true });
    const c = document.querySelector('[data-testid="battlemap-canvas"]') as Element;
    let seen = false;
    w.__mo?.disconnect();
    w.__mo = new MutationObserver(() => {
      if (c.hasAttribute('data-pending')) seen = true;
      else if (seen) w.__t1 = performance.now();
    });
    w.__mo.observe(c, { attributes: true, attributeFilter: ['data-pending'] });
  });
  await act();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Timing).__t1), {
      timeout: 60_000,
      intervals: [50],
    })
    .toBeGreaterThan(0);
  if (done) {
    await done();
    await settled(page);
  }
  return page.evaluate(() => {
    const w = window as unknown as Timing;
    w.__mo?.disconnect();
    return Math.round(w.__t1 - w.__t0);
  });
}

test('大地圖的生成與繪製時間（最大尺寸）', { tag: '@serial' }, async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors = await open(page, '?seed=20261030');
  const results: string[] = [];
  /* 參考：預設尺寸（同步畫）重新產生 5 次 */
  const base: number[] = [];
  for (let i = 0; i < 5; i++) {
    const seed = (await page.getByTestId('map-seed').textContent()) ?? '';
    const longest = await watchLongTasks(page);
    await page.getByRole('button', { name: '重新產生' }).click();
    await expect(page.getByTestId('map-seed')).not.toHaveText(seed);
    base.push(await longest());
  }
  base.sort((a, b) => a - b);
  results.push(
    `22 × 16 格、每格 70 px（預設，主執行緒同步畫）｜重新產生：主執行緒最長 ${base[2]} ms（5 次的中位數）`,
  );
  for (const [px, n] of [
    [70, 58],
    [100, 40],
    [50, 60],
  ] as const) {
    await generator(page, '房間＋走道');
    await page.getByRole('radio', { name: `${px} px` }).click();
    await setNumber(page, '欄數', n);
    await setNumber(page, '列數', n);
    await shownSize(page, n, n, px);
    const size = `${n} × ${n} 格、每格 ${px} px（${n * px} × ${n * px} px）`;
    /* 換格局：在 Worker 裡產生格局＋畫底圖＋疊火光與格線（同一個種子），畫上畫布 */
    for (const name of ['天然洞窟', '迷宮', '挖掘式', '均勻房間', '格狀房間', '房間＋走道']) {
      const longest = await watchLongTasks(page);
      const ms = await timeToDrawn(page, async () => {
        await generator(page, name);
        /* 畫好之前顯示「正在產生」（最大尺寸要畫一秒左右，來得及看到） */
        if (name === '天然洞窟') {
          await expect(page.getByTestId('map-pending')).toHaveText(
            `正在產生 ${n} × ${n} 格的地圖…`,
          );
        }
      });
      await expect(page.getByTestId('map-generator')).toHaveText(name);
      results.push(`${size}｜${name}：${ms} ms（主執行緒最長 ${await longest()} ms）`);
    }
    /* 重新產生（換種子） */
    const longest = await watchLongTasks(page);
    const regen = await timeToDrawn(page, () =>
      page.getByRole('button', { name: '重新產生' }).click(),
    );
    results.push(`${size}｜重新產生：${regen} ms（主執行緒最長 ${await longest()} ms）`);
    /* 只切換火光（格局與底圖在 Worker 的快取裡，不重算） */
    const lightOff = await timeToDrawn(page, () =>
      page.getByRole('switch', { name: '火光' }).click(),
    );
    const lightOn = await timeToDrawn(page, () =>
      page.getByRole('switch', { name: '火光' }).click(),
    );
    results.push(`${size}｜火光關、開：${lightOff}、${lightOn} ms`);
    /* 匯出（在 Worker 裡編碼） */
    const t2 = Date.now();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.getByRole('button', { name: '匯出 PNG' }).click(),
    ]);
    const bytes = readFileSync(await download.path());
    const exportMs = Date.now() - t2;
    const { width, height } = readIhdr(parseChunks(new Uint8Array(bytes)));
    expect([width, height]).toEqual([n * px, n * px]);
    results.push(`${size}｜匯出 PNG：${exportMs} ms，${(bytes.length / 1e6).toFixed(1)} MB`);
  }
  info.annotations.push({ type: '大地圖', description: results.join('\n') });
  console.log(results.join('\n'));
  expect(errors).toEqual([]);
});

/** 數 Worker 收到的 draw 呼叫（Comlink 每次呼叫送一個訊息） */
const countWorkerPosts = (page: Page) =>
  page.addInitScript(() => {
    const W = window.Worker;
    const w = window as unknown as { __posted: number };
    w.__posted = 0;
    window.Worker = class extends W {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        const post = this.postMessage.bind(this) as (...a: unknown[]) => void;
        this.postMessage = ((...a: unknown[]) => {
          w.__posted++;
          post(...a);
        }) as Worker['postMessage'];
      }
    };
  });
const workerPosts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __posted: number }).__posted);

test(
  '大地圖：連續換設定只畫最新的一筆（連點 13 下、按住欄數 ↑ 18 下），畫好的和直接開同一組設定相同',
  { tag: '@serial' },
  async ({ page, context }, info) => {
    test.setTimeout(180_000);
    await countWorkerPosts(page);
    const errors = await open(page, '?seed=777');
    await setNumber(page, '欄數', 58);
    await setNumber(page, '列數', 58);
    await shownSize(page, 58, 58, 70);
    /* 連點 13 下格局（兩輪，最後是迷宮）：直接點座標，不等每一下畫好 */
    const names = ['房間＋走道', '挖掘式', '均勻房間', '格狀房間', '天然洞窟', '迷宮'];
    const boxes = new Map<string, { x: number; y: number }>();
    for (const n of names) {
      const b = await page.getByRole('radio', { name: n, exact: true }).boundingBox();
      if (b) boxes.set(n, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
    const posted0 = await workerPosts(page);
    const clicks = await timeToDrawn(
      page,
      async () => {
        for (const n of [...names, ...names.slice().reverse(), '迷宮']) {
          const b = boxes.get(n) as { x: number; y: number };
          await page.mouse.click(b.x, b.y);
        }
      },
      () => expect(page.getByTestId('map-generator')).toHaveText('迷宮'),
    );
    const clickPosts = (await workerPosts(page)) - posted0;
    /* 正在畫的那一張＋最新的一張 */
    expect(clickPosts).toBeLessThanOrEqual(3);
    const hash = await canvasHash(page);
    /* 同一組設定直接開（設定記在 localStorage，同一個 context 共用）：畫出來的一樣 */
    const other = await context.newPage();
    await other.goto(`${URL}?seed=777`);
    await expect(other.getByTestId('map-generator')).toHaveText('迷宮');
    await settled(other);
    expect(await canvasHash(other)).toBe(hash);
    await other.close();

    /* 40 × 40 格按住欄數 ↑ 18 下（每一下都確定一次） */
    await setNumber(page, '欄數', 40);
    await setNumber(page, '列數', 40);
    await shownSize(page, 40, 40, 70);
    const box = page.getByRole('spinbutton', { name: '欄數', exact: true });
    await box.focus();
    const posted1 = await workerPosts(page);
    const arrows = await timeToDrawn(
      page,
      async () => {
        for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowUp');
      },
      () => shownSize(page, 58, 40, 70),
    );
    const arrowPosts = (await workerPosts(page)) - posted1;
    expect(arrowPosts).toBeLessThanOrEqual(3);
    const line = `連點 13 下（58 × 58 格）：按下第一下到畫好最後一張 ${clicks} ms、送進 Worker ${clickPosts} 次｜按住 ↑ 18 下（40 → 58 × 40 格）：${arrows} ms、送進 Worker ${arrowPosts} 次`;
    info.annotations.push({ type: '只畫最新的一筆', description: line });
    console.log(line);
    expect(errors).toEqual([]);
  },
);

test('大地圖：畫的途中按匯出或 D，畫好後自動匯出畫好的那一張', { tag: '@serial' }, async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await open(page, '?seed=4242');
  await setNumber(page, '欄數', 58);
  await setNumber(page, '列數', 58);
  await shownSize(page, 58, 58, 70);
  /* 換格局（要畫一秒左右）後馬上按匯出鈕 */
  await generator(page, '天然洞窟');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    (async () => {
      await page.getByRole('button', { name: '匯出 PNG' }).click();
      await expect(page.getByText('地圖畫好後就匯出 PNG…')).toBeVisible();
    })(),
  ]);
  await settled(page);
  expect(download.suggestedFilename()).toBe('battlemap_dungeon_4242_cavern_58x58_70px.png');
  const png = decodePng(readFileSync(await download.path()));
  expect([png.width, png.height]).toEqual([4060, 4060]);
  expect(fnv(png.px)).toBe(await canvasHash(page));
  await expect(page.getByRole('status').filter({ hasText: '已匯出' })).toBeVisible();

  /* 焦點在頁面空白處：G 換種子（大地圖要畫一陣子）後馬上按 D */
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  const before = (await page.getByTestId('map-seed').textContent()) ?? '';
  await page.keyboard.press('g');
  const [d2] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.keyboard.press('d'),
  ]);
  await settled(page);
  const seed = (await page.getByTestId('map-seed').textContent()) ?? '';
  expect(seed).not.toBe(before);
  expect(d2.suggestedFilename()).toBe(`battlemap_dungeon_${seed}_cavern_58x58_70px.png`);
  expect(fnv(decodePng(readFileSync(await d2.path())).px)).toBe(await canvasHash(page));
  expect(errors).toEqual([]);
});
