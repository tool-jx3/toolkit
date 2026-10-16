/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 畫布的指標操作（原作 stage 的 pointer 處理）：
 * - 角色：拖曳（碰撞推擠、對齊格線、夾在畫布內）、選取中的整組拖曳（保持隊形、畫布邊緣有阻力）、
 *   拖曳中走快速路徑（live：只移動角色與相連的線，放開才寫回專案）、點一下＝聚焦、Shift＋點＝加入／移出選取、
 *   長按約 0.5 秒＝編輯（建立關係模式中＝指向自己）、按兩下＝編輯。
 * - 線：點一下＝編輯；線上的標籤拖曳＝沿線移動；自我關係的縮小頭貼拖曳＝繞著角色轉。
 * - 圖例：點一項＝只看這種關係／聚焦這個標籤的成員／聚焦這個角色（再點取消）。
 * - 空白處：滑鼠拖曳＝框選、右鍵或中鍵拖曳＝平移；觸控拖曳＝平移、雙指＝捏合縮放；點一下＝取消聚焦與選取。
 * - 滾輪＝以游標為中心縮放；滑過角色、線、標籤節點＝暫時聚焦。
 * - 第二批：標籤節點拖曳＝移動（存位置）、點一下＝聚焦；陣營名稱拖曳＝改方向、點一下＝收合；
 *   收合節點拖曳＝整組搬移、點一下＝展開；點群體關係線／聚合線＝打開它的面板；
 *   建立關係模式中點標籤節點或陣營框＝群體關係的端點。
 * - 第四批：便利貼（畫在最上層、先於角色）：右下把手拖曳＝改大小（左上角固定）、橫槓的小圓鈕（釘選、設定、刪除）、
 *   拖曳本體＝移動（不推人、不夾在畫布內；釘選的不能拖）、點一下＝就地編輯（圖表節點＝打開設定）。
 *   唯讀瀏覽：任何地方左鍵拖曳＝平移；點角色、圖例＝聚焦（再點取消）；點別的地方＝取消聚焦；其他都不做（7.4 第 10 項）。
 */
import { clampToCanvas } from '../engine/geom';
import { labelInfo } from '../engine/labels';
import { groupDragTo, pushAwayFrom } from '../logic/layout';
import type { Char, Sheet } from '../model/types';
import { endLink, linkClick, linkSelf, setCollapsed } from '../state/actions';
import { closeNote, moveNote, noteNow, resizeNote, updateNote } from '../state/noteActions';
import {
  activeSheet,
  type FocusRef,
  holdHistory,
  releaseHistory,
  setUi,
  updateProject,
  useUi,
} from '../state/store';
import { beginLive, endLive, liveCtx, liveRefresh, liveSheet, scheduleLiveFrame } from './live';
import { closeNoteEditor } from './NoteEditor';
import { kickSim, setSimPinned } from './sim';
import { swapClick } from './swap';
import { hostOrigin, setView, toCanvas, zoomBy } from './view';

const MOVE_TOL = 4;
const LONG_PRESS_MS = 500;
const RING_DELAY_MS = 180;
const HOVER_IN_MS = 150;
const HOVER_OUT_MS = 160;

type Pt = { x: number; y: number };

