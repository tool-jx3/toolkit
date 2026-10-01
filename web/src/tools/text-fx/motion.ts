/**
 * 登場、退場、停留效果。
 *
 * 每個效果描述「時間進度 u（0→1）時，字或整塊應該是什麼狀態」。
 * 逐字效果改的是單一字的狀態 st；整塊效果改的是整段文字的狀態 b。
 * 所有帶隨機感的數值都由字序與時間桶雜湊而來，預覽與匯出逐格一致。
 */
import { clamp01, EASE, type EasingFn, hashSigned, hashUnit, timeSlot } from '@/core/timeline';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/* ---------- 狀態 ---------- */

export interface GlyphState {
  alpha: number;
  dx: number;
  dy: number;
  s: number;
  sx: number;
  sy: number;
  rot: number;
  blur: number;
}

export interface Wipe {
  dir: string;
  v: number;
  out: boolean;
  soft: number;
}

export interface BlockState {
  alpha: number;
  s: number;
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  blur: number;
  white: number;
  haloMul: number;
  wipe: Wipe | null;
  glitch: number;
  split: number;
  cx: number;
  cy: number;
  decoAlpha: number;
  wipeBox?: { x: number; y: number; w: number; h: number } | null;
}

export function freshGlyphState(st: Partial<GlyphState> = {}): GlyphState {
  st.alpha = 1;
  st.dx = 0;
  st.dy = 0;
  st.s = 1;
  st.sx = 1;
  st.sy = 1;
  st.rot = 0;
  st.blur = 0;
  return st as GlyphState;
}

export function freshBlockState(b: Partial<BlockState> = {}): BlockState {
  b.alpha = 1;
  b.s = 1;
  b.sx = 1;
  b.sy = 1;
  b.dx = 0;
  b.dy = 0;
  b.blur = 0;
  b.white = 0;
  b.haloMul = 1;
  b.wipe = null;
  b.glitch = 0;
  b.split = 0;
  b.cx = 0;
  b.cy = 0;
  b.decoAlpha = 1;
  b.wipeBox = null;
  return b as BlockState;
}

/** 效果用到的字資訊（scene 的字有這些欄位） */
export interface FxGlyph {
  seed: number;
  vis?: number;
  axisPos: number;
  lineCenter: number;
  lineVisN?: number;
}

export interface FxEnv {
  /** 字級（px） */
  S: number;
  /** 強度 */
  P: number;
  dir?: string;
  seed: number;
  vertical: boolean;
  /** 整塊效果：效果開始後經過的秒數、絕對秒數、效果時長 */
  tLocal?: number;
  tAbs?: number;
  dur?: number;
  /** 中央逐字的整段砸下 */
  amp?: number;
  impact?: number;
}

export type CurveId = keyof typeof EASE;
export type Dirs = readonly (readonly [string, string])[];

interface FxBase {
  name: string;
  dur: number;
  gap?: number;
  /** 自動曲線；null＝沒有曲線（打字、巨大撞擊） */
  curve: CurveId | null;
  /** false＝沒有強度設定 */
  power?: false;
  dirs?: Dirs;
  /** 沒有時長（到時間就整個出現或消失） */
  instant?: boolean;
  minGap?: number;
  /** 固定順序（退格刪除一律倒序） */
  forceOrder?: string;
  /** 只有標語、字幕可選（長文的每個字不能選） */
  shortOnly?: boolean;
}

export interface GlyphFx extends FxBase {
  unit: 'glyph';
  apply(st: GlyphState, u: number, ease: EasingFn, g: FxGlyph, env: FxEnv): void;
}

export interface BlockFx extends FxBase {
  unit: 'block';
  apply(b: BlockState, u: number, ease: EasingFn, env: FxEnv): void;
}

export type FxDef = GlyphFx | BlockFx;

