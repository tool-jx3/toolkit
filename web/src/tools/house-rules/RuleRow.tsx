/**
 * 規則的一列（規格 F25～F34）：眼睛（放不放進表）、名稱（可改）、說明、選項按鈕（帶數字的選項有數字欄；
 * 自己加的規則有自由填寫）、注記、刪除（只有自己加的規則）。手機可以左右滑（useSwipe）。
 *
 * 版面依所在區塊的寬度（container query）：寬 ≥ 48rem 一列五欄；32～48rem 注記排到第二行；更窄時名稱一行、
 * 選項一行、注記一行，眼睛與刪除鈕在名稱右邊（不放進表的列只留名稱那一行）。
 */
import { Eye, EyeOff, RotateCcw, Trash2 } from 'lucide-react';
import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import { historyGesture } from '@/core/storage';
import { cn, comboText, IconButton, NumberInput, Tooltip, useToast } from '@/ui';
import {
  removeCustom,
  resetRuleName,
  setCustomName,
  setCustomText,
  setNote,
  setNumber,
  setRuleName,
  setVisible,
  toggleCustomValue,
  toggleOption,
} from './actions';
import { builtinView, type CustomRow, customView, LIMITS, type RowState } from './model';
import {
  CUSTOM_OPTIONS,
  type CustomValue,
  optionLabel,
  type RuleDef,
  type RuleOption,
  type SectionId,
} from './rules';
import { useRules } from './store';
import { S } from './strings';
import { useAutoGrow } from './useAutoGrow';
import { useSwipe } from './useSwipe';

const gesture = historyGesture(useRules);

/** 列的格線：依區塊寬度三種排法 */
export const ROW_GRID = cn(
  'grid items-start gap-x-2 gap-y-1.5',
  'grid-cols-[minmax(0,1fr)_auto_auto] [grid-template-areas:"name_eye_trash"_"value_value_value"_"note_note_note"]',
  '@lg:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.2fr)_1.75rem] @lg:[grid-template-areas:"eye_name_value_trash"_"._note_note_."] @lg:gap-x-3',
  '@3xl:grid-cols-[2rem_minmax(0,1.05fr)_minmax(0,1.25fr)_minmax(0,1.3fr)_1.75rem] @3xl:[grid-template-areas:"eye_name_value_note_trash"]',
);

const chipBase =
  '[font-variant-emoji:text] min-h-8 rounded-md border py-1 leading-tight transition-colors focus-visible:focus-ring @max-lg:min-h-9';

function chipClass(op: RuleOption, on: boolean): string {
  const sym = op.sym || op.id === 'text';
  return cn(
    chipBase,
    sym ? 'min-w-9 px-2 text-base font-bold' : 'px-2.5 text-xs font-semibold',
    !on && 'border-border bg-surface-2 hover:border-border-strong',
    !on && (op.id === 'm' ? 'text-warning' : 'text-fg'),
    on && op.id === 'o' && 'border-success bg-success text-success-contrast',
    on && op.id === 'x' && 'border-muted bg-muted text-bg',
    on && op.id === 'm' && 'border-warning bg-warning text-warning-contrast',
    on && !['o', 'x', 'm'].includes(op.id) && 'border-accent bg-accent text-accent-contrast',
  );
}

function Chip({
  op,
  on,
  label,
  onClick,
  chipRef,
}: {
  op: RuleOption;
  on: boolean;
  label: string;
  onClick: () => void;
  chipRef?: (el: HTMLButtonElement | null) => void;
}) {
  const btn = (
    <button
      ref={chipRef}
      type="button"
      aria-pressed={on}
      aria-label={op.long}
      data-opt={op.id}
      onClick={onClick}
      className={chipClass(op, on)}
    >
      {label}
    </button>
  );
  return op.long ? <Tooltip content={op.long}>{btn}</Tooltip> : btn;
}

