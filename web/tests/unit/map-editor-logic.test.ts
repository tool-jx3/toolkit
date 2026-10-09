/**
 * 地圖編輯器的純函式（web/src/tools/map-editor/）：
 * - 幾何與數值（geometry.ts）：與舊版 `map_editor.js` 的同名函式逐一比對（直接執行舊版的原始碼）；
 * - 舊版存檔的轉換（legacy.ts）：夾具、拿掉的內建貼圖、平頭直線的位置、重複轉換不變；
 * - 格子的填滿（cellLogic.ts）、布林運算（boolLogic.ts）、地圖資料的整理（model.ts）、讀檔（storage.ts）、
 *   自訂素材的名稱（assets.ts）、復原的步驟（engine/history.ts）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapGrid } from '@/core/grid';
import { assetName, userAssetId } from '@/tools/map-editor/assets';
import {
  BOOL_OPS,
  booleanOp,
  CURVE_SAMPLES,
  ELLIPSE_SAMPLES,
  ellipseRing,
  multiPolygonPath,
  pathRings,
} from '@/tools/map-editor/boolLogic';
import { FILL_MAX_CELLS, floodFill, shiftedCells, solidEntry } from '@/tools/map-editor/cellLogic';
import { DECORS } from '@/tools/map-editor/decorCatalog';
import { HISTORY_MAX, History } from '@/tools/map-editor/engine/history';
import {
  bezierPath,
  boxFromPoints,
  closedBezierPath,
  cssToHex8,
  dashArray,
  exportCellDims,
  exportFileName,
  fmtCells,
  gridStyleOfDash,
  joinAlpha,
  labelAngle,
  nextRotateStop,
  rgbaOf,
  roundedPolyPath,
  segmentAngle,
  splitAlpha,
  styleOfDash,
  thumbSize,
} from '@/tools/map-editor/geometry';
import {
  convertMapData,
  fixLegacyLinePosition,
  isLegacyMapData,
  REMOVED_PATTERN_COLORS,
} from '@/tools/map-editor/legacy';
import {
  DEFAULT_MAP_PREFS,
  formatMapDate,
  generateMapId,
  mapJsonFileName,
  newMapData,
  prunePatterns,
  sanitizeMapData,
  sanitizeMapPrefs,
  type UserPattern,
  usedPatternIds,
} from '@/tools/map-editor/model';
import { unwrapMapJson } from '@/tools/map-editor/storage';
import EDITOR_SRC from '../../../tools/trpg-lab/trpg_map_maker/map_editor.js?raw';
import HEX_FIX from '../e2e/fixtures/map-editor/legacy-hex-flat.json';
import SQUARE_FIX from '../e2e/fixtures/map-editor/legacy-square.json';

/* ---------- 舊版的原始碼 ---------- */

/** 從舊版的 map_editor.js 取出一個頂層的 function 或 const（大括號配對），在給定的全域下執行 */
function legacy<T>(name: string, scope: Record<string, unknown> = {}): T {
  const fnAt = EDITOR_SRC.indexOf(`function ${name}(`);
  const constAt = EDITOR_SRC.indexOf(`const ${name} = `);
  const start = fnAt >= 0 ? fnAt : constAt;
  if (start < 0) throw new Error(`舊版沒有 ${name}`);
  const open =
    fnAt >= 0
      ? EDITOR_SRC.indexOf('{', EDITOR_SRC.indexOf(')', start))
      : EDITOR_SRC.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < EDITOR_SRC.length; end++) {
    const ch = EDITOR_SRC[end];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const src = EDITOR_SRC.slice(start, end + 1);
  return new Function(...Object.keys(scope), `${src}\nreturn ${name};`)(
    ...Object.values(scope),
  ) as T;
}

/** 固定的亂數 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const randPts = (r: () => number, n: number) =>
  Array.from({ length: n }, () => ({
    x: Math.round((r() - 0.5) * 800),
    y: Math.round((r() - 0.5) * 800),
  }));

/* ================= 幾何 ================= */

