/**
 * HSV 面板：彩度／明度二維面板＋色相滑桿（受控，值直接是 HSV）。
 *
 * 和 ColorPicker 的差別：值是 { h, s, v } 而不是色碼，所以
 * - 呼叫端可以指定標記的初始位置（不必由色碼反推）；
 * - 灰色、黑色時色相與彩度不會遺失；
 * - 色碼與面板的同步方式由呼叫端決定（例如輸入色碼後才把面板移過去）。
 * 換算成色碼用 core/color 的 hsvToRgb＋formatHex（四捨五入到 0～255）。
 *
 * 面板：橫向是彩度（左 0 → 右 1），直向是明度（上 1 → 下 0）；按下或拖曳選色，拖到外面時夾在邊界。
 * 鍵盤：面板上方向鍵調整 0.01（Shift 0.1）；色相滑桿見 Radix Slider（←→ 1 度、PageUp／PageDown 10 度）。
 */
import { Slider as S } from 'radix-ui';
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { formatHex, type Hsv, hsvToRgb } from '@/core/color';
import { cn } from './cn';
import { useFieldControl } from './Field';

export interface HsvPanelProps {
  value: Hsv;
  onChange: (hsv: Hsv) => void;
  /** 面板高度（px，預設 144）；寬度撐滿容器 */
  height?: number;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => Math.round(v * 100);

/** HSV → 小寫 #rrggbb */
export const hsvToHex = (hsv: Hsv): string => formatHex({ ...hsvToRgb(hsv), a: 1 }, false);

export function HsvPanel({
  value,
  onChange,
  height = 144,
  disabled,
  className,
  ...rest
}: HsvPanelProps) {
  const field = useFieldControl(rest);
  const area = useRef<HTMLDivElement>(null);
  const { h, s, v } = value;

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = area.current!.getBoundingClientRect();
    onChange({
      h,
      s: clamp01((e.clientX - r.left) / r.width),
      v: clamp01(1 - (e.clientY - r.top) / r.height),
    });
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
    onChange({ h, s: clamp01(s + m[0]), v: clamp01(v + m[1]) });
  };
  const hueColor = hsvToHex({ h, s: 1, v: 1 });
  const color = hsvToHex(value);

  return (
    // biome-ignore lint/a11y/useSemanticElements: 面板＋色相滑桿是一組自訂控制項，不是表單的 fieldset
    <div
      role="group"
      id={field.id}
      aria-label={rest['aria-label']}
      aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
      aria-describedby={field['aria-describedby']}
      className={cn('flex w-full min-w-0 flex-col gap-3', disabled && 'opacity-50', className)}
    >
      <div
        ref={area}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="彩度與明度"
        aria-roledescription="二維滑桿"
        aria-disabled={disabled || undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct(s)}
        aria-valuetext={`彩度 ${pct(s)}%，明度 ${pct(v)}%`}
        data-s={s}
        data-v={v}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
        onKeyDown={disabled ? undefined : onAreaKey}
        className="relative w-full cursor-crosshair touch-none rounded-md"
        style={{
          height,
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
      >
        <span
          aria-hidden
          data-testid="hsv-marker"
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: color }}
        />
      </div>
      <S.Root
        value={[h]}
        min={0}
        max={360}
        step={1}
        disabled={disabled}
        onValueChange={([nh]) => onChange({ h: nh, s, v })}
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
          aria-valuetext={`${Math.round(h)} 度`}
          className="block size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
          style={{ background: hueColor }}
        />
      </S.Root>
    </div>
  );
}
