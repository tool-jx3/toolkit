/**
 * CCFOLIA 日誌轉換器（建置產物 tools/log-converter/）的端對端測試：
 * - 開頁：沒有 pageerror／console error、選檔前不顯示詳細設定、頁尾只有靈感來源、不連外（Google Fonts 除外，F102）；
 * - 附件 36 組在 Chromium 裡重跑（與介面相同的規則與 canvas 圖片處理），比對區塊、計算後的顏色、名稱欄寬、
 *   頭像與插圖的格式／尺寸／中心色、頁面與標題區（第 7 節裁定修正的案例比修正後的預期）；
 * - 介面流程：選檔與自動帶入（F01～F12、F16、F19）、新格式的加入／移除／改名（F07～F09、F54）、
 *   轉換與預覽（F69、F72～F75，1200 則）、下載與 ZIP、部落格貼文版（解析下載的檔案）、副旁白、頭像、插圖、
 *   大圖警告（F70）、設定的記住／匯出／匯入／重設（F66～F68、F93）；
 * - 390 寬沒有橫向捲動；1280 與 390 的視覺回歸基準。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getTool, outputDir } from '../../src/registry';
import type { HookCase } from '../../src/tools/log-converter/pipeline';
import {
  caseSetup,
  expectedFor,
  type ImageRefs,
  type LcAttachment,
  longLog,
  normalizeBlocks,
  STYLE_OF,
} from '../helpers/logConverterCases';
import { extractLogBlocks } from '../helpers/logConverterExtract';

const URL = `/${outputDir(getTool('log-converter') ?? { id: 'log-converter', status: 'next' })}/`;
const ATT = JSON.parse(
  readFileSync(
    new globalThis.URL('../../../docs/refactor/specs/log-converter.examples.json', import.meta.url),
    'utf8',
  ),
) as LcAttachment;

const LEGACY = '[小芋、阿和] 霧港燈塔 [main].html';
const V2_ALL = [
  '霧港燈塔 [all].html',
  '霧港燈塔 [main].html',
  '霧港燈塔 [info].html',
  '霧港燈塔 [other].html',
  '霧港燈塔 [秘密].html',
];

async function routeExternal(target: Page | BrowserContext) {
  await target.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await target.route(/example\.com/, (r) => r.fulfill({ status: 404, body: '' }));
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    /* 預覽是不執行指令碼的內嵌框；Playwright 在框裡定位元素時 Chromium 會記一筆「Blocked script execution」 */
    if (
      m.type() === 'error' &&
      !/example\.com|404|Blocked script execution in 'about:srcdoc'/.test(m.text())
    )
      errors.push(`console: ${m.text()}`);
  });
  await routeExternal(page);
  await page.goto(URL);
  await expect(page.getByRole('heading', { level: 1, name: 'CCFOLIA 日誌轉換器' })).toBeVisible();
  return errors;
}

const fileOf = (name: string, text = ATT.樣本日誌[name]) => ({
  name,
  mimeType: 'text/html',
  buffer: Buffer.from(text, 'utf8'),
});
const dropInput = (page: Page) =>
  page.getByRole('group', { name: '日誌檔' }).locator('input[type=file]');

async function loadFiles(page: Page, files: ReturnType<typeof fileOf>[]) {
  await dropInput(page).setInputFiles(files);
  await expect(page.getByTestId('log-summary')).toBeVisible();
}

const btn = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' });
const tab = (page: Page, name: string) => page.getByRole('tab', { name });
const frame = (page: Page) => page.frameLocator('[data-testid="preview-frame"]');
const status = (page: Page) => page.getByTestId('status');

async function convert(page: Page) {
  await btn(page, '開始轉換').click();
  await expect(status(page)).toContainText('轉換完成');
}

async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(sw, '不應出現橫向捲動').toBeLessThanOrEqual(cw);
}

async function download(page: Page, name: string | RegExp) {
  const [d] = await Promise.all([page.waitForEvent('download'), btn(page, name).click()]);
  return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
}

