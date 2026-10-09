/**
 * CoC 房規表產生器（建置產物 next/house-rules/）的端對端測試：
 * - 開頁沒有錯誤、頁尾只有靈感來源、群組分頁、預設 7 版、目錄與數量、輸出預覽；
 * - 版本切換、預設集（與復原）、規則列（選項、未設定、※ 的注記、數字選項、改名、眼睛、整個分類）、
 *   自己加的規則（新增、自由填寫、刪除與復原）、收合（記住、目錄點了會展開）；
 * - 輸出：純文字與 Markdown 的內容、包含注記／圖例、複製、下載 .txt／.md、PNG（尺寸、配色的像素、直式）、
 *   複製圖片、沒有規則時；
 * - 自動保存、壞掉的存檔、專案檔（存、開、壞檔）、Ctrl＋S、全部重來；
 * - 390 寬：沒有橫向捲動、目錄列黏在頂端、不放進表的列只留名稱、左右滑；1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('house-rules') ?? { id: 'house-rules', status: 'next' })}/`;
const KEY = 'trpg-toolkit:house-rules';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: 'CoC 房規表產生器' })).toBeVisible();
  return errors;
}

const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const row = (page: Page, key: string) => page.locator(`[data-row="${key}"]`);
const output = (page: Page) => page.getByTestId('hr-output');
const outText = (page: Page) => output(page).locator('textarea').inputValue();
const count = (page: Page, sec: string, cat: string) =>
  page.locator(`#hr-cat-${sec}-${cat}`).getByTestId('cat-count');

async function showText(page: Page) {
  await radio(page, '純文字').click();
  return outText(page);
}

interface Seed {
  /** 先把所有內建規則從表上拿掉 */
  hideAll?: boolean;
  info?: Record<string, string>;
  /** 區塊 → 規則 id → 要蓋上去的欄位 */
  rows?: Record<string, Record<string, Record<string, unknown>>>;
}

