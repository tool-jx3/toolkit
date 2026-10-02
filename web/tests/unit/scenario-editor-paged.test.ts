/**
 * 劇本排版台：共用的書頁模組（core/paged）、字型檔（core/fonts 的 TTC 與 fsType）、紙面 HTML（3.2）、字型與圖片的規則。
 */
import { describe, expect, it } from 'vitest';
import {
  extractTtcFace,
  fsTypeRestriction,
  readFontNames,
  readFsType,
  ttcFaceOffsets,
} from '../../src/core/fonts';
import {
  fitZoom,
  MM_PX,
  mmToPt,
  mmToPx,
  PAPER_SIZES,
  paperFileName,
  printDocumentHtml,
  stepZoom,
  ZOOM_STEPS,
} from '../../src/core/paged';
import {
  dataUrlBytes,
  firstFaceOf,
  parseCssColor,
  parseFontFamilies,
} from '../../src/core/paged/pdf';
import { fontFromBytes, ttcFaces, uniqueFontName } from '../../src/tools/scenario-editor/fontFiles';
import { fitSide, keepsPng } from '../../src/tools/scenario-editor/images';
import { newBlock } from '../../src/tools/scenario-editor/model/blocks';
import { blankDoc, makeBlock, normalizeDoc } from '../../src/tools/scenario-editor/model/doc';
import {
  appendixItems,
  blockHtml,
  footHtml,
  type RenderCtx,
  staticPageHtml,
} from '../../src/tools/scenario-editor/render/html';
import { fontCss, PAPER_CSS } from '../../src/tools/scenario-editor/render/paperCss';

/* ---------- 測試用的最小字型檔（name 表＋OS/2 表）與字型集合 ---------- */

function utf16be(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out.push(c >> 8, c & 0xff);
  }
  return out;
}

function nameTable(family: string): number[] {
  const str = utf16be(family);
  const t = [0, 0, 0, 1, 0, 18];
  /* platform 3、encoding 1、en-US、nameID 1（家族名稱） */
  t.push(0, 3, 0, 1, 0x04, 0x09, 0, 1, str.length >> 8, str.length & 0xff, 0, 0);
  return [...t, ...str];
}

function os2Table(fsType: number): number[] {
  const t = new Array(16).fill(0);
  t[8] = fsType >> 8;
  t[9] = fsType & 0xff;
  return t;
}

/** 一個字體的表（offset：表在檔案裡的起點，TTC 時是絕對位置） */
function sfnt(family: string, fsType: number, base = 0): number[] {
  const tables: [string, number[]][] = [
    ['OS/2', os2Table(fsType)],
    ['name', nameTable(family)],
  ];
  const head = [0, 1, 0, 0, 0, tables.length, 0, 32, 0, 1, 0, 0];
  let off = base + 12 + tables.length * 16;
  const recs: number[] = [];
  const body: number[] = [];
  for (const [tag, data] of tables) {
    const padded = [...data, ...new Array((4 - (data.length % 4)) % 4).fill(0)];
    recs.push(...[...tag].map((c) => c.charCodeAt(0)), 0, 0, 0, 0);
    recs.push(off >>> 24, (off >> 16) & 0xff, (off >> 8) & 0xff, off & 0xff);
    recs.push(0, 0, data.length >> 8, data.length & 0xff);
    body.push(...padded);
    off += padded.length;
  }
  return [...head, ...recs, ...body];
}

function ttc(faces: [string, number][]): Uint8Array {
  const headLen = 12 + faces.length * 4;
  const parts: number[][] = [];
  let off = headLen;
  const offs: number[] = [];
  for (const [f, t] of faces) {
    const one = sfnt(f, t, off);
    offs.push(off);
    parts.push(one);
    off += one.length;
  }
  const head = [...'ttcf'].map((c) => c.charCodeAt(0));
  head.push(0, 1, 0, 0, 0, 0, 0, faces.length);
  for (const o of offs) head.push(o >>> 24, (o >> 16) & 0xff, (o >> 8) & 0xff, o & 0xff);
  return new Uint8Array([...head, ...parts.flat()]);
}

