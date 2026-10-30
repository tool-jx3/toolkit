/**
 * 互動的時間軸（規格 1.4、1.5、F90、F91、F93）：上方的刻度與標記列（捲動時固定在上面）、左邊的泳道名稱、右邊的事件。
 * DOM 畫（事件是可以聚焦的按鈕）；列、堆疊、刻度、旗子、關聯線和匯出共用 model 的排版。
 *
 * 操作：空白處拖曳平移（左右＝時間、上下＝捲動泳道）、Shift＋拖曳空白處框選、滾輪／兩指縮放（以游標為中心）、
 * 點選（Ctrl／⌘＋點選加減、Shift＋點選範圍）、雙擊新增或編輯、拖曳事件改時間與換泳道（多選時一起拖）、拖兩端改長短、
 * 從選取的事件右邊的圓點拖到另一個事件加上關聯線、旗子拖曳改時間；事件有焦點時方向鍵移動。
 * 指標的追蹤用 window 的監聽（不捕捉指標），所以事件上的雙擊照常收得到。
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  type CSSProperties,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn, createPointerGesture, useMediaQuery } from '@/ui';
import { barTextColor } from '../export/picture';
import { axisTicks, placeMajor, type Tick } from '../model/axis';
import { filteredDoc, matchingIds, normalizeFilter } from '../model/filter';
import {
  collectFlags,
  FLAG_GAP,
  FLAG_H,
  FLAG_PAD,
  type Flag,
  flagRowHeight,
  type PlacedFlag,
  PROGRESS_ID,
  placeFlags,
} from '../model/flags';
import {
  type BackgroundLayout,
  eventSpan,
  INSIDE_PAD,
  ITEM_H,
  type ItemLayout,
  LABEL_GAP,
  layoutTimeline,
  MIN_BAR,
  POINT_R,
  type RowLayout,
  type TimelineLayout,
} from '../model/layout';
import {
  LINK_STYLES,
  type LinkBox,
  type LinkGeometry,
  linkExtent,
  linkGeometry,
} from '../model/links';
import { ellipsize } from '../model/measure';
import {
  boxHits,
  type GroupItem,
  itemBox,
  moveGroup,
  type Rect,
  rangeHits,
} from '../model/selection';
import {
  afterUnit,
  canonical,
  clampValue,
  coarser,
  type EraArg,
  endFromExclusive,
  formatLong,
  precisionUnit,
  readTime,
  type SnapUnit,
  snapTv,
  snapValue,
  type TimeMode,
} from '../model/time';
import { eventColor, GM_COLOR, nowValue } from '../model/types';
import type { VisibleDoc, VisibleEvent, VisibleLink } from '../model/visible';
import { panWindow, revealWindow, type Win, wheelZoomFactor, zoomWindow } from '../model/window';
import {
  addEvent,
  addLink,
  type DragPreview,
  deleteEvents,
  docNow,
  editEvent,
  focusLinkOf,
  guard,
  isPl,
  patchDoc,
  placeEvents,
  prefsNow,
  select,
  selectMany,
  setPrefs,
  setWin,
  toggleSelected,
  updateMarker,
  usePrefs,
  useUi,
} from '../store';
import { S } from '../strings';
import {
  axisMajorMeasure,
  axisMeasure,
  calOfDoc,
  fitFor,
  flagMeasure,
  itemMeasure,
  newEventStart,
  stepTv,
  useVisibleDoc,
} from './shared';

const AXIS_ROW = 24;
/** 按住 Alt 拖曳時，左右移動不到這麼多 px 算「只換泳道」（時間不變） */
const LANE_ONLY_PX = 6;
/** 已經做過的全覽要求（時間軸卸載、重新掛上時不重複） */
let handledFit = 0;
const DRAG_THRESHOLD = 4;
/** 觸控長按事件這麼久（沒移動）＝加減選取（vis-timeline 的 holding items） */
const HOLD_MS = 500;
export const GM_STRIPES =
  'repeating-linear-gradient(135deg, rgb(217 154 30 / 0.22) 0 3px, transparent 3px 9px)';

/** 時間軸的操作（工具列、快捷鍵用；時間軸掛上時才有） */
export const timelineApi: {
  current: {
    zoom: (f: number) => void;
    fit: () => void;
    addAtCenter: () => void;
    /** Ctrl＋A：畫面上看得到（符合篩選）的事件 */
    visibleIds: () => string[];
  } | null;
} = { current: null };

/**
 * 指標按在事件上時，事件按鈕的 focus 不要把多選改成單選（點選由指標的處理決定）。
 * 拖曳、點選結束時清掉。
 */
let pointerSelecting = false;

/** 拖曳中的事件換成預覽的時間與泳道 */
function withPreview(vdoc: VisibleDoc, drag: readonly DragPreview[] | null): VisibleDoc {
  if (!drag?.length) return vdoc;
  const by = new Map(drag.map((d) => [d.id, d]));
  return {
    ...vdoc,
    events: vdoc.events.map((e) => {
      const d = by.get(e.id);
      return d ? { ...e, start: d.start, end: d.end, laneId: d.laneId } : e;
    }),
  };
}

function withFlagPreview(vdoc: VisibleDoc, fd: { id: string; time: string } | null): VisibleDoc {
  if (!fd) return vdoc;
  if (fd.id === PROGRESS_ID) return { ...vdoc, progress: { ...vdoc.progress, time: fd.time } };
  return {
    ...vdoc,
    markers: vdoc.markers.map((m) => (m.id === fd.id ? { ...m, time: fd.time } : m)),
  };
}

type Interaction =
  | {
      kind: 'pan';
      /** 超過門檻、真的開始拖了 */
      active: boolean;
      pointerId: number;
      x0: number;
      y0: number;
      win0: Win;
      scroll0: number;
      /** 沒拖就放開時做的事（取消選取、PL 檢視點事件、點關聯線…）；null＝什麼都不做 */
      click: (() => void) | null;
      /** 觸控長按過了（已經加減選取；之後不拖、不點） */
      held?: boolean;
    }
  | {
      kind: 'item';
      active: boolean;
      pointerId: number;
      x0: number;
      y0: number;
      id: string;
      part: 'move' | 'start' | 'end';
      row0: number;
      laneId: string;
      start: string;
      end: string;
      /** 沒拖就放開時：Ctrl＋點選加減、Shift＋點選範圍、點多選中的一個＝只選它 */
      click: (() => void) | null;
      /** Ctrl 按著（開始拖時沒選的先加進選取） */
      ctrl: boolean;
      /** 一起拖的其他選取中的事件（開始拖時決定） */
      group: GroupItem[] | null;
      /** 觸控長按過了（已經加減選取；之後不拖、不點） */
      held?: boolean;
    }
  | {
      kind: 'flag';
      active: boolean;
      pointerId: number;
      x0: number;
      y0: number;
      id: string;
      time: string;
    }
  | {
      kind: 'box';
      active: boolean;
      pointerId: number;
      x0: number;
      y0: number;
      /** 起點（時間軸的座標） */
      tx: number;
      ty: number;
      /** 開始框選前的選取（Ctrl 按著時加在它後面；Esc 還原） */
      base: string[];
      add: boolean;
      /** 沒拖就放開時（Shift＋點選事件＝選一段） */
      click: (() => void) | null;
    }
  | {
      kind: 'link';
      active: boolean;
      pointerId: number;
      x0: number;
      y0: number;
      from: string;
      sx: number;
      sy: number;
    }
  | { kind: 'pinch'; win0: Win; k0: number };

function rangeText(mode: TimeMode, era: EraArg, start: string, end: string): string {
  const a = readTime(mode, start, era);
  const b = end ? readTime(mode, end, era) : null;
  return a ? `${formatLong(mode, a, era)}${b ? `～${formatLong(mode, b, era)}` : ''}` : '';
}

/** 滑鼠停留的提示：標題、時間、泳道、地點、相關角色、說明的開頭 */
function eventTitleText(vdoc: VisibleDoc, e: VisibleEvent, laneName: string): string {
  const time = e.ongoing
    ? `${rangeText(vdoc.mode, vdoc, e.start, '')}～${S.ongoing}`
    : rangeText(vdoc.mode, vdoc, e.start, e.kind === 'point' ? '' : e.end);
  const parts = [e.title.trim() || S.untitled, time, `${S.fLane}：${laneName}`];
  if (e.place) parts.push(`${S.place}：${e.place}`);
  if (e.people.length) parts.push(`${S.people}：${e.people.join('、')}`);
  const desc = e.description.trim();
  if (desc) parts.push(desc.length > 80 ? `${desc.slice(0, 80)}…` : desc);
  return parts.join('\n');
}

