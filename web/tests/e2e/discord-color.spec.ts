/**
 * Discord 彩色文字產生器（建置產物 next/discord-color/）的端對端測試（規格 docs/refactor/specs/discord-color.md）：
 * - 開頁沒有錯誤、預設範例的輸出與字數、頁尾只有靈感來源；
 * - 樣式、經典色（文字／背景）、自訂色（套用、改色、回到預設）、效果（彩虹、漸層、斑馬，顏色可改）；
 * - 預覽主題、打字與 Enter、Ctrl＋B／I／U、複製貼上保留格式、復原／重做、焦點離開後的選取、字數分級、
 *   複製（剪貼簿、連續複製的提示）、自動保存與專案檔；
 * - **與原作頁面對照**（tests/unit/fixtures/discord-color-original.html，公有領域）：同樣的文字、同樣的選取與按鈕，
 *   每一步的輸出逐字相同（隨機的操作序列、改過效果顏色、打字）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { type AnsiNode, ansiMessage, code, rgb, text } from '../../src/tools/discord-color/ansi';
import { defaultDoc } from '../../src/tools/discord-color/model';
import { gradientColor, rainbowColor } from '../../src/tools/discord-color/palette';

const URL = `/${outputDir(getTool('discord-color') ?? { id: 'discord-color', status: 'next' })}/`;
const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL_HTML = path.resolve(here, '../unit/fixtures/discord-color-original.html');
const ORIGINAL_URL = '/__original__/discord-color.html';
const STORE = 'trpg-toolkit:discord-color';
const E = '\u001b';

test.use({ viewport: { width: 1280, height: 900 } });

interface Seed {
  doc?: AnsiNode[];
  custom?: string[];
  gradient?: [string, string];
  zebra?: [string, string];
}

/** 開頁前把資料放進自動保存（every：每次重新整理都放回去；否則只有第一次） */
async function seed(page: Page, data: Seed, every = false) {
  await page.addInitScript(
    ([key, value, again]) => {
      if (!again && sessionStorage.getItem('dc-seeded')) return;
      localStorage.setItem(key, JSON.stringify({ state: { data: value }, version: 1 }));
      sessionStorage.setItem('dc-seeded', '1');
    },
    [STORE, data, every] as const,
  );
}

async function open(page: Page, data?: Seed) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  if (data) await seed(page, data);
  await page.goto(URL);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Discord 彩色文字產生器' }),
  ).toBeVisible();
  return errors;
}

const editor = (page: Page) => page.getByRole('textbox', { name: '編輯區' });
const output = (page: Page) => page.getByRole('textbox', { name: 'Discord 訊息' });
const toolbar = (page: Page) => page.getByRole('toolbar', { name: '文字格式' });
const styleBtn = (page: Page, c: number) => toolbar(page).locator(`button[data-code="${c}"]`);
const classic = (page: Page, name: string) =>
  toolbar(page).getByRole('button', { name: `經典色：${name}` });
const customBtn = (page: Page, i: number) => toolbar(page).locator('button[data-hex]').nth(i);
const effectBtn = (page: Page, id: string) => toolbar(page).locator(`button[data-effect="${id}"]`);
const target = (page: Page, t: 'fg' | 'bg') =>
  toolbar(page)
    .getByRole('radio', { name: t === 'fg' ? '文字' : '背景', exact: true })
    .click();
const msg = (doc: AnsiNode[]) => ansiMessage(doc);

/** 依字數選取（只算文字節點；原作頁面也用同一段，兩邊的位置一定相同） */
function selectIn(rootSel: string, a: number, b: number) {
  const root = document.querySelector(rootSel) as HTMLElement;
  const texts: Text[] = [];
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) texts.push(c as Text);
      else walk(c);
    }
  };
  walk(root);
  const at = (o: number): [Node, number] => {
    let left = o;
    for (const t of texts) {
      if (left <= t.length) return [t, left];
      left -= t.length;
    }
    return [root, root.childNodes.length];
  };
  const r = document.createRange();
  r.setStart(...at(a));
  r.setEnd(...at(b));
  const s = getSelection() as Selection;
  s.removeAllRanges();
  s.addRange(r);
}