type Drag =
  | {
      kind: 'node';
      id: number;
      pid: number;
      sx: number;
      sy: number;
      moved: boolean;
      shift: boolean;
      /** 整組拖曳的成員與起點 */
      start: Map<number, Pt>;
      longDone: boolean;
      /** 交換位置模式中按下的（拖不動、放開＝點一下） */
      swap?: boolean;
    }
  | {
      kind: 'empty';
      pid: number;
      sx: number;
      sy: number;
      moved: boolean;
      touch: boolean;
      button: number;
      shift: boolean;
      edgeId: number | null;
      legend: { attr: 'type' | 'char' | 'label'; id: number } | null;
      /** 平移的起點視角 */
      vx: number;
      vy: number;
      mode: 'none' | 'pan' | 'box';
      /** 唯讀瀏覽中按下的角色（點一下＝聚焦） */
      roNode?: number | null;
    }
  | { kind: 'label'; relId: number; pid: number; sx: number; sy: number; moved: boolean }
  | {
      kind: 'lblnode';
      id: number;
      /** 圓心減指標的位移 */
      ox: number;
      oy: number;
      pid: number;
      sx: number;
      sy: number;
      moved: boolean;
    }
  | { kind: 'zonename'; id: number; pid: number; sx: number; sy: number; moved: boolean }
  | {
      kind: 'colnode';
      id: number;
      start: Map<number, Pt>;
      pid: number;
      sx: number;
      sy: number;
      moved: boolean;
    }
  | {
      kind: 'self';
      relId: number;
      charId: number;
      pid: number;
      sx: number;
      sy: number;
      moved: boolean;
    }
  /* 便利貼：拖曳本體（ox、oy＝中心減指標）、改大小（左上角固定） */
  | {
      kind: 'note';
      id: number;
      ox: number;
      oy: number;
      locked: boolean;
      pid: number;
      sx: number;
      sy: number;
      moved: boolean;
    }
  | {
      kind: 'noteSize';
      id: number;
      left: number;
      top: number;
      pid: number;
      sx: number;
      sy: number;
      moved: boolean;
    };

export interface BoxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CanvasInputHooks {
  /** 框選的範圍（畫布框內的 px）與會被選到的角色 */
  onBox: (box: BoxRect | null, ids: number[]) => void;
}

const closestEl = (t: EventTarget | null, sel: string): Element | null =>
  t instanceof Element ? t.closest(sel) : null;

/** 畫面上的位置（拖曳中、磁鐵跑著時是工作副本） */
const curSheet = (): Sheet => liveSheet() ?? activeSheet();
/** 收合中的成員（框選、點選都不撈） */
const hiddenNow = () => labelInfo(liveCtx(curSheet())).colHidden;

/** 改目前的分頁（標籤、縮小頭貼的拖曳；外面包 holdHistory） */
function mutateSheet(fn: (s: Sheet) => void): void {
  updateProject((p) => {
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    if (s) fn(s as Sheet);
  });
}

/** 對齊格線（原作 snapNodeToGrid） */
function snapToGrid(s: Sheet, c: { x: number; y: number }): void {
  if (!s.settings.gridSnap) return;
  const g = s.settings.gridStep >= 10 ? s.settings.gridStep : 50;
  c.x = Math.round(c.x / g) * g;
  c.y = Math.round(c.y / g) * g;
}

export class CanvasInput {
  private drag: Drag | null = null;
  private pointers = new Map<number, Pt & { touch: boolean }>();
  private pinch: { d: number; mx: number; my: number } | null = null;
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTap = { id: -1, t: 0 };
  private off: (() => void)[] = [];
  /** 便利貼的拖曳一格只改一次專案（整張重畫） */
  private noteRaf = 0;
  private notePending: (() => void) | null = null;

  constructor(
    private host: HTMLElement,
    private hooks: CanvasInputHooks,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      host.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => host.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.cancel(e));
    on('wheel', (e) => this.wheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    on('pointerover', (e) => this.over(e));
    on('pointerout', (e) => this.out(e));
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
    this.clearTimers();
    this.endHistory();
    if (this.noteRaf) cancelAnimationFrame(this.noteRaf);
  }

  /** 便利貼的拖曳、改大小：同一格只套用最後一次 */
  private noteFrame(fn: () => void): void {
    this.notePending = fn;
    if (this.noteRaf) return;
    this.noteRaf = requestAnimationFrame(() => {
      this.noteRaf = 0;
      this.flushNote();
    });
  }

  private flushNote(): void {
    const f = this.notePending;
    this.notePending = null;
    f?.();
  }

  private clearTimers(): void {
    if (this.longTimer) clearTimeout(this.longTimer);
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.longTimer = null;
    this.ringTimer = null;
    if (useUi.getState().ring) setUi({ ring: null });
  }

  private endHistory(): void {
    setSimPinned(new Set());
    endLive('drag');
    releaseHistory('drag');
  }

  /* ---------- 按下 ---------- */