/** 事件畫在第幾列（背景：它的列；主線的背景：主線那一列或第一列） */
function rowOfEventIn(lay: TimelineLayout, id: string): number {
  const it = lay.items.find((x) => x.id === id);
  if (it) return it.row;
  const bg = lay.backgrounds.find((x) => x.id === id);
  if (bg)
    return (
      bg.row ??
      Math.max(
        0,
        lay.rows.findIndex((r) => r.key === ''),
      )
    );
  return 0;
}

/** 每個事件畫出來的位置（關聯線的兩端用；時間軸的座標） */
export function linkBoxes(
  layout: TimelineLayout,
  xOf: (v: number) => number,
): Map<string, LinkBox> {
  const out = new Map<string, LinkBox>();
  for (const it of layout.items) {
    const x1 = xOf(it.a);
    out.set(it.id, {
      kind: it.event.kind === 'point' ? 'point' : 'range',
      x1,
      x2: it.event.kind === 'point' ? x1 : x1 + Math.max(MIN_BAR, xOf(it.b) - x1),
      cy: it.y + ITEM_H / 2,
    });
  }
  for (const bg of layout.backgrounds)
    out.set(bg.id, {
      kind: 'background',
      x1: xOf(bg.a),
      x2: xOf(bg.a),
      cy: bg.labelY + ITEM_H / 2,
    });
  return out;
}

/** 一條關聯線的說明（提示）：「A」導致「B」：說明（names：事件 id → 標題） */
export function linkTitle(names: ReadonlyMap<string, string>, k: VisibleLink): string {
  const name = (id: string) => names.get(id) ?? S.untitled;
  return `${S.linkSentence(name(k.from), k.kind, name(k.to))}${k.note.trim() ? `：${k.note.trim()}` : ''}`;
}

