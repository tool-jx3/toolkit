/**
 * 裁切對話框：拖曳裁切框或八個控制點；也可以直接輸入 X／Y／寬／高（鍵盤操作用這裡）。
 * 裁切框本身有焦點時：方向鍵移動 1 px（Shift 10 px），Alt＋方向鍵調整大小。
 * 比例可固定（aspect）或讓使用者在選項間切換（aspectOptions）。
 */
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type CropHandle,
  centeredCrop,
  clampCrop,
  type DrawableImage,
  formatEmbedBytes,
  imageSize,
  isWholeImage,
  normalizeCropRect,
  type Rect,
  resizeCrop,
  type Size,
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
  /** 在圖上按住拖曳畫出新的範圍（任何方向；放開時對齊整數並夾在圖內） */
  freeDraw?: boolean;
  /**
   * 數字欄輸入時不即時修正（方便重打），下方即時顯示「裁切後 寬×高」或「範圍在圖片外」；
   * 範圍無效或等於整張圖時不能確定。修正規則見 core/image 的 normalizeCropRect。
   */
  rawInputs?: boolean;
  /** 兩段式確認：按「確定」後先顯示前後尺寸與大小，按「套用」才呼叫 onConfirm */
  confirm?: CropConfirmConfig;
}

export interface CropConfirmConfig {
  /** 原本的嵌入大小（位元組） */
  beforeBytes?: number;
  /** 估算裁切後的大小（位元組），例如實際裁一次並存成 PNG */
  estimateBytes?: (rect: Rect) => Promise<number>;
  /** 確認畫面的警告（預設「套用後無法復原」） */
  warning?: ReactNode;
  /** 套用按鈕的文字（預設「套用」） */
  applyLabel?: string;
}

export interface CropConfirmSummaryProps {
  before: Size;
  after: Size;
  beforeBytes?: number;
  /** 裁切後的大小；null 表示計算中、undefined 表示不顯示 */
  afterBytes?: number | null;
  warning?: ReactNode;
  className?: string;
}