const select = (page: Page, a: number, b: number) =>
  page.evaluate(([x, y]) => selectIn('[data-dc-editor]', x, y), [a, b] as const);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(`window.selectIn = ${selectIn.toString()}`);
});

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test('開頁沒有錯誤；預設範例的輸出與字數；頁尾只有靈感來源', async ({ page }) => {
  const errors = await open(page);
  const want = msg(defaultDoc());
  await expect(output(page)).toHaveValue(want);
  await expect(editor(page)).toHaveText('歡迎使用 Discord 彩色文字產生器！');
  await expect(page.getByTestId('dc-counter')).toHaveText(`${want.length}/2,000`);
  await expect(page.getByTestId('text-output-count')).toHaveText(`${want.length}／2,000 字`);
  /* 範例的格式：藍紫底白字、粗體＋經典 7 色 */
  await expect(editor(page).locator('.ansi-rgb[data-hex="#5865F2"]')).toHaveCSS(
    'background-color',
    'rgb(88, 101, 242)',
  );
  await expect(editor(page).locator('.ansi-1 > .ansi-37')).toHaveText('器');
  await expect(page.getByRole('contentinfo')).toContainText('靈感來源');
  await expect(
    page.getByRole('link', { name: 'rebane2001／Discord Colored Text Generator' }),
  ).toHaveAttribute('href', 'https://gist.github.com/rebane2001/07f2d8e80df053c70a1576d27eabe97c');
  expect(errors).toEqual([]);
});

test('樣式與經典色：包住選取的文字、之後選取新的格式（可以疊加）；套用到背景', async ({ page }) => {
  const errors = await open(page, { doc: [text('Hello brave new world')] });
  await select(page, 0, 5);
  await styleBtn(page, 1).click();
  await expect(output(page)).toHaveValue(msg([code(1, [text('Hello')]), text(' brave new world')]));
  /* 選取範圍變成粗體的內容：再按紅色就包在粗體裡面 */
  await classic(page, '紅色').click();
  const step2 = [code(1, [code(31, [text('Hello')])]), text(' brave new world')];
  await expect(output(page)).toHaveValue(msg(step2));
  await expect(editor(page).locator('.ansi-1 > .ansi-31')).toHaveText('Hello');

  await target(page, 'bg');
  await select(page, 6, 11);
  await classic(page, '淺藍色').click();
  const step3 = [...step2.slice(0, 1), text(' '), code(44, [text('brave')]), text(' new world')];
  await expect(output(page)).toHaveValue(msg(step3));

  /* 其他樣式：斜體、底線、刪除線、清除（重設碼） */
  await select(page, 12, 15);
  await styleBtn(page, 3).click();
  await select(page, 16, 17);
  await styleBtn(page, 4).click();
  await select(page, 17, 18);
  await styleBtn(page, 9).click();
  await select(page, 18, 21);
  await styleBtn(page, 0).click();
  await expect(output(page)).toHaveValue(
    msg([
      ...step3.slice(0, 3),
      text(' '),
      code(3, [text('new')]),
      text(' '),
      code(4, [text('w')]),
      code(9, [text('o')]),
      code(0, [text('rld')]),
    ]),
  );
  await expect(output(page)).toHaveValue(new RegExp(`${E}\\[2;0;2mrld${E}\\[0m`));
  /* 經典色的色塊照預覽主題（Ash）的紅 */
  await expect(classic(page, '紅色')).toHaveCSS(
    'background-color',
    /rgb\(23[5-7], 9[89], 9[7-9]\)/,
  );
  expect(errors).toEqual([]);
});

test('鍵盤：從編輯區 Shift＋Tab 到工具列按 Enter、按鈕上按空白鍵也能套用', async ({ page }) => {
  const errors = await open(page, { doc: [text('key board')] });
  await editor(page).focus();
  await select(page, 4, 9);
  await page.keyboard.press('Shift+Tab');
  await expect(effectBtn(page, 'zebra')).toBeFocused();
  await page.keyboard.press('Enter');
  const zebra = Array.from('board', (ch, i) =>
    rgb(i % 2 ? '#FFB2B2' : '#A35454', true, [text(ch)]),
  );
  await expect(output(page)).toHaveValue(msg([text('key '), ...zebra]));
  await select(page, 0, 3);
  await styleBtn(page, 4).focus();
  await page.keyboard.press('Space');
  await expect(output(page)).toHaveValue(msg([code(4, [text('key')]), text(' '), ...zebra]));
  expect(errors).toEqual([]);
});

