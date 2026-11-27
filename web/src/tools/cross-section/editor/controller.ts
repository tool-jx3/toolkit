/**
 * 編輯畫布：視角（倍率＝每格幾 px、平移）、指標操作、點選測試、重畫。
 * React 只負責外框；畫布的事件與重畫都在這裡（requestAnimationFrame 合併）。
 *
 * 操作：點選區域、通道、設備、備註；拖曳隔間的把手（整數格）、設備（左右；牆上的也上下）、備註、通道（整數格）；
 * 拖曳空白處、區域、Space＋拖曳、中鍵、「移動畫面」工具都是移動畫面；滾輪以游標為中心縮放；觸控兩指縮放。
 * 拖曳用 store 的手勢：拖曳中即時更新，放開才記成一步復原。
 */
import { ensureDocFonts } from '../draw/export';
import { dividerHandles, drawScene, noteShape, placeFixture, sceneRect } from '../draw/render';
import { fixtureDef } from '../model/catalog';
import { inRect, isGmShaft, type Layout, layoutOf, type Rect } from '../model/layout';
import { clamp, itemRx, moveDivider, placeNote, settle } from '../model/ops';
import { momentOfEnv, RANGES, type SelRef } from '../model/types';
import { fixtureShown, noteShown, roomLook, shaftShown } from '../model/visibility';
import { S } from '../strings';
import * as act from './actions';
import { docNow, setEditor, useDoc, useEditor } from './store';

export const ZOOM_MIN = 4;
export const ZOOM_MAX = 140;
const DRAG_SLOP = 4;

interface Pt {
  x: number;
  y: number;
}

type Hit =
  | { kind: 'divider'; floorId: string; left: string; right: string }
  | { kind: 'item'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'shaft'; id: string }
  | { kind: 'room'; id: string };

type Drag =
  | {
      mode: 'pan';
      sx: number;
      sy: number;
      ox: number;
      oy: number;
      moved: boolean;
      tap?: () => void;
    }
  | { mode: 'pinch'; dist: number; zoom: number; mid: Pt; ox: number; oy: number }
  | { mode: 'divider'; floorId: string; left: string; right: string }
  | { mode: 'item'; id: string; sx: number; sy: number; started: boolean }
  | { mode: 'note'; id: string; sx: number; sy: number; started: boolean; dx: number; dy: number }
  | { mode: 'shaft'; id: string; start: number; x0: number; started: boolean };

