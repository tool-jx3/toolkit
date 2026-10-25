// @vitest-environment jsdom
/**
 * 劇本排版台 2026-10 跟進（上游 v3.10～v3.26）第三批：段落裡的段落（Tab）、特殊區塊的範本與外觀、按一下複製、
 * Enter／Backspace／Tab 的規則、書式按鈕在下面新增、Esc、手冊與變數清單（規格 1.14 F297～F315、3.19、5.4）。
 * 「原作的結果」是在原作 v3.26.0（origin/HEAD 5048f6d）的頁面裡用原作的函式算的
 * （procSplit、normalize、mdParse、spKey、procName、procClass、procStyle、applyBxTpl、kidsMove、ptMigrate、
 * blockStaticHTML、isSecBlock、blockPlainText）；標題語的預設值是本站的繁中（技能判定→技能檢定、特殊ルール→特殊規則）。
 * scenario-editor-upstream-v326-kids.json 是原作的程式做的原稿（newBlock／applyBxTpl／normalize）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { exportHtml } from '../../src/tools/scenario-editor/exportHtml';
import {
  allBlocks,
  findBlock,
  isSecBlock,
  newBlock,
  spKey,
} from '../../src/tools/scenario-editor/model/blocks';
import { procCopyText } from '../../src/tools/scenario-editor/model/count';
import { blankDoc, makeBlock, normalizeDoc } from '../../src/tools/scenario-editor/model/doc';
import { migrateLegacySizes, natPt } from '../../src/tools/scenario-editor/model/fontSize';
import {
  kidsMove,
  kidsRelease,
  PK_VER,
  procSplit,
} from '../../src/tools/scenario-editor/model/kids';
import { type MdCtx, mdParse } from '../../src/tools/scenario-editor/model/md';
import {
  applyBxTpl,
  BX_TPL,
  BX_TPL_BUTTONS,
  bxTplClean,
  ensureProc,
  procName,
  procStyleOf,
  sameStyle,
} from '../../src/tools/scenario-editor/model/proc';
import type { Block, Doc, Mark } from '../../src/tools/scenario-editor/model/types';
import { varList } from '../../src/tools/scenario-editor/model/vars';
import {
  changeSelected,
  clearAll,
  copyBlocks,
  copyTargetText,
  ensurePopRefs,
  enterAt,
  enterOnSelected,
  joinBack,
  mdLineFire,
  moveBlocksTo,
  nestSel,
  pasteParagraphs,
} from '../../src/tools/scenario-editor/ops';
import {
  blockHtml,
  kidsHtml,
  procVars,
  type RenderCtx,
} from '../../src/tools/scenario-editor/render/html';
import { PAPER_CSS } from '../../src/tools/scenario-editor/render/paperCss';
import { docFromFileText } from '../../src/tools/scenario-editor/session';
import { doc, select, setUi, ui, useDoc } from '../../src/tools/scenario-editor/store';
import UP_KIDS from '../e2e/fixtures/scenario-editor-upstream-v326-kids.json';

const B = (id: string, type: Block['type'], text = '', extra: Partial<Block> = {}): Block =>
  Object.assign(newBlock(type, text), { id }, extra);
const P = (id: string, tpl: string, text = '', extra: Partial<Block> = {}): Block => {
  const b = B(id, 'proc', text, extra);
  applyBxTpl(b, tpl);
  if (extra.lb !== undefined) b.lb = extra.lb;
  return b;
};
/** 比對用：書式、文字、標題語、裡面的段落 */
const sum = (bs: readonly Block[]): unknown[] =>
  bs.map((b) => {
    const o: Record<string, unknown> = { type: b.type, text: b.text };
    if (b.lb != null) o.lb = b.lb;
    if (b.kids?.length) o.kids = sum(b.kids);
    return o;
  });
const SKILL_BX = {
  ln: 'dash',
  bar: false,
  thin: false,
  mid: false,
  fill: true,
  sm: true,
  xs: false,
  ink: false,
  copy: false,
  col: 'aka',
};
const ctxOf = (d: Doc, copy = false): RenderCtx => ({
  doc: d,
  edit: false,
  pageOf: () => 1,
  total: 1,
  copyButtons: copy,
});
const docWith = (blocks: Block[]): Doc => ({ ...blankDoc(), blocks });

