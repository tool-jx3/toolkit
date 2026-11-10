/**
 * NTSC／VHS 訊號模擬（規格 3.15、F87～F89）。
 *
 * 參考 ntsc-rs（https://github.com/ntsc-rs/ntsc-rs，`crates/ntscrs`，commit 8cfc510；MIT／ISC／Apache-2.0 三選一，本站採用 MIT，
 * 授權全文在同一個資料夾的 UPSTREAM_LICENSE）的演算法與數值，照本站的結構改寫：
 * 濾波器是「分子、分母」的資料（`Iir`）＋一個共用的套用函式；整段效果是一張步驟表（`PASSES`：每一步什麼時候做、做什麼），
 * 亂數（SplitMix64）、梯度雜訊（simplex、fBm）與「一條線的雪花」各是一個小函式。
 *
 * 做法（ntsc-rs 的模型）：RGB → YIQ，把 I、Q 調變到 4 倍色副載波取樣的亮度訊號上（複合訊號），在複合訊號上加雜訊、雪花、
 * 磁頭切換、追蹤雜訊，再用陷波濾波器拆回 Y 與 I、Q（色彩滲色、殘留的點狀干擾），之後是亮度拖影、振鈴、各平面的雜訊、
 * 色相誤差、色彩延遲、VHS 磁帶（邊緣波動、依磁帶速度的頻寬、色彩脫落、銳利化）與輸出的色度低通；兩個圖場（偶數列、奇數列）分開算。
 * 數值與 ntsc-rs 相同；單元測試 `tests/unit/vhs-frame-ntsc.test.ts` 對照 ntsc-rs 本身跑出來的結果（`fixtures/vhs-frame-ntsc-oracle.json`）。
 * ntsc-rs 以 f32 計算，這裡以 JS 的倍精度計算、平面存成 Float32Array，差異在 1e-4 以內。
 * 雜訊（simplex、fBm、雜湊）改寫自 ntsc-rs 的 noise/（其本身改寫自 Clatter，https://github.com/Ralith/clatter，MIT／Apache-2.0／zlib）。
 * 畫布上用時每一列左邊先補 32 個取樣（複製最左邊那一點）再算、算完丟掉：ntsc-rs 的濾波器從 0 起算，最左邊會有一道亮線（D37）。
 */

/* ---------- 設定（ntsc-rs 的 NtscEffect，本站用到的部分） ---------- */

export type FilterKind = 'butterworth' | 'constantK';
export type ChromaLowpass = 'none' | 'light' | 'full';
export type TapeSpeed = 'none' | 'sp' | 'lp' | 'ep';

export interface FbmNoise {
  frequency: number;
  intensity: number;
  detail: number;
}

export interface NtscParams {
  seed: number;
  /** 圖場：'interleaved'＝偶數列、奇數列分開算（ntsc-rs 的預設 InterleavedUpper）；'both'＝整張一起 */
  fields: 'interleaved' | 'both';
  filter: FilterKind;
  inputLuma: 'none' | 'box' | 'notch';
  chromaIn: ChromaLowpass;
  chromaOut: ChromaLowpass;
  compositeSharpening: number;
  compositeNoise: FbmNoise | null;
  snow: number;
  snowAnisotropy: number;
  headSwitching: {
    height: number;
    offset: number;
    shift: number;
    midLine: { position: number; jitter: number } | null;
  } | null;
  trackingNoise: {
    height: number;
    wave: number;
    snow: number;
    snowAnisotropy: number;
    noise: number;
  } | null;
  lumaSmear: number;
  ringing: { frequency: number; power: number; intensity: number } | null;
  lumaNoise: FbmNoise | null;
  chromaNoise: FbmNoise | null;
  chromaPhaseError: number;
  chromaPhaseNoise: number;
  chromaDelay: { h: number; v: number };
  vhs: {
    tape: TapeSpeed;
    chromaLoss: number;
    sharpen: { intensity: number; frequency: number } | null;
    edgeWave: { intensity: number; speed: number; frequency: number; detail: number } | null;
  } | null;
  chromaVertBlend: boolean;
  /** 頻寬的比例（ntsc-rs 的 Scale：橫、直；半解析度跑訊號時 0.5，看起來和全解析度差不多） */
  scale: number;
}

/** ntsc-rs 的預設設定（settings/standard.rs 的 Default） */
export const defaultNtscParams = (): NtscParams => ({
  seed: 0,
  fields: 'interleaved',
  filter: 'butterworth',
  inputLuma: 'notch',
  chromaIn: 'full',
  chromaOut: 'full',
  compositeSharpening: 1,
  compositeNoise: { frequency: 0.5, intensity: 0.05, detail: 1 },
  snow: 0.00025,
  snowAnisotropy: 0.5,
  headSwitching: { height: 8, offset: 3, shift: 72, midLine: { position: 0.95, jitter: 0.03 } },
  trackingNoise: { height: 12, wave: 15, snow: 0.025, snowAnisotropy: 0.25, noise: 0.25 },
  lumaSmear: 0.5,
  ringing: { frequency: 0.45, power: 4, intensity: 4 },
  lumaNoise: { frequency: 0.5, intensity: 0.01, detail: 1 },
  chromaNoise: { frequency: 0.05, intensity: 0.1, detail: 2 },
  chromaPhaseError: 0,
  chromaPhaseNoise: 0.001,
  chromaDelay: { h: 0, v: 0 },
  vhs: {
    tape: 'lp',
    chromaLoss: 0.000025,
    sharpen: { intensity: 0.25, frequency: 1 },
    edgeWave: { intensity: 0.5, speed: 4, frequency: 0.05, detail: 2 },
  },
  chromaVertBlend: false,
  scale: 1,
});

