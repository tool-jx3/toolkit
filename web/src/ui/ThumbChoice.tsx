/**
 * 即時畫縮圖的選項：
 * - LoopThumb：一張用 draw(ctx, t) 即時畫的循環縮圖；平常靜止（stillTime，預設 t＝0.25），playing 時循環播放。
 * - ThumbChoice：縮圖選項的格線（單選，radiogroup：方向鍵移動、空白鍵／Enter 選取）。每個選項的縮圖是
 *   「目前設定套上這個選項」的樣子；滑鼠停留或鍵盤聚焦的那一個才播放，其他靜止。目前選取的有醒目框線。
 *
 * draw 的 t 是循環的進度（0～1）；frames＋fps 給了時播放時 t 依影格跳（與匯出一致），否則連續。
 * draw 換了（依賴的設定改變）就重畫，所以呼叫端要用 useCallback 包好。
 */
import { RadioGroup } from 'radix-ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from './cn';
import { useFieldControl } from './Field';

export interface LoopThumbProps {
  /** 畫布的實際像素（顯示大小由 className 決定，預設撐滿外框） */
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
  playing: boolean;
  /** 靜止時畫的時間點（預設 0.25） */
  stillTime?: number;
  /** 一個循環幾格、每秒幾格（播放時依格跳）；不給時以 period 秒一個循環連續播放 */
  frames?: number;
  fps?: number;
  /** 不給 frames 時一個循環幾秒（預設 1） */
  period?: number;
  className?: string;
  'aria-hidden'?: boolean;
}

export function LoopThumb({
  width,
  height,
  draw,
  playing,
  stillTime = 0.25,
  frames,
  fps,
  period = 1,
  className,
  ...rest
}: LoopThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const paint = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      draw(ctx, t);
      ctx.restore();
    };
    if (!playing) {
      paint(stillTime);
      return;
    }
    let raf = 0;
    let last = -1;
    const start = performance.now();
    const loop = (now: number) => {
      const sec = (now - start) / 1000;
      let t: number;
      if (frames && fps) {
        const i = Math.floor(sec * fps) % frames;
        t = i / frames;
      } else t = (sec / period) % 1;
      if (t !== last) {
        paint(t);
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    paint(0);
    last = 0;
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, playing, stillTime, frames, fps, period]);
  return (
    <canvas
      ref={ref}
      width={Math.max(1, Math.round(width))}
      height={Math.max(1, Math.round(height))}
      aria-hidden={rest['aria-hidden'] ?? true}
      className={cn('block size-full', className)}
    />
  );
}

export interface ThumbChoiceOption<V extends string> {
  value: V;
  label: string;
  /** 滑鼠提示 */
  description?: string;
  disabled?: boolean;
}

export interface ThumbChoiceProps<V extends string> {
  options: readonly ThumbChoiceOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  /** 畫某個選項的縮圖（t＝循環進度） */
  draw: (ctx: CanvasRenderingContext2D, value: V, t: number) => void;
  /** 縮圖畫布的像素（預設 192 × 192，顯示時縮到格子大小） */
  thumbWidth?: number;
  thumbHeight?: number;
  /** 每格最小寬度（px，預設 88） */
  minItemWidth?: number;
  frames?: number;
  fps?: number;
  stillTime?: number;
  /** 選項名稱下方的小字 */
  renderMeta?: (option: ThumbChoiceOption<V>) => ReactNode;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function ThumbChoice<V extends string>({
  options,
  value,
  onValueChange,
  draw,
  thumbWidth = 192,
  thumbHeight = 192,
  minItemWidth = 88,
  frames,
  fps,
  stillTime,
  renderMeta,
  disabled,
  className,
  ...rest
}: ThumbChoiceProps<V>) {
  const field = useFieldControl(rest);
  const [hover, setHover] = useState<V | null>(null);
  const [focus, setFocus] = useState<V | null>(null);
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      disabled={disabled}
      id={field.id}
      aria-label={rest['aria-label']}
      aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
      aria-describedby={field['aria-describedby']}
      className={cn('grid gap-2', className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))` }}
    >
      {options.map((o) => (
        <ThumbChoiceItem
          key={o.value}
          option={o}
          active={o.value === value}
          playing={hover === o.value || focus === o.value}
          draw={draw}
          thumbWidth={thumbWidth}
          thumbHeight={thumbHeight}
          frames={frames}
          fps={fps}
          stillTime={stillTime}
          meta={renderMeta?.(o)}
          onHover={(on) => setHover((h) => (on ? o.value : h === o.value ? null : h))}
          onFocusChange={(on) => setFocus((f) => (on ? o.value : f === o.value ? null : f))}
        />
      ))}
    </RadioGroup.Root>
  );
}

function ThumbChoiceItem<V extends string>({
  option: o,
  active,
  playing,
  draw,
  thumbWidth,
  thumbHeight,
  frames,
  fps,
  stillTime,
  meta,
  onHover,
  onFocusChange,
}: {
  option: ThumbChoiceOption<V>;
  active: boolean;
  playing: boolean;
  draw: ThumbChoiceProps<V>['draw'];
  thumbWidth: number;
  thumbHeight: number;
  frames?: number;
  fps?: number;
  stillTime?: number;
  meta?: ReactNode;
  onHover: (on: boolean) => void;
  onFocusChange: (on: boolean) => void;
}) {
  const value = o.value;
  const drawThis = useCallback(
    (ctx: CanvasRenderingContext2D, t: number) => draw(ctx, value, t),
    [draw, value],
  );
  return (
    <RadioGroup.Item
      value={o.value}
      disabled={o.disabled}
      title={o.description}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      data-playing={playing ? '' : undefined}
      className={cn(
        'focus-visible:focus-ring flex min-w-0 flex-col overflow-hidden rounded-md border bg-surface-2 text-left transition-colors hover:border-accent disabled:opacity-50',
        active ? 'border-accent ring-1 ring-accent' : 'border-border',
      )}
    >
      <span
        className="checker block w-full overflow-hidden"
        style={{ aspectRatio: `${thumbWidth} / ${thumbHeight}` }}
      >
        <LoopThumb
          width={thumbWidth}
          height={thumbHeight}
          draw={drawThis}
          playing={playing}
          frames={frames}
          fps={fps}
          stillTime={stillTime}
        />
      </span>
      <span className="flex min-w-0 flex-col px-1.5 py-1">
        <span className="truncate text-xs font-medium text-fg">{o.label}</span>
        {meta ? <span className="truncate text-xs text-muted">{meta}</span> : null}
      </span>
    </RadioGroup.Item>
  );
}
