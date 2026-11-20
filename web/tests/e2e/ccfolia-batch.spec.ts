/**
 * CCFOLIA 角色批次產生器（建置產物 next/ccfolia-batch/）的端對端測試（規格 docs/refactor/specs/ccfolia-batch.md）：
 * - 開頁沒有錯誤、預設狀態、頁尾只有靈感來源。
 * - 速記・從劇本貼上：範例、預覽、原文的讀法、改讀法與記住、鍵盤選取、提醒；確定，換下一位 NPC；復原。
 * - 貼上試算表：範例、改欄的用途、Tab 輸入 Tab；從角色卡網站貼上。
 * - 圖片庫（立繪與差分、用在哪裡、刪除）、修改選取的棋子（固定清單、從輸入重做、加圖片）。
 * - 匯出房間 ZIP 與素材 ZIP（存下來解開檢查）、角色剪貼簿 JSON。
 * - 專案檔（存、重來、開啟、原作的專案檔）、自動儲存。
 * - 窄畫面（390／360／320）沒有橫向捲動；1280 與 390 的視覺基準。
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync, zlibSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('ccfolia-batch') ?? { id: 'ccfolia-batch', status: 'next' })}/`;

/* ---------- 測試圖（自己畫的簡單圖形） ---------- */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(w: number, h: number, px: (x: number, y: number) => number[]): Buffer {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
const figure = (rgb: number[]) => (x: number, y: number) =>
  (x - 30) ** 2 + (y - 25) ** 2 < 225 || (y > 38 && y < 118 && Math.abs(x - 30) < 8 + (y - 38) / 5)
    ? [...rgb, 255]
    : [0, 0, 0, 0];
const ALICE = png(60, 120, figure([220, 120, 160]));
const ALICE_SMILE = png(60, 120, figure([250, 190, 80]));
const SHADOW = png(60, 120, figure([60, 60, 80]));
const BOB = png(60, 120, figure([90, 160, 220]));
const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/* ---------- 共用的操作 ---------- */

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
  await expect(
    page.getByRole('heading', { level: 1, name: 'CCFOLIA 角色批次產生器' }),
  ).toBeVisible();
  return errors;
}

const tab = (page: Page, name: RegExp | string) => page.getByRole('tab', { name });
const memo = (page: Page) => page.getByTestId('memo');
const table = (page: Page) => page.getByTestId('table');
const rows = (page: Page) => page.getByTestId('piece');
const rowNames = (page: Page) => rows(page).locator('[data-role="name"]');
const status = (page: Page, area: string) => page.getByTestId(`status-${area}`);
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const palette = (page: Page) => page.getByTestId('mock-palette');

