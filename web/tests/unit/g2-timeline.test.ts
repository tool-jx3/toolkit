/**
 * G2 共用層：轉場與動態的速度曲線、節點表、影格取樣與延遲、二維雜訊。
 * 取樣值以 scene-transition 規格 3.4、loading-maker 附件「進度曲線」、bg-motion 規格 3.3／3.5／3.6 為準。
 */
import { describe, expect, it } from 'vitest';
import {
  actionFrameCount,
  CURVES,
  estimateExport,
  evaluateKeyframes,
  fbm2,
  frameIndexAt,
  frameTableDuration,
  frameTableTicks,
  insertKeyframe,
  irregularCurve,
  type Keyframe,
  keyframesSummary,
  normalizeKeyframes,
  removeKeyframe,
  sampledFrames,
  sampleProgress,
  sequenceSource,
  smootherstep,
  splitDurationMs,
  stepsCurve,
  transitionFrames,
  valueNoise2,
} from '@/core/timeline';

import LM_JSON from '../../../docs/refactor/specs/loading-maker.examples.json';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON
const LM = LM_JSON as any;

describe('速度曲線（scene-transition 3.4，每 5%）', () => {
  /* 規格表的數值（兩位小數；量測自 8 位元透明度，所以容許 ±0.01） */
  const TABLE: Record<string, number[]> = {
    smoothstep: [
      0, 0.01, 0.03, 0.06, 0.11, 0.16, 0.22, 0.28, 0.35, 0.42, 0.5, 0.58, 0.65, 0.72, 0.78, 0.84,
      0.89, 0.94, 0.97, 0.99, 1,
    ],
    linear: [
      0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
      0.85, 0.9, 0.95, 1,
    ],
    quadIn: [
      0, 0, 0.01, 0.02, 0.04, 0.06, 0.09, 0.12, 0.16, 0.2, 0.25, 0.3, 0.36, 0.42, 0.49, 0.56, 0.64,
      0.72, 0.81, 0.9, 1,
    ],
    quadOut: [
      0, 0.1, 0.19, 0.28, 0.36, 0.44, 0.51, 0.58, 0.64, 0.7, 0.75, 0.8, 0.84, 0.88, 0.91, 0.94,
      0.96, 0.98, 0.99, 1, 1,
    ],
    bounceOut: [
      0, 0.02, 0.07, 0.17, 0.3, 0.47, 0.68, 0.93, 0.91, 0.82, 0.76, 0.75, 0.77, 0.83, 0.93, 0.97,
      0.94, 0.95, 0.99, 0.98, 1,
    ],
    flicker: [
      0, 0, 0.85, 0.05, 0.9, 0, 0.7, 0.15, 0.15, 1, 0.25, 0.25, 0.27, 0.33, 0.43, 0.55, 0.67, 0.8,
      0.9, 0.97, 1,
    ],
    lightning: [
      0, 1, 0.44, 0.06, 0.6, 0.49, 0.09, 0, 1, 0.76, 0.56, 0.39, 0.25, 0.14, 0.06, 0.02, 0, 0, 0, 0,
      0,
    ],
    heartbeat: [
      0, 0.19, 0.79, 0.98, 0.56, 0.03, 0.07, 0.48, 0.7, 0.48, 0.07, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ],
  };
  for (const [name, want] of Object.entries(TABLE)) {
    it(name, () => {
      const f = CURVES[name as keyof typeof CURVES];
      want.forEach((w, k) => {
        expect(Math.abs(f(k / 20) - w), `${name} @ ${k * 5}%`).toBeLessThanOrEqual(0.011);
      });
    });
  }

  it('明滅後蓋上：平台與最後的 S 形', () => {
    const f = CURVES.flicker;
    expect(f(0.069)).toBe(0);
    expect(f(0.07)).toBe(0.85);
    expect(f(0.19)).toBe(0.9);
    expect(f(0.3)).toBe(0.7);
    expect(f(0.44)).toBe(1);
    expect(f(0.49)).toBe(0.25);
    expect(f(0.56)).toBeCloseTo(0.25, 5);
    expect(f(1)).toBe(1);
  });

  it('雷閃：每次跳起至少維持 4%、80% 之後是 0', () => {
    const f = CURVES.lightning;
    for (const t of [0.02, 0.04, 0.06]) expect(f(t)).toBe(1);
    for (const t of [0.2, 0.22, 0.24]) expect(f(t)).toBe(0.6);
    for (const t of [0.36, 0.38, 0.4]) expect(f(t)).toBe(1);
    for (const t of [0.8, 0.9, 1]) expect(f(t)).toBe(0);
    expect(f(0.19)).toBe(0);
  });

  it('心跳：14% 最高 1、40% 最高 0.7、52% 之後是 0', () => {
    expect(CURVES.heartbeat(0.14)).toBeCloseTo(1, 6);
    expect(CURVES.heartbeat(0.4)).toBeCloseTo(0.7, 6);
    expect(CURVES.heartbeat(0.52)).toBe(0);
    expect(CURVES.heartbeat(0.7)).toBe(0);
  });

  it('彈跳：約 36%、73%、91% 碰到 1，最低彈回約 0.75', () => {
    const f = CURVES.bounceOut;
    expect(f(0.364)).toBeCloseTo(1, 2);
    expect(f(0.545)).toBeCloseTo(0.75, 2);
    expect(f(0.727)).toBeCloseTo(1, 2);
  });
});

