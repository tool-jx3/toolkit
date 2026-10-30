/**
 * 設定欄的四個分頁：歌詞（歌詞欄、打點、語言、略過的行、逐句調整）、風格（演出風格與它的設定）、
 * 畫面（尺寸、背景、音樂）、匯出（有聲影片、透明 WebM、PNG 連番）。
 */
import { Crop, FileText, ImageMinus, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { LYRIC_STYLES, type LyricRegion } from '@/core/lyricfx';
import { LYRIC_FILE_ACCEPT } from '@/core/lyrics';
import {
  AudioDrop,
  Button,
  ColorField,
  type ExportFormatOption,
  ExportPanel,
  Field,
  FieldRow,
  FileDrop,
  ImageDrop,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Toggle,
  withShortcut,
} from '@/ui';
import { LyricStyleControls } from '@/ui/LyricStyleControls';
import {
  addAudio,
  addBackground,
  addLyricFile,
  cancelRegionEdit,
  notify,
  patchStyle,
  registerLyricArea,
  rememberCaret,
  removeAudio,
  removeBackground,
  resetCreditWords,
  resetInstWords,
  setRegion,
  stampNow,
  startRegionEdit,
} from './actions';
import {
  detectVideoMode,
  detectWebmMode,
  PNG_MAX_FRAMES,
  pngFrameCount,
  runExport,
  type VideoMode,
  videoLabel,
  videoNote,
  type WebmMode,
  webmNote,
} from './exporter';
import { LineList } from './LineList';
import { FPS_CHOICES, RANGES, SIZES, sizeOf, type VideoFps } from './model';
import { builtLines, loopLength, styleOf, styleSettings } from './scene';
import { edit, step, usePreview, useSession, useSettings } from './store';
import { S } from './strings';
import { GestureSlider, gesture, HistoryTextArea, TimeInput } from './widgets';

/* ---------- 歌詞 ---------- */

function WordsField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  return (
    <Field
      label={label}
      hint={S.lyrics.wordsHint}
      labelSuffix={
        <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={onReset}>
          {S.lyrics.resetWords}
        </Button>
      }
    >
      <HistoryTextArea
        value={value}
        rows={4}
        spellCheck={false}
        className="font-mono text-xs"
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function LyricsTab() {
  const s = useSettings((st) => st.data);
  const hasAudio = useSession((st) => !!st.audio);
  const exporting = useSession((st) => st.exporting);
  const built = builtLines(s);
  const translated = built.rows.filter((r) => r.tr && !r.skipped).length;
  const skipped = built.rows.filter((r) => r.skipped).length;
  const note = !s.lyrics.text.trim()
    ? S.lyrics.empty
    : built.untimed
      ? S.lyrics.untimed
      : S.lyrics.stats(built.rows.length - skipped, translated, built.untimedRows, skipped);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.lyrics.section} fixed>
        <Field label={S.lyrics.file}>
          <FileDrop
            compact
            accept={LYRIC_FILE_ACCEPT}
            paste="off"
            icon={<FileText />}
            label={s.lyrics.fileName || S.lyrics.fileDrop}
            hint={S.lyrics.fileHint}
            buttonLabel={S.lyrics.filePick}
            filterByAccept={false}
            disabled={exporting}
            onFiles={([f]) => f && void addLyricFile(f)}
          />
        </Field>
        <Field
          label={S.lyrics.text}
          hint={
            <>
              {note}
              {built.truncated ? ` ${S.lyrics.truncated(built.lines.length)}` : ''}
            </>
          }
        >
          <HistoryTextArea
            ref={registerLyricArea}
            value={s.lyrics.text}
            rows={10}
            spellCheck={false}
            wrap="off"
            placeholder={S.lyrics.placeholder}
            className="font-mono text-xs leading-relaxed"
            data-testid="lyrics-text"
            onChange={(e) => {
              rememberCaret(e.target.selectionStart);
              edit((d) => {
                d.lyrics.text = e.target.value;
              });
            }}
            onSelect={(e) => rememberCaret(e.currentTarget.selectionStart)}
          />
        </Field>
        <div className="flex flex-col gap-1">
          <Button
            icon={<Timer />}
            onClick={stampNow}
            disabled={!hasAudio || exporting}
            onMouseDown={(e) => e.preventDefault()}
            title={withShortcut(S.lyrics.stamp, 'mod+enter')}
            data-testid="stamp"
          >
            {S.lyrics.stamp}
          </Button>
          <p className="m-0 text-xs text-muted">
            {hasAudio ? S.lyrics.stampHint : S.lyrics.stampNeedsAudio}
          </p>
        </div>
        <Field label={S.lyrics.offset} hint={S.lyrics.offsetHint}>
          <GestureSlider
            value={s.lyrics.offset}
            min={RANGES.offset.min}
            max={RANGES.offset.max}
            step={RANGES.offset.step}
            unit="秒"
            onChange={(v) =>
              edit((d) => {
                d.lyrics.offset = Math.round(v * 10) / 10;
              })
            }
          />
        </Field>
        <Field label={S.lyrics.language} hint={S.lyrics.languageHint}>
          <Segmented
            fullWidth
            value={s.language}
            onValueChange={(v) =>
              step((d) => {
                d.language = v;
              })
            }
            options={(['original', 'translation', 'both'] as const).map((v) => ({
              value: v,
              label: S.lyrics.languages[v],
            }))}
          />
        </Field>
      </Section>
      <Section title={S.lyrics.filters} persistKey="lyric-fx:filters" defaultOpen={false}>
        <Field label={S.lyrics.credits} layout="inline">
          <Toggle
            checked={s.filters.credits}
            onCheckedChange={(v) =>
              step((d) => {
                d.filters.credits = v;
              })
            }
          />
        </Field>
        <Show when={s.filters.credits}>
          <WordsField
            label={S.lyrics.creditWords}
            value={s.filters.creditWords}
            onReset={resetCreditWords}
            onChange={(v) =>
              edit((d) => {
                d.filters.creditWords = v;
              })
            }
          />
        </Show>
        <Field label={S.lyrics.inst} layout="inline">
          <Toggle
            checked={s.filters.inst}
            onCheckedChange={(v) =>
              step((d) => {
                d.filters.inst = v;
              })
            }
          />
        </Field>
        <Show when={s.filters.inst}>
          <WordsField
            label={S.lyrics.instWords}
            value={s.filters.instWords}
            onReset={resetInstWords}
            onChange={(v) =>
              edit((d) => {
                d.filters.instWords = v;
              })
            }
          />
        </Show>
      </Section>
      <LineList />
    </div>
  );
}

