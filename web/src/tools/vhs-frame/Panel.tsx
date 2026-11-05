/**
 * 設定欄（規格 1.1～1.4、1.10）：照片（載入、重設位置、拿掉、縮放、左右反轉）、字幕（場景、樣子、字型、大小、位置）、
 * 左上與右上（左上文字、動態、時間碼／頻道、字型）、日期戳記、畫面（磨損度、比例、色調、亮度、飽和度、弧面、暗角、圓角、效果）、
 * 動畫（長度、逐字打出、開場、收尾）。
 */
import { ImageIcon, ImagePlus, LocateFixed, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  Field,
  ImageDrop,
  Section,
  Segmented,
  Slider,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import {
  ANIM_LENGTHS,
  ASPECTS,
  type Aspect,
  animPlan,
  BRIGHTNESS_RANGE,
  CAPTION_FONTS,
  CAPTION_LOOKS,
  CAPTION_MAX,
  CAPTION_POSITIONS,
  CAPTION_SIZE_RANGE,
  type CaptionFont,
  type CaptionLook,
  type CaptionPosition,
  CURVE_RANGE,
  captionExtra,
  captionScenes,
  charCount,
  clipChars,
  DEFAULT_VIEW,
  EFFECT_KEYS,
  formatTape,
  GIF_STEP,
  minZoom,
  OSD_FONTS,
  OSD_PRESETS,
  type OsdFont,
  parseClockStart,
  parseStamp,
  parseTapeStart,
  SATURATION_RANGE,
  STAMP_COLORS,
  STAMP_FORMATS,
  STAMP_SIDES,
  type StampColor,
  type StampFormat,
  type StampSide,
  screenSize,
  TIMECODE_MODES,
  type TimecodeMode,
  TONES,
  type Tone,
  tidyChannel,
  tidyOsd,
  VIGNETTE_RANGE,
  WEAR_RANGE,
  wearLevel,
  ZOOM_MAX,
  zoomViewTo,
} from './model';
import { clearPhoto, docNow, edit, gesture, setAspect, setView, useDoc } from './store';
import { S } from './strings';

/* ---------- 照片 ---------- */

export function PhotoSection({
  onFiles,
  onResetView,
}: {
  onFiles: (files: File[]) => void;
  onResetView: () => void;
}) {
  const photo = useDoc((s) => s.data.photo);
  const view = useDoc((s) => s.data.view);
  const aspect = useDoc((s) => s.data.aspect);
  const flip = useDoc((s) => s.data.flip);
  const box = screenSize(aspect);
  const lo = photo ? minZoom(photo, box) : 1;
  return (
    <Section title={S.sectionPhoto}>
      <div data-testid="photo-load" data-state={photo ? 'loaded' : 'empty'}>
        <ImageDrop
          aria-label={S.dropArea}
          paste="document"
          filterByAccept={false}
          compact={!!photo}
          icon={photo ? <ImageIcon /> : <ImagePlus />}
          label={
            photo ? (
              <span className="flex min-w-0" data-testid="photo-name">
                <span className="shrink-0">{S.currentPhoto}</span>
                <span className="truncate" title={photo.name}>
                  {photo.name || '—'}
                </span>
              </span>
            ) : (
              S.drop
            )
          }
          hint={S.dropHint}
          buttonLabel={photo ? S.changePhoto : S.choosePhoto}
          onFiles={onFiles}
        />
      </div>
      {photo ? null : <p className="m-0 text-xs text-muted">{S.noPhotoNote}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={<LocateFixed />} disabled={!photo} onClick={onResetView}>
          {S.resetView}
        </Button>
        <Button icon={<Trash2 />} disabled={!photo} onClick={() => clearPhoto()}>
          {S.removePhoto}
        </Button>
      </div>
      <Field label={S.zoom} hint={S.zoomHint}>
        <Slider
          value={Math.round(view.zoom * 100)}
          min={Math.floor(lo * 100)}
          max={ZOOM_MAX * 100}
          unit="%"
          disabled={!photo}
          onChange={gesture.live((v: number) => {
            const s = docNow();
            if (!s.photo) return;
            setView(zoomViewTo(s.photo, screenSize(s.aspect), s.view, v / 100));
          })}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.flip} layout="inline">
        <Toggle
          checked={flip}
          onCheckedChange={(v) =>
            edit((d) => {
              d.flip = v;
            })
          }
        />
      </Field>
      <p className="m-0 text-xs text-muted">{S.privacy}</p>
    </Section>
  );
}

/** 重設位置（回到蓋滿、置中） */
export function resetView(): void {
  const s = docNow();
  if (!s.photo) return;
  setView({ ...DEFAULT_VIEW });
}

/* ---------- 字幕 ---------- */

function CaptionField() {
  const caption = useDoc((s) => s.data.caption);
  const extra = captionExtra(caption);
  const scenes = captionScenes(caption).length;
  return (
    <Field
      label={S.caption}
      labelSuffix={
        <span className="flex gap-2 text-xs text-muted tabular-nums">
          {scenes > 1 ? <span data-testid="scene-count">{S.sceneCount(scenes)}</span> : null}
          <span data-testid="caption-count">{S.captionCount(charCount(caption), CAPTION_MAX)}</span>
        </span>
      }
      hint={
        extra.lines || extra.scenes ? (
          <span data-testid="caption-extra">
            {[extra.lines && S.captionExtraLines, extra.scenes && S.captionExtraScenes]
              .filter(Boolean)
              .join('')}
          </span>
        ) : (
          S.captionHint
        )
      }
    >
      <TextArea
        rows={4}
        value={caption}
        placeholder={S.captionPlaceholder}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => {
          const v = clipChars(e.target.value, CAPTION_MAX);
          edit((d) => {
            d.caption = v;
          });
        }}
      />
    </Field>
  );
}

