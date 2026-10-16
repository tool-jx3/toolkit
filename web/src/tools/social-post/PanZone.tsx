/**
 * 預覽上調整照片的範圍（F20、F51）：拖曳移動、滾輪與兩指捏合縮放（蓋滿為 100%～500%）、方向鍵與 +／-；
 * 沒有拖曳就放開＝點一下（onTap：選取格子、空格子開選檔）。座標是 Stage 的內容座標。
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from 'react';
import { clampPlacement, type FramePlacement } from '@/core/image';
import { useStageScale } from '@/ui';
import { ZOOM_MAX } from './model';
import type { Rect } from './render/ops';

const WHEEL_ZOOM = 0.0015;

export interface PanZoneProps {
  box: Rect;
  /** 照片的大小（沒有照片時 null：只能點） */
  size: { width: number; height: number } | null;
  place: FramePlacement;
  label: string;
  /** 拖曳開始、結束（包成一步復原） */
  onBegin?: () => void;
  onEnd?: () => void;
  /** 拖曳、捏合中 */
  onChange: (place: FramePlacement) => void;
  /** 滾輪、鍵盤（不在手勢裡；連續的變更合成一步） */
  onStep: (place: FramePlacement) => void;
  onTap?: () => void;
  selected?: boolean;
  testId?: string;
}

export function PanZone({
  box,
  size,
  place,
  label,
  onBegin,
  onEnd,
  onChange,
  onStep,
  onTap,
  selected,
  testId,
}: PanZoneProps) {
  const scale = useStageScale();
  const ref = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const g = useRef<{
    start: FramePlacement;
    sx: number;
    sy: number;
    moved: boolean;
    pinch: { d0: number; z0: number } | null;
  } | null>(null);
  const latest = useRef({ place, size, box, onStep });
  latest.current = { place, size, box, onStep };

  const fitPlace = (p: FramePlacement): FramePlacement =>
    latest.current.size ? clampPlacement(latest.current.size, latest.current.box, p, ZOOM_MAX) : p;

  /* 滾輪：原生的監聽（React 的 wheel 是被動的，擋不住頁面捲動） */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const l = latest.current;
      if (!l.size) return;
      e.preventDefault();
      const zoom = Math.min(ZOOM_MAX, Math.max(1, l.place.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM)));
      l.onStep(fitPlace({ ...l.place, zoom }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) {
      g.current = { start: place, sx: e.clientX, sy: e.clientY, moved: false, pinch: null };
      if (size) onBegin?.();
    } else if (g.current && pts.current.size === 2 && size) {
      const [a, b] = [...pts.current.values()];
      g.current.pinch = {
        d0: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        z0: latest.current.place.zoom,
      };
      g.current.moved = true;
    }
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || !pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!size) return;
    if (s.pinch && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const zoom = Math.min(
        ZOOM_MAX,
        Math.max(1, (s.pinch.z0 * Math.hypot(b.x - a.x, b.y - a.y)) / s.pinch.d0),
      );
      onChange(fitPlace({ ...latest.current.place, zoom }));
      return;
    }
    const dx = (e.clientX - s.sx) / scale;
    const dy = (e.clientY - s.sy) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 3 / scale) s.moved = true;
    if (!s.moved) return;
    onChange(
      fitPlace({ ...s.start, x: s.start.x + dx / box.width, y: s.start.y + dy / box.height }),
    );
  };

  const up = (e: PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || !pts.current.has(e.pointerId)) return;
    pts.current.delete(e.pointerId);
    if (pts.current.size === 1 && s.pinch) {
      /* 放開一指：剩下的那指接著拖曳 */
      const [p] = [...pts.current.values()];
      g.current = { start: latest.current.place, sx: p.x, sy: p.y, moved: true, pinch: null };
      return;
    }
    if (pts.current.size) return;
    g.current = null;
    if (size) onEnd?.();
    if (!s.moved) onTap?.();
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap?.();
      return;
    }
    if (!size) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    let next: FramePlacement | null = null;
    if (e.key === 'ArrowLeft') next = { ...place, x: place.x - step };
    else if (e.key === 'ArrowRight') next = { ...place, x: place.x + step };
    else if (e.key === 'ArrowUp') next = { ...place, y: place.y - step };
    else if (e.key === 'ArrowDown') next = { ...place, y: place.y + step };
    else if (e.key === '+' || e.key === '=')
      next = { ...place, zoom: Math.min(ZOOM_MAX, place.zoom * 1.1) };
    else if (e.key === '-') next = { ...place, zoom: Math.max(1, place.zoom / 1.1) };
    if (!next) return;
    e.preventDefault();
    onStep(fitPlace(next));
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: 可以拖曳、縮放的照片範圍（不是一般按鈕）
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-testid={testId}
      data-place={`${place.zoom.toFixed(3)},${place.x.toFixed(3)},${place.y.toFixed(3)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      className="absolute touch-none outline-none focus-visible:[outline:calc(2px/var(--stage-scale,1))_solid_var(--focus)]"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        cursor: size ? 'grab' : 'pointer',
      }}
    />
  );
}
