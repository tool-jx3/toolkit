// @vitest-environment jsdom
/**
 * 劇本排版台 2026-10 跟進第二批：對等驗證後的修正（規格 7.5 的 T1～T11；受測 a763b28，修正在 9fd7574 之後）。
 */
import { describe, expect, it } from 'vitest';
import { exportHtml } from '../../src/tools/scenario-editor/exportHtml';
import { newBlock } from '../../src/tools/scenario-editor/model/blocks';
import { blankDoc, makeBlock } from '../../src/tools/scenario-editor/model/doc';
import { MD_SUGGEST, mdShown, mdSuggest } from '../../src/tools/scenario-editor/model/md';
import type { Block, Doc, PageImg } from '../../src/tools/scenario-editor/model/types';
import { changeSelected, deletePimg, mdLineFire } from '../../src/tools/scenario-editor/ops';
import { PIMG_TIP, pimgHtml } from '../../src/tools/scenario-editor/render/html';
import { PAPER_CSS } from '../../src/tools/scenario-editor/render/paperCss';
import { doc, select, selectPimg, setUi, ui, useDoc } from '../../src/tools/scenario-editor/store';

const B = (id: string, type: Block['type'], text = '', extra: Partial<Block> = {}): Block =>
  Object.assign(newBlock(type, text), { id }, extra);
const P = (o: Partial<PageImg> = {}): PageImg => ({
  id: 'p',
  img: 'data:image/png;base64,AA==',
  ar: 0.75,
  cap: '',
  pg: 1,
  x: 120,
  y: 40,
  w: 40,
  wu: 'pct',
  ...o,
});
const docWith = (blocks: Block[], extra: Partial<Doc> = {}): Doc => ({
  ...blankDoc(),
  blocks,
  ...extra,
});
function load(d: Doc): void {
  useDoc.getState().replace(d);
  setUi({ sel: [], focusId: null, pimgSel: null, focusReq: null });
}

const FLOW_ROOT =
  '.t-h1,.t-h2,.t-note,.t-proc,.t-info,.t-handout,.t-hr,.t-table{display:flow-root}';

describe('T1：有框的段落在頁面圖片旁邊也整個縮到圖片旁（紙面、匯出）', () => {
  it('紙面與兩種匯出的樣式都有 flow-root（同原作 v3.10.3；第三批 F316 起）', () => {
    expect(PAPER_CSS).toContain(FLOW_ROOT);
    const d = docWith([B('h', 'h1', '第一章'), B('p', 'proc', '框', { bx: undefined })], {
      pageImgs: [P()],
    });
    const pages = [['h', 'p']];
    expect(exportHtml({ doc: d, pages, from: 0, to: 0 })).toContain(FLOW_ROOT);
    /* 不分頁：「↑ 回到目錄」放在標題的 .b 裡（標題是 flow-root，浮動的按鈕不擠短下一段） */
    const flow = exportHtml({ doc: d, pages, from: 0, to: 0, flow: true });
    expect(flow).toContain(FLOW_ROOT);
    expect(flow).toContain("a.className='fx-up'");
    expect(flow).toContain('el.appendChild(a)');
  });
});

describe('T2：復原後還留著的頁面圖片選取', () => {
  it('圖片不在原稿裡時取消選取；Delete（deletePimg）不動原稿（重做的紀錄不會被清掉）', () => {
    load(docWith([B('a', 'desc', 'a')], { pageImgs: [P()] }));
    selectPimg('p', false);
    expect(ui().pimgSel).toBe('p');
    /* 例如復原：原稿換成沒有那張圖片的 */
    useDoc.getState().replace(docWith([B('a', 'desc', 'a')], { pageImgs: [] }));
    expect(ui().pimgSel).toBeNull();
    setUi({ pimgSel: 'p' });
    const before = doc();
    deletePimg('p');
    expect(doc()).toBe(before);
    expect(ui().pimgSel).toBeNull();
    expect(ui().status?.text ?? '').not.toContain('已刪除圖片');
  });
});