/** 磁帶速度決定的頻寬（Hz）與色度的延遲（取樣數） */
const TAPE: Record<Exclude<TapeSpeed, 'none'>, { luma: number; chroma: number; delay: number }> = {
  sp: { luma: 2400000, chroma: 320000, delay: 4 },
  lp: { luma: 1900000, chroma: 300000, delay: 5 },
  ep: { luma: 1400000, chroma: 280000, delay: 6 },
};

/** 取樣率：色副載波（315/88 MHz）的 4 倍 */
const NTSC_RATE = (315000000 / 88) * 4;

/** 各步驟的亂數種子（混進主種子，讓每一步的雜訊不同） */
const SEED = {
  composite: 0n,
  chromaI: 1n,
  headSwitching: 2n,
  tracking: 3n,
  chromaPhase: 4n,
  edgeWave: 5n,
  snow: 6n,
  chromaLoss: 7n,
  midLine: 8n,
  chromaQ: 9n,
  luma: 10n,
} as const;

const f32 = Math.fround;

/* ---------- 亂數：SplitMix64（MurmurHash3 的收尾函式） ---------- */

const M64 = (1n << 64n) - 1n;
const PHI = 0x9e3779b97f4a7c15n;

const fin64 = (s: bigint): bigint => {
  let z = ((s ^ (s >> 30n)) * 0xbf58476d1ce4e5b9n) & M64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M64;
  return z ^ (z >> 31n);
};
const fin32 = (s: bigint): number => {
  let z = ((s ^ (s >> 33n)) * 0x62a9d9ed799705f5n) & M64;
  z = ((z ^ (z >> 28n)) * 0xcb24d0a5c88c35b3n) & M64;
  return Number(z >> 32n);
};

/** 可以「混進」種子分岔的亂數；同樣的種子與混法永遠得到同樣的數列 */
export class SplitMix {
  private state: bigint;
  constructor(state: bigint) {
    this.state = state;
  }
  static of(seed: number | bigint): SplitMix {
    return new SplitMix(BigInt.asUintN(64, BigInt(seed)));
  }
  private step(): bigint {
    this.state = (this.state + PHI) & M64;
    return this.state;
  }
  /** 混進另一個種子，得到新的亂數（原本的不變） */
  mix(input: number | bigint): SplitMix {
    return new SplitMix(fin64((this.state + BigInt(input) + PHI) & M64));
  }
  u64(): bigint {
    return fin64(this.step());
  }
  u32(): number {
    return fin32(this.step());
  }
  i32(): number {
    return this.u32() | 0;
  }
  /** [0, 1) 的 f32（24 位元） */
  f32(): number {
    return (this.u32() >>> 8) / 16777216;
  }
  /** [0, 1) 的 f64（53 位元） */
  f64(): number {
    return Number(this.u64() >> 11n) / 9007199254740992;
  }
  /** [lo, hi) 的 f32 */
  rangeF32(lo: number, hi: number): number {
    return f32(lo + f32(this.f32() * f32(hi - lo)));
  }
  /** 幾何分布（每次成功的機率 p，lambda＝ln(1 − p)）：下一次成功之前失敗幾次；無限大時 Infinity */
  geometric(lambda: number): number {
    const v = Math.log(this.f64()) / lambda;
    return Number.isFinite(v) ? Math.trunc(v) : Number.POSITIVE_INFINITY;
  }
}

/* ---------- 梯度雜訊（simplex 1D、2D 與 fBm；32 位元整數的雜湊） ---------- */

function hash1(v: number): number {
  let h = Math.imul((v ^ 2747636419) >>> 0, 2654435769) >>> 0;
  h = Math.imul((h ^ (h >>> 16)) >>> 0, 2654435769) >>> 0;
  return Math.imul((h ^ (h >>> 16)) >>> 0, 2654435769) >>> 0;
}

/** PCG3D 的第一個分量 */
function hash3(x: number, y: number, z: number): number {
  let a = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  let b = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  let c = (Math.imul(z, 1664525) + 1013904223) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0;
  b = (b ^ (b >>> 16)) >>> 0;
  c = (c ^ (c >>> 16)) >>> 0;
  return (a + Math.imul(b, c)) >>> 0;
}

/** 1D 的梯度：±1～±8 */
const grad1 = (h: number) => ((h >>> 28) & 7) + 1;

export function simplex1(x: number, seed: number): number {
  const i0 = Math.floor(x);
  const x0 = x - i0;
  const x1 = x0 - 1;
  const h0 = hash1(((i0 | 0) ^ seed) >>> 0);
  const h1 = hash1((((i0 + 1) | 0) ^ seed) >>> 0);
  const g0 = h0 >= 0x80000000 ? -grad1(h0) : grad1(h0);
  const g1 = h1 >= 0x80000000 ? -grad1(h1) : grad1(h1);
  let t0 = 1 - x0 * x0;
  let t1 = 1 - x1 * x1;
  t0 *= t0;
  t1 *= t1;
  return t0 * t0 * g0 * x0 + t1 * t1 * g1 * x1;
}

const SKEW2 = (Math.sqrt(3) - 1) / 2;
const UNSKEW2 = (1 - 1 / Math.sqrt(3)) / 2;

