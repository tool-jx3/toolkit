/**
 * 地圖演出產生器：室內平面圖產生器送來的圖（2026-10-29，map-fx F84；共用的 core/handoff）——
 * 開頁時有交接資料就問（取消＝丟掉）、讀過一次就刪掉、過期（超過一天）的開頁時清掉不問；
 * 網址帶 #handoff=<id>（平面圖先開分頁、圖晚一點才到）時顯示「正在接收」等那一筆，等不到就通知。
 * 2026-10-29（F85、F86）：送來房間的範圍時三選一（讀入並建立房間遮罩／只讀入圖／取消）、L 形的房間遮罩（畫面、屬性的「形狀」）。
 * 從平面圖產生器實際送過來的整條路（含寫入失敗）在 floor-plan-kiin.spec.ts。
 */
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('map-fx') ?? { id: 'map-fx', status: 'next' })}/`;

async function open(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL + hash);
  await page.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
  return errors;
}

/** 直接寫一份交接資料進 IndexedDB（同 core/handoff 的格式：資料庫 trpg-toolkit:handoff、kv、鍵＝收件的工具） */
const seed = (
  page: Page,
  createdAgoMs: number,
  id?: string,
  meta: Record<string, unknown> = { gridPx: 36 },
) =>
  page.evaluate(
    async ([ago, id, meta]) => {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 80;
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      g.fillStyle = '#c33';
      g.fillRect(0, 0, 120, 80);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('trpg-toolkit:handoff');
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(
          {
            to: 'map-fx',
            from: 'floor-plan',
            name: '測試的平面圖',
            blob,
            meta,
            createdAt: Date.now() - ago,
            ...(id ? { id } : {}),
          },
          'map-fx',
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    [createdAgoMs, id ?? '', meta] as const,
  );

const pending = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('trpg-toolkit:handoff');
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const n = await new Promise<number>((resolve) => {
      const req = db.transaction('kv').objectStore('kv').count();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return n;
  });

const image = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __mapFx: { doc: () => { image: { name: string } | null } } }
      ).__mapFx.doc().image,
  );

test('取消：送來的圖丟掉、地圖不變；重新整理不會再問', async ({ page }) => {
  const errors = await open(page);
  const before = await image(page);
  await seed(page, 1000);
  await page.reload();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('測試的平面圖');
  expect(await pending(page)).toBe(0);
  await ask.getByRole('button', { name: '取消' }).click();
  await expect(ask).toHaveCount(0);
  expect(await image(page)).toEqual(before);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('讀入：換上送來的圖、「1 格幾 px」跟著改；過期的（超過一天）開頁時清掉、不問', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, 1000);
  await page.reload();
  const ask = page.getByRole('alertdialog');
  await ask.getByRole('button', { name: /讀入|取代/ }).click();
  await expect(
    page.getByText('已讀入平面圖產生器送來的「測試的平面圖」', { exact: true }),
  ).toBeVisible();
  expect(await image(page)).toMatchObject({ name: '測試的平面圖', width: 120, height: 80 });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __mapFx: { prefs: () => { grid: number } } }).__mapFx.prefs().grid,
    ),
  ).toBe(36);
  await seed(page, 25 * 60 * 60 * 1000);
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __mapFx?: unknown }).__mapFx);
  await expect.poll(() => pending(page)).toBe(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('#handoff=<id>：先顯示「正在接收」，圖晚到也讀得到；編號從網址拿掉', async ({ page }) => {
  const errors = await open(page, '#handoff=late-1');
  await expect(page.getByTestId('handoff-waiting')).toContainText('正在接收平面圖產生器送來的圖');
  expect(await page.evaluate(() => location.hash)).toBe('');
  /* 別的編號的不算 */
  await seed(page, 0, 'someone-else');
  await page.waitForTimeout(800);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await seed(page, 0, 'late-1');
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('測試的平面圖');
  await expect(page.getByTestId('handoff-waiting')).toHaveCount(0);
  await ask.getByRole('button', { name: /讀入|取代/ }).click();
  await expect(
    page.getByText('已讀入平面圖產生器送來的「測試的平面圖」', { exact: true }),
  ).toBeVisible();
  expect(await image(page)).toMatchObject({ name: '測試的平面圖', width: 120, height: 80 });
  expect(errors).toEqual([]);
});

test('#handoff=<id>：手機寬一開頁就看得到「正在接收」；沒有平面圖回應，約 10 秒後通知沒有收到、不問', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await open(page, '#handoff=nobody');
  await expect(page.getByTestId('handoff-waiting')).toBeVisible();
  await expect(page.getByTestId('handoff-waiting')).toBeInViewport({ ratio: 1 });
  await expect(page.getByText('沒有收到平面圖送來的圖', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('handoff-waiting')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ---------- 房間的範圍（2026-10-29，F85、F86） ---------- */

/** 120 × 80 的圖上的三間房：L 形的客廳、書房（在客廳的缺角裡）、GM 專用的密室 */
const ROOMS = {
  gridPx: 20,
  rooms: {
    width: 120,
    height: 80,
    list: [
      { name: '客廳', x: 0, y: 0, w: 80, h: 60, cut: { c: 'ne', w: 40, h: 30 } },
      { name: '書房', x: 40, y: 0, w: 40, h: 30 },
      { name: '密室', x: 80, y: 0, w: 40, h: 60, gm: true },
    ],
  },
};

type FxFrame = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  mode: string;
  style: string;
  /** L 形的缺角（外框的比例） */
  cut?: { c: string; w: number; h: number };
};
const frames = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __mapFx: { doc: () => { frames: FxFrame[] } } }).__mapFx.doc().frames,
  );

test('送來房間的範圍：讀入並建立房間遮罩（L 形帶缺角、GM 專用的一直蓋著不寫房名）；一步復原；缺角裡露出地圖', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, 1000, undefined, ROOMS);
  await page.reload();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('平面圖帶來 3 間房間的範圍與名字');
  await expect(ask.getByRole('button')).toHaveText(['取消', '只讀入圖', '讀入並建立 3 個房間遮罩']);
  await ask.getByRole('button', { name: '讀入並建立 3 個房間遮罩' }).click();
  await expect(
    page.getByText('已讀入平面圖產生器送來的「測試的平面圖」', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^照平面圖的房間範圍與名字建立了 3 個房間遮罩。/)).toBeVisible();
  const fs = await frames(page);
  expect(fs.map((f) => [f.label, f.x, f.y, f.w, f.h, f.mode, f.cut ?? null])).toEqual([
    ['客廳', 0, 0, 80, 60, 'reveal', { c: 'ne', w: 0.5, h: 0.5 }],
    ['書房', 40, 0, 40, 30, 'reveal', null],
    ['', 80, 0, 40, 60, 'static', null],
  ]);
  /* 一直蓋著的時候（t＝0）：L 形裡是遮罩、缺角裡（書房的位置）的書房也還蓋著；把書房拿掉之後缺角露出地圖 */
  const px = (pts: [number, number][]) =>
    page.evaluate(
      (pts) =>
        (
          window as unknown as {
            __mapFx: { pixels: (t: number, p: [number, number][]) => Promise<number[][]> };
          }
        ).__mapFx.pixels(0, pts),
      pts,
    );
  await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __mapFx: { set: (p: unknown) => void; doc: () => { frames: FxFrame[] } };
        }
      ).__mapFx.set({
        frames: (window as unknown as { __mapFx: { doc: () => { frames: FxFrame[] } } }).__mapFx
          .doc()
          .frames.filter((f) => f.id !== id),
      }),
    fs[1].id,
  );
  const layout = await page.evaluate(
    () =>
      (
        window as unknown as {
          __mapFx: { layout: () => { shot: { x: number; y: number; f: number } } };
        }
      ).__mapFx.layout().shot,
  );
  const at = (x: number, y: number): [number, number] => [
    layout.x + x * layout.f,
    layout.y + y * layout.f,
  ];
  const [cut, inside] = await px([at(70, 10), at(10, 50)]);
  /* 缺角裡是地圖（紅）、L 形裡是黑暗的遮罩 */
  expect(cut[0]).toBeGreaterThan(150);
  expect(cut[1]).toBeLessThan(90);
  expect(inside[0]).toBeLessThan(40);
  /* 換圖＋建立遮罩是同一步：復原兩次（拿掉書房、讀入）回到沒有圖 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await frames(page)).length).toBe(3);
  await page.keyboard.press('Control+z');
  await expect.poll(() => image(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('送來房間的範圍：只讀入圖（不建立遮罩）；取消照樣丟掉', async ({ page }) => {
  const errors = await open(page);
  await seed(page, 1000, undefined, ROOMS);
  await page.reload();
  const ask = page.getByRole('alertdialog');
  await ask.getByRole('button', { name: '只讀入圖' }).click();
  await expect(
    page.getByText('已讀入平面圖產生器送來的「測試的平面圖」', { exact: true }),
  ).toBeVisible();
  expect(await image(page)).toMatchObject({ name: '測試的平面圖', width: 120, height: 80 });
  expect(await frames(page)).toEqual([]);
  /* 已經有圖：按鈕改成「取代」；取消＝丟掉 */
  await seed(page, 1000, undefined, ROOMS);
  await page.reload();
  await expect(page.getByRole('alertdialog').getByRole('button')).toHaveText([
    '取消',
    '只取代地圖',
    '取代並建立 3 個房間遮罩',
  ]);
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await pending(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('L 形的房間遮罩：框的設定「形狀」改成長方形、換缺角、缺角的寬；清單的摘要寫 L 形；復原', async ({
  page,
}) => {
  const errors = await open(page);
  await seed(page, 1000, undefined, ROOMS);
  await page.reload();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '讀入並建立 3 個房間遮罩' })
    .click();
  await expect.poll(async () => (await frames(page)).length).toBe(3);
  await page.getByRole('tab', { name: '演出框' }).click();
  const list = page.getByTestId('frame-list');
  await expect(list.locator('li').nth(0)).toContainText('黑暗・揭開・淡出・L 形・客廳');
  await list.locator('li').nth(0).getByRole('button').first().click();
  const editor = page.getByTestId('frame-editor');
  const shape = editor.getByRole('combobox', { name: '形狀' });
  await expect(shape).toHaveText('L 形（缺右上角）');
  await shape.click();
  await expect(page.getByRole('option')).toHaveText([
    '長方形',
    'L 形（缺左上角）',
    'L 形（缺右上角）',
    'L 形（缺右下角）',
    'L 形（缺左下角）',
  ]);
  await page.getByRole('option', { name: 'L 形（缺左下角）' }).click();
  await expect.poll(async () => (await frames(page))[0].cut).toEqual({ c: 'sw', w: 0.5, h: 0.5 });
  /* 缺角的寬：25% */
  const w = editor.getByRole('spinbutton', { name: '缺角的寬' });
  await w.fill('25');
  await w.press('Enter');
  await expect.poll(async () => (await frames(page))[0].cut).toEqual({ c: 'sw', w: 0.25, h: 0.5 });
  await shape.click();
  await page.getByRole('option', { name: '長方形' }).click();
  await expect.poll(async () => (await frames(page))[0].cut).toBeUndefined();
  await expect(editor.getByRole('spinbutton', { name: '缺角的寬' })).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await frames(page))[0].cut).toEqual({ c: 'sw', w: 0.25, h: 0.5 });
  expect(errors).toEqual([]);
});
