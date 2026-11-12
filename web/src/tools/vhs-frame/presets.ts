/**
 * 「樣子」（規格 1.17、3.17、F95；2026-11-12：1.20、3.20、F107）：一組樣子換掉磨損度、效果的開關與 2026-11-10 的四組設定
 * （映像管、數位攝影、NTSC 訊號、Screen Loop）；照片、文字、色調與動畫不變。
 * 前六組是 2026-11-10 本站自己調的（那時 NTSCRT 沒有授權）；之後的六組照 NTSCRT `352b4dc` 的 presets/（MIT，© 2026 Finn McKenty；
 * 授權全文在 UPSTREAM_LICENSE）換成本站的設定（換算見規格 D46；本站沒有的設定略過）。
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

export type LookPresetId =
  | 'plain'
  | 'clean'
  | 'webcam'
  | 'ntsc'
  | 'minidv'
  | 'loop'
  | 'chunky'
  | 'cdrom'
  | 'camcorder'
  | 'mild'
  | 'static'
  | 'corner';
export const LOOK_PRESET_IDS: readonly LookPresetId[] = [
  'plain',
  'clean',
  'webcam',
  'ntsc',
  'minidv',
  'loop',
  'chunky',
  'cdrom',
  'camcorder',
  'mild',
  'static',
  'corner',
];

/** 只有數位攝影的樣子（NTSCRT 的數位攝影預設集只開數位攝影）：錄影帶的效果全關 */
const DIGITAL_ONLY: Partial<Effects> = {
  chroma: false,
  tear: false,
  dropout: false,
  tracking: false,
  noise: false,
  scan: false,
  hum: false,
};
/** 數位攝影預設集裡本站有的、NTSCRT 沒寫或本站另有的值：不改畫面 */
const CAMERA_PLAIN: Partial<Digital> = {
  lens: 0,
  alias: 0,
  denoise: 0,
  exposure: 0,
  warmth: 0,
  tint: 0,
  saturation: 100,
  black: 0,
  sharpen: 0,
  blockSmooth: 0,
  mosh: 0,
  lowLight: 0,
  halo: 1,
  fieldScan: false,
};

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
  /* 網路攝影機的影片轉錄到 VHS：昏暗房間的網路攝影機（方塊雜訊、藍綠的雜訊），再過一次 SP 的錄影帶 */
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
  /* 家庭錄影：家用 DV 拍的白天戶外（乾淨、偏冷），播在槽孔的映像管上 */
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

  /* ---- 2026-11-12：照 NTSCRT 的 presets/（MIT） ---- */

  /* Chunky webcam：SNES 的 256 寬、CCD 的反應拉滿、彩虹鋸齒、硬的銳利化、方塊與常常掉的資料（NTSCRT 第 1 版的預設集：
     畫質 0.186 是舊的 JPEG 畫質刻度，2 ＋ 93 × 0.186 ≈ 19） */
  chunky: {
    wear: 0,
    effects: DIGITAL_ONLY,
    digital: {
      ...CAMERA_PLAIN,
      on: true,
      format: 'webcam',
      codec: 'dct',
      width: 256,
      fps: 30,
      interlace: true,
      rainbow: 100,
      noise: 12,
      ccd: 100,
      sharpen: 74,
      chroma: 2,
      quality: 19,
      keyframe: 5,
      loss: 34,
    },
  },
  /* CD-ROM（低畫質）：方塊色（Video 1）、240 寬、每秒 12 格、鮮豔、硬的銳利化、掉資料（畫質 0.637 是方塊色的刻度） */
  cdrom: {
    wear: 0,
    effects: DIGITAL_ONLY,
    digital: {
      ...CAMERA_PLAIN,
      on: true,
      format: 'cdrom',
      codec: 'video1',
      width: 240,
      fps: 12,
      interlace: true,
      rainbow: 65,
      noise: 36,
      ccd: 48,
      saturation: 151,
      sharpen: 97,
      chroma: 0,
      quality: 64,
      keyframe: 37,
      loss: 59,
    },
  },
  /* Cheap camcorder：2000 年代的家用 MiniDV，480 寬、暗的地方雜訊變多（NTSCRT 打開數位攝影時的起點；
     畫質 0.749 在 NTSCRT 新的刻度是量化表的 2.23 倍＝JPEG 畫質約 22） */
  camcorder: {
    wear: 0,
    effects: DIGITAL_ONLY,
    digital: {
      ...CAMERA_PLAIN,
      on: true,
      format: 'minidv',
      codec: 'dct',
      width: 480,
      fps: 30,
      interlace: true,
      rainbow: 38,
      noise: 40,
      lowLight: 64,
      ccd: 68,
      halo: 4,
      chroma: 2,
      quality: 22,
      keyframe: 0,
      loss: 0,
    },
  },
  /* Mild VHS：SP、幾乎沒有拖影與波動、只有一點訊號雜訊，播在有光暈的映像管上（NTSCRT 的 crtglow 換成本站的光暈） */
  mild: {
    wear: 10,
    effects: { chroma: false, tear: false, dropout: false, tracking: false },
    ntsc: {
      on: true,
      tape: 'sp',
      smear: 0,
      bleed: 0,
      noise: 32,
      snow: 0,
      wave: 0,
      loss: 0,
      headSwitch: false,
      tracking: false,
      ringing: false,
    },
    crt: { glow: 30 },
  },
  /* High Chroma static：EP、滿滿的訊號雜訊與邊緣波動、顏色錯開，播在有光暈的映像管上 */
  static: {
    wear: 20,
    effects: { chroma: false, tear: false, dropout: false, tracking: false },
    ntsc: {
      on: true,
      tape: 'ep',
      smear: 58,
      bleed: 3,
      noise: 100,
      snow: 0,
      wave: 46,
      loss: 20,
      headSwitch: true,
      tracking: true,
      ringing: false,
    },
    crt: { glow: 30 },
  },
  /* Screen Loop 的「22 copies bottom left」：消失點在左下角、很多層、偏冷、手持晃動、不循環 */
  corner: {
    wear: 25,
    effects: { tear: false },
    loop: {
      on: true,
      depth: 10,
      zoom: 73,
      cx: -45,
      cy: 45,
      shake: 40,
      soft: 20,
      color: -30,
      seamless: false,
    },
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
