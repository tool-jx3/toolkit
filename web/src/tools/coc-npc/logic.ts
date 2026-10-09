/**
 * CoC NPC 產生器的純邏輯（不依賴 React）：NPC 資料、擲屬性、衍生值、CCFOLIA 角色 JSON 與聊天面板、
 * 舊存檔搬移、專案檔整理。規則照舊版 trpg-lab（coc_npc_token.js），規格見 docs/refactor/specs/coc-npc.md。
 */
import { type CcfoliaCharacterData, serializeCharacterClipboard } from '@/ccfolia';
import {
  CHARACTERISTICS,
  type Characteristic,
  type CocEdition,
  type DiceParseError,
  derivedStats,
  parseDiceExpression,
  type RandomSource,
  rollDiceTerms,
} from '@/core/coc';
import { OUT } from './strings';

export const TOOL_ID = 'coc-npc';
/** 舊版（trpg-lab 的 CoC NPC 製作／管理工具）的存檔（localStorage） */
export const LEGACY_KEY = 'iklab_coc_npc_token_v1';

export type CommandType = 'CC' | 'CCB';
export type OutputKind = 'json' | 'palette';

export interface Ability {
  /** 骰子算式（空白＝不擲） */
  dice: string;
  value: number;
}

export interface SkillRow {
  id: string;
  name: string;
  value: number;
}

export interface CommandRow {
  id: string;
  name: string;
  expr: string;
}

export interface Npc {
  id: string;
  edition: CocEdition;
  name: string;
  /** 參照網址（介面上沒有欄位；舊存檔有的話照樣輸出） */
  externalUrl: string;
  abilities: Record<Characteristic, Ability>;
  hp: number;
  mp: number;
  san: number;
  /** 輸出 SAN（關掉時 SAN 的狀態、聊天面板的理智檢定與 //SAN= 都不輸出） */
  sanEnabled: boolean;
  db: string;
  /** 體格（只有 7 版輸出） */
  build: number;
  /** MOV／移動力（原生數字欄的值字串，空白＝不輸出） */
  mov: string;
  skills: SkillRow[];
  commands: CommandRow[];
  /** 6 版聊天面板的檢定指令 */
  commandType: CommandType;
  memo: string;
}

export interface NpcData {
  npcs: Npc[];
}

/* ---------- 建立 ---------- */

