/**
 * 室內：時鐘、心跳、空調與日光燈、黑膠唱片的雜音、木頭的嘎吱聲。
 * 時鐘的滴答＝很短的敲擊經幾個共振（木頭、金屬）；心跳＝兩個往下滑的低頻「咚」；
 * 日光燈＝60 Hz（臺灣的市電）的倍頻；嘎吱聲＝越來越快又變慢的一串摩擦脈衝經木板的共振。
 */
import { addLayer, lerp, logLerp, noise, unit, warmSamples } from '../build';
import {
  addPanned,
  addSine,
  addWrapped,
  applyCurveGain,
  biquad,
  filterOnce,
  filterPeriodic,
  logRange,
  loopFrequency,
  noiseBurst,
  periodicCurve,
  poissonTimes,
  resonate,
  reverbPeriodic,
  spreadTimes,
} from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

/* ---------- 時鐘 ---------- */

type Mode = readonly [freq: number, tau: number, gain: number];

const CLOCKS: { interval: number; modes: Mode[]; tock: number; exc: number; level: number }[] = [
  /* 掛鐘 */
  {
    interval: 1,
    modes: [
      [1150, 0.016, 1],
      [2450, 0.009, 0.6],
      [4300, 0.022, 0.3],
    ],
    tock: 0.88,
    exc: 0.0003,
    level: 0.55,
  },
  /* 落地鐘：低沉、有箱子的共鳴 */
  {
    interval: 1,
    modes: [
      [620, 0.035, 1],
      [1480, 0.02, 0.55],
      [3100, 0.04, 0.3],
      [190, 0.06, 0.35],
    ],
    tock: 0.9,
    exc: 0.0006,
    level: 0.75,
  },
  /* 懷錶：細小、很快 */
  {
    interval: 0.2,
    modes: [
      [3900, 0.006, 1],
      [6400, 0.004, 0.6],
    ],
    tock: 0.93,
    exc: 0.0002,
    level: 0.3,
  },
];

function clockTick(ctx: RenderContext, modes: Mode[], mul: number, exc: number): Float32Array {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const e = noiseBurst(exc, sr, rng, 0.00005);
  const len = Math.round(0.25 * sr);
  const out = new Float32Array(len);
  for (const [f, tau, g] of modes) {
    const r = resonate(e, f * mul * logRange(rng, 0.985, 1.015), tau, sr, len);
    for (let i = 0; i < len; i++) out[i] += r[i] * g;
  }
  for (let i = 0; i < e.length; i++) out[i] += e[i] * 0.25;
  let pk = 0;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < len; i++) out[i] /= pk;
  return out;
}

/* ---------- 心跳 ---------- */

function thump(
  sr: number,
  f0: number,
  f1: number,
  glide: number,
  tau: number,
  rng: RenderContext['rng'],
): Float32Array {
  const n = Math.round(0.26 * sr);
  const out = new Float32Array(n);
  const atk = 0.006 * sr;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / glide);
    ph += (2 * Math.PI * f) / sr;
    const env = (i < atk ? i / atk : 1) * Math.exp(-t / tau);
    out[i] = (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph)) * env;
  }
  const nb = noiseBurst(0.018, sr, rng, 0.004);
  filterOnce(nb, [biquad('lowpass', 280, 0.7, sr)]);
  for (let i = 0; i < nb.length && i < n; i++) out[i] += nb[i] * 1.6;
  return out;
}

/* ---------- 嘎吱聲 ---------- */

function creakEvent(ctx: RenderContext, pitch: number): Float32Array {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const dur = logRange(rng, 0.4, 1.6);
  const len = Math.round((dur + 0.25) * sr);
  const imp = new Float32Array(len);
  const r0 = logRange(rng, 9, 24);
  const r1 = logRange(rng, 35, 110);
  let t = 0;
  while (t < dur) {
    const x = t / dur;
    const rate = r0 + (r1 - r0) * Math.sin(Math.PI * x);
    const i = Math.round(t * sr);
    if (i < len) imp[i] += Math.sin(Math.PI * x) ** 0.6 * (0.6 + 0.4 * rng.next());
    t += (1 / rate) * (0.85 + 0.3 * rng.next());
  }
  const base = logLerp(140, 520, pitch) * logRange(rng, 0.85, 1.15);
  const out = new Float32Array(len);
  const modes: Mode[] = [
    [1, 0.035, 1],
    [1.47, 0.025, 0.6],
    [2.21, 0.018, 0.4],
    [3.1, 0.012, 0.2],
  ];
  for (const [m, tau, g] of modes) {
    const r = resonate(imp, base * m, tau, sr, len);
    for (let i = 0; i < len; i++) out[i] += r[i] * g;
  }
  filterOnce(out, biquad('highpass', 90, 0.7, sr));
  let pk = 0;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]));
  const g = pk > 0 ? logRange(rng, 0.4, 1) / pk : 0;
  for (let i = 0; i < len; i++) out[i] *= g;
  return out;
}

