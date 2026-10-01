/**
 * 訊息框產生器（建置產物 next/message-box/）的端對端測試：
 * 開頁送出第一則、只顯示訊息框、關閉後維持隱藏（滑入／原位出現）、範本選了不套用與套用（復原）、
 * 來源寬高的確定與快捷鈕、滑桿放開才記一步、快捷鍵、分頁鍵盤與記住分頁、房間網址與「前往填寫」、
 * 複製／儲存 CSS、預覽套用與套用前、範例與自訂訊息、範例立繪與自訂立繪、專案檔與全部重來、
 * 窄來源維持大小、390 寬沒有橫向捲動、1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('message-box') ?? { id: 'message-box', status: 'next' })}/`;
const ROOT = '.MuiPaper-root[role="status"][aria-label="メッセージ"]';
const BOX = `${ROOT} > .MuiPaper-root`;

/** 1×1 的 PNG（自訂立繪用） */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(URL + query);
  await expect(page.getByRole('heading', { level: 1, name: '訊息框產生器' })).toBeVisible();
  return errors;
}

const frame = (page: Page) => page.frameLocator('iframe[title="OBS 預覽"]');
const status = (page: Page) => page.getByTestId('mb-status');

type Api = {
  scene: { phase: string; setInstant(v: boolean): void };
  settings(): Record<string, unknown>;
  preview(): Record<string, unknown>;
  set(p: Record<string, unknown>): void;
  css(): string;
  history(): number;
};
const api = <T>(page: Page, fn: (a: Api) => T) =>
  page.evaluate((src) => {
    const a = (window as unknown as { __messageBox: Api }).__messageBox;
    return new Function('a', `return (${src})(a)`)(a);
  }, fn.toString()) as Promise<T>;

/** 等目前這則打完（最後一則留著） */
const waitShown = (page: Page) =>
  expect.poll(() => api(page, (a) => a.scene.phase), { timeout: 15_000 }).toBe('shown');

/** 預覽 iframe 裡某個元素的計算樣式 */
const styleOf = (page: Page, sel: string, prop: string) =>
  page.evaluate(
    ([s, p]) => {
      const doc = (document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement)
        .contentDocument!;
      const el = doc.querySelector(s);
      return el ? doc.defaultView!.getComputedStyle(el).getPropertyValue(p) : null;
    },
    [sel, prop] as const,
  );

