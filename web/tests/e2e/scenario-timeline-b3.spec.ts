/**
 * 劇本時間表第三批（規格 F110、F111）的端對端測試（建置產物）：
 * - 年表列出關聯線：範例的「→ 導致」「← 起因」、GM 專用的線（GM 檢視標出、PL 檢視整頁沒有）、開關（年表檢視與匯出各一個）、
 *   複製成文字與列印、篩選中只列兩端都符合的線。
 * - 架空曆寫到時刻：打開「寫到時刻」、輸入時刻、刻度放大到一天以內、方向鍵與拖曳照分吸附、年表的段與時刻、
 *   CSV 匯出再讀入、專案檔、關掉時刻（確認、復原）、沒打開時寫時刻的錯誤、換寫法的提示。
 * - 第二批（版本 2）的自動存檔照讀，沒有多出 clock。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
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
}
interface Doc {
  title: string;
  mode: string;
  events: Ev[];
  markers: { id: string; time: string }[];
  calendar: { months: { id: string }[]; weekdays: string[]; weekStart: number; clock?: boolean };
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
  __scenarioTimeline: { doc: () => Doc; win: () => { start: number; end: number } };
};
const docOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Api).__scenarioTimeline.doc());
const winOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Api).__scenarioTimeline.win());
const evOf = async (page: Page, id: string) => (await docOf(page)).events.find((e) => e.id === id);
const item = (page: Page, id: string) =>
  page.getByTestId('timeline').locator(`[data-event-id="${id}"]`);
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);
const chronRow = (page: Page, id: string) =>
  page.getByTestId('chronicle').locator(`[data-chron-row="${id}"]`);

/** 開頁前放好資料（只放一次；重新整理不會蓋掉） */
async function seed(page: Page, data: object, prefs?: object, version = 3) {
  await page.addInitScript(
    ([k, v, pk, pv]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(k, v);
      if (pv) localStorage.setItem(pk, pv);
    },
    [
      STORE_KEY,
      JSON.stringify({ state: { data }, version }),
      PREFS_KEY,
      prefs ? JSON.stringify({ state: { data: prefs }, version: 1 }) : '',
    ],
  );
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

const months12 = Array.from({ length: 12 }, (_, i) => ({
  id: `mo${i + 1}`,
  name: i === 0 ? '霜月' : `${i + 1} 月`,
  days: 30,
}));

/** 架空曆（12 個月、每月 30 天）：登基（只到日）、早朝、晚宴（期間） */
const CAL_DOC = {
  title: '王國',
  mode: 'year',
  era: '王國曆',
  dayOne: '',
  sample: false,
  showNow: false,
  lanes: [],
  categories: [],
  events: [
    { ...blankEvent, id: 'k', title: '登基', start: '302-01-05' },
    { ...blankEvent, id: 'm', title: '早朝', start: '302-01-06' },
  ],
  markers: [],
  progress: { on: false, time: '', plOnly: false },
  calendar: { months: months12, weekdays: [], weekStart: 0 },
  links: [],
};

/* ---------- 年表列出關聯線（F111） ---------- */

test('年表列出關聯線：範例的導致與起因、GM 專用的線、開關、複製與列印、PL 檢視整頁沒有 GM 的線', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await page.keyboard.press('v');
  await expect(page.getByTestId('chronicle')).toBeVisible();
  const linksSwitch = page.getByRole('switch', { name: '列出關聯線' });
  await expect(linksSwitch).toBeChecked();
  await expect(chronRow(page, 'ex-letter').locator('[data-chron-link]')).toHaveText([
    '→ 導致：抵達黑水灣車站（收到霍爾的信才來黑水灣）',
  ]);
  await expect(chronRow(page, 'ex-arrive').locator('[data-chron-link]')).toHaveText([
    '← 起因：委託信寄出（收到霍爾的信才來黑水灣）',
  ]);
  /* GM 專用的線：GM 檢視標出（琥珀色、GM 小標） */
  const rite = chronRow(page, 'ex-rite1').locator('[data-chron-link]');
  await expect(rite).toHaveAttribute('data-secret', 'true');
  await expect(rite).toContainText('→ 導致：第二次儀式');
  /* 複製成文字 */
  await page.getByTestId('copy-text').click();
  await expect(page.getByText('已複製年表', { exact: true })).toBeVisible();
  let text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('　　→ 導致：抵達黑水灣車站（收到霍爾的信才來黑水灣）\n');
  expect(text).toContain(
    '　　→ 導致：第二次儀式（第一次失敗，深潮會要在滿月之後再試一次）〔GM 專用〕\n',
  );
  /* 列印文件也有 */
  await page.getByTestId('print').click();
  const frame = page.frameLocator('iframe[data-paged-print]');
  await expect(frame.locator('.link').first()).toBeVisible();
  await expect(frame.locator('.link.gm')).toHaveCount(2);
  /* 關掉：年表、複製都不列 */
  await linksSwitch.click();
  await expect(page.getByTestId('chronicle').locator('[data-chron-link]')).toHaveCount(0);
  await page.getByTestId('copy-text').click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .not.toContain('→ 導致');
  await linksSwitch.click();
  await expect(chronRow(page, 'ex-letter').locator('[data-chron-link]')).toHaveCount(1);
  /* 篩選：只有「委託信」符合 → 另一端不在年表裡，不列 */
  await page.getByTestId('filter-toggle').click();
  await field(page, 'filter-text').fill('委託信');
  await expect(
    page.getByTestId('chronicle').locator('[data-chron-row][data-kind="event"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('chronicle').locator('[data-chron-link]')).toHaveCount(0);
  await page.getByTestId('filter-clear').click();
  /* PL 檢視：GM 專用的線（與它的說明）整頁都沒有；PL 看得到的線照樣列 */
  await page.keyboard.press('p');
  await expect(page.getByTestId('chronicle').locator('[data-chron-link]')).toHaveCount(4);
  await expect(page.getByTestId('chronicle').locator('[data-chron-link][data-secret]')).toHaveCount(
    0,
  );
  /* GM 檢視印過的列印文件（iframe 的 srcdoc）也拿掉了 */
  await expect(page.locator('iframe[data-paged-print]')).toHaveCount(0);
  const dom = await domText(page);
  expect(dom).not.toContain('第一次失敗');
  expect(dom).not.toContain('第二次儀式');
  await page.getByTestId('copy-text').click();
  text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('　　← 起因：旅館晚餐（瑪莎提到燈塔的鐘聲，調查員決定去看看）\n');
  expect(text).not.toContain('GM');
  expect(errors).toEqual([]);
});

test('匯出的年表文字：列出關聯線的開關（PL 用不列 GM 專用的線）', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '匯出' }).click();
  const tab = page.getByTestId('export-tab');
  const box = tab.getByRole('textbox', { name: '年表文字' });
  await expect(box).toHaveValue(/　　→ 導致：抵達黑水灣車站（收到霍爾的信才來黑水灣）\n/);
  await expect(box).not.toHaveValue(/第二次儀式/);
  /* GM 用：GM 專用的線標〔GM 專用〕 */
  await tab.getByRole('radio', { name: 'GM 用' }).nth(1).click();
  await expect(box).toHaveValue(
    /→ 導致：第二次儀式（第一次失敗，深潮會要在滿月之後再試一次）〔GM 專用〕/,
  );
  /* Markdown */
  await tab.getByRole('radio', { name: 'Markdown' }).click();
  await expect(box).toHaveValue(/\n {2}- → 導致：抵達黑水灣車站（收到霍爾的信才來黑水灣）\n/);
  /* 關掉 */
  await tab.getByRole('switch', { name: '列出關聯線' }).click();
  await expect(box).not.toHaveValue(/→ 導致/);
  /* 年表檢視的開關是另一個（不受影響） */
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(
    page.getByTestId('chronicle').getByRole('switch', { name: '列出關聯線' }),
  ).toBeChecked();
  expect(errors).toEqual([]);
});

