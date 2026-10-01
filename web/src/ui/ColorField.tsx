/**
 * 色彩欄：色塊（點開調色盤）＋色碼輸入＋（可選）透明度。
 * 調色盤：飽和度／亮度平面、色相、透明度、吸管（瀏覽器支援時）、常用色。
 *
 * 值一律是小寫色碼：#rrggbb；開啟 alpha 且不是完全不透明時為 #rrggbbaa。
 */
import { Pipette } from 'lucide-react';
import { Popover, Slider as S } from 'radix-ui';
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { formatHex, type Hsv, hsvToRgb, parseColor, rgbToHsv } from '@/core/color';
import { IconButton } from './Button';
import { cn, fullWidthUnless } from './cn';
import { useFieldControl } from './Field';
import { NumberInput } from './NumberInput';
import { inputClass } from './TextInput';

export const DEFAULT_SWATCHES = [
  '#000000',
  '#ffffff',
  '#7b5ea7',
  '#b79ce0',
  '#c0392b',
  '#e67e22',
  '#f1c40f',
  '#27ae60',
  '#2980b9',
  '#1abc9c',
  '#8e6e53',
  '#95a5a6',
] as const;

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

export const canUseEyeDropper = (): boolean =>
  typeof window !== 'undefined' && 'EyeDropper' in window;

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  alpha?: boolean;
  swatches?: readonly string[];
  eyedropper?: boolean;
}