export function Timeline() {
  const vdocAll = useVisibleDoc();
  const collapsed = usePrefs((s) => s.data.collapsed);
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  const filterPrefs = usePrefs((s) => s.data.filter);
  const filterHide = usePrefs((s) => s.data.filterHide);
  const storedWin = useUi((s) => s.win);
  const winMode = useUi((s) => s.winMode);
  const selectedIds = useUi((s) => s.selectedIds);
  const drag = useUi((s) => s.drag);
  const flagDrag = useUi((s) => s.flagDrag);
  const fitRequest = useUi((s) => s.fitRequest);
  const mode = vdocAll.mode;
  const wide = useMediaQuery('(min-width: 640px)', true);
  const labelW = wide ? 144 : 96;

  /* 篩選（F91）：沒符合的淡化，或藏起來（藏起來時排版、全覽也只算符合的） */
  const matches = useMemo(
    () => matchingIds(vdocAll, normalizeFilter(filterPrefs?.[vdocAll.audience])),
    [vdocAll, filterPrefs],
  );
  const vdocBase = useMemo(
    () => (filterHide ? filteredDoc(vdocAll, matches) : vdocAll),
    [vdocAll, matches, filterHide],
  );

  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(0);
  const [viewH, setViewH] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [box, setBox] = useState<Rect | null>(null);
  const [linkDraft, setLinkDraft] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [now, setNow] = useState(() => nowValue());
  const inter = useRef<Interaction | null>(null);
  const holdTimer = useRef(0);
  const gesture = useRef(createPointerGesture());

  /* 畫面範圍：這種寫法上次的（這次開頁的、或存在這台裝置的），沒有時全覽；要求全覽時重新全覽 */
  useLayoutEffect(() => {
    /* 年表檢視時要求的全覽，切回時間軸時才做 */
    if (handledFit !== fitRequest) {
      handledFit = fitRequest;
      setWin(fitFor(vdocBase, trackRef.current?.clientWidth || 800));
      return;
    }
    if (storedWin && winMode === mode) return;
    const saved = prefsNow().windows[mode];
    const ok =
      !!saved &&
      Number.isFinite(saved.start) &&
      Number.isFinite(saved.end) &&
      saved.end > saved.start;
    setWin(
      ok && saved
        ? zoomWindow(mode, saved, 1, undefined, vdocBase)
        : fitFor(vdocBase, trackRef.current?.clientWidth || 800),
    );
  }, [mode, fitRequest, vdocBase, storedWin, winMode]);

  /* 寬度與高度 */
  useLayoutEffect(() => {
    const el = trackRef.current;
    const sc = scrollRef.current;
    if (!el || !sc) return;
    const measure = () => {
      setTrackW(el.clientWidth);
      setViewH(sc.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);

  /* 現在時刻 */
  const showNow = mode === 'date' && vdocBase.showNow;
  useEffect(() => {
    if (!showNow) return;
    setNow(nowValue());
    const t = window.setInterval(() => setNow(nowValue()), 30000);
    return () => window.clearInterval(t);
  }, [showNow]);

  const w: Win =
    storedWin && winMode === mode
      ? storedWin
      : fitFor(vdocBase, trackRef.current?.clientWidth || 800);
  const width = trackW || 800;
  const k = width / Math.max(1e-9, w.end - w.start);
  const xOf = useCallback((v: number) => (v - w.start) * k, [w.start, k]);

  const vdoc = useMemo(
    () => withFlagPreview(withPreview(vdocBase, drag), flagDrag),
    [vdocBase, drag, flagDrag],
  );
  const layout = useMemo(
    () => layoutTimeline(vdoc, { k, measure: itemMeasure, collapsed, untitled: S.untitled }),
    [vdoc, k, collapsed],
  );
  const ticks = useMemo(
    () => axisTicks(mode, w.start, w.end, k, axisMeasure, vdocBase),
    [mode, w.start, w.end, k, vdocBase],
  );
  const flags = useMemo(
    () =>
      placeFlags(
        collectFlags(vdoc, { progress: S.progress, now: S.now }, showNow ? now : null),
        xOf,
        flagMeasure,
      ),
    [vdoc, xOf, showNow, now],
  );
  /* 提示與顏色只跟著資料變（縮放、平移時不重算） */
  const looks = useMemo(() => {
    const laneNames = new Map(vdocBase.lanes.map((l) => [l.id, l.name.trim() || S.untitled]));
    const out = new Map<string, { title: string; color: string }>();
    for (const e of vdocBase.events)
      out.set(e.id, {
        title: eventTitleText(vdocBase, e, e.laneId ? (laneNames.get(e.laneId) ?? S.main) : S.main),
        color: eventColor(vdocBase, e),
      });
    return out;
  }, [vdocBase]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const dragging = useMemo(() => new Set((drag ?? []).map((d) => d.id)), [drag]);
  /** 淡化的事件（篩選中、沒符合，淡化模式） */
  const dimOf = useCallback(
    (id: string) => !filterHide && !!matches && !matches.has(id),
    [filterHide, matches],
  );
  const flagH = flagRowHeight(flags.levels);
  const headerH = AXIS_ROW * 2 + flagH;
  const bodyH = Math.max(layout.height, viewH - headerH - 2);

  /* 給拖曳、鍵盤用的最新值 */
  const live = useRef({ w, k, layout, ticks, vdoc: vdocBase, dimOf, xOf });
  live.current = { w, k, layout, ticks, vdoc: vdocBase, dimOf, xOf };

  const snapUnit = (alt: boolean): SnapUnit =>
    alt
      ? mode === 'year'
        ? calOfDoc(live.current.vdoc)
          ? { kind: 'day', n: 1 }
          : { kind: 'year', n: 1 }
        : { kind: 'min', n: 1 }
      : live.current.ticks.snap;

  /* ---------- 縮放、平移 ---------- */

  const zoomAt = useCallback(
    (f: number, clientX?: number) => {
      const cur = live.current;
      let anchor: number | undefined;
      const r = trackRef.current?.getBoundingClientRect();
      if (clientX !== undefined && r && r.width > 0) {
        const x = Math.min(r.width, Math.max(0, clientX - r.left));
        anchor = cur.w.start + x / cur.k;
      }
      setWin(zoomWindow(mode, cur.w, f, anchor, cur.vdoc));
    },
    [mode],
  );

  useEffect(() => {
    const api = {
      zoom: (f: number) => zoomAt(f),
      fit: () => setWin(fitFor(live.current.vdoc, trackRef.current?.clientWidth || 800)),
      addAtCenter: () => {
        const cur = live.current;
        const mid = (cur.w.start + cur.w.end) / 2;
        const sel = useUi.getState().selectedId;
        const ev = sel ? docNow().events.find((x) => x.id === sel) : undefined;
        addEvent({
          start: newEventStart(mode, mid, cur.ticks.snap, cur.vdoc),
          laneId: ev?.laneId ?? '',
        });
      },
      visibleIds: () => {
        const cur = live.current;
        const W = trackRef.current?.clientWidth || 800;
        const ids: string[] = [];
        for (const it of cur.layout.items) {
          if (cur.dimOf(it.id)) continue;
          const b = itemBox(it, cur.xOf);
          if (b.right >= 0 && b.left <= W) ids.push(it.id);
        }
        for (const bg of cur.layout.backgrounds) {
          if (cur.dimOf(bg.id)) continue;
          if (cur.xOf(bg.b) >= 0 && cur.xOf(bg.a) <= W) ids.push(bg.id);
        }
        return ids;
      },
    };
    timelineApi.current = api;
    return () => {
      if (timelineApi.current === api) timelineApi.current = null;
    };
  }, [zoomAt, mode]);

  /* 滾輪：滑鼠滾輪與 Ctrl＋滾輪縮放；觸控板左右、Shift＋滾輪平移；上下捲動泳道（瀏覽器原本的捲動） */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const f = wheelZoomFactor(e);
      if (f) {
        e.preventDefault();
        zoomAt(f, e.clientX);
        return;
      }
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (dx && (e.shiftKey || Math.abs(dx) > Math.abs(e.deltaY))) {
        e.preventDefault();
        const cur = live.current;
        setWin(panWindow(mode, cur.w, dx / cur.k, cur.vdoc));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mode, zoomAt]);

  /* ---------- 指標（window 的監聽） ---------- */

  const rowAtClientY = (clientY: number): number => {
    const r = trackRef.current?.getBoundingClientRect();
    const rows = live.current.layout.rows;
    if (!r || !rows.length) return 0;
    const y = clientY - r.top;
    let i = rows.findIndex((row) => y >= row.y && y < row.y + row.height);
    if (i < 0) i = y < 0 ? 0 : rows.length - 1;
    return i;
  };

  /** 事件畫在第幾列（背景：它的列；主線的背景：主線那一列或第一列） */
  const rowOfEvent = (id: string): number => {
    const lay = live.current.layout;
    const it = lay.items.find((x) => x.id === id);
    if (it) return it.row;
    const bg = lay.backgrounds.find((x) => x.id === id);
    if (bg)
      return (
        bg.row ??
        Math.max(
          0,
          lay.rows.findIndex((r) => r.key === ''),
        )
      );
    return 0;
  };

  const trackPoint = (clientX: number, clientY: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  const impl = useRef({
    move: (_e: PointerEvent) => {},
    up: (_e: PointerEvent) => {},
    cancel: () => {},
    key: (_e: KeyboardEvent) => {},
  });
  const listeners = useRef({
    move: (e: PointerEvent) => impl.current.move(e),
    up: (e: PointerEvent) => impl.current.up(e),
    cancel: () => impl.current.cancel(),
    key: (e: KeyboardEvent) => impl.current.key(e),
  });
  const detach = () => {
    const l = listeners.current;
    window.removeEventListener('pointermove', l.move);
    window.removeEventListener('pointerup', l.up);
    window.removeEventListener('pointercancel', l.cancel);
    window.removeEventListener('keydown', l.key, true);
  };
  const finish = () => {
    window.clearTimeout(holdTimer.current);
    inter.current = null;
    pointerSelecting = false;
    gesture.current.reset();
    setTip(null);
    setBox(null);
    setLinkDraft(null);
    rootRef.current?.removeAttribute('data-dragging');
    detach();
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: 卸載時移除 window 的監聽
  useEffect(() => () => detach(), []);

  const cancelDrag = () => {
    const it = inter.current;
    if (it?.kind === 'item') useUi.setState({ drag: null });
    if (it?.kind === 'flag') useUi.setState({ flagDrag: null });
    if (it?.kind === 'box' && it.active) selectMany(it.base, useUi.getState().selectedId);
    finish();
  };

  /** 開始拖事件：沒選的先選（Ctrl 按著時加進選取），選取中的其他事件一起拖 */
  const startItemDrag = (cur: Extract<Interaction, { kind: 'item' }>) => {
    const ui = useUi.getState();
    if (!ui.selectedIds.includes(cur.id)) {
      if (cur.ctrl) toggleSelected(cur.id);
      else select(cur.id);
    }
    if (cur.part !== 'move') return;
    const ids = useUi.getState().selectedIds.filter((x) => x !== cur.id);
    if (!ids.length) return;
    const by = new Map(docNow().events.map((e) => [e.id, e]));
    cur.group = ids
      .map((id) => by.get(id))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map((e) => ({
        id: e.id,
        start: e.start,
        end: e.end,
        laneId: e.laneId,
        row: rowOfEvent(e.id),
      }));
  };

  const onMove = (e: PointerEvent) => {
    const it = inter.current;
    if (!it) return;
    const sample = gesture.current.move(e.pointerId, e.clientX, e.clientY);
    if (it.kind === 'pinch') {
      if (sample?.kind !== 'pinch') return;
      const r = trackRef.current?.getBoundingClientRect();
      if (!r || r.width <= 0) return;
      const ox = sample.originX - r.left;
      const anchor = it.win0.start + ox / it.k0;
      const span = (it.win0.end - it.win0.start) / Math.max(0.01, sample.scale);
      const kk = r.width / span;
      const start = anchor - (ox + sample.dx) / kk;
      setWin(zoomWindow(mode, { start, end: start + span }, 1, undefined, live.current.vdoc));
      return;
    }
    if (it.pointerId !== e.pointerId) return;
    if ((it.kind === 'item' || it.kind === 'pan') && it.held) return;
    const dx = e.clientX - it.x0;
    const dy = e.clientY - it.y0;
    if (!it.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      it.active = true;
      rootRef.current?.setAttribute('data-dragging', '');
      if (it.kind === 'item') startItemDrag(it);
    }
    const cur = inter.current;
    if (!cur || cur.kind === 'pinch') return;
    const { k: kk, vdoc: vd, layout: lay } = live.current;
    if (cur.kind === 'pan') {
      setWin(panWindow(mode, cur.win0, -dx / kk, vd));
      if (scrollRef.current) scrollRef.current.scrollTop = cur.scroll0 - dy;
      return;
    }
    if (cur.kind === 'box') {
      const p = trackPoint(e.clientX, e.clientY);
      const rect: Rect = {
        left: Math.min(cur.tx, p.x),
        right: Math.max(cur.tx, p.x),
        top: Math.min(cur.ty, p.y),
        bottom: Math.max(cur.ty, p.y),
      };
      setBox(rect);
      const hits = boxHits(lay, rect, live.current.xOf, (id) => !live.current.dimOf(id));
      selectMany(cur.add ? [...cur.base, ...hits] : hits, hits[hits.length - 1] ?? null);
      return;
    }
    if (cur.kind === 'link') {
      const p = trackPoint(e.clientX, e.clientY);
      setLinkDraft({ x1: cur.sx, y1: cur.sy, x2: p.x, y2: p.y });
      return;
    }
    if (cur.kind === 'flag') {
      const orig = readTime(mode, cur.time, vd);
      if (!orig) return;
      const tv = snapTv(mode, clampValue(mode, orig.v + dx / kk), orig.p, snapUnit(e.altKey), vd);
      useUi.setState({ flagDrag: { id: cur.id, time: canonical(mode, tv, vd) } });
      const label =
        cur.id === PROGRESS_ID
          ? S.progress
          : (vd.markers.find((m) => m.id === cur.id)?.label ?? '');
      setTip({ x: e.clientX, y: e.clientY, text: `${label}・${formatLong(mode, tv, vd)}` });
      return;
    }
    if (cur.kind !== 'item') return;
    const a = readTime(mode, cur.start, vd);
    if (!a) return;
    const b = cur.end ? readTime(mode, cur.end, vd) : null;
    const unit = snapUnit(e.altKey);
    const dv = dx / kk;
    const prev = useUi.getState().drag?.find((d) => d.id === cur.id);
    let start = cur.start;
    let end = cur.end;
    /** 被拖的那個吸附後的位移（一起拖的照這個移動） */
    let moved = 0;
    if (cur.part === 'move' || !b) {
      /* 按住 Alt 上下拖（左右不到 LANE_ONLY_PX）：只換泳道，時間不變（不吸附也不跟著手抖） */
      if (!(e.altKey && Math.abs(dx) < LANE_ONLY_PX)) {
        const ns = snapTv(mode, clampValue(mode, a.v + dv), a.p, unit, vd);
        start = canonical(mode, ns, vd);
        moved = ns.v - a.v;
        if (b)
          end = canonical(
            mode,
            snapTv(mode, clampValue(mode, b.v + (ns.v - a.v)), b.p, unit, vd),
            vd,
          );
      }
    } else if (cur.part === 'start') {
      const ns = snapTv(mode, clampValue(mode, a.v + dv), a.p, unit, vd);
      start = ns.v < afterUnit(mode, b, vd) ? canonical(mode, ns, vd) : (prev?.start ?? cur.start);
    } else {
      const u = coarser(mode, unit, precisionUnit(mode, b.p), vd);
      const t = snapValue(mode, clampValue(mode, afterUnit(mode, b, vd) + dv), u, vd);
      const ne = endFromExclusive(mode, t, b.p, vd);
      end = afterUnit(mode, ne, vd) > a.v ? canonical(mode, ne, vd) : (prev?.end ?? cur.end);
    }
    let laneId = cur.laneId;
    let dRow = 0;
    if (cur.part === 'move') {
      const r = rowAtClientY(e.clientY);
      if (r !== cur.row0) {
        laneId = lay.rows[r]?.key ?? '';
        dRow = r - cur.row0;
      }
    }
    const previews: DragPreview[] = [{ id: cur.id, start, end, laneId }];
    if (cur.group)
      previews.push(
        ...moveGroup(
          mode,
          vd,
          cur.group,
          moved,
          dRow,
          lay.rows.map((r) => r.key),
        ),
      );
    useUi.setState({ drag: previews });
    const laneName = laneId
      ? vd.lanes.find((l) => l.id === laneId)?.name.trim() || S.untitled
      : S.main;
    const text = S.dragTip(rangeText(mode, vd, start, end), laneName);
    setTip({
      x: e.clientX,
      y: e.clientY,
      text: cur.group ? `${text}${S.dragMany(cur.group.length + 1)}` : text,
    });
  };

  const onUp = (e: PointerEvent) => {
    const it = inter.current;
    if (!it) return;
    if (it.kind === 'pinch') {
      gesture.current.up(e.pointerId);
      if (!gesture.current.active()) finish();
      return;
    }
    if (it.pointerId !== e.pointerId) return;
    if (it.kind === 'item') {
      const list = useUi.getState().drag;
      useUi.setState({ drag: null });
      if (!it.active) it.click?.();
      else if (list?.length) {
        const by = new Map(docNow().events.map((x) => [x.id, x]));
        const changed = list.filter((d) => {
          const o = by.get(d.id);
          return o && (o.start !== d.start || o.end !== d.end || o.laneId !== d.laneId);
        });
        if (changed.length) placeEvents(changed);
      }
    } else if (it.kind === 'flag') {
      const fd = useUi.getState().flagDrag;
      useUi.setState({ flagDrag: null });
      if (fd && fd.time !== it.time) {
        if (fd.id === PROGRESS_ID) patchDoc({ progress: { ...docNow().progress, time: fd.time } });
        else
          updateMarker(fd.id, (m) => {
            m.time = fd.time;
          });
      }
    } else if (it.kind === 'link') {
      if (it.active) {
        const target = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>('[data-event-id]');
        const to = target?.dataset.eventId;
        if (to && to !== it.from) addLink(it.from, to);
      }
    } else if ((it.kind === 'pan' || it.kind === 'box') && !it.active) {
      it.click?.();
    }
    finish();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && inter.current) {
      e.preventDefault();
      e.stopPropagation();
      cancelDrag();
    }
  };

  impl.current = { move: onMove, up: onUp, cancel: cancelDrag, key: onKey };

  const begin = (e: ReactPointerEvent, it: Interaction) => {
    const already = inter.current;
    gesture.current.down(e.pointerId, e.clientX, e.clientY);
    if (already) {
      if (e.pointerType === 'touch' && gesture.current.count() >= 2 && already.kind !== 'pinch') {
        /* 第二指：改成捏合（拖到一半的事件、旗子放回去） */
        useUi.setState({ drag: null, flagDrag: null });
        setTip(null);
        setBox(null);
        setLinkDraft(null);
        inter.current = { kind: 'pinch', win0: live.current.w, k0: live.current.k };
      }
      return;
    }
    inter.current = it;
    const l = listeners.current;
    window.addEventListener('pointermove', l.move);
    window.addEventListener('pointerup', l.up);
    window.addEventListener('pointercancel', l.cancel);
    window.addEventListener('keydown', l.key, true);
  };

  const panStart = (e: ReactPointerEvent, click: (() => void) | null): Interaction => ({
    kind: 'pan',
    active: false,
    pointerId: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    win0: live.current.w,
    scroll0: scrollRef.current?.scrollTop ?? 0,
    click,
  });

  /** 觸控長按事件（沒移動）：加減選取，之後這次的按住不拖也不算點一下 */
  const startHold = (id: string) => {
    window.clearTimeout(holdTimer.current);
    const it = inter.current;
    holdTimer.current = window.setTimeout(() => {
      if (!it || inter.current !== it || (it.kind !== 'item' && it.kind !== 'pan') || it.active)
        return;
      toggleSelected(id);
      it.held = true;
      it.click = null;
    }, HOLD_MS);
  };

  /** 點事件（沒有拖）時的選取：Ctrl／⌘＝加減、Shift＝範圍、多選中點其中一個＝只選它 */
  const clickSelect = (id: string, ctrl: boolean, shift: boolean): (() => void) | null => {
    const ui = useUi.getState();
    if (ctrl) return () => toggleSelected(id);
    if (shift) {
      const anchor = ui.selectedId;
      if (!anchor || anchor === id) return () => select(id);
      return () =>
        selectMany(
          rangeHits(live.current.layout, anchor, id, (x) => !live.current.dimOf(x)),
          anchor,
        );
    }
    if (ui.selectedIds.includes(id) && ui.selectedIds.length > 1) return () => select(id);
    return null;
  };

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as HTMLElement;
    const ctrl = e.ctrlKey || e.metaKey;
    /* 關聯線的把手：拖到另一個事件 */
    const handle = e.button === 0 ? target.closest<HTMLElement>('[data-link-handle]') : null;
    if (handle && !isPl()) {
      e.preventDefault();
      e.stopPropagation();
      const from = handle.dataset.linkHandle as string;
      const p = trackPoint(e.clientX, e.clientY);
      begin(e, {
        kind: 'link',
        active: false,
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        from,
        sx: p.x,
        sy: p.y,
      });
      return;
    }
    const itemEl = e.button === 0 ? target.closest<HTMLElement>('[data-event-id]') : null;
    /*
     * Shift＋拖曳：框選（從事件上開始也是，事件多、找不到空白處時也能框；Ctrl 也按著時加進原本的選取）；
     * Shift＋點事件（沒拖）＝選一段
     */
    if (e.button === 0 && e.shiftKey) {
      const id = itemEl?.dataset.eventId;
      e.preventDefault();
      if (id) pointerSelecting = true;
      else rootRef.current?.focus({ preventScroll: true });
      const p = trackPoint(e.clientX, e.clientY);
      begin(e, {
        kind: 'box',
        active: false,
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        tx: p.x,
        ty: p.y,
        base: [...useUi.getState().selectedIds],
        add: ctrl,
        click: id ? clickSelect(id, ctrl, true) : null,
      });
      return;
    }
    if (itemEl) {
      const id = itemEl.dataset.eventId as string;
      pointerSelecting = true;
      const touch = e.pointerType === 'touch';
      let click = clickSelect(id, ctrl, e.shiftKey);
      /* 沒有修飾鍵、還沒選的：按下就選（和以前一樣；觸控時放開才選，長按＝加進選取） */
      if (!click && !useUi.getState().selectedIds.includes(id)) {
        if (touch) click = () => select(id);
        else select(id);
      }
      const ev = docNow().events.find((x) => x.id === id);
      if (!ev || isPl()) {
        /* PL 檢視：只能選取，按住拖曳＝平移 */
        begin(e, panStart(e, click));
        if (touch) startHold(id);
        return;
      }
      const part = (target.closest<HTMLElement>('[data-handle]')?.dataset.handle ?? 'move') as
        | 'move'
        | 'start'
        | 'end';
      begin(e, {
        kind: 'item',
        active: false,
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        id,
        part,
        row0: rowOfEvent(id),
        laneId: ev.laneId,
        start: ev.start,
        end: ev.end,
        click,
        ctrl,
        group: null,
      });
      if (touch) startHold(id);
      return;
    }
    e.preventDefault();
    rootRef.current?.focus({ preventScroll: true });
    /* 點一下空白處：取消選取（點在關聯線上：選取線的起點）；Ctrl 按著時不取消 */
    const linkEl = target.closest<SVGElement>('[data-link-id]');
    const linkId = linkEl?.getAttribute('data-link-id');
    begin(e, panStart(e, linkId ? () => focusLinkOf(linkId) : ctrl ? null : () => select(null)));
  };

  const onFlagPointerDown = (e: ReactPointerEvent<HTMLElement>, f: Flag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (isPl() || f.kind === 'now') return;
    const doc = docNow();
    const time =
      f.kind === 'progress'
        ? doc.progress.time
        : (doc.markers.find((m) => m.id === f.id)?.time ?? '');
    begin(e, {
      kind: 'flag',
      active: false,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      id: f.id,
      time,
    });
  };

  const onTrackDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-link-handle]')) return;
    const itemEl = target.closest<HTMLElement>('[data-event-id]');
    if (itemEl) {
      editEvent(itemEl.dataset.eventId as string);
      return;
    }
    if (isPl()) return;
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const { w: cw, k: ck, layout: lay, ticks: tk, vdoc: vd } = live.current;
    const v = cw.start + (e.clientX - r.left) / ck;
    const row = lay.rows[rowAtClientY(e.clientY)];
    addEvent({ start: newEventStart(mode, v, tk.snap, vd), laneId: row?.key ?? '' });
  };

  /* ---------- 鍵盤 ---------- */

  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget && e.target !== scrollRef.current) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const cur = live.current;
    const span = cur.w.end - cur.w.start;
    const f = e.shiftKey ? 0.5 : 0.1;
    setWin(panWindow(mode, cur.w, (e.key === 'ArrowLeft' ? -1 : 1) * span * f, cur.vdoc));
  };

  const onItemKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>, id: string) => {
      if (e.target !== e.currentTarget) return;
      const key = e.key;
      /* 多選中、焦點在其中一個：方向鍵、Delete 對全部的選取 */
      const sel = useUi.getState().selectedIds;
      const many = sel.length > 1 && sel.includes(id) ? sel : null;
      if (key === 'Enter') {
        e.preventDefault();
        editEvent(id);
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        select(null);
        rootRef.current?.focus();
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        /* 刪除選取的（焦點在沒選的事件上、又有選取時：還是刪除選取的那些） */
        if (deleteEvents(sel.length ? sel : [id]).length) rootRef.current?.focus();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (!guard()) return;
      const ev = docNow().events.find((x) => x.id === id);
      const cur = live.current;
      if (!ev) return;
      const ctx = cur.vdoc;
      const a = readTime(mode, ev.start, ctx);
      if (!a) return;
      const b = ev.kind !== 'point' ? readTime(mode, ev.end, ctx) : null;
      let next = { start: ev.start, end: ev.end, laneId: ev.laneId };
      let dv = 0;
      let dRow = 0;
      const rows = cur.layout.rows;
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const r = rowOfEventIn(cur.layout, id);
        const to = r + (key === 'ArrowUp' ? -1 : 1);
        if (to < 0 || to >= rows.length) return;
        next = { ...next, laneId: rows[to].key };
        dRow = to - r;
      } else {
        const dir = key === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey) {
          if (!b) return;
          const nb = stepTv(mode, b, cur.ticks.snap, dir, ctx);
          if (afterUnit(mode, nb, ctx) <= a.v) return;
          next = { ...next, end: canonical(mode, nb, ctx) };
        } else {
          const na = stepTv(mode, a, cur.ticks.snap, dir, ctx);
          next = { ...next, start: canonical(mode, na, ctx) };
          if (b) next.end = canonical(mode, { v: b.v + (na.v - a.v), p: b.p }, ctx);
          dv = na.v - a.v;
        }
      }
      const list: DragPreview[] = [{ id, ...next }];
      if (many && !e.shiftKey) {
        const by = new Map(docNow().events.map((x) => [x.id, x]));
        const group: GroupItem[] = many
          .filter((x) => x !== id)
          .map((x) => by.get(x))
          .filter((x): x is NonNullable<typeof x> => !!x)
          .map((x) => ({
            id: x.id,
            start: x.start,
            end: x.end,
            laneId: x.laneId,
            row: rowOfEventIn(cur.layout, x.id),
          }));
        list.push(
          ...moveGroup(
            mode,
            ctx,
            group,
            dv,
            dRow,
            rows.map((r) => r.key),
          ),
        );
      }
      placeEvents(list, false);
      const moved = docNow().events.find((x) => x.id === id);
      if (moved) {
        const s = eventSpan(mode, { ...moved }, ctx);
        if (s) setWin(revealWindow(mode, cur.w, s.a, s.b, 0.05, ctx));
      }
      /* 換了列或畫面捲動後，焦點留在同一個事件上 */
      requestAnimationFrame(() => {
        const el = rootRef.current?.querySelector<HTMLElement>(
          `[data-event-id="${CSS.escape(id)}"]`,
        );
        /* 背景事件的焦點在左上角的標題按鈕 */
        const target = el?.matches('button')
          ? el
          : el?.querySelector<HTMLElement>('[data-band-label]');
        target?.focus({ preventScroll: true });
      });
    },
    [mode],
  );

  const onFlagKeyDown = (e: ReactKeyboardEvent<HTMLElement>, f: Flag) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || f.kind === 'now') return;
    e.preventDefault();
    e.stopPropagation();
    if (!guard()) return;
    const doc = docNow();
    const time =
      f.kind === 'progress' ? doc.progress.time : doc.markers.find((m) => m.id === f.id)?.time;
    const tv = time ? readTime(mode, time, doc) : null;
    if (!tv) return;
    const dir = e.key === 'ArrowLeft' ? -1 : 1;
    const next = canonical(mode, stepTv(mode, tv, live.current.ticks.snap, dir, doc), doc);
    if (f.kind === 'progress') patchDoc({ progress: { ...doc.progress, time: next } }, false);
    else
      updateMarker(
        f.id,
        (m) => {
          m.time = next;
        },
        false,
      );
  };

  const toggleCollapse = useCallback((id: string) => {
    const c = { ...prefsNow().collapsed };
    if (c[id]) delete c[id];
    else c[id] = true;
    setPrefs({ collapsed: c });
  }, []);

  /* ---------- 畫 ---------- */

  /* 畫面上的事件（Tab 的順序：由上而下、由早到晚） */
  const visItems = layout.items.filter((it) => {
    const x1 = xOf(it.a);
    const x2 = xOf(it.b);
    const right =
      it.event.kind === 'point' || !it.inside
        ? Math.max(x2, x1 + MIN_BAR) + POINT_R + LABEL_GAP + it.labelW + 24
        : x2;
    return right >= -20 && x1 - POINT_R <= width + 20;
  });
  visItems.sort((p, q) => p.row - q.row || p.a - q.a || p.level - q.level);

  /* 關聯線（F93）：兩端都畫得出來、和畫面有交集的 */
  /*
   * 關聯線（F93）：兩端都畫得出來的。座標以排版的 origin 為 0（平移時不用重算，整層用 translate 移動）。
   */
  const links = useMemo(() => {
    if (!vdoc.links.length) return [];
    const boxes = linkBoxes(layout, (v) => (v - layout.origin) * k);
    const out: { k: VisibleLink; g: LinkGeometry }[] = [];
    for (const kk of vdoc.links) {
      const a = boxes.get(kk.from);
      const b = boxes.get(kk.to);
      if (!a || !b) continue;
      out.push({ k: kk, g: linkGeometry(a, b, LINK_STYLES[kk.kind].arrow) });
    }
    return out;
  }, [vdoc.links, layout, k]);
  const linkShift = (layout.origin - w.start) * k;
  /* 只畫和畫面有交集的線（平移時跟著換；線多時少畫一些） */
  const shownLinks = useMemo(() => {
    const lo = -linkShift - 40;
    const hi = width - linkShift + 40;
    return links.filter(({ g }) => {
      const ext = linkExtent(g);
      return ext.right >= lo && ext.left <= hi;
    });
  }, [links, linkShift, width]);

  /* 只選了一個（GM 檢視）：右邊畫「拖到另一個事件加上關聯線」的圓點 */
  const single = selectedIds.length === 1 && !pl && !drag ? selectedIds[0] : null;
  const handleAt = useMemo(() => {
    if (!single) return null;
    const it = layout.items.find((x) => x.id === single);
    if (it) {
      const b = itemBox(it, xOf);
      const extra = it.event.gmNote.trim() ? 12 : 0;
      return { x: b.right + 7 + extra, y: it.y + ITEM_H / 2 };
    }
    const bg = layout.backgrounds.find((x) => x.id === single);
    if (bg)
      return {
        x: Math.max(0, xOf(bg.a)) + 8 + itemMeasure(bg.event.title.trim() || S.untitled) + 16,
        y: bg.labelY + ITEM_H / 2,
      };
    return null;
  }, [single, layout, xOf]);

  return (
    <section
      ref={rootRef}
      aria-label={S.timeline}
      aria-describedby="st-timeline-help"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 時間軸本身可以聚焦（←／→ 平移），說明在 aria-describedby
      tabIndex={0}
      data-testid="timeline"
      data-pl={pl || undefined}
      onKeyDown={onRootKeyDown}
      className="relative flex h-[60dvh] min-h-80 w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-bg select-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none data-[dragging]:cursor-grabbing lg:h-[calc(100dvh-13rem)] lg:min-h-[28rem]"
    >
      <p id="st-timeline-help" className="sr-only">
        {S.timelineHelp}
      </p>
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        data-testid="timeline-scroll"
      >
        {/* 刻度與標記列（捲動時固定在上面） */}
        <div
          className="sticky top-0 z-20 flex border-b border-border bg-surface"
          style={{ height: headerH }}
        >
          <div
            className="flex shrink-0 items-end border-r border-border px-2 pb-1 text-[11px] font-semibold text-muted"
            style={{ width: labelW }}
          >
            {mode === 'year' && vdoc.era.trim() ? (
              <span className="truncate" data-testid="axis-era">
                {vdoc.era.trim()}
              </span>
            ) : null}
          </div>
          <div className="relative min-w-0 flex-1 overflow-hidden" data-testid="axis">
            <AxisLabels major={ticks.major} minor={ticks.minor} xOf={xOf} width={width} />
            {flags.flags.map((f) => (
              <FlagView
                key={f.id}
                f={f}
                x={xOf(f.v)}
                top={AXIS_ROW * 2 + FLAG_GAP + f.level * (FLAG_H + FLAG_GAP)}
                gm={!pl}
                editable={!pl && f.kind !== 'now'}
                onPointerDown={onFlagPointerDown}
                onKeyDown={onFlagKeyDown}
              />
            ))}
          </div>
        </div>

        <div className="relative flex" style={{ height: bodyH }}>
          {/* 泳道名稱 */}
          <div
            className="relative z-10 shrink-0 border-r border-border bg-surface"
            style={{ width: labelW }}
          >
            {layout.rows.map((row) => (
              <LaneLabel
                key={row.key || '__main'}
                row={row}
                gm={!pl}
                name={row.lane ? row.lane.name.trim() || S.untitled : S.main}
                onToggle={toggleCollapse}
              />
            ))}
          </div>
          {/* 時間軸（鍵盤：時間軸有焦點時 ←／→ 平移，事件有焦點時方向鍵移動；說明在 aria-describedby） */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 拖曳平移、框選、雙擊新增是指標的操作，鍵盤另有對應 */}
          <div
            ref={trackRef}
            className="relative min-w-0 flex-1 cursor-grab touch-none overflow-hidden"
            data-testid="track"
            onPointerDown={onTrackPointerDown}
            onContextMenu={(e) => {
              /* 觸控長按（加減選取）時不跳出長按選單 */
              if (inter.current) e.preventDefault();
            }}
            onDoubleClick={onTrackDoubleClick}
          >
            {ticks.minor.map((t) => (
              <div
                key={`n${t.v}`}
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-border opacity-60"
                style={{ left: Math.round(xOf(t.v)) }}
              />
            ))}
            {ticks.major.map((t) => (
              <div
                key={`j${t.v}`}
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-border-strong opacity-50"
                style={{ left: Math.round(xOf(t.v)) }}
              />
            ))}
            {layout.rows.map((row) => (
              <div
                key={`r${row.key}`}
                aria-hidden
                className="pointer-events-none absolute right-0 left-0 h-px bg-border"
                style={{ top: row.y + row.height - 1 }}
              />
            ))}
            {layout.backgrounds.map((bg) => {
              const row = bg.row === null ? null : layout.rows[bg.row];
              const x1 = xOf(bg.a);
              const x2 = xOf(bg.b);
              if (x2 < -10 || x1 > width + 10) return null;
              const top = row ? row.y : 0;
              return (
                <BackgroundBand
                  key={bg.id}
                  bg={bg}
                  color={looks.get(bg.id)?.color ?? ''}
                  left={Math.max(-4, x1)}
                  right={Math.min(width + 4, x2)}
                  cutLeft={x1 < -4}
                  cutRight={x2 > width + 4}
                  top={top}
                  height={row ? row.height - 1 : bodyH}
                  labelTop={bg.labelY - top + 3}
                  selected={selected.has(bg.id)}
                  gm={!pl}
                  editable={!pl}
                  dim={dimOf(bg.id)}
                  title={looks.get(bg.id)?.title ?? ''}
                  dragging={dragging.has(bg.id)}
                  onKeyDown={onItemKeyDown}
                />
              );
            })}
            {flags.flags.map((f) => (
              <div
                key={`l${f.id}`}
                aria-hidden
                data-flag-line={f.kind}
                className="pointer-events-none absolute top-0 bottom-0 z-[2]"
                style={{
                  left: Math.round(xOf(f.v)),
                  borderLeft:
                    f.kind === 'marker'
                      ? `1.5px dashed ${!pl && f.secret ? GM_COLOR : f.color}`
                      : `2px solid ${f.kind === 'progress' ? 'var(--accent)' : f.color}`,
                }}
              />
            ))}
            {shownLinks.length || linkDraft ? (
              <LinkLayer
                links={shownLinks}
                shift={linkShift}
                width={width}
                height={bodyH}
                gm={!pl}
                selected={selected}
                dimOf={dimOf}
                vdoc={vdoc}
                draft={linkDraft}
              />
            ) : null}
            {visItems.map((it) => (
              <Item
                key={it.id}
                it={it}
                x1={xOf(it.a)}
                x2={xOf(it.b)}
                width={width}
                color={looks.get(it.id)?.color ?? ''}
                selected={selected.has(it.id)}
                dragging={dragging.has(it.id)}
                gm={!pl}
                editable={!pl}
                dim={dimOf(it.id)}
                title={looks.get(it.id)?.title ?? ''}
                onKeyDown={onItemKeyDown}
              />
            ))}
            {handleAt ? (
              <span
                aria-hidden
                data-link-handle={single ?? ''}
                data-testid="link-handle"
                title={S.linkHandle}
                className="absolute z-[6] flex size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border-2 border-accent bg-bg shadow-1 hover:bg-accent"
                style={{ left: handleAt.x, top: handleAt.y }}
              />
            ) : null}
            {box ? (
              <div
                aria-hidden
                data-testid="select-box"
                className="pointer-events-none absolute z-[7] rounded-sm border border-accent bg-accent-soft/40"
                style={{
                  left: box.left,
                  top: box.top,
                  width: box.right - box.left,
                  height: box.bottom - box.top,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {vdocAll.events.length === 0 ? (
        <p
          className="pointer-events-none absolute inset-x-0 top-1/2 m-0 -translate-y-1/2 px-6 text-center text-sm text-muted"
          data-testid="timeline-empty"
        >
          {pl ? S.emptyPl : S.emptyGm}
        </p>
      ) : matches && matches.size === 0 ? (
        <p
          className="pointer-events-none absolute inset-x-0 top-1/2 m-0 -translate-y-1/2 px-6 text-center text-sm text-muted"
          data-testid="timeline-nomatch"
        >
          {S.filterNone}
        </p>
      ) : null}
      {pl ? (
        <span
          className="pointer-events-none absolute right-3 bottom-3 z-30 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted shadow-1"
          data-testid="pl-badge"
        >
          {S.plBadge}
        </span>
      ) : null}
      {tip ? <DragTip tip={tip} root={rootRef.current} /> : null}
    </section>
  );
}

const selectOnFocus = (id: string) => {
  if (pointerSelecting) return;
  const ui = useUi.getState();
  /* 多選中的一個拿到焦點（Tab）：選取不變 */
  if (ui.selectedIds.includes(id)) return;
  select(id);
};

/* ---------- 刻度 ---------- */

const AxisLabels = memo(function AxisLabels({
  major,
  minor,
  xOf,
  width,
}: {
  major: Tick[];
  minor: Tick[];
  xOf: (v: number) => number;
  width: number;
}) {
  return (
    <>
      {major.map((t, i) => {
        const next = major[i + 1];
        /* 左邊被切到的那一格：標籤貼在左邊；放不下（壓到下一格、超出右邊）時用短寫法，都放不下時不畫 */
        const at = placeMajor(t, xOf(t.v), next ? xOf(next.v) : null, 0, width, axisMajorMeasure);
        if (!at) return null;
        return (
          <span
            key={`j${t.v}`}
            className="absolute top-0 flex h-6 items-center text-[11px] font-semibold whitespace-nowrap text-fg"
            style={{ left: at.left }}
            data-axis-major={at.text}
          >
            {at.text}
          </span>
        );
      })}
      {minor.map((t) => {
        const x = xOf(t.v);
        /* 左邊被切到的格子不寫標籤（只剩半個字）；右邊放不下整個標籤的也不寫 */
        if (x < -1 || x + 4 + axisMeasure(t.label) > width) return null;
        return (
          <span
            key={`n${t.v}`}
            className="absolute flex h-6 items-center border-l border-border pl-1 text-[11px] whitespace-nowrap text-muted"
            style={{ left: Math.round(x), top: AXIS_ROW }}
            data-axis-minor={t.label}
          >
            {t.label}
          </span>
        );
      })}
    </>
  );
});

/* ---------- 旗子 ---------- */

function FlagView({
  f,
  x,
  top,
  gm,
  editable,
  onPointerDown,
  onKeyDown,
}: {
  f: PlacedFlag;
  x: number;
  top: number;
  gm: boolean;
  editable: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>, f: Flag) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>, f: Flag) => void;
}) {
  const bg = f.kind === 'progress' ? 'var(--accent)' : f.color;
  const fg = f.kind === 'progress' ? 'var(--accent-contrast)' : barTextColor(f.color);
  const style: CSSProperties = {
    left: Math.round(x),
    top,
    height: FLAG_H,
    background: bg,
    color: fg,
    paddingInline: FLAG_PAD,
    ...(gm && f.secret ? { backgroundImage: GM_STRIPES } : {}),
  };
  const common = {
    'data-flag': f.kind,
    'data-flag-id': f.id,
    style,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onPointerDown(e, f),
  };
  const body = (
    <>
      {f.label}
      {gm && f.gm ? <GmBadge className="ml-1" /> : null}
    </>
  );
  const cls =
    'absolute z-[1] flex items-center rounded-[3px] text-[11px] leading-none font-semibold whitespace-nowrap shadow-1';
  if (!editable)
    return (
      <span {...common} className={cls}>
        {body}
      </span>
    );
  return (
    <button
      type="button"
      {...common}
      aria-label={S.markerDrag(f.label)}
      aria-keyshortcuts="ArrowLeft ArrowRight"
      className={cn(
        cls,
        'cursor-ew-resize touch-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
      )}
      onKeyDown={(e) => onKeyDown(e, f)}
    >
      {body}
    </button>
  );
}

/* ---------- 泳道名稱 ---------- */

const LaneLabel = memo(function LaneLabel({
  row,
  gm,
  name,
  onToggle,
}: {
  row: RowLayout;
  gm: boolean;
  name: string;
  onToggle: (id: string) => void;
}) {
  const color = row.lane?.color ?? 'var(--text-muted)';
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一列泳道的名稱與收合鈕，不是表單分組
    <div
      role="group"
      aria-label={S.laneLabel(name)}
      data-lane-row={row.key || '__main'}
      data-secret={(gm && row.secret) || undefined}
      className="absolute right-0 left-0 flex items-start gap-1 border-b border-border pt-[7px] pr-1.5"
      style={{
        top: row.y,
        height: row.height,
        paddingLeft: 6 + (row.depth ? 14 : 0),
        ...(gm && row.secret ? { backgroundImage: GM_STRIPES } : {}),
      }}
      title={name}
    >
      {row.hasChildren && row.lane ? (
        <button
          type="button"
          className="-ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          aria-expanded={!row.collapsed}
          aria-label={row.collapsed ? S.expand(name) : S.collapse(name)}
          onClick={() => row.lane && onToggle(row.lane.id)}
        >
          {row.collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      ) : null}
      <i
        aria-hidden
        className="mt-[3px] inline-block size-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="min-w-0 truncate text-xs font-semibold text-fg">{name}</span>
      {gm && row.lane?.gm ? <GmBadge className="mt-0.5 shrink-0" title={S.laneGm} /> : null}
    </div>
  );
});

export function GmBadge({ className, title }: { className?: string; title?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-3 items-center rounded-[3px] px-[3px] text-[8px] leading-none font-bold text-[#2b1f06]',
        className,
      )}
      style={{ background: GM_COLOR }}
      title={title ?? S.gmOnly}
      data-gm-badge
    >
      GM
    </span>
  );
}

