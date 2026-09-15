import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureFont, getFont } from '../core/fonts';
import { render, textOf } from '../core/render';
import type { RenderParams } from '../core/types';

interface Props {
  params: RenderParams;
  /** CSS上の幅(px)。高さは params の縦横比から決まる */
  size?: number;
  /** ホバー／フォーカス中だけ true にする。一覧で全部animateさせない */
  animate?: boolean;
  className?: string;
}

/** 虹も集中線もいちばん出ている位相。静止サムネの見本として使う */
const STILL_T = 0.25;

/**
 * テンプレ見本用の小さなプレビュー。
 * 本体と同じ render() を使うので、サムネと実物がずれない。
 */
export function Thumb({ params, size = 132, animate = false, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const key = useMemo(() => JSON.stringify(params), [params]);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const aspect = params.canvas.h / params.canvas.w;
  const cssH = Math.round(size * aspect);

  // 描画前にフォントを待つ（省くと豆腐になる）
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    ensureFont(getFont(params.text.fontId), textOf(params)).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params.text.fontId, params.text.lines.join('\n')]);

  useEffect(() => {
    if (!ready) return;
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(size * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // サムネ用にキャンバス寸法だけ差し替える（比率は保つ）
    const small = (p: RenderParams): RenderParams => ({ ...p, canvas: { w, h } });

    if (!animate) {
      render(ctx, small(paramsRef.current), STILL_T, { pool: 'thumb' });
      return;
    }
    let raf = 0;
    const loop = () => {
      const p = paramsRef.current;
      const period = (p.frameCount / p.fps) * 1000;
      const phase = (performance.now() % period) / period;
      const i = Math.floor(phase * p.frameCount) % p.frameCount;
      render(ctx, small(p), i / p.frameCount, { pool: 'thumb' });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, animate, key, size, cssH]);

  return (
    <div
      className={`checker relative overflow-hidden rounded ${className ?? ''}`}
      style={{ width: size, height: cssH }}
    >
      <canvas ref={ref} style={{ width: size, height: cssH }} />
      {!ready && <div className="absolute inset-0 animate-pulse bg-neutral-700/40" />}
    </div>
  );
}
