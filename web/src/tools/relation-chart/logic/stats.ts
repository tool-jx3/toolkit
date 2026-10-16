/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 統計與尋路（F118；原作的 statsVisRels、statsGrelPairs、statsAdjacency、statsShortestChain、statsNDegree）。
 * 和互動網頁的找關係路徑（viewerRuntime 的 runPath）同一套：不分方向、自我關係不算、只看沒隱藏的關係類型；
 * 鄰接照「個別關係（清單順序）→ 群體關係的衍生對」建，先找到的路徑為準（兩邊同一組資料走出同一條）。
 */

import { sheetCtx } from '../engine/geom';
import {
  aliveGrels,
  grelEndIsLbl,
  grelEndMembers,
  grelEndName,
  grelExcluded,
} from '../engine/labels';
import type { Label, Sheet } from '../model/types';
import { S } from '../strings';

/** 群體關係的衍生對（原作 statsGrelPairs／互動網頁的 gpairs） */
export interface GrelPair {
  from: number;
  to: number;
  /** 關係類型的名稱（換行收成空白） */
  l: string;
  /** 「來自標籤：…」 */
  v: string;
  type: number;
}

/**
 * 只算「算到每位成員」的規則；隱藏的關係類型不算；同屬兩端的跳過、例外排除、兩人之間已經有同一種個別關係的不重複；
 * 上限 2 萬對。
 */
export function grelPairs(sheet: Sheet, labels: readonly Label[]): GrelPair[] {
  const ctx = sheetCtx(sheet, labels);
  const gs = aliveGrels(ctx).filter((g) => g.inherit);
  const out: GrelPair[] = [];
  if (!gs.length) return out;
  let budget = 20000;
  for (const g of gs) {
    const tg = ctx.typeById.get(g.type);
    if (!tg || tg.hidden) continue;
    const mf = grelEndMembers(ctx, g.from);
    const mt = grelEndMembers(ctx, g.to);
    const sf = new Set(mf.map((c) => c.id));
    const st = new Set(mt.map((c) => c.id));
    const viaOf = (e: string) => (grelEndIsLbl(e) ? grelEndName(ctx, e) : '');
    const via = viaOf(g.from) || viaOf(g.to);
    const label = tg.label.replace(/\n+/g, ' ');
    for (const a of mf) {
      if (st.has(a.id) || grelExcluded(g, a.id)) continue;
      for (const b of mt) {
        if (budget <= 0) return out;
        if (a.id === b.id || sf.has(b.id) || grelExcluded(g, b.id)) continue;
        if (
          sheet.rels.some(
            (r) =>
              r.type === g.type &&
              ((r.from === a.id && r.to === b.id) || (r.from === b.id && r.to === a.id)),
          )
        )
          continue;
        budget--;
        out.push({ from: a.id, to: b.id, l: label, v: via ? S.grel.via(via) : '', type: g.type });
      }
    }
  }
  return out;
}

/** 一條邊：個別關係（rel＝關係 id）或群體關係的衍生對（rel＝null） */
export interface StatEdge {
  from: number;
  to: number;
  rel: number | null;
}

/** 統計用的邊：沒隱藏的關係類型、兩端都在、不含自我關係（清單順序）＋群體關係的衍生對 */
export function statEdges(sheet: Sheet, labels: readonly Label[]): StatEdge[] {
  const ids = new Set(sheet.chars.map((c) => c.id));
  const vis = new Set(sheet.types.filter((t) => !t.hidden).map((t) => t.id));
  const out: StatEdge[] = [];
  for (const r of sheet.rels)
    if (vis.has(r.type) && ids.has(r.from) && ids.has(r.to) && r.from !== r.to)
      out.push({ from: r.from, to: r.to, rel: r.id });
  for (const g of grelPairs(sheet, labels)) out.push({ from: g.from, to: g.to, rel: null });
  return out;
}

/** 度數＝關係的端點數（雙向線也只算一條；同兩人多條線各算） */
export function degrees(sheet: Sheet, edges: readonly StatEdge[]): Map<number, number> {
  const deg = new Map(sheet.chars.map((c) => [c.id, 0]));
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  return deg;
}

/** 中心度排行：度數 > 0 的前 10 位（同分照角色清單順序） */
export function ranking(
  sheet: Sheet,
  deg: ReadonlyMap<number, number>,
): { id: number; n: number }[] {
  return sheet.chars
    .map((c) => ({ id: c.id, n: deg.get(c.id) ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
}

/** 孤立角色（度數 0；清單順序） */
export const isolated = (sheet: Sheet, deg: ReadonlyMap<number, number>): number[] =>
  sheet.chars.filter((c) => !((deg.get(c.id) ?? 0) > 0)).map((c) => c.id);

function adjacency(sheet: Sheet, edges: readonly StatEdge[]) {
  const adj = new Map<number, { to: number; rel: number | null }[]>(
    sheet.chars.map((c) => [c.id, []]),
  );
  for (const e of edges) {
    adj.get(e.from)?.push({ to: e.to, rel: e.rel });
    adj.get(e.to)?.push({ to: e.from, rel: e.rel });
  }
  return adj;
}

/** 最短關係鏈（無向 BFS；先找到的為準）。找不到＝null */
export function shortestChain(
  sheet: Sheet,
  edges: readonly StatEdge[],
  a: number,
  b: number,
): { chars: number[]; rels: (number | null)[] } | null {
  if (a === b) return { chars: [a], rels: [] };
  const adj = adjacency(sheet, edges);
  const prev = new Map<number, { from: number; rel: number | null } | null>([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift() as number;
    for (const step of adj.get(cur) ?? []) {
      if (prev.has(step.to)) continue;
      prev.set(step.to, { from: cur, rel: step.rel });
      if (step.to === b) {
        const chars = [b];
        const rels: (number | null)[] = [];
        let n = b;
        for (let p = prev.get(n); p; p = prev.get(n)) {
          rels.unshift(p.rel);
          chars.unshift(p.from);
          n = p.from;
        }
        return { chars, rels };
      }
      queue.push(step.to);
    }
  }
  return null;
}

/** N 度聚焦：n 層內的角色，以及兩端都在這個集合裡的所有可見關係 */
export function nDegree(
  sheet: Sheet,
  edges: readonly StatEdge[],
  root: number,
  n: number,
): { nodes: number[]; edges: number[] } {
  const adj = adjacency(sheet, edges);
  const seen = new Set([root]);
  let frontier = [root];
  for (let d = 0; d < n; d++) {
    const next: number[] = [];
    for (const cur of frontier)
      for (const step of adj.get(cur) ?? []) {
        if (seen.has(step.to)) continue;
        seen.add(step.to);
        next.push(step.to);
      }
    frontier = next;
  }
  const rels = edges
    .filter((e) => e.rel !== null && seen.has(e.from) && seen.has(e.to))
    .map((e) => e.rel as number);
  return { nodes: [...seen], edges: rels };
}
