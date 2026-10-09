/**
 * 編輯畫布：視角（倍率、平移）、指標操作（各工具）、點選測試、畫面（地圖＋選取、控制點、預覽）。
 * React 只負責外框；畫布的事件與重畫都在這裡，避免每次移動滑鼠都重新渲染元件。
 */

import { labelLayout, textBox } from '../draw/labels';
import { drawFloor, drawItem, drawOpening, lineWidthFor } from '../draw/render';
import { getTheme, roomFill } from '../draw/themes';
import { ASSET } from '../model/assets';
import { CELL_M, ROOM_PRESETS } from '../model/catalog';
import {
  clamp,
  metersText,
  meterText,
  openingRect,
  pingText,
  rectContains,
  round2,
  type ShownFloor,
  snap,
  uid,
  visibleFloor,
} from '../model/geometry';
import { type AnyObj, getObj, movable } from '../model/ops';
import {
  axisLock,
  type ItemGhost,
  itemGhost,
  magnet,
  type OpeningGhost,
  snapOpening,
  snapWallPoint,
} from '../model/snap';
import {
  type Floor,
  type Item,
  OBJ_TYPES,
  type ObjType,
  type Opening,
  type Project,
  type Rect,
  type Room,
  type SelRef,
  type TextLabel,
  TYPE_KEY,
  type Wall,
} from '../model/types';
import { type WallRun, wallLines } from '../model/walls';
import { S } from '../strings';
import * as act from './actions';
import { currentFloor, setEditor, useEditor, usePrefs, useProject } from './store';

export const ZOOM_MIN = 3;
export const ZOOM_MAX = 140;
/** 100% 的倍率（每格 px） */
export const ZOOM_BASE = 24;
const HANDLE = 7;
const SEL = '#2f7cf6';

type P = { x: number; y: number };
type Handle = { id: string; x: number; y: number; cursor: string; round?: boolean };

type Drag =
  | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number; button: number; moved: boolean }
  | {
      mode: 'pinch';
      dist: number;
      zoom: number;
      mid: { sx: number; sy: number };
      ox: number;
      oy: number;
      moved: boolean;
    }
  | {
      mode: 'move';
      start: P;
      sx: number;
      sy: number;
      entries: { type: ObjType; id: string; orig: AnyObj }[];
      step: number;
      moved: boolean;
      before: Project;
    }
  | {
      mode: 'resize';
      type: ObjType;
      id: string;
      handle: string;
      orig: AnyObj;
      cursor: string;
      moved: boolean;
      before: Project;
    }
  | { mode: 'label'; id: string; start: P; lx: number; ly: number; moved: boolean; before: Project }
  | { mode: 'marquee'; start: P; add: boolean; base: SelRef[]; rect: Rect | null; moved: boolean }
  | { mode: 'room'; a: P; sx: number; sy: number; rect: Rect | null; moved: boolean }
  | { mode: 'wall'; a: P; b: P | null; moved: boolean }
  | { mode: 'erase'; moved: boolean; before: Project };

const CURSORS: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

const sameRef = (a: SelRef | null, b: SelRef | null) => a?.type === b?.type && a?.id === b?.id;

export class EditorController {
  canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private measureCtx: CanvasRenderingContext2D | null = null;
  private wrap: HTMLElement | null = null;
  private miniBar: HTMLElement | null = null;
  readonly view = { zoom: ZOOM_BASE, ox: 80, oy: 40, w: 0, h: 0, dpr: 1 };
  private drag: Drag | null = null;
  private hover: SelRef | null = null;
  private pointer: { sx: number; sy: number } | null = null;
  private ghostOpening: OpeningGhost | null = null;
  private ghostItem: ItemGhost | null = null;
  private spaceDown = false;
  private pointers = new Map<number, { sx: number; sy: number }>();
  private dirty = false;
  private linesCache: { floor: Floor; lines: WallRun[] } | null = null;
  private unsubs: (() => void)[] = [];
  private ro: ResizeObserver | null = null;
  /** 從素材面板拖過來的家具或房間 */
  dragAsset: { kind: 'item'; t: string } | { kind: 'room'; preset: string } | null = null;

  /* ---------- 掛上、拿掉 ---------- */

  attach(canvas: HTMLCanvasElement, wrap: HTMLElement): void {
    this.detach();
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext('2d');
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.unsubs.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(canvas, 'pointerdown', (e) => this.onPointerDown(e));
    on(canvas, 'pointermove', (e) => this.onPointerMove(e));
    on(canvas, 'pointerup', (e) => this.onPointerUp(e));
    on(canvas, 'pointercancel', (e) => this.onPointerCancel(e));
    on(canvas, 'pointerleave', () => this.onPointerLeave());
    on(canvas, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(canvas, 'dblclick', (e) => this.onDoubleClick(e));
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(wrap, 'dragover', (e) => this.onDragOver(e));
    on(wrap, 'dragleave', (e) => {
      if (!wrap.contains(e.relatedTarget as Node | null)) {
        this.ghostItem = null;
        wrap.dataset.dropping = 'false';
        this.requestRender();
      }
    });
    on(wrap, 'drop', (e) => this.onDrop(e));
    const blur = () => {
      this.spaceDown = false;
      this.updateCursor();
    };
    window.addEventListener('blur', blur);
    this.unsubs.push(() => window.removeEventListener('blur', blur));
    this.unsubs.push(useProject.subscribe(() => this.onDataChange()));
    this.unsubs.push(usePrefs.subscribe(() => this.requestRender()));
    this.unsubs.push(
      useEditor.subscribe((s, prev) => {
        if (s.tool !== prev.tool || s.armed !== prev.armed) this.onToolChange();
        this.requestRender();
      }),
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(wrap);
    }
    this.resize();
    this.fitView();
  }

  detach(): void {
    for (const u of this.unsubs.splice(0)) u();
    this.ro?.disconnect();
    this.ro = null;
    this.canvas = null;
    this.ctx = null;
    this.wrap = null;
  }

  setMiniBar(el: HTMLElement | null): void {
    this.miniBar = el;
    this.requestRender();
  }

  /* ---------- 座標 ---------- */

  toWorld(sx: number, sy: number): P {
    return { x: (sx - this.view.ox) / this.view.zoom, y: (sy - this.view.oy) / this.view.zoom };
  }

  toScreen(x: number, y: number): P {
    return { x: x * this.view.zoom + this.view.ox, y: y * this.view.zoom + this.view.oy };
  }

  private eventPos(e: { clientX: number; clientY: number }) {
    const r = this.canvas?.getBoundingClientRect();
    return { sx: e.clientX - (r?.left ?? 0), sy: e.clientY - (r?.top ?? 0) };
  }

  /** 螢幕座標（例如拖放的位置）→ 世界座標 */
  clientToWorld(clientX: number, clientY: number): P {
    const { sx, sy } = this.eventPos({ clientX, clientY });
    return this.toWorld(sx, sy);
  }

  resize(): void {
    if (!this.wrap || !this.canvas) return;
    const r = this.wrap.getBoundingClientRect();
    const pw = this.view.w;
    const ph = this.view.h;
    this.view.w = Math.max(1, r.width);
    this.view.h = Math.max(1, r.height);
    this.view.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.view.w * this.view.dpr);
    this.canvas.height = Math.round(this.view.h * this.view.dpr);
    if (pw && ph) {
      this.view.ox += (this.view.w - pw) / 2;
      this.view.oy += (this.view.h - ph) / 2;
    }
    this.requestRender();
  }

