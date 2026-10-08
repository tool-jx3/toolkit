/**
 * 編輯一格的面板（點預覽裡的格子後出現在預覽下方）：文字、格子顏色、文字顏色、文字大小、還原這一格。
 * 任何一欄改了，這一格就存成自訂格（四個值一起存，之後換配色也不會變）。
 */
import { RotateCcw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  IconButton,
  NumberInput,
  revealInScroller,
  TextInput,
} from '@/ui';
import type { RulerCell } from './layout';
import {
  type CommonSettings,
  CUSTOM_TEXT_MAX,
  type CustomCell,
  editorValues,
  RANGE,
  type Shape,
} from './settings';
import { actions } from './store';
import { S } from './strings';

export function CellEditor({
  shape,
  cell,
  s,
  onClose,
}: {
  shape: Shape;
  cell: RulerCell;
  s: CommonSettings;
  onClose: () => void;
}) {
  const v = editorValues(s, cell.key, cell.d);
  const custom = !!s.customs[cell.key];
  const set = (patch: Partial<CustomCell>) => actions.setCustom(cell.key, { ...v, ...patch });
  /* 打開（或換一格）時把面板捲進預覽欄看得見的地方（只捲預覽欄，不捲整頁） */
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) revealInScroller(ref.current);
  }, []);
  return (
    <section
      ref={ref}
      aria-label={S.editorTitle(shape, cell.x, cell.y, cell.d)}
      data-testid="cell-editor"
      className="flex flex-col gap-3 rounded-lg border border-accent bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <h3
          className="m-0 min-w-0 flex-1 text-sm font-semibold tabular-nums"
          data-testid="editor-title"
        >
          {S.editorTitle(shape, cell.x, cell.y, cell.d)}
        </h3>
        {custom ? (
          <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
            {S.editorCustomized}
          </span>
        ) : null}
        <IconButton
          label={S.editorClose}
          icon={<X />}
          size="sm"
          variant="ghost"
          onClick={onClose}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field label={S.editorText}>
          <TextInput
            value={v.text}
            maxLength={CUSTOM_TEXT_MAX}
            placeholder={S.editorTextPlaceholder}
            onChange={(e) => set({ text: e.target.value })}
          />
        </Field>
        <Field label={S.editorFontSize}>
          <NumberInput
            value={v.fontSize}
            onChange={(n) => set({ fontSize: Math.trunc(n) })}
            min={RANGE.fontSize.min}
            max={RANGE.fontSize.max}
            unit="px"
          />
        </Field>
      </div>
      <FieldRow>
        <Field label={S.editorCellColor}>
          <ColorField value={v.color} onChange={(color) => set({ color })} alpha />
        </Field>
        <Field label={S.editorTextColor}>
          <ColorField value={v.textColor} onChange={(textColor) => set({ textColor })} alpha />
        </Field>
      </FieldRow>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 min-w-0 flex-1 text-xs text-muted">{S.editorTextHint}</p>
        <Button
          size="sm"
          icon={<RotateCcw />}
          disabled={!custom}
          onClick={() => {
            actions.removeCustom(cell.key);
            onClose();
          }}
        >
          {S.editorReset}
        </Button>
      </div>
    </section>
  );
}
