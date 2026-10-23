/**
 * 操作（面板、畫布、快捷鍵共用）：改資料、選取、捲到看得見、通知。
 * 通知與畫面的平移縮放由元件登記（toaster、canvasApi），這裡不依賴 React。
 */
import type { ToastOptions } from '@/ui';
import {
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
  ancestorIds,
  autoArrange,
  isFull,
  nextHit,
  removePerson,
  reparent,
  searchPeople,
} from './model/ops';
import { hostOf, kidsOf, shownOf } from './model/tree';
import {
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
  prefsNow,
  select,
  setPrefs,
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

/* ---------- 排版 ---------- */

const NO_COLLAPSE: readonly string[] = [];

export function layoutOptions(): LayoutOptions {
  const b = boardNow();
  const p = prefsNow();
  const c = collapsedOf(p, b.id);
  return {
    dims: viewDims(p.cardMode, p.memo),
    spouses: p.spouses,
    align: b.align,
    collapsed: c.length ? c : NO_COLLAPSE,
  };
}

export const dimsNow = (): Dims => layoutOptions().dims;
export const layoutNow = (): TreeLayout => layoutTree(boardNow().people, layoutOptions());

export function undo() {
  useTree.endGesture();
  useTree.temporal.getState().undo();
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
  /* 連結的配偶（第二批）：名字、生歿年改的是連結的那位成員（同原作） */
  const target = isSpouse(p) && field !== 'origin' ? shownOf(people, p) : p;
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

export function doAddChild(parentId: string, gender: Gender): void {
  if (full()) return;
  let id = '';
  updatePeople((d) => {
    id = addChild(d as People, parentId, gender)?.id ?? '';
  });
  if (!id) return;
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

export function doAddSpouse(memberId: string): void {
  if (full()) return;
  let id = '';
  updatePeople((d) => {
    id = addSpouse(d as People, memberId)?.id ?? '';
  });
  if (!id) return;
  if (!prefsNow().spouses) setPrefs({ spouses: true });
  afterAdd(id);
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
  expand([h.id]);
  select(id);
  canvasApi.current?.ensureVisible(id);
  const p = boardNow().people[id];
  const rel = isMember(p) && p.gender === 'F' ? S.daughter : S.son;
  notify({
    title: S.reparented(p?.name || S.unnamed, h.name || S.unnamed, rel),
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
  const people = boardNow().people;
  const hits = searchPeople(people, t);
  if (!hits.length) {
    notify({ title: S.searchMiss(t), tone: 'danger', replace: true });
    return;
  }
  const i = nextHit(hits, useUi.getState().selectedId);
  const hit = hits[i];
  const host = hostOf(people, hit);
  if (host) expand(ancestorIds(people, host));
  select(hit.id);
  if (host) canvasApi.current?.centerOn(host.id);
  notify({ title: S.searchHit(i + 1, hits.length), tone: 'info', replace: true });
}
