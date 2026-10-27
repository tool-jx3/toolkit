/**
 * 團期行事曆（建置產物 next/session-calendar/）的端對端測試：
 * - 開頁沒有 pageerror／console error；範例、國定假日與補假、頁尾只放靈感來源。
 * - 新增場次（對話框）、準備事項（新增、勾選、清單拖曳排序）、詳細、刪除與復原。
 * - 拖曳：在日子上拖過幾天新增預定、拖曳色條換日子（天數不變）；Shift＋方向鍵移動；雙擊新增場次。
 * - 年曆／月曆：切換、點月份打開月曆、PageDown、週一開始；推算年份的說明。
 * - 匯出入：JSON、iCal（解析下載的檔案）；讀入卓準備カレンダー、taku_calendar 的 JSON、Google 日曆匯出的 ZIP（選行事曆）。
 * - 空檔日期（條件、格式、複製）；存成 PNG（月曆、年曆，檢查 PNG 與尺寸）；外觀（花紋背景、自動配色）。
 * - 送到跑團紀錄簿（新分頁的紀錄簿問要不要加入、加入後的列）與團報產生器（交接資料）。
 * - 雙擊（沒有選取時）日子、小卡、今天的預定、日子清單都直接打開；第一下不推動版面（1280、390）。
 * - 拖到月曆外放開＝取消；選單打開的對話框關掉後焦點回到選單按鈕；連結網址的檢查；讀入超過 5000 筆。
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('session-calendar') ?? { id: 'session-calendar', status: 'next' })}/`;
const STORE_KEY = 'trpg-toolkit:session-calendar';
const LOG_KEY = 'trpgWebTools.sessionLogTracker.pendingImport';
const REPORT_KEY = 'trpgWebTools.sessionReportGenerator.pendingImport';
const NOW = new Date('2026-10-27T10:00:00+08:00');

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.clock.install({ time: NOW });
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '團期行事曆' })).toBeVisible();
  return errors;
}

const day = (page: Page, date: string) => page.locator(`[data-cal-day="${date}"]`);
const entryEl = (page: Page, title: string) =>
  page.locator('[data-cal-entry]').filter({ hasText: title }).first();

async function stored(page: Page) {
  return page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? '{"state":{"data":{"entries":[]}}}').state.data,
    STORE_KEY,
  );
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 拖曳：從一格的中心到另一格的中心（滑鼠） */
async function dragBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** 用滑鼠在元素中心雙擊（先捲進畫面）；跟使用者一樣，兩下之間版面不能動 */
async function dblclickCenter(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box');
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
}

/** 開頁前先放好資料（只放一次；重新整理不會蓋掉） */
async function seedEntries(page: Page, entries: object[]) {
  await page.addInitScript(
    ([k, v]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(k, v);
    },
    [STORE_KEY, JSON.stringify({ state: { data: { entries } }, version: 1 })],
  );
}

async function center(page: Page, date: string, dy = 0.75) {
  const b = await day(page, date).boundingBox();
  if (!b) throw new Error(`沒有 ${date}`);
  return { x: b.x + b.width / 2, y: b.y + b.height * dy };
}

test('開頁：範例、國定假日、今天；頁尾只放靈感來源', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('cal-title')).toHaveText('2026年10月');
  await expect(day(page, '2026-10-27')).toHaveAttribute('data-today', 'true');
  await expect(day(page, '2026-10-10')).toHaveAttribute('data-holiday', '國慶日');
  await expect(day(page, '2026-10-09')).toHaveAttribute('data-holiday', '補假');
  await expect(day(page, '2026-10-25')).toHaveAttribute(
    'data-holiday',
    '臺灣光復暨金門古寧頭大捷紀念日',
  );
  await expect(day(page, '2026-10-26')).toHaveAttribute('data-holiday', '補假');
  /* 範例：10/30 的場次、準備事項 */
  await expect(entryEl(page, '霧港燈塔的最後一夜')).toBeVisible();
  await expect(page.getByTestId('sample-note')).toBeVisible();
  await expect(page.locator('[data-cal-task]')).toHaveCount(3);
  await expect(page.getByTestId('today-panel')).toContainText('今天沒有預定');
  const tasks = page.getByRole('list', { name: '準備事項清單' });
  await expect(tasks.locator('li')).toHaveCount(3);
  await expect(tasks.locator('[data-task-state="today"]')).toHaveCount(1);
  /* 頁尾：靈感來源一行 */
  const footer = page.locator('footer');
  await expect(footer).toContainText('靈感來源：くま。／卓準備カレンダー');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://kumachansteps.github.io/trpg-web-tools/tools/session-check-calendar/',
  );
  /* 刪除範例（可以復原） */
  await page.getByRole('button', { name: '刪除範例' }).click();
  await expect(page.locator('[data-cal-entry]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(entryEl(page, '霧港燈塔的最後一夜')).toBeVisible();
  expect(errors).toEqual([]);
});

