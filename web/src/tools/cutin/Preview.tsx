/**
 * 預覽（F37～F39）：棋盤格底上的畫布，以實際尺寸繪製、等比縮放顯示；已套用依用途的自動調整。
 * 播放時直接依 fps 切換到對應的影格（第 i 格停留 1 ÷ fps 秒），所以預覽就是匯出的影格。
 * 系統要求減少動態效果時不自動播放，靜止在 t＝0.25，按「播放」才開始。
 */
import { Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Stage } from '@/ui';
import { useEnsureFonts, useFontTick } from './fontTick';
import { isBlankText } from './model';
import { buildScene, type CutinScene } from './scene';
import { useSettings, useUi } from './store';
import { S } from './strings';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 測試用：下一次畫預覽時故意丟錯（錯誤畫面 F64） */
let crashNext: string | null = null;
export function crashPreview(message: string): void {
  crashNext = message;
}

/** 目前預覽畫的是第幾格（測試用） */
export const previewState = { frame: -1, t: -1 };

/** 清空後畫 t 的畫面；畫的途中出錯就換成錯誤畫面（F64） */
function paintFrame(canvas: HTMLCanvasElement | null, scene: CutinScene, t: number): void {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  try {
    if (crashNext) {
      const m = crashNext;
      crashNext = null;
      throw new Error(m);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    scene.draw(ctx, t);
    ctx.restore();
    previewState.t = t;
  } catch (e) {
    useUi.setState({ fatal: e instanceof Error ? e : new Error(String(e)) });
  }
}

export function Preview() {
  const s = useSettings((st) => st.data);
  const tick = useFontTick();
  useEnsureFonts([{ font: s.font, text: s.text }]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重排
  const scene = useMemo(() => buildScene(s, { tuned: true }), [s, tick]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const timing = useRef({ frames: s.frames, fps: s.fps });
  timing.current = { frames: s.frames, fps: s.fps };
  /** 目前畫的時間點（設定改變時用同一個時間點重畫） */
  const shown = useRef(0.25);

  /* 設定改變：用目前的時間點重畫 */
  useEffect(() => {
    paintFrame(canvas.current, scene, shown.current);
  }, [scene]);

  /* 播放：依 fps 切換影格（第 i 格畫 t＝i ÷ N）；不播放時靜止在 t＝0.25 */
  const sceneRef = useRef<CutinScene>(scene);
  sceneRef.current = scene;
  useEffect(() => {
    if (!playing) {
      previewState.frame = -1;
      shown.current = 0.25;
      paintFrame(canvas.current, sceneRef.current, 0.25);
      return;
    }
    let raf = 0;
    let last = -1;
    const start = performance.now();
    const loop = (now: number) => {
      const { frames, fps } = timing.current;
      const i = Math.floor(((now - start) / 1000) * fps + 1e-6) % frames;
      if (i !== last) {
        last = i;
        previewState.frame = i;
        shown.current = i / frames;
        paintFrame(canvas.current, sceneRef.current, i / frames);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const blank = isBlankText(s.text);
  return (
    <div className="relative">
      <Stage width={scene.width} height={scene.height} aria-label={S.previewLabel}>
        <canvas
          ref={canvas}
          width={scene.width}
          height={scene.height}
          className="block size-full"
          data-testid="cutin-canvas"
        />
      </Stage>
      {blank ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-10 bottom-0 flex items-center justify-center p-4"
          data-testid="blank-hint"
        >
          <span className="rounded-md bg-surface px-3 py-1.5 text-sm text-muted shadow-1">
            {S.blankHint}
          </span>
        </div>
      ) : null}
      {!playing ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            variant="primary"
            icon={<Play />}
            onClick={() => setPlaying(true)}
            className="pointer-events-auto shadow-2"
          >
            {S.play}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
