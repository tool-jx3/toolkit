/**
 * 劇本時間表：參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的第二批（規格 F131～F141）的端對端測試（建置產物）：
 * - 「推理」分頁：不在場證明空白（清單、時間軸上的框）、同席調書（PL 只比證詞、GM 標出矛盾）、時間切片（時刻欄、點刻度、
 *   地點的卡片、時間軸的線與淡化）、聚光（淡化、列的名稱）、段階公開（公開、收回、全部回到初始、復原）
 * - PL 檢視與人物別：五個分頁的整頁（文字、屬性、輸入欄）不洩漏真相；段階公開之後才出現
 * - 匯出：紙的樣式、老舊、翻角（外側透明）、記號、調書、時間切片的 SVG／PNG；A4 自動分頁（頁數、檔名、長邊）；PL 用不洩漏
 * - 專案檔版本 5；窄畫面（390、360、320）沒有橫向捲動
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { mysteryDoc } from '../../src/tools/scenario-timeline/model/exampleMystery';

const URL = `/${outputDir(getTool('scenario-timeline') ?? { id: 'scenario-timeline', status: 'next' })}/`;
const STORE_KEY = 'trpg-toolkit:scenario-timeline';
const PREFS_KEY = 'trpg-toolkit:scenario-timeline:preview';

interface Doc {
  events: { id: string; unlocked?: boolean; revealed?: boolean }[];
  links: { id: string; unlocked?: boolean }[];
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
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);
const tl = (page: Page) => page.getByTestId('timeline');

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
      JSON.stringify({ state: { data }, version: 5 }),
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
const analysis = (page: Page) => page.getByTestId('analysis-tab');

/** 時間欄：填入、Enter 套用 */
async function setTime(page: Page, name: string, text: string) {
  await field(page, name).fill(text);
  await field(page, name).press('Enter');
}

/* 範例（紅幕劇場的首演之夜）裡 PL 看不到的東西 */
const JIANG_TRUTH = '從燈光控制室旁的維修通道上天橋，解開沙袋配重的繩結';
const XU_TRUTH = '受江曉雯之託，把一張「想私下談談劇評」的字條送到劇評家的包廂';
const XU_SURFACE = '中場休息時離開化妝間';
const LOG_SECRET = '把演出事故紀錄的時間改早十分鐘';
const GM_LINKS = ['沙袋落下', '收到字條才離開包廂'];

const t = (hhmm: string) => `第 1 天 ${hhmm}`;
const blank = {
  kind: 'range',
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
/** 同席與矛盾的小劇本：甲說在圖書室（真相在祕密金庫）、乙在圖書室、乙的密會（完全保密） */
const CASE = {
  title: '分析',
  mode: 'day',
  session: { style: 'clock', start: 1080, length: 300, phase: 60 },
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
      ...blank,
      id: 'a1',
      title: '甲說在圖書室看書',
      start: t('21:00'),
      end: t('22:00'),
      laneId: 'A',
      place: '圖書室',
      scope: 'alibi',
      truth: { title: '甲潛入金庫', start: t('21:10'), end: t('21:30'), place: '祕密金庫' },
    },
    {
      ...blank,
      id: 'b1',
      title: '乙在圖書室找書',
      start: t('21:15'),
      end: t('21:45'),
      laneId: 'B',
      place: '圖書室',
    },
    {
      ...blank,
      id: 'b2',
      title: '乙的密會',
      start: t('22:30'),
      end: t('23:00'),
      laneId: 'B',
      place: '祕密金庫',
      gm: true,
    },
    { ...blank, id: 'bg', title: '晚會', kind: 'background', start: t('19:00'), end: t('23:00') },
  ],
  markers: [],
  progress: { on: false, time: '', plOnly: false },
  calendar: { months: [], weekdays: [], weekStart: 0 },
  links: [],
};

