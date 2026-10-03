/**
 * 繪圖與編輯的指標操作（規格 1.4）：選取工具的點選、拖曳與控制點；鋼筆、手繪、圖形、文字。
 * 回傳給 PanZoomViewport 的拖曳處理；正在畫的東西與吸附標記放在 useUi（編輯畫面據此重畫）。
 */
import type { ViewportDrag, ViewportPointer } from '@/ui';
import {
  addElement,
  clearSelection,
  edit,
  focusTextContent,
  selectElement,
  setStatus,
} from './actions';
import type { Draft, ShapeTool } from './editorDraw';
import {
  catmullRomAnchors,
  dist,
  type Point,
  regularPolygonPoints,
  type SnapKind,
  simplifyRDP,
  snapPoint,
  starPoints,
  translated,
} from './geometry';
import { elementCenter } from './layout';
import {
  createCircle,
  createPath,
  createText,
  defaultAnimation,
  defaultStyle,
  type McElement,
  type McProject,
  type McStyle,
  newElementStart,
  pathPoint,
} from './model';
import { canvasMeasure, hitControl, hitElement } from './render';
import {
  primaryElement,
  projectNow,
  selectedElements,
  useCursor,
  usePrefs,
  useProject,
  useUi,
} from './store';
import { S } from './strings';

const SNAP_LABELS: Record<Exclude<SnapKind, 'angle'>, string> = {
  grid: S.canvas.snap.grid,
  centerX: S.canvas.snap.centerX,
  centerY: S.canvas.snap.centerY,
  center: S.canvas.snap.center,
  guide: S.canvas.snap.guide,
};

/** 吸附（規格 3.3）：更新吸附標記並回傳吸到的點（沒吸到時原樣） */
export function snapAt(
  raw: Point,
  zoom: number,
  { anchor = null, disable = false }: { anchor?: Point | null; disable?: boolean } = {},
): Point {
  const p = projectNow();
  const hit = snapPoint(raw, { snap: p.snap, symmetry: p.symmetry, zoom, anchor, disable });
  useUi.setState({
    snap: hit
      ? {
          point: hit.point,
          label:
            hit.kind === 'angle' ? S.canvas.snap.angle(p.snap.angleStep) : SNAP_LABELS[hit.kind],
        }
      : null,
  });
  return hit ? hit.point : { ...raw };
}

export const clearSnap = (): void => {
  if (useUi.getState().snap) useUi.setState({ snap: null });
};

const worldOf = (p: ViewportPointer): Point => ({ x: p.wx, y: p.wy });
const track = (p: ViewportPointer): void => useCursor.setState({ x: p.wx, y: p.wy });

const setDraft = (draft: Draft | null): void => useUi.setState({ draft });

/** 新元素的樣式：基準元素的樣式，沒有選取時預設樣式 */
function sourceStyle(): McStyle {
  const el = primaryElement();
  return el ? (structuredClone(el.style) as McStyle) : defaultStyle();
}

/** 換掉某個元素（拖曳中） */
function putElement(el: McElement): void {
  edit((d) => {
    const i = d.elements.findIndex((x) => x.id === el.id);
    if (i >= 0) d.elements[i] = el as (typeof d.elements)[number];
  });
}

/* ---------- 鋼筆（F43） ---------- */

export function finishPen(closed: boolean): void {
  const d = useUi.getState().draft;
  if (d?.type !== 'path' || d.points.length < 2) {
    setDraft(null);
    return;
  }
  const p = projectNow();
  const el = createPath(d.points, {
    name: closed ? S.names.closedShape : S.names.stroke,
    closed,
    symmetry: true,
    style: sourceStyle(),
    animation: { mode: 'drawGlow', start: newElementStart(p), duration: 1.1 },
  });
  useUi.setState({ draft: null, snap: null });
  addElement(el, el.points.length - 1);
  setStatus(S.msg.pathAdded);
}

let lastPenDown: { t: number; x: number; y: number } | null = null;

