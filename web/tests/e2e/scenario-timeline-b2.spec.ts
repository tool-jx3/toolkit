/**
 * 劇本時間表第二批（規格 F90～F94）的端對端測試（建置產物）：
 * - 多選：Ctrl＋點選、一起拖曳（一步復原）、一起改泳道、一起刪除（通知裡復原）、方向鍵一起移動、
 *   Shift＋點選、Shift＋拖曳框選、Ctrl＋A、Esc、年表的 Ctrl／Shift＋點選。
 * - 篩選：文字、泳道、淡化／藏起來、年表只列符合的、清除；只匯出篩選的結果；PL 檢視不洩漏 GM 專用的值。
 * - 架空曆：打開月份、改名、輸入月日、年表的段、刻度、天數變少的調整（復原）、星期、關掉月份（確認）。
 * - 關聯線：從圓點拖到另一個事件、種類與說明、GM 專用（PL 不畫）、刪掉事件時一起刪（復原）、找事件加上。
 * - 讀入 vis-timeline：貼上 items／groups、拖進兩個 JSON 檔；略過的欄位通知。
 * - 第一批的小事：version 99 與看不懂的寫法要通知；360 寬背景的標題不被事件蓋住。
 * - 效能（@serial）：3000 個事件＋1500 條關聯線的縮放、平移、框選。
 */
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
  categoryId: string;
}
interface Doc {
  title: string;
  mode: string;
  events: Ev[];
  lanes: { id: string; name: string; parentId: string }[];
  links: { id: string; from: string; to: string; kind: string; note: string; gm: boolean }[];
  calendar: { months: { id: string; name: string; days: number }[]; weekdays: string[] };
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

type Api = {
  __scenarioTimeline: {
    doc: () => Doc;
    win: () => { start: number; end: number };
    ui: () => { selectedIds: string[]; selectedId: string | null };
  };
};
const docOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Api).__scenarioTimeline.doc());
const winOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Api).__scenarioTimeline.win());
const selOf = (page: Page) =>
  page.evaluate(() => [...(window as unknown as Api).__scenarioTimeline.ui().selectedIds].sort());
const evOf = async (page: Page, id: string) => (await docOf(page)).events.find((e) => e.id === id);
const item = (page: Page, id: string) =>
  page.getByTestId('timeline').locator(`[data-event-id="${id}"]`);
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);

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
const lane = (id: string, name: string, over: object = {}) => ({
  id,
  name,
  kind: 'npc',
  color: '#4f7cff',
  parentId: '',
  gm: false,
  ...over,
});

/** 第 1 天：甲（A1 08:00、D1 14:00～16:00）、乙（B1 10:00、E1 18:00 GM 專用）、丙（C1 12:00） */
const DOC = {
  title: '多選測試',
  mode: 'day',
  era: '',
  dayOne: '',
  sample: false,
  showNow: false,
  lanes: [lane('l1', '泳道甲'), lane('l2', '泳道乙'), lane('l3', '泳道丙', { kind: 'place' })],
  categories: [{ id: 'c1', name: '線索', color: '#2b9fc2' }],
  events: [
    { ...blankEvent, id: 'a', title: 'A1', start: '第 1 天 08:00', laneId: 'l1' },
    { ...blankEvent, id: 'b', title: 'B1', start: '第 1 天 10:00', laneId: 'l2', categoryId: 'c1' },
    {
      ...blankEvent,
      id: 'c',
      title: 'C1',
      start: '第 1 天 12:00',
      laneId: 'l3',
      place: '港口',
      people: ['偵探'],
    },
    {
      ...blankEvent,
      id: 'd',
      title: 'D1',
      kind: 'range',
      start: '第 1 天 14:00',
      end: '第 1 天 16:00',
      laneId: 'l1',
    },
    {
      ...blankEvent,
      id: 'e',
      title: 'E1',
      start: '第 1 天 18:00',
      laneId: 'l2',
      gm: true,
      place: '秘密地點XI',
      gmNote: '秘密筆記PSI',
    },
  ],
  markers: [],
  progress: { on: false, time: '', plOnly: false },
  calendar: { months: [], weekdays: [], weekStart: 0 },
  links: [],
};
const DAY_WINDOW = { windows: { day: { start: 0, end: 1440 } } };

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
      JSON.stringify({ state: { data }, version: 2 }),
      PREFS_KEY,
      prefs ? JSON.stringify({ state: { data: prefs }, version: 1 }) : '',
    ],
  );
}

