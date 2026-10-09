/**
 * CoC NPC 產生器（建置產物 tools/coc-npc/）的端對端測試。亂數用頁面上的注入點 `window.__cocRandom` 固定：
 * - 開頁沒有錯誤、頁尾只有靈感來源、開頁的 NPC 與輸出；
 * - 照舊版的操作做出同一個 NPC，CCFOLIA 角色 JSON 與聊天面板和舊版逐字相同（tests/unit/fixtures/coc-npc-legacy.json）；
 * - 單項擲、全部擲骰（快捷鍵 R）、看不懂的算式、衍生值自動算與手改、版本切換、SAN 開關、MOV；
 * - NPC 清單：新增、切換、刪除（至少留一個）、版本徽章；窄畫面清單預設收合；
 * - 複製、擲骰並複製；舊存檔搬移；復原、自動保存、專案檔；390 寬沒有橫向捲動；1280／390 視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('coc-npc') ?? { id: 'coc-npc', status: 'next' })}/`;

interface LegacyCase {
  input: {
    edition: 7 | 6;
    dice: Record<string, string>;
    name: string;
    skills: [string, string][];
    commands: [string, string][];
    memo: string;
    mov: string;
    sanOff?: boolean;
    ccb?: boolean;
  };
  json: string;
  palette: string;
}
const LEGACY = JSON.parse(
  readFileSync(new globalThis.URL('../unit/fixtures/coc-npc-legacy.json', import.meta.url), 'utf8'),
) as { seq: number[]; cases: Record<string, LegacyCase> };

/** 讓一顆 sides 面骰擲出 face 的亂數 */
const r = (face: number, sides: number) => (face - 0.5) / sides;

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
  await expect(page.getByRole('heading', { level: 1, name: 'CoC NPC 產生器' })).toBeVisible();
  return errors;
}

