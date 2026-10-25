/**
 * 劇本排版台 2026-10 跟進第三批：對等驗證後的修正 U1～U10 的端對端測試（規格 7.5「第三批驗證後」）：
 * - 變數表的自動的列用輸入法打字（U1）；
 * - 對話文的行高、繞排圖片旁的對話文與有標籤的橫線、對話文裡面的段落（U2、U3、U4、U8）；
 * - 注釋的標題語欄（U7）；彈出視窗設定欄的說明、特殊區塊的「範本」（U6、U10）。
 */
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, type Page, test } from '@playwright/test';
import { getTool, outputDir } from '../../src/registry';

const URL = `/${outputDir(getTool('scenario-editor') ?? { id: 'scenario-editor', status: 'next' })}/`;

test.use({ contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1280, height: 900 } });

const stage = (page: Page) => page.getByTestId('se-stage');
const status = (page: Page) => page.getByTestId('se-status');
const source = (page: Page) => page.getByTestId('se-source');
const panel = (page: Page) => page.getByTestId('se-block-panel');

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
  await expect(status(page)).toContainText('已開啟');
  await expect(stage(page).locator('.pg').first()).toBeVisible();
  return errors;
}

type TestBlock = { id: string; type: string; cols: number; text: string } & Record<string, unknown>;
const blk = (id: string, type: string, text = '', extra: Record<string, unknown> = {}) =>
  ({ id, type, cols: 2, text, ...extra }) as TestBlock;

async function loadDoc(page: Page, title: string, blocks: TestBlock[], extra: object = {}) {
  const json = JSON.stringify({
    title,
    pkv: 1,
    padV: 18,
    padH: 16,
    base: 10,
    foot: { num: true, text: '', from: 1 },
    pages: [{ id: 'p1', bg: { preset: 'none', img: null, fit: 'cover', opa: 35 }, cols: 1 }],
    blocks,
    ...extra,
  });
  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('toolbar', { name: '工具列' })
    .getByRole('button', { name: '開啟', exact: true })
    .click();
  await (await chooser).setFiles({
    name: 'doc.json',
    buffer: Buffer.from(json),
    mimeType: 'application/json',
  });
  await expect(status(page)).toContainText(title);
}

async function savedDoc(page: Page) {
  const d = page.waitForEvent('download');
  await page.getByTestId('se-save-menu').click();
  await page.getByRole('menuitem', { name: /存成 JSON 檔/ }).click();
  const dl = await d;
  return JSON.parse(readFileSync(await dl.path()).toString('utf8')).data as {
    vars: { n: string; def: string; note: string }[];
  };
}

const PNG = (() => {
  /* 40×30 的藍色 PNG（長寬比 0.75） */
  const w = 40;
  const h = 30;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) raw.set([43, 74, 111], y * (w * 3 + 1) + 1 + x * 3);
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const v of b) {
      c ^= v;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t, 'latin1'), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
})();

