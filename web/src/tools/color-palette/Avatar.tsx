/**
 * 圓形頭像的小畫布（色票櫃的卡片、編輯視窗的清單）：有立繪時取頭像範圍，沒有時畫剪影（paint.ts）。
 */
import { useEffect, useRef } from 'react';
import type { Bar } from './logic';
import { drawAvatar } from './paint';

export function AvatarThumb({
  bar,
  bitmap,
  size,
  className,
}: {
  bar: Bar;
  bitmap: ImageBitmap | null;
  size: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    el.width = px;
    el.height = px;
    ctx.clearRect(0, 0, px, px);
    drawAvatar(ctx, bar, bitmap, 0, 0, px);
  }, [bar, bitmap, size]);
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={className ?? 'block shrink-0 rounded-full'}
      style={{ width: size, height: size }}
      data-avatar={bar.image ? 'image' : 'silhouette'}
    />
  );
}
