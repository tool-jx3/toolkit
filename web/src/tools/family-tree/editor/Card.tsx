/**
 * 卡片（規格 F15～F19、F24、F33；第二批 F80～F87）：成員卡片、配偶卡片、「出」字小卡、就地編輯的輸入欄。
 * 卡片是 DOM（可以聚焦、雙擊）；位置由排版決定（Canvas 放在絕對座標）。
 * 卡片上的字（名字、說明行、印記）由 model/present 算好（匯出也用同一份）。
 */
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { DEFAULT_PLACEMENT, drawPlacedCrop, type FramePlacement } from '@/core/image';
import { cn } from '@/ui';
import { AVATAR, type Dims } from '../model/layout';
import { type MemberText, statusSeal } from '../model/present';
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
    backgroundColor: `color-mix(in srgb, ${cat.color} 14%, ${base})`,
    borderColor: `color-mix(in srgb, ${cat.color} 60%, var(--border))`,
    borderStyle: 'solid',
  };
}

/** GM 專用的人：GM 色的淡斜線（GM 檢視；同室內平面圖的 GM 專用房間） */
const GM_HATCH =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--warning) 22%, transparent) 0 3px, transparent 3px 9px)';

/** 卡片上的 GM 標記（PL 檢視時 null） */
export interface GmMark {
  /** 只有 GM 看得到的人 */
  only: boolean;
  /** 有 GM 筆記或只有 GM 看得到的欄位（右上角的小三角） */
  info: boolean;
}

/** 頭像（null＝沒有頭像那一欄） */
export interface AvatarView {
  bitmap: ImageBitmap | null;
  pos?: FramePlacement;
  /** 沒有頭像時的佔位字 */
  initial: string;
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

/**
 * 一欄文字：空白時是提示（選取中才看得到）；就地編輯中換成輸入欄。
 * editValue：就地編輯時的值（女兒的寫法：卡片寫「女（適 丈夫）」、改的是丈夫的名字）；noField：不能就地編輯。
 */
function FieldText({
  f,
  value,
  selected,
  inline,
  className,
  wide,
  editValue,
  noField,
}: {
  f: InlineField;
  value: string | undefined;
  selected: boolean;
  inline: InlineState | null;
  className?: string;
  wide?: boolean;
  editValue?: string;
  noField?: boolean;
}) {
  const ph = S.placeholders[f];
  if (inline && inline.field === f && !noField)
    return (
      <InlineInput
        value={editValue ?? value ?? ''}
        placeholder={ph}
        state={inline}
        wide={wide}
        label={S.inlineLabel[f]}
      />
    );
  return (
    <span
      data-f={noField ? undefined : f}
      className={cn(
        'rounded-[3px] px-px',
        !value && (selected ? 'opacity-45' : 'invisible'),
        selected && !noField && 'hover:bg-surface-3',
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

function GenderMark({
  female,
  compact,
  left = 6,
}: {
  female: boolean;
  compact?: boolean;
  /** 簡易卡片：左邊的位置（頭像那一欄的右邊） */
  left?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'shrink-0 bg-fg',
        compact ? 'absolute top-1.5 size-1.5' : 'size-2',
        female ? 'rounded-full' : 'rounded-[1.5px]',
      )}
      style={compact ? { left } : undefined}
    />
  );
}

/* ---------- 印記：入（藍）、出（紅）、狀態（歿：深灰、失蹤：琥珀） ---------- */

type SealKind = 'in' | 'out' | 'dead' | 'missing';

const SEAL_STYLE: Record<SealKind, string> = {
  in: 'text-[var(--ft-in)] bg-[var(--ft-in-bg)] border-[color-mix(in_srgb,var(--ft-in)_35%,transparent)]',
  out: 'text-[var(--ft-out)] bg-[var(--ft-out-bg)] border-[color-mix(in_srgb,var(--ft-out)_35%,transparent)]',
  dead: 'text-[var(--ft-dead-fg)] bg-[var(--ft-dead)] border-transparent',
  missing:
    'text-[var(--ft-missing)] bg-[var(--ft-missing-bg)] border-[color-mix(in_srgb,var(--ft-missing)_45%,transparent)] border-dashed',
};

function Seal({ kind, text, compact }: { kind: SealKind; text: string; compact?: boolean }) {
  return (
    <span
      data-seal={kind}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border font-semibold leading-none whitespace-nowrap',
        compact
          ? 'h-[15px] min-w-[15px] rounded-[4px] px-[2px] text-[9.5px]'
          : 'h-[18px] min-w-[18px] rounded-[5px] px-[3px] text-[11px]',
        SEAL_STYLE[kind],
      )}
    >
      {text}
    </span>
  );
}

function sealsOf(t: Pick<MemberText, 'adopted' | 'status'>): { kind: SealKind; text: string }[] {
  const out: { kind: SealKind; text: string }[] = [];
  const st = statusSeal(t.status);
  if (st && t.status) out.push({ kind: t.status, text: st });
  if (t.adopted) out.push({ kind: 'in', text: S.sealIn });
  return out;
}

/* ---------- 頭像 ---------- */

/** 圓形的頭像（沒有圖時名字的第一個字） */
export function AvatarCircle({
  view,
  size,
  className,
  style,
}: {
  view: AvatarView;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { bitmap, pos } = view;
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !bitmap) return;
    const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1) * 1.5);
    el.width = px;
    el.height = px;
    ctx.clearRect(0, 0, px, px);
    drawPlacedCrop(
      ctx,
      bitmap,
      { width: bitmap.width, height: bitmap.height },
      { x: 0, y: 0, width: px, height: px },
      pos ?? DEFAULT_PLACEMENT,
    );
  }, [bitmap, pos, size]);
  return (
    <span
      aria-hidden
      data-avatar={bitmap ? 'image' : 'initial'}
      className={cn(
        'absolute flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 font-semibold text-muted',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ...style }}
    >
      {bitmap ? <canvas ref={canvas} className="size-full" /> : view.initial}
    </span>
  );
}

