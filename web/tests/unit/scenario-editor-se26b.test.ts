/**
 * 劇本排版台 2026-10 跟進（上游 v3.10～v3.26）第二批：頁面圖片、圖片的寬（％／px）、外框與陰影、markdown、
 * 不分頁的一張、章目錄、PDF 補字失敗時的退路（規格 1.14 F277～F296、3.18、5.3）。
 * 「原作的結果」是在原作 v3.26.0（origin/HEAD 5048f6d）的頁面裡用原作的函式算的
 * （freeToPimg、pimgShapes、pimgBox、cornerPos、imgWmm、imgSetUnit、imgWRange、mdParse、mdDirective）。
 * scenario-editor-upstream-v326-pimg.json 是原作的程式做的原稿（newBlock／normalize、pageImgs、ensureToc(…).scope）。
 */
import { describe, expect, it } from 'vitest';
import { hrefTargetId, parseDropShadow } from '../../src/core/paged/pdf';
import {
  EXPORT_TEXT_FLOW,
  exportHtml,
  flowUpMap,
} from '../../src/tools/scenario-editor/exportHtml';
import { docCharCount } from '../../src/tools/scenario-editor/model/count';
import { blankDoc, makeBlock, normalizeDoc } from '../../src/tools/scenario-editor/model/doc';
import {
  imageWidthMm,
  imageWidthMmOf,
  imageWidthRange,
  setImageWidthUnit,
} from '../../src/tools/scenario-editor/model/image';
import {
  MD_SUGGEST,
  type MdCtx,
  mdDirective,
  mdParse,
  mdSuggest,
} from '../../src/tools/scenario-editor/model/md';
import {
  cleanPimgs,
  cornerPos,
  dropPagesPimgs,
  edgePos,
  freeToPimg,
  pimgBox,
  pimgPage,
  pimgShapes,
  pimgsOn,
} from '../../src/tools/scenario-editor/model/pageImg';
import { BOX_COLORS } from '../../src/tools/scenario-editor/model/proc';
import { guessType, markKey, richKind } from '../../src/tools/scenario-editor/model/rich';
import { chapterIds, tocEntriesFor } from '../../src/tools/scenario-editor/model/toc';
import type { Block, Doc, PageImg } from '../../src/tools/scenario-editor/model/types';
import { OPTIONAL_GLYPHS, tolerantMissingGlyphs } from '../../src/tools/scenario-editor/output';
import {
  imageHtml,
  type RenderCtx,
  shapesHtml,
  staticPageHtml,
  tocHtml,
} from '../../src/tools/scenario-editor/render/html';
import UP_PIMG from '../e2e/fixtures/scenario-editor-upstream-v326-pimg.json';

const D = { padH: 16, padV: 18 };
const P = (o: Partial<PageImg>): PageImg => ({
  id: 'p',
  img: 'x',
  ar: 1,
  cap: '',
  pg: 1,
  x: 0,
  y: 0,
  w: 40,
  wu: 'pct',
  ...o,
});

