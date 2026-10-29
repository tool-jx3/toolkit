/**
 * 環境音合成的基本零件（純函式，Node 也能跑）：雜訊、RBJ 雙二階濾波器、共振器、平滑的隨機曲線、事件的放置、殘響。
 *
 * **無縫循環**是這裡的前提：每個聲音都算成一整段「首尾相接」的取樣（長度 n），所以
 * - 濾波器、殘響都當成環狀處理：先跑過最後一段（暖機，只更新狀態不寫出），再從頭跑到尾——
 *   第 0 個取樣看到的濾波器狀態就是「從尾巴接回來」時的狀態，接縫沒有跳動；
 * - 隨機曲線的控制點也是環狀的（最後一點接回第一點）；
 * - 事件（雨滴、雷、時鐘的滴答）超出結尾的部分繞回開頭疊加（`addWrapped`）。
 *
 * 取樣一律是 Float32Array（−1～1）；函式會直接改傳進來的陣列（in place）以免大量配置記憶體。
 */
import type { Random } from '@/core/timeline/random';

/* ---------- 雜訊 ---------- */

/** 白雜訊（均勻分布 −amp～amp），寫進 out（直接覆寫） */
export function fillWhite(out: Float32Array, rng: Random, amp = 1): Float32Array {
  const a = amp * 2;
  for (let i = 0; i < out.length; i++) out[i] = (rng.next() - 0.5) * a;
  return out;
}

/** 新的白雜訊 */
export const whiteNoise = (n: number, rng: Random, amp = 1): Float32Array =>
  fillWhite(new Float32Array(n), rng, amp);

/** 暖機長度：濾波器在接縫前先跑多少個取樣（最多整段） */
const warmLength = (n: number, warm: number) => Math.max(0, Math.min(n, Math.round(warm)));

/**
 * 白雜訊 → 粉紅雜訊（每八度 −3 dB），環狀處理。濾波係數是 Paul Kellet 的近似（公有領域，44.1 kHz 時最準；
 * 其他取樣率仍是平滑的往下斜）。輸出大約和輸入同樣的均方根。
 */
export function pinkInPlace(buf: Float32Array, warm = 32768): Float32Array {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  const n = buf.length;
  const step = (w: number) => {
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const y = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return y * 0.22;
  };
  for (let i = n - warmLength(n, warm); i < n; i++) step(buf[i]);
  for (let i = 0; i < n; i++) buf[i] = step(buf[i]);
  return buf;
}

/**
 * 白雜訊 → 棕色雜訊（每八度 −6 dB；有漏的積分），環狀處理。輸出大約和輸入同樣的均方根。
 */
export function brownInPlace(buf: Float32Array, warm = 32768): Float32Array {
  let y = 0;
  const n = buf.length;
  for (let i = n - warmLength(n, warm); i < n; i++) y = (y + 0.02 * buf[i]) / 1.02;
  for (let i = 0; i < n; i++) {
    y = (y + 0.02 * buf[i]) / 1.02;
    buf[i] = y * 5.6;
  }
  return buf;
}

/* ---------- 雙二階濾波器（RBJ Audio EQ Cookbook） ---------- */

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'notch';

/** 正規化後的係數（a0 = 1） */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * 濾波器係數。q：品質因數（Math.SQRT1_2＝Butterworth）；bandpass 的峰值增益固定 0 dB；peaking 用 gainDb。
 * 頻率夾在 1 Hz～0.49 × 取樣率。
 */
