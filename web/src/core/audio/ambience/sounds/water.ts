/**
 * 水：海浪、溪流、洞窟的水滴、水底。
 * 海浪＝依一道道浪的包絡（湧上、拍岸、退去）改變亮度與音量的雜訊＋退浪的泡沫聲；
 * 溪流與水底的氣泡＝頻率往上滑的衰減正弦（小氣泡高、大氣泡低）；水滴＝清脆的「叮」加上洞窟的殘響。
 */
import { addLayer, lerp, logLerp, noise, unit, warmSamples } from '../build';
import {
  addPanned,
  applyCurveGain,
  biquad,
  decayingSine,
  filterOnce,
  filterPeriodic,
  filterVarying,
  logRange,
  noiseBurst,
  periodicCurve,
  poissonTimes,
  reverbPeriodic,
} from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

/* ---------- 海浪 ---------- */

interface WaveShape {
  /** 每個區塊的音量、亮度、泡沫（0～1） */
  amp: Float32Array;
  bright: Float32Array;
  foam: Float32Array;
  /** 每個區塊的左右（−1～1） */
  pan: Float32Array;
}

function waveShape(ctx: RenderContext, block: number, size: number): WaveShape {
  const { rng } = ctx;
  const blocks = Math.ceil(ctx.n / block);
  const amp = new Float32Array(blocks);
  const bright = new Float32Array(blocks);
  const foam = new Float32Array(blocks);
  const pan = new Float32Array(blocks);
  const period = lerp(10, 7.5, size);
  const count = Math.max(1, Math.round(ctx.seconds / period));
  /* 每道浪的長度隨機，總和剛好是整段（首尾相接） */
  const lens = Array.from({ length: count }, () => 0.7 + rng.next() * 0.6);
  const sum = lens.reduce((a, b) => a + b, 0);
  const base = 0.22;
  let start = rng.next() * blocks;
  for (let j = 0; j < count; j++) {
    const len = (lens[j] / sum) * blocks;
    const h = lerp(0.55, 1, rng.next()) * lerp(0.75, 1, size);
    const p = rng.next() * 1.2 - 0.6;
    const crest = 0.32 + rng.next() * 0.12;
    for (let k = 0; k < Math.ceil(len); k++) {
      const x = k / len;
      if (x >= 1) break;
      const idx = Math.floor(start + k) % blocks;
      let a: number;
      let b: number;
      let f: number;
      if (x < crest) {
        /* 湧上：慢慢變大、變亮 */
        const y = x / crest;
        const s = Math.sin((y * Math.PI) / 2) ** 2;
        a = base + (h * 0.75 - base) * s;
        b = 0.12 + 0.35 * s;
        f = 0;
      } else if (x < crest + 0.06) {
        /* 拍岸：最大、最亮 */
        const y = (x - crest) / 0.06;
        a = h * (0.75 + 0.25 * Math.sin((y * Math.PI) / 2));
        b = 0.47 + 0.53 * y;
        f = y;
      } else {
        /* 退去：慢慢回到平靜的音量（下一道浪的起點） */
        const y = (x - crest - 0.06) / (1 - crest - 0.06);
        const e = Math.exp(-y * 3.2);
        /* (1 − y) 讓結尾剛好回到 base */
        a = base + (h - base) * (1 - y) * e;
        b = 0.12 + 0.88 * e * (1 - y);
        f = Math.exp(-y * 2.2) * (1 - y);
      }
      amp[idx] = a;
      bright[idx] = b;
      foam[idx] = f;
      pan[idx] = p;
    }
    start += len;
  }
  return { amp, bright, foam, pan };
}

function wavesRender(ctx: RenderContext, size: number, d: number): void {
  const sr = ctx.sampleRate;
  const block = 128;
  const shape = waveShape(ctx, block, size);
  const nb = shape.amp.length;
  const warm = warmSamples(ctx);
  const maxFc = lerp(3200, 5200, size) * lerp(1, 0.45, d);
  const chans = ctx.right ? [ctx.left, ctx.right] : [ctx.left];
  chans.forEach((out, c) => {
    const side = ctx.right ? (c === 0 ? -1 : 1) : 0;
    /* 浪的主體：粉紅雜訊，低通的截止頻率隨亮度 */
    const body = noise(ctx, 'pink');
    filterVarying(
      body,
      block,
      (k) => biquad('lowpass', 220 + maxFc * shape.bright[k % nb] ** 1.6, 0.7, sr),
      warm,
    );
    /* 泡沫：高頻的嘶嘶聲 */
    const fizz = noise(ctx, 'white', [
      biquad('highpass', 2200, 0.7, sr),
      biquad('lowpass', lerp(9000, 3500, d), 0.7, sr),
    ]);
    const rumble = noise(ctx, 'brown', [biquad('lowpass', 140, 0.7, sr)]);
    for (let i = 0; i < out.length; i++) {
      const x = i / block;
      const k = Math.floor(x) % nb;
      const k1 = (k + 1) % nb;
      const f = x - Math.floor(x);
      const a = shape.amp[k] + (shape.amp[k1] - shape.amp[k]) * f;
      const fo = shape.foam[k] + (shape.foam[k1] - shape.foam[k]) * f;
      const pan = 1 + side * shape.pan[k] * 0.6;
      out[i] +=
        (body[i] * a * 1.1 + fizz[i] * fo * fo * 0.22 * (1 - 0.5 * d)) * pan +
        rumble[i] * (0.18 + 0.25 * a);
    }
  });
}