describe('頁面圖片的資料（3.18.1、F277、F284）', () => {
  it('舊的自由配置（與原作 v3.11～v3.13 的靠角）換成頁面圖片：與原作 freeToPimg 相同', () => {
    const b = (o: Record<string, unknown>) => ({ ...makeBlock('image'), img: 'x', ...o }) as Block;
    expect(freeToPimg(b({ id: 'a', ar: 0.5, pg: 2, w: 40, fx: 20, fy: 30 }), 16, 18)).toEqual({
      id: 'a',
      img: 'x',
      ar: 0.5,
      cap: '',
      pg: 2,
      x: 20,
      y: 30,
      w: 47,
      wu: 'pct',
    });
    expect(
      freeToPimg(
        b({ id: 'b', ar: 0.75, cap: '說明', pg: 1, w: 55, fx: 12.34, fy: 200.06 }),
        20,
        15,
      ),
    ).toMatchObject({ x: 12.3, y: 200.1, w: 68, wu: 'pct' });
    expect(freeToPimg(b({ id: 'c', ar: 1, pg: 3, w: 30, corner: 'br' }), 16, 18)).toMatchObject({
      x: 140.6,
      y: 225.6,
      w: 30,
    });
    expect(
      freeToPimg(b({ id: 'd', ar: 0.6, cap: 'c', w: 25, corner: 'tl' }), 16, 18),
    ).toMatchObject({
      x: 16,
      y: 18,
      w: 25,
    });
    /* 新版：重疊、外框與陰影帶過去 */
    expect(freeToPimg(b({ id: 'e', wrap: 'none', fr: 'thin', sh: 's' }), 16, 18)).toMatchObject({
      wrap: 'none',
      fr: 'thin',
      sh: 's',
    });
  });

  it('外框的大小與位置（收在紙裡、有說明時加 6 mm）、角落、邊：與原作相同', () => {
    expect(pimgBox(P({ x: 300, y: 400, w: 50, ar: 0.5, cap: 'x' }), D)).toEqual({
      x: 121,
      y: 246.5,
      w: 89,
      h: 50.5,
    });
    expect(pimgBox(P({ x: -5, y: 10, wu: 'px', w: 1000, ar: 0.3 }), D)).toEqual({
      x: 0,
      y: 10,
      w: 210,
      h: 63,
    });
    const o = P({ w: 30, ar: 0.5, cap: 'x' });
    expect((['tl', 'tr', 'bl', 'br'] as const).map((c) => cornerPos(o, c, D))).toEqual([
      { x: 16, y: 18 },
      { x: expect.closeTo(140.6), y: 18 },
      { x: 16, y: expect.closeTo(246.3) },
      { x: expect.closeTo(140.6), y: expect.closeTo(246.3) },
    ]);
    /* 一邊（D24）：只改一個方向 */
    const e = P({ x: 50, y: 60, w: 30, ar: 0.5 });
    expect(edgePos(e, 'top', D)).toEqual({ x: 50, y: 18 });
    expect(edgePos(e, 'left', D)).toEqual({ x: 16, y: 60 });
    expect(edgePos(e, 'right', D).x).toBeCloseTo(210 - 16 - 53.4);
    expect(edgePos(e, 'bottom', D).y).toBeCloseTo(297 - 18 - 26.7);
  });

  it('文字的避開框：與原作 pimgShapes 的 HTML 相同（同側被蓋住的不要、雙欄不避開、不分頁是％）', () => {
    const h = (list: PageImg[], cols = 1, flow = false) =>
      shapesHtml(pimgShapes(list, D, cols, flow), flow);
    const div = (side: string, w: string, hh: string) =>
      `<div class="imgshape" aria-hidden="true" style="float:${side};clear:${side};width:${w};height:${hh}"></div>`;
    expect(h([P({ x: 20, y: 30, ar: 0.5 })])).toBe(
      div('left', '0', '10.50mm') + div('left', '78.20mm', '38.60mm'),
    );
    expect(h([P({ x: 120, y: 40, ar: 0.75, gv: 5, gh: 8, cap: 'x' })])).toBe(
      div('right', '0', '17.00mm') + div('right', '82.00mm', '69.40mm'),
    );
    expect(
      h([
        P({ x: 16, y: 60, ar: 1, w: 30 }),
        P({ x: 120, y: 40, ar: 0.5, w: 35 }),
        P({ x: 20, y: 70, ar: 0.5, w: 20 }),
      ]),
    ).toBe(
      div('right', '0', '20.50mm') +
        div('right', '77.00mm', '34.15mm') +
        div('left', '0', '20.00mm') +
        div('left', '56.40mm', '56.40mm'),
    );
    expect(h([P({ x: 0, y: 30, w: 5 }), P({ x: 197, y: 30, w: 5 })])).toBe('');
    expect(h([P({ x: 20, y: 30 })], 2)).toBe('');
    expect(h([P({ x: 150, y: 10, ar: 0.5, w: 60 })], 1, true)).toBe(
      div('right', '0', '0.00mm') + div('right', '61.69%', '54.90mm'),
    );
    expect(h([P({ x: 30, y: 250, ar: 1, w: 40 })])).toBe(
      div('left', '0', '206.30mm') + div('left', '88.20mm', '54.70mm'),
    );
    /* 長寬比不知道、重疊（D25）：不避開 */
    expect(h([P({ x: 20, y: 30, ar: 0 })])).toBe('');
    expect(h([P({ x: 20, y: 30, wrap: 'none' })])).toBe('');
  });

  it('頁：超過總頁數的放在最後一頁；刪除頁面時一起刪、之後的頁號往前移', () => {
    expect(pimgPage(P({ pg: 9 }), 4)).toBe(3);
    expect(pimgPage(P({ pg: 0 }), 4)).toBe(0);
    const d = {
      pageImgs: [
        P({ id: 'a', pg: 1 }),
        P({ id: 'b', pg: 2 }),
        P({ id: 'c', pg: 4 }),
        P({ id: 'd', pg: 9 }),
      ],
    };
    expect(pimgsOn(d, 3, 4).map((o) => o.id)).toEqual(['c', 'd']);
    expect(pimgsOn(d, 3).map((o) => o.id)).toEqual(['c']);
    expect(dropPagesPimgs(d, [1], 4)).toBe(1);
    expect(d.pageImgs.map((o) => [o.id, o.pg])).toEqual([
      ['a', 1],
      ['c', 3],
      ['d', 3],
    ]);
  });

  it('讀入時整理：沒有圖的不要、不認得的外框與顏色去掉、距離收在 0～30', () => {
    const list = cleanPimgs([
      {
        id: 'a',
        img: 'x',
        pg: '2',
        x: '3.5',
        w: 0,
        gv: 50,
        gh: '',
        fr: 'dash',
        frc: 'pink',
        sh: 'm',
      },
      { id: 'b', img: '' },
      null,
      { img: 'y', wu: 'px', w: 120, wrap: 'none', frc: 'kon', fr: 'double' },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      id: 'a',
      img: 'x',
      ar: 0,
      cap: '',
      pg: 2,
      x: 3.5,
      y: 0,
      w: 40,
      wu: 'pct',
      gv: 30,
      sh: 'm',
    });
    expect(list[1]).toMatchObject({ wu: 'px', w: 120, wrap: 'none', frc: 'kon', fr: 'double' });
  });
});