/** 沿著行的方向位移（橫書 x，直書 y） */
const along = (st: GlyphState, env: FxEnv, d: number) => {
  if (env.vertical) st.dy += d;
  else st.dx += d;
};
const fromCenter = (g: FxGlyph) => g.axisPos - g.lineCenter;

/**
 * 先疊後散（逐字版與長文流程共用）。a、b：疊合出現結束、疊合停留結束在整段時長中的比例。
 */
export function stackPose(
  st: GlyphState,
  u: number,
  ease: EasingFn,
  g: FxGlyph,
  env: FxEnv,
  a = 0.18,
  b = 0.42,
): void {
  const n = Math.max(1, g.lineVisN || 1);
  /* 疊合時的寬度比例：5 字約 30%、10 字約 24%，行越長收得越緊 */
  const ratio = 0.3 * (5 / n) ** 0.32;
  const keep = n > 1 ? Math.min(1, Math.max(0.04, (ratio * n - 1) / (n - 1))) : 1;
  /* 字越多越透明，避免中央糊成一塊實心（5 字約八成、10 字約六成，最低三成） */
  const stackA = Math.max(0.3, Math.min(1, 1.0 - 0.04 * n));
  const pull = -fromCenter(g) * (1 - keep);
  if (u < a) {
    const p = EASE.out(u / a);
    st.alpha *= stackA * p;
    st.s *= 1 + 0.25 * env.P * (1 - p);
    along(st, env, pull);
  } else if (u < b) {
    st.alpha *= stackA;
    along(st, env, pull);
  } else {
    const e = ease(clamp01((u - b) / (1 - b)));
    st.alpha *= stackA + (1 - stackA) * Math.min(1, e);
    along(st, env, pull * (1 - e));
  }
}

/** 燈管閃爍：時長切成 14 段，每段隨機亮或暗，越後面越容易亮 */
function flickerOn(u: number, g: FxGlyph, env: FxEnv, salt: number): boolean {
  const n = 14;
  const seg = Math.min(n - 1, Math.floor(u * n));
  if (seg >= n - 2) return true;
  const p = 0.12 + 0.88 * (seg / (n - 1)) ** 0.9;
  return hashUnit(g.seed, seg + salt, env.seed) < p;
}

/** 四散：每個字固定的隨機方向、距離（1.4～3.2 S）與傾斜（±70°） */
function scatterVec(g: FxGlyph, env: FxEnv, salt: number): [number, number, number] {
  const th = hashUnit(g.seed, 11 + salt, env.seed) * TAU;
  const dist = (1.4 + 1.8 * hashUnit(g.seed, 12 + salt, env.seed)) * env.S * env.P;
  const rot = hashSigned(g.seed, 13 + salt, env.seed) * 70 * DEG * env.P;
  return [Math.cos(th) * dist, Math.sin(th) * dist, rot];
}

/** 雜訊用：以絕對時間的 1/20 秒為一格，回傳格號與「這一格開頭」的效果進度 */
function glitchSlot(env: FxEnv): { slot: number; uq: number } {
  const tAbs = env.tAbs ?? 0;
  const slot = timeSlot(tAbs, 20);
  const start = tAbs - (env.tLocal ?? 0);
  return { slot, uq: clamp01((slot / 20 - start) / (env.dur ?? 1)) };
}

/** 過衝曲線的「超過 1 的部分」跟著強度放大 */
const overshoot = (v: number, P: number) => (v < 1 ? v : 1 + (v - 1) * P);

/* ---------- 登場效果 ---------- */

