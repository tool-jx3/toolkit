/**
 * 團報產生器（建置產物 next/session-report/）的端對端測試：
 * - 開頁沒有 pageerror／console error；預設的團報（範例值、今天的日期）、字數；頁尾只放靈感來源、非官方聲明；說明與快捷鍵一覽。
 * - 輸入即時反映：系統（自行輸入、Emoklore → DL）、作者行、結果、敬稱、主持人與參加者的增刪（刪光也能新增）、標記、名字順序、
 *   日期、主題標籤；備註不寫進團報。
 * - 範本與文字樣式：選單、快速切換列（記一步復原）、Ctrl＋Alt＋方向鍵循環（文字欄、選單上也有效）。
 * - 預覽：直接編輯（改輸入時保留）、重新產生（按鈕與 Ctrl＋Alt＋R）、清除預覽、文字裝飾插入、復原／重做（按鈕與快捷鍵）、字數超過上限。
 * - 輸出：複製（剪貼簿的內容原封不動；Ctrl＋Enter、Ctrl＋Shift＋C）、貼到 X（攔截開啟的網址並解析 text 參數；
 *   Ctrl＋Shift＋P、Ctrl＋Shift＋Enter；空白時不開）、Ctrl＋E。
 * - 跑團紀錄簿的交接資料：讀入、稍後、捨棄、損壞。
 * - 自動存檔、清除輸入。
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { toUnicodeStyle, xPostLength } from '../../src/core/social';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('session-report') ?? { id: 'session-report', status: 'next' })}/`;
const STORE_KEY = 'trpg-toolkit:session-report';
const PENDING_KEY = 'trpgWebTools.sessionReportGenerator.pendingImport';
/** 固定的「今天」（Asia/Taipei） */
const NOW = new Date('2026-10-03T10:00:00+08:00');
const TODAY = '2026/10/3';

async function open(page: Page, { goto = true } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.clock.setFixedTime(NOW);
  if (goto) await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: '團報產生器' })).toBeVisible();
  return errors;
}

const preview = (page: Page) => page.getByRole('textbox', { name: '團報內容' });
const text = (page: Page) => preview(page).inputValue();
const box = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const combo = (page: Page, name: string) => page.getByRole('combobox', { name, exact: true });
const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name });
const styleBar = (page: Page) => page.getByRole('group', { name: '文字樣式快速切換' });
const count = (page: Page) => page.getByTestId('post-count');

async function pick(page: Page, c: Locator, option: string | RegExp) {
  await c.click();
  await page
    .getByRole(
      'option',
      typeof option === 'string' ? { name: option, exact: true } : { name: option },
    )
    .click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** 文字樣式換成「不轉換」（用快速切換列），方便比對文字 */
async function plain(page: Page) {
  await styleBar(page).getByRole('button', { name: '不轉換' }).click();
  await expect(styleBar(page).getByRole('button', { name: '不轉換' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 攔截 window.open（貼到 X）：記下網址與參數，不真的開分頁 */
async function stubOpen(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[][] };
    w.__opened = [];
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      w.__opened.push([String(url), String(target), String(features)]);
      return null;
    }) as typeof window.open;
  });
}
const opened = (page: Page) =>
  page.evaluate(() => (window as unknown as { __opened: string[][] }).__opened);

const sel = (page: Page) =>
  preview(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);

const SANS_BI = (s: string) => toUnicodeStyle(s, 'sansBoldItalic');