/** 調色盤本體（可單獨放在任何地方） */
export function ColorPicker({
  value,
  onChange,
  alpha = false,
  swatches = DEFAULT_SWATCHES,
  eyedropper = true,
}: ColorPickerProps) {
  const rgba = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  /* 色相在灰階時會遺失，所以自己記著 */
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(rgba));
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      const c = parseColor(value);
      if (c)
        setHsv((h) => {
          const n = rgbToHsv(c);
          return n.s === 0 || n.v === 0 ? { ...n, h: h.h } : n;
        });
      lastEmitted.current = value;
    }
  }, [value]);

  const emit = (next: Hsv, a = rgba.a) => {
    setHsv(next);
    const hex = formatHex({ ...hsvToRgb(next), a: alpha ? a : 1 }, alpha);
    lastEmitted.current = hex;
    onChange(hex);
  };

  const area = useRef<HTMLDivElement>(null);
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = area.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    emit({ ...hsv, s, v });
  };
  const onAreaKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.shiftKey ? 0.1 : 0.01;
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, d],
      ArrowDown: [0, -d],
    };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    emit({
      ...hsv,
      s: Math.min(1, Math.max(0, hsv.s + m[0])),
      v: Math.min(1, Math.max(0, hsv.v + m[1])),
    });
  };
  const hueColor = formatHex({ ...hsvToRgb({ h: hsv.h, s: 1, v: 1 }), a: 1 });
  const solid = formatHex({ ...rgba, a: 1 });

  return (
    <div className="flex w-60 flex-col gap-3">
      <div
        ref={area}
        role="slider"
        tabIndex={0}
        aria-label="飽和度與亮度"
        aria-roledescription="二維滑桿"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`飽和度 ${Math.round(hsv.s * 100)}%，亮度 ${Math.round(hsv.v * 100)}%`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
        onKeyDown={onAreaKey}
        className="relative h-36 w-full cursor-crosshair touch-none rounded-md"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: solid }}
        />
      </div>
      <S.Root
        value={[hsv.h]}
        min={0}
        max={360}
        step={1}
        onValueChange={([h]) => emit({ ...hsv, h })}
        className="relative flex h-4 touch-none items-center"
      >
        <S.Track
          className="relative h-3 grow rounded-full"
          style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
        >
          <S.Range className="absolute h-full" />
        </S.Track>
        <S.Thumb
          aria-label="色相"
          aria-valuetext={`${Math.round(hsv.h)} 度`}
          className="block size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
          style={{ background: hueColor }}
        />
      </S.Root>
      {alpha ? (
        <S.Root
          value={[Math.round(rgba.a * 100)]}
          min={0}
          max={100}
          step={1}
          onValueChange={([a]) => emit(hsv, a / 100)}
          className="relative flex h-4 touch-none items-center"
        >
          <S.Track className="checker relative h-3 grow overflow-hidden rounded-full">
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ background: `linear-gradient(to right, transparent, ${solid})` }}
            />
            <S.Range className="absolute h-full" />
          </S.Track>
          <S.Thumb
            aria-label="不透明度"
            aria-valuetext={`${Math.round(rgba.a * 100)}%`}
            className="block size-4 rounded-full border-2 border-white bg-surface shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
          />
        </S.Root>
      ) : null}
      <div className="flex items-center gap-2">
        {eyedropper && canUseEyeDropper() ? (
          <IconButton
            label="從畫面取色"
            icon={<Pipette />}
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const res = await new (
                  window as unknown as { EyeDropper: EyeDropperCtor }
                ).EyeDropper().open();
                const c = parseColor(res.sRGBHex);
                if (c) emit(rgbToHsv(c), rgba.a);
              } catch {
                /* 使用者按 Esc 取消 */
              }
            }}
          />
        ) : null}
        <span className="font-mono text-xs text-muted">{value}</span>
      </div>
      {swatches.length ? (
        <fieldset className="m-0 grid min-w-0 grid-cols-6 gap-1.5 border-0 p-0">
          <legend className="sr-only">常用色</legend>
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`套用 ${c}`}
              onClick={() => {
                const p = parseColor(c);
                if (p) emit(rgbToHsv(p), alpha ? p.a : 1);
              }}
              className="h-6 rounded-sm border border-border-strong"
              style={{ background: c }}
            />
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

export interface ColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
  /** 可調透明度 */
  alpha?: boolean;
  swatches?: readonly string[];
  eyedropper?: boolean;
  /** 顯示色碼輸入框（預設 true；空間很窄時可關掉，只留色塊） */
  showInput?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/** 色碼文字 → 值；看不懂回傳 null */
export function parseHexInput(text: string, alpha: boolean): string | null {
  const c = parseColor(
    text.trim().startsWith('#') || /^rgb/i.test(text.trim()) ? text : `#${text.trim()}`,
  );
  if (!c) return null;
  return formatHex(alpha ? c : { ...c, a: 1 }, alpha);
}

export function ColorField({
  value,
  onChange,
  alpha = false,
  swatches,
  eyedropper,
  showInput = true,
  disabled,
  className,
  ...rest
}: ColorFieldProps) {
  const field = useFieldControl(rest);
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rgba = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  const solidHex = formatHex({ ...rgba, a: 1 }, false);
  const invalid = draft !== null && parseHexInput(draft, alpha) === null;
  const name = rest['aria-label'];

  const commit = () => {
    if (draft === null) return;
    const v = parseHexInput(draft, alpha);
    if (v) onChange(v);
    setDraft(null);
  };

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-2',
        fullWidthUnless(className),
        className,
      )}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          disabled={disabled}
          aria-label={`${name ? `${name}：` : ''}選擇顏色（目前 ${value}）`}
          aria-describedby={field['aria-describedby']}
          className="checker relative size-8 shrink-0 overflow-hidden rounded-md border border-border-strong disabled:opacity-50"
        >
          <span aria-hidden className="absolute inset-0" style={{ background: value }} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            className="z-50 rounded-lg border border-border bg-surface p-3 shadow-2"
          >
            <ColorPicker
              value={value}
              onChange={onChange}
              alpha={alpha}
              swatches={swatches}
              eyedropper={eyedropper}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {showInput ? (
        <input
          type="text"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          id={field.id}
          aria-label={name ? `${name}色碼` : undefined}
          aria-labelledby={name ? undefined : field['aria-labelledby']}
          aria-describedby={field['aria-describedby']}
          aria-invalid={invalid || undefined}
          value={draft ?? (alpha ? value : solidHex)}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = parseHexInput(e.target.value, alpha);
            if (v && /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value.trim())) onChange(v);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape' && draft !== null) {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
            }
          }}
          className={inputClass(invalid, 'h-8 min-w-[6.5rem] flex-1 font-mono uppercase')}
        />
      ) : null}
      {alpha ? (
        <NumberInput
          value={Math.round(rgba.a * 100)}
          onChange={(a) => onChange(formatHex({ ...rgba, a: a / 100 }))}
          min={0}
          max={100}
          step={1}
          unit="%"
          disabled={disabled}
          aria-label={`${name ?? ''}不透明度`}
          className="w-20 shrink-0"
        />
      ) : null}
    </div>
  );
}
