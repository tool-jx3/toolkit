/**
 * 元素的外框、中心與對齊／分佈的移動計畫（規格 3.6）。
 * 文字的外框要靠畫布量測文字，量測函式由呼叫端提供（瀏覽器用 render.ts 的 canvasMeasure；測試用假的）。
 */
import {
  type AlignMode,
  alignBoundsDelta,
  type Bounds,
  boundsCenter,
  clamp,
  copyCountFor,
  distributeBounds,
  distributePolarAngles,
  distributePolarRadii,
  flattenElement,
  inverseTransformPointForCopy,
  nearestSymmetryAngle,
  type Point,
  pointsBounds,
  rad,
  rotatePointAround,
  transformPointForCopy,
  unionBounds,
} from './geometry';
import type { McElement, McProject, TextAlign, TextElement } from './model';

/** 一行文字的量測結果（canvas 的 TextMetrics 的子集） */
export interface LineMetrics {
  width: number;
  actualBoundingBoxLeft?: number;
  actualBoundingBoxRight?: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
}

export type Measure = (font: string, align: TextAlign, line: string) => LineMetrics;

export interface TextLayout {
  fontSize: number;
  font: string;
  lines: string[];
  lineHeight: number;
}

export function textLayout(el: Pick<TextElement, 'fontSize' | 'fontFamily' | 'text'>): TextLayout {
  const fontSize = Math.max(4, Number(el.fontSize) || 54);
  return {
    fontSize,
    font: `${fontSize}px ${el.fontFamily || 'serif'}`,
    lines: String(el.text ?? '').split(/\r\n?|\n/),
    lineHeight: fontSize * 1.2,
  };
}

const cache = new WeakMap<Measure, WeakMap<object, { text?: Bounds; bounds?: Bounds }>>();
function entry(measure: Measure, el: object) {
  let m = cache.get(measure);
  if (!m) {
    m = new WeakMap();
    cache.set(measure, m);
  }
  let e = m.get(el);
  if (!e) {
    e = {};
    m.set(el, e);
  }
  return e;
}

/** 文字（未旋轉）的外框：實際字形範圍（上緣 ≥ 0.8 字級、下緣 ≥ 0.2 字級、寬 ≥ 0.35 字級）＋線寬一半 */
export function textBounds(el: TextElement, measure: Measure): Bounds {
  const e = entry(measure, el);
  if (e.text) return e.text;
  const { fontSize, font, lines, lineHeight } = textLayout(el);
  const align = el.textAlign || 'center';
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  lines.forEach((line, i) => {
    const m = measure(font, align, line || ' ');
    const w = m.width;
    const fallbackLeft = align === 'right' ? w : align === 'center' ? w / 2 : 0;
    const fallbackRight = align === 'left' ? w : align === 'center' ? w / 2 : 0;
    const left = Number.isFinite(m.actualBoundingBoxLeft)
      ? (m.actualBoundingBoxLeft as number)
      : fallbackLeft;
    const right = Number.isFinite(m.actualBoundingBoxRight)
      ? (m.actualBoundingBoxRight as number)
      : fallbackRight;
    const ascent = Math.max(fontSize * 0.8, Number(m.actualBoundingBoxAscent) || 0);
    const descent = Math.max(fontSize * 0.2, Number(m.actualBoundingBoxDescent) || 0);
    const base = i * lineHeight;
    minX = Math.min(minX, -left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, base - ascent);
    maxY = Math.max(maxY, base + descent);
  });
  const minW = fontSize * 0.35;
  if (maxX - minX < minW) {
    if (align === 'left') maxX = minX + minW;
    else if (align === 'right') minX = maxX - minW;
    else {
      const c = (minX + maxX) / 2;
      minX = c - minW / 2;
      maxX = c + minW / 2;
    }
  }
  const pad = Math.max(0, Number(el.style?.strokeWidth) || 0) / 2;
  e.text = {
    minX: el.x + minX - pad,
    minY: el.y + minY - pad,
    maxX: el.x + maxX + pad,
    maxY: el.y + maxY + pad,
  };
  return e.text;
}

/** 外接框（路徑、圓＝折線品質 0.65；文字＝旋轉後的外框） */
export function elementBounds(el: McElement, measure: Measure): Bounds {
  const e = entry(measure, el);
  if (e.bounds) return e.bounds;
  let b: Bounds;
  if (el.type === 'text') {
    const base = textBounds(el, measure);
    const rot = Number(el.rotation) || 0;
    if (!rot) b = base;
    else {
      const corners = [
        { x: base.minX, y: base.minY },
        { x: base.maxX, y: base.minY },
        { x: base.maxX, y: base.maxY },
        { x: base.minX, y: base.maxY },
      ].map((p) => rotatePointAround(p, el, rot));
      b = pointsBounds(corners);
    }
  } else {
    b = pointsBounds(flattenElement(el, 0.65).points);
  }
  e.bounds = b;
  return b;
}