  /** 所有樓層都放進畫面（換樓層時圖不會跳） */
  fitView(): void {
    if (!this.view.w) return;
    const p = useProject.getState().data;
    let box: Rect | null = null;
    for (const f of p.floors) {
      const b = act.floorBox(f);
      if (!b) continue;
      if (!box) box = { ...b };
      else {
        const x2 = Math.max(box.x + box.w, b.x + b.w);
        const y2 = Math.max(box.y + box.h, b.y + b.h);
        box.x = Math.min(box.x, b.x);
        box.y = Math.min(box.y, b.y);
        box.w = x2 - box.x;
        box.h = y2 - box.y;
      }
    }
    const b = box ?? { x: 0, y: 0, w: 24, h: 16 };
    const padL = 60;
    const padR = 20;
    const padT = 44;
    const padB = 52;
    const aw = Math.max(80, this.view.w - padL - padR);
    const ah = Math.max(80, this.view.h - padT - padB);
    this.view.zoom = clamp(Math.min(aw / Math.max(b.w, 4), ah / Math.max(b.h, 4)), ZOOM_MIN, 64);
    this.view.ox = padL + (aw - b.w * this.view.zoom) / 2 - b.x * this.view.zoom;
    this.view.oy = padT + (ah - b.h * this.view.zoom) / 2 - b.y * this.view.zoom;
    this.syncZoom();
    this.requestRender();
  }

