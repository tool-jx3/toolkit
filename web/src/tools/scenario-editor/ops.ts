/**
 * 原稿的操作（書式按鈕、段落操作、文字欄的分段與接合、彈出視窗、頁面…）。規格 1.2～1.5、1.9。
 * 都經過 store 的 edit()（一次修改＝復原紀錄的一步，0.7 秒內的連續修改合成一步）。
 */
import { bridge } from './bridge';
import { pickImage } from './images';
import {
  allBlocks,
  blockLists,
  CELL_SKIP,
  cellOwnerOf,
  type Found,
  findBlock,
  isFreeImg,
  newBlock,
  ownsList,
  POP_SKIP,
  popOwnerOf,
  TEXT_TYPES,
  typeName,
} from './model/blocks';
import { blocksPlainText } from './model/count';
import {
  ensurePopup,
  makeBlock,
  newPopup,
  popupByLabel,
  popupLabel,
  prepareType,
  renewIds,
} from './model/doc';
import { applyBxTpl } from './model/proc';
import { guessType, popRefNames, RICH_TYPES, renamePopRefsIn } from './model/rich';
import { cellBlocks, cellKey, tblCols, tblRows } from './model/table';
import { blockComments, blockMarks, setBlockText, tidyMarks } from './model/text';
import type { Block, BlockType, Comment, Doc, Mark, PageSetting } from './model/types';
import {
  type CellTarget,
  clearSelection,
  doc,
  edit,
  focusBlock,
  say,
  select,
  setUi,
  ui,
  useDoc,
} from './store';
import { S } from './strings';

/* ---------- 串列 ---------- */

export type ListRef =
  | { k: 'body' }
  | { k: 'pop'; id: string }
  | { k: 'cell'; id: string; r: number; c: number };

export function listOf(d: Doc, ref: ListRef, make = false): Block[] | null {
  if (ref.k === 'body') return d.blocks;
  const b = findBlock(d, ref.id)?.b;
  if (!b) return null;
  if (ref.k === 'pop') return Array.isArray(b.pop?.blocks) ? b.pop.blocks : null;
  if (!b.tbl) return null;
  if (make) return cellBlocks(b.tbl, ref.r, ref.c, true);
  return b.tbl.cb[cellKey(ref.r, ref.c)] ?? null;
}

export function refOfList(d: Doc, list: Block[]): ListRef | null {
  if (list === d.blocks) return { k: 'body' };
  const p = popOwnerOf(d, list);
  if (p) return { k: 'pop', id: p.id };
  const c = cellOwnerOf(d, list);
  if (c) return { k: 'cell', id: c.b.id, r: c.r, c: c.c };
  return null;
}

export function refOf(d: Doc, id: string): ListRef | null {
  const f = findBlock(d, id);
  return f ? refOfList(d, f.list) : null;
}

export const sameRef = (a: ListRef | null, b: ListRef | null): boolean =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/** 選取的段落依串列分組（依原稿順序） */
function selGroups(d: Doc, ids: readonly string[]): Found[][] {
  const want = new Set(ids);
  const out: Found[][] = [];
  for (const list of blockLists(d)) {
    const g: Found[] = [];
    list.forEach((b, i) => {
      if (want.has(b.id)) g.push({ b, i, list });
    });
    if (g.length) out.push(g);
  }
  return out;
}

const inCell = (d: Doc, list: Block[]) => !!cellOwnerOf(d, list);
const inPop = (d: Doc, list: Block[]) => !!popOwnerOf(d, list);

/* ---------- 目標儲存格（F053、F105） ---------- */

export function validCell(): CellTarget | null {
  const c = ui().cell;
  if (!c) return null;
  const t = findBlock(doc(), c.tbl)?.b;
  if (t?.type !== 'table' || !t.tbl) return null;
  if (c.r >= tblRows(t.tbl) || c.c >= tblCols(t.tbl)) return null;
  return c;
}

/** 書式按鈕作用在儲存格：目標儲存格有效、而且沒有改選別的段落（選取的是表格本身或什麼都沒選） */
function cellForTypeButton(): CellTarget | null {
  const c = validCell();
  if (!c) return null;
  const sel = ui().sel;
  if (!sel.length || (sel.length === 1 && sel[0] === c.tbl)) return c;
  return null;
}