/** 2D 的梯度：(±1, ±2) 或 (±2, ±1)，h 的低 3 位元決定 */
function grad2(h: number, x: number, y: number): number {
  const k = h & 7;
  const low = k < 4;
  const gx = (low ? !(k & 1) : !(k & 2)) ? (low ? 1 : 2) : low ? -1 : -2;
  const gy = (low ? !(k & 2) : !(k & 1)) ? (low ? 2 : 1) : low ? -2 : -1;
  return gx * x + gy * y;
}

export function simplex2(x: number, y: number, seed: number): number {
  const s = (x + y) * SKEW2;
  const ip = Math.floor(x + s);
  const jp = Math.floor(y + s);
  const t = (ip + jp) * UNSKEW2;
  const x0 = x - (ip - t);
  const y0 = y - (jp - t);
  const di = x0 >= y0 ? 1 : 0;
  const dj = y0 > x0 ? 1 : 0;
  const corners: [number, number, number, number][] = [
    [ip, jp, x0, y0],
    [ip + di, jp + dj, x0 - di + UNSKEW2, y0 - dj + UNSKEW2],
    [ip + 1, jp + 1, x0 - 1 + 2 * UNSKEW2, y0 - 1 + 2 * UNSKEW2],
  ];
  let sum = 0;
  for (const [ci, cj, cx, cy] of corners) {
    const w = Math.max(0, 0.5 - cx * cx - cy * cy);
    const w2 = w * w;
    sum += w2 * w2 * grad2(hash3(ci | 0, cj | 0, seed | 0), cx, cy);
  }
  return sum;
}

interface Fbm {
  seed: number;
  octaves: number;
  gain: number;
  frequency: number;
}

/** fBm：每一層頻率 × 2、振幅 × gain（2D；1D 的寫在 noiseLine 裡，gain 一律 1） */
function fbm2(n: Fbm, x: number, y: number): number {
  let px = x * n.frequency;
  let py = y * n.frequency;
  let out = simplex2(px, py, n.seed);
  let amp = n.gain;
  for (let o = 1; o < n.octaves; o++) {
    px *= 2;
    py *= 2;
    out += simplex2(px, py, n.seed) * amp;
    amp *= n.gain;
  }
  return out;
}

const octaves = (d: number) => Math.max(1, Math.min(5, Math.trunc(d)));

/* ---------- IIR 濾波器 ---------- */

/** 有理轉移函數：分子 num（num.length＝den.length ＋ 1）、分母 den（不含開頭的 1） */
export interface Iir {
  num: number[];
  den: number[];
}

const iir = (num: readonly number[], den: readonly number[]): Iir => {
  const n = den.length + 1;
  return { num: Array.from({ length: n }, (_, i) => num[i] ?? 0), den: [...den] };
};

/** 一階低通（常數 k）：截止頻率 cutoff、取樣率 rate */
export function lowpass(cutoff: number, rate: number): Iir {
  const dt = 1 / rate;
  const tau = 1 / (cutoff * 2 * Math.PI);
  const a = dt / (tau + dt);
  return iir([a], [-(1 - a)]);
}

/** 二階的陷波（freq 以奈奎斯特頻率為 1） */
export function notch(freq: number, quality: number): Iir {
  const bw = (freq / quality) * Math.PI;
  const w = freq * Math.PI;
  const beta = Math.tan(bw * 0.5);
  const gain = 1 / (1 + beta);
  const c = -2 * Math.cos(w) * gain;
  return iir([gain, c, gain], [c, 2 * gain - 1]);
}

/** 二階 Butterworth 低通 */
export function butterworth(cutoff: number, rate: number): Iir {
  const w = (Math.min(2 * cutoff, rate) / rate) * Math.PI;
  const sw = Math.sin(w);
  const cw = Math.cos(w);
  const alpha = sw / (2 * Math.SQRT1_2);
  const gain = 1 / (1 + alpha);
  const b = (1 - cw) * gain;
  return iir([b * 0.5, b, b * 0.5], [-2 * cw * gain, (1 - alpha) * gain]);
}

/** 兩個濾波器串接（分子、分母各自相乘） */
export function chain(a: Iir, b: Iir): Iir {
  const conv = (p: readonly number[], q: readonly number[]) => {
    const out = new Array(p.length + q.length - 1).fill(0);
    p.forEach((pv, i) => {
      q.forEach((qv, j) => {
        out[i + j] += pv * qv;
      });
    });
    while (out.length > 1 && out[out.length - 1] === 0) out.pop();
    return out;
  };
  const den = conv([1, ...a.den], [1, ...b.den]).slice(1);
  return iir(conv(a.num, b.num), den);
}

/** 「效果的強度」：scale × 濾波 ＋ (1 − scale) × 原訊號（負的 scale＝反過來加強） */
export function blend(f: Iir, scale: number): Iir {
  return iir(
    f.num.map((v, i) => scale * v + (1 - scale) * (i === 0 ? 1 : f.den[i - 1])),
    f.den,
  );
}

/** 依濾波器種類的低通：常數 k 連做三次、或 Butterworth */
const lowpassOf = (kind: FilterKind, cutoff: number, rate: number): Iir => {
  if (kind === 'butterworth') return butterworth(cutoff, rate);
  const one = lowpass(cutoff, rate);
  return chain(chain(one, one), one);
};