describe('讀入原稿（F284）', () => {
  it('原作 v3.26 的原稿：pageImgs、圖片的 px／外框／陰影、章目錄照讀，再存不會遺失', () => {
    const d = normalizeDoc(UP_PIMG);
    expect(d.pageImgs.map((o) => ({ ...o, img: o.img.slice(0, 22) }))).toEqual(
      (UP_PIMG.pageImgs as PageImg[]).map((o) => ({ ...o, img: o.img.slice(0, 22) })),
    );
    const im = d.blocks.find((b) => b.id === 'im1');
    expect(im).toMatchObject({ w: 250, wu: 'px', fr: 'double', frc: 'kon', sh: 'm', ar: 0.75 });
    expect(d.blocks.find((b) => b.id === 'toc1')?.toc?.scope).toBe('chapter');
    /* 存檔（JSON）後再讀：一樣 */
    const again = normalizeDoc(JSON.parse(JSON.stringify(d)));
    expect(again.pageImgs).toEqual(d.pageImgs);
    expect(again.blocks.find((b) => b.id === 'im1')).toMatchObject({ wu: 'px', fr: 'double' });
  });

  it('v3.9 時的原稿（本站以前存的）：本文的自由配置移到頁面圖片（重疊留著）、彈出視窗裡的改成行內', () => {
    const d = normalizeDoc({
      title: '舊稿',
      padH: 16,
      padV: 18,
      blocks: [
        { id: 'a', type: 'desc', text: '本文' },
        {
          id: 'f1',
          type: 'image',
          img: 'data:,1',
          pos: 'free',
          fx: 20,
          fy: 30,
          pg: 2,
          w: 40,
          ar: 0.5,
          wrap: 'none',
          cap: '地圖',
        },
        { id: 'f2', type: 'image', img: '', pos: 'free', pg: 1 },
        {
          id: 'pp',
          type: 'popup',
          pop: {
            label: '詳細',
            blocks: [{ id: 'f3', type: 'image', img: 'data:,3', pos: 'free', w: 40 }],
          },
        },
      ],
    });
    expect(d.blocks.map((b) => b.id)).toEqual(['a', 'pp']);
    expect(d.pageImgs).toEqual([
      {
        id: 'f1',
        img: 'data:,1',
        ar: 0.5,
        cap: '地圖',
        pg: 2,
        x: 20,
        y: 30,
        w: 47,
        wu: 'pct',
        wrap: 'none',
      },
    ]);
    expect(d.blocks[1].pop?.blocks?.[0]).toMatchObject({ id: 'f3', pos: 'inline', w: 47, cols: 1 });
    /* 只有自由配置的圖片時：本文換成範例原稿 */
    expect(
      normalizeDoc({ blocks: [{ type: 'image', img: 'data:,', pos: 'free' }] }).blocks.length,
    ).toBeGreaterThan(0);
  });

  it('沒有 pageImgs 的原稿（v3.9 以前、本站以前的作品）：空的', () => {
    expect(normalizeDoc({ blocks: [{ type: 'desc', text: 'x' }] }).pageImgs).toEqual([]);
    expect(blankDoc().pageImgs).toEqual([]);
  });

  it('字數算頁面圖片的說明（D30）', () => {
    const d = normalizeDoc({
      blocks: [{ type: 'desc', text: '一二三' }],
      pageImgs: [P({ cap: '四五' })],
    });
    expect(docCharCount(d)).toBe(5);
  });
});

