/**
 * 花紋橫幅（1500 × 500）：後方背景色＋重複的花紋（格紋、蘇格蘭格紋、單色）＋可以重複鋪滿或單張的圖片。
 * 花紋與圖片都以畫布中心為基準縮放、旋轉；圖片下面墊一層白色剪影（降低不透明度時往白色淡出）。
 */
import { makeCanvas } from '@/core/image';
import { blurCanvas, type SceneNode, sourceSize } from '@/core/scene';
import {
  bool,
  type Draft,
  hit,
  num,
  type SceneEnv,
  str,
  type TemplateDef,
  type Value,
} from '../model';
import { T } from '../strings';
import { citeNode } from './kit';

const L = T.banner;
export const BANNER_W = 1500;
export const BANNER_H = 500;
const W = BANNER_W;
const H = BANNER_H;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 格紋：80 px 磁磚，第一色鋪底、第二色以 50% 畫左半與上半 */
export function checkTile(c1: string, c2: string): AnyCanvas {
  const c = makeCanvas(80, 80);
  const ctx = c.getContext('2d') as Ctx;
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, 80, 80);
  ctx.fillStyle = c2;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, 40, 80);
  ctx.fillRect(0, 0, 80, 40);
  return c;
}

/** 蘇格蘭格紋：120 px 磁磚，粗線色 40% 的直帶（寬 25）與橫帶（寬 28），細線色 2 px 虛線（4 px 間隔） */
export function tartanTile(thick: string, thin: string): AnyCanvas {
  const c = makeCanvas(120, 120);
  const ctx = c.getContext('2d') as Ctx;
  ctx.fillStyle = thick;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(15, 0, 25, 120);
  ctx.fillRect(0, 18, 120, 28);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = thin;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(90, 0);
  ctx.lineTo(90, 120);
  ctx.moveTo(0, 90);
  ctx.lineTo(120, 90);
  ctx.stroke();
  return c;
}

/** 圖片的中心位置：50 是正中央，每差 1 移動畫布寬（高）的 1/50 */
export const imageCenter = (x: number, y: number) => ({
  x: W / 2 + ((x - 50) / 50) * W,
  y: H / 2 + ((y - 50) / 50) * H,
});

const tileCache = new Map<string, AnyCanvas>();
function tileFor(kind: string, a: string, b: string): AnyCanvas | null {
  if (kind === 'solid') return null;
  const key = `${kind}|${a}|${b}`;
  let t = tileCache.get(key);
  if (!t) {
    if (tileCache.size > 20) tileCache.clear();
    t = kind === 'tartan' ? tartanTile(a, b) : checkTile(a, b);
    tileCache.set(key, t);
  }
  return t;
}

/** 以 (cx, cy) 為中心旋轉、縮放後鋪滿整張畫布 */
function tiled(
  src: CanvasImageSource,
  cx: number,
  cy: number,
  deg: number,
  s: number,
  ox = 0,
  oy = 0,
): AnyCanvas {
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d') as Ctx;
  const pat = ctx.createPattern(src, 'repeat');
  if (!pat) return c;
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  const r = (Math.hypot(W, H) + Math.abs(cx - W / 2) * 2 + Math.abs(cy - H / 2) * 2) / s;
  ctx.fillRect(-r - ox, -r - oy, r * 2, r * 2);
  return c;
}

const silhouetteCache = new WeakMap<object, AnyCanvas>();
/** 白色剪影（不透明處塗白） */
function silhouette(img: CanvasImageSource): AnyCanvas {
  const hit0 = silhouetteCache.get(img as object);
  if (hit0) return hit0;
  const { width, height } = sourceSize(img);
  const c = makeCanvas(width, height);
  const ctx = c.getContext('2d') as Ctx;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  silhouetteCache.set(img as object, c);
  return c;
}

