/**
 * 2026-11-10 加的設定（規格 1.11～1.17、3.13～3.17）：映像管（螢光粉遮罩、光暈）、數位攝影（相機與區塊壓縮）、NTSC 訊號、
 * Screen Loop（攝影機拍電視的畫面隧道），以及本站自己調的「樣子」（一鍵套用的預設集）。
 * 純資料與整理（不依賴畫布）：預設全部關閉，沒用到時畫法和加入之前完全相同（F98）。
 * 2026-11-12（規格 1.18～1.21，參考 NTSCRT `352b4dc`，MIT，授權全文在 UPSTREAM_LICENSE）：數位攝影多了編碼（方塊色）、CD-ROM 格式、
 * CCD 的反應、彩虹鋸齒、低光雜訊、銳利化的寬度、單場的掃描線；Screen Loop 多了亮度鍵反過來。預設都是「和以前一樣」（F110）。
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

/**
 * 格式（照 NTSCRT 的種類）：網路攝影機、視訊通話、MiniDV、早期網路影片、datamosh（2026-11-10，數值本站自己調）、
 * CD-ROM（2026-11-12，方塊色；數值照 NTSCRT 的 DigitalFormat，MIT）
 */
export type DigitalFormat = 'webcam' | 'call' | 'minidv' | 'web' | 'mosh' | 'cdrom';
export const DIGITAL_FORMATS: readonly DigitalFormat[] = [
  'webcam',
  'call',
  'minidv',
  'web',
  'mosh',
  'cdrom',
];

/**
 * 編碼（2026-11-12）：方塊雜訊＝8 × 8 DCT（MPEG、H.263、DV 這一類，原本的）；
 * 方塊色＝Microsoft Video 1（4 × 4 的方塊換成一、二或八個 15 位元色，早期 CD-ROM 的樣子；colorblock.ts）
 */
export type DigitalCodec = 'dct' | 'video1';
export const DIGITAL_CODECS: readonly DigitalCodec[] = ['dct', 'video1'];

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
  /** 編碼（2026-11-12；方塊色時色彩取樣一律 4:4:4、沒有柔化方塊的邊與 datamosh） */
  codec: DigitalCodec;
  /* 擷取 */
  /** 擷取的寬（px；高依比例） */
  width: number;
  /** 每秒幾格（雜訊、資料遺失、datamosh 依格變） */
  fps: number;
  /** 單場（原本叫「交錯」）：只用一個圖場、每列重複一次（斜線變成階梯） */
  interlace: boolean;
  /** 單場的掃描線（2026-11-12）：單場時掃描線一行一條（行數＝擷取的高 ÷ 2，240p 的樣子） */
  fieldScan: boolean;
  /** 鏡頭的柔焦、鋸齒（沒有先模糊就取樣：摩爾紋與彩虹邊）、感光雜訊、降噪（%） */
  lens: number;
  alias: number;
  noise: number;
  denoise: number;
  /** 彩虹鋸齒（2026-11-12，%）：紅綠藍各差三分之一格取樣，慢慢飄的摩爾紋變成彩虹；超過 50% 再加強細節 */
  rainbow: number;
  /** 低光雜訊（2026-11-12，%）：畫面越暗（亮度的中位數）感光雜訊越強，最多 8 倍 */
  lowLight: number;
  /* 畫面 */
  /** 曝光（百分之一級，±200＝±2 級；各色版各自到白就截斷） */
  exposure: number;
  /** 色溫（＋暖、－冷）、色調（＋洋紅、－綠）、飽和度（%）、黑位（%：黑色浮起）、銳利化（%） */
  warmth: number;
  tint: number;
  saturation: number;
  black: number;
  sharpen: number;
  /** CCD 的反應（2026-11-12，%）：90 年代 3CCD 攝影機的色調（自動曝光、亮部逐色爆白、黑色浮成乳灰） */
  ccd: number;
  /** 銳利化的寬度（2026-11-12，擷取的 px：1＝原本的、2～4 越寬白邊越軟） */
  halo: number;
  /* 壓縮 */
  /** 色彩取樣（CHROMA_SUBSAMPLING 的第幾個） */
  chroma: number;
  /** 畫質（%：8 × 8 區塊的量化） */
  quality: number;
  /** 關鍵影格的間隔（0.1 秒；0＝每一格都是完整的一張） */
  keyframe: number;
  /** 解碼時柔化方塊的邊（%） */
  blockSmooth: number;
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
  blockSmooth: { min: 0, max: 100 },
  loss: { min: 0, max: 100 },
  mosh: { min: 0, max: 100 },
  rainbow: { min: 0, max: 100 },
  lowLight: { min: 0, max: 100 },
  ccd: { min: 0, max: 100 },
  halo: { min: 1, max: 4 },
} as const;

