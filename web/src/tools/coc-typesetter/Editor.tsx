/**
 * 內文的文字欄（規格 1.3）：分色顯示、格式按鈕、「/」選單、封面資訊自動讀入、游標與紙面同步、跳到某一行。
 */
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  cn,
  type HighlightLine,
  HighlightTextArea,
  type HighlightTextAreaHandle,
  Kbd,
  useToast,
} from '@/ui';
import { absorbFrontMatter } from './model';
import { updateDoc, useDoc, useUiPrefs } from './store';
import { S } from './strings';
import {
  canOpenSlash,
  classifyLines,
  FORMATS,
  type FormatKey,
  filterFormats,
  type LineClass,
  lineOfPos,
  lineStartPos,
  planFormat,
  slashQuery,
  splitDeco,
} from './syntax';
import { editorApi, previewApi, setView } from './view';

/** 游標停下來多久後同步紙面（毫秒） */
const CARET_SYNC_MS = 120;
/** 失去焦點後多久關閉選單（讓點選項的動作先完成） */
const BLUR_CLOSE_MS = 150;

const fmtDot = (key: FormatKey): CSSProperties =>
  ({ '--dot': `var(--fmt-${key})` }) as CSSProperties;

function lineClass(c: LineClass): string | undefined {
  const out: string[] = [];
  if (c.kind) out.push(`ln-${c.kind}`);
  if (c.inBox) out.push('ln-inbox');
  if (c.box) out.push(`ln-b-${c.box}`);
  return out.length ? out.join(' ') : undefined;
}

function decoContent(text: string): ReactNode {
  const parts = splitDeco(text);
  if (!parts.some((p) => p.kind)) return text;
  return parts.map((p, i) =>
    p.kind ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: 片段的位置就是身分
      <span key={i} className={p.kind === 'skill' ? 'hl-skill' : 'hl-san'}>
        {p.text}
      </span>
    ) : (
      p.text
    ),
  );
}

/** 每一行的上色 */
function highlightLines(text: string): HighlightLine[] {
  const cls = classifyLines(text);
  return text.split('\n').map((l, i) => ({
    className: lineClass(cls[i]),
    content: cls[i].kind === 'code' ? l : decoContent(l),
  }));
}

/* ---------- 格式按鈕 ---------- */

const FormatButtons = memo(function FormatButtons({
  onPick,
}: {
  onPick: (key: FormatKey) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label={S.editor.buttons}
      title={S.editor.buttonsHint}
      className="flex flex-wrap gap-1 border-b border-border px-3 py-2"
    >
      {FORMATS.map((f) => (
        <button
          key={f.key}
          type="button"
          data-format={f.key}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 text-xs text-fg hover:border-border-strong hover:bg-surface-3"
          /* 保留文字欄的選取範圍 */
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(f.key)}
        >
          <span aria-hidden className="fmt-dot" style={fmtDot(f.key)} />
          {f.button}
        </button>
      ))}
    </div>
  );
});

/* ---------- 「/」選單 ---------- */

interface SlashState {
  /** 「/」的位置 */
  pos: number;
  q: string;
  idx: number;
}