/* ---------- 架空曆寫到時刻（F110） ---------- */

test('架空曆寫到時刻：打開、輸入、刻度到時刻、方向鍵與拖曳照分吸附、年表、關掉（確認、復原）', async ({
  page,
}) => {
  await seed(page, CAL_DOC, { view: 'timeline', windows: {} });
  const errors = await open(page);
  /* 沒打開時寫時刻：說明要先打開 */
  await item(page, 'k').click();
  const start = field(page, 'start');
  await start.fill('302-1-5 14:30');
  await expect(
    page.getByText('要寫時刻時，先在「專案」分頁的「月份與日」打開「寫到時刻」', { exact: true }),
  ).toBeVisible();
  await start.press('Escape');
  await expect(start).toHaveValue('302-01-05');
  /* 打開「寫到時刻」 */
  await page.getByRole('tab', { name: '專案' }).click();
  await page.getByRole('switch', { name: '寫到時刻' }).click();
  await expect.poll(async () => (await docOf(page)).calendar.clock).toBe(true);
  expect((await evOf(page, 'k'))?.start).toBe('302-01-05');
  /* 輸入時刻（寬鬆的寫法） */
  await page.getByRole('tab', { name: '事件' }).click();
  await item(page, 'k').click();
  await start.fill('王國曆 302 年 霜月 5 日 14：30');
  await expect(page.getByText('＝ 王國曆 302 年 霜月 5 日 14:30', { exact: true })).toBeVisible();
  await start.press('Enter');
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('302-01-05 14:30');
  await expect(start).toHaveValue('302-01-05 14:30');
  /* 換成期間：預設的結束是一小時後 */
  await page.getByRole('radio', { name: '期間' }).click();
  await expect.poll(async () => (await evOf(page, 'k'))?.end).toBe('302-01-05 15:30');
  await page.getByRole('radio', { name: '時間點' }).click();
  await expect.poll(async () => (await evOf(page, 'k'))?.kind).toBe('point');
  /* 放大到一天以內：刻度寫時刻、上排寫日子 */
  const tl = page.getByTestId('timeline');
  await page.getByTestId('fit').click();
  const clockTicks = () =>
    tl.evaluate(
      (el) =>
        [...el.querySelectorAll('[data-axis-minor]')]
          .map((x) => x.getAttribute('data-axis-minor') ?? '')
          .filter((t) => /^\d\d:\d\d$/.test(t)).length,
    );
  for (let i = 0; i < 12 && (await clockTicks()) < 2; i++) {
    const before = await winOf(page);
    await page.getByTestId('zoom-in').click();
    await expect
      .poll(async () => {
        const w = await winOf(page);
        return w.end - w.start;
      })
      .toBeLessThan(before.end - before.start);
  }
  expect(await clockTicks()).toBeGreaterThanOrEqual(2);
  await expect(tl.locator('[data-axis-major^="302 年 霜月 5 日"]')).toBeVisible();
  /* 方向鍵：往後一個吸附單位（寫到分的仍寫到分；只到日的仍然一次 1 日） */
  await item(page, 'k').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await evOf(page, 'k'))?.start).not.toBe('302-01-05 14:30');
  const moved = (await evOf(page, 'k'))?.start ?? '';
  expect(moved).toMatch(/^302-01-05 1[45]:\d\d$/);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('302-01-05 14:30');
  /* 拖曳：往右拖一段，照分吸附（仍寫到分） */
  const box = await item(page, 'k').boundingBox();
  const track = await page.getByTestId('track').boundingBox();
  if (!box || !track) throw new Error('no box');
  const w = await winOf(page);
  const k = track.width / (w.end - w.start);
  /* 一小時的寬 */
  const hourPx = (1 / (360 * 24)) * k;
  /* 時間點的圓點在左邊 */
  const x = box.x + 6;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 6, y, { steps: 2 });
  await page.mouse.move(x + hourPx * 2, y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toMatch(/^302-01-05 1[67]:\d\d$/);
  /* 新事件（N 鍵）：吸附到分時寫到分 */
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  await expect.poll(async () => (await docOf(page)).events.length).toBe(3);
  const added = (await docOf(page)).events[2];
  expect(added.start).toMatch(/^302-01-0[56] \d\d:\d\d$/);
  /* 年表：每天一段、段裡寫時刻 */
  await page.getByRole('radio', { name: '年表' }).click();
  const sec = page.getByTestId('chronicle').locator('[data-section="王國曆 302 年 霜月 5 日"]');
  await expect(sec).toBeVisible();
  await expect(chronRow(page, 'k').locator('[data-chron-time]')).toHaveText(/^1[67]:\d\d$/);
  await expect(chronRow(page, 'm').locator('[data-chron-time]')).toHaveText('整天');
  /* 關掉「寫到時刻」：先確認，只留日子；復原 */
  await page.getByRole('tab', { name: '專案' }).click();
  await page.getByRole('switch', { name: '寫到時刻' }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('2 個事件或標記寫到時刻，會只留下日子');
  await expect(dlg).toContainText('登基：王國曆 302 年 霜月 5 日 1');
  await dlg.getByRole('button', { name: '只留日子' }).click();
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('302-01-05');
  expect((await docOf(page)).calendar).not.toHaveProperty('clock');
  await page.getByRole('button', { name: /^復原（/ }).click();
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toMatch(/^302-01-05 1[67]:\d\d$/);
  expect((await docOf(page)).calendar.clock).toBe(true);
  /* 放大到頭：最短 60 分（放大鈕停用） */
  await page.getByRole('radio', { name: '時間軸' }).click();
  const zoomIn = page.getByTestId('zoom-in');
  for (let i = 0; i < 30 && (await zoomIn.isEnabled()); i++) {
    const before = await winOf(page);
    await zoomIn.click();
    await expect
      .poll(async () => {
        const w = await winOf(page);
        return w.end - w.start;
      })
      .toBeLessThan(before.end - before.start);
  }
  await expect(zoomIn).toBeDisabled();
  const least = await winOf(page);
  expect((least.end - least.start) * 360 * 1440).toBeCloseTo(60, 3);
  expect(errors).toEqual([]);
});

