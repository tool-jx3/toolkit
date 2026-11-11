/**
 * 遊戲中的段階公開（第五批；參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「セッション中の段階開示」，規格 F135、D62）：
 * GM 在進行中一步步公開——偽裝、伏字的真相、完全保密的事件、GM 專用的關聯線與標記。
 * 和準備時的「調查後公開」（revealed）分開存：這裡是 `unlocked`（進行中的狀態），PL 看到的是兩個的「或」；
 * 「全部回到初始」只清掉 unlocked，準備時設的調查後公開不動。GM 專用的泳道上的事件不能公開（同 F119）。純計算。
 */

import { readTime } from './time';
import type { TimelineDoc } from './types';
import { faceOf, secretLaneIds } from './visible';

export type LockKind = 'event' | 'link' | 'marker';

export interface Lockable {
  kind: LockKind;
  id: string;
  /** 事件：偽裝、伏字、完全保密；線、標記：GM 專用 */
  face: 'alibi' | 'redacted' | 'secret' | 'link' | 'marker';
  /** 顯示的名稱（事件的標題、線的兩端、標記的名稱） */
  label: string;
  /** 準備時已經設了「調查後公開」 */
  revealed: boolean;
  /** 進行中公開了 */
  unlocked: boolean;
  /** 排序用的時間（看不懂時 +∞） */
  v: number;
}

/** 可以段階公開的東西（GM 檢視用；依時間排，同時間依事件、線、標記） */
export function lockables(doc: TimelineDoc, untitled: string): Lockable[] {
  const secretLanes = secretLaneIds(doc);
  const titles = new Map(doc.events.map((e) => [e.id, e.title.trim() || untitled]));
  const at = (t: string) => readTime(doc.mode, t, doc)?.v ?? Number.POSITIVE_INFINITY;
  const startOf = new Map(doc.events.map((e) => [e.id, at(e.start)]));
  const out: Lockable[] = [];
  doc.events.forEach((e) => {
    const face = faceOf(e);
    if (face === 'public' || secretLanes.has(e.laneId)) return;
    out.push({
      kind: 'event',
      id: e.id,
      face,
      label: titles.get(e.id) ?? untitled,
      revealed: !!e.revealed,
      unlocked: !!e.unlocked,
      v: startOf.get(e.id) ?? Number.POSITIVE_INFINITY,
    });
  });
  for (const k of doc.links) {
    if (!k.gm) continue;
    /* 一端在 GM 專用的泳道上（公開了也看不到）的線不列 */
    const ends = [k.from, k.to].map((id) => doc.events.find((e) => e.id === id));
    if (ends.some((e) => !e || secretLanes.has(e.laneId))) continue;
    out.push({
      kind: 'link',
      id: k.id,
      face: 'link',
      label: `${titles.get(k.from) ?? untitled} → ${titles.get(k.to) ?? untitled}`,
      revealed: !!k.revealed,
      unlocked: !!k.unlocked,
      v: Math.min(startOf.get(k.from) ?? Infinity, startOf.get(k.to) ?? Infinity),
    });
  }
  for (const m of doc.markers) {
    if (!m.gm) continue;
    out.push({
      kind: 'marker',
      id: m.id,
      face: 'marker',
      label: m.label.trim() || untitled,
      revealed: !!m.revealed,
      unlocked: !!m.unlocked,
      v: at(m.time),
    });
  }
  const rank: Record<LockKind, number> = { event: 0, link: 1, marker: 2 };
  return out
    .map((x, i) => ({ x, i }))
    .sort((p, q) => p.x.v - q.x.v || rank[p.x.kind] - rank[q.x.kind] || p.i - q.i)
    .map((p) => p.x);
}

/** 公開或收回一個（改的是 unlocked；回傳有沒有改到） */
export function setUnlocked(doc: TimelineDoc, kind: LockKind, id: string, on: boolean): boolean {
  const list: { id: string; unlocked?: boolean }[] =
    kind === 'event' ? doc.events : kind === 'link' ? doc.links : doc.markers;
  const x = list.find((y) => y.id === id);
  if (!x || !!x.unlocked === on) return false;
  if (on) x.unlocked = true;
  else delete x.unlocked;
  return true;
}

/** 進行中公開了幾個 */
export function unlockCount(doc: Pick<TimelineDoc, 'events' | 'links' | 'markers'>): number {
  let n = 0;
  for (const e of doc.events) if (e.unlocked) n++;
  for (const k of doc.links) if (k.unlocked) n++;
  for (const m of doc.markers) if (m.unlocked) n++;
  return n;
}

/** 全部回到初始（清掉進行中的公開；準備時的調查後公開不動）；回傳清掉幾個 */
export function clearUnlocks(doc: TimelineDoc): number {
  let n = 0;
  for (const list of [doc.events, doc.links, doc.markers] as { unlocked?: boolean }[][])
    for (const x of list)
      if (x.unlocked) {
        delete x.unlocked;
        n++;
      }
  return n;
}
