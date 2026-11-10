/**
 * 2026-11-10 加的設定（規格 1.11～1.17、3.13～3.17）：映像管（螢光粉遮罩、光暈）、數位攝影（相機與區塊壓縮）、NTSC 訊號、
 * Screen Loop（攝影機拍電視的畫面隧道），以及本站自己調的「樣子」（一鍵套用的預設集）。
 * 純資料與整理（不依賴畫布）：預設全部關閉，沒用到時畫法和加入之前完全相同（F98）。
 */
import { defaultNtscParams, type NtscParams, type TapeSpeed } from './ntsc';

/* ---------- 共用的整理 ---------- */

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const int = (v: unknown, fallback: number, r: { min: number; max: number }): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.round(Math.min(r.max, Math.max(r.min, v)))
    : fallback;
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

type Range = { readonly min: number; readonly max: number };
/** 整數設定的範圍表 → 整理一份物件（不認得的換成預設、數值夾在範圍內並取整） */
function tidyInts<T extends object>(
  raw: unknown,
  d: T,
  ranges: Partial<Record<keyof T, Range>>,
): T {
  const o = obj(raw);
  const out = { ...d };
  for (const k of Object.keys(ranges) as (keyof T)[]) {
    const r = ranges[k] as Range;
    (out as Record<keyof T, unknown>)[k] = int(o[k as string], d[k] as number, r);
  }
  return out;
}

/* ---------- 映像管：螢光粉遮罩、光暈 ---------- */

/** 遮罩：無、光柵（直條，Trinitron）、槽孔（直條分格，交錯）、點狀（蔭罩，每一列錯開） */
export type MaskKind = 'none' | 'aperture' | 'slot' | 'shadow';
export const MASK_KINDS: readonly MaskKind[] = ['none', 'aperture', 'slot', 'shadow'];

export interface Crt {
  mask: MaskKind;
  /** 遮罩的強度（%：沒亮的顏色暗多少） */
  maskStrength: number;
  /** 一組紅綠藍的寬（1280 寬的畫面 px；輸出時至少 3 px） */
  maskSize: number;
  /** 亮度補償：遮罩平均變暗的部分整張乘回來（亮部會飽和） */
  maskBoost: boolean;
  /** 光暈的強度、範圍（%） */
  glow: number;
  glowSize: number;
}
export const CRT_RANGES = {
  maskStrength: { min: 10, max: 100 },
  maskSize: { min: 2, max: 12 },
  glow: { min: 0, max: 100 },
  glowSize: { min: 10, max: 100 },
} as const;
export const defaultCrt = (): Crt => ({
  mask: 'none',
  maskStrength: 45,
  maskSize: 3,
  maskBoost: true,
  glow: 0,
  glowSize: 40,
});
export const crtActive = (c: Crt): boolean => c.mask !== 'none' || c.glow > 0;

function normalizeCrt(raw: unknown): Crt {
  const d = defaultCrt();
  const o = obj(raw);
  return {
    ...tidyInts(raw, d, CRT_RANGES),
    mask: pick(o.mask, MASK_KINDS, d.mask),
    maskBoost: bool(o.maskBoost, d.maskBoost),
  };
}

/* ---------- 數位攝影 ---------- */

/** 格式（照 NTSCRT 的種類，數值本站自己調）：網路攝影機、視訊通話、MiniDV、早期網路影片、datamosh */
export type DigitalFormat = 'webcam' | 'call' | 'minidv' | 'web' | 'mosh';
export const DIGITAL_FORMATS: readonly DigitalFormat[] = [
  'webcam',
  'call',
  'minidv',
  'web',
  'mosh',
];

/** 色彩取樣：4:4:4、4:2:2、4:2:0、4:1:1（色度的格子：橫 × 直） */
export const CHROMA_SUBSAMPLING = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 2, y: 2 },
  { x: 4, y: 1 },
] as const;

