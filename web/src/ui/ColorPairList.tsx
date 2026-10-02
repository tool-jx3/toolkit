/**
 * 可勾選＋新增／刪除的配色對清單（例如拼貼信的「紙片底色＋字色」、卡拉 OK 的配色）。
 * - 每一列：勾選框、配色的小樣張（底色上寫一個字）、名稱；自訂的配色有刪除鈕（內建的不能刪）。
 * - 下方兩個色彩欄＋「新增」：在清單最後加一組自訂配色（預設勾選）。
 * 受控元件：每次變更都以新的陣列呼叫 onChange。
 */
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button, IconButton } from './Button';
import { Checkbox } from './Checkbox';
import { ColorField } from './ColorField';
import { cn } from './cn';
import { Field } from './Field';

export interface ColorPairItem {
  id: string;
  name: string;
  /** 第一個顏色（例如底色） */
  a: string;
  /** 第二個顏色（例如字色） */
  b: string;
  enabled: boolean;
  /** 使用者新增的（可以刪除） */
  custom?: boolean;
}

export interface ColorPairListProps {
  items: readonly ColorPairItem[];
  onChange: (items: ColorPairItem[]) => void;
  'aria-label': string;
  /** 兩個顏色的名稱（預設「底色」「字色」） */
  labels?: { a: string; b: string };
  /** 新增欄位的預設顏色（預設白底黑字） */
  addDefaults?: { a: string; b: string };
  /** 新增的配色名稱（預設「自訂」） */
  customName?: string;
  addLabel?: string;
  /** 樣張上的字（預設「字」）；或自訂整個樣張 */
  sampleText?: string;
  renderSwatch?: (item: Pick<ColorPairItem, 'a' | 'b'>) => ReactNode;
  onAdded?: (item: ColorPairItem) => void;
  onRemoved?: (item: ColorPairItem) => void;
  className?: string;
}

let seq = 0;
const newId = () => `custom-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function ColorPairList({
  items,
  onChange,
  labels = { a: '底色', b: '字色' },
  addDefaults = { a: '#ffffff', b: '#000000' },
  customName = '自訂',
  addLabel = '新增配色',
  sampleText = '字',
  renderSwatch,
  onAdded,
  onRemoved,
  className,
  'aria-label': ariaLabel,
}: ColorPairListProps) {
  const [a, setA] = useState(addDefaults.a);
  const [b, setB] = useState(addDefaults.b);
  const titleId = useId();
  const swatch = (it: Pick<ColorPairItem, 'a' | 'b'>) =>
    renderSwatch ? (
      renderSwatch(it)
    ) : (
      <span
        aria-hidden
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border text-xs font-bold"
        style={{ background: it.a, color: it.b }}
      >
        {sampleText}
      </span>
    );
  const enabledCount = items.filter((i) => i.enabled).length;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p id={titleId} className="sr-only">
        {ariaLabel}
      </p>
      <ul
        aria-labelledby={titleId}
        className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-1.5 p-0"
      >
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
              label={
                <span className="flex min-w-0 items-center gap-1.5">
                  {swatch(it)}
                  <span className="truncate">{it.name}</span>
                </span>
              }
            />
            {it.custom ? (
              <IconButton
                label={`刪除配色「${it.name}」`}
                icon={<Trash2 />}
                size="sm"
                variant="ghost"
                onClick={() => {
                  onChange(items.filter((x) => x.id !== it.id));
                  onRemoved?.(it);
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-muted" aria-live="polite">
        已勾選 {enabledCount}／{items.length} 組
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={labels.a} className="min-w-0 flex-1">
          <ColorField value={a} onChange={setA} />
        </Field>
        <Field label={labels.b} className="min-w-0 flex-1">
          <ColorField value={b} onChange={setB} />
        </Field>
        <Button
          icon={<Plus />}
          onClick={() => {
            const item: ColorPairItem = {
              id: newId(),
              name: customName,
              a,
              b,
              enabled: true,
              custom: true,
            };
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
