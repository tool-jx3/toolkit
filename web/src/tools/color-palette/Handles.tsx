/**
 * 畫布上的分段交界把手（F18）：放在 Stage 裡、疊在 canvas 上，以畫布座標定位，所以會跟著預覽倍率縮放、
 * 始終對準交界。上下拖動只改變交界上下那兩段的比例（兩段比例和不變、每段至少 0.05、四捨五入到小數 3 位）；
 * 拖動距離依目前的預覽倍率換算回畫布 px。聚焦時 ↑／↓ 移動 1 px（Shift 10 px）。
 */
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { useStageScale } from '@/ui';
import {
  type Bar,
  type BarLayout,
  HANDLE_HEIGHT,
  handleWidth,
  moveBoundary,
  pxToRatio,
} from './logic';
import { S } from './strings';

export interface BoundaryChange {
  barId: string;
  /** 交界上方那一段的索引（下方是 k＋1） */
  k: number;
  ratios: [number, number];
}

export interface HandlesProps {
  bars: readonly Bar[];
  layouts: readonly BarLayout[];
  thickness: number;
  onChange: (change: BoundaryChange) => void;
  /** 拖曳開始／結束（整次拖曳記成一步復原） */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

interface DragState {
  pointerId: number;
  barId: string;
  k: number;
  startY: number;
  a0: number;
  b0: number;
  total: number;
  length: number;
}

export function Handles({
  bars,
  layouts,
  thickness,
  onChange,
  onDragStart,
  onDragEnd,
}: HandlesProps) {
  const scale = useStageScale();
  const drag = useRef<DragState | null>(null);
  const w = handleWidth(thickness);

  const down = (e: PointerEvent<HTMLDivElement>, bar: Bar, layout: BarLayout, k: number) => {
    if (e.button !== 0 || drag.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      barId: bar.id,
      k,
      startY: e.clientY,
      a0: bar.segments[k].ratio,
      b0: bar.segments[k + 1].ratio,
      total: layout.total,
      length: layout.length,
    };
    onDragStart?.();
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = (e.clientY - d.startY) / (scale || 1);
    const ratios = moveBoundary(d.a0, d.b0, pxToRatio(dy, d.total, d.length));
    if (ratios) onChange({ barId: d.barId, k: d.k, ratios });
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    onDragEnd?.();
  };
  const key = (e: KeyboardEvent<HTMLDivElement>, bar: Bar, layout: BarLayout, k: number) => {
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const px = dir * (e.shiftKey ? 10 : 1);
    const ratios = moveBoundary(
      bar.segments[k].ratio,
      bar.segments[k + 1].ratio,
      pxToRatio(px, layout.total, layout.length),
    );
    if (ratios) onChange({ barId: bar.id, k, ratios });
  };

  return (
    <>
      {layouts.map((layout, i) => {
        const bar = bars[i];
        if (!bar || layout.total <= 0) return null;
        return layout.boundaries.map((y, k) => {
          const a = bar.segments[k].ratio;
          const b = bar.segments[k + 1].ratio;
          const pos = layout.length > 0 ? ((y - layout.top) / layout.length) * 100 : 0;
          return (
            <div
              key={`${bar.id}:${bar.segments[k].id}`}
              role="slider"
              tabIndex={0}
              aria-label={S.handleLabel(i + 1, k + 1)}
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pos * 10) / 10}
              aria-valuetext={S.handleValue(a, b)}
              data-handle={`${i}-${k}`}
              onPointerDown={(e) => down(e, bar, layout, k)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onLostPointerCapture={up}
              onKeyDown={(e) => key(e, bar, layout, k)}
              className="absolute cursor-ns-resize touch-none rounded-sm shadow-1 outline-none hover:brightness-90 focus-visible:ring-2 focus-visible:ring-focus"
              style={{
                left: layout.x + layout.width / 2 - w / 2,
                top: y - HANDLE_HEIGHT / 2,
                width: w,
                height: HANDLE_HEIGHT,
                /* 疊在使用者選的顏色上：固定白底深框，不跟著深淺色主題變 */
                background: '#ffffff',
                border: '1px solid rgb(0 0 0 / 0.7)',
              }}
            />
          );
        });
      })}
    </>
  );
}