describe('幾何與數值：與舊版相同', () => {
  it('線型的虛線陣列（getDashArray）', () => {
    const L = legacy<(s: string, w: number) => number[] | null>('getDashArray');
    for (const s of ['solid', 'dashed', 'dotted', 'dashdot', 'longdash'] as const)
      for (const w of [0, 1, 3, 4, 12, 20]) expect(dashArray(s, w)).toEqual(L(s, w));
  });

  it('曲線、封閉曲線（buildBezierPath、buildClosedBezierPath）', () => {
    const L1 = legacy<(p: unknown[]) => string>('buildBezierPath');
    const L2 = legacy<(p: unknown[]) => string>('buildClosedBezierPath');
    const r = rng(7);
    for (let n = 0; n <= 7; n++)
      for (let k = 0; k < 5; k++) {
        const pts = randPts(r, n);
        expect(bezierPath(pts)).toBe(L1(pts));
        expect(closedBezierPath(pts)).toBe(L2(pts));
      }
  });

  it('圓角（roundedPolyPath）：折線、多邊形、房間的地面', () => {
    const L =
      legacy<(p: unknown[], c: boolean | 'fill', r: number) => string | null>('roundedPolyPath');
    const r = rng(11);
    for (let n = 2; n <= 7; n++)
      for (const closed of [false, true, 'fill'] as const)
        for (const radius of [0, 5, 20, 500]) {
          const pts = randPts(r, n);
          expect(roundedPolyPath(pts, closed, radius)).toBe(L(pts, closed, radius));
        }
  });

  it('測量的格數（fmtCells）、R 旋轉的角度表（nextRotateStop）、rgba()', () => {
    const fmt = legacy<(px: number) => string>('fmtCells', { App: { cellSize: 72 } });
    for (const px of [0, 1, 35, 36, 71, 72, 75, 108, 143.9, 144.5, 1000])
      expect(fmtCells(px, 72)).toBe(fmt(px));
    const ROTATE_STOPS = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
    const next = legacy<(c: number, r: boolean) => number>('nextRotateStop', { ROTATE_STOPS });
    for (let a = -400; a <= 400; a += 7.5) {
      expect(nextRotateStop(a, false)).toBe(next(a, false));
      expect(nextRotateStop(a, true)).toBe(next(a, true));
    }
    const rgba = legacy<(h: string, a: number) => string>('rgba');
    for (const [h, a] of [
      ['#4a90c4', 1],
      ['#000000', 0.5],
      ['#ffffff', 0],
    ] as const)
      expect(rgbaOf(h, a)).toBe(rgba(h, a));
  });

  it('匯出的格數與檔名（exportCellDims、exportDimSuffix）', () => {
    const r = rng(3);
    for (const gridType of [
      'square',
      'hex-flat',
      'hex-flat-fit',
      'hex-pointy',
      'hex-pointy-fit',
    ] as const) {
      const App = { cellSize: 72, gridType };
      const dims = legacy<(r: { w: number; h: number }) => { n: number; m: number }>(
        'exportCellDims',
        { App },
      );
      const suffix = legacy<(r: { w: number; h: number }) => string>('exportDimSuffix', {
        App,
        exportCellDims: dims,
      });
      for (let i = 0; i < 50; i++) {
        const rect = { w: r() * 2000, h: r() * 2000 };
        expect(exportCellDims(rect, gridType, 72)).toEqual(dims(rect));
        expect(exportFileName(rect, gridType, 72, 'png')).toBe(`trpg-map${suffix(rect)}.png`);
      }
    }
    expect(exportFileName({ w: 576, h: 432 }, 'square', 72, 'png')).toBe('trpg-map_8x6.png');
    expect(exportFileName({ w: 10, h: 10 }, 'square', 72, 'svg')).toBe('trpg-map.svg');
  });

  it('其他：外接框、角度、線型的判斷、色碼、縮圖尺寸', () => {
    expect(boxFromPoints({ x: 10, y: 50 }, { x: 0, y: 0 }, false)).toEqual({
      left: 0,
      top: 0,
      w: 10,
      h: 50,
    });
    expect(boxFromPoints({ x: 0, y: 0 }, { x: 3, y: 4 }, true)).toEqual({
      left: -5,
      top: -5,
      w: 10,
      h: 10,
    });
    expect(segmentAngle(1, 0)).toBe(0);
    expect(segmentAngle(0, -1)).toBe(90);
    expect(segmentAngle(-1, 0)).toBe(180);
    expect(segmentAngle(0, 1)).toBe(270);
    expect(labelAngle(-1, 0)).toBeCloseTo(0);
    expect(labelAngle(0, 1)).toBe(90);
    expect(styleOfDash(null)).toBe('solid');
    expect(styleOfDash([20, 12])).toBe('dashed');
    expect(styleOfDash([4, 8])).toBe('dotted');
    expect(styleOfDash([20, 8, 4, 8])).toBe('dashdot');
    expect(styleOfDash([40, 16])).toBe('longdash');
    expect(gridStyleOfDash([10, 5])).toBe('dashed');
    expect(gridStyleOfDash([2, 4])).toBe('dotted');
    expect(gridStyleOfDash(null)).toBe('solid');
    expect(splitAlpha('#0000008c')).toEqual({ hex: '#000000', alpha: 0.549 });
    expect(joinAlpha('#123456', 0.5)).toBe('#12345680');
    expect(cssToHex8('rgba(74,144,196,0.5)')).toBe('#4a90c480');
    expect(cssToHex8('#abc')).toBe('#aabbccff');
    expect(cssToHex8({})).toBeNull();
    expect(thumbSize(1600, 900)).toEqual({ w: 400, h: 225 });
    expect(thumbSize(100, 50)).toEqual({ w: 100, h: 50 });
    expect(thumbSize(500, 1000)).toEqual({ w: 125, h: 250 });
  });
});