/** 名稱欄：輸入中保留自己的文字（清空時不會立刻跳回原本的名稱），離開時才顯示整理後的名稱 */
function NameInput({
  value,
  placeholder,
  onChange,
  inputRef,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      ref={inputRef}
      aria-label={S.row.name}
      value={draft ?? value}
      placeholder={placeholder}
      maxLength={LIMITS.name}
      onFocus={() => {
        setDraft(value);
        gesture.begin();
      }}
      onBlur={() => {
        setDraft(null);
        gesture.commit();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      className="-ml-1.5 w-full min-w-0 truncate rounded-sm border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-fg placeholder:text-muted hover:border-border focus:border-border-strong"
    />
  );
}

function NoteInput({
  value,
  mod,
  onChange,
  noteRef,
}: {
  value: string;
  mod: boolean;
  onChange: (v: string) => void;
  noteRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const ref = useAutoGrow<HTMLTextAreaElement>(value);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        noteRef(el);
      }}
      aria-label={S.row.note}
      rows={1}
      value={value}
      maxLength={LIMITS.note}
      placeholder={mod ? S.row.noteModPlaceholder : S.row.notePlaceholder}
      onFocus={gesture.begin}
      onBlur={gesture.commit}
      onChange={(e) => onChange(e.target.value)}
      data-mod={mod || undefined}
      className={cn(
        'block min-h-8 w-full min-w-0 resize-none overflow-hidden rounded-md border bg-surface-2 px-2 py-1 text-xs leading-relaxed text-fg placeholder:text-muted',
        mod ? 'border-warning placeholder:text-warning' : 'border-border-strong',
      )}
    />
  );
}

interface RowShellProps {
  secId: SectionId;
  rowKey: string;
  name: string;
  vis: boolean;
  mod: boolean;
  custom: boolean;
  onToggleVisible: () => void;
  onRemove?: () => void;
  nameCell: ReactNode;
  valueCell: ReactNode;
  noteCell: ReactNode;
}

function RowShell({
  secId,
  rowKey,
  name,
  vis,
  mod,
  custom,
  onToggleVisible,
  onRemove,
  nameCell,
  valueCell,
  noteCell,
}: RowShellProps) {
  const toast = useToast();
  const swipe = useSwipe({
    onRight: () => {
      onToggleVisible();
      toast({ title: vis ? S.toast.hidden : S.toast.shown, duration: 1600, replace: true });
    },
    onLeft: onRemove,
  });
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一列規則的控制項分組（不是表單的 fieldset，不要 fieldset 的框線與 legend）
    <div
      role="group"
      aria-label={name}
      data-row={`${secId}:${rowKey}`}
      data-visible={vis}
      data-custom={custom || undefined}
      className={cn(
        ROW_GRID,
        'relative touch-pan-y border-b border-border px-2 py-2 transition-transform even:bg-surface-2/60',
        'data-[swipe=toggle]:!bg-accent-soft data-[swipe=remove]:!bg-danger-soft',
        mod && vis && 'border-l-2 border-l-warning',
        /* 窄畫面：不放進表的列只留名稱那一行 */
        !vis && '@max-lg:gap-y-0 @max-lg:[grid-template-areas:"name_eye_trash"]',
      )}
      {...swipe}
    >
      <IconButton
        label={S.row.visible}
        aria-pressed={vis}
        icon={vis ? <Eye className="text-accent" /> : <EyeOff className="text-muted" />}
        onClick={onToggleVisible}
        className="[grid-area:eye]"
      />
      <div className={cn('min-w-0 [grid-area:name]', !vis && 'opacity-45')}>{nameCell}</div>
      <div
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1.5 [grid-area:value]',
          !vis && 'opacity-45 @max-lg:hidden',
        )}
      >
        {valueCell}
      </div>
      <div className={cn('min-w-0 [grid-area:note]', !vis && 'opacity-45 @max-lg:hidden')}>
        {noteCell}
      </div>
      <div className="[grid-area:trash]">
        {onRemove ? (
          <IconButton
            label={S.row.remove}
            icon={<Trash2 className="text-danger" />}
            onClick={onRemove}
            className="hover:bg-danger-soft"
            size="sm"
          />
        ) : null}
      </div>
    </div>
  );
}

/** 選了 ※（注記空白）或自由填寫後，焦點移到注記或內容欄 */
function useFocusAfter() {
  const pending = useRef<'note' | 'text' | null>(null);
  const note = useRef<HTMLTextAreaElement | null>(null);
  const text = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const which = pending.current;
    if (!which) return;
    pending.current = null;
    (which === 'note' ? note.current : text.current)?.focus({ preventScroll: true });
  });
  return { pending, note, text };
}