/** 圖片層（含白色剪影）：重複鋪滿或單張 */
function imageLayer(img: CanvasImageSource, v: Record<string, Value>, white: boolean): AnyCanvas {
  const src = white ? silhouette(img) : img;
  const { width, height } = sourceSize(img);
  const s = num(v, 'c.imgScale', 100) / 100;
  const deg = num(v, 'c.imgRotate', 0);
  const c0 = imageCenter(num(v, 'c.imgX', 50), num(v, 'c.imgY', 50));
  if (bool(v, 'c.repeat')) return tiled(src, c0.x, c0.y, deg, s, -width / 2, -height / 2);
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(c0.x, c0.y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.drawImage(src, -width / 2, -height / 2, width, height);
  return c;
}

function defaults(): Record<string, Value> {
  return {
    'c.kind': 'check',
    'c.check1': '#ffffff',
    'c.check2': '#d1c2fa',
    'c.thick': '#83c76f',
    'c.thin': '#9cf1c2',
    'c.scale': 100,
    'c.rotate': 45,
    'c.opacity': 70,
    'c.blur': false,
    'c.back': '#ffffff',
    'c.repeat': true,
    'c.imgScale': 100,
    'c.imgX': 50,
    'c.imgY': 50,
    'c.imgRotate': 0,
    'c.imgOpacity': 100,
    'c.imgBlur': false,
  };
}

function scene(d: Draft, env: SceneEnv): SceneNode[] {
  const v = d.v;
  const kind = str(v, 'c.kind') || 'check';
  const hp = hit('common', 'pattern', `${L.main}：${L.pattern}`);
  const nodes: SceneNode[] = [
    { kind: 'rect', x: 0, y: 0, w: W, h: H, fill: str(v, 'c.back'), hit: hp },
  ];
  const ps = num(v, 'c.scale', 100) / 100;
  const tile =
    kind === 'tartan'
      ? tileFor(kind, str(v, 'c.thick'), str(v, 'c.thin'))
      : tileFor(kind, str(v, 'c.check1'), str(v, 'c.check2'));
  if (tile && ps > 0) {
    const deg = num(v, 'c.rotate', 45);
    const blur = bool(v, 'c.blur');
    const opacity = num(v, 'c.opacity', 70) / 100;
    nodes.push({
      kind: 'custom',
      opacity,
      draw: (ctx) => {
        const layer = tiled(tile, W / 2, H / 2, deg, ps);
        if (blur) blurCanvas(layer, 5);
        ctx.drawImage(layer, 0, 0);
      },
    });
  }
  const img = env.image('c.img');
  const is = num(v, 'c.imgScale', 100) / 100;
  if (img && is > 0) {
    const blur = bool(v, 'c.imgBlur');
    const opacity = num(v, 'c.imgOpacity', 100) / 100;
    const hi = hit('common', 'image', `${L.main}：${L.image}`);
    let box = { x: 0, y: 0, width: W, height: H };
    if (!bool(v, 'c.repeat')) {
      const { width, height } = sourceSize(img);
      const c0 = imageCenter(num(v, 'c.imgX', 50), num(v, 'c.imgY', 50));
      const a = (num(v, 'c.imgRotate', 0) * Math.PI) / 180;
      const bw = (Math.abs(width * Math.cos(a)) + Math.abs(height * Math.sin(a))) * is;
      const bh = (Math.abs(width * Math.sin(a)) + Math.abs(height * Math.cos(a))) * is;
      const x = Math.max(0, c0.x - bw / 2);
      const y = Math.max(0, c0.y - bh / 2);
      box = {
        x,
        y,
        width: Math.max(0, Math.min(W, c0.x + bw / 2) - x),
        height: Math.max(0, Math.min(H, c0.y + bh / 2) - y),
      };
    }
    nodes.push(
      {
        kind: 'custom',
        box,
        hit: box.width > 0 && box.height > 0 ? hi : undefined,
        draw: (ctx) => {
          const white = imageLayer(img, v, true);
          if (blur) blurCanvas(white, 2.5);
          ctx.drawImage(white, 0, 0);
        },
      },
      {
        kind: 'custom',
        opacity,
        draw: (ctx) => {
          const layer = imageLayer(img, v, false);
          if (blur) blurCanvas(layer, 2.5);
          ctx.drawImage(layer, 0, 0);
        },
      },
    );
    const cite = str(v, 'cite:c.img').trim();
    if (cite) nodes.push(citeNode(cite, 0, 0, W, H));
  }
  return nodes;
}

export const banner: TemplateDef = {
  id: 'pattern-banner',
  name: L.name,
  tag: '橫幅',
  tip: L.tip,
  kind: 'fixed',
  initial: () => ({ v: defaults(), touched: {}, images: {}, stickers: [] }),
  size: () => ({ width: W, height: H }),
  sides: () => [
    {
      id: 'common',
      label: L.main,
      groups: [
        {
          id: 'pattern',
          label: L.pattern,
          fields: [
            {
              id: 'c.kind',
              label: L.kind,
              type: 'radio',
              options: [
                { value: 'check', label: L.check },
                { value: 'tartan', label: L.tartan },
                { value: 'solid', label: L.solid },
              ],
            },
            {
              id: 'c.check1',
              label: L.checkBase,
              type: 'color',
              row: 'k',
              when: { id: 'c.kind', is: 'check' },
            },
            {
              id: 'c.check2',
              label: L.checkLine,
              type: 'color',
              row: 'k',
              when: { id: 'c.kind', is: 'check' },
            },
            {
              id: 'c.thick',
              label: L.thick,
              type: 'color',
              row: 't',
              when: { id: 'c.kind', is: 'tartan' },
            },
            {
              id: 'c.thin',
              label: L.thin,
              type: 'color',
              row: 't',
              when: { id: 'c.kind', is: 'tartan' },
            },
            {
              id: 'c.scale',
              label: L.scale,
              type: 'number',
              min: 0,
              max: 200,
              unit: '%',
              when: { id: 'c.kind', not: 'solid' },
            },
            {
              id: 'c.rotate',
              label: L.rotate,
              type: 'number',
              min: -180,
              max: 180,
              unit: '°',
              when: { id: 'c.kind', not: 'solid' },
            },
            {
              id: 'c.opacity',
              label: L.opacity,
              type: 'number',
              min: 0,
              max: 100,
              unit: '%',
              when: { id: 'c.kind', not: 'solid' },
            },
            { id: 'c.blur', label: L.blur, type: 'checkbox', when: { id: 'c.kind', not: 'solid' } },
            { id: 'c.back', label: L.back, type: 'color' },
          ],
        },
        {
          id: 'image',
          label: L.image,
          slots: [{ id: 'c.img', width: W, height: H, free: true }],
          fields: [
            { id: 'c.repeat', label: L.repeat, type: 'checkbox' },
            { id: 'c.imgScale', label: L.imgScale, type: 'number', min: 0, max: 200, unit: '%' },
            { id: 'c.imgX', label: L.imgX, type: 'number', min: 0, max: 100 },
            { id: 'c.imgY', label: L.imgY, type: 'number', min: 0, max: 100 },
            {
              id: 'c.imgRotate',
              label: L.imgRotate,
              type: 'number',
              min: -180,
              max: 180,
              unit: '°',
            },
            {
              id: 'c.imgOpacity',
              label: L.imgOpacity,
              type: 'number',
              min: 0,
              max: 100,
              unit: '%',
            },
            { id: 'c.imgBlur', label: L.imgBlur, type: 'checkbox' },
          ],
        },
      ],
    },
  ],
  defaults: () => defaults(),
  scene,
  stickerArea: () => ({ x: 0, y: 0, width: W, height: H }),
};
