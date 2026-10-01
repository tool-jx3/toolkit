/**
 * 輕量轉場 APNG 的純邏輯（不依賴 React／DOM，方便單元測試）：
 * 尺寸與檔名規則、影格時間軸、淡變與擦除的透明度、APNG 編碼。
 *
 * 規格：docs/refactor/specs/apng-wipe.md（3.2 時間軸、3.3 淡變、3.4 擦除、3.5 檔名、4.2 預覽倍率）。
 */
import { createEncoder, type EncodedFile } from '@/core/encode';

export type SizeKind = 'square' | 'portrait' | 'landscape' | 'free';
export type WipeMode = 'normal' | 'wipe';
export type WipeDirection = 'cover' | 'reveal';
export type PlayCount = 'once' | 'loop';

export const SIZE_PRESETS: Record<Exclude<SizeKind, 'free'>, { width: number; height: number }> = {
  square: { width: 15, height: 15 },
  portrait: { width: 15, height: 30 },
  landscape: { width: 30, height: 15 },
};

/** 時長的 11 段固定值（秒） */
export const DURATIONS = [0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;
/** 擦除角度（度）：0° 往右、90° 往下…（畫面座標，y 向下） */
export const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
/** 自訂尺寸的範圍 */
export const MIN_SIDE = 1;
export const MAX_SIDE = 1200;
/** 取樣：每秒 30 格 */
export const SAMPLE_FPS = 30;
/** 擦除最後多停留的一格（毫秒） */
export const WIPE_HOLD_MS = 34;
/** 預覽：最多放大 4 倍；長邊超過 180 px 時縮到 180 px */
export const PREVIEW_MAX_SCALE = 4;
export const PREVIEW_LONG_SIDE = 180;

export interface WipeSettings {
  sizeKind: SizeKind;
  /** 自訂寬高：保留使用者輸入的原文（匯出時才檢查） */
  customWidth: string;
  customHeight: string;
  mode: WipeMode;
  angle: number;
  /** 秒（DURATIONS 之一） */
  duration: number;
  direction: WipeDirection;
  plays: PlayCount;
  /** 小寫 #rrggbb */
  color: string;
}

export const DEFAULT_SETTINGS: WipeSettings = {
  sizeKind: 'square',
  customWidth: '20',
  customHeight: '20',
  mode: 'normal',
  angle: 0,
  duration: 1,
  direction: 'cover',
  plays: 'once',
  color: '#28212f',
};

/* ---------- 尺寸 ---------- */

/** 自訂寬或高：必須是 1～1200 的整數，否則 null（匯出時報錯） */
export function parseSide(text: string): number | null {
  const s = text.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= MIN_SIDE && n <= MAX_SIDE ? n : null;
}

/** 預覽用的寬或高：取整數部分；小於 1 或空白當 1；大於 1200 當 1200 */
export function previewSide(text: string): number {
  const n = Math.trunc(Number(text.trim()));
  if (Number.isNaN(n) || n < MIN_SIDE) return MIN_SIDE;
  return Math.min(MAX_SIDE, n);
}

/** 匯出尺寸；自訂寬高不合法時回傳 null */
export function exportSize(s: WipeSettings): { width: number; height: number } | null {
  if (s.sizeKind !== 'free') return SIZE_PRESETS[s.sizeKind];
  const width = parseSide(s.customWidth);
  const height = parseSide(s.customHeight);
  return width && height ? { width, height } : null;
}

/** 預覽尺寸（不合法的自訂值修正後照樣顯示） */
export function previewSize(s: WipeSettings): { width: number; height: number } {
  if (s.sizeKind !== 'free') return SIZE_PRESETS[s.sizeKind];
  return { width: previewSide(s.customWidth), height: previewSide(s.customHeight) };
}

/** 預覽倍率＝min(4, 180 ÷ 長邊) */
export const previewScale = (width: number, height: number): number =>
  Math.min(PREVIEW_MAX_SCALE, PREVIEW_LONG_SIDE / Math.max(width, height));

/** 倍率標示：≥ 1 時四捨五入到小數一位（4、1.8、3.9、1）；< 1 時回傳 null（改說明已縮小） */
export function scaleLabel(scale: number): string | null {
  if (scale < 1) return null;
  return String(Math.round(scale * 10) / 10);
}

/** 檔名：transition-<尺寸類型>-<轉場方式>-<變化方向>-<角度>deg.png（淡變也帶角度） */
export const transitionFileName = (s: WipeSettings): string =>
  `transition-${s.sizeKind}-${s.mode}-${s.direction}-${s.angle}deg.png`;

/* ---------- 時間軸 ---------- */

export interface FrameSample {
  /** 開始時間（毫秒） */
  time: number;
  /** 進度 0～1 */
  t: number;
  /** 顯示時間（毫秒） */
  delay: number;
}

/** 總毫秒（所選時長） */
export const totalMs = (duration: number): number => Math.round(duration * 1000);

/**
 * 取樣點（合併相同影格之前）：取樣數＝時長 × 30；第 k 點的時間＝總毫秒 × k ÷ 取樣數（四捨五入）。
 * 淡變取 k＝0…取樣數−1（不含 t＝1），最後一格停到總毫秒；擦除另加 t＝1 的最終影格並停 34 ms。
 */
export function frameSamples(mode: WipeMode, duration: number): FrameSample[] {
  const total = totalMs(duration);
  const n = Math.round(duration * SAMPLE_FPS);
  const last = mode === 'wipe' ? n : n - 1;
  const times: number[] = [];
  for (let k = 0; k <= last; k++) times.push(Math.round((total * k) / n));
  return times.map((time, k) => ({
    time,
    t: time / total,
    delay:
      k < times.length - 1 ? times[k + 1] - time : mode === 'wipe' ? WIPE_HOLD_MS : total - time,
  }));
}

/** 預覽與動畫的一個週期（毫秒）：淡變＝時長；擦除＝時長＋34 ms */
export const cycleMs = (mode: WipeMode, duration: number): number =>
  totalMs(duration) + (mode === 'wipe' ? WIPE_HOLD_MS : 0);

/* ---------- 透明度 ---------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 淡變：整張同一個透明度。
 * 蓋上：t 0.25 以前 0，0.25～0.85 等速升到 255；揭開：t 0.15 以前 255，0.15～0.75 等速降到 0。
 */
export function fadeAlpha(t: number, direction: WipeDirection): number {
  if (direction === 'cover') return Math.round(255 * clamp01((t - 0.25) / 0.6));
  return Math.round(255 * (1 - clamp01((t - 0.15) / 0.6)));
}

/**
 * 擦除「蓋上」的透明度分布（規格 3.4 的量測表）：列為 t＝0、0.1…1，欄為 q＝0、0.2…1。
 * 表以外的點做雙線性內插。
 */
export const WIPE_COVER_TABLE: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0],
  [30, 20, 12, 5, 2, 0],
  [61, 47, 35, 25, 15, 8],
  [101, 83, 68, 53, 40, 30],
  [147, 128, 109, 92, 75, 61],
  [189, 173, 156, 137, 117, 100],
  [220, 208, 195, 180, 163, 146],
  [244, 235, 225, 214, 201, 187],
  [255, 252, 247, 239, 230, 220],
  [255, 255, 255, 253, 249, 243],
  [255, 255, 255, 255, 255, 255],
];
const T_STEPS = WIPE_COVER_TABLE.length - 1;
const Q_STEPS = WIPE_COVER_TABLE[0].length - 1;

