/**
 * 圖塊地圖產生器：畫的規則（填滿、圖形、大圖塊）、選取的變換、圖層操作、改大小與整張移動（規格 F 項、第 3 節）。
 */
import { describe, expect, it } from 'vitest';
import { type Brush, LayerEdit } from '@/tools/tile-map/model/edit';
import {
  anchorsIn,
  partRect,
  placed,
  placeParts,
  samePlaced,
  turnedSpan,
} from '@/tools/tile-map/model/large';
import {
  addLayer,
  copyLayerName,
  countCropped,
  createMap,
  deleteLayer,
  duplicateLayer,
  MapError,
  moveLayer,
  nextLayerName,
  resizeMap,
  setLayer,
  shiftMap,
  validSize,
} from '@/tools/tile-map/model/map';
import {
  selectInRect,
  selectionBounds,
  transformSelection,
} from '@/tools/tile-map/model/selection';
import { centeredBox, lineCells, shapeCells } from '@/tools/tile-map/model/shapes';
import type { Cell, TileMap } from '@/tools/tile-map/model/types';

const NAMES: [string, string, string] = ['地面', '牆壁', '物件'];
const one: Brush = { t: 'a', r: 0, f: false, span: [1, 1] };
const big = (r: 0 | 1 | 2 | 3 = 0, f = false): Brush => ({ t: 'big', r, f, span: [2, 3] });

/** 一層的內容畫成字（空＝.，其他是圖塊 id 的第一個字） */
function grid(cells: readonly Cell[], w: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += w)
    rows.push(
      cells
        .slice(i, i + w)
        .map((c) => (c ? c.t[0] : '.'))
        .join(''),
    );
  return rows;
}

describe('圖形的格子', () => {
  it('長方形含兩端，外框只留邊', () => {
    expect(shapeCells(1, 1, 3, 2, 'rect')).toHaveLength(6);
    expect(shapeCells(0, 0, 4, 4, 'rect', true)).toHaveLength(16);
  });
  it('直線（Bresenham）', () => {
    expect(lineCells(0, 0, 3, 1)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    expect(shapeCells(0, 0, 0, 3, 'line', true)).toHaveLength(4);
  });
  it('橢圓、菱形、三角形的格數', () => {
    expect(shapeCells(0, 0, 4, 4, 'ellipse')).toHaveLength(21);
    expect(shapeCells(0, 0, 4, 4, 'diamond')).toHaveLength(13);
    /* 三角形尖端朝上：第一列最窄、最後一列最寬 */
    const tri = shapeCells(0, 0, 4, 4, 'triangle');
    const rows = [0, 1, 2, 3, 4].map((y) => tri.filter((c) => c[1] === y).length);
    expect(rows).toEqual([1, 1, 3, 3, 5]);
  });
  it('正圓取短邊、放在範圍中間', () => {
    const c = shapeCells(0, 0, 6, 2, 'circle');
    const xs = c.map((p) => p[0]);
    expect(Math.min(...xs)).toBe(2);
    expect(Math.max(...xs)).toBe(4);
  });
  it('指定大小：以那一格為中心（偶數偏右下）', () => {
    expect(centeredBox(10, 10, 3, 3)).toEqual({ x0: 9, y0: 9, x1: 11, y1: 11 });
    expect(centeredBox(10, 10, 4, 2)).toEqual({ x0: 8, y0: 9, x1: 11, y1: 10 });
  });
});

describe('大圖塊', () => {
  it('來源的一小塊（有間距時跳過間距）', () => {
    const def = { rect: [10, 20, 2 * 16 + 1, 3 * 16 + 2] as const, span: [2, 3] as const, gap: 1 };
    expect(partRect(def, [1, 2])).toEqual([10 + 17, 20 + 34, 16, 16]);
  });
  it('轉向後佔的格數與每一塊的落點', () => {
    expect(turnedSpan([2, 3], 1)).toEqual([3, 2]);
    /* 轉 90°：原本左上那塊到右上 */
    const parts = placeParts([2, 3], 1, false);
    const p00 = parts.find(([sx, sy]) => sx === 0 && sy === 0);
    expect(p00?.slice(2)).toEqual([2, 0]);
    /* 翻轉：左右對調 */
    expect(placeParts([2, 1], 0, true).map((p) => p.slice(2))).toEqual([
      [1, 0],
      [0, 0],
    ]);
  });
  it('範圍裡排大圖塊：從外框左上角起，整個放得下才放', () => {
    const cells: [number, number][] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) cells.push([x, y]);
    expect(anchorsIn(cells, [2, 2])).toEqual([
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ]);
  });
  it('地圖邊緣放不完整的大圖塊略過', () => {
    const e = new LayerEdit(4, 4, new Array<Cell>(16).fill(null));
    expect(e.stamp(3, 0, big())).toBe(false);
    expect(e.stamp(2, 1, big())).toBe(true);
    expect(grid(e.current(), 4)).toEqual(['....', '..bb', '..bb', '..bb']);
  });
  it('擦掉大圖塊的任何一格：整個拿掉；畫一般圖塊蓋上去也一樣', () => {
    const e = new LayerEdit(4, 4, new Array<Cell>(16).fill(null));
    e.stamp(0, 0, big());
    e.set(1, 2, null);
    expect(e.current().every((c) => c === null)).toBe(true);
    e.stamp(0, 0, big());
    e.stamp(1, 1, one);
    expect(grid(e.current(), 4)).toEqual(['....', '.a..', '....', '....']);
  });
  it('拖曳停在同一個位置不重放（同一個大圖塊）', () => {
    const e = new LayerEdit(4, 4, new Array<Cell>(16).fill(null));
    e.stamp(0, 0, big());
    const id = e.at(0, 0)?.i;
    expect(e.stamp(0, 0, big())).toBe(false);
    expect(e.at(1, 2)?.i).toBe(id);
  });
});