describe('進度曲線（loading-maker 附件，填滿比例 ±0.005）', () => {
  const t: number[] = LM.進度曲線.t;
  const map: Record<string, keyof typeof CURVES> = {
    等速: 'linear',
    平滑: 'smoothstep',
    漸快: 'cubicIn',
    漸慢: 'cubicOut',
    慢快慢: 'cubicInOut',
    階梯: 'steps10',
    彈跳: 'bounceOut',
  };
  for (const [label, name] of Object.entries(map)) {
    it(`${label}＝${name}`, () => {
      const want: number[] = LM.進度曲線[label];
      want.forEach((w, k) => {
        /* 填滿比例＝填滿像素 ÷ 576 px，所以多容許一個像素 */
        expect(Math.abs(CURVES[name](t[k]) - w), `${label} @ ${t[k]}`).toBeLessThanOrEqual(0.0055);
      });
    });
  }

  it('階梯（每 0.01 秒）', () => {
    const want: number[] = LM.進度曲線['階梯（每 0.01 秒）'];
    want.forEach((w, k) => {
      expect(Math.abs(stepsCurve(10)(k / 100) - w)).toBeLessThanOrEqual(0.002);
    });
  });

  it('不規則：8 段、永不倒退、同種子相同、換種子不同、各段長短不一', () => {
    for (const seed of [1, 21, 500, 777, 99999]) {
      const f = irregularCurve(seed);
      const g = irregularCurve(seed);
      let last = -1;
      for (let i = 0; i <= 200; i++) {
        const v = f(i / 200);
        expect(v).toBeGreaterThanOrEqual(last - 1e-12);
        expect(v).toBe(g(i / 200));
        last = v;
      }
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      /* 每段的前進量：正規化前 0.55～1.45 倍平均 → 正規化後介於 0.55／1.45 與 1.45／0.55 倍平均之間 */
      const steps = Array.from({ length: 8 }, (_, k) => f((k + 1) / 8) - f(k / 8));
      for (const s of steps) {
        expect(s).toBeGreaterThan((0.55 / 1.45) * 0.125);
        expect(s).toBeLessThan((1.45 / 0.55) * 0.125);
      }
      /* 段內是平滑的 S 形：段的中點剛好走一半 */
      const mid = f(1 / 16);
      expect(mid).toBeCloseTo(steps[0] / 2, 6);
    }
    expect(irregularCurve(1)(0.3)).not.toBe(irregularCurve(2)(0.3));
  });
});

describe('動態背景的曲線（bg-motion 3.5、3.6）', () => {
  it('S 形加速＝二次 S 形', () => {
    expect(CURVES.quadInOut(0.25)).toBeCloseTo(0.125, 6);
    expect(CURVES.quadInOut(0.5)).toBeCloseTo(0.5, 6);
    expect(CURVES.quadInOut(0.75)).toBeCloseTo(0.875, 6);
  });
  it('淡化與轉場的平緩 S 形＝smootherstep', () => {
    const want = [
      [0.1, 0.009],
      [0.2, 0.058],
      [0.3, 0.163],
      [0.4, 0.317],
      [0.5, 0.5],
    ];
    for (const [t, v] of want) expect(Math.abs(smootherstep(t) - v)).toBeLessThan(0.0015);
  });
});

