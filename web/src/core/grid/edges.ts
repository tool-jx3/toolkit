/**
 * 方格的「邊」：依兩側的格子決定每一條格線段要畫什麼，再把同一條線上相鄰、種類相同的段接成一長段。
 * 室內平面圖（floor-plan）的自動牆壁靠這個：房間佔的格子 → 兩側不同房間的邊是內牆、外側是外牆…；
 * 地圖編輯器之類的方格工具要在不同填色之間畫分界線時也可以用。另有一維區間的扣除（門窗把牆切開）。
 *
 * 座標以「格」為單位：橫線 y＝c 是第 c−1 列與第 c 列之間的線；直線 x＝c 是第 c−1 欄與第 c 欄之間的線。
 */

/** 一段沿格線的直線：o＝'h' 橫線（y＝c、x 從 a 到 b）、'v' 直線（x＝c、y 從 a 到 b） */
export interface EdgeRun<K> {
  o: 'h' | 'v';
  c: number;
  a: number;
  b: number;
  kind: K;
}

export interface CellBounds {
  /** 範圍（格；含 x0、y0，不含 x1、y1） */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 掃過範圍內的每一條單位邊：`cellAt(col, row)` 取那一格的內容（沒有時 null），`classify(前, 後)` 決定這條邊的種類
 * （null＝不畫；橫線的「前」是上面那格、「後」是下面那格；直線是左、右）。同一條線上連續、`kind` 相同（===）的邊接成一段。
 * 範圍外的格子一律當作 null（所以範圍邊上的格子也會得到外側的邊）。結果依「橫線由上到下、每條由左到右」，再「直線由左到右」排列。
 */
export function squareEdgeRuns<T, K>(
  bounds: CellBounds,
  cellAt: (col: number, row: number) => T | null,
  classify: (before: T | null, after: T | null) => K | null,
): EdgeRun<K>[] {
  const { x0, y0, x1, y1 } = bounds;
  const runs: EdgeRun<K>[] = [];
  const get = (x: number, y: number) =>
    x >= x0 && x < x1 && y >= y0 && y < y1 ? cellAt(x, y) : null;
  for (let y = y0; y <= y1; y++) {
    let cur: EdgeRun<K> | null = null;
    for (let x = x0; x < x1; x++) {
      const kind = classify(get(x, y - 1), get(x, y));
      if (cur && kind !== null && cur.kind === kind) {
        cur.b = x + 1;
        continue;
      }
      if (cur) runs.push(cur);
      cur = kind === null ? null : { o: 'h', c: y, a: x, b: x + 1, kind };
    }
    if (cur) runs.push(cur);
  }
  for (let x = x0; x <= x1; x++) {
    let cur: EdgeRun<K> | null = null;
    for (let y = y0; y < y1; y++) {
      const kind = classify(get(x - 1, y), get(x, y));
      if (cur && kind !== null && cur.kind === kind) {
        cur.b = y + 1;
        continue;
      }
      if (cur) runs.push(cur);
      cur = kind === null ? null : { o: 'v', c: x, a: y, b: y + 1, kind };
    }
    if (cur) runs.push(cur);
  }
  return runs;
}

/** 扣掉區間之後的一段：`cutA`／`cutB` 表示起點／終點是被切出來的（原本的端點不是） */
export type CutSpan<S> = S & { cutA?: boolean; cutB?: boolean };

/**
 * 一維區間的扣除：`spans`（各有 a ≤ b）扣掉 `cuts`（[起, 迄]），回傳剩下的片段（保留原本的其他欄位）。
 * 誤差 1e-6 內視為相接；長度 ≤ 1e-6 的片段丟掉。被切出來的端點標 `cutA`／`cutB`（例如門窗切開的牆，端點不加收邊）。
 */
export function subtractSpans<S extends { a: number; b: number }>(
  spans: readonly S[],
  cuts: readonly (readonly [number, number])[],
): CutSpan<S>[] {
  const EPS = 1e-6;
  let out: CutSpan<S>[] = spans.map((s) => ({ ...s }));
  for (const [ca, cb] of cuts) {
    const next: CutSpan<S>[] = [];
    for (const s of out) {
      if (cb <= s.a + EPS || ca >= s.b - EPS) {
        next.push(s);
        continue;
      }
      if (ca > s.a + EPS) next.push({ ...s, b: ca, cutB: true });
      if (cb < s.b - EPS) next.push({ ...s, a: cb, cutA: true });
    }
    out = next;
  }
  return out.filter((s) => s.b - s.a > EPS);
}
