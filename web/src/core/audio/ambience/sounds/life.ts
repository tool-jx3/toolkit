/**
 * 生物與人：蟲鳴、貓頭鷹、遠方的人聲。
 * 蟲鳴＝幾隻蟋蟀各自的「唧唧」（4～5 kHz 的正弦脈衝），加上遠處很多隻合成的一層；貓頭鷹＝低沉的「呼—」；
 * 人聲＝很多個「說話的人」：聲帶的脈衝經兩個隨音節移動的共振峰（母音），一句一句、中間停頓，混在一起就是嘈雜的人聲。
 */
import { addLayer, lerp, logLerp, noise, unit, warmSamples } from '../build';
import {
  addPanned,
  applyCurveGain,
  biquad,
  curveAt,
  filterOnce,
  filterPeriodic,
  logRange,
  noiseBurst,
  periodicCurve,
  poissonTimes,
  resonate,
  reverbPeriodic,
  spreadTimes,
} from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

/* ---------- 蟲鳴 ---------- */

function chirp(sr: number, f: number, pulses: number, rng: RenderContext['rng']): Float32Array {
  const pulse = 0.015 + rng.next() * 0.006;
  const gap = 0.013 + rng.next() * 0.006;
  const len = Math.round((pulses * (pulse + gap) + 0.01) * sr);
  const out = new Float32Array(len);
  const pn = Math.round(pulse * sr);
  for (let p = 0; p < pulses; p++) {
    const s0 = Math.round(p * (pulse + gap) * sr);
    const a = p === 0 ? 0.8 : 1;
    for (let i = 0; i < pn && s0 + i < len; i++) {
      const x = i / pn;
      const env = Math.sin(Math.PI * x) ** 2;
      out[s0 + i] = Math.sin((2 * Math.PI * f * i) / sr) * env * a;
    }
  }
  return out;
}

/* ---------- 貓頭鷹 ---------- */

function hoot(
  sr: number,
  f: number,
  dur: number,
  rng: RenderContext['rng'],
  vibrato: boolean,
): Float32Array {
  const len = Math.round((dur + 0.15) * sr);
  const out = new Float32Array(len);
  const atk = 0.05;
  const rel = 0.12;
  let ph = 0;
  const vr = 5.5 + rng.next();
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const x = t / dur;
    const ff =
      f *
      (1 + 0.05 * (1 - Math.exp(-t / 0.04)) - 0.06 * Math.min(1, x) ** 2) *
      (vibrato ? 1 + 0.012 * Math.sin(2 * Math.PI * vr * t) : 1);
    ph += (2 * Math.PI * ff) / sr;
    let env = t < atk ? Math.sin(((t / atk) * Math.PI) / 2) ** 2 : 1;
    if (t > dur - rel) env *= Math.max(0, (dur - t) / rel + 0) ** 1.5;
    if (t > dur) env = 0;
    out[i] = (Math.sin(ph) + 0.12 * Math.sin(2 * ph) + 0.04 * Math.sin(3 * ph)) * env;
  }
  /* 氣音 */
  const breath = noiseBurst(dur, sr, rng, 0.03);
  filterOnce(breath, biquad('bandpass', f, 6, sr));
  for (let i = 0; i < breath.length && i < len; i++) {
    const t = i / sr;
    out[i] += breath[i] * 0.5 * (t < dur ? 1 : 0) * Math.exp(t / dur - 1);
  }
  return out;
}

/** 貓頭鷹的叫法：[開始時間, 長度, 音高倍數, 顫音] */
const OWL_PATTERNS: (readonly [number, number, number, boolean])[][] = [
  [
    [0, 0.45, 1, false],
    [1.1, 0.14, 1.02, false],
    [1.35, 0.95, 1.04, true],
  ],
  [
    [0, 0.3, 1, false],
    [0.55, 0.2, 1, false],
    [0.8, 0.25, 1, false],
    [1.35, 0.35, 0.97, false],
    [1.9, 0.35, 0.96, false],
  ],
];

/* ---------- 人聲 ---------- */

/** 母音的共振峰（F1、F2；成年人的大約值） */
const VOWELS: readonly (readonly [number, number])[] = [
  [730, 1090],
  [270, 2290],
  [300, 870],
  [530, 1840],
  [570, 840],
  [440, 1020],
  [660, 1720],
];