describe('節點表（loading-maker 預設時間表）', () => {
  const keys: Keyframe[] = [
    { time: 0, value: 0, curve: 'linear' },
    { time: 1, value: 30, curve: 'cubicOut' },
    { time: 2, value: 70, curve: 'smoothstep' },
    { time: 3, value: 100, curve: 'cubicInOut' },
  ];
  it('每 0.25 秒的填滿比例（±0.005）', () => {
    for (const s of LM.進度曲線.預設時間表.取樣) {
      expect(Math.abs(evaluateKeyframes(keys, s.秒) / 100 - s.填滿)).toBeLessThanOrEqual(0.0055);
    }
  });
  it('新增：插在間隔最大的兩節點正中間，曲線預設平滑；滿 16 個不能再加', () => {
    const uneven: Keyframe[] = [
      { time: 0, value: 0, curve: 'linear' },
      { time: 1, value: 30, curve: 'linear' },
      { time: 4, value: 100, curve: 'linear' },
    ];
    const { keys: out, index } = insertKeyframe(uneven);
    expect(index).toBe(2);
    expect(out[2]).toEqual({ time: 2.5, value: 65, curve: 'smoothstep' });
    let k = keys;
    while (k.length < 16) k = insertKeyframe(k).keys;
    expect(insertKeyframe(k).index).toBe(-1);
  });
  it('新增：insertDecimals 決定新節點的時間、值取到小數第幾位', () => {
    const two: Keyframe[] = [
      { time: 0, value: 0, curve: 'linear' },
      { time: 0.25, value: 33, curve: 'linear' },
    ];
    expect(insertKeyframe(two).keys[1]).toMatchObject({ time: 0.125, value: 16.5 });
    const r = { insertDecimals: { time: 2, value: 1 }, lastValue: null };
    expect(insertKeyframe(two, r).keys[1]).toMatchObject({ time: 0.13, value: 16.5 });
    const odd: Keyframe[] = [
      { time: 0, value: 0, curve: 'linear' },
      { time: 0.1, value: 0.33, curve: 'linear' },
    ];
    expect(insertKeyframe(odd, r).keys[1]).toMatchObject({ time: 0.05, value: 0.2 });
  });
  it('刪除：頭尾不能刪、至少留 2 個', () => {
    expect(removeKeyframe(keys, 0)).toHaveLength(4);
    expect(removeKeyframe(keys, 3)).toHaveLength(4);
    expect(removeKeyframe(keys, 1)).toHaveLength(3);
  });
  it('整理：排序、相隔至少 0.05 秒、值不倒退、第一個 0 秒 0%、最後 100%', () => {
    const messy: Keyframe[] = [
      { time: 0.4, value: 10, curve: 'linear' },
      { time: 2, value: 20, curve: 'linear' },
      { time: 1, value: 50, curve: 'linear' },
      { time: 1.02, value: 40, curve: 'linear' },
    ];
    const n = normalizeKeyframes(messy);
    expect(n.map((k) => k.time)).toEqual([0, 1, 1.05, 2]);
    expect(n.map((k) => k.value)).toEqual([0, 50, 50, 100]);
  });
  it('摘要', () => {
    expect(keyframesSummary(keys)).toBe('0 秒 0% → 1 秒 30% → 2 秒 70% → 3 秒 100%');
  });
});

