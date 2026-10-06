/**
 * 設定欄的五個分頁：曲目（封面、音樂、曲目資訊）、設計、動態、歌詞、匯出（影片）。
 */
import { AudioLines, FileText, ImageMinus, ImagePlus, Timer, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureFont } from '@/core/fonts';
import { LYRIC_FILE_ACCEPT, lyricStats } from '@/core/lyrics';
import {
  Button,
  ColorField,
  EffectGrid,
  type ExportFormatOption,
  ExportPanel,
  Field,
  FieldRow,
  FileDrop,
  IconButton,
  Section,
  Segmented,
  Show,
  Slider,
  ThumbnailImage,
  Toggle,
  useTheme,
  withShortcut,
} from '@/ui';
import {
  addAudio,
  addCover,
  addLyricFile,
  demoArt,
  notify,
  registerLyricArea,
  rememberCaret,
  removeAudio,
  removeCover,
  stampNow,
} from './actions';
import { detectVideoMode, exportVideo, modeLabel, modeNote, type VideoMode } from './exporter';
import { FONT_CHOICES, fontStack } from './fonts';
import {
  autoHudText,
  BACKGROUNDS,
  DECOS,
  FONTS,
  type FontId,
  FPS_CHOICES,
  formatClock,
  LAYOUTS,
  MOODS,
  RANGES,
  VIZ,
  type VideoFps,
} from './model';
import { parsedLyrics, themeFor } from './scene';
import { edit, step, useSession, useSettings } from './store';
import { S } from './strings';
import { hslToHex } from './theme';
import { ClockInput, HistoryInput, HistoryTextArea, sliderGesture } from './widgets';

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp';
const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.m4a,.flac,.ogg,.oga,.opus,.aac';

/** 滑桿：拖曳中的變更放開才算一步 */
function GestureSlider(props: Parameters<typeof Slider>[0]) {
  return (
    <Slider
      {...props}
      onChange={sliderGesture.live(props.onChange)}
      onCommit={sliderGesture.commit}
    />
  );
}

/* ---------- 曲目 ---------- */

function CoverField() {
  const cover = useSettings((st) => st.data.cover);
  const state = useSession((st) => st.coverState);
  const art = useSession((st) => st.art);
  const exporting = useSession((st) => st.exporting);
  const name = !cover.id
    ? S.files.demoName
    : state === 'missing'
      ? S.files.coverMissing
      : state === 'loading'
        ? S.files.coverLoading
        : cover.name;
  return (
    <Field label={S.files.cover}>
      <div className="flex min-w-0 flex-col gap-2" data-testid="cover-field">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface-2">
            <ThumbnailImage source={(art ?? demoArt()).image as HTMLCanvasElement} />
          </div>
          <span
            className="min-w-0 flex-1 truncate text-sm text-fg"
            title={name}
            data-testid="cover-name"
            data-state={cover.id ? state : 'demo'}
          >
            {name}
          </span>
          {cover.id ? (
            <IconButton
              label={S.files.coverRemove}
              icon={<ImageMinus />}
              size="sm"
              variant="ghost"
              onClick={removeCover}
              disabled={exporting}
            />
          ) : null}
        </div>
        <FileDrop
          compact
          accept={IMAGE_ACCEPT}
          paste="document"
          icon={<ImagePlus />}
          label={S.files.coverDrop}
          hint={S.files.coverHint}
          buttonLabel={cover.id ? S.files.coverReplace : S.files.coverPick}
          aria-label={S.files.cover}
          disabled={exporting}
          onFiles={([f]) => f && void addCover(f)}
          onReject={([f]) => f && notify({ title: S.toast.notImage(f.name), tone: 'danger' })}
        />
      </div>
    </Field>
  );
}