  /** 新地圖：100%、左上留一點空間 */
  resetView(): void {
    this.view.zoom = ZOOM_BASE;
    this.view.ox = 80;
    this.view.oy = 48;
    this.syncZoom();
    this.requestRender();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const next = clamp(this.view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const w = this.toWorld(sx, sy);
    this.view.zoom = next;
    this.view.ox = sx - w.x * next;
    this.view.oy = sy - w.y * next;
    this.syncZoom();
    this.requestRender();
  }

  zoomBy(factor: number): void {
    this.zoomAt(this.view.w / 2, this.view.h / 2, factor);
  }

  private syncZoom(): void {
    const pct = Math.round((this.view.zoom / ZOOM_BASE) * 100);
    if (useEditor.getState().zoomPct !== pct) setEditor({ zoomPct: pct });
  }

  /* ---------- 資料 ---------- */

  private shownFloor(): ShownFloor {
    const pv = useEditor.getState().playerView;
    return visibleFloor(currentFloor(), pv, !usePrefs.getState().data.showClues);
  }

  private wallLines(): WallRun[] {
    const f = currentFloor();
    if (this.linesCache?.floor === f) return this.linesCache.lines;
    const lines = wallLines(f);
    this.linesCache = { floor: f, lines };
    return lines;
  }

  private onDataChange(): void {
    act.dropMissingSelection();
    this.requestRender();
  }

  private onToolChange(): void {
    this.ghostItem = null;
    this.ghostOpening = null;
    this.hover = null;
    if (this.pointer) this.pointerHover(this.pointer.sx, this.pointer.sy, null);
    act.updateHint(false);
    this.updateCursor();
  }

  private mctx(): CanvasRenderingContext2D | null {
    if (this.ctx) return this.ctx;
    if (!this.measureCtx && typeof document !== 'undefined')
      this.measureCtx = document.createElement('canvas').getContext('2d');
    return this.measureCtx;
  }

  private font(): string {
    return getTheme(useProject.getState().data.theme).font;
  }

  /** 東西的範圍（選取框、範圍選取用） */
  objBounds(type: ObjType, o: AnyObj): Rect {
    if (type === 'room' || type === 'item') {
      const r = o as Room;
      return { x: r.x, y: r.y, w: r.w, h: r.h };
    }
    if (type === 'opening') return openingRect(o as Opening, 0.3);
    if (type === 'wall') {
      const w = o as Wall;
      return {
        x: Math.min(w.x1, w.x2) - 0.15,
        y: Math.min(w.y1, w.y2) - 0.15,
        w: Math.abs(w.x2 - w.x1) + 0.3,
        h: Math.abs(w.y2 - w.y1) + 0.3,
      };
    }
    const c = this.mctx();
    const t = o as TextLabel;
    return c ? textBox(c, t, this.font()) : { x: t.x - 2, y: t.y - 0.5, w: 4, h: 1 };
  }

  selectionBounds(): Rect | null {
    const f = currentFloor();
    let box: Rect | null = null;
    for (const s of useEditor.getState().sel) {
      const o = getObj(f, s.type, s.id);
      if (!o) continue;
      const b = this.objBounds(s.type, o);
      if (!box) box = { ...b };
      else {
        const x2 = Math.max(box.x + box.w, b.x + b.w);
        const y2 = Math.max(box.y + box.h, b.y + b.h);
        box.x = Math.min(box.x, b.x);
        box.y = Math.min(box.y, b.y);
        box.w = x2 - box.x;
        box.h = y2 - box.y;
      }
    }
    return box;
  }

  /* ---------- 點選測試 ---------- */

  /**
   * 指到的東西：文字 → 門窗 → 家具（一般的在上，地毯之類在下；後放的優先）→ 手畫的牆 → 房間（面積最小的，一樣大時後放的）。
   * 很小的家具（畫面上不到 12 px）四周放寬幾 px。
   */
  hitTest(wx: number, wy: number, opts: { skipRooms?: boolean } = {}): SelRef | null {
    const f = this.shownFloor();
    const tol = 5 / this.view.zoom;
    const inRect = (r: Rect, pad = 0) =>
      wx >= r.x - pad && wx <= r.x + r.w + pad && wy >= r.y - pad && wy <= r.y + r.h + pad;
    const c = this.mctx();
    for (let i = f.texts.length - 1; i >= 0; i--) {
      const t = f.texts[i];
      const box = c ? textBox(c, t, this.font()) : { x: t.x - 2, y: t.y - 0.5, w: 4, h: 1 };
      if (inRect(box, tol)) return { type: 'text', id: t.id };
    }
    for (let i = f.openings.length - 1; i >= 0; i--) {
      const o = f.openings[i];
      const along = (o.o === 'h' ? wx : wy) - (o.o === 'h' ? o.x : o.y);
      const across = (o.o === 'h' ? wy : wx) - (o.o === 'h' ? o.y : o.x);
      if (along >= -tol && along <= o.len + tol && Math.abs(across) <= Math.max(0.32, tol * 1.4))
        return { type: 'opening', id: o.id };
    }
    const under = (it: Item) => Boolean(ASSET[it.t]?.under);
    for (const group of [f.items.filter((i) => !under(i)), f.items.filter(under)])
      for (let i = group.length - 1; i >= 0; i--) {
        const it = group[i];
        const pad = Math.min(it.w, it.h) * this.view.zoom < 12 ? tol : 0;
        if (inRect(it, pad)) return { type: 'item', id: it.id };
      }
    for (let i = f.walls.length - 1; i >= 0; i--) {
      const w = f.walls[i];
      if (segDist(wx, wy, w) <= Math.max(0.25, tol)) return { type: 'wall', id: w.id };
    }
    if (opts.skipRooms) return null;
    let best: { id: string; area: number; index: number } | null = null;
    f.rooms.forEach((r, index) => {
      if (!inRect(r)) return;
      const area = r.w * r.h;
      if (!best || area < best.area || (area === best.area && index > best.index))
        best = { id: r.id, area, index };
    });
    return best ? { type: 'room', id: (best as { id: string }).id } : null;
  }

  private labelOpts() {
    const p = useProject.getState().data;
    return {
      playerView: useEditor.getState().playerView,
      showSize: p.showSize,
      hideNames: p.showNames === false,
    };
  }

  /** 選取一個東西時的控制點（螢幕座標） */
  handles(): Handle[] {
    const { sel, tool } = useEditor.getState();
    if (sel.length !== 1 || tool !== 'select') return [];
    const { type, id } = sel[0];
    const obj = getObj(currentFloor(), type, id);
    if (!obj) return [];
    const out: Handle[] = [];
    const labelHandle = (room: Room) => {
      if (room.hideLabel) return;
      const c = this.mctx();
      const m = c
        ? labelLayout(c, room, this.labelOpts(), getTheme(useProject.getState().data.theme))
        : null;
      if (!m) return;
      const p = this.toScreen(m.box.x + m.box.w, m.box.y + m.box.h / 2);
      out.push({ id: 'label', x: p.x + 9, y: p.y, cursor: 'move', round: true });
    };
    if (type === 'room' && (obj as Room).locked) labelHandle(obj as Room);
    else if (type === 'room' || type === 'item') {
      const r = obj as Room;
      const a = this.toScreen(r.x, r.y);
      const b = this.toScreen(r.x + r.w, r.y + r.h);
      const g = 5;
      const x1 = a.x - g;
      const y1 = a.y - g;
      const x2 = b.x + g;
      const y2 = b.y + g;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const small = b.x - a.x < 30 || b.y - a.y < 30;
      const pts: [string, number, number][] = [
        ['nw', x1, y1],
        ['ne', x2, y1],
        ['se', x2, y2],
        ['sw', x1, y2],
      ];
      if (!small) pts.push(['n', cx, y1], ['e', x2, cy], ['s', cx, y2], ['w', x1, cy]);
      for (const [hid, x, y] of pts) out.push({ id: hid, x, y, cursor: CURSORS[hid] });
      if (type === 'room') labelHandle(r);
    } else if (type === 'opening') {
      const o = obj as Opening;
      const a = this.toScreen(o.x, o.y);
      const b = o.o === 'h' ? this.toScreen(o.x + o.len, o.y) : this.toScreen(o.x, o.y + o.len);
      const cursor = o.o === 'h' ? 'ew-resize' : 'ns-resize';
      out.push({ id: 'a', x: a.x, y: a.y, cursor }, { id: 'b', x: b.x, y: b.y, cursor });
    } else if (type === 'wall') {
      const w = obj as Wall;
      const a = this.toScreen(w.x1, w.y1);
      const b = this.toScreen(w.x2, w.y2);
      out.push(
        { id: 'a', x: a.x, y: a.y, cursor: 'move' },
        { id: 'b', x: b.x, y: b.y, cursor: 'move' },
      );
    }
    return out;
  }

  private handleAt(sx: number, sy: number): Handle | null {
    return (
      this.handles().find((h) => Math.abs(h.x - sx) <= HANDLE && Math.abs(h.y - sy) <= HANDLE) ??
      null
    );
  }

  /* ---------- 重畫 ---------- */

  requestRender(): void {
    if (this.dirty || typeof requestAnimationFrame === 'undefined') return;
    this.dirty = true;
    requestAnimationFrame(() => this.render());
  }

  render(): void {
    this.dirty = false;
    const c = this.ctx;
    if (!c || !this.canvas) return;
    const p = useProject.getState().data;
    const prefs = usePrefs.getState().data;
    const ed = useEditor.getState();
    const theme = getTheme(p.theme);
    const { zoom: z, dpr, ox, oy } = this.view;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
    const viewRect = { x: -ox / z, y: -oy / z, w: this.view.w / z, h: this.view.h / z };
    const ghost = prefs.ghost && p.active > 0 ? p.floors[p.active - 1] : null;
    drawFloor(c, currentFloor(), {
      theme,
      zoom: z,
      showSize: p.showSize,
      hideNames: p.showNames === false,
      playerView: ed.playerView,
      hideClues: !prefs.showClues,
      editor: true,
      grid: prefs.grid,
      viewRect,
      ghost,
    });
    this.drawOverlays(c);
    if (!ed.playerView) {
      c.save();
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalAlpha = 0.4;
      c.font = '900 24px system-ui, sans-serif';
      c.textBaseline = 'top';
      c.fillStyle = theme.gm;
      c.fillText(S.badgeGm, 60, 12);
      c.restore();
    }
    if (this.wrap) this.wrap.style.background = theme.bg;
    this.positionMiniBar();
  }

  private outline(c: CanvasRenderingContext2D, r: Rect, width: number, dash = false): void {
    const px = 1 / this.view.zoom;
    c.save();
    c.lineWidth = (width + 2) * px;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.strokeRect(r.x, r.y, r.w, r.h);
    c.lineWidth = width * px;
    c.strokeStyle = SEL;
    if (dash) c.setLineDash([4 * px, 3 * px]);
    c.strokeRect(r.x, r.y, r.w, r.h);
    c.restore();
  }

  private objOutline(
    c: CanvasRenderingContext2D,
    type: ObjType,
    obj: AnyObj,
    width: number,
    dash = false,
  ): void {
    if (type === 'wall') {
      const w = obj as Wall;
      const px = 1 / this.view.zoom;
      c.save();
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = Math.max(0.36, (width + 8) * px);
      c.beginPath();
      c.moveTo(w.x1, w.y1);
      c.lineTo(w.x2, w.y2);
      c.stroke();
      c.strokeStyle = SEL;
      c.globalAlpha = 0.55;
      c.lineWidth = Math.max(0.3, (width + 5) * px);
      c.stroke();
      c.restore();
      return;
    }
    this.outline(c, this.objBounds(type, obj), width, dash);
  }

  /** 畫面上固定大小的說明小標籤（尺寸讀數） */
  private screenLabel(c: CanvasRenderingContext2D, text: string, sx: number, sy: number): void {
    const { dpr } = this.view;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.font = '700 12px system-ui, sans-serif';
    const w = c.measureText(text).width + 14;
    const x = clamp(sx - w / 2, 4, this.view.w - w - 4);
    const y = clamp(sy, 4, this.view.h - 26);
    c.fillStyle = 'rgba(28, 38, 54, 0.9)';
    c.beginPath();
    c.roundRect(x, y, w, 22, 11);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    c.fillText(text, x + 7, y + 11.5);
    c.restore();
  }

  private drawOverlays(c: CanvasRenderingContext2D): void {
    const px = 1 / this.view.zoom;
    const f = currentFloor();
    const p = useProject.getState().data;
    const theme = getTheme(p.theme);
    const ed = useEditor.getState();
    /* GM 筆記的標記（GM 檢視） */
    if (!ed.playerView)
      for (const r of f.rooms) {
        if (!r.note) continue;
        const s = Math.min(0.55, r.w * 0.2, r.h * 0.2);
        const x = r.x + r.w - s - 0.22;
        const y = r.y + 0.22;
        c.save();
        c.fillStyle = theme.gm;
        c.globalAlpha = 0.9;
        c.beginPath();
        c.roundRect(x, y, s, s * 1.15, s * 0.12);
        c.fill();
        c.strokeStyle = theme.bg === 'transparent' ? '#fff' : theme.bg;
        c.lineWidth = s * 0.1;
        c.beginPath();
        for (const [k, e] of [
          [0.36, 0.78],
          [0.6, 0.78],
          [0.84, 0.6],
        ] as const) {
          c.moveTo(x + s * 0.22, y + s * k);
          c.lineTo(x + s * e, y + s * k);
        }
        c.stroke();
        c.restore();
      }
    /* 鎖定的房間：左上角一個鎖 */
    for (const r of f.rooms) {
      if (!r.locked || (ed.playerView && r.gm)) continue;
      const s = Math.min(0.55, r.w * 0.2, r.h * 0.2);
      const x = r.x + 0.22;
      const y = r.y + 0.22;
      c.save();
      c.strokeStyle = theme.label;
      c.fillStyle = theme.label;
      c.globalAlpha = 0.75;
      c.lineWidth = s * 0.14;
      c.beginPath();
      c.arc(x + s / 2, y + s * 0.45, s * 0.26, Math.PI, 0);
      c.stroke();
      c.beginPath();
      c.roundRect(x + s * 0.1, y + s * 0.5, s * 0.8, s * 0.62, s * 0.1);
      c.fill();
      c.restore();
    }
    const d = this.drag;
    if (this.hover && !d && ed.tool === 'select' && !ed.sel.some((s) => sameRef(s, this.hover))) {
      const obj = getObj(f, this.hover.type, this.hover.id);
      if (obj) {
        c.save();
        c.globalAlpha = 0.55;
        this.objOutline(c, this.hover.type, obj, 1.2);
        c.restore();
      }
    }
    if (ed.tool === 'eraser' && this.hover) {
      const obj = getObj(f, this.hover.type, this.hover.id);
      if (obj) {
        const b = this.objBounds(this.hover.type, obj);
        c.save();
        c.fillStyle = 'rgba(207, 61, 61, 0.14)';
        c.fillRect(b.x, b.y, b.w, b.h);
        c.strokeStyle = '#cf3d3d';
        c.lineWidth = 1.5 * px;
        c.strokeRect(b.x, b.y, b.w, b.h);
        c.restore();
      }
    }
    for (const s of ed.sel) {
      const obj = getObj(f, s.type, s.id);
      if (!obj) continue;
      if (s.type === 'room') {
        const r = obj as Room;
        c.save();
        c.fillStyle = 'rgba(47, 124, 246, 0.07)';
        c.fillRect(r.x, r.y, r.w, r.h);
        c.restore();
      }
      this.objOutline(c, s.type, obj, 1.6);
    }
    const hs = d && d.mode !== 'resize' && d.mode !== 'label' ? [] : this.handles();
    if (hs.length) {
      const { dpr } = this.view;
      c.save();
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const h of hs) {
        c.fillStyle = '#ffffff';
        c.strokeStyle = SEL;
        c.lineWidth = 1.5;
        c.beginPath();
        if (h.round) {
          c.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.beginPath();
          c.moveTo(h.x - 3, h.y);
          c.lineTo(h.x + 3, h.y);
          c.moveTo(h.x, h.y - 3);
          c.lineTo(h.x, h.y + 3);
          c.stroke();
        } else {
          c.rect(h.x - 3.5, h.y - 3.5, 7, 7);
          c.fill();
          c.stroke();
        }
      }
      c.restore();
    }
    if (d?.mode === 'room' && d.rect) {
      const r = d.rect;
      const armed = ed.armed;
      const cat = armed?.kind === 'room' ? ROOM_PRESETS[armed.preset].cat : 'living';
      c.save();
      c.fillStyle = roomFill(theme, { cat });
      c.globalAlpha = 0.85;
      c.fillRect(r.x, r.y, r.w, r.h);
      c.globalAlpha = 1;
      c.strokeStyle = SEL;
      c.lineWidth = 2 * px;
      c.setLineDash([5 * px, 3 * px]);
      c.strokeRect(r.x, r.y, r.w, r.h);
      c.restore();
      const sp = this.toScreen(r.x + r.w / 2, r.y + r.h);
      this.screenLabel(
        c,
        `${metersText(r.w, r.h)} · ${pingText(r.w * r.h * CELL_M * CELL_M)}`,
        sp.x,
        sp.y + 8,
      );
    }
    if (d?.mode === 'wall' && d.b) {
      const t = act.wallKindThickness(ed.armed);
      c.save();
      c.strokeStyle = theme.wall;
      c.globalAlpha = 0.7;
      c.lineCap = 'square';
      c.lineWidth = t;
      c.beginPath();
      c.moveTo(d.a.x, d.a.y);
      c.lineTo(d.b.x, d.b.y);
      c.stroke();
      c.restore();
      const sp = this.toScreen((d.a.x + d.b.x) / 2, (d.a.y + d.b.y) / 2);
      this.screenLabel(
        c,
        `${meterText(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y))}m`,
        sp.x,
        sp.y + 10,
      );
    }
    if (d?.mode === 'marquee' && d.rect) {
      c.save();
      c.fillStyle = 'rgba(47, 124, 246, 0.08)';
      c.fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
      c.strokeStyle = SEL;
      c.lineWidth = px;
      c.setLineDash([4 * px, 3 * px]);
      c.strokeRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
      c.restore();
    }
    if (d?.mode === 'resize') {
      const obj = getObj(f, d.type, d.id);
      if (obj && (d.type === 'room' || d.type === 'item')) {
        const r = obj as Room;
        const sp = this.toScreen(r.x + r.w / 2, r.y + r.h);
        this.screenLabel(c, metersText(r.w, r.h), sp.x, sp.y + 12);
      } else if (obj && d.type === 'opening') {
        const o = obj as Opening;
        const sp = this.toScreen(
          o.o === 'h' ? o.x + o.len / 2 : o.x,
          o.o === 'h' ? o.y : o.y + o.len / 2,
        );
        this.screenLabel(c, `${meterText(o.len)}m`, sp.x, sp.y + 14);
      }
    }
    const go = this.ghostOpening;
    if (go && !d) {
      c.save();
      c.globalAlpha = go.clash ? 0.35 : 0.85;
      c.fillStyle = theme.bg === 'transparent' ? '#ffffff' : theme.bg;
      if (go.o === 'h') c.fillRect(go.x, go.y - go.t / 2 - px, go.len, go.t + px * 2);
      else c.fillRect(go.x - go.t / 2 - px, go.y, go.t + px * 2, go.len);
      const hinge = ed.armed?.kind === 'opening' ? ed.armed.hinge : 0;
      drawOpening(c, { ...go, id: 'ghost', hinge }, go.t, theme, lineWidthFor(this.view.zoom), {
        playerView: false,
        editor: true,
      });
      c.globalAlpha = 1;
      const r = openingRect(go, 0.34);
      c.strokeStyle = go.clash ? '#cf3d3d' : SEL;
      c.lineWidth = 1.5 * px;
      c.setLineDash([4 * px, 3 * px]);
      c.strokeRect(r.x, r.y, r.w, r.h);
      c.restore();
    }
    const gi = this.ghostItem;
    if (gi && !d) {
      c.save();
      c.globalAlpha = 0.72;
      drawItem(c, { ...gi, id: 'ghost' }, theme, lineWidthFor(this.view.zoom), { editor: true });
      c.restore();
      this.outline(c, gi, 1.2, true);
    }
  }

