/**
 * 抽籤與卡片的幾何（純函式，規格 3.2～3.4、3.6）：
 * - drawResult：用種子（mulberry32）依原作的順序抽出這一張的結果；
 * - specOf：畫出這一張需要的全部設定＋抽出來的結果（分享連結就是存這個）；
 * - buildCard：實際的刮開區、每個結果的位置（flex 換行置中的算法）、個別塗層的形狀。
 * 預覽、互動 HTML、分享連結的畫面都從 buildCard 的結果畫，所以塗層一定和結果對齊。
 */
import { createRandom } from '@/core/timeline';
import { ICON_COUNT } from './icons';
import {
  type Anchor,
  type BgFit,
  type ContentKind,
  type CoverShape,
  DEFAULT_TEXT_COLOR,
  type ImageRef,
  type ImageStyle,
  type Rect,
  type ScratchState,
  sentenceList,
} from './model';
import { S } from './strings';

/* ---------- 抽籤（3.6） ---------- */

export type Drawn =
  | { kind: 'icons'; icons: number[] }
  | { kind: 'sentence'; text: string }
  | { kind: 'image-icon'; images: ImageRef[] }
  | { kind: 'image-full'; image: ImageRef }
  /** 內容是圖片但清單是空的 */
  | { kind: 'no-images' };

export function drawResult(
  s: Pick<ScratchState, 'kind' | 'count' | 'sentences' | 'images'>,
  seed: number,
): Drawn {
  const rng = createRandom(seed);
  const pick = (n: number) => Math.floor(rng.next() * n);
  switch (s.kind) {
    case 'icons':
      return { kind: 'icons', icons: Array.from({ length: s.count }, () => pick(ICON_COUNT)) };
    case 'sentence': {
      const list = sentenceList(s.sentences);
      if (!list.length) list.push(S.noResult);
      return { kind: 'sentence', text: list[pick(list.length)] };
    }
    case 'image-icon':
      if (!s.images.length) return { kind: 'no-images' };
      return {
        kind: 'image-icon',
        images: Array.from({ length: s.count }, () => s.images[pick(s.images.length)]),
      };
    case 'image-full':
      if (!s.images.length) return { kind: 'no-images' };
      return { kind: 'image-full', image: s.images[pick(s.images.length)] };
  }
}

/* ---------- 一張卡的設定＋結果 ---------- */

export interface CardSpec {
  width: number;
  height: number;
  expert: boolean;
  bgColor: string;
  bgImage: ImageRef | null;
  bgFit: BgFit;
  zone: Rect;
  titleText: string;
  titleColor: string;
  titleSize: number;
  titlePos: Anchor;
  coverText: string;
  coverColor: string;
  brush: number;
  /** 內容種類（no-images 時決定是小圖還是蓋滿） */
  kind: ContentKind;
  coverShape: CoverShape;
  sentenceSize: number;
  sentenceColor: string;
  imageSize: number;
  imageStyle: ImageStyle;
  trim: boolean;
  result: Drawn;
}

export function specOf(s: ScratchState): CardSpec {
  return {
    width: s.width,
    height: s.height,
    expert: s.expert,
    bgColor: s.bgColor,
    bgImage: s.bgImage,
    bgFit: s.bgFit,
    zone: { ...s.zone },
    titleText: s.titleText,
    titleColor: s.titleColor,
    titleSize: s.titleSize,
    titlePos: s.titlePos,
    coverText: s.coverText,
    coverColor: s.coverColor,
    brush: s.brush,
    kind: s.kind,
    coverShape: s.coverShape,
    sentenceSize: s.sentenceSize,
    sentenceColor: s.sentenceColor,
    imageSize: s.imageSize,
    imageStyle: s.imageStyle,
    trim: s.trim,
    result: drawResult(s, s.seed),
  };
}

/* ---------- 幾何 ---------- */

/** 結果層四周留白、結果的間隔、左右各多佔的寬（原作的 padding 20、gap 10、margin 0 8px） */
export const RESULT_PAD = 20;
export const RESULT_GAP = 10;
export const ITEM_MARGIN_X = 8;
/** 個別塗層往外擴的距離 */
export const COVER_PAD = 15;
/** 標題層四周留白 */
export const TITLE_PAD = 16;

/** 圖示的邊長：數量 > 5 時 30，否則 48 */
export const iconSize = (count: number): number => (count > 5 ? 30 : 48);