export function Editor() {
  const text = useDoc((s) => s.data.text);
  const foldIns = useUiPrefs((s) => s.data.foldIns);
  const toast = useToast();
  const ed = useRef<HighlightTextAreaHandle>(null);
  const menu = useRef<HTMLDivElement>(null);
  const caretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  /** 下一次重畫後要設定的選取範圍（封面資訊讀入後游標回到最前面） */
  const pendingSel = useRef<[number, number] | null>(null);

  const lines = useMemo(() => highlightLines(text), [text]);
  const items = useMemo(() => (slash ? filterFormats(slash.q) : []), [slash]);

  const ta = () => ed.current?.textarea ?? null;

  /* ---------- 選單 ---------- */
  const closeSlash = () => setSlash(null);
  /** 依目前的文字與游標更新選單（該關閉時關閉） */
  const refreshSlash = () => {
    const s = slashRef.current;
    const t = ta();
    if (!s || !t) return;
    const q = slashQuery(t.value, s.pos, t.selectionStart);
    if (q === null) {
      closeSlash();
      return;
    }
    const n = filterFormats(q).length;
    setSlash({ pos: s.pos, q, idx: Math.min(s.idx, Math.max(0, n - 1)) });
  };
  const maybeOpenSlash = () => {
    const t = ta();
    if (!t) return;
    const pos = t.selectionStart - 1;
    if (canOpenSlash(t.value, pos)) setSlash({ pos, q: '', idx: 0 });
  };

  const apply = (key: FormatKey, range?: [number, number]) => {
    const t = ta();
    if (!t || !ed.current) return;
    const plan = planFormat(t.value, key, t.selectionStart, t.selectionEnd, range);
    ed.current.insertText(plan.text, plan.start, plan.end);
    t.setSelectionRange(plan.selStart, plan.selEnd);
    ed.current.revealCaret();
  };
  const choose = (i: number) => {
    const s = slashRef.current;
    const t = ta();
    const f = s ? filterFormats(s.q)[i] : undefined;
    if (!s || !t || !f) return;
    const range: [number, number] = [s.pos, t.selectionStart];
    closeSlash();
    apply(f.key, range);
  };

  /* 選單的位置：「/」的下方，放不下時改到上方，左右不超出文字欄 */
  useLayoutEffect(() => {
    const el = menu.current;
    const h = ed.current;
    if (!slash || !el || !h?.wrapper) return;
    const c = h.caretPoint(slash.pos);
    const wrap = h.wrapper;
    let top = c.y + c.height + 4;
    const left = Math.max(8, Math.min(c.x, wrap.clientWidth - el.offsetWidth - 8));
    if (top + el.offsetHeight > wrap.clientHeight - 8) top = Math.max(8, c.y - el.offsetHeight - 4);
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  });

  /* ---------- 游標與紙面 ---------- */
  const scheduleCaret = () => {
    if (caretTimer.current) clearTimeout(caretTimer.current);
    caretTimer.current = setTimeout(() => {
      const t = ta();
      if (t) previewApi.syncCaret(lineOfPos(t.value, t.selectionStart), true);
    }, CARET_SYNC_MS);
  };

  useLayoutEffect(() => {
    const sel = pendingSel.current;
    const t = ed.current?.textarea;
    if (!sel || !t) return;
    pendingSel.current = null;
    t.setSelectionRange(sel[0], sel[1]);
    t.scrollTop = 0;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在掛載時設定一次（ta 只讀 ref）
  useEffect(() => {
    editorApi.jumpToLine = (n: number) => {
      setView({ pane: 'edit', sub: 'text' });
      /* 分頁切換後（文字欄顯示出來）再捲動 */
      const go = () => {
        const t = ta();
        const h = ed.current;
        if (!t || !h) return;
        const pos = lineStartPos(t.value, n);
        t.focus({ preventScroll: true });
        t.setSelectionRange(pos, pos);
        const el = h.scrollToLine(n, 0.3);
        if (el) {
          el.classList.remove('ln-flash');
          void el.offsetWidth;
          el.classList.add('ln-flash');
        }
        previewApi.syncCaret(n, false);
      };
      requestAnimationFrame(() => requestAnimationFrame(go));
    };
    editorApi.caretLine = () => {
      const t = ta();
      return t ? lineOfPos(t.value, t.selectionStart) : 0;
    };
    editorApi.focused = () => !!ta() && document.activeElement === ta();
    editorApi.scrollTop = () => {
      const t = ta();
      if (t) t.scrollTop = 0;
    };
    return () => {
      if (caretTimer.current) clearTimeout(caretTimer.current);
    };
  }, []);

  /* ---------- 事件 ---------- */
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const t = e.target;
    const value = t.value;
    const fm = absorbFrontMatter(value);
    if (fm) {
      updateDoc((d) => {
        d.text = fm.text;
        d.meta = fm.meta;
      });
      pendingSel.current = [0, 0];
      closeSlash();
      toast({ title: S.toast.absorbed, tone: 'success' });
      return;
    }
    updateDoc((d) => {
      d.text = value;
    });
    const ie = e.nativeEvent as InputEvent;
    if (slashRef.current) refreshSlash();
    else if (ie.inputType?.startsWith('insert') && ie.data && /[/／]$/.test(ie.data))
      maybeOpenSlash();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const s = slashRef.current;
    if (!s || e.nativeEvent.isComposing) return;
    const n = items.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlash({ ...s, idx: (s.idx + 1) % Math.max(1, n) });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlash({ ...s, idx: (s.idx - 1 + Math.max(1, n)) % Math.max(1, n) });
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (n) {
        e.preventDefault();
        choose(s.idx);
      } else closeSlash();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSlash();
    }
  };

  const onCaretMove = () => {
    scheduleCaret();
    if (slashRef.current) refreshSlash();
  };

  const listId = 'coc-slash-menu';
  const activeId = slash && items.length ? `${listId}-${slash.idx}` : undefined;

  return (
    <div className="coc-ed flex h-full min-h-0 flex-col">
      <div className={foldIns ? 'max-lg:hidden' : undefined}>
        <FormatButtons onPick={(k) => apply(k)} />
      </div>
      <HighlightTextArea
        ref={ed}
        value={text}
        lines={lines}
        aria-label={S.editor.label}
        placeholder={S.editor.placeholder}
        data-testid="coc-source"
        className="min-h-0 flex-1"
        aria-controls={slash ? listId : undefined}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        onChange={onChange}
        onKeyDown={onKeyDown}
        onKeyUp={onCaretMove}
        onClick={onCaretMove}
        onCompositionEnd={(e) => {
          if (!slashRef.current && /[/／]$/.test(e.data || '')) setTimeout(maybeOpenSlash, 0);
        }}
        onScroll={() => {
          if (slashRef.current) setSlash({ ...slashRef.current });
        }}
        onBlur={() => setTimeout(closeSlash, BLUR_CLOSE_MS)}
      >
        {slash ? (
          <div
            ref={menu}
            id={listId}
            role="listbox"
            aria-label={S.editor.menu}
            data-testid="coc-slash"
            className="absolute z-10 max-h-[300px] w-[250px] overflow-auto rounded-lg border border-border bg-surface p-1 shadow-2"
          >
            <div aria-hidden className="px-2 pt-1 pb-1.5 text-xs tracking-wider text-muted">
              {S.editor.menu}
            </div>
            {items.length ? (
              items.map((f, i) => (
                <div
                  key={f.key}
                  id={`${listId}-${i}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === slash.idx}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg',
                    i === slash.idx ? 'bg-accent-soft' : 'hover:bg-surface-2',
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(i);
                  }}
                >
                  <span aria-hidden className="fmt-dot" style={fmtDot(f.key)} />
                  {f.label}
                  <small className="ml-auto font-mono text-xs text-muted">{f.hint}</small>
                </div>
              ))
            ) : (
              <div className="px-2 py-1.5 text-sm text-muted">{S.editor.menuEmpty}</div>
            )}
          </div>
        ) : null}
      </HighlightTextArea>
    </div>
  );
}

/** 分頁列右邊的提示：「在行首按 / 開啟格式選單」 */
export function SlashHint() {
  return (
    <span className="text-xs text-muted">
      {S.editor.slashHint} <Kbd>/</Kbd> {S.editor.slashHint2}
    </span>
  );
}

/** 窄畫面：收合格式按鈕 */
export function FoldButtonsToggle() {
  const foldIns = useUiPrefs((s) => s.data.foldIns);
  const patchUi = useUiPrefs((s) => s.patch);
  return (
    <button
      type="button"
      aria-expanded={!foldIns}
      className="rounded-md border border-border px-2 py-0.5 text-xs text-muted hover:text-fg lg:hidden"
      onClick={() => patchUi({ foldIns: !foldIns })}
    >
      {S.editor.foldButtons}
      <span aria-hidden>{foldIns ? ' ▾' : ' ▴'}</span>
    </button>
  );
}
