/**
 * 編輯畫面的畫布（規格 F20、F30～F35、F47）：共用的可縮放盤面（PanZoomViewport；世界座標＝格，「符合畫面」＝整張放進畫面）。
 *
 * - 滑鼠：游標停著時顯示會吸附到的點（直線、多角形吸附格點，塗色吸附線的交點）與從上一點拉過來的線；
 *   按下到放開算點一下（放開的位置）；右鍵＝退一點。
 * - 觸控：一指按著先看吸附的位置，移到想要的地方放開才加點；兩指捏合縮放、兩指拖曳平移。
 * - 傷害格：按下的那一格與拖過的格子都加進草稿（一次拖曳是一步復原）。
 * - 格子外面拖曳＝平移；滾輪＝縮放；空白鍵＋拖曳、中鍵拖曳＝平移。
 * - 捲到格子外時，上方與左邊的座標貼在畫面邊上。
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  type PanZoomView,
  PanZoomViewport,
  type PanZoomViewportHandle,
  type ViewportDrag,
  type ViewportPointer,
} from '@/ui/PanZoomViewport';
import { doomedBy } from './model/draft';
import {
  cellAt as cellUnder,
  eraseFillPoints,
  nearestPoint,
  snapGrid,
  snapPoints,
} from './model/geometry';
import { type Cell, COLORS, type Pt, UNIT, type VeinCanvas } from './model/types';
import {
  type Layers,
  type Place,
  paintBody,
  paintCells,
  paintDoomedCell,
  paintDoomedFill,
  paintDoomedLine,
  paintLabels,
  paintLine,
  paintName,
  paintPoint,
} from './render';
import {
  activeNow,
  cellAt,
  clickAt,
  docNow,
  draftNow,
  prefsNow,
  restoreDraft,
  stepBackDraft,
  useActive,
  useDoc,
  useDraft,
  usePrefs,
} from './store';
import { S } from './strings';

/** 盤面四周的留白（螢幕 px）：上方放名字與座標、左邊放座標 */
const PAD = { top: 50, left: 32, right: 14, bottom: 14 };
/** 格子外多少格以內按下仍算在格子上（夾到邊上的格點） */
const ACCEPT = 0.5;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.25;

type Cursor = { pt: Pt; cell?: undefined } | { cell: Cell; pt?: undefined } | null;

let viewport: PanZoomViewportHandle | null = null;

export const zoomIn = () => viewport?.zoomBy(ZOOM_STEP);
export const zoomOut = () => viewport?.zoomBy(1 / ZOOM_STEP);
export function fitView(): void {
  viewport?.zoomTo(1);
  requestAnimationFrame(() => viewport?.scrollTo(0, 0));
}

