/**
 * 劇本時間表：參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的第一批（規格 F116～F130）的端對端測試（建置產物）：
 * - 推理劇本的範例：GM 檢視的證詞、真相、伏字、完全保密、退場；PL 檢視與人物別整頁（文字、屬性、輸入欄）不洩漏真相
 * - 公開範圍與真相的編輯：偽裝、真相的時間與地點、雙擊真相那一筆、調查後公開、完全保密、復原
 * - 匯出：人物別的圖（一個人、全部各一張）、進行表（人物・地點別）、PL 用的 SVG 不洩漏
 * - 退場時刻、第 N 天的標示（時刻、倒數、日程、階段）、固定的吸附、插入與縮短（復原）
 * - 專案檔版本 4 存了再開逐欄位相同；窄畫面（390、360、320）沒有橫向捲動
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { mysteryDoc } from '../../src/tools/scenario-timeline/model/exampleMystery';

const URL = `/${outputDir(getTool('scenario-timeline') ?? { id: 'scenario-timeline', status: 'next' })}/`;
const STORE_KEY = 'trpg-toolkit:scenario-timeline';
const PREFS_KEY = 'trpg-toolkit:scenario-timeline:preview';

interface Ev {
  id: string;
  title: string;
  start: string;
  end: string;
  gm: boolean;
  scope?: string;
  truth?: { title: string; start: string; end: string; place: string };
  revealed?: boolean;
}
interface Doc {
  title: string;
  mode: string;
  events: Ev[];
  lanes: { id: string; exit?: { time: string; label: string } }[];
  markers: { id: string; time: string }[];
  session?: { style: string; start: number; length: number; phase: number };
  snap?: number;
  progress: { time: string };
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

type Api = { __scenarioTimeline: { doc: () => Doc } };
const docOf = (page: Page) =>
  page.evaluate(() => (window as unknown as Api).__scenarioTimeline.doc());
const evOf = async (page: Page, id: string) => (await docOf(page)).events.find((e) => e.id === id);
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);
const tl = (page: Page) => page.getByTestId('timeline');

/** 開頁前放好資料（只放一次；重新整理不會蓋掉） */
async function seed(page: Page, data: object, prefs?: object, version = 4) {
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

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** Radix 的下拉選單：點開、選一項 */
async function choose(page: Page, trigger: ReturnType<Page['locator']>, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const setPl = (page: Page) => page.getByRole('radio', { name: /^PL 檢視/ }).click();
const setGm = (page: Page) => page.getByRole('radio', { name: /^GM 檢視/ }).click();

/* 範例裡 PL 看不到的東西 */
const YE_TRUTH = '趁停電從後樓梯進書房，在莊主的茶裡下藥';
const LIN_TRUTH = '喝下被下了藥的茶，倒在書桌旁';
const LIN_SURFACE = '在書房喝茶';
const KEY_SECRET = '把書房的備用鑰匙藏進玄關的花瓶';
const GM_NOTES = ['客房的窗戶看得到溫室', '紅鯡魚'];
const ZHOU_TRUTH = '摸黑到書房門外偷聽莊主講電話';

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
/** 一晚的小劇本：人物甲（20:00～21:00 在書房）、人物乙（20:30）、主線（22:00） */
const NIGHT = {
  title: '一晚',
  mode: 'day',
  era: '',
  dayOne: '',
  sample: false,
  showNow: false,
  lanes: [
    { id: 'A', name: '人物甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
    { id: 'B', name: '人物乙', kind: 'character', color: '#e0565b', parentId: '', gm: false },
  ],
  categories: [],
  events: [
    {
      ...blankEvent,
      id: 'a',
      title: '在書房看書',
      kind: 'range',
      start: '第 1 天 20:00',
      end: '第 1 天 21:00',
      laneId: 'A',
      place: '書房',
    },
    { ...blankEvent, id: 'b', title: '去散步', start: '第 1 天 20:30', laneId: 'B' },
    { ...blankEvent, id: 'c', title: '發現', start: '第 1 天 22:00' },
  ],
  markers: [],
  progress: { on: false, time: '', plOnly: false },
  calendar: { months: [], weekdays: [], weekStart: 0 },
  links: [],
};

test('推理劇本的範例：GM 檢視的證詞與真相、伏字、退場；PL 檢視與人物別整頁不洩漏真相', async ({
  page,
}) => {
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: /^專案/ }).click();
  await page.getByRole('menuitem', { name: '載入推理劇本的範例' }).click();
  await page.getByRole('button', { name: '載入推理劇本的範例' }).click();
  await expect(page.getByText('已載入推理劇本的範例（山茶花莊的停電之夜）').first()).toBeVisible();
  const doc = await docOf(page);
  expect(doc.title).toBe('山茶花莊的停電之夜');
  expect(doc.session?.style).toBe('clock');
  /* GM 檢視：真相另外一筆、證詞與伏字的小標、退場的斜線 */
  await expect(tl(page).locator('[data-truth-of="mx-ye-room"]')).toContainText(YE_TRUTH);
  await expect(tl(page).locator('[data-event-id="mx-ye-room"] [data-face-badges]')).toHaveText(
    '證詞',
  );
  await expect(tl(page).locator('[data-event-id="mx-lin-dark"] [data-face-badges]')).toHaveText(
    '伏字',
  );
  await expect(tl(page).locator('[data-exit-band="mx-lin"]')).toContainText('死亡');
  /* 點真相那一筆＝選取它的事件；雙擊＝焦點到「真相的行動」 */
  await tl(page).locator('[data-truth-of="mx-ye-room"]').click();
  await expect(field(page, 'title')).toHaveValue('在二樓客房看書，沒有離開房間');
  await tl(page).locator('[data-truth-of="mx-ye-room"]').dblclick();
  await expect(field(page, 'truth-title')).toBeFocused();
  await expect(field(page, 'truth-start')).toHaveValue('21:00');

  /* PL 檢視（全體公開）：每個分頁的整頁都沒有真相、完全保密、GM 筆記 */
  await setPl(page);
  await expect(page.getByTestId('pl-badge')).toHaveText('PL 檢視');
  const forbidden = [YE_TRUTH, LIN_TRUTH, LIN_SURFACE, KEY_SECRET, ...GM_NOTES, '下藥'];
  for (const tab of ['事件', '泳道', '專案', '匯出']) {
    await page.getByRole('tab', { name: tab }).click();
    const text = await domText(page);
    expect(
      forbidden.filter((w) => text.includes(w)),
      `PL 檢視「${tab}」分頁`,
    ).toEqual([]);
    expect(text).toContain(ZHOU_TRUTH);
  }
  await expect(tl(page).locator('[data-event-id="mx-lin-dark"]')).toHaveAttribute(
    'data-masked',
    'true',
  );
  await expect(tl(page).locator('[data-event-id="mx-lin-dark"]')).toContainText('？？？');
  await expect(tl(page).locator('[data-exit-band="mx-lin"]')).toHaveCount(1);
  /* 年表檢視也沒有 */
  await page.getByRole('radio', { name: '年表' }).click();
  const chText = await domText(page);
  expect(forbidden.filter((w) => chText.includes(w))).toEqual([]);
  await expect(page.getByTestId('chronicle').locator('[data-kind="exit"]')).toContainText(
    '退場（死亡）',
  );
  await page.getByRole('radio', { name: '時間軸' }).click();

  /* 人物別：醫師自己的真相看得到，莊主的伏字、管家的完全保密看不到 */
  await choose(page, page.getByTestId('pov-select'), '醫師 葉承恩 視角');
  await expect(page.getByTestId('pl-badge')).toHaveText('PL 檢視：醫師 葉承恩 視角');
  await expect(tl(page).locator('[data-truth-of="mx-ye-room"]')).toBeVisible();
  for (const tab of ['事件', '泳道', '專案', '匯出']) {
    await page.getByRole('tab', { name: tab }).click();
    const text = await domText(page);
    expect(text).toContain(YE_TRUTH);
    expect(
      [LIN_TRUTH, LIN_SURFACE, KEY_SECRET, ...GM_NOTES].filter((w) => text.includes(w)),
      `醫師的人物別「${tab}」分頁`,
    ).toEqual([]);
  }
  /* PL 檢視的「事件」分頁：證詞的欄位停用、真相唯讀 */
  await page.getByRole('tab', { name: '事件' }).click();
  await tl(page).locator('[data-event-id="mx-ye-room"]').click();
  await expect(field(page, 'truth-title')).toBeDisabled();
  await expect(field(page, 'scope')).toHaveCount(0);
  /* 莊主的人物別：伏字的真相看得到 */
  await choose(page, page.getByTestId('pov-select'), '莊主 林宏遠 視角');
  await expect(tl(page).locator('[data-event-id="mx-lin-dark"]')).toContainText(LIN_SURFACE);
  await expect(tl(page).locator('[data-truth-of="mx-lin-dark"]')).toContainText(LIN_TRUTH);
  expect((await domText(page)).includes(YE_TRUTH)).toBe(false);
  await setGm(page);
  await expect(tl(page).locator('[data-truth-of="mx-ye-room"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('公開範圍與真相的編輯：偽裝、真相的時間與地點、伏字、調查後公開、完全保密、復原', async ({
  page,
}) => {
  await seed(page, NIGHT);
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await tl(page).locator('[data-event-id="a"]').click();
  await choose(page, field(page, 'scope'), '偽裝（證詞與真相）');
  await expect.poll(async () => (await evOf(page, 'a'))?.scope).toBe('alibi');
  await field(page, 'truth-title').fill('其實去了地下室');
  await field(page, 'truth-start').fill('第 1 天 20:15');
  await field(page, 'truth-start').press('Enter');
  await field(page, 'truth-end').fill('第 1 天 20:45');
  await field(page, 'truth-end').press('Enter');
  await field(page, 'truth-place').fill('地下室');
  await field(page, 'truth-place').blur();
  await expect
    .poll(async () => (await evOf(page, 'a'))?.truth)
    .toEqual({
      title: '其實去了地下室',
      start: '第 1 天 20:15',
      end: '第 1 天 20:45',
      place: '地下室',
    });
  await expect(tl(page).locator('[data-truth-of="a"]')).toContainText('其實去了地下室');
  /* 真相的結束不比開始晚：不套用 */
  await field(page, 'truth-end').fill('第 1 天 20:00');
  await expect(page.getByText('結束要比開始晚').first()).toBeVisible();
  await field(page, 'truth-end').press('Escape');
  /* PL 檢視：證詞看起來和公開的一樣，真相不在頁面上 */
  await setPl(page);
  await expect(tl(page).locator('[data-truth-of="a"]')).toHaveCount(0);
  await expect(tl(page).locator('[data-event-id="a"]')).not.toHaveAttribute('data-face', /.+/);
  expect((await domText(page)).includes('其實去了地下室')).toBe(false);
  await setGm(page);
  /* 調查後公開：PL 也看得到真相 */
  await tl(page).locator('[data-event-id="a"]').click();
  await page.getByRole('switch', { name: '調查後公開' }).click();
  await expect.poll(async () => (await evOf(page, 'a'))?.revealed).toBe(true);
  await setPl(page);
  await expect(tl(page).locator('[data-truth-of="a"]')).toContainText('其實去了地下室');
  await expect(tl(page).locator('[data-event-id="a"] [data-face-badges]')).toHaveText('證詞查明');
  await setGm(page);
  /* 伏字 */
  await tl(page).locator('[data-event-id="b"]').click();
  await choose(page, field(page, 'scope'), '伏字（PL 看到「？？？」）');
  await setPl(page);
  await expect(tl(page).locator('[data-event-id="b"]')).toContainText('？？？');
  expect((await domText(page)).includes('去散步')).toBe(false);
  await setGm(page);
  /* 完全保密＝GM 專用；復原回到伏字 */
  await tl(page).locator('[data-event-id="b"]').click();
  await choose(page, field(page, 'scope'), '完全保密（GM 專用）');
  await expect.poll(async () => (await evOf(page, 'b'))?.gm).toBe(true);
  expect((await evOf(page, 'b'))?.scope).toBe('redacted');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'b'))?.gm).toBe(false);
  /* 公開：拿掉公開範圍與調查後公開（真相留著） */
  await tl(page).locator('[data-event-id="a"]').click();
  await choose(page, field(page, 'scope'), '公開');
  await expect.poll(async () => (await evOf(page, 'a'))?.scope).toBeUndefined();
  expect((await evOf(page, 'a'))?.revealed).toBeUndefined();
  await expect(tl(page).locator('[data-truth-of="a"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('匯出：人物別的圖（一個人、全部各一張）、進行表（人物・地點別）、PL 用不洩漏', async ({
  page,
}) => {
  await seed(page, mysteryDoc());
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab', { name: '匯出' }).click();
  const tab = page.getByTestId('export-tab');
  const panel = page.getByRole('region', { name: '匯出圖片' });
  /* PL 用的 SVG：沒有真相 */
  await panel.getByRole('radio', { name: /SVG/ }).click();
  await panel.getByRole('button', { name: /^匯出/ }).click();
  const result = page.getByTestId('export-result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [svgDl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  expect(svgDl.suggestedFilename()).toBe('山茶花莊的停電之夜_時間軸.svg');
  const svg = readFileSync(await svgDl.path(), 'utf8');
  expect([YE_TRUTH, LIN_TRUTH, LIN_SURFACE, KEY_SECRET].filter((w) => svg.includes(w))).toEqual([]);
  expect(svg).toContain('？？？');
  expect(svg).toContain(ZHOU_TRUTH);
  /* 人物別：醫師一張（標題列有「醫師 葉承恩 視角」） */
  await tab.getByTestId('export-audience').getByRole('radio', { name: '人物別' }).click();
  await choose(page, field(page, 'export-audience-person'), '醫師 葉承恩');
  await panel.getByRole('button', { name: /^匯出/ }).click();
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [povDl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  expect(povDl.suggestedFilename()).toBe('山茶花莊的停電之夜_時間軸_醫師 葉承恩.svg');
  const povSvg = readFileSync(await povDl.path(), 'utf8');
  expect(povSvg).toContain('醫師 葉承恩 視角');
  expect(povSvg).toContain(YE_TRUTH);
  expect(povSvg.includes(LIN_TRUTH)).toBe(false);
  /* 全部各一張：五個人物、五個檔案 */
  await choose(page, field(page, 'export-audience-person'), '全部各一張');
  await panel.getByRole('radio', { name: /PNG/ }).click();
  await panel.getByRole('button', { name: /^匯出/ }).click();
  const batch = page.getByTestId('export-batch');
  await expect(batch).toBeVisible({ timeout: 60_000 });
  await expect(batch).toContainText('山茶花莊的停電之夜_時間軸_莊主 林宏遠.png');
  await expect(batch).toContainText('山茶花莊的停電之夜_時間軸_管家 老陳.png');
  await expect(batch.getByRole('link', { name: '下載' })).toHaveCount(5);
  /* 進行表：人物・地點別、人物別（醫師） */
  await tab.getByTestId('text-arrange').getByRole('radio', { name: '人物・地點別' }).click();
  await tab.getByTestId('text-audience').getByRole('radio', { name: '人物別' }).click();
  await choose(page, field(page, 'text-audience-person'), '醫師 葉承恩');
  const textbox = tab.getByRole('textbox', { name: '年表文字' });
  await expect(textbox).toHaveValue(/^山茶花莊的停電之夜〔醫師 葉承恩 視角〕\n18:30～23:30\n/);
  const pov = await textbox.inputValue();
  expect(pov).toContain('■ 莊主 林宏遠　21:15 退場（死亡）\n');
  expect(pov).toContain(`　　〔真相〕${YE_TRUTH}（21:00～21:10／地點：書房）\n`);
  expect(pov.includes(LIN_TRUTH)).toBe(false);
  const [txt] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('text-download').click(),
  ]);
  expect(txt.suggestedFilename()).toBe('山茶花莊的停電之夜_進行表_醫師 葉承恩.txt');
  /* PL 用：沒有醫師的真相 */
  await tab.getByTestId('text-audience').getByRole('radio', { name: 'PL 用' }).click();
  const pl = await textbox.inputValue();
  expect([YE_TRUTH, LIN_TRUTH, LIN_SURFACE, KEY_SECRET].filter((w) => pl.includes(w))).toEqual([]);
  /* GM 用：全部 */
  await tab.getByTestId('text-audience').getByRole('radio', { name: 'GM 用' }).click();
  await expect(textbox).toHaveValue(new RegExp(KEY_SECRET));
  /* PL 檢視的人物別：匯出的對象固定是那個人物 */
  await setPl(page);
  await choose(page, page.getByTestId('pov-select'), '秘書 周雅婷 視角');
  await expect(
    tab.getByTestId('text-audience').getByRole('radio', { name: '人物別' }),
  ).toBeChecked();
  await expect(textbox).toHaveValue(/〔秘書 周雅婷 視角〕/);
  expect((await textbox.inputValue()).includes(YE_TRUTH)).toBe(false);
  expect(errors).toEqual([]);
});