test('推理分頁：不在場證明空白、同席調書、時間切片（時刻欄與點刻度）、聚光', async ({ page }) => {
  await seed(page, CASE, { tab: 'analysis', view: 'timeline' });
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const tab = analysis(page);
  await expect(tab).toBeVisible();
  /* 空白的清單（GM：乙的密會也算紀錄） */
  await expect(tab.getByTestId('an-gaps')).toContainText('人物甲：19:00～21:00（2 小時）');
  await expect(tab.getByTestId('an-gaps')).toContainText('人物乙：21:45～22:30（45 分）');
  await expect(tl(page).locator('[data-gap]')).toHaveCount(0);
  await tab.getByLabel('在時間軸上標出空白').click();
  await expect(tl(page).locator('[data-gap="A"]')).toHaveCount(2);
  await expect(tl(page).locator('[data-gap="B"]').first()).toHaveAttribute(
    'title',
    '人物乙：19:00～21:15 沒有紀錄（2 小時 15 分）',
  );
  /* 同席：GM 標出被真相推翻的、只在真相裡的 */
  await expect(tab.getByTestId('an-contacts-testimony')).toContainText(
    '21:15～21:45（30 分）＠圖書室：人物甲 × 人物乙　→ 矛盾：人物甲 的真相是 21:10～21:30 在祕密金庫',
  );
  await expect(tab.getByTestId('an-contacts-truth')).toContainText(
    '21:30～21:45（15 分）＠圖書室：人物甲 × 人物乙',
  );
  /* 時間切片：時刻欄 */
  await tab.getByLabel('看某一刻每個地點有誰').click();
  await setTime(page, 'slice-time', '21:20');
  const slice = tab.getByTestId('an-slice');
  await expect(slice).toContainText('時間切片：21:20');
  await expect(slice.locator('[data-slice-room="＠祕密金庫"]')).toContainText(
    '・人物甲（真相）：甲潛入金庫（證詞：圖書室）',
  );
  await expect(slice.locator('[data-slice-room="＠圖書室"]')).toContainText(
    '・人物乙：乙在圖書室找書',
  );
  await expect(tl(page).getByTestId('slice-line')).toContainText('切片 21:20');
  /* 那一刻沒有在進行的淡化：乙的密會 */
  await expect(tl(page).locator('[data-event-id="b2"]')).toHaveAttribute('data-dim', 'true');
  await expect(tl(page).locator('[data-event-id="b1"]')).not.toHaveAttribute('data-dim', 'true');
  /* 點刻度選時刻；再點同一個位置關掉 */
  const axis = tl(page).getByTestId('axis');
  const box = await axis.boundingBox();
  if (!box) throw new Error('no axis');
  await axis.click({ position: { x: box.width * 0.9, y: 30 } });
  await expect(tab.getByTestId('an-slice')).not.toContainText('21:20');
  const at = await field(page, 'slice-time').inputValue();
  expect(at).toMatch(/^2[23]:\d\d$/);
  await axis.click({ position: { x: box.width * 0.9, y: 30 } });
  await expect(tl(page).getByTestId('slice-line')).toHaveCount(0);
  await expect(tab.getByLabel('看某一刻每個地點有誰')).not.toBeChecked();
  /* 聚光：只強調人物甲（其他淡化、列的名稱淡化） */
  await choose(page, field(page, 'spot'), '泳道：人物甲');
  await expect(tl(page).locator('[data-event-id="b1"]')).toHaveAttribute('data-dim', 'true');
  await expect(tl(page).locator('[data-event-id="a1"]')).not.toHaveAttribute('data-dim', 'true');
  await expect(tl(page).locator('[data-lane-row="B"]')).toHaveAttribute('data-dim', 'true');
  await choose(page, field(page, 'spot'), '地點：祕密金庫');
  await expect(tl(page).locator('[data-truth-of="a1"]')).not.toHaveAttribute('data-dim', 'true');
  await expect(tl(page).locator('[data-event-id="a1"]')).toHaveAttribute('data-dim', 'true');
  /* PL 檢視：聚光各自一份（GM 選的祕密金庫不會出現）、同席只比證詞 */
  await setPl(page);
  await expect(field(page, 'spot')).toContainText('全部照常');
  await expect(tl(page).locator('[data-event-id="a1"]')).not.toHaveAttribute('data-dim', 'true');
  await expect(tab.getByTestId('an-contacts-testimony')).toHaveText(
    '21:15～21:45（30 分）＠圖書室：人物甲 × 人物乙',
  );
  await expect(tab.getByTestId('an-contacts-truth')).toHaveCount(0);
  const text = await domText(page);
  expect(['甲潛入金庫', '祕密金庫', '乙的密會'].filter((w) => text.includes(w))).toEqual([]);
  expect(errors).toEqual([]);
});

