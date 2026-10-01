/**
 * 狀態條用的圖（全部是本專案自繪的 SVG，寫成 data URI 放進 CSS）：
 * - 符號：13 種單色圖示（以 mask 的方式用條的顏色 1 上色）
 * - 道具：6 種，每種 5 個樣子（完好、三級逐漸損壞、毀壞），直排成一張 24 × 120 的圖
 * - 裂痕：每條固定的撞擊點（依條的序號決定形狀，開頁、改數值都不變）
 * - 條本體外框：沿輪廓內側的單線／雙線
 * 純函式，不依賴 DOM。
 */
import { darken, lighten, num } from '@/core/css';
import type { ItemKind, SymbolKind } from './settings';

/** SVG → data URI（只跳脫必要的字元，比 encodeURIComponent 短） */
export function svgUri(svg: string): string {
  const body = svg
    .replace(/\s*\n\s*/g, '')
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `data:image/svg+xml,${body}`;
}

const f = (v: number) => num(v, 1);

/** 圓（兩段弧） */
const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

/** 正 n 角星 */
function starPath(cx: number, cy: number, R: number, r: number, n = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rad = i % 2 ? r : R;
    pts.push(`${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join('L')}Z`;
}

/* ---------- 符號（24 × 24） ---------- */

interface Glyph {
  d: string;
  evenodd?: boolean;
}

const HEART =
  'M12 21C5.8 16.4 2.2 12.9 2.2 8.7C2.2 5.7 4.5 3.5 7.3 3.5C9.1 3.5 10.9 4.5 12 6.1C13.1 4.5 14.9 3.5 16.7 3.5C19.5 3.5 21.8 5.7 21.8 8.7C21.8 12.9 18.2 16.4 12 21Z';
const SHIELD = 'M12 2L20.2 5.2V11C20.2 16.1 16.7 19.9 12 22C7.3 19.9 3.8 16.1 3.8 11V5.2Z';
const GEM = 'M7 3.5H17L21.5 9L12 21.5L2.5 9Z';

export const SYMBOLS: Record<Exclude<SymbolKind, 'none'>, Glyph> = {
  heart: { d: HEART },
  star: { d: starPath(12, 12.8, 10.6, 4.4) },
  drop: { d: 'M12 2.2C12 2.2 4.8 10.4 4.8 15A7.2 7.2 0 0 0 19.2 15C19.2 10.4 12 2.2 12 2.2Z' },
  bolt: { d: 'M13.6 1.8L4.4 13.6H11L9.6 22.2L19.6 9.6H13Z' },
  shield: { d: SHIELD },
  sword: {
    d:
      'M10.8 3L12 1.4L13.2 3V14H10.8ZM6.4 14H17.6V16.3H6.4ZM10.9 16.3H13.1V19.6H10.9Z' +
      circle(12, 21, 1.9),
  },
  flame: {
    d: 'M12 1.8C13.2 6 18.2 8.2 18.2 14.2A6.2 6.2 0 0 1 5.8 14.2C5.8 10.8 7.8 9.2 8.6 6.6C10 8 10.4 9.6 10.3 11C12 9.6 12.8 6.2 12 1.8Z',
  },
  skull: {
    d:
      'M12 2.4C7 2.4 3.4 5.9 3.4 10.6C3.4 13.4 4.8 15.5 7 16.7V19.8C7 20.8 7.8 21.6 8.8 21.6H15.2C16.2 21.6 17 20.8 17 19.8V16.7C19.2 15.5 20.6 13.4 20.6 10.6C20.6 5.9 17 2.4 12 2.4Z' +
      circle(8.9, 11.2, 2.3) +
      circle(15.1, 11.2, 2.3) +
      'M12 14.2L13.2 16.3H10.8ZM10.1 18.4H10.9V21.6H10.1ZM13.1 18.4H13.9V21.6H13.1Z',
    evenodd: true,
  },
  moon: { d: 'M15.2 2.6A9.6 9.6 0 1 0 21.4 16.2A7.6 7.6 0 0 1 15.2 2.6Z' },
  clover: {
    d:
      circle(12, 6.6, 4.1) +
      circle(6.6, 12, 4.1) +
      circle(17.4, 12, 4.1) +
      circle(12, 17.4, 4.1) +
      'M12.6 11.4L20.6 21L19.4 22L11.4 12.6Z',
  },
  eye: {
    d:
      'M1.8 12C4.8 6.6 8.3 4.6 12 4.6C15.7 4.6 19.2 6.6 22.2 12C19.2 17.4 15.7 19.4 12 19.4C8.3 19.4 4.8 17.4 1.8 12Z' +
      circle(12, 12, 4.4) +
      circle(12, 12, 2.1),
    evenodd: true,
  },
  gem: { d: `${GEM}M3.5 8.6H20.5V9.6H3.5Z`, evenodd: true },
  hourglass: {
    d: 'M5.6 2.2H18.4V4.4H17.2C17.2 8 14.6 10.2 13.3 12C14.6 13.8 17.2 16 17.2 19.6H18.4V21.8H5.6V19.6H6.8C6.8 16 9.4 13.8 10.7 12C9.4 10.2 6.8 8 6.8 4.4H5.6Z',
  },
};

/** 符號的 SVG（黑色；當作 mask 用，顏色由 CSS 的背景色決定） */
export function symbolSvg(kind: Exclude<SymbolKind, 'none'>): string {
  const g = SYMBOLS[kind];
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${g.d}'${g.evenodd ? " fill-rule='evenodd'" : ''}/></svg>`;
}

/* ---------- 道具（每格 24 × 24，5 格直排） ---------- */

export const ITEM_STATES = 5;

interface ItemArt {
  /** 外形（上色、裁切裂痕用） */
  body: string;
  /** 外形之上的細節（顏色由 c1、c2 決定） */
  extra: (c1: string, c2: string) => string;
  /** 高光的位置 */
  shine: [number, number];
}

const ITEMS: Record<Exclude<ItemKind, 'none'>, ItemArt> = {
  heart: {
    body: HEART,
    extra: () => '',
    shine: [7.4, 7.6],
  },
  shield: {
    body: SHIELD,
    extra: (c1) =>
      `<path d='M12 4.4L18 6.8V11C18 14.9 15.5 17.9 12 19.6Z' fill='${lighten(c1, 0.25)}' opacity='.45'/>`,
    shine: [8, 7.4],
  },
  gem: {
    body: GEM,
    extra: (c1) =>
      `<path d='M2.5 9H21.5M7 3.5L9.4 9L12 21.5L14.6 9L17 3.5M9.4 9L12 3.5L14.6 9' fill='none' stroke='${lighten(c1, 0.55)}' stroke-width='.7' opacity='.8'/>`,
    shine: [8.2, 6],
  },
  potion: {
    body: 'M9.4 2.4H14.6V4.6H13.7V8.1C17.3 9.3 19.5 12.2 19.5 15.6C19.5 19.4 16.2 21.9 12 21.9C7.8 21.9 4.5 19.4 4.5 15.6C4.5 12.2 6.7 9.3 10.3 8.1V4.6H9.4Z',
    extra: (c1) =>
      `<path d='M10.3 2.4H13.7V4.6H10.3Z' fill='${lighten(c1, 0.7)}' opacity='.7'/><path d='M5.6 14.2H18.4' stroke='${lighten(c1, 0.6)}' stroke-width='.8' opacity='.7'/>`,
    shine: [8.4, 13],
  },
  candle: {
    body: 'M7.6 9.4H16.4V21.6H7.6Z',
    extra: () =>
      `<path d='M12 1.6C13.7 3.9 14.7 5.3 14.7 6.7A2.7 2.7 0 0 1 9.3 6.7C9.3 5.3 10.3 3.9 12 1.6Z' fill='%FLAME%'/><path d='M12 4.4C12.7 5.4 13.1 6 13.1 6.7A1.1 1.1 0 0 1 10.9 6.7C10.9 6 11.3 5.4 12 4.4Z' fill='#fff6d5'/>`,
    shine: [9.6, 12],
  },
  die: {
    body: 'M6 3.6H18A2.4 2.4 0 0 1 20.4 6V18A2.4 2.4 0 0 1 18 20.4H6A2.4 2.4 0 0 1 3.6 18V6A2.4 2.4 0 0 1 6 3.6Z',
    extra: (c1) =>
      `<path d='${circle(8, 8, 1.5)}${circle(16, 8, 1.5)}${circle(12, 12, 1.5)}${circle(8, 16, 1.5)}${circle(16, 16, 1.5)}' fill='${lighten(c1, 0.8)}'/>`,
    shine: [7, 6],
  },
};

const CRACK_LINES = [
  'M12.6 4.2L11.2 8L13.4 10.6L11.8 14.2',
  'M4.6 11.2L8.2 12.4L9.6 15.6L8.6 18.6',
  'M19.4 9.2L16.2 12.4L17.2 15.2L14.6 18.8',
];

/**
 * 道具的 5 個樣子（由上而下：完好、損壞 1～3 級、毀壞），以顏色 1、顏色 2 上色。
 * 損壞：逐級多一道裂痕、逐漸變暗，第 3 級缺一角；毀壞：裂成兩半散開、變淡。
 */
export function itemSpriteSvg(kind: Exclude<ItemKind, 'none'>, c1: string, c2: string): string {
  const art = ITEMS[kind];
  const outline = darken(c2, 0.35);
  const crackColor = darken(c2, 0.6);
  const extra = art.extra(c1, c2).replace('%FLAME%', '#ffb347');
  const [sx, sy] = art.shine;
  const defs =
    `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${lighten(c1, 0.15)}'/><stop offset='1' stop-color='${c2}'/></linearGradient>` +
    `<clipPath id='c'><path d='${art.body}'/></clipPath>` +
    `<clipPath id='l'><path d='M0 0H13L11 7L13.5 12L10.5 17L12 24H0Z'/></clipPath>` +
    `<clipPath id='r'><path d='M13 0H24V24H12L10.5 17L13.5 12L11 7Z'/></clipPath>` +
    `<mask id='m' maskUnits='userSpaceOnUse' x='0' y='0' width='24' height='24'><rect width='24' height='24' fill='#fff'/><path d='M14 0L24 0L24 9L17.6 7.4Z' fill='#000'/></mask>` +
    `<g id='a'><path d='${art.body}' fill='url(#g)' stroke='${outline}' stroke-width='1'/>${extra}` +
    `<ellipse cx='${sx}' cy='${sy}' rx='2.2' ry='1.3' fill='#fff' opacity='.45' transform='rotate(-30 ${sx} ${sy})' clip-path='url(#c)'/></g></defs>`;
  const cells: string[] = [];
  for (let k = 0; k < ITEM_STATES; k++) {
    let inner: string;
    if (k === 0) inner = `<use href='#a'/>`;
    else if (k < 4) {
      const lines = CRACK_LINES.slice(0, k).join('');
      inner =
        `<g${k === 3 ? " mask='url(#m)'" : ''}><use href='#a'/>` +
        `<path d='${art.body}' fill='#000' opacity='${num(0.12 * k, 2)}'/>` +
        `<g clip-path='url(#c)' fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
        `<path d='${lines}' stroke='#fff' stroke-opacity='.5' stroke-width='.6' transform='translate(.5 .5)'/>` +
        `<path d='${lines}' stroke='${crackColor}' stroke-width='1.1'/></g></g>`;
    } else {
      inner =
        `<g opacity='.5'><g clip-path='url(#l)'><g transform='translate(-2.4 2) rotate(-14 12 14)'><use href='#a'/></g></g>` +
        `<g clip-path='url(#r)'><g transform='translate(2.6 2.8) rotate(12 12 14)'><use href='#a'/></g></g></g>` +
        `<path d='M5 22.4L6.4 21.6L7 22.8ZM16.8 22.6L18.4 21.8L18.6 23.2ZM11 23.2L12.2 22.4L12.8 23.4Z' fill='${outline}' opacity='.6'/>`;
    }
    cells.push(k ? `<g transform='translate(0 ${24 * k})'>${inner}</g>` : inner);
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 ${24 * ITEM_STATES}' width='24' height='${24 * ITEM_STATES}'>${defs}${cells.join('')}</svg>`;
}

/* ---------- 裂痕 ---------- */

/** 決定性亂數（同一個種子永遠得到同一串數字） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 四處撞擊點沿條長方向的範圍（比例）：第一處 2/3～4/5、第二處 2/5～1/2、第三處 1/10～1/4、第四處（碎裂）中右段 */
export const IMPACT_SPANS: readonly [number, number][] = [
  [2 / 3, 0.8],
  [0.4, 0.5],
  [0.1, 0.25],
  [0.55, 0.72],
];

export interface Impact {
  x: number;
  y: number;
  /** 每道裂痕的折線頂點 */
  rays: [number, number][][];
}

/** 第 bar 條（1 起算）的四處撞擊點：長 w、高 h 的條本體上（px） */
export function crackImpacts(bar: number, w: number, h: number): Impact[] {
  const rnd = seededRandom(0x5bd1e995 ^ Math.imul(bar, 2654435761));
  return IMPACT_SPANS.map(([a, b], i) => {
    const shatter = i === 3;
    const x = w * (a + (b - a) * rnd());
    const y = h * (0.3 + 0.4 * rnd());
    const count = 5 + Math.floor(rnd() * 3);
    const rays: [number, number][][] = [];
    const turn = rnd() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const ang = turn + (k / count) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
      const along = Math.abs(Math.cos(ang));
      const len =
        (h * (0.35 + rnd() * 0.45) + along * w * (0.05 + rnd() * 0.07)) * (shatter ? 1.6 : 1);
      const pts: [number, number][] = [[x, y]];
      const segs = 3;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const jit = (rnd() - 0.5) * len * 0.22;
        pts.push([
          x + Math.cos(ang) * len * t - Math.sin(ang) * jit,
          y + Math.sin(ang) * len * t + Math.cos(ang) * jit,
        ]);
      }
      rays.push(pts);
      /* 偶爾分岔 */
      if (rnd() < 0.35) {
        const [px, py] = pts[1];
        const ba = ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5);
        const bl = len * (0.25 + rnd() * 0.2);
        rays.push([
          [px, py],
          [px + Math.cos(ba) * bl, py + Math.sin(ba) * bl],
        ]);
      }
    }
    return { x, y, rays };
  });
}

