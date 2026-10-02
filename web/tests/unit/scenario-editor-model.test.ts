/**
 * 劇本排版台：原稿的整理（3.1）、間距（3.2.4）、表格（3.6.3、3.6.4）、目錄（3.6.1）、流程圖（3.6.5）、圖片（3.2.9）、
 * 規則框的樣板（3.6.2）、閱覽 HTML（3.9）、檔名與範圍（3.13、F230）。
 */
import { describe, expect, it } from 'vitest';
import { paperFileName } from '../../src/core/paged';
import { exportHtml, maskText, scriptSafe } from '../../src/tools/scenario-editor/exportHtml';
import { sectionsOf } from '../../src/tools/scenario-editor/layout';
import { allBlocks, gapPull, newBlock, space } from '../../src/tools/scenario-editor/model/blocks';
import {
  blankDoc,
  makeBlock,
  normalizeDoc,
  renewIds,
  sampleBlocks,
  UNTITLED,
} from '../../src/tools/scenario-editor/model/doc';
import {
  edgeGeom,
  flowAddNode,
  flowAlign,
  flowFitContent,
  flowFromText,
  flowGrowNode,
  newFlow,
  newFlowNode,
} from '../../src/tools/scenario-editor/model/flow';
import {
  freeShape,
  imageWidthMm,
  setImagePos,
  snapImage,
} from '../../src/tools/scenario-editor/model/image';
import {
  applyBxTpl,
  BX_TPL,
  bxTplClean,
  mergeTemplates,
  sameStyle,
} from '../../src/tools/scenario-editor/model/proc';
import {
  cellHead,
  cellsRead,
  cellWrite,
  exportOutText,
  newTable,
  rollTableText,
  setLook,
  simpleTableText,
  tblAddCol,
  tblAddRow,
  tblDelCol,
  tblDelRow,
} from '../../src/tools/scenario-editor/model/table';
import { tocEntries } from '../../src/tools/scenario-editor/model/toc';
import type { Block, Table } from '../../src/tools/scenario-editor/model/types';
import { clampRange } from '../../src/tools/scenario-editor/output';
import { docFromFileText } from '../../src/tools/scenario-editor/session';

function table(rows: string[][], over: Partial<Table> = {}): Table {
  const t = newTable();
  Object.assign(t, over);
  t.rows = rows.length;
  t.ncol = Math.max(...rows.map((r) => r.length));
  t.cb = {};
  rows.forEach((r, i) => {
    r.forEach((v, c) => {
      cellWrite(t, i, c, v);
    });
  });
  return t;
}

describe('範例原稿（3.1.4）', () => {
  it('名稱、間距、字級、第一頁紙紋、六個段落', () => {
    const d = blankDoc();
    expect(d.title).toBe(UNTITLED);
    expect([d.padV, d.padH, d.base]).toEqual([18, 16, 10]);
    expect(d.pages[0].bg.preset).toBe('bg-paper');
    expect(d.blocks.map((b) => b.type)).toEqual([
      'title',
      'subtitle',
      'h1',
      'desc',
      'dialog',
      'proc',
    ]);
    expect(d.blocks[5].lb).toBe('技能檢定');
    expect(sameStyle(d.blocks[5].bx, BX_TPL.skill)).toBe(true);
  });
  it('新段落的預設配置（3.2.6）', () => {
    expect(
      ['npc', 'title', 'subtitle', 'image', 'cover', 'colophon', 'hr'].map(
        (k) => newBlock(k as Block['type']).cols,
      ),
    ).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(newBlock('desc').cols).toBe(2);
    expect(makeBlock('flow').cols).toBe(1);
    expect(makeBlock('break').cols).toBe(1);
    expect(makeBlock('colbr').cols).toBe(2);
    expect(makeBlock('toc').cols).toBe(1);
  });
});

