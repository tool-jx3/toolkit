/**
 * 畫布（規格 1.3、1.5、1.7、1.8；第二批 F80～F87）：卡片是 DOM、連線是 SVG；整張以 transform 平移縮放。
 * 指標：空白處拖曳＝平移；卡片上拖曳＝換順序／調間距／只移動父母（同一列）或換父母（放到別人的卡片上）；
 * 「出」字小卡拖曳＝在生父的孩子之間換順序、調間距，或放到別人卡片上換生家；
 * 點一下選取、450 ms 內兩下＝就地編輯；滾輪縮放、觸控板平移、兩指捏合。
 * PL 檢視（F86）：畫 PL 版的人物，只能選取（給「選取的人以下」匯出用），不能拖曳、就地編輯。
 * 框選範圍匯出（F83）：畫布上蓋一層，拖一個框，碰到的卡片都算。
 */
import { produce } from 'immer';
import { Minus, Plus, Scan } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import { useAssetBitmaps } from '@/core/assets';
import { Button, cn, IconButton } from '@/ui';
import {
  cancelInline,
  canvasApi,
  commitInline,
  doReparent,
  doSetBirthParent,
  exportApi,
  layoutNow,
  notify,
  startInline,
  undo,
  viewOptions,
} from '../actions';
import {
  edgePath,
  guides,
  type LayoutNode,
  type LayoutOptions,
  layoutTree,
  linkPaths,
  rowLineY,
  type TreeLayout,
} from '../model/layout';
import {
  applyGap,
  applyMove,
  applyStubGap,
  applyStubMove,
  avatarIds,
  checkBirthParent,
  checkReparent,
  hasGmInfo,
  moveParentOnly,
  usedCategories,
} from '../model/ops';
import { chipText, initialOf, memberText, stubText } from '../model/present';
import { descendants, hostOf, kidsOf, linkedBy } from '../model/tree';
import {
  type Category,
  type InlineField,
  isMember,
  type People,
  type Person,
} from '../model/types';
import {
  assets,
  boardNow,
  collapsedOf,
  type DragView,
  isPlView,
  prefsNow,
  select,
  shownPeople,
  toggleFold,
  updateBoard,
  useBoard,
  usePrefs,
  useUi,
} from '../store';
import { S } from '../strings';
import {
  type AvatarView,
  type GmMark,
  GmTag,
  type InlineState,
  MemberCard,
  SpouseCard,
  StubCard,
} from './Card';
import { EmptyState } from './EmptyState';
import {
  BUTTON_STEP,
  centerView,
  clampZoom,
  fitView,
  isMouseWheel,
  isOffscreen,
  toCanvas,
  type View,
  WHEEL_STEP,
  zoomAt,
} from './view';

/** 目前的縮放（工具列的百分比用；畫布本身不靠 React 重畫） */
export const useZoom = create<{ s: number }>(() => ({ s: 1 }));

const EMPTY: readonly string[] = [];
const DOUBLE_TAP_MS = 450;
const DRAG_THRESHOLD = 5;
const EDGE = 36;
const EDGE_STEP = 10;

/**
 * 工具自己的顏色（跟著主題：和 --text 混色，深色主題時變亮、淺色時變暗）：
 * 入＝藍、出＝紅（--danger）、婚姻連線＝紫、歿＝深灰、失蹤＝琥珀（--warning）。
 */
const TOOL_COLORS = {
  '--ft-in': 'color-mix(in srgb, #3b82f6 72%, var(--text))',
  '--ft-in-bg': 'color-mix(in srgb, #3b82f6 12%, var(--surface))',
  '--ft-out': 'var(--danger)',
  '--ft-out-bg': 'color-mix(in srgb, var(--danger) 8%, var(--surface))',
  '--ft-link': 'color-mix(in srgb, #8b5cf6 78%, var(--text))',
  '--ft-dead': 'color-mix(in srgb, var(--text) 72%, var(--surface))',
  '--ft-dead-fg': 'var(--surface)',
  '--ft-missing': 'var(--warning)',
  '--ft-missing-bg': 'var(--warning-soft)',
} as CSSProperties;

/** 框選的卡片鍵（成員 m:id、「出」字小卡 s:id；匯出也用同一種鍵） */
export const nodeKey = (n: Pick<LayoutNode, 'id' | 'stub'>) => `${n.stub ? 's' : 'm'}:${n.id}`;

interface Pointer {
  kind: 'card' | 'stub' | 'pan';
  id: number;
  x: number;
  y: number;
  moved: boolean;
  pid?: string;
  hostId?: string;
  shift?: boolean;
  field?: InlineField | null;
  grab?: { x: number; y: number };
  tx?: number;
  ty?: number;
}

interface Session {
  id: string;
  /** 拖的是「出」字小卡 */
  stub: boolean;
  orig: People;
  opts: LayoutOptions;
  parentOnly: boolean;
  dragMode: 'order' | 'gap';
  c0: number;
  row: number;
  desc: Set<string>;
  moving: string[];
  grab: { x: number; y: number };
  cx: number;
  cy: number;
  alt: boolean;
  mode: 'slide' | 'parent' | 'bad' | null;
  target: string | null;
  people: People;
  label: string;
}

