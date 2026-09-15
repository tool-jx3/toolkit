import { useCallback, useEffect, useRef, useState } from 'react';
import { render } from '../core/render';
import { t } from '../i18n';
import type { RenderParams } from '../core/types';

interface Props {
  params: RenderParams;
  /** フォントロード完了などで強制再描画したいときに変える */
  epoch: number;
}

/** 静止表示するときの位相。虹と集中線が一番出ている場所 */
const STILL_T = 0.25;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** GIFは作らない。rAF で render(ctx, params, t) を回すだけ */
export function Preview({ params, epoch }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // 動きを減らす設定の人には自分で再生してもらう
  const [playing, setPlaying] = useState(!prefersReducedMotion());
  const empty = params.text.lines.join('').trim() === '';

  const draw = useCallback((t: number) => {
    const p = paramsRef.current;
    const canvas = ref.current;
    if (!canvas) return;
    if (canvas.width !== p.canvas.w || canvas.height !== p.canvas.h) {
      canvas.width = p.canvas.w;
      canvas.height = p.canvas.h;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) render(ctx, p, t);
  }, []);

  // 静止表示のときは、パラメータが変わったぶんだけ描き直す
  useEffect(() => {
    if (!playing) draw(STILL_T);
  }, [playing, draw, epoch, params]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const p = paramsRef.current;
      const period = (p.frameCount / p.fps) * 1000;
      // 書き出し結果と同じ絵になるよう、フレーム位置にスナップする
      const phase = (performance.now() % period) / period;
      const i = Math.floor(phase * p.frameCount) % p.frameCount;
      draw(i / p.frameCount);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [epoch, playing, draw]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="checker relative w-fit max-w-full rounded-lg p-2">
        <canvas ref={ref} className="block max-h-[38vh] max-w-full object-contain" />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
            {t('preview.empty')}
          </div>
        )}
      </div>
      {!playing && (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 transition hover:border-neutral-500"
        >
          {t('preview.play')}
        </button>
      )}
    </div>
  );
}