const center = async (loc: Locator) => {
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};

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

const domText = (page: Page) =>
  page.evaluate(() => {
    const parts = [document.title, document.body.innerText, document.body.textContent ?? ''];
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.attributes) parts.push(a.value);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) parts.push(el.value);
    }
    return parts.join('\n');
  });

test('多選：Ctrl＋點選、一起拖曳與改泳道（一步復原）、方向鍵、Delete 一起刪', async ({ page }) => {
  await seed(page, DOC, DAY_WINDOW);
  const errors = await open(page);
  const { k } = await trackGeometry(page);
  await item(page, 'a').click();
  await item(page, 'b').click({ modifiers: ['ControlOrMeta'] });
  await expect.poll(() => selOf(page)).toEqual(['a', 'b']);
  await expect(page.getByTestId('multi-count')).toHaveText('選了 2 個事件');
  await expect(item(page, 'a')).toHaveAttribute('data-selected', 'true');
  await expect(item(page, 'b')).toHaveAttribute('data-selected', 'true');
  /* 拖其中一個：一起往右 2 小時（吸附照被拖的那個） */
  const a = await center(item(page, 'a'));
  await drag(page, { x: a.b.x + 8, y: a.y }, { x: a.b.x + 8 + 125 * k, y: a.y });
  await expect.poll(async () => (await evOf(page, 'a'))?.start).toBe('第 1 天 10:00');
  expect((await evOf(page, 'b'))?.start).toBe('第 1 天 12:00');
  await expect.poll(() => selOf(page)).toEqual(['a', 'b']);
  /* 一步復原 */
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'a'))?.start).toBe('第 1 天 08:00');
  expect((await evOf(page, 'b'))?.start).toBe('第 1 天 10:00');
  /* 一起改泳道 */
  await field(page, 'multi-lane').click();
  await page.getByRole('option', { name: '泳道丙' }).click();
  await expect.poll(async () => (await evOf(page, 'a'))?.laneId).toBe('l3');
  expect((await evOf(page, 'b'))?.laneId).toBe('l3');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'b'))?.laneId).toBe('l2');
  expect((await evOf(page, 'a'))?.laneId).toBe('l1');
  /* 一起改分類 */
  await field(page, 'multi-category').click();
  await page.getByRole('option', { name: '線索' }).click();
  await expect.poll(async () => (await evOf(page, 'a'))?.categoryId).toBe('c1');
  /* 方向鍵：焦點在其中一個時一起移動 */
  await item(page, 'a').focus();
  await expect.poll(() => selOf(page)).toEqual(['a', 'b']);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await evOf(page, 'a'))?.start).toBe('第 1 天 09:00');
  expect((await evOf(page, 'b'))?.start).toBe('第 1 天 11:00');
  /* 點多選中的一個（沒拖）：只選它 */
  await item(page, 'a').click();
  await expect.poll(() => selOf(page)).toEqual(['a']);
  /* Ctrl＋點選加減 */
  await item(page, 'b').click({ modifiers: ['ControlOrMeta'] });
  await item(page, 'c').click({ modifiers: ['ControlOrMeta'] });
  await item(page, 'b').click({ modifiers: ['ControlOrMeta'] });
  await expect.poll(() => selOf(page)).toEqual(['a', 'c']);
  /* Delete：一起刪除、通知裡復原 */
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await docOf(page)).events.length).toBe(3);
  await expect(page.getByText('已刪除 2 個事件', { exact: true })).toBeVisible();
  await page.getByTestId('toast-action').click();
  await expect.poll(async () => (await docOf(page)).events.length).toBe(5);
  /* 觸控：長按加進選取、點一下只選它 */
  await item(page, 'a').click();
  const touch = (id: string, type: 'pointerdown' | 'pointerup') =>
    page.evaluate(
      ([id, type]) => {
        const el = document.querySelector(`[data-event-id="${id}"]`) as HTMLElement;
        const r = el.getBoundingClientRect();
        const ev = new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          clientX: r.x + 4,
          clientY: r.y + r.height / 2,
        });
        (type === 'pointerdown' ? el : window).dispatchEvent(ev);
      },
      [id, type] as const,
    );
  await touch('c', 'pointerdown');
  await expect.poll(() => selOf(page)).toEqual(['a', 'c']);
  await touch('c', 'pointerup');
  await expect.poll(() => selOf(page)).toEqual(['a', 'c']);
  await touch('b', 'pointerdown');
  await touch('b', 'pointerup');
  await expect.poll(() => selOf(page)).toEqual(['b']);
  expect(errors).toEqual([]);
});