test('新增場次：對話框的欄位、詳細、準備事項（新增、勾選、拖曳排序）、刪除與復原', async ({
  page,
}) => {
  const errors = await open(page);
  await day(page, '2026-10-21').click();
  await expect(page.getByTestId('focus-bar')).toContainText('2026年10月21日（三）');
  await page.getByRole('button', { name: '這天新增場次' }).click();
  const dlg = page.getByRole('dialog', { name: '新增場次' });
  await expect(dlg.getByRole('textbox', { name: '劇本名稱' })).toBeFocused();
  await dlg.getByRole('textbox', { name: '劇本名稱' }).fill('深海站的訊號');
  await expect(dlg.getByLabel('開始日')).toHaveValue('2026-10-21');
  await dlg.getByLabel('開始時間').fill('19:30');
  await dlg.getByLabel('結束時間').fill('23:00');
  await dlg.getByRole('button', { name: 'CoC 7版' }).click();
  await expect(dlg.getByRole('textbox', { name: '系統' })).toHaveValue('CoC 7版');
  await dlg.getByRole('textbox', { name: 'GM／KP' }).fill('海鷗');
  await dlg.getByRole('button', { name: '線上・語音' }).click();
  await dlg.getByRole('radio', { name: '調整中' }).click();
  await dlg.getByRole('textbox', { name: '主題標籤' }).fill('TRPG, CoC');
  await dlg.getByRole('button', { name: '加一位參加者' }).click();
  await dlg.getByRole('textbox', { name: 'PL 1' }).fill('阿樹');
  await dlg.getByRole('textbox', { name: 'PC 1' }).fill('林曉舟');
  await dlg.getByRole('button', { name: '加一個連結' }).click();
  await dlg.getByRole('textbox', { name: '第 1 個連結的名稱' }).fill('CCFOLIA');
  await dlg
    .getByRole('textbox', { name: '第 1 個連結的網址' })
    .fill('https://ccfolia.com/rooms/test');
  await dlg.getByRole('button', { name: '加一項準備事項' }).click();
  await dlg.getByRole('textbox', { name: '第 1 項準備事項', exact: true }).fill('畫地圖');
  await dlg.getByRole('radio', { name: '兩色漸層' }).click();
  await dlg.getByRole('textbox', { name: '備註' }).fill('第一行\n第二行');
  await dlg.getByTestId('entry-save').click();
  await expect(dlg).toHaveCount(0);

  const chip = entryEl(page, '深海站的訊號');
  await expect(chip).toHaveAttribute('data-status', 'tentative');
  const detail = page.getByTestId('entry-detail');
  await expect(detail).toContainText('深海站的訊號');
  await expect(detail).toContainText('19:30–23:00');
  await expect(detail).toContainText('海鷗');
  await expect(detail).toContainText('調整中');
  await expect(detail.getByRole('link', { name: 'CCFOLIA' })).toHaveAttribute(
    'href',
    'https://ccfolia.com/rooms/test',
  );
  const saved = (await stored(page)).entries.find(
    (e: { title: string }) => e.title === '深海站的訊號',
  );
  expect(saved).toMatchObject({
    kind: 'session',
    start: '2026-10-21',
    end: '2026-10-21',
    startTime: '19:30',
    endTime: '23:00',
    system: 'CoC 7版',
    format: '線上・語音',
    status: 'tentative',
    tags: ['TRPG', 'CoC'],
    players: [{ pl: '阿樹', pc: '林曉舟' }],
    memo: '第一行\n第二行',
  });
  expect(saved.color.mode).toBe('gradient');
  expect(saved.tasks[0]).toMatchObject({ title: '畫地圖', due: '2026-10-21', done: false });

  /* 準備事項：從工具列新增（期限＝選取的日期、所屬＝選取的場次） */
  await page.getByTestId('add-menu').click();
  await page.getByTestId('add-task').click();
  const tdlg = page.getByRole('dialog', { name: '新增準備事項' });
  await tdlg.getByRole('textbox', { name: '名稱' }).fill('列印角色卡');
  await tdlg.getByTestId('task-save').click();
  await expect(tdlg).toHaveCount(0);
  await page.getByRole('radio', { name: '全部' }).click();
  const list = page.getByRole('list', { name: '準備事項清單' });
  await expect(list.locator('li')).toHaveCount(6);
  await expect(list.locator('li').last()).toContainText('列印角色卡');
  /* 勾選完成 */
  await list.getByRole('checkbox', { name: '列印角色卡' }).click();
  await expect(list.getByRole('checkbox', { name: '列印角色卡' })).toBeChecked();
  /* 拖曳把手：最後一項拖到第一項 */
  const handle = list.locator('li').last().locator('[data-drag-handle]');
  const first = await list.locator('li').first().boundingBox();
  const hb = await handle.boundingBox();
  if (!first || !hb) throw new Error('no box');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 10, { steps: 3 });
  await page.mouse.move(hb.x + hb.width / 2, first.y + 4, { steps: 10 });
  await page.mouse.up();
  await expect(list.locator('li').first()).toContainText('列印角色卡');

  /* 刪除（確認、可以復原） */
  await chip.click();
  await detail.getByRole('button', { name: '刪除' }).click();
  await page
    .getByRole('alertdialog', { name: '刪除這一筆？' })
    .getByRole('button', { name: '刪除' })
    .click();
  await expect(entryEl(page, '深海站的訊號')).toHaveCount(0);
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(entryEl(page, '深海站的訊號')).toBeVisible();
  expect(errors).toEqual([]);
});

