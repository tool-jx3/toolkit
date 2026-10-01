/**
 * 聊天視窗產生器（建置產物 next/chat-window/）的端對端測試：
 * - 開頁沒有 pageerror／console error，狀態列顯示準備完成；
 * - 範本（選單換選項只換說明、按套用才生效、保留來源大小與房間、可復原）；
 * - 套用在模擬的 CCFOLIA 聊天頁上的關鍵行為：最新 N 則、只列擲骰、隱藏系統訊息、排列、靠齊、標題、
 *   參加者頭像、滑鼠移上時的分頁列、動畫的固定時間點（進場、消失、長訊息捲動、閃一下）；
 * - 測試訊息、自訂測試訊息；來源寬高的修正；房間網址；複製／下載 CSS；專案檔；復原／重做與快捷鍵；
 *   自動存檔與設定分頁的記憶、分頁列鍵盤操作；全部重來；
 * - 390 寬沒有橫向捲動；1280／390 視覺基準圖。
 */
import { readFileSync } from 'node:fs';
import { expect, type Frame, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('chat-window') ?? { id: 'chat-window', status: 'next' })}/`;

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
  await expect(item(page).first()).toBeAttached();
  return errors;
}

const frame = (page: Page) => page.frameLocator('iframe[title="聊天視窗預覽"]');
const item = (page: Page) => frame(page).locator('ul[role="log"] div[data-index]');
const visibleItems = (page: Page) => frame(page).locator('ul[role="log"] div[data-index]:visible');
const status = (page: Page) => page.getByTestId('status');

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

/** 預覽 iframe 的 Frame（直接執行程式用） */
async function previewFrame(page: Page): Promise<Frame> {
  const handle = await page.locator('iframe[title="聊天視窗預覽"]').elementHandle();
  return (await handle!.contentFrame())!;
}

/** 可見訊息的內文與位置 */
async function visibleTexts(page: Page) {
  const f = await previewFrame(page);
  return f.evaluate(() =>
    [...document.querySelectorAll('ul[role="log"] div[data-index]')]
      .filter((e) => getComputedStyle(e).display !== 'none')
      .map((e) => ({
        text: e.querySelector('.MuiListItemText-secondary')?.textContent ?? '',
        top: Math.round(e.getBoundingClientRect().top),
      })),
  );
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

const masks = (page: Page) => [page.getByRole('status').filter({ hasText: '自動儲存' })];

test.describe('聊天視窗產生器', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('開頁：沒有錯誤、準備完成、預設範本、最新 6 則', async ({ page }) => {
    const errors = await open(page);
    await expect(status(page)).toContainText('準備完成');
    const s = await settings<{ templateId: string; width: number; height: number }>(page);
    expect(s).toMatchObject({ templateId: 'night', width: 480, height: 460 });
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 480 × 高 460');
    await expect(visibleItems(page)).toHaveCount(6);
    /* 頁面透明、標頭與輸入區不顯示 */
    const f = await previewFrame(page);
    const look = await f.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      header: getComputedStyle(document.querySelector('.MuiDrawer-paper > header')!).display,
      input: getComputedStyle(document.querySelector('.MuiDrawer-paper > div.MuiPaper-root')!)
        .display,
    }));
    expect(look).toEqual({ body: 'rgba(0, 0, 0, 0)', header: 'none', input: 'none' });
    expect(errors).toEqual([]);
  });

  test('範本：換選項只更新說明，按套用才生效；保留來源大小與房間；可以復原', async ({ page }) => {
    const errors = await open(page);
    await set(page, { width: 640, height: 240, room: 'AbC_d-12xyz' });
    const before = await settings(page);
    await page.getByRole('combobox', { name: '範本' }).click();
    await page.getByRole('option', { name: '擲骰紀錄' }).click();
    await expect(page.getByTestId('template-description')).toContainText('只列出擲骰訊息');
    await expect(page.getByTestId('template-description')).toContainText('來源大小、房間網址');
    expect(await settings(page)).toEqual(before);
    await page.getByRole('button', { name: '套用', exact: true }).click();
    await expect(status(page)).toContainText('已套用範本「擲骰紀錄」');
    const after = await settings<Record<string, unknown>>(page);
    expect(after).toMatchObject({
      templateId: 'dice',
      diceOnly: true,
      width: 640,
      height: 240,
      room: 'AbC_d-12xyz',
      titleText: '擲骰紀錄',
    });
    /* 只列擲骰：主分頁 4 則擲骰 */
    await expect(visibleItems(page)).toHaveCount(4);
    /* CSS 開頭寫明範本，之後改設定也照樣寫 */
    await set(page, { count: 2 });
    await page.getByRole('button', { name: /查看 CSS/ }).click();
    await expect(page.getByRole('textbox', { name: '目前的 CSS（唯讀）' })).toHaveValue(
      /以範本「擲骰紀錄」為基礎/,
    );
    await page.waitForTimeout(50);
    await page.getByRole('button', { name: '復原（Ctrl＋Z）' }).click();
    await page.getByRole('button', { name: '復原（Ctrl＋Z）' }).click();
    await expect.poll(async () => (await settings(page)).templateId).toBe('night');
    expect(errors).toEqual([]);
  });

  test('要顯示的訊息：則數、只列擲骰、隱藏系統訊息、排列與靠齊', async ({ page }) => {
    const errors = await open(page);
    /* 則數（滑桿鍵盤操作） */
    const slider = page.getByRole('slider', { name: '則數' });
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(visibleItems(page)).toHaveCount(4);
    await expect(page.getByRole('spinbutton', { name: '則數' })).toHaveValue('4');
    /* 最新在下：由上往下＝舊→新 */
    let texts = await visibleTexts(page);
    expect(texts.at(-1)?.text).toContain('決定的成功');
    /* 隱藏系統訊息：從非系統訊息取最新 4 則 */
    await page.getByRole('switch', { name: /隱藏系統訊息/ }).click();
    texts = await visibleTexts(page);
    expect(texts).toHaveLength(4);
    expect(texts.some((t) => t.text.includes('SAN : 58'))).toBe(false);
    /* 只列擲骰：隱藏系統訊息的開關消失 */
    await page.getByRole('switch', { name: /只列出擲骰訊息/ }).click();
    await expect(page.getByRole('switch', { name: /隱藏系統訊息/ })).toHaveCount(0);
    texts = await visibleTexts(page);
    expect(texts.map((t) => t.text.match(/【(.+?)】|^1D6/)?.[0])).toEqual([
      '【聆聽】',
      '【潛行】',
      '1D6',
      '【圖書館】',
    ]);
    /* 最新在上：由上往下＝新→舊 */
    await page.getByRole('radio', { name: '最新在上' }).click();
    texts = (await visibleTexts(page)).sort((a, b) => a.top - b.top);
    expect(texts[0].text).toContain('【圖書館】');
    expect(texts.at(-1)?.text).toContain('【聆聽】');
    /* 填滿、靠上、最新在上、兩則 → 最新那則在視窗頂端 */
    await set(page, { count: 2, anchor: 'top', sizeMode: 'fill', margin: 10, padding: 12 });
    const f = await previewFrame(page);
    const paperRect = () =>
      f.evaluate(() => {
        const r = document.querySelector('.MuiDrawer-paper')!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
    await expect.poll(async () => (await visibleTexts(page)).length).toBe(2);
    await expect.poll(async () => (await paperRect()).top).toBe(10);
    await expect
      .poll(async () => {
        const t = (await visibleTexts(page)).sort((a, b) => a.top - b.top);
        return [t[0].top, t[0].text.includes('【圖書館】')];
      })
      .toEqual([10 + 12, true]);
    /* 隨內容伸縮：靠下時底邊距來源底「外側留白」、往上長 */
    await set(page, { sizeMode: 'fit', anchor: 'bottom', margin: 10 });
    await expect.poll(async () => (await paperRect()).bottom).toBe(450);
    expect((await paperRect()).top).toBeGreaterThan(100);
    await set(page, { anchor: 'top', margin: 20 });
    await expect.poll(async () => (await paperRect()).top).toBe(20);
    expect((await paperRect()).bottom).toBeLessThan(350);
    expect(errors).toEqual([]);
  });

  test('來源寬高：離開欄位時修正並回填；常用尺寸；預覽大小', async ({ page }) => {
    const errors = await open(page);
    const w = page.getByRole('spinbutton', { name: '寬度' });
    const h = page.getByRole('spinbutton', { name: '高度' });
    await w.fill('99999');
    await w.blur();
    await expect(w).toHaveValue('3840');
    await w.fill('');
    await w.blur();
    await expect(w).toHaveValue('480');
    await h.fill('-5');
    await h.press('Enter');
    await expect(h).toHaveValue('80');
    await h.fill('0');
    await h.blur();
    await expect(h).toHaveValue('460');
    await w.focus();
    await page.keyboard.press('ArrowUp');
    await w.blur();
    await expect(w).toHaveValue('490');
    await page.getByRole('button', { name: '420 × 720（直長）' }).click();
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 420 × 高 720');
    /* 倍率＝min(1, (舞台寬 − 32) ÷ 來源寬, 620 ÷ 來源高) */
    const m = await page.evaluate(() => {
      const area = document.querySelector('[data-testid="css-preview-area"]') as HTMLElement;
      const src = document.querySelector('[data-testid="css-preview-source"]') as HTMLElement;
      return { area: area.clientWidth, scale: Number(src.dataset.scale) };
    });
    expect(m.scale).toBeCloseTo(Math.min(1, (m.area - 32) / 420, 620 / 720), 5);
    await page.getByRole('button', { name: '復原（Ctrl＋Z）' }).click();
    await expect(page.getByTestId('css-preview-size')).toContainText('寬 490 × 高 460');
    expect(errors).toEqual([]);
  });

  test('標題、秘匿分頁的參加者頭像、滑鼠移上時的分頁列', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: '秘匿分頁' }).click();
    await expect(visibleItems(page)).toHaveCount(5);
    await page.getByRole('combobox', { name: '範本' }).click();
    await page.getByRole('option', { name: '秘匿分頁用' }).click();
    await page.getByRole('button', { name: '套用', exact: true }).click();
    const f = await previewFrame(page);
    const look = () =>
      f.evaluate(() => {
        const sel = document.querySelector('button.MuiTab-root.Mui-selected') as HTMLElement;
        const pt = document.querySelector(
          '.MuiDrawer-paper > header > .MuiToolbar-root:nth-child(2)',
        ) as HTMLElement;
        const avatars = [...pt.querySelectorAll('.MuiAvatar-root')].map((a) =>
          Math.round(a.getBoundingClientRect().left),
        );
        return {
          title: getComputedStyle(sel, '::before').content + sel.textContent,
          titleTop: Math.round(sel.getBoundingClientRect().top),
          others: [...document.querySelectorAll('button.MuiTab-root:not(.Mui-selected)')].map(
            (b) => getComputedStyle(b).display,
          ),
          ptDisplay: getComputedStyle(pt).display,
          prefix: getComputedStyle(pt, '::before').content,
          avatars,
          ptTop: Math.round(pt.getBoundingClientRect().top),
        };
      });
    let l = await look();
    expect(l.title).toBe('"密談中｜"密談');
    expect(l.others.every((d) => d === 'none')).toBe(true);
    expect(l.ptDisplay).toBe('flex');
    expect(l.prefix).toBe('"參加者"');
    /* DOM 中最後一個在最左邊，負間隔互相重疊 */
    expect(l.avatars[2]).toBeLessThan(l.avatars[1]);
    expect(l.avatars[1] - l.avatars[2]).toBeLessThan(24);
    expect(l.ptTop).toBeGreaterThan(l.titleTop);
    /* 分頁名稱的標題：輸入區 form 自帶的 10% 黑底清掉（F20）；標題到頭像列間隔 8 px（F32） */
    const titleLook = await f.evaluate(() => {
      const form = document.querySelector('.MuiDrawer-paper > div.MuiPaper-root > form')!;
      const row = document.querySelector(
        '.MuiDrawer-paper > div.MuiPaper-root > form > header',
      ) as HTMLElement;
      const pt = document.querySelector(
        '.MuiDrawer-paper > header > .MuiToolbar-root:nth-child(2)',
      ) as HTMLElement;
      return {
        formBg: getComputedStyle(form).backgroundColor,
        gap: Math.round(pt.getBoundingClientRect().top - row.getBoundingClientRect().bottom),
      };
    });
    expect(titleLook).toEqual({ formBg: 'rgba(0, 0, 0, 0)', gap: 8 });
    /* 沒有套 CSS 時（CCFOLIA 原本的樣子）form 有約 10% 黑的底：暫時停用工具的 CSS（iframe 的第一個 style）來看 */
    expect(
      await f.evaluate(() => {
        const st = document.head.querySelector('style') as HTMLStyleElement;
        st.disabled = true;
        const bg = getComputedStyle(
          document.querySelector('.MuiDrawer-paper > div.MuiPaper-root > form')!,
        ).backgroundColor;
        st.disabled = false;
        return bg;
      }),
    ).toBe('rgba(0, 0, 0, 0.1)');
    /* 滑鼠移上：分頁列出現在視窗頂端、只有視窗寬（F86），標題列恢復成分頁列 */
    await page.locator('[data-testid="css-preview-source"]').hover();
    const bar = await f.evaluate(() => {
      const p = document.querySelector('.MuiDrawer-paper > div.MuiPaper-root') as HTMLElement;
      const paper = document.querySelector('.MuiDrawer-paper') as HTMLElement;
      const r = p.getBoundingClientRect();
      const w = paper.getBoundingClientRect();
      return {
        position: getComputedStyle(p).position,
        top: Math.round(r.top - (w.top + paper.clientTop)),
        left: Math.round(r.left - (w.left + paper.clientLeft)),
        width: Math.round(r.width),
        windowWidth: paper.clientWidth,
        windowLeft: Math.round(w.left),
        tabs: [...document.querySelectorAll('button.MuiTab-root')].map(
          (b) => getComputedStyle(b).display !== 'none',
        ),
      };
    });
    expect(bar.position).toBe('absolute');
    expect(bar.top).toBe(0);
    expect(bar.left).toBe(0);
    expect(bar.width).toBe(bar.windowWidth);
    expect(bar.windowLeft).toBeGreaterThan(0);
    expect(bar.width).toBeLessThan(480);
    expect(bar.tabs).toEqual([true, true, true]);
    await page.mouse.move(0, 0);
    l = await look();
    expect(l.others.every((d) => d === 'none')).toBe(true);
    /* 關閉 F86：滑鼠移上也不出現 */
    await page.getByRole('tab', { name: 'OBS' }).click();
    await page.getByRole('switch', { name: '只在滑鼠移上時顯示分頁' }).click();
    await page.locator('[data-testid="css-preview-source"]').hover();
    expect(
      await f.evaluate(
        () =>
          getComputedStyle(document.querySelector('.MuiDrawer-paper > div.MuiPaper-root')!)
            .position,
      ),
    ).toBe('static');
    await page.mouse.move(0, 0);
    /* 主分頁沒有參加者列 */
    await page.getByRole('radio', { name: '主分頁' }).click();
    await expect(
      frame(page).locator('.MuiDrawer-paper > header > .MuiToolbar-root:nth-child(2)'),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('動畫的固定時間點：進場、放大彈出、閃一下、消失、長訊息捲動', async ({ page }) => {
    const errors = await open(page, '?pause=0');
    const f = await previewFrame(page);
    /** 把名稱為 name 的動畫（第 index 個）移到 t 毫秒，回傳該元素的計算樣式 */
    const at = (name: string, t: number, prop: string, index = -1) =>
      f.evaluate(
        ([n, ms, p, i]) => {
          const list = document
            .getAnimations()
            .filter((a) => (a as CSSAnimation).animationName === n) as CSSAnimation[];
          const a = list.at(i as number)!;
          a.currentTime = ms as number;
          const el = (a.effect as KeyframeEffect).target as Element;
          const pseudo = (a.effect as KeyframeEffect).pseudoElement;
          return getComputedStyle(el, pseudo ?? undefined).getPropertyValue(p as string);
        },
        [name, t, prop, index] as const,
      );
    await set(page, { enter: 'fade', enterDuration: 1 });
    await expect.poll(() => at('tk-chat-in', 250, 'opacity')).toMatch(/^0\.3[78]/);
    expect(Number(await at('tk-chat-in', 500, 'opacity'))).toBeCloseTo(0.685, 2);
    expect(Number(await at('tk-chat-in', 750, 'opacity'))).toBeCloseTo(0.907, 2);
    await set(page, { enter: 'pop', enterDuration: 1 });
    await expect.poll(() => at('tk-chat-in', 600, 'transform')).toContain('matrix(1.05');
    const scaleAt = async (t: number) =>
      Number(/matrix\(([\d.]+)/.exec(await at('tk-chat-in', t, 'transform'))?.[1]);
    expect(await scaleAt(250)).toBeCloseTo(0.866, 2);
    expect(await scaleAt(500)).toBeCloseTo(1.03, 2);
    /* 擲骰結果閃一下：0.35 秒約 1.75 倍、0.7 秒約 1.38 倍 */
    await set(page, { enter: 'none', resultFlash: true });
    await expect.poll(() => at('tk-chat-flash', 350, 'filter')).toMatch(/brightness\(1\.7[45]/);
    expect(await at('tk-chat-flash', 700, 'filter')).toMatch(/brightness\(1\.3[78]/);
    /* 消失：停留 2 秒後，淡出段經過 1/3 時約 0.84 */
    await set(page, { resultFlash: false, fade: true, fadeStay: 2, fadeDuration: 1.2 });
    await expect
      .poll(async () => Number(await at('tk-chat-out', 2000 + 300, 'opacity')))
      .toBeCloseTo(0.844, 2);
    expect(Number(await at('tk-chat-out', 2000 + 600, 'opacity'))).toBeCloseTo(0.488, 2);
    expect(await at('tk-chat-out', 3200, 'max-height')).toBe('0px');
    /* 長訊息捲動（480 × 200）：則數 1、填滿；等待 2 秒後 10 秒內等速往上，終點是內容底端貼齊視窗內容區底端 */
    await set(page, {
      width: 480,
      height: 200,
      fade: false,
      count: 1,
      scroll: true,
      scrollDelay: 2,
      scrollDuration: 10,
      boxShape: 'card',
      boxPadY: 7,
      boxBorderWidth: 0,
    });
    await page.getByRole('button', { name: '長文', exact: true }).click();
    await expect(status(page)).toContainText('長文');
    await expect
      .poll(async () => (await visibleTexts(page)).map((t) => t.text.slice(0, 7)))
      .toEqual(['【舊日記的最後']);
    const geometry = () =>
      f.evaluate(() => {
        const log = document.querySelector('ul[role="log"]')!.getBoundingClientRect();
        const txt = [...document.querySelectorAll('ul[role="log"] .MuiListItemText-root')]
          .map((e) => e as HTMLElement)
          .find((e) => getComputedStyle(e.closest('[data-index]')!).display !== 'none')!;
        return Math.min(0, log.height - 14 - txt.offsetHeight);
      });
    await expect.poll(geometry).toBeLessThan(-20);
    const end = await geometry();
    const ty = async (t: number) =>
      Number(
        /matrix\([^)]*,\s*([-\d.]+)\)/.exec(await at('tk-chat-scroll', t, 'transform'))?.[1] ?? 0,
      );
    expect(await ty(1000)).toBeCloseTo(0, 1);
    expect(await ty(4500)).toBeCloseTo(end * 0.25, 0);
    expect(await ty(7000)).toBeCloseTo(end * 0.5, 0);
    expect(await ty(12000)).toBeCloseTo(end, 0);
    expect(await ty(20000)).toBeCloseTo(end, 0);
    expect(errors).toEqual([]);
  });

  test('長訊息捲動：開啟時自動改成 1 則、填滿，並在狀態列說明；則數不是 1 時警告', async ({
    page,
  }) => {
    const errors = await open(page);
    await set(page, { sizeMode: 'fit' });
    await page.getByRole('tab', { name: '動態' }).click();
    await page.getByRole('switch', { name: /長訊息慢慢捲動/ }).click();
    await expect(status(page)).toContainText('則數改成 1、視窗改成填滿來源');
    expect(await settings(page)).toMatchObject({ scroll: true, count: 1, sizeMode: 'fill' });
    await set(page, { count: 3 });
    await expect(page.getByText(/則數不是 1，不會捲動/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('測試訊息與自訂測試訊息', async ({ page }) => {
    const errors = await open(page);
    const n0 = await item(page).count();
    await page.getByRole('button', { name: '擲骰成功', exact: true }).click();
    await expect(item(page)).toHaveCount(n0 + 1);
    await expect(status(page)).toContainText('已在主分頁送出一則「擲骰成功」測試訊息');
    let last = item(page).last();
    await expect(last).toContainText('成功');
    await expect(last.locator('.MuiTypography-caption').first()).toHaveText(' - 今日 21:08');
    /* 同種類輪流使用不同範例；時間每則往後一分鐘 */
    const firstText = (await last.locator('.MuiListItemText-secondary').textContent()) ?? '';
    await page.getByRole('button', { name: '擲骰成功', exact: true }).click();
    await expect(item(page)).toHaveCount(n0 + 2);
    await expect(item(page).last().locator('.MuiListItemText-secondary')).not.toHaveText(firstText);
    await expect(item(page).last().locator('.MuiTypography-caption').first()).toHaveText(
      ' - 今日 21:09',
    );
    /* 因設定看不到時說明原因 */
    await set(page, { diceOnly: true });
    await page.getByRole('button', { name: '聊天', exact: true }).click();
    await expect(status(page)).toContainText('只列出擲骰訊息，所以這則不會顯示');
    await set(page, { diceOnly: false, hideSystem: true });
    await page.getByRole('button', { name: '系統訊息', exact: true }).click();
    await expect(status(page)).toContainText('隱藏系統訊息');
    await page.getByRole('button', { name: '長文', exact: true }).click();
    await expect(status(page)).toContainText('長訊息慢慢捲動');
    await page.getByRole('button', { name: '別人的秘密擲骰', exact: true }).click();
    await expect(item(page).last()).toContainText('Secret dice');
    /* 自訂：空白、缺結果時錯誤；Enter 送出後清空 */
    const input = page.getByRole('textbox', { name: '測試訊息' });
    await input.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: '請先輸入內容' })).toBeVisible();
    await page.getByRole('combobox', { name: '種類' }).click();
    await page.getByRole('option', { name: '失敗' }).click();
    await input.fill('CC<=30 【跳躍】');
    await input.press('Enter');
    await expect(page.getByRole('alert').filter({ hasText: '「|」後面寫結果' })).toBeVisible();
    await input.fill('CC<=30 【跳躍】 | (1D100<=30) ＞ 77 ＞ 跳不過去');
    await input.press('Enter');
    await expect(input).toHaveValue('');
    last = item(page).last();
    await expect(last).toContainText('跳不過去');
    /* 種類決定配色 class（失敗） */
    expect(
      await last.locator('.MuiListItemText-secondary > .MuiTypography-body2').getAttribute('class'),
    ).toContain('css-1j13mke');
    /* 回到初始訊息 */
    await page.getByRole('button', { name: '回到初始訊息' }).click();
    await expect(item(page)).toHaveCount(n0);
    await expect(status(page)).toContainText('主分頁的訊息已回到初始的範例訊息');
    expect(errors).toEqual([]);
  });

  test('房間網址、輸出區的網址提示、複製網址與 CSS、下載 CSS', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page);
    /* 沒有網址：警告＋前往房間網址 */
    await expect(page.getByText(/會拍到整個房間畫面/)).toBeVisible();
    await page.getByRole('button', { name: '前往房間網址' }).click();
    const room = page.getByRole('textbox', { name: '房間網址' });
    await expect(room).toBeFocused();
    await expect(page.getByRole('tab', { name: 'OBS' })).toHaveAttribute('aria-selected', 'true');
    await room.fill('https://ccfolia.com/rooms/Zz99/chat?x=1');
    await room.blur();
    const urls = page.getByRole('textbox', { name: '瀏覽器來源網址' });
    await expect(urls.first()).toHaveValue('https://ccfolia.com/rooms/Zz99/chat');
    await page.getByRole('button', { name: '複製網址' }).first().click();
    await expect(status(page)).toContainText('已複製網址');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'https://ccfolia.com/rooms/Zz99/chat',
    );
    /* 複製 CSS：提醒來源大小 */
    await page.getByRole('button', { name: '複製 CSS' }).click();
    await expect(status(page)).toContainText('寬 480 × 高 460');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('https://ccfolia.com/rooms/Zz99/chat');
    expect(clip).toContain('ul.MuiList-root[role="log"]');
    /* 下載 CSS：檔名清理 */
    const name = page.getByRole('textbox', { name: '檔案名稱' });
    await name.fill(' 擲骰/用:1 ');
    await name.blur();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '儲存 .css' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('擲骰_用_1.css');
    expect(readFileSync(await download.path(), 'utf8')).toBe(clip);
    await expect(status(page)).toContainText('已儲存「擲骰_用_1.css」');
    /* 房間清空：網址欄空白、按鈕停用 */
    await room.fill('abc');
    await expect(urls.first()).toHaveValue('');
    await expect(page.getByRole('button', { name: '複製網址' }).first()).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('專案檔：儲存、開啟（清空復原紀錄）、錯誤；全部重來', async ({ page }) => {
    const errors = await open(page);
    await set(page, { count: 9, fileName: '秘匿用' });
    await page.getByRole('button', { name: '專案' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /存成專案檔/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('秘匿用.chatwindow.json');
    const json = readFileSync(await download.path(), 'utf8');
    expect(JSON.parse(json)).toMatchObject({ tool: 'chat-window', data: { count: 9 } });
    await expect(status(page)).toContainText('已存成專案檔「秘匿用.chatwindow.json」');
    /* 改掉之後開啟：取代全部設定、清空復原紀錄 */
    await set(page, { count: 2 });
    const openFile = async (name: string, content: string) => {
      await page.getByRole('button', { name: '專案' }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('menuitem', { name: /開啟專案檔/ }).click(),
      ]);
      await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(content) });
    };
    await openFile('a.json', json);
    await expect(status(page)).toContainText('已開啟專案檔「a.json」');
    await expect.poll(async () => (await settings(page)).count).toBe(9);
    expect(await hook(page, '(t) => t.history()')).toEqual({ past: 0, future: 0 });
    await expect(page.getByRole('button', { name: '復原（Ctrl＋Z）' })).toBeDisabled();
    /* 同一個檔案可以連續開兩次 */
    await set(page, { count: 3 });
    await openFile('a.json', json);
    await expect.poll(async () => (await settings(page)).count).toBe(9);
    /* 錯誤：設定不變 */
    await openFile('b.json', '{ not json');
    await expect(status(page)).toContainText('無法開啟專案檔');
    await openFile(
      'c.json',
      JSON.stringify({ format: 'trpg-toolkit-project', tool: 'text-fx', data: {} }),
    );
    await expect(status(page)).toContainText('其他工具');
    expect((await settings(page)).count).toBe(9);
    /* 全部重來：確認後回到初始狀態、清空復原紀錄 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('目前的設定會全部清除');
    await dialog.getByRole('button', { name: '取消' }).click();
    expect((await settings(page)).count).toBe(9);
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: /全部重來/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '全部重來' }).click();
    await expect.poll(async () => (await settings(page)).count).toBe(6);
    expect(await settings(page)).toMatchObject({ fileName: 'chatwindow', templateId: 'night' });
    expect(await hook(page, '(t) => t.history()')).toEqual({ past: 0, future: 0 });
    await expect(status(page)).toContainText('已全部重來');
    expect(errors).toEqual([]);
  });

  test('復原／重做與快捷鍵（文字欄裡不作用）；拖曳中不記步', async ({ page }) => {
    const errors = await open(page);
    const undo = page.getByRole('button', { name: '復原（Ctrl＋Z）' });
    const redo = page.getByRole('button', { name: '重做（Ctrl＋Y）' });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    /* 拖曳滑桿：途中多次變更只記一步 */
    const slider = page.getByRole('slider', { name: '訊息間距' });
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const track = (await page.locator('[data-field]', { has: slider }).boundingBox())!;
    await page.mouse.move(track.x + track.width * 0.5, box.y + 4, { steps: 6 });
    await page.mouse.move(track.x + track.width * 0.6, box.y + 4, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(async () => (await hook<{ past: number }>(page, '(t) => t.history()')).past)
      .toBe(1);
    /* 勾選一次＝一步；快捷鍵在開關上照樣作用 */
    const sw = page.getByRole('switch', { name: /只列出擲骰訊息/ });
    await sw.click();
    expect((await settings(page)).diceOnly).toBe(true);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await settings(page)).diceOnly).toBe(false);
    await page.keyboard.press('Control+y');
    await expect.poll(async () => (await settings(page)).diceOnly).toBe(true);
    await page.keyboard.press('Control+Shift+z');
    await expect(redo).toBeDisabled();
    /* 文字欄裡交給輸入框自己（不會復原工具的設定） */
    await page.getByRole('tab', { name: 'OBS' }).click();
    const room = page.getByRole('textbox', { name: '房間網址' });
    await room.focus();
    await page.keyboard.press('Control+z');
    expect((await settings(page)).diceOnly).toBe(true);
    /* 文字欄改完（離開欄位）算一步 */
    await room.fill('abcd');
    await room.blur();
    await undo.click();
    await expect.poll(async () => (await settings(page)).room).toBe('');
    expect((await settings(page)).diceOnly).toBe(true);
    await redo.click();
    await expect.poll(async () => (await settings(page)).room).toBe('abcd');
    expect(errors).toEqual([]);
  });

  test('自動存檔：設定、預覽分頁、預覽背景、設定分頁；分頁列的鍵盤操作', async ({ page }) => {
    const errors = await open(page);
    await set(page, { count: 11, room: 'Room_1234' });
    await page.getByRole('radio', { name: '秘匿分頁' }).click();
    await page.getByRole('radio', { name: '深色背景' }).click();
    /* 分頁列：方向鍵（頭尾循環）、Home／End */
    const first = page.getByRole('tab', { name: '基本' });
    const obs = page.getByRole('tab', { name: 'OBS' });
    await first.click();
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(obs).toBeFocused();
    await expect(obs).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(first).toBeFocused();
    await page.keyboard.press('End');
    await expect(obs).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: '動態' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: '動態' })).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __chatWindow?: unknown }).__chatWindow,
    );
    expect(await settings(page)).toMatchObject({ count: 11, room: 'Room_1234' });
    await expect(page.getByRole('tab', { name: '動態' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('radio', { name: '秘匿分頁' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('radio', { name: '深色背景' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    /* 預覽設定不列入復原 */
    expect(await hook(page, '(t) => t.history()')).toEqual({ past: 0, future: 0 });
    /* 存檔被改壞時補齊與修正 */
    await page.evaluate(() =>
      localStorage.setItem(
        'trpg-toolkit:chat-window',
        JSON.stringify({
          state: { data: { count: 999, order: 'x', templateId: 'zzz' } },
          version: 1,
        }),
      ),
    );
    await page.reload();
    await page.waitForFunction(
      () => !!(window as unknown as { __chatWindow?: unknown }).__chatWindow,
    );
    expect(await settings(page)).toMatchObject({
      count: 30,
      order: 'newest-bottom',
      templateId: null,
    });
    expect(errors).toEqual([]);
  });

  test('條件式顯示：無框時隱藏方框設定；名稱前綴時隱藏間距、時間與截斷', async ({ page }) => {
    const errors = await open(page);
    /* 只在 OBS 31 起有效的選項有小標籤 */
    await expect(page.locator('[data-obs-badge]')).toHaveCount(2);
    await page.getByRole('switch', { name: /只列出擲骰訊息/ }).click();
    await expect(page.locator('[data-obs-badge]')).toHaveCount(1);
    await page.getByRole('tab', { name: '訊息' }).click();
    await expect(page.getByRole('slider', { name: '方框圓角' })).toBeVisible();
    await expect(page.locator('[data-obs-badge]')).toHaveCount(1);
    await page.getByRole('radio', { name: '無框' }).click();
    await expect(page.getByRole('slider', { name: '方框圓角' })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: /成敗時外框發光/ })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: '內側留白（左右）' })).toBeVisible();
    await page.getByRole('radio', { name: '「名稱：」' }).click();
    await expect(page.getByRole('switch', { name: '顯示發言時間' })).toHaveCount(0);
    await page.getByRole('tab', { name: '文字' }).click();
    await expect(page.getByRole('slider', { name: '長訊息截斷' })).toHaveCount(0);
    await page.getByRole('tab', { name: '動態' }).click();
    await expect(page.locator('[data-obs-badge]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('localStorage 寫入被擋時開頁正常、照常操作（F96）', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = function setItem(key: string) {
        throw new DOMException(`blocked:${key}`, 'QuotaExceededError');
      };
    });
    const errors = await open(page);
    await expect(status(page)).toContainText('準備完成');
    await page.getByRole('radio', { name: '秘匿分頁' }).click();
    await expect(visibleItems(page)).toHaveCount(5);
    await page.getByRole('tab', { name: '視窗' }).click();
    await set(page, { count: 2 });
    await expect(visibleItems(page)).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('方框與結果的發光：色塊不發光（F67）；開發光時以發光取代方框陰影（F46）', async ({
    page,
  }) => {
    const errors = await open(page);
    await set(page, {
      count: 8,
      diceOnly: false,
      boxShape: 'card',
      boxShadow: 100,
      boxBorderWidth: 2,
      outcomeGlow: true,
      resultStyle: 'solid',
      resultGlow: true,
      successColor: '#22aa55',
    });
    const f = await previewFrame(page);
    const look = () =>
      f.evaluate(() => {
        const ok = document.querySelector(
          'ul[role="log"] div[data-index]:has(.MuiListItemText-secondary > .css-1l6qhgm)',
        )!;
        const plain = [...document.querySelectorAll('ul[role="log"] div[data-index]')].find(
          (d) => !d.querySelector('.MuiListItemText-secondary > .MuiTypography-body2'),
        )!;
        return {
          okBox: getComputedStyle(ok.querySelector('.MuiListItem-root')!).boxShadow,
          plainBox: getComputedStyle(plain.querySelector('.MuiListItem-root')!).boxShadow,
          chip: getComputedStyle(ok.querySelector('.MuiListItemText-secondary > .css-1l6qhgm')!)
            .boxShadow,
        };
      });
    await expect.poll(async () => (await look()).okBox).toBe('rgb(34, 170, 85) 0px 0px 12px 0px');
    const l = await look();
    expect(l.plainBox).toBe('rgb(0, 0, 0) 0px 2px 10px 0px');
    expect(l.chip).toBe('none');
    expect(errors).toEqual([]);
  });

  test('長訊息捲動時左側線條仍貼在方框左緣、從頂到底（F71）', async ({ page }) => {
    const errors = await open(page, '?pause=0');
    await set(page, {
      width: 480,
      height: 200,
      bg: '#101010',
      fade: false,
      enter: 'none',
      count: 1,
      scroll: true,
      scrollDelay: 2,
      scrollDuration: 10,
      boxShape: 'card',
      boxBg: '#202020',
      boxBorderWidth: 0,
      boxRadius: 0,
      boxShadow: 0,
      boxPadX: 14,
      boxPadY: 7,
      accent: 'custom',
      accentColor: '#ff00ff',
      accentWidth: 4,
      avatar: true,
      avatarSize: 40,
      avatarGap: 10,
    });
    await page.getByRole('button', { name: '長文', exact: true }).click();
    await expect
      .poll(async () => (await visibleTexts(page)).map((t) => t.text.slice(0, 7)))
      .toEqual(['【舊日記的最後']);
    const f = await previewFrame(page);
    /* 捲到一半 */
    await f.evaluate(() => {
      for (const a of document.getAnimations() as CSSAnimation[])
        if (a.animationName === 'tk-chat-scroll') a.currentTime = 7000;
    });
    const li = frame(page).locator('ul[role="log"] div[data-index]:visible .MuiListItem-root');
    const shot = await li.screenshot({ animations: 'allow' });
    const probe = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const magenta = (x: number, y: number) => {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return r > 200 && g < 60 && b > 200;
      };
      const rows = [2, Math.round(img.height / 2), img.height - 3];
      return {
        h: img.height,
        edge: rows.map((y) => magenta(1, y)),
        /* 文字欄左緣（左右留白 14＋線 4＋頭像 40＋間距 10＝68）附近沒有線 */
        text: rows.map((y) => magenta(70, y)),
      };
    }, shot.toString('base64'));
    expect(probe.h).toBeGreaterThan(100);
    expect(probe.edge).toEqual([true, true, true]);
    expect(probe.text).toEqual([false, false, false]);
    expect(errors).toEqual([]);
  });

  test('紙張質感：平均色與亮度標準差符合舊版量測（F15）', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const errors = await open(page);
    await set(page, {
      width: 480,
      height: 460,
      sizeMode: 'fill',
      margin: 10,
      bg: '#efe4cb',
      texture: 'paper',
      borderWidth: 0,
      radius: 0,
      shadow: 0,
      brackets: false,
      titleMode: 'none',
      participants: false,
    });
    await page.evaluate(() =>
      (
        window as unknown as {
          __chatWindow: { scene: { setMessages: (m: [], i: number) => void } };
        }
      ).__chatWindow.scene.setMessages([], 0),
    );
    await page.waitForTimeout(300);
    const shot = await frame(page).locator('.MuiDrawer-paper').screenshot();
    const m = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let l = 0;
      let l2 = 0;
      const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        l += L;
        l2 += L * L;
      }
      return {
        size: [img.width, img.height],
        mean: [r / n, g / n, b / n],
        std: Math.sqrt(l2 / n - (l / n) ** 2),
      };
    }, shot.toString('base64'));
    expect(m.size).toEqual([460, 440]);
    /* 舊版：平均 (218,206,183)、亮度標準差 17.6（各通道 ±4、標準差 ±20%） */
    for (const [i, v] of [218, 206, 183].entries())
      expect(Math.abs(m.mean[i] - v)).toBeLessThanOrEqual(4);
    expect(m.std).toBeGreaterThan(17.6 * 0.8);
    expect(m.std).toBeLessThan(17.6 * 1.2);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：1280 寬', async ({ page }) => {
    const errors = await open(page, '?pause=2000');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('chat-window-1280.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('視覺回歸：390 寬，且每個分頁都沒有橫向捲動', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page, '?pause=2000');
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('chat-window-390.png', {
      fullPage: true,
      mask: masks(page),
    });
    await noHorizontalScroll(page);
    for (const tab of ['視窗', '訊息', '文字', '動態', 'OBS']) {
      await page.getByRole('tab', { name: tab }).click();
      await noHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });
});