export interface Digital {
  on: boolean;
  /** 最後選的格式（下面的值可以再改） */
  format: DigitalFormat;
  /* 擷取 */
  /** 擷取的寬（px；高依比例） */
  width: number;
  /** 每秒幾格（雜訊、資料遺失、datamosh 依格變） */
  fps: number;
  /** 交錯：只用一個圖場、每列重複一次（斜線變成階梯） */
  interlace: boolean;
  /** 鏡頭的柔焦、鋸齒（沒有先模糊就取樣：摩爾紋與彩虹邊）、感光雜訊、降噪（%） */
  lens: number;
  alias: number;
  noise: number;
  denoise: number;
  /* 畫面 */
  /** 曝光（百分之一級，±200＝±2 級；各色版各自到白就截斷） */
  exposure: number;
  /** 色溫（＋暖、－冷）、色調（＋洋紅、－綠）、飽和度（%）、黑位（%：黑色浮起）、銳利化（%） */
  warmth: number;
  tint: number;
  saturation: number;
  black: number;
  sharpen: number;
  /* 壓縮 */
  /** 色彩取樣（CHROMA_SUBSAMPLING 的第幾個） */
  chroma: number;
  /** 畫質（%：8 × 8 區塊的量化） */
  quality: number;
  /** 關鍵影格的間隔（0.1 秒；0＝每一格都是完整的一張） */
  keyframe: number;
  /** 解碼時柔化區塊的邊（%） */
  deblock: number;
  /** 資料遺失（%）、datamosh（%：丟掉關鍵影格的機率） */
  loss: number;
  mosh: number;
}
export const DIGITAL_RANGES = {
  width: { min: 160, max: 720 },
  fps: { min: 5, max: 30 },
  lens: { min: 0, max: 100 },
  alias: { min: 0, max: 100 },
  noise: { min: 0, max: 100 },
  denoise: { min: 0, max: 100 },
  exposure: { min: -200, max: 200 },
  warmth: { min: -100, max: 100 },
  tint: { min: -100, max: 100 },
  saturation: { min: 0, max: 200 },
  black: { min: 0, max: 25 },
  sharpen: { min: 0, max: 100 },
  chroma: { min: 0, max: 3 },
  quality: { min: 1, max: 100 },
  keyframe: { min: 0, max: 50 },
  deblock: { min: 0, max: 100 },
  loss: { min: 0, max: 100 },
  mosh: { min: 0, max: 100 },
} as const;

type DigitalValues = Omit<Digital, 'on' | 'format'>;
/** 各格式的值（本站自己調） */
export const DIGITAL_PRESETS: Record<DigitalFormat, DigitalValues> = {
  /* 2005 年前後的網路攝影機：320 寬、雜訊多、偏冷、每一格各自壓縮 */
  webcam: {
    width: 320,
    fps: 15,
    interlace: false,
    lens: 30,
    alias: 20,
    noise: 45,
    denoise: 40,
    exposure: 30,
    warmth: -20,
    tint: 5,
    saturation: 80,
    black: 5,
    sharpen: 20,
    chroma: 2,
    quality: 25,
    keyframe: 0,
    deblock: 0,
    loss: 0,
    mosh: 0,
  },
  /* 視訊通話：位元率很低、降噪很重、偶爾掉封包（糊到下一個關鍵影格） */
  call: {
    width: 320,
    fps: 12,
    interlace: false,
    lens: 25,
    alias: 0,
    noise: 25,
    denoise: 70,
    exposure: 15,
    warmth: 0,
    tint: 0,
    saturation: 90,
    black: 2,
    sharpen: 10,
    chroma: 2,
    quality: 18,
    keyframe: 30,
    deblock: 60,
    loss: 12,
    mosh: 0,
  },
  /* MiniDV（滑板影片的樣子）：一個圖場、硬銳利化、鋸齒與彩虹邊、過曝、暖色、灰黑、4:1:1 */
  minidv: {
    width: 720,
    fps: 30,
    interlace: true,
    lens: 20,
    alias: 55,
    noise: 10,
    denoise: 0,
    exposure: 35,
    warmth: 35,
    tint: 15,
    saturation: 120,
    black: 8,
    sharpen: 65,
    chroma: 3,
    quality: 75,
    keyframe: 0,
    deblock: 0,
    loss: 0,
    mosh: 0,
  },
  /* 早期網路影片：位元很少、方塊很粗、關鍵影格之間會「呼吸」 */
  web: {
    width: 320,
    fps: 15,
    interlace: false,
    lens: 10,
    alias: 0,
    noise: 0,
    denoise: 0,
    exposure: 0,
    warmth: 0,
    tint: 0,
    saturation: 100,
    black: 0,
    sharpen: 0,
    chroma: 2,
    quality: 10,
    keyframe: 50,
    deblock: 0,
    loss: 0,
    mosh: 0,
  },
  /* datamosh：丟掉關鍵影格，畫面被移動拖著糊開 */
  mosh: {
    width: 480,
    fps: 24,
    interlace: false,
    lens: 0,
    alias: 0,
    noise: 0,
    denoise: 0,
    exposure: 0,
    warmth: 0,
    tint: 0,
    saturation: 100,
    black: 0,
    sharpen: 0,
    chroma: 2,
    quality: 40,
    keyframe: 10,
    deblock: 0,
    loss: 0,
    mosh: 100,
  },
};
export const defaultDigital = (): Digital => ({
  on: false,
  format: 'webcam',
  ...DIGITAL_PRESETS.webcam,
});

