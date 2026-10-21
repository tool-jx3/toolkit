/**
 * 對等（lyric-fx 規格 3.3）：照原作的更新規則逐步模擬（Qt 計時器每一次改的量），檢查新版的時間函式在各個更新時間點的值相同。
 * - 殘影：每 30 ms 不透明度減淡出速度 f（從 255 開始，≤ 0 時拿掉）、y 減上升速度 r（ui/fading_line.py 38-50、ui/lyric_window.py 110）。
 * - 抖動：每 P ms 每個字的目標換成 −I～I 的整數、位置 s ← s ＋ (目標 − s) × 0.3（ui/lyric_window.py 1266-1273）；
 *   還沒有字時（打字的第一個字之前）不更新。
 * - 打字：每 v ms 多一個字，第一個字在 v ms 後（ui/lyric_window.py 1256-1264）；v 的算法（1166-1179）。
 * - 槽位：暗態 0.4 秒淡入到 35%（1418-1421）、亮態每 50 ms 一個字（1424-1428）。
 */
import { describe, expect, it } from 'vitest';
import { jitterAt, jitterTarget, type JitterSpec } from '@/core/lyricfx';
import {
  charInterval,
  fadeAlpha,
  fadeDuration,
  lineStateAt,
  riseOffset,
  type ScatterLinePlan,
} from '@/core/lyricfx/styles/scatter';

describe('殘影：每 30 ms 一次更新換成時間函式', () => {
  for (const f of [1, 5, 12, 15]) {
    for (const r of [0, 1, 3, 5]) {
      it(`淡出速度 ${f}、上升速度 ${r}`, () => {
        /* 原作：alpha、y 逐次更新 */
        let alpha = 255;
        let y = 500;
        let k = 0;
        const removedAt: number[] = [];
        while (alpha > 0) {
          k++;
          alpha = Math.max(0, alpha - f);
          y -= r;
          const dt = k * 0.03;
          if (alpha > 0) {
            expect(fadeAlpha(f, dt)).toBeCloseTo(alpha, 9);
            expect(500 - riseOffset(r, dt)).toBeCloseTo(y, 9);
          } else removedAt.push(dt);
        }
        /* 原作在第 k 次更新拿掉（不再畫）；新版在 (k−1)～k 次之間到 0 */
        const gone = removedAt[0];
        expect(fadeDuration(f)).toBeLessThanOrEqual(gone + 1e-9);
        expect(fadeDuration(f)).toBeGreaterThan(gone - 0.03 - 1e-9);
      });
    }
  }

  it('預設（12、1）：每秒 400、33.3 px；0.6375 秒淡完（原作第 22 次、0.66 秒拿掉）', () => {
    expect(fadeAlpha(12, 1) - fadeAlpha(12, 2)).toBeCloseTo(400, 9);
    expect(riseOffset(1, 1)).toBeCloseTo(33.333333, 5);
    expect(fadeDuration(12)).toBeCloseTo(0.6375, 9);
    expect(fadeAlpha(12, 21 * 0.03)).toBeCloseTo(3, 9);
  });
});

describe('抖動：指數平滑的遞迴換成時間函式', () => {
  const cases: { I: number; P: number; v: number }[] = [
    { I: 2, P: 143, v: 30 },
    { I: 2, P: 143, v: 300 },
    { I: 10, P: 10, v: 30 },
    { I: 5, P: 200, v: 50 },
  ];
  for (const { I, P, v } of cases) {
    it(`顫強 ${I}、顫速 ${P} ms、打字 ${v} ms`, () => {
      const spec: JitterSpec = {
        start: 12.5,
        period: P / 1000,
        firstTick: Math.max(1, Math.ceil(v / P - 1e-9)),
        intensity: I,
        lineHash: 0x1234abcd,
      };
      for (const m of [0, 3, 17]) {
        /* 原作：逐次更新（同一組目標） */
        let sx = 0;
        let sy = 0;
        for (let k = 1; k <= 60; k++) {
          const hasChar = k * P >= v;
          if (hasChar) {
            const tx = jitterTarget(spec.lineHash, m, k, 0, I);
            const ty = jitterTarget(spec.lineHash, m, k, 1, I);
            expect(Number.isInteger(tx) && tx >= -I && tx <= I).toBe(true);
            sx += (tx - sx) * 0.3;
            sy += (ty - sy) * 0.3;
          }
          const t = spec.start + (k * P) / 1000;
          const got = jitterAt(spec, m, t);
          /* 最近 24 次的加權和：24 次以內完全相同，之後差 < 0.0002 × I */
          const tol = k <= 24 ? 1e-9 : 2e-4 * I + 1e-9;
          expect(Math.abs(got.x - sx)).toBeLessThanOrEqual(tol);
          expect(Math.abs(got.y - sy)).toBeLessThanOrEqual(tol);
          /* 兩次更新之間維持不變 */
          const mid = jitterAt(spec, m, t + P / 2000);
          expect(mid.x).toBeCloseTo(got.x, 12);
        }
      }
    });
  }

  it('顫強 0 不抖；開始前不抖', () => {
    const spec: JitterSpec = { start: 1, period: 0.143, firstTick: 1, intensity: 0, lineHash: 9 };
    expect(jitterAt(spec, 0, 5)).toEqual({ x: 0, y: 0 });
    expect(jitterAt({ ...spec, intensity: 2 }, 0, 0.5)).toEqual({ x: 0, y: 0 });
  });
});

