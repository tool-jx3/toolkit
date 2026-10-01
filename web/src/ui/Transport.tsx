/**
 * 播放列：重播、播放／暫停、可拖曳的時間軸（可顯示階段分色）、循環開關、目前時間／總長。
 * 時間軸有焦點時：←／→ 一格（1/fps 秒，Shift 十格）、PageUp／PageDown 一秒、Home／End 到頭尾。
 * 拖曳時暫停，放開後恢復原本的播放狀態。
 */
import { Pause, Play, Repeat, RotateCcw } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import type { TimelineSegment } from '@/core/timeline/timeline';
import { IconButton } from './Button';
import { cn } from './cn';

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
  /** 鍵盤逐格移動用（預設 30） */
  fps?: number;
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
  fps = 30,
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
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const frame = 1 / fps;
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
          aria-valuetext={`${fmt(time)} 秒${current ? `（${current.label}）` : ''}，共 ${fmt(duration)} 秒`}
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
          <span
            aria-hidden
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-surface shadow-1 group-focus-visible:ring-2 group-focus-visible:ring-focus"
            style={{ left: pct(time) }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {fmt(time)}／{fmt(duration)} 秒
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
      {segments?.length ? (
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
