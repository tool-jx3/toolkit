/**
 * 文字欄（F030～F044）：每個段落一列，可以直接打字；巢狀的串列（彈出視窗的內容、表格每一格、段落裡的段落）接在下面。
 * 選取（按、Shift、Ctrl、拖過、框選）、拖曳搬移、Enter 分段、Backspace 接合、多段貼上、斜線指令、
 * Tab 放進上一段（不行時縮排）、↑↓ 跨段移動、特殊區塊的標題語欄（第三批）。
 */
import { GripVertical } from 'lucide-react';
import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  memo,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn, Segmented } from '@/ui';
import { atEdge, caretBox, navMove } from './caretNav';
import {
  CELL_SKIP,
  findBlock,
  isOnlyPopup,
  KIDS_SKIP,
  POP_SKIP,
  popIsBlocks,
  TEXT_TYPES,
  typeName,
} from './model/blocks';
import { popupLabel } from './model/doc';
import { type MdSuggestItem, mdSuggest } from './model/md';
import { pimgPage } from './model/pageImg';
import { blockLabel, procName } from './model/proc';
import { applySlash } from './model/rich';
import { tblCols, tblRows } from './model/table';
import { setBlockText } from './model/text';
import type { Block, Doc } from './model/types';
import { hoOf } from './model/vars';
import {
  clearAll,
  clickSelect,
  ensurePopRefs,
  enterAt,
  joinBack,
  type ListRef,
  mdApplySuggest,
  mdHeadFire,
  mdLineFire,
  moveBlocksTo,
  nestSel,
  pasteParagraphs,
  setBlockLabel,
  splitAt,
} from './ops';
import { pageSettingAt } from './render/html';
import { SYS_LABEL } from './render/npc';
import {
  clearSelection,
  doc,
  editBlock,
  focusBlock,
  select,
  selectPimg,
  setUi,
  ui,
  useDoc,
  useUi,
} from './store';
import { S } from './strings';

/* ---------- 文字欄（自動長高） ---------- */

function useAutoHeight(ref: React.RefObject<HTMLTextAreaElement | null>, value: string): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: 文字改變就重新量高度
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [ref, value]);
}

/** 輸入法選字確定後這段時間內的 Enter 不分段 */
const IME_GRACE_MS = 60;

const TYPE_TEXT_CLASS: Partial<Record<string, string>> = {
  title: 'text-lg font-bold',
  cover: 'text-lg font-bold',
  h1: 'text-base font-bold',
  h2: 'text-base font-semibold',
  h3: 'font-semibold',
  subtitle: 'font-medium',
  scene: 'font-semibold',
  note: 'text-muted',
};

/* ---------- 一列 ---------- */

/** 文字欄上方有標題語欄的書式（第三批，上游 v3.24.1；對話文是說話者） */
const LABEL_ROW_TYPES: readonly string[] = ['proc', 'info', 'dialog'];

/** 一列的書式名稱：特殊區塊依樣子（對話文、注釋、情報區塊的樣板時用那個名稱） */
const rowTypeName = (b: Block): string => (b.type === 'proc' ? procName(b) : typeName(b.type));

/** ↑↓ 走到不能打字的段落時：選取它（紙面捲過去） */
const pickRow = (id: string) => select([id]);

interface RowProps {
  b: Block;
  listKey: string;
  index: number;
  depth: number;
  selected: boolean;
  span: boolean;
}

function summaryOf(b: Block, d: Doc): string {
  switch (b.type) {
    case 'npc':
      return `NPC 卡：${SYS_LABEL[b.npc?.sys ?? 'emoklore'] ?? ''}：${String(b.npc?.name ?? '').trim() || '（沒有名字）'}`;
    case 'toc':
      return '目錄';
    case 'table': {
      const t = b.tbl;
      return t
        ? `表格：${String(t.name ?? '').trim() || '（沒有名稱）'}　${tblRows(t)} 列 × ${tblCols(t)} 欄`
        : '表格';
    }
    case 'popup':
      return `彈出視窗：${popupLabel(b)}${isOnlyPopup(b) ? '（不放在紙面）' : ''}`;
    case 'image':
      return '';
    case 'break':
      return '換頁（之後從新的一頁開始）';
    case 'colbr':
      return '換欄（之後從下一欄開始）';
    case 'flow':
      return `流程圖：方框 ${b.flow?.nodes.length ?? 0} 個、線 ${b.flow?.edges.length ?? 0} 條`;
    default:
      void d;
      return '';
  }
}

