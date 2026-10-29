/**
 * 劇本時間表（建置產物 next/scenario-timeline/）的端對端測試：
 * - 開頁：範例、列、刻度、旗子、沒有 pageerror／console error；頁尾只放靈感來源。
 * - 時間軸：拖曳移動（吸附、換泳道、Esc 取消）、拖兩端改長短、鍵盤（←→↑↓、Shift、Delete）、雙擊新增、
 *   滾輪縮放、拖曳平移、縮放按鈕與全覽、收合泳道、標記拖曳。
 * - 事件分頁：新增、改標題、時間欄的解讀與錯誤、種類、複製、刪除與復原。
 * - 時間寫法：換成第 N 天（換算）、架空年的曆名。
 * - GM／PL：P 鍵、拿掉的東西、PL 檢視不能改資料、PL 版只到目前進度。
 * - 年表：檢視切換、分段、點選、複製成文字、列印文件。
 * - 匯出：PNG（尺寸）、SVG、文字／Markdown、CSV 匯出與貼上讀入、專案檔的存與開。
 * - 390 寬預設年表、沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('scenario-timeline') ?? { id: 'scenario-timeline', status: 'next' })}/`;
const STORE_KEY = 'trpg-toolkit:scenario-timeline';
const PREFS_KEY = 'trpg-toolkit:scenario-timeline:preview';

interface Ev {
  id: string;
  title: string;
  kind: string;
  start: string;
  end: string;
  laneId: string;
  gm: boolean;
  gmNote: string;
}
interface Doc {
  title: string;
  mode: string;
  era: string;
  events: Ev[];
  lanes: { id: string; name: string; parentId: string; gm: boolean }[];
  markers: { id: string; label: string; time: string }[];
  progress: { on: boolean; time: string; plOnly: boolean };
}

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
  await expect(page.getByRole('heading', { level: 1, name: '劇本時間表' })).toBeVisible();
  return errors;
}

const docOf = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __scenarioTimeline: { doc: () => Doc } }).__scenarioTimeline.doc(),
  );
const winOf = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __scenarioTimeline: { win: () => { start: number; end: number } } }
    ).__scenarioTimeline.win(),
  );
const evOf = async (page: Page, id: string) => (await docOf(page)).events.find((e) => e.id === id);
const item = (page: Page, id: string) =>
  page.getByTestId('timeline').locator(`[data-event-id="${id}"]`);
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const blankEvent = {
  kind: 'point',
  end: '',
  laneId: '',
  place: '',
  people: [],
  categoryId: '',
  color: '',
  gm: false,
  description: '',
  gmNote: '',
};

/** 第 N 天的小專案：甲（第 1 天 10:00，泳道甲）、乙（12:00～14:00，泳道乙） */
const DAY_DOC = {
  title: '測試劇本',
  mode: 'day',
  era: '',
  dayOne: '',
  sample: false,
  showNow: false,
  lanes: [
    { id: 'l1', name: '泳道甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
    { id: 'l2', name: '泳道乙', kind: 'npc', color: '#e0565b', parentId: '', gm: false },
  ],
  categories: [],
  events: [
    { ...blankEvent, id: 'a', title: '事件甲', start: '第 1 天 10:00', laneId: 'l1' },
    {
      ...blankEvent,
      id: 'b',
      title: '事件乙',
      kind: 'range',
      start: '第 1 天 12:00',
      end: '第 1 天 14:00',
      laneId: 'l2',
    },
    {
      ...blankEvent,
      id: 'bg',
      title: '暴風雨',
      kind: 'background',
      start: '第 1 天 17:00',
      end: '第 1 天 22:00',
    },
  ],
  markers: [{ id: 'm1', label: '鐘響', time: '第 1 天 16:00', color: '#8a63d2', gm: false }],
  progress: { on: false, time: '', plOnly: false },
};

/** 開頁前放好資料（只放一次；重新整理不會蓋掉） */
async function seed(page: Page, data: object, prefs?: object) {
  await page.addInitScript(
    ([k, v, pk, pv]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(k, v);
      if (pv) localStorage.setItem(pk, pv);
    },
    [
      STORE_KEY,
      JSON.stringify({ state: { data }, version: 1 }),
      PREFS_KEY,
      prefs ? JSON.stringify({ state: { data: prefs }, version: 1 }) : '',
    ],
  );
}

/** 第 1 天整天的畫面範圍：每小時約 28 px → 下排 2 小時一格、吸附 1 小時 */
const DAY_WINDOW = { windows: { day: { start: 0, end: 1440 } } };

async function trackGeometry(page: Page) {
  const box = await page.getByTestId('track').boundingBox();
  if (!box) throw new Error('no track');
  const w = await winOf(page);
  return { box, k: box.width / (w.end - w.start), w };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** 把檔案拖進視窗（WindowDrop） */
async function dropFiles(page: Page, files: { name: string; type: string; text: string }[]) {
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([f.text], f.name, { type: f.type }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, files);
}

const center = async (loc: Locator) => {
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};

test('開頁：範例、列、刻度、旗子；頁尾只放靈感來源', async ({ page }) => {
  const errors = await open(page);
  const tl = page.getByTestId('timeline');
  await expect(tl).toBeVisible();
  await expect(page.getByTestId('sample-note')).toBeVisible();
  const rows = tl.locator('[data-lane-row]');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toContainText('主線');
  await expect(tl.locator('[data-lane-row="cult"]')).toHaveAttribute('data-secret', 'true');
  await expect(item(page, 'ex-arrive')).toBeVisible();
  await expect(item(page, 'ex-fog')).toHaveAttribute('data-kind', 'background');
  await expect(tl.locator('[data-flag="progress"]')).toHaveText('目前進度');
  await expect(tl.locator('[data-flag="marker"]')).toHaveCount(2);
  await expect(tl.locator('[data-axis-major]').first()).toHaveText('1925年3月');
  /* 全覽：最後的時間點的標題在畫面裡 */
  const track = await page.getByTestId('track').boundingBox();
  const train = await item(page, 'ex-train').boundingBox();
  expect(train && track && train.x + train.width).toBeLessThanOrEqual(
    (track?.x ?? 0) + (track?.width ?? 0) + 1,
  );
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源：visjs/vis-timeline');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/visjs/vis-timeline',
  );
  expect(errors).toEqual([]);
});

test('拖曳：左右改時間（吸附）、上下換泳道、Esc 取消、拖兩端改長短；復原', async ({ page }) => {
  await seed(page, DAY_DOC, DAY_WINDOW);
  const errors = await open(page);
  const { k } = await trackGeometry(page);
  /* 往右 3 小時（多拖 10 分也會吸附到整點） */
  const a = await center(item(page, 'a'));
  const ax = a.b.x + 8;
  await drag(page, { x: ax, y: a.y }, { x: ax + 190 * k, y: a.y });
  await expect.poll(async () => (await evOf(page, 'a'))?.start).toBe('第 1 天 13:00');
  await expect(page.getByTestId('drag-tip')).toHaveCount(0);
  /* 往下拖到泳道乙 */
  const a2 = await center(item(page, 'a'));
  const rowB = await center(page.getByTestId('timeline').locator('[data-lane-row="l2"]'));
  await drag(page, { x: a2.b.x + 8, y: a2.y }, { x: a2.b.x + 8, y: rowB.y });
  await expect.poll(async () => (await evOf(page, 'a'))?.laneId).toBe('l2');
  expect((await evOf(page, 'a'))?.start).toBe('第 1 天 13:00');
  /* Esc 取消 */
  const a3 = await center(item(page, 'a'));
  await page.mouse.move(a3.b.x + 8, a3.y);
  await page.mouse.down();
  await page.mouse.move(a3.b.x + 8 + 120 * k, a3.y, { steps: 8 });
  await expect(page.getByTestId('drag-tip')).toContainText('第 1 天 15:00');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('drag-tip')).toHaveCount(0);
  expect((await evOf(page, 'a'))?.start).toBe('第 1 天 13:00');
  /* 期間的右端往右 1 小時 */
  const b = await center(item(page, 'b'));
  const right = b.b.x + b.b.width - 2;
  await drag(page, { x: right, y: b.y }, { x: right + 60 * k, y: b.y });
  await expect.poll(async () => (await evOf(page, 'b'))?.end).toBe('第 1 天 15:00');
  expect((await evOf(page, 'b'))?.start).toBe('第 1 天 12:00');
  /* 按住 Alt 拖曳：不吸附（以分鐘為單位） */
  const b2 = await center(item(page, 'b'));
  await page.keyboard.down('Alt');
  await drag(page, { x: b2.x, y: b2.y }, { x: b2.x + 37 * k, y: b2.y });
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await evOf(page, 'b'))?.start).not.toBe('第 1 天 12:00');
  const altStart = (await evOf(page, 'b'))?.start ?? '';
  expect(altStart).toMatch(/^第 1 天 12:(3[4-9]|40)$/);
  /* 按住 Alt 上下拖（左右手抖 3 px）：只換泳道、時間不變（不吸附到整點） */
  const b3 = await center(item(page, 'b'));
  const rowA = await center(page.getByTestId('timeline').locator('[data-lane-row="l1"]'));
  await page.keyboard.down('Alt');
  await drag(page, { x: b3.x, y: b3.y }, { x: b3.x + 3, y: rowA.y });
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await evOf(page, 'b'))?.laneId).toBe('l1');
  expect((await evOf(page, 'b'))?.start).toBe(altStart);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'b'))?.laneId).toBe('l2');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'b'))?.start).toBe('第 1 天 12:00');
  /* 復原三步：長短、換泳道、時間 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'b'))?.end).toBe('第 1 天 14:00');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'a'))?.laneId).toBe('l1');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'a'))?.start).toBe('第 1 天 10:00');
  expect(errors).toEqual([]);
});

test('鍵盤：方向鍵移動、Shift 改結束、↑↓ 換泳道、Enter 編輯、Delete 刪除', async ({ page }) => {
  await seed(page, DAY_DOC, DAY_WINDOW);
  const errors = await open(page);
  await item(page, 'a').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await evOf(page, 'a'))?.start).toBe('第 1 天 11:00');
  await expect(item(page, 'a')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await evOf(page, 'a'))?.laneId).toBe('l2');
  await expect(item(page, 'a')).toBeFocused();
  await item(page, 'b').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await evOf(page, 'b'))?.end).toBe('第 1 天 15:00');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await evOf(page, 'b'))?.end).toBe('第 1 天 13:00');
  /* Enter：焦點到標題欄 */
  await item(page, 'b').focus();
  await page.keyboard.press('Enter');
  await expect(field(page, 'title')).toBeFocused();
  await expect(field(page, 'title')).toHaveValue('事件乙');
  /* Delete：刪除、通知可以復原 */
  await item(page, 'b').focus();
  await page.keyboard.press('Delete');
  await expect(item(page, 'b')).toHaveCount(0);
  await page.getByTestId('toast-action').click();
  await expect(item(page, 'b')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('雙擊空白處新增、縮放與平移、全覽、旗子拖曳', async ({ page }) => {
  await seed(page, DAY_DOC, DAY_WINDOW);
  const errors = await open(page);
  const { box, k, w } = await trackGeometry(page);
  /* 泳道甲的 20:00 雙擊（在背景「暴風雨」的區段裡：區段不擋點選） */
  const row = await center(page.getByTestId('timeline').locator('[data-lane-row="l1"]'));
  await page.mouse.dblclick(box.x + (20 * 60 - w.start) * k, row.y);
  await expect(field(page, 'title')).toBeFocused();
  await page.keyboard.type('新的事件');
  await page.keyboard.press('Tab');
  const doc = await docOf(page);
  const added = doc.events.find((e) => e.title === '新的事件');
  expect(added).toMatchObject({ start: '第 1 天 20:00', laneId: 'l1', kind: 'point' });
  /* 背景：點左上角的標題選取 */
  await item(page, 'bg').locator('[data-band-label]').click();
  await expect(item(page, 'bg')).toHaveAttribute('data-selected', 'true');
  await expect(field(page, 'title')).toHaveValue('暴風雨');
  /* 旗子往左拖 2 小時 */
  const flag = await center(page.getByTestId('timeline').locator('[data-flag-id="m1"]'));
  await drag(page, { x: flag.b.x + 4, y: flag.y }, { x: flag.b.x + 4 - 120 * k, y: flag.y });
  await expect.poll(async () => (await docOf(page)).markers[0].time).toBe('第 1 天 14:00');
  /* 滾輪放大（以游標為中心） */
  const before = await winOf(page);
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.wheel(0, -100);
  await expect
    .poll(async () => {
      const x = await winOf(page);
      return Math.round(x.end - x.start);
    })
    .toBe(Math.round((before.end - before.start) / 1.2));
  /* 空白處拖曳平移 */
  const w2 = await winOf(page);
  const k2 = box.width / (w2.end - w2.start);
  await drag(
    page,
    { x: box.x + 30, y: box.y + box.height - 20 },
    { x: box.x + 130, y: box.y + box.height - 20 },
  );
  await expect
    .poll(async () => Math.round((await winOf(page)).start))
    .toBe(Math.round(w2.start - 100 / k2));
  /* 縮小、全覽 */
  await page.getByTestId('zoom-out').click();
  await expect
    .poll(async () => {
      const x = await winOf(page);
      return Math.round(x.end - x.start);
    })
    .toBe(Math.round((w2.end - w2.start) * 1.5));
  await page.getByTestId('fit').click();
  await expect.poll(async () => (await winOf(page)).start).toBeLessThan(10 * 60);
  /* 時間軸有焦點時 ←／→ 平移 */
  await page.getByTestId('timeline').focus();
  const w3 = await winOf(page);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await winOf(page)).start)
    .toBeCloseTo(w3.start + (w3.end - w3.start) * 0.1, 3);
  expect(errors).toEqual([]);
});

