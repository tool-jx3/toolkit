/**
 * PL 自介卡與地雷表（建置產物 next/pl-profile/）的端對端測試（規格 docs/refactor/specs/pl-profile.md）：
 * - 開頁沒有錯誤、頁尾只有靈感來源、空白的預覽；
 * - 自介卡（欄位、眼睛、標籤複選與自己加、系統、聯絡方式）→ 純文字；頭像（加入、圓形範圍、拿掉）；
 * - 地雷表（點選、再點清掉、鍵盤、補充、自訂主題與分類、成人向、沒填的設成「沒差」、全部清掉與復原）；
 * - 復原：打字後用滑鼠點別的分頁，之後的動作照樣各一步；
 * - 匯出 PNG（解碼檢查寬度、色帶的顏色、檔名；分成兩張、標準大小）；
 * - 分享連結 → 唯讀檢視 → 加到 KP 對照表；KP 對照表（連結、專案檔、自己、篩選、摘要、移出與復原、清空）；
 * - 專案檔（JSON、有頭像時 ZIP）、自動儲存與重新整理、壞掉的分享連結；
 * - 390 寬每個分頁沒有橫向捲動；1280 與 390 的視覺基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';
import { decodePixels, parseChunks, readIhdr } from '../helpers/png';

const URL = `/${outputDir(getTool('pl-profile') ?? { id: 'pl-profile', status: 'next' })}/`;
const KEY = 'trpg-toolkit:pl-profile';

async function open(page: Page, url = URL) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: 'PL 自介卡與地雷表' })).toBeVisible();
  return errors;
}

const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const box = (scope: Page | Locator, name: string) =>
  scope.getByRole('textbox', { name, exact: true });
const btn = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name, exact: true });
const level = (page: Page, topic: string, name: string) =>
  page.getByRole('radiogroup', { name: `「${topic}」的程度` }).getByRole('radio', { name });
const outText = (page: Page) => page.getByRole('textbox', { name: '純文字' });

async function showText(page: Page) {
  await page.getByRole('radio', { name: '純文字' }).click();
  return outText(page);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

/** 填一份基本的自介與地雷表 */
async function fillSample(page: Page) {
  await box(page, '暱稱').fill('阿明');
  await box(page, '帳號').fill('@aming');
  await box(page, '一句話').fill('喜歡慢慢調查的劇情派');
  await btn(page, '劇情').click();
  await btn(page, '文字團').click();
  await tab(page, '地雷表').click();
  await level(page, '成群的蟲', '地雷').click();
  await level(page, 'PC 死亡', '先問我').click();
  await level(page, '戰鬥', '盡量來').click();
  await tab(page, '自介卡').click();
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

/** 300 × 200 的圖：左半紅、右半藍 */
async function avatarPng(): Promise<Buffer> {
  const w = 300;
  const h = 200;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      px.set(x < 150 ? [220, 60, 60, 255] : [40, 80, 220, 255], (y * w + x) * 4);
  return Buffer.from(await encodePng(px, w, h));
}

async function addAvatar(page: Page) {
  await page
    .getByTestId('avatar-drop')
    .locator('input[type=file]')
    .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: await avatarPng() });
  await expect(page.getByTestId('avatar-preview')).toBeVisible();
}

async function shareLink(page: Page): Promise<string> {
  await btn(page, '分享連結…').click();
  const dialog = page.getByTestId('share-dialog');
  const url = await dialog.getByRole('textbox', { name: '連結' }).inputValue();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return url;
}