test('拖曳：拖過幾天新增預定、拖曳色條換日子、Shift＋方向鍵、雙擊新增場次', async ({ page }) => {
  const errors = await open(page);
  await dragBetween(page, await center(page, '2026-10-13'), await center(page, '2026-10-15'));
  const dlg = page.getByRole('dialog', { name: '新增預定' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel('開始日')).toHaveValue('2026-10-13');
  await expect(dlg.getByLabel('結束日')).toHaveValue('2026-10-15');
  await dlg.getByRole('textbox', { name: '標題' }).fill('期中考');
  await dlg.getByTestId('entry-save').click();
  const bar = entryEl(page, '期中考');
  await expect(bar).toHaveAttribute('data-kind', 'plan');
  /* 拖曳色條：抓 10/13 放到 10/20 → 10/20～10/22 */
  const bb = await bar.boundingBox();
  if (!bb) throw new Error('no bar');
  await dragBetween(
    page,
    { x: bb.x + 20, y: bb.y + bb.height / 2 },
    await center(page, '2026-10-20'),
  );
  await expect(page.getByText('已移動', { exact: true }).first()).toBeVisible();
  let plan = (await stored(page)).entries.find((e: { title: string }) => e.title === '期中考');
  expect([plan.start, plan.end]).toEqual(['2026-10-20', '2026-10-22']);
  /* 選取後 Shift＋→ 往後一天、Shift＋↓ 往後一週 */
  await entryEl(page, '期中考').click();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  plan = (await stored(page)).entries.find((e: { title: string }) => e.title === '期中考');
  expect([plan.start, plan.end]).toEqual(['2026-10-28', '2026-10-30']);
  /* 雙擊日子：新增場次 */
  await day(page, '2026-10-06').dblclick();
  const sdlg = page.getByRole('dialog', { name: '新增場次' });
  await expect(sdlg.getByLabel('開始日')).toHaveValue('2026-10-06');
  await expect(sdlg.getByLabel('開始時間')).toHaveValue('20:00');
  await sdlg.getByRole('button', { name: '取消' }).click();
  /* 方向鍵在日子間移動（跨月時換月） */
  await day(page, '2026-10-31').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('cal-title')).toHaveText('2026年11月');
  await expect(day(page, '2026-11-01')).toBeFocused();
  expect(errors).toEqual([]);
});

test('年曆與月曆：切換、點月份、PageDown、週一開始、推算年份的說明', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('radio', { name: '年曆' }).click();
  await expect(page.getByTestId('cal-title')).toHaveText('2026年');
  await expect(page.locator('[data-cal-mini]')).toHaveCount(12);
  /* 範例的多日預定塗上顏色 */
  await expect(page.locator('[data-mini-day="2026-11-08"][data-marked]')).toHaveCount(1);
  await page.getByRole('button', { name: /^打開11月的月曆/ }).click();
  await expect(page.getByTestId('cal-title')).toHaveText('2026年11月');
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('cal-title')).toHaveText('2026年12月');
  await page.keyboard.press('Home');
  await expect(page.getByTestId('cal-title')).toHaveText('2026年10月');
  /* 週一開始 */
  await page.getByRole('button', { name: '外觀與設定' }).click();
  await page.getByRole('radio', { name: '星期一' }).click();
  const firstCell = page.locator('[data-week]').first().locator('[data-cal-day]').first();
  await expect(firstCell).toHaveAttribute('data-cal-day', '2026-09-28');
  /* 2028 年：推算 */
  await page.getByRole('radio', { name: '年曆' }).click();
  await page.getByTestId('cal-next').click();
  await page.getByTestId('cal-next').click();
  await expect(page.getByTestId('holiday-note')).toContainText('2028 年的國定假日還沒公告');
  expect(errors).toEqual([]);
});

