/**
 * 先攻與戰鬥追蹤的資料與規則（不依賴 React，單元測試直接跑）。
 * 函式大多直接改傳進來的資料（store 裡用 Immer 的 draft 呼叫；測試傳一般的物件）。
 * 規格：docs/refactor/specs/combat-tracker.md。
 */
import type { CombatSeed, CombatSide } from '@/core/combat';
import { concentrationDc, DEATH_SAVE_DC, DEATH_SAVE_LIMIT } from '@/core/srd5/srd52/combat';
import { srdCondition } from '@/core/srd5/srd52/conditions';

export const TOOL_ID = 'combat-tracker';
export const DATA_VERSION = 1;

export const LIMITS = {
  name: 60,
  list: 200,
  qty: 20,
  init: [-99, 99],
  initMod: [-20, 20],
  ac: [0, 99],
  hp: [1, 99999],
  temp: [0, 99999],
  rounds: [1, 999],
  round: [1, 9999],
  note: 500,
  customConds: 50,
  customName: 20,
  conds: 30,
} as const;

export type Side = CombatSide;
export const SIDES: readonly Side[] = ['pc', 'ally', 'enemy'];
export type InitDie = 'none' | 'd20' | 'd10' | '2d6';
export const INIT_DICE: readonly InitDie[] = ['none', 'd20', 'd10', '2d6'];
export type HpShow = 'exact' | 'rough' | 'none';
export const HP_SHOWS: readonly HpShow[] = ['none', 'rough', 'exact'];

export interface CondInst {
  id: string;
  kind: 'srd' | 'custom';
  /** srd：SRD 5.2.1 的鍵（prone…）；custom：狀態的名稱 */
  key: string;
  /** 剩幾輪（null＝不限）：每次輪到這位參戰者時減 1，到 0 拿掉 */
  rounds: number | null;
  /** 力竭的等級（1～6） */
  level?: number;
}

export interface DeathSaves {
  ok: number;
  ng: number;
  stable: boolean;
  dead: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  side: Side;
  init: number | null;
  initMod: number | null;
  ac: number | null;
  /** 目前的 HP（null＝不追蹤 HP） */
  hp: number | null;
  maxHp: number | null;
  temp: number;
  conds: CondInst[];
  death: DeathSaves;
  /** 玩家視圖與複製的文字不顯示（還沒登場的伏兵） */
  hidden: boolean;
  note: string;
}

export interface Settings {
  /** 鎖定順序：加入與改先攻時不重新排序、不能拖曳 */
  lockOrder: boolean;
  /** 輪到 0 HP 的敵方、友方與死亡的參戰者時跳過 */
  skipDown: boolean;
  /** 5e：玩家角色的死亡豁免 */
  deathSaves: boolean;
  /** 5e：SRD 5.2.1 的狀態 */
  srdConds: boolean;
  /** 擲先攻用的骰子 */
  initDie: InitDie;
  /** 同名的一起擲（共用一次） */
  groupRoll: boolean;
  /** 玩家視圖：敵方與我方（玩家角色、友方）的 HP 怎麼顯示 */
  playerHpEnemy: HpShow;
  playerHpParty: HpShow;
  /** 玩家視圖顯示狀態 */
  playerConds: boolean;
}

export interface CombatData {
  list: Combatant[];
  /** 目前輪到的參戰者（null＝還沒按過下一位：順序的第一位） */
  turn: string | null;
  round: number;
  settings: Settings;
  /** 自訂狀態的名稱（加狀態時的候選） */
  customConds: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  lockOrder: false,
  skipDown: true,
  deathSaves: true,
  srdConds: true,
  initDie: 'd20',
  groupRoll: true,
  playerHpEnemy: 'rough',
  playerHpParty: 'exact',
  playerConds: true,
};

export const DEFAULT_CUSTOM_CONDS = ['祝福', '加速', '標記'];

export function initialData(): CombatData {
  return {
    list: [],
    turn: null,
    round: 1,
    settings: { ...DEFAULT_SETTINGS },
    customConds: [...DEFAULT_CUSTOM_CONDS],
  };
}

export type Rng = () => number;

