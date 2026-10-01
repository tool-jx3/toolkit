/**
 * 戰鬥地圖產生器：格局規則（規格 F12～F16、3.3）。每種地形各 100 個種子。
 */
import { describe, expect, it } from 'vitest';
import {
  CELL,
  COLS,
  countCells,
  FLOOR,
  generateLayout,
  type Layout,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_SEED,
  parseSeedParam,
  ROWS,
  randomSeed,
  roomCenter,
  VOID,
  WALL,
} from '@/tools/battlemap/layout';
import { TERRAIN_IDS } from '@/tools/battlemap/render';

const SEEDS_PER_TERRAIN = 100;
/** 每種地形用不同的種子（格局規則與地形無關，但抽樣要分開） */
const seedsFor = (terrainIndex: number) =>
  Array.from({ length: SEEDS_PER_TERRAIN }, (_, i) => terrainIndex * 7_000_001 + i * 9_973 + 17);

const cell = (l: Layout, x: number, y: number) => l.cells[y * COLS + x];

function isConnected(l: Layout): boolean {
  const floors: number[] = [];
  l.cells.forEach((c, i) => {
    if (c === FLOOR) floors.push(i);
  });
  const seen = new Set([floors[0]]);
  const stack = [floors[0]];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % COLS;
    const y = Math.floor(i / COLS);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (l.cells[j] === FLOOR && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === floors.length;
}

function wallRuleHolds(l: Layout): boolean {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = cell(l, x, y);
      if (c === FLOOR) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && cell(l, nx, ny) === FLOOR)
            near = true;
        }
      if ((c === WALL) !== near) return false;
      if (c !== WALL && c !== VOID) return false;
    }
  }
  return true;
}

function bordersHold(l: Layout): boolean {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = cell(l, x, y);
      /* 最右一欄與最下一列永遠是空無 */
      if ((x === COLS - 1 || y === ROWS - 1) && c !== VOID) return false;
      /* 倒數第二欄／列、最左一欄、最上一列不會有地板 */
      if ((x === COLS - 2 || y === ROWS - 2 || x === 0 || y === 0) && c === FLOOR) return false;
    }
  }
  return true;
}

const median = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** 規格 3.3 的舊版中位數 */
const OLD_FLOOR_MEDIAN = { dungeon: 116, cave: 109, crypt: 115 };

describe('格局', () => {
  it('尺寸：22 × 16 格、每格 70 px（1540 × 1120）', () => {
    expect([COLS, ROWS, CELL, MAP_WIDTH, MAP_HEIGHT]).toEqual([22, 16, 70, 1540, 1120]);
  });

  TERRAIN_IDS.forEach((terrain, ti) => {
    it(`${terrain}：${SEEDS_PER_TERRAIN} 張地圖的房間、走道、牆、邊界、連通性`, () => {
      const floors: number[] = [];
      const roomCounts = new Map<number, number>();
      for (const seed of seedsFor(ti)) {
        const l = generateLayout(seed);
        /* 房間 5～8 間，每邊 3～5 格，不重疊也不相貼 */
        expect(l.rooms.length).toBeGreaterThanOrEqual(5);
        expect(l.rooms.length).toBeLessThanOrEqual(8);
        roomCounts.set(l.rooms.length, (roomCounts.get(l.rooms.length) ?? 0) + 1);
        for (const r of l.rooms) {
          expect(r.w).toBeGreaterThanOrEqual(3);
          expect(r.w).toBeLessThanOrEqual(5);
          expect(r.h).toBeGreaterThanOrEqual(3);
          expect(r.h).toBeLessThanOrEqual(5);
          for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++) expect(cell(l, x, y)).toBe(FLOOR);
        }
        l.rooms.forEach((a, i) => {
          l.rooms.slice(i + 1).forEach((b) => {
            const apart = a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;
            expect(apart, `房間相貼或重疊（種子 ${seed}）`).toBe(true);
          });
        });
        /* N 個房間 N−1 段走道，沿房間正中那一列／欄，最多一個轉角 */
        expect(l.corridors).toHaveLength(l.rooms.length - 1);
        l.corridors.forEach((c, i) => {
          expect(c.from).toEqual(roomCenter(l.rooms[i]));
          expect(c.to).toEqual(roomCenter(l.rooms[i + 1]));
          const corner = c.horizontalFirst
            ? { x: c.to.x, y: c.from.y }
            : { x: c.from.x, y: c.to.y };
          for (const [p, q] of [
            [c.from, corner],
            [corner, c.to],
          ]) {
            for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++)
              for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++)
                expect(cell(l, x, y)).toBe(FLOOR);
          }
        });
        /* 地板＝房間＋走道，沒有其他地板 */
        const expected = new Uint8Array(COLS * ROWS);
        for (const r of l.rooms)
          for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++) expected[y * COLS + x] = 1;
        for (const c of l.corridors) {
          const corner = c.horizontalFirst
            ? { x: c.to.x, y: c.from.y }
            : { x: c.from.x, y: c.to.y };
          for (const [p, q] of [
            [c.from, corner],
            [corner, c.to],
          ])
            for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++)
              for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++)
                expected[y * COLS + x] = 1;
        }
        l.cells.forEach((c, i) => {
          expect(c === FLOOR).toBe(expected[i] === 1);
        });
        expect(wallRuleHolds(l), `牆圈規則（種子 ${seed}）`).toBe(true);
        expect(isConnected(l), `連通性（種子 ${seed}）`).toBe(true);
        expect(bordersHold(l), `邊界規則（種子 ${seed}）`).toBe(true);
        floors.push(countCells(l).floor);
      }
      /* 地板格數的中位數在舊版的 ±15% 以內 */
      const m = median(floors);
      const old = OLD_FLOOR_MEDIAN[terrain];
      expect(m).toBeGreaterThanOrEqual(old * 0.85);
      expect(m).toBeLessThanOrEqual(old * 1.15);
      /* 5～8 間都會出現 */
      expect([...roomCounts.keys()].sort()).toEqual([5, 6, 7, 8]);
    });
  });

  it('同一個種子永遠得到同一個格局；不同種子通常不同', () => {
    for (const seed of [0, 1, 42, 123_456_789, MAX_SEED]) {
      expect(generateLayout(seed)).toEqual(generateLayout(seed));
    }
    expect(generateLayout(1).cells).not.toEqual(generateLayout(2).cells);
  });
});

describe('種子', () => {
  it('新種子是 0～999,999,999 的整數', () => {
    for (let i = 0; i < 200; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(MAX_SEED);
    }
  });

  it('網址參數 ?seed=<整數>（測試用）', () => {
    expect(parseSeedParam('?seed=123')).toBe(123);
    expect(parseSeedParam('?seed=0')).toBe(0);
    expect(parseSeedParam('?seed=999999999')).toBe(MAX_SEED);
    expect(parseSeedParam('')).toBeNull();
    expect(parseSeedParam('?seed=')).toBeNull();
    expect(parseSeedParam('?seed=-1')).toBeNull();
    expect(parseSeedParam('?seed=1.5')).toBeNull();
    expect(parseSeedParam('?seed=1000000000')).toBeNull();
    expect(parseSeedParam('?seed=abc')).toBeNull();
  });
});
