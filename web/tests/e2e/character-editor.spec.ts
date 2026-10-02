/**
 * 角色資料編輯器（建置產物 next/character-editor/）的端對端測試：
 * - 開頁：沒有 pageerror／console error、開頁狀態（F37）、各區的用法提示、頁尾只有靈感來源、不使用瀏覽器儲存空間（F38）；
 * - 附件 34 組在實際畫面上逐步執行：差異清單（順序、欄位、列名、兩側的值、標示變更）、來源、錯誤、沒有差異、
 *   勾選（點整列）、覆寫勾選的項目、全部覆寫、關閉，最後的輸出全文逐字相符（E06 比第 7 節裁定修正後的預期）；
 * - 差異確認的操作（F09～F16、F41）、讀檔（同一個檔案連讀兩次）、表單（F17～F32：數字欄、色碼欄、調色盤、
 *   清單新增／刪除／拖曳排序與自動捲動、引用插入）、複製（讀剪貼簿）、儲存（解析下載的檔案）、重設；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';
import { S } from '../../src/tools/character-editor/strings';
import {
  CURRENT_OUTPUT,
  type DiffRecord,
  type Example,
  examplesOf,
  expectedFor,
  findExample,
  REASON_KINDS,
  rowMatches,
} from '../helpers/characterEditorExamples';

const URL = `/${outputDir(getTool('character-editor') ?? { id: 'character-editor', status: 'next' })}/`;

const EXAMPLES = examplesOf(
  JSON.parse(
    readFileSync(
      new globalThis.URL(
        '../../../docs/refactor/specs/character-editor.examples.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
const byId = (id: string) => findExample(EXAMPLES, id);
const INITIAL_OUTPUT = byId('J11').預期輸出;
const J01_INPUT = byId('J01').步驟[0].輸入!;

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
  await expect(page.getByRole('heading', { level: 1, name: '角色資料編輯器' })).toBeVisible();
  return errors;
}

/* ---------- 定位 ---------- */

const jsonBox = (page: Page) => page.getByRole('textbox', { name: S.json.aria, exact: true });
const editBox = (page: Page) => page.getByRole('textbox', { name: S.edit.aria, exact: true });
const output = (page: Page) => page.getByTestId('output');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const message = (page: Page, area: 'json' | 'edit' | 'file') => page.getByTestId(`${area}-message`);
const diffDialog = (page: Page) => page.getByRole('dialog', { name: S.diff.title });
const noDiffDialog = (page: Page) => page.getByRole('dialog', { name: S.noDiffDialog.title });
const resetDialog = (page: Page) => page.getByRole('dialog', { name: S.reset.title });
const fileInput = (page: Page) => page.getByTestId('file-input');
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const cell = (page: Page, list: 'status' | 'params', i: number, col: string) =>
  page.getByRole('textbox', { name: `${S.lists[list].title} ${i + 1}：${col}`, exact: true });
const numberCell = (page: Page, list: 'status' | 'params', i: number, col: string) =>
  page.getByRole('spinbutton', { name: `${S.lists[list].title} ${i + 1}：${col}`, exact: true });
const rows = (page: Page, list: 'status' | 'params') =>
  page.getByRole('list', { name: S.lists[list].title, exact: true }).getByRole('listitem');
const handle = (page: Page, name: string) => btn(page, S.drag(name));
const commands = (page: Page) => page.getByRole('textbox', { name: S.commands.aria, exact: true });
const refBar = (page: Page) => page.getByTestId('reference-bar');

async function outputJson(page: Page) {
  return JSON.parse(await output(page).inputValue());
}

async function loadJson(page: Page, text: string) {
  await jsonBox(page).fill(text);
  await btn(page, S.json.load).click();
}

