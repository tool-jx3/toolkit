/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 節點的幾何與外觀解析（原作的 getCharRadius、charBorderW、charIsSquare、charHasBorder、配色 helpers…）：
 * 解析順序一律「個別設定 → 分頁設定 → 自動值」。純函式，不碰 DOM。
 */
import { ownColor } from '../model/normalize';
import type {
  Char,
  FontItem,
  FontKey,
  FontValue,
  FrameItem,
  Label,
  Palette,
  RelType,
  Sheet,
  SheetSettings,
} from '../model/types';

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

/** 專案層級的外觀（第三批）：文件字型、匯入的字型、頭像框庫 */
export interface ProjectLook {
  font?: FontValue;
  fonts?: readonly FontItem[];
  frames?: readonly FrameItem[];
}

/** 畫一張分頁需要的東西 */
export interface SheetCtx {
  sheet: Sheet;
  s: SheetSettings;
  W: number;
  H: number;
  pal: PaletteColors;
  byId: Map<number, Char>;
  typeById: Map<number, RelType>;
  /** 專案的標籤（標籤庫的順序）；沒給＝沒有標籤 */
  labels: readonly Label[];
  lblById: Map<number, Label>;
  /** 文件字型、庫裡有的匯入字型與頭像框（資產 id；第三批） */
  docFont: FontValue;
  fontIds: ReadonlySet<string>;
  frameIds: ReadonlySet<string>;
}

const NO_IDS: ReadonlySet<string> = new Set();

export function sheetCtx(
  sheet: Sheet,
  labels: readonly Label[] = [],
  look: ProjectLook = {},
): SheetCtx {
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
    labels,
    lblById: new Map(labels.map((l) => [l.id, l])),
    docFont: look.font ?? 'sans',
    fontIds: look.fonts?.length ? new Set(look.fonts.map((f) => f.id)) : NO_IDS,
    frameIds: look.frames?.length ? new Set(look.frames.map((f) => f.id)) : NO_IDS,
  };
}

/* ---------- 字型（第三批：匯入的字型、角色字型；原作的 fontCssOf／charFontSty） ---------- */

/** 匯入字型的 font-family 名稱 */
export const importedFamily = (assetId: string): string => `crf-${assetId}`;

/** 字型的值 → CSS 字型組（匯入的字型在最前面、後面接黑體；庫裡沒有＝黑體） */
export function fontStack(v: FontValue, fontIds: ReadonlySet<string>): string {
  if (v.startsWith('f:')) {
    const id = v.slice(2);
    return fontIds.has(id) ? `"${importedFamily(id)}",${FONT_STACKS.sans}` : FONT_STACKS.sans;
  }
  return FONT_STACKS[v as FontKey] ?? FONT_STACKS.sans;
}

/** 角色名字的字型（寫在 style；沒設＝跟隨文件字型＝空字串）：匯入的接文件字型、內建的照字型組 */
export function charFontCss(ctx: SheetCtx, c: Char): string {
  const v = c.font;
  if (!v) return '';
  if (v.startsWith('f:')) {
    const id = v.slice(2);
    return ctx.fontIds.has(id)
      ? `"${importedFamily(id)}",${fontStack(ctx.docFont, ctx.fontIds)}`
      : '';
  }
  return FONT_STACKS[v as FontKey] ?? '';
}

/** 名字 <text> 的 style 屬性（前面有空白；沒有＝空字串） */
export const charFontAttr = (ctx: SheetCtx, c: Char): string => {
  const css = charFontCss(ctx, c);
  return css ? ` style="font-family:${esc(css)}"` : '';
};

/* ---------- 頭像框（第三批；原作的 effectiveFrame、FRAME_SCALE、nameFrameDrop） ---------- */

/** 框布是頭像直徑的 1.6 倍（範本 512 對應頭像 320） */
export const FRAME_SCALE = 1.6;

/**
 * 角色實際戴的框與來源：變體自己指定（''＝不要框；指定的框不在庫裡＝沒有框）→ 跟隨標籤（標籤庫的順序第一個有框的）
 * → 分頁的預設框。純文字角色不戴框。
 */
export function frameSource(
  ctx: SheetCtx,
  c: Pick<Char, 'frame' | 'labels' | 'noAvatar'>,
): { id: string; from: 'own' | 'label' | 'sheet'; label?: Label } | null {
  if (c.noAvatar) return null;
  return frameRefSource(ctx, c);
}

/** 同上，不看純文字（清單的縮圖、目前值的說明） */
export function frameRefSource(
  ctx: Pick<SheetCtx, 'labels' | 'frameIds' | 's'>,
  c: Pick<Char, 'frame' | 'labels'>,
): { id: string; from: 'own' | 'label' | 'sheet'; label?: Label } | null {
  if (!ctx.frameIds.size) return null;
  const own = c.frame;
  if (own === '') return null;
  if (own) return ctx.frameIds.has(own) ? { id: own, from: 'own' } : null;
  if (c.labels.length) {
    const mine = new Set(c.labels);
    for (const l of ctx.labels)
      if (mine.has(l.id) && l.frame && ctx.frameIds.has(l.frame))
        return { id: l.frame, from: 'label', label: l };
  }
  const d = ctx.s.defFrame;
  return d && ctx.frameIds.has(d) ? { id: d, from: 'sheet' } : null;
}

export const effectiveFrame = (ctx: SheetCtx, c: Char): string | null =>
  frameSource(ctx, c)?.id ?? null;

/** 戴框時名字往下讓（框往下多出的量） */
export const nameFrameDrop = (ctx: SheetCtx, c: Char, r: number): number =>
  effectiveFrame(ctx, c) ? r * (FRAME_SCALE - 1) : 0;

/** 頭像框的外擴（畫面與互動網頁的 viewBox 多撐開，邊緣角色的框不被裁；不改碰撞與出血） */
export function framePad(ctx: SheetCtx): number {
  if (!ctx.frameIds.size) return 0;
  let pad = 0;
  for (const c of ctx.sheet.chars)
    if (effectiveFrame(ctx, c)) pad = Math.max(pad, charRadius(ctx, c) * (FRAME_SCALE - 1));
  return Math.ceil(pad);
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
  const top = curR + nameFrameDrop(ctx, c, curR) + 6;
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

/** 分頁的顯示名稱（沒填時「分頁 N」；時間軸分頁「時間軸分頁 N」，原作） */
export const sheetName = (s: Pick<Sheet, 'name' | 'defNo'> & { tl?: Sheet['tl'] }): string =>
  (s.name || (s.tl ? `時間軸分頁 ${s.defNo}` : `分頁${s.defNo}`)).replace(/\n+/g, ' ');

/** 聚焦時其他元素的亮度（原作的 focusDimSet：線、標籤、陣營框、圖例按固定比例跟著角色的值） */
export const FOCUS_DIM = 0.15;
export function focusDimSet(raw: number): {
  node: number;
  edge: number;
  lbl: number;
  zone: number;
  legend: number;
} {
  const d = Number.isFinite(raw) && raw >= 0 && raw <= 0.6 ? raw : FOCUS_DIM;
  const k = d / FOCUS_DIM;
  const cl = (x: number) => Math.max(0, Math.min(1, Math.round(x * 1000) / 1000));
  return {
    node: cl(d),
    edge: cl(0.07 * k),
    lbl: cl(0.1 * k),
    zone: cl(0.12 * k),
    legend: cl(0.3 * k),
  };
}
