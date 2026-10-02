/**
 * core/fxlayers：無縫循環的特效層——放射速度線、閃亮星星、彩色碎紙、擴散圓環。
 *
 * - 時間 t 是循環的進度（0～1），t＝1 時一定回到 t＝0 的樣子（速度、閃爍、圈數都是整數）。
 * - 隨機量（角度、長度、位置、顏色）由種子決定、每格相同；只有明滅、伸縮、落下、擴張隨時間變。
 * - 長度單位：「短邊」＝畫面寬高中較小者；「文字半徑」＝文字外接框對角線的一半（放射線、圓環從它往外）。
 * - 每個特效都有純資料的 xxxState（測試、統計用）與 drawXxx（畫在 canvas 上）。
 * - 放射速度線、擴散圓環通常畫在文字後面；星星、碎紙畫在文字前面（LOOP_FX_ORDER）。
 */
import { createRandom } from '../timeline/random';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface LoopFxEnv {
  width: number;
  height: number;
  /** 中心（預設畫面中心） */
  cx?: number;
  cy?: number;
  /** 文字半徑（px） */
  textRadius: number;
  /** 種子（同一個種子得到同樣的排列） */
  seed: number;
}

export type LoopFxKind = 'speedLines' | 'stars' | 'confetti' | 'rings';

export const LOOP_FX_KINDS: readonly LoopFxKind[] = ['speedLines', 'stars', 'confetti', 'rings'];

export const LOOP_FX_LABELS: Record<LoopFxKind, string> = {
  speedLines: '放射速度線',
  stars: '閃亮星星',
  confetti: '彩色碎紙',
  rings: '擴散圓環',
};

/** 畫在文字後面（behind）或前面（front） */
export const LOOP_FX_ORDER: Record<LoopFxKind, 'behind' | 'front'> = {
  speedLines: 'behind',
  rings: 'behind',
  stars: 'front',
  confetti: 'front',
};

const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);
const shortSide = (env: LoopFxEnv) => Math.min(env.width, env.height);
const center = (env: LoopFxEnv) => ({ x: env.cx ?? env.width / 2, y: env.cy ?? env.height / 2 });
/** 每個特效用不同的亂數序列 */
const rng = (env: LoopFxEnv, salt: number) => createRandom((env.seed * 7919 + salt) | 0);

/* ---------- 放射速度線 ---------- */

export interface SpeedLinesOptions {
  /** 條數 */
  count: number;
  /** 最短、最長（短邊的倍數） */
  minLength: number;
  maxLength: number;
  /** 根部寬（短邊的倍數）；尖端是根部的 15% */
  width: number;
  /** 內端離文字的距離（文字半徑的倍數） */
  gap: number;
  /** 群組數：相鄰的線分組輪流明滅、伸縮（1＝全部不透明、只伸縮） */
  groups: number;
  /** 伸縮 */
  stretch: boolean;
  /** 'rainbow'：依方向分配色相（右紅、下黃綠、左青、上藍紫），整圈每循環逆時針轉一圈；否則為單色 */
  color: 'rainbow' | string;
  /** 角度偏轉：每條隨機偏轉最多「相鄰間隔 × jitter ÷ 2」 */
  jitter: number;
}

export const SPEED_LINES_DEFAULTS: SpeedLinesOptions = {
  count: 48,
  minLength: 0.1,
  maxLength: 0.3,
  width: 0.012,
  gap: 0.02,
  groups: 2,
  stretch: true,
  color: 'rainbow',
  jitter: 0.3,
};

export interface SpeedLine {
  /** 方向（弧度，atan2；0＝往右、π/2＝往下） */
  angle: number;
  /** 內端離中心的距離、長度（px） */
  inner: number;
  length: number;
  rootWidth: number;
  tipWidth: number;
  /** 不透明度 0～1 */
  alpha: number;
  color: string;
  group: number;
}

/** 群組 g（共 n 組）在 t 的不透明度與長度倍率 */
export function speedLinePulse(
  g: number,
  n: number,
  t: number,
  stretch = true,
): { alpha: number; scale: number } {
  const phase = TAU * (t - g / Math.max(1, n));
  return {
    alpha: n <= 1 ? 1 : 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(phase)),
    scale: stretch ? 1 + 0.25 * Math.sin(phase) : 1,
  };
}