async function pickSelect(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/* ---------- 附件 36 組（Chromium） ---------- */

function hookCase(id: string): { input: HookCase; fontSize: number } {
  const c = ATT.案例.find((x) => x.編號 === id)!;
  const s = caseSetup(ATT, c);
  const input: HookCase = {
    files: c.輸入檔.map((name) => ({ name, text: ATT.樣本日誌[name] })),
    settings: { style: s.style, ...s.settings },
    choices: {
      ...(s.narrator ? { narrator: s.narrator } : {}),
      ...(s.chatTab === null ? { chatTab: null } : {}),
      hiddenTabs: s.hiddenTabs,
      ...(s.tabStyles === 'all-label'
        ? { tabStylesAll: 'label' as const }
        : { tabStyles: s.tabStyles }),
      ...(s.title !== undefined ? { title: s.title } : {}),
      ...(s.subtitle !== undefined ? { subtitle: s.subtitle } : {}),
      ...(s.summary !== undefined ? { summary: s.summary } : {}),
      ...(s.useLogImages === false ? { useLogImages: false } : {}),
    },
    nameColors: s.nameColors === 'compare' ? ATT.比對用配色.名稱顏色 : undefined,
    renames: s.renames,
    uploads: Object.fromEntries(
      Object.entries(s.uploads).map(([sp, u]) => [
        sp,
        u.kind === 'file' ? { kind: 'file' as const, data: ATT.樣本圖片[u.image] } : u,
      ]),
    ),
    illustrations: s.illustrations.map((it, i) => ({
      id: String(i),
      position: it.position,
      source: it.source,
      data: it.image ? ATT.樣本圖片[it.image] : undefined,
      fileName: it.image ?? '',
      url: it.url ?? '',
      size: it.size,
      align: it.align,
    })),
  };
  return { input, fontSize: (s.settings.fontSize as number | undefined) ?? 17 };
}

/** 抽出來的圖片（data URL）→ 格式、尺寸、中心色 */
async function describeImages(page: Page, refs: ImageRefs) {
  const out: Record<number, unknown> = {};
  for (const [id, ref] of refs) {
    const src = String(ref.src ?? '');
    if (!src.startsWith('data:')) {
      out[id] = { 格式: '外部網址' };
      continue;
    }
    out[id] = await page.evaluate(async (s) => {
      const img = new Image();
      img.src = s;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return {
        格式: /^data:([^;,]+)/.exec(s)![1],
        寬: img.naturalWidth,
        高: img.naturalHeight,
        中心色: [d[0], d[1], d[2]],
      };
    }, src);
  }
  return out;
}

test.describe('附件 36 組（Chromium 計算後的樣式）', () => {
  test('全部案例', async ({ page, context }) => {
    test.setTimeout(240_000);
    await open(page);
    await routeExternal(context);
    const view = await context.newPage();
    for (const c of ATT.案例) {
      if (c.編號 === 'L20') continue; // 依大小分割：切點不比（單元測試檢查條件）
      const { input, fontSize } = hookCase(c.編號);
      const out = await page.evaluate(
        (x) =>
          (
            window as unknown as {
              __logConverter: {
                convertCase: (c: HookCase) => Promise<{ pages: string[]; blog: string[] }>;
              };
            }
          ).__logConverter.convertCase(x),
        input,
      );
      const exp = expectedFor(c);
      for (const d of c.下載) {
        const expected = exp.blocks(d);
        if (!expected) continue;
        const m = /第 (\d+) 檔/.exec(d.按鈕);
        const i = m ? Number(m[1]) - 1 : 0;
        const html = d.部落格貼文版 ? out.blog[i] : out.pages[i];
        await view.setContent(html, { waitUntil: 'load' });
        const got = await view.evaluate(extractLogBlocks, true);
        const where = `${c.編號} ${d.按鈕}`;
        expect(got.page, `${where} 頁面`).toEqual(d.頁面);
        expect(got.標題區, `${where} 標題區`).toEqual(d.標題區);
        const o = { colors: !exp.colorless, fontSize };
        const refsA: ImageRefs = new Map();
        const refsE: ImageRefs = new Map();
        expect(normalizeBlocks(got.區塊, o, 'actual', refsA), where).toEqual(
          normalizeBlocks(expected, o, 'expected', refsE),
        );
        const actualImages = await describeImages(view, refsA);
        for (const [id, want] of refsE) {
          const have = actualImages[id] as Record<string, unknown>;
          if (want.格式 === '外部網址') {
            expect(have.格式, `${where} 圖片 ${id}`).toBe('外部網址');
            continue;
          }
          expect({ 格式: have.格式, 寬: have.寬, 高: have.高 }, `${where} 圖片 ${id}`).toEqual({
            格式: want.格式,
            寬: want.寬,
            高: want.高,
          });
          const center = /rgb\((\d+),(\d+),(\d+)\)/.exec(String(want.中心色))!.slice(1).map(Number);
          const have3 = have.中心色 as number[];
          for (let k = 0; k < 3; k++)
            expect(
              Math.abs(have3[k] - center[k]),
              `${where} 圖片 ${id} 中心色`,
            ).toBeLessThanOrEqual(8);
        }
      }
      expect(STYLE_OF[c.輸出樣式]).toBeTruthy();
    }
    await view.close();
  });
});

/* ---------- 介面流程 ---------- */

test.describe('介面', () => {
  test('開頁：沒有錯誤、選檔前不顯示詳細設定、頁尾只有靈感來源、不連外', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const u = new globalThis.URL(r.url());
      if (u.hostname !== '127.0.0.1' && !/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))
        external.push(r.url());
    });
    const errors = await open(page);
    await expect(page.getByTestId('no-log')).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toHaveText(
      '靈感來源：Eon-00/eon-ccfolia-log-converter',
    );
    await expect(page.getByTestId('preview-empty')).toBeVisible();
    /* 沒選檔就按轉換：提示要先選檔（F69） */
    await btn(page, '開始轉換').click();
    await expect(status(page)).toContainText('請先選擇日誌檔');
    await loadFiles(page, [fileOf(LEGACY)]);
    await convert(page);
    await expect(frame(page).locator('.lc-dlg').first()).toBeVisible();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('舊格式：自動帶入、轉換、預覽的序號、下載不含序號（F01～F03、F11、F16、F19、F40、F69～F80）', async ({
    page,
  }) => {
    const errors = await open(page);
    /* 一次選兩個舊格式檔：只用第一個（F03） */
    await loadFiles(page, [fileOf(LEGACY), fileOf('legacy-short.html')]);
    await expect(page.getByTestId('file-notice')).toContainText(`只用了「${LEGACY}」`);
    await expect(page.getByTestId('log-summary')).toContainText('17 則訊息');
    await expect(page.getByLabel('標題', { exact: true })).toHaveValue('霧港燈塔');
    await expect(page.getByLabel('副標題', { exact: true })).toHaveValue('小芋、阿和');
    await expect(page.getByRole('combobox', { name: '旁白角色' })).toHaveText('GM');
    await expect(page.getByRole('combobox', { name: '閒聊分頁' })).toHaveText('other');
    await convert(page);
    await expect(page.getByTestId('preview-info')).toHaveText('顯示第 1～17 則 · 共 17 則');
    /* 預覽：不執行指令碼、帶訊息序號（F72、F75） */
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('sandbox', '');
    await expect(frame(page).locator('[data-log-num]').first()).toHaveAttribute(
      'data-log-num',
      '1',
    );
    const after = await frame(page)
      .locator('[data-log-num="3"]')
      .evaluate((el) => getComputedStyle(el, '::after').content);
    expect(after).toContain('#');
    /* 單檔下載（F76、F79、F80） */
    const file = await download(page, '下載 HTML');
    expect(file.name).toBe('霧港燈塔.html');
    const html = file.bytes.toString('utf8');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).not.toContain('data-log-num');
    expect(html).not.toContain('<script');
    expect(html).toContain('<html lang="zh-Hant-TW">');
    /* 關閉序號：預覽也沒有（F40） */
    await tab(page, '插圖').click();
    await page.getByRole('switch', { name: '預覽顯示訊息序號' }).click();
    await page.getByRole('button', { name: '檢視', exact: true }).click();
    await expect(frame(page).locator('[data-log-num]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('新格式：多檔合併、檔案清單、移除、加入、改名、混選與全分頁檔的提示（F04～F10、F54）', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadFiles(
      page,
      V2_ALL.map((n) => fileOf(n)),
    );
    const rows = page.getByTestId('loaded-files').locator('li');
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText('15 則 · メイン、情報、雑談、秘密頻道');
    await expect(page.getByLabel('標題', { exact: true })).toHaveValue('霧港燈塔');
    await expect(page.getByRole('combobox', { name: '閒聊分頁' })).toHaveText('雑談');
    /* 移除全分頁檔 → 各分頁檔合併（V05 的組合，15 → 14 則：12:07 的空白訊息只在全分頁檔…） */
    await btn(page, '從清單移除「霧港燈塔 [all].html」').click();
    await expect(rows).toHaveCount(4);
    /* 加入重複的檔：略過（F08） */
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '加入檔案').click(),
    ]);
    await chooser.setFiles([fileOf('霧港燈塔 [main].html')]);
    await expect(page.getByTestId('file-notice')).toHaveText('這些檔案已經載入過，所以沒有加入。');
    /* 加入舊格式：排除 */
    const [c2] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '加入檔案').click(),
    ]);
    await c2.setFiles([fileOf('legacy-short.html')]);
    await expect(page.getByTestId('file-notice')).toHaveText(
      '要加入的檔案不是新格式的日誌，所以沒有加入。',
    );
    /* 分頁改名（F54）：Xk3pQ9aZ → 密談；加入檔案後名稱保留 */
    await tab(page, '進階').click();
    const rename = page.getByRole('textbox', { name: '分頁 Xk3pQ9aZ 的名稱' });
    await rename.fill('密談');
    await rename.press('Enter');
    await expect(page.getByTestId('visible-tabs')).toContainText('[密談]');
    const [c3] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '加入檔案').click(),
    ]);
    await c3.setFiles([fileOf('霧港燈塔 [all].html')]);
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('file-notice')).toHaveCount(0);
    await expect(rename).toHaveValue('密談');
    /* 改成與其他分頁相同的名稱：合併成一個分頁 */
    await rename.fill('情報');
    await rename.press('Enter');
    await expect(page.getByTestId('visible-tabs').getByRole('checkbox')).toHaveCount(3);
    /* 全部移除：回到未載入（F09） */
    for (let i = 5; i > 0; i--) await rows.first().getByRole('button').click();
    await expect(page.getByTestId('file-notice')).toHaveText('已移除所有檔案，請重新選擇日誌檔。');
    await expect(page.getByTestId('no-log')).toBeVisible();

    /* 混選＋多個全分頁檔（F05、F06；V10） */
    await loadFiles(
      page,
      ['霧港燈塔 [all].html', '霧港燈塔 [all]-副本.html', 'legacy-short.html'].map((n) =>
        fileOf(n),
      ),
    );
    await expect(page.getByTestId('file-notice')).toContainText('有 1 個檔案格式不同');
    await expect(page.getByTestId('file-notice')).toContainText('含有全部分頁的檔案有 2 個');
    await expect(rows.nth(1)).toHaveAttribute('data-usage', 'dropped-multi');
    /* 新格式讀不到訊息：分析失敗（F10） */
    await dropInput(page).setInputFiles([
      fileOf(
        '空的 [main].html',
        '<html><body><article class="message" data-channel="main"><p class="message-text"> </p></article></body></html>',
      ),
    ]);
    await expect(page.getByTestId('load-status')).toContainText('分析失敗');
    await expect(page.getByTestId('no-log')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('預覽區段：1200 則、起始超出範圍的修正、Enter、全部（F72～F74）', async ({ page }) => {
    const errors = await open(page);
    await loadFiles(page, [fileOf('長團 [main].html', longLog(ATT))]);
    const t0 = Date.now();
    await convert(page);
    expect(Date.now() - t0, '1200 則轉換').toBeLessThan(5000);
    await expect(page.getByTestId('preview-info')).toHaveText('顯示第 1～500 則 · 共 1,200 則');
    await expect(frame(page).locator('[data-log-num]')).toHaveCount(500);
    await pickSelect(page, '則數', '300 則');
    await expect(page.getByTestId('preview-info')).toHaveText('顯示第 1～300 則 · 共 1,200 則');
    const start = page.getByRole('spinbutton', { name: '起始編號' });
    await start.fill('5000');
    await start.press('Enter');
    await expect(start).toHaveValue('901');
    await expect(page.getByTestId('preview-info')).toHaveText('顯示第 901～1,200 則 · 共 1,200 則');
    await expect(frame(page).locator('[data-log-num]').first()).toHaveAttribute(
      'data-log-num',
      '901',
    );
    await start.fill('0');
    await btn(page, '檢視').click();
    await expect(start).toHaveValue('1');
    await pickSelect(page, '則數', '全部');
    await expect(page.getByTestId('preview-info')).toHaveText('顯示全部 1,200 則');
    await expect(frame(page).locator('[data-log-num]')).toHaveCount(1200);
    expect(errors).toEqual([]);
  });

  test('分割、ZIP、部落格貼文版（F63、F65、F77、F78、3.9、3.10）', async ({ page }) => {
    const errors = await open(page);
    await loadFiles(page, [fileOf(LEGACY)]);
    await tab(page, '進階').click();
    await page.getByRole('radio', { name: '依則數' }).click();
    await page.getByRole('spinbutton', { name: '每檔則數' }).fill('5');
    await page.getByRole('spinbutton', { name: '每檔則數' }).press('Enter');
    await page.getByRole('switch', { name: '一併產生部落格貼文版' }).click();
    await btn(page, '開始轉換').click();
    await expect(status(page)).toHaveText('轉換完成，已分成 4 個檔案。');
    const zip = await download(page, '全部下載（ZIP）');
    expect(zip.name).toBe('霧港燈塔_all.zip');
    const files = unzipSync(new Uint8Array(zip.bytes));
    expect(Object.keys(files)).toEqual([1, 2, 3, 4].map((i) => `霧港燈塔_part${i}.html`));
    const part2 = new TextDecoder().decode(files['霧港燈塔_part2.html']);
    expect(part2).toContain('<title>霧港燈塔 (Part 2)</title>');
    expect(part2).toContain('第 2 頁，共 4 頁');
    const blogZip = await download(page, '部落格貼文版・全部（ZIP）');
    expect(blogZip.name).toBe('霧港燈塔_web_all.zip');
    expect(Object.keys(unzipSync(new Uint8Array(blogZip.bytes)))).toEqual(
      [1, 2, 3, 4].map((i) => `霧港燈塔_part${i}_web.html`),
    );
    const p1 = await download(page, '下載第 1 檔');
    expect(p1.name).toBe('霧港燈塔_part1.html');
    const b1 = await download(page, '第 1 檔（部落格貼文版）');
    expect(b1.name).toBe('霧港燈塔_part1_web.html');
    const b2 = await download(page, '第 2 檔（部落格貼文版）');
    const frag1 = b1.bytes.toString('utf8');
    const frag2 = b2.bytes.toString('utf8');
    /* 片段：沒有文件宣告、html、head、body、title；開頭是字元集宣告與樣式；樣式全部限定在容器內 */
    expect(frag1.startsWith('<meta charset="UTF-8">\n<style>')).toBe(true);
    for (const tag of [/<!DOCTYPE/i, /<html[\s>]/, /<head[\s>]/, /<body[\s>]/, /<title>/])
      expect(frag1).not.toMatch(tag);
    const id1 = /id="(lc-log-[a-z0-9]+)"/.exec(frag1)![1];
    const id2 = /id="(lc-log-[a-z0-9]+)"/.exec(frag2)![1];
    expect(id1).not.toBe(id2);
    const css = /<style>([\s\S]*?)<\/style>/.exec(frag1)![1];
    for (const rule of css.split('}').filter((r) => r.includes('{'))) {
      const sel = rule.slice(0, rule.indexOf('{'));
      if (sel.trim().startsWith('@')) continue;
      for (const s of sel.split(',')) expect(s.trim().startsWith(`#${id1}`), s).toBe(true);
    }
    /* 兩份貼到同一頁：各自的配色不互相覆蓋 */
    await page.setContent(
      `<body style="background:#fff">${frag1}<hr>${frag2.replace(/#e8ecf0/g, '#ff0000')}</body>`,
    );
    const colors = await page.evaluate(
      ([a, b]) => [a, b].map((id) => getComputedStyle(document.getElementById(id)!).color),
      [id1, id2],
    );
    expect(colors).toEqual(['rgb(232, 236, 240)', 'rgb(255, 0, 0)']);
    expect(errors).toEqual([]);
  });

  test('副旁白、名稱顏色、頭像、插圖（F20～F24、F31、F41～F46）', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: 'CCFOLIA 風格' }).click();
    await loadFiles(page, [fileOf(LEGACY)]);
    /* 副旁白 */
    await expect(page.getByTestId('sub-empty')).toBeVisible();
    await pickSelect(page, '要加入的發言者', '林曉雨');
    await btn(page, '新增').click();
    await expect(page.locator('[data-sub-narrator="林曉雨"]')).toBeVisible();
    await pickSelect(page, '「林曉雨」的樣式', '旁白（指定顏色）');
    await page.getByRole('textbox', { name: '「林曉雨」的文字色碼' }).fill('#ffab40');
    await page.getByRole('textbox', { name: '「林曉雨」的文字色碼' }).press('Enter');
    /* 頭像：上傳陳志明（最小品質 → 長邊 100 px） */
    await tab(page, '外觀').click();
    await pickSelect(page, '圖片品質', '最小（每張約 3 KB）');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('[data-profile="陳志明"]').getByRole('button', { name: '選擇圖片' }).click(),
    ]);
    const amber = Buffer.from(ATT.樣本圖片['face-amber.png'].split(',')[1], 'base64');
    await chooser.setFiles({ name: 'face.png', mimeType: 'image/png', buffer: amber });
    await expect(page.locator('[data-profile="陳志明"]').getByTestId('profile-state')).toHaveText(
      'face.png',
    );
    await expect(page.getByTestId('avatar-total')).toContainText('頭像總容量');
    /* 名稱顏色 */
    await page.getByRole('textbox', { name: '「陳志明」名稱色碼' }).fill('#00ff00');
    await page.getByRole('textbox', { name: '「陳志明」名稱色碼' }).press('Enter');
    /* 插圖：第 3 則之後 */
    await tab(page, '插圖').click();
    await btn(page, '新增插圖').click();
    await page.getByRole('spinbutton', { name: '插在第幾則之後' }).fill('3');
    const [c2] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('[data-illustration="1"]').getByRole('button', { name: '選擇圖片' }).click(),
    ]);
    const teal = Buffer.from(ATT.樣本圖片['ill-teal.png'].split(',')[1], 'base64');
    await c2.setFiles({ name: 'map.png', mimeType: 'image/png', buffer: teal });
    await expect(page.locator('[data-illustration="1"] img')).toBeVisible();
    await convert(page);
    const html = (await download(page, '下載 HTML')).bytes.toString('utf8');
    await page.setContent(html);
    const got = await page.evaluate(extractLogBlocks, true);
    const chen = got.區塊.find((b) => b.名稱 === '陳志明' && b.種類 === '對話')!;
    expect(chen.名稱顏色).toBe('rgb(0, 255, 0)');
    const lin = got.區塊.filter((b) => b.名稱 === '林曉雨' && b.種類 === '旁白列');
    expect(lin.length).toBeGreaterThan(0);
    expect(lin[0].文字顏色).toBe('rgb(255, 171, 64)');
    expect(got.區塊[3]).toMatchObject({ 種類: '插圖', 最大寬: '600px', 對齊: '置中', alt: '插圖' });
    const avatar = String((chen.頭像 as { src: string }).src);
    const size = await page.evaluate(async (s) => {
      const img = new Image();
      img.src = s;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, avatar);
    expect(size).toEqual([77, 100]);
    expect(errors).toEqual([]);
  });

  test('大圖警告：依大小分割、不縮放時先確認（F70）', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: '時間軸' }).click();
    await loadFiles(page, [fileOf(LEGACY)]);
    await tab(page, '外觀').click();
    await page.getByRole('switch', { name: '縮放圖片' }).click();
    /* 1200×900 的大圖（未收錄樣本 face-big.png：單色 PNG），用 canvas 現做 */
    const big = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 900;
      const ctx = c.getContext('2d')!;
      for (let y = 0; y < 900; y += 3)
        for (let x = 0; x < 1200; x += 3) {
          ctx.fillStyle = `rgb(${(x * 7) % 255},${(y * 13) % 255},${(x + y) % 255})`;
          ctx.fillRect(x, y, 3, 3);
        }
      return c.toDataURL('image/png').split(',')[1];
    });
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('[data-profile="林曉雨"]').getByRole('button', { name: '選擇圖片' }).click(),
    ]);
    await chooser.setFiles({
      name: 'big.png',
      mimeType: 'image/png',
      buffer: Buffer.from(big, 'base64'),
    });
    await expect(page.locator('[data-profile="林曉雨"]').getByTestId('profile-state')).toHaveText(
      'big.png',
    );
    await tab(page, '進階').click();
    await page.getByRole('radio', { name: '依大小' }).click();
    await page.getByRole('spinbutton', { name: '每檔大小' }).fill('10');
    await page.getByRole('spinbutton', { name: '每檔大小' }).press('Enter');
    await expect(page.getByTestId('split-warn')).toContainText('目前頭像共');
    await btn(page, '開始轉換').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('「林曉雨」的頭像');
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(status(page)).toHaveText('已取消轉換。');
    await btn(page, '開始轉換').click();
    await dialog.getByRole('button', { name: '繼續轉換' }).click();
    await expect(status(page)).toContainText('轉換完成');
    expect(errors).toEqual([]);
  });

  test('設定：自動記住、匯出、匯入、重設（F66～F68、F93）', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('radio', { name: '時間軸' }).click();
    await loadFiles(page, [fileOf(LEGACY)]);
    await tab(page, '外觀').click();
    await page.getByRole('radio', { name: '21 px' }).click();
    await tab(page, '進階').click();
    await pickSelect(page, '配色預設', '秋');
    await expect(page.getByRole('textbox', { name: '頁面：頁面背景色碼' })).toHaveValue('#fffaf0');
    /* 改一色 → 自訂（F61） */
    await page.getByRole('textbox', { name: '頁面：強調色色碼' }).fill('#123456');
    await page.getByRole('textbox', { name: '頁面：強調色色碼' }).press('Enter');
    await expect(page.getByRole('combobox', { name: '配色預設' })).toHaveText('自訂');
    await page.reload();
    await expect(page.getByRole('radio', { name: '時間軸' })).toBeChecked();
    /* 匯出 */
    await page.getByRole('button', { name: '專案' }).click();
    const [d] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    expect(d.suggestedFilename()).toMatch(/^ccfolia-log-converter_\d{8}\.json$/);
    const json = JSON.parse(readFileSync((await d.path())!, 'utf8'));
    expect(json).toMatchObject({
      format: 'trpg-toolkit-project',
      tool: 'log-converter',
      data: {
        style: 'timeline',
        fontSize: 21,
        colorPreset: 'custom',
        palette: { accent: '#123456' },
      },
    });
    /* 匯入（同一個檔可以連續讀兩次） */
    json.data.style = 'ccfolia';
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '專案' }).click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
      ]);
      await chooser.setFiles({
        name: 'set.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(json)),
      });
      await expect(page.getByRole('radio', { name: 'CCFOLIA 風格' })).toBeChecked();
    }
    /* 不是設定檔：錯誤、設定不變 */
    await page.getByRole('button', { name: '專案' }).click();
    const [bad] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '開啟專案檔…' }).click(),
    ]);
    await bad.setFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{oops'),
    });
    await expect(page.getByText('無法開啟專案檔').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'CCFOLIA 風格' })).toBeChecked();
    /* 重設：確認後清除並重新載入 */
    await page.getByRole('button', { name: '專案' }).click();
    await page.getByRole('menuitem', { name: '重設所有設定…' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '重設並重新載入' }).click();
    await expect(page.getByRole('radio', { name: '小說' })).toBeChecked();
    await expect(page.getByTestId('no-log')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

/* ---------- EPUB 電子書（2026-10，F104～F113、3.13） ---------- */

/** 拆開下載的 EPUB：ZIP 第一個檔頭、檔名順序，XML 在 Chromium 的 DOMParser 裡逐檔解析 */
async function inspectEpub(page: Page, bytes: Buffer) {
  const z = new Uint8Array(bytes);
  const u16 = (o: number) => z[o] | (z[o + 1] << 8);
  const header = {
    signature: u16(0) | (u16(2) << 16),
    flags: u16(6),
    method: u16(8),
    nameLength: u16(26),
    extraLength: u16(28),
    name: String.fromCharCode(...z.subarray(30, 38)),
    content: String.fromCharCode(...z.subarray(38, 58)),
  };
  const files = unzipSync(z);
  const names = Object.keys(files);
  const texts = Object.fromEntries(
    names
      .filter((n) => /\.(xhtml|opf|ncx|xml|css)$/.test(n))
      .map((n) => [n, new TextDecoder('utf-8', { fatal: true }).decode(files[n])]),
  );
  const parsed = await page.evaluate((texts: Record<string, string>) => {
    const OPF = 'http://www.idpf.org/2007/opf';
    const DC = 'http://purl.org/dc/elements/1.1/';
    const errors: string[] = [];
    const docs: Record<string, Document> = {};
    for (const [n, t] of Object.entries(texts)) {
      if (n.endsWith('.css')) continue;
      const d = new DOMParser().parseFromString(
        t,
        n.endsWith('.xhtml') ? 'application/xhtml+xml' : 'application/xml',
      );
      if (d.getElementsByTagName('parsererror').length) errors.push(n);
      docs[n] = d;
    }
    const opf = docs['OEBPS/content.opf'];
    const dc = (tag: string) =>
      [...opf.getElementsByTagNameNS(DC, tag)].map((e) => e.textContent ?? '');
    const items = [...opf.getElementsByTagNameNS(OPF, 'item')].map((i) => ({
      id: i.getAttribute('id'),
      href: i.getAttribute('href') ?? '',
      type: i.getAttribute('media-type'),
      props: i.getAttribute('properties'),
    }));
    const spineEl = opf.getElementsByTagNameNS(OPF, 'spine')[0];
    const spine = [...spineEl.getElementsByTagNameNS(OPF, 'itemref')].map(
      (r) => items.find((i) => i.id === r.getAttribute('idref'))?.href ?? '?',
    );
    const nav = [...docs['OEBPS/nav.xhtml'].querySelectorAll('nav#toc li > a')].map(
      (a) => a.textContent ?? '',
    );
    const chapters = spine
      .filter((h) => h.startsWith('text/'))
      .map((h) => {
        const d = docs[`OEBPS/${h}`];
        return {
          href: h,
          h1: d.querySelector('h1')?.textContent ?? null,
          text: d.body?.textContent ?? '',
          dialogues: d.querySelectorAll('p.dlg').length,
          marks: d.querySelectorAll('.mark').length,
        };
      });
    return {
      errors,
      title: dc('title'),
      creator: dc('creator'),
      language: dc('language'),
      items,
      spine,
      direction: spineEl.getAttribute('page-progression-direction'),
      nav,
      chapters,
    };
  }, texts);
  return { header, names, texts, ...parsed };
}

/** 環境有 epubcheck（W3C，Java）時對 EPUB 跑一次，要求 0 個錯誤與警告（5. D10）；沒有設定 EPUBCHECK_JAR 時略過 */
function epubcheck(bytes: Buffer, name: string): string | null {
  const jar = process.env.EPUBCHECK_JAR;
  if (!jar) return null;
  const file = path.join(os.tmpdir(), `lc-${Date.now()}-${name}`);
  writeFileSync(file, bytes);
  try {
    return execFileSync('java', ['-jar', jar, file], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? e);
  } finally {
    rmSync(file, { force: true });
  }
}

test.describe('EPUB 電子書（2026-10）', () => {
  const teal = () => Buffer.from(ATT.樣本圖片['ill-teal.png'].split(',')[1], 'base64');

  test('設定、封面、字型檔、下載後拆開檢查（F104～F113、3.13）', async ({ page }) => {
    const errors = await open(page);
    await loadFiles(page, [fileOf(LEGACY)]);
    await tab(page, '進階').click();
    /* 關閉時 EPUB 的設定不出現（F14） */
    await expect(page.getByRole('textbox', { name: '作者', exact: true })).toHaveCount(0);
    await page.getByRole('switch', { name: '一併產生 EPUB 電子書' }).click();
    await page.getByRole('textbox', { name: '作者', exact: true }).fill('小芋 & 阿和');
    await page.getByRole('radio', { name: '依分頁' }).click();
    await page.getByRole('radio', { name: '直排' }).click();
    await page.getByRole('radio', { name: '色塊' }).click();
    /* 封面 */
    const [c1] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('epub-cover').getByRole('button', { name: '選擇圖片' }).click(),
    ]);
    await c1.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: teal() });
    await expect(page.getByTestId('epub-cover')).toContainText('cover.png');
    /* 不是字型檔：通知、不採用 */
    const [c2] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '選擇字型檔').click(),
    ]);
    await c2.setFiles({
      name: 'bad.ttf',
      mimeType: 'font/ttf',
      buffer: Buffer.from('PK\u0003\u0004 not a font'),
    });
    await expect(
      page.getByText('「bad.ttf」不是 TrueType、OpenType 或 WOFF 字型檔。').first(),
    ).toBeVisible();
    const [c3] = await Promise.all([
      page.waitForEvent('filechooser'),
      btn(page, '選擇字型檔').click(),
    ]);
    await c3.setFiles({
      name: 'book.otf',
      mimeType: 'font/otf',
      buffer: Buffer.concat([Buffer.from('OTTO'), Buffer.alloc(60)]),
    });
    await expect(page.getByTestId('epub-font-file')).toContainText('book.otf');
    /* 插圖：上傳的（網頁版是 WebP → 電子書換成 JPEG／PNG）放進電子書，網址的不放 */
    await tab(page, '插圖').click();
    await btn(page, '新增插圖').click();
    await page.getByRole('spinbutton', { name: '插在第幾則之後' }).fill('3');
    const [c4] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('[data-illustration="1"]').getByRole('button', { name: '選擇圖片' }).click(),
    ]);
    await c4.setFiles({ name: 'map.png', mimeType: 'image/png', buffer: teal() });
    await expect(page.locator('[data-illustration="1"] img')).toBeVisible();
    await btn(page, '新增插圖').click();
    const second = page.locator('[data-illustration="2"]');
    await second.getByRole('spinbutton', { name: '插在第幾則之後' }).fill('5');
    await second.getByRole('radio', { name: '網址' }).click();
    await second.getByRole('textbox', { name: '圖片網址' }).fill('https://example.com/map.png');
    await convert(page);
    /* 單檔：HTML 之後是 EPUB */
    await expect(page.getByTestId('downloads').getByRole('button')).toHaveText([
      '下載 HTML',
      '下載 EPUB 電子書',
    ]);
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    const file = await download(page, '下載 EPUB 電子書');
    expect(file.name).toBe('霧港燈塔.epub');
    expect(workers.some((u) => /epub\.worker/.test(u))).toBe(true);
    const book = await inspectEpub(page, file.bytes);
    expect(book.header).toEqual({
      signature: 0x04034b50,
      flags: 0,
      method: 0,
      nameLength: 8,
      extraLength: 0,
      name: 'mimetype',
      content: 'application/epub+zip',
    });
    expect(book.names.slice(0, 3)).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
    ]);
    expect(book.errors).toEqual([]);
    expect(book.title).toEqual(['霧港燈塔']);
    expect(book.creator).toEqual(['小芋 & 阿和']);
    expect(book.language).toEqual(['zh-Hant']);
    expect(book.direction).toBe('rtl');
    expect(book.items.find((i) => i.props === 'cover-image')).toMatchObject({
      href: 'images/cover.png',
      type: 'image/png',
    });
    expect(book.items.find((i) => i.href === 'fonts/book.otf')?.type).toBe('font/otf');
    expect(book.spine.slice(0, 3)).toEqual(['cover.xhtml', 'title.xhtml', 'nav.xhtml']);
    expect(book.nav).toEqual(['main', 'info', 'other']);
    expect(book.chapters.map((c) => c.h1)).toEqual(['main', 'info', 'other']);
    expect(book.chapters[0].marks).toBeGreaterThan(0);
    expect(book.chapters[0].text).toContain('林曉雨：「有人在嗎？」');
    expect(book.chapters[2].text).toContain('閒聊訊息（2 則）');
    expect(book.texts['OEBPS/style.css']).toContain('writing-mode: vertical-rl');
    expect(book.texts['OEBPS/style.css']).toMatch(/@font-face \{[^}]*fonts\/book\.otf/);
    const ill = book.items.filter((i) => i.href.startsWith('images/ill-'));
    expect(ill).toHaveLength(1);
    expect(ill[0].href).toMatch(/^images\/ill-001\.(jpg|png)$/);
    expect(['image/jpeg', 'image/png']).toContain(ill[0].type);
    expect(book.texts['OEBPS/text/c001-01.xhtml']).toContain(`src="../${ill[0].href}"`);
    expect(Object.values(book.texts).some((t) => t.includes('example.com'))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('關閉時不出現；設定自動記住、存進專案檔（版本 2），封面與字型檔不記住；依標記分章、epubcheck（F93、F104、F106、5. D10）', async ({
    page,
  }) => {
    const errors = await open(page);
    await loadFiles(page, [fileOf(LEGACY)]);
    await convert(page);
    await expect(btn(page, '下載 EPUB 電子書')).toHaveCount(0);
    await tab(page, '進階').click();
    await page.getByRole('switch', { name: '一併產生 EPUB 電子書' }).click();
    await page.getByRole('textbox', { name: '作者', exact: true }).fill('測試');
    await page.getByRole('radio', { name: '依標記' }).click();
    await page.getByRole('textbox', { name: '標記文字' }).fill('線索\n樓上有聲音');
    const [c1] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('epub-cover').getByRole('button', { name: '選擇圖片' }).click(),
    ]);
    await c1.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: teal() });
    await expect(page.getByTestId('epub-cover')).toContainText('cover.png');
    /* 改設定後沒有重新轉換：還是轉換當時（關閉）的結果 */
    await expect(btn(page, '下載 EPUB 電子書')).toHaveCount(0);
    await page.waitForTimeout(500);
    await page.reload();
    await loadFiles(page, [fileOf(LEGACY)]);
    await tab(page, '進階').click();
    await expect(page.getByRole('switch', { name: '一併產生 EPUB 電子書' })).toBeChecked();
    await expect(page.getByRole('textbox', { name: '作者', exact: true })).toHaveValue('測試');
    await expect(page.getByRole('radio', { name: '依標記' })).toBeChecked();
    await expect(page.getByRole('textbox', { name: '標記文字' })).toHaveValue('線索\n樓上有聲音');
    await expect(
      page.getByTestId('epub-cover').getByRole('button', { name: '選擇圖片' }),
    ).toBeVisible();
    /* 專案檔：資料版本 2、含 EPUB 的設定 */
    await page.getByRole('button', { name: '專案' }).click();
    const [d] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: '存成專案檔…' }).click(),
    ]);
    const json = JSON.parse(readFileSync((await d.path())!, 'utf8'));
    expect(json).toMatchObject({
      version: 2,
      data: { epubMode: true, epubAuthor: '測試', epubChapters: 'marker' },
    });
    await convert(page);
    const file = await download(page, '下載 EPUB 電子書');
    const book = await inspectEpub(page, file.bytes);
    expect(book.errors).toEqual([]);
    expect(book.nav).toEqual([
      '開頭',
      '【線索】航海日誌最後一頁寫著：「別讓燈熄了」。',
      '「等等，樓上有聲音。」',
    ]);
    expect(book.items.some((i) => i.props === 'cover-image')).toBe(false);
    expect(book.direction).toBeNull();
    const report = epubcheck(file.bytes, 'marker.epub');
    if (report !== null) expect(report).toContain('No errors or warnings detected');
    expect(errors).toEqual([]);
  });

  test('新格式多檔、分割時按鈕在 ZIP 之後；epubcheck（F112）', async ({ page }) => {
    const errors = await open(page);
    await loadFiles(
      page,
      V2_ALL.map((n) => fileOf(n)),
    );
    await tab(page, '進階').click();
    await page.getByRole('radio', { name: '依則數' }).first().click();
    await page.getByRole('spinbutton', { name: '每檔則數' }).fill('5');
    await page.getByRole('spinbutton', { name: '每檔則數' }).press('Enter');
    await page.getByRole('switch', { name: '一併產生 EPUB 電子書' }).click();
    await page.getByRole('radio', { name: '依分頁' }).click();
    await convert(page);
    const labels = await page.getByTestId('downloads').getByRole('button').allTextContents();
    expect(labels.slice(0, 2)).toEqual(['全部下載（ZIP）', '下載 EPUB 電子書']);
    const file = await download(page, '下載 EPUB 電子書');
    expect(file.name).toBe('霧港燈塔.epub');
    const book = await inspectEpub(page, file.bytes);
    expect(book.errors).toEqual([]);
    expect(book.nav).toEqual(['メイン', '情報', '雑談', '秘密頻道']);
    expect(book.chapters.at(-1)?.text).toContain('(1D100) ＞ 42');
    const report = epubcheck(file.bytes, 'v2.epub');
    if (report !== null) expect(report).toContain('No errors or warnings detected');
    expect(errors).toEqual([]);
  });

  /** 記錄主執行緒超過 50 ms 的工作（Long Tasks API） */
  const watchLongTasks = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __lt: number[]; __lo?: PerformanceObserver };
      w.__lo?.disconnect();
      w.__lt = [];
      w.__lo = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__lt.push(Math.round(e.duration));
      });
      w.__lo.observe({ type: 'longtask' });
    });
  const longTasks = (page: Page) =>
    page.evaluate(() => (window as unknown as { __lt: number[] }).__lt.slice());

  /** 2 萬則（新格式、3 位發言者）依則數分章：轉換、下載 EPUB，記錄時間與主執行緒的長工作 */
  async function bigExport(page: Page, label: string) {
    await loadFiles(page, [fileOf('長團 [main].html', longLog(ATT, 20000))]);
    await tab(page, '進階').click();
    await page.getByRole('switch', { name: '一併產生 EPUB 電子書' }).click();
    await page.getByRole('radio', { name: '依則數' }).nth(1).click();
    await watchLongTasks(page);
    const t0 = Date.now();
    await btn(page, '開始轉換').click();
    await expect(status(page)).toContainText('轉換完成', { timeout: 60_000 });
    const convertMs = Date.now() - t0;
    const convertTasks = await longTasks(page);
    await watchLongTasks(page);
    const t1 = Date.now();
    const file = await download(page, '下載 EPUB 電子書');
    const exportMs = Date.now() - t1;
    const exportTasks = await longTasks(page);
    const book = await inspectEpub(page, file.bytes);
    expect(book.errors).toEqual([]);
    expect(book.nav).toHaveLength(40);
    expect(book.nav[39]).toBe('第 19,501～20,000 則');
    const count = book.chapters.reduce((n, c) => n + (c.text.match(/則訊息/g)?.length ?? 0), 0);
    expect(count).toBe(20000);
    const max = (list: number[]) => Math.max(0, ...list);
    console.log(
      `${label}｜2 萬則：轉換 ${convertMs} ms（主執行緒長工作 ${convertTasks.length} 個、最長 ${max(convertTasks)} ms）；` +
        `下載 EPUB ${exportMs} ms（${Math.round(file.bytes.length / 1024)} KB、${book.chapters.length} 個章節檔；` +
        `主執行緒長工作 ${exportTasks.length} 個、最長 ${max(exportTasks)} ms）`,
    );
    return { exportTasks, convertTasks };
  }

  test('大日誌：2 萬則在 Worker 裡產生、畫面不凍住（5. D8）', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await open(page);
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    const { exportTasks, convertTasks } = await bigExport(page, 'Worker');
    expect(workers.some((u) => /epub\.worker/.test(u))).toBe(true);
    /* 量得到長工作（既有的轉換本身在主執行緒），匯出 EPUB 時沒有超過 300 ms 的 */
    expect(convertTasks.length).toBeGreaterThan(0);
    expect(Math.max(0, ...exportTasks)).toBeLessThan(300);
    expect(errors).toEqual([]);
  });

  test('大日誌：Worker 載不到時改在主執行緒分段產生（5. D8）', async ({ page, context }) => {
    test.setTimeout(240_000);
    await context.route(/epub\.worker[^/]*\.js/, (r) => r.abort());
    const errors = await open(page);
    const { exportTasks } = await bigExport(page, '主執行緒');
    /* 分段讓出：每產生一個章節檔讓出一次，只有最後的壓縮是一整段 */
    expect(Math.max(0, ...exportTasks)).toBeLessThan(1500);
    expect(errors.filter((e) => !/epub\.worker|Failed to load|net::ERR_FAILED/.test(e))).toEqual(
      [],
    );
  });
});

