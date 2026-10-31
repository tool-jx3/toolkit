/**
 * 設定欄的四個分頁：內容（文字、大小、QR code 設定）、樣式（外觀預設、點、角、背景）、圖片、匯出。
 */
import { Copy, ImageOff } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useAssetImage } from '@/core/assets';
import type { Gradient } from '@/core/gradient';
import {
  encodeQr,
  QR_CORNER_DOT_TYPES,
  QR_CORNER_SQUARE_TYPES,
  QR_DOT_TYPES,
  QR_ECLS,
  type QrEcl,
  type QrModeChoice,
} from '@/core/qr';
import {
  Button,
  ColorField,
  ExportPanel,
  type ExportPanelHandle,
  Field,
  FieldRow,
  GestureScope,
  ImageDrop,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TemplateGallery,
  TextArea,
  TextInput,
  ThumbChoice,
  Toggle,
  useToast,
  useWebpSupport,
} from '@/ui';
import { GradientField } from '@/ui/GradientField';
import { copyCurrent, exportCurrent, removeImage, setImageFile } from './actions';
import {
  type CornerDotChoice,
  type CornerSquareChoice,
  DATA_MAX,
  type DocState,
  MODE_CHOICES,
  type PaintMode,
  RANGES,
} from './model';
import { activeLook, applyLook, LOOK_PRESETS } from './presets';
import {
  assets,
  EXPORT_FORMATS,
  EXPORT_SCALES,
  type ExportFormat,
  edit,
  gesture,
  setPrefs,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { drawCornerDotThumb, drawCornerSquareThumb, drawDotThumb, lookThumb } from './thumbs';

const useD = <T,>(pick: (d: DocState) => T): T => useDoc((s) => pick(s.data));

/* ---------- 內容 ---------- */

function DataField() {
  const data = useD((d) => d.data);
  const qr = useD((d) => d.qr);
  const info = useMemo(() => {
    const r = encodeQr(data, qr);
    if (!r.ok) return null;
    const bytes = r.code.mode === 'byte' ? new TextEncoder().encode(data).length : data.length;
    return S.dataInfo(S.modeName[r.code.mode], bytes, r.code.version, r.code.size);
  }, [data, qr]);
  return (
    <Field label={S.data} hint={info ? `${info}。${S.dataHint}` : S.dataHint}>
      <TextArea
        value={data}
        rows={3}
        maxLength={DATA_MAX}
        placeholder={S.dataPlaceholder}
        data-testid="qr-data"
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) =>
          edit((d) => {
            d.data = e.target.value;
          })
        }
      />
    </Field>
  );
}

