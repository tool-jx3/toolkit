/**
 * 圖片格的欄位：預覽（比例同格子，圓形格子顯示成圓形）、選擇圖片（格式與大小檢查 → 裁切視窗 → 存成格子大小的 PNG）、
 * 清空圖片、出處（前面固定一個 ⓒ）。
 */
import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { pickFiles } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import type { ToolStore } from '@/core/storage';
import { Button, Field, ImageFrameDialog, TextInput, useToast } from '@/ui';
import { CITE_MAX, citeId, type Draft, IMAGE_TYPES, type SlotDef, str } from './model';
import { ImageInputError, readImageFile } from './render';
import { assets } from './store';
import { S } from './strings';

/** 圖片庫裡的圖的網址（給 <img>） */
export function useAssetUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    assets
      .url(id)
      .then((u) => alive && setUrl(u ?? null))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function SlotField({
  slot,
  label,
  store,
  d,
}: {
  slot: SlotDef;
  label: string;
  store: ToolStore<Draft>;
  d: Draft;
}) {
  const toast = useToast();
  const id = d.images[slot.id];
  const url = useAssetUrl(id);
  const [img, setImg] = useState<ImageBitmap | HTMLCanvasElement | OffscreenCanvas | null>(null);
  const [busy, setBusy] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  const choose = async () => {
    const [file] = await pickFiles({ accept: IMAGE_TYPES.join(',') });
    if (!file) return;
    setBusy(true);
    try {
      const r = await readImageFile(file);
      setImg(r.image);
    } catch (e) {
      toast({
        title: e instanceof ImageInputError ? e.message : S.imageUnreadable,
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = async (canvas: HTMLCanvasElement | OffscreenCanvas) => {
    setBusy(true);
    try {
      const blob = await canvasToBlob(canvas, 'image/png');
      const r = await assets.add(blob);
      await assets.bitmap(r.id);
      if (!r.persisted) toast({ title: S.imageNotSaved, tone: 'warning' });
      store.getState().update((x) => {
        x.images[slot.id] = r.id;
      });
    } catch {
      toast({ title: S.imageUnreadable, tone: 'danger' });
    } finally {
      setBusy(false);
      setImg(null);
    }
  };

  const ratio = `${slot.width} / ${slot.height}`;
  const tall = slot.height > slot.width * 1.4;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2.5"
      data-slot={slot.id}
    >
      <p className="m-0 text-sm font-medium text-fg">{label}</p>
      <div className="flex min-w-0 items-start gap-3">
        <div
          ref={holder}
          className="checker relative shrink-0 overflow-hidden border border-border-strong"
          style={{
            width: tall ? 64 : slot.free ? 120 : 96,
            aspectRatio: ratio,
            borderRadius: slot.shape === 'circle' ? '50%' : slot.shape === 'round' ? 8 : 4,
          }}
        >
          {url ? (
            <img src={url} alt={S.slotPreview(label)} className="block size-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-center text-xs text-muted">
              {S.emptySlot}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              icon={<ImagePlus />}
              onClick={choose}
              loading={busy}
              aria-label={`${label}：${S.chooseImage}`}
            >
              {S.chooseImage}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 />}
              disabled={!id}
              onClick={() =>
                store.getState().update((x) => {
                  delete x.images[slot.id];
                })
              }
              aria-label={`${label}：${S.clearImage}`}
            >
              {S.clearImage}
            </Button>
          </div>
          <p className="m-0 text-xs text-muted">{S.imageHint}</p>
        </div>
      </div>
      <Field label={`${label}：${S.citeLabel}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="text-sm text-muted">
            ⓒ
          </span>
          <TextInput
            value={str(d.v, citeId(slot.id))}
            maxLength={CITE_MAX}
            placeholder={S.citePlaceholder}
            onChange={(e) =>
              store.getState().update((x) => {
                x.v[citeId(slot.id)] = e.target.value;
                x.touched[citeId(slot.id)] = true;
              })
            }
          />
        </div>
      </Field>
      <ImageFrameDialog
        open={!!img}
        onOpenChange={(o) => {
          if (!o) setImg(null);
        }}
        image={img}
        aspect={slot.free ? null : slot.width / slot.height}
        output={slot.free ? undefined : { width: slot.width, height: slot.height }}
        shape={slot.shape === 'circle' ? 'circle' : 'rect'}
        title={slot.free ? S.freeCropTitle : S.cropTitle}
        onConfirm={(c) => void apply(c)}
      />
    </div>
  );
}
