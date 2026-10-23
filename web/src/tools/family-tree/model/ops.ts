/**
 * 編輯人物與關係（規格 1.2、1.6、1.7）：直接改 `people`（可以是 Immer 的草稿，也可以是複本），純邏輯、不依賴 React。
 * 規則照原作：新的孩子排在最後、只有一位配偶時自動填另一位父母、換父母後間距歸零…
 */

import { type LayoutOptions, layoutTree } from './layout';
import { CAT_PALETTE } from './palette';
import { fixRefs } from './sanitize';
import {
  ancestors,
  descendants,
  hostOf,
  kidsOf,
  lineParent,
  membersOf,
  nextOrder,
  shownOf,
  siblingsOf,
  spousesOf,
} from './tree';
import {
  type Board,
  type Category,
  type Gender,
  isMember,
  isSpouse,
  LIMITS,
  type Member,
  newId,
  type People,
  type Spouse,
} from './types';

export const peopleCount = (people: People) => Object.keys(people).length;
export const isFull = (people: People) => peopleCount(people) >= LIMITS.people;

/* ---------- 加人 ---------- */

/** 新增始祖：男性、第 1 代、排在現有始祖的最後（F07） */
export function addRoot(people: People, id = newId()): Member {
  const r: Member = {
    id,
    kind: 'member',
    name: '',
    gender: 'M',
    gen: 1,
    order: nextOrder(people, null),
  };
  people[id] = r;
  return r;
}

/** 加兒子／加女兒（F08）：這個人是女性時母親＝她、父親＝她唯一的丈夫；男性時反過來 */
export function addChild(
  people: People,
  parentId: string,
  gender: Gender,
  id = newId(),
): Member | null {
  const parent = people[parentId];
  if (!isMember(parent)) return null;
  const c: Member = { id, kind: 'member', name: '', gender, order: nextOrder(people, parent.id) };
  const sp = spousesOf(people, parent.id);
  if (parent.gender === 'F') {
    c.motherId = parent.id;
    if (sp.length === 1) c.fatherId = sp[0].id;
  } else {
    c.fatherId = parent.id;
    if (sp.length === 1) c.motherId = sp[0].id;
  }
  people[id] = c;
  return c;
}

/** 加兄弟姊妹（F10）：等於對血緣上的父母加兒子 */
export function addSibling(people: People, personId: string, id = newId()): Member | null {
  const p = people[personId];
  if (!isMember(p)) return null;
  const lp = lineParent(people, p, { all: true });
  return lp ? addChild(people, lp, 'M', id) : null;
}

/** 加配偶（F09） */
export function addSpouse(people: People, memberId: string, id = newId('s')): Spouse | null {
  const m = people[memberId];
  if (!isMember(m)) return null;
  const s: Spouse = {
    id,
    kind: 'spouse',
    spouseOf: m.id,
    name: '',
    order: spousesOf(people, m.id).length + 1,
  };
  people[id] = s;
  return s;
}

/** 能不能加上一代：只有始祖（而且沒有父親） */
export function canAddParent(people: People, p: Member): boolean {
  return !lineParent(people, p, { all: true }) && !p.fatherId;
}

/** 加上一代（F11）：新的始祖在上一代，這個人變成他的孩子 */
export function addParent(people: People, personId: string, id = newId()): Member | null {
  const p = people[personId];
  if (!isMember(p) || !canAddParent(people, p)) return null;
  const f: Member = {
    id,
    kind: 'member',
    name: '',
    gender: 'M',
    gen: Math.max(1, (p.gen || 1) - 1),
    order: p.order,
  };
  if (p.gap) f.gap = p.gap;
  p.fatherId = id;
  delete p.gen;
  p.order = 1;
  delete p.gap;
  people[id] = f;
  return f;
}

/* ---------- 刪除 ---------- */

export type RemoveResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'missing' | 'has-kids' };

/** 跨家系的婚姻連結（第二批）：拿掉一位配偶時，對方那邊自動建立的配偶一起刪、其他的只拿掉連結 */
function unpair(people: People, s: Spouse) {
  const pairId = s.link?.pairId;
  const pair = pairId ? people[pairId] : undefined;
  if (isSpouse(pair)) {
    if (pair.link?.auto || !pair.name) delete people[pair.id];
    else delete pair.link;
  }
  if (s.link) delete s.link.pairId;
}

/**
 * 刪除人物（F41、F42）：成員有子孫時不能刪；成員的配偶一起刪；別人指到他的父親、母親（與第二批的過繼、連結）清掉。
 */