function AudioField() {
  const ref = useSettings((st) => st.data.audio);
  const state = useSession((st) => st.audioState);
  const audio = useSession((st) => st.audio);
  const exporting = useSession((st) => st.exporting);
  const info =
    state === 'loading'
      ? S.files.audioLoading
      : state === 'missing'
        ? S.files.audioMissing
        : audio
          ? S.files.audioInfo(ref.name || '—', formatClock(audio.duration))
          : S.files.audioNone;
  return (
    <Field label={S.files.audio}>
      <div className="flex min-w-0 flex-col gap-2" data-testid="audio-field">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="min-w-0 flex-1 text-sm text-muted"
            data-testid="audio-info"
            data-state={state}
          >
            {info}
          </span>
          {ref.id ? (
            <IconButton
              label={S.files.audioRemove}
              icon={<Trash2 />}
              size="sm"
              variant="ghost"
              onClick={removeAudio}
              disabled={exporting}
            />
          ) : null}
        </div>
        <FileDrop
          compact
          accept={AUDIO_ACCEPT}
          paste="off"
          icon={<AudioLines />}
          label={S.files.audioDrop}
          hint={S.files.audioHint}
          buttonLabel={S.files.audioPick}
          aria-label={S.files.audio}
          disabled={exporting || state === 'loading'}
          filterByAccept={false}
          onFiles={([f]) => f && void addAudio(f)}
        />
      </div>
    </Field>
  );
}

export function TrackTab() {
  const title = useSettings((st) => st.data.title);
  const artist = useSettings((st) => st.data.artist);
  const subtitle = useSettings((st) => st.data.subtitle);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.files.section} fixed>
        <CoverField />
        <AudioField />
        <p className="m-0 text-xs text-muted">{S.files.privacy}</p>
      </Section>
      <Section title={S.info.section} fixed>
        <Field label={S.info.title}>
          <HistoryInput
            value={title}
            maxLength={300}
            onChange={(e) =>
              edit((d) => {
                d.title = e.target.value;
              })
            }
          />
        </Field>
        <Field label={S.info.artist}>
          <HistoryInput
            value={artist}
            maxLength={300}
            placeholder={S.info.artistPlaceholder}
            onChange={(e) =>
              edit((d) => {
                d.artist = e.target.value;
              })
            }
          />
        </Field>
        <Field label={S.info.subtitle} hint={S.info.subtitleHint}>
          <HistoryInput
            value={subtitle}
            maxLength={300}
            placeholder={S.info.subtitlePlaceholder}
            onChange={(e) =>
              edit((d) => {
                d.subtitle = e.target.value;
              })
            }
          />
        </Field>
      </Section>
    </div>
  );
}

/* ---------- 設計 ---------- */

