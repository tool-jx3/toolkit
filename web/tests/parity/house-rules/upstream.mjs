/**
 * CoC 房規表產生器：產生與原作（CoCハウスルール表メーカー v1.00）對照的資料（規格 3.8）。
 * 用 Playwright 開本機的原作頁面（file://），
 * 1. 依序套用三種預設集，記下每條規則的 val／vis／n；
 * 2. 把幾組狀態寫進原作的存檔再開匯出視窗，取純文字／Markdown 的輸出骨架（tests/helpers/houseRulesSkeleton.ts）與 PNG 尺寸。
 * 結果寫到 tests/unit/fixtures/house-rules-upstream.json（只有 id、數值、骨架與對照用自己寫的注記，沒有原作的文字）；
 * 原作的原文只在 HR_RAW_OUT 有給時另存（不提交）。
 *
 * 執行（web/ 底下）：HR_UPSTREAM=<原作的 house-rule-table 資料夾> node tests/parity/house-rules/upstream.mjs
 * 預設的原作位置：/home/user/upstream/kumachansteps__trpg-web-tools/tools/house-rule-table
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { markdownSkeleton, textSkeleton } from '../../helpers/houseRulesSkeleton.ts';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH)
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const UPSTREAM =
  process.env.HR_UPSTREAM ??
  '/home/user/upstream/kumachansteps__trpg-web-tools/tools/house-rule-table';
const URL = `file://${UPSTREAM}/index.html`;
const KEY = 'houseRuleTable.v1';
const FIXTURE = new globalThis.URL(
  '../../unit/fixtures/house-rules-upstream.json',
  import.meta.url,
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' });
page.on('pageerror', (e) => console.log('pageerror', e.message));

const readState = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).state, KEY);

async function preset(id) {
  await page.click('#presetBtn');
  await page.click(`[data-preset="${id}"]`);
  await page.waitForTimeout(400);
  return readState();
}

const strip = (state) => {
  const out = {};
  for (const sec of ['6', '7', 'common']) {
    out[sec] = {};
    for (const [id, row] of Object.entries(state.secs[sec].rows)) {
      out[sec][id] = { val: row.val, vis: row.vis, ...(row.n !== undefined ? { n: row.n } : {}) };
    }
  }
  return out;
};

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(300);
const presets = {};
presets.raw = strip(await preset('raw'));
presets.pop = strip(await preset('pop'));
/* clear は pop のあとに（vis はそのまま） */
presets.clearAfterPop = strip(await preset('clear'));
await preset('raw');
const rawState = await readState();
await preset('pop');
const popState = await readState();

const clone = (v) => JSON.parse(JSON.stringify(v));

/* ---------- 對照的狀態 ---------- */
const cases = [];

/* 1. 開頁（照規則書）、6 版 */
{
  const s = clone(rawState);
  s.edition = '6';
  s.info = { title: '', kp: '', system: '', scenario: '', date: '2026-10-09', remarks: '' };
  cases.push({ name: 'raw-6', state: s });
}

/* 2. 線上團常見、兩版並列、注記、※、數字選項、自訂規則、改名、備註 */
{
  const s = clone(popState);
  s.edition = 'both';
  s.info = {
    title: '週五團的房規',
    kp: '阿明',
    system: '',
    scenario: '雨夜的來訪者',
    date: '2026-10-01',
    remarks: '有問題隨時問我\n第二行備註',
  };
  s.secs['6'].rows.cmd.note = '戰鬥輪也用 CCB';
  s.secs['6'].rows.reroll = { ...s.secs['6'].rows.reroll, val: 'each', n: 5, vis: true };
  s.secs['6'].rows.skillcap = { ...s.secs['6'].rows.skillcap, val: 'cap', n: 85, vis: true };
  s.secs['7'].rows.luckspend = {
    ...s.secs['7'].rows.luckspend,
    val: 'm',
    vis: true,
    note: '一次最多 10 點\n大失敗不能改',
  };
  s.secs['7'].rows.reroll = { ...s.secs['7'].rows.reroll, val: 'total', n: 7, vis: true };
  s.secs['7'].rows.chase = { ...s.secs['7'].rows.chase, vis: true, name: '追逐戰' };
  s.secs['7'].rows.fumble7 = { ...s.secs['7'].rows.fumble7, val: null, vis: true };
  s.secs.common.custom = [
    { id: 'c1', cat: 'dice', name: '骰子的顏色', val: 'o', text: '', note: '', vis: true },
    { id: 'c2', cat: 'dice', name: '', val: 'text', text: '每人一顆', note: '自由發揮', vis: true },
    { id: 'c3', cat: 'play', name: '遲到', val: 'm', text: '', note: '先說一聲', vis: true },
    { id: 'c4', cat: 'play', name: '藏起來的', val: 'x', text: '', note: '', vis: false },
    { id: 'c5', cat: 'share', name: '沒設定', val: null, text: '', note: '', vis: true },
    { id: 'c6', cat: 'share', name: '空白內容', val: 'text', text: '', note: '', vis: true },
  ];
  s.secs['7'].custom = [
    { id: 'c7', cat: 'table', name: '餅乾規則', val: 'o', text: '', note: '帶餅乾來', vis: true },
  ];
  cases.push({ name: 'pop-both', state: s });
}

