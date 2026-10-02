/**
 * 分色文字欄（CoC 劇本排版工具移植時新增）：一般的 <textarea>，後面墊一層逐行上色的「上色層」，
 * 看起來像語法上色的編輯器，但輸入、選取、輸入法、瀏覽器的復原都是原生 textarea 的行為。
 *
 * - 文字欄的字是透明的（只看得到游標與選取範圍），看到的是上色層；兩層的字型、字級、行高、內距、換行規則、
 *   捲軸佔的寬度都相同（`scrollbar-gutter: stable`），捲動同步。**上色不可以改字的粗細、字級或字距**（游標會跑掉）。
 * - `lines` 是每一行的上色（行數與 `value.split('\n')` 相同）：`className` 加在該行，`content` 是該行的內容（可以有 <span> 上色）。
 * - `children` 疊在文字欄上面（例如在游標旁邊彈出的選單），座標系與 `caretPoint` 相同。
 *
 * ```tsx
 * const ed = useRef<HighlightTextAreaHandle>(null);
 * const lines = useMemo(() => value.split('\n').map((l) => ({ className: l.startsWith('#') ? 'hl-head' : undefined, content: l })), [value]);
 * <HighlightTextArea ref={ed} value={value} onChange={(e) => setValue(e.target.value)} lines={lines} aria-label="內文" />
 * ed.current?.insertText('## 章名\n', start, end);   // 進入瀏覽器的復原紀錄
 * const { x, y, height } = ed.current!.caretPoint(pos); // 選單放在 (x, y + height)
 * ```
 */