describe('core/paged：單位、縮放、檔名', () => {
  it('mm、pt、px', () => {
    expect(MM_PX).toBeCloseTo(3.7795, 4);
    expect(mmToPx(210)).toBeCloseTo(793.7, 1);
    expect(mmToPt(297)).toBeCloseTo(841.89, 2);
    expect(PAPER_SIZES.A4).toEqual({ w: 210, h: 297 });
  });
  it('縮放的階段 25～300％、到頭時 null；配合寬度夾在 15～200％', () => {
    expect(ZOOM_STEPS).toEqual([0.25, 0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3]);
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.8);
    expect(stepZoom(0.9, -1)).toBe(0.8);
    expect(stepZoom(3, 1)).toBeNull();
    expect(fitZoom(397, 210)).toBeCloseTo(0.5, 2);
    expect(fitZoom(10, 210)).toBe(0.15);
    expect(fitZoom(5000, 210)).toBe(2);
  });
  it('檔名', () => {
    expect(paperFileName('a|b', 'html')).toBe('a_b.html');
  });
  it('列印文件：@page A4 無邊界、每頁換頁、body 的 class', () => {
    const html = printDocumentHtml({
      title: '<劇本>',
      css: '.x{}',
      pages: ['<div>1</div>', '<div>2</div>'],
      size: PAPER_SIZES.A4,
      bodyClass: 'pv-print',
    });
    expect(html).toContain('<title>&lt;劇本&gt;</title>');
    expect(html).toContain('@page{size:210mm 297mm;margin:0}');
    expect(html.match(/class="paged-print-page"/g)).toHaveLength(2);
    expect(html).toContain('<body class="pv-print">');
    expect(html).toContain('lang="zh-Hant-TW"');
  });
});

describe('core/paged：PDF 的小工具', () => {
  it('CSS 顏色與字型清單', () => {
    expect(parseCssColor('rgba(168, 51, 31, 0.5)')).toEqual({
      r: 168 / 255,
      g: 51 / 255,
      b: 31 / 255,
      a: 0.5,
    });
    expect(parseCssColor('rgb(0 0 0 / 50%)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseFontFamilies('"Noto Serif TC", \'Yu Mincho\', serif')).toEqual([
      'noto serif tc',
      'yu mincho',
      'serif',
    ]);
  });
  it('data URL → 位元組', () => {
    expect([...dataUrlBytes('data:font/otf;base64,AAEC')]).toEqual([0, 1, 2]);
    expect(new TextDecoder().decode(dataUrlBytes('data:text/plain,a%20b'))).toBe('a b');
  });
});

describe('core/fonts：TTC 與嵌入權限', () => {
  const bytes = ttc([
    ['Alpha Serif', 0],
    ['Beta Sans', 0x0002],
  ]);
  it('TTC 的字體、取出單獨的字型檔、名稱', () => {
    const offs = ttcFaceOffsets(bytes);
    expect(offs).toHaveLength(2);
    const face = extractTtcFace(bytes, offs?.[1] ?? 0);
    expect(ttcFaceOffsets(face)).toBeNull();
    expect(readFontNames(face)?.family).toBe('Beta Sans');
    expect(readFsType(face)).toBe(2);
    expect(readFontNames(firstFaceOf(bytes))?.family).toBe('Alpha Serif');
    expect(ttcFaces(bytes)?.map((f) => f.name)).toEqual(['Alpha Serif', 'Beta Sans']);
  });
  it('多個字體時要選一個；不允許嵌入時提醒', () => {
    expect(() => fontFromBytes(bytes, 'x', [])).toThrow('請選擇');
    const r = fontFromBytes(bytes, 'x', [], 1);
    expect(r.font.name).toBe('Beta Sans');
    expect(r.font.data.startsWith('data:font/otf;base64,')).toBe(true);
    expect(r.warn).toContain('不允許嵌入');
  });
});

describe('字型檔（F225）', () => {
  const bytes = new Uint8Array(sfnt('Gamma Mono', 0x0008));
  it('名稱取字型內的名稱、重名時加「-2」、沒有嵌入限制', () => {
    const r = fontFromBytes(bytes, '檔名', ['Gamma Mono']);
    expect(r.font.name).toBe('Gamma Mono-2');
    expect(r.warn).toBe('');
  });
  it('讀不到名稱時用檔名', () => {
    const r = fontFromBytes(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), '我的字型', []);
    expect(r.font.name).toBe('我的字型');
  });
});

describe('字型與圖片的規則', () => {
  it('fsType 的限制', () => {
    expect(fsTypeRestriction(0x0002)).toBe('restricted');
    expect(fsTypeRestriction(0x0004)).toBe('preview');
    expect(fsTypeRestriction(0x0200)).toBe('bitmap');
    expect(fsTypeRestriction(0x0008)).toBeNull();
  });
  it('字型名稱：去掉副檔名與引號，重名加 -2、-3', () => {
    expect(uniqueFontName('My"Font.ttf', [])).toBe('MyFont');
    expect(uniqueFontName('A', ['A', 'A-2'])).toBe('A-3');
  });
  it('圖片：長邊超過 1600 縮小；PNG、GIF、WebP、SVG 存成 PNG', () => {
    expect(fitSide(3200, 1600)).toEqual({ w: 1600, h: 800 });
    expect(fitSide(800, 600)).toEqual({ w: 800, h: 600 });
    expect(keepsPng('image/webp')).toBe(true);
    expect(keepsPng('image/svg+xml')).toBe(true);
    expect(keepsPng('image/jpeg')).toBe(false);
  });
});