export const INTRO: Record<string, FxDef> = {
  fade: {
    name: '淡入',
    unit: 'glyph',
    dur: 0.6,
    gap: 0,
    curve: 'out',
    power: false,
    apply(st, u, ease) {
      st.alpha *= ease(u);
    },
  },
  rise: {
    name: '上浮淡入',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.06,
    curve: 'out',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.dy += 0.55 * env.S * env.P * (1 - v);
      st.alpha *= clamp01(v);
    },
  },
  drop: {
    name: '落下淡入',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.06,
    curve: 'out',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.dy -= 0.55 * env.S * env.P * (1 - v);
      st.alpha *= clamp01(v);
    },
  },
  zip: {
    name: '上下交錯',
    unit: 'glyph',
    dur: 0.9,
    gap: 0.1,
    curve: 'out',
    apply(st, u, ease, g, env) {
      const v = ease(u);
      const sign = (g.vis ?? 0) % 2 === 0 ? -1 : 1; // 第 1、3、5…個字從上方（直書從右方）
      const d = 0.6 * env.S * env.P * (1 - v);
      if (env.vertical) st.dx -= sign * d;
      else st.dy += sign * d;
      st.alpha *= clamp01(v);
    },
  },
  slide: {
    name: '滑入',
    unit: 'glyph',
    dur: 0.7,
    gap: 0.04,
    curve: 'out',
    dirs: [
      ['left', '從左'],
      ['right', '從右'],
      ['up', '從上'],
      ['down', '從下'],
    ],
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      const d = 1.1 * env.S * env.P * (1 - v);
      if (env.dir === 'right') st.dx += d;
      else if (env.dir === 'up') st.dy -= d;
      else if (env.dir === 'down') st.dy += d;
      else st.dx -= d;
      st.alpha *= clamp01(v);
    },
  },
  converge: {
    name: '字距收攏',
    unit: 'glyph',
    dur: 1.4,
    gap: 0,
    curve: 'out',
    apply(st, u, ease, g, env) {
      const v = ease(u);
      along(st, env, fromCenter(g) * 1.6 * env.P * (1 - v)); // 起點離行中心約 2.6 倍
      st.alpha *= clamp01(v);
    },
  },
  stack: {
    name: '先疊後散',
    unit: 'glyph',
    dur: 1.3,
    gap: 0,
    curve: 'glide',
    shortOnly: true,
    apply(st, u, ease, g, env) {
      stackPose(st, u, ease, g, env);
    },
  },
  focus: {
    name: '模糊對焦',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.05,
    curve: 'out',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.blur += 0.22 * env.S * env.P * (1 - v);
      st.alpha *= clamp01(v);
    },
  },
  mist: {
    name: '霧中浮現',
    unit: 'glyph',
    dur: 1.0,
    gap: 0.05,
    curve: 'out',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.dy += 0.35 * env.S * env.P * (1 - v);
      st.blur += 0.14 * env.S * env.P * (1 - v);
      st.alpha *= clamp01(v);
    },
  },
  pop: {
    name: '彈跳放大',
    unit: 'glyph',
    dur: 0.5,
    gap: 0.07,
    curve: 'back',
    apply(st, u, ease, _g, env) {
      st.s *= Math.max(0, overshoot(ease(u), env.P));
      st.alpha *= clamp01(u * 3);
    },
  },
  shrink: {
    name: '巨字收縮',
    unit: 'glyph',
    dur: 0.55,
    gap: 0.06,
    curve: 'out',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.s *= 1 + 1.6 * env.P * (1 - v);
      st.alpha *= clamp01(v);
    },
  },
  spin: {
    name: '旋轉登場',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.06,
    curve: 'out',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.rot -= 144 * DEG * env.P * (1 - v);
      st.s *= Math.max(0.03, 1 - 0.7 * Math.min(env.P, 1.38) * (1 - v));
      st.alpha *= clamp01(v);
    },
  },
  flip: {
    name: '翻牌',
    unit: 'glyph',
    dur: 0.6,
    gap: 0.06,
    curve: 'back',
    apply(st, u, ease, _g, env) {
      const k = Math.max(0.001, overshoot(ease(u), env.P));
      if (env.vertical) st.sx *= k;
      else st.sy *= k;
      st.alpha *= clamp01(u / 0.4);
    },
  },
  bounce: {
    name: '彈落',
    unit: 'glyph',
    dur: 0.9,
    gap: 0.07,
    curve: 'bounce',
    apply(st, u, ease, _g, env) {
      st.dy -= 1.3 * env.S * env.P * (1 - ease(u));
      st.alpha *= clamp01(u * 6);
    },
  },
  gather: {
    name: '四散聚合',
    unit: 'glyph',
    dur: 1.1,
    gap: 0.02,
    curve: 'out',
    apply(st, u, ease, g, env) {
      const q = 1 - ease(u);
      const [x, y, r] = scatterVec(g, env, 0);
      st.dx += x * q;
      st.dy += y * q;
      st.rot += r * q;
      st.alpha *= clamp01(1 - q);
    },
  },
  type: {
    name: '打字',
    unit: 'glyph',
    dur: 0,
    gap: 0.08,
    curve: null,
    power: false,
    instant: true,
    minGap: 0.01,
    apply() {},
  },
  flicker: {
    name: '燈管閃爍',
    unit: 'glyph',
    dur: 0.9,
    gap: 0.05,
    curve: 'linear',
    apply(st, u, _ease, g, env) {
      st.alpha *= flickerOn(u, g, env, 0) ? 0.35 + 0.65 * u : 0.04;
    },
  },

  /* 整塊效果 */
  impact: {
    name: '巨大撞擊',
    unit: 'block',
    dur: 0.75,
    curve: null,
    apply(b, u, _ease, env) {
      const P = env.P;
      const S = env.S;
      if (u < 0.4) {
        const p = u / 0.4;
        b.s *= 1 + 2.4 * P * (1 - p * p); // 越接近撞擊縮得越急
        b.alpha *= clamp01(u / 0.18);
        b.blur += 0.1 * S * Math.min(P, 1.5) * (1 - p);
      } else {
        const q = clamp01((u - 0.4) / 0.6);
        b.white = Math.max(b.white, 0.85 * (1 - q) ** 3); // 撞上瞬間發白，三次方衰減
        /* 震動：每秒 45 次跳到新位置（同一格內不動），幅度二次方衰減 */
        const slot = timeSlot(env.tLocal ?? 0, 45);
        const qs = clamp01((slot / 45 / (env.dur ?? 1) - 0.4) / 0.6);
        const amp = 0.04 * S * P * (1 - qs) ** 2;
        b.dx += hashSigned(slot, 1, env.seed) * amp;
        b.dy += hashSigned(slot, 2, env.seed) * amp;
        b.s *= 1 - 0.05 * P * Math.sin(TAU * 1.5 * q) * (1 - q) ** 2; // 尺寸回彈
      }
    },
  },
  zoomBack: {
    name: '鏡頭拉回',
    unit: 'block',
    dur: 0.9,
    curve: 'out',
    apply(b, u, ease, env) {
      const v = ease(u);
      b.s *= 1 + 0.9 * env.P * (1 - v);
      b.blur += 0.15 * env.S * env.P * (1 - v);
      b.alpha *= clamp01(v);
    },
  },
  grow: {
    name: '遠處浮現',
    unit: 'block',
    dur: 0.9,
    curve: 'out',
    apply(b, u, ease, env) {
      const v = ease(u);
      b.s *= Math.max(0.02, 1 - 0.6 * env.P * (1 - v));
      b.alpha *= clamp01(v);
    },
  },
  wipe: {
    name: '遮罩擦出',
    unit: 'block',
    dur: 0.9,
    curve: 'smooth',
    dirs: [
      ['ltr', '左 → 右'],
      ['rtl', '右 → 左'],
      ['ttb', '上 → 下'],
      ['btt', '下 → 上'],
      ['center', '從中央往兩側'],
    ],
    apply(b, u, ease, env) {
      b.wipe = { dir: env.dir || 'ltr', v: ease(u), out: false, soft: env.P };
    },
  },
  slit: {
    name: '一線撐開',
    unit: 'block',
    dur: 0.6,
    curve: 'snap',
    dirs: [
      ['v', '上下撐開'],
      ['h', '左右撐開'],
    ],
    apply(b, u, ease, env) {
      const v = ease(u);
      if (env.dir === 'h') b.sx *= Math.max(0.001, v);
      else b.sy *= Math.max(0.001, v);
      b.alpha *= clamp01(v / 0.6);
    },
  },
  split: {
    name: '裂開拼合',
    unit: 'block',
    dur: 0.8,
    curve: 'out',
    apply(b, u, ease, env) {
      const v = ease(u);
      b.split = 0.9 * env.S * env.P * (1 - v);
      b.alpha *= clamp01(v * 1.4);
    },
  },
  glitch: {
    name: '雜訊干擾',
    unit: 'block',
    dur: 0.9,
    curve: 'linear',
    apply(b, _u, _ease, env) {
      /* 所有雜訊參數都以 1/20 秒為單位取樣：60 fps 匯出時同一個畫面連續 3 格，不會每格亂跳 */
      const { slot, uq } = glitchSlot(env);
      const visible = uq >= 0.8 || hashUnit(slot, 3, env.seed) < 0.25 + 0.75 * (uq / 0.8);
      b.alpha *= visible ? 1 : 0.15;
      b.dx += hashSigned(slot, 4, env.seed) * 0.09 * env.S * env.P * (1 - uq);
      b.glitch = Math.max(b.glitch, (1 - uq) * env.P);
    },
  },
  whiteHot: {
    name: '白熱褪色',
    unit: 'block',
    dur: 0.8,
    curve: 'out',
    apply(b, u, ease, env) {
      const v = ease(u);
      b.alpha *= clamp01(u / 0.2);
      b.white = Math.max(b.white, 1 - v);
      b.haloMul *= 1 + 1.5 * env.P * (1 - v);
    },
  },
};

