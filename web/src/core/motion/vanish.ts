/**
 * 結尾消失演出（讀取動畫的「結尾動作」）：把整個畫面（含不透明的背景）在 p＝0→1 之間消失，p＝1 時全空。
 *
 * 10 種：平順淡出、星光閃爍、雜訊條紋、碎片飛散、方塊消融、彈一下後縮小、往上飄走、往中央收起、旋轉縮小、閃光爆開。
 * 強度（intensity，0.25～2.5）放大各動作的幅度（粒子數量與大小、位移距離、旋轉圈數、錯開量）；平順淡出不受影響，
 * 往中央收起只影響光線粗細。粒子、碎片、條紋的位置由種子決定（同一個種子每次相同）。
 *
 * 純函式 `vanishState` 回傳整體的變換（透明度、縮放、旋轉、位移、模糊、閃光、可見寬度），`vanishParticles` 回傳要畫的粒子；
 * `drawVanish` 用它們把來源畫面畫到 ctx。尺寸以畫布高 360 為基準等比縮放。
 */

import { traceShape } from '../shapes';
import { smoothstep } from '../timeline/curves';
import { createRandom } from '../timeline/random';
import type { Ctx2D } from './image';

export type VanishKind =
  | 'fade'
  | 'sparkle'
  | 'noise'
  | 'shatter'
  | 'dissolve'
  | 'pop'
  | 'float'
  | 'close'
  | 'spin'
  | 'burst';

export const VANISH_KINDS: readonly VanishKind[] = [
  'fade',
  'sparkle',
  'noise',
  'shatter',
  'dissolve',
  'pop',
  'float',
  'close',
  'spin',
  'burst',
];

export interface VanishOptions {
  /** 演出強度（預設 1） */
  intensity?: number;
  /** 亂數種子（預設 1） */
  seed?: number;
  /** 粒子、光線的顏色（填滿色或漸層各色；預設粉紅） */
  colors?: readonly string[];
}

