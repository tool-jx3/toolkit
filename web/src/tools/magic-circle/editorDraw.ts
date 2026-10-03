/**
 * 編輯畫面（只在編輯時畫，不會匯出）：工作區上的畫布、格線、對稱線、正在畫的預覽、選取外觀、吸附標記（規格 1.3、1.4）。
 * 作品本身用 render.ts 的 renderElements（與匯出相同）。
 */
import { clamp, copyAngle, type Point } from './geometry';
import { elementBounds, textBounds } from './layout';
import type { McElement, McProject, PathPoint } from './model';
import { type Ctx2D, cachedPath, canvasMeasure, renderElements, rgbOf } from './render';

export type ToolId =
  | 'select'
  | 'pen'
  | 'freehand'
  | 'line'
  | 'circle'
  | 'polygon'
  | 'star'
  | 'text'
  | 'pan';

export const TOOL_IDS: readonly ToolId[] = [
  'select',
  'pen',
  'freehand',
  'line',
  'circle',
  'polygon',
  'star',
  'text',
  'pan',
];

export type ShapeTool = 'line' | 'circle' | 'polygon' | 'star';

/** 正在畫的東西 */
export type Draft =
  | { type: 'path'; points: PathPoint[]; preview: Point | null; handleIndex: number | null }
  | { type: 'freehand'; points: Point[] }
  | { type: 'shape'; tool: ShapeTool; start: Point; current: Point; element: McElement };

export interface SnapMarker {
  point: Point;
  label: string;
}

export interface EditorOverlay {
  tool: ToolId;
  showGuides: boolean;
  /** 已選的元素（清單順序） */
  selected: readonly McElement[];
  primary: McElement | null;
  node: { id: string; index: number } | null;
  draft: Draft | null;
  snap: SnapMarker | null;
}

function drawGrid(ctx: Ctx2D, project: McProject, zoom: number): void {
  const size = Math.max(2, Number(project.snap.gridSize) || 25);
  const stride = Math.max(1, Math.ceil(4 / Math.max(0.001, size * zoom)));
  const step = size * stride;
  const { width, height } = project.document;
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  for (const major of [false, true]) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      if ((Math.round(x / size) % 4 === 0) !== major) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += step) {
      if ((Math.round(y / size) % 4 === 0) !== major) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.strokeStyle = major ? 'rgba(139,147,198,.15)' : 'rgba(139,147,198,.055)';
    ctx.stroke();
  }
  ctx.restore();
}

