/**
 * 世界地圖產生器：地形的格子與筆刷、海岸線（規格 F01～F05、3.1～3.3）。
 */
import { describe, expect, it } from 'vitest';
import { signedArea } from '@/tools/world-map/model/geometry';
import {
  blankCells,
  brushBox,
  brushStroke,
  decodeCells,
  encodeCells,
  fixGround,
  type Grid,
  inferGround,
  paintCell,
  roundedOutline,
  smoothOutline,
  traceOutlines,
} from '@/tools/world-map/model/terrain';
import { CELL } from '@/tools/world-map/model/types';

const COLS = 128;
const ROWS = 80;
const N = COLS * ROWS;

function emptyGrid(): Grid {
  return { cols: COLS, rows: ROWS, terrain: new Uint8Array(N), ground: new Uint8Array(N) };
}

/** 記錄 moveTo／lineTo／quadraticCurveTo 的假路徑 */
function sink() {
  const cmds: (string | number)[][] = [];
  return {
    cmds,
    moveTo: (x: number, y: number) => cmds.push(['M', x, y]),
    lineTo: (x: number, y: number) => cmds.push(['L', x, y]),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
      cmds.push(['Q', cx, cy, x, y]),
    closePath: () => cmds.push(['Z']),
  };
}

describe('格子的字串', () => {
  it('編碼與解碼一致；長度不足補 0、奇怪的字當 0', () => {
    const a = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 1]);
    expect(encodeCells(a)).toBe('01234561');
    expect([...decodeCells('0123456x', 10)]).toEqual([0, 1, 2, 3, 4, 5, 6, 0, 0, 0]);
    expect(blankCells(4)).toBe('0000');
    const big = new Uint8Array(N).map((_, i) => i % 7);
    expect(decodeCells(encodeCells(big), N)).toEqual(big);
  });
});

describe('塗一格的規則（3.2）', () => {
  it('平原連同山林換成平原；森林畫在地表上；沙漠只換地表', () => {
    const g = emptyGrid();
    paintCell(g, 0, 2);
    expect([g.terrain[0], g.ground[0]]).toEqual([2, 1]); // 海上畫森林：地表當平原
    paintCell(g, 0, 5);
    expect([g.terrain[0], g.ground[0]]).toEqual([2, 5]); // 雪原：只換地表，森林留著
    paintCell(g, 0, 'relief');
    expect([g.terrain[0], g.ground[0]]).toEqual([5, 5]); // 只擦山林：回到雪原
    paintCell(g, 0, 3);
    paintCell(g, 0, 1);
    expect([g.terrain[0], g.ground[0]]).toEqual([1, 1]); // 平原：連山一起換
    paintCell(g, 0, 4);
    expect([g.terrain[0], g.ground[0]]).toEqual([4, 4]);
    paintCell(g, 0, 'sea');
    expect([g.terrain[0], g.ground[0]]).toEqual([0, 0]);
    paintCell(g, 1, 'relief');
    expect([g.terrain[1], g.ground[1]]).toEqual([0, 0]); // 海上只擦山林：不變
  });

  it('地表的一致性與推算', () => {
    const t = new Uint8Array([0, 3, 2, 5, 3]);
    expect([...fixGround(t, new Uint8Array([0, 0, 4, 5, 6]))]).toEqual([0, 1, 4, 5, 6]);
    /* 一列：雪原旁邊相連的山林延伸雪原；整片沒有地表的山林是平原 */
    const cols = 5;
    const terrain = new Uint8Array([5, 3, 2, 0, 3]);
    expect([...inferGround(terrain, cols, 1)]).toEqual([5, 5, 5, 0, 1]);
  });
});

