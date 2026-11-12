/**
 * 推理的分析（第五批；參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「ミステリー支援・自動解析」
 * 「タイムスライス・スキャナー」，本站的規則與寫法，規格 1.22、3.15）：
 * - 不在場證明空白：人物的泳道上沒有任何紀錄的時段（30 分以上；退場之後不算）。
 * - 同席調書（接觸紀錄）：兩個人物在同一個地點、時間重疊。證詞的同席與真相的同席分開算；
 *   GM 用另外標出證詞的同席被真相推翻（矛盾）、只在真相裡的同席（證詞沒有）。
 * - 時間切片：某個時刻每個地點有誰。
 *
 * **只用這個檢視看得到的資料（visibleDoc 的結果）算**：PL 用、人物別的結果和「把藏起來的東西整個拿掉」的專案相同，
 * 推不出完全保密、伏字、偽裝的真相（空白的長度、同席、切片都只從看得到的紀錄來）。PL 用只比證詞（不比真相）。
 * 「人物」＝種類不是地點的泳道（F118 的人物別相同）；相關角色的名字不算（自由的文字，不一定對得到泳道）。純計算。
 */
import { calInfo } from './calendar';
import { endText } from './chronicle';
import { normText } from './filter';
import { eventSpan, type Span } from './layout';
import { type EraArg, formatLong, readTime, type TimeMode, type Tv } from './time';
import type { VisibleDoc, VisibleEvent, VisibleLane } from './visible';

/** 空白至少幾分（照 KT 的 0.5 小時） */
export const GAP_MIN = 30;

/** 一筆紀錄：某個人物在某段時間（時間點 a＝b）、某個地點（空白＝不知道） */
export interface AlibiRecord {
  laneId: string;
  /** 畫出來的那一筆的 id（真相是事件 id＋::truth） */
  id: string;
  /** 它的事件 id */
  owner: string;
  a: number;
  b: number;
  point: boolean;
  place: string;
  title: string;
  /** 真相的那一筆 */
  truth: boolean;
  /** 伏字（這個檢視不知道內容） */
  masked: boolean;
  /** PL 版看不到（GM 檢視才有：完全保密、GM 專用的泳道上的） */
  secret: boolean;
}

/** 不在場證明空白 */
export interface AlibiGap {
  laneId: string;
  a: number;
  b: number;
}

/** 人物＝種類不是地點的泳道（依泳道清單的順序） */
export function personLanes(vdoc: Pick<VisibleDoc, 'lanes'>): VisibleLane[] {
  return vdoc.lanes.filter((l) => l.kind !== 'place');
}

/** 地點的比對：全形半形、大小寫、連續空白不分 */
export const placeKey = (place: string) => normText(place).replace(/\s+/g, ' ').trim();

/** 空白能不能算：日期時間、第 N 天（以分計）；架空年的單位是年，不算 */
export const gapsSupported = (mode: TimeMode) => mode !== 'year';

function exitOf(vdoc: VisibleDoc, lane: VisibleLane): number | null {
  if (!lane.exit) return null;
  return readTime(vdoc.mode, lane.exit.time, vdoc)?.v ?? null;
}

function toRecord(vdoc: VisibleDoc, e: VisibleEvent): AlibiRecord | null {
  const s = eventSpan(vdoc.mode, e, vdoc);
  if (!s) return null;
  return {
    laneId: e.laneId,
    id: e.id,
    owner: e.truthOf ?? e.id,
    a: s.a,
    b: s.b,
    point: e.kind === 'point',
    place: e.place.trim(),
    title: e.title.trim(),
    truth: !!e.truthOf,
    masked: !!e.masked,
    secret: !!e.secret,
  };
}

/** 退場之後的剪掉（期間剪到退場；開始在退場之後的不要；時間點剛好在退場那一刻的留著） */
function clipExit(r: AlibiRecord, exit: number | null): AlibiRecord | null {
  if (exit === null) return r;
  if (r.point) return r.a <= exit ? r : null;
  if (r.a >= exit) return null;
  return r.b > exit ? { ...r, b: exit } : r;
}

export interface PersonRecords {
  lane: VisibleLane;
  exit: number | null;
  /** 事件（證詞；背景不算） */
  events: AlibiRecord[];
  /** 看得到的真相 */
  truths: AlibiRecord[];
}

