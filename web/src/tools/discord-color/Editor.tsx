/**
 * 編輯區：contentEditable（打字、選取、輸入法都是瀏覽器原生的），外觀是 Discord 的程式碼區塊（依預覽主題）。
 *
 * - 畫面上的 DOM 就是格式樹（dom.ts）：每次輸入讀回格式樹交給工具；外部的值改了（復原、開啟專案檔）才重寫畫面。
 * - 打字時瀏覽器加進來的其他標記（`<font>`、`<b>`…）讀回時拿掉、畫面重寫成乾淨的結構，游標留在原本的字數位置。
 * - 套用格式：用目前在編輯區裡的選取範圍；焦點離開編輯區（例如去改自訂色）時用最後一次的選取範圍，
 *   並用 CSS 標示（瀏覽器支援 Highlight API 時）讓人知道會套用到哪裡。
 * - Enter 換行（插入換行，不是新段落）；Ctrl／⌘＋Z、Ctrl／⌘＋Shift＋Z、Ctrl／⌘＋Y 用工具的復原／重做；
 *   Ctrl／⌘＋B、I、U 套用粗體、斜體、底線；貼上時從本工具複製的文字保留格式，其他只留文字。
 */
import {
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { cn } from '@/ui';
import type { AnsiNode } from './ansi';
import {
  applyEffect,
  canonicalHtml,
  type Format,
  insertNodes,
  nodesFromClipboard,
  rangeAt,
  rangeInside,
  rangeOffsets,
  readNodes,
  selectedNodes,
  type TextRange,
  wrapSelection,
  writeEditor,
} from './dom';
import { type EffectColors, type EffectId, THEMES, type ThemeId } from './palette';

export interface EditorHandle {
  /** 套用格式；編輯區裡沒有選取範圍時回傳 false */
  format(f: Format): boolean;
  /** 套用效果；編輯區裡沒有選取範圍時回傳 false */
  effect(effect: EffectId, colors: EffectColors, fg: boolean): boolean;
}

export interface EditorProps {
  doc: AnsiNode[];
  theme: ThemeId;
  /** 打字、貼上、刪除（連續的變更合併成一步復原） */
  onType: (doc: AnsiNode[]) => void;
  /** 套用格式、效果（一次一步） */
  onFormat: (doc: AnsiNode[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Ctrl／⌘＋B、I、U 對應的代碼（1、3、4） */
  shortcutCodes?: Partial<Record<'b' | 'i' | 'u', number>>;
  /** 編輯區下方右側的字數 */
  counter?: ReactNode;
  'aria-label': string;
  'aria-describedby'?: string;
  ref?: Ref<EditorHandle>;
}

const SAVED_HIGHLIGHT = 'dc-saved-selection';

/** 編輯區的樣式（原作的 ANSI 類別＋Discord 程式碼區塊；顏色由外層的 CSS 變數決定） */
const EDITOR_CSS = `
[data-dc-editor]{white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;font-family:var(--font-mono);font-size:.875rem;line-height:1.125rem;tab-size:4}
[data-dc-editor] .ansi-0{font-weight:initial;font-style:initial;text-decoration:initial;color:initial;background:initial}
[data-dc-editor] .ansi-1{font-weight:700}
[data-dc-editor] .ansi-3{font-style:italic}
[data-dc-editor] .ansi-4{text-decoration:underline}
[data-dc-editor] .ansi-9{text-decoration:line-through}
${[0, 1, 2, 3, 4, 5, 6, 7]
  .map(
    (i) =>
      `[data-dc-editor] .ansi-3${i}{color:var(--dc-ansi-${i})}[data-dc-editor] .ansi-4${i}{background-color:var(--dc-ansi-${i})}`,
  )
  .join('\n')}
[data-dc-editor] ::selection,[data-dc-editor]::selection{background:var(--dc-sel);text-shadow:1px 1px 0 var(--dc-sel-shadow)}
[data-dc-editor] ::highlight(${SAVED_HIGHLIGHT}),[data-dc-editor]::highlight(${SAVED_HIGHLIGHT}){background-color:var(--dc-sel)}
`;

/** 預覽主題 → 外層的 CSS 變數 */
export function themeStyle(id: ThemeId): CSSProperties {
  const t = THEMES[id];
  const vars: Record<string, string> = {
    '--dc-base': t.base,
    '--dc-code': t.code,
    '--dc-border': t.border,
    '--dc-text': t.text,
    '--dc-sel': t.light ? '#0006' : '#FFF6',
    '--dc-sel-shadow': t.light ? '#FFF' : '#000',
    colorScheme: t.light ? 'light' : 'dark',
  };
  t.ansi.forEach((c, i) => {
    vars[`--dc-ansi-${i}`] = c;
  });
  return vars as CSSProperties;
}

type Highlights = Map<string, unknown>;
const highlights = (): Highlights | null =>
  (globalThis.CSS as unknown as { highlights?: Highlights } | undefined)?.highlights ?? null;
const HighlightCtor = (): (new (r: Range) => unknown) | null =>
  (globalThis as unknown as { Highlight?: new (r: Range) => unknown }).Highlight ?? null;

export function Editor({
  doc,
  theme,
  onType,
  onFormat,
  onUndo,
  onRedo,
  shortcutCodes = { b: 1, i: 3, u: 4 },
  counter,
  ref,
  ...aria
}: EditorProps) {
  const root = useRef<HTMLDivElement>(null);
  /** 畫面上的格式樹（最後一次讀到或寫出的） */
  const shown = useRef<AnsiNode[] | null>(null);
  /** 最後一次在編輯區裡的選取範圍（會跟著 DOM 的變動移動） */
  const saved = useRef<Range | null>(null);
  const composing = useRef(false);

  const liveRange = (): Range | null => {
    const el = root.current;
    const sel = el?.ownerDocument.getSelection();
    if (!el || !sel?.rangeCount) return null;
    const r = sel.getRangeAt(0);
    return rangeInside(el, r) ? r : null;
  };

  const showSaved = () => {
    const hl = highlights();
    const H = HighlightCtor();
    if (!hl || !H) return;
    const r = saved.current;
    if (r && !r.collapsed && !liveRange()) hl.set(SAVED_HIGHLIGHT, new H(r));
    else hl.delete(SAVED_HIGHLIGHT);
  };

  /** 整個重寫畫面；有焦點或記著選取範圍時，依字數放回去 */
  const rewrite = (nodes: AnsiNode[]) => {
    const el = root.current;
    if (!el) return;
    const live = liveRange();
    const keep: TextRange | null = live
      ? rangeOffsets(el, live)
      : saved.current && rangeInside(el, saved.current)
        ? rangeOffsets(el, saved.current)
        : null;
    writeEditor(el, nodes);
    shown.current = nodes;
    if (!keep) {
      saved.current = null;
      showSaved();
      return;
    }
    const r = rangeAt(el, keep);
    saved.current = r.cloneRange();
    if (live) {
      const sel = el.ownerDocument.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    showSaved();
  };

  /* 外部的值改了（復原、開啟專案檔、重設）才重寫畫面 */
  useLayoutEffect(() => {
    if (shown.current === doc) return;
    rewrite(doc);
  });

  /* 記住最後一次在編輯區裡的選取範圍 */
  useEffect(() => {
    const d = root.current?.ownerDocument;
    if (!d) return;
    const onSel = () => {
      const r = liveRange();
      if (r) saved.current = r.cloneRange();
      showSaved();
    };
    d.addEventListener('selectionchange', onSel);
    return () => {
      d.removeEventListener('selectionchange', onSel);
      highlights()?.delete(SAVED_HIGHLIGHT);
    };
  });

  /** 讀回畫面；混進別的標記時重寫成乾淨的結構 */
  const read = (): AnsiNode[] => {
    const el = root.current as HTMLDivElement;
    const nodes = readNodes(el);
    if (el.innerHTML !== canonicalHtml(el.ownerDocument, nodes)) rewrite(nodes);
    shown.current = nodes;
    return nodes;
  };

  /** 取得要套用的選取範圍（放回瀏覽器的選取） */
  const targetSelection = (): Selection | null => {
    const el = root.current;
    const sel = el?.ownerDocument.getSelection();
    if (!el || !sel) return null;
    if (liveRange()) return sel;
    const r = saved.current;
    if (!r || !rangeInside(el, r)) return null;
    sel.removeAllRanges();
    sel.addRange(r);
    return sel;
  };

  const applyFormat = (f: Format): boolean => {
    const sel = targetSelection();
    if (!sel) return false;
    wrapSelection(sel, f);
    onFormat(read());
    return true;
  };

  useImperativeHandle(ref, () => ({
    format: applyFormat,
    effect: (effect, colors, fg) => {
      const sel = targetSelection();
      if (!sel) return false;
      applyEffect(sel, effect, colors, fg);
      onFormat(read());
      return true;
    },
  }));

  const onInput = () => {
    if (composing.current) return;
    onType(read());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (e.key === 'Enter' && !mod && !e.altKey) {
      /* 換行（插入換行字元，不是新段落；和原作相同） */
      e.preventDefault();
      e.currentTarget.ownerDocument.execCommand('insertLineBreak');
      return;
    }
    if (!mod || e.altKey) return;
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo();
    } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
      e.preventDefault();
      onRedo();
    } else if (!e.shiftKey && (key === 'b' || key === 'i' || key === 'u')) {
      const c = shortcutCodes[key];
      if (c === undefined) return;
      e.preventDefault();
      applyFormat({ type: 'code', code: c });
    }
  };

  /* 瀏覽器選單的復原／重做、格式指令也交給工具（React 的 onBeforeInput 不是原生的 beforeinput，要自己掛） */
  const latest = useRef({ onUndo, onRedo, applyFormat, shortcutCodes });
  latest.current = { onUndo, onRedo, applyFormat, shortcutCodes };
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => {
      const type = e.inputType ?? '';
      const h = latest.current;
      if (type === 'historyUndo' || type === 'historyRedo') {
        e.preventDefault();
        if (type === 'historyUndo') h.onUndo();
        else h.onRedo();
        return;
      }
      if (!type.startsWith('format')) return;
      e.preventDefault();
      const c = {
        formatBold: h.shortcutCodes.b,
        formatItalic: h.shortcutCodes.i,
        formatUnderline: h.shortcutCodes.u,
      }[type];
      if (c !== undefined) h.applyFormat({ type: 'code', code: c });
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, []);

  /** 複製、剪下：剪貼簿放本工具的結構（貼回編輯區時保留格式）與純文字 */
  const onCopy = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const el = root.current;
    const r = liveRange();
    const sel = el?.ownerDocument.getSelection();
    if (!el || !r || !sel || r.collapsed) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', sel.toString());
    e.clipboardData.setData('text/html', canonicalHtml(el.ownerDocument, selectedNodes(el, r)));
    if (cut) el.ownerDocument.execCommand('delete');
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const nodes = nodesFromClipboard(
      e.clipboardData.getData('text/html'),
      e.clipboardData.getData('text/plain'),
    );
    const sel = targetSelection();
    if (!sel || !nodes.length) return;
    insertNodes(sel, nodes);
    onType(read());
  };

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg p-3"
      style={{ ...themeStyle(theme), background: 'var(--dc-base)', color: 'var(--dc-text)' }}
      data-testid="dc-preview"
      data-theme-preview={theme}
    >
      <style>{EDITOR_CSS}</style>
      {/* biome-ignore lint/a11y/useSemanticElements: 可以套用格式的文字欄只能用 contentEditable */}
      <div
        ref={root}
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-dc-editor=""
        data-testid="dc-editor"
        onInput={onInput}
        onCopy={(e) => onCopy(e, false)}
        onCut={(e) => onCopy(e, true)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          onType(read());
        }}
        className={cn(
          'min-h-[200px] w-full resize-y overflow-auto rounded-[4px] border p-2 outline-none',
          'focus-visible:ring-2 focus-visible:ring-focus',
        )}
        style={{
          background: 'var(--dc-code)',
          borderColor: 'var(--dc-border)',
          color: 'var(--dc-text)',
        }}
      />
      {counter}
    </div>
  );
}
