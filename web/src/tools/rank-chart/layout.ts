/**
 * 圖的版面（純計算；量字寬的函式由呼叫端給，Node 測試可以用假的）：標題三行的字級與換行、名次列、
 * 右欄（排名者照片／下一位的卡片）、卡片的位置與大小、沒出場角色的附錄。數值依原作（規格第 3 節）。
 */
import {
  CANVAS_W,
  CARD_SIZE_MAX,
  CARD_SIZE_MIN,
  type Config,
  canvasHeight,
  chars,
  clamp,
  type Rect,
  type TitleParts,
  titleParts,
} from './model';

/** 量一段文字的寬度（字級 size px、字重 weight） */
export type Measure = (text: string, size: number, weight: number) => number;

/** 行高＝字級 × 1.28 */
export const LINE_HEIGHT = 1.28;

/** 逐字換行：加上下一個字會超過 maxWidth 時換行（每段 \n 分開） */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of chars(para)) {
      if (line && measure(line + ch) > maxWidth) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

export interface FittedText {
  size: number;
  lines: string[];
  height: number;
  weight: number;
}

/**
 * 自動縮小：從 maxSize 往下一次減 1 px，直到不超過 maxLines 行；到 minSize 還放不下時，
 * 只留 maxLines 行、最後一行截短加「…」。
 */
export function fitText(
  measure: Measure,
  text: string,
  width: number,
  maxSize: number,
  minSize = 14,
  maxLines = 1,
  weight = 700,
): FittedText {
  let size = maxSize;
  let lines: string[] = [];
  for (; size >= minSize; size--) {
    const s = size;
    lines = wrapText((t) => measure(t, s, weight), text, width);
    if (lines.length <= maxLines) break;
  }
  size = Math.max(size, minSize);
  const m = (t: string) => measure(t, size, weight);
  lines = wrapText(m, text, width);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && m(`${last}…`) > width) last = chars(last).slice(0, -1).join('');
    lines[maxLines - 1] = `${last}…`;
  }
  return { size, lines, height: lines.length * size * LINE_HEIGHT, weight };
}

export interface RankRow extends Rect {
  index: number;
}

export interface Layout {
  W: number;
  H: number;
  parts: TitleParts;
  first: FittedText;
  second: FittedText;
  third: FittedText;
  firstY: number;
  secondY: number;
  thirdY: number;
  /** 標題下方分隔線的 y */
  headerBottom: number;
  bodyY: number;
  bodyH: number;
  /** 左欄（名次） */
  rank: Rect;
  /** 右欄（排名者照片／下一位） */
  right: Rect;
  rows: RankRow[];
}

const EMPTY: FittedText = { size: 0, lines: [], height: 0, weight: 800 };

/** 整張圖的版面 */
export function buildLayout(
  c: Pick<Config, 'format' | 'slots' | 'name' | 'intro' | 'subject' | 'question'>,
  measure: Measure,
): Layout {
  const H = canvasHeight(c);
  const parts = titleParts(c);
  const first = fitText(measure, parts.first, 980, 33, 21, 2, 700);
  const second = fitText(measure, parts.second, 980, 58, 22, 2, 900);
  const third = parts.third ? fitText(measure, parts.third, 980, 49, 19, 2, 800) : { ...EMPTY };
  /* 標題太長時整組等比例縮小，不吃掉名次的空間（正方形、名次多時預算較少） */
  const budget = H === 1080 ? (c.slots > 10 ? 175 : 245) : c.slots > 12 ? 270 : 360;
  const total = first.height + second.height + third.height;
  if (total > budget) {
    const k = budget / total;
    for (const f of [first, second, third]) {
      f.size *= k;
      f.height *= k;
    }
  }
  const firstY = 91;
  const secondY = firstY + first.height + 11;
  const thirdY = secondY + second.height + 8;
  const headerBottom = thirdY + third.height + 26;
  const bodyY = headerBottom + 48;
  const bodyH = H - bodyY - 88;
  const rank = { x: 50, y: bodyY, width: 440, height: bodyH };
  const right = { x: 518, y: bodyY, width: 512, height: bodyH };
  const n = c.slots;
  const gap = n > 12 ? 6 : 10;
  const rowH = Math.min(142, (bodyH - (n - 1) * gap) / n);
  const rows = Array.from({ length: n }, (_, i) => ({
    x: rank.x,
    y: rank.y + i * (rowH + gap),
    width: rank.width,
    height: rowH,
    index: i,
  }));
  return {
    W: CANVAS_W,
    H,
    parts,
    first,
    second,
    third,
    firstY,
    secondY,
    thirdY,
    headerBottom,
    bodyY,
    bodyH,
    rank,
    right,
    rows,
  };
}

