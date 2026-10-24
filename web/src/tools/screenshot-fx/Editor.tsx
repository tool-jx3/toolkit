/**
 * 編輯層（規格 F15～F25、F67～F71）：疊在舞台的畫面上（DOM，不會匯出）。
 * - 輔助線：每個框的虛線與編號；
 * - 拖曳畫框（Shift 在已有的框上也畫）、共用的 LayoutEditor（選取、拖曳、八個控點、方向鍵、Delete、Esc）；
 * - 第二批：手形（拖曳移動顯示的位置）、滑鼠中鍵隨時可以移動、框選放大（拖曳框出一塊，交給 onRegion）。
 * - 第一批驗證後：點一下與 Shift＋點一下都選疊放順序最上面的框（stackOrder，輔助線也照這個順序畫）；
 *   播放中不畫輔助線（框在原本的位置，跟彈出的卡片疊在一起會亂）；舞台縮得很小時圓標跟著縮小（至少 12 px）。
 * 座標：編輯層是畫面 px，框存原圖 px（換算見 model）。
 */
import { type PointerEvent, useRef, useState } from 'react';
import type { Box } from '@/core/layout';
import { LayoutEditor, type LayoutItem, useStageScale } from '@/ui';
import {
  badgeDiameter,
  type Frame,
  type FrameKind,
  frameAt,
  kindIndex,
  type Layout,
  LIMITS,
  type Placement,
  type Rect,
  rectFromDrag,
  type Size,
  stackOrder,
  toCanvasRect,
  toSourcePoint,
  toSourceRect,
} from './model';
import {
  addFrame,
  docNow,
  removeFrame,
  select,
  setFrameRect,
  useDoc,
  useLive,
  usePrefs,
} from './store';
import { S } from './strings';

/** 輔助線的顏色（只在預覽） */
const GUIDE_COLOR: Record<FrameKind, string> = {
  zoom: '#38bdf8',
  marker: '#facc15',
  redact: '#fb7185',
};

/* ---------- 輔助線（框的虛線與編號；不會匯出） ---------- */

