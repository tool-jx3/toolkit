/**
 * 「轉場與動態」分頁的預覽欄：
 * - 轉場：影格表（transitionFrames＋sequenceSource）＋Stage 的示意場景背景＋Transport（逐格、預覽速度、不循環時每輪停 1.2 秒）＋
 *   ExportPanel（預估列、處理量上限；WebP 每格取無損／有損較小者）。
 * - 圖片動態：示意圖的動態＋濾鏡＋結尾消失演出。
 * - 版面吸附：LayoutEditor 的吸附（畫布與其他物件），點選範圍外擴。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Box } from '@/core/layout';
import {
  type AnimationExportFormat,
  drawFrame,
  type ExportResult,
  exportAnimation,
  frameIndexAt,
  sampledFrames,
} from '@/core/timeline';
import {
  animationFormats,
  type ExportOutput,
  ExportPanel,
  Field,
  LayoutEditor,
  Segmented,
  Stage,
  type StageAnyBackgroundKind,
  Toggle,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { createMotionSource, createTransitionSource, loadDemoImage, MOTION_SIZE } from './scenes';
import { type G2View, useG2, useG2Preview } from './store';

const VIEWS: { value: G2View; label: string }[] = [
  { value: 'transition', label: '轉場' },
  { value: 'motion', label: '圖片動態' },
  { value: 'snap', label: '版面吸附' },
];

const toOutput = (r: ExportResult): ExportOutput => ({
  blob: r.blob,
  fileName: r.fileName,
  width: r.width,
  height: r.height,
  frames: r.frames,
  storedFrames: r.storedFrames,
  duration: r.duration,
});

/** e2e：網址加 ?g2pause=秒 時預覽停在那個時間點 */
const pauseAt = (() => {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('g2pause');
  return v === null ? null : Number(v);
})();

const BACKGROUNDS: readonly StageAnyBackgroundKind[] = ['scene', 'light', 'checker', 'image'];

const EXPORT_SIZES = [
  { value: '480', label: '480 × 270', width: 480, height: 270 },
  { value: '1280', label: '1280 × 720', width: 1280, height: 720 },
  { value: '1920', label: '1920 × 1080', width: 1920, height: 1080 },
] as const;
type ExportSizeId = (typeof EXPORT_SIZES)[number]['value'];

function TransitionView() {
  const s = useG2((st) => st.data);
  const webp = useWebpSupport();
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useMemo(() => createTransitionSource(s), [s]);
  const [sizeId, setSizeId] = useState<ExportSizeId>('480');
  const size = EXPORT_SIZES.find((o) => o.value === sizeId) ?? EXPORT_SIZES[0];
  /* 預覽一律重複播放；檔案只播一次時每輪結尾停 1.2 秒 */
  const playback = usePlayback({
    duration: source.duration,
    loop: true,
    loopGap: s.loop ? 0 : 1.2,
    autoPlay: pauseAt === null ? undefined : false,
  });
  const { onTimeChange } = playback;
  useEffect(() => {
    if (pauseAt !== null) onTimeChange(pauseAt);
  }, [onTimeChange]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    void drawFrame(ctx, source, playback.time);
  }, [source, playback.time]);
  const index = frameIndexAt(source.frameList, playback.time);
  return (
    <>
      <Stage<StageAnyBackgroundKind>
        width={source.width}
        height={source.height}
        aria-label="轉場預覽"
        backgrounds={BACKGROUNDS}
        defaultBackground={{ kind: 'scene' }}
      >
        <canvas
          ref={canvas}
          width={source.width}
          height={source.height}
          className="block size-full"
          data-testid="g2-transition-canvas"
        />
      </Stage>
      <Transport
        {...playback}
        frames={source.frameList}
        onRateChange={playback.setRate}
        onLoopChange={undefined}
      />
      <p className="m-0 text-xs text-muted" data-testid="g2-frame-info">
        第 {index + 1}／{source.frameList.length} 格・
        {source.frameList[index]?.leg === 'back' ? '回程' : '去程'}・時間進度{' '}
        {Math.round((source.frameList[index]?.progress ?? 0) * 100)}%
      </p>
      <ExportPanel
        extra={
          <Field label="匯出尺寸">
            <Segmented
              value={sizeId}
              onValueChange={setSizeId}
              options={EXPORT_SIZES.map(({ value, label }) => ({ value, label }))}
              size="sm"
            />
          </Field>
        }
        formats={animationFormats(['webp', 'apng', 'gif'], { webpSupported: webp })}
        fixedFps={s.fps}
        fixedFpsHint="影格表（每格 1 ÷ FPS 秒，停留加在最後一格）"
        defaultSettings={{ format: webp ? 'webp' : 'apng', plays: s.loop ? 0 : 1 }}
        maxPlays={65535}
        estimate={{
          width: size.width,
          height: size.height,
          frames: source.frameList.length,
          duration: source.duration,
        }}
        pixelBudget={{
          max: 220_000_000,
          message: '處理量超過上限（寬 × 高 × 影格數 > 2 億 2 千萬），請縮短時間或降低 FPS。',
        }}
        onExport={async (set, { signal, onProgress }) =>
          toOutput(
            await exportAnimation(createTransitionSource(s, size), {
              format: set.format as AnimationExportFormat,
              fps: s.fps,
              plays: set.plays,
              webpQuality: 0.9,
              webpPickSmaller: true,
              fileName: '轉場示範',
              signal,
              onProgress,
            }),
          )
        }
      />
    </>
  );
}