function FontGrid() {
  const font = useSettings((st) => st.data.font);
  const theme = useTheme();
  const [tick, setTick] = useState(0);
  /* 字型樣張：載入每套字型的樣張用字 */
  useEffect(() => {
    let alive = true;
    void Promise.all(
      FONTS.map((id) => ensureFont(FONT_CHOICES[id].family, 400, S.design.fontSample)),
    ).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 字型載入後（tick）、換深淺色（theme）時重畫樣張
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, id: FontId) => {
      const { width: w, height: h } = ctx.canvas;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle =
        getComputedStyle(document.documentElement).getPropertyValue('--text') || '#fff';
      ctx.font = `${FONT_CHOICES[id].single ? 400 : 700} ${Math.round(h * 0.36)}px ${fontStack(id)}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      /* 偏下方一點：左上角有選取的勾勾 */
      ctx.fillText(S.design.fontSample, w / 2, h * 0.62);
    },
    [tick, theme],
  );
  return (
    <EffectGrid
      aria-label={S.design.fontAria}
      items={FONTS.map((id) => ({
        value: id,
        label: S.design.fonts[id].label,
        description: S.design.fonts[id].description,
      }))}
      value={font}
      onValueChange={(v) =>
        v &&
        step((d) => {
          d.font = v;
        })
      }
      draw={draw}
      animate="none"
      thumbWidth={192}
      thumbHeight={64}
      columns={3}
      minItemWidth={96}
    />
  );
}

function AccentField() {
  const s = useSettings((st) => st.data);
  const art = useSession((st) => st.art) ?? demoArt();
  const exporting = useSession((st) => st.exporting);
  const autoHex = useMemo(
    () => hslToHex(themeFor({ ...s, accentAuto: true }, art.palette).acc),
    [s, art],
  );
  return (
    <>
      <Field label={S.design.accentAuto} layout="inline">
        <Toggle
          checked={s.accentAuto}
          disabled={exporting}
          onCheckedChange={(on) =>
            step((d) => {
              d.accentAuto = on;
              /* 關掉自動時從目前抽出來的顏色開始改 */
              if (!on) d.accent = autoHex;
            })
          }
        />
      </Field>
      <Field label={S.design.accent} hint={s.accentAuto ? S.design.accentAutoHint : undefined}>
        <ColorField
          value={s.accentAuto ? autoHex : s.accent}
          disabled={s.accentAuto || exporting}
          onChange={(hex) =>
            edit((d) => {
              d.accent = hex.slice(0, 7);
            })
          }
        />
      </Field>
    </>
  );
}

export function DesignTab() {
  const s = useSettings((st) => st.data);
  const fontFailed = useSession((st) => st.fontFailed);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.design.layoutSection} fixed>
        <Field label={S.design.layout}>
          <Segmented
            fullWidth
            value={s.layout}
            onValueChange={(v) =>
              step((d) => {
                d.layout = v;
              })
            }
            options={LAYOUTS.map((v) => ({ value: v, label: S.design.layouts[v] }))}
          />
        </Field>
        <Field label={S.design.background}>
          <Segmented
            fullWidth
            value={s.background}
            onValueChange={(v) =>
              step((d) => {
                d.background = v;
              })
            }
            options={BACKGROUNDS.map((v) => ({ value: v, label: S.design.backgrounds[v] }))}
          />
        </Field>
        <Field label={S.design.mood} hint={S.design.moodHint}>
          <Segmented
            fullWidth
            value={s.mood}
            onValueChange={(v) =>
              step((d) => {
                d.mood = v;
              })
            }
            options={MOODS.map((v) => ({ value: v, label: S.design.moods[v] }))}
          />
        </Field>
        <Field
          label={S.design.font}
          hint={fontFailed ? undefined : S.design.fontHint}
          error={fontFailed ? S.design.fontFailed : undefined}
        >
          <FontGrid />
        </Field>
        <Field label={S.design.radius}>
          <GestureSlider
            value={s.radius}
            min={RANGES.radius.min}
            max={RANGES.radius.max}
            step={RANGES.radius.step}
            onChange={(v) =>
              edit((d) => {
                d.radius = v;
              })
            }
          />
        </Field>
      </Section>
      <Section title={S.design.accentSection} fixed>
        <AccentField />
      </Section>
      <Section title={S.design.decoSection} fixed>
        <Field label={S.design.deco}>
          <Segmented
            fullWidth
            value={s.deco}
            onValueChange={(v) =>
              step((d) => {
                d.deco = v;
              })
            }
            options={DECOS.map((v) => ({ value: v, label: S.design.decos[v] }))}
          />
        </Field>
        <Show when={s.deco === 'cyber'}>
          <Field label={S.design.hud} layout="inline">
            <Toggle
              checked={s.hud}
              onCheckedChange={(on) =>
                step((d) => {
                  d.hud = on;
                })
              }
            />
          </Field>
          <Field label={S.design.hudText} hint={S.design.hudTextHint}>
            <HistoryInput
              value={s.hudTextAuto ? autoHudText(s.export.fps) : s.hudText}
              maxLength={100}
              onChange={(e) =>
                edit((d) => {
                  d.hudText = e.target.value;
                  d.hudTextAuto = false;
                })
              }
            />
          </Field>
          <Field label={S.design.scanlines} layout="inline">
            <Toggle
              checked={s.scanlines}
              onCheckedChange={(on) =>
                step((d) => {
                  d.scanlines = on;
                })
              }
            />
          </Field>
        </Show>
      </Section>
    </div>
  );
}

/* ---------- 動態 ---------- */

export function MotionTab() {
  const s = useSettings((st) => st.data);
  const hasAudio = useSession((st) => !!st.audio);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.motion.vizSection} fixed>
        <Field label={S.motion.viz} hint={S.motion.vizHint}>
          <Segmented
            fullWidth
            value={s.viz}
            onValueChange={(v) =>
              step((d) => {
                d.viz = v;
              })
            }
            options={VIZ.map((v) => ({ value: v, label: S.motion.vizs[v] }))}
          />
        </Field>
        <Field label={S.motion.progress} layout="inline">
          <Toggle
            checked={s.progress}
            onCheckedChange={(on) =>
              step((d) => {
                d.progress = on;
              })
            }
          />
        </Field>
      </Section>
      <Section title={S.motion.effectsSection} fixed>
        <Field label={S.motion.float} layout="inline" hint={S.motion.floatHint}>
          <Toggle
            checked={s.motion}
            onCheckedChange={(on) =>
              step((d) => {
                d.motion = on;
              })
            }
          />
        </Field>
        <Field
          label={S.motion.react}
          layout="inline"
          hint={hasAudio ? S.motion.reactHint : S.motion.reactNoAudio}
        >
          <Toggle
            checked={s.react}
            onCheckedChange={(on) =>
              step((d) => {
                d.react = on;
              })
            }
          />
        </Field>
        <Field label={S.motion.grain} layout="inline">
          <Toggle
            checked={s.grain}
            onCheckedChange={(on) =>
              step((d) => {
                d.grain = on;
              })
            }
          />
        </Field>
      </Section>
      <Section
        title={S.motion.fakeSection}
        fixed
        description={hasAudio ? S.motion.fakeAudioLoaded : undefined}
      >
        <FieldRow columns={2}>
          <Field label={S.motion.fakeDuration} hint={S.motion.fakeDurationHint}>
            <ClockInput
              value={s.fakeDuration}
              accept={(v) => v > 0 && v < 360000}
              disabled={hasAudio}
              onCommit={(v) =>
                step((d) => {
                  d.fakeDuration = v;
                })
              }
            />
          </Field>
          <Field label={S.motion.fakePosition}>
            <GestureSlider
              value={Math.round(s.fakePosition * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              disabled={hasAudio}
              onChange={(v) =>
                edit((d) => {
                  d.fakePosition = v / 100;
                })
              }
            />
          </Field>
        </FieldRow>
      </Section>
    </div>
  );
}

/* ---------- 歌詞 ---------- */

export function LyricsTab() {
  const s = useSettings((st) => st.data);
  const ly = s.lyrics;
  const hasAudio = useSession((st) => !!st.audio);
  const exporting = useSession((st) => st.exporting);
  const parsed = parsedLyrics(ly.text).parsed;
  const stats = lyricStats(parsed);
  const note = !ly.text.trim()
    ? S.lyrics.empty
    : !parsed.lines.length
      ? S.lyrics.noTimed
      : S.lyrics.stats(stats.lines, stats.translated, stats.untimed);
  const center = s.layout === 'center';
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.lyrics.section} fixed>
        <Field label={S.lyrics.enabled} layout="inline">
          <Toggle
            checked={ly.enabled}
            onCheckedChange={(on) =>
              step((d) => {
                d.lyrics.enabled = on;
              })
            }
          />
        </Field>
        <Show when={ly.enabled}>
          <Field label={S.lyrics.file}>
            <FileDrop
              compact
              accept={LYRIC_FILE_ACCEPT}
              paste="off"
              icon={<FileText />}
              label={ly.fileName || S.lyrics.fileDrop}
              hint={S.lyrics.fileHint}
              buttonLabel={S.lyrics.filePick}
              aria-label={S.lyrics.file}
              filterByAccept={false}
              disabled={exporting}
              onFiles={([f]) => f && void addLyricFile(f)}
            />
          </Field>
          <Field label={S.lyrics.text} hint={note}>
            <HistoryTextArea
              ref={registerLyricArea}
              value={ly.text}
              rows={10}
              spellCheck={false}
              wrap="off"
              placeholder={S.lyrics.textPlaceholder}
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
          <Field label={S.lyrics.position} hint={center ? S.lyrics.positionCenter : undefined}>
            <Segmented
              fullWidth
              value={center ? 'stack' : ly.position}
              onValueChange={(v) =>
                step((d) => {
                  d.lyrics.position = v;
                })
              }
              options={(['bottom', 'stack'] as const).map((v) => ({
                value: v,
                label: S.lyrics.positions[v],
                disabled: center,
              }))}
            />
          </Field>
          <Field label={S.lyrics.size}>
            <GestureSlider
              value={ly.size}
              min={RANGES.lyricSize.min}
              max={RANGES.lyricSize.max}
              step={RANGES.lyricSize.step}
              unit="px"
              onChange={(v) =>
                edit((d) => {
                  d.lyrics.size = v;
                })
              }
            />
          </Field>
          <Field label={S.lyrics.showNext} layout="inline">
            <Toggle
              checked={ly.showNext}
              onCheckedChange={(on) =>
                step((d) => {
                  d.lyrics.showNext = on;
                })
              }
            />
          </Field>
          <Field label={S.lyrics.offset} hint={S.lyrics.offsetHint}>
            <GestureSlider
              value={ly.offset}
              min={RANGES.lyricOffset.min}
              max={RANGES.lyricOffset.max}
              step={RANGES.lyricOffset.step}
              precision={1}
              unit="秒"
              valueText={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} 秒`}
              onChange={(v) =>
                edit((d) => {
                  d.lyrics.offset = Math.round(v * 10) / 10;
                })
              }
            />
          </Field>
        </Show>
      </Section>
    </div>
  );
}