/** 每個人物的紀錄（退場之後剪掉） */
export function personRecords(vdoc: VisibleDoc): PersonRecords[] {
  const people = personLanes(vdoc);
  const by = new Map<string, PersonRecords>();
  for (const lane of people)
    by.set(lane.id, { lane, exit: exitOf(vdoc, lane), events: [], truths: [] });
  const add = (e: VisibleEvent, truth: boolean) => {
    if (e.kind === 'background') return;
    const p = by.get(e.laneId);
    if (!p) return;
    const r = toRecord(vdoc, e);
    const c = r ? clipExit(r, p.exit) : null;
    if (!c) return;
    (truth ? p.truths : p.events).push(c);
  };
  for (const e of vdoc.events) add(e, false);
  for (const t of vdoc.truths ?? []) add(t, true);
  const out = people.map((l) => by.get(l.id) as PersonRecords);
  for (const p of out) {
    p.events.sort(byTime);
    p.truths.sort(byTime);
  }
  return out;
}

const byTime = (x: AlibiRecord, y: AlibiRecord) => x.a - y.a || x.b - y.b;

/** 空白的範圍：看得到的事件（含背景與真相）最早的開始～最晚的結束 */
export function gapRange(vdoc: VisibleDoc): Span | null {
  let a = Number.POSITIVE_INFINITY;
  let b = Number.NEGATIVE_INFINITY;
  for (const e of [...vdoc.events, ...(vdoc.truths ?? [])]) {
    const s = eventSpan(vdoc.mode, e, vdoc);
    if (!s) continue;
    a = Math.min(a, s.a);
    b = Math.max(b, s.b);
  }
  return Number.isFinite(a) && b > a ? { a, b } : null;
}

/**
 * 不在場證明空白：每個人物在範圍裡（預設 gapRange）沒有任何紀錄（事件或看得到的真相）的時段，
 * 至少 GAP_MIN 分；退場之後不算。架空年不算（回傳空的）。
 */
export function alibiGaps(
  vdoc: VisibleDoc,
  opts: { range?: Span | null; min?: number } = {},
): AlibiGap[] {
  if (!gapsSupported(vdoc.mode)) return [];
  const range = opts.range === undefined ? gapRange(vdoc) : opts.range;
  if (!range) return [];
  const min = opts.min ?? GAP_MIN;
  const out: AlibiGap[] = [];
  for (const p of personRecords(vdoc)) {
    const limit = p.exit === null ? range.b : Math.min(range.b, p.exit);
    if (limit <= range.a) continue;
    const recs = [...p.events, ...p.truths].sort(byTime);
    let cursor = range.a;
    for (const r of recs) {
      if (r.a >= limit) break;
      if (r.a - cursor >= min) out.push({ laneId: p.lane.id, a: cursor, b: r.a });
      cursor = Math.max(cursor, r.b);
    }
    if (limit - cursor >= min) out.push({ laneId: p.lane.id, a: cursor, b: limit });
  }
  return out;
}

/* ---------- 同席調書 ---------- */

/** 兩筆紀錄重疊的時段（沒有時 null）：期間要真的重疊；時間點要落在對方的期間裡（結束那一刻不算）或同一刻 */
export function overlapOf(x: AlibiRecord, y: AlibiRecord): Span | null {
  if (x.point && y.point) return x.a === y.a ? { a: x.a, b: x.a } : null;
  if (x.point) return x.a >= y.a && x.a < y.b ? { a: x.a, b: x.a } : null;
  if (y.point) return y.a >= x.a && y.a < x.b ? { a: y.a, b: y.a } : null;
  const a = Math.max(x.a, y.a);
  const b = Math.min(x.b, y.b);
  return b > a ? { a, b } : null;
}

export interface Contact {
  /** 兩個人物（依泳道的順序） */
  lanes: [string, string];
  /** 地點（第一次出現的寫法） */
  place: string;
  a: number;
  b: number;
  /**
   * GM 用：證詞的同席被真相推翻（兩個人之中有人的真相在同一段時間在別的地方）；
   * 推翻的那一筆（人物、地點、時間）
   */
  conflict?: { laneId: string; place: string; a: number; b: number; title: string };
  /** GM 用的真相的同席：證詞裡沒有這個同席 */
  hidden?: boolean;
}