test('段階公開：公開、收回、全部回到初始、復原；PL 檢視整頁（五個分頁）在公開之前不洩漏', async ({
  page,
}) => {
  await seed(page, mysteryDoc(), { tab: 'analysis', view: 'timeline' });
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const stage = analysis(page).getByTestId('an-stage');
  await expect(stage).toBeVisible();
  await expect(stage.getByTestId('an-stage-count')).toHaveText(
    '這次公開了 0 個（共 5 個可以公開）',
  );
  await expect(stage.locator('[data-stage-item="mx-wei-stand"]')).toContainText('準備時已公開');
  /* 公開之前：PL 檢視的每個分頁、時間軸都沒有服裝師的真相 */
  await setPl(page);
  await expect(analysis(page).getByTestId('an-stage-gm-only')).toBeVisible();
  const forbidden = [JIANG_TRUTH, XU_TRUTH, XU_SURFACE, LOG_SECRET, ...GM_LINKS];
  for (const name of ['事件', '泳道', '專案', '推理', '匯出']) {
    await page.getByRole('tab', { name, exact: true }).click();
    const text = await domText(page);
    expect(
      forbidden.filter((w) => text.includes(w)),
      `PL 檢視「${name}」分頁`,
    ).toEqual([]);
  }
  /* 時間切片（PL）：服裝師在服裝間（證詞）；聚光的選項沒有天橋以外的真相地點 */
  await page.getByRole('tab', { name: '推理', exact: true }).click();
  await analysis(page).getByLabel('看某一刻每個地點有誰').click();
  await setTime(page, 'slice-time', '21:40');
  await expect(analysis(page).getByTestId('an-slice')).toContainText('＠服裝間');
  expect((await domText(page)).includes(JIANG_TRUTH)).toBe(false);
  /* GM 檢視：公開服裝師的偽裝 */
  await setGm(page);
  await page
    .getByRole('button', { name: '公開：在服裝間幫第二幕的演員改戲服，沒有離開', exact: true })
    .click();
  await expect(stage.getByTestId('an-stage-count')).toHaveText(
    '這次公開了 1 個（共 5 個可以公開）',
  );
  expect((await docOf(page)).events.find((e) => e.id === 'mx-jiang-room')?.unlocked).toBe(true);
  await page
    .getByRole('button', { name: '公開：把演出事故紀錄的時間改早十分鐘', exact: true })
    .click();
  /* PL 檢視：公開了的看得到（查明）、時間切片照真相 */
  await setPl(page);
  await expect(tl(page).locator('[data-truth-of="mx-jiang-room"]')).toBeVisible();
  await expect(tl(page).locator('[data-event-id="mx-lin-log"]')).toBeVisible();
  await expect(analysis(page).getByTestId('an-slice')).toContainText('＠服裝間');
  await setGm(page);
  /* 全部回到初始（一步復原） */
  await stage.getByTestId('an-stage-reset').click();
  await expect(stage.getByTestId('an-stage-count')).toHaveText(
    '這次公開了 0 個（共 5 個可以公開）',
  );
  let doc = await docOf(page);
  expect(doc.events.filter((e) => e.unlocked)).toEqual([]);
  expect(doc.events.find((e) => e.id === 'mx-wei-stand')?.revealed).toBe(true);
  await page.keyboard.press('Control+z');
  await expect(stage.getByTestId('an-stage-count')).toHaveText(
    '這次公開了 2 個（共 5 個可以公開）',
  );
  /* 收回一個 */
  await page
    .getByRole('button', { name: '收回：把演出事故紀錄的時間改早十分鐘', exact: true })
    .click();
  doc = await docOf(page);
  expect(doc.events.filter((e) => e.unlocked).map((e) => e.id)).toEqual(['mx-jiang-room']);
  await setPl(page);
  await expect(tl(page).locator('[data-event-id="mx-lin-log"]')).toHaveCount(0);
  expect((await domText(page)).includes(LOG_SECRET)).toBe(false);
  expect(errors).toEqual([]);
});

