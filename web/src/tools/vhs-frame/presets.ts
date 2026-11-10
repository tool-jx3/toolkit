/**
 * 「樣子」：本站自己調的幾組預設（規格 1.17、3.17、F95；不用 NTSCRT 的 presets）。
 * 一組樣子換掉磨損度、效果的開關與 2026-11-10 的四組設定（映像管、數位攝影、NTSC 訊號、Screen Loop）；照片、文字、色調與動畫不變。
 */
import {
  type Crt,
  DIGITAL_PRESETS,
  type Digital,
  defaultCrt,
  defaultDigital,
  defaultLoop,
  defaultNtsc,
  type Loop,
  type Ntsc,
} from './look';
import { DEFAULT_WEAR, defaultEffects, type Effects, type VhsState } from './model';

export type LookPresetId = 'plain' | 'clean' | 'webcam' | 'ntsc' | 'minidv' | 'loop';
export const LOOK_PRESET_IDS: readonly LookPresetId[] = [
  'plain',
  'clean',
  'webcam',
  'ntsc',
  'minidv',
  'loop',
];

interface LookPreset {
  wear: number;
  effects: Partial<Effects>;
  crt?: Partial<Crt>;
  digital?: Partial<Digital>;
  ntsc?: Partial<Ntsc>;
  loop?: Partial<Loop>;
}

export const LOOK_PRESETS: Record<LookPresetId, LookPreset> = {
  /* 原本的錄影帶：2026-11-10 的設定全關、磨損度與效果回到預設 */
  plain: { wear: DEFAULT_WEAR, effects: {} },
  /* 乾淨的 CRT：幾乎不壞的訊號，近看看得到光柵與光暈 */
  clean: {
    wear: 8,
    effects: { tear: false, dropout: false, tracking: false },
    crt: {
      mask: 'aperture',
      maskStrength: 50,
      maskSize: 3,
      maskBoost: true,
      glow: 35,
      glowSize: 40,
    },
  },
  /* 網路攝影機的影片轉錄到 VHS：方塊雜訊、偏冷的雜訊，再過一次 SP 的錄影帶 */
  webcam: {
    wear: 30,
    effects: { chroma: false },
    digital: { on: true, format: 'webcam', ...DIGITAL_PRESETS.webcam },
    ntsc: { on: true, tape: 'sp', smear: 40, noise: 20 },
  },
  /* NTSC 的錄影帶：顏色滲開、雪花、邊緣波動、色彩脫落（舊的色差關掉，由 NTSC 的模擬負責） */
  ntsc: {
    wear: 40,
    effects: { chroma: false, tear: false },
    ntsc: { on: true, tape: 'lp', smear: 60, bleed: 3, noise: 35, snow: 25, wave: 25, loss: 20 },
  },
  /* 滑板影片：MiniDV 的硬銳利化與鋸齒，播在槽孔的映像管上 */
  minidv: {
    wear: 15,
    effects: { tear: false, dropout: false },
    digital: { on: true, format: 'minidv', ...DIGITAL_PRESETS.minidv },
    crt: { mask: 'slot', maskStrength: 35, maskSize: 4, glow: 20 },
  },
  /* Screen Loop：攝影機拍電視的隧道，偏冷、手持晃動，無縫循環 */
  loop: {
    wear: 25,
    effects: { tear: false },
    loop: { on: true, key: 50, gain: 112 },
    crt: { glow: 25 },
  },
};

/** 套用一組樣子到狀態上（就地改；沒寫到的回到預設） */
export function applyLookPreset(d: VhsState, id: LookPresetId): void {
  const p = LOOK_PRESETS[id];
  d.wear = p.wear;
  d.effects = { ...defaultEffects(), ...p.effects };
  d.crt = { ...defaultCrt(), ...p.crt };
  d.digital = { ...defaultDigital(), ...p.digital };
  d.ntsc = { ...defaultNtsc(), ...p.ntsc };
  d.loop = { ...defaultLoop(), ...p.loop };
}

/** 目前的狀態是不是某一組樣子（按鈕顯示按下） */
export function matchingPreset(s: VhsState): LookPresetId | null {
  for (const id of LOOK_PRESET_IDS) {
    const t = structuredClone(s);
    applyLookPreset(t, id);
    if (
      JSON.stringify([t.wear, t.effects, t.crt, t.digital, t.ntsc, t.loop]) ===
      JSON.stringify([s.wear, s.effects, s.crt, s.digital, s.ntsc, s.loop])
    )
      return id;
  }
  return null;
}