async function pick(page: Page, combo: string, option: string) {
  await page.getByRole('combobox', { name: combo, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function addImages(page: Page, files: ReturnType<typeof file>[]) {
  await tab(page, /^圖片庫/).click();
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await tab(page, '輸入').click();
}

async function fillSample(page: Page) {
  await tab(page, '輸入').click();
  await btn(page, '填入範例').click();
}

async function download(page: Page, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  return { name: dl.suggestedFilename(), bytes };
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/* ---------- 測試 ---------- */

test('開頁：沒有錯誤、預設狀態、頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  await expect(tab(page, '輸入')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, '圖片庫（0）')).toBeVisible();
  await expect(page.getByTestId('empty-list')).toHaveText('在上面寫 NPC，這裡會一個一個列出來。');
  await expect(page.getByTestId('preview-empty')).toBeVisible();
  await expect(page.getByTestId('export-summary')).toHaveText('還沒有可以匯出的棋子。');
  await expect(btn(page, '匯出房間 ZIP')).toBeDisabled();
  await expect(btn(page, '匯出素材 ZIP')).toBeDisabled();
  await expect(btn(page, '確定，換下一位 NPC')).toBeDisabled();
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://github.com/shiki365/character-batch-maker',
  );
  await expect(footer.getByRole('link')).toHaveText('shiki365／キャラクター一括メーカー');
  expect(errors).toEqual([]);
});

test('速記：範例、預覽、原文的讀法、改讀法與記住、鍵盤選取', async ({ page }) => {
  const errors = await open(page);
  await fillSample(page);
  await expect(page.getByTestId('list-title')).toHaveText('棋子清單（5）');
  await expect(rowNames(page)).toHaveText(['艾莉絲', '鮑伯', '黑影A', '黑影B', '黑影C']);
  await expect(rows(page).first().locator('[data-role="status"]')).toHaveText(
    'HP 12/12　MP 10/10　SAN 55/99',
  );
  /* 選第一個：預覽與原文 */
  await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true');
  await expect(palette(page)).toHaveText(
    'CCB<={SAN} 理智檢定\nCCB<=30 閃避\nCCB<=50 鬥毆\n1d3 鬥毆（傷害）\nCCB<=65 圖書館使用',
  );
  await expect(page.getByTestId('mock-initiative')).toHaveText('60');
  await expect(page.getByTestId('source-line')).toHaveCount(5);
  await expect(page.getByTestId('source-line').nth(4).getByTestId('chip')).toHaveText(
    '角色備註：大學生，好奇心旺盛',
  );
  /* 鍵盤：↓ 選下一個 */
  await rows(page).first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rows(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(palette(page)).toHaveText('CCB<=70 爪擊\n1d6+1d4 爪擊（傷害）\nCCB<=40 閃避');
  /* 讀到的標籤：沒看過的名稱標「？」；爪擊改成參數 */
  await page.getByRole('button', { name: /讀到的標籤/ }).click();
  await expect(page.getByTestId('labels-title')).toHaveText('讀到的標籤（12 種）與讀法');
  await expect(page.getByTestId('label-unknown')).toHaveCount(1);
  await pick(page, '「爪擊」的讀法', '參數');
  await expect(palette(page)).toHaveText('CCB<=40 閃避');
  await expect(page.getByTestId('mock-params')).toHaveText('DEX 80　護甲 2　爪擊 70');
  /* 判定的寫法 */
  await pick(page, '技能的判定', 'CC<=（克蘇魯的呼喚 7 版）');
  await expect(palette(page)).toHaveText('CC<=40 閃避');
  /* 重新整理：輸入、讀法都留著 */
  await page.reload();
  await expect(rowNames(page)).toHaveCount(5);
  await rows(page).nth(3).click();
  await expect(palette(page)).toHaveText('CC<=40 閃避');
  expect(errors).toEqual([]);
});

test('從劇本貼上（中文）：讀不出的標示、提醒、確定換下一位、復原', async ({ page }) => {
  const errors = await open(page);
  await memo(page).fill(
    [
      '■ 陳老闆（54歲），雜貨店老闆',
      'STR 60 CON 50 SIZ 65 DEX 40 APP 45 INT 70 POW 55 EDU 60',
      'HP 11 MP 11 SAN 55 DB 0',
      '技能：閃避 30%、鬥毆 50%（1D3+DB）、偵查 60%',
      '命中 / 80',
    ].join('\n'),
  );
  await expect(rowNames(page)).toHaveText(['陳老闆']);
  await rows(page).first().click();
  await expect(palette(page)).toHaveText(
    'CC<={SAN} 理智檢定\nCC<=30 閃避\nCC<=50 鬥毆\n1D3{DB} 鬥毆（傷害）\nCC<=60 偵查',
  );
  await expect(page.getByTestId('source-line').nth(4)).toHaveAttribute('data-state', 'unread');
  await expect(page.getByTestId('chip').filter({ hasText: '讀不出：80' })).toHaveAttribute(
    'data-miss',
    'true',
  );
  await expect(page.getByTestId('warnings')).toContainText('陳老闆：第 5 行有讀不出的數字');
  /* 確定，換下一位 NPC */
  await btn(page, '確定，換下一位 NPC').click();
  await expect(memo(page)).toHaveValue('');
  await expect(status(page, 'list')).toHaveText(
    '已確定（加了 1 個，共 1 個）。輸入欄已清空，可以接著輸入下一位 NPC。',
  );
  await memo(page).fill('深潛者 ×2\nHP 16\n格鬥 45 1D6+DB');
  await expect(rowNames(page)).toHaveText(['陳老闆', '深潛者A', '深潛者B']);
  await expect(rows(page).first().locator('[data-role="line"]')).toHaveText('✓');
  await expect(page.getByTestId('list-summary')).toContainText('已確定 1 個＋輸入中 2 個');
  /* 復原：回到確定之前 */
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(memo(page)).toHaveValue(/^■ 陳老闆/);
  await expect(rowNames(page)).toHaveText(['陳老闆']);
  expect(errors).toEqual([]);
});

test('貼上試算表：範例、改欄的用途、Tab 輸入 Tab；從角色卡網站貼上', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('radio', { name: '貼上試算表' }).click();
  await expect(page.getByTestId('empty-list')).toHaveText('在上面貼上表格，這裡會一個一個列出來。');
  await fillSample(page);
  await expect(rowNames(page)).toHaveText(['艾莉絲', '鮑伯', '黑影']);
  await expect(page.getByTestId('columns').getByRole('combobox')).toHaveCount(9);
  await rows(page).first().click();
  await expect(palette(page)).toHaveText('CCB<={閃避} 閃避\n1d3 鬥毆');
  await pick(page, '「閃避」欄的用途', '狀態');
  await expect(rows(page).first().locator('[data-role="status"]')).toHaveText(
    'HP 12/12　MP 10/10　SAN 55/99　閃避 30/30',
  );
  /* Tab 輸入 Tab */
  await table(page).fill('名稱');
  await table(page).press('End');
  await table(page).press('Tab');
  await table(page).pressSequentially('HP');
  await expect(table(page)).toHaveValue('名稱\tHP');
  /* 角色卡網站 */
  await table(page).fill('名稱\tHP\nA\t1');
  await btn(page, /從角色卡網站貼上/).click();
  await page.getByTestId('paste-json').fill(
    JSON.stringify({
      kind: 'character',
      data: {
        name: '探索者',
        iconUrl: 'https://example.test/a.png',
        status: [{ label: 'HP', value: 11, max: 11 }],
        commands: 'CC<=50 偵查',
      },
    }),
  );
  await btn(page, '加入').click();
  await expect(rowNames(page)).toHaveText(['A', '探索者']);
  await expect(rows(page).nth(1).locator('[data-role="line"]')).toHaveText('⧉');
  await expect(status(page, 'paste')).toContainText('已加入 1 個。立繪沒有帶進來');
  await expect(page.getByTestId('paste-info')).toHaveText('貼上的棋子 1 個');
  expect(errors).toEqual([]);
});

test('圖片庫、修改、匯出房間 ZIP 與素材 ZIP', async ({ page }) => {
  const errors = await open(page);
  await fillSample(page);
  await addImages(page, [
    file('艾莉絲.png', ALICE),
    file('艾莉絲_笑.png', ALICE_SMILE),
    file('黑影.png', SHADOW),
    file('同一張.png', SHADOW),
    file('說明.txt', Buffer.from('x'), 'text/plain'),
  ]);
  await expect(tab(page, '圖片庫（3）')).toBeVisible();
  await tab(page, /^圖片庫/).click();
  await expect(status(page, 'shelf')).toHaveText(
    '已把 3 張圖片放進圖片庫。1 張和圖片庫裡的圖相同，用原本的。1 個檔案的格式不能用（可以用 PNG、JPEG、GIF、WebP）。',
  );
  await expect(page.getByTestId('image-use')).toHaveText([
    '艾莉絲的立繪',
    '艾莉絲的差分「笑」',
    '黑影的立繪',
  ]);
  await tab(page, '輸入').click();
  await expect(rows(page).first()).toContainText('差分 1');
  await expect(page.getByTestId('list-summary')).toHaveText('有立繪 4 個、沒有 1 個');
  /* 修改鮑伯：從檔案加立繪、放到盤面；清單固定、輸入欄唯讀 */
  await rows(page).nth(1).click();
  const editor = page.getByTestId('editor');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    editor.getByRole('button', { name: '立繪：從檔案加圖片' }).click(),
  ]);
  await chooser.setFiles(file('bob-face.png', BOB));
  await expect(editor.getByTestId('ed-portrait').getByRole('combobox')).toHaveText('bob-face');
  await pick(page, '盤面', '放到盤面');
  await expect(page.getByTestId('edited-note')).toBeVisible();
  await expect(page.getByTestId('input-locked')).toBeVisible();
  await expect(memo(page)).toHaveAttribute('readonly', '');
  await expect(rows(page).nth(1)).toContainText('盤面');
  await expect(page.getByTestId('export-summary')).toHaveText(
    '把 5 個棋子匯出成一個 ZIP（放到盤面 1 個、只放進角色清單 4 個）。',
  );

  /* 房間 ZIP */
  const room = await download(page, () => btn(page, '匯出房間 ZIP').click());
  expect(room.name).toMatch(/^ccfolia-batch-\d{8}-\d{4}\.zip$/);
  await expect(status(page, 'export')).toHaveText(
    '已匯出（棋子 5 個、差分 1 個、圖片 4 張）。請在 CCFOLIA 的房間設定讀入。',
  );
  const zip = unzipSync(room.bytes);
  const names = Object.keys(zip);
  expect(names.slice(0, 2)).toEqual(['__data.json', '.token']);
  expect(new TextDecoder().decode(zip['.token'])).toMatch(/^0\.[0-9a-f]{64}$/);
  for (const n of names.slice(2)) expect(n).toBe(`${sha(zip[n])}.png`);
  const data = JSON.parse(new TextDecoder().decode(zip['__data.json']));
  expect(data.entities.room).toEqual({});
  expect(Object.keys(data.resources).sort()).toEqual(names.slice(2).sort());
  const chars = Object.values(data.entities.characters) as Record<string, unknown>[];
  expect(chars.map((c) => c.name)).toEqual(['艾莉絲', '鮑伯', '黑影A', '黑影B', '黑影C']);
  const [alice, bob, a, b] = chars;
  expect(alice.iconUrl).toBe(`${sha(ALICE)}.png`);
  expect(alice.faces).toEqual([{ label: '笑', iconUrl: `${sha(ALICE_SMILE)}.png` }]);
  expect(bob.iconUrl).toBe(`${sha(BOB)}.png`);
  expect([bob.active, bob.x, bob.y, alice.active]).toEqual([true, 0, 0, false]);
  expect([a.iconUrl, b.iconUrl]).toEqual([`${sha(SHADOW)}.png`, `${sha(SHADOW)}.png`]);
  expect(alice.status).toEqual([
    { label: 'HP', value: 12, max: 12 },
    { label: 'MP', value: 10, max: 10 },
    { label: 'SAN', value: 55, max: 99 },
  ]);
  expect(alice.commands).toBe(
    'CCB<={SAN} 理智檢定\nCCB<=30 閃避\nCCB<=50 鬥毆\n1d3 鬥毆（傷害）\nCCB<=65 圖書館使用',
  );
  expect(alice.memo).toBe('大學生，好奇心旺盛');
  expect((a.order as number) - (alice.order as number)).toBe(2);

  /* 素材 ZIP */
  const assets = await download(page, () => btn(page, '匯出素材 ZIP').click());
  expect(assets.name).toMatch(/^ccfolia-batch-assets-\d{8}-\d{4}\.zip$/);
  expect(Object.keys(unzipSync(assets.bytes))).toEqual([
    '立繪/艾莉絲.png',
    '差分/艾莉絲_笑.png',
    '立繪/鮑伯.png',
    '立繪/黑影.png',
  ]);

  /* 從輸入重做：手動修改丟掉 */
  await btn(page, '從輸入重做').click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重做' }).click();
  await expect(page.getByTestId('edited-note')).toHaveCount(0);
  await expect(memo(page)).not.toHaveAttribute('readonly', '');
  /* 刪除用到的圖 */
  await tab(page, /^圖片庫/).click();
  await page.getByRole('button', { name: '刪除圖片「黑影」' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(tab(page, '圖片庫（3）')).toBeVisible();
  expect(errors).toEqual([]);
});

test('角色剪貼簿 JSON', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  await memo(page).fill('黑影\nHP 20 DEX 80\n爪擊 70');
  await rows(page).first().click();
  await btn(page, '複製 CCFOLIA 角色資料').click();
  await expect(page.getByText('已複製到剪貼簿', { exact: true })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const json = JSON.parse(text);
  expect(json.kind).toBe('character');
  expect(json.data).toMatchObject({
    name: '黑影',
    initiative: 80,
    status: [{ label: 'HP', value: 20, max: 20 }],
    params: [{ label: 'DEX', value: '80' }],
    commands: 'CCB<=70 爪擊',
    width: 4,
  });
  expect(errors).toEqual([]);
});

test('專案檔：存、重來（圖片庫留著）、開啟、原作的專案檔', async ({ page }) => {
  const errors = await open(page);
  await addImages(page, [file('艾莉絲.png', ALICE)]);
  await memo(page).fill('艾莉絲\nHP 12');
  await btn(page, '確定，換下一位 NPC').click();
  await memo(page).fill('鮑伯\nHP 14');
  await btn(page, '專案').click();
  const saved = await download(page, () =>
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  );
  expect(saved.name).toMatch(/^ccfolia-batch-project-\d{8}-\d{4}\.zip$/);
  const pf = unzipSync(saved.bytes);
  const project = JSON.parse(new TextDecoder().decode(pf['project.json']));
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'ccfolia-batch',
    version: 1,
  });
  expect(project.data.memo).toBe('鮑伯\nHP 14');
  expect(Object.keys(pf).filter((n) => n.startsWith('files/'))).toHaveLength(1);
  /* 重來 */
  await btn(page, '專案').click();
  await page.getByRole('menuitem', { name: '重來…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重來' }).click();
  await expect(memo(page)).toHaveValue('');
  await expect(rows(page)).toHaveCount(0);
  await expect(tab(page, '圖片庫（1）')).toBeVisible();
  /* 開啟 */
  await btn(page, '專案').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles({
    name: saved.name,
    mimeType: 'application/zip',
    buffer: Buffer.from(saved.bytes),
  });
  await expect(page.getByText(/已開啟專案檔/).first()).toBeVisible();
  await expect(rowNames(page)).toHaveText(['艾莉絲', '鮑伯']);
  await expect(memo(page)).toHaveValue('鮑伯\nHP 14');
  await expect(rows(page).first().locator('img')).toHaveCount(1);
  /* 原作的專案檔 */
  const legacy = {
    app: 'ccf-character-batch-maker',
    version: 1,
    state: {
      images: [
        {
          id: 'iabc',
          kind: 'file',
          name: 'ボブ',
          type: 'image/png',
          size: BOB.length,
          hash: sha(BOB),
          dataUrl: `data:image/png;base64,${BOB.toString('base64')}`,
        },
      ],
      mode: 'memo',
      memo: 'ボブ\nHP 14  MP 8\nこぶし 50 1d3',
      table: '',
      columns: {},
      labels: {},
      kept: [],
      pasted: [],
      opts: { roll: 'cc' },
      edited: null,
    },
  };
  await btn(page, '專案').click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser2.setFiles({
    name: 'characters-20261120-1200.characters.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(
    page.getByText(
      '已開啟原作的專案檔「characters-20261120-1200.characters.json」，1 張圖片放進圖片庫',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(rowNames(page)).toHaveText(['ボブ']);
  await rows(page).first().click();
  await expect(palette(page)).toHaveText('CC<=50 こぶし\n1d3 こぶし（傷害）');
  await expect(tab(page, '圖片庫（2）')).toBeVisible();
  /* 壞掉的檔 */
  await btn(page, '專案').click();
  const [chooser3] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser3.setFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{oops'),
  });
  await expect(page.getByText(/無法開啟專案檔/).first()).toBeVisible();
  await expect(rowNames(page)).toHaveText(['ボブ']);
  expect(errors).toEqual([]);
});

test('窄畫面（360、320）沒有橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const errors = await open(page);
  await fillSample(page);
  await addImages(page, [file('艾莉絲.png', ALICE), file('艾莉絲_笑.png', ALICE_SMILE)]);
  await rows(page).first().click();
  await page.getByRole('button', { name: /讀到的標籤/ }).click();
  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await tab(page, '輸入').click();
    await noHorizontalScroll(page);
    await tab(page, /^圖片庫/).click();
    await noHorizontalScroll(page);
    await tab(page, '全體設定').click();
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test.describe('視覺回歸', () => {
  async function prepare(page: Page) {
    const errors = await open(page);
    await fillSample(page);
    await addImages(page, [
      file('艾莉絲.png', ALICE),
      file('艾莉絲_笑.png', ALICE_SMILE),
      file('黑影.png', SHADOW),
    ]);
    await rows(page).first().click();
    await expect(page.getByTestId('mock-faces').locator('img')).toHaveCount(1);
    await page.getByRole('heading', { level: 1 }).click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    return errors;
  }

  test('1280 寬', async ({ page }) => {
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('ccfolia-batch-1280.png', {
      fullPage: true,
      mask: [page.getByText(/已自動儲存|設定會自動儲存/)],
    });
    expect(errors).toEqual([]);
  });

  test('390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await tab(page, /^圖片庫/).click();
    await noHorizontalScroll(page);
    await tab(page, '全體設定').click();
    await noHorizontalScroll(page);
    await tab(page, '輸入').click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('ccfolia-batch-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