/** 裁切／修邊的確認內容：原尺寸 → 裁切後尺寸、嵌入大小 原本 → 之後、無法復原的警告 */
export function CropConfirmSummary({
  before,
  after,
  beforeBytes,
  afterBytes,
  warning = '套用後無法復原；要重來請重新匯入圖片。',
  className,
}: CropConfirmSummaryProps) {
  const grew =
    beforeBytes !== undefined && typeof afterBytes === 'number' && afterBytes > beforeBytes;
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm',
        className,
      )}
      data-testid="crop-summary"
    >
      <p className="m-0">
        原尺寸 {before.width}×{before.height}px → 裁切後 {after.width}×{after.height}px
      </p>
      {beforeBytes !== undefined || afterBytes !== undefined ? (
        <p className="m-0">
          嵌入大小 {beforeBytes !== undefined ? formatEmbedBytes(beforeBytes) : '—'} →{' '}
          {afterBytes === null
            ? '計算中…'
            : afterBytes !== undefined
              ? formatEmbedBytes(afterBytes)
              : '—'}
          {grew ? <span className="text-muted">（變大是因為裁切後固定存成 PNG）</span> : null}
        </p>
      ) : null}
      {warning ? <p className="m-0 text-warning">{warning}</p> : null}
    </div>
  );
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
  freeDraw,
  rawInputs,
  confirm,
}: CropDialogProps) {
  const size = useMemo(() => (image ? imageSize(image) : { width: 1, height: 1 }), [image]);
  const fixed = aspect !== undefined;
  const [ratioKey, setRatioKey] = useState('0');
  const ratio = fixed ? (aspect ?? null) : (aspectOptions[Number(ratioKey)]?.value ?? null);
  const [rect, setRectState] = useState<Rect>(() => initialRect ?? centeredCrop(size, ratio));
  /* rawInputs：數字欄的原始輸入（可能在圖外、負數） */
  const [raw, setRaw] = useState<Rect>(rect);
  const [stage, setStage] = useState<'edit' | 'confirm'>('edit');
  const [afterBytes, setAfterBytes] = useState<number | null>(null);
  const setRect = (r: Rect | ((cur: Rect) => Rect)) =>
    setRectState((cur) => {
      const next = typeof r === 'function' ? r(cur) : r;
      setRaw(next);
      return next;
    });
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: 'move' | 'draw' | CropHandle;
    x: number;
    y: number;
    start: Rect;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在開啟或換圖時重設，拖曳中改比例不要重設
  useEffect(() => {
    if (!open) return;
    setStage('edit');
    setRect(
      initialRect
        ? rawInputs
          ? (normalizeCropRect(initialRect, size) ?? { x: 0, y: 0, ...size })
          : clampCrop(initialRect, size, ratio, minSize)
        : centeredCrop(size, ratio),
    );
  }, [open, image]);

  const rawRect = rawInputs ? normalizeCropRect(raw, size) : rect;
  const whole = rawRect ? isWholeImage(rawRect, size) : false;
  const canConfirm = !!rawRect && !(rawInputs && whole);

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
  /** 螢幕座標 → 影像座標 */
  const toImage = (clientX: number, clientY: number) => {
    const el = canvas.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: ((clientX - r.left) * size.width) / (r.width || 1),
      y: ((clientY - r.top) * size.height) / (r.height || 1),
    };
  };
  const onDrawStart = (e: PointerEvent<HTMLElement>) => {
    if (!freeDraw || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toImage(e.clientX, e.clientY);
    drag.current = { mode: 'draw', x: p.x, y: p.y, start: rect };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'draw') {
      const p = toImage(e.clientX, e.clientY);
      const w = p.x - d.x;
      const h = ratio ? Math.sign(p.y - d.y || 1) * (Math.abs(w) / ratio) : p.y - d.y;
      const n = normalizeCropRect({ x: d.x, y: d.y, width: w, height: h }, size);
      if (n) setRect(n);
      return;
    }
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
    if (rawInputs) {
      const next = { ...raw, [k]: v };
      setRaw(next);
      const n = normalizeCropRect(next, size);
      if (n) setRectState(n);
      return;
    }
    const next = { ...rect, [k]: v };
    if (ratio && k === 'width') next.height = v / ratio;
    if (ratio && k === 'height') next.width = v * ratio;
    setRect(clampCrop(next, size, ratio, minSize));
  };
  const numValue = (k: keyof Rect) => (rawInputs ? raw[k] : rect[k]);
  const numRange = (min: number, max: number) => (rawInputs ? {} : { min, max });

  const goConfirm = async () => {
    const target = rawRect;
    if (!target) return;
    if (!confirm) {
      onConfirm(target);
      onOpenChange(false);
      return;
    }
    setStage('confirm');
    setAfterBytes(null);
    if (confirm.estimateBytes) {
      try {
        setAfterBytes(await confirm.estimateBytes(target));
      } catch {
        setAfterBytes(Number.NaN);
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="拖曳框線調整範圍；也可以直接輸入數值。"
      size="lg"
      footer={
        stage === 'confirm' && rawRect ? (
          <>
            <Button onClick={() => setStage('edit')} className="mr-auto">
              返回
            </Button>
            <DialogClose>取消</DialogClose>
            <Button
              variant="primary"
              onClick={() => {
                onConfirm(rawRect);
                onOpenChange(false);
              }}
            >
              {confirm?.applyLabel ?? '套用'}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={() => setRect(centeredCrop(size, ratio))}
              className="mr-auto"
            >
              重設範圍
            </Button>
            <DialogClose>取消</DialogClose>
            <Button variant="primary" onClick={goConfirm} disabled={!canConfirm}>
              確定
            </Button>
          </>
        )
      }
    >
      {stage === 'confirm' && rawRect ? (
        <CropConfirmSummary
          before={size}
          after={{ width: rawRect.width, height: rawRect.height }}
          beforeBytes={confirm?.beforeBytes}
          afterBytes={!confirm?.estimateBytes || Number.isNaN(afterBytes) ? undefined : afterBytes}
          warning={confirm?.warning}
        />
      ) : (
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
              className={cn(
                'relative inline-block max-h-full max-w-full touch-none select-none',
                freeDraw && 'cursor-crosshair',
              )}
              onPointerDown={onDrawStart}
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
                value={numValue('x')}
                onChange={(v) => setNum('x', v)}
                {...numRange(0, size.width)}
                unit="px"
                size="sm"
              />
            </Field>
            <Field label="Y">
              <NumberInput
                value={numValue('y')}
                onChange={(v) => setNum('y', v)}
                {...numRange(0, size.height)}
                unit="px"
                size="sm"
              />
            </Field>
            <Field label="寬">
              <NumberInput
                value={numValue('width')}
                onChange={(v) => setNum('width', v)}
                {...numRange(minSize, size.width)}
                unit="px"
                size="sm"
              />
            </Field>
            <Field label="高">
              <NumberInput
                value={numValue('height')}
                onChange={(v) => setNum('height', v)}
                {...numRange(minSize, size.height)}
                unit="px"
                size="sm"
              />
            </Field>
          </FieldRow>
          {rawInputs ? (
            <p className={cn('m-0 text-xs', rawRect ? 'text-muted' : 'text-danger')} role="status">
              {rawRect
                ? whole
                  ? `範圍等於整張圖片（${rawRect.width}×${rawRect.height}px），不需要裁切。`
                  : `裁切後 ${rawRect.width}×${rawRect.height}px`
                : '範圍在圖片外'}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