/** 穩態的起始狀態：好像左邊的訊號一直是 value */
function steadyState(f: Iir, value: number): number[] {
  const n = f.num.length;
  const z = new Array(n).fill(0);
  if (value === 0) return z;
  const { num, den } = f;
  let bSum = 0;
  for (let i = 1; i < n; i++) bSum += num[i] - den[i - 1] * num[0];
  z[0] = bSum / (den.reduce((a, b) => a + b, 0) + 1);
  let aSum = 1;
  let cSum = 0;
  for (let i = 1; i < n - 1; i++) {
    aSum += den[i - 1];
    cSum += num[i] - den[i - 1] * num[0];
    z[i] = (aSum * z[0] - cSum) * value;
  }
  z[0] *= value;
  return z;
}

type Start = 'zero' | 'first';

/** 對平面的每一列套用濾波器（就地改；delay＞0 時輸出往左挪 delay 個取樣，右端以最後一個取樣延伸）。最多 3 階（係數展開成區域變數） */
function filterRows(plane: Float32Array, width: number, f: Iir, start: Start, delay: number): void {
  const [b0, b1 = 0, b2 = 0, b3 = 0] = f.num;
  const [a1 = 0, a2 = 0, a3 = 0] = f.den;
  const zero = steadyState(f, 0);
  const unit = start === 'first' ? steadyState(f, 1) : zero;
  for (let o = 0; o + width <= plane.length; o += width) {
    const v0 = start === 'first' ? plane[o] : 0;
    let z0 = (unit[0] ?? 0) * v0;
    let z1 = (unit[1] ?? 0) * v0;
    let z2 = (unit[2] ?? 0) * v0;
    const end = o + width;
    /* 前 delay 個只讀不寫；之後每讀一個寫回 delay 個之前的位置；最後以最後一個取樣補 delay 次 */
    for (let i = o; i < end + delay; i++) {
      const s = plane[i < end ? i : end - 1];
      const y = z0 + b0 * s;
      z0 = z1 + b1 * s - a1 * y;
      z1 = z2 + b2 * s - a2 * y;
      z2 = b3 * s - a3 * y;
      if (i - delay >= o) plane[i - delay] = y;
    }
  }
}

/* ---------- 一列的平移（線性內插） ---------- */

/** 從 src 的第 from 個起、寬 width 的一列平移 shift 個取樣寫到 dst（可以是同一個陣列的不同位置）；外面用邊緣的值或 0 */
function shiftInto(
  src: Float32Array,
  from: number,
  dst: Float32Array,
  to: number,
  width: number,
  shift: number,
  extend: boolean,
): void {
  const whole = Math.trunc(shift) - (shift < 0 ? 1 : 0);
  const frac = shift - whole;
  const keep = 1 - frac;
  const edge = extend ? (whole >= 0 ? src[from] : src[from + width - 1]) : 0;
  for (let i = 0; i < width; i++) {
    const l = i - whole - 1;
    const left = l >= 0 && l < width ? src[from + l] : edge;
    const right = l + 1 >= 0 && l + 1 < width ? src[from + l + 1] : edge;
    dst[to + i] = left * frac + right * keep;
  }
}

/* ---------- YIQ 的一個圖場 ---------- */

interface Field {
  y: Float32Array;
  i: Float32Array;
  q: Float32Array;
  width: number;
  rows: number;
  /** 這個圖場的影格號碼（交錯時偶數列 2f、奇數列 2f ＋ 1） */
  frame: number;
  scratch: Float32Array;
  /** 每一列的暫存 */
  line: Float32Array;
}

interface Run {
  p: NtscParams;
  rng: SplitMix;
  /** 頻寬的比例（ntsc-rs 的 horizontal_scale／vertical_scale） */
  hs: number;
  vs: number;
}

const rowOf = (plane: Float32Array, f: Field, r: number) =>
  plane.subarray(r * f.width, (r + 1) * f.width);

/** 一列加上 fBm 雜訊（每一列從自己的亂數取種子與起點） */
function noiseLine(
  row: Float32Array,
  rng: SplitMix,
  index: number,
  frequency: number,
  intensity: number,
  detail: number,
): void {
  const r = rng.mix(index);
  const seed = r.i32();
  const offset = f32(r.f32() * row.length);
  const layers = octaves(detail);
  const k = f32(intensity * 0.25);
  for (let x = 0; x < row.length; x++) {
    let p = f32(offset + x) * frequency;
    let v = simplex1(p, seed);
    for (let o = 1; o < layers; o++) {
      p *= 2;
      v += simplex1(p, seed);
    }
    row[x] += v * k;
  }
}

/** 每一列都加 fBm 雜訊 */
function planeNoise(run: Run, f: Field, plane: Float32Array, n: FbmNoise, seed: bigint): void {
  const rng = run.rng.mix(seed).mix(f.frame);
  for (let r = 0; r < f.rows; r++)
    noiseLine(rowOf(plane, f, r), rng, r, n.frequency / run.hs, n.intensity, n.detail);
}

/**
 * 一條線的雪花：這一列的雪花濃度（anisotropy 越大越集中在少數幾列）→ 以幾何分布跳到下一個雪花，
 * 每個雪花是一段衰減的餘弦（長 8～64 個取樣）。
 */
