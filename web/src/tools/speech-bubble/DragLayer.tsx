/**
 * 預覽上拖曳泡泡（規格 F67、D20）：疊在 Stage 的內容上（DOM，不畫進輸出）。每個泡泡一個透明的拖曳把手（本體的範圍）；
 * 拖曳＝改這個泡泡的位移（排好之後再移動），放開才記一步復原；聚焦時方向鍵移動 1 px（Shift 10 px），每按一下一步。
 * 拖曳中畫布的大小與內容的位置固定住（放開之後才依新的位置重算自動畫布）。
 */
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { cn, useStageScale } from '@/ui';
import type { Scene } from './scene';
import { S } from './strings';

export interface DragLayerProps {
  scene: Scene;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 開始拖曳（移動超過 3 px） */
  onDragStart: () => void;
  /** 拖曳中：新的位移（畫布 px） */
  onDrag: (id: string, dx: number, dy: number) => void;
  onDragEnd: () => void;
  /** 方向鍵：位移加上 (ddx, ddy) */
  onNudge: (id: string, ddx: number, ddy: number) => void;
}

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function DragLayer({
  scene,
  selectedId,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onNudge,
}: DragLayerProps) {
  const scale = useStageScale();
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);

  const down = (e: PointerEvent<HTMLButtonElement>, id: string, dx: number, dy: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    drag.current = { id, x: e.clientX, y: e.clientY, dx, dy, moved: false };
    onSelect(id);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = drag.current;
    if (!g) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (!g.moved) {
      if (Math.hypot(mx, my) < 3) return;
      g.moved = true;
      onDragStart();
    }
    const k = scale || 1;
    onDrag(g.id, Math.round((g.dx + mx / k) * 10) / 10, Math.round((g.dy + my / k) * 10) / 10);
  };
  const up = () => {
    const g = drag.current;
    drag.current = null;
    if (g?.moved) onDragEnd();
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const v = KEYS[e.key];
    if (!v) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    onNudge(id, v[0] * step, v[1] * step);
  };

  return (
    <div className="absolute inset-0" data-testid="drag-layer" data-shortcuts="pass">
      {scene.items.map((it) => {
        const b = it.bubble;
        const selected = b.id === selectedId;
        return (
          <button
            key={b.id}
            type="button"
            aria-label={S.dragHandle(it.index + 1)}
            aria-pressed={selected}
            data-drag-bubble={b.id}
            className={cn(
              'absolute cursor-move touch-none rounded-sm border-dashed bg-transparent p-0',
              'hover:bg-accent-soft/30 focus-visible:outline-none focus-visible:bg-accent-soft/40',
              selected ? 'border-accent' : 'border-border-strong',
            )}
            style={{
              left: it.x,
              top: it.y,
              width: it.layout.w,
              height: it.layout.h,
              borderWidth: `calc(1.5px / var(--stage-scale, 1))`,
            }}
            onPointerDown={(e) => down(e, b.id, b.dx ?? 0, b.dy ?? 0)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={(e) => key(e, b.id)}
          />
        );
      })}
    </div>
  );
}
