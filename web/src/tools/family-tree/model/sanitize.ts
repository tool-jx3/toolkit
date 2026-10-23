/**
 * 讀檔時整理資料（規格 3.5）：自動儲存、專案檔、原作的備份檔都經過這裡。
 * 文字截到上限、性別不認得時當男性、排序值不是數字時依出現順序、指到不存在的人的關係清掉、
 * 沒有 spouseOf 的配偶丟掉、父親的位置不認得時置中、色分類的顏色不是色碼時用預設色。
 */
import { CAT_PALETTE } from './palette';
import {
  type AdoptInfo,
  ALIGNS,
  type Align,
  type Board,
  type Category,
  type Gender,
  type LifeStatus,
  LIMITS,
  type LinkInfo,
  type Member,
  newId,
  type People,
  type Person,
  type Spouse,
  type TreeData,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** 文字：不是字串時空白；截到上限（以字元計） */
export function clip(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const s = String(v);
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('') : s;
}

const optText = (v: unknown, max: number): string | undefined => {
  const s = clip(v, max);
  return s ? s : undefined;
};

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const STATUSES: readonly LifeStatus[] = ['alive', 'dead', 'missing'];

function cleanAdopt(v: unknown): AdoptInfo | undefined {
  if (!isObj(v)) return undefined;
  const kind = v.kind === 'adopted' ? 'adopted' : v.kind === 'heir' ? 'heir' : null;
  if (!kind) return undefined;
  const out: AdoptInfo = { fatherId: typeof v.fatherId === 'string' ? v.fatherId : null, kind };
  const o = num(v.order);
  if (o !== undefined) out.order = o;
  const g = num(v.gap);
  if (g !== undefined && g > 0) out.gap = Math.round(g);
  return out;
}

function cleanLink(v: unknown): LinkInfo | undefined {
  if (!isObj(v) || typeof v.personId !== 'string' || !v.personId) return undefined;
  const out: LinkInfo = { personId: v.personId };
  if (typeof v.pairId === 'string' && v.pairId) out.pairId = v.pairId;
  if (v.auto === true) out.auto = true;
  return out;
}

/** 共同的欄位 */
function base(raw: Obj, id: string, order: number) {
  const out: Pick<
    Person,
    'id' | 'name' | 'reading' | 'birth' | 'death' | 'note' | 'cat' | 'order' | 'status' | 'secret' | 'avatar'
  > = {
    id,
    name: clip(raw.name, LIMITS.name),
    order,
  };
  const reading = optText(raw.reading, LIMITS.reading);
  if (reading) out.reading = reading;
  const birth = optText(raw.birth, LIMITS.year);
  if (birth) out.birth = birth;
  const death = optText(raw.death, LIMITS.year);
  if (death) out.death = death;
  const note = optText(raw.note, LIMITS.note);
  if (note) out.note = note;
  if (typeof raw.cat === 'string' && raw.cat) out.cat = raw.cat;
  if (STATUSES.includes(raw.status as LifeStatus)) out.status = raw.status as LifeStatus;
  const secret = optText(raw.secret, LIMITS.note);
  if (secret) out.secret = secret;
  if (typeof raw.avatar === 'string' && raw.avatar) out.avatar = raw.avatar;
  return out;
}

/** 一位人物（id 由呼叫端決定；不合用時 null） */
function cleanPerson(raw: unknown, id: string, fallbackOrder: number): Person | null {
  if (!isObj(raw)) return null;
  const order = num(raw.order) ?? fallbackOrder;
  if (raw.kind === 'spouse') {
    if (typeof raw.spouseOf !== 'string' || !raw.spouseOf) return null;
    const s: Spouse = { ...base(raw, id, order), kind: 'spouse', spouseOf: raw.spouseOf };
    const origin = optText(raw.origin, LIMITS.origin);
    if (origin) s.origin = origin;
    const parents = optText(raw.parents, LIMITS.parents);
    if (parents) s.parents = parents;
    const link = cleanLink(raw.link);
    if (link) s.link = link;
    return s;
  }
  const gender: Gender = raw.gender === 'F' ? 'F' : 'M';
  const m: Member = { ...base(raw, id, order), kind: 'member', gender };
  const alias = optText(raw.alias, LIMITS.alias);
  if (alias) m.alias = alias;
  if (typeof raw.fatherId === 'string' && raw.fatherId) m.fatherId = raw.fatherId;
  if (typeof raw.motherId === 'string' && raw.motherId) m.motherId = raw.motherId;
  const gen = num(raw.gen);
  if (gen !== undefined && gen >= 1) m.gen = Math.min(LIMITS.gen, Math.floor(gen));
  const gap = num(raw.gap);
  if (gap !== undefined && gap > 0) m.gap = Math.round(gap);
  const shift = num(raw.shift);
  if (shift !== undefined && shift !== 0) m.shift = Math.round(shift);
  const adopt = cleanAdopt(raw.adopt);
  if (adopt) m.adopt = adopt;
  return m;
}

/** 人物表：清掉指到不存在的人的關係、沒有成員的配偶（id 用鍵；保留順序） */
export function cleanPeople(raw: unknown): People {
  const out: People = {};
  if (!isObj(raw)) return out;
  let i = 0;
  for (const [key, v] of Object.entries(raw)) {
    i++;
    const id = isObj(v) && typeof v.id === 'string' && v.id ? v.id : key;
    if (!id || out[id]) continue;
    const p = cleanPerson(v, id, i);
    if (p) out[id] = p;
  }
  fixRefs(out);
  return out;
}

/** 指到不存在（或不是成員）的人的關係清掉；沒有成員的配偶刪掉（刪除人物之後也用） */
export function fixRefs(people: People): void {
  for (const p of Object.values(people)) {
    if (p.kind === 'spouse' && people[p.spouseOf]?.kind !== 'member') delete people[p.id];
  }
  for (const p of Object.values(people)) {
    if (p.kind === 'member') {
      if (p.fatherId && !people[p.fatherId]) delete p.fatherId;
      if (p.motherId && !people[p.motherId]) delete p.motherId;
      if (p.fatherId === p.id) delete p.fatherId;
      if (p.motherId === p.id) delete p.motherId;
      if (p.adopt?.fatherId && !people[p.adopt.fatherId]) delete p.adopt;
    } else {
      if (p.link && people[p.link.personId]?.kind !== 'member') delete p.link;
      else if (p.link?.pairId && !people[p.link.pairId]) delete p.link.pairId;
    }
  }
}

function cleanCats(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const out: Category[] = [];
  const seen = new Set<string>();
  raw.forEach((c, i) => {
    if (!isObj(c) || typeof c.id !== 'string' || !c.id || seen.has(c.id)) return;
    seen.add(c.id);
    out.push({
      id: c.id,
      name: clip(c.name, LIMITS.catName),
      color:
        typeof c.color === 'string' && HEX.test(c.color)
          ? c.color.toLowerCase()
          : CAT_PALETTE[i % CAT_PALETTE.length],
    });
  });
  return out;
}

export function cleanAlign(v: unknown): Align {
  return ALIGNS.includes(v as Align) ? (v as Align) : 'center';
}

export function cleanBoard(raw: unknown, fallbackTitle = '家系圖'): Board | null {
  if (!isObj(raw)) return null;
  const title = clip(raw.title, LIMITS.title).trim() || fallbackTitle;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('b'),
    title,
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
    align: cleanAlign(raw.align),
    cats: cleanCats(raw.cats),
    people: cleanPeople(raw.people),
  };
}

/** 整份資料：圖板 id 重複時換新的；最多 LIMITS.boards 張 */
export function cleanTreeData(raw: unknown): TreeData {
  const list = isObj(raw) && Array.isArray(raw.boards) ? raw.boards : [];
  const boards: Board[] = [];
  const ids = new Set<string>();
  for (const b of list) {
    if (boards.length >= LIMITS.boards) break;
    const board = cleanBoard(b);
    if (!board) continue;
    if (ids.has(board.id)) board.id = newId('b');
    ids.add(board.id);
    boards.push(board);
  }
  return { boards };
}
