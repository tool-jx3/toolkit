/**
 * 版型共用的小工具：圖片格（空格子、背景色、出處）、文字、左右鏡像、主題背景（程式繪製）。
 */
import type { FontValue } from '@/core/fonts';
import { makeCanvas } from '@/core/image';
import type { HitTarget, Radius, SceneNode, Shadow, TextFont, TextNode } from '@/core/scene';
import { citeId, type Draft, type SceneEnv, str } from '../model';

export const SANS = 'Noto Sans TC';
export const SERIF = 'Noto Serif TC';

export const sansFont = (weight = 700): FontValue => ({ source: 'google', family: SANS, weight });

/** FontValue → 場景的字型 */
export const sceneFont = (f: FontValue, size: number): TextFont => ({
  family: f.family || SANS,
  weight: f.weight,
  size,
});

export const SOFT_SHADOW: Shadow = { color: 'rgba(35,23,5,0.22)', blur: 14, y: 2 };
export const CARD_SHADOW: Shadow = { color: 'rgba(30,30,40,0.18)', blur: 10, y: 3 };

/** 左右鏡像：右邊的角色 x' ＝ 畫布寬 − x − 寬 */
export const mirrorX = (side: string, x: number, w: number, total = 1920): number =>
  side === 'right' ? total - x - w : x;

export interface SlotStyle {
  /** 空格子的底色、「＋」的顏色 */
  empty: string;
  plus: string;
  shadow?: Shadow;
  /** 出處的對齊（背景全幅圖靠右） */
  citeAlign?: 'center' | 'right';
  /** 出處往上的距離（預設 20） */
  citeBottom?: number;
  /** 出處的左右內縮 */
  citeInset?: number;
}

export const DARK_SLOT: SlotStyle = { empty: '#3a3a40', plus: '#ffffff' };
export const LIGHT_SLOT: SlotStyle = { empty: '#ececec', plus: '#a3a3a3' };

/**
 * 圖片格：底（空的時是 empty 色；有圖時依「背景」勾選用背景色，否則透明）＋圖（依形狀裁切、蓋滿）＋空的時「＋」＋出處。
 */
export function slotNodes(
  env: SceneEnv,
  d: Draft,
  o: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    shape?: 'rect' | 'round' | 'circle';
    radius?: Radius;
    hit: HitTarget;
    style: SlotStyle;
    /** 背景勾選框與背景色的欄位 id */
    bg?: { on: string; color: string };
  },
): SceneNode[] {
  const img = env.image(o.id);
  const circle = o.shape === 'circle';
  const radius = o.shape === 'round' ? (o.radius ?? 14) : undefined;
  const bgOn = !!o.bg && d.v[o.bg.on] === true;
  const fill = !img ? o.style.empty : bgOn ? str(d.v, o.bg?.color ?? '') || '#ffffff' : undefined;
  const nodes: SceneNode[] = [];
  nodes.push({
    kind: 'rect',
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    circle,
    radius,
    fill: fill ?? 'rgba(0,0,0,0)',
    shadow: fill && o.style.shadow ? o.style.shadow : undefined,
    hit: o.hit,
  });
  if (img)
    nodes.push({ kind: 'image', x: o.x, y: o.y, w: o.w, h: o.h, image: img, circle, radius });
  else
    nodes.push({
      kind: 'text',
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      text: '+',
      font: { family: SANS, weight: 300, size: 30 },
      color: o.style.plus,
      align: 'center',
      valign: 'middle',
    });
  const cite = str(d.v, citeId(o.id)).trim();
  if (img && cite) nodes.push(citeNode(cite, o.x, o.y, o.w, o.h, o.style));
  return nodes;
}

/** 出處：「ⓒ 出處」約 14 px 灰字白邊，在格子下緣往上約 20 px */
export function citeNode(
  cite: string,
  x: number,
  y: number,
  w: number,
  h: number,
  style: Pick<SlotStyle, 'citeAlign' | 'citeBottom' | 'citeInset'> = {},
  size = 14,
): TextNode {
  const inset = style.citeInset ?? (style.citeAlign === 'right' ? 10 : 6);
  return {
    kind: 'text',
    x: x + inset,
    y: y + h - (style.citeBottom ?? 20),
    w: w - inset * 2,
    text: `ⓒ ${cite}`,
    font: { family: SANS, weight: 400, size },
    color: '#5f5f5f',
    stroke: { color: '#ffffff', width: 2 },
    align: style.citeAlign ?? 'center',
    shrink: 0.6,
  };
}

/** 一般文字節點 */
export function text(
  x: number,
  y: number,
  w: number | undefined,
  h: number | undefined,
  s: string,
  font: TextFont,
  color: string,
  more: Partial<TextNode> = {},
): TextNode {
  return { kind: 'text', x, y, w, h, text: s, font, color, ...more };
}

/* ---------- 主題背景（程式繪製，只畫一次） ---------- */

const themeCache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

export type ThemeKind = 'duo-light' | 'duo-dark' | 'post-light' | 'post-dark';

/** 主題背景圖（1920 × 1080）：柔和的漸層＋淡淡的花紋 */
export function themeImage(kind: ThemeKind): HTMLCanvasElement | OffscreenCanvas {
  const hit = themeCache.get(kind);
  if (hit) return hit;
  const W = 1920;
  const H = 1080;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const dark = kind.endsWith('dark');
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (kind === 'duo-light') {
    g.addColorStop(0, '#f7f4ef');
    g.addColorStop(1, '#e8e6f1');
  } else if (kind === 'duo-dark') {
    g.addColorStop(0, '#1b1d24');
    g.addColorStop(1, '#2b2433');
  } else if (kind === 'post-light') {
    g.addColorStop(0, '#f4f4f6');
    g.addColorStop(1, '#ebeef2');
  } else {
    g.addColorStop(0, '#202227');
    g.addColorStop(1, '#2c2f37');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  /* 大片柔光 */
  const glow = (x: number, y: number, r: number, color: string) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  if (kind.startsWith('duo')) {
    glow(1500, 180, 620, dark ? 'rgba(140,110,200,0.22)' : 'rgba(255,255,255,0.75)');
    glow(300, 950, 700, dark ? 'rgba(70,120,170,0.18)' : 'rgba(214,206,236,0.55)');
    /* 細斜線 */
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(80,70,110,0.05)';
    ctx.lineWidth = 2;
    for (let x = -H; x < W; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + H, 0);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    glow(260, 160, 560, dark ? 'rgba(120,140,190,0.16)' : 'rgba(255,255,255,0.8)');
    glow(1700, 980, 640, dark ? 'rgba(170,110,140,0.14)' : 'rgba(220,226,236,0.7)');
    /* 小圓點 */
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(60,70,90,0.06)';
    for (let y = 18; y < H; y += 36)
      for (let x = (y / 36) % 2 ? 18 : 36; x < W; x += 36) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  themeCache.set(kind, c);
  return c;
}
