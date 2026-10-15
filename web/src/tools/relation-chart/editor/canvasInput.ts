/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 畫布的指標操作（原作 stage 的 pointer 處理）：
 * - 角色：拖曳（碰撞推擠、對齊格線、夾在畫布內）、選取中的整組拖曳（保持隊形、畫布邊緣有阻力）、
 *   拖曳中走快速路徑（live：只移動角色與相連的線，放開才寫回專案）、點一下＝聚焦、Shift＋點＝加入／移出選取、
 *   長按約 0.5 秒＝編輯（建立關係模式中＝指向自己）、按兩下＝編輯。
 * - 線：點一下＝編輯；線上的標籤拖曳＝沿線移動；自我關係的縮小頭貼拖曳＝繞著角色轉。
 * - 圖例：點一項＝只看這種關係／聚焦這個角色（再點取消）。
 * - 空白處：滑鼠拖曳＝框選、右鍵或中鍵拖曳＝平移；觸控拖曳＝平移、雙指＝捏合縮放；點一下＝取消聚焦與選取。
 * - 滾輪＝以游標為中心縮放；滑過角色或線＝暫時聚焦。
 */
import { clampToCanvas, sheetCtx } from '../engine/geom';
import { groupDragTo, pushAwayFrom } from '../logic/layout';
import type { Char, Sheet } from '../model/types';
import { endLink, linkClick, linkSelf } from '../state/actions';
import {
  activeSheet,
  type FocusRef,
  holdHistory,
  releaseHistory,
  setUi,
  updateProject,
  useUi,
} from '../state/store';
import { beginLive, endLive, liveSheet, scheduleLiveFrame } from './live';
import { kickSim, setSimPinned } from './sim';
import { setView, toCanvas, zoomBy } from './view';

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
      legend: { attr: 'type' | 'char'; id: number } | null;
      /** 平移的起點視角 */
      vx: number;
      vy: number;
      mode: 'none' | 'pan' | 'box';
    }
  | { kind: 'label'; relId: number; pid: number; sx: number; sy: number; moved: boolean }
  | {
      kind: 'self';
      relId: number;
      charId: number;
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
    const legendEl = closestEl(t, '.legend-item');
    if (legendEl) {
      const tid = legendEl.getAttribute('data-legend-type');
      const cid = legendEl.getAttribute('data-legend-char');
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
              : null,
        vx: v.x,
        vy: v.y,
        mode: 'none',
      };
      return;
    }
    const link = useUi.getState().link;
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
    const node = closestEl(t, '.node');
    if (node) {
      e.preventDefault();
      const id = Number(node.getAttribute('data-id'));
      const sel = useUi.getState().sel;
      const s = curSheet();
      const group = sel.includes(id) && sel.length > 1 ? sel : [id];
      const start = new Map<number, Pt>();
      for (const c of s.chars) if (group.includes(c.id)) start.set(c.id, { x: c.x, y: c.y });
      this.drag = { kind: 'node', id, ...base, shift: e.shiftKey, start, longDone: false };
      if (!e.shiftKey) this.startLongPress(id, e.clientX, e.clientY);
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

  private startLongPress(id: number, cx: number, cy: number): void {
    this.clearTimers();
    const r = this.host.getBoundingClientRect();
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
      if (useUi.getState().link || d.longDone) return;
      holdHistory('drag');
      beginLive('drag');
      setSimPinned(new Set(d.start.keys()));
      kickSim(0.3);
    } else if (d.kind === 'label' || d.kind === 'self') {
      holdHistory('drag');
    } else if (d.kind === 'empty' && d.mode === 'none') {
      d.mode = d.touch ? 'pan' : 'box';
    }
  }

  private dragMove(d: Drag, e: PointerEvent): void {
    const v = useUi.getState().view;
    if (d.kind === 'node') {
      if (useUi.getState().link || d.longDone) return;
      const s = liveSheet();
      if (!s) return;
      const dx = (e.clientX - d.sx) / v.zoom;
      const dy = (e.clientY - d.sy) / v.zoom;
      const ctx = sheetCtx(s);
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
      const r = this.host.getBoundingClientRect();
      const box = {
        x0: Math.min(d.sx, e.clientX) - r.left,
        y0: Math.min(d.sy, e.clientY) - r.top,
        x1: Math.max(d.sx, e.clientX) - r.left,
        y1: Math.max(d.sy, e.clientY) - r.top,
      };
      const a = toCanvas(box.x0 + r.left, box.y0 + r.top);
      const b = toCanvas(box.x1 + r.left, box.y1 + r.top);
      const ids = curSheet()
        .chars.filter((c) => c.x >= a.x && c.x <= b.x && c.y >= a.y && c.y <= b.y)
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
    if (d.moved) {
      if (d.kind === 'node') this.dropNode(d);
      else if (d.kind === 'label' || d.kind === 'self') this.endHistory();
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
      if (c) pushAwayFrom(sheetCtx(s), c);
    }
    this.endHistory();
    if (active) kickSim(0.6);
  }

  private boxIds(d: Extract<Drag, { kind: 'empty' }>, e: PointerEvent): number[] {
    const a = toCanvas(Math.min(d.sx, e.clientX), Math.min(d.sy, e.clientY));
    const b = toCanvas(Math.max(d.sx, e.clientX), Math.max(d.sy, e.clientY));
    return curSheet()
      .chars.filter((c) => c.x >= a.x && c.x <= b.x && c.y >= a.y && c.y <= b.y)
      .map((c) => c.id);
  }

  private tap(d: Drag, e: PointerEvent): void {
    const u = useUi.getState();
    if (d.kind === 'node') {
      if (d.longDone) return;
      if (u.link) {
        linkClick(d.id);
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
    if (d.button !== 0) return;
    if (u.link) {
      endLink();
      return;
    }
    if (d.legend) {
      const f: FocusRef =
        d.legend.attr === 'type'
          ? { kind: 'type', id: d.legend.id }
          : { kind: 'node', id: d.legend.id };
      const same = u.focus?.kind === f.kind && u.focus.id === f.id;
      setUi({ focus: same ? null : f, hover: null });
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
    const edge = node ? null : closestEl(e.target, '.edge');
    if (!node && !edge) return;
    const f: FocusRef = node
      ? { kind: 'node', id: Number(node.getAttribute('data-id')) }
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
    const from = closestEl(e.target, '.node, .edge');
    if (!from) return;
    const to = closestEl(e.relatedTarget, '.node, .edge');
    if (to === from) return;
    this.cancelHover();
    this.hoverTimer = setTimeout(() => {
      if (useUi.getState().hover) setUi({ hover: null });
    }, HOVER_OUT_MS);
  }
}