/* 3. 全部清空之後、7 版（放進表的都是未設定） */
{
  const s = clone(popState);
  for (const sec of ['6', '7', 'common'])
    for (const row of Object.values(s.secs[sec].rows)) {
      row.val = null;
      row.note = '';
      delete row.n;
    }
  s.edition = '7';
  s.info = { title: '空白', kp: '', system: '自訂系統', scenario: '', date: '', remarks: '' };
  cases.push({ name: 'clear-7', state: s });
}

/* 4. 只有各版通用裡自己加的規則 */
{
  const s = clone(rawState);
  for (const sec of ['6', '7', 'common'])
    for (const row of Object.values(s.secs[sec].rows)) row.vis = false;
  s.edition = '6';
  s.info = { title: '', kp: '', system: '', scenario: '', date: '2026-01-02', remarks: '' };
  s.secs.common.custom = [
    {
      id: 'c1',
      cat: 'char',
      name: '角色卡',
      val: 'text',
      text: '開團前一天給',
      note: '',
      vis: true,
    },
  ];
  cases.push({ name: 'custom-only', state: s });
}

/* 5. 表上什麼都沒有 */
{
  const s = clone(rawState);
  for (const sec of ['6', '7', 'common'])
    for (const row of Object.values(s.secs[sec].rows)) row.vis = false;
  s.edition = '7';
  s.info = { title: '', kp: '', system: '', scenario: '', date: '2026-10-09', remarks: '只有備註' };
  cases.push({ name: 'empty', state: s });
}

const raw = {};
for (const c of cases) {
  await page.evaluate(
    ([k, state]) => localStorage.setItem(k, JSON.stringify({ state, savedAt: 1 })),
    [KEY, c.state],
  );
  await page.reload();
  await page.waitForTimeout(250);
  await page.click('#exportBtn');
  await page.waitForTimeout(250);
  c.outputs = {};
  raw[c.name] = {};
  const empty = await page.$('.exp-empty');
  c.empty = !!empty;
  if (empty) {
    await page.click('[data-close-modal]');
    continue;
  }
  for (const fmt of ['txt', 'md']) {
    await page.click(`[data-fmt="${fmt}"]`);
    for (const [notes, legend] of [
      [true, true],
      [false, true],
      [true, false],
    ]) {
      const boxes = await page.$$('.exp-checks input[type="checkbox"]');
      if ((await boxes[0].isChecked()) !== notes) await boxes[0].click();
      const boxes2 = await page.$$('.exp-checks input[type="checkbox"]');
      if ((await boxes2[1].isChecked()) !== legend) await boxes2[1].click();
      await page.waitForTimeout(100);
      const t = await page.$eval('.exp-text', (el) => el.value);
      const key = `${fmt}|${notes ? 'notes' : 'nonotes'}|${legend ? 'legend' : 'nolegend'}`;
      raw[c.name][key] = t;
      c.outputs[key] = fmt === 'txt' ? textSkeleton(t) : markdownSkeleton(t);
    }
    /* 回到預設 */
    const boxes = await page.$$('.exp-checks input[type="checkbox"]');
    if (!(await boxes[0].isChecked())) await boxes[0].click();
    const boxes2 = await page.$$('.exp-checks input[type="checkbox"]');
    if (!(await boxes2[1].isChecked())) await boxes2[1].click();
  }
  await page.click('[data-fmt="png"]');
  c.png = {};
  for (const layout of ['wide', 'narrow']) {
    await page.click(`.exp-options .segment-group:nth-of-type(1) button`).catch(() => {});
    const btns = await page.$$('.exp-options .exp-field');
    const layoutBtns = await btns[1].$$('button');
    await layoutBtns[layout === 'wide' ? 0 : 1].click();
    await page.waitForTimeout(150);
    c.png[layout] = await page.$eval('.exp-img', (img) => [img.naturalWidth, img.naturalHeight]);
  }
  await page.click('[data-close-modal]');
}

if (process.env.HR_RAW_OUT) writeFileSync(process.env.HR_RAW_OUT, JSON.stringify(raw, null, 2));
writeFileSync(
  FIXTURE,
  `${JSON.stringify(
    {
      note: '原作（CoCハウスルール表メーカー v1.00）在本機產生的對照資料：預設集的值與輸出骨架（見 tests/helpers/houseRulesSkeleton.ts）。',
      presets,
      cases,
    },
    null,
    1,
  )}\n`,
);
console.log(
  'cases',
  cases.map((c) => [c.name, c.empty, c.png]),
);
await browser.close();