/* 外框（outline）不放在這裡：`outline-none` 和拖曳時的 `outline-dashed` 同時套用會讓 none 贏（F44），
   所以各卡片自己選一個（成員卡片與「出」字小卡：移動中是虛線、其他沒有；配偶卡片：沒有） */
const cardBase =
  'relative flex cursor-pointer select-none flex-col overflow-hidden border text-fg shadow-1 transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-focus';

/** 拖曳中要移動的卡片：2 px 虛線外框、和卡片隔 3 px（F44，同原作） */
const OUTLINE_MOVING = 'outline-2 outline-offset-3 outline-dashed outline-border-strong';
/** 框選範圍時碰到的卡片（F83） */
const OUTLINE_PICKED = 'outline-2 outline-offset-2 outline-solid outline-[var(--ft-in)]';
const OUTLINE_NONE = 'outline-none';

/** 簡易卡片的圓角 8 px、詳細卡片 10 px（規格 3.2） */
const RADIUS_COMPACT = 'rounded-[8px]';
const RADIUS_FULL = 'rounded-[10px]';

const ringOf = (drop: 'ok' | 'bad' | null | undefined, selected: boolean, solid = false) =>
  drop
    ? drop === 'ok'
      ? 'border-success! shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_35%,transparent)]'
      : 'border-danger!'
    : selected
      ? cn(
          'border-accent! shadow-[0_0_0_1px_var(--accent),var(--shadow-2)]',
          solid && 'border-solid!',
        )
      : 'hover:border-border-strong';

/** 右上角的小三角：有 GM 筆記或 PL 看不到的欄位 */
function SecretCorner() {
  return (
    <span
      aria-hidden
      data-gm-info="1"
      className="pointer-events-none absolute top-0 right-0 size-0 border-t-[11px] border-l-[11px] border-t-[var(--warning)] border-l-transparent"
    />
  );
}

/** GM 專用的人的「GM」小標（畫在卡片外框上，要放在卡片外面的那一層） */
export function GmTag({ left }: { left: number }) {
  return (
    <span
      aria-hidden
      data-gm-only="1"
      className="pointer-events-none absolute -top-[7px] z-[2] rounded-[4px] bg-[var(--warning)] px-1 text-[9px] leading-[14px] font-bold text-[var(--warning-contrast)]"
      style={{ left }}
    >
      {S.gmTag}
    </span>
  );
}

const gmStyle = (gm: GmMark | null | undefined): CSSProperties | undefined =>
  gm?.only ? { backgroundImage: GM_HATCH } : undefined;

