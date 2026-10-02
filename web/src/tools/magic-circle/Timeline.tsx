/**
 * 時間軸（規格 1.10）：共用播放列＋回到開頭、長度、FPS、自動排列；每個元素一列的動態長條（拖曳移動、改開始與持續），
 * 點軌道跳到那個時間。
 */
import { ChevronDown, ChevronUp, SkipBack } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { historyGesture } from '@/core/storage';
import { Button, cn, IconButton, NumberInput, type Playback, Transport } from '@/ui';
import {
  edit,
  reverseOrder,
  type SelectMode,
  selectElement,
  sequence,
  setTimelineDuration,
} from './actions';
import { clamp, round } from './geometry';
import { type McElement, RANGE } from './model';
import { rgbOf } from './render';
import { useProject, useUi } from './store';
import { S } from './strings';

const MIN_DURATION = 0.05;

const modeOf = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): SelectMode =>
  e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace';

/** 長條的位置（百分比） */
export function barGeometry(
  el: McElement,
  total: number,
): { left: number; width: number; start: number; duration: number } {
  const T = Math.max(0.05, total);
  const none = el.animation.mode === 'none';
  const start = none ? 0 : clamp(Number(el.animation.start) || 0, 0, T);
  const duration = none ? T : Math.max(MIN_DURATION, Number(el.animation.duration) || MIN_DURATION);
  const left = (start / T) * 100;
  const width = clamp((duration / T) * 100, 0.8, 100 - left);
  return { left, width, start, duration };
}

function Ruler({ duration }: { duration: number }) {
  const D = Math.max(0.1, duration);
  const n = D <= 3 ? 6 : D <= 10 ? 10 : 12;
  return (
    <div className="@container relative h-5 text-[10px] text-muted tabular-nums" aria-hidden>
      {Array.from({ length: n + 1 }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: 刻度只依位置
          key={i}
          className={cn(
            'absolute top-0 border-border',
            i === 0
              ? 'border-l pl-0.5'
              : i === n
                ? '-translate-x-full border-r pr-0.5'
                : '-translate-x-1/2 border-l pl-0.5',
            /* 窄的時候只標偶數的刻度（避免數字擠在一起） */
            i % 2 === 1 && i !== n && 'hidden @sm:block',
          )}
          style={{ left: `${(i / n) * 100}%` }}
        >
          {round((D * i) / n, 1)}
        </span>
      ))}
    </div>
  );
}

type BarDrag = {
  id: string;
  kind: 'move' | 'left' | 'right';
  startX: number;
  width: number;
  start: number;
  duration: number;
};