const Row = memo(function Row({ b, listKey, index, depth, selected, span }: RowProps) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const imeEnd = useRef(0);
  const isText = TEXT_TYPES.includes(b.type);
  const text = String(b.text ?? '');
  useAutoHeight(ta, text);

  /* 聚焦的要求（新段落、分段、接合） */
  const focusReq = useUi((s) => (s.focusReq?.id === b.id && !s.focusReq.field ? s.focusReq : null));
  useEffect(() => {
    if (!focusReq || !ta.current) return;
    const el = ta.current;
    el.focus({ preventScroll: true });
    const at = focusReq.at < 0 ? el.value.length : Math.min(focusReq.at, el.value.length);
    el.setSelectionRange(at, at);
    el.scrollIntoView({ block: 'nearest' });
    /* 用過就清掉：之後重新畫出這一列（例如再打開彈出視窗的編輯）時不會又把焦點搶過去、改掉選取 */
    if (ui().focusReq === focusReq) setUi({ focusReq: null });
  }, [focusReq]);

  /* markdown 的候選（:: 與 #；2026-10，F293） */
  const [sug, setSug] = useState<{ list: MdSuggestItem[]; i: number } | null>(null);
  const sugId = `se-md-${b.id}`;
  const updSug = (el: HTMLTextAreaElement) => {
    if (composing.current || b.type !== 'desc' || el.selectionStart !== el.selectionEnd) {
      setSug(null);
      return;
    }
    const ref = JSON.parse(listKey) as ListRef;
    const r = mdSuggest(
      el.value.slice(0, el.selectionStart),
      ref.k === 'kids' ? KIDS_SKIP : ref.k === 'cell' ? CELL_SKIP : ref.k === 'pop' ? POP_SKIP : [],
    );
    setSug((prev) =>
      r
        ? {
            list: r.list,
            i: Math.max(0, prev ? r.list.indexOf(prev.list[prev.i]) : 0),
          }
        : null,
    );
  };
  const applySug = (el: HTMLTextAreaElement, it: MdSuggestItem) => {
    setSug(null);
    mdApplySuggest(b.id, it, el.value, el.selectionStart);
  };

  const onChange = (el: HTMLTextAreaElement, ev?: ChangeEvent<HTMLTextAreaElement>) => {
    const v = el.value;
    let next = v;
    if (!composing.current) {
      const s = applySlash(v, el.selectionStart);
      if (s) {
        next = s.text;
        /*
         * 斜線指令：當下就把欄位換成記號、游標放好（React 看到欄位的值與原稿相同就不再動它），
         * 不延後寫回，緊接著打的字才不會被蓋掉（F037）。
         */
        el.value = next;
        el.setSelectionRange(s.caret, s.caret);
      } else {
        /* 描述文的開頭打「# 」：變成標題（F290；打的是空白時才換，貼上或輸入法的確定不算） */
        const data = (ev?.nativeEvent as InputEvent | undefined)?.data;
        if ((data === ' ' || data === '　') && mdHeadFire(b.id, v, el.selectionStart)) {
          setSug(null);
          return;
        }
      }
    }
    editBlock(b.id, (x) => setBlockText(x, next));
    updSug(el);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const ime = e.nativeEvent.isComposing || e.keyCode === 229 || composing.current;
    /* 候選清單開著：↑↓ 選擇、Enter／Tab 套用、Esc 關閉 */
    if (sug && !ime && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = sug.list.length;
        setSug({ ...sug, i: (sug.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n });
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        applySug(el, sug.list[sug.i]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSug(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (ime || Date.now() - imeEnd.current < IME_GRACE_MS) return;
      e.preventDefault();
      const a = el.selectionStart;
      const z = el.selectionEnd;
      /* 第一行只有 :::名稱、::名稱、--- 時按 Enter：變成那個書式（F291） */
      if (a === z && mdLineFire(b.id, el.value, a)) return;
      let v = el.value;
      if (z > a) {
        v = v.slice(0, a) + v.slice(z);
        const cut = v;
        editBlock(b.id, (x) => setBlockText(x, cut));
      }
      /* 特殊區塊、裡面有段落、段落裡最後的空段落、「■」那一行（第三批；F300） */
      const how = enterAt(b.id, v, a);
      if (how === 'newline') {
        const nv = `${v.slice(0, a)}\n${v.slice(a)}`;
        el.value = nv;
        el.setSelectionRange(a + 1, a + 1);
        editBlock(b.id, (x) => setBlockText(x, nv));
        return;
      }
      if (how === 'split') splitAt(b.id, a);
      return;
    }
    if (e.key === 'Backspace' && !ime && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (joinBack(b.id)) e.preventDefault();
      return;
    }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (ime) return;
      e.preventDefault();
      if (!ui().sel.includes(b.id)) select([b.id], { scroll: false });
      /* 放進上一段的最後／拿到外面；不行時縮排（F297）。列會換位置：游標放回原處 */
      const caret = el.selectionStart;
      nestSel(e.shiftKey ? -1 : 1);
      focusBlock(b.id, caret);
      return;
    }
    /* ↑↓：最上面、最下面一行時移到上一個、下一個欄位（F309） */
    if (
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      !ime &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const up = e.key === 'ArrowUp';
      if (atEdge(el, up)) {
        const x = caretBox(el, el.selectionStart).x;
        if (navMove(el, up ? -1 : 1, x, pickRow)) e.preventDefault();
      }
      return;
    }
    /* Esc：選取、游標全部取消（F313；上游 v3.24.0） */
    if (e.key === 'Escape' && !ime) {
      e.preventDefault();
      clearAll();
    }
  };

  /* 貼上：當成 markdown 讀（有寫法或分成好幾段時變成段落；F036、F289） */
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const t = e.clipboardData.getData('text/plain');
    if (!t) return;
    const made = pasteParagraphs(b.id, t);
    if (made) e.preventDefault();
  };

  const onFocus = () => {
    const s = ui();
    setUi({ focusId: b.id });
    if (!(s.sel.length === 1 && s.sel[0] === b.id)) select([b.id], { scroll: true });
    const ref = JSON.parse(listKey) as ListRef;
    if (ref.k === 'cell') setUi({ cell: { tbl: ref.id, r: ref.r, c: ref.c } });
  };

  const onBlur = () => {
    if (ui().focusId === b.id) setUi({ focusId: null });
    setSug(null);
    ensurePopRefs(b.id);
  };

  /* 手冊的書式名稱處顯示編號（F252） */
  const ho = b.type === 'handout' ? hoOf(b).no : '';
  const label = ho ? `${typeName(b.type)} ${ho}` : rowTypeName(b);
  const hasLabel = LABEL_ROW_TYPES.includes(b.type);
  return (
    <div
      className={cn(
        'group flex items-start gap-1 rounded-md border px-1 py-1',
        selected ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2',
      )}
      style={{ marginLeft: depth * 14, paddingLeft: 4 + (b.ind ?? 0) * 10 }}
      data-row={b.id}
      data-list={listKey}
      data-index={index}
    >
      <button
        type="button"
        className="mt-0.5 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted hover:bg-surface-3 hover:text-fg"
        aria-label={`選取「${label}」段落（拖曳可以搬移）`}
        data-handle={b.id}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className="mt-0.5 flex w-[4.6rem] shrink-0 flex-col items-start rounded-sm px-1 text-left text-xs leading-tight text-muted hover:text-fg"
        data-label={b.id}
        title="按一下選取；Shift＋按是範圍、Ctrl＋按是加入；往下拖可以一次選取多段"
      >
        <span className={cn('font-semibold', selected && 'text-accent')}>{ho || label}</span>
        {span ? <span className="text-[10px] text-muted">全寬</span> : null}
      </button>
      <div className="relative min-w-0 flex-1">
        {isText ? (
          <>
            {hasLabel ? (
              <LabelField b={b} name={label} onFocus={onFocus} next={() => ta.current} />
            ) : null}
            <textarea
              ref={ta}
              rows={1}
              value={text}
              data-bid={b.id}
              data-nav="t"
              data-navid={b.id}
              aria-label={`${label}的文字`}
              placeholder={S.hints.emptyText}
              spellCheck={false}
              className={cn(
                'block w-full resize-none overflow-hidden rounded-sm border border-transparent bg-transparent px-1.5 py-0.5 text-sm leading-relaxed text-fg placeholder:text-muted focus:border-border-strong focus:bg-surface focus:outline-none',
                TYPE_TEXT_CLASS[b.type],
              )}
              onChange={(e) => onChange(e.currentTarget, e)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onSelect={(e) => {
                if (sug || b.type === 'desc') updSug(e.currentTarget);
              }}
              aria-autocomplete={b.type === 'desc' ? 'list' : undefined}
              aria-controls={sug ? sugId : undefined}
              aria-activedescendant={sug ? `${sugId}-${sug.i}` : undefined}
              onFocus={onFocus}
              onBlur={onBlur}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={(e) => {
                composing.current = false;
                imeEnd.current = Date.now();
                onChange(e.currentTarget);
              }}
            />
            {sug ? (
              <MdSuggestList
                id={sugId}
                list={sug.list}
                cur={sug.i}
                onPick={(it) => {
                  if (ta.current) applySug(ta.current, it);
                }}
              />
            ) : null}
          </>
        ) : b.type === 'image' ? (
          <div
            className="flex items-center gap-2 px-1.5 py-0.5 text-sm"
            data-dbl={b.id}
            data-nav="sel"
            data-navid={b.id}
          >
            {b.img ? (
              <img
                src={b.img}
                alt=""
                className="h-10 w-14 rounded-sm object-contain bg-surface-3"
              />
            ) : (
              <span className="text-muted">（未設定圖片）</span>
            )}
            <span className="min-w-0 truncate">
              {String(b.cap ?? '').trim() || summaryOf(b, doc())}
            </span>
          </div>
        ) : (
          <div
            className="px-1.5 py-0.5 text-sm text-muted"
            data-dbl={b.id}
            data-nav="sel"
            data-navid={b.id}
          >
            {summaryOf(b, doc())}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * 文字欄上方的標題語欄（特殊區塊、情報區塊的標題語；對話文的說話者；第三批，上游 v3.24.1；F311）：
 * Enter 到文字的開頭、↑↓ 移到上一個、下一個欄位、Esc 全部取消；和設定欄的欄位是同一個值。
 */
function LabelField({
  b,
  name,
  onFocus,
  next,
}: {
  b: Block;
  name: string;
  onFocus: () => void;
  next: () => HTMLTextAreaElement | null;
}) {
  const spk = b.type === 'dialog';
  const value = spk ? String(b.sp ?? '') : blockLabel(b);
  const ph = spk || name === '對話文' ? '（沒有說話者）' : '（沒有標題語）';
  return (
    <input
      type="text"
      value={value}
      data-nav="lb"
      data-navid={b.id}
      data-lbl={b.id}
      aria-label={`${name}的${spk ? '說話者' : '標題語'}`}
      placeholder={ph}
      spellCheck={false}
      className="block w-full rounded-sm border border-transparent bg-transparent px-1.5 py-0 text-xs font-bold tracking-wider text-accent placeholder:font-normal placeholder:tracking-normal placeholder:text-muted focus:border-border-strong focus:bg-surface focus:outline-none"
      onFocus={onFocus}
      onChange={(e) => setBlockLabel(b.id, e.target.value)}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const t = next();
          if (t) {
            t.focus();
            t.setSelectionRange(0, 0);
          }
          return;
        }
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
          const x = caretBox(el, el.selectionStart ?? 0).x;
          if (navMove(el, e.key === 'ArrowUp' ? -1 : 1, x, pickRow)) e.preventDefault();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          clearAll();
        }
      }}
    />
  );
}

/* ---------- 串列 ---------- */

interface ListProps {
  list: readonly Block[];
  refKey: ListRef;
  depth: number;
  sel: ReadonlySet<string>;
  d: Doc;
  spanOf: (b: Block) => boolean;
  /** 只顯示這些（以頁為單位時） */
  only?: ReadonlySet<string>;
}

function BlockList({ list, refKey, depth, sel, d, spanOf, only }: ListProps) {
  const key = JSON.stringify(refKey);
  return (
    <>
      {list.map((b, i) =>
        only && !only.has(b.id) ? null : (
          <div key={b.id}>
            <Row
              b={b}
              listKey={key}
              index={i}
              depth={depth}
              selected={sel.has(b.id)}
              span={spanOf(b)}
            />
            <Nested b={b} depth={depth} sel={sel} d={d} spanOf={spanOf} />
          </div>
        ),
      )}
    </>
  );
}

function Nested({
  b,
  depth,
  sel,
  d,
  spanOf,
}: {
  b: Block;
  depth: number;
  sel: ReadonlySet<string>;
  d: Doc;
  spanOf: (b: Block) => boolean;
}) {
  /* 段落裡的段落（第三批）：在強調色的直線裡面；同一條線裡面是同一層 */
  const kids = b.kids?.length ? (
    <div
      className="my-0.5 border-l-2 border-accent pl-1"
      style={{ marginLeft: depth * 14 + 12 }}
      data-kids={b.id}
    >
      <BlockList
        list={b.kids}
        refKey={{ k: 'kids', id: b.id }}
        depth={0}
        sel={sel}
        d={d}
        spanOf={() => false}
      />
    </div>
  ) : null;
  const sub = nestedLists({ b, depth, sel, d, spanOf });
  if (!kids) return sub;
  return (
    <>
      {sub}
      {kids}
    </>
  );
}

function nestedLists({
  b,
  depth,
  sel,
  d,
  spanOf,
}: {
  b: Block;
  depth: number;
  sel: ReadonlySet<string>;
  d: Doc;
  spanOf: (b: Block) => boolean;
}): React.ReactNode {
  if (b.type === 'popup' && popIsBlocks(b)) {
    const ref: ListRef = { k: 'pop', id: b.id };
    const list = b.pop?.blocks ?? [];
    return (
      <div className="my-1 border-l-2 border-border pl-1" style={{ marginLeft: depth * 14 + 12 }}>
        <div
          className="px-1 text-xs text-muted"
          data-droplist={JSON.stringify(ref)}
          data-droplen={list.length}
        >
          彈出視窗「{popupLabel(b)}」的內容
        </div>
        {list.length ? (
          <BlockList list={list} refKey={ref} depth={0} sel={sel} d={d} spanOf={spanOf} />
        ) : (
          <div className="px-2 py-1 text-xs text-muted">{S.hints.emptyPopup}</div>
        )}
      </div>
    );
  }
  if (b.type === 'table' && b.tbl) {
    const t = b.tbl;
    const cells: { r: number; c: number }[] = [];
    for (let r = 0; r < tblRows(t); r++) for (let c = 0; c < tblCols(t); c++) cells.push({ r, c });
    return (
      <div
        className="my-1 border-l-2 border-border pl-1"
        style={{ marginLeft: depth * 14 + 12 }}
        data-tcells={b.id}
      >
        <TableNameRow b={b} />
        {cells.map(({ r, c }) => {
          const ref: ListRef = { k: 'cell', id: b.id, r, c };
          const list = t.cb[`${r},${c}`] ?? [];
          return (
            <div key={`${r},${c}`}>
              <div
                className="px-1 pt-1 text-xs text-muted"
                data-droplist={JSON.stringify(ref)}
                data-droplen={list.length}
              >
                {t.head && r === 0 ? `欄標題 ${c + 1}` : `第 ${r + 1} 列第 ${c + 1} 欄`}
              </div>
              <BlockList list={list} refKey={ref} depth={0} sel={sel} d={d} spanOf={spanOf} />
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}

/** 表格名稱欄（Tab 移到下一個表格欄位） */
function TableNameRow({ b }: { b: Block }) {
  return (
    <label className="flex items-center gap-2 px-1 py-0.5 text-xs text-muted">
      <span className="shrink-0">表格名稱</span>
      <input
        type="text"
        value={String(b.tbl?.name ?? '')}
        data-tname={b.id}
        data-nav="in"
        data-navid={b.id}
        className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-surface-2 px-2 text-sm text-fg"
        onFocus={() => {
          if (!(ui().sel.length === 1 && ui().sel[0] === b.id)) select([b.id]);
        }}
        onKeyDown={(e) => {
          /* ↑↓：上一個、下一個欄位（F309） */
          if (
            (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
            !e.shiftKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.nativeEvent.isComposing
          ) {
            const el = e.currentTarget;
            const x = caretBox(el, el.selectionStart ?? 0).x;
            if (navMove(el, e.key === 'ArrowUp' ? -1 : 1, x, pickRow)) e.preventDefault();
            return;
          }
          /* Tab：移到下一個表格欄位（第一格的文字欄，游標在最後）；Shift＋Tab 照瀏覽器 */
          if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
          if (e.nativeEvent.isComposing) return;
          const next = e.currentTarget
            .closest('[data-tcells]')
            ?.querySelector<HTMLTextAreaElement>('textarea[data-bid]');
          if (!next) return;
          e.preventDefault();
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }}
        onChange={(e) =>
          editBlock(b.id, (x) => {
            if (x.tbl) x.tbl.name = e.target.value;
          })
        }
      />
    </label>
  );
}

/* ---------- 文字欄全體 ---------- */

export function SourcePane({ popupId }: { popupId?: string } = {}) {
  const d = useDoc((s) => s.data);
  const selArr = useUi((s) => s.sel);
  const view = useUi((s) => s.view);
  const layout = useUi((s) => s.layout);
  const reveal = useUi((s) => s.reveal);
  const box = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<{ top: number; left: number; width: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const sel = new Set(selArr);

  const spanOf = (b: Block) => {
    if (b.cols !== 1) return false;
    const p = layout.pageOf[b.id];
    return pageSettingAt(d, p ?? 0).cols === 2;
  };

  /* 文字欄捲到選取的段落（紙面上按的時候） */
  useEffect(() => {
    if (!reveal || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`[data-row="${CSS.escape(reveal.id)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);

  /* ---------- 指標：選取、拖過、框選、拖曳搬移 ---------- */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    const handle = t.closest<HTMLElement>('[data-handle]');
    const label = t.closest<HTMLElement>('[data-label]');
    if (handle) {
      startMove(e, handle.dataset.handle as string);
      return;
    }
    if (label) {
      startSweep(e, label.dataset.label as string);
      return;
    }
    const dbl = t.closest<HTMLElement>('[data-dbl]');
    if (dbl) {
      clickSelect(dbl.dataset.dbl as string, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
      return;
    }
    if (t.closest('[data-row]') || t.closest('input,textarea,button,select,label')) return;
    startMarquee(e);
  };

  const rowsAt = () => [...(box.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];

  function startMove(e: ReactPointerEvent, id: string) {
    const sx = e.clientX;
    const sy = e.clientY;
    let moving = false;
    let target: { ref: ListRef; index: number } | null = null;
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!moving) {
        moving = true;
        if (!ui().sel.includes(id)) select([id], { scroll: false });
      }
      target = dropTarget(ev.clientX, ev.clientY);
      autoScroll(ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrop(null);
      if (!moving) {
        clickSelect(id, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey });
        return;
      }
      if (target) moveBlocksTo(ui().sel.length ? ui().sel : [id], target.ref, target.index);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function dropTarget(x: number, y: number): { ref: ListRef; index: number } | null {
    const root = box.current;
    if (!root) return null;
    const rb = root.getBoundingClientRect();
    /* 空的串列（標題列）也可以放 */
    const heads = [...root.querySelectorAll<HTMLElement>('[data-droplist]')];
    for (const h of heads) {
      const r = h.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom && x >= rb.left && x <= rb.right) {
        setDrop({
          top: r.bottom - rb.top + root.scrollTop,
          left: r.left - rb.left,
          width: r.width,
        });
        return { ref: JSON.parse(h.dataset.droplist as string) as ListRef, index: 0 };
      }
    }
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const el of rowsAt()) {
      const r = el.getBoundingClientRect();
      const dd = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (dd < bestD) {
        bestD = dd;
        best = el;
      }
    }
    if (!best) return null;
    const r = best.getBoundingClientRect();
    const after = y > r.top + r.height / 2;
    setDrop({
      top: (after ? r.bottom : r.top) - rb.top + root.scrollTop,
      left: r.left - rb.left,
      width: r.width,
    });
    return {
      ref: JSON.parse(best.dataset.list as string) as ListRef,
      index: Number(best.dataset.index) + (after ? 1 : 0),
    };
  }

  function autoScroll(y: number) {
    const root = box.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    if (y < r.top + 30) root.scrollTop -= 12;
    else if (y > r.bottom - 30) root.scrollTop += 12;
  }

  /** 在書式名稱上按住往下拖：經過的段落一起選取 */
  function startSweep(e: ReactPointerEvent, id: string) {
    const start = findBlock(doc(), id);
    if (!start) return;
    const mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    let swept = false;
    const move = (ev: PointerEvent) => {
      const el = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>('[data-row]');
      const other = el?.dataset.row;
      if (!other || other === id) return;
      const f = findBlock(doc(), other);
      if (!f || f.list !== start.list) return;
      swept = true;
      const [a, z] = start.i < f.i ? [start.i, f.i] : [f.i, start.i];
      select(
        start.list.slice(a, z + 1).map((b) => b.id),
        { scroll: false, anchor: id },
      );
      autoScroll(ev.clientY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!swept) clickSelect(id, mods);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** 空白處拖曳：框到的段落一起選取（Ctrl 時加入）；沒拖就放開＝取消選取 */
  function startMarquee(e: ReactPointerEvent) {
    const root = box.current;
    if (!root) return;
    const rb = root.getBoundingClientRect();
    const sx = e.clientX - rb.left;
    const sy = e.clientY - rb.top + root.scrollTop;
    const add = e.ctrlKey || e.metaKey;
    const base = add ? ui().sel : [];
    let moved = false;
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - rb.left;
      const y = ev.clientY - rb.top + root.scrollTop;
      if (!moved && Math.hypot(x - sx, y - sy) < 4) return;
      moved = true;
      const m = {
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        w: Math.abs(x - sx),
        h: Math.abs(y - sy),
      };
      setMarquee(m);
      const hit: string[] = [];
      for (const el of rowsAt()) {
        const r = el.getBoundingClientRect();
        const top = r.top - rb.top + root.scrollTop;
        if (top + r.height > m.y && top < m.y + m.h) hit.push(el.dataset.row as string);
      }
      select([...new Set([...base, ...hit])], { scroll: false });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!moved && !add) clearSelection();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('[data-row]');
    const id = row?.dataset.row;
    if (!id || t.closest('textarea,input')) return;
    const b = findBlock(doc(), id)?.b;
    if (!b) return;
    if (b.type === 'popup') setUi({ popEdit: id });
    else if (b.type === 'flow') setUi({ flowEdit: id });
    else if (b.type === 'image')
      setUi({ focusReq: { id, at: -1, n: Date.now(), field: 'cap' }, sideTab: 'block' });
    else if (b.type === 'table') setUi({ tableWide: id });
    else if (b.type === 'npc')
      setUi({ status: { text: S.status.npcHint, tone: 'info', at: Date.now() } });
    else if (b.type === 'toc')
      setUi({ status: { text: S.status.tocHint, tone: 'info', at: Date.now() } });
    else if (b.type === 'break')
      setUi({ status: { text: S.status.breakHint, tone: 'info', at: Date.now() } });
  };

  /* ---------- 以頁為單位（F032） ---------- */
  let content: React.ReactNode;
  const bodyRef: ListRef = { k: 'body' };
  const pop = popupId ? findBlock(d, popupId)?.b : null;
  if (popupId) {
    const list = pop?.pop?.blocks ?? [];
    const ref: ListRef = { k: 'pop', id: popupId };
    content = list.length ? (
      <BlockList list={list} refKey={ref} depth={0} sel={sel} d={d} spanOf={() => false} />
    ) : (
      <div
        className="px-2 py-1 text-sm text-muted"
        data-droplist={JSON.stringify(ref)}
        data-droplen={0}
      >
        {S.hints.emptyPopup}
      </div>
    );
  } else if (view === 'pages') {
    const groups: React.ReactNode[] = [];
    const placed = new Set<string>();
    layout.pages.forEach((ids, i) => {
      const only = new Set(ids);
      for (const id of ids) placed.add(id);
      groups.push(
        // biome-ignore lint/suspicious/noArrayIndexKey: 頁面以頁碼為身分
        <div key={`p${i}`}>
          <div className="sticky top-0 z-[1] mt-2 mb-0.5 rounded-sm bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted">
            P.{i + 1}（{pageSettingAt(d, i).cols === 2 ? '雙欄' : '單欄'}）
          </div>
          <BlockList
            list={d.blocks}
            refKey={bodyRef}
            depth={0}
            sel={sel}
            d={d}
            spanOf={spanOf}
            only={only}
          />
        </div>,
      );
    });
    const rest = new Set(d.blocks.filter((b) => !placed.has(b.id)).map((b) => b.id));
    if (rest.size)
      groups.push(
        <div key="rest">
          <div className="mt-2 mb-0.5 rounded-sm bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted">
            不在紙面上的段落（換頁…）
          </div>
          <BlockList
            list={d.blocks}
            refKey={bodyRef}
            depth={0}
            sel={sel}
            d={d}
            spanOf={spanOf}
            only={rest}
          />
        </div>,
      );
    content = groups;
  } else {
    content = (
      <BlockList list={d.blocks} refKey={bodyRef} depth={0} sel={sel} d={d} spanOf={spanOf} />
    );
  }
  const pimgs = popupId ? [] : (d.pageImgs ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          'flex items-center gap-2 border-b border-border px-2 py-1',
          popupId && 'hidden',
        )}
      >
        <span className="text-xs text-muted">顯示</span>
        <Segmented
          size="sm"
          aria-label="文字欄的顯示方式"
          value={view}
          onValueChange={(v) => setUi({ view: v })}
          options={[
            { value: 'all', label: '全部' },
            { value: 'pages', label: '以頁為單位' },
          ]}
        />
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 框選與拖曳是滑鼠的補充操作；鍵盤用文字欄與按鈕 */}
      <div
        ref={box}
        className="relative min-h-0 flex-1 overflow-auto p-1 pb-16"
        data-testid={popupId ? 'se-popup-source' : 'se-source'}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        {content}
        {pimgs.length ? <PageImgList /> : null}
        {drop ? (
          <div
            className="pointer-events-none absolute z-10 h-[3px] rounded-full bg-accent"
            style={{ top: drop.top - 1, left: drop.left, width: drop.width }}
          />
        ) : null}
        {marquee ? (
          <div
            className="pointer-events-none absolute z-10 border border-accent bg-accent-soft"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ---------- 頁面圖片的清單（2026-10；紙面上也可以點選） ---------- */

function PageImgList() {
  const list = useDoc((s) => s.data.pageImgs ?? []);
  const cur = useUi((s) => s.pimgSel);
  const total = useUi((s) => s.total);
  return (
    <div className="mt-3" data-testid="se-pimg-list">
      <div className="mb-0.5 rounded-sm bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted">
        自由配置的圖片（頁面圖片）
      </div>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {list.map((o) => {
          const on = cur === o.id;
          const cap = String(o.cap ?? '').trim();
          return (
            <li key={o.id}>
              <button
                type="button"
                aria-pressed={on}
                data-pimgrow={o.id}
                onClick={() => selectPimg(o.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-sm',
                  on ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2',
                )}
              >
                <img
                  src={o.img}
                  alt=""
                  className="h-10 w-14 rounded-sm bg-surface-3 object-contain"
                />
                <span className="min-w-0 truncate">
                  P.{pimgPage(o, total) + 1}
                  {cap ? `　${cap}` : '　（沒有說明）'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- markdown 的候選清單（2026-10，上游 v3.16.1；F293） ---------- */

function MdSuggestList({
  id,
  list,
  cur,
  onPick,
}: {
  id: string;
  list: readonly MdSuggestItem[];
  cur: number;
  onPick: (it: MdSuggestItem) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current
      ?.querySelector<HTMLElement>(`[id="${CSS.escape(`${id}-${cur}`)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [id, cur]);
  return (
    <div
      ref={box}
      className="absolute top-full left-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-md border border-border-strong bg-surface p-1 text-sm shadow-2"
      data-testid="se-md-suggest"
    >
      <div id={id} role="listbox" aria-label="段落的書式（markdown）">
        <div aria-hidden className="px-2 py-1 text-xs font-semibold text-muted">
          段落的書式（markdown）
        </div>
        {list.map((it, i) => (
          <div
            key={it.nm}
            id={`${id}-${i}`}
            role="option"
            tabIndex={-1}
            aria-selected={i === cur}
            className={cn(
              'flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1',
              i === cur ? 'bg-accent-soft text-fg' : 'hover:bg-surface-2',
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(it);
            }}
          >
            <span aria-hidden className="w-8 shrink-0 font-mono text-xs text-accent">
              {it.gl}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{it.lb}</span>
              <span className="ml-1 text-xs text-muted">{it.ds}</span>
            </span>
            <span aria-hidden className="shrink-0 font-mono text-xs text-muted">
              {it.cm.trim()}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-2 pt-1 text-xs text-muted">
        ↑↓ 選擇　Enter 套用　Esc 關閉
        <br />
        繼續打字可以縮小範圍（pa、換 等）
      </div>
    </div>
  );
}
