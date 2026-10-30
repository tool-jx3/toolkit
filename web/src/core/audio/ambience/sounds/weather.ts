/**
 * 雨與天氣：小雨、大雨、雨打在窗上、雨打在帳篷／傘上、雷、風。
 * 雨＝一層濾過的雜訊（雨幕）＋大量很短的雨滴（雜訊爆發經帶通濾波），風＝中心頻率隨陣風移動的帶通雜訊＋窄頻的呼嘯，
 * 雷＝低頻的隆隆聲（棕色雜訊依好幾段滾動的包絡起伏）＋近的時候的霹靂聲；
 * 帳篷／傘＝雨滴打在布上的「噗」（很短的敲擊經布面的低頻共振）＋布面細細的沙沙聲＋從邊緣滴到地上的水滴。
 */
import { addLayer, lerp, logLerp, noise, unit, warmSamples } from '../build';
import {
  addPanned,
  addWrapped,
  applyCurveGain,
  type Biquad,
  biquad,
  brownInPlace,
  type Curve,
  curveAt,
  decayingSine,
  fillWhite,
  filterOnce,
  filterPeriodic,
  filterVarying,
  logRange,
  noiseBurst,
  periodicCurve,
  poissonTimes,
  resonate,
  reverbPeriodic,
  spreadTimes,
} from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

const distance = (def: number) =>
  ({
    kind: 'range',
    id: 'distance',
    label: '距離',
    min: 0,
    max: 100,
    step: 1,
    default: def,
    ends: ['近', '遠'],
  }) as const;

const intensity = (def: number, label = '強度') =>
  ({
    kind: 'range',
    id: 'intensity',
    label,
    min: 0,
    max: 100,
    step: 1,
    default: def,
    ends: ['弱', '強'],
  }) as const;

/** 雨幕：粉紅雜訊經高通、低通，音量隨很慢的曲線起伏 */
function rainBed(
  ctx: RenderContext,
  o: { hp: number; lp: number; gain: number; surgeEvery: number; surgeLo: number },
): void {
  const sr = ctx.sampleRate;
  const block = 256;
  addLayer(
    ctx,
    () => {
      const b = noise(ctx, 'pink', [
        biquad('highpass', o.hp, 0.6, sr),
        biquad('lowpass', o.lp, 0.6, sr),
      ]);
      const c = periodicCurve(ctx.n, block, ctx.seconds / o.surgeEvery, ctx.rng);
      return applyCurveGain(b, c, o.surgeLo, 1);
    },
    o.gain,
  );
}

/** 一批雨滴：每滴是很短的雜訊爆發經帶通（中心頻率隨機），隨機左右位置 */
function drops(
  ctx: RenderContext,
  o: {
    rate: number;
    tau: [number, number];
    freq: [number, number];
    q: number;
    gain: [number, number];
    spread: number;
  },
): void {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  for (const t of poissonTimes(o.rate, ctx.seconds, rng)) {
    const burst = noiseBurst(logRange(rng, o.tau[0], o.tau[1]), sr, rng);
    filterOnce(burst, biquad('bandpass', logRange(rng, o.freq[0], o.freq[1]), o.q, sr));
    addPanned(
      ctx.left,
      ctx.right,
      burst,
      t * sr,
      (rng.next() * 2 - 1) * o.spread,
      logRange(rng, o.gain[0], o.gain[1]),
    );
  }
}

/** 落在水窪上的「滴」聲 */
function plips(ctx: RenderContext, rate: number, gain: number): void {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  for (const t of poissonTimes(rate, ctx.seconds, rng)) {
    const f = logRange(rng, 900, 2800);
    const s = decayingSine(f, logRange(rng, 0.006, 0.018), sr, {
      chirp: logRange(rng, 15, 40),
      attack: 0.0006,
    });
    addPanned(ctx.left, ctx.right, s, t * sr, rng.next() * 1.6 - 0.8, gain * logRange(rng, 0.2, 1));
  }
}