let idSeq = 0;
export function newId(prefix = 'c'): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `${prefix}-${c.randomUUID().slice(0, 8)}`;
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}${idSeq.toString(36)}`;
}

const clampInt = (v: number, [min, max]: readonly [number, number]): number =>
  Math.min(max, Math.max(min, Math.round(v)));

const cut = (s: string, n: number): string => Array.from(s).slice(0, n).join('');

/* ---------- 名字 ---------- */

/** 0 → A、25 → Z、26 → AA（試算表的欄名） */
export function suffixLetters(n: number): string {
  let s = '';
  let k = n;
  do {
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return s;
}

/** suffixLetters 的反向：A → 0、AA → 26 */
function lettersIndex(s: string): number {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const SUFFIX_RE = /^(.*\S) ([A-Z]{1,3})$/;

/** 拿掉名字最後的「 A」「 B」…（同名多隻加的字尾） */
export function baseName(name: string): string {
  const m = SUFFIX_RE.exec(name);
  return m ? m[1] : name;
}

/**
 * 加 qty 隻名叫 name 的參戰者時各自的名字（原作的規則）：只加一隻、清單裡也沒有同名的時候不加字尾；
 * 否則加「 A」「 B」…，接在清單裡已經用到的最後一個字母後面（沒有字尾的同名者算 A）。
 */
export function namesFor(
  list: readonly Pick<Combatant, 'name'>[],
  name: string,
  qty: number,
): string[] {
  let max = -1;
  for (const c of list) {
    if (c.name === name) max = Math.max(max, 0);
    else {
      const m = SUFFIX_RE.exec(c.name);
      if (m && m[1] === name) max = Math.max(max, lettersIndex(m[2]));
    }
  }
  if (qty === 1 && max < 0) return [name];
  return Array.from({ length: qty }, (_, i) => `${name} ${suffixLetters(max + 1 + i)}`);
}

/* ---------- 擲骰 ---------- */

export function rollDie(die: InitDie, rng: Rng = Math.random): number {
  const d = (n: number) => 1 + Math.floor(rng() * n);
  if (die === 'd20') return d(20);
  if (die === 'd10') return d(10);
  if (die === '2d6') return d(6) + d(6);
  return 0;
}

export const rollInit = (die: InitDie, mod: number | null, rng: Rng = Math.random): number =>
  clampInt(rollDie(die, rng) + (mod ?? 0), LIMITS.init);

/* ---------- 順序與回合 ---------- */

/** 依先攻由高到低（穩定排序：同分保持原本的順序；沒有先攻值的排最後） */
export function sortList(d: CombatData): void {
  const idx = new Map(d.list.map((c, i) => [c.id, i]));
  d.list.sort((a, b) => {
    const ia = a.init ?? Number.NEGATIVE_INFINITY;
    const ib = b.init ?? Number.NEGATIVE_INFINITY;
    if (ia !== ib) return ib - ia;
    return (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0);
  });
}

export type Status = 'ok' | 'down' | 'dying' | 'stable' | 'dead';

export function statusOf(c: Combatant, s: Settings): Status {
  if (c.death.dead) return 'dead';
  if (c.hp === 0) {
    if (s.deathSaves && c.side === 'pc') return c.death.stable ? 'stable' : 'dying';
    return 'down';
  }
  return 'ok';
}

/** 輪到時跳過：開了「跳過」時，死亡的、0 HP 的敵方與友方（玩家角色在 0 HP 時要擲死亡豁免，不跳過） */
export function skippable(c: Combatant, s: Settings): boolean {
  if (!s.skipDown) return false;
  const st = statusOf(c, s);
  return st === 'dead' || (c.side !== 'pc' && st === 'down');
}

/** 目前輪到的參戰者的 id（還沒開始時是順序的第一位；清單是空的時 null） */
export function currentId(d: CombatData): string | null {
  if (!d.list.length) return null;
  if (d.turn && d.list.some((c) => c.id === d.turn)) return d.turn;
  return d.list[0].id;
}

/** 輪到某位時：持續回合減 1，到 0 拿掉；回傳結束的狀態 */
export function tickConditions(c: Combatant): CondInst[] {
  const expired: CondInst[] = [];
  const keep: CondInst[] = [];
  for (const k of c.conds) {
    if (k.rounds === null) {
      keep.push(k);
      continue;
    }
    const left = k.rounds - 1;
    if (left <= 0) expired.push({ ...k });
    else keep.push({ ...k, rounds: left });
  }
  c.conds = keep;
  return expired;
}

export interface TurnResult {
  /** 輪到誰 */
  id: string | null;
  /** 換了一輪 */
  newRound: boolean;
  /** 這次結束的狀態 */
  expired: CondInst[];
}

/** 下一位：跳過可以跳過的（全部都可以跳過時照樣輪到下一位）；繞回第一位時輪數 +1；輪到的人的狀態持續回合減 1 */
export function nextTurn(d: CombatData): TurnResult {
  const n = d.list.length;
  if (!n) return { id: null, newRound: false, expired: [] };
  const cur = Math.max(
    0,
    d.list.findIndex((c) => c.id === currentId(d)),
  );
  let step = 1;
  for (; step <= n; step++) {
    if (!skippable(d.list[(cur + step) % n], d.settings)) break;
  }
  if (step > n) step = 1;
  const newRound = cur + step >= n;
  if (newRound) d.round = Math.min(LIMITS.round[1], d.round + 1);
  const target = d.list[(cur + step) % n];
  d.turn = target.id;
  const expired = tickConditions(target);
  return { id: target.id, newRound, expired };
}

/** 上一位（不會把持續回合加回來；要完全回到之前用復原）；從第一位往回時輪數 −1（最少 1） */
export function prevTurn(d: CombatData): TurnResult {
  const n = d.list.length;
  if (!n) return { id: null, newRound: false, expired: [] };
  const cur = Math.max(
    0,
    d.list.findIndex((c) => c.id === currentId(d)),
  );
  let step = 1;
  for (; step <= n; step++) {
    if (!skippable(d.list[(cur - step + n * 2) % n], d.settings)) break;
  }
  if (step > n) step = 1;
  const wrapped = cur - step < 0;
  if (wrapped) d.round = Math.max(1, d.round - 1);
  const target = d.list[(cur - step + n * 2) % n];
  d.turn = target.id;
  return { id: target.id, newRound: wrapped, expired: [] };
}

/** 把 from 移到 to（拖曳）；鎖定順序時不動 */
export function moveCombatant(d: CombatData, from: number, to: number): void {
  if (d.settings.lockOrder) return;
  if (from === to || from < 0 || to < 0 || from >= d.list.length || to >= d.list.length) return;
  const [c] = d.list.splice(from, 1);
  d.list.splice(to, 0, c);
}

/* ---------- 加入與刪除 ---------- */

export interface AddInput {
  name: string;
  side: Side;
  init: number | null;
  initMod: number | null;
  maxHp: number | null;
  ac: number | null;
  qty: number;
  note?: string;
  /** 沒有先攻值時一定擲 1d20（不看設定的骰子；5e 速查計算送來的怪物） */
  forceD20?: boolean;
}

export function blankCombatant(name: string, side: Side = 'enemy'): Combatant {
  return {
    id: newId(),
    name,
    side,
    init: null,
    initMod: null,
    ac: null,
    hp: null,
    maxHp: null,
    temp: 0,
    conds: [],
    death: { ok: 0, ng: 0, stable: false, dead: false },
    hidden: false,
    note: '',
  };
}

/**
 * 加入參戰者（qty 隻同名的）：先攻值空白時，設定的骰子不是「不擲」就擲（同名的一起擲時共用一次）；
 * 沒有鎖定順序時依先攻排序。清單最多 200 位，超過的不加。回傳加入的 id。
 */
export function addCombatants(d: CombatData, input: AddInput, rng: Rng = Math.random): string[] {
  const name = cut(input.name.trim(), LIMITS.name);
  if (!name) return [];
  const room = LIMITS.list - d.list.length;
  const qty = Math.min(room, clampInt(input.qty || 1, [1, LIMITS.qty]));
  if (qty <= 0) return [];
  const die: InitDie = input.forceD20 ? 'd20' : d.settings.initDie;
  const mod = input.initMod === null ? null : clampInt(input.initMod, LIMITS.initMod);
  const shared =
    input.init === null && die !== 'none' && d.settings.groupRoll ? rollInit(die, mod, rng) : null;
  const names = namesFor(d.list, name, qty);
  const ids: string[] = [];
  const maxHp = input.maxHp === null ? null : clampInt(input.maxHp, LIMITS.hp);
  for (const n of names) {
    const c = blankCombatant(n, input.side);
    c.init =
      input.init !== null
        ? clampInt(input.init, LIMITS.init)
        : die === 'none'
          ? null
          : (shared ?? rollInit(die, mod, rng));
    c.initMod = mod;
    c.maxHp = maxHp;
    c.hp = maxHp;
    c.ac = input.ac === null ? null : clampInt(input.ac, LIMITS.ac);
    if (input.note) c.note = cut(input.note, LIMITS.note);
    d.list.push(c);
    ids.push(c.id);
  }
  if (!d.settings.lockOrder) sortList(d);
  return ids;
}

/** 從別的工具送來的參戰者（`@/core/combat`）：一筆一筆加入；回傳加入了幾位 */
export function addSeeds(
  d: CombatData,
  seeds: readonly CombatSeed[],
  rng: Rng = Math.random,
): number {
  let n = 0;
  for (const s of seeds) {
    n += addCombatants(
      d,
      {
        name: s.name,
        side: s.side ?? 'enemy',
        init: s.init ?? null,
        initMod: s.initMod ?? null,
        maxHp: s.hp ?? null,
        ac: s.ac ?? null,
        qty: s.count ?? 1,
        note: s.note,
        forceD20: s.rollInit === true,
      },
      rng,
    ).length;
  }
  return n;
}

/** 刪除：刪掉的是目前輪到的人時，換成順序的下一位（不算輪到、狀態不減） */
export function removeCombatants(d: CombatData, ids: readonly string[]): void {
  const del = new Set(ids);
  const cur = d.turn;
  if (cur && del.has(cur)) {
    const i = d.list.findIndex((c) => c.id === cur);
    let next: string | null = null;
    for (let k = 1; k < d.list.length; k++) {
      const c = d.list[(i + k) % d.list.length];
      if (!del.has(c.id)) {
        next = c.id;
        break;
      }
    }
    d.turn = next;
  }
  d.list = d.list.filter((c) => !del.has(c.id));
  if (!d.list.length) d.turn = null;
}

/** 複製一份（名字照同名多隻的規則加字尾，HP 回到上限、狀態與死亡豁免清空） */
export function duplicateCombatant(d: CombatData, id: string): string | null {
  const src = d.list.find((c) => c.id === id);
  if (!src || d.list.length >= LIMITS.list) return null;
  /* 清單裡一定有同名的（自己），所以一定加字尾 */
  const [name] = namesFor(d.list, baseName(src.name), 1);
  const c: Combatant = {
    /* Immer 的 draft 不能 structuredClone：走 JSON */
    ...(JSON.parse(JSON.stringify(src)) as Combatant),
    id: newId(),
    name,
    hp: src.maxHp,
    temp: 0,
    conds: [],
    death: { ok: 0, ng: 0, stable: false, dead: false },
  };
  const i = d.list.findIndex((x) => x.id === id);
  d.list.splice(i + 1, 0, c);
  return c.id;
}

/** 新的戰鬥：拿掉玩家角色以外的參戰者，輪數回到 1、從順序的第一位開始；玩家角色的 HP 與狀態保留 */
export function newEncounter(d: CombatData): void {
  d.list = d.list.filter((c) => c.side === 'pc');
  d.turn = null;
  d.round = 1;
}

/** 改先攻值（沒有鎖定順序時重新排序；目前輪到的人跟著那位參戰者） */
export function setInit(d: CombatData, id: string, v: number | null): void {
  const c = d.list.find((x) => x.id === id);
  if (!c) return;
  c.init = v === null ? null : clampInt(v, LIMITS.init);
  if (!d.settings.lockOrder) sortList(d);
}

/**
 * 擲先攻：who＝'npc'（敵方與友方）、'all'、或某一位的 id。同名的一起擲時，同一個名字（去掉字尾）的參戰者共用一次。
 * 設定的骰子是「不擲」時不做事。回傳擲了幾位。
 */
export function rollInitiatives(
  d: CombatData,
  who: 'npc' | 'all' | string,
  rng: Rng = Math.random,
): number {
  const die = d.settings.initDie;
  if (die === 'none') return 0;
  const targets = d.list.filter((c) =>
    who === 'all' ? true : who === 'npc' ? c.side !== 'pc' : c.id === who,
  );
  const shared = new Map<string, number>();
  for (const c of targets) {
    const key = `${baseName(c.name)}\u0000${c.initMod ?? 0}`;
    if (d.settings.groupRoll && targets.length > 1) {
      if (!shared.has(key)) shared.set(key, rollInit(die, c.initMod, rng));
      c.init = shared.get(key) as number;
    } else c.init = rollInit(die, c.initMod, rng);
  }
  if (!d.settings.lockOrder) sortList(d);
  return targets.length;
}

/* ---------- HP ---------- */

export type HpEvent =
  | { kind: 'concentration'; dc: number }
  | { kind: 'died'; reason: 'massive' | 'failures' }
  | { kind: 'failure'; ng: number }
  | { kind: 'down' }
  | { kind: 'dead-no-heal' }
  | { kind: 'revived' };

const resetDeath = (c: Combatant) => {
  c.death = { ok: 0, ng: 0, stable: false, dead: false };
};

const hasConcentration = (c: Combatant) =>
  c.conds.some((k) => k.kind === 'srd' && k.key === 'concentration');

/**
 * 受到 n 點傷害：先扣臨時 HP，剩下的才扣 HP（最低 0）。
 * 5e 的死亡豁免開著時（玩家角色）：0 HP 時受到傷害算一次失敗（重擊兩次）、傷害達到 HP 上限時死亡；
 * 從有 HP 降到 0 時剩下的傷害達到 HP 上限也死亡（大量傷害）。專注中受到傷害時回傳專注檢定的 DC。
 */
export function applyDamage(
  d: CombatData,
  id: string,
  amount: number,
  { crit = false }: { crit?: boolean } = {},
): HpEvent[] {
  const c = d.list.find((x) => x.id === id);
  const n = Math.round(amount);
  if (!c || !(n > 0)) return [];
  const events: HpEvent[] = [];
  const absorbed = Math.min(c.temp, n);
  c.temp -= absorbed;
  const rest = n - absorbed;
  if (d.settings.srdConds && hasConcentration(c) && !c.death.dead)
    events.push({ kind: 'concentration', dc: concentrationDc(n) });
  if (c.hp === null || rest <= 0) return events;
  const prev = c.hp;
  c.hp = Math.max(0, prev - rest);
  const deathRules = d.settings.deathSaves && c.side === 'pc' && !c.death.dead;
  const max = c.maxHp ?? Number.POSITIVE_INFINITY;
  if (prev === 0) {
    if (deathRules) {
      if (rest >= max) {
        c.death.dead = true;
        events.push({ kind: 'died', reason: 'massive' });
      } else {
        c.death.stable = false;
        c.death.ng = Math.min(DEATH_SAVE_LIMIT, c.death.ng + (crit ? 2 : 1));
        if (c.death.ng >= DEATH_SAVE_LIMIT) {
          c.death.dead = true;
          events.push({ kind: 'died', reason: 'failures' });
        } else events.push({ kind: 'failure', ng: c.death.ng });
      }
    }
    return events;
  }
  if (c.hp === 0) {
    if (deathRules && rest - prev >= max) {
      c.death.dead = true;
      events.push({ kind: 'died', reason: 'massive' });
    } else events.push({ kind: 'down' });
  }
  return events;
}

/** 回復 n 點 HP（不超過上限；死亡的不回復）；從 0 回到 1 以上時死亡豁免歸零 */
export function applyHeal(d: CombatData, id: string, amount: number): HpEvent[] {
  const c = d.list.find((x) => x.id === id);
  const n = Math.round(amount);
  if (!c || !(n > 0) || c.hp === null) return [];
  if (c.death.dead) return [{ kind: 'dead-no-heal' }];
  const prev = c.hp;
  c.hp = Math.min(c.maxHp ?? Number.POSITIVE_INFINITY, prev + n);
  if (prev === 0 && c.hp > 0) {
    resetDeath(c);
    return [{ kind: 'revived' }];
  }
  return [];
}

/** 給臨時 HP：臨時 HP 不相加，留下比較多的那一個（SRD 5.2.1） */
export function grantTemp(d: CombatData, id: string, amount: number): void {
  const c = d.list.find((x) => x.id === id);
  const n = Math.round(amount);
  if (!c || !(n > 0)) return;
  c.temp = Math.max(c.temp, clampInt(n, LIMITS.temp));
}

/** 直接改臨時 HP（0 以上） */
export function setTemp(d: CombatData, id: string, v: number): void {
  const c = d.list.find((x) => x.id === id);
  if (c) c.temp = clampInt(v, LIMITS.temp);
}

/** 直接改目前的 HP（夾在 0～上限）；改成 1 以上時死亡豁免與死亡一起清掉 */
export function setHp(d: CombatData, id: string, v: number): void {
  const c = d.list.find((x) => x.id === id);
  if (!c || c.maxHp === null) return;
  c.hp = Math.min(c.maxHp, Math.max(0, Math.round(v)));
  if (c.hp > 0) resetDeath(c);
}

/** 改 HP 上限：空白＝不追蹤 HP；原本不追蹤時目前的 HP 從上限開始；目前的 HP 超過新的上限時降到上限 */
export function setMaxHp(d: CombatData, id: string, v: number | null): void {
  const c = d.list.find((x) => x.id === id);
  if (!c) return;
  if (v === null) {
    c.maxHp = null;
    c.hp = null;
    return;
  }
  const max = clampInt(v, LIMITS.hp);
  if (c.maxHp === null || c.hp === null) c.hp = max;
  c.maxHp = max;
  if (c.hp > max) c.hp = max;
}

/**
 * HP 欄裡打的字（原作的規則）：「+8」回復、「-8」受到傷害、「8」直接設成 8。全形數字、全形加減號與「−」也可以。
 * 看不懂時 null。
 */
export function parseHpEntry(text: string): { kind: 'heal' | 'damage' | 'set'; n: number } | null {
  const t = text.normalize('NFKC').replace(/\s+/g, '').replace(/[−–—]/g, '-');
  const m = /^([+-]?)(\d{1,6})$/.exec(t);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === '+') return { kind: 'heal', n };
  if (m[1] === '-') return { kind: 'damage', n };
  return { kind: 'set', n };
}

/* ---------- 死亡豁免（5e） ---------- */

export type DeathRoll = 'success' | 'failure' | 'crit-fail' | 'crit-success';

/** 擲出 roll（1～20）的死亡豁免：1＝兩次失敗、20＝回復 1 HP、10 以上成功；3 次成功穩定、3 次失敗死亡 */
export function applyDeathSave(d: CombatData, id: string, roll: number): DeathRoll | null {
  const c = d.list.find((x) => x.id === id);
  if (c?.hp !== 0 || c.death.dead) return null;
  if (roll >= 20) {
    c.hp = Math.min(1, c.maxHp ?? 1);
    resetDeath(c);
    return 'crit-success';
  }
  if (roll <= 1) {
    c.death.ng = Math.min(DEATH_SAVE_LIMIT, c.death.ng + 2);
    if (c.death.ng >= DEATH_SAVE_LIMIT) c.death.dead = true;
    return 'crit-fail';
  }
  if (roll >= DEATH_SAVE_DC) {
    c.death.ok += 1;
    if (c.death.ok >= DEATH_SAVE_LIMIT) c.death = { ok: 0, ng: 0, stable: true, dead: false };
    return 'success';
  }
  c.death.ng += 1;
  if (c.death.ng >= DEATH_SAVE_LIMIT) c.death.dead = true;
  return 'failure';
}

/** 點成功或失敗的格子：直接設成幾次（0～3）；3 次成功＝穩定、3 次失敗＝死亡 */
export function setDeathCount(d: CombatData, id: string, which: 'ok' | 'ng', n: number): void {
  const c = d.list.find((x) => x.id === id);
  if (!c) return;
  const v = clampInt(n, [0, DEATH_SAVE_LIMIT]);
  if (which === 'ok') {
    c.death.ok = v;
    c.death.stable = v >= DEATH_SAVE_LIMIT;
    if (c.death.stable) c.death.ok = 0;
  } else {
    c.death.ng = v;
    c.death.dead = v >= DEATH_SAVE_LIMIT;
  }
  if (c.death.stable) c.death.ng = 0;
}

/** 標成死亡／取消死亡（取消時死亡豁免歸零） */
export function setDead(d: CombatData, id: string, dead: boolean): void {
  const c = d.list.find((x) => x.id === id);
  if (!c) return;
  if (dead) c.death = { ok: 0, ng: 0, stable: false, dead: true };
  else resetDeath(c);
}

/* ---------- 狀態 ---------- */

export interface CondInput {
  kind: 'srd' | 'custom';
  key: string;
  rounds: number | null;
  level?: number;
}

/** 加上狀態：同一個狀態不重複（已經有時改成這次的持續回合與等級）。回傳有變的參戰者數 */
export function addCondition(d: CombatData, ids: readonly string[], input: CondInput): number {
  const key = input.kind === 'custom' ? cut(input.key.trim(), LIMITS.customName) : input.key;
  if (!key || (input.kind === 'srd' && !srdCondition(key))) return 0;
  const rounds = input.rounds === null ? null : clampInt(input.rounds, LIMITS.rounds);
  const max = input.kind === 'srd' ? srdCondition(key)?.maxLevel : undefined;
  const level = max ? clampInt(input.level ?? 1, [1, max]) : undefined;
  let n = 0;
  for (const id of ids) {
    const c = d.list.find((x) => x.id === id);
    if (!c) continue;
    const same = c.conds.find((k) => k.kind === input.kind && k.key === key);
    if (same) {
      same.rounds = rounds;
      if (level !== undefined) same.level = level;
    } else {
      if (c.conds.length >= LIMITS.conds) continue;
      const k: CondInst = { id: newId('k'), kind: input.kind, key, rounds };
      if (level !== undefined) k.level = level;
      c.conds.push(k);
    }
    n += 1;
  }
  return n;
}

export function updateCondition(
  d: CombatData,
  id: string,
  condId: string,
  patch: { rounds?: number | null; level?: number },
): void {
  const k = d.list.find((x) => x.id === id)?.conds.find((x) => x.id === condId);
  if (!k) return;
  if (patch.rounds !== undefined)
    k.rounds = patch.rounds === null ? null : clampInt(patch.rounds, LIMITS.rounds);
  const max = k.kind === 'srd' ? srdCondition(k.key)?.maxLevel : undefined;
  if (patch.level !== undefined && max) k.level = clampInt(patch.level, [1, max]);
}

export function removeCondition(d: CombatData, id: string, condId: string): void {
  const c = d.list.find((x) => x.id === id);
  if (c) c.conds = c.conds.filter((k) => k.id !== condId);
}

/** 狀態的顯示名稱（SRD 的用繁中名稱；力竭加等級） */
export function condName(k: Pick<CondInst, 'kind' | 'key' | 'level'>): string {
  if (k.kind === 'custom') return k.key;
  const c = srdCondition(k.key);
  if (!c) return k.key;
  return c.maxLevel && k.level ? `${c.name} ${k.level}` : c.name;
}

/** 自訂狀態的候選：去掉空白、重複，最多 50 個、每個 20 字 */
export function cleanCustomConds(list: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const s = cut(v.trim(), LIMITS.customName);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= LIMITS.customConds) break;
  }
  return out;
}

/* ---------- 文字與玩家視圖 ---------- */

/** 複製的文字（Discord 的 Markdown；原作是「**Initiative**」＋「- 15: 名字」）：隱藏的參戰者不列 */
export function orderText(d: CombatData): string {
  const cur = currentId(d);
  const lines = d.list
    .filter((c) => !c.hidden)
    .map((c) => {
      const st = statusOf(c, d.settings);
      const tag = st === 'dead' ? '（死亡）' : st === 'ok' ? '' : '（倒下）';
      return `- ${c.init ?? '—'}：${c.name}${tag}${c.id === cur ? ' ◀' : ''}`;
    });
  return [`**先攻順序**（第 ${d.round} 輪）`, ...lines].join('\n');
}

export type RoughHp = 'full' | 'hurt' | 'bloodied' | 'down';

/** 概略的 HP：滿＝無傷、一半以上＝輕傷、一半以下＝重傷、0＝倒下 */
export function roughHp(hp: number, max: number): RoughHp {
  if (hp <= 0) return 'down';
  if (hp >= max) return 'full';
  return hp * 2 > max ? 'hurt' : 'bloodied';
}

export type PlayerHp =
  | { kind: 'exact'; hp: number; max: number; temp: number }
  | { kind: 'rough'; level: RoughHp };

export interface PlayerRow {
  id: string;
  name: string;
  side: Side;
  init: number | null;
  current: boolean;
  status: Status;
  hp: PlayerHp | null;
  conds: { label: string; rounds: number | null }[];
}

export interface PlayerSnapshot {
  v: 1;
  round: number;
  rows: PlayerRow[];
}

/** 給玩家視圖的內容：隱藏的參戰者不列；HP 依設定（數字／概略／不顯示）；GM 的備註、AC、先攻加值不送 */
export function playerSnapshot(d: CombatData): PlayerSnapshot {
  const cur = currentId(d);
  const s = d.settings;
  return {
    v: 1,
    round: d.round,
    rows: d.list
      .filter((c) => !c.hidden)
      .map((c) => {
        const show = c.side === 'enemy' ? s.playerHpEnemy : s.playerHpParty;
        let hp: PlayerHp | null = null;
        if (c.hp !== null && c.maxHp !== null) {
          if (show === 'exact') hp = { kind: 'exact', hp: c.hp, max: c.maxHp, temp: c.temp };
          else if (show === 'rough') hp = { kind: 'rough', level: roughHp(c.hp, c.maxHp) };
        }
        return {
          id: c.id,
          name: c.name,
          side: c.side,
          init: c.init,
          current: c.id === cur,
          status: statusOf(c, s),
          hp,
          conds: s.playerConds
            ? c.conds
                .filter((k) => k.kind === 'custom' || s.srdConds)
                .map((k) => ({ label: condName(k), rounds: k.rounds }))
            : [],
        };
      }),
  };
}

/* ---------- 讀檔與存檔 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const optNum = (v: unknown, range: readonly [number, number]): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? clampInt(v, range) : null;

function readCondition(v: unknown): CondInst | null {
  if (!isObj(v)) return null;
  const kind = v.kind === 'custom' ? 'custom' : v.kind === 'srd' ? 'srd' : null;
  if (!kind || typeof v.key !== 'string') return null;
  const key = kind === 'custom' ? cut(v.key.trim(), LIMITS.customName) : v.key;
  if (!key || (kind === 'srd' && !srdCondition(key))) return null;
  const k: CondInst = {
    id: typeof v.id === 'string' && v.id ? v.id : newId('k'),
    kind,
    key,
    rounds: optNum(v.rounds, LIMITS.rounds),
  };
  const max = kind === 'srd' ? srdCondition(key)?.maxLevel : undefined;
  if (max) k.level = optNum(v.level, [1, max]) ?? 1;
  return k;
}

function readCombatant(v: unknown, used: Set<string>): Combatant | null {
  if (!isObj(v) || typeof v.name !== 'string') return null;
  const name = cut(v.name.trim(), LIMITS.name);
  if (!name) return null;
  const c = blankCombatant(name, SIDES.includes(v.side as Side) ? (v.side as Side) : 'enemy');
  if (typeof v.id === 'string' && v.id && !used.has(v.id)) c.id = v.id;
  used.add(c.id);
  c.init = optNum(v.init, LIMITS.init);
  c.initMod = optNum(v.initMod, LIMITS.initMod);
  c.ac = optNum(v.ac, LIMITS.ac);
  c.maxHp = optNum(v.maxHp, LIMITS.hp);
  c.hp = c.maxHp === null ? null : Math.min(c.maxHp, optNum(v.hp, [0, LIMITS.hp[1]]) ?? c.maxHp);
  c.temp = optNum(v.temp, LIMITS.temp) ?? 0;
  if (Array.isArray(v.conds)) {
    for (const k of v.conds) {
      const r = readCondition(k);
      if (r && !c.conds.some((x) => x.kind === r.kind && x.key === r.key)) c.conds.push(r);
      if (c.conds.length >= LIMITS.conds) break;
    }
  }
  if (isObj(v.death)) {
    const ds = v.death;
    c.death = {
      ok: optNum(ds.ok, [0, 3]) ?? 0,
      ng: optNum(ds.ng, [0, 3]) ?? 0,
      stable: ds.stable === true,
      dead: ds.dead === true,
    };
  }
  c.hidden = v.hidden === true;
  c.note = typeof v.note === 'string' ? cut(v.note, LIMITS.note) : '';
  return c;
}

/** 整理存檔或專案檔的資料：看不懂的欄位用預設值、壞掉的參戰者與狀態丟掉；完全看不懂時 null */
export function sanitizeData(raw: unknown): CombatData | null {
  if (!isObj(raw) || !Array.isArray(raw.list)) return null;
  const d = initialData();
  const used = new Set<string>();
  for (const v of raw.list) {
    const c = readCombatant(v, used);
    if (c) d.list.push(c);
    if (d.list.length >= LIMITS.list) break;
  }
  d.turn = typeof raw.turn === 'string' && d.list.some((c) => c.id === raw.turn) ? raw.turn : null;
  d.round = optNum(raw.round, LIMITS.round) ?? 1;
  const s = isObj(raw.settings) ? raw.settings : {};
  const bool = (k: keyof Settings) =>
    typeof s[k] === 'boolean' ? (s[k] as boolean) : (DEFAULT_SETTINGS[k] as boolean);
  d.settings = {
    lockOrder: bool('lockOrder'),
    skipDown: bool('skipDown'),
    deathSaves: bool('deathSaves'),
    srdConds: bool('srdConds'),
    initDie: INIT_DICE.includes(s.initDie as InitDie)
      ? (s.initDie as InitDie)
      : DEFAULT_SETTINGS.initDie,
    groupRoll: bool('groupRoll'),
    playerHpEnemy: HP_SHOWS.includes(s.playerHpEnemy as HpShow)
      ? (s.playerHpEnemy as HpShow)
      : DEFAULT_SETTINGS.playerHpEnemy,
    playerHpParty: HP_SHOWS.includes(s.playerHpParty as HpShow)
      ? (s.playerHpParty as HpShow)
      : DEFAULT_SETTINGS.playerHpParty,
    playerConds: bool('playerConds'),
  };
  d.customConds = Array.isArray(raw.customConds)
    ? cleanCustomConds(raw.customConds)
    : [...DEFAULT_CUSTOM_CONDS];
  return d;
}

/* ---------- 原作（Lazy GM Tools 的 Combat Tracker）的 JSON ---------- */

export class OriginalJsonError extends Error {
  override name = 'OriginalJsonError';
}

/**
 * 讀原作匯出的 JSON（`{ combatants: [{ id, name, initiative, maxHp, currentHp, ac }], currentTurnIndex }`）：
 * 檢查照原作（要有 combatants 陣列，每一位都要有名字、數字的 initiative、id），不合時丟 OriginalJsonError。
 * 讀出來的當成敵方（原作沒有陣營）。
 */
export function parseOriginalJson(text: string): Combatant[] {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new OriginalJsonError('這不是 JSON 檔（格式錯誤）。');
  }
  if (!isObj(obj) || !Array.isArray(obj.combatants))
    throw new OriginalJsonError('這個 JSON 裡沒有參戰者的清單（combatants）。');
  const out: Combatant[] = [];
  for (const v of obj.combatants) {
    if (!isObj(v) || !v.name || typeof v.initiative !== 'number' || !v.id)
      throw new OriginalJsonError('這個 JSON 裡有看不懂的參戰者（要有 id、name、initiative）。');
    const name = cut(String(v.name).trim(), LIMITS.name);
    if (!name) throw new OriginalJsonError('這個 JSON 裡有沒有名字的參戰者。');
    const c = blankCombatant(name, 'enemy');
    c.init = clampInt(v.initiative, LIMITS.init);
    c.maxHp = optNum(v.maxHp, LIMITS.hp);
    c.hp =
      c.maxHp === null
        ? null
        : Math.min(c.maxHp, optNum(v.currentHp, [0, LIMITS.hp[1]]) ?? c.maxHp);
    c.ac = optNum(v.ac, LIMITS.ac);
    out.push(c);
  }
  return out;
}

/** 讀進來的加在現有清單的後面（原作的做法），沒有鎖定順序時依先攻排序；回傳加了幾位 */
export function appendCombatants(d: CombatData, list: readonly Combatant[]): number {
  const room = Math.max(0, LIMITS.list - d.list.length);
  const add = list.slice(0, room);
  d.list.push(...add);
  if (!d.settings.lockOrder) sortList(d);
  return add.length;
}

/** 匯出成原作的格式（原作的 Combat Tracker 讀得進去） */
export function originalJson(d: CombatData, now = new Date()): string {
  const cur = currentId(d);
  const base = now.getTime();
  return JSON.stringify(
    {
      combatants: d.list.map((c, i) => ({
        id: base + i,
        name: c.name,
        initiative: c.init ?? 0,
        maxHp: c.maxHp,
        currentHp: c.hp,
        ac: c.ac,
        originalMonsterName: baseName(c.name),
        monsterSource: null,
      })),
      currentTurnIndex: Math.max(
        0,
        d.list.findIndex((c) => c.id === cur),
      ),
      exportDate: now.toISOString(),
    },
    null,
    2,
  );
}

/** 原作的檔名：combat_2026-11-06T12-34-56.json（UTC，照原作） */
export const originalJsonName = (now = new Date()): string =>
  `combat_${now.toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
