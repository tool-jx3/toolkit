/**
 * core/audio/ambience 的零件：濾波器、殘響、隨機曲線都要「環狀」（首尾相接、接縫沒有跳動），事件繞回開頭，
 * 循環的整理（音檔做成循環、鋪滿匯出的長度、只播一次）、柔和限幅、音量與大小。
 */
import { describe, expect, it } from 'vitest';
import {
  addSine,
  addWrapped,
  biquad,
  brownInPlace,
  curveAt,
  decayingSine,
  filterOnce,
  filterPeriodic,
  filterVarying,
  loopFrequency,
  panGains,
  periodicCurve,
  pinkInPlace,
  poissonTimes,
  reverbPeriodic,
  rms,
  spreadTimes,
  whiteNoise,
} from '@/core/audio/ambience/dsp';
import {
  applyFadesInPlace,
  crossfadeLoop,
  crossfadeLoopInPlace,
  crossfadeLoopLength,
  placeOnce,
  SOFT_CLIP_INPUT_SCALE,
  softClip,
  softClipCurve,
  tileLoop,
  volumeGain,
  wavBytes,
  withFades,
} from '@/core/audio/ambience/loop';
import { createRandom } from '@/core/timeline';

const SR = 16000;

/** 同一段輸入連續處理兩次（非環狀），第二次的結果就是穩態；和環狀處理的結果比 */
function steady(input: Float32Array, process: (buf: Float32Array) => void): Float32Array {
  const twice = new Float32Array(input.length * 2);
  twice.set(input);
  twice.set(input, input.length);
  process(twice);
  return twice.slice(input.length);
}

const maxDiff = (a: Float32Array, b: Float32Array) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