/** 實際的刮開區：進階設定關閉時整張卡；打開時和卡片的交集（空的時候整張卡） */
export function effectiveZone(spec: Pick<CardSpec, 'width' | 'height' | 'expert' | 'zone'>): Rect {
  const full = { x: 0, y: 0, w: spec.width, h: spec.height };
  if (!spec.expert) return full;
  const z = spec.zone;
  const x0 = Math.max(0, z.x);
  const y0 = Math.max(0, z.y);
  const x1 = Math.min(spec.width, z.x + z.w);
  const y1 = Math.min(spec.height, z.y + z.h);
  if (x1 - x0 < 1 || y1 - y0 < 1) return full;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * n 個 size × size 的結果在刮開區裡的位置（卡片座標）：同 CSS 的
 * `display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:10px; padding:20px`
 * （每個左右各有 8 的外距；align-content 為 normal＝有多的高度時平均分給每一列，不夠時從上緣排）。
 */
export function flexItems(n: number, size: number, zone: Rect): Rect[] {
  const cx = zone.x + RESULT_PAD;
  const cy = zone.y + RESULT_PAD;
  const cw = Math.max(0, zone.w - RESULT_PAD * 2);
  const ch = Math.max(0, zone.h - RESULT_PAD * 2);
  const outer = size + ITEM_MARGIN_X * 2;
  /* 1. 分列 */
  const lines: number[] = [];
  let used = 0;
  for (let i = 0; i < n; i++) {
    if (lines.length && used + RESULT_GAP + outer <= cw) {
      lines[lines.length - 1]++;
      used += RESULT_GAP + outer;
    } else {
      lines.push(1);
      used = outer;
    }
  }
  /* 2. 列高（有多的高度平均分給每一列） */
  const total = lines.length * size + Math.max(0, lines.length - 1) * RESULT_GAP;
  const extra = lines.length && ch > total ? (ch - total) / lines.length : 0;
  const lineH = size + extra;
  /* 3. 每一列置中 */
  const out: Rect[] = [];
  let top = cy;
  for (const count of lines) {
    const width = count * outer + (count - 1) * RESULT_GAP;
    let left = cx + (cw - width) / 2;
    for (let k = 0; k < count; k++) {
      out.push({ x: left + ITEM_MARGIN_X, y: top + (lineH - size) / 2, w: size, h: size });
      left += outer + RESULT_GAP;
    }
    top += lineH + RESULT_GAP;
  }
  return out;
}

/** 個別塗層的一塊（外接方形；round＝圓形） */
export interface CoverPiece extends Rect {
  round: boolean;
}

/** 每個結果往外擴 15：圓（半徑＝(邊長＋30) ÷ 2，以外接方形表示）或方形 */
export function coverPieces(items: readonly Rect[], shape: 'circle' | 'rect'): CoverPiece[] {
  return items.map((b) => {
    const iw = b.w + COVER_PAD * 2;
    const ih = b.h + COVER_PAD * 2;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (shape === 'circle') {
      const r = Math.max(iw, ih) / 2;
      return { x: cx - r, y: cy - r, w: r * 2, h: r * 2, round: true };
    }
    return { x: cx - iw / 2, y: cy - ih / 2, w: iw, h: ih, round: false };
  });
}

/* ---------- 卡片 ---------- */

export type CardResult =
  | { kind: 'icons'; size: number; items: { icon: number; box: Rect }[] }
  | { kind: 'images'; style: ImageStyle; trim: boolean; items: { image: ImageRef; box: Rect }[] }
  | { kind: 'sentence'; text: string; size: number; color: string }
  | { kind: 'full'; image: ImageRef; radius: number }
  | { kind: 'empty'; text: string };

export interface Card {
  width: number;
  height: number;
  zone: Rect;
  background: { color: string; image: ImageRef | null; fit: BgFit };
  /** 結果層的淡色斜條紋（進階設定關閉時） */
  stripes: boolean;
  title: { text: string; color: string; size: number; pos: Anchor } | null;
  cover: { color: string; text: string; brush: number; pieces: CoverPiece[] };
  result: CardResult;
}

export function buildCard(spec: CardSpec): Card {
  const zone = effectiveZone(spec);
  const expert = spec.expert;
  const r = spec.result;
  let result: CardResult;
  let boxes: Rect[] = [];
  switch (r.kind) {
    case 'icons': {
      const size = iconSize(r.icons.length);
      boxes = flexItems(r.icons.length, size, zone);
      result = { kind: 'icons', size, items: r.icons.map((icon, i) => ({ icon, box: boxes[i] })) };
      break;
    }
    case 'image-icon':
      boxes = flexItems(r.images.length, spec.imageSize, zone);
      result = {
        kind: 'images',
        style: spec.imageStyle,
        trim: spec.trim,
        items: r.images.map((image, i) => ({ image, box: boxes[i] })),
      };
      break;
    case 'sentence':
      result = {
        kind: 'sentence',
        text: r.text,
        size: spec.sentenceSize,
        color: expert ? spec.sentenceColor : DEFAULT_TEXT_COLOR,
      };
      break;
    case 'image-full':
      result = { kind: 'full', image: r.image, radius: expert ? 0 : 12 };
      break;
    case 'no-images':
      result = { kind: 'empty', text: S.noImages };
      break;
  }
  const individual =
    expert && spec.coverShape !== 'zone' && boxes.length > 0
      ? coverPieces(boxes, spec.coverShape)
      : [];
  const title = spec.titleText.trim();
  return {
    width: spec.width,
    height: spec.height,
    zone,
    background: expert
      ? { color: spec.bgColor, image: spec.bgImage, fit: spec.bgFit }
      : { color: '#ffffff', image: null, fit: 'cover' },
    stripes: !expert,
    title:
      expert && title
        ? { text: spec.titleText, color: spec.titleColor, size: spec.titleSize, pos: spec.titlePos }
        : null,
    cover: {
      color: spec.coverColor,
      text: spec.coverText,
      brush: spec.brush,
      pieces: individual,
    },
    result,
  };
}

/** 卡片用到的圖片（背景＋結果） */
export function cardImages(
  card: Card,
): { image: ImageRef; trim: boolean; role: 'bg' | 'result' }[] {
  const out: { image: ImageRef; trim: boolean; role: 'bg' | 'result' }[] = [];
  if (card.background.image) out.push({ image: card.background.image, trim: false, role: 'bg' });
  const r = card.result;
  if (r.kind === 'images')
    for (const it of r.items) out.push({ image: it.image, trim: r.trim, role: 'result' });
  if (r.kind === 'full') out.push({ image: r.image, trim: false, role: 'result' });
  return out;
}