/** 一組紀錄裡的同席（同一個地點、時間重疊的兩個人物；同一對、同一個地點的接起來） */
function contactsIn(order: Map<string, number>, recs: readonly AlibiRecord[]): Contact[] {
  const withPlace = recs.filter((r) => r.place && !r.masked);
  const groups = new Map<string, { lanes: [string, string]; place: string; spans: Span[] }>();
  for (let i = 0; i < withPlace.length; i++) {
    const x = withPlace[i];
    const kx = placeKey(x.place);
    for (let j = i + 1; j < withPlace.length; j++) {
      const y = withPlace[j];
      if (x.laneId === y.laneId || placeKey(y.place) !== kx) continue;
      const o = overlapOf(x, y);
      if (!o) continue;
      const pair: [string, string] =
        (order.get(x.laneId) ?? 0) <= (order.get(y.laneId) ?? 0)
          ? [x.laneId, y.laneId]
          : [y.laneId, x.laneId];
      const key = `${pair[0]}\u0000${pair[1]}\u0000${kx}`;
      let g = groups.get(key);
      if (!g) {
        g = { lanes: pair, place: x.place, spans: [] };
        groups.set(key, g);
      }
      g.spans.push(o);
    }
  }
  const out: Contact[] = [];
  for (const g of groups.values()) {
    const spans = [...g.spans].sort((p, q) => p.a - q.a || p.b - q.b);
    let cur: Span | null = null;
    for (const s of spans) {
      if (cur && s.a <= cur.b) cur.b = Math.max(cur.b, s.b);
      else {
        if (cur) out.push({ lanes: g.lanes, place: g.place, a: cur.a, b: cur.b });
        cur = { ...s };
      }
    }
    if (cur) out.push({ lanes: g.lanes, place: g.place, a: cur.a, b: cur.b });
  }
  return out.sort(
    (p, q) =>
      p.a - q.a ||
      p.b - q.b ||
      (order.get(p.lanes[0]) ?? 0) - (order.get(q.lanes[0]) ?? 0) ||
      (order.get(p.lanes[1]) ?? 0) - (order.get(q.lanes[1]) ?? 0),
  );
}

/** 證詞扣掉真相的時段（時間點落在真相的時段裡＝拿掉；期間切成真相以外的幾段） */
export function outsideTruth(r: AlibiRecord, truths: readonly AlibiRecord[]): AlibiRecord[] {
  if (!truths.length) return [r];
  if (r.point)
    return truths.some((t) => (t.point ? t.a === r.a : t.a <= r.a && r.a <= t.b)) ? [] : [r];
  let parts: Span[] = [{ a: r.a, b: r.b }];
  for (const t of truths) {
    if (t.point) continue;
    parts = parts.flatMap((p) => {
      if (t.b <= p.a || t.a >= p.b) return [p];
      const out: Span[] = [];
      if (t.a > p.a) out.push({ a: p.a, b: t.a });
      if (t.b < p.b) out.push({ a: t.b, b: p.b });
      return out;
    });
  }
  return parts.map((p) => ({ ...r, a: p.a, b: p.b }));
}

export interface ContactReport {
  audience: VisibleDoc['audience'];
  /** 證詞的同席（PL 用：看得到的證詞；GM 用：PL 看得到的事件，標出被真相推翻的） */
  testimony: Contact[];
  /** 真相的同席（GM 用才有：真相取代證詞、完全保密的也算；標出證詞裡沒有的） */
  truth: Contact[];
}

/** 同時、同一個地點的兩筆時段有沒有交集 */
const intersects = (p: Span, q: Span) => Math.min(p.b, q.b) > Math.max(p.a, q.a) || p.a === q.a;

/**
 * 同席調書。PL 用（全體公開、人物別）只比證詞（看得到的事件；伏字沒有地點，不算）；
 * GM 用另外比真相（每個事件有真相時用真相那一筆，沒有時用事件本身；完全保密的也算），並標出矛盾與只在真相裡的。
 */