test('多選：Shift＋點選一段、Shift＋拖曳框選、Ctrl＋A、Esc；年表的 Ctrl／Shift＋點選', async ({
  page,
}) => {
  await seed(page, DOC, DAY_WINDOW);
  const errors = await open(page);
  const { box, k, w } = await trackGeometry(page);
  /* Shift＋點選：A1（泳道甲 08:00）到 B1（泳道乙 10:00）之間 */
  await item(page, 'a').click();
  await item(page, 'b').click({ modifiers: ['Shift'] });
  await expect.poll(() => selOf(page)).toEqual(['a', 'b']);
  /* Esc 取消 */
  await page.keyboard.press('Escape');
  await expect.poll(() => selOf(page)).toEqual([]);
  /* 框選：泳道甲到泳道丙、11:00～17:00 → C1、D1 */
  const rowA = await center(page.getByTestId('timeline').locator('[data-lane-row="l1"]'));
  const rowC = await center(page.getByTestId('timeline').locator('[data-lane-row="l3"]'));
  const x = (min: number) => box.x + (min - w.start) * k;
  await page.keyboard.down('Shift');
  await page.mouse.move(x(11 * 60), rowA.b.y + 2);
  await page.mouse.down();
  await page.mouse.move(x(13 * 60), rowA.y, { steps: 3 });
  await expect(page.getByTestId('select-box')).toBeVisible();
  await page.mouse.move(x(17 * 60), rowC.b.y + rowC.b.height - 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect.poll(() => selOf(page)).toEqual(['c', 'd']);
  await expect(page.getByTestId('select-box')).toHaveCount(0);
  await expect(page.getByTestId('multi-count')).toHaveText('選了 2 個事件');
  /* Ctrl＋A：畫面上看得到的全部 */
  await page.getByTestId('timeline').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await expect.poll(() => selOf(page)).toEqual(['a', 'b', 'c', 'd', 'e']);
  /* 點空白處：取消選取 */
  await page.mouse.click(x(20 * 60), rowC.y);
  await expect.poll(() => selOf(page)).toEqual([]);
  /* 年表：Ctrl＋點選加減、Shift＋點選一段 */
  await page.getByRole('radio', { name: '年表' }).click();
  const ch = page.getByTestId('chronicle');
  await ch.locator('[data-chron-row="a"] button').click();
  await ch.locator('[data-chron-row="c"] button').click({ modifiers: ['ControlOrMeta'] });
  await expect.poll(() => selOf(page)).toEqual(['a', 'c']);
  await expect(ch.locator('[data-chron-row][data-selected]')).toHaveCount(2);
  await ch.locator('[data-chron-row="b"] button').click();
  await ch.locator('[data-chron-row="d"] button').click({ modifiers: ['Shift'] });
  await expect.poll(() => selOf(page)).toEqual(['b', 'c', 'd']);
  expect(errors).toEqual([]);
});

test('篩選：文字、泳道、淡化／藏起來、年表只列符合的、清除；只匯出篩選的結果', async ({ page }) => {
  await seed(page, DOC, DAY_WINDOW);
  const errors = await open(page);
  await page.getByTestId('filter-toggle').click();
  const panel = page.getByTestId('filter-panel');
  await expect(panel).toBeVisible();
  await field(page, 'filter-text').fill('港口');
  await expect(page.getByTestId('filter-status')).toHaveText(/篩選中：符合 1 個事件（共 5 個）/);
  await expect(page.getByTestId('filter-toggle')).toHaveAccessibleName('搜尋與篩選（1 個條件）');
  await expect(item(page, 'a')).toHaveAttribute('data-dim', 'true');
  await expect(item(page, 'c')).not.toHaveAttribute('data-dim', 'true');
  /* 藏起來 */
  await panel.getByRole('radio', { name: '藏起來' }).click();
  await expect(item(page, 'a')).toHaveCount(0);
  await expect(item(page, 'c')).toBeVisible();
  /* 泳道：泳道甲（文字清掉） */
  await field(page, 'filter-text').fill('');
  await panel.getByRole('group', { name: '泳道' }).getByRole('button', { name: '泳道甲' }).click();
  await expect(page.getByTestId('filter-status')).toHaveText(/符合 2 個事件/);
  await expect(item(page, 'a')).toBeVisible();
  await expect(item(page, 'b')).toHaveCount(0);
  /* GM 專用：只有 GM 專用（和泳道甲沒有交集） */
  await panel.getByRole('radio', { name: '只有 GM 專用' }).click();
  await expect(page.getByTestId('timeline-nomatch')).toBeVisible();
  await panel.getByRole('radio', { name: '全部', exact: true }).click();
  /* 年表只列符合的 */
  await page.getByRole('radio', { name: '年表' }).click();
  const ch = page.getByTestId('chronicle');
  await expect(ch.locator('[data-chron-row]')).toHaveCount(2);
  /* 匯出：只匯出篩選的結果（預設全部） */
  await page.getByRole('tab', { name: '匯出' }).click();
  const tab = page.getByTestId('export-tab');
  const textBox = tab.getByRole('textbox', { name: '年表文字' });
  await expect(textBox).toHaveValue(/B1/);
  await tab.getByRole('switch', { name: '只匯出篩選的結果' }).nth(1).click();
  await expect(textBox).not.toHaveValue(/B1/);
  await expect(textBox).toHaveValue(/A1/);
  await expect(textBox).toHaveValue(/D1/);
  /* 清除篩選 */
  await page.getByTestId('filter-clear').click();
  await expect(page.getByTestId('filter-status')).toHaveCount(0);
  await expect(ch.locator('[data-chron-row]')).toHaveCount(5);
  await expect(textBox).toHaveValue(/B1/);
  expect(errors).toEqual([]);
});

test('篩選：選「主線」只有主線的事件（最上層泳道的不算）', async ({ page }) => {
  await seed(
    page,
    {
      ...DOC,
      events: [...DOC.events, { ...blankEvent, id: 'm', title: 'M1', start: '第 1 天 06:00' }],
    },
    DAY_WINDOW,
  );
  const errors = await open(page);
  await page.getByTestId('filter-toggle').click();
  await page
    .getByTestId('filter-panel')
    .getByRole('group', { name: '泳道' })
    .getByRole('button', { name: '主線', exact: true })
    .click();
  await expect(page.getByTestId('filter-status')).toHaveText(/符合 1 個事件（共 6 個）/);
  await expect(item(page, 'm')).not.toHaveAttribute('data-dim', 'true');
  for (const id of ['a', 'b', 'c', 'd', 'e'])
    await expect(item(page, id)).toHaveAttribute('data-dim', 'true');
  expect(errors).toEqual([]);
});

test('範例的關聯線：委託信導致抵達、晚餐導致調查燈塔、兩次儀式（GM 專用）；PL 檢視只畫兩條', async ({
  page,
}) => {
  const errors = await open(page);
  const layer = page.getByTestId('link-layer');
  await expect(layer.locator('[data-link-id="lk-letter"]')).toHaveAttribute(
    'data-link-kind',
    'cause',
  );
  await expect(layer.locator('[data-link-id="lk-bell"] title')).toHaveText(
    '「旅館晚餐」導致「調查燈塔」：瑪莎提到燈塔的鐘聲，調查員決定去看看',
  );
  await expect(layer.locator('[data-link-id="lk-rite"]')).toHaveAttribute('data-secret', 'true');
  await page.keyboard.press('p');
  await expect(page.getByTestId('pl-badge')).toBeVisible();
  await expect(page.locator('[data-link-id]')).toHaveCount(2);
  await expect(page.locator('[data-link-id="lk-rite"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('篩選：PL 檢視的選項與輸入欄不含 GM 專用的值；GM 筆記只在 GM 檢視搜得到', async ({ page }) => {
  await seed(page, DOC, DAY_WINDOW);
  const errors = await open(page);
  await page.getByTestId('filter-toggle').click();
  await field(page, 'filter-text').fill('秘密筆記PSI');
  await expect(page.getByTestId('filter-status')).toHaveText(/符合 1 個事件/);
  /* PL 檢視：自己的篩選（空的），選項沒有 GM 專用的地點 */
  await page.getByRole('radio', { name: /^PL 檢視/ }).click();
  await expect(page.getByTestId('pl-badge')).toBeVisible();
  await expect(field(page, 'filter-text')).toHaveValue('');
  await expect(page.getByTestId('filter-status')).toHaveCount(0);
  const text = await domText(page);
  expect(text).not.toContain('秘密筆記PSI');
  expect(text).not.toContain('秘密地點XI');
  await expect(
    page.getByTestId('filter-panel').getByRole('group', { name: '地點' }).getByRole('button'),
  ).toHaveText(['港口']);
  /* PL 檢視搜 GM 筆記：沒有 */
  await field(page, 'filter-text').fill('秘密');
  await expect(page.getByTestId('filter-status')).toHaveText(/符合 0 個事件（共 4 個）/);
  /* 回 GM 檢視：GM 的篩選還在 */
  await page.getByRole('radio', { name: /^GM 檢視/ }).click();
  await expect(field(page, 'filter-text')).toHaveValue('秘密筆記PSI');
  expect(errors).toEqual([]);
});

/** 架空年的小專案 */
const YEAR_DOC = {
  ...DOC,
  title: '王國',
  mode: 'year',
  era: '王國曆',
  lanes: [],
  categories: [],
  events: [{ ...blankEvent, id: 'k', title: '登基', start: '302' }],
};

test('架空曆：打開月份、改名、輸入月日、年表的段與刻度；天數變少時調整（復原）；星期；關掉月份', async ({
  page,
}) => {
  await seed(page, YEAR_DOC);
  const errors = await open(page);
  await page.getByRole('tab', { name: '專案' }).click();
  await page.getByRole('switch', { name: '使用月份與日' }).click();
  await expect(page.getByTestId('cal-summary')).toHaveText('一年 12 個月、360 天');
  await expect.poll(async () => (await docOf(page)).calendar.months.length).toBe(12);
  /* 只到年的事件不受影響 */
  expect((await evOf(page, 'k'))?.start).toBe('302');
  /* 第 1 個月改名「霜月」 */
  const name1 = field(page, 'month-name').first();
  await name1.fill('霜月');
  await name1.blur();
  await expect.poll(async () => (await docOf(page)).calendar.months[0].name).toBe('霜月');
  /* 選事件，開始寫到日 */
  await page.getByRole('tab', { name: '事件' }).click();
  await item(page, 'k').click();
  const start = field(page, 'start');
  await start.fill('王國曆 302 年 霜月 5 日');
  await expect(page.getByText('＝ 王國曆 302 年 霜月 5 日', { exact: true })).toBeVisible();
  await start.press('Enter');
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('302-01-05');
  await expect(start).toHaveValue('302-01-05');
  /* 全覽後刻度寫月份 */
  await page.getByTestId('fit').click();
  await expect(
    page.getByTestId('timeline').locator('[data-axis-major="302 年 霜月"]'),
  ).toBeVisible();
  /* 年表的段 */
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(
    page.getByTestId('chronicle').locator('[data-section="王國曆 302 年 霜月 5 日"]'),
  ).toBeVisible();
  /* 霜月改成 3 天：5 日改成 3 日，通知；復原 */
  await page.getByRole('tab', { name: '專案' }).click();
  const days1 = page.getByRole('spinbutton', { name: '第 1 個月的天數' });
  await days1.fill('3');
  await days1.press('Enter');
  await expect(
    page.getByText('1 個時間跟著月份調整了（刪掉的月份、天數變少）', { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('302-01-03');
  /* 通知裡的「復原」（焦點還在數字欄裡，Ctrl＋Z 是欄位自己的） */
  await page.getByTestId('toast-action').last().click();
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('302-01-05');
  expect((await docOf(page)).calendar.months[0].days).toBe(30);
  /* 星期 */
  const wk = field(page, 'weekdays');
  await wk.fill('日、月、火');
  await wk.blur();
  await expect.poll(async () => (await docOf(page)).calendar.weekdays).toEqual(['日', '月', '火']);
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(
    page.getByTestId('chronicle').locator('[data-section^="王國曆 302 年 霜月 5 日（"]'),
  ).toBeVisible();
  /* 關掉月份：先確認，只留年 */
  await page.getByRole('switch', { name: '使用月份與日' }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('1 個事件或標記寫到月、日');
  await expect(dlg).toContainText('登基：王國曆 302 年 霜月 5 日');
  await dlg.getByRole('button', { name: '只留年' }).click();
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('302');
  expect((await docOf(page)).calendar.months).toEqual([]);
  expect(errors).toEqual([]);
});

test('關聯線：從圓點拖到另一個事件、種類與說明、GM 專用（PL 不畫）、刪掉事件時一起刪（復原）、找事件加上', async ({
  page,
}) => {
  await seed(page, DOC, DAY_WINDOW);
  const errors = await open(page);
  await item(page, 'a').click();
  const handle = page.getByTestId('link-handle');
  await expect(handle).toBeVisible();
  const h = await center(handle);
  const b = await center(item(page, 'b'));
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(h.x + 20, h.y + 5, { steps: 3 });
  await expect(page.getByTestId('link-draft')).toBeVisible();
  await page.mouse.move(b.b.x + 6, b.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await docOf(page)).links.length).toBe(1);
  const link = (await docOf(page)).links[0];
  expect(link).toMatchObject({ from: 'a', to: 'b', kind: 'cause', gm: false });
  await expect(page.getByText('已加上關聯線：「A1」→「B1」', { exact: true })).toBeVisible();
  const layer = page.getByTestId('link-layer');
  await expect(layer.locator(`[data-link-id="${link.id}"]`)).toHaveAttribute(
    'data-link-kind',
    'cause',
  );
  await expect(layer.locator(`[data-link-id="${link.id}"] polygon`)).toHaveCount(1);
  /* 事件分頁：種類、說明、GM 專用 */
  const row = page.locator(`[data-link-row="${link.id}"]`);
  await row.getByRole('combobox', { name: '關聯的種類' }).click();
  await page.getByRole('option', { name: '矛盾' }).click();
  await expect.poll(async () => (await docOf(page)).links[0].kind).toBe('conflict');
  await row.locator('[data-field="link-note"]').fill('時間對不上');
  await row.locator('[data-field="link-note"]').blur();
  await expect.poll(async () => (await docOf(page)).links[0].note).toBe('時間對不上');
  await expect(layer.locator(`[data-link-id="${link.id}"] title`)).toHaveText(
    '「A1」與「B1」矛盾：時間對不上',
  );
  await row.getByRole('button', { name: 'GM 專用的關聯線' }).click();
  await expect.poll(async () => (await docOf(page)).links[0].gm).toBe(true);
  await expect(layer.locator(`[data-link-id="${link.id}"]`)).toHaveAttribute('data-secret', 'true');
  /* PL 檢視：GM 專用的線不畫，也不出現在頁面上 */
  await page.keyboard.press('p');
  await expect(page.getByTestId('pl-badge')).toBeVisible();
  await expect(page.locator('[data-link-id]')).toHaveCount(0);
  expect(await domText(page)).not.toContain('時間對不上');
  await page.getByRole('radio', { name: /^GM 檢視/ }).click();
  /* 刪掉 B1：線一起刪；復原時一起回來 */
  await item(page, 'b').click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await docOf(page)).links.length).toBe(0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await docOf(page)).links.length).toBe(1);
  /* 找事件加上：A1 → C1 */
  await item(page, 'a').click();
  await field(page, 'link-search').fill('C1');
  await page.locator('[data-link-pick="c"]').click();
  await expect.poll(async () => (await docOf(page)).links.length).toBe(2);
  expect((await docOf(page)).links[1]).toMatchObject({ from: 'a', to: 'c', kind: 'cause' });
  /* 選了兩個：多選的「加上關聯線」 */
  await item(page, 'c').click();
  await item(page, 'd').click({ modifiers: ['ControlOrMeta'] });
  await page.getByTestId('multi-link').click();
  await expect.poll(async () => (await docOf(page)).links.length).toBe(3);
  expect(errors).toEqual([]);
});

const VIS_ITEMS = [
  {
    id: 1,
    content: '<b>開場</b>',
    start: '2014-04-20T08:00:00',
    group: 'pc',
    title: '說明<br>第二行',
  },
  {
    id: 2,
    content: '調查',
    start: '2014-04-21',
    end: '2014-04-23',
    group: 'npc1',
    className: 'clue',
  },
  { id: 3, content: '暴風雨', start: '2014-04-19', end: '2014-04-22', type: 'background' },
  { id: 4, content: '壞的', start: '明天' },
  {
    id: 5,
    content: '點',
    start: '2014-04-22T12:30',
    type: 'point',
    subgroup: 'x',
    editable: false,
  },
];
const VIS_GROUPS = [
  { id: 'pc', content: '調查員', order: 1 },
  { id: 'npcs', content: '<i>NPC</i>', nestedGroups: ['npc1'], showNested: false, order: 2 },
  { id: 'npc1', content: '管家', order: 3 },
];

test('讀入 vis-timeline：貼上 items／groups（取代）、拖進兩個 JSON 檔（加入）；略過的欄位通知', async ({
  page,
}) => {
  await seed(page, DOC, DAY_WINDOW);
  const errors = await open(page);
  await page.getByRole('tab', { name: '匯出' }).click();
  await page.getByTestId('vis-paste').click();
  await field(page, 'vis-items').fill('[{"start": ');
  await page.getByTestId('vis-read').click();
  await expect(page.getByText(/項目（items）的 JSON 格式錯誤/)).toBeVisible();
  await field(page, 'vis-items').fill(JSON.stringify(VIS_ITEMS));
  await field(page, 'vis-groups').fill(JSON.stringify(VIS_GROUPS));
  await page.getByTestId('vis-read').click();
  const choice = page.getByRole('alertdialog');
  await expect(choice).toContainText('讀入 vis-timeline 的 4 個項目');
  await expect(choice).toContainText('日期時間會換算過去');
  await choice.getByRole('button', { name: '取代全部的事件' }).click();
  await expect(page.getByText('已讀入 4 個事件', { exact: true })).toBeVisible();
  await expect(
    page.getByText('略過的欄位：subgroup（1）、editable（1）', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('1 個項目沒有讀入（第 4 個：看不懂 start）', { exact: true }),
  ).toBeVisible();
  const doc = await docOf(page);
  expect(doc.events.map((e) => [e.title, e.kind, e.start, e.end])).toEqual([
    ['開場', 'point', '第 2 天 08:00', ''],
    ['調查', 'range', '第 3 天', '第 4 天'],
    ['暴風雨', 'background', '第 1 天', '第 3 天'],
    ['點', 'point', '第 4 天 12:30', ''],
  ]);
  const names = doc.lanes.map((l) => l.name);
  expect(names).toEqual(expect.arrayContaining(['調查員', 'NPC', '管家']));
  const npc = doc.lanes.find((l) => l.name === 'NPC');
  expect(doc.lanes.find((l) => l.name === '管家')?.parentId).toBe(npc?.id);
  /* showNested: false → 收合 */
  await expect(
    page.getByTestId('timeline').getByRole('button', { name: '展開「NPC」' }),
  ).toBeVisible();
  /* 拖進兩個檔（items、groups 分開）：加入 */
  await dropFiles(page, [
    {
      name: 'items.json',
      type: 'application/json',
      text: JSON.stringify([{ content: '追加', start: '2014-04-24', group: 'pc' }]),
    },
    { name: 'groups.json', type: 'application/json', text: JSON.stringify(VIS_GROUPS) },
  ]);
  await page.getByRole('alertdialog').getByRole('button', { name: '加入' }).click();
  await expect(page.getByText('已讀入 1 個事件', { exact: true })).toBeVisible();
  const after = await docOf(page);
  expect(after.events).toHaveLength(5);
  /* 同名的泳道沿用 */
  expect(after.lanes.filter((l) => l.name === '調查員')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('第一批的小事：version 99 與看不懂的寫法要通知；360 寬背景的標題不被同位置的事件蓋住', async ({
  page,
}) => {
  const bgDoc = {
    ...DOC,
    lanes: [],
    events: [
      {
        ...blankEvent,
        id: 'fog',
        title: '濃霧',
        kind: 'background',
        start: '第 1 天 08:00',
        end: '第 1 天 20:00',
      },
      { ...blankEvent, id: 'arrive', title: '抵達車站', start: '第 1 天 08:00' },
      { ...blankEvent, id: 'train', title: '火車', start: '第 1 天 09:00' },
    ],
  };
  await seed(page, bgDoc, { ...DAY_WINDOW, view: 'timeline' });
  const errors = await open(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByTestId('fit').click();
  const label = await page.locator('[data-event-id="fog"] [data-band-label]').boundingBox();
  for (const id of ['arrive', 'train']) {
    const b = await item(page, id).boundingBox();
    if (!label || !b) throw new Error('no box');
    const overlap =
      label.x < b.x + b.width &&
      b.x < label.x + label.width &&
      label.y < b.y + b.height &&
      b.y < label.y + label.height;
    expect(overlap, `背景的標題和「${id}」重疊`).toBe(false);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  const project = (version: number, data: object) =>
    JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-timeline',
      version,
      savedAt: '2026-10-29T00:00:00.000Z',
      data,
    });
  await dropFiles(page, [
    {
      name: '新版.json',
      type: 'application/json',
      text: project(99, { title: '新版', mode: 'galaxy', events: [] }),
    },
  ]);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect(
    page.getByText(
      '這個專案檔是比較新的版本（第 99 版；這裡是第 3 版），新版才有的資料可能沒有讀入。',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('看不懂時間寫法「galaxy」，當成日期時間讀入。', { exact: true }),
  ).toBeVisible();
  expect((await docOf(page)).mode).toBe('date');
  expect(errors).toEqual([]);
});

test('效能：3000 個事件＋1500 條關聯線的縮放、平移、框選', { tag: '@serial' }, async ({ page }) => {
  test.setTimeout(180_000);
  const lanes = Array.from({ length: 20 }, (_, i) => lane(`L${i}`, `泳道${i}`));
  const events = Array.from({ length: 3000 }, (_, i) => {
    const day = 1 + Math.floor(i / 100);
    const minute = (i % 100) * 13;
    const hh = String(Math.floor(minute / 60) % 24).padStart(2, '0');
    const mm = String(minute % 60).padStart(2, '0');
    return {
      ...blankEvent,
      id: `E${i}`,
      title: `事件${i}`,
      kind: i % 7 === 0 ? 'range' : 'point',
      start: `第 ${day} 天 ${hh}:${mm}`,
      end: i % 7 === 0 ? `第 ${day + 1} 天 ${hh}:${mm}` : '',
      laneId: `L${i % 20}`,
    };
  });
  /* 關聯線的數目（比較用：ST_PERF_LINKS=0 量沒有線時） */
  const nLinks = Number(process.env.ST_PERF_LINKS ?? 1500);
  const links = Array.from({ length: nLinks }, (_, i) => ({
    id: `K${i}`,
    from: `E${i * 2}`,
    to: `E${i * 2 + 1}`,
    kind: (['cause', 'same', 'conflict', 'related'] as const)[i % 4],
    note: '',
    gm: false,
  }));
  await seed(page, { ...DOC, lanes, events, links }, { view: 'timeline' });
  const errors = await open(page);
  await expect(page.getByTestId('timeline').locator('[data-event-id]').first()).toBeVisible({
    timeout: 60_000,
  });
  const { box } = await trackGeometry(page);
  const linksDrawn = await page.locator('[data-link-id]').count();
  /* 縮放：滾輪一格（全覽、全部在畫面上） */
  const time = async (fn: () => Promise<void>) => {
    const t0 = await page.evaluate(() => performance.now());
    await fn();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    return (await page.evaluate(() => performance.now())) - t0;
  };
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  const zoom = await time(async () => {
    await page.mouse.wheel(0, -100);
  });
  /* 平移：拖曳 10 步 */
  const pan = await time(async () => {
    await page.mouse.move(box.x + 200, box.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 200 + i * 20, box.y + 300);
    await page.mouse.up();
  });
  /* 框選：Shift＋拖曳 10 步 */
  const select = await time(async () => {
    await page.keyboard.down('Shift');
    await page.mouse.move(box.x + 50, box.y + 20);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 50 + i * 40, box.y + 20 + i * 30);
    await page.mouse.up();
    await page.keyboard.up('Shift');
  });
  const selected = (await selOf(page)).length;
  console.log(
    `[效能] 關聯線畫在畫面上 ${linksDrawn} 條；滾輪縮放 ${Math.round(zoom)} ms、拖曳平移 10 步 ${Math.round(pan)} ms、框選 10 步 ${Math.round(select)} ms（選了 ${selected} 個）`,
  );
  expect(selected).toBeGreaterThan(0);
  expect(zoom).toBeLessThan(5000);
  expect(pan).toBeLessThan(15000);
  expect(select).toBeLessThan(15000);
  expect(errors).toEqual([]);
});