function penDown(p: ViewportPointer, zoom: number): ViewportDrag {
  const ui = useUi.getState();
  const draft = ui.draft?.type === 'path' ? ui.draft : null;
  const now = performance.now();
  /* 雙擊＝完成（開放路徑） */
  if (
    draft &&
    lastPenDown &&
    now - lastPenDown.t < 400 &&
    Math.hypot(p.x - lastPenDown.x, p.y - lastPenDown.y) < 6
  ) {
    lastPenDown = null;
    finishPen(false);
    return {};
  }
  lastPenDown = { t: now, x: p.x, y: p.y };
  const anchor = draft?.points.at(-1) ?? null;
  const pt = snapAt(worldOf(p), zoom, { anchor, disable: p.altKey });
  const points = draft ? draft.points.slice() : [];
  if (points.length >= 3 && dist(pt, points[0]) <= 12 / zoom) {
    finishPen(true);
    return {};
  }
  points.push(pathPoint(pt.x, pt.y));
  const index = points.length - 1;
  setDraft({ type: 'path', points, preview: null, handleIndex: index });
  const handle = (q: ViewportPointer) => {
    track(q);
    const d = useUi.getState().draft;
    if (d?.type !== 'path') return;
    const h = snapAt(worldOf(q), zoom, { anchor: pt, disable: q.altKey });
    const list = d.points.slice();
    list[index] = {
      ...list[index],
      outX: h.x,
      outY: h.y,
      inX: pt.x * 2 - h.x,
      inY: pt.y * 2 - h.y,
      smooth: true,
    };
    setDraft({ ...d, points: list });
  };
  const end = () => {
    const d = useUi.getState().draft;
    if (d?.type === 'path') setDraft({ ...d, handleIndex: null });
  };
  return { cursor: 'crosshair', onMove: handle, onEnd: end, onCancel: end };
}

/* ---------- 手繪（F44） ---------- */

function freehandDown(p: ViewportPointer, zoom: number): ViewportDrag {
  const first = snapAt(worldOf(p), zoom, { disable: p.altKey });
  const points: Point[] = [first];
  setDraft({ type: 'freehand', points });
  return {
    cursor: 'crosshair',
    onMove: (q) => {
      track(q);
      const s = worldOf(q);
      if (dist(points[points.length - 1], s) >= 1.4 / zoom) {
        points.push(s);
        setDraft({ type: 'freehand', points });
      }
    },
    onEnd: () => {
      useUi.setState({ draft: null, snap: null });
      addFreehand(points, zoom);
    },
    onCancel: () => useUi.setState({ draft: null, snap: null }),
  };
}

export function addFreehand(points: readonly Point[], zoom: number): McElement | null {
  if (points.length < 2) return null;
  const tolerance = usePrefs.getState().data.freehandTolerance;
  const simple = simplifyRDP(points, tolerance / zoom);
  if (simple.length < 2) return null;
  const anchors = catmullRomAnchors(simple, false, 0.9);
  const p = projectNow();
  const style = sourceStyle();
  style.lineCap = 'round';
  style.lineJoin = 'round';
  const el = createPath(anchors, {
    name: p.symmetry.enabled ? S.names.symFreehand : S.names.freehand,
    symmetry: p.symmetry.enabled,
    style,
    animation: { mode: 'drawGlow', start: newElementStart(p), duration: 1.25 },
  });
  addElement(el);
  return el;
}

/* ---------- 直線、圓、多邊形、星形（F45～F49） ---------- */

export function makeShape(
  tool: ShapeTool,
  start: Point,
  current: Point,
  alt: boolean,
  project: McProject = projectNow(),
): McElement {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const radius = Math.hypot(dx, dy);
  const rotation = Math.atan2(dy, dx);
  const prefs = usePrefs.getState().data;
  let el: McElement;
  if (tool === 'line') {
    el = createPath([pathPoint(start.x, start.y), pathPoint(current.x, current.y)], {
      name: S.names.line,
      symmetry: true,
    });
  } else if (tool === 'circle') {
    el = alt
      ? createCircle(
          (start.x + current.x) / 2,
          (start.y + current.y) / 2,
          Math.abs(current.x - start.x) / 2,
          Math.abs(current.y - start.y) / 2,
          { name: S.names.ellipse, symmetry: false },
        )
      : createCircle(start.x, start.y, radius, radius, { name: S.names.circle, symmetry: false });
  } else if (tool === 'polygon') {
    el = createPath(regularPolygonPoints(start.x, start.y, radius, prefs.polygonSides, rotation), {
      name: S.names.polygon(prefs.polygonSides),
      closed: true,
      symmetry: true,
    });
  } else {
    el = createPath(
      starPoints(start.x, start.y, radius, radius * prefs.starInner, prefs.starPoints, rotation),
      { name: S.names.star(prefs.starPoints), closed: true, symmetry: true },
    );
  }
  el.style = sourceStyle();
  el.animation = defaultAnimation({
    mode: tool === 'circle' ? 'centerSpread' : 'drawGlow',
    start: newElementStart(project),
    duration: 1.1,
  });
  return el;
}