function catOf(
  cats: readonly Category[],
  colors: boolean,
  id: string | undefined,
): Category | null {
  if (!colors || !id) return null;
  return cats.find((c) => c.id === id) ?? null;
}

export function TreeCanvas() {
  const board = useBoard();
  const prefs = usePrefs((s) => s.data);
  const selectedId = useUi((s) => s.selectedId);
  const editing = useUi((s) => s.editing);
  const drag = useUi((s) => s.drag);
  const area = useUi((s) => s.area);
  const pl = prefs.viewMode === 'pl';
  const collapsedList = collapsedOf(prefs, board.id);
  const collapsed = collapsedList.length ? collapsedList : EMPTY;
  const shown = useMemo(
    () => shownPeople(board.people, prefs.viewMode),
    [board.people, prefs.viewMode],
  );
  const people = drag?.people ?? shown;
  const opts = useMemo<LayoutOptions>(
    () => viewOptions(prefs, board, shown),
    [prefs, board, shown],
  );
  const dims = opts.dims;
  const L = useMemo(() => layoutTree(people, opts), [people, opts]);
  const G = useMemo(() => guides(L), [L]);
  const lb = useMemo(() => linkedBy(people), [people]);
  const links = useMemo(
    () => (prefs.links && prefs.spouses ? linkPaths(people, L, true) : []),
    [prefs.links, prefs.spouses, people, L],
  );
  const look = prefs.cardMode;
  const avatarList = useMemo(() => (dims.AV ? avatarIds(people) : []), [dims.AV, people]);
  const { bitmaps } = useAssetBitmaps(assets, avatarList);
  const avatarOf = (p: Person): AvatarView | null =>
    dims.AV
      ? {
          bitmap: p.avatar ? (bitmaps.get(p.avatar) ?? null) : null,
          pos: p.avatarPos,
          initial: initialOf(p.name),
        }
      : null;
  const chipAvatar = (p: Person): AvatarView | null =>
    dims.AV && p.avatar
      ? { bitmap: bitmaps.get(p.avatar) ?? null, pos: p.avatarPos, initial: initialOf(p.name) }
      : null;
  const gmOf = (p: Person): GmMark | null =>
    pl ? null : p.gm || hasGmInfo(p) ? { only: !!p.gm, info: hasGmInfo(p) } : null;
  /* 畫面上的 GM 專用：成員連同子孫都畫斜線（PL 版裡整個不見的範圍） */
  const gmScope = useMemo(() => {
    const out = new Set<string>();
    if (pl) return out;
    for (const p of Object.values(people))
      if (p.gm && isMember(p)) {
        out.add(p.id);
        for (const d of descendants(people, p.id)) out.add(d);
      }
    return out;
  }, [people, pl]);

  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ s: 1, tx: 60, ty: 40 });
  const animTimer = useRef(0);

  const applyView = useCallback((v: View, animate = false) => {
    view.current = v;
    const el = canvas.current;
    if (el) {
      if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.style.transition = 'transform 0.25s ease';
        window.clearTimeout(animTimer.current);
        animTimer.current = window.setTimeout(() => {
          if (canvas.current) canvas.current.style.transition = '';
        }, 300);
      }
      el.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
      el.dataset.scale = String(v.s);
    }
    if (useZoom.getState().s !== v.s) useZoom.setState({ s: v.s });
  }, []);

  /* ---------- 畫面的操作（面板、搜尋、快捷鍵也用） ---------- */
  useEffect(() => {
    const size = () => {
      const el = viewport.current;
      return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
    };
    const api = {
      fit: (animate = true) => {
        const lay = layoutNow();
        if (!lay.nodes.length) return;
        const g = guides(lay);
        let x0 = g.labelX;
        let x1 = g.labelX + 56;
        let y1 = 0;
        for (const n of lay.nodes) {
          x0 = Math.min(x0, n.x);
          x1 = Math.max(x1, n.x + n.width);
          y1 = Math.max(y1, n.y + lay.dims.H);
        }
        const { w, h } = size();
        applyView(fitView({ x0, y0: 0, x1, y1 }, w, h), animate);
      },
      centerOn: (id: string) => {
        const lay = layoutNow();
        const n = lay.byId.get(id);
        if (!n) return;
        const { w, h } = size();
        applyView(centerView(view.current, n.x + lay.dims.W / 2, n.y + lay.dims.H / 2, w, h), true);
      },
      ensureVisible: (id: string) => {
        const lay = layoutNow();
        const n = lay.byId.get(id);
        if (!n) return;
        const { w, h } = size();
        const D = lay.dims;
        if (
          isOffscreen(
            view.current,
            { x0: n.x, y0: n.y, x1: n.x + D.W + D.SPW, y1: n.y + D.H },
            w,
            h,
          )
        )
          api.centerOn(id);
      },
      zoomBy: (f: number) => {
        const { w, h } = size();
        applyView(zoomAt(view.current, f, w / 2, h / 2));
      },
    };
    canvasApi.current = api;
    return () => {
      if (canvasApi.current === api) canvasApi.current = null;
    };
  }, [applyView]);

  /* 開頁、換圖板、換父親的位置、換 GM／PL 檢視時全覽 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在圖板、父親的位置、檢視改變時
  useEffect(() => {
    const t = window.setTimeout(() => canvasApi.current?.fit(false), 40);
    return () => window.clearTimeout(t);
  }, [board.id, board.align, prefs.viewMode]);

  /* 名字＋讀音一行放不下時一起縮小（最小 0.6 倍）；簡易卡片每一行各自縮小（F18） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 排版或卡片樣子改變時重算
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const fitRows = () => {
      const rows = [...root.querySelectorAll<HTMLElement>('.ft-row1, .ft-cl')];
      for (const r of rows) r.style.removeProperty('--k');
      const fix: [HTMLElement, number][] = [];
      for (const r of rows) {
        if (r.classList.contains('ft-row1')) {
          const nm = r.querySelector<HTMLElement>('.ft-nm');
          const hj = r.querySelector<HTMLElement>('.ft-hj');
          if (!nm) continue;
          const tw = nm.scrollWidth + (hj ? hj.scrollWidth : 0);
          const used = nm.offsetWidth + (hj ? hj.offsetWidth : 0);
          const avail = r.clientWidth - (r.scrollWidth - used);
          if (tw > avail + 0.5 && tw > 0) fix.push([r, Math.max(0.6, (avail - 1) / tw)]);
        } else {
          const t = r.scrollWidth;
          const a = r.clientWidth;
          if (t > a + 0.5) fix.push([r, Math.max(0.6, (a - 1) / t)]);
        }
      }
      for (const [r, k] of fix) r.style.setProperty('--k', k.toFixed(3));
    };
    fitRows();
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) fitRows();
    });
    return () => {
      alive = false;
    };
  }, [L, look]);

  /* ---------- 指標 ---------- */
  const pt = useRef<Pointer | null>(null);
  const session = useRef<Session | null>(null);
  const raf = useRef(0);
  const lastTap = useRef<{ id: string | null; t: number }>({ id: null, t: 0 });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; s0: number; cx: number; cy: number } | null>(null);

  const rect = () => viewport.current?.getBoundingClientRect() ?? new DOMRect();
  const clientToCanvas = (cx: number, cy: number) => {
    const r = rect();
    return toCanvas(view.current, cx - r.left, cy - r.top);
  };

  const publish = (s: Session) => {
    const r = rect();
    const v = view.current;
    const dv: DragView = {
      id: s.id,
      stub: s.stub,
      people: s.people,
      moving: s.moving,
      target: s.target ? { pid: s.target, ok: s.mode === 'parent' } : null,
      label: s.label,
      ghost: { x: s.cx - r.left - s.grab.x * v.s, y: s.cy - r.top - s.grab.y * v.s },
    };
    useUi.setState({ drag: dv });
  };

  const dragUpdate = () => {
    raf.current = 0;
    const s = session.current;
    if (!s) return;
    const c = clientToCanvas(s.cx, s.cy);
    const { H, VG } = s.opts.dims;
    const inRow = c.y >= s.row - VG / 2 && c.y <= s.row + H + VG / 2;
    s.target = null;
    if (inRow && !s.alt) {
      const dx = c.x - s.c0;
      if (s.parentOnly) {
        s.people = produce(s.orig, (d) => moveParentOnly(d as People, s.id, dx, s.opts));
        s.label = S.dragParentOnly;
      } else if (s.dragMode === 'gap') {
        let v = 0;
        s.people = produce(s.orig, (d) => {
          v = s.stub ? applyStubGap(d as People, s.id, dx) : applyGap(d as People, s.id, dx);
        });
        s.label = v === 0 && dx < 0 ? S.dragGapZero : S.dragGapValue(v);
      } else if (s.stub) {
        s.people = produce(s.orig, (d) => applyStubMove(d as People, s.id, c.x - s.grab.x, s.opts));
        s.label = S.dragStubOrder;
      } else {
        s.people = produce(s.orig, (d) => applyMove(d as People, s.id, c.x - s.grab.x, s.opts));
        s.label = s.desc.size ? S.dragWithKids(s.desc.size) : S.dragReorder;
      }
      s.mode = 'slide';
      publish(s);
      return;
    }
    s.people = s.orig;
    s.mode = null;
    const el = document.elementFromPoint(s.cx, s.cy)?.closest<HTMLElement>('[data-pid]');
    const pid = el?.dataset.pid;
    if (pid) {
      const check = s.stub ? checkBirthParent(s.orig, s.id, pid) : checkReparent(s.orig, s.id, pid);
      if (check === 'descendant' || check === 'adoptive') {
        s.mode = 'bad';
        s.target = pid;
        s.label = check === 'adoptive' ? S.dragNoAdoptive : S.dragNoDescendant;
      } else if (check === 'ok') {
        const host = hostOf(s.orig, s.orig[pid]);
        s.mode = 'parent';
        s.target = pid;
        s.label = s.stub
          ? S.dragBirthOn(host?.name || S.unnamed)
          : S.dragDropOn(host?.name || S.unnamed);
      }
    }
    if (!s.mode) s.label = inRow ? S.dragReleaseAlt : S.dragHelp;
    publish(s);
  };

  const queueDrag = () => {
    if (!raf.current) raf.current = requestAnimationFrame(dragUpdate);
  };

  const startDrag = (p: Pointer) => {
    const b = boardNow();
    const opts0 = layoutOptionsFrom();
    const lay = layoutTree(b.people, opts0);
    if (p.kind === 'stub') {
      const id = p.pid ?? '';
      const node = lay.stubs.get(id);
      if (!node) return;
      session.current = {
        id,
        stub: true,
        orig: b.people,
        opts: opts0,
        parentOnly: false,
        dragMode: prefsNow().dragMode,
        c0: clientToCanvas(p.x, p.y).x,
        row: node.y,
        desc: descendants(b.people, id),
        moving: [`s:${id}`],
        grab: p.grab ?? { x: 0, y: 0 },
        cx: p.x,
        cy: p.y,
        alt: false,
        mode: null,
        target: null,
        people: b.people,
        label: '',
      };
      useUi.setState({ editing: null });
      return;
    }
    const host = b.people[p.hostId ?? ''];
    if (!isMember(host)) return;
    const node = lay.byId.get(host.id);
    const parentOnly =
      b.align === 'manual' && !p.shift && kidsOf(b.people, host.id, opts0).length > 0;
    const desc = descendants(b.people, host.id);
    session.current = {
      id: host.id,
      stub: false,
      orig: b.people,
      opts: opts0,
      parentOnly,
      dragMode: prefsNow().dragMode,
      c0: clientToCanvas(p.x, p.y).x,
      row: node?.y ?? 0,
      desc,
      moving: (parentOnly ? [host.id] : [host.id, ...desc]).map((id) => `m:${id}`),
      grab: p.grab ?? { x: 0, y: 0 },
      cx: p.x,
      cy: p.y,
      alt: false,
      mode: null,
      target: null,
      people: b.people,
      label: '',
    };
    useUi.setState({ editing: null });
  };

  const endPointer = (cancel: boolean) => {
    const t = pt.current;
    if (!t) return;
    pt.current = null;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    const s = session.current;
    if (s && !cancel) dragUpdate();
    session.current = null;
    viewport.current?.classList.remove('cursor-grabbing');
    if (useUi.getState().drag) useUi.setState({ drag: null });
    if (t.moved) {
      if (t.kind === 'pan' || !s || cancel) return;
      if (s.mode === 'parent' && s.target) {
        if (s.stub) doSetBirthParent(s.id, s.target);
        else doReparent(s.id, s.target);
        return;
      }
      if (s.mode === 'bad') {
        notify({ title: s.label, tone: 'danger', replace: true });
        return;
      }
      if (s.mode === 'slide' && s.people !== s.orig) {
        const next = s.people;
        updateBoard((b) => {
          b.people = next as typeof b.people;
        });
        notify({
          title: s.parentOnly ? S.parentMoved : s.dragMode === 'gap' ? S.gapChanged : S.reordered,
          tone: 'success',
          action: { label: S.undo, onClick: undo },
        });
      }
      return;
    }
    if (cancel) return;
    if (t.kind === 'pan') {
      select(null);
      return;
    }
    if (t.kind === 'stub' && t.pid) {
      /* 「出」字小卡：點一下移到本人 */
      select(t.pid);
      canvasApi.current?.centerOn(t.pid);
      return;
    }
    if (t.kind === 'card' && t.pid) {
      const now = Date.now();
      if (!isPlView() && lastTap.current.id === t.pid && now - lastTap.current.t < DOUBLE_TAP_MS) {
        lastTap.current = { id: null, t: 0 };
        startInline(t.pid, t.field ?? 'name');
        return;
      }
      lastTap.current = { id: t.pid, t: now };
      select(t.pid);
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pinch.current) return;
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as Element;
    if (target.closest('input,textarea,select,button,[data-overlay]')) return;
    /* 面板上打到一半的文字欄先確定（復原的一步在離開時記下） */
    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      active !== document.body &&
      (active.matches('input,textarea,select') || !viewport.current?.contains(active))
    )
      active.blur();
    const card = e.button === 0 ? target.closest<HTMLElement>('[data-pid]') : null;
    const stub = e.button === 0 && !card ? target.closest<HTMLElement>('[data-stub]') : null;
    const p: Pointer = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    if (card) {
      const people = shownPeople(boardNow().people, prefsNow().viewMode);
      const person = people[card.dataset.pid ?? ''];
      const host = hostOf(people, person);
      if (!person || !host) return;
      const node = layoutNow().byId.get(host.id);
      const c = clientToCanvas(e.clientX, e.clientY);
      p.kind = 'card';
      p.pid = person.id;
      p.hostId = host.id;
      p.shift = e.shiftKey;
      const f = target.closest<HTMLElement>('[data-f]')?.dataset.f as InlineField | undefined;
      p.field = f ?? (target.closest('[data-yr]') ? 'birth' : null);
      p.grab = { x: c.x - (node?.x ?? 0), y: c.y - (node?.y ?? 0) };
    } else if (stub) {
      const id = stub.dataset.stub ?? '';
      const node = layoutNow().stubs.get(id);
      if (!node) return;
      const c = clientToCanvas(e.clientX, e.clientY);
      p.kind = 'stub';
      p.pid = id;
      p.grab = { x: c.x - node.x, y: c.y - node.y };
    } else {
      p.tx = view.current.tx;
      p.ty = view.current.ty;
    }
    pt.current = p;
    e.preventDefault();
  };

  const edgeScroll = (cx: number, cy: number) => {
    const r = rect();
    let dx = 0;
    let dy = 0;
    if (cx - r.left < EDGE) dx = EDGE_STEP;
    else if (r.right - cx < EDGE) dx = -EDGE_STEP;
    if (cy - r.top < EDGE) dy = EDGE_STEP;
    else if (r.bottom - cy < EDGE) dy = -EDGE_STEP;
    if (dx || dy) {
      const v = view.current;
      applyView({ s: v.s, tx: v.tx + dx, ty: v.ty + dy });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pt.current;
    if (!p || p.id !== e.pointerId || pinch.current) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      /* PL 檢視：卡片上拖曳也是平移（不能改資料） */
      if (p.kind !== 'pan' && isPlView()) {
        p.kind = 'pan';
        p.tx = view.current.tx;
        p.ty = view.current.ty;
      }
      p.moved = true;
      try {
        viewport.current?.setPointerCapture(e.pointerId);
      } catch {
        /* 已經放開 */
      }
      viewport.current?.classList.add('cursor-grabbing');
      if (p.kind !== 'pan') startDrag(p);
    }
    if (p.kind === 'pan') {
      applyView({ s: view.current.s, tx: (p.tx ?? 0) + dx, ty: (p.ty ?? 0) + dy });
      return;
    }
    const s = session.current;
    if (!s) return;
    s.cx = e.clientX;
    s.cy = e.clientY;
    s.alt = e.altKey;
    edgeScroll(e.clientX, e.clientY);
    queueDrag();
  };

  /* 拖曳中的 Alt、Esc */
  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => {
      const s = session.current;
      if (!s) return;
      if (e.key === 'Alt') {
        e.preventDefault();
        s.alt = true;
        queueDrag();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        endPointer(true);
      }
    };
    const up = (e: globalThis.KeyboardEvent) => {
      const s = session.current;
      if (s && e.key === 'Alt') {
        s.alt = false;
        queueDrag();
      }
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
    };
  });

  /* 觸控兩指捏合（攔在最前面，開始時取消拖曳與平移） */
  const pinchMid = () => {
    const [a, b] = [...touches.current.values()];
    const r = rect();
    return {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2 - r.left,
      my: (a.y + b.y) / 2 - r.top,
    };
  };
  const onPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    if (e.isPrimary) {
      touches.current.clear();
      pinch.current = null;
    }
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size < 2) return;
    e.stopPropagation();
    e.preventDefault();
    if (pinch.current) return;
    if (pt.current) endPointer(true);
    const m = pinchMid();
    const v = view.current;
    pinch.current = { d0: m.d, s0: v.s, cx: (m.mx - v.tx) / v.s, cy: (m.my - v.ty) / v.s };
  };
  const onPointerMoveCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (!pz) return;
    e.stopPropagation();
    if (touches.current.size < 2) return;
    const m = pinchMid();
    const s = clampZoom((pz.s0 * m.d) / pz.d0);
    applyView({ s, tx: m.mx - pz.cx * s, ty: m.my - pz.cy * s });
  };
  const onPointerEndCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.delete(e.pointerId);
    if (pinch.current) {
      e.stopPropagation();
      if (!touches.current.size) pinch.current = null;
    }
  };

  /* 滾輪：滑鼠滾輪與 Ctrl＋滾輪縮放、觸控板平移 */
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('[data-overlay]')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || isMouseWheel(e))
        applyView(
          zoomAt(
            view.current,
            e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP,
            e.clientX - r.left,
            e.clientY - r.top,
          ),
        );
      else {
        const v = view.current;
        applyView({ s: v.s, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyView]);

  /* 卡片上的鍵盤：Enter 選取、F2 就地編輯；「出」字小卡：Enter 移到本人 */
  const onCardKey = useCallback((e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      select(id);
    } else if (e.key === 'F2' && !isPlView()) {
      e.preventDefault();
      startInline(id, 'name');
    }
  }, []);
  const onStubKey = useCallback((e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.target !== e.currentTarget || e.key !== 'Enter') return;
    e.preventDefault();
    select(id);
    canvasApi.current?.centerOn(id);
  }, []);

  /* 就地編輯的狀態（同一次編輯同一個物件，卡片的 memo 才有用） */
  const inline = useMemo<InlineState | null>(() => {
    if (!editing) return null;
    const { id, field } = editing;
    return {
      field,
      onCommit: (v, move, byKey) => {
        commitInline(id, field, v, move);
        if (byKey) focusCard(id);
      },
      onCancel: () => {
        cancelInline();
        focusCard(id);
      },
    };
  }, [editing]);

  /* 畫面的初始位置 */
  useLayoutEffect(() => {
    applyView(view.current);
  }, [applyView]);

  /* 框選中碰到的卡片（畫面上加外框） */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!area.picking) setPicked(new Set());
  }, [area.picking]);

  const legend = prefs.colors ? usedCategories({ ...board, people }) : [];
  const moving = drag ? new Set(drag.moving) : null;
  const ghostNode = drag ? (drag.stub ? L.stubs.get(drag.id) : L.byId.get(drag.id)) : undefined;
  const dropFor = (pid: string) =>
    drag?.target?.pid === pid ? (drag.target.ok ? 'ok' : 'bad') : null;

  return (
    <div
      ref={viewport}
      role="application"
      aria-label={S.canvasLabel}
      data-testid="tree-canvas"
      data-view={prefs.viewMode}
      className="relative h-[60dvh] min-h-80 w-full min-w-0 cursor-grab touch-none overflow-hidden rounded-lg border border-border bg-bg select-none lg:h-[calc(100dvh-13rem)] lg:min-h-[28rem]"
      style={{
        backgroundImage: 'radial-gradient(var(--border) 1.2px, transparent 1.2px)',
        backgroundSize: '20px 20px',
        ...TOOL_COLORS,
      }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerEndCapture}
      onPointerCancelCapture={onPointerEndCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => {
        if (pt.current?.id === e.pointerId) endPointer(false);
      }}
      onPointerCancel={(e) => {
        if (pt.current?.id === e.pointerId) endPointer(true);
      }}
    >
      <div
        ref={canvas}
        data-testid="tree-content"
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: 'translate(60px, 40px) scale(1)' }}
      >
        {G.rows.map((r) => (
          <div
            key={`g${r.gen}`}
            data-gen={r.gen}
            className="absolute rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap text-muted tabular-nums"
            style={{ left: G.labelX, top: r.y + dims.H / 2 - 10 }}
          >
            {S.genLabel(r.gen)}
          </div>
        ))}
        {G.rows.slice(0, -1).map((r) => (
          <div
            key={`l${r.gen}`}
            className="absolute h-0 border-t border-dashed border-border"
            style={{ left: G.lineX, top: rowLineY(r, dims), width: G.lineWidth }}
          />
        ))}
        <svg
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width="1"
          height="1"
          aria-hidden
          data-testid="tree-lines"
        >
          {L.nodes.map((n) =>
            n.parent ? (
              <path
                key={nodeKey(n)}
                data-edge={n.stub ? 'out' : 'kin'}
                d={edgePath(n, dims) ?? ''}
                fill="none"
                stroke={
                  n.stub
                    ? 'var(--ft-out)'
                    : 'color-mix(in srgb, var(--text-muted) 70%, transparent)'
                }
                strokeDasharray={n.stub ? '4 3' : undefined}
                strokeWidth={1.3}
              />
            ) : null,
          )}
          {links.map((l) => (
            <path
              key={l.key}
              data-edge="link"
              d={l.d}
              fill="none"
              stroke="var(--ft-link)"
              strokeDasharray="5 4"
              strokeWidth={1.6}
            />
          ))}
        </svg>
        {L.nodes.map((n) => {
          const p = n.person;
          const key = nodeKey(n);
          if (n.stub) {
            const t = stubText(people, p);
            return (
              <div
                key={key}
                data-stub-host={p.id}
                className="absolute flex"
                style={{ left: n.x, top: n.y }}
              >
                <StubCard
                  p={p}
                  name={t.name}
                  meta={t.meta}
                  label={S.stubLabel(t.name, t.to)}
                  dims={dims}
                  look={look}
                  moving={!!moving?.has(key)}
                  picked={picked.has(key)}
                  avatar={avatarOf(p)}
                  onKey={onStubKey}
                />
              </div>
            );
          }
          const folded = collapsed.includes(p.id);
          const gmScoped = gmScope.has(p.id);
          const mark = gmOf(p);
          return (
            <div
              key={key}
              data-host={p.id}
              className="absolute flex"
              style={{ left: n.x, top: n.y, gap: dims.GAP }}
            >
              <MemberCard
                p={p}
                gen={n.gen}
                dims={dims}
                look={look}
                memo={prefs.memo}
                text={memberText(people, p, lb, prefs.daughterName)}
                cat={catOf(board.cats, prefs.colors, p.cat)}
                selected={selectedId === p.id}
                inline={editing?.id === p.id ? inline : null}
                drop={dropFor(p.id)}
                moving={!!moving?.has(key)}
                picked={picked.has(key)}
                avatar={avatarOf(p)}
                gm={gmScoped ? { only: true, info: !!mark?.info } : mark}
                readOnly={pl}
                onKey={onCardKey}
              />
              {p.gm && !pl ? <GmTag left={8} /> : null}
              {n.chips.map((s) => {
                const c = chipText(people, p, s);
                const sm = gmOf(s);
                return (
                  <SpouseCard
                    key={s.id}
                    s={s}
                    src={c.src}
                    rel={c.rel}
                    linked={c.linked}
                    hostName={p.name || S.unnamed}
                    dims={dims}
                    look={look}
                    cat={catOf(board.cats, prefs.colors, s.cat)}
                    selected={selectedId === s.id}
                    inline={editing?.id === s.id ? inline : null}
                    drop={dropFor(s.id)}
                    avatar={chipAvatar(c.src)}
                    gm={gmScoped ? { only: true, info: !!sm?.info } : sm}
                    readOnly={pl}
                    onKey={onCardKey}
                  />
                );
              })}
              {n.chips.map((s, i) =>
                s.gm && !pl ? (
                  <GmTag
                    key={`gm${s.id}`}
                    left={dims.W + dims.GAP + i * (dims.SPW + dims.GAP) + 8}
                  />
                ) : null,
              )}
              {n.hasKids || folded ? (
                <button
                  type="button"
                  data-fold={p.id}
                  aria-expanded={!folded}
                  aria-label={
                    folded ? S.unfoldLabel(p.name || S.unnamed) : S.foldLabel(p.name || S.unnamed)
                  }
                  className="absolute z-[1] flex size-5 items-center justify-center rounded-full border border-border bg-bg text-xs leading-none text-muted shadow-1 hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
                  style={{ left: dims.W / 2 - 10, top: dims.H - 11 }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toggleFold(p.id)}
                >
                  {folded ? '+' : '−'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 拖曳中的半透明卡片＋說明標籤 */}
      {drag && ghostNode ? (
        <div
          className="pointer-events-none absolute top-0 left-0 z-[12] origin-top-left opacity-70"
          style={{
            left: drag.ghost.x,
            top: drag.ghost.y,
            transform: `scale(${useZoom.getState().s})`,
          }}
          data-testid="drag-ghost"
        >
          {ghostNode.stub ? (
            <StubCard
              p={ghostNode.person}
              name={stubText(people, ghostNode.person).name}
              meta={stubText(people, ghostNode.person).meta}
              label=""
              dims={dims}
              look={look}
              ghost
              avatar={avatarOf(ghostNode.person)}
            />
          ) : (
            <MemberCard
              p={ghostNode.person}
              gen={ghostNode.gen}
              dims={dims}
              look={look}
              memo={prefs.memo}
              text={memberText(people, ghostNode.person, lb, prefs.daughterName)}
              cat={catOf(board.cats, prefs.colors, ghostNode.person.cat)}
              selected={false}
              inline={null}
              ghost
              avatar={avatarOf(ghostNode.person)}
            />
          )}
          <div
            className="absolute -top-2.5 -right-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-accent-contrast"
            data-testid="drag-label"
          >
            {drag.label}
          </div>
        </div>
      ) : null}

      {legend.length ? <Legend cats={legend} /> : null}
      {pl ? (
        <div
          data-overlay
          data-testid="pl-badge"
          className="pointer-events-none absolute top-3 right-3 z-[5] rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted shadow-1"
        >
          {S.plBadge}
        </div>
      ) : null}
      {!L.nodes.length && !pl ? <EmptyState /> : null}
      <Dock />
      <div
        data-overlay
        className={cn(
          'pointer-events-none absolute bottom-3 left-3 z-[5] hidden max-w-[calc(100%-14rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted shadow-1',
          !pl && 'lg:flex',
        )}
      >
        {S.hints.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {area.picking ? (
        <AreaOverlay
          layout={L}
          toLayout={(sx, sy) => toCanvas(view.current, sx, sy)}
          onPick={setPicked}
        />
      ) : null}
    </div>
  );
}

/** 就地編輯用鍵盤結束後，焦點回到那張卡片 */
function focusCard(id: string) {
  setTimeout(() => {
    document
      .querySelector<HTMLElement>(`[data-pid="${CSS.escape(id)}"][role="button"]`)
      ?.focus({ preventScroll: true });
  }, 0);
}

/** 拖曳開始時的排版設定（以當下的顯示設定為準；拖曳只在 GM 檢視） */
function layoutOptionsFrom(): LayoutOptions {
  const b = boardNow();
  return viewOptions(prefsNow(), b, b.people);
}

/** 卡片的範圍（框選用；成員含配偶卡片，「出」字小卡是 W） */
function nodeBox(n: LayoutNode, L: TreeLayout) {
  return { x0: n.x, y0: n.y, x1: n.x + n.width, y1: n.y + L.dims.H };
}

/**
 * 框選範圍（F83）：十字游標，拖一個框（畫面座標畫框、排版座標算碰到的卡片）；Esc 或「取消」離開；
 * 放開時框裡沒有卡片就通知，有的話記下來並直接匯出。
 */
function AreaOverlay({
  layout,
  toLayout,
  onPick,
}: {
  layout: TreeLayout;
  toLayout: (sx: number, sy: number) => { x: number; y: number };
  onPick: (keys: ReadonlySet<string>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ sx: number; sy: number } | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const done = useCallback(() => {
    useUi.setState({ area: { ...useUi.getState().area, picking: false } });
  }, []);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      done();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [done]);
  const local = (e: ReactPointerEvent) => {
    const r = ref.current?.getBoundingClientRect() ?? new DOMRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const pick = (a: { sx: number; sy: number }, b: { sx: number; sy: number }) => {
    const p = toLayout(a.sx, a.sy);
    const q = toLayout(b.sx, b.sy);
    const r = {
      x0: Math.min(p.x, q.x),
      y0: Math.min(p.y, q.y),
      x1: Math.max(p.x, q.x),
      y1: Math.max(p.y, q.y),
    };
    const keys = new Set<string>();
    for (const n of layout.nodes) {
      const k = nodeBox(n, layout);
      if (k.x0 < r.x1 && k.x1 > r.x0 && k.y0 < r.y1 && k.y1 > r.y0) keys.add(nodeKey(n));
    }
    return keys;
  };
  return (
    <div
      ref={ref}
      data-overlay
      data-testid="area-overlay"
      className="absolute inset-0 z-[28] cursor-crosshair touch-none bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        try {
          ref.current?.setPointerCapture(e.pointerId);
        } catch {
          /* 已經放開 */
        }
        start.current = local(e);
        setBox({ x: start.current.sx, y: start.current.sy, w: 0, h: 0 });
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        e.stopPropagation();
        const c = local(e);
        setBox({
          x: Math.min(s.sx, c.sx),
          y: Math.min(s.sy, c.sy),
          w: Math.abs(c.sx - s.sx),
          h: Math.abs(c.sy - s.sy),
        });
        onPick(pick(s, c));
      }}
      onPointerUp={(e) => {
        const s = start.current;
        if (!s) return;
        e.stopPropagation();
        start.current = null;
        const keys = pick(s, local(e));
        setBox(null);
        onPick(new Set());
        done();
        if (!keys.size) {
          notify({ title: S.areaEmpty, tone: 'danger', replace: true });
          return;
        }
        useUi.setState({ area: { picking: false, keys: [...keys] } });
        /* 匯出區要先拿到新的範圍（按鈕才會啟用）：下一輪再匯出 */
        setTimeout(() => exportApi.current?.(), 80);
      }}
    >
      <div
        className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-lg bg-accent py-1.5 pr-1.5 pl-3.5 text-sm whitespace-nowrap text-accent-contrast shadow-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span>{S.areaBanner}</span>
        <button
          type="button"
          className="rounded-md bg-[color-mix(in_srgb,var(--accent-contrast)_18%,transparent)] px-2.5 py-1 font-semibold"
          onClick={(e) => {
            e.stopPropagation();
            done();
          }}
        >
          {S.areaCancel}
        </button>
      </div>
      {box ? (
        <div
          data-testid="area-box"
          className="pointer-events-none absolute border-[1.5px] border-dashed border-fg bg-[color-mix(in_srgb,var(--ft-in)_12%,transparent)]"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      ) : null}
    </div>
  );
}

function Legend({ cats }: { cats: Category[] }) {
  return (
    <ul
      data-overlay
      aria-label={S.legend}
      data-testid="legend"
      className="absolute top-3 left-3 z-[5] m-0 flex max-w-[calc(100%-1.5rem)] list-none flex-wrap gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-1"
    >
      {cats.map((c) => (
        <li key={c.id} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px]" style={{ background: c.color }} />
          {c.name || S.catFallback}
        </li>
      ))}
    </ul>
  );
}

function Dock() {
  const s = useZoom((z) => z.s);
  return (
    <div
      data-overlay
      className="absolute right-3 bottom-3 z-[5] flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-2"
    >
      <IconButton
        label={S.zoomOut}
        icon={<Minus />}
        size="sm"
        variant="ghost"
        onClick={() => canvasApi.current?.zoomBy(1 / BUTTON_STEP)}
      />
      <span
        className="min-w-11 text-center text-xs text-muted tabular-nums"
        data-testid="zoom-level"
        aria-live="polite"
      >
        {Math.round(s * 100)}%
      </span>
      <IconButton
        label={S.zoomIn}
        icon={<Plus />}
        size="sm"
        variant="ghost"
        onClick={() => canvasApi.current?.zoomBy(BUTTON_STEP)}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={<Scan />}
        onClick={() => canvasApi.current?.fit(true)}
        aria-label={S.fitLabel}
      >
        {S.fit}
      </Button>
    </div>
  );
}