import {
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
  type UIEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { cn } from './cn';

export interface HighlightLine {
  /** 加在這一行的 class（底色、字色、左側色條…；不要改粗細與字級） */
  className?: string;
  /** 這一行的內容（純文字或上色的 <span>）；空白時自動補一個換行保持行高 */
  content?: ReactNode;
}

export interface HighlightTextAreaHandle {
  textarea: HTMLTextAreaElement | null;
  /** 外框（相對定位的容器，children 與 caretPoint 的座標系） */
  wrapper: HTMLDivElement | null;
  /** 某個字元位置的游標座標（px，相對外框、已扣掉捲動） */
  caretPoint: (pos: number) => { x: number; y: number; height: number };
  /**
   * 把 start～end 換成 text：用 `execCommand('insertText')`（會進入瀏覽器的復原紀錄、觸發 input 事件）；
   * 不支援時改用 setRangeText 並補送 input 事件。完成後游標在插入的文字後面，焦點在文字欄。
   */
  insertText: (text: string, start: number, end: number) => void;
  /** 第 n 行（0 起算）的上色層元素 */
  lineElement: (n: number) => HTMLElement | null;
  /** 捲到第 n 行，放在從上方 ratio（0～1）的位置；回傳該行的上色層元素 */
  scrollToLine: (n: number, ratio?: number) => HTMLElement | null;
  /** 游標不在可見範圍（上下各留 margin px）時捲過去，放在從上方 ratio 的位置 */
  revealCaret: (ratio?: number, margin?: number) => void;
}

export interface HighlightTextAreaProps
  extends Omit<ComponentPropsWithRef<'textarea'>, 'value' | 'children' | 'ref' | 'className'> {
  value: string;
  lines: readonly HighlightLine[];
  /** 外框的 class（大小、邊框、圓角） */
  className?: string;
  /** 兩層共用的排版 class（字型、字級、行高、內距）；不給時用預設（14.5 px、行高 1.85、下方多留 40% 視窗高） */
  textClassName?: string;
  /** 上色層的 class（底色、字色） */
  highlightClassName?: string;
  children?: ReactNode;
  ref?: Ref<HighlightTextAreaHandle>;
}

const isEmptyContent = (c: ReactNode): boolean =>
  c === undefined || c === null || c === '' || (Array.isArray(c) && c.length === 0);

/** 兩層共用：排版必須完全相同 */
const LAYER =
  'absolute inset-0 m-0 box-border border-0 whitespace-pre-wrap break-words [overflow-wrap:break-word] [word-break:normal] [tab-size:4] [font-kerning:none] [font-feature-settings:normal] [letter-spacing:0] [scrollbar-gutter:stable]';
const DEFAULT_TEXT =
  'font-ui text-[14.5px] leading-[1.85] pt-[18px] pr-[22px] pb-[40vh] pl-[26px] max-sm:pr-[14px] max-sm:pl-[20px] max-sm:text-[15px]';

export function HighlightTextArea({
  value,
  lines,
  className,
  textClassName = DEFAULT_TEXT,
  highlightClassName,
  children,
  ref,
  onScroll,
  ...rest
}: HighlightTextAreaProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const hl = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);

  const sync = () => {
    if (ta.current && hl.current) hl.current.scrollTop = ta.current.scrollTop;
  };
  /* 內容改變後（上色層重畫）再對齊一次捲動 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 每次上色改變都要對齊
  useLayoutEffect(sync, [lines]);

  const caretPoint = (pos: number) => {
    const t = ta.current;
    const m = mirror.current;
    if (!t || !m) return { x: 0, y: 0, height: 0 };
    m.textContent = t.value.slice(0, pos);
    const mark = document.createElement('span');
    mark.textContent = '|';
    m.appendChild(mark);
    const out = { x: mark.offsetLeft, y: mark.offsetTop - t.scrollTop, height: mark.offsetHeight };
    m.textContent = '';
    return out;
  };

  const lineElement = (n: number) =>
    hl.current?.querySelector<HTMLElement>(`:scope > [data-ln="${n}"]`) ?? null;

  useImperativeHandle(ref, () => ({
    get textarea() {
      return ta.current;
    },
    get wrapper() {
      return wrap.current;
    },
    caretPoint,
    insertText: (text, start, end) => {
      const t = ta.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(start, end);
      let ok = false;
      try {
        ok = document.execCommand('insertText', false, text);
      } catch {
        ok = false;
      }
      if (!ok || t.value.slice(start, start + text.length) !== text) {
        t.setRangeText(text, start, end, 'end');
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    lineElement,
    scrollToLine: (n, ratio = 0.3) => {
      const t = ta.current;
      const el = lineElement(n);
      if (!t || !el) return el;
      t.scrollTop = Math.max(0, el.offsetTop - t.clientHeight * ratio);
      sync();
      return el;
    },
    revealCaret: (ratio = 0.35, margin = 40) => {
      const t = ta.current;
      if (!t) return;
      const c = caretPoint(t.selectionStart);
      if (c.y < 0 || c.y > t.clientHeight - margin) t.scrollTop += c.y - t.clientHeight * ratio;
      sync();
    },
  }));

  return (
    <div ref={wrap} className={cn('relative min-h-0 overflow-hidden', className)}>
      <div
        ref={hl}
        aria-hidden
        data-highlight-layer=""
        className={cn(
          LAYER,
          textClassName,
          'pointer-events-none z-0 overflow-hidden bg-surface text-fg',
          highlightClassName,
        )}
      >
        {lines.map((l, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 行號就是身分
            key={i}
            data-ln={i}
            className={cn('relative', l.className)}
          >
            {isEmptyContent(l.content) ? <br /> : l.content}
          </div>
        ))}
      </div>
      <textarea
        ref={ta}
        value={value}
        spellCheck={false}
        {...rest}
        onScroll={(e: UIEvent<HTMLTextAreaElement>) => {
          sync();
          onScroll?.(e);
        }}
        className={cn(
          LAYER,
          textClassName,
          'z-[1] resize-none overflow-y-auto bg-transparent text-transparent caret-fg outline-none placeholder:text-muted',
          'selection:bg-accent-soft selection:text-transparent',
          'focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]',
        )}
      />
      <div
        ref={mirror}
        aria-hidden
        className={cn(LAYER, textClassName, 'invisible bottom-auto -z-10 overflow-hidden')}
      />
      {children}
    </div>
  );
}
