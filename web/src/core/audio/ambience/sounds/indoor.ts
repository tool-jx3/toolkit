/**
 * 室內：時鐘、心跳、空調與日光燈、房間底噪、黑膠唱片的雜音、木頭的嘎吱聲。
 * 時鐘的滴答＝很短的敲擊經幾個共振（木頭、金屬）；心跳＝兩個往下滑的低頻「咚」；
 * 日光燈＝60 Hz（臺灣的市電）的倍頻；嘎吱聲＝越來越快又變慢的一串摩擦脈衝經木板的共振；
 * 房間底噪＝房間的空氣聲（很暗的粉紅雜訊）＋冰箱壓縮機低低的嗡嗡聲＋窗外遠方的車流（一台一台開過去）＋房間的殘響。
 */
import { addLayer, lerp, logLerp, noise, unit, warmSamples } from '../build';
import {
  addPanned,
  addSine,
  addWrapped,
  applyCurveGain,
  biquad,
  fillWhite,
  filterOnce,
  filterPeriodic,
  logRange,
  loopFrequency,
  noiseBurst,
  panGains,
  periodicCurve,
  pinkInPlace,
  poissonTimes,
  resonate,
  reverbPeriodic,
  spreadTimes,
} from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

/* ---------- 時鐘 ---------- */

type Mode = readonly [freq: number, tau: number, gain: number];

/** extra：機芯的第二下（[延遲秒數, 音量]；懷錶的擒縱是「喀喀」兩下） */
const CLOCKS: {
  interval: number;
  modes: Mode[];
  tock: number;
  exc: number;
  level: number;
  extra?: readonly [number, number];
  /** 敲擊聲的飽和（tanh；大於 0 時尾巴相對變大，同樣的峰值聽起來比較大聲） */
  drive?: number;
}[] = [
  /* 掛鐘：木頭的殼＋金屬的機芯 */
  {
    interval: 1,
    modes: [
      [1150, 0.03, 1],
      [2450, 0.016, 0.55],
      [4300, 0.035, 0.3],
      [560, 0.04, 0.45],
    ],
    tock: 0.88,
    exc: 0.0005,
    level: 1,
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
    level: 0.65,
  },
  /* 懷錶：細小、很快（每秒 5 聲） */
  {
    interval: 0.2,
    modes: [
      [3900, 0.022, 1],
      [6400, 0.014, 0.6],
      [2200, 0.03, 0.5],
      [1350, 0.025, 0.35],
    ],
    tock: 0.93,
    exc: 0.0003,
    level: 0.9,
    extra: [0.007, 0.75],
    drive: 2.5,
  },
];

function clockTick(ctx: RenderContext, spec: (typeof CLOCKS)[number], mul: number): Float32Array {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const one = noiseBurst(spec.exc, sr, rng, 0.00005);
  let e: Float32Array = one;
  if (spec.extra) {
    const at = Math.round(spec.extra[0] * sr);
    e = new Float32Array(at + one.length);
    e.set(one);
    const two = noiseBurst(spec.exc, sr, rng, 0.00005);
    for (let i = 0; i < two.length; i++) e[at + i] += two[i] * spec.extra[1];
  }
  const len = Math.round(0.25 * sr);
  const out = new Float32Array(len);
  for (const [f, tau, g] of spec.modes) {
    const r = resonate(e, f * mul * logRange(rng, 0.985, 1.015), tau, sr, len);
    for (let i = 0; i < len; i++) out[i] += r[i] * g;
  }
  for (let i = 0; i < e.length; i++) out[i] += e[i] * 0.25;
  let pk = 0;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < len; i++) out[i] /= pk;
  if (spec.drive) {
    const k = spec.drive;
    const norm = Math.tanh(k);
    for (let i = 0; i < len; i++) out[i] = Math.tanh(k * out[i]) / norm;
  }
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

/* ---------- 房間底噪 ---------- */

/** 遠方開過去的一台車：低沉的雜訊，4～10 秒裡慢慢變大再變小，從一邊移到另一邊（l、r 兩個聲道） */
function passingCar(ctx: RenderContext): { l: Float32Array; r: Float32Array } {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const dur = logRange(rng, 4, 10);
  const len = Math.round(dur * sr);
  const x = fillWhite(new Float32Array(len), rng);
  pinkInPlace(x, 0);
  filterOnce(x, [
    biquad('bandpass', logRange(rng, 180, 520), 0.7, sr),
    biquad('lowpass', 900, 0.7, sr),
  ]);
  /* 最近的時候在 35%～65% 的地方；音量是兩段平滑的鐘形 */
  const top = 0.35 + 0.3 * rng.next();
  const from = (rng.next() < 0.5 ? -1 : 1) * (0.5 + 0.4 * rng.next());
  const to = -from * (0.6 + 0.4 * rng.next());
  const l = new Float32Array(len);
  const r = new Float32Array(len);
  /* 音量與位置每 64 個取樣算一次（區塊內不變，變化很慢聽不出來） */
  for (let s = 0; s < len; s += 64) {
    const t = (s + 32) / len;
    const env =
      t < top
        ? Math.sin(((Math.PI / 2) * t) / top) ** 2
        : Math.cos(((Math.PI / 2) * (t - top)) / (1 - top)) ** 2;
    const [gl, gr] = panGains(from + (to - from) * t);
    const e = Math.min(len, s + 64);
    for (let i = s; i < e; i++) {
      l[i] = x[i] * env * gl;
      r[i] = x[i] * env * gr;
    }
  }
  return { l, r };
}