test('退場時刻：泳道分頁設定與拿掉、時間軸的斜線、年表的一行、復原', async ({ page }) => {
  await seed(page, NIGHT);
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab', { name: '泳道' }).click();
  await page.locator('[data-lane-exit="B"]').click();
  await expect.poll(async () => (await docOf(page)).lanes[1].exit?.time).toBeTruthy();
  const row = page.locator('[data-exit-row="B"]');
  await row.locator('[data-field="lane-exit-time"]').fill('第 1 天 21:30');
  await row.locator('[data-field="lane-exit-time"]').press('Enter');
  await row.locator('[data-field="lane-exit-label"]').fill('失蹤');
  await row.locator('[data-field="lane-exit-label"]').blur();
  await expect
    .poll(async () => (await docOf(page)).lanes[1].exit)
    .toEqual({ time: '第 1 天 21:30', label: '失蹤' });
  await expect(tl(page).locator('[data-exit-band="B"]')).toContainText('失蹤');
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(page.getByTestId('chronicle').locator('[data-kind="exit"]')).toContainText(
    '人物乙 退場（失蹤）',
  );
  await page.getByRole('radio', { name: '時間軸' }).click();
  await row.getByRole('button', { name: '拿掉退場時刻：人物乙' }).click();
  await expect(tl(page).locator('[data-exit-band="B"]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(tl(page).locator('[data-exit-band="B"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('第 N 天的標示（時刻、倒數、日程、階段）、固定的吸附、插入與縮短（復原）', async ({
  page,
}) => {
  await seed(page, NIGHT);
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab', { name: '專案' }).click();
  await choose(page, field(page, 'session-style'), '時刻（18:00）');
  await expect.poll(async () => (await docOf(page)).session?.style).toBe('clock');
  /* 時間欄：寫成時刻；輸入 01:30＝開始時刻（18:00）之後的那一個 */
  await page.getByRole('tab', { name: '事件' }).click();
  await tl(page).locator('[data-event-id="b"]').click();
  await expect(field(page, 'start')).toHaveValue('20:30');
  await field(page, 'start').fill('01:30');
  await field(page, 'start').press('Enter');
  await expect.poll(async () => (await evOf(page, 'b'))?.start).toBe('第 2 天 01:30');
  /* 倒數：T-0＝18:00＋6 小時 */
  await page.getByRole('tab', { name: '專案' }).click();
  await choose(page, field(page, 'session-style'), '倒數（T-01:30）');
  await expect(page.getByText('T-0 是 隔天 00:00。')).toBeVisible();
  await page.getByRole('radio', { name: '年表' }).click();
  await expect(page.getByTestId('chronicle')).toContainText('T-04:00～T-03:00');
  await page.getByRole('radio', { name: '時間軸' }).click();
  await expect(page.getByTestId('axis')).toContainText('T-');
  /* 日程、階段 */
  await choose(page, field(page, 'session-style'), '日程（第 1 天 早・午・晚・夜）');
  await page.getByRole('tab', { name: '事件' }).click();
  await tl(page).locator('[data-event-id="a"]').click();
  await expect(field(page, 'start')).toHaveValue('第 1 天 晚 20:00');
  await field(page, 'start').fill('第 1 天 晚');
  await field(page, 'start').press('Enter');
  await expect.poll(async () => (await evOf(page, 'a'))?.start).toBe('第 1 天 18:00');
  await page.getByRole('tab', { name: '專案' }).click();
  await choose(page, field(page, 'session-style'), '階段（階段 1、階段 2）');
  await page.getByRole('tab', { name: '事件' }).click();
  await expect(field(page, 'start')).toHaveValue('階段 1');
  /* 回到第 N 天：存檔的時間沒有變 */
  await page.getByRole('tab', { name: '專案' }).click();
  await choose(page, field(page, 'session-style'), '第 N 天（第 1 天 18:00）');
  await expect.poll(async () => 'session' in (await docOf(page))).toBe(false);
  expect((await evOf(page, 'a'))?.start).toBe('第 1 天 18:00');
  /* 固定的吸附 */
  await page.getByTestId('snap-choice').getByRole('radio', { name: '15 分' }).click();
  await expect.poll(async () => (await docOf(page)).snap).toBe(15);
  /* 插入：從 21:00 起往後挪 30 分（發現 22:00 → 22:30；01:30 → 02:00）；縮短；復原 */
  await field(page, 'shift-from').fill('第 1 天 21:00');
  await field(page, 'shift-from').press('Enter');
  await expect(page.getByTestId('shift-count')).toHaveText('之後有 2 個事件、標記或退場時刻。');
  await page.getByTestId('shift-insert').click();
  await expect(page.getByText('已插入 30 分：移動了 2 個')).toBeVisible();
  await expect.poll(async () => (await evOf(page, 'c'))?.start).toBe('第 1 天 22:30');
  expect((await evOf(page, 'b'))?.start).toBe('第 2 天 02:00');
  expect((await evOf(page, 'a'))?.start).toBe('第 1 天 18:00');
  await page.getByTestId('shift-shrink').click();
  await expect.poll(async () => (await evOf(page, 'c'))?.start).toBe('第 1 天 22:00');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'c'))?.start).toBe('第 1 天 22:30');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await evOf(page, 'c'))?.start).toBe('第 1 天 22:00');
  expect(errors).toEqual([]);
});

