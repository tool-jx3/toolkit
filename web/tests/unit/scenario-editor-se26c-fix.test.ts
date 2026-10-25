// @vitest-environment jsdom
/**
 * 劇本排版台 2026-10 跟進第三批：對等驗證後的修正（規格 7.5「第三批驗證後」的 U1～U10；受測 3d30fa6）。
 * 「原作」的數值是原作 v3.26.0 的對話、注釋範本（特殊區塊）在同樣的原稿上的結果（驗證者的 c02b、c07、t15、c06）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { exportHtml } from '../../src/tools/scenario-editor/exportHtml';
import { KIDS_FRAMED, newBlock } from '../../src/tools/scenario-editor/model/blocks';
import { blankDoc, normalizeDoc } from '../../src/tools/scenario-editor/model/doc';
import { PK_VER } from '../../src/tools/scenario-editor/model/kids';
import { type MdCtx, mdParse } from '../../src/tools/scenario-editor/model/md';
import { blockLabel } from '../../src/tools/scenario-editor/model/proc';
import { RICH_TYPES } from '../../src/tools/scenario-editor/model/rich';
import type { Block, Doc } from '../../src/tools/scenario-editor/model/types';
import { pasteBlocks } from '../../src/tools/scenario-editor/ops';
import { addPdfHrLines } from '../../src/tools/scenario-editor/output';
import { blockHtml, kidsHtml, type RenderCtx } from '../../src/tools/scenario-editor/render/html';
import { HR_LINE, PAPER_CSS } from '../../src/tools/scenario-editor/render/paperCss';
import { doc, select, setUi, ui, useDoc } from '../../src/tools/scenario-editor/store';
import { S } from '../../src/tools/scenario-editor/strings';

const B = (id: string, type: Block['type'], text = '', extra: Partial<Block> = {}): Block =>
  Object.assign(newBlock(type, text), { id }, extra);
const docWith = (blocks: Block[]): Doc => ({ ...blankDoc(), blocks });
const ctxOf = (d: Doc): RenderCtx => ({
  doc: d,
  edit: false,
  pageOf: () => 1,
  total: 1,
  copyButtons: false,
});
const html1 = (b: Block, d = docWith([b])) =>
  blockHtml(b, ctxOf(d), { cols: 1, pull: 0, top: false });
function load(blocks: Block[]): void {
  useDoc.getState().replace(docWith(blocks));
  setUi({ sel: [], focusId: null, pimgSel: null, focusReq: null });
}

describe('U2：對話文的行照原作的對話範本分（「」包住的行 1.85）', () => {
  it('「」包住的行是 .rt（行高 1.85），其他的行是 .rp（照 .t-dialog 的 1.8）；說話者在上方', () => {
    const h = html1(B('d', 'dialog', '「你好。」\n他說完就走了。', { sp: '管家' }));
    expect(h).toContain('class="b t-dialog hasrich"');
    expect(h).toContain('<span class="spk">管家</span><div class="rt">');
    expect(h).toContain('<div class="rp">他說完就走了。</div>');
    expect(PAPER_CSS).toContain('.rt{white-space:pre-wrap;line-height:1.85;');
    expect(PAPER_CSS).toContain('.t-dialog{--bxc:#1c2b3c;');
    expect(PAPER_CSS).toContain('.t-proc .rt .spk,.t-dialog .rt .spk,');
  });
  it('對話文也能用巢狀記號（同對話範本）：＠名稱是彈出視窗的按鈕', () => {
    expect(RICH_TYPES).toContain('dialog');
    const pop = B('p', 'popup', '');
    pop.pop = { label: '地圖', body: '', only: false, blocks: [B('pa', 'desc', '內容')] };
    const d = B('d', 'dialog', '「看這個。」\n＠地圖');
    const h = html1(d, docWith([d, pop]));
    expect(h).toContain('地圖');
    expect(h).not.toContain('＠地圖');
  });
});

describe('U3：對話文也縮到繞排圖片旁（flow-root）', () => {
  it('flow-root 的清單有 .t-dialog（紙面與匯出共用）', () => {
    const rule =
      '.t-h1,.t-h2,.t-dialog,.t-note,.t-proc,.t-info,.t-handout,.t-hr,.t-table{display:flow-root}';
    expect(PAPER_CSS).toContain(rule);
    const d = docWith([B('d', 'dialog', '「好」')]);
    expect(exportHtml({ doc: d, pages: [['d']], from: 0, to: 0 })).toContain(rule);
  });
});

describe('U4：對話文、注釋帶裡面的段落時照原作的範本排', () => {
  it('對話文是有框的書式：裡面的段落不多縮 4 mm', () => {
    expect(KIDS_FRAMED).toContain('dialog');
    const d = B('d', 'dialog', '「外面」', { kids: [B('k', 'desc', '裡面')] });
    const h = kidsHtml(d, ctxOf(docWith([d])));
    expect(h).toContain('class="cellblk bx-kids"');
    expect(h).not.toContain('kids-ind');
    /* 描述文照舊縮 */
    const a = B('a', 'desc', '外面', { kids: [B('k2', 'desc', '裡面')] });
    expect(kidsHtml(a, ctxOf(docWith([a])))).toContain('kids-ind');
  });
  it('注釋的文字一律是 .rp（同範本）：.rp 的下方 1.2 mm 是外面文字到第一個裡面段落的間距', () => {
    const n = B('n', 'note', '注釋外面', { kids: [B('k', 'desc', '裡面')] });
    const h = html1(n);
    expect(h).toContain('class="b t-note hasrich"');
    expect(h).toContain('<div class="rp">注釋外面</div><div class="cellblk bx-kids">');
    expect(PAPER_CSS).toContain('.rp,.pop-p{white-space:pre-wrap;margin:0 0 1.2mm}');
    /* .bx-kids 的 margin-top 被 .cellblk{margin:0} 蓋掉（同原作），間距只有 .rp 的下方 */
    expect(PAPER_CSS.indexOf('.cellblk{margin:0}')).toBeGreaterThan(
      PAPER_CSS.indexOf('.bx-kids{margin-top:1.2mm}'),
    );
    /* 對話文的最後一行（.rt）也一樣有 1.2 mm */
    const d = B('d', 'dialog', '「外面」', { kids: [B('k2', 'desc', '裡面')] });
    expect(html1(d)).toContain('<div class="rt">「外面」</div><div class="cellblk bx-kids">');
  });
});