describe('影格取樣與延遲', () => {
  it('影格數：四捨五入、至少 2', () => {
    expect(actionFrameCount(0.7, 24)).toBe(17);
    expect(actionFrameCount(0.55, 24)).toBe(13);
    expect(actionFrameCount(0.35, 24)).toBe(8);
    expect(actionFrameCount(0.1, 12)).toBe(2);
    expect(actionFrameCount(2.5, 24)).toBe(60);
    expect(actionFrameCount(1.3, 24)).toBe(31);
    expect(actionFrameCount(4.05, 12)).toBe(49);
  });
  it('進度型含頭尾、循環型 k ÷ n', () => {
    expect(sampleProgress(0, 17)).toBe(0);
    expect(sampleProgress(16, 17)).toBe(1);
    expect(sampleProgress(9, 10, 'loop')).toBeCloseTo(0.9, 9);
  });
  it('總長拆成整數毫秒、餘數給前面的格', () => {
    const a = splitDurationMs(2500, 60);
    expect(a.slice(0, 40).every((v) => v === 42)).toBe(true);
    expect(a.slice(40).every((v) => v === 41)).toBe(true);
    expect(a.reduce((s, v) => s + v, 0)).toBe(2500);
    const b = splitDurationMs(2000, 120);
    expect(b.filter((v) => v === 17)).toHaveLength(80);
    expect(b.filter((v) => v === 16)).toHaveLength(40);
    /* 每格至少 10 ms */
    expect(Math.min(...splitDurationMs(100, 30))).toBe(10);
  });
  it('均勻取樣（讀取動畫 4.05 秒 12 fps；動態背景 2.5 秒 24 fps）', () => {
    const lm = sampledFrames({ duration: 4.05, fps: 12 });
    expect(lm).toHaveLength(49);
    expect(lm[0].t).toBe(0);
    expect(lm[48].t).toBeCloseTo(4.05, 9);
    expect(lm[1].ms).toBeCloseTo(4050 / 49, 9);
    /* 編碼器以累計時間四捨五入：每格 82～83 ms、總長 4050 */
    const ticks = frameTableTicks(lm, 1000);
    expect(new Set(ticks)).toEqual(new Set([82, 83]));
    expect(ticks.reduce((s, v) => s + v, 0)).toBe(4050);
    const loop = sampledFrames({ duration: 1, fps: 10, sampling: 'loop' });
    expect(loop[9].progress).toBeCloseTo(0.9, 9);
    const bg = sampledFrames({ duration: 2.5, fps: 24, delays: 'integer' });
    expect(bg.map((f) => f.ms).reduce((s, v) => s + v, 0)).toBe(2500);
    expect(bg[59].progress).toBe(1);
  });
  it('轉場：停留加在最後一格、來回 2n − 1 格、倒著播放時停留在第一格', () => {
    const go = transitionFrames({ duration: 0.7, fps: 24, holdMs: 600 });
    expect(go).toHaveLength(17);
    expect(go[16].ms).toBeCloseTo(1000 / 24 + 600, 6);
    expect(go[16].progress).toBe(1);
    expect(frameTableDuration(go)).toBeCloseTo((17 * 1000) / 24 / 1000 + 0.6, 6);
    const rt = transitionFrames({ duration: 0.6, fps: 24, holdMs: 800, roundTrip: true });
    const n = actionFrameCount(0.6, 24);
    expect(rt).toHaveLength(2 * n - 1);
    expect(rt[n - 1].ms).toBeCloseTo(1000 / 24 + 800, 6);
    expect(rt[n].leg).toBe('back');
    expect(rt[n].progress).toBeCloseTo((n - 2) / (n - 1), 9);
    expect(rt[2 * n - 2].progress).toBe(0);
    const rev = transitionFrames({ duration: 0.7, fps: 24, holdMs: 600, reverse: true });
    expect(rev[0].ms).toBeCloseTo(1000 / 24 + 600, 6);
    expect(rev[0].progress).toBe(1);
    expect(rev[16].progress).toBe(0);
  });
  it('sequenceSource：t 秒畫正在顯示的那一格；匯出時每格的 t 是開始時間', () => {
    const frames = transitionFrames({ duration: 0.25, fps: 12, holdMs: 500 });
    const drawn: number[] = [];
    const src = sequenceSource({
      width: 4,
      height: 4,
      frames,
      renderFrame: (_ctx, _f, i) => {
        drawn.push(i);
      },
    });
    expect(src.duration).toBeCloseTo(frameTableDuration(frames), 9);
    for (const f of src.frames ?? []) src.render({} as never, f.t ?? 0);
    expect(drawn).toEqual(frames.map((_, i) => i));
    expect(frameIndexAt(frames, src.duration - 0.001)).toBe(frames.length - 1);
    expect(src.stillTime).toBeCloseTo((src.frames?.at(-1)?.t as number) ?? 0, 9);
  });
  it('匯出預估：每格毫秒、未壓縮資料量', () => {
    const e = estimateExport({ width: 640, height: 360, frames: 49, duration: 4.05 });
    expect(e.msPerFrame).toBeCloseTo(82.653, 3);
    expect(e.rawBytes).toBe(640 * 360 * 4 * 49);
    expect(e.pixels).toBe(640 * 360 * 49);
  });
});

describe('二維值雜訊與 fBm', () => {
  it('決定性、範圍、在格點上等於格點值、連續', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.37;
      const y = i * 0.61;
      const v = valueNoise2(7, x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(valueNoise2(7, x, y)).toBe(v);
      expect(Math.abs(valueNoise2(7, x + 1e-4, y) - v)).toBeLessThan(1e-3);
    }
    expect(valueNoise2(7, 3.2, 1.1)).not.toBe(valueNoise2(8, 3.2, 1.1));
  });
  it('5 層 fBm 正規化到 0～1、平均約 0.5', () => {
    let sum = 0;
    let min = 1;
    let max = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const v = fbm2(5, (i % 63) * 0.173, Math.floor(i / 63) * 0.211);
      sum += v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(sum / n).toBeGreaterThan(0.4);
    expect(sum / n).toBeLessThan(0.6);
  });
});