function roomToneRender(ctx: RenderContext, h: number, tr: number, room: number): void {
  const sr = ctx.sampleRate;
  const { rng, n } = ctx;
  /* 房間的空氣聲：很暗的粉紅雜訊（一直都在，三個都調到最小時也還有） */
  addLayer(
    ctx,
    () => {
      const b = noise(ctx, 'pink', [
        biquad('lowpass', 1800, 0.6, sr),
        biquad('highpass', 35, 0.7, sr),
      ]);
      return applyCurveGain(b, periodicCurve(n, 512, ctx.seconds / 8, rng), 0.85, 1);
    },
    0.03,
  );
  /* 冰箱的壓縮機：60 Hz 與倍頻（120 Hz 最強；整數秒裡剛好整數個週期）＋馬達低沉的轟轟聲，慢慢地有點起伏 */
  if (h > 0) {
    const hum = new Float32Array(n);
    for (const [k, a] of [
      [1, 0.45],
      [2, 1],
      [3, 0.22],
      [4, 0.1],
    ] as const) {
      addSine(hum, loopFrequency(60 * k, ctx.seconds), a, rng.next() * 2 * Math.PI, sr);
    }
    const motor = noise(ctx, 'brown', [biquad('bandpass', 95, 2, sr)]);
    for (let i = 0; i < n; i++) hum[i] = hum[i] * 0.03 + motor[i] * 0.12;
    applyCurveGain(hum, periodicCurve(n, 512, ctx.seconds / 6, rng), 0.75, 1);
    /* 在房間的一邊（左邊大一點） */
    for (let i = 0; i < n; i++) {
      const v = hum[i] * h * 0.45;
      ctx.left[i] += v;
      if (ctx.right) ctx.right[i] += v * 0.75;
    }
  }
  /* 窗外遠方的車流：一層低沉的轟轟聲＋一台一台開過去 */
  if (tr > 0) {
    addLayer(
      ctx,
      () => {
        const b = noise(ctx, 'brown', [biquad('lowpass', 300, 0.7, sr)]);
        return applyCurveGain(b, periodicCurve(n, 512, ctx.seconds / 7, rng), 0.55, 1);
      },
      0.055 * tr,
    );
    const cars = Math.max(1, Math.round((ctx.seconds / 60) * (2 + 14 * tr)));
    for (const t of spreadTimes(cars, ctx.seconds, rng, 0.45)) {
      const car = passingCar(ctx);
      const g = 0.13 * tr * logRange(rng, 0.35, 1);
      if (ctx.right) {
        addWrapped(ctx.left, car.l, t * sr, g);
        addWrapped(ctx.right, car.r, t * sr, g);
      } else {
        addWrapped(ctx.left, car.l, t * sr, g * 0.7);
        addWrapped(ctx.left, car.r, t * sr, g * 0.7);
      }
    }
  }
  /* 房間的殘響（房間越大越長、越多） */
  reverbPeriodic(ctx.left, ctx.right, sr, {
    size: 0.15 + 0.55 * room,
    damp: 0.55,
    wet: 0.04 + 0.22 * room,
    dry: 1,
  });
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
      const variants = (mul: number) => Array.from({ length: 3 }, () => clockTick(ctx, spec, mul));
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
      /* 最小 10：兩個都調到 0 時這一軌就完全沒有聲音了 */
      {
        kind: 'range',
        id: 'fan',
        label: '空調',
        min: 10,
        max: 100,
        step: 1,
        default: 55,
        ends: ['小', '大'],
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
    id: 'room-tone',
    category: 'indoor',
    label: '房間底噪',
    description: '安靜的房間：冰箱低低的嗡嗡聲、窗外遠方的車流，房間裡的空氣感。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'hum',
        label: '冰箱的嗡嗡聲',
        min: 0,
        max: 100,
        step: 1,
        default: 35,
        ends: ['沒有', '明顯'],
      },
      {
        kind: 'range',
        id: 'traffic',
        label: '遠方的車流',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['沒有', '很多'],
      },
      {
        kind: 'range',
        id: 'room',
        label: '房間',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['小', '大'],
      },
    ],
    gain: 6.7,
    render(ctx, p) {
      roomToneRender(ctx, unit(p.hum), unit(p.traffic), unit(p.room));
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
