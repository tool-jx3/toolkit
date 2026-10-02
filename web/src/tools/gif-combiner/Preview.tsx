/**
 * 預覽欄：排版區（Stage＋canvas＋版面編輯層）、播放列、匯出區。
 * 排版區就是輸出畫面（F41）：先塗背景色，再依影格率取格畫出每張動圖；在總播放時間結束時從頭循環。
 */
import { X } from 'lucide-react';
import { type RefObject, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Box } from '@/core/layout';
import { historyGesture } from '@/core/storage';
import { exportAnimation, type FrameSpec, frameIndexAt, frameTableDuration } from '@/core/timeline';
import {
  animationFormats,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  LayoutEditor,
  type LayoutItem,
  NumberInput,
  Stage,
  Transport,
  usePlayback,
  useStageScale,
  useWebpSupport,
} from '@/ui';
import {
  type CombinerData,
  type CombinerItem,
  OUTPUT_BASE_NAME,
  type OutputFormat,
  outputFrames,
  outputSize,
  PIXEL_BUDGET,
  RANGE,
  sampleCount,
  sampleTimeMs,
  snapMove,
  snapResize,
  stepMs,
} from './logic';
import { loadMedia, type Media, useMedia } from './media';
import { renderComposite } from './render';
import {
  bringToFront,
  dataNow,
  edit,
  removeItem,
  select,
  setBox,
  useCombiner,
  useUi,
} from './store';
import { S } from './strings';

export interface PreviewHandle {
  readonly time: number;
  readonly playing: boolean;
  seek: (t: number) => void;
  toggle: () => void;
  pause: () => void;
}

/** 選取中的動圖右上角的刪除鈕（固定螢幕大小） */
function RemoveButton({ item }: { item: CombinerItem }) {
  const scale = useStageScale();
  const k = 1 / scale;
  const size = 24 * k;
  /* 畫面上太矮時刪除鈕會蓋住右下角的縮放把手：改放到外框上方，把手照樣拉得動 */
  const top = item.height * scale < 40 ? item.y - size - 2 * k : item.y - size / 2;
  return (
    <button
      type="button"
      aria-label={S.preview.remove(item.name)}
      title={S.preview.remove(item.name)}
      data-testid="item-remove"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => removeItem(item.id)}
      className="pointer-events-auto absolute flex items-center justify-center rounded-full bg-danger text-danger-contrast shadow-1 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      style={{
        left: item.x + item.width - size / 2,
        top,
        width: size,
        height: size,
      }}
    >
      <X aria-hidden style={{ width: 14 * k, height: 14 * k }} />
    </button>
  );
}

/** 還沒有動圖時排版區中央的提示（固定螢幕大小） */
function EmptyHint() {
  const k = 1 / useStageScale();
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="rounded-md bg-surface/85 px-3 py-2 text-center text-fg shadow-1"
        style={{ transform: `scale(${k})` }}
      >
        <p className="m-0 text-sm font-medium">{S.preview.emptyTitle}</p>
        <p className="m-0 text-xs text-muted">{S.preview.emptyHint}</p>
      </div>
    </div>
  );
}

const isAbort = (e: unknown, signal: AbortSignal) =>
  (e instanceof DOMException && e.name === 'AbortError') || signal.aborted;