/** 整個輸出的低通（距離：越遠越悶） */
function muffle(ctx: RenderContext, fc: number, q = 0.6): void {
  const f: Biquad[] = [biquad('lowpass', fc, q, ctx.sampleRate)];
  filterPeriodic(ctx.left, f, warmSamples(ctx));
  if (ctx.right) filterPeriodic(ctx.right, f, warmSamples(ctx));
}

/* ---------- 雨打在帳篷／傘上 ---------- */

interface Canopy {
  /** 布面的共振（Hz）：每一滴在這個範圍裡隨機 */
  res: readonly [number, number];
  /** 共振的衰減（秒） */
  tau: readonly [number, number];
  /** 雨滴打到布的那一下「啪」（高頻）的比例 */
  click: number;
  /** 整個布面那一層的低通（布越大越悶） */
  lp: number;
  /** 雨滴左右的範圍（帳篷四面八方、傘集中在頭上） */
  spread: number;
  /** 雨滴數的倍數（布的面積） */
  area: number;
  /** 周圍的雨（打在地上）的低通：帳篷裡隔著布、比較悶 */
  bedLp: number;
  /** 布面沙沙聲的中心頻率 */
  hiss: number;
  /** 滴水的地方有幾個 */
  spots: readonly [number, number];
  /** 帳篷裡的小空間的回聲 */
  room: number;
  /** 雨滴的音量（傘就在頭上，比較大聲） */
  level: number;
}

const CANOPIES: readonly Canopy[] = [
  /* 帳篷：大片的布，低沉、悶，四面八方都有雨滴；水從兩側的邊緣滴下來 */
  {
    res: [110, 320],
    tau: [0.008, 0.02],
    click: 0.2,
    lp: 2800,
    spread: 0.9,
    area: 1.3,
    bedLp: 1700,
    hiss: 340,
    spots: [2, 4],
    room: 0.06,
    level: 1,
  },
  /* 傘：小而繃緊的布，比較高、清脆，雨滴集中在頭上；水從傘緣一圈滴下來 */
  {
    res: [260, 700],
    tau: [0.005, 0.012],
    click: 0.4,
    lp: 5200,
    spread: 0.45,
    area: 1,
    bedLp: 6500,
    hiss: 650,
    spots: [4, 7],
    room: 0,
    level: 1.5,
  },
];

/** 一滴打在布上：很短的雜訊敲擊經布面的兩個共振＋一點高頻的「啪」（峰值正規化到 1） */
function canopyDrop(ctx: RenderContext, c: Canopy): Float32Array {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const len = Math.round(0.06 * sr);
  const exc = noiseBurst(logRange(rng, 0.0003, 0.0012), sr, rng);
  const f = logRange(rng, c.res[0], c.res[1]);
  const tau = logRange(rng, c.tau[0], c.tau[1]);
  const out = resonate(exc, f, tau, sr, len);
  const second = resonate(exc, f * logRange(rng, 1.5, 1.8), tau * 0.6, sr, len);
  const click = Float32Array.from(exc);
  filterOnce(click, biquad('bandpass', logRange(rng, 1800, 3600), 1, sr));
  for (let i = 0; i < len; i++)
    out[i] += second[i] * 0.45 + (i < click.length ? click[i] * c.click * 6 : 0);
  let pk = 0;
  for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < len; i++) out[i] /= pk;
  return out;
}

/** 從布的邊緣滴到地上（水窪）的一滴：往上滑的衰減正弦＋低沉的「咚」 */
function groundDrip(ctx: RenderContext, f0: number): Float32Array {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const s = decayingSine(f0 * logRange(rng, 0.92, 1.08), logRange(rng, 0.012, 0.028), sr, {
    chirp: logRange(rng, 6, 18),
    attack: 0.0008,
  });
  const thud = noiseBurst(0.003, sr, rng, 0.0005);
  filterOnce(thud, biquad('lowpass', 900, 0.7, sr));
  for (let i = 0; i < thud.length && i < s.length; i++) s[i] += thud[i] * 0.5;
  return s;
}

