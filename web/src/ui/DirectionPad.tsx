/**
 * 方向盤：圓形面板上拖曳一個點，值是單位圓內的 { x, y }（右、下為正，長度最多 1）。
 * 例：光源方向（壓克力周邊工房的打光盤）、陰影方向、視差的偏移方向。
 *
 * - 按下或拖曳把點移到游標的位置，拖到圓外時停在圓周上（方向不變）；放開時呼叫 `onCommit`（搭配 historyGesture 算一步復原）。
 * - 鍵盤（面板有焦點時）：方向鍵移動 `step`（預設 0.05，Shift ×4），Home 回到 `defaultValue`（有給時）。
 * - 螢幕閱讀器：role="slider"（二維滑桿），`valueText` 決定朗讀的文字（預設「左右 x、上下 y」）。
 *
 * ```tsx
 * <Field label="光源方向"><DirectionPad value={dir} onChange={setDir} onCommit={g.commit} defaultValue={{ x: 0.5, y: 0.5 }} /></Field>
 * ```
 */
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { cn } from './cn';
import { useFieldControl } from './Field';

export interface PadVector {
  x: number;
  y: number;
}

export interface DirectionPadProps {
  value: PadVector;
  onChange: (value: PadVector) => void;
  /** 一次操作結束（放開滑鼠、按完方向鍵） */
  onCommit?: (value: PadVector) => void;
  /** Home 鍵回到的值 */
  defaultValue?: PadVector;
  /** 直徑（px，預設 80） */
  size?: number;
  /** 方向鍵每次移動的量（預設 0.05） */
  step?: number;
  /** 點的直徑（px，預設 14）；點的中心最遠到圓周內側 size ÷ 2 − dot ÷ 2 − 0 px */
  dotSize?: number;
  valueText?: (value: PadVector) => string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}

/** 夾進單位圓（方向不變） */
export function clampToDisk(v: PadVector): PadVector {
  const len = Math.hypot(v.x, v.y);
  return len > 1 ? { x: v.x / len, y: v.y / len } : v;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const fmt = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

export function DirectionPad({
  value,
  onChange,
  onCommit,
  defaultValue,
  size = 80,
  step = 0.05,
  dotSize = 14,
  valueText = (v) => `左右 ${fmt(v.x)}、上下 ${fmt(v.y)}`,
  disabled,
  className,
  ...rest
}: DirectionPadProps) {
  const field = useFieldControl(rest);
  const pad = useRef<HTMLDivElement>(null);
  /* 點的中心能到的半徑（px）：留出半個點的寬度與 1 px 邊框 */
  const reach = size / 2 - dotSize / 2 - 1;
  const last = useRef(value);
  last.current = value;

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = pad.current!.getBoundingClientRect();
    const v = clampToDisk({
      x: (e.clientX - r.left - r.width / 2) / reach,
      y: (e.clientY - r.top - r.height / 2) / reach,
    });
    const next = { x: round(v.x), y: round(v.y) };
    last.current = next;
    onChange(next);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.shiftKey ? step * 4 : step;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, -d],
      ArrowDown: [0, d],
    };
    let next: PadVector | null = null;
    const m = moves[e.key];
    if (m) next = clampToDisk({ x: value.x + m[0], y: value.y + m[1] });
    else if (e.key === 'Home' && defaultValue) next = defaultValue;
    if (!next) return;
    e.preventDefault();
    next = { x: round(next.x), y: round(next.y) };
    onChange(next);
    onCommit?.(next);
  };

  return (
    <div
      ref={pad}
      id={field.id}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={rest['aria-label']}
      aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
      aria-describedby={field['aria-describedby']}
      aria-roledescription="二維滑桿"
      aria-disabled={disabled || undefined}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={round(value.x)}
      aria-valuetext={valueText(value)}
      data-x={value.x}
      data-y={value.y}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit?.(last.current);
      }}
      onPointerCancel={() => onCommit?.(last.current)}
      onKeyDown={disabled ? undefined : onKey}
      className={cn(
        'focus-ring relative shrink-0 cursor-crosshair touch-none rounded-full border border-border-strong bg-surface-2 shadow-[inset_0_2px_6px_rgb(0_0_0/0.15)]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-px w-3/4 -translate-x-1/2 bg-border"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-3/4 w-px -translate-y-1/2 bg-border"
      />
      <span
        aria-hidden
        data-testid="direction-pad-dot"
        className="pointer-events-none absolute rounded-full bg-accent shadow-1"
        style={{
          width: dotSize,
          height: dotSize,
          left: size / 2 - 1 + value.x * reach - dotSize / 2,
          top: size / 2 - 1 + value.y * reach - dotSize / 2,
        }}
      />
    </div>
  );
}