test('匯出 JSON 與 iCal（解析下載的檔案）', async ({ page }) => {
  const errors = await open(page);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByTestId('io-menu').click();
      await page.getByTestId('export-json').click();
    })(),
  ]);
  expect(dl.suggestedFilename()).toBe('團期行事曆_20261027.json');
  const json = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
  expect(json).toMatchObject({ format: 'trpg-toolkit/session-calendar', version: 1 });
  expect(json.entries).toHaveLength(4);
  const [dl2] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByTestId('io-menu').click();
      await page.getByTestId('export-ical').click();
    })(),
  ]);
  expect(dl2.suggestedFilename()).toBe('團期行事曆_20261027.ics');
  const ics = readFileSync((await dl2.path()) as string, 'utf8');
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  /* 10/30 20:00（臺灣）＝ 12:00Z */
  expect(ics).toContain('DTSTART:20261030T120000Z');
  expect(ics).toContain('DTEND:20261030T153000Z');
  /* 多日的預定：整天、結束日的隔天 */
  expect(ics).toContain('DTSTART;VALUE=DATE:20261108');
  expect(ics).toContain('DTEND;VALUE=DATE:20261111');
  expect(errors).toEqual([]);
});

async function chooseFiles(
  page: Page,
  menuItem: string,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    (async () => {
      await page.getByTestId('io-menu').click();
      await page.getByTestId(menuItem).click();
    })(),
  ]);
  await chooser.setFiles(files);
}

test('讀入：卓準備カレンダー、taku_calendar 的 JSON、Google 日曆匯出的 ZIP（選行事曆）', async ({
  page,
}) => {
  const errors = await open(page);
  const kuma = {
    version: '0.13',
    sessions: [
      {
        id: 'k1',
        sourceCalendar: 'TRPG予定',
        scenario: '測試的劇本',
        system: 'クトゥルフ神話TRPG',
        start: '2026-10-16T20:00',
        end: '23:00',
        gm: 'GM甲',
        status: 'scheduled',
        players: [{ pl: 'P', pc: 'C' }],
        links: [],
        hashtags: ['TRPG'],
        tasks: [
          { id: 't', title: '準備', due: '2026-10-15', status: '未着手', done: false, order: 10 },
        ],
      },
    ],
  };
  await chooseFiles(page, 'read-json', [
    {
      name: 'session-check-calendar.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(kuma)),
    },
  ]);
  let dlg = page.getByRole('dialog', { name: '讀入「session-check-calendar.json」' });
  await expect(dlg).toContainText('卓準備カレンダー的 JSON');
  await expect(dlg.getByTestId('import-summary')).toHaveText('會讀入 1 筆');
  await dlg.getByTestId('import-confirm').click();
  await expect(entryEl(page, '測試的劇本')).toBeVisible();

  const taku = {
    title: '我的團曆',
    events: [
      {
        id: 'e1',
        title: '旅行',
        memo: '',
        start: '2026-10-19',
        end: '2026-10-21',
        colorMode: 'gradient',
        color1: '#f08aa8',
        color2: '#d9547e',
      },
    ],
    cpColors: [{ id: 'cp', name: 'A×B', c1: '#111111', c2: '#eeeeee' }],
  };
  await chooseFiles(page, 'read-json', [
    {
      name: 'taku_calendar_events.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(taku)),
    },
  ]);
  dlg = page.getByRole('dialog', { name: '讀入「taku_calendar_events.json」' });
  await expect(dlg).toContainText('taku_calendar 的 JSON');
  await dlg.getByRole('radio', { name: '取代全部' }).click();
  await dlg.getByTestId('import-confirm').click();
  await expect(entryEl(page, '旅行')).toBeVisible();
  await expect(entryEl(page, '霧港燈塔的最後一夜')).toHaveCount(0);
  const data = await stored(page);
  expect(data.title).toBe('我的團曆');
  expect(data.cpColors).toHaveLength(1);

  /* Google 日曆匯出的 ZIP：兩個日曆，只讀「工作」 */
  const ics = (name: string, body: string[]) =>
    ['BEGIN:VCALENDAR', 'VERSION:2.0', `X-WR-CALNAME:${name}`, ...body, 'END:VCALENDAR'].join(
      '\r\n',
    );
  const zip = zipSync({
    'calendar/個人_abc@group.calendar.google.com.ics': strToU8(
      ics('個人', [
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261005',
        'DTEND;VALUE=DATE:20261006',
        'SUMMARY:看牙醫',
        'END:VEVENT',
      ]),
    ),
    'calendar/工作_def@group.calendar.google.com.ics': strToU8(
      ics('工作', [
        'BEGIN:VEVENT',
        'DTSTART:20261007T013000Z',
        'DTEND:20261007T023000Z',
        'SUMMARY:週會',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART;VALUE=DATE:20261012',
        'DTEND;VALUE=DATE:20261014',
        'SUMMARY:出差',
        'RRULE:FREQ=MONTHLY;COUNT=2',
        'END:VEVENT',
      ]),
    ),
  });
  await chooseFiles(page, 'read-ical', [
    { name: 'takeout.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) },
  ]);
  dlg = page.getByRole('dialog', { name: '讀入「takeout.zip」' });
  await expect(dlg).toContainText('有 1 筆是重複的預定，只讀入第一次');
  await dlg.getByRole('checkbox', { name: /個人/ }).click();
  await expect(dlg.getByTestId('import-summary')).toHaveText('會讀入 2 筆');
  await dlg.getByRole('radio', { name: '預定', exact: true }).click();
  await dlg.getByTestId('import-confirm').click();
  await expect(entryEl(page, '週會')).toHaveAttribute('data-kind', 'plan');
  await expect(entryEl(page, '出差')).toBeVisible();
  await expect(page.locator('[data-cal-entry]').filter({ hasText: '看牙醫' })).toHaveCount(0);
  const week = (await stored(page)).entries.find((e: { title: string }) => e.title === '週會');
  expect(week).toMatchObject({
    start: '2026-10-07',
    startTime: '09:30',
    endTime: '10:30',
    calendar: '工作',
  });
  expect(errors).toEqual([]);
});

test('空檔日期：條件與格式、複製', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await page.getByTestId('open-free').click();
  const dlg = page.getByRole('dialog', { name: '空檔日期' });
  const out = dlg.getByRole('textbox', { name: '空檔日期' });
  /* 10 月：範例的 10/30 有場次 */
  await expect(out).not.toHaveValue(/10\/30（五）/);
  await expect(out).toHaveValue(/^10\/1（四）\n10\/2（五）/);
  await dlg.getByRole('radio', { name: '週末與放假日' }).click();
  await expect(out).toHaveValue(
    '10/3（六）\n10/4（日）\n10/9（五）\n10/10（六）\n10/11（日）\n10/17（六）\n10/18（日）\n10/24（六）\n10/25（日）\n10/26（一）\n10/31（六）',
  );
  await dlg.getByRole('button', { name: '排除星期六' }).click();
  await dlg.getByRole('checkbox', { name: '連續的日子合併成「起～迄」' }).click();
  await dlg.getByRole('radio', { name: '「、」' }).click();
  await expect(out).toHaveValue(
    '10/4（日）、10/9（五）、10/11（日）、10/18（日）、10/25（日）～10/26（一）',
  );
  /* 排除日期：小月曆點 10/4 */
  await dlg.locator('[data-free-day="2026-10-04"]').click();
  await expect(out).toHaveValue('10/9（五）、10/11（日）、10/18（日）、10/25（日）～10/26（一）');
  await dlg.getByRole('button', { name: '複製' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '10/9（五）、10/11（日）、10/18（日）、10/25（日）～10/26（一）',
  );
  /* 還原星期六（條件記在這台裝置） */
  await dlg.getByRole('button', { name: '排除星期六' }).click();
  expect(errors).toEqual([]);
});

test('存成 PNG：這個月與整年', async ({ page }) => {
  const errors = await open(page);
  const grab = async (item: string) => {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.getByTestId('shot-menu').click();
        await page.getByTestId(item).click();
      })(),
    ]);
    const buf = readFileSync((await dl.path()) as string);
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    return {
      name: dl.suggestedFilename(),
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  };
  const m = await grab('shot-month');
  expect(m).toMatchObject({ name: '團期行事曆_2026年10月.png', width: 2400 });
  expect(m.height).toBeGreaterThan(1000);
  const y = await grab('shot-year');
  expect(y).toMatchObject({ name: '團期行事曆_2026年.png', width: 2400 });
  /* 截圖寬度改成 800 */
  await page.getByRole('button', { name: '外觀與設定' }).click();
  const width = page.getByRole('spinbutton', { name: '截圖的寬度' });
  await width.fill('800');
  await width.press('Enter');
  expect((await grab('shot-month')).width).toBe(1600);
  expect(errors).toEqual([]);
});