/** 直接改存檔再重新整理（先等開頁的存檔寫進去） */
async function seed(page: Page, edit: Seed) {
  /* 開頁還沒改過東西時存檔不存在：先改一下版本再改回來，讓存檔寫進去 */
  await radio(page, '6 版').click();
  await radio(page, '7 版').click();
  await page.waitForFunction((key) => localStorage.getItem(key) !== null, KEY);
  await page.evaluate(
    ([key, e]) => {
      const raw = JSON.parse(localStorage.getItem(key) as string);
      const d = raw.state.data;
      if (e.hideAll)
        for (const s of Object.values(d.secs) as { rows: Record<string, { vis: boolean }> }[])
          for (const r of Object.values(s.rows)) r.vis = false;
      if (e.info) Object.assign(d.info, e.info);
      for (const [sec, rows] of Object.entries(e.rows ?? {}))
        for (const [id, patch] of Object.entries(rows)) Object.assign(d.secs[sec].rows[id], patch);
      localStorage.setItem(key, JSON.stringify(raw));
    },
    [KEY, edit] as const,
  );
  await page.reload();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function pngOf(page: Page, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const bytes = new Uint8Array(readFileSync((await dl.path()) as string));
  const chunks = parseChunks(bytes);
  const ihdr = readIhdr(chunks);
  const idat = chunks.filter((c) => c.type === 'IDAT');
  const z = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
  let o = 0;
  for (const c of idat) {
    z.set(c.data, o);
    o += c.data.length;
  }
  const px = decodePixels(z, ihdr.width, ihdr.height, ihdr.colorType);
  const at = (x: number, y: number) =>
    Array.from(px.slice((y * ihdr.width + x) * 4, (y * ihdr.width + x) * 4 + 4));
  return { name: dl.suggestedFilename(), ihdr, at };
}

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、頁尾只有靈感來源、7 版、目錄與數量、PNG 預覽', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer')).toHaveText('靈感來源：くま。／CoCハウスルール表メーカー');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://kumachansteps.github.io/trpg-web-tools/',
    );
    await expect(page.getByRole('link', { name: 'CoC 擲骰工具' })).toBeVisible();
    await expect(radio(page, '7 版')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: 'CoC 7 版', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '各版通用', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CoC 6 版', level: 2 })).toHaveCount(0);
    await expect(count(page, '7', 'check')).toHaveText('表上 2／4 條');
    await expect(count(page, '7', 'creation')).toHaveText('表上 3／10 條');
    await expect(count(page, '7', 'table')).toHaveText('表上 0／0 條');
    const toc = page.locator('[data-toc="column"]');
    await expect(toc).toBeVisible();
    await expect(toc.getByRole('link')).toHaveText([
      /表的資訊/,
      /CoC 7 版/,
      /檢定與技能\s*2／4/,
      /理智與瘋狂\s*3／8/,
      /戰鬥\s*2／6/,
      /傷害與治療\s*2／4/,
      /成長與獎勵\s*2／4/,
      /建立調查員\s*3／10/,
      /其他房規\s*0／0/,
      /各版通用/,
      /擲骰\s*2／5/,
      /遊戲進行\s*1／3/,
      /參加的調查員\s*2／3/,
      /團錄與分享\s*0／2/,
      /其他備註/,
    ]);
    await expect(page.locator('[data-toc="strip"]')).toBeHidden();
    /* 開頁放進表的列：眼睛是開的、說明看得到 */
    await expect(btn(row(page, '7:push'), '放進表裡')).toHaveAttribute('aria-pressed', 'true');
    await expect(btn(row(page, '7:fumble7'), '放進表裡')).toHaveAttribute('aria-pressed', 'false');
    await expect(row(page, '7:push').getByText('檢定失敗後換個做法再擲一次')).toBeVisible();
    await expect(row(page, '7:fumble7').getByText('規則書：技能值未滿 50')).toBeHidden();
    /* 規則系統空白時顯示版本的名稱 */
    await expect(page.getByLabel('規則系統', { exact: true })).toHaveAttribute(
      'placeholder',
      'CoC 7 版',
    );
    await expect(page.getByLabel('更新日期', { exact: true })).not.toHaveValue('');
    const preview = page.getByTestId('png-preview');
    await expect(preview).toHaveAttribute('data-export-width', '1920');
    await expect(page.getByTestId('png-size')).toHaveText(/^1920 × \d+ px$/);
    expect(errors).toEqual([]);
  });

  test('版本：6 版、兩版並列；各版通用一直都在；規則系統的提示跟著換', async ({ page }) => {
    const errors = await open(page);
    await radio(page, '6 版').click();
    await expect(page.getByRole('heading', { name: 'CoC 6 版', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CoC 7 版', level: 2 })).toHaveCount(0);
    await expect(page.getByLabel('規則系統', { exact: true })).toHaveAttribute(
      'placeholder',
      'CoC 6 版',
    );
    expect(await showText(page)).toContain('規則系統：CoC 6 版\n');
    expect(await outText(page)).toContain('・檢定指令：CCB\n');
    await radio(page, '兩版並列').click();
    await expect(page.locator('section[id^="hr-sec-"] h2')).toHaveText([
      'CoC 6 版',
      'CoC 7 版',
      '各版通用',
    ]);
    expect(await outText(page)).toContain('規則系統：CoC 6 版／7 版\n');
    const text = await outText(page);
    expect(text.indexOf('■ CoC 6 版')).toBeLessThan(text.indexOf('■ CoC 7 版'));
    expect(text.indexOf('■ CoC 7 版')).toBeLessThan(text.indexOf('■ 各版通用'));
    expect(errors).toEqual([]);
  });

  test('預設集：線上團常見、全部清空、照規則書；復原（Ctrl＋Z）', async ({ page }) => {
    const errors = await open(page);
    await btn(page, '預設集').click();
    await page.getByRole('menuitem', { name: /線上團常見/ }).click();
    await expect(page.getByText('已套用「線上團常見」', { exact: true })).toBeVisible();
    await expect(btn(row(page, '7:luckspend'), '採用')).toHaveAttribute('aria-pressed', 'true');
    await expect(btn(row(page, '7:sancf'), '適用')).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, '7:skillcap').getByRole('button', { name: '80% 為止' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    /* 和規則書不同的規則也放進表 */
    await expect(btn(row(page, '7:luckrecover'), '放進表裡')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(count(page, '7', 'growth')).toHaveText('表上 3／4 條');

    await row(page, '7:push').getByLabel('注記', { exact: true }).fill('限一次');
    await btn(page, '預設集').click();
    await page.getByRole('menuitem', { name: /全部清空/ }).click();
    await expect(row(page, '7:push').getByLabel('注記', { exact: true })).toHaveValue('');
    await expect(row(page, '7:push').locator('[aria-pressed="true"][data-opt]')).toHaveCount(0);
    /* 放不放進表不變 */
    await expect(count(page, '7', 'growth')).toHaveText('表上 3／4 條');
    expect(await showText(page)).toContain('・孤注一擲：—\n');

    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect(row(page, '7:push').getByLabel('注記', { exact: true })).toHaveValue('限一次');
    await expect(btn(row(page, '7:luckspend'), '採用')).toHaveAttribute('aria-pressed', 'true');

    await btn(page, '預設集').click();
    await page.getByRole('menuitem', { name: /照規則書/ }).click();
    await expect(btn(row(page, '7:luckspend'), '不採用')).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, '7:push').getByLabel('注記', { exact: true })).toHaveValue('限一次');
    await expect(count(page, '7', 'growth')).toHaveText('表上 2／4 條');
    expect(errors).toEqual([]);
  });

  test('規則列：選項、再點一次變未設定、※ 移到注記、數字選項、改名、眼睛、整個分類', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 選別的選項：設定並放進表 */
    const f7 = row(page, '7:fumble7');
    await btn(f7, '只有 100').click();
    await expect(btn(f7, '只有 100')).toHaveAttribute('aria-pressed', 'true');
    await expect(btn(f7, '放進表裡')).toHaveAttribute('aria-pressed', 'true');
    await expect(count(page, '7', 'check')).toHaveText('表上 3／4 條');
    /* 再點一次：未設定，仍在表上 */
    await btn(f7, '只有 100').click();
    await expect(f7.locator('[aria-pressed="true"][data-opt]')).toHaveCount(0);
    expect(await showText(page)).toContain('・大失敗的範圍：—\n');

    /* ※：注記空白時焦點移到注記，提示改成請寫下改了什麼 */
    const push = row(page, '7:push');
    await btn(push, '有修改（見注記）').click();
    const note = push.getByLabel('注記', { exact: true });
    await expect(note).toBeFocused();
    await expect(note).toHaveAttribute('placeholder', '請寫下改了什麼');
    await page.keyboard.type('只限調查技能');
    expect(await outText(page)).toContain('・孤注一擲：※\n　└ 只限調查技能\n');

    /* 數字選項 */
    const reroll = row(page, '7:reroll');
    await reroll.getByRole('button', { name: '合計 3 次' }).click();
    const n = reroll.getByRole('spinbutton', { name: '合計重擲的次數' });
    await expect(n).toHaveValue('3');
    await n.fill('7');
    await n.press('Enter');
    await expect(reroll.getByRole('button', { name: '合計 7 次' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await n.fill('500');
    await n.press('Tab');
    await expect(n).toHaveValue('99');
    expect(await outText(page)).toContain('・屬性重擲：合計 99 次\n');
    /* 沒選的數字選項顯示預設值；換過去時沿用同一個數字 */
    await expect(reroll.getByRole('button', { name: '整組不限、單項 1 次' })).toBeVisible();
    await reroll.getByRole('button', { name: '整組不限、單項 1 次' }).click();
    await expect(reroll.getByRole('spinbutton', { name: '單項重擲的次數' })).toHaveValue('99');

    /* 改名、改回原本的名稱 */
    const name = push.getByLabel('規則名稱', { exact: true });
    await name.fill('');
    await expect(name).toHaveValue('');
    await name.fill('再拚一次');
    await name.blur();
    expect(await outText(page)).toContain('・再拚一次：※\n');
    await btn(push, '改回原本的名稱').click();
    await expect(name).toHaveValue('孤注一擲');
    await expect(btn(push, '改回原本的名稱')).toHaveCount(0);

    /* 眼睛 */
    await btn(push, '放進表裡').click();
    await expect(push).toHaveAttribute('data-visible', 'false');
    expect(await outText(page)).not.toContain('孤注一擲');

    /* 整個分類：不是全部在表上時「全部放進表裡」，之後變成「全部從表上拿掉」 */
    await btn(page, '全部放進表裡：檢定與技能').first().click();
    await expect(count(page, '7', 'check')).toHaveText('表上 4／4 條');
    await btn(page, '全部從表上拿掉：檢定與技能').first().click();
    await expect(count(page, '7', 'check')).toHaveText('表上 0／4 條');
    expect(await outText(page)).not.toContain('◆ 檢定與技能');
    expect(errors).toEqual([]);
  });

  test('自己加的規則：新增、名稱、自由填寫、※、刪除與復原', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '新增規則到「各版通用・擲骰」' }).click();
    const custom = page.locator('[data-row^="common:"][data-custom]');
    await expect(custom).toHaveCount(1);
    const name = custom.getByLabel('規則名稱', { exact: true });
    await expect(name).toBeFocused();
    await expect(btn(custom, '採用')).toHaveAttribute('aria-pressed', 'true');
    await expect(count(page, 'common', 'dice')).toHaveText('表上 3／6 條');
    expect(await showText(page)).toContain('・新規則：○\n');
    await name.fill('骰子顏色');
    await btn(custom, '自由填寫').click();
    const free = custom.getByLabel('設定的內容', { exact: true });
    await expect(free).toBeFocused();
    await free.fill('每人自選');
    expect(await outText(page)).toContain(
      '・暗骰：KP 代擲\n・同一個檢定重擲：不行\n・骰子顏色：每人自選\n',
    );
    await free.fill('');
    expect(await outText(page)).toContain('・骰子顏色：—\n');
    await btn(custom, '有修改（見注記）').click();
    await expect(custom.getByLabel('注記', { exact: true })).toBeFocused();
    await btn(custom, '刪除這條規則').click();
    await expect(page.getByText('已刪除規則', { exact: true })).toBeVisible();
    await expect(custom).toHaveCount(0);
    await btn(page, '復原（Ctrl＋Z）').click();
    await expect(custom).toHaveCount(1);
    await expect(custom.getByLabel('規則名稱', { exact: true })).toHaveValue('骰子顏色');
    expect(errors).toEqual([]);
  });

  test('自己加的規則：一區滿 200 條時新增會說明（7.1）', async ({ page }) => {
    const errors = await open(page);
    await seed(page, {});
    await page.evaluate((key) => {
      const raw = JSON.parse(localStorage.getItem(key) as string);
      raw.state.data.secs.common.custom = Array.from({ length: 200 }, (_, i) => ({
        id: `c${i}`,
        cat: 'dice',
        name: `規則 ${i + 1}`,
        val: 'o',
        text: '',
        note: '',
        vis: false,
      }));
      localStorage.setItem(key, JSON.stringify(raw));
    }, KEY);
    await page.reload();
    const custom = page.locator('[data-row^="common:"][data-custom]');
    await expect(custom).toHaveCount(200);
    await page.getByRole('button', { name: '新增規則到「各版通用・擲骰」' }).click();
    await expect(page.getByText('這一區已經有 200 條自己加的規則，不能再加了。').first()).toBeVisible();
    await expect(custom).toHaveCount(200);
    expect(errors).toEqual([]);
  });

  test('收合分類：記住；目錄點收合的分類會展開並捲過去', async ({ page }) => {
    const errors = await open(page);
    const head = page
      .locator('#hr-cat-7-combat')
      .getByRole('button', { name: '戰鬥', exact: true });
    await head.click();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, '7:init')).toHaveCount(0);
    await page.waitForTimeout(100);
    await page.reload();
    await expect(head).toHaveAttribute('aria-expanded', 'false');
    await page.locator('[data-toc="column"]').getByRole('link', { name: /^戰鬥/ }).click();
    await expect(head).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, '7:init')).toBeInViewport();
    await expect(
      page.locator('[data-toc="column"]').getByRole('link', { name: /^戰鬥/ }),
    ).toHaveAttribute('aria-current', 'location');
    /* 收合不算一步復原 */
    await expect(btn(page, '復原（Ctrl＋Z）')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test.describe('剪貼簿', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('輸出：純文字與 Markdown、包含注記／圖例、複製、下載', async ({ page }) => {
      const errors = await open(page);
      await seed(page, {
        hideAll: true,
        info: {
          title: '週五團',
          kp: '阿明',
          scenario: '雨夜',
          date: '2026-10-01',
          remarks: '有問題問我',
        },
        rows: {
          '7': { push: { val: 'm', vis: true, note: '限一次\n要說理由' }, init: { vis: true } },
        },
      });
      const expected = [
        '【週五團】',
        'KP：阿明',
        '規則系統：CoC 7 版',
        '適用劇本：雨夜',
        '更新日期：2026.10.01',
        '',
        '■ CoC 7 版',
        '◆ 檢定與技能',
        '・孤注一擲：※',
        '　└ 限一次',
        '　　要說理由',
        '◆ 戰鬥',
        '・行動順序：依 DEX 高低',
        '',
        '■ 其他備註',
        '有問題問我',
        '',
        '○ 採用　× 不採用　※ 有修改（見注記）',
        '',
      ].join('\n');
      expect(await showText(page)).toBe(expected);
      await expect(output(page).getByText('貼到 Discord 建議用這個格式。')).toBeVisible();
      await btn(output(page), '複製').click();
      await expect(page.getByText('已複製到剪貼簿').first()).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
      const [dl] = await Promise.all([
        page.waitForEvent('download'),
        btn(output(page), '下載 .txt').click(),
      ]);
      expect(dl.suggestedFilename()).toBe('週五團_20261001.txt');
      expect(readFileSync((await dl.path()) as string, 'utf8')).toBe(expected);

      await page.getByRole('checkbox', { name: '包含注記' }).click();
      await page.getByRole('checkbox', { name: '包含圖例' }).click();
      expect(await outText(page)).not.toContain('限一次');
      expect(await outText(page)).not.toContain('○ 採用');
      await page.getByRole('checkbox', { name: '包含注記' }).click();
      await page.getByRole('checkbox', { name: '包含圖例' }).click();

      await radio(page, 'Markdown').click();
      const md = await outText(page);
      expect(md).toBe(
        [
          '# 週五團',
          '',
          '**KP**：阿明  ',
          '**規則系統**：CoC 7 版  ',
          '**適用劇本**：雨夜  ',
          '**更新日期**：2026.10.01',
          '',
          '## CoC 7 版',
          '',
          '### 檢定與技能',
          '',
          '| 規則 | 設定 | 注記 |',
          '| --- | :---: | --- |',
          '| 孤注一擲 | ※ | 限一次<br>要說理由 |',
          '',
          '### 戰鬥',
          '',
          '| 規則 | 設定 | 注記 |',
          '| --- | :---: | --- |',
          '| 行動順序 | 依 DEX 高低 |  |',
          '',
          '## 其他備註',
          '',
          '有問題問我',
          '',
          '> ○ 採用　× 不採用　※ 有修改（見注記）',
          '',
        ].join('\n'),
      );
      const [dl2] = await Promise.all([
        page.waitForEvent('download'),
        btn(output(page), '下載 .md').click(),
      ]);
      expect(dl2.suggestedFilename()).toBe('週五團_20261001.md');
      /* 選的格式記住 */
      await page.waitForTimeout(100);
      await page.reload();
      await expect(radio(page, 'Markdown')).toHaveAttribute('aria-checked', 'true');
      expect(errors).toEqual([]);
    });

    test('PNG：下載（2 倍）、配色、直式、複製圖片', async ({ page }) => {
      const errors = await open(page);
      await page.getByLabel('更新日期', { exact: true }).fill('2026-10-01');
      const preview = page.getByTestId('png-preview');
      await expect(preview).toHaveAttribute('data-export-width', '1920');
      const h = Number(await preview.getAttribute('data-export-height'));
      const dark = await pngOf(page, () => btn(output(page), '下載 PNG').click());
      expect(dark.name).toBe('房規表_20261001.png');
      expect([dark.ihdr.width, dark.ihdr.height]).toEqual([1920, h]);
      /* 左上：最上面的色條（主色）；往下：深色的底 */
      expect(dark.at(10, 4)).toEqual([0xb7, 0x9c, 0xe0, 255]);
      expect(dark.at(10, 40)).toEqual([0x17, 0x16, 0x1c, 255]);

      await radio(page, '淺色').click();
      await radio(page, '直式').click();
      await expect(preview).toHaveAttribute('data-export-width', '1200');
      const light = await pngOf(page, () => btn(output(page), '下載 PNG').click());
      expect(light.ihdr.width).toBe(1200);
      expect(light.ihdr.height).toBe(Number(await preview.getAttribute('data-export-height')));
      expect(light.at(10, 40)).toEqual([255, 255, 255, 255]);

      /* 有注記時橫式多一欄，比較寬的注記欄讓表變矮或一樣；圖例拿掉時變矮 */
      await radio(page, '橫式').click();
      await expect(preview).toHaveAttribute('data-export-width', '1920');
      const before = Number(await preview.getAttribute('data-export-height'));
      await page.getByRole('checkbox', { name: '包含圖例' }).click();
      await expect
        .poll(async () => Number(await preview.getAttribute('data-export-height')))
        .toBeLessThan(before);

      await btn(output(page), '複製圖片').click();
      await expect(page.getByText('已複製圖片', { exact: true })).toBeVisible();
      const types = await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        return items.flatMap((i) => i.types);
      });
      expect(types).toContain('image/png');

      await btn(output(page), '放大檢視').click();
      await expect(
        page.getByRole('dialog', { name: '預覽（PNG）' }).getByRole('img'),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });

  test('表上沒有規則時：說明、沒有下載鈕', async ({ page }) => {
    const errors = await open(page);
    await seed(page, { hideAll: true });
    await expect(output(page).getByText('表上還沒有規則。')).toBeVisible();
    await expect(btn(output(page), '下載 PNG')).toHaveCount(0);
    await radio(page, '純文字').click();
    await expect(output(page).locator('textarea')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('自動保存、壞掉的存檔、專案檔（存、開、壞檔）、Ctrl＋S、全部重來', async ({ page }) => {
    const errors = await open(page);
    await page.getByLabel('表的標題').fill('存檔測試');
    await radio(page, '兩版並列').click();
    await btn(row(page, '6:cmd'), 'CC').click();
    await page.waitForTimeout(100);
    await page.reload();
    await expect(page.getByLabel('表的標題')).toHaveValue('存檔測試');
    await expect(radio(page, '兩版並列')).toHaveAttribute('aria-checked', 'true');
    await expect(btn(row(page, '6:cmd'), 'CC')).toHaveAttribute('aria-pressed', 'true');

    /* 專案檔 */
    await page.getByLabel('更新日期', { exact: true }).fill('2026-10-01');
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe('存檔測試_20261001.json');
    const path = (await dl.path()) as string;
    const project = JSON.parse(readFileSync(path, 'utf8'));
    expect(project).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'house-rules',
      version: 1,
    });
    expect(project.data).toMatchObject({ edition: 'both', info: { title: '存檔測試' } });
    expect(project.data.secs['6'].rows.cmd).toMatchObject({ val: 'cc', vis: true });

    /* Ctrl＋S（文字欄裡也可以） */
    await page.getByLabel('表的標題').focus();
    const [dl2] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    expect(dl2.suggestedFilename()).toBe('存檔測試_20261001.json');
    expect(JSON.parse(readFileSync((await dl2.path()) as string, 'utf8')).data).toEqual(
      project.data,
    );

    /* 全部重來（可以復原） */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    await expect(page.getByLabel('表的標題')).toHaveValue('');
    await expect(radio(page, '7 版')).toHaveAttribute('aria-checked', 'true');

    /* 開啟專案檔 */
    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(path);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(page.getByLabel('表的標題')).toHaveValue('存檔測試');
    await expect(btn(row(page, '6:cmd'), 'CC')).toHaveAttribute('aria-pressed', 'true');

    /* 別的工具的專案檔 */
    await btn(page, '專案').click();
    const [chooser2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser2.setFiles({
      name: 'other.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ format: 'trpg-toolkit-project', tool: 'coc-npc', version: 1, data: {} }),
      ),
    });
    await expect(page.getByText('無法開啟專案檔', { exact: true })).toBeVisible();
    await expect(page.getByLabel('表的標題')).toHaveValue('存檔測試');

    /* 壞掉的存檔：當作沒有存檔 */
    await page.evaluate((k) => localStorage.setItem(k, '{broken'), KEY);
    await page.reload();
    await expect(page.getByLabel('表的標題')).toHaveValue('');
    await expect(count(page, '7', 'check')).toHaveText('表上 2／4 條');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await page.getByLabel('表的標題').fill('週五團的房規');
    await page.getByLabel('KP', { exact: true }).fill('阿明');
    await page.getByLabel('更新日期', { exact: true }).fill('2026-10-01');
    await btn(row(page, '7:luckspend'), '有修改（見注記）').click();
    await page.keyboard.type('每次最多 10 點');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('house-rules-1280.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('1100 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1100, height: 800 } });

  test('目錄改成上方的橫向列，捲動時黏在頁首下方', async ({ page }) => {
    const errors = await open(page);
    const strip = page.locator('[data-toc="strip"]');
    await expect(strip).toBeVisible();
    await expect(page.locator('[data-toc="column"]')).toBeHidden();
    await strip.getByRole('link', { name: '各版通用' }).click();
    await expect(page.getByRole('heading', { name: '各版通用', level: 2 })).toBeInViewport();
    const headerBottom = await page
      .locator('body header')
      .evaluate((h) => h.getBoundingClientRect().bottom);
    const stripTop = await strip.evaluate((s) => s.getBoundingClientRect().top);
    expect(Math.abs(stripTop - headerBottom)).toBeLessThan(2);
    await expect(strip.getByRole('link', { name: '各版通用' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  /** 用觸控在一列上左右滑 */
  async function swipe(target: Locator, dx: number) {
    await target.scrollIntoViewIfNeeded();
    await target.evaluate((el, d) => {
      const r = el.getBoundingClientRect();
      const x = r.left + 30;
      const y = r.top + 10;
      const fire = (type: string, cx: number) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerType: 'touch',
            pointerId: 7,
            clientX: cx,
            clientY: y,
          }),
        );
      fire('pointerdown', x);
      for (let i = 1; i <= 5; i++) fire('pointermove', x + (d * i) / 5);
      fire('pointerup', x + d);
    }, dx);
  }

  test('沒有橫向捲動、目錄列、不放進表的列只留名稱、左右滑；視覺回歸', async ({ page }) => {
    const errors = await open(page);
    await noHorizontalScroll(page);
    const strip = page.locator('[data-toc="strip"]');
    await expect(strip).toBeVisible();
    await expect(strip.getByRole('link', { name: '輸出' })).toBeVisible();
    /* 不放進表的列：選項與注記收起來 */
    await expect(row(page, '7:fumble7').getByRole('button', { name: '只有 100' })).toBeHidden();
    await expect(btn(row(page, '7:push'), '採用')).toBeVisible();

    /* 往右滑：切換放不放進表 */
    await swipe(row(page, '7:fumble7'), 100);
    await expect(row(page, '7:fumble7')).toHaveAttribute('data-visible', 'true');
    await expect(page.getByText('已放進表裡', { exact: true })).toBeVisible();
    /* 內建規則往左滑不會刪除 */
    await swipe(row(page, '7:fumble7'), -100);
    await expect(row(page, '7:fumble7')).toHaveCount(1);
    /* 自己加的規則往左滑刪除 */
    await page.getByRole('button', { name: '新增規則到「CoC 7 版・檢定與技能」' }).click();
    const custom = page.locator('[data-row^="7:"][data-custom]');
    await expect(custom).toHaveCount(1);
    await custom.getByLabel('規則名稱', { exact: true }).blur();
    await swipe(custom, -100);
    await expect(custom).toHaveCount(0);
    await expect(page.getByText('已刪除規則', { exact: true })).toBeVisible();
    /* 往上下移動的不算 */
    await row(page, '7:push').evaluate((el) => {
      const r = el.getBoundingClientRect();
      const fire = (type: string, cx: number, cy: number) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerType: 'touch',
            pointerId: 8,
            clientX: cx,
            clientY: cy,
          }),
        );
      fire('pointerdown', r.left + 30, r.top + 10);
      fire('pointermove', r.left + 32, r.top + 40);
      fire('pointermove', r.left + 130, r.top + 60);
      fire('pointerup', r.left + 130, r.top + 60);
    });
    await expect(row(page, '7:push')).toHaveAttribute('data-visible', 'true');

    /* 目錄列黏在畫面頂端 */
    await page.evaluate(() => window.scrollTo(0, 2500));
    await expect
      .poll(() => strip.evaluate((s) => Math.round(s.getBoundingClientRect().top)))
      .toBe(0);
    await noHorizontalScroll(page);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByLabel('更新日期', { exact: true }).fill('2026-10-01');
    await page.getByLabel('更新日期', { exact: true }).blur();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('house-rules-390.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    /* 規則列（窄畫面：名稱與眼睛一行、選項一行、注記一行；目錄列黏在頂端） */
    await page.evaluate(() => {
      const el = document.getElementById('hr-cat-7-check');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
    });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('house-rules-390-rows.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});

test('開啟原作的房規表檔（.hrt.json）：取代目前的表、可以復原；不是房規表檔時說明（7. 裁定 D6）', async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByLabel('表的標題').fill('目前的表');
  await page.getByLabel('表的標題').blur();
  /* 原作的檔案：{ app, version, savedAt, state }，state 的結構和本工具相同 */
  await expect
    .poll(async () => page.evaluate((k) => localStorage.getItem(k) ?? '', KEY))
    .toContain('目前的表');
  const state = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? '{}').state.data,
    KEY,
  );
  state.info.title = '原作的表';
  const openOriginal = async (name: string, body: string) => {
    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟原作的房規表檔（.hrt.json）…' }).click(),
    ]);
    await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(body) });
  };
  await openOriginal(
    '週五團.hrt.json',
    JSON.stringify({ app: 'house-rule-table', version: 1, savedAt: '', state }),
  );
  await expect(page.getByLabel('表的標題')).toHaveValue('原作的表');
  await expect(page.getByText('已開啟「週五團.hrt.json」').first()).toBeVisible();
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(page.getByLabel('表的標題')).toHaveValue('目前的表');
  await openOriginal('other.json', JSON.stringify({ app: 'other' }));
  await expect(page.getByText(/「other\.json」不是房規表檔/).first()).toBeVisible();
  await expect(page.getByLabel('表的標題')).toHaveValue('目前的表');
  expect(errors).toEqual([]);
});