describe('特殊區塊的範本（3.19.2、F303）', () => {
  it('內建範本 5 個：與原作 BX_TPL 相同（標題語是繁中）', () => {
    expect(BX_TPL_BUTTONS.map((x) => x.k)).toEqual(['skill', 'rule', 'dialog', 'note', 'info']);
    const look = (k: keyof typeof BX_TPL) => {
      const { lb, ...st } = BX_TPL[k];
      return { lb, st };
    };
    expect(look('skill')).toEqual({ lb: '技能檢定', st: SKILL_BX });
    expect(look('rule').st).toEqual({
      ...SKILL_BX,
      ln: 'solid',
      bar: true,
      sm: false,
      col: 'sumi',
    });
    expect(look('dialog')).toEqual({
      lb: '',
      st: { ...SKILL_BX, ln: 'none', fill: false, sm: false, ink: true, col: 'kon' },
    });
    expect(look('note')).toEqual({
      lb: '',
      st: {
        ...SKILL_BX,
        ln: 'none',
        bar: true,
        thin: true,
        sm: false,
        xs: true,
        ink: true,
        col: 'hai',
      },
    });
    expect(look('info')).toEqual({
      lb: '情報',
      st: { ...SKILL_BX, ln: 'none', bar: true, mid: true, sm: false, copy: true, col: 'nando' },
    });
  });
  it('class 與顏色：與原作 procClass、procStyle 相同', () => {
    const up: Record<string, [string, string]> = {
      skill: [
        ' bx-l-dash bx-fill bx-sm',
        '--bxc:#a8331f;--bxl:rgba(168,51,31,.6);--bxf:rgba(168,51,31,.05);',
      ],
      rule: [
        ' bx-l-solid bx-bar bx-fill',
        '--bxc:#23201c;--bxl:rgba(35,32,28,.55);--bxf:rgba(35,32,28,.045);',
      ],
      dialog: [
        ' bx-l-none bx-ink sp-dialog',
        '--bxc:#1c2b3c;--bxl:rgba(28,43,60,.55);--bxf:rgba(28,43,60,.045);',
      ],
      note: [
        ' bx-l-none bx-bar bx-thin bx-fill bx-xs bx-ink sp-note',
        '--bxc:#5f5849;--bxl:rgba(95,88,73,.6);--bxf:rgba(95,88,73,.05);',
      ],
      info: [
        ' bx-l-none bx-bar bx-mid bx-fill bx-copy sp-info',
        '--bxc:#2f5d73;--bxl:rgba(47,93,115,.6);--bxf:rgba(47,93,115,.07);',
      ],
    };
    for (const [k, [cls, style]] of Object.entries(up)) {
      const v = procVars(P('x', k));
      expect(v.cls, k).toBe(cls);
      expect(v.style, k).toBe(style);
    }
  });
  it('間距與名稱：與原作 spKey、procName 相同（名稱是本站的書式名稱）', () => {
    expect(['skill', 'rule', 'dialog', 'note', 'info'].map((k) => spKey(P('x', k)))).toEqual([
      'proc',
      'proc',
      'dialog',
      'note',
      'info',
    ]);
    expect(['skill', 'rule', 'dialog', 'note', 'info'].map((k) => procName(P('x', k)))).toEqual([
      '特殊區塊',
      '特殊區塊',
      '對話文',
      '注釋',
      '情報區塊',
    ]);
    /* 改了顏色就不是範本的樣子 */
    const d = P('d', 'dialog');
    ensureProc(d).col = 'aka';
    expect(procName(d)).toBe('特殊區塊');
    expect(spKey(d)).toBe('dialog');
    expect(spKey(B('n', 'note'))).toBe('note');
  });
  it('套用範本的標題語：與原作相同（空的範本標題語也換、自己改過的不換）', () => {
    const lbOf = (lb0: string | null | undefined, k: string) => {
      const b = B('x', 'proc', '', { bx: { ...SKILL_BX } as Block['bx'] });
      if (lb0 !== undefined) b.lb = lb0;
      applyBxTpl(b, k);
      return b.lb;
    };
    /* 原作：['', '', '共鳴判定', '技能判定', '特殊ルール', '情報'] */
    expect([
      lbOf(undefined, 'dialog'),
      lbOf('技能判定', 'dialog'),
      lbOf('共鳴判定', 'dialog'),
      lbOf('', 'skill'),
      lbOf('情報', 'rule'),
      lbOf(null, 'info'),
    ]).toEqual(['', '', '共鳴判定', '技能檢定', '特殊規則', '情報']);
  });
  it('「目前」的範本不看「按一下複製」（同原作）；自己的範本也記住新的欄位', () => {
    const b = P('x', 'info');
    ensureProc(b).copy = false;
    expect(sameStyle(procStyleOf(b), BX_TPL.info)).toBe(true);
    const t = bxTplClean({ n: '我的', ...procStyleOf(P('y', 'note')), lb: '注' });
    expect(t).toMatchObject({ thin: true, xs: true, ink: true, copy: false, col: 'hai' });
    const c = B('z', 'proc');
    applyBxTpl(c, t?.id ?? '', t ? [t] : []);
    expect(procStyleOf(c)).toMatchObject({ thin: true, xs: true, ink: true, col: 'hai' });
  });
  it('細的線優先（mid 與 thin 同時有時是細的；同原作 ensureProc）', () => {
    const b = B('x', 'proc', '', {
      bx: { ln: 'none', bar: true, thin: true, mid: true, fill: true, sm: false, col: 'hai' },
    });
    expect(ensureProc(b).mid).toBe(false);
    expect(
      procStyleOf(
        B('y', 'proc', '', {
          bx: { ...SKILL_BX, bar: true, thin: true, mid: true } as Block['bx'],
        }),
      ).mid,
    ).toBe(false);
  });
});