export class SectionController {
  canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private wrap: HTMLElement | null = null;
  /** zoom＝每格幾 CSS px；ox、oy＝世界原點在畫面上的位置 */
  readonly view = { zoom: 16, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  private drag: Drag | null = null;
  private pointers = new Map<number, Pt>();
  private panHeld = false;
  private raf = 0;
  private unsubs: (() => void)[] = [];
  private ro: ResizeObserver | null = null;
  private didFit = false;
  /** 使用者自己縮放或移動過畫面（沒有時畫布大小改變就重新全體顯示） */
  private moved = false;

  attach(canvas: HTMLCanvasElement, wrap: HTMLElement): void {
    this.detach();
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext('2d');
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      canvas.addEventListener(type, fn as EventListener, opts);
      this.unsubs.push(() => canvas.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => this.onDown(e));
    on('pointermove', (e) => this.onMove(e));
    on('pointerup', (e) => this.onUp(e));
    on('pointercancel', (e) => this.onUp(e, true));
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    const blur = () => {
      this.panHeld = false;
      if (this.drag) this.finishDrag();
    };
    window.addEventListener('blur', blur);
    this.unsubs.push(() => window.removeEventListener('blur', blur));
    this.unsubs.push(useDoc.subscribe(() => this.dirty()));
    this.unsubs.push(useEditor.subscribe(() => this.dirty()));
    const fonts = () => this.dirty();
    document.fonts?.addEventListener?.('loadingdone', fonts);
    this.unsubs.push(() => document.fonts?.removeEventListener?.('loadingdone', fonts));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(wrap);
    this.resize();
    void ensureDocFonts(docNow()).then(() => this.dirty());
  }

  detach(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.ro?.disconnect();
    this.ro = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas = null;
    this.ctx = null;
    this.wrap = null;
    this.didFit = false;
  }

  /* ---------- 視角 ---------- */

  private viewChanged(): void {
    setEditor({ zoomPct: Math.round((this.view.zoom / 16) * 100) });
    this.dirty();
  }

  private resize(): void {
    const wrap = this.wrap;
    const c = this.canvas;
    if (!wrap || !c) return;
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const cx = this.view.w ? (this.view.w / 2 - this.view.ox) / this.view.zoom : 0;
    const cy = this.view.h ? (this.view.h / 2 - this.view.oy) / this.view.zoom : 0;
    this.view.w = w;
    this.view.h = h;
    this.view.dpr = dpr;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    if (!this.didFit || !this.moved) {
      this.fitView();
      this.didFit = true;
    } else {
      this.view.ox = w / 2 - cx * this.view.zoom;
      this.view.oy = h / 2 - cy * this.view.zoom;
      this.viewChanged();
    }
  }

  /** 整張紙放進畫面（四周留一點） */
  fitView(): void {
    const { w, h } = this.view;
    if (!w || !h) return;
    const doc = docNow();
    const b = sceneRect(doc, layoutOf(doc), 'sheet');
    const z = clamp(Math.min(w / (b.w * 1.06), h / (b.h * 1.06)), ZOOM_MIN, ZOOM_MAX);
    this.view.zoom = z;
    this.view.ox = w / 2 - (b.x + b.w / 2) * z;
    this.view.oy = h / 2 - (b.y + b.h / 2) * z;
    this.moved = false;
    this.viewChanged();
  }

  zoomBy(f: number, at?: Pt): void {
    const { w, h } = this.view;
    const p = at ?? { x: w / 2, y: h / 2 };
    const z = clamp(this.view.zoom * f, ZOOM_MIN, ZOOM_MAX);
    const k = z / this.view.zoom;
    this.view.ox = p.x - (p.x - this.view.ox) * k;
    this.view.oy = p.y - (p.y - this.view.oy) * k;
    this.view.zoom = z;
    this.moved = true;
    this.viewChanged();
  }

  toScreen(x: number, y: number): Pt {
    return { x: this.view.ox + x * this.view.zoom, y: this.view.oy + y * this.view.zoom };
  }

  toWorld(sx: number, sy: number): Pt {
    return { x: (sx - this.view.ox) / this.view.zoom, y: (sy - this.view.oy) / this.view.zoom };
  }

  private local(e: { clientX: number; clientY: number }): Pt {
    const r = this.canvas?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }

  setSpace(down: boolean): void {
    this.panHeld = down;
    if (this.canvas) this.canvas.style.cursor = down ? 'grab' : '';
  }

  /* ---------- 點選測試 ---------- */

  hitTest(p: Pt): Hit | null {
    const doc = docNow();
    const L = layoutOf(doc);
    const { audience } = useEditor.getState();
    const m = momentOfEnv(doc.env);
    const ctx = this.ctx;
    if (ctx)
      for (let i = doc.notes.length - 1; i >= 0; i--) {
        const n = doc.notes[i];
        if (!noteShown(L, n, audience, m)) continue;
        const sh = noteShape(ctx, L, n);
        if (inRect(sh.rect, p.x, p.y)) return { kind: 'note', id: n.id };
      }
    if (audience !== 'player') {
      const tol = Math.max(0.35, 6 / this.view.zoom);
      for (const h of dividerHandles(L))
        if (Math.abs(p.x - h.x) <= tol && p.y >= h.y0 + 0.4 && p.y <= h.y1 - 0.4)
          return { kind: 'divider', floorId: h.floorId, left: h.left, right: h.right };
    }
    const after = m === 'after';
    for (let i = doc.items.length - 1; i >= 0; i--) {
      const it = doc.items[i];
      if (!fixtureShown(it, audience, m)) continue;
      const rb = L.rooms.find((r) => r.room.id === it.room);
      if (!rb || roomLook(rb, audience) !== 'normal') continue;
      const pl = placeFixture(rb, it, after);
      if (!pl) continue;
      if (
        p.x >= pl.x - pl.w / 2 - 0.1 &&
        p.x <= pl.x + pl.w / 2 + 0.1 &&
        p.y >= pl.y - pl.h - 0.1 &&
        p.y <= pl.y + 0.1
      )
        return { kind: 'item', id: it.id };
    }
    /* GM 專用的通道畫在區域上面，先找 */
    const shafts = [...L.shafts].sort(
      (a, b) => Number(isGmShaft(b.shaft)) - Number(isGmShaft(a.shaft)),
    );
    for (const s of shafts) {
      if (!shaftShown(s.shaft, audience)) continue;
      if (inRect(s, p.x, p.y)) return { kind: 'shaft', id: s.shaft.id };
    }
    for (const r of L.rooms)
      if (roomLook(r, audience) !== 'hidden' && inRect(r, p.x, p.y))
        return { kind: 'room', id: r.room.id };
    return null;
  }

  /* ---------- 指標 ---------- */

  private onDown(e: PointerEvent): void {
    const c = this.canvas;
    if (!c) return;
    c.focus({ preventScroll: true });
    const s = this.local(e);
    this.pointers.set(e.pointerId, s);
    if (e.pointerType === 'touch' && this.pointers.size >= 2) {
      this.startPinch();
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    const st = useEditor.getState();
    const pan = (tap?: () => void) => {
      this.drag = {
        mode: 'pan',
        sx: s.x,
        sy: s.y,
        ox: this.view.ox,
        oy: this.view.oy,
        moved: false,
        tap,
      };
      c.setPointerCapture(e.pointerId);
    };
    if (st.tool === 'hand' || this.panHeld || e.button === 1) {
      pan();
      return;
    }
    const p = this.toWorld(s.x, s.y);
    if (st.audience === 'player') {
      pan(() => act.notify(S.msg.playerLocked, 'warning', { duration: 2000 }));
      return;
    }
    if (st.tool === 'place') {
      pan(() => act.placeFixtureAt(p.x, p.y));
      return;
    }
    if (st.tool === 'note') {
      pan(() => act.placeNoteAt(p.x, p.y));
      return;
    }
    const hit = this.hitTest(p);
    if (!hit) {
      pan(() => setEditor({ sel: null }));
      return;
    }
    if (hit.kind === 'room') {
      pan(() => setEditor({ sel: { kind: 'room', id: hit.id } }));
      return;
    }
    c.setPointerCapture(e.pointerId);
    if (hit.kind === 'divider') {
      useDoc.beginGesture();
      this.drag = { mode: 'divider', floorId: hit.floorId, left: hit.left, right: hit.right };
      return;
    }
    setEditor({ sel: { kind: hit.kind, id: hit.id } as SelRef });
    if (hit.kind === 'item')
      this.drag = { mode: 'item', id: hit.id, sx: s.x, sy: s.y, started: false };
    else if (hit.kind === 'note') {
      const doc = docNow();
      const n = doc.notes.find((v) => v.id === hit.id);
      const sh = n && this.ctx ? noteShape(this.ctx, layoutOf(doc), n) : null;
      this.drag = {
        mode: 'note',
        id: hit.id,
        sx: s.x,
        sy: s.y,
        started: false,
        dx: sh ? sh.x - p.x : 0,
        dy: sh ? sh.y - p.y : 0,
      };
    } else {
      const sh = docNow().building.shafts.find((v) => v.id === hit.id);
      this.drag = { mode: 'shaft', id: hit.id, start: p.x, x0: sh?.x ?? 0, started: false };
    }
  }

  private startPinch(): void {
    if (this.drag && this.drag.mode !== 'pan' && this.drag.mode !== 'pinch') this.finishDrag();
    const [a, b] = [...this.pointers.values()];
    this.drag = {
      mode: 'pinch',
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: this.view.zoom,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      ox: this.view.ox,
      oy: this.view.oy,
    };
  }

  private onMove(e: PointerEvent): void {
    const s = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, s);
    const drag = this.drag;
    if (!drag) {
      this.updateCursor(s);
      return;
    }
    const p = this.toWorld(s.x, s.y);
    switch (drag.mode) {
      case 'pinch': {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = clamp((drag.zoom * dist) / drag.dist, ZOOM_MIN, ZOOM_MAX);
        const k = z / drag.zoom;
        this.view.zoom = z;
        this.view.ox = mid.x - (drag.mid.x - drag.ox) * k;
        this.view.oy = mid.y - (drag.mid.y - drag.oy) * k;
        this.moved = true;
        this.viewChanged();
        return;
      }
      case 'pan':
        if (!drag.moved && Math.hypot(s.x - drag.sx, s.y - drag.sy) < DRAG_SLOP) return;
        drag.moved = true;
        this.moved = true;
        this.view.ox = drag.ox + s.x - drag.sx;
        this.view.oy = drag.oy + s.y - drag.sy;
        this.viewChanged();
        return;
      case 'divider':
        useDoc.getState().update((d) => {
          const f = d.building.floors.find((v) => v.id === drag.floorId);
          const l = f?.rooms.find((r) => r.id === drag.left);
          const r = f?.rooms.find((v) => v.id === drag.right);
          if (l && r) moveDivider(l, r, p.x);
        });
        return;
      case 'item':
        if (!drag.started) {
          if (Math.hypot(s.x - drag.sx, s.y - drag.sy) < DRAG_SLOP) return;
          drag.started = true;
          useDoc.beginGesture();
        }
        this.moveItem(drag.id, p);
        return;
      case 'note':
        if (!drag.started) {
          if (Math.hypot(s.x - drag.sx, s.y - drag.sy) < DRAG_SLOP) return;
          drag.started = true;
          useDoc.beginGesture();
        }
        useDoc.getState().update((d) => {
          const n = d.notes.find((v) => v.id === drag.id);
          if (n) placeNote(d, n, p.x + drag.dx, p.y + drag.dy);
        });
        return;
      case 'shaft': {
        const nx = drag.x0 + Math.round(p.x - drag.start);
        const cur = docNow().building.shafts.find((v) => v.id === drag.id);
        if (!cur || nx === cur.x) return;
        if (!drag.started) {
          drag.started = true;
          useDoc.beginGesture();
        }
        useDoc.getState().update((d) => {
          const sh = d.building.shafts.find((v) => v.id === drag.id);
          if (!sh) return;
          sh.x = clamp(nx, 0, Math.max(0, d.building.width - 1));
          settle(d);
        });
        return;
      }
    }
  }

  private moveItem(id: string, p: Pt): void {
    const doc = docNow();
    const it = doc.items.find((v) => v.id === id);
    const rb = it ? layoutOf(doc).rooms.find((r) => r.room.id === it.room) : null;
    if (!it || !rb) return;
    const rx = clamp(itemRx({ x0: rb.x, x1: rb.x + rb.w }, p.x), RANGES.rx.min, RANGES.rx.max);
    const wall = fixtureDef(it.kind)?.hang === 'wall';
    const ry = clamp(
      (p.y - (rb.y + 0.54)) / Math.max(0.8, rb.h - 0.88),
      RANGES.ry.min,
      RANGES.ry.max,
    );
    useDoc.getState().update((d) => {
      const v = d.items.find((x) => x.id === id);
      if (!v) return;
      v.rx = Math.round(rx * 1000) / 1000;
      if (wall) v.ry = Math.round(ry * 1000) / 1000;
    });
  }

  private onUp(e: PointerEvent, cancel = false): void {
    this.pointers.delete(e.pointerId);
    const drag = this.drag;
    if (!drag) return;
    if (drag.mode === 'pinch') {
      if (this.pointers.size < 2) this.drag = null;
      return;
    }
    if (this.canvas?.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (drag.mode === 'pan' && !drag.moved && !cancel) drag.tap?.();
    this.finishDrag();
  }

  private finishDrag(): void {
    const drag = this.drag;
    this.drag = null;
    if (drag && drag.mode !== 'pan' && drag.mode !== 'pinch') useDoc.endGesture();
    this.dirty();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), this.local(e));
  }

