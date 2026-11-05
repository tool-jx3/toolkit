/**
 * 圖塊地圖產生器：存檔的編碼（專案檔、自動存檔往返）、圖庫（匯入、刪除、收進專案檔帶來的、備份合併、排序）、
 * 圖塊表切格與透明格、列印 PDF 的版面（pt 換算、分頁、上限）與產生出來的 PDF、分段編碼的 PNG、內建圖塊的資料。
 */
import { unzlibSync } from 'fflate';
import { PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { encodePng } from '@/core/encode/png';
import { buildPrintPdf, pageBox } from '@/tools/tile-map/export/pdf';
import { encodePngBands } from '@/tools/tile-map/export/png';
import { CodecError, decodeMap, encodeMap } from '@/tools/tile-map/model/codec';
import { LayerEdit } from '@/tools/tile-map/model/edit';
import { placed } from '@/tools/tile-map/model/large';
import {
  addImport,
  adoptTiles,
  createSet,
  deleteImport,
  deleteSet,
  emptyLibrary,
  libraryTiles,
  mergeLibrary,
  moveInOrder,
  orderedTiles,
  readLibrary,
} from '@/tools/tile-map/model/library';
import { addDefs, createMap, pruneDefs } from '@/tools/tile-map/model/map';
import {
  PrintError,
  type PrintSettings,
  printLayout,
  printPages,
} from '@/tools/tile-map/model/print';
import {
  hasVisiblePixels,
  SheetError,
  sheetEntries,
  sheetGrid,
  toggleGroup,
} from '@/tools/tile-map/model/sheet';
import type { Cell, TileDef, TileMap } from '@/tools/tile-map/model/types';
import { BUILTIN_SETS, builtinTile } from '@/tools/tile-map/tiles/builtin';
import { SCRIBBLE_TILES, TINY_TILES } from '@/tools/tile-map/tiles/kenney';

const NAMES: [string, string, string] = ['地面', '牆壁', '物件'];
const custom: TileDef = {
  id: 'cabc',
  name: '大石',
  src: `a${'1'.repeat(24)}`,
  rect: [0, 0, 33, 16],
  span: [2, 1],
  gap: 1,
  pixel: true,
  set: 'custom-x',
};

function sampleMap(): TileMap {
  const m = createMap(6, 5, '測試', NAMES);
  const e = new LayerEdit(6, 5, m.layers[0].cells);
  e.fill(0, 0, { t: 'kb:grass', r: 0, f: false, span: [1, 1] });
  const e2 = new LayerEdit(6, 5, m.layers[2].cells);
  e2.stamp(1, 1, { t: custom.id, r: 1, f: true, span: [2, 1] });
  e2.stamp(4, 4, { t: 'kt:89', r: 2, f: false, span: [1, 1] });
  const map: TileMap = {
    ...m,
    layers: m.layers.map((l, i) =>
      i === 0
        ? { ...l, cells: e.current() }
        : i === 2
          ? { ...l, cells: e2.current(), opacity: 0.75 }
          : l,
    ),
  };
  return addDefs(map, [custom]);
}

describe('存檔的編碼', () => {
  it('往返：格子（含大圖塊）、圖層屬性、自訂圖塊的定義都一樣', () => {
    const m = sampleMap();
    const enc = JSON.parse(JSON.stringify(encodeMap(m)));
    /* 整層同一個圖塊：一段 */
    expect(enc.layers[0].runs).toEqual([1, 30]);
    const back = decodeMap(enc, builtinTile);
    expect(back.layers.map((l) => [l.name, l.opacity, l.visible, l.locked])).toEqual(
      m.layers.map((l) => [l.name, l.opacity, l.visible, l.locked]),
    );
    for (let li = 0; li < 3; li++) expect(back.layers[li].cells).toEqual(m.layers[li].cells);
    expect(back.defs[custom.id]).toEqual(custom);
  });
  it('不收：大小不對、格數不符、沒有定義的圖塊、壞掉的大圖塊', () => {
    const enc = encodeMap(sampleMap());
    expect(() => decodeMap({ ...enc, width: 3 }, builtinTile)).toThrow(CodecError);
    expect(() =>
      decodeMap({ ...enc, layers: [{ ...enc.layers[0], runs: [1, 29] }] }, builtinTile),
    ).toThrow(CodecError);
    expect(() => decodeMap({ ...enc, defs: [] }, builtinTile)).toThrow(CodecError);
    const bad = structuredClone(enc);
    const k = bad.layers[2].keys.find((x) => x.length === 6);
    if (k) k[4] = 5;
    expect(() => decodeMap(bad, builtinTile)).toThrow(CodecError);
    expect(() => decodeMap({ ...enc, background: 'red' }, builtinTile)).toThrow(CodecError);
  });
  it('存檔前只留用到的自訂定義', () => {
    const m = addDefs(sampleMap(), [{ ...custom, id: 'cunused' }]);
    expect(Object.keys(pruneDefs(m).defs)).toEqual([custom.id]);
  });
});

describe('圖庫', () => {
  const tiles = [
    { name: 'a', src: 'a1', rect: [0, 0, 16, 16] as const, pixel: true },
    { name: 'b', src: 'a1', rect: [16, 0, 16, 16] as const, pixel: true },
  ];
  it('建立、匯入、刪除一次匯入（記成刪過）、刪除整組', () => {
    const { lib, id } = createSet(emptyLibrary(), '我的圖塊');
    const r = addImport(lib, id, '表.png', tiles);
    expect(r.tiles.map((t) => t.set)).toEqual([id, id]);
    expect(libraryTiles(r.lib)).toHaveLength(2);
    const imp = r.lib.sets[0].imports[0].id;
    const d = deleteImport(r.lib, id, imp);
    expect(libraryTiles(d)).toHaveLength(0);
    expect(d.removed).toEqual(expect.arrayContaining(r.tiles.map((t) => t.id)));
    const gone = deleteSet(r.lib, id);
    expect(gone.sets).toHaveLength(0);
    expect(gone.removed).toContain(id);
  });
  it('專案檔帶來的自訂圖塊收進圖庫；刪過的不再加回', () => {
    const src = { defs: [custom], setNames: { 'custom-x': '石頭' }, label: '地圖.zip' };
    const a = adoptTiles(emptyLibrary(), src, (s) => s.startsWith('k'));
    expect(a.added).toBe(1);
    expect(a.lib.sets[0]).toMatchObject({ id: 'custom-x', name: '石頭' });
    expect(adoptTiles(a.lib, src, () => false).added).toBe(0);
    const removed = deleteSet(a.lib, 'custom-x');
    expect(adoptTiles(removed, src, () => false).added).toBe(0);
  });
  it('備份往返與合併', () => {
    const { lib, id } = createSet(emptyLibrary(), '甲');
    const full = addImport(lib, id, 'x', tiles).lib;
    const withOrder = {
      ...full,
      order: { [id]: [libraryTiles(full)[1].id] },
      names: { 'kenney-tiny': '像素' },
      hidden: ['basic'],
    };
    const back = readLibrary(JSON.parse(JSON.stringify(withOrder)));
    expect(back).toEqual(withOrder);
    const merged = mergeLibrary(emptyLibrary(), back);
    expect(merged.added).toBe(2);
    expect(merged.lib.names['kenney-tiny']).toBe('像素');
    expect(mergeLibrary(merged.lib, back).added).toBe(0);
    expect(() => readLibrary({ sets: 'x' })).toThrow(CodecError);
  });
  it('排序：記下的順序、移到某個圖塊的前後', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    expect(orderedTiles(list, ['c', 'zz', 'a']).map((t) => t.id)).toEqual([
      'c',
      'a',
      'b',
      'd',
      'e',
    ]);
    expect(moveInOrder(list, [], ['a', 'b'], 'd', true)).toEqual(['c', 'd', 'a', 'b', 'e']);
    expect(moveInOrder(list, [], ['e'], 'a', false)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(moveInOrder(list, [], ['a'], 'a', false)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('圖塊表', () => {
  it('切得出幾欄幾列（間距、外邊）；不合理的數字丟錯', () => {
    expect(sheetGrid(203, 186, { cw: 16, ch: 16, gap: 1, margin: 0 })).toEqual({
      cols: 12,
      rows: 11,
    });
    expect(sheetGrid(100, 50, { cw: 32, ch: 32, gap: 0, margin: 2 })).toEqual({ cols: 3, rows: 1 });
    expect(() => sheetGrid(10, 10, { cw: 32, ch: 32, gap: 0, margin: 0 })).toThrow(SheetError);
    expect(() => sheetGrid(8192, 8192, { cw: 1, ch: 1, gap: 0, margin: 0 })).toThrow(SheetError);
    expect(() => sheetGrid(64, 64, { cw: 1.5, ch: 2, gap: 0, margin: 0 })).toThrow(SheetError);
  });
  it('框成大圖塊：一個 3 × 3 的大圖塊＋其餘的單格；依位置排序', () => {
    const spec = { cw: 16, ch: 16, gap: 1, margin: 0 };
    const e = sheetEntries(16 * 4 + 3, 16 * 3 + 2, spec, [[1, 0, 3, 3]]);
    expect(e).toHaveLength(1 + 3);
    expect(e[1]).toEqual({ rect: [17, 0, 50, 50], span: [3, 3], gap: 1 });
  });
  it('拖曳框選：重疊的舊大圖塊拿掉；點一下（1 格）＝取消', () => {
    const g = toggleGroup([], { x: 0, y: 0 }, { x: 2, y: 1 });
    expect(g).toEqual([[0, 0, 3, 2]]);
    expect(toggleGroup(g, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(toggleGroup(g, { x: 4, y: 4 }, { x: 5, y: 4 })).toHaveLength(2);
  });
  it('完全透明的格子略過、半透明的保留', () => {
    const w = 4;
    const rgba = new Uint8Array(w * 2 * 4);
    rgba[(1 * w + 3) * 4 + 3] = 1;
    expect(hasVisiblePixels(rgba, w, [0, 0, 2, 2])).toBe(false);
    expect(hasVisiblePixels(rgba, w, [2, 0, 2, 2])).toBe(true);
  });
});

const print = (p: Partial<PrintSettings> = {}): PrintSettings => ({
  cellInches: 1,
  dpi: 150,
  paper: 'a4',
  orientation: 'portrait',
  grid: true,
  background: false,
  ...p,
});

describe('列印的版面', () => {
  it('A4 直式、每格 1 英寸：7 欄 × 10 列；pt 換算', () => {
    const L = printLayout(print(), 30, 20);
    expect(L.pageW).toBeCloseTo((210 / 25.4) * 72, 6);
    expect(L.pageH).toBeCloseTo((297 / 25.4) * 72, 6);
    expect([L.cols, L.rows, L.pagesX, L.pagesY, L.pages]).toEqual([7, 10, 5, 2, 10]);
    expect([L.margin, L.footer, L.cell, L.pixels]).toEqual([36, 18, 72, 150]);
  });
  it('Letter 橫式、每格 0.5 英寸、300 dpi', () => {
    const L = printLayout(
      print({ paper: 'letter', orientation: 'landscape', cellInches: 0.5, dpi: 300 }),
      40,
      30,
    );
    expect([L.pageW, L.pageH]).toEqual([792, 612]);
    expect([L.cols, L.rows, L.pixels]).toEqual([20, 14, 150]);
  });
  it('分頁：先橫向再縱向，最後一頁只到地圖的邊', () => {
    const L = printLayout(print(), 9, 12);
    const pages = printPages(L, 9, 12);
    expect(pages.map((p) => [p.number, p.col, p.row, p.x, p.y, p.width, p.height])).toEqual([
      [1, 1, 1, 0, 0, 7, 10],
      [2, 2, 1, 7, 0, 2, 10],
      [3, 1, 2, 0, 10, 7, 2],
      [4, 2, 2, 7, 10, 2, 2],
    ]);
  });
  it('超過 100 頁、格子太大時丟錯', () => {
    expect(() => printPages(printLayout(print({ cellInches: 2 }), 200, 200), 200, 200)).toThrow(
      PrintError,
    );
    expect(() => printLayout(print({ cellInches: 3 }), 10, 10)).toThrow(PrintError);
  });
});

async function tinyPng(w = 1, h = 1): Promise<Uint8Array> {
  return encodePng(new Uint8Array(w * h * 4).fill(200), w, h);
}

/** 頁面內容（解壓縮）的文字 */
function contentText(doc: PDFDocument, index: number): string {
  const page = doc.getPage(index);
  const contents = page.node.Contents();
  const streams: PDFRawStream[] = [];
  const add = (v: unknown) => {
    const s = doc.context.lookup(v as never);
    if (s instanceof PDFRawStream) streams.push(s);
  };
  if (contents && 'asArray' in contents)
    for (const v of (contents as unknown as { asArray(): unknown[] }).asArray()) add(v);
  else add(page.node.get(page.node.context.obj('Contents') as never) ?? contents);
  if (!streams.length && contents instanceof PDFRawStream) streams.push(contents);
  return streams
    .map((s) => {
      const raw = s.getContents();
      try {
        return new TextDecoder().decode(unzlibSync(raw));
      } catch {
        return new TextDecoder().decode(raw);
      }
    })
    .join('\n');
}

describe('列印用 PDF', () => {
  it('頁數、紙張大小、地圖在左上角留白 0.5 英寸、每格的實際大小、格線', async () => {
    const L = printLayout(print(), 9, 12);
    const pages = printPages(L, 9, 12);
    const bytes = await buildPrintPdf({
      layout: L,
      pages,
      title: '測試地圖',
      subject: '每格 1 英寸',
      grid: true,
      raster: () => tinyPng(),
      footer: () => tinyPng(),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toBe('測試地圖');
    const size = doc.getPage(0).getSize();
    expect(size.width).toBeCloseTo(595.28, 1);
    expect(size.height).toBeCloseTo(841.89, 1);
    /* 第 2 頁：2 × 10 格 → 144 × 720 pt，放在 (36, 頁高 − 36 − 720) */
    const box = pageBox(L, pages[1]);
    expect(box).toEqual({ x: 36, y: L.pageH - 36 - 720, width: 144, height: 720 });
    const text = contentText(doc, 1);
    /* pdf-lib 放圖：先平移到左下角、再放大成圖的大小 */
    const at = /^1 0 0 1 ([\d.]+) ([\d.]+) cm$/m.exec(text);
    const scale = [...text.matchAll(/^([\d.]+) 0 0 ([\d.]+) 0 0 cm$/gm)]
      .map((m) => [Number(m[1]), Number(m[2])])
      .find(([a, b]) => a !== 1 || b !== 1);
    expect(Number(at?.[1])).toBeCloseTo(36, 3);
    expect(Number(at?.[2])).toBeCloseTo(L.pageH - 756, 3);
    expect(scale?.[0]).toBeCloseTo(144, 3);
    expect(scale?.[1]).toBeCloseTo(720, 3);
    /* 格線的第一條直線在第 1 欄與第 2 欄之間：x = 36 + 72 */
    expect(text).toMatch(/^108 [\d.]+ m$/m);
    /* 格線：直線 1 條（2 欄）＋橫線 9 條（10 列），每條 0.5 pt */
    expect((text.match(/^0\.5 w$/gm) ?? []).length).toBe(1 + 9);
  });
});

/** 測試用的 PNG 解碼（只解 RGBA 8 bit、不交錯）：解壓縮後還原濾波 */
function decodeRgbaPng(png: Uint8Array): { width: number; height: number; data: Uint8Array } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const body = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = new DataView(body.buffer, body.byteOffset).getUint32(0);
      height = new DataView(body.buffer, body.byteOffset).getUint32(4);
    } else if (type === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  const all = new Uint8Array(idat.reduce((n, b) => n + b.length, 0));
  let p = 0;
  for (const b of idat) {
    all.set(b, p);
    p += b.length;
  }
  const raw = unzlibSync(all);
  const stride = width * 4;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? out[y * stride + i - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= 4 ? out[(y - 1) * stride + i - 4] : 0;
      let v = x;
      if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + i] = v & 255;
    }
  }
  return { width, height, data: out };
}

describe('分段編碼的 PNG（超過一張畫布的上限時）', () => {
  it('分好幾段編出來的像素和原圖相同（段與段之間的濾波接得上）', async () => {
    const w = 37;
    const h = 53;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < src.length; i++) src[i] = (i * 7 + ((i >> 5) % 13) * 31) & 255;
    for (let x = 0; x < w * 4; x++) src[10 * w * 4 + x] = 0; /* 一列全透明 */
    const png = await encodePngBands(w, h, 8, (y0, bh) => src.slice(y0 * w * 4, (y0 + bh) * w * 4));
    const back = decodeRgbaPng(png);
    expect([back.width, back.height]).toEqual([w, h]);
    expect(back.data.every((v, i) => v === src[i])).toBe(true);
  });
});

describe('內建圖塊', () => {
  it('Scribble 136 張、Tiny 132 張；id 不重複、範圍在圖上', () => {
    expect(SCRIBBLE_TILES).toHaveLength(136);
    expect(TINY_TILES).toHaveLength(132);
    const ids = BUILTIN_SETS.flatMap((s) => s.tiles.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of SCRIBBLE_TILES) {
      expect(t.rect[0] + t.rect[2]).toBeLessThanOrEqual(768);
      expect(t.rect[1] + t.rect[3]).toBeLessThanOrEqual(768);
    }
    for (const t of TINY_TILES) {
      expect(t.rect[0] + t.rect[2]).toBeLessThanOrEqual(203);
      expect(t.rect[1] + t.rect[3]).toBeLessThanOrEqual(186);
    }
    const scribbleRects = new Set(SCRIBBLE_TILES.map((t) => t.rect.join(',')));
    expect(scribbleRects.size).toBe(136);
  });
  it('每一張都有名稱與分類', () => {
    for (const s of BUILTIN_SETS)
      for (const t of s.tiles) {
        expect(t.name.trim()).not.toBe('');
        expect(['floor', 'wall', 'prop', 'character', 'item']).toContain(t.cat);
      }
    expect(builtinTile('ks:floor_planks')?.name).toBe('木板（附地板）');
    expect(builtinTile('kt:89')?.name).toBe('寶箱');
  });
  it('放置：同樣的圖塊、轉向、翻轉共用同一個物件', () => {
    expect(placed('a', 5)).toBe(placed('a', 1));
    const c: Cell = placed('a', -1, true);
    expect(c).toMatchObject({ r: 3, f: true });
  });
});