test('事件分頁：新增、時間欄的解讀與錯誤、種類、複製、刪除', async ({ page }) => {
  await seed(page, DAY_DOC, DAY_WINDOW);
  const errors = await open(page);
  await page.getByTestId('add-event').click();
  await expect(field(page, 'title')).toBeFocused();
  await page.keyboard.type('開場');
  const start = field(page, 'start');
  await start.fill('第2天8:05');
  await start.press('Enter');
  await expect(start).toHaveValue('第 2 天 08:05');
  await expect(page.getByText('＝ 第 2 天 08:05')).toBeVisible();
  await start.fill('明天');
  await start.press('Enter');
  await expect(page.getByText('看不懂這個時間：「明天」（例：第 3 天 21:00）')).toBeVisible();
  await start.press('Escape');
  await expect(start).toHaveValue('第 2 天 08:05');
  /* 種類：期間（結束預設＋1 小時） */
  await page.getByRole('radio', { name: '期間' }).click();
  await expect(field(page, 'end')).toHaveValue('第 2 天 09:05');
  await field(page, 'end').fill('第 2 天 07:00');
  await field(page, 'end').press('Enter');
  await expect(page.getByText('結束要比開始晚')).toBeVisible();
  await field(page, 'end').fill('第 2 天 10:00');
  await field(page, 'end').press('Enter');
  const ev = (await docOf(page)).events.find((e) => e.title === '開場');
  expect(ev).toMatchObject({ kind: 'range', start: '第 2 天 08:05', end: '第 2 天 10:00' });
  /* 相關角色的建議、地點 */
  await page.getByTestId('event-editor').getByRole('button', { name: '泳道甲' }).click();
  await expect(field(page, 'people')).toHaveValue('泳道甲');
  await field(page, 'place').fill('港口');
  await field(page, 'place').blur();
  /* 複製一份、刪除 */
  await page.getByRole('button', { name: '複製一份' }).click();
  await expect(field(page, 'title')).toHaveValue('開場（複本）');
  await expect.poll(async () => (await docOf(page)).events.length).toBe(5);
  await page.getByTestId('delete-event').click();
  await expect.poll(async () => (await docOf(page)).events.length).toBe(4);
  await expect(page.getByTestId('event-count')).toHaveText('共 4 個事件');
  const copy = (await docOf(page)).events.find((e) => e.title === '開場');
  expect(copy).toMatchObject({ place: '港口' });
  expect(errors).toEqual([]);
});