/** 在目標儲存格加一個段落（選取的段落在那一格裡時插在它之後，否則在最後） */
export async function addToCell(
  k: BlockType,
  cell: CellTarget | null = validCell(),
): Promise<string | null> {
  if (!cell) {
    say(S.status.pickCellFirst, 'warn');
    return null;
  }
  if (CELL_SKIP.includes(k)) {
    say(S.status.noCellType, 'warn');
    return null;
  }
  let img = null;
  if (k === 'image') {
    img = await pickImage();
    if (!img) return null;
  }
  const nb = makeBlock(k, '', doc().bxTpl);
  if (img) {
    nb.img = img.data;
    nb.ar = img.ar;
  }
  const sel = ui().sel;
  edit((d) => {
    const list = listOf(d, { k: 'cell', id: cell.tbl, r: cell.r, c: cell.c }, true);
    if (!list) return;
    const at = Math.max(-1, ...sel.map((id) => list.findIndex((b) => b.id === id)));
    if (at >= 0) list.splice(at + 1, 0, nb);
    else list.push(nb);
  });
  select([nb.id]);
  if (TEXT_TYPES.includes(k)) focusBlock(nb.id, 0);
  say(S.status.addedToCell(cell.r + 1, cell.c + 1, typeName(k)));
  return nb.id;
}

/* ---------- 書式按鈕（F050～F053） ---------- */

export async function typeButton(k: BlockType): Promise<void> {
  const cell = k === 'table' ? null : cellForTypeButton();
  if (cell) {
    await addToCell(k, cell);
    return;
  }
  if (ui().sel.length) await changeSelected(k);
  else await addNew(k);
}

/** 選取的段落改成某個書式（F051） */
export async function changeSelected(k: BlockType): Promise<void> {
  const d0 = doc();
  const groups = selGroups(d0, ui().sel);
  const found = groups.flat();
  if (!found.length) return;
  if (k === 'image' && found.every((f) => f.b.type === 'image')) {
    await reselectImages(found.map((f) => f.b.id));
    return;
  }
  const ok: string[] = [];
  let blocked = '';
  for (const f of found) {
    if (CELL_SKIP.includes(k) && inCell(d0, f.list)) blocked = S.status.noCellType;
    else if (POP_SKIP.includes(k) && inPop(d0, f.list)) blocked = S.status.noPopType;
    else ok.push(f.b.id);
  }
  if (!ok.length) {
    say(blocked, 'warn');
    return;
  }
  edit((d) => {
    for (const id of ok) {
      const f = findBlock(d, id);
      if (!f) continue;
      prepareType(f.b, k, d.bxTpl);
      if (k === 'break') {
        const i = f.list.indexOf(f.b);
        const nx = f.list[i + 1];
        if (!nx || nx.type === 'break') f.list.splice(i + 1, 0, newBlock('desc', ''));
      }
    }
  });
  if (blocked) say(blocked, 'warn');
  else say(S.status.typeChanged(ok.length, typeName(k)));
  if (k === 'image') {
    const need = ok.filter((id) => !findBlock(doc(), id)?.b.img);
    if (need.length) await reselectImages(need.slice(0, 1));
  }
}

/** 換圖片（F051 的「重選圖片」、F156） */
export async function reselectImages(ids: readonly string[]): Promise<void> {
  const img = await pickImage();
  if (!img) return;
  edit((d) => {
    for (const id of ids) {
      const b = findBlock(d, id)?.b;
      if (!b) continue;
      b.img = img.data;
      b.ar = img.ar;
    }
  });
  if (!img.ar) say(S.status.imageNoAr, 'warn');
}

/** 目前新增段落的串列：開著彈出視窗編輯時是那個彈出視窗，否則本文 */
function addTargetRef(): ListRef {
  const p = ui().popEdit;
  if (p && Array.isArray(findBlock(doc(), p)?.b.pop?.blocks)) return { k: 'pop', id: p };
  return { k: 'body' };
}