/** 匯出：用按下當時的設定與動圖（匯出中改設定不影響） */
async function runExport(
  set: ExportSettings,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, l?: string) => void },
): Promise<ExportOutput> {
  const d: CombinerData = dataNow();
  if (!d.items.length) throw new Error(S.output.empty);
  const media: Record<string, Media> = {};
  for (const it of d.items) media[it.asset] = await loadMedia(it.asset);
  const items = d.items.slice();
  const frames = outputFrames(d.durationMs, set.fps);
  const format = set.format as OutputFormat;
  try {
    const r = await exportAnimation(
      {
        width: d.canvas.width,
        height: d.canvas.height,
        duration: frameTableDuration(frames),
        frames,
        stillTime: 0,
        render: (ctx, t) => renderComposite(ctx, items, media, sampleTimeMs(t)),
      },
      {
        format,
        fps: set.fps,
        plays: set.plays,
        scale: d.scale / 100,
        quantize: format === 'apng' && set.quantize,
        background: d.transparent ? null : d.background,
        gifLocalPalettes: true,
        fileName: OUTPUT_BASE_NAME,
        maxFrames: 100_000,
        signal,
        onProgress,
      },
    );
    return {
      blob: r.blob,
      fileName: r.fileName,
      width: r.width,
      height: r.height,
      frames: r.frames,
      storedFrames: r.storedFrames,
      duration: r.duration,
    };
  } catch (e) {
    if (isAbort(e, signal)) throw new DOMException('已取消', 'AbortError');
    throw e;
  }
}

