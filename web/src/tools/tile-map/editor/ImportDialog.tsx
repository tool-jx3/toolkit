/**
 * 匯入圖塊（對話框）：
 * - 圖塊表：一張圖依「每格大小（16、32、48、64 px 或自訂）、間距、外邊」切成格子；在預覽上拖曳框起好幾格＝一個大圖塊，
 *   點一下框起來的地方取消。完全透明的格子略過（半透明的保留）。
 * - 一張圖一個圖塊：每張圖（完全透明的略過）各是一個圖塊。
 * PNG、JPEG、WebP，每張小於 24 MB、每邊最多 8192 px，一次合計小於約 33.6 MB；圖片原樣存進這個瀏覽器（不縮小）。
 */
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { detectImageType, loadImage } from '@/core/image';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  ImageDrop,
  Notice,
  NumberInput,
  Segmented,
  Select,
  Toggle,
} from '@/ui';
import {
  cellAt,
  cellRect,
  type Group,
  hasVisiblePixels,
  MAX_IMAGE_SIDE,
  SheetError,
  type SheetSpec,
  sheetEntries,
  sheetGrid,
  toggleGroup,
} from '../model/sheet';
import type { Rect } from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { freshSetName, importTiles, newSet } from './libraryActions';
import { setEditor, useEditor, useLibrary, usePrefs } from './store';

/** 每張圖、一次合計的大小上限（位元組） */
export const MAX_FILE_BYTES = 24 * 1024 * 1024;
export const MAX_TOTAL_BYTES = Math.floor(48 * 1024 * 1024 * 0.7);
const NEW_SET = '__new';
const PRESETS = ['16', '32', '48', '64', 'custom'] as const;
type Preset = (typeof PRESETS)[number];

