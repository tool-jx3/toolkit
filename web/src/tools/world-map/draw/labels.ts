/**
 * 地圖上的字：國名、據點名、地名・備註、外框的標題。
 * - 三種字型：明朝風（思源宋體）、黑體（思源黑體）、圓體（粉圓）；國與地名可以個別指定，或跟著整張地圖。
 *   據點名在明朝風的地圖用黑體（和原作一樣小字用無襯線），其他跟著地圖。
 * - 弧形文字：弧度 −100～100；字沿著一條二次曲線排（曲線的寬＝字寬的估計＋3 個字，至少 160 px，
 *   彎曲量＝弧度 × 1.4，兩端低 0.32、中間高 0.68 的比例），整串字的中心在曲線的正中間。
 * - 字的外圈用陸地色描邊（國名 4 px、透明度 0.65；地名 3 px、0.8；據點名 4 px），壓在地圖上也看得清楚。
 */
import { fontFamilyCss } from '@/core/fonts';
import { layoutOnPath } from '@/core/typeset/onpath';
import type { FontStyle, LabelFont, Pt } from '../model/types';

export const FONT_FAMILY: Record<FontStyle, string> = {
  serif: 'Noto Serif TC',
  sans: 'Noto Sans TC',
  rounded: 'Huninn',
};

const SERIF_STACK = '"Noto Serif TC", "Songti TC", "PMingLiU", "MingLiU", serif';

export function familyCss(style: FontStyle): string {
  return style === 'serif' ? SERIF_STACK : fontFamilyCss(FONT_FAMILY[style]);
}

export const labelStyle = (mapFont: FontStyle, own: LabelFont): FontStyle =>
  own === 'auto' ? mapFont : own;

/** 據點名的字型：明朝風的地圖用黑體，其他跟著地圖 */
export const nameStyle = (mapFont: FontStyle): FontStyle =>
  mapFont === 'serif' ? 'sans' : mapFont;

export interface LabelSpec {
  text: string;
  x: number;
  y: number;
  size: number;
  style: FontStyle;
  weight?: number;
  /** 度 */
  rotation?: number;
  curve?: number;
  tracking?: number;
  fill: string;
  halo?: string;
  haloWidth?: number;
  haloAlpha?: number;
  alpha?: number;
}

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, s: LabelSpec) {
  const weight = s.style === 'rounded' ? 400 : (s.weight ?? 400);
  ctx.font = `${weight} ${s.size}px ${familyCss(s.style)}`;
}

/** 弧形文字的曲線（以字的中心為原點） */
export function arcCurve(text: string, size: number, tracking: number, curve: number): Pt[] {
  const est = Array.from(text).reduce(
    (w, ch) => w + size * ((ch.codePointAt(0) ?? 0) < 256 ? 0.75 : 1.1) + tracking,
    0,
  );
  const half = Math.max(est + size * 3, 160) / 2;
  const bend = curve * 1.4;
  const a = { x: -half, y: bend * 0.32 };
  const c = { x: 0, y: -bend * 0.68 };
  const b = { x: half, y: bend * 0.32 };
  const out: Pt[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    });
  }
  return out;
}

interface Glyph {
  ch: string;
  x: number;
  y: number;
  angle: number;
}

function glyphsOnArc(ctx: Ctx, s: LabelSpec): Glyph[] {
  const chars = Array.from(s.text);
  const tracking = s.tracking ?? 0;
  const adv = chars.map((ch) => ctx.measureText(ch).width);
  const curve = arcCurve(s.text, s.size, tracking, s.curve ?? 0);
  let len = 0;
  for (let i = 1; i < curve.length; i++)
    len += Math.hypot(curve[i].x - curve[i - 1].x, curve[i].y - curve[i - 1].y);
  const total = adv.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  const places = layoutOnPath(curve, adv, {
    closed: false,
    tracking,
    start: len / 2 - total / 2,
    offset: s.size * 0.32,
  });
  return places.map((p, i) => ({ ch: chars[i], x: p.x, y: p.y, angle: p.angle }));
}

export function drawLabel(ctx: Ctx, s: LabelSpec): void {
  if (!s.text) return;
  ctx.save();
  setFont(ctx, s);
  ctx.translate(s.x, s.y);
  if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.lineJoin = 'round';
  ctx.globalAlpha *= s.alpha ?? 1;
  const halo = (draw: () => void) => {
    if (!s.halo || !s.haloWidth) return;
    ctx.save();
    ctx.globalAlpha *= s.haloAlpha ?? 1;
    ctx.strokeStyle = s.halo;
    ctx.lineWidth = s.haloWidth;
    draw();
    ctx.restore();
  };
  if (!s.curve) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const tracking = s.tracking ?? 0;
    if (tracking) ctx.letterSpacing = `${tracking}px`;
    /* 字距加在每個字後面：往右多出的一個字距扣回來，整串還是置中 */
    const dx = tracking / 2;
    halo(() => ctx.strokeText(s.text, dx, 0));
    ctx.fillStyle = s.fill;
    ctx.fillText(s.text, dx, 0);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyphs = glyphsOnArc(ctx, s);
    const each = (fn: (g: Glyph) => void) => {
      for (const g of glyphs) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);
        fn(g);
        ctx.restore();
      }
    };
    halo(() => each((g) => ctx.strokeText(g.ch, 0, 0)));
    ctx.fillStyle = s.fill;
    each((g) => ctx.fillText(g.ch, 0, 0));
  }
  ctx.restore();
}

/** 字所佔的範圍（點選、拖曳用）：四個角，地圖座標 */
export function labelQuad(ctx: Ctx, s: LabelSpec): Pt[] {
  if (!s.text) return [];
  ctx.save();
  setFont(ctx, s);
  const tracking = s.tracking ?? 0;
  let x0: number;
  let x1: number;
  let y0: number;
  let y1: number;
  if (!s.curve) {
    const w = ctx.measureText(s.text).width + tracking * Array.from(s.text).length;
    x0 = -w / 2;
    x1 = w / 2;
    y0 = -s.size * 0.88;
    y1 = s.size * 0.22;
  } else {
    const glyphs = glyphsOnArc(ctx, s);
    const xs = glyphs.map((g) => g.x);
    const ys = glyphs.map((g) => g.y);
    x0 = Math.min(...xs) - s.size * 0.6;
    x1 = Math.max(...xs) + s.size * 0.6;
    y0 = Math.min(...ys) - s.size * 0.6;
    y1 = Math.max(...ys) + s.size * 0.6;
  }
  ctx.restore();
  const a = ((s.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => ({ x: s.x + x * cos - y * sin, y: s.y + x * sin + y * cos }));
}