test('開頁沒有錯誤；預設的團報、字數；頁尾、聲明；說明與快捷鍵一覽', async ({ page }) => {
  const errors = await open(page);
  const expected = [
    SANS_BI('Call of Cthulhu'),
    '《劇本標題》',
    '',
    `${SANS_BI('KP')}｜主持人名字`,
    '',
    SANS_BI('PC/PL'),
    `${SANS_BI('HO1')}｜角色A ／ 玩家A`,
    '',
    `${SANS_BI('END')} 全員生還`,
    '',
    SANS_BI(TODAY),
  ].join('\n');
  await expect(preview(page)).toHaveValue(expected);
  await expect(count(page)).toContainText(`${xPostLength(expected)} / 280`);
  await expect(page.getByTestId('post-limit')).toHaveText('在上限內');
  /* 預設值 */
  await expect(combo(page, '團報範本')).toContainText('1. 標準');
  await expect(combo(page, '文字樣式')).toContainText('粗斜體（無襯線）');
  await expect(combo(page, '系統')).toContainText('Call of Cthulhu');
  await expect(page.getByRole('radio', { name: '不加' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'PC → PL' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(combo(page, '主持人 1 的身分')).toContainText('KP');
  await expect(combo(page, '參加者 1 的標記')).toContainText('HO1');
  await expect(box(page, '日期')).toHaveAttribute('placeholder', TODAY);
  await expect(styleBar(page).getByRole('button')).toHaveCount(10);
  await expect(styleBar(page).getByRole('button', { name: '粗斜體（無襯線）' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  /* 沒有紀錄時復原、重做停用 */
  await expect(btn(page, /^復原/)).toBeDisabled();
  await expect(btn(page, /^重做/)).toBeDisabled();
  /* 頁尾只放靈感來源；非官方聲明 */
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('靈感來源');
  await expect(footer.getByRole('link')).toHaveAttribute(
    'href',
    'https://kumachansteps.github.io/trpg-web-tools/',
  );
  await expect(page.getByTestId('disclaimer')).toContainText('非官方');
  /* 說明與快捷鍵 */
  await page.getByRole('button', { name: '說明' }).click();
  const help = page.getByRole('dialog', { name: /使用方式/ });
  await expect(help).toContainText('跑團紀錄簿');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('?');
  const keys = page.getByRole('dialog', { name: '快捷鍵' });
  for (const label of [
    '複製預覽',
    '貼到 X',
    '復原預覽的修改',
    '重做',
    '把游標移到預覽最後',
    '上一個範本',
    '下一個範本',
    '上一個文字樣式',
    '下一個文字樣式',
    '捨棄手動修改，重新產生預覽',
  ])
    await expect(keys).toContainText(label);
  await expect(keys).toContainText('輸入框裡也可用');
  await page.keyboard.press('Escape');
  await expect(keys).toBeHidden();
  expect(errors).toEqual([]);
});

test('輸入即時反映：系統、作者、結果、敬稱、主持人與參加者、標記、名字順序、日期、標籤、備註', async ({
  page,
}) => {
  const errors = await open(page);
  await plain(page);
  /* 劇本、作者行、結果 */
  await box(page, '劇本名稱').fill('  霧港燈塔  ');
  await box(page, '作者').fill('王小明 老師');
  await box(page, '結果').fill('END 1　生還');
  await expect(preview(page)).toHaveValue(/^Call of Cthulhu\n《霧港燈塔》\n作者：王小明老師\n\n/);
  await expect(preview(page)).toHaveValue(/\n\nEND 1　生還\n\n/);
  await box(page, '作者').fill('作者:米可');
  await expect(preview(page)).toHaveValue(/《霧港燈塔》\n作者：米可\n/);
  await box(page, '作者').fill('');
  await expect(preview(page)).not.toHaveValue(/作者/);
  /* 系統：自行輸入（空白時範例值）、Emoklore 時主持人改成 DL（換回來不改） */
  await expect(box(page, '系統名稱')).toHaveCount(0);
  await pick(page, combo(page, '系統'), '自行輸入');
  await expect(preview(page)).toHaveValue(/^自訂系統\n/);
  await box(page, '系統名稱').fill(' 迷宮王國 ');
  await expect(preview(page)).toHaveValue(/^迷宮王國\n/);
  await pick(page, combo(page, '系統'), 'Emoklore TRPG');
  await expect(box(page, '系統名稱')).toHaveCount(0);
  await expect(combo(page, '主持人 1 的身分')).toContainText('DL');
  await expect(preview(page)).toHaveValue(/^Emoklore TRPG\n[\s\S]*\nDL｜主持人名字\n/);
  await pick(page, combo(page, '系統'), 'CoC7');
  await expect(combo(page, '主持人 1 的身分')).toContainText('DL');
  await pick(page, combo(page, '主持人 1 的身分'), 'KP');

  /* 主持人：新增（焦點到新的名字欄）、身分、敬稱、刪除、刪光（範例值）後再新增 */
  await box(page, '主持人 1 的名字').fill('阿德');
  await btn(page, '新增主持人').click();
  await expect(box(page, '主持人 2 的名字')).toBeFocused();
  await pick(page, combo(page, '主持人 2 的身分'), 'GM');
  await box(page, '主持人 2 的名字').fill('小林');
  await expect(preview(page)).toHaveValue(/\nKP｜阿德\nGM｜小林\n/);
  await page.getByRole('radio', { name: '〇〇樣' }).click();
  await expect(preview(page)).toHaveValue(/\nKP｜阿德樣\nGM｜小林樣\n/);
  /* 第二位以後名字空白就不寫 */
  await btn(page, '新增主持人').click();
  await pick(page, combo(page, '主持人 3 的身分'), '主持');
  await expect(preview(page)).toHaveValue(/\nGM｜小林樣\n\n/);
  await box(page, '主持人 3 的名字').fill('米可樣');
  await expect(preview(page)).toHaveValue(/\nGM｜小林樣\n主持｜米可樣\n/);
  await btn(page, '刪除主持人 1').click();
  await expect(preview(page)).not.toHaveValue(/阿德/);
  await btn(page, '刪除主持人 1').click();
  await btn(page, '刪除主持人 1').click();
  await expect(page.getByTestId('gm-list').getByRole('listitem')).toHaveCount(0);
  await expect(page.getByText('沒有主持人時，團報會寫一位範例主持人。')).toBeVisible();
  /* 一列都沒有時的範例值不加敬稱 */
  await expect(preview(page)).toHaveValue(/\nKP｜主持人名字\n/);
  await btn(page, '新增主持人').click();
  await expect(box(page, '主持人 1 的名字')).toBeFocused();
  /* 列裡名字空白而用範例值時加敬稱 */
  await expect(preview(page)).toHaveValue(/\nKP｜主持人名字樣\n/);
  await page.getByRole('radio', { name: '不加' }).click();

  /* 參加者：新增後標記自動編號（唯讀）、HO 補充、標記設定、名字順序 */
  await box(page, '參加者 1 的 PC 名字').fill('溫書亭');
  await box(page, '參加者 1 的 PL 名字').fill('米可');
  await btn(page, '新增參加者').click();
  await expect(box(page, '參加者 2 的 PC 名字')).toBeFocused();
  await expect(page.getByTestId('slot-fixed')).toHaveText('HO2');
  await expect(combo(page, '參加者 2 的標記')).toHaveCount(0);
  await box(page, '參加者 2 的 HO 補充').fill('記者');
  await expect(preview(page)).toHaveValue(
    /\nPC／PL\nHO1｜溫書亭 ／ 米可\nHO2 記者｜角色B ／ 玩家B\n/,
  );
  await pick(page, combo(page, '參加者 1 的標記'), /^PC1/);
  await expect(page.getByTestId('slot-fixed')).toHaveText('PC2');
  await expect(preview(page)).toHaveValue(/\nPC1｜溫書亭 ／ 米可\nPC2 記者｜角色B ／ 玩家B\n/);
  await page.getByRole('radio', { name: 'PL → PC' }).click();
  /* 輸入欄的順序也跟著換：PL 在左 */
  const firstRowNames = page.getByTestId('player-names').first().getByRole('textbox');
  await expect(firstRowNames.first()).toHaveAccessibleName('參加者 1 的 PL 名字');
  await expect(preview(page)).toHaveValue(
    /\nPL／PC\nPC1｜米可 ／ 溫書亭\nPC2 記者｜玩家B ／ 角色B\n/,
  );
  /* 第一列 PC/PL 優先於輸入順序；不寫標記，也不寫 HO 補充 */
  await pick(page, combo(page, '參加者 1 的標記'), /^PC\/PL/);
  await expect(preview(page)).toHaveValue(/\nPC／PL\n溫書亭 ／ 米可\n角色B ／ 玩家B\n/);
  await expect(preview(page)).not.toHaveValue(/記者/);
  /* 刪掉第一列：標記設定保留，其餘重新編號 */
  await pick(page, combo(page, '參加者 1 的標記'), /^HO1/);
  await btn(page, '刪除參加者 1').click();
  await expect(combo(page, '參加者 1 的標記')).toContainText('HO1');
  await expect(preview(page)).toHaveValue(/\nPL／PC\nHO1 記者｜玩家A ／ 角色A\n/);
  await btn(page, '刪除參加者 1').click();
  await expect(page.getByText('沒有參加者時，團報會寫一位範例參加者。')).toBeVisible();
  await expect(preview(page)).toHaveValue(/\nPL／PC\nHO1｜玩家A ／ 角色A\n/);
  await btn(page, '新增參加者').click();
  await expect(box(page, '參加者 1 的 PL 名字')).toBeFocused();

  /* 日期、主題標籤；備註不寫進團報 */
  await box(page, '日期').fill('2026/9/30');
  await box(page, '主題標籤').fill('  #團報 #CoC ');
  await box(page, '備註').fill('只給自己看的備註');
  await expect(preview(page)).toHaveValue(/\n\n2026\/9\/30\n#團報 #CoC$/);
  await expect(preview(page)).not.toHaveValue(/只給自己看的備註/);
  expect(errors).toEqual([]);
});

test('範本與文字樣式：選單、快速切換列（記一步復原）、Ctrl＋Alt＋方向鍵循環', async ({ page }) => {
  const errors = await open(page);
  await pick(page, combo(page, '團報範本'), /^2\. 精簡/);
  await expect(preview(page)).toHaveValue(new RegExp(`^【${SANS_BI('Call of Cthulhu')}】\n`));
  /* 精簡版不寫日期 */
  await expect(preview(page)).not.toHaveValue(new RegExp(SANS_BI('2026')));
  /* 文字欄裡也有效；頭尾循環 */
  await box(page, '劇本名稱').focus();
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(combo(page, '團報範本')).toContainText('3. 星光框');
  await page.keyboard.press('Control+Alt+ArrowUp');
  await page.keyboard.press('Control+Alt+ArrowUp');
  await page.keyboard.press('Control+Alt+ArrowUp');
  await expect(combo(page, '團報範本')).toContainText('17. 蝴蝶結');
  await expect(box(page, '劇本名稱')).toBeFocused();
  /* 焦點在選單上時也有效（選單不展開） */
  await combo(page, '團報範本').focus();
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(combo(page, '團報範本')).toContainText('1. 標準');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  /* 文字樣式：快捷鍵（不記復原） */
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(combo(page, '文字樣式')).toContainText('粗體（無襯線）');
  await expect(preview(page)).toHaveValue(
    new RegExp(`^${toUnicodeStyle('Call of Cthulhu', 'sansBold')}\n`),
  );
  await page.keyboard.press('Control+Alt+ArrowLeft');
  await page.keyboard.press('Control+Alt+ArrowLeft');
  await expect(combo(page, '文字樣式')).toContainText('不轉換');
  await expect(preview(page)).toHaveValue(/^Call of Cthulhu\n/);
  await expect(btn(page, /^復原/)).toBeDisabled();
  /* 選單 */
  await pick(page, combo(page, '文字樣式'), /小型大寫$/);
  await expect(preview(page)).toHaveValue(/^ᴄᴀʟʟ ᴏꜰ ᴄᴛʜᴜʟʜᴜ\n/);
  await expect(btn(page, /^復原/)).toBeDisabled();
  /* 快速切換列：先記一步復原；復原只換預覽的文字，選單不變 */
  await styleBar(page).getByRole('button', { name: '等寬（打字機）' }).click();
  await expect(combo(page, '文字樣式')).toContainText('等寬（打字機）');
  await expect(styleBar(page).getByRole('button', { name: '等寬（打字機）' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(preview(page)).toHaveValue(
    new RegExp(`^${toUnicodeStyle('Call of Cthulhu', 'monospace')}\n`),
  );
  await btn(page, /^復原/).click();
  await expect(preview(page)).toHaveValue(/^ᴄᴀʟʟ ᴏꜰ ᴄᴛʜᴜʟʜᴜ\n/);
  await expect(combo(page, '文字樣式')).toContainText('等寬（打字機）');
  await btn(page, /^重做/).click();
  await expect(preview(page)).toHaveValue(
    new RegExp(`^${toUnicodeStyle('Call of Cthulhu', 'monospace')}\n`),
  );
  /* 只轉換樣式部件：劇本、名字不轉換 */
  await box(page, '劇本名稱').fill('Abc');
  await expect(preview(page)).toHaveValue(/《Abc》/);
  expect(errors).toEqual([]);
});

test('預覽：直接編輯、重新產生、清除、文字裝飾、復原／重做、字數', async ({ page }) => {
  const errors = await open(page);
  await plain(page);
  const generated = await text(page);
  /* 直接編輯：改輸入時保留手動的部分 */
  await preview(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('!好玩');
  await expect(preview(page)).toHaveValue(`${generated}!好玩`);
  await expect(page.getByTestId('dirty-note')).toBeVisible();
  await box(page, '結果').fill('END 2');
  await expect(preview(page)).toHaveValue(/\n\nEND 2\n\n2026\/10\/3!好玩$/);
  const merged = await text(page);
  /* 預覽裡的 Ctrl＋Z／Ctrl＋Shift＋Z／Ctrl＋Y：只復原預覽的文字（改輸入不記復原） */
  await preview(page).focus();
  await page.keyboard.press('Control+z');
  await expect(preview(page)).toHaveValue(`${generated}!好`);
  await page.keyboard.press('Control+Shift+z');
  await expect(preview(page)).toHaveValue(merged);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(preview(page)).toHaveValue(generated);
  await page.keyboard.press('Control+y');
  await expect(preview(page)).toHaveValue(`${generated}!`);
  await expect(box(page, '結果')).toHaveValue('END 2');

  /* 重新產生（按鈕）：捨棄手動編輯，焦點到預覽；可以復原 */
  await btn(page, '重新產生').click();
  const fresh = await text(page);
  expect(fresh).toMatch(/\n\nEND 2\n\n2026\/10\/3$/);
  await expect(preview(page)).toBeFocused();
  await expect(page.getByTestId('dirty-note')).toHaveCount(0);
  await btn(page, /^復原/).click();
  await expect(preview(page)).toHaveValue(`${generated}!`);
  /* Ctrl＋Alt＋R（文字欄裡也有效） */
  await box(page, '劇本名稱').focus();
  await page.keyboard.press('Control+Alt+r');
  await expect(preview(page)).toHaveValue(fresh);
  await expect(preview(page)).toBeFocused();

  /* 文字裝飾：插入在游標位置（預覽沒有焦點時用最後的位置），之後游標在插入的文字後面 */
  await preview(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
  await box(page, '主題標籤').focus();
  const lines = page.getByRole('group', { name: '分隔線', exact: true });
  await lines.getByRole('button', { name: '━━━━' }).click();
  const LINE = '━━━━━━━━━━━━━━';
  await expect(preview(page)).toHaveValue(`${LINE}${fresh}`);
  await expect(preview(page)).toBeFocused();
  expect(await sel(page)).toEqual([LINE.length, LINE.length]);
  await page.keyboard.press('Enter');
  await expect(preview(page)).toHaveValue(`${LINE}\n${fresh}`);
  /* 有選取時取代選取的文字 */
  await preview(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 14));
  await page.getByRole('group', { name: '單一符號' }).getByRole('button', { name: '★' }).click();
  await expect(preview(page)).toHaveValue(`★\n${fresh}`);
  expect(await sel(page)).toEqual([1, 1]);
  /* 插入的裝飾也算手動編輯：改輸入時保留（3.8：開頭插入、團報長度不變時接在新團報前面） */
  await box(page, '結果').fill('END 3');
  await expect(preview(page)).toHaveValue(`★\n${fresh.replace('END 2', 'END 3')}`);
  /* 有紀錄時復原 → 插入前 */
  await btn(page, /^復原/).click();
  await expect(preview(page)).toHaveValue(`${LINE}\n${fresh}`);

  /* 清除預覽：之後改輸入仍是空的，重新產生才回來 */
  await btn(page, '清除預覽').click();
  await expect(preview(page)).toHaveValue('');
  await expect(preview(page)).toBeFocused();
  await expect(count(page)).toContainText('0 / 280');
  await box(page, '結果').fill('END 4');
  await expect(preview(page)).toHaveValue('');
  await btn(page, /^復原/).click();
  await expect(preview(page)).toHaveValue(`${LINE}\n${fresh}`);
  await btn(page, '重新產生').click();
  await expect(preview(page)).toHaveValue(/\n\nEND 4\n\n2026\/10\/3$/);

  /* 字數：全形算 2，超過上限時「超過 N 字」 */
  await preview(page).fill('あ'.repeat(150));
  await expect(count(page)).toContainText('300 / 280');
  await expect(count(page)).toHaveAttribute('data-over', 'true');
  await expect(page.getByTestId('post-limit')).toHaveText('超過 20 字');
  await preview(page).fill('abc團報🎲');
  await expect(count(page)).toContainText(`${3 + 4 + 2} / 280`);
  await expect(count(page)).not.toHaveAttribute('data-over', 'true');
  expect(errors).toEqual([]);
});

test('輸出：複製（剪貼簿）、貼到 X（解析開啟的網址）、Ctrl＋E', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await stubOpen(page);
  const errors = await open(page);
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  /* 複製：原封不動（不去空白） */
  const raw = '  團報 & #CoC 50% 🎲\n第二行  \n';
  await preview(page).fill(raw);
  await btn(page, '複製').click();
  await expect(page.getByText('已複製團報', { exact: true })).toBeVisible();
  expect(await clip()).toBe(raw);
  /* Ctrl＋Enter、Ctrl＋Shift＋C（文字欄裡也有效） */
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await box(page, '劇本名稱').focus();
  await page.keyboard.press('Control+Enter');
  await expect.poll(clip).toBe(raw);
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.keyboard.press('Control+Shift+c');
  await expect.poll(clip).toBe(raw);

  /* 貼到 X：去頭尾空白後開啟發文畫面（新分頁、不帶參照） */
  await btn(page, '貼到 X').click();
  let calls = await opened(page);
  expect(calls).toHaveLength(1);
  const [href, target, features] = calls[0];
  const url = new globalThis.URL(href);
  expect(`${url.origin}${url.pathname}`).toBe('https://twitter.com/intent/tweet');
  expect(url.searchParams.get('text')).toBe(raw.trim());
  expect(href).toContain('%20');
  expect(href).toContain('%0A');
  expect(href).not.toContain('+');
  expect(target).toBe('_blank');
  expect(features).toContain('noopener');
  /* Ctrl＋Shift＋P、Ctrl＋Shift＋Enter */
  await box(page, '劇本名稱').focus();
  await page.keyboard.press('Control+Shift+p');
  await page.keyboard.press('Control+Shift+Enter');
  calls = await opened(page);
  expect(calls).toHaveLength(3);
  expect(calls.map((c) => new globalThis.URL(c[0]).searchParams.get('text'))).toEqual([
    raw.trim(),
    raw.trim(),
    raw.trim(),
  ]);
  /* 空白時提示、不開分頁 */
  await preview(page).fill('  \n ');
  await btn(page, '貼到 X').click();
  await expect(page.getByText('沒有可以發文的團報', { exact: true })).toBeVisible();
  expect(await opened(page)).toHaveLength(3);

  /* Ctrl＋E：焦點到預覽、游標在最後 */
  await preview(page).fill('團報文字');
  await box(page, '結果').focus();
  await page.keyboard.press('Control+e');
  await expect(preview(page)).toBeFocused();
  expect(await sel(page)).toEqual([4, 4]);
  expect(errors).toEqual([]);
});

/* ---------- 跑團紀錄簿的交接資料 ---------- */

function payload(item: Record<string, unknown> = {}) {
  return {
    source: 'session-log-tracker',
    version: '1.0',
    createdAt: '2026-05-10T00:00:00.000Z',
    items: [
      {
        id: 'report_import_1',
        sourceLogId: 'row-1',
        reported: false,
        scenario: '雨夜的郵差',
        system: 'CoC 7版',
        dates: ['2026-05-02', '2026-05-09'],
        latestDate: '2026-05-09',
        sessionCount: 2,
        gm: '小林',
        players: [
          { pl: '阿德', pc: '溫書亭', characterUrl: '' },
          { pl: '米可', pc: '', characterUrl: '' },
        ],
        format: '',
        status: 'completed',
        memo: '第一天：洋館\n\n全員生還',
        links: [],
        hashtags: ['團報', '#CoC'],
        ...item,
      },
    ],
  };
}

async function withPending(page: Page, value: string) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [PENDING_KEY, value]);
  await page.reload();
  /* 詢問的對話框開著時頁面其他部分是 aria-hidden，用 CSS 選擇器等頁面出現 */
  await expect(page.locator('h1')).toHaveText('團報產生器');
}

const pendingValue = (page: Page) => page.evaluate((k) => localStorage.getItem(k), PENDING_KEY);

test('交接資料：稍後保留、讀入填表（刪除交接資料、可以復原）、捨棄', async ({ page }) => {
  const errors = await open(page);
  await plain(page);
  await page.getByRole('radio', { name: 'PL → PC' }).click();
  await box(page, '作者').fill('上一團的作者');
  await box(page, '結果').fill('上一團的結果');
  const before = await text(page);
  const json = JSON.stringify(payload());
  await withPending(page, json);
  const ask = page.getByRole('alertdialog', { name: '讀入跑團紀錄簿送來的這一團？' });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('填入後仍可修改');
  /* 稍後：不做事，下次開頁再問 */
  await ask.getByRole('button', { name: '稍後再說' }).click();
  await expect(ask).toHaveCount(0);
  expect(await pendingValue(page)).toBe(json);
  await expect(preview(page)).toHaveValue(before);
  await page.reload();
  await expect(ask).toBeVisible();
  /* Esc＝稍後 */
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  expect(await pendingValue(page)).toBe(json);
  await page.reload();
  /* 讀入 */
  await ask.getByRole('button', { name: '讀入', exact: true }).click();
  await expect(page.getByText('已讀入跑團紀錄簿送來的資料', { exact: true })).toBeVisible();
  expect(await pendingValue(page)).toBeNull();
  await expect(combo(page, '系統')).toContainText('CoC7');
  await expect(box(page, '劇本名稱')).toHaveValue('雨夜的郵差');
  await expect(box(page, '日期')).toHaveValue('2026-05-09');
  await expect(box(page, '主題標籤')).toHaveValue('#團報 #CoC');
  await expect(box(page, '備註')).toHaveValue('第一天：洋館\n\n全員生還');
  /* 新版：作者、結果清空；名字順序、樣式、敬稱不變 */
  await expect(box(page, '作者')).toHaveValue('');
  await expect(box(page, '結果')).toHaveValue('');
  await expect(page.getByRole('radio', { name: 'PL → PC' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('radio', { name: '不加' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('gm-list').getByRole('listitem')).toHaveCount(1);
  await expect(combo(page, '主持人 1 的身分')).toContainText('KP');
  await expect(box(page, '主持人 1 的名字')).toHaveValue('小林');
  await expect(box(page, '參加者 1 的 PL 名字')).toHaveValue('阿德');
  await expect(box(page, '參加者 1 的 PC 名字')).toHaveValue('溫書亭');
  await expect(box(page, '參加者 2 的 PL 名字')).toHaveValue('米可');
  await expect(box(page, '參加者 2 的 PC 名字')).toHaveValue('');
  await expect(box(page, '參加者 1 的 HO 補充')).toHaveValue('');
  const loaded = [
    'CoC7',
    '《雨夜的郵差》',
    '',
    'KP｜小林',
    '',
    'PL／PC',
    'HO1｜阿德 ／ 溫書亭',
    'HO2｜米可 ／ 角色B',
    '',
    'END 全員生還',
    '',
    '2026-05-09',
    '#團報 #CoC',
  ].join('\n');
  await expect(preview(page)).toHaveValue(loaded);
  /* 讀入前記了一步：復原回到讀入前的預覽 */
  await btn(page, /^復原/).click();
  await expect(preview(page)).toHaveValue(before);
  await btn(page, /^重做/).click();
  await expect(preview(page)).toHaveValue(loaded);
  /* 讀完不再詢問 */
  await page.reload();
  await expect(preview(page)).toHaveValue(loaded);
  await expect(ask).toHaveCount(0);

  /* 對不上的系統 → 自行輸入；Emoklore → DL；沒有參加者時一列空白；日期清單 */
  await withPending(
    page,
    JSON.stringify(payload({ system: 'ゴーストハント', players: [], latestDate: '', gm: '自己' })),
  );
  await ask.getByRole('button', { name: '讀入', exact: true }).click();
  await expect(combo(page, '系統')).toContainText('自行輸入');
  await expect(box(page, '系統名稱')).toHaveValue('ゴーストハント');
  await expect(combo(page, '主持人 1 的身分')).toContainText('GM');
  await expect(box(page, '日期')).toHaveValue('2026-05-02 / 2026-05-09');
  await expect(page.getByTestId('player-list').getByRole('listitem')).toHaveCount(1);
  await withPending(page, JSON.stringify(payload({ system: 'エモクロア' })));
  await ask.getByRole('button', { name: '讀入', exact: true }).click();
  await expect(combo(page, '系統')).toContainText('Emoklore TRPG');
  await expect(combo(page, '主持人 1 的身分')).toContainText('DL');

  /* 捨棄：刪除交接資料，表單不變 */
  const kept = await text(page);
  await withPending(page, JSON.stringify(payload({ scenario: '不要的那一團' })));
  await ask.getByRole('button', { name: '捨棄' }).click();
  expect(await pendingValue(page)).toBeNull();
  await expect(box(page, '劇本名稱')).not.toHaveValue('不要的那一團');
  await expect(preview(page)).toHaveValue(kept);
  expect(errors).toEqual([]);
});

test('交接資料：損壞時詢問刪除（保留／刪除），第一項不是物件也算；項目是空的不詢問', async ({
  page,
}) => {
  const errors = await open(page);
  const before = await text(page);
  const broken = page.getByRole('alertdialog', { name: '跑團紀錄簿送來的資料無法讀取' });
  await withPending(page, '{not json');
  await expect(broken).toBeVisible();
  await broken.getByRole('button', { name: '保留' }).click();
  expect(await pendingValue(page)).toBe('{not json');
  await expect(preview(page)).toHaveValue(before);
  await page.reload();
  await broken.getByRole('button', { name: '刪除' }).click();
  expect(await pendingValue(page)).toBeNull();
  /* JSON 但沒有項目陣列也當作讀不懂 */
  await withPending(page, '{}');
  await expect(broken).toBeVisible();
  await broken.getByRole('button', { name: '刪除' }).click();
  expect(await pendingValue(page)).toBeNull();
  /* 第一項不是物件也當作讀不懂（第 7.1 節） */
  await withPending(page, JSON.stringify({ ...payload(), items: [null] }));
  await expect(broken).toBeVisible();
  await broken.getByRole('button', { name: '刪除' }).click();
  expect(await pendingValue(page)).toBeNull();
  /* 項目陣列是空的：不詢問、不刪除 */
  const empty = JSON.stringify({ ...payload(), items: [] });
  await withPending(page, empty);
  await page.waitForTimeout(300);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await pendingValue(page)).toBe(empty);
  await expect(preview(page)).toHaveValue(before);
  expect(errors).toEqual([]);
});

test('自動存檔（輸入、預覽與手動編輯；復原紀錄不存）、清除輸入（先確認）', async ({ page }) => {
  const errors = await open(page);
  await plain(page);
  await pick(page, combo(page, '團報範本'), /^4\. 花邊框/);
  await box(page, '劇本名稱').fill('霧港燈塔');
  await box(page, '主持人 1 的名字').fill('阿德');
  await btn(page, '新增參加者').click();
  await box(page, '參加者 2 的 PL 名字').fill('米可');
  await box(page, '備註').fill('備註');
  await preview(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n好玩！');
  const edited = await text(page);
  expect(edited.endsWith('\n好玩！')).toBe(true);
  const stored = await page.evaluate((k) => localStorage.getItem(k), STORE_KEY);
  expect(JSON.parse(stored ?? '{}').state.data).toMatchObject({
    template: 'petal',
    fontStyle: 'plain',
    scenario: '霧港燈塔',
    memo: '備註',
  });
  await page.reload();
  await expect(preview(page)).toHaveValue(edited);
  await expect(combo(page, '團報範本')).toContainText('4. 花邊框');
  await expect(box(page, '劇本名稱')).toHaveValue('霧港燈塔');
  await expect(box(page, '參加者 2 的 PL 名字')).toHaveValue('米可');
  await expect(page.getByTestId('dirty-note')).toBeVisible();
  await expect(btn(page, /^復原/)).toBeDisabled();
  /* 手動編輯在重新整理後仍會保留 */
  await box(page, '結果').fill('END 9');
  await expect(preview(page)).toHaveValue(/END 9/);
  await expect(preview(page)).toHaveValue(/\n好玩！$/);

  /* 清除輸入：先確認；取消不做事 */
  await btn(page, '清除輸入').click();
  const confirm = page.getByRole('alertdialog', { name: '清除所有輸入？' });
  await confirm.getByRole('button', { name: '取消' }).click();
  await expect(box(page, '劇本名稱')).toHaveValue('霧港燈塔');
  await btn(page, '清除輸入').click();
  await confirm.getByRole('button', { name: '清除' }).click();
  await expect(box(page, '劇本名稱')).toHaveValue('');
  await expect(box(page, '備註')).toHaveValue('');
  await expect(combo(page, '團報範本')).toContainText('1. 標準');
  await expect(combo(page, '文字樣式')).toContainText('粗斜體（無襯線）');
  await expect(page.getByTestId('gm-list').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('player-list').getByRole('listitem')).toHaveCount(1);
  await expect(preview(page)).toHaveValue(
    new RegExp(`^${SANS_BI('Call of Cthulhu')}\n《劇本標題》`),
  );
  await expect(page.getByTestId('dirty-note')).toHaveCount(0);
  await expect(btn(page, /^復原/)).toBeDisabled();
  await page.reload();
  await expect(box(page, '劇本名稱')).toHaveValue('');
  expect(errors).toEqual([]);
});

test.describe('視覺回歸', () => {
  async function prepare(page: Page) {
    const errors = await open(page);
    await box(page, '劇本名稱').fill('霧港燈塔的最後一盞燈');
    await box(page, '作者').fill('王小明');
    await box(page, '結果').fill('END 2　全員生還');
    await box(page, '主持人 1 的名字').fill('阿德');
    await box(page, '參加者 1 的 PC 名字').fill('溫書亭');
    await box(page, '參加者 1 的 PL 名字').fill('米可');
    await btn(page, '新增參加者').click();
    await box(page, '參加者 2 的 PC 名字').fill('林夏');
    await box(page, '參加者 2 的 PL 名字').fill('小林');
    await box(page, '主題標籤').fill('#團報');
    await page.getByRole('heading', { level: 1 }).click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(preview(page)).toHaveValue(/#團報$/);
    return errors;
  }

  test('1280 寬', async ({ page }) => {
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('session-report-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('390 寬，沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await prepare(page);
    await noHorizontalScroll(page);
    await btn(page, '新增主持人').click();
    await noHorizontalScroll(page);
    await btn(page, '刪除主持人 2').click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('session-report-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
