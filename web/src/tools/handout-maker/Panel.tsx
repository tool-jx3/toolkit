/**
 * 設定欄的三個分頁：
 * - 內容：主題（＋套用範例）、標題、主題專用的文字、本文、字級、對齊、狀態印章；
 * - 外觀：字型、背景色與文字顏色、紙張質感、大小（含對齊 24 px）；
 * - 圖片：附圖（大小、濾鏡）、背景圖（擺法、模糊、色調、不透明度）。
 * 只有這個主題用得到的欄位才出現（規格 F02）。
 */
import { Image as ImageIcon, ImagePlus, LayoutTemplate, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  FileDrop,
  GestureScope,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import { ExamplesDialog } from './ExamplesDialog';
import { clearImage, type ImageSlot, loadImageFiles } from './media';
import {
  ALIGNS,
  type Align,
  BG_BLUR_RANGE,
  BG_FITS,
  BG_HUE_RANGE,
  BG_OPACITY_RANGE,
  type BgFit,
  BODY_MAX,
  clipChars,
  EXTRA_MAX,
  type ExtraKey,
  FONT_IDS,
  FONT_SIZE_RANGE,
  type FontId,
  GRID_PX,
  gridCells,
  IMAGE_FILTER_IDS,
  IMAGE_SIZE_RANGE,
  type ImageFilterId,
  normalizeColor,
  SIZE_RANGE,
  SIZE_STEP,
  STAMP_IDS,
  type StampId,
  TEXTURE_IDS,
  type TextureId,
  THEME_DEFAULTS,
  THEME_FIELDS,
  THEME_IDS,
  type ThemeId,
  TITLE_MAX,
  unifyNewlines,
} from './model';
import {
  editActive,
  gesture,
  resetColor,
  setSize,
  setSnap,
  setTheme,
  useActive,
  usePrefs,
} from './store';
import { S } from './strings';

/** 文字欄：聚焦到離開算一步復原 */
const textGesture = { onFocus: gesture.begin, onBlur: gesture.commit };

export function useImageLoader() {
  const toast = useToast();
  return (slot: ImageSlot, files: File[]) =>
    void loadImageFiles(slot, files).then((n) => {
      if (n) toast({ title: n.title, description: n.description, tone: n.tone });
    });
}

/* ---------- 內容 ---------- */

export function ThemeSection() {
  const h = useActive();
  const [open, setOpen] = useState(false);
  return (
    <Section title={S.secTheme}>
      <Field label={S.theme} hint={S.themeDesc[h.theme]}>
        <Select<ThemeId>
          value={h.theme}
          onValueChange={setTheme}
          data-testid="theme-select"
          options={THEME_IDS.map((t) => ({
            value: t,
            label: S.themes[t],
            description: S.themeDesc[t],
          }))}
        />
      </Field>
      <div>
        <Button icon={<LayoutTemplate />} onClick={() => setOpen(true)} data-testid="examples-open">
          {S.examples}
        </Button>
      </div>
      <ExamplesDialog open={open} onOpenChange={setOpen} />
    </Section>
  );
}

function ExtraField({ k }: { k: ExtraKey }) {
  const value = useActive().extra[k];
  return (
    <Field label={S.extras[k]} hint={S.extraHint[k] || undefined}>
      <TextInput
        value={value}
        placeholder={S.extraPlaceholder[k]}
        data-field={`extra-${k}`}
        {...textGesture}
        onChange={(e) =>
          editActive((h) => {
            h.extra[k] = clipChars(e.target.value.replace(/[\r\n]/g, ' '), EXTRA_MAX);
          })
        }
      />
    </Field>
  );
}

export function TextSection() {
  const h = useActive();
  const fields = THEME_FIELDS[h.theme];
  const sms = fields.marker === 'sent';
  const count = Array.from(h.body).length;
  return (
    <Section title={S.secText}>
      <Field
        label={S.title}
        hidden={!fields.title}
        hint={
          h.theme === 'window'
            ? S.titleHintWindow
            : h.theme === 'terminal'
              ? S.titleHintTerminal
              : undefined
        }
      >
        <TextInput
          value={h.title}
          placeholder={S.titlePlaceholder}
          data-field="title"
          {...textGesture}
          onChange={(e) =>
            editActive((d) => {
              d.title = clipChars(e.target.value.replace(/[\r\n]/g, ' '), TITLE_MAX);
            })
          }
        />
      </Field>
      {fields.extras.map((k) => (
        <ExtraField key={k} k={k} />
      ))}
      <Field
        label={S.body}
        labelSuffix={
          <span
            className="rounded-sm border border-border px-1.5 text-xs text-accent"
            data-testid="marker-hint"
          >
            {sms ? S.markerSent : S.markerCensor}
          </span>
        }
        hint={
          <span className="flex flex-wrap justify-between gap-x-3">
            <span>{sms ? S.bodyHintSms : S.bodyHint}</span>
            <span className="tabular-nums" data-testid="body-count">
              {S.bodyCount(count, BODY_MAX)}
            </span>
          </span>
        }
      >
        <TextArea
          value={h.body}
          rows={8}
          placeholder={sms ? S.bodyPlaceholderSms : S.bodyPlaceholder}
          data-field="body"
          {...textGesture}
          onChange={(e) =>
            editActive((d) => {
              d.body = clipChars(unifyNewlines(e.target.value), BODY_MAX);
            })
          }
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.fontSize}>
          <NumberInput
            value={h.fontSize}
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            unit={S.pxUnit}
            onChange={(v) =>
              editActive((d) => {
                d.fontSize = Math.round(v);
              })
            }
          />
        </Field>
        <Field label={S.stamp} hidden={!fields.stamp}>
          <Select<StampId>
            value={h.stamp}
            data-testid="stamp-select"
            onValueChange={(v) =>
              editActive((d) => {
                d.stamp = v;
              })
            }
            options={STAMP_IDS.map((s) => ({ value: s, label: S.stamps[s] }))}
          />
        </Field>
      </FieldRow>
      {fields.align ? (
        <Field label={S.align}>
          <Segmented<Align>
            value={h.align}
            onValueChange={(v) =>
              editActive((d) => {
                d.align = v;
              })
            }
            options={ALIGNS.map((a) => ({ value: a, label: S.aligns[a] }))}
            fullWidth
          />
        </Field>
      ) : !sms ? (
        <p className="m-0 text-xs text-muted">{S.alignHintFixed}</p>
      ) : null}
      {fields.stamp ? <p className="m-0 text-xs text-muted">{S.stampHint}</p> : null}
    </Section>
  );
}

