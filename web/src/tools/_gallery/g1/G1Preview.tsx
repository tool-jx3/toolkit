/**
 * 「文字演出」分頁的預覽欄：三種示範動畫（打字＝影格表、循環＝文字加工＋特效、卡拉 OK）＋Transport＋ExportPanel。
 * 示範 ExportPanel 的 G1 擴充：鎖定 FPS、影格表匯出、多檔結果、色數、用途上限與自動縮小、GIF 底色合成。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { EXPORT_TARGETS, nextShrinkStep } from '@/ccfolia';
import {
  type AnimationExportFormat,
  type AnimationSource,
  drawFrame,
  type ExportResult,
  exportAnimation,
  exportAnimationBatch,
} from '@/core/timeline';
import {
  animationFormats,
  type ExportOutput,
  ExportPanel,
  type ExportSettings,
  Segmented,
  Stage,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { createKaraokeSource, createLoopSource, createTypingSource, typingParts } from './scenes';
import { type G1Mode, useG1 } from './store';

const MODES: { value: G1Mode; label: string }[] = [
  { value: 'typing', label: '打字（影格表）' },
  { value: 'loop', label: '循環加工' },
  { value: 'karaoke', label: '卡拉 OK' },
];

const toOutput = (r: ExportResult): ExportOutput => ({
  blob: r.blob,
  fileName: r.fileName,
  width: r.width,
  height: r.height,
  frames: r.frames,
  storedFrames: r.storedFrames,
  duration: r.duration,
  details: r.colors
    ? [
        {
          label: '色數',
          value: r.colors.lossless ? `無損（${r.colors.count} 色）` : `${r.colors.count} 色`,
        },
      ]
    : undefined,
});

export function G1Preview() {
  const s = useG1((st) => st.data);
  const patch = useG1((st) => st.patch);
  const webp = useWebpSupport();
  const canvas = useRef<HTMLCanvasElement>(null);

  const source: AnimationSource = useMemo(() => {
    if (s.mode === 'typing') return createTypingSource(s);
    if (s.mode === 'karaoke') return createKaraokeSource(s);
    return createLoopSource(s);
  }, [s]);
  const playback = usePlayback({ duration: source.duration, loop: true });
  const fps = s.mode === 'typing' ? s.typingFps : s.mode === 'loop' ? s.fps : 20;

  /* 字型載入完成時重畫 */
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    source.prepare?.().then(() => alive && setFontTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [source]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後觸發重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    /* 循環加工依影格跳（預覽＝匯出的影格） */
    const t = s.mode === 'loop' ? Math.floor(playback.time * fps + 1e-6) / fps : playback.time;
    void drawFrame(ctx, source, t);
  }, [source, playback.time, fontTick, s.mode, fps]);

  const exportTyping = async (
    fmt: AnimationExportFormat,
    quantize: boolean,
    signal: AbortSignal,
    onProgress: (r: number, l?: string) => void,
  ) => {
    if (!s.split) {
      const r = await exportAnimation(source, {
        format: fmt,
        fps: s.typingFps,
        quantize,
        fileName: '打字示範',
        signal,
        onProgress,
      });
      return toOutput(r);
    }
    const parts = typingParts(s);
    const items = parts.map((p) => ({
      source: createTypingSource(s, p.text),
      fileName: p.name,
    }));
    for (const it of items) await it.source.prepare?.();
    const results = await exportAnimationBatch(items, {
      format: fmt,
      fps: s.typingFps,
      quantize,
      signal,
      onProgress,
    });
    return {
      files: results.map(toOutput),
      zipName: '打字示範_分段',
      details: [{ label: '分段', value: `以第一個換行切成 ${results.length} 段` }],
    };
  };

  return (
    <>
      <Segmented
        aria-label="示範動畫"
        value={s.mode}
        onValueChange={(mode) => patch({ mode })}
        options={MODES}
        fullWidth
        size="sm"
      />
      <Stage width={source.width} height={source.height} aria-label="文字演出預覽">
        <canvas
          ref={canvas}
          width={source.width}
          height={source.height}
          className="block size-full"
          data-testid="g1-canvas"
        />
      </Stage>
      <Transport {...playback} fps={fps} />
      {s.mode === 'typing' ? (
        <ExportPanel
          key="typing"
          formats={animationFormats(['apng', 'gif', 'webp', 'png'], { webpSupported: webp })}
          fixedFps={s.typingFps}
          fixedFpsHint="打字速度就是 FPS（內容設定），匯出時不另選。"
          defaultSettings={{ format: 'apng', quantize: true }}
          onExport={(set, { signal, onProgress }) =>
            exportTyping(set.format as AnimationExportFormat, set.quantize, signal, onProgress)
          }
        />
      ) : s.mode === 'loop' ? (
        <LoopExport key={s.target} />
      ) : (
        <ExportPanel
          key="karaoke"
          formats={animationFormats(['apng', 'gif', 'webp'], { webpSupported: webp })}
          fixedFps={20}
          defaultSettings={{ format: 'apng', quantize: true }}
          onExport={async (set, { signal, onProgress }) =>
            toOutput(
              await exportAnimation(source, {
                format: set.format as AnimationExportFormat,
                fps: 20,
                quantize: set.quantize,
                fileName: '卡拉OK示範',
                signal,
                onProgress,
              }),
            )
          }
        />
      )}
    </>
  );
}