test('自訂色：套用、在設定欄改色、重新整理後保留、回到預設', async ({ page }) => {
  const errors = await open(page, { doc: [text('abc def')] });
  await expect(customBtn(page, 2)).toHaveAttribute('aria-label', '自訂色 3（#DE4040）');
  await select(page, 0, 3);
  await customBtn(page, 2).click();
  await expect(output(page)).toHaveValue(msg([rgb('#DE4040', true, [text('abc')]), text(' def')]));

  await page.getByRole('textbox', { name: '自訂色 3', exact: true }).fill('#123456');
  await expect(customBtn(page, 2)).toHaveAttribute('aria-label', '自訂色 3（#123456）');
  await target(page, 'bg');
  await select(page, 4, 7);
  await customBtn(page, 2).click();
  const want = msg([
    rgb('#DE4040', true, [text('abc')]),
    text(' '),
    rgb('#123456', false, [text('def')]),
  ]);
  await expect(output(page)).toHaveValue(want);
  await expect(output(page)).toHaveValue(new RegExp(`${E}\\[48;2;18;52;86mdef`));

  await page.waitForTimeout(100);
  await page.reload();
  await expect(output(page)).toHaveValue(want);
  await expect(customBtn(page, 2)).toHaveAttribute('aria-label', '自訂色 3（#123456）');
  /* 套用到（背景）也保留 */
  await expect(toolbar(page).getByRole('radio', { name: '背景', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: '回到預設的 8 色' }).click();
  await expect(customBtn(page, 2)).toHaveAttribute('aria-label', '自訂色 3（#DE4040）');
  expect(errors).toEqual([]);
});

test('效果：彩虹、漸層、斑馬，一個字一個顏色；顏色可改；只有一個字時用第一個顏色', async ({
  page,
}) => {
  const errors = await open(page, { doc: [text('abcde xyz 1')] });
  await select(page, 0, 5);
  await effectBtn(page, 'rainbow').click();
  const rainbow = Array.from('abcde', (ch, i) => rgb(rainbowColor(i, 5), true, [text(ch)]));
  await expect(output(page)).toHaveValue(msg([...rainbow, text(' xyz 1')]));

  await page.getByRole('textbox', { name: '漸層：起點' }).fill('#000000');
  await page.getByRole('textbox', { name: '漸層：終點' }).fill('#ffffff');
  await target(page, 'bg');
  await select(page, 6, 9);
  await effectBtn(page, 'gradient').click();
  const gradient = Array.from('xyz', (ch, i) =>
    rgb(gradientColor('#000000', '#FFFFFF', i, 3), false, [text(ch)]),
  );
  expect(gradient.map((n) => (n as { hex: string }).hex)).toEqual([
    '#000000',
    '#7F7F7F',
    '#FFFFFF',
  ]);
  await expect(output(page)).toHaveValue(msg([...rainbow, text(' '), ...gradient, text(' 1')]));

  await select(page, 10, 11);
  await effectBtn(page, 'rainbow').click();
  await expect(editor(page).locator('[data-hex]').last()).toHaveAttribute('data-hex', '#FF0000');

  await target(page, 'fg');
  await page.getByRole('textbox', { name: '斑馬：顏色 2' }).fill('#00ff00');
  await select(page, 0, 3);
  await effectBtn(page, 'zebra').click();
  await expect(editor(page).locator('.ansi-rgb').nth(0)).toHaveAttribute('data-hex', '#A35454');
  await expect(editor(page).locator('.ansi-rgb').nth(1)).toHaveAttribute('data-hex', '#00FF00');
  await expect(editor(page).locator('.ansi-rgb').nth(2)).toHaveAttribute('data-hex', '#A35454');
  /* 效果按鈕的色條跟著顏色 */
  await expect(effectBtn(page, 'gradient').locator('span[aria-hidden]')).toHaveAttribute(
    'style',
    /rgb\(0, 0, 0\).*rgb\(255, 255, 255\)/,
  );
  expect(errors).toEqual([]);
});

test('預覽主題：經典色與程式碼區塊跟著主題、輸出不變、重新整理後保留', async ({ page }) => {
  const errors = await open(page);
  const want = msg(defaultDoc());
  const red = editor(page).locator('.ansi-31');
  const preview = page.getByTestId('dc-preview');
  await expect(preview).toHaveAttribute('data-theme-preview', 'ash');
  const ashRed = await red.evaluate((e) => getComputedStyle(e).color);
  const ashBg = await preview.evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.getByRole('radio', { name: 'Light（淺色）' }).click();
  await expect(preview).toHaveAttribute('data-theme-preview', 'light');
  await expect(preview).toHaveCSS('background-color', 'rgb(251, 251, 251)');
  const lightRed = await red.evaluate((e) => getComputedStyle(e).color);
  expect(lightRed).not.toBe(ashRed);
  await page.getByRole('radio', { name: 'Onyx' }).click();
  const onyxBg = await preview.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(onyxBg).not.toBe(ashBg);
  await expect(classic(page, '紅色')).toHaveCSS('background-color', /rgb\(2\d\d, 4\d, 5\d\)/);
  await expect(output(page)).toHaveValue(want);
  await page.reload();
  await expect(page.getByTestId('dc-preview')).toHaveAttribute('data-theme-preview', 'onyx');
  await page.getByRole('radio', { name: 'Dark（深色）' }).click();
  await expect(page.getByTestId('dc-preview')).toHaveAttribute('data-theme-preview', 'dark');
  expect(errors).toEqual([]);
});

test('編輯：打字即時更新、Enter 換行、Ctrl＋B／I／U、複製貼上保留格式、純文字貼上', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page, { doc: [text('ab')] });
  await editor(page).focus();
  await select(page, 2, 2);
  await page.keyboard.type('cd');
  await page.keyboard.press('Enter');
  await page.keyboard.type('ef');
  await expect(output(page)).toHaveValue(msg([text('abcd\nef')]));

  await select(page, 0, 2);
  await page.keyboard.press('ControlOrMeta+b');
  await expect(output(page)).toHaveValue(msg([code(1, [text('ab')]), text('cd\nef')]));
  await select(page, 2, 3);
  await page.keyboard.press('ControlOrMeta+i');
  await select(page, 3, 4);
  await page.keyboard.press('ControlOrMeta+u');
  await expect(output(page)).toHaveValue(
    msg([code(1, [text('ab')]), code(3, [text('c')]), code(4, [text('d')]), text('\nef')]),
  );

  /* 複製有色的字、貼到最後：格式保留（剪貼簿放的是本工具的結構） */
  await select(page, 0, 1);
  await page.keyboard.press('ControlOrMeta+c');
  const html = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return (await item.getType('text/html')).text();
  });
  expect(html).toBe('<span class="ansi-1">a</span>');
  await select(page, 7, 7);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(editor(page).locator('.ansi-1')).toHaveCount(2);
  await expect(output(page)).toHaveValue(
    msg([
      code(1, [text('ab')]),
      code(3, [text('c')]),
      code(4, [text('d')]),
      text('\nef'),
      code(1, [text('a')]),
    ]),
  );

  /* 純文字（其他地方複製的）貼上：換行變成換行，沒有格式 */
  await page.evaluate(() => navigator.clipboard.writeText('X\nY'));
  await select(page, 0, 0);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(editor(page)).toHaveText(/^XYabcd/);
  await expect(output(page)).toHaveValue(/^```ansi\nX\nY/);
  expect(errors).toEqual([]);
});

test('瀏覽器加進來的標記會被清掉，游標留在原處', async ({ page }) => {
  const errors = await open(page, { doc: [text('abc')] });
  await editor(page).focus();
  await select(page, 3, 3);
  /* 模擬瀏覽器打字時加的 <font>、<b>：讀回時只留內容 */
  await page.evaluate(() => {
    const ed = document.querySelector('[data-dc-editor]') as HTMLElement;
    const font = document.createElement('font');
    font.setAttribute('color', '#ff0000');
    font.innerHTML = '<b>X</b>';
    ed.append(font);
    ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await expect(editor(page).locator('font, b')).toHaveCount(0);
  await expect(output(page)).toHaveValue(msg([text('abcX')]));
  expect(errors).toEqual([]);
});

test('復原／重做：打字與套用格式各是一步；頁首按鈕與快捷鍵', async ({ page }) => {
  const errors = await open(page, { doc: [text('one')] });
  await editor(page).focus();
  await select(page, 3, 3);
  await page.keyboard.type(' two');
  await select(page, 0, 3);
  await classic(page, '綠色').click();
  await expect(output(page)).toHaveValue(msg([code(32, [text('one')]), text(' two')]));

  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(output(page)).toHaveValue(msg([text('one two')]));
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(output(page)).toHaveValue(msg([text('one')]));
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect(output(page)).toHaveValue(msg([text('one two')]));
  /* 編輯區裡的 Ctrl＋Shift＋Z、Ctrl＋Z */
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(output(page)).toHaveValue(msg([code(32, [text('one')]), text(' two')]));
  await page.keyboard.press('ControlOrMeta+z');
  await expect(output(page)).toHaveValue(msg([text('one two')]));
  /* 編輯區外的快捷鍵 */
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('ControlOrMeta+y');
  await expect(output(page)).toHaveValue(msg([code(32, [text('one')]), text(' two')]));
  expect(errors).toEqual([]);
});

test('選取範圍：焦點離開編輯區後用最後一次的選取；從沒選取過時提示', async ({ page }) => {
  const errors = await open(page, { doc: [text('alpha beta')] });
  await classic(page, '紅色').click();
  await expect(page.getByText('先在編輯區選取要套用的文字。', { exact: true })).toBeVisible();
  await expect(output(page)).toHaveValue(msg([text('alpha beta')]));

  await select(page, 6, 10);
  /* 去改自訂色（焦點到色碼欄，瀏覽器的選取跟著離開編輯區） */
  await page.getByRole('textbox', { name: '自訂色 1', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => getSelection()?.anchorNode?.nodeName ?? ''))
    .not.toBe('#text');
  await customBtn(page, 4).click();
  await expect(output(page)).toHaveValue(
    msg([text('alpha '), rgb('#4040DE', true, [text('beta')])]),
  );
  expect(errors).toEqual([]);
});

test('字數：超過 2,000 字要 Nitro、超過 4,000 字送不出去', async ({ page }) => {
  /* 程式碼區塊的頭尾共 12 字 */
  const errors = await open(page, { doc: [text('a'.repeat(1988))] });
  const counter = page.getByTestId('dc-counter');
  await expect(counter).toHaveText('2,000/2,000');
  await expect(counter).toHaveAttribute('data-level', 'ok');
  await editor(page).focus();
  await select(page, 1988, 1988);
  await page.keyboard.type('b');
  await expect(counter).toHaveText('2,001/4,000（Nitro）');
  await expect(counter).toHaveAttribute('data-level', 'nitro');
  await expect(page.getByTestId('text-output-count')).toContainText('要 Nitro 才能送出');
  await select(page, 0, 1989);
  await page.keyboard.press('ControlOrMeta+c');
  await editor(page).focus();
  await select(page, 1989, 1989);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(counter).toHaveText('3,990/4,000（Nitro）');
  await page.keyboard.type('x'.repeat(11));
  await expect(counter).toHaveText('4,001/4,000（Nitro）');
  await expect(counter).toHaveAttribute('data-level', 'over');
  await expect(page.getByTestId('text-output-count')).toContainText('送不出去');
  expect(errors).toEqual([]);
});

test('複製：剪貼簿與輸出逐字相同；連續複製的提示一次比一次誇張，停 2 秒後重來', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await open(page);
  const copy = page.getByRole('button', { name: '複製', exact: true });
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(msg(defaultDoc()));
  await expect(page.getByText('已複製！', { exact: true })).toBeVisible();
  await copy.click();
  await expect(page.getByText('雙重複製！', { exact: true })).toBeVisible();
  await copy.click();
  await expect(page.getByText('三連複製！', { exact: true })).toBeVisible();
  await page.waitForTimeout(2300);
  await copy.click();
  await expect(page.getByText('已複製！', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('主宰全場！！')).toHaveCount(0);
  /* 第 12 次之後是 16 個隨機的漢字，每次重新產生（F28；7.1） */
  for (let i = 0; i < 10; i++) await copy.click();
  await expect(page.getByText('超越神的複製！！！！').last()).toBeVisible();
  const gibberish = page.getByText(/^[\u4e00-\u9fff]{16}$/);
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    await copy.click();
    await expect(gibberish.last()).toBeVisible();
    seen.add((await gibberish.last().textContent()) ?? '');
  }
  expect(seen.size).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('自動保存與專案檔：重新整理後保留；存檔、重設、開啟', async ({ page }) => {
  const errors = await open(page, { doc: [text('save me')] });
  await select(page, 0, 4);
  await classic(page, '粉紅色').click();
  await page.getByRole('textbox', { name: '自訂色 8', exact: true }).fill('#abcdef');
  const want = msg([code(35, [text('save')]), text(' me')]);
  await expect(output(page)).toHaveValue(want);
  await page.waitForTimeout(100);
  await page.reload();
  await expect(output(page)).toHaveValue(want);

  await page.getByRole('button', { name: '專案' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^Discord彩色文字_\d{8}\.json$/);
  const file = (await dl.path()) as string;
  const project = JSON.parse(readFileSync(file, 'utf8'));
  expect(project).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: 'discord-color',
    version: 1,
  });
  expect(project.data.doc).toEqual([code(35, [text('save')]), text(' me')]);
  expect(project.data.custom[7]).toBe('#ABCDEF');

  await page.getByRole('button', { name: '專案' }).click();
  await page.getByRole('menuitem', { name: '重設…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
  await expect(output(page)).toHaveValue(msg(defaultDoc()));

  await page.getByRole('button', { name: '專案' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles(file);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect(output(page)).toHaveValue(want);
  await expect(customBtn(page, 7)).toHaveAttribute('aria-label', '自訂色 8（#ABCDEF）');
  expect(errors).toEqual([]);
});

/* ---------- 與原作對照 ---------- */

/** mulberry32 */
function random(seedValue: number) {
  let s = seedValue;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Op =
  | { kind: 'style'; code: number }
  | { kind: 'classic' | 'custom'; index: number; fg: boolean }
  | { kind: 'effect'; id: 'rainbow' | 'gradient' | 'zebra'; fg: boolean };

async function openOriginal(page: Page, seedText: string) {
  await page.route(`**${ORIGINAL_URL}`, (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: readFileSync(ORIGINAL_HTML, 'utf8') }),
  );
  await page.goto(ORIGINAL_URL);
  await page.evaluate((t) => {
    (document.querySelector('#textarea') as HTMLElement).textContent = t;
  }, seedText);
}

async function applyBoth(ours: Page, orig: Page, given: Op, a: number, b: number) {
  let op = given;
  if (op.kind !== 'style') {
    await target(ours, op.fg ? 'fg' : 'bg');
    await orig.evaluate((fg) => {
      (document.querySelectorAll('.fgSwitch input')[fg ? 0 : 1] as HTMLInputElement).checked = true;
    }, op.fg);
  }
  await ours.evaluate(([x, y]) => selectIn('[data-dc-editor]', x, y), [a, b] as const);
  await orig.evaluate(([x, y]) => selectIn('#textarea', x, y), [a, b] as const);
  /* 只選到一個字時，原作的彩虹、漸層會輸出無效的 NaN 色碼（規格 5. D2，新版改用第一個顏色）：這裡改用斑馬 */
  if (op.kind === 'effect' && op.id !== 'zebra') {
    const graphemes = await orig.evaluate(
      () => [...new Intl.Segmenter().segment(getSelection()?.toString() ?? '')].length,
    );
    if (graphemes === 1) op = { ...op, id: 'zebra' };
  }
  if (op.kind === 'style') {
    await styleBtn(ours, op.code).click();
    await orig.locator(`.style-button[data-ansi="${op.code}"]`).click();
  } else if (op.kind === 'classic') {
    await styleBtn(ours, (op.fg ? 30 : 40) + op.index).click();
    await orig.locator(`.style-button[data-ansi="${30 + op.index}"]`).click();
  } else if (op.kind === 'custom') {
    await customBtn(ours, op.index).click();
    await orig.locator('#customColorBtns > button').nth(op.index).click();
  } else if (op.kind === 'effect') {
    await effectBtn(ours, op.id).click();
    await orig.locator(`.effect-button.fx-${op.id}`).click();
  }
}

/** 輸出裡看得到的文字（拿掉程式碼區塊的頭尾與 ANSI 碼） */
const ANSI_CODE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const visibleText = (message: string) =>
  message.slice('```ansi\n'.length, -'\n```'.length).replace(ANSI_CODE, '');

/**
 * 兩邊的全文相同；原作沒有吃字、吃換行時輸出逐字相同，原作吃掉了的時候（規格 3.5 的怪癖）
 * 新版照樣保留全文（5. D1 修正；7. 裁定）。回傳原作這一步有沒有出錯。
 */
async function expectSame(ours: Page, orig: Page, note: string): Promise<boolean> {
  const want = await orig.evaluate(() =>
    (window as unknown as { getANSIResult: () => string }).getANSIResult(),
  );
  /* 全文（換行在編輯區裡是 <br>，innerText 才看得到） */
  const text = await orig.locator('#textarea').evaluate((e) => (e as HTMLElement).innerText);
  await expect.poll(async () => visibleText(await output(ours).inputValue()), note).toBe(text);
  const lost = visibleText(want) !== text;
  if (!lost) await expect(output(ours), note).toHaveValue(want);
  const [a, b] = await Promise.all([
    ours.locator('[data-dc-editor]').evaluate((e) => e.textContent),
    orig.locator('#textarea').evaluate((e) => e.textContent),
  ]);
  expect(a, note).toBe(b);
  return lost;
}

/** 字素的交界（選取不會切開表情符號） */
const boundaries = (page: Page) =>
  page.evaluate(() => {
    const t = (document.querySelector('#textarea') as HTMLElement).textContent ?? '';
    const out = [0];
    for (const s of new Intl.Segmenter().segment(t)) out.push(s.index + s.segment.length);
    return out;
  });

test.describe('與原作對照', () => {
  test.setTimeout(240_000);
  const SEED = 'Roll for 先攻！ 🎲 d20\n第二行 abc xyz\nend';

  test('隨機的操作序列：每一步的輸出逐字相同', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`window.selectIn = ${selectIn.toString()}`);
    const ours = await ctx.newPage();
    const orig = await ctx.newPage();
    const errors: string[] = [];
    ours.on('pageerror', (e) => errors.push(e.message));
    await ours.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await seed(ours, { doc: [text(SEED)] }, true);
    const rand = random(20261009);
    const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
    const effects = ['rainbow', 'gradient', 'zebra'] as const;
    let ops = 0;
    for (let round = 0; round < 10; round++) {
      await ours.goto(URL);
      await openOriginal(orig, SEED);
      await expectSame(ours, orig, `round ${round} start`);
      for (let step = 0; step < 8; step++) {
        const r = rand();
        const fg = rand() < 0.6;
        const op: Op =
          r < 0.25
            ? { kind: 'style', code: pick([0, 1, 3, 4, 9]) }
            : r < 0.55
              ? { kind: 'classic', index: Math.floor(rand() * 8), fg }
              : r < 0.8
                ? { kind: 'custom', index: Math.floor(rand() * 8), fg }
                : { kind: 'effect', id: pick(effects), fg };
        const bounds = await boundaries(orig);
        let a = pick(bounds);
        let b = rand() < 0.1 ? a : pick(bounds);
        if (a > b) [a, b] = [b, a];
        await applyBoth(ours, orig, op, a, b);
        await expectSame(
          ours,
          orig,
          `round ${round} step ${step}: ${JSON.stringify(op)} [${a}, ${b}]`,
        );
        ops++;
      }
    }
    expect(ops).toBe(80);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('改過效果的顏色、打字與 Enter、跨行的效果：輸出逐字相同（原作吃掉換行的那一步新版保留）', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`window.selectIn = ${selectIn.toString()}`);
    const ours = await ctx.newPage();
    const orig = await ctx.newPage();
    await ours.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await seed(ours, { doc: [text('abc def')] });
    await ours.goto(URL);
    await openOriginal(orig, 'abc def');

    /* 打字與 Enter（原作在整頁按 Enter 都會在編輯區換行；兩邊都在編輯區裡打） */
    for (const page of [ours, orig]) {
      const sel = page === ours ? '[data-dc-editor]' : '#textarea';
      await page.locator(sel).focus();
      await page.evaluate((s) => selectIn(s, 7, 7), sel);
      await page.keyboard.type(' ghi');
      await page.keyboard.press('Enter');
      await page.keyboard.type('next line');
    }
    await expectSame(ours, orig, 'typed');

    /* 經典色、樣式之後再打字（原作的清理不會動到經典色與樣式） */
    await applyBoth(ours, orig, { kind: 'classic', index: 1, fg: true }, 0, 3);
    await applyBoth(ours, orig, { kind: 'style', code: 1 }, 2, 6);
    for (const page of [ours, orig]) {
      const sel = page === ours ? '[data-dc-editor]' : '#textarea';
      await page.locator(sel).focus();
      await page.evaluate((s) => selectIn(s, 1, 1), sel);
      await page.keyboard.type('Z');
    }
    await expectSame(ours, orig, 'typed inside formats');

    /* 改效果的顏色（原作用頁面上的變數） */
    await ours.getByRole('textbox', { name: '漸層：起點' }).fill('#102030');
    await ours.getByRole('textbox', { name: '漸層：終點' }).fill('#f0e0d0');
    await ours.getByRole('textbox', { name: '斑馬：顏色 1' }).fill('#010203');
    /* 原作頁面最上層的 const（不是 window 的屬性），要用字串在全域執行 */
    await orig.evaluate(
      "gradientColors[0] = '#102030'; gradientColors[1] = '#F0E0D0'; zebraColors[0] = '#010203';",
    );
    /* 跨行的效果（原作的換行在輸出裡消失：怪癖三；新版保留換行） */
    await applyBoth(ours, orig, { kind: 'effect', id: 'gradient', fg: true }, 4, 16);
    /* 原作在這一步吃掉換行（怪癖三），新版保留（D1） */
    expect(await expectSame(ours, orig, 'gradient across lines')).toBe(true);
    await applyBoth(ours, orig, { kind: 'effect', id: 'zebra', fg: false }, 0, 5);
    await expectSame(ours, orig, 'zebra');
    await applyBoth(ours, orig, { kind: 'effect', id: 'rainbow', fg: true }, 6, 20);
    await expectSame(ours, orig, 'rainbow');
    await ctx.close();
  });

  test('已知的差異：只選一個字套彩虹或漸層，原作輸出無效的 NaN 色碼、新版用第一個顏色（規格 5. D2）', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`window.selectIn = ${selectIn.toString()}`);
    const ours = await ctx.newPage();
    const orig = await ctx.newPage();
    await ours.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
    );
    await seed(ours, { doc: [text('ab')] });
    await ours.goto(URL);
    await openOriginal(orig, 'ab');
    await applyBoth(ours, orig, { kind: 'style', code: 1 }, 0, 1);
    await expectSame(ours, orig, 'bold');
    await ours.evaluate(() => selectIn('[data-dc-editor]', 1, 2));
    await orig.evaluate(() => selectIn('#textarea', 1, 2));
    await effectBtn(ours, 'rainbow').click();
    await orig.locator('.effect-button.fx-rainbow').click();
    const want = await orig.evaluate(() =>
      (window as unknown as { getANSIResult: () => string }).getANSIResult(),
    );
    /* 原作的色碼是 #NANNANNAN：前兩段解析成 NaN、最後一段「AN」解析成 10 */
    expect(want).toContain(`${E}[38;2;NaN;NaN;10mb`);
    await expect(output(ours)).toHaveValue(want.replace('NaN;NaN;10', '255;0;0'));
    await ctx.close();
  });
});

/* ---------- 版面 ---------- */

test('390 寬沒有橫向捲動；視覺基準 1280 與 390', async ({ page }) => {
  const errors = await open(page);
  await select(page, 2, 4);
  await classic(page, '紅色').click();
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    getSelection()?.removeAllRanges();
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const mask = [page.getByRole('status').filter({ hasText: '自動儲存' })];
  await expect(page).toHaveScreenshot('discord-color-1280.png', { fullPage: true, mask });
  await noHorizontalScroll(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await noHorizontalScroll(page);
  await expect(page).toHaveScreenshot('discord-color-390.png', { fullPage: true, mask });
  expect(errors).toEqual([]);
});

declare global {
  function selectIn(rootSel: string, a: number, b: number): void;
}