function normalizeDigital(raw: unknown): Digital {
  const d = defaultDigital();
  const o = obj(raw);
  return {
    ...tidyInts(raw, d, DIGITAL_RANGES),
    on: o.on === true,
    format: pick(o.format, DIGITAL_FORMATS, d.format),
    interlace: bool(o.interlace, d.interlace),
  };
}

/* ---------- NTSC 訊號（ntsc-rs） ---------- */

export const TAPE_SPEEDS: readonly TapeSpeed[] = ['none', 'sp', 'lp', 'ep'];

export interface Ntsc {
  on: boolean;
  /** 磁帶速度（越慢頻寬越窄、越糊） */
  tape: TapeSpeed;
  /** 亮度拖影（%） */
  smear: number;
  /** 色彩錯位（色度往右挪幾個取樣；負數往左） */
  bleed: number;
  /** 訊號雜訊、雪花、邊緣波動、色彩脫落（%） */
  noise: number;
  snow: number;
  wave: number;
  loss: number;
  /** 畫面最下面的磁頭切換雜訊、追蹤雜訊；振鈴（邊緣旁邊的波紋） */
  headSwitch: boolean;
  tracking: boolean;
  ringing: boolean;
}
export const NTSC_RANGES = {
  smear: { min: 0, max: 100 },
  bleed: { min: -20, max: 20 },
  noise: { min: 0, max: 100 },
  snow: { min: 0, max: 100 },
  wave: { min: 0, max: 100 },
  loss: { min: 0, max: 100 },
} as const;
/** 預設＝ntsc-rs 的預設值（雪花、色彩脫落的預設在 ntsc-rs 是幾乎看不到的量，這裡是 0） */
export const defaultNtsc = (): Ntsc => ({
  on: false,
  tape: 'lp',
  smear: 50,
  bleed: 0,
  noise: 25,
  snow: 0,
  wave: 10,
  loss: 0,
  headSwitch: true,
  tracking: true,
  ringing: true,
});

function normalizeNtsc(raw: unknown): Ntsc {
  const d = defaultNtsc();
  const o = obj(raw);
  return {
    ...tidyInts(raw, d, NTSC_RANGES),
    on: o.on === true,
    tape: pick(o.tape, TAPE_SPEEDS, d.tape),
    headSwitch: bool(o.headSwitch, d.headSwitch),
    tracking: bool(o.tracking, d.tracking),
    ringing: bool(o.ringing, d.ringing),
  };
}

