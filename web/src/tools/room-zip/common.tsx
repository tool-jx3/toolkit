/**
 * 房間 ZIP 產生器的小元件：通知、縮圖、選圖欄（F080、F089）、拖放建立區（F160、F226、F234）、
 * 可空白的數字欄、輸入對話框（取名）。
 */
import { ImageOff, Plus } from 'lucide-react';
import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button, cn, Dialog, TextInput, useToast } from '@/ui';
import type { Tag } from './model';
import { commit, setSession, useBlobs, useProject } from './store';
import { S } from './strings';

/* ---------- 通知（F018：約 4 秒） ---------- */

export type NotifyTone = 'info' | 'success' | 'warning' | 'danger';

export function useNotify() {
  const toast = useToast();
  return useCallback(
    (title: string, tone: NotifyTone = 'info', description?: string) =>
      toast({ title, tone, description, duration: 4000 }),
    [toast],
  );
}

/* ---------- 縮圖 ---------- */

export function useImageUrl(name: string | null | undefined): string | null {
  return useBlobs((s) => (name ? (s.urls[name] ?? s.lib[name] ?? null) : null));
}

export function Thumb({
  name,
  className,
  alt = '',
  fit = 'contain',
}: {
  name: string | null | undefined;
  className?: string;
  alt?: string;
  fit?: 'contain' | 'cover';
}) {
  const url = useImageUrl(name);
  return (
    <span
      className={cn(
        'checker relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border',
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          draggable={false}
          className={cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
        />
      ) : name ? (
        <ImageOff className="size-4 text-muted" aria-hidden />
      ) : null}
    </span>
  );
}

/* ---------- 素材的拖曳（右側面板 → 選圖欄／建立區） ---------- */

export const MATERIAL_MIME = 'application/x-room-zip-material';

export function startMaterialDrag(e: DragEvent, name: string): void {
  e.dataTransfer.setData(MATERIAL_MIME, name);
  e.dataTransfer.setData('text/plain', name);
  e.dataTransfer.effectAllowed = 'copy';
}

const draggedMaterial = (e: DragEvent): boolean =>
  Array.from(e.dataTransfer.types).includes(MATERIAL_MIME);

/* ---------- 選圖欄（F080） ---------- */

export interface ImageFieldProps {
  value: string | null;
  onChange: (name: string | null) => void;
  /** 未選時的說明（例如「無」「之後再選」） */
  empty?: string;
  /** 選圖面板預設只列的用途 */
  useFor?: Tag | null;
  'aria-label': string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}

export function ImageField({
  value,
  onChange,
  empty = S.imgEmpty,
  useFor = null,
  size = 'md',
  disabled,
  className,
  ...rest
}: ImageFieldProps) {
  const label = useProject((s) =>
    value ? (s.data.materials.find((m) => m.name === value)?.label ?? '') : '',
  );
  const [over, setOver] = useState(false);
  const notify = useNotify();
  return (
    <button
      type="button"
      aria-label={rest['aria-label']}
      title={value ? label : empty}
      disabled={disabled}
      data-image-field={value ?? ''}
      onClick={() =>
        setSession({ picker: { current: value, empty, role: useFor, apply: onChange } })
      }
      onDragOver={(e) => {
        if (!draggedMaterial(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const name = e.dataTransfer.getData(MATERIAL_MIME);
        if (!name) return;
        e.preventDefault();
        onChange(name);
        notify(S.dropped, 'success');
      }}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-border-strong bg-surface-2 text-left text-sm text-fg hover:bg-surface-3 focus-visible:focus-ring disabled:opacity-50',
        size === 'sm' ? 'p-1 pr-2' : 'p-1.5 pr-3',
        over && 'border-accent bg-accent-soft',
        className,
      )}
    >
      {value ? (
        <Thumb name={value} className={size === 'sm' ? 'size-8' : 'size-11'} />
      ) : (
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-sm border border-dashed border-border-strong text-muted',
            size === 'sm' ? 'size-8' : 'size-11',
          )}
        >
          <Plus className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 truncate">{value ? label || value.slice(0, 8) : empty}</span>
    </button>
  );
}

/* ---------- 拖放建立區 ---------- */

export function DropCreate({
  onMaterials,
  onFiles,
  label = S.dropCreate,
  testId,
}: {
  onMaterials: (names: string[]) => void;
  onFiles: (files: File[]) => void;
  label?: string;
  testId?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <section
      aria-label={label}
      data-testid={testId}
      onDragOver={(e) => {
        const types = Array.from(e.dataTransfer.types);
        if (!types.includes(MATERIAL_MIME) && !types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const name = e.dataTransfer.getData(MATERIAL_MIME);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (!name && !files.length) return;
        e.preventDefault();
        if (name) onMaterials([name]);
        else onFiles(files);
      }}
      className={cn(
        'rounded-md border-2 border-dashed border-border-strong px-3 py-3 text-center text-xs text-muted',
        over && 'border-accent bg-accent-soft text-fg',
      )}
    >
      {label}
    </section>
  );
}

/* ---------- 可以空白的數字欄 ---------- */

const numText = (v: number | null | undefined) => (v == null ? '' : String(v));

/**
 * 原生數字欄：打字時暫存文字，離開或 Enter 時才呼叫 onCommit（空白＝null；與目前的值相同時不送）。
 * 送出後欄位一律改回實際的值（被夾住、或維持原值時也一樣，F106、F125、F137、F166）；
 * 值從外面變了（例如拖曳）時跟著更新，但聚焦中、還沒送出的欄位不更新（F217）。
 */
export function NumCell({
  value,
  onCommit,
  placeholder,
  step = 1,
  min,
  max,
  disabled,
  className,
  ...rest
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  id?: string;
}) {
  const [text, setText] = useState(numText(value));
  const focused = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  /** 剛送出（Enter 或離開）：下一次同步時就算還聚焦也回寫實際的值 */
  const [sent, setSent] = useState<null | 'enter' | 'blur'>(null);
  /** Enter 送出後回寫了不同的文字：寫完再全選一次 */
  const reselect = useRef(false);
  useEffect(() => {
    if (focused.current && !sent) return;
    if (sent) setSent(null);
    const next = numText(value);
    if (next === text) return;
    if (sent === 'enter') reselect.current = true;
    setText(next);
  }, [value, text, sent]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: text＝回寫的文字已經進到欄位裡
  useLayoutEffect(() => {
    if (!reselect.current) return;
    reselect.current = false;
    const el = input.current;
    if (el && document.activeElement === el) el.select();
  }, [text]);
  const commit = (how: 'enter' | 'blur') => {
    const t = text.trim();
    const n = t ? Number(t) : null;
    if ((n == null || Number.isFinite(n)) && n !== (value ?? null)) onCommit(n);
    setSent(how);
  };
  return (
    <TextInput
      {...rest}
      ref={input}
      type="number"
      inputMode="decimal"
      value={text}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      className={cn(
        /(^|\s)(w-|flex-1)/.test(className ?? '') ? '' : 'w-20',
        'tabular-nums',
        className,
      )}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        commit('blur');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit('enter');
          (e.target as HTMLInputElement).select();
        }
      }}
    />
  );
}

