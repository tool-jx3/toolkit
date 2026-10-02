/**
 * 文字欄（F030～F044）：每個段落一列，可以直接打字；巢狀的串列（彈出視窗的內容、表格每一格）接在下面。
 * 選取（按、Shift、Ctrl、拖過、框選）、拖曳搬移、Enter 分段、Backspace 接合、多段貼上、斜線指令、Tab 縮排。
 */
import { GripVertical } from 'lucide-react';
import {
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
import {
  findBlock,
  isFreeImg,
  isOnlyPopup,
  popIsBlocks,
  TEXT_TYPES,
  typeName,
} from './model/blocks';
import { popupLabel } from './model/doc';
import { applySlash } from './model/rich';
import { tblCols, tblRows } from './model/table';
import { setBlockText } from './model/text';
import type { Block, Doc } from './model/types';
import {
  clickSelect,
  ensurePopRefs,
  indentSel,
  joinBack,
  type ListRef,
  moveBlocksTo,
  pasteParagraphs,
  splitAt,
} from './ops';
import { pageSettingAt } from './render/html';
import { SYS_LABEL } from './render/npc';
import { clearSelection, doc, editBlock, select, setUi, ui, useDoc, useUi } from './store';
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
      return isFreeImg(b) ? `P.${Math.max(1, +(b.pg ?? 1) || 1)}　自由配置` : '';
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
  }, [focusReq]);

  const onChange = (v: string, caret: number) => {
    let next = v;
    let pos = caret;
    if (!composing.current) {
      const s = applySlash(v, caret);
      if (s) {
        next = s.text;
        pos = s.caret;
      }
    }
    editBlock(b.id, (x) => setBlockText(x, next));
    if (next !== v)
      requestAnimationFrame(() => {
        if (ta.current) {
          ta.current.value = next;
          ta.current.setSelectionRange(pos, pos);
        }
      });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const ime = e.nativeEvent.isComposing || e.keyCode === 229 || composing.current;
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (ime || Date.now() - imeEnd.current < IME_GRACE_MS) return;
      e.preventDefault();
      const a = el.selectionStart;
      const z = el.selectionEnd;
      if (z > a) editBlock(b.id, (x) => setBlockText(x, el.value.slice(0, a) + el.value.slice(z)));
      splitAt(b.id, a);
      return;
    }
    if (e.key === 'Backspace' && !ime && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (joinBack(b.id)) e.preventDefault();
      return;
    }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (!ui().sel.includes(b.id)) select([b.id], { scroll: false });
      indentSel(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Escape' && !ime) {
      e.preventDefault();
      el.blur();
      select([b.id], { scroll: false });
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const t = e.clipboardData.getData('text/plain');
    if (!t || !/\n[ \t　]*\n/.test(t.replace(/\r\n?/g, '\n'))) return;
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
    ensurePopRefs(b.id);
  };

  const label = typeName(b.type);
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
        <span className={cn('font-semibold', selected && 'text-accent')}>{label}</span>
        {span ? <span className="text-[10px] text-muted">全寬</span> : null}
      </button>
      <div className="min-w-0 flex-1">
        {isText ? (
          <textarea
            ref={ta}
            rows={1}
            value={text}
            data-bid={b.id}
            aria-label={`${label}的文字`}
            placeholder={S.hints.emptyText}
            spellCheck={false}
            className={cn(
              'block w-full resize-none overflow-hidden rounded-sm border border-transparent bg-transparent px-1.5 py-0.5 text-sm leading-relaxed text-fg placeholder:text-muted focus:border-border-strong focus:bg-surface focus:outline-none',
              TYPE_TEXT_CLASS[b.type],
            )}
            onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={onFocus}
            onBlur={onBlur}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(e) => {
              composing.current = false;
              imeEnd.current = Date.now();
              onChange(e.currentTarget.value, e.currentTarget.selectionStart);
            }}
          />
        ) : b.type === 'image' ? (
          <div className="flex items-center gap-2 px-1.5 py-0.5 text-sm" data-dbl={b.id}>
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
            {isFreeImg(b) && String(b.cap ?? '').trim() ? (
              <span className="text-xs text-muted">{summaryOf(b, doc())}</span>
            ) : null}
          </div>
        ) : (
          <div className="px-1.5 py-0.5 text-sm text-muted" data-dbl={b.id}>
            {summaryOf(b, doc())}
          </div>
        )}
      </div>
    </div>
  );
});

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
      <div className="my-1 border-l-2 border-border pl-1" style={{ marginLeft: depth * 14 + 12 }}>
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
        className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-surface-2 px-2 text-sm text-fg"
        onFocus={() => {
          if (!(ui().sel.length === 1 && ui().sel[0] === b.id)) select([b.id]);
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
            不在紙面上的段落（換頁、自由配置的圖片…）
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