/* ---------- 關聯線 ---------- */

const LinkLayer = memo(function LinkLayer({
  links,
  shift,
  width,
  height,
  gm,
  selected,
  dimOf,
  vdoc,
  draft,
}: {
  links: { k: VisibleLink; g: LinkGeometry }[];
  /** 排版的座標 → 時間軸的座標（平移時只改這個） */
  shift: number;
  width: number;
  height: number;
  gm: boolean;
  selected: ReadonlySet<string>;
  dimOf: (id: string) => boolean;
  vdoc: VisibleDoc;
  draft: { x1: number; y1: number; x2: number; y2: number } | null;
}) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-[2] overflow-visible"
      width={width}
      height={height}
      data-testid="link-layer"
    >
      <g transform={`translate(${Math.round(shift * 100) / 100} 0)`}>
        <LinkPaths links={links} gm={gm} selected={selected} dimOf={dimOf} vdoc={vdoc} />
      </g>
      {draft ? (
        <line
          x1={draft.x1}
          y1={draft.y1}
          x2={draft.x2}
          y2={draft.y2}
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="4 3"
          data-testid="link-draft"
        />
      ) : null}
    </svg>
  );
});

/** 線本身（平移時不重畫） */
const LinkPaths = memo(function LinkPaths({
  links,
  gm,
  selected,
  dimOf,
  vdoc,
}: {
  links: { k: VisibleLink; g: LinkGeometry }[];
  gm: boolean;
  selected: ReadonlySet<string>;
  dimOf: (id: string) => boolean;
  vdoc: VisibleDoc;
}) {
  const titles = useMemo(() => {
    const names = new Map(vdoc.events.map((e) => [e.id, e.title.trim() || S.untitled]));
    return (k: VisibleLink) => linkTitle(names, k);
  }, [vdoc.events]);
  return (
    <>
      {links.map(({ k, g }) => {
        const st = LINK_STYLES[k.kind];
        const color = gm && k.secret ? GM_COLOR : st.color;
        const hot = selected.has(k.from) || selected.has(k.to);
        const dim = dimOf(k.from) || dimOf(k.to);
        return (
          <g
            key={k.id}
            data-link-id={k.id}
            data-link-kind={k.kind}
            data-secret={(gm && k.secret) || undefined}
            opacity={dim ? 0.25 : 1}
          >
            <title>{titles(k)}</title>
            <path
              d={g.d}
              fill="none"
              stroke="transparent"
              strokeWidth={10}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            />
            <path
              d={g.d}
              fill="none"
              stroke={color}
              strokeWidth={st.width + (hot ? 0.9 : 0)}
              strokeDasharray={st.dash?.join(' ')}
              strokeLinecap="round"
            />
            {g.head ? (
              <polygon points={g.head.map(([x, y]) => `${x},${y}`).join(' ')} fill={color} />
            ) : null}
            {st.cross ? (
              <path
                d={`M${g.mid[0] - 4} ${g.mid[1] - 4}L${g.mid[0] + 4} ${g.mid[1] + 4}M${g.mid[0] + 4} ${g.mid[1] - 4}L${g.mid[0] - 4} ${g.mid[1] + 4}`}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
              />
            ) : null}
          </g>
        );
      })}
    </>
  );
});

