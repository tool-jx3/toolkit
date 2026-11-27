/**
 * 把 `scenes.ts` 的圖層畫到 2D 畫布上（預覽與匯出共用）。
 * - 畫布的大小任意：以 1280 × 720 的座標整體縮放（640 × 360 是 0.5 倍、1920 × 1080 是 1.5 倍）。
 * - 立繪：眼睛對準圖層指定的位置；臉的基準長度（圖高 × headLen）畫成 reach × 大小（演員 % × 這個型的立繪放大 %）。
 * - 白色剪影與謎之剪影（左邊的人左右反過來、塗成深色）各快取一張縮小的版本（長邊 1200 px）。
 * - 文字：先畫描邊（圓角接頭）再填色；有 fit 時量字，放不下就縮小。
 */
import { type FontValue, fontCss } from '@/core/fonts';
import { makeCanvas } from '@/core/image';
import { type Fade, H, type Layer, type Outline, type Paint, SPLASH, STREAKS, W } from './scenes';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Pic = CanvasImageSource & { width: number; height: number };

export interface Performer {
  image: Pic;
  /** 眼睛的位置（圖的 %） */
  eyeX: number;
  eyeY: number;
  /** 臉的基準長度（圖高的比例） */
  headLen: number;
  /** 大小（倍：演員的大小 × 型的立繪放大） */
  size: number;
  /** 白色剪影（沒有＝不閃白，例如謎之剪影） */
  white: Pic | null;
}

export interface Crew {
  hero: Performer | null;
  rival: Performer | null;
  fonts: { name: FontValue; quote: FontValue; impact: FontValue };
}

/** 小標題與 VS 字的字型（固定） */
export const BADGE_FONT: FontValue = { source: 'google', family: 'Noto Sans TC', weight: 900 };
/** 重擊字的顏色與墨點 */
const INK = '#111111';

/* ---------- 剪影 ---------- */

const SIL_MAX = 1200;
const whites = new WeakMap<object, Pic>();
const shadows = new WeakMap<object, Pic>();