test('外觀：花紋背景與自動配色、圖片背景', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '外觀與設定' }).click();
  const panel = page.getByTestId('look-panel');
  await panel.getByRole('radio', { name: '花紋' }).click();
  await expect(page.getByTestId('calendar-board')).toHaveAttribute('data-bg', 'pattern');
  const bg = await page
    .getByTestId('calendar-board')
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('data:image/svg+xml');
  await panel.getByTestId('auto-colors').click();
  expect((await stored(page)).look.colors.card).toBe('#ffffff');
  await panel.getByRole('textbox', { name: '行事曆標題' }).fill('週末團');
  await expect(page.getByTestId('cal-board-title')).toHaveText('週末團');
  /* 圖片背景：讀入圖片 → 背景是那張圖；專案檔存成 ZIP（含圖片） */
  await panel.getByRole('radio', { name: '圖片' }).click();
  const rgba = new Uint8Array(64 * 48 * 4).map((_, i) =>
    i % 4 === 3 ? 255 : i % 4 === 0 ? 200 : 90,
  );
  const png = await encodePng(rgba, 64, 48);
  await panel.locator('input[type="file"]').setInputFiles({
    name: 'bg.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png),
  });
  await expect(page.getByTestId('calendar-board')).toHaveAttribute('data-bg', 'image');
  await expect
    .poll(() =>
      page.getByTestId('calendar-board').evaluate((el) => getComputedStyle(el).backgroundImage),
    )
    .toContain('blob:');
  expect((await stored(page)).look.image.id).toBeTruthy();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: '專案' }).click();
      await page.getByRole('menuitem', { name: /存成專案檔/ }).click();
    })(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^週末團_20261027\.zip$/);
  const zip = unzipSync(readFileSync((await dl.path()) as string));
  expect(Object.keys(zip).some((n) => n.startsWith('files/'))).toBe(true);
  expect(JSON.parse(strFromU8(zip['project.json'])).data.look.bg).toBe('image');
  expect(errors).toEqual([]);
});