/* ---------- 事件 ---------- */

interface ItemProps {
  it: ItemLayout;
  x1: number;
  x2: number;
  width: number;
  color: string;
  selected: boolean;
  dragging: boolean;
  gm: boolean;
  editable: boolean;
  dim: boolean;
  title: string;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>, id: string) => void;
}

const Item = memo(function Item({
  it,
  x1,
  x2,
  width,
  color,
  selected,
  dragging,
  gm,
  editable,
  dim,
  title,
  onKeyDown,
}: ItemProps) {
  const e = it.event;
  const note = gm && !!e.gmNote.trim();
  const stripes: CSSProperties = gm && e.secret ? { backgroundImage: GM_STRIPES } : {};
  const common = {
    type: 'button' as const,
    title,
    'aria-label': title.split('\n').slice(0, 3).join('，'),
    'aria-pressed': selected,
    'data-event-id': it.id,
    'data-kind': e.kind,
    'data-level': it.level,
    'data-row': it.row,
    'data-selected': selected || undefined,
    'data-secret': (gm && e.secret) || undefined,
    'data-dim': dim || undefined,
    onKeyDown: (ev: ReactKeyboardEvent<HTMLElement>) => onKeyDown(ev, it.id),
    /* 鍵盤（Tab）移到事件上＝選取 */
    onFocus: () => selectOnFocus(it.id),
  };
  const ring = selected ? 'ring-2 ring-focus' : 'focus-visible:ring-2 focus-visible:ring-focus';
  const fade = dim && !selected ? 'opacity-25' : undefined;
  if (e.kind === 'point') {
    return (
      <button
        {...common}
        className={cn(
          'absolute z-[3] flex cursor-pointer items-center rounded-[4px] pr-1 outline-none',
          ring,
          fade,
          dragging && 'z-[5] opacity-90 shadow-2',
        )}
        style={{ left: x1 - POINT_R - 2, top: it.y, height: ITEM_H, ...stripes }}
      >
        <span
          aria-hidden
          className="ml-0.5 size-2.5 shrink-0 rounded-full border-[1.5px] border-bg"
          style={{ background: color, boxShadow: `0 0 0 1px ${color}` }}
        />
        <span
          className="ml-[5px] text-[12px] font-medium whitespace-nowrap text-fg"
          data-item-label
        >
          {it.label}
        </span>
        {gm && e.gm ? <GmBadge className="absolute -top-[7px] left-0" /> : null}
        {note ? <NoteMark /> : null}
      </button>
    );
  }
  /*
   * 期間：只畫看得到的部分（切到的那一邊沒有把手）。色條外的標題畫在色條真正的結束之後
   * （和堆疊用的範圍相同；左邊切到時不跟著看得到的部分移動），色條整個在左邊外面時只剩標題。
   */
  const realW = Math.max(MIN_BAR, x2 - x1);
  const barL = Math.max(x1, -6);
  const barR = Math.min(x1 + realW, width + 6);
  const shown = barR > barL;
  const left = shown ? barL : x1 + realW;
  const w = shown ? barR - barL : 0;
  const cutL = x1 < -6;
  const cutR = x1 + realW > width + 6;
  const label = it.inside ? ellipsize(it.label, w - INSIDE_PAD * 2, itemMeasure) : it.label;
  /* 色條外的標題：從按鈕左邊算的位置 */
  const outside = x1 + realW + LABEL_GAP - left;
  return (
    <button
      {...common}
      className={cn(
        'absolute z-[3] cursor-pointer rounded-[4px] outline-none',
        ring,
        fade,
        dragging && 'z-[5] opacity-90 shadow-2',
      )}
      style={{ left, top: it.y, width: w, height: ITEM_H, background: color, ...stripes }}
    >
      <span
        className={cn(
          'absolute top-0 flex h-full items-center text-[12px] font-medium whitespace-nowrap',
          it.inside ? 'pointer-events-none' : 'text-fg',
        )}
        style={it.inside ? { left: INSIDE_PAD, color: barTextColor(color) } : { left: outside }}
        data-item-label
      >
        {label}
      </span>
      {editable && !cutL ? (
        <span
          data-handle="start"
          aria-hidden
          className="absolute top-0 -left-0.5 h-full w-[6px] cursor-ew-resize"
        />
      ) : null}
      {editable && !cutR ? (
        <span
          data-handle="end"
          aria-hidden
          className="absolute top-0 -right-0.5 h-full w-[6px] cursor-ew-resize"
        />
      ) : null}
      {gm && e.gm ? <GmBadge className="absolute -top-[7px] left-0" /> : null}
      {note ? (
        <span
          aria-hidden
          className="absolute top-0 size-0"
          style={{ left: it.inside ? w : outside + it.labelW + 9 }}
        >
          <NoteMark />
        </span>
      ) : null}
    </button>
  );
});