/* ================= 舊版存檔 ================= */

type Json = Record<string, unknown>;

function walk(objs: Json[], fn: (o: Json) => void) {
  for (const o of objs) {
    fn(o);
    if (Array.isArray(o.objects)) walk(o.objects as Json[], fn);
  }
}

describe('舊版存檔的轉換', () => {
  it('方格夾具：型別名稱、版本、上層欄位', () => {
    const raw = (SQUARE_FIX as { data: Json }).data;
    expect(isLegacyMapData(raw)).toBe(true);
    const d = convertMapData(raw);
    expect(d.version).toBe(2);
    expect(d.canvas.version).toBe('7.4.0');
    expect(d.gridType).toBe('square');
    expect(d.wallThickness).toBe(raw.wallThickness);
    expect(d.userPatterns).toHaveLength(1);
    expect(d.decorId).toBe(raw.decorId);
    const types = new Set<string>();
    walk(d.canvas.objects, (o) => {
      types.add(String(o.type));
      expect(o.version === undefined || o.version === '7.4.0').toBe(true);
    });
    for (const t of types) expect(t[0]).toBe(t[0].toUpperCase());
    expect([...types]).toEqual(
      expect.arrayContaining([
        'Rect',
        'Ellipse',
        'Line',
        'Polyline',
        'Path',
        'Group',
        'Textbox',
        'Image',
      ]),
    );
    /* 轉過的再轉一次不變 */
    expect(convertMapData(d)).toEqual(d);
    expect(isLegacyMapData(d)).toBe(false);
  });

  it('平頭的水平線：left 往左半個線寬（中心與舊版相同）', () => {
    const raw = (SQUARE_FIX as { data: { canvas: { objects: Json[] } } }).data;
    const wall = raw.canvas.objects.find((o) => o._layerName === '牆_直線1') as Json;
    expect(fixLegacyLinePosition(wall)).toMatchObject({ left: 930, top: 930 });
    expect(fixLegacyLinePosition({ ...wall, strokeLineCap: 'round' })).toMatchObject({ left: 936 });
    expect(fixLegacyLinePosition({ ...wall, originX: 'center', originY: 'center' })).toMatchObject({
      left: 936,
    });
    /* 垂直線、旋轉 90° 的水平線 */
    const v = fixLegacyLinePosition({
      type: 'line',
      left: 0,
      top: 0,
      width: 0,
      height: 100,
      strokeWidth: 10,
    });
    expect(v).toMatchObject({ left: 0, top: -5 });
    const rot = fixLegacyLinePosition({
      type: 'line',
      left: 0,
      top: 0,
      width: 100,
      height: 0,
      strokeWidth: 10,
      angle: 90,
    });
    expect(rot.left as number).toBeCloseTo(0);
    expect(rot.top as number).toBeCloseTo(-5);
    /* 新版的物件（型別名稱 Line）不動 */
    expect(fixLegacyLinePosition({ ...wall, type: 'Line' })).toMatchObject({ left: 936 });
  });

  it('拿掉的內建貼圖：與舊版 replaceRemovedPatterns 相同', () => {
    const canvas = {
      objects: [
        {
          type: 'rect',
          _patternState: { mode: 'pattern', id: 'grass', solidColor: '#ffffffff' },
          fill: { type: 'pattern', source: 'images/grass.png' },
        },
        {
          type: 'rect',
          _patternState: { mode: 'pattern', id: 'unknown-x', solidColor: '#123456ff' },
          stroke: { type: 'pattern', source: 'data:image/png;base64,AAA' },
        },
        { type: 'rect', fill: { type: 'pattern', source: 'https://example.com/lava.png' } },
        {
          type: 'group',
          objects: [
            { type: 'path', _patternState: { mode: 'pattern', id: 'water' }, fill: '#000' },
          ],
          _cellEntries: [
            { col: 0, row: 0, fillKey: 'pattern:brick', mode: 'pattern', patternId: 'brick' },
            { col: 1, row: 0, fillKey: 'solid:#fff', mode: 'solid', solidColor: '#fff' },
          ],
        },
        { type: 'rect', isPreview: true },
      ],
    };
    const colors = legacy<Record<string, string>>('REMOVED_PATTERN_COLORS');
    expect(REMOVED_PATTERN_COLORS).toEqual(colors);
    const expected = structuredClone(canvas);
    legacy<(c: unknown) => void>('replaceRemovedPatterns', {
      REMOVED_PATTERN_COLORS: colors,
      getPatternDef: () => null,
    })(expected);
    const got = convertMapData({ version: 1, canvas: structuredClone(canvas) }).canvas.objects;
    /* 唯一刻意的差異（F113，7.1）：圖片存在物件裡（data URL）的自訂圖樣，圖樣刪掉之後照舊保留（舊版改成單色） */
    (expected.objects as Json[])[1] = structuredClone(canvas.objects[1] as Json);
    expect(got[1]).toMatchObject({
      _patternState: { mode: 'pattern', id: 'unknown-x' },
      stroke: { type: 'pattern', source: 'data:image/png;base64,AAA' },
    });
    /* 預覽刪掉、型別名稱換掉，其餘與舊版相同 */
    const norm = (list: Json[]): Json[] =>
      list
        .filter((o) => !o.isPreview)
        .map((o) => {
          const c: Json = { ...o, type: String(o.type).toLowerCase() };
          if (Array.isArray(c.objects)) c.objects = norm(c.objects as Json[]);
          return c;
        });
    expect(norm(got)).toEqual(norm(expected.objects as Json[]));
    expect(got[0]).toMatchObject({
      fill: '#4a8c3f',
      _patternState: { mode: 'solid', id: null, solidColor: '#4a8c3f' },
    });
    expect(got[2]).toMatchObject({ fill: '#888888' });
  });

  it('上層欄位：不存在的圖樣選擇改單色、拿掉的格局圖清空、整理', () => {
    const d = convertMapData({
      version: 1,
      gridType: 'hex-pointy',
      groundPattern: { mode: 'pattern', id: 'grass', genreId: 'all', solidColor: '#ffffff' },
      decorId: 'fp-bed',
      wallThickness: 9999,
      gridDashArray: null,
      canvas: { version: '5.3.0', objects: [] },
    });
    expect(d.groundPattern.mode).toBe('solid');
    expect(d.decorId).toBeNull();
    expect(d.wallThickness).toBe(200);
    expect(d.gridDashArray).toBeNull();
    expect(d.gridType).toBe('hex-pointy');
    const hex = convertMapData((HEX_FIX as { data: Json }).data);
    expect(hex.gridType).toBe('hex-flat');
  });
});