/* ---------- 氣泡 ---------- */

function bubbles(
  ctx: RenderContext,
  times: readonly number[],
  o: { lo: number; hi: number; gain: [number, number]; spread: number },
): void {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  for (const t of times) {
    const f = logRange(rng, o.lo, o.hi);
    const tau = Math.min(0.03, Math.max(0.003, 0.009 * Math.sqrt(900 / f)));
    const s = decayingSine(f, tau, sr, {
      chirp: logRange(rng, 0.06, 0.16) * f * 0.12,
      attack: 0.0007,
    });
    /* 大氣泡（低）比較大聲 */
    const g = logRange(rng, o.gain[0], o.gain[1]) * Math.sqrt(o.lo / f) ** 0.5;
    addPanned(ctx.left, ctx.right, s, t * sr, (rng.next() * 2 - 1) * o.spread, g);
  }
}

/* ---------- 水滴 ---------- */

function drip(sr: number, f: number, rng: RenderContext['rng']): Float32Array {
  const s = decayingSine(f, logRange(rng, 0.012, 0.03), sr, {
    chirp: logRange(rng, 18, 40),
    attack: 0.0004,
  });
  const tick = noiseBurst(0.0004, sr, rng);
  filterOnce(tick, biquad('bandpass', f * 2, 2, sr));
  for (let i = 0; i < tick.length && i < s.length; i++) s[i] += tick[i] * 0.3;
  return s;
}