/** 沒有選取時：在最後加一個新段落（F052） */
export async function addNew(k: BlockType, ref: ListRef = addTargetRef()): Promise<string | null> {
  if (ref.k === 'pop' && POP_SKIP.includes(k)) {
    say(S.status.noPopType, 'warn');
    return null;
  }
  if (ref.k === 'cell') return addToCell(k, { tbl: ref.id, r: ref.r, c: ref.c });
  const d0 = doc();
  if (k === 'image') {
    const img = await pickImage();
    if (!img) return null;
    const nb = makeBlock('image');
    nb.img = img.data;
    nb.ar = img.ar;
    appendTo(ref, [nb]);
    select([nb.id]);
    say(S.status.added(typeName(k)));
    return nb.id;
  }
  if (k === 'toc') {
    if (
      allBlocks(d0).some((b) => b.type === 'toc') &&
      !(await bridge.confirm({ title: S.confirm.tocAgain }))
    )
      return null;
    const toc = makeBlock('toc');
    const tail = newBlock('desc', '');
    appendTo(ref, [toc, makeBlock('break'), tail]);
    select([toc.id]);
    say(S.status.tocMade);
    return toc.id;
  }
  if (k === 'break') {
    const tail = newBlock('desc', '');
    const br = makeBlock('break');
    appendTo(ref, [br, tail]);
    select([tail.id], { scroll: false });
    focusBlock(tail.id, 0);
    say(S.status.added(typeName(k)));
    return br.id;
  }
  const nb = makeBlock(k, '', d0.bxTpl);
  appendTo(ref, [nb]);
  select([nb.id]);
  if (TEXT_TYPES.includes(k)) focusBlock(nb.id, 0);
  say(S.status.added(typeName(k)));
  return nb.id;
}

function appendTo(ref: ListRef, blocks: Block[]): void {
  edit((d) => {
    const list = listOf(d, ref, true) ?? d.blocks;
    list.push(...blocks);
  });
}

/* ---------- 封面、版權頁、目錄（F054～F056） ---------- */

export function makeCover(): void {
  const ex = doc().blocks.find((b) => b.type === 'cover');
  if (ex) {
    select([ex.id]);
    say(S.status.coverExists, 'warn');
    return;
  }
  const cv = makeBlock('cover', doc().title);
  edit((d) => {
    d.blocks.unshift(cv, makeBlock('break'));
  });
  select([cv.id]);
  say(S.status.coverMade);
}

export function makeColophon(): void {
  const ex = doc().blocks.find((b) => b.type === 'colophon');
  if (ex) {
    select([ex.id]);
    say(S.status.colophonExists, 'warn');
    return;
  }
  const cp = makeBlock('colophon', `${doc().title}\n作者：\n發行：`);
  edit((d) => {
    d.blocks.push(makeBlock('break'), cp);
  });
  select([cp.id]);
  say(S.status.colophonMade);
}

/** 在選取段落之後（沒有選取時在第一段之後）插入目錄、換頁、空描述文 */
export async function makeTocHere(): Promise<void> {
  const d0 = doc();
  if (
    d0.blocks.some((b) => b.type === 'toc') &&
    !(await bridge.confirm({ title: S.confirm.tocAgain }))
  )
    return;
  const sel = new Set(ui().sel);
  let at = -1;
  d0.blocks.forEach((b, i) => {
    if (sel.has(b.id)) at = i;
  });
  if (at < 0) at = 0;
  const toc = makeBlock('toc');
  edit((d) => {
    d.blocks.splice(at + 1, 0, toc, makeBlock('break'), newBlock('desc', ''));
  });
  select([toc.id]);
  say(S.status.tocMade);
}

/* ---------- 段落操作（F060～F068） ---------- */

export function moveSel(dir: -1 | 1): void {
  const ids = new Set(ui().sel);
  if (!ids.size) {
    say(S.status.noSelection, 'warn');
    return;
  }
  let n = 0;
  edit((d) => {
    for (const list of blockLists(d)) {
      if (!list.some((b) => ids.has(b.id))) continue;
      if (dir < 0) {
        for (let i = 1; i < list.length; i++)
          if (ids.has(list[i].id) && !ids.has(list[i - 1].id)) {
            [list[i - 1], list[i]] = [list[i], list[i - 1]];
            n++;
          }
      } else {
        for (let i = list.length - 2; i >= 0; i--)
          if (ids.has(list[i].id) && !ids.has(list[i + 1].id)) {
            [list[i + 1], list[i]] = [list[i], list[i + 1]];
            n++;
          }
      }
    }
  });
  if (n) say(S.status.moved(ids.size));
}

const NO_MERGE: readonly BlockType[] = ['npc', 'toc', 'break', 'colbr'];

