/**
 * 播放列：重播、播放／暫停、可拖曳的時間軸（可顯示階段分色）、循環開關、目前時間／總長。
 * 時間軸有焦點時：←／→ 一格（1/fps 秒，Shift 十格）、PageUp／PageDown 一秒、Home／End 到頭尾。
 * 拖曳時暫停，放開後恢復原本的播放狀態。
 *
 * G2 擴充（選填，不給時行為不變）：
 * - `onRateChange`（＋`rate`、`rateRange`、`rateStep`）：顯示「預覽速度」數字欄（只影響預覽，不影響匯出）。
 * - `frames`（影格表）：時間軸聚焦時 ←／→ 移到上一格／下一格的開始（每格長度不同時用）。
 *
 * music-frame 加的選填（不給時行為不變）：
 * - `formatTime`：時間的寫法（例如音樂的「分:秒」）；給了就顯示「目前／總長」不加「秒」，螢幕閱讀器也念這個寫法。
 */
import { Pause, Play, Repeat, RotateCcw } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import type { FrameSpec } from '@/core/timeline/frames';
import type { TimelineSegment } from '@/core/timeline/timeline';
import { IconButton } from './Button';
import { cn } from './cn';
import { NumberInput } from './NumberInput';

/** 階段沒有指定顏色時依序使用 */
export const SEGMENT_COLORS = [
  'var(--accent)',
  'var(--success)',
  'var(--warning)',
  'var(--danger)',
  'var(--text-muted)',
] as const;

export interface TransportProps {
  time: number;
  duration: number;
  playing: boolean;
  onTimeChange: (t: number) => void;
  onPlayingChange: (playing: boolean) => void;
  loop?: boolean;
  onLoopChange?: (loop: boolean) => void;
  /** 重播（預設：回到 0 並播放） */
  onRestart?: () => void;
  segments?: readonly TimelineSegment[];
  /** 時間軸上的標記（例如代表畫面），滑鼠停留時顯示 label */
  markers?: readonly { time: number; label: string }[];
  /** 顯示階段圖例（預設 true；階段很多時可以關掉，由工具自己顯示目前階段） */
  legend?: boolean;
  /** 鍵盤逐格移動用（預設 30） */
  fps?: number;
  /** 影格表：給了就以每格的開始時間逐格移動（←／→） */
  frames?: readonly FrameSpec[];
  /** 預覽速度（倍）；給 onRateChange 才顯示速度欄 */
  rate?: number;
  onRateChange?: (rate: number) => void;
  /** 速度範圍（預設 0.1～4） */
  rateRange?: readonly [number, number];
  /** 速度欄的間隔（預設 0.1） */
  rateStep?: number;
  /** 時間的寫法（預設秒數到小數兩位＋「秒」）；例如音樂用「分:秒」 */
  formatTime?: (t: number) => string;
  disabled?: boolean;
  className?: string;
}

const fmt = (t: number) => t.toFixed(2);

