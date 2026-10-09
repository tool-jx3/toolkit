/**
 * core/grid 的邊（squareEdgeRuns、subtractSpans）；core/image 的裝置大圖上限（deviceResolutionLimits）。
 */
import { describe, expect, it } from 'vitest';
import { squareEdgeRuns, subtractSpans } from '@/core/grid';
import { deviceResolutionLimits, IOS_RESOLUTION_LIMITS, limitResolution } from '@/core/image';

/** 兩塊：A 佔 (0,0)～(2,2)，B 佔 (2,0)～(3,2)；分類：同一塊＝null、兩塊之間＝in、對外＝out */
const owner = (x: number, y: number) =>
  y < 0 || y >= 2 || x < 0 || x >= 3 ? null : x < 2 ? 'A' : 'B';
const classify = (a: string | null, b: string | null) => (a === b ? null : a && b ? 'in' : 'out');

describe('squareEdgeRuns', () => {
  it('同一條線上相鄰、同種類的邊接成一段，橫線由上到下、直線由左到右', () => {
    const runs = squareEdgeRuns({ x0: 0, y0: 0, x1: 3, y1: 2 }, owner, classify);
    expect(runs).toEqual([
      { o: 'h', c: 0, a: 0, b: 3, kind: 'out' },
      { o: 'h', c: 2, a: 0, b: 3, kind: 'out' },
      { o: 'v', c: 0, a: 0, b: 2, kind: 'out' },
      { o: 'v', c: 2, a: 0, b: 2, kind: 'in' },
      { o: 'v', c: 3, a: 0, b: 2, kind: 'out' },
    ]);
  });

  it('範圍外的格子當作空的（範圍邊上也有外側的邊）', () => {
    const runs = squareEdgeRuns(
      { x0: 0, y0: 0, x1: 2, y1: 1 },
      () => 'X',
      (a, b) => (a === b ? null : 'edge'),
    );
    expect(runs.map((r) => `${r.o}${r.c}:${r.a}-${r.b}`)).toEqual([
      'h0:0-2',
      'h1:0-2',
      'v0:0-1',
      'v2:0-1',
    ]);
  });

  it('種類不同就斷開；中間沒有邊時也斷開', () => {
    const kinds = ['a', 'a', 'b', null, 'b'];
    const runs = squareEdgeRuns(
      { x0: 0, y0: 0, x1: 5, y1: 1 },
      (x) => x,
      (above, below) => (above === null && below !== null ? kinds[below] : null),
    );
    expect(runs.filter((r) => r.o === 'h').map((r) => [r.a, r.b, r.kind])).toEqual([
      [0, 2, 'a'],
      [2, 3, 'b'],
      [4, 5, 'b'],
    ]);
  });
});

describe('subtractSpans', () => {
  it('切掉中間：兩段，切口標 cutA／cutB；其他欄位保留', () => {
    expect(subtractSpans([{ a: 0, b: 10, id: 'w' }], [[3, 4.5]])).toEqual([
      { a: 0, b: 3, id: 'w', cutB: true },
      { a: 4.5, b: 10, id: 'w', cutA: true },
    ]);
  });

  it('切到端點、整段切掉、沒碰到', () => {
    expect(subtractSpans([{ a: 0, b: 4 }], [[0, 1]])).toEqual([{ a: 1, b: 4, cutA: true }]);
    expect(subtractSpans([{ a: 0, b: 4 }], [[-1, 5]])).toEqual([]);
    expect(subtractSpans([{ a: 0, b: 4 }], [[4, 6]])).toEqual([{ a: 0, b: 4 }]);
  });

  it('好幾個切口依序扣；被切過的端點保留標記', () => {
    expect(
      subtractSpans(
        [{ a: 0, b: 10 }],
        [
          [2, 3],
          [6, 7],
        ],
      ),
    ).toEqual([
      { a: 0, b: 2, cutB: true },
      { a: 3, b: 6, cutA: true, cutB: true },
      { a: 7, b: 10, cutA: true },
    ]);
  });
});

describe('deviceResolutionLimits', () => {
  it('iPhone、iPad（含桌面版網站）用 iOS 的上限，其他用 limitResolution 的預設', () => {
    expect(deviceResolutionLimits({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })).toBe(
      IOS_RESOLUTION_LIMITS,
    );
    expect(
      deviceResolutionLimits({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }),
    ).toBe(IOS_RESOLUTION_LIMITS);
    expect(
      deviceResolutionLimits({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        platform: 'Linux x86_64',
      }),
    ).toEqual({});
    expect(deviceResolutionLimits(undefined)).toEqual({});
  });

  it('同樣的大圖，iOS 縮得比較小（面積在 16,777,216 px 以內）', () => {
    const s = limitResolution(96, { width: 150, height: 150 }, deviceResolutionLimits(undefined));
    expect(150 * s * (150 * s)).toBeCloseTo(40_000_000, 0);
    const ios = limitResolution(96, { width: 150, height: 150 }, IOS_RESOLUTION_LIMITS);
    expect(ios).toBeLessThan(s);
    expect(Math.floor(150 * ios) ** 2).toBeLessThanOrEqual(IOS_RESOLUTION_LIMITS.maxPixels);
    /* 單邊：400 × 50 格、每格 96 px → 38400 px 超過 16000 → 每格 40 px */
    expect(limitResolution(96, { width: 400, height: 50 })).toBe(40);
  });
});
