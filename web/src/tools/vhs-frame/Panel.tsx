/**
 * 設定欄（規格 1.1～1.4）：照片（載入、重設位置、拿掉、縮放）、文字（字幕、左上文字、字型、時間碼）、畫面（磨損度、比例）。
 */
import { ImageIcon, ImagePlus, LocateFixed, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Field,
  ImageDrop,
  Section,
  Segmented,
  Slider,
  TextArea,
  TextInput,
  useToast,
} from '@/ui';
import {
  ASPECTS,
  type Aspect,
  CAPTION_MAX,
  captionHasExtra,
  charCount,
  clipChars,
  DEFAULT_VIEW,
  formatTape,
  minZoom,
  OSD_FONTS,
  OSD_PRESETS,
  type OsdFont,
  parseClockStart,
  parseTapeStart,
  screenSize,
  TIMECODE_MODES,
  type TimecodeMode,
  tidyOsd,
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

/* ---------- 文字 ---------- */

function CaptionField() {
  const caption = useDoc((s) => s.data.caption);
  const extra = captionHasExtra(caption);
  return (
    <Field
      label={S.caption}
      labelSuffix={
        <span className="text-xs text-muted tabular-nums" data-testid="caption-count">
          {S.captionCount(charCount(caption), CAPTION_MAX)}
        </span>
      }
      hint={extra ? <span data-testid="caption-extra">{S.captionExtra}</span> : S.captionHint}
    >
      <TextArea
        rows={2}
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
function StartField({ mode }: { mode: Exclude<TimecodeMode, 'off'> }) {
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

export function TextSection() {
  const osdFont = useDoc((s) => s.data.osdFont);
  const mode = useDoc((s) => s.data.timecode.mode);
  return (
    <Section title={S.sectionText}>
      <CaptionField />
      <OsdField />
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
      {mode === 'off' ? null : <StartField key={mode} mode={mode} />}
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

/* ---------- 畫面 ---------- */

export function ScreenSection() {
  const wear = useDoc((s) => s.data.wear);
  const aspect = useDoc((s) => s.data.aspect);
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
    </Section>
  );
}