describe('畫筆與填滿', () => {
  it('一筆畫只改有變的格子；全部改回原樣時沒有結果', () => {
    const base = new Array<Cell>(9).fill(null);
    const e = new LayerEdit(3, 3, base);
    e.stamp(1, 1, one);
    e.set(1, 1, null);
    expect(e.result()).toBeNull();
    e.stamp(0, 0, one);
    expect(e.result()).not.toBeNull();
    expect(base.every((c) => c === null)).toBe(true);
  });
  it('填滿：同一種、上下左右相連；轉向不同不算同一種', () => {
    const base: Cell[] = new Array<Cell>(16).fill(null);
    for (let y = 0; y < 4; y++) base[y * 4 + 2] = placed('w');
    base[0] = placed('a', 1);
    const e = new LayerEdit(4, 4, base);
    e.fill(1, 1, { t: 'g', r: 0, f: false, span: [1, 1] });
    expect(grid(e.current(), 4)).toEqual(
      ['ggw.', 'ggw.', 'ggw.', 'ggw.'].map((r, i) => (i === 0 ? 'agw.' : r)),
    );
  });
  it('填滿同一個圖塊：沒有變化', () => {
    const base = new Array<Cell>(4).fill(placed('a'));
    const e = new LayerEdit(2, 2, base);
    e.fill(0, 0, one);
    expect(e.result()).toBeNull();
  });
  it('填滿大圖塊：只放整個放得進範圍的位置', () => {
    const e = new LayerEdit(5, 4, new Array<Cell>(20).fill(null));
    e.fill(0, 0, { t: 'big', r: 0, f: false, span: [2, 2] });
    expect(grid(e.current(), 5)).toEqual(['bbbb.', 'bbbb.', 'bbbb.', 'bbbb.']);
    const ids = new Set(
      e
        .current()
        .filter(Boolean)
        .map((c) => c?.i),
    );
    expect(ids.size).toBe(4);
  });
  it('圖形：外框的正方形', () => {
    const e = new LayerEdit(5, 5, new Array<Cell>(25).fill(null));
    e.shape(0, 0, 4, 4, 'rect', true, one);
    expect(grid(e.current(), 5)).toEqual(['aaaaa', 'a...a', 'a...a', 'a...a', 'aaaaa']);
  });
});