/** 一處撞擊點的 SVG（裂痕線＋旁邊偏移約 0.6 px、約 45% 濃度的細白線） */
export function impactSvg(
  impact: Impact,
  w: number,
  h: number,
  color: string,
  opacity: number,
  dark = false,
): string {
  const lw = Math.min(2, Math.max(0.9, h * 0.07));
  const d = impact.rays.map((r) => `M${r.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`).join('');
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${f(w)} ${f(h)}' preserveAspectRatio='none'>` +
    (dark ? `<rect width='100%' height='100%' fill='#000' opacity='.3'/>` : '') +
    `<g fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${d}' stroke='#fff' stroke-opacity='.45' stroke-width='${num(lw * 0.55, 2)}' transform='translate(.6 .6)'/>` +
    `<path d='${d}' stroke='${solidHex(color)}' stroke-opacity='${num((rgbaAlpha(color) * opacity) / 100, 2)}' stroke-width='${num(lw, 2)}'/></g></svg>`
  );
}

/* ---------- 條本體外框（沿輪廓內側） ---------- */

/**
 * 外框圖：沿輪廓畫兩倍粗細的線，元素本身被同一個輪廓裁切，所以只剩內側的一半＝粗細 t。
 * 雙線：從外緣起 t 線、t 空隙、t 線（以遮罩挖掉中間那段）。
 */