/* ================= 格子 ================= */

describe('格子：填滿（F092）', () => {
  const g = mapGrid('square', 72);
  const data = (cells: [number, number, string][]) =>
    new Map(cells.map(([c, r, color]) => [g.cellKey(c, r), solidEntry(c, r, color)]));
  const red = (c: number, r: number) => solidEntry(c, r, 'red');

  it('空的、範圍外、同色、成功（4 鄰、外接框內）', () => {
    expect(floodFill(new Map(), g, 0, 0, red)).toEqual({ ok: false, reason: 'empty' });
    const d = data([
      [0, 0, 'blue'],
      [2, 2, 'blue'],
      [1, 1, 'blue'],
    ]);
    expect(floodFill(d, g, 3, 0, red)).toEqual({ ok: false, reason: 'outside' });
    expect(floodFill(d, g, 0, 0, (c, r) => solidEntry(c, r, 'blue'))).toEqual({
      ok: false,
      reason: 'same',
    });
    /* 空白的 (1,0)、(2,0)、(2,1) 相連；(0,1)、(0,2)、(1,2) 隔著對角，不算 */
    const res = floodFill(d, g, 1, 0, red);
    expect(res).toEqual({ ok: true, count: 3 });
    expect(d.get(g.cellKey(2, 1))?.solidColor).toBe('red');
    expect(d.get(g.cellKey(0, 1))).toBeUndefined();
  });

  it('上限 10000 格', () => {
    const d = data([
      [0, 0, 'blue'],
      [200, 200, 'blue'],
    ]);
    expect(floodFill(d, g, 1, 0, red)).toEqual({ ok: false, reason: 'limit' });
    expect(FILL_MAX_CELLS).toBe(10000);
  });

  it('六角格是 6 鄰；整格移動', () => {
    const h = mapGrid('hex-flat', 72);
    const d = new Map([
      [h.cellKey(0, 0), solidEntry(0, 0, 'blue')],
      [h.cellKey(2, 0), solidEntry(2, 0, 'blue')],
    ]);
    const res = floodFill(d, h, 1, 0, red);
    expect(res.ok).toBe(true);
    const moved = shiftedCells(d, h, 1, -1);
    expect([...moved.keys()].sort()).toEqual(['1,-1', '2,-1', '3,-1'].sort());
  });
});