describe('U5：一次貼上多段，有不能放進段落的', () => {
  beforeEach(() => load([]));
  it('能放的貼上，狀態列說明略過幾個', () => {
    load([B('a', 'desc', '甲', { kids: [B('k1', 'desc', '子一')] }), B('z', 'desc', '尾')]);
    select(['k1']);
    pasteBlocks([B('h', 'h1', '章'), B('b', 'desc', '乙'), B('br', 'break', '')]);
    const kids = doc().blocks[0].kids ?? [];
    expect(kids.map((k) => [k.type, k.text])).toEqual([
      ['desc', '子一'],
      ['desc', '乙'],
    ]);
    expect(ui().status?.text).toBe(S.status.pastedSkip(1, 2, '段落'));
    expect(ui().status?.text).toBe('已貼上 1 個段落，略過 2 個不能放進段落的段落');
    expect(ui().status?.tone).toBe('warn');
  });
  it('全部都能放：照舊「已貼上 N 個段落」；全部都不能放：照舊說明不能放', () => {
    load([B('a', 'desc', '甲', { kids: [B('k1', 'desc', '子一')] })]);
    select(['k1']);
    pasteBlocks([B('b', 'desc', '乙')]);
    expect(ui().status?.text).toBe('已貼上 1 個段落');
    select(['k1']);
    pasteBlocks([B('h', 'h1', '章')]);
    expect(ui().status?.text).toBe(S.status.noKidsType('標題 1'));
  });
});

