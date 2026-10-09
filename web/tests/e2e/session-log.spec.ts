/**
 * 跑團紀錄簿（建置產物 tools/session-log/）的端對端測試：
 * - 開頁沒有 pageerror／console error；範例列與提示、統計、頁尾只放靈感來源、非官方聲明、團報產生器連結。
 * - 新增／編輯／刪除（確認、可以復原）、雙擊編輯、統計更新；詳細・感想側欄（即時存檔、日期與系統的寫回、貼文、防雷連結）。
 * - 欄位：新增可選欄位、自訂欄位、移除、重設、把手拖曳排序、鍵盤排序、欄寬（鍵盤）。
 * - 搜尋、系統與身分篩選、排序；匯入（試算表貼上、重複略過、亮起與解除篩選、團報文字預覽、CCFOLIA 多份紀錄、JSON 覆寫）；
 *   範本 CSV 與 JSON 匯出（解析下載的檔案）；清單輸出與複製；送到團報產生器（交接資料、開新分頁）。
 * - 快捷鍵（Alt＋N、Ctrl＋Shift＋F、Ctrl＋J、Ctrl＋E、Esc）；自動存檔與舊版存檔的搬移。
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('session-log') ?? { id: 'session-log', status: 'next' })}/`;
const STORE_KEY = 'trpg-toolkit:session-log';
const PENDING_KEY = 'trpgWebTools.sessionReportGenerator.pendingImport';

async function open(page: Page, { goto = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  if (goto) await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '跑團紀錄簿' })).toBeVisible();
  return errors;
}

const logRegion = (page: Page) => page.getByRole('region', { name: '跑團紀錄' });
const table = (page: Page) => page.getByRole('table', { name: '跑團紀錄表格' });
const rows = (page: Page) => table(page).locator('tbody tr[data-row-id]');
const rowByScenario = (page: Page, name: string) => rows(page).filter({ hasText: name });
const toolbarBtn = (page: Page, name: string) =>
  logRegion(page).getByRole('button', { name, exact: true }).first();
const headerKeys = (page: Page) =>
  table(page)
    .locator('thead th[data-col]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.col));
const stat = (page: Page, id: string) => page.getByTestId(id);

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function pick(page: Page, combo: Locator, option: string) {
  await combo.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function storedRows(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? '{"state":{"data":{"rows":[]}}}').state.data.rows,
    STORE_KEY,
  );
}

async function deleteSamples(page: Page) {
  await logRegion(page).getByRole('button', { name: '刪除範例' }).click();
  await expect(page.getByTestId('sample-notice')).toHaveCount(0);
}

/** 用新增對話框加一團 */
async function addSession(
  page: Page,
  f: { scenario: string; date?: string; gm?: string; players?: string; pc?: string; time?: string },
) {
  await toolbarBtn(page, '新增團').click();
  const dlg = page.getByRole('dialog', { name: '新增團' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('textbox', { name: '劇本', exact: true })).toBeFocused();
  await dlg.getByRole('textbox', { name: '劇本', exact: true }).fill(f.scenario);
  if (f.date) await dlg.getByLabel('日期 1', { exact: true }).fill(f.date);
  if (f.gm) await dlg.getByRole('textbox', { name: 'GM／KP／DL' }).fill(f.gm);
  if (f.players) await dlg.getByRole('textbox', { name: 'PL（同團玩家）' }).fill(f.players);
  if (f.pc) await dlg.getByRole('textbox', { name: 'PC', exact: true }).fill(f.pc);
  if (f.time) await dlg.getByRole('textbox', { name: '時間' }).fill(f.time);
  await dlg.getByRole('button', { name: '儲存' }).click();
  await expect(dlg).toHaveCount(0);
}

test.use({
  contextOptions: { reducedMotion: 'reduce' },
  viewport: { width: 1280, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});

test('開頁沒有錯誤；範例列、統計、頁尾、聲明、團報產生器連結', async ({ page }) => {
  const errors = await open(page);
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByTestId('sample-notice')).toContainText('4 筆範例');
  await expect(rows(page).first()).toHaveAttribute('data-sample', 'true');
  /* 範例不計入統計 */
  for (const id of ['stat-days', 'stat-scenarios', 'stat-coplayers'])
    await expect(stat(page, id)).toHaveAttribute('data-value', '0');
  await expect(stat(page, 'stat-hours')).toHaveAttribute('data-value', '0h');
  /* 開頁選取存檔順序的第一列 */
  await expect(table(page).locator('tr[aria-current="true"]')).toContainText('霧港燈塔');
  await expect(headerKeys(page)).resolves.toEqual([
    'reported',
    'date',
    'scenario',
    'system',
    'role',
    'gm',
    'players',
    'pc',
    'status',
    'time',
    'note',
    'report',
  ]);
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://kumachansteps.github.io/trpg-web-tools/',
  );
  await expect(page.getByTestId('disclaimer')).toContainText('非官方');
  await expect(page.getByTestId('report-link')).toHaveAttribute(
    'href',
    '../../tools/session-report/',
  );
  /* 清單不含範例 */
  await expect(page.getByRole('textbox', { name: '輸出結果' })).toHaveValue('');
  await page.getByRole('button', { name: '說明' }).click();
  await expect(page.getByRole('dialog', { name: '跑團紀錄簿：使用方式' })).toContainText('送出');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('新增、編輯、刪除；統計；雙擊編輯；範例列在對話框儲存後不再是範例', async ({ page }) => {
  const errors = await open(page);
  await addSession(page, {
    scenario: '霧港的燈塔',
    date: '2026-01-10',
    gm: '小林',
    players: '阿德、米可',
    pc: '甲 / 乙',
    time: '3:30',
  });
  const r = rowByScenario(page, '霧港的燈塔');
  await expect(r).toHaveAttribute('aria-current', 'true');
  await expect(r).toContainText('2026-01-10');
  await expect(r).toContainText('CoC 6版');
  await expect(r).toContainText('3.5 小時');
  await expect(r).toContainText('新開');
  await expect(stat(page, 'stat-days')).toHaveAttribute('data-value', '1');
  await expect(stat(page, 'stat-hours')).toHaveAttribute('data-value', '3.5h');
  await expect(stat(page, 'stat-coplayers')).toHaveAttribute('data-value', '3');
  await expect(page.getByTestId('row-count')).toHaveText('共 5 團');

  /* 雙擊編輯：多一個日期、系統改成自行輸入、身分、狀態 */
  await r.locator('td[data-col="time"]').dblclick();
  const dlg = page.getByRole('dialog', { name: '編輯團資訊' });
  await dlg.getByRole('button', { name: '新增日期' }).click();
  await expect(dlg.getByLabel('日期 2', { exact: true })).toBeFocused();
  await dlg.getByLabel('日期 2', { exact: true }).fill('2026-01-03');
  await pick(page, dlg.getByRole('combobox', { name: '系統' }), '自行輸入');
  await dlg.getByRole('textbox', { name: '系統名稱' }).fill('謀殺之謎');
  await pick(page, dlg.getByRole('combobox', { name: '身分' }), 'KP');
  await pick(page, dlg.getByRole('combobox', { name: '狀態' }), '完結');
  await dlg.getByRole('textbox', { name: '劇本網址' }).fill('不是網址');
  await dlg.getByRole('button', { name: '儲存' }).click();
  await expect(dlg.getByText('請輸入完整的網址')).toBeVisible();
  await dlg.getByRole('textbox', { name: '劇本網址' }).fill('https://example.com/s');
  await dlg.getByRole('button', { name: '儲存' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(r).toContainText('2026-01-10 另 1 天');
  await expect(r).toContainText('謀殺之謎');
  await expect(r).toContainText('完結');
  const saved = (await storedRows(page)).find((x) => x.scenario === '霧港的燈塔');
  expect(saved).toMatchObject({
    dates: ['2026-01-03', '2026-01-10'],
    date: '2026-01-03',
    system: 'マダミス',
    role: 'KP',
    status: '完結',
    time: '3.5',
    scenarioUrl: 'https://example.com/s',
  });

  /* 範例列：在對話框儲存後不再是範例 */
  const sample = rows(page).filter({ hasText: '雨夜的郵差' });
  await expect(sample).toHaveAttribute('data-sample', 'true');
  await sample.locator('td[data-col="date"]').dblclick();
  await page
    .getByRole('dialog', { name: '編輯團資訊' })
    .getByRole('button', { name: '儲存' })
    .click();
  await expect(sample).not.toHaveAttribute('data-sample', 'true');
  await expect(page.getByTestId('sample-notice')).toContainText('3 筆範例');

  /* 刪除要確認，可以復原 */
  await r.locator('td[data-col="date"]').dblclick();
  await page
    .getByRole('dialog', { name: '編輯團資訊' })
    .getByRole('button', { name: '刪除', exact: true })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(rowByScenario(page, '霧港的燈塔')).toHaveCount(0);
  await page.getByRole('button', { name: '復原（Ctrl＋Z）' }).click();
  await expect(rowByScenario(page, '霧港的燈塔')).toHaveCount(1);
  expect(errors).toEqual([]);
});

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('詳細・感想側欄：即時存檔、日期與系統寫回正規值、貼文、防雷連結、刪除', async ({ page }) => {
  /* 測試環境連不到外部網站：圖片網址回一張 1×1 的 PNG */
  await page.route('https://example.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }),
  );
  const errors = await open(page);
  await deleteSamples(page);
  await addSession(page, { scenario: '雨夜', date: '2026-02-01' });
  await toolbarBtn(page, '詳細・感想').click();
  const sheet = page.getByRole('dialog', { name: '詳細・感想' });
  await expect(sheet).toHaveAttribute('data-placement', 'right');
  await expect(sheet).toContainText('目前選取：雨夜');

  await sheet.getByRole('textbox', { name: '日期（多個用「, 」分隔）' }).fill('2026/2/8, 2026/2/1');
  await sheet.getByRole('combobox', { name: '系統' }).fill('Emoklore');
  await sheet.getByRole('textbox', { name: '生還／撕卡' }).fill('撕卡');
  await sheet.getByRole('textbox', { name: '長篇感想' }).fill('很好玩\n第二行');
  await sheet.getByRole('textbox', { name: '時間（小時）' }).fill('2時30分');

  /* 貼文：不是 http(s) 時提示；X 貼文顯示成連結；圖片直接顯示 */
  const mediaUrl = sheet.getByRole('textbox', { name: '貼文或圖片的網址' });
  await mediaUrl.fill('ftp://example.com/a');
  await sheet.getByRole('button', { name: '新增', exact: true }).click();
  await expect(sheet.getByText('請輸入 http:// 或 https:// 開頭的網址。')).toBeVisible();
  await mediaUrl.fill('https://x.com/someone/status/12345');
  await mediaUrl.press('Enter');
  await mediaUrl.fill('https://example.com/pic.png');
  await mediaUrl.press('Enter');
  const media = sheet.getByTestId('media-list').locator('li');
  await expect(media).toHaveCount(2);
  await expect(media.nth(0)).toHaveAttribute('data-media-type', 'tweet');
  await expect(media.nth(0).getByRole('link', { name: 'X 貼文' })).toHaveAttribute(
    'href',
    'https://x.com/someone/status/12345',
  );
  await expect(media.nth(1).locator('img')).toHaveAttribute('src', 'https://example.com/pic.png');
  await sheet.getByRole('textbox', { name: '說明 2' }).fill('角色圖');

  /* 防雷連結：只有 http(s) 才有開啟連結 */
  await sheet.getByRole('button', { name: '新增連結' }).click();
  await sheet.getByRole('textbox', { name: '連結 1 的網址' }).fill('javascript:alert(1)');
  await expect(sheet.getByRole('link', { name: '開啟連結 1' })).toHaveCount(0);
  await sheet.getByRole('textbox', { name: '連結 1 的網址' }).fill('https://example.com/spoiler');
  await sheet.getByRole('textbox', { name: '連結 1 的標籤' }).fill('心得');
  await expect(sheet.getByRole('link', { name: '開啟連結 1' })).toHaveAttribute(
    'href',
    'https://example.com/spoiler',
  );

  /* 自動存檔（不必按儲存）：打字停頓約 300 ms 內寫回（主控 7.1） */
  const r = rowByScenario(page, '雨夜');
  await expect
    .poll(async () => (await storedRows(page)).find((x) => x.scenario === '雨夜'), {
      timeout: 1000,
      intervals: [100],
    })
    .toMatchObject({
      dates: ['2026-02-01', '2026-02-08'],
      system: 'エモクロア',
      survival: 'ロスト',
      longNote: '很好玩\n第二行',
      time: '2.5',
      media: [
        { type: 'tweet', url: 'https://x.com/someone/status/12345', caption: '' },
        { type: 'image', url: 'https://example.com/pic.png', caption: '角色圖' },
      ],
      cushionLinks: [{ label: '心得', url: 'https://example.com/spoiler' }],
    });

  /* 打字時先放在草稿；停頓後寫回，一段連續打字算一步復原 */
  const note = sheet.getByRole('textbox', { name: '備註（表格顯示）' });
  await note.click();
  await page.keyboard.type('第一段', { delay: 40 });
  await expect
    .poll(async () => (await storedRows(page)).find((x) => x.scenario === '雨夜')?.note, {
      timeout: 1000,
      intervals: [50],
    })
    .toBe('第一段');
  await page.keyboard.type('第二段', { delay: 40 });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  /* 關閉側欄時寫回；表格的備註欄同一個值 */
  expect((await storedRows(page)).find((x) => x.scenario === '雨夜')?.note).toBe('第一段第二段');
  await expect(r.locator('td[data-col="note"]')).toHaveText('第一段第二段');
  const undo = page.getByRole('button', { name: '復原（Ctrl＋Z）' });
  const redo = page.getByRole('button', { name: /^重做/ });
  await undo.click();
  await expect(r.locator('td[data-col="note"]')).toHaveText('第一段');
  await undo.click();
  await expect(r.locator('td[data-col="note"]')).toHaveText('');
  await redo.click();
  await redo.click();
  await expect(r.locator('td[data-col="note"]')).toHaveText('第一段第二段');
  await toolbarBtn(page, '詳細・感想').click();
  await expect(sheet.getByRole('textbox', { name: '備註（表格顯示）' })).toHaveValue(
    '第一段第二段',
  );
  await sheet.getByRole('button', { name: '儲存' }).click();
  await expect(page.getByText('已儲存', { exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  /* 表格反映側欄的修改（側欄開著時表格在對話框後面，無障礙樹裡看不到） */
  await expect(r).toContainText('2026-02-08 另 1 天');
  await expect(r).toContainText('Emoklore');

  /* 劇本欄的按鈕開啟同一個側欄；刪除這一團要確認 */
  await r.getByRole('button', { name: '開啟「雨夜」的詳細・感想' }).click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: '刪除這一團' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
  await toolbarBtn(page, '詳細・感想').click();
  await expect(sheet).toContainText('目前沒有選取的團');
  expect(errors).toEqual([]);
});

test('欄位：新增可選欄位與自訂欄位、移除、重設、拖曳與鍵盤排序、欄寬', async ({ page }) => {
  const errors = await open(page);
  const tools = logRegion(page);
  await tools.getByRole('button', { name: '新增欄位' }).click();
  const addPanel = page.getByTestId('add-column-panel');
  await addPanel.getByRole('button', { name: '加入「最愛」' }).click();
  await expect(addPanel.getByRole('button', { name: '最愛（已在表格）' })).toBeDisabled();
  await addPanel.getByRole('button', { name: '建立自訂欄位' }).click();
  const custom = page.getByRole('dialog', { name: '建立自訂欄位' });
  await custom.getByRole('textbox', { name: '欄位名稱' }).fill('骰子');
  await custom.getByRole('textbox', { name: '欄位名稱' }).press('Enter');
  const keys = await headerKeys(page);
  expect(keys.slice(-3, -1)).toEqual(['fav', expect.stringMatching(/^custom_\d+$/)]);
  await expect(table(page).locator('thead')).toContainText('骰子');
  await page.keyboard.press('Escape');
  await expect(addPanel).toHaveCount(0);

  /* 移除欄位（資料保留） */
  await tools.getByRole('button', { name: '移除欄位' }).click();
  const removePanel = page.getByTestId('remove-column-panel');
  await removePanel.getByRole('checkbox', { name: '備註' }).click();
  expect(await headerKeys(page)).not.toContain('note');
  await removePanel.getByRole('button', { name: '關閉' }).click();

  /* 鍵盤排序：把手 ←／→，焦點留在把手上 */
  const dateHandle = table(page).getByRole('button', { name: '移動「日期」欄（←／→）' });
  await dateHandle.focus();
  await dateHandle.press('ArrowRight');
  expect((await headerKeys(page)).slice(0, 3)).toEqual(['reported', 'scenario', 'date']);
  await expect(dateHandle).toBeFocused();
  await dateHandle.press('ArrowLeft');
  await dateHandle.press('ArrowLeft');
  expect((await headerKeys(page)).slice(0, 3)).toEqual(['reported', 'date', 'scenario']);

  /* 拖曳排序：放在 GM 欄的右半 → 插在 GM 後面 */
  const handle = table(page).getByRole('button', { name: '移動「劇本」欄（←／→）' });
  const hb = (await handle.boundingBox())!;
  const gb = (await table(page).locator('th[data-col="gm"]').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + gb.width * 0.5, gb.y + 10, { steps: 5 });
  await page.mouse.move(gb.x + gb.width * 0.8, gb.y + 10, { steps: 3 });
  await expect(table(page).locator('th[data-col="gm"]')).toHaveAttribute('data-drop', 'after');
  await page.mouse.up();
  const after = await headerKeys(page);
  expect(after.indexOf('scenario')).toBe(after.indexOf('gm') + 1);

  /*
   * 拖到固定在右側的「送出」標題上（表格還沒捲到最右，送出欄蓋住其他欄）：依看得到的送出欄判斷，
   * 左半、右半都放到送出欄前（照舊版），插入提示畫在送出欄上（F42）。
   */
  const scroller = table(page).locator('xpath=..');
  const report = table(page).locator('th[data-col="report"]');
  for (const [part, side] of [
    [0.1, 'before'],
    [0.9, 'after'],
  ] as const) {
    /* 日期欄放回左邊、表格捲回最左（送出欄蓋在其他欄上面） */
    await dateHandle.focus();
    while ((await headerKeys(page)).indexOf('date') > 1) await dateHandle.press('ArrowLeft');
    await scroller.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await expect(scroller).toHaveAttribute('data-at-end', 'false');
    const rb = (await report.boundingBox())!;
    const x = rb.x + rb.width * part;
    const covered = await page.evaluate(
      ([px, py]) =>
        document
          .elementsFromPoint(px, py)
          .filter((el) => el.tagName === 'TH')
          .map((el) => (el as HTMLElement).dataset.col),
      [x, rb.y + rb.height / 2],
    );
    expect(covered[0]).toBe('report');
    expect(covered.length).toBeGreaterThan(1);
    const db = (await table(page).locator('[data-col-handle="date"]').boundingBox())!;
    await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
    await page.mouse.down();
    await page.mouse.move(db.x + 30, db.y + 10, { steps: 2 });
    await page.mouse.move(x, rb.y + rb.height / 2, { steps: 6 });
    await expect(report).toHaveAttribute('data-drop', side);
    await expect(table(page).locator('th[data-drop]')).toHaveCount(1);
    expect(await report.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('inset');
    await page.mouse.up();
    expect((await headerKeys(page)).slice(-2)).toEqual(['date', 'report']);
    await expect(table(page).locator('th[data-drop]')).toHaveCount(0);
  }

  /* 欄寬：鍵盤 ←／→ 每次 10 px，夾在範圍內 */
  const sep = table(page).getByRole('separator', { name: '「劇本」欄的寬度（←／→ 調整）' });
  await sep.focus();
  await sep.press('ArrowRight');
  await sep.press('ArrowRight');
  await expect(sep).toHaveAttribute('aria-valuenow', '330');
  await sep.press('End');
  await expect(sep).toHaveAttribute('aria-valuenow', '520');
  /* 滑鼠往左拖過頭（超過欄位本身的寬度）：夾到最小值 180，不是預設寬度（F43） */
  const sb = (await sep.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 - 300, sb.y + sb.height / 2, { steps: 3 });
  await expect(sep).toHaveAttribute('aria-valuenow', '220');
  await page.mouse.move(Math.max(1, sb.x - 700), sb.y + sb.height / 2, { steps: 3 });
  await expect(sep).toHaveAttribute('aria-valuenow', '180');
  await page.mouse.up();
  await expect(sep).toHaveAttribute('aria-valuenow', '180');

  /* 重設欄位：回到預設，自訂欄位的定義保留 */
  await tools.getByRole('button', { name: '重設欄位' }).click();
  await expect(headerKeys(page)).resolves.toEqual([
    'reported',
    'date',
    'scenario',
    'system',
    'role',
    'gm',
    'players',
    'pc',
    'status',
    'time',
    'note',
    'report',
  ]);
  await tools.getByRole('button', { name: '新增欄位' }).click();
  await expect(
    page.getByTestId('add-column-panel').getByRole('button', { name: '加入「骰子」' }),
  ).toBeVisible();

  /* 重新整理後欄位設定還在 */
  await page.getByTestId('add-column-panel').getByRole('button', { name: '加入「骰子」' }).click();
  await page.reload();
  await expect(table(page).locator('thead')).toContainText('骰子');
  expect(errors).toEqual([]);
});

test('搜尋、系統與身分篩選、排序', async ({ page }) => {
  const errors = await open(page);
  const search = page.getByRole('searchbox', { name: '搜尋紀錄' });
  await search.fill('雨夜');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId('row-count')).toHaveText('顯示 1／4 團');
  await search.fill('謀殺之謎');
  await expect(rows(page)).toHaveCount(1);
  await search.fill('');
  await pick(page, page.getByRole('combobox', { name: '依系統篩選' }), 'Emoklore');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('星砂與回聲');
  await pick(page, page.getByRole('combobox', { name: '依系統篩選' }), '所有系統');
  await pick(page, page.getByRole('combobox', { name: '依身分篩選' }), 'GM・KP・SKP・DL');
  await expect(rows(page)).toHaveCount(2);
  await pick(page, page.getByRole('combobox', { name: '依身分篩選' }), '所有身分');
  const dates = () => rows(page).locator('td[data-col="date"]').allTextContents();
  expect(await dates()).toEqual(['2026-06-14', '2026-05-09 另 1 天', '2026-03-21', '2026-02-07']);
  await pick(page, page.getByRole('combobox', { name: '排序' }), '由舊到新');
  expect(await dates()).toEqual(['2026-02-07', '2026-03-21', '2026-05-09 另 1 天', '2026-06-14']);
  /* Ctrl＋Shift＋F 移到搜尋欄（在其他輸入框裡也可用） */
  await page.getByRole('searchbox', { name: '用名字篩選（選填）' }).focus();
  await page.keyboard.press('Control+Shift+F');
  await expect(search).toBeFocused();
  expect(errors).toEqual([]);
});

test('匯入試算表：自動對應、重複略過、亮起、解除篩選；範本 CSV', async ({ page }) => {
  const errors = await open(page);
  await deleteSamples(page);
  await addSession(page, { scenario: '霧港', date: '2026-01-10' });
  await page.getByRole('searchbox', { name: '搜尋紀錄' }).fill('只有霧港');
  await expect(rows(page)).toHaveCount(0);

  await page.keyboard.press('Control+j');
  const dlg = page.getByRole('dialog', { name: '匯入跑團紀錄' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('textbox', { name: '你的稱呼' }).fill('阿德');
  await dlg.getByRole('textbox', { name: '你的稱呼' }).blur();

  /* 範本 CSV：下載、解析 */
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dlg.getByRole('button', { name: '下載範本 CSV' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('跑團紀錄簿-匯入範本.csv');
  const csv = readFileSync((await dl.path())!, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.slice(1).split('\r\n')[0]).toBe(
    '日期,劇本名稱,系統,身分,GM,PL,PC,狀態,遊玩時間,備註,長團,主題標籤,結局,生還,跑團紀錄網址,劇本網址,感想網址',
  );

  const tsv = [
    '日期\t劇本名稱\t系統\tGM\tPL\t結局',
    '2026-01-10\t霧港 第2陣\tCoC7\t小林\t阿德\t',
    '2026/2/1, 2026/2/8\t雨夜\tエモクロアTRPG\t小林\t米可、阿德\tEND B',
    'Dec 1, 2025\t星砂\t謀殺之謎\t阿德\t\t',
  ].join('\n');
  await dlg.getByRole('textbox', { name: '貼上表格' }).fill(tsv);
  await expect(dlg.getByTestId('sheet-msg')).toContainText('認得第一列的標題，共 3 列');
  const grid = dlg.getByRole('table', { name: '要匯入的表格' });
  await expect(grid.locator('tbody tr')).toHaveCount(3);
  await expect(grid.locator('tbody tr').first()).toHaveAttribute('data-dup', 'true');
  await expect(dlg.getByTestId('sheet-count')).toHaveText('預覽 匯入 2 筆／重複 1 筆');
  /* 儲存格可以改；對應選單 */
  await grid.getByRole('textbox', { name: '第 3 列第 2 欄' }).fill('星砂與回聲');
  await expect(grid.getByRole('combobox', { name: '第 6 欄「結局」對應的欄位' })).toHaveText(
    '結局',
  );
  await dlg.getByRole('button', { name: '匯入', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByText('已匯入 2 筆').first()).toBeVisible();
  /* 被搜尋藏起來 → 搜尋清掉；匯入的列亮起、結局欄自動加入、選取第一筆 */
  await expect(page.getByRole('searchbox', { name: '搜尋紀錄' })).toHaveValue('');
  await expect(rows(page)).toHaveCount(3);
  await expect(table(page).locator('tbody tr[data-flash]').first()).toBeAttached();
  await expect(rows(page).filter({ hasText: '雨夜' })).toHaveAttribute('data-flash', 'true');
  await expect(table(page).locator('tr[aria-current="true"]')).toContainText('雨夜');
  expect(await headerKeys(page)).toContain('ending');
  await expect(rows(page).filter({ hasText: '雨夜' })).not.toHaveAttribute('data-flash', 'true', {
    timeout: 5000,
  });
  const saved = await storedRows(page);
  expect(saved.find((r) => r.scenario === '雨夜')).toMatchObject({
    dates: ['2026-02-01', '2026-02-08'],
    system: 'エモクロア',
    role: 'PL',
    ending: 'END B',
    status: '新規',
  });
  expect(saved.find((r) => r.scenario === '星砂與回聲')).toMatchObject({
    dates: ['2025-12-01'],
    system: 'マダミス',
    role: 'KP',
  });
  /* 自己的名字算進統計（同團玩家排除阿德） */
  await expect(stat(page, 'stat-coplayers')).toHaveAttribute('data-value', '2');
  expect(errors).toEqual([]);
});

test('匯入團報文字（預覽）、CCFOLIA 多份紀錄、JSON 覆寫；匯出 JSON', async ({ page }) => {
  const errors = await open(page);
  await toolbarBtn(page, '匯入').click();
  const dlg = page.getByRole('dialog', { name: '匯入跑團紀錄' });
  await dlg.getByRole('tab', { name: '團報文字' }).click();
  await dlg
    .getByRole('textbox', { name: '貼上團報' })
    .fill(
      '新克蘇魯神話TRPG\n「海邊的旅館」\nKP：小林\nPC/PL\n溫書亭 / 阿德\nEND A 生還\n2025/11/8\n\n\nエモクロアTRPG\n『星砂』\nDL：ゆき\n2026.3.21\n#星砂團報',
    );
  await expect(dlg.getByTestId('text-msg')).toContainText('認出 2 篇');
  await expect(dlg.getByTestId('preview-table').locator('tbody tr')).toHaveCount(2);
  await expect(dlg.getByTestId('preview-count')).toHaveText('預覽 匯入 2 筆');
  await dlg.getByRole('button', { name: '匯入', exact: true }).click();
  await expect(rowByScenario(page, '海邊的旅館')).toContainText('CoC 7版');
  /* 自動加入的欄位依資料中第一次出現的順序（第一篇的結局、生還，第二篇的主題標籤；照舊版） */
  expect((await headerKeys(page)).slice(-4)).toEqual(['ending', 'survival', 'hashtag', 'report']);

  /* 重開匯入對話框：分頁與貼上的內容重設，匯入方式與「略過重複」保留上次的選擇（F70） */
  await toolbarBtn(page, '匯入').click();
  await expect(dlg.getByRole('tab', { name: '試算表' })).toHaveAttribute('aria-selected', 'true');
  await dlg.getByRole('radio', { name: '覆寫（清除所有既有資料）' }).click();
  await dlg.getByRole('checkbox', { name: '略過重複' }).click();
  await dlg.getByRole('textbox', { name: '貼上表格' }).fill('日期\t劇本名稱\n2026-01-01\t暫時');
  await dlg.getByRole('button', { name: '取消' }).click();
  await expect(dlg).toHaveCount(0);
  await toolbarBtn(page, '匯入').click();
  await expect(dlg.getByRole('radio', { name: '覆寫（清除所有既有資料）' })).toBeChecked();
  await expect(dlg.getByRole('checkbox', { name: '略過重複' })).not.toBeChecked();
  await expect(dlg.getByRole('textbox', { name: '貼上表格' })).toHaveValue('');
  await dlg.getByRole('radio', { name: '加在後面' }).click();
  await dlg.getByRole('checkbox', { name: '略過重複' }).click();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  /* CCFOLIA：兩份聊天紀錄 → 兩列，切到試算表分頁 */
  await toolbarBtn(page, '匯入').click();
  await dlg.getByRole('tab', { name: 'CCFOLIA・紀錄' }).click();
  const log = (lines: string[]) =>
    `<!DOCTYPE html><html><head><title>ccfolia - logs</title></head><body>${lines
      .map((l) => {
        const [who, text] = l.split('|');
        return `<p><span> [main]</span><span>${who}</span> : <span>${text}</span></p>`;
      })
      .join('')}</body></html>`;
  await dlg.locator('input[type=file]').setInputFiles([
    {
      name: '鐘樓 第1回.html',
      mimeType: 'text/html',
      buffer: Buffer.from(log(['小林|開始', '小林|CCB<=50', '阿德|CCB<=60'])),
    },
    {
      name: '鐘樓 第2回.html',
      mimeType: 'text/html',
      buffer: Buffer.from(log(['阿德|CC<=50', '阿德|CC<=60'])),
    },
  ]);
  await expect(dlg.getByRole('tab', { name: '試算表' })).toHaveAttribute('aria-selected', 'true');
  await expect(dlg.getByTestId('sheet-msg')).toContainText('找到 2 份紀錄');
  const grid = dlg.getByRole('table', { name: '要匯入的表格' });
  await expect(grid.locator('tbody tr')).toHaveCount(2);
  await expect(grid.getByRole('textbox', { name: '第 1 列第 2 欄' })).toHaveValue('鐘樓');
  await expect(grid.getByRole('textbox', { name: '第 2 列第 3 欄' })).toHaveValue('CoC 7版');
  await dlg.getByRole('button', { name: '取消' }).click();

  /* 匯出 JSON（Ctrl＋E）：解析下載的檔案 */
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+e')]);
  expect(dl.suggestedFilename()).toMatch(/^跑團紀錄簿-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
  expect(json.format).toBe('trpg-toolkit-session-log');
  expect(json.rows).toHaveLength(6);
  expect(json.rows.find((r: { scenario: string }) => r.scenario === '星砂')).toMatchObject({
    system: 'エモクロア',
    gm: 'ゆき',
    dates: ['2026-03-21'],
  });
  expect(json.columns[0]).toMatchObject({ key: 'reported', label: '團報' });

  /* JSON 覆寫：只剩檔案裡的 2 筆（取兩筆的檔案） */
  const two = { ...json, rows: json.rows.slice(4) };
  await toolbarBtn(page, '匯入').click();
  await dlg.getByRole('tab', { name: 'JSON' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    dlg.getByRole('button', { name: '選擇 JSON 檔' }).click(),
  ]);
  await chooser.setFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(two)),
  });
  await expect(dlg.getByTestId('json-msg')).toHaveText('backup.json（2 列）');
  await dlg.getByRole('radio', { name: '覆寫（清除所有既有資料）' }).click();
  await dlg.getByRole('button', { name: '匯入', exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId('sample-notice')).toHaveCount(0);

  /* 讀不懂的 JSON */
  await toolbarBtn(page, '匯入').click();
  await dlg.getByRole('tab', { name: 'JSON' }).click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    dlg.getByRole('button', { name: '選擇 JSON 檔' }).click(),
  ]);
  await chooser2.setFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[]'),
  });
  await expect(dlg.getByTestId('json-msg')).toContainText('讀不到紀錄');
  await expect(dlg.getByRole('button', { name: '匯入', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('已通關劇本清單：四種輸出、名字篩選、複製', async ({ page }) => {
  const errors = await open(page);
  await deleteSamples(page);
  await addSession(page, {
    scenario: '霧港',
    date: '2026-01-10',
    players: '阿德、米可',
    gm: '小林',
  });
  await addSession(page, { scenario: '霧港 第2陣', date: '2026-02-08', players: '阿德' });
  await addSession(page, { scenario: '雨夜', date: '2026-01-20', players: '小雨' });
  const out = page.getByRole('textbox', { name: '輸出結果' });
  await expect(out).toHaveValue(
    '【全部劇本】共 2 部（3 團）\n\n1. 霧港（×2）　2026-01-10\n2. 雨夜　2026-01-20',
  );
  await page.getByRole('radio', { name: '依系統' }).click();
  await expect(out).toHaveValue('【CoC 6版】共 2 部\n　1PL\n　　1. 雨夜\n　2PL\n　　1. 霧港');
  await page.getByRole('radio', { name: '依 PL／KP' }).click();
  await expect(out).toHaveValue(
    '■ 以 PL 身分通關（2 部）\n【CoC 6版】\n　1PL\n　　1. 雨夜\n　2PL\n　　1. 霧港',
  );
  await page.getByRole('radio', { name: '場次明細' }).click();
  await expect(out).toHaveValue(
    [
      '【場次一覽】3 團',
      '',
      '1. 2026-01-10　CoC 6版　PL　霧港',
      '　KP/GM: 小林 ／ PL: 阿德、米可',
      '2. 2026-01-20　CoC 6版　PL　雨夜',
      '　PL: 小雨',
      '3. 2026-02-08　CoC 6版　PL　霧港 第2陣',
      '　PL: 阿德',
    ].join('\n'),
  );
  await page.getByRole('searchbox', { name: '用名字篩選（選填）' }).fill('阿德');
  await expect(page.getByTestId('export-hint')).toHaveText('符合「阿德」：2 團／1 部劇本');
  await page
    .getByRole('region', { name: '已通關劇本清單' })
    .getByRole('button', { name: '清除' })
    .click();
  await expect(page.getByRole('searchbox', { name: '用名字篩選（選填）' })).toBeFocused();
  await expect(page.getByTestId('export-hint')).toHaveText('');
  await page
    .getByRole('region', { name: '已通關劇本清單' })
    .getByRole('button', { name: '複製' })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await out.inputValue());
  /* 匯出文字：捲到輸出欄 */
  await page.evaluate(() => window.scrollTo(0, 0));
  await toolbarBtn(page, '匯出文字').click();
  await expect(out).toBeInViewport();
  expect(errors).toEqual([]);
});

test('送到團報產生器：確認、交接資料、開新分頁；團報勾選', async ({ page, context }) => {
  const errors = await open(page);
  const r = rows(page).filter({ hasText: '雨夜的郵差' });
  await r.getByRole('checkbox', { name: '「（範例）雨夜的郵差」已發團報' }).click();
  /* 勾選不會選取這一列 */
  await expect(r).not.toHaveAttribute('aria-current', 'true');
  expect((await storedRows(page)).find((x) => x.scenario === '（範例）雨夜的郵差')?.reported).toBe(
    true,
  );
  await r.getByRole('button', { name: '把「（範例）雨夜的郵差」送到團報產生器' }).click();
  const confirm = page.getByRole('alertdialog', { name: '送到團報產生器' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByTestId('send-overwrite')).toHaveCount(0);
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    confirm.getByRole('button', { name: '送出並開啟' }).click(),
  ]);
  expect(popup.url()).toContain('/tools/session-report/');
  await popup.close();
  const payload = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? 'null'),
    PENDING_KEY,
  );
  expect(payload).toMatchObject({ source: 'session-log-tracker', version: '1.0' });
  expect(payload.items[0]).toMatchObject({
    reported: true,
    scenario: '（範例）雨夜的郵差',
    system: 'CoC 7版',
    dates: ['2026-05-02', '2026-05-09'],
    latestDate: '2026-05-09',
    sessionCount: 2,
    gm: '自己',
    status: 'completed',
  });
  expect(payload.items[0].players).toHaveLength(3);
  /* 還有沒被讀取的資料時提醒會覆寫；取消就不做事 */
  await r.getByRole('button', { name: '把「（範例）雨夜的郵差」送到團報產生器' }).click();
  await expect(confirm.getByTestId('send-overwrite')).toBeVisible();
  await confirm.getByRole('button', { name: '取消' }).click();
  await expect(confirm).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('編輯對話框：身分、狀態、生還不在選單裡時，儲存選單顯示的值（F48）', async ({ page }) => {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const base = { system: 'CoC 7版', time: '', gm: '', players: '', pc: '', note: '' };
    const rows = [
      { ...base, id: 'blank', dates: ['2024-01-01'], date: '2024-01-01', scenario: '空白身分' },
      {
        ...base,
        id: 'odd',
        dates: ['2024-01-02'],
        date: '2024-01-02',
        scenario: '怪值',
        role: 'pl',
        status: 'ended',
        survival: 'lost',
      },
      {
        ...base,
        id: 'ok',
        dates: ['2024-01-03'],
        date: '2024-01-03',
        scenario: '正常',
        role: 'KP',
        status: '中止',
        survival: 'ロスト',
      },
    ];
    localStorage.setItem(
      key,
      JSON.stringify({
        state: { data: { rows, columns: [], hiddenColumns: [], customColumns: [] } },
        version: 1,
      }),
    );
  }, STORE_KEY);
  const errors = await open(page);
  const dlg = page.getByRole('dialog', { name: '編輯團資訊' });
  for (const [id, expected] of [
    ['blank', { role: 'PL', status: '新規', survival: '' }],
    ['odd', { role: 'PL', status: '新規', survival: '' }],
    ['ok', { role: 'KP', status: '中止', survival: 'ロスト' }],
  ] as const) {
    await table(page).locator(`tr[data-row-id="${id}"] td[data-col="role"]`).dblclick();
    await expect(dlg).toBeVisible();
    const shown = id === 'ok' ? ['KP', '中止', '撕卡'] : ['PL', '新開', '未設定'];
    await expect(dlg.getByRole('combobox', { name: '身分' })).toHaveText(shown[0]);
    await expect(dlg.getByRole('combobox', { name: '狀態' })).toHaveText(shown[1]);
    await expect(dlg.getByRole('combobox', { name: '生還／撕卡' })).toHaveText(shown[2]);
    await dlg.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(dlg).toHaveCount(0);
    expect((await storedRows(page)).find((r) => r.id === id)).toMatchObject(expected);
    await expect(table(page).locator(`tr[data-row-id="${id}"] td[data-col="role"]`)).toHaveText(
      expected.role,
    );
  }
  expect(errors).toEqual([]);
});

test('SKP（副 KP，P11 新增 F115）：對話框與側欄的身分選單、表格標籤、身分篩選', async ({
  page,
}) => {
  const errors = await open(page);
  await deleteSamples(page);
  await toolbarBtn(page, '新增團').click();
  const dlg = page.getByRole('dialog', { name: '新增團' });
  await dlg.getByRole('textbox', { name: '劇本', exact: true }).fill('燈塔');
  await dlg.getByRole('combobox', { name: '身分' }).click();
  await expect(page.getByRole('option')).toHaveText(['PL', 'KP', 'SKP', 'GM', 'DL']);
  await page.getByRole('option', { name: 'SKP', exact: true }).click();
  await dlg.getByRole('button', { name: '儲存' }).click();
  await expect(dlg).toHaveCount(0);
  expect((await storedRows(page)).find((r) => r.scenario === '燈塔')).toMatchObject({
    role: 'SKP',
  });
  const cell = rowByScenario(page, '燈塔').locator('td[data-col="role"]');
  await expect(cell).toHaveText('SKP');
  /* 標籤顏色同 GM 組（與 KP 的列相同） */
  await addSession(page, { scenario: '雨夜' });
  await rowByScenario(page, '雨夜').locator('td[data-col="role"]').dblclick();
  const edit = page.getByRole('dialog', { name: '編輯團資訊' });
  await pick(page, edit.getByRole('combobox', { name: '身分' }), 'KP');
  await edit.getByRole('button', { name: '儲存', exact: true }).click();
  const pillClass = (name: string) =>
    rowByScenario(page, name).locator('td[data-col="role"] span').first().getAttribute('class');
  expect(await pillClass('燈塔')).toBe(await pillClass('雨夜'));
  /* 身分篩選：GM 組含 SKP；PL 不含 */
  await pick(page, page.getByRole('combobox', { name: '依身分篩選' }), 'GM・KP・SKP・DL');
  await expect(rows(page)).toHaveCount(2);
  await pick(page, page.getByRole('combobox', { name: '依身分篩選' }), 'PL');
  await expect(rows(page)).toHaveCount(0);
  await pick(page, page.getByRole('combobox', { name: '依身分篩選' }), '所有身分');
  /* 側欄的身分選單也有 SKP */
  await rowByScenario(page, '燈塔').click();
  await toolbarBtn(page, '詳細・感想').click();
  const sheet = page.getByRole('dialog', { name: '詳細・感想' });
  await expect(sheet.getByRole('combobox', { name: '身分' })).toHaveText('SKP');
  expect(errors).toEqual([]);
});

test('快捷鍵：Alt＋N 新增、Ctrl＋J 匯入、Esc 關閉面板', async ({ page }) => {
  const errors = await open(page);
  await page.keyboard.press('Alt+n');
  await expect(page.getByRole('dialog', { name: '新增團' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '新增團' })).toHaveCount(0);
  await logRegion(page).getByRole('button', { name: '新增欄位' }).click();
  await expect(page.getByTestId('add-column-panel')).toBeVisible();
  await page.getByRole('searchbox', { name: '搜尋紀錄' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-column-panel')).toHaveCount(0);
  /* 浮動的新增鈕：工具列的新增鈕捲出畫面時才出現 */
  await expect(page.getByTestId('fab-add')).toHaveCount(0);
  await page.getByRole('region', { name: '已通關劇本清單' }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByTestId('fab-add').click();
  await expect(page.getByRole('dialog', { name: '新增團' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  await table(page).getByTestId('add-row').click();
  await expect(page.getByRole('dialog', { name: '新增團' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '快捷鍵（?）' }).click();
  const help = page.getByRole('dialog', { name: /快捷鍵/ });
  await expect(help).toContainText('新增一團');
  await expect(help).toContainText('開啟匯入');
  expect(errors).toEqual([]);
});

test('自動存檔、舊版存檔的搬移、損壞的存檔', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'sessionLogTool.state.v1',
      JSON.stringify({
        rows: [
          {
            id: 'old1',
            date: '2025-03-01',
            scenario: '舊版的團',
            system: 'エモクロアTRPG',
            role: 'kp',
            time: '3h',
          },
        ],
        columns: [
          { key: 'reported', width: 78, locked: true },
          { key: 'date', width: 136 },
          { key: 'scenario', width: 310 },
          { key: 'custom_1', label: '地點', width: 150, custom: true },
          { key: 'report', width: 116, locked: true },
        ],
        customColumns: [{ key: 'custom_1', label: '地點', custom: true }],
        migrations: {
          hashtagOptional: true,
          v14ColumnWidths: true,
          reportedColumn: true,
          timeUnitStripped: true,
        },
      }),
    );
    localStorage.setItem('sessionLogTool.selfNames.v1', '阿德');
  });
  const errors = await open(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('舊版的團');
  /* 搬入時整理：舊系統名、GM 組的身分、時間單位 */
  expect(
    (await page.evaluate(() => localStorage.getItem('trpg-toolkit:session-log'))) ?? null,
  ).toBeNull();
  await page.getByRole('searchbox', { name: '搜尋紀錄' }).fill('Emoklore');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('searchbox', { name: '搜尋紀錄' }).fill('');
  await expect(headerKeys(page)).resolves.toEqual([
    'reported',
    'date',
    'scenario',
    'custom_1',
    'report',
  ]);
  await expect(table(page).locator('thead')).toContainText('地點');
  await toolbarBtn(page, '匯入').click();
  await expect(page.getByRole('textbox', { name: '你的稱呼' })).toHaveValue('阿德');
  await page.keyboard.press('Escape');

  await addSession(page, { scenario: '新的團', date: '2026-01-01' });
  await page.reload();
  await expect(rows(page)).toHaveCount(2);
  const stored = await storedRows(page);
  expect(stored.map((r) => r.scenario)).toEqual(['舊版的團', '新的團']);
  expect(stored[0]).toMatchObject({
    system: 'エモクロア',
    role: 'GM',
    time: '3',
    dates: ['2025-03-01'],
  });
  /* 舊版的存檔保留不刪 */
  expect(await page.evaluate(() => localStorage.getItem('sessionLogTool.state.v1'))).not.toBeNull();

  /* 損壞的存檔：當作第一次開啟（範例列） */
  await page.evaluate((k) => {
    localStorage.setItem(k, '{"state":{"data":{"rows":"broken"}},"version":1}');
    localStorage.removeItem('sessionLogTool.state.v1');
  }, STORE_KEY);
  await page.reload();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByTestId('sample-notice')).toBeVisible();
  expect(errors).toEqual([]);
});

test('長清單：只畫捲動範圍內的列；捲動、搜尋、匯入後捲到匯入的列', async ({ page }) => {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const day = (i: number) => new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    const rows = Array.from({ length: 400 }, (_, i) => ({
      id: `s${i}`,
      date: day(i),
      dates: [day(i)],
      scenario: `長清單劇本${String(i).padStart(3, '0')}`,
      system: 'CoC 6版',
      role: 'PL',
      gm: '小林',
      players: '阿德',
      status: '完結',
      time: '3',
    }));
    localStorage.setItem(
      key,
      JSON.stringify({
        state: { data: { rows, columns: [], hiddenColumns: [], customColumns: [] } },
        version: 1,
      }),
    );
  }, STORE_KEY);
  const errors = await open(page);
  await expect(page.getByTestId('row-count')).toHaveText('共 400 團');
  await expect(stat(page, 'stat-days')).toHaveAttribute('data-value', '400');
  const n = await rows(page).count();
  expect(n).toBeGreaterThan(10);
  expect(n).toBeLessThan(100);
  await expect(rows(page).first()).toContainText('長清單劇本399');
  /* 捲到表格最底：最舊的一團畫出來 */
  await table(page).evaluate((t) => {
    const s = t.parentElement as HTMLElement;
    s.scrollTop = s.scrollHeight;
  });
  await expect(rowByScenario(page, '長清單劇本000')).toBeVisible();
  expect(await rows(page).count()).toBeLessThan(100);
  /* 搜尋後列數少於門檻：全部畫出來 */
  await page.getByRole('searchbox', { name: '搜尋紀錄' }).fill('長清單劇本12');
  await expect(rows(page)).toHaveCount(10);
  await page.getByRole('searchbox', { name: '搜尋紀錄' }).fill('');
  await table(page).evaluate((t) => {
    (t.parentElement as HTMLElement).scrollTop = 0;
  });
  /* 匯入一團很舊的：捲到那一列並亮起 */
  await toolbarBtn(page, '匯入').click();
  const dlg = page.getByRole('dialog', { name: '匯入跑團紀錄' });
  await dlg.getByRole('textbox', { name: '貼上表格' }).fill('日期\t劇本名稱\n2019-06-01\t最舊的團');
  await expect(dlg.getByTestId('sheet-count')).toHaveText('預覽 匯入 1 筆');
  await dlg.getByRole('button', { name: '匯入', exact: true }).click();
  const oldest = rowByScenario(page, '最舊的團');
  await expect(oldest).toBeInViewport();
  await expect(oldest).toHaveAttribute('data-flash', 'true');
  await expect(oldest).toHaveAttribute('aria-current', 'true');
  expect(errors).toEqual([]);
});

test.describe('視覺回歸', () => {
  async function prepare(page: Page) {
    const errors = await open(page);
    await expect(stat(page, 'stat-days')).toHaveText('0');
    await page.mouse.move(0, 0);
    return errors;
  }

  test('1280 寬', async ({ page }) => {
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('session-log-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await toolbarBtn(page, '詳細・感想').click();
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await toolbarBtn(page, '匯入').click();
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await expect(page).toHaveScreenshot('session-log-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
