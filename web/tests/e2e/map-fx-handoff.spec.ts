/**
 * 地圖演出產生器：室內平面圖產生器送來的圖（2026-10-29，map-fx F84；共用的 core/handoff）——
 * 開頁時有交接資料就問（取消＝丟掉）、讀過一次就刪掉、過期（超過一天）的開頁時清掉不問；
 * 網址帶 #handoff=<id>（平面圖先開分頁、圖晚一點才到）時顯示「正在接收」等那一筆，等不到就通知。
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
const seed = (page: Page, createdAgoMs: number, id?: string) =>
  page.evaluate(
    async ([ago, id]) => {
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
            meta: { gridPx: 36 },
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
    [createdAgoMs, id ?? ''] as const,
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

test('#handoff=<id>：沒有平面圖回應，約 10 秒後通知沒有收到、不問', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await open(page, '#handoff=nobody');
  await expect(page.getByTestId('handoff-waiting')).toBeVisible();
  await expect(page.getByText('沒有收到平面圖送來的圖', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('handoff-waiting')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});
