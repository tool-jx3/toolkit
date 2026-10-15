/**
 * 卡片的版面（卡片單位＝CSS px；寬 380，輸出時乘上倍率）。純函式，量字由呼叫端給（畫布的 measureText 或測試用的假量字）。
 *
 * 由上往下：外框 1 → 色帶 118（左右留 22、上下留 20；左邊三行文字、右邊 78 的代表圖）→ 圖片格 378（四周與格間 2）
 * → 底部操作列 67（上框線 1、上下留 13、按鈕高 40；可以關掉）→ 外框 1。有底部操作列時 380 × 565，沒有時 380 × 498。
 */
import type { Rect } from '@/core/image';
import type { Cols } from './model';

export const CARD_W = 380;
export const BORDER = 1;
export const CARD_RADIUS = 6;

export const HEAD = { h: 118, padX: 22, padY: 20, gap: 16 } as const;
export const AVATAR = { size: 78, radius: 7, border: 2 } as const;
/** 色帶三行文字的字級與行框高（題目、關鍵字、補充說明）與行距 */
export const HEAD_TEXT = {
  prompt: { size: 12.5, weight: 500, box: 17, alpha: 0.92 },
  keyword: { size: 30, weight: 700, box: 33.6, alpha: 1 },
  note: { size: 11.5, weight: 500, box: 15, alpha: 0.78 },
  gapAfterPrompt: 5,
  gapAfterKeyword: 6,
} as const;

export const GRID = { h: 378, pad: 2, gap: 2 } as const;
export const FOOT = {
  h: 67,
  padX: 16,
  padY: 13,
  button: { h: 40, padX: 26, size: 14, weight: 600, radius: 4 },
  icon: 23,
  iconGap: 16,
} as const;

/** 勾選標示：框線寬、圓角，左上的勾勾圓的大小與位置 */
export const SELECTION = { line: 2.6, radius: 9, badge: 24, badgeInset: 6 } as const;

export type Measure = (text: string, font: { size: number; weight: number }) => number;

export interface CardLayout {
  width: number;
  height: number;
  head: Rect;
  /** 三行文字的外框（寬＝文字欄的寬；文字放不下時省略） */
  prompt: Rect;
  keyword: Rect;
  note: Rect;
  avatar: Rect;
  grid: Rect;
  cells: Rect[];
  foot: Rect | null;
  verify: Rect | null;
  icons: Rect[];
}

/** 格子邊長：(378 − 4 − 2 ×（欄數 − 1））÷ 欄數 → 3 × 3 約 123.33、4 × 4 是 92 */
export const cellSize = (cols: Cols): number =>
  (CARD_W - BORDER * 2 - GRID.pad * 2 - GRID.gap * (cols - 1)) / cols;

export function cardLayout(
  o: { cols: Cols; showFoot: boolean; verify: string },
  measure: Measure,
): CardLayout {
  const inner = CARD_W - BORDER * 2;
  const head: Rect = { x: BORDER, y: BORDER, width: inner, height: HEAD.h };
  const avatar: Rect = {
    x: BORDER + inner - HEAD.padX - AVATAR.size,
    y: BORDER + HEAD.padY,
    width: AVATAR.size,
    height: AVATAR.size,
  };
  const textX = BORDER + HEAD.padX;
  const textW = avatar.x - HEAD.gap - textX;
  const t = HEAD_TEXT;
  const textH = t.prompt.box + t.gapAfterPrompt + t.keyword.box + t.gapAfterKeyword + t.note.box;
  let y = BORDER + HEAD.padY + (AVATAR.size - textH) / 2;
  const prompt: Rect = { x: textX, y, width: textW, height: t.prompt.box };
  y += t.prompt.box + t.gapAfterPrompt;
  const keyword: Rect = { x: textX, y, width: textW, height: t.keyword.box };
  y += t.keyword.box + t.gapAfterKeyword;
  const note: Rect = { x: textX, y, width: textW, height: t.note.box };

  const grid: Rect = { x: BORDER, y: BORDER + HEAD.h, width: inner, height: GRID.h };
  const c = cellSize(o.cols);
  const cells: Rect[] = [];
  for (let r = 0; r < o.cols; r++)
    for (let k = 0; k < o.cols; k++)
      cells.push({
        x: grid.x + GRID.pad + k * (c + GRID.gap),
        y: grid.y + GRID.pad + r * (c + GRID.gap),
        width: c,
        height: c,
      });

  let foot: Rect | null = null;
  let verify: Rect | null = null;
  const icons: Rect[] = [];
  if (o.showFoot) {
    foot = { x: BORDER, y: grid.y + GRID.h, width: inner, height: FOOT.h };
    const b = FOOT.button;
    const w = Math.round(measure(o.verify, b) + b.padX * 2);
    const by = foot.y + 1 + FOOT.padY;
    verify = { x: foot.x + inner - FOOT.padX - w, y: by, width: w, height: b.h };
    for (let i = 0; i < 3; i++)
      icons.push({
        x: foot.x + FOOT.padX + i * (FOOT.icon + FOOT.iconGap),
        y: by + (b.h - FOOT.icon) / 2,
        width: FOOT.icon,
        height: FOOT.icon,
      });
  }
  const height = (foot ? foot.y + foot.height : grid.y + grid.height) + BORDER;
  return {
    width: CARD_W,
    height,
    head,
    prompt,
    keyword,
    note,
    avatar,
    grid,
    cells,
    foot,
    verify,
    icons,
  };
}

/** 卡片高度（不必量字） */
export const cardHeight = (showFoot: boolean): number =>
  BORDER * 2 + HEAD.h + GRID.h + (showFoot ? FOOT.h : 0);

/** 卡片座標上的一點落在哪一格（格子之間的縫、格子外：−1） */
export function cellAt(layout: Pick<CardLayout, 'cells'>, x: number, y: number): number {
  return layout.cells.findIndex(
    (r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height,
  );
}

/**
 * 放不下時省略成「…」：先整段量，超過寬度就一個字一個字往回刪，加上「…」（以字元計，emoji 不拆開）。
 */
export function ellipsize(text: string, maxWidth: number, width: (s: string) => number): string {
  if (width(text) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length && width(`${chars.join('')}…`) > maxWidth) chars.pop();
  return chars.length ? `${chars.join('').trimEnd()}…` : '…';
}
