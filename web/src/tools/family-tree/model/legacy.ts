/**
 * 讀原作（가계도 편집기）的備份檔（規格 2.、3.5）：
 * - `family-tree/v1`：一張圖板 `{ title, meta, people }`
 * - `family-tree-all/v1`：`{ boards: [{ title, createdAt, meta, people }] }`
 * 欄位對應：hanja → 讀音、alias → 別名、clan → 出身、parentNote → 父母、gx → 左側間距、nx → 手動偏移；
 * 出系／入系、婚姻連結放進第二批預留的欄位（adopt、link）。讀進來的每張圖板都是新的圖板（新的圖板 id）。
 */
import { cleanBoard } from './sanitize';
import { type Board, newId } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export const LEGACY_ONE = 'family-tree/v1';
export const LEGACY_ALL = 'family-tree-all/v1';

/** 看起來是不是原作的備份檔（格式字串，或至少有 people） */
export function isLegacyBackup(json: unknown): boolean {
  if (!isObj(json)) return false;
  if (json.format === LEGACY_ALL) return Array.isArray(json.boards);
  if (json.format === LEGACY_ONE) return isObj(json.people);
  return false;
}

/** 原作的一位人物 → 本站的欄位（還沒整理；cleanBoard 會整理） */
function convertPerson(raw: Obj): Obj {
  const out: Obj = {
    id: raw.id,
    kind: raw.kind === 'spouse' ? 'spouse' : 'member',
    name: raw.name,
    reading: raw.hanja,
    birth: raw.birth,
    death: raw.death,
    note: raw.note,
    cat: raw.cat,
    order: raw.order,
  };
  if (out.kind === 'spouse') {
    out.spouseOf = raw.spouseOf;
    out.origin = raw.clan;
    out.parents = raw.parentNote;
    if (typeof raw.linkId === 'string' && raw.linkId)
      out.link = { personId: raw.linkId, pairId: raw.pairId, auto: raw.auto === true };
    return out;
  }
  out.gender = raw.gender;
  out.alias = raw.alias;
  out.fatherId = raw.fatherId;
  out.motherId = raw.motherId;
  out.gen = raw.gen;
  out.gap = raw.gx;
  out.shift = raw.nx;
  const adoptTo =
    typeof raw.adoptFatherId === 'string' && raw.adoptFatherId ? raw.adoptFatherId : null;
  if (adoptTo || raw.adoptType === '출계' || raw.adoptType === '입양') {
    out.adopt = {
      fatherId: adoptTo,
      kind: raw.adoptType === '입양' ? 'adopted' : 'heir',
      order: raw.stubOrder,
      gap: raw.sgx,
    };
  }
  return out;
}

function convertBoard(raw: Obj, fallbackTitle: string): Board | null {
  const meta = isObj(raw.meta) ? raw.meta : {};
  const title =
    (typeof raw.title === 'string' && raw.title.trim()) ||
    (typeof meta.title === 'string' && meta.title.trim()) ||
    fallbackTitle;
  const people: Obj = {};
  if (isObj(raw.people))
    for (const [key, p] of Object.entries(raw.people)) if (isObj(p)) people[key] = convertPerson(p);
  return cleanBoard(
    {
      id: newId('b'),
      title,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      align: meta.align,
      cats: meta.cats,
      people,
    },
    fallbackTitle,
  );
}

/** 原作的備份檔 → 圖板（不是原作的備份檔時丟錯） */
export function boardsFromLegacy(json: unknown, fallbackTitle: string): Board[] {
  if (!isLegacyBackup(json)) throw new Error('not a legacy backup');
  const o = json as Obj;
  const list = o.format === LEGACY_ALL ? (o.boards as unknown[]) : [o];
  const out: Board[] = [];
  for (const b of list) {
    if (!isObj(b)) continue;
    const board = convertBoard(b, fallbackTitle);
    if (board) out.push(board);
  }
  return out;
}