export interface MemberCardProps {
  p: Member;
  gen: number;
  dims: Dims;
  look: CardLook;
  memo: boolean;
  text: MemberText;
  cat: Category | null;
  selected: boolean;
  inline: InlineState | null;
  drop?: 'ok' | 'bad' | null;
  ghost?: boolean;
  /** 拖曳中跟著移動（虛線外框） */
  moving?: boolean;
  /** 框選範圍碰到 */
  picked?: boolean;
  /** 頭像那一欄（null／沒給＝沒有） */
  avatar?: AvatarView | null;
  gm?: GmMark | null;
  /** PL 檢視：不能就地編輯（字照樣畫） */
  readOnly?: boolean;
  onKey?: (e: KeyboardEvent<HTMLDivElement>, id: string) => void;
}

export const MemberCard = memo(function MemberCard({
  p,
  gen,
  dims,
  look,
  memo: showMemo,
  text,
  cat,
  selected,
  inline,
  drop,
  ghost,
  moving,
  picked,
  avatar,
  gm,
  readOnly,
  onKey,
}: MemberCardProps) {
  const female = p.gender === 'F';
  const name = p.name || S.unnamed;
  const av = avatar ? AVATAR[look] : null;
  const style: CSSProperties = {
    width: dims.W,
    height: dims.H,
    ...catStyle(cat, 'var(--surface)'),
    ...gmStyle(gm),
  };
  const ring = ringOf(drop, selected);
  const outline = moving ? OUTLINE_MOVING : picked ? OUTLINE_PICKED : OUTLINE_NONE;
  const common = {
    'data-pid': ghost ? undefined : p.id,
    'data-status': p.status && p.status !== 'alive' ? p.status : undefined,
    tabIndex: ghost ? -1 : 0,
    role: ghost ? undefined : 'button',
    'aria-pressed': ghost ? undefined : selected,
    'aria-label': ghost ? undefined : S.cardLabel(name, gen),
    onKeyDown: onKey ? (e: KeyboardEvent<HTMLDivElement>) => onKey(e, p.id) : undefined,
  };
  const dn = text.daughter;
  /* 女兒的寫法：名字、讀音是丈夫的（有丈夫時就地編輯改丈夫的；沒有丈夫時名字不能就地編輯） */
  const nameField = (cls: string, wide?: boolean) => (
    <FieldText
      f="name"
      value={text.name}
      selected={selected}
      inline={readOnly ? null : inline}
      className={cls}
      wide={wide}
      editValue={dn?.husband ? dn.editName : undefined}
      noField={readOnly || (!!dn && !dn.husband)}
    />
  );
  const readingField = (cls: string, wide?: boolean) => (
    <FieldText
      f="reading"
      value={text.reading}
      selected={selected}
      inline={readOnly ? null : inline}
      className={cls}
      wide={wide}
      editValue={dn?.husband ? dn.editReading : undefined}
      noField={readOnly || (!!dn && !dn.husband)}
    />
  );
  const seals = sealsOf(text);
  const extra: ReactNode = (
    <>
      {avatar && av ? (
        <AvatarCircle
          view={avatar}
          size={av.size}
          style={
            look === 'full'
              ? { left: AVATAR.full.left, top: AVATAR.full.top }
              : { left: AVATAR.compact.left, top: (dims.H - AVATAR.compact.size) / 2 }
          }
        />
      ) : null}
      {gm?.info ? <SecretCorner /> : null}
    </>
  );
  if (look === 'compact') {
    return (
      <div
        {...common}
        className={cn(
          cardBase,
          'items-center justify-center bg-surface py-1 text-center',
          RADIUS_COMPACT,
          ring,
          outline,
        )}
        style={{ ...style, paddingLeft: 6 + (av?.extra ?? 0), paddingRight: 6 }}
      >
        <GenderMark female={female} compact left={6 + (av?.extra ?? 0)} />
        {extra}
        {seals.length ? (
          <span className="absolute top-[3px] right-[3px] flex gap-[2px]">
            {seals.map((s) => (
              <Seal key={s.kind} kind={s.kind} text={s.text} compact />
            ))}
          </span>
        ) : null}
        <div className="ft-cl w-full truncate px-1.5 text-[calc(16px*var(--k,1))] leading-tight font-bold">
          {nameField('', true)}
        </div>
        {text.reading || selected || inline?.field === 'reading' ? (
          <div className="ft-cl w-full truncate px-1.5 text-[calc(12.5px*var(--k,1))] leading-tight text-muted">
            {readingField('', true)}
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
            inline={readOnly ? null : inline}
            className="ft-cl w-full justify-center truncate px-1.5 text-[calc(11.5px*var(--k,1))] leading-tight text-muted"
          />
        ) : null}
      </div>
    );
  }
  return (
    <div
      {...common}
      className={cn(cardBase, 'gap-0.5 bg-surface py-2 pr-2.5', RADIUS_FULL, ring, outline)}
      style={{ ...style, paddingLeft: 10 + (av?.extra ?? 0) }}
    >
      {extra}
      <div className="ft-row1 flex min-w-0 items-center gap-[5px]">
        <GenderMark female={female} />
        {nameField(
          'ft-nm min-w-0 shrink truncate text-[calc(14px*var(--k,1))] font-semibold whitespace-nowrap',
        )}
        {readingField(
          'ft-hj min-w-0 flex-1 truncate text-[calc(12px*var(--k,1))] whitespace-nowrap text-muted',
        )}
        {seals.map((s, i) => (
          <span key={s.kind} className={cn('flex', i === 0 && 'ml-auto')}>
            <Seal kind={s.kind} text={s.text} />
          </span>
        ))}
      </div>
      <Years
        p={p}
        selected={selected}
        inline={readOnly ? null : inline}
        className="min-h-4 text-xs text-muted"
      />
      {text.meta ? (
        <div
          data-meta={text.metaIsAlias ? 'alias' : 'note'}
          className={cn(
            'text-[11.5px] text-muted',
            text.metaIsAlias
              ? 'line-clamp-2 leading-[1.3] wrap-anywhere whitespace-pre-line'
              : 'truncate whitespace-nowrap',
          )}
        >
          {text.meta}
        </div>
      ) : null}
      {text.alias ? (
        <div className="line-clamp-1 text-[11.5px] leading-[1.3] wrap-anywhere whitespace-pre-line text-muted">
          {text.alias}
        </div>
      ) : null}
      {showMemo ? (
        <div className="mt-auto line-clamp-2 border-t border-dashed border-border pt-[3px] text-[11.5px] leading-[1.35] opacity-80">
          <FieldText
            f="note"
            value={p.note}
            selected={selected}
            inline={readOnly ? null : inline}
            wide
            noField={readOnly}
          />
        </div>
      ) : null}
    </div>
  );
});

