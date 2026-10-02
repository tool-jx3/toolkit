/**
 * 貼文編輯欄（仿 X 的貼文卡片）：可以直接編輯的文字欄＋字數（X 的簡易計算與上限）＋「複製」「貼到 X」。
 * 團報產生器移植時新增；別的工具要產生貼到社群的文字時共用。
 *
 * - 受控元件：`value`＋`onChange(next, reason)`；reason 分「input」（使用者打字）與「insert」（`insert()` 插入），
 *   工具可以在套用前記一步自己的復原紀錄。
 * - `ref.insert(text)`：在游標位置插入（有選取時取代；欄位沒有焦點時用它最後的選取位置——值被程式換掉後是文字最後面），
 *   插入後焦點回到欄位、游標在插入的文字後面。`ref.focus({ atEnd })`、`ref.copy()`、`ref.post()` 給快捷鍵用。
 * - 複製：原封不動（不去空白）；成功、失敗（全選文字方便手動複製）、空白各有通知。
 * - 貼到 X：去頭尾空白後在新分頁開啟 X 的發文畫面（`xIntentUrl`）；空白時通知、不開分頁。
 * - 字數：預設 `xPostLength`／`X_POST_LIMIT`；超過時顯示「超過 N 字」（危險色、`data-over`）。
 * - 欄位可以上下拖曳調整高度（約 180～720 px）。
 */
import { Copy, Send } from 'lucide-react';
import { type ReactNode, type Ref, useId, useImperativeHandle, useRef } from 'react';
import { copyText } from '@/core/files';
import { X_POST_LIMIT, xIntentUrl, xPostLength } from '@/core/social';
import { Button } from './Button';
import { cn } from './cn';
import { useToast } from './Toast';

export interface PostEditorHandle {
  textarea: HTMLTextAreaElement | null;
  /** 焦點移到欄位；atEnd 時游標放在最後 */
  focus: (options?: { atEnd?: boolean }) => void;
  /** 在游標位置插入文字（取代選取的部分） */
  insert: (text: string) => void;
  /** 等同按「複製」 */
  copy: () => Promise<boolean>;
  /** 等同按「貼到 X」；有開分頁時回傳 true */
  post: () => boolean;
}

export interface PostEditorMessages {
  copied?: string;
  failed?: string;
  failedHint?: string;
  /** 文字是空的時按複製 */
  empty?: string;
  /** 文字是空的時按貼到 X */
  postEmpty?: string;
}

export interface PostEditorProps {
  value: string;
  onChange: (value: string, reason: 'input' | 'insert') => void;
  /** 卡片標題（也是區塊的名稱），預設「貼文預覽」 */
  title?: string;
  /** 文字欄的名稱，預設「貼文內容」 */
  label?: string;
  /** 仿 X 的帳號列（純裝飾）；null 不顯示 */
  account?: { name: string; handle: string } | null;
  /** 帳號列與文字欄之間（例如文字樣式的快速切換列） */
  toolbar?: ReactNode;
  placeholder?: string;
  /** 字數上限（預設 280） */
  limit?: number;
  /** 字數的算法（預設 X 的簡易計算） */
  count?: (text: string) => number;
  /** 不超過上限時的狀態文字（預設「在上限內」） */
  withinLabel?: string;
  /** 超過上限時的狀態文字（預設「超過 N 字」） */
  overLabel?: (over: number) => string;
  copyLabel?: string;
  /** 複製鈕的提示（例如快捷鍵） */
  copyTitle?: string;
  /** 「貼到 X」的文字；null 不顯示這個按鈕 */
  postLabel?: string | null;
  postTitle?: string;
  /** 換掉「貼到 X」的動作（收到去頭尾空白後的文字） */
  onPost?: (text: string) => void;
  messages?: PostEditorMessages;
  /** 字數列右邊的其他按鈕（復原、清除…） */
  actions?: ReactNode;
  /** 卡片下方的說明 */
  hint?: ReactNode;
  /** 文字欄預設的行數（預設 14） */
  rows?: number;
  ref?: Ref<PostEditorHandle>;
  className?: string;
}

const DEFAULT_MESSAGES: Required<PostEditorMessages> = {
  copied: '已複製到剪貼簿',
  failed: '無法寫入剪貼簿',
  failedHint: '文字已全選，請按 Ctrl＋C（Mac 為 ⌘＋C）手動複製。',
  empty: '還沒有內容可以複製',
  postEmpty: '沒有可以發文的內容',
};