export function removePerson(people: People, id: string): RemoveResult {
  const p = people[id];
  if (!p) return { ok: false, reason: 'missing' };
  if (isMember(p) && kidsOf(people, id, { all: true }).length)
    return { ok: false, reason: 'has-kids' };
  const name = isSpouse(p) ? shownOf(people, p).name : p.name;
  if (isSpouse(p)) unpair(people, p);
  else for (const s of spousesOf(people, id)) unpair(people, s);
  if (isMember(p)) for (const s of spousesOf(people, id)) delete people[s.id];
  delete people[id];
  for (const x of Object.values(people)) {
    if (isMember(x)) {
      if (x.fatherId === id) delete x.fatherId;
      if (x.motherId === id) delete x.motherId;
    }
  }
  fixRefs(people);
  return { ok: true, name };
}

/* ---------- 換父母（拖到別人卡片上、父母的下拉） ---------- */

export type ReparentCheck = 'ok' | 'self' | 'descendant' | 'missing';

/** 拖到 targetId（成員或配偶卡片）上能不能換父母（F48） */
export function checkReparent(people: People, id: string, targetId: string): ReparentCheck {
  const p = people[id];
  const host = hostOf(people, people[targetId]);
  if (!isMember(p) || !host) return 'missing';
  if (host.id === id) return 'self';
  if (descendants(people, id).has(host.id)) return 'descendant';
  return 'ok';
}

/**
 * 變成目標的孩子（F48）：目標是女性時母親＝她、父親＝放上去的那位配偶（否則她唯一的丈夫）；男性時反過來。
 * 排在最後、左側間距與手動偏移歸零、起始代數取消。回傳新的父母（成員）。
 */
export function reparent(people: People, id: string, targetId: string): Member | null {
  if (checkReparent(people, id, targetId) !== 'ok') return null;
  const p = people[id] as Member;
  const t = people[targetId];
  const host = hostOf(people, t) as Member;
  const sp = isSpouse(t) ? t : null;
  const theirs = spousesOf(people, host.id);
  const other = sp ? sp.id : theirs.length === 1 ? theirs[0].id : null;
  if (host.gender === 'F') {
    p.motherId = host.id;
    if (other) p.fatherId = other;
    else delete p.fatherId;
  } else {
    p.fatherId = host.id;
    if (other) p.motherId = other;
    else delete p.motherId;
  }
  delete p.gen;
  delete p.gap;
  delete p.shift;
  /* 原作在改了父母之後才算排序值（自己也算在兄弟姊妹裡），結果仍是排在最後 */
  p.order = nextOrder(people, host.id);
  return host;
}

/** 父親的下拉可以選的人（F39）：所有男性成員，不含自己與自己的子孫 */
export function fatherChoices(people: People, p: Member): Member[] {
  const desc = descendants(people, p.id);
  return membersOf(people).filter((x) => x.id !== p.id && !desc.has(x.id) && x.gender !== 'F');
}

/** 換父親（F39）：母親若是別人的配偶就清掉、新父親只有一位配偶時自動填；排在最後、間距與偏移歸零 */
export function setFather(people: People, id: string, fatherId: string | null): void {
  const p = people[id];
  if (!isMember(p)) return;
  if (fatherId) p.fatherId = fatherId;
  else delete p.fatherId;
  const mo = p.motherId ? people[p.motherId] : undefined;
  if (isSpouse(mo) && mo.spouseOf !== fatherId) delete p.motherId;
  if (fatherId && !p.motherId) {
    const sp = spousesOf(people, fatherId);
    if (sp.length === 1) p.motherId = sp[0].id;
  }
  delete p.gap;
  delete p.shift;
  p.order = nextOrder(people, fatherId);
}

/** 母親的下拉可以選的人：父親（是成員時）的配偶＋原本的母親（她是成員時） */
export function motherChoices(people: People, p: Member): { id: string; daughterSide: boolean }[] {
  const out: { id: string; daughterSide: boolean }[] = [];
  const father = p.fatherId ? people[p.fatherId] : undefined;
  if (isMember(father))
    for (const s of spousesOf(people, father.id)) out.push({ id: s.id, daughterSide: false });
  const mother = p.motherId ? people[p.motherId] : undefined;
  if (isMember(mother)) out.push({ id: mother.id, daughterSide: true });
  return out;
}

export function setMother(people: People, id: string, motherId: string | null): void {
  const p = people[id];
  if (!isMember(p)) return;
  if (motherId) p.motherId = motherId;
  else delete p.motherId;
}

/* ---------- 位置 ---------- */

/** 和左邊／右邊的兄弟姊妹交換排序（F40）；到頭時 false */
export function moveSibling(people: People, id: string, dir: -1 | 1): boolean {
  const p = people[id];
  if (!isMember(p)) return false;
  const sib = siblingsOf(people, p);
  const i = sib.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sib.length) return false;
  sib.forEach((x, k) => {
    x.order = k + 1;
  });
  const a = sib[i].order;
  sib[i].order = sib[j].order;
  sib[j].order = a;
  return true;
}

