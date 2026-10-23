/**
 * 卡片（規格 F15～F19、F24、F33）：成員卡片、配偶卡片、就地編輯的輸入欄。
 * 卡片是 DOM（可以聚焦、雙擊）；位置由排版決定（Canvas 放在絕對座標）。
 */
import { type CSSProperties, type KeyboardEvent, memo, useLayoutEffect, useRef } from 'react';
import { cn } from '@/ui';
import type { Dims } from '../model/layout';
import {
  type Category,
  FIELD_LIMIT,
  type InlineField,
  type Member,
  type Person,
  type Spouse,
} from '../model/types';
import { S } from '../strings';

export type CardLook = 'full' | 'compact';

/** 色分類：底色混 14%、框線混 60%（同原作） */
export function catStyle(cat: Category | null, base: string): CSSProperties | undefined {
  if (!cat) return undefined;
  return {
    background: `color-mix(in srgb, ${cat.color} 14%, ${base})`,
    borderColor: `color-mix(in srgb, ${cat.color} 60%, var(--border))`,
    borderStyle: 'solid',
  };
}

export interface InlineState {
  field: InlineField;
  /** byKey：用 Enter 確定（之後焦點回到卡片） */
  onCommit: (value: string, move: -1 | 0 | 1, byKey?: boolean) => void;
  onCancel: () => void;
}

/** 就地編輯的輸入欄：打開時全選；Enter 確定、Esc 取消、Tab／Shift＋Tab 確定後跳欄、離開時確定 */
function InlineInput({
  value,
  placeholder,
  state,
  wide,
  label,
}: {
  value: string;
  placeholder: string;
  state: InlineState;
  wide?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, []);
  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = e.currentTarget.value;
      finish(() => state.onCommit(v, 0, true));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(state.onCancel);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const v = e.currentTarget.value;
      finish(() => state.onCommit(v, e.shiftKey ? -1 : 1));
    }
  };
  const size = Math.max(3, Array.from(value || placeholder).length + 1);
  return (
    <input
      ref={ref}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={label}
      maxLength={FIELD_LIMIT[state.field]}
      size={size}
      data-inline={state.field}
      className={cn(
        'min-w-0 rounded-sm border border-border-strong bg-bg px-0.5 text-fg outline-none ring-2 ring-accent/40',
        wide ? 'w-full' : 'max-w-full',
      )}
      style={{
        font: 'inherit',
        width: state.field === 'birth' || state.field === 'death' ? '5.5em' : undefined,
      }}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        const v = e.currentTarget.value;
        finish(() => state.onCommit(v, 0));
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/** 一欄文字：空白時是提示（選取中才看得到）；就地編輯中換成輸入欄 */
function FieldText({
  f,
  value,
  selected,
  inline,
  className,
  wide,
}: {
  f: InlineField;
  value: string | undefined;
  selected: boolean;
  inline: InlineState | null;
  className?: string;
  wide?: boolean;
}) {
  const ph = S.placeholders[f];
  if (inline && inline.field === f)
    return (
      <InlineInput
        value={value ?? ''}
        placeholder={ph}
        state={inline}
        wide={wide}
        label={S.inlineLabel[f]}
      />
    );
  return (
    <span
      data-f={f}
      className={cn(
        'rounded-[3px] px-px',
        !value && (selected ? 'opacity-45' : 'invisible'),
        selected && 'hover:bg-surface-3',
        className,
      )}
    >
      {value || ph}
    </span>
  );
}

function Years({
  p,
  selected,
  inline,
  className,
}: {
  p: Person;
  selected: boolean;
  inline: InlineState | null;
  className?: string;
}) {
  const any = !!(p.birth || p.death);
  return (
    <div
      data-yr="1"
      className={cn('flex items-baseline gap-1 whitespace-nowrap tabular-nums', className)}
    >
      <FieldText f="birth" value={p.birth} selected={selected} inline={inline} />
      <span className={cn(!any && (selected ? 'opacity-45' : 'invisible'))}>–</span>
      <FieldText f="death" value={p.death} selected={selected} inline={inline} />
    </div>
  );
}

function GenderMark({ female, compact }: { female: boolean; compact?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 bg-fg',
        compact ? 'absolute top-1.5 left-1.5 size-1.5' : 'size-2',
        female ? 'rounded-full' : 'rounded-[1.5px]',
      )}
    />
  );
}

