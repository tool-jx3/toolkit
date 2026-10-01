/**
 * 狀態條產生器（建置產物 next/status-bar/）的端對端測試：
 * - 開頁沒有錯誤，預覽套用 CSS 後的模擬 CCFOLIA 狀態頁（尺寸、版面、CCFOLIA 原本的配置被蓋掉）；
 * - 條數、隱藏多餘的條、範本（套用、保留欄位、復原）、復原／重做與快捷鍵、測試數值與危急／歸零演出；
 * - 複製 CSS、儲存 .css、角色清單（網址、提示、預覽、角色 CSS 與檔名）、專案檔、全部重來、自動存檔；
 * - 390 寬沒有橫向捲動、視覺回歸基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type FrameLocator, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('status-bar') ?? { id: 'status-bar', status: 'next' })}/`;

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
  await expect(page.getByRole('heading', { level: 1, name: '狀態條產生器' })).toBeVisible();
  await expect(frame(page).locator('div[variant="bar"] > div')).toHaveCount(3);
  return errors;
}

const frame = (page: Page): FrameLocator => page.frameLocator('iframe[title="狀態條預覽"]');
const sizeText = (page: Page) => page.getByTestId('css-preview-size');
const status = (page: Page) => page.getByTestId('status-text');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
/** 測試數值的快捷鈕（−3、＋3、減半、危急、歸零、全部回復） */
const shortcut = (page: Page, name: string) =>
  page
    .getByRole('group', { name: '測試快捷鈕' })
    .getByRole('button', { name, exact: true })
    .click();
/** 「查看 CSS」裡的全文（收合時元素仍在，只是隱藏） */
const cssText = (page: Page) =>
  page.locator('textarea[aria-label="目前的 CSS（唯讀）"]').inputValue();
const undoBtn = (page: Page) => page.getByRole('button', { name: '復原（Ctrl＋Z）' });
const redoBtn = (page: Page) => page.getByRole('button', { name: '重做（Ctrl＋Shift＋Z）' });

/** 預覽 iframe 裡的元素的位置與大小（CSS px，以 iframe 文件為準） */
function rects(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const doc = (document.querySelector('iframe[title="狀態條預覽"]') as HTMLIFrameElement)
      .contentDocument!;
    return [...doc.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 };
    });
  }, selector);
}

function frameStyle(page: Page, selector: string, prop: string, pseudo?: string) {
  return page.evaluate(
    ([sel, p, ps]) => {
      const doc = (document.querySelector('iframe[title="狀態條預覽"]') as HTMLIFrameElement)
        .contentDocument!;
      const el = doc.querySelector(sel as string);
      return el
        ? doc.defaultView!.getComputedStyle(el, ps || undefined).getPropertyValue(p as string)
        : null;
    },
    [selector, prop, pseudo ?? ''],
  );
}

/** 直接改設定（深層合併；測試用掛鉤） */
const setS = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => {
    const merge = (a: unknown, b: unknown): unknown => {
      if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
      const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
      return out;
    };
    // biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
    const st = (window as any).__statusBar.settings.getState();
    st.replace(merge(st.data, p));
  }, patch);

/** 預覽 iframe 裡正在跑（或停在結尾）的動畫名稱 */
const animationNames = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector('iframe[title="狀態條預覽"]') as HTMLIFrameElement)
      .contentDocument!.getAnimations()
      .map((a) => {
        const el = (a.effect as KeyframeEffect).target as Element;
        const bar = el.closest('div[variant="bar"] > div');
        const n = bar ? [...bar.parentElement!.children].indexOf(bar) + 1 : 0;
        return `${(a as CSSAnimation).animationName}@${n}`;
      }),
  );

const pulses = (page: Page) =>
  page.evaluate(
    () =>
      (document.querySelector('iframe[title="狀態條預覽"]') as HTMLIFrameElement)
        .contentDocument!.getAnimations()
        .filter((a) => (a as CSSAnimation).animationName?.startsWith('tk-pulse')).length,
  );