describe('紙面的 HTML（3.2）', () => {
  const doc = blankDoc();
  const ctx: RenderCtx = { doc, edit: false, pageOf: () => 1, total: 3 };
  it('雙欄頁上的全寬段落跨欄、頁首歸零、間距重疊往上拉', () => {
    const h = blockHtml({ ...newBlock('h1', 'A'), id: 'a', cols: 1 }, ctx, {
      cols: 2,
      pull: 0,
      top: true,
    });
    expect(h).toMatch(/^<div class="bp bp-h1 span top" data-id="a">/);
    const d = blockHtml({ ...newBlock('desc', 'B'), id: 'b', ind: 2, mb: 4 }, ctx, {
      cols: 1,
      pull: 2.2,
      top: false,
    });
    expect(d).toContain('class="bp bp-desc i2"');
    expect(d).toContain('style="margin-top:-2.2mm;"');
    expect(d).toContain('style="margin-bottom:4mm;"');
    expect(blockHtml(newBlock('break'), ctx, { cols: 1, pull: 0, top: false })).toBe('');
  });
  it('封面的頁首不歸零（CSS）、換欄只在欄內', () => {
    expect(PAPER_CSS).toContain('.bp.top:not(.bp-cover){padding-top:0}');
    expect(PAPER_CSS).toContain('.bp-cover{padding-top:38mm}');
    expect(blockHtml(makeBlock('colbr'), ctx, { cols: 2, pull: 0, top: true })).toContain(
      'class="bp bp-colbr"',
    );
  });
  it('頁尾：代號與頁碼（第一頁的頁碼）', () => {
    const d = {
      ...doc,
      title: '洋館',
      foot: { num: true, text: '{title}－{page}／{total}', from: 0 },
    };
    expect(footHtml(1, 5, d)).toBe(
      '<div class="pg-foot"><span class="ft">洋館－1／5</span><span class="pn">1</span></div>',
    );
    expect(footHtml(0, 1, { ...d, foot: { num: false, text: '', from: 1 } })).toBe('');
  });
  it('一頁：背景、內距、字級、雙欄', () => {
    const d = normalizeDoc({
      padV: 20,
      padH: 15,
      base: 9,
      pages: [{ cols: 2, bg: { preset: 'bg-paper', img: null, fit: 'cover', opa: 35 } }],
      blocks: [{ id: 'x', type: 'desc', text: 'x' }],
    });
    const byId = new Map(d.blocks.map((b) => [b.id, b]));
    const html = staticPageHtml(0, ['x'], { ...ctx, doc: d, anchors: true }, byId);
    expect(html).toContain('<div class="pg bg-paper" id="p1">');
    expect(html).toContain('class="pg-body cols2" style="padding:20mm 15mm;font-size:9pt"');
  });
  it('附錄：標題 1「附錄」＋每個彈出視窗', () => {
    const d = normalizeDoc({
      blocks: [
        { type: 'popup', pop: { label: '甲', blocks: [{ type: 'desc', text: 'a' }] } },
        { type: 'popup', pop: { label: '空', blocks: [] } },
        { type: 'popup', pop: { label: '乙', body: '舊式的文字' } },
      ],
    });
    const items = appendixItems({ ...ctx, doc: d }, d.blocks);
    expect(items.map((x) => x.type)).toEqual(['h1', 'h2', 'desc', 'h2', 'desc']);
    expect(items[1].html({ cols: 1, pull: 0, top: false })).toContain('甲');
  });
  it('嵌入字型與內文／標題字型的 CSS', () => {
    const css = fontCss({
      fonts: [{ name: 'My"Font', data: 'data:font/otf;base64,AA' }],
      fontBody: 'My"Font',
      fontHead: '',
    });
    expect(css).toContain('@font-face{font-family:"MyFont";src:url("data:font/otf;base64,AA")');
    expect(css).toContain('.pg,.pg .fwc{font-family:"MyFont","Noto Serif TC"');
    expect(css).toContain('.pg .t-h1');
  });
});