function tinted(img: Pic, color: string, mirror: boolean): Pic {
  const k = Math.min(1, SIL_MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const c = makeCanvas(w, h);
  const c2d = c.getContext('2d') as Ctx | null;
  if (!c2d) return img;
  if (mirror) c2d.setTransform(-1, 0, 0, 1, w, 0);
  c2d.drawImage(img, 0, 0, w, h);
  c2d.setTransform(1, 0, 0, 1, 0, 0);
  c2d.globalCompositeOperation = 'source-in';
  c2d.fillStyle = color;
  c2d.fillRect(0, 0, w, h);
  return c as Pic;
}

/** 白色剪影（快取） */
export function whiteOf(img: Pic): Pic {
  let s = whites.get(img);
  if (!s) {
    s = tinted(img, '#ffffff', false);
    whites.set(img, s);
  }
  return s;
}

/** 謎之剪影：左右反過來、塗成深色（快取） */
export function shadowOf(img: Pic): Pic {
  let s = shadows.get(img);
  if (!s) {
    s = tinted(img, '#0d0b14', true);
    shadows.set(img, s);
  }
  return s;
}

/** 謎之剪影的演員（左邊的人反過來；不閃白） */
export function mysteryOf(hero: Performer): Performer {
  return {
    image: shadowOf(hero.image),
    eyeX: 100 - hero.eyeX,
    eyeY: hero.eyeY,
    headLen: hero.headLen,
    size: hero.size,
    white: null,
  };
}

/* ---------- 還沒有演員時的示意人形（本站自己畫） ---------- */

let stand: Pic | null = null;

/** 示意人形：半透明的胸像剪影（600 × 760） */
export function standIn(): Pic {
  if (stand) return stand;
  const c = makeCanvas(600, 760);
  const c2d = c.getContext('2d') as Ctx | null;
  if (!c2d) return c as Pic;
  c2d.beginPath();
  c2d.ellipse(300, 205, 112, 132, 0, 0, Math.PI * 2);
  c2d.moveTo(255, 320);
  c2d.lineTo(345, 320);
  c2d.lineTo(352, 420);
  c2d.bezierCurveTo(440, 430, 530, 470, 548, 560);
  c2d.lineTo(568, 760);
  c2d.lineTo(32, 760);
  c2d.lineTo(52, 560);
  c2d.bezierCurveTo(70, 470, 160, 430, 248, 420);
  c2d.closePath();
  const fill = c2d.createLinearGradient(120, 40, 480, 760);
  fill.addColorStop(0, 'rgba(214,222,240,0.62)');
  fill.addColorStop(0.6, 'rgba(160,172,198,0.48)');
  fill.addColorStop(1, 'rgba(132,144,172,0.34)');
  c2d.fillStyle = fill;
  c2d.fill();
  stand = c as Pic;
  return stand;
}

/** 示意人形的臉（自動對準的結果：眼睛約在 32%、基準長度約為圖高的 0.76） */
export const STAND_IN_FACE = { eyeX: 50, eyeY: 32, headLen: 0.76 } as const;

/* ---------- 畫 ---------- */

function pathOf(c2d: Ctx, o: Outline): void {
  c2d.beginPath();
  if ('box' in o) {
    const [x, y, w, h] = o.box;
    c2d.rect(x, y, w, h);
  } else if ('arc' in o) {
    const a = o.arc;
    c2d.arc(a.c[0], a.c[1], Math.max(0, a.r), a.from, a.to);
    if (a.closed) c2d.closePath();
  } else {
    o.poly.forEach(([x, y], i) => {
      if (i) c2d.lineTo(x, y);
      else c2d.moveTo(x, y);
    });
    if (!o.open) c2d.closePath();
  }
}

function paintOf(c2d: Ctx, p: Paint): string | CanvasGradient {
  if (typeof p === 'string') return p;
  const grad = c2d.createLinearGradient(p.from[0], p.from[1], p.to[0], p.to[1]);
  for (const [at, color] of p.stops) grad.addColorStop(at, color);
  return grad;
}

const roleFont = (crew: Crew, role: string): FontValue =>
  role === 'name'
    ? crew.fonts.name
    : role === 'quote'
      ? crew.fonts.quote
      : role === 'impact'
        ? crew.fonts.impact
        : BADGE_FONT;

function fontAt(crew: Crew, role: string, size: number, weight?: number): string {
  const f = roleFont(crew, role);
  return fontCss(weight ? { ...f, weight } : f, size);
}

function placeFigure(
  c2d: Ctx,
  p: Performer,
  img: Pic,
  eye: readonly [number, number],
  reach: number,
): void {
  const k = (reach * p.size) / (p.headLen * p.image.height);
  const w = p.image.width * k;
  const h = p.image.height * k;
  c2d.drawImage(img, eye[0] - (w * p.eyeX) / 100, eye[1] - (h * p.eyeY) / 100, w, h);
}

/** 邊緣淡出：在和主畫布同樣大小的暫存畫布上畫好、套上兩個方向的遮罩再貼回來 */
function fadedFigure(
  c2d: Ctx,
  p: Performer,
  layer: Extract<Layer, { type: 'figure' }>,
  fade: Fade,
): void {
  const cw = c2d.canvas.width;
  const ch = c2d.canvas.height;
  const off = makeCanvas(cw, ch);
  const o = off.getContext('2d') as Ctx | null;
  if (!o) return;
  const m = c2d.getTransform();
  o.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  o.imageSmoothingQuality = 'high';
  placeFigure(o, p, p.image, layer.eye, layer.reach);
  o.globalCompositeOperation = 'destination-in';
  for (const [axis, stops] of [
    ['x', fade.x],
    ['y', fade.y],
  ] as const) {
    const grad =
      axis === 'x' ? o.createLinearGradient(0, 0, W, 0) : o.createLinearGradient(0, 0, 0, H);
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(0,0,0,${a})`);
    o.fillStyle = grad;
    o.fillRect(0, 0, W, H);
  }
  c2d.save();
  c2d.setTransform(1, 0, 0, 1, 0, 0);
  c2d.globalAlpha *= layer.alpha ?? 1;
  c2d.drawImage(off, 0, 0);
  c2d.restore();
}

function paintOne(c2d: Ctx, layer: Layer, crew: Crew): void {
  switch (layer.type) {
    case 'group': {
      c2d.save();
      if (layer.at) c2d.translate(layer.at[0], layer.at[1]);
      if (layer.turn) c2d.rotate(layer.turn);
      if (layer.zoom && layer.zoom !== 1) c2d.scale(layer.zoom, layer.zoom);
      if (layer.alpha !== undefined) c2d.globalAlpha *= layer.alpha;
      if (layer.clip) {
        pathOf(c2d, layer.clip);
        c2d.clip();
      }
      if (c2d.globalAlpha > 0) for (const c of layer.children) paintOne(c2d, c, crew);
      c2d.restore();
      return;
    }
    case 'shape': {
      c2d.save();
      if (layer.alpha !== undefined) c2d.globalAlpha *= layer.alpha;
      pathOf(c2d, layer.outline);
      if (layer.fill) {
        c2d.fillStyle = paintOf(c2d, layer.fill);
        c2d.fill();
      }
      if (layer.pen) {
        c2d.strokeStyle = paintOf(c2d, layer.pen.paint);
        c2d.lineWidth = layer.pen.width;
        c2d.lineCap = layer.pen.round ? 'round' : 'butt';
        c2d.lineJoin = layer.pen.round ? 'round' : 'miter';
        c2d.stroke();
      }
      c2d.restore();
      return;
    }
    case 'figure': {
      const p = layer.who === 'hero' ? crew.hero : crew.rival;
      if (!p) return;
      c2d.save();
      c2d.imageSmoothingQuality = 'high';
      if (layer.fade) fadedFigure(c2d, p, layer, layer.fade);
      else {
        if (layer.alpha !== undefined) c2d.globalAlpha *= layer.alpha;
        placeFigure(c2d, p, p.image, layer.eye, layer.reach);
      }
      if (layer.white > 0 && p.white) {
        c2d.globalAlpha *= layer.white;
        placeFigure(c2d, p, p.white, layer.eye, layer.reach);
      }
      c2d.restore();
      return;
    }
    case 'text': {
      if (!layer.text) return;
      c2d.save();
      let size = layer.size;
      if (layer.fit) {
        const all = layer.fit.peers?.filter(Boolean) ?? [layer.text];
        const widest = () => {
          c2d.font = fontAt(crew, layer.role, size, layer.weight);
          return Math.max(...all.map((s) => c2d.measureText(s).width));
        };
        while (widest() > layer.fit.width && size > layer.fit.min) size -= layer.fit.step;
      }
      c2d.font = fontAt(crew, layer.role, size, layer.weight);
      c2d.textAlign = layer.align ?? 'left';
      c2d.textBaseline = layer.baseline ?? 'alphabetic';
      c2d.lineJoin = 'round';
      const [x, y] = layer.at;
      for (const pen of layer.pens ?? []) {
        c2d.strokeStyle = paintOf(c2d, pen.paint);
        c2d.lineWidth = pen.width;
        c2d.strokeText(layer.text, x, y);
      }
      c2d.fillStyle = paintOf(c2d, layer.fill);
      c2d.fillText(layer.text, x, y);
      c2d.restore();
      return;
    }
    case 'tag': {
      c2d.save();
      c2d.font = fontAt(crew, 'tag', layer.size);
      const { height, pad, slant } = layer.plate;
      const [x, y] = layer.at;
      const right = x + slant + c2d.measureText(layer.text).width + pad;
      c2d.beginPath();
      c2d.moveTo(x + slant, y);
      c2d.lineTo(right + slant, y);
      c2d.lineTo(right, y + height);
      c2d.lineTo(x, y + height);
      c2d.closePath();
      c2d.fillStyle = paintOf(c2d, layer.fill);
      c2d.fill();
      c2d.textAlign = 'left';
      c2d.textBaseline = 'alphabetic';
      c2d.fillStyle = paintOf(c2d, layer.ink);
      c2d.fillText(layer.text, x + slant + 12, y + height - 10);
      c2d.restore();
      return;
    }
    case 'streaks': {
      const [bx, by, bw, bh] = layer.box;
      const loop = bw + 800;
      c2d.save();
      for (const s of STREAKS) {
        const run = (((s.x - layer.t * s.speed) % loop) + loop) % loop;
        c2d.globalAlpha = s.tint === 3 ? 0.55 : 0.8;
        c2d.fillStyle = layer.tints[s.tint] ?? '#ffffff';
        c2d.fillRect(bx + run - 400, by + bh * s.y, s.len, s.h);
      }
      c2d.restore();
      return;
    }
    case 'stamp': {
      if (!layer.chars.length) return;
      c2d.save();
      let size = layer.size;
      const lay = () => {
        c2d.font = fontAt(crew, 'impact', size);
        let x = 0;
        const xs = layer.chars.map((ch, i) => {
          const at = x;
          x +=
            c2d.measureText(ch).width +
            (i < layer.chars.length - 1 ? (layer.gaps[i] ?? 0) * size : 0);
          return at;
        });
        return { xs, total: x };
      };
      let row = lay();
      while (row.total > layer.width && size > 20) {
        size -= 6;
        row = lay();
      }
      c2d.translate(layer.at[0], layer.at[1]);
      c2d.scale(layer.zoom, layer.zoom);
      c2d.globalAlpha *= layer.alpha;
      c2d.lineJoin = 'round';
      c2d.lineWidth = size * 0.07;
      c2d.strokeStyle = '#ffffff';
      c2d.textBaseline = 'middle';
      c2d.textAlign = 'left';
      const left = -row.total / 2;
      layer.chars.forEach((ch, i) => {
        c2d.strokeText(ch, left + row.xs[i], 0);
      });
      c2d.fillStyle = INK;
      layer.chars.forEach((ch, i) => {
        c2d.fillText(ch, left + row.xs[i], 0);
      });
      if (layer.splash)
        for (const d of SPLASH) {
          c2d.beginPath();
          c2d.arc(row.total * 0.32 + d.x * 1.6, -size * 0.36 + d.y, d.r, 0, Math.PI * 2);
          c2d.fill();
        }
      c2d.restore();
      return;
    }
  }
}

/** 畫一格：清空（透明）→ 以 1280 × 720 的座標畫圖層 → 有底色時鋪在最下面 */
export function paintFrame(
  c2d: Ctx,
  width: number,
  height: number,
  layers: readonly Layer[],
  crew: Crew,
  backdrop: string | null = null,
): void {
  c2d.save();
  c2d.setTransform(1, 0, 0, 1, 0, 0);
  c2d.globalAlpha = 1;
  c2d.globalCompositeOperation = 'source-over';
  c2d.clearRect(0, 0, width, height);
  c2d.setTransform(width / W, 0, 0, height / H, 0, 0);
  for (const l of layers) paintOne(c2d, l, crew);
  if (backdrop) {
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.globalAlpha = 1;
    c2d.globalCompositeOperation = 'destination-over';
    c2d.fillStyle = backdrop;
    c2d.fillRect(0, 0, width, height);
  }
  c2d.restore();
}
