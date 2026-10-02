/**
 * 格式化文字欄（pair-maker 移植時新增）：可換行的文字欄，選取文字後套用粗體、顏色、回到預設色。
 * 值是 `@/core/richtext` 的 RichDoc（逐行的文字片段），畫布（core/scene 的 rich 節點）與 PDF 用同一份資料。
 *
 * - 打字用瀏覽器原生的 contentEditable（輸入法、選取、瀏覽器的復原照常）；每次輸入把畫面讀回 RichDoc。
 * - 粗體、顏色直接改資料（不是 execCommand），再把畫面重寫一次並放回選取範圍：所以開著調色盤拖曳時也能即時套用。
 * - Ctrl／⌘＋B 粗體；貼上只取純文字（換行保留）；不接受拖放進來的東西；輸入法組字中不更新。
 * - 超過 maxLength 時不接受這次修改（畫面回到修改前），說明列顯示「最多可以輸入 N 字」。
 *
 * ```tsx
 * <Field label="角色性向"><RichTextField value={doc} onChange={setDoc} defaultColor="#363636" maxLength={1000} /></Field>
 * ```
 */
import { Bold, Eraser, Palette } from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  applyRichFormat,
  docLength,
  docText,
  isRangeBold,
  joinDocs,
  plainDoc,
  type RichDoc,
  type RichRun,
  sameDoc,
  sliceDoc,
} from '@/core/richtext';
import { ColorPicker } from './ColorField';
import { cn } from './cn';
import { FieldScope, useFieldControl } from './Field';

/* ---------- DOM ↔ RichDoc ---------- */

const BLOCKS = new Set(['DIV', 'P', 'LI']);

function hexOf(color: string, fallback: string): string {
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c))
    return `#${c
      .slice(1)
      .split('')
      .map((x) => x + x)
      .join('')}`.toLowerCase();
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  return m
    ? `#${m
        .slice(1, 4)
        .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
        .join('')}`
    : fallback;
}

/**
 * 編輯區（或其中一段）的 DOM → RichDoc：文字節點（不換行空白當一般空白）、<br> 是換行、
 * 區塊元素（div、p、li）與相鄰的內容之間換行；只有一個 <br> 的元素是空行。
 * 粗體：<b>、<strong> 或 font-weight ≥ 600；顏色：style 的 color 或 <font color>。
 */
export function readRichDom(root: Node, defaultColor: string): RichDoc {
  type Piece = { text: string; bold: boolean; color: string };
  const walk = (node: Node, style: { bold: boolean; color: string }): Piece[] => {
    if (node.nodeType === 3) return [{ text: (node.nodeValue ?? '').replace(/ /g, ' '), ...style }];
    if (node.nodeType !== 1 && node.nodeType !== 11) return [];
    if (node.nodeName === 'BR') return [{ text: '\n', ...style }];
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') return [];
    const el = node as HTMLElement;
    const weight = el.style?.fontWeight;
    const next = {
      bold: weight
        ? weight === 'bold' || weight === 'bolder' || Number(weight) >= 600
        : style.bold || el.nodeName === 'B' || el.nodeName === 'STRONG',
      color: hexOf(el.style?.color || el.getAttribute?.('color') || '', style.color),
    };
    const kids = [...node.childNodes];
    if (kids.length === 1 && kids[0].nodeName === 'BR' && node.nodeType === 1) return [];
    const out: Piece[] = [];
    let prevBlock = false;
    let seen = false;
    for (const child of kids) {
      const block = BLOCKS.has(child.nodeName);
      if (seen && (block || prevBlock)) out.push({ text: '\n', ...next });
      out.push(...walk(child, next));
      prevBlock = block;
      seen = true;
    }
    return out;
  };
  const lines: { runs: RichRun[] }[] = [{ runs: [] }];
  for (const p of walk(root, { bold: false, color: defaultColor.toLowerCase() })) {
    p.text.split('\n').forEach((t, i) => {
      if (i) lines.push({ runs: [] });
      if (!t) return;
      const runs = lines[lines.length - 1].runs;
      const last = runs.at(-1);
      if (last && last.bold === p.bold && last.color === p.color) last.text += t;
      else runs.push({ text: t, bold: p.bold, color: p.color });
    });
  }
  return { lines };
}

/** RichDoc → 編輯區的 DOM（每行一個 div、每段一個 span；空行放 <br>） */
export function writeRichDom(root: HTMLElement, doc: RichDoc): void {
  const d = root.ownerDocument;
  root.replaceChildren();
  for (const line of doc.lines) {
    const div = d.createElement('div');
    for (const r of line.runs) {
      const span = d.createElement('span');
      span.textContent = r.text;
      span.style.fontWeight = r.bold ? '700' : '400';
      span.style.color = r.color;
      div.append(span);
    }
    if (!div.childNodes.length) div.append(d.createElement('br'));
    root.append(div);
  }
}