/** 時刻 t 的「q → 透明度」折線（6 個節點） */
function wipeRow(t: number): Float64Array {
  const ti = clamp01(t) * T_STEPS;
  const i0 = Math.min(T_STEPS - 1, Math.floor(ti));
  const f = ti - i0;
  const a = WIPE_COVER_TABLE[i0];
  const b = WIPE_COVER_TABLE[i0 + 1];
  const row = new Float64Array(Q_STEPS + 1);
  for (let j = 0; j <= Q_STEPS; j++) row[j] = a[j] + (b[j] - a[j]) * f;
  return row;
}

function rowAt(row: Float64Array, q: number): number {
  const qi = clamp01(q) * Q_STEPS;
  const j0 = Math.min(Q_STEPS - 1, Math.floor(qi));
  return row[j0] + (row[j0 + 1] - row[j0]) * (qi - j0);
}

/** 擦除的透明度（整數）：只由 t 與 q 決定；揭開＝255 − 蓋上 */
export function wipeAlpha(t: number, q: number, direction: WipeDirection): number {
  const cover = Math.round(rowAt(wipeRow(t), q));
  return direction === 'cover' ? cover : 255 - cover;
}

/** 角度 → 移動方向（畫面座標）。用整數向量，斜角也精確（正規化後與長度無關） */
export function directionVector(angle: number): [number, number] {
  const a = (((Math.round(angle / 45) % 8) + 8) % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const table: [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  return table[a];
}

/**
 * 擦除的位置場：每個像素中心投影到移動方向上，以四個角的投影最小值為 0、最大值為 1 正規化（q）。
 * 投影值是整數（像素中心座標乘 2），所以同一條等透明度線上的像素 q 完全相同；
 * 每個像素存「槽位」編號，每一格只需要對每個槽位算一次透明度。
 */
export class WipeField {
  readonly width: number;
  readonly height: number;
  /** 每個像素的槽位 */
  readonly slotOf: Uint16Array;
  /** 有用到的槽位 */
  readonly usedSlots: Int32Array;
  /** 槽位 → q */
  readonly qOfSlot: Float64Array;

  constructor(width: number, height: number, angle: number) {
    this.width = width;
    this.height = height;
    const [dx, dy] = directionVector(angle);
    const corners = [
      [0, 0],
      [2 * width, 0],
      [0, 2 * height],
      [2 * width, 2 * height],
    ].map(([x, y]) => dx * x + dy * y);
    const pMin = Math.min(...corners);
    const pMax = Math.max(...corners);
    const span = pMax - pMin;
    this.qOfSlot = new Float64Array(span + 1);
    for (let k = 0; k <= span; k++) this.qOfSlot[k] = k / span;
    this.slotOf = new Uint16Array(width * height);
    const used = new Uint8Array(span + 1);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const slot = dx * (2 * x + 1) + dy * (2 * y + 1) - pMin;
        this.slotOf[y * width + x] = slot;
        used[slot] = 1;
      }
    }
    const list: number[] = [];
    used.forEach((u, k) => {
      if (u) list.push(k);
    });
    this.usedSlots = Int32Array.from(list);
  }

  /** 時刻 t 每個槽位的透明度（沒用到的槽位為 0） */
  levels(t: number, direction: WipeDirection): Uint8Array {
    const row = wipeRow(t);
    const out = new Uint8Array(this.qOfSlot.length);
    for (const k of this.usedSlots) {
      const cover = Math.round(rowAt(row, this.qOfSlot[k]));
      out[k] = direction === 'cover' ? cover : 255 - cover;
    }
    return out;
  }
}

