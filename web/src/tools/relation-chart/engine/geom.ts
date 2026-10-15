/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 節點的幾何與外觀解析（原作的 getCharRadius、charBorderW、charIsSquare、charHasBorder、配色 helpers…）：
 * 解析順序一律「個別設定 → 分頁設定 → 自動值」。純函式，不碰 DOM。
 */
import { ownColor } from '../model/normalize';
import type { Char, FontKey, Palette, RelType, Sheet, SheetSettings } from '../model/types';

/** 原作的節點基準半徑 */
export const NODE_R = 46;
/** 拖曳、排列時角色之間額外留的距離（原作的 SNAP_GAP） */
export const SNAP_GAP = 34;

/** 畫布配色（原作的「黑暗佈景」與「明亮佈景」的數值，D3） */
export interface PaletteColors {
  bg: string;
  panel: string;
  ink: string;
  line: string;
  guide: string;
  accent: string;
  /** 外框為「自動」時的顏色 */
  auto: string;
  /** 自動描邊色（關係線外框） */
  stroke: string;
}

export const PALETTES: Record<Palette, PaletteColors> = {
  dark: {
    bg: '#121212',
    panel: '#1e1e1e',
    ink: '#ffffff',
    line: '#444444',
    guide: '#555555',
    accent: '#ffffff',
    auto: '#ffffff',
    stroke: '#ffffff',
  },
  light: {
    bg: '#f5f5f5',
    panel: '#ffffff',
    ink: '#121212',
    line: '#cccccc',
    guide: '#b0b0b0',
    accent: '#121212',
    auto: '#121212',
    stroke: '#000000',
  },
};

/** 字型組（系統字型；原作的 FONT_STACKS） */
export const FONT_STACKS: Record<FontKey, string> = {
  sans: '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif',
  serif: '"Noto Serif TC","Songti TC",PMingLiU,"Noto Serif CJK TC",serif',
  round:
    '"Hiragino Maru Gothic ProN","Yuanti TC","YouYuan","Noto Sans TC","PingFang TC",sans-serif',
  kai: '"Kaiti TC","BiauKai",KaiTi,DFKai-SB,"Noto Sans TC",serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Noto Sans Mono","Microsoft JhengHei",monospace',
};

/** 畫一張分頁需要的東西 */
export interface SheetCtx {
  sheet: Sheet;
  s: SheetSettings;
  W: number;
  H: number;
  pal: PaletteColors;
  byId: Map<number, Char>;
  typeById: Map<number, RelType>;
}

export function sheetCtx(sheet: Sheet): SheetCtx {
  const W = sheet.W || 1000;
  const H = sheet.H || W;
  return {
    sheet,
    s: sheet.settings,
    W,
    H,
    pal: PALETTES[sheet.settings.palette] ?? PALETTES.dark,
    byId: new Map(sheet.chars.map((c) => [c.id, c])),
    typeById: new Map(sheet.types.map((t) => [t.id, t])),
  };
}

const canvasK = (w: number) => Math.sqrt(Math.max(1, (w || 1000) / 1000));
/** 長方形畫布以「長寬中較小者」為基準 */
const canvasRef = (ctx: SheetCtx) => Math.min(ctx.W, ctx.H) || Math.max(ctx.W, ctx.H) || 1000;
export const defaultCharRadius = (ctx: SheetCtx): number => NODE_R * canvasK(canvasRef(ctx));

/** 文字寬度的估算：全形 15、半形 9（每 15 px 字級） */
export function exactTextWidth(str: string): number {
  let len = 0;
  for (let i = 0; i < str.length; i++) len += str.charCodeAt(i) > 255 ? 15 : 9;
  return len;
}

export const charLevel = (c: Char | undefined): number => (c ? Math.trunc(c.level || 0) : 0);

/** 預設名稱「角色 N」 */
export const defaultName = (c: Pick<Char, 'defNo' | 'id'>): string => `角色${c.defNo || c.id}`;
/** 顯示名稱（換行收成空白） */
export const displayName = (c: Pick<Char, 'name' | 'defNo' | 'id'>): string =>
  (c.name || defaultName(c)).replace(/\n+/g, ' ');
