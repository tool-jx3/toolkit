/**
 * 操作（面板、畫布、快捷鍵共用）：改資料、選取、捲到看得見、通知。
 * 通知與畫面的平移縮放由元件登記（toaster、canvasApi），這裡不依賴 React。
 */
import type { ToastOptions } from '@/ui';
import {
  type CardMode,
  type Dims,
  type LayoutOptions,
  layoutTree,
  type TreeLayout,
  viewDims,
} from './model/layout';
import {
  addChild,
  addParent,
  addRoot,
  addSibling,
  addSpouse,
  autoArrange,
  avatarIds,
  isFull,
  nextHit,
  removePerson,
  reparent,
  searchPeople,
  setBirthParent,
} from './model/ops';
import {
  adoptKindOf,
  ancestors,
  daughterHusband,
  hostOf,
  kidsOf,
  lineParent,
  shownOf,
} from './model/tree';
import {
  type Align,
  type Board,
  type Gender,
  type InlineField,
  isMember,
  isSpouse,
  LIMITS,
  type People,
  type Person,
} from './model/types';
import {
  boardNow,
  collapsedOf,
  expand,
  isPlView,
  type Prefs,
  prefsNow,
  select,
  setPrefs,
  shownPeople,
  updatePeople,
  useTree,
  useUi,
} from './store';
import { S } from './strings';

/* ---------- 元件登記的東西 ---------- */

export const toaster: { current: ((o: ToastOptions) => void) | null } = { current: null };
export const notify = (o: ToastOptions) => toaster.current?.(o);

export interface CanvasApi {
  fit: (animate?: boolean) => void;
  centerOn: (id: string) => void;
  ensureVisible: (id: string) => void;
  zoomBy: (f: number) => void;
}
export const canvasApi: { current: CanvasApi | null } = { current: null };

/** 匯出分頁登記：框選範圍之後直接匯出（F83） */
export const exportApi: { current: (() => void) | null } = { current: null };

/* ---------- 排版 ---------- */

const NO_COLLAPSE: readonly string[] = [];

/** 畫面上的人物（PL 檢視時是 PL 版） */
export const peopleNow = (): People => shownPeople(boardNow().people, prefsNow().viewMode);

/** 排版用到的顯示設定（只有這些改了才要重排；匯出設定、分頁、拖曳方式…不算） */
export interface ViewParts {
  cardMode: CardMode;
  memo: boolean;
  /** 卡片左邊多頭像那一欄（頭像打開而且畫面上有人有頭像） */
  avatar: boolean;
  spouses: boolean;
  maternal: boolean;
  stubs: boolean;
  daughterName: boolean;
  align: Align;
  collapsed: readonly string[];
}

export function layoutOptionsOf(v: ViewParts): LayoutOptions {
  return {
    dims: viewDims(v.cardMode, v.memo, v.avatar),
    spouses: v.spouses,
    align: v.align,
    collapsed: v.collapsed.length ? v.collapsed : NO_COLLAPSE,
    maternal: v.maternal,
    stubs: v.stubs,
    daughterName: v.daughterName,
  };
}

/** 畫面的排版設定（顯示設定、折疊；頭像打開而且畫面上有人有頭像時卡片多頭像那一欄） */
export function viewOptions(prefs: Prefs, board: Board, people: People): LayoutOptions {
  return layoutOptionsOf({
    cardMode: prefs.cardMode,
    memo: prefs.memo,
    avatar: prefs.avatars && avatarIds(people).length > 0,
    spouses: prefs.spouses,
    maternal: prefs.maternal,
    stubs: prefs.stubs,
    daughterName: prefs.daughterName,
    align: board.align,
    collapsed: collapsedOf(prefs, board.id),
  });
}

export function layoutOptions(): LayoutOptions {
  return viewOptions(prefsNow(), boardNow(), peopleNow());
}

export const dimsNow = (): Dims => layoutOptions().dims;
export const layoutNow = (): TreeLayout => layoutTree(peopleNow(), layoutOptions());

/**
 * PL 檢視不能改資料（D29）：改資料的入口（復原、重做、圖板的改名與刪除、色分類…）先問這個——
 * 在 PL 檢視時提示「切回 GM 檢視才能編輯」並回傳 true（呼叫端就不動作）。
 */
export function plBlocked(): boolean {
  if (!isPlView()) return false;
  notify({ title: S.plNeedGm, tone: 'info', replace: true });
  return true;
}

export function undo() {
  if (plBlocked()) return;
  useTree.endGesture();
  useTree.temporal.getState().undo();
}

export function redo() {
  if (plBlocked()) return;
  useTree.endGesture();
  useTree.temporal.getState().redo();
}