export function contactReport(vdoc: VisibleDoc): ContactReport {
  const order = new Map(vdoc.lanes.map((l, i) => [l.id, i]));
  const people = personRecords(vdoc);
  if (vdoc.audience !== 'gm') {
    const testimony = contactsIn(
      order,
      people.flatMap((p) => p.events),
    );
    return { audience: vdoc.audience, testimony, truth: [] };
  }
  /* 證詞：PL 看得到的事件（完全保密、GM 專用泳道上的不算證詞） */
  const testimonyRecs = people.flatMap((p) => p.events.filter((r) => !r.secret));
  /*
   * 真相：有真相的事件，真相的時段用真相那一筆、證詞的其他時段照證詞（偽裝的只有真相的那一段；
   * 真相的時間空白＝整段都是真相），沒有真相的用事件本身；完全保密的也算
   */
  const truthRecs = people.flatMap((p) => {
    const byOwner = new Map<string, AlibiRecord[]>();
    for (const t of p.truths) byOwner.set(t.owner, [...(byOwner.get(t.owner) ?? []), t]);
    return [...p.events.flatMap((r) => outsideTruth(r, byOwner.get(r.owner) ?? [])), ...p.truths];
  });
  const truthBy = new Map<string, AlibiRecord[]>();
  for (const r of truthRecs) {
    const list = truthBy.get(r.laneId) ?? [];
    list.push(r);
    truthBy.set(r.laneId, list);
  }
  const testimony = contactsIn(order, testimonyRecs).map((c) => {
    const k = placeKey(c.place);
    for (const laneId of c.lanes)
      for (const r of truthBy.get(laneId) ?? []) {
        /*
         * 推翻證詞的只有真相與完全保密的（GM 才知道的事）；同一個人的另一筆證詞在別的地點
         * （例：第二幕在舞台的期間裡、下場時在下舞台的時間點）是證詞自己的事，不算矛盾
         */
        if (!r.truth && !r.secret) continue;
        if (!r.place || placeKey(r.place) === k) continue;
        const o = overlapOf(r, {
          ...r,
          a: c.a,
          b: c.b,
          point: c.a === c.b,
        });
        if (!o) continue;
        return {
          ...c,
          conflict: { laneId, place: r.place, a: r.a, b: r.b, title: r.title },
        };
      }
    return c;
  });
  const truth = contactsIn(order, truthRecs).map((c) => {
    const k = placeKey(c.place);
    const seen = testimony.some(
      (t) =>
        t.lanes[0] === c.lanes[0] &&
        t.lanes[1] === c.lanes[1] &&
        placeKey(t.place) === k &&
        intersects(t, c),
    );
    return seen ? c : { ...c, hidden: true };
  });
  return { audience: 'gm', testimony, truth };
}

/* ---------- 時間切片 ---------- */

export interface SlicePerson {
  laneId: string;
  name: string;
  /** 在做什麼（伏字：「？？？」） */
  title: string;
  /** GM 用：照真相放的（證詞的地點另外寫） */
  truth: boolean;
  /** GM 用、照真相放時：證詞說的地點（和真相不同時） */
  claimed?: string;
  masked: boolean;
}

export interface SliceRoom {
  /** 地點（空白＝地點不明） */
  place: string;
  people: SlicePerson[];
  /** 這個地點正在發生的事（地點的泳道、主線上的事件） */
  events: string[];
  /** 兩個以上的人物同席 */
  together: boolean;
}

export interface TimeSlice {
  v: number;
  rooms: SliceRoom[];
  /** 沒有紀錄的人物（所在不明） */
  unknown: string[];
  /** 已經退場的人物（名稱、寫法） */
  exited: { name: string; label: string }[];
  /** 正在進行的背景事件 */
  backgrounds: string[];
}

/** 這一筆在 v 這一刻嗎（期間：開始 ≤ v ＜ 結束；時間點：剛好在那一刻） */
export const covers = (r: { a: number; b: number; point?: boolean }, v: number) =>
  r.point || r.a === r.b ? r.a === v : r.a <= v && v < r.b;

/**
 * 時間切片：v 這一刻每個地點有誰。PL 用只放證詞的地點（伏字＝地點不明、「？？？」）；
 * GM 用有真相在這一刻的照真相放（寫出證詞說的地點），其他照事件。名稱空白時用 untitled。
 */