function MotionView() {
  const s = useG2((st) => st.data);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    let alive = true;
    loadDemoImage()
      .then((b) => alive && setImage(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const source = useMemo(() => createMotionSource(s, image), [s, image]);
  /* 依循環設定：不循環時播完停在最後 */
  const playback = usePlayback({ duration: source.duration, loop: s.loop });
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    void drawFrame(ctx, source, playback.time);
  }, [source, playback.time]);
  const frames = sampledFrames({ duration: source.duration, fps: 24, delays: 'integer' });
  return (
    <>
      <Stage width={MOTION_SIZE.width} height={MOTION_SIZE.height} aria-label="圖片動態預覽">
        <canvas
          ref={canvas}
          width={MOTION_SIZE.width}
          height={MOTION_SIZE.height}
          className="block size-full"
          data-testid="g2-motion-canvas"
        />
      </Stage>
      <Transport {...playback} onRateChange={playback.setRate} fps={24} />
      <p className="m-0 text-xs text-muted">
        前 70% 是動態（濾鏡套在整個畫面），最後 30% 是結尾消失演出。匯出時 {frames.length}{' '}
        格、整數毫秒延遲（前面的格多 1 ms）。
      </p>
    </>
  );
}

const SNAP_LABELS: Record<string, string> = { character: '角色', bar: '進度條', title: '標題' };

function SnapView() {
  const p = useG2Preview((st) => st.data);
  const patch = useG2Preview((st) => st.patch);
  const W = 640;
  const H = 360;
  const items = Object.entries(p.boxes).map(([id, box]) => ({ id, label: SNAP_LABELS[id], box }));
  const sel = p.selected ? p.boxes[p.selected as keyof typeof p.boxes] : null;
  return (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Toggle
          label="吸附畫布"
          checked={p.snapCanvas}
          onCheckedChange={(v) => patch({ snapCanvas: v })}
        />
        <Toggle
          label="吸附其他元素"
          checked={p.snapItems}
          onCheckedChange={(v) => patch({ snapItems: v })}
        />
      </div>
      <Stage
        width={W}
        height={H}
        aria-label="版面吸附預覽"
        backgrounds={['checker', 'dark', 'light']}
      >
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block size-full" aria-hidden>
          <rect x={0} y={0} width={W} height={H} fill="#fff7fb" />
          {items.map(({ id, box }) => (
            <rect
              key={id}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={id === 'bar' ? box.height / 2 : 8}
              fill={id === 'character' ? '#c9a2ff' : id === 'bar' ? '#ff7ea8' : '#5a4058'}
            />
          ))}
        </svg>
        <LayoutEditor
          width={W}
          height={H}
          items={items}
          selectedId={p.selected}
          onSelect={(id) => patch({ selected: id })}
          onChange={(id, box: Box) => patch({ boxes: { ...p.boxes, [id]: box } })}
          guides={false}
          snap={{ canvas: p.snapCanvas, items: p.snapItems }}
          hitPadding={5}
          aria-label="吸附示範"
        />
      </Stage>
      <p className="m-0 text-xs text-muted">
        拖曳物件：中心或邊緣靠近畫布中線、畫布邊緣或其他物件 8 px 以內就吸過去（出現參考線），拖開
        12 px 以上才脫離；點選範圍往外多 5 px，細長的進度條也好點。
      </p>
      <p className="m-0 text-xs text-muted" data-testid="g2-snap-summary">
        {sel && p.selected
          ? `選取：${SNAP_LABELS[p.selected]}｜中心 (${Math.round(sel.x + sel.width / 2)}, ${Math.round(sel.y + sel.height / 2)})`
          : '沒有選取物件'}
      </p>
    </>
  );
}

export function G2Preview() {
  const view = useG2Preview((st) => st.data.view);
  const patch = useG2Preview((st) => st.patch);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Segmented
        aria-label="轉場與動態預覽"
        value={view}
        onValueChange={(v) => patch({ view: v })}
        options={VIEWS}
        fullWidth
      />
      {view === 'transition' ? (
        <TransitionView />
      ) : view === 'motion' ? (
        <MotionView />
      ) : (
        <SnapView />
      )}
    </div>
  );
}