/** 介面的值 → ntsc-rs 的設定（其他用 ntsc-rs 的預設） */
export function ntscParams(n: Ntsc): NtscParams {
  const d = defaultNtscParams();
  const vhs = d.vhs as NonNullable<NtscParams['vhs']>;
  const edge = vhs.edgeWave as NonNullable<typeof vhs.edgeWave>;
  return {
    ...d,
    lumaSmear: n.smear / 100,
    chromaDelay: { h: n.bleed, v: 0 },
    compositeNoise:
      n.noise > 0 && d.compositeNoise ? { ...d.compositeNoise, intensity: n.noise / 500 } : null,
    snow: (n.snow / 100) ** 2 * 10,
    headSwitching: n.headSwitch ? d.headSwitching : null,
    trackingNoise: n.tracking ? d.trackingNoise : null,
    ringing: n.ringing ? d.ringing : null,
    vhs: {
      ...vhs,
      tape: n.tape,
      chromaLoss: (n.loss / 100) ** 2 * 0.05,
      edgeWave: n.wave > 0 ? { ...edge, intensity: n.wave / 20 } : null,
    },
  };
}

/* ---------- Screen Loop ---------- */

export interface Loop {
  on: boolean;
  /** 層數（每一層多套一次整個效果） */
  depth: number;
  /** 每一層是外面一層的多大（%） */
  zoom: number;
  /** 消失點（相對畫面中心，畫面寬、高的 %；右、下為正） */
  cx: number;
  cy: number;
  /** 角度（電視相對攝影機轉了幾度；每一層再轉一次＝螺旋） */
  roll: number;
  /** 手持晃動（%） */
  shake: number;
  /** 推進（%：動畫裡從設定的大小往前推或往後拉）、旋轉（度：動畫裡轉多少） */
  push: number;
  spin: number;
  /** 柔化（%：每一層再糊一點） */
  soft: number;
  /** 色彩（＋暖、－冷；每一層累積） */
  color: number;
  /** 亮度（%：每一層乘一次） */
  gain: number;
  /** 亮度鍵（%：照片亮的部分蓋在隧道上面，主體保持實心） */
  key: number;
  /** 無縫循環：動作出去再回來、晃動照動畫的長度重複 */
  seamless: boolean;
}
export const LOOP_RANGES = {
  depth: { min: 1, max: 10 },
  zoom: { min: 40, max: 95 },
  cx: { min: -45, max: 45 },
  cy: { min: -45, max: 45 },
  roll: { min: -45, max: 45 },
  shake: { min: 0, max: 100 },
  push: { min: -50, max: 50 },
  spin: { min: -180, max: 180 },
  soft: { min: 0, max: 100 },
  color: { min: -100, max: 100 },
  gain: { min: 70, max: 150 },
  key: { min: 0, max: 100 },
} as const;
export const defaultLoop = (): Loop => ({
  on: false,
  depth: 6,
  zoom: 78,
  cx: -12,
  cy: -10,
  roll: 0,
  shake: 30,
  push: 0,
  spin: 0,
  soft: 20,
  color: -30,
  gain: 100,
  key: 0,
  seamless: true,
});

function normalizeLoop(raw: unknown): Loop {
  const d = defaultLoop();
  const o = obj(raw);
  return {
    ...tidyInts(raw, d, LOOP_RANGES),
    on: o.on === true,
    seamless: bool(o.seamless, d.seamless),
  };
}

/* ---------- 整份 ---------- */

/** 2026-11-10 加的設定（存在狀態的這幾欄） */
export interface Look2611 {
  crt: Crt;
  digital: Digital;
  ntsc: Ntsc;
  loop: Loop;
}
export const defaultLook2611 = (): Look2611 => ({
  crt: defaultCrt(),
  digital: defaultDigital(),
  ntsc: defaultNtsc(),
  loop: defaultLoop(),
});
export const normalizeLook2611 = (o: Record<string, unknown>): Look2611 => ({
  crt: normalizeCrt(o.crt),
  digital: normalizeDigital(o.digital),
  ntsc: normalizeNtsc(o.ntsc),
  loop: normalizeLoop(o.loop),
});
/** 有沒有用到 2026-11-10 的任何一項（都沒用時畫法和加入之前完全相同） */
export const look2611Active = (s: Look2611): boolean =>
  crtActive(s.crt) || s.digital.on || s.ntsc.on || s.loop.on;
