import { useEffect, useRef, useState } from 'react';
import { type AnimationSource, drawFrame, exportAnimation } from '@/core/timeline';
import {
  animationFormats,
  ExportPanel,
  type Playback,
  Stage,
  Transport,
  useWebpSupport,
} from '@/ui';
import { S } from './strings';

/** 預覽：Stage 裡的 canvas＋Transport＋ExportPanel（實作者照這個組合寫動畫工具） */
export function DemoPreview({ source, playback }: { source: AnimationSource; playback: Playback }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const webp = useWebpSupport();
  /* 字型載入完成時重畫 */
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    const bump = () => setFontTick((n) => n + 1);
    document.fonts.addEventListener('loadingdone', bump);
    source.prepare?.().then(bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, [source]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後觸發重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) void drawFrame(ctx, source, playback.time);
  }, [source, playback.time, fontTick]);

  return (
    <>
      <Stage width={source.width} height={source.height} aria-label="示範動畫預覽">
        <canvas
          ref={canvas}
          width={source.width}
          height={source.height}
          className="block size-full"
          data-testid="demo-canvas"
        />
      </Stage>
      <Transport {...playback} segments={source.segments} fps={30} />
      <ExportPanel
        formats={animationFormats(['apng', 'gif', 'webp', 'png', 'zip'], { webpSupported: webp })}
        baseSize={{ width: source.width, height: source.height }}
        defaultSettings={{ format: 'apng', fps: 30 }}
        onExport={async (s, { signal, onProgress }) => {
          const r = await exportAnimation(source, {
            format: s.format as 'apng' | 'gif' | 'webp' | 'png' | 'zip',
            fps: s.fps,
            plays: s.plays,
            scale: s.scale,
            quantize: s.quantize,
            still: true,
            fileName: S.exportName,
            signal,
            onProgress,
          });
          return {
            blob: r.blob,
            fileName: r.fileName,
            width: r.width,
            height: r.height,
            frames: r.frames,
            storedFrames: r.storedFrames,
            duration: r.duration,
          };
        }}
      />
    </>
  );
}