/** 格子座標 (x, y)（格；可以有小數）在螢幕上的位置（測試用；看不到時 null） */
export function gridToClient(x: number, y: number): { x: number; y: number } | null {
  const el = viewport?.element();
  const canvas = el?.querySelector('canvas');
  if (!viewport || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  const p = viewport.getView().toScreen(x, y);
  return { x: r.left + p.x, y: r.top + p.y };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 塗色可以吸附的點（刪除時也吸附現有塗色的頂點） */
const fillPoints = (c: VeinCanvas, erase: boolean) => (erase ? eraseFillPoints(c) : snapPoints(c));

/** 指標所在的位置會吸附到哪裡（目前的畫法；在格子外太遠時 null） */
function snapAt(wx: number, wy: number, c: VeinCanvas): Cursor {
  const { kind } = prefsNow();
  if (kind === 'damage') {
    const cell = cellUnder(wx, wy, c.size);
    return cell ? { cell } : null;
  }
  if (wx < -ACCEPT || wy < -ACCEPT || wx > c.size + ACCEPT || wy > c.size + ACCEPT) return null;
  if (kind === 'fill') {
    const d = draftNow();
    if (d?.figures.length) return null;
    const pt = nearestPoint(fillPoints(c, prefsNow().erase), wx * UNIT, wy * UNIT);
    return pt ? { pt } : null;
  }
  return { pt: snapGrid(wx, wy, c.size) };
}

export function Board() {
  const canvas = useActive();
  const draft = useDraft();
  const layers = usePrefs((s) => s.data.layers);
  const kind = usePrefs((s) => s.data.kind);
  const erase = usePrefs((s) => s.data.erase);
  const vp = useRef<PanZoomViewportHandle>(null);
  const cursor = useRef<Cursor>(null);
  const doomed = useMemo(() => doomedBy(canvas, draft), [canvas, draft]);
  const snaps = useMemo(
    () => (kind === 'fill' ? fillPoints(canvas, erase) : []),
    [kind, erase, canvas],
  );

  useEffect(() => {
    viewport = vp.current;
    window.__floria = { ...((window.__floria as object) ?? {}), gridToClient };
    return () => {
      viewport = null;
    };
  });

  /* 換畫法、換畫布時游標重來 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在這些值改變時清掉
  useEffect(() => {
    cursor.current = null;
    vp.current?.redraw();
  }, [kind, erase, canvas.id]);

  const draw = (ctx: CanvasRenderingContext2D, view: PanZoomView) => {
    const o = view.toScreen(0, 0);
    const cell = view.scale;
    const p: Place = { ox: o.x, oy: o.y, cell };
    const lw = clamp(cell / 48, 1, 3);
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, view.width, view.height);
    paintBody(ctx, canvas, p, layers, lw);
    paintDoomed(ctx, p, lw);
    /* 塗色時可以吸附的點 */
    for (const q of snaps) paintPoint(ctx, q, p, COLORS.snap, clamp(cell * 0.05, 2, 3.5));
    paintDraft(ctx, p, lw);
    paintMarks(ctx, view, p, layers);
  };

  const paintDoomed = (ctx: CanvasRenderingContext2D, p: Place, lw: number) => {
    for (const l of doomed.lines) paintDoomedLine(ctx, l, p, lw * 4 + 2);
    if (doomed.fill) paintDoomedFill(ctx, doomed.fill, p, lw + 1);
    for (const c of doomed.cells) paintDoomedCell(ctx, c, p, lw + 1);
  };

  const paintDraft = (ctx: CanvasRenderingContext2D, p: Place, lw: number) => {
    const w = Math.max(1.5, lw * 1.5);
    const r = clamp(p.cell * 0.08, 3.5, 6);
    const cur = cursor.current;
    if (kind === 'damage') {
      if (draft) paintCells(ctx, draft.cells, p, COLORS.draft, 0.7);
      if (cur?.cell) paintCells(ctx, [cur.cell], p, COLORS.draft, 0.4);
      return;
    }
    if (draft) {
      for (const f of draft.figures) {
        for (let i = 1; i < f.pts.length; i++)
          paintLine(ctx, f.pts[i - 1], f.pts[i], p, COLORS.draft, w);
        if (f.closed && f.pts.length > 2)
          paintLine(ctx, f.pts[f.pts.length - 1], f.pts[0], p, COLORS.draft, w);
        for (const q of f.pts) paintPoint(ctx, q, p, COLORS.draft, r);
      }
      const c = draft.current;
      for (let i = 1; i < c.length; i++) paintLine(ctx, c[i - 1], c[i], p, COLORS.draft, w);
      for (const q of c) paintPoint(ctx, q, p, COLORS.draft, r);
      if (cur?.pt && c.length) paintLine(ctx, c[c.length - 1], cur.pt, p, COLORS.draft, w);
    }
    if (cur?.pt) {
      paintPoint(ctx, cur.pt, p, COLORS.paper, r + 1.5);
      paintPoint(ctx, cur.pt, p, COLORS.draft, r);
    }
  };

  /** 名字與座標（座標捲到畫面外時貼在邊上） */
  const paintMarks = (ctx: CanvasRenderingContext2D, view: PanZoomView, p: Place, l: Layers) => {
    const cell = p.cell;
    const labelPx = clamp(cell * 0.28, 10, 16);
    const namePx = clamp(cell * 0.44, 13, 26);
    const gap = 3;
    paintName(
      ctx,
      canvas.name,
      p.ox + (canvas.size * cell) / 2,
      p.oy - labelPx - gap * 2,
      namePx,
      view.width - 16,
    );
    if (!l.grid) return;
    const topY = Math.max(p.oy - gap, labelPx + gap + 1);
    const leftW = labelPx * 1.4 + gap * 2;
    const leftX = Math.max(p.ox - PAD.left / 2, leftW / 2);
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    if (topY > p.oy - gap) ctx.fillRect(0, 0, view.width, labelPx + gap * 2 + 1);
    if (leftX > p.ox - PAD.left / 2) ctx.fillRect(0, 0, leftW, view.height);
    ctx.restore();
    paintLabels(ctx, canvas.size, p, labelPx, topY, leftX);
  };

  const redraw = () => vp.current?.redraw();

  const onHover = (q: ViewportPointer | null) => {
    cursor.current = q ? snapAt(q.wx, q.wy, activeNow()) : null;
    redraw();
  };

  const onPointerDown = (q: ViewportPointer): ViewportDrag | null => {
    const c = activeNow();
    const touchLike = q.pointerType !== 'mouse';
    if (prefsNow().kind === 'damage') {
      const first = cellUnder(q.wx, q.wy, c.size);
      if (!first) return null;
      const before = docNow().draft;
      useDoc.beginGesture();
      cellAt(first);
      cursor.current = { cell: first };
      redraw();
      return {
        cursor: 'crosshair',
        onMove: (m) => {
          const cc = cellUnder(m.wx, m.wy, c.size);
          cursor.current = cc ? { cell: cc } : null;
          if (cc) cellAt(cc);
          redraw();
        },
        onEnd: (m) => {
          useDoc.endGesture();
          cursor.current = touchLike ? null : snapAt(m.wx, m.wy, c);
          redraw();
        },
        onCancel: (reason) => {
          if (reason === 'pinch') restoreDraft(before);
          useDoc.endGesture();
          cursor.current = null;
          redraw();
        },
      };
    }
    const s = snapAt(q.wx, q.wy, c);
    if (!s?.pt) return null;
    cursor.current = s;
    redraw();
    return {
      cursor: 'crosshair',
      onMove: (m) => {
        cursor.current = snapAt(m.wx, m.wy, c);
        redraw();
      },
      onEnd: (m) => {
        const at = snapAt(m.wx, m.wy, c);
        if (at?.pt) clickAt(at.pt);
        cursor.current = touchLike ? null : snapAt(m.wx, m.wy, activeNow());
        redraw();
      },
      onCancel: () => {
        cursor.current = null;
        redraw();
      },
    };
  };

  const getCursor = (q: ViewportPointer) =>
    snapAt(q.wx, q.wy, activeNow()) ? 'crosshair' : undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右鍵＝退一點（原作的操作）；另有按鈕與 Backspace
    <div
      className="relative"
      onContextMenu={(e) => {
        e.preventDefault();
        stepBackDraft();
      }}
      data-testid="board"
      data-canvas={canvas.id}
      data-kind={kind}
      data-erase={erase ? 'true' : 'false'}
    >
      <PanZoomViewport
        ref={vp}
        world={{ x: 0, y: 0, width: canvas.size, height: canvas.size }}
        baseScale="fit"
        defaultZoom={1}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
        padding={PAD}
        align={{ x: 'center', y: 'start' }}
        pinch
        draw={draw}
        onPointerDown={onPointerDown}
        onHover={onHover}
        getCursor={getCursor}
        aria-label={S.view.boardLabel}
        className="h-[min(60dvh,600px,calc(100vw+24px))] min-h-72"
      />
    </div>
  );
}
