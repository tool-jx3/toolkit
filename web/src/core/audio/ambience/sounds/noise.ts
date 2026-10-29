/** 雜訊：白、粉紅、棕色。穩定的聲音，音色改了音量不變（正規化到固定的均方根）。 */
import { addLayer, logLerp, noise, normalizeChannel, unit } from '../build';
import { biquad } from '../dsp';
import type { AmbienceSoundDef, RenderContext } from '../types';

const tone = (label = '音色', def = 50) =>
  ({
    kind: 'range',
    id: 'tone',
    label,
    min: 0,
    max: 100,
    step: 1,
    default: def,
    ends: ['柔和', '明亮'],
  }) as const;

function colored(
  ctx: RenderContext,
  color: 'white' | 'pink' | 'brown',
  lo: number,
  hi: number,
  u: number,
): void {
  const fc = logLerp(lo, hi, u);
  const sr = ctx.sampleRate;
  addLayer(ctx, () =>
    normalizeChannel(
      noise(ctx, color, [
        biquad('lowpass', fc, Math.SQRT1_2, sr),
        biquad('lowpass', fc * 1.6, Math.SQRT1_2, sr),
        biquad('highpass', 30, Math.SQRT1_2, sr),
      ]),
      1,
    ),
  );
}

export const NOISE_SOUNDS: AmbienceSoundDef[] = [
  {
    id: 'white-noise',
    category: 'noise',
    label: '白噪音',
    description: '所有頻率一樣強的沙沙聲，像收音機沒對到台；適合蓋掉周圍的雜音。',
    stereo: true,
    params: [tone('音色', 45)],
    gain: 0.16,
    render(ctx, p) {
      colored(ctx, 'white', 2500, 16000, unit(p.tone));
    },
  },
  {
    id: 'pink-noise',
    category: 'noise',
    label: '粉紅噪音',
    description: '低音比白噪音多，像遠處的瀑布或穩定的雨聲。',
    stereo: true,
    params: [tone('音色', 60)],
    gain: 0.16,
    render(ctx, p) {
      colored(ctx, 'pink', 2000, 16000, unit(p.tone));
    },
  },
  {
    id: 'brown-noise',
    category: 'noise',
    label: '棕色噪音',
    description: '更低沉的轟轟聲，像隔著牆的大浪或飛機的機艙。',
    stereo: true,
    params: [tone('音色', 40)],
    gain: 0.16,
    render(ctx, p) {
      colored(ctx, 'brown', 250, 2500, unit(p.tone));
    },
  },
];
