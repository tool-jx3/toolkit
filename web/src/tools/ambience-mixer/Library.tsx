/**
 * 設定欄：預設組合（＋隨機組合）、我的組合、依分類排的聲音卡片、自己的音檔。
 */
import { AudioLines, Save, Shuffle, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { AMBIENCE_CATEGORIES, soundsInCategory } from '@/core/audio/ambience';
import { Button, cn, Field, FileDrop, IconButton, Section, TextInput, useConfirm } from '@/ui';
import {
  addFiles,
  applyPreset,
  applyRandom,
  applySaved,
  deleteSaved,
  renameSaved,
  saveMix,
  toggleSound,
} from './actions';
import { soundIcon } from './icons';
import { PRESETS, synthKey, TOOL_ID } from './model';
import { useMix, useSaved } from './store';
import { S } from './strings';

const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.opus,.webm';

export function PresetsSection() {
  return (
    <Section
      title={S.presets.title}
      description={S.presets.description}
      persistKey={`${TOOL_ID}:presets`}
    >
      <div className="grid grid-cols-2 gap-2" data-testid="presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            data-preset={p.id}
            onClick={() => applyPreset(p)}
            aria-label={S.presets.apply(p.name)}
            title={p.description}
            className="flex min-w-0 flex-col items-start gap-0.5 rounded-md border border-border bg-surface px-2.5 py-2 text-left hover:bg-surface-3 focus-visible:focus-ring"
          >
            <span className="text-sm font-semibold text-fg">{p.name}</span>
            <span className="line-clamp-2 text-xs text-muted">{p.description}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button icon={<Shuffle />} onClick={applyRandom} data-testid="random-mix">
          {S.presets.random}
        </Button>
        <span className="text-xs text-muted">{S.presets.randomHint}</span>
      </div>
    </Section>
  );
}

export function SavedSection() {
  const mixes = useSaved((s) => s.data.mixes);
  const hasSynth = useMix((s) => s.data.tracks.some((t) => t.kind === 'synth'));
  const [name, setName] = useState('');
  const confirm = useConfirm();
  const submit = () => {
    if (saveMix(name)) setName('');
  };
  return (
    <Section title={S.saved.title} persistKey={`${TOOL_ID}:saved`} defaultOpen={false}>
      <Field label={S.saved.nameLabel} hint={hasSynth ? S.saved.saveHint : S.saved.nothing}>
        <div className="flex gap-2">
          <TextInput
            value={name}
            maxLength={40}
            placeholder={S.saved.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            disabled={!hasSynth}
            className="min-w-0 flex-1"
          />
          <Button icon={<Save />} onClick={submit} disabled={!hasSynth || !name.trim()}>
            {S.saved.save}
          </Button>
        </div>
      </Field>
      {mixes.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0" aria-label={S.saved.title}>
          {mixes.map((m) => (
            <li key={m.id} className="flex items-center gap-2" data-saved={m.id}>
              <TextInput
                value={m.name}
                maxLength={40}
                aria-label={S.saved.rename(m.name)}
                onChange={(e) => renameSaved(m.id, e.target.value)}
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 text-xs text-muted">{S.saved.tracks(m.tracks.length)}</span>
              <Button size="sm" onClick={() => applySaved(m.id)}>
                {S.saved.apply}
              </Button>
              <IconButton
                size="sm"
                variant="ghost"
                label={S.saved.remove(m.name)}
                icon={<Trash2 />}
                onClick={async () => {
                  if (
                    await confirm({
                      title: S.saved.confirmRemove(m.name),
                      description: S.saved.confirmRemoveText,
                      confirmLabel: '刪除',
                      danger: true,
                    })
                  )
                    deleteSaved(m.id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-2 text-sm text-muted">{S.saved.empty}</p>
      )}
    </Section>
  );
}

function SoundCard({
  id,
  label,
  description,
  on,
}: {
  id: string;
  label: string;
  description: string;
  on: boolean;
}) {
  const Icon = soundIcon(id);
  const descId = useId();
  return (
    <button
      type="button"
      data-sound={id}
      aria-pressed={on}
      aria-label={label}
      aria-describedby={descId}
      onClick={() => toggleSound(id)}
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-left focus-visible:focus-ring',
        on ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-3',
      )}
    >
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-5 shrink-0', on ? 'text-accent' : 'text-muted')}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
          {label}
          {on ? <span className="text-xs font-normal text-accent">{S.library.on}</span> : null}
        </span>
        <span id={descId} className="line-clamp-2 text-xs text-muted">
          {description}
        </span>
      </span>
    </button>
  );
}

export function SoundLibrary() {
  const active = useMix((s) => s.data.tracks);
  const on = new Set(active.map((t) => t.key));
  return (
    <>
      {AMBIENCE_CATEGORIES.map((c) => (
        <Section key={c.id} title={c.label} persistKey={`${TOOL_ID}:cat:${c.id}`}>
          <div className="grid grid-cols-2 gap-2" data-category={c.id}>
            {soundsInCategory(c.id).map((d) => (
              <SoundCard
                key={d.id}
                id={d.id}
                label={d.label}
                description={d.description}
                on={on.has(synthKey(d.id))}
              />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

export function FilesSection({ onReject }: { onReject: () => void }) {
  return (
    <Section
      title={S.files.title}
      description={S.files.description}
      persistKey={`${TOOL_ID}:files`}
    >
      <FileDrop
        compact
        multiple
        accept={AUDIO_ACCEPT}
        paste="off"
        label={S.files.drop}
        buttonLabel={S.files.choose}
        hint={S.files.hint}
        icon={<AudioLines />}
        onFiles={(files) => void addFiles(files)}
        onReject={onReject}
        aria-label={S.files.title}
      />
    </Section>
  );
}
