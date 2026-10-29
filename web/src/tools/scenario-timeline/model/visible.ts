/**
 * GM／PL（規格 F60～F64、3.2）：PL 檢視與 PL 用的輸出看到的資料。
 *
 * PL 版拿掉：GM 專用的事件；GM 專用的泳道與它的子泳道、這些泳道上的事件；GM 專用的標記；所有 GM 筆記；
 * 「只到目前進度」開時進度之後的事件與標記（跨過進度的期間畫到進度為止、標「進行中」）。
 * GM 版是完整的資料，另外標出 PL 看不到的東西（secret）。原本的資料不變（複本）。
 */
import { afterUnit, readTime, type TimeMode } from './time';
import type { Lane, Marker, TimelineDoc, TimelineEvent } from './types';

export type Audience = 'gm' | 'pl';

export interface VisibleEvent extends TimelineEvent {
  /** PL 版看不到（GM 版畫斜線） */
  secret: boolean;
  /** 畫到這裡為止（PL 版只到目前進度） */
  clipEnd?: number;
  /** 跨過目前進度（年表寫「進行中」） */
  ongoing?: boolean;
}

export interface VisibleMarker extends Marker {
  secret: boolean;
}

export interface VisibleLane extends Lane {
  /** PL 版看不到（自己或上層是 GM 專用） */
  secret: boolean;
}

export interface VisibleDoc extends Omit<TimelineDoc, 'events' | 'markers' | 'lanes'> {
  audience: Audience;
  lanes: VisibleLane[];
  events: VisibleEvent[];
  markers: VisibleMarker[];
}

/** PL 版會拿掉的泳道：GM 專用的泳道與它的子泳道 */
export function secretLaneIds(doc: Pick<TimelineDoc, 'lanes'>): Set<string> {
  const out = new Set<string>();
  for (const l of doc.lanes) if (l.gm) out.add(l.id);
  for (const l of doc.lanes) if (l.parentId && out.has(l.parentId)) out.add(l.id);
  return out;
}

/** 目前進度的位置（沒開或看不懂時 null） */
export function progressValue(doc: Pick<TimelineDoc, 'mode' | 'era' | 'progress'>): number | null {
  if (!doc.progress.on || !doc.progress.time) return null;
  return readTime(doc.mode, doc.progress.time, doc.era)?.v ?? null;
}

/** PL 版有沒有拿掉任何東西（沒有時 PL 用與 GM 用一樣） */
export function hasSecrets(doc: TimelineDoc): boolean {
  if (doc.lanes.some((l) => l.gm)) return true;
  if (doc.markers.some((m) => m.gm)) return true;
  if (doc.events.some((e) => e.gm || e.gmNote.trim())) return true;
  const p = doc.progress.plOnly ? progressValue(doc) : null;
  if (p === null) return false;
  const pl = visibleDoc(doc, 'pl');
  return (
    pl.events.length !== doc.events.length ||
    pl.markers.length !== doc.markers.length ||
    pl.events.some((e) => e.ongoing)
  );
}

function eventEnd(mode: TimeMode, e: TimelineEvent, era: string): number | null {
  const a = readTime(mode, e.start, era);
  if (!a) return null;
  if (e.kind === 'point') return a.v;
  const b = readTime(mode, e.end, era);
  return b ? afterUnit(mode, b) : a.v;
}

/** 給某個對象看的資料 */
export function visibleDoc(doc: TimelineDoc, audience: Audience): VisibleDoc {
  const secretLanes = secretLaneIds(doc);
  const lanesAll: VisibleLane[] = doc.lanes.map((l) => ({ ...l, secret: secretLanes.has(l.id) }));
  const eventsAll: VisibleEvent[] = doc.events.map((e) => ({
    ...e,
    secret: e.gm || secretLanes.has(e.laneId),
  }));
  const markersAll: VisibleMarker[] = doc.markers.map((m) => ({ ...m, secret: m.gm }));
  if (audience === 'gm') {
    return { ...doc, audience, lanes: lanesAll, events: eventsAll, markers: markersAll };
  }
  const p = doc.progress.plOnly ? progressValue(doc) : null;
  const events: VisibleEvent[] = [];
  for (const e of eventsAll) {
    if (e.secret) continue;
    const out: VisibleEvent = { ...e, gmNote: '', secret: false };
    if (p !== null) {
      const a = readTime(doc.mode, e.start, doc.era);
      if (!a || a.v > p) continue;
      const end = eventEnd(doc.mode, e, doc.era);
      if (e.kind !== 'point' && end !== null && end > p) {
        out.clipEnd = p;
        out.ongoing = true;
      }
    }
    events.push(out);
  }
  const markers = markersAll.filter((m) => {
    if (m.secret) return false;
    if (p === null) return true;
    const t = readTime(doc.mode, m.time, doc.era);
    return !!t && t.v <= p;
  });
  return {
    ...doc,
    audience,
    lanes: lanesAll.filter((l) => !l.secret),
    events,
    markers,
  };
}

/** 圖例用的分類：看得到的事件用到的（依分類清單的順序） */
export function usedCategories(vdoc: VisibleDoc) {
  const used = new Set(vdoc.events.map((e) => e.categoryId).filter(Boolean));
  return vdoc.categories.filter((c) => used.has(c.id));
}