/* ================= 布林運算 ================= */

describe('布林運算（F170）', () => {
  const sq = (x: number, y: number, s: number): [number, number][] => [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
  ];
  const area = (ring: [number, number][]) => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a / 2);
  };
  const total = (mp: ReturnType<typeof booleanOp>) =>
    mp.reduce(
      (s, poly) =>
        s +
        area(poly[0] as [number, number][]) -
        poly.slice(1).reduce((h, r) => h + area(r as [number, number][]), 0),
      0,
    );

  it('聯集、交集、差集、互斥的面積', () => {
    const a = [sq(0, 0, 10)];
    const b = [sq(5, 5, 10)];
    expect(BOOL_OPS).toEqual(['union', 'intersection', 'difference', 'xor']);
    expect(total(booleanOp('union', [a, b]))).toBeCloseTo(175);
    expect(total(booleanOp('intersection', [a, b]))).toBeCloseTo(25);
    expect(total(booleanOp('difference', [a, b]))).toBeCloseTo(75);
    expect(total(booleanOp('xor', [a, b]))).toBeCloseTo(150);
    expect(booleanOp('intersection', [[sq(0, 0, 1)], [sq(5, 5, 1)]])).toEqual([]);
    /* 洞：大正方形減掉中間的小正方形 → 一個多邊形兩個環 */
    const hole = booleanOp('difference', [[sq(0, 0, 30)], [sq(10, 10, 10)]]);
    expect(hole).toHaveLength(1);
    expect(hole[0]).toHaveLength(2);
    expect(multiPolygonPath(hole).match(/M/g)).toHaveLength(2);
  });

  it('取樣：橢圓 64 點、曲線每段 24 點；少於 3 點的環丟掉', () => {
    const id = (x: number, y: number): [number, number] => [x, y];
    expect(ellipseRing(10, 5, id)).toHaveLength(ELLIPSE_SAMPLES);
    const rings = pathRings(
      [
        ['M', 0, 0],
        ['Q', 10, 0, 10, 10],
        ['C', 10, 20, 0, 20, 0, 10],
        ['Z'],
        ['M', 50, 50],
        ['L', 60, 60],
      ],
      { x: 0, y: 0 },
      id,
    );
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(1 + CURVE_SAMPLES * 2);
  });
});

