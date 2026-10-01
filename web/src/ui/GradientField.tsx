/**
 * 漸層欄：預覽條上的色標可以拖曳（或用方向鍵移動、Delete 刪除），點空白處新增色標；
 * 下方編輯選取色標的顏色與位置；可切換線性／放射與角度。
 */
import { Plus, Trash2 } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { type Gradient, gradientToCss, sampleGradient, sortStops } from '@/core/gradient';
import { Button, IconButton } from './Button';
import { ColorField } from './ColorField';
import { cn } from './cn';
import { NumberInput } from './NumberInput';
import { Segmented } from './Segmented';
import { Slider } from './Slider';

export interface GradientFieldProps {
  value: Gradient;
  onChange: (g: Gradient) => void;
  /** 色標可調透明度（預設 true） */
  alpha?: boolean;
  /** 允許放射漸層（預設 true） */
  allowRadial?: boolean;
  /** 最多幾個色標（預設 8） */
  maxStops?: number;
  'aria-label'?: string;
  className?: string;
}

export function GradientField({
  value,
  onChange,
  alpha = true,
  allowRadial = true,
  maxStops = 8,
  className,
  ...rest
}: GradientFieldProps) {
  const [sel, setSel] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const stops = value.stops;
  const selected = Math.min(sel, stops.length - 1);
  const name = rest['aria-label'] ?? '漸層';

  const setStops = (next: Gradient['stops']) => onChange({ ...value, stops: next });
  const updateStop = (i: number, patch: Partial<Gradient['stops'][number]>) =>
    setStops(
      stops.map((s, k) =>
        k === i
          ? { ...s, ...patch, offset: Math.min(1, Math.max(0, patch.offset ?? s.offset)) }
          : s,
      ),
    );
  const addStop = (offset: number) => {
    if (stops.length >= maxStops) return;
    const color = sampleGradient(value, offset);
    setStops([...stops, { offset, color }]);
    setSel(stops.length);
  };
  const removeStop = (i: number) => {
    if (stops.length <= 2) return;
    setStops(stops.filter((_, k) => k !== i));
    setSel(Math.max(0, i - 1));
  };
  const offsetAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const onStopKey = (i: number, e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.shiftKey ? 0.1 : 0.01;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
      updateStop(i, { offset: stops[i].offset - d });
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
      updateStop(i, { offset: stops[i].offset + d });
    else if (e.key === 'Home') updateStop(i, { offset: 0 });
    else if (e.key === 'End') updateStop(i, { offset: 1 });
    else if (e.key === 'Delete' || e.key === 'Backspace') removeStop(i);
    else return;
    e.preventDefault();
  };
  const onStopPointer = (i: number, e: PointerEvent<HTMLButtonElement>) => {
    if (e.type === 'pointerdown') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setSel(i);
    } else if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      updateStop(i, { offset: Number(offsetAt(e.clientX).toFixed(3)) });
    }
  };

  const order = sortStops(stops.map((s, i) => ({ ...s, i })));

  return (
    <fieldset
      aria-label={name}
      className={cn('m-0 flex w-full min-w-0 flex-col gap-3 border-0 p-0', className)}
    >
      <div className="checker relative h-12 w-full rounded-md border border-border-strong">
        {/* 預覽條一律橫向顯示色標的排列 */}
        <div
          className="absolute inset-0 rounded-md"
          style={{ backgroundImage: gradientToCss(value, 90) }}
        />
        {/* 點空白處新增色標（滑鼠用；鍵盤用下面的「新增色標」按鈕） */}
        <div
          ref={bar}
          className="absolute inset-x-2 inset-y-0 cursor-copy"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) addStop(Number(offsetAt(e.clientX).toFixed(3)));
          }}
        >
          {order.map((s) => (
            <button
              key={s.i}
              type="button"
              role="slider"
              aria-label={`${name}色標 ${s.i + 1}（${s.color}）`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.offset * 100)}
              aria-valuetext={`${Math.round(s.offset * 100)}%`}
              aria-current={s.i === selected ? 'true' : undefined}
              onPointerDown={(e) => onStopPointer(s.i, e)}
              onPointerMove={(e) => onStopPointer(s.i, e)}
              onFocus={() => setSel(s.i)}
              onKeyDown={(e) => onStopKey(s.i, e)}
              className={cn(
                'absolute top-1/2 h-9 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-sm border-2 shadow-1',
                s.i === selected ? 'border-accent ring-2 ring-accent/40' : 'border-white',
              )}
              style={{ left: `${s.offset * 100}%`, background: s.color }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ColorField
          value={stops[selected].color}
          onChange={(color) => updateStop(selected, { color })}
          alpha={alpha}
          aria-label={`色標 ${selected + 1}`}
          className="min-w-48 flex-1"
        />
        <NumberInput
          value={Math.round(stops[selected].offset * 100)}
          onChange={(v) => updateStop(selected, { offset: v / 100 })}
          min={0}
          max={100}
          unit="%"
          aria-label={`色標 ${selected + 1} 位置`}
          className="w-20"
        />
        <IconButton
          label="刪除這個色標"
          icon={<Trash2 />}
          variant="secondary"
          disabled={stops.length <= 2}
          onClick={() => removeStop(selected)}
        />
        <Button
          icon={<Plus />}
          size="md"
          disabled={stops.length >= maxStops}
          onClick={() => addStop(0.5)}
        >
          新增色標
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {allowRadial ? (
          <Segmented
            aria-label="漸層種類"
            value={value.kind}
            onValueChange={(kind) => onChange({ ...value, kind })}
            options={[
              { value: 'linear', label: '線性' },
              { value: 'radial', label: '放射' },
            ]}
            size="sm"
          />
        ) : null}
        {value.kind === 'linear' ? (
          <Slider
            aria-label="角度"
            value={value.angle}
            onChange={(angle) => onChange({ ...value, angle })}
            min={0}
            max={360}
            unit="°"
            className="min-w-48 flex-1"
          />
        ) : null}
      </div>
    </fieldset>
  );
}
