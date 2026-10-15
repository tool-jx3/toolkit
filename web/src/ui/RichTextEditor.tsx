/**
 * 格式化文字編輯器（完整格式；短文圖片產生器 prose-card 移植時新增）：工具列＋可以直接打字的編輯區。
 * 值是 `@/core/richtext` 的 RichDoc，片段可以有粗體、斜體、刪除線、文字顏色（空字串＝預設字色）、螢光筆、字級、字型，
 * 段落可以有自己的對齊與「從新的一頁開始」（手動分頁）。畫布（core/scene 的 rich 節點）用同一份資料。
 *
 * - 打字用瀏覽器原生的 contentEditable（輸入法、選取照常），每次輸入把畫面讀回 RichDoc（組字中不讀）。
 * - 格式、對齊、分頁、Enter、貼上、拖放都直接改資料再重寫畫面並放回游標（不用 execCommand），所以資料與畫面一致。
 * - 沒有選取時按格式：接下來打的字用這個格式（游標移走就取消）。
 * - Ctrl／⌘＋B 粗體、＋I 斜體、＋Shift＋X 刪除線、＋Enter 分頁；段落開頭按 Backspace 先拿掉分頁。
 * - 底線（speech-bubble 加的）：`toolbar.underline` 打開時才有按鈕與 Ctrl／⌘＋U（沒打開時和以前一樣：Ctrl＋U 不作用）。
 * - 貼上、拖放只取純文字（格式跟著游標前面的字）；拖進來的檔案不處理（交給 WindowDrop 等）。
 * - 復原／重做由工具的 store 負責：瀏覽器的復原（Ctrl＋Z 以外的來源，例如右鍵選單）交給 onHistory；
 *   外部的值改了（復原、讀檔）就重寫畫面，游標放在改變的地方（插入的字後面、刪掉的字的位置）。
 *
 * ```tsx
 * <RichTextEditor value={doc} onChange={setDoc} fontFamily={fontFamilyCss(font)} baseSize={30} displaySize={16}
 *   lineHeight={1.9} color="#1e1a16" background="#f3e8cf" align="left" onHistory={(k) => k === 'undo' ? undo() : redo()}
 *   toolbar={{ fonts, sizes: [18, 24, 30, 40], textSwatches, highlightSwatches }} aria-label="本文" />
 * ```
 */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Eraser,
  Highlighter,
  Italic,
  SeparatorHorizontal,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  applyRichFormat,
  applyStyle,
  insertPageBreak as docInsertPageBreak,
  docLength,
  docText,
  lineAlignIn,
  lineIndexAt,
  lineStartOf,
  type RangeMarks,
  type RichAlign,
  type RichDoc,
  type RichFormat,
  type RichStyle,
  rangeMarks,
  replaceText,
  sameDoc,
  setLineAlign,
  setPageBreak,
  styleAtCaret,
  styleOf,
} from '@/core/richtext';
import { IconButton } from './Button';
import { ColorPicker } from './ColorField';
import { cn } from './cn';
import { FieldScope, useFieldControl } from './Field';
import { domToOffset, offsetToDom } from './RichTextField';
import {
  isCanonicalRichDom,
  type RichDomOptions,
  readRichDomFull,
  writeRichDomFull,
} from './richDom';
import { Select } from './Select';
import { withShortcut } from './shortcuts';

/** 選取範圍的狀態（工具列的按下狀態、工具自己的顯示） */
export interface RichSelectionState {
  start: number;
  end: number;
  /** 選取範圍（沒有選取時是接下來打的字）的格式 */
  marks: RangeMarks;
  /** 段落自己的對齊（null＝跟著整體；選取跨段而且不同時 undefined） */
  align: RichAlign | null | undefined;
  /** 游標所在的段落從新的一頁開始 */
  pageBreak: boolean;
}

export interface RichToolbarOptions {
  /** 選取文字的字型（value＝family）；不給時沒有字型選單 */
  fonts?: readonly { value: string; label: string }[];
  /** 選取文字的字級（px）；不給時沒有字級選單 */
  sizes?: readonly number[];
  /** 文字顏色的常用色 */
  textSwatches?: readonly string[];
  /** 螢光筆的常用色 */
  highlightSwatches?: readonly string[];
  /** 「我的顏色」（文字顏色、螢光筆各一份；給了 onChange 才顯示） */
  textPresets?: readonly string[];
  onTextPresetsChange?: (next: string[]) => void;
  highlightPresets?: readonly string[];
  onHighlightPresetsChange?: (next: string[]) => void;
  /** 分頁按鈕（預設 true） */
  pageBreak?: boolean;
  /** 段落對齊（預設 true） */
  paragraphAlign?: boolean;
  /** 底線按鈕與 Ctrl／⌘＋U（預設 false；speech-bubble 加的） */
  underline?: boolean;
}