  private updateCursor(s: Pt): void {
    const c = this.canvas;
    if (!c || this.panHeld) return;
    const st = useEditor.getState();
    if (st.tool === 'hand') c.style.cursor = 'grab';
    else if (st.tool !== 'select' || st.audience === 'player')
      c.style.cursor = st.tool === 'select' ? 'grab' : 'crosshair';
    else {
      const hit = this.hitTest(this.toWorld(s.x, s.y));
      c.style.cursor =
        !hit || hit.kind === 'room'
          ? 'grab'
          : hit.kind === 'divider' || hit.kind === 'shaft'
            ? 'ew-resize'
            : 'move';
    }
  }

  /* ---------- 重畫 ---------- */

  dirty(): void {
    if (this.raf || !this.ctx) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  /** 畫面上看得到的世界範圍 */
  visibleRect(): Rect {
    const { zoom, ox, oy, w, h } = this.view;
    return { x: -ox / zoom, y: -oy / zoom, w: w / zoom, h: h / zoom };
  }

  render(): void {
    const c = this.ctx;
    const cv = this.canvas;
    if (!c || !cv) return;
    const doc = docNow();
    const L: Layout = layoutOf(doc);
    const st = useEditor.getState();
    const { zoom, ox, oy, dpr } = this.view;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(zoom * dpr, 0, 0, zoom * dpr, ox * dpr, oy * dpr);
    drawScene(c, doc, L, {
      audience: st.audience,
      env: doc.env,
      flood: doc.flood ? doc.floodLevel || RANGES.flood.def : 0,
      crop: 'sheet',
      edit: { sel: st.audience === 'player' ? null : st.sel, handles: st.tool === 'select' },
    });
    cv.dataset.rendered = String(Number(cv.dataset.rendered ?? 0) + 1);
  }
}

export const editor = new SectionController();