  private down(e: PointerEvent): void {
    if (e.target instanceof Element && e.target.closest('[data-rc-overlay]')) return;
    const touch = e.pointerType === 'touch';
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, touch });
    try {
      this.host.setPointerCapture(e.pointerId);
    } catch {
      /* 捕捉失敗不影響其他操作 */
    }
    if (this.pointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;
    this.cancelHover();
    const v = useUi.getState().view;
    const base = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    /* 右鍵、中鍵＝平移 */
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.drag = {
        kind: 'empty',
        ...base,
        touch,
        button: e.button,
        shift: e.shiftKey,
        edgeId: null,
        legend: null,
        vx: v.x,
        vy: v.y,
        mode: 'pan',
      };
      return;
    }
    if (e.button !== 0) return;
    const t = e.target;
    if (useUi.getState().readonly) {
      e.preventDefault();
      const legendEl = closestEl(t, '.legend-item');
      const node = legendEl ? null : closestEl(t, '.node');
      const tid = legendEl?.getAttribute('data-legend-type') ?? null;
      const cid = legendEl?.getAttribute('data-legend-char') ?? null;
      const lid = legendEl?.getAttribute('data-legend-lbl') ?? null;
      this.drag = {
        kind: 'empty',
        ...base,
        touch,
        button: 0,
        shift: false,
        edgeId: null,
        legend:
          tid !== null
            ? { attr: 'type', id: Number(tid) }
            : cid !== null
              ? { attr: 'char', id: Number(cid) }
              : lid !== null
                ? { attr: 'label', id: Number(lid) }
                : null,
        vx: v.x,
        vy: v.y,
        mode: 'none',
        roNode: node ? Number(node.getAttribute('data-id')) : null,
      };
      return;
    }
    /* 編輯中的便利貼：點畫布別的地方＝收起（pointerdown 會 preventDefault，焦點不會自己離開） */
    if (useUi.getState().noteEdit !== null) closeNoteEditor();
    if (this.noteDown(e, base)) return;
    const legendEl = closestEl(t, '.legend-item');
    if (legendEl) {
      const tid = legendEl.getAttribute('data-legend-type');
      const cid = legendEl.getAttribute('data-legend-char');
      const lid = legendEl.getAttribute('data-legend-lbl');
      this.drag = {
        kind: 'empty',
        ...base,
        touch,
        button: 0,
        shift: e.shiftKey,
        edgeId: null,
        legend:
          tid !== null
            ? { attr: 'type', id: Number(tid) }
            : cid !== null
              ? { attr: 'char', id: Number(cid) }
              : lid !== null
                ? { attr: 'label', id: Number(lid) }
                : null,
        vx: v.x,
        vy: v.y,
        mode: 'none',
      };
      return;
    }
    const link = useUi.getState().link;
    /* 收合節點：拖曳＝整組搬移、點一下＝展開（建立關係模式中不能當端點） */
    const col = closestEl(t, '.colnode');
    if (col) {
      e.preventDefault();
      if (link) return;
      const id = Number(col.getAttribute('data-collbl'));
      const g = labelInfo(liveCtx(curSheet())).colGroups.get(id);
      if (!g) return;
      const start = new Map<number, Pt>(g.members.map((c) => [c.id, { x: c.x, y: c.y }]));
      this.drag = { kind: 'colnode', id, start, ...base };
      return;
    }
    const mini = closestEl(t, '.self-mini');
    if (mini && !link) {
      const relId = Number(mini.getAttribute('data-relid'));
      const r = curSheet().rels.find((x) => x.id === relId);
      if (r) {
        e.preventDefault();
        this.drag = { kind: 'self', relId, charId: r.from, ...base };
        return;
      }
    }
    const lbl = closestEl(t, '.edge-lbl');
    if (lbl && !link) {
      e.preventDefault();
      this.drag = { kind: 'label', relId: Number(lbl.getAttribute('data-relid')), ...base };
      return;
    }
    /* 標籤節點：拖曳＝移動、點一下＝聚焦（建立關係模式＝端點） */
    const ln = closestEl(t, '.lbl-node');
    if (ln) {
      e.preventDefault();
      const id = Number(ln.getAttribute('data-lblnode'));
      const cc = ln.querySelector('circle');
      const p = toCanvas(e.clientX, e.clientY);
      this.drag = {
        kind: 'lblnode',
        id,
        ox: Number(cc?.getAttribute('cx') ?? p.x) - p.x,
        oy: Number(cc?.getAttribute('cy') ?? p.y) - p.y,
        ...base,
      };
      return;
    }
    /* 陣營名稱：拖曳＝改方向、點一下＝收合（建立關係模式中＝陣營框的端點，放開時處理） */
    const zn = closestEl(t, '[data-zonecol]');
    if (zn && !link) {
      e.preventDefault();
      this.drag = { kind: 'zonename', id: Number(zn.getAttribute('data-zonecol')), ...base };
      return;
    }
    const node = closestEl(t, '.node');
    if (node) {
      e.preventDefault();
      const id = Number(node.getAttribute('data-id'));
      const u0 = useUi.getState();
      const sel = u0.sel;
      const s = curSheet();
      const group = sel.includes(id) && sel.length > 1 ? sel : [id];
      const start = new Map<number, Pt>();
      for (const c of s.chars) if (group.includes(c.id)) start.set(c.id, { x: c.x, y: c.y });
      /* 交換位置模式（建立關係模式優先）：拖不動、長按不開面板，放開都當成點一下 */
      const swap = !!u0.swap && !u0.link;
      this.drag = { kind: 'node', id, ...base, shift: e.shiftKey, start, longDone: false, swap };
      if (!e.shiftKey && !swap) this.startLongPress(id, e.clientX, e.clientY);
      return;
    }
    const edge = closestEl(t, '.edge');
    this.drag = {
      kind: 'empty',
      ...base,
      touch,
      button: 0,
      shift: e.shiftKey,
      edgeId: edge ? Number(edge.getAttribute('data-relid')) : null,
      legend: null,
      vx: v.x,
      vy: v.y,
      mode: 'none',
    };
  }

  /** 便利貼（畫在最上層）：把手 → 小圓鈕 → 本體；處理了回傳 true */
  private noteDown(
    e: PointerEvent,
    base: { pid: number; sx: number; sy: number; moved: boolean },
  ): boolean {
    const t = e.target;
    const grip = closestEl(t, '.note-grip');
    if (grip) {
      e.preventDefault();
      const n = noteNow(Number(grip.getAttribute('data-noteid')));
      if (n && !n.locked)
        this.drag = {
          kind: 'noteSize',
          id: n.id,
          left: n.x - n.w / 2,
          top: n.y - n.h / 2,
          ...base,
        };
      return true;
    }
    const btn = closestEl(t, '.note-btn');
    if (btn) {
      e.preventDefault();
      const id = Number(btn.getAttribute('data-noteid'));
      const act = btn.getAttribute('data-note-act');
      if (act === 'pin')
        updateNote(id, (n) => {
          n.locked = !n.locked;
        });
      else if (act === 'cfg') setUi({ panel: { kind: 'note', id } });
      else if (act === 'del') {
        closeNote(id);
        const u = useUi.getState();
        if (u.panel?.kind === 'note' && u.panel.id === id) setUi({ panel: null });
      }
      return true;
    }
    const g = closestEl(t, '.note-node');
    if (!g) return false;
    e.preventDefault();
    const n = noteNow(Number(g.getAttribute('data-noteid')));
    if (!n) return true;
    const p = toCanvas(e.clientX, e.clientY);
    this.drag = { kind: 'note', id: n.id, ox: n.x - p.x, oy: n.y - p.y, locked: n.locked, ...base };
    setUi({ hover: null });
    return true;
  }

  private startLongPress(id: number, cx: number, cy: number): void {
    this.clearTimers();
    const r = hostOrigin(this.host) ?? { left: 0, top: 0 };
    this.ringTimer = setTimeout(() => {
      setUi({ ring: { x: cx - r.left, y: cy - r.top, r: 26 } });
    }, RING_DELAY_MS);
    this.longTimer = setTimeout(() => {
      const d = this.drag;
      this.clearTimers();
      if (d?.kind !== 'node' || d.moved || d.id !== id) return;
      d.longDone = true;
      if (useUi.getState().link) linkSelf(id);
      else setUi({ panel: { kind: 'char', id } });
    }, LONG_PRESS_MS);
  }

  private startPinch(): void {
    /* 第二根手指：結束拖曳、改成捏合 */
    this.clearTimers();
    if (this.drag?.kind === 'node' && this.drag.moved) this.endHistory();
    this.drag = null;
    this.hooks.onBox(null, []);
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  /* ---------- 移動 ---------- */

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const v = useUi.getState().view;
      setView({ ...v, x: v.x + mx - this.pinch.mx, y: v.y + my - this.pinch.my });
      if (this.pinch.d > 0 && d > 0) zoomBy(d / this.pinch.d, mx, my);
      this.pinch = { d, mx, my };
      return;
    }
    const d = this.drag;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= MOVE_TOL) return;
      d.moved = true;
      this.clearTimers();
      this.dragStart(d);
    }
    this.dragMove(d, e);
  }

  private dragStart(d: Drag): void {
    if (d.kind === 'node') {
      if (useUi.getState().link || d.longDone || d.swap) return;
      holdHistory('drag');
      beginLive('drag');
      setSimPinned(new Set(d.start.keys()));
      kickSim(0.3);
    } else if (d.kind === 'label' || d.kind === 'self' || d.kind === 'zonename') {
      holdHistory('drag');
    } else if (d.kind === 'lblnode') {
      holdHistory('drag');
      beginLive('drag');
      setSimPinned(new Set(), d.id);
      kickSim(0.5);
    } else if (d.kind === 'colnode') {
      holdHistory('drag');
      beginLive('drag');
    } else if (d.kind === 'noteSize' || (d.kind === 'note' && !d.locked)) {
      holdHistory('drag');
    } else if (d.kind === 'empty' && d.mode === 'none') {
      d.mode = d.touch || useUi.getState().readonly ? 'pan' : 'box';
    }
  }

  private dragMove(d: Drag, e: PointerEvent): void {
    const v = useUi.getState().view;
    if (d.kind === 'note') {
      if (d.locked) return;
      const p = toCanvas(e.clientX, e.clientY);
      this.noteFrame(() => moveNote(d.id, p.x + d.ox, p.y + d.oy));
      return;
    }
    if (d.kind === 'noteSize') {
      const p = toCanvas(e.clientX, e.clientY);
      this.noteFrame(() => resizeNote(d.id, d.left, d.top, p.x, p.y));
      return;
    }
    if (d.kind === 'node') {
      if (useUi.getState().link || d.longDone || d.swap) return;
      const s = liveSheet();
      if (!s) return;
      const dx = (e.clientX - d.sx) / v.zoom;
      const dy = (e.clientY - d.sy) / v.zoom;
      const ctx = liveCtx(s);
      const c = s.chars.find((x) => x.id === d.id);
      const st = d.start.get(d.id);
      if (!c || !st) return;
      const to = { x: st.x + dx, y: st.y + dy };
      snapToGrid(s, to);
      if (d.start.size === 1) {
        c.x = to.x;
        c.y = to.y;
        clampToCanvas(ctx, c);
        if (!s.settings.noCollision) pushAwayFrom(ctx, c);
      } else {
        /* 整組：保持隊形、只加邊緣阻力（原作的 getOverflow／resist），不推人 */
        const members: { c: Char; dx: number; dy: number }[] = [];
        for (const m of s.chars) {
          const ms = d.start.get(m.id);
          if (ms && m !== c) members.push({ c: m, dx: ms.x - st.x, dy: ms.y - st.y });
        }
        groupDragTo(ctx, c, members, to.x, to.y);
      }
      scheduleLiveFrame();
      kickSim(0.3);
      return;
    }
    if (d.kind === 'lblnode') {
      const s = liveSheet();
      if (!s) return;
      const p = toCanvas(e.clientX, e.clientY);
      const to = { x: p.x + d.ox, y: p.y + d.oy };
      snapToGrid(s, to);
      s.settings.labelPos[d.id] = to;
      liveRefresh();
      kickSim(0.3);
      return;
    }
    if (d.kind === 'colnode') {
      const s = liveSheet();
      if (!s) return;
      const dx = (e.clientX - d.sx) / v.zoom;
      const dy = (e.clientY - d.sy) / v.zoom;
      for (const c of s.chars) {
        const st = d.start.get(c.id);
        if (!st) continue;
        c.x = st.x + dx;
        c.y = st.y + dy;
      }
      liveRefresh();
      return;
    }
    if (d.kind === 'zonename') {
      const pt = toCanvas(e.clientX, e.clientY);
      const s = curSheet();
      const info = labelInfo(liveCtx(s));
      const mem = (info.byId.get(d.id)?.members ?? []).filter((c) => !info.colHidden.has(c.id));
      if (!mem.length) return;
      const cx = mem.reduce((a, c) => a + c.x, 0) / mem.length;
      const cy = mem.reduce((a, c) => a + c.y, 0) / mem.length;
      if (Math.hypot(pt.x - cx, pt.y - cy) <= 4) return;
      const ang = Math.atan2(pt.y - cy, pt.x - cx);
      mutateSheet((sh) => {
        sh.settings.zoneNameAng[d.id] = ang;
      });
      return;
    }
    if (d.kind === 'label') {
      const pt = toCanvas(e.clientX, e.clientY);
      const path = this.host.querySelector<SVGPathElement>(
        `.edge[data-relid="${d.relId}"] path.edge-hit`,
      );
      if (!path) return;
      const L = path.getTotalLength() || 1;
      let best = 0.5;
      let bd = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= 40; i++) {
        const q = path.getPointAtLength((L * i) / 40);
        const dd = (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = i / 40;
        }
      }
      const t = Math.min(0.95, Math.max(0.05, best));
      mutateSheet((s) => {
        const r = s.rels.find((x) => x.id === d.relId);
        if (r) r.labelT = t;
      });
      return;
    }
    if (d.kind === 'self') {
      const pt = toCanvas(e.clientX, e.clientY);
      mutateSheet((s) => {
        const c = s.chars.find((x) => x.id === d.charId);
        if (!c) return;
        const ang = Math.atan2(pt.y - c.y, pt.x - c.x);
        for (const r of s.rels) if (r.from === c.id && r.to === c.id) r.selfAng = ang;
      });
      return;
    }
    if (d.mode === 'pan') {
      setView({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy });
      return;
    }
    if (d.mode === 'box') {
      const r = hostOrigin(this.host) ?? { left: 0, top: 0 };
      const box = {
        x0: Math.min(d.sx, e.clientX) - r.left,
        y0: Math.min(d.sy, e.clientY) - r.top,
        x1: Math.max(d.sx, e.clientX) - r.left,
        y1: Math.max(d.sy, e.clientY) - r.top,
      };
      const a = toCanvas(box.x0 + r.left, box.y0 + r.top);
      const b = toCanvas(box.x1 + r.left, box.y1 + r.top);
      const hidden = hiddenNow();
      const ids = curSheet()
        .chars.filter(
          (c) => !hidden.has(c.id) && c.x >= a.x && c.x <= b.x && c.y >= a.y && c.y <= b.y,
        )
        .map((c) => c.id);
      this.hooks.onBox(box, ids);
    }
  }

  /* ---------- 放開 ---------- */

  private up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    const d = this.drag;
    if (!d || d.pid !== e.pointerId) return;
    this.drag = null;
    this.clearTimers();
    if (d.kind === 'note' || d.kind === 'noteSize') {
      if (!d.moved) {
        this.tap(d, e);
        return;
      }
      this.flushNote();
      if (d.kind === 'noteSize' || !d.locked) releaseHistory('drag');
      return;
    }
    if (d.moved && d.kind === 'node' && d.swap) {
      /* 交換位置模式：拖一段放開＝點一下 */
      this.tap(d, e);
      return;
    }
    if (d.moved) {
      if (d.kind === 'node') this.dropNode(d);
      else if (d.kind === 'lblnode') {
        this.endHistory();
        kickSim(0.6);
      } else if (
        d.kind === 'label' ||
        d.kind === 'self' ||
        d.kind === 'zonename' ||
        d.kind === 'colnode'
      )
        this.endHistory();
      else if (d.mode === 'box') {
        const ids = this.boxIds(d, e);
        const u0 = useUi.getState();
        this.hooks.onBox(null, []);
        const sel = useUi.getState().sel;
        const next = d.shift ? [...new Set([...sel, ...ids])] : ids;
        setUi({ sel: next, focus: null, panel: next.length >= 2 ? null : u0.panel });
      }
      return;
    }
    this.tap(d, e);
  }

  /** 放開角色：磁鐵關著＝單獨拖曳的再推一次（原作）、寫回；開著＝加溫，停下時才寫回 */
  private dropNode(d: Extract<Drag, { kind: 'node' }>): void {
    const s = liveSheet();
    const active = !useUi.getState().link && !d.longDone;
    if (s && active && !s.settings.snapMode && d.start.size === 1 && !s.settings.noCollision) {
      const c = s.chars.find((x) => x.id === d.id);
      if (c) pushAwayFrom(liveCtx(s), c);
    }
    this.endHistory();
    if (active) kickSim(0.6);
  }

  private boxIds(d: Extract<Drag, { kind: 'empty' }>, e: PointerEvent): number[] {
    const a = toCanvas(Math.min(d.sx, e.clientX), Math.min(d.sy, e.clientY));
    const b = toCanvas(Math.max(d.sx, e.clientX), Math.max(d.sy, e.clientY));
    const hidden = hiddenNow();
    return curSheet()
      .chars.filter(
        (c) => !hidden.has(c.id) && c.x >= a.x && c.x <= b.x && c.y >= a.y && c.y <= b.y,
      )
      .map((c) => c.id);
  }

  private tap(d: Drag, e: PointerEvent): void {
    const u = useUi.getState();
    if (d.kind === 'noteSize') return;
    if (d.kind === 'note') {
      /* 點一下＝就地編輯；圖表節點＝打開設定 */
      const n = noteNow(d.id);
      if (!n) return;
      if (n.chart) setUi({ panel: { kind: 'note', id: n.id } });
      else setUi({ noteEdit: n.id });
      return;
    }
    if (d.kind === 'node') {
      if (d.longDone) return;
      if (u.link) {
        linkClick(d.id);
        return;
      }
      if (d.swap && !d.shift) {
        swapClick(d.id);
        return;
      }
      if (d.shift) {
        const next = u.sel.includes(d.id) ? u.sel.filter((x) => x !== d.id) : [...u.sel, d.id];
        setUi({ sel: next, panel: next.length >= 2 ? null : u.panel });
        return;
      }
      /* 按兩下＝編輯 */
      const now = e.timeStamp;
      if (this.lastTap.id === d.id && now - this.lastTap.t < 350) {
        this.lastTap = { id: -1, t: 0 };
        setUi({ panel: { kind: 'char', id: d.id }, focus: { kind: 'node', id: d.id } });
        return;
      }
      this.lastTap = { id: d.id, t: now };
      const same = u.focus?.kind === 'node' && u.focus.id === d.id;
      setUi({ focus: same ? null : { kind: 'node', id: d.id }, hover: null });
      return;
    }
    if (d.kind === 'label' || d.kind === 'self') {
      if (u.link) endLink();
      setUi({ panel: { kind: 'rel', id: d.relId }, focus: { kind: 'edge', id: d.relId } });
      return;
    }
    if (d.kind === 'lblnode') {
      if (u.link) {
        linkClick(`L${d.id}`);
        return;
      }
      const same = u.focus?.kind === 'label' && u.focus.id === d.id;
      setUi({ focus: same ? null : { kind: 'label', id: d.id }, hover: null });
      return;
    }
    if (d.kind === 'zonename') {
      setCollapsed(d.id, true);
      return;
    }
    if (d.kind === 'colnode') {
      setCollapsed(d.id, false);
      return;
    }
    if (d.button !== 0) return;
    /* 唯讀瀏覽：點角色、圖例＝聚焦（再點取消），其他＝取消聚焦 */
    if (u.readonly) {
      const f: FocusRef | null = d.legend
        ? d.legend.attr === 'type'
          ? { kind: 'type', id: d.legend.id }
          : d.legend.attr === 'label'
            ? { kind: 'label', id: d.legend.id }
            : { kind: 'node', id: d.legend.id }
        : d.roNode !== null && d.roNode !== undefined
          ? { kind: 'node', id: d.roNode }
          : null;
      const same = !!f && u.focus?.kind === f.kind && u.focus.id === f.id;
      setUi({ focus: f && !same ? f : null, hover: null });
      return;
    }
    const hit = document.elementFromPoint?.(e.clientX, e.clientY) ?? null;
    const grel = closestEl(hit, '.grel-edge[data-grelid]');
    if (u.link) {
      /* 建立關係模式：點陣營框＝這個標籤當端點；點群體關係線＝打開它的面板（模式不結束） */
      const zone = closestEl(hit, '.zone-g[data-zone]');
      if (zone) {
        linkClick(`L${zone.getAttribute('data-zone')}`);
        return;
      }
      if (grel) {
        setUi({ panel: { kind: 'grel', id: Number(grel.getAttribute('data-grelid')) } });
        return;
      }
      endLink();
      return;
    }
    if (d.legend) {
      const f: FocusRef =
        d.legend.attr === 'type'
          ? { kind: 'type', id: d.legend.id }
          : d.legend.attr === 'label'
            ? { kind: 'label', id: d.legend.id }
            : { kind: 'node', id: d.legend.id };
      const same = u.focus?.kind === f.kind && u.focus.id === f.id;
      setUi({ focus: same ? null : f, hover: null });
      return;
    }
    if (grel) {
      setUi({ panel: { kind: 'grel', id: Number(grel.getAttribute('data-grelid')) } });
      return;
    }
    const ce = closestEl(hit, '.col-edge[data-colkey]');
    if (ce) {
      setUi({ panel: { kind: 'coledge', key: ce.getAttribute('data-colkey') ?? '' } });
      return;
    }
    if (d.edgeId !== null) {
      setUi({ panel: { kind: 'rel', id: d.edgeId }, focus: { kind: 'edge', id: d.edgeId } });
      return;
    }
    setUi({ focus: null, hover: null, sel: [] });
  }

  private cancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    if (!d || d.pid !== e.pointerId) return;
    this.drag = null;
    this.clearTimers();
    this.hooks.onBox(null, []);
    if (d.kind === 'note' || d.kind === 'noteSize') {
      this.flushNote();
      if (d.moved && (d.kind === 'noteSize' || !d.locked)) releaseHistory('drag');
      return;
    }
    if (d.moved && d.kind !== 'empty') this.endHistory();
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    /* 小地圖自己處理（以畫面中央縮放） */
    if (closestEl(e.target, '[data-rc-overlay]')) return;
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }

  /* ---------- 滑過＝暫時聚焦 ---------- */

  private cancelHover(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
  }

  private over(e: PointerEvent): void {
    if (e.pointerType === 'touch' || this.drag || this.pinch) return;
    const node = closestEl(e.target, '.node');
    const ln = node ? null : closestEl(e.target, '.lbl-node');
    const edge = node || ln ? null : closestEl(e.target, '.edge');
    if (!node && !edge && !ln) return;
    const f: FocusRef = node
      ? { kind: 'node', id: Number(node.getAttribute('data-id')) }
      : ln
        ? { kind: 'label', id: Number(ln.getAttribute('data-lblnode')) }
        : { kind: 'edge', id: Number(edge?.getAttribute('data-relid')) };
    const h = useUi.getState().hover;
    this.cancelHover();
    if (h && h.kind === f.kind && h.id === f.id) return;
    this.hoverTimer = setTimeout(
      () => {
        if (!this.drag) setUi({ hover: f });
      },
      h ? 0 : HOVER_IN_MS,
    );
  }

  private out(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const from = closestEl(e.target, '.node, .edge, .lbl-node');
    if (!from) return;
    const to = closestEl(e.relatedTarget, '.node, .edge, .lbl-node');
    if (to === from) return;
    this.cancelHover();
    this.hoverTimer = setTimeout(() => {
      if (useUi.getState().hover) setUi({ hover: null });
    }, HOVER_OUT_MS);
  }
}