function mapWith(rows: string[][]): TileMap {
  const h = rows[0].length;
  const w = rows[0][0].length;
  const m = createMap(Math.max(4, w), Math.max(4, h), 'm', NAMES);
  return {
    ...m,
    layers: m.layers.map((l, li) => {
      const src = rows[li];
      if (!src) return l;
      const cells = l.cells.slice() as Cell[];
      src.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch !== '.') cells[y * m.width + x] = placed(ch);
        });
      });
      return { ...l, cells };
    }),
  };
}

describe('選取', () => {
  const m = mapWith([
    ['a...', '....', '....', '....'],
    ['.b..', '....', '....', '....'],
  ]);
  const both = new Set([m.layers[0].id, m.layers[1].id]);
  it('框選：選中的可編輯圖層上有東西的格子', () => {
    expect(selectInRect(m, both, 0, 0, 3, 3).sort()).toEqual([0, 1]);
    expect(selectInRect(m, new Set([m.layers[1].id]), 0, 0, 3, 3)).toEqual([1]);
    const locked = { ...m, layers: m.layers.map((l, i) => (i === 1 ? { ...l, locked: true } : l)) };
    expect(selectInRect(locked, both, 0, 0, 3, 3)).toEqual([0]);
  });
  it('搬動：兩個圖層一起、一步；跑出地圖時不動並丟錯', () => {
    const r = transformSelection(m, both, [0, 1], 'move', 1, 2);
    expect(grid(r.map.layers[0].cells, 4)).toEqual(['....', '....', '.a..', '....']);
    expect(grid(r.map.layers[1].cells, 4)).toEqual(['....', '....', '..b.', '....']);
    expect(r.selection.sort((a, b) => a - b)).toEqual([9, 10]);
    expect(() => transformSelection(m, both, [0, 1], 'move', -1, 0)).toThrow(MapError);
  });
  it('轉 90°：在外框裡順時針，每一格的轉向 +1', () => {
    const r = transformSelection(m, both, [0, 1], 'rotate');
    /* 外框 2 × 1 → 1 × 2：a 在上、b 在下 */
    expect(grid(r.map.layers[0].cells, 4)[0]).toBe('a...');
    expect(grid(r.map.layers[1].cells, 4)[1]).toBe('b...');
    expect(r.map.layers[0].cells[0]?.r).toBe(1);
  });
  it('翻轉：左右對調，轉向變成反方向、翻轉切換', () => {
    const turned = {
      ...m,
      layers: m.layers.map((l, i) =>
        i === 0 ? { ...l, cells: l.cells.map((c, j) => (j === 0 ? placed('a', 1) : c)) } : l,
      ),
    };
    const r = transformSelection(turned, both, [0, 1], 'flip');
    expect(r.map.layers[0].cells[1]).toMatchObject({ t: 'a', r: 3, f: true });
    expect(r.map.layers[1].cells[0]).toMatchObject({ t: 'b', r: 0, f: true });
  });
  it('刪除；沒有可以編輯的圖層丟錯', () => {
    const r = transformSelection(m, both, [0, 1], 'delete');
    expect(r.map.layers.every((l) => l.cells.every((c) => c === null))).toBe(true);
    const hidden = { ...m, layers: m.layers.map((l) => ({ ...l, visible: false })) };
    expect(() => transformSelection(hidden, both, [0], 'delete')).toThrow(MapError);
  });
  it('選到大圖塊的一格就整個選進來', () => {
    const e = new LayerEdit(4, 4, m.layers[2].cells);
    e.stamp(1, 1, big());
    const withBig = {
      ...m,
      layers: m.layers.map((l, i) => (i === 2 ? { ...l, cells: e.current() } : l)),
    };
    const sel = selectInRect(withBig, new Set([withBig.layers[2].id]), 1, 1, 1, 1);
    expect(sel).toHaveLength(6);
    expect(selectionBounds(4, 4, sel)).toEqual({ x: 1, y: 1, width: 2, height: 3 });
  });
});