/** DOM 位置 → 全文位置（任何結構都可以：讀出開頭到這個位置的內容算字數） */
export function domToOffset(root: HTMLElement, node: Node, offset: number): number {
  const r = root.ownerDocument.createRange();
  r.setStart(root, 0);
  try {
    r.setEnd(node, offset);
  } catch {
    return docLength(readRichDom(root, '#000000'));
  }
  return docText(readRichDom(r.cloneContents(), '#000000')).length;
}

/** 全文位置 → DOM 位置（writeRichDom 寫出的結構） */
export function offsetToDom(root: HTMLElement, offset: number): { node: Node; offset: number } {
  let left = Math.max(0, offset);
  const lines = [...root.childNodes];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const texts: Text[] = [];
    const tw = root.ownerDocument.createTreeWalker(line, 4);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) texts.push(n as Text);
    const len = texts.reduce((s, t) => s + (t.nodeValue?.length ?? 0), 0);
    if (left <= len || i === lines.length - 1) {
      for (const t of texts) {
        const l = t.nodeValue?.length ?? 0;
        if (left <= l) return { node: t, offset: left };
        left -= l;
      }
      return {
        node: line,
        offset: line.childNodes.length && texts.length ? line.childNodes.length : 0,
      };
    }
    left -= len + 1;
  }
  return { node: root, offset: root.childNodes.length };
}

/* ---------- 元件 ---------- */

export interface RichTextFieldProps {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  /** 預設字色（「回到預設色」與新打的字；預設 #363636） */
  defaultColor?: string;
  /** 字數上限（預設 1,000） */
  maxLength?: number;
  /** 固定的行數高度（不給時約 5 行高、可拉高） */
  rows?: number;
  /** 下方的說明（預設「先選取文字，再套用粗體或顏色。（最多 N 字）」） */
  note?: ReactNode;
  /** 超過上限時的說明（預設「最多可以輸入 N 字。」） */
  overLimitNote?: (max: number) => string;
  placeholder?: string;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}

interface Sel {
  start: number;
  end: number;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function RichTextField({
  value,
  onChange,
  defaultColor = '#363636',
  maxLength = 1000,
  rows,
  note,
  overLimitNote = (max) => `最多可以輸入 ${fmt(max)} 字。`,
  placeholder,
  disabled,
  onFocus,
  onBlur,
  className,
  ...rest
}: RichTextFieldProps) {
  const field = useFieldControl(rest);
  const editor = useRef<HTMLDivElement>(null);
  /** 畫面上的內容（最後一次讀到或寫出的） */
  const shown = useRef<RichDoc | null>(null);
  const sel = useRef<Sel>({ start: 0, end: 0 });
  const composing = useRef(false);
  const [over, setOver] = useState(false);
  const [bold, setBold] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorPick, setColorPick] = useState(defaultColor);
  const [empty, setEmpty] = useState(() => docLength(value) === 0);
  const noteId = `${field.id}-note`;