describe('段落裡的段落：資料（3.19.1、F297、F302）', () => {
  it('特殊區塊的 ■、＞ 分成裡面的段落：與原作 procSplit 相同', () => {
    const split = (t: string) => {
      const r = procSplit(t, null);
      return { text: r.text, kids: sum(r.kids) };
    };
    expect(split('說明\n■成功\n找到了\n■失敗\n沒找到')).toEqual({
      text: '說明',
      kids: [
        { type: 'desc', text: '■成功\n找到了' },
        { type: 'desc', text: '■失敗\n沒找到' },
      ],
    });
    expect(split('＞聆聽：聽見腳步聲\n＞偵查：看見影子\n之後的文字')).toEqual({
      text: '之後的文字',
      kids: [{ type: 'proc', text: '聽見腳步聲\n偵查：看見影子', lb: '聆聽' }],
    });
    expect(split('前\n> 技能判定\n後')).toEqual({
      text: '前\n後',
      kids: [{ type: 'proc', text: '技能判定', lb: '技能檢定' }],
    });
    expect(split('#### 小標\n內容\n##### 小小標\n內文')).toEqual({
      text: '',
      kids: [
        { type: 'desc', text: '#### 小標\n內容' },
        { type: 'desc', text: '##### 小小標\n內文' },
      ],
    });
    expect(split('　■縮排的小標\n內容')).toEqual({
      text: '',
      kids: [{ type: 'desc', text: '■縮排的小標\n內容' }],
    });
    expect(split('普通の文章だけ')).toEqual({ text: '普通の文章だけ', kids: [] });
    expect(split('■A\n＞判定：成功\n■B')).toEqual({
      text: '',
      kids: [
        { type: 'desc', text: '■A' },
        { type: 'proc', text: '成功', lb: '判定' },
        { type: 'desc', text: '■B' },
      ],
    });
    /* 裡面的檢定框是技能檢定的樣子 */
    expect(procStyleOf(procSplit('＞a：b', null).kids[0])).toEqual(SKILL_BX);
  });
  it(':::proc 的內容：■、＞、裡面的 ::: 是裡面的段落（與原作相同；::::note 是本站的注釋，D35）', () => {
    const ctx: MdCtx = { skip: [], ho: new Set(), tpls: [] };
    expect(sum(mdParse(':::proc\n說明\n■成功\n內容\n:::', ctx).blocks)).toEqual([
      { type: 'proc', text: '說明', lb: '技能檢定', kids: [{ type: 'desc', text: '■成功\n內容' }] },
    ]);
    expect(
      sum(mdParse(':::skill[聆聽]\n＞偵查：看見\n::::note\n注意\n::::\n:::', ctx).blocks),
    ).toEqual([
      {
        type: 'proc',
        text: '',
        lb: '聆聽',
        kids: [
          { type: 'proc', text: '看見', lb: '偵查' },
          { type: 'note', text: '注意' },
        ],
      },
    ]);
    /* 段落裡不能放的書式：照原文留成描述文 */
    expect(sum(mdParse(':::proc\n前\n:::pagebreak\n:::\n:::', ctx).blocks)).toEqual([
      { type: 'proc', text: '前', lb: '技能檢定' },
    ]);
    expect(sum(mdParse(':::proc\n前\n:::h1\n標題\n:::\n:::', ctx).blocks)).toEqual([
      {
        type: 'proc',
        text: '前',
        lb: '技能檢定',
        kids: [{ type: 'desc', text: ':::h1\n標題\n:::' }],
      },
    ]);
  });
  it('讀入：pkv 沒有的原稿只換一次（與原作 normalize 相同）；pkv 寫出', () => {
    const raw = (pkv?: number) => ({
      title: 't',
      pkv,
      pages: [{ id: 'p', bg: { preset: 'none' }, cols: 1 }],
      blocks: [
        {
          id: 'a',
          type: 'proc',
          text: '說明\n■成功\n找到',
          cols: 2,
          bx: { ln: 'dash', bar: false, fill: true, sm: true, col: 'aka' },
        },
        {
          id: 'b',
          type: 'desc',
          text: 'x',
          cols: 2,
          kids: [{ id: 'k1', type: 'desc', text: 'y' }, null, 3],
        },
        { id: 'c', type: 'desc', text: 'z', cols: 2, kids: [] },
      ],
    });
    const n0 = normalizeDoc(raw());
    expect(n0.pkv).toBe(PK_VER);
    expect(sum(n0.blocks)).toEqual([
      { type: 'proc', text: '說明', kids: [{ type: 'desc', text: '■成功\n找到' }] },
      { type: 'desc', text: 'x', kids: [{ type: 'desc', text: 'y' }] },
      { type: 'desc', text: 'z' },
    ]);
    expect(n0.blocks[2].kids).toBeUndefined();
    expect(n0.blocks[1].kids?.[0]).toMatchObject({ id: 'k1', cols: 2, mt: null });
    /* 已經換過的（原作 pkv:1、本站之後存的）不再換：文字裡打的 ■ 留著 */
    const n1 = normalizeDoc(raw(1));
    expect(sum(n1.blocks)[0]).toEqual({ type: 'proc', text: '說明\n■成功\n找到' });
    expect(JSON.parse(JSON.stringify(normalizeDoc(n0))).blocks[0].kids).toHaveLength(1);
    expect(blankDoc().pkv).toBe(PK_VER);
  });
  it('本站以前存的原稿（沒有 pkv）：特殊區塊的 ■、> 行換成裡面的段落；註解與顏色在留下的部分照舊', () => {
    const d = normalizeDoc({
      mdv: 1,
      pages: [{ id: 'p', bg: { preset: 'none' }, cols: 1 }],
      blocks: [
        {
          id: 'a',
          type: 'proc',
          text: '調查。\n■成功\n找到\n> 聆聽：腳步聲',
          cols: 2,
          bx: { ...SKILL_BX },
          lb: '技能檢定',
          cm: [{ a: 0, b: 2, t: '註' }],
        },
      ],
    });
    const a = d.blocks[0];
    expect(a.text).toBe('調查。');
    expect(a.cm).toEqual([{ a: 0, b: 2, t: '註' }]);
    expect(sum(a.kids ?? [])).toEqual([
      { type: 'desc', text: '■成功\n找到' },
      { type: 'proc', text: '腳步聲', lb: '聆聽' },
    ]);
  });
  it('原作 v3.26 的原稿：裡面的段落、對話／注釋／情報的範本、按一下複製、pt 照讀，再存不會遺失', () => {
    const d = docFromFileText(JSON.stringify(UP_KIDS));
    const by = (id: string) => findBlock(d, id)?.b as Block;
    expect(by('d1').kids?.map((x) => x.id)).toEqual(['d1k']);
    expect(by('sk').kids?.map((x) => x.id)).toEqual(['sec1', 'sec2', 'sk2']);
    expect(by('sk2').kids).toBeUndefined();
    expect(procName(by('dl'))).toBe('對話文');
    expect(by('dl').lb).toBe('管家');
    expect(procName(by('nt'))).toBe('注釋');
    expect(procName(by('inf'))).toBe('情報區塊');
    expect(procStyleOf(by('inf')).copy).toBe(true);
    expect(by('rl').pt).toBe(14);
    expect(by('ho').kids?.map((x) => x.id)).toEqual(['hok']);
    expect(by('ho').ho).toMatchObject({ def: '記者小姐', note: '扮演記者的 PC' });
    /* pkv:1 的原稿不再分（■ 已經是裡面的段落） */
    expect(by('sec1').text).toBe('■成功\n找到信封。');
    const again = docFromFileText(JSON.stringify(d));
    expect(sum(again.blocks)).toEqual(sum(d.blocks));
    expect(findBlock(again, 'inf')?.b.bx).toEqual(by('inf').bx);
  });
  it('移進、移出：與原作 kidsMove 相同（標題不能放進去、上一段是標題時不行、空了就拿掉 kids）', () => {
    const d = docWith([
      B('p', 'desc', 'p'),
      B('c1', 'desc', 'c1'),
      B('h', 'h1', 'H'),
      B('d', 'desc', 'd'),
    ]);
    expect(kidsMove(d, 'c1', 1)).toBe(true);
    expect(sum(d.blocks)).toEqual([
      { type: 'desc', text: 'p', kids: [{ type: 'desc', text: 'c1' }] },
      { type: 'h1', text: 'H' },
      { type: 'desc', text: 'd' },
    ]);
    expect(kidsMove(d, 'h', 1)).toBe(false);
    expect(kidsMove(d, 'd', 1)).toBe(false);
    expect(kidsMove(d, 'c1', -1)).toBe(true);
    expect(sum(d.blocks).map((x) => (x as { text: string }).text)).toEqual(['p', 'c1', 'H', 'd']);
    expect('kids' in d.blocks[0]).toBe(false);
    expect(kidsMove(d, 'p', -1)).toBe(false);
  });
  it('改成不能有裡面的段落的書式：裡面的段落拿到下面', () => {
    const list = [B('a', 'desc', 'a', { kids: [B('k', 'desc', 'k')] }), B('z', 'desc', 'z')];
    kidsRelease(list, list[0], 'proc');
    expect(list[0].kids).toHaveLength(1);
    kidsRelease(list, list[0], 'h2');
    expect(list.map((b) => b.id)).toEqual(['a', 'k', 'z']);
    expect(list[0].kids).toBeUndefined();
  });
  it('「■」開頭的描述文：與原作 isSecBlock 相同', () => {
    expect(
      ['■a', '◆a', '#### a', '####a', '　■a', 'a■'].map((t) => isSecBlock(B('x', 'desc', t))),
    ).toEqual([true, true, true, false, true, false]);
    expect(isSecBlock(B('x', 'note', '■a'))).toBe(false);
  });
  it('文字大小：裡面的段落的本來大小＝外面那段本來的大小；舊的倍率換成 pt（與原作 ptMigrate 相同）', () => {
    const n = B('n', 'proc', 'n', { kids: [B('k', 'desc', 'k')] });
    applyBxTpl(n, 'note');
    n.pt = 20;
    const d = docWith([n]);
    expect(natPt(d, n.kids?.[0] as Block)).toBeCloseTo(8.6);
    const pm = [
      B('a', 'note', 'n', { fs: 1.5, kids: [B('ak', 'desc', 'k', { fs: 2 })] }),
      P('b', 'note', 'p', {
        fs: 1,
        kids: [B('bk', 'h2', 'k', { fs: 1.2, mk: [{ a: 0, b: 1, sz: 2 } as Mark] })],
      }),
    ];
    migrateLegacySizes(pm, 10, 10);
    /* 原作：13、17；（沒有）、13.5、裝飾 27 */
    expect(pm[0].pt).toBe(13);
    expect(pm[0].kids?.[0].pt).toBe(17);
    expect(pm[1].pt).toBeUndefined();
    expect(pm[1].kids?.[0].pt).toBe(13.5);
    expect(pm[1].kids?.[0].mk).toMatchObject([{ a: 0, b: 1, pt: 27 }]);
  });
});

