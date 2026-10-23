/**
 * 家系的查詢（規格 3.1「誰掛在誰底下」）：血緣上的父母、孩子、配偶、子孫、代數、始祖。
 *
 * 人物資料可能是 Immer 的草稿，所以這裡不快取：每次從 `people` 算（React 那邊用 useMemo 依參照快取）。
 */
import { isMember, isSpouse, type Member, type People, type Person, type Spouse } from './types';

/** 母親是成員、父親不是時：顯示母系外孫時掛在母親底下，不顯示時整個隱藏（第二批的開關；第一批一律顯示） */
export const HIDDEN = '#hidden';

export interface LineOptions {
  /** 顯示母系外孫（女兒的孩子）；第一批一律 true（規格 D5） */
  maternal?: boolean;
}

const byOrder = (a: Person, b: Person) => (a.order ?? 0) - (b.order ?? 0);

/**
 * 血緣上的父母：父親是成員時是父親；否則母親是成員時是母親（不顯示母系外孫時是 HIDDEN）；都不是時 null（始祖）。
 * `all`：不管顯示設定（算子孫、代數、排序值時用）。
 */
export function lineParent(
  people: People,
  p: Member,
  { maternal = true, all = false }: LineOptions & { all?: boolean } = {},
): string | null {
  if (p.fatherId && isMember(people[p.fatherId])) return p.fatherId;
  if (p.motherId && isMember(people[p.motherId])) return all || maternal ? p.motherId : HIDDEN;
  return null;
}

/** 所有成員（依加入的順序） */
export function membersOf(people: People): Member[] {
  const out: Member[] = [];
  for (const p of Object.values(people)) if (isMember(p)) out.push(p);
  return out;
}

export interface TreeIndex {
  members: Member[];
  /** 顯示中的孩子（依排序值） */
  kids: Map<string, Member[]>;
  /** 所有孩子（不管顯示設定） */
  allKids: Map<string, Member[]>;
  /** 每位成員的配偶（依排序值） */
  spouses: Map<string, Spouse[]>;
  /** 始祖（依排序值；不含隱藏的） */
  roots: Member[];
}

function push<V>(m: Map<string, V[]>, k: string, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

/** 一次整理整張圖板（排版、面板、搜尋共用） */
export function indexTree(people: People, opts: LineOptions = {}): TreeIndex {
  const members: Member[] = [];
  const kids = new Map<string, Member[]>();
  const allKids = new Map<string, Member[]>();
  const spouses = new Map<string, Spouse[]>();
  const roots: Member[] = [];
  for (const p of Object.values(people)) {
    if (isSpouse(p)) {
      push(spouses, p.spouseOf, p);
      continue;
    }
    if (!isMember(p)) continue;
    members.push(p);
    const a = lineParent(people, p, { all: true });
    if (a) push(allKids, a, p);
    const m = lineParent(people, p, opts);
    if (m === null) roots.push(p);
    else if (m !== HIDDEN) push(kids, m, p);
  }
  for (const map of [kids, allKids, spouses] as Map<string, Person[]>[])
    for (const list of map.values()) list.sort(byOrder);
  roots.sort(byOrder);
  return { members, kids, allKids, spouses, roots };
}

export function kidsOf(people: People, id: string, opts: LineOptions & { all?: boolean } = {}) {
  const out: Member[] = [];
  for (const p of Object.values(people))
    if (isMember(p) && lineParent(people, p, opts) === id) out.push(p);
  return out.sort(byOrder);
}

export function spousesOf(people: People, id: string): Spouse[] {
  const out: Spouse[] = [];
  for (const p of Object.values(people)) if (isSpouse(p) && p.spouseOf === id) out.push(p);
  return out.sort(byOrder);
}

/** 所有子孫的 id（不管折疊與顯示設定） */
export function descendants(people: People, id: string): Set<string> {
  const idx = indexTree(people);
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const k of idx.allKids.get(cur) ?? []) {
      if (out.has(k.id)) continue;
      out.add(k.id);
      stack.push(k.id);
    }
  }
  return out;
}

/** 祖先（從父母往上，最多 500 層；防止資料有環時跑不完） */
export function ancestors(people: People, p: Member): Member[] {
  const out: Member[] = [];
  let cur: Member | undefined = p;
  for (let guard = 0; cur && guard < 500; guard++) {
    const lp = lineParent(people, cur, { all: true });
    if (!lp) break;
    const next = people[lp];
    if (!isMember(next)) break;
    out.push(next);
    cur = next;
  }
  return out;
}

/** 代數：始祖的起始代數 ＋ 往上的層數 */
export function genOf(people: People, p: Member): number {
  const up = ancestors(people, p);
  const top = up.length ? up[up.length - 1] : p;
  return (top.gen || 1) + up.length;
}

/** 這個人所屬家系的始祖 */
export function rootOf(people: People, p: Member): Member {
  const up = ancestors(people, p);
  return up.length ? up[up.length - 1] : p;
}

/** 成員自己（配偶時是他所屬的成員） */
export function hostOf(people: People, p: Person | undefined): Member | null {
  if (!p) return null;
  if (isMember(p)) return p;
  const h = people[p.spouseOf];
  return isMember(h) ? h : null;
}

/** 排在這位父母（null＝始祖）的孩子最後的排序值 */
export function nextOrder(people: People, parentId: string | null): number {
  let max = 0;
  for (const p of Object.values(people)) {
    if (!isMember(p)) continue;
    if ((lineParent(people, p, { all: true }) ?? null) === parentId) max = Math.max(max, p.order ?? 0);
  }
  return max + 1;
}

/** 同一位血緣上的父母的兄弟姊妹（含自己，依排序值） */
export function siblingsOf(people: People, p: Member): Member[] {
  const key = lineParent(people, p, { all: true }) ?? null;
  return membersOf(people)
    .filter((x) => (lineParent(people, x, { all: true }) ?? null) === key)
    .sort(byOrder);
}

/**
 * 配偶卡片顯示誰的資料：連到別的家系的成員時用那位成員的名字、讀音、生歿年（原作同；
 * 讀原作的備份檔時，連結自動建立的那一邊名字是空白的；連結的操作在第二批）。
 */
export function shownOf(people: People, s: Spouse): Person {
  const l = s.link?.personId ? people[s.link.personId] : undefined;
  return isMember(l) ? l : s;
}