/* 外框（outline）不放在這裡：`outline-none` 和拖曳時的 `outline-dashed` 同時套用會讓 none 贏（F44），
   所以各卡片自己選一個（成員卡片：移動中是虛線、其他沒有；配偶卡片：沒有） */
const cardBase =
  'relative flex cursor-pointer select-none flex-col overflow-hidden border text-fg shadow-1 transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-focus';

/** 拖曳中要移動的卡片：2 px 虛線外框、和卡片隔 3 px（F44，同原作） */
const OUTLINE_MOVING = 'outline-2 outline-offset-3 outline-dashed outline-border-strong';
const OUTLINE_NONE = 'outline-none';

/** 簡易卡片的圓角 8 px、詳細卡片 10 px（規格 3.2） */
const RADIUS_COMPACT = 'rounded-[8px]';
const RADIUS_FULL = 'rounded-[10px]';

export interface MemberCardProps {
  p: Member;
  gen: number;
  dims: Dims;
  look: CardLook;
  memo: boolean;
  cat: Category | null;
  selected: boolean;
  inline: InlineState | null;
  drop?: 'ok' | 'bad' | null;
  ghost?: boolean;
  /** 拖曳中跟著移動（虛線外框） */
  moving?: boolean;
  onKey?: (e: KeyboardEvent<HTMLDivElement>, id: string) => void;
}

export const MemberCard = memo(function MemberCard({
  p,
  gen,
  dims,
  look,
  memo: showMemo,
  cat,
  selected,
  inline,
  drop,
  ghost,
  moving,
  onKey,
}: MemberCardProps) {
  const female = p.gender === 'F';
  const name = p.name || S.unnamed;
  const style: CSSProperties = {
    width: dims.W,
    height: dims.H,
    ...catStyle(cat, 'var(--surface)'),
  };
  const ring = drop
    ? drop === 'ok'
      ? 'border-success! shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_35%,transparent)]'
      : 'border-danger!'
    : selected
      ? 'border-accent! shadow-[0_0_0_1px_var(--accent),var(--shadow-2)]'
      : 'hover:border-border-strong';
  const outline = moving ? OUTLINE_MOVING : OUTLINE_NONE;
  const common = {
    'data-pid': ghost ? undefined : p.id,
    tabIndex: ghost ? -1 : 0,
    role: ghost ? undefined : 'button',
    'aria-pressed': ghost ? undefined : selected,
    'aria-label': ghost ? undefined : S.cardLabel(name, gen),
    onKeyDown: onKey ? (e: KeyboardEvent<HTMLDivElement>) => onKey(e, p.id) : undefined,
  };
  if (look === 'compact') {
    return (
      <div
        {...common}
        className={cn(
          cardBase,
          'items-center justify-center bg-surface px-1.5 py-1 text-center',
          RADIUS_COMPACT,
          ring,
          outline,
        )}
        style={style}
      >
        <GenderMark female={female} compact />
        <div className="ft-cl w-full truncate px-1.5 text-[calc(16px*var(--k,1))] leading-tight font-bold">
          <FieldText f="name" value={p.name} selected={selected} inline={inline} wide />
        </div>
        {p.reading || selected || inline?.field === 'reading' ? (
          <div className="ft-cl w-full truncate px-1.5 text-[calc(12.5px*var(--k,1))] leading-tight text-muted">
            <FieldText f="reading" value={p.reading} selected={selected} inline={inline} wide />
          </div>
        ) : null}
        {p.birth ||
        p.death ||
        selected ||
        inline?.field === 'birth' ||
        inline?.field === 'death' ? (
          <Years
            p={p}
            selected={selected}
            inline={inline}
            className="ft-cl w-full justify-center truncate px-1.5 text-[calc(11.5px*var(--k,1))] leading-tight text-muted"
          />
        ) : null}
      </div>
    );
  }
  return (
    <div
      {...common}
      className={cn(cardBase, 'gap-0.5 bg-surface px-2.5 py-2', RADIUS_FULL, ring, outline)}
      style={style}
    >
      <div className="ft-row1 flex min-w-0 items-center gap-[5px]">
        <GenderMark female={female} />
        <FieldText
          f="name"
          value={p.name}
          selected={selected}
          inline={inline}
          className="ft-nm min-w-0 shrink truncate text-[calc(14px*var(--k,1))] font-semibold whitespace-nowrap"
        />
        <FieldText
          f="reading"
          value={p.reading}
          selected={selected}
          inline={inline}
          className="ft-hj min-w-0 flex-1 truncate text-[calc(12px*var(--k,1))] whitespace-nowrap text-muted"
        />
      </div>
      <Years p={p} selected={selected} inline={inline} className="min-h-4 text-xs text-muted" />
      {p.alias ? (
        <div className="line-clamp-2 text-[11.5px] leading-[1.3] wrap-anywhere whitespace-pre-line text-muted">
          {p.alias}
        </div>
      ) : null}
      {showMemo ? (
        <div className="mt-auto line-clamp-2 border-t border-dashed border-border pt-[3px] text-[11.5px] leading-[1.35] opacity-80">
          <FieldText f="note" value={p.note} selected={selected} inline={inline} wide />
        </div>
      ) : null}
    </div>
  );
});