export const BuiltinRow = memo(function BuiltinRow({
  secId,
  rule,
  row,
}: {
  secId: SectionId;
  rule: RuleDef;
  row: RowState;
}) {
  const view = builtinView(rule, row);
  const mod = row.val === 'm';
  const focus = useFocusAfter();
  const numOp = rule.opts.find((op) => op.id === row.val && op.num);
  return (
    <RowShell
      secId={secId}
      rowKey={rule.id}
      name={view.name}
      vis={row.vis}
      mod={mod}
      custom={false}
      onToggleVisible={() => setVisible(secId, rule.id, false, !row.vis)}
      nameCell={
        <>
          <div className="flex items-center gap-0.5">
            <NameInput
              value={view.name}
              placeholder={rule.name}
              onChange={(v) => setRuleName(secId, rule.id, v)}
            />
            {row.name ? (
              <IconButton
                label={S.row.resetName}
                icon={<RotateCcw className="text-muted" />}
                size="sm"
                className="size-6"
                onClick={() => resetRuleName(secId, rule.id)}
              />
            ) : null}
          </div>
          {rule.hint ? (
            <p className={cn('m-0 mt-0.5 text-xs leading-snug text-muted', !row.vis && 'hidden')}>
              {rule.hint}
            </p>
          ) : null}
        </>
      }
      valueCell={
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕，不是表單的 fieldset */}
          <div role="group" aria-label={S.row.options} className="flex flex-wrap gap-1">
            {rule.opts.map((op) => {
              const on = row.val === op.id;
              return (
                <Chip
                  key={op.id}
                  op={op}
                  on={on}
                  label={optionLabel(op, on ? row.n : undefined)}
                  onClick={() => {
                    if (!on && op.id === 'm' && !row.note) focus.pending.current = 'note';
                    toggleOption(secId, rule.id, op.id);
                  }}
                />
              );
            })}
          </div>
          {numOp?.num ? (
            <NumberInput
              aria-label={numOp.num.label}
              value={row.n ?? numOp.num.def}
              min={numOp.num.min}
              max={numOp.num.max}
              step={1}
              size="sm"
              className="w-20"
              onChange={(v) => setNumber(secId, rule.id, v)}
            />
          ) : null}
        </>
      }
      noteCell={
        <NoteInput
          value={row.note}
          mod={mod}
          onChange={(v) => setNote(secId, rule.id, false, v)}
          noteRef={(el) => {
            focus.note.current = el;
          }}
        />
      }
    />
  );
});

export const CustomRuleRow = memo(function CustomRuleRow({
  secId,
  row,
  autoFocus,
}: {
  secId: SectionId;
  row: CustomRow;
  autoFocus?: boolean;
}) {
  const view = customView(row);
  const mod = row.val === 'm';
  const focus = useFocusAfter();
  const toast = useToast();
  const nameRef = useRef<HTMLInputElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在剛新增時聚焦一次
  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
  }, []);
  const remove = () => {
    removeCustom(secId, row.id);
    toast({
      title: S.toast.removed,
      description: S.toast.undoHint(comboText('mod+z')),
      replace: true,
    });
  };
  return (
    <RowShell
      secId={secId}
      rowKey={row.id}
      name={view.name}
      vis={row.vis}
      mod={mod}
      custom
      onToggleVisible={() => setVisible(secId, row.id, true, !row.vis)}
      onRemove={remove}
      nameCell={
        <NameInput
          value={row.name}
          placeholder={S.row.newRule}
          onChange={(v) => setCustomName(secId, row.id, v)}
          inputRef={(el) => {
            nameRef.current = el;
          }}
        />
      }
      valueCell={
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕，不是表單的 fieldset */}
          <div role="group" aria-label={S.row.options} className="flex flex-wrap gap-1">
            {CUSTOM_OPTIONS.map((op) => {
              const on = row.val === op.id;
              return (
                <Chip
                  key={op.id}
                  op={op}
                  on={on}
                  label={op.label}
                  onClick={() => {
                    if (!on && op.id === 'm' && !row.note) focus.pending.current = 'note';
                    if (!on && op.id === 'text') focus.pending.current = 'text';
                    toggleCustomValue(secId, row.id, op.id as CustomValue);
                  }}
                />
              );
            })}
          </div>
          {row.val === 'text' ? (
            <input
              ref={(el) => {
                focus.text.current = el;
              }}
              aria-label={S.row.freeText}
              value={row.text}
              maxLength={LIMITS.text}
              placeholder={S.row.freePlaceholder}
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) => setCustomText(secId, row.id, e.target.value)}
              className="h-8 min-w-0 flex-[1_1_9rem] rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-fg placeholder:text-muted"
            />
          ) : null}
        </>
      }
      noteCell={
        <NoteInput
          value={row.note}
          mod={mod}
          onChange={(v) => setNote(secId, row.id, true, v)}
          noteRef={(el) => {
            focus.note.current = el;
          }}
        />
      }
    />
  );
});
