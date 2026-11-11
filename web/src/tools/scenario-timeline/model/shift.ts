/**
 * 時間的插入與縮短（規格 F129）：從基準時間起，之後的東西整段往後挪（插入）或往前縮（縮短）。純計算。
 * 參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的「時間の一括挿入・短縮」：開始在基準時間（含）之後的
 * 才移動，跨過基準時間的（開始在之前、結束在之後）不動也不伸縮；縮短時被縮掉的那一段裡的東西也一起往前移。
 *
 * - 事件：開始在基準之後的，開始與結束一起移動（長度不變）。
 * - 真相（F116）：時間空白（和證詞相同）的跟著證詞；寫了開始的照自己的開始判斷。
 * - 標記、目前進度、泳道的退場時刻、倒數的 T-0（開始時刻＋時間幅）：在基準之後的移動。
 * - 時間照各自的寫法對齊（只到日的一次 1 日；位移不到半個單位的不動），寫法不變；移出範圍的留在範圍的兩端。
 */
import { calInfo } from './calendar';
import { SESSION_LIMITS, zeroOf } from './session';
import {
  canonical,
  type EraArg,
  precisionUnit,
  readTime,
  snapTv,
  type TimeMode,
  type Tv,
} from './time';
import { type Lane, type Marker, type TimelineDoc, type TimelineEvent, validRange } from './types';

export interface ShiftPlan {
  events: TimelineEvent[];
  markers: Marker[];
  lanes: Lane[];
  progressTime: string;
  /** 倒數的時間幅（T-0 在基準之後時跟著移動） */
  sessionLength: number | null;
  /** 移動的事件、標記（含目前進度、退場）數目 */
  moved: number;
  /** 照自己的寫法對齊、位移和指定的不同的 */
  aligned: number;
  /** 移動之後期間會倒過來、沒有移動的事件 */
  blocked: number;
}

/** 一個時間移動 delta（照自己的寫法對齊）；回傳新的寫法與實際的位移 */
function moveTime(
  mode: TimeMode,
  tv: Tv,
  delta: number,
  ctx: EraArg,
): { text: string; tv: Tv; actual: number } {
  const out = snapTv(mode, tv.v + delta, tv.p, precisionUnit(mode, tv.p), ctx);
  return { text: canonical(mode, out, ctx), tv: out, actual: out.v - tv.v };
}

const EPS = 1e-9;