export interface SpouseCardProps {
  s: Spouse;
  /** 名字、讀音、生歿年顯示誰的資料（連結的配偶顯示那位成員；第二批） */
  src: Person;
  hostFemale: boolean;
  hostName: string;
  dims: Dims;
  look: CardLook;
  cat: Category | null;
  selected: boolean;
  inline: InlineState | null;
  drop?: 'ok' | 'bad' | null;
  onKey?: (e: KeyboardEvent<HTMLDivElement>, id: string) => void;
}

export const SpouseCard = memo(function SpouseCard({
  s,
  src,
  hostFemale,
  hostName,
  dims,
  look,
  cat,
  selected,
  inline,
  drop,
  onKey,
}: SpouseCardProps) {
  const rel = hostFemale ? S.husband : S.wife;
  const ring = drop
    ? drop === 'ok'
      ? 'border-success! shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_35%,transparent)]'
      : 'border-danger!'
    : selected
      ? 'border-accent! border-solid! shadow-[0_0_0_1px_var(--accent),var(--shadow-2)]'
      : 'hover:border-border-strong';
  const style: CSSProperties = { width: dims.SPW, height: dims.H, ...catStyle(cat, 'var(--bg)') };
  const props = {
    'data-pid': s.id,
    tabIndex: 0,
    role: 'button',
    'aria-pressed': selected,
    'aria-label': S.chipLabel(src.name || S.unnamed, rel, hostName),
    onKeyDown: onKey ? (e: KeyboardEvent<HTMLDivElement>) => onKey(e, s.id) : undefined,
  };
  if (look === 'compact')
    return (
      <div
        {...props}
        className={cn(
          cardBase,
          'items-center justify-center border-dashed bg-bg px-1.5 py-1 text-center',
          RADIUS_COMPACT,
          OUTLINE_NONE,
          ring,
        )}
        style={style}
      >
        <div className="text-[10px] leading-tight text-muted">{rel}</div>
        <div className="ft-cl w-full truncate px-1 text-[calc(14px*var(--k,1))] leading-tight font-bold">
          <FieldText f="name" value={src.name} selected={selected} inline={inline} wide />
        </div>
        <Years
          p={src}
          selected={selected}
          inline={inline}
          className="ft-cl w-full justify-center truncate text-[calc(11.5px*var(--k,1))] leading-tight text-muted"
        />
      </div>
    );
  return (
    <div
      {...props}
      className={cn(
        cardBase,
        'gap-px border-dashed bg-bg px-[9px] py-[7px]',
        RADIUS_FULL,
        OUTLINE_NONE,
        ring,
      )}
      style={style}
    >
      <div className="text-[11px] text-muted">{rel}</div>
      <div className="flex min-w-0">
        <FieldText
          f="name"
          value={src.name}
          selected={selected}
          inline={inline}
          className="min-w-0 truncate text-[13px] font-semibold whitespace-nowrap"
        />
      </div>
      <Years
        p={src}
        selected={selected}
        inline={inline}
        className="min-h-3.5 text-[11px] text-muted"
      />
      <div className="truncate text-[11px] text-muted">
        <FieldText f="origin" value={s.origin} selected={selected} inline={inline} />
      </div>
    </div>
  );
});