test('時間寫法：日期時間換成第 N 天、再換成架空年；曆名', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '專案' }).click();
  await page.getByRole('radio', { name: '第 N 天' }).click();
  const dialog = page.getByRole('dialog', { name: '換成「第 N 天」' });
  await expect(field(page, 'day-one')).toHaveValue('1925-03-12');
  await dialog.getByTestId('convert-apply').click();
  await expect(dialog).toHaveCount(0);
  const doc = await docOf(page);
  expect(doc.mode).toBe('day');
  expect(doc.events.find((e) => e.id === 'ex-arrive')?.start).toBe('第 1 天 16:00');
  expect(doc.events.find((e) => e.id === 'ex-letter')?.start).toBe('第 -6 天');
  expect(doc.progress.time).toBe('第 1 天 20:00');
  await expect(
    page.getByTestId('timeline').locator('[data-axis-major], [data-axis-minor]').first(),
  ).toBeVisible();
  /* 年表的段 */
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(page.getByTestId('chronicle').locator('[data-section="第 1 天"]')).toBeVisible();
  await page.getByRole('radio', { name: '時間軸' }).click();
  /* 架空年 */
  await page.getByRole('radio', { name: '架空年' }).click();
  await page.getByTestId('convert-apply').click();
  await expect.poll(async () => (await docOf(page)).mode).toBe('year');
  await field(page, 'era').fill('王國曆');
  await field(page, 'era').blur();
  await expect(page.getByTestId('axis-era')).toHaveText('王國曆');
  const d2 = await docOf(page);
  expect(d2.events.find((e) => e.id === 'ex-arrive')?.start).toBe('1925');
  /* 復原整次換算 */
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await docOf(page)).mode).toBe('day');
  expect(errors).toEqual([]);
});