describe('段落裡的段落：紙面（3.19.3、F298、F299）', () => {
  it('HTML 的結構：與原作 blockStaticHTML 相同（框裡、往內縮、■ 的一塊、外面指定 pt 時用本來的大小、間距）', () => {
    const pr = P('pr', 'rule', '親', {
      pt: 14,
      kids: [B('k1', 'desc', '■成功\n找到'), P('k2', 'skill', '子')],
    });
    const ds = B('ds', 'desc', '描寫', { kids: [B('dk', 'desc', '子描寫')] });
    const sec = B('sec', 'desc', '■成功\nx', { kids: [P('sn', 'note', 'n')] });
    const d = docWith([pr, ds, sec]);
    const ctx = ctxOf(d);
    const h1 = blockHtml(pr, ctx, { cols: 1, pull: 0, top: false });
    expect(h1).toContain('<div class="cellblk bx-kids" style="font-size:10pt">');
    expect(h1).toMatch(/class="bp bp-desc sec top" data-id="k1"/);
    expect(h1).toMatch(/class="bp bp-proc" data-id="k2" style="margin-top:-2.2mm;"/);
    /* 裡面的段落在框的裡面（.b 的最後） */
    expect(h1.indexOf('bx-kids')).toBeGreaterThan(h1.indexOf('class="b t-proc'));
    expect(h1.endsWith('</div></div></div></div></div></div>')).toBe(true);
    const h2 = blockHtml(ds, ctx, { cols: 1, pull: 0, top: false });
    expect(h2).toContain('<div class="cellblk bx-kids kids-ind">');
    const h3 = blockHtml(sec, ctx, { cols: 1, pull: 0, top: false });
    expect(h3).toMatch(/^<div class="bp bp-desc sec"/);
    expect(h3).toContain('class="cellblk bx-kids"><div class="bp bp-proc sp-note top"');
    expect(h3).toContain('class="b t-proc bx-l-none bx-bar bx-thin bx-fill bx-xs bx-ink sp-note"');
    /* 不能有裡面的段落的書式：不畫 */
    expect(kidsHtml(B('h', 'h1', 'H', { kids: [B('x', 'desc', 'x')] }), ctx)).toBe('');
  });
  it('樣式：與原作 v3.26 相同的線、間距、繞排圖片旁的框（flow-root）', () => {
    for (const rule of [
      '.t-proc.bx-l-none{border:0;padding:0}',
      '.t-proc.bx-l-none.bx-fill,.t-proc.bx-l-none.bx-bar{padding:2.5mm 2.5mm}',
      '.t-proc.bx-bar.bx-thin{border-left:2px solid var(--bxl);padding-left:3mm}',
      '.t-proc.bx-bar.bx-mid{border-left:3px solid var(--bxc)}',
      '.b.t-proc.bx-l-none.sp-info{padding:2.5mm 3.5mm}',
      '.t-proc.bx-xs{font-size:.86em}',
      '.t-proc.bx-ink{color:var(--bxc)}',
      '.b.t-proc.bx-l-none.sp-note{padding:2mm 3mm;line-height:1.75}',
      '.bx-kids{margin-top:1.2mm}',
      '.bx-kids.kids-ind{margin-left:4mm}',
      '.bp.sec>.b{border-left:2px solid var(--bxl,rgba(168,51,31,.6));padding-left:3mm}',
      '.t-h1,.t-h2,.t-dialog,.t-note,.t-proc,.t-info,.t-handout,.t-hr,.t-table{display:flow-root}',
      '.bp.sp-dialog{padding-top:0mm}',
      '.t-proc.sp-note{margin-bottom:2.5mm}',
      '.bp.sp-info{padding-top:3mm}',
    ])
      expect(PAPER_CSS).toContain(rule);
  });
});

