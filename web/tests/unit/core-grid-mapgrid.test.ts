/**
 * core/grid 的 mapGrid（地圖編輯器的網格種類）：與舊版 `tools/trpg-lab/trpg_map_maker/map_grid.js` 的 GridAdapter
 * 逐點比對（直接在 node:vm 裡執行舊版的檔案）：像素→格、吸附點、鄰格、整格位移；外框、格線、nearestSnap。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  composeMapGridType,
  isMapGridType,
  loopsToSvgPath,
  MAP_GRID_TYPES,
  type MapGridType,
  mapGrid,
  nearestSnap,
  parseMapGridType,
} from '@/core/grid';

interface LegacyAdapter {
  pxToCell(x: number, y: number): { col: number; row: number };
  snapPoints(x: number, y: number): { x: number; y: number; type: string }[];
  cellNeighbors(col: number, row: number): [number, number][];
  snapDelta(
    dx: number,
    dy: number,
  ): { colDelta: number; rowDelta: number; snappedDx: number; snappedDy: number };
}

const LEGACY = path.resolve(__dirname, '../../../tools/trpg-lab/trpg_map_maker/map_grid.js');

function legacyAdapters(cellSize: number): Record<string, LegacyAdapter> {
  const ctx: Record<string, unknown> = { App: { cellSize, gridType: 'square' }, Math, console };
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(LEGACY, 'utf8')}\nthis.__adapters = GridAdapters;`, ctx);
  return ctx.__adapters as Record<string, LegacyAdapter>;
}

/** 固定的亂數（每次測同一組點） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('mapGrid 與舊版 GridAdapter 相同', () => {
  const legacy = legacyAdapters(72);
  for (const type of MAP_GRID_TYPES) {
    it(`${type}：像素→格、吸附點、鄰格、整格位移`, () => {
      const g = mapGrid(type, 72);
      const L = legacy[type];
      const r = rng(type.length * 7919);
      for (let i = 0; i < 400; i++) {
        const x = (r() - 0.5) * 3000;
        const y = (r() - 0.5) * 3000;
        const a = g.cellAt(x, y);
        const b = L.pxToCell(x, y);
        expect([a.col + 0, a.row + 0]).toEqual([b.col + 0, b.row + 0]);
        const sa = g.snapPoints(x, y).map((p) => `${p.type}:${p.x.toFixed(6)},${p.y.toFixed(6)}`);
        const sb = L.snapPoints(x, y).map((p) => `${p.type}:${p.x.toFixed(6)},${p.y.toFixed(6)}`);
        expect(new Set(sa)).toEqual(new Set(sb));
        /* 鄰格：同一組 6 格（尖頂的順序與舊版不同，只影響填滿的走訪順序，結果相同） */
        const na = g.neighbors(a.col, a.row).map((c) => `${c.col},${c.row}`);
        const nb = L.cellNeighbors(a.col, a.row).map(([c, rr]) => `${c},${rr}`);
        expect(new Set(na)).toEqual(new Set(nb));
        const dx = (r() - 0.5) * 600;
        const dy = (r() - 0.5) * 600;
        const da = g.snapDelta(dx, dy);
        const db = L.snapDelta(dx, dy);
        expect([da.colDelta + 0, da.rowDelta + 0]).toEqual([db.colDelta + 0, db.rowDelta + 0]);
        expect(close(da.dx, db.snappedDx) && close(da.dy, db.snappedDy)).toBe(true);
      }
    });
  }
});

describe('mapGrid 其他', () => {
  it('網格種類的組合與解析', () => {
    expect(composeMapGridType('square', 'pointy', true)).toBe('square');
    expect(composeMapGridType('hex', 'flat', false)).toBe('hex-flat');
    expect(composeMapGridType('hex', 'pointy', true)).toBe('hex-pointy-fit');
    expect(parseMapGridType('hex-pointy-fit')).toEqual({
      kind: 'hex',
      orientation: 'pointy',
      fit: true,
    });
    expect(isMapGridType('hex-flat')).toBe(true);
    expect(isMapGridType('triangle')).toBe(false);
    /* 未知的種類當作方格（同舊版） */
    expect(mapGrid('nope' as MapGridType, 72).type).toBe('square');
  });

  it('方格：格子的位置、外框、格線、縮放門檻', () => {
    const g = mapGrid('square', 72);
    expect(g.cellCenter(1, 2)).toEqual({ x: 108, y: 180 });
    expect(g.cellPath(0, 0)).toBe('M 0 0 L 72 0 L 72 72 L 0 72 z');
    /* 2×2 塗滿中間挖一格的 3×3 → 外圈＋洞兩個迴圈 */
    const ring = [];
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 3; r++) if (c !== 1 || r !== 1) ring.push({ col: c, row: r });
    expect(g.outline(ring)).toHaveLength(2);
    expect(loopsToSvgPath(g.outline(ring)).match(/M/g)).toHaveLength(2);
    expect(g.minZoom).toBe(0.25);
    const lines = g.gridLines({ left: 0, top: 0, right: 144, bottom: 72 });
    expect(lines.length).toBeGreaterThan(4);
  });

  it('六角格：中心與舊版的軸座標相同、縮放門檻 0.35', () => {
    const flat = mapGrid('hex-flat', 72);
    /* (0, 0) 格的外接框左上角在原點：平頂的中心＝(W/2, H/2) */
    const c = flat.cellCenter(0, 0);
    expect(close(c.y, 36)).toBe(true);
    expect(flat.cellAt(c.x, c.y)).toEqual({ col: 0, row: 0 });
    const pointy = mapGrid('hex-pointy-fit', 72);
    const p = pointy.cellCenter(2, 1);
    expect(pointy.cellAt(p.x, p.y)).toEqual({ col: 2, row: 1 });
    expect(flat.minZoom).toBe(0.35);
    expect(flat.neighbors(0, 0)).toHaveLength(6);
  });

  it('nearestSnap：門檻內最近、種類可以關', () => {
    const pts = [
      { x: 0, y: 0, type: 'intersection' as const },
      { x: 10, y: 0, type: 'center' as const },
    ];
    const all = { intersection: true, center: true, midpoint: true };
    expect(nearestSnap(pts, 8, 0, 18, all)).toEqual({ x: 10, y: 0 });
    expect(nearestSnap(pts, 8, 0, 18, { ...all, center: false })).toEqual({ x: 0, y: 0 });
    expect(nearestSnap(pts, 40, 0, 18, all)).toBeNull();
    /* 距離剛好等於門檻時不吸附（舊版 d < threshold） */
    expect(nearestSnap(pts, 28, 0, 18, all)).toBeNull();
  });
});