/* ---------- 退場效果（預設用「緩起」：一開始幾乎不動，最後才快速離開） ---------- */

export const OUTRO: Record<string, FxDef> = {
  fadeOut: {
    name: '淡出',
    unit: 'glyph',
    dur: 0.6,
    gap: 0,
    curve: 'in',
    power: false,
    apply(st, u, ease) {
      st.alpha *= 1 - ease(u);
    },
  },
  floatUp: {
    name: '上飄消失',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.04,
    curve: 'in',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.dy -= 0.55 * env.S * env.P * v;
      st.alpha *= 1 - clamp01(v);
    },
  },
  sinkDown: {
    name: '下沉消失',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.04,
    curve: 'in',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.dy += 0.55 * env.S * env.P * v;
      st.alpha *= 1 - clamp01(v);
    },
  },
  part: {
    name: '上下錯開',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.06,
    curve: 'in',
    apply(st, u, ease, g, env) {
      const v = ease(u);
      const sign = (g.vis ?? 0) % 2 === 0 ? -1 : 1;
      const d = 0.6 * env.S * env.P * v;
      if (env.vertical) st.dx -= sign * d;
      else st.dy += sign * d;
      st.alpha *= 1 - clamp01(v);
    },
  },
  slideOut: {
    name: '滑出',
    unit: 'glyph',
    dur: 0.7,
    gap: 0.03,
    curve: 'in',
    dirs: [
      ['left', '往左'],
      ['right', '往右'],
      ['up', '往上'],
      ['down', '往下'],
    ],
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      const d = 1.1 * env.S * env.P * v;
      if (env.dir === 'right') st.dx += d;
      else if (env.dir === 'up') st.dy -= d;
      else if (env.dir === 'down') st.dy += d;
      else st.dx -= d;
      st.alpha *= 1 - clamp01(v);
    },
  },
  spread: {
    name: '字距散開',
    unit: 'glyph',
    dur: 1.2,
    gap: 0,
    curve: 'in',
    apply(st, u, ease, g, env) {
      const v = ease(u);
      along(st, env, fromCenter(g) * 1.6 * env.P * v);
      st.alpha *= 1 - clamp01(v);
    },
  },
  blurOut: {
    name: '模糊消散',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.03,
    curve: 'in',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.blur += 0.25 * env.S * env.P * v;
      st.alpha *= 1 - clamp01(v);
    },
  },
  zoomFade: {
    name: '放大淡去',
    unit: 'glyph',
    dur: 0.6,
    gap: 0.04,
    curve: 'in',
    apply(st, u, ease, _g, env) {
      const v = ease(u);
      st.s *= 1 + 1.3 * env.P * v;
      st.alpha *= 1 - clamp01(v);
    },
  },
  shrinkDot: {
    name: '縮成一點',
    unit: 'glyph',
    dur: 0.6,
    gap: 0.04,
    curve: 'in',
    apply(st, u, ease, _g, env) {
      const v = clamp01(ease(u));
      st.s *= Math.max(0.03, 1 - 0.95 * Math.min(env.P, 1.02) * v);
      st.alpha *= 1 - v * v; // 不透明度比縮小慢，「縮著縮著才消失」
    },
  },
  scatter: {
    name: '四散飛出',
    unit: 'glyph',
    dur: 1.0,
    gap: 0.02,
    curve: 'in',
    apply(st, u, ease, g, env) {
      const v = ease(u);
      const [x, y, r] = scatterVec(g, env, 40);
      st.dx += x * v;
      st.dy += y * v;
      st.rot += r * v;
      st.alpha *= 1 - clamp01(v);
    },
  },
  backspace: {
    name: '退格刪除',
    unit: 'glyph',
    dur: 0,
    gap: 0.06,
    curve: null,
    power: false,
    instant: true,
    minGap: 0.01,
    forceOrder: 'reverse',
    apply() {},
  },
  flickerOut: {
    name: '燈管熄滅',
    unit: 'glyph',
    dur: 0.8,
    gap: 0.04,
    curve: 'linear',
    apply(st, u, _ease, g, env) {
      const w = 1 - u;
      st.alpha *= flickerOn(w, g, env, 50) ? 0.35 + 0.65 * w : 0.04;
    },
  },

  toCamera: {
    name: '衝向鏡頭',
    unit: 'block',
    dur: 0.6,
    curve: 'in',
    apply(b, u, ease, env) {
      const v = ease(u);
      b.s *= 1 + 0.9 * env.P * v;
      b.blur += 0.15 * env.S * env.P * v;
      b.alpha *= 1 - clamp01(v);
    },
  },
  recede: {
    name: '縮遠淡去',
    unit: 'block',
    dur: 0.7,
    curve: 'in',
    apply(b, u, ease, env) {
      const v = ease(u);
      b.s *= Math.max(0.02, 1 - 0.6 * env.P * v);
      b.alpha *= 1 - clamp01(v);
    },
  },
  wipeOut: {
    name: '遮罩擦除',
    unit: 'block',
    dur: 0.8,
    curve: 'smooth',
    dirs: [
      ['ltr', '左 → 右'],
      ['rtl', '右 → 左'],
      ['ttb', '上 → 下'],
      ['btt', '下 → 上'],
      ['center', '從中央往兩側'],
    ],
    apply(b, u, ease, env) {
      b.wipe = { dir: env.dir || 'ltr', v: ease(u), out: true, soft: env.P };
    },
  },
  slitClose: {
    name: '壓回一線',
    unit: 'block',
    dur: 0.5,
    curve: 'slam',
    dirs: [
      ['v', '上下壓扁'],
      ['h', '左右壓扁'],
    ],
    apply(b, u, ease, env) {
      const k = Math.max(0.001, 1 - ease(u));
      if (env.dir === 'h') b.sx *= k;
      else b.sy *= k;
      b.alpha *= clamp01(k / 0.12);
    },
  },
  splitOut: {
    name: '裂開散去',
    unit: 'block',
    dur: 0.7,
    curve: 'in',
    apply(b, u, ease, env) {
      const v = ease(u);
      b.split = -0.9 * env.S * env.P * v;
      b.alpha *= 1 - clamp01(v);
    },
  },
  glitchOut: {
    name: '雜訊斷訊',
    unit: 'block',
    dur: 0.8,
    curve: 'linear',
    apply(b, _u, _ease, env) {
      const { slot, uq } = glitchSlot(env);
      if (uq < 0.15) return;
      const w = (uq - 0.15) / 0.85;
      b.alpha *= Math.max(0, 1 - uq ** 3);
      if (hashUnit(slot, 5, env.seed) < 0.15 + 0.6 * w) b.alpha *= 0.1;
      b.dx += hashSigned(slot, 6, env.seed) * 0.09 * env.S * env.P * w;
      b.glitch = Math.max(b.glitch, w * env.P);
    },
  },
};