const undoAction = { label: S.undo, onClick: undo };

/* ---------- 選取與就地編輯 ---------- */

/** 就地編輯能用的欄位（依卡片的樣子） */
export function inlineFields(p: Person): InlineField[] {
  const prefs = prefsNow();
  const full = prefs.cardMode === 'full';
  if (isSpouse(p)) return full ? ['name', 'birth', 'death', 'origin'] : ['name', 'birth', 'death'];
  return full && prefs.memo
    ? ['name', 'reading', 'birth', 'death', 'note']
    : ['name', 'reading', 'birth', 'death'];
}

export function startInline(id: string, field: InlineField | null = 'name'): void {
  const p = boardNow().people[id];
  if (!p) return;
  const list = inlineFields(p);
  const f = field && list.includes(field) ? field : 'name';
  select(id);
  useUi.setState({ editing: { id, field: f } });
}

/** 就地編輯確定：有改才記一步；move＝±1 時跳到下一欄／上一欄 */
export function commitInline(id: string, field: InlineField, raw: string, move: -1 | 0 | 1): void {
  const people = boardNow().people;
  const p = people[id];
  if (!p) {
    useUi.setState({ editing: null });
    return;
  }
  const value = Array.from(raw.trim()).slice(0, limitOf(field)).join('');
  const target = inlineTarget(people, p, field);
  const cur = (target as unknown as Record<string, string | undefined>)[field] ?? '';
  if (value !== cur)
    updatePeople((d) => {
      const t = d[target.id] as unknown as Record<string, string | undefined>;
      if (!t) return;
      if (value || field === 'name') t[field] = value;
      else delete t[field];
    });
  if (!move) {
    useUi.setState({ editing: null });
    return;
  }
  const list = inlineFields(p);
  const i = list.indexOf(field);
  const next = list[(i + move + list.length) % list.length];
  useUi.setState({ editing: null });
  setTimeout(() => useUi.setState({ editing: { id, field: next } }), 0);
}

/**
 * 就地編輯改的是誰：連結的配偶的名字、讀音、生歿年改連到的那位成員（同原作）；
 * 女兒寫成「女（適 丈夫）」時，卡片上的名字、讀音是丈夫的（改丈夫的，F84）。
 */
export function inlineTarget(people: People, p: Person, field: InlineField): Person {
  if (isSpouse(p)) return field !== 'origin' ? shownOf(people, p) : p;
  if ((field === 'name' || field === 'reading') && prefsNow().daughterName) {
    const h = daughterHusband(people, p);
    if (h) return shownOf(people, h);
  }
  return p;
}

function limitOf(field: InlineField): number {
  if (field === 'note') return LIMITS.note;
  if (field === 'birth' || field === 'death') return LIMITS.year;
  if (field === 'origin') return LIMITS.origin;
  if (field === 'reading') return LIMITS.reading;
  return LIMITS.name;
}

export function cancelInline(): void {
  useUi.setState({ editing: null });
}

/* ---------- 加人 ---------- */

function full(): boolean {
  if (!isFull(boardNow().people)) return false;
  notify({ title: S.peopleFull(LIMITS.people), tone: 'warning', replace: true });
  return true;
}

/** 加了之後：選取、捲到看得見（配偶時捲到他的成員）、名字欄就地編輯 */
function afterAdd(id: string, center = false) {
  select(id);
  const p = boardNow().people[id];
  const host = hostOf(boardNow().people, p);
  if (host) {
    if (center) canvasApi.current?.centerOn(host.id);
    else canvasApi.current?.ensureVisible(host.id);
  }
  useUi.setState({ editing: { id, field: 'name' } });
}

export function doAddRoot(): void {
  if (full()) return;
  let id = '';
  updatePeople((d) => {
    id = addRoot(d as People).id;
  });
  afterAdd(id, true);
}

/** 替女兒加孩子、把人移到女兒底下時，「母系外孫」關著就打開（原作同，F81） */
function showMaternal(parentId: string) {
  const p = boardNow().people[parentId];
  if (isMember(p) && p.gender === 'F' && !prefsNow().maternal) setPrefs({ maternal: true });
}

export function doAddChild(parentId: string, gender: Gender): void {
  if (full()) return;
  let id = '';
  updatePeople((d) => {
    id = addChild(d as People, parentId, gender)?.id ?? '';
  });
  if (!id) return;
  showMaternal(parentId);
  expand([parentId]);
  afterAdd(id);
}

