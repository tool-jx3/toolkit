/**
 * 一群格子的外框（地圖編輯器「同一種填色的格子合成一個形狀」用）：
 * 只留「鄰格不在同一群」的邊，再接成封閉的迴圈。洞是另一個方向的迴圈，用 evenodd 填色就會挖空。
 */
import { type Axial, axialCenter, type HexMetrics, hexCorners, hexEdgeNeighbors } from './hex';
import { SQUARE_EDGE_NEIGHBORS } from './square';
import type { Cell, Point } from './types';

interface Edge {
  from: Point;
  to: Point;
}

/** 浮點數誤差：座標量化到小數 3 位當作同一點 */
const keyOf = (p: Point) => `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;

/** 有方向的邊接成封閉迴圈（每個迴圈至少 3 個點） */
export function linkEdges(edges: readonly Edge[]): Point[][] {
  const byFrom = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = keyOf(e.from);
    const list = byFrom.get(k);
    if (list) list.push(e);
    else byFrom.set(k, [e]);
  }
  const used = new Set<Edge>();
  const loops: Point[][] = [];
  for (const seed of edges) {
    if (used.has(seed)) continue;
    const loop: Point[] = [];
    let cur: Edge | undefined = seed;
    let guard = edges.length + 4;
    while (cur && !used.has(cur) && guard-- > 0) {
      used.add(cur);
      loop.push(cur.from);
      cur = (byFrom.get(keyOf(cur.to)) ?? []).find((e) => !used.has(e));
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** 方格群的外框（像素座標；先以格為單位接邊、最後才乘 size） */
export function squareOutline(cells: readonly Cell[], size: number): Point[][] {
  const set = new Set(cells.map((c) => `${c.col},${c.row}`));
  const unit: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const edges: Edge[] = [];
  for (const { col, row } of cells) {
    for (let i = 0; i < 4; i++) {
      const [nc, nr] = SQUARE_EDGE_NEIGHBORS[i];
      if (set.has(`${col + nc},${row + nr}`)) continue;
      const a = unit[i];
      const b = unit[(i + 1) % 4];
      edges.push({ from: { x: col + a[0], y: row + a[1] }, to: { x: col + b[0], y: row + b[1] } });
    }
  }
  return linkEdges(edges).map((loop) => loop.map((p) => ({ x: p.x * size, y: p.y * size })));
}

/** 六角格群（軸座標）的外框（像素座標） */
export function hexOutline(cells: readonly Axial[], m: HexMetrics): Point[][] {
  const set = new Set(cells.map((c) => `${c.q},${c.r}`));
  const dirs = hexEdgeNeighbors(m.orientation);
  const edges: Edge[] = [];
  for (const { q, r } of cells) {
    const v = hexCorners(axialCenter(q, r, m), m);
    for (let i = 0; i < 6; i++) {
      if (set.has(`${q + dirs[i].q},${r + dirs[i].r}`)) continue;
      edges.push({ from: v[i], to: v[(i + 1) % 6] });
    }
  }
  return linkEdges(edges);
}

/** 迴圈 → SVG path 的 d（每個迴圈 M … L … z） */
export function loopsToSvgPath(loops: readonly (readonly Point[])[]): string {
  return loops.map((loop) => `M ${loop.map((p) => `${p.x} ${p.y}`).join(' L ')} z`).join(' ');
}
