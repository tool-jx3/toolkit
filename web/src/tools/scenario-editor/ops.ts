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
  KIDS_PARENT,
  KIDS_SKIP,
  kidsOwnerOf,
  newBlock,
  ownsList,
  POP_SKIP,
  popIsBlocks,
  popOwnerOf,
  subLists,
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
import { copyImageFx, PAPER_W, setImagePos } from './model/image';
import { kidsMove, kidsRelease } from './model/kids';
import {
  MD_HR_IME_RE,
  type MdCtx,
  type MdSuggestItem,
  mdDirective,
  mdMake,
  mdParse,
  NO_TEXT_TYPES,
  OWN_BODY_TYPES,
} from './model/md';
import { dropPagesPimgs, pimgPage, pimgRound } from './model/pageImg';
import { popRefNames, RICH_TYPES, renamePopRefsIn } from './model/rich';
import { cellBlocks, cellKey, tblCols, tblRows } from './model/table';
import { blockComments, blockMarks, setBlockText, tidyMarks } from './model/text';
import { TOC_CHAPTER_HEAD, TOC_CHAPTER_PICK } from './model/toc';
import type { Block, BlockType, Comment, Doc, Mark, PageImg, PageSetting } from './model/types';
import { freshHandoutNumbers, hoOf } from './model/vars';
import {
  type CellTarget,
  clearSelection,
  doc,
  edit,
  editBlock,
  focusBlock,
  say,
  select,
  selectedBlocks,
  selectPimg,
  setUi,
  ui,
  useDoc,
} from './store';
import { S } from './strings';

/* ---------- 串列 ---------- */

export type ListRef =
  | { k: 'body' }
  | { k: 'pop'; id: string }
  | { k: 'cell'; id: string; r: number; c: number }
  /* 段落裡的段落（第三批） */
  | { k: 'kids'; id: string };

export function listOf(d: Doc, ref: ListRef, make = false): Block[] | null {
  if (ref.k === 'body') return d.blocks;
  const b = findBlock(d, ref.id)?.b;
  if (!b) return null;
  if (ref.k === 'pop') return Array.isArray(b.pop?.blocks) ? b.pop.blocks : null;
  if (ref.k === 'kids') {
    if (!Array.isArray(b.kids) && make) b.kids = [];
    return Array.isArray(b.kids) ? b.kids : null;
  }
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
  const k = kidsOwnerOf(d, list);
  if (k) return { k: 'kids', id: k.id };
  return null;
}

/** 這個串列不能放的書式：儲存格、彈出視窗、段落裡（第三批） */
export function skipOf(d: Doc, list: readonly Block[]): readonly BlockType[] {
  const l = list as Block[];
  if (kidsOwnerOf(d, l)) return KIDS_SKIP;
  if (cellOwnerOf(d, l)) return CELL_SKIP;
  if (popOwnerOf(d, l)) return POP_SKIP;
  return [];
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
const inKids = (d: Doc, list: Block[]) => !!kidsOwnerOf(d, list);

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
  /*
   * 彈出視窗的編輯開著、選取的是彈出視窗本身：在彈出視窗內容的最後新增，不把彈出視窗改成別的書式（D9）。
   * 舊式（文字型）的彈出視窗沒有段落可以放：不改，提示用文字欄。
   */
  const pe = ui().popEdit;
  const sel = ui().sel;
  if (pe && sel.length && sel.every((id) => id === pe)) {
    const p = findBlock(doc(), pe)?.b;
    if (p && popIsBlocks(p)) {
      await addNew(k, { k: 'pop', id: pe });
      return;
    }
    if (p?.type === 'popup') {
      say(S.status.popLegacyType, 'warn');
      return;
    }
  }
  const cell = k === 'table' ? null : cellForTypeButton();
  if (cell) {
    await addToCell(k, cell);
    return;
  }
  if (ui().sel.length) await changeSelected(k);
  else await addNew(k);
}

/** 左邊的文字欄不能打字的書式（只能選取；同原作 SRC_NOEDIT） */
export const SRC_NOEDIT: readonly BlockType[] = [
  'npc',
  'toc',
  'break',
  'colbr',
  'table',
  'popup',
  'image',
];

