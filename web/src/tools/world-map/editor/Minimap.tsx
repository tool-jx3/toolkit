/**
 * 小地圖：整張地圖（公開的樣子）＋金色的框（畫面上看得到的範圍）。點一下或拖曳把畫面移到那裡；不改地圖。
 * 地圖改了之後約 0.25 秒才重畫（拖曳、一筆的過程中不跟著重畫）。
 */
import { useEffect, useRef } from 'react';
import { deriveDoc, renderMap } from '../draw/render';
import { gridOf } from '../model/terrain';
import { CELL } from '../model/types';
import { S } from '../strings';
import { editor } from './controller';
import { docNow, useDoc } from './store';

const WIDTH = 256;

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLCanvasElement | null>(null);
  const pointer = useRef<number | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const paint = () => {
      const ctx = c.getContext('2d');
      const img = image.current;
      if (!ctx || !img) return;
      const d = docNow();
      const W = d.cols * CELL;
      const k = c.width / W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const r = editor.visibleRect();
      const x = Math.max(0, r.x);
      const y = Math.max(0, r.y);
      const x2 = Math.min(W, r.x + r.w);
      const y2 = Math.min(d.rows * CELL, r.y + r.h);
      if (x2 > x && y2 > y) {
        ctx.fillStyle = 'rgba(240,199,94,0.08)';
        ctx.strokeStyle = '#f0c75e';
        ctx.lineWidth = 1.5 * dpr;
        ctx.fillRect(x * k, y * k, (x2 - x) * k, (y2 - y) * k);
        ctx.strokeRect(x * k, y * k, (x2 - x) * k, (y2 - y) * k);
      }
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const rebuild = () => {
      const d = docNow();
      const W = d.cols * CELL;
      const H = d.rows * CELL;
      c.width = Math.round(WIDTH * dpr);
      c.height = Math.round((WIDTH * dpr * H) / W);
      const img = image.current ?? document.createElement('canvas');
      img.width = c.width;
      img.height = c.height;
      const g = img.getContext('2d');
      if (!g) return;
      const k = img.width / W;
      g.setTransform(k, 0, 0, k, 0, 0);
      renderMap(
        g,
        d,
        deriveDoc(d, () => gridOf(d)),
        { audience: 'player', scale: Math.max(0.5, k), vector: false },
      );
      image.current = img;
      c.dataset.ready = '1';
      paint();
    };
    rebuild();
    const unsubDoc = useDoc.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(rebuild, 250);
    });
    const unsubView = editor.onView(paint);
    return () => {
      unsubDoc();
      unsubView();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const d = docNow();
    const W = d.cols * CELL;
    editor.centerOn(
      ((e.clientX - r.left) / r.width) * W,
      ((e.clientY - r.top) / r.height) * d.rows * CELL,
    );
  };

  return (
    <canvas
      ref={ref}
      aria-label={S.inspector.minimap}
      title={S.inspector.minimap}
      className="mx-auto block w-full max-w-72 cursor-pointer touch-none rounded-sm border border-border"
      data-testid="minimap"
      onPointerDown={(e) => {
        if (e.button !== 0 || pointer.current !== null) return;
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointer.current) move(e);
      }}
      onPointerUp={(e) => {
        if (e.pointerId === pointer.current) pointer.current = null;
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
      onLostPointerCapture={() => {
        pointer.current = null;
      }}
    />
  );
}