function Tracks({ time, onSeek }: { time: number; onSeek: (t: number) => void }) {
  const elements = useProject((s) => s.data.elements);
  const total = useProject((s) => s.data.animation.duration);
  const { selected, primary } = useUi(
    useShallow((s) => ({ selected: s.selected, primary: s.primary })),
  );
  const drag = useRef<BarDrag | { kind: 'seek'; rect: DOMRect } | null>(null);
  const rows = elements.slice().reverse();
  const playPct = `${clamp(time / Math.max(0.001, total), 0, 1) * 100}%`;

  const seekFrom = (clientX: number, rect: DOMRect) =>
    onSeek(clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1) * total);

  const onTrackDown = (el: McElement, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const track = e.currentTarget;
    const target = e.target as HTMLElement;
    const bar = target.closest('[data-bar]');
    e.currentTarget.setPointerCapture(e.pointerId);
    if (bar) {
      if (el.animation.mode === 'none') {
        selectElement(el.id);
        drag.current = null;
        return;
      }
      selectElement(el.id);
      useProject.beginGesture();
      const edge = (target.closest('[data-edge]') as HTMLElement | null)?.dataset.edge;
      drag.current = {
        id: el.id,
        kind: edge === 'left' ? 'left' : edge === 'right' ? 'right' : 'move',
        startX: e.clientX,
        width: track.getBoundingClientRect().width,
        start: Number(el.animation.start),
        duration: Number(el.animation.duration),
      };
      e.preventDefault();
      return;
    }
    const rect = track.getBoundingClientRect();
    drag.current = { kind: 'seek', rect };
    seekFrom(e.clientX, rect);
    e.preventDefault();
  };

  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'seek') {
      seekFrom(e.clientX, d.rect);
      return;
    }
    const delta = ((e.clientX - d.startX) / Math.max(1, d.width)) * total;
    edit((draft) => {
      const el = draft.elements.find((x) => x.id === d.id);
      if (!el) return;
      if (d.kind === 'left') {
        const end = d.start + d.duration;
        const next = clamp(d.start + delta, 0, end - MIN_DURATION);
        el.animation.start = round(next, 3);
        el.animation.duration = round(end - next, 3);
      } else if (d.kind === 'right') {
        el.animation.duration = round(
          clamp(d.duration + delta, MIN_DURATION, Math.max(MIN_DURATION, total - d.start)),
          3,
        );
      } else {
        el.animation.start = round(clamp(d.start + delta, 0, Math.max(0, total - MIN_DURATION)), 3);
      }
    });
  };

  const onTrackUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.kind !== 'seek') useProject.endGesture();
  };

  if (!rows.length)
    return (
      <p className="m-0 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
        {S.timeline.empty}
      </p>
    );

  return (
    <div
      className="grid grid-cols-[minmax(5.5rem,9rem)_minmax(0,1fr)] gap-x-2 gap-y-1"
      data-testid="timeline-tracks"
    >
      <div className="text-xs text-muted">{S.timeline.names}</div>
      <Ruler duration={total} />
      {rows.map((el) => {
        const g = barGeometry(el, total);
        const none = el.animation.mode === 'none';
        const isSel = selected.includes(el.id);
        return (
          <div key={el.id} className="contents" data-row={el.id}>
            <button
              type="button"
              className={cn(
                'flex min-w-0 items-center gap-1.5 truncate rounded-sm px-1.5 text-left text-xs hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                isSel && 'bg-accent-soft font-medium',
                el.id === primary && 'ring-1 ring-accent',
              )}
              title={el.name}
              aria-pressed={isSel}
              onClick={(e) => selectElement(el.id, modeOf(e))}
            >
              <span
                aria-hidden
                className="inline-block size-3 shrink-0 rounded-sm border border-border"
                style={{
                  background: rgbOf(el.style.stroke),
                  boxShadow: `0 0 0 2px ${rgbOf(el.style.glowColor || el.style.stroke)}55`,
                }}
              />
              <span className="truncate">{el.name}</span>
            </button>
            <div
              role="presentation"
              className={cn(
                'relative h-7 touch-none select-none rounded-sm bg-surface-2',
                isSel && 'bg-accent-soft/60',
              )}
              data-track={el.id}
              onPointerDown={(e) => onTrackDown(el, e)}
              onPointerMove={onTrackMove}
              onPointerUp={onTrackUp}
              onPointerCancel={onTrackUp}
            >
              <div
                data-bar={el.id}
                title={S.timeline.bar(round(g.start, 2), round(g.duration, 2))}
                className={cn(
                  'absolute top-1 bottom-1 min-w-2 cursor-grab overflow-hidden rounded-[5px] border text-[10px] leading-5 text-white',
                  none
                    ? 'cursor-pointer border-border-strong bg-surface-3 text-muted'
                    : 'border-accent bg-accent/80',
                )}
                style={{ left: `${g.left}%`, width: `${g.width}%` }}
              >
                {none ? null : (
                  <span
                    data-edge="left"
                    className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/30"
                  />
                )}
                <span className="pointer-events-none block truncate px-2">
                  {S.motion.short[el.animation.mode]}
                </span>
                {none ? null : (
                  <span
                    data-edge="right"
                    className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/30"
                  />
                )}
              </div>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-warning"
                style={{ left: playPct }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Timeline({ playback, onStop }: { playback: Playback; onStop: () => void }) {
  const animation = useProject((s) => s.data.animation);
  const collapsed = useUi((s) => s.timelineCollapsed);
  const g = historyGesture(useProject);
  return (
    <section
      aria-label={S.timeline.label}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-2"
    >
      <Transport
        {...playback}
        fps={animation.fps}
        loop={animation.plays === 0}
        onLoopChange={(on) =>
          edit((d) => {
            d.animation.plays = on ? 0 : Math.max(1, d.animation.plays || 1);
          })
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <IconButton
          size="sm"
          variant="ghost"
          label={S.timeline.stop}
          icon={<SkipBack />}
          onClick={onStop}
        />
        <div className="flex items-center gap-1.5 text-muted">
          <span aria-hidden>{S.timeline.duration}</span>
          <NumberInput
            aria-label={S.timeline.duration}
            size="sm"
            value={animation.duration}
            onChange={g.live(setTimelineDuration)}
            onCommit={g.commit}
            min={RANGE.timelineDuration[0]}
            max={RANGE.timelineDuration[1]}
            step={0.1}
            precision={2}
            unit="秒"
            className="w-28"
          />
        </div>
        <div className="flex items-center gap-1.5 text-muted">
          <span aria-hidden>{S.timeline.fps}</span>
          <NumberInput
            aria-label={S.timeline.fps}
            size="sm"
            value={animation.fps}
            onChange={g.live((v) =>
              edit((d) => {
                d.animation.fps = Math.round(clamp(v, RANGE.fps[0], RANGE.fps[1]));
              }),
            )}
            onCommit={g.commit}
            min={RANGE.fps[0]}
            max={RANGE.fps[1]}
            step={1}
            precision={0}
            className="w-20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" title={S.timeline.autoLayersHint} onClick={() => sequence('layers')}>
            {S.timeline.autoLayers}
          </Button>
          <Button size="sm" title={S.timeline.autoCenterHint} onClick={() => sequence('center')}>
            {S.timeline.autoCenter}
          </Button>
          <Button size="sm" onClick={reverseOrder}>
            {S.timeline.reverse}
          </Button>
        </div>
        <IconButton
          size="sm"
          variant="ghost"
          className="ml-auto"
          label={collapsed ? S.timeline.expand : S.timeline.collapse}
          icon={collapsed ? <ChevronDown /> : <ChevronUp />}
          pressed={collapsed}
          onClick={() => useUi.setState({ timelineCollapsed: !collapsed })}
        />
      </div>
      {collapsed ? null : <Tracks time={playback.time} onSeek={playback.onTimeChange} />}
    </section>
  );
}
