/**
 * 地圖畫布：共用的可縮放盤面（PanZoomViewport；世界座標＝格，100% 時每格 64 px）＋各工具的拖曳。
 *
 * - 地圖外按住拖曳、空白鍵＋拖曳、中鍵拖曳＝平移；滾輪＝以游標為中心縮放；觸控可以兩指縮放。
 * - 畫筆、橡皮擦：拖曳時沿直線一格一格畫；填滿：點一下；圖形：拖曳出範圍，放開時放上去；
 *   一筆畫的變更先畫在工作副本，放開才交給地圖（一步復原），中途取消（Esc、指標被取消）就丟掉。
 * - 選取：拖曳框選（Shift 加選）；在選到的圖塊上拖曳＝搬動。整張移動：拖曳＝所有圖層一起位移。
 * - 圖形工具在地圖上按右鍵：指定寬高、以那一格為中心放（對話框）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { squareCellAt } from '@/core/grid';
import {
  type PanZoomView,
  PanZoomViewport,
  type PanZoomViewportHandle,
  type ViewportDrag,
  type ViewportPointer,
} from '@/ui/PanZoomViewport';
import { LayerEdit, shapeAnchors } from '../model/edit';
import { placeParts, turnedSpan } from '../model/large';
import { editableLayer } from '../model/map';
import { selectInRect, selectionBounds } from '../model/selection';
import { lineCells, type ShapeKind } from '../model/shapes';
import { CELL_PX, type TileMap } from '../model/types';
import { MapCache } from '../render/cache';
import { drawGrid, drawLayers, drawPlaced } from '../render/draw';
import { S } from '../strings';
import * as act from './actions';
import { editorNow, mapNow, setEditor, useEditor, useMap, usePrefs } from './store';
import { imageFor, tileDef, useImages } from './tiles';

/** 游標所在的格子（狀態列用；不讓整個畫布重畫） */
export const useHover = create<{ x: number; y: number } | null>(() => null);

type Gesture =
  | {
      kind: 'paint';
      edit: LayerEdit;
      layer: number;
      erase: boolean;
      last: { x: number; y: number };
    }
  | { kind: 'fill'; edit: LayerEdit; layer: number }
  | {
      kind: 'shape';
      layer: number;
      start: { x: number; y: number };
      end: { x: number; y: number };
      shape: ShapeKind;
      outline: boolean;
    }
  | {
      kind: 'select-rect';
      start: { x: number; y: number };
      end: { x: number; y: number };
      additive: boolean;
      original: number[];
    }
  | { kind: 'move-sel'; start: { x: number; y: number }; end: { x: number; y: number } }
  | { kind: 'move-map'; start: { x: number; y: number }; end: { x: number; y: number } };

/** 盤面四周的留白（左邊多留給工具列） */
const PAD = { top: 24, right: 24, bottom: 24, left: 60 };
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 4;

/** 畫面上的顏色（不跟主題：都畫在地圖上） */
const C = {
  shadow: 'rgba(0, 0, 0, 0.45)',
  grid: 'rgba(200, 210, 190, 0.16)',
  outline: 'rgba(190, 205, 150, 0.45)',
  selFill: 'rgba(120, 200, 225, 0.22)',
  selLine: '#9fe3f2',
  previewFill: 'rgba(230, 190, 110, 0.22)',
  previewLine: '#e8c98c',
  eraseFill: 'rgba(240, 150, 140, 0.18)',
  eraseLine: '#f0a49a',
};

let viewport: PanZoomViewportHandle | null = null;

/** 畫面的快取（整張地圖畫好的圖） */
const cache = new MapCache();
const lookFor = (m: TileMap) => ({ defs: (id: string) => tileDef(id, m), images: imageFor });

/** 一筆畫改了格子：快取還是這張地圖的話只重畫改過的格子 */
function patchCache(edit: LayerEdit, layer: number): void {
  const recent = edit.takeRecent();
  const m = mapNow();
  if (cache.map !== m || !cache.canvas) return;
  const cells = edit.current();
  if (cache.override && (cache.override.cells !== cells || cache.override.index !== layer)) return;
  cache.patch({ index: layer, cells }, recent, lookFor(m));
}