export interface VanishState {
  /** 整個畫面的不透明度 */
  alpha: number;
  /** 以畫布中心縮放 */
  scale: number;
  /** 以畫布中心旋轉（弧度，順時針） */
  rotate: number;
  /** 位移（px） */
  dx: number;
  dy: number;
  /** 模糊（px） */
  blur: number;
  /** 白色閃光（整個畫布）的不透明度 */
  flash: number;
  /** 只留中間這麼寬的直條（0～1 的畫布寬；1＝不裁） */
  strip: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 整體的變換。H＝畫布高（位移、模糊依 H ÷ 360 縮放）。
 * 例：平順淡出 alpha＝1 − smoothstep(p)；旋轉縮小 scale＝alpha＝1 − smoothstep(p)，轉 1.3 圈 × 強度。
 */
export function vanishState(
  kind: VanishKind,
  p: number,
  H: number,
  o: VanishOptions = {},
): VanishState {
  const I = o.intensity ?? 1;
  const k = H / 360;
  const pp = clamp01(p);
  const fade = 1 - smoothstep(pp);
  const s: VanishState = {
    alpha: 1,
    scale: 1,
    rotate: 0,
    dx: 0,
    dy: 0,
    blur: 0,
    flash: 0,
    strip: 1,
  };
  if (pp >= 1) return { ...s, alpha: 0 };
  switch (kind) {
    case 'fade':
      s.alpha = fade;
      break;
    case 'sparkle':
      s.alpha = fade ** 1.25;
      break;
    case 'noise':
      s.alpha = fade;
      break;
    case 'shatter':
      /* 碎片自己淡出（見 vanishParticles），整體不另外變換 */
      s.alpha = 1;
      break;
    case 'dissolve':
      s.alpha = 1;
      break;
    case 'pop':
      /* 前 18% 放大約 13% × 強度再回原大，之後加速縮小（loading-maker F93） */
      if (pp < 0.18) s.scale = 1 + 0.13 * I * Math.sin((Math.PI * pp) / 0.18);
      else s.scale = Math.max(0, 1 - ((pp - 0.18) / 0.82) ** 2);
      s.alpha = pp <= 0.58 ? 1 : clamp01(1 - (pp - 0.58) / 0.42);
      break;
    case 'float':
      s.dy = -0.42 * H * I * smoothstep(pp);
      /* 模糊 7 px × 強度（S 形；loading-maker 附件「往上飄走」的範圍） */
      s.blur = 7 * k * smoothstep(pp) * I;
      s.alpha = fade;
      break;
    case 'close':
      s.strip = fade;
      break;
    case 'spin':
      s.rotate = Math.PI * 2 * 1.3 * I * smoothstep(pp);
      s.scale = fade;
      s.alpha = fade;
      break;
    case 'burst':
      s.flash = 0.62 * Math.max(0, 1 - ((pp - 0.15) / 0.15) ** 2);
      s.scale = 1 + 0.34 * I * smoothstep(pp);
      s.alpha = fade;
      break;
  }
  return s;
}

/** 粒子（畫在畫面之上）：圓、星、三角碎片、方塊、細線 */
export type VanishParticle =
  | {
      type: 'star';
      x: number;
      y: number;
      r: number;
      color: string;
      alpha: number;
      points: 4 | 5;
      rotate: number;
    }
  | { type: 'dot'; x: number; y: number; r: number; color: string; alpha: number }
  | { type: 'line'; y: number; h: number; color: string; alpha: number }
  | {
      type: 'glowLine';
      x: number;
      w: number;
      color: string;
      alpha: number;
      /** 光暈的模糊（px；不給時＝線寬 × 3） */
      blur?: number;
    };

/** 碎片（取來源畫面的一塊，各自變換） */
export interface VanishPiece {
  /** 來源的三角形或矩形頂點（px） */
  poly: readonly [number, number][];
  /** 變換：以 (cx, cy) 為中心旋轉，再位移 (dx, dy) */
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  rotate: number;
  alpha: number;
}

/** 水平條紋的錯開（雜訊條紋） */
export interface VanishBand {
  y: number;
  h: number;
  dx: number;
  /** 這條是否暫時看不見（閃爍） */
  hidden: boolean;
}

export interface VanishLayout {
  particles: VanishParticle[];
  pieces: VanishPiece[] | null;
  bands: VanishBand[] | null;
}

const DEFAULT_COLORS = ['#ff7ea8'];

/**
 * 粒子、碎片、條紋（依 kind；沒有的回傳 null／空陣列）。W、H 為畫布尺寸。
 */
export function vanishLayout(
  kind: VanishKind,
  p: number,
  W: number,
  H: number,
  o: VanishOptions = {},
): VanishLayout {
  const I = o.intensity ?? 1;
  const k = H / 360;
  const colors = o.colors?.length ? o.colors : DEFAULT_COLORS;
  const rnd = createRandom(`vanish:${kind}:${o.seed ?? 1}`);
  const pp = clamp01(p);
  const out: VanishLayout = { particles: [], pieces: null, bands: null };
  switch (kind) {
    case 'sparkle': {
      const n = Math.round(36 * I);
      for (let i = 0; i < n; i++) {
        const born = rnd.next() * 0.8;
        const life = 0.18 + rnd.next() * 0.14;
        const x = rnd.next() * W;
        const y0 = rnd.next() * H;
        const size = (3 + rnd.next() * 5) * k * I;
        const color = colors[i % colors.length];
        const points = rnd.next() < 0.5 ? 4 : 5;
        const rot = rnd.next() * Math.PI;
        const u = (pp - born) / life;
        if (u <= 0 || u >= 1) continue;
        const tw = Math.sin(Math.PI * u);
        out.particles.push({
          type: 'star',
          x,
          y: y0 - 14 * k * u,
          r: size * (0.4 + 0.6 * tw),
          color,
          alpha: tw,
          points,
          rotate: rot,
        });
      }
      break;
    }
    case 'noise': {
      const bands: VanishBand[] = [];
      let y = 0;
      while (y < H) {
        const h = Math.max(1, Math.round((2 + rnd.next() * 10) * k));
        const dir = rnd.next() < 0.5 ? -1 : 1;
        const amt = (0.2 + rnd.next() * 0.8) * 0.35 * W * I;
        const flick = rnd.next();
        const phase = rnd.next() * 7;
        const step = Math.floor(pp * 18 + phase);
        bands.push({
          y,
          h,
          dx: dir * amt * pp * (0.5 + 0.5 * Math.sin(step)),
          hidden: flick < 0.15 + 0.35 * pp && step % 3 === 0,
        });
        y += h;
      }
      out.bands = bands;
      const lines = 3;
      for (let i = 0; i < lines; i++) {
        const ly = rnd.next() * H * 0.8 + H * 0.06;
        const start = 0.15 + rnd.next() * 0.3;
        const u = (pp - start) / 0.35;
        if (u <= 0 || u >= 1) continue;
        out.particles.push({
          type: 'line',
          y: ly,
          h: Math.max(1, 3 * k),
          color: colors[i % colors.length],
          alpha: Math.sin(Math.PI * u),
        });
      }
      break;
    }
    case 'shatter': {
      const cols = 6;
      const rows = 4;
      const cw = W / cols;
      const ch = H / rows;
      const pieces: VanishPiece[] = [];
      const fade = 1 - smoothstep(pp);
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const x0 = i * cw;
          const y0 = j * ch;
          const tris: [number, number][][] = [
            [
              [x0, y0],
              [x0 + cw, y0],
              [x0, y0 + ch],
            ],
            [
              [x0 + cw, y0],
              [x0 + cw, y0 + ch],
              [x0, y0 + ch],
            ],
          ];
          for (const tri of tris) {
            const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
            const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
            let vx = cx - W / 2;
            let vy = cy - H / 2;
            const len = Math.hypot(vx, vy) || 1;
            const jitter = (rnd.next() - 0.5) * 0.9;
            const a = Math.atan2(vy, vx) + jitter;
            vx = Math.cos(a);
            vy = Math.sin(a);
            const speed = (0.7 + rnd.next() * 0.6) * (0.4 + (0.6 * len) / Math.hypot(W / 2, H / 2));
            const dist = 0.56 * H * I * speed * pp * pp;
            pieces.push({
              poly: tri as [number, number][],
              cx,
              cy,
              dx: vx * dist,
              dy: vy * dist,
              rotate: (rnd.next() - 0.5) * 4 * I * pp * pp,
              alpha: fade,
            });
          }
        }
      out.pieces = pieces;
      break;
    }
    case 'dissolve': {
      const size = Math.max(7 * k, Math.min(W, H) / 29 / I);
      const cols = Math.ceil(W / size);
      const rows = Math.ceil(H / size);
      const pieces: VanishPiece[] = [];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const x0 = i * size;
          const y0 = j * size;
          const t = rnd.next() * 0.82;
          const u = clamp01((pp - t) / 0.16);
          const drift = 6 * k * I * pp;
          const ang = rnd.next() * Math.PI * 2;
          const alpha = (1 - smoothstep(u)) * (1 - 0.35 * pp);
          if (alpha <= 0) continue;
          pieces.push({
            poly: [
              [x0, y0],
              [x0 + size, y0],
              [x0 + size, y0 + size],
              [x0, y0 + size],
            ],
            cx: x0 + size / 2,
            cy: y0 + size / 2,
            dx: Math.cos(ang) * drift,
            dy: Math.sin(ang) * drift + drift * 0.5,
            rotate: 0,
            alpha,
          });
        }
      out.pieces = pieces;
      break;
    }
    case 'close': {
      const st = 1 - smoothstep(pp);
      const half = (st * W) / 2;
      /* 線寬約畫布寬的 0.4%、光暈 12 px（× 強度；loading-maker 附件「往中央收起」的不透明量） */
      const w = Math.max(1, W * 0.004 * I);
      const alpha = pp < 0.04 ? pp / 0.04 : 1;
      for (const x of [W / 2 - half, W / 2 + half])
        out.particles.push({ type: 'glowLine', x, w, color: colors[0], alpha, blur: 12 * k * I });
      break;
    }
    case 'burst': {
      const n = Math.round(28 * I);
      for (let i = 0; i < n; i++) {
        const a = rnd.next() * Math.PI * 2;
        const v = (0.25 + rnd.next() * 0.75) * 0.6 * Math.hypot(W, H) * 0.5;
        const delay = rnd.next() * 0.25;
        const u = clamp01((pp - delay) / 0.75);
        if (u <= 0 || u >= 1) continue;
        const d = v * (1 - (1 - u) ** 2);
        out.particles.push({
          type: 'dot',
          x: W / 2 + Math.cos(a) * d,
          y: H / 2 + Math.sin(a) * d,
          r: (2 + rnd.next() * 5) * k * I * (1 - u),
          color: colors[i % colors.length],
          alpha: 1 - u * 0.4,
        });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

/**
 * 把來源畫面（整個畫布：背景、角色、讀取動畫、文字）依結尾動作畫到 ctx（ctx 先清空、透明）。
 * p ≥ 1 時什麼都不畫（全空）。
 */
export function drawVanish(
  ctx: Ctx2D,
  source: CanvasImageSource,
  W: number,
  H: number,
  kind: VanishKind,
  p: number,
  o: VanishOptions = {},
): void {
  if (p >= 1) return;
  const st = vanishState(kind, p, H, o);
  const lay = vanishLayout(kind, p, W, H, o);
  ctx.save();
  if (lay.pieces) {
    for (const piece of lay.pieces) {
      if (piece.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = piece.alpha * st.alpha;
      ctx.translate(piece.cx + piece.dx, piece.cy + piece.dy);
      ctx.rotate(piece.rotate);
      ctx.translate(-piece.cx, -piece.cy);
      ctx.beginPath();
      piece.poly.forEach(([x, y], i) => {
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(source, 0, 0, W, H);
      ctx.restore();
    }
  } else if (lay.bands) {
    ctx.globalAlpha = st.alpha;
    for (const b of lay.bands) {
      if (b.hidden) continue;
      ctx.drawImage(source, 0, b.y, W, b.h, b.dx, b.y, W, b.h);
    }
  } else if (st.alpha > 0 && st.scale > 0) {
    ctx.globalAlpha = Math.min(1, st.alpha);
    if (st.blur > 0.3 && 'filter' in ctx) ctx.filter = `blur(${st.blur.toFixed(2)}px)`;
    if (st.strip < 1) {
      const half = (st.strip * W) / 2;
      ctx.beginPath();
      ctx.rect(W / 2 - half, 0, half * 2, H);
      ctx.clip();
    }
    ctx.translate(W / 2 + st.dx, H / 2 + st.dy);
    ctx.rotate(st.rotate);
    ctx.scale(st.scale, st.scale);
    ctx.drawImage(source, -W / 2, -H / 2, W, H);
  }
  ctx.restore();
  /* 粒子 */
  ctx.save();
  for (const pt of lay.particles) {
    if (pt.alpha <= 0) continue;
    ctx.globalAlpha = Math.min(1, pt.alpha);
    if (pt.type === 'line') {
      ctx.fillStyle = pt.color;
      ctx.fillRect(0, pt.y, W, pt.h);
    } else if (pt.type === 'glowLine') {
      ctx.shadowColor = pt.color;
      ctx.shadowBlur = pt.blur ?? pt.w * 3;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.w / 2, 0, pt.w, H);
      ctx.shadowBlur = 0;
    } else if (pt.type === 'dot') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.5, pt.r), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = pt.color;
      traceShape(ctx, 'star', pt.x, pt.y, Math.max(0.5, pt.r), {
        points: pt.points,
        innerRatio: pt.points === 4 ? 0.32 : 0.45,
        rotation: pt.rotate,
      });
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
  /* 閃光：整個畫布變白（透明背景時也是） */
  if (st.flash > 0) {
    ctx.save();
    ctx.globalAlpha = st.flash;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