test.describe('開頁與預覽', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('沒有錯誤；預覽套用 CSS：#root 縮成剛好包住內容，來源 340 × 178，CCFOLIA 原本的配置被蓋掉', async ({
    page,
  }) => {
    const errors = await open(page);
    await expect(sizeText(page)).toHaveText('來源大小：寬 340 × 高 178（名稱最多 10 個字）');
    /* 條本體在 x＝10、320 × 34，條與條間隔 6 */
    const tracks = await rects(page, 'div[variant="bar"] > div > div:nth-child(2)');
    expect(tracks.map((r) => [Math.round(r.x), Math.round(r.w), Math.round(r.h)])).toEqual([
      [10, 320, 34],
      [10, 320, 34],
      [10, 320, 34],
    ]);
    expect(Math.round(tracks[1].y - tracks[0].y)).toBe(40);
    /* 頁面背景透明、通知列不顯示、頭像沒開時不佔位 */
    expect(await frameStyle(page, 'body', 'background-color')).toBe('rgba(0, 0, 0, 0)');
    expect(
      await frameStyle(
        page,
        'div[variant="bar"] > div > div:nth-child(2) > div:first-child',
        'opacity',
      ),
    ).toBe('1');
    expect((await rects(page, '.MuiBadge-root'))[0].visible).toBe(false);
    /* 預覽倍率＝min(2, (預覽區寬 − 32) ÷ 來源寬, 560 ÷ 來源高) */
    const m = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="css-preview-area"]') as HTMLElement;
      const src = document.querySelector('[data-testid="css-preview-source"]') as HTMLElement;
      return { areaWidth: area.clientWidth, scale: Number(src.dataset.scale) };
    });
    expect(m.scale).toBeCloseTo(Math.min(2, (m.areaWidth - 32) / 340, 560 / 178), 5);
    /* 名稱在最上方的底板裡 */
    expect(await frameStyle(page, '#root > div:first-child', 'content', '::before')).toBe('"白鴉"');
    await expect(status(page)).toContainText('就緒');
    expect(errors).toEqual([]);
  });

  test('改設定立即重畫：條數、多欄、文字位置；尺寸跟著變', async ({ page }) => {
    const errors = await open(page);
    const count = page.getByRole('slider', { name: '條數' });
    await count.focus();
    await page.keyboard.press('ArrowRight');
    await expect(frame(page).locator('div[variant="bar"] > div')).toHaveCount(4);
    await expect(sizeText(page)).toContainText('寬 340 × 高 218');
    await page.getByRole('radio', { name: '多欄', exact: true }).click();
    await expect(sizeText(page)).toContainText('寬 666 × 高 138');
    await page.getByRole('slider', { name: '欄數' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(sizeText(page)).toContainText('寬 992 × 高 138');
    await page.getByRole('radio', { name: '直向', exact: true }).click();
    await page.getByRole('combobox', { name: '文字位置' }).click();
    await page.getByRole('option', { name: '三欄' }).click();
    const tracks = await rects(page, 'div[variant="bar"] > div > div:nth-child(2)');
    expect(Math.round(tracks[0].x)).toBe(66);
    expect(Math.round(tracks[0].w)).toBe(174);
    expect(errors).toEqual([]);
  });

  test('隱藏多餘的條：預覽多放兩個狀態時看得出差別', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('switch', { name: '預覽時多放兩個狀態' }).click();
    const bars = frame(page).locator('div[variant="bar"] > div');
    await expect(bars).toHaveCount(5);
    await expect(bars.nth(3)).toBeHidden();
    await expect(bars.nth(4)).toBeHidden();
    await page.getByRole('switch', { name: '隱藏多餘的條' }).click();
    await expect(bars.nth(3)).toBeVisible();
    await expect(bars.nth(4)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('頭像、先攻：頭像在左 436 × 178；先攻 0 時徽章消失', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '頭像');
    await page.getByRole('switch', { name: '顯示頭像' }).click();
    await expect(sizeText(page)).toContainText('寬 436 × 高 178');
    await page.getByRole('switch', { name: '顯示先攻值' }).click();
    const badge = frame(page).locator('.MuiBadge-badge');
    await expect(badge).toBeVisible();
    const ini = page.getByRole('spinbutton', { name: '先攻值' });
    await ini.fill('0');
    await expect(badge).toBeHidden();
    await ini.fill('7');
    await expect(badge).toHaveText('7');
    await expect(badge).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('範本、復原與快捷鍵', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('選了範本只顯示說明；按「套用」才生效，保留條數，可以復原', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('slider', { name: '條數' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(frame(page).locator('div[variant="bar"] > div')).toHaveCount(4);
    await page.getByRole('combobox', { name: '選擇範本' }).click();
    await page.getByRole('option', { name: '科幻介面' }).click();
    await expect(page.getByTestId('template-info')).toContainText('切角的發光條');
    expect(await cssText(page)).not.toContain('以範本');
    await page.getByRole('button', { name: '套用', exact: true }).click();
    await expect(status(page)).toContainText('已套用範本「科幻介面」');
    await expect(page.getByTestId('template-current')).toContainText('科幻介面');
    expect(await cssText(page)).toContain('（以範本「科幻介面」為基礎）');
    await expect(frame(page).locator('div[variant="bar"] > div')).toHaveCount(4);
    expect(await frameStyle(page, '#root', 'content', '::before')).not.toBe('none');
    /* 套用是一個可復原的步驟 */
    await undoBtn(page).click();
    expect(await cssText(page)).not.toContain('以範本');
    await redoBtn(page).click();
    expect(await cssText(page)).toContain('以範本「科幻介面」');
    expect(errors).toEqual([]);
  });

  test('滑桿拖完才記一步；Ctrl＋Z／Ctrl＋Y／Ctrl＋Shift＋Z；文字欄裡不攔截', async ({ page }) => {
    const errors = await open(page);
    await expect(undoBtn(page)).toBeDisabled();
    const width = page.getByRole('slider', { name: '單條寬度' });
    const box = (await width.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++)
      await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);
    await page.mouse.up();
    const widened = (await sizeText(page).textContent())!;
    expect(widened).not.toContain('寬 340');
    await expect(undoBtn(page)).toBeEnabled();
    /* 拖曳整段只算一步 */
    await width.focus();
    await page.keyboard.press('Control+z');
    await expect(sizeText(page)).toContainText('寬 340 × 高 178');
    await expect(undoBtn(page)).toBeDisabled();
    await page.keyboard.press('Control+y');
    await expect(sizeText(page)).toHaveText(widened);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+Shift+z');
    await expect(sizeText(page)).toHaveText(widened);
    /* 文字欄裡的 Ctrl＋Z 交給輸入欄 */
    const fileName = page.getByRole('textbox', { name: '檔名' });
    await fileName.fill('abc');
    await fileName.press('Control+z');
    await expect(sizeText(page)).toHaveText(widened);
    expect(errors).toEqual([]);
  });

  test('分頁：方向鍵切換（循環），重新開頁回到上次的分頁；設定自動存檔', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('tab', { name: '排列', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: '角色', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: '排列', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tab(page, '演出');
    await page.getByRole('switch', { name: '危急演出' }).click();
    await page.reload();
    await expect(page.getByRole('tab', { name: '演出', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('switch', { name: '危急演出' })).not.toBeChecked();
    expect(errors).toEqual([]);
  });
});

test.describe('演出', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('測試快捷鈕：危急 → 脈動、數值變色；歸零 → 變灰；全部回復 → 結束', async ({ page }) => {
    const errors = await open(page, '?pause=550');
    await shortcut(page, '危急');
    /* ⌈14 × 25 ÷ 100⌉ − 1 = 3 */
    await expect(
      frame(page).locator('div[variant="bar"] > div').first().locator('span'),
    ).toHaveText('3');
    await expect.poll(() => pulses(page)).toBe(3);
    expect(
      await frameStyle(
        page,
        'div[variant="bar"] > div:first-child > div:first-child > p:nth-child(2) > span',
        'color',
      ),
    ).toBe('rgb(255, 59, 48)');
    await shortcut(page, '歸零');
    await expect
      .poll(() => frameStyle(page, 'div[variant="bar"] > div:first-child', 'filter'))
      .toBe('grayscale(1) brightness(0.8)');
    await shortcut(page, '全部回復');
    await expect.poll(() => pulses(page)).toBe(0);
    expect(await frameStyle(page, 'div[variant="bar"] > div:first-child', 'filter')).toBe('none');
    expect(errors).toEqual([]);
  });

  test('道具：數量與最大值相同時每少 1 點壞掉 1 個；裂痕依階段增加', async ({ page }) => {
    const errors = await open(page);
    await tab(page, '演出');
    await page.getByRole('switch', { name: '裂痕' }).click();
    await page.getByRole('switch', { name: '道具' }).click();
    const n = page.getByRole('slider', { name: '數量' });
    await n.focus();
    for (let i = 1; i < 14; i++) await page.keyboard.press('ArrowRight');
    await expect(sizeText(page)).toContainText('寬');
    /* HP 10/14：q＝40 → 右邊 4 個毀壞 */
    const q = () => frameStyle(page, 'div[variant="bar"] > div:first-child', '--tk-q', '::before');
    await expect.poll(q).toBe('40');
    const hp = page.getByRole('slider', { name: 'HP 目前值' });
    await hp.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(q).toBe('36');
    /* 裂痕：9/14 ≈ 64% → 第 1 階段 */
    const overlay = () =>
      frameStyle(
        page,
        'div[variant="bar"] > div:first-child > div:nth-child(2)',
        'background-image',
        '::before',
      );
    await expect.poll(async () => ((await overlay()) ?? '').split('url(').length - 1).toBe(2);
    await shortcut(page, '歸零');
    await expect.poll(async () => ((await overlay()) ?? '').split('url(').length - 1).toBe(5);
    await expect.poll(q).toBe('0');
    expect(errors).toEqual([]);
  });
});

test.describe('匯出', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('複製 CSS（含尺寸註解）與儲存 .css', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await expect(sizeText(page)).toContainText('寬 340 × 高 178');
    await page.getByRole('button', { name: '複製 CSS', exact: true }).click();
    await expect(status(page)).toHaveText('已複製範例的 CSS，請貼到寬 340 × 高 178 的瀏覽器來源。');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('瀏覽器來源大小：寬 340 × 高 178（名稱最多 10 個字）');
    expect(clip).toContain('--tk-name: "白鴉";');
    expect(clip).toBe(await cssText(page));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '儲存 .css' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('statusbar.css');
    expect(readFileSync((await download.path())!, 'utf8')).toBe(clip);
    await expect(status(page)).toHaveText('已儲存「statusbar.css」。');
    expect(errors).toEqual([]);
  });

  test('角色：提示、網址、預覽、角色 CSS 與檔名；刪除正在預覽的角色時回到範例', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    await tab(page, '角色');
    await page.getByRole('button', { name: '新增角色' }).click();
    const name = page.getByRole('textbox', { name: '名稱（未命名）' });
    await expect(name).toBeFocused();
    await expect(page.getByTestId('character-hint')).toHaveText('請填角色 ID（或貼棋子的網址）。');
    await page.getByRole('textbox', { name: '角色 ID（未命名）' }).fill('Char5678');
    await expect(page.getByTestId('character-hint')).toContainText('請填房間網址');
    await page
      .getByRole('textbox', { name: '房間網址' })
      .fill('https://ccfolia.com/rooms/Room1234');
    await expect(page.getByTestId('character-hint')).toHaveText('名稱是空白的，CSS 不會顯示名稱。');
    await name.fill('艾琳');
    await expect(page.getByTestId('character-hint')).toHaveCount(0);
    const url = 'https://ccfolia.com/rooms/Room1234/characters/Char5678';
    await page.getByRole('button', { name: '複製網址（艾琳）' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    /* 複製這個角色的 CSS：預覽切到這個角色 */
    await page.getByRole('button', { name: '複製 CSS（艾琳）' }).click();
    await expect(status(page)).toContainText('已複製「艾琳」的 CSS');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain(`瀏覽器來源網址：${url}`);
    expect(clip).toContain('--tk-name: "艾琳";');
    await expect(page.getByRole('combobox', { name: '預覽對象' })).toHaveText('艾琳');
    await expect(page.getByRole('textbox', { name: '瀏覽器來源網址' })).toHaveValue(url);
    expect(await frameStyle(page, '#root > div:first-child', 'content', '::before')).toBe('"艾琳"');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '儲存 .css' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('statusbar_艾琳.css');
    /* 刪除正在預覽的角色 → 回到範例；刪除可以復原 */
    await page.getByRole('button', { name: '刪除「艾琳」' }).click();
    await expect(page.getByRole('combobox', { name: '預覽對象' })).toHaveText('範例');
    await undoBtn(page).click();
    await expect(page.getByRole('textbox', { name: '名稱（艾琳）' })).toHaveValue('艾琳');
    expect(errors).toEqual([]);
  });

  test('專案檔：存成檔案再開回來設定相同；開啟後清空復原紀錄', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('switch', { name: '隱藏多餘的條' }).click();
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    /* <檔名主體>.statusbar.json（不加日期；F115） */
    expect(download.suggestedFilename()).toBe('statusbar.statusbar.json');
    const saved = readFileSync((await download.path())!, 'utf8');
    expect(JSON.parse(saved)).toMatchObject({ format: 'trpg-toolkit-project', tool: 'status-bar' });
    await page.getByRole('switch', { name: '隱藏多餘的條' }).click();
    await expect(page.getByRole('switch', { name: '隱藏多餘的條' })).toBeChecked();
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser.setFiles({
      name: '備份.json',
      mimeType: 'application/json',
      buffer: Buffer.from(saved),
    });
    await page.getByRole('button', { name: '開啟', exact: true }).click();
    await expect(status(page)).toHaveText('已開啟專案檔「備份.json」。');
    await expect(page.getByRole('switch', { name: '隱藏多餘的條' })).not.toBeChecked();
    await expect(undoBtn(page)).toBeDisabled();
    /* 不是本工具的專案 */
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await chooser2.setFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"a":1}'),
    });
    await expect(page.getByText('這不是 TRPG Toolkit 的專案檔。').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('全部重來：確認後回到初始狀態（含角色清單、測試數值），清空復原紀錄；取消則不變', async ({
    page,
  }) => {
    const errors = await open(page);
    await shortcut(page, '歸零');
    await page.getByRole('switch', { name: '隱藏多餘的條' }).click();
    await page.getByRole('button', { name: '全部重來' }).click();
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.getByRole('switch', { name: '隱藏多餘的條' })).not.toBeChecked();
    await page.getByRole('button', { name: '全部重來' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    await expect(page.getByRole('switch', { name: '隱藏多餘的條' })).toBeChecked();
    await expect(
      frame(page).locator('div[variant="bar"] > div').first().locator('span'),
    ).toHaveText('10');
    await expect(undoBtn(page)).toBeDisabled();
    expect(errors).toEqual([]);
  });
});

test.describe('對等驗證後的追加裁定（規格 7.1）', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('條本體比文字矮：整列高＝max(條本體高, 文字列 18)，條本體垂直置中；來源 340 × 130（F08）', async ({
    page,
  }) => {
    const errors = await open(page);
    for (const [barHeight, textPos] of [
      [3, 'inside'],
      [12, 'inside'],
      [12, 'two'],
      [3, 'two'],
    ] as const) {
      await setS(page, { barHeight, textPos });
      await expect(sizeText(page)).toContainText('寬 340 × 高 130');
      const rows = await rects(page, 'div[variant="bar"] > div');
      expect(rows.map((r) => Math.round(r.h))).toEqual([18, 18, 18]);
      const tracks = await rects(page, 'div[variant="bar"] > div > div:nth-child(2)');
      for (const [i, t] of tracks.entries()) {
        expect(Math.round(t.h)).toBe(barHeight);
        /* 條本體在列內垂直置中 */
        expect(t.y + t.h / 2).toBeCloseTo(rows[i].y + rows[i].h / 2, 0);
      }
    }
    await setS(page, { barHeight: 18, textPos: 'inside' });
    await expect(sizeText(page)).toContainText('寬 340 × 高 130');
    expect(errors).toEqual([]);
  });

  test('雙線外框只套在條本體，名稱底板永遠是單線（F29）；分段不切外框與覆蓋層（F33）', async ({
    page,
  }) => {
    const errors = await open(page);
    await setS(page, { border: { width: 3, double: true } });
    await expect(sizeText(page)).toContainText('寬 340 × 高 182');
    expect(await frameStyle(page, '#root > div:first-child', 'border-top-style', '::before')).toBe(
      'solid',
    );
    expect(await frameStyle(page, '#root > div:first-child', 'border-top-width', '::before')).toBe(
      '3px',
    );
    await setS(page, { border: { width: 2, double: false }, segments: 12, gloss: { on: true } });
    const track = 'div[variant="bar"] > div:first-child > div:nth-child(2)';
    expect(await frameStyle(page, `${track} > div:first-child`, 'mask-image')).toContain(
      'repeating-linear-gradient',
    );
    expect(await frameStyle(page, `${track} > div:nth-child(2)`, 'mask-image')).toContain(
      'repeating-linear-gradient',
    );
    expect(await frameStyle(page, track, 'mask-image', '::before')).toBe('none');
    expect(await frameStyle(page, track, 'background-image', '::before')).toContain('url(');
    expect(errors).toEqual([]);
  });

  test('增減與閃光的緩動 ease-out（F34）；陰影 5 px（F35）；外圈光暈模糊＝擴散（F78）；流動光線輪廓（F80）', async ({
    page,
  }) => {
    const errors = await open(page);
    const fill = 'div[variant="bar"] > div:first-child > div:nth-child(2) > div:nth-child(2)';
    expect(await frameStyle(page, fill, 'transition-timing-function')).toBe('ease-out');
    await setS(page, { shadow: 100, glow: { on: false } });
    const track = 'div[variant="bar"] > div:first-child > div:nth-child(2)';
    await expect
      .poll(() => frameStyle(page, track, 'filter'))
      .toBe('drop-shadow(rgb(0, 0, 0) 0px 2px 5px)');
    await setS(page, { shadow: 0, glow: { on: true, spread: 6, strength: 100 } });
    await expect
      .poll(() => frameStyle(page, track, 'filter'))
      .toMatch(/^drop-shadow\(rgb\([^)]*\) 0px 0px 6px\)$/);
    await setS(page, { sweep: { on: true, strength: 35, interval: 4 } });
    await expect
      .poll(() => frameStyle(page, fill, 'background-image', '::before'))
      .toBe(
        'linear-gradient(100deg, rgba(255, 255, 255, 0) 15%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0) 85%)',
      );
    expect(errors).toEqual([]);
  });

  test('損壞瞬間發光：開頁時完好的條不閃、損壞的條閃一次；回到完好不閃（F74）', async ({
    page,
  }) => {
    await open(page);
    await setS(page, { cracks: { on: true }, damageFlash: true });
    /* 存檔後重新開頁：裂痕的階段 HP 10/14、MP 6/10 已經損壞，SAN 48/60（80%）完好 */
    await page.waitForTimeout(100);
    const errors = await open(page);
    await expect
      .poll(async () => (await animationNames(page)).filter((n) => /^tk-(hit|pop)/.test(n)).length)
      .toBeGreaterThan(0);
    const flashes = (await animationNames(page)).filter((n) => /^tk-(hit|pop)/.test(n));
    expect(flashes.some((n) => n.endsWith('@1'))).toBe(true);
    expect(flashes.some((n) => n.endsWith('@2'))).toBe(true);
    expect(flashes.filter((n) => n.endsWith('@3'))).toEqual([]);
    expect(flashes.some((n) => n.startsWith('tk-hit-0') || n.startsWith('tk-pop-full'))).toBe(
      false,
    );
    const ease = await page.evaluate(() =>
      (document.querySelector('iframe[title="狀態條預覽"]') as HTMLIFrameElement)
        .contentDocument!.getAnimations()
        .filter((a) => /^tk-(hit|pop)/.test((a as CSSAnimation).animationName))
        .map((a) => (a.effect as KeyframeEffect).getKeyframes()[0].easing),
    );
    expect(new Set(ease)).toEqual(new Set(['ease-out']));
    /* 全部回復＝完好：不閃 */
    await shortcut(page, '全部回復');
    await expect
      .poll(async () => (await animationNames(page)).filter((n) => /^tk-(hit|pop)/.test(n)))
      .toEqual([]);
    /* 道具：完好（全部都在）時也不閃 */
    await setS(page, { items: { on: true, count: 2 } });
    await page.waitForTimeout(200);
    expect((await animationNames(page)).filter((n) => /^tk-(hit|pop)/.test(n))).toEqual([]);
    /* 再掉進損壞階段才閃 */
    await shortcut(page, '減半');
    await expect
      .poll(async () => (await animationNames(page)).filter((n) => /^tk-hit/.test(n)).length)
      .toBeGreaterThan(0);
    expect((await animationNames(page)).some((n) => /^tk-pop-\d/.test(n))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('頭像外框改用角色顏色時不透明（F22）；名稱壓在頭像底部貼齊外緣（F53）；整體外框的外緣在間距處（F76）；先攻徽章轉場只在預覽關掉（F25）', async ({
    page,
  }) => {
    const errors = await open(page);
    await setS(page, {
      avatar: {
        show: true,
        borderWidth: 3,
        borderUseChar: true,
        borderColor: '#ffffff40',
        radius: 6,
      },
      name: { pos: 'avatar' },
      initiative: { show: true },
    });
    const avatar = '.MuiBadge-root > .MuiAvatar-root';
    await expect.poll(() => frameStyle(page, avatar, 'opacity', '::before')).toBe('1');
    expect(await frameStyle(page, avatar, 'left', '::after')).toBe('0px');
    expect(await frameStyle(page, avatar, 'bottom', '::after')).toBe('0px');
    expect(await frameStyle(page, avatar, 'width', '::after')).toBe('88px');
    await setS(page, { avatar: { borderUseChar: false } });
    await expect.poll(() => frameStyle(page, avatar, 'opacity', '::before')).toBe('0.251');
    /* 先攻徽章：預覽裡關掉 CCFOLIA 的轉場；匯出的 CSS 不關 */
    expect(await frameStyle(page, '.MuiBadge-root > .MuiBadge-badge', 'transition-duration')).toBe(
      '0s',
    );
    const exported = await cssText(page);
    const badge = exported.slice(exported.indexOf('.MuiBadge-root > .MuiBadge-badge {'));
    expect(badge.slice(0, badge.indexOf('}'))).not.toContain('transition');
    expect(exported).not.toContain('預覽專用');
    /* 整體外框：線的外緣離內容「間距」px */
    await setS(page, {
      avatar: { show: false },
      name: { pos: 'top' },
      frame: { on: true, kind: 'single', width: 4, gap: 6 },
    });
    await expect(sizeText(page)).toContainText('寬 360');
    expect(await frameStyle(page, '#root', 'top', '::before')).toBe('-6px');
    expect(await frameStyle(page, '#root', 'border-top-width', '::before')).toBe('4px');
    expect(errors).toEqual([]);
  });
});

test.describe('版面與視覺基準', () => {
  test('1280 寬', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await open(page);
    await expect(sizeText(page)).toContainText('寬 340 × 高 178');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('status-bar-1280.png', { fullPage: true });
    expect(errors).toEqual([]);
  });

  test('390 寬：沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    for (const name of ['排列', '條', '名稱', '演出', '裝飾', '角色']) {
      await tab(page, name);
      const [sw, cw] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      expect(sw, `${name}：不應出現橫向捲動`).toBeLessThanOrEqual(cw);
    }
    await tab(page, '排列');
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('status-bar-390.png', { fullPage: true });
    expect(errors).toEqual([]);
  });
});
