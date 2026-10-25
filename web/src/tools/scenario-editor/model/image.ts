/**
 * 圖片段落的尺寸、配置、外框與陰影（規格 3.2.9、F150～F156；2026-10 跟進 3.18）。紙面座標以 mm 計，A4 210 × 297。
 * 頁面圖片（doc.pageImgs）見 pageImg.ts。
 */
import type {
  Block,
  BoxColorKey,
  Doc,
  ImageFrame,
  ImageFx,
  ImagePos,
  ImageShadow,
  ImageWidthUnit,
} from './types';

export const PAPER_W = 210;
export const PAPER_H = 297;
/** 頁面圖片與文字的預設距離（mm；上下用一半） */
export const FREE_GAP = 3;
/** 匯入圖片的長邊上限（px） */
export const IMAGE_MAX_SIDE = 1600;
/** 1 px 是幾 mm（96 px＝1 英吋＝25.4 mm） */
export const PX_MM = 25.4 / 96;

export const fnum = (v: number): number => Math.round(v * 100) / 100;

/** 版心寬（mm） */
export const bodyWidthMm = (doc: Pick<Doc, 'padH'>): number =>
  Math.max(20, PAPER_W - (+doc.padH || 16) * 2);

/** 圖片段落的配置（舊的自由配置讀入時已經移到頁面圖片；萬一留著〔例如貼上舊的段落〕當成行內） */
export function imagePos(b: Block): Exclude<ImagePos, 'free'> {
  if (b.pos && b.pos !== 'free') return b.pos;
  return b.fl === 'l' ? 'left' : b.fl === 'r' ? 'right' : 'inline';
}

/** 寬度的對象：block＝圖片段落（上限版心寬）、page＝頁面圖片（上限紙寬） */
export type ImageKind = 'block' | 'page';

/** 有寬度設定的東西（圖片段落、頁面圖片） */
export interface ImageWidth {
  w?: number;
  wu?: ImageWidthUnit;
}

/** 預設的寬：％（段落 70、頁面圖片 40）或 px（200） */
export const imageWidthDefault = (kind: ImageKind, wu: ImageWidthUnit = 'pct'): number =>
  wu === 'px' ? 200 : kind === 'block' ? 70 : 40;

/**
 * 圖片寬（mm；2026-10，上游 v3.16.0）：％ 一律以版心寬為準（不隨分欄或全寬／欄內改變）；
 * px 以 96 px＝25.4 mm 換算，段落最多版心寬、頁面圖片最多紙寬。
 */
export function imageWidthMmOf(o: ImageWidth, doc: Pick<Doc, 'padH'>, kind: ImageKind): number {
  const cap = kind === 'block' ? bodyWidthMm(doc) : PAPER_W;
  if (o.wu === 'px') return Math.max(1, Math.min(cap, (+(o.w ?? 0) || 200) * PX_MM));
  const pct = Math.max(1, Math.min(100, +(o.w ?? 0) || imageWidthDefault(kind)));
  return (bodyWidthMm(doc) * pct) / 100;
}

/** 圖片段落的寬（mm） */
export const imageWidthMm = (b: Block, doc: Pick<Doc, 'padH'>): number =>
  imageWidthMmOf(b, doc, 'block');

/** 寬的數字的範圍：％ 1～100；px 10～（版心寬或紙寬換成 px） */
export function imageWidthRange(
  o: ImageWidth,
  doc: Pick<Doc, 'padH'>,
  kind: ImageKind,
): { min: number; max: number } {
  return o.wu === 'px'
    ? { min: 10, max: Math.round((kind === 'block' ? bodyWidthMm(doc) : PAPER_W) / PX_MM) }
    : { min: 1, max: 100 };
}

/** 目前的寬的數字（範圍內） */
export function imageWidthValue(o: ImageWidth, doc: Pick<Doc, 'padH'>, kind: ImageKind): number {
  const r = imageWidthRange(o, doc, kind);
  return Math.max(
    r.min,
    Math.min(r.max, Math.round(+(o.w ?? 0) || imageWidthDefault(kind, o.wu ?? 'pct'))),
  );
}

