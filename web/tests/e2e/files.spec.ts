/**
 * 檔案相關的端對端測試：圖片拖放區＋裁切、上傳字型（IndexedDB）、專案檔存取。
 */
import { existsSync, readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { encodePng } from '../../src/core/encode/png';

const URL = '/next/_gallery/';

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
  await expect(page.getByRole('heading', { level: 1, name: '元件展示' })).toBeVisible();
  return errors;
}

/** 96×64 的測試圖：透明底、左邊紅色方塊、右邊藍色方塊 */
async function testPng(): Promise<Buffer> {
  const W = 96;
  const H = 64;
  const px = new Uint8Array(W * H * 4);
  for (let y = 8; y < 56; y++) {
    for (let x = 8; x < 88; x++) {
      const k = (y * W + x) * 4;
      const red = x < 56;
      px[k] = red ? 220 : 30;
      px[k + 1] = 30;
      px[k + 2] = red ? 30 : 220;
      px[k + 3] = 255;
    }
  }
  return Buffer.from(await encodePng(px, W, H));
}

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

test('圖片：選檔、取主色、透明邊界、固定 1:1 裁切', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('tab', { name: '圖片' }).click();
  const drop = page.getByRole('group', { name: '把圖片拖到這裡' });
  await drop
    .locator('input[type=file]')
    .setInputFiles({ name: '測試.png', mimeType: 'image/png', buffer: await testPng() });
  await expect(page.getByRole('list', { name: '已加入的圖片' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await expect(page.getByText('#dc1e1e')).toBeVisible();
  await expect(page.getByText('不透明範圍（opaqueBounds）：X 8、Y 8、80×48')).toBeVisible();

  await page.getByRole('button', { name: '裁切（固定 1:1）' }).click();
  const dialog = page.getByRole('dialog', { name: '裁切圖片' });
  await expect(dialog).toBeVisible();
  const box = dialog.getByRole('group', { name: /裁切範圍/ });
  await expect(box).toHaveAccessibleName(/寬 64、高 64/);
  await box.focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Shift+ArrowRight');
  await dialog.getByRole('button', { name: '確定' }).click();
  await expect(page.getByTestId('crop-result')).toHaveText(/63×63/);
  expect(errors).toEqual([]);
});

const FONT = '/usr/share/fonts/opentype/tlwg/Loma.otf';

test('字型：上傳後讀出名稱、存進 IndexedDB、重新整理後還在', async ({ page }) => {
  test.skip(!existsSync(FONT), '這台機器沒有測試用字型檔');
  const errors = await open(page);
  await page.getByRole('button', { name: /^字型/ }).click();
  const dialog = page.getByRole('dialog', { name: '選擇字型' });
  await dialog.getByRole('tab', { name: '上傳字型' }).click();
  await dialog.locator('input[type=file]').setInputFiles(FONT);
  const radio = dialog.getByRole('radiogroup', { name: '上傳的字型' }).getByRole('radio');
  await expect(radio).toHaveCount(1);
  await expect(radio).toBeChecked();
  await expect(dialog.getByText('Loma.otf')).toBeVisible();
  await dialog.getByRole('button', { name: '完成' }).click();
  await expect(page.getByRole('button', { name: /^字型 Loma/ })).toContainText('上傳');
  expect(await page.evaluate(() => document.fonts.check('16px "Loma"'))).toBe(true);

  await page.reload();
  await page.getByRole('button', { name: /^字型/ }).click();
  await page
    .getByRole('dialog', { name: '選擇字型' })
    .getByRole('tab', { name: '上傳字型' })
    .click();
  await expect(page.getByRole('radiogroup', { name: '上傳的字型' }).getByRole('radio')).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: '刪除「Loma」' }).click();
  await expect(page.getByText('還沒有上傳任何字型。')).toBeVisible();
  expect(errors).toEqual([]);
});

test('專案檔：存成 JSON、修改後再開啟還原', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '專案' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
  ]);
  const path = await download.path();
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json).toMatchObject({
    format: 'trpg-toolkit-project',
    tool: '_gallery',
    version: 1,
    data: { text: '大成功！' },
  });
  expect(download.suggestedFilename()).toMatch(/^元件展示_\d{8}\.json$/);

  await page.getByRole('textbox', { name: '判定文字' }).fill('改掉了');
  await page.getByRole('button', { name: '專案' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser.setFiles(path);
  await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
  await expect(page.getByRole('textbox', { name: '判定文字' })).toHaveValue('大成功！');
  await expect(page.getByText('已開啟專案檔').first()).toBeVisible();

  /* 其他工具的專案檔：顯示錯誤 */
  await page.getByRole('button', { name: '專案' }).click();
  const [chooser2] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
  ]);
  await chooser2.setFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...json, tool: 'battlemap' })),
  });
  await expect(
    page.getByText('這是其他工具（battlemap）的專案檔，無法在這裡開啟。').first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