export const firstChar = (s: string): string => Array.from(s)[0] ?? '';
export const nameLines = (c: Char): string[] => (c.name || defaultName(c)).split('\n');

export const charNameSize = (ctx: SheetCtx, c: Char): number => {
  if (c.nameSize && c.nameSize >= 1) return c.nameSize;
  return ctx.s.defNameSize >= 1 ? ctx.s.defNameSize : 15;
};

/** 純文字角色的外框尺寸（也是點選範圍） */
export function textNodeSize(ctx: SheetCtx, c: Char): { w: number; h: number; lines: string[] } {
  const ns = charNameSize(ctx, c);
  const k = ns / 15;
  const lines = nameLines(c);
  const w = Math.max(30, ...lines.map((l) => exactTextWidth(l) * k)) + 14;
  const h = lines.length * ns * 1.3 + 10;
  return { w, h, lines };
}

/** 頭像的名目半徑（不含純文字角色的特例） */
export function avatarRadius(ctx: SheetCtx, c: Char | undefined): number {
  if (c?.size && c.size >= 32) return c.size / 2;
  return ctx.s.defCharSize >= 32 ? ctx.s.defCharSize / 2 : defaultCharRadius(ctx);
}

/** 碰撞、連線用的半徑（純文字角色隨文字大小） */
export function charRadius(ctx: SheetCtx, c: Char | undefined): number {
  if (c?.noAvatar) {
    const tn = textNodeSize(ctx, c);
    return Math.max(20, tn.w / 2, tn.h / 2);
  }
  return avatarRadius(ctx, c);
}

export const charBorderW = (ctx: SheetCtx, c: Char): number => {
  if (c.borderW && c.borderW >= 1) return c.borderW;
  return ctx.s.defBorderW >= 1 ? ctx.s.defBorderW : 3 * canvasK(canvasRef(ctx));
};

export const charIsSquare = (ctx: SheetCtx, c: Char): boolean =>
  c.shape === 'square' ? true : c.shape === 'circle' ? false : !!ctx.s.shapeSquare;
export const charHasBorder = (ctx: SheetCtx, c: Char): boolean =>
  c.noBorder ? false : c.borderOn ? true : !ctx.s.defNoBorder;
export const charHasBg = (ctx: SheetCtx, c: Char): boolean =>
  c.noBg ? false : c.bgOn ? true : !ctx.s.defNoBg;

/** 外框／背景開關的寫法：與分頁預設相同時清掉兩個旗標（原作的 setCharBorderFlag） */
export function borderFlags(
  s: SheetSettings,
  kind: 'border' | 'bg',
  on: boolean,
): Partial<Pick<Char, 'noBorder' | 'borderOn' | 'noBg' | 'bgOn'>> {
  const defOff = kind === 'bg' ? s.defNoBg : s.defNoBorder;
  if (kind === 'bg') return { noBg: !on, bgOn: on && defOff };
  return { noBorder: !on, borderOn: on && defOff };
}

const gsColor = (v: string): string | null => (v && v !== 'auto' ? v : null);

/** 頭像外框、圖示與首字 */
export const charRingColor = (ctx: SheetCtx, c: Char): string =>
  ownColor(c.color) || gsColor(ctx.s.colAvatarRing) || ctx.pal.auto;
/** 名字外框線 */
export const charNameStrokeColor = (ctx: SheetCtx, c: Char): string =>
  ownColor(c.color) || gsColor(ctx.s.colNameStroke) || ctx.pal.auto;
/** 頭像背景 */
export const charBgFillColor = (ctx: SheetCtx, c: Char): string =>
  ownColor(c.nameColor) || gsColor(ctx.s.colAvatarBg) || ctx.pal.panel;
/** 名字填色 */
export const charNameFillColor = (ctx: SheetCtx, c: Char): string =>
  ownColor(c.nameColor) || gsColor(ctx.s.colNameText) || ctx.pal.panel;
export const charBgPaint = (ctx: SheetCtx, c: Char): string =>
  charHasBg(ctx, c) ? charBgFillColor(ctx, c) : 'rgba(0,0,0,0)';