/** 預覽「錄影帶」與 PNG 用第幾個場景（兩個以上的場景才出現） */
function SceneField() {
  const caption = useDoc((s) => s.data.caption);
  const scene = useDoc((s) => s.data.scene);
  const n = captionScenes(caption).length;
  if (n < 2) return null;
  const current = Math.min(n - 1, scene);
  return (
    <Field label={S.scene} hint={S.sceneHint}>
      <Segmented<string>
        value={String(current)}
        onValueChange={(v) =>
          edit((d) => {
            d.scene = Number(v);
          })
        }
        options={Array.from({ length: n }, (_, i) => ({
          value: String(i),
          label: String(i + 1),
          ariaLabel: S.sceneAria(i + 1),
        }))}
        columns={Math.min(5, n)}
      />
    </Field>
  );
}

export function CaptionSection() {
  const style = useDoc((s) => s.data.captionStyle);
  return (
    <Section title={S.sectionCaption}>
      <CaptionField />
      <SceneField />
      <Field label={S.captionLook}>
        <Segmented<CaptionLook>
          value={style.look}
          onValueChange={(v) =>
            edit((d) => {
              d.captionStyle.look = v;
            })
          }
          options={CAPTION_LOOKS.map((v) => ({ value: v, label: S.captionLooks[v] }))}
          fullWidth
        />
      </Field>
      <Field label={S.captionFont}>
        <Segmented<CaptionFont>
          value={style.font}
          onValueChange={(v) =>
            edit((d) => {
              d.captionStyle.font = v;
            })
          }
          options={CAPTION_FONTS.map((v) => ({
            value: v,
            label: S.captionFonts[v],
            ariaLabel: S.captionFontAria[v],
          }))}
          fullWidth
        />
      </Field>
      <Field label={S.captionSize}>
        <Slider
          value={style.size}
          min={CAPTION_SIZE_RANGE.min}
          max={CAPTION_SIZE_RANGE.max}
          step={5}
          unit="%"
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.captionStyle.size = Math.round(v);
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.captionPosition}>
        <Segmented<CaptionPosition>
          value={style.position}
          onValueChange={(v) =>
            edit((d) => {
              d.captionStyle.position = v;
            })
          }
          options={CAPTION_POSITIONS.map((v) => ({ value: v, label: S.captionPositions[v] }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

/* ---------- 左上與右上 ---------- */

function OsdField() {
  const osd = useDoc((s) => s.data.osd);
  return (
    <>
      <Field label={S.osd} hint={S.osdHint}>
        <TextInput
          value={osd}
          placeholder={S.osdPlaceholder}
          autoComplete="off"
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => {
            const v = tidyOsd(e.target.value);
            edit((d) => {
              d.osd = v;
            });
          }}
        />
      </Field>
      {/* biome-ignore lint/a11y/useSemanticElements: 一組按鈕（不是表單欄位） */}
      <div role="group" aria-label={S.osdPresets} className="flex flex-wrap gap-1.5">
        {OSD_PRESETS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant="secondary"
            aria-label={S.osdPreset(p)}
            aria-pressed={osd === p}
            onClick={() =>
              edit((d) => {
                d.osd = p;
              })
            }
          >
            {p}
          </Button>
        ))}
      </div>
    </>
  );
}

/** 時間碼的起點：打字時寫得對才套用；寫錯時欄位下方顯示錯誤，離開時改回 */
function StartField({ mode }: { mode: 'tape' | 'clock' }) {
  const tc = useDoc((s) => s.data.timecode);
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const current = mode === 'tape' ? formatTape(tc.tape) : tc.clock;
  const value = draft ?? current;
  const parse = (v: string) => (mode === 'tape' ? parseTapeStart(v) : parseClockStart(v));
  const invalid = draft !== null && parse(draft) === null;
  return (
    <Field
      label={S.timecodeStart}
      hint={mode === 'tape' ? S.tapeStartHint : S.clockStartHint}
      error={invalid ? (mode === 'tape' ? S.tapeStartInvalid : S.clockStartInvalid) : undefined}
    >
      <TextInput
        value={value}
        inputMode={mode === 'tape' ? 'numeric' : 'text'}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          gesture.begin();
          setDraft(current);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          const ok = parse(v);
          if (ok === null) return;
          edit((d) => {
            if (mode === 'tape') d.timecode.tape = ok as number;
            else d.timecode.clock = ok as string;
          });
        }}
        onBlur={(e) => {
          if (parse(e.target.value) === null) {
            const tcNow = docNow().timecode;
            toast({
              title: S.startReverted(mode === 'tape' ? formatTape(tcNow.tape) : tcNow.clock),
              tone: 'warning',
            });
          }
          setDraft(null);
          gesture.commit();
        }}
      />
    </Field>
  );
}

