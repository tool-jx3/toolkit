/**
 * 團報產生器的設定（表單）：型別、預設值、選項（系統、身分、標記）、讀回存檔時的整理。
 * 規格：docs/refactor/specs/session-report.md 1.2～1.6、3.1。
 */
import { isUnicodeTextStyle, type UnicodeTextStyle } from '@/core/social';
import { TEMPLATE_IDS, type TemplateId } from './templates';

/** 系統選單（依序；name 是寫進團報的名稱） */
export const SYSTEMS = [
  { key: 'call_of_cthulhu', name: 'Call of Cthulhu' },
  { key: 'coc', name: 'CoC' },
  { key: 'coc6', name: 'CoC6' },
  { key: 'coc7', name: 'CoC7' },
  { key: 'new_coc', name: '新克蘇魯神話TRPG' },
  { key: 'emoklore_en', name: 'emoklore-trpg' },
  { key: 'emoklore_ja', name: 'Emoklore TRPG' },
  { key: 'madamisu', name: '謀殺之謎' },
  { key: 'shinobigami', name: '忍神' },
  { key: 'insane', name: 'Insane' },
  { key: 'double_cross', name: '雙重十字 The 3rd Edition' },
  { key: 'sword_world_25', name: '劍世界2.5' },
  { key: 'futari_sousa', name: '二人搜查' },
] as const;

export type SystemKey = (typeof SYSTEMS)[number]['key'] | 'custom';

export const SYSTEM_KEYS: readonly SystemKey[] = [...SYSTEMS.map((s) => s.key), 'custom'];

/** 選了這些系統時，所有主持人的身分改成 DL（F12） */
export const DL_SYSTEMS: readonly SystemKey[] = ['emoklore_en', 'emoklore_ja'];

export function systemName(key: SystemKey): string {
  return SYSTEMS.find((s) => s.key === key)?.name ?? '';
}

/** 主持人的身分（值就是寫進團報的文字） */
export const GM_ROLES = ['KP', 'DL', 'GM', 'KPC/KP', 'SKP', '作/KP', '主持'] as const;
export type GmRole = (typeof GM_ROLES)[number];

/** 第一位參加者的標記（決定所有人的標記，3.1） */
export const SLOT_BASES = ['PC', 'PC1', 'HO1', 'PC/PL', 'PL/PC', '自由'] as const;
export type SlotBase = (typeof SLOT_BASES)[number];

export type Honorific = 'none' | 'sama' | 'san';
export const HONORIFICS: readonly Honorific[] = ['none', 'sama', 'san'];
/** 敬稱實際加上的字 */
export const HONORIFIC_TEXT: Readonly<Record<Honorific, string>> = {
  none: '',
  sama: '樣',
  san: '桑',
};

export type NameOrder = 'pcpl' | 'plpc';

export interface GmRow {
  id: string;
  role: GmRole;
  name: string;
}

export interface PlayerRow {
  id: string;
  ho: string;
  pc: string;
  pl: string;
}

export interface ReportSettings {
  template: TemplateId;
  fontStyle: UnicodeTextStyle;
  system: SystemKey;
  customSystem: string;
  author: string;
  scenario: string;
  result: string;
  honorific: Honorific;
  gms: GmRow[];
  nameOrder: NameOrder;
  slot: SlotBase;
  players: PlayerRow[];
  date: string;
  hashtags: string;
  memo: string;
}

let seq = 0;
/** 列的識別碼（只在這個瀏覽器裡用來分辨列） */
export function newRowId(prefix: 'g' | 'p'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const newGm = (role: GmRole = 'KP', name = ''): GmRow => ({ id: newRowId('g'), role, name });
export const newPlayer = (pl = '', pc = '', ho = ''): PlayerRow => ({
  id: newRowId('p'),
  ho,
  pc,
  pl,
});

export function defaultSettings(): ReportSettings {
  return {
    template: TEMPLATE_IDS[0],
    fontStyle: 'sansBoldItalic',
    system: 'call_of_cthulhu',
    customSystem: '',
    author: '',
    scenario: '',
    result: '',
    honorific: 'none',
    gms: [newGm()],
    nameOrder: 'pcpl',
    slot: 'HO1',
    players: [newPlayer()],
    date: '',
    hashtags: '',
    memo: '',
  };
}

/* ---------- 讀回存檔時的整理 ---------- */

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/**
 * 把存檔（或其他來源）的物件整理成合法的設定：認不得的選項回到預設、欄位補成字串、
 * 列缺識別碼或重複時重新編號。不是物件時回傳 null。
 */
export function restoreSettings(raw: unknown): ReportSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const d = defaultSettings();
  const used = new Set<string>();
  const uniqueId = (v: unknown, prefix: 'g' | 'p'): string => {
    const id = typeof v === 'string' && v && !used.has(v) ? v : newRowId(prefix);
    used.add(id);
    return id;
  };
  const gms = Array.isArray(r.gms)
    ? r.gms
        .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
        .map((g) => ({
          id: uniqueId(g.id, 'g'),
          role: oneOf(GM_ROLES, g.role, 'KP'),
          name: str(g.name),
        }))
    : d.gms;
  const players = Array.isArray(r.players)
    ? r.players
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({ id: uniqueId(p.id, 'p'), ho: str(p.ho), pc: str(p.pc), pl: str(p.pl) }))
    : d.players;
  return {
    template: oneOf(TEMPLATE_IDS, r.template, d.template),
    fontStyle: isUnicodeTextStyle(r.fontStyle) ? r.fontStyle : d.fontStyle,
    system: oneOf(SYSTEM_KEYS, r.system, d.system),
    customSystem: str(r.customSystem),
    author: str(r.author),
    scenario: str(r.scenario),
    result: str(r.result),
    honorific: oneOf(HONORIFICS, r.honorific, d.honorific),
    gms,
    nameOrder: r.nameOrder === 'plpc' ? 'plpc' : 'pcpl',
    slot: oneOf(SLOT_BASES, r.slot, d.slot),
    players,
    date: str(r.date),
    hashtags: str(r.hashtags),
    memo: str(r.memo),
  };
}