test.describe('1280 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、頁尾只有靈感來源、四個分頁、空白的預覽', async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator('footer')).toHaveText('靈感來源：sonata9x/trpg-profile-maker');
    await expect(page.locator('footer a')).toHaveAttribute(
      'href',
      'https://github.com/sonata9x/trpg-profile-maker',
    );
    for (const t of ['自介卡', '地雷表', '外觀', 'KP 對照'])
      await expect(tab(page, t)).toBeVisible();
    const preview = page.getByTestId('card-preview');
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveAttribute('data-kind', 'combined');
    await expect(page.getByTestId('image-size')).toHaveText(/自介卡與地雷表・1,600 × \d/);
    const text = await showText(page);
    await expect(text).toHaveValue('');
    expect(errors).toEqual([]);
  });

  test('自介卡：欄位、眼睛、標籤（複選、自己加、重複）、系統、聯絡方式 → 純文字', async ({
    page,
  }) => {
    const errors = await open(page);
    await box(page, '暱稱').fill('阿明');
    await box(page, '帳號').fill('@aming');
    await box(page, '一句話').fill('請多指教');
    await page.getByRole('combobox', { name: 'PL 經驗' }).click();
    await page.getByRole('option', { name: '熟手' }).click();
    await btn(page, '劇情').click();
    await btn(page, '角色扮演').click();
    await expect(btn(page, '劇情')).toHaveAttribute('aria-pressed', 'true');
    await btn(page, '角色扮演').click();
    await expect(btn(page, '角色扮演')).toHaveAttribute('aria-pressed', 'false');
    const extra = page.getByRole('textbox', { name: '「喜歡的風格」自己加的標籤' });
    await extra.fill('慢熱');
    await extra.press('Enter');
    await expect(page.getByRole('list', { name: '「喜歡的風格」自己加的標籤' })).toContainText(
      '慢熱',
    );
    await extra.fill('劇情');
    await extra.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: '已經有「劇情」了。' })).toBeVisible();
    /* 系統：建議一點就加入；新增空白的一列、改名、排序、刪除 */
    await btn(page, '忍神').click();
    await btn(page, 'CoC 7 版').click();
    const systems = page.getByRole('list', { name: '玩過的系統' }).locator('[data-system]');
    await expect(systems).toHaveCount(2);
    await systems.nth(1).getByRole('button', { name: '往上移' }).click();
    await expect(systems.first().getByRole('combobox', { name: '系統名稱' })).toHaveValue(
      'CoC 7 版',
    );
    await systems.first().getByRole('radio', { name: '本命' }).click();
    await systems.first().getByRole('checkbox', { name: '可以 KP' }).click();
    await btn(page, '新增系統').click();
    await expect(systems).toHaveCount(3);
    await systems.nth(2).getByRole('button', { name: '刪除「（未命名）」' }).click();
    await expect(systems).toHaveCount(2);
    /* 聯絡方式 */
    await btn(page, '新增聯絡方式').click();
    await page.getByRole('combobox', { name: '種類' }).fill('Discord');
    await box(page, '帳號或連結').fill('aming');
    await box(page, '想說的話').fill('第一次語音團');

    const text = await showText(page);
    await expect(text).toHaveValue(
      [
        '【PL 自介】',
        '阿明（@aming）',
        '「請多指教」',
        '・跑團經驗：PL 熟手',
        '・玩過的系統：CoC 7 版（本命・可以 KP）、忍神（跑過）',
        '・喜歡的風格：劇情、慢熱',
        '・聯絡方式：Discord aming',
        '・想說的話：',
        '第一次語音團',
      ].join('\n'),
    );
    /* 眼睛：關掉的欄位不出現（內容留著） */
    await page.getByRole('radio', { name: '圖片' }).click();
    await page.locator('[data-show=systems]').click();
    await expect(page.locator('[data-show=systems]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-field=systems]')).toContainText(
      '不會出現在卡片、文字與分享連結裡',
    );
    await showText(page);
    await expect(outText(page)).not.toHaveValue(/玩過的系統/);
    await expect(systems).toHaveCount(2);
    /* Discord 的寫法 */
    await page.getByRole('radio', { name: 'Discord（粗體標題）' }).click();
    await expect(outText(page)).toHaveValue(/^\*\*PL 自介\*\*\n阿明（@aming）/);
    expect(errors).toEqual([]);
  });

  test('頭像：加入、圓形範圍（放大後套用）、預覽有頭像、拿掉', async ({ page }) => {
    const errors = await open(page);
    await addAvatar(page);
    await expect(page.getByTestId('avatar-preview')).toHaveAttribute('data-placement', 'center');
    await btn(page, '調整範圍').click();
    const dialog = page.getByRole('dialog', { name: '頭像的範圍' });
    await dialog.getByRole('button', { name: '放大' }).click();
    await dialog.getByRole('button', { name: '套用' }).click();
    await expect(page.getByTestId('avatar-preview')).toHaveAttribute('data-placement', /^1\.100,/);
    /* 匯出的圖：頭像圓心附近是圖片的顏色（左半紅、右半藍 → 放大 1.1 倍後中心偏左是紅） */
    const png = await pngOf(page, () => btn(page, '下載自介卡與地雷表').click());
    const [r, g, b] = png.at(Math.round((36 + 72 - 20) * 2), 96 * 2);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);
    await btn(page, '拿掉頭像').click();
    await expect(page.getByTestId('avatar-drop')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('地雷表：點選、再點清掉、鍵盤、補充、自訂主題與分類、成人向、快速操作、復原', async ({
    page,
  }) => {
    const errors = await open(page);
    await tab(page, '地雷表').click();
    const progress = page.getByTestId('jirai-progress');
    await expect(progress).toHaveText('已填 0／59');
    const bugs = level(page, '成群的蟲', '地雷');
    await bugs.click();
    await expect(bugs).toHaveAttribute('aria-checked', 'true');
    await expect(progress).toHaveText('已填 1／59');
    await bugs.click();
    await expect(bugs).toHaveAttribute('aria-checked', 'false');
    await expect(progress).toHaveText('已填 0／59');
    /* 鍵盤：方向鍵移動並選取、Delete 清掉 */
    await level(page, '霸凌', '盡量來').click();
    await page.keyboard.press('ArrowRight');
    await expect(level(page, '霸凌', '有就開心')).toBeFocused();
    await expect(level(page, '霸凌', '有就開心')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect(level(page, '霸凌', '地雷')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-topic=bullying]')).toHaveAttribute('data-level', '');
    /* 補充 */
    await level(page, 'PC 死亡', '先問我').click();
    await btn(page, '寫「PC 死亡」的補充').click();
    await expect(box(page, '「PC 死亡」的補充')).toBeFocused();
    await page.keyboard.type('事前說一聲');
    await page.keyboard.press('Tab');
    /* 自訂主題、自訂分類 */
    const add = page.getByRole('textbox', { name: '在「死亡與失去」新增主題' });
    await add.fill('時間迴圈');
    await add.press('Enter');
    await level(page, '時間迴圈', '有就開心').click();
    await page.getByRole('textbox', { name: '新增分類' }).fill('其他議題');
    await page.getByRole('textbox', { name: '新增分類' }).press('Enter');
    const real = page
      .locator('[data-category]')
      .filter({ has: page.getByRole('textbox', { name: '分類名稱' }) });
    await expect(real.getByRole('textbox', { name: '分類名稱' })).toHaveValue('其他議題');
    await page.getByRole('textbox', { name: '在「其他議題」新增主題' }).fill('時事');
    await page.getByRole('textbox', { name: '在「其他議題」新增主題' }).press('Enter');
    await level(page, '時事', '地雷').click();
    await expect(progress).toHaveText('已填 3／61');
    /* 成人向 */
    await page.getByRole('switch', { name: '顯示成人向的主題' }).click();
    await expect(progress).toHaveText('已填 3／66');
    await level(page, '曖昧與性暗示', '沒差').click();
    await page.getByRole('switch', { name: '顯示成人向的主題' }).click();
    await expect(page.getByRole('radiogroup', { name: '「曖昧與性暗示」的程度' })).toHaveCount(0);

    await showText(page);
    await expect(outText(page)).toHaveValue(
      [
        '【地雷表】',
        '✕ 地雷：時事',
        '？ 先問我：PC 死亡（事前說一聲）',
        '✓ 有就開心：時間迴圈',
      ].join('\n'),
    );
    /* 只列「地雷」與「先問我」 */
    await page.getByRole('checkbox', { name: '地雷表只列「地雷」與「先問我」' }).click();
    await expect(outText(page)).not.toHaveValue(/時間迴圈/);

    /* 刪除自訂分類（有主題時先確認） */
    await real.getByRole('button', { name: '刪除分類「其他議題」' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(page.getByRole('textbox', { name: '分類名稱' })).toHaveCount(0);
    await expect(progress).toHaveText('已填 2／60');

    /* 沒填的設成「沒差」 → 全部清掉 → 復原 */
    await btn(page, '沒填的設成「沒差」').click();
    await expect(progress).toHaveText('已填 60／60');
    await btn(page, '全部清掉').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部清掉' }).click();
    await expect(progress).toHaveText('已填 0／60');
    await page.locator('body').click({ position: { x: 5, y: 600 } });
    await page.keyboard.press('Control+z');
    await expect(progress).toHaveText('已填 60／60');
    await page.keyboard.press('Control+z');
    await expect(progress).toHaveText('已填 2／60');
    expect(errors).toEqual([]);
  });

  test('復原：打字後用滑鼠點別的分頁，之後的動作照樣各一步', async ({ page }) => {
    const errors = await open(page);
    const undo = page.getByRole('button', { name: /^復原（/ });
    await box(page, '暱稱').click();
    await page.keyboard.type('阿明');
    await tab(page, '地雷表').click();
    await level(page, 'PC 死亡', '地雷').click();
    await level(page, '跑到深夜', '有就開心').click();
    await undo.click();
    await expect(page.locator('[data-topic=late-night]')).toHaveAttribute('data-level', '');
    await expect(page.locator('[data-topic=pc-death]')).toHaveAttribute('data-level', 'ng');
    await undo.click();
    await expect(page.locator('[data-topic=pc-death]')).toHaveAttribute('data-level', '');
    await tab(page, '自介卡').click();
    await expect(box(page, '暱稱')).toHaveValue('阿明');
    await undo.click();
    await expect(box(page, '暱稱')).toHaveValue('');
    await expect(undo).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('匯出 PNG：合成一張（寬 1600、色帶、檔名）、分成兩張、標準大小、依分類', async ({
    page,
  }) => {
    const errors = await open(page);
    await fillSample(page);
    await page.getByRole('radio', { name: '圖片' }).click();
    const one = await pngOf(page, () => btn(page, '下載自介卡與地雷表').click());
    expect(one.name).toBe('阿明_自介卡與地雷表.png');
    expect(one.ihdr.width).toBe(1600);
    /* 色帶（紙白、主色 #4b6bd6 往白色混一半 → #a5b5eb），避開圓點 */
    const band = one.at(2, 2);
    expect(Math.abs(band[0] - 0xa5)).toBeLessThanOrEqual(2);
    expect(Math.abs(band[1] - 0xb5)).toBeLessThanOrEqual(2);
    expect(Math.abs(band[2] - 0xeb)).toBeLessThanOrEqual(2);
    const h1 = one.ihdr.height;
    expect(h1).toBeGreaterThan(1000);

    await tab(page, '外觀').click();
    await page.getByRole('radio', { name: '分成兩張' }).click();
    await expect(page.getByTestId('card-preview')).toHaveCount(2);
    const a = await pngOf(page, () => btn(page, '下載自介卡').click());
    const b = await pngOf(page, () => btn(page, '下載地雷表').click());
    expect(a.name).toBe('阿明_自介卡.png');
    expect(b.name).toBe('阿明_地雷表.png');
    expect(a.ihdr.width).toBe(1600);
    /* 地雷表那張的頂端是細的色帶，再下面是底色 */
    expect(b.at(4, 4)[2]).toBeGreaterThan(200);
    expect(b.at(4, 60)).toEqual([0xf6, 0xf4, 0xef, 255]);

    await page.getByRole('radio', { name: '標準（800 px 寬）' }).click();
    await page.getByRole('radio', { name: '只要地雷表' }).click();
    await page.getByRole('radio', { name: '依分類' }).click();
    await page.getByRole('button', { name: '墨黑' }).click();
    await expect(page.getByTestId('image-size')).toHaveText(/^地雷表・800 × /);
    const c = await pngOf(page, () => btn(page, '下載地雷表').click());
    expect(c.ihdr.width).toBe(800);
    expect(c.at(4, 40)).toEqual([0x11, 0x11, 0x11, 255]);
    expect(errors).toEqual([]);
  });

  test('分享連結 → 唯讀檢視 → 加到 KP 對照表；關掉眼睛的欄位不放進連結', async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await fillSample(page);
    await btn(page, '新增聯絡方式').click();
    await page.getByRole('combobox', { name: '種類' }).fill('LINE');
    await box(page, '帳號或連結').fill('secret-id');
    await page.locator('[data-show=contact]').click();
    const url = await shareLink(page);
    expect(url).toMatch(/\/next\/pl-profile\/#p=[A-Za-z0-9_-]+$/);

    const p2 = await context.newPage();
    const errs2 = await open(p2, url);
    await expect(p2.getByTestId('viewer')).toBeVisible();
    await expect(p2.getByRole('heading', { name: '阿明的自介卡與地雷表' })).toBeVisible();
    await expect(tab(p2, '自介卡')).toHaveCount(0);
    const text = await outText(p2).inputValue();
    expect(text).toContain('阿明（@aming）');
    expect(text).toContain('✕ 地雷：成群的蟲');
    expect(text).not.toContain('secret-id');
    await btn(p2, '加到 KP 對照表').click();
    await expect(p2.getByText('已把「阿明」加到 KP 對照表').first()).toBeVisible();
    await btn(p2, '加到 KP 對照表').click();
    await expect(p2.getByText('「阿明」已經在 KP 對照表裡了').first()).toBeVisible();
    await btn(p2, '回到我的編輯畫面').click();
    await expect(tab(p2, 'KP 對照')).toBeVisible();
    expect(p2.url()).not.toContain('#');
    await tab(p2, 'KP 對照').click();
    await expect(p2.getByTestId('member-count')).toHaveText('1／12 人');
    expect([...errors, ...errs2]).toEqual([]);
  });

  test('KP 對照表：連結（一次好幾個、壞掉的）、專案檔、自己、表格與判定、篩選、摘要、移出與復原、清空', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 先做兩份分享連結：阿明、小華 */
    await fillSample(page);
    const linkA = await shareLink(page);
    await box(page, '暱稱').fill('小華');
    await tab(page, '地雷表').click();
    await level(page, '成群的蟲', '有就開心').click();
    await level(page, 'PC 死亡', '盡量來').click();
    await level(page, '戰鬥', '有就開心').click();
    await level(page, '跑到深夜', '地雷').click();
    const linkB = await shareLink(page);
    /* 小華的專案檔 */
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    const projectPath = (await dl.path()) as string;

    await tab(page, 'KP 對照').click();
    await page
      .getByRole('textbox', { name: '貼上分享連結' })
      .fill(`${linkA}\n${linkB}\nhttps://example.com/#p=broken`);
    await btn(page, '加入連結').click();
    await expect(page.getByText('已加入 2 人').first()).toBeVisible();
    await expect(page.getByText('1 個連結讀不出來').first()).toBeVisible();
    await expect(page.getByTestId('member-count')).toHaveText('2／12 人');

    const table = page.getByTestId('compare-table');
    await expect(table.locator('thead th')).toHaveText(['主題', '阿明', '小華']);
    const row = (label: string) => table.locator(`tr[data-row="${label}"]`);
    await expect(row('成群的蟲')).toHaveAttribute('data-status', 'ng');
    await expect(row('PC 死亡')).toHaveAttribute('data-status', 'ask');
    await expect(row('戰鬥')).toHaveAttribute('data-status', 'good');
    await expect(row('跑到深夜')).toHaveAttribute('data-status', 'ng');
    await expect(page.getByTestId('compare-summary')).toHaveText(
      '有地雷：2 個主題；要先問：1 個主題',
    );
    await expect(page.getByRole('textbox', { name: 'KP 對照表的摘要' })).toHaveValue(
      [
        '【KP 對照表】阿明、小華',
        '✕ 有地雷：成群的蟲（阿明）、跑到深夜（小華）',
        '？ 要先問：PC 死亡（阿明）',
      ].join('\n'),
    );
    await page.getByRole('radio', { name: '需要注意的' }).click();
    await expect(row('戰鬥')).toHaveCount(0);
    await expect(row('跑到深夜')).toBeVisible();

    /* 同一份專案檔：小華已經在了（重複） */
    await page.getByRole('radio', { name: '全部主題' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '開啟專案檔…').click(),
    ]);
    await chooser.setFiles(projectPath);
    await expect(page.getByText('已經在對照表裡：小華。').first()).toBeVisible();

    /* 我自己的（目前是小華的內容 → 重複）；改了之後就能加入，再按一次是更新 */
    await tab(page, '地雷表').click();
    await level(page, '跑到深夜', '沒差').click();
    await tab(page, 'KP 對照').click();
    await btn(page, '加入我自己的地雷表').click();
    await expect(page.getByTestId('member-count')).toHaveText('3／12 人');
    await expect(btn(page, '更新我自己的地雷表')).toBeVisible();
    await page.getByRole('textbox', { name: '「小華」的名稱' }).last().fill('KP 自己');
    await expect(table.locator('thead th').last()).toHaveText('KP 自己');

    /* 移出 → 復原 */
    await btn(page, '把「阿明」移出對照表').click();
    await expect(table.locator('thead th')).toHaveText(['主題', '小華', 'KP 自己']);
    await page.getByTestId('toast-action').click();
    await expect(table.locator('thead th')).toHaveText(['主題', '阿明', '小華', 'KP 自己']);

    /* 重新整理後還在；清空 */
    await page.reload();
    await expect(page.getByTestId('member-count')).toHaveText('3／12 人');
    await btn(page, '清空對照表').click();
    await page.getByRole('alertdialog').getByRole('button', { name: '清空' }).click();
    await expect(page.getByTestId('member-count')).toHaveText('0／12 人');
    expect(errors).toEqual([]);
  });

  test('專案檔：JSON 與有頭像的 ZIP、開啟（先確認）、別的工具的專案檔、自動儲存、壞掉的分享連結、全部重來', async ({
    page,
  }) => {
    const errors = await open(page);
    await fillSample(page);
    await btn(page, '專案').click();
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^阿明_PL自介卡_\d{8}\.json$/);
    const json = JSON.parse(readFileSync((await dl.path()) as string, 'utf8'));
    expect(json).toMatchObject({ format: 'trpg-toolkit-project', tool: 'pl-profile', version: 1 });
    expect(json.data.profile.nickname).toBe('阿明');
    expect(json.data.jirai.levels).toEqual({
      'swarming-bugs': 'ng',
      'pc-death': 'ask',
      combat: 'love',
    });

    /* Ctrl＋S（輸入框裡也可以）：同樣的專案檔 */
    await box(page, '暱稱').focus();
    const [dls] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Control+s'),
    ]);
    expect(dls.suggestedFilename()).toMatch(/^阿明_PL自介卡_\d{8}\.json$/);

    /* 有頭像：ZIP（project.json＋files/<id>.png） */
    await addAvatar(page);
    await btn(page, '專案').click();
    const [dlz] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(dlz.suggestedFilename()).toMatch(/\.zip$/);
    const zipPath = (await dlz.path()) as string;
    const files = unzipSync(new Uint8Array(readFileSync(zipPath)));
    const names = Object.keys(files);
    expect(names).toContain('project.json');
    const avatarFile = names.find((n) => n.startsWith('files/'));
    expect(avatarFile).toMatch(/^files\/[A-Za-z0-9_-]+\.png$/);

    /* 全部重來（可以復原） */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: '全部重來…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    await expect(box(page, '暱稱')).toHaveValue('');
    await expect(page.getByTestId('avatar-drop')).toBeVisible();

    /* 開啟 ZIP：先確認，頭像回來 */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
    ]);
    await chooser.setFiles(zipPath);
    await expect(box(page, '暱稱')).toHaveValue('阿明');
    await expect(page.getByTestId('avatar-preview')).toBeVisible();

    /* 別的工具的專案檔：內容不變 */
    await btn(page, '專案').click();
    await page.getByRole('menuitem', { name: '開啟專案檔…' }).click();
    const [chooser2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click(),
    ]);
    await chooser2.setFiles({
      name: 'other.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ format: 'trpg-toolkit-project', tool: 'coc-npc', version: 1, data: {} }),
      ),
    });
    await expect(page.getByText('無法開啟專案檔', { exact: true }).first()).toBeVisible();
    await expect(box(page, '暱稱')).toHaveValue('阿明');

    /* 自動儲存：重新整理後內容與頭像都在 */
    await page.waitForFunction((k) => (localStorage.getItem(k) ?? '').includes('阿明'), KEY);
    await page.reload();
    await expect(box(page, '暱稱')).toHaveValue('阿明');
    await expect(page.getByTestId('avatar-preview')).toBeVisible();

    /* 壞掉的分享連結：通知、照一般開頁、網址的 # 清掉 */
    await page.goto(`${URL}#p=@@@`);
    await expect(page.getByText('這個分享連結讀不出來').first()).toBeVisible();
    await expect(box(page, '暱稱')).toHaveValue('阿明');
    expect(page.url()).not.toContain('#');

    /* 壞掉的存檔：當作沒有存檔 */
    await page.evaluate((k) => localStorage.setItem(k, '{broken'), KEY);
    await page.reload();
    await expect(box(page, '暱稱')).toHaveValue('');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page);
    await fillSample(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId('card-preview')).toHaveAttribute('data-painted', /\d/);
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('pl-profile-1280.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    expect(errors).toEqual([]);
  });
});