/** 段落有自己寫在紙面上的文字（改成不用文字的書式時文字會不見） */
const hasOwnText = (b: Block): boolean =>
  !NO_TEXT_TYPES.includes(b.type) && !!String(b.text ?? '').trim();

/**
 * 選取的段落改成某個書式（F051）。第三批（上游 v3.18.0～v3.20.0）：
 * - 段落裡的段落選取著時，不能放進段落裡的書式不改（狀態列說明）；
 * - 改成不用文字的書式（橫線、表格…）而選取的段落有文字時、或選取的全是文字欄不能打字的段落時：
 *   不改，在下面新增（insertTypedAfter）；
 * - 改成不能有裡面的段落的書式時，裡面的段落拿到外面。
 */
export async function changeSelected(k: BlockType): Promise<void> {
  const d0 = doc();
  const groups = selGroups(d0, ui().sel);
  const found = groups.flat();
  if (!found.length) return;
  if (KIDS_SKIP.includes(k) && found.some((f) => inKids(d0, f.list))) {
    say(S.status.noKidsType(typeName(k)), 'warn');
    return;
  }
  if (NO_TEXT_TYPES.includes(k) && found.some((f) => hasOwnText(f.b))) {
    await insertTypedAfter(k);
    return;
  }
  if (found.every((f) => SRC_NOEDIT.includes(f.b.type))) {
    const nb = await insertTypedAfter(k);
    if (nb && !SRC_NOEDIT.includes(k) && k !== 'hr' && TEXT_TYPES.includes(k)) focusBlock(nb, -1);
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
      kidsRelease(f.list, f.b, k);
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

/**
 * 在選取的段落（最後一個）的下面新增一個段落，選取的段落不改（同原作 insertTypedAfter）。
 * 標題 1（本文）的下面加目錄：這一章的目錄（標題語「本章目錄」、收標題 2、3 與場景轉換；不換頁、不問；
 * 上游 v3.18.0）。其他的目錄：已經有整份的目錄時先問，後面加換頁。換頁後面沒有段落時加空的描述文。
 * 回傳新段落的 id（沒有新增時 null）。
 */
export async function insertTypedAfter(k: BlockType): Promise<string | null> {
  const d0 = doc();
  const fs = selGroups(d0, ui().sel).flat();
  if (!fs.length) return null;
  let a = fs[fs.length - 1];
  for (const f of fs) if (f.list === a.list && f.i > a.i) a = f;
  if (KIDS_SKIP.includes(k) && inKids(d0, a.list)) {
    say(S.status.noKidsType(typeName(k)), 'warn');
    return null;
  }
  if (CELL_SKIP.includes(k) && inCell(d0, a.list)) {
    say(S.status.noCellType, 'warn');
    return null;
  }
  if (POP_SKIP.includes(k) && inPop(d0, a.list)) {
    say(S.status.noPopType, 'warn');
    return null;
  }
  const chapter = k === 'toc' && a.b.type === 'h1' && a.list === d0.blocks;
  if (
    k === 'toc' &&
    !chapter &&
    allBlocks(d0).some((b) => b.type === 'toc' && b.toc?.scope !== 'chapter') &&
    !(await bridge.confirm({ title: S.confirm.tocAgain }))
  )
    return null;
  let img = null;
  if (k === 'image') {
    img = await pickImage();
    if (!img) return null;
  }
  const nb = makeBlock(k, '', d0.bxTpl);
  if (img) {
    nb.img = img.data;
    nb.ar = img.ar;
  }
  if (chapter && nb.toc) {
    nb.toc.scope = 'chapter';
    nb.toc.lb = TOC_CHAPTER_HEAD;
    nb.toc.pick = [...TOC_CHAPTER_PICK];
  }
  const afterId = a.b.id;
  edit((d) => {
    const f = findBlock(d, afterId);
    if (!f) return;
    const add: Block[] = [nb];
    if (k === 'toc' && !chapter) add.push(makeBlock('break'));
    if (k === 'break') {
      const nx = f.list[f.i + 1];
      if (!nx || nx.type === 'break') add.push(newBlock('desc', ''));
    }
    f.list.splice(f.i + 1, 0, ...add);
  });
  select([nb.id]);
  if (OWN_BODY_TYPES.includes(k)) setUi({ focusId: null });
  say(chapter ? S.status.chapterTocMade : S.status.insertedBelow(typeName(k)));
  return nb.id;
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

/**
 * 在選取段落之後（沒有選取時在第一段之後）插入目錄、換頁、空描述文。
 * 選取的是標題 1 時改成這一章的目錄（標題語「本章目錄」、收標題 2、3 與場景轉換；不換頁、不問已經有目錄；
 * 2026-10，上游 v3.7.0，F287）。
 */
export async function makeTocHere(): Promise<void> {
  const d0 = doc();
  const sel = new Set(ui().sel);
  let at = -1;
  d0.blocks.forEach((b, i) => {
    if (sel.has(b.id)) at = i;
  });
  const chapter = at >= 0 && d0.blocks[at].type === 'h1';
  if (
    !chapter &&
    d0.blocks.some((b) => b.type === 'toc' && b.toc?.scope !== 'chapter') &&
    !(await bridge.confirm({ title: S.confirm.tocAgain }))
  )
    return;
  if (at < 0) at = 0;
  const toc = makeBlock('toc');
  if (chapter && toc.toc) {
    toc.toc.scope = 'chapter';
    toc.toc.lb = TOC_CHAPTER_HEAD;
    toc.toc.pick = [...TOC_CHAPTER_PICK];
  }
  edit((d) => {
    if (chapter) d.blocks.splice(at + 1, 0, toc);
    else d.blocks.splice(at + 1, 0, toc, makeBlock('break'), newBlock('desc', ''));
  });
  select([toc.id]);
  say(chapter ? S.status.chapterTocMade : S.status.tocMade);
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
    const made: Block[] = [];
    for (const g of selGroups(d, ids)) {
      for (let k = g.length - 1; k >= 0; k--) {
        const f = g[k];
        const c = renewIds(clone(f.b));
        copies.unshift(c.id);
        made.push(c);
        f.list.splice(f.list.indexOf(f.b) + 1, 0, c);
      }
    }
    /* 手冊的編號重複時換新的（D3） */
    freshHandoutNumbers(d, made);
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

/** 複製文字（F065）：選取段落的純文字（含裡面的段落），沒有選取時全文 */
export function copyTargetText(): { text: string; n: number } {
  const ids = new Set(ui().sel);
  if (!ids.size) return { text: blocksPlainText(doc().blocks), n: 0 };
  const list = selectedBlocks();
  return { text: blocksPlainText(list), n: list.length };
}

/** 複製區塊（F066）：記下選取的段落（含巢狀） */
export function copyBlocks(): Block[] | null {
  const list = selectedBlocks();
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
  const isKids = ref?.k === 'kids';
  const ok = fresh.filter(
    (b) =>
      !(isCell && CELL_SKIP.includes(b.type)) &&
      !(isPop && POP_SKIP.includes(b.type)) &&
      !(isKids && KIDS_SKIP.includes(b.type)),
  );
  if (!ok.length) {
    say(
      isCell
        ? S.status.noCellType
        : isKids
          ? S.status.noKidsType(typeName(fresh[0].type))
          : S.status.noPopType,
      'warn',
    );
    return;
  }
  edit((d) => {
    const list = (ref && listOf(d, ref, true)) || d.blocks;
    const at = lastFound ? list.findIndex((b) => b.id === lastFound.b.id) : -1;
    if (at >= 0) list.splice(at + 1, 0, ...ok);
    else list.push(...ok);
    /* 手冊的編號重複時換新的（D3） */
    const ids = new Set(ok.map((b) => b.id));
    freshHandoutNumbers(
      d,
      list.filter((b) => ids.has(b.id)),
    );
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
  const total = ui().total;
  edit((d) => {
    /* 還沒有自己設定的頁（沿用最後一頁）先各自記下目前的樣子：只改勾選的頁（同 F266） */
    pageAt(d, Math.max(0, total - 1));
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
  return [...ids];
}

/** 放在這些頁的頁面圖片的張數（超過總頁數的算在最後一頁） */
export function pimgsOnPages(idx: readonly number[]): number {
  const n = ui().total;
  return (doc().pageImgs ?? []).filter((o) => idx.includes(pimgPage(o, n))).length;
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
  const imgN = pimgsOnPages(idx);
  const total = ui().total;
  if (
    !(await bridge.confirm({
      title: S.confirm.deletePages(label, ids.length, imgN),
      description: S.confirm.deleteBlocksHint,
      confirmLabel: S.confirm.del,
      danger: true,
    }))
  )
    return;
  const drop = new Set(ids);
  edit((d) => {
    d.blocks = d.blocks.filter((b) => !drop.has(b.id));
    /* 那些頁上的頁面圖片也刪掉，之後的頁的圖片頁號往前移（同原作） */
    dropPagesPimgs(d, idx, total);
    for (const i of [...idx].sort((a, b) => b - a))
      if (d.pages.length > 1 && d.pages[i]) d.pages.splice(i, 1);
  });
  setUi({ pageSel: [], sel: [], pimgSel: null, focusId: null });
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

/**
 * 文字欄的 Enter（第三批，上游 v3.19.0～v3.20.0）。回傳：
 * 'split'＝照以前切開（splitAt）；'newline'＝同一段裡換行（呼叫端在游標處插入換行）；'done'＝已處理。
 * - 特殊區塊的文字：游標後面的字變成裡面最前面的描述文（游標在那裡）
 * - 有裡面的段落、游標在最後：裡面最前面加一個空的描述文
 * - 段落裡最後一個空的描述文（自己沒有裡面的段落）：拿到外面
 * - 描述文「■…」那一行的最後：同一段裡換行
 */
export function enterAt(id: string, text: string, caret: number): 'split' | 'newline' | 'done' {
  const d0 = doc();
  const f = findBlock(d0, id);
  if (!f) return 'split';
  const c = Math.max(0, Math.min(text.length, caret));
  if (f.b.type === 'proc') {
    const nb = newBlock('desc', text.slice(c));
    edit((d) => {
      const g = findBlock(d, id);
      if (!g) return;
      setBlockText(g.b, text.slice(0, c));
      if (!Array.isArray(g.b.kids)) g.b.kids = [];
      g.b.kids.unshift(nb);
    });
    select([nb.id], { scroll: false });
    focusBlock(nb.id, 0);
    return 'done';
  }
  if (f.b.kids?.length && c === text.length) {
    const nb = newBlock('desc', '');
    edit((d) => {
      const g = findBlock(d, id);
      if (g?.b.kids) g.b.kids.unshift(nb);
    });
    select([nb.id], { scroll: false });
    focusBlock(nb.id, 0);
    return 'done';
  }
  if (
    inKids(d0, f.list) &&
    f.b.type === 'desc' &&
    !text.trim() &&
    f.i === f.list.length - 1 &&
    !f.b.kids?.length
  ) {
    edit((d) => {
      kidsMove(d, id, -1);
    });
    select([id], { scroll: false });
    focusBlock(id, 0);
    return 'done';
  }
  if (f.b.type === 'desc') {
    const head = text.slice(0, c);
    const line = head.slice(head.lastIndexOf('\n') + 1);
    if (/^[ 　]*(?:[■◆]|#{4,6}[ \t])/.test(line) && (c === text.length || text.charAt(c) === '\n'))
      return 'newline';
  }
  return 'split';
}

/**
 * Tab／Shift＋Tab（第三批，上游 v3.20.0）：只選了一個段落時放進上一段的最後／拿到外面；
 * 做不到時（上一段是標題、圖片…，或已經在最外面）照以前縮排。
 */
export function nestSel(d: 1 | -1): void {
  const ids = ui().sel;
  if (ids.length === 1) {
    const id = ids[0];
    const d0 = doc();
    const f = findBlock(d0, id);
    const can =
      !!f &&
      (d > 0
        ? !!f.list[f.i - 1] &&
          KIDS_PARENT.includes(f.list[f.i - 1].type) &&
          !KIDS_SKIP.includes(f.b.type)
        : inKids(d0, f.list));
    if (can) {
      edit((x) => {
        kidsMove(x, id, d);
      });
      say(d > 0 ? S.status.kidsIn : S.status.kidsOut);
      return;
    }
  }
  indentSel(d);
}

/** Esc（第三批，上游 v3.24.0）：段落、頁面圖片的選取、文字的選取、游標全部取消 */
export function clearAll(): void {
  clearSelection();
  setUi({ focusId: null });
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)))
    a.blur();
  window.getSelection()?.removeAllRanges();
  say(S.status.cleared, 'info');
}

/**
 * 只選了一個段落（沒有在打字）時按 Enter（上游 v3.18.0）：文字欄不能打字的段落（圖片、表格…）
 * 在下面加一個空的描述文開始寫（下面已經是空的描述文時就到那裡）；有文字欄的段落把游標放到最後。
 */
export function enterOnSelected(): boolean {
  const ids = ui().sel;
  if (ids.length !== 1) return false;
  const f = findBlock(doc(), ids[0]);
  if (!f) return false;
  if (!SRC_NOEDIT.includes(f.b.type)) {
    if (!TEXT_TYPES.includes(f.b.type)) return false;
    focusBlock(f.b.id, -1);
    return true;
  }
  const nx = f.list[f.i + 1];
  let nid: string;
  if (nx && nx.type === 'desc' && !String(nx.text ?? '').trim()) nid = nx.id;
  else {
    const nb = newBlock('desc', '');
    nid = nb.id;
    edit((d) => {
      const g = findBlock(d, f.b.id);
      if (g) g.list.splice(g.i + 1, 0, nb);
    });
  }
  select([nid], { scroll: false });
  focusBlock(nid, 0);
  return true;
}

/** 文字欄上方的標題語欄（第三批，上游 v3.24.1）：特殊區塊、情報區塊的標題語、對話文的說話者 */
export function setBlockLabel(id: string, v: string): void {
  editBlock(id, (b) => {
    if (b.type === 'dialog') b.sp = v;
    else b.lb = v;
  });
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
    /* 段落裡最後一個時回到外面那段（第三批）；自己有裡面的段落時留在原處（不會不見） */
    const near = prev ?? f.list[f.i + 1] ?? f.b.kids?.[0] ?? kidsOwnerOf(d0, f.list) ?? null;
    edit((d) => {
      const g = findBlock(d, id);
      if (g) g.list.splice(g.i, 1, ...(g.b.kids ?? []));
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
    /* 接過去的段落裡面的段落：前一段可以有時接在它的裡面的最後，不行時留在原處 */
    const kids = g.b.kids ?? [];
    if (kids.length && KIDS_PARENT.includes(p.b.type)) {
      if (!Array.isArray(p.b.kids)) p.b.kids = [];
      p.b.kids.push(...kids);
      g.list.splice(g.list.indexOf(g.b), 1);
    } else g.list.splice(g.list.indexOf(g.b), 1, ...kids);
  });
  select([prev.id], { scroll: false });
  focusBlock(prev.id, seam);
  return true;
}

/* ---------- markdown（2026-10，上游 v3.16.0～v3.16.1；F289～F294） ---------- */

/** 這個串列不能放的書式（儲存格、彈出視窗）與用過的手冊編號 */
export function mdCtxFor(d: Doc, list: readonly Block[]): MdCtx {
  const skip = skipOf(d, list);
  const ho = new Set(
    allBlocks(d)
      .filter((b) => b.type === 'handout')
      .map((b) => hoOf(b).no),
  );
  return { skip, ho, tpls: d.bxTpl };
}

/**
 * 貼上（F036、F289）：當成 markdown 讀成段落（沒有 markdown 的寫法時，空行分段、依第一行猜書式）。
 * 沒有任何寫法、又只有一段時回傳 null（照一般的文字貼上）。插在 id 之後（id 是空的文字段落就取代它）。
 */
export function pasteParagraphs(id: string | null, text: string): string[] | null {
  const d0 = doc();
  const f = id ? findBlock(d0, id) : null;
  const ref = f ? refOfList(d0, f.list) : addTargetRef();
  const list0 = f ? f.list : ((ref && listOf(d0, ref)) ?? d0.blocks);
  /* 貼在特殊區塊的文字裡：分出來的段落放進它裡面的最前面（第三批，同原作） */
  const intoProc = f?.b.type === 'proc';
  const ctx = mdCtxFor(d0, list0);
  if (intoProc) ctx.skip = KIDS_SKIP;
  const md = mdParse(String(text ?? ''), ctx);
  if (!md.marked && md.blocks.length < 2) return null;
  const made = md.blocks;
  if (!made.length) return null;
  edit((d) => {
    if (intoProc && f) {
      const g = findBlock(d, f.b.id);
      if (g) {
        if (!Array.isArray(g.b.kids)) g.b.kids = [];
        g.b.kids.unshift(...made);
        return;
      }
    }
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

/** 描述文才會在打字時換書式（標題、框裡面寫到一半不會變成別的） */
const mdTypable = (b: Block | undefined): boolean => b?.type === 'desc';

/**
 * 描述文的開頭打了「# 」「## 」「### 」（＃、全形空白也可以）：變成標題 1～3，游標後面的字是標題的文字（F290）。
 * text：打完之後的文字；caret：游標位置。換了回傳 true。
 */
export function mdHeadFire(id: string, text: string, caret: number): boolean {
  const f = findBlock(doc(), id);
  if (!f || !mdTypable(f.b)) return false;
  /* 段落裡不放標題（#### 是小標；第三批，同原作） */
  if (inKids(doc(), f.list)) return false;
  const m = text.slice(0, caret).match(/^[#＃]{1,3}[ 　\u00a0]$/);
  if (!m) return false;
  mdToHead(id, m[0].length - 1, text.slice(caret));
  return true;
}

/** 這個段落改成標題 lv、文字換成 rest（游標在開頭） */
export function mdToHead(id: string, lv: number, rest: string): void {
  const k = `h${lv}` as BlockType;
  edit((d) => {
    const g = findBlock(d, id);
    if (!g) return;
    /* 標題不能有裡面的段落：拿到外面 */
    kidsRelease(g.list, g.b, k);
    g.b.type = k;
    setBlockText(g.b, rest);
  });
  select([id], { scroll: false });
  focusBlock(id, 0);
  say(S.status.mdTyped(typeName(k)));
}

/**
 * 第一行只有「:::名稱」「::名稱」「---」（輸入法的 ：、ーーー 也可以）時按 Enter：變成那個書式（F291）。
 * ::: 的書式有文字時游標放進去（游標後面的字是內容）；其他（::、橫線、沒有文字的書式）在後面加一個描述文，
 * 游標後面的字放到那裡（有自己的設定的書式維持選取、在設定欄顯示設定）。換了回傳 true（這裡不能放時也是 true）。
 */
export function mdLineFire(id: string, text: string, caret: number): boolean {
  const d0 = doc();
  const f = findBlock(d0, id);
  if (!f || !mdTypable(f.b)) return false;
  const head = text.slice(0, caret);
  if (head.includes('\n')) return false;
  let rest = text.slice(caret).replace(/^\n/, '');
  const ctx = mdCtxFor(d0, f.list);
  let nb: Block;
  let inside = false;
  if (MD_HR_IME_RE.test(head)) nb = makeBlock('hr', '');
  else {
    const dir = mdDirective(head);
    if (!dir?.k) return false;
    if (dir.n >= 3) {
      nb = mdMake(dir, rest, ctx);
      rest = '';
      inside = !NO_TEXT_TYPES.includes(nb.type);
    } else nb = mdMake(dir, null, ctx);
  }
  if (ctx.skip.includes(nb.type)) {
    say(S.status.mdNotHere(typeName(nb.type)), 'warn');
    return true;
  }
  /* 同一個段落換掉（位置與選取不變；第一行的寫法不見了，註解、顏色不帶過去） */
  nb.id = id;
  const nx = inside ? null : newBlock('desc', rest);
  edit((d) => {
    const g = findBlock(d, id);
    if (!g) return;
    /* 裡面的段落：新的書式可以有時帶過去，不行時放在下面（第三批，同原作） */
    const kids = g.b.kids ?? [];
    if (kids.length && KIDS_PARENT.includes(nb.type)) nb.kids = [...(nb.kids ?? []), ...kids];
    else if (kids.length) g.list.splice(g.i + 1, 0, ...kids);
    g.list.splice(g.i, 1, nb);
    if (nx) g.list.splice(g.i + 1, 0, nx);
  });
  if (inside) {
    select([nb.id], { scroll: false });
    focusBlock(nb.id, 0);
  } else if (nx && nb.type === 'flow') {
    /* 流程圖：維持選取、設定欄顯示它（同原作：游標不放進下一段） */
    setUi({ focusId: null });
    select([nb.id]);
  } else if (nx) {
    /* 表格、彈出視窗、NPC 卡、圖片、目錄也是：游標放進下面新加的描述文（同原作；7.5 的 T4） */
    select([nx.id], { scroll: false });
    focusBlock(nx.id, 0);
  }
  say(S.status.mdTyped(typeName(nb.type)));
  return true;
}

/** 選了候選（F293）：同打完那一行按 Enter（標題同打了「# 」） */
export function mdApplySuggest(id: string, it: MdSuggestItem, text: string, caret: number): void {
  const rest = text.slice(caret).replace(/^\n/, '');
  if (it.lv) {
    mdToHead(id, it.lv, rest);
    return;
  }
  mdLineFire(id, it.cm + (rest ? `\n${rest}` : ''), it.cm.length);
}

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
    const g = outsideKids(d, id);
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
    const f = afterId ? outsideKids(d, afterId) : null;
    if (f) f.list.splice(f.list.indexOf(f.b) + 1, 0, b);
    else d.blocks.push(b);
  });
  setUi({ popEdit: b.id });
  return b.id;
}

/**
 * 這個段落（在段落裡時是最外面那段）：自動建立的彈出視窗放在它的下面
 * （彈出視窗不能放進段落裡，F299；D42）
 */
function outsideKids(d: Doc, id: string): Found | null {
  let f = findBlock(d, id);
  for (let i = 0; f && i < 64; i++) {
    const own = kidsOwnerOf(d, f.list);
    if (!own) break;
    f = findBlock(d, own.id);
  }
  return f;
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
    moving.some(
      (f) =>
        (target && ownsList(f.b, target)) ||
        (ref.k !== 'body' && ref.id === f.b.id) ||
        (ref.k !== 'body' && !!findBlock(d0, ref.id) && ownsBlock(f.b, ref.id)),
    )
  ) {
    say(moving.some((f) => f.b.type === 'popup') ? S.status.popSelf : S.status.selfInside, 'warn');
    return false;
  }
  if (ref.k === 'kids' && moving.some((f) => KIDS_SKIP.includes(f.b.type))) {
    say(
      S.status.noKidsType(
        typeName(moving.find((f) => KIDS_SKIP.includes(f.b.type))?.b.type ?? 'desc'),
      ),
      'warn',
    );
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

/** b 的裡面（巢狀的任何一層）有沒有 id 這個段落 */
function ownsBlock(b: Block, id: string): boolean {
  return subLists(b).some((l) => l.some((x) => x.id === id || ownsBlock(x, id)));
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

/* ---------- 頁面圖片（2026-10，上游 v3.14.0～v3.16.0；F277～F284） ---------- */

/** 圖片在紙面上的位置（紙的左上角到圖片左上角，mm；量不到時 null） */
function measureOnPaper(id: string): { x: number; y: number; pg: number } | null {
  const stage = document.querySelector('[data-testid="se-stage"]');
  const bp = stage?.querySelector<HTMLElement>(`.bp[data-id="${CSS.escape(id)}"]`);
  const pg = bp?.closest<HTMLElement>('.pg');
  const wrap = bp?.closest<HTMLElement>('.pgwrap');
  if (!bp || !pg || !wrap) return null;
  const img = bp.querySelector('img') ?? bp;
  const pr = pg.getBoundingClientRect();
  const r = img.getBoundingClientRect();
  if (!pr.width) return null;
  const k = pr.width / PAPER_W;
  return { x: (r.left - pr.left) / k, y: (r.top - pr.top) / k, pg: Number(wrap.dataset.page) + 1 };
}

/**
 * 圖片段落改成頁面圖片（配置選「自由配置」；F278）：現在紙面上的位置照用，從段落的串列拿掉。
 * 彈出視窗、儲存格裡的圖片放不到頁上。
 */
export function imageToPage(id: string): void {
  const d0 = doc();
  const f = findBlock(d0, id);
  if (f?.b.type !== 'image') return;
  if (f.list !== d0.blocks) {
    say(S.status.pimgNested, 'warn');
    return;
  }
  if (!f.b.img) {
    say(S.status.pimgNoImage, 'warn');
    return;
  }
  const here = measureOnPaper(id);
  const page = (ui().layout.pageOf[id] ?? 0) + 1;
  const o: PageImg = {
    id: f.b.id,
    img: f.b.img,
    ar: +(f.b.ar ?? 0) > 0 ? +(f.b.ar ?? 0) : 0,
    cap: String(f.b.cap ?? ''),
    pg: here ? here.pg : page,
    x: here ? pimgRound(here.x) : d0.padH,
    y: here ? pimgRound(here.y) : d0.padV,
    w: +(f.b.w ?? 0) || 70,
    wu: f.b.wu === 'px' ? 'px' : 'pct',
  };
  copyImageFx(f.b, o);
  edit((d) => {
    const g = findBlock(d, id);
    if (!g) return;
    g.list.splice(g.i, 1);
    if (!d.pageImgs) d.pageImgs = [];
    d.pageImgs.push(o);
  });
  selectPimg(o.id, false);
  say(S.status.pimgMade);
}

/**
 * 頁面圖片改回圖片段落（行內、靠左繞排、靠右繞排；F278）：放在那一頁的第一個段落之前（同原作）。
 */
export function pimgToFlow(id: string, pos: 'inline' | 'left' | 'right'): void {
  const d0 = doc();
  const o = (d0.pageImgs ?? []).find((x) => x.id === id);
  if (!o) return;
  const s = ui();
  const first = s.layout.pages[pimgPage(o, s.total)]?.[0];
  const nb = makeBlock('image');
  nb.img = o.img;
  nb.ar = o.ar;
  nb.cap = o.cap;
  nb.w = o.w;
  if (o.wu === 'px') nb.wu = 'px';
  else delete nb.wu;
  copyImageFx(o, nb);
  setImagePos(nb, pos);
  edit((d) => {
    d.pageImgs = (d.pageImgs ?? []).filter((x) => x.id !== id);
    const at = first ? d.blocks.findIndex((b) => b.id === first) : -1;
    d.blocks.splice(at < 0 ? d.blocks.length : at, 0, nb);
  });
  select([nb.id]);
  say(S.status.pimgToFlow);
}

/** 修改一張頁面圖片（找不到就不動） */
export function editPimg(id: string, recipe: (o: PageImg, d: Doc) => void): void {
  edit((d) => {
    const o = (d.pageImgs ?? []).find((x) => x.id === id);
    if (o) recipe(o, d);
  });
}

/** 刪除頁面圖片（F283） */
export function deletePimg(id: string): void {
  /* 已經不在了（例如復原之後還留著的選取）：不動原稿，重做的紀錄才不會被清掉（7.5 的 T2） */
  if (!(doc().pageImgs ?? []).some((x) => x.id === id)) {
    setUi({ pimgSel: null });
    return;
  }
  edit((d) => {
    d.pageImgs = (d.pageImgs ?? []).filter((x) => x.id !== id);
  });
  setUi({ pimgSel: null });
  say(S.status.pimgDeleted);
}

/** 頁面圖片換圖（F283） */
export async function reselectPimg(id: string): Promise<void> {
  const img = await pickImage();
  if (!img) return;
  editPimg(id, (o) => {
    o.img = img.data;
    o.ar = img.ar || 0;
  });
  say(S.status.pimgReselected);
}