function SizeSection() {
  const width = useD((d) => d.width);
  const height = useD((d) => d.height);
  const margin = useD((d) => d.margin);
  const shape = useD((d) => d.shape);
  return (
    <Section title={S.sectionSize} persistKey="qr-maker:size">
      <FieldRow columns={2}>
        <Field label={S.width}>
          <NumberInput
            value={width}
            min={RANGES.size.min}
            max={RANGES.size.max}
            step={1}
            precision={0}
            unit="px"
            onChange={gesture.live((v: number) =>
              edit((d) => {
                d.width = v;
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.height}>
          <NumberInput
            value={height}
            min={RANGES.size.min}
            max={RANGES.size.max}
            step={1}
            precision={0}
            unit="px"
            onChange={gesture.live((v: number) =>
              edit((d) => {
                d.height = v;
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
      </FieldRow>
      <Field label={S.margin} hint={S.marginHint}>
        <Slider
          value={margin}
          min={RANGES.margin.min}
          max={RANGES.margin.slider}
          inputMax={RANGES.margin.max}
          step={1}
          unit="px"
          onChange={gesture.live((v: number) =>
            edit((d) => {
              d.margin = v;
            }),
          )}
          onCommit={gesture.commit}
        />
      </Field>
      <Field label={S.shape} hint={S.shapeHint}>
        <Segmented
          value={shape}
          onValueChange={(v) =>
            edit((d) => {
              d.shape = v;
            })
          }
          options={[
            { value: 'square', label: S.shapes.square },
            { value: 'circle', label: S.shapes.circle },
          ]}
        />
      </Field>
    </Section>
  );
}

function QrSection() {
  const qr = useD((d) => d.qr);
  const versionOptions = useMemo(
    () => [
      { value: '0', label: S.versionAuto },
      ...Array.from({ length: 40 }, (_, i) => ({
        value: String(i + 1),
        label: S.versionOption(i + 1),
        description: S.versionDesc((i + 1) * 4 + 17),
      })),
    ],
    [],
  );
  return (
    <Section title={S.sectionQr} persistKey="qr-maker:qr">
      <Field label={S.ecl} hint={S.eclDesc[qr.ecl]}>
        <Segmented<QrEcl>
          value={qr.ecl}
          onValueChange={(v) =>
            edit((d) => {
              d.qr.ecl = v;
            })
          }
          options={QR_ECLS.map((e) => ({ value: e, label: S.eclOption(e) }))}
          fullWidth
        />
      </Field>
      <Field label={S.version} hint={S.versionHint}>
        <Select
          value={String(qr.version)}
          onValueChange={(v) =>
            edit((d) => {
              d.qr.version = Number(v);
            })
          }
          options={versionOptions}
          data-testid="qr-version"
        />
      </Field>
      <Field label={S.mode} hint={S.modeDesc[qr.mode]}>
        <Select<QrModeChoice>
          value={qr.mode}
          onValueChange={(v) =>
            edit((d) => {
              d.qr.mode = v;
            })
          }
          options={MODE_CHOICES.map((m) => ({ value: m, label: S.modes[m] }))}
          data-testid="qr-mode"
        />
      </Field>
    </Section>
  );
}

export function ContentTab() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionData} fixed>
        <DataField />
      </Section>
      <SizeSection />
      <QrSection />
    </div>
  );
}

/* ---------- 樣式 ---------- */

type PaintKey = 'dots' | 'cornerSquare' | 'cornerDot' | 'background';

/** 顏色欄：單色＝色彩欄、漸層＝漸層欄（拖曳、點色票從按下到放開算一步） */
function PaintFields({ target, label }: { target: PaintKey; label: string }) {
  const p = useD((d) => (target === 'background' ? d.background : d[target].paint));
  const setColor = (color: string) =>
    edit((d) => {
      if (target === 'background') d.background.color = color;
      else d[target].paint.color = color;
    });
  const setGradient = (g: Gradient) =>
    edit((d) => {
      if (target === 'background') d.background.gradient = g;
      else d[target].paint.gradient = g;
    });
  if (p.mode === 'solid')
    return (
      <div className="min-w-0">
        <GestureScope gesture={gesture}>
          <ColorField value={p.color} onChange={setColor} alpha aria-label={label} />
        </GestureScope>
      </div>
    );
  if (p.mode === 'gradient')
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <GestureScope gesture={gesture}>
          <GradientField
            value={p.gradient}
            onChange={setGradient}
            aria-label={`${label}的${S.gradient}`}
          />
        </GestureScope>
        {target === 'cornerSquare' || target === 'cornerDot' ? (
          <p className="m-0 text-xs text-muted">{S.cornerGradientHint}</p>
        ) : null}
      </div>
    );
  return null;
}

function setPaintMode(target: PaintKey, mode: string) {
  edit((d) => {
    if (target === 'background') d.background.mode = mode as DocState['background']['mode'];
    else if (target === 'dots') d.dots.paint.mode = mode as PaintMode;
    else d[target].paint.mode = mode as DocState['cornerSquare']['paint']['mode'];
  });
}

function LooksSection() {
  const active = useD(activeLook);
  const templates = useMemo(
    () =>
      LOOK_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        thumbnail: lookThumb(p),
        data: p,
      })),
    [],
  );
  return (
    <Section title={S.sectionLooks} description={S.looksHint} persistKey="qr-maker:looks">
      <TemplateGallery
        templates={templates}
        activeId={active}
        confirm={false}
        filter={false}
        size="sm"
        onApply={(t) => edit((d) => applyLook(d, t.data.look))}
      />
    </Section>
  );
}

function DotsSection() {
  const doc = useD((d) => d);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, v: (typeof QR_DOT_TYPES)[number]) => drawDotThumb(ctx, doc, v),
    [doc],
  );
  return (
    <Section title={S.sectionDots} persistKey="qr-maker:dots">
      <Field label={S.dotType}>
        <ThumbChoice
          value={doc.dots.type}
          onValueChange={(v) =>
            edit((d) => {
              d.dots.type = v;
            })
          }
          options={QR_DOT_TYPES.map((t) => ({ value: t, label: S.dotTypes[t] }))}
          draw={draw}
          thumbWidth={96}
          thumbHeight={96}
          minItemWidth={76}
          frames={1}
          fps={1}
        />
      </Field>
      <Field label={S.color}>
        <Segmented<PaintMode>
          value={doc.dots.paint.mode}
          onValueChange={(v) => setPaintMode('dots', v)}
          options={[
            { value: 'solid', label: S.paintModes.solid },
            { value: 'gradient', label: S.paintModes.gradient },
          ]}
          aria-label={`${S.sectionDots}的${S.color}`}
        />
      </Field>
      <PaintFields target="dots" label={S.sectionDots} />
      <Field label={S.roundSize} layout="inline" hint={S.roundSizeHint}>
        <Toggle
          checked={doc.dots.roundSize}
          onCheckedChange={(v) =>
            edit((d) => {
              d.dots.roundSize = v;
            })
          }
        />
      </Field>
    </Section>
  );
}