function NoteMark() {
  return (
    <span
      aria-hidden
      data-note-mark
      className="absolute top-0 right-0 size-0 border-t-[8px] border-l-[8px] border-l-transparent"
      style={{ borderTopColor: GM_COLOR }}
    />
  );
}

function BackgroundBand({
  bg,
  color,
  left,
  right,
  cutLeft,
  cutRight,
  top,
  height,
  labelTop,
  selected,
  gm,
  editable,
  dim,
  title,
  dragging,
  onKeyDown,
}: {
  bg: BackgroundLayout;
  color: string;
  left: number;
  right: number;
  cutLeft: boolean;
  cutRight: boolean;
  top: number;
  height: number;
  /** 左上角的標題離區段頂端多遠（和同一列的事件一起堆疊的位置） */
  labelTop: number;
  selected: boolean;
  gm: boolean;
  editable: boolean;
  dim: boolean;
  title: string;
  dragging: boolean;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>, id: string) => void;
}) {
  const e = bg.event;
  const w = Math.max(2, right - left);
  /* 區段本身不擋點選（和 vis-timeline 一樣，點、雙擊空白處照常）；左上角的標題是按鈕（選取、拖曳移動），兩端拖曳改長短 */
  return (
    <div
      data-event-id={e.id}
      data-kind="background"
      data-selected={selected || undefined}
      data-secret={(gm && e.secret) || undefined}
      data-dim={dim || undefined}
      className={cn(
        'pointer-events-none absolute z-[1]',
        selected && 'ring-2 ring-focus ring-inset',
        dragging && 'opacity-80',
        dim && !selected && 'opacity-25',
      )}
      style={{ left, top, width: w, height }}
    >
      <span aria-hidden className="absolute inset-0" style={{ background: color, opacity: 0.18 }} />
      {gm && e.secret ? (
        <span aria-hidden className="absolute inset-0" style={{ backgroundImage: GM_STRIPES }} />
      ) : null}
      <button
        type="button"
        title={title}
        aria-label={title.split('\n').slice(0, 3).join('，')}
        aria-pressed={selected}
        data-band-label
        onKeyDown={(ev) => onKeyDown(ev, e.id)}
        onFocus={() => selectOnFocus(e.id)}
        className="pointer-events-auto absolute left-1 flex max-w-[calc(100%-0.5rem)] cursor-pointer items-center gap-1 rounded-sm px-0.5 text-[11px] font-semibold text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
        style={{ top: labelTop }}
      >
        <span className="truncate" data-item-label>
          {e.title.trim() || S.untitled}
        </span>
        {gm && e.gm ? <GmBadge className="shrink-0" /> : null}
      </button>
      {editable && !cutLeft ? (
        <span
          data-handle="start"
          aria-hidden
          className="pointer-events-auto absolute top-0 left-0 h-full w-[6px] cursor-ew-resize"
        />
      ) : null}
      {editable && !cutRight ? (
        <span
          data-handle="end"
          aria-hidden
          className="pointer-events-auto absolute top-0 right-0 h-full w-[6px] cursor-ew-resize"
        />
      ) : null}
    </div>
  );
}

function DragTip({
  tip,
  root,
}: {
  tip: { x: number; y: number; text: string };
  root: HTMLElement | null;
}) {
  const r = root?.getBoundingClientRect();
  if (!r) return null;
  const x = Math.min(r.width - 170, Math.max(8, tip.x - r.left + 14));
  const y = Math.max(8, tip.y - r.top - 34);
  return (
    <div
      role="status"
      data-testid="drag-tip"
      className="pointer-events-none absolute z-40 max-w-[18rem] truncate rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-2"
      style={{ left: Math.max(8, x), top: y }}
    >
      {tip.text}
    </div>
  );
}