describe('讀入舊版原稿的整理（3.1.3）', () => {
  it('數值欄補預設、頁尾', () => {
    const d = normalizeDoc({ blocks: [{ type: 'desc', text: 'a' }] });
    expect([d.padV, d.padH, d.base]).toEqual([18, 16, 10]);
    expect(d.foot).toEqual({ num: true, text: '', from: 1 });
    expect(d.pages).toHaveLength(1);
  });
  it('很舊的「段落放在頁面裡」：攤平並插入換頁、目錄旗標', () => {
    const d = normalizeDoc({
      pages: [
        { cols: 2, toc: true, blocks: [{ type: 'h1', text: 'A' }] },
        { cols: 1, blocks: [{ type: 'desc', text: 'B' }] },
      ],
    });
    expect(d.blocks.map((b) => b.type)).toEqual(['toc', 'h1', 'break', 'desc']);
    expect(d.pages.map((p) => p.cols)).toEqual([2, 1]);
    expect(d.blocks[1].cols).toBe(1);
  });
  it('舊的條列書式、技能判定、特殊規則', () => {
    const d = normalizeDoc({
      blocks: [
        { type: 'list', mark: 'num', text: '甲\n  乙\n丙' },
        { type: 'skill', text: '〈目星〉' },
        { type: 'rule', lb: '自訂', text: '規則' },
      ],
    });
    expect(d.blocks[0].type).toBe('desc');
    expect(d.blocks[0].text).toBe('1. 甲\n  - 乙\n2. 丙');
    expect(d.blocks[1]).toMatchObject({ type: 'proc', lb: '技能檢定' });
    expect(sameStyle(d.blocks[1].bx, BX_TPL.skill)).toBe(true);
    expect(d.blocks[2]).toMatchObject({ type: 'proc', lb: '自訂' });
    expect(sameStyle(d.blocks[2].bx, BX_TPL.rule)).toBe(true);
  });
  it('行首舊記號只遷移一次（mdv），註解位置跟著移動', () => {
    const d = normalizeDoc({
      blocks: [{ type: 'desc', text: '・甲乙', cm: [{ a: 1, b: 3, t: 'n' }] }],
    });
    expect(d.blocks[0].text).toBe('- 甲乙');
    expect(d.blocks[0].cm).toEqual([{ a: 2, b: 4, t: 'n' }]);
    const again = normalizeDoc({ mdv: 1, blocks: [{ type: 'desc', text: '・甲' }] });
    expect(again.blocks[0].text).toBe('・甲');
  });
  it('表格的舊格式（cells）轉成每格的段落', () => {
    const d = normalizeDoc({
      blocks: [
        {
          type: 'table',
          tbl: {
            cells: [
              ['A', 'B'],
              ['1', '2'],
            ],
          },
        },
      ],
    });
    const t = d.blocks[0].tbl as Table;
    expect([t.rows, t.ncol]).toEqual([2, 2]);
    expect(cellsRead(t)).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
    expect(t.cells).toBeUndefined();
  });
  it('流程圖沒有圖資料時從文字轉換、圖片補齊欄位、沒有段落時用範例', () => {
    const d = normalizeDoc({
      blocks: [
        { type: 'flow', text: 'A\n- B\n- C' },
        { type: 'image', fl: 'l' },
      ],
    });
    expect(d.blocks[0].flow?.nodes).toHaveLength(3);
    expect(d.blocks[1]).toMatchObject({
      pos: 'left',
      cols: 2,
      w: 70,
      pg: 1,
      wrap: 'square',
      dx: 0,
      dy: 0,
    });
    expect(normalizeDoc({ pages: [] }).blocks.map((b) => b.type)).toEqual(
      sampleBlocks().map((b) => b.type),
    );
  });
  it('樣板只留有名稱的，名稱最多 24 字', () => {
    const d = normalizeDoc({
      blocks: [],
      bxTpl: [{ n: '' }, { n: 'x'.repeat(30), col: 'ai', ln: 'solid' }],
    });
    expect(d.bxTpl).toHaveLength(1);
    expect(d.bxTpl[0].n).toHaveLength(24);
    expect(d.bxTpl[0]).toMatchObject({ col: 'ai', ln: 'solid' });
  });
});

