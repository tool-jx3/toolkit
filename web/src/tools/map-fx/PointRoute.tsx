/**
 * 點選建立路線與編輯路線的點（規格 F33、F34）：疊在舞台上的一層（DOM，不會匯出；這時一般的編輯層藏起來）。
 * - 建立：依序點出經過的地方（同一點可以再點：U 字、往返），橡皮筋連到游標；Enter 確定、Backspace 退回上一點、Esc 取消。
 * - 編輯：拖曳圓點移動（一次拖曳一步復原）、點一下選取後 Delete 刪掉（至少留兩個）、在線上按兩下加一點；Enter／Esc 結束。
 * - 滑鼠中鍵拖曳照樣移動顯示的位置。座標：這一層是畫面 px，點存原圖 px。
 */
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { type Layout, type Point, type Size, toSourcePoint } from '@/core/imagefx';
import { isEditableTarget, useStageScale } from '@/ui';
import { nearestSegment } from './model';
import {
  addDraftPoint,
  addPointOnSegment,
  deletePoint,
  endPointMode,
  finishPointRoute,
  type PointMode,
  routeById,
  setPoints,
  undoDraftPoint,
  useDoc,
  usePoints,
} from './store';
import { S } from './strings';

const toCanvas = (layout: Layout, p: Point): Point => ({
  x: layout.shot.x + p.x * layout.shot.f,
  y: layout.shot.y + p.y * layout.shot.f,
});

/** 這一層的鍵盤：Enter、Backspace／Delete、Esc（焦點在文字欄時不作用；Esc 不讓共用的 Esc 再處理一次） */
function usePointKeys(draft: PointMode) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"]')
      )
        return;
      const d = usePoints.getState().draft;
      if (!d) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        endPointMode();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (d.mode === 'create') finishPointRoute();
        else endPointMode();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        if (d.mode === 'create') undoDraftPoint();
        else if (d.active !== null) deletePoint(d.id, d.active);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return draft;
}

type Drag =
  | { kind: 'pan'; pointer: number; x: number; y: number; left: number; top: number }
  | { kind: 'point'; pointer: number; index: number; moved: boolean; start: Point };