export const WATER_SOUNDS: AmbienceSoundDef[] = [
  {
    id: 'waves',
    category: 'water',
    label: '海浪',
    description: '一道道湧上岸又退去的浪，退浪時有泡沫的沙沙聲。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'size',
        label: '浪的大小',
        min: 0,
        max: 100,
        step: 1,
        default: 55,
        ends: ['平靜', '洶湧'],
      },
      {
        kind: 'range',
        id: 'distance',
        label: '距離',
        min: 0,
        max: 100,
        step: 1,
        default: 35,
        ends: ['近', '遠'],
      },
    ],
    gain: 0.55,
    render(ctx, p) {
      wavesRender(ctx, unit(p.size), unit(p.distance));
    },
  },
  {
    id: 'stream',
    category: 'water',
    label: '溪流',
    description: '潺潺的流水，水面上冒出一顆顆小氣泡。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'flow',
        label: '水量',
        min: 0,
        max: 100,
        step: 1,
        default: 50,
        ends: ['涓涓', '湍急'],
      },
      {
        kind: 'range',
        id: 'pitch',
        label: '水聲',
        min: 0,
        max: 100,
        step: 1,
        default: 55,
        ends: ['低沉的河', '清脆的小溪'],
      },
    ],
    gain: 3,
    render(ctx, p) {
      const u = unit(p.flow);
      const h = unit(p.pitch);
      const sr = ctx.sampleRate;
      addLayer(
        ctx,
        () => {
          const b = noise(ctx, 'pink', [
            biquad('bandpass', logLerp(500, 1800, h), 0.55, sr),
            biquad('highpass', 140, 0.7, sr),
          ]);
          return applyCurveGain(b, periodicCurve(ctx.n, 256, ctx.seconds / 3, ctx.rng), 0.75, 1.1);
        },
        0.12 + 0.18 * u,
      );
      const lo = logLerp(260, 750, h);
      bubbles(ctx, poissonTimes(40 + 170 * u, ctx.seconds, ctx.rng), {
        lo,
        hi: lo * 4,
        gain: [0.02, 0.16],
        spread: 0.85,
      });
    },
  },
  {
    id: 'cave-drips',
    category: 'water',
    label: '洞窟的水滴',
    description: '空曠的洞窟裡，水滴從岩石上一滴一滴落下，帶著回聲。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'rate',
        label: '水滴',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['稀疏', '頻繁'],
      },
      {
        kind: 'range',
        id: 'echo',
        label: '回聲',
        min: 0,
        max: 100,
        step: 1,
        default: 60,
        ends: ['小', '大'],
      },
    ],
    gain: 2,
    render(ctx, p) {
      const u = unit(p.rate);
      const e = unit(p.echo);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      /* 幾個固定滴水的地方：各自的音高、位置與大約固定的間隔 */
      const spots = 3 + Math.floor(u * 4);
      for (let s = 0; s < spots; s++) {
        const f = logRange(rng, 750, 2600);
        const pan = rng.next() * 1.6 - 0.8;
        const level = logRange(rng, 0.25, 1);
        const interval = Math.max(0.7, logRange(rng, 1.4, 5.5) / (0.5 + u));
        const count = Math.max(1, Math.round(ctx.seconds / interval));
        const gap = ctx.seconds / count;
        const offset = rng.next() * gap;
        for (let k = 0; k < count; k++) {
          const t = offset + k * gap + (rng.next() * 2 - 1) * gap * 0.08;
          addPanned(
            ctx.left,
            ctx.right,
            drip(sr, f * logRange(rng, 0.97, 1.03), rng),
            t * sr,
            pan,
            level * logRange(rng, 0.7, 1) * 0.5,
          );
        }
      }
      /* 偶爾別的地方滴下來 */
      for (const t of poissonTimes(0.15 + 0.5 * u, ctx.seconds, rng)) {
        addPanned(
          ctx.left,
          ctx.right,
          drip(sr, logRange(rng, 700, 2800), rng),
          t * sr,
          rng.next() * 1.8 - 0.9,
          logRange(rng, 0.1, 0.4),
        );
      }
      /* 洞窟裡的空氣聲（很低、很小） */
      addLayer(
        ctx,
        () => {
          const b = noise(ctx, 'brown', [biquad('lowpass', 110, 0.7, sr)]);
          return applyCurveGain(b, periodicCurve(ctx.n, 256, ctx.seconds / 8, rng), 0.5, 1);
        },
        0.05,
      );
      reverbPeriodic(ctx.left, ctx.right, sr, {
        size: 0.6 + 0.38 * e,
        damp: 0.35,
        wet: 0.12 + 0.45 * e,
        dry: 0.95 - 0.35 * e,
      });
    },
  },
  {
    id: 'underwater',
    category: 'water',
    label: '水底',
    description: '潛在水裡聽到的悶響與偶爾冒上去的氣泡，適合海底神殿或沉船。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'bubbles',
        label: '氣泡',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['少', '多'],
      },
      {
        kind: 'range',
        id: 'depth',
        label: '深度',
        min: 0,
        max: 100,
        step: 1,
        default: 50,
        ends: ['淺', '深'],
      },
    ],
    gain: 2.3,
    render(ctx, p) {
      const u = unit(p.bubbles);
      const d = unit(p.depth);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      addLayer(
        ctx,
        () => {
          const b = noise(ctx, 'brown', [
            biquad('lowpass', lerp(260, 120, d), 0.7, sr),
            biquad('highpass', 25, 0.7, sr),
          ]);
          return applyCurveGain(b, periodicCurve(ctx.n, 256, ctx.seconds / 7, rng), 0.55, 1);
        },
        0.32,
      );
      addLayer(
        ctx,
        () => noise(ctx, 'pink', [biquad('lowpass', lerp(600, 300, d), 0.7, sr)]),
        0.05,
      );
      /* 氣泡：一串一串冒上去 */
      const times: number[] = [];
      for (const t of poissonTimes(0.25 + 1.6 * u, ctx.seconds, rng)) {
        const m = 3 + Math.floor(rng.next() * 10);
        let x = t;
        for (let k = 0; k < m; k++) {
          times.push(x);
          x += logRange(rng, 0.02, 0.12);
        }
      }
      const tmp: RenderContext = {
        ...ctx,
        left: new Float32Array(ctx.n),
        right: ctx.right ? new Float32Array(ctx.n) : null,
      };
      bubbles(tmp, times, { lo: 220, hi: 950, gain: [0.05, 0.3], spread: 0.7 });
      const lp = [biquad('lowpass', lerp(1600, 800, d), 0.7, sr)];
      filterPeriodic(tmp.left, lp, warmSamples(ctx));
      for (let i = 0; i < ctx.n; i++) ctx.left[i] += tmp.left[i];
      if (ctx.right && tmp.right) {
        filterPeriodic(tmp.right, lp, warmSamples(ctx));
        for (let i = 0; i < ctx.n; i++) ctx.right[i] += tmp.right[i];
      }
      reverbPeriodic(ctx.left, ctx.right, sr, { size: 0.5, damp: 0.8, wet: 0.15, dry: 1 });
    },
  },
];