/** PNG 的寬、高（IHDR） */
function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('匯出：紙的樣式與調書的 SVG（PL 用不洩漏）、紙翻角的 PNG（外側透明）、A4 自動分頁', async ({
  page,
}) => {
  await seed(page, mysteryDoc(), {
    tab: 'export',
    view: 'timeline',
    analysis: { slice: { on: true, time: t('21:40') } },
  });
  const errors = await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const tab = page.getByTestId('export-tab');
  const panel = page.getByRole('region', { name: '匯出圖片' });
  const result = page.getByTestId('export-result');
  /* 圖面的樣式：古紙、記號的說明、空白、圖下方的調書 */
  await tab.getByRole('button', { name: '圖面的樣式' }).click();
  const style = tab.getByTestId('export-style');
  await choose(page, field(page, 'export-paper'), '古紙・墨水');
  await style.getByLabel('記號的說明').click();
  await style.getByLabel('標出不在場證明空白').click();
  await choose(page, field(page, 'export-panel'), '不在場證明・接觸調書');
  await choose(page, field(page, 'export-title-font'), '明朝');
  await panel.getByRole('radio', { name: /SVG/ }).click();
  await panel.getByRole('button', { name: /^匯出/ }).click();
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [svgDl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  const svg = readFileSync(await svgDl.path(), 'utf8');
  expect(svg).toContain('#ecdcb6');
  expect(svg).toContain('feDropShadow');
  expect(svg).toContain('不在場證明・接觸調書（PL 用：只比證詞）');
  expect(svg).toContain('不在場證明空白');
  expect(svg).toContain("font-family=\"'Noto Serif TC'");
  expect(
    [JIANG_TRUTH, XU_TRUTH, XU_SURFACE, LOG_SECRET, ...GM_LINKS].filter((w) => svg.includes(w)),
  ).toEqual([]);
  /* 時間切片的調書（PL 用：服裝師在服裝間） */
  await choose(page, field(page, 'export-panel'), '時間切片');
  await panel.getByRole('button', { name: /^匯出/ }).click();
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [sliceDl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  const sliceSvg = readFileSync(await sliceDl.path(), 'utf8');
  expect(sliceSvg).toContain('時間切片：21:40');
  expect(sliceSvg).toContain('＠服裝間');
  expect(sliceSvg.includes(JIANG_TRUTH)).toBe(false);
  /* PNG：紙翻角與落影，外側透明（左上角的像素是透明的） */
  await panel.getByRole('radio', { name: /PNG/ }).click();
  await panel.getByRole('button', { name: /^匯出/ }).click();
  await expect(result).toBeVisible({ timeout: 60_000 });
  const [pngDl] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('link', { name: '下載' }).click(),
  ]);
  const png = readFileSync(await pngDl.path());
  const alpha = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d');
    if (!ctx) return [-1, -1];
    ctx.drawImage(bmp, 0, 0);
    const corner = ctx.getImageData(2, 2, 1, 1).data[3];
    const mid = ctx.getImageData(Math.floor(bmp.width / 2), 60, 1, 1).data[3];
    return [corner, mid];
  }, png.toString('base64'));
  expect(alpha).toEqual([0, 255]);
  /* A4 自動分頁：寬度 6000 → 好幾頁，每頁長邊 1600 px、檔名加頁數 */
  await tab.getByRole('button', { name: '分頁（PNG）' }).click();
  const paging = tab.getByTestId('export-paging');
  await paging.getByRole('radio', { name: 'A4 自動分頁' }).click();
  await paging.getByRole('radio', { name: '1600 px' }).click();
  const widthInput = tab.getByRole('spinbutton', { name: '寬度' });
  await widthInput.fill('6000');
  await widthInput.press('Enter');
  await expect(paging).toContainText(/照時間切成 \d+ 頁/);
  await panel.getByRole('button', { name: /^匯出/ }).click();
  const batch = page.getByTestId('export-batch');
  await expect(batch).toBeVisible({ timeout: 90_000 });
  await expect(batch).toContainText('紅幕劇場的首演之夜_時間軸_p01.png');
  await expect(batch).toContainText('紅幕劇場的首演之夜_時間軸_p02.png');
  const links = batch.getByRole('link', { name: '下載' });
  const n = await links.count();
  expect(n).toBeGreaterThan(1);
  const [p1] = await Promise.all([page.waitForEvent('download'), links.first().click()]);
  const size = pngSize(readFileSync(await p1.path()));
  expect(Math.max(size.w, size.h)).toBe(1600);
  expect(errors).toEqual([]);
});