export function biquad(
  kind: BiquadKind,
  freq: number,
  q: number,
  sampleRate: number,
  gainDb = 0,
): Biquad {
  const f = Math.min(sampleRate * 0.49, Math.max(1, freq));
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.max(1e-4, q));
  let b0: number;
  let b1: number;
  let b2: number;
  let a0 = 1 + alpha;
  let a2 = 1 - alpha;
  const a1 = -2 * cosw;
  switch (kind) {
    case 'lowpass':
      b0 = (1 - cosw) / 2;
      b1 = 1 - cosw;
      b2 = b0;
      break;
    case 'highpass':
      b0 = (1 + cosw) / 2;
      b1 = -(1 + cosw);
      b2 = b0;
      break;
    case 'bandpass':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cosw;
      b2 = 1;
      break;
    case 'peaking': {
      const A = 10 ** (gainDb / 40);
      b0 = 1 + alpha * A;
      b1 = -2 * cosw;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a2 = 1 - alpha / A;
      break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * 固定係數的濾波，環狀處理（先跑最後 warm 個取樣暖機）。可以一次串好幾個濾波器。
 * warm 預設 0.5 秒左右的取樣數（呼叫端給），濾波器的記憶遠短於此時接縫的誤差可以忽略。
 */
export function filterPeriodic(
  buf: Float32Array,
  filters: Biquad | readonly Biquad[],
  warm = 16384,
): Float32Array {
  const list = Array.isArray(filters) ? filters : [filters as Biquad];
  const n = buf.length;
  const w = warmLength(n, warm);
  for (const c of list) {
    const { b0, b1, b2, a1, a2 } = c;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = n - w; i < n; i++) {
      const x = buf[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
    for (let i = 0; i < n; i++) {
      const x = buf[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      buf[i] = y;
    }
  }
  return buf;
}

/** 一般（非環狀）濾波：短的事件用，狀態從 0 開始 */
export function filterOnce(buf: Float32Array, filters: Biquad | readonly Biquad[]): Float32Array {
  const list = Array.isArray(filters) ? filters : [filters as Biquad];
  for (const c of list) {
    const { b0, b1, b2, a1, a2 } = c;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      buf[i] = y;
    }
  }
  return buf;
}

/**
 * 係數隨時間變的濾波（風的中心頻率、海浪的亮度），環狀處理。每 block 個取樣換一次係數：
 * coeffAt(k) 回傳第 k 個區塊的係數（k＝0～區塊數−1；暖機時也照區塊編號取，所以接縫兩邊用的係數一致）。
 */
export function filterVarying(
  buf: Float32Array,
  block: number,
  coeffAt: (k: number) => Biquad,
  warm = 16384,
): Float32Array {
  const n = buf.length;
  const blocks = Math.ceil(n / block);
  const cs: Biquad[] = new Array(blocks);
  for (let k = 0; k < blocks; k++) cs[k] = coeffAt(k);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const run = (from: number, to: number, write: boolean) => {
    let i = from;
    while (i < to) {
      const k = Math.floor(i / block);
      const end = Math.min(to, (k + 1) * block);
      const { b0, b1, b2, a1, a2 } = cs[k];
      for (; i < end; i++) {
        const x = buf[i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        if (write) buf[i] = y;
      }
    }
  };
  run(n - warmLength(n, warm), n, false);
  run(0, n, true);
  return buf;
}

/* ---------- 平滑的隨機曲線（控制訊號） ---------- */

/** 控制訊號：每 block 個取樣一個值，環狀（最後一個值接回第一個） */
export interface Curve {
  values: Float32Array;
  block: number;
}

/**
 * 環狀的平滑隨機曲線：count 個控制點平均分布在整段、值在 0～1（亂數），Catmull-Rom 內插到每個區塊，夾在 0～1。
 * shape（選填）把每個控制點的亂數改寫（例如 (u) => u ** 3 讓高峰少、平時低）。
 */
export function periodicCurve(
  n: number,
  block: number,
  count: number,
  rng: Random,
  shape?: (u: number, index: number) => number,
): Curve {
  const blocks = Math.max(1, Math.ceil(n / block));
  const m = Math.max(2, Math.round(count));
  const pts = new Float32Array(m);
  for (let j = 0; j < m; j++) pts[j] = shape ? shape(rng.next(), j) : rng.next();
  return curveFromPoints(pts, blocks, block);
}

/** 環狀的控制點 → 每個區塊的值（Catmull-Rom，夾在 0～1） */
export function curveFromPoints(pts: ArrayLike<number>, blocks: number, block: number): Curve {
  const m = pts.length;
  const values = new Float32Array(blocks);
  for (let k = 0; k < blocks; k++) {
    const x = (k / blocks) * m;
    const j = Math.floor(x);
    const t = x - j;
    const p0 = pts[(j - 1 + m) % m];
    const p1 = pts[j % m];
    const p2 = pts[(j + 1) % m];
    const p3 = pts[(j + 2) % m];
    const t2 = t * t;
    const t3 = t2 * t;
    const v =
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    values[k] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return { values, block };
}

/** 曲線在第 i 個取樣的值（區塊之間線性內插，環狀） */
export function curveAt(c: Curve, i: number): number {
  const nb = c.values.length;
  const x = i / c.block;
  const k = Math.floor(x);
  const f = x - k;
  const a = c.values[((k % nb) + nb) % nb];
  const b = c.values[(k + 1) % nb];
  return a + (b - a) * f;
}

/** 依曲線改變音量：buf[i] *= lo + (hi − lo) × curve(i)（環狀，區塊內線性內插） */
export function applyCurveGain(buf: Float32Array, c: Curve, lo: number, hi: number): Float32Array {
  const n = buf.length;
  const nb = c.values.length;
  const span = hi - lo;
  for (let k = 0; k < nb; k++) {
    const s = k * c.block;
    if (s >= n) break;
    const e = Math.min(n, s + c.block);
    const a = lo + span * c.values[k];
    const b = lo + span * c.values[(k + 1) % nb];
    const d = (b - a) / c.block;
    let g = a;
    for (let i = s; i < e; i++) {
      buf[i] *= g;
      g += d;
    }
  }
  return buf;
}

/* ---------- 事件 ---------- */

/** 把 src 疊加到 dst 的 start 位置（超出結尾的部分繞回開頭；start 可以是負數） */
export function addWrapped(
  dst: Float32Array,
  src: ArrayLike<number>,
  start: number,
  gain = 1,
): void {
  const n = dst.length;
  if (!n) return;
  let p = ((Math.round(start) % n) + n) % n;
  for (let i = 0; i < src.length; i++) {
    dst[p] += src[i] * gain;
    if (++p === n) p = 0;
  }
}

/** 等功率的左右聲道增益（pan：−1＝最左、0＝中間、1＝最右） */
export function panGains(pan: number): [number, number] {
  const p = Math.max(-1, Math.min(1, pan));
  const a = ((p + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

/** 疊加到立體聲（右聲道為 null 時只寫左聲道，增益用中間的） */
export function addPanned(
  left: Float32Array,
  right: Float32Array | null,
  src: ArrayLike<number>,
  start: number,
  pan: number,
  gain = 1,
): void {
  if (!right) {
    addWrapped(left, src, start, gain);
    return;
  }
  const [gl, gr] = panGains(pan);
  addWrapped(left, src, start, gain * gl);
  addWrapped(right, src, start, gain * gr);
}

/** [0, seconds) 之間的卜瓦松事件時間（每秒平均 rate 次），由小到大 */
export function poissonTimes(rate: number, seconds: number, rng: Random): number[] {
  const out: number[] = [];
  if (!(rate > 0) || !(seconds > 0)) return out;
  let t = -Math.log(1 - rng.next()) / rate;
  while (t < seconds) {
    out.push(t);
    t += -Math.log(1 - rng.next()) / rate;
  }
  return out;
}

/**
 * 整段裡平均分布的 count 個時間點，各自抖動 ±jitter（相對於間隔，0～0.5）。
 * 例如「這一段要有 3 聲雷」：彼此不會擠在一起、首尾相接時間隔也差不多。
 */
export function spreadTimes(count: number, seconds: number, rng: Random, jitter = 0.35): number[] {
  const out: number[] = [];
  if (count <= 0) return out;
  const gap = seconds / count;
  const offset = rng.next() * gap;
  for (let k = 0; k < count; k++) {
    out.push((offset + gap * (k + (rng.next() * 2 - 1) * jitter) + seconds) % seconds);
  }
  return out.sort((a, b) => a - b);
}

/** 對數均勻的亂數（例如頻率、音量：小的多、大的少） */
export const logRange = (rng: Random, lo: number, hi: number): number =>
  lo * (hi / lo) ** rng.next();

/**
 * 會衰減的正弦（水滴、滴答、杯子的清脆聲）：頻率 f0，可以隨時間上升（chirp：每秒乘上 1 ＋ chirp），
 * 起音 attack 秒、之後以時間常數 tau 衰減，長度約 6 × tau。
 */
export function decayingSine(
  f0: number,
  tau: number,
  sampleRate: number,
  {
    chirp = 0,
    attack = 0.001,
    phase = 0,
    length,
  }: { chirp?: number; attack?: number; phase?: number; length?: number } = {},
): Float32Array {
  const n = Math.max(1, Math.round((length ?? attack + tau * 6) * sampleRate));
  const out = new Float32Array(n);
  const dt = 1 / sampleRate;
  const atk = Math.max(1, attack * sampleRate);
  if (chirp === 0) {
    /* 頻率不變：用衰減的旋轉遞迴（快），每 2048 個取樣用精確值重設 */
    const w = 2 * Math.PI * f0 * dt;
    const r = Math.exp(-dt / tau);
    const c = Math.cos(w) * r;
    const s = Math.sin(w) * r;
    for (let start = 0; start < n; start += 2048) {
      const amp = Math.exp(-(start * dt) / tau);
      let x = Math.cos(w * start + phase) * amp;
      let y = Math.sin(w * start + phase) * amp;
      const end = Math.min(n, start + 2048);
      for (let i = start; i < end; i++) {
        out[i] = i < atk ? (y * i) / atk : y;
        const nx = x * c - y * s;
        y = x * s + y * c;
        x = nx;
      }
    }
    return out;
  }
  /* 頻率往上滑：每 16 個取樣換一次旋轉的角度（狀態向量連續，所以相位連續） */
  const r = Math.exp(-dt / tau);
  let x = Math.cos(phase);
  let y = Math.sin(phase);
  for (let start = 0; start < n; start += 16) {
    const f = f0 * (1 + chirp * (start + 8) * dt);
    const w = 2 * Math.PI * f * dt;
    const c = Math.cos(w) * r;
    const s = Math.sin(w) * r;
    const end = Math.min(n, start + 16);
    for (let i = start; i < end; i++) {
      const nx = x * c - y * s;
      y = x * s + y * c;
      x = nx;
      out[i] = i < atk ? (y * i) / atk : y;
    }
  }
  return out;
}

/** 短的雜訊爆發（指數衰減），長度約 6 × tau */
export function noiseBurst(
  tau: number,
  sampleRate: number,
  rng: Random,
  attack = 0.0005,
): Float32Array {
  const n = Math.max(2, Math.round((attack + tau * 6) * sampleRate));
  const out = new Float32Array(n);
  const atk = Math.max(1, attack * sampleRate);
  const k = Math.exp(-1 / (tau * sampleRate));
  let env = 1;
  for (let i = 0; i < n; i++) {
    out[i] = (rng.next() * 2 - 1) * env * (i < atk ? i / atk : 1);
    env *= k;
  }
  return out;
}

/**
 * 二極點共振器（衰減的振盪；敲擊木頭、玻璃、金屬的「叩」聲）：輸入通常是一個脈衝或很短的雜訊。
 * 回傳新的陣列（長度 length 個取樣）。
 */
export function resonate(
  input: ArrayLike<number>,
  freq: number,
  tau: number,
  sampleRate: number,
  length: number,
): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round(length)));
  const r = Math.exp(-1 / (tau * sampleRate));
  const w = (2 * Math.PI * Math.min(freq, sampleRate * 0.49)) / sampleRate;
  const c1 = 2 * r * Math.cos(w);
  const c2 = -r * r;
  /* 增益正規化：讓單位脈衝的輸出峰值大約是 1 */
  const g = (1 - r * r) / Math.max(1e-6, Math.sin(w)) / 2;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < out.length; i++) {
    const x = i < input.length ? input[i] : 0;
    const y = x * g + c1 * y1 + c2 * y2;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * 疊加一個正弦（out[i] += amp × sin(2π·freq·i ÷ sampleRate ＋ phase)）。用旋轉的遞迴算（比逐點 Math.sin 快很多），
 * 每 4096 個取樣用精確值重設一次，不會累積誤差。頻率是 1 ÷ 整段秒數的整數倍時剛好首尾相接。
 */
export function addSine(
  out: Float32Array,
  freq: number,
  amp: number,
  phase: number,
  sampleRate: number,
): void {
  const w = (2 * Math.PI * freq) / sampleRate;
  const c = Math.cos(w);
  const s = Math.sin(w);
  const n = out.length;
  for (let start = 0; start < n; start += 4096) {
    const ph = w * start + phase;
    let x = Math.cos(ph);
    let y = Math.sin(ph);
    const end = Math.min(n, start + 4096);
    for (let i = start; i < end; i++) {
      out[i] += y * amp;
      const nx = x * c - y * s;
      y = x * s + y * c;
      x = nx;
    }
  }
}

/** 把頻率調到「整段裡剛好整數個週期」（首尾相接不會跳）；至少 1 個週期 */
export const loopFrequency = (freq: number, seconds: number): number =>
  Math.max(1, Math.round(freq * seconds)) / seconds;

/** 陣列相加（a += b × gain，長度取兩者較短） */
export function mixInto(a: Float32Array, b: ArrayLike<number>, gain = 1): Float32Array {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) a[i] += b[i] * gain;
  return a;
}

/** 全部乘上 gain */
export function scale(a: Float32Array, gain: number): Float32Array {
  for (let i = 0; i < a.length; i++) a[i] *= gain;
  return a;
}

/* ---------- 殘響（環狀） ---------- */

/* Freeverb（Jezar，公有領域）的延遲長度，44.1 kHz 時的取樣數；右聲道多 23 個取樣 */
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];
const SPREAD = 23;

export interface ReverbOptions {
  /** 房間大小 0～1（回饋 0.7～0.98，越大殘響越長） */
  size: number;
  /** 高頻的吸收 0～1（越大越悶） */
  damp: number;
  /** 殘響的比例 0～1 */
  wet: number;
  /** 原音的比例（預設 1） */
  dry?: number;
  /** 暖機的秒數（預設依房間大小 2～6 秒） */
  warmSeconds?: number;
}

function reverbChannel(
  input: Float32Array,
  sampleRate: number,
  o: ReverbOptions,
  spread: number,
): Float32Array {
  const n = input.length;
  const k = sampleRate / 44100;
  const feedback = 0.7 + 0.28 * Math.max(0, Math.min(1, o.size));
  const damp = 0.05 + 0.6 * Math.max(0, Math.min(1, o.damp));
  const combs = COMBS.map((d) => ({
    buf: new Float32Array(Math.max(1, Math.round((d + spread) * k))),
    p: 0,
    store: 0,
  }));
  const aps = ALLPASSES.map((d) => ({
    buf: new Float32Array(Math.max(1, Math.round((d + spread) * k))),
    p: 0,
  }));
  const out = new Float32Array(n);
  const warm = warmLength(n, (o.warmSeconds ?? 2 + 4 * o.size) * sampleRate);
  const gainIn = 0.015;
  const tick = (x: number): number => {
    const xi = x * gainIn;
    let acc = 0;
    for (let c = 0; c < combs.length; c++) {
      const cb = combs[c];
      const y = cb.buf[cb.p];
      cb.store = y * (1 - damp) + cb.store * damp;
      cb.buf[cb.p] = xi + cb.store * feedback;
      if (++cb.p === cb.buf.length) cb.p = 0;
      acc += y;
    }
    for (let a = 0; a < aps.length; a++) {
      const ap = aps[a];
      const b = ap.buf[ap.p];
      ap.buf[ap.p] = acc + b * 0.5;
      acc = b - acc;
      if (++ap.p === ap.buf.length) ap.p = 0;
    }
    return acc;
  };
  for (let i = n - warm; i < n; i++) tick(input[i]);
  for (let i = 0; i < n; i++) out[i] = tick(input[i]);
  return out;
}

/**
 * 殘響（Freeverb 式的 8 個梳狀＋4 個全通濾波器），環狀處理，直接改 left／right。
 * 右聲道是 null 時只處理左聲道（單聲道）。
 */
export function reverbPeriodic(
  left: Float32Array,
  right: Float32Array | null,
  sampleRate: number,
  o: ReverbOptions,
): void {
  const dry = o.dry ?? 1;
  const wet = o.wet * 3;
  if (!right) {
    const w = reverbChannel(left, sampleRate, o, 0);
    for (let i = 0; i < left.length; i++) left[i] = left[i] * dry + w[i] * wet;
    return;
  }
  /* 兩個聲道各自的殘響用兩邊的平均當輸入（Freeverb 的做法），左右的延遲長度不同，聽起來比較寬 */
  const mono = new Float32Array(left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (left[i] + right[i]) * 0.5;
  const wl = reverbChannel(mono, sampleRate, o, 0);
  const wr = reverbChannel(mono, sampleRate, o, SPREAD);
  for (let i = 0; i < left.length; i++) {
    left[i] = left[i] * dry + wl[i] * wet;
    right[i] = right[i] * dry + wr[i] * wet;
  }
}

/* ---------- 量測 ---------- */

/** 均方根（多個聲道一起算） */
export function rms(channels: readonly Float32Array[]): number {
  let s = 0;
  let c = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
    c += ch.length;
  }
  return c ? Math.sqrt(s / c) : 0;
}

/** 絕對值的最大值 */
export function peak(channels: readonly Float32Array[]): number {
  let m = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i]));
  return m;
}

/** 線性 → dBFS */
export const toDb = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);
