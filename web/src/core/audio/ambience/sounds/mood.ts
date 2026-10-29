/**
 * 氛圍：不安的低鳴、遠方的鐘聲。
 * 低鳴＝幾個低頻的正弦（彼此差一點點，產生緩慢的拍）＋隨「不安」加入的不和諧音（三全音、小二度）＋慢慢移動的濾波雜訊；
 * 鐘聲＝教堂鐘的分音（hum、prime、小三度、五度、nominal…，各自的衰減，每個分音分成兩個很接近的頻率產生顫動）。
 */
import { addLayer, lerp, logLerp, noise, unit, warmSamples } from '../build';
import {
  addPanned,
  addSine,
  applyCurveGain,
  biquad,
  decayingSine,
  filterOnce,
  filterPeriodic,
  filterVarying,
  logRange,
  loopFrequency,
  noiseBurst,
  periodicCurve,
  reverbPeriodic,
  spreadTimes,
} from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

function droneRender(ctx: RenderContext, pitch: number, unease: number): void {
  const sr = ctx.sampleRate;
  const { rng, n } = ctx;
  const f0 = logLerp(36, 100, pitch);
  /* [倍數, 音量, 拍（Hz）] */
  const partials: [number, number, number][] = [
    [1, 1, 0],
    [1, 0.8, logRange(rng, 0.2, 0.4)],
    [2, 0.5, logRange(rng, 0.1, 0.2)],
    [3, 0.22, -logRange(rng, 0.08, 0.15)],
    [4, 0.12, logRange(rng, 0.2, 0.35)],
  ];
  if (unease > 0) {
    partials.push([2 * Math.SQRT2, 0.3 * unease, 0]);
    partials.push([(2 * 16) / 15, 0.24 * unease, 0.05]);
    partials.push([(3 * 16) / 15, 0.12 * unease, -0.07]);
  }
  const chans = ctx.right ? [ctx.left, ctx.right] : [ctx.left];
  partials.forEach(([m, a, beat], j) => {
    const f = loopFrequency(f0 * m + beat, ctx.seconds);
    const ph = rng.next() * 2 * Math.PI;
    chans.forEach((ch, c) => {
      const side = chans.length === 1 ? 1 : (j % 2 === c ? 0.62 : 0.38) * 1.6;
      addSine(ch, f, a * 0.12 * side, ph + c * 0.3, sr);
    });
  });
  /* 很慢的起伏 */
  const swell = periodicCurve(n, 512, ctx.seconds / 9, rng);
  for (const ch of chans) applyCurveGain(ch, swell, 0.55, 1);
  /* 慢慢移動的濾波雜訊（像風穿過走廊、像呼吸） */
  const center = periodicCurve(n, 128, ctx.seconds / 6, rng);
  addLayer(
    ctx,
    () => {
      const b = noise(ctx, 'pink');
      filterVarying(
        b,
        128,
        (k) => biquad('bandpass', f0 * (2 + 3 * center.values[k % center.values.length]), 4, sr),
        warmSamples(ctx),
      );
      return b;
    },
    0.1 + 0.18 * unease,
  );
  addLayer(ctx, () => noise(ctx, 'brown', [biquad('lowpass', 70, 0.7, sr)]), 0.05);
}

/** 教堂鐘的分音：[相對於 prime 的倍數, 音量, 衰減（秒）] */
const BELL: readonly (readonly [number, number, number])[] = [
  [0.5, 0.5, 4.5],
  [1, 0.6, 3],
  [1.2, 0.45, 2.4],
  [1.5, 0.25, 1.6],
  [2, 1, 1.8],
  [2.5, 0.22, 0.9],
  [2.67, 0.18, 0.8],
  [3, 0.2, 0.7],
  [4, 0.12, 0.5],
];

function bellStrike(sr: number, prime: number, rng: RenderContext['rng']): Float32Array {
  const len = 9;
  const n = Math.round(len * sr);
  const out = new Float32Array(n);
  for (const [m, a, tau] of BELL) {
    const f = prime * m * logRange(rng, 0.997, 1.003);
    if (f > sr * 0.45) continue;
    const beat = logRange(rng, 0.4, 1.6);
    const s1 = decayingSine(f, tau, sr, { attack: 0.002, length: len });
    const s2 = decayingSine(f + beat, tau, sr, {
      attack: 0.002,
      length: len,
      phase: rng.next() * 6.28,
    });
    for (let i = 0; i < n; i++) out[i] += (s1[i] * 0.6 + s2[i] * 0.4) * a;
  }
  const hit = noiseBurst(0.004, sr, rng, 0.0003);
  filterOnce(hit, biquad('bandpass', 2500, 1, sr));
  for (let i = 0; i < hit.length; i++) out[i] += hit[i] * 0.6;
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < n; i++) out[i] /= pk;
  return out;
}

export const MOOD_SOUNDS: AmbienceSoundDef[] = [
  {
    id: 'drone',
    category: 'mood',
    label: '不安的低鳴',
    description:
      '持續的低沉嗡鳴，慢慢起伏；調高「不安」會加入刺耳的不和諧音，適合恐怖或神祕的場面。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'pitch',
        label: '音高',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['低', '高'],
      },
      {
        kind: 'range',
        id: 'unease',
        label: '不安',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['平穩', '不安'],
      },
    ],
    gain: 1.35,
    render(ctx, p) {
      droneRender(ctx, unit(p.pitch), unit(p.unease));
    },
  },
  {
    id: 'bell',
    category: 'mood',
    label: '遠方的鐘聲',
    description: '霧裡傳來的教堂鐘聲，一聲一聲慢慢消失。',
    stereo: true,
    params: [
      {
        kind: 'range',
        id: 'interval',
        label: '間隔',
        min: 0,
        max: 100,
        step: 1,
        default: 45,
        ends: ['短', '長'],
      },
      {
        kind: 'range',
        id: 'pitch',
        label: '音高',
        min: 0,
        max: 100,
        step: 1,
        default: 40,
        ends: ['低', '高'],
      },
      {
        kind: 'range',
        id: 'distance',
        label: '距離',
        min: 0,
        max: 100,
        step: 1,
        default: 50,
        ends: ['近', '遠'],
      },
    ],
    gain: 1.55,
    render(ctx, p) {
      const u = unit(p.interval);
      const d = unit(p.distance);
      const sr = ctx.sampleRate;
      const { rng } = ctx;
      const prime = logLerp(130, 330, unit(p.pitch)) / 2;
      const count = Math.max(1, Math.round(ctx.seconds / lerp(8, 60, u)));
      const pan = rng.next() * 1.2 - 0.6;
      for (const t of spreadTimes(count, ctx.seconds, rng, 0.15)) {
        addPanned(
          ctx.left,
          ctx.right,
          bellStrike(sr, prime, rng),
          t * sr,
          pan,
          lerp(0.85, 0.5, d) * 0.5,
        );
      }
      const lp = [biquad('lowpass', logLerp(7000, 1200, d), 0.6, sr)];
      filterPeriodic(ctx.left, lp, warmSamples(ctx));
      if (ctx.right) filterPeriodic(ctx.right, lp, warmSamples(ctx));
      reverbPeriodic(ctx.left, ctx.right, sr, {
        size: 0.75,
        damp: 0.55,
        wet: 0.18 + 0.35 * d,
        dry: 1,
      });
    },
  },
];