/** 符合畫面：整張地圖放進畫面（最多 200%） */
export function fitView(): void {
  const el = viewport?.element();
  const map = mapNow();
  if (!el || !viewport) return;
  const z = Math.max(
    ZOOM_MIN,
    Math.min(
      2,
      (el.clientWidth - PAD.left - PAD.right) / (map.width * CELL_PX),
      (el.clientHeight - PAD.top - PAD.bottom) / (map.height * CELL_PX),
    ),
  );
  viewport.zoomTo(z);
  requestAnimationFrame(() => {
    const e = viewport?.element();
    if (!e) return;
    e.scrollLeft = (e.scrollWidth - e.clientWidth) / 2;
    e.scrollTop = (e.scrollHeight - e.clientHeight) / 2;
  });
}

export const zoomBy = (k: number) => viewport?.zoomBy(k);

/** 格子 (x, y) 的中心在螢幕上的位置（測試用；看不到時 null） */
export function cellToClient(x: number, y: number): { x: number; y: number } | null {
  const el = viewport?.element();
  const canvas = el?.querySelector('canvas');
  if (!viewport || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  const p = viewport.getView().toScreen(x + 0.5, y + 0.5);
  return { x: r.left + p.x, y: r.top + p.y };
}
export const zoomTo = (z: number) => viewport?.zoomTo(z);
export const redrawCanvas = () => viewport?.redraw();

/** 進行中的拖曳（Esc 取消用） */
let cancelGesture: (() => boolean) | null = null;
export function cancelCurrentGesture(): boolean {
  return cancelGesture?.() ?? false;
}

export function MapCanvas() {
  const map = useMap((s) => s.data);
  const ed = useEditor();
  const grid = usePrefs((s) => s.data.grid);
  const shape = usePrefs((s) => s.data.shape);
  const outline = usePrefs((s) => s.data.outline);
  /* 圖片讀好了要重畫：訂閱版本號（值本身不用） */
  useImages((s) => s.version);
  const vp = useRef<PanZoomViewportHandle>(null);
  const gesture = useRef<Gesture | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const selected = useMemo(() => new Set(ed.selection), [ed.selection]);

  useEffect(() => {
    viewport = vp.current;
    return () => {
      viewport = null;
    };
  });

  /* 第一次準備好時符合畫面 */
  const fitted = useRef(false);
  useEffect(() => {
    if (ed.ready && !fitted.current) {
      fitted.current = true;
      requestAnimationFrame(fitView);
    }
  }, [ed.ready]);

  useEffect(() => {
    cancelGesture = () => {
      if (!gesture.current) return false;
      gesture.current = null;
      vp.current?.redraw();
      return true;
    };
    return () => {
      cancelGesture = null;
    };
  }, []);

  const redraw = () => vp.current?.redraw();
  /* 世界座標的單位就是格（core/grid 的方格，每格 1） */
  const cellOf = (p: ViewportPointer) => {
    const c = squareCellAt(p.wx, p.wy, 1);
    return { x: c.col, y: c.row };
  };
  const inMap = (m: TileMap, x: number, y: number) =>
    x >= 0 && y >= 0 && x < m.width && y < m.height;
  /* 拖曳中的點夾在地圖外一格以內（直線不會一路走到很遠） */
  const clamp = (m: TileMap, c: { x: number; y: number }) => ({
    x: Math.max(-1, Math.min(m.width, c.x)),
    y: Math.max(-1, Math.min(m.height, c.y)),
  });

  /** 拖曳中也更新狀態列的游標位置 */
  const track = (q: ViewportPointer) => {
    const c = cellOf(q);
    hover.current = c;
    const m = mapNow();
    useHover.setState(inMap(m, c.x, c.y) ? c : null, true);
  };

  const onPointerDown = (p: ViewportPointer): ViewportDrag | null => {
    const m = mapNow();
    const e = editorNow();
    const at = cellOf(p);
    if (!inMap(m, at.x, at.y) || !e.ready) return null;
    const none: ViewportDrag = { cursor: 'default' };
    if (e.tool === 'picker') {
      act.pickAt(at.x, at.y);
      return none;
    }
    if (e.tool === 'move-map') {
      const g: Gesture = { kind: 'move-map', start: at, end: at };
      gesture.current = g;
      return {
        cursor: 'grabbing',
        onMove: (q) => {
          track(q);
          g.end = cellOf(q);
          redraw();
        },
        onEnd: () => {
          gesture.current = null;
          act.shiftWithConfirm(g.end.x - g.start.x, g.end.y - g.start.y);
          redraw();
        },
        onCancel: () => {
          gesture.current = null;
          redraw();
        },
      };
    }
    if (e.tool === 'select') {
      const layers = m.layers.filter((l) => e.layers.includes(l.id) && editableLayer(l));
      if (!layers.length) {
        act.notify(S.canvas.noSelectLayer, 'warning');
        return none;
      }
      const i = at.y * m.width + at.x;
      if (!p.shiftKey && selected.has(i) && layers.some((l) => l.cells[i])) {
        const g: Gesture = { kind: 'move-sel', start: at, end: at };
        gesture.current = g;
        return {
          cursor: 'grabbing',
          onMove: (q) => {
            track(q);
            g.end = cellOf(q);
            redraw();
          },
          onEnd: () => {
            gesture.current = null;
            const dx = g.end.x - g.start.x;
            const dy = g.end.y - g.start.y;
            if (dx || dy) act.applySelection('move', dx, dy);
            redraw();
          },
          onCancel: () => {
            gesture.current = null;
            redraw();
          },
        };
      }
      const g: Gesture = {
        kind: 'select-rect',
        start: at,
        end: at,
        additive: p.shiftKey,
        original: e.selection,
      };
      gesture.current = g;
      if (!p.shiftKey) setEditor({ selection: [] });
      return {
        cursor: 'crosshair',
        onMove: (q) => {
          track(q);
          g.end = clamp(m, cellOf(q));
          redraw();
        },
        onEnd: () => {
          gesture.current = null;
          const picked = selectInRect(
            mapNow(),
            new Set(editorNow().layers),
            g.start.x,
            g.start.y,
            g.end.x,
            g.end.y,
          );
          setEditor({ selection: [...new Set([...(g.additive ? g.original : []), ...picked])] });
        },
        onCancel: () => {
          gesture.current = null;
          setEditor({ selection: g.original });
        },
      };
    }
    /* 畫的工具 */
    const li = act.activeIndex(m);
    const layer = m.layers[li];
    if (!layer || !editableLayer(layer)) {
      act.notify(S.canvas.noLayer, 'warning');
      return none;
    }
    const erase = e.tool === 'eraser';
    const b = act.brushNow();
    if (!erase && !b) {
      act.notify(S.canvas.noTile, 'warning');
      return none;
    }
    const finish = (edit: LayerEdit) => {
      gesture.current = null;
      const cells = edit.result();
      if (cells) act.commitLayerCells(li, cells);
      redraw();
    };
    const cancel = () => {
      gesture.current = null;
      redraw();
    };
    if (e.tool === 'shape' && b) {
      const g: Gesture = { kind: 'shape', layer: li, start: at, end: at, shape, outline };
      gesture.current = g;
      return {
        cursor: 'crosshair',
        onMove: (q) => {
          track(q);
          g.end = clamp(m, cellOf(q));
          redraw();
        },
        onEnd: () => {
          const edit = new LayerEdit(m.width, m.height, mapNow().layers[li].cells);
          edit.shape(g.start.x, g.start.y, g.end.x, g.end.y, g.shape, g.outline, b.brush);
          finish(edit);
        },
        onCancel: cancel,
      };
    }
    const edit = new LayerEdit(m.width, m.height, layer.cells);
    if (e.tool === 'fill' && b) {
      edit.fill(at.x, at.y, b.brush);
      patchCache(edit, li);
      gesture.current = { kind: 'fill', edit, layer: li };
      redraw();
      return { cursor: 'cell', onEnd: () => finish(edit), onCancel: cancel };
    }
    const paint = (x: number, y: number) => {
      if (erase) edit.set(x, y, null);
      else if (b) edit.stamp(x, y, b.brush);
    };
    paint(at.x, at.y);
    patchCache(edit, li);
    const g: Gesture = { kind: 'paint', edit, layer: li, erase, last: at };
    gesture.current = g;
    redraw();
    return {
      cursor: erase ? 'cell' : 'crosshair',
      onMove: (q) => {
        track(q);
        const to = clamp(m, cellOf(q));
        if (to.x === g.last.x && to.y === g.last.y) return;
        for (const [x, y] of lineCells(g.last.x, g.last.y, to.x, to.y).slice(1)) paint(x, y);
        patchCache(edit, li);
        g.last = to;
        redraw();
      },
      onEnd: () => finish(edit),
      onCancel: cancel,
    };
  };

  const onHover = (p: ViewportPointer | null) => {
    const c = p ? cellOf(p) : null;
    const prev = hover.current;
    if (prev?.x === c?.x && prev?.y === c?.y) return;
    hover.current = c;
    const m = mapNow();
    useHover.setState(c && inMap(m, c.x, c.y) ? c : null, true);
    redraw();
  };

  const getCursor = (p: ViewportPointer): string | undefined => {
    const m = mapNow();
    const e = editorNow();
    const at = cellOf(p);
    if (!inMap(m, at.x, at.y)) return 'grab';
    switch (e.tool) {
      case 'move-map':
        return 'move';
      case 'select': {
        const i = at.y * m.width + at.x;
        const layers = m.layers.filter((l) => e.layers.includes(l.id) && editableLayer(l));
        if (!layers.length) return 'not-allowed';
        return selected.has(i) && layers.some((l) => l.cells[i]) ? 'move' : 'crosshair';
      }
      case 'picker': {
        const top = [...m.layers]
          .reverse()
          .find((l) => l.visible && l.opacity !== 0 && l.cells[at.y * m.width + at.x]);
        return top ? 'copy' : 'not-allowed';
      }
      default: {
        if (!act.canPaint(m)) return 'not-allowed';
        if (e.tool === 'eraser') return 'cell';
        const b = act.brushNow();
        if (!b) return 'not-allowed';
        if (e.tool === 'brush' || e.tool === 'fill') {
          const [w, h] = turnedSpan(b.brush.span, b.brush.r);
          if (at.x + w > m.width || at.y + h > m.height) return 'not-allowed';
        }
        return e.tool === 'fill' ? 'cell' : 'crosshair';
      }
    }
  };

  /* 每次重畫都讀最新的 store（盤面在這個元件重新整理時、或 redraw() 時重畫） */
  const draw = (ctx: CanvasRenderingContext2D, view: PanZoomView) => {
    const m = mapNow();
    const e = editorNow();
    const g = gesture.current;
    const s = view.scale;
    const o = view.toScreen(0, 0);
    const at = { ox: o.x, oy: o.y, scale: s };
    const W = Math.round(m.width * s);
    const H = Math.round(m.height * s);
    const ox = Math.round(o.x);
    const oy = Math.round(o.y);
    /* 地圖的底與影子 */
    ctx.fillStyle = C.shadow;
    ctx.fillRect(ox + 6, oy + 6, W, H);
    ctx.fillStyle = m.background;
    ctx.fillRect(ox, oy, W, H);
    const v = view.visible;
    const region = {
      x0: Math.max(0, Math.floor(v.x)),
      y0: Math.max(0, Math.floor(v.y)),
      x1: Math.min(m.width, Math.ceil(v.x + v.width)),
      y1: Math.min(m.height, Math.ceil(v.y + v.height)),
    };
    const editable = new Set(
      m.layers.filter((l) => e.layers.includes(l.id) && editableLayer(l)).map((l) => l.id),
    );
    const movingSel =
      g?.kind === 'move-sel' ? { dx: g.end.x - g.start.x, dy: g.end.y - g.start.y } : null;
    const dialog =
      e.dialog && typeof e.dialog === 'object' && e.dialog.kind === 'move' ? e.dialog : null;
    const shift =
      g?.kind === 'move-map'
        ? { dx: g.end.x - g.start.x, dy: g.end.y - g.start.y }
        : dialog
          ? { dx: dialog.dx, dy: dialog.dy }
          : null;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, W, H);
    ctx.clip();
    const look = lookFor(m);
    const override =
      g && (g.kind === 'paint' || g.kind === 'fill')
        ? { index: g.layer, cells: g.edit.current() }
        : null;
    const px = s * (window.devicePixelRatio || 1);
    if (!shift && !movingSel && MapCache.fits(m, px)) {
      /* 整張放得進快取：貼上快取（游標、選取框這些重畫不必再畫幾萬格） */
      const version = useImages.getState().version;
      if (!cache.valid(m, px, version, override)) cache.render(m, px, version, override, look);
      if (cache.canvas) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cache.canvas, ox, oy, W, H);
      }
    } else
      drawLayers(ctx, m, region, at, {
        ...look,
        override,
        skip: movingSel ? (li, i) => selected.has(i) && editable.has(m.layers[li].id) : undefined,
        shift,
      });
    /* 搬動中的選取：畫在新的位置、半透明 */
    if (movingSel) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      m.layers.forEach((l) => {
        if (!editable.has(l.id)) return;
        ctx.save();
        ctx.globalAlpha *= l.opacity;
        for (const i of selected) {
          const c = l.cells[i];
          if (!c) continue;
          const def = look.defs(c.t);
          const img = def && imageFor(def.src);
          if (!def || !img) continue;
          const x = (i % m.width) + movingSel.dx;
          const y = Math.floor(i / m.width) + movingSel.dy;
          const l0 = Math.round(o.x + x * s);
          const t0 = Math.round(o.y + y * s);
          drawPlaced(
            ctx,
            def,
            c,
            img,
            l0,
            t0,
            Math.round(o.x + (x + 1) * s) - l0,
            Math.round(o.y + (y + 1) * s) - t0,
          );
        }
        ctx.restore();
      });
      ctx.restore();
    }
    ctx.restore();
    if (grid && s >= 8) drawGrid(ctx, m.width, m.height, at, C.grid, region);
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 0.5, oy - 0.5, W + 1, H + 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, W, H);
    ctx.clip();
    const cellRect = (x: number, y: number, w = 1, h = 1) => {
      const l0 = Math.round(o.x + x * s);
      const t0 = Math.round(o.y + y * s);
      return [
        l0,
        t0,
        Math.round(o.x + (x + w) * s) - l0,
        Math.round(o.y + (y + h) * s) - t0,
      ] as const;
    };
    /* 選取 */
    if (e.tool === 'select' && selected.size) {
      const dx = movingSel?.dx ?? 0;
      const dy = movingSel?.dy ?? 0;
      ctx.fillStyle = C.selFill;
      for (const i of selected)
        ctx.fillRect(...cellRect((i % m.width) + dx, Math.floor(i / m.width) + dy));
      const box = selectionBounds(m.width, m.height, selected);
      if (box) {
        ctx.strokeStyle = C.selLine;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        const [x, y, w, h] = cellRect(box.x + dx, box.y + dy, box.width, box.height);
        ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
        ctx.setLineDash([]);
      }
    }
    const b = act.brushNow();
    const ghost = (x: number, y: number, alpha: number) => {
      if (!b) return;
      const img = imageFor(b.def.src);
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      const span = b.brush.span;
      if (span[0] === 1 && span[1] === 1) {
        const [l0, t0, w, h] = cellRect(x, y);
        drawPlaced(ctx, b.def, { r: b.brush.r, f: b.brush.f }, img, l0, t0, w, h);
      } else {
        for (const [sx, sy, px, py] of placeParts(span, b.brush.r, b.brush.f)) {
          const [l0, t0, cw, ch] = cellRect(x + px, y + py);
          drawPlaced(ctx, b.def, { r: b.brush.r, f: b.brush.f, p: [sx, sy] }, img, l0, t0, cw, ch);
        }
      }
      ctx.restore();
    };
    if (g?.kind === 'shape' && b) {
      const span = turnedSpan(b.brush.span, b.brush.r);
      ctx.fillStyle = C.previewFill;
      for (const [x, y] of shapeAnchors(
        g.start.x,
        g.start.y,
        g.end.x,
        g.end.y,
        g.shape,
        g.outline,
        span,
      )) {
        if (x < region.x0 - span[0] || x >= region.x1 || y < region.y0 - span[1] || y >= region.y1)
          continue;
        if (s >= 8) ghost(x, y, 0.5);
        ctx.fillRect(...cellRect(x, y, span[0], span[1]));
      }
    } else if (g?.kind === 'select-rect') {
      const x = Math.min(g.start.x, g.end.x);
      const y = Math.min(g.start.y, g.end.y);
      const r = cellRect(
        x,
        y,
        Math.abs(g.start.x - g.end.x) + 1,
        Math.abs(g.start.y - g.end.y) + 1,
      );
      ctx.fillStyle = C.previewFill;
      ctx.fillRect(...r);
      ctx.strokeStyle = C.previewLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
    } else if (!g && e.tool !== 'select' && e.tool !== 'move-map' && e.tool !== 'picker') {
      const h = hover.current;
      if (h && inMap(m, h.x, h.y)) {
        const layer = m.layers[act.activeIndex(m)];
        const erase = e.tool === 'eraser';
        const span = erase || !b ? ([1, 1] as const) : turnedSpan(b.brush.span, b.brush.r);
        if (!erase && layer && editableLayer(layer)) ghost(h.x, h.y, 0.48 * layer.opacity);
        const r = cellRect(h.x, h.y, span[0], span[1]);
        ctx.fillStyle = erase ? C.eraseFill : C.previewFill;
        ctx.fillRect(...r);
        ctx.strokeStyle = erase ? C.eraseLine : C.previewLine;
        ctx.lineWidth = 1;
        ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
      }
    } else if (
      !g &&
      e.tool === 'picker' &&
      hover.current &&
      inMap(m, hover.current.x, hover.current.y)
    ) {
      const r = cellRect(hover.current.x, hover.current.y);
      ctx.strokeStyle = C.previewLine;
      ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
    }
    ctx.restore();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右鍵（圖形的大小）是捷徑；圖形工具另有選項列
    <div
      className="relative min-h-0 min-w-0 flex-1"
      onContextMenu={(ev) => {
        ev.preventDefault();
        const e = editorNow();
        if (e.tool !== 'shape' || !e.ready) return;
        const w = vp.current?.clientToWorld(ev.clientX, ev.clientY);
        const m = mapNow();
        if (!w) return;
        const x = Math.floor(w.x);
        const y = Math.floor(w.y);
        if (!inMap(m, x, y)) return;
        if (!act.canPaint(m)) {
          act.notify(S.canvas.noLayer, 'warning');
          return;
        }
        if (!act.brushNow()) {
          act.notify(S.canvas.noTile, 'warning');
          return;
        }
        gesture.current = null;
        setEditor({ dialog: { kind: 'shape', x, y } });
      }}
      data-testid="map-canvas"
      data-tool={ed.tool}
    >
      <PanZoomViewport
        ref={vp}
        world={{ x: 0, y: 0, width: map.width, height: map.height }}
        baseScale={CELL_PX}
        zoom={ed.zoom}
        onZoomChange={(z) => setEditor({ zoom: z })}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
        wheelStep={1.16}
        padding={PAD}
        pinch
        background="var(--surface-2)"
        draw={draw}
        onPointerDown={onPointerDown}
        onHover={onHover}
        getCursor={getCursor}
        aria-label={S.canvas.label}
        className="h-[min(62dvh,640px)] min-h-72 lg:h-full lg:min-h-0"
      />
      {!ed.ready ? (
        <p
          className="pointer-events-none absolute inset-x-0 top-3 m-0 text-center text-sm text-muted"
          role="status"
        >
          {S.canvas.loading}
        </p>
      ) : null}
    </div>
  );
}