export function planShift(doc: TimelineDoc, from: number, delta: number): ShiftPlan {
  const mode = doc.mode;
  const ctx: EraArg = doc;
  let moved = 0;
  let aligned = 0;
  let blocked = 0;
  const after = (tv: Tv | null): tv is Tv => !!tv && tv.v >= from - EPS;
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(delta) * 1e-9 + EPS;
  const plan: ShiftPlan = {
    events: doc.events,
    markers: doc.markers,
    lanes: doc.lanes,
    progressTime: doc.progress.time,
    sessionLength: null,
    moved: 0,
    aligned: 0,
    blocked: 0,
  };
  if (!delta) return plan;

  plan.events = doc.events.map((e) => {
    let next: TimelineEvent = e;
    const a = readTime(mode, e.start, ctx);
    let surfaceMoved = false;
    if (after(a)) {
      const s = moveTime(mode, a, delta, ctx);
      const b = e.kind !== 'point' && e.end ? readTime(mode, e.end, ctx) : null;
      const t = b ? moveTime(mode, b, delta, ctx) : null;
      if (t && !validRange(mode, s.text, t.text, ctx)) blocked++;
      else if (s.text !== e.start || (t && t.text !== e.end)) {
        next = { ...e, start: s.text, end: t ? t.text : e.end };
        surfaceMoved = true;
        moved++;
        if (!near(s.actual, delta) || (t && !near(t.actual, delta))) aligned++;
      }
    }
    const tr = e.truth;
    if (tr && (tr.start || tr.end)) {
      /* 真相：寫了開始的照自己的開始判斷；沒寫開始（只寫結束）的跟著證詞 */
      const ts = tr.start ? readTime(mode, tr.start, ctx) : null;
      const go = tr.start ? after(ts) : surfaceMoved;
      if (go) {
        const ms = ts ? moveTime(mode, ts, delta, ctx) : null;
        const te = tr.end ? readTime(mode, tr.end, ctx) : null;
        const me = te ? moveTime(mode, te, delta, ctx) : null;
        const start = ms ? ms.text : tr.start;
        const end = me ? me.text : tr.end;
        if (start !== tr.start || end !== tr.end) {
          next = { ...next, truth: { ...tr, start, end } };
          if (!surfaceMoved) moved++;
        }
      }
    }
    return next;
  });

  plan.markers = doc.markers.map((m) => {
    const t = readTime(mode, m.time, ctx);
    if (!after(t)) return m;
    const r = moveTime(mode, t, delta, ctx);
    if (r.text === m.time) return m;
    moved++;
    if (!near(r.actual, delta)) aligned++;
    return { ...m, time: r.text };
  });

  plan.lanes = doc.lanes.map((l) => {
    if (!l.exit) return l;
    const t = readTime(mode, l.exit.time, ctx);
    if (!after(t)) return l;
    const r = moveTime(mode, t, delta, ctx);
    if (r.text === l.exit.time) return l;
    moved++;
    if (!near(r.actual, delta)) aligned++;
    return { ...l, exit: { ...l.exit, time: r.text } };
  });

  if (doc.progress.time) {
    const t = readTime(mode, doc.progress.time, ctx);
    if (after(t)) {
      const r = moveTime(mode, t, delta, ctx);
      if (r.text !== doc.progress.time) {
        plan.progressTime = r.text;
        moved++;
        if (!near(r.actual, delta)) aligned++;
      }
    }
  }

  /* 倒數：T-0（開始時刻＋時間幅）在基準之後時跟著移動（F127） */
  const ses = mode === 'day' ? doc.session : undefined;
  if (ses?.style === 'countdown' && zeroOf(ses) >= from - EPS) {
    const [lo, hi] = SESSION_LIMITS.length;
    plan.sessionLength = Math.min(hi, Math.max(lo, ses.length + Math.round(delta)));
  }

  plan.moved = moved;
  plan.aligned = aligned;
  plan.blocked = blocked;
  return plan;
}

/** 基準時間之後有沒有東西可以移動（按鈕的停用） */
export function shiftCount(doc: TimelineDoc, from: number): number {
  const mode = doc.mode;
  let n = 0;
  const after = (s: string) => {
    const t = s ? readTime(mode, s, doc) : null;
    return !!t && t.v >= from - EPS;
  };
  for (const e of doc.events) if (after(e.start) || (e.truth?.start && after(e.truth.start))) n++;
  for (const m of doc.markers) if (after(m.time)) n++;
  for (const l of doc.lanes) if (l.exit && after(l.exit.time)) n++;
  if (after(doc.progress.time)) n++;
  return n;
}

/** 插入、縮短的長度的單位：位置的多少（日期時間、第 N 天以分計；架空年以年計） */
export interface ShiftUnit {
  id: 'min' | 'hour' | 'day' | 'year';
  label: string;
  /** 一個單位是多少位置 */
  v: number;
}

/** 這份專案可以用的單位（架空年：年；有月份時加日；寫到時刻時再加分、時） */
export function shiftUnits(doc: Pick<TimelineDoc, 'mode' | 'calendar'>): ShiftUnit[] {
  if (doc.mode !== 'year')
    return [
      { id: 'min', label: '分', v: 1 },
      { id: 'hour', label: '小時', v: 60 },
      { id: 'day', label: '天', v: 1440 },
    ];
  const info = calInfo(doc.calendar);
  if (!info) return [{ id: 'year', label: '年', v: 1 }];
  const out: ShiftUnit[] = [];
  if (info.clock)
    out.push(
      { id: 'min', label: '分', v: 1 / (info.D * 1440) },
      { id: 'hour', label: '小時', v: 60 / (info.D * 1440) },
    );
  out.push({ id: 'day', label: '日', v: 1 / info.D }, { id: 'year', label: '年', v: 1 });
  return out;
}
