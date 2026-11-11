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

/* 範例（紅幕劇場的首演之夜）裡 PL 看不到的東西 */
const JIANG_TRUTH = '從燈光控制室旁的維修通道上天橋，解開沙袋配重的繩結';
const XU_TRUTH = '受江曉雯之託，把一張「想私下談談劇評」的字條送到劇評家的包廂';
const XU_SURFACE = '中場休息時離開化妝間';
const LOG_SECRET = '把演出事故紀錄的時間改早十分鐘';
const GM_NOTES = ['戲服設計是抄來的', '紅鯡魚'];
const GM_LINKS = ['沙袋落下', '收到字條才離開包廂'];
/* 調查後公開的（PL 看得到） */
const WEI_TRUTH = '溜到後門抽菸，回來時看到維修通道的門半開著';

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
  await expect(page.getByText('已載入推理劇本的範例（紅幕劇場的首演之夜）').first()).toBeVisible();
  const doc = await docOf(page);
  expect(doc.title).toBe('紅幕劇場的首演之夜');
  expect(doc.session?.style).toBe('clock');
  /* GM 檢視：真相另外一筆、證詞與伏字的小標 */
  await expect(tl(page).locator('[data-truth-of="mx-jiang-room"]')).toContainText(JIANG_TRUTH);
  await expect(tl(page).locator('[data-event-id="mx-jiang-room"] [data-face-badges]')).toHaveText(
    '證詞',
  );
  await expect(tl(page).locator('[data-event-id="mx-xu-break"] [data-face-badges]')).toHaveText(
    '伏字',
  );
  /* 退場：那一列的斜線與虛線；標籤是標記列的旗子（不壓到事件） */
  await expect(tl(page).locator('[data-exit-band="mx-he"]')).toHaveCount(1);
  await expect(page.locator('[data-flag="exit"]')).toHaveText('劇評家 何仲文 死亡');
  /* 點真相那一筆＝選取它的事件；雙擊、Enter＝焦點到「真相的行動」 */
  await tl(page).locator('[data-truth-of="mx-jiang-room"]').click();
  await expect(field(page, 'title')).toHaveValue('在服裝間幫第二幕的演員改戲服，沒有離開');
  await tl(page).locator('[data-truth-of="mx-jiang-room"]').dblclick();
  await expect(field(page, 'truth-title')).toBeFocused();
  await expect(field(page, 'truth-start')).toHaveValue('21:38');
  await tl(page).locator('[data-truth-of="mx-jiang-room"]').focus();
  await expect(field(page, 'truth-title')).not.toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field(page, 'truth-title')).toBeFocused();
  /* 偽裝的地點是證詞的地點 */
  await expect(page.getByText('地點（證詞）', { exact: true })).toBeVisible();
  await expect(
    page.getByText('這裡寫 PL 聽到的地點；實際的地點寫在下面的真相。', { exact: true }),
  ).toBeVisible();

  /* PL 檢視（全體公開）：每個分頁的整頁都沒有真相、完全保密、GM 筆記、GM 專用的線 */
  await setPl(page);
  await expect(page.getByTestId('pl-badge')).toHaveText('PL 檢視');
  const forbidden = [JIANG_TRUTH, XU_TRUTH, XU_SURFACE, LOG_SECRET, ...GM_NOTES, ...GM_LINKS];
  for (const tab of ['事件', '泳道', '專案', '匯出']) {
    await page.getByRole('tab', { name: tab }).click();
    const text = await domText(page);
    expect(
      forbidden.filter((w) => text.includes(w)),
      `PL 檢視「${tab}」分頁`,
    ).toEqual([]);
    expect(text).toContain(WEI_TRUTH);
  }
  await expect(tl(page).locator('[data-event-id="mx-xu-break"]')).toHaveAttribute(
    'data-masked',
    'true',
  );
  await expect(tl(page).locator('[data-event-id="mx-xu-break"]')).toContainText('？？？');
  await expect(tl(page).locator('[data-exit-band="mx-he"]')).toHaveCount(1);
  /* 年表檢視也沒有 */
  await page.getByRole('radio', { name: '年表' }).click();
  const chText = await domText(page);
  expect(forbidden.filter((w) => chText.includes(w))).toEqual([]);
  await expect(page.getByTestId('chronicle').locator('[data-kind="exit"]')).toContainText(
    '退場（死亡）',
  );

  /* 人物別：服裝師自己的真相看得到，主演的伏字、舞台監督的完全保密看不到 */
  await choose(page, page.getByTestId('pov-select'), '服裝師 江曉雯 視角');
  await expect(page.getByTestId('pov-select')).toContainText('服裝師 江曉雯 視角');
  /* 列印過再換人物、切回 GM 檢視：列印用的 iframe 拿掉（印過的不是目前看到的） */
  await page.getByTestId('print').click();
  await expect(page.locator('iframe[data-paged-print]')).toHaveCount(1);
  await choose(page, page.getByTestId('pov-select'), '主演 許子豪 視角');
  await expect(page.locator('iframe[data-paged-print]')).toHaveCount(0);
  await page.getByTestId('print').click();
  await expect(page.locator('iframe[data-paged-print]')).toHaveCount(1);
  await setGm(page);
  await expect(page.locator('iframe[data-paged-print]')).toHaveCount(0);
  await setPl(page);
  await page.getByRole('radio', { name: '時間軸' }).click();
  /* 主演的人物別：伏字的真相看得到 */
  await expect(tl(page).locator('[data-event-id="mx-xu-break"]')).toContainText(XU_SURFACE);
  await expect(tl(page).locator('[data-truth-of="mx-xu-break"]')).toContainText(XU_TRUTH);
  expect((await domText(page)).includes(JIANG_TRUTH)).toBe(false);
  await choose(page, page.getByTestId('pov-select'), '服裝師 江曉雯 視角');
  await expect(tl(page).locator('[data-truth-of="mx-jiang-room"]')).toBeVisible();
  for (const tab of ['事件', '泳道', '專案', '匯出']) {
    await page.getByRole('tab', { name: tab }).click();
    const text = await domText(page);
    expect(text).toContain(JIANG_TRUTH);
    expect(
      [XU_TRUTH, XU_SURFACE, LOG_SECRET, ...GM_NOTES, ...GM_LINKS].filter((w) => text.includes(w)),
      `服裝師的人物別「${tab}」分頁`,
    ).toEqual([]);
  }
  /* PL 檢視的「事件」分頁：證詞的欄位停用、真相唯讀 */
  await page.getByRole('tab', { name: '事件' }).click();
  await tl(page).locator('[data-event-id="mx-jiang-room"]').click();
  await expect(field(page, 'truth-title')).toBeDisabled();
  await expect(field(page, 'scope')).toHaveCount(0);
  await setGm(page);
  await expect(tl(page).locator('[data-truth-of="mx-jiang-room"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('公開範圍與真相的編輯：偽裝、真相的時間與地點、伏字、調查後公開、完全保密、復原', async ({
  page,
}) => {
  await seed(page, NIGHT);
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await tl(page).locator('[data-event-id="a"]').click();
  await expect(page.getByText('地點（證詞）', { exact: true })).toHaveCount(0);
  await choose(page, field(page, 'scope'), '偽裝（證詞與真相）');
  await expect.poll(async () => (await evOf(page, 'a'))?.scope).toBe('alibi');
  await expect(page.getByText('地點（證詞）', { exact: true })).toBeVisible();
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
  expect(svgDl.suggestedFilename()).toBe('紅幕劇場的首演之夜_時間軸.svg');
  const svg = readFileSync(await svgDl.path(), 'utf8');
  expect(
    [JIANG_TRUTH, XU_TRUTH, XU_SURFACE, LOG_SECRET, ...GM_LINKS].filter((w) => svg.includes(w)),
  ).toEqual([]);
  expect(svg).toContain('？？？');
  expect(svg).toContain(WEI_TRUTH);
  expect(svg).toContain('劇評家 何仲文 死亡');
  /* 人物別：服裝師一張（標題列有「服裝師 江曉雯 視角」） */
  await tab.getByTestId('export-audience').getByRole('radio', { name: '人物別' }).click();
  await choose(page, field(page, 'export-audience-person'), '服裝師 江曉雯');
  await panel.getByRole('button', { name: /^匯出/ }).click();
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [povDl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  expect(povDl.suggestedFilename()).toBe('紅幕劇場的首演之夜_時間軸_服裝師 江曉雯.svg');
  const povSvg = readFileSync(await povDl.path(), 'utf8');
  expect(povSvg).toContain('服裝師 江曉雯 視角');
  expect(povSvg).toContain(JIANG_TRUTH);
  expect(povSvg.includes(XU_TRUTH)).toBe(false);
  /* 全部各一張：五個人物、五個檔案 */
  await choose(page, field(page, 'export-audience-person'), '全部各一張');
  await panel.getByRole('radio', { name: /PNG/ }).click();
  await panel.getByRole('button', { name: /^匯出/ }).click();
  const batch = page.getByTestId('export-batch');
  await expect(batch).toBeVisible({ timeout: 60_000 });
  await expect(batch).toContainText('紅幕劇場的首演之夜_時間軸_劇評家 何仲文.png');
  await expect(batch).toContainText('紅幕劇場的首演之夜_時間軸_道具組 小魏.png');
  await expect(batch.getByRole('link', { name: '下載' })).toHaveCount(5);
  /* 進行表：人物・地點別、人物別（服裝師） */
  await tab.getByTestId('text-arrange').getByRole('radio', { name: '人物・地點別' }).click();
  await tab.getByTestId('text-audience').getByRole('radio', { name: '人物別' }).click();
  await choose(page, field(page, 'text-audience-person'), '服裝師 江曉雯');
  const textbox = tab.getByRole('textbox', { name: '年表文字' });
  await expect(textbox).toHaveValue(/^紅幕劇場的首演之夜〔服裝師 江曉雯 視角〕\n19:20～22:40\n/);
  const pov = await textbox.inputValue();
  expect(pov).toContain('■ 劇評家 何仲文　21:47 退場（死亡）\n');
  expect(pov).toContain(`　　〔真相〕${JIANG_TRUTH}（21:38～21:47／地點：舞台上方的天橋）\n`);
  expect(pov.includes(XU_TRUTH)).toBe(false);
  const [txt] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('text-download').click(),
  ]);
  expect(txt.suggestedFilename()).toBe('紅幕劇場的首演之夜_進行表_服裝師 江曉雯.txt');
  /* PL 用：沒有服裝師的真相 */
  await tab.getByTestId('text-audience').getByRole('radio', { name: 'PL 用' }).click();
  const pl = await textbox.inputValue();
  expect(
    [JIANG_TRUTH, XU_TRUTH, XU_SURFACE, LOG_SECRET, ...GM_LINKS].filter((w) => pl.includes(w)),
  ).toEqual([]);
  /* GM 用：全部 */
  await tab.getByTestId('text-audience').getByRole('radio', { name: 'GM 用' }).click();
  await expect(textbox).toHaveValue(new RegExp(LOG_SECRET));
  await expect(page.getByTestId('csv-pl-note')).toHaveCount(0);
  /* PL 檢視的人物別：匯出的對象固定是那個人物 */
  await setPl(page);
  await choose(page, page.getByTestId('pov-select'), '舞台監督 林佩芸 視角');
  await expect(
    tab.getByTestId('text-audience').getByRole('radio', { name: '人物別' }),
  ).toBeChecked();
  await expect(textbox).toHaveValue(/〔舞台監督 林佩芸 視角〕/);
  expect((await textbox.inputValue()).includes(JIANG_TRUTH)).toBe(false);
  /* PL 檢視時 CSV、專案檔是完整的資料：提醒一句 */
  await expect(page.getByTestId('csv-pl-note')).toHaveText(
    'PL 檢視時匯出 CSV、存成專案檔也是完整的資料，含 GM 的內容與真相；不要直接交給玩家。',
  );
  await page.getByRole('button', { name: /^專案/ }).click();
  await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
  ]);
  await expect(
    page.getByText('存的是完整的資料（含 GM 的內容與真相）', { exact: true }).first(),
  ).toBeVisible();
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
  await expect(tl(page).locator('[data-exit-band="B"]')).toHaveAttribute('title', /退場（失蹤）/);
  await expect(tl(page).locator('[data-flag="exit"]')).toHaveText('人物乙 失蹤');
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
  await expect(page.getByTestId('schedule-day-hint')).toHaveText(
    '第 N 天從 06:00 換日，00:00～06:00 算前一天的夜。',
  );
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
  await expect(page.getByText('已插入 30 分：移動了 2 個', { exact: true }).first()).toBeVisible();
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
  expect(saved.version).toBe(5);
  expect(saved.data.session).toEqual({ style: 'clock', start: 1080, length: 300, phase: 60 });
  expect(saved.data.lanes[0].exit).toEqual({ time: '第 1 天 21:47', label: '死亡' });
  expect(saved.data.events.find((e: Ev) => e.id === 'mx-jiang-room').truth.place).toBe(
    '舞台上方的天橋',
  );
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
    await tl(page).locator('[data-event-id="mx-jiang-room"]').click();
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
    await choose(page, page.getByTestId('pov-select'), '服裝師 江曉雯 視角');
    await noHorizontalScroll(page);
    await page.getByRole('radio', { name: '年表' }).click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}