describe('按一下複製（3.19.4、F305）', () => {
  it('複製的文字：與原作相同（內文＋裡面的段落，空白的略過、注音只留本文字）', () => {
    const b = P('x', 'info', '本文｜漢字《かんじ》\n', {
      kids: [
        B('a', 'desc', '■子'),
        B('b', 'desc', '  '),
        B('c', 'desc', '孫の親', { kids: [B('g', 'desc', '孫')] }),
      ],
    });
    expect(procCopyText(b)).toBe('本文漢字\n\n■子\n孫の親\n孫');
  });
  it('匯出：勾了的特殊區塊可以按（tabindex、提示）、資料是 cp<id>；沒勾的沒有', () => {
    const on = P('on', 'rule', '規則', { kids: [B('k', 'desc', '細節')] });
    ensureProc(on).copy = true;
    const off = P('off', 'skill', '檢定');
    const html = exportHtml({ doc: docWith([on, off]), pages: [['on', 'off']], from: 0, to: 0 });
    expect(html).toMatch(
      /class="b t-proc[^"]* bx-copy[^"]*" style="[^"]*" tabindex="0" title="按一下複製內文"/,
    );
    expect(html).toContain(
      '<script type="text/plain" class="outdata" id="cpon">規則\n細節</script>',
    );
    expect(html).not.toContain('id="cpoff"');
    expect(html).toContain('.t-proc.bx-copy');
  });
});