type DigitalValues = Omit<Digital, 'on' | 'format'>;

/**
 * 2026-11-12 加的值都是「和以前一樣」：DCT、不加彩虹鋸齒、低光雜訊與 CCD 的反應、銳利化的寬度 1、掃描線照舊。
 * 2026-11-10 的五種格式、存檔裡沒有這幾欄的資料都用這組（畫出來和加入之前逐位元組相同）。
 */
const AS_BEFORE_1112 = {
  codec: 'dct',
  fieldScan: false,
  rainbow: 0,
  lowLight: 0,
  ccd: 0,
  halo: 1,
} as const satisfies Partial<DigitalValues>;
/**
 * 各格式的值。擷取的大小、格數、色彩取樣、交錯、是不是每一格各自壓縮是那種格式的規格（出處寫在規格 D35）；
 * 其他（曝光、色溫、雜訊、畫質、關鍵影格的間隔、遺失…）是本站照想要的樣子自己調的（種類參考 NTSCRT 的功能）。
 */
export const DIGITAL_PRESETS: Record<DigitalFormat, DigitalValues> = {
  /* 網路攝影機：USB 1.1 的 QVGA（320 × 240、15 格、YUY2 的 4:2:2、每一格各自壓縮）；
     樣子：昏暗的房間裡增益拉滿——偏暗、日光燈的藍綠、雜訊很多、黑色浮起變灰、鏡頭糊、顏色淡 */
  webcam: {
    ...AS_BEFORE_1112,
    width: 320,
    fps: 15,
    interlace: false,
    lens: 55,
    alias: 0,
    noise: 75,
    denoise: 15,
    exposure: -60,
    warmth: -45,
    tint: -25,
    saturation: 60,
    black: 12,
    sharpen: 0,
    chroma: 1,
    quality: 35,
    keyframe: 0,
    blockSmooth: 0,
    loss: 0,
    mosh: 0,
  },
  /* 視訊通話：H.261／H.263 的 CIF（352 × 288、4:2:0）；樣子：臉打太亮的過曝、白熾燈的暖色、降噪抹成塑膠臉、
     每秒 10 格的頓挫、方塊很粗、常常掉封包（糊到下一個關鍵影格） */
  call: {
    ...AS_BEFORE_1112,
    width: 352,
    fps: 10,
    interlace: false,
    lens: 10,
    alias: 30,
    noise: 10,
    denoise: 90,
    exposure: 70,
    warmth: 35,
    tint: 0,
    saturation: 110,
    black: 0,
    sharpen: 35,
    chroma: 2,
    quality: 12,
    keyframe: 20,
    blockSmooth: 0,
    loss: 30,
    mosh: 0,
  },
  /* MiniDV：DV（IEC 61834）的 525/60——720 × 480、29.97 格、4:1:1、交錯、每一格各自壓縮；
     樣子：家用 DV 拍白天戶外——乾淨偏冷、畫質高、細紋有一點摩爾紋、黑色純、偶爾磁帶掉訊的方塊 */
  minidv: {
    ...AS_BEFORE_1112,
    width: 720,
    fps: 30,
    interlace: true,
    lens: 0,
    alias: 30,
    noise: 20,
    denoise: 25,
    exposure: -20,
    warmth: -25,
    tint: -10,
    saturation: 95,
    black: 0,
    sharpen: 30,
    chroma: 3,
    quality: 90,
    keyframe: 0,
    blockSmooth: 0,
    loss: 6,
    mosh: 0,
  },
  /* 早期網路影片：Flash Video（Sorenson Spark／H.263）常見的 320 × 240、15 格、4:2:0；
     樣子：位元很少的串流——縮小過所以糊、編碼前先降噪、顏色淡、黑色微浮、一點雜訊讓方塊在平坦處爬動、
     方塊與色帶很明顯、解碼器把方塊的邊抹開、關鍵影格之後幾格慢慢補細節 */
  web: {
    ...AS_BEFORE_1112,
    width: 320,
    fps: 15,
    interlace: false,
    lens: 25,
    alias: 0,
    noise: 8,
    denoise: 40,
    exposure: 0,
    warmth: 0,
    tint: 0,
    saturation: 85,
    black: 3,
    sharpen: 0,
    chroma: 2,
    quality: 6,
    keyframe: 30,
    blockSmooth: 30,
    loss: 0,
    mosh: 0,
  },
  /* datamosh：不是一種格式（MPEG-4 Part 2 的 AVI〔4:2:0〕最常拿來做）；樣子：亮一點、鮮豔、邊緣脆（拖起來的顏色才明顯）、
     25 格、2 秒一個關鍵影格、大多數被丟掉，顏色被拖著流開 */
  mosh: {
    ...AS_BEFORE_1112,
    width: 400,
    fps: 25,
    interlace: false,
    lens: 0,
    alias: 20,
    noise: 5,
    denoise: 0,
    exposure: 20,
    warmth: 0,
    tint: 0,
    saturation: 120,
    black: 0,
    sharpen: 15,
    chroma: 2,
    quality: 55,
    keyframe: 20,
    blockSmooth: 0,
    loss: 0,
    mosh: 80,
  },
  /* CD-ROM（2026-11-12）：90 年代 CD-ROM 上 Video for Windows 的影片（Microsoft Video 1、240 寬、每秒 12 格、
     一秒多一個關鍵影格；電腦的影片不交錯）。值照 NTSCRT 的 DigitalFormat「CD-ROM (Video 1)」（MIT），
     NTSCRT 沒寫的是不改畫面的值；關鍵影格 1.25 秒在本站以 0.1 秒計，寫 1.2 秒（每 14 格一個，NTSCRT 15 格） */
  cdrom: {
    ...AS_BEFORE_1112,
    codec: 'video1',
    width: 240,
    fps: 12,
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
    chroma: 0,
    quality: 57,
    keyframe: 12,
    blockSmooth: 0,
    loss: 0,
    mosh: 0,
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
    codec: pick(o.codec, DIGITAL_CODECS, d.codec),
    interlace: bool(o.interlace, d.interlace),
    fieldScan: bool(o.fieldScan, d.fieldScan),
  };
}

/**
 * 編碼實際用的值：方塊色（Video 1）沒有色彩取樣（一律 4:4:4）、沒有柔化方塊的邊、沒有 datamosh（沒有移動可以拖；NTSCRT 也是）。
 * 存的值不改（換回 DCT 時還在）。
 */
export const effectiveDigital = (d: Digital): Digital =>
  d.codec === 'video1' ? { ...d, chroma: 0, blockSmooth: 0, mosh: 0 } : d;

/** 單場的掃描線有沒有作用（數位攝影開著、單場、一行一條；行數由擷取的高決定，見 exporter 的 lookParams） */
export const fieldScanOn = (d: Digital): boolean => d.on && d.interlace && d.fieldScan;

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
  /** 亮度鍵反過來（2026-11-12）：照片暗的部分蓋在上面（亮的背景、暗的主體時用） */
  keyInvert: boolean;
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
  soft: 15,
  color: -20,
  gain: 100,
  key: 0,
  keyInvert: false,
  seamless: true,
});

function normalizeLoop(raw: unknown): Loop {
  const d = defaultLoop();
  const o = obj(raw);
  return {
    ...tidyInts(raw, d, LOOP_RANGES),
    on: o.on === true,
    keyInvert: o.keyInvert === true,
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