function speckles(
  row: Float32Array,
  rng: SplitMix,
  intensity: number,
  anisotropy: number,
  hs: number,
): void {
  const I = intensity;
  const A = anisotropy;
  const logistic = Math.exp((rng.f64() - I) / (I * (1 - I) * (1 - A)));
  let line = A / (1 + logistic) + I * (1 - A);
  line = Math.min(1, Math.max(0, line * 0.125));
  if (!(line > 0)) return;
  const lambda = Math.log(1 - line);
  const width = row.length;
  let at = -64;
  for (;;) {
    at += rng.geometric(lambda);
    if (!(at < width)) break;
    const len = f32(rng.rangeF32(8, 64) * hs);
    const freq = rng.rangeF32(f32(len * 3), f32(len * 5));
    const end = at + Math.ceil(len);
    const amp = new SplitMix(rng.u64());
    for (let i = Math.max(0, at); i < Math.min(width, end); i++) {
      const x = i - at;
      const fall = 1 - x / len;
      row[i] += Math.cos((x * Math.PI) / freq) * fall * fall * amp.rangeF32(-1, 2);
    }
    at += 1;
  }
}

/** 色度（I、Q）以向量旋轉 turns 圈（色相偏移） */
function rotateChroma(i: Float32Array, q: Float32Array, turns: number): void {
  const a = turns * Math.PI * 2;
  const s = Math.sin(a);
  const c = Math.cos(a);
  for (let k = 0; k < i.length; k++) {
    const vi = i[k];
    const vq = q[k];
    i[k] = vi * c - vq * s;
    q[k] = vi * s + vq * c;
  }
}

/** 色副載波在第 r 列的相位（每列差半圈，每個圖場也差半圈） */
const carrier = (f: Field, r: number) => (f.frame + (r << 1)) & 2;
/** 調變（I、Q → 複合訊號）與解調用的四相位權重 */
const MOD_I = [1, 0, -1, 0];
const MOD_Q = [0, 1, 0, -1];
const DEMOD_I = [-1, 0, 1, 0];
const DEMOD_Q = [0, -1, 0, 1];

/** 色度低通（完整：I 1.3 MHz、Q 0.6 MHz；輕：都 2.6 MHz） */
function chromaLowpass(run: Run, f: Field, mode: ChromaLowpass): void {
  if (mode === 'none') return;
  const rate = NTSC_RATE * run.hs;
  if (mode === 'full') {
    filterRows(f.i, f.width, lowpassOf(run.p.filter, 1300000, rate), 'zero', 2);
    filterRows(f.q, f.width, lowpassOf(run.p.filter, 600000, rate), 'zero', 4);
  } else {
    const lp = lowpassOf(run.p.filter, 2600000, rate);
    filterRows(f.i, f.width, lp, 'zero', 1);
    filterRows(f.q, f.width, lp, 'zero', 1);
  }
}

/** 輸入亮度的低通（減少彩虹紋）：陷波或 4 點的方框 */
function inputLuma(run: Run, f: Field): void {
  const mode = run.p.inputLuma;
  if (mode === 'notch') filterRows(f.y, f.width, notch(0.5, 2), 'first', 0);
  if (mode !== 'box' || f.width < 2) return;
  const W = f.width;
  for (let r = 0; r < f.rows; r++) {
    const y = rowOf(f.y, f, r);
    /* 四格的視窗：左邊兩格先當成黑（16/255），往右滑 */
    const win = [16 / 255, 16 / 255, y[0], y[1]];
    let sum = win[0] + win[1] + win[2] + win[3];
    let head = 0;
    const last = y[W - 1];
    for (let x = 0; x < W; x++) {
      const c = x < W - 2 ? y[x + 2] : last;
      sum += c - win[head];
      win[head] = c;
      head = (head + 1) & 3;
      y[x] = sum * 0.25;
    }
  }
}

/** I、Q 調變到亮度上（複合訊號） */
function modulate(f: Field): void {
  for (let r = 0; r < f.rows; r++) {
    const ph = carrier(f, r);
    const o = r * f.width;
    for (let x = 0; x < f.width; x++) {
      const k = (x + ph) & 3;
      f.y[o + x] += f.i[o + x] * MOD_I[k] + f.q[o + x] * MOD_Q[k];
    }
  }
}

/** 拆回 Y 與 I、Q：陷波濾掉色副載波得到 Y，原訊號減 Y 是色度，以三點（左右各半）解調 */
function demodulate(f: Field): void {
  const W = f.width;
  const mod = f.scratch;
  mod.set(f.y);
  filterRows(f.y, W, notch(0.5, 2), 'zero', 0);
  const { y, i, q } = f;
  for (let r = 0; r < f.rows; r++) {
    const ph = carrier(f, r);
    const o = r * W;
    for (let x = 0; x < W; x++) {
      const k = (x + ph) & 3;
      const c = y[o + x] - mod[o + x];
      let vi = c * DEMOD_I[k];
      let vq = c * DEMOD_Q[k];
      if (x + 1 < W) {
        const n = (y[o + x + 1] - mod[o + x + 1]) * 0.5;
        vi += n * DEMOD_I[(k + 1) & 3];
        vq += n * DEMOD_Q[(k + 1) & 3];
      }
      if (x > 0) {
        const n = (y[o + x - 1] - mod[o + x - 1]) * 0.5;
        vi += n * DEMOD_I[(k + 3) & 3];
        vq += n * DEMOD_Q[(k + 3) & 3];
      }
      i[o + x] = vi;
      q[o + x] = vq;
    }
  }
}

