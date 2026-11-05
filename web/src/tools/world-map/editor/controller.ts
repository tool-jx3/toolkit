/**
 * 編輯畫布：視角（倍率、平移）、指標操作（各工具）、點選測試、重畫（地表與山林的圖層快取＋其他直接畫）。
 * React 只負責外框；畫布的事件與重畫都在這裡，移動滑鼠不必重新渲染元件。
 *
 * - 一筆的過程中地形只改在這裡的工作用格子，畫面以 requestAnimationFrame 合併重畫（圖層用約 0.65 倍的解析度，比較輕）；
 *   放開時才寫進地圖（一步復原）、更新小地圖與完整解析度的圖層。
 * - 拖曳（移動、名字、頂點）用 store 的手勢：拖曳中即時更新，放開才記成一步；取消時回到拖曳前。
 */

import { drawAsset } from '../draw/assets';
import { ensureMapFonts } from '../draw/export';
import { labelQuad, labelStyle, nameStyle } from '../draw/labels';
import { THEMES } from '../draw/palette';
import {
  type Derived,
  deriveDoc,
  deriveGrid,
  drawGridOverlay,
  drawGround,
  drawRegions,
  drawRegionWalls,
  drawRelief,
  drawUpper,
  objectOrder,
} from '../draw/render';
import { assetDef } from '../model/assets';
import { centroid, clamp, distToPolyline, pointInPolygon, sampleCurve } from '../model/geometry';
import { dockOf } from '../model/ports';
import { brushBox, brushStroke, encodeCells, type Grid, gridOf } from '../model/terrain';
import {
  CELL,
  FOREST,
  LIMITS,
  MOUNTAIN,
  type Pt,
  RANGES,
  type SelRef,
  type WorldDoc,
} from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { BRUSH_TOOLS, docNow, LINE_TOOLS, setEditor, useDoc, useEditor, usePrefs } from './store';

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 6;
const HANDLE_R = 7;
const INSERT_R = 4.5;
const SEL = '#f0c75e';
const SEL_DARK = '#5e4423';

type Drag =
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'pinch'; dist: number; zoom: number; mid: Pt; ox: number; oy: number }
  | { mode: 'brush'; last: Pt; grid: Grid; changed: boolean; turnOnDetails: boolean }
  | { mode: 'move'; ref: SelRef; start: Pt; orig: unknown; before: WorldDoc }
  | { mode: 'label'; ref: SelRef; start: Pt; dx: number; dy: number; before: WorldDoc }
  | {
      mode: 'vertex';
      ref: SelRef;
      index: number;
      start: Pt;
      sx: number;
      sy: number;
      inserted: boolean;
      before: WorldDoc;
    };

type Hit =
  | { kind: 'handle'; index: number }
  | { kind: 'insert'; index: number }
  | { kind: 'label'; ref: SelRef }
  | { kind: 'item'; ref: SelRef };

interface LayerCache {
  key: string;
  ground: HTMLCanvasElement;
  relief: HTMLCanvasElement | null;
}

let derivedSerial = 0;
const serials = new WeakMap<Derived, number>();
const serialOf = (d: Derived) => {
  let s = serials.get(d);
  if (!s) {
    s = ++derivedSerial;
    serials.set(d, s);
  }
  return s;
};

const mapW = (d: WorldDoc) => d.cols * CELL;
const mapH = (d: WorldDoc) => d.rows * CELL;

/** 上一次點在頂點上（按兩下刪點用） */
interface ControllerVertexClick {
  ref: SelRef;
  index: number;
  x: number;
  y: number;
  t: number;
}