export function doAddSibling(personId: string): void {
  if (full()) return;
  let id = '';
  let parent = '';
  updatePeople((d) => {
    const c = addSibling(d as People, personId);
    id = c?.id ?? '';
    parent = c
      ? c.fatherId && isMember(d[c.fatherId] as Person)
        ? c.fatherId
        : (c.motherId ?? '')
      : '';
  });
  if (!id) return;
  if (parent) expand([parent]);
  afterAdd(id);
}

/** 加配偶；link＝和別的家系的人結婚（選取新的配偶、焦點移到「連到圖板裡的人」，F82） */
export function doAddSpouse(memberId: string, link = false): void {
  if (full()) return;
  let id = '';
  updatePeople((d) => {
    id = addSpouse(d as People, memberId)?.id ?? '';
  });
  if (!id) return;
  if (!prefsNow().spouses) setPrefs({ spouses: true });
  if (!link) {
    afterAdd(id);
    return;
  }
  select(id);
  canvasApi.current?.ensureVisible(memberId);
  setTimeout(() => {
    document.querySelector<HTMLElement>('[data-field="link"]')?.focus({ preventScroll: true });
  }, 60);
}

export function doAddParent(personId: string): void {
  if (full()) return;
  let id = '';
  updatePeople((d) => {
    id = addParent(d as People, personId)?.id ?? '';
  });
  if (id) afterAdd(id);
}

/* ---------- 刪除 ---------- */

/** 刪除人物：有子孫時回傳 false（面板寫原因） */
export function doRemove(id: string): boolean {
  const people = boardNow().people;
  const p = people[id];
  if (!p) return false;
  if (isMember(p) && kidsOf(people, id, { all: true }).length) return false;
  const name = isSpouse(p) ? shownOf(people, p).name : p.name;
  updatePeople((d) => {
    removePerson(d as People, id);
  });
  select(null);
  notify({ title: S.deleted(name || S.unnamed), tone: 'success', action: undoAction });
  return true;
}

/* ---------- 換父母、自動整列 ---------- */

export function doReparent(id: string, targetId: string): void {
  let host: { id: string; name: string } | null = null;
  updatePeople((d) => {
    const h = reparent(d as People, id, targetId);
    if (h) host = { id: h.id, name: h.name };
  });
  const h = host as { id: string; name: string } | null;
  if (!h) return;
  showMaternal(h.id);
  expand([h.id]);
  select(id);
  canvasApi.current?.ensureVisible(id);
  const p = boardNow().people[id];
  const rel = !isMember(p)
    ? S.son
    : p.adopt?.fatherId
      ? S.adoptWord[adoptKindOf(p)]
      : p.gender === 'F'
        ? S.daughter
        : S.son;
  notify({
    title: S.reparented(p?.name || S.unnamed, h.name || S.unnamed, rel),
    tone: 'success',
    action: undoAction,
  });
}

/** 「出」字小卡放到別人卡片上：換生家（F80） */
export function doSetBirthParent(id: string, targetId: string): void {
  let host: { id: string; name: string } | null = null;
  updatePeople((d) => {
    const h = setBirthParent(d as People, id, targetId);
    if (h) host = { id: h.id, name: h.name };
  });
  const h = host as { id: string; name: string } | null;
  if (!h) return;
  expand([h.id]);
  const p = boardNow().people[id];
  notify({
    title: S.birthChanged(p?.name || S.unnamed, h.name || S.unnamed),
    tone: 'success',
    action: undoAction,
  });
}

export function doAutoArrange(): void {
  updatePeople((d) => {
    autoArrange(d as People);
  });
  setTimeout(() => canvasApi.current?.fit(true), 30);
  notify({ title: S.arranged, tone: 'success', action: undoAction });
}

/* ---------- 搜尋 ---------- */

export function doSearch(q: string): void {
  const t = q.trim();
  if (!t) return;
  /* PL 檢視時只找畫面上看得到的（GM 專用的人與欄位找不到） */
  const people = peopleNow();
  const hits = searchPeople(people, t);
  if (!hits.length) {
    notify({ title: S.searchMiss(t), tone: 'danger', replace: true });
    return;
  }
  const i = nextHit(hits, useUi.getState().selectedId);
  const hit = hits[i];
  const host = hostOf(people, hit);
  if (host) {
    /* 祖先折疊著就展開；路上經過母系（掛在母親底下）時打開「母系外孫」（原作同） */
    const up = ancestors(people, host);
    let cur = host;
    for (const a of up) {
      if (!prefsNow().maternal && lineParent(people, cur, { all: true }) === cur.motherId)
        setPrefs({ maternal: true });
      cur = a;
    }
    expand(up.map((a) => a.id));
  }
  select(hit.id);
  if (host) canvasApi.current?.centerOn(host.id);
  notify({ title: S.searchHit(i + 1, hits.length), tone: 'info', replace: true });
}