/** 元素中心：圓與文字是原點，路徑是外接框中心 */
export function elementCenter(el: McElement, measure: Measure): Point {
  if (el.type === 'circle' || el.type === 'text') return { x: el.x, y: el.y };
  return boundsCenter(elementBounds(el, measure));
}

/** 版面外框：外接框＋線寬一半（文字的外框已含） */
export function layoutBounds(el: McElement, measure: Measure): Bounds {
  const b = elementBounds(el, measure);
  if (el.type === 'text') return { ...b };
  const pad = Math.max(0, Number(el.style?.strokeWidth) || 0) / 2;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

/** 對齊、微調、全選的對象：空路徑除外 */
export const isLayoutElement = (el: McElement | null | undefined): el is McElement =>
  !!el && (el.type !== 'path' || el.points.length > 0);

/* ---------- 對齊與分佈（規格 3.6） ---------- */

export type AlignAction =
  | 'align-left'
  | 'align-center-x'
  | 'align-right'
  | 'align-top'
  | 'align-center-y'
  | 'align-bottom'
  | 'distribute-x'
  | 'distribute-y'
  | 'symmetry-center'
  | 'symmetry-guide'
  | 'symmetry-sector'
  | 'symmetry-radius'
  | 'symmetry-angle-space'
  | 'symmetry-radius-space';

export const BOUNDS_ACTIONS: readonly AlignAction[] = [
  'align-left',
  'align-center-x',
  'align-right',
  'align-top',
  'align-center-y',
  'align-bottom',
];
export const DISTRIBUTE_ACTIONS: readonly AlignAction[] = ['distribute-x', 'distribute-y'];
export const SYMMETRY_ACTIONS: readonly AlignAction[] = [
  'symmetry-center',
  'symmetry-guide',
  'symmetry-sector',
  'symmetry-radius',
  'symmetry-angle-space',
  'symmetry-radius-space',
];

export type AlignReference = 'canvas' | 'selection' | 'key';

export interface AlignSelection {
  /** 已選的元素（清單順序） */
  selected: readonly McElement[];
  /** 基準元素 */
  key: McElement | null;
}

/** 對齊按鈕能不能按（規格 3.6 的啟用條件） */
export function alignEnabled(
  project: McProject,
  sel: AlignSelection,
  reference: AlignReference,
  action: AlignAction,
): boolean {
  const layout = sel.selected.filter(isLayoutElement);
  const movable = layout.filter((el) => !el.locked);
  const key = sel.key;
  const keyTargets = movable.filter((el) => el.id !== key?.id);
  const sym = project.symmetry;
  if (action === 'distribute-x' || action === 'distribute-y') return movable.length >= 3;
  if (action === 'symmetry-center' || action === 'symmetry-guide')
    return sym.enabled && movable.length >= 1;
  if (action === 'symmetry-sector')
    return sym.enabled && sym.count >= 2 && !sym.mirror && movable.length >= 1;
  if (action === 'symmetry-radius')
    return sym.enabled && isLayoutElement(key) && keyTargets.length >= 1;
  if (action === 'symmetry-angle-space')
    return sym.enabled && sym.count >= 2 && !sym.mirror && movable.length >= 3;
  if (action === 'symmetry-radius-space') return sym.enabled && movable.length >= 3;
  if (reference === 'canvas') return movable.length >= 1;
  if (reference === 'selection') return layout.length >= 2 && movable.length >= 1;
  return isLayoutElement(key) && layout.length >= 2 && keyTargets.length >= 1;
}

export interface MovePlan {
  id: string;
  dx: number;
  dy: number;
}

export type AlignResult =
  | { ok: true; plans: MovePlan[] }
  | {
      ok: false;
      reason:
        | 'nothing'
        | 'needKey'
        | 'noTargets'
        | 'needThree'
        | 'needThreeAngle'
        | 'needThreeRadius'
        | 'needSymmetry'
        | 'mirrorBlocked';
    };

interface Placement {
  el: McElement;
  source: Point;
  count: number;
  radius: number;
  angle: number;
}

function placementOf(project: McProject, el: McElement, measure: Measure): Placement {
  const sym = project.symmetry;
  const source = boundsCenter(layoutBounds(el, measure));
  const count = copyCountFor(sym, el);
  const display = transformPointForCopy(sym, source, 0, count);
  const dx = display.x - sym.centerX;
  const dy = display.y - sym.centerY;
  const radius = Math.hypot(dx, dy);
  const base = rad(sym.offset || 0) - Math.PI / 2;
  return { el, source, count, radius, angle: radius > 1e-9 ? Math.atan2(dy, dx) : base };
}

function planTo(project: McProject, p: Placement, target: Point): MovePlan {
  const src = inverseTransformPointForCopy(project.symmetry, target, 0, p.count);
  return { id: p.el.id, dx: src.x - p.source.x, dy: src.y - p.source.y };
}

const polar = (c: Point, angle: number, radius: number): Point => ({
  x: c.x + Math.cos(angle) * radius,
  y: c.y + Math.sin(angle) * radius,
});

/** 對齊、分佈的移動計畫（不改資料）；失敗時回傳原因 */
export function planAlignment(
  project: McProject,
  sel: AlignSelection,
  reference: AlignReference,
  action: AlignAction,
  measure: Measure,
): AlignResult {
  const layout = sel.selected.filter(isLayoutElement);
  const movable = layout.filter((el) => !el.locked);

  if (action.startsWith('align-')) {
    let ref: Bounds | null;
    let targets = movable;
    if (reference === 'canvas') {
      ref = { minX: 0, minY: 0, maxX: project.document.width, maxY: project.document.height };
    } else if (reference === 'selection') {
      ref = unionBounds(layout.map((el) => layoutBounds(el, measure)));
    } else {
      const key = sel.key;
      if (!isLayoutElement(key)) return { ok: false, reason: 'needKey' };
      ref = layoutBounds(key, measure);
      targets = movable.filter((el) => el.id !== key.id);
    }
    if (!ref || !targets.length) return { ok: false, reason: 'noTargets' };
    const mode = action.slice('align-'.length) as AlignMode;
    const r = ref;
    return {
      ok: true,
      plans: targets.map((el) => ({
        id: el.id,
        ...alignBoundsDelta(layoutBounds(el, measure), r, mode),
      })),
    };
  }

  if (action.startsWith('distribute-')) {
    if (movable.length < 3) return { ok: false, reason: 'needThree' };
    const axis = action === 'distribute-x' ? 'x' : 'y';
    const items = movable.map((el) => ({
      id: el.id,
      bounds: layoutBounds(el, measure),
      order: project.elements.indexOf(el),
    }));
    return {
      ok: true,
      plans: distributeBounds(items, axis).map((it) => ({
        id: it.id,
        dx: axis === 'x' ? it.delta : 0,
        dy: axis === 'y' ? it.delta : 0,
      })),
    };
  }

  const sym = project.symmetry;
  if (!sym.enabled) return { ok: false, reason: 'needSymmetry' };
  if (sym.mirror && (action === 'symmetry-sector' || action === 'symmetry-angle-space'))
    return { ok: false, reason: 'mirrorBlocked' };
  if (!movable.length) return { ok: false, reason: 'nothing' };
  const placements = movable.map((el) => placementOf(project, el, measure));
  const center = { x: sym.centerX, y: sym.centerY };
  const base = rad(sym.offset || 0) - Math.PI / 2;
  const count = clamp(Math.round(sym.count), 1, 64);

  if (action === 'symmetry-center')
    return { ok: true, plans: placements.map((p) => planTo(project, p, center)) };
  if (action === 'symmetry-guide' || action === 'symmetry-sector') {
    const sector = action === 'symmetry-sector';
    return {
      ok: true,
      plans: placements.map((p) =>
        planTo(
          project,
          p,
          polar(center, nearestSymmetryAngle(p.angle, base, count, sector), p.radius),
        ),
      ),
    };
  }
  if (action === 'symmetry-radius') {
    const key = sel.key;
    if (!isLayoutElement(key)) return { ok: false, reason: 'needKey' };
    const keyRadius = placementOf(project, key, measure).radius;
    return {
      ok: true,
      plans: placements
        .filter((p) => p.el.id !== key.id)
        .map((p) => planTo(project, p, polar(center, p.angle, keyRadius))),
    };
  }
  if (action === 'symmetry-angle-space') {
    if (placements.length < 3) return { ok: false, reason: 'needThreeAngle' };
    const byId = new Map(placements.map((p) => [p.el.id, p]));
    const layoutA = distributePolarAngles(
      placements.map((p, order) => ({ id: p.el.id, angle: p.angle, order })),
    );
    return {
      ok: true,
      plans: layoutA.map((it) => {
        const p = byId.get(it.id)!;
        return planTo(project, p, polar(center, it.angle, p.radius));
      }),
    };
  }
  if (placements.length < 3) return { ok: false, reason: 'needThreeRadius' };
  const byId = new Map(placements.map((p) => [p.el.id, p]));
  const layoutR = distributePolarRadii(
    placements.map((p, order) => ({ id: p.el.id, radius: p.radius, order })),
  );
  return {
    ok: true,
    plans: layoutR.map((it) => {
      const p = byId.get(it.id)!;
      return planTo(project, p, polar(center, p.angle, it.radius));
    }),
  };
}

/** 真的需要移動的計畫（位移 > 1e-7） */
export const actionablePlans = (plans: readonly MovePlan[]): MovePlan[] =>
  plans.filter(
    (p) =>
      Number.isFinite(p.dx) &&
      Number.isFinite(p.dy) &&
      (Math.abs(p.dx) > 1e-7 || Math.abs(p.dy) > 1e-7),
  );