function drawGuides(ctx: Ctx2D, project: McProject, zoom: number): void {
  const s = project.symmetry;
  const count = s.enabled ? clamp(Math.round(s.count), 1, 64) : 1;
  const radius = Math.hypot(project.document.width, project.document.height);
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([6 / zoom, 5 / zoom]);
  for (let i = 0; i < count; i++) {
    const a = copyAngle(s, i, count) - Math.PI / 2;
    ctx.strokeStyle = i === 0 ? 'rgba(87,216,255,.55)' : 'rgba(141,120,255,.25)';
    ctx.beginPath();
    ctx.moveTo(s.centerX, s.centerY);
    ctx.lineTo(s.centerX + Math.cos(a) * radius, s.centerY + Math.sin(a) * radius);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#57d8ff';
  ctx.beginPath();
  ctx.arc(s.centerX, s.centerY, 4 / zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(87,216,255,.6)';
  ctx.beginPath();
  ctx.arc(s.centerX, s.centerY, 11 / zoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 選取外觀用的外接框（文字以畫布量測） */
const boundsForOverlay = (el: McElement) => elementBounds(el, canvasMeasure);

function drawSecondary(ctx: Ctx2D, o: EditorOverlay, zoom: number): void {
  const others = o.selected.filter((el) => el.id !== o.primary?.id && el.visible);
  if (!others.length) return;
  ctx.save();
  ctx.lineWidth = 1.15 / zoom;
  ctx.strokeStyle = 'rgba(141,120,255,.9)';
  ctx.setLineDash([4 / zoom, 4 / zoom]);
  for (const el of others) {
    const b = boundsForOverlay(el);
    ctx.strokeRect(
      b.minX,
      b.minY,
      Math.max(0.001, b.maxX - b.minX),
      Math.max(0.001, b.maxY - b.minY),
    );
  }
  ctx.restore();
}

function drawSelection(ctx: Ctx2D, o: EditorOverlay, zoom: number): void {
  const el = o.primary;
  if (!el?.visible) return;
  ctx.save();
  ctx.lineWidth = 1.4 / zoom;
  ctx.strokeStyle = 'rgba(255,197,91,.9)';
  ctx.fillStyle = '#ffd36a';
  ctx.setLineDash([5 / zoom, 4 / zoom]);
  if (el.type === 'path') {
    ctx.stroke(cachedPath(el));
    ctx.setLineDash([]);
    el.points.forEach((p, i) => {
      const selected = o.node?.id === el.id && o.node.index === i;
      const r = (selected ? 5.6 : 4.2) / zoom;
      const hasHandles =
        Math.hypot(p.inX - p.x, p.inY - p.y) > 0.01 ||
        Math.hypot(p.outX - p.x, p.outY - p.y) > 0.01;
      if (selected || hasHandles) {
        ctx.strokeStyle = 'rgba(255,211,106,.55)';
        ctx.beginPath();
        ctx.moveTo(p.inX, p.inY);
        ctx.lineTo(p.x, p.y);
        ctx.lineTo(p.outX, p.outY);
        ctx.stroke();
        ctx.fillStyle = '#6ee7ff';
        const h = 3.2 / zoom;
        for (const q of [
          { x: p.inX, y: p.inY },
          { x: p.outX, y: p.outY },
        ]) {
          ctx.beginPath();
          ctx.rect(q.x - h, q.y - h, h * 2, h * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = selected ? '#ffffff' : '#ffd36a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b4b00';
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.lineWidth = 1.4 / zoom;
    });
  } else if (el.type === 'circle') {
    ctx.stroke(cachedPath(el));
    ctx.setLineDash([]);
    const handles = [
      { x: el.x, y: el.y },
      { x: el.x + el.rx, y: el.y },
      { x: el.x, y: el.y + el.ry },
    ];
    handles.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? '#ffd36a' : '#6ee7ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.7 / zoom, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    const b = textBounds(el, canvasMeasure);
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.rotate(el.rotation || 0);
    ctx.strokeRect(b.minX - el.x, b.minY - el.y, b.maxX - b.minX, b.maxY - b.minY);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd36a';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawDraft(ctx: Ctx2D, draft: Draft, zoom: number, dpr: number): void {
  ctx.save();
  ctx.strokeStyle = '#ffe78c';
  ctx.fillStyle = '#ffe78c';
  ctx.lineWidth = 2 / zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#ffb000';
  ctx.shadowBlur = 10 * dpr;
  if (draft.type === 'path') {
    const pts = draft.points;
    if (pts.length) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        ctx.bezierCurveTo(a.outX, a.outY, b.inX, b.inY, b.x, b.y);
      }
      if (draft.preview) {
        const a = pts[pts.length - 1];
        const b = draft.preview;
        ctx.bezierCurveTo(a.outX, a.outY, b.x, b.y, b.x, b.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.8 / zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      if (draft.handleIndex !== null) {
        const p = pts[draft.handleIndex];
        if (p) {
          ctx.strokeStyle = '#6ee7ff';
          ctx.beginPath();
          ctx.moveTo(p.inX, p.inY);
          ctx.lineTo(p.outX, p.outY);
          ctx.stroke();
        }
      }
    }
  } else if (draft.type === 'freehand') {
    const pts = draft.points;
    if (pts.length) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else {
    ctx.stroke(cachedPath(draft.element));
  }
  ctx.restore();
}

function drawSnap(ctx: Ctx2D, m: SnapMarker, zoom: number): void {
  const { x, y } = m.point;
  ctx.save();
  ctx.strokeStyle = '#57d8ff';
  ctx.fillStyle = '#57d8ff';
  ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath();
  ctx.arc(x, y, 6 / zoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 10 / zoom, y);
  ctx.lineTo(x + 10 / zoom, y);
  ctx.moveTo(x, y - 10 / zoom);
  ctx.lineTo(x, y + 10 / zoom);
  ctx.stroke();
  /* 種類的標籤（固定螢幕大小） */
  ctx.translate(x, y);
  ctx.scale(1 / zoom, 1 / zoom);
  ctx.font = '600 11px system-ui, sans-serif';
  const w = ctx.measureText(m.label).width + 10;
  ctx.fillStyle = 'rgba(8,9,16,.85)';
  ctx.beginPath();
  ctx.roundRect(12, -24, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = '#57d8ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.label, 17, -15);
  ctx.restore();
}

export interface EditorView {
  /** 畫布原點在畫面上的位置（CSS px） */
  origin: Point;
  /** 每畫布單位幾個 CSS px */
  zoom: number;
  /** 螢幕像素密度 */
  dpr: number;
}

/** 畫整個編輯畫面（ctx 已換算成 CSS px） */
export function drawEditor(
  ctx: CanvasRenderingContext2D,
  view: EditorView,
  project: McProject,
  time: number,
  o: EditorOverlay,
): void {
  const { zoom, dpr } = view;
  const { width, height, transparent, background } = project.document;
  ctx.save();
  ctx.translate(view.origin.x, view.origin.y);
  ctx.scale(zoom, zoom);
  /* 畫布的陰影與底 */
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = 28 * dpr;
  ctx.shadowOffsetY = 10 * dpr;
  ctx.fillStyle = transparent ? 'rgba(13,15,26,.92)' : rgbOf(background);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  /* 作品（裁到畫布） */
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  if (!transparent) {
    ctx.fillStyle = rgbOf(background);
    ctx.fillRect(0, 0, width, height);
  }
  if (o.showGuides && project.snap.grid) drawGrid(ctx, project, zoom);
  renderElements(ctx, project, time, zoom * dpr);
  if (o.showGuides) drawGuides(ctx, project, zoom);
  if (o.draft) drawDraft(ctx, o.draft, zoom, dpr);
  if (o.tool === 'select') {
    drawSecondary(ctx, o, zoom);
    drawSelection(ctx, o, zoom);
  }
  if (o.snap) drawSnap(ctx, o.snap, zoom);
  ctx.restore();
  /* 細框 */
  ctx.strokeStyle = 'rgba(183,190,229,.3)';
  ctx.lineWidth = 1 / zoom;
  ctx.strokeRect(0, 0, width, height);
  ctx.restore();
}