  /** 迷你工具列跟著選取的東西（上方；太靠上時放在下方；看不到時藏起來） */
  private positionMiniBar(): void {
    const el = this.miniBar;
    if (!el) return;
    const ed = useEditor.getState();
    const show = ed.tool === 'select' && ed.sel.length > 0 && !this.drag?.moved;
    const box = show ? this.selectionBounds() : null;
    if (!box) {
      el.hidden = true;
      return;
    }
    const a = this.toScreen(box.x + box.w / 2, box.y);
    const bottom = this.toScreen(box.x, box.y + box.h).y;
    let top = a.y - 12;
    let below = false;
    if (top < 52) {
      top = bottom + 50;
      below = true;
    }
    const half = Math.min(110, (el.offsetWidth || 200) / 2 + 4);
    const x = clamp(a.x, half, Math.max(half, this.view.w - half));
    const y = clamp(top, 46, this.view.h - 8);
    if (below && y > this.view.h - 60) {
      el.hidden = true;
      return;
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.hidden = false;
  }

  /* ---------- 游標 ---------- */

  private updateCursor(handle?: Handle | null): void {
    if (!this.canvas) return;
    const ed = useEditor.getState();
    const d = this.drag;
    let cursor = 'default';
    if (d?.mode === 'pan') cursor = 'grabbing';
    else if (this.spaceDown || ed.tool === 'hand') cursor = 'grab';
    else if (d?.mode === 'move') cursor = 'move';
    else if (d?.mode === 'resize') cursor = d.cursor;
    else if (handle) cursor = handle.cursor;
    else if (ed.tool === 'select') cursor = this.hover ? 'move' : 'default';
    else if (ed.tool === 'text') cursor = 'text';
    else if (ed.tool === 'eraser') cursor = this.hover ? 'pointer' : 'default';
    else if (ed.tool === 'place' || ed.tool === 'door' || ed.tool === 'window') cursor = 'copy';
    else cursor = 'crosshair';
    if (this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }

  setSpace(down: boolean): void {
    if (this.spaceDown === down) return;
    this.spaceDown = down;
    this.updateCursor();
  }

  get dragging(): boolean {
    return !!this.drag;
  }

  /* ---------- 指標 ---------- */

  private beginEdit(): Project {
    act.flushNudge();
    useProject.beginGesture();
    return useProject.getState().data;
  }

  private endEdit(): void {
    useProject.endGesture();
  }

  private onPointerDown(e: PointerEvent): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.focus({ preventScroll: true });
    const { sx, sy } = this.eventPos(e);
    this.pointers.set(e.pointerId, { sx, sy });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 有些瀏覽器不支援 */
    }
    if (this.pointers.size === 2) {
      this.cancelDrag();
      const [p1, p2] = [...this.pointers.values()];
      this.drag = {
        mode: 'pinch',
        dist: Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy) || 1,
        zoom: this.view.zoom,
        mid: { sx: (p1.sx + p2.sx) / 2, sy: (p1.sy + p2.sy) / 2 },
        ox: this.view.ox,
        oy: this.view.oy,
        moved: true,
      };
      return;
    }
    if (this.pointers.size > 2) return;
    const w = this.toWorld(sx, sy);
    const ed = useEditor.getState();
    if (e.button === 1 || e.button === 2 || this.spaceDown || ed.tool === 'hand') {
      e.preventDefault();
      this.drag = {
        mode: 'pan',
        sx,
        sy,
        ox: this.view.ox,
        oy: this.view.oy,
        button: e.button,
        moved: false,
      };
      this.updateCursor();
      return;
    }
    if (e.button !== 0) return;
    switch (ed.tool) {
      case 'select': {
        const hd = this.handleAt(sx, sy);
        if (hd) {
          const { type, id } = ed.sel[0];
          const obj = getObj(currentFloor(), type, id);
          if (!obj) return;
          const before = this.beginEdit();
          if (hd.id === 'label') {
            const r = obj as Room;
            this.drag = {
              mode: 'label',
              id,
              start: w,
              lx: r.lx || 0,
              ly: r.ly || 0,
              moved: false,
              before,
            };
          } else
            this.drag = {
              mode: 'resize',
              type,
              id,
              handle: hd.id,
              orig: structuredClone(obj),
              cursor: hd.cursor,
              moved: false,
              before,
            };
          this.updateCursor();
          return;
        }
        const hit = this.hitTest(w.x, w.y);
        if (hit) {
          if (e.shiftKey) {
            const has = ed.sel.some((s) => sameRef(s, hit));
            setEditor({ sel: has ? ed.sel.filter((s) => !sameRef(s, hit)) : [...ed.sel, hit] });
            return;
          }
          if (!ed.sel.some((s) => sameRef(s, hit))) setEditor({ sel: [hit] });
          const f = currentFloor();
          if (hit.type === 'room' && (getObj(f, 'room', hit.id) as Room).locked) {
            /* 鎖定的房間：只選取；拖曳變成範圍選取 */
            this.drag = {
              mode: 'marquee',
              start: w,
              add: false,
              base: useEditor.getState().sel,
              rect: null,
              moved: false,
            };
            return;
          }
          const sel = useEditor.getState().sel;
          const entries = movable(f, sel, e.altKey).map((s) => ({
            ...s,
            orig: structuredClone(getObj(f, s.type, s.id) as AnyObj),
          }));
          this.drag = {
            mode: 'move',
            start: w,
            sx,
            sy,
            entries,
            step: entries.some((x) => x.type === 'room') ? 1 : 0.25,
            moved: false,
            before: useProject.getState().data,
          };
          this.updateCursor();
          return;
        }
        if (!e.shiftKey && ed.sel.length) setEditor({ sel: [] });
        this.drag = {
          mode: 'marquee',
          start: w,
          add: e.shiftKey,
          base: useEditor.getState().sel,
          rect: null,
          moved: false,
        };
        return;
      }
      case 'room':
        this.drag = {
          mode: 'room',
          a: { x: Math.round(w.x), y: Math.round(w.y) },
          sx,
          sy,
          rect: null,
          moved: false,
        };
        return;
      case 'wall':
        this.drag = { mode: 'wall', a: this.wallPoint(w), b: null, moved: false };
        return;
      case 'door':
      case 'window': {
        const armed = ed.armed;
        if (armed?.kind !== 'opening') return;
        const hit = this.hitTest(w.x, w.y, { skipRooms: true });
        const g = snapOpening(this.wallLines(), currentFloor().openings, w.x, w.y, armed.type);
        if (hit?.type === 'opening' && (!g || g.clash)) {
          act.setTool('select');
          setEditor({ sel: [hit] });
          return;
        }
        if (!g || g.clash) return;
        const o: Opening = {
          id: uid('o'),
          kind: g.kind,
          o: g.o,
          x: g.x,
          y: g.y,
          len: g.len,
          side: g.side,
          hinge: armed.hinge,
        };
        act.addObject('opening', o);
        setEditor({ sel: [{ type: 'opening', id: o.id }] });
        this.pointerHover(sx, sy, e);
        return;
      }
      case 'place': {
        const armed = ed.armed;
        if (armed?.kind !== 'item') return;
        const g = itemGhost(this.wallLines(), w.x, w.y, armed, e.altKey);
        const item: Item = {
          id: uid('i'),
          t: g.t,
          x: round2(g.x),
          y: round2(g.y),
          w: g.w,
          h: g.h,
          rot: g.rot,
        };
        act.addObject('item', item);
        if (e.shiftKey) {
          setEditor({ sel: [{ type: 'item', id: item.id }] });
          this.pointerHover(sx, sy, e);
        } else {
          act.setTool('select');
          setEditor({ sel: [{ type: 'item', id: item.id }] });
        }
        return;
      }
      case 'text': {
        const t: TextLabel = {
          id: uid('t'),
          x: snap(w.x, 0.25),
          y: snap(w.y, 0.25),
          text: S.newText,
          size: 0.7,
        };
        act.addObject('text', t);
        act.setTool('select');
        setEditor({ sel: [{ type: 'text', id: t.id }] });
        act.focusField('text');
        return;
      }
      case 'eraser':
        this.drag = { mode: 'erase', moved: false, before: this.beginEdit() };
        this.eraseAt(w, true);
        return;
    }
  }

  private wallPoint(w: P): P {
    return snapWallPoint(currentFloor(), w.x, w.y, Math.max(0.35, 8 / this.view.zoom));
  }

  private eraseAt(w: P, allowRooms: boolean): void {
    const hit = this.hitTest(w.x, w.y, { skipRooms: !allowRooms });
    if (!hit) return;
    if (hit.type === 'room' && (getObj(currentFloor(), 'room', hit.id) as Room).locked) {
      act.notify(S.msg.lockedSkip, 'warning');
      return;
    }
    act.removeObjects([hit]);
    this.hover = null;
  }

  private onPointerMove(e: PointerEvent): void {
    const { sx, sy } = this.eventPos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { sx, sy });
    this.pointer = { sx, sy };
    const d = this.drag;
    if (d?.mode === 'pinch') {
      if (this.pointers.size < 2) return;
      const [p1, p2] = [...this.pointers.values()];
      const dist = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy) || 1;
      const mid = { sx: (p1.sx + p2.sx) / 2, sy: (p1.sy + p2.sy) / 2 };
      const zoom = clamp(d.zoom * (dist / d.dist), ZOOM_MIN, ZOOM_MAX);
      const wx = (d.mid.sx - d.ox) / d.zoom;
      const wy = (d.mid.sy - d.oy) / d.zoom;
      this.view.zoom = zoom;
      this.view.ox = mid.sx - wx * zoom;
      this.view.oy = mid.sy - wy * zoom;
      this.syncZoom();
      this.requestRender();
      return;
    }
    if (!d) {
      this.pointerHover(sx, sy, e);
      return;
    }
    const w = this.toWorld(sx, sy);
    switch (d.mode) {
      case 'pan':
        if (Math.hypot(sx - d.sx, sy - d.sy) > 3) d.moved = true;
        this.view.ox = d.ox + (sx - d.sx);
        this.view.oy = d.oy + (sy - d.sy);
        break;
      case 'move':
        if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
        if (!d.moved) {
          d.moved = true;
          d.before = this.beginEdit();
        }
        this.dragMove(d, w, e.altKey);
        break;
      case 'resize':
        d.moved = true;
        this.dragResize(d, w, e);
        break;
      case 'label':
        d.moved = true;
        useProject.getState().update((p) => {
          const r = getObj(p.floors[p.active], 'room', d.id) as Room | null;
          if (!r) return;
          const lx = round2(snap(d.lx + w.x - d.start.x, 0.25));
          const ly = round2(snap(d.ly + w.y - d.start.y, 0.25));
          if (lx) r.lx = lx;
          else delete r.lx;
          if (ly) r.ly = ly;
          else delete r.ly;
        });
        break;
      case 'marquee': {
        d.moved = true;
        const x1 = Math.min(d.start.x, w.x);
        const y1 = Math.min(d.start.y, w.y);
        d.rect = { x: x1, y: y1, w: Math.abs(w.x - d.start.x), h: Math.abs(w.y - d.start.y) };
        const f = this.shownFloor();
        const found: SelRef[] = [];
        for (const type of OBJ_TYPES)
          for (const o of f[TYPE_KEY[type]] as AnyObj[]) {
            if (rectContains(d.rect, this.objBounds(type, o))) found.push({ type, id: o.id });
          }
        const merged = d.add
          ? d.base.concat(found.filter((s) => !d.base.some((b) => sameRef(b, s))))
          : found;
        setEditor({ sel: merged });
        break;
      }
      case 'room': {
        if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
        d.moved = true;
        const b = { x: Math.round(w.x), y: Math.round(w.y) };
        d.rect = {
          x: Math.min(d.a.x, b.x),
          y: Math.min(d.a.y, b.y),
          w: Math.max(1, Math.abs(b.x - d.a.x)),
          h: Math.max(1, Math.abs(b.y - d.a.y)),
        };
        break;
      }
      case 'wall': {
        d.moved = true;
        const b = this.wallPoint(w);
        d.b = e.shiftKey ? b : axisLock(d.a, b);
        break;
      }
      case 'erase':
        d.moved = true;
        this.eraseAt(w, false);
        break;
    }
    this.requestRender();
  }

  private dragMove(d: Extract<Drag, { mode: 'move' }>, w: P, alt: boolean): void {
    const dx = snap(w.x - d.start.x, d.step);
    const dy = snap(w.y - d.start.y, d.step);
    const lines = this.wallLines();
    useProject.getState().update((p) => {
      const f = p.floors[p.active];
      if (d.entries.length === 1 && d.entries[0].type === 'opening') {
        /* 只拖一個門窗：重新吸到附近的牆上 */
        const e = d.entries[0];
        const orig = e.orig as Opening;
        const o = getObj(f, 'opening', e.id) as Opening | null;
        if (!o) return;
        const mid =
          orig.o === 'h'
            ? { x: orig.x + orig.len / 2, y: orig.y }
            : { x: orig.x, y: orig.y + orig.len / 2 };
        const g = snapOpening(
          lines,
          f.openings,
          mid.x + (w.x - d.start.x),
          mid.y + (w.y - d.start.y),
          o.kind,
          orig.len,
          o.id,
        );
        if (g && !g.clash) {
          o.o = g.o;
          o.x = g.x;
          o.y = g.y;
          o.len = g.len;
        }
        return;
      }
      if (d.entries.length === 1 && d.entries[0].type === 'item' && !alt) {
        /* 只拖一件家具：貼牆 */
        const e = d.entries[0];
        const orig = e.orig as Item;
        const it = getObj(f, 'item', e.id) as Item | null;
        if (!it) return;
        const r = magnet(lines, { x: orig.x + dx, y: orig.y + dy, w: it.w, h: it.h });
        it.x = round2(r.x);
        it.y = round2(r.y);
        return;
      }
      for (const e of d.entries) {
        const o = getObj(f, e.type, e.id);
        if (!o) continue;
        if (e.type === 'wall') {
          const ow = e.orig as Wall;
          const ww = o as Wall;
          ww.x1 = round2(ow.x1 + dx);
          ww.x2 = round2(ow.x2 + dx);
          ww.y1 = round2(ow.y1 + dy);
          ww.y2 = round2(ow.y2 + dy);
        } else {
          const oo = e.orig as Room;
          const pp = o as Room;
          pp.x = round2(oo.x + dx);
          pp.y = round2(oo.y + dy);
        }
      }
    });
  }

  private dragResize(d: Extract<Drag, { mode: 'resize' }>, w: P, e: PointerEvent): void {
    const wallPt = d.type === 'wall' ? this.wallPoint(w) : null;
    useProject.getState().update((p) => {
      const f = p.floors[p.active];
      const o = getObj(f, d.type, d.id);
      if (!o) return;
      const hd = d.handle;
      if (d.type === 'room' || d.type === 'item') {
        const orig = d.orig as Room;
        const r = o as Room;
        const step = d.type === 'room' ? 1 : e.altKey ? 0.05 : 0.25;
        const min = d.type === 'room' ? 1 : 0.25;
        const s = (v: number) => snap(v, step);
        let x1 = orig.x;
        let y1 = orig.y;
        let x2 = orig.x + orig.w;
        let y2 = orig.y + orig.h;
        if (hd.includes('w')) x1 = Math.min(s(w.x), x2 - min);
        if (hd.includes('e')) x2 = Math.max(s(w.x), x1 + min);
        if (hd.includes('n')) y1 = Math.min(s(w.y), y2 - min);
        if (hd.includes('s')) y2 = Math.max(s(w.y), y1 + min);
        r.x = round2(x1);
        r.y = round2(y1);
        r.w = round2(x2 - x1);
        r.h = round2(y2 - y1);
      } else if (d.type === 'opening') {
        const orig = d.orig as Opening;
        const op = o as Opening;
        const along = snap(op.o === 'h' ? w.x : w.y, 0.25);
        const a = op.o === 'h' ? orig.x : orig.y;
        const b = a + orig.len;
        const na = hd === 'a' ? Math.min(along, b - 0.5) : a;
        const nb = hd === 'a' ? b : Math.max(along, a + 0.5);
        if (op.o === 'h') op.x = na;
        else op.y = na;
        op.len = round2(nb - na);
      } else if (d.type === 'wall' && wallPt) {
        const wl = o as Wall;
        const other = hd === 'a' ? { x: wl.x2, y: wl.y2 } : { x: wl.x1, y: wl.y1 };
        const pt = e.shiftKey ? wallPt : axisLock(other, wallPt);
        if (hd === 'a') {
          wl.x1 = pt.x;
          wl.y1 = pt.y;
        } else {
          wl.x2 = pt.x;
          wl.y2 = pt.y;
        }
      }
    });
  }

  private onPointerUp(e: PointerEvent): void {
    const { sx, sy } = this.eventPos(e);
    this.pointers.delete(e.pointerId);
    try {
      this.canvas?.releasePointerCapture(e.pointerId);
    } catch {
      /* 已經放開 */
    }
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'pinch') {
      if (!this.pointers.size) this.drag = null;
      return;
    }
    const w = this.toWorld(sx, sy);
    this.drag = null;
    const ed = useEditor.getState();
    switch (d.mode) {
      case 'pan':
        /* 右鍵點一下（沒拖）＝放下目前的工具 */
        if (d.button === 2 && !d.moved && ed.tool !== 'select') act.setTool('select');
        break;
      case 'room': {
        let rect = d.rect;
        const preset = ed.armed?.kind === 'room' ? ed.armed.preset : null;
        if (!rect && preset) {
          const p = ROOM_PRESETS[preset];
          rect = { x: Math.round(w.x - p.w / 2), y: Math.round(w.y - p.h / 2), w: p.w, h: p.h };
        }
        if (rect) {
          const room = act.newRoom(rect, preset);
          act.addObject('room', room);
          setEditor({ sel: [{ type: 'room', id: room.id }] });
        } else {
          const hit = this.hitTest(w.x, w.y);
          setEditor({ sel: hit ? [hit] : [] });
        }
        break;
      }
      case 'wall':
        if (d.b && Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) >= 0.5) {
          const kind = ed.armed?.kind === 'wall' ? ed.armed.type : 'int';
          const wall: Wall = { id: uid('w'), x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, kind };
          act.addObject('wall', wall);
          setEditor({ sel: [{ type: 'wall', id: wall.id }] });
        }
        break;
      case 'marquee':
        break;
      case 'move':
        if (!d.moved) {
          /* 選了好幾個時點一下（沒拖）：只留點到的那一個 */
          if (ed.sel.length > 1 && !e.shiftKey) {
            const hit = this.hitTest(w.x, w.y);
            if (hit) setEditor({ sel: [hit] });
          }
        } else this.endEdit();
        break;
      default:
        this.endEdit();
    }
    this.updateCursor();
    this.requestRender();
  }

  private onPointerCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.drag && this.drag.mode !== 'pinch') this.cancelDrag();
    else if (!this.pointers.size) this.drag = null;
  }

  /** 拖曳到一半取消（Esc、第二根手指）：資料回到拖曳前 */
  cancelDrag(): boolean {
    const d = this.drag;
    if (!d) return false;
    this.drag = null;
    if ('before' in d && (d.mode !== 'move' || d.moved)) {
      useProject.getState().replace(d.before);
      this.endEdit();
    }
    this.updateCursor();
    this.requestRender();
    return true;
  }

  private onPointerLeave(): void {
    this.pointer = null;
    if (this.drag) return;
    this.hover = null;
    this.ghostItem = null;
    this.ghostOpening = null;
    this.requestRender();
  }

  /** 沒有按著時的指標：滑過的東西、門窗與家具的預覽、提示 */
  pointerHover(sx: number, sy: number, e: { altKey?: boolean } | null): void {
    const w = this.toWorld(sx, sy);
    const ed = useEditor.getState();
    let handle: Handle | null = null;
    if (ed.tool === 'select' || ed.tool === 'eraser') {
      handle = ed.tool === 'select' ? this.handleAt(sx, sy) : null;
      const hit = handle ? null : this.hitTest(w.x, w.y);
      if (!sameRef(hit, this.hover)) {
        this.hover = hit;
        this.requestRender();
      }
    } else if (ed.tool === 'door' || ed.tool === 'window') {
      this.ghostOpening =
        ed.armed?.kind === 'opening'
          ? snapOpening(this.wallLines(), currentFloor().openings, w.x, w.y, ed.armed.type)
          : null;
      act.updateHint(!this.ghostOpening);
      this.requestRender();
    } else if (ed.tool === 'place') {
      this.ghostItem =
        ed.armed?.kind === 'item'
          ? itemGhost(this.wallLines(), w.x, w.y, ed.armed, Boolean(e?.altKey))
          : null;
      this.requestRender();
    }
    this.updateCursor(handle);
  }

  /** 工具改了方向（R）之後重算預覽 */
  refreshHover(): void {
    if (this.pointer) this.pointerHover(this.pointer.sx, this.pointer.sy, null);
    this.requestRender();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { sx, sy } = this.eventPos(e);
    /* 觸控板的兩指捲動＝平移；滑鼠滾輪、捏合（Ctrl）＝縮放 */
    const trackpadPan =
      !e.ctrlKey && !e.metaKey && e.deltaMode === 0 && (e.deltaX !== 0 || Math.abs(e.deltaY) < 40);
    if (trackpadPan) {
      this.view.ox -= e.deltaX;
      this.view.oy -= e.deltaY;
      this.requestRender();
      return;
    }
    const k = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.012 : 0.0018;
    this.zoomAt(sx, sy, Math.exp(-e.deltaY * k));
  }

  private onDoubleClick(e: MouseEvent): void {
    if (useEditor.getState().tool !== 'select') return;
    const { sx, sy } = this.eventPos(e);
    const w = this.toWorld(sx, sy);
    const hit = this.hitTest(w.x, w.y);
    if (!hit) return;
    setEditor({ sel: [hit] });
    act.focusField(
      hit.type === 'text'
        ? 'text'
        : hit.type === 'item'
          ? 'label'
          : hit.type === 'room'
            ? 'name'
            : 'kind',
    );
  }

  /* ---------- 從素材面板拖放 ---------- */

  private onDragOver(e: DragEvent): void {
    const a = this.dragAsset;
    if (!a) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (this.wrap) this.wrap.dataset.dropping = 'true';
    const { sx, sy } = this.eventPos(e);
    const w = this.toWorld(sx, sy);
    if (a.kind === 'item') {
      this.ghostItem = itemGhost(this.wallLines(), w.x, w.y, { t: a.t, rot: 0 }, e.altKey);
      this.requestRender();
    }
  }

  private onDrop(e: DragEvent): void {
    const a = this.dragAsset;
    if (!a) return;
    e.preventDefault();
    if (this.wrap) this.wrap.dataset.dropping = 'false';
    this.ghostItem = null;
    const w = this.clientToWorld(e.clientX, e.clientY);
    this.dragAsset = null;
    act.dropAsset(a, w, e.altKey, this.wallLines());
    this.requestRender();
  }

  /** 外部（測試、對等驗證）用：畫面上看得到的樓層 */
  debugShown(): ShownFloor {
    return this.shownFloor();
  }
}

function segDist(px: number, py: number, w: Wall): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len2 = dx * dx + dy * dy || 1e-9;
  const k = clamp(((px - w.x1) * dx + (py - w.y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (w.x1 + k * dx), py - (w.y1 + k * dy));
}

export const editor = new EditorController();