describe('圖片的寬、外框與陰影（3.18.2、F279、F280）', () => {
  it('寬（mm）：與原作 imgWmm 相同', () => {
    const blk = (o: Record<string, unknown>) => ({ ...makeBlock('image'), ...o }) as Block;
    expect(imageWidthMm(blk({ w: 50 }), D)).toBe(89);
    expect(imageWidthMm(blk({ w: 250, wu: 'px' }), D)).toBeCloseTo(66.14583333333333);
    expect(imageWidthMm(blk({ w: 2000, wu: 'px' }), D)).toBe(178);
    expect(imageWidthMmOf({ w: 2000, wu: 'px' }, D, 'page')).toBe(210);
    expect(imageWidthMmOf({ w: 40, wu: 'pct' }, D, 'page')).toBeCloseTo(71.2);
    expect(imageWidthMmOf({}, D, 'block')).toBeCloseTo(124.6);
    expect(imageWidthMmOf({}, D, 'page')).toBeCloseTo(71.2);
  });

  it('換單位：看起來的寬不變（與原作 imgSetUnit 相同）、數字的範圍', () => {
    const u1: { w?: number; wu?: 'pct' | 'px' } = { w: 50 };
    setImageWidthUnit(u1, 'px', D, 'block');
    expect(u1).toEqual({ w: 336, wu: 'px' });
    const u2: { w?: number; wu?: 'pct' | 'px' } = { w: 300, wu: 'px' };
    setImageWidthUnit(u2, 'pct', D, 'block');
    expect(u2).toEqual({ w: 45 });
    const u3: { w?: number; wu?: 'pct' | 'px' } = { w: 40, wu: 'pct' };
    setImageWidthUnit(u3, 'px', D, 'page');
    expect(u3).toEqual({ w: 269, wu: 'px' });
    const u4: { w?: number; wu?: 'pct' | 'px' } = { w: 500, wu: 'px' };
    setImageWidthUnit(u4, 'pct', D, 'page');
    expect(u4).toEqual({ w: 74, wu: 'pct' });
    expect(imageWidthRange({ wu: 'px' }, D, 'block')).toEqual({ min: 10, max: 673 });
    expect(imageWidthRange({ wu: 'px' }, D, 'page')).toEqual({ min: 10, max: 794 });
    expect(imageWidthRange({}, D, 'page')).toEqual({ min: 1, max: 100 });
  });

  it('HTML：長寬比先留好高度、外框是實際的元素、陰影在圖片上', () => {
    expect(imageHtml({ img: 'data:,', ar: 0.75 }, 'width:10mm')).toBe(
      '<img src="data:," style="width:10mm;aspect-ratio:auto 1 / 0.7500" alt="">',
    );
    const h = imageHtml(
      { img: 'data:,', ar: 0.5, fr: 'double', frc: 'kon', sh: 'm', cap: '說明' },
      'width:100%',
    );
    expect(h).toContain(
      '<div class="imgfr" style="width:100%"><img src="data:," class="sh-m" style="aspect-ratio:auto 1 / 0.5000" alt="說明">',
    );
    expect(h).toContain(
      '<span class="imgfr-b" aria-hidden="true" style="border:1.2mm double #1c2b3c"></span>',
    );
    expect(h).toContain('<div class="t-imgcap">說明</div>');
    expect(imageHtml({ img: 'data:,', fr: 'thin' }, 'width:5mm')).toContain(
      'border:.3mm solid #23201c',
    );
    expect(imageHtml({ img: '' }, '')).toContain('t-imgph');
  });

  it('色票多了藏青、青藍（原作 v3.22 起 8 色，順序相同）', () => {
    expect(BOX_COLORS.map((c) => c.k)).toEqual([
      'aka',
      'sumi',
      'kon',
      'nando',
      'ai',
      'koke',
      'kin',
      'hai',
    ]);
    expect(BOX_COLORS.find((c) => c.k === 'kon')?.c).toBe('#1c2b3c');
    expect(BOX_COLORS.find((c) => c.k === 'nando')?.c).toBe('#2f5d73');
  });
});

describe('頁面圖片的輸出（F277）', () => {
  const doc = (): Doc =>
    normalizeDoc({
      padH: 16,
      padV: 18,
      blocks: [
        { id: 'a', type: 'desc', text: '一' },
        { id: 'br', type: 'break' },
        { id: 'b', type: 'desc', text: '二' },
      ],
      pageImgs: [
        P({ id: 'p1', pg: 1, x: 120, y: 40, ar: 0.5 }),
        P({ id: 'p9', pg: 9, x: 30, y: 50, ar: 0.5, cap: '超出' }),
      ],
    });
  const ctx = (d: Doc, total: number): RenderCtx => ({
    doc: d,
    edit: false,
    pageOf: () => 1,
    total,
  });
  it('靜態頁：避開框在本文最前面、圖片在最後；超過總頁數的放在最後一頁', () => {
    const d = doc();
    const by = new Map(d.blocks.map((b) => [b.id, b]));
    const p1 = staticPageHtml(0, ['a'], ctx(d, 2), by);
    expect(p1).toMatch(/<div class="pg-body"[^>]*><div class="imgshape"/);
    expect(p1).toContain('<div class="pimg" style="left:120mm;top:40mm;width:71.2mm">');
    expect(p1.indexOf('class="pimg"')).toBeGreaterThan(p1.indexOf('data-id="a"'));
    expect(p1).not.toContain('超出');
    const p2 = staticPageHtml(1, ['b'], ctx(d, 2), by);
    expect(p2).toContain('超出');
    expect(p2).toContain('class="imgshape"');
  });
});