/* ---------- 窄螢幕與視覺回歸 ---------- */

test.describe('版面', () => {
  const masks = (page: Page) => [page.getByText(/自動儲存/)];

  test('390 寬沒有橫向捲動（F103）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    await noHorizontalScroll(page);
    await loadFiles(
      page,
      V2_ALL.map((n) => fileOf(n)),
    );
    await page.getByRole('radio', { name: 'CCFOLIA 風格' }).click();
    for (const t of ['基本', '外觀', '插圖', '進階']) {
      await tab(page, t).click();
      await noHorizontalScroll(page);
    }
    /* EPUB 電子書的設定（2026-10）：四選一的分章、標記文字 */
    await page.getByRole('switch', { name: '一併產生 EPUB 電子書' }).click();
    await page.getByRole('radio', { name: '依標記' }).click();
    await noHorizontalScroll(page);
    await convert(page);
    await expect(btn(page, '下載 EPUB 電子書')).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  for (const width of [1280, 390]) {
    test(`視覺基準 ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await loadFiles(page, [fileOf(LEGACY)]);
      await convert(page);
      await page.mouse.move(0, 0);
      await noHorizontalScroll(page);
      await expect(page).toHaveScreenshot(`log-converter-${width}.png`, {
        fullPage: true,
        mask: masks(page),
      });
    });
  }
});