/** 合併（F061）：合成第一個段落，文字以換行接起來；註解與顏色跟著平移 */
export function mergeSel(): void {
  const groups = selGroups(doc(), ui().sel);
  if (groups.length !== 1 || groups[0].length < 2) {
    say(S.status.mergeNeed, 'warn');
    return;
  }
  if (groups[0].some((f) => NO_MERGE.includes(f.b.type))) {
    say(S.status.mergeBad, 'warn');
    return;
  }
  const ids = groups[0].map((f) => f.b.id);
  edit((d) => {
    const fs = ids.map((id) => findBlock(d, id)).filter((f): f is Found => !!f);
    const first = fs[0].b;
    let text = '';
    const cm: Comment[] = [];
    const mk: Mark[] = [];
    for (const f of fs) {
      const t = String(f.b.text ?? '');
      if (!t.trim()) continue;
      const base = text ? text.length + 1 : 0;
      text = text ? `${text}\n${t}` : t;
      for (const c of blockComments(f.b)) cm.push({ ...c, a: c.a + base, b: c.b + base });
      for (const m of blockMarks(f.b)) mk.push({ ...m, a: m.a + base, b: m.b + base });
    }
    first.text = text;
    first.cm = cm;
    first.mk = tidyMarks(mk);
    const drop = new Set(ids.slice(1));
    const list = fs[0].list;
    for (let i = list.length - 1; i >= 0; i--) if (drop.has(list[i].id)) list.splice(i, 1);
  });
  select([ids[0]]);
  say(S.status.merged(ids.length));
}

/** 複製段落（F062）：每個選取段落的下方各放一個副本（含巢狀，全部換新 id） */
export function dupSel(): void {
  const ids = ui().sel;
  if (!ids.length) {
    say(S.status.noSelection, 'warn');
    return;
  }
  const copies: string[] = [];
  edit((d) => {
    for (const g of selGroups(d, ids)) {
      for (let k = g.length - 1; k >= 0; k--) {
        const f = g[k];
        const c = renewIds(clone(f.b));
        copies.unshift(c.id);
        f.list.splice(f.list.indexOf(f.b) + 1, 0, c);
      }
    }
  });
  select(copies);
  say(S.status.duplicated(copies.length));
}

/** JSON 複本（Immer 的 draft 也可以） */
export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** 在下方新增（F063） */
export function addBelow(): void {
  const cell = validCell();
  const sel = ui().sel;
  if (cell && (!sel.length || sel.every((id) => id === cell.tbl || inCellList(cell, id)))) {
    void addToCell('desc', cell);
    return;
  }
  const nb = newBlock('desc', '');
  const d0 = doc();
  const groups = selGroups(d0, sel);
  const ref = groups.length ? refOfList(d0, groups[groups.length - 1][0].list) : addTargetRef();
  const lastId = groups.length ? groups[groups.length - 1].at(-1)?.b.id : null;
  edit((d) => {
    const list = (ref && listOf(d, ref, true)) || d.blocks;
    const at = lastId ? list.findIndex((b) => b.id === lastId) : -1;
    if (at >= 0) list.splice(at + 1, 0, nb);
    else list.push(nb);
  });
  select([nb.id], { scroll: false });
  focusBlock(nb.id, 0);
}

function inCellList(cell: CellTarget, id: string): boolean {
  const t = findBlock(doc(), cell.tbl)?.b;
  return (t?.tbl?.cb[cellKey(cell.r, cell.c)] ?? []).some((b) => b.id === id);
}

/** 刪除選取的段落（F064）。confirm＝先確認 */
export async function deleteSel(confirm: boolean): Promise<void> {
  const ids = ui().sel;
  if (!ids.length) {
    say(S.status.noSelection, 'warn');
    return;
  }
  if (
    confirm &&
    !(await bridge.confirm({
      title: S.confirm.deleteBlocks(ids.length),
      description: S.confirm.deleteBlocksHint,
      confirmLabel: S.confirm.del,
      danger: true,
    }))
  )
    return;
  deleteBlocks(ids);
  clearSelection();
  setUi({ focusId: null });
  say(S.status.deleted(ids.length));
}

export function deleteBlocks(ids: readonly string[]): void {
  const drop = new Set(ids);
  edit((d) => {
    for (const list of blockLists(d))
      for (let i = list.length - 1; i >= 0; i--) if (drop.has(list[i].id)) list.splice(i, 1);
  });
}

/** 複製文字（F065）：選取段落的純文字，沒有選取時全文 */
export function copyTargetText(): { text: string; n: number } {
  const ids = new Set(ui().sel);
  if (!ids.size) return { text: blocksPlainText(doc().blocks), n: 0 };
  const list = allBlocks(doc()).filter((b) => ids.has(b.id));
  return { text: blocksPlainText(list), n: list.length };
}

/** 複製區塊（F066）：記下選取的段落（含巢狀） */
export function copyBlocks(): Block[] | null {
  const ids = new Set(ui().sel);
  const list = allBlocks(doc()).filter((b) => ids.has(b.id));
  if (!list.length) {
    say(S.status.noSelection, 'warn');
    return null;
  }
  const c = clone(list);
  setUi({ clip: c });
  say(S.status.blocksCopied(c.length));
  return c;
}

