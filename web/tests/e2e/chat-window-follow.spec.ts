/**
 * 聊天視窗產生器 2026-11-20 的追加（規格 1.12、1.13、3.8、3.9）：
 * - 跟進 chat-window-maker v1.14：名字固定、只捲本文（F113）；舊的存檔與專案檔照以前的捲法；
 * - 跟進 v1.12：訊息消失後視窗也消失（F112）：視窗跟著最新一則淡出、新訊息重播、互動時一直顯示、沒有訊息時不顯示；
 * - 隱藏 CCFOLIA 房間畫面的介面（F114～F120）：分頁、模擬的房間畫面、勾選與一鍵勾選、接上聊天視窗的 CSS、
 *   複製與下載、復原、390 寬沒有橫向捲動。
 */
import { readFileSync } from 'node:fs';
import { expect, type Frame, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('chat-window') ?? { id: 'chat-window', status: 'next' })}/`;
const CHAT_FRAME = 'iframe[title="聊天視窗預覽"]';
const ROOM_FRAME = 'iframe[title="房間畫面預覽"]';

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
  await expect(page.getByRole('heading', { level: 1, name: '聊天視窗產生器' })).toBeVisible();
  await page.waitForFunction(
    () => !!(window as unknown as { __chatWindow?: unknown }).__chatWindow,
  );
  return errors;
}

// biome-ignore lint/suspicious/noExplicitAny: 測試掛鉤
type Hook = any;
const hook = <T>(page: Page, fn: string, arg?: unknown) =>
  page.evaluate(
    ([f, a]) => {
      const t = (window as unknown as { __chatWindow: Hook }).__chatWindow;
      return new Function('t', 'a', `return (${f})(t, a)`)(t, a);
    },
    [fn, arg] as const,
  ) as Promise<T>;
const settings = <T = Record<string, unknown>>(page: Page) => hook<T>(page, '(t) => t.settings()');
const set = (page: Page, patch: Record<string, unknown>) => hook(page, '(t, a) => t.set(a)', patch);
const status = (page: Page) => page.getByTestId('status');

async function frameOf(page: Page, selector: string): Promise<Frame> {
  const handle = await page.locator(selector).elementHandle();
  return (await handle!.contentFrame())!;
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

test.describe('聊天視窗產生器：2026-11-20 的追加', () => {
  test('名字固定、只捲本文（F113）：名稱不動，內文在名稱正下方與下內距上方消失', async ({
    page,
  }) => {
    const errors = await open(page, '?pause=0');
    await set(page, {
      width: 480,
      height: 200,
      fade: false,
      enter: 'none',
      count: 1,
      scroll: true,
      scrollPinName: true,
      scrollDelay: 2,
      scrollDuration: 10,
      boxShape: 'card',
      boxPadY: 7,
      boxBorderWidth: 0,
      nameSize: 14,
      nameGap: 2,
      nameStyle: 'plain',
    });
    await page.getByRole('button', { name: '長文', exact: true }).click();
    const f = await frameOf(page, CHAT_FRAME);
    /** 把內文的捲動移到 t 毫秒，量名稱、內文、方框與看得到的內文範圍 */
    const at = (t: number) =>
      f.evaluate((ms) => {
        const anims = document
          .getAnimations()
          .filter((a) => (a as CSSAnimation).animationName === 'tk-chat-scroll-body');
        for (const a of anims) a.currentTime = ms;
        const it = [...document.querySelectorAll('ul[role="log"] div[data-index]')]
          .filter((e) => getComputedStyle(e).display !== 'none')
          .at(-1)!;
        const body = it.querySelector('.MuiListItemText-secondary') as HTMLElement;
        const r = (e: Element) => e.getBoundingClientRect();
        const b = r(body);
        const box = r(it.querySelector('.MuiListItem-root')!);
        const name = r(it.querySelector('.MuiListItemText-primary')!);
        /* clip-path 也影響點擊判定：看某一點是不是點得到內文（＝看得到） */
        const hit = (y: number) =>
          !!document.elementFromPoint(b.left + 20, y)?.closest('.MuiListItemText-secondary');
        return {
          count: anims.length,
          textAnims: document
            .getAnimations()
            .filter((a) => (a as CSSAnimation).animationName === 'tk-chat-scroll').length,
          nameTop: r(it.querySelector('.MuiListItemText-primary')!).top,
          nameBottom: r(it.querySelector('.MuiListItemText-primary')!).bottom,
          bodyTop: b.top,
          bodyBottom: b.bottom,
          boxBottom: box.bottom,
          /* 名稱正下方（間距 2px 的上面一點與下面一點）、方框下內距（7px）的上面一點與裡面 */
          underName: [hit(name.bottom + 1), hit(name.bottom + 4)],
          overPadding: [hit(box.bottom - 7 - 3), hit(box.bottom - 7 + 2)],
        };
      }, t);
    await expect.poll(async () => (await at(0)).count).toBe(1);
    const a0 = await at(0);
    expect(a0.textAnims).toBe(0);
    /* 名稱一行（14 × 1.35）＋間距 2 */
    expect(a0.nameBottom - a0.nameTop).toBeCloseTo(18.9, 0);
    expect(a0.bodyTop - a0.nameBottom).toBeCloseTo(2, 0);
    const a7 = await at(7000);
    const a12 = await at(12000);
    const a20 = await at(20000);
    /* 名稱不動 */
    expect(a7.nameTop).toBeCloseTo(a0.nameTop, 1);
    expect(a12.nameTop).toBeCloseTo(a0.nameTop, 1);
    /* 等速往上：一半時位移是終點的一半；終點時內文底端貼齊方框的下內距（7px）上緣；之後停住 */
    const end = a12.bodyTop - a0.bodyTop;
    expect(end).toBeLessThan(-20);
    expect(a7.bodyTop - a0.bodyTop).toBeCloseTo(end / 2, 0);
    expect(a12.bodyBottom).toBeCloseTo(a12.boxBottom - 7, 0);
    expect(a20.bodyTop).toBeCloseTo(a12.bodyTop, 1);
    /* 看得到的範圍一直是「名稱正下方」到「方框下內距的上面」：開始、一半、終點都一樣 */
    for (const a of [a0, a7, a12]) {
      expect(a.underName).toEqual([false, true]);
      expect(a.overPadding).toEqual([true, false]);
    }
    /* 「名稱：」前綴：照以前整欄一起捲 */
    await set(page, { nameStyle: 'prefix' });
    await expect
      .poll(() =>
        f.evaluate(() =>
          document
            .getAnimations()
            .map((a) => (a as CSSAnimation).animationName)
            .filter((n) => n.startsWith('tk-chat-scroll')),
        ),
      )
      .toEqual(['tk-chat-scroll']);
    /* 動態分頁：捲動打開時才出現這個開關 */
    await page.getByRole('tab', { name: '動態' }).click();
    await expect(page.getByRole('switch', { name: '名字固定、只捲本文' })).toBeChecked();
    await set(page, { scroll: false });
    await expect(page.getByRole('switch', { name: '名字固定、只捲本文' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('舊的自動存檔與專案檔（沒有「名字固定」欄位）照以前的捲法；新開頁與範本是開', async ({
    page,
  }) => {
    const errors = await open(page);
    expect((await settings(page)).scrollPinName).toBe(true);
    /* 版本 1 的自動存檔（2026-11-20 以前） */
    await page.evaluate(() =>
      localStorage.setItem(
        'trpg-toolkit:chat-window',
        JSON.stringify({
          state: { data: { scroll: true, count: 1, templateId: 'spotlight' } },
          version: 1,
        }),
      ),
    );
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __chatWindow?: unknown }).__chatWindow,
    );
    expect(await settings(page)).toMatchObject({ scroll: true, count: 1, scrollPinName: false });
    /* 套用範本：新的預設（開） */
    await hook(page, "(t) => t.applyTemplate('spotlight')");
    expect((await settings(page)).scrollPinName).toBe(true);
    /* 專案檔（版本 1，沒有這個欄位） */
    await page.getByRole('button', { name: '專案' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: /開啟專案檔/ }).click(),
    ]);
    await chooser.setFiles({
      name: 'old.chatwindow.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'trpg-toolkit-project',
          tool: 'chat-window',
          version: 1,
          data: { scroll: true, count: 1 },
        }),
      ),
    });
    await expect(status(page)).toContainText('已開啟專案檔');
    expect(await settings(page)).toMatchObject({ scroll: true, scrollPinName: false });
    /* 存成專案檔：版本 2、有新的欄位 */
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
    ]);
    const saved = JSON.parse(readFileSync(await download.path(), 'utf8'));
    expect(saved).toMatchObject({ version: 2, data: { scrollPinName: false, fadeWindow: false } });
    expect(errors).toEqual([]);
  });

  test('訊息消失後視窗也消失（F112）：跟著最新一則淡出、新訊息重播、互動時一直顯示', async ({
    page,
  }) => {
    const errors = await open(page, '?pause=2500');
    await page.mouse.move(0, 0);
    await set(page, { fade: true, fadeStay: 2, fadeDuration: 1, fadeWindow: true });
    const f = await frameOf(page, CHAT_FRAME);
    const win = () =>
      f.evaluate(() => {
        const p = document.querySelector('.MuiDrawer-paper')!;
        const items = document.querySelectorAll('ul[role="log"] div[data-index]');
        return {
          opacity: Number(getComputedStyle(p).opacity),
          name: getComputedStyle(p).animationName,
          newest: (items[items.length - 1] as HTMLElement | undefined)?.dataset.index ?? null,
        };
      });
    /* 停留 2 秒後 1 秒內淡出（先慢後快）：經過一半約 0.68 */
    await expect.poll(async () => (await win()).opacity).toBeCloseTo(0.685, 2);
    const w0 = await win();
    expect(w0.name).toMatch(/^tk-chat-window-out-(even|odd)$/);
    /* 新訊息：最新一則的奇偶換了，動畫名稱跟著換（從頭重播） */
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await expect.poll(async () => (await win()).name).not.toBe(w0.name);
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await expect.poll(async () => (await win()).name).toBe(w0.name);
    /* OBS 互動（滑鼠在畫面上）：一直顯示 */
    await page.locator(CHAT_FRAME).hover();
    await expect.poll(async () => (await win()).opacity).toBe(1);
    await page.mouse.move(0, 0);
    await expect.poll(async () => (await win()).opacity).toBeCloseTo(0.685, 2);
    /* 一則訊息都沒有：視窗不顯示 */
    await hook(page, '(t) => t.scene.setMessages([], 0)');
    await expect.poll(async () => (await win()).opacity).toBe(0);
    /* 開關在「過一段時間後消失」底下，有 OBS 31+ 標籤 */
    await page.getByRole('tab', { name: '動態' }).click();
    const sw = page.getByRole('switch', { name: /訊息消失後視窗也消失/ });
    await expect(sw).toBeChecked();
    await set(page, { fade: false });
    await expect(sw).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('隱藏介面（F114～F120）：分頁、模擬的房間畫面、勾選、一鍵勾選、復原', async ({ page }) => {
    const errors = await open(page, '?pause=0');
    await page.getByRole('tab', { name: '隱藏介面' }).click();
    await expect(page.locator(ROOM_FRAME)).toBeVisible();
    await expect(page.locator(CHAT_FRAME)).toHaveCount(0);
    const f = await frameOf(page, ROOM_FRAME);
    const shown = (sel: string) =>
      f.evaluate((s) => {
        const e = document.querySelector(s);
        return !!e && getComputedStyle(e).display !== 'none';
      }, sel);
    /* 預設：只留盤面（標題列、聊天欄隱藏；棋子、背景照常） */
    await expect.poll(() => shown('header.MuiAppBar-positionFixed')).toBe(false);
    expect(await shown('.MuiDrawer-root.MuiDrawer-docked')).toBe(false);
    expect(await shown('[data-field-object] figure')).toBe(true);
    expect(await shown('.sc-bKoKAZ')).toBe(true);
    const outline = () =>
      f.evaluate(() => getComputedStyle(document.querySelector('.tk-room-fg')!).outlineStyle);
    expect(await outline()).toBe('none');
    /* 勾選棋子：隱藏；Ctrl＋Z 復原 */
    const piece = page.getByRole('checkbox', { name: '棋子（盤面上的角色）' });
    await piece.click();
    await expect.poll(() => shown('[data-field-object] figure')).toBe(false);
    expect((await settings(page)).roomHide).toContain('characters');
    await page.keyboard.press('Control+z');
    await expect.poll(() => shown('[data-field-object] figure')).toBe(true);
    await expect(piece).not.toBeChecked();
    /* 一鍵勾選 */
    await page.getByRole('button', { name: '全部取消' }).click();
    await expect.poll(() => shown('header.MuiAppBar-positionFixed')).toBe(true);
    expect(await shown('.MuiDrawer-root.MuiDrawer-docked')).toBe(true);
    expect(await outline()).toBe('solid');
    await page.getByRole('button', { name: '全部隱藏' }).click();
    for (const sel of [
      '.sc-bKoKAZ',
      '.tk-room-fg img',
      '.sc-ezjsFQ',
      '.sc-iuhWPH',
      '.sc-iiBnab',
      '.tk-room-dice-face',
      '[role="status"][aria-label="メッセージ"]',
      'div[open]',
      '.MuiPaper-elevation5',
      '.tk-room-bgm',
      '[aria-label="盤面を拡大する"]',
      '[aria-label="Ctrl + ドラッグ"]',
      'button.MuiFab-root',
      '.MuiDialog-root',
      '.tk-room-snack',
      '.sc-tkStatusRow > .MuiBadge-root',
    ])
      await expect.poll(() => shown(sel), sel).toBe(false);
    /* 改版容易失效的部分有標籤 */
    await expect(page.locator('[data-fragile]')).toHaveCount(15);
    /* 廣告影片：勾選旁與 OBS 說明都提醒會隱藏所有對話框（進房間時先取消） */
    /* （CSS 的開頭說明也有同樣的句子，所以排除唯讀的 CSS 欄） */
    const text = (re: RegExp) => page.locator('span, li').filter({ hasText: re });
    await expect(text(/^會隱藏所有對話框：在 OBS 的「互動」裡進房間/)).toBeVisible();
    await expect(text(/^勾了「廣告影片」時所有對話框都會被隱藏/)).toBeVisible();
    await expect(text(/^CCFOLIA 的介面語言不是日文時/)).toBeVisible();
    const css = await page.getByLabel('目前的 CSS（唯讀）').inputValue();
    expect(css).toContain('廣告影片的規則會隱藏所有對話框');
    expect(css).toContain('CCFOLIA 的介面語言不是日文時');
    await page.getByRole('button', { name: '只留盤面' }).click();
    await expect.poll(async () => (await settings(page)).roomHide).toHaveLength(13);
    /* 套用範本不改這裡的設定 */
    await hook(page, "(t) => t.applyTemplate('dice')");
    expect((await settings(page)).roomHide).toHaveLength(13);
    expect(errors).toEqual([]);
  });

  test('隱藏介面：接上聊天視窗的 CSS、複製與下載、房間網址', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page, '?pause=0');
    await set(page, {
      room: 'https://ccfolia.com/rooms/AbC_d-12xyz/chat',
      sizeMode: 'fit',
      margin: 16,
    });
    await page.getByRole('tab', { name: '隱藏介面' }).click();
    await expect(page.getByRole('textbox', { name: '瀏覽器來源網址（房間網址）' })).toHaveValue(
      'https://ccfolia.com/rooms/AbC_d-12xyz',
    );
    const f = await frameOf(page, ROOM_FRAME);
    const paper = () =>
      f.evaluate(() => {
        const p = document.querySelector('.MuiDrawer-paper')!;
        const r = p.getBoundingClientRect();
        return {
          shown: getComputedStyle(p.closest('.MuiDrawer-root')!).display !== 'none',
          left: Math.round(r.left),
          width: Math.round(r.width),
        };
      });
    expect((await paper()).shown).toBe(false);
    /* 接上聊天視窗的 CSS：聊天欄不隱藏（勾選停用），變成聊天視窗（左右各留白 16） */
    await page.getByRole('switch', { name: '後面接上聊天視窗的 CSS' }).click();
    await expect(page.getByRole('checkbox', { name: '聊天欄' })).toBeDisabled();
    await expect.poll(paper).toEqual({ shown: true, left: 16, width: 1280 - 32 });
    /* 複製：開頭說明 → 聊天視窗的 CSS → 隱藏的規則 */
    await page.getByRole('button', { name: '複製 CSS' }).click();
    await expect(status(page)).toContainText('已複製隱藏介面的 CSS');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('隱藏介面＋聊天視窗');
    expect(clip).toContain('https://ccfolia.com/rooms/AbC_d-12xyz（房間網址');
    expect(clip).toContain('ul.MuiList-root[role="log"]');
    expect(clip).toContain('header.MuiAppBar-positionFixed {\n  display: none !important;');
    expect(clip).not.toContain('.MuiDrawer-root.MuiDrawer-docked {');
    /* 下載：檔名是「<檔名>-room.css」 */
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '儲存 .css' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('chatwindow-room.css');
    expect(readFileSync(await download.path(), 'utf8')).toBe(clip);
    /* 聊天視窗的輸出不受影響（沒有隱藏介面的規則） */
    const chat = await hook<string>(page, '(t) => t.buildCss(t.settings())');
    expect(chat).not.toContain('header.MuiAppBar-positionFixed');
    expect(errors).toEqual([]);
  });

  test('隱藏介面：390 寬沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await page.getByRole('tab', { name: '隱藏介面' }).click();
    await expect(page.locator(ROOM_FRAME)).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole('switch', { name: '後面接上聊天視窗的 CSS' }).click();
    await noHorizontalScroll(page);
    for (const w of [360, 320]) {
      await page.setViewportSize({ width: w, height: 800 });
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
});