test('專案檔：版本 4，新的欄位存了再開逐欄位相同', async ({ page }) => {
  await seed(page, mysteryDoc());
  const errors = await open(page);
  const before = await docOf(page);
  await page.getByRole('button', { name: /^專案/ }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  const saved = JSON.parse(readFileSync(await file.path(), 'utf8'));
  expect(saved.version).toBe(4);
  expect(saved.data.session).toEqual({ style: 'clock', start: 1080, length: 360, phase: 60 });
  expect(saved.data.lanes[0].exit).toEqual({ time: '第 1 天 21:15', label: '死亡' });
  expect(saved.data.events.find((e: Ev) => e.id === 'mx-ye-room').truth.place).toBe('書房');
  /* 重設再開回來 */
  await page.getByRole('button', { name: /^專案/ }).click();
  await page.getByRole('menuitem', { name: /開啟專案檔/ }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
  ]);
  await chooser.setFiles(await file.path());
  await expect(page.getByText('已開啟專案檔', { exact: true }).first()).toBeVisible();
  const after = await docOf(page);
  expect(after).toEqual({ ...before, sample: false });
  expect(errors).toEqual([]);
});

for (const width of [390, 360, 320]) {
  test(`窄畫面 ${width}：推理劇本的範例、每個分頁、PL 的人物別沒有橫向捲動`, async ({ page }) => {
    await seed(page, mysteryDoc(), { view: 'timeline' });
    const errors = await open(page);
    await page.setViewportSize({ width, height: 844 });
    await expect(tl(page)).toBeVisible();
    await noHorizontalScroll(page);
    await tl(page).locator('[data-event-id="mx-ye-room"]').click();
    await expect(field(page, 'truth-title')).toBeVisible();
    await noHorizontalScroll(page);
    for (const tab of ['泳道', '專案', '匯出']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    await page
      .getByTestId('export-tab')
      .getByTestId('export-audience')
      .getByRole('radio', { name: '人物別' })
      .click();
    await page.getByTestId('text-arrange').getByRole('radio', { name: '人物・地點別' }).click();
    await noHorizontalScroll(page);
    await setPl(page);
    await choose(page, page.getByTestId('pov-select'), '醫師 葉承恩 視角');
    await noHorizontalScroll(page);
    await page.getByRole('radio', { name: '年表' }).click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}