test('送到跑團紀錄簿：新分頁的紀錄簿問要不要加入；送到團報產生器的交接資料', async ({
  page,
  context,
}) => {
  const errors = await open(page);
  await entryEl(page, '霧港燈塔的最後一夜').click();
  /* 第二位（小鹿）的 PC 清空：紀錄簿的 PC 欄用「—」占位，跟 PL 一一對上 */
  await page.getByTestId('entry-detail').getByRole('button', { name: '編輯' }).click();
  const edit = page.getByRole('dialog', { name: '編輯場次' });
  await edit.getByRole('textbox', { name: 'PC 2' }).fill('');
  await edit.getByTestId('entry-save').click();
  await expect(edit).toHaveCount(0);
  await page.getByTestId('send-log').click();
  const confirm = page.getByRole('alertdialog', { name: '送到跑團紀錄簿' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByTestId('send-overwrite')).toHaveCount(0);
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    confirm.getByRole('button', { name: '送出並開啟' }).click(),
  ]);
  const payload = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? 'null'),
    LOG_KEY,
  );
  expect(payload).toMatchObject({ source: 'session-check-calendar', version: '1.0' });
  expect(payload.items[0]).toMatchObject({
    scenario: '霧港燈塔的最後一夜',
    dates: ['2026-10-30'],
    gm: '白鷺',
    startTime: '20:00',
    endTime: '23:30',
  });
  expect(payload.items[0].players[1]).toEqual({ pl: '小鹿', pc: '' });
  await popup.waitForLoadState();
  expect(popup.url()).toContain('/tools/session-log/');
  const ask = popup.getByRole('alertdialog', { name: '團期行事曆送來一團' });
  await expect(ask).toBeVisible();
  await expect(ask.getByTestId('calendar-pending-items')).toContainText(
    '霧港燈塔的最後一夜（2026-10-30）',
  );
  await ask.getByRole('button', { name: '加進紀錄簿' }).click();
  const row = popup.locator('tbody tr[data-row-id]').filter({ hasText: '霧港燈塔的最後一夜' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('白鷺');
  const rows = await popup.evaluate(
    () => JSON.parse(localStorage.getItem('trpg-toolkit:session-log') ?? 'null').state.data.rows,
  );
  expect(rows.find((r: { scenario: string }) => r.scenario === '霧港燈塔的最後一夜')).toMatchObject(
    {
      dates: ['2026-10-30'],
      system: 'CoC 7版',
      status: '予定',
      time: '3.5',
      players: '阿樹、小鹿、貓又',
      pc: '林曉舟、—、沈墨',
    },
  );
  expect(await popup.evaluate((k) => localStorage.getItem(k), LOG_KEY)).toBeNull();
  await popup.close();

  /* 團報產生器 */
  await page.getByTestId('send-report').click();
  const rconfirm = page.getByRole('alertdialog', { name: '送到團報產生器' });
  const [rpopup] = await Promise.all([
    context.waitForEvent('page'),
    rconfirm.getByRole('button', { name: '送出並開啟' }).click(),
  ]);
  expect(rpopup.url()).toContain('/tools/session-report/');
  await rpopup.close();
  const report = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? 'null'),
    REPORT_KEY,
  );
  expect(report).toMatchObject({ source: 'session-check-calendar', version: '1.0' });
  expect(report.items[0]).toMatchObject({
    scenario: '霧港燈塔的最後一夜',
    system: 'CoC 7版',
    format: 'voice',
    latestDate: '2026-10-30',
    status: 'ongoing',
  });
  expect(errors).toEqual([]);
});