/* ---------- 停留效果 ----------
 * 依整段動畫的絕對時間計算（定速閃爍例外：登場完成後才開始計時）。幅度與強度成線性。 */

export interface HoldEnv {
  S: number;
  P: number;
  seed?: number;
  vertical: boolean;
  introEnd?: number;
  holdEnd?: number;
}

export interface HoldFx {
  name: string;
  note?: string;
  needsGlow?: boolean;
  afterIntro?: boolean;
  block?(b: BlockState, t: number, env: HoldEnv): void;
  glyph?(st: GlyphState, t: number, g: FxGlyph, env: HoldEnv): void;
}

export const HOLD: Record<string, HoldFx> = {
  none: { name: '無' },
  float: {
    name: '漂浮',
    note: '整塊上下緩慢浮動，裝飾一起動',
    block(b, t, env) {
      b.dy += 0.05 * env.S * env.P * Math.sin((TAU * t) / 2.6);
    },
  },
  wave: {
    name: '波浪',
    note: '每個字依序上下起伏',
    glyph(st, t, g, env) {
      const d = 0.07 * env.S * env.P * Math.sin(TAU * (t / 1.6 - Math.max(0, g.vis ?? 0) * 0.1));
      if (env.vertical) st.dx += d;
      else st.dy += d;
    },
  },
  heartbeat: {
    name: '心跳',
    note: '每 1.1 秒「咚、咚」放大兩下',
    block(b, t, env) {
      const tau = ((t % 1.1) + 1.1) % 1.1;
      const bump = (x: number) => (Math.abs(x) < 0.05 ? Math.cos((Math.PI * x) / 0.1) ** 2 : 0);
      b.s *= 1 + env.P * (0.035 * bump(tau - 0.11) + 0.02 * bump(tau - 0.33));
    },
  },
  jitter: {
    name: '顫抖',
    note: '每 0.05 秒換一個位置的細碎抖動',
    block(b, t, env) {
      const slot = timeSlot(t, 20);
      b.dx += hashSigned(slot, 7, env.seed) * 0.025 * env.S * env.P;
      b.dy += hashSigned(slot, 8, env.seed) * 0.025 * env.S * env.P;
    },
  },
  breathe: {
    name: '呼吸發光',
    note: '光暈強弱緩慢起伏（需要先開光暈）',
    needsGlow: true,
    block(b, t, env) {
      b.haloMul *= Math.max(0, 1 - (0.45 * env.P * (1 - Math.cos((TAU * t) / 1.8))) / 2);
    },
  },
  flickerHold: {
    name: '接觸不良',
    note: '偶爾突然暗一下，像不穩的日光燈',
    block(b, t, env) {
      const unit = timeSlot(t, 12);
      let level = 1;
      for (let back = 0; back < 2; back++) {
        const n = unit - back;
        if (hashUnit(n, 31, env.seed) < 1 / 12) {
          const len = hashUnit(n, 32, env.seed) < 0.5 ? 1 : 2;
          if (back < len) {
            level = 0.2 + 0.35 * hashUnit(n, 33, env.seed);
            break;
          }
        }
      }
      const a = clamp01(1 - env.P * (1 - level));
      b.alpha *= a;
      b.decoAlpha *= a;
    },
  },
  blink: {
    name: '定速閃爍',
    note: '亮 0.3 秒、暗 0.2 秒；登場完成後才開始，裝飾不閃',
    afterIntro: true,
    block(b, t, env) {
      const introEnd = env.introEnd ?? 0;
      const holdEnd = env.holdEnd ?? Number.POSITIVE_INFINITY;
      if (t < introEnd || t >= holdEnd) return;
      const tau = (t - introEnd) % 0.5;
      if (tau >= 0.3) b.alpha *= Math.max(0, 1 - 0.85 * env.P);
    },
  },
  glitchPulse: {
    name: '偶爾雜訊',
    note: '每 1.7 秒爆一下 RGB 錯位雜訊',
    block(b, t, env) {
      const slot = timeSlot(t, 20);
      const tau = (slot / 20 + 0.85) % 1.7;
      if (tau < 0.14) {
        const k = 0.58 * env.P * (0.75 + 0.25 * hashUnit(slot, 10, env.seed));
        b.glitch = Math.max(b.glitch, k);
        b.dx += hashSigned(slot, 9, env.seed) * 0.04 * env.S * env.P;
      }
    },
  },
};