export class WorldController {
  canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private measure: CanvasRenderingContext2D | null = null;
  private wrap: HTMLElement | null = null;
  readonly view = { zoom: 0.5, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  private drag: Drag | null = null;
  private draft: Pt[] = [];
  private hover: Pt | null = null;
  private spaceDown = false;
  private pointers = new Map<number, Pt>();
  /** 觸控：放開時才做的點一下（素材、地名、線的點、公開用的提醒）；第二指落下時取消 */
  private pendingTap: { id: number; run: () => void } | null = null;
  /** 觸控：第一指落下前的選取（第二指落下、變成縮放時還原） */
  private selBeforeTouch: SelRef | null | undefined = undefined;
  private raf = 0;
  private cache: LayerCache | null = null;
  private brushDerived: Derived | null = null;
  private lastVertexClick: ControllerVertexClick | null = null;
  private suppressDblUntil = 0;
  private unsubs: (() => void)[] = [];
  private ro: ResizeObserver | null = null;
  private fitted = false;
  private viewListeners = new Set<() => void>();
  private fontTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- 掛上、拿掉 ---------- */

  attach(canvas: HTMLCanvasElement, wrap: HTMLElement): void {
    this.detach();
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext('2d');
    this.measure = document.createElement('canvas').getContext('2d');
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
    on('lostpointercapture', (e) => {
      if (this.drag && this.drag.mode !== 'pinch' && this.pointers.has(e.pointerId))
        this.onUp(e, true);
    });
    on('pointerleave', () => {
      if (!this.drag) {
        this.hover = null;
        this.dirty();
      }
    });
    on('dblclick', (e) => this.onDblClick(e));
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    const blur = () => {
      this.spaceDown = false;
      if (this.drag) this.cancelDrag();
    };
    window.addEventListener('blur', blur);
    this.unsubs.push(() => window.removeEventListener('blur', blur));
    this.unsubs.push(useDoc.subscribe(() => this.onDocChange()));
    this.unsubs.push(useEditor.subscribe(() => this.dirty()));
    this.unsubs.push(usePrefs.subscribe(() => this.dirty()));
    const fonts = () => this.dirty();
    document.fonts?.addEventListener?.('loadingdone', fonts);
    this.unsubs.push(() => document.fonts?.removeEventListener?.('loadingdone', fonts));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(wrap);
    this.resize();
    void ensureMapFonts(docNow()).then(() => this.dirty());
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
    this.fitted = false;
  }

  private onDocChange(): void {
    this.dirty();
    if (this.fontTimer) clearTimeout(this.fontTimer);
    this.fontTimer = setTimeout(() => void ensureMapFonts(docNow()).then(() => this.dirty()), 300);
  }

  /* ---------- 視角 ---------- */

  onView(fn: () => void): () => void {
    this.viewListeners.add(fn);
    return () => this.viewListeners.delete(fn);
  }

  private viewChanged(): void {
    setEditor({ zoomPct: Math.round(this.view.zoom * 100) });
    for (const fn of this.viewListeners) fn();
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
    if (!this.fitted) {
      this.fitView();
      this.fitted = true;
    } else {
      this.view.ox = w / 2 - cx * this.view.zoom;
      this.view.oy = h / 2 - cy * this.view.zoom;
      this.viewChanged();
    }
  }

  fitView(): void {
    const d = docNow();
    const { w, h } = this.view;
    if (!w || !h) return;
    const z = clamp(Math.min(w / (mapW(d) + 90), h / (mapH(d) + 90)), ZOOM_MIN, ZOOM_MAX);
    this.view.zoom = z;
    this.view.ox = (w - mapW(d) * z) / 2;
    this.view.oy = (h - mapH(d) * z) / 2;
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
    this.viewChanged();
  }

  /** 讓地圖上的某一點在畫面正中間（小地圖） */
  centerOn(x: number, y: number): void {
    const d = docNow();
    const cx = clamp(x, 0, mapW(d));
    const cy = clamp(y, 0, mapH(d));
    this.view.ox = this.view.w / 2 - cx * this.view.zoom;
    this.view.oy = this.view.h / 2 - cy * this.view.zoom;
    this.viewChanged();
  }

  /** 畫面上看得到的地圖範圍（小地圖的框） */
  visibleRect(): { x: number; y: number; w: number; h: number } {
    const { zoom, ox, oy, w, h } = this.view;
    return { x: -ox / zoom, y: -oy / zoom, w: w / zoom, h: h / zoom };
  }

  toScreen(x: number, y: number): Pt {
    return { x: this.view.ox + x * this.view.zoom, y: this.view.oy + y * this.view.zoom };
  }

  toMap(sx: number, sy: number): Pt {
    return { x: (sx - this.view.ox) / this.view.zoom, y: (sy - this.view.oy) / this.view.zoom };
  }

  private local(e: { clientX: number; clientY: number }): Pt {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ---------- 畫到一半的線 ---------- */

  get draftPoints(): readonly Pt[] {
    return this.draft;
  }

  private setDraft(pts: Pt[]): void {
    this.draft = pts;
    setEditor({ draftCount: pts.length });
    this.dirty();
  }

  cancelDraft(): void {
    if (this.draft.length) this.setDraft([]);
  }

  popDraftPoint(): boolean {
    if (!this.draft.length) return false;
    this.setDraft(this.draft.slice(0, -1));
    return true;
  }

  finishDraft(): void {
    const tool = useEditor.getState().tool;
    if (!LINE_TOOLS.includes(tool)) return;
    if (act.finishLine(tool, this.draft)) this.setDraft([]);
  }

  /* ---------- 點選測試 ---------- */

  private labelSpecs(doc: WorldDoc) {
    const out: { ref: SelRef; quad: Pt[] }[] = [];
    const ctx = this.measure;
    if (!ctx) return out;
    const player = useEditor.getState().audience === 'player';
    if (doc.settings.names) {
      for (const r of doc.regions) {
        const c = centroid(r.points);
        out.push({
          ref: { kind: 'region', id: r.id },
          quad: labelQuad(ctx, {
            text: r.name,
            x: c.x + r.labelDx,
            y: c.y + r.labelDy,
            size: r.labelSize,
            style: labelStyle(doc.settings.font, r.font),
            weight: 500,
            curve: r.curve,
            tracking: 4,
            fill: '',
          }),
        });
      }
      for (const o of doc.objects) {
        if (!o.name || (player && o.secret)) continue;
        out.push({
          ref: { kind: 'object', id: o.id },
          quad: labelQuad(ctx, {
            text: o.secret ? `[GM] ${o.name}` : o.name,
            x: o.x + o.labelDx,
            y: o.y + o.labelDy,
            size: 18,
            style: nameStyle(doc.settings.font),
            weight: 700,
            fill: '',
          }),
        });
      }
    }
    return out;
  }

  private noteQuad(doc: WorldDoc, id: string): Pt[] {
    const n = doc.notes.find((v) => v.id === id);
    if (!n || !this.measure) return [];
    return labelQuad(this.measure, {
      text: n.secret ? `[GM] ${n.text}` : n.text || ' ',
      x: n.x,
      y: n.y,
      size: n.size,
      rotation: n.rotation,
      curve: n.curve,
      style: labelStyle(doc.settings.font, n.font),
      weight: 500,
      tracking: 2,
      fill: '',
    });
  }

  hitTest(p: Pt): Hit | null {
    const doc = docNow();
    const { sel, audience } = useEditor.getState();
    const player = audience === 'player';
    const z = this.view.zoom;
    const selPts = sel ? this.pointsOf(doc, sel) : null;
    if (selPts) {
      for (let i = selPts.length - 1; i >= 0; i--)
        if (Math.hypot(p.x - selPts[i].x, p.y - selPts[i].y) <= (HANDLE_R + 2) / z)
          return { kind: 'handle', index: i };
      if (selPts.length < LIMITS.points) {
        const closed = sel!.kind === 'region';
        const count = closed ? selPts.length : selPts.length - 1;
        for (let i = 0; i < count; i++) {
          const a = selPts[i];
          const b = selPts[(i + 1) % selPts.length];
          if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (Math.hypot(p.x - m.x, p.y - m.y) <= (INSERT_R + 3) / z)
            return { kind: 'insert', index: i + 1 };
        }
      }
    }
    for (let i = doc.notes.length - 1; i >= 0; i--) {
      const n = doc.notes[i];
      if (player && n.secret) continue;
      if (pointInPolygon(p, this.noteQuad(doc, n.id)))
        return { kind: 'item', ref: { kind: 'note', id: n.id } };
    }
    const labels = this.labelSpecs(doc);
    for (const l of labels)
      if (l.ref.kind === 'object' && pointInPolygon(p, l.quad))
        return { kind: 'label', ref: l.ref };
    const objs = objectOrder(player ? doc.objects.filter((o) => !o.secret) : doc.objects);
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      if (Math.abs(dx) <= o.size * 0.55 && dy >= -o.size * 0.68 && dy <= o.size * 0.5)
        return { kind: 'item', ref: { kind: 'object', id: o.id } };
    }
    for (const l of labels)
      if (l.ref.kind === 'region' && pointInPolygon(p, l.quad))
        return { kind: 'label', ref: l.ref };
    const tol = Math.max(9, 6 / z);
    for (let i = doc.paths.length - 1; i >= 0; i--) {
      const path = doc.paths[i];
      if (player && path.secret) continue;
      const pts = sampleCurve(path.points, path.kind === 'wall' ? false : path.smooth);
      const extra = path.kind === 'river' ? path.width * 0.62 : path.width / 2;
      if (distToPolyline(p, pts) <= Math.max(tol, extra + 3))
        return { kind: 'item', ref: { kind: 'path', id: path.id } };
    }
    const grid = this.gridNow();
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    const onLand =
      cx >= 0 &&
      cy >= 0 &&
      cx < grid.cols &&
      cy < grid.rows &&
      grid.terrain[cy * grid.cols + cx] > 0;
    for (let i = doc.regions.length - 1; i >= 0; i--) {
      const r = doc.regions[i];
      if (pointInPolygon(p, r.points) && (onLand || r.wall))
        return { kind: 'item', ref: { kind: 'region', id: r.id } };
    }
    return null;
  }

  private pointsOf(doc: WorldDoc, ref: SelRef): Pt[] | null {
    if (ref.kind === 'region') return doc.regions.find((r) => r.id === ref.id)?.points ?? null;
    if (ref.kind === 'path') return doc.paths.find((r) => r.id === ref.id)?.points ?? null;
    return null;
  }

  private gridCache: { terrain: string; ground: string; grid: Grid } | null = null;
  private gridNow(): Grid {
    const d = docNow();
    if (
      this.gridCache &&
      this.gridCache.terrain === d.terrain &&
      this.gridCache.ground === d.ground
    )
      return this.gridCache.grid;
    const grid = gridOf(d);
    this.gridCache = { terrain: d.terrain, ground: d.ground, grid };
    return grid;
  }

  /* ---------- 指標 ---------- */

  private onDown(e: PointerEvent): void {
    const c = this.canvas;
    if (!c) return;
    c.focus({ preventScroll: true });
    const s = this.local(e);
    this.pointers.set(e.pointerId, s);
    const touch = e.pointerType === 'touch';
    if (touch && this.pointers.size >= 2) {
      this.startPinch();
      return;
    }
    if (touch) this.selBeforeTouch = useEditor.getState().sel;
    if (e.button !== 0 && e.button !== 1) return;
    const st = useEditor.getState();
    /* 觸控的點一下等放開才做：中途變成兩指縮放時不留下東西 */
    const tap = (run: () => void) => {
      if (touch) this.pendingTap = { id: e.pointerId, run };
      else run();
    };
    const prevClick = this.lastVertexClick;
    this.lastVertexClick = null;
    if (st.tool === 'hand' || this.spaceDown || e.button === 1) {
      this.drag = { mode: 'pan', sx: s.x, sy: s.y, ox: this.view.ox, oy: this.view.oy };
      c.setPointerCapture(e.pointerId);
      this.dirty();
      return;
    }
    if (st.audience === 'player') {
      tap(() => act.notify(S.msg.playerLocked, 'warning'));
      return;
    }
    const doc = docNow();
    const p = this.toMap(s.x, s.y);
    if (p.x < 0 || p.y < 0 || p.x > mapW(doc) || p.y > mapH(doc)) return;
    if (BRUSH_TOOLS.includes(st.tool)) {
      setEditor({ sel: null });
      const grid = gridOf(doc);
      const paint = usePrefs.getState().data.paint;
      const turnOnDetails =
        st.tool === 'brush' && (paint === FOREST || paint === MOUNTAIN) && !doc.settings.details;
      this.drag = { mode: 'brush', last: p, grid, changed: false, turnOnDetails };
      this.paint(p, p);
      c.setPointerCapture(e.pointerId);
      return;
    }
    if (LINE_TOOLS.includes(st.tool)) {
      tap(() => {
        const last = this.draft[this.draft.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) <= 5 / this.view.zoom) return;
        if (this.draft.length >= LIMITS.points) act.notify(S.msg.pointLimit, 'warning');
        else this.setDraft([...this.draft, p]);
      });
      return;
    }
    if (st.tool === 'asset') {
      tap(() => act.placeAsset(st.asset, p));
      return;
    }
    if (st.tool === 'note') {
      /* 不讓之後的滑鼠相容事件把焦點拉回畫布（放下後焦點要在文字欄） */
      e.preventDefault();
      tap(() => act.placeNote(p));
      return;
    }
    this.onSelectDown(e, s, p, prevClick);
  }

