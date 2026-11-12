/**
 * GM／PL（規格 F60～F64、3.2）：PL 檢視與 PL 用的輸出看到的資料。
 *
 * PL 版拿掉：GM 專用的事件；GM 專用的泳道與它的子泳道、這些泳道上的事件；GM 專用的標記；所有 GM 筆記；
 * 「只到目前進度」開時進度之後的事件與標記（跨過進度的期間畫到進度為止、標「進行中」）；
 * GM 專用的關聯線與一端被拿掉的關聯線（F93）。
 * GM 版是完整的資料，另外標出 PL 看不到的東西（secret）。原本的資料不變（複本）。
 *
 * 公開範圍（F116～F120，參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「プレイヤーに渡すとき」的規則）：
 * - 偽裝（alibi）：PL 看到證詞（標題、時間、地點、相關角色、說明、分類、顏色），看起來和公開的事件一樣；真相拿掉。
 * - 伏字（redacted）：PL 只看到時間與泳道，標題是「？？？」，地點、角色、說明、分類、顏色拿掉。
 * - 完全保密（gm）：PL 版整個拿掉，人物別也看不到（連本人的資料都不進）。
 * - 人物別（pov＝泳道）：全體公開的內容，再加上那條泳道自己的偽裝、伏字的真相（完全保密的除外）。
 * - 調查後公開（revealed）：PL 也看得到真相；完全保密的事件、GM 專用的線與標記也看得到（GM 專用的泳道仍然拿掉）。
 * - 看得到真相時，真相另外是一筆（truths，畫在同一條泳道、時間照真相的），證詞那一筆標「證詞」「伏字」。
 * - 退場時刻（泳道的 exit）所有檢視都看得到（「只到目前進度」時進度之後的拿掉）。
 * - 遊戲中的段階公開（unlocked，F135）：效果和調查後公開相同（PL 看到的是兩個的「或」）。
 */

import type { Link } from './links';
import { afterUnit, type EraArg, readTime, type TimeMode } from './time';
import {
  type Lane,
  type LaneKind,
  type Marker,
  type TimelineDoc,
  type TimelineEvent,
  truthUsed,
  validRange,
} from './types';

export type Audience = 'gm' | 'pl';

/** 伏字的標題 */
export const REDACTED = '？？？';
/** 真相那一筆的 id：事件的 id 後面加這個 */
export const TRUTH_SUFFIX = '::truth';

export interface VisibleEvent extends TimelineEvent {
  /** PL 版看不到（GM 版畫斜線） */
  secret: boolean;
  /** 畫到這裡為止（PL 版只到目前進度） */
  clipEnd?: number;
  /** 跨過目前進度（年表寫「進行中」） */
  ongoing?: boolean;
  /** 伏字、這個檢視不知道真相：標題是「？？？」（F117） */
  masked?: boolean;
  /** 因為「調查後公開」才看得到（F119；標「查明」） */
  opened?: boolean;
  /** 真相的那一筆（truths 裡）：它是哪一個事件的真相 */
  truthOf?: string;
}

export interface VisibleMarker extends Marker {
  secret: boolean;
}

export interface VisibleLane extends Lane {
  /** PL 版看不到（自己或上層是 GM 專用） */
  secret: boolean;
}

export interface VisibleLink extends Link {
  /** PL 版看不到（GM 專用，或一端是 PL 看不到的事件） */
  secret: boolean;
}

export interface VisibleDoc extends Omit<TimelineDoc, 'events' | 'markers' | 'lanes' | 'links'> {
  audience: Audience;
  lanes: VisibleLane[];
  events: VisibleEvent[];
  markers: VisibleMarker[];
  links: VisibleLink[];
  /** 人物別的視角（泳道 id；空字串＝全體公開；GM 版是空字串） */
  pov?: string;
  /** 看得到的真相（F116：每個知道真相的偽裝、伏字事件一筆，id 是事件 id＋TRUTH_SUFFIX） */
  truths?: VisibleEvent[];
}

/** 人物別可以選的泳道種類（地點不算；F118） */
export const POV_KINDS: readonly LaneKind[] = ['character', 'npc', 'faction', 'other'];

/** 人物別可以選的泳道：PL 看得到、種類不是地點的（依泳道清單的順序） */
export function povLanes(doc: TimelineDoc): Lane[] {
  const secret = secretLaneIds(doc);
  return doc.lanes.filter((l) => !secret.has(l.id) && POV_KINDS.includes(l.kind));
}