/* ---------- 風格 ---------- */

const pctOf = (v: number) => Math.round(v * 1000) / 10;

function RegionControls() {
  const s = useSettings((st) => st.data);
  const editing = useSession((st) => st.regionEditing);
  const show = usePreview((st) => st.data.showRegion);
  const region = s.region;
  const set = (patch: Partial<LyricRegion>) => {
    const base = region ?? { x: 0.35, y: 0.3, width: 0.3, height: 0.4 };
    const next = { ...base, ...patch };
    next.width = Math.min(next.width, 1 - next.x);
    next.height = Math.min(next.height, 1 - next.y);
    setRegion(next);
  };
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="region-controls">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={editing ? 'primary' : 'secondary'}
          icon={<Crop />}
          onClick={() => (editing ? cancelRegionEdit() : startRegionEdit())}
          data-testid="region-pick"
          aria-pressed={editing}
        >
          {editing ? S.style.regionCancel : S.style.regionPick}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 />}
          disabled={!region}
          onClick={() => setRegion(null)}
          data-testid="region-clear"
        >
          {S.style.regionClear}
        </Button>
        <span className="text-xs text-muted" data-testid="region-status">
          {region
            ? S.style.regionSet(Math.round(region.width * 100), Math.round(region.height * 100))
            : S.style.regionNone}
        </span>
      </div>
      {editing ? <p className="m-0 text-xs text-accent">{S.style.regionEditing}</p> : null}
      {region ? (
        <>
          <FieldRow columns={4}>
            {(
              [
                ['x', 'x'],
                ['y', 'y'],
                ['w', 'width'],
                ['h', 'height'],
              ] as const
            ).map(([label, k]) => (
              <Field key={k} label={S.style.regionFields[label]}>
                <NumberInput
                  value={pctOf(region[k])}
                  min={k === 'width' || k === 'height' ? 0.3 : 0}
                  max={100}
                  step={0.1}
                  unit="%"
                  size="sm"
                  onChange={() => {}}
                  onCommit={(v) => set({ [k]: v / 100 })}
                />
              </Field>
            ))}
          </FieldRow>
          <Field label={S.style.regionShow} layout="inline">
            <Toggle
              checked={show}
              onCheckedChange={(v) =>
                usePreview.getState().update((d) => {
                  d.showRegion = v;
                })
              }
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}

const NO_PRESETS: never[] = [];

export function StyleTab() {
  const s = useSettings((st) => st.data);
  const exporting = useSession((st) => st.exporting);
  const style = styleOf(s);
  const settings = styleSettings(s);
  const allPresets = usePreview((st) => st.data.presets);
  const presets = allPresets[style.id] ?? NO_PRESETS;
  const lines = builtLines(s).lines;
  const fontFailed = useSession((st) => st.fontFailed);
  const notes = [
    ...(style.notes?.(lines, settings) ?? []),
    ...(fontFailed ? [S.toast.fontFailed] : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.style.section} fixed>
        <Field label={S.style.styleLabel} hint={style.description}>
          <Select
            value={style.id}
            onValueChange={(v) =>
              step((d) => {
                d.styleId = v;
              })
            }
            options={LYRIC_STYLES.map((x) => ({ value: x.id, label: x.name }))}
            data-testid="style-select"
          />
        </Field>
        {notes.map((n) => (
          <p key={n} className="m-0 rounded-sm bg-warning-soft px-2 py-1 text-xs" role="note">
            {n}
          </p>
        ))}
      </Section>
      <LyricStyleControls
        sections={style.controls}
        settings={settings}
        disabled={exporting}
        persistKey={`lyric-fx:${style.id}`}
        onChange={(patch, kind) => {
          if (kind === 'live') gesture.live(() => patchStyle(patch, 'edit'))();
          else patchStyle(patch, kind === 'step' ? 'step' : 'edit');
        }}
        onCommit={gesture.commit}
        renderRegion={() => <RegionControls />}
        context={{ region: s.region }}
        userPresets={presets}
        onUserPresetsChange={(list) =>
          usePreview.getState().update((d) => {
            d.presets[style.id] = list;
          })
        }
      />
    </div>
  );
}

/* ---------- 畫面 ---------- */

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp';
const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.flac,.ogg,.oga,.opus,.aac';

export function CanvasTab() {
  const s = useSettings((st) => st.data);
  const exporting = useSession((st) => st.exporting);
  const audioState = useSession((st) => st.audioState);
  const bgState = useSession((st) => st.bgState);
  const audioStatus =
    audioState === 'loading'
      ? { tone: 'progress' as const, message: S.canvas.musicLoading }
      : audioState === 'ready'
        ? { tone: 'success' as const, message: S.canvas.musicLoaded(s.audio.name) }
        : audioState === 'missing'
          ? { tone: 'warning' as const, message: S.canvas.musicMissing }
          : audioState === 'error'
            ? { tone: 'danger' as const, message: S.canvas.musicFailed }
            : null;
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.canvas.music} fixed>
        <AudioDrop
          onFile={(f) => void addAudio(f)}
          accept={AUDIO_ACCEPT}
          label={S.canvas.musicDrop}
          buttonLabel={S.canvas.musicPick}
          hint={S.canvas.musicHint}
          status={audioStatus}
          disabled={exporting}
          onReject={(files) =>
            notify({ title: S.toast.notSupported(files[0]?.name ?? ''), tone: 'danger' })
          }
          aria-label={S.canvas.music}
        />
        {s.audio.id ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            onClick={removeAudio}
            disabled={exporting}
          >
            {S.canvas.musicRemove}
          </Button>
        ) : null}
      </Section>
      <Section title={S.canvas.section} fixed>
        <Field label={S.canvas.size} hint={S.canvas.sizeHint}>
          <Select
            value={s.canvas.size}
            onValueChange={(v) =>
              step((d) => {
                d.canvas.size = v as typeof d.canvas.size;
              })
            }
            options={SIZES.map((v) => ({ value: v, label: S.canvas.sizes[v] }))}
            data-testid="size-select"
          />
        </Field>
        <Field label={S.canvas.background} hint={S.canvas.backgroundHint}>
          <Segmented
            fullWidth
            value={s.background.kind}
            onValueChange={(v) =>
              step((d) => {
                d.background.kind = v;
              })
            }
            options={(['transparent', 'color', 'image'] as const).map((v) => ({
              value: v,
              label: S.canvas.backgrounds[v],
            }))}
          />
        </Field>
        <Show when={s.background.kind !== 'transparent'}>
          <Field label={S.canvas.color}>
            <ColorField
              value={s.background.color}
              onChange={(v) =>
                edit((d) => {
                  d.background.color = v;
                })
              }
            />
          </Field>
        </Show>
        <Show when={s.background.kind === 'image'}>
          <Field label={S.canvas.image}>
            <ImageDrop
              compact
              accept={IMAGE_ACCEPT}
              paste="focus"
              label={S.canvas.imageDrop}
              buttonLabel={S.canvas.imagePick}
              disabled={exporting}
              onFiles={([f]) => f && void addBackground(f)}
            />
          </Field>
          <p className="m-0 min-w-0 truncate text-xs text-muted" title={s.background.image.name}>
            {s.background.image.id
              ? bgState === 'missing'
                ? S.canvas.imageMissing
                : S.canvas.imageCurrent(s.background.image.name)
              : S.canvas.imageNone}
          </p>
          {s.background.image.id ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<ImageMinus />}
              onClick={removeBackground}
              disabled={exporting}
            >
              {S.canvas.imageRemove}
            </Button>
          ) : null}
          <Field label={S.canvas.fit} hint={S.canvas.fitHint}>
            <Segmented
              fullWidth
              value={s.background.fit}
              onValueChange={(v) =>
                step((d) => {
                  d.background.fit = v;
                })
              }
              options={(['cover', 'contain'] as const).map((v) => ({
                value: v,
                label: S.canvas.fits[v],
              }))}
            />
          </Field>
        </Show>
      </Section>
    </div>
  );
}