  /** 第二指落下：取消第一指正在做的事（不留下復原的一步），開始兩指縮放；第三指以後不理 */
  private startPinch(): void {
    this.pendingTap = null;
    if (this.drag?.mode === 'pinch') return;
    if (this.drag && this.drag.mode !== 'pan') this.cancelDrag(false);
    if (this.selBeforeTouch !== undefined) setEditor({ sel: this.selBeforeTouch });
    this.selBeforeTouch = undefined;
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

  /** 選取工具按下：插入點、拖頂點、按兩下刪點、拖標籤、移動 */
  private onSelectDown(
    e: PointerEvent,
    s: Pt,
    p: Pt,
    prevClick: ControllerVertexClick | null,
  ): void {
    const c = this.canvas;
    if (!c) return;
    const st = useEditor.getState();
    const doc = docNow();
    const hit = this.hitTest(p);
    if (hit?.kind === 'insert' && st.sel) {
      const before = docNow();
      useDoc.beginGesture();
      const ref = st.sel;
      act.mutatePoints(ref, (pts) => pts.splice(hit.index, 0, this.clampPt(p)));
      this.drag = {
        mode: 'vertex',
        ref,
        index: hit.index,
        start: p,
        sx: s.x,
        sy: s.y,
        inserted: true,
        before,
      };
      c.setPointerCapture(e.pointerId);
      return;
    }
    if (hit?.kind === 'handle' && st.sel) {
      const ref = st.sel;
      const isDouble =
        prevClick &&
        prevClick.ref.id === ref.id &&
        prevClick.index === hit.index &&
        performance.now() - prevClick.t < 500 &&
        Math.hypot(e.clientX - prevClick.x, e.clientY - prevClick.y) < 5 &&
        !e.altKey;
      if (isDouble || e.altKey) {
        e.preventDefault();
        this.suppressDblUntil = performance.now() + 600;
        act.deleteVertex(ref, hit.index);
        return;
      }
      useDoc.beginGesture();
      this.drag = {
        mode: 'vertex',
        ref,
        index: hit.index,
        start: p,
        sx: e.clientX,
        sy: e.clientY,
        inserted: false,
        before: docNow(),
      };
      c.setPointerCapture(e.pointerId);
      return;
    }
    if (!hit || hit.kind === 'handle' || hit.kind === 'insert') {
      setEditor({ sel: null });
      return;
    }
    const ref = hit.ref;
    setEditor({ sel: ref });
    const before = docNow();
    useDoc.beginGesture();
    if (hit.kind === 'label') {
      const o =
        ref.kind === 'region'
          ? doc.regions.find((r) => r.id === ref.id)
          : doc.objects.find((r) => r.id === ref.id);
      this.drag = {
        mode: 'label',
        ref,
        start: p,
        dx: o?.labelDx ?? 0,
        dy: o?.labelDy ?? 0,
        before,
      };
    } else {
      this.drag = { mode: 'move', ref, start: p, orig: act.getItem(doc, ref), before };
    }
    c.setPointerCapture(e.pointerId);
  }

  private clampPt(p: Pt): Pt {
    const d = docNow();
    return { x: clamp(p.x, 0, mapW(d)), y: clamp(p.y, 0, mapH(d)) };
  }

  private onMove(e: PointerEvent): void {
    const s = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, s);
    const drag = this.drag;
    const p = this.toMap(s.x, s.y);
    if (!drag) {
      this.hover = p;
      this.dirty();
      return;
    }
    if (drag.mode === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = clamp((drag.zoom * dist) / drag.dist, ZOOM_MIN, ZOOM_MAX);
      const k = z / drag.zoom;
      this.view.zoom = z;
      this.view.ox = mid.x - (drag.mid.x - drag.ox) * k;
      this.view.oy = mid.y - (drag.mid.y - drag.oy) * k;
      this.viewChanged();
      return;
    }
    if (drag.mode === 'pan') {
      this.view.ox = drag.ox + s.x - drag.sx;
      this.view.oy = drag.oy + s.y - drag.sy;
      this.viewChanged();
      return;
    }
    if (drag.mode === 'brush') {
      const q = this.clampPt(p);
      this.paint(drag.last, q);
      drag.last = q;
      this.hover = q;
      return;
    }
    if (drag.mode === 'vertex') {
      const q = this.clampPt(p);
      act.mutatePoints(drag.ref, (pts) => {
        if (pts[drag.index]) pts[drag.index] = q;
      });
      return;
    }
    if (drag.mode === 'label') {
      const doc = docNow();
      const limX = drag.ref.kind === 'region' ? mapW(doc) : RANGES.labelOffset;
      const limY = drag.ref.kind === 'region' ? mapH(doc) : RANGES.labelOffset;
      const nx = Math.round(clamp(drag.dx + p.x - drag.start.x, -limX, limX));
      const ny = Math.round(clamp(drag.dy + p.y - drag.start.y, -limY, limY));
      act.patchItem(drag.ref, { labelDx: nx, labelDy: ny });
      return;
    }
    if (drag.mode === 'move') {
      act.moveItem(drag.ref, drag.orig, p.x - drag.start.x, p.y - drag.start.y);
    }
  }

