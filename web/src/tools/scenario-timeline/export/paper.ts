/**
 * 圖面的樣式（第五批；參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「図面の表情を選ぶ」，規格 F136～F139、3.16）：
 * 紙的樣式七種（配色本站自己配；floor-plan 的地圖樣式是牆、家具、房間的顏色，欄位對不起來，不共用，D63）、
 * 紙的老舊（污漬與摺痕的配置和 floor-plan 共用 `@/core/paperWear`，這裡轉成匯出圖的指令）、
 * 右下的紙翻角與落影、標題的字體。都只在選了的時候才用（沒選時匯出圖和改版前逐位元組相同）。
 */
import { type WearPlan, wearPlan, wearStrength, wearTint } from '@/core/paperWear';
import type { Palette } from './picture';

export type PaperStyle =
  | 'none'
  | 'slate'
  | 'blueprint'
  | 'parchment'
  | 'draft'
  | 'tinted'
  | 'noir'
  | 'terminal';
export const PAPER_STYLES: readonly PaperStyle[] = [
  'none',
  'slate',
  'blueprint',
  'parchment',
  'draft',
  'tinted',
  'noir',
  'terminal',
];

export type TitleFont = 'sans' | 'serif' | 'mono' | 'classic';
export const TITLE_FONTS: readonly TitleFont[] = ['sans', 'serif', 'mono', 'classic'];

/** 圖下方的調書（F140）：不放／不在場證明・接觸調書／時間切片 */
export type PanelKind = 'none' | 'report' | 'slice';

/** 紙的配色：Palette（底、刻度的底、格線、字、淡的字、邊、強調色）＋深色的紙、紙的影子 */
export interface PaperPalette extends Palette {
  dark: boolean;
  /** 紙翻角的背面（淺、中、深） */
  flap: [string, string, string];
}

/** 七種紙的配色（本站自己配） */
export const PAPER_PALETTES: Record<Exclude<PaperStyle, 'none'>, PaperPalette> = {
  /* 石板：深灰的紙、白的細線 */
  slate: {
    bg: '#2a2c30',
    surface: '#323439',
    grid: '#3f4248',
    gridMajor: '#5a5e66',
    text: '#f2f2f4',
    muted: '#a6a9b1',
    border: '#4c5058',
    accent: '#d9dbe2',
    dark: true,
    flap: ['#e9e7e1', '#c9c6be', '#9d9a92'],
  },
  /* 藍曬圖：靛藍的紙、米白的線 */
  blueprint: {
    bg: '#173c5f',
    surface: '#1c4870',
    grid: '#295882',
    gridMajor: '#4473a0',
    text: '#f1f0e4',
    muted: '#a7c1d8',
    border: '#386690',
    accent: '#f3cf74',
    dark: true,
    flap: ['#e6ecf0', '#b9c8d4', '#8aa0b2'],
  },
  /* 古紙：泛黃的紙、墨色的字 */
  parchment: {
    bg: '#ecdcb6',
    surface: '#e2cfa2',
    grid: '#d6c193',
    gridMajor: '#bba26f',
    text: '#3a2a16',
    muted: '#735d3c',
    border: '#c2a979',
    accent: '#8c3a14',
    dark: false,
    flap: ['#f6ead0', '#dcc596', '#b99e6a'],
  },
  /* 白地圖面：米白的紙、深綠灰的字 */
  draft: {
    bg: '#f8f7f2',
    surface: '#eeede6',
    grid: '#e1e0d8',
    gridMajor: '#c4c7bf',
    text: '#1d2421',
    muted: '#5f6a64',
    border: '#d0d2ca',
    accent: '#2c6a50',
    dark: false,
    flap: ['#ffffff', '#e3e2da', '#c3c2b9'],
  },
  /* 彩色：灰綠的米色紙 */
  tinted: {
    bg: '#e5dec6',
    surface: '#d9d0b3',
    grid: '#cdc4a6',
    gridMajor: '#b0a682',
    text: '#292d21',
    muted: '#5d5d47',
    border: '#bcb28f',
    accent: '#3d6a4e',
    dark: false,
    flap: ['#f3eedf', '#d3c9aa', '#ada283'],
  },
  /* 黑曜：近黑的紙、淡金的線 */
  noir: {
    bg: '#131518',
    surface: '#1a1d22',
    grid: '#252930',
    gridMajor: '#3a414b',
    text: '#efe8d8',
    muted: '#959ba5',
    border: '#2e333b',
    accent: '#e2c078',
    dark: true,
    flap: ['#e8e4d8', '#c4bfb2', '#948f83'],
  },
  /* 監視終端：暗綠的底、螢光綠的字 */
  terminal: {
    bg: '#061510',
    surface: '#0a1f18',
    grid: '#103227',
    gridMajor: '#1d5342',
    text: '#b8f4d6',
    muted: '#5eb391',
    border: '#164433',
    accent: '#6bedbd',
    dark: true,
    flap: ['#d9f2e6', '#a9cdbd', '#7a9e8f'],
  },
};

