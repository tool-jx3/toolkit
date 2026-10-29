/**
 * 「混音中」的一軌：名稱、音量、起伏、換一種變化、拿掉；「調整」展開這個聲音的參數（音檔：循環、接縫淡化、淡入淡出）。
 */
import { Activity, ChevronDown, Dices, FileAudio, LoaderCircle, Volume2, X } from 'lucide-react';
import { useState } from 'react';
import { type AmbienceParam, ambienceSound } from '@/core/audio/ambience';
import { cn, Field, IconButton, Notice, Segmented, Slider, Toggle } from '@/ui';
import { removeTrack, reroll, updateTrack } from './actions';
import { soundIcon } from './icons';
import {
  FADE_MAX,
  type FileTrack,
  SEAM_MAX,
  type SynthTrack,
  type Track,
  trackLabel,
} from './model';
import type { TrackStatus } from './store';
import { S } from './strings';

const fmt = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function ParamControl({ track, p, name }: { track: SynthTrack; p: AmbienceParam; name: string }) {
  const value = track.params[p.id] ?? p.default;
  const set = (v: number) =>
    updateTrack(track.key, (t) => {
      if (t.kind === 'synth') t.params[p.id] = v;
    });
  if (p.kind === 'choice') {
    return (
      <Field label={p.label}>
        <Segmented
          value={String(value)}
          onValueChange={(v) => set(Number(v))}
          options={p.options.map((label, i) => ({ value: String(i), label }))}
          aria-label={S.mix.param(name, p.label)}
          fullWidth
        />
      </Field>
    );
  }
  return (
    <Field label={p.label}>
      <Slider
        value={value}
        onChange={set}
        min={p.min}
        max={p.max}
        step={p.step}
        unit={p.unit}
        aria-label={S.mix.param(name, p.label)}
      />
      {p.ends ? (
        <div className="flex justify-between text-xs text-muted" aria-hidden>
          <span>{p.ends[0]}</span>
          <span>{p.ends[1]}</span>
        </div>
      ) : null}
    </Field>
  );
}

function FileControls({ track, name }: { track: FileTrack; name: string }) {
  const set = (fn: (t: FileTrack) => void) =>
    updateTrack(track.key, (t) => {
      if (t.kind === 'file') fn(t);
    });
  return (
    <>
      <Field label={S.mix.file.loop} hint={S.mix.file.loopHint} layout="inline">
        <Toggle
          checked={track.loop}
          onCheckedChange={(v) =>
            set((t) => {
              t.loop = v;
            })
          }
          aria-label={S.mix.param(name, S.mix.file.loop)}
        />
      </Field>
      {track.loop ? (
        <Field label={S.mix.file.seam} hint={S.mix.file.seamHint}>
          <Slider
            value={track.seam}
            onChange={(v) =>
              set((t) => {
                t.seam = v;
              })
            }
            min={0}
            max={SEAM_MAX}
            step={0.1}
            unit={S.mix.file.seconds}
            aria-label={S.mix.param(name, S.mix.file.seam)}
          />
        </Field>
      ) : (
        <>
          <Field label={S.mix.file.fadeIn}>
            <Slider
              value={track.fadeIn}
              onChange={(v) =>
                set((t) => {
                  t.fadeIn = v;
                })
              }
              min={0}
              max={FADE_MAX}
              step={0.1}
              unit={S.mix.file.seconds}
              aria-label={S.mix.param(name, S.mix.file.fadeIn)}
            />
          </Field>
          <Field label={S.mix.file.fadeOut}>
            <Slider
              value={track.fadeOut}
              onChange={(v) =>
                set((t) => {
                  t.fadeOut = v;
                })
              }
              min={0}
              max={FADE_MAX}
              step={0.1}
              unit={S.mix.file.seconds}
              aria-label={S.mix.param(name, S.mix.file.fadeOut)}
            />
          </Field>
        </>
      )}
    </>
  );
}

export function TrackCard({ track, status }: { track: Track; status: TrackStatus | undefined }) {
  const [open, setOpen] = useState(false);
  const name = trackLabel(track);
  const def = track.kind === 'synth' ? ambienceSound(track.sound) : undefined;
  const Icon = track.kind === 'synth' ? soundIcon(track.sound) : FileAudio;
  const busy = status === 'loading' || status === 'updating';
  const hasControls = track.kind === 'file' || !!def?.params.length;
  const panelId = `track-${track.key.replace(/[^\w-]/g, '_')}-params`;
  return (
    <li
      data-track={track.key}
      data-status={status ?? ''}
      className="rounded-md border border-border bg-surface p-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon aria-hidden className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 truncate font-medium text-fg" title={name}>
          {name}
        </span>
        {track.kind === 'file' && track.duration > 0 ? (
          <span className="shrink-0 text-xs text-muted">
            {S.mix.file.length(fmt(track.duration))}
          </span>
        ) : null}
        {busy ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted"
            role="status"
          >
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
            {status === 'loading' ? S.mix.loading : S.mix.updating}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton
            size="sm"
            variant="ghost"
            label={`${S.mix.swell}：${S.mix.swellHint}`}
            icon={<Activity />}
            pressed={track.swell}
            onClick={() =>
              updateTrack(track.key, (t) => {
                t.swell = !t.swell;
              })
            }
            data-action="swell"
          />
          {track.kind === 'synth' ? (
            <IconButton
              size="sm"
              variant="ghost"
              label={S.mix.reroll}
              icon={<Dices />}
              onClick={() => reroll(track.key)}
              data-action="reroll"
            />
          ) : null}
          <IconButton
            size="sm"
            variant="ghost"
            label={S.mix.remove(name)}
            icon={<X />}
            onClick={() => removeTrack(track.key)}
            data-action="remove"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Volume2 aria-hidden className="size-4 shrink-0 text-muted" />
        <Slider
          value={track.volume}
          onChange={(v) =>
            updateTrack(track.key, (t) => {
              t.volume = v;
            })
          }
          min={0}
          max={100}
          step={1}
          unit="%"
          aria-label={S.mix.volume(name)}
          className="min-w-0 flex-1"
        />
        {hasControls ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-1 text-sm text-muted hover:text-fg focus-visible:focus-ring"
          >
            {S.mix.adjust}
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform', open && 'rotate-180')}
            />
          </button>
        ) : null}
      </div>
      {status === 'missing' ? (
        <Notice tone="danger" className="mt-2">
          {S.mix.missing}
        </Notice>
      ) : status === 'error' ? (
        <Notice tone="danger" className="mt-2">
          {track.kind === 'file' ? S.mix.fileError : S.mix.error}
        </Notice>
      ) : null}
      {open ? (
        <div id={panelId} className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          {track.kind === 'synth' ? (
            def?.params.map((p) => <ParamControl key={p.id} track={track} p={p} name={name} />)
          ) : (
            <FileControls track={track} name={name} />
          )}
        </div>
      ) : null}
    </li>
  );
}