function CornerSquareSection() {
  const doc = useD((d) => d);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, v: CornerSquareChoice) => drawCornerSquareThumb(ctx, doc, v),
    [doc],
  );
  const choices: CornerSquareChoice[] = ['none', ...QR_CORNER_SQUARE_TYPES];
  return (
    <Section
      title={S.sectionCornerSquare}
      description={S.cornerSquareHint}
      persistKey="qr-maker:corner-square"
    >
      <Field
        label={S.cornerSquareType}
        hint={
          doc.cornerSquare.type === 'dot' || doc.cornerSquare.type === 'extra-rounded'
            ? S.cornerRoundHint
            : undefined
        }
      >
        <ThumbChoice
          value={doc.cornerSquare.type}
          onValueChange={(v) =>
            edit((d) => {
              d.cornerSquare.type = v;
            })
          }
          options={choices.map((t) => ({
            value: t,
            label: S.cornerSquareTypes[t],
            description: S.cornerTypeDesc[t],
          }))}
          draw={draw}
          thumbWidth={96}
          thumbHeight={96}
          minItemWidth={76}
          frames={1}
          fps={1}
        />
      </Field>
      <Field label={S.color}>
        <Segmented
          value={doc.cornerSquare.paint.mode}
          onValueChange={(v) => setPaintMode('cornerSquare', v)}
          options={[
            { value: 'inherit', label: S.paintInheritSquare },
            { value: 'solid', label: S.paintModes.solid },
            { value: 'gradient', label: S.paintModes.gradient },
          ]}
          aria-label={`${S.sectionCornerSquare}的${S.color}`}
        />
      </Field>
      <PaintFields target="cornerSquare" label={S.sectionCornerSquare} />
    </Section>
  );
}

function CornerDotSection() {
  const doc = useD((d) => d);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, v: CornerDotChoice) => drawCornerDotThumb(ctx, doc, v),
    [doc],
  );
  const choices: CornerDotChoice[] = ['none', ...QR_CORNER_DOT_TYPES];
  return (
    <Section title={S.sectionCornerDot} persistKey="qr-maker:corner-dot">
      <Field label={S.cornerDotType}>
        <ThumbChoice
          value={doc.cornerDot.type}
          onValueChange={(v) =>
            edit((d) => {
              d.cornerDot.type = v;
            })
          }
          options={choices.map((t) => ({ value: t, label: S.cornerDotTypes[t] }))}
          draw={draw}
          thumbWidth={96}
          thumbHeight={96}
          minItemWidth={76}
          frames={1}
          fps={1}
        />
      </Field>
      <Field label={S.color}>
        <Segmented
          value={doc.cornerDot.paint.mode}
          onValueChange={(v) => setPaintMode('cornerDot', v)}
          options={[
            { value: 'inherit', label: S.paintInheritDot },
            { value: 'solid', label: S.paintModes.solid },
            { value: 'gradient', label: S.paintModes.gradient },
          ]}
          aria-label={`${S.sectionCornerDot}的${S.color}`}
        />
      </Field>
      <PaintFields target="cornerDot" label={S.sectionCornerDot} />
    </Section>
  );
}

