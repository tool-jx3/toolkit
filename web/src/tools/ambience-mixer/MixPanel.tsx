/**
 * 預覽欄：播放／暫停、總音量、定時停止、分享連結、全部拿掉；「混音中」的每一軌；匯出。
 */
import { Pause, Play, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Field, Section, Select, Slider, withShortcut } from '@/ui';
import { clearAll, setTimer, togglePlay } from './actions';
import { ExportSection } from './ExportSection';
import { TOOL_ID } from './model';
import { useMix, useRuntime } from './store';
import { S } from './strings';
import { TrackCard } from './TrackCard';

const TIMER_OPTIONS = [0, 15, 30, 45, 60, 90, 120];

/** 現在的時間（倒數中每秒更新；開始倒數的當下就更新，不會先顯示舊的時間） */
function useNow(end: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [end]);
  return now;
}

function TimerField() {
  const end = useRuntime((s) => s.timerEnd);
  const minutes = useRuntime((s) => s.timerMinutes);
  const now = useNow(end);
  /* 剛選的那一瞬間 now 可能還是舊的：不超過選的分鐘數 */
  const left =
    end === null ? 0 : Math.max(0, Math.round(Math.min(end - now, minutes * 60_000) / 1000));
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <Field label={S.timer.label} hint={end === null ? S.timer.hint : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(minutes)}
          onValueChange={(v) => setTimer(Number(v))}
          options={TIMER_OPTIONS.map((m) => ({
            value: String(m),
            label: m ? S.timer.minutes(m) : S.timer.off,
          }))}
          data-testid="timer"
        />
        {end !== null ? (
          <span className="text-sm text-muted" data-testid="timer-left">
            {S.timer.left(text)}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

export function MixPanel({ onShare }: { onShare: () => void }) {
  const tracks = useMix((s) => s.data.tracks);
  const master = useMix((s) => s.data.master);
  const playing = useRuntime((s) => s.playing);
  const status = useRuntime((s) => s.status);
  const preparing = tracks.filter((t) => status[t.key] === 'loading').length;
  const hasSynth = tracks.some((t) => t.kind === 'synth');
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
        data-testid="transport"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Button
            variant="primary"
            size="lg"
            icon={playing ? <Pause /> : <Play />}
            onClick={togglePlay}
            disabled={!tracks.length}
            title={withShortcut(S.keys.play, 'space')}
            data-testid="play-toggle"
            data-playing={playing ? 'true' : 'false'}
            className="min-w-28"
          >
            {playing ? S.play.pause : S.play.play}
          </Button>
          <div className="min-w-44 flex-1">
            <Field label={S.play.master}>
              <Slider
                value={master}
                onChange={(v) =>
                  useMix.getState().update((d) => {
                    d.master = v;
                  })
                }
                min={0}
                max={100}
                step={1}
                unit="%"
              />
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <TimerField />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Share2 />}
              onClick={onShare}
              disabled={!hasSynth}
              data-testid="share-open"
            >
              {S.play.share}
            </Button>
            <Button variant="ghost" icon={<Trash2 />} onClick={clearAll} disabled={!tracks.length}>
              {S.play.clear}
            </Button>
          </div>
        </div>
        <p className="m-0 text-sm text-muted" aria-live="polite" data-testid="mix-summary">
          {/* 沒有聲音時「混音中」區塊已經寫了，這裡不重複 */}
          {tracks.length
            ? `${S.play.count(tracks.length)}${preparing ? `・${S.play.preparing(preparing)}` : ''}${playing ? '' : `・${S.play.hint}`}`
            : ''}
        </p>
      </div>
      <Section title={S.mix.title} persistKey={`${TOOL_ID}:mix`} fixed>
        {tracks.length ? (
          <ul
            className="m-0 flex list-none flex-col gap-2 p-0"
            aria-label={S.mix.title}
            data-testid="tracks"
          >
            {tracks.map((t) => (
              <TrackCard key={t.key} track={t} status={status[t.key]} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.mix.empty}</p>
        )}
      </Section>
      <ExportSection />
    </div>
  );
}
