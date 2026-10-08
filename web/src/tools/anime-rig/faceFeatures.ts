/**
 * 臉部特徵點 → 立繪的參數：頭部角度、左右眼張開度、視線、嘴巴張開與笑臉、眉毛（規格 1.7、3.5）。
 *
 * 參考原作 Anime2.5DRig（MIT）的 face-features.js 改寫，數值相同。特徵點是 MediaPipe 臉部網格的
 * 478 點（468 點的臉＋左右虹膜各 5 點）；原作用 face_mesh（refineLandmarks），新版用 tasks-vision 的
 * FaceLandmarker——兩者的特徵點編號與座標（0～1，以影像寬高正規化）相同。
 * 純函式＋一個小的有狀態追蹤器（校正、One Euro 濾波），Node 也能跑。
 */

export const clamp01 = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/* ---------- One Euro 濾波（Casiez et al. 2012）：靜止時抖動小、動作時延遲小 ---------- */

function smoothingFactor(cutoff: number, dt: number): number {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

export class OneEuro {
  x: number | null = null;
  dx = 0;
  t: number | null = null;
  constructor(
    public minCutoff: number,
    public beta: number,
    public dCutoff = 1,
  ) {}

  /** 濾波；t 以秒計。時間沒有往前（或第一次）時直接採用這個值 */
  filter(value: number, t: number): number {
    if (this.x === null || this.t === null || !(t > this.t)) {
      this.x = value;
      this.t = t;
      this.dx = 0;
      return value;
    }
    const dt = Math.min(1, t - this.t);
    this.t = t;
    const dx = (value - this.x) / dt;
    this.dx += smoothingFactor(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += smoothingFactor(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset(): void {
    this.x = null;
    this.t = null;
    this.dx = 0;
  }
}

/* ---------- 特徵點編號（MediaPipe 臉部網格） ---------- */

export const INDEX = {
  nose: 1,
  forehead: 10,
  chin: 152,
  cheekR: 234,
  cheekL: 454,
  eyeR: { top: 159, bottom: 145, outer: 33, inner: 133 },
  eyeL: { top: 386, bottom: 374, outer: 263, inner: 362 },
  browR: [70, 63, 105, 66, 107],
  browL: [300, 293, 334, 296, 336],
  mouth: { top: 13, bottom: 14, right: 61, left: 291 },
  irisR: 468,
  irisL: 473,
} as const;

/** 攝影機小畫面上畫的點：眼睛、眉毛、嘴巴、鼻子、虹膜 */
export const PREVIEW_POINTS = [
  33, 133, 159, 145, 263, 362, 386, 374, 70, 105, 107, 300, 334, 336, 61, 291, 13, 14, 1, 468, 473,
] as const;

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface FaceMeasure {
  yaw: number;
  pitch: number;
  roll: number;
  eyeL: number;
  eyeR: number;
  browL: number;
  browR: number;
  mouthOpen: number;
  smile: number;
  gazeX: number;
  gazeY: number;
  hasIris: boolean;
}

/**
 * 一張臉的量測（與大小無關）。aspect＝影片的寬 ÷ 高，讓 x、y 用同樣的單位。
 * 本人的右眼在影像的左邊，像照鏡子一樣帶動立繪畫面左邊的眼睛（L）。
 */
export function measure(
  lm: readonly Landmark[] | null | undefined,
  aspect: number,
): FaceMeasure | null {
  if (!lm || lm.length < 468) return null;
  const ar = aspect > 0 ? aspect : 4 / 3;
  const P = (i: number) => {
    const p = lm[i];
    return { x: p.x * ar, y: p.y };
  };
  const d = (a: number, b: number) => {
    const p = P(a);
    const q = P(b);
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  const I = INDEX;
  const chL = P(I.cheekL);
  const chR = P(I.cheekR);
  const nose = P(I.nose);
  const top = P(I.forehead);
  const chin = P(I.chin);
  const fw = Math.hypot(chL.x - chR.x, chL.y - chR.y);
  const fh = Math.hypot(top.x - chin.x, top.y - chin.y);
  if (!(fw > 1e-4) || !(fh > 1e-4)) return null;
  type Eye = { top: number; bottom: number; outer: number; inner: number };
  const eo = (e: Eye) => d(e.top, e.bottom) / (d(e.outer, e.inner) || 1e-4);
  const browDist = (ids: readonly number[], e: Eye) => {
    let y = 0;
    for (const i of ids) y += P(i).y;
    return (P(e.top).y - y / ids.length) / fh;
  };
  const mw = d(I.mouth.right, I.mouth.left) || 1e-4;
  /* 笑臉比較嘴角與上唇（張嘴時上唇幾乎不動；用嘴唇中點會把張嘴當成笑） */
  const mc = P(I.mouth.top).y;
  const out: FaceMeasure = {
    yaw: (nose.x - (chL.x + chR.x) / 2) / fw,
    pitch: (nose.y - (top.y + chin.y) / 2) / Math.abs(chin.y - top.y || 1e-4),
    roll: Math.atan2(P(I.eyeL.outer).y - P(I.eyeR.outer).y, P(I.eyeL.outer).x - P(I.eyeR.outer).x),
    eyeL: eo(I.eyeR) /* 鏡像：本人的右眼 → 畫面左邊 */,
    eyeR: eo(I.eyeL),
    browL: browDist(I.browR, I.eyeR),
    browR: browDist(I.browL, I.eyeL),
    mouthOpen: d(I.mouth.top, I.mouth.bottom) / mw,
    smile: (mc - (P(I.mouth.right).y + P(I.mouth.left).y) / 2) / mw,
    gazeX: 0,
    gazeY: 0,
    hasIris: lm.length >= 478,
  };
  if (out.hasIris) {
    const gz = (ir: number, e: Eye) => {
      const a = P(e.outer);
      const b = P(e.inner);
      const w = Math.abs(a.x - b.x) || 1e-4;
      return (P(ir).x - (a.x + b.x) / 2) / w;
    };
    out.gazeX = (gz(I.irisR, I.eyeR) + gz(I.irisL, I.eyeL)) / 2;
    out.gazeY =
      ((P(I.irisR).y + P(I.irisL).y) / 2 -
        (P(I.eyeR.top).y + P(I.eyeR.bottom).y + P(I.eyeL.top).y + P(I.eyeL.bottom).y) / 4) /
      fw;
  }
  return out;
}

export type Neutral = Omit<FaceMeasure, 'hasIris'>;

/** 一般成人看著攝影機時的值（沒有校正時用） */
export const DEFAULT_NEUTRAL: Neutral = {
  yaw: 0,
  pitch: 0.1,
  roll: 0,
  eyeL: 0.3,
  eyeR: 0.3,
  browL: 0.085,
  browR: 0.085,
  mouthOpen: 0.02,
  smile: 0.0,
  gazeX: 0,
  gazeY: 0,
};

export interface TrackerOptions {
  headGain: number;
  eyeGain: number;
  mouthGain: number;
  browGain: number;
  gazeGain: number;
  smoothing: number;
  linkEyes: boolean;
  trackBrow: boolean;
  trackSmile: boolean;
}

export const DEFAULT_OPTIONS: TrackerOptions = {
  headGain: 1,
  eyeGain: 1,
  mouthGain: 1,
  browGain: 1,
  gazeGain: 1,
  smoothing: 0.5,
  linkEyes: true,
  trackBrow: true,
  trackSmile: true,
};

const NEUTRAL_KEYS = Object.keys(DEFAULT_NEUTRAL) as (keyof Neutral)[];

/** 多次量測的平均＝正面校正；眼睛的值至少 0.12（瞇著眼校正會變成永遠閉不起來） */
export function calibrate(samples: readonly (FaceMeasure | null | undefined)[]): Neutral | null {
  const valid = samples.filter((m): m is FaceMeasure => !!m);
  if (!valid.length) return null;
  const out = {} as Neutral;
  for (const k of NEUTRAL_KEYS) {
    let s = 0;
    for (const m of valid) s += m[k];
    out[k] = s / valid.length;
  }
  out.eyeL = Math.max(out.eyeL, 0.12);
  out.eyeR = Math.max(out.eyeR, 0.12);
  return out;
}

/** 張開度 0～1：閉＝基準 ×（0.30＋0.15 ×（靈敏度 − 1）），開＝基準 × 0.85 */
export function eyeOpen(r: number, neutral: number, gain: number): number {
  const closed = neutral * clamp01(0.3 + 0.15 * (gain - 1), 0.1, 0.7);
  const open = neutral * 0.85;
  return clamp01((r - closed) / Math.max(1e-4, open - closed), 0, 1);
}

/** 追蹤值（攝影機 → 參數）：ax／ay／az 頭部、eL／eR 眼睛、mo 嘴、ex／ey 視線、br 眉毛、mf 笑臉 */
export interface TrackingValues {
  ax: number;
  ay: number;
  az: number;
  eL: number;
  eR: number;
  mo: number;
  ex: number;
  ey: number;
  br: number;
  mf: number;
}

/** 量測 → 參數（不做時間上的濾波；規格 3.5） */
export function toParams(
  m: FaceMeasure,
  neutral: Neutral | null | undefined,
  options: Partial<TrackerOptions> | null | undefined,
): TrackingValues {
  const n = neutral ?? DEFAULT_NEUTRAL;
  const o = options ?? DEFAULT_OPTIONS;
  const g = (k: 'headGain' | 'eyeGain' | 'mouthGain' | 'browGain' | 'gazeGain') =>
    typeof o[k] === 'number' ? (o[k] as number) : DEFAULT_OPTIONS[k];
  let eL = eyeOpen(m.eyeL, n.eyeL, g('eyeGain'));
  let eR = eyeOpen(m.eyeR, n.eyeR, g('eyeGain'));
  if (o.linkEyes !== false) {
    const e = Math.min(eL, eR);
    eL = e;
    eR = e;
  }
  const brow = (m.browL - n.browL + (m.browR - n.browR)) / 2;
  return {
    ax: clamp01(-(m.yaw - n.yaw) * 3.2 * g('headGain'), -1, 1),
    ay: clamp01(-(m.pitch - n.pitch) * 3.0 * g('headGain'), -1, 1),
    az: clamp01(-(m.roll - n.roll) * 1.4 * g('headGain'), -1, 1),
    eL,
    eR,
    mo: clamp01((m.mouthOpen - n.mouthOpen - 0.02) / (0.3 / g('mouthGain')), 0, 1),
    ex: m.hasIris ? clamp01(-(m.gazeX - n.gazeX) * 5 * g('gazeGain'), -1, 1) : 0,
    ey: m.hasIris ? clamp01(-(m.gazeY - n.gazeY) * 10 * g('gazeGain'), -1, 1) : 0,
    br: o.trackBrow === false ? 0 : clamp01(brow / (0.022 / g('browGain')), -1, 1),
    mf: o.trackSmile === false ? 0 : clamp01((m.smile - n.smile) / 0.07, -1, 1),
  };
}

/** 每個值的濾波：[平滑度 0 時的最低截止頻率, 平滑度 1 時的, beta] */
export const CHANNELS: Record<keyof TrackingValues, readonly [number, number, number]> = {
  ax: [3.0, 0.4, 0.8],
  ay: [3.0, 0.4, 0.8],
  az: [3.0, 0.4, 0.8],
  eL: [12, 3, 2],
  eR: [12, 3, 2],
  mo: [8, 2, 1.5],
  ex: [5, 0.8, 1],
  ey: [5, 0.8, 1],
  br: [4, 0.8, 1],
  mf: [4, 0.8, 1],
};

/** 追蹤器：特徵點 → 濾波後的參數；校正 */
export class Tracker {
  options: TrackerOptions;
  neutral: Neutral | null = null;
  filters = {} as Record<keyof TrackingValues, OneEuro>;
  samples: FaceMeasure[] | null = null;
  last: TrackingValues | null = null;
  lastMeasure: FaceMeasure | null = null;

  constructor(options: Partial<TrackerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.rebuild();
  }

  private rebuild() {
    const s = clamp01(this.options.smoothing, 0, 1);
    for (const k of Object.keys(CHANNELS) as (keyof TrackingValues)[]) {
      const c = CHANNELS[k];
      this.filters[k] = new OneEuro(c[0] + (c[1] - c[0]) * s, c[2]);
    }
  }

  setOptions(options: Partial<TrackerOptions>): void {
    const changed = options.smoothing !== undefined && options.smoothing !== this.options.smoothing;
    Object.assign(this.options, options);
    if (changed) this.rebuild();
  }

  setCalibration(neutral: Neutral | null): void {
    this.neutral = neutral ?? null;
  }

  startCalibration(): void {
    this.samples = [];
  }

  finishCalibration(): Neutral | null {
    const c = calibrate(this.samples ?? []);
    this.samples = null;
    if (c) this.neutral = c;
    return c;
  }

  reset(): void {
    for (const f of Object.values(this.filters)) f.reset();
    this.last = null;
  }

  /** 特徵點 → 濾波後的參數；沒有可用的臉時 null。t 以秒計 */
  update(
    lm: readonly Landmark[] | null | undefined,
    t: number,
    aspect: number,
  ): TrackingValues | null {
    const m = measure(lm, aspect);
    if (!m) return null;
    this.lastMeasure = m;
    if (this.samples) this.samples.push(m);
    const raw = toParams(m, this.neutral ?? DEFAULT_NEUTRAL, this.options);
    const out = {} as TrackingValues;
    for (const k of Object.keys(raw) as (keyof TrackingValues)[]) {
      out[k] = this.filters[k] ? this.filters[k].filter(raw[k], t) : raw[k];
    }
    /* 眨眼即使經過濾波也要閉到底 */
    out.eL = raw.eL < 0.05 ? Math.min(out.eL, raw.eL + 0.1) : out.eL;
    out.eR = raw.eR < 0.05 ? Math.min(out.eR, raw.eR + 0.1) : out.eR;
    this.last = out;
    return out;
  }
}