  private onUp(e: PointerEvent, cancel = false): void {
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) this.selBeforeTouch = undefined;
    const tap = this.pendingTap;
    if (tap && tap.id === e.pointerId) {
      this.pendingTap = null;
      if (!cancel) tap.run();
    }
    const drag = this.drag;
    if (!drag) return;
    if (drag.mode === 'pinch') {
      if (this.pointers.size < 2) this.drag = null;
      return;
    }
    this.drag = null;
    if (this.canvas?.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (drag.mode === 'pan') {
      this.dirty();
      return;
    }
    if (drag.mode === 'brush') {
      this.brushDerived = null;
      if (!cancel && (drag.changed || drag.turnOnDetails)) {
        const terrain = encodeCells(drag.grid.terrain);
        const ground = encodeCells(drag.grid.ground);
        useDoc.getState().update((d) => {
          d.terrain = terrain;
          d.ground = ground;
          if (drag.turnOnDetails) d.settings.details = true;
        });
      }
      this.dirty();
      return;
    }
    if (cancel) {
      useDoc.getState().replace(drag.before);
      useDoc.endGesture();
      return;
    }
    if (drag.mode === 'vertex' && !drag.inserted) {
      /* 沒怎麼動（畫面上不到 3 px）：當成點一下，不算改了形狀；記下來給按兩下刪點用 */
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      if (moved < 3) {
        useDoc.getState().replace(drag.before);
        this.lastVertexClick = {
          ref: drag.ref,
          index: drag.index,
          x: e.clientX,
          y: e.clientY,
          t: performance.now(),
        };
      }
    }
    useDoc.endGesture();
  }

