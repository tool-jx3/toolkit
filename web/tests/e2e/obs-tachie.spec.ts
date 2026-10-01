/**
 * Discord 通話立繪產生器（建置產物 next/obs-tachie/）的端對端測試：
 * - 開頁沒有 pageerror／console error；三個步驟與上一步／下一步（F01、F02）；
 * - ① 使用者：新增（只留數字）、錯誤、同 ID 取代、畫面上的名字、刪除確認（F03～F06）；
 * - ② 預設集：新增、選取、名稱、刪除確認、空狀態（F08～F11）；圖片上傳／網址／修邊／範圍裁切（F12～F24）；
 *   位置與效果的提示、停用與恢復預設（F25～F45）；
 * - 預覽：通話中開關、點擊切換說話、說話時預覽變化（F46～F50）；
 * - ③ 組合、儲存、已儲存、複製、下載（檔名）、警告（F52～F59）；
 * - 輸出 CSS 套到依規格 3.1 自寫的 Streamkit 模擬 DOM：位置、尺寸、說話效果的時間點、變暗、隱藏、名字（3.4）；
 * - 自動存檔與還原、專案檔存出／開啟（含圖片）（F76、裁定）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('obs-tachie') ?? { id: 'obs-tachie', status: 'next' })}/`;
const ID = '123456789012345678';
const ID2 = '223456789012345678';

/** 規格 3.4 的測試圖：300 × 600，不透明內容在 x 70～229、y 40～559，顏色 (60,110,200) */
async function testPng(w = 300, h = 600, c = { x: 70, y: 40, width: 160, height: 520 }) {
  const px = new Uint8Array(w * h * 4);
  for (let y = c.y; y < c.y + c.height; y++)
    for (let x = c.x; x < c.x + c.width; x++) {
      const k = (y * w + x) * 4;
      px[k] = 60;
      px[k + 1] = 110;
      px[k + 2] = 200;
      px[k + 3] = 255;
    }
  return Buffer.from(await encodePng(px, w, h));
}

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(`${URL}${query}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Discord 通話立繪產生器' }),
  ).toBeVisible();
  return errors;
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const stepButton = (page: Page, label: string) =>
  page.getByRole('navigation', { name: '步驟' }).getByRole('button', { name: new RegExp(label) });

async function addUser(page: Page, id: string, memo = '', name = '') {
  await page.getByLabel('Discord 使用者 ID').fill(id);
  await page.getByLabel('備忘名稱（選填）').fill(memo);
  await page.getByLabel('畫面上的名字（選填）').fill(name);
  await btn(page, '新增').click();
}

async function goStep(page: Page, n: 1 | 2 | 3) {
  await stepButton(page, ['使用者', '立繪與效果', '組合與輸出'][n - 1]).click();
  await expect(page.getByText(`步驟 ${n}／3`)).toBeVisible();
}

async function upload(page: Page, buffer: Buffer, name = 'tachie.png', mimeType = 'image/png') {
  await page.getByRole('radio', { name: '上傳', exact: true }).click();
  await page
    .getByRole('group', { name: '把立繪圖片拖到這裡' })
    .locator('input[type=file]')
    .setInputFiles({ name, mimeType, buffer });
}

/** 新增使用者與一個有圖片的預設集，停在第 2 步 */
async function setup(page: Page) {
  await addUser(page, ID, '阿明', '艾琳');
  await goStep(page, 2);
  await btn(page, '新增預設集').click();
  await page.getByLabel('預設集名稱').fill('平常 v2');
  await upload(page, await testPng());
  await expect(page.getByTestId('image-size')).toHaveText('300×600px');
}

/** 預覽 iframe 裡 #root 的狀態 */
async function previewRoot(page: Page, testId: string) {
  return page.evaluate((id) => {
    const f = document.querySelector(`[data-testid="${id}"] iframe`) as HTMLIFrameElement;
    const doc = f.contentDocument!;
    const root = doc.getElementById('root')!;
    const cs = doc.defaultView!.getComputedStyle(root);
    const r = root.getBoundingClientRect();
    return {
      display: cs.display,
      transform: cs.transform,
      filter: cs.filter,
      opacity: cs.opacity,
      animation: cs.animationName,
      rect: [r.x, r.y, r.width, r.height],
    };
  }, testId);
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('Discord 通話立繪產生器', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('開頁在第 1 步；步驟列與上一步／下一步（F01、F02）', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByText('步驟 1／3')).toBeVisible();
    await expect(stepButton(page, '使用者')).toHaveAttribute('aria-current', 'step');
    /* 第 1 步時上一步不顯示（保留位置） */
    await expect(btn(page, '上一步')).toBeHidden();
    await btn(page, '下一步').click();
    await expect(page.getByText('步驟 2／3')).toBeVisible();
    await expect(stepButton(page, '使用者')).toContainText('已完成');
    await expect(stepButton(page, '立繪與效果')).toHaveAttribute('aria-current', 'step');
    await stepButton(page, '組合與輸出').click();
    await expect(page.getByText('步驟 3／3')).toBeVisible();
    await expect(btn(page, '下一步')).toBeDisabled();
    await btn(page, '上一步').click();
    await expect(page.getByText('步驟 2／3')).toBeVisible();
    /* 步驟不存檔：重新開頁回到第 1 步 */
    await page.reload();
    await expect(page.getByText('步驟 1／3')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('① 使用者：新增、錯誤、同 ID 取代、畫面上的名字、刪除確認（F03～F06）', async ({ page }) => {
    const errors = await open(page);
    const list = page.getByRole('list', { name: '已登錄的使用者' });
    await expect(page.getByText('還沒有使用者。')).toBeVisible();
    /* 去完是空的：錯誤、不新增 */
    await addUser(page, 'abc');
    await expect(page.getByText('請輸入 Discord 使用者 ID（數字）。')).toBeVisible();
    await expect(page.getByLabel('Discord 使用者 ID')).toHaveValue('abc');
    /* 去掉所有非數字；成功後欄位清空、錯誤消失 */
    await addUser(page, ' 1234-5678abc9012345678 ', '  阿明 ', '艾琳');
    await expect(page.getByText('請輸入 Discord 使用者 ID（數字）。')).toBeHidden();
    await expect(page.getByLabel('Discord 使用者 ID')).toHaveValue('');
    await expect(page.getByLabel('備忘名稱（選填）')).toHaveValue('');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('阿明');
    await expect(list).toContainText(`ID ${ID}`);
    await expect(page.getByText('使用者（1）')).toBeVisible();
    await addUser(page, ID2);
    await expect(list.getByRole('listitem').nth(1)).toContainText('無名稱');
    /* 畫面上的名字：佔位＝備忘名稱，沒有時「未設定」；改了立即生效 */
    const name2 = page.getByRole('textbox', { name: '畫面上的名字（無名稱）' });
    await expect(name2).toHaveAttribute('placeholder', '未設定');
    await name2.fill('凱');
    /* 同一個 ID 再新增：取代並移到最後 */
    await addUser(page, ID, '小明');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByRole('listitem').nth(1)).toContainText('小明');
    await expect(page.getByText('已經登錄過')).toBeVisible();
    /* 刪除：先確認，說明連帶刪除的已儲存組合 */
    await goStep(page, 2);
    await btn(page, '新增預設集').click();
    await goStep(page, 3);
    /* 各用清單的第一個（ID2）→ 存成組合 */
    await expect(page.getByRole('combobox', { name: '使用者' })).toContainText(ID2);
    await btn(page, '儲存組合').click();
    await expect(btn(page, '已儲存')).toBeDisabled();
    await goStep(page, 1);
    await page.getByRole('button', { name: '刪除「小明」' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('刪除使用者「小明」？');
    await expect(dialog).toContainText('沒有用到它的已儲存組合');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: '刪除「無名稱」' }).click();
    await expect(dialog).toContainText(`會一起刪除 1 組已儲存的組合：${ID2} × 未命名。`);
    await dialog.getByRole('button', { name: '刪除' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await goStep(page, 3);
    await expect(page.getByText('已儲存的組合（0）')).toBeVisible();
    /* 正選著他的話改回預設（第一個） */
    await expect(page.getByRole('combobox', { name: '使用者' })).toContainText(`小明（${ID}）`);
    expect(errors).toEqual([]);
  });

  test('② 預設集：新增、選取、名稱、刪除確認、空狀態（F08～F11）', async ({ page }) => {
    const errors = await open(page);
    await goStep(page, 2);
    await expect(page.getByTestId('editor-empty')).toBeVisible();
    await expect(page.getByTestId('look-preview-empty')).toBeVisible();
    await btn(page, '新增預設集').click();
    await expect(page.getByTestId('preset-editor')).toBeVisible();
    const list = page.getByRole('list', { name: '外觀預設集' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('未命名');
    await expect(list.getByRole('img', { name: '沒有圖片' })).toHaveText('?');
    await page.getByLabel('預設集名稱').fill('平常');
    await expect(list).toContainText('平常');
    await btn(page, '新增預設集').click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    /* 新增的立刻成為編輯中的那個 */
    await expect(page.getByLabel('預設集名稱')).toHaveValue('');
    await page.getByLabel('預設集名稱').fill('戰鬥');
    await list.getByRole('button', { name: '平常', exact: true }).click();
    await expect(page.getByLabel('預設集名稱')).toHaveValue('平常');
    await expect(list.getByRole('button', { name: '平常', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    /* 刪除編輯中的那個：先確認，之後改編輯第一個 */
    await page.getByRole('button', { name: '刪除「平常」' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByLabel('預設集名稱')).toHaveValue('戰鬥');
    expect(errors).toEqual([]);
  });

  test('② 圖片：上傳、錯誤、網址、修邊、範圍裁切（F12～F24）', async ({ page }) => {
    await page.route('https://example.com/**', async (r) =>
      r.request().url().includes('missing')
        ? r.fulfill({ status: 404, body: 'no' })
        : r.fulfill({
            status: 200,
            contentType: 'image/png',
            headers: { 'access-control-allow-origin': '*' },
            body: await testPng(),
          }),
    );
    await page.route('https://i.imgur.com/**', async (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: await testPng() }),
    );
    await page.route('https://cdn.discordapp.com/attachments/**', async (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: await testPng() }),
    );
    const errors = await open(page);
    await goStep(page, 2);
    await btn(page, '新增預設集').click();
    /* 目前圖片：未設定；輸入方式預設網址 */
    await expect(page.getByRole('radio', { name: '網址', exact: true })).toBeChecked();
    await expect(page.getByTestId('crop-area')).toBeHidden();
    const msg = page.getByTestId('image-message');

    /* 網址：空白、格式不正確（裁定：欄位旁提示並拒絕） */
    await btn(page, '套用網址').click();
    await expect(msg).toHaveText('請先貼上圖片網址。');
    await page.getByLabel('圖片網址').fill('not a url');
    await expect(page.getByText('這不是 http(s) 開頭的網址，也不是 data URI。')).toBeVisible();
    await btn(page, '套用網址').click();
    await expect(msg).toContainText('網址格式不正確');

    /* 可直接顯示的主機：自動 → 保留網址；無法裁切 */
    await page.getByLabel('圖片網址').fill('https://i.imgur.com/abc.png');
    await btn(page, '套用網址').click();
    await expect(msg).toHaveText('已設定（直接用網址）。');
    await expect(page.getByTestId('image-bytes')).toHaveText('直接參照網址（沒有嵌入）');
    await expect(page.getByText('讀不到像素，所以無法裁切')).toBeVisible();
    await expect(page.getByTestId('image-size')).toHaveText('300×600px');

    /* 會過期的 Discord 連結：直接用網址 → 警告 */
    await page.getByRole('radio', { name: '直接用網址' }).click();
    await page.getByLabel('圖片網址').fill('https://cdn.discordapp.com/attachments/1/2/a.png?ex=1');
    await btn(page, '套用網址').click();
    await expect(msg).toContainText('已設定（直接用網址）。');
    await expect(msg).toContainText('約 24 小時後就會失效');

    /* 其他主機：自動 → 下載轉嵌入；失敗時保留網址並警告 */
    await page.getByRole('radio', { name: '自動' }).click();
    await page.getByLabel('圖片網址').fill('https://example.com/a.png');
    await btn(page, '套用網址').click();
    await expect(msg).toHaveText('已設定（不是可直接顯示的主機，已改嵌入）。');
    await expect(page.getByTestId('image-bytes')).toContainText('KB');
    await page.getByLabel('圖片網址').fill('https://example.com/missing.png');
    await btn(page, '套用網址').click();
    await expect(msg).toContainText('可能會被擋，而且轉成嵌入失敗');
    await expect(msg).toContainText('HTTP 404');

    /* data URI：直接採用 */
    const uri = `data:image/png;base64,${(await testPng(10, 20, { x: 0, y: 0, width: 10, height: 20 })).toString('base64')}`;
    await page.getByLabel('圖片網址').fill(uri);
    await btn(page, '套用網址').click();
    await expect(msg).toHaveText('已設定（已嵌入）。');
    await expect(page.getByTestId('image-size')).toHaveText('10×20px');

    /* 上傳：超過 8 MB、讀不出來 → 錯誤，不改圖片 */
    await upload(page, Buffer.alloc(8 * 1024 * 1024 + 1), 'big.png');
    await expect(msg).toContainText('圖片太大');
    await upload(page, Buffer.from('not an image'), 'bad.png');
    await expect(msg).toContainText('讀不出這張圖片');
    await expect(page.getByTestId('image-size')).toHaveText('10×20px');

    /* 嵌入時的最大寬度：比這寬的等比縮小並改存 PNG */
    await page.getByLabel('嵌入時的最大寬度').fill('150');
    await upload(page, await testPng());
    await expect(msg).toContainText('150×300px');
    await expect(msg).toContainText('已縮小到寬 150px 並存成 PNG');
    await page.getByLabel('嵌入時的最大寬度').fill('0');
    await upload(page, await testPng());
    await expect(msg).toContainText('300×600px');
    await expect(page.getByTestId('image-size')).toHaveText('300×600px');
    await expect(page.getByTestId('image-bytes')).toContainText('KB');

    /* 修掉透明留白：面板內兩段式確認；取消不變、套用才換 */
    await btn(page, '修掉透明留白').click();
    const confirm = page.getByTestId('trim-confirm');
    await expect(confirm).toContainText('原尺寸 300×600px → 裁切後 160×520px');
    await expect(confirm).toContainText('無法復原');
    await expect(confirm.getByTestId('crop-summary')).toContainText(/嵌入大小 .+KB → .+KB/);
    await confirm.getByRole('button', { name: '取消' }).click();
    await expect(page.getByTestId('image-size')).toHaveText('300×600px');
    await btn(page, '修掉透明留白').click();
    await page.getByTestId('trim-confirm').getByRole('button', { name: '套用' }).click();
    await expect(page.getByTestId('image-size')).toHaveText('160×520px');
    await expect(page.getByTestId('crop-message')).toHaveText('已套用裁切。');
    /* 整張不透明：沒有可修的留白 */
    await btn(page, '修掉透明留白').click();
    await expect(page.getByTestId('crop-message')).toContainText('沒有可修的留白');

    /* 指定範圍裁切：數字欄不即時修正，範圍在圖外／整張圖時不能確定 */
    await btn(page, '指定範圍裁切').click();
    const dialog = page.getByRole('dialog', { name: '指定範圍裁切' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('範圍等於整張圖片')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '確定' })).toBeDisabled();
    await dialog.getByRole('spinbutton', { name: 'X' }).fill('9999');
    await expect(dialog.getByText('範圍在圖片外')).toBeVisible();
    await dialog.getByRole('spinbutton', { name: 'X' }).fill('10');
    await dialog.getByRole('spinbutton', { name: '寬' }).fill('5000');
    await expect(dialog.getByText('裁切後 150×520px')).toBeVisible();
    await dialog.getByRole('spinbutton', { name: '寬' }).fill('100');
    await dialog.getByRole('button', { name: '確定' }).click();
    await expect(dialog.getByTestId('crop-summary')).toContainText('160×520px → 裁切後 100×520px');
    await dialog.getByRole('button', { name: '套用' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('image-size')).toHaveText('100×520px');
    await expect(page.getByTestId('crop-message')).toHaveText('已套用裁切。');
    /* 縮圖出現在清單 */
    await expect(page.getByRole('list', { name: '外觀預設集' }).locator('img')).toHaveCount(1);
    /* 404 是故意的（轉成嵌入失敗的情況） */
    expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  });

  test('② 位置與效果：標籤、邊距提示、停用與原因、恢復預設（F25～F45）', async ({ page }) => {
    const errors = await open(page);
    await setup(page);
    await expect(page.getByTestId('anchor-now')).toHaveText('目前的基準：左下');
    /* 預設（外框寬 2、距離 0）→ 兩軸都警告需要 14 */
    await expect(page.locator('[data-margin="warn"]')).toHaveCount(2);
    await expect(page.locator('[data-margin="warn"]').first()).toHaveText(
      '效果會被切掉，建議至少 14px',
    );
    await page.getByLabel('距左緣').fill('20');
    await expect(page.locator('[data-margin="need"]')).toHaveText('說話效果需要 14px 的邊距');
    /* 錨點左上、彈跳 10 → 垂直 24；標籤跟著變 */
    await page.getByRole('radio', { name: '左上' }).click();
    await expect(page.getByLabel('距上緣')).toBeVisible();
    await expect(page.locator('[data-margin="warn"]')).toHaveText('效果會被切掉，建議至少 24px');
    await page.getByRole('radio', { name: '正中央' }).click();
    await expect(page.getByLabel('相對水平中央的偏移（正值往右）')).toBeVisible();
    await expect(page.getByLabel('相對垂直中央的偏移（正值往上）')).toBeVisible();
    await expect(page.locator('[data-margin]')).toHaveCount(0);
    /* 效果：開關、停用與原因 */
    const bounce = page.getByRole('button', { name: '彈跳', exact: true });
    await expect(bounce).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '閃爍', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await bounce.click();
    await expect(page.getByLabel('彈跳高度')).toBeDisabled();
    await expect(page.getByText('彈跳沒有開，這個設定不會用到。')).toBeVisible();
    await page.getByRole('button', { name: '外框光暈', exact: true }).click();
    await expect(page.getByLabel('外框寬度')).toBeDisabled();
    /* 寬度：空白＝原尺寸 */
    await expect(page.getByLabel('寬度', { exact: true })).toHaveAttribute('placeholder', '原尺寸');
    /* 名字標籤 */
    await expect(page.getByLabel('文字大小')).toBeHidden();
    await page.getByRole('switch', { name: '顯示名字' }).click();
    await expect(page.getByLabel('文字大小')).toHaveValue('32');
    await expect(page.getByLabel('垂直位置（正值往上，從立繪的垂直中央算起）')).toBeVisible();
    await expect(page.getByTestId('align-base')).toHaveText(
      '在寬度 300px 內對齊（用的是圖片實際寬度，換圖要重新輸出）',
    );
    await page.getByLabel('寬度', { exact: true }).fill('150');
    await expect(page.getByTestId('align-base')).toHaveText('在寬度 150px 內對齊');
    await page.getByRole('button', { name: '描邊', exact: true }).click();
    await expect(page.getByLabel('描邊寬度')).toBeDisabled();
    await page.getByRole('button', { name: '字幕條', exact: true }).click();
    await expect(page.getByTestId('bar-settings')).toBeVisible();
    await expect(page.getByLabel('不透明度')).toHaveValue('60');
    /* 恢復預設：保留名稱與圖片 */
    await btn(page, '選項恢復預設').click();
    await expect(page.getByTestId('anchor-now')).toHaveText('目前的基準：左下');
    await expect(bounce).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('文字大小')).toBeHidden();
    await expect(page.getByLabel('預設集名稱')).toHaveValue('平常 v2');
    await expect(page.getByTestId('image-size')).toHaveText('300×600px');
    expect(errors).toEqual([]);
  });

  test('預覽：通話中開關、點擊切換說話、說話時預覽變化（F46～F50）', async ({ page }) => {
    const errors = await open(page, '?pause=375');
    await setup(page);
    const status = page.getByTestId('look-preview-status');
    const toggle = page.getByTestId('look-preview-toggle');
    await expect(status).toHaveText('通話中・安靜');
    let r = await previewRoot(page, 'look-preview');
    expect(r.animation).toBe('none');
    expect(r.rect).toEqual([0, 480, 300, 600]);
    /* 點預覽 → 說話中：P/2 時往上 10px、外框光暈最大 */
    await toggle.click();
    await expect(status).toHaveText('通話中・說話中');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await previewRoot(page, 'look-preview')).transform)
      .toBe('matrix(1, 0, 0, 1, 0, -10)');
    r = await previewRoot(page, 'look-preview');
    expect(r.filter).toContain('drop-shadow(rgb(255, 255, 255) 0px 0px 8px)');
    /* 鍵盤：Enter 切回安靜 */
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('通話中・安靜');
    await expect.poll(async () => (await previewRoot(page, 'look-preview')).animation).toBe('none');
    /* 不在頻道：常駐顯示、點擊無效；開了「不在頻道時隱藏」時消失 */
    await page.getByRole('switch', { name: '在頻道裡' }).click();
    await expect(status).toHaveText('不在頻道（常駐顯示）');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    await toggle.dispatchEvent('click');
    await expect(status).toHaveText('不在頻道（常駐顯示）');
    expect((await previewRoot(page, 'look-preview')).display).toBe('block');
    await page.getByRole('switch', { name: '不在頻道時隱藏' }).click();
    await expect(status).toHaveText('不在頻道（此設定下不顯示）');
    await expect.poll(async () => (await previewRoot(page, 'look-preview')).display).toBe('none');
    await page.getByRole('switch', { name: '在頻道裡' }).click();
    await expect.poll(async () => (await previewRoot(page, 'look-preview')).display).toBe('block');
    /* 名字：第 2 步用選中的人的名字；沒有名字時暫定「名字」並註明 */
    await page.getByRole('switch', { name: '顯示名字' }).click();
    const after = () =>
      page.evaluate(() => {
        const f = document.querySelector(
          '[data-testid="look-preview"] iframe',
        ) as HTMLIFrameElement;
        return f.contentDocument!.defaultView!.getComputedStyle(f.contentDocument!.body, '::after')
          .content;
      });
    await expect.poll(after).toBe('"艾琳"');
    await goStep(page, 1);
    await page.getByRole('textbox', { name: '畫面上的名字（阿明）' }).fill('');
    await page.getByRole('button', { name: '刪除「阿明」' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '刪除' }).click();
    await goStep(page, 2);
    await expect.poll(after).toBe('"名字"');
    await expect(page.getByText('預覽暫時用「名字」顯示')).toBeVisible();
    /* 沒有圖片時畫佔位框 */
    await btn(page, '新增預設集').click();
    r = await previewRoot(page, 'look-preview');
    expect(r.rect.slice(2)).toEqual([384, 768]);
    expect(errors).toEqual([]);
  });

  test('③ 組合與輸出：選擇、儲存、已儲存、複製、下載、警告（F52～F59）', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await goStep(page, 3);
    await expect(page.getByText('先在第 1 步登錄使用者、第 2 步新增預設集')).toHaveCount(2);
    await goStep(page, 1);
    await setup(page);
    await btn(page, '新增預設集').click();
    await page.getByLabel('預設集名稱').fill('戰鬥');
    await goStep(page, 1);
    await addUser(page, ID2, '', '');
    await goStep(page, 3);
    /* 各用清單的第一個 */
    const userSel = page.getByRole('combobox', { name: '使用者' });
    const presetSel = page.getByRole('combobox', { name: '預設集' });
    await expect(userSel).toHaveText(`阿明（${ID}）`);
    await expect(presetSel).toHaveText('平常 v2');
    await expect(page.getByTestId('output-title')).toHaveText('阿明 × 平常 v2');
    const css = page.getByRole('textbox', { name: '目前的 CSS（唯讀）' });
    await expect(css).toHaveValue(/content: url\("data:image\/png;base64,/);
    await expect(css).toHaveValue(/width: 300px !important;/);
    /* 儲存組合 */
    await btn(page, '儲存組合').click();
    await expect(btn(page, '已儲存')).toBeDisabled();
    const saved = page.getByRole('list', { name: '已儲存的組合' });
    await expect(saved).toContainText('阿明 × 平常 v2');
    /* 換使用者只換 ID，外觀不變 */
    await userSel.click();
    await page.getByRole('option', { name: ID2 }).click();
    await expect(page.getByTestId('output-title')).toHaveText(`${ID2} × 平常 v2`);
    await expect(css).toHaveValue(new RegExp(`/avatars/${ID2}/`));
    await expect(btn(page, '儲存組合')).toBeEnabled();
    await presetSel.click();
    await page.getByRole('option', { name: '戰鬥' }).click();
    await btn(page, '儲存組合').click();
    await expect(page.getByText('已儲存的組合（2）')).toBeVisible();
    /* 點已儲存的一列 → 兩個下拉換成那一組，醒目標示 */
    await saved.getByRole('button', { name: '阿明 × 平常 v2', exact: true }).click();
    await expect(userSel).toHaveText(`阿明（${ID}）`);
    await expect(
      saved.getByRole('button', { name: '阿明 × 平常 v2', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    /* 複製：「已複製」約 1.5 秒後消失 */
    await btn(page, '複製 CSS').click();
    await expect(page.getByText('已複製', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await css.inputValue());
    await expect(page.getByText('已複製', { exact: true })).toBeHidden({ timeout: 2500 });
    /* 下載：streamkit-阿明-平常_v2.css */
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      btn(page, '儲存 .css').click(),
    ]);
    expect(download.suggestedFilename()).toBe('streamkit-阿明-平常_v2.css');
    expect(readFileSync((await download.path())!, 'utf8')).toBe(await css.inputValue());
    /* 刪除已儲存的組合（不詢問） */
    await saved.getByRole('button', { name: `刪除「${ID2} × 戰鬥」` }).click();
    await expect(page.getByText('已儲存的組合（1）')).toBeVisible();
    /* F59：名字顯示開著、置中，但沒有寬度又量不到 → 警告（用網址圖片，量測失敗） */
    await goStep(page, 2);
    await page
      .getByRole('list', { name: '外觀預設集' })
      .getByRole('button', { name: '平常 v2', exact: true })
      .click();
    await page.getByRole('switch', { name: '顯示名字' }).click();
    await page.route('https://i.imgur.com/**', (r) => r.fulfill({ status: 404, body: '' }));
    await page.getByRole('radio', { name: '網址', exact: true }).click();
    await page.getByLabel('圖片網址').fill('https://i.imgur.com/none.png');
    await btn(page, '套用網址').click();
    await expect(page.getByTestId('image-size')).toHaveText('不明', { timeout: 10_000 });
    await goStep(page, 3);
    await expect(page.getByText('名字的對齊沒有寫進輸出')).toBeVisible();
    await expect(css).toHaveValue(/width: auto !important;/);
    /* 名字是空的時警告（第 3 步） */
    await userSel.click();
    await page.getByRole('option', { name: ID2 }).click();
    await expect(page.getByText('名字顯示開著，但這個人的名字是空的')).toBeVisible();
    expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
  });

  test('複製失敗時顯示錯誤並選取全文（裁定）', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      document.execCommand = () => false;
    });
    const errors = await open(page);
    await setup(page);
    await goStep(page, 3);
    await btn(page, '複製 CSS').click();
    await expect(page.getByText('無法自動複製')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('自動存檔與還原；專案檔存出／開啟（含圖片）（F76、F77 裁定）', async ({ page, browser }) => {
    const errors = await open(page);
    await setup(page);
    await goStep(page, 3);
    await btn(page, '儲存組合').click();
    /* 重新整理：使用者、預設集（含圖片）、已儲存組合都還在 */
    await page.reload();
    await goStep(page, 2);
    await expect(page.getByLabel('預設集名稱')).toHaveValue('平常 v2');
    await expect(page.getByTestId('image-size')).toHaveText('300×600px');
    /* 圖片輸入方式不存檔 */
    await expect(page.getByRole('radio', { name: '網址', exact: true })).toBeChecked();
    await goStep(page, 3);
    await expect(page.getByText('已儲存的組合（1）')).toBeVisible();

    /* 存成專案檔 */
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^通話立繪_\d{8}\.json$/);
    const path = (await download.path())!;
    const json = JSON.parse(readFileSync(path, 'utf8'));
    expect(json).toMatchObject({ format: 'trpg-toolkit-project', tool: 'obs-tachie' });
    expect(json.data.data.users).toEqual([{ id: ID, memo: '阿明', name: '艾琳' }]);
    const key = json.data.data.presets[0].image;
    expect(json.data.images[key]).toMatch(/^data:image\/png;base64,/);

    /* 重設 → 全部清空（可以復原） */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設' }).click();
    await expect(page.getByTestId('output-empty')).toBeVisible();
    await page.getByRole('button', { name: '復原（Ctrl＋Z）' }).click();
    await expect(page.getByTestId('output-title')).toHaveText('阿明 × 平常 v2');
    expect(errors).toEqual([]);

    /* 換一台電腦（新的瀏覽器環境）：開啟專案檔 → 全部回來（含圖片），重新整理後也還在 */
    const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await other.newPage();
    const errors2 = await open(p2);
    await goStep(p2, 3);
    await expect(p2.getByTestId('output-empty')).toBeVisible();
    await p2.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      p2.waitForEvent('filechooser'),
      p2.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles(path);
    await p2.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(p2.getByTestId('output-title')).toHaveText('阿明 × 平常 v2');
    await expect(p2.getByRole('textbox', { name: '目前的 CSS（唯讀）' })).toHaveValue(
      /width: 300px !important;/,
    );
    await expect(p2.getByText('已儲存的組合（1）')).toBeVisible();
    await p2.reload();
    await goStep(p2, 2);
    await expect(p2.getByTestId('image-size')).toHaveText('300×600px');
    await other.close();
    expect(errors2).toEqual([]);
  });
});

/* ---------- 輸出 CSS 套到 Streamkit 模擬 DOM（規格 3.1 的結構，雜湊故意用別的） ---------- */

const MOCK = (users: { id: string; speaking?: boolean; custom?: boolean }[]) => `<!doctype html>
<html><head><meta charset="utf-8"><style id="tk"></style>
<style>body{font-family:sans-serif;color:#fff}.Voice_voiceState__q1{display:flex;height:46px}.Voice_avatar__q2{width:40px;height:40px;border-radius:50%}</style>
</head><body><div id="root"><div class="Voice_voiceContainer__q0"><ul class="Voice_voiceStates__q9">${users
  .map(
    (u) =>
      `<li class="Voice_voiceState__q1" data-id="${u.id}"><img class="Voice_avatar__q2${u.speaking ? ' Voice_avatarSpeaking__q3' : ''}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=#${
        u.custom === false
          ? 'https://cdn.discordapp.com/embed/avatars/1.png'
          : `https://cdn.discordapp.com/avatars/${u.id}/abc123.png?size=128`
      }"><div class="Voice_user__q4"><span class="Voice_name__q5">user</span></div></li>`,
  )
  .join('')}</ul></div></div></body></html>`;

test.describe('輸出 CSS 的效果（3.4，模擬 DOM 1920 × 1080）', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('位置、尺寸、說話效果、變暗、隱藏、名字', async ({ page, browser }) => {
    const errors = await open(page);
    await page.waitForFunction(() => !!(window as unknown as { __obsTachie?: object }).__obsTachie);
    const img = `data:image/png;base64,${(await testPng()).toString('base64')}`;
    const build = (
      patch: Record<string, unknown>,
      o: { natural?: object | null; name?: string } = {},
    ) =>
      page.evaluate(
        ({ patch, img, o, id }) => {
          const api = (
            window as never as { __obsTachie: Record<string, (...a: unknown[]) => unknown> }
          ).__obsTachie;
          const p = api.createPreset('t') as Record<string, unknown>;
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'label') Object.assign(p.label as object, v);
            else p[k] = v;
          }
          return api.buildTachieCss({
            user: { id, memo: '測試', name: o.name ?? '艾琳' },
            preset: p,
            image: img,
            natural: o.natural === undefined ? { width: 300, height: 600 } : o.natural,
          }) as string;
        },
        { patch, img, o, id: ID },
      );

    const mock = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    type MockUser = { id: string; speaking?: boolean; custom?: boolean };
    const show = async (
      css: string,
      users: MockUser[] = [{ id: '999', speaking: true }, { id: ID }],
    ) => {
      await mock.setContent(MOCK(users));
      await mock.evaluate((c) => {
        document.getElementById('tk')!.textContent = c;
      }, css);
      await mock.evaluate(() => document.fonts.ready);
    };
    const root = () =>
      mock.evaluate(() => {
        const el = document.getElementById('root')!;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          box: [r.x, r.y, r.width, r.height],
          display: cs.display,
          filter: cs.filter,
          scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        };
      });
    /** 不透明內容（立繪的 x 70～229、y 40～559）在畫面上的範圍 */
    const content = async () => {
      const { box } = await root();
      const k = box[2] / 300;
      return [box[0] + 70 * k, box[0] + 230 * k - 1, box[1] + 40 * k, box[1] + 560 * k - 1];
    };
    const at = async (ms: number) =>
      mock.evaluate((t) => {
        for (const a of document.getAnimations()) {
          a.pause();
          a.currentTime = t;
        }
        const cs = getComputedStyle(document.getElementById('root')!);
        return { transform: cs.transform, opacity: Number(cs.opacity), filter: cs.filter };
      }, ms);
    /** 截圖找某個顏色的範圍（名字的字幕條） */
    const colorBox = async (rgb: [number, number, number]) => {
      const shot = await mock.screenshot({ omitBackground: true });
      return page.evaluate(
        async ({ b64, rgb }) => {
          const im = new Image();
          im.src = `data:image/png;base64,${b64}`;
          await im.decode();
          const c = document.createElement('canvas');
          c.width = im.width;
          c.height = im.height;
          const x = c.getContext('2d')!;
          x.drawImage(im, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let x0 = Infinity;
          let y0 = Infinity;
          let x1 = -1;
          let y1 = -1;
          for (let y = 0; y < c.height; y++)
            for (let xx = 0; xx < c.width; xx++) {
              const i = (y * c.width + xx) * 4;
              if (
                d[i + 3] > 250 &&
                Math.abs(d[i] - rgb[0]) < 3 &&
                Math.abs(d[i + 1] - rgb[1]) < 3 &&
                Math.abs(d[i + 2] - rgb[2]) < 3
              ) {
                x0 = Math.min(x0, xx);
                x1 = Math.max(x1, xx);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
              }
            }
          return [x0, x1, y0, y1];
        },
        { b64: shot.toString('base64'), rgb },
      );
    };
    const pixel = async (x: number, y: number) => {
      const shot = await mock.screenshot({
        omitBackground: true,
        clip: { x, y, width: 1, height: 1 },
      });
      return page.evaluate(async (b64) => {
        const im = new Image();
        im.src = `data:image/png;base64,${b64}`;
        await im.decode();
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const x = c.getContext('2d')!;
        x.drawImage(im, 0, 0);
        return Array.from(x.getImageData(0, 0, 1, 1).data);
      }, shot.toString('base64'));
    };

    /* 3.4.1：Streamkit 的頭像與名字不顯示、沒有捲軸 */
    await show(await build({}));
    expect(await mock.locator('img').first().isVisible()).toBe(false);
    expect(await mock.getByText('user').first().isVisible()).toBe(false);
    expect((await root()).scroll).toEqual([1920, 1080]);

    /* 3.4.2 的量測表 */
    const cases: [Record<string, unknown>, number[]][] = [
      [{ anchor: 'bottom-left' }, [70, 229, 520, 1039]],
      [{ anchor: 'bottom-left', offsetX: 100, offsetY: 50 }, [170, 329, 470, 989]],
      [{ anchor: 'center' }, [880, 1039, 280, 799]],
      [{ anchor: 'center', offsetX: 100, offsetY: 50 }, [980, 1139, 230, 749]],
      [{ anchor: 'top-right', offsetX: 40, offsetY: 30 }, [1650, 1809, 70, 589]],
    ];
    for (const [patch, want] of cases) {
      await show(await build(patch));
      expect(await content(), JSON.stringify(patch)).toEqual(want);
    }
    /* 3.4.3：寬度 150 → 內容 x 35～114、y 800～1059；量不到尺寸時以圖片本身大小（有寬度時依比例） */
    await show(await build({ width: 150 }));
    expect(await content()).toEqual([35, 114, 800, 1059]);
    await show(await build({}, { natural: null }));
    expect((await root()).box).toEqual([0, 480, 300, 600]);
    await show(await build({ width: 150, anchor: 'center' }, { natural: null }));
    expect((await root()).box).toEqual([885, 390, 150, 300]);

    /* 3.4.4：說話中才播放；別人說話不影響；彈跳 J＝40、P＝750 */
    await show(await build({ bounceHeight: 40, anchor: 'bottom' }));
    expect(await mock.evaluate(() => document.getAnimations().length)).toBe(0);
    await show(await build({ bounceHeight: 40, anchor: 'bottom' }), [{ id: ID, speaking: true }]);
    expect((await at(187.5)).transform).toBe('matrix(1, 0, 0, 1, 0, -20)');
    expect((await at(375)).transform).toBe('matrix(1, 0, 0, 1, 0, -40)');
    expect((await at(750)).transform).toBe('matrix(1, 0, 0, 1, 0, 0)');
    /* 下中錨點：彈跳時水平位置不變 */
    await at(375);
    expect((await content()).slice(0, 2)).toEqual([880, 1039]);
    /* 外框光暈：模糊半徑 w → 4w；閃爍 1 → 0.35 */
    await show(await build({ bounce: false, blink: true }), [{ id: ID, speaking: true }]);
    expect((await at(0)).filter).toContain('drop-shadow(rgb(255, 255, 255) 0px 0px 2px)');
    const half = await at(375);
    expect(half.filter).toContain('drop-shadow(rgb(255, 255, 255) 0px 0px 8px)');
    expect(half.opacity).toBeCloseTo(0.35, 2);
    expect((await at(187.5)).opacity).toBeCloseTo(0.675, 2);
    /* 沒有自訂頭像的人認不出來 */
    await show(await build({}), [{ id: ID, speaking: true, custom: false }]);
    expect(await mock.evaluate(() => document.getAnimations().length)).toBe(0);

    /* 3.4.5：安靜時變暗（像素減半）；說話時恢復 */
    const dim = await build({ dim: true, glow: false, bounce: false, blink: true });
    await show(dim);
    expect((await pixel(150, 780)).slice(0, 3)).toEqual([30, 55, 100]);
    await show(dim, [{ id: ID, speaking: true }]);
    await at(0);
    expect((await pixel(150, 780)).slice(0, 3)).toEqual([60, 110, 200]);
    /* 不在頻道時隱藏：立繪與名字一起 */
    const hide = await build({ hideAway: true, label: { show: true } });
    await show(hide, [{ id: '999' }]);
    expect((await root()).display).toBe('none');
    expect(await mock.evaluate(() => getComputedStyle(document.body, '::after').display)).toBe(
      'none',
    );
    await show(hide, [{ id: ID }]);
    expect((await root()).display).toBe('block');
    expect(await mock.evaluate(() => getComputedStyle(document.body, '::after').display)).toBe(
      'block',
    );

    /* 3.4.6：名字的位置（字幕條塗成純紅、不透明，找它的範圍） */
    const bar = {
      show: true,
      bar: true,
      barColor: '#ff0000',
      barOpacity: 100,
      stroke: false,
      color: '#ff0000',
    };
    await show(await build({ glow: false, label: { ...bar, barWidth: 'fill', align: 'left' } }));
    let b = await colorBox([255, 0, 0]);
    expect([b[0], b[1]]).toEqual([0, 299]);
    await show(await build({ glow: false, label: { ...bar, align: 'right' } }));
    b = await colorBox([255, 0, 0]);
    expect(Math.abs(b[1] - 299)).toBeLessThanOrEqual(1);
    await show(await build({ glow: false, label: { ...bar, align: 'left' } }));
    b = await colorBox([255, 0, 0]);
    expect(b[0]).toBe(0);
    await show(
      await build({
        glow: false,
        anchor: 'top-right',
        offsetX: 40,
        offsetY: 30,
        label: { ...bar, y: 10 },
      }),
    );
    b = await colorBox([255, 0, 0]);
    expect(b[2]).toBe(20);
    /* 預設的垂直位置（裁定）：立繪貼底時名字整個在畫面內 */
    await show(await build({ glow: false, label: { ...bar } }));
    b = await colorBox([255, 0, 0]);
    expect(b[3]).toBeLessThanOrEqual(1079 - 8);
    await mock.close();
    expect(errors).toEqual([]);
  });
});

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

  async function ready(page: Page) {
    await setup(page);
    await page.getByRole('switch', { name: '顯示名字' }).click();
    await page.getByLabel('距左緣').fill('40');
    await page.getByLabel('距下緣').fill('20');
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.mouse.move(0, 0);
    await expect(page.getByTestId('look-preview-status')).toHaveText('通話中・安靜');
  }

  test('視覺回歸：1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await ready(page);
    await expect(page).toHaveScreenshot('obs-tachie-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，三個步驟都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await ready(page);
    await noHorizontalScroll(page);
    await expect(page).toHaveScreenshot('obs-tachie-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    await goStep(page, 3);
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