export function PointRouteLayer({
  layout,
  image,
  viewport,
  draft,
}: {
  layout: Layout;
  image: Size;
  viewport: () => HTMLElement | null;
  draft: PointMode;
}) {
  usePointKeys(draft);
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scale = useStageScale();
  const k = 1 / scale;
  const { width: W, height: H } = layout.canvas;
  const editing = draft.mode === 'edit' ? routeById(draft.id) : null;
  /* 編輯中的路線被復原掉、刪掉了，或復原回拖曳畫出的形狀（不再是點選的）：結束 */
  const exists = useDoc((s) =>
    draft.mode === 'edit'
      ? s.data.frames.some((f) => f.id === draft.id && f.kind === 'route' && f.shape === 'points')
      : true,
  );
  useEffect(() => {
    if (!exists) endPointMode();
  }, [exists]);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  const canvasPoint = (e: PointerEvent) => {
    const r = root.current?.getBoundingClientRect();
    return {
      x: r?.width ? ((e.clientX - r.left) / r.width) * W : 0,
      y: r?.height ? ((e.clientY - r.top) / r.height) * H : 0,
    };
  };
  const sourcePoint = (e: PointerEvent): Point => {
    const p = canvasPoint(e);
    const s = toSourcePoint(layout.shot, image, p.x, p.y);
    return { x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10 };
  };

  const points = draft.mode === 'create' ? draft.points : (editing?.points ?? []);
  const canvasPts = points.map((p) => toCanvas(layout, p));
  const handleR = 7 * k;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      const vp = viewport();
      if (!vp) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({
        kind: 'pan',
        pointer: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: vp.scrollLeft,
        top: vp.scrollTop,
      });
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    root.current?.focus({ preventScroll: true });
    if (draft.mode === 'create') {
      addDraftPoint(sourcePoint(e));
      return;
    }
    /* 編輯：按在點上＝選取＋開始拖曳 */
    const c = canvasPoint(e);
    let hit = -1;
    let best = Number.POSITIVE_INFINITY;
    canvasPts.forEach((p, i) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d <= handleR * 1.6 && d < best) {
        best = d;
        hit = i;
      }
    });
    if (hit < 0) {
      usePoints.setState({ draft: { ...draft, active: null } });
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    usePoints.setState({ draft: { ...draft, active: hit } });
    setDrag({ kind: 'point', pointer: e.pointerId, index: hit, moved: false, start: points[hit] });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) {
      if (draft.mode === 'create') setHover(sourcePoint(e));
      return;
    }
    if (drag.pointer !== e.pointerId) return;
    if (drag.kind === 'pan') {
      const vp = viewport();
      if (vp) {
        vp.scrollLeft = drag.left - (e.clientX - drag.x);
        vp.scrollTop = drag.top - (e.clientY - drag.y);
      }
      return;
    }
    if (draft.mode !== 'edit' || !editing) return;
    const p = sourcePoint(e);
    if (!drag.moved) {
      useDoc.beginGesture();
      setDrag({ ...drag, moved: true });
    }
    const next = editing.points.map((x, i) => (i === drag.index ? p : x));
    setPoints(draft.id, next);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    if (drag.kind === 'point' && drag.moved) useDoc.endGesture();
    setDrag(null);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draft.mode !== 'edit' || !editing) return;
    const r = root.current?.getBoundingClientRect();
    if (!r?.width) return;
    const c = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    if (canvasPts.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= handleR * 1.6)) return;
    const s = toSourcePoint(layout.shot, image, c.x, c.y);
    const near = nearestSegment(editing.points, s);
    if (near && near.distance * layout.shot.f * scale <= 12)
      addPointOnSegment(draft.id, near.index, {
        x: Math.round(s.x * 10) / 10,
        y: Math.round(s.y * 10) / 10,
      });
  };

  const line = canvasPts.map((p) => `${p.x},${p.y}`).join(' ');
  const last = canvasPts[canvasPts.length - 1];
  const hoverC = hover && draft.mode === 'create' ? toCanvas(layout, hover) : null;
  const active = draft.mode === 'edit' ? draft.active : null;

  return (
    <div
      ref={root}
      role="application"
      tabIndex={-1}
      aria-label={S.pointLayer}
      className="absolute inset-0 touch-none outline-none"
      style={{
        cursor:
          drag?.kind === 'pan' ? 'grabbing' : draft.mode === 'create' ? 'crosshair' : 'default',
      }}
      data-testid="point-layer"
      data-mode={draft.mode}
      data-points={points.length}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        viewBox={`0 0 ${W} ${H}`}
      >
        <rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.12)" />
        {canvasPts.length > 1 ? (
          <>
            <polyline
              points={line}
              fill="none"
              stroke="rgba(0,0,0,0.6)"
              strokeWidth={5 * k}
              strokeLinejoin="round"
            />
            <polyline
              points={line}
              fill="none"
              stroke="#facc15"
              strokeWidth={2.5 * k}
              strokeDasharray={`${8 * k} ${5 * k}`}
              strokeLinejoin="round"
            />
          </>
        ) : null}
        {last && hoverC ? (
          <line
            x1={last.x}
            y1={last.y}
            x2={hoverC.x}
            y2={hoverC.y}
            stroke="#facc15"
            strokeOpacity={0.7}
            strokeWidth={1.8 * k}
            strokeDasharray={`${4 * k} ${4 * k}`}
          />
        ) : null}
        {canvasPts.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 點只有位置、沒有 id（同一個位置可以出現兩次）
          <g key={i} data-point={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={handleR}
              fill={i === active ? '#facc15' : i === 0 ? '#22c55e' : '#ffffff'}
              stroke="#000"
              strokeWidth={1.5 * k}
            />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={8 * k}
              fontWeight={700}
              fill="#000"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