test('架空曆寫到時刻：CSV 匯出再貼上讀入、專案檔存了再開逐欄相同；換寫法的提示', async ({
  page,
}) => {
  const doc = {
    ...CAL_DOC,
    calendar: { ...CAL_DOC.calendar, clock: true },
    events: [
      { ...blankEvent, id: 'k', title: '登基', start: '302-01-05 14:30' },
      {
        ...blankEvent,
        id: 'r',
        title: '晚宴',
        kind: 'range',
        start: '303-02-01 18:00',
        end: '303-02-02 01:15',
      },
    ],
    markers: [{ id: 'mk', label: '鐘響', time: '302-01-05 12:00', color: '#8a63d2', gm: false }],
  };
  await seed(page, doc, { view: 'timeline' });
  const errors = await open(page);
  /* CSV 匯出 */
  await page.getByRole('tab', { name: '匯出' }).click();
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('csv-export').click(),
  ]);
  const csvText = readFileSync(await csv.path(), 'utf8');
  expect(csvText).toContain('302-01-05 14:30');
  expect(csvText).toContain('303-02-01 18:00,303-02-02 01:15');
  /* 貼上讀入（取代）：逐欄相同 */
  const before = (await docOf(page)).events.map((e) => [e.title, e.kind, e.start, e.end]);
  await page.getByTestId('csv-paste').click();
  await field(page, 'paste').fill(csvText.replace(/^\uFEFF/, ''));
  await page.getByTestId('paste-read').click();
  await page.getByRole('button', { name: '取代全部的事件' }).click();
  await expect(page.getByText('已讀入 2 個事件', { exact: true })).toBeVisible();
  const after = (await docOf(page)).events.map((e) => [e.title, e.kind, e.start, e.end]);
  const sort = (l: string[][]) => [...l].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  expect(sort(after)).toEqual(sort(before));
  /* 專案檔：存了再開 */
  await page.getByRole('button', { name: /^專案/ }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  const saved = JSON.parse(readFileSync(await file.path(), 'utf8'));
  expect(saved.version).toBe(3);
  expect(saved.data.calendar.clock).toBe(true);
  expect(saved.data.markers[0].time).toBe('302-01-05 12:00');
  await page.getByRole('button', { name: /^專案/ }).click();
  await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(await file.path());
  await expect(page.getByText('已開啟專案檔', { exact: true }).first()).toBeVisible();
  const reopened = await docOf(page);
  expect(reopened.events.map((e) => [e.title, e.kind, e.start, e.end])).toEqual(
    saved.data.events.map((e: Ev) => [e.title, e.kind, e.start, e.end]),
  );
  expect(reopened.calendar.clock).toBe(true);
  /* 換成日期時間：時刻只留年，列在會失去精度的例子裡 */
  await page.getByRole('tab', { name: '專案' }).click();
  await page.getByRole('radio', { name: '日期時間' }).click();
  const lossy = page.getByRole('dialog', { name: '換成「日期時間」' }).getByTestId('convert-lossy');
  await expect(lossy).toContainText('登基：王國曆 302 年 霜月 5 日 14:30 → 302年');
  expect(errors).toEqual([]);
});