/** 調查後公開或遊戲中公開了（F119、F135） */
export const isOpened = (x: { revealed?: boolean; unlocked?: boolean }) =>
  !!(x.revealed || x.unlocked);

/** 事件的「看起來」：完全保密（gm）優先，其他照公開範圍 */
export const faceOf = (
  e: Pick<TimelineEvent, 'gm' | 'scope'>,
): 'public' | 'alibi' | 'redacted' | 'secret' => (e.gm ? 'secret' : (e.scope ?? 'public'));

/** PL 版會拿掉的泳道：GM 專用的泳道與它的子泳道 */
export function secretLaneIds(doc: Pick<TimelineDoc, 'lanes'>): Set<string> {
  const out = new Set<string>();
  for (const l of doc.lanes) if (l.gm) out.add(l.id);
  for (const l of doc.lanes) if (l.parentId && out.has(l.parentId)) out.add(l.id);
  return out;
}

/** 目前進度的位置（沒開或看不懂時 null） */
export function progressValue(
  doc: Pick<TimelineDoc, 'mode' | 'era' | 'progress'> & Partial<Pick<TimelineDoc, 'calendar'>>,
): number | null {
  if (!doc.progress.on || !doc.progress.time) return null;
  return readTime(doc.mode, doc.progress.time, doc)?.v ?? null;
}

/** PL 版有沒有拿掉任何東西（沒有時 PL 用與 GM 用一樣） */
export function hasSecrets(doc: TimelineDoc): boolean {
  if (doc.lanes.some((l) => l.gm)) return true;
  if (doc.markers.some((m) => m.gm)) return true;
  if ((doc.links ?? []).some((k) => k.gm)) return true;
  if (doc.events.some((e) => e.gm || e.gmNote.trim() || e.scope)) return true;
  const p = doc.progress.plOnly ? progressValue(doc) : null;
  if (p === null) return false;
  const pl = visibleDoc(doc, 'pl');
  return (
    pl.events.length !== doc.events.length ||
    pl.markers.length !== doc.markers.length ||
    pl.events.some((e) => e.ongoing)
  );
}

function eventEnd(mode: TimeMode, e: TimelineEvent, era: EraArg): number | null {
  const a = readTime(mode, e.start, era);
  if (!a) return null;
  if (e.kind === 'point') return a.v;
  const b = readTime(mode, e.end, era);
  return b ? afterUnit(mode, b, era) : a.v;
}

/** 真相那一筆（F116）：時間空白的照證詞；結束不比開始晚時當成時間點 */
function truthEvent(mode: TimeMode, e: VisibleEvent, ctx: EraArg): VisibleEvent | null {
  const t = e.truth;
  if (!truthUsed(t)) return null;
  const start = t.start || e.start;
  let end = t.end || (t.start ? '' : e.kind === 'point' ? '' : e.end);
  if (end && !validRange(mode, start, end, ctx)) end = '';
  const { scope: _s, truth: _t, revealed: _r, unlocked: _u, clipEnd: _c, ongoing: _o, ...rest } = e;
  return {
    ...rest,
    id: `${e.id}${TRUTH_SUFFIX}`,
    truthOf: e.id,
    title: t.title,
    kind: end ? 'range' : 'point',
    start,
    end,
    place: t.place,
    people: [],
    description: '',
    gmNote: '',
  };
}

/** PL 版只到目前進度（F38）：開始晚於進度的拿掉（null），跨過進度的剪到進度 */
function clipToProgress(doc: TimelineDoc, e: VisibleEvent, p: number | null): VisibleEvent | null {
  if (p === null) return e;
  const a = readTime(doc.mode, e.start, doc);
  if (!a || a.v > p) return null;
  const end = eventEnd(doc.mode, e, doc);
  if (e.kind !== 'point' && end !== null && end > p) return { ...e, clipEnd: p, ongoing: true };
  return e;
}

/**
 * 給某個對象看的資料。pov：人物別的視角（泳道 id；PL 版才有作用，指到 PL 看不到的泳道時＝全體公開）。
 */