/** 文字欄（打字即生效）：值從外面變了時跟著更新 */
export function LiveText({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  return (
    <TextInput
      {...rest}
      value={value}
      className={className}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------- 輸入對話框 ---------- */

interface PromptState {
  title: string;
  label: string;
  value: string;
  resolve: (v: string | null) => void;
}

/** const ask = usePrompt(); const name = await ask('範本名稱', '名稱', '預設值'); */
export function usePromptDialog(): [
  (title: string, label: string, value?: string) => Promise<string | null>,
  ReactNode,
] {
  const [st, setSt] = useState<PromptState | null>(null);
  /** 開啟時焦點放在輸入框（疊在別的對話框上時也一樣），Enter＝確定 */
  const inputRef = useRef<HTMLInputElement>(null);
  const ask = useCallback(
    (title: string, label: string, value = '') =>
      new Promise<string | null>((resolve) => setSt({ title, label, value, resolve })),
    [],
  );
  const close = (v: string | null) => {
    st?.resolve(v);
    setSt(null);
  };
  const node = st ? (
    <Dialog
      open
      size="sm"
      title={st.title}
      initialFocus={inputRef}
      onOpenChange={(o) => {
        if (!o) close(null);
      }}
      footer={
        <>
          <Button onClick={() => close(null)}>取消</Button>
          <Button variant="primary" onClick={() => close(st.value)}>
            確定
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close(st.value);
        }}
      >
        {/* biome-ignore lint/a11y/noLabelWithoutControl: TextInput 是 input，包在 label 裡就有關聯 */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">{st.label}</span>
          <TextInput
            ref={inputRef}
            value={st.value}
            onChange={(e) => setSt({ ...st, value: e.target.value })}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      </form>
    </Dialog>
  ) : null;
  return [ask, node];
}

/* ---------- 卡片 ---------- */

export function Card({
  title,
  sub,
  actions,
  children,
  className,
  ...rest
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <section
      {...rest}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-1',
        className,
      )}
    >
      {title || actions ? (
        <header className="flex flex-wrap items-center gap-2">
          {title ? <h2 className="m-0 text-base font-semibold">{title}</h2> : null}
          {sub ? <span className="text-xs text-muted">{sub}</span> : null}
          {actions ? <div className="ml-auto flex flex-wrap gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** 一列控制項（自動換行） */
export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>{children}</div>
  );
}

/** 小標籤＋控制項 */
export function Labeled({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: 子元素是 input／button（Select），包在 label 裡就有關聯
    <label className={cn('flex min-w-0 flex-col gap-1 text-xs text-muted', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export const Hint = ({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) => (
  <p {...rest} className={cn('m-0 text-xs text-muted', className)}>
    {children}
  </p>
);

/** 專案名稱（F002）：點了跳出輸入框 */
export function useRenameProject() {
  const [ask, node] = usePromptDialog();
  const n = useNotify();
  const run = async () => {
    const cur = useProject.getState().data.name;
    const v = await ask(S.projectNameTitle, S.projectNameHint, cur);
    if (v == null) return;
    const t = v.trim();
    if (!t) return n(S.projectNameEmpty, 'warning');
    commit((d) => {
      d.name = t;
    });
    n(S.projectRenamed(t), 'success');
  };
  return [run, node] as const;
}