test('GM／PL：P 鍵、拿掉的東西、PL 檢視不能改資料、只到目前進度', async ({ page }) => {
  const errors = await open(page);
  const tl = page.getByTestId('timeline');
  await expect(item(page, 'ex-rite1')).toHaveAttribute('data-secret', 'true');
  await expect(item(page, 'ex-taken').locator('[data-gm-badge]')).toHaveCount(1);
  await page.keyboard.press('p');
  await expect(page.getByTestId('pl-badge')).toBeVisible();
  await expect(tl.locator('[data-lane-row="cult"]')).toHaveCount(0);
  await expect(tl.locator('[data-lane-row="norton"]')).toHaveCount(0);
  await expect(item(page, 'ex-rite1')).toHaveCount(0);
  await expect(item(page, 'ex-taken')).toHaveCount(0);
  await expect(tl.locator('[data-gm-badge]')).toHaveCount(0);
  await expect(page.getByTestId('add-event')).toBeDisabled();
  /* 選取可以，編輯欄位停用、沒有 GM 筆記 */
  await item(page, 'ex-missing').click();
  await expect(field(page, 'title')).toBeDisabled();
  await expect(field(page, 'gmNote')).toHaveCount(0);
  await expect(page.getByTestId('pl-lock')).toBeVisible();
  /* 改資料的快捷鍵：通知 */
  await page.getByTestId('timeline').focus();
  await page.keyboard.press('n');
  await expect(page.getByText('切回 GM 檢視才能編輯', { exact: true }).last()).toBeVisible();
  expect((await docOf(page)).events).toHaveLength(12);
  /* 年表（PL）沒有 GM 筆記 */
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(page.getByTestId('chronicle').locator('[data-chron-note]')).toHaveCount(0);
  await expect(page.getByTestId('chronicle')).not.toContainText('第一次召喚儀式');
  /* GM：開「PL 版只到目前進度」（焦點在單選鈕上時 P 鍵不作用，用按鈕切換） */
  await page.getByRole('radio', { name: /^GM 檢視/ }).click();
  await page.getByRole('tab', { name: '專案' }).click();
  await page.getByRole('switch', { name: 'PL 版只到目前進度' }).click();
  await page.getByRole('radio', { name: /^PL 檢視/ }).click();
  const ch = page.getByTestId('chronicle');
  await expect(ch.locator('[data-chron-row]')).toHaveCount(4);
  await expect(ch.locator('[data-chron-row="ex-dinner"] [data-chron-time]')).toHaveText(
    '19:00～（進行中）',
  );
  expect(errors).toEqual([]);
});