describe('筆刷（F05、F06、3.2）', () => {
  it('方格：大小 7 → 8 格（96 px），左上角對齊 24 px', () => {
    const b = brushBox({ x: 500, y: 300 }, 7);
    expect(b.w).toBe(96);
    expect(b.h).toBe(96);
    expect(b.x % 24).toBe(0);
    expect(b.y % 24).toBe(0);
    expect(b.x).toBeLessThanOrEqual(500);
    expect(b.x + b.w).toBeGreaterThan(500);
    expect(brushBox({ x: 10, y: 10 }, 2).w).toBe(24);
    expect(brushBox({ x: 10, y: 10 }, 22).w).toBe(22 * CELL);
  });

  it('方格：一格寬的斜線也是邊相連（只有一個連通塊、海岸線只有一圈）', () => {
    const g = emptyGrid();
    brushStroke(g, { x: 100, y: 100 }, { x: 400, y: 400 }, 2, 1, 'grid');
    const loops = traceOutlines(g.terrain, COLS, ROWS, (v) => v > 0);
    expect(loops.length).toBe(1);
  });

  it('自由：圓形的筆，中心在圓裡的格子才塗', () => {
    const g = emptyGrid();
    brushStroke(g, { x: 300, y: 300 }, { x: 300, y: 300 }, 6, 1, 'free');
    const painted = [...g.terrain].filter((v) => v).length;
    /* 半徑 3 格的圓：約 π × 9 ≈ 28 格 */
    expect(painted).toBeGreaterThan(24);
    expect(painted).toBeLessThan(34);
    expect(g.terrain[25 * COLS + 25]).toBe(1);
    expect(g.terrain[25 * COLS + 29]).toBe(0);
  });

  it('沒有改變時回傳 false；快速移動也不漏格', () => {
    const g = emptyGrid();
    expect(brushStroke(g, { x: 50, y: 50 }, { x: 1400, y: 50 }, 2, 1, 'free')).toBe(true);
    const row = [...g.terrain.slice(4 * COLS, 5 * COLS)];
    expect(row.slice(5, 115).every((v) => v === 1)).toBe(true);
    expect(brushStroke(g, { x: 50, y: 50 }, { x: 1400, y: 50 }, 2, 1, 'free')).toBe(false);
  });
});

describe('海岸線（F07、3.3）', () => {
  it('一格：一圈 4 個角、順時針；湖是反方向的內圈', () => {
    const t = new Uint8Array(N);
    t[0] = 1;
    const [loop] = traceOutlines(t, COLS, ROWS, (v) => v > 0);
    expect(loop).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 12 },
      { x: 0, y: 12 },
    ]);
    const ring = new Uint8Array(N);
    for (let y = 10; y < 15; y++) for (let x = 10; x < 15; x++) ring[y * COLS + x] = 1;
    ring[12 * COLS + 12] = 0;
    const loops = traceOutlines(ring, COLS, ROWS, (v) => v > 0);
    expect(loops.length).toBe(2);
    const areas = loops.map(signedArea).sort((a, b) => a - b);
    expect(areas[0]).toBeLessThan(0);
    expect(areas[1]).toBeGreaterThan(0);
    expect(Math.abs(areas[0])).toBe(144);
  });

  it('兩塊只有一個角相接時分成兩圈', () => {
    const t = new Uint8Array(N);
    t[0] = 1;
    t[COLS + 1] = 1;
    expect(traceOutlines(t, COLS, ROWS, (v) => v > 0).length).toBe(2);
  });

  it('方格・圓角：轉角半徑 ≤ 8 px、拿掉一直線上的點', () => {
    const t = new Uint8Array(N);
    for (let x = 0; x < 6; x++) t[x] = 1; // 72 × 12 的長條
    const s = sink();
    roundedOutline(
      traceOutlines(t, COLS, ROWS, (v) => v > 0),
      s,
    );
    const quads = s.cmds.filter((c) => c[0] === 'Q');
    expect(quads.length).toBe(4);
    /* 短邊 12 → 半徑 6；轉角 (0,0) 的曲線從 (0,6) 到 (6,0) */
    const first = s.cmds[0];
    expect(first).toEqual(['M', 0, 6]);
    expect(quads[0]).toEqual(['Q', 0, 0, 6, 0]);
    const big = new Uint8Array(N);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) big[y * COLS + x] = 1;
    const s2 = sink();
    roundedOutline(
      traceOutlines(big, COLS, ROWS, (v) => v > 0),
      s2,
    );
    expect(s2.cmds[0]).toEqual(['M', 0, 8]);
  });

  it('自由：12 點以上的迴圈平滑（5 點平均＋中點的二次曲線）', () => {
    const t = new Uint8Array(N);
    for (let y = 5; y < 9; y++) for (let x = 5; x < 9; x++) t[y * COLS + x] = 1;
    t[5 * COLS + 9] = 1; // 讓外框超過 12 點
    t[8 * COLS + 4] = 1;
    const loops = traceOutlines(t, COLS, ROWS, (v) => v > 0);
    expect(loops[0].length).toBeGreaterThanOrEqual(12);
    const s = sink();
    smoothOutline(loops, s);
    expect(s.cmds.filter((c) => c[0] === 'Q').length).toBe(loops[0].length);
    expect(s.cmds.at(-1)).toEqual(['Z']);
  });
});