/* ---------- 外觀 ---------- */

export function FontSection() {
  const h = useActive();
  const themeFont = S.fonts[THEME_DEFAULTS[h.theme].font];
  return (
    <Section title={S.secFont}>
      <Field label={S.font} hint={`${S.themeFontNote(themeFont)}${S.fontHint}`}>
        <Select<FontId>
          value={h.font}
          data-testid="font-select"
          onValueChange={(v) =>
            editActive((d) => {
              d.font = v;
            })
          }
          options={FONT_IDS.map((f) => ({ value: f, label: S.fonts[f] }))}
        />
      </Field>
    </Section>
  );
}

const BG_SWATCHES = ['#ffffff', '#f4f1ea', '#fdfd96', '#e8dcc6', '#0f1928', '#000000'] as const;
const TEXT_SWATCHES = ['#333333', '#3b2a1a', '#44ddff', '#00ff00', '#b91c1c', '#ffffff'] as const;

export function ColorSection() {
  const h = useActive();
  const d = THEME_DEFAULTS[h.theme];
  return (
    <Section title={S.secColor}>
      <Field
        label={S.bgColor}
        hint={S.bgColorHint}
        labelSuffix={
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            aria-label={S.resetBgAria}
            disabled={h.bgColor === d.bg}
            onClick={() => resetColor('bg')}
          >
            {S.resetColor}
          </Button>
        }
      >
        <GestureScope gesture={gesture}>
          <ColorField
            value={h.bgColor}
            alpha
            swatches={BG_SWATCHES}
            onChange={(v) =>
              editActive((x) => {
                x.bgColor = normalizeColor(v, x.bgColor, true);
              })
            }
          />
        </GestureScope>
      </Field>
      <Field
        label={S.textColor}
        hint={S.textColorHint}
        labelSuffix={
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            aria-label={S.resetTextAria}
            disabled={h.textColor === d.text}
            onClick={() => resetColor('text')}
          >
            {S.resetColor}
          </Button>
        }
      >
        <GestureScope gesture={gesture}>
          <ColorField
            value={h.textColor}
            swatches={TEXT_SWATCHES}
            onChange={(v) =>
              editActive((x) => {
                x.textColor = normalizeColor(v.slice(0, 7), x.textColor);
              })
            }
          />
        </GestureScope>
      </Field>
      <p className="m-0 text-xs text-muted">{S.colorNote}</p>
    </Section>
  );
}

export function TextureSection() {
  const h = useActive();
  return (
    <Section title={S.secTexture}>
      <Field label={S.texture}>
        <Select<TextureId>
          value={h.texture}
          data-testid="texture-select"
          onValueChange={(v) =>
            editActive((d) => {
              d.texture = v;
            })
          }
          options={TEXTURE_IDS.map((t) => ({ value: t, label: S.textures[t] }))}
        />
      </Field>
    </Section>
  );
}

export function SizeSection() {
  const h = useActive();
  const scale = usePrefs((p) => p.data.scale);
  const step = h.snap ? GRID_PX : SIZE_STEP;
  return (
    <Section title={S.secSize}>
      <Field label={S.snap} layout="inline" hint={S.snapHint}>
        <Toggle checked={h.snap} onCheckedChange={setSnap} />
      </Field>
      <FieldRow columns={2}>
        <Field label={S.width}>
          <NumberInput
            value={h.width}
            min={SIZE_RANGE.min}
            max={SIZE_RANGE.max}
            step={step}
            unit={S.pxUnit}
            onChange={(v) => setSize('width', v)}
            onCommit={(v) => setSize('width', v, true)}
          />
        </Field>
        <Field label={S.height}>
          <NumberInput
            value={h.height}
            min={SIZE_RANGE.min}
            max={SIZE_RANGE.max}
            step={step}
            unit={S.pxUnit}
            onChange={(v) => setSize('height', v)}
            onCommit={(v) => setSize('height', v, true)}
          />
        </Field>
      </FieldRow>
      <p className="m-0 flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
        {h.snap ? (
          <span data-testid="size-cells">{S.cells(gridCells(h.width), gridCells(h.height))}</span>
        ) : null}
        <span data-testid="size-output">{S.sizeNote(h.width, h.height, scale)}</span>
      </p>
    </Section>
  );
}