/** 貼上段落：放在選取段落之後（沒有選取時在目前串列的最後），每次換新 id */
export function pasteBlocks(src: readonly Block[] | null = ui().clip): void {
  if (!src?.length) {
    say(S.status.nothingToPaste, 'warn');
    return;
  }
  const d0 = doc();
  const groups = selGroups(d0, ui().sel);
  const lastFound = groups.length ? groups[groups.length - 1].at(-1) : null;
  const ref = lastFound ? refOfList(d0, lastFound.list) : addTargetRef();
  const fresh = src.map((b) => renewIds(clone(b)));
  const isCell = ref?.k === 'cell';
  const isPop = ref?.k === 'pop';
  const ok = fresh.filter(
    (b) => !(isCell && CELL_SKIP.includes(b.type)) && !(isPop && POP_SKIP.includes(b.type)),
  );
  if (!ok.length) {
    say(isCell ? S.status.noCellType : S.status.noPopType, 'warn');
    return;
  }
  edit((d) => {
    const list = (ref && listOf(d, ref, true)) || d.blocks;
    const at = lastFound ? list.findIndex((b) => b.id === lastFound.b.id) : -1;
    if (at >= 0) list.splice(at + 1, 0, ...ok);
    else list.push(...ok);
  });
  select(ok.map((b) => b.id));
  say(S.status.pasted(ok.length));
}

/* ---------- 段落的設定（F071～F077） ---------- */

export function setSpan(span: boolean): void {
  const ids = ui().sel;
  if (!ids.length) return;
  const d0 = doc();
  const fixed = ids.some((id) => {
    const t = findBlock(d0, id)?.b.type;
    return t === 'npc' || t === 'flow';
  });
  if (!span && fixed) say(S.status.spanOnly, 'warn');
  edit((d) => {
    for (const id of ids) {
      const b = findBlock(d, id)?.b;
      if (!b) continue;
      if (b.type === 'npc' || b.type === 'flow' || b.type === 'break' || b.type === 'toc')
        b.cols = 1;
      else if (b.type === 'colbr') b.cols = 2;
      else b.cols = span ? 1 : 2;
    }
  });
}

export function indentSel(delta: number): void {
  const ids = ui().sel;
  if (!ids.length) {
    say(S.status.noSelection, 'warn');
    return;
  }
  let lv = 0;
  edit((d) => {
    for (const id of ids) {
      const b = findBlock(d, id)?.b;
      if (!b) continue;
      b.ind = Math.max(0, Math.min(4, (b.ind ?? 0) + delta));
      lv = b.ind;
    }
  });
  say(S.status.indent(lv), 'info');
}

export function toggleClear(): void {
  const ids = ui().sel;
  const d0 = doc();
  const targets = ids.filter((id) => findBlock(d0, id)?.b.type !== 'image');
  if (!targets.length) {
    say(S.status.clrOnlyImage, 'warn');
    return;
  }
  const on = !targets.every((id) => findBlock(d0, id)?.b.clr);
  edit((d) => {
    for (const id of targets) {
      const b = findBlock(d, id)?.b;
      if (b) b.clr = on;
    }
  });
}

export function setGap(which: 'mt' | 'mb', v: number | null): void {
  edit((d) => {
    for (const id of ui().sel) {
      const b = findBlock(d, id)?.b;
      if (b) b[which] = v;
    }
  });
}

export function deleteComments(): void {
  const ids = ui().sel;
  const d0 = doc();
  const n = ids.reduce((s, id) => s + blockComments(findBlock(d0, id)?.b ?? { cm: [] }).length, 0);
  if (!n) {
    say(S.status.cmtNone, 'warn');
    return;
  }
  edit((d) => {
    for (const id of ids) {
      const b = findBlock(d, id)?.b;
      if (b) b.cm = [];
    }
  });
  say(S.status.cmtDeleted(n));
}

/** 整段的文字顏色（沒有選取文字時） */
export function setBlockColor(color: string): void {
  edit((d) => {
    for (const id of ui().sel) {
      const b = findBlock(d, id)?.b;
      if (b) b.col = color;
    }
  });
  say(S.status.colorSet);
}

/* ---------- 頁面（F068、F210～F213） ---------- */