/** VHS 的磁頭切換：畫面最下面幾列越往下錯開越多，第一列從中間（約 95% 處）才開始錯開，那裡有一道突波 */
function headSwitching(run: Run, f: Field): void {
  const hsw = run.p.headSwitching;
  if (!hsw) return;
  const total = Math.round(Math.max(0, hsw.height) * run.vs);
  const offset = Math.round(Math.max(0, hsw.offset) * run.vs);
  if (offset > total) return;
  const affected = total - offset;
  const start = Math.max(f.rows, affected) - affected;
  const cut = Math.max(0, affected - f.rows);
  const rng = run.rng.mix(SEED.headSwitching).mix(f.frame);
  const W = f.width;
  for (let r = start; r < f.rows; r++) {
    const index = affected - (r - start + cut);
    const base = f32(hsw.shift * f32(((index + offset) / total) ** 1.5));
    const shift = f32(f32(base + f32(rng.mix(index).f32() - 0.5)) * run.hs);
    const row = rowOf(f.y, f, r);
    if (index === affected && hsw.midLine) {
      shiftInto(row, 0, f.line, 0, W, shift, false);
      const m = run.rng.mix(SEED.midLine).mix(f.frame);
      const jitter = f32((f32(f32(m.f32() + m.f32()) * 0.5) - 0.5) * hsw.midLine.jitter);
      const from = Math.max(0, Math.trunc(f32(W * f32(hsw.midLine.position + jitter))));
      if (from > W) continue;
      row.set(f.line.subarray(from, W), from);
      const spike = f32(f32(m.f32() + 0.5) * 0.5);
      const len = 16 * run.hs;
      for (let x = from; x < Math.min(W, from + Math.ceil(len)); x++)
        row[x] += (1 - (x - from) / len) ** 3 * spike;
    } else {
      shiftInto(row, 0, f.line, 0, W, shift, false);
      row.set(f.line.subarray(0, W));
    }
  }
}

/** 追蹤雜訊：最下面一段，越往下越晃、雜訊與雪花越多 */
function trackingNoise(run: Run, f: Field): void {
  const tn = run.p.trackingNoise;
  if (!tn) return;
  const total = Math.round(Math.max(0, tn.height) * run.vs);
  const W = f.width;
  const rng = run.rng.mix(SEED.tracking).mix(f.frame);
  const seed = rng.i32();
  const offset = f32(rng.f32() * f.rows);
  const start = Math.max(f.rows, total) - total;
  const cut = Math.max(0, total - f.rows);
  const n = Math.min(total, f.rows);
  const wave = new Float32Array(n);
  for (let k = 0; k < n; k++) wave[k] = simplex1(f32(f32(offset + k) * 0.5), seed);
  for (let r = start; r < f.rows; r++) {
    const index = r - start + cut;
    const scale = f32(index / total);
    const row = rowOf(f.y, f, r);
    shiftInto(
      row,
      0,
      f.line,
      0,
      W,
      f32(wave[index - cut] * scale * tn.wave * 0.25 * run.hs),
      false,
    );
    row.set(f.line.subarray(0, W));
    noiseLine(row, rng, index, 0.25 / run.hs, f32(scale * scale * tn.noise * 4), 1);
    speckles(row, rng.mix(index), f32(tn.snow * f32(scale * scale)), tn.snowAnisotropy, run.hs);
  }
}

/** 色度的延遲：橫向（可以有小數）、縱向（整列） */
function chromaDelay(run: Run, f: Field): void {
  const h = run.p.chromaDelay.h * run.hs;
  const v = Math.round(run.p.chromaDelay.v * run.vs);
  if (h === 0 && v === 0) return;
  const W = f.width;
  for (const plane of [f.i, f.q]) {
    const order = v > 0 ? Array.from({ length: f.rows }, (_, k) => f.rows - 1 - k) : null;
    for (let k = 0; k < f.rows; k++) {
      const dst = order ? order[k] : k;
      const src = dst - v;
      if (src < 0 || src >= f.rows) {
        plane.fill(0, dst * W, (dst + 1) * W);
        continue;
      }
      if (h === 0) plane.copyWithin(dst * W, src * W, (src + 1) * W);
      else {
        shiftInto(plane, src * W, f.line, 0, W, h, false);
        plane.set(f.line.subarray(0, W), dst * W);
      }
    }
  }
}

/** VHS 的邊緣波動：整列（三個平面）左右晃，晃動量是隨列與時間慢慢變的 fBm */
function edgeWave(run: Run, f: Field): void {
  const ew = run.p.vhs?.edgeWave;
  if (!ew || !(ew.intensity > 0)) return;
  const rng = run.rng.mix(SEED.edgeWave);
  const n: Fbm = {
    seed: rng.i32(),
    octaves: octaves(ew.detail),
    gain: Math.SQRT1_2,
    frequency: ew.frequency / run.vs,
  };
  const offset = f32(rng.f32() * f.rows);
  const W = f.width;
  for (let r = 0; r < f.rows; r++) {
    const shift = (fbm2(n, offset + r, f.frame * ew.speed) / 0.022) * ew.intensity * 0.5 * run.hs;
    for (const plane of [f.y, f.i, f.q]) {
      shiftInto(plane, r * W, f.line, 0, W, shift, true);
      plane.set(f.line.subarray(0, W), r * W);
    }
  }
}