/** 頻道（右上的「CH 03」、開場的轉台） */
function ChannelField() {
  const channel = useDoc((s) => s.data.channel);
  return (
    <Field label={S.channel} hint={S.channelHint}>
      <TextInput
        value={channel}
        autoComplete="off"
        spellCheck={false}
        placeholder="03"
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => {
          const v = tidyChannel(e.target.value);
          edit((d) => {
            d.channel = v;
          });
        }}
      />
    </Field>
  );
}

export function OsdSection() {
  const osdFont = useDoc((s) => s.data.osdFont);
  const mode = useDoc((s) => s.data.timecode.mode);
  const motion = useDoc((s) => s.data.osdMotion);
  return (
    <Section title={S.sectionOsd}>
      <OsdField />
      <Field label={S.osdMotion} layout="inline" hint={S.osdMotionHint}>
        <Toggle
          checked={motion}
          onCheckedChange={(v) =>
            edit((d) => {
              d.osdMotion = v;
            })
          }
        />
      </Field>
      <Field label={S.timecode}>
        <Segmented<TimecodeMode>
          value={mode}
          onValueChange={(v) =>
            edit((d) => {
              d.timecode.mode = v;
            })
          }
          options={TIMECODE_MODES.map((m) => ({ value: m, label: S.timecodeModes[m] }))}
          fullWidth
        />
      </Field>
      {mode === 'tape' || mode === 'clock' ? <StartField key={mode} mode={mode} /> : null}
      {mode === 'channel' ? <ChannelField /> : null}
      <Field label={S.osdFont}>
        <Segmented<OsdFont>
          value={osdFont}
          onValueChange={(v) =>
            edit((d) => {
              d.osdFont = v;
            })
          }
          options={OSD_FONTS.map((f) => ({
            value: f,
            label: S.osdFonts[f],
            ariaLabel: S.osdFontAria[f],
          }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

/* ---------- 日期戳記 ---------- */

/** 日期戳記的日期與時間：打字時寫得對才套用；寫錯時欄位下方顯示錯誤，離開時改回 */
function StampValueField() {
  const value = useDoc((s) => s.data.stamp.value);
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseStamp(draft) === null;
  return (
    <Field
      label={S.stampValue}
      hint={S.stampValueHint}
      error={invalid ? S.stampInvalid : undefined}
    >
      <TextInput
        value={draft ?? value}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          gesture.begin();
          setDraft(value);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          const ok = parseStamp(v);
          if (ok === null) return;
          edit((d) => {
            d.stamp.value = ok;
          });
        }}
        onBlur={(e) => {
          if (parseStamp(e.target.value) === null)
            toast({ title: S.stampReverted(docNow().stamp.value), tone: 'warning' });
          setDraft(null);
          gesture.commit();
        }}
      />
    </Field>
  );
}

export function StampSection() {
  const stamp = useDoc((s) => s.data.stamp);
  return (
    <Section title={S.sectionStamp}>
      <Field label={S.stampOn} layout="inline" hint={S.stampOnHint}>
        <Toggle
          checked={stamp.on}
          onCheckedChange={(v) =>
            edit((d) => {
              d.stamp.on = v;
            })
          }
        />
      </Field>
      {stamp.on ? (
        <>
          <StampValueField />
          <Field label={S.stampFormat}>
            <Segmented<StampFormat>
              value={stamp.format}
              onValueChange={(v) =>
                edit((d) => {
                  d.stamp.format = v;
                })
              }
              options={STAMP_FORMATS.map((v) => ({
                value: v,
                label: S.stampFormats[v],
                ariaLabel: S.stampFormatAria[v],
              }))}
              fullWidth
            />
          </Field>
          <Field label={S.stampColor}>
            <Segmented<StampColor>
              value={stamp.color}
              onValueChange={(v) =>
                edit((d) => {
                  d.stamp.color = v;
                })
              }
              options={STAMP_COLORS.map((v) => ({ value: v, label: S.stampColors[v] }))}
              fullWidth
            />
          </Field>
          <Field label={S.stampSide}>
            <Segmented<StampSide>
              value={stamp.side}
              onValueChange={(v) =>
                edit((d) => {
                  d.stamp.side = v;
                })
              }
              options={STAMP_SIDES.map((v) => ({ value: v, label: S.stampSides[v] }))}
              fullWidth
            />
          </Field>
        </>
      ) : null}
    </Section>
  );
}

/* ---------- 畫面 ---------- */

/** 整數的滑桿（拖曳中即時套用、放開才記一步）；scale：顯示的值＝存的值 ÷ scale（例：弧面存千分比、顯示 %） */
function IntSlider({
  label,
  hint,
  value,
  range,
  unit,
  scale = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  range: { min: number; max: number };
  unit?: string;
  scale?: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Slider
        value={value / scale}
        min={range.min / scale}
        max={range.max / scale}
        step={1 / scale}
        precision={scale > 1 ? 1 : 0}
        unit={unit}
        onChange={gesture.live((v: number) => onChange(Math.round(v * scale)))}
        onCommit={gesture.commit}
      />
    </Field>
  );
}

export function ScreenSection() {
  const wear = useDoc((s) => s.data.wear);
  const aspect = useDoc((s) => s.data.aspect);
  const pic = useDoc((s) => s.data.picture);
  const effects = useDoc((s) => s.data.effects);
  return (
    <Section title={S.sectionScreen}>
      <Field
        label={S.wear}
        hint={
          <span className="flex items-baseline justify-between gap-2">
            <span>{S.wearMin}</span>
            <span className="font-medium text-fg" data-testid="wear-word">
              {S.wearWords[wearLevel(wear)]}
            </span>
            <span>{S.wearMax}</span>
          </span>
        }
      >
        <Slider
          value={wear}
          min={WEAR_RANGE.min}
          max={WEAR_RANGE.max}
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.wear = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.aspect}>
        <Segmented<Aspect>
          value={aspect}
          onValueChange={(v) => setAspect(v)}
          options={ASPECTS.map((a) => ({
            value: a,
            label: S.aspects[a],
            ariaLabel: S.aspectAria[a],
          }))}
          fullWidth
        />
      </Field>
      <Field label={S.tone}>
        <Segmented<Tone>
          value={pic.tone}
          onValueChange={(v) =>
            edit((d) => {
              d.picture.tone = v;
            })
          }
          options={TONES.map((v) => ({ value: v, label: S.tones[v], ariaLabel: S.toneAria[v] }))}
          columns={3}
        />
      </Field>
      <IntSlider
        label={S.brightness}
        value={pic.brightness}
        range={BRIGHTNESS_RANGE}
        unit="%"
        onChange={(v) =>
          edit((d) => {
            d.picture.brightness = v;
          })
        }
      />
      <IntSlider
        label={S.saturation}
        value={pic.saturation}
        range={SATURATION_RANGE}
        unit="%"
        onChange={(v) =>
          edit((d) => {
            d.picture.saturation = v;
          })
        }
      />
      <IntSlider
        label={S.curve}
        hint={S.curveHint}
        value={pic.curve}
        range={CURVE_RANGE}
        unit="%"
        scale={10}
        onChange={(v) =>
          edit((d) => {
            d.picture.curve = v;
          })
        }
      />
      <IntSlider
        label={S.vignette}
        value={pic.vignette}
        range={VIGNETTE_RANGE}
        unit="%"
        onChange={(v) =>
          edit((d) => {
            d.picture.vignette = v;
          })
        }
      />
      <Field label={S.corners} layout="inline" hint={S.cornersHint}>
        <Toggle
          checked={pic.corners}
          onCheckedChange={(v) =>
            edit((d) => {
              d.picture.corners = v;
            })
          }
        />
      </Field>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium text-fg">{S.effects}</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {EFFECT_KEYS.map((k) => (
            <Checkbox
              key={k}
              label={S.effectNames[k]}
              checked={effects[k]}
              onCheckedChange={(v) =>
                edit((d) => {
                  d.effects[k] = v;
                })
              }
            />
          ))}
        </div>
        <p className="m-0 text-xs text-muted">{S.effectsHint}</p>
      </fieldset>
    </Section>
  );
}