async function setRandom(page: Page, values: number[]) {
  await page.evaluate((seq) => {
    let i = 0;
    (window as unknown as { __cocRandom: () => number }).__cocRandom = () => seq[i++ % seq.length];
  }, values);
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const output = (page: Page) => page.getByTestId('npc-output').locator('textarea');
const listItems = (page: Page) =>
  page.getByRole('list', { name: 'NPC 清單' }).getByRole('listitem');

async function json(page: Page) {
  await page.getByRole('radio', { name: 'CCFOLIA' }).click();
  return JSON.parse(await output(page).inputValue());
}

async function palette(page: Page) {
  await page.getByRole('radio', { name: '聊天面板' }).click();
  return output(page).inputValue();
}

/** 照舊版頁面上的操作順序填好（附件的輸入） */
async function fillLike(page: Page, c: LegacyCase['input']) {
  if (c.edition === 6) await page.getByRole('radio', { name: '6 版' }).click();
  await field(page, '名稱').fill(c.name);
  for (const [k, v] of Object.entries(c.dice)) await field(page, `${k} 的算式`).fill(v);
  for (let i = 0; i < c.skills.length; i++) {
    if (i > 0) await btn(page, '新增技能').click();
    await field(page, `技能 ${i + 1}：名稱`).fill(c.skills[i][0]);
    await field(page, `技能 ${i + 1}：成功率`).fill(c.skills[i][1]);
  }
  if (!c.skills.length) await btn(page, '刪除技能 1').click();
  for (let i = 0; i < c.commands.length; i++) {
    if (i > 0) await btn(page, '新增指令').click();
    await field(page, `指令 ${i + 1}：名稱`).fill(c.commands[i][0]);
    await field(page, `指令 ${i + 1}：算式`).fill(c.commands[i][1]);
  }
  if (!c.commands.length) await btn(page, '刪除指令 1').click();
  await field(page, '備註').fill(c.memo);
  await field(page, c.edition === 7 ? 'MOV' : '移動力').fill(c.mov);
  if (c.sanOff) await page.getByRole('switch', { name: '輸出 SAN' }).click();
  if (c.ccb) await page.getByRole('radio', { name: 'CCB' }).click();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、頁尾只有靈感來源、開頁的 NPC 與輸出', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer')).toHaveText('靈感來源：ihoukentiku/ihoukentiku.github.io');
    await expect(page.getByRole('link', { name: 'CoC 擲骰工具' })).toBeVisible();
    await expect(listItems(page)).toHaveCount(1);
    await expect(listItems(page).first()).toContainText('7 版');
    await expect(listItems(page).first()).toContainText('新 NPC');
    /* 只剩一個時不能刪 */
    await expect(page.getByRole('button', { name: /^刪除「/ })).toHaveCount(0);
    const data = (await json(page)).data;
    expect(data).toMatchObject({ name: '新 NPC', initiative: 0, externalUrl: '', memo: '' });
    expect(data.status).toEqual([
      { label: 'HP', value: 0, max: 0 },
      { label: 'MP', value: 0, max: 0 },
      { label: 'SAN', value: 0, max: 0 },
    ]);
    expect(data.params.at(-1)).toEqual({ label: '體格', value: '0' });
    expect(errors).toEqual([]);
  });

  for (const id of ['v7', 'v6-ccb-nosan', 'v7-empty']) {
    test(`與舊版逐字相同的輸出：${id}`, async ({ page }) => {
      const errors = await open(page);
      const c = LEGACY.cases[id];
      await fillLike(page, c.input);
      await setRandom(page, LEGACY.seq);
      await btn(page, '全部擲骰').click();
      await page.getByRole('radio', { name: 'CCFOLIA' }).click();
      await expect(output(page)).toHaveValue(c.json);
      await page.getByRole('radio', { name: '聊天面板' }).click();
      await expect(output(page)).toHaveValue(c.palette);
      expect(errors).toEqual([]);
    });
  }

  test('擲屬性、衍生值自動算與手改、版本、SAN、MOV、指令的 DB', async ({ page }) => {
    const errors = await open(page);
    /* 單項擲：7 版 ×5，衍生值跟著算 */
    await field(page, 'STR 的算式').fill('3D6');
    await field(page, 'SIZ 的算式').fill('2D6+6');
    await field(page, 'CON 的算式').fill('3d6');
    await setRandom(page, [r(6, 6), r(5, 6), r(4, 6)]);
    await btn(page, 'STR 擲骰').click();
    await expect(field(page, 'STR 的值')).toHaveValue('75');
    await setRandom(page, [r(3, 6), r(3, 6)]);
    await btn(page, 'SIZ 擲骰').click();
    await expect(field(page, 'SIZ 的值')).toHaveValue('60');
    /* STR＋SIZ＝135 → +1D4、體格 1 */
    await expect(field(page, 'DB')).toHaveValue('+1D4');
    await expect(field(page, '體格')).toHaveValue('1');
    await expect(field(page, 'HP')).toHaveValue('6');

    /* 手改衍生值 → 輸出照手改；之後改屬性又重算 */
    await field(page, 'HP').fill('20');
    expect((await json(page)).data.status[0]).toEqual({ label: 'HP', value: 20, max: 20 });
    await field(page, 'CON 的值').fill('50');
    await expect(field(page, 'HP')).toHaveValue('11');

    /* 看不懂的算式：顯示錯誤、擲骰鈕停用；全部擲骰跳過它並說明 */
    await field(page, 'POW 的算式').fill('(2D6+6)');
    await expect(page.getByTestId('ability-POW')).toContainText('看不懂這個算式');
    await expect(btn(page, 'POW 擲骰')).toBeDisabled();
    await setRandom(page, [0.5]);
    await btn(page, '全部擲骰').click();
    await expect(page.getByText('POW 的算式看不懂，沒有擲；其他的已經擲好。')).toBeVisible();
    await field(page, 'POW 的算式').fill('');

    /* 快捷鍵 R：全部擲骰 */
    await setRandom(page, [r(1, 6)]);
    await page.locator('body').click({ position: { x: 5, y: 500 } });
    await page.keyboard.press('r');
    await expect(field(page, 'STR 的值')).toHaveValue('15');
    await expect(field(page, 'CON 的值')).toHaveValue('15');

    /* SAN 開關 */
    await field(page, 'POW 的值').fill('55');
    await expect(field(page, 'SAN')).toHaveValue('55');
    await page.getByRole('switch', { name: '輸出 SAN' }).click();
    await expect(field(page, 'SAN')).toBeDisabled();
    expect((await json(page)).data.status.map((s: { label: string }) => s.label)).toEqual([
      'HP',
      'MP',
    ]);
    expect(await palette(page)).not.toContain('理智檢定');
    await page.getByRole('switch', { name: '輸出 SAN' }).click();
    expect((await palette(page)).split('\n')[0]).toBe('CC<=55 理智檢定');

    /* MOV */
    await field(page, 'MOV').fill('8');
    expect((await json(page)).data.params.at(-1)).toEqual({ label: 'MOV', value: '8' });
    expect(await palette(page)).toContain('//MOV=8');

    /* 指令：DB → {DB}；有名稱時「算式 名稱」 */
    await field(page, '指令 1：名稱').fill('拳擊');
    await field(page, '指令 1：算式').fill('1D3+db');
    expect((await palette(page)).split('\n')).toContain('1D3+{DB} 拳擊');

    /* 6 版：沒有體格、移動力、CC／CCB、檢定值 ×5（屬性的值不換算） */
    await page.getByRole('radio', { name: '6 版' }).click();
    await expect(field(page, '體格')).toHaveCount(0);
    await expect(field(page, '移動力')).toHaveValue('8');
    await expect(field(page, 'STR 的值')).toHaveValue('15');
    await expect(field(page, 'SAN')).toHaveValue('275');
    await page.getByRole('radio', { name: 'CCB' }).click();
    const p6 = (await palette(page)).split('\n');
    expect(p6[0]).toBe('CCB<=275 理智檢定');
    expect(p6[1]).toBe('CCB<=75 STR');
    expect(p6).toContain('//移動力=8');
    expect((await json(page)).data.params.map((x: { label: string }) => x.label)).not.toContain(
      '體格',
    );
    await expect(listItems(page).first()).toContainText('6 版');
    expect(errors).toEqual([]);
  });

  test('NPC 清單：新增（同版本）、切換、刪除；名稱空白是「無名氏」', async ({ page }) => {
    const errors = await open(page);
    await field(page, '名稱').fill('甲');
    await page.getByRole('radio', { name: '6 版' }).click();
    await btn(page, '新增 NPC').click();
    await expect(listItems(page)).toHaveCount(2);
    await expect(field(page, '名稱')).toHaveValue('新 NPC');
    await expect(page.getByRole('radio', { name: '6 版' })).toBeChecked();
    await field(page, '名稱').fill('');
    await expect(listItems(page).nth(1)).toContainText('無名氏');
    expect((await json(page)).data.name).toBe('無名氏');
    await field(page, '名稱').fill('乙');

    /* 切換 */
    await listItems(page).first().getByRole('button', { name: '甲', exact: true }).click();
    await expect(field(page, '名稱')).toHaveValue('甲');
    expect((await json(page)).data.name).toBe('甲');

    /* 刪掉目前的 → 切到第一個；只剩一個時不能刪 */
    await btn(page, '刪除「甲」').click();
    await expect(listItems(page)).toHaveCount(1);
    await expect(field(page, '名稱')).toHaveValue('乙');
    await expect(page.getByRole('button', { name: /^刪除「/ })).toHaveCount(0);

    /* 復原：甲回來 */
    await page.locator('body').click({ position: { x: 5, y: 500 } });
    await page.keyboard.press('Control+z');
    await expect(listItems(page)).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test.describe('剪貼簿', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('複製、擲骰並複製（先全部擲骰再複製）', async ({ page }) => {
      const errors = await open(page);
      await field(page, 'STR 的算式').fill('3D6');
      await btn(page, '複製').click();
      await expect(page.getByText('已複製到剪貼簿').first()).toBeVisible();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(JSON.parse(copied).data.params[0]).toEqual({ label: 'STR', value: '0' });

      await page.getByRole('radio', { name: '聊天面板' }).click();
      await setRandom(page, [r(4, 6)]);
      await btn(page, '擲骰並複製').click();
      await expect(page.getByText('已全部擲骰並複製到剪貼簿').first()).toBeVisible();
      const text = await page.evaluate(() => navigator.clipboard.readText());
      expect(text.split('\n')).toContain('CC<=60 STR');
      expect(text).toBe(await output(page).inputValue());
      expect(errors).toEqual([]);
    });

    test('7.1 F13：按鈕、快捷鍵 R、擲骰並複製都說明跳過的項目；改好的不再列、全部擲成功時清掉', async ({
      page,
    }) => {
      const errors = await open(page);
      const notice = page.getByTestId('roll-skipped');
      await field(page, 'STR 的算式').fill('3D6');
      await field(page, 'POW 的算式').fill('(2D6+6)');
      await field(page, 'EDU 的算式').fill('abc');
      await expect(notice).toBeEmpty();

      /* 快捷鍵 R */
      await setRandom(page, [r(2, 6)]);
      await page.locator('body').click({ position: { x: 5, y: 500 } });
      await page.keyboard.press('r');
      await expect(field(page, 'STR 的值')).toHaveValue('30');
      await expect(notice).toHaveText('POW、EDU 的算式看不懂，沒有擲；其他的已經擲好。');
      /* 改好 EDU（不必再擲）：只剩 POW；清空 POW：說明消失 */
      await field(page, 'EDU 的算式').fill('3D6');
      await expect(notice).toHaveText('POW 的算式看不懂，沒有擲；其他的已經擲好。');
      await field(page, 'POW 的算式').fill('');
      await expect(notice).toBeEmpty();

      /* 擲骰並複製：通知也說明跳過的項目，畫面上的說明一致 */
      await field(page, 'APP 的算式').fill('3D6×5');
      await btn(page, '擲骰並複製').click();
      const toast = page
        .getByRole('status')
        .filter({ hasText: '已全部擲骰並複製到剪貼簿' })
        .first();
      await expect(toast).toContainText('APP 的算式看不懂，沒有擲');
      await expect(notice).toHaveText('APP 的算式看不懂，沒有擲；其他的已經擲好。');

      /* 全部擲成功（按鈕）：說明清掉 */
      await field(page, 'APP 的算式').fill('3D6');
      await field(page, 'POW 的算式').fill('(2D6+6)');
      await btn(page, '全部擲骰').click();
      await expect(notice).toHaveText('POW 的算式看不懂，沒有擲；其他的已經擲好。');
      await field(page, 'POW 的算式').fill('3D6');
      await page.locator('body').click({ position: { x: 5, y: 500 } });
      await page.keyboard.press('r');
      await expect(notice).toBeEmpty();

      /* 換 NPC 時清掉 */
      await field(page, 'POW 的算式').fill('x');
      await btn(page, '全部擲骰').click();
      await expect(notice).not.toBeEmpty();
      await btn(page, '新增 NPC').click();
      await expect(notice).toBeEmpty();
      expect(errors).toEqual([]);
    });
  });

  test('7.1 F28：擲骰並複製遇到剪貼簿不能用時，輸出全選（不捲動）', async ({ page }) => {
    const errors = await open(page);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('blocked')) },
        configurable: true,
      });
      document.execCommand = () => false;
    });
    await field(page, 'STR 的算式').fill('3D6');
    const before = await page.evaluate(() => window.scrollY);
    await btn(page, '擲骰並複製').click();
    await expect(page.getByText('無法寫入剪貼簿').first()).toBeVisible();
    const sel = await output(page).evaluate((el: HTMLTextAreaElement) => ({
      focused: document.activeElement === el,
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.value.length,
    }));
    expect(sel).toEqual({ focused: true, start: 0, end: sel.length, length: sel.length });
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    expect(errors).toEqual([]);
  });

  test.describe('剪貼簿（F27）', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('7.1 F27：改過內容再按「複製」，固定欄與整頁都不捲動', async ({ page }) => {
      const errors = await open(page);
      await field(page, '名稱').fill('不要捲動');
      await setRandom(page, [0.5]);
      await field(page, 'STR 的算式').fill('3D6');
      await btn(page, '全部擲骰').click();
      const pane = page.getByTestId('npc-output').locator('xpath=..');
      const before = await pane.evaluate((el) => [el.scrollTop, window.scrollY]);
      await btn(page, '複製').click();
      await expect(page.getByText('已複製到剪貼簿').first()).toBeVisible();
      await page.waitForTimeout(200);
      expect(await pane.evaluate((el) => [el.scrollTop, window.scrollY])).toEqual(before);
      expect(await output(page).evaluate((el) => document.activeElement === el)).toBe(true);
      expect(errors).toEqual([]);
    });
  });

  test('7.1 F12：屬性的值可以打全形數字', async ({ page }) => {
    await open(page);
    await field(page, 'STR 的值').fill('６０');
    await field(page, 'SIZ 的值').fill('６５');
    await field(page, 'SIZ 的值').blur();
    await expect(field(page, 'STR 的值')).toHaveValue('60');
    await expect(field(page, 'SIZ 的值')).toHaveValue('65');
    await expect(field(page, 'DB')).toHaveValue('+1D4');
  });

  test('7.1 F34：捲到頁尾時固定欄（清單、輸出）不會被推到頁首底下，分頁點得到', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const headerBottom = await page
      .locator('header')
      .first()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const tabs = page.getByRole('radio', { name: '聊天面板' });
    const box = (await tabs.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(headerBottom);
    await tabs.click({ trial: true, timeout: 2000 });
    await tabs.click();
    await expect(tabs).toBeChecked();
  });

  test('壞掉的存檔：整理後照常開啟', async ({ page }) => {
    const errors = await open(page);
    await page.evaluate(() => {
      localStorage.setItem(
        'trpg-toolkit:coc-npc',
        JSON.stringify({
          state: { data: { npcs: [{ id: 'z', name: 7, abilities: 'x', skills: 'y', hp: '9' }] } },
          version: 1,
        }),
      );
    });
    await page.reload();
    await expect(listItems(page)).toHaveCount(1);
    await expect(field(page, 'HP')).toHaveValue('0');
    await expect(field(page, 'STR 的值')).toHaveValue('0');
    expect((await json(page)).data.name).toBe('無名氏');
    await page.evaluate(() => localStorage.setItem('trpg-toolkit:coc-npc', '{壞掉'));
    await page.reload();
    await expect(field(page, '名稱')).toHaveValue('新 NPC');
    expect(errors).toEqual([]);
  });

  test('舊版的存檔（iklab_coc_npc_token_v1）第一次開啟時搬過來', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        'iklab_coc_npc_token_v1',
        JSON.stringify({
          npcs: [
            {
              id: 'old1',
              version: '7',
              name: '舊的甲',
              externalUrl: '',
              abilities: { STR: { dice: '3D6', value: 50 }, SIZ: { dice: '2D6+6', value: 65 } },
              hp: 11,
              mp: 9,
              san: 45,
              sanEnabled: true,
              db: '+1D4',
              build: 1,
              mov: '8',
              skills: [{ name: '聆聽', value: 50 }],
              commands: [{ name: '', expr: '1D3+DB' }],
              commandType: 'CC',
              memo: '舊備註',
            },
            { id: 'old2', version: '6', name: '舊的乙', skills: [], commands: [] },
          ],
          currentId: 'old2',
        }),
      );
    });
    await page.reload();
    await expect(listItems(page)).toHaveCount(2);
    await expect(field(page, '名稱')).toHaveValue('舊的乙');
    await expect(listItems(page).nth(1)).toContainText('6 版');
    /* 7.1 F30：沒有切換就直接改目前的 NPC、重新整理，目前的仍是舊版選的那個 */
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('trpg-toolkit:coc-npc:preview') ?? 'null')?.state?.data
            ?.currentId,
      ),
    ).toBe('old2');
    await field(page, '備註').fill('搬來之後改的');
    await page.waitForTimeout(100);
    await page.reload();
    await expect(field(page, '名稱')).toHaveValue('舊的乙');
    await expect(field(page, '備註')).toHaveValue('搬來之後改的');
    await listItems(page).first().getByRole('button', { name: '舊的甲', exact: true }).click();
    await expect(field(page, 'STR 的算式')).toHaveValue('3D6');
    await expect(field(page, 'STR 的值')).toHaveValue('50');
    await expect(field(page, 'HP')).toHaveValue('11');
    await expect(field(page, 'MOV')).toHaveValue('8');
    await expect(field(page, '技能 1：名稱')).toHaveValue('聆聽');
    await expect(field(page, '備註')).toHaveValue('舊備註');
    /* 新版有自己的存檔之後不再讀舊版（舊版的不刪） */
    await field(page, '名稱').fill('改過的甲');
    await page.waitForTimeout(100);
    await page.reload();
    await expect(listItems(page).first()).toContainText('改過的甲');
    expect(
      await page.evaluate(() => localStorage.getItem('iklab_coc_npc_token_v1')),
    ).not.toBeNull();
  });

  test('自動保存、專案檔、全部重來', async ({ page }) => {
    const errors = await open(page);
    await field(page, '名稱').fill('存檔測試');
    await btn(page, '新增 NPC').click();
    await field(page, '名稱').fill('第二個');
    await page.waitForTimeout(100);
    await page.reload();
    await expect(listItems(page)).toHaveCount(2);
    await expect(field(page, '名稱')).toHaveValue('第二個');

    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    const path = (await dl.path()) as string;
    const project = JSON.parse(readFileSync(path, 'utf8'));
    expect(project).toMatchObject({ format: 'trpg-toolkit-project', tool: 'coc-npc' });
    expect(project.data.npcs.map((n: { name: string }) => n.name)).toEqual(['存檔測試', '第二個']);

    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(listItems(page)).toHaveCount(1);
    await expect(field(page, '名稱')).toHaveValue('新 NPC');

    await btn(page, '專案').click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(path);
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(listItems(page)).toHaveCount(2);
    await expect(field(page, '名稱')).toHaveValue('第二個');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await fillLike(page, LEGACY.cases.v7.input);
    await setRandom(page, LEGACY.seq);
    await btn(page, '全部擲骰').click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('coc-npc-1280.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test.describe('剪貼簿', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('7.1 F27：改過內容再按「複製」，整頁不捲動、複製鈕還在原處', async ({ page }) => {
      const errors = await open(page);
      await field(page, '名稱').fill('長頁面');
      const copy = btn(page, '複製');
      await copy.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      const y = (await copy.boundingBox())!.y;
      await copy.click();
      await expect(page.getByText('已複製到剪貼簿').first()).toBeVisible();
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
      expect((await copy.boundingBox())!.y).toBeCloseTo(y, 0);
      expect(errors).toEqual([]);
    });
  });

  test('清單預設收合（標題顯示目前的 NPC）、沒有橫向捲動；視覺回歸', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByRole('list', { name: 'NPC 清單' })).toBeHidden();
    await expect(page.getByTestId('collapsed-current')).toHaveText('編輯中：新 NPC');
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: /NPC 清單（1）/ }).click();
    await expect(listItems(page)).toHaveCount(1);
    await page.getByRole('button', { name: /NPC 清單（1）/ }).click();
    await setRandom(page, LEGACY.seq);
    await field(page, 'STR 的算式').fill('3D6');
    await btn(page, '全部擲骰').click();
    await noHorizontalScroll(page);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('coc-npc-390.png', {
      fullPage: true,
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});
