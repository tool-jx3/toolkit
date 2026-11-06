/**
 * 把參戰者送到「先攻與戰鬥追蹤」（combat-tracker）：2026-11，5e 速查計算（5e-calc）的遭遇與快速怪物用。
 * 之後別的工具（例如 coc-npc）也可以照這個格式送。
 *
 * - 寄件：`sendToCombatTracker({ from, name, seeds })`，在點擊的當下呼叫（裡面先 `beginHandoff`、開新分頁，再寫資料；
 *   見 `@/core/handoff` 的「先開分頁、後送資料」）。新分頁被瀏覽器擋住時資料照樣存好（一天內打開戰鬥追蹤就會問要不要加入）。
 * - 收件：戰鬥追蹤讀交接資料（`@/core/handoff`，收件的鍵 `combat-tracker`），`parseCombatHandoff(text)` 讀出參戰者。
 * - 交接的檔案是 JSON：`{ "format": "trpg-toolkit:combatants", "version": 1, "seeds": [ … ] }`。
 */
import { beginHandoff, handoffHref, sendHandoff } from '@/core/handoff';
import { getTool, hrefToTool } from '@/registry';

export const COMBAT_TRACKER_ID = 'combat-tracker';
export const COMBAT_HANDOFF_FORMAT = 'trpg-toolkit:combatants';
export const COMBAT_SEED_MAX = 200;
export const COMBAT_SEED_COUNT_MAX = 20;

export type CombatSide = 'pc' | 'ally' | 'enemy';

/** 一筆要加進戰鬥追蹤的參戰者（count 隻同名的；名字加 A、B、C 的規則由戰鬥追蹤決定） */
export interface CombatSeed {
  name: string;
  /** 幾隻（1～20，預設 1） */
  count?: number;
  /** 陣營（預設敵方） */
  side?: CombatSide;
  /** 先攻值（給了就用這個） */
  init?: number | null;
  /** 先攻加值 */
  initMod?: number | null;
  /** 沒給先攻值時擲 1d20＋先攻加值（同一筆的幾隻共用一次；SRD 5.2.1 的 Initiative） */
  rollInit?: boolean;
  /** HP 上限（同時是目前的 HP） */
  hp?: number | null;
  ac?: number | null;
  /** 備註（例：CR 2、每輪傷害 17） */
  note?: string;
}

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;

/** 讀一筆（看不懂、沒有名字時 null）；數值夾在合理範圍 */
export function readCombatSeed(v: unknown): CombatSeed | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const name = typeof o.name === 'string' ? Array.from(o.name.trim()).slice(0, 60).join('') : '';
  if (!name) return null;
  const seed: CombatSeed = { name };
  const count = num(o.count, 1, COMBAT_SEED_COUNT_MAX);
  if (count !== null) seed.count = count;
  if (o.side === 'pc' || o.side === 'ally' || o.side === 'enemy') seed.side = o.side;
  const init = num(o.init, -99, 99);
  if (init !== null) seed.init = init;
  const initMod = num(o.initMod, -20, 20);
  if (initMod !== null) seed.initMod = initMod;
  if (o.rollInit === true) seed.rollInit = true;
  const hp = num(o.hp, 1, 99999);
  if (hp !== null) seed.hp = hp;
  const ac = num(o.ac, 0, 99);
  if (ac !== null) seed.ac = ac;
  if (typeof o.note === 'string' && o.note.trim())
    seed.note = Array.from(o.note.trim()).slice(0, 500).join('');
  return seed;
}

export function encodeCombatHandoff(seeds: readonly CombatSeed[]): string {
  return JSON.stringify({ format: COMBAT_HANDOFF_FORMAT, version: 1, seeds });
}

/** 讀交接的 JSON：格式不對時 null；看不懂的那一筆略過；最多 200 筆 */
export function parseCombatHandoff(text: string): CombatSeed[] | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  const o = obj as { format?: unknown; seeds?: unknown };
  if (!o || o.format !== COMBAT_HANDOFF_FORMAT || !Array.isArray(o.seeds)) return null;
  const out: CombatSeed[] = [];
  for (const s of o.seeds) {
    const seed = readCombatSeed(s);
    if (seed) out.push(seed);
    if (out.length >= COMBAT_SEED_MAX) break;
  }
  return out;
}

/** 這些參戰者一共幾隻 */
export const seedTotal = (seeds: readonly CombatSeed[]): number =>
  seeds.reduce((n, s) => n + (s.count ?? 1), 0);

export interface SendCombatResult {
  /** 新分頁打開了（false＝被瀏覽器擋住） */
  opened: boolean;
  /** 資料寫好了（false＝這個瀏覽器不能交接，例如沒有 IndexedDB） */
  sent: boolean;
  /** 戰鬥追蹤的網址（被擋住時給使用者點） */
  href: string;
}

/** 戰鬥追蹤的網址（從另一個工具頁連過去） */
export function combatTrackerHref(): string {
  return hrefToTool(getTool(COMBAT_TRACKER_ID) ?? { id: COMBAT_TRACKER_ID, status: 'next' });
}

/**
 * 送到戰鬥追蹤：**在點擊的當下呼叫**（第一個 await 之前開新分頁，瀏覽器才不會擋）。
 * 新分頁的網址帶交接編號，戰鬥追蹤打開後等資料寫好再加入。
 */
export async function sendToCombatTracker({
  from,
  name,
  seeds,
}: {
  from: string;
  name: string;
  seeds: readonly CombatSeed[];
}): Promise<SendCombatResult> {
  const href = combatTrackerHref();
  const id = beginHandoff(COMBAT_TRACKER_ID);
  let opened = false;
  try {
    opened = !!window.open(handoffHref(href, id), '_blank');
  } catch {
    opened = false;
  }
  const blob = new Blob([encodeCombatHandoff(seeds)], { type: 'application/json' });
  /* 寫不進去時 sendHandoff 會通知等著的分頁（失敗） */
  const sent = await sendHandoff({ to: COMBAT_TRACKER_ID, from, name, blob, id });
  return { opened, sent, href };
}