describe('U7：注釋的標題語（同原作的注釋範本）', () => {
  it('沒寫時空白；寫了畫在注釋的上方（範本的樣子：框的顏色）', () => {
    expect(blockLabel(B('n', 'note', 'x'))).toBe('');
    expect(blockLabel(B('n', 'note', 'x', { lb: '小心' }))).toBe('小心');
    expect(html1(B('n', 'note', '內文'))).not.toContain('blb');
    expect(html1(B('n', 'note', '內文', { lb: '小心' }))).toContain(
      '<div class="blb">小心</div><div class="rp">內文</div>',
    );
    expect(PAPER_CSS).toContain('.t-info .blb,.t-note .blb{color:var(--bxc)}');
  });
  it('markdown 的 :::note[標題語]', () => {
    const ctx: MdCtx = { ho: new Set(), tpls: [], skip: [] };
    const [n] = mdParse(':::note[小心]\n不要碰。\n:::', ctx).blocks;
    expect([n.type, n.text, n.lb]).toEqual(['note', '不要碰。', '小心']);
  });
});

describe('U8：有標籤的橫線（區塊不縮、線畫到繞排圖片邊）', () => {
  it('同原作：display:block＋背景的線，標籤的底是紙色；沒有標籤的照舊 flow-root', () => {
    const h = html1(B('r', 'hr', '幕間'));
    expect(h).toContain('class="b t-hr hastx"');
    expect(h).toContain('<span class="hrtx">幕間</span>');
    expect(h).not.toContain('hrl');
    expect(PAPER_CSS).toContain(
      `.t-hr.hastx{height:auto;line-height:1.4;border-top:0;display:block;background:linear-gradient(${HR_LINE},${HR_LINE}) 0 50%/100% 1px no-repeat}`,
    );
    expect(PAPER_CSS).toContain('.hrtx{background:var(--paper,#f7f3ea);padding:0 3mm;');
  });
  it('PDF：在頁面的最前面放同位置的線（之後畫的圖片、標籤的紙色底蓋在上面）', () => {
    const pg = document.createElement('div');
    pg.className = 'pg';
    pg.innerHTML =
      '<div class="pg-bg"></div><div class="pg-body"><div class="bp"><div class="b t-hr hastx"><span class="hrtx">幕間</span></div></div></div>';
    const rect = (x: number, y: number, w: number, h: number) =>
      ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;
    pg.getBoundingClientRect = () => rect(100, 50, 794, 1123);
    const hr = pg.querySelector('.t-hr') as HTMLElement;
    hr.getBoundingClientRect = () => rect(160, 600, 673, 15);
    addPdfHrLines(pg);
    const ln = pg.firstElementChild as HTMLElement;
    expect(ln.className).toBe('pdf-hrl');
    expect([ln.style.position, ln.style.left, ln.style.top, ln.style.width]).toEqual([
      'absolute',
      '60px',
      '557px',
      '673px',
    ]);
    expect(ln.style.borderTop).toContain('1px solid');
  });
});

describe('U10：pkv 與裡面的段落的 cols', () => {
  it('pkv 比 1 大的照留（不降成 1）；沒有或比 1 小的寫 1', () => {
    const base = { title: 't', pages: [{}], blocks: [{ type: 'desc', text: 'a' }] };
    expect(normalizeDoc({ ...base, pkv: 3 }).pkv).toBe(3);
    expect(normalizeDoc({ ...base, pkv: 1 }).pkv).toBe(PK_VER);
    expect(normalizeDoc({ ...base }).pkv).toBe(PK_VER);
    expect(normalizeDoc({ ...base, pkv: 'x' }).pkv).toBe(PK_VER);
  });
  it('裡面的段落的 cols 照原值（畫的時候不看）', () => {
    const d = normalizeDoc({
      title: 't',
      pages: [{}],
      blocks: [
        {
          type: 'desc',
          text: 'a',
          kids: [
            { type: 'desc', text: 'k', cols: 1 },
            { type: 'desc', text: 'k2' },
          ],
        },
      ],
    });
    expect(d.blocks[0].kids?.map((k) => k.cols)).toEqual([1, 2]);
    const h = kidsHtml(d.blocks[0], ctxOf(d));
    expect(h).not.toContain(' span');
  });
});