function canopyRender(ctx: RenderContext, c: Canopy, u: number, dr: number): void {
  const sr = ctx.sampleRate;
  const { rng, n } = ctx;
  /* 周圍的雨（打在地上）與布面細細的沙沙聲（數不清的小雨滴） */
  rainBed(ctx, { hp: 300, lp: c.bedLp, gain: 0.03 + 0.06 * u, surgeEvery: 6, surgeLo: 0.7 });
  addLayer(
    ctx,
    () => {
      const b = noise(ctx, 'pink', [biquad('bandpass', c.hiss, 0.9, sr)]);
      return applyCurveGain(b, periodicCurve(n, 256, ctx.seconds / 4, rng), 0.75, 1);
    },
    0.015 + 0.045 * u,
  );
  /* 打在布上的雨滴：48 種預先做好的「噗」隨機用，大小、位置各自隨機 */
  const bank = Array.from({ length: 48 }, () => canopyDrop(ctx, c));
  const fl = new Float32Array(n);
  const fr = ctx.right ? new Float32Array(n) : null;
  const rate = (12 + 260 * u ** 1.3) * c.area;
  /* 雨很大時雨滴重疊得多：每一滴小聲一點（不然整段都被柔和限幅壓著） */
  const dropGain = (0.38 * c.level) / (1 + 0.7 * u);
  for (const t of poissonTimes(rate, ctx.seconds, rng)) {
    const d = bank[Math.floor(rng.next() * bank.length)];
    addPanned(
      fl,
      fr,
      d,
      t * sr,
      (rng.next() * 2 - 1) * c.spread,
      dropGain * logRange(rng, 0.08, 1),
    );
  }
  const lp = biquad('lowpass', c.lp, 0.7, sr);
  filterPeriodic(fl, lp, warmSamples(ctx));
  for (let i = 0; i < n; i++) ctx.left[i] += fl[i];
  if (fr && ctx.right) {
    filterPeriodic(fr, lp, warmSamples(ctx));
    for (let i = 0; i < n; i++) ctx.right[i] += fr[i];
  }
  /* 從邊緣滴下來的水：幾個固定的地方，各自的音高與大約固定的間隔（雨越大滴得越快） */
  if (dr > 0) {
    const spots = c.spots[0] + Math.floor(rng.next() * (c.spots[1] - c.spots[0] + 1));
    for (let k = 0; k < spots; k++) {
      const pan =
        c === CANOPIES[0]
          ? (k % 2 ? 1 : -1) * (0.5 + 0.4 * rng.next())
          : ((k + rng.next() * 0.6) / spots) * 1.8 - 0.9;
      const interval = (lerp(3.2, 0.45, dr) * logRange(rng, 0.7, 1.4)) / (0.6 + 0.8 * u);
      const count = Math.max(1, Math.round(ctx.seconds / interval));
      const f0 = logRange(rng, 450, 1300);
      const g = logRange(rng, 0.35, 0.8) * (0.4 + 0.6 * dr);
      for (const t of spreadTimes(count, ctx.seconds, rng, 0.3))
        addPanned(ctx.left, ctx.right, groundDrip(ctx, f0), t * sr, pan, g * logRange(rng, 0.6, 1));
    }
  }
  if (c.room > 0)
    reverbPeriodic(ctx.left, ctx.right, sr, { size: 0.15, damp: 0.5, wet: c.room, dry: 1 });
}

/* ---------- 雷 ---------- */