export function speedLinesState(
  env: LoopFxEnv,
  options: Partial<SpeedLinesOptions>,
  t: number,
): SpeedLine[] {
  const o = { ...SPEED_LINES_DEFAULTS, ...options };
  const S = shortSide(env);
  const r = rng(env, 101);
  const n = Math.max(0, Math.round(o.count));
  const step = TAU / Math.max(1, n);
  const groups = Math.max(1, Math.round(o.groups));
  const out: SpeedLine[] = [];
  for (let i = 0; i < n; i++) {
    const angle = i * step + (r.next() - 0.5) * o.jitter * step;
    const base = S * (o.minLength + (o.maxLength - o.minLength) * r.next());
    const g = i % groups;
    const { alpha, scale } = speedLinePulse(g, groups, t, o.stretch);
    const deg = ((angle * 180) / Math.PI + 360 * t) % 360;
    out.push({
      angle,
      inner: env.textRadius * (1 + o.gap),
      length: base * scale,
      rootWidth: S * o.width,
      tipWidth: S * o.width * 0.15,
      alpha,
      color: o.color === 'rainbow' ? `hsl(${(deg + 360) % 360} 100% 60%)` : o.color,
      group: g,
    });
  }
  return out;
}

export function drawSpeedLines(
  ctx: Ctx2D,
  env: LoopFxEnv,
  options: Partial<SpeedLinesOptions>,
  t: number,
): void {
  const c = center(env);
  ctx.save();
  for (const l of speedLinesState(env, options, t)) {
    if (l.alpha <= 0 || l.length <= 0) continue;
    const cos = Math.cos(l.angle);
    const sin = Math.sin(l.angle);
    const nx = -sin;
    const ny = cos;
    const ax = c.x + cos * l.inner;
    const ay = c.y + sin * l.inner;
    const bx = c.x + cos * (l.inner + l.length);
    const by = c.y + sin * (l.inner + l.length);
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.moveTo(ax + (nx * l.rootWidth) / 2, ay + (ny * l.rootWidth) / 2);
    ctx.lineTo(bx + (nx * l.tipWidth) / 2, by + (ny * l.tipWidth) / 2);
    ctx.lineTo(bx - (nx * l.tipWidth) / 2, by - (ny * l.tipWidth) / 2);
    ctx.lineTo(ax - (nx * l.rootWidth) / 2, ay - (ny * l.rootWidth) / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- 閃亮星星 ---------- */

export interface StarsOptions {
  count: number;
  /** 大小（短邊的倍數；每顆再乘 0.5～1.5） */
  size: number;
  /** 每循環閃幾次（整數） */
  twinkle: number;
  color: string;
}

export const STARS_DEFAULTS: StarsOptions = {
  count: 16,
  size: 0.07,
  twinkle: 2,
  color: '#fff4d6',
};

export interface Star {
  x: number;
  y: number;
  /** 半徑（星芒尖端到中心，px） */
  radius: number;
  alpha: number;
  color: string;
}

export function starsState(env: LoopFxEnv, options: Partial<StarsOptions>, t: number): Star[] {
  const o = { ...STARS_DEFAULTS, ...options };
  const S = shortSide(env);
  const r = rng(env, 202);
  const n = Math.max(0, Math.round(o.count));
  const speed = Math.max(1, Math.round(o.twinkle));
  const out: Star[] = [];
  for (let i = 0; i < n; i++) {
    const x = r.next() * env.width;
    const y = r.next() * env.height;
    const k = 0.5 + r.next();
    const phase = r.next();
    const f = 0.5 - 0.5 * Math.cos(TAU * (speed * t + phase));
    const size = S * o.size * k * f;
    out.push({ x, y, radius: size / 2, alpha: 0.25 + 0.75 * f, color: o.color });
  }
  return out;
}

/** 中間收得很細的四角星 */
export function traceStar(ctx: Ctx2D, x: number, y: number, radius: number): void {
  const waist = radius * 0.14;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 2;
    const tipX = x + Math.cos(a) * radius;
    const tipY = y + Math.sin(a) * radius;
    const ca = a + Math.PI / 4;
    const cX = x + Math.cos(ca) * waist;
    const cY = y + Math.sin(ca) * waist;
    if (k === 0) ctx.moveTo(tipX, tipY);
    const na = a + Math.PI / 2;
    ctx.quadraticCurveTo(cX, cY, x + Math.cos(na) * radius, y + Math.sin(na) * radius);
  }
  ctx.closePath();
}

export function drawStars(
  ctx: Ctx2D,
  env: LoopFxEnv,
  options: Partial<StarsOptions>,
  t: number,
): void {
  ctx.save();
  for (const s of starsState(env, options, t)) {
    if (s.radius * 2 < 0.5) continue;
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = s.color;
    traceStar(ctx, s.x, s.y, s.radius);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- 彩色碎紙 ---------- */

export interface ConfettiOptions {
  count: number;
  /** 每循環落幾趟（整數） */
  speed: number;
  /** 長邊（短邊的倍數）；碎紙是 2:1 的長方形 */
  size: number;
}

export const CONFETTI_DEFAULTS: ConfettiOptions = { count: 28, speed: 1, size: 0.035 };

export interface ConfettiPiece {
  x: number;
  y: number;
  /** 長邊、短邊（px） */
  w: number;
  h: number;
  /** 旋轉（弧度） */
  rotation: number;
  color: string;
}

export function confettiState(
  env: LoopFxEnv,
  options: Partial<ConfettiOptions>,
  t: number,
): ConfettiPiece[] {
  const o = { ...CONFETTI_DEFAULTS, ...options };
  const S = shortSide(env);
  const r = rng(env, 303);
  const n = Math.max(0, Math.round(o.count));
  const speed = Math.max(1, Math.round(o.speed));
  const w = S * o.size;
  const margin = w;
  const out: ConfettiPiece[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = r.next() * env.width;
    const phase = r.next();
    const hue = Math.floor(r.next() * 360);
    const spins = 1 + Math.floor(r.next() * 3);
    const rot0 = r.next() * TAU;
    const sway = r.next();
    out.push({
      x: x0 + S * 0.03 * Math.sin(TAU * (t + sway)),
      y: -margin + (env.height + 2 * margin) * frac(speed * t + phase),
      w,
      h: w / 2,
      rotation: (rot0 + spins * TAU * frac(t)) % TAU,
      color: `hsl(${hue} 80% 60%)`,
    });
  }
  return out;
}

export function drawConfetti(
  ctx: Ctx2D,
  env: LoopFxEnv,
  options: Partial<ConfettiOptions>,
  t: number,
): void {
  ctx.save();
  for (const p of confettiState(env, options, t)) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  ctx.restore();
}

/* ---------- 擴散圓環 ---------- */

export interface RingsOptions {
  count: number;
  /** 每循環擴張幾趟（整數） */
  speed: number;
  /** 線寬（短邊的倍數） */
  width: number;
  color: string;
}

export const RINGS_DEFAULTS: RingsOptions = { count: 3, speed: 1, width: 0.012, color: '#ffffff' };

export interface Ring {
  radius: number;
  alpha: number;
  lineWidth: number;
  color: string;
}

/** 圓環從文字半徑 × 1.05 擴張到畫面對角線的一半，不透明度由 1 等速降到 0；各環相位平均錯開 */
export function ringsState(env: LoopFxEnv, options: Partial<RingsOptions>, t: number): Ring[] {
  const o = { ...RINGS_DEFAULTS, ...options };
  const S = shortSide(env);
  const n = Math.max(0, Math.round(o.count));
  const speed = Math.max(1, Math.round(o.speed));
  const r0 = env.textRadius * 1.05;
  const r1 = Math.hypot(env.width, env.height) / 2;
  const out: Ring[] = [];
  for (let k = 0; k < n; k++) {
    const p = frac(speed * t + k / n);
    out.push({ radius: r0 + (r1 - r0) * p, alpha: 1 - p, lineWidth: S * o.width, color: o.color });
  }
  return out;
}

export function drawRings(
  ctx: Ctx2D,
  env: LoopFxEnv,
  options: Partial<RingsOptions>,
  t: number,
): void {
  const c = center(env);
  ctx.save();
  for (const ring of ringsState(env, options, t)) {
    if (ring.alpha <= 0 || ring.radius <= 0) continue;
    ctx.globalAlpha = ring.alpha;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.lineWidth;
    ctx.beginPath();
    ctx.arc(c.x, c.y, ring.radius, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- 共用 ---------- */

export type LoopFxOptions = {
  speedLines: SpeedLinesOptions;
  stars: StarsOptions;
  confetti: ConfettiOptions;
  rings: RingsOptions;
};

export const LOOP_FX_DEFAULTS: { [K in LoopFxKind]: LoopFxOptions[K] } = {
  speedLines: SPEED_LINES_DEFAULTS,
  stars: STARS_DEFAULTS,
  confetti: CONFETTI_DEFAULTS,
  rings: RINGS_DEFAULTS,
};

/** 畫一個特效 */
export function drawLoopFx<K extends LoopFxKind>(
  ctx: Ctx2D,
  kind: K,
  env: LoopFxEnv,
  options: Partial<LoopFxOptions[K]>,
  t: number,
): void {
  switch (kind) {
    case 'speedLines':
      drawSpeedLines(ctx, env, options as Partial<SpeedLinesOptions>, t);
      break;
    case 'stars':
      drawStars(ctx, env, options as Partial<StarsOptions>, t);
      break;
    case 'confetti':
      drawConfetti(ctx, env, options as Partial<ConfettiOptions>, t);
      break;
    case 'rings':
      drawRings(ctx, env, options as Partial<RingsOptions>, t);
      break;
  }
}

export interface LoopFxParam {
  key: string;
  label: string;
  kind: 'number' | 'int' | 'boolean' | 'color';
  min?: number;
  max?: number;
  step?: number;
}

/** 細調參數的範圍（給設定面板：數值類用滑桿、開關類用勾選） */
export const LOOP_FX_PARAMS: Record<LoopFxKind, readonly LoopFxParam[]> = {
  speedLines: [
    { key: 'count', label: '數量', kind: 'int', min: 4, max: 96, step: 1 },
    { key: 'minLength', label: '最短', kind: 'number', min: 0.02, max: 0.4, step: 0.01 },
    { key: 'maxLength', label: '最長', kind: 'number', min: 0.05, max: 0.6, step: 0.01 },
    { key: 'width', label: '粗細', kind: 'number', min: 0.002, max: 0.05, step: 0.001 },
    { key: 'gap', label: '離文字的距離', kind: 'number', min: 0, max: 0.3, step: 0.01 },
    { key: 'groups', label: '群組數', kind: 'int', min: 1, max: 4, step: 1 },
    { key: 'stretch', label: '伸縮', kind: 'boolean' },
    { key: 'color', label: '顏色', kind: 'color' },
    { key: 'jitter', label: '角度偏轉', kind: 'number', min: 0, max: 1, step: 0.05 },
  ],
  stars: [
    { key: 'count', label: '數量', kind: 'int', min: 4, max: 96, step: 1 },
    { key: 'size', label: '大小', kind: 'number', min: 0.01, max: 0.2, step: 0.005 },
    { key: 'twinkle', label: '閃爍速度', kind: 'int', min: 1, max: 6, step: 1 },
    { key: 'color', label: '顏色', kind: 'color' },
  ],
  confetti: [
    { key: 'count', label: '數量', kind: 'int', min: 4, max: 96, step: 1 },
    { key: 'speed', label: '速度', kind: 'int', min: 1, max: 5, step: 1 },
    { key: 'size', label: '大小', kind: 'number', min: 0.01, max: 0.2, step: 0.005 },
  ],
  rings: [
    { key: 'count', label: '數量', kind: 'int', min: 1, max: 96, step: 1 },
    { key: 'speed', label: '速度', kind: 'int', min: 1, max: 5, step: 1 },
    { key: 'width', label: '粗細', kind: 'number', min: 0.002, max: 0.05, step: 0.001 },
    { key: 'color', label: '顏色', kind: 'color' },
  ],
};