test('泳道：新增、改名、放到別的泳道底下、收合、刪除（事件移到主線）', async ({ page }) => {
  await seed(page, DAY_DOC, DAY_WINDOW);
  const errors = await open(page);
  await page.getByRole('tab', { name: '泳道' }).click();
  await page.getByTestId('add-lane').click();
  const nameInput = page.locator('[data-lane-name]').nth(2);
  await expect(nameInput).toBeFocused();
  await nameInput.fill('陣營丙');
  await nameInput.blur();
  const lanes = (await docOf(page)).lanes;
  const newId = lanes[2].id;
  expect(lanes[2].name).toBe('陣營丙');
  /* 泳道乙放到陣營丙底下 */
  await page.getByRole('combobox', { name: '放在…底下：泳道乙' }).click();
  await page.getByRole('option', { name: '放在「陣營丙」底下' }).click();
  await expect
    .poll(async () => (await docOf(page)).lanes.find((l) => l.id === 'l2')?.parentId)
    .toBe(newId);
  const tl = page.getByTestId('timeline');
  await expect(tl.locator('[data-lane-row]')).toHaveCount(3);
  /* 收合：事件乙畫在陣營丙那一列 */
  await tl.getByRole('button', { name: '收合「陣營丙」' }).click();
  await expect(tl.locator('[data-lane-row]')).toHaveCount(2);
  const row = await tl.locator('[data-lane-row]').nth(1).boundingBox();
  const b = await item(page, 'b').boundingBox();
  expect(b && row && b.y >= row.y && b.y < row.y + row.height).toBe(true);
  await tl.getByRole('button', { name: '展開「陣營丙」' }).click();
  await expect(tl.locator('[data-lane-row]')).toHaveCount(3);
  /* 刪除泳道甲：事件移到主線 */
  await page.getByRole('button', { name: '刪除泳道「泳道甲」' }).click();
  await page.getByRole('button', { name: '事件移到主線' }).click();
  await expect.poll(async () => (await evOf(page, 'a'))?.laneId).toBe('');
  await expect(tl.locator('[data-lane-row="__main"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('年表：點選、複製成文字、列印文件', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await page.keyboard.press('v');
  const ch = page.getByTestId('chronicle');
  await expect(ch).toBeVisible();
  await expect(ch.locator('[data-section]')).toHaveCount(5);
  await ch.locator('[data-chron-row="ex-search"] button').click();
  await expect(field(page, 'title')).toHaveValue('調查燈塔');
  await ch.locator('[data-chron-row="ex-search"] button').dblclick();
  await expect(field(page, 'title')).toBeFocused();
  await page.getByTestId('copy-text').click();
  await expect(page.getByText('已複製年表', { exact: true })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split('\n')[0]).toBe('黑水灣燈塔的三日〔GM 用〕');
  expect(text).toContain('・09:00～12:00　調查燈塔〔調查員〕〔線索〕');
  await page.getByTestId('print').click();
  const frame = page.frameLocator('iframe[data-paged-print]');
  await expect(frame.locator('h1')).toHaveText('黑水灣燈塔的三日（GM 用）');
  await expect(frame.locator('h2')).toHaveCount(5);
  const css = await frame.locator('style').first().textContent();
  expect(css).toContain('@page{size:210mm 297mm;margin:15mm}');
  expect(errors).toEqual([]);
});

test('匯出：PNG、SVG、文字年表、CSV 匯出與貼上讀入', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '匯出' }).click();
  const tab = page.getByTestId('export-tab');
  const panel = page.getByRole('region', { name: '匯出圖片' });
  const exportOnce = async () => {
    await panel.getByRole('button', { name: /^匯出/ }).click();
    const result = page.getByTestId('export-result');
    await expect(result).toBeVisible({ timeout: 60_000 });
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      result.getByRole('link', { name: '下載' }).click(),
    ]);
    return dl;
  };
  /* PNG（PL 用、1600 px） */
  const png = await exportOnce();
  expect(png.suggestedFilename()).toBe('黑水灣燈塔的三日_時間軸.png');
  const bytes = readFileSync(await png.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1600);
  /* SVG（GM 用） */
  await tab.getByRole('radio', { name: 'GM 用' }).first().click();
  await panel.getByRole('radio', { name: /SVG/ }).click();
  const svg = await exportOnce();
  await expect(page.getByTestId('export-result')).toContainText('沒有嵌入');
  expect(svg.suggestedFilename()).toBe('黑水灣燈塔的三日_時間軸_GM.svg');
  const text = readFileSync(await svg.path(), 'utf8');
  expect(text).toContain('<title>黑水灣燈塔的三日</title>');
  expect(text).toContain('第一次召喚儀式');
  expect(text).toContain('GM 用');
  /* 文字年表：Markdown、下載 */
  await tab.getByRole('radio', { name: 'Markdown' }).click();
  await expect(tab.getByRole('textbox', { name: '年表文字' })).toHaveValue(/^# 黑水灣燈塔的三日\n/);
  const [md] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('text-download').click(),
  ]);
  expect(md.suggestedFilename()).toBe('黑水灣燈塔的三日_年表.md');
  /* CSV 匯出 */
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('csv-export').click(),
  ]);
  expect(csv.suggestedFilename()).toBe('黑水灣燈塔的三日_事件.csv');
  const csvText = readFileSync(await csv.path(), 'utf8');
  expect(csvText.charCodeAt(0)).toBe(0xfeff);
  expect(csvText).toContain('標題,種類,開始,結束,泳道');
  /* 貼上表格：加入（試算表複製的含換行、引號的格以引號包住） */
  await page.getByTestId('csv-paste').click();
  await field(page, 'paste').fill(
    '標題\t開始\t泳道\t說明\n新來的\t1925-03-13 18:30\t新泳道\t"第一行\n說""好"""\n壞掉\t明天\t\t',
  );
  await page.getByTestId('paste-read').click();
  await page.getByRole('button', { name: '加入' }).click();
  await expect(page.getByText('已讀入 1 個事件', { exact: true })).toBeVisible();
  await expect(
    page.getByText('看不懂的列：第 3 列：看不懂這個時間：「明天」', { exact: true }),
  ).toBeVisible();
  const doc = await docOf(page);
  expect(doc.events).toHaveLength(13);
  expect(doc.lanes.some((l) => l.name === '新泳道')).toBe(true);
  const added = doc.events.find((e) => e.title === '新來的') as unknown as { description: string };
  expect(added.description).toBe('第一行\n說"好"');
  expect(errors).toEqual([]);
});

