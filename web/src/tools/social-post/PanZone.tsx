/**
 * 預覽上調整照片的範圍（F20、F51）：拖曳移動、滾輪與兩指捏合縮放（蓋滿為 100%～500%）、方向鍵與 +／-；
 * 沒有拖曳就放開＝點一下（onTap：選取格子、空格子開選檔）。座標是 Stage 的內容座標。
 * 位置的規則在 place.ts：拖曳從看得到的位置開始（沒有死區）、縮放照原作保持比例（拖到邊之後放大仍貼齊那一邊）。
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from 'react';
import { useStageScale } from '@/ui';
import { movePlace, type PhotoPlace, zoomPlace } from './place';
import type { Rect } from './render/ops';

const WHEEL_ZOOM = 0.0015;

export interface PanZoneProps {
  box: Rect;
  /** 照片的大小（沒有照片時 null：只能點） */
  size: { width: number; height: number } | null;
  place: PhotoPlace;
  label: string;
  /** 拖曳開始、結束（包成一步復原） */
  onBegin?: () => void;
  onEnd?: () => void;
  /** 拖曳、捏合中 */
  onChange: (place: PhotoPlace) => void;
  /** 滾輪、鍵盤（不在手勢裡；連續的變更合成一步） */
  onStep: (place: PhotoPlace) => void;
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
    start: PhotoPlace;
    sx: number;
    sy: number;
    moved: boolean;
    pinch: { d0: number; z0: number } | null;
  } | null>(null);
  const latest = useRef({ place, size, box, onStep });
  latest.current = { place, size, box, onStep };

  /* 滾輪：原生的監聽（React 的 wheel 是被動的，擋不住頁面捲動） */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const l = latest.current;
      if (!l.size) return;
      e.preventDefault();
      l.onStep(zoomPlace(l.size, l.box, l.place, l.place.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM)));
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
      const zoom = (s.pinch.z0 * Math.hypot(b.x - a.x, b.y - a.y)) / s.pinch.d0;
      onChange(zoomPlace(size, box, latest.current.place, zoom));
      return;
    }
    const dx = (e.clientX - s.sx) / scale;
    const dy = (e.clientY - s.sy) / scale;
    /* 超過 3 px 才不算點一下；照片從一開始就跟著指標（同原作，沒有不動的一段） */
    if (Math.abs(dx) + Math.abs(dy) > 3 / scale) s.moved = true;
    const next = movePlace(size, box, s.start, dx / box.width, dy / box.height);
    const cur = latest.current.place;
    if (next.x !== cur.x || next.y !== cur.y || next.zoom !== cur.zoom) onChange(next);
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
    let next: PhotoPlace | null = null;
    if (e.key === 'ArrowLeft') next = movePlace(size, box, place, -step, 0);
    else if (e.key === 'ArrowRight') next = movePlace(size, box, place, step, 0);
    else if (e.key === 'ArrowUp') next = movePlace(size, box, place, 0, -step);
    else if (e.key === 'ArrowDown') next = movePlace(size, box, place, 0, step);
    else if (e.key === '+' || e.key === '=') next = zoomPlace(size, box, place, place.zoom * 1.1);
    else if (e.key === '-') next = zoomPlace(size, box, place, place.zoom / 1.1);
    if (!next) return;
    e.preventDefault();
    onStep(next);
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
