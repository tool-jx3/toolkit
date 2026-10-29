/**
 * 火：營火、壁爐。低沉的火焰聲（棕色雜訊依閃爍的曲線起伏）＋一點嘶嘶聲＋一簇一簇的劈啪聲（很短的爆裂），
 * 偶爾有木頭爆開的「啪」。壁爐比較溫暖（高頻少）、有一點房間的回聲。
 */
import { addLayer, lerp, noise, unit, warmSamples } from '../build';
import {
  addPanned,
  applyCurveGain,
  biquad,
  filterOnce,
  filterPeriodic,
  logRange,
  noiseBurst,
  periodicCurve,
  poissonTimes,
  resonate,
  reverbPeriodic,
} from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

function fireRender(ctx: RenderContext, intensity: number, crackle: number, indoor: boolean): void {
  const sr = ctx.sampleRate;
  const { rng } = ctx;
  /* 火焰的轟轟聲：閃爍（約 0.4 秒一點） */
  addLayer(
    ctx,
    () => {
      const b = noise(ctx, 'brown', [
        biquad('lowpass', indoor ? 380 : 520, 0.7, sr),
        biquad('highpass', 55, 0.7, sr),
      ]);
      return applyCurveGain(b, periodicCurve(ctx.n, 128, ctx.seconds * 2.5, rng), 0.45, 1);
    },
    lerp(0.22, 0.5, intensity) * (indoor ? 1.2 : 1),
  );
  /* 火舌的呼呼聲 */
  addLayer(
    ctx,
    () => {
      const b = noise(ctx, 'pink', [biquad('bandpass', indoor ? 700 : 950, 0.5, sr)]);
      return applyCurveGain(
        b,
        periodicCurve(ctx.n, 256, ctx.seconds / 1.5, rng, (u) => u ** 2),
        0.15,
        1,
      );
    },
    lerp(0.05, 0.14, intensity),
  );
  /* 嘶嘶聲 */
  addLayer(
    ctx,
    () =>
      noise(ctx, 'white', [
        biquad('highpass', 3200, 0.7, sr),
        biquad('lowpass', indoor ? 6500 : 9500, 0.7, sr),
      ]),
    0.012 + 0.012 * intensity,
  );
  /* 劈啪聲：一簇一簇 */
  const hiF = indoor ? 5200 : 7500;
  for (const t of poissonTimes(1.2 + 9 * crackle, ctx.seconds, rng)) {
    const m = 1 + Math.floor(rng.next() ** 2 * 9);
    const pan = (rng.next() * 2 - 1) * 0.6;
    const loud = logRange(rng, 0.15, 1);
    let x = t;
    for (let k = 0; k < m; k++) {
      const b = noiseBurst(logRange(rng, 0.0002, 0.0014), sr, rng, 0.0001);
      filterOnce(b, biquad('bandpass', logRange(rng, 1100, hiF), 0.9, sr));
      addPanned(
        ctx.left,
        ctx.right,
        b,
        x * sr,
        pan + (rng.next() - 0.5) * 0.2,
        loud * logRange(rng, 0.15, 1) * 0.55,
      );
      x += -Math.log(1 - rng.next()) * 0.006;
    }
  }
  /* 木頭爆開的「啪」 */
  for (const t of poissonTimes(0.05 + 0.35 * crackle, ctx.seconds, rng)) {
    const exc = noiseBurst(logRange(rng, 0.002, 0.006), sr, rng, 0.0002);
    filterOnce(exc, biquad('bandpass', logRange(rng, 500, 1600), 1.3, sr));
    const body = resonate(exc, logRange(rng, 350, 900), 0.012, sr, Math.round(0.08 * sr));
    for (let i = 0; i < exc.length; i++) body[i] += exc[i] * 1.5;
    addPanned(
      ctx.left,
      ctx.right,
      body,
      t * sr,
      (rng.next() * 2 - 1) * 0.5,
      logRange(rng, 0.1, 0.28),
    );
  }
  if (indoor) {
    filterPeriodic(ctx.left, biquad('lowpass', 7000, 0.6, sr), warmSamples(ctx));
    if (ctx.right) filterPeriodic(ctx.right, biquad('lowpass', 7000, 0.6, sr), warmSamples(ctx));
    reverbPeriodic(ctx.left, ctx.right, sr, { size: 0.3, damp: 0.5, wet: 0.1, dry: 1 });
  }
}

const params = (intensity: number, crackle: number) =>
  [
    {
      kind: 'range',
      id: 'intensity',
      label: '火勢',
      min: 0,
      max: 100,
      step: 1,
      default: intensity,
      ends: ['小火', '旺盛'],
    },
    {
      kind: 'range',
      id: 'crackle',
      label: '劈啪聲',
      min: 0,
      max: 100,
      step: 1,
      default: crackle,
      ends: ['少', '多'],
    },
  ] as const;

export const FIRE_SOUNDS: AmbienceSoundDef[] = [
  {
    id: 'campfire',
    category: 'fire',
    label: '營火',
    description: '露天的營火，木柴燒得劈啪作響。',
    stereo: true,
    params: params(55, 55),
    gain: 2.1,
    render(ctx, p) {
      fireRender(ctx, unit(p.intensity), unit(p.crackle), false);
    },
  },
  {
    id: 'fireplace',
    category: 'fire',
    label: '壁爐',
    description: '屋裡的壁爐，溫暖低沉的火聲。',
    stereo: true,
    params: params(45, 40),
    gain: 2.1,
    render(ctx, p) {
      fireRender(ctx, unit(p.intensity), unit(p.crackle), true);
    },
  },
];