/** 循環加工的匯出：色數與工具的設定同步（自動縮小會改它），用途決定上限與 GIF 底色 */
function LoopExport() {
  const s = useG1((st) => st.data);
  const patch = useG1((st) => st.patch);
  const target = EXPORT_TARGETS[s.target];
  const [local, setLocal] = useState<ExportSettings>({
    format: target.formats[0],
    fps: s.fps,
    plays: 0,
    scale: 1,
    quantize: true,
    colors: s.colors,
  });
  const settings = { ...local, fps: s.fps, colors: s.colors };
  return (
    <ExportPanel
      formats={animationFormats(['apng', 'gif', 'png'])}
      settings={settings}
      onSettingsChange={(next) => {
        setLocal(next);
        if (next.colors !== undefined && next.colors !== s.colors) patch({ colors: next.colors });
      }}
      fixedFps={s.fps}
      fixedFpsHint="循環的格數與 FPS 在左邊「循環加工」設定。"
      colorOptions={[0, 256, 128, 64, 32, 16]}
      limit={{ bytes: target.maxBytes, label: `${target.label}上限` }}
      onResult={(o) => patch({ lastBytes: 'blob' in o ? o.blob.size : null })}
      autoShrink={() => {
        const st = useG1.getState().data;
        const step = nextShrinkStep(target, {
          format: settings.format === 'gif' ? 'gif' : settings.format === 'png' ? 'png' : 'apng',
          colors: st.colors,
          frames: st.frames,
          width: st.size,
          height: st.size,
          lines: st.fx === 'speedLines' ? st.lines : null,
        });
        if (!step) return null;
        const p = step.patch;
        patch({
          ...(p.colors !== undefined ? { colors: p.colors } : {}),
          ...(p.frames !== undefined ? { frames: p.frames } : {}),
          ...(p.lines != null ? { lines: p.lines } : {}),
          ...(p.width !== undefined ? { size: p.width } : {}),
        });
        return step.description;
      }}
      onExport={async (set, { signal, onProgress }) => {
        const st = useG1.getState().data;
        const r = await exportAnimation(createLoopSource(st), {
          format: set.format as AnimationExportFormat,
          fps: st.fps,
          colors: set.format === 'gif' ? undefined : st.colors,
          matte: set.format === 'gif' ? st.gifMatte : null,
          fileName: `${st.loopText.split('\n').join('_')}_${st.size}x${st.size}`,
          signal,
          onProgress,
        });
        return toOutput(r);
      }}
    />
  );
}
