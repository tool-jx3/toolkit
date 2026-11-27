/**
 * 畫布上的字：世界座標的字級常常小於 1（格），先放大 100 倍設字型再縮回去（瀏覽器對很小的字級處理不一）。
 */
import type { Ctx } from './kit';

export const SANS =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", system-ui, sans-serif';
export const SERIF = '"Noto Serif TC", "Songti TC", "PMingLiU", "MingLiU", serif';

const K = 100;

export interface TextStyle {
  size: number;
  weight?: number;
  family?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  color: string;
  /** 字距（字級的倍數） */
  tracking?: number;
}

const font = (s: Pick<TextStyle, 'weight' | 'family'>) =>
  `${s.weight ?? 400} ${K}px ${s.family ?? SANS}`;

/** 字的寬（格） */
export function textWidth(
  c: Ctx,
  text: string,
  s: Pick<TextStyle, 'size' | 'weight' | 'family' | 'tracking'>,
): number {
  c.save();
  c.font = font(s);
  const w = c.measureText(text).width;
  c.restore();
  const n = [...text].length;
  return (w / K) * s.size + (s.tracking ?? 0) * s.size * Math.max(0, n - 1);
}

export function drawText(c: Ctx, text: string, x: number, y: number, s: TextStyle): void {
  if (!text) return;
  c.save();
  c.translate(x, y);
  c.scale(s.size / K, s.size / K);
  c.font = font(s);
  c.fillStyle = s.color;
  c.textAlign = s.align ?? 'left';
  c.textBaseline = s.baseline ?? 'alphabetic';
  if (s.tracking) {
    /* 有字距時一個字一個字排（只用在很短的標題） */
    const chars = [...text];
    const gap = s.tracking * K;
    const widths = chars.map((ch) => c.measureText(ch).width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (chars.length - 1);
    let cx =
      s.align === 'center' ? -total / 2 : s.align === 'right' || s.align === 'end' ? -total : 0;
    c.textAlign = 'left';
    chars.forEach((ch, i) => {
      c.fillText(ch, cx, 0);
      cx += widths[i] + gap;
    });
  } else c.fillText(text, 0, 0);
  c.restore();
}

/** 放得進 maxW 的字（太長時切掉尾巴加「…」） */
export function fitText(
  c: Ctx,
  text: string,
  maxW: number,
  s: Pick<TextStyle, 'size' | 'weight' | 'family'>,
): string {
  if (textWidth(c, text, s) <= maxW) return text;
  const chars = [...text];
  while (chars.length && textWidth(c, `${chars.join('')}…`, s) > maxW) chars.pop();
  return chars.length ? `${chars.join('')}…` : '…';
}

/** 依寬度換行：英數連在一起的當一個字、不從中間切開（除非一個字本身就太長），其他字一個一個排。
 * 最多 maxLines 行，放不下的部分併進最後一行並加「…」 */
export function wrapText(
  c: Ctx,
  text: string,
  maxW: number,
  s: Pick<TextStyle, 'size' | 'weight' | 'family'>,
  maxLines: number,
): string[] {
  const words = text.trim().match(/[\x21-\x7e]+|\s+|./gsu) ?? [];
  const over = (t: string) => textWidth(c, t, s) > maxW;
  const rows: string[] = [];
  let row = '';
  const breakRow = () => {
    rows.push(row.trimEnd());
    row = '';
  };
  for (const word of words) {
    if (/^\s/.test(word)) {
      if (row) row += ' ';
      continue;
    }
    if (row && over(row + word)) breakRow();
    if (!over(word)) {
      row += word;
      continue;
    }
    for (const ch of word) {
      if (row && over(row + ch)) breakRow();
      row += ch;
    }
  }
  if (row.trim()) breakRow();
  if (rows.length === 0) return [''];
  const keep = Math.max(1, maxLines);
  if (rows.length <= keep) return rows;
  /* 超過的行接回去（英數之間補空白）再切尾巴 */
  const rest = rows
    .slice(keep - 1)
    .reduce(
      (acc, r) =>
        acc && /[\x21-\x7e]$/.test(acc) && /^[\x21-\x7e]/.test(r) ? `${acc} ${r}` : acc + r,
      '',
    );
  return [...rows.slice(0, keep - 1), fitText(c, rest, maxW, s)];
}