/* ---------- 匯出 ---------- */

function useVideoMode(fps: VideoFps, audioRate: number | null): VideoMode {
  const [mode, setMode] = useState<VideoMode>({ kind: 'checking' });
  useEffect(() => {
    let alive = true;
    setMode({ kind: 'checking' });
    detectVideoMode(fps, audioRate).then((m) => alive && setMode(m));
    return () => {
      alive = false;
    };
  }, [fps, audioRate]);
  return mode;
}

export function ExportTab() {
  const s = useSettings((st) => st.data);
  const audio = useSession((st) => st.audio);
  const exporting = useSession((st) => st.exporting);
  const ex = s.export;
  const mode = useVideoMode(ex.fps, audio?.pcm.sampleRate ?? null);
  const formats = useMemo<ExportFormatOption[]>(
    () => [
      {
        id: 'video',
        label: modeLabel(mode),
        description: modeNote(mode, !!audio),
        animated: true,
        disabled: mode.kind === 'none' || mode.kind === 'checking',
        disabledReason: mode.kind === 'none' ? S.exp.formatNote.unsupported : undefined,
      },
    ],
    [mode, audio],
  );
  const duration = audio?.duration ?? 0;
  const tooShort =
    !!audio && ex.range === 'part' && Math.min(duration, ex.end) - Math.min(duration, ex.start) < 1;
  const signature = useMemo(() => JSON.stringify({ ...s, lyrics: s.lyrics.text.length }), [s]);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.exp.lead}</p>
      <ExportPanel
        title={S.exp.title}
        formats={formats}
        settings={{ format: 'video', fps: ex.fps, plays: 0, scale: 1, quantize: false }}
        onSettingsChange={(next) =>
          step((d) => {
            d.export.fps = next.fps === 60 ? 60 : 30;
          })
        }
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
                      <ClockInput
                        value={ex.start}
                        disabled={exporting}
                        onCommit={(v) =>
                          step((d) => {
                            d.export.start = v;
                          })
                        }
                      />
                    </Field>
                    <Field label={S.exp.end} hint={S.exp.clockHint}>
                      <ClockInput
                        value={ex.end}
                        accept={(v) => v > 0}
                        disabled={exporting}
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
                {mode.kind === 'realtime' ? (
                  <Field label={S.exp.mute} layout="inline" hint={S.exp.muteHint}>
                    <Toggle
                      checked={ex.mute}
                      disabled={exporting}
                      onCheckedChange={(on) =>
                        step((d) => {
                          d.export.mute = on;
                        })
                      }
                    />
                  </Field>
                ) : null}
              </>
            ) : (
              <Field label={S.exp.loopLength} hint={S.exp.loopHint}>
                <GestureSlider
                  value={ex.loopLength}
                  min={RANGES.loopLength.min}
                  max={RANGES.loopLength.max}
                  step={RANGES.loopLength.step}
                  unit="秒"
                  disabled={exporting}
                  onChange={(v) =>
                    edit((d) => {
                      d.export.loopLength = v;
                    })
                  }
                />
              </Field>
            )}
          </div>
        }
        onExport={async (set, ctx) => {
          if (tooShort) throw new Error(S.exp.rangeTooShort);
          try {
            const out = await exportVideo(mode, set.fps, ctx);
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