test('專案檔：版本 5，段階公開存了再開逐欄位相同', async ({ page }) => {
  const doc = mysteryDoc();
  const jiang = doc.events.find((e) => e.id === 'mx-jiang-room');
  if (jiang) jiang.unlocked = true;
  const k1 = doc.links.find((k) => k.id === 'mx-k1');
  if (k1) k1.unlocked = true;
  await seed(page, doc);
  const errors = await open(page);
  await page.getByRole('button', { name: /^專案/ }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔' }).click(),
  ]);
  const saved = JSON.parse(readFileSync(await dl.path(), 'utf8')) as { version: number; data: Doc };
  expect(saved.version).toBe(5);
  expect(saved.data.events.find((e) => e.id === 'mx-jiang-room')?.unlocked).toBe(true);
  expect(saved.data.links.find((k) => k.id === 'mx-k1')?.unlocked).toBe(true);
  expect(saved.data.events.filter((e) => e.unlocked).length).toBe(1);
  expect(errors).toEqual([]);
});

for (const width of [390, 360, 320]) {
  test(`窄畫面 ${width}：推理分頁（切片、段階公開）、匯出的樣式與分頁沒有橫向捲動`, async ({
    page,
  }) => {
    await seed(page, mysteryDoc(), {
      tab: 'analysis',
      view: 'timeline',
      analysis: { gaps: true, slice: { on: true, time: t('21:40') }, spot: { gm: 'truth' } },
    });
    const errors = await open(page);
    await page.setViewportSize({ width, height: 844 });
    await expect(analysis(page).getByTestId('an-slice')).toBeVisible();
    await expect(tl(page).getByTestId('slice-line')).toHaveCount(1);
    await noHorizontalScroll(page);
    await page.getByRole('tab', { name: '匯出', exact: true }).click();
    const tab = page.getByTestId('export-tab');
    await tab.getByRole('button', { name: '圖面的樣式' }).click();
    await choose(page, field(page, 'export-paper'), '藍曬圖');
    await tab.getByRole('button', { name: '分頁（PNG）' }).click();
    await tab.getByTestId('export-paging').getByRole('radio', { name: 'A4 自動分頁' }).click();
    await noHorizontalScroll(page);
    await setPl(page);
    await page.getByRole('tab', { name: '推理', exact: true }).click();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}