/* ---------- 操作（store） ---------- */

function load(blocks: Block[]): void {
  useDoc.getState().replace(docWith(blocks));
  setUi({ sel: [], focusId: null, pimgSel: null, focusReq: null });
}
const ids = (bs: readonly Block[] = doc().blocks) => bs.map((b) => b.id);

describe('Enter、Backspace、Tab（F297、F300、F301）', () => {
  beforeEach(() => load([]));
  it('特殊區塊的文字：游標後面的字變成裡面最前面的描述文', () => {
    load([P('p', 'skill', '調查桌子。', { kids: [B('k', 'desc', '舊的')] })]);
    expect(enterAt('p', '調查桌子。', 2)).toBe('done');
    const p = doc().blocks[0];
    expect(p.text).toBe('調查');
    expect(sum(p.kids ?? [])).toEqual([
      { type: 'desc', text: '桌子。' },
      { type: 'desc', text: '舊的' },
    ]);
    expect(ui().focusReq?.id).toBe(p.kids?.[0].id);
  });
  it('有裡面的段落、游標在最後：裡面最前面加空的描述文；段落裡最後的空段落：拿到外面；「■」那一行：同一段換行', () => {
    load([B('a', 'desc', 'abc', { kids: [B('k', 'desc', 'k')] }), B('z', 'desc', 'z')]);
    expect(enterAt('a', 'abc', 1)).toBe('split');
    expect(enterAt('a', 'abc', 3)).toBe('done');
    const nk = doc().blocks[0].kids?.[0] as Block;
    expect(nk.text).toBe('');
    /* 最後一個才拿到外面 */
    expect(enterAt(nk.id, '', 0)).toBe('split');
    const last = B('e', 'desc', '');
    useDoc.getState().update((d) => {
      (d as Doc).blocks[0].kids?.push(last);
    });
    expect(enterAt('e', '', 0)).toBe('done');
    expect(ids()).toEqual(['a', 'e', 'z']);
    expect(enterAt('z', '■成功', 3)).toBe('newline');
    expect(enterAt('z', '■成功\n內容', 3)).toBe('newline');
    expect(enterAt('z', '■成功\n內容', 6)).toBe('split');
    expect(enterAt('z', '■成功', 1)).toBe('split');
  });
  it('Backspace：段落裡最後一個空的段落刪掉後回到外面那段；接到前一段時裡面的段落一起過去', () => {
    load([B('a', 'desc', 'a', { kids: [B('k', 'desc', '')] })]);
    expect(joinBack('k')).toBe(true);
    expect(doc().blocks[0].kids).toBeUndefined();
    expect(ui().sel).toEqual(['a']);
    load([B('a', 'desc', 'a'), B('b', 'desc', 'b', { kids: [B('bk', 'desc', 'bk')] })]);
    expect(joinBack('b')).toBe(true);
    expect(doc().blocks[0].text).toBe('ab');
    expect(ids(doc().blocks[0].kids)).toEqual(['bk']);
    /* 空的段落（有裡面的段落）：裡面的段落留在原處 */
    load([B('a', 'desc', 'a'), B('b', 'desc', '', { kids: [B('bk', 'desc', 'bk')] })]);
    expect(joinBack('b')).toBe(true);
    expect(ids()).toEqual(['a', 'bk']);
  });
  it('Tab：只選了一個時放進上一段／拿到外面，不行時縮排', () => {
    load([B('a', 'h2', 'A'), B('b', 'desc', 'b'), B('c', 'desc', 'c')]);
    select(['b']);
    nestSel(1);
    expect(doc().blocks[1].ind).toBe(1);
    select(['c']);
    nestSel(1);
    expect(ids(doc().blocks[1].kids)).toEqual(['c']);
    nestSel(-1);
    expect(ids()).toEqual(['a', 'b', 'c']);
    nestSel(-1);
    expect(findBlock(doc(), 'c')?.b.ind ?? 0).toBe(0);
    select(['b', 'c']);
    nestSel(1);
    expect(findBlock(doc(), 'c')?.b.ind).toBe(1);
  });
  it('貼在特殊區塊的文字裡：分出來的段落放進它裡面的最前面；段落裡不能放的留成描述文（同原作）', () => {
    load([P('p', 'skill', '說明', { kids: [B('old', 'desc', '舊')] })]);
    expect(pasteParagraphs('p', '# 標題\n\n一段\n\n:::note\n注\n:::')).not.toBeNull();
    expect(sum(doc().blocks[0].kids ?? [])).toEqual([
      { type: 'desc', text: '標題' },
      { type: 'desc', text: '一段' },
      { type: 'note', text: '注' },
      { type: 'desc', text: '舊' },
    ]);
    expect(doc().blocks).toHaveLength(1);
  });
  it('第一行打 ::: 換書式：裡面的段落帶過去（不能有時放在下面）', () => {
    load([B('a', 'desc', ':::skill', { kids: [B('k', 'desc', 'k')] })]);
    expect(mdLineFire('a', ':::skill', 8)).toBe(true);
    expect(doc().blocks[0].type).toBe('proc');
    expect(ids(doc().blocks[0].kids)).toEqual(['k']);
    load([B('a', 'desc', '---', { kids: [B('k', 'desc', 'k')] })]);
    expect(mdLineFire('a', '---', 3)).toBe(true);
    expect(doc().blocks.map((b) => b.type)).toEqual(['hr', 'desc', 'desc']);
    expect(ids().slice(0, 1)).toEqual(['a']);
    expect(ids()).toContain('k');
  });
  it('複製文字、複製區塊：含裡面的段落；外面那段也選取著時不重複（F065、F066）', () => {
    load([B('a', 'desc', '外', { kids: [B('k', 'desc', '內')] }), B('z', 'desc', '後')]);
    select(['a', 'k']);
    expect(copyTargetText()).toEqual({ text: '外\n內', n: 1 });
    expect(copyBlocks()?.map((b) => b.id)).toEqual(['a']);
    select(['k']);
    expect(copyTargetText()).toEqual({ text: '內', n: 1 });
  });
  it('段落裡寫了還不存在的「＠名稱」：彈出視窗放在最外面那段的下面（D42）', () => {
    load([
      B('a', 'desc', 'a', { kids: [B('k', 'desc', 'k', { kids: [B('g', 'desc', '＠線索')] })] }),
      B('z', 'desc', 'z'),
    ]);
    ensurePopRefs('g');
    expect(doc().blocks.map((b) => b.type)).toEqual(['desc', 'popup', 'desc']);
    expect(doc().blocks[1].pop).toMatchObject({ label: '線索', only: true });
  });
  it('拖曳：不能搬進自己裡面；段落裡不能放的書式不能搬進去', () => {
    load([B('a', 'desc', 'a', { kids: [B('k', 'desc', 'k')] }), B('h', 'h1', 'H')]);
    expect(moveBlocksTo(['a'], { k: 'kids', id: 'a' }, 0)).toBe(false);
    expect(moveBlocksTo(['h'], { k: 'kids', id: 'a' }, 0)).toBe(false);
    expect(ui().status?.text).toBe('標題 1不能放進段落裡。');
    expect(moveBlocksTo(['k'], { k: 'body' }, 2)).toBe(true);
    expect(ids()).toEqual(['a', 'h', 'k']);
  });
});