export interface SpouseCardProps {
  s: Spouse;
  /** 名字、讀音、生歿年顯示誰的資料（連結的配偶顯示那位成員） */
  src: Person;
  rel: string;
  linked: boolean;
  hostName: string;
  dims: Dims;
  look: CardLook;
  cat: Category | null;
  selected: boolean;
  inline: InlineState | null;
  drop?: 'ok' | 'bad' | null;
  avatar?: AvatarView | null;
  gm?: GmMark | null;
  readOnly?: boolean;
  onKey?: (e: KeyboardEvent<HTMLDivElement>, id: string) => void;
}

export const SpouseCard = memo(function SpouseCard({
  s,
  src,
  rel,
  linked,
  hostName,
  dims,
  look,
  cat,
  selected,
  inline,
  drop,
  avatar,
  gm,
  readOnly,
  onKey,
}: SpouseCardProps) {
  const ring = ringOf(drop, selected, true);
  const style: CSSProperties = {
    width: dims.SPW,
    height: dims.H,
    ...(linked && !cat
      ? {
          borderStyle: 'solid',
          borderColor: 'color-mix(in srgb, var(--ft-link) 45%, var(--border))',
        }
      : null),
    ...catStyle(cat, 'var(--bg)'),
    ...gmStyle(gm),
  };
  const props = {
    'data-pid': s.id,
    'data-linked': linked ? '1' : undefined,
    'data-status': src.status && src.status !== 'alive' ? src.status : undefined,
    tabIndex: 0,
    role: 'button',
    'aria-pressed': selected,
    'aria-label': S.chipLabel(src.name || S.unnamed, rel, hostName),
    onKeyDown: onKey ? (e: KeyboardEvent<HTMLDivElement>) => onKey(e, s.id) : undefined,
  };
  const relText = (
    <>
      {rel}
      {linked ? (
        <b className="font-semibold text-[var(--ft-link)]">
          {' · '}
          {S.linkedChip}
        </b>
      ) : null}
    </>
  );
  const editable = readOnly ? null : inline;
  const small = avatar ? (
    <AvatarCircle
      view={avatar}
      size={look === 'full' ? 20 : 16}
      style={look === 'full' ? { right: 8, top: 6 } : { right: 4, top: 4 }}
    />
  ) : null;
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
        {small}
        {gm?.info ? <SecretCorner /> : null}
        <div className="text-[10px] leading-tight text-muted">{relText}</div>
        <div className="ft-cl w-full truncate px-1 text-[calc(14px*var(--k,1))] leading-tight font-bold">
          <FieldText
            f="name"
            value={src.name}
            selected={selected}
            inline={editable}
            wide
            noField={readOnly}
          />
        </div>
        <Years
          p={src}
          selected={selected}
          inline={editable}
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
      {small}
      {gm?.info ? <SecretCorner /> : null}
      <div className="flex gap-1 text-[11px] text-muted">{relText}</div>
      <div className="flex min-w-0">
        <FieldText
          f="name"
          value={src.name}
          selected={selected}
          inline={editable}
          className="min-w-0 truncate text-[13px] font-semibold whitespace-nowrap"
          noField={readOnly}
        />
      </div>
      <Years
        p={src}
        selected={selected}
        inline={editable}
        className="min-h-3.5 text-[11px] text-muted"
      />
      <div className="truncate text-[11px] text-muted">
        <FieldText
          f="origin"
          value={s.origin}
          selected={selected}
          inline={editable}
          noField={readOnly}
        />
      </div>
    </div>
  );
});