/** 有勾選頁面時是勾選的頁，否則選取段落所在的頁，都沒有時第 1 頁 */
export function targetPages(): number[] {
  const s = ui();
  if (s.pageSel.length) return [...s.pageSel].sort((a, b) => a - b);
  const pages = new Set<number>();
  for (const id of s.sel) {
    const p = s.layout.pageOf[id];
    if (p != null) pages.add(p);
  }
  if (pages.size) return [...pages].sort((a, b) => a - b);
  return [0];
}

/** 第 i 頁的設定（不夠時複製最後一頁的設定補上） */
export function pageAt(d: Doc, i: number): PageSetting {
  while (d.pages.length <= i) {
    const last = d.pages[d.pages.length - 1];
    d.pages.push(
      last
        ? { id: Math.random().toString(36).slice(2, 9), bg: { ...last.bg }, cols: last.cols }
        : {
            id: Math.random().toString(36).slice(2, 9),
            bg: { preset: 'none', img: null, fit: 'cover', opa: 35 },
            cols: 1,
          },
    );
  }
  return d.pages[i];
}

export function setPageCols(idx: readonly number[], cols: 1 | 2): void {
  edit((d) => {
    for (const i of idx) pageAt(d, i).cols = cols;
  });
  say(S.status.colsSet(idx.map((i) => `P.${i + 1}`).join('、'), cols));
}

/** 勾選頁面上的段落（連同結束那一頁的換頁）；F211 */
export function blocksOnPages(idx: readonly number[]): string[] {
  const s = ui();
  const d0 = doc();
  const ids = new Set<string>();
  for (const i of idx) for (const id of s.layout.pages[i] ?? []) ids.add(id);
  for (const i of idx) {
    const last = (s.layout.pages[i] ?? []).at(-1);
    const at = last ? d0.blocks.findIndex((b) => b.id === last) : -1;
    const nx = at >= 0 ? d0.blocks[at + 1] : null;
    if (nx?.type === 'break') ids.add(nx.id);
  }
  /* 放在那一頁的自由配置圖片 */
  for (const b of d0.blocks)
    if (isFreeImg(b) && idx.includes(Math.max(1, +(b.pg ?? 1) || 1) - 1)) ids.add(b.id);
  return [...ids];
}

export async function deletePages(): Promise<void> {
  const idx = [...ui().pageSel].sort((a, b) => a - b);
  if (!idx.length) {
    say(S.status.pickPage, 'warn');
    return;
  }
  const ids = blocksOnPages(idx);
  if (!ids.length) {
    say(S.status.noBlocksOnPage, 'warn');
    return;
  }
  const label = idx.map((i) => `P.${i + 1}`).join('、');
  if (
    !(await bridge.confirm({
      title: S.confirm.deletePages(label, ids.length),
      description: S.confirm.deleteBlocksHint,
      confirmLabel: S.confirm.del,
      danger: true,
    }))
  )
    return;
  const drop = new Set(ids);
  edit((d) => {
    d.blocks = d.blocks.filter((b) => !drop.has(b.id));
    for (const i of [...idx].sort((a, b) => b - a))
      if (d.pages.length > 1 && d.pages[i]) d.pages.splice(i, 1);
  });
  setUi({ pageSel: [], sel: [], focusId: null });
  say(S.status.pagesDeleted(idx.length));
}

/* ---------- 文字欄：分段、接合、貼上、斜線、縮排（F034～F038） ---------- */

/** Enter：在 caret 把段落切開，後半成為新的描述文（欄內）。回傳新段落的 id */
export function splitAt(id: string, caret: number): string | null {
  const f = findBlock(doc(), id);
  if (!f) return null;
  const t = String(f.b.text ?? '');
  const c = Math.max(0, Math.min(t.length, caret));
  const nb = newBlock('desc', t.slice(c));
  nb.cm = blockComments(f.b)
    .filter((x) => x.b > c)
    .map((x) => ({ ...x, a: Math.max(0, x.a - c), b: x.b - c }));
  nb.mk = tidyMarks(
    blockMarks(f.b)
      .filter((x) => x.b > c)
      .map((x) => ({ ...x, a: Math.max(0, x.a - c), b: x.b - c })),
  );
  if (!nb.cm.length) delete nb.cm;
  if (!nb.mk.length) delete nb.mk;
  edit((d) => {
    const g = findBlock(d, id);
    if (!g) return;
    setBlockText(g.b, t.slice(0, c));
    g.list.splice(g.i + 1, 0, nb);
  });
  select([nb.id], { scroll: false });
  setUi({ focusId: nb.id });
  focusBlock(nb.id, 0);
  return nb.id;
}

const NO_JOIN: readonly BlockType[] = ['npc', 'toc', 'break'];

