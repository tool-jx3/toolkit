/**
 * ② 立繪圖片（規格 F12～F24）：目前的圖片、上傳／網址兩種輸入、最大寬度、網址的處理方式、
 * 處理中與訊息；裁切資訊、修掉透明留白（面板內兩段式確認）、指定範圍裁切（CropDialog）。
 */
import { Crop, Eraser, Link2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { classifyImageUrl } from '@/ccfolia';
import {
  cropToDataUri,
  dataUriBytes,
  formatEmbedBytes,
  getImageData,
  loadImage,
  type Rect,
  transparentTrimRect,
} from '@/core/image';
import {
  Button,
  CropConfirmSummary,
  CropDialog,
  Field,
  ImageDrop,
  Notice,
  type NoticeTone,
  NumberInput,
  Section,
  Segmented,
  TextInput,
} from '@/ui';
import { updatePreset } from './actions';
import { Thumb } from './controls';
import { imageFromFile, imageFromUrl, UrlInputError } from './images';
import type { UrlMode } from './logic';
import type { Preset } from './model';
import { addImage, useImageSize, useImageSrc, useImages } from './store';
import { S } from './strings';

type Msg = { tone: NoticeTone; text: string } | null;

/** 圖片輸入方式、最大寬度、網址處理方式：不存檔（規格 F13、F15、4.） */
export interface ImageInputState {
  mode: 'upload' | 'url';
  maxWidth: number;
  urlMode: UrlMode;
  url: string;
}

export const INITIAL_INPUT: ImageInputState = {
  mode: 'url',
  maxWidth: 0,
  urlMode: 'auto',
  url: '',
};

export function ImageSection({
  preset,
  input,
  onInputChange,
}: {
  preset: Preset;
  input: ImageInputState;
  onInputChange: (patch: Partial<ImageInputState>) => void;
}) {
  const src = useImageSrc(preset.image);
  const ready = useImages((s) => s.ready);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [saveWarn, setSaveWarn] = useState(false);
  const busyRef = useRef(false);

  const adopt = async (s: string, size?: { width: number; height: number }) => {
    const { key, saved } = await addImage(s, size);
    updatePreset(preset.id, (p) => {
      p.image = key;
    });
    setSaveWarn(!saved);
  };

  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg({ tone: 'progress', text: S.image.processing });
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onFile = (file: File) =>
    run(async () => {
      try {
        const r = await imageFromFile(file, input.maxWidth);
        await adopt(r.src, r.size);
        setMsg({ tone: r.tone, text: r.message });
      } catch (e) {
        setMsg({ tone: 'danger', text: e instanceof Error ? e.message : S.image.readFailed });
      }
    });

  const onUrl = () =>
    run(async () => {
      try {
        const r = await imageFromUrl(input.url, input.urlMode, input.maxWidth);
        await adopt(r.src, r.size);
        setMsg({ tone: r.tone, text: r.message });
      } catch (e) {
        setMsg({
          tone: 'danger',
          text: e instanceof UrlInputError || e instanceof Error ? e.message : String(e),
        });
      }
    });

  const urlText = input.url.trim();
  const urlInvalid = !!urlText && !classifyImageUrl(urlText).valid;

  return (
    <Section title={S.image.title} persistKey="obs-tachie:image">
      <Field label={S.image.current}>
        <div className="flex items-center gap-3">
          <Thumb
            src={src}
            alt={S.image.current}
            empty={preset.image && !src ? '…' : S.image.notSet}
            size={72}
            className="text-xs"
          />
          {!preset.image ? <span className="text-sm text-muted">{S.image.notSet}</span> : null}
        </div>
      </Field>
      <Field label={S.image.modeLabel}>
        <Segmented
          value={input.mode}
          onValueChange={(mode) => onInputChange({ mode })}
          options={[
            { value: 'upload', label: S.image.modeUpload },
            { value: 'url', label: S.image.modeUrl },
          ]}
        />
      </Field>
      <Field label={S.image.maxWidthLabel} hint={S.image.maxWidthHint}>
        <NumberInput
          value={input.maxWidth}
          onChange={(maxWidth) => onInputChange({ maxWidth })}
          min={0}
          max={8192}
          unit="px"
          className="w-36"
        />
      </Field>
      {input.mode === 'upload' ? (
        <ImageDrop
          compact
          label={S.image.dropLabel}
          hint={S.image.dropHint}
          accept="image/*"
          disabled={busy}
          onFiles={(files) => {
            if (files[0]) void onFile(files[0]);
          }}
        />
      ) : (
        <>
          <Field label={S.image.urlLabel} error={urlInvalid ? S.image.urlInvalid : null}>
            <div className="flex min-w-0 gap-2">
              <TextInput
                value={input.url}
                placeholder={S.image.urlPlaceholder}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onInputChange({ url: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) void onUrl();
                }}
                className="flex-1"
              />
              <Button icon={<Link2 />} onClick={() => void onUrl()} disabled={busy}>
                {S.image.apply}
              </Button>
            </div>
          </Field>
          <Field label={S.image.urlModeLabel} hint={S.image.urlModeHint[input.urlMode]}>
            <Segmented
              value={input.urlMode}
              onValueChange={(urlMode) => onInputChange({ urlMode })}
              options={[
                { value: 'auto', label: S.image.urlModes.auto },
                { value: 'direct', label: S.image.urlModes.direct },
                { value: 'embed', label: S.image.urlModes.embed },
              ]}
              fullWidth
            />
          </Field>
        </>
      )}
      {msg ? (
        <Notice tone={msg.tone} className="text-xs">
          <span data-testid="image-message">{msg.text}</span>
        </Notice>
      ) : null}
      {preset.image && ready && !src ? (
        <Notice tone="warning" className="text-xs">
          {S.image.missing}
        </Notice>
      ) : null}
      {saveWarn ? (
        <Notice tone="warning" className="text-xs">
          {S.image.saveFailed}
        </Notice>
      ) : null}
      {preset.image && src ? (
        <CropArea
          preset={preset}
          src={src}
          onReplaced={(saved) => {
            setSaveWarn(!saved);
            setMsg(null);
          }}
        />
      ) : null}
    </Section>
  );
}