function shapeDown(tool: ShapeTool, p: ViewportPointer, zoom: number): ViewportDrag {
  const start = snapAt(worldOf(p), zoom, { disable: p.altKey });
  setDraft({
    type: 'shape',
    tool,
    start,
    current: start,
    element: makeShape(tool, start, start, p.altKey),
  });
  return {
    cursor: 'crosshair',
    onMove: (q) => {
      track(q);
      const cur = snapAt(worldOf(q), zoom, { anchor: start, disable: q.altKey });
      setDraft({
        type: 'shape',
        tool,
        start,
        current: cur,
        element: makeShape(tool, start, cur, q.altKey),
      });
    },
    onEnd: () => {
      const d = useUi.getState().draft;
      useUi.setState({ draft: null, snap: null });
      if (d?.type !== 'shape' || dist(d.start, d.current) < 3 / zoom) return;
      addElement(d.element);
    },
    onCancel: () => useUi.setState({ draft: null, snap: null }),
  };
}

/* ---------- 文字（F50） ---------- */

function textDown(p: ViewportPointer, zoom: number): ViewportDrag {
  const pt = snapAt(worldOf(p), zoom, { disable: p.altKey });
  const proj = projectNow();
  const el = createText(pt.x, pt.y, 'ᚱ', {
    symmetry: proj.symmetry.enabled,
    fontFamily: usePrefs.getState().data.fontPreset || 'serif',
    animation: { mode: 'fadeIn', start: newElementStart(proj), duration: 0.65 },
  });
  addElement(el);
  useUi.setState({ snap: null });
  focusTextContent();
  return {};
}

/* ---------- 選取工具：控制點與移動（F35～F38） ---------- */

function controlDrag(
  el: McElement,
  kind: string,
  index: number | undefined,
  start: Point,
  zoom: number,
): ViewportDrag {
  const before = projectNow();
  const original = el;
  useProject.beginGesture();
  if (index !== undefined) useUi.setState({ node: { id: el.id, index } });
  const move = (q: ViewportPointer) => {
    track(q);
    const raw = worldOf(q);
    const alt = q.altKey;
    if (original.type === 'path' && index !== undefined) {
      const o = original.points[index];
      const pts = original.points.slice();
      if (kind === 'node') {
        const pt = snapAt(raw, zoom, { disable: alt });
        const dx = pt.x - o.x;
        const dy = pt.y - o.y;
        pts[index] = {
          ...o,
          x: o.x + dx,
          y: o.y + dy,
          inX: o.inX + dx,
          inY: o.inY + dy,
          outX: o.outX + dx,
          outY: o.outY + dy,
        };
      } else {
        const pt = snapAt(raw, zoom, { anchor: o, disable: alt });
        const q2 = { ...o };
        if (kind === 'node-in') {
          q2.inX = pt.x;
          q2.inY = pt.y;
          if (o.smooth && !alt) {
            q2.outX = o.x * 2 - pt.x;
            q2.outY = o.y * 2 - pt.y;
          }
        } else {
          q2.outX = pt.x;
          q2.outY = pt.y;
          if (o.smooth && !alt) {
            q2.inX = o.x * 2 - pt.x;
            q2.inY = o.y * 2 - pt.y;
          }
        }
        pts[index] = q2;
      }
      putElement({ ...original, points: pts });
      return;
    }
    if (original.type === 'path') return;
    if (kind === 'circle-center' || kind === 'text-origin') {
      const pt = snapAt(raw, zoom, { disable: alt });
      putElement({ ...original, x: original.x + pt.x - start.x, y: original.y + pt.y - start.y });
    } else if (original.type === 'circle' && kind === 'circle-rx') {
      const pt = snapAt(raw, zoom, { anchor: { x: original.x, y: original.y }, disable: alt });
      putElement({ ...original, rx: Math.max(1, Math.abs(pt.x - original.x)) });
    } else if (original.type === 'circle' && kind === 'circle-ry') {
      const pt = snapAt(raw, zoom, { anchor: { x: original.x, y: original.y }, disable: alt });
      putElement({ ...original, ry: Math.max(1, Math.abs(pt.y - original.y)) });
    }
  };
  return {
    cursor: 'grabbing',
    onMove: move,
    onEnd: () => {
      clearSnap();
      useProject.endGesture();
    },
    onCancel: () => {
      useProject.getState().replace(before);
      clearSnap();
      useProject.endGesture();
    },
  };
}

