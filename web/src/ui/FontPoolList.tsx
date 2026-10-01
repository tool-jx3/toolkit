/**
 * 可複選的字型池清單（例如拼貼信：每個字從勾選的字型裡隨機挑一套）。
 * - 每一列：勾選框＋字型名稱（用該字型本身顯示，Google 字型只下載名稱用到的字）；自己加入的字型有刪除鈕。
 * - 下方用 FontPicker（Google／電腦／上傳）選一套字型，按「加入」放到清單最後（預設勾選）；已在清單裡的不重複加入。
 * 受控元件：每次變更都以新的陣列呼叫 onChange。
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FONT, type FontValue, fontFamilyCss, loadPreviewFont } from '@/core/fonts';
import { Button, IconButton } from './Button';
import { Checkbox } from './Checkbox';
import { cn } from './cn';
import { FontPicker } from './FontPicker';

export interface FontPoolItem {
  id: string;
  font: FontValue;
  /** 顯示名稱（預設字型名稱） */
  label?: string;
  enabled: boolean;
  /** 使用者加入的（可以刪除） */
  custom?: boolean;
}

export interface FontPoolListProps {
  items: readonly FontPoolItem[];
  onChange: (items: FontPoolItem[]) => void;
  'aria-label': string;
  /** FontPicker 清單預覽用的文字 */
  previewText?: string;
  addLabel?: string;
  onAdded?: (item: FontPoolItem) => void;
  /** 要加入的字型已經在清單裡 */
  onDuplicate?: (item: FontPoolItem) => void;
  className?: string;
}

let seq = 0;
const newId = () => `font-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const sameFont = (a: FontValue, b: FontValue) =>
  a.source === b.source &&
  a.family.toLowerCase() === b.family.toLowerCase() &&
  a.weight === b.weight;

/** 名稱用字型本身顯示 */
function FontName({ font, label }: { font: FontValue; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (font.source !== 'google') {
      setFamily(font.family);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      void loadPreviewFont(font.family, label).then((a) => alive && setFamily(a));
      return () => {
        alive = false;
      };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void loadPreviewFont(font.family, label).then((a) => alive && setFamily(a));
      }
    });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [font.family, font.source, label]);
  return (
    <span
      ref={ref}
      className="truncate"
      style={family ? { fontFamily: fontFamilyCss(family), fontWeight: font.weight } : undefined}
    >
      {label}
    </span>
  );
}

export function FontPoolList({
  items,
  onChange,
  previewText,
  addLabel = '加入字型',
  onAdded,
  onDuplicate,
  className,
  'aria-label': ariaLabel,
}: FontPoolListProps) {
  const [pick, setPick] = useState<FontValue>(DEFAULT_FONT);
  const enabledCount = items.filter((i) => i.enabled).length;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ul aria-label={ariaLabel} className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((it) => (
          <li
            key={it.id}
            className={cn(
              'flex min-w-0 items-center gap-1 rounded-md border px-2 py-1',
              it.enabled ? 'border-border-strong bg-surface-2' : 'border-border bg-surface',
            )}
          >
            <Checkbox
              checked={it.enabled}
              onCheckedChange={(on) =>
                onChange(items.map((x) => (x.id === it.id ? { ...x, enabled: on } : x)))
              }
              className="min-w-0 flex-1"
              label={<FontName font={it.font} label={it.label ?? it.font.family} />}
            />
            {it.custom ? (
              <IconButton
                label={`移除字型「${it.label ?? it.font.family}」`}
                icon={<Trash2 />}
                size="sm"
                variant="ghost"
                onClick={() => onChange(items.filter((x) => x.id !== it.id))}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-muted" aria-live="polite">
        已勾選 {enabledCount}／{items.length} 套
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <FontPicker
          aria-label="要加入的字型"
          value={pick}
          onChange={setPick}
          previewText={previewText}
          className="min-w-0 flex-1"
        />
        <Button
          icon={<Plus />}
          onClick={() => {
            const dup = items.find((x) => sameFont(x.font, pick));
            if (dup) {
              onDuplicate?.(dup);
              if (!dup.enabled)
                onChange(items.map((x) => (x.id === dup.id ? { ...x, enabled: true } : x)));
              return;
            }
            const item: FontPoolItem = { id: newId(), font: pick, enabled: true, custom: true };
            onChange([...items, item]);
            onAdded?.(item);
          }}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
