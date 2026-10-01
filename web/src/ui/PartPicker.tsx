/**
 * 部件選擇格：每個選項的縮圖是「底圖圖層＋該部件」的合成圖（core/compose，透明處棋盤格），下方是名稱。
 * - mode 'single'：單選，再點一次已選的選項就取消（該類變成沒有部件）；
 * - mode 'multiple'：複選、有順序——點一下加入（放在最後＝最上層）、再點一下移除；
 * - 兩種模式的醒目顏色不同（單選主色、複選綠色）；標題旁標示「單選」或「複選」；
 * - 自訂的選項名稱前有「自訂」標記，滑過或聚焦時出現刪除鈕（onRemove；確認由工具負責）。
 *
 * ```tsx
 * <PartPicker label="眼睛" mode="single" base={[face.fill, face.line]} options={eyes}
 *   value={draft.eyes ? [draft.eyes] : []} onChange={([id]) => setDraft({ eyes: id ?? null })}
 *   onRemove={(o) => removeCustom(o)} actions={<Button size="sm" onClick={addImages}>加圖片</Button>} />
 * ```
 */
import { Check, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { composeLayers } from '@/core/compose';
import type { DrawableImage } from '@/core/image';
import { IconButton } from './Button';
import { cn } from './cn';

export interface PartOption {
  id: string;
  name: string;
  /** 部件圖層（與底圖同尺寸的透明圖；不同尺寸時等比置中） */
  layer: DrawableImage | null;
  /** 使用者加入的自訂部件 */
  custom?: boolean;
}

export interface PartPickerProps {
  /** 類別名稱（例如「眼睛」） */
  label: string;
  options: readonly PartOption[];
  mode: 'single' | 'multiple';
  /** 選取的 id（single 時最多一個；multiple 時依疊放順序，最後＝最上層） */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** 每個縮圖底下都有的圖層（例如頭部底圖的填色層與輪廓層） */
  base?: readonly (DrawableImage | null | undefined)[];
  /** 自訂選項的刪除 */
  onRemove?: (option: PartOption) => void;
  /** 標題列右側（例如「加圖片」按鈕） */
  actions?: ReactNode;
  /** 縮圖大小（px，預設 88） */
  thumbSize?: number;
  /** 沒有選項時 */
  empty?: ReactNode;
  className?: string;
}

function PartThumb({
  base,
  layer,
  size,
}: {
  base: readonly (DrawableImage | null | undefined)[];
  layer: DrawableImage | null;
  size: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    const src = composeLayers([...base, layer], { width: px, height: px });
    c.width = px;
    c.height = px;
    const ctx = c.getContext('2d');
    ctx?.clearRect(0, 0, px, px);
    ctx?.drawImage(src as CanvasImageSource, 0, 0);
  }, [base, layer, size]);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="checker block rounded-sm"
      style={{ width: size, height: size }}
    />
  );
}

const NO_LAYERS: readonly DrawableImage[] = [];

export function PartPicker({
  label,
  options,
  mode,
  value,
  onChange,
  base = NO_LAYERS,
  onRemove,
  actions,
  thumbSize = 88,
  empty,
  className,
}: PartPickerProps) {
  const toggle = (id: string) => {
    if (mode === 'single') onChange(value[0] === id ? [] : [id]);
    else onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  const tone = mode === 'single' ? 'accent' : 'success';
  return (
    <section className={cn('flex min-w-0 flex-col gap-2', className)} aria-label={label}>
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-sm font-semibold text-fg">{label}</h3>
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-xs',
            mode === 'single' ? 'bg-accent-soft text-accent' : 'bg-success-soft text-success',
          )}
        >
          {mode === 'single' ? '單選' : '複選'}
        </span>
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </div>
      {options.length ? (
        <ul
          className="m-0 grid list-none gap-2 p-0"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize + 12}px, 1fr))` }}
        >
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <li key={o.id} className="group relative min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${label}：${o.custom ? '自訂 ' : ''}${o.name}`}
                  title={o.name}
                  onClick={() => toggle(o.id)}
                  data-part={o.id}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 rounded-md border-2 p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
                    on
                      ? tone === 'accent'
                        ? 'border-accent bg-accent-soft'
                        : 'border-success bg-success-soft'
                      : 'border-transparent bg-surface hover:border-border-strong',
                  )}
                >
                  <span className="relative">
                    <PartThumb base={base} layer={o.layer} size={thumbSize} />
                    {on && mode === 'multiple' ? (
                      <span className="absolute top-1 left-1 flex size-4 items-center justify-center rounded-full bg-success text-success-contrast [&_svg]:size-3">
                        <Check aria-hidden />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex w-full min-w-0 items-center justify-center gap-1 text-xs text-fg">
                    {o.custom ? (
                      <span className="shrink-0 rounded-sm bg-surface-3 px-1 text-[10px] text-muted">
                        自訂
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{o.name}</span>
                  </span>
                </button>
                {o.custom && onRemove ? (
                  <IconButton
                    size="sm"
                    variant="secondary"
                    label={`刪除自訂部件「${o.name}」`}
                    icon={<X />}
                    onClick={() => onRemove(o)}
                    className="absolute top-1 right-1 bg-surface/90 opacity-0 shadow-1 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : empty ? (
        <p className="m-0 text-xs text-muted">{empty}</p>
      ) : null}
    </section>
  );
}