export interface CardBox {
  x: number;
  y: number;
  /** 圖片的邊長 */
  s: number;
  /** 圖片＋名字的總高 */
  h: number;
  /** 名字區的高度 */
  label: number;
}

/**
 * 「下一位」卡片：邊長＝右欄寬 × 卡片大小，但不超過右欄寬 − 44、也不超過 max(75, 右欄高 − 210)（畫面不夠高時變小）。
 * 有排名者照片時位置照設定（0～1），沒有時水平置中、垂直在可用範圍的 34%。
 */
export function cardBox(
  layout: Pick<Layout, 'right'>,
  c: Pick<Config, 'overlay' | 'portrait'>,
): CardBox {
  const r = layout.right;
  const requested = r.width * clamp(c.overlay.size, CARD_SIZE_MIN, CARD_SIZE_MAX);
  const s = Math.min(requested, r.width - 44, Math.max(75, r.height - 210));
  const label = Math.min(74, Math.max(48, s * 0.23));
  const h = s + label;
  const has = !!c.portrait.photo;
  const x = r.x + 22 + (r.width - 44 - s) * (has ? c.overlay.x : 0.5);
  const y = r.y + 25 + Math.max(0, r.height - h - 108) * (has ? c.overlay.y : 0.34);
  return { x, y, s, h, label };
}

/** 卡片大小被畫面高度限制住了（設定的大小比實際大） */
export const cardLimited = (
  layout: Pick<Layout, 'right'>,
  c: Pick<Config, 'overlay' | 'portrait'>,
) => cardBox(layout, c).s + 1 < layout.right.width * c.overlay.size;

/** 卡片可以移動的範圍（擺放時的換算：位移 ÷ 範圍＝位置的變化） */
export const cardTravel = (layout: Pick<Layout, 'right'>, box: CardBox) => ({
  x: Math.max(1, layout.right.width - 44 - box.s),
  y: Math.max(1, layout.right.height - box.h - 108),
});

/** 擺放：卡片按住的範圍（含上方的提示標籤）與右下角的大小控點（±36） */
export const CARD_GRAB = { left: 13, top: 26, right: 13, bottom: 13 } as const;
export const RESIZE_HIT = 36;
export const resizeHandlePoint = (b: CardBox) => ({ x: b.x + b.s + 5, y: b.y + b.h + 5 });

export type PlacementHit = 'resize' | 'card' | 'photo' | null;

/** 擺放模式下按到什麼：右下控點 → 卡片 → 右欄的照片；右欄以外不算 */
export function placementHit(
  layout: Pick<Layout, 'right'>,
  b: CardBox,
  p: { x: number; y: number },
): PlacementHit {
  const r = layout.right;
  if (p.x < r.x || p.x > r.x + r.width || p.y < r.y || p.y > r.y + r.height) return null;
  const h = resizeHandlePoint(b);
  if (Math.abs(p.x - h.x) < RESIZE_HIT && Math.abs(p.y - h.y) < RESIZE_HIT) return 'resize';
  if (
    p.x >= b.x - CARD_GRAB.left &&
    p.x <= b.x + b.s + CARD_GRAB.right &&
    p.y >= b.y - CARD_GRAB.top &&
    p.y <= b.y + b.h + CARD_GRAB.bottom
  )
    return 'card';
  return 'photo';
}

/** 沒出場角色的附錄高度（一列 8 位） */
export const missingAppendixHeight = (n: number): number =>
  n ? 120 + Math.ceil(n / 8) * 162 + 38 : 0;

/** 附錄裡第 i 位的格子（左上角；圖片 103 px 在格子裡往右 5 px） */
export const missingCell = (H: number, i: number) => ({
  x: 50 + (i % 8) * 122,
  y: H + 112 + Math.floor(i / 8) * 162,
});

/** 名次列裡的位置（縮圖、編號、文字） */
export function rowParts(row: Rect) {
  const numW = 48;
  const pad = Math.max(6, Math.min(13, row.height * 0.1));
  const s = Math.min(108, row.height - pad * 2);
  const imageX = row.x + numW + pad;
  const numSize = Math.min(33, row.height * 0.37);
  const tx = imageX + s + Math.min(18, row.height * 0.16);
  const tw = row.x + row.width - tx - 33;
  return { numW, pad, s, imageX, numSize, tx, tw };
}