/** VHS 的磁帶：依速度限制亮度與色度的頻寬（色度另外延遲），再減一點低頻（亮度的輪廓） */
function tapeBandwidth(run: Run, f: Field): void {
  const tape = run.p.vhs?.tape ?? 'none';
  if (tape === 'none') return;
  const t = TAPE[tape];
  const rate = NTSC_RATE * run.hs;
  const delay = Math.round(t.delay * run.hs);
  filterRows(f.y, f.width, lowpassOf(run.p.filter, t.luma, rate), 'zero', 0);
  const chroma = lowpassOf(run.p.filter, t.chroma, rate);
  filterRows(f.i, f.width, chroma, 'zero', delay);
  filterRows(f.q, f.width, chroma, 'zero', delay);
  filterRows(f.y, f.width, blend(lowpass(t.luma, rate), -1.6), 'zero', 0);
}

/** VHS 的色彩脫落：隨機幾列整列沒有顏色 */
function chromaLoss(run: Run, f: Field): void {
  const p = run.p.vhs?.chromaLoss ?? 0;
  if (!(p > 0)) return;
  const rng = run.rng.mix(SEED.chromaLoss).mix(f.frame);
  const lambda = Math.log(1 - f32(p));
  const W = f.width;
  let r = 0;
  for (;;) {
    r += rng.geometric(lambda);
    if (!(r < f.rows)) break;
    f.i.fill(0, r * W, (r + 1) * W);
    f.q.fill(0, r * W, (r + 1) * W);
    r += 1;
  }
}

/** VHS 的銳利化（只對亮度） */
function vhsSharpen(run: Run, f: Field): void {
  const sh = run.p.vhs?.sharpen;
  const tape = run.p.vhs?.tape ?? 'none';
  if (!sh || tape === 'none') return;
  const extra = run.p.filter === 'constantK' ? 4 : 1;
  const lp = lowpassOf(run.p.filter, TAPE[tape].luma * extra * sh.frequency, NTSC_RATE * run.hs);
  filterRows(f.y, f.width, blend(lp, -sh.intensity * 2 * sh.frequency), 'zero', 0);
}

/** 色度和上一列平均（VHS 的做法） */
function chromaVertBlend(f: Field): void {
  const W = f.width;
  for (const plane of [f.i, f.q]) {
    const prev = new Float32Array(W);
    for (let r = 0; r < f.rows; r++) {
      const o = r * W;
      for (let x = 0; x < W; x++) {
        const c = plane[o + x];
        plane[o + x] = (prev[x] + c) * 0.5;
        prev[x] = c;
      }
    }
  }
}

/** 效果的步驟（照 ntsc-rs 的順序）：when 不成立的跳過 */
const PASSES: readonly { when: (p: NtscParams) => boolean; run: (r: Run, f: Field) => void }[] = [
  { when: (p) => p.inputLuma !== 'none', run: inputLuma },
  { when: (p) => p.chromaIn !== 'none', run: (r, f) => chromaLowpass(r, f, r.p.chromaIn) },
  { when: () => true, run: (_r, f) => modulate(f) },
  {
    when: (p) => p.compositeSharpening !== 0,
    run: (r, f) =>
      filterRows(
        f.y,
        f.width,
        blend(lowpass((315000000 / 88 / 2) * r.hs, NTSC_RATE * r.hs), -r.p.compositeSharpening),
        'zero',
        0,
      ),
  },
  {
    when: (p) => !!p.compositeNoise,
    run: (r, f) => {
      const n = r.p.compositeNoise as FbmNoise;
      planeNoise(r, f, f.y, n, SEED.composite);
    },
  },
  {
    when: (p) => p.snow > 0,
    run: (r, f) => {
      const rng = r.rng.mix(SEED.snow).mix(f.frame);
      const amount = f32(r.p.snow * f32(0.01));
      for (let k = 0; k < f.rows; k++)
        speckles(rowOf(f.y, f, k), rng.mix(k), amount, r.p.snowAnisotropy, r.hs);
    },
  },
  { when: (p) => !!p.headSwitching, run: headSwitching },
  { when: (p) => !!p.trackingNoise, run: trackingNoise },
  { when: () => true, run: (_r, f) => demodulate(f) },
  {
    when: (p) => p.lumaSmear > 0,
    run: (r, f) =>
      filterRows(f.y, f.width, lowpass(2 ** (-4 * r.p.lumaSmear) * 0.25, r.hs), 'zero', 0),
  },
  {
    when: (p) => !!p.ringing,
    run: (r, f) => {
      const rg = r.p.ringing as NonNullable<NtscParams['ringing']>;
      const freq = Math.min(1, Math.max(0, rg.frequency / r.hs));
      filterRows(f.y, f.width, blend(notch(freq, rg.power), rg.intensity), 'first', 1);
    },
  },
  {
    when: (p) => !!p.lumaNoise,
    run: (r, f) => planeNoise(r, f, f.y, r.p.lumaNoise as FbmNoise, SEED.luma),
  },
  {
    when: (p) => !!p.chromaNoise,
    run: (r, f) => {
      planeNoise(r, f, f.i, r.p.chromaNoise as FbmNoise, SEED.chromaI);
      planeNoise(r, f, f.q, r.p.chromaNoise as FbmNoise, SEED.chromaQ);
    },
  },
  {
    when: (p) => p.chromaPhaseError > 0,
    run: (r, f) => rotateChroma(f.i, f.q, r.p.chromaPhaseError),
  },
  {
    when: (p) => p.chromaPhaseNoise > 0,
    run: (r, f) => {
      const rng = r.rng.mix(SEED.chromaPhase).mix(f.frame);
      for (let k = 0; k < f.rows; k++) {
        const turns = f32(f32(rng.mix(k).f32() - 0.5) * 2 * r.p.chromaPhaseNoise);
        rotateChroma(rowOf(f.i, f, k), rowOf(f.q, f, k), turns);
      }
    },
  },
  { when: (p) => p.chromaDelay.h !== 0 || p.chromaDelay.v !== 0, run: chromaDelay },
  { when: (p) => !!p.vhs, run: edgeWave },
  { when: (p) => !!p.vhs, run: tapeBandwidth },
  { when: (p) => !!p.vhs, run: chromaLoss },
  { when: (p) => !!p.vhs, run: vhsSharpen },
  { when: (p) => p.chromaVertBlend, run: (_r, f) => chromaVertBlend(f) },
  { when: (p) => p.chromaOut !== 'none', run: (r, f) => chromaLowpass(r, f, r.p.chromaOut) },
];