test('雙擊（沒有選取時）：日子、場次小卡直接打開對話框；第一下不推動版面（1280、390）', async ({
  page,
}) => {
  const errors = await open(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.reload();
    const grid = page.locator('[data-cal-month]');
    const bar = page.getByTestId('focus-bar');
    const before = await grid.boundingBox();
    const barBefore = await bar.boundingBox();
    /* 單擊選日子：聚焦列一直都在，高度不變，月曆不往下推 */
    await day(page, '2026-10-21').click();
    await expect(bar).toContainText('2026年10月21日（三）');
    expect((await grid.boundingBox())?.y, `${width}：選日子後月曆不動`).toBe(before?.y);
    expect((await bar.boundingBox())?.height, `${width}：聚焦列高度不變`).toBe(barBefore?.height);
    await page.keyboard.press('Escape');
    await expect(bar).toHaveAttribute('data-empty', 'true');
    expect((await grid.boundingBox())?.y).toBe(before?.y);

    /* 沒有選取時雙擊日子（中心）→ 新增場次，日期是雙擊的那天 */
    await page.reload();
    await dblclickCenter(page, day(page, '2026-10-14'));
    const add = page.getByRole('dialog', { name: '新增場次' });
    await expect(add.getByLabel('開始日'), `${width}：雙擊的日子`).toHaveValue('2026-10-14');
    await add.getByRole('button', { name: '取消' }).click();

    /* 沒有選取時雙擊場次小卡 → 編輯 */
    await page.reload();
    await dblclickCenter(page, entryEl(page, '霧港燈塔的最後一夜'));
    const edit = page.getByRole('dialog', { name: '編輯場次' });
    await expect(edit.getByRole('textbox', { name: '劇本名稱' })).toHaveValue('霧港燈塔的最後一夜');
    await edit.getByRole('button', { name: '取消' }).click();
    await expect(edit).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('雙擊（沒有選取時）：「今天的預定」與日子清單的一筆直接打開編輯（1280、390）', async ({
  page,
}) => {
  await seedEntries(page, [
    {
      id: 'session_today',
      kind: 'session',
      title: '今日團',
      start: '2026-10-27',
      end: '2026-10-27',
      startTime: '20:00',
      system: 'CoC 7版',
    },
    {
      id: 'plan_today',
      kind: 'plan',
      title: '涵蓋今天的預定',
      start: '2026-10-26',
      end: '2026-10-29',
    },
  ]);
  const errors = await open(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.reload();
    await dblclickCenter(page, page.getByTestId('today-panel').getByText('今日團'));
    const edit = page.getByRole('dialog', { name: '編輯場次' });
    await expect(
      edit.getByRole('textbox', { name: '劇本名稱' }),
      `${width}：今天的預定`,
    ).toHaveValue('今日團');
    await edit.getByRole('button', { name: '取消' }).click();
    await expect(edit).toHaveCount(0);

    /* 選一天 → 詳細欄列出那天的筆；雙擊其中一筆 → 編輯 */
    await page.reload();
    await day(page, '2026-10-28').click({ position: { x: 8, y: 6 } });
    const item = page.getByTestId('day-list').locator('[data-list-entry]').first();
    await expect(item).toContainText('涵蓋今天的預定');
    await dblclickCenter(page, item);
    const editPlan = page.getByRole('dialog', { name: '編輯預定' });
    await expect(editPlan.getByRole('textbox', { name: '標題' }), `${width}：日子清單`).toHaveValue(
      '涵蓋今天的預定',
    );
    await editPlan.getByRole('button', { name: '取消' }).click();
    await expect(editPlan).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('拖到月曆外放開＝取消；選單打開的對話框關掉後焦點回到選單按鈕；連結網址', async ({ page }) => {
  const errors = await open(page);
  const before = await page.locator('[data-cal-entry]').count();
  /* 拖過幾天後拖到月曆外放開：不新增 */
  const from = await center(page, '2026-10-13');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 2, { steps: 2 });
  const to = await center(page, '2026-10-15');
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(day(page, '2026-10-14')).toHaveAttribute('data-in-drag', 'true');
  const title = await page.getByRole('heading', { level: 1, name: '團期行事曆' }).boundingBox();
  if (!title) throw new Error('no title');
  await page.mouse.move(title.x + 10, title.y + title.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(day(page, '2026-10-14')).not.toHaveAttribute('data-in-drag', 'true');
  /* 色條也一樣：拖到月曆外放開不移動 */
  const bar = entryEl(page, '霧港燈塔的最後一夜');
  const bb = await bar.boundingBox();
  if (!bb) throw new Error('no chip');
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 + 10, bb.y + bb.height / 2, { steps: 2 });
  const to2 = await center(page, '2026-10-22');
  await page.mouse.move(to2.x, to2.y, { steps: 8 });
  await expect(day(page, '2026-10-22')).toHaveAttribute('data-in-drag', 'true');
  await page.mouse.move(title.x + 10, title.y + title.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(day(page, '2026-10-22')).not.toHaveAttribute('data-in-drag', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-cal-entry]')).toHaveCount(before);
  await expect(page.getByText('已移動', { exact: true })).toHaveCount(0);
  const chipBox = await entryEl(page, '霧港燈塔的最後一夜').boundingBox();
  const cell = await day(page, '2026-10-30').boundingBox();
  if (!chipBox || !cell) throw new Error('no box');
  expect(chipBox.x).toBeGreaterThanOrEqual(cell.x);
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(cell.x + cell.width);

  /* 「新增」選單打開的對話框，關掉後焦點回到「新增」 */
  await page.getByTestId('add-menu').click();
  await page.getByTestId('add-plan').click();
  const dlg = page.getByRole('dialog', { name: '新增預定' });
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('add-menu')).toBeFocused();

  /* 連結網址：省略 https:// 時補上；javascript: 之類的不收 */
  await page.getByTestId('add-menu').click();
  await page.getByTestId('add-session').click();
  const sdlg = page.getByRole('dialog', { name: '新增場次' });
  await sdlg.getByRole('textbox', { name: '劇本名稱' }).fill('連結測試');
  await sdlg.getByRole('button', { name: '加一個連結' }).click();
  await sdlg.getByRole('button', { name: '加一個連結' }).click();
  await sdlg.getByRole('textbox', { name: '第 1 個連結的名稱' }).fill('房間');
  await sdlg.getByRole('textbox', { name: '第 1 個連結的網址' }).fill('ccfolia.com/rooms/x');
  await sdlg.getByRole('textbox', { name: '第 2 個連結的名稱' }).fill('壞的');
  const bad = sdlg.getByRole('textbox', { name: '第 2 個連結的網址' });
  await bad.fill('javascript:alert(1)');
  await sdlg.getByTestId('entry-save').click();
  await expect(sdlg.getByTestId('link-error')).toBeVisible();
  await expect(bad).toBeFocused();
  await expect(bad).toHaveAttribute('aria-invalid', 'true');
  await bad.fill('mailto:gm@example.com');
  await sdlg.getByTestId('entry-save').click();
  await expect(sdlg).toHaveCount(0);
  await expect(page.getByTestId('add-menu')).toBeFocused();
  const saved = (await stored(page)).entries.find((e: { title: string }) => e.title === '連結測試');
  expect(saved.links).toEqual([
    { label: '房間', url: 'https://ccfolia.com/rooms/x' },
    { label: '壞的', url: 'mailto:gm@example.com' },
  ]);
  expect(errors).toEqual([]);
});

test('讀入超過 5000 筆的 iCal：說明實際的筆數、多的不讀；焦點回到「匯出入」', async ({ page }) => {
  const errors = await open(page);
  const pad = (n: number) => String(n).padStart(2, '0');
  const events: string[] = [];
  const t0 = Date.UTC(2020, 0, 1);
  for (let i = 0; i < 5003; i++) {
    const d = new Date(t0 + i * 86_400_000);
    const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    events.push(
      'BEGIN:VEVENT',
      `UID:big-${i}`,
      `DTSTART;VALUE=DATE:${ymd}`,
      `SUMMARY:第 ${i + 1} 筆`,
      'END:VEVENT',
    );
  }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
  await chooseFiles(page, 'read-ical', [
    { name: 'big.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) },
  ]);
  const dlg = page.getByRole('dialog', { name: '讀入「big.ics」' });
  /* 加在現有（範例 4 筆）的後面：放得下 4996 筆 */
  await expect(dlg.getByTestId('import-over')).toHaveText(
    '一個行事曆最多 5000 筆：目前已有 4 筆，這次選了 5003 筆，只讀入日期最早的 4996 筆，其餘 7 筆不讀。',
  );
  await expect(dlg.getByTestId('import-summary')).toHaveText('會讀入 4996 筆');
  await dlg.getByRole('radio', { name: '取代全部' }).click();
  await expect(dlg.getByTestId('import-over')).toHaveText(
    '一個行事曆最多 5000 筆：這次選了 5003 筆，只讀入日期最早的 5000 筆，其餘 3 筆不讀。',
  );
  await dlg.getByRole('radio', { name: '加在現有的後面' }).click();
  await dlg.getByTestId('import-confirm').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText('已讀入 4996 筆').first()).toBeVisible();
  await expect(page.getByText('超過 5000 筆的上限，7 筆沒有讀入。').first()).toBeVisible();
  const data = await stored(page);
  expect(data.entries).toHaveLength(5000);
  /* 早的先讀：最後 7 筆（2033 年）沒讀 */
  expect(data.entries.some((e: { title: string }) => e.title === '第 4996 筆')).toBe(true);
  expect(data.entries.some((e: { title: string }) => e.title === '第 4997 筆')).toBe(false);
  await expect(page.getByTestId('io-menu')).toBeFocused();
  expect(errors).toEqual([]);
});

test('版面：390 寬沒有橫向捲動；1280 與 390 的視覺基準', async ({ page }) => {
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('session-calendar-1280.png', { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.getByRole('radio', { name: '年曆' }).click();
  await noHorizontalScroll(page);
  await page.getByRole('radio', { name: '月曆' }).click();
  await entryEl(page, '霧港燈塔的最後一夜').click();
  await noHorizontalScroll(page);
  await page.getByTestId('open-free').click();
  await noHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot('session-calendar-390.png', { fullPage: true });
  expect(errors).toEqual([]);
});