function thunderEvent(ctx: RenderContext, d: number): { l: Float32Array; r: Float32Array } {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  const dur = 6 + rng.next() * 6;
  const n = Math.round(dur * sr);
  const env = new Float32Array(n);
  /* 幾段滾動：第一段最強（近的時候），之後隨機 */
  const rolls = 3 + Math.floor(rng.next() * 5);
  const attack = 0.04 + 0.45 * d;
  for (let j = 0; j < rolls; j++) {
    const at = j === 0 ? rng.next() * 0.1 : rng.next() * dur * 0.55;
    const amp = j === 0 ? 1 : logRange(rng, 0.25, 0.9);
    const tau = logRange(rng, 0.5, 1.8) * (1 + d * 0.6);
    const s0 = Math.round(at * sr);
    const atk = Math.max(1, attack * sr * (0.6 + rng.next() * 0.8));
    for (let i = s0; i < n; i++) {
      const t = (i - s0) / sr;
      const a = i - s0 < atk ? (i - s0) / atk : 1;
      env[i] += amp * a * Math.exp(-t / tau);
    }
  }
  /* 整體慢慢衰減＋快速的起伏（滾動感） */
  const flutter = periodicCurve(n, 64, dur * 7, rng);
  const overall = 2.5 + 2 * d;
  for (let i = 0; i < n; i++)
    env[i] *= Math.exp(-i / sr / overall) * (0.55 + 0.45 * curveAt(flutter, i));
  const fc = lerp(420, 110, d);
  const make = () => {
    const b = fillWhite(new Float32Array(n), rng);
    brownInPlace(b, 0);
    filterOnce(b, [
      biquad('lowpass', fc, 0.7, sr),
      biquad('lowpass', fc * 1.3, 0.7, sr),
      biquad('highpass', 28, 0.7, sr),
    ]);
    for (let i = 0; i < n; i++) b[i] *= env[i];
    return b;
  };
  const l = make();
  const r = make();
  /* 霹靂聲（近的時候）：起音很快的寬頻爆裂 */
  const crack = (1 - d) ** 2;
  if (crack > 0.02) {
    const pan = rng.next() * 1.2 - 0.6;
    const pieces = 1 + Math.floor(rng.next() * 3);
    for (let k = 0; k < pieces; k++) {
      const b = noiseBurst(logRange(rng, 0.08, 0.22), sr, rng, 0.003);
      filterOnce(b, [
        biquad('highpass', 220, 0.7, sr),
        biquad('lowpass', lerp(5200, 2500, d), 0.7, sr),
      ]);
      const at = Math.round((k === 0 ? 0 : rng.next() * 0.35) * sr);
      const g = crack * (k === 0 ? 2.2 : 1.2) * logRange(rng, 0.6, 1);
      const a = ((pan + 1) * Math.PI) / 4;
      for (let i = 0; i < b.length && at + i < n; i++) {
        l[at + i] += b[i] * g * Math.cos(a);
        r[at + i] += b[i] * g * Math.sin(a);
      }
    }
  }
  /* 依距離決定峰值（遠的比較小聲），每一聲再隨機 ±25% */
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
  const target = lerp(0.95, 0.5, d) * logRange(rng, 0.75, 1);
  const g = pk > 0 ? target / pk : 0;
  for (let i = 0; i < n; i++) {
    l[i] *= g;
    r[i] *= g;
  }
  return { l, r };
}

/* ---------- 風 ---------- */

function windRender(ctx: RenderContext, s: number, howl: number): void {
  const sr = ctx.sampleRate;
  const { rng, n } = ctx;
  const block = 64;
  /* 陣風：快的（約 2.5 秒一點）與慢的（約 7 秒一點）合成，高峰少、平時低 */
  const fast = periodicCurve(n, block, ctx.seconds / 2.5, rng, (u) => u ** 1.6);
  const slow = periodicCurve(n, block, ctx.seconds / 7, rng);
  const g: Curve = { values: new Float32Array(fast.values.length), block };
  for (let k = 0; k < g.values.length; k++)
    g.values[k] = 0.3 * slow.values[k] + 0.7 * fast.values[k];
  /* 右聲道的陣風晚一點點到（從一邊吹到另一邊） */
  const shift = Math.round((0.35 * sr) / block);
  const gAt = (k: number, right: boolean) =>
    g.values[(k + (right ? g.values.length - shift : 0)) % g.values.length];
  const warm = warmSamples(ctx);
  const channel = (right: boolean) => {
    const out = new Float32Array(n);
    /* 主體：帶通雜訊，中心頻率與音量隨陣風 */
    const b = noise(ctx, 'pink');
    filterVarying(
      b,
      block,
      (k) => biquad('bandpass', 220 + (420 + 900 * s) * gAt(k, right), 0.8, sr),
      warm,
    );
    filterPeriodic(b, biquad('lowpass', 3200, 0.6, sr), warm);
    /* 低頻的轟轟聲 */
    const low = noise(ctx, 'brown', [biquad('lowpass', 170, 0.7, sr)]);
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i / block);
      const v = gAt(k, right);
      out[i] = b[i] * (0.18 + 0.82 * v) ** (1 + s) * 2.4 + low[i] * (0.25 + 0.75 * v) * 0.55;
    }
    /* 呼嘯：很窄的帶通，頻率跟著陣風上升 */
    if (howl > 0) {
      for (const [mul, pan] of [
        [1, right ? 0.4 : 1],
        [1.37, right ? 1 : 0.4],
      ] as const) {
        const h = noise(ctx, 'white');
        filterVarying(
          h,
          block,
          (k) => biquad('bandpass', (340 + 520 * gAt(k, right) ** 1.2) * mul, 22, sr),
          warm,
        );
        for (let i = 0; i < n; i++) {
          const v = gAt(Math.floor(i / block), right);
          out[i] += h[i] * v * v * howl * 1.6 * pan;
        }
      }
    }
    return out;
  };
  const l = channel(false);
  for (let i = 0; i < n; i++) ctx.left[i] += l[i];
  if (ctx.right) {
    const r = channel(true);
    for (let i = 0; i < n; i++) ctx.right[i] += r[i];
  }
}