describe('打字間隔（原作 lyric_window.py 1166-1179）', () => {
  const s = { marginTime: 4000, maxInterval: 16000, maxDuration: 5000 };
  it('一般的句：(間隔 − 留白) ÷ 字數，最快 30 ms', () => {
    expect(charInterval(6000, 10, s)).toBe(200);
    expect(charInterval(4500, 10, s)).toBe(50);
    expect(charInterval(3000, 10, s)).toBe(30);
    expect(charInterval(4100, 7, s)).toBe(30);
  });
  it('間奏（超過長間隔閾值）：長間隔時長 ÷ 字數', () => {
    expect(charInterval(16001, 10, s)).toBe(500);
    expect(charInterval(16000, 10, s)).toBe(1200);
    expect(charInterval(20000, 1000, s)).toBe(30);
  });
  it('最後一句、沒有字：50 ms', () => {
    expect(charInterval(null, 10, s)).toBe(50);
    expect(charInterval(5000, 0, s)).toBe(50);
  });
});

describe('打字與槽位的狀態（時間函式）', () => {
  const base: ScatterLinePlan = {
    key: 'k',
    index: 0,
    rows: ['一二三四五'],
    glyphs: Array.from('一二三四五', (ch, i) => ({ ch, ox: i * 40, oy: 0 })),
    latin: false,
    font: '700 37px sans-serif',
    x: 100,
    y: 100,
    angle: 0,
    persp: { qx: 0, qy: 0, sx: 1 },
    box: { x: 0, y: 0, width: 10, height: 10 },
    start: 10,
    interval: 200,
    bright: false,
    slotBorn: 8,
    slotBright: false,
    fadeStart: 13,
    fadeEnd: 13.6375,
    jitter: { start: 10, period: 0.143, firstTick: 2, intensity: 2, lineHash: 1 },
    overlapped: false,
    locked: false,
  };
  const st = { fadeSpeed: 12, riseSpeed: 1 };
  it('每 v ms 一個字，第一個字在 v ms 後', () => {
    expect(lineStateAt(base, 10, st)).toBeNull();
    expect(lineStateAt(base, 10.199, st)).toBeNull();
    expect(lineStateAt(base, 10.2, st)?.count).toBe(1);
    expect(lineStateAt(base, 10.6, st)?.count).toBe(3);
    expect(lineStateAt(base, 12, st)?.count).toBe(5);
  });
  it('暗態槽位：0.4 秒淡入到 35%（取整數）', () => {
    expect(lineStateAt(base, 7.9, st)).toBeNull();
    expect(lineStateAt(base, 8.2, st)).toMatchObject({ role: 'slot', alpha: Math.floor(255 * 0.35 * 0.5) });
    expect(lineStateAt(base, 9, st)).toMatchObject({ role: 'slot', alpha: Math.floor(255 * 0.35) });
  });
  it('亮態槽位：每 50 ms 一個字；點亮時整句', () => {
    const b = { ...base, slotBright: true, bright: true };
    expect(lineStateAt(b, 8.049, st)).toBeNull();
    expect(lineStateAt(b, 8.1, st)?.count).toBe(2);
    expect(lineStateAt(b, 10, st)).toMatchObject({ role: 'current', count: 5 });
  });
  it('殘影：所有字、不透明度與上飄', () => {
    const f = lineStateAt(base, 13.3, st);
    expect(f?.role).toBe('fade');
    expect(f?.count).toBe(5);
    expect(f?.alpha).toBeCloseTo(255 - 12 * 10, 6);
    expect(f?.rise).toBeCloseTo(10, 6);
    expect(lineStateAt(base, 13.64, st)).toBeNull();
  });
});