export function Preview({
  handle,
  exportRef,
}: {
  handle: RefObject<PreviewHandle | null>;
  exportRef?: RefObject<ExportPanelHandle | null>;
}) {
  const d = useCombiner((st) => st.data);
  const media = useMedia((st) => st.media);
  const selected = useUi((st) => st.selected);
  const zoom = useUi((st) => st.zoom);
  const webp = useWebpSupport();
  const W = d.canvas.width;
  const H = d.canvas.height;

  /* 時間軸：與輸出相同的影格表（F41） */
  const frames = useMemo<FrameSpec[]>(
    () => outputFrames(d.durationMs, d.fps),
    [d.durationMs, d.fps],
  );
  const playback = usePlayback({ duration: frameTableDuration(frames) });
  const index = Math.max(0, frameIndexAt(frames, playback.time));
  const tMs = sampleTimeMs(frames[index]?.t ?? 0);

  /* 拖曳中的動圖（畫在最上面；見 onChange） */
  const [active, setActive] = useState<string | null>(null);

  /* 畫預覽：背景色（不透明時）＋各動圖在 tMs 時的那一格 */
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!d.transparent) {
      ctx.fillStyle = d.background;
      ctx.fillRect(0, 0, W, H);
    }
    renderComposite(ctx, d.items, media, tMs, active);
  }, [d.items, d.transparent, d.background, media, tMs, W, H, active]);

  const state = useRef(playback);
  state.current = playback;
  useImperativeHandle(handle, () => ({
    get time() {
      return state.current.time;
    },
    get playing() {
      return state.current.playing;
    },
    seek: (t: number) => state.current.onTimeChange(t),
    toggle: () => state.current.toggle(),
    pause: () => state.current.pause(),
  }));

  /* 版面編輯層：疊放順序由下而上（上層的物件優先點到）；吸附對象照清單順序（3.6） */
  const layoutItems: LayoutItem[] = useMemo(() => {
    const byZ = d.items
      .map((it, i) => ({ it, i }))
      .sort((a, b) => a.it.z - b.it.z || a.i - b.i)
      .map((x) => x.it);
    return byZ.map((it) => ({
      id: it.id,
      label: it.name,
      box: { x: it.x, y: it.y, width: it.width, height: it.height },
      resizable: true,
      handles: ['se'] as const,
      clamp: (box: Box, op: 'move' | 'resize') => {
        const cur = dataNow();
        const others = cur.items.filter((o) => o.id !== it.id);
        return op === 'move'
          ? snapMove(box, others, cur.canvas)
          : snapResize(box, others, cur.canvas);
      },
    }));
  }, [d.items]);

  /*
   * 按下就移到最上層（F14）。疊放順序要到放開時才寫進資料：版面編輯層的點選範圍依疊放順序排列，
   * 拖曳中改順序會讓瀏覽器重排按鈕、拖曳中斷；拖曳中先把它畫在最上面，看起來與舊版相同。
   */
  const onChange = (id: string, box: Box, change: { phase: string; op?: string }) => {
    if (change.phase === 'start') {
      useCombiner.beginGesture();
      setActive(id);
      return;
    }
    if (change.phase === 'end') {
      /* 只有拖曳移動會置頂；拉把手調整大小不改疊放順序（同舊版） */
      if (change.op !== 'resize') bringToFront(id);
      useCombiner.endGesture();
      setActive(null);
      return;
    }
    setBox(id, box);
  };

  const selectedItem = d.items.find((it) => it.id === selected) ?? null;
  const out = outputSize(d.canvas, d.scale);
  const step = stepMs(d.fps);
  const n = sampleCount(d.durationMs, d.fps);
  const g = historyGesture(useCombiner);

  const formats = useMemo(
    () => animationFormats(['gif', 'apng', 'webp'], { webpSupported: webp }),
    [webp],
  );
  const panelSettings: ExportSettings = {
    format: d.format,
    fps: d.fps,
    plays: d.plays,
    scale: 1,
    quantize: d.quantize,
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted tabular-nums" data-testid="canvas-size">
          {S.preview.size(W, H)}
        </span>
      </div>
      <Stage
        width={W}
        height={H}
        aria-label={S.preview.stage}
        zoom={zoom}
        onZoomChange={(z) => useUi.setState({ zoom: z })}
      >
        <canvas
          ref={canvas}
          width={W}
          height={H}
          className="block size-full"
          data-testid="gc-canvas"
        />
        <LayoutEditor
          width={W}
          height={H}
          items={layoutItems}
          selectedId={selected}
          onSelect={select}
          onChange={onChange}
          onDelete={removeItem}
          onEscape={() => select(null)}
          aria-label={S.preview.editor}
        >
          {selectedItem ? <RemoveButton item={selectedItem} /> : null}
        </LayoutEditor>
        {d.items.length ? null : <EmptyHint />}
      </Stage>
      <Transport {...playback} frames={frames} fps={d.fps} />
      <ExportPanel
        ref={exportRef}
        formats={formats}
        settings={panelSettings}
        onSettingsChange={(next) =>
          edit((x) => {
            x.format = next.format as OutputFormat;
            x.fps = Math.round(Math.min(RANGE.fps[1], Math.max(RANGE.fps[0], next.fps)));
            x.plays = Math.round(Math.min(RANGE.plays[1], Math.max(RANGE.plays[0], next.plays)));
            x.quantize = next.quantize;
          })
        }
        fpsInput={{ min: RANGE.fps[0], max: RANGE.fps[1], hint: S.output.fpsHint }}
        maxPlays={RANGE.plays[1]}
        loopHint={S.output.loopHint}
        estimate={{
          width: out.width,
          height: out.height,
          frames: n,
          duration: (n * step) / 1000,
        }}
        pixelBudget={{ max: PIXEL_BUDGET, message: S.output.tooHeavy }}
        extra={
          <>
            <Field label={S.output.scale} hint={S.output.scaleHint(out.width, out.height)}>
              <NumberInput
                value={d.scale}
                onChange={g.live((v) =>
                  edit((x) => {
                    x.scale = v;
                  }),
                )}
                onCommit={g.commit}
                min={RANGE.scale[0]}
                max={RANGE.scale[1]}
                step={1}
                unit="%"
                className="w-32"
              />
            </Field>
            <Field label={S.output.duration} hint={S.output.durationHint(n, step)}>
              <NumberInput
                value={d.durationMs}
                onChange={g.live((v) =>
                  edit((x) => {
                    x.durationMs = v;
                  }),
                )}
                onCommit={g.commit}
                min={RANGE.durationMs[0]}
                max={RANGE.durationMs[1]}
                step={10}
                precision={0}
                unit="ms"
                className="w-40"
              />
            </Field>
          </>
        }
        onExport={runExport}
      />
    </div>
  );
}