export const WEATHER_SOUNDS: AmbienceSoundDef[] = [
  {
    id: 'rain-light',
    category: 'weather',
    label: '小雨',
    description: '細細的雨聲，偶爾有雨滴落在水窪。',
    stereo: true,
    params: [intensity(45), distance(30)],
    gain: 10,
    render(ctx, p) {
      const u = unit(p.intensity);
      const d = unit(p.distance);
      rainBed(ctx, {
        hp: 700,
        lp: logLerp(9000, 3500, d),
        gain: 0.05 + 0.07 * u,
        surgeEvery: 5,
        surgeLo: 0.7,
      });
      drops(ctx, {
        rate: 25 + 140 * u,
        tau: [0.0012, 0.0035],
        freq: [1800 * (1 - 0.4 * d), 7500 * (1 - 0.5 * d)],
        q: 1.3,
        gain: [0.02, 0.22],
        spread: 0.9,
      });
      plips(ctx, 1.5 + 5 * u, 0.06);
      muffle(ctx, logLerp(15000, 3800, d));
    },
  },
  {
    id: 'rain-heavy',
    category: 'weather',
    label: '大雨',
    description: '傾盆大雨，嘩啦啦打在地面與屋頂。',
    stereo: true,
    params: [intensity(60), distance(30)],
    gain: 4,
    render(ctx, p) {
      const u = unit(p.intensity);
      const d = unit(p.distance);
      const sr = ctx.sampleRate;
      rainBed(ctx, {
        hp: 280,
        lp: logLerp(8000, 2600, d),
        gain: 0.16 + 0.14 * u,
        surgeEvery: 8,
        surgeLo: lerp(0.8, 0.5, u),
      });
      /* 低沉的轟轟聲（大量的雨打在屋頂、地面） */
      addLayer(ctx, () => noise(ctx, 'brown', [biquad('lowpass', 260, 0.7, sr)]), 0.05 + 0.06 * u);
      drops(ctx, {
        rate: 250 + 550 * u,
        tau: [0.0008, 0.0028],
        freq: [1000, 6500 * (1 - 0.5 * d)],
        q: 1,
        gain: [0.015, 0.12],
        spread: 1,
      });
      /* 比較大的水花 */
      drops(ctx, {
        rate: 12 + 30 * u,
        tau: [0.006, 0.018],
        freq: [500, 2600],
        q: 0.8,
        gain: [0.03, 0.12],
        spread: 0.9,
      });
      muffle(ctx, logLerp(15000, 3500, d));
    },
  },
  {
    id: 'rain-window',
    category: 'weather',
    label: '雨打在窗上',
    description: '在屋裡聽雨點敲著玻璃，窗外是悶悶的雨聲。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'taps',
        label: '雨點',
        min: 0,
        max: 100,
        step: 1,
        default: 50,
        ends: ['稀疏', '密集'],
      },
      {
        kind: 'range',
        id: 'outside',
        label: '窗外的雨',
        min: 0,
        max: 100,
        step: 1,
        default: 50,
        ends: ['小', '大'],
      },
    ],
    gain: 6,
    render(ctx, p) {
      const u = unit(p.taps);
      const o = unit(p.outside);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      /* 隔著玻璃的雨聲（悶） */
      rainBed(ctx, { hp: 120, lp: 1300, gain: 0.04 + 0.16 * o, surgeEvery: 6, surgeLo: 0.65 });
      /* 雨點敲玻璃：很短的敲擊經兩個共振（玻璃的「叮」很短）＋一點水的「啪」 */
      for (const t of poissonTimes(3 + 26 * u, ctx.seconds, rng)) {
        const f = logRange(rng, 1700, 4600);
        const exc = noiseBurst(0.00025, sr, rng);
        const len = Math.round(0.08 * sr);
        const a = resonate(exc, f, logRange(rng, 0.006, 0.016), sr, len);
        const b = resonate(exc, f * logRange(rng, 1.45, 1.75), logRange(rng, 0.004, 0.01), sr, len);
        const pat = noiseBurst(logRange(rng, 0.002, 0.005), sr, rng);
        filterOnce(pat, biquad('bandpass', logRange(rng, 700, 1600), 1.2, sr));
        for (let i = 0; i < len; i++) a[i] += b[i] * 0.5 + (pat[i] ?? 0) * 0.6;
        addPanned(
          ctx.left,
          ctx.right,
          a,
          t * sr,
          rng.next() * 1.4 - 0.7,
          logRange(rng, 0.04, 0.35),
        );
      }
    },
  },
  {
    id: 'rain-tent',
    category: 'weather',
    label: '雨打在帳篷／傘上',
    description: '躲在帳篷裡或撐著傘：雨滴打在布上悶悶的「噗噗」聲，邊緣不停滴水。',
    stereo: true,
    params: [
      {
        kind: 'choice',
        id: 'canopy',
        label: '在哪裡',
        options: ['帳篷裡', '傘下'],
        default: 0,
      },
      intensity(50, '雨勢'),
      {
        kind: 'range',
        id: 'drips',
        label: '滴落',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['沒有', '很多'],
      },
    ],
    gain: 1.9,
    render(ctx, p) {
      const c = CANOPIES[Math.max(0, Math.min(CANOPIES.length - 1, Math.round(p.canopy ?? 0)))];
      canopyRender(ctx, c, unit(p.intensity), unit(p.drips));
    },
  },
  {
    id: 'thunder',
    category: 'weather',
    label: '雷',
    description: '不時傳來的雷聲：近的有霹靂一聲，遠的只有低沉的隆隆聲。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'frequency',
        label: '頻率',
        min: 0,
        max: 100,
        step: 1,
        default: 35,
        ends: ['偶爾', '頻繁'],
      },
      distance(55),
    ],
    gain: 0.95,
    render(ctx, p) {
      const u = unit(p.frequency);
      const d = unit(p.distance);
      const sr = ctx.sampleRate;
      const interval = lerp(60, 12, u);
      const count = Math.max(1, Math.round(ctx.seconds / interval));
      for (const t of spreadTimes(count, ctx.seconds, ctx.rng, 0.3)) {
        const ev = thunderEvent(ctx, d);
        if (ctx.right) {
          addWrapped(ctx.left, ev.l, t * sr);
          addWrapped(ctx.right, ev.r, t * sr);
        } else {
          addWrapped(ctx.left, ev.l, t * sr, 0.5);
          addWrapped(ctx.left, ev.r, t * sr, 0.5);
        }
      }
    },
  },
  {
    id: 'wind',
    category: 'weather',
    label: '風',
    description: '一陣一陣的風，強的時候會呼嘯。',
    stereo: true,
    params: [
      intensity(45),
      {
        kind: 'range',
        id: 'howl',
        label: '呼嘯',
        min: 0,
        max: 100,
        step: 1,
        default: 25,
        ends: ['沒有', '尖銳'],
      },
    ],
    gain: 0.65,
    render(ctx, p) {
      windRender(ctx, unit(p.intensity), unit(p.howl) * 0.35);
    },
  },
];
