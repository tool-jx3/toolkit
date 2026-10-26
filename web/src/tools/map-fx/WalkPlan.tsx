/**
 * 進階 3D 的平面圖（規格 F74～F76、F82）：地圖上框出房間與走廊、在牆上放入口、依序點出移動路線。
 * 地圖以原圖大小排在共用的 Stage 裡（Stage 負責縮放），上面疊一層 SVG（原圖 px）收指標事件；不會匯出。
 *
 * - 房間／走廊：空白處拖曳框出；按在已有的上面選取並拖曳移動；選取的四個角拖曳改大小。
 * - 入口：在牆附近點一下放入口；按在入口上選取並拖曳（沿著牆移動，也能換到別面牆）。
 * - 路線：點一下加一點（現在位置 → 轉角 → 目的地）；按在點上拖曳移動。
 * - 拖曳一次記一步復原；Delete 刪除選取的、Backspace（路線）退回上一點、Esc 取消選取（WalkPreview）。
 */
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import type { ImageSource, Point, Rect } from '@/core/imagefx';
import { Stage, useStageScale } from '@/ui';
import {
  addDoor,
  addPathPoint,
  addRoom,
  gesture,
  moveDoor,
  selectWalk,
  setPathPoint,
  setRoomRect,
  useDoc,
  useWalk,
  walkSelected,
} from './store';
import { S } from './strings';
import {
  doorAt,
  doorSegment,
  nearestWall,
  snapMove,
  snapPoint,
  WALK_LIMITS,
  type WalkRoom,
  type WalkState,
} from './walk';

/** 平面圖上的顏色（只在編輯時；自訂） */
const PLAN = {
  room: '#34d399',
  hall: '#22d3ee',
  door: '#fbbf24',
  path: '#f59e0b',
  start: '#38bdf8',
  goal: '#fb7185',
  select: '#ffffff',
} as const;

type Corner = 'nw' | 'ne' | 'sw' | 'se';

type Drag =
  | { kind: 'create'; pointer: number; tool: 'room' | 'hall'; start: Point; cur: Point }
  | { kind: 'move'; pointer: number; id: string; start: Point; orig: Rect; moved: boolean }
  | { kind: 'resize'; pointer: number; id: string; corner: Corner; orig: Rect }
  | { kind: 'door'; pointer: number; id: string; moved: boolean }
  | { kind: 'point'; pointer: number; index: number; moved: boolean };

const rectFrom = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
});

/** 最上面（清單後面）包含這點的房間 */
function roomAt(rooms: readonly WalkRoom[], p: Point): WalkRoom | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
  }
  return null;
}

function resized(orig: Rect, corner: Corner, p: Point): Rect {
  const x0 = corner === 'nw' || corner === 'sw' ? p.x : orig.x;
  const x1 = corner === 'ne' || corner === 'se' ? p.x : orig.x + orig.w;
  const y0 = corner === 'nw' || corner === 'ne' ? p.y : orig.y;
  const y1 = corner === 'sw' || corner === 'se' ? p.y : orig.y + orig.h;
  return rectFrom({ x: x0, y: y0 }, { x: x1, y: y1 });
}

const corners = (r: Rect): [Corner, Point][] => [
  ['nw', { x: r.x, y: r.y }],
  ['ne', { x: r.x + r.w, y: r.y }],
  ['sw', { x: r.x, y: r.y + r.h }],
  ['se', { x: r.x + r.w, y: r.y + r.h }],
];

/** 地圖本身（畫在原圖大小的畫布上） */
function PlanImage({ image }: { image: ImageSource }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(image, 0, 0);
  }, [image]);
  return (
    <canvas
      ref={ref}
      width={image.width}
      height={image.height}
      className="absolute inset-0 block size-full"
      aria-hidden
    />
  );
}