/** 標題的字體：Google Fonts 的字型（PNG 載入、SVG 嵌入用）、CSS 的字型堆疊、粗細 */
export const TITLE_FONT_SPECS: Record<
  TitleFont,
  { families: readonly string[]; stack: string; weight: number }
> = {
  sans: {
    families: ['Noto Sans TC'],
    stack: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', sans-serif",
    weight: 700,
  },
  serif: {
    families: ['Noto Serif TC'],
    stack: "'Noto Serif TC', 'Songti TC', 'PMingLiU', serif",
    weight: 700,
  },
  mono: {
    families: ['Roboto Mono', 'Noto Sans TC'],
    stack: "'Roboto Mono', 'Noto Sans TC', monospace",
    weight: 700,
  },
  classic: {
    families: ['Cinzel', 'Cactus Classical Serif'],
    stack: "'Cinzel', 'Cactus Classical Serif', serif",
    weight: 400,
  },
};

/* ---------- 尺寸 ---------- */

/** 圖框（F137）：內容四周留白，框線在留白的中間 */
export const FRAME_PAD = 16;
/** 紙翻角（F137）：紙的外側留白（落影用）、右下角切掉的大小、紙的下方多留的高度（翻角不會壓到內容） */
export const OUTER_MARGIN = 28;
export const CURL_W = 44;
export const CURL_H = 36;
export const CURL_PAD = 30;
/** 不透明時紙的外側的底色 */
export const BACKDROP = { light: '#e4e6e1', dark: '#17191d' } as const;

/* ---------- 汙漬與摺痕 → 指令的資料 ---------- */

/** 漸層的一個點：位置 0～1、顏色（#rrggbb）、不透明度 */
export type GradStop = [number, string, number];

export interface WearShape {
  /** SVG 路徑（絕對座標） */
  d: string;
  fill:
    | { kind: 'radial'; cx: number; cy: number; r0: number; r1: number; stops: GradStop[] }
    | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradStop[] }
    | { kind: 'solid'; color: string; alpha: number };
  stroke?: { color: string; alpha: number; width: number };
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
const rgbHex = (c: readonly [number, number, number]) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 污漬與摺痕（floor-plan 的 drawWear 同樣的配置與濃淡，寫成路徑＋漸層）：sheet＝紙的範圍，strength 0～1。
 */