/** 一個正弦經過濾波器後的振幅（穩態） */
function gainAt(freq: number, c: ReturnType<typeof biquad>): number {
  const n = SR;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  filterOnce(x, c);
  let m = 0;
  for (let i = n / 2; i < n; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

describe('濾波器', () => {
  it('低通、高通、帶通的頻率響應（RBJ）', () => {
    const lp = biquad('lowpass', 1000, Math.SQRT1_2, SR);
    expect(gainAt(100, lp)).toBeGreaterThan(0.98);
    expect(gainAt(1000, lp)).toBeCloseTo(Math.SQRT1_2, 1);
    expect(gainAt(6000, lp)).toBeLessThan(0.05);
    const hp = biquad('highpass', 1000, Math.SQRT1_2, SR);
    expect(gainAt(100, hp)).toBeLessThan(0.02);
    expect(gainAt(6000, hp)).toBeGreaterThan(0.98);
    const bp = biquad('bandpass', 2000, 4, SR);
    expect(gainAt(2000, bp)).toBeGreaterThan(0.97);
    expect(gainAt(500, bp)).toBeLessThan(0.1);
  });

  it('環狀的濾波＝穩態（首尾相接：第 0 個取樣接得上最後一個）', () => {
    const rng = createRandom(3);
    const x = whiteNoise(SR * 2, rng);
    const filters = [biquad('lowpass', 300, Math.SQRT1_2, SR), biquad('highpass', 40, 2, SR)];
    const periodic = filterPeriodic(Float32Array.from(x), filters, SR);
    const ref = steady(x, (b) => filterOnce(b, filters));
    expect(maxDiff(periodic, ref)).toBeLessThan(1e-4);
  });

  it('係數隨時間變的濾波也是環狀的', () => {
    const rng = createRandom(4);
    const x = whiteNoise(SR * 2, rng);
    const block = 64;
    const nb = Math.ceil(x.length / block);
    const coeff = (k: number) =>
      biquad('bandpass', 300 + 1500 * (0.5 + 0.5 * Math.sin((2 * Math.PI * k) / nb)), 3, SR);
    const periodic = filterVarying(Float32Array.from(x), block, coeff, SR);
    const twice = new Float32Array(x.length * 2);
    twice.set(x);
    twice.set(x, x.length);
    filterVarying(twice, block, (k) => coeff(k % nb), 0);
    expect(maxDiff(periodic, twice.slice(x.length))).toBeLessThan(1e-4);
  });

  it('粉紅、棕色雜訊：環狀、頻譜往下斜、均方根和白雜訊差不多', () => {
    const rng = createRandom(5);
    const w = whiteNoise(SR * 4, rng);
    const pink = pinkInPlace(Float32Array.from(w));
    const brown = brownInPlace(Float32Array.from(w));
    expect(
      maxDiff(
        pink,
        steady(w, (b) => pinkInPlace(b, 0)),
      ),
    ).toBeLessThan(1e-4);
    expect(
      maxDiff(
        brown,
        steady(w, (b) => brownInPlace(b, 0)),
      ),
    ).toBeLessThan(1e-4);
    const r0 = rms([w]);
    expect(rms([pink]) / r0).toBeGreaterThan(0.4);
    expect(rms([pink]) / r0).toBeLessThan(2.5);
    expect(rms([brown]) / r0).toBeGreaterThan(0.4);
    expect(rms([brown]) / r0).toBeLessThan(2.5);
    /* 高頻的比例：白 > 粉紅 > 棕色 */
    const hiRatio = (x: Float32Array) => {
      const y = filterPeriodic(Float32Array.from(x), biquad('highpass', 3000, Math.SQRT1_2, SR));
      return rms([y]) / rms([x]);
    };
    expect(hiRatio(w)).toBeGreaterThan(hiRatio(pink));
    expect(hiRatio(pink)).toBeGreaterThan(hiRatio(brown) * 2);
  });
});

describe('殘響與曲線', () => {
  it('殘響是環狀的（尾巴繞回開頭），而且真的有殘響', () => {
    const n = SR * 4;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    /* 結尾附近一聲：殘響要出現在開頭 */
    const click = decayingSine(1000, 0.01, SR);
    addWrapped(l, click, n - 200);
    addWrapped(r, click, n - 200);
    reverbPeriodic(l, r, SR, { size: 0.7, damp: 0.4, wet: 0.5, dry: 1, warmSeconds: 4 });
    const head = l.slice(SR * 0.1, SR * 0.6);
    expect(rms([head])).toBeGreaterThan(1e-4);
    /* 穩態比對：同樣的輸入處理兩輪 */
    const x = new Float32Array(n);
    addWrapped(x, click, n - 200);
    const once = Float32Array.from(x);
    reverbPeriodic(once, null, SR, { size: 0.5, damp: 0.4, wet: 0.5, warmSeconds: 4 });
    const twice = new Float32Array(n * 2);
    twice.set(x);
    twice.set(x, n);
    reverbPeriodic(twice, null, SR, { size: 0.5, damp: 0.4, wet: 0.5, warmSeconds: 0 });
    expect(maxDiff(once, twice.slice(n))).toBeLessThan(1e-4);
  });

  it('隨機曲線：0～1、環狀、同一個種子一樣', () => {
    const c = periodicCurve(SR * 10, 64, 8, createRandom(7));
    const nb = c.values.length;
    for (const v of c.values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    let maxStep = 0;
    for (let k = 1; k < nb; k++)
      maxStep = Math.max(maxStep, Math.abs(c.values[k] - c.values[k - 1]));
    expect(Math.abs(c.values[0] - c.values[nb - 1])).toBeLessThanOrEqual(maxStep + 1e-6);
    expect(curveAt(c, SR * 10)).toBeCloseTo(c.values[0], 5);
    expect(periodicCurve(SR * 10, 64, 8, createRandom(7)).values).toEqual(c.values);
  });

  it('事件繞回開頭；平均分布與卜瓦松的時間點', () => {
    const dst = new Float32Array(10);
    addWrapped(dst, [1, 2, 3, 4], 8, 2);
    expect(Array.from(dst)).toEqual([6, 8, 0, 0, 0, 0, 0, 0, 2, 4]);
    addWrapped(dst, [1], -1);
    expect(dst[9]).toBe(5);
    const rng = createRandom(8);
    const t = spreadTimes(5, 60, rng, 0.3);
    expect(t).toHaveLength(5);
    for (const x of t) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of t) expect(x).toBeLessThan(60);
    const p = poissonTimes(20, 100, rng);
    expect(p.length).toBeGreaterThan(1800);
    expect(p.length).toBeLessThan(2200);
    expect(panGains(0)[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(panGains(-1)).toEqual([1, 0]);
  });

  it('正弦：整段整數個週期時首尾相接；衰減正弦有起音與衰減', () => {
    const seconds = 3;
    const f = loopFrequency(61.37, seconds);
    expect((f * seconds) % 1).toBeCloseTo(0, 9);
    const buf = new Float32Array(SR * seconds);
    addSine(buf, f, 1, 0.3, SR);
    const next = Math.sin(2 * Math.PI * f * (buf.length / SR) + 0.3);
    expect(Math.abs(next - Math.sin(0.3))).toBeLessThan(1e-6);
    expect(buf[1000]).toBeCloseTo(Math.sin((2 * Math.PI * f * 1000) / SR + 0.3), 4);
    const d = decayingSine(1000, 0.02, SR, { attack: 0.002 });
    expect(Math.abs(d[0])).toBeLessThan(0.01);
    const early = rms([d.slice(0, SR * 0.01)]);
    const late = rms([d.slice(SR * 0.08, SR * 0.09)]);
    expect(late).toBeLessThan(early * 0.2);
    const chirp = decayingSine(500, 0.05, SR, { chirp: 20 });
    expect(chirp.length).toBe(decayingSine(500, 0.05, SR).length);
  });
});

describe('循環的整理', () => {
  const ramp = (n: number, rate = 1000) => ({
    sampleRate: rate,
    channels: [Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.05) + i * 0.001)],
  });

  it('音檔做成循環：長度 F − X、接縫連續', () => {
    const src = ramp(1000);
    const out = crossfadeLoop(src, 0.1);
    expect(out.channels[0]).toHaveLength(900);
    const c = out.channels[0];
    /* 最後一個（原本的第 899 個）接到第一個（幾乎是原本的第 900 個） */
    expect(Math.abs(c[0] - src.channels[0][900])).toBeLessThan(0.02);
    expect(c[899]).toBeCloseTo(src.channels[0][899], 6);
    /* 交叉淡化之後原樣 */
    expect(c[500]).toBeCloseTo(src.channels[0][500], 6);
    expect(crossfadeLoop(src, 0).channels[0]).toHaveLength(1000);
    /* 太短時最多一半 */
    expect(crossfadeLoop(ramp(100), 5).channels[0]).toHaveLength(50);
  });

  it('原地做循環（大音檔不複製）：結果和 crossfadeLoop 一樣、只改開頭、回傳的是檢視', () => {
    const src = ramp(1000);
    const copy = { sampleRate: 1000, channels: [Float32Array.from(src.channels[0])] };
    const views = crossfadeLoopInPlace(copy, 0.1);
    expect(views.channels[0]).toHaveLength(900);
    expect(views.channels[0].buffer).toBe(copy.channels[0].buffer);
    expect(Array.from(views.channels[0])).toEqual(Array.from(crossfadeLoop(src, 0.1).channels[0]));
    /* 結尾（第 900 個以後）沒有動 */
    expect(copy.channels[0][950]).toBe(src.channels[0][950]);
    expect(crossfadeLoopLength(1000, 1000, 0.1)).toBe(900);
    expect(crossfadeLoopLength(100, 1000, 5)).toBe(50);
    const one = { sampleRate: 1000, channels: [new Float32Array(300).fill(1)] };
    applyFadesInPlace(one, 0.1, 0.1);
    expect(one.channels[0][0]).toBe(0);
    expect(one.channels[0][50]).toBeCloseTo(0.5, 5);
    expect(one.channels[0][150]).toBe(1);
    expect(one.channels[0][299]).toBeCloseTo(0.01, 5);
  });

  it('鋪滿匯出的長度：剛好整除時直接鋪，不然接縫交叉淡化', () => {
    const loop = { sampleRate: 1000, channels: [Float32Array.from({ length: 250 }, (_, i) => i)] };
    const exact = tileLoop(loop, 1, 0.1);
    expect(exact.channels[0]).toHaveLength(1000);
    expect(exact.channels[0][0]).toBe(0);
    expect(exact.channels[0][260]).toBe(10);
    const odd = {
      sampleRate: 1000,
      channels: [Float32Array.from({ length: 300 }, (_, i) => Math.sin(i / 10))],
    };
    const out = tileLoop(odd, 1, 0.05).channels[0];
    expect(out).toHaveLength(1000);
    /* 開頭幾乎是第 1000 個（＝原本的第 100 個），接得上結尾（原本的第 99 個） */
    expect(Math.abs(out[0] - Math.sin(100 / 10))).toBeLessThan(0.05);
    expect(out[999]).toBeCloseTo(Math.sin(99 / 10), 5);
  });

  it('只播一次：放在開頭、淡入淡出、之後靜音；比循環長時截斷並淡出', () => {
    const one = { sampleRate: 1000, channels: [new Float32Array(300).fill(1)] };
    const out = placeOnce(one, 1, 0.1, 0.1).channels[0];
    expect(out).toHaveLength(1000);
    expect(out[0]).toBe(0);
    expect(out[50]).toBeCloseTo(0.5, 2);
    expect(out[150]).toBe(1);
    expect(out[299]).toBeLessThan(0.02);
    expect(out[500]).toBe(0);
    const long = placeOnce(
      { sampleRate: 1000, channels: [new Float32Array(3000).fill(1)] },
      1,
      0,
      0,
    ).channels[0];
    expect(long[999]).toBeLessThan(0.01);
    expect(long[400]).toBe(1);
    expect(withFades(one, 0, 0.1).channels[0]).toHaveLength(300);
  });

  it('柔和限幅：門檻以下不變、以上壓在 ±1 以內、單調；WaveShaper 的曲線換算正確', () => {
    expect(softClip(0.5)).toBe(0.5);
    expect(softClip(-0.69)).toBe(-0.69);
    expect(softClip(1)).toBeLessThan(1);
    expect(softClip(5)).toBeLessThanOrEqual(1);
    expect(softClip(-5)).toBeGreaterThanOrEqual(-1);
    expect(softClip(0.9)).toBeGreaterThan(softClip(0.8));
    const curve = softClipCurve(4097);
    /* 曲線在 x 的值＝softClip(x ÷ 0.5)：中央附近斜率 2（因為輸入先乘 0.5），合起來是 1 */
    const mid = 2048;
    const x = 0.25;
    const i = mid + Math.round(x * 2048);
    expect(curve[i]).toBeCloseTo(softClip(x / SOFT_CLIP_INPUT_SCALE), 6);
    expect(curve[0]).toBeCloseTo(-softClip(2), 6);
  });

  it('音量（平方）與 WAV 的大小', () => {
    expect(volumeGain(100)).toBe(1);
    expect(volumeGain(50)).toBe(0.25);
    expect(volumeGain(-5)).toBe(0);
    expect(volumeGain(Number.NaN)).toBe(0);
    expect(wavBytes(60, 32000, 2)).toBe(44 + 60 * 32000 * 4);
    expect(wavBytes(10, 22050, 1)).toBe(44 + 10 * 22050 * 2);
  });
});