describe('章目錄（3.18.5、F287）', () => {
  const blocks = normalizeDoc({
    blocks: [
      { id: 'pre', type: 'toc', toc: { scope: 'chapter', pick: ['h1', 'h2'] } },
      { id: 'x0', type: 'h2', text: '序' },
      { id: 'h1a', type: 'h1', text: '第一章' },
      {
        id: 't1',
        type: 'toc',
        toc: { scope: 'chapter', pick: ['h2', 'h3', 'scene'], lb: '本章目錄' },
      },
      { id: 'a1', type: 'h2', text: '一之一' },
      { id: 's1', type: 'scene', text: '前往書房' },
      { id: 'h1b', type: 'h1', text: '第二章' },
      { id: 'b1', type: 'h2', text: '二之一' },
      { id: 'all', type: 'toc' },
    ],
  }).blocks;
  it('範圍：上一個標題 1 的下一段到下一個標題 1 之前（第一個標題 1 之前的是開頭起）', () => {
    expect([...chapterIds(blocks, 't1')]).toEqual(['t1', 'a1', 's1']);
    expect([...chapterIds(blocks, 'pre')]).toEqual(['pre', 'x0']);
    expect([...chapterIds(blocks, 'all')]).toEqual(['b1', 'all']);
  });
  it('收錄的項目與目錄的 HTML', () => {
    const t1 = blocks.find((b) => b.id === 't1') as Block;
    expect(tocEntriesFor(t1, blocks, () => 2).map((e) => e.id)).toEqual(['a1', 's1']);
    const all = blocks.find((b) => b.id === 'all') as Block;
    expect(tocEntriesFor(all, blocks, () => 1).map((e) => e.id)).toEqual([
      'x0',
      'h1a',
      'a1',
      'h1b',
      'b1',
    ]);
    const d = { ...blankDoc(), blocks };
    const html = tocHtml(t1, { doc: d, edit: false, pageOf: () => 3, total: 3 });
    expect(html).toContain('本章目錄');
    expect(html).toContain('href="#ba1"');
    expect(html).toContain('href="#bs1"');
    expect(html).not.toContain('#bb1');
  });
});