export interface StubCardProps {
  p: Member;
  name: string;
  meta: string;
  label: string;
  dims: Dims;
  look: CardLook;
  moving?: boolean;
  picked?: boolean;
  ghost?: boolean;
  avatar?: AvatarView | null;
  gm?: GmMark | null;
  onKey?: (e: KeyboardEvent<HTMLDivElement>, id: string) => void;
}

/** 生家那邊的「出」字小卡（F80）：紅色虛線框；點一下移到本人 */
export const StubCard = memo(function StubCard({
  p,
  name,
  meta,
  label,
  dims,
  look,
  moving,
  picked,
  ghost,
  avatar,
  gm,
  onKey,
}: StubCardProps) {
  const av = avatar ? AVATAR[look] : null;
  const style: CSSProperties = {
    width: dims.W,
    height: dims.H,
    borderColor: 'color-mix(in srgb, var(--ft-out) 55%, transparent)',
    backgroundColor: 'var(--ft-out-bg)',
    ...gmStyle(gm),
  };
  const outline = moving ? OUTLINE_MOVING : picked ? OUTLINE_PICKED : OUTLINE_NONE;
  const props = {
    'data-stub': ghost ? undefined : p.id,
    tabIndex: ghost ? -1 : 0,
    role: ghost ? undefined : 'button',
    'aria-label': ghost ? undefined : label,
    onKeyDown: onKey ? (e: KeyboardEvent<HTMLDivElement>) => onKey(e, p.id) : undefined,
  };
  const pic =
    avatar && av ? (
      <AvatarCircle
        view={avatar}
        size={av.size}
        style={
          look === 'full'
            ? { left: AVATAR.full.left, top: AVATAR.full.top }
            : { left: AVATAR.compact.left, top: (dims.H - AVATAR.compact.size) / 2 }
        }
      />
    ) : null;
  if (look === 'compact')
    return (
      <div
        {...props}
        className={cn(
          cardBase,
          'items-center justify-center border-dashed py-1 text-center shadow-none',
          RADIUS_COMPACT,
          outline,
        )}
        style={{ ...style, paddingLeft: 6 + (av?.extra ?? 0), paddingRight: 6 }}
      >
        {pic}
        <span className="absolute top-[3px] right-[3px] flex">
          <Seal kind="out" text={S.sealOut} compact />
        </span>
        <div className="ft-cl w-full truncate px-1.5 text-[calc(16px*var(--k,1))] leading-tight font-bold">
          {name}
        </div>
        <div className="w-full truncate px-1 text-[10.5px] leading-tight text-[var(--ft-out)]">
          {meta}
        </div>
      </div>
    );
  return (
    <div
      {...props}
      className={cn(cardBase, 'gap-1 border-dashed py-2 pr-2.5 shadow-none', RADIUS_FULL, outline)}
      style={{ ...style, paddingLeft: 10 + (av?.extra ?? 0) }}
    >
      {pic}
      <div className="flex min-w-0 items-center gap-[5px]">
        <GenderMark female={p.gender === 'F'} />
        <span className="min-w-0 truncate text-[13.5px] font-semibold whitespace-nowrap">
          {name}
        </span>
        <span className="ml-auto flex">
          <Seal kind="out" text={S.sealOut} />
        </span>
      </div>
      <div className="truncate text-[11.5px] whitespace-nowrap text-[var(--ft-out)]">{meta}</div>
    </div>
  );
});