export interface RichTextEditorHandle {
  focus: () => void;
  /** 套用格式到選取範圍（沒有選取時：接下來打的字） */
  format: (f: RichFormat) => void;
  /** 選取範圍碰到的段落換成這個對齊（null＝跟著整體） */
  setAlign: (align: RichAlign | null) => void;
  /** 在游標處分頁（游標所在的段落已經從新的一頁開始時，拿掉分頁） */
  togglePageBreak: () => void;
  /** 目前的選取（全文位置） */
  selection: () => { start: number; end: number };
  element: () => HTMLDivElement | null;
}

export interface RichTextEditorProps {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  /** 編輯區的字型（CSS font-family；整段的字型） */
  fontFamily?: string;
  /** 整段的字型名稱（讀回畫面時，和它一樣的字型當成「跟著整段」） */
  baseFont?: string;
  /** 片段字型 → CSS font-family（預設加引號） */
  fontCss?: (family: string) => string;
  /** 整段的字級（px，輸出用的；片段的字級在編輯區以它為比例顯示；預設 16） */
  baseSize?: number;
  /** 編輯區實際的字級（px；預設 16） */
  displaySize?: number;
  /** 行高（倍數；預設 1.7） */
  lineHeight?: number;
  /** 預設字色（顏色是空字串的字） */
  color?: string;
  /** 編輯區的底色（像紙張；預設白色） */
  background?: string;
  /** 整體的對齊 */
  align?: RichAlign;
  /** 字數上限（預設 20,000） */
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  /** 工具列（false 不顯示） */
  toolbar?: RichToolbarOptions | false;
  /** 分頁標記的文字（預設「分頁」） */
  pageBreakLabel?: string;
  /** 編輯區下方的說明 */
  hint?: ReactNode;
  /** 編輯區的最小、最大高度（CSS 長度） */
  minHeight?: string;
  maxHeight?: string;
  onSelectionChange?: (state: RichSelectionState) => void;
  /** 瀏覽器的復原／重做（右鍵選單、編輯選單）：交給工具的 store */
  onHistory?: (kind: 'undo' | 'redo') => void;
  /** 要通知使用者的事（分頁、拿掉分頁、超過字數） */
  onNotice?: (message: string, tone?: 'info' | 'warning') => void;
  onFocus?: () => void;
  onBlur?: () => void;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
  ref?: Ref<RichTextEditorHandle>;
}

/** 介面文字（共用元件，繁中） */
export const RICH_EDITOR_TEXT = {
  bold: '粗體',
  italic: '斜體',
  strike: '刪除線',
  underline: '底線',
  color: '文字顏色',
  colorDefault: '回到預設字色',
  highlight: '螢光筆',
  highlightClear: '拿掉螢光筆',
  clear: '清除格式',
  pageBreak: '分頁（從這裡換到下一頁）',
  pageBreakRemove: '拿掉這裡的分頁',
  pageBreakMark: '分頁',
  pageBreakAdded: '從這裡開始換到下一頁。',
  pageBreakRemoved: '已拿掉分頁。',
  font: '選取文字的字型',
  fontBase: '跟著本文',
  size: '選取文字的字級',
  sizeBase: (n: number) => `本文 ${n} px`,
  mixed: '（多種）',
  paragraph: '段落',
  alignGroup: '選取段落的對齊',
  alignInherit: '跟著整體',
  alignInheritTitle: '跟著整體的對齊',
  align: { left: '靠左', center: '置中', right: '靠右', justify: '左右對齊' } as Record<
    RichAlign,
    string
  >,
  overLimit: (n: number) => `最多可以輸入 ${n.toLocaleString('en-US')} 字。`,
  toolbar: '文字格式',
} as const;