interface Loaded {
  file: File;
  name: string;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/** 這張圖的某一塊有沒有看得到的像素（不太大的圖整張讀一次，太大的圖一段一段讀） */
function visibility(bitmap: ImageBitmap): (r: Rect) => boolean {
  const { width, height } = bitmap;
  if (width * height <= 16_777_216) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return () => true;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;
    c.width = 1;
    c.height = 1;
    return (r) => hasVisiblePixels(data, width, r);
  }
  return (r) => {
    const [x, y, w, h] = r;
    const rows = Math.max(1, Math.floor(1_000_000 / w));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.min(rows, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true;
    for (let y0 = 0; y0 < h; y0 += rows) {
      const bh = Math.min(rows, h - y0);
      ctx.clearRect(0, 0, w, c.height);
      ctx.drawImage(bitmap, x, y + y0, w, bh, 0, 0, w, bh);
      if (hasVisiblePixels(ctx.getImageData(0, 0, w, bh).data, w, [0, 0, w, bh])) return true;
    }
    return false;
  };
}

const baseName = (n: string) => n.replace(/\.[^.]+$/, '').slice(0, 90) || 'tile';

export function ImportDialog() {
  const open = useEditor((s) => s.dialog === 'import');
  const preset = useEditor((s) => s.importFiles);
  const managed = useEditor((s) => s.managed);
  const sets = useLibrary((s) => s.lib.sets);
  const [images, setImages] = useState<Loaded[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'sheet' | 'images'>('sheet');
  const [size, setSize] = useState<Preset>('32');
  const [cw, setCw] = useState(32);
  const [ch, setCh] = useState(32);
  const [gap, setGap] = useState(0);
  const [margin, setMargin] = useState(0);
  const [pixel, setPixel] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [target, setTarget] = useState<string>(NEW_SET);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<{
    a: { x: number; y: number };
    b: { x: number; y: number };
  } | null>(null);

  /* 打開時：目標圖塊組、先帶的檔案（拖放到畫布上的） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 打開時才重設
  useEffect(() => {
    if (!open) return;
    setError(null);
    setGroups([]);
    setImages([]);
    const custom =
      sets.find((s) => s.id === managed) ?? sets.find((s) => s.id === usePrefs.getState().data.set);
    setTarget(custom?.id ?? sets[0]?.id ?? NEW_SET);
    if (preset.length) void load(preset);
  }, [open]);

  const load = async (files: readonly File[]) => {
    setError(null);
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      setError(S.imp.tooMany(MAX_TOTAL_BYTES));
      return;
    }
    const out: Loaded[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        setError(S.imp.tooHeavy(MAX_FILE_BYTES));
        return;
      }
      let bitmap: ImageBitmap;
      try {
        /* 只收 PNG、JPEG、WebP（看檔頭，不看副檔名）；解碼用共用的 loadImage */
        const kind = detectImageType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
        if (kind !== 'png' && kind !== 'apng' && kind !== 'jpeg' && kind !== 'webp')
          throw new Error('type');
        bitmap = await loadImage(file);
      } catch {
        setError(S.imp.unreadable(file.name));
        return;
      }
      if (bitmap.width > MAX_IMAGE_SIDE || bitmap.height > MAX_IMAGE_SIDE) {
        bitmap.close();
        setError(S.imp.tooBig);
        return;
      }
      out.push({
        file,
        name: baseName(file.name),
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
      });
    }
    setImages(out);
    setGroups([]);
    setMode(out.length > 1 ? 'images' : 'sheet');
  };

  const spec: SheetSpec = useMemo(() => ({ cw, ch, gap, margin }), [cw, ch, gap, margin]);
  const first = images[0];
  const tests = useMemo(() => images.map((i) => visibility(i.bitmap)), [images]);
  /* 換了圖（或關掉之後重開）：放掉舊的解碼結果 */
  useEffect(
    () => () => {
      for (const i of images) i.bitmap.close();
    },
    [images],
  );

  /* 切好的結果：圖塊表的格子（看得到的）或每張圖 */
  const result = useMemo(() => {
    if (!first) return { ok: false as const, message: null };
    if (mode === 'images') {
      const keep = images.map((img, i) => tests[i]([0, 0, img.width, img.height]));
      return { ok: true as const, mode, keep, count: keep.filter(Boolean).length };
    }
    if (images.length !== 1) return { ok: false as const, message: S.imp.oneSheet };
    try {
      const grid = sheetGrid(first.width, first.height, spec);
      const entries = sheetEntries(first.width, first.height, spec, groups).filter((e) =>
        tests[0](e.rect),
      );
      return { ok: true as const, mode, grid, entries, count: entries.length };
    } catch (e) {
      return { ok: false as const, message: e instanceof SheetError ? S.imp.bad : S.imp.bad };
    }
  }, [first, images, mode, tests, spec, groups]);

  /* 換了切法：框好的大圖塊作廢 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 切法一變就清掉
  useEffect(() => setGroups([]), [cw, ch, gap, margin, mode]);

  /* 預覽 */
  const scale = first ? Math.min(560 / first.width, 280 / first.height, 8) : 1;
  useEffect(() => {
    const c = preview.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !first) return;
    const shown =
      mode === 'images'
        ? (images.find((_, i) => result.ok && result.mode === 'images' && result.keep[i]) ?? first)
        : first;
    const k = Math.min(560 / shown.width, 280 / shown.height, 8);
    c.width = Math.max(1, Math.round(shown.width * k));
    c.height = Math.max(1, Math.round(shown.height * k));
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(shown.bitmap, 0, 0, c.width, c.height);
    if (!result.ok || result.mode !== 'sheet') return;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e3ad49';
    for (const e of result.entries) {
      const [x, y, w, h] = e.rect;
      ctx.strokeRect(x * k + 0.5, y * k + 0.5, w * k - 1, h * k - 1);
    }
    ctx.fillStyle = 'rgba(120, 200, 225, 0.3)';
    ctx.strokeStyle = '#9fe3f2';
    ctx.lineWidth = 2;
    for (const e of result.entries)
      if (e.span) {
        const [x, y, w, h] = e.rect;
        ctx.fillRect(x * k, y * k, w * k, h * k);
        ctx.strokeRect(x * k + 1, y * k + 1, w * k - 2, h * k - 2);
      }
    if (drag) {
      const x = Math.min(drag.a.x, drag.b.x);
      const y = Math.min(drag.a.y, drag.b.y);
      const [rx, ry, rw, rh] = cellRect(
        spec,
        x,
        y,
        Math.abs(drag.a.x - drag.b.x) + 1,
        Math.abs(drag.a.y - drag.b.y) + 1,
      );
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(rx * k + 1, ry * k + 1, rw * k - 2, rh * k - 2);
      ctx.setLineDash([]);
    }
  });

  const cellFromEvent = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!first || !result.ok || result.mode !== 'sheet') return null;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * first.width) / r.width;
    const py = ((e.clientY - r.top) * first.height) / r.height;
    return cellAt(px, py, spec, result.grid);
  };

  const submit = async () => {
    if (!result.ok || !result.count || busy) return;
    setBusy(true);
    try {
      const setId = target === NEW_SET ? newSet(freshSetName()) : target;
      if (!setId) return;
      const importName = images
        .map((i) => i.file.name)
        .join('、')
        .slice(0, 100);
      const payload =
        result.mode === 'sheet'
          ? [
              {
                blob: first.file as Blob,
                tiles: result.entries.map((e, i) => ({
                  name: `${first.name} ${i + 1}`,
                  rect: e.rect,
                  ...(e.span ? { span: e.span } : {}),
                  ...(e.gap ? { gap: e.gap } : {}),
                  pixel,
                })),
              },
            ]
          : images.map((img, i) => ({
              blob: img.file as Blob,
              tiles: result.keep[i]
                ? [{ name: img.name, rect: [0, 0, img.width, img.height] as Rect, pixel }]
                : [],
            }));
      const made = await importTiles(setId, importName, payload);
      if (!made?.length) return;
      usePrefs.getState().patch({ set: setId, cat: 'all' });
      act.chooseTile(made[0].id);
      setEditor({ dialog: null, importFiles: [], managed: setId });
      act.notify(S.imp.done(made.length), 'success');
    } finally {
      setBusy(false);
    }
  };

  const status = !first
    ? S.imp.accept
    : !result.ok
      ? result.message
      : result.mode === 'sheet'
        ? S.imp.status(result.count, first.width, first.height)
        : `${S.imp.statusImages(result.count, images.length)}${images.length > 1 ? S.imp.firstShown : ''}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setEditor({ dialog: null, importFiles: [] })}
      title={S.imp.title}
      size="lg"
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button
            variant="primary"
            loading={busy}
            disabled={!result.ok || !result.count}
            onClick={() => void submit()}
            data-testid="import-submit"
          >
            {S.imp.submit}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="import-dialog">
        <Field label={S.sets.title}>
          <Select
            value={target}
            onValueChange={setTarget}
            options={[
              ...sets.map((s) => ({ value: s.id, label: S.imp.target(s.name) })),
              { value: NEW_SET, label: `${S.sets.newSet}（${freshSetName()}）` },
            ]}
            data-testid="import-target"
          />
        </Field>
        <ImageDrop
          multiple
          accept="image/png,image/jpeg,image/webp"
          label={S.imp.drop}
          hint={S.imp.accept}
          compact
          onFiles={(files) => void load(files)}
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {first ? (
          <>
            <Field label={S.imp.mode}>
              <Segmented
                value={mode}
                onValueChange={(v) => setMode(v as 'sheet' | 'images')}
                options={[
                  { value: 'sheet', label: S.imp.sheet },
                  { value: 'images', label: S.imp.images },
                ]}
              />
            </Field>
            {mode === 'sheet' ? (
              <>
                <Field label={S.imp.size}>
                  <Segmented
                    value={size}
                    onValueChange={(v) => {
                      const p = v as Preset;
                      setSize(p);
                      if (p !== 'custom') {
                        setCw(Number(p));
                        setCh(Number(p));
                      }
                    }}
                    options={PRESETS.map((p) => ({
                      value: p,
                      label: p === 'custom' ? S.imp.custom : `${p} px`,
                    }))}
                  />
                </Field>
                <FieldRow columns={4}>
                  <Field label={S.imp.tileW}>
                    <NumberInput
                      value={cw}
                      onChange={(v) => {
                        setCw(v);
                        setSize('custom');
                      }}
                      min={1}
                      max={MAX_IMAGE_SIDE}
                      step={1}
                      unit="px"
                    />
                  </Field>
                  <Field label={S.imp.tileH}>
                    <NumberInput
                      value={ch}
                      onChange={(v) => {
                        setCh(v);
                        setSize('custom');
                      }}
                      min={1}
                      max={MAX_IMAGE_SIDE}
                      step={1}
                      unit="px"
                    />
                  </Field>
                  <Field label={S.imp.gap}>
                    <NumberInput
                      value={gap}
                      onChange={setGap}
                      min={0}
                      max={1024}
                      step={1}
                      unit="px"
                    />
                  </Field>
                  <Field label={S.imp.margin}>
                    <NumberInput
                      value={margin}
                      onChange={setMargin}
                      min={0}
                      max={1024}
                      step={1}
                      unit="px"
                    />
                  </Field>
                </FieldRow>
              </>
            ) : null}
            <Toggle label={S.imp.pixel} checked={pixel} onCheckedChange={setPixel} />
            <div className="checker flex justify-center overflow-hidden rounded-md border border-border p-2">
              <canvas
                ref={preview}
                aria-label={S.imp.preview}
                role="img"
                className="block max-w-full touch-none"
                style={{
                  width: first ? Math.max(1, Math.round(first.width * scale)) : 1,
                  imageRendering: 'pixelated',
                }}
                onPointerDown={(e) => {
                  const c = cellFromEvent(e);
                  if (!c || e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setDrag({ a: c, b: c });
                }}
                onPointerMove={(e) => {
                  if (!drag) return;
                  const c = cellFromEvent(e);
                  if (c && (c.x !== drag.b.x || c.y !== drag.b.y)) setDrag({ a: drag.a, b: c });
                }}
                onPointerUp={(e) => {
                  if (!drag) return;
                  const c = cellFromEvent(e) ?? drag.b;
                  setGroups((g) => toggleGroup(g, drag.a, c));
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
                data-testid="import-preview"
              />
            </div>
            {mode === 'sheet' ? <p className="m-0 text-xs text-muted">{S.imp.groupHint}</p> : null}
          </>
        ) : null}
        <p className="m-0 text-sm" role="status" data-testid="import-status">
          {status}
        </p>
      </div>
    </Dialog>
  );
}