/**
 * Backspace（游標在開頭）：空的段落刪除、游標移到前一段結尾；有內容就接到前一段後面，游標停在接縫。
 * 回傳 true＝已處理（呼叫端 preventDefault）。
 */
export function joinBack(id: string): boolean {
  const d0 = doc();
  const f = findBlock(d0, id);
  if (!f) return false;
  const t = String(f.b.text ?? '');
  const prev = f.i > 0 ? f.list[f.i - 1] : null;
  /* 空白（只有空格）的段落直接刪除，移到前一個段落（沒有的話就是下一個） */
  if (!t.trim()) {
    if (f.list === d0.blocks && d0.blocks.length <= 1) {
      say(S.status.lastBlock, 'warn');
      return true;
    }
    const near = prev ?? f.list[f.i + 1] ?? null;
    edit((d) => {
      const g = findBlock(d, id);
      if (g) g.list.splice(g.i, 1);
    });
    if (near) {
      select([near.id], { scroll: false });
      if (TEXT_TYPES.includes(near.type)) focusBlock(near.id, -1);
    } else clearSelection();
    say(S.status.deleted(1), 'ok');
    return true;
  }
  if (!prev || NO_JOIN.includes(prev.type) || !TEXT_TYPES.includes(prev.type)) return false;
  const pt = String(prev.text ?? '');
  const seam = pt.length;
  edit((d) => {
    const g = findBlock(d, id);
    const p = findBlock(d, prev.id);
    if (!g || !p) return;
    const cm = blockComments(g.b).map((x) => ({ ...x, a: x.a + seam, b: x.b + seam }));
    const mk = blockMarks(g.b).map((x) => ({ ...x, a: x.a + seam, b: x.b + seam }));
    p.b.text = pt + t;
    if (cm.length) p.b.cm = [...blockComments(p.b), ...cm];
    if (mk.length) p.b.mk = tidyMarks([...blockMarks(p.b), ...mk]);
    g.list.splice(g.list.indexOf(g.b), 1);
  });
  select([prev.id], { scroll: false });
  focusBlock(prev.id, seam);
  return true;
}

/** 貼上含空行的文字（F036）：切成多個段落、依第一行猜書式，插在 id 之後（id 是空的就取代它） */
export function pasteParagraphs(id: string | null, text: string): string[] | null {
  const parts = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t　]*\n+/)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p) => p.trim() !== '');
  if (parts.length < 2) return null;
  const tpls = doc().bxTpl;
  const made = parts.map((p) => {
    const [first, ...rest] = p.split('\n');
    const [k, head, tpl] = guessType(first);
    const b = makeBlock(k, [head, ...rest].join('\n'), tpls);
    if (k === 'proc' && tpl) applyBxTpl(b, tpl, tpls);
    return b;
  });
  const d0 = doc();
  const f = id ? findBlock(d0, id) : null;
  const ref = f ? refOfList(d0, f.list) : addTargetRef();
  edit((d) => {
    const list = (ref && listOf(d, ref, true)) || d.blocks;
    const at = f ? list.findIndex((b) => b.id === f.b.id) : -1;
    if (at >= 0) {
      const cur = list[at];
      const empty = !String(cur.text ?? '').trim() && TEXT_TYPES.includes(cur.type);
      list.splice(empty ? at : at + 1, empty ? 1 : 0, ...made);
    } else list.push(...made);
  });
  select(made.map((b) => b.id));
  say(S.status.pasted(made.length));
  return made.map((b) => b.id);
}

/* ---------- 彈出視窗（F110～F112、F104） ---------- */

/** 改名：指向舊名稱的「＠舊名稱」行一起改（F110） */
export function renamePopup(id: string, name: string): void {
  edit((d) => {
    const b = findBlock(d, id)?.b;
    if (!b) return;
    const p = ensurePopup(b);
    const old = popupLabel(b);
    p.label = name;
    const nw = String(name).trim();
    if (!nw || nw === old) return;
    for (const x of allBlocks(d))
      if (RICH_TYPES.includes(x.type) && x.text) {
        const t = renamePopRefsIn(String(x.text), old, nw);
        if (t !== x.text) setBlockText(x, t);
      }
  });
}