let seq = 0;
export function uid(prefix = 'n'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const blankSkill = (): SkillRow => ({ id: uid('s'), name: '', value: 0 });
export const blankCommand = (): CommandRow => ({ id: uid('c'), name: '', expr: '' });

/** 新的 NPC（舊版：屬性與衍生值都是 0、DB「0」，不先算衍生值；技能、指令各一列空白） */
export function newNpc(edition: CocEdition = 7): Npc {
  const abilities = Object.fromEntries(
    CHARACTERISTICS.map((s) => [s, { dice: '', value: 0 }]),
  ) as Record<Characteristic, Ability>;
  return {
    id: uid(),
    edition,
    name: OUT.defaultName,
    externalUrl: '',
    abilities,
    hp: 0,
    mp: 0,
    san: 0,
    sanEnabled: true,
    db: '0',
    build: 0,
    mov: '',
    skills: [blankSkill()],
    commands: [blankCommand()],
    commandType: 'CC',
    memo: '',
  };
}

export function initialData(): NpcData {
  return { npcs: [newNpc(7)] };
}

/* ---------- 計算 ---------- */

const value = (npc: Npc, s: Characteristic) => npc.abilities[s]?.value || 0;

/** 依屬性重新算 HP、MP、SAN、DB（7 版另算體格；6 版的體格不動） */
export function recalc(npc: Npc): Npc {
  const values = Object.fromEntries(CHARACTERISTICS.map((s) => [s, value(npc, s)]));
  const d = derivedStats(npc.edition, values);
  return { ...npc, hp: d.hp, mp: d.mp, san: d.san, db: d.db, build: d.build ?? npc.build };
}

export type AbilityRoll = { ok: true; value: number } | { ok: false; error: DiceParseError };

/** 擲一項屬性：算式的結果（7 版 ×5），最少 0 */
export function rollAbilityValue(
  dice: string,
  edition: CocEdition,
  random?: RandomSource,
): AbilityRoll {
  const parsed = parseDiceExpression(dice);
  if (!parsed.ok) return parsed;
  const total = rollDiceTerms(parsed.terms, random).total;
  return { ok: true, value: Math.max(0, edition === 7 ? total * 5 : total) };
}

/** 算式欄的檢查（空白不算錯） */
export function diceError(dice: string): DiceParseError | null {
  const parsed = parseDiceExpression(dice);
  return parsed.ok || parsed.error === 'empty' ? null : parsed.error;
}

/** 擲一項（算式空白時不變；看不懂時回傳錯誤、不變）；擲了就重新算衍生值 */
export function rollAbility(
  npc: Npc,
  stat: Characteristic,
  random?: RandomSource,
): { npc: Npc; error: DiceParseError | null } {
  const dice = npc.abilities[stat]?.dice ?? '';
  if (!dice) return { npc, error: null };
  const r = rollAbilityValue(dice, npc.edition, random);
  if (!r.ok) return { npc, error: r.error };
  return {
    npc: recalc({ ...npc, abilities: { ...npc.abilities, [stat]: { dice, value: r.value } } }),
    error: null,
  };
}

/**
 * 全部擲骰：依 STR、CON、POW、DEX、APP、SIZ、INT、EDU 的順序擲有算式的項目（空白的跳過、看不懂的不擲並回報），
 * 最後一律重新算衍生值（舊版即使沒有任何算式也會重算）。
 */
export function rollAllAbilities(
  npc: Npc,
  random?: RandomSource,
): { npc: Npc; errors: Characteristic[] } {
  const abilities = { ...npc.abilities };
  const errors: Characteristic[] = [];
  for (const s of CHARACTERISTICS) {
    const dice = abilities[s]?.dice ?? '';
    if (!dice) continue;
    const r = rollAbilityValue(dice, npc.edition, random);
    if (r.ok) abilities[s] = { dice, value: r.value };
    else errors.push(s);
  }
  return { npc: recalc({ ...npc, abilities }), errors };
}

/* ---------- 輸出 ---------- */

/** MOV 的標籤：7 版 MOV、6 版「移動力」（畫面、params 與聊天面板共用） */
export function movLabel(edition: CocEdition): string {
  return edition === 7 ? OUT.mov7 : OUT.mov6;
}

/** 指令算式裡獨立的 DB（大小寫不拘）與 {db} 都換成 {DB} */
export function replaceDb(expr: string): string {
  return expr.replace(/\{[Dd][Bb]\}|(?<![A-Za-z0-9_{])[Dd][Bb](?![A-Za-z0-9_}])/g, '{DB}');
}

/** 有填的 MOV（整數）；空白或讀不出數字時 null */
export function movValue(mov: string): number | null {
  if (mov === '') return null;
  const n = Number.parseInt(mov, 10);
  return Number.isNaN(n) ? null : n;
}

/** 聊天面板（每行一個指令，LF） */
export function chatPalette(npc: Npc): string {
  const v = (s: Characteristic) => value(npc, s);
  /* 6 版的屬性是原始值，檢定用 ×5 */
  const check = (s: Characteristic) => (npc.edition === 6 ? v(s) * 5 : v(s));
  const ct = npc.edition === 7 ? 'CC' : npc.commandType || 'CC';
  const lines: string[] = [];
  if (npc.sanEnabled) lines.push(`${ct}<=${npc.san} ${OUT.sanRoll}`);
  for (const s of CHARACTERISTICS) lines.push(`${ct}<=${check(s)} ${s}`);
  for (const sk of npc.skills) if (sk.name) lines.push(`${ct}<=${sk.value} ${sk.name}`);
  for (const c of npc.commands) {
    if (!c.expr) continue;
    const expr = replaceDb(c.expr);
    /* BCDice 只認行首的指令：算式在前、名稱在後（5. D2） */
    lines.push(c.name ? `${expr} ${c.name}` : expr);
  }
  lines.push(`//HP=${npc.hp}`, `//MP=${npc.mp}`);
  if (npc.sanEnabled) lines.push(`//SAN=${npc.san}`);
  lines.push(`//DB=${npc.db || '0'}`);
  if (npc.edition === 7) lines.push(`//${OUT.build}=${npc.build}`);
  if (npc.mov !== '') lines.push(`//${movLabel(npc.edition)}=${npc.mov}`);
  for (const s of CHARACTERISTICS) lines.push(`//${s}=${v(s)}`);
  return lines.join('\n');
}

/** CCFOLIA 角色資料（剪貼簿 JSON 的 data） */
export function ccfoliaData(npc: Npc): CcfoliaCharacterData {
  const status = [
    { label: 'HP', value: npc.hp, max: npc.hp },
    { label: 'MP', value: npc.mp, max: npc.mp },
  ];
  if (npc.sanEnabled) status.push({ label: 'SAN', value: npc.san, max: npc.san });
  const params: { label: string; value: string }[] = CHARACTERISTICS.map((s) => ({
    label: s,
    value: String(value(npc, s)),
  }));
  params.push({ label: 'DB', value: npc.db || '0' });
  if (npc.edition === 7) params.push({ label: OUT.build, value: String(npc.build) });
  const mov = movValue(npc.mov);
  if (mov !== null) params.push({ label: movLabel(npc.edition), value: String(mov) });
  return {
    name: npc.name || OUT.unnamed,
    initiative: value(npc, 'DEX'),
    externalUrl: npc.externalUrl || '',
    status,
    params,
    commands: chatPalette(npc),
    memo: npc.memo || '',
  };
}

/** 輸出的欄位與順序（與舊版相同） */
export const NPC_JSON_FIELDS = Object.freeze([
  'name',
  'initiative',
  'externalUrl',
  'status',
  'params',
  'commands',
  'memo',
] as const);

/** CCFOLIA 角色剪貼簿 JSON（2 格縮排） */
export function ccfoliaJson(npc: Npc): string {
  return serializeCharacterClipboard(ccfoliaData(npc), { fields: NPC_JSON_FIELDS });
}

export function outputText(npc: Npc, kind: OutputKind): string {
  return kind === 'json' ? ccfoliaJson(npc) : chatPalette(npc);
}

/* ---------- 讀存檔、專案檔、舊存檔 ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

/** 整理一個 NPC（新版或舊版的格式；壞掉的欄位用預設值） */
export function sanitizeNpc(raw: unknown): Npc {
  const r = isRecord(raw) ? raw : {};
  const base = newNpc(7);
  const edition: CocEdition =
    r.edition === 6 || r.edition === 7 ? r.edition : r.version === '6' || r.version === 6 ? 6 : 7;
  const rawAbilities = isRecord(r.abilities) ? r.abilities : {};
  const abilities = Object.fromEntries(
    CHARACTERISTICS.map((s) => {
      const a = isRecord(rawAbilities[s]) ? (rawAbilities[s] as Record<string, unknown>) : {};
      return [s, { dice: str(a.dice), value: num(a.value) }];
    }),
  ) as Record<Characteristic, Ability>;
  const mov = typeof r.mov === 'number' && Number.isFinite(r.mov) ? String(r.mov) : str(r.mov);
  return {
    id: str(r.id) || base.id,
    edition,
    name: str(r.name),
    externalUrl: str(r.externalUrl),
    abilities,
    hp: num(r.hp),
    mp: num(r.mp),
    san: num(r.san),
    sanEnabled: typeof r.sanEnabled === 'boolean' ? r.sanEnabled : true,
    db: str(r.db, '0'),
    build: num(r.build),
    mov,
    skills: Array.isArray(r.skills)
      ? r.skills.map((s) => {
          const x = isRecord(s) ? s : {};
          return { id: str(x.id) || uid('s'), name: str(x.name), value: num(x.value) };
        })
      : [blankSkill()],
    commands: Array.isArray(r.commands)
      ? r.commands.map((c) => {
          const x = isRecord(c) ? c : {};
          return { id: str(x.id) || uid('c'), name: str(x.name), expr: str(x.expr) };
        })
      : [blankCommand()],
    commandType: r.commandType === 'CCB' ? 'CCB' : 'CC',
    memo: str(r.memo),
  };
}

/** 整理 NPC 清單（至少一個；id 重複時換新的） */
export function sanitizeNpcData(raw: unknown): NpcData | null {
  if (!isRecord(raw) || !Array.isArray(raw.npcs)) return null;
  const seen = new Set<string>();
  const npcs = raw.npcs.map((n) => {
    const npc = sanitizeNpc(n);
    if (seen.has(npc.id)) npc.id = uid();
    seen.add(npc.id);
    return npc;
  });
  return { npcs: npcs.length ? npcs : [newNpc(7)] };
}

/** 舊版存檔 `{ npcs, currentId }` → 新版的清單與目前的 NPC；讀不懂時 null */
export function fromLegacy(raw: string | null): { data: NpcData; currentId: string | null } | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const data = sanitizeNpcData(isRecord(parsed) ? { npcs: parsed.npcs ?? [] } : null);
    if (!data) return null;
    const currentId =
      isRecord(parsed) && typeof parsed.currentId === 'string' ? parsed.currentId : null;
    return { data, currentId };
  } catch {
    return null;
  }
}

/** 目前的 NPC：找不到時第一個 */
export function currentNpc(data: NpcData, id: string | null): Npc {
  return data.npcs.find((n) => n.id === id) ?? data.npcs[0];
}

/** 專案檔的內容 */
export interface NpcProject extends NpcData {
  currentId: string | null;
}

export function readProject(raw: unknown): NpcProject | null {
  const data = sanitizeNpcData(raw);
  if (!data) return null;
  const id = isRecord(raw) && typeof raw.currentId === 'string' ? raw.currentId : null;
  return { ...data, currentId: data.npcs.some((n) => n.id === id) ? id : data.npcs[0].id };
}