/* ---------- 圖片 ---------- */

function ImageDropField({
  slot,
  onFiles,
  paste,
}: {
  slot: ImageSlot;
  onFiles: (files: File[]) => void;
  paste: 'document' | 'off';
}) {
  const h = useActive();
  const ref = slot === 'image' ? h.image : h.bg.image;
  const t =
    slot === 'image'
      ? {
          area: S.imageArea,
          drop: S.imageDrop,
          hint: S.imageDropHint,
          choose: S.imageChoose,
          change: S.imageChange,
          remove: S.imageRemove,
        }
      : {
          area: S.bgArea,
          drop: S.bgDrop,
          hint: S.bgDropHint,
          choose: S.bgChoose,
          change: S.bgChange,
          remove: S.bgRemove,
        };
  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`${slot}-area`}
      data-state={ref ? 'loaded' : 'empty'}
    >
      <FileDrop
        aria-label={t.area}
        accept="image/*"
        paste={paste}
        filterByAccept={false}
        compact={!!ref}
        icon={ref ? <ImageIcon /> : <ImagePlus />}
        label={
          ref ? (
            <span className="flex min-w-0">
              <span className="shrink-0">{S.imageLoaded}</span>
              <span className="truncate" title={ref.name} data-testid={`${slot}-name`}>
                {ref.name || '—'}
              </span>
            </span>
          ) : (
            t.drop
          )
        }
        hint={ref ? undefined : t.hint}
        buttonLabel={ref ? t.change : t.choose}
        onFiles={onFiles}
      />
      {ref ? (
        <div>
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => clearImage(slot)}>
            {t.remove}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ImageSection({ onFiles }: { onFiles: (files: File[]) => void }) {
  const h = useActive();
  const fields = THEME_FIELDS[h.theme];
  return (
    <Section title={S.secImage}>
      <ImageDropField slot="image" onFiles={onFiles} paste="document" />
      <Field label={S.imageSize} hint={fields.imageSize ? S.imageSizeHint : S.imageSizeFixed}>
        <Slider
          value={h.imageSize}
          min={IMAGE_SIZE_RANGE.min}
          max={IMAGE_SIZE_RANGE.max}
          unit={S.percentUnit}
          disabled={!h.image || !fields.imageSize}
          onChange={gesture.live((v: number) =>
            editActive((d) => {
              d.imageSize = Math.round(v);
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.imageFilter}>
        <Select<ImageFilterId>
          value={h.imageFilter}
          disabled={!h.image}
          data-testid="filter-select"
          onValueChange={(v) =>
            editActive((d) => {
              d.imageFilter = v;
            })
          }
          options={IMAGE_FILTER_IDS.map((f) => ({ value: f, label: S.filters[f] }))}
        />
      </Field>
    </Section>
  );
}

export function BgSection({ onFiles }: { onFiles: (files: File[]) => void }) {
  const h = useActive();
  const off = !h.bg.image;
  return (
    <Section title={S.secBg}>
      <ImageDropField slot="bg" onFiles={onFiles} paste="off" />
      <Field label={S.bgFit}>
        <Segmented<BgFit>
          value={h.bg.fit}
          onValueChange={(v) =>
            editActive((d) => {
              d.bg.fit = v;
            })
          }
          options={BG_FITS.map((f) => ({ value: f, label: S.bgFits[f], disabled: off }))}
          fullWidth
        />
      </Field>
      <Field label={S.bgBlur}>
        <Slider
          value={h.bg.blur}
          min={BG_BLUR_RANGE.min}
          max={BG_BLUR_RANGE.max}
          unit={S.pxUnit}
          disabled={off}
          onChange={gesture.live((v: number) =>
            editActive((d) => {
              d.bg.blur = Math.round(v);
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.bgHue}>
        <Slider
          value={h.bg.hue}
          min={BG_HUE_RANGE.min}
          max={BG_HUE_RANGE.max}
          unit={S.degUnit}
          disabled={off}
          onChange={gesture.live((v: number) =>
            editActive((d) => {
              d.bg.hue = Math.round(v);
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.bgOpacity}>
        <Slider
          value={h.bg.opacity}
          min={BG_OPACITY_RANGE.min}
          max={BG_OPACITY_RANGE.max}
          unit={S.percentUnit}
          disabled={off}
          onChange={gesture.live((v: number) =>
            editActive((d) => {
              d.bg.opacity = Math.round(v);
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
    </Section>
  );
}