function Guides({
  frames,
  shot,
  W,
  H,
}: {
  frames: readonly Frame[];
  shot: Placement;
  W: number;
  H: number;
}) {
  const scale = useStageScale();
  const k = 1 / scale;
  const d = badgeDiameter(W * scale);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${W} ${H}`}
      data-testid="guides"
      data-badge={d.toFixed(1)}
    >
      {stackOrder(frames).map((f) => {
        const i = frames.indexOf(f);
        const r = toCanvasRect(shot, f);
        const col = GUIDE_COLOR[f.kind];
        const rad = (d / 2) * k;
        const bx = Math.max(rad, r.x + rad * 0.2);
        const by = Math.max(rad, r.y - rad * 1.2 < 0 ? r.y + rad : r.y - rad * 0.2);
        return (
          <g key={f.id} data-guide-id={f.id}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="none"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={3.5 * k}
            />
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="none"
              stroke={col}
              strokeWidth={1.8 * k}
              strokeDasharray={`${7 * k} ${4 * k}`}
            />
            <circle cx={bx} cy={by} r={rad} fill={col} stroke="#000" strokeWidth={1 * k} />
            <text
              x={bx}
              y={by}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={d * 0.55 * k}
              fontWeight={700}
              fill="#000"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 編輯層 ---------- */

type Drag =
  | {
      kind: 'draw';
      pointer: number;
      a: { x: number; y: number };
      b: { x: number; y: number };
      shift: boolean;
    }
  | {
      kind: 'region';
      pointer: number;
      a: { x: number; y: number };
      b: { x: number; y: number };
    }
  | {
      kind: 'pan';
      pointer: number;
      x: number;
      y: number;
      left: number;
      top: number;
    };

/** 框選放大的範圍至少幾個螢幕 px（太小＝點一下，不放大） */
const REGION_MIN_PX = 8;
/** 框的點選範圍往外擴幾個螢幕 px（LayoutEditor 的 hitPadding，Shift＋點一下也用同一個） */
const HIT_PADDING = 4;

export function Editor({
  layout,
  image,
  frames,
  viewport,
  playing,
  onBeginEdit,
  onTogglePlay,
  onRegion,
}: {
  layout: Layout;
  image: Size;
  frames: readonly Frame[];
  /** 播放中：不畫輔助線 */
  playing: boolean;
  /** 可以捲動的舞台區域（手形、中鍵移動用） */
  viewport: () => HTMLElement | null;
  onBeginEdit: () => void;
  onTogglePlay: () => void;
  /** 框選放大：範圍（畫面 px） */
  onRegion: (r: Rect) => void;
}) {
  const selected = useLive((l) => l.selected);
  const pointerTool = useLive((l) => l.pointer);
  const guides = usePrefs((p) => p.data.guides);
  const { canvas, shot } = layout;
  const W = canvas.width;
  const H = canvas.height;
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scale = useStageScale();
  const k = 1 / scale;

  /** 畫面 px */
  const canvasPoint = (e: PointerEvent) => {
    const r = root.current?.getBoundingClientRect();
    return {
      x: r?.width ? ((e.clientX - r.left) / r.width) * W : 0,
      y: r?.height ? ((e.clientY - r.top) / r.height) * H : 0,
    };
  };
  /** 原圖 px（夾在圖裡） */
  const point = (e: PointerEvent) => {
    const p = canvasPoint(e);
    return toSourcePoint(shot, image, p.x, p.y);
  };
  const capture = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const beginDraw = (e: PointerEvent<HTMLDivElement>, shift: boolean) => {
    capture(e);
    onBeginEdit();
    const p = point(e);
    setDrag({ kind: 'draw', pointer: e.pointerId, a: p, b: p, shift });
  };
  const beginPan = (e: PointerEvent<HTMLDivElement>) => {
    const vp = viewport();
    if (!vp) return;
    capture(e);
    setDrag({
      kind: 'pan',
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: vp.scrollLeft,
      top: vp.scrollTop,
    });
  };
  const beginRegion = (e: PointerEvent<HTMLDivElement>) => {
    capture(e);
    const p = canvasPoint(e);
    setDrag({ kind: 'region', pointer: e.pointerId, a: p, b: p });
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    setDrag(null);
    if (drag.kind === 'pan') return;
    if (drag.kind === 'region') {
      const b = canvasPoint(e);
      const r = {
        x: Math.min(drag.a.x, b.x),
        y: Math.min(drag.a.y, b.y),
        w: Math.abs(b.x - drag.a.x),
        h: Math.abs(b.y - drag.a.y),
      };
      if (r.w * scale >= REGION_MIN_PX && r.h * scale >= REGION_MIN_PX) onRegion(r);
      return;
    }
    const b = point(e);
    const rect = rectFromDrag(drag.a, b, image);
    if (rect) {
      if (docNow().frames.length >= LIMITS.frames) return;
      addFrame(rect);
      return;
    }
    /* 沒有拖動＝點一下：Shift 時選取那裡最上面的框（和一般的點一下同一個順序與點選範圍），不然取消選取 */
    if (drag.shift) {
      const hit = frameAt(frames, selected, b, HIT_PADDING / (scale * shot.f));
      select(hit?.id ?? null, !!hit);
    } else select(null);
  };

  /* 疊放順序：放大框在下、其他在上；選取中的放最後（控點不被蓋住） */
  const ordered = stackOrder(frames, selected);
  const items: LayoutItem[] = ordered.map((f) => {
    const r = toCanvasRect(shot, f);
    const n = frames.indexOf(f) + 1;
    return {
      id: f.id,
      label: S.frameAria(n, S.frameName(f.kind, kindIndex(frames, f.id))),
      box: { x: r.x, y: r.y, width: r.w, height: r.h },
      resizable: true,
      handles: ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'],
      limits: {
        minWidth: LIMITS.minSize * shot.f,
        minHeight: LIMITS.minSize * shot.f,
        maxWidth: shot.w,
        maxHeight: shot.h,
      },
      clamp: (b: Box, op: 'move' | 'resize') => {
        if (op === 'move')
          return {
            ...b,
            x: Math.min(Math.max(b.x, shot.x), shot.x + shot.w - b.width),
            y: Math.min(Math.max(b.y, shot.y), shot.y + shot.h - b.height),
          };
        const x0 = Math.max(b.x, shot.x);
        const y0 = Math.max(b.y, shot.y);
        const x1 = Math.min(b.x + b.width, shot.x + shot.w);
        const y1 = Math.min(b.y + b.height, shot.y + shot.h);
        return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
      },
    };
  });

  const toSrc = (b: Box): Rect => toSourceRect(shot, { x: b.x, y: b.y, w: b.width, h: b.height });
  const onChange = (id: string, box: Box, change: { phase: string }) => {
    if (change.phase === 'start') {
      onBeginEdit();
      useDoc.beginGesture();
      return;
    }
    if (change.phase === 'end') {
      useDoc.endGesture();
      return;
    }
    /* 方向鍵連按（nudge）0.4 秒內的合成一步；拖曳在手勢裡 */
    setFrameRect(id, toSrc(box), change.phase === 'nudge');
  };

  let draft: Rect | null = null;
  if (drag?.kind === 'draw' && (drag.a.x !== drag.b.x || drag.a.y !== drag.b.y))
    draft = toCanvasRect(shot, {
      x: Math.min(drag.a.x, drag.b.x),
      y: Math.min(drag.a.y, drag.b.y),
      w: Math.abs(drag.b.x - drag.a.x),
      h: Math.abs(drag.b.y - drag.a.y),
    });
  else if (drag?.kind === 'region')
    draft = {
      x: Math.min(drag.a.x, drag.b.x),
      y: Math.min(drag.a.y, drag.b.y),
      w: Math.abs(drag.b.x - drag.a.x),
      h: Math.abs(drag.b.y - drag.a.y),
    };

  const cursor =
    drag?.kind === 'pan'
      ? 'grabbing'
      : pointerTool === 'hand'
        ? 'grab'
        : pointerTool === 'region'
          ? 'zoom-in'
          : 'crosshair';

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 拖曳畫框（鍵盤用清單與方向鍵）；只接住框的按鈕冒上來的空白鍵
    <div
      ref={root}
      className="absolute inset-0 touch-none"
      style={{ cursor }}
      data-testid="editor"
      data-pointer={pointerTool}
      onPointerDownCapture={(e) => {
        /* 中鍵：隨時移動顯示位置；手形、框選放大：不讓框的拖曳層收到；Shift＋拖曳：在已有的框上也畫新框 */
        if (e.button === 1) {
          e.stopPropagation();
          beginPan(e);
        } else if (e.button === 0 && pointerTool === 'hand') {
          e.stopPropagation();
          beginPan(e);
        } else if (e.button === 0 && pointerTool === 'region') {
          e.stopPropagation();
          beginRegion(e);
        } else if (e.button === 0 && e.shiftKey) {
          e.stopPropagation();
          beginDraw(e, true);
        }
      }}
      onPointerDown={(e) => {
        if (e.button === 0 && pointerTool === 'edit') beginDraw(e, false);
      }}
      onPointerMove={(e) => {
        if (!drag || drag.pointer !== e.pointerId) return;
        if (drag.kind === 'pan') {
          const vp = viewport();
          if (vp) {
            vp.scrollLeft = drag.left - (e.clientX - drag.x);
            vp.scrollTop = drag.top - (e.clientY - drag.y);
          }
        } else if (drag.kind === 'region') setDrag({ ...drag, b: canvasPoint(e) });
        else setDrag({ ...drag, b: point(e) });
      }}
      onPointerUp={end}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        /* 點了框之後焦點在框的按鈕上：空白鍵照樣播放／暫停（共用的快捷鍵把按鈕上的空白鍵讓給按鈕） */
        if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onTogglePlay();
        }
      }}
    >
      {guides && !playing ? <Guides frames={frames} shot={shot} W={W} H={H} /> : null}
      {draft ? (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          data-testid={drag?.kind === 'region' ? 'region-draft' : 'draw-draft'}
          style={{
            left: draft.x,
            top: draft.y,
            width: draft.w,
            height: draft.h,
            outline: `${2 * k}px dashed var(--accent)`,
            background:
              drag?.kind === 'region' ? 'rgba(80,160,255,0.12)' : 'rgba(255,255,255,0.12)',
          }}
        />
      ) : null}
      <div
        className={pointerTool === 'edit' ? 'contents' : 'contents [&_button]:pointer-events-none!'}
      >
        <LayoutEditor
          width={W}
          height={H}
          items={items}
          selectedId={selected}
          onSelect={(id) => select(id, !!id)}
          onChange={onChange}
          nudgeStep={shot.f}
          nudgeShiftStep={shot.f * 10}
          hitPadding={HIT_PADDING}
          guides={false}
          onDelete={removeFrame}
          onEscape={() => select(null)}
          aria-label={S.editorLabel}
        />
      </div>
    </div>
  );
}