const tab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: '設定分類' }).getByRole('tab', { name, exact: true });

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('訊息框產生器', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('開頁：送出第一則、只顯示訊息框、預覽倍率與來源大小、靈感來源', async ({ page }) => {
    const errors = await open(page);
    const f = frame(page);
    await expect(f.locator(`${BOX} > div:last-child > p`)).toContainText('這間圖書館', {
      timeout: 10_000,
    });
    await expect(f.locator(ROOT)).toBeVisible();
    await expect(f.locator(`${ROOT} > img`)).toBeVisible();
    /* 房間畫面的其他部分（上方列、聊天欄、盤面）都看不見 */
    await expect(f.locator('header.MuiAppBar-root')).toBeHidden();
    await expect(f.locator('.MuiDrawer-paper')).toBeHidden();
    await expect(f.locator('button.MuiFab-root')).toBeHidden();
    expect(await styleOf(page, 'body', 'background-color')).toBe('rgba(0, 0, 0, 0)');
    await expect(status(page)).toContainText('就緒');
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 1280 × 高 720');
    const m = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="css-preview-area"]') as HTMLElement;
      const src = document.querySelector('[data-testid="css-preview-source"]') as HTMLElement;
      return { areaWidth: area.clientWidth, scale: Number(src.dataset.scale) };
    });
    expect(m.scale).toBeCloseTo(Math.min(1, (m.areaWidth - 32) / 1280, 560 / 720), 5);
    /* 預設位置：方框 x＝260～1020、底邊 704 */
    const r = await page.evaluate((sel) => {
      const doc = (document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement)
        .contentDocument!;
      const b = doc.querySelector(sel)!.getBoundingClientRect();
      return [b.left, b.right, b.bottom].map((v) => Math.round(v * 10) / 10);
    }, BOX);
    expect(r).toEqual([260, 1020, 704]);
    await expect(page.getByRole('link', { name: 'shiki365/message-box-maker' })).toHaveAttribute(
      'href',
      'https://github.com/shiki365/message-box-maker',
    );
    expect(errors).toEqual([]);
  });

  test('關閉後維持隱藏；滑入時從下方進來（?pause 取樣位移）', async ({ page }) => {
    const errors = await open(page, '?pause=60');
    const f = frame(page);
    await waitShown(page);
    await page.getByRole('button', { name: '關閉訊息框' }).click();
    await expect(f.locator(ROOT)).toBeHidden();
    await expect(status(page)).toContainText('已關閉訊息框');
    await page.waitForTimeout(400);
    await expect(f.locator(ROOT)).toBeHidden();
    /* 滑入：轉場停在 60 ms，還在下方 */
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await expect(f.locator(ROOT)).toBeVisible();
    await expect.poll(() => styleOf(page, ROOT, 'transform')).not.toBe('none');
    expect(errors).toEqual([]);
  });

  test('直接在原位出現：沒有位移，關閉後在原位停一下再隱藏，下一則再出現', async ({ page }) => {
    const errors = await open(page);
    const f = frame(page);
    await tab(page, '方框').click();
    await page.getByRole('radio', { name: '直接在原位出現' }).click();
    await waitShown(page);
    expect(await styleOf(page, ROOT, 'transform')).toBe('none');
    const closeAndSample = () =>
      page.evaluate((sel) => {
        const doc = (document.querySelector('iframe[title="OBS 預覽"]') as HTMLIFrameElement)
          .contentDocument!;
        const btn = [...document.querySelectorAll('button')].find(
          (b) => b.textContent === '關閉訊息框',
        )!;
        btn.click();
        const root = doc.querySelector(sel)!;
        const cs = doc.defaultView!.getComputedStyle(root);
        return [cs.transform, cs.visibility];
      }, ROOT);
    expect(await closeAndSample()).toEqual(['none', 'visible']);
    await expect(f.locator(ROOT)).toBeHidden();
    await page.getByRole('button', { name: '骰子成功' }).click();
    await expect(f.locator(ROOT)).toBeVisible();
    expect(await styleOf(page, ROOT, 'transform')).toBe('none');
    expect(errors).toEqual([]);
  });

  test('範本：選了只顯示說明，按套用才生效（一步復原），保留來源大小', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '1920×1080' }).click();
    const steps0 = await api(page, (a) => a.history());
    await page.getByRole('combobox', { name: '選擇範本' }).click();
    await page.getByRole('option', { name: '泛黃信紙' }).click();
    await expect(page.getByText(/舊紙質感的米色方框/)).toBeVisible();
    await expect(page.getByTestId('template-current')).toContainText('CCFOLIA 風');
    expect(await api(page, (a) => a.settings().texture)).toBe('none');
    await page.getByRole('button', { name: '套用', exact: true }).click();
    await expect(page.getByTestId('template-current')).toContainText('泛黃信紙');
    await expect(status(page)).toContainText('已套用範本「泛黃信紙」');
    expect(await api(page, (a) => [a.settings().texture, a.settings().width])).toEqual([
      'paper',
      1920,
    ]);
    expect(await api(page, (a) => a.history())).toBe(steps0 + 1);
    expect(await api(page, (a) => a.css())).toContain('以範本「泛黃信紙」為基礎');
    await page.getByRole('button', { name: /^復原/ }).click();
    expect(await api(page, (a) => a.settings().texture)).toBe('none');
    await page.getByRole('button', { name: /^重做/ }).click();
    expect(await api(page, (a) => a.settings().texture)).toBe('paper');
    expect(errors).toEqual([]);
  });

  test('來源寬高：離開或 Enter 才生效、取整數夾範圍、空白回預設；快捷鈕一步', async ({ page }) => {
    const errors = await open(page);
    const w = page.getByRole('spinbutton', { name: '寬' });
    const h = page.getByRole('spinbutton', { name: '高' });
    await w.fill('1000.6');
    expect(await api(page, (a) => a.settings().width)).toBe(1280);
    await w.press('Enter');
    await expect(w).toHaveValue('1001');
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 1001 × 高 720');
    await w.fill('50');
    await h.click();
    await expect(w).toHaveValue('320');
    await h.fill('');
    await w.click();
    await expect(h).toHaveValue('720');
    await h.fill('99999');
    await h.press('Enter');
    await expect(h).toHaveValue('2160');
    const steps = await api(page, (a) => a.history());
    await page.getByRole('button', { name: '下半部 1280×540' }).click();
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 1280 × 高 540');
    expect(await api(page, (a) => a.history())).toBe(steps + 1);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 320 × 高 2160');
    expect(errors).toEqual([]);
  });

  test('滑桿放開才記一步；預覽即時套用；快捷鍵（輸入欄裡不攔截）', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '方框').click();
    const slider = page.getByRole('slider', { name: '圓角' });
    await slider.scrollIntoViewIfNeeded();
    const box = (await slider.boundingBox())!;
    const track = (await page
      .locator('[data-field]', { has: page.getByRole('slider', { name: '圓角' }) })
      .locator('.grow')
      .first()
      .boundingBox())!;
    const steps = await api(page, (a) => a.history());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++)
      await page.mouse.move(box.x + i * 15, box.y + box.height / 2, { steps: 2 });
    expect(await api(page, (a) => a.history())).toBe(steps);
    await page.mouse.move(track.x + track.width * 0.5, box.y + box.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => api(page, (a) => a.history())).toBe(steps + 1);
    const radius = (await api(page, (a) => a.settings().radius)) as number;
    expect(radius).toBeGreaterThan(10);
    expect(await styleOf(page, BOX, 'border-top-left-radius')).toBe(`${radius}px`);
    /* 鍵盤：每按一次是一步 */
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => api(page, (a) => a.history())).toBe(steps + 3);
    /* 快捷鍵：Ctrl＋Z／Ctrl＋Y／Ctrl＋Shift＋Z */
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Control+z');
    expect(await api(page, (a) => a.settings().radius)).toBe(radius + 1);
    await page.keyboard.press('Control+y');
    expect(await api(page, (a) => a.settings().radius)).toBe(radius + 2);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+Shift+z');
    expect(await api(page, (a) => a.settings().radius)).toBe(radius + 2);
    /* 在文字欄裡 Ctrl＋Z 留給輸入欄 */
    await tab(page, '基本').click();
    const room = page.getByRole('textbox', { name: 'CCFOLIA 房間網址' });
    await room.fill('ABCD1234');
    await page.keyboard.press('Control+z');
    expect(await api(page, (a) => a.settings().radius)).toBe(radius + 2);
    expect(errors).toEqual([]);
  });

  test('分頁：方向鍵、Home、End（循環）；重新開頁回到上次的分頁與設定', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '基本').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, '立繪')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '基本')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tab(page, '立繪')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tab(page, '基本')).toHaveAttribute('aria-selected', 'true');
    await tab(page, '內文').click();
    await page.getByRole('radio', { name: '發光' }).click();
    await page.reload();
    await expect(tab(page, '內文')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('radio', { name: '發光' })).toHaveAttribute('aria-checked', 'true');
    expect(await api(page, (a) => a.history())).toBe(0);
    expect(errors).toEqual([]);
  });

  test('房間網址：來源網址（不加 /chat）、沒有網址時的警告與「前往填寫」、複製網址', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    const previewUrl = page.getByRole('textbox', { name: '瀏覽器來源網址' }).last();
    await expect(page.getByText(/還沒有來源網址/)).toBeVisible();
    await tab(page, '方框').click();
    await page.getByRole('button', { name: '前往填寫房間網址' }).click();
    await expect(tab(page, '基本')).toHaveAttribute('aria-selected', 'true');
    const room = page.getByRole('textbox', { name: 'CCFOLIA 房間網址' });
    await expect(room).toBeFocused();
    await room.fill('https://ccfolia.com/rooms/AbCd_1234/chat?x=1');
    await room.press('Tab');
    await expect(previewUrl).toHaveValue('https://ccfolia.com/rooms/AbCd_1234');
    await expect(page.getByRole('textbox', { name: '瀏覽器來源網址' }).first()).toHaveValue(
      'https://ccfolia.com/rooms/AbCd_1234',
    );
    await expect(page.getByText(/還沒有來源網址/)).toBeHidden();
    await page.getByRole('button', { name: '複製網址' }).last().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://ccfolia.com/rooms/AbCd_1234',
    );
    await expect(status(page)).toContainText('網址');
    expect(await api(page, (a) => a.css())).toContain(
      '瀏覽器來源網址：https://ccfolia.com/rooms/AbCd_1234（',
    );
    expect(errors).toEqual([]);
  });

  test('複製與儲存 CSS、查看 CSS、檔名清理', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await page.getByRole('button', { name: '複製 CSS' }).click();
    const css = await api(page, (a) => a.css());
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(css);
    await expect(status(page)).toContainText('寬 1280 × 高 720');
    await expect(status(page)).toContainText('不要加 /chat');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '儲存 .css' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('messagebox.css');
    expect(readFileSync(await download.path(), 'utf8')).toBe(css);
    await expect(status(page)).toContainText('已儲存「messagebox.css」');
    const name = page.getByRole('textbox', { name: '檔名' });
    await name.fill(' 直播:用 ');
    await name.press('Enter');
    const [d2] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '儲存 .css' }).click(),
    ]);
    expect(d2.suggestedFilename()).toBe('直播_用.css');
    await page.getByRole('button', { name: /查看 CSS/ }).click();
    await expect(page.getByRole('textbox', { name: '目前的 CSS（唯讀）' })).toHaveValue(css);
    expect(errors).toEqual([]);
  });

  test('預覽：套用前、背景、模擬滑鼠移上顯示按鈕', async ({ page }) => {
    const errors = await open(page);
    const f = frame(page);
    await waitShown(page);
    await page.getByRole('button', { name: '查看套用前的樣子' }).click();
    await expect(f.locator('header.MuiAppBar-root')).toBeVisible();
    await expect(page.getByTestId('css-preview-area')).toContainText('套用前');
    await page.getByRole('button', { name: '顯示套用後' }).click();
    await expect(f.locator('header.MuiAppBar-root')).toBeHidden();
    await page.getByRole('radio', { name: '棋盤格（透明）' }).click();
    expect(await api(page, (a) => (a.preview().background as { kind: string }).kind)).toBe(
      'checker',
    );
    const buttons = f.locator(`${BOX} > .MuiToolbar-root > button`);
    await expect(buttons.first()).toBeHidden();
    await page.getByRole('button', { name: '模擬滑鼠移到畫面上（OBS 的「互動」視窗）' }).click();
    await expect(buttons.first()).toBeVisible();
    const size = await buttons.first().boundingBox();
    const scale = Number(await page.getByTestId('css-preview-source').getAttribute('data-scale'));
    expect(size!.width / scale).toBeCloseTo(34, 0);
    /* 預覽設定不列入復原 */
    expect(await api(page, (a) => a.history())).toBe(0);
    expect(errors).toEqual([]);
  });

  test('範例訊息、秘密骰、自訂訊息、重新開始', async ({ page }) => {
    const errors = await open(page);
    const f = frame(page);
    await waitShown(page);
    await api(page, (a) => a.scene.setInstant(true));
    await page.getByRole('button', { name: '骰子成功' }).click();
    await expect(status(page)).toContainText('已送出「骰子成功」範例');
    await expect(f.locator(`${BOX} > .MuiToolbar-root > p`)).toHaveText('🎲 ＞ 成功');
    await expect(f.locator(`${BOX} > div:first-child > img`)).toHaveCount(2);
    /* 動畫中的大小會變，看計算後的寬度 */
    expect(await styleOf(page, `${BOX} > div:first-child > img`, 'width')).toBe('64px');
    await page.getByRole('button', { name: '秘密骰' }).click();
    await expect(status(page)).toContainText('シークレットダイス');
    await expect(f.locator(`${BOX} > div:last-child > p`)).toHaveText('シークレットダイス');
    await expect(f.locator(`${BOX} > .MuiToolbar-root > p`)).toHaveCount(0);
    await page.getByRole('button', { name: '長文' }).click();
    await expect(f.locator(`${ROOT} > img`)).toHaveCount(0);
    await expect(f.locator(`${BOX} > .MuiToolbar-root > h6`)).toHaveText('主持人');

    /* 自訂：骰子要有結果 */
    await page.getByRole('combobox', { name: '種類' }).click();
    await page.getByRole('option', { name: '骰子' }).click();
    const input = page.getByRole('textbox', { name: '測試訊息' });
    await input.fill('CC<=50 【偵查】');
    await input.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: '擲骰要在' })).toBeVisible();
    await input.fill('CC<=50 【偵查】 | (1D100<=50) ＞ 23 ＞ 失敗');
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(f.locator(`${BOX} > .MuiToolbar-root > p`)).toHaveText('🎲 ＞ 失敗');
    await expect(f.locator(`${BOX} > div:first-child > img`)).toHaveCount(2);

    await page.getByRole('button', { name: '重新開始預覽訊息' }).click();
    await expect(status(page)).toContainText('重新送出第一則');
    await expect(f.locator(`${BOX} > div:last-child > p`)).toContainText('這間圖書館');
    expect(errors).toEqual([]);
  });

  test('範例立繪：形狀立即更換、自訂立繪、不是圖片時錯誤', async ({ page }) => {
    const errors = await open(page);
    const img = frame(page).locator(`${ROOT} > img`);
    await waitShown(page);
    const text = await frame(page).locator(`${BOX} > div:last-child > p`).textContent();
    const full = await img.getAttribute('src');
    await page.getByRole('radio', { name: '半身方形' }).click();
    await expect(img).not.toHaveAttribute('src', full ?? '');
    await expect(frame(page).locator(`${BOX} > div:last-child > p`)).toHaveText(text ?? '');
    const drop = page.getByRole('group', { name: '把圖片拖到這裡' });
    await drop
      .locator('input[type=file]')
      .setInputFiles({ name: '我的.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(img).toHaveAttribute('src', /^data:image\/png/);
    await expect(status(page)).toContainText('自己的立繪');
    await expect(page.getByRole('radio', { name: '半身方形' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.getByRole('button', { name: '清除自訂立繪' }).click();
    await expect(img).not.toHaveAttribute('src', /^data:image\/png/);
    await drop
      .locator('input[type=file]')
      .setInputFiles({ name: '壞掉.png', mimeType: 'image/png', buffer: Buffer.from('xx') });
    await expect(status(page)).toContainText('不是可以讀取的圖片');
    expect(errors).toEqual([]);
  });

  test('專案檔：存檔、開啟（清空復原紀錄）、全部重來', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: '1920×1080' }).click();
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('messagebox.messagebox.json');
    const path = await download.path();
    const json = JSON.parse(readFileSync(path, 'utf8'));
    expect(json).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'message-box',
      data: { settings: { width: 1920, height: 1080 } },
    });
    await expect(status(page)).toContainText('已存成專案檔');

    await page.getByRole('button', { name: '1280×720' }).click();
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles({
      name: 'messagebox.messagebox.json',
      mimeType: 'application/json',
      buffer: readFileSync(path),
    });
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 1920 × 高 1080');
    await expect(status(page)).toContainText('已開啟專案檔「messagebox.messagebox.json」');
    expect(await api(page, (a) => a.history())).toBe(0);
    await expect(page.getByRole('button', { name: /^復原/ })).toBeDisabled();

    /* 缺欄位、範圍外、未知範本 */
    await page.getByRole('button', { name: '專案' }).click();
    const [c2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await c2.setFiles({
      name: 'old.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ ...json, data: { settings: { width: 99999, lines: 10, template: 'x' } } }),
      ),
    });
    await page.getByRole('alertdialog').getByRole('button', { name: '開啟' }).click();
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 3840 × 高 720');
    expect(await api(page, (a) => [a.settings().lines, a.settings().template])).toEqual([8, null]);

    /* 其他工具的專案檔 */
    await page.getByRole('button', { name: '專案' }).click();
    const [c3] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await c3.setFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...json, tool: 'status-bar' })),
    });
    await expect(status(page)).toContainText('無法開啟專案檔');

    /* 全部重來：取消不變、確定回到初始 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '全部重來…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click();
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 3840 × 高 720');
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '全部重來…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 1280 × 高 720');
    expect(await api(page, (a) => [a.history(), a.settings().template])).toEqual([0, 'classic']);
    expect(errors).toEqual([]);
  });

  test('窄來源：立繪與骰子圖維持設定的大小；名牌模式；電腦字型提醒；聊天視窗產生器連結', async ({
    page,
  }) => {
    const errors = await open(page);
    await waitShown(page);
    const w = page.getByRole('spinbutton', { name: '寬' });
    await w.fill('800');
    await w.press('Enter');
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 800 × 高 720');
    expect(await styleOf(page, `${ROOT} > img`, 'width')).toBe('240px');
    await tab(page, '名稱').click();
    await page.getByRole('radio', { name: '上緣名牌' }).click();
    await expect(page.getByRole('slider', { name: '名牌上移' })).toBeVisible();
    await expect(page.getByRole('slider', { name: '名稱與內文的距離' })).toHaveCount(0);
    expect(await styleOf(page, `${BOX} > .MuiToolbar-root`, 'position')).toBe('absolute');
    await expect(page.getByRole('link', { name: '聊天視窗產生器' }).first()).toHaveAttribute(
      'href',
      /chat-window\/$/,
    );
    await expect(page.getByTestId('local-font-warning')).toHaveCount(0);
    await api(page, (a) =>
      a.set({ textFont: { source: 'local', family: '測試字型', weight: 400 } }),
    );
    await expect(page.getByTestId('local-font-warning')).toContainText('測試字型');
    expect(await api(page, (a) => a.css())).toContain('電腦字型：測試字型');
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    await open(page);
    await waitShown(page);
    await expect(page).toHaveScreenshot('message-box-1280.png', { fullPage: true });
  });
});

test.describe('訊息框產生器（390 寬）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('沒有橫向捲動；每個分頁都一樣；視覺回歸', async ({ page }) => {
    const errors = await open(page);
    await waitShown(page);
    await noHorizontalScroll(page);
    for (const name of ['方框', '名稱', '內文', '立繪', '基本']) {
      await tab(page, name).click();
      await noHorizontalScroll(page);
    }
    await expect(page).toHaveScreenshot('message-box-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