/* ================= 地圖資料、讀檔、素材 ================= */

describe('地圖資料', () => {
  it('新地圖與預設值（F004）', () => {
    const d = newMapData('hex-flat-fit');
    expect(d).toMatchObject({
      version: 2,
      cellSize: 72,
      gridType: 'hex-flat-fit',
      gridColor: '#535353ff',
      gridLineWidth: 1,
      gridDashArray: [10, 5],
      gridVisible: true,
      nextLayerId: 10,
      viewportTransform: null,
    });
    expect(d.canvas).toEqual({ version: '7.4.0', objects: [] });
    expect(sanitizeMapPrefs({})).toEqual(DEFAULT_MAP_PREFS);
  });

  it('整理：型別不對的換成預設、範圍夾住、網格的虛線（沒有存＝虛線、null＝實線）', () => {
    const p = sanitizeMapPrefs({
      wallThickness: 'x' as unknown as number,
      decorScale: 99,
      gridColor: 'red',
      textFill: '#ABCDEF80',
      groundTool: 'nope' as never,
      gridDashArray: undefined,
    });
    expect(p.wallThickness).toBe(12);
    expect(p.decorScale).toBe(10);
    expect(p.gridColor).toBe('#535353ff');
    expect(p.textFill).toBe('#abcdef');
    expect(p.groundTool).toBe('cell');
    expect(p.gridDashArray).toEqual([10, 5]);
    expect(sanitizeMapPrefs({ gridDashArray: null }).gridDashArray).toBeNull();
    const d = sanitizeMapData({
      viewportTransform: [0, 0, 0, 0, 1, 1],
      gridType: 'tri',
      canvas: { objects: 'x' },
    });
    expect(d.viewportTransform).toBeNull();
    expect(d.gridType).toBe('square');
    expect(d.canvas.objects).toEqual([]);
  });

  it('id、日期、檔名', () => {
    expect(generateMapId(0, () => 0.5)).toBe('0i000');
    expect(generateMapId(Date.UTC(2026, 9, 8), () => 0.5)).toMatch(/^[0-9a-z]{8}[0-9a-z]{4}$/);
    expect(formatMapDate('2026-10-08T07:05:00+08:00')).toMatch(/^2026\/10\/0[78] \d{2}:05$/);
    expect(formatMapDate('nope')).toBe('');
    expect(mapJsonFileName('A/B:C*?"<>|')).toBe('A_B_C______.json');
    expect(mapJsonFileName('')).toBe('map.json');
  });

  it('讀檔：地圖資料、共用專案檔格式、沒有 canvas', () => {
    const map = { canvas: { objects: [] }, gridType: 'square' };
    expect(unwrapMapJson(map)).toBe(map);
    expect(unwrapMapJson({ format: 'trpg-toolkit-project', tool: 'map-editor', data: map })).toBe(
      map,
    );
    expect(unwrapMapJson({ foo: 1 })).toBeNull();
    expect(unwrapMapJson([1])).toBeNull();
    expect(unwrapMapJson(null)).toBeNull();
  });

  it('自訂素材的名稱與 id；內建裝飾 56 個', () => {
    expect(assetName('石板地.png', '圖樣')).toBe('石板地');
    expect(assetName('.png', '圖樣')).toBe('圖樣');
    expect(assetName('a'.repeat(40), '圖樣')).toHaveLength(24);
    expect(userAssetId('user-pat', 0, () => 0.5)).toBe('user-pat-0i');
    expect(DECORS).toHaveLength(56);
    expect(new Set(DECORS.map((d) => d.id)).size).toBe(56);
  });
});