function moveDrag(hit: McElement, start: Point, zoom: number): ViewportDrag {
  const before = projectNow();
  const movable = selectedElements(before).filter((el) => !el.locked);
  const originals = movable.length > 1 ? movable : [hit];
  const center = elementCenter(hit, canvasMeasure);
  const sym = before.symmetry;
  useProject.beginGesture();
  return {
    cursor: 'grabbing',
    onMove: (q) => {
      track(q);
      const raw = { x: center.x + q.wx - start.x, y: center.y + q.wy - start.y };
      const pt = snapAt(raw, zoom, {
        anchor: { x: sym.centerX, y: sym.centerY },
        disable: q.altKey,
      });
      const dx = pt.x - center.x;
      const dy = pt.y - center.y;
      const byId = new Map(originals.map((el) => [el.id, el]));
      edit((d) => {
        d.elements = d.elements.map((el) => {
          const o = byId.get(el.id);
          return o ? (translated(o, dx, dy) as typeof el) : el;
        });
      });
    },
    onEnd: () => {
      clearSnap();
      useProject.endGesture();
    },
    onCancel: () => {
      useProject.getState().replace(before);
      clearSnap();
      useProject.endGesture();
    },
  };
}

function selectDown(p: ViewportPointer, zoom: number): ViewportDrag | undefined {
  const raw = worldOf(p);
  const proj = projectNow();
  const primary = primaryElement(proj);
  const control = hitControl(primary, raw, zoom);
  if (control && primary) return controlDrag(primary, control.kind, control.index, raw, zoom);
  const hit = hitElement(proj, raw, zoom, canvasMeasure);
  if (!hit) return undefined;
  if (p.shiftKey || p.ctrlKey || p.metaKey) {
    selectElement(hit.el.id, 'toggle');
    return {};
  }
  const ui = useUi.getState();
  if (ui.selected.includes(hit.el.id) && ui.selected.length > 1)
    selectElement(hit.el.id, 'preserve');
  else if (ui.primary !== hit.el.id || ui.selected.length !== 1) selectElement(hit.el.id);
  if (hit.el.locked) return {};
  return moveDrag(hit.el, raw, zoom);
}

/* ---------- 入口 ---------- */

/** PanZoomViewport 的 onPointerDown：回傳拖曳處理；undefined＝空白處（平移或點一下取消選取） */
export function pointerDown(p: ViewportPointer, zoom: number): ViewportDrag | undefined {
  track(p);
  const tool = useUi.getState().tool;
  switch (tool) {
    case 'select':
      return selectDown(p, zoom);
    case 'pen':
      return penDown(p, zoom);
    case 'freehand':
      return freehandDown(p, zoom);
    case 'line':
    case 'circle':
    case 'polygon':
    case 'star':
      return shapeDown(tool, p, zoom);
    case 'text':
      return textDown(p, zoom);
    default:
      return undefined;
  }
}

/** 滑鼠移動（沒有按著）：座標、鋼筆的預覽線段 */
export function pointerHover(p: ViewportPointer | null, zoom: number): void {
  if (!p) return;
  track(p);
  const ui = useUi.getState();
  if (ui.tool === 'pen' && ui.draft?.type === 'path') {
    const anchor = ui.draft.points.at(-1) ?? null;
    const preview = snapAt(worldOf(p), zoom, { anchor, disable: p.altKey });
    const d = useUi.getState().draft;
    if (d?.type === 'path') setDraft({ ...d, preview });
  } else clearSnap();
}

/** 空白處點一下：選取工具時取消選取 */
export function emptyClick(): void {
  if (useUi.getState().tool === 'select') clearSelection();
}

export const cursorFor = (tool: string): string | undefined =>
  tool === 'select'
    ? 'default'
    : tool === 'text'
      ? 'text'
      : tool === 'pan'
        ? undefined
        : 'crosshair';