function PlanLayer({ walk, W, H }: { walk: WalkState; W: number; H: number }) {
  const tool = useWalk((l) => l.tool);
  const selection = useWalk((l) => l.selected);
  const sel = walkSelected(walk, selection);
  const scale = useStageScale();
  const k = 1 / scale;
  const root = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const tol = 10 * k;
  /** 吸附到鄰近房間的邊：6 螢幕 px 以內 */
  const snapTol = 6 * k;

  const point = (e: PointerEvent): Point => {
    const r = root.current?.getBoundingClientRect();
    return {
      x: r?.width ? ((e.clientX - r.left) / r.width) * W : 0,
      y: r?.height ? ((e.clientY - r.top) / r.height) * H : 0,
    };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    /* 焦點移到平面圖：文字欄的編輯結束（記成一步）、鍵盤（Delete、Backspace）給平面圖用 */
    root.current?.focus({ preventScroll: true });
    const p = point(e);
    const capture = () => e.currentTarget.setPointerCapture?.(e.pointerId);
    if (tool === 'path') {
      /* 按在點上（最近的那個）：選取＋拖曳；不然加一點 */
      let i = -1;
      let best = 9 * k;
      walk.path.forEach((q, j) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= best) {
          best = d;
          i = j;
        }
      });
      capture();
      if (i >= 0) {
        selectWalk({ kind: 'point', index: i });
        setDrag({ kind: 'point', pointer: e.pointerId, index: i, moved: false });
        return;
      }
      selectWalk(null);
      addPathPoint(p);
      return;
    }
    if (tool === 'door') {
      /* 按在入口上：離按的點最近的那個 */
      const near = doorAt(walk, p, tol);
      if (near) {
        selectWalk({ kind: 'door', id: near.id });
        capture();
        setDrag({ kind: 'door', pointer: e.pointerId, id: near.id, moved: false });
        return;
      }
      const hit = nearestWall(walk.rooms, p, tol);
      if (hit) addDoor(hit.room.id, hit.side, hit.at);
      else selectWalk(null);
      return;
    }
    /* 房間／走廊：選取的四個角 → 改大小；按在房間上 → 移動；空白處 → 框出新的 */
    if (sel?.kind === 'room') {
      const c = corners(sel.room).find(([, q]) => Math.hypot(q.x - p.x, q.y - p.y) <= 8 * k);
      if (c) {
        capture();
        setDrag({
          kind: 'resize',
          pointer: e.pointerId,
          id: sel.room.id,
          corner: c[0],
          orig: { x: sel.room.x, y: sel.room.y, w: sel.room.w, h: sel.room.h },
        });
        return;
      }
    }
    const hitRoom = roomAt(walk.rooms, p);
    capture();
    if (hitRoom) {
      selectWalk({ kind: 'room', id: hitRoom.id });
      setDrag({
        kind: 'move',
        pointer: e.pointerId,
        id: hitRoom.id,
        start: p,
        orig: { x: hitRoom.x, y: hitRoom.y, w: hitRoom.w, h: hitRoom.h },
        moved: false,
      });
      return;
    }
    const start = snapPoint(p, walk.rooms, snapTol);
    setDrag({ kind: 'create', pointer: e.pointerId, tool, start, cur: start });
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const p = point(e);
    if (drag.kind === 'create') {
      setDrag({ ...drag, cur: snapPoint(p, walk.rooms, snapTol) });
      return;
    }
    gesture.begin();
    if (drag.kind === 'move') {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) < 2 * k) return;
      if (!drag.moved) setDrag({ ...drag, moved: true });
      /* 吸附到鄰近房間的邊（共用的牆容易對齊） */
      setRoomRect(
        drag.id,
        snapMove(
          { ...drag.orig, x: drag.orig.x + dx, y: drag.orig.y + dy },
          walk.rooms,
          snapTol,
          drag.id,
        ),
      );
    } else if (drag.kind === 'resize') {
      setRoomRect(
        drag.id,
        resized(drag.orig, drag.corner, snapPoint(p, walk.rooms, snapTol, drag.id)),
      );
    } else if (drag.kind === 'door') {
      const hit = nearestWall(walk.rooms, p, tol * 3);
      if (hit) moveDoor(drag.id, hit.room.id, hit.side, hit.at);
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else if (drag.kind === 'point') {
      setPathPoint(drag.index, p);
      if (!drag.moved) setDrag({ ...drag, moved: true });
    }
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (drag.kind === 'create') {
      const r = rectFrom(drag.start, snapPoint(point(e), walk.rooms, snapTol));
      if (r.w >= WALK_LIMITS.minSize && r.h >= WALK_LIMITS.minSize) addRoom(drag.tool, r);
      else selectWalk(null);
    } else gesture.commit();
    setDrag(null);
  };

  const sw = 2 * k;
  const draft = drag?.kind === 'create' ? rectFrom(drag.start, drag.cur) : null;
  const fs = 13 * k;
  const cursor =
    tool === 'path' || tool === 'door'
      ? 'crosshair'
      : drag?.kind === 'move'
        ? 'grabbing'
        : 'crosshair';

  return (
    <svg
      ref={root}
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 block size-full touch-none select-none outline-none"
      style={{ cursor }}
      role="application"
      tabIndex={-1}
      aria-label={S.walk.planLabel}
      data-testid="walk-plan"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {walk.rooms.map((r) => {
        const color = r.kind === 'hall' ? PLAN.hall : PLAN.room;
        const on = sel?.kind === 'room' && sel.room.id === r.id;
        return (
          <g key={r.id} data-room={r.id}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill={color}
              fillOpacity={on ? 0.22 : 0.12}
              stroke={on ? PLAN.select : color}
              strokeWidth={on ? sw * 1.4 : sw}
              strokeDasharray={r.kind === 'hall' ? `${6 * k} ${4 * k}` : undefined}
            />
            {r.name.trim() ? (
              <text
                x={r.x + 5 * k}
                y={r.y + 5 * k}
                fontSize={fs}
                fontWeight={700}
                textAnchor="start"
                dominantBaseline="hanging"
                fill="#ffffff"
                stroke="#0b1512"
                strokeWidth={3 * k}
                paintOrder="stroke"
              >
                {r.name.trim()}
              </text>
            ) : null}
            {on
              ? corners(r).map(([c, q]) => (
                  <rect
                    key={c}
                    x={q.x - 5 * k}
                    y={q.y - 5 * k}
                    width={10 * k}
                    height={10 * k}
                    fill={PLAN.select}
                    stroke={color}
                    strokeWidth={sw}
                  />
                ))
              : null}
          </g>
        );
      })}
      {walk.doors.map((d) => {
        const room = walk.rooms.find((r) => r.id === d.room);
        if (!room) return null;
        const [a, b] = doorSegment(room, d, walk.door);
        const on = sel?.kind === 'door' && sel.door.id === d.id;
        return (
          <g key={d.id} data-door={d.id}>
            {on ? (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={PLAN.select}
                strokeWidth={9 * k}
                strokeLinecap="round"
              />
            ) : null}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={PLAN.door}
              strokeWidth={5 * k}
              strokeLinecap="round"
            />
          </g>
        );
      })}
      {walk.path.length ? (
        <g data-testid="walk-path">
          <polyline
            points={walk.path.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={PLAN.path}
            strokeWidth={3 * k}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {walk.path.map((p, i) => {
            const last = i === walk.path.length - 1 && i > 0;
            const color = i === 0 ? PLAN.start : last ? PLAN.goal : PLAN.path;
            const on = sel?.kind === 'point' && sel.index === i;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 路線的點沒有 id，順序就是身分
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={(on ? 8.5 : 7) * k}
                  fill={color}
                  stroke={on ? PLAN.select : '#0b1512'}
                  strokeWidth={on ? sw * 1.4 : sw}
                  data-point={i}
                  data-selected={on || undefined}
                />
                <text
                  x={p.x}
                  y={p.y}
                  fontSize={9 * k}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#0b1512"
                >
                  {i + 1}
                </text>
                {i === 0 || last ? (
                  <text
                    x={p.x}
                    y={p.y - 12 * k}
                    fontSize={fs}
                    fontWeight={700}
                    textAnchor="middle"
                    fill={color}
                    stroke="#0b1512"
                    strokeWidth={3 * k}
                    paintOrder="stroke"
                  >
                    {i === 0 ? S.walk.start : S.walk.goal}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      ) : null}
      {draft ? (
        <rect
          x={draft.x}
          y={draft.y}
          width={draft.w}
          height={draft.h}
          fill="none"
          stroke={drag?.kind === 'create' && drag.tool === 'hall' ? PLAN.hall : PLAN.room}
          strokeWidth={sw}
          strokeDasharray={`${4 * k} ${3 * k}`}
        />
      ) : null}
    </svg>
  );
}

/** 平面圖（Stage：縮放、符合畫面） */
export function WalkPlan({ image }: { image: ImageSource }) {
  const walk = useDoc((s) => s.data.walk);
  return (
    <Stage width={image.width} height={image.height} backgrounds={[]} aria-label={S.walk.planBar}>
      <div className="relative" style={{ width: image.width, height: image.height }}>
        <PlanImage image={image} />
        <PlanLayer walk={walk} W={image.width} H={image.height} />
      </div>
    </Stage>
  );
}