describe('圖層', () => {
  const m = createMap(4, 4, 'm', NAMES);
  it('新增：放在最上面，名字「圖層 N」找沒用過的', () => {
    const name = nextLayerName(m, (n) => `圖層 ${n}`);
    expect(name).toBe('圖層 4');
    const r = addLayer(m, name);
    expect(r.map.layers.at(-1)?.name).toBe('圖層 4');
    expect(nextLayerName(r.map, (n) => `圖層 ${n}`)).toBe('圖層 5');
  });
  it('最多 12 層、至少 1 層', () => {
    let x = m;
    while (x.layers.length < 12) x = addLayer(x, 'n').map;
    expect(() => addLayer(x, 'n')).toThrow(MapError);
    let y = m;
    y = deleteLayer(y, y.layers[0].id);
    y = deleteLayer(y, y.layers[0].id);
    expect(() => deleteLayer(y, y.layers[0].id)).toThrow(MapError);
  });
  it('複製：放在原本那層的正上方、名字「…的副本」「…的副本 2」', () => {
    const label = (n: string, k: number) => (k === 1 ? `${n} 的副本` : `${n} 的副本 ${k}`);
    const a = duplicateLayer(m, m.layers[0].id, copyLayerName(m, '地面', label));
    expect(a.map.layers.map((l) => l.name)).toEqual(['地面', '地面 的副本', '牆壁', '物件']);
    expect(copyLayerName(a.map, '地面', label)).toBe('地面 的副本 2');
  });
  it('排序、名稱與不透明度的檢查', () => {
    const r = moveLayer(m, m.layers[0].id, 2);
    expect(r.layers.map((l) => l.name)).toEqual(['牆壁', '物件', '地面']);
    expect(() => setLayer(m, m.layers[0].id, { name: '  ' })).toThrow(MapError);
    expect(() => setLayer(m, m.layers[0].id, { opacity: 0.3 as never })).toThrow(MapError);
    expect(setLayer(m, m.layers[0].id, { opacity: 0.5 }).layers[0].opacity).toBe(0.5);
    expect(setLayer(m, m.layers[0].id, { name: '地面' })).toBe(m);
  });
});

describe('地圖大小與整張移動', () => {
  it('每邊 4～200 格、總共最多 40,000 格', () => {
    expect(validSize(4, 200)).toBe(true);
    expect(validSize(200, 200)).toBe(true);
    expect(validSize(3, 10)).toBe(false);
    expect(validSize(201, 4)).toBe(false);
  });
  const m = mapWith([['....', '....', '..ab', '...c']]);
  it('縮小會裁掉圖塊時要允許才裁', () => {
    const tall = mapWith([['....', '....', '..ab', '....', '...c']]);
    expect(countCropped(tall, 4, 5, 0, 0)).toBe(0);
    expect(() => resizeMap(tall, 4, 4)).toThrow(MapError);
    const r = resizeMap(tall, 4, 4, true);
    expect(r.height).toBe(4);
    expect(grid(r.layers[0].cells, 4)).toEqual(['....', '....', '..ab', '....']);
    expect(() => resizeMap(tall, 4, 3, true)).toThrow(MapError);
  });
  it('整張移動：移到外面的格數；允許才裁', () => {
    expect(countCropped(m, 4, 4, 1, 1)).toBe(2);
    try {
      shiftMap(m, 1, 1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MapError);
      expect((e as MapError).count).toBe(2);
    }
    const r = shiftMap(m, -1, -1);
    expect(grid(r.layers[0].cells, 4)).toEqual(['....', '.ab.', '..c.', '....']);
    const moved = shiftMap(m, 1, 1, true).layers[0].cells;
    expect(moved[15]?.t).toBe('a');
    expect(moved.filter(Boolean)).toHaveLength(1);
    expect(samePlaced(moved[0], null)).toBe(true);
  });
});