/* ---------- 匯出 ---------- */

function useModes(
  fps: number,
  audioRate: number | null,
  width: number,
  height: number,
  webmAudio: boolean,
) {
  const [video, setVideo] = useState<VideoMode>({ kind: 'checking' });
  const [webm, setWebm] = useState<WebmMode>({ kind: 'checking' });
  useEffect(() => {
    let live = true;
    setVideo({ kind: 'checking' });
    void detectVideoMode({ width, height }, fps, audioRate).then((m) => {
      if (live) setVideo(m);
    });
    return () => {
      live = false;
    };
  }, [fps, audioRate, width, height]);
  useEffect(() => {
    let live = true;
    setWebm({ kind: 'checking' });
    void detectWebmMode({ width, height }, fps, !!audioRate && webmAudio).then((m) => {
      if (live) setWebm(m);
    });
    return () => {
      live = false;
    };
  }, [fps, audioRate, width, height, webmAudio]);
  return { video, webm };
}

type FormatId = 'video' | 'webm' | 'png';

export function ExportTab() {
  const s = useSettings((st) => st.data);
  const audio = useSession((st) => st.audio);
  const exporting = useSession((st) => st.exporting);
  const fontTick = useSession((st) => st.fontTick);
  const [format, setFormat] = useState<FormatId>('video');
  const ex = s.export;
  const size = sizeOf(s.canvas.size);
  const { video, webm } = useModes(
    ex.fps,
    audio?.pcm.sampleRate ?? null,
    size.width,
    size.height,
    ex.webmAudio,
  );
  const frames = pngFrameCount(s, ex.fps);
  const pngOver = frames > PNG_MAX_FRAMES;
  const formats = useMemo<ExportFormatOption[]>(
    () => [
      {
        id: 'video',
        label: videoLabel(video),
        description: videoNote(video, !!audio),
        animated: true,
        disabled: video.kind === 'none' || video.kind === 'checking',
        disabledReason: video.kind === 'none' ? S.exp.formatNote.unsupported : undefined,
      },
      {
        id: 'webm',
        label: S.exp.formats.webm,
        description: webmNote(webm),
        animated: true,
        disabled: webm.kind === 'none' || webm.kind === 'checking',
        disabledReason: webm.kind === 'none' ? S.exp.formatNote.webmUnsupported : undefined,
      },
      {
        id: 'png',
        label: S.exp.formats.png,
        description: S.exp.formatNote.png,
        animated: true,
        disabled: pngOver,
        disabledReason: pngOver ? S.exp.pngTooMany(frames, PNG_MAX_FRAMES) : undefined,
      },
    ],
    [video, webm, audio, pngOver, frames],
  );
  const duration = audio?.duration ?? 0;
  const tooShort =
    !!audio && ex.range === 'part' && Math.min(duration, ex.end) - Math.min(duration, ex.start) < 1;
  const noLyrics = !builtLines(s).lines.length;
  const signature = useMemo(() => JSON.stringify({ ...s, lyrics: s.lyrics.text.length }), [s]);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.exp.lead}</p>
      <ExportPanel
        title={S.exp.title}
        formats={formats}
        settings={{ format, fps: ex.fps, plays: 0, scale: 1, quantize: false }}
        onSettingsChange={(next) => {
          setFormat(next.format as FormatId);
          if (next.fps !== ex.fps)
            step((d) => {
              d.export.fps = (
                FPS_CHOICES.includes(next.fps as VideoFps) ? next.fps : 30
              ) as VideoFps;
            });
        }}
        fpsOptions={FPS_CHOICES}
        sizeWarningBytes={Number.POSITIVE_INFINITY}
        resetKey={signature}
        extra={
          <div className="flex flex-col gap-3">
            {audio ? (
              <>
                <Field label={S.exp.range}>
                  <Segmented
                    fullWidth
                    value={ex.range}
                    disabled={exporting}
                    onValueChange={(v) =>
                      step((d) => {
                        d.export.range = v;
                      })
                    }
                    options={(['all', 'part'] as const).map((v) => ({
                      value: v,
                      label: S.exp.ranges[v],
                    }))}
                  />
                </Field>
                <Show when={ex.range === 'part'}>
                  <FieldRow columns={2}>
                    <Field label={S.exp.start} hint={S.exp.clockHint}>
                      <TimeInput
                        value={ex.start}
                        disabled={exporting}
                        testId="export-start"
                        onCommit={(v) =>
                          step((d) => {
                            d.export.start = v;
                          })
                        }
                      />
                    </Field>
                    <Field label={S.exp.end} hint={S.exp.clockHint}>
                      <TimeInput
                        value={ex.end}
                        accept={(v) => v > 0}
                        disabled={exporting}
                        testId="export-end"
                        onCommit={(v) =>
                          step((d) => {
                            d.export.end = v;
                          })
                        }
                      />
                    </Field>
                  </FieldRow>
                  {tooShort ? (
                    <p role="alert" className="m-0 text-sm text-danger" data-testid="range-error">
                      {S.exp.rangeTooShort}
                    </p>
                  ) : null}
                </Show>
              </>
            ) : (
              <p className="m-0 text-xs text-muted">
                {S.exp.noAudioRange(loopLength(s, fontTick))}
              </p>
            )}
            {format === 'webm' && audio ? (
              <Field label={S.exp.webmAudio} layout="inline">
                <Toggle
                  checked={ex.webmAudio}
                  disabled={exporting}
                  onCheckedChange={(v) =>
                    step((d) => {
                      d.export.webmAudio = v;
                    })
                  }
                />
              </Field>
            ) : null}
            {noLyrics ? (
              <p role="alert" className="m-0 text-sm text-warning">
                {S.exp.noLyrics}
              </p>
            ) : null}
          </div>
        }
        onExport={async (set, ctx) => {
          if (tooShort) throw new Error(S.exp.rangeTooShort);
          const f = set.format as FormatId;
          try {
            const out = await runExport(
              f === 'video'
                ? { format: 'video', mode: video }
                : f === 'webm'
                  ? { format: 'webm', mode: webm }
                  : { format: 'png' },
              set.fps,
              ctx,
            );
            notify({ title: S.toast.exported(out.fileName), tone: 'success' });
            return out;
          } catch (e) {
            if ((e instanceof DOMException && e.name === 'AbortError') || ctx.signal.aborted)
              notify({ title: S.toast.cancelled, tone: 'warning' });
            throw e;
          }
        }}
      />
    </div>
  );
}