test('最後一年（999999）：拖曳可以到年底；拖過頭時是最後一天（驗證後）', async ({ page }) => {
  /* 12 個月 × 30 天；畫面範圍 999999 年 12 月 1 日～年底 */
  const start = 999999 + 330 / 360;
  await seed(
    page,
    { ...CAL_DOC, events: [{ ...blankEvent, id: 'k', title: '末日', start: '999999-12-10' }] },
    { view: 'timeline', windows: { year: { start, end: 1000000 } } },
  );
  const errors = await open(page);
  const dragBy = async (days: number) => {
    const box = await item(page, 'k').boundingBox();
    const track = await page.getByTestId('track').boundingBox();
    if (!box || !track) throw new Error('no box');
    const w = await winOf(page);
    const px = (days / 360) * (track.width / (w.end - w.start));
    const x = box.x + 6;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 6, y, { steps: 2 });
    await page.mouse.move(x + px, y, { steps: 8 });
    await page.mouse.up();
  };
  await dragBy(5);
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('999999-12-15');
  await dragBy(-3);
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('999999-12-12');
  /* 拖過年底：最後一天 */
  await dragBy(25);
  await expect.poll(async () => (await evOf(page, 'k'))?.start).toBe('999999-12-30');
  expect(errors).toEqual([]);
});

test('第二批（版本 2）的自動存檔照讀：架空曆沒有多出 clock，時間不變', async ({ page }) => {
  await seed(page, CAL_DOC, { view: 'timeline' }, 2);
  const errors = await open(page);
  const doc = await docOf(page);
  expect(doc.calendar).toEqual(CAL_DOC.calendar);
  expect(doc.events.map((e) => e.start)).toEqual(['302-01-05', '302-01-06']);
  await expect(item(page, 'k')).toBeVisible();
  /* 版本 2 的存檔讀進來後照常可以打開「寫到時刻」 */
  await page.getByRole('tab', { name: '專案' }).click();
  await expect(page.getByRole('switch', { name: '寫到時刻' })).not.toBeChecked();
  expect(errors).toEqual([]);
});