describe('書式按鈕（F304、F306、F315）', () => {
  it('段落裡選取著時：不能放進段落裡的書式不改', async () => {
    load([B('a', 'desc', 'a', { kids: [B('k', 'desc', 'k')] })]);
    select(['k']);
    await changeSelected('h2');
    expect(findBlock(doc(), 'k')?.b.type).toBe('desc');
    expect(ui().status?.text).toBe('標題 2不能放進段落裡。');
    await changeSelected('note');
    expect(findBlock(doc(), 'k')?.b.type).toBe('note');
  });
  it('有文字的段落按不用文字的書式：不改，在下面新增；空的照改', async () => {
    load([B('a', 'desc', '寫了字'), B('b', 'desc', '')]);
    select(['a']);
    await changeSelected('hr');
    expect(doc().blocks.map((b) => b.type)).toEqual(['desc', 'hr', 'desc']);
    expect(ui().sel).toEqual([doc().blocks[1].id]);
    expect(ui().status?.text).toBe('已在下面新增「橫線」（選取的段落沒有改）');
    select(['b']);
    await changeSelected('hr');
    expect(findBlock(doc(), 'b')?.b.type).toBe('hr');
  });
  it('選取的全是文字欄不能打字的段落：不改，在下面新增（文字的書式游標放進去）', async () => {
    const t = makeBlock('table');
    t.id = 't';
    load([t, B('z', 'desc', 'z')]);
    select(['t']);
    await changeSelected('desc');
    expect(doc().blocks.map((b) => b.type)).toEqual(['table', 'desc', 'desc']);
    expect(ui().focusReq?.id).toBe(doc().blocks[1].id);
  });
  it('標題 1 下面按「目錄」：這一章的目錄（不換頁、不問）', async () => {
    load([B('h', 'h1', '第一章'), B('d', 'desc', '本文')]);
    select(['h']);
    await changeSelected('toc');
    const toc = doc().blocks[1];
    expect(doc().blocks.map((b) => b.type)).toEqual(['h1', 'toc', 'desc']);
    expect(toc.toc).toMatchObject({
      scope: 'chapter',
      lb: '本章目錄',
      pick: ['h2', 'h3', 'scene'],
    });
    expect(ui().status?.text).toBe('已在標題 1 之後建立這一章的目錄');
  });
  it('改成不能有裡面的段落的書式：裡面的段落拿到下面', async () => {
    load([B('a', 'desc', '', { kids: [B('k', 'desc', 'k')] })]);
    select(['a']);
    await changeSelected('h3');
    expect(ids()).toEqual(['a', 'k']);
    expect(doc().blocks[0].type).toBe('h3');
  });
  it('只選了一個段落時 Enter：不能打字的段落在下面加空的描述文（下面已經是空的就到那裡）', () => {
    const im = makeBlock('image');
    im.id = 'im';
    load([im, B('e', 'desc', '')]);
    select(['im']);
    expect(enterOnSelected()).toBe(true);
    expect(ids()).toEqual(['im', 'e']);
    expect(ui().focusReq?.id).toBe('e');
    load([im, B('x', 'desc', '有字')]);
    select(['im']);
    enterOnSelected();
    expect(doc().blocks.map((b) => b.type)).toEqual(['image', 'desc', 'desc']);
    select(['x']);
    enterOnSelected();
    expect(ui().focusReq).toMatchObject({ id: 'x', at: -1 });
  });
  it('Esc：段落、頁面圖片的選取與游標全部取消', () => {
    load([B('a', 'desc', 'a')]);
    select(['a']);
    setUi({ focusId: 'a' });
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    clearAll();
    expect(ui().sel).toEqual([]);
    expect(ui().focusId).toBeNull();
    expect(document.activeElement).not.toBe(ta);
    ta.remove();
  });
});

describe('手冊的變數（F307）', () => {
  it('手冊自己的說明優先（沒有時「手冊「題名」的 PC」）；清單記著手冊的 id', () => {
    const h = B('h', 'handout', 'x', {
      ho: { no: 'HO1', ttl: '記者', def: '小姐', note: '扮演記者' },
    });
    const h2 = B('h2', 'handout', 'y', { ho: { no: 'HO2', ttl: '偵探' } });
    const vs = varList({ blocks: [h, h2], vars: [] });
    expect(vs.map((v) => [v.n, v.def, v.note, v.id])).toEqual([
      ['HO1', '小姐', '扮演記者', 'h'],
      ['HO2', '', '手冊「偵探」的 PC', 'h2'],
    ]);
  });
  it('段落裡的手冊、變數也算（allBlocks 走到裡面的段落）', () => {
    const d = docWith([B('a', 'desc', '{HO3}', { kids: [B('k', 'desc', '{KP}')] })]);
    expect(allBlocks(d).map((b) => b.id)).toEqual(['a', 'k']);
    expect(varList(d).map((v) => v.n)).toEqual(['HO3']);
  });
});