test.describe('劇本排版台：第三批驗證後的修正（U1～U10）', () => {
  test('U1：變數表的自動的列用輸入法打字，注音不留下、焦點留在同一欄', async ({ page }) => {
    const errors = await open(page);
    await loadDoc(page, '輸入法', [blk('t', 'desc', '本文寫到 {HO3}。')]);
    await page.getByRole('tab', { name: '文件' }).click();
    await page.locator('[data-var-row="aHO3"] [data-vk="def"]').click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'ㄐ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: 'ㄐㄧ', selectionStart: 2, selectionEnd: 2 });
    /* 組字中還是自動的列 */
    await expect(page.locator('[data-var-row="aHO3"]')).toHaveCount(1);
    await cdp.send('Input.insertText', { text: '甲' });
    const reg = page.locator('[data-var-row="r0"] [data-vk="def"]');
    await expect(reg).toHaveValue('甲');
    await expect(reg).toBeFocused();
    await cdp.send('Input.imeSetComposition', { text: 'ㄧ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '乙' });
    await page.keyboard.type('丙');
    await expect(reg).toHaveValue('甲乙丙');
    expect((await savedDoc(page)).vars).toEqual([{ n: 'HO3', def: '甲乙丙', note: '' }]);
    expect(errors).toEqual([]);
  });

  test('U2～U4、U8：對話文的行高、繞排圖片旁的對話文與有標籤的橫線、對話文裡面的段落', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadDoc(page, '繞排', [
      blk('im', 'image', '', { img: PNG, ar: 0.75, w: 40, pos: 'right' }),
      blk('hr', 'hr', '幕間'),
      blk('dl', 'dialog', '「這是對話。」\n他說完就走了。', {
        sp: '管家',
        kids: [blk('k', 'desc', '對話裡的段落')],
      }),
      blk('z', 'desc', '尾'.repeat(200)),
    ]);
    await expect(stage(page).locator('.bp[data-id="k"]')).toBeVisible();
    await expect(stage(page).locator('.bp[data-id="dl"] .rt')).toBeVisible();
    const geo = await stage(page).evaluate((st) => {
      const q = (s: string) => st.querySelector(s) as HTMLElement;
      const r = (s: string) => q(s).getBoundingClientRect();
      const cs = (s: string) => getComputedStyle(q(s));
      return {
        hrBp: r('.bp[data-id="hr"]').width,
        hr: r('.bp[data-id="hr"] > .b').width,
        hrDisp: cs('.bp[data-id="hr"] > .b').display,
        hrTxCenter: (() => {
          const t = r('.bp[data-id="hr"] .hrtx');
          const b = r('.bp[data-id="hr"]');
          return t.left + t.width / 2 - (b.left + b.width / 2);
        })(),
        dlBp: r('.bp[data-id="dl"]').width,
        dl: r('.bp[data-id="dl"] > .b').width,
        dlDisp: cs('.bp[data-id="dl"] > .b').display,
        rtLh: Number.parseFloat(cs('.bp[data-id="dl"] .rt').lineHeight),
        rtFs: Number.parseFloat(cs('.bp[data-id="dl"] .rt').fontSize),
        rpLh: Number.parseFloat(cs('.bp[data-id="dl"] .rp').lineHeight),
        dlLeft: r('.bp[data-id="dl"] > .b').left,
        kidLeft: r('.bp[data-id="k"]').left,
      };
    });
    /* 有標籤的橫線：不縮（線畫到圖片邊），標籤在圖片旁的空間置中（往左偏） */
    expect(geo.hrDisp).toBe('block');
    expect(Math.abs(geo.hr - geo.hrBp)).toBeLessThan(0.5);
    expect(geo.hrTxCenter).toBeLessThan(-20);
    /* 對話文：整個縮到圖片旁（flow-root） */
    expect(geo.dlDisp).toBe('flow-root');
    expect(geo.dl).toBeLessThan(geo.dlBp - 50);
    /* 「」包住的行 1.85，其他 1.8 */
    expect(geo.rtLh / geo.rtFs).toBeCloseTo(1.85, 2);
    expect(geo.rpLh / geo.rtFs).toBeCloseTo(1.8, 2);
    /* 裡面的段落不多縮 */
    expect(Math.abs(geo.kidLeft - geo.dlLeft)).toBeLessThan(0.5);
    expect(errors).toEqual([]);
  });

  test('U7：注釋的標題語欄（文字欄與設定欄同步、紙面上方的小字）；U6、U10 的用詞', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadDoc(page, '注釋', [
      blk('nt', 'note', '不要碰。'),
      blk('p', 'proc', '判定', { lb: '偵查', bx: { ln: 'dash', fill: true, col: 'aka' } }),
      blk('pp', 'popup', '', { pop: { label: '地圖', body: '', only: false, blocks: [] } }),
    ]);
    const lb = source(page).locator('input[data-lbl="nt"]');
    await expect(lb).toHaveAttribute('placeholder', '（沒有標題語）');
    await expect(stage(page).locator('[data-id="nt"] .blb')).toHaveCount(0);
    await lb.fill('小心');
    await expect(stage(page).locator('[data-id="nt"] .blb')).toHaveText('小心');
    /* 設定欄的標題語是同一個值 */
    await source(page).locator('textarea[data-bid="nt"]').click();
    await expect(panel(page).getByLabel('標題語')).toHaveValue('小心');
    await panel(page).getByLabel('標題語').fill('注意');
    await expect(lb).toHaveValue('注意');
    await expect(stage(page).locator('[data-id="nt"] .blb')).toHaveText('注意');
    /* 特殊區塊的「範本」 */
    await source(page).locator('textarea[data-bid="p"]').click();
    await expect(panel(page).getByText('範本', { exact: true })).toBeVisible();
    await expect(panel(page)).not.toContainText('樣板');
    /* 彈出視窗的說明：特殊區塊（不是舊名） */
    await stage(page).locator('[data-id="pp"]').click();
    await expect(panel(page)).toContainText('特殊區塊、情報區塊、手冊的行首寫「＠地圖」');
    await expect(panel(page)).not.toContainText('規則框');
    expect(errors).toEqual([]);
  });
});