/** 設定寬的數字（範圍內） */
export function setImageWidth(
  o: ImageWidth,
  v: number,
  doc: Pick<Doc, 'padH'>,
  kind: ImageKind,
): void {
  const r = imageWidthRange(o, doc, kind);
  o.w = Math.max(r.min, Math.min(r.max, Math.round(+v || 0)));
}

/** 換單位：看起來的寬不變（數字跟著換算）。段落的 pct 不記 wu、頁面圖片記 wu:'pct'（同原作） */
export function setImageWidthUnit(
  o: ImageWidth,
  wu: ImageWidthUnit,
  doc: Pick<Doc, 'padH'>,
  kind: ImageKind,
): void {
  if ((o.wu === 'px' ? 'px' : 'pct') === wu) return;
  const mm = imageWidthMmOf(o, doc, kind);
  if (wu === 'px') {
    o.wu = 'px';
    o.w = Math.round(mm / PX_MM);
  } else {
    if (kind === 'page') o.wu = 'pct';
    else delete o.wu;
    o.w = Math.max(1, Math.min(100, Math.round((mm / bodyWidthMm(doc)) * 100)));
  }
}

/** 「實際寬度：約 N mm」的 N（0.1 mm） */
export const imageWidthNote = (o: ImageWidth, doc: Pick<Doc, 'padH'>, kind: ImageKind): number =>
  Math.round(imageWidthMmOf(o, doc, kind) * 10) / 10;

/** 設定配置（F151）：繞排為欄內、其他全寬（自由配置改成頁面圖片，見 ops 的 imageToPage） */
export function setImagePos(b: Block, pos: Exclude<ImagePos, 'free'>): void {
  b.pos = pos;
  b.fl = pos === 'left' ? 'l' : pos === 'right' ? 'r' : '';
  b.cols = pos === 'left' || pos === 'right' ? 2 : 1;
}

/** 繞排圖片的位移（只在單欄頁有效） */
export function imageOffset(b: Block, pageCols: number): { dy: number; dx: number } {
  const on = pageCols !== 2;
  return { dy: on ? +(b.dy ?? 0) || 0 : 0, dx: on ? +(b.dx ?? 0) || 0 : 0 };
}

/* ---------- 外框與陰影（2026-10，上游 v3.16.0） ---------- */

export const IMAGE_FRAMES: readonly (readonly [ImageFrame | '', string])[] = [
  ['', '無'],
  ['thin', '細線'],
  ['thick', '粗線'],
  ['double', '雙線'],
];

/** 外框的粗細（雙線要三條的寬才看得出兩條，所以比較粗） */
export const IMAGE_FRAME_W: Readonly<Record<ImageFrame, string>> = {
  thin: '.3mm',
  thick: '1mm',
  double: '1.2mm',
};

export const IMAGE_SHADOWS: readonly (readonly [ImageShadow | '', string])[] = [
  ['', '無'],
  ['s', '淡'],
  ['m', '中'],
  ['l', '濃'],
];

const FRAMES = new Set<string>(['thin', 'thick', 'double']);
const SHADOWS = new Set<string>(['s', 'm', 'l']);

export const imageFrameOf = (o: ImageFx): ImageFrame | '' =>
  FRAMES.has(String(o.fr)) ? (o.fr as ImageFrame) : '';
export const imageShadowOf = (o: ImageFx): ImageShadow | '' =>
  SHADOWS.has(String(o.sh)) ? (o.sh as ImageShadow) : '';

/** 讀入時：不認得的值去掉（＝無） */
export function fixImageFx(o: ImageFx, colors: readonly { k: BoxColorKey }[]): void {
  if (!imageFrameOf(o)) delete o.fr;
  if (!colors.some((c) => c.k === o.frc)) delete o.frc;
  if (!imageShadowOf(o)) delete o.sh;
}

/** 段落 ⇄ 頁面圖片時把外框與陰影一起帶過去 */
export function copyImageFx(from: ImageFx, to: ImageFx): void {
  for (const k of ['fr', 'frc', 'sh'] as const) {
    if (from[k]) (to as Record<string, unknown>)[k] = from[k];
    else delete to[k];
  }
}