export interface TransitionSpec {
  width: number;
  height: number;
  mode: WipeMode;
  angle: number;
  duration: number;
  direction: WipeDirection;
}

/**
 * 逐格的透明度（width×height）。擦除時傳入同尺寸、同角度的 WipeField（可重複使用）。
 * out 給了就寫進去（預覽每秒 60 次，避免一直配置記憶體）。
 */
export function alphaFrame(
  spec: TransitionSpec,
  t: number,
  field: WipeField | null,
  out = new Uint8Array(spec.width * spec.height),
): Uint8Array {
  if (spec.mode === 'normal' || !field) {
    out.fill(fadeAlpha(t, spec.direction));
    return out;
  }
  const lv = field.levels(t, spec.direction);
  const slots = field.slotOf;
  for (let i = 0; i < out.length; i++) out[i] = lv[slots[i]];
  return out;
}

/** 透明度 → RGBA（每個像素的 RGB 都是所選顏色，包含完全透明的像素） */
export function toRgba(
  alpha: Uint8Array,
  color: string,
  out = new Uint8ClampedArray(alpha.length * 4),
): Uint8ClampedArray<ArrayBuffer> {
  const [r, g, b] = hexToRgb(color);
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    out[j + 3] = alpha[i];
  }
  return out as Uint8ClampedArray<ArrayBuffer>;
}