test('拖進視窗：CSV 讀入、看不懂的檔案', async ({ page }) => {
  await seed(page, DAY_DOC, DAY_WINDOW);
  const errors = await open(page);
  await dropFiles(page, [
    {
      name: '事件表.csv',
      type: 'text/csv',
      text: '標題,開始,結束,泳道\n夜襲,第2天22:00,第3天1:00,泳道乙\n',
    },
  ]);
  await page.getByRole('button', { name: '加入' }).click();
  await expect(page.getByText('已讀入 1 個事件', { exact: true })).toBeVisible();
  const ev = (await docOf(page)).events.find((e) => e.title === '夜襲');
  expect(ev).toMatchObject({
    kind: 'range',
    start: '第 2 天 22:00',
    end: '第 3 天 01:00',
    laneId: 'l2',
  });
  await dropFiles(page, [{ name: '圖.png', type: 'image/png', text: 'x' }]);
  await expect(page.getByText('看不懂這個檔案', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('專案檔：存成專案檔、開啟；重設成空白', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: /^專案/ }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^黑水灣燈塔的三日_\d{8}\.json$/);
  const saved = JSON.parse(readFileSync(await file.path(), 'utf8'));
  expect(saved.tool).toBe('scenario-timeline');
  expect(saved.data.events).toHaveLength(12);
  /* 重設成空白 */
  await page.getByRole('button', { name: /^專案/ }).click();
  await page.getByRole('menuitem', { name: /重設/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /重設/ }).click();
  await expect.poll(async () => (await docOf(page)).events.length).toBe(0);
  await expect(page.getByTestId('timeline-empty')).toBeVisible();
  /* 開啟剛剛存的專案檔（選檔前先確認會取代目前的內容） */
  await page.getByRole('button', { name: /^專案/ }).click();
  await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(await file.path());
  await expect.poll(async () => (await docOf(page)).events.length).toBe(12);
  await expect(item(page, 'ex-arrive')).toBeVisible();
  expect(errors).toEqual([]);
});

/* ---------- 對等驗證後補的 ---------- */

/** GM 專用的東西都有獨一無二的名稱（PL 檢視的整個頁面都不能出現） */
const SECRET = {
  laneName: '秘密泳道DELTA',
  subLane: '秘密子泳道EPS',
  category: '秘密分類IOTA',
  eventTitle: '秘密事件BETA',
  eventDesc: '秘密說明GAMMA',
  place: '秘密地點KAPPA',
  people: '秘密角色LAMBDA',
  noteOnPublic: '公開事件上的筆記MU',
  noteOnSecret: '秘密事件上的筆記NU',
  laneEvent: '泳道內事件ZETA',
  subLaneEvent: '子泳道內事件ETA',
  background: '秘密背景OMEGA',
  marker: '秘密標記THETA',
} as const;

const lane = (id: string, name: string, over: object = {}) => ({
  id,
  name,
  kind: 'other',
  color: '#4f7cff',
  parentId: '',
  gm: false,
  ...over,
});

const SECRET_DOC = {
  title: '洩漏測試',
  mode: 'date',
  era: '',
  dayOne: '',
  sample: false,
  showNow: false,
  lanes: [
    lane('pub', '公開泳道', { kind: 'character' }),
    lane('sec', SECRET.laneName, { gm: true, kind: 'npc' }),
    lane('subsec', SECRET.subLane, { parentId: 'sec', kind: 'npc' }),
  ],
  categories: [
    { id: 'cpub', name: '公開分類', color: '#2fa37a' },
    { id: 'csec', name: SECRET.category, color: '#e0565b' },
  ],
  events: [
    {
      ...blankEvent,
      id: 'PUB',
      title: '公開事件',
      start: '1925-03-12 10:00',
      laneId: 'pub',
      place: '公開地點',
      people: ['公開角色'],
      categoryId: 'cpub',
      description: '公開說明',
      gmNote: SECRET.noteOnPublic,
    },
    {
      ...blankEvent,
      id: 'SEC',
      title: SECRET.eventTitle,
      start: '1925-03-12 11:00',
      laneId: 'pub',
      gm: true,
      place: SECRET.place,
      people: [SECRET.people],
      categoryId: 'csec',
      description: SECRET.eventDesc,
      gmNote: SECRET.noteOnSecret,
    },
    {
      ...blankEvent,
      id: 'LANEEV',
      title: SECRET.laneEvent,
      start: '1925-03-12 15:00',
      laneId: 'sec',
    },
    {
      ...blankEvent,
      id: 'SUBEV',
      title: SECRET.subLaneEvent,
      start: '1925-03-12 16:00',
      laneId: 'subsec',
    },
    {
      ...blankEvent,
      id: 'BG',
      title: SECRET.background,
      kind: 'background',
      start: '1925-03-12 08:00',
      end: '1925-03-12 09:00',
      gm: true,
    },
  ],
  markers: [
    { id: 'msec', label: SECRET.marker, time: '1925-03-12 17:00', color: '#8a63d2', gm: true },
    { id: 'mpub', label: '公開標記', time: '1925-03-12 18:00', color: '#2b9fc2', gm: false },
  ],
  progress: { on: false, time: '', plOnly: false },
};

/** 整個頁面的文字：看得到與藏起來的文字、所有屬性（title、aria-label、datalist 的 value…）、輸入欄的值 */
const domText = (page: Page) =>
  page.evaluate(() => {
    const parts = [document.title, document.body.innerText, document.body.textContent ?? ''];
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.attributes) parts.push(a.value);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) parts.push(el.value);
    }
    return parts.join('\n');
  });