export const ORDER_CHOICES: readonly (readonly [string, string])[] = [
  ['normal', '正序'],
  ['reverse', '倒序'],
  ['center', '由中央向外'],
  ['edges', '由兩端向內'],
  ['random', '隨機'],
];

/** 逐字順序用到的欄位 */
export interface RankGlyph {
  space: boolean;
  rank: number;
}

/** 每個可見字的開始名次（空白不佔名次，名次為 −1）。回傳最大名次。 */
export function rankGlyphs(glyphs: RankGlyph[], order: string, seed: number): number {
  const vis = glyphs.filter((g) => !g.space);
  const n = vis.length;
  let perm: number[] | null = null;
  if (order === 'random') {
    perm = vis.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(hashUnit(seed, i, 97) * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
  }
  let max = 0;
  vis.forEach((g, i) => {
    let r: number;
    if (order === 'reverse') r = n - 1 - i;
    else if (order === 'center') r = Math.floor(Math.abs(i - (n - 1) / 2) + 1e-9);
    else if (order === 'edges') r = Math.min(i, n - 1 - i);
    else if (order === 'random' && perm) r = perm[i];
    else r = i;
    g.rank = r;
    if (r > max) max = r;
  });
  for (const g of glyphs) if (g.space) g.rank = -1;
  return max;
}

/** 使用者選的曲線（auto＝依效果） */
export function easeFor(fx: FxBase, curve: string | undefined): EasingFn {
  if (curve && curve !== 'auto' && curve in EASE) return EASE[curve as CurveId];
  return (fx.curve && EASE[fx.curve]) || EASE.linear;
}

/** 依單位分組的選單資料 */
export function fxGroups(
  defs: Record<string, FxDef>,
  filter: (id: string, d: FxDef) => boolean = () => true,
): { label: string; items: [string, string][] }[] {
  const glyph: [string, string][] = [];
  const block: [string, string][] = [];
  for (const [id, d] of Object.entries(defs)) {
    if (!filter(id, d)) continue;
    (d.unit === 'block' ? block : glyph).push([id, d.name]);
  }
  const out: { label: string; items: [string, string][] }[] = [];
  if (glyph.length) out.push({ label: '逐字效果', items: glyph });
  if (block.length) out.push({ label: '整塊效果', items: block });
  return out;
}
