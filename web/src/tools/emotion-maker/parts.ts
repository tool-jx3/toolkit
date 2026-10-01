/**
 * 表情產生器的內建部件：全部是本工具自己畫的向量圖（canvas 路徑），不使用任何點陣素材。
 *
 * - 座標系是 500 × 500 的正方形（與頭部底圖同大），每個部件都對準同一張臉，畫到任何大小都清晰。
 * - 題材依規格 3.1：頭部底圖兩層（填色、輪廓）、眼睛 10、眉毛 4、嘴巴 10、裝飾 13。
 * - 每個部件只用一般的疊加（source-over）作畫，所以「直接畫進合成畫布」與「先畫成圖層再疊」結果相同。
 *
 * 這個檔案在 Node（單元測試）也會被載入：Path2D 等瀏覽器物件只在 draw 裡用到。
 */
import type { Category } from './logic';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 部件座標系的邊長 */
export const PART_UNITS = 500;

export interface BuiltinPart {
  id: string;
  /** base＝頭部底圖（固定，不能選） */
  category: Category | 'base';
  name: string;
  /** 在 500 × 500 的座標系作畫 */
  draw: (ctx: Ctx2D) => void;
}

const TAU = Math.PI * 2;
const SKIN = '#ffe3d0';
const OUTLINE = '#4a3430';
const LINE = '#3b2a30';
const IRIS = '#3a2b40';
const MOUTH_IN = '#7a2c3c';
const TONGUE = '#ff8fa3';
const WHITE = '#ffffff';

/** 頭部輪廓（底圖、整臉色調、陰影共用） */
const HEAD_D =
  'M250 82C372 82 438 164 438 272C438 374 360 438 250 438C140 438 62 374 62 272C62 164 128 82 250 82Z';
const EAR_Y = 292;

/* ---------- 小工具 ---------- */

function stroke(ctx: Ctx2D, d: string, width: number, color = LINE): void {
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(d));
  ctx.restore();
}

function fill(ctx: Ctx2D, d: string | Path2D, color: string | CanvasGradient): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fill(typeof d === 'string' ? new Path2D(d) : d);
  ctx.restore();
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  return p;
}

function dot(ctx: Ctx2D, x: number, y: number, r: number, color = WHITE): void {
  fill(ctx, ellipsePath(x, y, r, r), color);
}

/** 把畫筆限制在頭部範圍內 */
function clipHead(ctx: Ctx2D): void {
  ctx.clip(new Path2D(HEAD_D));
}

/** 以 (cx, cy) 為中心放大 k 倍作畫 */
function scaled(ctx: Ctx2D, cx: number, cy: number, k: number, draw: (ctx: Ctx2D) => void): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(-cx, -cy);
  draw(ctx);
  ctx.restore();
}

/** 眼睛、嘴巴整組放大的倍率（以臉的中線為中心） */
const EYE_SCALE = 1.12;
const MOUTH_SCALE = 1.3;

/** 左右眼（cx：眼睛中心；out：往外側的方向，左眼 −1、右眼 +1） */
const EYES: readonly { cx: number; out: -1 | 1 }[] = [
  { cx: 178, out: -1 },
  { cx: 322, out: 1 },
];
const EYE_Y = 288;

/** 左右眉（cx：眉毛中心） */
const BROWS: readonly { cx: number; out: -1 | 1 }[] = [
  { cx: 178, out: -1 },
  { cx: 322, out: 1 },
];
const BROW_Y = 214;

const n = (v: number) => Math.round(v * 10) / 10;

/** 眼睛上緣的睫毛線（外側略微上揚） */
function lashLine(ctx: Ctx2D, cx: number, out: number, y = 258, width = 7): void {
  const inner = cx - out * 30;
  const outer = cx + out * 34;
  stroke(
    ctx,
    `M${n(inner)} ${y + 4}Q${n(cx)} ${y - 18} ${n(outer)} ${y}L${n(outer + out * 8)} ${y - 7}`,
    width,
  );
}