function phrase(ctx: RenderContext, f0: number, dur: number): Float32Array {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const n = Math.round(dur * sr);
  const out = new Float32Array(n);
  /* 音節 */
  const syl: { start: number; len: number; v: readonly [number, number]; a: number }[] = [];
  for (let s = 0; s < dur; ) {
    const len = logRange(rng, 0.11, 0.24);
    syl.push({
      start: s,
      len,
      v: VOWELS[Math.floor(rng.next() * VOWELS.length)],
      a: logRange(rng, 0.5, 1) * (1 - (0.3 * s) / dur),
    });
    s += len;
  }
  /* 每 32 個取樣算一次音量、音高與共振峰（區塊內不變），聲源逐點：鋸齒波（聲帶）＋一點氣音 */
  const block = 32;
  let f1 = syl[0].v[0];
  let f2 = syl[0].v[1];
  let si = 0;
  let ph = 0;
  const phi = rng.next() * 6.28;
  let ax1 = 0;
  let ax2 = 0;
  let ay1 = 0;
  let ay2 = 0;
  let bx1 = 0;
  let bx2 = 0;
  let by1 = 0;
  let by2 = 0;
  let c1 = biquad('bandpass', f1, 4, sr);
  let c2 = biquad('bandpass', f2, 6, sr);
  let k = 0;
  let prevEnv = 0;
  for (let s0 = 0; s0 < n; s0 += block, k++) {
    const t = s0 / sr;
    while (si < syl.length - 1 && t >= syl[si].start + syl[si].len) si++;
    const s = syl[si];
    const x = (t - s.start) / s.len;
    const env = x < 0.85 ? Math.sin((Math.PI * x) / 0.85) ** 0.7 * s.a : 0;
    const inc = (f0 * (1 + 0.1 * Math.sin(2 * Math.PI * 0.7 * t + phi) - (0.08 * t) / dur)) / sr;
    if (k % 4 === 0) {
      f1 += (s.v[0] - f1) * 0.35;
      f2 += (s.v[1] - f2) * 0.35;
      c1 = biquad('bandpass', f1, 4, sr);
      c2 = biquad('bandpass', f2, 6, sr);
    }
    const end = Math.min(n, s0 + block);
    /* 音量在區塊內線性內插（不會有階梯的雜音） */
    let g = prevEnv;
    const dg = (env - prevEnv) / block;
    prevEnv = env;
    for (let i = s0; i < end; i++) {
      g += dg;
      ph += inc;
      if (ph >= 1) ph -= 1;
      const xin = 2 * ph - 1 + (rng.next() - 0.5) * 0.5;
      const y1 = c1.b0 * xin + c1.b1 * ax1 + c1.b2 * ax2 - c1.a1 * ay1 - c1.a2 * ay2;
      ax2 = ax1;
      ax1 = xin;
      ay2 = ay1;
      ay1 = y1;
      const y2 = c2.b0 * xin + c2.b1 * bx1 + c2.b2 * bx2 - c2.a1 * by1 - c2.a2 * by2;
      bx2 = bx1;
      bx1 = xin;
      by2 = by1;
      by1 = y2;
      out[i] = (y1 + y2 * 0.6) * g;
    }
  }
  return out;
}

function crowdRender(ctx: RenderContext, people: number, clink: number, d: number): void {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const voices = Math.round(lerp(4, 24, people));
  for (let v = 0; v < voices; v++) {
    const f0 = rng.next() < 0.5 ? logRange(rng, 95, 140) : logRange(rng, 170, 250);
    const pan = rng.next() * 1.6 - 0.8;
    const level = logRange(rng, 0.35, 1) * 0.5;
    let t = rng.next() * 3;
    while (t < ctx.seconds) {
      const len = logRange(rng, 0.8, 3.5);
      addPanned(ctx.left, ctx.right, phrase(ctx, f0, len), t * sr, pan, level);
      t += len + logRange(rng, 0.4, 2.8);
    }
  }
  /* 人多的時候填滿空隙的低語 */
  addLayer(
    ctx,
    () => {
      const b = noise(ctx, 'pink', [biquad('bandpass', 480, 0.7, sr)]);
      return applyCurveGain(b, periodicCurve(ctx.n, 256, ctx.seconds / 2, rng), 0.6, 1);
    },
    0.04 + 0.12 * people,
  );
  /* 杯盤聲 */
  for (const t of poissonTimes(0.15 + 2.5 * clink, ctx.seconds, rng)) {
    const len = Math.round(0.6 * sr);
    const exc = noiseBurst(0.0002, sr, rng, 0.00005);
    let s: Float32Array;
    if (rng.next() < 0.55) {
      const f = logRange(rng, 2600, 5200);
      const tau = logRange(rng, 0.08, 0.16);
      s = resonate(exc, f, tau, sr, len);
      const s2 = resonate(exc, f * 2.76, tau * 0.6, sr, len);
      const s3 = resonate(exc, f * 5.4, tau * 0.3, sr, len);
      for (let i = 0; i < len; i++) s[i] += s2[i] * 0.5 + s3[i] * 0.2;
    } else {
      s = resonate(exc, logRange(rng, 3000, 6500), 0.03, sr, len);
      const nb = noiseBurst(0.003, sr, rng);
      for (let i = 0; i < nb.length; i++) s[i] += nb[i] * 0.4;
    }
    addPanned(ctx.left, ctx.right, s, t * sr, rng.next() * 1.6 - 0.8, logRange(rng, 0.03, 0.11));
  }
  reverbPeriodic(ctx.left, ctx.right, sr, { size: 0.45, damp: 0.45, wet: 0.15, dry: 1 });
  const lp = [biquad('lowpass', logLerp(5000, 1000, d), 0.6, sr)];
  filterPeriodic(ctx.left, lp, warmSamples(ctx));
  if (ctx.right) filterPeriodic(ctx.right, lp, warmSamples(ctx));
}