function BackgroundSection() {
  const bg = useD((d) => d.background);
  return (
    <Section title={S.sectionBackground} persistKey="qr-maker:background">
      <Field label={S.color} hint={bg.mode === 'transparent' ? S.transparentHint : undefined}>
        <Segmented
          value={bg.mode}
          onValueChange={(v) => setPaintMode('background', v)}
          options={[
            { value: 'solid', label: S.backgroundModes.solid },
            { value: 'gradient', label: S.backgroundModes.gradient },
            { value: 'transparent', label: S.backgroundModes.transparent },
          ]}
          aria-label={`${S.sectionBackground}的${S.color}`}
        />
      </Field>
      <PaintFields target="background" label={S.sectionBackground} />
      <Show when={bg.mode !== 'transparent'}>
        <Field label={S.backgroundRound} hint={S.backgroundRoundHint}>
          <Slider
            value={Math.round(bg.round * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={gesture.live((v: number) =>
              edit((d) => {
                d.background.round = v / 100;
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
      </Show>
    </Section>
  );
}

export function StyleTab() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <LooksSection />
      <DotsSection />
      <CornerSquareSection />
      <CornerDotSection />
      <BackgroundSection />
    </div>
  );
}

/* ---------- 圖片 ---------- */

export function ImageTab() {
  const image = useD((d) => d.image);
  const io = useD((d) => d.imageOptions);
  const status = useAssetImage(assets, image?.id).status;
  const toast = useToast();
  const load = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const n = await setImageFile(f);
    if (n) toast({ title: n.title, tone: n.tone });
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title={S.sectionImage} fixed>
        <ImageDrop
          aria-label={S.imageDropArea}
          accept="image/*,.svg"
          compact
          label={S.imageDrop}
          hint={S.imageDropHint}
          paste="document"
          onFiles={(files) => void load(files)}
        />
        {image ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-sm text-fg" data-testid="image-info">
              {S.imageInfo(image.name, image.width, image.height)}
            </span>
            <Button icon={<ImageOff />} onClick={removeImage}>
              {S.imageRemove}
            </Button>
          </div>
        ) : null}
        {image && status === 'missing' ? (
          <p className="m-0 text-sm text-warning">{S.imageMissing}</p>
        ) : null}
        <Field label={S.imageSize} hint={S.imageSizeHint}>
          <Slider
            value={Math.round(io.size * 100)}
            min={RANGES.imageSize.min * 100}
            max={RANGES.imageSize.max * 100}
            step={5}
            unit="%"
            onChange={gesture.live((v: number) =>
              edit((d) => {
                d.imageOptions.size = v / 100;
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.imageMargin} hint={S.imageMarginHint}>
          <Slider
            value={io.margin}
            min={RANGES.imageMargin.min}
            max={RANGES.imageMargin.slider}
            inputMax={RANGES.imageMargin.max}
            step={1}
            unit="px"
            onChange={gesture.live((v: number) =>
              edit((d) => {
                d.imageOptions.margin = v;
              }),
            )}
            onCommit={gesture.commit}
          />
        </Field>
        <Field label={S.hideDots} layout="inline" hint={S.hideDotsHint}>
          <Toggle
            checked={io.hideBackgroundDots}
            onCheckedChange={(v) =>
              edit((d) => {
                d.imageOptions.hideBackgroundDots = v;
              })
            }
          />
        </Field>
        <p className="m-0 text-xs text-muted">{S.imageTip}</p>
      </Section>
    </div>
  );
}

/* ---------- 匯出 ---------- */

/** Safari 的畫布面積上限（像素）：超過時匯出點陣圖可能失敗 */
export const CANVAS_LIMIT = 16_777_216;

export function ExportTab({ exportRef }: { exportRef: React.Ref<ExportPanelHandle> }) {
  const prefs = usePrefs((p) => p.data);
  const width = useD((d) => d.width);
  const height = useD((d) => d.height);
  const doc = useDoc((s) => s.data);
  const webp = useWebpSupport();
  const toast = useToast();
  const [copying, setCopying] = useState(false);
  const formats = EXPORT_FORMATS.map((f) => ({
    id: f,
    label: S.formats[f],
    description: S.formatDesc[f],
    disabled: f === 'webp' && !webp,
    disabledReason: f === 'webp' && !webp ? S.webpUnsupported : undefined,
  }));
  const settings = { format: prefs.format, fps: 30, plays: 0, scale: prefs.scale, quantize: false };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ExportPanel
        ref={exportRef}
        title={S.exportTitle}
        formats={formats}
        baseSize={{ width, height }}
        scaleOptions={EXPORT_SCALES}
        settings={settings}
        onSettingsChange={(n) =>
          setPrefs({
            format: (EXPORT_FORMATS as readonly string[]).includes(n.format)
              ? (n.format as ExportFormat)
              : 'png',
            scale: (EXPORT_SCALES as readonly number[]).includes(n.scale) ? n.scale : 1,
          })
        }
        resetKey={doc}
        onExport={async (s) => exportCurrent(s.format as ExportFormat, s.scale)}
        extra={
          <div className="flex min-w-0 flex-col gap-3">
            <Field label={S.fileName} hint={S.fileNameHint}>
              <TextInput
                value={prefs.fileName}
                maxLength={80}
                onChange={(e) => setPrefs({ fileName: e.target.value })}
              />
            </Field>
            {prefs.format !== 'svg' && width * prefs.scale * height * prefs.scale > CANVAS_LIMIT ? (
              <p
                className="m-0 rounded-md bg-warning-soft px-3 py-1.5 text-sm text-warning"
                data-testid="canvas-limit"
              >
                {S.canvasLimit(width * prefs.scale, height * prefs.scale)}
              </p>
            ) : null}
          </div>
        }
      />
      <Button
        icon={<Copy />}
        loading={copying}
        disabled={copying}
        onClick={() => {
          setCopying(true);
          void copyCurrent()
            .then((n) => toast({ title: n.title, tone: n.tone }))
            .finally(() => setCopying(false));
        }}
      >
        {S.copyImage}
      </Button>
    </div>
  );
}
