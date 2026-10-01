/**
 * 裁切對話框：拖曳裁切框或八個控制點；也可以直接輸入 X／Y／寬／高（鍵盤操作用這裡）。
 * 裁切框本身有焦點時：方向鍵移動 1 px（Shift 10 px），Alt＋方向鍵調整大小。
 * 比例可固定（aspect）或讓使用者在選項間切換（aspectOptions）。
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CropHandle,
  centeredCrop,
  clampCrop,
  type DrawableImage,
  imageSize,
  type Rect,
  resizeCrop,
} from '@/core/image';
import { Button } from './Button';
import { cn } from './cn';
import { Dialog, DialogClose } from './Dialog';
import { Field, FieldRow } from './Field';
import { NumberInput } from './NumberInput';
import { Segmented } from './Segmented';

export type CropRect = Rect;

export interface AspectOption {
  label: string;
  /** 寬／高；null 為自由比例 */
  value: number | null;
}

export const DEFAULT_ASPECTS: readonly AspectOption[] = [
  { label: '自由', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
];

export interface CropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: DrawableImage | null;
  onConfirm: (rect: CropRect) => void;
  /** 固定比例（寬／高）。有給時不顯示比例選項 */
  aspect?: number | null;
  /** 讓使用者選的比例（預設：自由、1:1、4:3、3:4、16:9） */
  aspectOptions?: readonly AspectOption[];
  initialRect?: CropRect;
  title?: string;
  minSize?: number;
}

const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS: Record<CropHandle, string> = {
  nw: 'left-0 top-0 cursor-nwse-resize',
  n: 'left-1/2 top-0 cursor-ns-resize',
  ne: 'left-full top-0 cursor-nesw-resize',
  e: 'left-full top-1/2 cursor-ew-resize',
  se: 'left-full top-full cursor-nwse-resize',
  s: 'left-1/2 top-full cursor-ns-resize',
  sw: 'left-0 top-full cursor-nesw-resize',
  w: 'left-0 top-1/2 cursor-ew-resize',
};

export function CropDialog({
  open,
  onOpenChange,
  image,
  onConfirm,
  aspect,
  aspectOptions = DEFAULT_ASPECTS,
  initialRect,
  title = '裁切圖片',
  minSize = 8,
}: CropDialogProps) {
  const size = useMemo(() => (image ? imageSize(image) : { width: 1, height: 1 }), [image]);
  const fixed = aspect !== undefined;
  const [ratioKey, setRatioKey] = useState('0');
  const ratio = fixed ? (aspect ?? null) : (aspectOptions[Number(ratioKey)]?.value ?? null);
  const [rect, setRect] = useState<Rect>(() => initialRect ?? centeredCrop(size, ratio));
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | CropHandle; x: number; y: number; start: Rect } | null>(
    null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在開啟或換圖時重設，拖曳中改比例不要重設
  useEffect(() => {
    if (!open) return;
    setRect(initialRect ? clampCrop(initialRect, size, ratio, minSize) : centeredCrop(size, ratio));
  }, [open, image]);

  useEffect(() => {
    if (!open || !image) return;
    const id = requestAnimationFrame(() => {
      const c = canvas.current;
      if (!c) return;
      c.width = size.width;
      c.height = size.height;
      c.getContext('2d')?.drawImage(image, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [open, image, size]);

  const changeRatio = (key: string) => {
    setRatioKey(key);
    const r = aspectOptions[Number(key)]?.value ?? null;
    if (r)
      setRect((cur) =>
        clampCrop(
          { ...centeredCrop({ width: cur.width, height: cur.height }, r), x: cur.x, y: cur.y },
          size,
          r,
          minSize,
        ),
      );
  };

  /** 螢幕像素 → 影像像素 */
  const scale = () => {
    const el = canvas.current;
    return el ? size.width / el.getBoundingClientRect().width : 1;
  };

  const onPointerDown = (mode: 'move' | CropHandle) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: rect };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const k = scale();
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    if (d.mode === 'move')
      setRect(clampCrop({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, size, null, minSize));
    else setRect(resizeCrop(d.start, d.mode, dx, dy, size, ratio, minSize));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    if (e.altKey) setRect(resizeCrop(rect, d[0] ? 'e' : 's', d[0], d[1], size, ratio, minSize));
    else setRect(clampCrop({ ...rect, x: rect.x + d[0], y: rect.y + d[1] }, size, null, minSize));
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const setNum = (k: keyof Rect, v: number) => {
    const next = { ...rect, [k]: v };
    if (ratio && k === 'width') next.height = v / ratio;
    if (ratio && k === 'height') next.width = v * ratio;
    setRect(clampCrop(next, size, ratio, minSize));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="拖曳框線調整範圍；也可以直接輸入數值。"
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => setRect(centeredCrop(size, ratio))}
            className="mr-auto"
          >
            重設範圍
          </Button>
          <DialogClose>取消</DialogClose>
          <Button
            variant="primary"
            onClick={() => {
              onConfirm(rect);
              onOpenChange(false);
            }}
          >
            確定
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!fixed && aspectOptions.length > 1 ? (
          <Segmented
            aria-label="裁切比例"
            value={ratioKey}
            onValueChange={changeRatio}
            options={aspectOptions.map((o, i) => ({ value: String(i), label: o.label }))}
            size="sm"
          />
        ) : null}
        <div className="checker flex max-h-[55dvh] items-center justify-center overflow-hidden rounded-md p-2">
          <div
            className="relative inline-block max-h-full max-w-full touch-none select-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas
              ref={canvas}
              className="block max-h-[calc(55dvh-1rem)] max-w-full"
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
            />
            {/* biome-ignore lint/a11y/useSemanticElements: 可拖曳、可聚焦的裁切框，不是表單分組 */}
            <div
              ref={box}
              role="group"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: 裁切框要能用方向鍵移動與調整大小
              tabIndex={0}
              aria-roledescription="裁切框"
              aria-label={`裁切範圍：X ${rect.x}、Y ${rect.y}、寬 ${rect.width}、高 ${rect.height}。方向鍵移動，Alt＋方向鍵調整大小。`}
              onKeyDown={onKey}
              onPointerDown={onPointerDown('move')}
              className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] outline-offset-4"
              style={{
                left: pct(rect.x, size.width),
                top: pct(rect.y, size.height),
                width: pct(rect.width, size.width),
                height: pct(rect.height, size.height),
              }}
            >
              {HANDLES.map((h) => (
                <span
                  key={h}
                  aria-hidden
                  onPointerDown={onPointerDown(h)}
                  className={cn(
                    'absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-accent bg-white',
                    HANDLE_POS[h],
                  )}
                />
              ))}
            </div>
          </div>
        </div>
        <FieldRow columns={4}>
          <Field label="X">
            <NumberInput
              value={rect.x}
              onChange={(v) => setNum('x', v)}
              min={0}
              max={size.width}
              unit="px"
              size="sm"
            />
          </Field>
          <Field label="Y">
            <NumberInput
              value={rect.y}
              onChange={(v) => setNum('y', v)}
              min={0}
              max={size.height}
              unit="px"
              size="sm"
            />
          </Field>
          <Field label="寬">
            <NumberInput
              value={rect.width}
              onChange={(v) => setNum('width', v)}
              min={minSize}
              max={size.width}
              unit="px"
              size="sm"
            />
          </Field>
          <Field label="高">
            <NumberInput
              value={rect.height}
              onChange={(v) => setNum('height', v)}
              min={minSize}
              max={size.height}
              unit="px"
              size="sm"
            />
          </Field>
        </FieldRow>
      </div>
    </Dialog>
  );
}