export const LIFE_SOUNDS: AmbienceSoundDef[] = [
  {
    id: 'crickets',
    category: 'life',
    label: '蟲鳴',
    description: '夏夜草叢裡的蟋蟀，唧唧、唧唧。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'count',
        label: '蟲的數量',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['一兩隻', '很多'],
      },
      {
        kind: 'range',
        id: 'far',
        label: '遠處的蟲鳴',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['沒有', '很多'],
      },
    ],
    gain: 2.7,
    render(ctx, p) {
      const u = unit(p.count);
      const far = unit(p.far);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      const crickets = 1 + Math.round(u * 11);
      for (let c = 0; c < crickets; c++) {
        const f = logRange(rng, 3800, 5200);
        const pulses = 2 + Math.floor(rng.next() * 3);
        const pan = rng.next() * 1.8 - 0.9;
        const level = logRange(rng, 0.2, 1) * 0.12;
        const shapes = [chirp(sr, f, pulses, rng), chirp(sr, f * 1.005, pulses, rng)];
        const count = Math.max(1, Math.round(ctx.seconds / logRange(rng, 0.35, 0.75)));
        const gap = ctx.seconds / count;
        /* 偶爾停下來一陣子 */
        const active = periodicCurve(ctx.n, 1024, ctx.seconds / 5, rng);
        for (let k = 0; k < count; k++) {
          const t = k * gap + (rng.next() * 2 - 1) * gap * 0.04;
          if (curveAt(active, Math.round(t * sr)) < 0.28) continue;
          addPanned(
            ctx.left,
            ctx.right,
            shapes[k % 2],
            t * sr,
            pan,
            level * logRange(rng, 0.85, 1),
          );
        }
      }
      if (far > 0) {
        addLayer(
          ctx,
          () => {
            const b = noise(ctx, 'white', [biquad('bandpass', 4700, 3, sr)]);
            for (let i = 0; i < b.length; i++)
              b[i] *= 0.6 + 0.4 * Math.abs(Math.sin((2 * Math.PI * 15 * i) / sr));
            return applyCurveGain(b, periodicCurve(ctx.n, 512, ctx.seconds / 4, rng), 0.6, 1);
          },
          0.05 * far,
        );
      }
    },
  },
  {
    id: 'owl',
    category: 'life',
    label: '貓頭鷹',
    description: '夜裡的森林，遠遠傳來貓頭鷹低沉的叫聲。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'rate',
        label: '頻率',
        min: 0,
        max: 100,
        step: 1,
        default: 35,
        ends: ['偶爾', '頻繁'],
      },
      {
        kind: 'range',
        id: 'distance',
        label: '距離',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['近', '遠'],
      },
    ],
    gain: 1.4,
    render(ctx, p) {
      const u = unit(p.rate);
      const d = unit(p.distance);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      const f = logRange(rng, 330, 420);
      const pattern = OWL_PATTERNS[Math.floor(rng.next() * OWL_PATTERNS.length)];
      const home = rng.next() * 1.2 - 0.6;
      const count = Math.max(1, Math.round(ctx.seconds * (0.03 + 0.12 * u)));
      for (const t of spreadTimes(count, ctx.seconds, rng, 0.4)) {
        const pan = home + (rng.next() - 0.5) * 0.3;
        const level = lerp(0.9, 0.45, d) * logRange(rng, 0.8, 1) * 0.45;
        for (const [at, len, mul, vib] of pattern) {
          addPanned(
            ctx.left,
            ctx.right,
            hoot(sr, f * mul, len, rng, vib),
            (t + at) * sr,
            pan,
            level,
          );
        }
      }
      const lp = [biquad('lowpass', logLerp(3500, 900, d), 0.6, sr)];
      filterPeriodic(ctx.left, lp, warmSamples(ctx));
      if (ctx.right) filterPeriodic(ctx.right, lp, warmSamples(ctx));
      reverbPeriodic(ctx.left, ctx.right, sr, {
        size: 0.55,
        damp: 0.6,
        wet: 0.1 + 0.3 * d,
        dry: 1,
      });
    },
  },
  {
    id: 'crowd',
    category: 'life',
    label: '遠方的人聲',
    description: '聽不清內容的交談聲；加上杯盤聲就是熱鬧的酒館或餐廳。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'people',
        label: '人數',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['幾個人', '很多人'],
      },
      {
        kind: 'range',
        id: 'clink',
        label: '杯盤聲',
        min: 0,
        max: 100,
        step: 1,
        default: 30,
        ends: ['沒有', '很多'],
      },
      {
        kind: 'range',
        id: 'distance',
        label: '距離',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['近', '遠'],
      },
    ],
    gain: 2.4,
    render(ctx, p) {
      crowdRender(ctx, unit(p.people), unit(p.clink), unit(p.distance));
    },
  },
];