const T = RICH_EDITOR_TEXT;
const BASE = '__base';
const ALIGN_ICONS: Record<RichAlign, ReactNode> = {
  left: <AlignLeft />,
  center: <AlignCenter />,
  right: <AlignRight />,
  justify: <AlignJustify />,
};

interface Sel {
  start: number;
  end: number;
}

/** 新舊全文的差異：改變的地方的結尾（新的全文的位置；用來放復原後的游標） */
export function caretAfterChange(before: string, after: string): number {
  let p = 0;
  const min = Math.min(before.length, after.length);
  while (p < min && before[p] === after[p]) p++;
  let s = 0;
  while (s < min - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  return after.length - s;
}

/** 打進來的字的範圍（新的全文；游標要在插入的字後面），沒有插入時 null */
export function insertedRange(before: string, after: string, caret: number): Sel | null {
  if (after.length <= before.length) return null;
  let p = 0;
  const min = Math.min(before.length, after.length);
  while (p < min && before[p] === after[p]) p++;
  let s = 0;
  while (s < min - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const end = after.length - s;
  if (end <= p || end !== caret) return null;
  return { start: p, end };
}

/** 格式（完整樣子）→ 套用用的格式 */
const styleFormat = (st: RichStyle): RichFormat => ({
  bold: st.bold,
  italic: !!st.italic,
  strike: !!st.strike,
  underline: !!st.underline,
  color: st.color,
  highlight: st.highlight || null,
  size: st.size || null,
  font: st.font || null,
});

const isPlainStyle = (st: RichStyle) =>
  !st.bold &&
  !st.italic &&
  !st.strike &&
  !st.underline &&
  !st.color &&
  !st.highlight &&
  !st.size &&
  !st.font;

export function RichTextEditor({
  value,
  onChange,
  fontFamily,
  baseFont,
  fontCss,
  baseSize = 16,
  displaySize = 16,
  lineHeight = 1.7,
  color = '#363636',
  background = '#ffffff',
  align = 'left',
  maxLength = 20_000,
  placeholder,
  disabled,
  toolbar = {},
  pageBreakLabel = T.pageBreakMark,
  hint,
  minHeight = '12rem',
  maxHeight,
  onSelectionChange,
  onHistory,
  onNotice,
  onFocus,
  onBlur,
  className,
  ref,
  ...rest
}: RichTextEditorProps) {
  const field = useFieldControl(rest);
  const editor = useRef<HTMLDivElement>(null);
  const shown = useRef<RichDoc | null>(null);
  const sel = useRef<Sel>({ start: 0, end: 0 });
  const pending = useRef<RichStyle | null>(null);
  const pendingAt = useRef(-1);
  const composing = useRef(false);
  const [over, setOver] = useState(false);
  const [empty, setEmpty] = useState(() => docLength(value) === 0);
  const [state, setState] = useState<RichSelectionState>(() =>
    computeState(value, { start: 0, end: 0 }),
  );
  const [colorOpen, setColorOpen] = useState<null | 'text' | 'highlight'>(null);
  const noteId = `${field.id}-note`;

  const cb = useRef({ onChange, onSelectionChange, onHistory, onNotice, maxLength });
  cb.current = { onChange, onSelectionChange, onHistory, onNotice, maxLength };
  /* 底線打開了嗎（快捷鍵、beforeinput 用） */
  const underlineOn = useRef(false);
  underlineOn.current = toolbar !== false && !!toolbar.underline;

  const domOpts: RichDomOptions = {
    full: true,
    baseSize,
    displaySize,
    fontCss,
    baseFont,
    pageBreakLabel,
  };
  const optsRef = useRef(domOpts);
  optsRef.current = domOpts;

  function computeState(doc: RichDoc, s: Sel): RichSelectionState {
    let marks = rangeMarks(doc, s.start, s.end);
    const p = pending.current;
    /* 組字中游標跟著組字的字移動，工具列照樣顯示「接下來打的字」的格式 */
    if (p && s.start === s.end && (s.start === pendingAt.current || composing.current))
      marks = {
        bold: p.bold,
        italic: !!p.italic,
        strike: !!p.strike,
        ...(p.underline ? { underline: true } : {}),
        color: p.color,
        highlight: p.highlight ?? '',
        size: p.size ?? 0,
        font: p.font ?? '',
      };
    return {
      start: s.start,
      end: s.end,
      marks,
      align: lineAlignIn(doc, s.start, s.end),
      pageBreak: !!doc.lines[lineIndexAt(doc, s.start)]?.pageBreak,
    };
  }

  const publish = (doc: RichDoc, s: Sel) => {
    const next = computeState(doc, s);
    setState(next);
    cb.current.onSelectionChange?.(next);
  };

  /* 有焦點時被卸載：補一次 onBlur（同 RichTextField） */
  const focused = useRef(false);
  const blurRef = useRef(onBlur);
  blurRef.current = onBlur;
  useEffect(
    () => () => {
      if (!focused.current) return;
      focused.current = false;
      blurRef.current?.();
    },
    [],
  );

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
    try {
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
    } catch {
      return;
    }
    ds.removeAllRanges();
    ds.addRange(r);
  };

  const show = (doc: RichDoc) => {
    if (!editor.current) return;
    writeRichDomFull(editor.current, doc, optsRef.current);
    shown.current = doc;
    setEmpty(docLength(doc) === 0);
  };

  const current = () => shown.current ?? value;

  /** 改了資料：重寫畫面、放回選取、通知 */
  const apply = (doc: RichDoc, s: Sel, refocus = true) => {
    show(doc);
    sel.current = s;
    if (refocus) {
      editor.current?.focus({ preventScroll: true });
      placeSel(s);
    }
    publish(doc, s);
    cb.current.onChange(doc);
  };

  /* 外部的值改了（復原、讀檔、重設）才重寫畫面；游標放在改變的地方 */
  useLayoutEffect(() => {
    if (shown.current === value) return;
    if (shown.current && sameDoc(shown.current, value)) {
      shown.current = value;
      return;
    }
    const root = editor.current;
    if (!root) return;
    const hasFocus = root.ownerDocument.activeElement === root;
    const prev = shown.current;
    show(value);
    pending.current = null;
    const len = docLength(value);
    let s = sel.current;
    if (prev) {
      const a = docText(prev);
      const b = docText(value);
      if (a !== b) {
        const c = caretAfterChange(a, b);
        s = { start: c, end: c };
      }
    }
    s = { start: Math.min(s.start, len), end: Math.min(s.end, len) };
    sel.current = s;
    if (hasFocus) placeSel(s);
    publish(value, s);
  });

  /* 整段字級改了：片段的字級是相對它寫的，重寫畫面 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在比例改變時重寫
  useLayoutEffect(() => {
    const root = editor.current;
    if (!root || !shown.current) return;
    const hasFocus = root.ownerDocument.activeElement === root;
    show(shown.current);
    if (hasFocus) placeSel(sel.current);
  }, [baseSize, displaySize, pageBreakLabel]);

  /*
   * 選取範圍改變：記下位置、更新工具列；游標移走就取消「接下來打的字」的格式
   * （組字中游標跟著組字的字移動，不算移走：組字結束時套到組好的字）
   */
  useEffect(() => {
    const d = editor.current?.ownerDocument;
    if (!d) return;
    const onSel = () => {
      const s = readSel();
      if (!s) return;
      if (
        pending.current &&
        !composing.current &&
        (s.start !== s.end || s.start !== pendingAt.current)
      )
        pending.current = null;
      sel.current = s;
      publish(current(), s);
    };
    d.addEventListener('selectionchange', onSel);
    return () => d.removeEventListener('selectionchange', onSel);
  });

  const commit = () => {
    const root = editor.current;
    if (composing.current || !root) return;
    let doc = readRichDomFull(root, optsRef.current);
    const before = current();
    if (docLength(doc) > cb.current.maxLength) {
      const s = sel.current;
      show(before);
      placeSel({
        start: Math.min(s.start, docLength(before)),
        end: Math.min(s.end, docLength(before)),
      });
      setOver(true);
      cb.current.onNotice?.(T.overLimit(cb.current.maxLength), 'warning');
      return;
    }
    setOver(false);
    const s = readSel();
    let rewrite = !isCanonicalRichDom(root);
    /*
     * 打字不會新增分頁：瀏覽器自己分段（例如組字中按 Enter）時會複製段落的屬性，多出來的分頁拿掉
     * （從後面開始，前一段也是分頁的那一段）。
     */
    const breaks = (d: RichDoc) => d.lines.filter((l) => l.pageBreak).length;
    let extra = breaks(doc) - breaks(before);
    if (extra > 0) {
      const lines = doc.lines.map((l) => ({ ...l }));
      for (let i = lines.length - 1; i > 0 && extra > 0; i--)
        if (lines[i].pageBreak && lines[i - 1].pageBreak) {
          delete lines[i].pageBreak;
          extra--;
        }
      doc = { lines };
      rewrite = true;
    }
    const p = pending.current;
    if (p && s && s.start === s.end) {
      const ins = insertedRange(docText(before), docText(doc), s.start);
      if (ins) {
        doc = applyRichFormat(doc, ins.start, ins.end, styleFormat(p));
        rewrite = true;
        pending.current = null;
      } else if (s.start !== pendingAt.current) pending.current = null;
      /* 沒有打出字、游標也沒動（例如取消組字）：格式留著 */
    }
    if (rewrite) {
      show(doc);
      if (s) placeSel(s);
    } else {
      shown.current = doc;
      setEmpty(docLength(doc) === 0);
    }
    if (s) sel.current = s;
    publish(doc, sel.current);
    cb.current.onChange(doc);
  };

  /** 格式套用到記下的選取範圍（沒有選取：接下來打的字） */
  const format = (f: RichFormat, refocus = true) => {
    const cur = current();
    const s = sel.current;
    if (s.start === s.end) {
      const base = pending.current ?? styleAtCaret(cur, s.start);
      const next = styleOf(
        applyStyle({ ...base, text: '' }, f, {
          bold: !base.bold,
          italic: !base.italic,
          strike: !base.strike,
          underline: !base.underline,
        }),
      );
      pending.current =
        isPlainStyle(next) && isPlainStyle(styleAtCaret(cur, s.start)) ? null : next;
      pendingAt.current = s.start;
      if (refocus) {
        editor.current?.focus({ preventScroll: true });
        placeSel(s);
      }
      publish(cur, s);
      return;
    }
    apply(applyRichFormat(cur, s.start, s.end, f), s, refocus);
  };

  const setAlign = (a: RichAlign | null) => {
    const s = sel.current;
    apply(setLineAlign(current(), s.start, s.end, a), s);
  };

  const togglePageBreak = () => {
    const cur = current();
    const s = sel.current;
    const li = lineIndexAt(cur, s.start);
    if (s.start === s.end && cur.lines[li]?.pageBreak) {
      apply(setPageBreak(cur, li, false), s);
      cb.current.onNotice?.(T.pageBreakRemoved);
      return;
    }
    const r = docInsertPageBreak(cur, s.start, s.end);
    /* 全文最開頭：沒有作用 */
    if (r.doc === cur) return;
    if (docLength(r.doc) > cb.current.maxLength) {
      cb.current.onNotice?.(T.overLimit(cb.current.maxLength), 'warning');
      return;
    }
    pending.current = null;
    apply(r.doc, { start: r.caret, end: r.caret });
    cb.current.onNotice?.(T.pageBreakAdded);
  };

  /** 在選取範圍放一段純文字（Enter、貼上、拖放）；格式跟著游標前面的字 */
  const insertPlain = (text: string, at?: Sel) => {
    const cur = current();
    const s = at ?? readSel() ?? sel.current;
    const st =
      (s.start === pendingAt.current ? pending.current : null) ?? styleAtCaret(cur, s.start);
    const r = replaceText(cur, s.start, s.end, text, st);
    if (docLength(r.doc) > cb.current.maxLength) {
      setOver(true);
      cb.current.onNotice?.(T.overLimit(cb.current.maxLength), 'warning');
      return;
    }
    setOver(false);
    const c = { start: r.caret, end: r.caret };
    /* Enter 之後的空段落：接下來打的字沿用前面的格式 */
    const li = lineIndexAt(r.doc, r.caret);
    const emptyLine = !r.doc.lines[li]?.runs.length;
    pending.current = text.endsWith('\n') && emptyLine && !isPlainStyle(st) ? st : null;
    pendingAt.current = r.caret;
    apply(r.doc, c);
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      editor.current?.focus({ preventScroll: true });
      placeSel(sel.current);
    },
    format: (f) => format(f),
    setAlign,
    togglePageBreak,
    selection: () => ({ ...sel.current }),
    element: () => editor.current,
  }));

  /* 原生的 beforeinput：Enter、瀏覽器的復原、格式的快捷鍵、段落開頭的 Backspace */
  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    const onBeforeInput = (e: InputEvent) => {
      if (e.isComposing || composing.current) return;
      switch (e.inputType) {
        case 'insertParagraph':
        case 'insertLineBreak':
          e.preventDefault();
          insertPlain('\n');
          return;
        case 'historyUndo':
        case 'historyRedo':
          e.preventDefault();
          cb.current.onHistory?.(e.inputType === 'historyUndo' ? 'undo' : 'redo');
          return;
        case 'formatBold':
          e.preventDefault();
          sel.current = readSel() ?? sel.current;
          format({ bold: 'toggle' });
          return;
        case 'formatItalic':
          e.preventDefault();
          sel.current = readSel() ?? sel.current;
          format({ italic: 'toggle' });
          return;
        case 'formatStrikeThrough':
          e.preventDefault();
          sel.current = readSel() ?? sel.current;
          format({ strike: 'toggle' });
          return;
        case 'formatUnderline':
          e.preventDefault();
          if (!underlineOn.current) return;
          sel.current = readSel() ?? sel.current;
          format({ underline: 'toggle' });
          return;
        case 'insertFromPaste':
        case 'insertFromDrop':
          return;
        case 'deleteContentBackward': {
          const s = readSel();
          if (!s || s.start !== s.end) return;
          const cur = current();
          const li = lineIndexAt(cur, s.start);
          if (s.start === lineStartOf(cur, li) && cur.lines[li]?.pageBreak) {
            e.preventDefault();
            apply(setPageBreak(cur, li, false), s);
            cb.current.onNotice?.(T.pageBreakRemoved);
          }
          return;
        }
        default:
          if (e.inputType.startsWith('format')) e.preventDefault();
      }
    };
    root.addEventListener('beforeinput', onBeforeInput);
    return () => root.removeEventListener('beforeinput', onBeforeInput);
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    /* 組字中：Ctrl／⌘ 組合鍵（例如復原）不往外傳，交給輸入法（工具的復原不會在組字中改掉畫面） */
    if (e.nativeEvent.isComposing || composing.current) {
      if (e.ctrlKey || e.metaKey) e.stopPropagation();
      return;
    }
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (e.key === 'Enter') {
      e.preventDefault();
      sel.current = readSel() ?? sel.current;
      togglePageBreak();
      return;
    }
    const pick = (letter: string) => key === letter || e.code === `Key${letter.toUpperCase()}`;
    /* 底線（toolbar.underline 打開時；沒打開時照下面的舊規則：Ctrl＋U 不作用） */
    if (underlineOn.current && !e.shiftKey && pick('u')) {
      e.preventDefault();
      sel.current = readSel() ?? sel.current;
      format({ underline: 'toggle' });
      return;
    }
    if (!e.shiftKey && pick('b')) {
      e.preventDefault();
      sel.current = readSel() ?? sel.current;
      format({ bold: 'toggle' });
    } else if (!e.shiftKey && pick('i')) {
      e.preventDefault();
      sel.current = readSel() ?? sel.current;
      format({ italic: 'toggle' });
    } else if (e.shiftKey && pick('x')) {
      e.preventDefault();
      sel.current = readSel() ?? sel.current;
      format({ strike: 'toggle' });
    } else if (!e.shiftKey && pick('u')) e.preventDefault();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) insertPlain(text);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text || !editor.current) return;
    const d = editor.current.ownerDocument as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    let at: Sel | undefined;
    const range = d.caretRangeFromPoint?.(e.clientX, e.clientY);
    const pos = range
      ? { node: range.startContainer, offset: range.startOffset }
      : (() => {
          const p = d.caretPositionFromPoint?.(e.clientX, e.clientY);
          return p ? { node: p.offsetNode, offset: p.offset } : null;
        })();
    if (pos && editor.current.contains(pos.node)) {
      const o = domToOffset(editor.current, pos.node, pos.offset);
      at = { start: o, end: o };
    }
    insertPlain(text, at);
  };

  /* 工具列 */
  const tb = toolbar === false ? null : toolbar;
  const m = state.marks;
  const keep = (e: { preventDefault: () => void }) => e.preventDefault();
  const saveSel = () => {
    const s = readSel();
    if (s) sel.current = s;
  };
  const refocusSoon = () =>
    setTimeout(() => {
      editor.current?.focus({ preventScroll: true });
      placeSel(sel.current);
    }, 0);
  const textColor = m.color === null ? color : m.color || color;
  const hlColor = m.highlight || tb?.highlightSwatches?.[0] || '#f8e287';

  const markButton = (
    name: 'bold' | 'italic' | 'strike',
    label: string,
    icon: ReactNode,
    combo: string,
  ) => (
    <IconButton
      label={withShortcut(label, combo)}
      icon={icon}
      pressed={m[name]}
      disabled={disabled}
      onPointerDown={keep}
      onClick={() =>
        format(
          name === 'bold'
            ? { bold: 'toggle' }
            : name === 'italic'
              ? { italic: 'toggle' }
              : { strike: 'toggle' },
        )
      }
      data-mark={name}
    />
  );

  const colorButton = (kind: 'text' | 'highlight') => {
    const isText = kind === 'text';
    const swatch = isText ? textColor : m.highlight || 'transparent';
    return (
      <Popover.Root
        open={colorOpen === kind}
        onOpenChange={(o) => {
          setColorOpen(o ? kind : null);
          if (!o) {
            editor.current?.focus({ preventScroll: true });
            placeSel(sel.current);
          }
        }}
      >
        <Popover.Trigger
          disabled={disabled}
          aria-label={isText ? T.color : T.highlight}
          title={isText ? T.color : T.highlight}
          onPointerDown={saveSel}
          data-color-button={kind}
          className="relative inline-flex size-8 items-center justify-center rounded-md text-fg hover:bg-surface-3 disabled:opacity-50 data-[state=open]:bg-accent-soft [&_svg]:size-4"
        >
          {isText ? <Baseline aria-hidden /> : <Highlighter aria-hidden />}
          <span
            aria-hidden
            className="absolute right-1.5 bottom-1 left-1.5 h-1 rounded-sm border border-border-strong"
            style={{ background: swatch }}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            collisionPadding={8}
            className="z-50 flex max-h-[80dvh] flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-2"
            onOpenAutoFocus={(e) => e.preventDefault()}
            aria-label={isText ? T.color : T.highlight}
          >
            <FieldScope>
              <button
                type="button"
                onClick={() => format(isText ? { color: '' } : { highlight: null }, false)}
                className="inline-flex h-7 items-center justify-center gap-1 self-start rounded-md border border-border bg-surface-2 px-2 text-xs text-fg hover:bg-surface-3 [&_svg]:size-3.5"
              >
                <Eraser aria-hidden />
                {isText ? T.colorDefault : T.highlightClear}
              </button>
              <ColorPicker
                value={isText ? textColor : hlColor}
                onChange={(hex) => format(isText ? { color: hex } : { highlight: hex }, false)}
                swatches={(isText ? tb?.textSwatches : tb?.highlightSwatches) ?? undefined}
                eyedropper={false}
                hexInput
                presets={isText ? tb?.textPresets : tb?.highlightPresets}
                onPresetsChange={isText ? tb?.onTextPresetsChange : tb?.onHighlightPresetsChange}
              />
            </FieldScope>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {tb ? (
        <div
          role="toolbar"
          aria-label={`${rest['aria-label'] ?? ''}${T.toolbar}`}
          className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface-2 p-2"
        >
          {tb.fonts || tb.sizes ? (
            <div className="flex min-w-0 gap-2">
              {tb.fonts ? (
                <Select
                  aria-label={T.font}
                  size="sm"
                  className="min-w-0 flex-1"
                  disabled={disabled}
                  value={m.font === null ? '' : m.font || BASE}
                  placeholder={T.mixed}
                  onValueChange={(v) => {
                    format({ font: v === BASE ? null : v }, false);
                    refocusSoon();
                  }}
                  options={[
                    { value: BASE, label: T.fontBase },
                    ...tb.fonts.map((f) => ({ value: f.value, label: f.label })),
                    ...(m.font && !tb.fonts.some((f) => f.value === m.font)
                      ? [{ value: m.font, label: m.font }]
                      : []),
                  ]}
                  data-rich-font=""
                />
              ) : null}
              {tb.sizes ? (
                <Select
                  aria-label={T.size}
                  size="sm"
                  className="w-[7.5rem] shrink-0"
                  disabled={disabled}
                  value={m.size === null ? '' : String(m.size)}
                  placeholder={T.mixed}
                  onValueChange={(v) => {
                    format({ size: Number(v) || null }, false);
                    refocusSoon();
                  }}
                  options={[
                    { value: '0', label: T.sizeBase(baseSize) },
                    ...[...new Set([...tb.sizes, ...(m.size ? [m.size] : [])])]
                      .sort((a, b) => a - b)
                      .map((s) => ({ value: String(s), label: `${s} px` })),
                  ]}
                  data-rich-size=""
                />
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1">
            {markButton('bold', T.bold, <Bold />, 'mod+b')}
            {markButton('italic', T.italic, <Italic />, 'mod+i')}
            {markButton('strike', T.strike, <Strikethrough />, 'shift+mod+x')}
            {tb.underline ? (
              <IconButton
                label={withShortcut(T.underline, 'mod+u')}
                icon={<Underline />}
                pressed={!!m.underline}
                disabled={disabled}
                onPointerDown={keep}
                onClick={() => format({ underline: 'toggle' })}
                data-mark="underline"
              />
            ) : null}
            <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
            {colorButton('text')}
            {colorButton('highlight')}
            <IconButton
              label={T.clear}
              icon={<Eraser />}
              disabled={disabled}
              onPointerDown={keep}
              onClick={() => format({ clear: true })}
              data-rich-clear=""
            />
            {tb.pageBreak !== false ? (
              <>
                <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
                <IconButton
                  label={withShortcut(
                    state.pageBreak && state.start === state.end ? T.pageBreakRemove : T.pageBreak,
                    'mod+enter',
                  )}
                  icon={<SeparatorHorizontal />}
                  pressed={state.pageBreak && state.start === state.end}
                  disabled={disabled}
                  onPointerDown={keep}
                  onClick={togglePageBreak}
                  data-rich-page-break=""
                />
              </>
            ) : null}
          </div>
          {tb.paragraphAlign !== false ? (
            // biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕（不是表單的 fieldset）
            <div
              role="group"
              aria-label={T.alignGroup}
              className="flex flex-wrap items-center gap-1"
            >
              <span aria-hidden className="mr-1 text-xs text-muted">
                {T.paragraph}
              </span>
              <button
                type="button"
                aria-pressed={state.align === null}
                title={T.alignInheritTitle}
                disabled={disabled}
                onPointerDown={keep}
                onClick={() => setAlign(null)}
                className="inline-flex h-8 items-center rounded-md border border-border px-2 text-xs text-fg hover:bg-surface-3 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent disabled:opacity-50"
              >
                {T.alignInherit}
              </button>
              {(Object.keys(ALIGN_ICONS) as RichAlign[]).map((a) => (
                <IconButton
                  key={a}
                  label={T.align[a]}
                  icon={ALIGN_ICONS[a]}
                  pressed={state.align === a}
                  disabled={disabled}
                  onPointerDown={keep}
                  onClick={() => setAlign(a)}
                  data-rich-align={a}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
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
          data-rich-editor="full"
          onInput={(e) => {
            /* 組字中不讀回；不是組字中的輸入一定已經結束組字（瀏覽器漏送 compositionend 時也不會卡住） */
            if ((e.nativeEvent as InputEvent).isComposing) return;
            composing.current = false;
            commit();
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
            commit();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={onDrop}
          onFocus={() => {
            focused.current = true;
            onFocus?.();
          }}
          onBlur={() => {
            focused.current = false;
            composing.current = false;
            onBlur?.();
          }}
          className={cn(
            'tk-rich-editor w-full overflow-y-auto rounded-md border border-border-strong px-3 py-2.5 outline-none',
            'focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-focus',
            !maxHeight && 'resize-y',
            disabled && 'opacity-50',
          )}
          style={{
            fontFamily,
            fontSize: `${displaySize}px`,
            lineHeight,
            color,
            caretColor: color,
            background,
            textAlign: align,
            minHeight,
            maxHeight,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        />
        {empty && placeholder ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2.5 left-3 opacity-50"
            style={{ color, fontSize: `${displaySize}px` }}
          >
            {placeholder}
          </span>
        ) : null}
      </div>
      <p
        id={noteId}
        role="status"
        className={cn('m-0 text-xs empty:hidden', over ? 'text-danger' : 'text-muted')}
      >
        {over ? T.overLimit(maxLength) : hint}
      </p>
    </div>
  );
}