export function Transport({
  time,
  duration,
  playing,
  onTimeChange,
  onPlayingChange,
  loop,
  onLoopChange,
  onRestart,
  segments,
  markers,
  legend = true,
  fps = 30,
  frames,
  rate = 1,
  onRateChange,
  rateRange = [0.1, 4],
  rateStep = 0.1,
  formatTime,
  disabled,
  className,
}: TransportProps) {
  const track = useRef<HTMLDivElement>(null);
  const resume = useRef(false);
  const d = Math.max(duration, 1e-6);
  const pct = (t: number) => `${(Math.min(d, Math.max(0, t)) / d) * 100}%`;
  const current = segments?.find(
    (s, i) => time >= s.start && (time < s.end || i === segments.length - 1),
  );

  const seekTo = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    onTimeChange(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration);
  };
  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.focus();
      resume.current = playing;
      if (playing) onPlayingChange(false);
      seekTo(e.clientX);
    } else if (e.type === 'pointermove' && e.currentTarget.hasPointerCapture(e.pointerId)) {
      seekTo(e.clientX);
    } else if (e.type === 'pointerup' || e.type === 'pointercancel') {
      if (resume.current) onPlayingChange(true);
      resume.current = false;
    }
  };
  /* 影格表：每格的開始時間（秒） */
  const starts = frames?.length
    ? frames.reduce<number[]>((acc, _f, i) => {
        acc.push(i ? acc[i - 1] + Math.max(0, frames[i - 1].ms) / 1000 : 0);
        return acc;
      }, [])
    : null;
  const stepFrame = (dir: 1 | -1, count: number) => {
    if (!starts) return null;
    let i = starts.length - 1;
    while (i > 0 && starts[i] > time + 1e-6) i--;
    const target = Math.max(0, Math.min(starts.length - 1, i + dir * count));
    return starts[target];
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const frame = 1 / fps;
    if (
      starts &&
      (e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown')
    ) {
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1;
      const t = stepFrame(dir, e.shiftKey ? 10 : 1);
      if (t !== null) onTimeChange(t);
      e.preventDefault();
      return;
    }
    const map: Record<string, number> = {
      ArrowLeft: -(e.shiftKey ? 10 : 1) * frame,
      ArrowDown: -(e.shiftKey ? 10 : 1) * frame,
      ArrowRight: (e.shiftKey ? 10 : 1) * frame,
      ArrowUp: (e.shiftKey ? 10 : 1) * frame,
      PageDown: -1,
      PageUp: 1,
    };
    if (e.key === 'Home') onTimeChange(0);
    else if (e.key === 'End') onTimeChange(duration);
    else if (e.key in map) onTimeChange(Math.min(duration, Math.max(0, time + map[e.key])));
    else return;
    e.preventDefault();
  };

  return (
    <fieldset
      aria-label="播放控制"
      className={cn(
        'm-0 flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-surface px-2 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton
          label="重播"
          icon={<RotateCcw />}
          size="sm"
          disabled={disabled}
          onClick={() => {
            if (onRestart) onRestart();
            else {
              onTimeChange(0);
              onPlayingChange(true);
            }
          }}
        />
        <IconButton
          label={playing ? '暫停' : '播放'}
          icon={playing ? <Pause /> : <Play />}
          size="sm"
          variant="primary"
          disabled={disabled}
          onClick={() => onPlayingChange(!playing)}
        />
        <div
          ref={track}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="時間軸"
          aria-disabled={disabled || undefined}
          aria-valuemin={0}
          aria-valuemax={Number(fmt(duration))}
          aria-valuenow={Number(fmt(time))}
          aria-valuetext={
            formatTime
              ? `${formatTime(time)}${current ? `（${current.label}）` : ''}，共 ${formatTime(duration)}`
              : `${fmt(time)} 秒${current ? `（${current.label}）` : ''}，共 ${fmt(duration)} 秒`
          }
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerUp={onPointer}
          onPointerCancel={onPointer}
          onKeyDown={onKey}
          className="group relative mx-2 h-7 min-w-0 flex-1 cursor-pointer touch-none rounded-sm"
        >
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-3">
            {segments?.map((s, i) => (
              <span
                key={s.id}
                aria-hidden
                className="absolute inset-y-0 opacity-45"
                style={{
                  left: pct(s.start),
                  width: `calc(${pct(s.end)} - ${pct(s.start)})`,
                  background: s.color ?? SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                }}
              />
            ))}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-accent/60"
              style={{ width: pct(time) }}
            />
          </div>
          {markers?.map((m) => (
            <span
              key={`${m.label}-${m.time}`}
              title={m.label}
              data-marker={m.label}
              className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/80"
              style={{ left: pct(m.time) }}
            />
          ))}
          <span
            aria-hidden
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface shadow-1 group-focus-visible:ring-2 group-focus-visible:ring-focus"
            style={{ left: pct(time) }}
          />
        </div>
        <span
          className="shrink-0 font-mono text-xs tabular-nums text-muted"
          data-testid="transport-time"
        >
          {formatTime
            ? `${formatTime(time)}／${formatTime(duration)}`
            : `${fmt(time)}／${fmt(duration)} 秒`}
        </span>
        {onLoopChange ? (
          <IconButton
            label="循環播放"
            icon={<Repeat />}
            size="sm"
            pressed={!!loop}
            disabled={disabled}
            onClick={() => onLoopChange(!loop)}
          />
        ) : null}
      </div>
      {onRateChange ? (
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted">
          <span aria-hidden>預覽速度</span>
          <NumberInput
            aria-label="預覽速度"
            value={rate}
            onChange={onRateChange}
            min={rateRange[0]}
            max={rateRange[1]}
            step={rateStep}
            unit="倍"
            size="sm"
            disabled={disabled}
            className="w-24"
          />
        </div>
      ) : null}
      {legend && segments?.length ? (
        <ul
          aria-label="階段"
          className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 pl-17 text-xs text-muted"
        >
          {segments.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                'inline-flex items-center gap-1',
                current?.id === s.id && 'font-medium text-fg',
              )}
            >
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{ background: s.color ?? SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
              />
              {s.label}
              <span className="tabular-nums">
                {fmt(s.start)}–{fmt(s.end)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