/** 離開文字欄時：指向還不存在的名稱，自動建立「不放在紙面」的彈出視窗（F112） */
export function ensurePopRefs(id: string): void {
  const d0 = doc();
  const f = findBlock(d0, id);
  if (!f || !RICH_TYPES.includes(f.b.type)) return;
  const missing = [...new Set(popRefNames(f.b.text))].filter((n) => !popupByLabel(d0, n));
  if (!missing.length) return;
  edit((d) => {
    const g = findBlock(d, id);
    if (!g) return;
    const made = missing.map((n) => {
      const b = makeBlock('popup');
      b.pop = { ...newPopup(n), only: true };
      return b;
    });
    g.list.splice(g.list.indexOf(g.b) + 1, 0, ...made);
  });
  say(S.status.popCreated(missing.join('、')), 'info');
}

/** 「名稱（按下即建立）」的按鈕：建立彈出視窗並開啟編輯 */
export function createPopupNamed(name: string, afterId?: string | null): string {
  const b = makeBlock('popup');
  b.pop = { ...newPopup(name), only: true };
  edit((d) => {
    const f = afterId ? findBlock(d, afterId) : null;
    if (f) f.list.splice(f.list.indexOf(f.b) + 1, 0, b);
    else d.blocks.push(b);
  });
  setUi({ popEdit: b.id });
  return b.id;
}

/** 重名時加 2、3…（F104） */
export function uniquePopupName(name: string): string {
  const base =
    String(name)
      .replace(/[\r\n]+/g, ' ')
      .trim() || '詳細';
  let n = base;
  let k = 2;
  while (popupByLabel(doc(), n)) n = `${base}${k++}`;
  return n;
}

/* ---------- 拖曳搬移（F042） ---------- */

/** 把段落搬到 ref 的第 index 個位置之前。彈出視窗不能搬進自己（或孫層）裡 */
export function moveBlocksTo(ids: readonly string[], ref: ListRef, index: number): boolean {
  const d0 = doc();
  const target = listOf(d0, ref);
  if (!target && ref.k !== 'cell') return false;
  const moving = selGroups(d0, ids).flat();
  if (!moving.length) return false;
  if (
    target &&
    moving.some(
      (f) =>
        f.b.type === 'popup' && (ownsList(f.b, target) || (ref.k === 'pop' && ref.id === f.b.id)),
    )
  ) {
    say(S.status.popSelf, 'warn');
    return false;
  }
  if (ref.k === 'cell' && moving.some((f) => CELL_SKIP.includes(f.b.type))) {
    say(S.status.noCellType, 'warn');
    return false;
  }
  if (ref.k === 'pop' && moving.some((f) => POP_SKIP.includes(f.b.type))) {
    say(S.status.noPopType, 'warn');
    return false;
  }
  const idSet = new Set(moving.map((f) => f.b.id));
  const order = allBlocks(d0).map((b) => b.id);
  edit((d) => {
    const list = listOf(d, ref, true);
    if (!list) return;
    const anchor = list[index]?.id ?? null;
    const taken: Block[] = [];
    for (const l of blockLists(d))
      for (let i = l.length - 1; i >= 0; i--)
        if (idSet.has(l[i].id)) taken.unshift(...l.splice(i, 1));
    /* 依原稿順序（blockLists 的順序可能把巢狀的排在後面） */
    taken.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const dst = listOf(d, ref, true) ?? list;
    let at = anchor ? dst.findIndex((b) => b.id === anchor) : dst.length;
    if (at < 0) at = dst.length;
    dst.splice(at, 0, ...taken);
  });
  say(S.status.moved(moving.length));
  return true;
}

/** 原稿是否有變更以外的東西要確認（目前的 data） */
export const currentDoc = (): Doc => useDoc.getState().data;

/* ---------- 選取（F040、F184） ---------- */

/** 按一下：Shift＝範圍（同一個串列內）、Ctrl＝加入／取消 */
export function clickSelect(
  id: string,
  mods: { shift?: boolean; ctrl?: boolean } = {},
  scroll = true,
): void {
  const s = ui();
  if (mods.ctrl) {
    const has = s.sel.includes(id);
    select(has ? s.sel.filter((x) => x !== id) : [...s.sel, id], {
      scroll: scroll && !has,
      anchor: id,
    });
    return;
  }
  if (mods.shift && s.anchor && s.anchor !== id) {
    const d = doc();
    const fa = findBlock(d, s.anchor);
    const fb = findBlock(d, id);
    if (fa && fb && fa.list === fb.list) {
      const [x, y] = fa.i < fb.i ? [fa.i, fb.i] : [fb.i, fa.i];
      select(
        fa.list.slice(x, y + 1).map((b) => b.id),
        { scroll, anchor: s.anchor },
      );
      return;
    }
  }
  select([id], { scroll });
}