export function visibleDoc(doc: TimelineDoc, audience: Audience, pov = ''): VisibleDoc {
  const secretLanes = secretLaneIds(doc);
  const lanesAll: VisibleLane[] = doc.lanes.map((l) => ({ ...l, secret: secretLanes.has(l.id) }));
  const eventsAll: VisibleEvent[] = doc.events.map((e) => ({
    ...e,
    /* 調查後公開的完全保密事件 PL 也看得到（GM 專用的泳道上的仍然看不到） */
    secret: (e.gm && !isOpened(e)) || secretLanes.has(e.laneId),
    ...(isOpened(e) && (e.gm || e.scope) ? { opened: true } : {}),
  }));
  const markersAll: VisibleMarker[] = doc.markers.map((m) => ({
    ...m,
    secret: m.gm && !isOpened(m),
  }));
  const secretEvents = new Set(eventsAll.filter((e) => e.secret).map((e) => e.id));
  const linksAll: VisibleLink[] = (doc.links ?? []).map((k) => ({
    ...k,
    secret: (k.gm && !isOpened(k)) || secretEvents.has(k.from) || secretEvents.has(k.to),
  }));
  if (audience === 'gm') {
    const truths: VisibleEvent[] = [];
    for (const e of eventsAll) {
      if (!e.scope) continue;
      const t = truthEvent(doc.mode, e, doc);
      if (t) truths.push(t);
    }
    return {
      ...doc,
      audience,
      lanes: lanesAll,
      events: eventsAll,
      markers: markersAll,
      links: linksAll,
      pov: '',
      truths,
    };
  }
  const povLane = pov && lanesAll.some((l) => l.id === pov && !l.secret) ? pov : '';
  const p = doc.progress.plOnly ? progressValue(doc) : null;
  const events: VisibleEvent[] = [];
  const truths: VisibleEvent[] = [];
  for (const e of eventsAll) {
    if (e.secret) continue;
    /* 這個檢視知道真相：調查後公開、人物別的本人（完全保密的不算：那種只有調查後公開才看得到） */
    const known = isOpened(e) || (!!povLane && e.laneId === povLane && !e.gm);
    let out: VisibleEvent = { ...e, gmNote: '', secret: false, gm: false };
    if (e.scope && !known) {
      /* 不知道真相：偽裝看起來和公開的事件一樣（不留公開範圍的欄位）、伏字只剩時間與泳道 */
      const { scope: _s, truth: _t, revealed: _r, unlocked: _u, opened: _o, ...rest } = out;
      out = rest;
      if (e.scope === 'redacted')
        out = {
          ...out,
          title: REDACTED,
          place: '',
          people: [],
          description: '',
          categoryId: '',
          color: '',
          masked: true,
        };
    } else if (!e.scope) {
      const { truth: _t, revealed: _r, unlocked: _u, ...rest } = out;
      out = rest;
    }
    const clipped = clipToProgress(doc, out, p);
    if (!clipped) continue;
    events.push(clipped);
    if (e.scope && known) {
      const t = truthEvent(doc.mode, clipped, doc);
      const tc = t ? clipToProgress(doc, t, p) : null;
      if (tc) truths.push(tc);
    }
  }
  const markers = markersAll.filter((m) => {
    if (m.secret) return false;
    if (p === null) return true;
    const t = readTime(doc.mode, m.time, doc);
    return !!t && t.v <= p;
  });
  const shown = new Set(events.map((e) => e.id));
  /* 退場時刻：只到目前進度時，進度之後的拿掉（F121） */
  const lanes = lanesAll
    .filter((l) => !l.secret)
    .map((l) => {
      if (!l.exit || p === null) return l;
      const t = readTime(doc.mode, l.exit.time, doc);
      if (t && t.v <= p) return l;
      const { exit: _x, ...rest } = l;
      return rest;
    });
  return {
    ...doc,
    audience,
    lanes,
    events,
    markers,
    links: linksAll.filter((k) => !k.secret && shown.has(k.from) && shown.has(k.to)),
    pov: povLane,
    truths,
  };
}

/** 一個事件的真相那一筆所屬的事件 id（不是真相時就是自己） */
export const ownerId = (id: string) =>
  id.endsWith(TRUTH_SUFFIX) ? id.slice(0, -TRUTH_SUFFIX.length) : id;

/** 圖例用的分類：看得到的事件用到的（依分類清單的順序） */
export function usedCategories(vdoc: VisibleDoc) {
  const used = new Set(vdoc.events.map((e) => e.categoryId).filter(Boolean));
  return vdoc.categories.filter((c) => used.has(c.id));
}