describe('T3：選取標題 1 按「目錄」', () => {
  it('在標題 1 後面建立這一章的目錄，標題留著（F315）', async () => {
    load(docWith([B('h', 'h1', '第一章'), B('d', 'desc', '本文')]));
    select(['h']);
    await changeSelected('toc');
    expect(doc().blocks.map((b) => [b.id, b.type])).toEqual([
      ['h', 'h1'],
      [doc().blocks[1].id, 'toc'],
      ['d', 'desc'],
    ]);
    expect(doc().blocks[1].toc?.scope).toBe('chapter');
  });
});

describe('T4：第一行打 :::table 等按 Enter', () => {
  for (const [line, type] of [
    [':::table', 'table'],
    [':::popup', 'popup'],
    [':::npc', 'npc'],
    [':::image', 'image'],
    ['::toc', 'toc'],
  ] as const)
    it(`${line}：游標放到下面新加的描述文（同原作）`, () => {
      load(docWith([B('a', 'desc', line)]));
      expect(mdLineFire('a', line, line.length)).toBe(true);
      const bs = doc().blocks;
      expect(bs.map((b) => b.type)).toEqual([type, 'desc']);
      expect(ui().focusReq?.id).toBe(bs[1].id);
      expect(ui().sel).toEqual([bs[1].id]);
    });
  it(':::flow：維持選取流程圖（同原作）', () => {
    load(docWith([B('a', 'desc', ':::flow')]));
    mdLineFire('a', ':::flow', 7);
    expect(ui().sel).toEqual(['a']);
  });
});

describe('T5：頁首的繞排圖片不留 1 mm（F318）', () => {
  it('頁首的規則在圖片的規則之後', () => {
    const top = PAPER_CSS.indexOf('.bp.top.bp-image{padding-top:0}');
    expect(top).toBeGreaterThan(PAPER_CSS.indexOf('.bp.bp-image.fl-l{'));
  });
});

describe('T6：候選顯示比對到的別名', () => {
  it('::ta → :::table、:::talk；::n → ::newpage（同原作）', () => {
    const ta = mdSuggest('::ta', []);
    expect(ta?.list.slice(0, 2).map((x) => mdShown(x, ta.q))).toEqual([':::table', ':::talk']);
    const n = mdSuggest('::n', []);
    const br = n?.list.find((x) => x.k === 'break');
    expect(br && mdShown(br, n?.q ?? '')).toBe('::newpage');
    /* 沒有打字時是正式的寫法 */
    const all = mdSuggest('::', []);
    expect(all?.list.map((x) => mdShown(x, all.q))).toEqual(MD_SUGGEST.map((x) => x.cm));
    /* 段落裡不列 # 的候選（標題不能放進段落裡） */
    expect(mdSuggest('#', ['h1', 'h2', 'h3'])).toBeNull();
  });
});

describe('T7：頁面圖片的提示', () => {
  it('編輯畫面有 title，匯出、列印沒有', () => {
    const d = docWith([], { pageImgs: [P()] });
    expect(pimgHtml(P(), d, true)).toContain(`title="${PIMG_TIP}"`);
    expect(pimgHtml(P(), d, false)).not.toContain('title=');
  });
});

describe('T9：逐頁匯出的目錄區上方內距', () => {
  it('48 px（同原作）', () => {
    const d = docWith([B('a', 'desc', 'a')]);
    const html = exportHtml({ doc: d, pages: [['a']], from: 0, to: 0 });
    expect(html).toMatch(/#nav\{[^}]*padding:48px 12px 18px/);
  });
});

describe('T11：:::dialog 的標籤、:::info 沒有標籤', () => {
  it('對話文的說話者＝原作樣板的標題語；情報區塊沒有標籤時顯示「情報」（D35）', async () => {
    const { mdParse } = await import('../../src/tools/scenario-editor/model/md');
    const { blockLabel } = await import('../../src/tools/scenario-editor/model/proc');
    const r = mdParse(':::dialog[山田]\n「你好」\n:::\n\n:::info\n情報\n:::', {
      skip: [],
      ho: new Set(),
      tpls: [],
    }).blocks;
    expect(r[0]).toMatchObject({ type: 'dialog', sp: '山田', text: '「你好」' });
    expect(blockLabel(r[1])).toBe('情報');
    expect(makeBlock('info').lb).toBeUndefined();
  });
});