/** #rrggbb → [r, g, b] */
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 色碼欄：只接受「#」＋ 6 位 16 進位（大小寫皆可），確定後轉小寫；不合法回傳 null */
export function parseHexColor(text: string): string | null {
  const s = text.trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
}

/* ---------- 匯出 ---------- */

export interface TransitionFile {
  bytes: Uint8Array<ArrayBuffer>;
  fileName: string;
  width: number;
  height: number;
  /** 實際存進檔案的影格數（合併相同影格之後） */
  frames: number;
  /** 總長（毫秒） */
  duration: number;
}

/** 這組設定用到的所有透明度（由小到大），用來做最小的固定調色盤 */
function usedAlphas(spec: TransitionSpec, samples: FrameSample[], field: WipeField | null) {
  const seen = new Uint8Array(256);
  for (const s of samples) {
    if (!field) seen[fadeAlpha(s.t, spec.direction)] = 1;
    else {
      const lv = field.levels(s.t, spec.direction);
      for (const k of field.usedSlots) seen[lv[k]] = 1;
    }
  }
  const out: number[] = [];
  seen.forEach((v, a) => {
    if (v) out.push(a);
  });
  return out;
}

export interface EncodeTransitionOptions {
  /** 在 Worker 裡編碼（預設：瀏覽器支援就用） */
  worker?: boolean;
  /** 0～1 */
  onProgress?: (ratio: number) => void;
}

/**
 * 產生 APNG：每秒 30 格取樣、相同的連續影格合併（延遲相加）、延遲以毫秒／1000 表示；
 * 單次＝播放 1 次、循環＝無限次；調色盤只放所選顏色＋用到的透明度（顏色完全不變、檔案最小）。
 */
export async function encodeTransition(
  settings: WipeSettings,
  options: EncodeTransitionOptions = {},
): Promise<TransitionFile> {
  const size = exportSize(settings);
  if (!size) throw new RangeError('寬與高必須是 1～1200 的整數');
  const spec: TransitionSpec = { ...size, ...pick(settings) };
  const samples = frameSamples(spec.mode, spec.duration);
  const field = spec.mode === 'wipe' ? new WipeField(size.width, size.height, spec.angle) : null;
  const [r, g, b] = hexToRgb(settings.color);
  const alphas = usedAlphas(spec, samples, field);
  const palette = new Uint8Array(alphas.length * 4);
  alphas.forEach((a, i) => {
    palette.set([r, g, b, a], i * 4);
  });

  const encoder = createEncoder(
    {
      format: 'apng',
      options: {
        width: size.width,
        height: size.height,
        fps: 1000,
        plays: settings.plays === 'once' ? 1 : 0,
        palette,
        mergeIdentical: true,
      },
    },
    { worker: options.worker },
  );
  let file: EncodedFile;
  try {
    const alpha = new Uint8Array(size.width * size.height);
    for (let k = 0; k < samples.length; k++) {
      const s = samples[k];
      alphaFrame(spec, s.t, field, alpha);
      /* 編碼器會接手這塊記憶體，所以每格都配置新的 */
      await encoder.addFrame(toRgba(alpha, settings.color), s.delay);
      options.onProgress?.((k + 1) / samples.length);
    }
    file = await encoder.finish();
  } catch (e) {
    encoder.abort();
    throw e;
  }
  return {
    bytes: file.bytes,
    fileName: transitionFileName(settings),
    width: size.width,
    height: size.height,
    frames: file.storedFrames,
    duration: Math.round(file.duration * 1000),
  };
}

const pick = ({ mode, angle, duration, direction }: WipeSettings) => ({
  mode,
  angle,
  duration,
  direction,
});

/** 檔案大小：KB（1 KB＝1024 位元組），一位小數 */
export const formatKb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