  const readSel = (): Sel | null => {
    const root = editor.current;
    const s = root?.ownerDocument.getSelection();
    if (!root || !s?.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    const a = domToOffset(root, r.startContainer, r.startOffset);
    const b = domToOffset(root, r.endContainer, r.endOffset);
    return { start: Math.min(a, b), end: Math.max(a, b) };
  };

  const placeSel = (s: Sel) => {
    const root = editor.current;
    const ds = root?.ownerDocument.getSelection();
    if (!root || !ds) return;
    const a = offsetToDom(root, s.start);
    const b = offsetToDom(root, s.end);
    const r = root.ownerDocument.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    ds.removeAllRanges();
    ds.addRange(r);
  };

  const show = (doc: RichDoc) => {
    if (!editor.current) return;
    writeRichDom(editor.current, doc);
    shown.current = doc;
    setEmpty(docLength(doc) === 0);
  };

  /* 外部的值改了（復原、自動分頁、清空預設文字…）才重寫畫面 */
  useLayoutEffect(() => {
    if (shown.current && sameDoc(shown.current, value)) return;
    const focused = editor.current?.ownerDocument.activeElement === editor.current;
    const keep = sel.current;
    show(value);
    if (focused) {
      const len = docLength(value);
      placeSel({ start: Math.min(keep.start, len), end: Math.min(keep.end, len) });
    }
  });

  /* 選取範圍改變：記下位置、更新粗體按鈕 */
  useEffect(() => {
    const d = editor.current?.ownerDocument;
    if (!d) return;
    const onSel = () => {
      const s = readSel();
      if (!s) return;
      sel.current = s;
      if (shown.current) setBold(isRangeBold(shown.current, s.start, s.end));
    };
    d.addEventListener('selectionchange', onSel);
    return () => d.removeEventListener('selectionchange', onSel);
  });

  const commit = () => {
    if (composing.current || !editor.current) return;
    const doc = readRichDom(editor.current, defaultColor);
    if (docLength(doc) > maxLength) {
      const back = shown.current ?? value;
      const s = sel.current;
      show(back);
      placeSel({
        start: Math.min(s.start, docLength(back)),
        end: Math.min(s.end, docLength(back)),
      });
      setOver(true);
      return;
    }
    setOver(false);
    shown.current = doc;
    setEmpty(docLength(doc) === 0);
    const s = readSel();
    if (s) sel.current = s;
    onChange(doc);
  };

  /** 套用格式到記下的選取範圍（改資料、重寫畫面、放回選取） */
  const format = (f: { bold?: 'toggle'; color?: string }, refocus = true) => {
    const cur = shown.current ?? value;
    const s = sel.current;
    if (s.start === s.end) return;
    const next = applyRichFormat(cur, s.start, s.end, f);
    show(next);
    if (refocus) {
      editor.current?.focus({ preventScroll: true });
      placeSel(s);
    }
    if (f.bold) setBold(isRangeBold(next, s.start, s.end));
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      const s = readSel();
      if (s) sel.current = s;
      format({ bold: 'toggle' });
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (!text) return;
    const d = editor.current?.ownerDocument;
    if (d?.queryCommandSupported?.('insertText') && d.execCommand('insertText', false, text))
      return;
    /* 不支援 insertText 時直接改資料 */
    const cur = shown.current ?? value;
    const s = readSel() ?? sel.current;
    const next = joinDocs(
      joinDocs(sliceDoc(cur, 0, s.start), plainDoc(text, defaultColor)),
      sliceDoc(cur, s.end),
    );
    if (docLength(next) > maxLength) {
      setOver(true);
      return;
    }
    show(next);
    const at = s.start + text.length;
    placeSel({ start: at, end: at });
    sel.current = { start: at, end: at };
    onChange(next);
  };

  const height = rows ? `calc(${rows} * 1.6em + 1rem)` : undefined;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div
        role="toolbar"
        aria-label={`${rest['aria-label'] ?? ''}文字格式`}
        className="flex flex-wrap items-center gap-1.5"
      >
        <button
          type="button"
          disabled={disabled}
          aria-pressed={bold}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => format({ bold: 'toggle' })}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs font-bold text-fg hover:bg-surface-3 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent disabled:opacity-50 [&_svg]:size-3.5"
        >
          <Bold aria-hidden />
          粗體
        </button>
        <Popover.Root
          open={colorOpen}
          onOpenChange={(o) => {
            setColorOpen(o);
            if (!o) {
              editor.current?.focus({ preventScroll: true });
              placeSel(sel.current);
            }
          }}
        >
          <Popover.Trigger
            disabled={disabled}
            onPointerDown={() => {
              const s = readSel();
              if (s) sel.current = s;
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs text-fg hover:bg-surface-3 disabled:opacity-50 [&_svg]:size-3.5"
          >
            <Palette aria-hidden />
            顏色
            <span
              aria-hidden
              className="inline-block size-3 rounded-sm border border-border-strong"
              style={{ background: colorPick }}
            />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              align="start"
              className="z-50 rounded-lg border border-border bg-surface p-3 shadow-2"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <FieldScope>
                <ColorPicker
                  value={colorPick}
                  onChange={(hex) => {
                    setColorPick(hex);
                    format({ color: hex }, false);
                  }}
                  eyedropper={false}
                />
              </FieldScope>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            setColorPick(defaultColor);
            format({ color: defaultColor });
          }}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs text-fg hover:bg-surface-3 disabled:opacity-50 [&_svg]:size-3.5"
        >
          <Eraser aria-hidden />
          預設色
        </button>
      </div>
      <div className="relative">
        {/* biome-ignore lint/a11y/useSemanticElements: 可以套用格式的文字欄只能用 contentEditable */}
        <div
          ref={editor}
          id={field.id}
          role="textbox"
          tabIndex={disabled ? -1 : 0}
          aria-multiline="true"
          aria-label={rest['aria-label']}
          aria-labelledby={rest['aria-label'] ? undefined : field['aria-labelledby']}
          aria-describedby={[field['aria-describedby'], noteId].filter(Boolean).join(' ')}
          aria-disabled={disabled || undefined}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck={false}
          data-rich-editor=""
          onInput={commit}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
            commit();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={(e) => e.preventDefault()}
          onFocus={onFocus}
          onBlur={onBlur}
          className={cn(
            /* 白底：字的顏色就是輸出的顏色（深色主題也看得清楚） */
            'w-full overflow-y-auto rounded-md border border-border-strong bg-[#ffffff] px-2.5 py-2 text-sm leading-[1.6] text-[#363636] caret-[#202020] outline-none',
            'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus',
            rows ? '' : 'min-h-[8.5rem] resize-y',
            disabled && 'opacity-50',
          )}
          style={{ height, minHeight: height, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
        />
        {empty && placeholder ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2 left-2.5 text-sm text-[#8a8a8a]"
          >
            {placeholder}
          </span>
        ) : null}
      </div>
      <p
        id={noteId}
        role="status"
        className={cn('m-0 text-xs', over ? 'text-danger' : 'text-muted')}
      >
        {over
          ? overLimitNote(maxLength)
          : (note ?? `先選取文字，再套用粗體或顏色。（最多 ${fmt(maxLength)} 字）`)}
      </p>
    </div>
  );
}