function irisOval(ctx: Ctx2D, cx: number, rx = 23, ry = 33, color: string | CanvasGradient = IRIS) {
  fill(ctx, ellipsePath(cx, EYE_Y, rx, ry), color);
}

function heartPath(cx: number, cy: number, s: number): Path2D {
  return new Path2D(
    `M${cx} ${cy + s * 0.92}` +
      `C${cx - s * 1.35} ${cy + s * 0.05} ${cx - s * 0.95} ${cy - s * 1.0} ${cx} ${cy - s * 0.38}` +
      `C${cx + s * 0.95} ${cy - s * 1.0} ${cx + s * 1.35} ${cy + s * 0.05} ${cx} ${cy + s * 0.92}Z`,
  );
}

/** 四角星（閃光） */
function sparkle(ctx: Ctx2D, x: number, y: number, r: number, color = WHITE): void {
  const k = r * 0.28;
  fill(
    ctx,
    `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}` +
      `Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`,
    color,
  );
}

/** 水滴（尖端朝上；angle 為傾斜角度，弧度） */
function drop(ctx: Ctx2D, x: number, y: number, s: number, angle = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const p = new Path2D(
    `M0 ${-s * 1.55}C${s * 0.35} ${-s * 0.9} ${s} ${-s * 0.35} ${s} ${s * 0.2}` +
      `A${s} ${s} 0 0 1 ${-s} ${s * 0.2}C${-s} ${-s * 0.35} ${-s * 0.35} ${-s * 0.9} 0 ${-s * 1.55}Z`,
  );
  ctx.fillStyle = '#c9ecff';
  ctx.fill(p);
  ctx.lineWidth = Math.max(3, s * 0.18);
  ctx.strokeStyle = '#4c9ad6';
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.ellipse(-s * 0.35, s * 0.05, s * 0.18, s * 0.32, -0.35, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 整臉色調：頭部範圍內由上往下漸淡的半透明色 */
function faceTint(ctx: Ctx2D, rgb: string, top: number, bottom: number): void {
  ctx.save();
  clipHead(ctx);
  const g = ctx.createLinearGradient(0, 82, 0, 438);
  g.addColorStop(0, `rgba(${rgb}, ${top})`);
  g.addColorStop(1, `rgba(${rgb}, ${bottom})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PART_UNITS, PART_UNITS);
  ctx.restore();
}

/* ---------- 頭部底圖（兩層） ---------- */

export const HEAD_FILL: BuiltinPart = {
  id: 'head-fill',
  category: 'base',
  name: '頭部填色',
  draw(ctx) {
    for (const out of [-1, 1]) fill(ctx, ellipsePath(250 + out * 184, EAR_Y, 22, 32), SKIN);
    fill(ctx, HEAD_D, SKIN);
  },
};

export const HEAD_LINE: BuiltinPart = {
  id: 'head-line',
  category: 'base',
  name: '頭部輪廓',
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 8;
    ctx.strokeStyle = OUTLINE;
    ctx.lineCap = 'round';
    for (const out of [-1, 1]) {
      const p = new Path2D();
      /* 只描耳朵露在頭外面的那半圈 */
      p.ellipse(
        250 + out * 184,
        EAR_Y,
        22,
        32,
        0,
        out < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        out < 0 ? Math.PI * 1.5 : Math.PI * 0.5,
      );
      ctx.stroke(p);
      /* 耳朵裡的一筆 */
      stroke(
        ctx,
        `M${250 + out * 190} ${EAR_Y - 12}Q${250 + out * 198} ${EAR_Y} ${250 + out * 190} ${EAR_Y + 12}`,
        5,
        OUTLINE,
      );
    }
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(HEAD_D));
    ctx.restore();
  },
};

/* ---------- 眼睛（10） ---------- */

const EYE_PARTS: BuiltinPart[] = [
  {
    id: 'eyes-normal',
    category: 'eyes',
    name: '一般',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        irisOval(ctx, cx);
        dot(ctx, cx - out * 7, EYE_Y - 13, 8);
        dot(ctx, cx + out * 7, EYE_Y + 13, 4);
        lashLine(ctx, cx, out);
      }
    },
  },
  {
    id: 'eyes-closed',
    category: 'eyes',
    name: '閉眼',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        const a = cx - out * 30;
        const b = cx + out * 32;
        stroke(ctx, `M${a} ${EYE_Y - 4}Q${cx} ${EYE_Y + 22} ${b} ${EYE_Y - 4}`, 7);
        stroke(ctx, `M${b} ${EYE_Y - 4}L${b + out * 10} ${EYE_Y - 12}`, 6);
      }
    },
  },
  {
    id: 'eyes-smile',
    category: 'eyes',
    name: '笑眼',
    draw(ctx) {
      for (const { cx } of EYES) {
        stroke(ctx, `M${cx - 30} ${EYE_Y + 10}Q${cx} ${EYE_Y - 30} ${cx + 30} ${EYE_Y + 10}`, 8);
      }
    },
  },
  {
    id: 'eyes-dull',
    category: 'eyes',
    name: '無神',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        const p = new Path2D();
        p.ellipse(cx, EYE_Y - 8, 22, 26, 0, 0, Math.PI);
        p.closePath();
        fill(ctx, p, '#5b4a5f');
        stroke(ctx, `M${cx - 34} ${EYE_Y - 8}L${cx + 34} ${EYE_Y - 8}`, 8);
        stroke(ctx, `M${cx + out * 34} ${EYE_Y - 8}L${cx + out * 42} ${EYE_Y - 14}`, 6);
      }
    },
  },
  {
    id: 'eyes-sharp',
    category: 'eyes',
    name: '銳利',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        const outer = cx + out * 36;
        const inner = cx - out * 32;
        const shape = new Path2D(
          `M${outer} ${EYE_Y - 20}L${inner} ${EYE_Y + 2}Q${cx - out * 4} ${EYE_Y + 22} ${outer} ${EYE_Y - 20}Z`,
        );
        fill(ctx, shape, WHITE);
        ctx.save();
        ctx.clip(shape);
        dot(ctx, cx - out * 2, EYE_Y + 2, 13, IRIS);
        dot(ctx, cx - out * 6, EYE_Y - 3, 3);
        ctx.restore();
        stroke(ctx, `M${outer + out * 4} ${EYE_Y - 24}L${inner} ${EYE_Y + 2}`, 8);
        stroke(
          ctx,
          `M${inner + out * 6} ${EYE_Y + 8}Q${cx} ${EYE_Y + 16} ${outer} ${EYE_Y - 12}`,
          3.5,
        );
      }
    },
  },
  {
    id: 'eyes-wink',
    category: 'eyes',
    name: '眨眼',
    draw(ctx) {
      const [left, right] = EYES;
      irisOval(ctx, left.cx);
      dot(ctx, left.cx + 7, EYE_Y - 13, 8);
      dot(ctx, left.cx - 7, EYE_Y + 13, 4);
      lashLine(ctx, left.cx, left.out);
      const cx = right.cx;
      stroke(ctx, `M${cx - 30} ${EYE_Y + 8}Q${cx - 2} ${EYE_Y - 26} ${cx + 30} ${EYE_Y + 6}`, 8);
      stroke(ctx, `M${cx + 30} ${EYE_Y + 6}L${cx + 40} ${EYE_Y + 1}`, 6);
      sparkle(ctx, cx + 30, EYE_Y - 40, 12, '#ffcf3f');
    },
  },
  {
    id: 'eyes-dot',
    category: 'eyes',
    name: '豆豆眼',
    draw(ctx) {
      for (const { cx } of EYES) dot(ctx, cx, EYE_Y, 9, LINE);
    },
  },
  {
    id: 'eyes-squeeze',
    category: 'eyes',
    name: '緊閉',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        const tip = cx - out * 18;
        const back = cx + out * 26;
        stroke(ctx, `M${back} ${EYE_Y - 22}L${tip} ${EYE_Y}L${back} ${EYE_Y + 22}`, 8);
      }
    },
  },
  {
    id: 'eyes-sparkle',
    category: 'eyes',
    name: '閃亮',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        const g = ctx.createLinearGradient(0, EYE_Y - 38, 0, EYE_Y + 38);
        g.addColorStop(0, '#24183a');
        g.addColorStop(0.55, '#3d3a8c');
        g.addColorStop(1, '#7f8de8');
        irisOval(ctx, cx, 27, 38, g);
        dot(ctx, cx - out * 9, EYE_Y - 14, 10);
        dot(ctx, cx + out * 9, EYE_Y + 17, 5);
        sparkle(ctx, cx + out * 8, EYE_Y - 4, 9);
        lashLine(ctx, cx, out, 252, 7);
        sparkle(ctx, cx + out * 42, EYE_Y - 44, 10, '#ffd84a');
      }
    },
  },
  {
    id: 'eyes-heart',
    category: 'eyes',
    name: '愛心眼',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        const h = heartPath(cx, EYE_Y, 30);
        fill(ctx, h, '#ff4f7b');
        ctx.save();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#b3204a';
        ctx.lineJoin = 'round';
        ctx.stroke(h);
        ctx.restore();
        dot(ctx, cx - out * 10, EYE_Y - 12, 6);
      }
    },
  },
];

/* ---------- 眉毛（4） ---------- */

const BROW_PARTS: BuiltinPart[] = [
  {
    id: 'brows-normal',
    category: 'brows',
    name: '一般',
    draw(ctx) {
      for (const { cx, out } of BROWS) {
        stroke(
          ctx,
          `M${cx - out * 36} ${BROW_Y}Q${cx} ${BROW_Y - 20} ${cx + out * 38} ${BROW_Y + 6}`,
          8,
        );
      }
    },
  },
  {
    id: 'brows-flat',
    category: 'brows',
    name: '平直',
    draw(ctx) {
      for (const { cx } of BROWS) stroke(ctx, `M${cx - 36} ${BROW_Y}L${cx + 36} ${BROW_Y}`, 8);
    },
  },
  {
    id: 'brows-worried',
    category: 'brows',
    name: '困擾',
    draw(ctx) {
      for (const { cx, out } of BROWS) {
        stroke(
          ctx,
          `M${cx + out * 38} ${BROW_Y + 10}Q${cx} ${BROW_Y + 4} ${cx - out * 36} ${BROW_Y - 18}`,
          8,
        );
      }
    },
  },
  {
    id: 'brows-angry',
    category: 'brows',
    name: '生氣',
    draw(ctx) {
      for (const { cx, out } of BROWS) {
        /* 內側粗、外側細的斜線 */
        const ix = cx - out * 40;
        const ox = cx + out * 38;
        fill(
          ctx,
          `M${ox} ${BROW_Y - 24}L${ix} ${BROW_Y + 2}L${ix + out * 2} ${BROW_Y + 16}L${ox + out * 2} ${BROW_Y - 16}Z`,
          LINE,
        );
        stroke(ctx, `M${ox} ${BROW_Y - 20}L${ix} ${BROW_Y + 8}`, 6);
      }
    },
  },
];

/* ---------- 嘴巴（10） ---------- */

const MOUTH_Y = 362;

const MOUTH_PARTS: BuiltinPart[] = [
  {
    id: 'mouth-smile',
    category: 'mouth',
    name: '微笑',
    draw(ctx) {
      stroke(ctx, `M220 ${MOUTH_Y - 8}Q250 ${MOUTH_Y + 20} 280 ${MOUTH_Y - 8}`, 6);
    },
  },
  {
    id: 'mouth-grin',
    category: 'mouth',
    name: '張口笑',
    draw(ctx) {
      const shape = new Path2D(
        `M212 ${MOUTH_Y - 14}Q250 ${MOUTH_Y - 8} 288 ${MOUTH_Y - 14}Q284 ${MOUTH_Y + 36} 250 ${MOUTH_Y + 38}Q216 ${MOUTH_Y + 36} 212 ${MOUTH_Y - 14}Z`,
      );
      fill(ctx, shape, MOUTH_IN);
      ctx.save();
      ctx.clip(shape);
      fill(ctx, ellipsePath(250, MOUTH_Y + 34, 24, 14), TONGUE);
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = LINE;
      ctx.lineJoin = 'round';
      ctx.stroke(shape);
      ctx.restore();
    },
  },
  {
    id: 'mouth-open',
    category: 'mouth',
    name: '微張',
    draw(ctx) {
      const p = ellipsePath(250, MOUTH_Y + 2, 12, 10);
      fill(ctx, p, MOUTH_IN);
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = LINE;
      ctx.stroke(p);
      ctx.restore();
    },
  },
  {
    id: 'mouth-wide',
    category: 'mouth',
    name: '大張口',
    draw(ctx) {
      const p = ellipsePath(250, MOUTH_Y + 10, 34, 40);
      fill(ctx, p, '#6b2434');
      ctx.save();
      ctx.clip(p);
      ctx.fillStyle = WHITE;
      ctx.fillRect(200, MOUTH_Y - 34, 100, 12);
      fill(ctx, ellipsePath(250, MOUTH_Y + 46, 26, 16), TONGUE);
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 6;
      ctx.strokeStyle = LINE;
      ctx.stroke(p);
      ctx.restore();
    },
  },
  {
    id: 'mouth-line',
    category: 'mouth',
    name: '一字嘴',
    draw(ctx) {
      stroke(ctx, `M226 ${MOUTH_Y}L274 ${MOUTH_Y}`, 6);
    },
  },
  {
    id: 'mouth-frown',
    category: 'mouth',
    name: '不滿',
    draw(ctx) {
      stroke(
        ctx,
        `M222 ${MOUTH_Y + 10}Q236 ${MOUTH_Y - 6} 250 ${MOUTH_Y - 4}Q266 ${MOUTH_Y - 6} 278 ${MOUTH_Y + 10}`,
        6,
      );
    },
  },
  {
    id: 'mouth-pout',
    category: 'mouth',
    name: '噘嘴',
    draw(ctx) {
      stroke(
        ctx,
        `M242 ${MOUTH_Y - 22}Q272 ${MOUTH_Y - 20} 252 ${MOUTH_Y - 2}Q274 ${MOUTH_Y + 8} 244 ${MOUTH_Y + 22}`,
        6,
      );
    },
  },
  {
    id: 'mouth-cat',
    category: 'mouth',
    name: '貓咪嘴',
    draw(ctx) {
      stroke(
        ctx,
        `M216 ${MOUTH_Y - 6}Q224 ${MOUTH_Y + 16} 250 ${MOUTH_Y}Q276 ${MOUTH_Y + 16} 284 ${MOUTH_Y - 6}`,
        6,
      );
    },
  },
  {
    id: 'mouth-tongue',
    category: 'mouth',
    name: '吐舌',
    draw(ctx) {
      const tongue = new Path2D(
        `M252 ${MOUTH_Y + 2}C252 ${MOUTH_Y + 34} 284 ${MOUTH_Y + 34} 282 ${MOUTH_Y - 4}`,
      );
      fill(ctx, tongue, TONGUE);
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = LINE;
      ctx.lineJoin = 'round';
      ctx.stroke(tongue);
      ctx.restore();
      stroke(ctx, `M267 ${MOUTH_Y + 4}L267 ${MOUTH_Y + 14}`, 3, '#d65a77');
      stroke(ctx, `M216 ${MOUTH_Y - 10}Q248 ${MOUTH_Y + 14} 288 ${MOUTH_Y - 8}`, 6);
    },
  },
  {
    id: 'mouth-smug',
    category: 'mouth',
    name: 'V 字嘴',
    draw(ctx) {
      stroke(ctx, `M216 ${MOUTH_Y - 12}L248 ${MOUTH_Y + 14}L286 ${MOUTH_Y - 16}`, 6);
      stroke(ctx, `M286 ${MOUTH_Y - 16}L294 ${MOUTH_Y - 24}`, 5);
    },
  },
];

/* ---------- 裝飾（13） ---------- */

const DECO_PARTS: BuiltinPart[] = [
  {
    id: 'deco-blush',
    category: 'deco',
    name: '臉紅',
    draw(ctx) {
      for (const out of [-1, 1]) {
        const cx = 250 + out * 110;
        const cy = 334;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 0.5);
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 44);
        g.addColorStop(0, 'rgba(255, 105, 140, 0.7)');
        g.addColorStop(0.6, 'rgba(255, 120, 150, 0.45)');
        g.addColorStop(1, 'rgba(255, 140, 160, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, TAU);
        ctx.fill();
        ctx.restore();
        for (let i = -1; i <= 1; i++) {
          const x = cx + i * 14;
          stroke(ctx, `M${x + 5} ${cy - 9}L${x - 5} ${cy + 9}`, 3.5, '#f0567e');
        }
      }
    },
  },
  {
    id: 'deco-sweat-many',
    category: 'deco',
    name: '冒汗',
    draw(ctx) {
      drop(ctx, 400, 178, 15, 0.35);
      drop(ctx, 432, 232, 11, 0.5);
      drop(ctx, 370, 128, 9, 0.2);
      drop(ctx, 96, 188, 12, -0.4);
      drop(ctx, 74, 236, 8, -0.5);
    },
  },
  {
    id: 'deco-sweat-one',
    category: 'deco',
    name: '一滴汗',
    draw(ctx) {
      drop(ctx, 398, 192, 26, 0.3);
    },
  },
  {
    id: 'deco-tears',
    category: 'deco',
    name: '眼淚',
    draw(ctx) {
      for (const { cx, out } of EYES) {
        const x = 250 + (cx - 250) * EYE_SCALE + out * 6;
        const y = EYE_Y + 34;
        const d = `M${x} ${y}C${x + out * 2} ${y + 30} ${x + out * 16} ${y + 44} ${x + out * 12} ${y + 80}`;
        stroke(ctx, d, 17, 'rgba(118, 192, 255, 0.85)');
        stroke(ctx, d, 5, 'rgba(255, 255, 255, 0.8)');
        drop(ctx, x + out * 12, y + 100, 9);
      }
    },
  },
  {
    id: 'deco-anger',
    category: 'deco',
    name: '怒筋',
    draw(ctx) {
      const x = 362;
      const y = 150;
      const r = 30;
      const k = 8;
      ctx.save();
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#e02a3c';
      ctx.lineCap = 'round';
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x + sx * r, y + sy * k);
        ctx.quadraticCurveTo(x + sx * k, y + sy * k, x + sx * k, y + sy * r);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'deco-wrinkle',
    category: 'deco',
    name: '眉間皺紋',
    draw(ctx) {
      stroke(ctx, `M238 ${BROW_Y - 14}Q244 ${BROW_Y} 238 ${BROW_Y + 14}`, 4);
      stroke(ctx, `M262 ${BROW_Y - 14}Q256 ${BROW_Y} 262 ${BROW_Y + 14}`, 4);
      stroke(ctx, `M250 ${BROW_Y - 8}L250 ${BROW_Y + 8}`, 3.5);
    },
  },
  {
    id: 'deco-shadow',
    category: 'deco',
    name: '陰影',
    draw(ctx) {
      ctx.save();
      clipHead(ctx);
      const g = ctx.createLinearGradient(0, 82, 0, 340);
      g.addColorStop(0, 'rgba(45, 30, 70, 0.64)');
      g.addColorStop(0.5, 'rgba(45, 30, 70, 0.52)');
      g.addColorStop(0.72, 'rgba(45, 30, 70, 0.32)');
      g.addColorStop(0.88, 'rgba(45, 30, 70, 0.1)');
      g.addColorStop(1, 'rgba(45, 30, 70, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, PART_UNITS, 340);
      ctx.restore();
    },
  },
  {
    id: 'deco-under-nose',
    category: 'deco',
    name: '鼻下陰影',
    draw(ctx) {
      ctx.save();
      clipHead(ctx);
      const g = ctx.createLinearGradient(0, 312, 0, 440);
      g.addColorStop(0, 'rgba(60, 40, 80, 0)');
      g.addColorStop(0.14, 'rgba(60, 40, 80, 0.12)');
      g.addColorStop(0.35, 'rgba(60, 40, 80, 0.36)');
      g.addColorStop(1, 'rgba(60, 40, 80, 0.56)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 312, PART_UNITS, 188);
      ctx.restore();
    },
  },
  {
    id: 'deco-despair',
    category: 'deco',
    name: '絕望直線',
    draw(ctx) {
      ctx.save();
      clipHead(ctx);
      const lens = [92, 118, 104, 130, 112, 126, 98, 120, 90];
      lens.forEach((len, i) => {
        const x = 154 + i * 24;
        stroke(ctx, `M${x} 70L${x} ${70 + len}`, 4, 'rgba(40, 28, 70, 0.85)');
      });
      ctx.restore();
    },
  },
  {
    id: 'deco-tint-black',
    category: 'deco',
    name: '陰沉黑',
    draw(ctx) {
      faceTint(ctx, '24, 18, 32', 0.66, 0.3);
    },
  },
  {
    id: 'deco-tint-purple',
    category: 'deco',
    name: '噁心紫',
    draw(ctx) {
      faceTint(ctx, '112, 62, 168', 0.58, 0.24);
    },
  },
  {
    id: 'deco-tint-red',
    category: 'deco',
    name: '生氣紅',
    draw(ctx) {
      faceTint(ctx, '226, 42, 48', 0.55, 0.2);
    },
  },
  {
    id: 'deco-tint-blue',
    category: 'deco',
    name: '蒼白藍',
    draw(ctx) {
      faceTint(ctx, '72, 118, 210', 0.55, 0.18);
    },
  },
];

/** 頭部底圖（由下而上：填色、輪廓） */
export const HEAD_LAYERS: readonly BuiltinPart[] = [HEAD_FILL, HEAD_LINE];

/** 各類的內建部件（顯示順序） */
const withScale = (parts: BuiltinPart[], cy: number, k: number): BuiltinPart[] =>
  parts.map((p) => ({ ...p, draw: (ctx) => scaled(ctx, 250, cy, k, p.draw) }));

export const BUILTIN_PARTS: Readonly<Record<Category, readonly BuiltinPart[]>> = {
  eyes: withScale(EYE_PARTS, EYE_Y, EYE_SCALE),
  brows: BROW_PARTS,
  mouth: withScale(MOUTH_PARTS, MOUTH_Y, MOUTH_SCALE),
  deco: DECO_PARTS,
};

const BY_ID = new Map<string, BuiltinPart>(
  [...HEAD_LAYERS, ...Object.values(BUILTIN_PARTS).flat()].map((p) => [p.id, p]),
);

export function builtinPart(id: string): BuiltinPart | undefined {
  return BY_ID.get(id);
}

/** 把部件畫進 ctx 的正方形範圍（x, y, size） */
export function drawPartAt(ctx: Ctx2D, part: BuiltinPart, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(size / PART_UNITS, size / PART_UNITS);
  part.draw(ctx);
  ctx.restore();
}