export function timeSlice(
  vdoc: VisibleDoc,
  v: number,
  labels: { untitled: string; redacted: string; exitDefault: string },
): TimeSlice {
  const rooms = new Map<string, SliceRoom>();
  const room = (place: string) => {
    const key = place ? placeKey(place) : '';
    let r = rooms.get(key);
    if (!r) {
      r = { place: key ? place : '', people: [], events: [], together: false };
      rooms.set(key, r);
    }
    return r;
  };
  const unknown: string[] = [];
  const exited: { name: string; label: string }[] = [];
  const gm = vdoc.audience === 'gm';
  for (const p of personRecords(vdoc)) {
    const name = p.lane.name.trim() || labels.untitled;
    if (p.exit !== null && v >= p.exit) {
      exited.push({ name, label: p.lane.exit?.label.trim() || labels.exitDefault });
      continue;
    }
    const truths = gm ? p.truths.filter((r) => covers(r, v)) : [];
    const told = new Set(truths.map((t) => t.owner));
    const events = p.events.filter((r) => covers(r, v) && !told.has(r.owner));
    if (!truths.length && !events.length) {
      unknown.push(name);
      continue;
    }
    for (const t of truths) {
      const ev = p.events.find((r) => r.owner === t.owner);
      const claimed = ev?.place && placeKey(ev.place) !== placeKey(t.place) ? ev.place : undefined;
      room(t.place).people.push({
        laneId: p.lane.id,
        name,
        title: t.title || labels.untitled,
        truth: true,
        ...(claimed ? { claimed } : {}),
        masked: false,
      });
    }
    for (const r of events)
      room(r.masked ? '' : r.place).people.push({
        laneId: p.lane.id,
        name,
        title: r.masked ? labels.redacted : r.title || labels.untitled,
        truth: false,
        masked: r.masked,
      });
  }
  /* 地點的泳道、主線上的事件：寫在那個地點（地點空白時用地點泳道的名稱） */
  const people = new Set(personLanes(vdoc).map((l) => l.id));
  const laneName = new Map(vdoc.lanes.map((l) => [l.id, l]));
  const backgrounds: string[] = [];
  for (const e of vdoc.events) {
    if (people.has(e.laneId)) continue;
    const s = eventSpan(vdoc.mode, e, vdoc);
    if (!s || !covers({ ...s, point: e.kind === 'point' }, v)) continue;
    const title = e.masked ? labels.redacted : e.title.trim() || labels.untitled;
    if (e.kind === 'background') {
      backgrounds.push(title);
      continue;
    }
    const lane = laneName.get(e.laneId);
    const place = e.place.trim() || (lane?.kind === 'place' ? lane.name.trim() : '');
    if (!place) continue;
    room(place).events.push(title);
  }
  /* 人物泳道上的背景事件也算「正在進行」 */
  for (const e of vdoc.events) {
    if (!people.has(e.laneId) || e.kind !== 'background') continue;
    const s = eventSpan(vdoc.mode, e, vdoc);
    if (s && covers(s, v))
      backgrounds.push(e.masked ? labels.redacted : e.title.trim() || labels.untitled);
  }
  const list = [...rooms.values()];
  for (const r of list) r.together = !!r.place && new Set(r.people.map((p) => p.laneId)).size >= 2;
  /* 地點不明放最後 */
  list.sort((p, q) => (p.place ? 0 : 1) - (q.place ? 0 : 1));
  return { v, rooms: list, unknown, exited, backgrounds };
}

/* ---------- 文字 ---------- */

/** 位置 → 顯示用的時間（日期時間、第 N 天寫到分；架空年照寫法） */
export function tvAt(vdoc: Pick<VisibleDoc, 'mode' | 'calendar'>, v: number): Tv {
  if (vdoc.mode !== 'year') return { v: Math.round(v), p: 'minute' };
  const info = calInfo(vdoc.calendar);
  if (info) return { v, p: info.clock ? 'minute' : 'day' };
  return { v: Math.round(v), p: 'year' };
}

/** 一段時間：「21:00～21:30」（結束照開始寫相對的；同一刻只寫一次） */
export function spanText(vdoc: VisibleDoc, a: number, b: number): string {
  const era: EraArg = vdoc;
  const ta = tvAt(vdoc, a);
  const head = formatLong(vdoc.mode, ta, era);
  if (b <= a) return head;
  return `${head}～${endText(vdoc.mode, ta, tvAt(vdoc, b), era)}`;
}

/** 長度：「1 小時 20 分」「45 分」「2 天 3 小時」（以分計的寫法；架空年空白） */
export function durationText(mode: TimeMode, minutes: number): string {
  if (mode === 'year') return '';
  const m = Math.round(minutes);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} 天`);
  if (h) parts.push(`${h} 小時`);
  if (mm || !parts.length) parts.push(`${mm} 分`);
  return parts.join(' ');
}