export function outlineSvg(
  path: string,
  w: number,
  h: number,
  width: number,
  color: string,
  double: boolean,
): string {
  const stroke = solidHex(color);
  const a = rgbaAlpha(color);
  const head = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${f(w)} ${f(h)}' preserveAspectRatio='none'>`;
  if (!double)
    return `${head}<path d='${path}' fill='none' stroke='${stroke}' stroke-opacity='${num(a, 3)}' stroke-width='${num(2 * width, 2)}'/></svg>`;
  return (
    `${head}<mask id='m' maskUnits='userSpaceOnUse' x='-10' y='-10' width='${f(w + 20)}' height='${f(h + 20)}'>` +
    `<rect x='-10' y='-10' width='${f(w + 20)}' height='${f(h + 20)}' fill='#fff'/>` +
    `<path d='${path}' fill='none' stroke='#000' stroke-width='${num(4 * width, 2)}'/>` +
    `<path d='${path}' fill='none' stroke='#fff' stroke-width='${num(2 * width, 2)}'/></mask>` +
    `<path d='${path}' fill='none' stroke='${stroke}' stroke-opacity='${num(a, 3)}' stroke-width='${num(6 * width, 2)}' mask='url(#m)'/></svg>`
  );
}

/** #rrggbbaa 的不透明度（0～1） */
export function rgbaAlpha(color: string): number {
  const m = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(color.trim());
  return m ? Number.parseInt(m[1], 16) / 255 : 1;
}

/** #rrggbbaa → #rrggbb */
export function solidHex(color: string): string {
  const m = /^#([0-9a-f]{6})/i.exec(color.trim());
  return m ? `#${m[1].toLowerCase()}` : '#ffffff';
}