describe('markdown（3.18.3、F289～F293）', () => {
  const ctx = (skip: MdCtx['skip'] = []): MdCtx => ({ skip, ho: new Set(), tpls: [] });
  const sum = (bs: Block[]): unknown[] =>
    bs.map((b) => ({
      type: b.type,
      text: b.text,
      ...(b.lb != null ? { lb: b.lb } : {}),
      ...(b.sp ? { sp: b.sp } : {}),
      ...(b.ho ? { ho: [b.ho.no, b.ho.ttl] } : {}),
      ...(b.type === 'proc' ? { col: b.bx?.col } : {}),
      ...(b.pop ? { pop: [b.pop.label, sum(b.pop.blocks ?? [])] } : {}),
      ...(b.type === 'image' ? { img: !!b.img, cap: b.cap } : {}),
    }));
  it('標題、橫線、``` 圍起來的、圖片（與原作相同）', () => {
    const p = (s: string) => {
      const r = mdParse(s, ctx());
      return { marked: r.marked, blocks: sum(r.blocks) };
    };
    expect(
      p('# 第一章\n本文第一段。\n第二行。\n\n## 小節 ##\n#5 不是標題\n#### 小標\n本文'),
    ).toEqual({
      marked: true,
      blocks: [
        { type: 'h1', text: '第一章' },
        { type: 'desc', text: '本文第一段。\n第二行。' },
        { type: 'h2', text: '小節' },
        { type: 'desc', text: '#5 不是標題\n#### 小標\n本文' },
      ],
    });
    expect(p('文字\n---\n下一段\n\n* * *\n\n___').blocks.map((b) => (b as Block).type)).toEqual([
      'desc',
      'hr',
      'desc',
      'hr',
      'hr',
    ]);
    expect(p('```\n# 不是標題\n:::proc\n```\n後面')).toEqual({
      marked: false,
      blocks: [
        { type: 'desc', text: '```\n# 不是標題\n:::proc\n```' },
        { type: 'desc', text: '後面' },
      ],
    });
    expect(
      p('![地圖](data:image/png;base64,AAAA)\n![外部](https://example.com/a.png "t")').blocks,
    ).toEqual([
      { type: 'image', text: '', img: true, cap: '地圖' },
      { type: 'image', text: '', img: false, cap: '外部' },
    ]);
    expect(p(':::foo\n照原文\n:::\n其他')).toEqual({
      marked: false,
      blocks: [
        { type: 'desc', text: ':::foo\n照原文\n:::' },
        { type: 'desc', text: '其他' },
      ],
    });
    expect(p('只有一段，沒有寫法。\n第二行')).toEqual({
      marked: false,
      blocks: [{ type: 'desc', text: '只有一段，沒有寫法。\n第二行' }],
    });
    expect(p('文字\n::pagebreak').blocks.map((b) => (b as Block).type)).toEqual([
      'desc',
      'break',
      'desc',
    ]);
    /* 半形 * 不是注釋（＊ 照樣是） */
    expect(p('* 條列\n＊ 注釋').blocks).toEqual([{ type: 'desc', text: '* 條列\n＊ 注釋' }]);
    expect(p('第一段\n\n※ 第二段').blocks).toEqual([
      { type: 'desc', text: '第一段' },
      { type: 'note', text: '第二段' },
    ]);
  });

  it('::: 與 :: 的書式（範本、標籤、手冊編號、彈出視窗裡再讀一次、全形）', () => {
    const r = mdParse(
      ':::proc[偵查]{tpl=rule}\n〈偵查〉成功時\n:::\n::pagebreak\n:::info[線索]\n情報的內容\n:::\n::scene[前往書房]\n:::handout[密使]{no=HO3}\n你是密使。\n:::\n:::handout[第二]\n內容\n:::\n:::dialog[管家]\n「歡迎」\n:::',
      ctx(),
    );
    expect(r.marked).toBe(true);
    expect(sum(r.blocks)).toEqual([
      { type: 'proc', text: '〈偵查〉成功時', lb: '偵查', col: 'sumi' },
      { type: 'break', text: '' },
      { type: 'info', text: '情報的內容', lb: '線索' },
      { type: 'scene', text: '前往書房' },
      { type: 'handout', text: '你是密使。', ho: ['HO3', '密使'] },
      { type: 'handout', text: '內容', ho: ['HO1', '第二'] },
      { type: 'dialog', text: '「歡迎」', sp: '管家' },
    ]);
    const nest = mdParse(
      '::::popup[詳細]\n# 標題\n:::skill\n內容\n:::\n::pagebreak\n::::\n後面',
      ctx(),
    );
    expect(sum(nest.blocks)).toEqual([
      {
        type: 'popup',
        text: '',
        pop: [
          '詳細',
          [
            { type: 'h1', text: '標題' },
            { type: 'proc', text: '內容', lb: '技能檢定', col: 'aka' },
          ],
        ],
      },
      { type: 'desc', text: '後面' },
    ]);
    const ime = mdParse('：：：情報［標題］\n內容\n：：：\n', ctx());
    expect(sum(ime.blocks)).toEqual([{ type: 'info', text: '內容', lb: '標題' }]);
    const tbl = mdParse(
      ':::table[1d6]\n|1|甲|\n|---|---|\n|2|乙|\n:::\n:::npc[老人]\n備忘\n:::\n:::toc[目次]\n:::\n::colbr',
      ctx(),
    );
    expect(tbl.blocks.map((b) => b.type)).toEqual(['table', 'npc', 'toc', 'colbr']);
    expect(tbl.blocks[0].tbl).toMatchObject({ name: '1d6', rows: 2, ncol: 2 });
    expect(tbl.blocks[1].npc).toMatchObject({ name: '老人', memo: '備忘' });
    expect(tbl.blocks[2].toc?.lb).toBe('目次');
  });

  it('這裡不能放的書式：有文字時留成描述文（儲存格；與原作相同）', () => {
    const r = mdParse(
      '::pagebreak\n:::cover\n封面的字\n:::\n::toc\n# 標題',
      ctx(['break', 'colbr', 'toc', 'cover', 'colophon']),
    );
    expect(sum(r.blocks)).toEqual([
      { type: 'desc', text: '封面的字' },
      { type: 'h1', text: '標題' },
    ]);
  });

  it('一行的寫法（與原作 mdDirective 相同；名稱另外認繁中，D27）', () => {
    expect(mdDirective(':::proc[見出し]{tpl=rule}')).toEqual({
      n: 3,
      k: 'proc',
      tpl: '',
      lb: '見出し',
      at: { tpl: 'rule' },
    });
    expect(mdDirective('：：info［標］')).toEqual({ n: 2, k: 'info', tpl: '', lb: '標', at: {} });
    expect(mdDirective('::pagebreak')).toEqual({ n: 2, k: 'break', tpl: '', lb: null, at: {} });
    expect(mdDirective(':::')).toBeNull();
    expect(mdDirective('::: foo')).toEqual({ n: 3, k: null, tpl: '', lb: null, at: {} });
    expect(mdDirective('x::proc')).toBeNull();
    expect(mdDirective('    :::proc')).toBeNull();
    expect(mdDirective(':::proc{no="HO2" tpl=\'skill\'}')?.at).toEqual({ no: 'HO2', tpl: 'skill' });
    expect(mdDirective('::技能檢定')).toMatchObject({ k: 'proc', tpl: 'skill' });
    expect(mdDirective('::換頁')?.k).toBe('break');
    expect(mdDirective('::NPC卡')?.k).toBe('npc');
    expect(mdDirective('::改ページ')?.k).toBe('break');
  });

  it('候選：:: 與 #（排序、縮小範圍、這裡不能放的不列）', () => {
    expect(mdSuggest('#', [])?.list.map((x) => x.lb)).toEqual(['標題 1', '標題 2', '標題 3']);
    expect(mdSuggest('##', [])?.list.map((x) => x.lb)).toEqual(['標題 2', '標題 3']);
    expect(mdSuggest('#a', [])).toBeNull();
    expect(mdSuggest('::', [])?.list).toHaveLength(MD_SUGGEST.length);
    expect(mdSuggest('::pa', [])?.list.map((x) => x.nm)).toEqual(['pagebreak']);
    expect(
      mdSuggest('::ta', [])
        ?.list.map((x) => x.nm)
        .slice(0, 2),
    ).toEqual(['table', 'dialog']);
    expect(mdSuggest('：：換', [])?.list.map((x) => x.nm)).toEqual([
      'scene',
      'pagebreak',
      'colbreak',
    ]);
    expect(
      mdSuggest('::', ['break', 'colbr', 'toc', 'cover', 'colophon'])?.list.map((x) => x.k),
    ).not.toContain('break');
    expect(mdSuggest(':', [])).toBeNull();
    expect(mdSuggest('a\n::', [])).toBeNull();
    expect(mdSuggest('::zzz', [])).toBeNull();
    expect(MD_SUGGEST.find((x) => x.nm === 'hr')?.cm).toBe('::hr');
    expect(MD_SUGGEST.find((x) => x.nm === 'info')?.cm).toBe(':::info');
  });

  it('巢狀書式：#### 是小標、##### 是小一級的小標（F292）', () => {
    expect(richKind('#### 成功')).toEqual({ k: 'head', ofs: 5 });
    expect(richKind('##### 失敗')).toEqual({ k: 'heads', ofs: 6 });
    expect(richKind('###### 失敗')).toEqual({ k: 'heads', ofs: 7 });
    expect(richKind('### 不是', {})).toEqual({ k: 'p', ofs: 0 });
    expect(richKind('### 標題', { heads: true })).toEqual({ k: 'h', lv: 3, ofs: 4 });
    expect(markKey('#### 小標')).toBe('head');
    expect(markKey('##### 小標')).toBe('heads');
    expect(guessType('# 部')[0]).toBe('desc');
  });
});

