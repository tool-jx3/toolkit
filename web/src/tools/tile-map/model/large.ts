/**
 * 大圖塊（佔好幾格的圖塊）：佔的格數、來源圖上每一小塊的範圍、放下去時每一格放哪一塊、
 * 在一片範圍裡排得下幾個（填滿與圖形用）。
 */
import type { Placed, Rect, TileDef, Turn } from './types';

/** 圖塊佔的格數 [欄, 列]（一般圖塊 1 × 1） */
export const spanOf = (tile: Pick<TileDef, 'span'> | undefined | null): readonly [number, number] =>
  tile?.span ?? [1, 1];

/** 轉向之後佔的格數（轉 90° 或 270° 時欄列對調） */
export function turnedSpan(span: readonly [number, number], r: number): [number, number] {
  return r % 2 ? [span[1], span[0]] : [span[0], span[1]];
}

/** 大圖塊的一小格在來源圖上的大小（px） */
export function cellSize(tile: Pick<TileDef, 'rect' | 'span' | 'gap'>): [number, number] {
  const [cols, rows] = spanOf(tile);
  const gap = tile.gap ?? 0;
  return [(tile.rect[2] - (cols - 1) * gap) / cols, (tile.rect[3] - (rows - 1) * gap) / rows];
}

/** 這一格（大圖塊的第 p 塊；一般圖塊整張）在來源圖上的範圍 */
export function partRect(
  tile: Pick<TileDef, 'rect' | 'span' | 'gap'>,
  part?: readonly [number, number],
): Rect {
  if (!part || !tile.span) return tile.rect;
  const [w, h] = cellSize(tile);
  const gap = tile.gap ?? 0;
  return [tile.rect[0] + part[0] * (w + gap), tile.rect[1] + part[1] * (h + gap), w, h];
}

/**
 * 一個 cols × rows 的大圖塊（左右翻轉 f、順時針轉 r 個 90°）放下去時，每一塊落在離左上角幾格的地方。
 * 先翻轉再轉向（和畫一格時的順序相同）。回傳 [來源的欄, 列, 落點 x, 落點 y]。
 */
export function placeParts(
  span: readonly [number, number],
  r: Turn,
  f: boolean,
): [number, number, number, number][] {
  const [w, h] = span;
  const out: [number, number, number, number][] = [];
  for (let sy = 0; sy < h; sy++)
    for (let sx = 0; sx < w; sx++) {
      const x = f ? w - 1 - sx : sx;
      const y = sy;
      let px = x;
      let py = y;
      if (r === 1) {
        px = h - 1 - y;
        py = x;
      } else if (r === 2) {
        px = w - 1 - x;
        py = h - 1 - y;
      } else if (r === 3) {
        px = y;
        py = w - 1 - x;
      }
      out.push([sx, sy, px, py]);
    }
  return out;
}

/**
 * 一片格子（填滿的範圍、圖形的格子）裡排大圖塊的左上角：從範圍的外框左上角起，每 span 格一個，
 * 整個大圖塊都在範圍裡才放。1 × 1 時就是範圍本身。
 */
export function anchorsIn(
  cells: readonly (readonly [number, number])[],
  span: readonly [number, number],
): [number, number][] {
  if (!cells.length) return [];
  if (span[0] === 1 && span[1] === 1) return cells.map(([x, y]) => [x, y]);
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const inside = new Set<string>();
  for (const [x, y] of cells) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    inside.add(`${x},${y}`);
  }
  const out: [number, number][] = [];
  for (let y = top; y + span[1] - 1 <= bottom; y += span[1])
    for (let x = left; x + span[0] - 1 <= right; x += span[0]) {
      let fits = true;
      for (let dy = 0; dy < span[1] && fits; dy++)
        for (let dx = 0; dx < span[0]; dx++)
          if (!inside.has(`${x + dx},${y + dy}`)) {
            fits = false;
            break;
          }
      if (fits) out.push([x, y]);
    }
  return out;
}

/** 兩格放的東西是否相同（大圖塊連同哪一次放置、哪一塊都要相同） */
export function samePlaced(a: Placed | null | undefined, b: Placed | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.t === b.t &&
    a.r === b.r &&
    a.f === b.f &&
    a.i === b.i &&
    (a.p?.[0] ?? -1) === (b.p?.[0] ?? -1) &&
    (a.p?.[1] ?? -1) === (b.p?.[1] ?? -1)
  );
}

/** 填滿時「同一種」：同一個圖塊、同樣的轉向與翻轉（不管是哪一次放置的大圖塊）；兩格都空也算 */
export function sameKind(a: Placed | null | undefined, b: Placed | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.t === b.t && a.r === b.r && a.f === b.f;
}

const plain = new Map<string, Placed>();
/** 一般圖塊的放置（同樣的圖塊、轉向、翻轉共用同一個凍結的物件，省記憶體） */
export function placed(t: string, r: number = 0, f = false): Placed {
  const turn = (((r % 4) + 4) % 4) as Turn;
  const key = `${t}|${turn}|${f ? 1 : 0}`;
  let v = plain.get(key);
  if (!v) {
    v = Object.freeze({ t, r: turn, f });
    plain.set(key, v);
  }
  return v;
}

let seq = 0;
/** 新的大圖塊放置編號 */
export function newInstanceId(): string {
  seq = (seq + 1) % 1_000_000;
  return `${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