/* ---------- 動畫 ---------- */

export function AnimSection() {
  const anim = useDoc((s) => s.data.anim);
  const mode = useDoc((s) => s.data.timecode.mode);
  const caption = useDoc((s) => s.data.caption);
  const plan = animPlan({ caption, anim });
  return (
    <Section title={S.sectionAnim}>
      <Field
        label={S.animLength}
        hint={
          <>
            <span data-testid="anim-total">{S.animFrames(plan.total)}</span>
            {captionScenes(caption).length > 1 ? ` ${S.animLengthHint}` : null}
          </>
        }
      >
        <Segmented<string>
          value={String(anim.length)}
          onValueChange={(v) =>
            edit((d) => {
              d.anim.length = Number(v);
            })
          }
          options={ANIM_LENGTHS.map((n, i) => ({
            value: String(i),
            label: S.animLengthOption((n * GIF_STEP).toFixed(1)),
            ariaLabel: S.animLengthAria(n, (n * GIF_STEP).toFixed(2)),
          }))}
          fullWidth
        />
      </Field>
      <Field label={S.typing} layout="inline">
        <Toggle
          checked={anim.typing}
          onCheckedChange={(v) =>
            edit((d) => {
              d.anim.typing = v;
            })
          }
        />
      </Field>
      <Field label={S.intro} layout="inline" hint={S.introHint}>
        <Toggle
          checked={anim.intro}
          onCheckedChange={(v) =>
            edit((d) => {
              d.anim.intro = v;
            })
          }
        />
      </Field>
      {anim.intro && mode !== 'channel' ? <ChannelField /> : null}
      <Field label={S.outro} layout="inline" hint={S.outroHint}>
        <Toggle
          checked={anim.outro}
          onCheckedChange={(v) =>
            edit((d) => {
              d.anim.outro = v;
            })
          }
        />
      </Field>
    </Section>
  );
}