export const INDOOR_SOUNDS: AmbienceSoundDef[] = [
  {
    id: 'clock',
    category: 'indoor',
    label: '時鐘',
    description: '安靜的房間裡，時鐘的滴答聲。',
    stereo: false,
    params: [
      {
        kind: 'choice',
        id: 'type',
        label: '種類',
        options: ['掛鐘', '落地鐘', '懷錶'],
        default: 0,
      },
      {
        kind: 'range',
        id: 'room',
        label: '房間的回聲',
        min: 0,
        max: 100,
        step: 1,
        default: 30,
        ends: ['小', '大'],
      },
    ],
    gain: 0.9,
    render(ctx, p) {
      const spec = CLOCKS[Math.max(0, Math.min(CLOCKS.length - 1, Math.round(p.type ?? 0)))];
      const room = unit(p.room);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      const variants = (mul: number) =>
        Array.from({ length: 3 }, () => clockTick(ctx, spec.modes, mul, spec.exc));
      const ticks = variants(1);
      const tocks = variants(spec.tock);
      /* 整段剛好整數個滴答（首尾相接） */
      const count = Math.max(2, Math.round(ctx.seconds / spec.interval / 2) * 2);
      const gap = ctx.seconds / count;
      for (let k = 0; k < count; k++) {
        const list = k % 2 ? tocks : ticks;
        const s = list[Math.floor(rng.next() * list.length)];
        const t = k * gap + (rng.next() * 2 - 1) * 0.0015;
        addWrapped(ctx.left, s, t * sr, spec.level * logRange(rng, 0.88, 1) * (k % 2 ? 0.85 : 1));
      }
      reverbPeriodic(ctx.left, null, sr, {
        size: 0.25 + 0.45 * room,
        damp: 0.45,
        wet: 0.04 + 0.3 * room,
        dry: 1,
      });
    },
  },
  {
    id: 'heartbeat',
    category: 'indoor',
    label: '心跳',
    description: '撲通、撲通的心跳；加快就是緊張的場面。',
    stereo: false,
    params: [
      {
        kind: 'range',
        id: 'bpm',
        label: '心跳數',
        min: 40,
        max: 160,
        step: 1,
        default: 64,
        unit: '下／分',
      },
      {
        kind: 'range',
        id: 'muffle',
        label: '悶',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['清楚', '悶在胸口'],
      },
    ],
    gain: 1.05,
    render(ctx, p) {
      const bpm = Math.max(40, Math.min(160, p.bpm ?? 64));
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      const count = Math.max(1, Math.round((ctx.seconds * bpm) / 60));
      const interval = ctx.seconds / count;
      const gap =
        Math.max(0.18, Math.min(0.38, 0.36 - 0.0018 * (bpm - 60))) * Math.min(1, interval / 0.6);
      for (let k = 0; k < count; k++) {
        const t = k * interval;
        const a = logRange(rng, 0.9, 1);
        addWrapped(ctx.left, thump(sr, 82, 46, 0.035, 0.05, rng), t * sr, 0.55 * a);
        addWrapped(ctx.left, thump(sr, 100, 62, 0.025, 0.035, rng), (t + gap) * sr, 0.4 * a);
      }
      const fc = lerp(1100, 230, unit(p.muffle));
      filterPeriodic(
        ctx.left,
        [biquad('lowpass', fc, 0.7, sr), biquad('lowpass', fc * 1.4, 0.7, sr)],
        warmSamples(ctx),
      );
    },
  },
  {
    id: 'office-hum',
    category: 'indoor',
    label: '空調與日光燈',
    description: '辦公室或醫院深夜的背景：空調的送風聲與日光燈的嗡嗡聲。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'hum',
        label: '日光燈的嗡嗡聲',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['沒有', '明顯'],
      },
      {
        kind: 'range',
        id: 'fan',
        label: '空調',
        min: 0,
        max: 100,
        step: 1,
        default: 55,
        ends: ['沒有', '大'],
      },
    ],
    gain: 3,
    render(ctx, p) {
      const h = unit(p.hum);
      const fan = unit(p.fan);
      const sr = ctx.sampleRate;
      const { rng, n } = ctx;
      if (h > 0) {
        /* 60 Hz 的倍頻（整數秒裡剛好整數個週期） */
        const hum = new Float32Array(n);
        const amps = [0.35, 1, 0.3, 0.55, 0.25, 0.3, 0.12, 0.15, 0.08, 0.1, 0.05, 0.06, 0.03, 0.04];
        amps.forEach((a, k) => {
          addSine(
            hum,
            loopFrequency(60 * (k + 1), ctx.seconds),
            a * logRange(rng, 0.8, 1.2),
            rng.next() * 2 * Math.PI,
            sr,
          );
        });
        applyCurveGain(hum, periodicCurve(n, 512, ctx.seconds / 3, rng), 0.88, 1);
        /* 一點高頻的滋滋聲，跟著 120 Hz 起伏 */
        const sizzle = noise(ctx, 'white', [biquad('bandpass', 5500, 1.5, sr)]);
        for (let i = 0; i < n; i++)
          sizzle[i] *= 0.5 + 0.5 * Math.abs(Math.sin((2 * Math.PI * 60 * i) / sr));
        for (let i = 0; i < n; i++) {
          const v = hum[i] * 0.055 * h + sizzle[i] * 0.012 * h;
          ctx.left[i] += v;
          if (ctx.right) ctx.right[i] += v;
        }
      }
      if (fan > 0) {
        addLayer(
          ctx,
          () => {
            const b = noise(ctx, 'pink', [
              biquad('lowpass', 950, 0.6, sr),
              biquad('highpass', 50, 0.7, sr),
              biquad('peaking', 300, 1, sr, 4),
            ]);
            const tone = noise(ctx, 'white', [biquad('bandpass', 180, 10, sr)]);
            for (let i = 0; i < n; i++) b[i] += tone[i] * 0.35;
            return applyCurveGain(b, periodicCurve(n, 512, ctx.seconds / 5, rng), 0.9, 1);
          },
          0.2 * fan,
        );
      }
    },
  },
  {
    id: 'vinyl',
    category: 'indoor',
    label: '黑膠唱片的雜音',
    description: '老唱片的沙沙聲與劈啪聲，1920 年代的書房或酒吧。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'crackle',
        label: '雜音',
        min: 0,
        max: 100,
        step: 1,
        default: 50,
        ends: ['少', '多'],
      },
      {
        kind: 'range',
        id: 'wear',
        label: '磨損',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['新', '舊'],
      },
    ],
    gain: 2,
    render(ctx, p) {
      const c = unit(p.crackle);
      const w = unit(p.wear);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      addLayer(
        ctx,
        () => noise(ctx, 'white', [biquad('bandpass', 3000, 0.35, sr)]),
        0.02 + 0.04 * w,
      );
      addLayer(ctx, () => noise(ctx, 'brown', [biquad('lowpass', 70, 0.7, sr)]), 0.06);
      for (const t of poissonTimes(25 + 140 * c, ctx.seconds, rng)) {
        const b = noiseBurst(logRange(rng, 0.00005, 0.0004), sr, rng, 0.00002);
        filterOnce(b, biquad('highpass', 1200, 0.7, sr));
        addPanned(
          ctx.left,
          ctx.right,
          b,
          t * sr,
          (rng.next() * 2 - 1) * 0.25,
          logRange(rng, 0.02, 0.45),
        );
      }
      for (const t of poissonTimes(0.2 + 1.4 * w, ctx.seconds, rng)) {
        const b = noiseBurst(logRange(rng, 0.0008, 0.003), sr, rng, 0.0001);
        filterOnce(b, biquad('lowpass', 2200, 0.7, sr));
        addPanned(
          ctx.left,
          ctx.right,
          b,
          t * sr,
          (rng.next() * 2 - 1) * 0.2,
          logRange(rng, 0.3, 0.9),
        );
      }
      /* 每轉一圈（33⅓ 轉，約 1.8 秒）一下很輕的咚 */
      const revs = Math.max(1, Math.round(ctx.seconds / 1.8));
      for (let k = 0; k < revs; k++) {
        const b = noiseBurst(0.02, sr, rng, 0.002);
        filterOnce(b, biquad('lowpass', 120, 0.7, sr));
        addPanned(ctx.left, ctx.right, b, ((k * ctx.seconds) / revs) * sr, 0, 0.3 * w);
      }
    },
  },
  {
    id: 'creak',
    category: 'indoor',
    label: '木頭的嘎吱聲',
    description: '老房子的地板或船身的木板，不時嘎吱作響。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'rate',
        label: '頻率',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['偶爾', '頻繁'],
      },
      {
        kind: 'range',
        id: 'pitch',
        label: '音高',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['粗重', '細'],
      },
    ],
    gain: 0.75,
    render(ctx, p) {
      const u = unit(p.rate);
      const h = unit(p.pitch);
      const sr = ctx.sampleRate;
      const count = Math.max(1, Math.round(ctx.seconds * (0.05 + 0.25 * u)));
      for (const t of spreadTimes(count, ctx.seconds, ctx.rng, 0.45)) {
        addPanned(ctx.left, ctx.right, creakEvent(ctx, h), t * sr, ctx.rng.next() * 1.4 - 0.7, 0.8);
      }
      reverbPeriodic(ctx.left, ctx.right, sr, { size: 0.25, damp: 0.5, wet: 0.06, dry: 1 });
    },
  },
];