describe('原稿檔（2.1、3.1.2）', () => {
  it('新版的專案檔與舊版的原稿 JSON 都讀得懂', () => {
    const d = blankDoc();
    const proj = JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-editor',
      version: 1,
      savedAt: '',
      data: d,
    });
    expect(docFromFileText(proj).title).toBe(UNTITLED);
    expect(
      docFromFileText(`﻿${JSON.stringify({ title: '舊', blocks: [{ type: 'desc', text: 'a' }] })}`)
        .title,
    ).toBe('舊');
  });
  it('不是原稿時丟錯', () => {
    expect(() => docFromFileText('not json')).toThrow('這不是劇本排版台的原稿');
    expect(() => docFromFileText('{"a":1}')).toThrow('這不是劇本排版台的原稿');
    expect(() =>
      docFromFileText(
        JSON.stringify({ format: 'trpg-toolkit-project', tool: 'textbox', version: 1, data: {} }),
      ),
    ).toThrow('其他工具');
  });
});

describe('段落間距（3.2.4）', () => {
  it('前一段的下與這一段的上重疊時只留較大的', () => {
    expect(space('h1')).toEqual({ t: 7, b: 3.5 });
    expect(gapPull('desc', 'h1')).toBe(2.2);
    expect(gapPull('proc', 'note')).toBe(2.5);
    expect(gapPull(null, 'h1')).toBe(0);
    expect(space('unknown')).toEqual({ t: 0, b: 2 });
  });
});