describe('不分頁的一張（3.18.4、F285、F286）', () => {
  const d = normalizeDoc({
    title: '流',
    padH: 16,
    padV: 18,
    pages: [
      {
        id: 'p1',
        bg: { preset: 'bg-washi', img: null, fit: 'cover', opa: 35, color: '#f8ece9' },
        cols: 2,
      },
      { id: 'p2', bg: { preset: 'bg-washi', img: null, fit: 'cover', opa: 35 }, cols: 1 },
      { id: 'p3', bg: { preset: 'bg-frame', img: null, fit: 'cover', opa: 35 }, cols: 1 },
    ],
    blocks: [
      { id: 'toc', type: 'toc' },
      { id: 'br0', type: 'break' },
      { id: 'h1a', type: 'h1', text: '第一章' },
      { id: 'tc', type: 'toc', toc: { scope: 'chapter', pick: ['h2'] } },
      { id: 'a', type: 'h2', text: '一之一' },
      {
        id: 'pp',
        type: 'popup',
        pop: { label: '抽屜', blocks: [{ id: 'pc', type: 'desc', text: '日記' }] },
      },
      { id: 'br1', type: 'break' },
      { id: 'h1b', type: 'h1', text: '第二章' },
      { id: 'cb', type: 'colbr' },
    ],
    pageImgs: [P({ id: 'im', pg: 3, x: 120, y: 40, ar: 0.5 })],
  });
  const pages = [['toc'], ['h1a', 'tc', 'a', 'pp'], ['h1b', 'cb']];
  const html = exportHtml({ doc: d, pages, from: 0, to: 2, flow: true });
  it('一張紙：fx、最多頁的花紋、紙色不同時漸層、本文欄寬＝版心寬', () => {
    expect(html).toContain('<body class="tocmask fx">');
    expect(html).toContain(
      '<div class="pg fx-paper bg-washi" style="--paper:#f8ece9" data-grad="1">',
    );
    expect(html).toContain('<div class="pg-body fx-body" style="font-size:10pt;max-width:178mm">');
    expect(html).not.toContain('class="pagebox');
    /* 換頁、換欄不放；每頁開頭記紙色 */
    expect(html).not.toContain('data-id="cb"');
    expect(html.match(/data-pc="[^"]+"/g)).toEqual([
      'data-pc="#f8ece9"',
      'data-pc="#f7f3ea"',
      'data-pc="#f7f3ea"',
    ]);
    /* 頁面圖片：那頁的段落包在 fx-pg，寬是版心寬的％ */
    expect(html).toContain('<div data-pc="#f7f3ea" class="fx-pg" style="min-height:57.6mm">');
    expect(html).toContain('<div class="pimg" style="left:58.43%;top:22mm;width:40%">');
  });
  it('附錄的節、目錄的附錄、↑ 回到目錄的對應（章目錄優先）', () => {
    expect(html).toContain('<section class="fx-appx">');
    expect(html).toContain(`<div class="b t-h1" id="appx">${EXPORT_TEXT_FLOW.appendix}</div>`);
    expect(html).toContain('<div class="fx-pop" id="fxppp">');
    expect(html).toContain(
      `id="apxpp" data-h="抽屜">抽屜<a class="fx-back" href="#" data-back="pp">${EXPORT_TEXT_FLOW.backToBody}</a>`,
    );
    expect(html).toContain('<a class="nv l1" href="#appx">');
    expect(html).toContain('<a class="nv l2" href="#fxppp">');
    expect(html).toContain('<button id="fxBack" type="button">↩ 返回<small></small></button>');
    const pageNo = new Map(pages.flatMap((ids, i) => ids.map((id) => [id, i + 1] as const)));
    const up = flowUpMap(
      d,
      () => true,
      (id) => pageNo.get(id) ?? null,
    );
    expect(up).toEqual({
      h1a: ['toc', EXPORT_TEXT_FLOW.upToc],
      a: ['tc', EXPORT_TEXT_FLOW.upChapter],
      h1b: ['toc', EXPORT_TEXT_FLOW.upToc],
    });
  });
  it('逐頁：沒有 fx；目錄跳到那一頁的開頭的腳本；場景轉換、副標題、目錄也有錨點', () => {
    const paged = exportHtml({ doc: d, pages, from: 0, to: 2 });
    expect(paged).toContain('<body class="tocmask">');
    expect(paged).not.toContain('fx-paper');
    expect(paged).toContain("h.classList.add('pg-hit')");
    expect(paged).toContain('id="btoc"');
    expect(paged).toContain('id="btc"');
  });
});