async function overwriteAll(page: Page, text: string) {
  await loadJson(page, text);
  await expect(diffDialog(page)).toBeVisible();
  await btn(page, S.diff.applyAll).click();
  await expect(diffDialog(page)).toBeHidden();
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 把差異確認裡的每一列讀成附件的紀錄格式 */
async function readDiffList(page: Page): Promise<(DiffRecord & { fieldSidesChanged?: boolean })[]> {
  return diffDialog(page)
    .locator('[data-diff-row]')
    .evaluateAll((els) => {
      const names: Record<string, Record<string, string>> = {
        status: { label: '標籤', value: '目前值', max: '最大值' },
        params: { label: '標籤', value: '值' },
      };
      return els.map((row) => {
        const field = row.getAttribute('data-diff-field') ?? '';
        const side = (name: string) => row.querySelector<HTMLElement>(`[data-side="${name}"]`)!;
        if (field !== 'status' && field !== 'params') {
          const value = (name: string) => {
            const el = side(name);
            return el.querySelector(':scope > [data-empty]')
              ? null
              : (el.querySelector('[data-text]')?.textContent ?? '');
          };
          const changed = ['current', 'incoming'].every(
            (n) => side(n).querySelector('[data-changed]') !== null,
          );
          return {
            欄位: field,
            目前: value('current'),
            匯入: value('incoming'),
            fieldSidesChanged: changed,
          };
        }
        const item = (name: string) => {
          const el = side(name);
          if (el.querySelector(':scope > [data-empty]')) return null;
          const rec: Record<string, string | string[]> = {};
          const changed: string[] = [];
          for (const part of el.querySelectorAll<HTMLElement>('[data-part]')) {
            const key = names[field][part.dataset.part ?? ''];
            rec[key] = part.querySelector(':scope > [data-empty]') ? '' : (part.textContent ?? '');
            if (part.hasAttribute('data-changed')) changed.push(key);
          }
          rec.標示變更 = changed;
          return rec;
        };
        const title = row.querySelector('[data-diff-title]')!;
        return {
          欄位: field,
          列名: title.hasAttribute('data-blank')
            ? { 空白標籤: true as const }
            : (title.textContent ?? ''),
          目前: item('current'),
          匯入: item('incoming'),
        };
      });
    });
}

const sourceText = (src: string | { 檔案: string }) =>
  typeof src === 'string'
    ? S.diff.source(src === 'JSON' ? { kind: 'json' } : { kind: 'edit' })
    : S.diff.source({ kind: 'file', name: src.檔案 });

/** 在畫面上依附件的步驟執行 */
async function runExample(page: Page, ex: Example) {
  const { steps, output: want } = expectedFor(ex);
  let records: DiffRecord[] = [];
  for (const step of steps) {
    switch (step.動作) {
      case '讀入 JSON':
      case '讀入編輯畫面複製文字':
      case '讀入本機檔案': {
        const area =
          step.動作 === '讀入 JSON' ? 'json' : step.動作 === '讀入本機檔案' ? 'file' : 'edit';
        const input = step.輸入 === CURRENT_OUTPUT ? await output(page).inputValue() : step.輸入!;
        if (area === 'json') await loadJson(page, input);
        else if (area === 'edit') {
          await editBox(page).fill(input);
          await btn(page, S.edit.load).click();
        } else {
          await fileInput(page).setInputFiles({
            name: step.檔名!,
            mimeType: 'application/json',
            buffer: Buffer.from(input, 'utf8'),
          });
        }
        const result = step.結果!;
        if (result.類型 === '錯誤') {
          const kind = REASON_KINDS[result.原因!];
          const text = S.errors[kind];
          await expect(message(page, area)).toHaveText(
            area === 'file' ? `${S.source({ kind: 'file', name: step.檔名! })}：${text}` : text,
          );
          await expect(message(page, area)).toHaveAttribute('data-tone', 'danger');
          await expect(diffDialog(page)).toBeHidden();
          break;
        }
        if (result.類型 === '沒有差異') {
          await expect(noDiffDialog(page)).toBeVisible();
          await btn(page, S.noDiffDialog.ok).click();
          await expect(noDiffDialog(page)).toBeHidden();
          break;
        }
        await expect(diffDialog(page)).toBeVisible();
        await expect(diffDialog(page)).toContainText(sourceText(result.來源!));
        const got = await readDiffList(page);
        expect(
          got.filter((r) => r.fieldSidesChanged === false),
          '一般欄位兩側都要標示變更',
        ).toEqual([]);
        records = got.map(({ fieldSidesChanged: _, ...r }) => r);
        expect(records, `${ex.編號} 的差異清單`).toEqual(result.差異清單);
        break;
      }
      case '勾選':
        for (const pick of step.項目!) {
          const i = records.findIndex((r) => rowMatches(r, pick));
          expect(i, JSON.stringify(pick)).toBeGreaterThanOrEqual(0);
          /* 點整列（不是勾選框）也會切換（F12） */
          await diffDialog(page)
            .locator('[data-diff-row]')
            .nth(i)
            .locator('[data-diff-title]')
            .click();
          await expect(diffDialog(page).locator('[data-diff-row]').nth(i)).toHaveAttribute(
            'data-checked',
            'true',
          );
        }
        break;
      case '覆寫勾選的項目':
        await btn(page, S.diff.applySelected).click();
        await expect(diffDialog(page)).toBeHidden();
        break;
      case '全部覆寫':
        await btn(page, S.diff.applyAll).click();
        await expect(diffDialog(page)).toBeHidden();
        break;
      case '關閉差異視窗（不套用）':
        await diffDialog(page).getByRole('button', { name: '關閉', exact: true }).click();
        await expect(diffDialog(page)).toBeHidden();
        break;
      default:
        throw new Error(`未知的動作 ${step.動作}`);
    }
  }
  await expect(output(page)).toHaveValue(want);
}

test.use({
  contextOptions: { reducedMotion: 'reduce' },
  viewport: { width: 1280, height: 900 },
});

test.describe('角色資料編輯器', () => {
  test('開頁狀態（F37、F39、F43、F44）：沒有錯誤、輸出、提示、頁尾', async ({ page }) => {
    const errors = await open(page);
    await expect(output(page)).toHaveValue(INITIAL_OUTPUT);
    await expect(jsonBox(page)).toHaveValue('');
    await expect(jsonBox(page)).toHaveAttribute('placeholder', S.json.placeholder);
    await expect(jsonBox(page)).toHaveAttribute('spellcheck', 'false');
    await expect(editBox(page)).toHaveValue('');
    await expect(message(page, 'json')).toHaveText(S.json.hint);
    await expect(message(page, 'edit')).toHaveText(S.edit.hint);
    await expect(message(page, 'file')).toHaveText(S.file.hint);
    await expect(field(page, S.form.name)).toHaveValue('新角色');
    await expect(field(page, S.form.initiative)).toHaveValue('0');
    await expect(field(page, S.form.width)).toHaveValue('4');
    await expect(page.getByRole('textbox', { name: S.form.colorCode, exact: true })).toHaveValue(
      '888888',
    );
    await expect(rows(page, 'status')).toHaveCount(1);
    await expect(rows(page, 'params')).toHaveCount(1);
    await expect(refBar(page)).toContainText(S.commands.refEmpty);
    /* 頁首回首頁（F44）、頁尾只有靈感來源（F43） */
    await expect(page.getByRole('link', { name: /TRPG Toolkit/ })).toHaveAttribute(
      'href',
      '../../',
    );
    const footer = page.locator('footer');
    await expect(footer).toContainText('靈感來源');
    await expect(footer.getByRole('link')).toHaveCount(1);
    await expect(footer.getByRole('link')).toHaveAttribute(
      'href',
      'https://github.com/organon-torah/ccfoliaCharacterEditor',
    );
    expect(errors).toEqual([]);
  });

  test.describe('附件 34 組（逐步執行、逐字比對）', () => {
    for (const ex of EXAMPLES) {
      test(`${ex.編號}：${ex.說明}`, async ({ page }) => {
        const errors = await open(page);
        await runExample(page, ex);
        expect(errors).toEqual([]);
      });
    }
  });

  test('差異確認的操作（F09～F15、F41）', async ({ page }) => {
    await open(page);
    await loadJson(page, J01_INPUT);
    const dlg = diffDialog(page);
    await expect(dlg).toBeVisible();
    /* 高度上限：約 760 px 或 92% 視窗高（取小），清單在對話框內捲動 */
    const box = (await dlg.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(Math.min(760, 900 * 0.92) + 1);
    const scroller = dlg.locator('[data-testid="diff-list"]').locator('..');
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    /* 群組：狀態、參數各有標題（群組內只顯示標籤） */
    await expect(dlg.getByRole('region', { name: S.diff.groupAria('status') })).toBeVisible();
    await expect(dlg.getByRole('region', { name: S.diff.groupAria('params') })).toBeVisible();

    const applySelected = btn(page, S.diff.applySelected);
    await expect(applySelected).toBeDisabled();
    await btn(page, S.diff.selectAll).click();
    await expect(dlg.locator('[data-diff-row][data-checked]')).toHaveCount(12);
    await expect(applySelected).toBeEnabled();
    await btn(page, S.diff.selectNone).click();
    await expect(dlg.locator('[data-diff-row][data-checked]')).toHaveCount(0);
    await expect(applySelected).toBeDisabled();
    /* 勾選框本身也能切換，點兩次回到未勾 */
    const nameBox = dlg.getByRole('checkbox', { name: S.fields.name, exact: true });
    await nameBox.click();
    await expect(nameBox).toBeChecked();
    await dlg.locator('[data-diff-row]').first().click();
    await expect(nameBox).not.toBeChecked();
    await dlg.getByRole('checkbox', { name: `${S.lists.status.title}：MP`, exact: true }).click();

    /* 強制回應：點外面不會關（勾到一半的選擇不會丟掉） */
    await page.mouse.click(8, 450);
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('[data-diff-row][data-checked]')).toHaveCount(1);
    /* Esc＝關閉不套用（F41）；訊息列維持「已讀取」（F10） */
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(output(page)).toHaveValue(INITIAL_OUTPUT);
    await expect(message(page, 'json')).toHaveText(S.loaded({ kind: 'json' }));

    /* 再讀一次：預設全部不勾；只覆寫勾選的 MP */
    await btn(page, S.json.load).click();
    await expect(dlg.locator('[data-diff-row][data-checked]')).toHaveCount(0);
    await dlg.getByRole('checkbox', { name: `${S.lists.status.title}：MP`, exact: true }).click();
    await applySelected.click();
    await expect(dlg).toBeHidden();
    const out = await outputJson(page);
    expect(out.data.status).toEqual([
      { label: '', value: 0, max: 0 },
      { label: 'MP', value: 9, max: 9 },
    ]);
    expect(out.data.name).toBe('新角色');
    await expect(message(page, 'json')).toHaveText(S.loaded({ kind: 'json' }));
  });

  test('沒有差異（F16）：小通知對話框，關閉與確定都只是關閉', async ({ page }) => {
    await open(page);
    await loadJson(page, await output(page).inputValue());
    await expect(noDiffDialog(page)).toBeVisible();
    await expect(page.getByTestId('no-diff-message')).toHaveText(S.noDiff({ kind: 'json' }));
    await expect(message(page, 'json')).toHaveText(S.noDiff({ kind: 'json' }));
    await noDiffDialog(page).getByRole('button', { name: '關閉', exact: true }).click();
    await expect(noDiffDialog(page)).toBeHidden();
    await btn(page, S.json.load).click();
    await btn(page, S.noDiffDialog.ok).click();
    await expect(noDiffDialog(page)).toBeHidden();
    await expect(output(page)).toHaveValue(INITIAL_OUTPUT);
  });

  test('錯誤（F02、F07）：目前的角色不變，讀入後文字區的內容保留', async ({ page }) => {
    await open(page);
    await overwriteAll(page, '{"kind":"character","data":{"name":"阿福"}}');
    const before = await output(page).inputValue();
    for (const [text, kind] of [
      ['{oops', 'syntax'],
      ['"x"', 'root'],
      ['{"kind":"Character","data":{}}', 'kind'],
      ['{"kind":"character","data":null}', 'data'],
    ] as const) {
      await loadJson(page, text);
      await expect(message(page, 'json')).toHaveText(S.errors[kind]);
      await expect(page.getByRole('alert').filter({ hasText: S.errors[kind] })).toBeVisible();
      await expect(jsonBox(page)).toHaveValue(text);
    }
    await editBox(page).fill('名前\n阿福');
    await btn(page, S.edit.load).click();
    await expect(message(page, 'edit')).toHaveText(S.errors.marker);
    await expect(output(page)).toHaveValue(before);
    /* 只有開頭標記也算成功（E10） */
    await editBox(page).fill('キャラクター編集');
    await btn(page, S.edit.load).click();
    await expect(diffDialog(page)).toContainText(S.diff.source({ kind: 'edit' }));
    await expect(message(page, 'edit')).toHaveText(S.loaded({ kind: 'edit' }));
  });

  test('讀入本機檔案（F08）：只列 .json、同一個檔案可以連續讀兩次、檔名帶進來源', async ({
    page,
  }) => {
    await open(page);
    await expect(fileInput(page)).toHaveAttribute('accept', '.json,application/json');
    const file = {
      name: '林曉雨.ccfolia-character.json',
      mimeType: 'application/json',
      buffer: Buffer.from(J01_INPUT, 'utf8'),
    };
    const chooser = page.waitForEvent('filechooser');
    await btn(page, S.file.load).click();
    await (await chooser).setFiles(file);
    await expect(diffDialog(page)).toContainText(S.diff.source({ kind: 'file', name: file.name }));
    await expect(message(page, 'file')).toHaveText(S.loaded({ kind: 'file', name: file.name }));
    await diffDialog(page).getByRole('button', { name: '關閉', exact: true }).click();
    const again = page.waitForEvent('filechooser');
    await btn(page, S.file.load).click();
    await (await again).setFiles(file);
    await expect(diffDialog(page)).toBeVisible();
    await btn(page, S.diff.applyAll).click();
    expect((await outputJson(page)).data.name).toBe('林曉雨');
  });

  test('名稱、先攻值、網址、備註、棋子大小（F17～F19、F23、F24）', async ({ page }) => {
    await open(page);
    await field(page, S.form.name).fill('  阿 明  ');
    await field(page, S.form.externalUrl).fill('not a url');
    await field(page, S.form.memo).fill('第一行  \n\n第三行 ');
    let out = await outputJson(page);
    expect([out.data.name, out.data.externalUrl, out.data.memo]).toEqual([
      '  阿 明  ',
      'not a url',
      '第一行  \n\n第三行 ',
    ]);

    const ini = field(page, S.form.initiative);
    await ini.fill('12');
    expect((await outputJson(page)).data.initiative).toBe(12);
    /* 清空：輸出立刻是 0，欄位留白（可以先打負號），離開時才補 0 */
    await ini.fill('');
    expect((await outputJson(page)).data.initiative).toBe(0);
    await expect(ini).toHaveValue('');
    await ini.pressSequentially('-3.5');
    expect((await outputJson(page)).data.initiative).toBe(-3.5);
    await ini.fill('1e2');
    expect((await outputJson(page)).data.initiative).toBe(100);
    await ini.fill('');
    await field(page, S.form.name).click();
    await expect(ini).toHaveValue('0');

    const width = field(page, S.form.width);
    await width.fill('2.5');
    out = await outputJson(page);
    expect(out.data.width).toBe(2.5);
    expect(Object.keys(out.data)).toEqual([
      'name',
      'memo',
      'initiative',
      'externalUrl',
      'status',
      'params',
      'width',
      'color',
      'commands',
    ]);
  });

  test('顏色（F20～F22、3.4）：色碼欄的輸入規則、調色盤、聊天欄預覽', async ({ page }) => {
    await open(page);
    const code = page.getByRole('textbox', { name: S.form.colorCode, exact: true });
    const color = async () => (await outputJson(page)).data.color;
    await code.fill('12AB');
    expect(await color()).toBe('#888888');
    await code.pressSequentially('EF');
    expect(await color()).toBe('#12abef');
    await expect(code).toHaveValue('12abef');
    await code.fill('abc');
    expect(await color()).toBe('#12abef');
    await code.press('Enter');
    await expect(code).not.toBeFocused();
    expect(await color()).toBe('#aabbcc');
    await expect(code).toHaveValue('aabbcc');
    await code.fill('12345');
    await field(page, S.form.name).click();
    await expect(code).toHaveValue('aabbcc');
    expect(await color()).toBe('#aabbcc');
    /* 貼上含 # 的 7 個字元：先去掉 # 再取 6 碼並套用（裁定） */
    await code.fill('#FF0000');
    expect(await color()).toBe('#ff0000');
    await expect(page.getByTestId('chat-preview')).toHaveCSS('color', 'rgb(255, 0, 0)');

    /* 調色盤：選色後是小寫 #rrggbb，色碼欄同步 */
    await page.getByRole('button', { name: /^名稱顏色：選擇顏色/ }).click();
    await page.getByRole('button', { name: '套用 #c0392b', exact: true }).click();
    expect(await color()).toBe('#c0392b');
    await expect(code).toHaveValue('c0392b');
    await page.keyboard.press('Escape');

    /* 匯入大寫色碼：照原樣、欄位顯示大寫（J04） */
    await overwriteAll(page, '{"kind":"character","data":{"name":"阿福","color":"#AABBCC"}}');
    expect(await color()).toBe('#AABBCC');
    await expect(code).toHaveValue('AABBCC');
  });

  test('清單（F25～F28）：新增在最後、刪除到一列都不剩', async ({ page }) => {
    await open(page);
    await cell(page, 'status', 0, '標籤').fill('HP');
    await numberCell(page, 'status', 0, '目前值').fill('7');
    await numberCell(page, 'status', 0, '最大值').fill('12.5');
    await page
      .getByRole('button', { name: S.addTo('status'), exact: true })
      .first()
      .click();
    await page
      .getByRole('button', { name: S.addTo('status'), exact: true })
      .last()
      .click();
    await expect(rows(page, 'status')).toHaveCount(3);
    await cell(page, 'status', 2, '標籤').fill('SAN');
    expect((await outputJson(page)).data.status).toEqual([
      { label: 'HP', value: 7, max: 12.5 },
      { label: '', value: 0, max: 0 },
      { label: 'SAN', value: 0, max: 0 },
    ]);
    await btn(page, S.remove(S.rowName('status', '', 1))).click();
    await btn(page, S.remove('HP')).click();
    await btn(page, S.remove('SAN')).click();
    await expect(rows(page, 'status')).toHaveCount(0);
    expect((await outputJson(page)).data.status).toEqual([]);
    await btn(page, S.remove(S.rowName('params', '', 0))).click();
    expect((await outputJson(page)).data.params).toEqual([]);
    await page
      .getByRole('button', { name: S.addTo('params'), exact: true })
      .last()
      .click();
    await cell(page, 'params', 0, '值').fill('60');
    expect((await outputJson(page)).data.params).toEqual([{ label: '', value: '60' }]);
  });

  test('拖曳排序（F29）：A B C D → D A B C → …，插入線、只在同一個清單內、鍵盤', async ({
    page,
  }) => {
    await open(page);
    await overwriteAll(
      page,
      JSON.stringify({
        kind: 'character',
        data: {
          status: ['A', 'B', 'C', 'D'].map((label) => ({ label, value: 1, max: 1 })),
          params: [{ label: 'X', value: '1' }],
        },
      }),
    );
    const order = async () =>
      ((await outputJson(page)).data.status as { label: string }[]).map((s) => s.label).join('');
    const drag = async (from: Locator, to: Locator, check?: () => Promise<void>) => {
      const a = (await from.boundingBox())!;
      const b = (await to.boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 6, { steps: 2 });
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
      await check?.();
      await page.mouse.up();
    };
    await expect(handle(page, 'A')).toHaveAttribute('aria-roledescription', S.dragRole);
    await drag(handle(page, 'D'), rows(page, 'status').nth(0), async () => {
      await expect(rows(page, 'status').nth(3)).toHaveAttribute('data-dragging', 'true');
      await expect(rows(page, 'status').nth(0)).toHaveAttribute('data-drop', 'before');
    });
    expect(await order()).toBe('DABC');
    await drag(handle(page, 'D'), rows(page, 'status').nth(2), async () => {
      await expect(rows(page, 'status').nth(2)).toHaveAttribute('data-drop', 'after');
    });
    expect(await order()).toBe('ABDC');
    /* 放回原位不變 */
    await drag(handle(page, 'A'), rows(page, 'status').nth(0));
    expect(await order()).toBe('ABDC');
    /* 從輸入欄開始拖不算 */
    await drag(cell(page, 'status', 0, '標籤'), rows(page, 'status').nth(3));
    expect(await order()).toBe('ABDC');
    /* 拖到別的清單上放開不移動 */
    await drag(handle(page, 'A'), rows(page, 'params').nth(0));
    expect(await order()).toBe('ABDC');
    expect((await outputJson(page)).data.params).toEqual([{ label: 'X', value: '1' }]);
    /* 鍵盤：聚焦把手後 Alt＋↓ */
    await handle(page, 'A').focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await order()).toBe('BADC');
    await expect(handle(page, 'A')).toBeFocused();
    /* 把手的無障礙名稱：標籤空白時用類別名稱加序號 */
    await cell(page, 'status', 0, '標籤').fill('');
    await expect(handle(page, S.rowName('status', '', 0))).toBeVisible();
  });

  test('拖到視窗下緣時頁面慢慢自動捲動（F29）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await open(page);
    await overwriteAll(
      page,
      JSON.stringify({
        kind: 'character',
        data: {
          status: Array.from({ length: 14 }, (_, i) => ({ label: `S${i}`, value: i, max: 9 })),
        },
      }),
    );
    await handle(page, 'S0').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, window.scrollY + 120));
    const a = (await handle(page, 'S0').boundingBox())!;
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + 20, { steps: 2 });
    await page.mouse.move(a.x + a.width / 2, 590, { steps: 4 });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 30);
    await page.mouse.up();
  });

  test('聊天面板與引用（F30～F32）', async ({ page }) => {
    await open(page);
    await cell(page, 'status', 0, '標籤').fill(' SAN ');
    await page
      .getByRole('button', { name: S.addTo('status'), exact: true })
      .first()
      .click();
    await cell(page, 'status', 1, '標籤').fill('   ');
    await page
      .getByRole('button', { name: S.addTo('status'), exact: true })
      .first()
      .click();
    await cell(page, 'status', 2, '標籤').fill(' SAN ');
    await cell(page, 'params', 0, '標籤').fill('STR');
    const bar = refBar(page);
    await expect(bar.locator('[data-ref-group="status"]').getByRole('button')).toHaveText([
      '{ SAN }',
      '{ SAN }',
    ]);
    await expect(bar.locator('[data-ref-group="params"]')).toContainText(S.lists.params.title);
    await expect(bar.locator('[data-ref-group="params"]').getByRole('button')).toHaveText([
      '{STR}',
    ]);

    /* 沒聚焦過：插在最後；插入後焦點回到聊天面板、游標在插入文字後面 */
    await bar.getByRole('button', { name: '{STR}', exact: true }).click();
    await expect(commands(page)).toHaveValue('{STR}');
    await expect(commands(page)).toBeFocused();
    await commands(page).fill('CC<=50 判定');
    await commands(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 6));
    await bar.getByRole('button', { name: '{ SAN }', exact: true }).first().click();
    await expect(commands(page)).toHaveValue('CC<={ SAN } 判定');
    expect(
      await commands(page).evaluate((el: HTMLTextAreaElement) => [
        el.selectionStart,
        el.selectionEnd,
      ]),
    ).toEqual([11, 11]);
    await page.keyboard.type('+1');
    await expect(commands(page)).toHaveValue('CC<={ SAN }+1 判定');
    expect((await outputJson(page)).data.commands).toBe('CC<={ SAN }+1 判定');

    /* 某一類沒有可用的標籤時整類不出現；兩類都沒有時顯示提示 */
    await cell(page, 'params', 0, '標籤').fill('');
    await expect(bar.locator('[data-ref-group="params"]')).toHaveCount(0);
    await cell(page, 'status', 0, '標籤').fill('');
    await cell(page, 'status', 2, '標籤').fill('');
    await expect(bar).toContainText(S.commands.refEmpty);
  });

  test.describe('複製（F34）', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('寫進剪貼簿；成功訊息留到套用匯入才消失', async ({ page }) => {
      await open(page);
      await field(page, S.form.name).fill('阿 福 ');
      await btn(page, S.output.copy).click();
      await expect(page.getByTestId('copy-message')).toHaveText(S.output.copied);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      expect(clip).toBe(await output(page).inputValue());
      await field(page, S.form.name).fill('改了');
      await expect(page.getByTestId('copy-message')).toBeVisible();
      await overwriteAll(page, '{"kind":"character","data":{"name":"林曉雨"}}');
      await expect(page.getByTestId('copy-message')).toHaveCount(0);
    });
  });

  test('複製失敗：顯示錯誤，焦點移到輸出區並全選', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
        configurable: true,
      });
      document.execCommand = () => false;
    });
    await open(page);
    await btn(page, S.output.copy).click();
    await expect(page.getByTestId('copy-message')).toHaveText(S.output.copyFailed);
    await expect(output(page)).toBeFocused();
    const [start, end, len] = await output(page).evaluate((el: HTMLTextAreaElement) => [
      el.selectionStart,
      el.selectionEnd,
      el.value.length,
    ]);
    expect([start, end]).toEqual([0, len]);
  });

  test('儲存（F35）：直接下載，檔名照 3.5、內容與輸出逐字相同', async ({ page }) => {
    await open(page);
    await field(page, S.form.name).fill('  a/b:c*?"<>|d  ');
    const dl = page.waitForEvent('download');
    await btn(page, S.file.save).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe('a_b_c_d.ccfolia-character.json');
    expect(readFileSync((await file.path())!, 'utf8')).toBe(await output(page).inputValue());
    await expect(message(page, 'file')).toHaveText(S.file.saved('a_b_c_d.ccfolia-character.json'));
    await field(page, S.form.name).fill('   ');
    const dl2 = page.waitForEvent('download');
    await btn(page, S.file.save).click();
    expect((await dl2).suggestedFilename()).toBe('character.ccfolia-character.json');
  });

  test.describe('重設（F36）', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('取消、關閉不變；確定回到開頁狀態並清掉複製訊息，貼上區與訊息列不變', async ({ page }) => {
      await open(page);
      await overwriteAll(page, J01_INPUT);
      await editBox(page).fill('貼上的文字');
      await btn(page, S.output.copy).click();
      const edited = await output(page).inputValue();
      await btn(page, S.reset.button).click();
      await expect(resetDialog(page)).toBeVisible();
      await expect(resetDialog(page).getByRole('button')).toHaveText([
        '',
        S.reset.cancel,
        S.reset.confirm,
      ]);
      await btn(page, S.reset.cancel).click();
      await expect(resetDialog(page)).toBeHidden();
      await btn(page, S.reset.button).click();
      await resetDialog(page).getByRole('button', { name: '關閉', exact: true }).click();
      await expect(output(page)).toHaveValue(edited);
      await btn(page, S.reset.button).click();
      await btn(page, S.reset.confirm).click();
      await expect(output(page)).toHaveValue(INITIAL_OUTPUT);
      await expect(page.getByTestId('copy-message')).toHaveCount(0);
      await expect(jsonBox(page)).toHaveValue(J01_INPUT);
      await expect(editBox(page)).toHaveValue('貼上的文字');
      await expect(message(page, 'json')).toHaveText(S.loaded({ kind: 'json' }));
      await expect(rows(page, 'status')).toHaveCount(1);
    });
  });

  test('不保留狀態（F38）：重新整理後回到開頁狀態，也不寫瀏覽器儲存空間', async ({ page }) => {
    await open(page);
    await overwriteAll(page, J01_INPUT);
    await field(page, S.form.memo).fill('會不見');
    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.includes('character-editor')),
    );
    expect(keys).toEqual([]);
    await page.reload();
    await expect(output(page)).toHaveValue(INITIAL_OUTPUT);
  });

  test.describe('視覺回歸', () => {
    const fill = async (page: Page) => {
      await overwriteAll(page, J01_INPUT);
      await jsonBox(page).fill('');
      await page.mouse.move(0, 0);
    };

    test('1280 寬', async ({ page }) => {
      const errors = await open(page);
      await fill(page);
      await noHorizontalScroll(page);
      await expect(page).toHaveScreenshot('character-editor-1280.png', { fullPage: true });
      expect(errors).toEqual([]);
    });

    test('390 寬，沒有橫向捲動（F40）', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const errors = await open(page);
      await noHorizontalScroll(page);
      await loadJson(page, J01_INPUT);
      await expect(diffDialog(page)).toBeVisible();
      await noHorizontalScroll(page);
      await btn(page, S.diff.applyAll).click();
      await jsonBox(page).fill('');
      await page.mouse.move(0, 0);
      await noHorizontalScroll(page);
      await expect(page).toHaveScreenshot('character-editor-390.png', { fullPage: true });
      expect(errors).toEqual([]);
    });
  });
});