/* ---------- 裁切 ---------- */

function CropArea({
  preset,
  src,
  onReplaced,
}: {
  preset: Preset;
  src: string | null;
  /** 裁切後換了圖（saved：有沒有存進瀏覽器） */
  onReplaced: (saved: boolean) => void;
}) {
  const size = useImageSize(preset.image);
  const embedded = !!src && /^data:/i.test(src);
  const bytes = embedded && src ? dataUriBytes(src) : null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, setPending] = useState<{ rect: Rect; bytes: number | null } | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  /** 剛套用裁切得到的圖片鍵（換圖後顯示「已套用」） */
  const justApplied = useRef<string | null>(null);

  /* 換圖時：範圍、待確認的結果、訊息都清掉（F24）；套用裁切造成的換圖再顯示「已套用」 */
  useEffect(() => {
    setPending(null);
    setRangeOpen(false);
    setBitmap(null);
    setMsg(
      justApplied.current && justApplied.current === preset.image
        ? { tone: 'success', text: S.crop.applied }
        : null,
    );
    justApplied.current = null;
  }, [preset.image]);

  const getBitmap = async (): Promise<ImageBitmap> => {
    if (bitmap) return bitmap;
    if (!src) throw new Error(S.image.missing);
    const b = await loadImage(src);
    setBitmap(b);
    return b;
  };

  const apply = async (rect: Rect) => {
    setBusy(true);
    setMsg({ tone: 'progress', text: S.image.processing });
    try {
      const img = await getBitmap();
      const out = await cropToDataUri(img, rect);
      const { key, saved } = await addImage(out.dataUri, { width: out.width, height: out.height });
      justApplied.current = key;
      updatePreset(preset.id, (p) => {
        p.image = key;
      });
      onReplaced(saved);
    } catch (e) {
      setMsg({ tone: 'danger', text: S.crop.failed(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  };

  const trim = async () => {
    setBusy(true);
    setMsg({ tone: 'progress', text: S.image.processing });
    setPending(null);
    try {
      const img = await getBitmap();
      const r = transparentTrimRect(getImageData(img));
      if (!r) {
        setMsg({ tone: 'info', text: S.crop.noMargin });
        return;
      }
      setMsg(null);
      setPending({ rect: r, bytes: null });
      const out = await cropToDataUri(img, r);
      setPending((cur) => (cur && cur.rect === r ? { rect: r, bytes: out.bytes } : cur));
    } catch (e) {
      setMsg({ tone: 'danger', text: S.crop.failed(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  };

  const sizeText =
    !size || size.status === 'loading'
      ? S.crop.sizeLoading
      : size.status === 'ok'
        ? `${size.size.width}×${size.size.height}px`
        : S.crop.sizeUnknown;
  const natural = size?.status === 'ok' ? size.size : null;

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3"
      data-testid="crop-area"
    >
      <h3 className="m-0 text-sm font-semibold text-fg">{S.crop.title}</h3>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-muted">{S.crop.size}</dt>
        <dd className="m-0 tabular-nums" data-testid="image-size">
          {sizeText}
        </dd>
        <dt className="text-muted">{S.crop.bytes}</dt>
        <dd className="m-0 tabular-nums" data-testid="image-bytes">
          {bytes !== null ? formatEmbedBytes(bytes) : S.crop.notEmbedded}
        </dd>
      </dl>
      <p className="m-0 text-xs text-muted">{S.crop.offsetNote}</p>
      {embedded ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Eraser />}
            onClick={() => void trim()}
            disabled={busy || !!pending}
          >
            {S.crop.trim}
          </Button>
          <Button
            size="sm"
            icon={<Crop />}
            aria-pressed={rangeOpen}
            onClick={async () => {
              setPending(null);
              try {
                await getBitmap();
                setRangeOpen(true);
              } catch (e) {
                setMsg({
                  tone: 'danger',
                  text: S.crop.failed(e instanceof Error ? e.message : String(e)),
                });
              }
            }}
            disabled={busy || !!pending}
          >
            {S.crop.range}
          </Button>
        </div>
      ) : (
        <Notice tone="info" className="text-xs">
          {S.crop.cannot}
        </Notice>
      )}
      {pending && natural ? (
        <div className="flex flex-col gap-2" data-testid="trim-confirm">
          <CropConfirmSummary
            before={natural}
            after={{ width: pending.rect.width, height: pending.rect.height }}
            beforeBytes={bytes ?? undefined}
            afterBytes={pending.bytes}
            warning={S.crop.warning}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => {
                const r = pending.rect;
                setPending(null);
                void apply(r);
              }}
            >
              {S.crop.apply}
            </Button>
            <Button size="sm" onClick={() => setPending(null)} disabled={busy}>
              {S.crop.cancel}
            </Button>
          </div>
        </div>
      ) : null}
      {msg ? (
        <Notice tone={msg.tone} className="text-xs">
          <span data-testid="crop-message">{msg.text}</span>
        </Notice>
      ) : null}
      <CropDialog
        open={rangeOpen && !!bitmap}
        onOpenChange={setRangeOpen}
        image={bitmap}
        title={S.crop.rangeTitle}
        aspect={null}
        freeDraw
        rawInputs
        initialRect={
          bitmap ? { x: 0, y: 0, width: bitmap.width, height: bitmap.height } : undefined
        }
        confirm={{
          beforeBytes: bytes ?? undefined,
          estimateBytes: async (r) => (await cropToDataUri(await getBitmap(), r)).bytes,
          warning: S.crop.warning,
          applyLabel: S.crop.apply,
        }}
        onConfirm={(r) => void apply(r)}
      />
    </div>
  );
}