test.describe('320 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 320, height: 700 } });

  test('很長的自訂標籤、暱稱也不會橫向捲動', async ({ page }) => {
    const errors = await open(page);
    const extra = page.getByRole('textbox', { name: '「喜歡的風格」自己加的標籤' });
    await extra.fill('W'.repeat(20));
    await extra.press('Enter');
    await expect(page.getByRole('list', { name: '「喜歡的風格」自己加的標籤' })).toContainText(
      'WWWW',
    );
    await noHorizontalScroll(page);
    await box(page, '暱稱').fill('W'.repeat(24));
    const url = await shareLink(page);
    await page.goto(url);
    await expect(page.getByTestId('viewer')).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});

test.describe('390 寬', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 390, height: 844 } });

  test('每個分頁都沒有橫向捲動；視覺基準', async ({ page }) => {
    const errors = await open(page);
    await fillSample(page);
    for (const t of ['自介卡', '地雷表', '外觀', 'KP 對照']) {
      await tab(page, t).click();
      await noHorizontalScroll(page);
    }
    await tab(page, '自介卡').click();
    await page.getByRole('radio', { name: '純文字' }).click();
    await noHorizontalScroll(page);
    await page.getByRole('radio', { name: '圖片' }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId('card-preview')).toHaveAttribute('data-painted', /\d/);
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('pl-profile-390.png', {
      mask: [page.getByRole('status').filter({ hasText: '自動儲存' })],
    });
    /* KP 對照表：表格在自己的捲動區裡，頁面不橫向捲動 */
    await tab(page, 'KP 對照').click();
    await btn(page, '加入我自己的地雷表').click();
    await expect(page.getByTestId('compare-table')).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