/** 這個人有沒有手動的間距或偏移（F40） */
export const hasManual = (p: Member) => !!(p.gap || p.shift);

export function clearManual(people: People, id: string): void {
  const p = people[id];
  if (!isMember(p)) return;
  delete p.gap;
  delete p.shift;
}

/** 自動整列（F30）：清掉所有人的左側間距與手動偏移 */
export function autoArrange(people: People): void {
  for (const p of Object.values(people)) {
    if (!isMember(p)) continue;
    delete p.gap;
    delete p.shift;
    if (p.adopt) delete p.adopt.gap;
  }
}

/**
 * 換順序（F45）：卡片左邊放在 desiredX（排版座標）時，依卡片中心落在哪兩個兄弟姊妹的中心之間重新排序；
 * 排版裡看不到的兄弟姊妹排在最後。
 */
export function applyMove(people: People, id: string, desiredX: number, opts: LayoutOptions): void {
  const p = people[id];
  if (!isMember(p)) return;
  const L = layoutTree(people, opts);
  const half = opts.dims.W / 2;
  const cx = desiredX + half;
  const sib = siblingsOf(people, p).filter((x) => x.id !== id);
  const vis = sib.filter((s) => L.byId.has(s.id));
  const hid = sib.filter((s) => !L.byId.has(s.id));
  const before = vis.filter((s) => (L.byId.get(s.id)?.x ?? 0) + half < cx).length;
  [...vis.slice(0, before), p, ...vis.slice(before), ...hid].forEach((x, i) => {
    x.order = i + 1;
  });
}

/** 調間距（F46）：左側間距加上 dx（0 以上、取整數，小於 4 當 0）；回傳新的間距 */
export function applyGap(people: People, id: string, dx: number): number {
  const p = people[id];
  if (!isMember(p)) return 0;
  let g = Math.max(0, Math.round((p.gap || 0) + dx));
  if (g < 4) g = 0;
  if (g) p.gap = g;
  else delete p.gap;
  return g;
}

/**
 * 手動模式只移動父母（F47）：手動偏移加上 dx（絕對值小於 4 當 0），再調這個人的左側間距讓第一個孩子留在原地
 * （最多 6 次、差 < 2 px 停）。
 */
export function moveParentOnly(people: People, id: string, dx: number, opts: LayoutOptions): void {
  const p = people[id];
  if (!isMember(p)) return;
  const kid = kidsOf(people, id, opts)[0];
  if (!kid) return;
  const kx = () => layoutTree(people, opts).byId.get(kid.id)?.x ?? 0;
  const k0 = kx();
  let shift = Math.round((p.shift || 0) + dx);
  if (Math.abs(shift) < 4) shift = 0;
  if (shift) p.shift = shift;
  else delete p.shift;
  for (let i = 0; i < 6; i++) {
    const d = kx() - k0;
    if (Math.abs(d) < 2) break;
    const ng = Math.max(0, Math.round((p.gap || 0) - d));
    if (ng === (p.gap || 0)) break;
    if (ng) p.gap = ng;
    else delete p.gap;
  }
}

/* ---------- 搜尋 ---------- */

/** 名字或讀音包含 q 的所有人（成員與配偶，依加入的順序；F55） */
export function searchPeople(people: People, q: string): (Member | Spouse)[] {
  const t = q.trim();
  if (!t) return [];
  return Object.values(people).filter(
    (p) => (p.name || '').includes(t) || (p.reading || '').includes(t),
  );
}

/** 下一個要選的：從目前選取的人的下一個開始輪流 */
export function nextHit<T extends { id: string }>(hits: T[], selectedId: string | null): number {
  if (!hits.length) return -1;
  return (hits.findIndex((h) => h.id === selectedId) + 1) % hits.length;
}

/** 要展開的祖先（讓這個人出現在排版裡） */
export function ancestorIds(people: People, p: Member): string[] {
  return ancestors(people, p).map((a) => a.id);
}

/* ---------- 色分類 ---------- */

export function newCategory(board: Pick<Board, 'cats'>, id = newId('c')): Category {
  const n = board.cats.length;
  return { id, name: `分類 ${n + 1}`, color: CAT_PALETTE[n % CAT_PALETTE.length] };
}

/** 刪掉分類並清掉用到它的人 */
export function removeCategory(board: Board, catId: string): void {
  board.cats = board.cats.filter((c) => c.id !== catId);
  for (const p of Object.values(board.people)) if (p.cat === catId) delete p.cat;
}

/** 這張圖板用到的分類（依分類的順序） */
export function usedCategories(board: Board, ids?: Iterable<string>): Category[] {
  const used = new Set<string>();
  const list = ids
    ? [...ids].map((id) => board.people[id]).filter(Boolean)
    : Object.values(board.people);
  for (const p of list) if (p?.cat) used.add(p.cat);
  return board.cats.filter((c) => used.has(c.id));
}