describe('表格（3.6.3、F101、F102）', () => {
  it('新表格：4 列 2 欄、第 1 列是「項目／內容」', () => {
    const t = newTable();
    expect([t.rows, t.ncol]).toEqual([4, 2]);
    expect(cellHead(t, 0, 0)).toBe('項目');
    expect(cellHead(t, 0, 1)).toBe('內容');
  });
  it('切到條列補到 3 欄並換成條列的欄名；標題框至少 2 欄', () => {
    const t = newTable();
    setLook(t, 'list');
    expect(t.ncol).toBe(3);
    expect(cellsRead(t)[0]).toEqual(['骰值', '標題', '內容']);
    const u = table([['自己的欄', '']]);
    setLook(u, 'card');
    expect(cellsRead(u)[0]).toEqual(['自己的欄', '']);
  });
  it('增減列欄時其他格的內容跟著對應位置', () => {
    const t = table([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    tblAddRow(t, 1);
    expect(cellsRead(t)).toEqual([
      ['a', 'b'],
      ['', ''],
      ['c', 'd'],
    ]);
    tblDelCol(t, 0);
    expect(cellsRead(t)).toEqual([['b'], [''], ['d']]);
    tblAddCol(t);
    tblDelRow(t, 0);
    expect(cellsRead(t)).toEqual([
      ['', ''],
      ['d', ''],
    ]);
    expect(tblDelRow(table([['x']]), 0)).toBe(false);
  });
});

describe('表格的輸出文字（3.6.4）', () => {
  it('roll-table：骰值欄、範圍、名稱與骰子的預設、換行寫成 \\n', () => {
    const t = table([
      ['骰值', '結果'],
      ['1-2', '甲'],
      ['3 〜 4', '乙\n丙'],
      ['', ''],
    ]);
    expect(rollTableText(t)).toBe('/roll-table\n表\n1D2\n1-2:甲\n3〜4:乙\\n丙');
  });
  it('roll-table：第 1 欄不是數字時依序編號、全部欄是結果（全形空白接起來）', () => {
    const t = table([
      ['項目', '內容'],
      ['刀', '銳利'],
      ['盾', '堅固'],
    ]);
    t.name = '裝備';
    t.dice = '1D2';
    expect(rollTableText(t)).toBe('/roll-table\n裝備\n1D2\n1:刀　銳利\n2:盾　堅固');
    expect(exportOutText(t)).toBe(rollTableText(t));
    t.out = '自己寫的';
    expect(exportOutText(t)).toBe('自己寫的');
  });
  it('簡單文字：格線且有欄名時「欄名：值」以「／」接起來；其他外觀「■第 1 欄」', () => {
    const t = table([
      ['名稱', '說明'],
      ['刀', '銳利'],
      ['盾', ''],
    ]);
    t.name = '裝備';
    expect(simpleTableText(t)).toBe('裝備\n名稱：刀／說明：銳利\n名稱：盾');
    t.look = 'card';
    expect(simpleTableText(t)).toBe('裝備\n■刀\n銳利\n\n■盾\n');
  });
});

describe('目錄（3.6.1、F171）', () => {
  it('收錄清單、個別的收錄方式、寫法與層級、頁碼', () => {
    const blocks = [
      { ...newBlock('title', '｜大《おお》標題'), id: 't' },
      { ...newBlock('h1', '第一章\n副標'), id: 'a' },
      { ...newBlock('h2', '不收'), id: 'b', tocMode: 'off' as const },
      {
        ...newBlock('scene', '場景'),
        id: 'c',
        tocMode: 'on' as const,
        tl: '場景（目錄）',
        tocLv: 2,
      },
      { ...newBlock('desc', '一定收錄但不是標題'), id: 'd', tocMode: 'on' as const },
      { ...newBlock('h3', ''), id: 'e' },
    ];
    const pages: Record<string, number> = { t: 1, a: 2, c: 3 };
    const e = tocEntries(blocks, (id) => pages[id] ?? null, ['title', 'h1', 'h2', 'h3']);
    expect(e).toEqual([
      { id: 't', lv: 0, text: '大標題', page: 1 },
      { id: 'a', lv: 1, text: '第一章', page: 2 },
      { id: 'c', lv: 2, text: '場景（目錄）', page: 3 },
    ]);
  });
});

describe('流程圖（3.6.5、F130～F139）', () => {
  it('舊式文字：分支平均分配、每排連到上一排的每個方框', () => {
    const f = flowFromText('開始\n- 甲\n- 乙\n結束');
    expect(f.nodes.map((n) => n.t)).toEqual(['開始', '甲', '乙', '結束']);
    expect(f.nodes[0]).toMatchObject({ y: 5, h: 13, w: 72 });
    expect(f.nodes[1]).toMatchObject({ x: 4, y: 27, kind: 'round', col: 'aka' });
    expect(f.edges).toHaveLength(4);
    expect(f.h).toBe(Math.max(60, 5 + 2 * 22 + 13 + 5));
  });
  it('加入方框：放在選取方框下方 10 mm 並連線；放不下時圖加高', () => {
    const f = newFlow();
    const a = flowAddNode(f, 'box', null);
    expect(a).toMatchObject({ x: (105 - 44) / 2, y: 8, w: 44, h: 14 });
    const b = flowAddNode(f, 'diamond', a);
    expect(b).toMatchObject({ y: 8 + 14 + 10, w: 40, h: 20 });
    expect(f.edges).toEqual([expect.objectContaining({ a: a.id, b: b.id })]);
    f.h = 40;
    const c = flowAddNode(f, 'term', b);
    expect(c.h).toBe(12);
    expect(f.h).toBeGreaterThanOrEqual(c.y + c.h);
  });
  it('對齊：靠左、寬度一致、水平間距平均（0.5 mm）', () => {
    const f = { ...newFlow(), w: 200 };
    const ns = [newFlowNode(10, 0), newFlowNode(30.3, 20), newFlowNode(100, 40)];
    ns[1].w = 50;
    f.nodes = ns;
    flowAlign(f, ns, 'left');
    expect(ns.map((n) => n.x)).toEqual([10, 10, 10]);
    flowAlign(f, ns, 'wsame');
    expect(ns.map((n) => n.w)).toEqual([50, 50, 50]);
    const m = [newFlowNode(0, 0), newFlowNode(10, 0), newFlowNode(100, 0)];
    flowAlign({ ...newFlow(), w: 200 }, m, 'hgap');
    expect(m.map((n) => n.x)).toEqual([0, 50, 100]);
    expect(flowAlign(f, [ns[0]], 'left')).toBe(false);
  });
  it('配合內容、文字溢出時延伸（菱形 1.7 倍）', () => {
    const f = newFlow();
    const n = newFlowNode(10, 10);
    f.nodes = [n];
    flowFitContent(f);
    expect([f.w, f.h]).toEqual([59, 29]);
    n.kind = 'diamond';
    expect(flowGrowNode(f, n, 20)).toBe(true);
    expect(n.h).toBe(34);
    expect(flowGrowNode(f, n, 10)).toBe(false);
  });
  it('線從方框邊緣出發', () => {
    const f = newFlow();
    const a = newFlowNode(0, 0);
    const b = newFlowNode(0, 40);
    f.nodes = [a, b];
    const g = edgeGeom(f, { id: 'e', a: a.id, b: b.id, lb: '' });
    expect(g?.p1).toEqual([22, 14]);
    expect(g?.p2).toEqual([22, 40]);
  });
});

describe('圖片（3.2.9、F151～F154）', () => {
  const doc = { padH: 16, padV: 18 };
  it('寬：行內與繞排以版心、自由配置以紙寬為準', () => {
    const b = { ...makeBlock('image'), w: 50 };
    expect(imageWidthMm(b, doc)).toBe(89);
    setImagePos(b, 'free', 3);
    expect(b).toMatchObject({ pos: 'free', pg: 3, cols: 1 });
    expect(imageWidthMm(b, doc)).toBe(105);
    setImagePos(b, 'left', 1);
    expect(b).toMatchObject({ fl: 'l', cols: 2 });
  });
  it('靠到紙邊、避開矩形', () => {
    const b = { ...makeBlock('image'), pos: 'free' as const, w: 40, ar: 0.5, fx: 20, fy: 30 };
    snapImage(b, 'right', doc);
    expect(b.fx).toBe(Math.round(210 - 84 - 16));
    snapImage(b, 'bottom', doc);
    expect(b.fy).toBe(Math.round(297 - 42 - 18));
    b.fx = 20;
    b.fy = 30;
    expect(freeShape(b, doc, 1)).toEqual({
      side: 'left',
      width: 20 + 84 - 16 + 3,
      height: 30 - 18 - 1.5 + 42 + 3,
      top: 30 - 18 - 1.5,
    });
    expect(freeShape(b, doc, 2)).toBeNull();
    expect(freeShape({ ...b, ar: 0 }, doc, 1)).toBeNull();
  });
});

describe('規則框的樣板（3.6.2、F091、F092）', () => {
  it('標題語只在還沒寫、或仍是樣板的預設時才換', () => {
    const b = makeBlock('proc');
    applyBxTpl(b, 'rule');
    expect(b.lb).toBe('特殊規則');
    b.lb = '共鳴檢定';
    applyBxTpl(b, 'skill');
    expect(b.lb).toBe('共鳴檢定');
    expect(sameStyle(b.bx, BX_TPL.skill)).toBe(true);
  });
  it('同名的保留原稿那一份', () => {
    const a = bxTplClean({ n: '甲', col: 'ai' });
    const b = bxTplClean({ n: '甲', col: 'kin' });
    const c = bxTplClean({ n: '乙' });
    if (!a || !b || !c) throw new Error();
    expect(mergeTemplates([a], [b, c]).map((t) => [t.n, t.col])).toEqual([
      ['甲', 'ai'],
      ['乙', 'aka'],
    ]);
  });
});

describe('複製段落換新的 id（第 5 節）', () => {
  it('巢狀的段落、流程圖的方框與線都換新', () => {
    const d = normalizeDoc({
      blocks: [
        {
          id: 'p',
          type: 'popup',
          pop: { label: 'x', blocks: [{ id: 'q', type: 'desc', text: '' }] },
        },
        { id: 'f', type: 'flow', text: 'A\nB' },
      ],
    });
    const before = allBlocks(d).map((b) => b.id);
    const copy = JSON.parse(JSON.stringify(d.blocks)).map(renewIds);
    const after = allBlocks({ blocks: copy }).map((b) => b.id);
    expect(after.some((id) => before.includes(id))).toBe(false);
    const f = copy[1].flow;
    expect(f.nodes.map((n: { id: string }) => n.id)).not.toEqual(
      d.blocks[1].flow?.nodes.map((n) => n.id),
    );
    expect(f.edges[0].a).toBe(f.nodes[0].id);
  });
});

describe('分頁的分段（3.2.7）', () => {
  it('換頁切成幾段，自由配置的圖片與只給儲存格用的彈出視窗不在流程裡', () => {
    const d = normalizeDoc({
      blocks: [
        { id: 'a', type: 'desc', text: 'a' },
        { id: 'img', type: 'image', pos: 'free' },
        { id: 'br', type: 'break' },
        { id: 'pop', type: 'popup', pop: { label: 'x', only: true, blocks: [] } },
        { id: 'b', type: 'desc', text: 'b' },
      ],
    });
    const { sections, breaks } = sectionsOf(d);
    expect(sections.map((s) => s.map((b) => b.id))).toEqual([['a'], ['b']]);
    expect(breaks.map((b) => b?.id ?? null)).toEqual(['br', null]);
  });
});

describe('閱覽 HTML（3.9）', () => {
  const d = normalizeDoc({
    title: '洋館',
    blocks: [
      { id: 'h', type: 'h1', text: '導入' },
      {
        id: 't',
        type: 'table',
        tbl: {
          name: '表',
          cells: [
            ['項目', '內容'],
            ['1', '</script>'],
          ],
        },
      },
      { id: 'br', type: 'break' },
      { id: 'h2', type: 'h2', text: '大廳' },
      {
        id: 'p',
        type: 'popup',
        pop: { label: '地圖', blocks: [{ id: 'pd', type: 'desc', text: '走廊' }] },
      },
    ],
  });
  const html = exportHtml({
    doc: d,
    pages: [
      ['h', 't'],
      ['h2', 'p'],
    ],
    from: 1,
    to: 1,
  });
  it('標題、語言、只有範圍內的頁與目錄項目', () => {
    expect(html).toContain('<html lang="zh-Hant-TW">');
    expect(html).toContain('<title>洋館</title>');
    expect(html.match(/class="pagebox"/g)).toHaveLength(1);
    expect(html).toContain('id="p2"');
    expect(html).not.toContain('id="p1"');
    expect(html.match(/class="nv l/g)).toHaveLength(1);
    expect(html).toContain('<span class="nvt" data-t="大廳">■■</span><i>2</i>');
  });
  it('附錄、彈出視窗、預先放好的資料（結束標籤無害化）', () => {
    expect(html).toContain('class="pagebox appx"');
    expect(html).toContain('<div class="popbody" id="popp" hidden><h3>地圖</h3>');
    expect(html).toContain('<script type="text/plain" class="outdata" id="outt">/roll-table');
    expect(html).toContain('<\\/script>');
    expect(html).toContain('localStorage.setItem(k,v)');
    expect(html).toContain('fonts.googleapis.com/css2?family=Noto+Serif+TC');
  });
  it('遮字與無害化', () => {
    expect(maskText('a')).toBe('■■');
    expect(maskText('x'.repeat(20))).toBe('■'.repeat(14));
    expect(scriptSafe('a</SCRIPT>b')).toBe('a<\\/SCRIPT>b');
  });
});

describe('檔名與輸出範圍（3.13、F230）', () => {
  it('劇本名稱把 \\ / : * ? " < > | 換成 _，空白時 scenario', () => {
    expect(paperFileName('霧/中:的?洋館', 'json')).toBe('霧_中_的_洋館.json');
    expect(paperFileName('', 'pdf')).toBe('scenario.pdf');
  });
  it('範圍夾在 1～N、顛倒時對調', () => {
    expect(clampRange(4, 2, 5)).toEqual({ from: 1, to: 3 });
    expect(clampRange(0, 99, 5)).toEqual({ from: 0, to: 4 });
  });
});