async function expectNoSecrets(page: Page, where: string) {
  const text = await domText(page);
  const leaked = Object.values(SECRET).filter((s) => text.includes(s));
  expect(leaked, `PL 檢視（${where}）不應出現 GM 專用的東西`).toEqual([]);
}

test('PL 檢視：整個頁面的 DOM 文字不含 GM 專用的名稱與筆記（各分頁、選取、年表）', async ({
  page,
}) => {
  /* 匯出的對象原本選 GM 用：PL 檢視時固定 PL 用 */
  await seed(page, SECRET_DOC, {
    viewMode: 'pl',
    view: 'timeline',
    export: { audience: 'gm' },
    text: { format: 'text', audience: 'gm' },
  });
  const errors = await open(page);
  await expect(page.getByTestId('pl-badge')).toBeVisible();
  await expect(item(page, 'PUB')).toBeVisible();
  for (const tab of ['事件', '泳道', '專案', '匯出']) {
    await page.getByRole('tab', { name: tab }).click();
    await expectNoSecrets(page, `${tab}分頁`);
  }
  /* 泳道分頁只列 PL 看得到的泳道與分類；專案分頁只列 PL 看得到的標記 */
  await page.getByRole('tab', { name: '泳道' }).click();
  await expect(page.locator('[data-lane-item]')).toHaveCount(1);
  await expect(page.locator('[data-cat-item]')).toHaveCount(1);
  await page.getByRole('tab', { name: '專案' }).click();
  await expect(page.locator('[data-marker-item]')).toHaveCount(1);
  /* 匯出分頁：對象固定 PL 用、停用 */
  await page.getByRole('tab', { name: '匯出' }).click();
  const tab = page.getByTestId('export-tab');
  await expect(tab.getByRole('radio', { name: 'PL 用' }).first()).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(tab.getByRole('radio', { name: 'GM 用' }).first()).toBeDisabled();
  /* 選取公開事件：編輯區（泳道、分類、地點的建議、相關角色的建議） */
  await page.getByRole('tab', { name: '事件' }).click();
  await item(page, 'PUB').click();
  await expect(field(page, 'title')).toHaveValue('公開事件');
  await expectNoSecrets(page, '選取公開事件');
  /* 年表 */
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(page.getByTestId('chronicle')).toContainText('公開事件');
  await expectNoSecrets(page, '年表');
  /* 專案選單：開啟、載入範例、重設停用；頁首的復原、重做保留名稱（停用） */
  await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^重做/ })).toBeDisabled();
  await page.getByRole('button', { name: /^專案/ }).click();
  await expect(page.getByRole('menuitem', { name: '載入範例' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(page.getByRole('menuitem', { name: /開啟專案檔/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('換寫法：只到月、年的結束換成那個單位的最後一天；對話框列出會失去精度的', async ({ page }) => {
  await seed(page, {
    ...SECRET_DOC,
    title: '換算',
    lanes: [],
    categories: [],
    markers: [],
    events: [
      { ...blankEvent, id: 'a', title: '時刻', start: '1925-03-12 21:00' },
      { ...blankEvent, id: 'm', title: '只到月', start: '1925-03' },
      {
        ...blankEvent,
        id: 'r',
        title: '期間月末',
        kind: 'range',
        start: '1925-03-05',
        end: '1925-03',
      },
    ],
  });
  const errors = await open(page);
  await page.getByRole('tab', { name: '專案' }).click();
  await page.getByRole('radio', { name: '第 N 天' }).click();
  const dialog = page.getByRole('dialog', { name: '換成「第 N 天」' });
  await field(page, 'day-one').fill('1925-03-10');
  const lossy = dialog.getByTestId('convert-lossy');
  await expect(lossy).toContainText('2 個事件或標記會失去精度');
  await expect(lossy).toContainText('只到月：1925年3月 → 第 -8 天');
  await expect(lossy).toContainText('期間月末：1925年3月5日（四）～1925年3月 → 第 -4 天～第 22 天');
  await dialog.getByTestId('convert-apply').click();
  await expect.poll(async () => (await docOf(page)).mode).toBe('day');
  const doc = await docOf(page);
  expect(doc.events.find((e) => e.id === 'r')).toMatchObject({
    start: '第 -4 天',
    end: '第 22 天',
  });
  expect(doc.events.find((e) => e.id === 'a')?.start).toBe('第 3 天 21:00');
  /* 一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await docOf(page)).mode).toBe('date');
  expect((await docOf(page)).events.find((e) => e.id === 'r')?.end).toBe('1925-03');
  expect(errors).toEqual([]);
});

test('時間欄：看不懂時離開欄位通知「沒有套用」；星期寫錯時照日期更正並通知', async ({ page }) => {
  const errors = await open(page);
  await item(page, 'ex-arrive').click();
  const start = field(page, 'start');
  await start.fill('1925年3月12日（五）16:30');
  await expect(page.getByText('（星期照日期更正）')).toBeVisible();
  await start.blur();
  await expect(
    page.getByText('星期和日期不合，已照日期更正成 1925年3月12日（四）16:30', { exact: true }),
  ).toBeVisible();
  await expect(start).toHaveValue('1925-03-12 16:30');
  expect((await evOf(page, 'ex-arrive'))?.start).toBe('1925-03-12 16:30');
  await start.fill('亂寫');
  await start.blur();
  await expect(page.getByText('看不懂這個時間：「亂寫」，沒有套用', { exact: true })).toBeVisible();
  await expect(start).toHaveValue('1925-03-12 16:30');
  expect((await evOf(page, 'ex-arrive'))?.start).toBe('1925-03-12 16:30');
  expect(errors).toEqual([]);
});

test('泳道清單：上層 Alt＋↓ 連同子泳道往下移、焦點跟著移動的那列', async ({ page }) => {
  await seed(page, {
    ...DAY_DOC,
    lanes: [
      lane('A', '上層甲'),
      lane('A1', '甲的子泳道', { parentId: 'A' }),
      lane('B', '泳道乙'),
      lane('C', '泳道丙'),
    ],
  });
  const errors = await open(page);
  await page.getByRole('tab', { name: '泳道' }).click();
  const order = async () => (await docOf(page)).lanes.map((l) => l.id).join(',');
  const li = (id: string) => page.locator('li', { has: page.locator(`[data-lane-item="${id}"]`) });
  await li('A').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(order).toBe('B,A,A1,C');
  await expect(li('A')).toBeFocused();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(order).toBe('B,C,A,A1');
  await expect(li('A')).toBeFocused();
  /* 最後一個：不動 */
  await page.keyboard.press('Alt+ArrowDown');
  await expect(li('A')).toBeFocused();
  expect(await order()).toBe('B,C,A,A1');
  /* 往上移過有子泳道的上層：焦點跟著 C */
  await li('C').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(order).toBe('C,B,A,A1');
  await expect(li('C')).toBeFocused();
  expect(errors).toEqual([]);
});

test('匯出：自訂範圍裡沒有東西時停用並寫原因', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '匯出' }).click();
  const tab = page.getByTestId('export-tab');
  await tab.getByRole('radio', { name: '自訂' }).click();
  await field(page, 'export-from').fill('1900-01-01');
  await field(page, 'export-from').blur();
  await field(page, 'export-to').fill('1900-02-01');
  await field(page, 'export-to').blur();
  await expect(tab.getByText('範圍裡沒有事件或標記，沒有東西可以畫。').first()).toBeVisible();
  const panel = page.getByRole('region', { name: '匯出圖片' });
  await expect(panel.getByRole('button', { name: /^匯出/ })).toBeDisabled();
  await field(page, 'export-to').fill('1925-03-13');
  await field(page, 'export-to').blur();
  await expect(panel.getByRole('button', { name: /^匯出/ })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('專案檔：略過或整理掉的資料要通知；內容是空的不開啟', async ({ page }) => {
  const errors = await open(page);
  const project = (data: object) =>
    JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-timeline',
      version: 1,
      savedAt: '2026-10-29T00:00:00.000Z',
      data,
    });
  await dropFiles(page, [
    {
      name: '壞掉一些.json',
      type: 'application/json',
      text: project({
        title: '壞掉一些',
        mode: 'date',
        events: [
          { id: 'ok', title: '好的', start: '1925-03-12' },
          { id: 'bad', title: '壞的', start: '明天' },
          { id: 'rng', title: '倒過來', kind: 'range', start: '1925-03-12', end: '1925-03-01' },
        ],
      }),
    },
  ]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect(
    page.getByText('略過 1 個看不懂的事件（沒有開始時間或寫法看不懂）。', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('1 個期間的結束看不懂或不比開始晚，改成時間點。', { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await docOf(page)).events.length).toBe(2);
  await dropFiles(page, [{ name: '空的.json', type: 'application/json', text: project({}) }]);
  await expect(
    page.getByText('專案檔裡沒有劇本時間表的內容（是空的），沒有開啟。', { exact: true }),
  ).toBeVisible();
  expect((await docOf(page)).title).toBe('壞掉一些');
  expect(errors).toEqual([]);
});

test('版面：390 寬預設年表、沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.mouse.move(0, 0);
  await expect(page.getByTestId('timeline')).toBeVisible();
  await expect(page).toHaveScreenshot('scenario-timeline-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('chronicle')).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('radio', { name: '時間軸' }).click();
  await expect(page.getByTestId('timeline')).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('radio', { name: '年表' }).click();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('scenario-timeline-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