/* ---------- 整張 ---------- */

/** 圖場的緩衝區（同樣的大小重複用） */
const buffers = new Map<number, Float32Array[]>();
const buffersOf = (n: number): Float32Array[] => {
  let b = buffers.get(n);
  if (!b) {
    if (buffers.size > 4) buffers.clear();
    b = [0, 1, 2, 3].map(() => new Float32Array(n));
    buffers.set(n, b);
  }
  return b;
};

/**
 * 一張圖套上效果，就地改：px 每個像素 stride 個數（RGB 或 RGBA，前三個是紅綠藍），讀進來乘 inScale、寫回去乘 outScale。
 * frame＝影格號碼（雜訊每格不同）。pad＞0 時每一列左邊先補 pad 個「最左邊那一點」再算、算完丟掉
 * （ntsc-rs 的濾波器從 0 起算，最左邊幾個取樣會有一道亮線；補邊之後亮線落在丟掉的那段裡）。
 */
function process(
  px: Float32Array | Uint8ClampedArray,
  stride: number,
  inScale: number,
  outScale: number,
  width: number,
  height: number,
  p: NtscParams,
  frame: number,
  pad = 0,
): void {
  /* 交錯：偶數列（影格 2f）、奇數列（影格 2f ＋ 1）各是一個圖場 */
  const groups = (
    p.fields === 'interleaved'
      ? [
          { first: 0, step: 2, rows: Math.ceil(height / 2), frame: frame * 2 },
          { first: 1, step: 2, rows: Math.floor(height / 2), frame: frame * 2 + 1 },
        ]
      : [{ first: 0, step: 1, rows: height, frame }]
  ).filter((g) => g.rows > 0);
  const run: Run = {
    p,
    rng: SplitMix.of(BigInt.asUintN(32, BigInt(p.seed | 0))),
    hs: p.scale,
    vs: p.scale,
  };
  const passes = PASSES.filter((s) => s.when(p));
  /* 圖場的一列＝左邊補的 pad 個＋原本的 width 個 */
  const fw = width + pad;
  const line = new Float32Array(fw);
  for (const g of groups) {
    const [y, i, q, scratch] = buffersOf(g.rows * fw);
    const f: Field = { y, i, q, width: fw, rows: g.rows, frame: g.frame, scratch, line };
    for (let r = 0; r < g.rows; r++) {
      const row = (g.first + r * g.step) * width * stride;
      let d = r * fw;
      for (let x = -pad; x < width; x++, d++) {
        const s = row + Math.max(0, x) * stride;
        const R = px[s] * inScale;
        const G = px[s + 1] * inScale;
        const B = px[s + 2] * inScale;
        y[d] = 0.299 * R + 0.587 * G + 0.114 * B;
        i[d] = 0.5959 * R - 0.2746 * G - 0.3213 * B;
        q[d] = 0.2115 * R - 0.5227 * G + 0.3112 * B;
      }
    }
    for (const step of passes) step.run(run, f);
    for (let r = 0; r < g.rows; r++) {
      let d = (g.first + r * g.step) * width * stride;
      let s = r * fw + pad;
      for (let x = 0; x < width; x++, s++, d += stride) {
        const Y = y[s];
        const I = i[s];
        const Q = q[s];
        px[d] = (Y + 0.956 * I + 0.619 * Q) * outScale;
        px[d + 1] = (Y - 0.272 * I - 0.647 * Q) * outScale;
        px[d + 2] = (Y - 1.106 * I + 1.703 * Q) * outScale;
      }
    }
  }
}

/** 一張 RGB 平面圖（每個像素 3 個 0～1 的數；可以超出範圍）套上效果，就地改；pad 見 process */
export const applyNtscRgb = (
  rgb: Float32Array,
  width: number,
  height: number,
  p: NtscParams,
  frame: number,
  pad = 0,
): void => process(rgb, 3, 1, 1, width, height, p, frame, pad);

/** 左邊補幾個取樣（畫布上用；ntsc-rs 的對照不補） */
export const NTSC_PAD = 32;

/** 畫布的 RGBA（0～255）套上效果（透明度不變、結果夾在 0～255）；左邊補 pad 個取樣再丟掉（預設 NTSC_PAD） */
export const applyNtscRgba = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  p: NtscParams,
  frame: number,
  pad = NTSC_PAD,
): void => process(rgba, 4, 1 / 255, 255, width, height, p, frame, pad);