  /** 取消拖曳並還原；clearPointers＝false 時留著按著的手指（變成兩指縮放時） */
  private cancelDrag(clearPointers = true): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (clearPointers) {
      this.pointers.clear();
      this.pendingTap = null;
    }
    if (drag.mode === 'brush') {
      this.brushDerived = null;
      this.dirty();
      return;
    }
    if (drag.mode === 'move' || drag.mode === 'label' || drag.mode === 'vertex') {
      useDoc.getState().replace(drag.before);
      useDoc.endGesture();
    }
  }

  private onDblClick(e: MouseEvent): void {
    if (performance.now() < this.suppressDblUntil) return;
    if (this.draft.length) {
      this.finishDraft();
      return;
    }
    const st = useEditor.getState();
    if (!st.sel || st.tool !== 'select' || st.audience !== 'gm') return;
    const last = this.lastVertexClick;
    this.lastVertexClick = null;
    const s = this.local(e);
    const hit = this.hitTest(this.toMap(s.x, s.y));
    if (hit?.kind === 'handle') act.deleteVertex(st.sel, hit.index);
    else if (last && last.ref.id === st.sel.id && performance.now() - last.t < 500)
      act.deleteVertex(st.sel, last.index);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), this.local(e));
  }

  setSpace(down: boolean): void {
    this.spaceDown = down;
    this.dirty();
  }

  /* ---------- 筆刷 ---------- */

  private paint(a: Pt, b: Pt): void {
    const drag = this.drag;
    if (drag?.mode !== 'brush') return;
    const doc = docNow();
    const st = useEditor.getState();
    const prefs = usePrefs.getState().data;
    const action = st.tool === 'erase' ? 'sea' : st.tool === 'relief' ? 'relief' : prefs.paint;
    if (brushStroke(drag.grid, a, b, prefs.brush, action, doc.drawMode)) {
      drag.changed = true;
      this.brushDerived = null;
    }
    this.dirty();
  }

  /* ---------- 重畫 ---------- */

  dirty(): void {
    if (this.raf || !this.ctx) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  /** 目前畫面上的地形（一筆的過程中是工作用的格子） */
  private derivedNow(doc: WorldDoc): Derived {
    const drag = this.drag;
    if (drag?.mode === 'brush') {
      if (!this.brushDerived) this.brushDerived = deriveGrid(drag.grid, doc.drawMode, doc.seed);
      return this.brushDerived;
    }
    return deriveDoc(doc, () => this.gridNow());
  }

  /** 顯示用的文件（一筆的過程中，森林與山的圖案先打開） */
  private shownDoc(doc: WorldDoc): WorldDoc {
    const drag = this.drag;
    if (drag?.mode === 'brush' && drag.turnOnDetails)
      return { ...doc, settings: { ...doc.settings, details: true } };
    return doc;
  }

  private layers(doc: WorldDoc, d: Derived): LayerCache {
    const brushing = this.drag?.mode === 'brush';
    const raw = this.view.zoom * this.view.dpr * (brushing ? 0.65 : 1);
    const scale = clamp(Math.ceil(raw * 2) / 2, 0.5, 2);
    const key = `${serialOf(d)}|${doc.theme}|${doc.seed}|${doc.settings.details}|${scale}`;
    if (this.cache?.key === key) return this.cache;
    const W = mapW(doc);
    const H = mapH(doc);
    const make = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale);
      c.height = Math.round(H * scale);
      return c;
    };
    const ground = this.cache?.ground.width === Math.round(W * scale) ? this.cache.ground : make();
    const g = ground.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ground.width, ground.height);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    drawGround(g, doc, d, scale);
    let relief: HTMLCanvasElement | null = null;
    if (doc.settings.details) {
      relief =
        this.cache?.relief && this.cache.relief.width === ground.width ? this.cache.relief : make();
      const r = relief.getContext('2d')!;
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.clearRect(0, 0, relief.width, relief.height);
      r.setTransform(scale, 0, 0, scale, 0, 0);
      drawRelief(r, doc, d, false);
    }
    this.cache = { key, ground, relief };
    return this.cache;
  }

  render(): void {
    const ctx = this.ctx;
    const c = this.canvas;
    if (!ctx || !c) return;
    const doc = this.shownDoc(docNow());
    const st = useEditor.getState();
    const { zoom, ox, oy, dpr } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const d = this.derivedNow(doc);
    const L = this.layers(doc, d);
    const W = mapW(doc);
    const H = mapH(doc);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * ox, dpr * oy);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(L.ground, 0, 0, W, H);
    drawRegions(ctx, doc, d);
    if (L.relief) ctx.drawImage(L.relief, 0, 0, W, H);
    drawRegionWalls(ctx, doc, d);
    drawGridOverlay(ctx, doc);
    drawUpper(ctx, doc, d, st.audience, Math.min(2, zoom * dpr));
    this.drawOverlay(ctx, doc, d);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, doc: WorldDoc, d: Derived): void {
    const st = useEditor.getState();
    const { zoom } = this.view;
    const px = 1 / zoom;
    ctx.save();
    /* 選取 */
    if (st.sel && st.audience === 'gm') {
      const pts = this.pointsOf(doc, st.sel);
      ctx.lineWidth = 2 * px;
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeStyle = SEL;
      if (pts) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          if (i) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        });
        if (st.sel.kind === 'region') ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        if (pts.length < LIMITS.points) {
          const count = st.sel.kind === 'region' ? pts.length : pts.length - 1;
          for (let i = 0; i < count; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
            ctx.beginPath();
            ctx.arc((a.x + b.x) / 2, (a.y + b.y) / 2, INSERT_R * px, 0, Math.PI * 2);
            ctx.fillStyle = SEL;
            ctx.fill();
            ctx.lineWidth = 1.5 * px;
            ctx.strokeStyle = SEL_DARK;
            ctx.stroke();
          }
        }
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, HANDLE_R * px, 0, Math.PI * 2);
          ctx.fillStyle = '#fff6da';
          ctx.fill();
          ctx.lineWidth = 2 * px;
          ctx.strokeStyle = SEL_DARK;
          ctx.stroke();
        }
      } else if (st.sel.kind === 'object') {
        const o = doc.objects.find((v) => v.id === st.sel!.id);
        if (o) {
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.size * 0.7 + 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (st.sel.kind === 'note') {
        const q = this.noteQuad(doc, st.sel.id);
        if (q.length) {
          ctx.beginPath();
          q.forEach((p, i) => {
            if (i) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }
    /* 畫到一半的線 */
    if (this.draft.length) {
      const region = st.tool === 'region';
      ctx.beginPath();
      this.draft.forEach((p, i) => {
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      if (region && this.draft.length > 2) {
        ctx.fillStyle = 'rgba(214,191,139,0.16)';
        ctx.fill();
      }
      ctx.strokeStyle = '#eed093';
      ctx.lineWidth = 3 * px;
      ctx.setLineDash([8 * px, 4 * px]);
      ctx.stroke();
      if (this.hover) {
        const last = this.draft[this.draft.length - 1];
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(this.hover.x, this.hover.y);
        ctx.lineWidth = 2 * px;
        ctx.setLineDash([5 * px, 5 * px]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const p of this.draft) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * px, 0, Math.PI * 2);
        ctx.fillStyle = '#f6d998';
        ctx.fill();
        ctx.lineWidth = 1 * px;
        ctx.strokeStyle = '#604e2f';
        ctx.stroke();
      }
    }
    /* 筆刷的範圍、素材的預覽 */
    const hover = this.hover;
    if (hover && st.audience === 'gm' && !this.spaceDown && this.drag?.mode !== 'pan') {
      const size = usePrefs.getState().data.brush;
      if (BRUSH_TOOLS.includes(st.tool)) {
        ctx.beginPath();
        if (doc.drawMode === 'grid') {
          const b = brushBox(hover, size);
          ctx.roundRect(b.x, b.y, b.w, b.h, 8);
        } else ctx.arc(hover.x, hover.y, (size * CELL) / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.fill();
        ctx.strokeStyle = '#fffbd6';
        ctx.lineWidth = 2 * px;
        ctx.stroke();
      } else if (st.tool === 'asset' && !this.drag && assetDef(st.asset)) {
        ctx.save();
        ctx.globalAlpha = 0.65;
        ctx.translate(hover.x, hover.y);
        ctx.scale(0.8, 0.8);
        drawAsset(ctx, st.asset, {
          theme: doc.theme,
          climate: d.climate(hover.x, hover.y),
          dock: dockOf(d.grid, { kind: st.asset, dock: 'auto', x: hover.x, y: hover.y }),
        });
        ctx.restore();
      }
    }
    ctx.restore();
    /* 地圖的外緣（畫面上地圖以外的部分） */
    ctx.save();
    ctx.strokeStyle = THEMES[doc.theme].coast;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = px;
    ctx.strokeRect(0, 0, mapW(doc), mapH(doc));
    ctx.restore();
  }
}

export const editor = new WorldController();
