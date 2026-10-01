/**
 * core/path：預設形狀與文字軌跡附件的折線逐點相符、長度、等距取樣、取點與切線、外接框、縮放、反轉；
 * core/typeset 的沿路徑排字。
 */
import { describe, expect, it } from 'vitest';
import {
  appendIfFar,
  closePath,
  cumulativeLengths,
  loopShape,
  type Point,
  pathBounds,
  pathLength,
  pointAtLength,
  presetPath,
  reversePath,
  sampleEvenly,
  scalePath,
  squarePath,
} from '@/core/path';
import { layoutOnPath } from '@/core/typeset';
import examples from '../../../docs/refactor/specs/text-path.examples.json';

const shapes = (examples as unknown as { 預設形狀折線: Record<string, [number, number][]> })
  .預設形狀折線;

const maxDiff = (a: Point[], b: [number, number][]) =>
  Math.max(...a.map((p, i) => Math.max(Math.abs(p.x - b[i][0]), Math.abs(p.y - b[i][1]))));

describe('預設形狀（文字軌跡附件，634 × 300）', () => {
  it.each([
    ['circle', '圓', 126, 750],
    ['spiral', '螺旋', 377, 1140],
    ['heart', '愛心', 126, 766],
  ] as const)('%s：點數、每點相差 ≤ 0.01 px、總長', (shape, name, count, length) => {
    const pts = presetPath(shape, 634, 300);
    expect(pts).toHaveLength(count);
    expect(shapes[name]).toHaveLength(count);
    expect(maxDiff(pts, shapes[name])).toBeLessThanOrEqual(0.01);
    expect(Math.abs(pathLength(pts) - length)).toBeLessThan(length * 0.01);
  });

  it('外接框（規格 3.2 的量測）', () => {
    const c = pathBounds(presetPath('circle', 634, 300));
    expect(c.x).toBeCloseTo(197, 1);
    expect(c.x + c.w).toBeCloseTo(437, 1);
    expect(c.y).toBeCloseTo(30, 1);
    const h = pathBounds(presetPath('heart', 634, 300));
    expect(h.x).toBeCloseTo(197, 0);
    expect(h.y).toBeCloseTo(48.6, 0);
    expect(h.y + h.h).toBeCloseTo(265.5, 0);
    const first = presetPath('heart', 634, 300)[0];
    expect(first.x).toBeCloseTo(317, 3);
    expect(first.y).toBeCloseTo(100.5, 3);
  });
});

describe('長度與取樣', () => {
  const line: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
  ];

  it('累計長度與總長', () => {
    expect(cumulativeLengths(line)).toEqual([0, 10, 30]);
    expect(pathLength(line)).toBe(30);
  });

  it('等距取樣：第一點是起點、最後一點是終點；n＝1 只取起點', () => {
    expect(sampleEvenly(line, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
    ]);
    expect(sampleEvenly(line, 1)).toEqual([{ x: 0, y: 0 }]);
    expect(sampleEvenly([{ x: 3, y: 4 }], 3)).toHaveLength(3);
    expect(sampleEvenly([], 3)).toEqual([]);
  });

  it('取點與切線；轉角上取後面那段的方向；閉合時繞圈', () => {
    const a = pointAtLength(line, 5);
    expect([a.x, a.y, a.angle]).toEqual([5, 0, 0]);
    const corner = pointAtLength(line, 10);
    expect(corner.angle).toBeCloseTo(Math.PI / 2, 10);
    expect(pointAtLength(line, 99)).toMatchObject({ x: 10, y: 20 });
    const sq = squarePath(0, 0, 10);
    expect(pointAtLength(sq, 80 + 5, { closed: true })).toMatchObject({ x: -5, y: -10 });
    expect(pointAtLength(sq, -5, { closed: true })).toMatchObject({ x: -10, y: -5 });
  });

  it('外接框、以中心等比縮放、反轉、閉合、手繪加點', () => {
    expect(pathBounds(line)).toEqual({ x: 0, y: 0, w: 10, h: 20, cx: 5, cy: 10 });
    expect(scalePath(line, 2)).toEqual([
      { x: -5, y: -10 },
      { x: 15, y: -10 },
      { x: 15, y: 30 },
    ]);
    expect(reversePath(line)[0]).toEqual({ x: 10, y: 20 });
    expect(closePath(line)).toHaveLength(4);
    expect(closePath(closePath(line))).toHaveLength(4);
    const pts: Point[] = [];
    expect(appendIfFar(pts, { x: 0, y: 0 })).toBe(true);
    expect(appendIfFar(pts, { x: 1, y: 1 }, 2)).toBe(false);
    expect(appendIfFar(pts, { x: 2, y: 0 }, 2)).toBe(true);
    expect(pts).toHaveLength(2);
  });
});

describe('沿路徑排字', () => {
  it('圓：字身中心在半徑＋offset 上，第一個字在正上方右邊、方向沿切線（順時針）', () => {
    const circle = loopShape('circle', 300, 150, 100);
    const placed = layoutOnPath(circle, [20, 20, 20], { offset: 10 });
    for (const p of placed) expect(Math.hypot(p.x - 300, p.y - 150)).toBeCloseTo(110, 1);
    expect(placed[0].x).toBeGreaterThan(300);
    expect(placed[0].y).toBeLessThan(50);
    expect(Math.abs(placed[0].angle)).toBeLessThan(0.15);
    expect(placed[1].s).toBeCloseTo(30, 6);
  });

  it('方：過了轉角的字直接轉 90°；比一圈長時繞第二圈', () => {
    const sq = loopShape('square', 0, 0, 50);
    const placed = layoutOnPath(sq, [40, 40, 40], { tracking: 0 });
    expect(placed[2].angle).toBeCloseTo(Math.PI / 2, 6);
    const lap = layoutOnPath(sq, [400, 10], {});
    expect(lap[1].s).toBeCloseTo(405, 6);
    expect(lap[1].x).toBeCloseTo(-45, 6);
  });

  it('整體旋轉：位置與角度一起轉', () => {
    const circle = loopShape('circle', 0, 0, 100);
    const [p] = layoutOnPath(circle, [0], { rotate: Math.PI / 2 });
    expect(p.x).toBeCloseTo(100, 3);
    expect(p.y).toBeCloseTo(0, 3);
    /* 圓以 720 段折線近似：切線是那一段弦的方向，與真正的切線最多差 0.25° */
    expect(Math.abs(p.angle - Math.PI / 2)).toBeLessThan(0.005);
  });
});