export function wearShapes(
  sheet: { x: number; y: number; w: number; h: number },
  seed: number,
  strength: number,
  dark: boolean,
  plan: WearPlan = wearPlan(seed),
): WearShape[] {
  if (!(strength > 0) || sheet.w <= 0 || sheet.h <= 0) return [];
  const tint = rgbHex(wearTint(dark));
  const k = wearStrength(strength, dark);
  const m = Math.min(sheet.w, sheet.h);
  const out: WearShape[] = [];
  for (const s of plan.stains) {
    const cx = sheet.x + s.u * sheet.w;
    const cy = sheet.y + s.v * sheet.h;
    const r = s.r * m;
    const pts = s.wobble.map((f, j) => {
      const a = (j / s.wobble.length) * Math.PI * 2;
      return `${r2(cx + Math.cos(a) * r * f)} ${r2(cy + Math.sin(a) * r * f)}`;
    });
    out.push({
      d: `M${pts.join('L')}Z`,
      fill: {
        kind: 'radial',
        cx: r2(cx),
        cy: r2(cy),
        r0: r2(r * 0.1),
        r1: r2(r * 1.15),
        stops: [
          [0, tint, 0.05 * k * s.alpha],
          [0.7, tint, 0.1 * k * s.alpha],
          [1, tint, 0.2 * k * s.alpha],
        ],
      },
      stroke: { color: tint, alpha: 0.22 * k * s.alpha, width: r2(Math.max(r * 0.03, m * 0.0015)) },
    });
    for (const d of s.drops) {
      const x = cx + d.du * r;
      const y = cy + d.dv * r;
      const rr = d.r * r;
      out.push({
        d: `M${r2(x - rr)} ${r2(y)}A${r2(rr)} ${r2(rr)} 0 1 0 ${r2(x + rr)} ${r2(y)}A${r2(rr)} ${r2(rr)} 0 1 0 ${r2(x - rr)} ${r2(y)}Z`,
        fill: { kind: 'solid', color: tint, alpha: 0.14 * k * s.alpha },
      });
    }
  }
  for (const f of plan.folds) {
    const band = m * 0.012;
    const pos = f.o === 'h' ? sheet.y + f.at * sheet.h : sheet.x + f.at * sheet.w;
    const lo = Math.min(pos, pos + band * f.side);
    const rect =
      f.o === 'h'
        ? `M${r2(sheet.x)} ${r2(lo)}H${r2(sheet.x + sheet.w)}V${r2(lo + band)}H${r2(sheet.x)}Z`
        : `M${r2(lo)} ${r2(sheet.y)}H${r2(lo + band)}V${r2(sheet.y + sheet.h)}H${r2(lo)}Z`;
    out.push({
      d: rect,
      fill:
        f.o === 'h'
          ? {
              kind: 'linear',
              x1: 0,
              y1: r2(pos),
              x2: 0,
              y2: r2(pos + band * f.side),
              stops: [
                [0, '#000000', 0.16 * k],
                [1, '#000000', 0],
              ],
            }
          : {
              kind: 'linear',
              x1: r2(pos),
              y1: 0,
              x2: r2(pos + band * f.side),
              y2: 0,
              stops: [
                [0, '#000000', 0.16 * k],
                [1, '#000000', 0],
              ],
            },
    });
    const off = (band * f.side) / 6;
    const lw = Math.max(m * 0.0015, band * 0.15);
    out.push({
      d:
        f.o === 'h'
          ? `M${r2(sheet.x)} ${r2(pos - off - lw / 2)}H${r2(sheet.x + sheet.w)}V${r2(pos - off + lw / 2)}H${r2(sheet.x)}Z`
          : `M${r2(pos - off - lw / 2)} ${r2(sheet.y)}H${r2(pos - off + lw / 2)}V${r2(sheet.y + sheet.h)}H${r2(pos - off - lw / 2)}Z`,
      fill: { kind: 'solid', color: '#ffffff', alpha: (dark ? 0.12 : 0.45) * k },
    });
  }
  return out;
}

/** 紙的外形：右下角切掉（紙翻角）或整張長方形 */
export function sheetPath(x: number, y: number, w: number, h: number, curl: boolean): string {
  if (!curl) return `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}Z`;
  return `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h - CURL_H)}L${r2(x + w - CURL_W)} ${r2(y + h)}H${r2(x)}Z`;
}

/** 翻過來的那一角（紙的背面）：摺線的兩端與往內翻的頂點（一點弧度） */
export function flapPath(x: number, y: number, w: number, h: number): string {
  const ax = x + w - CURL_W;
  const ay = y + h;
  const bx = x + w;
  const by = y + h - CURL_H;
  /* 翻過來的頂點落在紙的內側（摺線的鏡射），角做一點圓 */
  const tx = ax + 4;
  const ty = by + 4;
  return `M${r2(ax)} ${r2(ay)}L${r2(tx)} ${r2(ty + 6)}Q${r2(tx)} ${r2(ty)} ${r2(tx + 6)} ${r2(ty)}L${r2(bx)} ${r2(by)}Z`;
}