/* ================= 復原 ================= */

describe('復原的步驟（F185、F186）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    let state = 0;
    const log: string[] = [];
    const h = new History({
      snapshot: () => String(state),
      restore: async (s) => {
        state = Number(s);
      },
      changed: (kind, name) => log.push(`${kind}:${name}`),
    });
    h.clear();
    return {
      h,
      log,
      set: (v: number) => {
        state = v;
      },
      get: () => state,
    };
  }

  it('記一步、復原、重做、新的一步清掉重做', async () => {
    const t = setup();
    t.set(1);
    t.h.push('a');
    t.set(2);
    t.h.push('b');
    expect(await t.h.undo()).toBe('b');
    expect(t.get()).toBe(1);
    expect(await t.h.undo()).toBe('a');
    expect(t.get()).toBe(0);
    expect(await t.h.undo()).toBeNull();
    expect(await t.h.redo()).toBe('a');
    expect(t.get()).toBe(1);
    t.set(5);
    t.h.push('c');
    expect(t.h.canRedo).toBe(false);
  });

  it('最多 50 步；連續的同名修改 0.5 秒合成一步', async () => {
    const t = setup();
    for (let i = 1; i <= 60; i++) {
      t.set(i);
      t.h.push(`s${i}`);
    }
    expect(t.h.size).toBe(HISTORY_MAX);
    for (let i = 0; i < 50; i++) await t.h.undo();
    expect(t.get()).toBe(10);
    const u = setup();
    for (let i = 1; i <= 5; i++) {
      u.set(i);
      u.h.pushDebounced('拖滑桿');
      vi.advanceTimersByTime(100);
    }
    expect(u.h.size).toBe(0);
    vi.advanceTimersByTime(500);
    expect(u.h.size).toBe(1);
    expect(await u.h.undo()).toBe('拖滑桿');
    expect(u.get()).toBe(0);
  });
});

describe('刪掉的自訂圖樣（F113，7.1）', () => {
  const pat = (id: string, removed?: boolean): UserPattern => ({
    id,
    name: id,
    type: 'raster',
    dataUrl: 'data:image/png;base64,AAA',
    color: '#888888',
    scale: 0.5,
    ground: 'user',
    wall: 'user',
    ...(removed ? { removed: true } : {}),
  });
  const canvas = {
    objects: [
      { type: 'rect', _patternState: { mode: 'pattern', id: 'a' } },
      { type: 'rect', _patternState: { mode: 'solid', id: 'x' } },
      {
        type: 'group',
        objects: [
          {
            type: 'group',
            _cellEntries: [
              { col: 0, row: 0, mode: 'pattern', patternId: 'b' },
              { col: 1, row: 0, mode: 'solid', patternId: 'y' },
            ],
          },
        ],
      },
    ],
  };

  it('用到的圖樣：物件的選擇（只算圖樣模式）、群組裡的格子', () => {
    expect([...usedPatternIds(canvas)].sort()).toEqual(['a', 'b']);
    expect(usedPatternIds(null).size).toBe(0);
  });

  it('儲存時：刪掉而且沒人用的拿掉，刪掉但還有物件用的留著，沒刪的都留著', () => {
    const list = [pat('a', true), pat('b', true), pat('c', true), pat('d')];
    expect(prunePatterns(list, canvas).map((p) => p.id)).toEqual(['a', 'b', 'd']);
    expect(prunePatterns([pat('d')], { objects: [] }).map((p) => p.id)).toEqual(['d']);
  });

  it('讀檔時保留 removed（舊版的存檔沒有這個欄位）', () => {
    const prefs = sanitizeMapPrefs({ userPatterns: [pat('a', true), pat('b')] });
    expect(prefs.userPatterns.map((p) => p.removed ?? false)).toEqual([true, false]);
  });
});