export function PostEditor({
  value,
  onChange,
  title = '貼文預覽',
  label = '貼文內容',
  account = { name: '你的帳號', handle: '@your_id' },
  toolbar,
  placeholder,
  limit = X_POST_LIMIT,
  count = xPostLength,
  withinLabel = '在上限內',
  overLabel = (n) => `超過 ${n} 字`,
  copyLabel = '複製',
  copyTitle,
  postLabel = '貼到 X',
  postTitle,
  onPost,
  messages,
  actions,
  hint,
  rows = 14,
  ref,
  className,
}: PostEditorProps) {
  const toast = useToast();
  const msg = { ...DEFAULT_MESSAGES, ...messages };
  const area = useRef<HTMLTextAreaElement>(null);
  /* 最新的值與 onChange（insert／copy 可能在 render 之間被呼叫） */
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const titleId = useId();
  const countId = useId();
  const hintId = useId();

  const n = count(value);
  const over = n - limit;

  const focus = (options?: { atEnd?: boolean }) => {
    const ta = area.current;
    if (!ta) return;
    ta.focus();
    if (options?.atEnd) {
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    }
  };

  const insert = (text: string) => {
    const ta = area.current;
    const current = latest.current.value;
    const len = current.length;
    const start = Math.min(ta?.selectionStart ?? len, len);
    const end = Math.max(start, Math.min(ta?.selectionEnd ?? len, len));
    const next = current.slice(0, start) + text + current.slice(end);
    const caret = start + text.length;
    latest.current.onChange(next, 'insert');
    /* 受控的值換掉後瀏覽器會把游標移到最後：等畫面更新後再把游標放回插入的文字後面 */
    const place = () => {
      const el = area.current;
      if (!el) return;
      el.focus();
      const pos = Math.min(caret, el.value.length);
      el.setSelectionRange(pos, pos);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
    else place();
  };

  const copy = async () => {
    const text = latest.current.value;
    if (!text) {
      toast({ title: msg.empty, tone: 'warning', duration: 2000 });
      return false;
    }
    const ok = await copyText(text);
    if (ok) toast({ title: msg.copied, tone: 'success', duration: 2000 });
    else {
      area.current?.focus();
      area.current?.select();
      toast({ title: msg.failed, description: msg.failedHint, tone: 'danger' });
    }
    return ok;
  };

  const post = () => {
    const text = latest.current.value.trim();
    if (!text) {
      toast({ title: msg.postEmpty, tone: 'warning', duration: 2000 });
      return false;
    }
    if (onPost) onPost(text);
    else window.open(xIntentUrl(text), '_blank', 'noopener,noreferrer');
    return true;
  };

  useImperativeHandle(ref, () => ({
    get textarea() {
      return area.current;
    },
    focus,
    insert,
    copy,
    post,
  }));

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3',
        className,
      )}
      data-testid="post-editor"
    >
      <h2 id={titleId} className="m-0 text-sm font-semibold text-fg">
        {title}
      </h2>
      {account ? (
        <div aria-hidden className="flex min-w-0 items-center gap-2.5">
          <span className="size-9 shrink-0 rounded-full bg-accent-soft" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-fg">{account.name}</span>
            <span className="truncate text-xs text-muted">{account.handle}</span>
          </span>
        </div>
      ) : null}
      {toolbar}
      <textarea
        ref={area}
        value={value}
        rows={rows}
        spellCheck={false}
        aria-label={label}
        aria-describedby={hint ? `${countId} ${hintId}` : countId}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value, 'input')}
        className={cn(
          'block min-h-[180px] w-full max-h-[720px] resize-y rounded-md border border-border-strong bg-surface-2 px-3 py-2',
          'text-[15px] leading-relaxed text-fg transition-colors placeholder:text-muted hover:border-accent',
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          id={countId}
          className="m-0 flex items-baseline gap-2 text-sm tabular-nums"
          data-testid="post-count"
          data-over={over > 0 || undefined}
        >
          <span className={over > 0 ? 'font-semibold text-danger' : 'text-fg'}>
            {n} / {limit}
          </span>
          <span className={over > 0 ? 'text-danger' : 'text-success'} data-testid="post-limit">
            {over > 0 ? overLabel(over) : withinLabel}
          </span>
        </p>
        {actions ? <div className="flex flex-wrap items-center gap-1">{actions}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Copy />} onClick={() => void copy()} title={copyTitle}>
          {copyLabel}
        </Button>
        {postLabel !== null ? (
          <Button variant="secondary" icon={<Send />} onClick={() => post()} title={postTitle}>
            {postLabel}
          </Button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="m-0 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </section>
  );
}