describe('PDF：補字失敗時的退路（7.5、F296、D34）', () => {
  const fail = async () => {
    const e = new Error('無法下載');
    e.name = 'PdfFontError';
    throw e;
  };
  const req = (text: string) => ({ text, generic: 'serif' as const, weight: 400 });
  it('只缺 ↩：略過（回傳空的）', async () => {
    expect(OPTIONAL_GLYPHS.has('↩')).toBe(true);
    await expect(tolerantMissingGlyphs(fail)(req('↩'))).resolves.toEqual([]);
  });
  it('還缺別的字：照舊失敗；不是字型的錯誤也照舊', async () => {
    await expect(tolerantMissingGlyphs(fail)(req('↩検'))).rejects.toThrow('無法下載');
    await expect(
      tolerantMissingGlyphs(async () => {
        throw new Error('其他');
      })(req('↩')),
    ).rejects.toThrow('其他');
  });
  it('下載成功時照用', async () => {
    const src = [{ family: 'X', weight: 400, load: async () => new Uint8Array() }];
    await expect(tolerantMissingGlyphs(async () => src)(req('↩'))).resolves.toBe(src);
  });
});

describe('PDF 的陰影（core/paged/pdf 的 parseDropShadow）', () => {
  it('瀏覽器算出來的 filter', () => {
    expect(
      parseDropShadow('drop-shadow(rgba(0, 0, 0, 0.2) 1.13386px 1.51181px 3.02362px)'),
    ).toEqual({
      color: 'rgba(0, 0, 0, 0.2)',
      dx: 1.13386,
      dy: 1.51181,
      blur: 3.02362,
    });
    expect(parseDropShadow('drop-shadow(2px 3px 4px black)')).toEqual({
      color: 'black',
      dx: 2,
      dy: 3,
      blur: 4,
    });
    expect(parseDropShadow('none')).toBeNull();
    expect(parseDropShadow('blur(2px)')).toBeNull();
  });
});

describe('第一批對等驗證後的修正（7.5 的 S2～S4、S6）', () => {
  it('S2：PDF 的連結目標 id 解不開（含 %）時用原字串，不會整份失敗', () => {
    expect(hrefTargetId('#b%E6%9B%B8')).toBe('b書');
    expect(hrefTargetId('#bh%1')).toBe('bh%1');
    expect(hrefTargetId('#b%')).toBe('b%');
    expect(hrefTargetId('bx')).toBe('bx');
  });
  it('S3、S4：浮動視窗的內容裡的標題不加錨點（附錄的才有）、沒有內容時視窗標題是「詳細」', () => {
    const d = normalizeDoc({
      blocks: [
        {
          id: 'pp',
          type: 'popup',
          pop: { label: '抽屜', blocks: [{ id: 'pch', type: 'h2', text: '日記' }] },
        },
        { id: 'pe', type: 'popup', pop: { label: '空的', blocks: [] } },
      ],
    });
    const html = exportHtml({ doc: d, pages: [['pp', 'pe']], from: 0, to: 0 });
    expect(html.match(/id="bpch"/g)).toHaveLength(1);
    const pop = html.slice(html.indexOf('<div class="popbody" id="poppp"'));
    expect(pop.slice(0, pop.indexOf('</div></div>'))).not.toContain('id="bpch"');
    expect(html).toContain('"popTitle":"詳細"');
    expect(html).toContain("openWin(pid,document.getElementById('pop'+pid),T.popTitle,pb)");
  });
  it('S6：特殊區塊不認得的顏色、線照原樣留著（畫的時候用預設）', () => {
    const d = normalizeDoc({
      blocks: [
        {
          id: 'p',
          type: 'proc',
          text: 'x',
          bx: { ln: 'wavy', col: 'momo', bar: false, fill: true, sm: false },
        },
      ],
    });
    expect(d.blocks[0].bx).toMatchObject({ ln: 'wavy', col: 'momo' });
    const again = normalizeDoc(JSON.parse(JSON.stringify(d)));
    expect(again.blocks[0].bx?.col).toBe('momo');
    const html = exportHtml({ doc: d, pages: [['p']], from: 0, to: 0 });
    expect(html).toContain('bx-l-dash');
    expect(html).toContain('--bxc:#a8331f');
  });
});