/** 關係線的顏色（auto＝面板色，與頭像填色同步） */
export const typeLineColor = (ctx: SheetCtx, t: RelType): string =>
  ownColor(t.color) || gsColor(ctx.s.colRelLine) || ctx.pal.panel;
export const typeTextColor = (ctx: SheetCtx, _t: RelType, lineCol: string): string =>
  gsColor(ctx.s.colRelText) || lineCol;
export const typeLineW = (ctx: SheetCtx, t: RelType): number =>
  t.lineW && t.lineW >= 1 ? t.lineW : ctx.s.defLineW >= 1 ? ctx.s.defLineW : 3;
/** 外框寬度（null＝1；0＝沒有外框） */
export const typeOutlineW = (t: RelType): number =>
  t.outlineW === null || t.outlineW === undefined ? 1 : t.outlineW > 0 ? t.outlineW : 0;
export const typeOutlineColor = (ctx: SheetCtx, t: RelType): string =>
  ownColor(t.outlineColor) || gsColor(ctx.s.colRelOutline) || ctx.pal.auto;

export const relNameFS = (ctx: SheetCtx): number =>
  ctx.s.defRelNameSize >= 1 ? ctx.s.defRelNameSize : 15;
export const relNoteFS = (ctx: SheetCtx): number =>
  ctx.s.defNoteSize >= 1 ? ctx.s.defNoteSize : 12;

export const spacingFactor = (s: SheetSettings): number =>
  Math.min(1000, Math.max(10, s.spacingPct || 100)) / 100;
export const edgeGapPx = (s: SheetSettings): number =>
  Number.isFinite(s.edgeGapPx) && s.edgeGapPx >= 0 ? Math.min(200, Math.round(s.edgeGapPx)) : 18;

/**
 * 名字讓位：線沿 (dx, dy) 方向離開節點時，若會穿過名字的方框，回傳「射線離開方框的距離」（箭頭退到名字外緣）。
 * 只管往下離開的線；不顯示名字、純文字角色回傳 0。
 */
export function nameBoxExitDist(ctx: SheetCtx, c: Char, dx: number, dy: number): number {
  if (dy <= 0.02) return 0;
  if (c.noAvatar || !(c.name && ctx.s.showNames)) return 0;
  const ns = charNameSize(ctx, c);
  const lh = ns * 1.25;
  const curR = charRadius(ctx, c);
  const k = ns / 15;
  const lines = c.name.split('\n');
  const w = Math.max(30, ...lines.map((l) => exactTextWidth(l) * k)) + 10;
  const top = curR + 6;
  const bottom = top + ns * 0.9 + (lines.length - 1) * lh + ns * 0.35;
  const tBottom = bottom / dy;
  if (Math.abs(tBottom * dx) <= w / 2) return tBottom;
  if (Math.abs(dx) > 1e-6) {
    const tSide = w / 2 / Math.abs(dx);
    const ySide = tSide * dy;
    if (ySide >= top && ySide <= bottom) return tSide;
  }
  return 0;
}

/** 角色超出畫布時的出血（原作 stageKit.bleed：溢出量＋96） */
export function bleedPad(ctx: SheetCtx): number {
  if (!ctx.sheet.chars.length) return 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of ctx.sheet.chars) {
    const r = charRadius(ctx, c);
    minX = Math.min(minX, c.x - r);
    minY = Math.min(minY, c.y - r);
    maxX = Math.max(maxX, c.x + r);
    maxY = Math.max(maxY, c.y + r);
  }
  const overflow = Math.max(0, -minX, -minY, maxX - ctx.W, maxY - ctx.H);
  return overflow > 0 ? Math.ceil(overflow + 96) : 0;
}

/** 夾在畫布內（離邊緣至少半徑＋14、至少 60） */
export function clampToCanvas(ctx: SheetCtx, c: Char): void {
  const e = Math.max(60, charRadius(ctx, c) + 14);
  c.x = Math.max(e, Math.min(Math.max(e, ctx.W - e), c.x));
  c.y = Math.max(e, Math.min(Math.max(e, ctx.H - e), c.y));
}

/** XML 跳脫 */
export const esc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
